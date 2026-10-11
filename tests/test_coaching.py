"""What the app tells the coach at the start of a session: due reviews, lines that keep slipping, unfinished problems,
an out-of-date next assessment; plus the Today data behind them and the release notes."""
import datetime as dt
import os
import subprocess
import sys
import unittest
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
from harness import App  # noqa: E402
import server  # noqa: E402


def day(n):
    return (dt.date.today() + dt.timedelta(days=n)).isoformat()


class ShapesTest(unittest.TestCase):
    def test_same_line_with_other_names(self):
        a = server.line_shape("counts.put(word, counts.getOrDefault(word, 0) + 1);")
        self.assertEqual(a, server.line_shape("map.put(w, map.getOrDefault(w,0)+1);"))
        self.assertNotEqual(a, server.line_shape("map.put(w, 1);"))
        self.assertEqual(server.line_shape("new ArrayList<>()"), "newArrayList<>()")


class AssessmentTest(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.d = tempfile.mkdtemp(prefix="cc-assess-")

    def course(self, line):
        server.write_text(os.path.join(self.d, "_course.md"), "# CS 124\n\n- **Language:** Java\n" + (line + "\n" if line else ""))
        return server.next_assessment(self.d)

    def test_parsing(self):
        self.assertTrue(self.course("- **Next assessment:** (update when known)")["stale"])
        self.assertTrue(self.course("- **Next assessment:** Quiz 5 RETAKE (weekly)")["stale"])          # no date
        self.assertTrue(self.course("- **Next assessment:** Quiz 4 on %s" % day(-3))["stale"])          # date passed
        r = self.course("- **Next assessment:** Quiz 6 on %s - objects" % day(4))
        self.assertEqual((r["stale"], r["date"]), (False, day(4)))
        soon = dt.date.today() + dt.timedelta(days=10)
        r = self.course("- **Next assessment:** Midterm %s %d" % (soon.strftime("%b"), soon.day))
        self.assertEqual(r["date"], soon.isoformat())
        self.assertTrue(self.course("")["stale"])

    def test_update_keeps_the_rest(self):
        self.course("- **Next assessment:** Quiz 5 RETAKE")
        r = server.set_next_assessment(self.d, "Quiz 6 on %s - constructors" % day(5))
        self.assertFalse(r["stale"])
        text = server.read_text(os.path.join(self.d, "_course.md"))
        self.assertIn("- **Language:** Java", text)
        self.assertEqual(text.count("Next assessment"), 1)
        self.course("")
        server.set_next_assessment(self.d, "Final on %s" % day(30))
        self.assertIn("- **Next assessment:** Final on", server.read_text(os.path.join(self.d, "_course.md")))


class StartOfSessionTest(unittest.TestCase):
    def test_prompt_and_today(self):
        with App() as app:
            f = app.make_course("python", "Python track")
            app.api("/api/note/tracker", {"folder": f, "topic": "Maps", "level": "R6", "mastered": "no", "next_review": "now"})
            drill = lambda ref, ok: {"kind": "drill", "prompt": "count it", "reference_answer": ref, "correct": ok}
            base = {"mode": "learn", "course": {"name": "Python track", "folder": f}, "messages": [], "usage": {"cost": 0, "tokens": 0}}
            app.api("/api/session/save", dict(base, id="s1", title="Monday", display=[drill("counts[w] = counts.get(w, 0) + 1", False)],
                    problems=[{"id": "p1", "name": "wordsByLength", "topic": "Maps", "rung": 6, "status": "open"}]))
            app.api("/api/session/save", dict(base, id="s2", title="Tuesday", display=[drill("freq[c] = freq.get(c, 0) + 1", False),
                    drill("freq[c] = freq.get(c, 0) + 1", True)], problems=[]))
            prompt = app.api("/api/system_prompt?mode=learn&folder=" + urllib.parse.quote(f, safe=""))["prompt"]
            block = prompt[prompt.index("## START OF SESSION"):]
            self.assertIn("Tracker topics due for review", block)
            self.assertIn("Maps", block)
            self.assertIn("LINES THAT KEEP SLIPPING", block)
            self.assertIn("missed 2 of 3", block)
            self.assertIn("wordsByLength", block)
            self.assertIn("Next assessment looks out of date", block)
            exam = app.api("/api/system_prompt?mode=exam&folder=" + urllib.parse.quote(f, safe=""))["prompt"]
            self.assertNotIn("## START OF SESSION", exam)
            d = app.api("/api/dashboard?folder=" + urllib.parse.quote(f, safe=""))
            self.assertEqual([(p["name"], p["session"]) for p in d["open_problems"]], [("wordsByLength", "s1")])
            self.assertTrue(d["assessment"]["stale"])
            r = app.api("/api/course/assessment", {"folder": f, "text": "Quiz 6 on %s" % day(3)})
            self.assertFalse(r["stale"])
            self.assertFalse(app.api("/api/dashboard?folder=" + urllib.parse.quote(f, safe=""))["assessment"]["stale"])


class ReleaseNotesTest(unittest.TestCase):
    def test_notes_for_this_version(self):
        out = subprocess.check_output([sys.executable, os.path.join(os.path.dirname(HERE), "packaging", "release_notes.py"), "v" + server.VERSION]).decode()
        self.assertTrue(out.startswith("## What's new"))
        self.assertNotIn("Fixes and improvements.", out)                  # the changelog has a section for this version
        self.assertIn("## Download for your computer", out)


if __name__ == "__main__":
    unittest.main()

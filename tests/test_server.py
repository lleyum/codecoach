"""The real server, started against a throwaway Library and the mock AI. No network, no API key.
Run:  python3 -m unittest discover -s tests -v"""
import io
import json
import os
import sys
import unittest
import urllib.error
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import FAKE_KEY, App  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

TOOLS = [{"type": "function", "function": {"name": "give_problem", "parameters": {"type": "object", "properties": {}}}}]


def sse_events(raw):
    out = []
    for line in raw.decode().splitlines():
        if line.startswith("data:") and line[5:].strip() != "[DONE]":
            out.append(json.loads(line[5:]))
    return out


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = App().__enter__()
        cls.folder = cls.app.make_course()

    @classmethod
    def tearDownClass(cls):
        cls.app.__exit__()

    def test_token_required(self):
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.app.opener.open(self.app.base + "/api/state", timeout=5)
        self.assertEqual(e.exception.code, 403)

    def test_state(self):
        st = self.app.api("/api/state")
        self.assertEqual(st["version"], server.VERSION)
        self.assertFalse(st["first_run"])
        self.assertEqual((st["ai"]["id"], st["ai"]["model"], st["ai"]["local"]), ("custom", "mock-model", True))
        self.assertTrue(st["has_key"])
        self.assertNotIn("keys", st["config"])                       # keys never go to the page
        self.assertNotIn(FAKE_KEY, json.dumps(st))
        self.assertIn("Python track", [c["name"] for c in st["courses"]])

    def test_course_files(self):
        c = self.app.api("/api/course?folder=" + urllib_quote(self.folder))
        for k in ("tracker", "toolkit", "mistakes", "patterns", "roadmap"):
            self.assertIn(k, c["files"], k)
        self.assertTrue(os.path.exists(os.path.join(self.folder, "_course.md")))
        with self.assertRaises(urllib.error.HTTPError):               # a second course in the same folder is refused
            self.app.api("/api/course/create", {"language": "python", "type": "general", "name": "Python track"})

    def test_system_prompt_and_stats(self):
        r = self.app.api("/api/system_prompt?mode=learn&topic=" + urllib_quote("HashMaps review") + "&folder=" + urllib_quote(self.folder))
        self.assertGreater(len(r["prompt"]), 2000)
        self.assertIn("Mastery Tracker", r["prompt"])
        self.assertEqual(r["stats"]["total"], len(r["prompt"]))
        self.assertIn("map", r["stats"]["topic_terms"])

    def test_note_tools(self):
        r = self.app.api("/api/note/tracker", {"folder": self.folder, "topic": "Loops", "level": "R3", "mastered": "no", "review_outcome": "pass"})
        self.assertEqual(r["result"], "added")
        self.assertRegex(r["next_review"], r"^\d{4}-\d{2}-\d{2}$")
        text = self.app.api("/api/note/read", {"folder": self.folder, "note": "tracker"})["text"]
        self.assertIn("| Loops |", text)

    def test_python_tests_and_snippets(self):
        ok = self.app.api("/api/run_tests", {"language": "python", "code": "def add(a, b):\n    return a + b\n",
                                              "tests": 't("add(1, 2)", 3, lambda: add(1, 2))\nt("add(2, 2)", 4, lambda: add(2, 2))'})
        self.assertTrue(ok["ok"], ok)
        self.assertEqual((ok["passed"], ok["total"]), (2, 2))
        bad = self.app.api("/api/run_tests", {"language": "python", "code": "def add(a, b):\n    return a - b\n",
                                               "tests": 't("add(1, 2)", 3, lambda: add(1, 2))'})
        self.assertFalse(bad["ok"])
        self.assertEqual(bad["passed"], 0)
        r = self.app.api("/api/run_snippet", {"language": "python", "code": "print(input()[::-1])", "stdin": "olleh"})
        self.assertEqual(r["stdout"].strip(), "hello")

    def test_run_limits(self):
        r = self.app.api("/api/run_snippet", {"language": "python", "code": "while True:\n    pass"}, timeout=120)
        self.assertTrue(r["timed_out"])
        r = self.app.api("/api/run_snippet", {"language": "python", "code": "import sys\nsys.stdout.write('x' * 3000000)"}, timeout=120)
        self.assertLess(len(r["stdout"]), 1100000)
        self.assertIn("output cut off", r["stdout"])

    def test_stream_through_mock(self):
        self.app.llm.reply("Hello from the mock coach.", tools=[("give_problem", {"name": "addOne"})])
        _, raw = self.app.raw("/api/llm_stream", {"messages": [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}], "tools": TOOLS})
        ev = sse_events(raw)
        text = "".join(c["delta"].get("content") or "" for e in ev for c in e.get("choices", []))
        self.assertEqual(text, "Hello from the mock coach.")
        args = "".join(tc["function"].get("arguments", "") for e in ev for c in e.get("choices", []) for tc in c["delta"].get("tool_calls", []))
        self.assertEqual(json.loads(args), {"name": "addOne"})
        sent = self.app.llm.requests[-1]
        self.assertEqual(sent["model"], "mock-model")
        self.assertTrue(sent["stream"])
        self.assertEqual(sent["stream_options"], {"include_usage": True})
        self.assertEqual(sent["messages"][0]["content"], "sys")              # no cache marks for this provider
        usage = server.read_state(os.path.join(self.app.library, "CodeCoach", "usage.md"))
        day = usage["days"][server.today()]
        self.assertGreaterEqual(day["cached"], 1000)

    def test_plain_call(self):
        self.app.llm.reply("short answer")
        r = self.app.api("/api/llm", {"messages": [{"role": "user", "content": "explain"}]})
        self.assertEqual(r["message"]["content"], "short answer")

    def test_claude_on_openrouter_gets_cache_marks(self):
        cfg = self.app.config()
        try:
            self.app.write_config(dict(cfg, ai="openrouter:anthropic/claude-sonnet-5.5", keys={"openrouter": "sk-or-test"},
                                       providers={"openrouter": {"url": self.app.llm.url}}))
            self.app.llm.reply("cached")
            self.app.raw("/api/llm_stream", {"messages": [{"role": "system", "content": "long system prompt"}, {"role": "user", "content": "hi"}]})
            sent = self.app.llm.requests[-1]
            self.assertEqual(sent["model"], "anthropic/claude-sonnet-5.5")
            self.assertEqual(sent["usage"], {"include": True})
            self.assertEqual(sent["messages"][0]["content"][0]["cache_control"], {"type": "ephemeral"})
            self.assertEqual(sent["messages"][1]["content"][0]["cache_control"], {"type": "ephemeral"})
        finally:
            self.app.write_config(cfg)

    def test_estimated_cost_for_direct_provider(self):
        cfg = self.app.config()
        prices = os.path.join(self.app.local, "prices.json")
        try:
            with open(prices, "w") as f:
                json.dump({"fetched_at": 9e12, "updated": "2026-10-08", "models": {
                    "openai/gpt-test": {"p": 1e-6, "c": 4e-6, "cr": 1e-7, "name": "GPT Test", "created": 1, "tools": True}}}, f)
            self.app.write_config(dict(cfg, ai="openai:gpt-test", providers={"openai": {"url": self.app.llm.url, "local": False}}))
            self.app.llm.reply("priced", usage={"prompt_tokens": 1000, "completion_tokens": 100, "prompt_tokens_details": {"cached_tokens": 800}})
            _, raw = self.app.raw("/api/llm_stream", {"messages": [{"role": "user", "content": "hi"}]})
            usage = [e["usage"] for e in sse_events(raw) if e.get("usage")][0]
            self.assertTrue(usage["cost_estimated"])
            self.assertAlmostEqual(usage["cost"], 200 * 1e-6 + 800 * 1e-7 + 100 * 4e-6)
            d = self.app.api("/api/dashboard?folder=" + urllib_quote(self.folder))
            self.assertTrue(d["estimated"])
            self.assertGreater(d["today_cost"], 0)
        finally:
            os.remove(prices)
            self.app.write_config(cfg)

    def test_sessions_roundtrip(self):
        s = {"id": "t1", "title": "Test session", "mode": "learn", "course": {"name": "Python track", "folder": self.folder},
             "messages": [{"role": "user", "content": "hi"}], "display": [], "problems": [], "usage": {"cost": 0, "tokens": 0}}
        self.assertTrue(self.app.api("/api/session/save", s)["ok"])
        got = self.app.api("/api/session?id=t1")
        self.assertEqual(got["title"], "Test session")
        self.assertEqual(got["course"]["folder"], self.folder)
        self.assertIn("t1", [x["id"] for x in self.app.api("/api/sessions")["sessions"]])
        self.app.api("/api/session/delete", {"id": "t1"})
        self.assertNotIn("t1", [x["id"] for x in self.app.api("/api/sessions")["sessions"]])

    def test_outcomes_and_exam_report(self):
        self.app.api("/api/note/tracker", {"folder": self.folder, "topic": "Recursion", "level": "R6", "mastered": "yes"})
        self.app.api("/api/outcome/log", {"folder": self.folder, "event": {"type": "problem", "purpose": "pre", "topic": "Recursion", "passed": 1, "total": 4, "solved": False}})
        self.app.api("/api/outcome/log", {"folder": self.folder, "event": {"type": "problem", "purpose": "post", "topic": "Recursion", "passed": 4, "total": 4, "solved": True, "hints": 0}})
        with self.assertRaises(urllib.error.HTTPError):
            self.app.api("/api/outcome/log", {"folder": self.folder, "event": {"type": "something"}})
        o = self.app.api("/api/outcomes", {"folder": self.folder})
        self.assertEqual(o["avg_gain"], 1.0)
        self.assertGreaterEqual(o["events"], 3)                        # mastered + two problems
        _, data = self.app.raw("/api/outcomes/csv", {"folder": self.folder})
        self.assertIn(b"date,type,purpose,topic", data)
        self.assertIn("Learning gain", server.read_text(o["file"]))
        # a mastered topic 30+ days ago shows up in the coach's instructions as a retention check
        path = os.path.join(self.folder, "Outcomes.md")
        ev = server.outcome_events(self.folder)
        for e in ev:
            if e.get("type") == "mastered":
                e["date"] = "2000-01-01"
        server.write_text(path, server.outcomes_markdown("x", ev))
        r = self.app.api("/api/system_prompt?mode=review&folder=" + urllib_quote(self.folder))
        self.assertIn("RETENTION CHECKS DUE", r["prompt"])
        self.assertIn("Recursion: 30 days", r["prompt"])
        r = self.app.api("/api/exam/save", {"folder": self.folder, "title": "Week 6: Lists?", "markdown": "# Exam"})
        self.assertTrue(r["rel"].endswith("exams/" + server.today() + " Week 6- Lists.md"), r["rel"])
        self.assertEqual(self.app.api("/api/exam/save", {"folder": self.folder, "title": "Week 6: Lists?", "markdown": "# Exam"})["rel"][-6:], "(2).md")

    def test_quick_review_sheet(self):
        f = self.folder
        self.app.api("/api/note/tracker", {"folder": f, "topic": "HashMaps", "level": "R4", "mastered": "no"})
        self.app.api("/api/note/review", {"folder": f, "topic": "HashMaps", "markdown": "- keys are unique\n\n```python\nd[k] = d.get(k, 0) + 1\n```"})
        self.app.api("/api/note/review", {"folder": f, "topic": "HashMaps", "markdown": "- keys are unique\n- get(k, 0) avoids KeyError"})   # replaces
        self.app.api("/api/note/review", {"folder": f, "topic": "Recursion", "markdown": "- base case first"})
        self.app.api("/api/note/toolkit", {"folder": f, "task": "Count with a map", "code": "`d.get(k, 0) + 1`", "status": "shaky"})
        self.app.api("/api/note/mistake", {"folder": f, "mistake": "Forgot the map default", "example": "d[k] += 1 on a new key", "fix": "use d.get(k, 0)"})
        self.app.api("/api/note/save_practice", {"folder": f, "topic": "HashMaps", "name": "wordCount", "language": "python",
                                                 "statement": "Count each word.", "code": "def word_count(ws):\n    return {}", "result": "solved in 3m, 1 runs, 0 hints"})
        d = self.app.api("/api/review", {"folder": f, "topic": "HashMaps"})
        self.assertEqual(d["tracker"]["level"], "R4")
        self.assertEqual(len(d["ideas"]), 1)
        self.assertIn("avoids KeyError", d["ideas"][0]["markdown"])
        self.assertNotIn("d[k] = d.get", d["ideas"][0]["markdown"])
        self.assertEqual([r["task"] for r in d["toolkit"]], ["Count with a map"])
        self.assertEqual(len(d["mistakes"]), 1)
        sol = d["solutions"][0]
        self.assertEqual((sol["name"], sol["lang"], sol["statement"]), ("wordCount", "python", "Count each word."))
        self.assertTrue(sol["code"].startswith("def word_count"))
        self.assertIn("solved in 3m", sol["result"])
        topics = [t["topic"] for t in self.app.api("/api/review/topics", {"folder": f})["topics"]]
        self.assertIn("HashMaps", topics)
        self.assertIn("Recursion", topics)                     # in Review Notes, not yet in the tracker
        self.assertIn("review", self.app.api("/api/course?folder=" + urllib_quote(f))["files"])
        empty = self.app.api("/api/review", {"folder": f, "topic": "Graphs"})
        self.assertEqual((empty["tracker"], empty["ideas"], empty["solutions"]), (None, [], []))

    def sess(self, sid, **kw):
        return dict({"id": sid, "title": "S " + sid, "mode": "learn", "course": {"name": "Python track", "folder": self.folder},
                     "messages": [], "display": [], "problems": [], "usage": {"cost": 0, "tokens": 0}}, **kw)

    def test_save_refuses_to_overwrite_another_computers_newer_save(self):
        sdir = os.path.join(self.app.library, "CodeCoach", "sessions")
        r = self.app.api("/api/session/save", self.sess("sync1"))
        self.assertEqual(r["rev"], 1)
        self.assertEqual(self.app.api("/api/session/save", self.sess("sync1", rev=1))["rev"], 2)
        # the Library syncs in a newer save from the laptop
        server.write_state(os.path.join(sdir, "sync1.md"), self.sess("sync1", rev=5, device="laptop1", device_name="Laptop", updated="2026-10-08T10:00:00"))
        with self.assertRaises(urllib.error.HTTPError) as e:
            self.app.api("/api/session/save", self.sess("sync1", rev=2))
        self.assertEqual(e.exception.code, 409)
        clash = json.loads(e.exception.read())["conflict"]
        self.assertEqual((clash["device_name"], clash["rev"]), ("Laptop", 5))
        self.assertEqual(self.app.api("/api/session/rev?id=sync1")["device"], "laptop1")
        self.assertEqual(self.app.api("/api/session/save", self.sess("sync1", rev=5))["rev"], 6)     # after loading theirs
        self.assertEqual(self.app.api("/api/session/patch", {"id": "sync1", "rev": 6, "problems": []})["ok"], True)
        server.write_state(os.path.join(sdir, "sync1.md"), self.sess("sync1", rev=9, device="laptop1"))
        with self.assertRaises(urllib.error.HTTPError):             # the closing-window save can't overwrite it either
            self.app.api("/api/session/patch", {"id": "sync1", "rev": 7, "problems": []})

    def test_sync_conflict_copies(self):
        sdir = os.path.join(self.app.library, "CodeCoach", "sessions")
        server.write_state(os.path.join(sdir, "c1.md"), self.sess("c1", updated="2026-10-08T09:00:00"))
        server.write_state(os.path.join(sdir, "c1 (Liam's conflicted copy 2026-10-08).md"), self.sess("c1", updated="2026-10-08T11:00:00", device_name="Laptop"))
        server.write_state(os.path.join(sdir, "c1.sync-conflict-20261008-111111-ABC.md"), self.sess("c1", updated="2026-10-08T08:00:00"))
        server.write_state(os.path.join(sdir, "c2 2.md"), self.sess("c2"))         # iCloud copy whose original is gone
        ids = [x["id"] for x in self.app.api("/api/sessions")["sessions"]]
        self.assertEqual(ids.count("c1"), 1)
        self.assertEqual([x["versions"] for x in self.app.api("/api/sessions")["sessions"] if x["id"] == "c1"], [2])
        self.assertIn("c2", ids)
        self.assertTrue(os.path.exists(os.path.join(sdir, "c2.md")))
        vs = self.app.api("/api/session?id=c1")["versions"]
        self.assertEqual(len(vs), 2)
        newest = max(vs, key=lambda v: v["updated"])
        self.assertEqual(newest["device_name"], "Laptop")
        other = [v for v in vs if v is not newest][0]
        self.app.api("/api/session/resolve", {"id": "c1", "file": other["file"], "action": "keep_both"})
        self.app.api("/api/session/resolve", {"id": "c1", "file": newest["file"], "action": "use"})
        got = self.app.api("/api/session?id=c1")
        self.assertEqual((got["updated"], got["versions"]), ("2026-10-08T11:00:00", []))
        sessions = self.app.api("/api/sessions")["sessions"]
        self.assertEqual(len([x for x in sessions if x["id"].startswith("c1")]), 2)
        self.assertTrue(any(n.startswith("c1 (replaced") for n in os.listdir(os.path.join(self.app.library, "CodeCoach", "trash"))))
        with self.assertRaises(urllib.error.HTTPError):
            self.app.api("/api/session/resolve", {"id": "c1", "file": newest["file"], "action": "use"})

    def test_export_has_everything_but_keys(self):
        headers, data = self.app.raw("/api/export", {})
        self.assertEqual(headers["Content-Type"], "application/zip")
        z = zipfile.ZipFile(io.BytesIO(data))
        names = z.namelist()
        self.assertTrue(any(n.endswith("Courses/python-track/_course.md") for n in names), names)
        self.assertIn("settings (no API keys).json", names)
        for n in names:
            self.assertNotIn(FAKE_KEY.encode(), z.read(n), n)

    def test_update_check_offline(self):
        r = self.app.api("/api/update?force=1")
        self.assertEqual(r["current"], server.VERSION)
        self.assertFalse(r["available"])

    def test_models_list(self):
        r = self.app.api("/api/models?ai=" + urllib_quote(self.app.llm.ai_line()))
        self.assertIn("mock-model", json.dumps(r))


def urllib_quote(s):
    from urllib.parse import quote
    return quote(s, safe="")


if __name__ == "__main__":
    unittest.main()

"""Browser test of a whole study session with the mock AI (needs Playwright: pip install playwright && playwright install chromium).
Run:  python3 -m unittest discover -s tests/e2e -v

The coach gives a Python problem, the student solves it and submits, and the result goes back to the coach."""
import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from harness import App  # noqa: E402

try:
    from playwright.sync_api import sync_playwright
except ImportError:                       # not installed: skip instead of failing (CI installs it)
    sync_playwright = None

PROBLEM = {
    "name": "countPositive", "topic": "Lists", "rung": 5,
    "statement": "Return how many numbers in `nums` are greater than 0.",
    "starter_code": "def count_positive(nums):\n    return 0\n",
    "reference_solution": "def count_positive(nums):\n    return sum(1 for n in nums if n > 0)\n",
    "test_code": 't("[1, -2, 3]", 2, lambda: count_positive([1, -2, 3]))\nt("[]", 0, lambda: count_positive([]))\nt("[5, 5]", 2, lambda: count_positive([5, 5]))',
}
def server_read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


SOLUTION = "def count_positive(nums):\n    c = 0\n    for n in nums:\n        if n > 0:\n            c += 1\n    return c\n"


@unittest.skipIf(sync_playwright is None, "Playwright isn't installed")
class SessionTest(unittest.TestCase):
    def test_problem_submit_reaches_coach(self):
        with App() as app, sync_playwright() as p:
            app.make_course("python", "Python track")
            app.llm.reply("Here is your first problem.", tools=[("give_problem", PROBLEM)])
            app.llm.reply("Nice work, first try!", when="[PROBLEM RESULT]")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .stats", timeout=15000)
                page.click("#nav button[data-view=study]")
                page.wait_for_selector("#view-study >> text=Start session", timeout=10000)
                t0 = time.time()
                page.click("#view-study >> text=Start session")
                page.wait_for_selector("#pStatement >> text=greater than 0", timeout=15000)
                self.assertLess(time.time() - t0, 10, "the problem took too long to appear")
                page.evaluate("(c) => document.querySelector('#pEditor .CodeMirror').CodeMirror.setValue(c)", SOLUTION)
                page.click("#submitBtn")
                page.wait_for_selector("#chat >> text=first try", timeout=30000)
                sent = [m for r in app.llm.requests for m in r["messages"] if m.get("role") == "user"]
                result = [m for m in sent if "[PROBLEM RESULT]" in json.dumps(m)]
                self.assertTrue(result, "the coach never got the result")
                self.assertIn("all 3 tests passed", json.dumps(result[-1]))
                self.assertTrue(os.path.exists(os.path.join(app.library, "Courses", "python-track", "practice", "Lists", "countPositive.py")))
                page.wait_for_timeout(500)
                self.assertIn('"name": "countPositive"', server_read(os.path.join(app.library, "Courses", "python-track", "Outcomes.md")))
                page.click("#nav button[data-view=progress]")
                page.wait_for_selector(".outcomes .o-tile >> text=problems", timeout=10000)
                self.assertEqual(errors, [])
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()

    def test_change_on_another_computer(self):
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        import server
        with App() as app, sync_playwright() as p:
            app.make_course("python", "Python track")
            app.llm.reply("Hi! Ready when you are.")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .stats", timeout=15000)
                page.click("#nav button[data-view=study]")
                page.click("#view-study >> text=Start session")
                page.wait_for_selector("#chat >> text=Ready when you are", timeout=15000)
                page.wait_for_function("CC.S.session && CC.S.session.rev >= 1", timeout=10000)
                sid = page.evaluate("CC.S.session.id")
                path = os.path.join(app.library, "CodeCoach", "sessions", sid + ".md")
                theirs = server.read_state(path)
                theirs.update(rev=theirs["rev"] + 3, device="laptop1", device_name="Laptop",
                              messages=theirs["messages"] + [{"role": "user", "content": "typed on the laptop"}])
                server.write_state(path, theirs)
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                page.wait_for_selector("#syncBanner >> text=changed on another computer (Laptop", timeout=5000)
                page.click("#syncBanner >> text=Load that version")
                page.wait_for_function("CC.S.session && CC.S.session.messages.some(m => m.content === 'typed on the laptop')", timeout=10000)
                self.assertTrue(page.is_hidden("#syncBanner"))
                # a sync service left a conflict copy: offered when the session opens
                copy = dict(server.read_state(path), updated="2099-01-01T00:00:00", device_name="Laptop")
                server.write_state(os.path.join(os.path.dirname(path), sid + " (conflicted copy).md"), copy)
                page.click("#view-study >> text=Close")
                page.wait_for_selector("#view-study >> text=2 versions", timeout=10000)
                page.click("#view-study .sess-row >> nth=0")
                page.wait_for_selector("#syncBanner >> text=kept another version", timeout=10000)
                page.click("#syncBanner >> text=Use newest")
                page.wait_for_function("CC.S.session && CC.S.session.updated === '2099-01-01T00:00:00' && !(CC.S.session.versions || []).length", timeout=10000)
                self.assertEqual(errors, [])
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()

    def test_practice_exam(self):
        exam = {"title": "Lists quiz", "questions": [
            {"topic": "Lists", "prompt": "What does `len([1, 2, 3])` return?", "options": ["2", "3", "4"], "correct_index": 1, "explanation": "Three items."},
            {"topic": "Loops", "prompt": "How many times does `for i in range(4)` run?", "options": ["3", "4", "5"], "correct_index": 1, "explanation": "0 to 3."}],
            "problems": [dict(PROBLEM, points=4), {"name": "broken", "topic": "Lists", "statement": "x", "starter_code": "def f():\n    return 0\n",
                                                   "reference_solution": "def f():\n    return 0\n", "test_code": 't("f()", 0, lambda: f())'}]}
        with App() as app, sync_playwright() as p:
            app.make_course("python", "Python track")
            for _ in range(3):                    # first try + two fix-up rounds (the "broken" problem never gets fixed)
                app.llm.reply("", tools=[("build_exam", exam)])
            app.llm.reply("Let's go through Q2 first.", when="[EXAM RESULT]")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .stats", timeout=15000)
                page.click("#view-today >> text=Practice exam")
                page.wait_for_selector(".exam-setup:not(.hidden)", timeout=10000)
                page.fill("#view-study input[list=topicSuggest]", "Lists and loops")
                page.click("#view-study >> text=Start session")
                # the starter of "broken" passes its tests: the checker drops it, the AI is asked to fix it, then lenient on attempt 3
                page.wait_for_selector("text=Start exam", timeout=30000)
                self.assertEqual(len([r for r in app.llm.requests if "[BUILD EXAM]" in json.dumps(r["messages"])]), 3)
                page.click("text=Start exam")
                page.wait_for_selector(".exam-body")
                self.assertTrue(page.evaluate("document.body.classList.contains('exam-lock')"))
                page.click(".exam-main .options button >> nth=1")            # Q1 correct
                page.click(".exam-main >> text=Next")
                page.click(".exam-main .options button >> nth=0")            # Q2 wrong
                page.click(".exam-main >> text=Next")
                page.wait_for_selector("#examEditor .CodeMirror")
                page.evaluate("(c) => document.querySelector('#examEditor .CodeMirror').CodeMirror.setValue(c)", SOLUTION)
                page.click(".exam-main >> text=Run tests")
                page.wait_for_selector("#examOut >> text=3 / 3 tests pass", timeout=20000)
                self.assertEqual(page.locator("#examOut .tline").count(), 0)       # counts only
                # a reload mid-exam comes back to a Continue screen, clock still running
                page.wait_for_timeout(500)
                page.reload()
                page.wait_for_selector("text=Continue exam", timeout=15000)
                page.click("text=Continue exam")
                page.click("text=Submit exam")
                page.click("#modal .modal-foot >> text=Submit")
                page.wait_for_selector(".exam-report", timeout=30000)
                self.assertIn("5 / 6", page.inner_text(".exam-report"))
                page.wait_for_selector("#chat >> text=go through Q2", timeout=15000)
                self.assertFalse(page.evaluate("document.body.classList.contains('exam-lock')"))
                sent = json.dumps([r["messages"] for r in app.llm.requests if "[EXAM RESULT]" in json.dumps(r["messages"])][-1])
                self.assertIn("Score 5/6", sent)
                exams = os.path.join(app.library, "Courses", "python-track", "exams")
                report = server_read(os.path.join(exams, os.listdir(exams)[0]))
                self.assertIn("**Score: 5 / 6 (83%)**", report)
                self.assertIn("| Q2 | Loops | wrong |", report)
                self.assertEqual(errors, [])
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()

    def test_exam_time_runs_out_while_closed(self):
        with App() as app, sync_playwright() as p:
            app.make_course("python", "Python track")
            app.llm.reply("Debrief.", when="[EXAM RESULT]")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .stats", timeout=15000)
                folder = page.evaluate("CC.S.course.folder")
                now = int(time.time() * 1000)
                sess = {"id": "ex1", "title": "Old exam", "mode": "exam", "course": {"name": "Python track", "folder": folder, "language": "python", "type": "general"},
                        "messages": [], "display": [], "problems": [], "usage": {"cost": 0, "tokens": 0},
                        "exam": {"phase": "running", "spec": {"minutes": 10, "mc": 1, "coding": 0, "lockdown": True}, "title": "Old exam",
                                 "questions": [{"id": "q1", "topic": "Lists", "prompt": "?", "code": "", "options": ["a", "b"], "correct": 0, "explanation": "", "points": 1}],
                                 "problems": [], "answers": {"q1": 0}, "codes": {}, "runs": {}, "timeOn": {}, "away": [], "fsExits": 0,
                                 "startedAt": now - 3600000, "endsAt": now - 3000000, "current": "q1"}}
                app.api("/api/session/save", sess)
                page.click("#nav button[data-view=progress]")              # resumed from another page
                page.evaluate("CC.resumeSession('ex1')")
                page.wait_for_selector(".exam-report >> text=time ran out", timeout=20000)
                self.assertIn("1 / 1", page.inner_text(".exam-report"))
                report = server_read(os.path.join(os.path.dirname(folder), "python-track", "exams", os.listdir(os.path.join(folder, "exams"))[0]))
                self.assertIn("time ran out while CodeCoach was closed", report)
                self.assertIn("Left the exam window: never", report)
                self.assertIn("Left full screen: never", report)
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()


if __name__ == "__main__":
    unittest.main()

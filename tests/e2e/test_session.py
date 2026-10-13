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
    "wrong_solutions": [{"code": "def count_positive(nums):\n    return len(nums)\n", "why": "counts every number"}],
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

    def test_one_clock_pauses_when_away(self):
        with App() as app, sync_playwright() as p:
            app.make_course("python", "Python track")
            app.llm.reply("Timed one.", tools=[("give_problem", PROBLEM), ("start_timer", {"minutes": 10, "label": "countPositive"})])
            app.llm.reply("Done.", when="[PROBLEM RESULT]")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .stats", timeout=15000)
                page.click("#nav button[data-view=study]")
                page.click("#view-study >> text=Start session")
                page.wait_for_selector("#pStatement >> text=greater than 0", timeout=15000)
                page.wait_for_selector("#chat >> text=Time limit for countPositive")
                self.assertEqual(page.locator("#pClock").count(), 0)                       # no second clock
                page.wait_for_function("/left$/.test(document.querySelector('#timerBadge').textContent)", timeout=5000)
                self.assertIsNone(page.evaluate("CC.S.session.timer || null"))           # the start_timer became the problem's limit
                # switching away pauses, coming back resumes
                page.evaluate("window.dispatchEvent(new Event('blur'))")
                self.assertTrue(page.evaluate("CC.S.session.paused"))
                self.assertIn("isn't the window in front", page.inner_text("#pauseBanner"))
                frozen = page.evaluate("CC.S.session.problems[0].activeMs")
                page.wait_for_timeout(1500)
                self.assertEqual(page.evaluate("CC.S.session.problems[0].activeMs"), frozen)
                page.evaluate("window.dispatchEvent(new Event('focus'))")
                self.assertFalse(page.evaluate("CC.S.session.paused"))
                # a manual pause stays paused when the window comes back
                page.click("#pauseBtn")
                page.evaluate("window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus'))")
                self.assertTrue(page.evaluate("CC.S.session.paused"))
                page.click("#pauseBanner >> text=Resume")
                page.evaluate("(c) => document.querySelector('#pEditor .CodeMirror').CodeMirror.setValue(c)", SOLUTION)
                page.click("#submitBtn")
                page.wait_for_selector("#chat >> text=Done.", timeout=20000)
                result = [m for r in app.llm.requests for m in r["messages"] if "[PROBLEM RESULT]" in json.dumps(m)][-1]
                self.assertIn("limit 10", json.dumps(result))
                self.assertIn("within the limit", json.dumps(result))
                self.assertTrue(page.inner_text("#timerBadge").startswith("✓"))
                self.assertEqual(errors, [])
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()

    def test_today_assessment_unfinished_and_whats_new(self):
        with App() as app, sync_playwright() as p:
            f = app.make_course("python", "Python track")
            app.api("/api/session/save", {"id": "old1", "title": "Monday", "mode": "learn", "course": {"name": "Python track", "folder": f},
                                          "messages": [], "display": [], "usage": {"cost": 0, "tokens": 0},
                                          "problems": [dict(PROBLEM, id="p1", status="open", code=PROBLEM["starter_code"], starter=PROBLEM["starter_code"],
                                                            tests=PROBLEM["test_code"], activeMs=0, runs=0, hints=0)]})
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.evaluate("localStorage.setItem('cc_seenVersion', JSON.stringify('3.4.1'))")
                page.reload()
                page.wait_for_selector("#modal >> text=What's new in CodeCoach", timeout=10000)
                self.assertIn("Warm-ups that clear your reviews", page.inner_text("#modal"))
                page.click("#modal >> text=Got it")
                page.reload()
                page.wait_for_selector("#view-today .stats", timeout=15000)
                page.wait_for_timeout(1200)
                self.assertFalse(page.is_visible("#modal >> text=What's new"))         # only once
                # next assessment
                page.click("#view-today .banner.assess >> text=Update")
                page.fill("#modal input[placeholder='e.g. Quiz 6']", "Quiz 6")
                page.fill("#modal input[type=date]", (__import__("datetime").date.today() + __import__("datetime").timedelta(days=5)).isoformat())
                page.click("#modal .modal-foot >> text=Save")
                page.wait_for_timeout(800)
                self.assertEqual(page.locator("#view-today .banner.assess").count(), 0)
                self.assertIn("Quiz 6 on", server_read(os.path.join(f, "_course.md")))
                # unfinished problem
                page.click("#view-today >> text=Finish it")
                page.wait_for_selector("#pStatement >> text=greater than 0", timeout=10000)
                self.assertEqual(errors, [])
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()

    def test_loose_tests_rejected_and_coverage_on_today(self):
        import datetime as dt
        with App() as app, sync_playwright() as p:
            f = app.api("/api/course/create", {"language": "python", "type": "class", "name": "CS 101"})["folder"]
            app.api("/api/course/assessment", {"folder": f, "text": "Quiz 6 on %s - lists" % (dt.date.today() + dt.timedelta(days=5)).isoformat()})
            app.api("/api/note/coverage", {"folder": f, "rows": [{"skill": "count with a condition", "ways": "write it; trace it", "status": "gap"},
                                                                 {"skill": "loop over a list", "status": "solid"}]})
            loose = dict(PROBLEM, wrong_solutions=[{"code": "def count_positive(nums):\n    return sum(1 for n in nums if n >= 0)\n", "why": "counts zero too"}])
            strict = dict(loose, test_code=PROBLEM["test_code"] + '\nt("[0, 1]", 1, lambda: count_positive([0, 1]))')
            app.llm.reply("First problem.", tools=[("give_problem", loose)])
            app.llm.reply("Fixed the tests.", tools=[("give_problem", strict)], when="let this wrong solution pass")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .cov-card", timeout=15000)
                self.assertIn("quiz 6: 1/2 skills solid", page.inner_text("#view-today .cov-card").lower())
                self.assertIn("count with a condition", page.inner_text("#view-today .cov-card"))
                banner = page.inner_text("#view-today .banner.mats")
                self.assertIn("Add the lessons and practice quiz for Quiz 6", banner)
                page.click("#view-today .banner.mats >> text=Not now")
                self.assertEqual(page.locator("#view-today .banner.mats").count(), 0)
                page.click("#view-today .cov-card >> text=Open the map")
                page.wait_for_selector("#view-progress .tabs button.on >> text=Coverage", timeout=10000)
                self.assertIn("count with a condition", page.inner_text("#view-progress .note-card"))
                # the coach's first tests let "n >= 0" pass: rejected before the student sees it, then fixed
                page.click("#nav button[data-view=study]")
                page.click("#view-study >> text=Start session")
                page.wait_for_selector("#pStatement >> text=greater than 0", timeout=20000)
                tool_msgs = [m for r in app.llm.requests for m in r["messages"] if m.get("role") == "tool"]
                self.assertTrue(any("let this wrong solution pass" in (m.get("content") or "") for m in tool_msgs))
                self.assertIn("[0, 1]", page.evaluate("CC.S.session.problems[0].tests"))
                self.assertIn("COVERAGE MAP: Quiz 6", app.llm.requests[0]["messages"][0]["content"])
                self.assertEqual(errors, [])
            except Exception:
                page.screenshot(path=os.path.join(os.environ.get("E2E_SHOTS", app.home), "e2e-failure.png"))
                raise
            finally:
                browser.close()

    def test_quick_review(self):
        with App() as app, sync_playwright() as p:
            app.make_course("python", "Python track")
            app.llm.reply("Key idea first.", tools=[("update_review_notes", {"topic": "Lists", "markdown": "- `len(xs)` counts items\n\n```python\nxs.append(4)\n```"}),
                                                     ("give_problem", PROBLEM)])
            app.llm.reply("Nice!", when="[PROBLEM RESULT]")
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto(app.base + "/")
                page.wait_for_selector("#view-today .stats", timeout=15000)
                page.click("#nav button[data-view=study]")
                page.click("#view-study >> text=Start session")
                page.wait_for_selector("#pStatement >> text=greater than 0", timeout=15000)
                page.click("#reviewBtn")
                page.wait_for_selector("#reviewPanel >> text=counts items", timeout=10000)
                page.wait_for_selector("#reviewPanel >> text=still open")
                page.evaluate("(c) => document.querySelector('#pEditor .CodeMirror').CodeMirror.setValue(c)", SOLUTION)
                page.click("#submitBtn")
                page.wait_for_selector("#chat >> text=Nice!", timeout=20000)
                page.wait_for_selector("#reviewPanel >> text=Your solution", timeout=10000)      # the panel followed the session
                page.click("#view-study >> text=Close")
                page.click("#view-study .card >> text=Open")
                page.wait_for_selector("#view-review .rv-row >> text=Lists", timeout=10000)
                page.click("#view-review .rv-row >> text=Lists")
                page.wait_for_selector("#view-review .rv-md >> text=counts items", timeout=10000)
                page.wait_for_selector("#view-review .rv-md >> text=countPositive")             # the saved solution
                page.click("#view-review >> text=Sessions")
                page.click("#view-review .rv-row >> nth=0")
                page.wait_for_selector("#view-review .rv-md >> text=What you practiced", timeout=10000)
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

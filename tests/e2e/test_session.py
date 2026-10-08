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


if __name__ == "__main__":
    unittest.main()

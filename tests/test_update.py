"""One-click updates: install from the release files, restart into the new version, fall back from a broken one, undo."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, APP)
from harness import App  # noqa: E402
import server  # noqa: E402


def make_release(tmp, version, min_shell=None):
    """A staged app whose server.py says `version`, turned into CodeCoach-update.zip/.json like CI does."""
    src = os.path.join(tmp, "src-" + version)
    os.makedirs(src)
    with open(os.path.join(APP, "server.py"), encoding="utf-8") as f:
        code = f.read()
    code = re.sub(r'^VERSION = "[^"]+"', 'VERSION = "%s"' % version, code, count=1, flags=re.M)
    if min_shell:
        code = re.sub(r"^SHELL_VERSION = \d+", "SHELL_VERSION = %d" % min_shell, code, count=1, flags=re.M)
    write(os.path.join(src, "server.py"), code)
    for d in ("static", "prompts", "templates"):
        shutil.copytree(os.path.join(APP, d), os.path.join(src, d), ignore=shutil.ignore_patterns("vendor", "__pycache__"))
    with open(os.path.join(src, "static", "build.json"), "w") as f:
        json.dump({"repo": "x/y", "version": version, "shell": min_shell or server.SHELL_VERSION}, f)
    out = os.path.join(tmp, "out-" + version)
    # make_update reads SHELL_VERSION from the repo's server.py; patch the manifest afterwards for the "needs a full download" case
    subprocess.check_call([sys.executable, "-B", os.path.join(APP, "packaging", "make_update.py"), src, out], stdout=subprocess.DEVNULL)
    if min_shell:
        with open(os.path.join(out, "CodeCoach-update.json")) as f:
            m = json.load(f)
        m["min_shell"] = min_shell
        write(os.path.join(out, "CodeCoach-update.json"), json.dumps(m))
    return out


class UpdateTest(unittest.TestCase):
    def offer(self, app, out, version):
        url = lambda n: "file://" + os.path.join(out, n)
        with open(os.path.join(app.local, "update.json"), "w") as f:
            json.dump({"latest": "v" + version, "checked_at": time.time(), "url": "https://example.com",
                       "zip_url": url("CodeCoach-update.zip"), "manifest_url": url("CodeCoach-update.json")}, f)

    def test_update_restart_fallback_and_undo(self):
        tmp = tempfile.mkdtemp(prefix="cc-upd-")
        try:
            with App(env={"CODECOACH_PACKAGED": "ci"}) as app:
                out = make_release(tmp, "9.9.0")
                self.offer(app, out, "9.9.0")
                u = app.api("/api/update")
                self.assertTrue(u["available"] and u["installable"], u)
                # a damaged download is refused
                with open(os.path.join(out, "CodeCoach-update.json")) as f:
                    m = json.load(f)
                write(os.path.join(out, "CodeCoach-update.json"), json.dumps(dict(m, sha256="0" * 64)))
                with self.assertRaises(urllib.error.HTTPError):
                    app.api("/api/update/install", {})
                write(os.path.join(out, "CodeCoach-update.json"), json.dumps(m))
                r = app.api("/api/update/install", {})
                self.assertEqual(r, {"ok": True, "version": "9.9.0"})
                installed = os.path.join(app.local, "app", "9.9.0")
                self.assertTrue(os.path.isfile(os.path.join(installed, "server.py")))
                # restart: the same process now runs the update
                app.api("/api/restart", {})
                app.wait_version("9.9.0")
                self.assertTrue(app.api("/api/state")["in_place_update"])
                self.assertTrue(os.path.exists(os.path.join(installed, ".good")))
                self.assertEqual(app.api("/api/run_snippet", {"language": "python", "code": "print(6*7)"})["stdout"].strip(), "42")
                # a broken newer update is skipped and marked bad; the good one keeps running
                broken = os.path.join(app.local, "app", "9.9.5")
                os.makedirs(broken)
                write(os.path.join(broken, "server.py"), "raise RuntimeError('boom')\n")
                write(os.path.join(broken, "manifest.json"), json.dumps({"version": "9.9.5", "min_shell": 1}))
                app.api("/api/restart", {})
                app.wait_version("9.9.0")
                self.assertTrue(os.path.exists(os.path.join(broken, ".bad")))
                # undo: back to the version that came with the app
                app.api("/api/update/undo", {})
                app.api("/api/restart", {})
                app.wait_version(server.VERSION)
                self.assertFalse(app.api("/api/state")["in_place_update"])
                self.assertTrue(os.path.exists(os.path.join(installed, ".bad")))
                # an update that needs a newer app shell asks for a full download
                out2 = make_release(tmp, "9.9.9", min_shell=server.SHELL_VERSION + 1)
                self.offer(app, out2, "9.9.9")
                self.assertTrue(app.api("/api/update/install", {})["full"])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_update_now_in_the_page(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest("Playwright isn't installed")
        tmp = tempfile.mkdtemp(prefix="cc-upd-")
        try:
            with App(env={"CODECOACH_PACKAGED": "ci"}) as app, sync_playwright() as p:
                self.offer(app, make_release(tmp, "9.9.0"), "9.9.0")
                b = p.chromium.launch()
                page = b.new_page()
                page.goto(app.base + "/")
                page.click("#updateChip", timeout=15000)
                page.click("#modal .modal-foot >> text=Update now")
                page.wait_for_selector("text=Updated to CodeCoach 9.9.0", timeout=40000)
                b.close()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_source_installs_dont_update_in_place(self):
        with App() as app:
            self.assertFalse(app.api("/api/update")["installable"])
            with self.assertRaises(urllib.error.HTTPError):
                app.api("/api/update/install", {})


if __name__ == "__main__":
    unittest.main()

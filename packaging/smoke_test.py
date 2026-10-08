#!/usr/bin/env python3
"""Start a packaged CodeCoach server and check it really works (used by CI after each build).

    python3 packaging/smoke_test.py -- <command that starts the server, without --port>

Example (Mac):  python3 packaging/smoke_test.py -- dist/CodeCoach.app/Contents/Resources/python/bin/python3 -B \
                    dist/CodeCoach.app/Contents/Resources/app/server.py

Checks, against a throwaway home folder: the server answers, the page and its token load, bundled editor
and font files are served (offline-ready), the state API works, and a Python problem's tests run with the
same Python the app uses for students. Exits non-zero with a reason on the first failure.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request

PORT = 8799
BASE = "http://127.0.0.1:%d/" % PORT


def get(path, token=None, body=None, timeout=10):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-CC-Token"] = token
    req = urllib.request.Request(BASE + path.lstrip("/"), data=json.dumps(body).encode() if body is not None else None, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # never route localhost through a proxy
    with opener.open(req, timeout=timeout) as r:
        return r.status, r.read()


def fail(msg, proc=None, log=None):
    print("SMOKE TEST FAILED:", msg)
    if proc and proc.poll() is None:
        proc.kill()
    if log and os.path.exists(log):
        print("---- server output ----")
        print(open(log, encoding="utf-8", errors="replace").read()[-4000:])
    sys.exit(1)


def main():
    if "--" not in sys.argv:
        sys.exit(__doc__)
    cmd = sys.argv[sys.argv.index("--") + 1:] + ["--port", str(PORT), "--no-browser"]
    home = tempfile.mkdtemp(prefix="cc-smoke-home-")
    env = dict(os.environ, HOME=home, USERPROFILE=home, CODECOACH_PACKAGED="ci", PYTHONUTF8="1")
    log = os.path.join(home, "smoke-server.log")
    print("starting:", " ".join(cmd))
    proc = subprocess.Popen(cmd, stdout=open(log, "w"), stderr=subprocess.STDOUT, env=env)

    t0 = time.time()
    while True:
        try:
            _, body = get("api/ping", timeout=2)
            info = json.loads(body)
            if info.get("ok"):
                break
        except Exception:
            pass
        if proc.poll() is not None:
            fail("server exited early (code %s)" % proc.returncode, proc, log)
        if time.time() - t0 > 40:
            fail("server didn't answer within 40 s", proc, log)
        time.sleep(0.5)
    print("ok  ping: version %s after %.1f s" % (info.get("version"), time.time() - t0))

    try:
        _, page = get("/")
        m = re.search(rb'CC_TOKEN = "([0-9a-f]+)"', page)
        if not m:
            fail("index.html has no token", proc, log)
        token = m.group(1).decode()
        print("ok  page + token")

        for name in ("codemirror.min.js", "cm-clike.min.js", "jetbrains-mono-400.woff2", "inter-400.woff2", "mermaid.min.js"):
            status, data = get("vendor/" + name)
            if status != 200 or len(data) < 1000:
                fail("vendor file %s missing or empty (%d bytes)" % (name, len(data)), proc, log)
        print("ok  bundled editor/font/diagram files")

        _, st = get("api/state", token)
        st = json.loads(st)
        if "providers" not in st or not st.get("first_run"):
            fail("unexpected /api/state: %s" % json.dumps(st)[:400], proc, log)
        print("ok  state (%d AI providers, first-run setup shown)" % len(st["providers"]))

        _, r = get("api/run_tests", token, {"language": "python", "code": "def add(a, b):\n    return a + b\n",
                                               "tests": 't("add(1, 2)", 3, lambda: add(1, 2))\nt("add(-1, 1)", 0, lambda: add(-1, 1))'}, timeout=60)
        r = json.loads(r)
        if not r.get("ok") or r.get("passed") != 2:
            fail("Python tests didn't run: %s" % json.dumps(r)[:600], proc, log)
        print("ok  Python problem tests (2/2) with the bundled Python")

        _, r = get("api/run_snippet", token, {"language": "python", "code": "print(input()[::-1])", "stdin": "olleh"}, timeout=60)
        r = json.loads(r)
        if (r.get("stdout") or "").strip() != "hello":
            fail("Python playground run failed: %s" % json.dumps(r)[:600], proc, log)
        print("ok  Python playground with stdin")
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(10)
            except Exception:
                proc.kill()
    print("SMOKE TEST PASSED")


if __name__ == "__main__":
    main()

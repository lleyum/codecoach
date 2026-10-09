"""Start a real CodeCoach server against a throwaway home folder and the mock AI. Shared by the server and e2e tests."""
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from mock_llm import MockLLM  # noqa: E402

FAKE_KEY = "sk-test-NEVER-EXPORT-ME"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class App:
    """with App() as app:  app.api("/api/state")"""

    def __init__(self, extra_config=None, env=None):
        self.extra = extra_config or {}
        self.env_extra = env or {}

    def __enter__(self):
        self.llm = MockLLM().start()
        self.home = tempfile.mkdtemp(prefix="cc-test-home-")
        self.library = os.path.join(self.home, "CodeCoach Library")
        os.makedirs(self.library)
        self.local = os.path.join(self.home, ".codecoach")
        os.makedirs(self.local)
        if os.environ.get("CC_TEST_VENDOR"):         # offline machines: editor files from a local folder instead of static/vendor
            shutil.copytree(os.environ["CC_TEST_VENDOR"], os.path.join(self.local, "vendor"))
        self.write_config(dict({"vault": self.library, "ai": self.llm.ai_line(), "keys": {"openai": FAKE_KEY}}, **self.extra))
        self.port = free_port()
        self.base = "http://127.0.0.1:%d" % self.port
        env = {k: v for k, v in os.environ.items() if k.lower() not in ("http_proxy", "https_proxy", "all_proxy", "no_proxy")}
        env.update(HOME=self.home, USERPROFILE=self.home, PYTHONUTF8="1", NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost",
                   HTTPS_PROXY="http://127.0.0.1:9", https_proxy="http://127.0.0.1:9")    # "offline": the update check can't reach GitHub
        env.update(self.env_extra)
        self.log = os.path.join(self.home, "server.log")
        self.logf = open(self.log, "w")
        self.proc = subprocess.Popen([sys.executable, "-B", os.path.join(APP, "server.py"), "--port", str(self.port), "--no-browser"],
                                     stdout=self.logf, stderr=subprocess.STDOUT, env=env)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        t0 = time.time()
        while True:
            try:
                with self.opener.open(self.base + "/api/ping", timeout=2) as r:
                    if json.loads(r.read()).get("ok"):
                        break
            except Exception:
                pass
            if self.proc.poll() is not None or time.time() - t0 > 30:
                out = open(self.log).read()[-3000:]
                self.__exit__()
                raise RuntimeError("server didn't start:\n" + out)
            time.sleep(0.2)
        self.reconnect()
        return self

    def reconnect(self):
        """Read the page's token again (it changes when the server restarts)."""
        with self.opener.open(self.base + "/", timeout=10) as r:
            self.token = re.search(rb'CC_TOKEN = "([0-9a-f]+)"', r.read()).group(1).decode()

    def wait_version(self, version, timeout=30):
        """After /api/restart: wait for a restarted server (new token) running `version`."""
        t0, old = time.time(), self.token
        while time.time() - t0 < timeout:
            try:
                with self.opener.open(self.base + "/api/ping", timeout=2) as r:
                    if json.loads(r.read()).get("version") == version:
                        self.reconnect()
                        if self.token != old:
                            return True
            except Exception:
                pass
            time.sleep(0.3)
        raise AssertionError("server never came back as %s:\n%s" % (version, open(self.log).read()[-3000:]))

    def __exit__(self, *a):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except Exception:
                self.proc.kill()
        self.llm.stop()
        self.logf.close()
        shutil.rmtree(self.home, ignore_errors=True)

    def write_config(self, cfg):
        with open(os.path.join(self.local, "config.json"), "w", encoding="utf-8") as f:
            json.dump(cfg, f)

    def config(self):
        with open(os.path.join(self.local, "config.json"), encoding="utf-8") as f:
            return json.load(f)

    def raw(self, path, body=None, timeout=60):
        req = urllib.request.Request(self.base + path, data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Content-Type": "application/json", "X-CC-Token": self.token})
        with self.opener.open(req, timeout=timeout) as r:
            return r.headers, r.read()

    def api(self, path, body=None, timeout=60):
        return json.loads(self.raw(path, body, timeout)[1])

    def make_course(self, language="python", name="Python track"):
        return self.api("/api/course/create", {"language": language, "type": "general", "name": name})["folder"]

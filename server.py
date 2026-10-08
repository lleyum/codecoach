#!/usr/bin/env python3
"""CodeCoach - a local study app for learning to code.

A small web server on 127.0.0.1 only. The app window talks to it to:
  - call the AI model you choose (OpenRouter, Ollama, LM Studio, OpenAI, ... or any
    OpenAI-compatible server), with keys that never leave this computer
  - compile and run code locally (Java, Python, C++, C, JavaScript, Go, Rust)
  - read and update your notes, materials and progress: plain Markdown files in your
    Library folder (any folder; an Obsidian vault works too)
  - save sessions, snippets and usage inside the Library, so whatever syncs that folder
    (iCloud Drive, Dropbox, Git, Syncthing...) syncs CodeCoach. No account, no cloud of ours.

Standard library only. Works with Python 3.8+ on macOS, Windows and Linux.
"""
import argparse
import base64
import datetime as dt
import difflib
import html
import io
import json
import os
import re
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = "3.1.0"
APP_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(APP_DIR, "static")
VENDOR_DIR = os.path.join(STATIC_DIR, "vendor")
PROMPTS_DIR = os.path.join(APP_DIR, "prompts")
TEMPLATES_DIR = os.path.join(APP_DIR, "templates")
HOME = os.path.expanduser("~")
LOCAL_DIR = os.path.join(HOME, ".codecoach")          # per-computer settings (keys, Library location)
LOCAL_CONFIG = os.path.join(LOCAL_DIR, "config.json")
IS_WIN = os.name == "nt"

TOKEN = secrets.token_hex(16)  # required on every API call (blocks other websites from using the app)
STATE = {"last_ping": time.monotonic(), "inflight": 0}   # monotonic: does not jump forward while the Mac sleeps

DEFAULT_LIBRARY = os.path.join(HOME, "CodeCoach Library")

DEFAULT_CONFIG = {
    "vault": DEFAULT_LIBRARY,            # the Library folder (kept as "vault" so older configs keep working)
    "sync_dir": "",                      # empty = <Library>/CodeCoach
    # One line picks the AI:  "provider:model"  or  "model@http://any-openai-compatible-server/v1"
    #   openrouter:deepseek/deepseek-v4.1-flash   ollama:qwen3:14b   lmstudio:qwen3-14b   openai:gpt-5-mini
    "ai": "",
    "keys": {},                          # per-provider API keys, stored only on this computer
    "providers": {},                     # optional extra providers: {"name": {"url": ".../v1", "key_env": "NAME_API_KEY"}}
    "model": "deepseek/deepseek-v4.1-flash",
    "max_tokens": 8000,
    "compact_at": 40000,
    "api_key": "",
    "teach_skill_path": "",              # optional: your own teaching method (Markdown); empty = built-in
    "auto_quit_minutes": 20,
    "check_updates": True,               # once a day, ask GitHub whether a newer release exists (no data about you is sent)
    "coach_name": "Coach",
    # legacy (v2) AI settings - still read, converted to "ai" automatically
    "provider": "openrouter",
    "base_url": "http://localhost:11434/v1",
    "local_model": "",
    "local_key": "",
}

# ---------------------------------------------------------------- AI providers
# Every provider speaks the OpenAI chat-completions API. Adding a future provider = one entry here,
# or one entry in config.json "providers", or just  "ai": "model@https://their-server/v1".
PROVIDERS = {
    #  id           label            base url                                                  key env var           local  get a key
    "openrouter": ("OpenRouter",     "https://openrouter.ai/api/v1",                           "OPENROUTER_API_KEY", False, "https://openrouter.ai/keys"),
    "ollama":     ("Ollama",         "http://localhost:11434/v1",                              "",                   True,  "https://ollama.com/download"),
    "lmstudio":   ("LM Studio",      "http://localhost:1234/v1",                               "",                   True,  "https://lmstudio.ai"),
    "openai":     ("OpenAI",         "https://api.openai.com/v1",                              "OPENAI_API_KEY",     False, "https://platform.openai.com/api-keys"),
    "anthropic":  ("Anthropic",      "https://api.anthropic.com/v1",                           "ANTHROPIC_API_KEY",  False, "https://console.anthropic.com/settings/keys"),
    "gemini":     ("Google Gemini",  "https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY",    False, "https://aistudio.google.com/apikey"),
    "groq":       ("Groq",           "https://api.groq.com/openai/v1",                         "GROQ_API_KEY",       False, "https://console.groq.com/keys"),
    "deepseek":   ("DeepSeek",       "https://api.deepseek.com/v1",                            "DEEPSEEK_API_KEY",   False, "https://platform.deepseek.com/api_keys"),
    "mistral":    ("Mistral",        "https://api.mistral.ai/v1",                              "MISTRAL_API_KEY",    False, "https://console.mistral.ai/api-keys"),
}
STREAM_USAGE = {"openai", "ollama", "lmstudio", "groq", "deepseek", "mistral", "custom"}


def provider_table(cfg):
    t = {k: {"label": v[0], "url": v[1], "key_env": v[2], "local": v[3], "key_url": v[4]} for k, v in PROVIDERS.items()}
    for k, v in (cfg.get("providers") or {}).items():
        if isinstance(v, dict) and v.get("url"):
            k = re.sub(r"[^\w\-]", "", k.lower())
            t[k] = {"label": v.get("label") or k, "url": v["url"], "key_env": v.get("key_env", ""),
                    "local": bool(v["local"]) if "local" in v else bool(re.match(r"https?://(localhost|127\.0\.0\.1)", v["url"])),
                    "key_url": v.get("key_url", "")}
    return t


def legacy_ai_line(cfg):
    """v2 settings -> one-line form."""
    if cfg.get("provider") == "local":
        base, m = (cfg.get("base_url") or "").rstrip("/"), cfg.get("local_model") or ""
        if ":11434" in base and re.search(r"//(localhost|127\.0\.0\.1)", base):
            return "ollama:" + m
        if ":1234" in base and re.search(r"//(localhost|127\.0\.0\.1)", base):
            return "lmstudio:" + m
        return m + "@" + base
    return "openrouter:" + (cfg.get("model") or DEFAULT_CONFIG["model"])


def parse_ai(cfg, line=None):
    """'provider:model' | 'model@https://server/v1' | bare 'vendor/model' (OpenRouter) -> dict."""
    line = (line if line is not None else (cfg.get("ai") or legacy_ai_line(cfg))).strip()
    table = provider_table(cfg)
    m = re.match(r"^(.*)@(https?://\S+)$", line)
    if m:
        url = m.group(2).rstrip("/")
        return {"id": "custom", "label": "Custom server", "url": url, "model": m.group(1).strip(), "key_env": "", "key_url": "",
                "local": bool(re.search(r"//(localhost|127\.0\.0\.1|192\.168\.|10\.)", url)), "line": line}
    pid, _, model = line.partition(":")
    if pid.lower() in table and _:
        p = table[pid.lower()]
        return dict(p, id=pid.lower(), model=model.strip(), line=line)
    p = table["openrouter"]
    return dict(p, id="openrouter", model=line, line="openrouter:" + line)


def ai_key(cfg, ai):
    """(key, where it came from) for the chosen provider."""
    keys = cfg.get("keys") or {}
    if keys.get(ai["id"]):
        return clean_key(keys[ai["id"]]), "settings"
    if ai["id"] == "openrouter":
        return find_api_key(cfg)
    if ai["id"] == "custom" and cfg.get("local_key"):
        return clean_key(cfg["local_key"]), "settings"
    if ai.get("key_env") and os.environ.get(ai["key_env"]):
        return clean_key(os.environ[ai["key_env"]]), "environment"
    return "", ""


def ai_ready(cfg):
    ai = parse_ai(cfg)
    return bool(ai["model"]) and (ai["local"] or bool(ai_key(cfg, ai)[0]))

VENDOR_SOURCES = {
    "codemirror.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js",
    "codemirror.min.css": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css",
    "cm-clike.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js",
    "cm-python.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js",
    "cm-javascript.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js",
    "cm-go.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/go/go.min.js",
    "cm-rust.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/rust/rust.min.js",
    "cm-simple.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/mode/simple.min.js",
    "cm-matchbrackets.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/matchbrackets.min.js",
    "cm-closebrackets.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js",
    "cm-comment.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/comment/comment.min.js",
    "cm-active-line.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/selection/active-line.min.js",
    "cm-searchcursor.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/searchcursor.min.js",
    "cm-search.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/search.min.js",
    "cm-dialog.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.js",
    "cm-dialog.min.css": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.css",
    "cm-runmode.min.js": "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/runmode/runmode.min.js",
    "mermaid.min.js": "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js",
    "pdf.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    "pdf.worker.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
}
for _w in (400, 500, 600, 700):
    VENDOR_SOURCES["inter-%d.woff2" % _w] = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.20/files/inter-latin-%d-normal.woff2" % _w
for _w in (400, 500, 600, 700, 800):
    VENDOR_SOURCES["jetbrains-mono-%d.woff2" % _w] = "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.0.20/files/jetbrains-mono-latin-%d-normal.woff2" % _w

LANGS = {
    "java": {"label": "Java", "ext": "java", "tests": True, "tools": ["javac"]},
    "python": {"label": "Python", "ext": "py", "tests": True, "tools": ["python3", "python"]},
    "cpp": {"label": "C++", "ext": "cpp", "tests": True, "tools": ["c++", "g++", "clang++"]},
    "c": {"label": "C", "ext": "c", "tests": True, "tools": ["cc", "gcc", "clang"]},
    "javascript": {"label": "JavaScript", "ext": "js", "tests": True, "tools": ["node"]},
    "go": {"label": "Go", "ext": "go", "tests": False, "tools": ["go"]},
    "rust": {"label": "Rust", "ext": "rs", "tests": False, "tools": ["rustc"]},
}


WINDOWS = os.name == "nt"
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
PROG = "prog.exe" if WINDOWS else "prog"   # compiled C/C++/Go/Rust program name


def python_exe():
    """The Python used to run student code (python.exe, never the console-less pythonw.exe on Windows)."""
    exe = sys.executable
    if os.path.basename(exe).lower() == "pythonw.exe":
        alt = os.path.join(os.path.dirname(exe), "python.exe")
        if os.path.exists(alt):
            return alt
    return exe


def relposix(path, base):
    """Vault-relative path with forward slashes, so it works on both Mac and Windows after syncing."""
    return os.path.relpath(path, base).replace(os.sep, "/")


def from_rel(base, rel):
    return os.path.join(base, *[p for p in str(rel).replace("\\", "/").split("/") if p])


def crashed(rc):
    """True when the program died from a crash (Unix signal, or a Windows exception code like 0xC0000005)."""
    return rc is not None and ((rc < 0 and rc != -2) or rc >= 0xC0000000)


def crash_name(rc):
    names = {0xC0000005: "access violation - bad pointer or index", 0xC00000FD: "stack overflow - infinite recursion?",
             0xC0000094: "integer divide by zero", 11: "segmentation fault - bad pointer or index", 6: "abort", 8: "arithmetic error",
             24: "stopped: used too much CPU time - an infinite loop?", 25: "stopped: wrote more than 50 MB to a file",
             9: "stopped by the app (time or memory limit)", 0xC0000017: "stopped: ran out of memory", 0xC000012D: "stopped: ran out of memory"}
    code = rc if rc > 0 else -rc
    return names.get(code, ("code 0x%X" % rc) if rc > 0 else "signal %d" % code)


def norm_lang(s):
    s = (s or "java").strip().lower()
    s = re.split(r"[\s(,/]", s)[0] if s else "java"
    return {"c++": "cpp", "cplusplus": "cpp", "js": "javascript", "node": "javascript", "py": "python", "python3": "python",
            "golang": "go", "rs": "rust"}.get(s, s if s in LANGS else "java")


def which_tool(lang):
    if lang == "python":
        return python_exe()
    for t in LANGS[lang]["tools"]:
        p = shutil.which(t)
        if p:
            return p
    return None


# ---------------------------------------------------------------- small utils

def read_text(path, limit=None):
    try:
        with open(path, encoding="utf-8") as f:
            t = f.read()
        if limit and len(t) > limit:
            t = t[:limit] + "\n\n[... truncated ...]\n"
        return t
    except Exception:
        return ""


def write_text(path, text):
    """Atomic write: never leaves a half-written file if the app or computer stops mid-save."""
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".tmp_", suffix=".part")
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


def safe_join(base, rel):
    base_r = os.path.realpath(base)
    p = os.path.realpath(from_rel(base, rel))
    if not (p == base_r or p.startswith(base_r + os.sep)):
        raise ValueError("path outside allowed folder")
    return p


def slug(s, n=60):
    s = re.sub(r"[\\/:*?\"<>|#^\[\]]", "-", (s or "").strip())
    s = re.sub(r"\s+", " ", s).strip(" .-")
    return (s or "untitled")[:n]


def today():
    return dt.date.today().isoformat()


def urlopen(req, timeout):
    """urlopen that also works with Apple's Python, which sometimes lacks CA certificates."""
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.URLError as e:
        if not isinstance(getattr(e, "reason", None), ssl.SSLError):
            raise
        for cafile in ("/etc/ssl/cert.pem", "/usr/local/etc/openssl/cert.pem", "/opt/homebrew/etc/openssl@3/cert.pem"):
            if os.path.exists(cafile):
                return urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context(cafile=cafile))
        raise


# ---------------------------------------------------------------- config & sync storage

def load_config():
    os.makedirs(LOCAL_DIR, exist_ok=True)
    cfg = dict(DEFAULT_CONFIG)
    # migrate v1 config (stored inside the app folder)
    old = os.path.join(APP_DIR, "data", "config.json")
    if os.path.exists(old) and not os.path.exists(LOCAL_CONFIG):
        try:
            with open(old, encoding="utf-8") as f:
                cfg.update(json.load(f))
            save_config(cfg)
        except Exception:
            pass
    if os.path.exists(LOCAL_CONFIG):
        try:
            with open(LOCAL_CONFIG, encoding="utf-8") as f:
                cfg.update(json.load(f))
        except Exception:
            pass
    return cfg


def device(cfg):
    """(id, name) of this computer: tells sessions saved here apart from ones saved on your other computers."""
    if not cfg.get("device_id"):
        cfg["device_id"] = STATE.setdefault("device_id", secrets.token_hex(4))
        if os.path.exists(LOCAL_CONFIG):      # before first-run setup nothing is written (a config file means "set up")
            try:
                with open(LOCAL_CONFIG, encoding="utf-8") as f:
                    raw = json.load(f)
                raw["device_id"] = cfg["device_id"]
                save_config(raw)
            except Exception:
                pass
    import platform
    name = re.sub(r"\.local$", "", platform.node() or "") or "another computer"
    return cfg["device_id"], name


def save_config(cfg):
    write_text(LOCAL_CONFIG, json.dumps(cfg, indent=2))
    try:
        os.chmod(LOCAL_CONFIG, 0o600)
    except Exception:
        pass


def sync_dir(cfg):
    d = cfg.get("sync_dir") or os.path.join(cfg["vault"], "CodeCoach")
    os.makedirs(os.path.join(d, "sessions"), exist_ok=True)
    os.makedirs(os.path.join(d, "snippets"), exist_ok=True)
    return d


STATE_HEAD = "# CodeCoach data (do not edit by hand)\n\nThis file stores CodeCoach progress so it syncs with your vault.\n\n```json\n"


def write_state(path, obj):
    write_text(path, STATE_HEAD + json.dumps(obj, ensure_ascii=False) + "\n```\n")


def read_state(path):
    t = read_text(path)
    m = re.search(r"```json\n(.*)\n```", t, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def migrate_v1_sessions(cfg):
    old = os.path.join(APP_DIR, "data", "sessions")
    if not os.path.isdir(old):
        return
    dest = os.path.join(sync_dir(cfg), "sessions")
    for n in os.listdir(old):
        if n.endswith(".json"):
            try:
                with open(os.path.join(old, n), encoding="utf-8") as f:
                    obj = json.load(f)
                target = os.path.join(dest, n[:-5] + ".md")
                if not os.path.exists(target):
                    write_state(target, obj)
            except Exception:
                pass


def clean_key(k):
    # visible ASCII only - removes invisible characters like U+2028 that break HTTP headers
    return re.sub(r"[^\x21-\x7e]", "", k or "")


def find_api_key(cfg):
    if cfg.get("api_key"):
        return clean_key(cfg["api_key"]), "settings"
    if os.environ.get("OPENROUTER_API_KEY"):
        return clean_key(os.environ["OPENROUTER_API_KEY"]), "environment"
    auth = os.path.join(HOME, ".pi", "agent", "auth.json")       # reuse a key from the Pi coding agent, if installed
    if os.path.exists(auth):
        m = re.search(r"sk-or-[A-Za-z0-9_\-]+", clean_key(read_text(auth).replace('"', " ")))
        if m:
            return m.group(0), "Pi"
    return "", ""


def log_usage(cfg, usage, model):
    if not usage:
        return
    try:
        path = os.path.join(sync_dir(cfg), "usage.md")
        data = read_state(path) or {"days": {}}
        day = data["days"].setdefault(today(), {"cost": 0.0, "tokens": 0, "calls": 0})
        day["cost"] = round(day["cost"] + float(usage.get("cost") or 0), 6)
        if usage.get("cost_estimated"):
            day["estimated"] = True                 # part of today's cost is estimated from published prices
        if usage.get("cost_unknown"):
            day["unpriced"] = day.get("unpriced", 0) + 1
        day["tokens"] += int(usage.get("prompt_tokens") or 0) + int(usage.get("completion_tokens") or 0)
        day["calls"] += 1
        # prompt caching: how much of the input was read from / written to the provider's cache, and what it saved
        read, write, saved = cache_stats(usage)
        day["prompt"] = day.get("prompt", 0) + int(usage.get("prompt_tokens") or 0)
        day["cached"] = day.get("cached", 0) + read
        day["cache_write"] = day.get("cache_write", 0) + write
        day["saved"] = round(day.get("saved", 0.0) + saved, 6)
        write_state(path, data)
    except Exception:
        pass


# ---------------------------------------------------------------- prices (cost estimates for every provider)
# OpenRouter reports the exact cost of each call. Other cloud providers only report tokens, so CodeCoach multiplies them
# by published prices: OpenRouter's public model list (no key, once a day, cached in ~/.codecoach/prices.json), which
# lists the same models as OpenAI, Anthropic, Google, Mistral and DeepSeek sell directly. Your own prices win:
# ~/.codecoach/price_overrides.json  {"openai:gpt-6-luna": {"input": 1.25, "output": 10, "cached": 0.125}}  (USD per 1M tokens)
PRICES_URL = "https://openrouter.ai/api/v1/models"
OR_VENDOR = {"openai": "openai", "anthropic": "anthropic", "gemini": "google", "mistral": "mistralai", "deepseek": "deepseek"}
PRICE_STATE = {"key": None, "data": {}, "fetching": False, "ov_key": None, "ov": {}}
# sidebar suggestions: the newest tool-capable OpenRouter model of each family (so the list never goes stale)
SUGGEST = [(r"^deepseek/deepseek-v[\d.]+-flash$", "cheap"), (r"^google/gemini-[\d.]+-flash$", "cheap"),
           (r"^anthropic/claude-[\w.-]*sonnet[\w.-]*$", ""), (r"^moonshotai/kimi-k[\d.]+$", ""), (r"^z-ai/glm-[\d.]+$", "")]
SUGGEST_SKIP = re.compile(r"preview|exp|beta|vision|image|audio|online|extended|thinking|search|:nitro", re.I)


def prices_file():
    return os.path.join(LOCAL_DIR, "prices.json")


def load_prices():
    path = prices_file()
    try:
        st = os.stat(path)
    except OSError:
        return {}
    key = (st.st_mtime, st.st_size)
    if PRICE_STATE["key"] != key:
        try:
            with open(path, encoding="utf-8") as f:
                PRICE_STATE["data"] = json.load(f)
        except Exception:
            PRICE_STATE["data"] = {}
        PRICE_STATE["key"] = key
    return PRICE_STATE["data"]


def fetch_prices():
    req = urllib.request.Request(PRICES_URL, headers={"User-Agent": "CodeCoach"})
    with urlopen(req, 15) as r:
        data = json.loads(r.read().decode("utf-8"))
    models = {}
    for m in data.get("data", []):
        pr = m.get("pricing") or {}
        try:
            p, c = float(pr.get("prompt") or 0), float(pr.get("completion") or 0)
            cr = float(pr["input_cache_read"]) if pr.get("input_cache_read") not in (None, "") else None
        except (TypeError, ValueError):
            continue
        if p < 0 or c < 0:                       # "-1" = variable price (routers)
            continue
        models[m.get("id", "")] = {"p": p, "c": c, "cr": cr, "name": re.sub(r"^[^:]+:\s*", "", m.get("name") or m.get("id", "")),
                                   "created": int(m.get("created") or 0), "tools": "tools" in (m.get("supported_parameters") or [])}
    if models:
        write_text(prices_file(), json.dumps({"fetched_at": time.time(), "updated": today(), "models": models}))
    return models


def refresh_prices(force=False):
    """Fetch the price list in the background when it is missing or a day old. Never blocks a request."""
    if PRICE_STATE["fetching"]:
        return
    if not force and time.time() - float(load_prices().get("fetched_at") or 0) < 24 * 3600:
        return
    def run():
        try:
            fetch_prices()
        except Exception as e:
            print("price list not updated (%s)" % e)
        finally:
            PRICE_STATE["fetching"] = False
    PRICE_STATE["fetching"] = True
    threading.Thread(target=run, daemon=True).start()


def price_overrides():
    path = os.path.join(LOCAL_DIR, "price_overrides.json")
    try:
        key = os.path.getmtime(path)
    except OSError:
        return {}
    if PRICE_STATE["ov_key"] != key:
        try:
            with open(path, encoding="utf-8") as f:
                PRICE_STATE["ov"] = {k.lower(): v for k, v in json.load(f).items() if isinstance(v, dict)}
        except Exception as e:
            print("price_overrides.json ignored: %s" % e)
            PRICE_STATE["ov"] = {}
        PRICE_STATE["ov_key"] = key
    return PRICE_STATE["ov"]


def price_candidates(ai):
    """OpenRouter ids that are the same model as this provider's model id."""
    m = (ai.get("model") or "").strip().lower().replace("models/", "")
    if ai["id"] == "openrouter":
        return [m, re.sub(r":\w+$", "", m)]
    m = re.sub(r"-(\d{8}|latest)$", "", m)                     # claude-sonnet-5-5-20260101 -> claude-sonnet-5-5
    vendor = OR_VENDOR.get(ai["id"])
    out = []
    if vendor:
        out.append(vendor + "/" + m)
        if ai["id"] == "anthropic":
            out.append(vendor + "/" + re.sub(r"(?<=\d)-(?=\d)", ".", m))   # claude-sonnet-5-5 -> claude-sonnet-5.5
    return out + ["*/" + m.split("/")[-1]]


def find_price(cfg, ai):
    """USD per token (input, output, cached input) or None when unknown."""
    ov = price_overrides()
    for k in (ai.get("line", ""), "%s:%s" % (ai["id"], ai.get("model", "")), ai.get("model", "")):
        v = ov.get(k.lower())
        if v:
            try:
                i, o = float(v.get("input", 0)) / 1e6, float(v.get("output", 0)) / 1e6
                return (i, o, float(v["cached"]) / 1e6 if v.get("cached") is not None else i)
            except (TypeError, ValueError):
                pass
    if ai.get("local"):
        return (0.0, 0.0, 0.0)
    models = load_prices().get("models") or {}
    for cand in price_candidates(ai):
        if cand.startswith("*/"):
            hits = sorted(k for k in models if k.lower().endswith(cand[1:]))
            cand = hits[0] if hits else None
        if cand and cand in models:
            x = models[cand]
            return (x["p"], x["c"], x["cr"] if x.get("cr") is not None else x["p"])
    return None


def add_cost(cfg, usage):
    """Fill in usage['cost'] where the provider didn't (marked cost_estimated). Returns the same dict."""
    if not isinstance(usage, dict) or usage.get("cost") is not None:
        return usage
    ai = parse_ai(cfg)
    price = find_price(cfg, ai)
    if price is None:
        usage["cost_unknown"] = True
        refresh_prices()
        return usage
    read, _, _ = cache_stats(usage)
    prompt, out = int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0)
    usage["cost"] = round(max(0, prompt - read) * price[0] + read * price[2] + out * price[1], 8)
    if any(price):
        usage["cost_estimated"] = True
    return usage


def suggested_models():
    """[[id, label], ...] for the sidebar: newest model of each family + two newest free ones (from the cached list)."""
    models = load_prices().get("models") or {}
    out = []
    for pat, tag in SUGGEST:
        hits = [(v["created"], k) for k, v in models.items() if re.match(pat, k) and v.get("tools") and not SUGGEST_SKIP.search(k)]
        if hits:
            k = max(hits)[1]
            out.append([k, models[k]["name"] + (" (%s)" % tag if tag else "")])
    free = sorted(((v["created"], k) for k, v in models.items() if k.endswith(":free") and v.get("tools") and not SUGGEST_SKIP.search(k)), reverse=True)
    out += [[k, models[k]["name"].replace(" (free)", "") + " (free)"] for _, k in free[:2]]
    return out


# ---------------------------------------------------------------- update check (opt-out in Settings > App)

UPDATE_REPO = "lleyum/codecoach"     # where releases are published; downloaded builds record their own in static/build.json
def update_file():
    return os.path.join(LOCAL_DIR, "update.json")


def version_tuple(v):
    nums = re.findall(r"\d+", str(v or ""))[:4]
    return tuple(int(n) for n in nums) + (0,) * (4 - len(nums))


def update_status(cfg, force=False):
    """Latest release vs this version. Asks GitHub at most once a day; works offline (just says nothing new)."""
    try:
        with open(update_file(), encoding="utf-8") as f:
            st = json.load(f)
    except Exception:
        st = {}
    out = {"current": VERSION, "enabled": cfg.get("check_updates", True) is not False}
    if not out["enabled"]:
        return out
    if force or time.time() - float(st.get("checked_at") or 0) > 24 * 3600:
        repo = UPDATE_REPO
        try:
            with open(os.path.join(STATIC_DIR, "build.json"), encoding="utf-8") as f:
                repo = json.load(f).get("repo") or repo
        except Exception:
            pass
        try:
            req = urllib.request.Request("https://api.github.com/repos/%s/releases/latest" % repo,
                                         headers={"Accept": "application/vnd.github+json", "User-Agent": "CodeCoach"})
            with urlopen(req, 6) as r:
                rel = json.loads(r.read().decode("utf-8"))
            if not rel.get("draft") and not rel.get("prerelease"):
                st.update({"latest": rel.get("tag_name", ""), "url": rel.get("html_url", ""), "notes": (rel.get("body") or "")[:4000]})
            st["checked_at"] = time.time()
            write_text(update_file(), json.dumps(st))
        except Exception:
            pass                                  # offline or rate-limited: try again next launch
    latest = st.get("latest") or ""
    out.update({"latest": latest, "url": st.get("url", ""), "notes": st.get("notes", ""), "skipped": st.get("skipped", ""),
                "available": bool(latest) and version_tuple(latest) > version_tuple(VERSION) and latest != st.get("skipped")})
    return out


def skip_update(version):
    try:
        with open(update_file(), encoding="utf-8") as f:
            st = json.load(f)
    except Exception:
        st = {}
    st["skipped"] = version
    write_text(update_file(), json.dumps(st))


# ---------------------------------------------------------------- the Library folder

PACKAGED = bool(os.environ.get("CODECOACH_PACKAGED"))   # set by the downloadable app builds

LIBRARY_README = """# CodeCoach Library

This folder is your CodeCoach data. All of it - nothing is stored in any cloud of ours.

- Every course is a folder with a `_course.md` file: your roadmap, mastery tracker, toolkit,
  mistakes, patterns, materials, practice solutions and a Markdown log of every session.
- `CodeCoach/` holds saved sessions (so you can resume them), snippets, your learner profile and usage.
- Everything is plain Markdown. Open or edit it in any text editor, VS Code, or Obsidian
  (you can even open this folder as an Obsidian vault).

**Sync to other computers for free:** put this folder in iCloud Drive, Dropbox, OneDrive or Google
Drive, or track it with Git or Syncthing - then point CodeCoach on the other computer at the same
folder (Settings > Notes & sync). No account needed.

**Back up / move:** CodeCoach > Welcome > *Export everything* makes a single zip of all of it.
"""


def ensure_library(cfg):
    lib = cfg["vault"]
    os.makedirs(lib, exist_ok=True)
    readme = os.path.join(lib, "README - CodeCoach Library.md")
    if not os.path.exists(readme):
        try:
            write_text(readme, LIBRARY_README)
        except Exception:
            pass
    sync_dir(cfg)


def psq(text):
    """A PowerShell single-quoted string literal."""
    return "'" + str(text).replace("'", "''") + "'"


def pick_folder(prompt, start):
    """Native "choose folder" dialog (macOS, Windows, Linux with zenity/kdialog). Returns "" if cancelled/unavailable."""
    start = start if os.path.isdir(start or "") else HOME
    try:
        if sys.platform == "darwin":
            script = ('tell application "System Events" to activate\n'
                      'set f to choose folder with prompt %s default location (POSIX file %s)\nPOSIX path of f') % (
                json.dumps(prompt, ensure_ascii=False), json.dumps(start, ensure_ascii=False))
            r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=600)
            return r.stdout.strip().rstrip("/") if r.returncode == 0 else ""
        if WINDOWS:
            ps = ("Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; "
                  "$d.Description = %s; $d.SelectedPath = %s; $d.ShowNewFolderButton = $true; "
                  "if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }") % (psq(prompt), psq(start))
            r = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps], capture_output=True, text=True, timeout=600,
                               creationflags=0x08000000)
            return r.stdout.strip()
        for cmd in (["zenity", "--file-selection", "--directory", "--title=" + prompt, "--filename=" + start + "/"],
                    ["kdialog", "--getexistingdirectory", start, "--title", prompt]):
            if shutil.which(cmd[0]):
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        pass
    return ""


def has_obsidian():
    if sys.platform == "darwin":
        return any(os.path.isdir(p) for p in ("/Applications/Obsidian.app", os.path.join(HOME, "Applications", "Obsidian.app")))
    if WINDOWS:
        return os.path.isdir(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Obsidian")) or os.path.isdir(os.path.join(os.environ.get("LOCALAPPDATA", ""), "Obsidian"))
    return bool(shutil.which("obsidian"))


def open_path(path):
    """Open a file with its default app (a .md note opens in your Markdown editor)."""
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif WINDOWS:
        os.startfile(path)  # noqa
    else:
        subprocess.Popen(["xdg-open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def reveal(path):
    """Show a folder in Finder / Explorer / the file manager."""
    os.makedirs(path, exist_ok=True)
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif WINDOWS:
        os.startfile(path)  # noqa
    else:
        subprocess.Popen(["xdg-open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------------------------------------------------------------- courses

def course_meta(folder):
    text = read_text(os.path.join(folder, "_course.md"))
    def field(name, default=""):
        m = re.search(r"\*\*" + name + r":\*\*\s*(.+)", text)
        return m.group(1).strip() if m else default
    name = field("Course") or field("Name") or os.path.basename(folder)
    ctype = field("Type", "class").lower()
    return {"name": name, "folder": folder, "language": norm_lang(field("Language", "java")),
            "language_raw": field("Language", "Java"), "type": "general" if ctype.startswith("gen") else "class"}


def vault_readable(cfg):
    """False when macOS privacy settings block this process from reading the vault (e.g. ~/Documents)."""
    try:
        os.listdir(cfg["vault"])
        return True
    except PermissionError:
        return False
    except OSError:
        return os.path.isdir(cfg["vault"])


def find_courses(vault):
    out = []
    if not os.path.isdir(vault):
        return out
    base_depth = vault.rstrip(os.sep).count(os.sep)
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "CodeCoach", "materials", "practice", "sessions")]
        if root.count(os.sep) - base_depth >= 5:
            dirs[:] = []
        if "_course.md" in files:
            m = course_meta(root)
            m["rel"] = relposix(root, vault)
            out.append(m)
    out.sort(key=lambda c: c["rel"].lower())
    return out


def course_files(folder):
    names = os.listdir(folder) if os.path.isdir(folder) else []
    def pick(pred):
        for n in sorted(names):
            if n.endswith(".md") and pred(n.lower()):
                return n
        return None
    files = {
        "profile": "_course.md",
        "roadmap": pick(lambda n: n.startswith("roadmap")),
        "tracker": pick(lambda n: "mastery tracker" in n),
        "toolkit": pick(lambda n: "toolkit" in n),
        "mistakes": pick(lambda n: "mistakes" in n),
        "patterns": pick(lambda n: "pattern library" in n),
        "blueprint": pick(lambda n: "blueprint" in n),
    }
    if not files["toolkit"]:
        m = re.search(r"\[\[([^\]]*Toolkit[^\]]*)\]\]", read_text(os.path.join(folder, "_course.md")))
        if m:
            files["toolkit_link"] = m.group(1)
    return files


def resolve_toolkit(folder, cfg):
    files = course_files(folder)
    if files.get("toolkit"):
        return os.path.join(folder, files["toolkit"])
    link = files.get("toolkit_link")
    if link:
        for root, dirs, fl in os.walk(cfg["vault"]):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            if link + ".md" in fl:
                return os.path.join(root, link + ".md")
    return None


def create_course(cfg, info):
    vault = cfg["vault"]
    lang = norm_lang(info.get("language"))
    label = LANGS[lang]["label"]
    ctype = "general" if (info.get("type") or "class").startswith("gen") else "class"
    name = (info.get("name") or (label + " track")).strip()
    short = slug(info.get("short") or name, 40)
    # existing Obsidian-style layouts keep working; new Libraries get a plain "Courses" folder
    legacy = "1_classes" if ctype == "class" else "2_coding"
    default_parent = legacy if os.path.isdir(os.path.join(vault, legacy)) else "Courses"
    rel = info.get("folder") or os.path.join(default_parent, slug(short.lower().replace(" ", "-"), 40))
    folder = safe_join(vault, rel)
    if os.path.exists(os.path.join(folder, "_course.md")):
        raise ValueError("A course already exists in that folder.")
    for sub in ("sessions", "practice", "materials"):
        os.makedirs(os.path.join(folder, sub), exist_ok=True)
    subs = {
        "{{NAME}}": name, "{{SHORT}}": short, "{{LANGUAGE}}": label,
        "{{TYPE}}": ctype, "{{GOAL}}": info.get("goal") or ("write " + label + " fluently from scratch"),
        "{{LEVEL}}": info.get("level") or "beginner",
        "{{ASSESSMENTS}}": info.get("assessments") or ("none (self-study)" if ctype == "general" else "(fill in)"),
        "{{RULES}}": info.get("rules") or "none",
        "{{FORMAT}}": info.get("format") or ("complete methods/functions (no main) unless the problem says otherwise"),
        "{{MINUTES}}": str(info.get("minutes") or 10),
        "{{TAG}}": re.sub(r"\W+", "", short.lower()) or "course",
    }
    made = []
    plan = [("_course.md", "_course.md"), ("Mastery Tracker.md", "Mastery Tracker.md"), ("Pattern Library.md", "Pattern Library.md"),
            ("Mistakes.md", short + " Mistakes.md"), ("Roadmap.md", "Roadmap.md")]
    if ctype == "class":
        plan.append(("Blueprint.md", short + " Blueprint.md"))
    for tpl, out in plan:
        text = read_text(os.path.join(TEMPLATES_DIR, tpl))
        for k, v in subs.items():
            text = text.replace(k, v)
        write_text(os.path.join(folder, out), text)
        made.append(out)
    existing = None
    for root, dirs, fl in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for n in fl:
            if n.lower() == (label + " toolkit.md").lower():
                existing = os.path.join(root, n)
                break
        if existing:
            break
    if existing:
        with open(os.path.join(folder, "_course.md"), "a", encoding="utf-8", newline="\n") as f:
            f.write("\n- Toolkit: [[%s]] (shared with other %s courses)\n" % (os.path.splitext(os.path.basename(existing))[0], label))
        made.append("linked " + os.path.basename(existing))
    else:
        text = read_text(os.path.join(TEMPLATES_DIR, "Toolkit.md")).replace("{{LANGUAGE}}", label)
        write_text(os.path.join(folder, label + " Toolkit.md"), text)
        made.append(label + " Toolkit.md")
    return {"folder": folder, "created": made}


# ---------------------------------------------------------------- markdown table helpers

def split_row(line):
    r"""Split a Markdown table row. `\|` is a literal pipe (also inside code), like Obsidian/GFM."""
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    cells, cur, i = [], "", 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s) and s[i + 1] == "|":
            cur += "\\|"
            i += 2
            continue
        if ch == "|":
            cells.append(cur.strip())
            cur = ""
        else:
            cur += ch
        i += 1
    cells.append(cur.strip())
    return cells


SEP_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")


def _is_row(line):
    return "|" in line and line.strip() != "" and not line.lstrip().startswith(">")


def parse_tables(text):
    """Find Markdown tables, with or without outer pipes; skips fenced code blocks."""
    lines = text.split("\n")
    tables, i, fence = [], 0, False
    while i < len(lines):
        if re.match(r"^\s*(```|~~~)", lines[i]):
            fence = not fence
            i += 1
            continue
        if not fence and _is_row(lines[i]) and i + 1 < len(lines) and SEP_RE.match(lines[i + 1]) and "-" in lines[i + 1]:
            header = split_row(lines[i])
            rows, j = [], i + 2
            while j < len(lines) and _is_row(lines[j]) and not SEP_RE.match(lines[j]):
                rows.append((j, split_row(lines[j])))
                j += 1
            tables.append({"start": i, "end": j, "header": header, "rows": rows})
            i = j
        else:
            i += 1
    return lines, tables


def norm_key(s):
    s = re.sub(r"\[\[([^\]|]+)(\|[^\]]*)?\]\]", r"\1", s or "")   # [[Maps|alias]] -> Maps
    s = s.replace("\\|", "|")
    return re.sub(r"[`*_\s]+", " ", s).strip().lower()


def find_col(header, name):
    n = norm_key(name)
    for i, h in enumerate(header):
        if norm_key(h) == n:
            return i
    for i, h in enumerate(header):
        hk = norm_key(h)
        if hk and (n in hk or hk in n):
            return i
    return None


def row_exists(path, key):
    lines, tables = parse_tables(read_text(path))
    return any(cells and norm_key(cells[0]) == norm_key(key) for t in tables for (ln, cells) in t["rows"])


TABLE_TEMPLATES = {
    "topic": "| Topic | Level | Mastered | Last practiced | Next review | Notes |\n| --- | --- | --- | --- | --- | --- |",
    "task": "| Task | Code | Status | Next review |\n| --- | --- | --- | --- |",
    "mistake": "| Mistake | Example | Fix | Times seen | Source |\n| --- | --- | --- | --- | --- |",
}


def ensure_table(path, key_col, title):
    """Make sure the note exists and has a table whose first column is key_col (creates/appends one if not)."""
    text = read_text(path)
    lines, tables = parse_tables(text)
    if any(t["header"] and norm_key(t["header"][0]) == key_col for t in tables):
        return
    tpl = TABLE_TEMPLATES[key_col]
    if not text.strip():
        text = "# %s\n\n%s\n" % (title, tpl)
    else:
        text = text.rstrip() + "\n\n" + tpl + "\n"
    write_text(path, text)


def upsert_row(path, key, values, increment=None):
    text = read_text(path)
    if not text:
        raise ValueError("note not found: " + os.path.basename(path))
    lines, tables = parse_tables(text)
    if not tables:
        raise ValueError("no table in " + os.path.basename(path))
    target = None
    for t in tables:
        for (ln, cells) in t["rows"]:
            if cells and norm_key(cells[0]) == norm_key(key):
                target = (t, ln, cells)
                break
        if target:
            break
    # always escape pipes: Obsidian splits table cells on | even inside `code`
    clean = lambda c: re.sub(r"(?<!\\)\|", r"\\|", str(c).replace("\n", " "))
    if target:
        t, ln, cells = target
        header = t["header"]
        cells = cells + [""] * (len(header) - len(cells))
        for col, val in values.items():
            idx = find_col(header, col)
            if idx is not None and val is not None and str(val) != "":
                cells[idx] = clean(val)
        if increment:
            idx = find_col(header, increment)
            if idx is not None:
                cells[idx] = str(int(re.sub(r"\D", "", cells[idx]) or 0) + 1)
        lines[ln] = "| " + " | ".join(cells) + " |"
        action = "updated"
    else:
        # the table this note is about = the one whose columns match best (not just the last table)
        def score(t):
            return sum(1 for col in list(values) + ([increment] if increment else []) if find_col(t["header"], col) is not None)
        t = max(tables, key=lambda t: (score(t), -tables.index(t)))
        header = t["header"]
        cells = [""] * len(header)
        cells[0] = clean(key)
        for col, val in values.items():
            idx = find_col(header, col)
            if idx is not None and idx != 0 and val is not None:
                cells[idx] = clean(val)
        if increment:
            idx = find_col(header, increment)
            if idx is not None:
                cells[idx] = "1"
        lines.insert(t["end"], "| " + " | ".join(cells) + " |")
        action = "added"
    write_text(path, "\n".join(lines))
    return action


def upsert_section(path, heading, markdown):
    text = read_text(path)
    heading = re.sub(r"^#+\s*", "", heading.strip())
    body = markdown.strip()
    first = body.split("\n", 1)
    if first and re.match(r"^#{1,6}\s*" + re.escape(heading) + r"\s*#*\s*$", first[0].strip(), re.I):
        body = first[1].strip() if len(first) > 1 else ""      # the model repeated the heading
    block = "## " + heading + "\n" + body + "\n"
    lines = text.split("\n")
    head_re = re.compile(r"^##\s+" + re.escape(heading) + r"\s*#*\s*$", re.I)
    start, fence = None, False
    for i, ln in enumerate(lines):
        if re.match(r"^\s*(```|~~~)", ln):
            fence = not fence
        elif not fence and head_re.match(ln.strip()):
            start = i
            break
    if start is not None:
        end, fence = len(lines), False
        for j in range(start + 1, len(lines)):
            if re.match(r"^\s*(```|~~~)", lines[j]):
                fence = not fence
            elif not fence and re.match(r"^#{1,2}\s", lines[j]):
                end = j
                break
        rest = "\n".join(lines[end:]).lstrip("\n")
        text = "\n".join(lines[:start]).rstrip("\n") + ("\n\n" if start else "") + block + ("\n" + rest if rest else "")
        action = "updated"
    else:
        text = (text.rstrip() + "\n\n" if text.strip() else "") + block
        action = "added"
    write_text(path, text)
    return action


def next_review(outcome, last_practiced, prev_next):
    """Expanding spaced-review schedule: pass -> roughly x2.5 the last gap (2, 5, 12, 30, 75... days);
    pass with help -> same gap again; fail -> due now. Dates can't be miscounted by the model."""
    if outcome == "fail":
        return "now"
    gap = 0
    try:
        gap = (dt.date.fromisoformat(prev_next) - dt.date.fromisoformat(last_practiced)).days
    except Exception:
        gap = 0
    if outcome == "pass":
        days = 2 if gap < 2 else min(180, int(round(gap * 2.5)))
    else:  # "hard": passed but needed help
        days = max(1, gap)
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def table_rows(text):
    out = []
    lines, tables = parse_tables(text or "")
    for t in tables:
        for (ln, cells) in t["rows"]:
            out.append(dict(zip([norm_key(h) for h in t["header"]], [c.replace("\\|", "|") for c in cells])))
    return out


# ---------------------------------------------------------------- materials

MATERIAL_TYPES = ["lesson", "slides", "practice-quiz", "quiz-feedback", "homework", "notes", "code", "other"]


def materials_root(folder):
    d = os.path.join(folder, "materials")
    os.makedirs(d, exist_ok=True)
    return d


def parse_front(text):
    meta, body = {}, text
    m = re.match(r"^---\n(.*?)\n---\n?", text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
        body = text[m.end():]
    return meta, body


def list_materials(folder):
    root = materials_root(folder)
    units = []
    def items_in(d, unit):
        out = []
        for n in sorted(os.listdir(d)):
            p = os.path.join(d, n)
            if os.path.isfile(p) and n.endswith(".md"):
                meta, body = parse_front(read_text(p))
                out.append({"path": relposix(p, root), "title": meta.get("title") or n[:-3], "type": meta.get("type", "other"),
                            "added": meta.get("added", ""), "chars": len(body), "unit": unit})
        return out
    loose = items_in(root, "")
    if loose:
        units.append({"name": "", "items": loose})
    for n in sorted(os.listdir(root)):
        p = os.path.join(root, n)
        if os.path.isdir(p) and not n.startswith(".") and n != "_trash":
            units.append({"name": n, "items": items_in(p, n)})
    return units


def save_material(folder, b):
    root = materials_root(folder)
    unit = slug(b.get("unit") or "", 60) if b.get("unit") else ""
    title = (b.get("title") or "Untitled").strip()
    mtype = b.get("type") if b.get("type") in MATERIAL_TYPES else "other"
    old = b.get("path")
    added = today()
    if old:
        old_path = safe_join(root, old)
        meta, _ = parse_front(read_text(old_path))
        added = meta.get("added") or added
    dest_dir = os.path.join(root, unit) if unit else root
    os.makedirs(dest_dir, exist_ok=True)
    fname = slug(title, 80) + ".md"
    dest = os.path.join(dest_dir, fname)
    if old and os.path.realpath(safe_join(root, old)) == os.path.realpath(dest):
        pass
    else:
        i = 2
        while os.path.exists(dest):
            dest = os.path.join(dest_dir, "%s (%d).md" % (slug(title, 76), i))
            i += 1
    text = "---\ntitle: %s\ntype: %s\nadded: %s\n%s---\n\n%s\n" % (title.replace("\n", " "), mtype, added,
                                                                  ("source: %s\n" % b["source"]) if b.get("source") else "",
                                                                  (b.get("content") or "").strip())
    write_text(dest, text)
    if old:
        op = safe_join(root, old)
        if os.path.realpath(op) != os.path.realpath(dest) and os.path.exists(op):
            os.remove(op)
    return relposix(dest, root)


def delete_material(folder, rel):
    root = materials_root(folder)
    p = safe_join(root, rel)
    trash = os.path.join(root, "_trash")
    os.makedirs(trash, exist_ok=True)
    dest = os.path.join(trash, "%s %s" % (dt.datetime.now().strftime("%Y%m%d-%H%M%S"), os.path.basename(p)))
    shutil.move(p, dest)
    return True


def unit_op(folder, b):
    root = materials_root(folder)
    if b["op"] == "create":
        os.makedirs(os.path.join(root, slug(b["name"], 60)), exist_ok=True)
    elif b["op"] == "rename":
        src = safe_join(root, b["name"])
        dst = os.path.join(root, slug(b["new_name"], 60))
        if os.path.exists(dst):
            raise ValueError("A unit with that name already exists.")
        os.rename(src, dst)
    elif b["op"] == "delete":
        p = safe_join(root, b["name"])
        if os.listdir(p):
            raise ValueError("Move or delete the materials in this unit first.")
        os.rmdir(p)
    return True


def xml_text(data, tag_para):
    """Pull visible text out of Office XML (docx/pptx)."""
    s = data.decode("utf-8", "replace")
    s = re.sub(r"</" + tag_para + r">", "\n", s)
    s = re.sub(r"<a:br/>|<w:br/>|<w:tab/>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s)


def extract_text(filename, raw):
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext == "docx":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            return xml_text(z.read("word/document.xml"), "w:p").strip()
    if ext == "pptx":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = sorted([n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)], key=lambda n: int(re.findall(r"\d+", n)[-1]))
            parts = []
            for i, n in enumerate(names, 1):
                txt = xml_text(z.read(n), "a:p").strip()
                notes_name = "ppt/notesSlides/notesSlide%d.xml" % i
                notes = xml_text(z.read(notes_name), "a:p").strip() if notes_name in z.namelist() else ""
                parts.append("## Slide %d\n%s%s" % (i, txt, ("\n\n*Notes:* " + notes) if notes else ""))
            return "\n\n".join(parts)
    if ext in ("html", "htm"):
        t = raw.decode("utf-8", "replace")
        t = re.sub(r"(?is)<(script|style).*?</\1>", "", t)
        t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</h\d>|</li>", "\n", t)
        return html.unescape(re.sub(r"<[^>]+>", "", t)).strip()
    if ext == "ipynb":
        nb = json.loads(raw.decode("utf-8"))
        out = []
        for c in nb.get("cells", []):
            src = "".join(c.get("source", []))
            out.append(("```python\n" + src + "\n```") if c.get("cell_type") == "code" else src)
        return "\n\n".join(out)
    if ext == "rtf" or ext == "doc":
        if shutil.which("textutil"):
            d = tempfile.mkdtemp()
            try:
                p = os.path.join(d, "in." + ext)
                with open(p, "wb") as f:
                    f.write(raw)
                subprocess.run(["textutil", "-convert", "txt", p], capture_output=True, timeout=30)
                return read_text(os.path.join(d, "in.txt"))
            finally:
                shutil.rmtree(d, ignore_errors=True)
    code_ext = {"java": "java", "py": "python", "cpp": "cpp", "cc": "cpp", "h": "cpp", "hpp": "cpp", "c": "c", "js": "javascript", "ts": "typescript", "go": "go", "rs": "rust"}
    t = raw.decode("utf-8", "replace")
    if ext in code_ext:
        return "```%s\n%s\n```" % (code_ext[ext], t)
    return t


# ---------------------------------------------------------------- running code

# ---------------------------------------------------------------- running code safely
# Student code - and code the AI runs with run_code, which the student never sees - runs with limits:
#  - every run is its own process group (Unix) / Job Object (Windows), so a timeout kills everything it started
#  - macOS + Linux: CPU time, file size and open-file limits; Linux also caps memory (Java gets -Xmx instead)
#  - macOS: the program itself (not the compiler) runs in a sandbox with no network and no writing outside its folder
#  - output goes to files, read back up to 1 MB, so a print loop can't fill the server's memory
RUN_LIMITS = {"fsize_mb": 50, "nofile": 256, "mem_mb": 1024, "win_mem_mb": 1536, "win_procs": 20}
OUTPUT_CAP = 1024 * 1024
JVM_HEAP = "-Xmx512m"

_LIMIT_SHIM = r"""
import os, sys, resource
cpu, fsize, nofile, mem = (int(x) for x in sys.argv[1:5])
def lim(name, v):
    r = getattr(resource, name, None)
    if r is None or v <= 0:
        return
    try:
        soft, hard = resource.getrlimit(r)
        if hard != resource.RLIM_INFINITY:
            v = min(v, hard)
        resource.setrlimit(r, (v, hard))
    except Exception:
        pass
lim("RLIMIT_CPU", cpu); lim("RLIMIT_FSIZE", fsize); lim("RLIMIT_NOFILE", nofile)
if sys.platform.startswith("linux"):
    lim("RLIMIT_AS", mem)
os.execvp(sys.argv[6], sys.argv[6:])
"""


def mac_sandbox_profile(folder):
    folder = os.path.realpath(folder)
    return """(version 1)
(allow default)
(deny network*)
(allow network* (local unix))
(deny file-write*)
(allow file-write* (subpath "%s") (subpath "/private/var/folders") (subpath "/private/tmp")
       (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/fd/"))
""" % folder.replace("\\", "\\\\").replace('"', '\\"')


SANDBOX_STATE = {"mac_ok": None}


def mac_sandbox_available():
    if SANDBOX_STATE["mac_ok"] is None:
        ok = sys.platform == "darwin" and os.path.exists("/usr/bin/sandbox-exec")
        if ok:
            try:
                ok = subprocess.run(["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)", "/usr/bin/true"],
                                    capture_output=True, timeout=10).returncode == 0
            except Exception:
                ok = False
            if not ok:
                print("note: macOS sandbox-exec isn't usable here - code runs with limits but without the sandbox")
        SANDBOX_STATE["mac_ok"] = ok
    return SANDBOX_STATE["mac_ok"]


def _win_job(proc_handle, mem_mb, max_procs):
    """Put a (suspended) Windows process in a Job Object: memory and process-count caps, kill everything on close."""
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.windll.kernel32

    class BASIC(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64), ("LimitFlags", wintypes.DWORD),
                    ("MinimumWorkingSetSize", ctypes.c_size_t), ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                    ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD), ("SchedulingClass", wintypes.DWORD)]

    class IO(ctypes.Structure):
        _fields_ = [(n, ctypes.c_uint64) for n in ("R", "W", "O", "RB", "WB", "OB")]

    class EXT(ctypes.Structure):
        _fields_ = [("Basic", BASIC), ("Io", IO), ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                    ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

    k32.CreateJobObjectW.restype = wintypes.HANDLE
    job = k32.CreateJobObjectW(None, None)
    if not job:
        return None
    info = EXT()
    # KILL_ON_JOB_CLOSE | DIE_ON_UNHANDLED_EXCEPTION (no crash dialogs) | JOB_MEMORY | ACTIVE_PROCESS
    info.Basic.LimitFlags = 0x2000 | 0x400 | 0x200 | 0x8
    info.Basic.ActiveProcessLimit = max_procs
    info.JobMemoryLimit = mem_mb * 1024 * 1024
    k32.SetInformationJobObject(wintypes.HANDLE(job), 9, ctypes.byref(info), ctypes.sizeof(info))
    if not k32.AssignProcessToJobObject(wintypes.HANDLE(job), wintypes.HANDLE(int(proc_handle))):
        k32.CloseHandle(wintypes.HANDLE(job))
        return None
    return job


def _win_resume(proc_handle):
    import ctypes
    from ctypes import wintypes
    ctypes.windll.ntdll.NtResumeProcess(wintypes.HANDLE(int(proc_handle)))


def _win_close_job(job, kill):
    import ctypes
    from ctypes import wintypes
    if kill:
        ctypes.windll.kernel32.TerminateJobObject(wintypes.HANDLE(job), 1)
    ctypes.windll.kernel32.CloseHandle(wintypes.HANDLE(job))


def run_proc(cmd, cwd, timeout, stdin_text=None, env=None, sandbox=False, mem_limit=True):
    """Run one step (compile or run). sandbox=True for running the program itself: stricter limits, and the macOS sandbox.
    mem_limit=False for runtimes that reserve lots of address space up front (Java, Node, Go) - Java gets -Xmx instead."""
    def clean(err):
        return "\n".join(l for l in (err or "").splitlines() if not l.startswith("Picked up JAVA_TOOL_OPTIONS"))
    full = list(cmd)
    kw = {}
    if WINDOWS:
        kw["creationflags"] = 0x00000200 | 0x08000000 | 0x00000004    # new process group | no window | start suspended
    else:
        kw["start_new_session"] = True
        cpu = int(timeout) * 4 + 10                                    # backstop only: the wall-clock timeout below is the real limit
        full = [python_exe(), "-I", "-S", "-c", _LIMIT_SHIM, str(cpu), str(RUN_LIMITS["fsize_mb"] * 1024 * 1024),
                str(RUN_LIMITS["nofile"]), str(RUN_LIMITS["mem_mb"] * 1024 * 1024 if sandbox and mem_limit and os.path.basename(cmd[0]) not in ("java", "node") else 0),
                "--"] + full
        if sandbox and mac_sandbox_available():
            full = ["/usr/bin/sandbox-exec", "-p", mac_sandbox_profile(cwd)] + full
    t0 = time.time()
    outf = tempfile.TemporaryFile(dir=cwd)
    errf = tempfile.TemporaryFile(dir=cwd)
    try:
        p = subprocess.Popen(full, cwd=cwd, stdin=subprocess.PIPE, stdout=outf, stderr=errf, env=env, **kw)
    except FileNotFoundError as e:
        return {"rc": -2, "out": "", "err": "Program not found: %s. Is it installed?" % (e.filename or cmd[0]), "timeout": False, "ms": 0}
    job = None
    if WINDOWS:
        try:
            job = _win_job(p._handle, RUN_LIMITS["win_mem_mb"], RUN_LIMITS["win_procs"])
        except Exception:
            job = None
        finally:
            try:
                _win_resume(p._handle)
            except Exception:
                pass
    timed_out = False
    try:
        try:
            p.communicate(input=(stdin_text or "").encode("utf-8"), timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            if WINDOWS:
                if job:
                    _win_close_job(job, True)
                    job = None
                else:
                    p.kill()
            else:
                try:
                    os.killpg(p.pid, 9)                                # the program and everything it started
                except Exception:
                    p.kill()
            p.communicate()
    finally:
        if job:
            _win_close_job(job, False)                                 # KILL_ON_JOB_CLOSE ends any leftovers
        if not WINDOWS and not timed_out:
            try:
                os.killpg(p.pid, 9)                                    # stray background children
            except Exception:
                pass

    def read(f):
        f.seek(0)
        data = f.read(OUTPUT_CAP + 1)
        f.close()
        text = data[:OUTPUT_CAP].decode("utf-8", "replace")
        return text + ("\n[output cut off after 1 MB]" if len(data) > OUTPUT_CAP else "")
    out, err = read(outf), read(errf)
    rc = p.returncode
    err = clean(err)
    if sandbox and not WINDOWS and re.search(r"Operation not permitted|Permission denied|PermissionError", err) and mac_sandbox_available():
        err += "\nBlocked: programs here can't use the internet or change files outside their own folder."
    if re.search(r"File too large|EFBIG", err):
        err += "\nStopped: the program printed or wrote more than %d MB." % RUN_LIMITS["fsize_mb"]
    if re.search(r"MemoryError|std::bad_alloc|OutOfMemoryError|Cannot allocate memory", err):
        err += "\nStopped: the program ran out of memory (limit %s)." % ("512 MB" if "OutOfMemoryError" in err else "about 1 GB")
    return {"rc": rc, "out": out, "err": err, "timeout": timed_out, "ms": int((time.time() - t0) * 1000)}


def fix_lines(stderr, filename, offset):
    """Make compiler errors point at the student's own line numbers."""
    def fix(m):
        return "line %d:" % max(int(m.group(1)) - offset, 1)
    msg = re.sub(r"(?:[^\s:]*[/\\])?" + re.escape(filename) + r":(\d+)(?::\d+)?:?", fix, stderr or "")
    # gcc/clang source excerpts ("   30 | code") -> student line numbers
    msg = re.sub(r"(?m)^(\s*)(\d+)( \|)", lambda m: m.group(1) + str(max(int(m.group(2)) - offset, 1)) + m.group(3), msg)
    keep = []
    for line in msg.splitlines():
        if re.match(r"^\s*at .*(node:internal|\(node:)", line) or re.match(r"^Node\.js v", line) or re.search(re.escape(filename) + r": In (function|member)", line):
            continue
        keep.append(line)
    return "\n".join(keep).strip()


def summarize_tests(r, extra_crash=""):
    out = r["out"] or ""
    m = re.search(r"RESULT (\d+)/(\d+)", out)
    passed, total = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    lines = [l for l in out.splitlines() if not l.startswith("RESULT ")]
    msg = "\n".join(lines)
    if r["timeout"]:
        msg += "\nTimed out - the next test (or your code) never finished. Infinite loop?"
    elif not m:
        crash = (r["err"] or "").strip()
        if crashed(r["rc"]):
            crash += "\nThe program crashed (%s). %s" % (crash_name(r["rc"]), extra_crash or "Often an out-of-bounds index or null/invalid pointer.")
        msg += ("\n" + crash) if crash else ""
    return {"ok": (not r["timeout"]) and total > 0 and passed == total, "stage": "run", "message": msg.strip(),
            "passed": passed, "total": total, "timed_out": r["timeout"], "ms": r["ms"]}


# --- Java
JAVA_IMPORTS = "import java.util.*;\nimport java.util.function.*;\nimport java.util.stream.*;\nimport java.time.*;\n"

JAVA_TEST_HELPERS = r'''
public class TestRunner {
    static int passed = 0, total = 0;
    static Solution s = new Solution();
    static String show(Object o) {
        if (o == null) return "null";
        if (o instanceof int[]) return Arrays.toString((int[]) o);
        if (o instanceof double[]) return Arrays.toString((double[]) o);
        if (o instanceof long[]) return Arrays.toString((long[]) o);
        if (o instanceof char[]) return Arrays.toString((char[]) o);
        if (o instanceof boolean[]) return Arrays.toString((boolean[]) o);
        if (o instanceof Object[]) return Arrays.deepToString((Object[]) o);
        if (o instanceof String) return "\"" + o + "\"";
        if (o instanceof Character) return "'" + o + "'";
        return String.valueOf(o);
    }
    static boolean same(Object a, Object b) {
        if (a == null || b == null) return a == b;
        if ((a instanceof Double || a instanceof Float || b instanceof Double || b instanceof Float) && a instanceof Number && b instanceof Number) {
            return Math.abs(((Number) a).doubleValue() - ((Number) b).doubleValue()) < 1e-6;
        }
        if (a instanceof Number && b instanceof Number) return ((Number) a).longValue() == ((Number) b).longValue();
        return Arrays.deepEquals(new Object[] {a}, new Object[] {b});
    }
    static void t(String label, Object expected, Supplier<Object> call) {
        total++;
        try {
            Object actual = call.get();
            if (same(expected, actual)) { passed++; System.out.println("PASS  " + label); }
            else System.out.println("FAIL  " + label + "  ->  expected " + show(expected) + " but got " + show(actual));
        } catch (Throwable e) { System.out.println("FAIL  " + label + "  ->  threw " + e); }
    }
    static void tThrows(String label, Runnable call) {
        total++;
        try { call.run(); System.out.println("FAIL  " + label + "  ->  expected an exception/assertion error but nothing was thrown"); }
        catch (Throwable e) { passed++; System.out.println("PASS  " + label + "  (threw " + e.getClass().getSimpleName() + ")"); }
    }
    static void tOut(String label, String expected, Runnable call) {
        total++;
        java.io.PrintStream old = System.out;
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        try { System.setOut(new java.io.PrintStream(buf)); call.run(); }
        catch (Throwable e) { System.setOut(old); System.out.println("FAIL  " + label + "  ->  threw " + e); return; }
        System.setOut(old);
        String got = buf.toString().replace("\r", "").trim();
        if (got.equals(expected.trim())) { passed++; System.out.println("PASS  " + label); }
        else System.out.println("FAIL  " + label + "  ->  expected output \"" + expected.trim() + "\" but printed \"" + got + "\"");
    }
    public static void main(String[] args) {
        try { tests(); } catch (Throwable e) { System.out.println("CRASH " + e); }
        System.out.println("RESULT " + passed + "/" + total);
    }
    static void tests() {
'''


def java_tests(code, tests, d):
    header = JAVA_IMPORTS + "\npublic class Solution {\n"
    off = header.count("\n")
    with open(os.path.join(d, "Solution.java"), "w", encoding="utf-8", newline="\n") as f:
        f.write(header + code + "\n}\n")
    with open(os.path.join(d, "TestRunner.java"), "w", encoding="utf-8", newline="\n") as f:
        f.write(JAVA_IMPORTS + JAVA_TEST_HELPERS + tests + "\n    }\n}\n")
    r = run_proc(["javac", "-nowarn", "-encoding", "UTF-8", "-d", ".", "Solution.java"], d, 40)
    if r["rc"] != 0:
        return {"ok": False, "stage": "compile", "message": fix_lines(r["err"], "Solution.java", off), "passed": 0, "total": 0}
    r = run_proc(["javac", "-nowarn", "-encoding", "UTF-8", "-cp", ".", "-d", ".", "TestRunner.java"], d, 40)
    if r["rc"] != 0:
        return {"ok": False, "stage": "test_compile", "message": "The TEST code did not compile (not your fault):\n" + r["err"].strip(), "passed": 0, "total": 0}
    return summarize_tests(run_proc(["java", "-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-ea", "-Xss64m", JVM_HEAP, "-cp", ".", "TestRunner"], d, 8, sandbox=True))


def java_snippet(code, stdin, d):
    code = re.sub(r"^\s*package\s+[\w.]+\s*;\s*$", "", code, flags=re.M)
    has_imports = bool(re.search(r"^\s*import\s", code, re.M))
    pub = re.search(r"public\s+(?:final\s+|abstract\s+)*class\s+(\w+)", code)
    if re.search(r"\bclass\s+\w+", code):
        name = pub.group(1) if pub else "Main"
        src = (JAVA_IMPORTS if not has_imports else "") + code
        off = 0 if has_imports else JAVA_IMPORTS.count("\n")
        main_cls = None
        for m in re.finditer(r"class\s+(\w+)", code):
            body_start = m.end()
            nxt = re.search(r"\bclass\s+\w+", code[body_start:])
            seg = code[body_start: body_start + (nxt.start() if nxt else len(code) - body_start)]
            if re.search(r"\bvoid\s+main\s*\(", seg):
                main_cls = m.group(1)
                break
        main_cls = main_cls or name
    elif re.search(r"\bvoid\s+main\s*\(", code):
        name = main_cls = "Main"
        src = JAVA_IMPORTS + "public class Main {\n" + code + "\n}\n"
        off = JAVA_IMPORTS.count("\n") + 1
    else:
        name = main_cls = "Main"
        src = JAVA_IMPORTS + "public class Main {\n    public static void main(String[] args) throws Exception {\n" + code + "\n    }\n}\n"
        off = JAVA_IMPORTS.count("\n") + 2
    fn = name + ".java"
    with open(os.path.join(d, fn), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    r = run_proc(["javac", "-nowarn", "-encoding", "UTF-8", "-d", ".", fn], d, 40)
    if r["rc"] != 0:
        return {"ok": False, "stdout": "", "stderr": fix_lines(r["err"], fn, off), "compile_error": True}
    return run_result(run_proc(["java", "-Dfile.encoding=UTF-8", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-ea", JVM_HEAP, "-cp", ".", main_cls], d, 10, stdin, sandbox=True))


# --- Python
PY_TEST_HELPERS = r'''
import io, contextlib, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # bundled Pythons don't add the script folder by themselves
sys.setrecursionlimit(10000)
from solution import *
_passed = 0
_total = 0
def _same(a, b):
    if isinstance(a, float) or isinstance(b, float):
        try:
            return abs(a - b) < 1e-6
        except Exception:
            return False
    return a == b
def t(label, expected, call):
    global _passed, _total
    _total += 1
    try:
        actual = call()
        if _same(expected, actual):
            _passed += 1; print("PASS  " + label)
        else:
            print("FAIL  " + label + "  ->  expected " + repr(expected) + " but got " + repr(actual))
    except Exception as e:
        print("FAIL  " + label + "  ->  raised " + repr(e))
def tThrows(label, call):
    global _passed, _total
    _total += 1
    try:
        call(); print("FAIL  " + label + "  ->  expected an exception but nothing was raised")
    except Exception as e:
        _passed += 1; print("PASS  " + label + "  (raised " + type(e).__name__ + ")")
def tOut(label, expected, call):
    global _passed, _total
    _total += 1
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            call()
    except Exception as e:
        print("FAIL  " + label + "  ->  raised " + repr(e)); return
    got = buf.getvalue().strip()
    if got == expected.strip():
        _passed += 1; print("PASS  " + label)
    else:
        print("FAIL  " + label + "  ->  expected output " + repr(expected.strip()) + " but printed " + repr(got))
'''


def python_tests(code, tests, d):
    with open(os.path.join(d, "solution.py"), "w", encoding="utf-8", newline="\n") as f:
        f.write(code + "\n")
    # tests run unchanged (no re-indenting, so multi-line strings stay intact) via exec inside a try
    with open(os.path.join(d, "tests_body.py"), "w", encoding="utf-8", newline="\n") as f:
        f.write(tests + "\n")
    with open(os.path.join(d, "tests.py"), "w", encoding="utf-8", newline="\n") as f:
        f.write(PY_TEST_HELPERS + "\ntry:\n    exec(compile(open('tests_body.py', encoding='utf-8').read(), 'tests', 'exec'), globals())\n"
                "except Exception as e:\n    print('CRASH ' + repr(e))\nprint('RESULT %d/%d' % (_passed, _total))\n")
    r = run_proc([python_exe(), "-c", "import sys\nsrc = open('solution.py', encoding='utf-8').read()\ntry:\n    compile(src, 'solution.py', 'exec')\n"
                  "except SyntaxError as e:\n    print('line %s: %s' % (e.lineno, e.msg), file=sys.stderr)\n"
                  "    if e.text: print('    ' + e.text.rstrip(), file=sys.stderr)\n    sys.exit(1)"], d, 20)
    if r["rc"] != 0:
        msg = (r["err"] or "Syntax error").strip()
        return {"ok": False, "stage": "compile", "message": msg, "passed": 0, "total": 0, "detail": msg}
    return summarize_tests(run_proc([python_exe(), "tests.py"], d, 8, sandbox=True))


def python_snippet(code, stdin, d):
    with open(os.path.join(d, "main.py"), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)
    return run_result(run_proc([python_exe(), "main.py"], d, 10, stdin, sandbox=True))


# --- C++
CPP_HEADER = """#include <iostream>
#include <sstream>
#include <iomanip>
#include <string>
#include <vector>
#include <array>
#include <map>
#include <unordered_map>
#include <set>
#include <unordered_set>
#include <queue>
#include <stack>
#include <deque>
#include <list>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <climits>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <utility>
#include <stdexcept>
#include <memory>
#include <cassert>
#include <optional>
using namespace std;
"""

CPP_TEST_HELPERS = r'''
namespace cct {
template <class T, class = void> struct is_iter : std::false_type {};
template <class T> struct is_iter<T, std::void_t<decltype(std::begin(std::declval<const T&>())), decltype(std::end(std::declval<const T&>()))>> : std::true_type {};
inline std::string show(const std::string& s) { return "\"" + s + "\""; }
inline std::string show(const char* s) { return s ? "\"" + std::string(s) + "\"" : "null"; }
inline std::string show(char c) { return std::string("'") + c + "'"; }
inline std::string show(bool b) { return b ? "true" : "false"; }
template <std::size_t N> std::string show(const char (&s)[N]) { return "\"" + std::string(s) + "\""; }
template <class T> std::string show(const T& v);
template <class A, class B> std::string show(const std::pair<A, B>& p) { return "(" + show(p.first) + ", " + show(p.second) + ")"; }
template <class T> std::string show(const std::optional<T>& o) { return o ? show(*o) : "nullopt"; }
template <class T> std::string show(const T& v) {
    if constexpr (std::is_arithmetic<T>::value) { std::ostringstream o; o << std::setprecision(10) << v; return o.str(); }
    else if constexpr (std::is_pointer<T>::value) { return v ? "<pointer>" : "nullptr"; }
    else if constexpr (is_iter<T>::value) {
        std::string s = "["; bool first = true;
        for (const auto& x : v) { if (!first) s += ", "; first = false; s += show(x); }
        return s + "]";
    } else { return "<value>"; }
}
template <class A, class B> bool same(const A& a, const B& b) {
    if constexpr (std::is_arithmetic<A>::value && std::is_arithmetic<B>::value) {
        if constexpr (std::is_floating_point<A>::value || std::is_floating_point<B>::value) return std::fabs((double)a - (double)b) < 1e-6;
        else return (long double)a == (long double)b;
    } else { return a == b; }
}
int passed = 0, total = 0;
template <class E, class F> void t(const std::string& label, const E& expected, F f) {
    total++;
    try {
        auto actual = f();
        if (same(expected, actual)) { passed++; std::cout << "PASS  " << label << std::endl; }
        else std::cout << "FAIL  " << label << "  ->  expected " << show(expected) << " but got " << show(actual) << std::endl;
    } catch (const std::exception& e) { std::cout << "FAIL  " << label << "  ->  threw " << e.what() << std::endl; }
    catch (...) { std::cout << "FAIL  " << label << "  ->  threw an exception" << std::endl; }
}
template <class F> void tThrows(const std::string& label, F f) {
    total++;
    try { f(); std::cout << "FAIL  " << label << "  ->  expected an exception but nothing was thrown" << std::endl; }
    catch (...) { passed++; std::cout << "PASS  " << label << "  (threw)" << std::endl; }
}
template <class F> void tOut(const std::string& label, const std::string& expected, F f) {
    total++;
    std::ostringstream buf; auto* old = std::cout.rdbuf(buf.rdbuf());
    try { f(); } catch (...) { std::cout.rdbuf(old); std::cout << "FAIL  " << label << "  ->  threw an exception" << std::endl; return; }
    std::cout.rdbuf(old);
    auto trim = [](std::string s) { while (!s.empty() && isspace((unsigned char)s.back())) s.pop_back(); size_t i = 0; while (i < s.size() && isspace((unsigned char)s[i])) i++; return s.substr(i); };
    std::string got = trim(buf.str()), exp = trim(expected);
    if (got == exp) { passed++; std::cout << "PASS  " << label << std::endl; }
    else std::cout << "FAIL  " << label << "  ->  expected output \"" << exp << "\" but printed \"" << got << "\"" << std::endl;
}
}
int main() {
    using namespace cct;
'''


def cpp_compiler():
    for c in ("c++", "g++", "clang++"):
        if shutil.which(c):
            return c
    return "c++"


def c_compiler():
    for c in ("cc", "gcc", "clang"):
        if shutil.which(c):
            return c
    return "cc"


def cpp_tests(code, tests, d):
    src = CPP_HEADER + code + "\n" + CPP_TEST_HELPERS + tests + "\n    std::cout << \"RESULT \" << cct::passed << \"/\" << cct::total << std::endl;\n    return 0;\n}\n"
    with open(os.path.join(d, "main.cpp"), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    student_end = CPP_HEADER.count("\n") + code.count("\n") + 1
    r = run_proc([cpp_compiler(), "-std=c++17", "-O0", "-w", "-o", PROG, "main.cpp"], d, 60)
    if r["rc"] != 0:
        errs = r["err"]
        nums = [int(x) for x in re.findall(r"main\.cpp:(\d+):", errs)]
        if nums and all(n > student_end for n in nums):
            return {"ok": False, "stage": "test_compile", "message": "The TEST code did not compile (check your function's name/signature matches the problem, or ask your coach):\n" + errs[:3000], "passed": 0, "total": 0}
        return {"ok": False, "stage": "compile", "message": fix_lines(errs, "main.cpp", CPP_HEADER.count("\n"))[:4000], "passed": 0, "total": 0}
    return summarize_tests(run_proc([os.path.join(d, PROG)], d, 8, sandbox=True))


def cpp_snippet(code, stdin, d):
    if re.search(r"\bint\s+main\s*\(", code):
        has_inc = "#include" in code
        src = (CPP_HEADER if not has_inc else "") + code
        off = 0 if has_inc else CPP_HEADER.count("\n")
    else:
        src = CPP_HEADER + "int main() {\n" + code + "\n    return 0;\n}\n"
        off = CPP_HEADER.count("\n") + 1
    with open(os.path.join(d, "main.cpp"), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    r = run_proc([cpp_compiler(), "-std=c++17", "-O0", "-Wall", "-o", PROG, "main.cpp"], d, 60)
    if r["rc"] != 0:
        return {"ok": False, "stdout": "", "stderr": fix_lines(r["err"], "main.cpp", off), "compile_error": True}
    res = run_result(run_proc([os.path.join(d, PROG)], d, 10, stdin, sandbox=True))
    warn = fix_lines(r["err"], "main.cpp", off)
    if warn:
        res["warnings"] = warn
    return res


# --- C
C_HEADER = "#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <math.h>\n#include <stdbool.h>\n#include <ctype.h>\n#include <limits.h>\n"
C_TEST_HELPERS = r'''
static int cc_passed = 0, cc_total = 0;
#define T_INT(label, expected, actual) do { long long e_ = (long long)(expected); long long a_ = (long long)(actual); cc_total++; \
  if (e_ == a_) { cc_passed++; printf("PASS  %s\n", label); } else printf("FAIL  %s  ->  expected %lld but got %lld\n", label, e_, a_); fflush(stdout); } while (0)
#define T_DBL(label, expected, actual) do { double e_ = (double)(expected); double a_ = (double)(actual); cc_total++; \
  if (fabs(e_ - a_) < 1e-6) { cc_passed++; printf("PASS  %s\n", label); } else printf("FAIL  %s  ->  expected %g but got %g\n", label, e_, a_); fflush(stdout); } while (0)
#define T_BOOL(label, expected, actual) do { int e_ = !!(expected); int a_ = !!(actual); cc_total++; \
  if (e_ == a_) { cc_passed++; printf("PASS  %s\n", label); } else printf("FAIL  %s  ->  expected %s but got %s\n", label, e_ ? "true" : "false", a_ ? "true" : "false"); fflush(stdout); } while (0)
#define T_STR(label, expected, actual) do { const char* e_ = (expected); const char* a_ = (actual); cc_total++; \
  if ((e_ == NULL && a_ == NULL) || (e_ && a_ && strcmp(e_, a_) == 0)) { cc_passed++; printf("PASS  %s\n", label); } \
  else printf("FAIL  %s  ->  expected \"%s\" but got \"%s\"\n", label, e_ ? e_ : "NULL", a_ ? a_ : "NULL"); fflush(stdout); } while (0)
int main(void) {
'''


def c_tests(code, tests, d):
    src = C_HEADER + code + "\n" + C_TEST_HELPERS + tests + "\n    printf(\"RESULT %d/%d\\n\", cc_passed, cc_total);\n    return 0;\n}\n"
    with open(os.path.join(d, "main.c"), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    student_end = C_HEADER.count("\n") + code.count("\n") + 1
    r = run_proc([c_compiler(), "-std=c11", "-O0", "-w", "-o", PROG, "main.c", "-lm"], d, 60)
    if r["rc"] != 0:
        nums = [int(x) for x in re.findall(r"main\.c:(\d+):", r["err"])]
        if nums and all(n > student_end for n in nums):
            return {"ok": False, "stage": "test_compile", "message": "The TEST code did not compile:\n" + r["err"][:3000], "passed": 0, "total": 0}
        return {"ok": False, "stage": "compile", "message": fix_lines(r["err"], "main.c", C_HEADER.count("\n"))[:4000], "passed": 0, "total": 0}
    return summarize_tests(run_proc([os.path.join(d, PROG)], d, 8, sandbox=True))


def c_snippet(code, stdin, d):
    if re.search(r"\bint\s+main\s*\(", code):
        has_inc = "#include" in code
        src, off = ((C_HEADER if not has_inc else "") + code), (0 if has_inc else C_HEADER.count("\n"))
    else:
        src = C_HEADER + "int main(void) {\n" + code + "\n    return 0;\n}\n"
        off = C_HEADER.count("\n") + 1
    with open(os.path.join(d, "main.c"), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    r = run_proc([c_compiler(), "-std=c11", "-O0", "-Wall", "-o", PROG, "main.c", "-lm"], d, 60)
    if r["rc"] != 0:
        return {"ok": False, "stdout": "", "stderr": fix_lines(r["err"], "main.c", off), "compile_error": True}
    res = run_result(run_proc([os.path.join(d, PROG)], d, 10, stdin, sandbox=True))
    warn = fix_lines(r["err"], "main.c", off)
    if warn:
        res["warnings"] = warn
    return res


# --- JavaScript
JS_TEST_HELPERS = r'''
;(function () {
const __u = require("util");
let __p = 0, __t = 0;
const show = (v) => __u.inspect(v, { depth: 6, breakLength: Infinity });
const same = (a, b) => (typeof a === "number" && typeof b === "number") ? (Math.abs(a - b) < 1e-6 || (Number.isNaN(a) && Number.isNaN(b))) : __u.isDeepStrictEqual(a, b);
global.t = function (label, expected, f) {
  __t++;
  try { const actual = f(); if (same(expected, actual)) { __p++; console.log("PASS  " + label); } else console.log("FAIL  " + label + "  ->  expected " + show(expected) + " but got " + show(actual)); }
  catch (e) { console.log("FAIL  " + label + "  ->  threw " + e); }
};
global.tThrows = function (label, f) { __t++; try { f(); console.log("FAIL  " + label + "  ->  expected an exception but nothing was thrown"); } catch (e) { __p++; console.log("PASS  " + label + "  (threw " + (e && e.name) + ")"); } };
global.tOut = function (label, expected, f) {
  __t++; const old = console.log; let buf = [];
  console.log = (...a) => buf.push(a.map((x) => typeof x === "string" ? x : show(x)).join(" "));
  try { f(); } catch (e) { console.log = old; console.log("FAIL  " + label + "  ->  threw " + e); return; }
  console.log = old; const got = buf.join("\n").trim();
  if (got === expected.trim()) { __p++; console.log("PASS  " + label); } else console.log("FAIL  " + label + "  ->  expected output " + JSON.stringify(expected.trim()) + " but printed " + JSON.stringify(got));
};
global.__finish = () => console.log("RESULT " + __p + "/" + __t);
})();
'''


def js_tests(code, tests, d):
    src = code + "\n" + JS_TEST_HELPERS + "try {\n" + tests + "\n} catch (e) { console.log('CRASH ' + e); }\n__finish();\n"
    with open(os.path.join(d, "main.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(src)
    r = run_proc(["node", "--check", "main.js"], d, 20)
    if r["rc"] != 0:
        return {"ok": False, "stage": "compile", "message": fix_lines(r["err"], "main.js", 0), "passed": 0, "total": 0}
    return summarize_tests(run_proc(["node", "--stack-size=8000", "main.js"], d, 8, sandbox=True))


def js_snippet(code, stdin, d):
    with open(os.path.join(d, "main.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)
    return run_result(run_proc(["node", "main.js"], d, 10, stdin, sandbox=True))


# --- Go / Rust (playground only)
def go_snippet(code, stdin, d):
    if "package main" not in code:
        code = "package main\n\nimport \"fmt\"\n\nfunc main() {\n" + code + "\n\t_ = fmt.Sprint()\n}\n"
    with open(os.path.join(d, "main.go"), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)
    env = dict(os.environ)
    env.setdefault("GOCACHE", os.path.join(LOCAL_DIR, "gocache"))
    env["GO111MODULE"] = "off"
    r = run_proc(["go", "build", "-o", PROG, "main.go"], d, 90, env=env)
    if r["rc"] != 0:
        return {"ok": False, "stdout": "", "stderr": fix_lines(r["err"], "main.go", 0), "compile_error": True}
    return run_result(run_proc([os.path.join(d, PROG)], d, 10, stdin, sandbox=True, mem_limit=False))


def rust_snippet(code, stdin, d):
    if not re.search(r"\bfn\s+main\s*\(", code):
        code = "fn main() {\n" + code + "\n}\n"
    with open(os.path.join(d, "main.rs"), "w", encoding="utf-8", newline="\n") as f:
        f.write(code)
    r = run_proc(["rustc", "-o", PROG, "main.rs"], d, 90)
    if r["rc"] != 0:
        return {"ok": False, "stdout": "", "stderr": r["err"].strip(), "compile_error": True}
    return run_result(run_proc([os.path.join(d, PROG)], d, 10, stdin, sandbox=True))


def run_result(r):
    res = {"ok": r["rc"] == 0 and not r["timeout"], "stdout": r["out"], "stderr": (r["err"] or "").strip(), "exit_code": r["rc"],
           "ms": r["ms"], "timed_out": r["timeout"]}
    if r["timeout"]:
        res["stderr"] = (res["stderr"] + "\nStopped after the time limit - infinite loop, or waiting for input? (Put input in the Input box.)").strip()
    elif crashed(r["rc"]):
        res["stderr"] = (res["stderr"] + "\nThe program crashed (%s)." % crash_name(r["rc"])).strip()
    return res


TEST_RUNNERS = {"java": java_tests, "python": python_tests, "cpp": cpp_tests, "c": c_tests, "javascript": js_tests}
SNIPPET_RUNNERS = {"java": java_snippet, "python": python_snippet, "cpp": cpp_snippet, "c": c_snippet, "javascript": js_snippet,
                   "go": go_snippet, "rust": rust_snippet}


def run_tests(lang, code, tests):
    lang = norm_lang(lang)
    if lang not in TEST_RUNNERS:
        return {"ok": False, "stage": "compile", "message": "Tests aren't supported for %s yet." % lang, "passed": 0, "total": 0}
    if not which_tool(lang):
        return {"ok": False, "stage": "compile", "message": "%s isn't installed on this computer." % LANGS[lang]["label"], "passed": 0, "total": 0}
    d = tempfile.mkdtemp(prefix="cc_")
    try:
        return TEST_RUNNERS[lang](code or "", tests or "", d)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def run_snippet(lang, code, stdin=""):
    lang = norm_lang(lang)
    if not which_tool(lang):
        return {"ok": False, "stdout": "", "stderr": "%s isn't installed on this computer." % LANGS[lang]["label"], "compile_error": True}
    d = tempfile.mkdtemp(prefix="cc_")
    try:
        return SNIPPET_RUNNERS[lang](code or "", stdin or "", d)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def changed_lines(a, b):
    al = [l.rstrip() for l in a.strip("\n").splitlines()]
    bl = [l.rstrip() for l in b.strip("\n").splitlines()]
    n = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, al, bl).get_opcodes():
        if tag != "equal":
            n += max(i2 - i1, j2 - j1)
    return n


# ---------------------------------------------------------------- LLM

def is_local(cfg):
    return parse_ai(cfg)["local"]


def llm_request(cfg, body):
    ai = parse_ai(cfg)
    if not body.get("model"):
        raise PermissionError("Pick a model in Settings > AI & coach.")
    key, _ = ai_key(cfg, ai)
    if not key and not ai["local"]:
        raise PermissionError("No %s API key yet. Open Settings > AI & coach and paste your key." % ai["label"])
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    if ai["id"] == "openrouter":
        headers.update({"HTTP-Referer": "https://github.com/codecoach-app", "X-Title": "CodeCoach"})
    return urllib.request.Request(ai["url"].rstrip("/") + "/chat/completions", data=json.dumps(body).encode("utf-8"), headers=headers)


def list_models(cfg, line):
    """Model ids a provider offers (its /models endpoint)."""
    ai = parse_ai(cfg, line)
    key, _ = ai_key(cfg, ai)
    req = urllib.request.Request(ai["url"].rstrip("/") + "/models", headers={"Authorization": "Bearer " + (key or "none")})
    with urlopen(req, 8) as r:
        data = json.loads(r.read().decode("utf-8"))
    return sorted({(m.get("id") or "").replace("models/", "") for m in data.get("data", []) if m.get("id")})


def http_error_text(e):
    detail = e.read().decode("utf-8", "replace")
    try:
        detail = json.loads(detail).get("error", {}).get("message", detail)
    except Exception:
        pass
    hint = {402: " (Not enough OpenRouter credits for this request: lower 'Max reply tokens' in Settings, add credits, or pick a free model.)",
            401: " (The API key was rejected. Re-paste it in Settings.)",
            429: " (Rate limited. Free models have daily limits; wait a bit or switch models.)",
            404: " (That model id wasn't found or doesn't support tools. Pick another in Settings.)"}.get(e.code, "")
    if e.code in (401, 402, 429) and "OpenRouter" in hint and "openrouter" not in (getattr(e, "url", "") or ""):
        hint = {401: " (The API key was rejected. Re-paste it in Settings > AI & coach.)", 402: " (Out of credit with this provider.)",
                429: " (Rate limited by the provider. Wait a bit or switch models.)"}[e.code]
    return "AI error %s: %s%s" % (e.code, detail, hint)


def needs_cache_marks(ai):
    """Models that only cache when asked to (Claude via OpenRouter). Others cache the repeated start of each request on their own."""
    return ai["id"] == "openrouter" and ai["model"].lower().startswith("anthropic/")


def with_cache_marks(messages):
    """Copy of the messages with two cache breakpoints: the system prompt (tools + system are cached for the whole session)
    and the newest plain-text message (so the growing history is cached too)."""
    out = [dict(m) for m in messages]
    def mark(m):
        if isinstance(m.get("content"), str) and m["content"]:
            m["content"] = [{"type": "text", "text": m["content"], "cache_control": {"type": "ephemeral"}}]
            return True
        return False
    if out and out[0].get("role") == "system":
        mark(out[0])
    for m in reversed(out[1:]):
        if m.get("role") in ("user", "assistant") and mark(m):
            break
    return out


def cache_stats(usage):
    """(tokens read from cache, tokens written to cache, $ saved) from any provider's usage block."""
    u = usage or {}
    det = u.get("prompt_tokens_details") or {}
    read = int(det.get("cached_tokens") or u.get("prompt_cache_hit_tokens") or u.get("cache_read_input_tokens") or 0)
    write = int(det.get("cache_write_tokens") or u.get("cache_creation_input_tokens") or 0)
    saved = float(u.get("cache_discount") or 0)
    return read, write, saved


def build_body(cfg, b, stream):
    ai = parse_ai(cfg)
    msgs = with_cache_marks(b["messages"]) if needs_cache_marks(ai) else b["messages"]
    body = {"model": ai["model"], "messages": msgs, "max_tokens": int(b.get("max_tokens") or cfg.get("max_tokens") or 8000)}
    if ai["id"] == "openrouter":
        body["usage"] = {"include": True}            # OpenRouter reports the cost of each call
    elif stream and ai["id"] in STREAM_USAGE:
        body["stream_options"] = {"include_usage": True}
    if b.get("tools"):
        body["tools"] = b["tools"]
        body["tool_choice"] = "auto"
    if stream:
        body["stream"] = True
    return body


def call_llm_once(cfg, b):
    try:
        req = llm_request(cfg, build_body(cfg, b, False))
        with urlopen(req, 600) as r:
            data = json.loads(r.read().decode("utf-8"))
    except PermissionError as e:
        return {"error": str(e)}
    except urllib.error.HTTPError as e:
        return {"error": http_error_text(e)}
    except Exception as e:
        return {"error": "Could not reach the AI service: %s" % e}
    if not data.get("choices"):
        return {"error": "Unexpected reply from the AI: %s" % json.dumps(data)[:500]}
    add_cost(cfg, data.get("usage"))
    log_usage(cfg, data.get("usage"), data.get("model"))
    return {"message": data["choices"][0].get("message", {}), "usage": data.get("usage", {}), "model": data.get("model")}


# ---------------------------------------------------------------- system prompt

LEARNER_TEMPLATE = """# Learner Profile

#codecoach

How I learn best. Shared by every course in CodeCoach; my coach reads it at the start of each session and adds what it notices.
Edit anything - this is mine.

## About me
- Background: (e.g. first programming class; did some Python in high school)
- Goals: (e.g. ace my intro CS quizzes; get comfortable writing code from scratch)
- Time I usually have per session: (e.g. 45 minutes)

## What works for me
- (my coach adds observations here, e.g. "Analogies first, then code" or "Needs syntax drills before writing from scratch")

## What doesn't work for me
- 

## Things I want my coach to remember
- 
"""


def learner_path(cfg):
    p = os.path.join(sync_dir(cfg), "Learner Profile.md")
    if not os.path.exists(p):
        write_text(p, LEARNER_TEMPLATE)
    return p


def build_system_prompt(cfg, folder, mode, topic, stats=None):
    stats = stats if stats is not None else {}
    stats.update({"full": 0, "sent": 0, "trimmed": {}})
    parts = [read_text(os.path.join(PROMPTS_DIR, "method.md"))]
    teach = read_text(os.path.expanduser(cfg.get("teach_skill_path") or ""))
    if teach:
        teach = re.sub(r"^---.*?---\s*", "", teach, flags=re.S)
        parts.append("# The teaching method (\"teach\" - the student's chosen method file; follow it, with the tool mapping above)\n\n" + teach)
    else:
        parts.append(read_text(os.path.join(PROMPTS_DIR, "teach_fallback.md")))
    meta = course_meta(folder)
    files = course_files(folder)
    try:
        parts.append("# LEARNER PROFILE (the student's own note + your observations; shared by all courses)\n\n" + read_text(learner_path(cfg), 6000))
    except Exception:
        pass
    ctx = ["# THE COURSE (snapshot of the student's notes at session start; your tool results show later changes)",
           "Course folder: " + folder,
           "Course type: %s. Language: %s." % (meta["type"], LANGS[meta["language"]]["label"]),
           "Today: %s (%s)" % (today(), dt.date.today().strftime("%A")),
           "Session type: %s%s" % (mode or "learn", ("; topic: " + topic) if topic else "")]
    terms = topic_terms(topic)
    stats["topic_terms"] = sorted(terms)
    def add_note(kind, title, text):
        trimmed, note = trim_notes(kind, text, terms, mode)
        stats["full"] += len(text)
        stats["sent"] += len(trimmed) + len(note)
        if note:
            stats["trimmed"][kind] = len(text) - len(trimmed)
        ctx.append("\n## %s note: %s\n\n%s%s" % (kind.upper(), title, trimmed, ("\n\n(" + note + ")") if note else ""))
    for kind, limit in (("profile", 8000), ("roadmap", 8000), ("blueprint", 24000), ("tracker", 8000), ("mistakes", 6000)):
        name = files.get(kind)
        if name:
            add_note(kind, name, read_text(os.path.join(folder, name), limit))
    tk = resolve_toolkit(folder, cfg)
    if tk:
        add_note("toolkit", os.path.basename(tk), read_text(tk, 10000))
    if files.get("patterns"):
        ptext = read_text(os.path.join(folder, files["patterns"]))
        heads = re.findall(r"^## (.+)$", ptext, re.M)
        block = "\n## PATTERN LIBRARY (entries so far): " + (", ".join(heads) or "none yet")
        related = [h for h in heads if mentions(h, terms)][:3]
        for h in related:                                   # full text of the patterns this session is about
            m = re.search(r"^## " + re.escape(h) + r"\s*\n(.*?)(?=^## |\Z)", ptext, re.M | re.S)
            if m:
                block += "\n\n### Pattern: %s\n%s" % (h, m.group(1).strip()[:3000])
        if heads:
            block += "\n(Full entries: read_note patterns.)"
        ctx.append(block)
    units = list_materials(folder)
    if any(u["items"] for u in units):
        items = [it for u in units for it in u["items"]]
        full_lines = ["- `%s` - %s (%s, %d chars)" % (it["path"], it["title"], it["type"], it["chars"]) for it in items]
        if len(items) > TRIM_AT["materials"]:
            newest_unit = max(items, key=lambda it: it.get("added") or "").get("unit", "")
            pick = [l for it, l in zip(items, full_lines) if mentions(it["title"] + " " + it["path"], terms) or it.get("unit", "") == newest_unit][:60]
            lines = pick + ["- ... %d more (call list_materials to see everything)" % (len(items) - len(pick))]
        else:
            lines = full_lines
        stats["full"] += sum(len(l) + 1 for l in full_lines)
        stats["sent"] += sum(len(l) + 1 for l in lines)
        if len(lines) != len(full_lines):
            stats["trimmed"]["materials"] = sum(len(l) + 1 for l in full_lines) - sum(len(l) + 1 for l in lines)
        ctx.append("\n## COURSE MATERIALS (read with read_material)\n" + "\n".join(lines[:150]))
    parts.append("\n".join(ctx))
    name = (cfg.get("coach_name") or "Coach").strip()[:40]
    if name.lower() != "coach":
        parts.insert(0, "Your name is %s. The student calls you %s; introduce yourself that way if it comes up." % (name, name))
    prompt = "\n\n---\n\n".join(p for p in parts if p)
    notes_full, notes_sent = stats["full"], stats["sent"]
    stats["total"] = len(prompt)
    stats["total_untrimmed"] = len(prompt) + (notes_full - notes_sent)
    return prompt



# ---------------------------------------------------------------- prompt trimming by relevance
# Notes go into the system prompt once per session. Big notes are trimmed to what this session needs; the coach can
# fetch any note in full with the read_note tool, and the prompt says what was left out.

STOPWORDS = set("""the and for with how what this that from into your you are all can use using about review learn drill session
practice problems problem content quiz quizzes questions question programming code coding write writing them they each other
other also some more less than then when where which while just like make made need want new old one two three four five
not no yes its it's his her their our out per via vs get put has default value values""".split())
TRIM_AT = {"tracker": 4000, "toolkit": 4000, "mistakes": 3000, "blueprint": 6000, "materials": 40}
GENERAL_BLUEPRINT = re.compile(r"rule|format|style|assert|null|check|quality|yellow box|package|allowed|addition|hint", re.I)


def topic_terms(topic):
    terms = set()
    for w in re.findall(r"[A-Za-z][A-Za-z0-9+#]*", topic or ""):
        parts = [w] + re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])", w)        # getOrDefault -> get, Or, Default; HashMap -> Hash, Map
        for x in parts:
            x = x.lower()
            if len(x) < 3 or x in STOPWORDS:
                continue
            terms.add(x[:-1] if len(x) >= 4 and x.endswith("s") and not x.endswith("ss") else x)     # maps -> map, strings -> string
    return terms


def mentions(text, terms):
    t = (text or "").lower()
    return any(term in t for term in terms)


def is_due(v):
    v = (v or "").strip().lower()
    return v == "now" or (re.match(r"^\d{4}-\d{2}-\d{2}$", v) is not None and v <= today())


def filter_table(text, keep):
    """Drop table rows for which keep(row) is False; everything else in the note stays. Returns (text, dropped rows)."""
    lines, tables = parse_tables(text or "")
    drop, dropped = set(), []
    for t in tables:
        keys = [norm_key(h) for h in t["header"]]
        for ln, cells in t["rows"]:
            row = dict(zip(keys, [c.replace("\\|", "|") for c in cells]))
            if not keep(row):
                drop.add(ln)
                dropped.append(row)
    return "\n".join(l for i, l in enumerate(lines) if i not in drop), dropped


def trim_blueprint(text, terms, mode):
    if mode == "quizsim" or len(text) <= TRIM_AT["blueprint"]:
        return text, 0
    chunks, cur = [], {"level": 0, "head": "", "body": []}
    for line in text.split("\n"):
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            chunks.append(cur)
            cur = {"level": len(m.group(1)), "head": m.group(2), "body": [line]}
        else:
            cur["body"].append(line)
    chunks.append(cur)
    out, parent_keep, parent_catalog, dropped = [], True, False, 0
    for c in chunks:
        if c["level"] <= 1:
            keep = True
        elif c["level"] == 2:
            keep = bool(GENERAL_BLUEPRINT.search(c["head"])) or mentions(c["head"], terms)
            parent_keep, parent_catalog = keep, bool(re.search(r"topic|archetype|by ", c["head"], re.I))
            if parent_catalog:
                keep = True                       # keep the heading of a by-topic catalog; its entries are filtered below
        else:
            keep = mentions(c["head"], terms) or (parent_keep and not parent_catalog)
        if keep:
            out.extend(c["body"])
        elif c["head"]:
            dropped += 1
    return "\n".join(out), dropped


def trim_notes(kind, text, terms, mode):
    """(text for the prompt, short note about what was left out)."""
    if kind == "tracker" and len(text) > TRIM_AT["tracker"]:
        text, gone = filter_table(text, lambda r: is_due(r.get("next review")) or "yes" not in (r.get("mastered") or "").lower()
                                  or mentions(r.get("topic"), terms))
        if gone:
            return text, "Mastered and not due (rows not shown): " + ", ".join(r.get("topic", "?") for r in gone)
    if kind == "toolkit" and len(text) > TRIM_AT["toolkit"]:
        text2, gone = filter_table(text, lambda r: re.search(r"new|shaky", (r.get("status") or ""), re.I) or is_due(r.get("next review"))
                                   or mentions((r.get("task") or "") + " " + (r.get("code") or ""), terms))
        if gone and len(table_rows(text2)) == 0:
            return text, ""                                         # nothing matched: keep the note as it is
        if gone:
            return text2, "%d solid toolkit rows not shown (read_note toolkit to see all)" % len(gone)
    if kind == "mistakes" and len(text) > TRIM_AT["mistakes"]:
        rows = table_rows(text)
        def times(r):
            try:
                return int(re.sub(r"\D", "", r.get("times seen") or "") or 0)
            except ValueError:
                return 0
        top = {id(r) for r in sorted(rows, key=times, reverse=True)[:10]}
        keys = {(r.get("mistake"), r.get("example")) for r in rows if id(r) in top}
        recent = (dt.date.today() - dt.timedelta(days=30)).isoformat()
        def seen_recently(r):                     # Source records the session date (e.g. "session 2026-10-06")
            d = re.findall(r"\d{4}-\d{2}-\d{2}", r.get("source") or "")
            return bool(d) and max(d) >= recent
        text, gone = filter_table(text, lambda r: (r.get("mistake"), r.get("example")) in keys or seen_recently(r) or mentions(" ".join(r.values()), terms))
        if gone:
            return text, "%d older, less frequent mistakes unrelated to this topic not shown (read_note mistakes to see all)" % len(gone)
    if kind == "blueprint":
        text, n = trim_blueprint(text, terms, mode)
        if n:
            return text, "%d blueprint sections unrelated to this session not shown (read_note blueprint to see all)" % n
    return text, ""

# ---------------------------------------------------------------- dashboard

def dashboard(cfg, folder):
    files = course_files(folder)
    tracker = table_rows(read_text(os.path.join(folder, files["tracker"]))) if files.get("tracker") else []
    tk_path = resolve_toolkit(folder, cfg)
    toolkit = table_rows(read_text(tk_path)) if tk_path else []
    def due(v):
        v = (v or "").strip().lower()
        return v == "now" or (re.match(r"^\d{4}-\d{2}-\d{2}$", v) is not None and v <= today())
    topics = [{"topic": r.get("topic", ""), "level": r.get("level", "?"), "mastered": r.get("mastered", "no"),
               "next": r.get("next review", ""), "due": due(r.get("next review"))} for r in tracker if r.get("topic")]
    tk = {"total": len(toolkit), "solid": sum(1 for r in toolkit if "solid" in (r.get("status") or "").lower()),
          "weak": sum(1 for r in toolkit if re.search(r"new|shaky", (r.get("status") or "").lower()) or due(r.get("next review")))}
    roadmap = read_text(os.path.join(folder, files["roadmap"])) if files.get("roadmap") else ""
    nxt = None
    for line in roadmap.splitlines():
        m = re.match(r"^\s*[-*]\s+\[ \]\s+(.+)$", line)
        if m:
            nxt = m.group(1).strip()
            break
    every = list_sessions(cfg, None)
    sessions = list_sessions(cfg, folder)                 # cheap: summaries come from the cache filled just above
    days = sorted({(s.get("updated") or "")[:10] for s in every if s.get("updated")}, reverse=True)
    streak, d = 0, dt.date.today()
    if days and days[0] != today():
        d = d - dt.timedelta(days=1)
    for day in days:
        if day == d.isoformat():
            streak += 1
            d -= dt.timedelta(days=1)
        elif day < d.isoformat():
            break
    usage = (read_state(os.path.join(sync_dir(cfg), "usage.md")) or {"days": {}})["days"]
    week = [(dt.date.today() - dt.timedelta(days=i)).isoformat() for i in range(7)]
    week_cost = sum(usage.get(x, {}).get("cost", 0) for x in week)
    solved = 0
    for s in sessions:
        if (s.get("updated") or "")[:10] in week:
            solved += s.get("solved", 0)
    return {"topics": topics, "toolkit": tk, "roadmap": roadmap, "next": nxt, "sessions": sessions[:8], "streak": streak,
            "week_cost": round(week_cost, 4), "today_cost": round(usage.get(today(), {}).get("cost", 0), 4), "week_solved": solved,
            "today_prompt": usage.get(today(), {}).get("prompt", 0), "today_cached": usage.get(today(), {}).get("cached", 0),
            "week_saved": round(sum(usage.get(x, {}).get("saved", 0) for x in week), 4),
            "estimated": any(usage.get(x, {}).get("estimated") for x in week),
            "unpriced": sum(usage.get(x, {}).get("unpriced", 0) for x in week),
            "prices_updated": load_prices().get("updated", "")}


SESSION_META = {}            # path -> ((mtime, size), summary): only new or changed session files are re-read
SESSION_META_LOCK = threading.Lock()


def session_summary(path):
    try:
        st = os.stat(path)
    except OSError:
        return None
    key = (st.st_mtime_ns, st.st_size)
    with SESSION_META_LOCK:
        hit = SESSION_META.get(path)
    if hit and hit[0] == key:
        return hit[1]
    s = read_state(path)
    summ = None
    if s:
        c = s.get("course", {}) or {}
        summ = {"id": s.get("id"), "title": s.get("title"), "mode": s.get("mode"), "updated": s.get("updated"),
                "course": c.get("name"), "folder": c.get("folder", ""), "rel": c.get("rel", ""),
                "file": os.path.basename(path), "rev": int(s.get("rev") or 0), "device": s.get("device", ""),
                "device_name": s.get("device_name", ""), "messages": len(s.get("messages", [])),
                "solved": sum(1 for p in s.get("problems", []) if p.get("status") == "solved"), "problems": len(s.get("problems", []))}
    with SESSION_META_LOCK:
        SESSION_META[path] = (key, summ)
    return summ


def session_copies(d, names=None):
    """Sync conflict copies, by session id. Dropbox ("x (conflicted copy).md"), iCloud ("x 2.md"), OneDrive ("x-LAPTOP.md"),
    Syncthing ("x.sync-conflict-....md") and others all keep the file's contents, so a copy is any session file whose
    name doesn't match the id inside it. A copy whose original is gone simply becomes the session again."""
    out = {}
    for n in sorted(names if names is not None else [x for x in os.listdir(d) if x.endswith(".md")]):
        s = session_summary(os.path.join(d, n))
        if not s or not s["id"] or n == s["id"] + ".md":
            continue
        sid = re.sub(r"[^\w\-]", "", s["id"])
        main = os.path.join(d, sid + ".md")
        if not os.path.exists(main):
            try:
                os.replace(os.path.join(d, n), main)
            except OSError:
                pass
            continue
        out.setdefault(sid, []).append(s)
    return out


def check_rev(cfg, cur, base_rev):
    """None if a save based on base_rev may overwrite cur; otherwise who changed it since (another computer)."""
    if not cur:
        return None
    me, _ = device(cfg)
    if int(cur.get("rev") or 0) > int(base_rev or 0) and cur.get("device") and cur.get("device") != me:
        return {"rev": int(cur.get("rev") or 0), "device_name": cur.get("device_name") or "another computer", "updated": cur.get("updated", "")}
    return None


def list_sessions(cfg, folder):
    d = os.path.join(sync_dir(cfg), "sessions")
    names = [n for n in os.listdir(d) if n.endswith(".md")]
    live = {os.path.join(d, n) for n in names}
    with SESSION_META_LOCK:                      # forget deleted / moved sessions
        for gone in [p for p in SESSION_META if p.startswith(d + os.sep) and p not in live]:
            del SESSION_META[gone]
    want = os.path.realpath(folder) if folder else None
    items = []
    copies = session_copies(d, names)
    if any(n not in names for n in os.listdir(d)):
        names = [n for n in os.listdir(d) if n.endswith(".md")]     # a lone copy was renamed back to its session
    for n in names:
        s = session_summary(os.path.join(d, n))
        if not s or n != (s["id"] or "") + ".md":
            continue                              # a sync conflict copy: shown with its session, not on its own
        if want and os.path.realpath(s["folder"]) != want:
            # courses can live at different absolute paths on different computers - match on the Library-relative part
            if not s["rel"] or os.path.realpath(from_rel(cfg["vault"], s["rel"])) != want:
                continue
        items.append(dict({k: s[k] for k in ("id", "title", "mode", "updated", "course", "solved", "problems")}, versions=len(copies.get(s["id"], []))))
    items.sort(key=lambda s: s.get("updated") or "", reverse=True)
    return items


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "CodeCoach/" + VERSION
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        pass

    def send_json(self, obj, code=200):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_bytes(self, data, ctype, cache=False):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")
        self.end_headers()
        self.wfile.write(data)

    def host_ok(self):
        return (self.headers.get("Host") or "").split(":")[0] in ("127.0.0.1", "localhost")

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}") if n else {}

    def check_course(self, folder, cfg):
        vault = os.path.realpath(cfg["vault"])
        real = os.path.realpath(folder or "")
        if not (real.startswith(vault + os.sep) or real == vault) or not os.path.exists(os.path.join(real, "_course.md")):
            raise ValueError("not a course folder inside the vault")
        return real

    # ---------------- GET
    def do_GET(self):
        if not self.host_ok():
            return self.send_json({"error": "bad host"}, 403)
        u = urlparse(self.path)
        p = u.path
        if p in ("/", "/index.html"):
            html_text = read_text(os.path.join(STATIC_DIR, "index.html")).replace("{{TOKEN}}", TOKEN).replace("{{VERSION}}", VERSION)
            return self.send_bytes(html_text.encode("utf-8"), "text/html; charset=utf-8")
        if p == "/api/ping":
            STATE["last_ping"] = time.monotonic()
            return self.send_json({"ok": True, "version": VERSION, "vault_ok": vault_readable(load_config())})
        if p.startswith("/vendor/"):
            return self.vendor(os.path.basename(p))
        if p.startswith("/static/"):
            try:
                fp = safe_join(STATIC_DIR, p[len("/static/"):])
            except ValueError:
                return self.send_json({"error": "bad path"}, 400)
            if not os.path.isfile(fp):
                return self.send_json({"error": "not found"}, 404)
            ctype = {"js": "application/javascript", "css": "text/css", "html": "text/html", "svg": "image/svg+xml",
                     "png": "image/png", "ico": "image/x-icon"}.get(fp.rsplit(".", 1)[-1], "application/octet-stream")
            with open(fp, "rb") as f:
                return self.send_bytes(f.read(), ctype)
        if self.headers.get("X-CC-Token") != TOKEN:
            return self.send_json({"error": "missing token"}, 403)
        STATE["last_ping"] = time.monotonic()
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        cfg = load_config()
        try:
            if p == "/api/state":
                key, src = find_api_key(cfg)
                vault_ok = os.path.isdir(cfg["vault"])
                ai = parse_ai(cfg)
                table = provider_table(cfg)
                return self.send_json({
                    "version": VERSION,
                    "config": {k: (("set" if v else "") if k == "local_key" else v) for k, v in cfg.items() if k not in ("api_key", "keys")},
                    "ai": {k: ai[k] for k in ("id", "label", "url", "model", "local", "line")},
                    "providers": [{"id": k, "label": v["label"], "url": v["url"], "local": v["local"], "key_url": v["key_url"], "key_env": v["key_env"],
                                   "has_key": bool(ai_key(cfg, dict(v, id=k))[0])} for k, v in table.items()],
                    "has_key": ai_ready(cfg), "openrouter_key": bool(key), "key_source": src,
                    "first_run": not os.path.exists(LOCAL_CONFIG) or not vault_ok,
                    "library": cfg["vault"], "default_library": DEFAULT_LIBRARY,
                    "packaged": PACKAGED, "obsidian": has_obsidian(),
                    "courses": find_courses(cfg["vault"]) if vault_ok else [],
                    "vault_exists": vault_ok,
                    "vault_readable": vault_readable(cfg),
                    "sync_dir": sync_dir(cfg) if vault_ok else "",
                    "teach_found": os.path.exists(os.path.expanduser(cfg.get("teach_skill_path") or "")),
                    "languages": {k: {"label": v["label"], "tests": v["tests"], "available": bool(which_tool(k))} for k, v in LANGS.items()},
                    "material_types": MATERIAL_TYPES,
                    "platform": sys.platform,
                    "suggested_models": suggested_models(),
                    "device": dict(zip(("id", "name"), device(cfg))),
                })
            if p == "/api/course":
                folder = self.check_course(q["folder"], cfg)
                files = course_files(folder)
                out = {}
                for k, n in files.items():
                    if n and k != "toolkit_link":
                        out[k] = {"name": n, "text": read_text(os.path.join(folder, n))}
                tk = resolve_toolkit(folder, cfg)
                if tk and "toolkit" not in out:
                    out["toolkit"] = {"name": os.path.basename(tk), "text": read_text(tk), "path": tk}
                lp = learner_path(cfg)
                out["learner"] = {"name": "Learner Profile.md", "text": read_text(lp), "path": lp, "learner": True}
                return self.send_json({"files": out, "meta": course_meta(folder), "rel": relposix(folder, cfg["vault"])})
            if p == "/api/dashboard":
                return self.send_json(dashboard(cfg, self.check_course(q["folder"], cfg)))
            if p == "/api/materials":
                return self.send_json({"units": list_materials(self.check_course(q["folder"], cfg))})
            if p == "/api/material":
                folder = self.check_course(q["folder"], cfg)
                meta, body = parse_front(read_text(safe_join(materials_root(folder), q["path"])))
                return self.send_json({"meta": meta, "content": body.strip()})
            if p == "/api/sessions":
                folder = self.check_course(q["folder"], cfg) if q.get("folder") else None
                return self.send_json({"sessions": list_sessions(cfg, folder)[:60]})
            if p == "/api/session":
                sid = re.sub(r"[^\w\-]", "", q["id"])
                s = read_state(os.path.join(sync_dir(cfg), "sessions", sid + ".md"))
                if not s:
                    raise ValueError("session not found")
                rel = s.get("course", {}).get("rel")
                if rel:  # re-anchor to this computer's vault path
                    s["course"]["folder"] = from_rel(cfg["vault"], rel)
                s["versions"] = [{k: c[k] for k in ("file", "updated", "rev", "device_name", "messages", "problems", "solved")}
                                 for c in session_copies(os.path.join(sync_dir(cfg), "sessions")).get(sid, [])]
                return self.send_json(s)
            if p == "/api/session/rev":
                sid = re.sub(r"[^\w\-]", "", q["id"])
                summ = session_summary(os.path.join(sync_dir(cfg), "sessions", sid + ".md")) or {}
                return self.send_json({k: summ.get(k) for k in ("rev", "device", "device_name", "updated")})
            if p == "/api/system_prompt":
                folder = self.check_course(q["folder"], cfg)
                stats = {}
                prompt = build_system_prompt(cfg, folder, q.get("mode"), q.get("topic"), stats)
                print("system prompt: %d chars (untrimmed %d) mode=%s topic=%r trimmed=%s" % (stats["total"], stats["total_untrimmed"], q.get("mode"), (q.get("topic") or "")[:60], stats["trimmed"]))
                return self.send_json({"prompt": prompt, "stats": {k: stats[k] for k in ("total", "total_untrimmed", "trimmed", "topic_terms")}})
            if p in ("/api/models", "/api/local_models"):
                line = q.get("ai") or (("x@" + q["base_url"]) if q.get("base_url") else None)
                ai = parse_ai(cfg, line)
                try:
                    return self.send_json({"ok": True, "models": list_models(cfg, line)})
                except urllib.error.HTTPError as e:
                    return self.send_json({"ok": False, "error": "%s answered %s%s" % (ai["label"], e.code, " - add your API key first" if e.code in (401, 403) else "")})
                except Exception as e:
                    return self.send_json({"ok": False, "error": "Couldn't reach %s (%s)%s" % (ai["url"], e, ". Is it running?" if ai["local"] else "")})
            if p == "/api/update":
                return self.send_json(update_status(cfg, force=q.get("force") == "1"))
            if p == "/api/snippets":
                d = os.path.join(sync_dir(cfg), "snippets")
                items = []
                for n in sorted(os.listdir(d)):
                    fp = os.path.join(d, n)
                    if os.path.isfile(fp) and not n.startswith("."):
                        items.append({"name": n, "updated": dt.datetime.fromtimestamp(os.path.getmtime(fp)).isoformat(timespec="minutes")})
                return self.send_json({"snippets": items})
            if p == "/api/snippet":
                return self.send_json({"code": read_text(safe_join(os.path.join(sync_dir(cfg), "snippets"), q["name"]))})
        except Exception as e:
            return self.send_json({"error": str(e)}, 400)
        return self.send_json({"error": "unknown endpoint"}, 404)

    def vendor(self, name):
        fp = os.path.join(VENDOR_DIR, name)
        if not os.path.exists(fp):
            fp = os.path.join(LOCAL_DIR, "vendor", name)    # the app bundle can be read-only: download next to settings
        failed = STATE.setdefault("vendor_fail", {})
        if not os.path.exists(fp) and name in VENDOR_SOURCES and time.monotonic() - failed.get(name, -1e9) > 600:
            failed[name] = time.monotonic()        # offline? don't retry this file for 10 minutes
            try:
                os.makedirs(os.path.dirname(fp), exist_ok=True)
                with urlopen(VENDOR_SOURCES[name], 15) as r:
                    data = r.read()
                write_bytes = fp + ".part"
                with open(write_bytes, "wb") as f:
                    f.write(data)
                os.replace(write_bytes, fp)
            except Exception:
                pass
        if not os.path.exists(fp):
            return self.send_json({"error": "vendor file unavailable"}, 404)
        with open(fp, "rb") as f:
            ctype = "text/css" if name.endswith(".css") else "font/woff2" if name.endswith(".woff2") else "application/javascript"
            return self.send_bytes(f.read(), ctype, cache=True)

    # ---------------- POST
    def do_POST(self):
        if not self.host_ok() or self.headers.get("X-CC-Token") != TOKEN:
            return self.send_json({"error": "forbidden"}, 403)
        STATE["last_ping"] = time.monotonic()
        p = urlparse(self.path).path
        cfg = load_config()
        try:
            b = self.body()
            if p == "/api/llm_stream":
                return self.llm_stream(cfg, b)
            if p == "/api/llm":
                STATE["inflight"] += 1
                try:
                    return self.send_json(call_llm_once(cfg, b))
                finally:
                    STATE["inflight"] -= 1
            if p == "/api/config":
                if isinstance(b.get("keys"), dict):
                    keys = dict(cfg.get("keys") or {})
                    for kk, kv in b["keys"].items():
                        kk = re.sub(r"[^\w\-]", "", str(kk).lower())
                        if kv:
                            keys[kk] = clean_key(kv)
                        else:
                            keys.pop(kk, None)
                    cfg["keys"] = keys
                if isinstance(b.get("ai"), str):
                    cfg["ai"] = b["ai"].strip()
                    a2 = parse_ai(cfg)
                    if a2["id"] == "openrouter":
                        cfg["model"] = a2["model"]         # keeps older CodeCoach versions in step
                if "check_updates" in b:
                    cfg["check_updates"] = bool(b["check_updates"])
                for k in ("vault", "model", "max_tokens", "teach_skill_path", "sync_dir", "compact_at", "auto_quit_minutes",
                          "coach_name", "provider", "base_url", "local_model", "local_key"):
                    if k in b and b[k] is not None:
                        v = b[k]
                        if k in ("vault", "teach_skill_path", "sync_dir") and v:
                            v = os.path.expanduser(v)
                        cfg[k] = v
                if b.get("api_key"):
                    cfg["api_key"] = clean_key(b["api_key"])
                if b.get("clear_key"):
                    cfg["api_key"] = ""
                    (cfg.get("keys") or {}).pop("openrouter", None)
                if "model" in b and "ai" not in b and parse_ai(cfg)["id"] == "openrouter":
                    cfg["ai"] = "openrouter:" + b["model"]   # quick model switch from the sidebar
                save_config(cfg)
                return self.send_json({"ok": True})
            if p == "/api/shutdown":
                self.send_json({"ok": True})
                threading.Timer(0.3, lambda: os._exit(0)).start()
                return
            if p == "/api/run_tests":
                return self.send_json(run_tests(b.get("language"), b.get("code", ""), b.get("tests", "")))
            if p == "/api/run_snippet":
                return self.send_json(run_snippet(b.get("language"), b.get("code", ""), b.get("stdin", "")))
            if p == "/api/changed_lines":
                return self.send_json({"changed": changed_lines(b.get("original", ""), b.get("code", ""))})
            if p == "/api/extract":
                raw = base64.b64decode(b["data"])
                return self.send_json({"text": extract_text(b.get("filename", "file.txt"), raw)})
            if p == "/api/course/create":
                return self.send_json(create_course(cfg, b))
            if p == "/api/session/save":
                sid = re.sub(r"[^\w\-]", "", b["id"])
                fp = os.path.join(sync_dir(cfg), "sessions", sid + ".md")
                cur = read_state(fp)
                clash = None if b.get("force") else check_rev(cfg, cur, b.get("rev"))
                if clash:                            # changed on another computer since this one loaded it: don't overwrite
                    return self.send_json({"error": "conflict", "conflict": clash}, 409)
                b.pop("force", None)
                b.pop("versions", None)
                b["rev"] = max(int((cur or {}).get("rev") or 0), int(b.get("rev") or 0)) + 1
                b["device"], b["device_name"] = device(cfg)
                b["updated"] = dt.datetime.now().isoformat(timespec="seconds")
                if b.get("course", {}).get("folder"):
                    try:
                        b["course"]["rel"] = relposix(b["course"]["folder"], cfg["vault"])
                    except ValueError:
                        pass
                write_state(fp, b)
                return self.send_json({"ok": True, "updated": b["updated"], "rev": b["rev"]})
            if p == "/api/learner/write":
                write_text(learner_path(cfg), b["text"])
                return self.send_json({"ok": True})
            if p == "/api/session/patch":
                # small "last second" save sent while the window closes (browsers cap those requests at 64 KB)
                sid = re.sub(r"[^\w\-]", "", b["id"])
                fp = os.path.join(sync_dir(cfg), "sessions", sid + ".md")
                st = read_state(fp)
                if not st:
                    return self.send_json({"ok": False})
                if "rev" in b and check_rev(cfg, st, b["rev"]):
                    return self.send_json({"ok": False, "conflict": True}, 409)
                st["rev"] = int(st.get("rev") or 0) + 1
                st["device"], st["device_name"] = device(cfg)
                for k in ("paused", "timer"):
                    if k in b:
                        st[k] = b[k]
                byid = {pp.get("id"): pp for pp in st.get("problems", [])}
                for pp in b.get("problems", []):
                    if pp.get("id") in byid:
                        byid[pp["id"]].update({k: v for k, v in pp.items() if k in ("code", "activeMs", "runningSince", "status", "solvedIn", "runs", "hints")})
                st["updated"] = dt.datetime.now().isoformat(timespec="seconds")
                write_state(fp, st)
                return self.send_json({"ok": True})
            if p == "/api/session/resolve":
                # what to do with a sync conflict copy: "use" it (the current one goes to trash), "keep_both" (it becomes
                # its own session), or "discard" it (to trash). Nothing is ever deleted outright.
                sid = re.sub(r"[^\w\-]", "", b["id"])
                d = os.path.join(sync_dir(cfg), "sessions")
                copy = os.path.join(d, os.path.basename(b["file"]))
                main = os.path.join(d, sid + ".md")
                cs = read_state(copy)
                if not cs or cs.get("id") != sid or copy == main:
                    raise ValueError("That version is gone (maybe already handled on another computer).")
                trash = os.path.join(sync_dir(cfg), "trash")
                os.makedirs(trash, exist_ok=True)
                stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
                action = b.get("action")
                if action == "use":
                    cs["rev"] = max(int(cs.get("rev") or 0), int((read_state(main) or {}).get("rev") or 0)) + 1
                    shutil.move(main, os.path.join(trash, "%s (replaced %s).md" % (sid, stamp)))
                    write_state(main, cs)
                    os.remove(copy)
                elif action == "keep_both":
                    nid = sid + "-" + secrets.token_hex(2)
                    cs.update(id=nid, rev=0, title=(cs.get("title") or "Session") + " (" + (cs.get("device_name") or "other copy") + ")")
                    write_state(os.path.join(d, nid + ".md"), cs)
                    os.remove(copy)
                elif action == "discard":
                    shutil.move(copy, os.path.join(trash, "%s (copy %s).md" % (sid, stamp)))
                else:
                    raise ValueError("unknown action")
                return self.send_json({"ok": True})
            if p == "/api/session/delete":
                sid = re.sub(r"[^\w\-]", "", b["id"])
                fp = os.path.join(sync_dir(cfg), "sessions", sid + ".md")
                trash = os.path.join(sync_dir(cfg), "trash")
                os.makedirs(trash, exist_ok=True)
                if os.path.exists(fp):
                    shutil.move(fp, os.path.join(trash, sid + ".md"))
                return self.send_json({"ok": True})
            if p == "/api/session/rename":
                sid = re.sub(r"[^\w\-]", "", b["id"])
                fp = os.path.join(sync_dir(cfg), "sessions", sid + ".md")
                s = read_state(fp)
                s["title"] = b["title"]
                write_state(fp, s)
                return self.send_json({"ok": True})
            if p == "/api/snippet/save":
                d = os.path.join(sync_dir(cfg), "snippets")
                name = slug(b["name"], 80)
                write_text(safe_join(d, name), b.get("code", ""))
                return self.send_json({"ok": True, "name": name})
            if p == "/api/snippet/delete":
                d = os.path.join(sync_dir(cfg), "snippets")
                fp = safe_join(d, b["name"])
                if os.path.exists(fp):
                    os.remove(fp)
                return self.send_json({"ok": True})
            if p == "/api/export":
                return self.export(cfg)
            if p == "/api/library/use":
                path = os.path.abspath(os.path.expanduser((b.get("path") or "").strip() or DEFAULT_LIBRARY))
                os.makedirs(path, exist_ok=True)
                cfg["vault"] = path
                save_config(cfg)
                ensure_library(cfg)
                return self.send_json({"ok": True, "library": path, "courses": len(find_courses(path))})
            if p == "/api/pick_folder":
                return self.send_json({"path": pick_folder(b.get("prompt") or "Choose your CodeCoach Library folder", b.get("start") or cfg["vault"])})
            if p == "/api/update/skip":
                skip_update(str(b.get("version") or ""))
                return self.send_json({"ok": True})
            if p == "/api/open":
                real = os.path.realpath(b.get("path") or "")
                lib = os.path.realpath(cfg["vault"])
                if not (real == lib or real.startswith(lib + os.sep)) or not os.path.exists(real):
                    raise ValueError("only files inside your Library can be opened")
                open_path(real)
                return self.send_json({"ok": True})
            if p == "/api/reveal":
                target = {"library": cfg["vault"], "data": sync_dir(cfg), "settings": LOCAL_DIR}.get(b.get("what") or "library", cfg["vault"])
                reveal(target)
                return self.send_json({"ok": True, "path": target})
            # ---- course-scoped operations
            folder = self.check_course(b.get("folder"), cfg)
            files = course_files(folder)
            if p == "/api/materials/save":
                return self.send_json({"path": save_material(folder, b)})
            if p == "/api/materials/delete":
                return self.send_json({"ok": delete_material(folder, b["path"])})
            if p == "/api/materials/unit":
                return self.send_json({"ok": unit_op(folder, b)})
            if p == "/api/note/write":
                name = os.path.basename(b["name"])
                target = safe_join(folder, name)
                if not name.endswith(".md"):
                    raise ValueError("only .md notes")
                write_text(target, b["text"])
                return self.send_json({"ok": True})
            if p == "/api/note/session_start":
                title = slug(b.get("title") or "session", 80)
                d = os.path.join(folder, "sessions")
                name = "%s %s.md" % (today(), title)
                i = 2
                while os.path.exists(os.path.join(d, name)):
                    name = "%s %s (%d).md" % (today(), title, i)
                    i += 1
                write_text(os.path.join(d, name), "# %s\n\n%s | %s session | CodeCoach\n\n" % (title, dt.datetime.now().strftime("%Y-%m-%d %H:%M"), b.get("mode", "Learn")))
                return self.send_json({"note": name})
            if p == "/api/note/append_session":
                path = os.path.join(folder, "sessions", os.path.basename(b["note"]))
                with open(path, "a", encoding="utf-8", newline="\n") as f:
                    f.write(b["markdown"].rstrip() + "\n\n")
                return self.send_json({"ok": True})
            if p == "/api/note/tracker":
                path = os.path.join(folder, files["tracker"] or "Mastery Tracker.md")
                ensure_table(path, "topic", "Mastery Tracker")
                nr = b.get("next_review")
                outcome = (b.get("review_outcome") or "").lower()
                if outcome in ("pass", "hard", "fail"):
                    old = next((r for r in table_rows(read_text(path)) if norm_key(r.get("topic")) == norm_key(b["topic"])), {})
                    nr = next_review(outcome, old.get("last practiced", ""), old.get("next review", ""))
                vals = {"Level": b.get("level"), "Mastered": b.get("mastered"), "Last practiced": b.get("last_practiced") or today(),
                        "Next review": nr, "Notes": b.get("notes")}
                res = upsert_row(path, b["topic"], vals)
                return self.send_json({"result": res, "next_review": nr})
            if p == "/api/note/toolkit":
                path = resolve_toolkit(folder, cfg)
                if not path:
                    meta = course_meta(folder)
                    path = os.path.join(folder, LANGS[meta["language"]]["label"] + " Toolkit.md")
                ensure_table(path, "task", os.path.splitext(os.path.basename(path))[0])
                return self.send_json({"result": upsert_row(path, b["task"], {"Code": b.get("code"), "Status": b.get("status"), "Next review": b.get("next_review")})})
            if p == "/api/note/mistake":
                path = os.path.join(folder, files["mistakes"] or (slug(course_meta(folder)["name"], 40) + " Mistakes.md"))
                ensure_table(path, "mistake", "Mistakes")
                src = b.get("source") or ("session " + today())
                vals = {"Source": src} if row_exists(path, b["mistake"]) else {"Example": b.get("example"), "Fix": b.get("fix"), "Source": src}
                return self.send_json({"result": upsert_row(path, b["mistake"], vals, increment="Times seen")})
            if p == "/api/note/pattern":
                return self.send_json({"result": upsert_section(os.path.join(folder, files["patterns"] or "Pattern Library.md"), b["name"], b["markdown"])})
            if p == "/api/note/learner":
                path = learner_path(cfg)
                return self.send_json({"result": upsert_section(path, b.get("section") or "What works for me", b["markdown"])})
            if p == "/api/note/blueprint":
                name = files.get("blueprint")
                if not name:
                    name = slug(course_meta(folder)["name"], 40) + " Blueprint.md"
                    write_text(os.path.join(folder, name), "# Blueprint\n\nWhat assessment problems look like.\n\n## Blueprint additions\n")
                with open(os.path.join(folder, name), "a", encoding="utf-8", newline="\n") as f:
                    f.write("\n### Added %s\n\n%s\n" % (today(), b["markdown"].strip()))
                return self.send_json({"result": "appended"})
            if p == "/api/note/roadmap":
                name = files.get("roadmap") or "Roadmap.md"
                write_text(os.path.join(folder, name), b["markdown"].strip() + "\n")
                return self.send_json({"result": "saved"})
            if p == "/api/note/read":
                kind = b.get("note") or ""
                if kind == "learner":
                    return self.send_json({"text": read_text(learner_path(cfg), 30000)})
                path = resolve_toolkit(folder, cfg) if kind == "toolkit" else (os.path.join(folder, files[kind]) if files.get(kind) else None)
                if not path:
                    return self.send_json({"error": "This course has no %s note." % kind})
                return self.send_json({"note": os.path.basename(path), "text": read_text(path, 30000)})
            if p == "/api/note/save_practice":
                topic = slug(b.get("topic") or "Practice", 50)
                name = re.sub(r"[^\w]", "", b.get("name") or "Problem") or "Problem"
                lang = norm_lang(b.get("language"))
                ext = LANGS[lang]["ext"]
                d = os.path.join(folder, "practice", topic)
                cm = "#" if lang == "python" else "//"
                head = "\n".join(cm + " " + l for l in (b.get("statement") or "").splitlines())
                write_text(os.path.join(d, name + "." + ext), head + "\n" + cm + " Result: " + (b.get("result") or "") + "\n\n" + (b.get("code") or "") + "\n")
                return self.send_json({"saved": relposix(os.path.join(d, name + "." + ext), folder)})
        except Exception as e:
            return self.send_json({"error": str(e)}, 400)
        return self.send_json({"error": "unknown endpoint"}, 404)

    def llm_stream(self, cfg, b):
        """Proxy OpenRouter's server-sent events straight to the browser."""
        STATE["inflight"] += 1
        try:
            try:
                req = llm_request(cfg, build_body(cfg, b, True))
                resp = urlopen(req, 600)
            except PermissionError as e:
                return self.send_json({"error": str(e)})
            except urllib.error.HTTPError as e:
                return self.send_json({"error": http_error_text(e)})
            except Exception as e:
                return self.send_json({"error": "Could not reach the AI service: %s" % e})
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            usage, model = None, None
            sent, other = 0, []
            try:
                for raw in resp:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line or line.startswith(":"):
                        continue
                    if not line.startswith("data:"):
                        other.append(line)            # e.g. a plain JSON error from a local server
                        continue
                    sent += 1
                    if line.startswith("data:"):
                        payload = line[5:].strip()
                        if payload != "[DONE]":
                            try:
                                obj = json.loads(payload)
                                if obj.get("usage"):
                                    usage, model = add_cost(cfg, obj["usage"]), obj.get("model")
                                    line = "data: " + json.dumps(obj)       # now with the (estimated) cost in it
                            except Exception:
                                pass
                        self.wfile.write((line + "\n").encode("utf-8"))
                        self.wfile.flush()
                if not sent and other:
                    msg = " ".join(other)[:800]
                    try:
                        j = json.loads(msg)
                        msg = (j.get("error") or {}).get("message") if isinstance(j.get("error"), dict) else (j.get("error") or msg)
                    except Exception:
                        pass
                    self.wfile.write(("data: " + json.dumps({"error": {"message": str(msg)}}) + "\n\n").encode("utf-8"))
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                resp.close()
                log_usage(cfg, usage, model)
        finally:
            STATE["inflight"] -= 1

    def export(self, cfg):
        """Export everything: one zip with every course (notes, materials, solutions, session logs), saved
        sessions, snippets, usage, learner profile, and your settings minus API keys. Plain files, readable anywhere."""
        tmp = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)
        seen = set()
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
            def add(fp, arc):
                arc = arc.replace(os.sep, "/")
                if arc in seen or not os.path.isfile(fp):
                    return
                seen.add(arc)
                z.write(fp, arc)
            sd = sync_dir(cfg)
            for root, dirs, fl in os.walk(sd):
                dirs[:] = [d for d in dirs if not d.startswith(".")]
                for n in fl:
                    fp = os.path.join(root, n)
                    add(fp, os.path.join("CodeCoach Library", "CodeCoach", os.path.relpath(fp, sd)))
            for c in find_courses(cfg["vault"]):
                for root, dirs, fl in os.walk(c["folder"]):
                    dirs[:] = [d for d in dirs if not d.startswith(".")]
                    for n in fl:
                        fp = os.path.join(root, n)
                        add(fp, os.path.join("CodeCoach Library", c["rel"], os.path.relpath(fp, c["folder"])))
            readme = os.path.join(cfg["vault"], "README - CodeCoach Library.md")
            add(readme, "CodeCoach Library/README - CodeCoach Library.md")
            safe = {k: v for k, v in cfg.items() if k not in ("api_key", "keys", "local_key", "vault", "sync_dir", "teach_skill_path")}
            z.writestr("settings (no API keys).json", json.dumps(safe, indent=2))
            z.writestr("HOW TO RESTORE.txt", "This is a complete CodeCoach export (%s).\n\n"
                       "Everything is plain Markdown - open it in any text editor or in Obsidian.\n\n"
                       "To restore or move to another computer: unzip, then in CodeCoach open Settings > Library & sync\n"
                       "and choose the unzipped 'CodeCoach Library' folder. Paste your API key again (keys are never exported).\n" % today())
        size = tmp.tell()
        tmp.seek(0)
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", "attachment; filename=CodeCoach-export-%s.zip" % today())
        self.send_header("Content-Length", str(size))
        self.end_headers()
        shutil.copyfileobj(tmp, self.wfile)
        tmp.close()


def parent_alive(pid):
    if not pid:
        return True
    if WINDOWS:
        try:
            import ctypes
            h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)    # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                return False
            code = ctypes.c_ulong()
            ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
            ctypes.windll.kernel32.CloseHandle(h)
            return code.value == 259                                       # STILL_ACTIVE
        except Exception:
            return True
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except Exception:
        return True


def watchdog(minutes_fn, parent_pid=0):
    """Quit by itself when its app window is gone (or no window has pinged for a while), so nothing keeps running."""
    while True:
        time.sleep(20)
        if not parent_alive(parent_pid):
            os._exit(0)
        mins = minutes_fn()
        if mins and mins > 0 and STATE["inflight"] == 0 and time.monotonic() - STATE["last_ping"] > max(mins * 60, 180):
            os._exit(0)


def take_over_port(port, force=False):
    """An older CodeCoach still on our port? Ask it to quit so this version can start.
    force: replace it even when it's the same version (an app window starting its own server)."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/ping" % port, timeout=1.5) as r:
            info = json.loads(r.read().decode("utf-8"))
        if not info.get("ok"):
            return False
        if info.get("version") == VERSION and not force:
            return "same"
        with urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=2) as r:
            m = re.search(r'CC_TOKEN\s*=\s*"([0-9a-f]+)"', r.read().decode("utf-8", "replace"))
        if m:
            req = urllib.request.Request("http://127.0.0.1:%d/api/shutdown" % port, data=b"{}",
                                         headers={"X-CC-Token": m.group(1), "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=2).read()
            time.sleep(0.8)
            return True
    except Exception:
        pass
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--parent-pid", type=int, default=0, help="quit when this process (the app window) exits")
    a = ap.parse_args()
    if sys.stdout is None or sys.stderr is None:          # windowless (pythonw.exe): keep a log file instead
        os.makedirs(LOCAL_DIR, exist_ok=True)
        sys.stdout = sys.stderr = open(os.path.join(LOCAL_DIR, "server.log"), "w", encoding="utf-8", buffering=1)
    cfg = load_config()
    if os.path.exists(os.path.join(APP_DIR, "launch.sh")):        # source-folder install: remembered for CodeCoach.app
        try:
            write_text(os.path.join(LOCAL_DIR, "app_path"), APP_DIR)
        except Exception:
            pass
    if os.path.isdir(cfg["vault"]):
        try:
            migrate_v1_sessions(cfg)
        except Exception:
            pass
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    except OSError:
        if take_over_port(a.port, force=bool(a.parent_pid)) == "same":
            print("CodeCoach %s is already running at http://127.0.0.1:%d/" % (VERSION, a.port))
            if not a.no_browser:
                webbrowser.open("http://127.0.0.1:%d/" % a.port)
            return
        srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    srv.daemon_threads = True
    url = "http://127.0.0.1:%d/" % a.port
    print("CodeCoach %s is running at %s" % (VERSION, url))
    # with an app window as parent, the server lives exactly as long as the window; otherwise it auto-quits when idle
    threading.Thread(target=watchdog, args=((lambda: 0) if a.parent_pid else (lambda: load_config().get("auto_quit_minutes", 20)), a.parent_pid), daemon=True).start()
    if not parse_ai(cfg)["local"]:
        refresh_prices()                  # cloud AI: keep the price list (cost estimates, sidebar models) a day fresh
    if not a.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever(poll_interval=2.0)     # fewer idle wake-ups than the 0.5 s default
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

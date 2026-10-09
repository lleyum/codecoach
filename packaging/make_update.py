#!/usr/bin/env python3
"""Make the one-click update files for a release from a staged app folder (see packaging/stage.py).

    python3 packaging/make_update.py <staged app dir> <out dir>

Writes <out>/CodeCoach-update.zip (CodeCoach's own code: server, pages, prompts, templates, editor files) and
<out>/CodeCoach-update.json (version, SHA-256, size, the oldest app shell it runs on). The app downloads the JSON,
then the zip, checks the checksum and unpacks it into ~/.codecoach/app/<version>.
"""
import hashlib
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
with open(os.path.join(src, "static", "build.json"), encoding="utf-8") as f:
    version = json.load(f).get("version") or server.VERSION
manifest = {"version": version, "min_shell": server.SHELL_VERSION}
os.makedirs(out, exist_ok=True)
zpath = os.path.join(out, "CodeCoach-update.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__" and not d.startswith("."))
        for n in sorted(files):
            if n.endswith(".pyc") or n.startswith("."):
                continue
            fp = os.path.join(root, n)
            z.write(fp, os.path.relpath(fp, src).replace(os.sep, "/"))
    z.writestr("manifest.json", json.dumps(manifest))
data = open(zpath, "rb").read()
with open(os.path.join(out, "CodeCoach-update.json"), "w", encoding="utf-8") as f:
    json.dump(dict(manifest, sha256=hashlib.sha256(data).hexdigest(), size=len(data)), f)
print("update %s: %s (%d KB)" % (version, zpath, len(data) // 1024))

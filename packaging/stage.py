#!/usr/bin/env python3
"""Copy the files the CodeCoach app needs into <dest> (used by every platform build).

    python3 packaging/stage.py <dest> [--repo owner/name] [--version v3.0.0]
"""
import argparse
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP = ["server.py", "prompts", "templates", "static", "LICENSE", "README.md"]

ap = argparse.ArgumentParser()
ap.add_argument("dest")
ap.add_argument("--repo", default="")
ap.add_argument("--version", default="")
a = ap.parse_args()

if os.path.exists(a.dest):
    shutil.rmtree(a.dest)
os.makedirs(a.dest)
ignore = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", "*.part")
for n in KEEP:
    src = os.path.join(ROOT, n)
    if os.path.isdir(src):
        shutil.copytree(src, os.path.join(a.dest, n), ignore=ignore)
    elif os.path.exists(src):
        shutil.copy2(src, os.path.join(a.dest, n))
vendor = os.path.join(a.dest, "static", "vendor")
missing = []
sys.path.insert(0, ROOT)
import server  # noqa: E402
for name in server.VENDOR_SOURCES:
    if not os.path.exists(os.path.join(vendor, name)):
        missing.append(name)
if missing:
    sys.exit("static/vendor is incomplete - run packaging/fetch_vendor.py first. Missing: " + ", ".join(missing))
with open(os.path.join(a.dest, "static", "build.json"), "w") as f:
    json.dump({"repo": a.repo, "version": a.version or server.VERSION, "shell": server.SHELL_VERSION}, f)
print("staged CodeCoach %s into %s" % (a.version or server.VERSION, a.dest))

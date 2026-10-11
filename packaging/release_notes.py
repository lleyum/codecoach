#!/usr/bin/env python3
"""Print the GitHub release notes for a version: its section of static/changelog.md, then the download instructions.

    python3 packaging/release_notes.py v3.5.0 > notes.md
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
version = (sys.argv[1] if len(sys.argv) > 1 else "").lstrip("v")
text = open(os.path.join(ROOT, "static", "changelog.md"), encoding="utf-8").read()
m = re.search(r"^## " + re.escape(version) + r"\b[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
print("## What's new\n\n" + (m.group(1).strip() if m else "Fixes and improvements.") + "\n")
print("""## Download for your computer

Already have CodeCoach 3.4 or newer? Use **Update available > Update now** inside the app instead.

- **Mac (Apple Silicon - M1 and later):** CodeCoach-macOS-AppleSilicon.dmg
- **Mac (Intel):** CodeCoach-macOS-Intel.dmg
- **Windows:** CodeCoach-Windows-Setup.exe (or the portable CodeCoach-Windows.zip)
- **Linux:** CodeCoach-Linux.tar.gz, then run `./install.sh`

First launch on a Mac: if macOS says CodeCoach can't be opened, go to System Settings > Privacy & Security > Open Anyway (the app isn't notarized by Apple yet).
Your data stays in your own Library folder - updating never touches it.""")

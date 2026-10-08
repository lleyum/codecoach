#!/usr/bin/env python3
"""Download the editor, PDF, diagram and font files CodeCoach uses into static/vendor, so the
downloadable app works offline from the first launch (and never calls a CDN at runtime).

    python3 packaging/fetch_vendor.py            # into ./static/vendor
    python3 packaging/fetch_vendor.py <dir>      # somewhere else
"""
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402  (only reads VENDOR_SOURCES)

dest = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "static", "vendor")
os.makedirs(dest, exist_ok=True)
failed = []
for name, url in sorted(server.VENDOR_SOURCES.items()):
    path = os.path.join(dest, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CodeCoach-build"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(path, "wb") as f:
            f.write(data)
        print("  %-28s %7d KB" % (name, len(data) // 1024))
    except Exception as e:
        failed.append(name)
        print("  %-28s FAILED (%s)" % (name, e))
if failed:
    sys.exit("Could not download: " + ", ".join(failed))
print("vendor files ready in", dest)

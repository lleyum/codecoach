#!/bin/bash
# Build dist/CodeCoach-Linux.tar.gz (uses the system's python3 at runtime; nothing else to install).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${VERSION:-$(python3 -c "import re;print(re.search(r'VERSION = \"([^\"]+)\"', open('$ROOT/server.py').read()).group(1))")}"
OUT="$ROOT/dist"; PKG="$OUT/work-linux/CodeCoach"
rm -rf "$OUT/work-linux"; mkdir -p "$PKG"
${SKIP_VENDOR:+true} python3 "$ROOT/packaging/fetch_vendor.py"
python3 "$ROOT/packaging/stage.py" "$PKG/app" --repo "${REPO:-}" --version "$VERSION"
cp "$ROOT/packaging/linux/codecoach" "$ROOT/packaging/linux/install.sh" "$PKG/"
cp "$ROOT/static/icon.png" "$PKG/codecoach.png"
chmod +x "$PKG/codecoach" "$PKG/install.sh"
printf 'CodeCoach %s for Linux\n\n  ./install.sh   adds CodeCoach to your app menu (no root needed)\n  ./codecoach    or just run it from here\n\nNeeds python3. Your notes live in the Library folder you choose; settings and API keys in ~/.codecoach\n' "$VERSION" > "$PKG/README.txt"
tar -czf "$OUT/CodeCoach-Linux.tar.gz" -C "$OUT/work-linux" CodeCoach
python3 "$ROOT/packaging/make_update.py" "$PKG/app" "$OUT"        # one-click update files (same code for every platform)
echo "== done: $OUT/CodeCoach-Linux.tar.gz ($(du -h "$OUT/CodeCoach-Linux.tar.gz" | cut -f1))"

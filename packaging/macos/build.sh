#!/bin/bash
# Build the downloadable macOS app: dist/CodeCoach.app and dist/CodeCoach-macOS-<arch>.dmg
# Runs on a Mac with Xcode command line tools (xcode-select --install). Needs internet the first time
# (it downloads a private copy of Python, so people who install CodeCoach don't need Python at all).
#
#   packaging/macos/build.sh                 # this Mac's architecture
#   ARCH=x86_64 packaging/macos/build.sh     # Intel build (works from an Apple Silicon Mac too)
#
# Optional, for a signed + notarized app (no Gatekeeper warning): set MAC_SIGN_IDENTITY
# ("Developer ID Application: ...") and NOTARY_PROFILE (a `xcrun notarytool store-credentials` profile).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ARCH="${ARCH:-$(uname -m)}"                       # arm64 | x86_64
case "$ARCH" in arm64) PBS_ARCH=aarch64; NICE=AppleSilicon ;; x86_64) PBS_ARCH=x86_64; NICE=Intel ;; *) echo "unknown ARCH $ARCH"; exit 1 ;; esac
PYMINOR="${PYMINOR:-3.12}"
VERSION="${VERSION:-$(python3 -c "import re;print(re.search(r'VERSION = \"([^\"]+)\"', open('$ROOT/server.py').read()).group(1))")}"
REPO="${REPO:-}"
OUT="$ROOT/dist"
WORK="$OUT/work-mac-$ARCH"
APP="$WORK/CodeCoach.app"
echo "== CodeCoach $VERSION for macOS ($ARCH)"
rm -rf "$WORK"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$OUT"

# 1. app files (+ editor/font files, so it works offline)
python3 "$ROOT/packaging/fetch_vendor.py"
python3 "$ROOT/packaging/stage.py" "$APP/Contents/Resources/app" --repo "$REPO" --version "$VERSION"

# 2. a private Python (python-build-standalone) so nothing else needs installing
CACHE="$OUT/cache"; mkdir -p "$CACHE"
TARBALL="$(ls "$CACHE"/cpython-"$PYMINOR".*-"$PBS_ARCH"-apple-darwin-install_only*.tar.gz 2>/dev/null | head -1 || true)"
if [ -z "$TARBALL" ]; then
  echo "-- finding the latest Python $PYMINOR build"
  API="$(curl -fsSL ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest || true)"
  # asset names contain "+", which the API returns URL-encoded as %2B
  URL="$(printf '%s' "$API" | grep -oE "https://[^\"]*cpython-$PYMINOR\.[0-9]+(\+|%2B)[0-9]+-$PBS_ARCH-apple-darwin-install_only_stripped\.tar\.gz" | head -1 || true)"
  [ -n "$URL" ] || URL="$(printf '%s' "$API" | grep -oE "https://[^\"]*cpython-$PYMINOR\.[0-9]+(\+|%2B)[0-9]+-$PBS_ARCH-apple-darwin-install_only\.tar\.gz" | head -1 || true)"
  [ -n "$URL" ] || { echo "couldn't find a Python build to bundle"; exit 1; }
  TARBALL="$CACHE/$(basename "$URL" | sed 's/%2B/+/g')"
  curl -fL --retry 3 -o "$TARBALL" "$URL"
fi
tar -xzf "$TARBALL" -C "$APP/Contents/Resources"          # -> Resources/python
PYLIB="$(ls -d "$APP/Contents/Resources/python/lib/python$PYMINOR")"
rm -rf "$PYLIB"/{test,idlelib,tkinter,turtledemo,ensurepip,lib2to3,pydoc_data} "$PYLIB"/site-packages/* \
       "$APP/Contents/Resources/python/share" "$APP/Contents/Resources/python/include" 2>/dev/null || true
find "$APP/Contents/Resources/python" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$APP/Contents/Resources/python/lib" -name "libtcl*" -o -name "libtk*" | xargs rm -rf 2>/dev/null || true
if [ "$ARCH" = "$(uname -m)" ]; then
  "$APP/Contents/Resources/python/bin/python3" -c "import ssl, json, zipfile, sqlite3; print('-- bundled Python', __import__('sys').version.split()[0], 'ok')"
fi

# 3. the native window (the app's main program)
xcrun swiftc -O -target "$ARCH-apple-macos11.3" -o "$APP/Contents/MacOS/CodeCoach" \
  "$ROOT/native/CodeCoachWindow.swift" -framework Cocoa -framework WebKit
cp "$ROOT/CodeCoach.app/Contents/Resources/CodeCoach.icns" "$APP/Contents/Resources/CodeCoach.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>CodeCoach</string>
  <key>CFBundleDisplayName</key><string>CodeCoach</string>
  <key>CFBundleIdentifier</key><string>app.codecoach.CodeCoach</string>
  <key>CFBundleVersion</key><string>${VERSION#v}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION#v}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>CodeCoach</string>
  <key>CFBundleIconFile</key><string>CodeCoach</string>
  <key>LSMinimumSystemVersion</key><string>11.3</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSDocumentsFolderUsageDescription</key><string>CodeCoach keeps your notes and progress in your Library folder.</string>
  <key>NSDesktopFolderUsageDescription</key><string>CodeCoach keeps your notes and progress in your Library folder.</string>
  <key>NSDownloadsFolderUsageDescription</key><string>CodeCoach saves exports to your Downloads folder.</string>
</dict></plist>
PLIST

# 4. sign (ad-hoc unless a Developer ID is given) and package
if [ -n "${MAC_SIGN_IDENTITY:-}" ]; then
  find "$APP/Contents/Resources/python" -type f \( -perm -u+x -o -name "*.dylib" -o -name "*.so" \) -print0 \
    | xargs -0 codesign --force --timestamp --options runtime --entitlements "$ROOT/packaging/macos/entitlements.plist" -s "$MAC_SIGN_IDENTITY"
  codesign --force --timestamp --options runtime --entitlements "$ROOT/packaging/macos/entitlements.plist" -s "$MAC_SIGN_IDENTITY" "$APP"
else
  codesign --force --deep -s - "$APP"
fi
codesign --verify --deep "$APP" && echo "-- signature ok"

DMG="$OUT/CodeCoach-macOS-$NICE.dmg"
rm -f "$DMG"
STAGE="$WORK/dmg"; mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
# hdiutil fails now and then on CI machines ("Resource busy"): try a few times
for i in 1 2 3; do
  if hdiutil create -volname "CodeCoach" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null; then break; fi
  [ "$i" = 3 ] && { echo "hdiutil failed 3 times"; exit 1; }
  echo "-- hdiutil failed, retrying in 5s"; sleep 5
done
if [ -n "${MAC_SIGN_IDENTITY:-}" ] && [ -n "${NOTARY_PROFILE:-}" ]; then
  codesign -s "$MAC_SIGN_IDENTITY" "$DMG"
  xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$DMG"
fi
rm -rf "$OUT/CodeCoach.app"; cp -R "$APP" "$OUT/CodeCoach.app"
echo "== done: $DMG ($(du -h "$DMG" | cut -f1))"

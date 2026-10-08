#!/bin/bash
# If macOS started us under Rosetta (Intel emulation), switch back to the native Apple Silicon mode.
if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = "1" ]; then exec /usr/bin/arch -arm64 /bin/bash "$0" "$@"; fi
# Shared launcher: start the CodeCoach server (if needed) and open its window.
# Used by CodeCoach.app (2nd arg "app"), CodeCoach.command and codecoach.sh.
PORT="${CODECOACH_PORT:-8765}"
URL="http://127.0.0.1:$PORT/"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:/usr/local/go/bin:$HOME/.local/bin:$PATH"
DIR="$1"
FROM_APP="$2"
if [ -z "$DIR" ] || [ ! -f "$DIR/server.py" ]; then
  [ -f "$HOME/.codecoach/app_path" ] && DIR="$(cat "$HOME/.codecoach/app_path")"
fi
[ -f "$DIR/server.py" ] || DIR="$HOME/learn/CodeCoach"
MAC=0; [ "$(uname)" = "Darwin" ] && MAC=1

alert() { if [ $MAC = 1 ]; then osascript -e "display alert \"$1\" message \"$2\"" >/dev/null 2>&1; else echo "$1: $2"; fi; }
WIN_APP="$HOME/.codecoach/CodeCoach Window.app"
# Build CodeCoach's own native window once (needs Apple's command line tools; falls back to a browser).
build_window() {
  local SRC="$DIR/native/CodeCoachWindow.swift" BIN="$WIN_APP/Contents/MacOS/CodeCoachWindow"
  [ -f "$SRC" ] || return 1
  if [ -x "$BIN" ] && [ "$BIN" -nt "$SRC" ] && [ "$BIN" -nt "$DIR/launch.sh" ]; then return 0; fi
  [ -f "$HOME/.codecoach/window-build-failed" ] && [ "$HOME/.codecoach/window-build-failed" -nt "$SRC" ] && return 1
  xcrun -f swiftc >/dev/null 2>&1 || return 1
  osascript -e 'display notification "Setting up the CodeCoach window (first launch only, about 20 seconds)..." with title "CodeCoach"' >/dev/null 2>&1
  mkdir -p "$WIN_APP/Contents/MacOS" "$WIN_APP/Contents/Resources"
  if ! xcrun swiftc -O -o "$BIN.tmp" "$SRC" -framework Cocoa -framework WebKit >"$HOME/.codecoach/window-build.log" 2>&1; then
    touch "$HOME/.codecoach/window-build-failed"; rm -f "$BIN.tmp"; return 1
  fi
  mv -f "$BIN.tmp" "$BIN"
  cp -f "$DIR/CodeCoach.app/Contents/Resources/CodeCoach.icns" "$WIN_APP/Contents/Resources/CodeCoach.icns" 2>/dev/null
  cat >"$WIN_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>CodeCoach</string>
  <key>CFBundleDisplayName</key><string>CodeCoach</string>
  <key>CFBundleIdentifier</key><string>local.codecoach.window</string>
  <key>CFBundleVersion</key><string>3.0</string>
  <key>CFBundleShortVersionString</key><string>3.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>CodeCoachWindow</string>
  <key>CFBundleIconFile</key><string>CodeCoach</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
  codesign --force --sign - "$WIN_APP" >/dev/null 2>&1
  rm -f "$HOME/.codecoach/window-build-failed"
  return 0
}
open_ui() {
  if [ $MAC = 1 ]; then
    if build_window; then open "$WIN_APP" --args "$URL"; return; fi
    if [ -d "/Applications/Google Chrome.app" ]; then open -na "Google Chrome" --args --app="$URL" --new-window
    elif [ -d "/Applications/Microsoft Edge.app" ]; then open -na "Microsoft Edge" --args --app="$URL" --new-window
    elif [ -d "/Applications/Brave Browser.app" ]; then open -na "Brave Browser" --args --app="$URL" --new-window
    else open "$URL"; fi
  else
    for b in google-chrome chromium chromium-browser microsoft-edge brave-browser; do
      command -v "$b" >/dev/null 2>&1 && { "$b" --app="$URL" >/dev/null 2>&1 & return; }
    done
    xdg-open "$URL" >/dev/null 2>&1 &
  fi
}
ping_body() { curl -s --max-time 1 "${URL}api/ping" 2>/dev/null; }
stop_server() { lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; sleep 0.6; }
via_terminal() {
  # macOS privacy rules can stop an app from reading ~/Documents. Terminal already has that
  # permission, so start the server from Terminal instead.
  open -a Terminal "$DIR/CodeCoach.command"
  exit 0
}

# Already running?
B="$(ping_body)"
WANT="$(grep -m1 '^VERSION = ' "$DIR/server.py" 2>/dev/null | sed 's/.*"\(.*\)".*/\1/')"
if echo "$B" | grep -q '"ok"'; then
  if echo "$B" | grep -q '"vault_ok": true' && echo "$B" | grep -q "\"version\": \"$WANT\""; then open_ui; exit 0; fi
  stop_server   # an older version, or one that can't read the Library - restart it
fi

PY="$(command -v python3)"
if [ -z "$PY" ]; then alert "CodeCoach needs Python 3" "Open Terminal and run:  xcode-select --install   then open CodeCoach again."; exit 1; fi
if [ ! -f "$DIR/server.py" ]; then alert "CodeCoach files not found" "Keep CodeCoach.app inside the CodeCoach folder (next to server.py)."; exit 1; fi

if [ $MAC = 1 ] && [ "$FROM_APP" = "app" ] && [ -f "$HOME/.codecoach/config.json" ]; then
  VAULT="$("$PY" -c 'import json,os;print(json.load(open(os.path.expanduser("~/.codecoach/config.json"))).get("vault",""))' 2>/dev/null)"
  if [ -n "$VAULT" ] && [ -d "$VAULT" ] && ! ls "$VAULT" >/dev/null 2>&1; then via_terminal; fi
fi

mkdir -p "$HOME/.codecoach"
cd "$DIR" || exit 1
nohup "$PY" -B server.py --port "$PORT" --no-browser >"$HOME/.codecoach/server.log" 2>&1 &
for i in $(seq 1 60); do ping_body | grep -q '"ok"' && break; sleep 0.2; done
B="$(ping_body)"
if ! echo "$B" | grep -q '"ok"'; then
  alert "CodeCoach could not start" "Details are in ~/.codecoach/server.log"
  exit 1
fi
if [ $MAC = 1 ] && echo "$B" | grep -q '"vault_ok": false'; then
  if [ "$FROM_APP" = "app" ]; then stop_server; via_terminal; fi
  alert "CodeCoach can't read your vault" "macOS is blocking access. Open System Settings > Privacy & Security > Files and Folders and allow Terminal to access Documents, then open CodeCoach again."
fi
open_ui

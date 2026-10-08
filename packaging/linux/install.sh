#!/bin/bash
# Install CodeCoach for this user: ~/.local/share/codecoach + an app-menu entry. No root needed.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/codecoach/app-files"
rm -rf "$DEST"; mkdir -p "$DEST" "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/256x256/apps"
cp -R "$HERE/app" "$HERE/codecoach" "$DEST/"
chmod +x "$DEST/codecoach"
ln -sf "$DEST/codecoach" "$HOME/.local/bin/codecoach"
cp "$HERE/codecoach.png" "$HOME/.local/share/icons/hicolor/256x256/apps/codecoach.png"
cat > "$HOME/.local/share/applications/codecoach.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=CodeCoach
Comment=Learn to code with a coach that teaches, drills and remembers
Exec=$DEST/codecoach
Icon=codecoach
Categories=Education;Development;
StartupWMClass=CodeCoach
DESK
command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
echo "CodeCoach installed. Open it from your app menu, or run: codecoach"

#!/bin/bash
# Double-click to start CodeCoach (same as CodeCoach.app).
DIR="$(cd "$(dirname "$0")" && pwd)"
/bin/bash "$DIR/launch.sh" "$DIR"
echo ""
echo "CodeCoach is running in its own window. You can close this Terminal window."

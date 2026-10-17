#!/bin/sh
# Creates ~/Applications/Stepwise.app, which opens Stepwise in its own window
# (Chrome or Edge "app mode"), so you can launch it from Spotlight, Launchpad or the Dock.
#
#   ./scripts/install-mac-launcher.sh                    # uses Chrome, else Edge
#   ./scripts/install-mac-launcher.sh "Microsoft Edge"   # pick a browser
#
# The app only points at index.html in this folder. If you move the folder, run this again.
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="file://$(printf '%s' "$DIR/index.html" | sed 's/ /%20/g')"

BROWSER="$1"
if [ -z "$BROWSER" ]; then
  if [ -d "/Applications/Google Chrome.app" ]; then BROWSER="Google Chrome"
  elif [ -d "/Applications/Microsoft Edge.app" ]; then BROWSER="Microsoft Edge"
  else echo "Stepwise needs Google Chrome or Microsoft Edge (for opening folders)." >&2; exit 1
  fi
fi

APP="$HOME/Applications/Stepwise.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/launch.applescript" <<EOF
do shell script "open -na " & quoted form of "$BROWSER" & " --args " & quoted form of "--app=$URL"
EOF

mkdir -p "$HOME/Applications"
if [ -d "$APP" ]; then
  # Only replace a launcher this script made.
  grep -q "install-mac-launcher" "$APP/Contents/Info.plist" 2>/dev/null || { echo "$APP exists and wasn't made by this script. Leaving it alone." >&2; exit 1; }
  rm -rf "$APP"
fi
osacompile -o "$APP" "$WORK/launch.applescript"
/usr/libexec/PlistBuddy -c "Add :StepwiseLauncher string install-mac-launcher" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$APP/Contents/Info.plist"

# Icon: render assets/icon.svg into an .icns. Skipped quietly if any tool is missing.
if qlmanage -t -s 1024 -o "$WORK" "$DIR/assets/icon.svg" >/dev/null 2>&1 && [ -f "$WORK/icon.svg.png" ]; then
  SET="$WORK/Stepwise.iconset"
  mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$WORK/icon.svg.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$WORK/icon.svg.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/applet.icns" && touch "$APP"
fi

# Editing the bundle invalidates the signature osacompile made, so sign it again (ad hoc, local only).
codesign --force --sign - "$APP" 2>/dev/null

echo "Installed $APP (opens in $BROWSER). Search Spotlight for \"Stepwise\"."

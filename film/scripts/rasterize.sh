#!/bin/sh
# The card back as a PNG, rasterized once by Chrome (the film shows it on every card that turns).
cd "$(dirname "$0")/../public/art" || exit 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=500,700 --screenshot="$PWD/card-back.png" "file://$PWD/card-back.svg" >/dev/null 2>&1
echo card-back.png

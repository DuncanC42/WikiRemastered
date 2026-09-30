#!/bin/sh
# Exports the brand's PNGs from the SVGs written by scripts/brand.mjs, with headless Chrome.
# Run from the repository root: sh scripts/brand-png.sh
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
# The icon, drawn large once, then brought down to each size (sharper than drawing it small).
sed 's/width="128" height="128"/width="1024" height="1024"/' extension/icon.svg > "$TMP/icon.svg"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
  --window-size=1024,1024 --screenshot="$TMP/icon-1024.png" "file://$TMP/icon.svg" >/dev/null 2>&1
python3 - "$TMP/icon-1024.png" <<'PY'
import sys
from PIL import Image
source = Image.open(sys.argv[1]).convert('RGBA')
for size in (16, 32, 48, 128):
    source.resize((size, size), Image.LANCZOS).save(f'extension/icon-{size}.png', optimize=True)
source.resize((128, 128), Image.LANCZOS).save('store/images/icon-128.png', optimize=True)
PY
for tile in promo-small-440x280:440:280 promo-marquee-1400x560:1400:560; do
  name="${tile%%:*}"; rest="${tile#*:}"; w="${rest%%:*}"; h="${rest#*:}"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$w,$h" \
    --screenshot="store/images/$name.png" "file://$PWD/store/images/$name.svg" >/dev/null 2>&1
done
rm -rf "$TMP"
ls -la extension/icon-*.png store/images/*.png

#!/bin/sh
# Renders some frames of the film as JPEGs, for review (the CLI serves public/ in place, where the
# programmatic bundler would copy the captures every time):
#   sh scripts/stills.sh out/stills 30 200 900     (COMP=Lab3D for another composition, SCALE=0.5)
cd "$(dirname "$0")/.." || exit 1
dir=$1; shift
mkdir -p "$dir"
for frame in "$@"; do
  npx remotion still "${COMP:-WikiRemastered}" "$dir/f$(printf '%04d' "$frame").jpeg" --frame="$frame" --scale="${SCALE:-0.5}" --gl=angle --timeout=90000 --log=error >/dev/null 2>&1 || echo "frame $frame failed"
  printf '%s ' "$frame"
done
echo done

/* Dog-eared corner for the pack art (pack-art.svg, pack-art-puzzle.svg: 640 × 1000 viewBox).
 * The corner beyond the fold line is masked out of the artwork, and the same
 * region is mirrored across that line as a flap showing the seal's reverse,
 * with a lit crease and a cast shadow. The SVG carries two placeholders:
 * <!--cut-->…<!--/cut--> in <defs>, and <!--fold-->…<!--/fold--> last.
 * The reverse is dark foil unless the art says otherwise, on its root, with
 * data-flap-top / data-flap-bottom="light,mid,dark" (a colour per seal).
 */
const LEFT = 22;
const RIGHT = 618;

// Crimped teeth of the seals, as drawn in pack-art.svg.
function toothY(x, top) {
  if (top) return Math.round((x - LEFT) / 8) % 2 ? 4 : 14;
  return Math.round((RIGHT - x) / 8) % 2 ? 996 : 986;
}

function reflect([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
  const px = ax + t * dx;
  const py = ay + t * dy;
  return [2 * px - x, 2 * py - y];
}

const point = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

export function foldMarkup({ corner = 'tr', along = 50, down = 42, colors = ['#5a5a64', '#34343b', '#1b1b20'] } = {}) {
  const top = corner[0] === 't';
  const right = corner[1] === 'r';
  const cx = right ? RIGHT : LEFT;
  const cy = top ? 4 : 996;
  const sx = right ? -1 : 1; // Direction from the corner into the pack.
  const sy = top ? 1 : -1;
  const a = [cx + sx * along, top ? toothY(cx + sx * along, true) : toothY(cx + sx * along, false)];
  const b = [cx, cy + sy * down];

  // Corner region boundary: A → teeth → corner → B, in artwork coordinates.
  const region = [a];
  const grid = x => top ? LEFT + 8 * x : RIGHT - 8 * x;
  for (let k = 0; k <= 75; k += 1) {
    const x = grid(k);
    const between = sx > 0 ? x > cx && x < a[0] : x < cx && x > a[0];
    if (between) region.push([x, toothY(x, top)]);
  }
  region.sort((p, q) => sx * (q[0] - p[0]));
  region.push([cx, cy + sy * 10], b);
  const flap = region.map(p => reflect(p, a, b));
  const flapPath = `M${flap.map(point).join(' L')} Z`;

  // Mask: remove everything on the corner side of the fold line.
  const d = [b[0] - a[0], b[1] - a[1]];
  const far = [a[0] - d[0] * 3, a[1] - d[1] * 3];
  const far2 = [b[0] + d[0] * 3, b[1] + d[1] * 3];
  const outside = [right ? 700 : -60, top ? -60 : 1060];
  const cut = `<mask id="foldCut" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <rect width="640" height="1000" fill="#fff"/>
      <path d="M${point(far)} L${point(outside)} L${point(far2)} Z" fill="#000"/>
    </mask>
    <clipPath id="foldClip"><rect x="${LEFT}" y="0" width="${RIGHT - LEFT}" height="1000"/></clipPath>`;

  // Light the flap from the crease towards its tip.
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const tip = reflect([cx, cy], a, b);
  const shadowOffset = [sx * 2.5, sy * 4];
  const fold = `<g>
    <linearGradient id="flapLight" gradientUnits="userSpaceOnUse" x1="${mid[0].toFixed(1)}" y1="${mid[1].toFixed(1)}" x2="${tip[0].toFixed(1)}" y2="${tip[1].toFixed(1)}">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset=".35" stop-color="${colors[1]}"/>
      <stop offset="1" stop-color="${colors[2]}"/>
    </linearGradient>
    <g mask="url(#foldCut)" clip-path="url(#foldClip)">
      <path d="${flapPath}" transform="translate(${shadowOffset[0]} ${shadowOffset[1]})" fill="#000" fill-opacity=".7" filter="url(#softer)"/>
      <path d="${flapPath}" transform="translate(${shadowOffset[0] / 2} ${shadowOffset[1] / 2})" fill="#000" fill-opacity=".5" filter="url(#soft)"/>
    </g>
    <path d="${flapPath}" fill="url(#flapLight)"/>
    <path d="${flapPath}" fill="url(#ridges)" fill-opacity=".8"/>
    <path d="${flapPath}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1"/>
    <path d="M${point(a)} L${point(b)}" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/>
  </g>`;
  return { cut, fold };
}

// The colours of the reverse of the seal the fold is on, as the art gives them.
function flapColors(svg, corner = 'tr') {
  const match = svg.match(new RegExp(`data-flap-${corner[0] === 'b' ? 'bottom' : 'top'}="([^"]+)"`));
  const colors = match?.[1].split(',').map(value => value.trim());
  return colors?.length === 3 ? colors : undefined;
}

export function withFold(svg, options = {}) {
  const { cut, fold } = foldMarkup({ ...options, colors: options.colors ?? flapColors(svg, options.corner) });
  return svg
    .replace(/<!--cut-->[\s\S]*?<!--\/cut-->/, `<!--cut-->\n    ${cut}\n  <!--/cut-->`)
    .replace(/<!--fold-->[\s\S]*?<!--\/fold-->/, `<!--fold-->\n  ${fold}\n  <!--/fold-->`);
}

export function randomFold() {
  return {
    corner: ['tr', 'tl', 'br', 'bl'][Math.floor(Math.random() * 4)],
    along: 38 + Math.round(Math.random() * 26),
    down: 30 + Math.round(Math.random() * 24),
  };
}

/* Builds extension/pack-art-puzzle.svg: the colourful pack. Run: node scripts/pack-art-puzzle.mjs
 *
 * An illustration more than a render: a flat, saturated paper colour, a few big jigsaw pieces
 * tumbling across it in 3D (flat colours, two tones on their sides, a hand-drawn highlight and
 * little marks on their faces), a scatter of stars and dots, a hand-lettered wordmark printed
 * slightly off register, and a grain over everything, as if printed by hand.
 *
 * It keeps the dark pack's exact outline, heat-sealed ends, tear guide and placeholders
 * (<!--cut-->, <!--fold-->), so the tear, the ribbon, the 3D bands and the dog-eared corner work
 * on it unchanged. It has no light sweep: a still image is drawn once, where an animated one is
 * redrawn, grain and all, at every frame.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldMarkup } from '../extension/pack-fold.js';

const OUT = fileURLToPath(new URL('../extension/pack-art-puzzle.svg', import.meta.url));

/* ─── Helpers ───────────────────────────────────────────────────────────── */

let seed = 1307;
const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const jitter = amount => (random() - .5) * 2 * amount;
const f = value => (Math.round(value * 10) / 10).toString();
const normalize = v => { const length = Math.hypot(...v); return v.map(value => value / length); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const path = points => `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;

/* ─── Palette: a marigold paper, and inks ───────────────────────────────── */

const PAPER = '#ffc53a';
const PAPER_DEEP = '#f0a91f'; // Shadows cast on the paper.
const INK = {
  jade: { face: '#34b27a', side: '#23875b', deep: '#17694a' },
  violet: { face: '#5b4bdb', side: '#4333b4', deep: '#2f2290' },
  pink: { face: '#ff94bb', side: '#ea6b98', deep: '#c94f7c' },
  coral: { face: '#ff5446', side: '#dc3a31', deep: '#b12a26' },
  cream: { face: '#fff2d2', side: '#f1d49a', deep: '#d9b36c' },
};
const INDIGO = '#3a2ab8';
const RED = '#ff4a3d';

/* ─── The jigsaw outline ────────────────────────────────────────────────── */

const KNOB = [[.3, 0], [.37, .012], [.415, .06], [.41, .12]];
function edgePoints(tab, shift = 0) {
  // From (0, 0) to (1, 0); `tab` 1 out, -1 in, 0 flat. Points close to the ends keep the corners tight.
  if (!tab) return [[0, 0], [.03, 0], [.5, 0], [.97, 0], [1, 0]];
  const profile = [[0, 0], [.03, 0], ...KNOB.map(([u, v]) => [u + shift, v])];
  for (let step = 0; step <= 8; step += 1) {
    const angle = (212 - step * 244 / 8) * Math.PI / 180;
    profile.push([.5 + shift + .125 * Math.cos(angle), .21 + .125 * Math.sin(angle)]);
  }
  for (const [u, v] of [...KNOB].reverse()) profile.push([1 - u + shift, v]);
  profile.push([.97, 0], [1, 0]);
  return profile.map(([u, v]) => [u, v * tab]);
}
// A piece: its edges top, right, bottom, left (clockwise, y down), rounded off once.
function pieceOutline(tabs, shifts = [0, 0, 0, 0]) {
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
  const points = [];
  for (let edge = 0; edge < 4; edge += 1) {
    const [sx, sy] = corners[edge];
    const [ex, ey] = corners[(edge + 1) % 4];
    const dx = ex - sx;
    const dy = ey - sy;
    edgePoints(tabs[edge], shifts[edge]).slice(0, -1).forEach(([u, v]) => points.push([sx + dx * u + dy * v, sy + dy * u - dx * v]));
  }
  const rounded = [];
  points.forEach(([px, py], index) => {
    const [qx, qy] = points[(index + 1) % points.length];
    rounded.push([.75 * px + .25 * qx, .75 * py + .25 * qy], [.25 * px + .75 * qx, .25 * py + .75 * qy]);
  });
  return rounded;
}

/* ─── A piece in 3D ─────────────────────────────────────────────────────── */

// Screen space: x right, y down, z toward us; orthographic. Light from the upper left, in front.
const LIGHT = normalize([-.5, -.75, .45]);
function rotation(ax, ay, az) {
  const [sx, cx] = [Math.sin(ax), Math.cos(ax)];
  const [sy, cy] = [Math.sin(ay), Math.cos(ay)];
  const [sz, cz] = [Math.sin(az), Math.cos(az)];
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
const apply = (m, [x, y, z]) => [m[0][0] * x + m[0][1] * y + m[0][2] * z, m[1][0] * x + m[1][1] * y + m[1][2] * z, m[2][0] * x + m[2][1] * y + m[2][2] * z];

/* A solid piece: its outline extruded by `thick` (a share of its size), turned, at (x, y). What
   faces us is kept: walls in two tones (lit, in shade), far to near, then the face. */
function solid({ tabs, shifts, size, thick = .3, at: [x, y], turn, ink, marks = 0, markInk, shine = true, id }) {
  const outline = pieceOutline(tabs, shifts);
  const matrix = rotation(...turn);
  const half = thick * size / 2;
  const place = ([u, v], z) => {
    const [px, py, pz] = apply(matrix, [u * size, v * size, z]);
    return [x + px, y + py, pz];
  };
  const front = outline.map(point => place(point, half));
  const back = outline.map(point => place(point, -half));
  const count = outline.length;
  const walls = [];
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const [ax, ay] = outline[index];
    const [bx, by] = outline[next];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const normal = apply(matrix, [(by - ay) / length, -(bx - ax) / length, 0]);
    if (normal[2] <= .003) continue;
    const quad = [front[index], front[next], back[next], back[index]];
    walls.push({ index, quad, depth: quad.reduce((sum, p) => sum + p[2], 0) / 4, lit: dot(normal, LIGHT) > .12 });
  }
  walls.sort((a, b) => a.depth - b.depth);
  const up = apply(matrix, [0, 0, 1]);
  const facing = up[2] >= 0;
  const cap = facing ? front : back;
  return { id, outline, front, back, count, walls, cap, facing, place, half, size, ink, marks, markInk, shine, depth: 0 };
}

/* ─── Drawing it, as an illustration ────────────────────────────────────── */

const defs = [];
function drawPiece(piece) {
  const { id, walls, cap, front, back, count, ink } = piece;
  const out = [];
  // Walls: runs along the outline with the same tone make one strip each; one path per tone.
  const strips = [];
  for (const wall of walls) {
    const last = strips[strips.length - 1];
    if (last && last.lit === wall.lit && (last.to + 1) % count === wall.index) last.to = wall.index;
    else strips.push({ lit: wall.lit, from: wall.index, to: wall.index });
  }
  const top = piece.facing ? front : back;
  const bottom = piece.facing ? back : front;
  for (const strip of strips) {
    const indices = [];
    for (let index = strip.from; ; index = (index + 1) % count) { indices.push(index); if (index === strip.to) break; }
    indices.push((strip.to + 1) % count);
    const d = path([...indices.map(index => top[index]), ...[...indices].reverse().map(index => bottom[index])]);
    const color = strip.lit ? ink.side : ink.deep;
    // The same colour round each strip seals the joins between them.
    out.push(`<path d="${d}" fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>`);
  }
  // The face, flat.
  out.push(`<path d="${path(cap)}" fill="${ink.face}"/>`);
  // A highlight drawn by hand along the edge that faces the light, a little inside it.
  if (piece.shine) out.push(highlight(piece));
  // Little marks on the face, printed in its plane.
  if (piece.marks) out.push(faceMarks(piece));
  return out.join('\n    ');
}

// The stretch of the face's edge that looks up and to the left, pulled in, as one stroke.
function highlight(piece) {
  const { cap, size } = piece;
  const count = cap.length;
  const cx = cap.reduce((sum, p) => sum + p[0], 0) / count;
  const cy = cap.reduce((sum, p) => sum + p[1], 0) / count;
  const scores = cap.map((p, index) => {
    const [ax, ay] = cap[(index - 1 + count) % count];
    const [bx, by] = cap[(index + 1) % count];
    // Outward normal from the centre, and from the edge's own direction.
    let nx = by - ay;
    let ny = -(bx - ax);
    if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; }
    const length = Math.hypot(nx, ny) || 1;
    return (-nx * .6 - ny * .8) / length;
  });
  // The longest run of edge that faces the light well.
  let best = [0, -1];
  for (let start = 0; start < count; start += 1) {
    if (scores[start] < .55 || scores[(start - 1 + count) % count] >= .55) continue;
    let end = start;
    while (scores[(end + 1) % count] >= .55 && (end + 1) % count !== start) end = (end + 1) % count;
    const length = (end - start + count) % count;
    if (length > best[1]) best = [start, length];
  }
  if (best[1] < 3) return '';
  const inset = size * .07;
  const points = [];
  // Its ends are trimmed, so the stroke starts and stops like a brush.
  const trim = Math.round(best[1] * .12);
  for (let step = trim; step <= best[1] - trim; step += 1) {
    const [px, py] = cap[(best[0] + step) % count];
    const dx = cx - px;
    const dy = cy - py;
    const length = Math.hypot(dx, dy) || 1;
    points.push([px + dx / length * inset, py + dy / length * inset]);
  }
  const d = `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}`;
  return `<path d="${d}" fill="none" stroke="#fff8e7" stroke-opacity=".85" stroke-width="${f(size * .045)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Hand-drawn marks, like the scales of a painted animal: little double and triple arches, all
// the same way up, on a loose grid over the face (in its plane), so they read as a pattern.
const MARKS = [
  'M-7 3 C-7 -3 0 -3 0 2 C0 -3 7 -3 7 3',
  'M-10 3 C-10 -2 -3.5 -2 -3.5 2 C-3.5 -2 3 -2 3 2 C3 -2 9.5 -2 9.5 3',
];
function faceMarks(piece) {
  const { place, half, marks, markInk } = piece;
  const z = piece.facing ? half : -half;
  // One unit of a mark is a hundredth of the piece.
  const origin = place([0, 0], z);
  const ux = place([.01, 0], z);
  const uy = place([0, .01], z);
  const matrix = [ux[0] - origin[0], ux[1] - origin[1], uy[0] - origin[0], uy[1] - origin[1], origin[0], origin[1]];
  // A 3 × 3 grid, staggered by row, a few spots left out, each mark nudged.
  const spots = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) spots.push([(column - 1) * 24 + (row % 2 ? 8 : -4) + jitter(3), (row - 1) * 22 + jitter(3)]);
  }
  while (spots.length > marks) spots.splice(Math.floor(random() * spots.length), 1);
  const items = spots.map(([u, v]) => `<path d="${MARKS[random() < .6 ? 0 : 1]}" transform="translate(${f(u)} ${f(v)}) rotate(${f(jitter(9))})"/>`);
  return `<g transform="matrix(${matrix.map(value => value.toFixed(4)).join(' ')})" fill="none" stroke="${markInk}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      ${items.join('\n      ')}
    </g>`;
}

// The piece's flat shadow on the paper: the piece itself, shifted down and to the right, filled
// with the shade of the paper (see #flat).
const castShadow = (piece, [dx, dy]) => `<use href="#${piece.id}" transform="translate(${dx} ${dy})" filter="url(#flat)"/>`;

/* ─── Stars, sparkles, dots ─────────────────────────────────────────────── */

function star([x, y], radius, points = 8, color = RED, turn = 0) {
  const corners = [];
  for (let index = 0; index < points * 2; index += 1) {
    const r = (index % 2 ? radius * .42 : radius) * (1 + jitter(.08));
    const angle = turn + index * Math.PI / points + jitter(.05);
    corners.push([x + r * Math.sin(angle), y - r * Math.cos(angle)]);
  }
  return `<path d="${path(corners)}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
}
function sparkle([x, y], radius, color = RED) {
  const r = radius;
  const w = radius * .16;
  return `<path d="M${f(x)} ${f(y - r)} C${f(x + w)} ${f(y - w)} ${f(x + w)} ${f(y - w)} ${f(x + r * .78)} ${f(y)} C${f(x + w)} ${f(y + w)} ${f(x + w)} ${f(y + w)} ${f(x)} ${f(y + r)} C${f(x - w)} ${f(y + w)} ${f(x - w)} ${f(y + w)} ${f(x - r * .78)} ${f(y)} C${f(x - w)} ${f(y - w)} ${f(x - w)} ${f(y - w)} ${f(x)} ${f(y - r)} Z" fill="${color}"/>`;
}
const dotAt = ([x, y], r, color = RED) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}"/>`;
const ringAt = ([x, y], r, color = RED) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="${f(r * .55)}"/>`;

/* ─── The hand-lettered wordmark ────────────────────────────────────────── */

// A monoline alphabet, cap height 100, drawn with a round brush.
const LETTERS = {
  W: { width: 92, d: 'M0 0 L21 100 L46 34 L71 100 L92 0' },
  I: { width: 0, d: 'M0 0 L0 100' },
  K: { width: 62, d: 'M0 0 L0 100 M60 0 L6 60 M24 42 L62 100' },
  M: { width: 80, d: 'M0 100 L0 0 L40 66 L80 0 L80 100' },
  A: { width: 74, d: 'M0 100 L37 0 L74 100 M15 64 L59 64' },
  S: { width: 64, d: 'M60 16 C50 0 8 -2 5 26 C2 52 62 44 62 74 C62 104 12 106 1 82' },
  T: { width: 66, d: 'M0 0 L66 0 M33 0 L33 100' },
  E: { width: 58, d: 'M58 0 L0 0 L0 100 L58 100 M0 49 L46 49' },
  R: { width: 64, d: 'M0 100 L0 0 L32 0 C62 0 62 52 32 52 L0 52 M30 52 L64 100' },
};
// A word: its letters side by side, each nudged a little, as by hand. Returns path data and width.
function word(text, gap = 36) {
  let x = 0;
  const parts = [];
  for (const letter of text) {
    const { width, d } = LETTERS[letter];
    parts.push(`<path d="${d}" transform="translate(${f(x + jitter(2))} ${f(jitter(3))}) rotate(${f(jitter(2.5))} ${f(width / 2)} 50)"/>`);
    x += width + gap;
  }
  return { markup: parts.join(''), width: x - gap };
}
function wordmark(text, [x, y], height, angle, gap) {
  const { markup, width } = word(text, gap);
  const scale = height / 100;
  const transform = `translate(${f(x)} ${f(y)}) rotate(${angle}) scale(${scale.toFixed(4)}) translate(${f(-width / 2)} -50)`;
  const stroke = f(20);
  // Printed in two inks slightly off register: the coral a hair down and to the right.
  return `<g transform="${transform}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${stroke}">
      <g stroke="${RED}" transform="translate(5 6)">${markup}</g>
      <g stroke="${INDIGO}">${markup}</g>
    </g>`;
}

/* ─── The scene ─────────────────────────────────────────────────────────── */

// A few big pieces tumbling through the pack, from the top left down to the right, each turned
// its own way; smaller ones in the gaps. Near ones are drawn last.
const PIECES = [
  { id: 'jade', tabs: [1, -1, 1, 1], size: 248, at: [196, 322], turn: [.5, -.48, -.46], ink: INK.jade, marks: 7, markInk: INDIGO, depth: 3 },
  { id: 'violet', tabs: [-1, 1, 1, -1], size: 214, at: [458, 506], turn: [-.28, .42, .56], ink: INK.violet, marks: 6, markInk: INK.pink.face, depth: 2 },
  { id: 'pink', tabs: [1, 1, -1, 1], size: 112, at: [486, 214], turn: [.3, .7, .9], ink: INK.pink, marks: 3, markInk: INK.coral.side, depth: 1 },
  { id: 'coral', tabs: [-1, 1, 1, -1], size: 96, at: [128, 598], turn: [-.7, -.3, .35], ink: INK.coral, marks: 0, depth: 1 },
  { id: 'cream', tabs: [1, -1, 1, 1], size: 62, at: [314, 604], turn: [.9, .4, -.6], ink: INK.cream, marks: 0, shine: false, depth: 4 },
].map(spec => ({ ...solid(spec), depth: spec.depth }));
PIECES.sort((a, b) => a.depth - b.depth);

const deco = [
  star([372, 176], 24, 8, RED, .2),
  star([566, 382], 18, 8, RED, .5),
  star([84, 164], 13, 8, RED),
  star([560, 704], 21, 8, RED, .3),
  sparkle([392, 318], 20, INK.pink.side),
  sparkle([236, 636], 15, RED),
  sparkle([62, 470], 16, INDIGO),
  sparkle([88, 872], 18, INDIGO),
  dotAt([266, 150], 5), dotAt([592, 262], 5, INDIGO), dotAt([46, 330], 4), dotAt([354, 470], 4, INDIGO),
  dotAt([598, 560], 4), dotAt([64, 700], 5, INDIGO), dotAt([420, 664], 4), dotAt([540, 880], 4),
  ringAt([410, 250], 7, INDIGO), ringAt([586, 162], 7), ringAt([380, 620], 6, INDIGO), ringAt([40, 560], 6),
].join('\n    ');

const BODY = 'M22 40 L22 72 C22 104 14 124 14 172 L14 828 C14 876 22 896 22 928 L22 960 L618 960 L618 928 C618 896 626 876 626 828 L626 172 C626 124 618 104 618 72 L618 40 Z';
function teeth(top) {
  const points = [];
  if (top) {
    points.push('M22 66 L22 14 L22 14');
    for (let x = 30; x <= 614; x += 8) points.push(`L${x} ${(x - 22) / 8 % 2 ? 4 : 14}`);
    points.push('L618 66 Z');
  } else {
    points.push('M22 934 L618 934 L618 986 L618 986');
    for (let x = 610; x >= 26; x -= 8) points.push(`L${x} ${(618 - x) / 8 % 2 ? 996 : 986}`);
    points.push('L22 986 Z');
  }
  return points.join(' ');
}
const SEAL_TOP = teeth(true);
const SEAL_BOTTOM = teeth(false);

const FLAP_TOP = ['#ffe08a', '#f2b23a', '#c98a1c'];
const FLAP_BOTTOM = FLAP_TOP;
const fold = foldMarkup({ corner: 'tr', along: 52, down: 44, colors: FLAP_TOP });

// Each piece is written once, in the defs, and used twice: its shadow, then itself.
for (const piece of PIECES) defs.push(`<g id="${piece.id}">\n    ${drawPiece(piece)}\n    </g>`);
const piecesMarkup = PIECES.map(piece => `<use href="#${piece.id}"/>`).join('\n      ');
const shadowsMarkup = PIECES.map(piece => castShadow(piece, [12 + piece.depth * 2, 16 + piece.depth * 3])).join('\n      ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1000" viewBox="0 0 640 1000" data-flap-top="${FLAP_TOP}" data-flap-bottom="${FLAP_BOTTOM}">
  <!-- Wiki Masters · Collection + pack, the colourful one. Generated by scripts/pack-art-puzzle.mjs:
       edit the script, not this file. -->
  <defs>
    <!-- Grain, as if printed by hand: fine specks, dark and light, and edges that wander a little. -->
    <filter id="specksDark" filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="2" seed="4" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 .3  0 0 0 0 .12  0 0 0 0 0  0 0 0 11 -8.1"/>
    </filter>
    <filter id="specksLight" filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="11" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 .97  0 0 0 0 .9  0 0 0 -11 2.9"/>
    </filter>
    <filter id="tooth" filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="3"/>
      <feColorMatrix values="0 0 0 0 .5  0 0 0 0 .25  0 0 0 0 0  0 0 0 .9 -.35"/>
    </filter>
    <filter id="wobble" filterUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="1040">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="9" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="flat" filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <feFlood flood-color="${PAPER_DEEP}"/>
      <feComposite in2="SourceAlpha" operator="in"/>
    </filter>
    <filter id="soft" filterUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="1040"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="softer" filterUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="1040"><feGaussianBlur stdDeviation="8"/></filter>
    <pattern id="ridges" width="6" height="10" patternUnits="userSpaceOnUse">
      <rect width="2" height="10" fill="#fff6d6" fill-opacity=".35"/>
      <rect x="3" width="1.4" height="10" fill="#b8740c" fill-opacity=".35"/>
    </pattern>
    <linearGradient id="pinchTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8740c" stop-opacity=".4"/>
      <stop offset="1" stop-color="#b8740c" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="pinchBottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#b8740c" stop-opacity=".45"/>
      <stop offset="1" stop-color="#b8740c" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="bodyClip"><path d="${BODY}"/></clipPath>
    <clipPath id="packClip"><path d="${BODY}"/><path d="${SEAL_TOP}"/><path d="${SEAL_BOTTOM}"/></clipPath>
    <clipPath id="sealTopClip"><path d="${SEAL_TOP}"/></clipPath>
    <clipPath id="sealBottomClip"><path d="${SEAL_BOTTOM}"/></clipPath>
    __DEFS__
  <!--cut-->
    ${fold.cut}
  <!--/cut-->
  </defs>
  <g mask="url(#foldCut)">

  <!-- The paper: one flat colour, the pillow's puff shown only by soft shade under the seals. -->
  <path d="${BODY}" fill="${PAPER}"/>
  <path d="${SEAL_TOP}" fill="${PAPER}"/>
  <path d="${SEAL_BOTTOM}" fill="${PAPER}"/>
  <g clip-path="url(#bodyClip)">
    <rect x="0" y="62" width="640" height="46" fill="url(#pinchTop)"/>
    <rect x="0" y="892" width="640" height="46" fill="url(#pinchBottom)"/>
    <g filter="url(#wobble)">
      <!-- Flat shadows of the pieces on the paper. -->
      ${shadowsMarkup}
      ${deco}
      ${piecesMarkup}
      ${wordmark('WIKI', [206, 736], 66, -7, 34)}
      ${wordmark('MASTERS', [326, 822], 72, -4, 30)}
    </g>
  </g>
  <path d="M22 72 C22 104 14 124 14 172 L14 828 C14 876 22 896 22 928" stroke="#fff4d0" stroke-opacity=".5" stroke-width="1.5" fill="none"/>
  <path d="M618 72 C618 104 626 124 626 172 L626 828 C626 876 618 896 618 928" stroke="#a86a08" stroke-opacity=".45" stroke-width="2" fill="none"/>

  <!-- Heat-sealed ends: the same paper, ribbed and crimped. -->
  <g clip-path="url(#sealTopClip)">
    <rect x="0" y="0" width="640" height="80" fill="url(#ridges)"/>
  </g>
  <line x1="22" y1="66" x2="618" y2="66" stroke="#a86a08" stroke-opacity=".45" stroke-width="1.4"/>
  <g clip-path="url(#sealBottomClip)">
    <rect x="0" y="920" width="640" height="80" fill="url(#ridges)"/>
  </g>
  <line x1="22" y1="934" x2="618" y2="934" stroke="#a86a08" stroke-opacity=".45" stroke-width="1.4"/>

  <!-- Tear guide at 9 %. -->
  <line x1="44" y1="90" x2="596" y2="90" stroke="${INDIGO}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="4 7" stroke-linecap="round"/>

  <g font-family="'SF Pro Rounded', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" text-anchor="middle" fill="${INDIGO}">
    <text x="320" y="128" font-size="13" letter-spacing="6">ENCYCLOPÉDIE · SÉRIE I</text>
    <text x="320" y="908" font-size="13" letter-spacing="6">COLLECTIONNEZ LE SAVOIR</text>
  </g>

  <!-- The grain, over everything. -->
  <g clip-path="url(#packClip)">
    <rect width="640" height="1000" filter="url(#tooth)" opacity=".12"/>
    <rect width="640" height="1000" filter="url(#specksDark)" opacity=".35"/>
    <rect width="640" height="1000" filter="url(#specksLight)" opacity=".45"/>
  </g>
  </g>
  <!--fold-->
  ${fold.fold}
  <!--/fold-->
</svg>
`;

const output = svg.replace('__DEFS__', defs.join('\n    '));
writeFileSync(OUT, output);
console.log(`${OUT}: ${(output.length / 1024).toFixed(1)} KB`);

/* ─── The back of the cards, for the puzzle pack ─────────────────────────── */

/* extension/card-back-puzzle.svg, 500 × 700 (a card is 5 : 7; the card rounds its corners). The
   same hand as the pack, in a deep indigo rather than its marigold: on the back of a card, the rim
   takes the colour of the card's rarity as it charges, and the gold and orange ones would vanish
   on a yellow back. A loose pattern of small pieces, sparkles and dots in a lighter indigo, a
   cream frame drawn by hand, and in the middle a big marigold piece in 3D, plain. */
const BACK_OUT = fileURLToPath(new URL('../extension/card-back-puzzle.svg', import.meta.url));
const BACK = '#4332c4';
const BACK_PATTERN = '#5747dc';
const BACK_SHADE = '#2c1f96';

// A small flat piece of the pattern: a jigsaw outline, turned, at (x, y).
function flatPiece([x, y], size, angle, color, tabs) {
  const points = pieceOutline(tabs).map(([u, v]) => {
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return [x + (u * c - v * s) * size, y + (u * s + v * c) * size];
  });
  return `<path d="${path(points)}" fill="${color}"/>`;
}

const pattern = [];
for (let row = 0; row < 10; row += 1) {
  for (let column = 0; column < 7; column += 1) {
    const x = column * 74 + (row % 2 ? 37 : 0) + jitter(12);
    const y = row * 72 + 20 + jitter(10);
    // Inside the frame only, and the middle is left clear for the emblem.
    if (x < 62 || x > 438 || y < 62 || y > 638 || Math.hypot((x - 250) / 1.05, y - 350) < 190) continue;
    // And clear of the stars placed by hand (see backStars).
    if ([[112, 172], [398, 548], [396, 170], [104, 540]].some(([sx, sy]) => Math.hypot(x - sx, y - sy) < 44)) continue;
    const accent = random() < .12;
    const color = accent ? ['#ffc53a', '#ff94bb', '#34b27a', '#ff5446'][Math.floor(random() * 4)] : BACK_PATTERN;
    const kind = random();
    if (kind < .38) pattern.push(flatPiece([x, y], 30 + jitter(5), random() * Math.PI * 2, color, [1, random() < .5 ? 1 : -1, -1, 1]));
    else if (kind < .62) pattern.push(sparkle([x, y], 11 + jitter(3), color));
    else if (kind < .8) pattern.push(dotAt([x, y], 4.5 + jitter(1), color));
    else pattern.push(ringAt([x, y], 6 + jitter(1), color));
  }
}

const EMBLEM_INK = { face: '#ffc53a', side: '#f0a91f', deep: '#c47a0c' };
// Its knobs and its turn pull it to one side: it is placed so that it looks centred.
const emblem = solid({ id: 'emblem', tabs: [1, -1, 1, 1], size: 214, thick: .28, at: [274, 340], turn: [.3, -.36, -.16], ink: EMBLEM_INK });
const backStars = [
  star([112, 172], 17, 8, '#ffc53a', .3),
  star([398, 548], 15, 8, '#ff94bb', .1),
  sparkle([396, 170], 15, '#fff2d2'),
  sparkle([104, 540], 13, '#fff2d2'),
  dotAt([140, 350], 4, '#fff2d2'), dotAt([366, 352], 4, '#fff2d2'),
].join('\n    ');

const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700">
  <!-- Back of the cards for the puzzle pack. Generated by scripts/pack-art-puzzle.mjs. -->
  <defs>
    <filter id="specksDark" filterUnits="userSpaceOnUse" x="0" y="0" width="500" height="700">
      <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="2" seed="5" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 .08  0 0 0 0 .04  0 0 0 0 .25  0 0 0 11 -8.1"/>
    </filter>
    <filter id="specksLight" filterUnits="userSpaceOnUse" x="0" y="0" width="500" height="700">
      <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="13" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .85  0 0 0 -11 2.9"/>
    </filter>
    <filter id="tooth" filterUnits="userSpaceOnUse" x="0" y="0" width="500" height="700">
      <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="6"/>
      <feColorMatrix values="0 0 0 0 .1  0 0 0 0 .05  0 0 0 0 .3  0 0 0 .9 -.35"/>
    </filter>
    <filter id="wobble" filterUnits="userSpaceOnUse" x="-20" y="-20" width="540" height="740">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="9" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="flat" filterUnits="userSpaceOnUse" x="0" y="0" width="500" height="700">
      <feFlood flood-color="${BACK_SHADE}"/>
      <feComposite in2="SourceAlpha" operator="in"/>
    </filter>
    <g id="emblem">
    ${drawPiece(emblem)}
    </g>
  </defs>
  <rect width="500" height="700" fill="${BACK}"/>
  <g filter="url(#wobble)">
    ${pattern.join('\n    ')}
    <!-- A frame drawn by hand. -->
    <rect x="30" y="30" width="440" height="640" rx="30" fill="none" stroke="#fff2d2" stroke-width="5"/>
    ${backStars}
    <use href="#emblem" transform="translate(14 20)" filter="url(#flat)"/>
    <use href="#emblem"/>
  </g>
  <rect width="500" height="700" filter="url(#tooth)" opacity=".14"/>
  <rect width="500" height="700" filter="url(#specksDark)" opacity=".4"/>
  <rect width="500" height="700" filter="url(#specksLight)" opacity=".4"/>
</svg>
`;
writeFileSync(BACK_OUT, backSvg);
console.log(`${BACK_OUT}: ${(backSvg.length / 1024).toFixed(1)} KB`);

/* Shared by the drawn packs (scripts/pack-art-puzzle.mjs, scripts/pack-art-green.mjs): jigsaw
   pieces in 3D drawn as an illustration, stars and dots, a hand-lettered alphabet, the pack's
   outline and sealed ends. Output is deterministic: each pack reseeds the random source. */
/* ─── Helpers ───────────────────────────────────────────────────────────── */

let seed = 1307;
export const reseed = value => { seed = value; };
export const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
export const jitter = amount => (random() - .5) * 2 * amount;
export const f = value => (Math.round(value * 10) / 10).toString();
export const normalize = v => { const length = Math.hypot(...v); return v.map(value => value / length); };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const path = points => `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;

/* ─── The jigsaw outline ────────────────────────────────────────────────── */

const KNOB = [[.3, 0], [.37, .012], [.415, .06], [.41, .12]];
export function edgePoints(tab, shift = 0) {
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
export function pieceOutline(tabs, shifts = [0, 0, 0, 0]) {
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
export const LIGHT = normalize([-.5, -.75, .45]);
export function rotation(ax, ay, az) {
  const [sx, cx] = [Math.sin(ax), Math.cos(ax)];
  const [sy, cy] = [Math.sin(ay), Math.cos(ay)];
  const [sz, cz] = [Math.sin(az), Math.cos(az)];
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
export const apply = (m, [x, y, z]) => [m[0][0] * x + m[0][1] * y + m[0][2] * z, m[1][0] * x + m[1][1] * y + m[1][2] * z, m[2][0] * x + m[2][1] * y + m[2][2] * z];

/* A solid piece: its outline extruded by `thick` (a share of its size), turned, at (x, y). What
   faces us is kept: walls in two tones (lit, in shade), far to near, then the face. */
export function solid({ tabs, shifts, size, thick = .3, at: [x, y], turn, ink, marks = 0, markInk, shine = true, id }) {
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

export function drawPiece(piece) {
  const { walls, face } = drawPieceParts(piece);
  return [...walls, ...face].join('\n    ');
}
/* The same, in two parts: its walls, then its face (with its highlight and marks). Pieces lying
   side by side on one plane are drawn walls first, all of them, then faces: a piece's walls must
   never cover the tab of the neighbour that sits in its socket. */
export function drawPieceParts(piece) {
  const { walls, cap, front, back, count, ink } = piece;
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
  const face = [`<path d="${path(cap)}" fill="${ink.face}"/>`];
  // A highlight drawn by hand along the edge that faces the light, a little inside it.
  if (piece.shine) face.push(highlight(piece));
  // Little marks on the face, printed in its plane.
  if (piece.marks) face.push(faceMarks(piece));
  return { walls: out, face };
}

// The stretch of the face's edge that looks up and to the left, pulled in, as one stroke.
export function highlight(piece) {
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
export const MARKS = [
  'M-7 3 C-7 -3 0 -3 0 2 C0 -3 7 -3 7 3',
  'M-10 3 C-10 -2 -3.5 -2 -3.5 2 C-3.5 -2 3 -2 3 2 C3 -2 9.5 -2 9.5 3',
];
export function faceMarks(piece) {
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
export const castShadow = (piece, [dx, dy]) => `<use href="#${piece.id}" transform="translate(${dx} ${dy})" filter="url(#flat)"/>`;

/* ─── Stars, sparkles, dots ─────────────────────────────────────────────── */

export function star([x, y], radius, points = 8, color = '#ff4a3d', turn = 0) {
  const corners = [];
  for (let index = 0; index < points * 2; index += 1) {
    const r = (index % 2 ? radius * .42 : radius) * (1 + jitter(.08));
    const angle = turn + index * Math.PI / points + jitter(.05);
    corners.push([x + r * Math.sin(angle), y - r * Math.cos(angle)]);
  }
  return `<path d="${path(corners)}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
}
export function sparkle([x, y], radius, color = '#ff4a3d') {
  const r = radius;
  const w = radius * .16;
  return `<path d="M${f(x)} ${f(y - r)} C${f(x + w)} ${f(y - w)} ${f(x + w)} ${f(y - w)} ${f(x + r * .78)} ${f(y)} C${f(x + w)} ${f(y + w)} ${f(x + w)} ${f(y + w)} ${f(x)} ${f(y + r)} C${f(x - w)} ${f(y + w)} ${f(x - w)} ${f(y + w)} ${f(x - r * .78)} ${f(y)} C${f(x - w)} ${f(y - w)} ${f(x - w)} ${f(y - w)} ${f(x)} ${f(y - r)} Z" fill="${color}"/>`;
}
export const dotAt = ([x, y], r, color = '#ff4a3d') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}"/>`;
export const ringAt = ([x, y], r, color = '#ff4a3d') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="${f(r * .55)}"/>`;

/* ─── The hand-lettered wordmark ────────────────────────────────────────── */

// A monoline alphabet, cap height 100, drawn with a round brush.
export const LETTERS = {
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
export function word(text, gap = 36) {
  let x = 0;
  const parts = [];
  for (const letter of text) {
    const { width, d } = LETTERS[letter];
    parts.push(`<path d="${d}" transform="translate(${f(x + jitter(2))} ${f(jitter(3))}) rotate(${f(jitter(2.5))} ${f(width / 2)} 50)"/>`);
    x += width + gap;
  }
  return { markup: parts.join(''), width: x - gap };
}
export function wordmark(text, [x, y], height, angle, gap, { ink = '#3a2ab8', offsetInk = '#ff4a3d' } = {}) {
  const { markup, width } = word(text, gap);
  const scale = height / 100;
  const transform = `translate(${f(x)} ${f(y)}) rotate(${angle}) scale(${scale.toFixed(4)}) translate(${f(-width / 2)} -50)`;
  const stroke = f(20);
  // Printed in two inks slightly off register: the coral a hair down and to the right.
  return `<g transform="${transform}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${stroke}">
      <g stroke="${offsetInk}" transform="translate(5 6)">${markup}</g>
      <g stroke="${ink}">${markup}</g>
    </g>`;
}

/* ─── The pack's outline and heat-sealed ends ───────────────────────────── */

export const BODY = 'M22 40 L22 72 C22 104 14 124 14 172 L14 828 C14 876 22 896 22 928 L22 960 L618 960 L618 928 C618 896 626 876 626 828 L626 172 C626 124 618 104 618 72 L618 40 Z';
export function teeth(top) {
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
export const SEAL_TOP = teeth(true);
export const SEAL_BOTTOM = teeth(false);


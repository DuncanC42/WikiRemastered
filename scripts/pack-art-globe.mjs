/* Builds extension/pack-art-globe.svg (the white pack) and extension/card-back-globe.svg (the back
 * of its cards). Run: node scripts/pack-art-globe.mjs
 *
 * A warm white paper and, on it, the world as a puzzle: a globe drawn by hand (flat inks, a
 * crescent of shade, a highlight), its continents stylised, a jigsaw grid wrapped round the sphere.
 * A few pieces lift out of it, thick, their slots left hollow; two more float away. Under it, its
 * shadow on the paper, and the wordmark in Rubik Black as on the green pack.
 *
 * Same outline, sealed ends, tear guide and placeholders (<!--cut-->, <!--fold-->) as the other
 * drawn packs, so the tear, the ribbon, the 3D bands and the dog-eared corner work unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldMarkup } from '../extension/pack-fold.js';
import { BODY, SEAL_BOTTOM, SEAL_TOP, castShadow, dotAt, drawPiece, edgePoints, f, jitter, path, pieceOutline, random, reseed, solid, sparkle } from './pack-art-kit.mjs';
import { LEAN, solid as solidLetters } from './brand.mjs';

const OUT = fileURLToPath(new URL('../extension/pack-art-globe.svg', import.meta.url));
const BACK_OUT = fileURLToPath(new URL('../extension/card-back-globe.svg', import.meta.url));
reseed(4242);

/* ─── Palette: a warm white paper, the brand's inks ──────────────────────── */

const PAPER = '#f7f4ec';
const PAPER_DEEP = '#e6e0d1'; // Shadows cast on the paper.
const INK = '#1d2640'; // Small print, and the wordmark.
const OCEAN = { face: '#3a86e0', deep: '#1f5bb1', seam: '#17488f' };
const LAND = { face: '#3ddc97', deep: '#1c9e68', seam: '#12744b' };
const SAND = '#ffc53a';
const ICE = '#fbf8ef';
const SLOT = { face: '#ff5a4c', deep: '#b8362d' }; // Where a piece came out of the globe.
const LIFTED = { face: '#3ddc97', side: '#1fb579', deep: '#15855a' }; // The pieces coming out.
const PIECE_INK = {
  coral: { face: '#ff6450', side: '#e2493b', deep: '#b8362d' },
  marigold: { face: '#ffc53a', side: '#f0a91f', deep: '#c98a1c' },
  ocean: { face: '#3a86e0', side: '#2a6cc4', deep: '#1f5bb1' },
};

/* ─── The globe ──────────────────────────────────────────────────────────── */

const rad = degrees => degrees * Math.PI / 180;
// Continents, stylised: [longitude, latitude] rings.
const CONTINENTS = {
  northAmerica: [[-168, 65], [-155, 71], [-140, 70], [-125, 72], [-95, 72], [-80, 68], [-65, 60], [-58, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 30], [-80, 25], [-84, 29], [-90, 29], [-97, 26], [-97, 20], [-94, 16], [-88, 14], [-84, 10], [-79, 8], [-83, 8], [-87, 13], [-92, 15], [-105, 20], [-110, 24], [-114, 31], [-118, 33], [-124, 40], [-125, 48], [-132, 55], [-140, 59], [-150, 60], [-160, 58], [-165, 62]],
  southAmerica: [[-79, 9], [-75, 11], [-66, 11], [-60, 8], [-52, 4], [-50, 0], [-45, -2], [-38, -5], [-35, -8], [-39, -15], [-41, -22], [-48, -26], [-54, -34], [-58, -38], [-65, -42], [-68, -50], [-72, -54], [-75, -48], [-74, -40], [-72, -30], [-71, -20], [-76, -14], [-81, -6], [-80, 0], [-78, 6]],
  eurasia: [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [0, 50], [5, 53], [8, 57], [12, 56], [18, 60], [22, 65], [28, 71], [40, 68], [55, 70], [70, 73], [90, 76], [110, 74], [130, 72], [150, 70], [170, 69], [180, 66], [178, 62], [165, 60], [160, 54], [150, 59], [140, 54], [135, 44], [129, 35], [121, 31], [122, 25], [110, 20], [108, 12], [104, 9], [100, 14], [98, 8], [92, 20], [88, 22], [80, 15], [77, 8], [73, 19], [66, 25], [57, 25], [52, 30], [48, 30], [44, 13], [43, 13], [38, 20], [33, 29], [35, 36], [28, 37], [26, 40], [23, 38], [20, 40], [15, 38], [12, 44], [8, 44], [3, 43], [-4, 36]],
  africa: [[-17, 21], [-17, 15], [-15, 11], [-8, 5], [-3, 5], [5, 4], [9, 3], [9, -2], [12, -6], [13, -12], [12, -18], [15, -27], [18, -34], [22, -34], [27, -33], [32, -28], [35, -22], [40, -15], [40, -8], [43, -1], [50, 10], [44, 12], [38, 18], [33, 30], [25, 32], [12, 33], [10, 37], [-2, 35], [-6, 35], [-10, 30], [-13, 27]],
  australia: [[114, -22], [114, -34], [118, -35], [124, -34], [132, -32], [137, -35], [141, -38], [147, -38], [150, -35], [153, -27], [153, -25], [145, -15], [142, -11], [136, -12], [131, -12], [125, -15], [121, -19]],
  greenland: [[-73, 78], [-60, 82], [-35, 83], [-20, 81], [-18, 76], [-22, 70], [-40, 64], [-50, 62], [-55, 68], [-60, 76]],
  britain: [[-6, 50], [-5, 54], [-3, 58], [0, 57], [1, 52]],
  madagascar: [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  japan: [[130, 31], [135, 34], [140, 36], [142, 40], [141, 43], [145, 44], [140, 38], [136, 36]],
};
// The Sahara, printed in marigold over Africa.
const SAHARA = [[-15, 22], [-12, 27], [-6, 31], [4, 32], [12, 31], [22, 30], [31, 26], [33, 22], [28, 17], [18, 15], [8, 16], [-2, 16], [-10, 18]];

/* An orthographic globe: `view` = { cx, cy, r, lon0, lat0, roll }. `project` returns the screen
   point of [lon, lat] and whether it faces us; points behind are pushed out past the limb, so
   that shapes clipped to the disc are cut exactly at its edge. */
function globeView({ cx, cy, r, lon0, lat0, roll = 0 }) {
  const [sl0, cl0] = [Math.sin(rad(lat0)), Math.cos(rad(lat0))];
  const [sr, cr] = [Math.sin(rad(roll)), Math.cos(rad(roll))];
  const unit = ([lon, lat]) => {
    const [la, dl] = [rad(lat), rad(lon - lon0)];
    const x = Math.cos(la) * Math.sin(dl);
    const y = Math.sin(la) * cl0 - Math.cos(la) * sl0 * Math.cos(dl);
    const z = Math.sin(la) * sl0 + Math.cos(la) * cl0 * Math.cos(dl);
    return [x * cr - y * sr, x * sr + y * cr, z];
  };
  const project = point => {
    const [x, y, z] = unit(point);
    if (z >= 0) return { at: [cx + x * r, cy - y * r], z, visible: true };
    const length = Math.hypot(x, y) || 1;
    return { at: [cx + (x / length) * r * 1.35, cy - (y / length) * r * 1.35], z, visible: false };
  };
  return { cx, cy, r, unit, project };
}

// A ring of [lon, lat] points, filled in so that long sides follow the sphere.
function densify(ring, step = 2) {
  const points = [];
  ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let k = 0; k < n; k += 1) points.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  });
  return points;
}
const ringPath = (view, ring) => path(densify(ring).map(point => view.project(point).at));

/* The jigsaw grid on the sphere: bands of 24° of latitude between the polar caps, cut in columns
   of 24° of longitude, and of 48° in the bands near the poles, where the meridians close up: so
   every piece stays about as wide as it is tall. Each edge has its tab (from the kit's profile),
   bulging across the edge as it would on the flat, its size measured on the sphere. */
const LATS = [-72, -48, -24, 0, 24, 48, 72];
const bandStep = b => (Math.max(Math.abs(LATS[b]), Math.abs(LATS[b + 1])) > 48 ? 48 : 24);
// Along a line of latitude, the edges follow the finer of the two bands that meet on it.
const lineStep = lat => {
  const steps = [];
  for (let b = 0; b + 1 < LATS.length; b += 1) if (LATS[b] === lat || LATS[b + 1] === lat) steps.push(bandStep(b));
  return Math.min(...steps);
};
const tabs = new Map();
const tabOf = key => {
  if (!tabs.has(key)) tabs.set(key, random() < .5 ? 1 : -1);
  return tabs.get(key);
};
// A horizontal edge at latitude `lat`, from `lon` over `width` degrees: points [lon, lat].
function hEdge(lon, lat, width) {
  const tab = tabOf(`h${lon},${lat}`);
  const span = width * Math.cos(rad(lat)); // Its length, in degrees of arc.
  return edgePoints(tab).map(([u, v]) => [lon + u * width, lat + v * Math.min(span, 24) * .85]);
}
// A vertical edge at longitude `lon`, from `lat` over one band: points [lon, lat].
function vEdge(lon, lat, band) {
  const tab = tabOf(`v${lon},${lat}`);
  return edgePoints(tab).map(([u, v]) => {
    const at = lat + u * band;
    return [lon + (v * band * .85) / Math.cos(rad(at)), at];
  });
}
// Every edge of the grid, each once.
function gridEdges() {
  const edges = [];
  for (const lat of LATS) {
    const step = lineStep(lat);
    for (let lon = -180; lon < 180; lon += step) edges.push(hEdge(lon, lat, step));
  }
  for (let b = 0; b + 1 < LATS.length; b += 1) {
    for (let lon = -180; lon < 180; lon += bandStep(b)) edges.push(vEdge(lon, LATS[b], LATS[b + 1] - LATS[b]));
  }
  return edges;
}
// The outline of one cell (from `lon`, in band `b`), as a ring of [lon, lat].
function cellRing(lon, b) {
  const [lo, hi] = [LATS[b], LATS[b + 1]];
  const width = bandStep(b);
  const along = lat => {
    const step = lineStep(lat);
    const points = [];
    for (let x = lon; x < lon + width; x += step) points.push(...hEdge(x, lat, step));
    return points;
  };
  const right = vEdge(lon + width >= 180 ? lon + width - 360 : lon + width, lo, hi - lo).map(([x, y]) => [lon + width >= 180 ? x + 360 : x, y]);
  return [...along(lo), ...right, ...along(hi).reverse(), ...vEdge(lon, lo, hi - lo).reverse()];
}

/* The globe, drawn: ocean, continents, the Sahara, the ice, the seams of the pieces, then the
   light (a crescent of shade on the far side, a highlight near the light, a darker limb), all
   clipped to its disc. `lifted` cells come out of it: their slot shows red, and the piece rises
   out of it, solid green, with its thickness and a highlight along its lit edge. */
function globe(view, id, { lifted = [], seamWidth = 2.2 } = {}) {
  const { cx, cy, r } = view;
  const defs = [];
  const clip = `${id}-disc`;
  defs.push(`<clipPath id="${clip}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath>`);
  const lands = Object.values(CONTINENTS).map(ring => `<path d="${ringPath(view, ring)}"/>`).join('');
  const ice = `<path d="${ringPath(view, Array.from({ length: 37 }, (_, i) => [-180 + i * 10, 72]))}" fill="${ICE}"/>`;
  const seams = gridEdges().map(edge => `<path d="M${edge.map(point => view.project(point).at).map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')}"/>`).join('');
  // The light, flat as in a print: a crescent of shade (the disc less a circle shifted to the
  // light), a highlight (a circle near the light less one shifted away), a ring at the limb.
  defs.push(`<mask id="${id}-shade"><rect x="${f(cx - r * 2)}" y="${f(cy - r * 2)}" width="${f(r * 4)}" height="${f(r * 4)}" fill="#fff"/><circle cx="${f(cx - r * .26)}" cy="${f(cy - r * .3)}" r="${f(r * 1.02)}" fill="#000"/></mask>`);
  const surface = `<g id="${id}-surface">
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${OCEAN.face}"/>
      <g fill="${LAND.face}">${lands}</g>
      <path d="${ringPath(view, SAHARA)}" fill="${SAND}"/>
      ${ice}
      <g fill="none" stroke="#0b2352" stroke-opacity=".4" stroke-width="${seamWidth}" stroke-linejoin="round">${seams}</g>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="#0b2352" fill-opacity=".34" mask="url(#${id}-shade)"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r - 3)}" fill="none" stroke="#0b2352" stroke-opacity=".22" stroke-width="6"/>
    </g>`;
  defs.push(surface);
  const body = [`<g clip-path="url(#${clip})"><use href="#${id}-surface"/>`];
  const pieces = [];
  lifted.forEach(({ lon, band, lift, turn = 0 }, index) => {
    const ring = cellRing(lon, band).map(point => view.project(point).at);
    const outline = path(ring);
    const centre = ring.reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0]).map(value => value / ring.length);
    // Out along the sphere's normal at the cell, as seen: away from the middle of the disc.
    const out = [centre[0] - cx, centre[1] - cy];
    const length = Math.hypot(...out) || 1;
    const [dx, dy] = [(out[0] / length) * lift, (out[1] / length) * lift - lift * .35];
    const cellClip = `${id}-cell${index}`;
    defs.push(`<clipPath id="${cellClip}"><path d="${outline}"/></clipPath>`);
    // The slot, red, with the shade of its own rim along the top.
    body.push(`<path d="${outline}" fill="${SLOT.face}"/>`);
    body.push(`<g clip-path="url(#${cellClip})"><path d="${outline}" fill="none" stroke="${SLOT.deep}" stroke-width="10" transform="translate(2 4)"/></g>`);
    // Its shadow on the globe, towards the far side of the light.
    body.push(`<path d="${outline}" fill="#0b2352" fill-opacity=".3" transform="translate(${f(dx * .25 + 8)} ${f(dy * .25 + 14)})"/>`);
    // The piece: its thickness (copies stepping back to the slot, near to far), then its face.
    const steps = [];
    const depth = 7;
    for (let k = depth; k >= 1; k -= 1) {
      const t = (k - 1) / (depth - 1);
      steps.push(`<path d="${outline}" fill="${t < .5 ? LIFTED.side : LIFTED.deep}" transform="translate(${f((-dx / lift) * k * 1.6)} ${f((-dy / lift) * k * 1.6 + k * .9)})"/>`);
    }
    pieces.push(`<g transform="translate(${f(dx)} ${f(dy)}) rotate(${f(turn)} ${f(centre[0])} ${f(centre[1])})">
      ${steps.join('\n      ')}
      <path d="${outline}" fill="${LIFTED.face}"/>
      <g clip-path="url(#${cellClip})"><path d="${outline}" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="5" transform="translate(3 4)"/></g>
    </g>`);
  });
  body.push('</g>');
  const arc = (from, to, radius) => {
    const [a, b] = [rad(from), rad(to)];
    return `M${f(cx + Math.cos(a) * radius)} ${f(cy + Math.sin(a) * radius)} A${f(radius)} ${f(radius)} 0 0 1 ${f(cx + Math.cos(b) * radius)} ${f(cy + Math.sin(b) * radius)}`;
  };
  const shine = `<g fill="none" stroke="#ffffff" stroke-linecap="round">
      <path d="${arc(196, 238, r * .84)}" stroke-opacity=".75" stroke-width="${f(r * .045)}"/>
      <path d="${arc(247, 256, r * .84)}" stroke-opacity=".75" stroke-width="${f(r * .045)}"/>
    </g>`;
  return { defs: defs.join('\n    '), body: [...body, shine, ...pieces].join('\n    ') };
}

const VIEW = globeView({ cx: 320, cy: 396, r: 188, lon0: 12, lat0: 20, roll: -12 });
const world = globe(VIEW, 'world', { lifted: [{ lon: 36, band: 4, lift: 50, turn: 7 }, { lon: -36, band: 3, lift: 24, turn: -5 }] });

// Two pieces floating away, flat, in the brand's inks.
const floaters = [
  { ...solid({ id: 'coral', tabs: [1, -1, 1, 1], size: 74, thick: .3, at: [548, 238], turn: [.5, .6, .7], ink: PIECE_INK.coral }), depth: 1 },
  { ...solid({ id: 'marigold', tabs: [-1, 1, 1, -1], size: 58, thick: .3, at: [96, 560], turn: [-.6, -.3, .4], ink: PIECE_INK.marigold }), depth: 1 },
];
const floatersMarkup = floaters.map(piece => `<use href="#${piece.id}"/>`).join('\n      ');
const floaterShadows = floaters.map(piece => castShadow(piece, [14, 20])).join('\n      ');

const deco = [
  sparkle([112, 214], 15, SAND),
  sparkle([540, 520], 12, OCEAN.face),
  sparkle([486, 170], 9, PIECE_INK.coral.face),
  dotAt([160, 150], 4, OCEAN.face), dotAt([590, 420], 3.5, SAND), dotAt([70, 400], 3.5, PIECE_INK.coral.face), dotAt([470, 610], 4, LAND.deep),
].join('\n    ');

/* ─── The wordmark: as on the green pack, in ink with a green depth ──────── */

const GLYPHS = JSON.parse(readFileSync(fileURLToPath(new URL('./pack-green-glyphs.json', import.meta.url)), 'utf8'));
const TYPE_INK = { face: INK, rim: '#3a4a78', near: '#2fc987', far: '#168a58' };
function wordmark({ width, top, gap }) {
  const [wiki, masters] = GLYPHS.words;
  const fit = word => width / (word.box[2] - word.box[0]);
  const slant = Math.tan(-LEAN * Math.PI / 180);
  const line = (word, scale, base, id, depth, rim) => {
    const cap = GLYPHS.capHeight * scale;
    const middle = base - cap / 2;
    const left = 320 - ((word.box[2] - word.box[0]) * scale) / 2 - depth * .2;
    const letters = solidLetters(id, [{ d: word.d, transform: `translate(${f(left - word.box[0] * scale)} ${f(base)}) scale(${scale.toFixed(5)})` }], TYPE_INK, { depth, rim });
    return { defs: letters.defs, body: `<g transform="translate(${f(slant * middle)} 0) skewX(${LEAN})">${letters.body}</g>` };
  };
  const [ws, ms] = [fit(wiki), fit(masters)];
  const wBase = top + GLYPHS.capHeight * ws;
  const a = line(wiki, ws, wBase, 'wm-wiki', 11, [1.5, 2]);
  const b = line(masters, ms, wBase + gap + GLYPHS.capHeight * ms, 'wm-masters', 7, [1.2, 1.6]);
  return { defs: a.defs + b.defs, body: a.body + b.body };
}
const type = wordmark({ width: 416, top: 662, gap: 16 });

/* ─── The pack ───────────────────────────────────────────────────────────── */

const FLAP_TOP = ['#ffffff', '#ebe6da', '#cbc4b2'];
const FLAP_BOTTOM = FLAP_TOP;
const fold = foldMarkup({ corner: 'tr', along: 52, down: 44, colors: FLAP_TOP });
const grainDefs = (width, height, seeds, dark, light = [1, .98, .92]) => `<filter id="specksDark" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="2" seed="${seeds[0]}" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  0 0 0 11 -8.1"/>
    </filter>
    <filter id="specksLight" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="${seeds[1]}" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 ${light[0]}  0 0 0 0 ${light[1]}  0 0 0 0 ${light[2]}  0 0 0 -11 2.9"/>
    </filter>
    <filter id="tooth" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="${seeds[2]}"/>
      <feColorMatrix values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  0 0 0 .9 -.35"/>
    </filter>
    <filter id="wobble" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${width + 40}" height="${height + 40}">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="9" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
const pieceDefs = floaters.map(piece => `<g id="${piece.id}">\n    ${drawPiece(piece)}\n    </g>`).join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1000" viewBox="0 0 640 1000" data-flap-top="${FLAP_TOP}" data-flap-bottom="${FLAP_BOTTOM}">
  <!-- Wiki Masters · the white pack, the world as a puzzle. Generated by scripts/pack-art-globe.mjs: edit the script, not this file. -->
  <defs>
    ${grainDefs(640, 1000, [41, 43, 45], [.1, .09, .06])}
    <filter id="flat" filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <feFlood flood-color="${PAPER_DEEP}"/>
      <feComposite in2="SourceAlpha" operator="in"/>
    </filter>
    <pattern id="ridges" width="6" height="10" patternUnits="userSpaceOnUse">
      <rect width="2" height="10" fill="#ffffff" fill-opacity=".8"/>
      <rect x="3" width="1.4" height="10" fill="#b9b2a0" fill-opacity=".45"/>
    </pattern>
    <linearGradient id="pinchTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9b2a0" stop-opacity=".45"/>
      <stop offset="1" stop-color="#b9b2a0" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="pinchBottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#b9b2a0" stop-opacity=".5"/>
      <stop offset="1" stop-color="#b9b2a0" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="bodyClip"><path d="${BODY}"/></clipPath>
    <clipPath id="packClip"><path d="${BODY}"/><path d="${SEAL_TOP}"/><path d="${SEAL_BOTTOM}"/></clipPath>
    <clipPath id="sealTopClip"><path d="${SEAL_TOP}"/></clipPath>
    <clipPath id="sealBottomClip"><path d="${SEAL_BOTTOM}"/></clipPath>
    ${world.defs}
    ${pieceDefs}
    ${type.defs}
  <!--cut-->
    ${fold.cut}
  <!--/cut-->
  </defs>
  <g mask="url(#foldCut)">

  <!-- The paper: a warm white, shade under the seals. -->
  <path d="${BODY}" fill="${PAPER}"/>
  <path d="${SEAL_TOP}" fill="${PAPER}"/>
  <path d="${SEAL_BOTTOM}" fill="${PAPER}"/>
  <g clip-path="url(#bodyClip)">
    <rect x="0" y="62" width="640" height="46" fill="url(#pinchTop)"/>
    <rect x="0" y="892" width="640" height="46" fill="url(#pinchBottom)"/>
    <g filter="url(#wobble)">
      <!-- The globe's shadow on the paper, then the globe. -->
      <ellipse cx="${f(VIEW.cx + 22)}" cy="${f(VIEW.cy + VIEW.r + 30)}" rx="${f(VIEW.r * .78)}" ry="20" fill="${PAPER_DEEP}"/>
      ${deco}
      ${floaterShadows}
      ${world.body}
      ${floatersMarkup}
      ${type.body}
    </g>
  </g>
  <path d="M22 72 C22 104 14 124 14 172 L14 828 C14 876 22 896 22 928" stroke="#ffffff" stroke-opacity=".8" stroke-width="1.5" fill="none"/>
  <path d="M618 72 C618 104 626 124 626 172 L626 828 C626 876 618 896 618 928" stroke="#a79f8a" stroke-opacity=".5" stroke-width="2" fill="none"/>

  <!-- Heat-sealed ends: the same paper, ribbed and crimped. -->
  <g clip-path="url(#sealTopClip)">
    <rect x="0" y="0" width="640" height="80" fill="url(#ridges)"/>
  </g>
  <line x1="22" y1="66" x2="618" y2="66" stroke="#a79f8a" stroke-opacity=".5" stroke-width="1.4"/>
  <g clip-path="url(#sealBottomClip)">
    <rect x="0" y="920" width="640" height="80" fill="url(#ridges)"/>
  </g>
  <line x1="22" y1="934" x2="618" y2="934" stroke="#a79f8a" stroke-opacity=".5" stroke-width="1.4"/>

  <!-- Tear guide at 9 %. -->
  <line x1="44" y1="90" x2="596" y2="90" stroke="${INK}" stroke-opacity=".3" stroke-width="1.4" stroke-dasharray="4 7" stroke-linecap="round"/>

  <g font-family="'SF Pro Rounded', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" text-anchor="middle" fill="${INK}" fill-opacity=".75">
    <text x="320" y="128" font-size="13" letter-spacing="6">ENCYCLOPÉDIE · SÉRIE III</text>
    <text x="320" y="908" font-size="13" letter-spacing="6">COLLECTIONNEZ LE SAVOIR</text>
  </g>

  <!-- The grain, over everything. -->
  <g clip-path="url(#packClip)">
    <rect width="640" height="1000" filter="url(#tooth)" opacity=".1"/>
    <rect width="640" height="1000" filter="url(#specksDark)" opacity=".28"/>
    <rect width="640" height="1000" filter="url(#specksLight)" opacity=".5"/>
  </g>
  </g>
  <!--fold-->
  ${fold.fold}
  <!--/fold-->
</svg>
`;
writeFileSync(OUT, svg);
console.log(`${OUT}: ${(svg.length / 1024).toFixed(1)} KB`);

/* ─── The back of its cards ──────────────────────────────────────────────── */

/* 500 × 700. A deep blue (the rarity colour still shows on the rim as a card charges), a loose
   pattern of small flat pieces, a cream frame drawn by hand, and in the middle the world again,
   smaller, on a cream medallion, one piece lifting out. */
const BACK = '#1f4fae';
const BACK_PATTERN = '#2a5fc2';
const BACK_SHADE = '#133a86';
const CREAM = '#f7f0dc';
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
    const x = column * 74 + (row % 2 ? 37 : 0) + jitter(10);
    const y = row * 72 + 20 + jitter(8);
    if (x < 62 || x > 438 || y < 62 || y > 638 || Math.hypot((x - 250) / 1.05, y - 350) < 200) continue;
    const accent = random() < .1;
    const color = accent ? [SAND, PIECE_INK.coral.face, LAND.face][Math.floor(random() * 3)] : BACK_PATTERN;
    if (random() < .55) pattern.push(flatPiece([x, y], 28 + jitter(4), random() * Math.PI * 2, color, [1, random() < .5 ? 1 : -1, -1, 1]));
    else pattern.push(dotAt([x, y], 4 + jitter(1), color));
  }
}
const MINI = globeView({ cx: 250, cy: 350, r: 134, lon0: 12, lat0: 20, roll: -12 });
const mini = globe(MINI, 'mini', { lifted: [{ lon: 36, band: 4, lift: 32, turn: 7 }], seamWidth: 1.6 });
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700">
  <!-- Back of the cards for the white pack. Generated by scripts/pack-art-globe.mjs. -->
  <defs>
    ${grainDefs(500, 700, [47, 49, 51], [.02, .06, .2])}
    ${mini.defs}
  </defs>
  <rect width="500" height="700" fill="${BACK}"/>
  <g filter="url(#wobble)">
    ${pattern.join('\n    ')}
    <rect x="30" y="30" width="440" height="640" rx="30" fill="none" stroke="${CREAM}" stroke-width="5"/>
    ${sparkle([100, 118], 14, SAND)}
    ${sparkle([404, 586], 12, CREAM)}
    <!-- The medallion, its shadow, and the world on it. -->
    <circle cx="${MINI.cx + 12}" cy="${MINI.cy + 18}" r="${MINI.r + 16}" fill="${BACK_SHADE}"/>
    <circle cx="${MINI.cx}" cy="${MINI.cy}" r="${MINI.r + 16}" fill="${CREAM}"/>
    ${mini.body}
  </g>
  <rect width="500" height="700" filter="url(#tooth)" opacity=".14"/>
  <rect width="500" height="700" filter="url(#specksDark)" opacity=".4"/>
  <rect width="500" height="700" filter="url(#specksLight)" opacity=".4"/>
</svg>
`;
writeFileSync(BACK_OUT, backSvg);
console.log(`${BACK_OUT}: ${(backSvg.length / 1024).toFixed(1)} KB`);

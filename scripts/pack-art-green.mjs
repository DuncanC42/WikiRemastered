/* Builds extension/pack-art-green.svg (the green pack) and extension/card-back-green.svg (the
 * back of its cards). Run: node scripts/pack-art-green.mjs
 *
 * The same hand as the puzzle pack (flat paper, pieces in 3D in flat inks, a hand-lettered
 * wordmark, a print grain), grown up: one idea instead of a scatter. A small square puzzle of
 * four pieces lies tilted on a deep green paper, one piece lifted out of it and floating over its
 * slot; a halftone sun behind it and registration marks as on a printer's proof. The wordmark is
 * set in Rubik Black, the WikiRemastered logo's face, as a justified block ("WIKI" as wide as
 * "MASTERS"), leaning like the logo, in cream solid letters with a deep green depth.
 *
 * Same outline, sealed ends, tear guide and placeholders (<!--cut-->, <!--fold-->) as the other
 * drawn packs, so the tear, the ribbon, the 3D bands and the dog-eared corner work unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldMarkup } from '../extension/pack-fold.js';
import { BODY, SEAL_BOTTOM, SEAL_TOP, apply, castShadow, dotAt, drawPiece, drawPieceParts, f, jitter, path, pieceOutline, random, reseed, ringAt, rotation, solid, sparkle } from './pack-art-kit.mjs';
import { LEAN, solid as solidLetters } from './brand.mjs';

const OUT = fileURLToPath(new URL('../extension/pack-art-green.svg', import.meta.url));
const BACK_OUT = fileURLToPath(new URL('../extension/card-back-green.svg', import.meta.url));
reseed(2718);

/* ─── Palette: a deep green paper, warm inks ─────────────────────────────── */

const PAPER = '#1c9a66';
const PAPER_DEEP = '#137a4f'; // Shadows cast on the paper.
const INK_DARK = '#0b4630'; // The wordmark's shadow, the halftone, the small print.
const CREAM = '#f7f0dc';
const INK = {
  cream: { face: '#f7f0dc', side: '#e6d6ae', deep: '#c6ad78' },
  marigold: { face: '#ffc53a', side: '#f0a91f', deep: '#c98a1c' },
  coral: { face: '#ff6450', side: '#e2493b', deep: '#b8362d' },
  mint: { face: '#a4f3cf', side: '#71dbab', deep: '#46b784' },
};

/* ─── The puzzle: four pieces on one tilted plane, one of them lifted ─────── */

const SIZE = 178;
const TURN = [.86, -.12, -.42];
const PLANE = rotation(...TURN);
const CENTRE = [370, 424];
// Where a point of the puzzle's plane (in pieces, from the middle of the square) lands.
const onPlane = ([u, v], lift = 0) => {
  const [x, y, z] = apply(PLANE, [u * SIZE, v * SIZE, lift]);
  return { at: [CENTRE[0] + x, CENTRE[1] + y], z };
};
// A 2 × 2 puzzle with straight outer edges: its tabs interlock (top, right, bottom, left). The
// front left piece is the one that is missing.
const CELLS = [
  { id: 'a', cell: [-.5, -.5], tabs: [0, 1, -1, 0], ink: INK.mint, shine: false },
  { id: 'b', cell: [.5, -.5], tabs: [0, 0, 1, -1], ink: INK.marigold, shine: false }, // Highlights would cross the joints.
  { id: 'd', cell: [.5, .5], tabs: [-1, 0, 0, 1], ink: INK.coral },
];
const LIFTED = { id: 'c', cell: [-.5, .5], tabs: [1, -1, 0, 0], ink: INK.cream };
const pieces = CELLS.map(({ id, cell, tabs, ink, shine = true }) => {
  const { at, z } = onPlane(cell);
  return { ...solid({ id, tabs, size: SIZE, thick: .2, at, turn: TURN, ink, shine }), depth: z };
});
// The missing piece: lifted out of its slot and moved aside, up and to the left, turned towards us.
const slot = onPlane(LIFTED.cell).at;
const LIFT = [-106, -214];
const lifted = { ...solid({ id: LIFTED.id, tabs: LIFTED.tabs, size: SIZE * .92, thick: .2, at: [slot[0] + LIFT[0], slot[1] + LIFT[1]], turn: [.42, .3, -.06], ink: LIFTED.ink }), depth: 1000 };
pieces.sort((a, b) => a.depth - b.depth);
// Where it belongs: its outline, dashed, in the empty slot.
const ghost = solid({ id: 'ghost', tabs: LIFTED.tabs, size: SIZE, thick: .2, at: slot, turn: TURN, ink: LIFTED.ink });
const slotMarkup = `<path d="${path(ghost.outline.map(point => ghost.place(point, -ghost.half)))}" fill="${INK_DARK}" fill-opacity=".3"/>`;

/* ─── Print marks, orbit, sparkles, halftone ─────────────────────────────── */

const registration = ([x, y], r) => `<g fill="none" stroke="${CREAM}" stroke-opacity=".55" stroke-width="2">
      <circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/>
      <path d="M${f(x - r * 1.7)} ${f(y)} H${f(x + r * 1.7)} M${f(x)} ${f(y - r * 1.7)} V${f(y + r * 1.7)}"/>
    </g>`;
// A halftone disc: dots on a grid, bigger towards the middle.
function halftone([cx, cy], radius, color) {
  const dots = [];
  for (let y = cy - radius; y <= cy + radius; y += 13) {
    for (let x = cx - radius; x <= cx + radius; x += 13) {
      const off = ((y - cy + radius) / 13) % 2 ? 6.5 : 0;
      const d = Math.hypot(x + off - cx, y - cy) / radius;
      if (d > 1) continue;
      dots.push(`<circle cx="${f(x + off)}" cy="${f(y)}" r="${f(4.6 * (1 - d * .75))}"/>`);
    }
  }
  return `<g fill="${color}">${dots.join('')}</g>`;
}
const deco = [
  halftone([356, 382], 200, INK_DARK),
  registration([566, 186], 11),
  registration([74, 616], 11),
  sparkle([488, 232], 17, CREAM),
  sparkle([80, 452], 12, INK.marigold.face),
  sparkle([574, 588], 10, CREAM),
  dotAt([430, 176], 4, CREAM), dotAt([62, 330], 3.5, INK.marigold.face), dotAt([556, 500], 3.5, CREAM),
  ringAt([540, 292], 6, INK.coral.face),
].join('\n    ');

/* ─── The wordmark: Rubik Black, a justified block, solid ────────────────── */

// Outlines from scripts/glyphs.py --gpos (Rubik Black, with its kerning): font units, y down.
const GLYPHS = JSON.parse(readFileSync(fileURLToPath(new URL('./pack-green-glyphs.json', import.meta.url)), 'utf8'));
const TYPE_INK = { face: CREAM, rim: '#ffffff', near: '#0e5a3b', far: '#05301f' };
function wordmark({ width, top, gap }) {
  const [wiki, masters] = GLYPHS.words;
  const fit = word => width / (word.box[2] - word.box[0]); // Each word as wide as the block.
  const slant = Math.tan(-LEAN * Math.PI / 180);
  const line = (word, scale, base, id, depth, rim) => {
    const cap = GLYPHS.capHeight * scale;
    const middle = base - cap / 2;
    // Centred on the pack's axis at its own mid-height (so the lean shifts neither line), a hair
    // to the left for its depth, which adds weight down and to the right.
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

const FLAP_TOP = ['#5fd9a2', '#1c9a66', '#11724a'];
const FLAP_BOTTOM = FLAP_TOP;
const fold = foldMarkup({ corner: 'tr', along: 52, down: 44, colors: FLAP_TOP });
const all = [...pieces, lifted];
// Each piece once in the defs (its silhouette makes its shadow); the puzzle's pieces also in two
// parts, walls then faces, drawn all walls first.
const defs = all.map(piece => `<g id="${piece.id}">\n    ${drawPiece(piece)}\n    </g>`);
const parts = pieces.map(drawPieceParts);
const piecesMarkup = [...parts.flatMap(part => part.walls), ...parts.flatMap(part => part.face)].join('\n      ');
const shadows = [...pieces.map(piece => castShadow(piece, [10, 14])), castShadow(lifted, [-LIFT[0] * .45, -LIFT[1] * .45])].join('\n      ');

const grainDefs = (width, height, seeds, dark) => `<filter id="specksDark" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="2" seed="${seeds[0]}" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  0 0 0 11 -8.1"/>
    </filter>
    <filter id="specksLight" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="${seeds[1]}" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 .97  0 0 0 0 .88  0 0 0 -11 2.9"/>
    </filter>
    <filter id="tooth" filterUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
      <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="${seeds[2]}"/>
      <feColorMatrix values="0 0 0 0 ${dark[0]}  0 0 0 0 ${dark[1]}  0 0 0 0 ${dark[2]}  0 0 0 .9 -.35"/>
    </filter>
    <filter id="wobble" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${width + 40}" height="${height + 40}">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="9" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1000" viewBox="0 0 640 1000" data-flap-top="${FLAP_TOP}" data-flap-bottom="${FLAP_BOTTOM}">
  <!-- Wiki Masters · the green pack. Generated by scripts/pack-art-green.mjs: edit the script, not this file. -->
  <defs>
    ${grainDefs(640, 1000, [21, 23, 25], [0, .12, .06])}
    <filter id="flat" filterUnits="userSpaceOnUse" x="0" y="0" width="640" height="1000">
      <feFlood flood-color="${PAPER_DEEP}"/>
      <feComposite in2="SourceAlpha" operator="in"/>
    </filter>
    <pattern id="ridges" width="6" height="10" patternUnits="userSpaceOnUse">
      <rect width="2" height="10" fill="#d6ffe9" fill-opacity=".3"/>
      <rect x="3" width="1.4" height="10" fill="#07402a" fill-opacity=".4"/>
    </pattern>
    <linearGradient id="pinchTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07402a" stop-opacity=".45"/>
      <stop offset="1" stop-color="#07402a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="pinchBottom" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#07402a" stop-opacity=".5"/>
      <stop offset="1" stop-color="#07402a" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="light" cx=".42" cy=".38" r=".75">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".09"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="bodyClip"><path d="${BODY}"/></clipPath>
    <clipPath id="packClip"><path d="${BODY}"/><path d="${SEAL_TOP}"/><path d="${SEAL_BOTTOM}"/></clipPath>
    <clipPath id="sealTopClip"><path d="${SEAL_TOP}"/></clipPath>
    <clipPath id="sealBottomClip"><path d="${SEAL_BOTTOM}"/></clipPath>
    ${defs.join('\n    ')}
    ${type.defs}
  <!--cut-->
    ${fold.cut}
  <!--/cut-->
  </defs>
  <g mask="url(#foldCut)">

  <!-- The paper: one deep green, a soft light on it, shade under the seals. -->
  <path d="${BODY}" fill="${PAPER}"/>
  <path d="${SEAL_TOP}" fill="${PAPER}"/>
  <path d="${SEAL_BOTTOM}" fill="${PAPER}"/>
  <g clip-path="url(#bodyClip)">
    <rect width="640" height="1000" fill="url(#light)"/>
    <rect x="0" y="62" width="640" height="46" fill="url(#pinchTop)"/>
    <rect x="0" y="892" width="640" height="46" fill="url(#pinchBottom)"/>
    <g filter="url(#wobble)">
      ${deco}
      <!-- Flat shadows on the paper; the lifted piece's falls further, into its own slot. -->
      ${shadows}
      ${slotMarkup}
      ${piecesMarkup}
      <use href="#${lifted.id}"/>
      ${type.body}
    </g>
  </g>
  <path d="M22 72 C22 104 14 124 14 172 L14 828 C14 876 22 896 22 928" stroke="#c9ffe4" stroke-opacity=".35" stroke-width="1.5" fill="none"/>
  <path d="M618 72 C618 104 626 124 626 172 L626 828 C626 876 618 896 618 928" stroke="#063826" stroke-opacity=".5" stroke-width="2" fill="none"/>

  <!-- Heat-sealed ends: the same paper, ribbed and crimped. -->
  <g clip-path="url(#sealTopClip)">
    <rect x="0" y="0" width="640" height="80" fill="url(#ridges)"/>
  </g>
  <line x1="22" y1="66" x2="618" y2="66" stroke="#063826" stroke-opacity=".5" stroke-width="1.4"/>
  <g clip-path="url(#sealBottomClip)">
    <rect x="0" y="920" width="640" height="80" fill="url(#ridges)"/>
  </g>
  <line x1="22" y1="934" x2="618" y2="934" stroke="#063826" stroke-opacity=".5" stroke-width="1.4"/>

  <!-- Tear guide at 9 %. -->
  <line x1="44" y1="90" x2="596" y2="90" stroke="${CREAM}" stroke-opacity=".45" stroke-width="1.4" stroke-dasharray="4 7" stroke-linecap="round"/>

  <g font-family="'SF Pro Rounded', 'SF Pro Display', 'Helvetica Neue', 'Segoe UI', Helvetica, Arial, sans-serif" font-weight="800" text-anchor="middle" fill="${CREAM}" fill-opacity=".8">
    <text x="320" y="128" font-size="13" letter-spacing="6">ENCYCLOPÉDIE · SÉRIE II</text>
    <text x="320" y="908" font-size="13" letter-spacing="6">COLLECTIONNEZ LE SAVOIR</text>
  </g>

  <!-- The grain, over everything. -->
  <g clip-path="url(#packClip)">
    <rect width="640" height="1000" filter="url(#tooth)" opacity=".14"/>
    <rect width="640" height="1000" filter="url(#specksDark)" opacity=".4"/>
    <rect width="640" height="1000" filter="url(#specksLight)" opacity=".4"/>
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

/* 500 × 700. A deep green, darker than the pack so the rarity colour still shows on the rim as a
   card charges; a loose pattern of small flat pieces, a cream frame drawn by hand, and in the
   middle the lifted piece again, in cream, over its slot. */
const BACK = '#11694a';
const BACK_PATTERN = '#18805a';
const BACK_SHADE = '#0a4b34';
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
    if (x < 62 || x > 438 || y < 62 || y > 638 || Math.hypot((x - 250) / 1.05, y - 350) < 196) continue;
    const accent = random() < .1;
    const color = accent ? [INK.marigold.face, INK.coral.face, CREAM][Math.floor(random() * 3)] : BACK_PATTERN;
    if (random() < .55) pattern.push(flatPiece([x, y], 28 + jitter(4), random() * Math.PI * 2, color, [1, random() < .5 ? 1 : -1, -1, 1]));
    else pattern.push(dotAt([x, y], 4 + jitter(1), color));
  }
}
const emblem = solid({ id: 'emblem', tabs: [1, -1, 1, 1], size: 206, thick: .26, at: [270, 346], turn: [.34, -.3, -.2], ink: INK.cream });
const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700">
  <!-- Back of the cards for the green pack. Generated by scripts/pack-art-green.mjs. -->
  <defs>
    ${grainDefs(500, 700, [27, 29, 31], [0, .08, .04])}
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
    <rect x="30" y="30" width="440" height="640" rx="30" fill="none" stroke="${CREAM}" stroke-width="5"/>
    ${registration([92, 112], 9)}
    ${registration([408, 588], 9)}
    ${sparkle([404, 150], 14, INK.marigold.face)}
    ${sparkle([98, 556], 12, CREAM)}
    <use href="#emblem" transform="translate(16 24)" filter="url(#flat)"/>
    <use href="#emblem"/>
  </g>
  <rect width="500" height="700" filter="url(#tooth)" opacity=".14"/>
  <rect width="500" height="700" filter="url(#specksDark)" opacity=".42"/>
  <rect width="500" height="700" filter="url(#specksLight)" opacity=".4"/>
</svg>
`;
writeFileSync(BACK_OUT, backSvg);
console.log(`${BACK_OUT}: ${(backSvg.length / 1024).toFixed(1)} KB`);

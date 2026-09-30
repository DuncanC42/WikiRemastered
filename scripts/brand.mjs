/* Builds the WikiRemastered brand: the logo, the extension icon and the Chrome Web Store images.
 * Run: node scripts/brand.mjs, then sh scripts/brand-png.sh for the PNG exports.
 *
 * Made like the puzzle pack's pieces and the card back: solid 3D shapes with a flat lit face, a
 * light rim along their upper edges, a two-tone depth below, and a print grain. The letters are a
 * heavy geometric lowercase drawn as round-ended strokes (no font: the SVG is shown as an image,
 * which only ever sees the system's fonts), leaning slightly forward.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const at = path => fileURLToPath(new URL(`../${path}`, import.meta.url));
const f = value => (Math.round(value * 100) / 100).toString();
const hex = color => `#${color.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`;
const rgb = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
const mix = (a, b, t) => hex(rgb(a).map((value, index) => value + (rgb(b)[index] - value) * t));

// The site's green, and the inks of the puzzle pack.
export const GREEN = { face: '#3ddc97', rim: '#b4f7d8', shift: '#2fc987', near: '#1c9e68', far: '#0a4a31' };
export const WHITE = { face: '#f3f6f2', rim: '#ffffff', shift: '#dbe4de', near: '#9db3a8', far: '#3f4f47' };
export const CORAL = { face: '#ff5a4c', rim: '#ffb3a8', shift: '#ec4a3d', near: '#c23b3b', far: '#6e1f1f' };

/* A heavy geometric lowercase (and the two capitals), baseline 100, x-height 44, caps at 4. */
const LETTERS = {
  W: { width: 92, d: 'M0 4 L22 96 L46 34 L70 96 L92 4' },
  R: { width: 60, d: 'M0 100 L0 4 L32 4 C62 4 62 52 32 52 L0 52 M30 52 L60 100' },
  i: { width: 0, d: 'M0 52 L0 100', dot: [0, 18] },
  k: { width: 48, d: 'M0 4 L0 100 M46 48 L6 82 M22 70 L48 100' },
  e: { width: 56, d: 'M0 72 L56 72 A28 28 0 1 0 49.4 90' },
  m: { width: 76, d: 'M0 100 L0 48 M0 66 C0 52 8 44 20 44 C32 44 38 52 38 66 L38 100 M38 66 C38 52 46 44 58 44 C70 44 76 52 76 66 L76 100' },
  a: { width: 56, d: 'M56 46 L56 100 M56 72 A28 28 0 1 1 0 72 A28 28 0 1 1 56 72' },
  s: { width: 50, d: 'M48 54 C43 47 36 44 26 44 C13 44 5 50 5 59 C5 80 50 68 50 86 C50 95 40 100 27 100 C16 100 7 96 2 89' },
  t: { width: 40, d: 'M16 14 L16 84 C16 94 22 100 32 100 L40 100 M0 48 L38 48' },
  r: { width: 32, d: 'M0 100 L0 48 M0 70 C0 54 12 44 32 46' },
  d: { width: 56, d: 'M56 4 L56 100 M56 72 A28 28 0 1 1 0 72 A28 28 0 1 1 56 72' },
};
const STROKE = 20;
const GAP = 16;

// Shapes are strokes ({ d, stroke, at }) or fills ({ d, at }), at a translation `at`.
function paint(shapes, color, [dx, dy] = [0, 0]) {
  return `<g transform="translate(${f(dx)} ${f(dy)})">${shapes.map(shape => {
    const move = shape.transform ? ` transform="${shape.transform}"` : shape.at ? ` transform="translate(${f(shape.at[0])} ${f(shape.at[1])})"` : '';
    return shape.stroke
      ? `<path d="${shape.d}"${move} fill="none" stroke="${color}" stroke-width="${shape.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="${shape.d}"${move} fill="${color}"/>`;
  }).join('')}</g>`;
}

/* A solid: its depth (copies stepping back along `toward`, from the near shade to the far one),
   then its face, lit, with a light rim left along its upper edges (the face shifted down and
   right, cut to the face, covers the rest). */
export function solid(id, shapes, ink, { depth = 12, toward = [.45, 1], rim = [2.2, 2.8] } = {}) {
  const [tx, ty] = toward;
  const length = Math.hypot(tx, ty);
  const steps = [];
  for (let k = depth; k >= 1; k -= 1) steps.push(paint(shapes, mix(ink.near, ink.far, (k - 1) / Math.max(1, depth - 1)), [tx / length * k, ty / length * k]));
  return {
    defs: `<mask id="${id}" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="4000" height="4000"><rect x="-2000" y="-2000" width="4000" height="4000" fill="#000"/>${paint(shapes, '#fff')}</mask>`,
    body: `${steps.join('')}${paint(shapes, ink.rim)}<g mask="url(#${id})">${paint(shapes, ink.face, rim)}</g>`,
  };
}

// A word, as stroke shapes, letter by letter. Returns its shapes and its width.
function word(text) {
  let x = 0;
  const shapes = [];
  for (const letter of text) {
    const { width, d, dot } = LETTERS[letter];
    shapes.push({ d, stroke: STROKE, at: [x, 0] });
    if (dot) shapes.push({ d: `M${-STROKE * .56} 0 a${STROKE * .56} ${STROKE * .56} 0 1 0 ${STROKE * 1.12} 0 a${STROKE * .56} ${STROKE * .56} 0 1 0 ${-STROKE * 1.12} 0 Z`, at: [x + dot[0], dot[1]] });
    x += width + GAP;
  }
  return { shapes, width: x - GAP };
}

// The print grain, on the shapes only: fine specks, dark and light.
export const grain = (id, scale = 1) => `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${f(.55 / scale)}" numOctaves="2" seed="7" result="noise"/>
    <feColorMatrix in="noise" values="0 0 0 0 0  0 0 0 0 .08  0 0 0 0 .05  0 0 0 9 -6.4" result="dark"/>
    <feComposite in="dark" in2="SourceAlpha" operator="in" result="darkOn"/>
    <feColorMatrix in="noise" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -9 2.7" result="light"/>
    <feComposite in="light" in2="SourceAlpha" operator="in" result="lightOn"/>
    <feComponentTransfer in="darkOn" result="darkSoft"><feFuncA type="linear" slope=".32"/></feComponentTransfer>
    <feComponentTransfer in="lightOn" result="lightSoft"><feFuncA type="linear" slope=".3"/></feComponentTransfer>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="darkSoft"/><feMergeNode in="lightSoft"/></feMerge>
  </filter>`;

export const LEAN = -6; // Degrees: the wordmark leans forward a little.
export const GLYPHS = JSON.parse(readFileSync(at('scripts/brand-glyphs.json'), 'utf8'));

/* The logo: "Wiki" in the site's green, "Remastered" in white, cut from a heavy display face
   (scripts/glyphs.py turns its letters into outlines) and made solid. `glyphs` is what that
   script wrote; the letters are scaled so that capitals are 100 units tall. */
export function logo(glyphs = GLYPHS) {
  const scale = 100 / glyphs.capHeight;
  const [wiki, rest] = glyphs.words;
  const join = glyphs.unitsPerEm * .02; // Between the two words: they read as one name.
  const at = x => `translate(${f(x)} 100) scale(${scale.toFixed(5)})`;
  const a = solid('wr-logo-wiki', [{ d: wiki.d, transform: at(0) }], GREEN, { depth: 11, rim: [1.8, 2.3] });
  const b = solid('wr-logo-rest', [{ d: rest.d, transform: at((wiki.width + join) * scale) }], WHITE, { depth: 11, rim: [1.8, 2.3] });
  const pad = 6;
  const lean = Math.tan(-LEAN * Math.PI / 180) * 100;
  const descent = Math.abs(glyphs.descender) * scale * .1; // Room for descenders (there are none).
  const width = Math.ceil((wiki.width + join + rest.width) * scale + pad * 2 + lean + 12);
  const height = Math.ceil(100 + descent + pad * 2 + 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- WikiRemastered, in ${glyphs.font}. Generated by scripts/brand.mjs. -->
  <title>WikiRemastered</title>
  <defs>${a.defs}${b.defs}${grain('wr-logo-grain')}</defs>
  <g filter="url(#wr-logo-grain)">
    <g transform="translate(${f(pad + lean)} ${pad}) skewX(${LEAN})">${a.body}${b.body}</g>
  </g>
</svg>
`;
}

// A small jigsaw piece, centred on (0, 0), `size` wide: its path, and its outline's points.
function pieceOutline(size, tabs = [1, 1, -1, 1]) { return pieceShape(size, tabs).d; }
export function pieceShape(size, tabs = [1, 1, -1, 1]) {
  const knob = [[.3, 0], [.37, .012], [.415, .06], [.41, .12]];
  const edge = tab => {
    if (!tab) return [[0, 0], [.03, 0], [.97, 0], [1, 0]];
    const profile = [[0, 0], [.03, 0], ...knob];
    for (let step = 0; step <= 8; step += 1) {
      const angle = (212 - step * 244 / 8) * Math.PI / 180;
      profile.push([.5 + .125 * Math.cos(angle), .21 + .125 * Math.sin(angle)]);
    }
    for (const [u, v] of [...knob].reverse()) profile.push([1 - u, v]);
    profile.push([.97, 0], [1, 0]);
    return profile.map(([u, v]) => [u, v * tab]);
  };
  const corners = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]];
  const points = [];
  for (let side = 0; side < 4; side += 1) {
    const [sx, sy] = corners[side];
    const [ex, ey] = corners[(side + 1) % 4];
    const dx = ex - sx;
    const dy = ey - sy;
    edge(tabs[side]).slice(0, -1).forEach(([u, v]) => points.push([sx + dx * u + dy * v, sy + dy * u - dx * v]));
  }
  const rounded = [];
  points.forEach(([px, py], index) => {
    const [qx, qy] = points[(index + 1) % points.length];
    rounded.push([.75 * px + .25 * qx, .75 * py + .25 * qy], [.25 * px + .75 * qx, .25 * py + .75 * qy]);
  });
  const outline = rounded.map(([x, y]) => [x * size, y * size]);
  return { d: `M${outline.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`, points: outline };
}

/* The icon: a solid green jigsaw piece with the logo's W raised on its face (white, its edges in
   the piece's own deep greens, so it reads as part of it) and a coral plus, both from the logo's
   face. On a 128 grid, the art within the middle 112 (Chrome wants a margin around icons). */
export const RAISED = { face: '#f6faf7', rim: '#ffffff', shift: '#e3ece6', near: '#138557', far: '#0a4a31' };
export function icon({ size = 128, glyphs = GLYPHS } = {}) {
  const glyph = text => glyphs.words.find(word => word.text === text);
  // A glyph, centred on (0, 0), `height` tall.
  const centred = (word, height) => {
    const [left, top, right, bottom] = word.box;
    const scale = height / (bottom - top);
    return `scale(${scale.toFixed(5)}) translate(${f(-(left + right) / 2)} ${f(-(top + bottom) / 2)})`;
  };
  const shape = pieceShape(76, [1, 1, -1, -1]);
  const piece = solid('wr-icon-piece', [{ d: shape.d, at: [58, 66] }], GREEN, { depth: 9, rim: [2, 2.6] });
  // The W sits a little up and to the right of the middle of the piece's square, where its
  // knobs pull the eye.
  const letterAt = [62, 64];
  const letter = solid('wr-icon-w', [{ d: glyph('W').d, transform: centred(glyph('W'), 42) }], RAISED, { depth: 3.5, rim: [1.1, 1.4] });
  const plus = solid('wr-icon-plus', [{ d: glyph('+').d, transform: centred(glyph('+'), 27) }], CORAL, { depth: 4, rim: [1, 1.3] });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <!-- WikiRemastered icon. Generated by scripts/brand.mjs. -->
  <defs>${piece.defs}${letter.defs}${plus.defs}${grain('wr-icon-grain', .6)}</defs>
  <g filter="url(#wr-icon-grain)">
    <g transform="rotate(-6 64 64)">
      ${piece.body}
      <g transform="translate(${f(letterAt[0])} ${f(letterAt[1])}) skewX(${LEAN})">${letter.body}</g>
    </g>
    <g transform="translate(101 25) rotate(8)">${plus.body}</g>
  </g>
</svg>
`;
}

/* The compact lockup, for the site's menu: the icon, and beside it the wordmark, either on one
   line in a condensed face or stacked on two ("Wiki" over "Remastered"). */
export function lockup({ glyphs = GLYPHS, stacked = false } = {}) {
  const scale = 100 / glyphs.capHeight;
  const [wiki, rest] = glyphs.words;
  const lean = Math.tan(-LEAN * Math.PI / 180) * 100;
  const line = 100 + 18; // Baseline to baseline, stacked: the lines close, clear of the depth.
  const join = glyphs.unitsPerEm * .015;
  const place = (x, y) => `translate(${f(x)} ${f(y)}) scale(${scale.toFixed(5)})`;
  const restAt = stacked ? [0, 100 + line] : [(wiki.width + join) * scale, 100];
  const a = solid('wr-lock-wiki', [{ d: wiki.d, transform: place(0, 100) }], GREEN, { depth: stacked ? 8 : 10, rim: [1.6, 2] });
  const b = solid('wr-lock-rest', [{ d: rest.d, transform: place(...restAt) }], WHITE, { depth: stacked ? 8 : 10, rim: [1.6, 2] });
  const textWidth = stacked ? Math.max(wiki.width, rest.width) * scale : (wiki.width + join + rest.width) * scale;
  const textHeight = stacked ? 100 + line + 10 : 110;
  const iconSize = stacked ? textHeight * .9 : 190; // The icon's art fills about 80 % of its box.
  const gap = stacked ? 34 : 12;
  const pad = 6;
  const width = Math.ceil(pad * 2 + iconSize + gap + textWidth + lean + 12);
  const height = Math.ceil(Math.max(iconSize, textHeight) + pad * 2);
  const inner = icon().replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const textTop = pad + (height - pad * 2 - textHeight) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- WikiRemastered lockup (${stacked ? 'stacked' : 'one line'}, ${glyphs.font}). Generated by scripts/brand.mjs. -->
  <title>WikiRemastered</title>
  <svg x="${pad}" y="${f((height - iconSize) / 2)}" width="${f(iconSize)}" height="${f(iconSize)}" viewBox="0 0 128 128">${inner}</svg>
  <defs>${a.defs}${b.defs}${grain('wr-lock-grain')}</defs>
  <g filter="url(#wr-lock-grain)">
    <g transform="translate(${f(pad + iconSize + gap + lean)} ${f(textTop)}) skewX(${LEAN})">${a.body}${b.body}</g>
  </g>
</svg>
`;
}

/* The menu's lockup: the two words stacked and aligned, the big icon over their left edge, in
   front of them, its shadow falling on the first letters. Units: the wordmark's capitals are
   100 tall; `at` tunes the numbers. */
export function staggered({ glyphs = GLYPHS, at = {} } = {}) {
  const o = { icon: 300, textX: 268, line: 118, ...at };
  const scale = 100 / glyphs.capHeight;
  const [wiki, rest] = glyphs.words;
  const pad = 6;
  const slant = Math.tan(-LEAN * Math.PI / 180);
  // The words centred on the icon's height; the slant pivots on their middle.
  const top = pad + (o.icon - 100 - o.line) / 2;
  const middle = top + (100 + o.line) / 2;
  const place = (y) => `translate(${f(o.textX)} ${f(y)}) scale(${scale.toFixed(5)})`;
  const a = solid('wr-stag-wiki', [{ d: wiki.d, transform: place(top + 100) }], GREEN, { depth: 9, rim: [1.6, 2] });
  const b = solid('wr-stag-rest', [{ d: rest.d, transform: place(top + 100 + o.line) }], WHITE, { depth: 9, rim: [1.6, 2] });
  const right = o.textX + Math.max(wiki.width, rest.width) * scale + slant * (middle - top) + 14;
  // No margin on the left: the view starts at the piece's edge (12.5 of the icon's 128).
  const trim = Math.floor(pad + o.icon * 12.5 / 128);
  const width = Math.ceil(pad + right) - trim;
  const height = Math.ceil(pad * 2 + o.icon);
  const inner = icon().replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${trim} 0 ${width} ${height}">
  <!-- WikiRemastered lockup (compact, ${glyphs.font}). Generated by scripts/brand.mjs. -->
  <title>WikiRemastered</title>
  <defs>${a.defs}${b.defs}${grain('wr-stag-grain')}
    <filter id="wr-stag-lift" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="7" dy="9" stdDeviation="7" flood-color="#050807" flood-opacity=".6"/>
    </filter>
  </defs>
  <g filter="url(#wr-stag-grain)">
    <g transform="translate(${f(slant * middle)} 0) skewX(${LEAN})">${a.body}${b.body}</g>
  </g>
  <g filter="url(#wr-stag-lift)">
    <svg x="${pad}" y="${pad}" width="${o.icon}" height="${o.icon}" viewBox="0 0 128 128">${inner}</svg>
  </g>
</svg>
`;
}

// The Chrome Web Store's promo tiles: the logo (with the icon and a line) on the left, and the
// product on the right: the puzzle pack, a card back behind it.
const embed = (svg, width, height) => `<image width="${f(width)}" height="${f(height)}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"/>`;
function tile(width, height, { line = '', logoWidth, iconSize, packHeight, left, packX }) {
  const logoSvg = logo();
  const [, lw, lh] = logoSvg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  const pack = readFileSync(at('extension/pack-art-puzzle.svg'), 'utf8');
  const back = readFileSync(at('extension/card-back-puzzle.svg'), 'utf8');
  const logoHeight = logoWidth * lh / lw;
  const packWidth = packHeight * 640 / 1000;
  const backHeight = packHeight * .78;
  const backWidth = backHeight * 5 / 7;
  const middle = height / 2;
  const blockTop = middle - (iconSize + 18 + logoHeight + (line ? 44 : 0)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#111413"/>
  <g transform="translate(${f(packX + packWidth * .42)} ${f(middle - backHeight / 2 + 8)}) rotate(13 ${f(backWidth / 2)} ${f(backHeight / 2)})">
    <rect width="${f(backWidth)}" height="${f(backHeight)}" rx="${f(backWidth * .064)}" fill="#000" opacity=".35" transform="translate(6 10)"/>
    <clipPath id="wr-back-clip"><rect width="${f(backWidth)}" height="${f(backHeight)}" rx="${f(backWidth * .064)}"/></clipPath>
    <g clip-path="url(#wr-back-clip)">${embed(back, backWidth, backHeight)}</g>
  </g>
  <g transform="translate(${f(packX)} ${f(middle - packHeight / 2)}) rotate(-7 ${f(packWidth / 2)} ${f(packHeight / 2)})">${embed(pack, packWidth, packHeight)}</g>
  <g transform="translate(${f(left)} ${f(blockTop)})">${embed(icon(), iconSize, iconSize)}</g>
  <g transform="translate(${f(left - logoWidth * .01)} ${f(blockTop + iconSize + 18)})">${embed(logoSvg, logoWidth, logoHeight)}</g>
  ${line ? `<text x="${f(left + 4)}" y="${f(blockTop + iconSize + 18 + logoHeight + 34)}" font-family="'SF Pro Display', 'Segoe UI', Helvetica, Arial, sans-serif" font-size="${f(Math.max(13, logoWidth / 30))}" font-weight="600" fill="#b8c2bd">${line}</text>` : ''}
</svg>
`;
}

// Run as a script (not imported, as the film does): write the files.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
  // node scripts/brand.mjs --compare a.json b.json…: the logo in each face, side by side (lab).
  const compare = process.argv.indexOf('--compare');
  if (compare > 0) {
    const rows = process.argv.slice(compare + 1).filter(arg => !arg.startsWith('--')).map(file => {
      const glyphs = JSON.parse(readFileSync(file, 'utf8'));
      return `<figure><img src="data:image/svg+xml;base64,${Buffer.from(logo(glyphs)).toString('base64')}"><figcaption>${glyphs.font}</figcaption></figure>`;
    });
    // With --lockups, the compact lockups instead, as they would sit in the site's menu.
    if (process.argv.includes('--lockups')) {
      const files = process.argv.slice(compare + 1).filter(arg => !arg.startsWith('--'));
      const variants = [];
      for (const file of files) {
        const glyphs = JSON.parse(readFileSync(file, 'utf8'));
        for (const stacked of [false, true]) variants.push({ label: `${glyphs.font}, ${stacked ? 'deux lignes' : 'une ligne'}`, svg: lockup({ glyphs, stacked }) });
      }
      const cells = variants.map(({ label, svg }) => `<figure><div class="side"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"><i></i></div><figcaption>${label}</figcaption></figure>`);
      writeFileSync(at('lab/brand-lockups.html'), `<!doctype html><meta charset="utf-8"><title>Lockups</title>
  <style>body{margin:0;padding:20px;background:#0c0d0c;color:#8a948f;font:12px system-ui;display:grid;grid-template-columns:repeat(2,300px);gap:14px 24px}figure{margin:0;display:grid;gap:6px}.side{display:flex;align-items:center;justify-content:space-between;width:280px;height:64px;padding:0 16px;background:#121413;border:1px solid #1f2321;border-radius:6px;box-sizing:border-box}.side img{height:34px;max-width:210px;object-fit:contain;object-position:left}.side i{width:20px;height:20px;border-radius:50%;background:#2b2f2d;flex:none}</style>
  ${cells.join('\n')}`);
      console.log('lab/brand-lockups.html written');
      return;
    }
    writeFileSync(at('lab/brand-compare.html'), `<!doctype html><meta charset="utf-8"><title>Logo faces</title>
  <style>body{margin:0;padding:24px;background:#0c0d0c;color:#8a948f;font:12px system-ui;display:grid;gap:18px}figure{margin:0;display:grid;gap:6px}img{height:64px;justify-self:start}</style>
  ${rows.join('\n')}`);
    console.log('lab/brand-compare.html written');
    return;
  }

  mkdirSync(at('store/images'), { recursive: true });
  writeFileSync(at('extension/logo-wikiremastered.svg'), logo());
  writeFileSync(at('extension/icon.svg'), icon());
  writeFileSync(at('extension/logo-wikiremastered-compact.svg'), staggered());
  writeFileSync(at('store/images/promo-small-440x280.svg'), tile(440, 280, { logoWidth: 250, iconSize: 64, packHeight: 230, left: 26, packX: 300 }));
  writeFileSync(at('store/images/promo-marquee-1400x560.svg'), tile(1400, 560, { line: 'Ouvertures de paquets en 3D, collection enrichie, défausse et marché', logoWidth: 700, iconSize: 120, packHeight: 470, left: 110, packX: 930 }));
  const [, logoWidth, logoHeight] = logo().match(/width="(\d+)" height="(\d+)"/);
  const [, lockWidth, lockHeight] = staggered().match(/width="(\d+)" height="(\d+)"/);
  console.log(`logo ${logoWidth} × ${logoHeight}, compact lockup ${lockWidth} × ${lockHeight}, icon and store tiles written`);
}

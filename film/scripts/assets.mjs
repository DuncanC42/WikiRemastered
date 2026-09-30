/* The film's art, from the extension's own brand (scripts/brand.mjs):
 *   src/brand/pieces.json   jigsaw outlines for every combination of tabs (the 3D floor)
 *   src/brand/glyphs.json   the wordmark's letters, as outlines (the 3D icon and words)
 *   public/art/card-back.svg the puzzle pack's card back (rasterized by scripts/rasterize.sh)
 * Run: node scripts/assets.mjs && sh scripts/rasterize.sh
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pieceShape } from '../../scripts/brand.mjs';

const at = path => fileURLToPath(new URL(`../${path}`, import.meta.url));
const repo = path => fileURLToPath(new URL(`../../${path}`, import.meta.url));
mkdirSync(at('public/art'), { recursive: true });
mkdirSync(at('src/brand'), { recursive: true });
copyFileSync(repo('extension/card-back-puzzle.svg'), at('public/art/card-back.svg'));
copyFileSync(repo('scripts/brand-glyphs.json'), at('src/brand/glyphs.json'));
// Jigsaw outlines, 100 wide, centred, keyed by their tabs (top right bottom left, 1 out, -1 in).
const pieces = {};
for (let bits = 0; bits < 16; bits += 1) {
  const tabs = [0, 1, 2, 3].map(side => ((bits >> side) & 1 ? 1 : -1));
  pieces[tabs.join(',')] = pieceShape(100, tabs).d;
}
writeFileSync(at('src/brand/pieces.json'), JSON.stringify(pieces));
console.log('pieces, glyphs and card back written');

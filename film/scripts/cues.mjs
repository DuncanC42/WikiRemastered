/* Every moment the soundtrack hits, in film frames: node scripts/cues.mjs → out/cues.json.
 * Read from the film's own sources (src/timeline.ts, src/edit.ts, src/cues.ts; Node strips
 * their types) and from the capture's log of phases and clicks (public/capture/pack/marks.json). */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SCENES, TOTAL } from '../src/timeline.ts';
import { DESIGN, frameOf, PACK } from '../src/edit.ts';
import { COLLECTION_CUES, DISCARD_CUES, END_CUES, MARKET_CUES, OPENING_CUES } from '../src/cues.ts';

const marks = JSON.parse(readFileSync(new URL('../public/capture/pack/marks.json', import.meta.url), 'utf8'));
const pack = source => SCENES.pack[0] + frameOf(PACK, source);
const phase = name => marks.phases.find(([, p]) => p === name)[0];
const cues = {
  total: TOTAL,
  scenes: Object.fromEntries(Object.entries(SCENES).map(([name, [from]]) => [name, from])),
  open: Object.fromEntries(Object.entries(OPENING_CUES).map(([name, frame]) => [name, SCENES.open[0] + frame])),
  pack: {
    click: pack(marks.openAt),
    burst: pack(phase('burst')),
    deck: pack(phase('deck')),
    reveals: marks.clicks.slice(0, 4).map(source => pack(source + 14)), // A card turns over about 14 frames after the press.
    charge: pack(marks.clicks[4]),
    flip: pack(940), // The legendary turns over.
    summary: pack(phase('summary')),
  },
  design: { clicks: [91, 181, 271].map(source => SCENES.design[0] + frameOf(DESIGN, source)) },
  collection: { switch: SCENES.collection[0] + COLLECTION_CUES.switch, stack: SCENES.collection[0] + COLLECTION_CUES.stack },
  discard: { mark: SCENES.discard[0] + DISCARD_CUES.mark, click: SCENES.discard[0] + DISCARD_CUES.click },
  market: { chips: MARKET_CUES.chips.map(at => SCENES.market[0] + at), activate: SCENES.market[0] + MARKET_CUES.activate, bids: MARKET_CUES.bids.map(at => SCENES.market[0] + at), done: SCENES.market[0] + MARKET_CUES.done },
  end: Object.fromEntries(Object.entries(END_CUES).map(([name, frame]) => [name, SCENES.end[0] + frame])),
};
mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/cues.json', import.meta.url), JSON.stringify(cues, null, 2));
console.log(JSON.stringify(cues));

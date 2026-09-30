/* The moments inside each scene (frames from the scene's start), shared by the scenes and the
   soundtrack (scripts/cues.mjs turns them into film frames). No imports: Node reads this file. */
export const OPENING_CUES = { land: 30, sink: 165, w: 210, plus: 240, letters: 243, out: 396 };
export const COLLECTION_CUES = { switch: 60, stack: 68 };
export const DISCARD_CUES = { mark: 46, click: 104 };
// Keywords typed as chips, the session switched on, the matching cards bid on one after another.
export const MARKET_CUES = { chips: [24, 38, 52], activate: 90, bids: [105, 120, 135], done: 156 };
export const END_CUES = { headline: 66, sink: 135, words: 201, cta: 262 };

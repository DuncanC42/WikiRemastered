/* The film's clock: 60 fps, 120 BPM, so a beat is 30 frames. Each scene's start is placed so its
   big moments fall on beats (the click that opens the pack at 570, the design clicks at 1290, 1380
   and 1470, the switch of the collection at 1590, the discard at 1860, the market session switched
   on at 2070, the logo at 2400). */
export const FPS = 60;
export const BEAT = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// [start, end) of each scene, in frames; neighbours overlap where one hands over to the next.
export const SCENES = {
  open: [0, 420],
  pack: [399, 1269],
  design: [1254, 1554],
  collection: [1530, 1770],
  discard: [1755, 1995],
  market: [1980, 2220],
  end: [2199, 2619],
} as const;

export const TOTAL = 2619;

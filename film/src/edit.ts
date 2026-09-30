/* How the captured takes (public/capture/<take>/, see scripts/capture.mjs) are cut into the film:
   stretches of the capture, each played at its own speed. Frames are the capture's own (60 fps). */
export type Stretch = { from: number; to: number; speed: number; name: string };
export type Edit = { take: string; stretches: Stretch[] };

// The capture lays out a 1440 × 810 window; the film is 1920 × 1080.
export const CAPTURE_SCALE = 1920 / 1440;

export const PACK: Edit = {
  take: 'pack',
  stretches: [
    { name: 'arrive', from: 30, to: 51, speed: 1 },
    { name: 'ready', from: 51, to: 201, speed: 1 },
    { name: 'open', from: 201, to: 334, speed: 1 }, // The click, the cut, the light, the cards out.
    { name: 'reveals', from: 334, to: 740, speed: 1.8 },
    { name: 'charge', from: 740, to: 925, speed: 2.2 }, // The legendary gathers itself, in the dark.
    { name: 'legend', from: 925, to: 1000, speed: 1 },
    { name: 'stash', from: 1000, to: 1098, speed: 2.5 },
    { name: 'summary', from: 1098, to: 1240, speed: 1 },
  ],
};
export const DESIGN: Edit = { take: 'design', stretches: [{ name: 'switch', from: 55, to: 355, speed: 1 }] };

export const lengthOf = (edit: Edit) => edit.stretches.reduce((sum, s) => sum + Math.round((s.to - s.from) / s.speed), 0);

// The capture frame shown at a frame of the scene.
export function sourceAt(edit: Edit, frame: number) {
  let start = 0;
  for (const s of edit.stretches) {
    const length = Math.round((s.to - s.from) / s.speed);
    if (frame < start + length) return Math.min(s.to - 1, Math.round(s.from + (frame - start) * s.speed));
    start += length;
  }
  const last = edit.stretches[edit.stretches.length - 1];
  return last.to - 1;
}
// The scene frame at which a capture frame is shown (the first one).
export function frameOf(edit: Edit, source: number) {
  let start = 0;
  for (const s of edit.stretches) {
    const length = Math.round((s.to - s.from) / s.speed);
    if (source >= s.from && source < s.to) return start + Math.round((source - s.from) / s.speed);
    start += length;
  }
  return start;
}
export const startOf = (edit: Edit, name: string) => frameOf(edit, edit.stretches.find(s => s.name === name)!.from);

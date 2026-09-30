import { Cell, HEIGHT, Script, WORDS } from './World';
import { camera, clamp01, crest, easeIn, easeOut, Key, lerp, ring, smooth } from './motion';

// Where the camera frames the finished lockup: straight down, a little from the bottom right,
// so the solids show their depth on that side, as the 2D brand draws it.
const LOCKUP: [number, number, number] = [(WORDS.right - 0.62) / 2 - 0.02, 0, 0.02];
const above = (target: [number, number, number], height: number, lean = 1): [number, number, number] => [target[0] + 0.09 * height * lean, height, target[2] + 0.18 * height * lean];

/* A floor that rises out of the ground as a wave leaves `at`, from the middle, at `speed`
   pieces a second: each piece comes up with a crest that tips it as it passes. */
function rise(t: number, cell: Cell, at: number, speed: number, lift = 0.26) {
  const arrive = at + cell.d / speed;
  const up = easeOut((t - arrive + 0.05) / 0.42);
  const bump = lift * crest(t, arrive + 0.2, 0.17) * Math.max(0.25, 1 - cell.d / 18);
  // The crest's slope along the wave's direction tips the piece about the tangent.
  const slope = (-lift * crest(t, arrive + 0.2, 0.17) * (-2 * (t - arrive - 0.2)) / 0.0289 / speed) * 0.55;
  const angle = Math.atan(slope);
  const [dx, dz] = cell.d > 0 ? [cell.x / cell.d, cell.z / cell.d] : [0, 0];
  return { y: lerp(-HEIGHT - 0.25, 0, up) + bump, tiltX: angle * dz, tiltZ: -angle * dx };
}
// Pieces going back into the ground, as a wave leaving the middle at `at`.
const sink = (t: number, cell: Cell, at: number, speed: number) => easeIn((t - at - cell.d / speed) / 0.5);
// A slow swell running across the floor once it is up.
const swell = (t: number, cell: Cell, from: number) => 0.05 * smooth(from, from + 0.8, t) * Math.sin(cell.x * 0.9 + cell.z * 0.6 - t * 2.6);

/* The opening: the piece falls out of the dark onto the ground; the floor rises around it in a
   wave; the camera climbs over it while the floor goes back down, the W and the plus land on the
   piece, and the two words rise beside it: the menu's lockup. */
export const OPENING_KEYS: Key[] = [
  [0, [1.25, 4.1, 5.6], [0, 0, 0]],
  [0.55, [1.0, 3.9, 5.2], [0, 0, 0]],
  [2.6, [-3.6, 7.4, 9.2], [0, 0, 0.6]],
  [3.35, [0.36, 4.2, 0.9], [0.02, 0, 0.02]],
  [3.95, [0.4, 4.4, 0.95], [0.04, 0, 0.02]],
  [4.8, above(LOCKUP, 9.6), LOCKUP],
  [6.45, above(LOCKUP, 9.1), [LOCKUP[0], 0, LOCKUP[2] + 0.02]],
  [7.0, above(LOCKUP, 12.5), [LOCKUP[0], 0, LOCKUP[2] - 0.6]],
];
const LAND = 0.5;
const fallHeight = (t: number) => (t < LAND ? 3.0 * (1 - (t / LAND) ** 2) : 0);
export const opening: Script = {
  accents: 0.16,
  camera: t => {
    const view = camera(OPENING_KEYS, t);
    const jolt = ring(t, LAND, 0.05, 30, 9) + ring(t, 3.5, 0.02, 30, 10);
    // During the fall the camera keeps the piece in view.
    const follow = 0.6 * fallHeight(t);
    return { position: [view.position[0], view.position[1] + jolt, view.position[2]] as [number, number, number], target: [view.target[0], view.target[1] + follow, view.target[2]] as [number, number, number], fov: 30 };
  },
  floor: (t, cell) => {
    if (t < LAND) return null;
    const pose = rise(t, cell, LAND, 6.5);
    pose.y += swell(t, cell, 1.6) - sink(t, cell, 2.75, 9) * (HEIGHT + 0.3);
    return pose;
  },
  hero: t => {
    const fall = clamp01(t / LAND);
    const y = fallHeight(t);
    const tumble = (1 - easeOut(fall)) * (t < LAND ? 1 : 0);
    return { y, rotation: [0.9 * tumble, 0.5 * tumble, -0.6 * tumble], squash: 1 - ring(t, LAND, 0.16, 26, 9) - ring(t, 3.5, 0.07, 30, 10) };
  },
  w: t => {
    if (t < 3.2) return null;
    const drop = clamp01((t - 3.2) / 0.3);
    return { y: t < 3.5 ? 2.2 * (1 - drop * drop) : 0, scale: 1 };
  },
  plus: t => {
    if (t < 3.75) return null;
    const drop = clamp01((t - 3.75) / 0.25);
    return { y: t < 4.0 ? 0.9 * (1 - drop * drop) + 0.001 : 0.001 + Math.max(0, ring(t, 4.0, 0.05, 24, 8)), spin: (1 - easeOut(drop)) * -2.6, scale: lerp(0.4, 1, easeOut(drop)) };
  },
  letter: (t, letter) => {
    const at = 4.05 + (letter.x - WORDS.left) * 0.055 + letter.word * 0.1;
    const up = easeOut((t - at) / 0.38);
    if (up <= 0) return null;
    return { y: lerp(-WORDS.depth - 0.06, 0, up) + 0.05 * crest(t, at + 0.22, 0.1) };
  },
  light: t => lerp(-0.25, 0.25, smooth(4.6, 6.6, t)),
};

/* The ending: every colour at once, a floor that tiles itself in a wave ("Tout s'emboîte."),
   then goes back into the ground from the middle out, leaving the icon; the words rise. */
const END_KEYS: Key[] = [
  [0, [-4.8, 6.2, 8.4], [0, 0, 0.4]],
  [2.2, [-2.6, 7.8, 9.6], [0, 0, 0.6]],
  [3.0, [0.4, 4.4, 0.95], [0.04, 0, 0.02]],
  [3.3, [0.4, 4.4, 0.95], [0.04, 0, 0.02]],
  [4.1, above(LOCKUP, 9.6), LOCKUP],
  [6.0, above(LOCKUP, 9.2), LOCKUP],
];
export const ending: Script = {
  accents: 0.62,
  camera: t => ({ ...camera(END_KEYS, t), fov: 30 }),
  floor: (t, cell) => {
    const pose = rise(t, cell, 0.05, 7.5, 0.3);
    pose.y += swell(t, cell, 1.2) - sink(t, cell, 2.25, 10) * (HEIGHT + 0.3);
    return pose;
  },
  hero: t => ({ y: lerp(-HEIGHT - 0.25, 0, easeOut((t - 0.02) / 0.42)) + 0.26 * crest(t, 0.24, 0.17), squash: 1 - ring(t, 3.0, 0.05, 30, 10) }),
  w: t => ({ y: t < 2.7 ? 0 : 0 }),
  plus: t => ({ y: 0.001, spin: 0, scale: 1 }),
  letter: (t, letter) => {
    const at = 3.35 + (letter.x - WORDS.left) * 0.055 + letter.word * 0.1;
    const up = easeOut((t - at) / 0.38);
    if (up <= 0) return null;
    return { y: lerp(-WORDS.depth - 0.06, 0, up) + 0.05 * crest(t, at + 0.22, 0.1) };
  },
  light: t => lerp(-0.3, 0.2, smooth(3.4, 6, t)),
};

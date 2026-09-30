import { Easing, random, spring } from 'remotion';
import { FPS } from '../timeline';

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),
  outSoft: Easing.bezier(0.33, 1, 0.68, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  inSoft: Easing.bezier(0.32, 0, 0.67, 0),
  outBack: Easing.bezier(0.34, 1.56, 0.64, 1),
  linear: (t: number) => t,
};

// 0 before `start`, 1 after `start + duration`, eased in between.
export const ramp = (frame: number, start: number, duration: number, curve: (t: number) => number = ease.out) =>
  curve(clamp01((frame - start) / duration));

// A spring from 0 to 1 that starts at `start` (0 before it).
export const springAt = (frame: number, start: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) =>
  frame < start ? 0 : spring({ frame: frame - start, fps: FPS, config: { damping: 14, stiffness: 170, mass: 1, ...config } });

// Deterministic noise, so every render of a frame is the same.
export const rand = (seed: string | number) => random(`wr-${seed}`);
export const range = (seed: string | number, min: number, max: number) => min + rand(seed) * (max - min);

// A decaying shake: an offset that rings after `start` and dies out over `duration`.
export const shake = (frame: number, start: number, duration: number, amount: number, seed = 1) => {
  const t = frame - start;
  if (t < 0 || t > duration) return 0;
  const fade = (1 - t / duration) ** 2;
  return Math.sin(t * 1.9 + seed * 3.1) * amount * fade;
};

export const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp01(t)).toString(16).padStart(2, '0')).join('')}`;
};

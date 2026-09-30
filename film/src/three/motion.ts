// Small curves for the 3D scripts (times in seconds).
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeIn = (t: number) => clamp01(t) ** 3;
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// A damped bounce after `at`: 0 before, rings and settles to 0.
export const ring = (t: number, at: number, amount: number, speed = 22, decay = 7) => (t < at ? 0 : amount * Math.exp(-(t - at) * decay) * Math.sin((t - at) * speed));
// A crest that passes: a smooth bump centred on `at`, `width` seconds wide.
export const crest = (t: number, at: number, width: number) => Math.exp(-(((t - at) / width) ** 2));

// Camera keys: [time, position, target], eased from one to the next.
export type Key = [number, [number, number, number], [number, number, number]];
export function camera(keys: Key[], t: number) {
  if (t <= keys[0][0]) return { position: keys[0][1], target: keys[0][2] };
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, p1, a1] = keys[i];
    const [t0, p0, a0] = keys[i - 1];
    if (t <= t1) {
      const u = easeInOut((t - t0) / (t1 - t0));
      return { position: mix3(p0, p1, u), target: mix3(a0, a1, u) };
    }
  }
  const last = keys[keys.length - 1];
  return { position: last[1], target: last[2] };
}

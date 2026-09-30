/* The film's soundtrack, synthesized from oscillators and noise, no samples:
 *   node scripts/cues.mjs && node scripts/soundtrack.mjs  →  public/audio/soundtrack.wav
 * 48 kHz, stereo, 16 bit. 120 BPM, Am9 – Fmaj9 – Cadd9 – G6sus, resolving on C under the logo.
 * Every hit sits on the frame of the picture it goes with: out/cues.json, written from the
 * film's own timeline and the capture's log.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CUES = JSON.parse(readFileSync(new URL('../out/cues.json', import.meta.url), 'utf8'));
const SR = 48000;
const FPS = 60;
const DURATION = CUES.total / FPS;
const N = Math.ceil(DURATION * SR);
const sec = frame => frame / FPS;

let seed = 7;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const noise = () => rnd() * 2 - 1;
const mtof = midi => 440 * 2 ** ((midi - 69) / 12);
const TAU = Math.PI * 2;

// Buses: straight to the mix, to the reverb, and ducked under the kick (pad, bass).
const bus = () => [new Float32Array(N), new Float32Array(N)];
const dry = bus();
const send = bus();
const ducked = bus();
const pad = bus();
const kicks = [];

function put(target, i, v, pan) {
  const a = ((pan + 1) * Math.PI) / 4;
  target[0][i] += v * Math.cos(a);
  target[1][i] += v * Math.sin(a);
}
// Renders fn(t) from `start` (seconds) for `dur` seconds.
function voice(start, dur, fn, { pan = 0, gain = 1, rev = 0.15, to = dry } = {}) {
  const i0 = Math.max(0, Math.round(start * SR));
  const i1 = Math.min(N, Math.round((start + dur) * SR));
  for (let i = i0; i < i1; i += 1) {
    const v = fn((i - i0) / SR) * gain;
    if (v === 0) continue;
    put(to, i, v, pan);
    if (rev) put(send, i, v * rev, pan);
  }
}

class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(freq, q);
  }
  set(freq, q = this.q) {
    this.q = q;
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (this.type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    const a0 = 1 + alpha;
    [this.b0, this.b1, this.b2, this.a1, this.a2] = [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/* Instruments. */
function kick(t0, gain = 0.9) {
  kicks.push(t0);
  let phase = 0;
  voice(t0, 0.55, t => {
    phase += (TAU * (44 + 100 * Math.exp(-t * 30))) / SR;
    const body = Math.sin(phase) * Math.exp(-t * 6.5);
    const click = t < 0.003 ? noise() * 0.6 * (1 - t / 0.003) : 0;
    return Math.tanh((body + click) * 1.8) * 0.85;
  }, { gain, rev: 0.02 });
}
function clap(t0, gain = 0.35) {
  const bp = new Biquad('bp', 1400, 1.1);
  voice(t0, 0.35, t => {
    const bursts = [0, 0.011, 0.023].reduce((sum, at) => sum + (t >= at ? Math.exp(-(t - at) * 140) : 0), 0);
    return bp.run(noise()) * (bursts * 0.7 + Math.exp(-t * 16) * 0.5) * 2.2;
  }, { gain, rev: 0.25, pan: 0.05 });
}
function hat(t0, gain = 0.16, open = false) {
  const hp = new Biquad('hp', 7500, 0.8);
  voice(t0, open ? 0.3 : 0.08, t => hp.run(noise()) * Math.exp(-t * (open ? 14 : 75)), { gain, rev: 0.05, pan: (rnd() - 0.5) * 0.4 });
}
function bass(t0, dur, midi, gain = 0.32) {
  let phase = 0;
  const f = mtof(midi);
  voice(t0, dur + 0.05, t => {
    phase += (TAU * f) / SR;
    const env = Math.min(1, t / 0.005) * (0.65 + 0.35 * Math.exp(-t * 9)) * (t > dur ? Math.exp(-(t - dur) * 60) : 1);
    return Math.tanh((Math.sin(phase) + 0.35 * Math.sin(2 * phase)) * 1.4) * env;
  }, { gain, rev: 0, to: ducked });
}
function pluck(t0, midi, gain = 0.2, pan = 0, decay = 5.5) {
  const f = mtof(midi);
  voice(t0, 1.6, t => {
    const mod = Math.sin(TAU * f * 2 * t) * 2.2 * Math.exp(-t * 14);
    return Math.sin(TAU * f * t + mod) * Math.min(1, t / 0.002) * Math.exp(-t * decay);
  }, { gain, pan, rev: 0.32 });
}
function bell(t0, midi, gain = 0.2, pan = 0, length = 3) {
  const f = mtof(midi);
  voice(t0, length, t => {
    const mod = Math.sin(TAU * f * 3.5 * t) * 3 * Math.exp(-t * 3);
    return Math.sin(TAU * f * t + mod) * Math.min(1, t / 0.003) * Math.exp(-t * (4 / length));
  }, { gain, pan, rev: 0.45 });
}
function boom(t0, gain = 0.8) {
  let phase = 0;
  const lp = new Biquad('lp', 900);
  voice(t0, 1.8, t => {
    phase += (TAU * (38 + 30 * Math.exp(-t * 8))) / SR;
    return Math.sin(phase) * Math.exp(-t * 2.4) + lp.run(noise()) * Math.exp(-t * 11) * 0.8;
  }, { gain, rev: 0.35 });
}
function riser(t0, dur, gain = 0.25) {
  const bp = new Biquad('bp', 300, 2.5);
  let phase = 0;
  voice(t0, dur, t => {
    const u = t / dur;
    if (Math.round(t * SR) % 64 === 0) bp.set(300 * 20 ** u, 2.5);
    phase += (TAU * (110 * 4 ** u)) / SR;
    const saw = ((phase / TAU) % 1) * 2 - 1;
    return (bp.run(noise()) * 1.4 + saw * 0.05) * u * u;
  }, { gain, rev: 0.4 });
}
function whoosh(t0, dur, gain = 0.3, from = -0.5, to = 0.5, low = 350, high = 2600) {
  const bp = new Biquad('bp', low, 1.3);
  const i0 = Math.round(t0 * SR);
  const i1 = Math.min(N, Math.round((t0 + dur) * SR));
  for (let i = i0; i < i1; i += 1) {
    const u = (i - i0) / (i1 - i0);
    if ((i - i0) % 64 === 0) bp.set(low + (high - low) * Math.sin(Math.PI * u), 1.3);
    const v = bp.run(noise()) * Math.sin(Math.PI * u) ** 2 * gain * 1.8;
    put(dry, i, v, from + (to - from) * u);
    put(send, i, v * 0.3, from + (to - from) * u);
  }
}
function snip(t0, gain = 0.3) {
  const hp = new Biquad('hp', 3500);
  voice(t0, 0.12, t => hp.run(noise()) * Math.exp(-t * 160) * 1.2 + (Math.sin(TAU * 4300 * t) * 0.5 + Math.sin(TAU * 6150 * t) * 0.35) * Math.exp(-t * 55), { gain, rev: 0.12, pan: 0.2 });
}
function rip(t0, dur = 0.5, gain = 0.4) {
  const bp = new Biquad('bp', 1600, 0.9);
  let gate = 1;
  voice(t0, dur, t => {
    if (Math.round(t * SR) % 360 === 0) gate = 0.3 + rnd() * 0.7;
    return bp.run(noise()) * gate * Math.min(1, t / 0.01) * (1 - t / dur) * 2;
  }, { gain, rev: 0.2, pan: 0.15 });
}
function tick(t0, freq = 2400, gain = 0.12, pan = 0) {
  voice(t0, 0.05, t => Math.sin(TAU * freq * t) * Math.exp(-t * 130) + noise() * Math.exp(-t * 400) * 0.3, { gain, pan, rev: 0.08 });
}
function blip(t0, midi, gain = 0.16, pan = 0) {
  const f = mtof(midi);
  let phase = 0;
  voice(t0, 0.3, t => {
    phase += (TAU * f * (1 + 0.5 * Math.exp(-t * 60))) / SR;
    return Math.sin(phase) * Math.exp(-t * 16);
  }, { gain, pan, rev: 0.25 });
}
function flick(t0, gain = 0.2, pan = 0) {
  const bp = new Biquad('bp', 2800, 0.8);
  voice(t0, 0.09, t => bp.run(noise()) * Math.sin((Math.PI * t) / 0.09) * 1.6, { gain, pan, rev: 0.1 });
}
function thud(t0, gain = 0.5) {
  let phase = 0;
  voice(t0, 0.35, t => {
    phase += (TAU * (70 + 90 * Math.exp(-t * 40))) / SR;
    return Math.sin(phase) * Math.exp(-t * 12);
  }, { gain, rev: 0.2 });
}

/* The score. */
const CHORDS = [
  { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
  { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
  { root: 48, notes: [55, 60, 64, 67, 74] }, // Cadd9
  { root: 43, notes: [55, 59, 62, 64, 69] }, // G6sus
];
const G = CHORDS[3];
const C = CHORDS[2];
const T = {
  land: sec(CUES.open.land),
  drop: sec(CUES.pack.click), // The click that opens the pack: the drums come in.
  charge: sec(CUES.pack.charge),
  flip: sec(CUES.pack.flip),
  design: sec(CUES.scenes.design),
  end: sec(CUES.scenes.end),
  logo: sec(CUES.end.words), // The resolution, as the words rise under the icon.
};
const BAR0 = T.drop % 2; // Bars every 2 s, one of them starting on the drop.
function chordAt(t) {
  if (t >= T.logo) return C;
  if (t >= T.logo - 2) return G;
  if (t >= T.charge && t < T.flip) return G;
  if (t < BAR0) return G;
  return CHORDS[Math.floor((t - BAR0) / 2) % 4];
}

// Pad: detuned saws, a new chord every bar (and at the section changes), through a filter that
// follows the film: closed in the dark, open on the drops.
{
  const edges = new Set([0, DURATION]);
  for (let t = BAR0; t < DURATION; t += 2) edges.add(t);
  for (const t of [T.charge, T.flip, T.logo - 2, T.logo]) edges.add(t);
  const bounds = [...edges].filter(t => t >= 0 && t <= DURATION).sort((a, b) => a - b);
  for (let k = 0; k + 1 < bounds.length; k += 1) {
    const [start, end] = [bounds[k], bounds[k + 1]];
    const chord = chordAt(start + 0.001);
    const dur = end - start;
    for (const [n, midi] of [chord.root + 12, ...chord.notes].entries()) {
      for (const cents of [-11, -4, 3, 10]) {
        const f = mtof(midi) * 2 ** (cents / 1200);
        let phase = rnd();
        voice(start, dur + 0.6, t => {
          phase += f / SR;
          const env = Math.min(1, t / 0.3) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.6) : 1);
          return ((phase % 1) * 2 - 1) * env;
        }, { gain: 0.012 * (n === 0 ? 1.3 : 1), pan: (cents / 11) * 0.5, rev: 0, to: pad });
      }
    }
  }
  const cutoff = t => {
    if (t < T.land) return 300;
    if (t < T.drop) return 700 + (t - T.land) * 190;
    if (t < T.charge) return 3400;
    if (t < T.flip) return 1100 + (t - T.charge) * 400;
    if (t < T.design) return 2600;
    if (t < T.end) return 2300;
    if (t < T.logo) return 1400 + (t - T.end) * 900;
    return 5200 * Math.exp(-(t - T.logo) * 0.45) + 900;
  };
  const volume = t => (t < T.land ? (t / T.land) * 0.3 : 1) * ((t >= T.charge && t < T.flip) || (t >= T.end && t < T.logo) ? 1.6 : t < T.drop ? 1.5 : 1) * (t > DURATION - 1 ? Math.max(0, DURATION - t) : 1);
  for (const channel of [0, 1]) {
    const lp1 = new Biquad('lp', 800, 0.9);
    const lp2 = new Biquad('lp', 800, 0.6);
    for (let i = 0; i < N; i += 1) {
      const t = i / SR;
      if (i % 128 === 0) {
        lp1.set(cutoff(t), 0.9);
        lp2.set(cutoff(t) * 1.2, 0.6);
      }
      const v = lp2.run(lp1.run(pad[channel][i])) * volume(t);
      ducked[channel][i] += v;
      send[channel][i] += v * 0.35;
    }
  }
}

// Arpeggio, bass and drums, section by section.
const ARP = [0, 2, 1, 3, 2, 4, 3, 1];
const beatAfter = t => Math.ceil((t - BAR0) * 2 - 1e-6) / 2 + BAR0; // The next beat at or after t.
function arp(from, to, step, gain, octave = 12) {
  for (let t = beatAfter(from), k = 0; t < to - 0.01; t += step, k += 1) {
    const chord = chordAt(t);
    pluck(t, chord.notes[ARP[k % 8]] + octave, gain * (k % 2 ? 0.75 : 1), Math.sin(k * 1.3) * 0.5);
  }
}
const GROOVES = [[T.drop, T.charge], [T.design, T.end]];
arp(T.land + 1.0, T.drop, 0.25, 0.085);
arp(T.drop, T.charge, 0.125, 0.08);
arp(T.flip + 0.5, T.design, 0.25, 0.08);
arp(T.design, T.end, 0.25, 0.075);
arp(T.end, T.logo, 0.125, 0.065, 24);
for (let t = beatAfter(T.drop - 3); t < T.drop - 0.01; t += 1) bass(t, 0.9, chordAt(t).root, 0.2);
for (const [from, to] of GROOVES) {
  for (let t = beatAfter(from), k = 0; t < to - 0.01; t += 0.25, k += 1) bass(t, 0.2, chordAt(t).root + (k % 4 === 2 ? 12 : 0), 0.3);
  for (let t = beatAfter(from); t < to - 0.01; t += 0.5) kick(t, 0.85);
  for (let t = beatAfter(from) + 0.5; t < to - 0.01; t += 1) clap(t);
}
for (let t = beatAfter(sec(CUES.scenes.pack)); t < T.drop - 0.01; t += 1) kick(t, 0.55);
for (let t = beatAfter(T.drop - 4) + 0.25; t < T.drop; t += 0.5) hat(t, 0.1);
for (let t = beatAfter(T.drop); t < T.charge - 0.01; t += 0.125) hat(t, (t * 8) % 4 === 2 ? 0.13 : 0.06);
for (let t = beatAfter(T.flip + 0.5); t < T.design - 0.01; t += 1) kick(t, 0.5);
for (let t = beatAfter(T.design) + 0.25; t < T.end - 0.01; t += 0.5) hat(t, 0.11, Math.round((t - BAR0) * 2) % 4 === 3);
for (let t = beatAfter(T.logo - 2); t < T.logo; t += 0.125) hat(t, 0.04 + ((t - (T.logo - 2)) / 2) * 0.1);

/* Effects, on the picture's frames. */
const O = CUES.open;
// The opening: the piece falls and lands; the floor rises in a wave, piece after piece; it goes
// back down; the W and the plus land; the letters rise one after another.
whoosh(0, sec(O.land), 0.26, 0.2, 0, 2600, 260);
boom(sec(O.land), 0.95);
thud(sec(O.land), 0.55);
for (let k = 0; k < 110; k += 1) {
  const d = 1 + rnd() * 13;
  tick(sec(O.land) + d / 6.5 + 0.12 + rnd() * 0.05, 1500 + rnd() * 2200, 0.05 * (1 - d / 16), rnd() * 1.6 - 0.8);
}
whoosh(sec(O.sink), 1.0, 0.2, 0.5, -0.5, 2000, 240);
thud(sec(O.w), 0.55);
tick(sec(O.w), 1300, 0.12);
bell(sec(O.plus), 91, 0.1, 0.4, 1.8);
blip(sec(O.plus), 84, 0.1, 0.4);
[72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100, 103].forEach((midi, k) => pluck(sec(O.letters) + 0.2 + k * 0.03, midi - 12, 0.07, -0.6 + k * 0.09, 6));
whoosh(sec(O.out) - 0.35, 0.7, 0.2, 0, 0, 500, 3400);
// The pack: it arrives; the click, the cut, the seal torn off, the light, the cards out.
const P = CUES.pack;
whoosh(sec(CUES.scenes.pack), 0.6, 0.18, 0.2, 0, 300, 1800);
riser(sec(P.click) - 1, 1, 0.16);
tick(sec(P.click), 2600, 0.18);
snip(sec(P.click) + 0.03, 0.3);
snip(sec(P.click) + 0.12, 0.26);
rip(sec(P.burst), 0.55, 0.45);
boom(sec(P.click), 0.75);
for (const [k, pan] of [[0, -0.7], [1, 0.7], [2, -0.5], [3, 0.6]]) whoosh(sec(P.burst) + 0.2 + k * 0.42, 0.6, 0.11, pan, -pan, 600, 3400);
for (let k = 0; k < 22; k += 1) bell(sec(P.burst) + 0.1 + k * 0.08, 84 + [0, 4, 7, 11, 14, 16][k % 6], 0.022, Math.sin(k) * 0.8, 1.2);
whoosh(sec(P.deck) - 0.9, 0.8, 0.22, 0, 0, 300, 2800);
P.reveals.forEach((at, k) => {
  flick(sec(at), 0.28, (k - 1.5) * 0.3);
  pluck(sec(at) + 0.02, [76, 79, 81, 84][k], 0.2, (k - 1.5) * 0.3, 3);
});
// The legendary: the room goes dark, it gathers itself, turns over in a burst.
for (let t = sec(P.charge) + 0.2; t < T.flip - 0.2; t += 0.5) thud(t, 0.22);
riser(sec(P.charge), T.flip - sec(P.charge), 0.34);
boom(T.flip, 1);
flick(T.flip, 0.3);
for (const [k, midi] of [72, 76, 79, 83, 86, 91].entries()) bell(T.flip + k * 0.035, midi, 0.08, (k - 2.5) * 0.25, 3.5);
for (let k = 0; k < 18; k += 1) bell(T.flip + 0.15 + k * 0.06, 96 + [0, 2, 4, 7, 9][k % 5], 0.018, Math.sin(k * 2) * 0.8, 1);
whoosh(sec(P.summary), 0.9, 0.18, -0.5, 0.5, 400, 2600);
for (const [k, midi] of [79, 84, 88].entries()) bell(sec(P.summary) + 0.3 + k * 0.08, midi, 0.04, 0.2, 1.5);
// The design switch: three clicks, three turns.
for (const at of CUES.design.clicks) {
  tick(sec(at), 3000, 0.16, 0.5);
  whoosh(sec(at) + 0.06, 0.85, 0.2, 0.4, -0.3, 400, 2600);
}
// Collection +: the switch, the doubles flying onto their stacks, the counts.
tick(sec(CUES.collection.switch), 2200, 0.16, 0.5);
for (let k = 0; k < 12; k += 1) flick(sec(CUES.collection.stack) + k * 0.05 + 0.3, 0.06, 0.3 + (k % 4) * 0.1);
[0, 3, 6].forEach((d, k) => blip(sec(CUES.collection.stack + 52 + d), 79 + k * 3, 0.12, 0.5));
// The discard: the useless cards are marked; one click, and they go, one after another.
blip(sec(CUES.discard.mark), 60, 0.1, 0.5);
tick(sec(CUES.discard.click), 2600, 0.18, 0.5);
for (let k = 0; k < 7; k += 1) {
  whoosh(sec(CUES.discard.click + 8 + k * 4), 0.35, 0.07, 0.5, 0.2, 2400, 500);
  blip(sec(CUES.discard.click + 10 + k * 4), 72 - k * 2, 0.06, 0.5);
}
for (const [k, midi] of [76, 79, 84].entries()) bell(sec(CUES.discard.click + 60) + k * 0.05, midi, 0.05, 0.5, 1.6);
// Marché +: keywords typed in, the session switched on, bids placed in a batch, one after another.
for (const at of CUES.market.chips) for (let k = 0; k < 4; k += 1) tick(sec(at) - 0.2 + k * 0.05, 2200 + k * 150, 0.05, 0.5);
tick(sec(CUES.market.activate), 2600, 0.18, 0.5);
bell(sec(CUES.market.activate) + 0.02, 79, 0.05, 0.5, 1.2);
CUES.market.bids.forEach((at, k) => {
  blip(sec(at), [72, 76, 79][k], 0.15, 0.5);
  tick(sec(at) + 0.04, 3200, 0.06, 0.5);
});
for (const [k, midi] of [72, 76, 79, 84].entries()) bell(sec(CUES.market.done) + k * 0.05, midi, 0.06, 0.5, 2);

// The ending: the floor tiles itself in a wave, "Tout s'emboîte.", it goes back down, the words
// rise under the icon on the resolution.
const E = CUES.end;
for (let k = 0; k < 110; k += 1) {
  const d = 1 + rnd() * 13;
  tick(T.end + 0.05 + d / 7.5 + 0.12 + rnd() * 0.05, 1500 + rnd() * 2400, 0.045 * (1 - d / 16), rnd() * 1.6 - 0.8);
}
thud(sec(E.headline), 0.3);
whoosh(sec(E.sink), 1.0, 0.2, 0.5, -0.5, 2000, 240);
riser(T.logo - 1.6, 1.6, 0.4);
boom(T.logo, 1);
thud(T.logo, 0.45);
for (const [k, midi] of [60, 64, 67, 71, 74, 79].entries()) bell(T.logo + 0.1 + k * 0.04, midi + 12, 0.07, (k - 2.5) * 0.3, 3.5);
[72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100, 103].forEach((midi, k) => pluck(T.logo + 0.2 + k * 0.03, midi - 12, 0.06, -0.6 + k * 0.09, 6));
tick(sec(E.cta), 2000, 0.1, 0);
bell(sec(E.cta) + 0.05, 88, 0.035, 0, 1.4);

/* Reverb (Freeverb: eight combs and four allpasses a side). */
function reverb(input, spread) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0, store: 0 }));
  const alls = [556, 441, 341, 225].map(d => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0 }));
  const out = new Float32Array(N);
  const feedback = 0.86;
  const damp = 0.25;
  for (let n = 0; n < N; n += 1) {
    const x = input[n] * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * feedback;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of alls) {
      const o = a.buf[a.i];
      a.buf[a.i] = y + o * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = o - y;
    }
    out[n] = y;
  }
  return out;
}
const wet = [reverb(send[0], 0), reverb(send[1], 23)];

/* Mix: the ducked bus under the kicks, a high-pass, soft clipping, and a peak at -1 dBFS. */
const duck = new Float32Array(N).fill(1);
for (const t0 of kicks) {
  const i0 = Math.round(t0 * SR);
  for (let i = i0; i < Math.min(N, i0 + SR * 0.35); i += 1) duck[i] = Math.min(duck[i], 1 - 0.55 * Math.exp(-((i - i0) / SR) * 11));
}
const mix = [new Float32Array(N), new Float32Array(N)];
for (const channel of [0, 1]) {
  const hp = new Biquad('hp', 28);
  for (let i = 0; i < N; i += 1) mix[channel][i] = hp.run(dry[channel][i] + ducked[channel][i] * duck[i] + wet[channel][i] * 3.2);
}
let peak = 0;
for (const channel of [0, 1]) for (let i = 0; i < N; i += 1) peak = Math.max(peak, Math.abs(mix[channel][i]));
const drive = 1.25 / peak;
const ceiling = 10 ** (-1 / 20);
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i += 1) {
  const fade = Math.min(1, i / (SR * 0.01)) * Math.min(1, (N - i) / (SR * 0.6));
  for (const channel of [0, 1]) {
    const v = (Math.tanh(mix[channel][i] * drive) / Math.tanh(1.25)) * ceiling * fade;
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), (i * 2 + channel) * 2);
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
mkdirSync(new URL('../public/audio/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/audio/soundtrack.wav', import.meta.url), Buffer.concat([header, pcm]));
console.log(`soundtrack.wav: ${(N / SR).toFixed(1)} s, peak before the clipper ${peak.toFixed(2)}`);

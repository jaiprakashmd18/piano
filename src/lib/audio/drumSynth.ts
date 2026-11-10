/**
 * Original percussion sounds, rendered procedurally to PCM.
 *
 * Every hit is computed from first principles (sine sweeps, filtered noise,
 * inharmonic square stacks), so the kit carries no third-party sample licence.
 * Rendering is plain math on Float32Arrays: deterministic, synchronous and
 * independent of the Web Audio API, which also makes it unit-testable.
 */

export const DRUM_HITS = [
  'kick', 'ekick', 'snare', 'esnare', 'rim', 'clap', 'hat', 'ohat', 'tomL', 'tomM', 'tomH', 'crash', 'ride',
  'cowbell', 'shaker', 'tamb', 'congaH', 'congaL', 'na', 'tin', 'ge', 'ke', 'parai', 'thavilH', 'thavilL',
  'stick', 'clickHi', 'clickLo',
] as const;

export type DrumHit = (typeof DRUM_HITS)[number];

export const DRUM_LABELS: Record<DrumHit, string> = {
  kick: 'Kick', ekick: 'Electro kick', snare: 'Snare', esnare: 'Electro snare', rim: 'Rimshot', clap: 'Clap',
  hat: 'Closed hat', ohat: 'Open hat', tomL: 'Low tom', tomM: 'Mid tom', tomH: 'High tom', crash: 'Crash',
  ride: 'Ride', cowbell: 'Cowbell', shaker: 'Shaker', tamb: 'Tambourine', congaH: 'Conga high', congaL: 'Conga low',
  na: 'Tabla Na', tin: 'Tabla Tin', ge: 'Tabla Ge', ke: 'Tabla Ke', parai: 'Parai', thavilH: 'Thavil high',
  thavilL: 'Thavil low', stick: 'Sticks', clickHi: 'Click (accent)', clickLo: 'Click',
};

type Buf = Float32Array;

/** Small deterministic PRNG so renders are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

function make(sr: number, seconds: number): Buf {
  return new Float32Array(Math.ceil(sr * seconds));
}

function noise(sr: number, seconds: number, seed: number): Buf {
  const b = make(sr, seconds);
  const r = rng(seed);
  for (let i = 0; i < b.length; i++) b[i] = r();
  return b;
}

type FilterType = 'lp' | 'hp' | 'bp';

/** RBJ biquad, processed in place. */
function biquad(b: Buf, sr: number, type: FilterType, freq: number, q = 0.707): Buf {
  const w = (2 * Math.PI * Math.min(freq, sr * 0.45)) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lp') {
    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
  } else if (type === 'hp') {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
  } else {
    b0 = alpha; b1 = 0; b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    b[i] = y;
  }
  return b;
}

/** Multiplies by an exponential decay with optional linear attack. */
function shape(b: Buf, sr: number, decay: number, attack = 0.0005, delay = 0): Buf {
  for (let i = 0; i < b.length; i++) {
    const t = i / sr - delay;
    b[i] *= t < 0 ? 0 : Math.min(1, t / attack) * Math.exp(-t / decay);
  }
  return b;
}

/** Sine whose frequency follows `freq(t)`. */
function sweep(sr: number, seconds: number, freq: (t: number) => number): Buf {
  const b = make(sr, seconds);
  let phase = 0;
  for (let i = 0; i < b.length; i++) {
    phase += (2 * Math.PI * freq(i / sr)) / sr;
    b[i] = Math.sin(phase);
  }
  return b;
}

/** Stack of detuned square waves: the classic recipe for cymbal-like metal. */
function metal(sr: number, seconds: number, base: number): Buf {
  const ratios = [1, 1.483, 1.8, 2.546, 2.63, 3.897];
  const b = make(sr, seconds);
  for (const r of ratios) {
    const f = base * r;
    for (let i = 0; i < b.length; i++) b[i] += ((i * f) / sr) % 1 < 0.5 ? 1 / 6 : -1 / 6;
  }
  return b;
}

function mix(seconds: number, sr: number, parts: [Buf, number][]): Buf {
  const out = make(sr, seconds);
  for (const [b, g] of parts) for (let i = 0; i < Math.min(out.length, b.length); i++) out[i] += b[i] * g;
  return out;
}

function finish(b: Buf, sr: number, peak = 0.9, drive = 0): Buf {
  if (drive > 0) for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * (1 + drive));
  let max = 0;
  for (let i = 0; i < b.length; i++) max = Math.max(max, Math.abs(b[i]));
  const g = max > 0 ? peak / max : 1;
  // 4 ms fade-out so no hit ends on a click.
  const fade = Math.floor(sr * 0.004);
  for (let i = 0; i < b.length; i++) {
    const tail = b.length - i;
    b[i] *= g * (tail < fade ? tail / fade : 1);
  }
  return b;
}

const exp = Math.exp;

const RECIPES: Record<DrumHit, (sr: number) => Buf> = {
  kick: (sr) =>
    finish(mix(0.5, sr, [
      [shape(sweep(sr, 0.5, (t) => 48 + 120 * exp(-t / 0.028)), sr, 0.16), 1],
      [shape(biquad(noise(sr, 0.03, 1), sr, 'lp', 3500), sr, 0.006), 0.35],
    ]), sr, 0.95, 0.6),
  ekick: (sr) =>
    finish(mix(0.9, sr, [[shape(sweep(sr, 0.9, (t) => 42 + 110 * exp(-t / 0.045)), sr, 0.34), 1]]), sr, 0.95, 1.5),
  snare: (sr) =>
    finish(mix(0.35, sr, [
      [shape(sweep(sr, 0.35, (t) => 180 + 60 * exp(-t / 0.02)), sr, 0.07), 0.7],
      [shape(sweep(sr, 0.35, () => 331), sr, 0.05), 0.3],
      [shape(biquad(noise(sr, 0.35, 2), sr, 'hp', 1800), sr, 0.11), 0.9],
    ]), sr, 0.9, 0.3),
  esnare: (sr) =>
    finish(mix(0.3, sr, [
      [shape(sweep(sr, 0.3, (t) => 200 + 120 * exp(-t / 0.012)), sr, 0.05), 0.6],
      [shape(biquad(noise(sr, 0.3, 3), sr, 'bp', 2600, 0.8), sr, 0.09), 1.4],
    ]), sr, 0.9, 0.8),
  rim: (sr) =>
    finish(mix(0.08, sr, [
      [shape(sweep(sr, 0.08, () => 1720), sr, 0.012), 0.8],
      [shape(sweep(sr, 0.08, () => 820), sr, 0.018), 0.6],
      [shape(noise(sr, 0.01, 4), sr, 0.002), 0.5],
    ]), sr, 0.8),
  clap: (sr) => {
    const n = biquad(noise(sr, 0.4, 5), sr, 'bp', 1300, 1.2);
    const out = make(sr, 0.4);
    for (let i = 0; i < out.length; i++) {
      const t = i / sr;
      let e = 0;
      for (const d of [0, 0.011, 0.023]) if (t >= d && t < d + 0.01) e = Math.max(e, exp(-(t - d) / 0.004));
      if (t >= 0.032) e = Math.max(e, exp(-(t - 0.032) / 0.09));
      out[i] = n[i] * e;
    }
    return finish(out, sr, 0.85);
  },
  hat: (sr) =>
    finish(mix(0.12, sr, [
      [shape(biquad(metal(sr, 0.12, 2050), sr, 'hp', 7000), sr, 0.03), 1],
      [shape(biquad(noise(sr, 0.12, 6), sr, 'hp', 8000), sr, 0.025), 0.8],
    ]), sr, 0.6),
  ohat: (sr) =>
    finish(mix(0.6, sr, [
      [shape(biquad(metal(sr, 0.6, 2050), sr, 'hp', 6500), sr, 0.2), 1],
      [shape(biquad(noise(sr, 0.6, 7), sr, 'hp', 7500), sr, 0.16), 0.8],
    ]), sr, 0.6),
  tomL: (sr) => tom(sr, 88, 0.3),
  tomM: (sr) => tom(sr, 128, 0.25),
  tomH: (sr) => tom(sr, 176, 0.2),
  crash: (sr) =>
    finish(mix(1.8, sr, [
      [shape(biquad(metal(sr, 1.8, 1480), sr, 'hp', 3800), sr, 0.55), 0.8],
      [shape(biquad(noise(sr, 1.8, 8), sr, 'hp', 5000), sr, 0.45), 1],
    ]), sr, 0.7),
  ride: (sr) =>
    finish(mix(0.9, sr, [
      [shape(biquad(metal(sr, 0.9, 1760), sr, 'bp', 6200, 0.9), sr, 0.3), 1],
      [shape(sweep(sr, 0.9, () => 5200), sr, 0.05), 0.12],
    ]), sr, 0.55),
  cowbell: (sr) => {
    const b = make(sr, 0.3);
    for (let i = 0; i < b.length; i++) b[i] = (((i * 540) / sr) % 1 < 0.5 ? 0.5 : -0.5) + (((i * 800) / sr) % 1 < 0.5 ? 0.5 : -0.5);
    return finish(shape(biquad(b, sr, 'bp', 2640, 1.5), sr, 0.07), sr, 0.7);
  },
  shaker: (sr) => finish(shape(biquad(noise(sr, 0.12, 9), sr, 'hp', 5500), sr, 0.035, 0.012), sr, 0.5),
  tamb: (sr) =>
    finish(mix(0.25, sr, [
      [shape(biquad(metal(sr, 0.25, 2900), sr, 'hp', 8000), sr, 0.07, 0.004), 1],
      [shape(biquad(noise(sr, 0.25, 10), sr, 'hp', 6500), sr, 0.05, 0.004), 0.7],
    ]), sr, 0.55),
  congaH: (sr) => membrane(sr, 340, 300, 0.14, 11, 2400),
  congaL: (sr) => membrane(sr, 225, 198, 0.2, 12, 1800),
  // Tabla dayan (treble drum): strong 2nd/3rd partials give the ringing "na".
  na: (sr) =>
    finish(mix(0.6, sr, [
      [shape(sweep(sr, 0.6, () => 2 * 294), sr, 0.2), 1],
      [shape(sweep(sr, 0.6, () => 3 * 294), sr, 0.12), 0.5],
      [shape(sweep(sr, 0.6, () => 294), sr, 0.1), 0.2],
      [shape(sweep(sr, 0.6, () => 4.02 * 294), sr, 0.06), 0.25],
      [shape(biquad(noise(sr, 0.02, 13), sr, 'bp', 3000, 1), sr, 0.003), 0.6],
    ]), sr, 0.8),
  tin: (sr) =>
    finish(mix(0.7, sr, [
      [shape(sweep(sr, 0.7, () => 294), sr, 0.28), 1],
      [shape(sweep(sr, 0.7, () => 2 * 294), sr, 0.2), 0.35],
      [shape(biquad(noise(sr, 0.02, 14), sr, 'bp', 2000, 1), sr, 0.003), 0.3],
    ]), sr, 0.7),
  // Bayan (bass drum): the heel of the hand bends the pitch upward.
  ge: (sr) =>
    finish(mix(0.8, sr, [
      [shape(sweep(sr, 0.8, (t) => 68 + 46 * (1 - exp(-t / 0.07)) - 14 * (1 - exp(-t / 0.4))), sr, 0.3, 0.002), 1],
      [shape(sweep(sr, 0.8, (t) => 2 * (68 + 46 * (1 - exp(-t / 0.07)))), sr, 0.12), 0.25],
      [shape(biquad(noise(sr, 0.02, 15), sr, 'lp', 900), sr, 0.004), 0.5],
    ]), sr, 0.95, 0.4),
  ke: (sr) =>
    finish(mix(0.08, sr, [
      [shape(biquad(noise(sr, 0.08, 16), sr, 'bp', 850, 1.5), sr, 0.016), 1],
      [shape(sweep(sr, 0.08, () => 150), sr, 0.02), 0.6],
    ]), sr, 0.75),
  parai: (sr) =>
    finish(mix(0.3, sr, [
      [shape(sweep(sr, 0.3, (t) => 380 + 90 * exp(-t / 0.01)), sr, 0.07), 1],
      [shape(sweep(sr, 0.3, () => 2.3 * 400), sr, 0.035), 0.4],
      [shape(biquad(noise(sr, 0.3, 17), sr, 'bp', 3200, 0.8), sr, 0.03), 0.9],
    ]), sr, 0.9, 0.5),
  thavilH: (sr) =>
    finish(mix(0.2, sr, [
      [shape(sweep(sr, 0.2, (t) => 510 + 80 * exp(-t / 0.008)), sr, 0.045), 1],
      [shape(sweep(sr, 0.2, () => 1.59 * 520), sr, 0.03), 0.4],
      [shape(biquad(noise(sr, 0.2, 18), sr, 'bp', 2600, 1), sr, 0.02), 0.7],
    ]), sr, 0.85, 0.3),
  thavilL: (sr) =>
    finish(mix(0.5, sr, [
      [shape(sweep(sr, 0.5, (t) => 96 + 50 * exp(-t / 0.05)), sr, 0.17), 1],
      [shape(biquad(noise(sr, 0.03, 19), sr, 'lp', 1400), sr, 0.008), 0.5],
    ]), sr, 0.95, 0.5),
  stick: (sr) =>
    finish(mix(0.06, sr, [
      [shape(sweep(sr, 0.06, () => 2400), sr, 0.01), 1],
      [shape(sweep(sr, 0.06, () => 1150), sr, 0.014), 0.6],
    ]), sr, 0.7),
  clickHi: (sr) => finish(shape(sweep(sr, 0.05, () => 1760), sr, 0.012), sr, 0.8),
  clickLo: (sr) => finish(shape(sweep(sr, 0.05, () => 1175), sr, 0.012), sr, 0.6),
};

function tom(sr: number, f0: number, decay: number): Buf {
  return finish(mix(decay * 3, sr, [
    [shape(sweep(sr, decay * 3, (t) => f0 * (0.72 + 0.5 * exp(-t / 0.04))), sr, decay), 1],
    [shape(biquad(noise(sr, 0.05, Math.round(f0)), sr, 'lp', 2500), sr, 0.01), 0.3],
  ]), sr, 0.9, 0.3);
}

function membrane(sr: number, f0: number, f1: number, decay: number, seed: number, slap: number): Buf {
  return finish(mix(decay * 3, sr, [
    [shape(sweep(sr, decay * 3, (t) => f1 + (f0 - f1) * exp(-t / 0.02)), sr, decay), 1],
    [shape(biquad(noise(sr, 0.04, seed), sr, 'bp', slap, 1), sr, 0.008), 0.5],
  ]), sr, 0.8);
}

export function renderDrum(hit: DrumHit, sampleRate: number): Float32Array {
  return RECIPES[hit](sampleRate);
}

export function renderAllDrums(sampleRate: number): Record<DrumHit, Float32Array> {
  const out = {} as Record<DrumHit, Float32Array>;
  for (const h of DRUM_HITS) out[h] = renderDrum(h, sampleRate);
  return out;
}

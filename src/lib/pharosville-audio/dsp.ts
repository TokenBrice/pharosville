/**
 * Zero-asset sources for the garden's sound: every voice is filtered noise,
 * a plucked string or a sine, generated here from a seed. Nothing is fetched.
 */
import { AUDIO_MASTER, dbToGain } from "./mix";

/** Mulberry32: small, fast, and identical on every machine for a seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 0..1 for an integer slot (a breath cycle, a phrase). */
export function hash01(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** RMS of the shared noise source before any filter. */
export const NOISE_RMS = 0.25;

/**
 * One stereo near-Gaussian noise buffer (sum of four uniforms). L and R are
 * independent, so every bed layer starts decorrelated; layers read it at
 * different offsets and rates so no two share a period.
 */
export function createNoiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const random = seededRandom(seed);
  // Four uniforms on [0, 1) sum to variance 4/12.
  const scale = NOISE_RMS / Math.sqrt(1 / 3);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (random() + random() + random() + random() - 2) * scale;
    }
  }
  return buffer;
}

/**
 * Karplus–Strong string: a lowpassed noise excitation recirculated through a
 * two-tap average. No bend, no tremolo — a plain plucked line. Rendered at an
 * integer period; the caller tunes it with `playbackRate`.
 */
export function renderPluck(ctx: BaseAudioContext, period: number, seconds: number, seed: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const line = new Float32Array(period);
  const random = seededRandom(seed);
  let smoothed = 0;
  let rounder = 0;
  for (let index = 0; index < period; index += 1) {
    // A soft plectrum: the excitation is itself twice lowpassed, so the attack
    // is round rather than a bright zither twang (and the normalised peak is
    // the peak that plays — no filter after it).
    smoothed += 0.4 * (random() * 2 - 1 - smoothed);
    rounder += 0.4 * (smoothed - rounder);
    line[index] = rounder;
  }
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    const slot = index % period;
    const next = line[(slot + 1) % period];
    const value = line[slot];
    data[index] = value;
    line[slot] = 0.996 * 0.5 * (value + next);
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) for (let index = 0; index < length; index += 1) data[index] /= peak;
  return buffer;
}

/**
 * The garden's one shared air: stereo exponentially decaying noise with a
 * short pre-delay, its highs damping from ~8 kHz toward ~2 kHz over the tail.
 */
export function createReverbImpulse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const preDelay = Math.round(ctx.sampleRate * 0.035);
  const random = seededRandom(seed);
  const decayPerSample = Math.log(1000) / (ctx.sampleRate * 2.8);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let index = preDelay; index < length; index += 1) {
      const age = (index - preDelay) / (length - preDelay);
      const cutoffHz = 8000 - 6000 * age;
      const coefficient = 1 - Math.exp((-2 * Math.PI * cutoffHz) / ctx.sampleRate);
      low += coefficient * (random() * 2 - 1 - low);
      data[index] = low * Math.exp(-decayPerSample * (index - preDelay)) * 0.25;
    }
  }
  return buffer;
}

/**
 * The master safety ceiling: linear up to the knee, then a tanh shoulder that
 * can never exceed the ceiling. Run with 4× oversampling so inter-sample peaks
 * are shaped too (true peak, not sample peak).
 */
export function createCeilingCurve(points = 4097): Float32Array<ArrayBuffer> {
  const knee = dbToGain(AUDIO_MASTER.kneeDb);
  // Half a decibel under the ceiling: the 4× oversampler's reconstruction
  // filter rings a little past the shaped samples.
  const ceiling = dbToGain(AUDIO_MASTER.ceilingDb - 0.5);
  const curve = new Float32Array(points);
  for (let index = 0; index < points; index += 1) {
    const x = (index / (points - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped = magnitude <= knee
      ? magnitude
      : knee + (ceiling - knee) * Math.tanh((magnitude - knee) / (ceiling - knee));
    curve[index] = Math.sign(x) * shaped;
  }
  return curve;
}

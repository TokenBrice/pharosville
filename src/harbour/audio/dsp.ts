/**
 * Pure DSP for the harbour's sound (D23): seeded clip synthesisers that run anywhere (browser main thread in
 * small time-sliced steps, or Node for offline analysis). No WebAudio, no DOM.
 *
 * Each synthesiser is a generator that yields every few thousand samples so the caller can spread the work
 * across idle slices, and returns a stereo Clip. Every clip starts and ends at exact silence (no clicks).
 *
 * The models follow real coastal recordings:
 *   - shore wash: an approaching roll, the break (a low thump, a lowpassed roar whose cutoff falls as the
 *     energy dissipates, a spray of crest transients) peeling ACROSS the stereo field with an interaural delay,
 *     then the hissing run-up with foam bubbles, then the backwash: a granular rattle of pebbles (shingle) or
 *     sparse stone knocks and a deep gurgle (rocks), decaying as the water draws back;
 *   - lap: a small slap against a hull or pile, a hollow wooden knock, then a trickle of bubbles;
 *   - reef surf: a far, heavy, lowpassed break with a long roaring tail (the air has eaten the highs);
 *   - fire crackle and the Mint's press stroke for the near-field civic sounds;
 *   - weather: rain patter on roofs and quays (drop ticks, puddle plinks, a merged roof roar), eave drips,
 *     near thunder (the tearing N-wave cracks of the closest channel, the clap, a rolling tail) and far
 *     thunder (only the low roll: the air has eaten the rest);
 *   - season colour: songbird phrases, crickets, a gust through dry leaves, footsteps crunching in snow.
 */

export interface Clip { readonly sr: number; readonly L: Float32Array; readonly R: Float32Array }
export type Rng = () => number;
export type ClipKind = "shore" | "lap" | "reef" | "crackle" | "press" | "halyard" | "bell" | "gull" | "creak"
  // weather (DEWS): precipitation, thunder
  | "drizzle" | "rain" | "drip" | "thunder" | "rumble"
  // season colour (calendar, decorative)
  | "bird" | "cricket" | "cicada" | "rustle" | "crunch"
  // the Shipyard's tools (decorative, by day)
  | "mallet" | "adze" | "saw";

/** mulberry32: small, fast, seedable. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
/** samples of work between yields (~1-3 ms of main-thread time) */
const SLICE = 6144;

/**
 * Noise from two uniforms (triangular): cheap and plenty for audio. Unit variance at 48 kHz, and the same
 * spectral DENSITY at any synthesis rate (the levels were tuned at 48 kHz): white noise at a lower rate packs
 * its power into a narrower band, so it is scaled by sqrt(sr / 48k).
 */
const noiseOf = (r: Rng, sr: number) => { const k = 2.45 * Math.sqrt(sr / 48000); return () => (r() + r() - 1) * k; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const range = (r: Rng, a: number, b: number) => a + (b - a) * r();
const logRange = (r: Rng, a: number, b: number) => a * Math.pow(b / a, r());
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const onePole = (fc: number, sr: number) => 1 - Math.exp((-TAU * fc) / sr);

/** Zero-delay-feedback state-variable filter (Simper): stable under fast cutoff modulation. */
class Svf {
  lp = 0; bp = 0; hp = 0;
  private ic1 = 0; private ic2 = 0; private a1 = 0; private a2 = 0; private a3 = 0; private k = 1;
  constructor(private readonly sr: number) {}
  set(fc: number, q: number): void {
    const g = Math.tan((Math.PI * Math.min(fc, this.sr * 0.45)) / this.sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(v0: number): void {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2;
  }
}

/** Equal-power pan gains for p in -1..1. */
function panGains(p: number): [number, number] {
  const a = ((Math.max(-1, Math.min(1, p)) + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

/**
 * Add a damped, slightly up-chirping sinusoid: a pebble click (short tau) or a Minnaert bubble (longer tau,
 * the pitch rising as the bubble shrinks). Writes straight into the clip with a per-grain pan.
 */
function grain(L: Float32Array, R: Float32Array, sr: number, at: number, f0: number, tau: number, amp: number, pan: number, chirp: number, phase: number): void {
  const i0 = Math.floor(at * sr);
  const n = Math.min(L.length - i0, Math.ceil(tau * 5 * sr));
  if (i0 < 0 || n <= 0) return;
  const [gl, gr] = panGains(pan);
  const decay = Math.exp(-1 / (tau * sr));
  let e = amp, ph = phase;
  const w0 = (TAU * f0) / sr, dw = (w0 * chirp) / (tau * sr);
  // a 3-sample attack keeps the click from being a pure step (no aliasing spike)
  for (let i = 0; i < n; i++) {
    const s = Math.sin(ph) * e * (i < 3 ? (i + 1) / 4 : 1);
    L[i0 + i] += s * gl; R[i0 + i] += s * gr;
    ph += w0 + dw * i; e *= decay;
  }
}

/** Fade the first and last samples to exact zero. */
function seal(c: { L: Float32Array; R: Float32Array }, sr: number, fadeIn: number, fadeOut: number): void {
  const n = c.L.length, a = Math.max(1, Math.floor(fadeIn * sr)), b = Math.max(1, Math.floor(fadeOut * sr));
  for (let i = 0; i < a; i++) { const g = smooth(i / a); c.L[i] *= g; c.R[i] *= g; }
  for (let i = 0; i < b; i++) { const g = smooth(i / b); c.L[n - 1 - i] *= g; c.R[n - 1 - i] *= g; }
}

export interface ShoreOpts { size?: number; stone?: boolean }

/** One wave on the beach: roll, break, run-up, backwash. 6.5–10 s. */
export function* shoreWash(seed: number, sr: number, o: ShoreOpts = {}): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const size = o.size ?? range(r, 0.55, 1);
  const stone = o.stone ?? false;
  const tb = range(r, 0.7, 1.1);                         // the break
  const attack = range(r, 0.18, 0.45) * (stone ? 0.7 : 1);  // plunging (short) … spilling (long)
  const breakDecay = range(r, 0.45, 0.85) * (0.8 + 0.4 * size);
  const washDecay = range(r, 0.9, 1.6) * (0.7 + 0.5 * size);
  const tbw = tb + range(r, 1.6, 2.3) + 0.5 * size;      // the backwash starts
  const backDur = range(r, 2.2, 3.6) * (0.75 + 0.4 * size);
  const T = tbw + backDur + 0.5;
  const n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const pan0 = range(r, -0.75, 0.75), pan1 = Math.max(-0.9, Math.min(0.9, pan0 + (r() < 0.5 ? -1 : 1) * range(r, 0.35, 0.8)));
  const peel = range(r, 0.8, 1.6);                        // how long the break takes to run along the shore

  // ---- 1. roll + break + thump: one mono source, panned along the peel with an interaural delay
  const svfB = new Svf(sr), svfW1 = new Svf(sr), svfW2 = new Svf(sr);
  const ITD = Math.round(0.00055 * sr);
  const dl = new Float32Array(ITD + 2);
  let thumpA = 0, thumpB = 0, b0 = 0, b1 = 0, b2 = 0;
  const kThump = onePole(85, sr);
  const breakAmp = 0.42 * size, thumpAmp = 1.5 * size, widthAmp = 0.22 * size;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t - tb;
    if ((i & 31) === 0) {
      // the brightness arrives with the crest and dies faster than the body of the roar
      const fc = u < 0 ? 200 + 300 * smooth(t / tb) : 420 + 2600 * size * smooth(u / (attack * 1.3)) * Math.exp(-u / 0.6) + 300 * Math.exp(-u / 1.5);
      svfB.set(fc, 0.6); svfW1.set(fc * 1.15, 0.6); svfW2.set(fc * 0.9, 0.6);
    }
    const env = u < 0 ? 0.07 * Math.pow(t / tb, 2.2)
      : u < attack ? lerp(0.07, 1, smooth(u / attack))
      : 0.08 * Math.exp(-(u - attack) / 2.5) + 0.92 * Math.exp(-(u - attack) / breakDecay);
    const tail = 1;
    // pink-ish source: Kellet's economy filter on white
    const w = N();
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    svfB.run((b0 + b1 + b2 + w * 0.1848) * 0.2);
    const ua = u - attack * 0.6;
    const thumpEnv = ua < 0 ? 0 : ua < 0.05 ? ua / 0.05 : Math.exp(-(ua - 0.05) / 0.35);
    thumpA += kThump * (N() - thumpA); thumpB += kThump * (thumpA - thumpB);
    const mono = svfB.lp * env * tail * breakAmp + thumpB * thumpEnv * thumpAmp;
    // the peel: pan sweeps pan0 → pan1 through the break
    const p = lerp(pan0, pan1, smooth((t - tb + 0.25) / peel));
    const [gl, gr] = panGains(p);
    const idx = i % dl.length;
    dl[idx] = mono;
    const late = dl[(i + dl.length - Math.round(Math.abs(p) * ITD)) % dl.length];
    // the far ear hears it a fraction of a millisecond later
    L[i] += (p > 0 ? late : mono) * gl;
    R[i] += (p > 0 ? mono : late) * gr;
    // decorrelated width (reflections off the shore): independent noise, same spectrum and envelope
    svfW1.run(N() * 0.42); svfW2.run(N() * 0.42);
    L[i] += svfW1.lp * env * tail * widthAmp; R[i] += svfW2.lp * env * tail * widthAmp;
    if ((i % SLICE) === SLICE - 1) yield;
  }

  // ---- 2. crest transients: a spray of short bright splashes in the first instants of the break
  const splashes = Math.floor(range(r, 8, 22) * size);
  for (let k = 0; k < splashes; k++) {
    const at = tb + attack * 0.5 + Math.pow(r(), 1.6) * 0.5, dur = range(r, 0.008, 0.04), a = (0.015 + 0.07 * Math.pow(r(), 3)) * size;
    const i0 = Math.floor(at * sr), m = Math.min(n - i0, Math.ceil(dur * 4 * sr));
    const [gl, gr] = panGains(lerp(pan0, pan1, 0.2) + range(r, -0.4, 0.4));
    const kk = onePole(1600, sr);
    let lo = 0;
    for (let i = 0; i < m; i++) {
      const w = N(); lo += kk * (w - lo);
      const s = (w - lo) * a * (i < 24 ? i / 24 : Math.exp(-(i - 24) / (dur * sr)));
      L[i0 + i] += s * gl; R[i0 + i] += s * gr;
    }
  }
  yield;

  // ---- 3. the run-up: foaming hiss (independent L/R), the brightness falling as it spreads, turbulent
  const washAmp = 0.17 * size;
  const kHp = onePole(380, sr), kTurb = onePole(11, sr);
  let hpL = 0, hpR = 0, tuL = 0, tuR = 0;
  const w0 = tb + attack * 0.7;
  for (let i = Math.floor(w0 * sr); i < n; i++) {
    const t = i / sr, u = t - w0;
    if ((i & 31) === 0) { const fc = 1500 + 3600 * Math.exp(-u / 1.1); svfW1.set(fc, 0.7); svfW2.set(fc, 0.7); }
    const env = smooth(u / 0.6) * (u < 0.6 ? 1 : Math.exp(-(u - 0.6) / washDecay));
    if (env < 1e-4 && u > 1) break;
    svfW1.run(N()); svfW2.run(N());
    hpL += kHp * (svfW1.lp - hpL); hpR += kHp * (svfW2.lp - hpR);
    tuL += kTurb * (N() - tuL); tuR += kTurb * (N() - tuR);
    L[i] += (svfW1.lp - hpL) * env * washAmp * (0.8 + 2.2 * tuL);
    R[i] += (svfW2.lp - hpR) * env * washAmp * (0.8 + 2.2 * tuR);
    if ((i % SLICE) === SLICE - 1) yield;
  }
  // foam: small high bubbles through the run-up
  const foam = Math.floor(range(r, 60, 140) * washDecay * size);
  for (let k = 0; k < foam; k++) {
    const at = w0 + Math.pow(r(), 1.4) * washDecay * 2.2;
    const f = logRange(r, 1100, 4200);
    grain(L, R, sr, at, f, range(r, 5, 10) / f, (0.004 + 0.02 * Math.pow(r(), 3)) * size, range(r, -0.9, 0.9), 0.25, r() * TAU);
  }
  yield;

  // ---- 4. the backwash: the water draws back through the beach
  const profile = (t: number) => {
    const u = (t - tbw) / backDur;
    return u <= 0 || u >= 1 ? 0 : smooth(u / 0.22) * Math.pow(1 - u, 1.6);
  };
  // the draw: a soft hiss under the rattle, brighter on shingle
  const kHd = onePole(stone ? 900 : 1900, sr), kLd = onePole(stone ? 3500 : 8500, sr);
  let hdL = 0, hdR = 0, ldL = 0, ldR = 0;
  const drawAmp = (stone ? 0.08 : 0.13) * size;
  for (let i = Math.floor(tbw * sr); i < n; i++) {
    const e = profile(i / sr) * drawAmp;
    const wl = N(), wr = N();
    hdL += kHd * (wl - hdL); hdR += kHd * (wr - hdR);
    ldL += kLd * (wl - hdL - ldL); ldR += kLd * (wr - hdR - ldR);
    L[i] += ldL * e; R[i] += ldR * e;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  // the rattle: pebble clicks as a Poisson process following the profile (many small, a few loud)
  const peak = stone ? range(r, 90, 200) : range(r, 700, 1500);
  for (let t = tbw; t < tbw + backDur;) {
    const rate = peak * Math.max(0.02, profile(t)) * (0.6 + 0.8 * size);
    t += -Math.log(1 - r() * 0.9999) / rate;
    const p = profile(t);
    if (p <= 0) continue;
    const loud = Math.pow(r(), 4);
    if (stone) grain(L, R, sr, t, logRange(r, 700, 3200), range(r, 0.0012, 0.004), (0.012 + 0.09 * loud) * p * size, range(r, -0.95, 0.95), 0.05, r() * TAU);
    else grain(L, R, sr, t, logRange(r, 1900, 9500), range(r, 0.00025, 0.0011), (0.01 + 0.075 * loud) * p * size, range(r, -0.95, 0.95), 0.08, r() * TAU);
  }
  // rocks: a deep gurgle as the water drains out of the gaps
  if (stone) {
    const g = Math.floor(range(r, 25, 50) * backDur);
    for (let k = 0; k < g; k++) {
      const t = tbw + r() * backDur * 0.9, f = logRange(r, 180, 900);
      grain(L, R, sr, t, f, range(r, 0.006, 0.016), 0.05 * profile(t) * size + 0.004, range(r, -0.8, 0.8), 0.4, r() * TAU);
    }
  }
  seal({ L, R }, sr, 0.01, 0.35);
  return { sr, L, R };
}

/** A lap against a hull or pile: slap, hollow knock, trickle. ~0.8–1.4 s. */
export function* lap(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = range(r, 0.8, 1.4), n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const pan = range(r, -0.8, 0.8), [gl, gr] = panGains(pan);
  const slap = new Svf(sr), body = new Svf(sr), lo = new Svf(sr);
  slap.set(logRange(r, 320, 900), 0.8);
  body.set(logRange(r, 110, 240), 7);
  lo.set(range(r, 1800, 3200), 0.7);
  const slaps: Array<[number, number, number]> = [[0.02, range(r, 0.025, 0.06), 1]];
  if (r() < 0.45) slaps.push([range(r, 0.12, 0.32), range(r, 0.02, 0.045), range(r, 0.35, 0.7)]);
  const bodyAmp = range(r, 0.6, 1.6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let ex = 0;
    for (const [at, tau, a] of slaps) {
      const u = t - at;
      if (u > 0) ex += a * (u < 0.003 ? u / 0.003 : Math.exp(-(u - 0.003) / tau));
    }
    const w = N() * ex;
    slap.run(w); lo.run(slap.bp); body.run(w * 0.35);
    const s = lo.lp * 0.55 + body.bp * 0.22 * bodyAmp;
    L[i] += s * gl; R[i] += s * gr;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  // the trickle: a few bubbles and a short drip-hiss as the water falls back
  const bubbles = Math.floor(range(r, 5, 14));
  for (let k = 0; k < bubbles; k++) {
    const at = 0.05 + Math.pow(r(), 1.3) * (T - 0.35), f = logRange(r, 450, 2400);
    grain(L, R, sr, at, f, (range(r, 6, 14) / f), 0.012 + 0.04 * Math.pow(r(), 2), pan + range(r, -0.45, 0.45), 0.3, r() * TAU);
  }
  // the hollow "glug" of water slopping into the gap under a hull or round a pile
  const glugs = Math.floor(r() * 2.6);
  for (let k = 0; k < glugs; k++) grain(L, R, sr, range(r, 0.04, 0.3), logRange(r, 160, 420), range(r, 0.015, 0.03), range(r, 0.05, 0.12), pan + range(r, -0.2, 0.2), 0.5, r() * TAU);
  // a soft splash-hiss as the slap falls back: band-limited, never a bright fizz
  const kh = onePole(1200, sr), kl = onePole(4500, sr);
  let hl = 0, hr = 0, ll = 0, lr = 0;
  for (let i = Math.floor(0.03 * sr); i < n; i++) {
    const u = i / sr - 0.03, e = 0.022 * smooth(u / 0.04) * Math.exp(-u / 0.18);
    const wl = N(), wr = N();
    hl += kh * (wl - hl); hr += kh * (wr - hr);
    ll += kl * (wl - hl - ll); lr += kl * (wr - hr - lr);
    L[i] += ll * e * gl; R[i] += lr * e * gr;
  }
  seal({ L, R }, sr, 0.002, 0.12);
  return { sr, L, R };
}

/** A far break on the reef: a heavy, lowpassed roar with a long tail. 11–15 s. */
export function* reefSurf(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const att = range(r, 0.6, 1.4), hold = range(r, 0.8, 1.8), dec = range(r, 2.4, 3.8);
  const T = att + hold + dec * 2.4 + 0.5, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const fL = new Svf(sr), fR = new Svf(sr);
  const kB = onePole(260, sr), kBoom = onePole(65, sr), kH = onePole(500, sr);
  let bl = 0, br = 0, m1 = 0, m2 = 0, hl = 0, hr = 0;
  const drift0 = range(r, -0.5, 0.5), drift1 = range(r, -0.5, 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 63) === 0) { const fc = 420 + 700 * Math.exp(-Math.max(0, t - att) / 1.5); fL.set(fc, 0.6); fR.set(fc * 1.07, 0.6); }
    const env = t < att ? smooth(t / att) : t < att + hold ? 1 : Math.exp(-(t - att - hold) / dec);
    const wl = N(), wr = N();
    bl += kB * (wl - bl); br += kB * (wr - br);
    fL.run(wl * 0.3 + bl * 2.4); fR.run(wr * 0.3 + br * 2.4);
    const u = t - att * 0.6;
    const boomEnv = u < 0 ? 0 : u < 0.12 ? u / 0.12 : Math.exp(-(u - 0.12) / 0.7);
    m1 += kBoom * (N() - m1); m2 += kBoom * (m1 - m2);
    const xl = N(), xr = N();     // the hiss is its own noise: sharing it with the roar would notch
    hl += kH * (xl - hl); hr += kH * (xr - hr);
    const hiss = 0.014 * env;
    const p = lerp(drift0, drift1, t / T), [gl, gr] = panGains(p);
    L[i] += (fL.lp * 0.34 * env + (xl - hl) * hiss * 0.5) * (0.6 + 0.4 * gl * 1.41) + m2 * boomEnv * 2.6 * gl;
    R[i] += (fR.lp * 0.34 * env + (xr - hr) * hiss * 0.5) * (0.6 + 0.4 * gr * 1.41) + m2 * boomEnv * 2.6 * gr;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  seal({ L, R }, sr, 0.05, 1.2);
  return { sr, L, R };
}

/**
 * The Pharos fire: a flickering low roar with pops and sputters on top. 4 s, faded at both ends, overlapped
 * end to end by the scheduler (baked, so the live graph carries no continuously automated flicker).
 */
export function* crackle(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 4, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  // the roar: low, breathy, flickering at a few Hz
  const k1 = onePole(240, sr), k2 = onePole(240, sr), kf = onePole(5, sr), kw = onePole(400, sr);
  let a = 0, b = 0, f = 0, wl = 0, wr = 0;
  for (let i = 0; i < n; i++) {
    a += k1 * (N() - a); b += k2 * (a - b);
    f += kf * (N() - f);
    wl += kw * (N() - wl); wr += kw * (N() - wr);
    const fl = Math.max(0.15, 0.7 + 3.2 * f);
    const v = b * 1.6 * fl;
    L[i] = v + wl * 0.05 * fl; R[i] = v * 0.9 + wr * 0.05 * fl;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  for (let t = 0.05; t < T - 0.1;) {
    const burst = r() < 0.12;
    t += burst ? range(r, 0.008, 0.04) : -Math.log(1 - r() * 0.9999) / 11;
    const big = Math.pow(r(), 5);
    grain(L, R, sr, t, logRange(r, 1100, 6500), range(r, 0.0003, 0.0012) * (1 + 2 * big), 0.05 + 0.5 * big, range(r, -0.5, 0.5), 0.1, r() * TAU);
  }
  yield;
  // sputters: short breathy bursts of escaping gas
  const kh = onePole(900, sr);
  const sp = Math.floor(range(r, 4, 10));
  for (let k = 0; k < sp; k++) {
    const at = range(r, 0.1, T - 0.3), dur = range(r, 0.03, 0.09), amp = range(r, 0.03, 0.08);
    const i0 = Math.floor(at * sr), m = Math.ceil(dur * 3 * sr), [gl, gr] = panGains(range(r, -0.4, 0.4));
    let h = 0;
    for (let i = 0; i < m && i0 + i < n; i++) {
      const w = N(); h += kh * (w - h);
      const e = amp * smooth(i / (0.006 * sr)) * Math.exp(-i / (dur * sr));
      L[i0 + i] += (w - h) * e * gl; R[i0 + i] += (w - h) * e * gr;
    }
  }
  seal({ L, R }, sr, 0.5, 0.5);
  return { sr, L, R };
}

/** One stroke of a coin press: a low thump and a ringing clank. 1.1 s. */
export function* press(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 1.1, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const f0 = range(r, 600, 820);
  const parts: Array<[number, number, number]> = [[1, 0.2, 0.28], [2.32, 0.13, 0.19], [3.86, 0.07, 0.12], [5.41, 0.04, 0.07]];
  const kc = onePole(1200, sr);
  let ph = 0, c = 0;
  const pp = parts.map(() => r() * TAU);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // the thump: a falling-pitch sine (the die hitting the anvil)
    const f = 42 + 36 * Math.exp(-t / 0.05);
    ph += (TAU * f) / sr;
    let s = Math.sin(ph) * 0.6 * smooth(t / 0.002) * Math.exp(-t / 0.13);
    c += kc * (N() - c);
    s += c * 0.9 * Math.exp(-t / 0.008);
    const u = t - 0.012;
    if (u > 0) for (let k = 0; k < parts.length; k++) {
      const [m, a, d] = parts[k];
      s += Math.sin(pp[k] + TAU * f0 * m * u) * a * smooth(u / 0.0015) * Math.exp(-u / d);
    }
    L[i] = s * 0.95; R[i] = s;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  seal({ L, R }, sr, 0.001, 0.2);
  return { sr, L, R };
}

/** Halyards tapping a mast: one to five short metallic tinks. */
export function* halyard(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const taps = 1 + Math.floor(r() * 4.5);
  const times: number[] = [];
  for (let k = 0, t = 0.01; k < taps; k++, t += range(r, 0.16, 0.3)) times.push(t);
  const T = times[times.length - 1] + 0.35, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const f = range(r, 1700, 3300), pan = range(r, -0.7, 0.7);
  for (const at of times) {
    const a = range(r, 0.5, 1);
    grain(L, R, sr, at, f * range(r, 0.995, 1.005), range(r, 0.03, 0.06), 0.2 * a, pan, 0, r() * TAU);
    grain(L, R, sr, at, f * 2.71, 0.014, 0.08 * a, pan, 0, r() * TAU);
    // the strike itself: a tick of band-limited noise
    const bp = new Svf(sr); bp.set(f, 6);
    const i0 = Math.floor(at * sr), m = Math.ceil(0.03 * sr), [gl, gr] = panGains(pan);
    for (let i = 0; i < m && i0 + i < n; i++) {
      bp.run(N() * 0.3 * a * Math.exp(-i / (0.006 * sr)) * (i < 48 ? i / 48 : 1));
      L[i0 + i] += (bp.bp / 6) * gl; R[i0 + i] += (bp.bp / 6) * gr;   // /Q: unity gain at the peak
    }
  }
  yield;
  seal({ L, R }, sr, 0.001, 0.05);
  return { sr, L, R };
}

/** The bell buoy: a clapper strike on inharmonic partials, a long decay. 5.5 s. */
export function* bell(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 5.5, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const f0 = 392 * range(r, 0.995, 1.005);
  for (const [ratio, a, d] of [[0.5, 0.35, 5], [1, 1, 4.2], [1.19, 0.4, 3], [2.0, 0.45, 2.2], [2.74, 0.25, 1.4], [3.76, 0.1, 0.8]] as const) {
    // a slow beat between the two halves of a slightly out-of-round bell
    const f = f0 * ratio, beat = range(r, 0.6, 1.6), ph = r() * TAU;
    const decay = Math.exp(-1 / ((d / 4.6) * sr)), w = (TAU * f) / sr;
    let e = a * 0.4;
    for (let i = 0; i < n; i++) {
      const t = i / sr, b = 1 - 0.18 * (1 + Math.sin(TAU * beat * t)) * 0.5;
      const v = Math.sin(ph + w * i) * e * b * (i < 288 ? i / 288 : 1);
      L[i] += v; R[i] += v * 0.92;
      e *= decay;
      if (e < 1e-5) break;
    }
    yield;
  }
  // the clapper: a short clank of band-limited noise on the strike
  const ck = new Svf(sr); ck.set(1250, 1.5);
  for (let i = 0, m = Math.ceil(0.05 * sr); i < m; i++) {
    ck.run(N() * 0.12 * Math.exp(-i / (0.008 * sr)) * (i < 24 ? i / 24 : 1));
    L[i] += ck.bp; R[i] += ck.bp * 0.92;
  }
  seal({ L, R }, sr, 0.001, 0.3);
  return { sr, L, R };
}

/** A gull: one to three glide-pitched "kee-ow" calls, or a laughing run; a rasp of fast vibrato. */
export function* gull(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const laugh = r() < 0.3;
  const calls = laugh ? 4 + Math.floor(r() * 4) : 1 + Math.floor(r() * 3);
  const base = range(r, 1150, 1600);
  const starts: Array<[number, number]> = [];
  for (let k = 0, t = 0.01; k < calls; k++) { const dur = laugh ? range(r, 0.1, 0.14) : range(r, 0.3, 0.45); starts.push([t, dur]); t += laugh ? range(r, 0.15, 0.2) : dur + range(r, 0.1, 0.25); }
  const last = starts[starts.length - 1];
  const T = last[0] + last[1] + 0.1, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bp = new Svf(sr), lo = new Svf(sr);
  bp.set(base * 1.6, 2.5); lo.set(range(r, 2400, 5000), 0.7);
  const vib = range(r, 28, 40), pan = range(r, -0.8, 0.8), [gl, gr] = panGains(pan);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let f = 0, e = 0;
    for (const [at, dur] of starts) {
      const u = t - at;
      if (u < 0 || u > dur) continue;
      const x = u / dur;
      f = x < 0.3 ? lerp(base * 1.1, base * (laugh ? 1.35 : 1.75), x / 0.3) : base * (laugh ? 1.35 : 1.75) * Math.pow((laugh ? 0.95 : 0.8) / (laugh ? 1.35 : 1.75), (x - 0.3) / 0.7);
      e = smooth(u / 0.025) * (x < 0.4 ? 1 : Math.exp(-(x - 0.4) * 5)) * 0.5;
    }
    let v = 0;
    if (e > 0) {
      f *= 1 + 0.035 * Math.sin(TAU * vib * t);
      ph += (TAU * f) / sr;
      // a band-limited sawtooth: the harmonics that fit under Nyquist
      for (let k = 1; k <= 8 && k * f < sr * 0.45; k++) v += Math.sin(ph * k) / k;
      v += N() * 0.25;   // breath in the call
    }
    bp.run(v * e); lo.run(bp.bp / 2.5);
    L[i] = lo.lp * gl; R[i] = lo.lp * gr;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  seal({ L, R }, sr, 0.002, 0.05);
  return { sr, L, R };
}

/** Rigging / mooring-line creak: a stick-slip rasp through a narrow, sliding band. */
export function* creak(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed);
  const dur = range(r, 0.35, 0.95), T = dur + 0.25, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const f0 = range(r, 70, 130), f1 = range(r, 90, 170), b0 = range(r, 500, 800), b1 = range(r, 700, 1300);
  const flut = range(r, 18, 38), pan = range(r, -0.6, 0.6), [gl, gr] = panGains(pan);
  const bp = new Svf(sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, x = Math.min(1, t / dur);
    if ((i & 31) === 0) bp.set(lerp(b0, b1, x), 9);
    ph += lerp(f0, f1, x) / sr; ph -= Math.floor(ph);
    const tri = Math.abs(((t * flut) % 1) * 2 - 1);
    const e = (t < 0.08 ? t / 0.08 : t < 0.08 + dur * 0.5 ? 1 : Math.exp(-(t - 0.08 - dur * 0.5) / (dur * 0.15))) * 0.7;
    bp.run((ph * 2 - 1) * (0.5 + 0.5 * tri) * e);
    L[i] = (bp.bp / 9) * gl; R[i] = (bp.bp / 9) * gr;
  }
  yield;
  seal({ L, R }, sr, 0.002, 0.1);
  return { sr, L, R };
}

// ---------------------------------------------------------------------------------------------------------
// Weather and season clips
// ---------------------------------------------------------------------------------------------------------

/** RMS of unit noise through a 2-pole lowpass at fc (noise-equivalent bandwidth ≈ 1.11 fc): divide by it. */
const lpRms = (fc: number, sr: number) => Math.sqrt(Math.min(1, (1.11 * fc) / (sr / 2)));

/** A drop or leaf tick: a few ms of noise through a resonant band (unity gain at the peak), soft-started. */
function tick(L: Float32Array, R: Float32Array, sr: number, at: number, f: number, q: number, tau: number, amp: number, pan: number, N: () => number): void {
  const i0 = Math.floor(at * sr), n = Math.min(L.length - i0, Math.ceil(tau * 6 * sr) + 4);
  if (i0 < 0 || n <= 0) return;
  const [gl, gr] = panGains(pan);
  const bp = new Svf(sr); bp.set(f, q);
  const d = Math.exp(-1 / (tau * sr));
  let e = amp;
  for (let i = 0; i < n; i++) {
    bp.run(N() * e * (i < 4 ? (i + 1) / 5 : 1));
    const s = bp.bp / q;
    L[i0 + i] += s * gl; R[i0 + i] += s * gr;
    e *= d;
  }
}

/**
 * An N-wave: the pressure jump of a thunder crack, then a linear fall through zero and a quick return. Its
 * duration sets its colour (short = bright tearing, long = a dull thud from farther along the channel).
 */
function nwave(L: Float32Array, R: Float32Array, sr: number, at: number, dur: number, amp: number, pan: number): void {
  const i0 = Math.floor(at * sr), m = Math.max(5, Math.round(dur * sr));
  if (i0 < 0 || i0 + m + 6 > L.length) return;
  const [gl, gr] = panGains(pan);
  for (let i = 0; i <= m + 5; i++) {
    const v = i < 3 ? (amp * (i + 1)) / 4 : i <= m ? amp * (1 - (2 * i) / m) : -amp * (1 - (i - m) / 6);
    L[i0 + i] += v * gl; R[i0 + i] += v * gr;
  }
}

/** Scale a clip down (never up) so its peak stays at or below `peak`: no new clip can approach full scale. */
function limit(c: { L: Float32Array; R: Float32Array }, peak: number): void {
  let p = 0;
  for (let i = 0; i < c.L.length; i++) p = Math.max(p, Math.abs(c.L[i]), Math.abs(c.R[i]));
  if (p <= peak) return;
  const k = peak / p;
  for (let i = 0; i < c.L.length; i++) { c.L[i] *= k; c.R[i] *= k; }
}

/**
 * Rain on roofs, quays and puddles: drop ticks on hard surfaces (a resonant band each), plinks where drops
 * land in standing water (a Minnaert bubble, pitch rising), over the merged roar of countless far drops.
 * `rate` drops per second (drizzle ~45, rain ~170). 4 s, faded at both ends: overlapped end to end.
 */
export function* patter(seed: number, sr: number, rate: number, size: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 4, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  // the roof roar: a soft band of noise, independent L/R, swelling a little with the shower's own gusting
  const fl = new Svf(sr), fr = new Svf(sr);
  fl.set(range(r, 1500, 2500), 0.45); fr.set(range(r, 1500, 2500), 0.45);
  const kw = onePole(0.7, sr), wStd = Math.sqrt(kw / 2);
  const bed = 0.05 * Math.sqrt(rate / 170) * size;
  let w = 0;
  for (let i = 0; i < n; i++) {
    w += kw * (N() - w);
    const e = bed * Math.max(0.35, 1 + 0.35 * (w / wStd));
    fl.run(N()); fr.run(N());
    L[i] += fl.bp * e; R[i] += fr.bp * e;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  for (let t = 0.005; t < T - 0.02;) {
    t += -Math.log(1 - r() * 0.9999) / rate;
    const loud = Math.pow(r(), 3), pan = range(r, -0.95, 0.95);
    if (r() < 0.14) {
      const f = logRange(r, 1000, 3600);
      grain(L, R, sr, t, f, range(r, 6, 14) / f, (0.008 + 0.05 * loud) * size, pan, 0.4, r() * TAU);
    } else if (r() < 0.04 * size) {
      // a fat drop off a gutter onto a plank: low and dull
      tick(L, R, sr, t, logRange(r, 380, 900), 2, range(r, 0.003, 0.006), 0.22 * size, pan, N);
    } else {
      tick(L, R, sr, t, logRange(r, 700, 6500), range(r, 1.5, 5), range(r, 0.0005, 0.003), (0.03 + 0.24 * loud) * size, pan, N);
    }
  }
  yield;
  seal({ L, R }, sr, 0.5, 0.5);
  limit({ L, R }, 0.8);
  return { sr, L, R };
}

/** Eaves still dripping: one to three drops into a puddle or onto a plank. 1.6 s. */
export function* drip(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 1.6, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const pan = range(r, -0.8, 0.8), drops = 1 + Math.floor(r() * 2.6);
  for (let k = 0; k < drops; k++) {
    const at = 0.03 + r() * (T - 0.6), f = logRange(r, 700, 2400);
    grain(L, R, sr, at, f, range(r, 10, 18) / f, range(r, 0.06, 0.14), pan + range(r, -0.1, 0.1), 0.45, r() * TAU);
    tick(L, R, sr, at, f * range(r, 2.5, 3.5), 3, 0.0008, 0.06, pan, N);
  }
  yield;
  seal({ L, R }, sr, 0.002, 0.1);
  limit({ L, R }, 0.8);
  return { sr, L, R };
}

/** Asymmetric swell: a quicker rise, a slower fall (a roll of thunder, a gust). */
const swell = (t: number, c: number, w: number) => { const u = (t - c) / (t < c ? w * 0.45 : w); return Math.exp(-u * u); };

/** The "rolling" of a roll of thunder: a slow random flutter (a few Hz) of its loudness, mean 1. */
function roller(N: () => number, sr: number, hz: number, depth: number): () => number {
  const k = onePole(hz, sr), std = Math.sqrt(k / 2);
  let a = 0, b = 0;
  return () => { a += k * (N() - a); b += k * (a - b); return Math.max(0.12, 1 + depth * (b / std) * 1.6); };
}

/**
 * A near strike: the TEAR (a ripping run of N-wave cracks from the nearest stretches of the channel, dense
 * then thinning and duller as the sound arrives from farther along it), the CLAP and its low boom, then the
 * ROLL: swells of low rumble as the rest of the channel, and the echoes off the hills, arrive. 7.5–10 s.
 */
export function* thunder(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = range(r, 7.5, 10), n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const pan0 = range(r, -0.3, 0.3), t0 = 0.03, tear = range(r, 0.25, 0.6);
  // 1. the tear
  for (let t = t0; t < t0 + tear;) {
    const x = (t - t0) / tear;
    t += -Math.log(1 - r() * 0.9999) / (900 * (1 - x) * (1 - x) + 40);
    nwave(L, R, sr, t, range(r, 0.0003, 0.0012) * (1 + 2.5 * x), (0.06 + 0.32 * Math.pow(r(), 2)) * (1 - 0.65 * x), pan0 + range(r, -0.5, 0.5));
  }
  yield;
  // 2. the clap's boom and body, then 3. the roll (independent L/R so it fills the sky)
  const tc = t0 + tear * 0.15;
  const boom = new Svf(sr), body = new Svf(sr), rl = new Svf(sr), rr = new Svf(sr), gl = new Svf(sr), gr = new Svf(sr);
  const fBoom = range(r, 60, 85), fRoll = range(r, 95, 140);
  boom.set(fBoom, 0.7); body.set(range(r, 180, 260), 0.8); rl.set(fRoll, 0.7); rr.set(fRoll * 1.06, 0.7); gl.set(300, 1); gr.set(320, 1);
  const kBoom = 0.3 / lpRms(fBoom, sr), kRoll = 0.15 / lpRms(fRoll, sr);
  const swells: Array<[number, number, number]> = [];
  for (let k = 0, c = tc + range(r, 0.5, 1.1), a = 1; k < 4 + Math.floor(r() * 4); k++, c += range(r, 0.5, 1.6), a *= range(r, 0.5, 0.92)) swells.push([c, range(r, 0.4, 1.2), a]);
  const boomDecay = range(r, 0.6, 1.1), roll = roller(N, sr, range(r, 3, 6), 0.55);
  for (let i = Math.floor(tc * sr); i < n; i++) {
    const t = i / sr, u = t - tc;
    const be = smooth(u / 0.025) * Math.exp(-u / boomDecay);
    let re = 0;
    for (const [c, w, a] of swells) re += a * swell(t, c, w);
    re *= (1 - smooth((t - (T - 1.8)) / 1.8)) * roll();
    const m = N();
    boom.run(m); body.run(m);
    rl.run(N()); rr.run(N()); gl.run(N()); gr.run(N());
    const mono = boom.lp * kBoom * be + body.bp * 0.25 * be * Math.exp(-u / 0.35);
    L[i] += mono * 0.95 + rl.lp * kRoll * re + gl.bp * 0.1 * re * (1 - smooth(u / 4));
    R[i] += mono + rr.lp * kRoll * re + gr.bp * 0.1 * re * (1 - smooth(u / 4));
    if ((i % SLICE) === SLICE - 1) yield;
  }
  seal({ L, R }, sr, 0.003, 1.2);
  limit({ L, R }, 0.85);
  return { sr, L, R };
}

/** A far strike: only the low roll survives the distance, swelling and grumbling for 11–16 s. */
export function* rumble(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = range(r, 11, 16), n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  // the roll sits low, but its grumble (180–300 Hz) is what a small speaker can actually play
  const f = range(r, 85, 140), fl = new Svf(sr), fr = new Svf(sr), gl = new Svf(sr), gr = new Svf(sr);
  fl.set(f, 0.6); fr.set(f * 1.05, 0.6); gl.set(range(r, 180, 300), 1.1); gr.set(range(r, 180, 300), 1.1);
  const k = 0.3 / lpRms(f, sr);
  const swells: Array<[number, number, number]> = [];
  const first = r() < 0.5 ? 1 : 0.7;
  for (let j = 0, c = range(r, 0.6, 1.4), a = first; j < 4 + Math.floor(r() * 5); j++, c += range(r, 1, 2.6), a = (j === 1 && first < 1 ? 1 : a * range(r, 0.5, 0.9))) swells.push([c, range(r, 0.35, 1.1), a]);
  const roll = roller(N, sr, range(r, 2, 4.5), 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let e = 0;
    for (const [c, w, a] of swells) e += a * swell(t, c, w);
    // the reverberant roll between the swells never quite stops until the end
    e = (e + 0.18 * smooth(t / swells[0][0]) * Math.exp(-t / (T * 0.45))) * roll();
    fl.run(N()); fr.run(N()); gl.run(N()); gr.run(N());
    const grumble = 0.16 * e * (1 - 0.6 * smooth(t / (T * 0.6)));
    L[i] = fl.lp * k * e + gl.bp * grumble;
    R[i] = fr.lp * k * e + gr.bp * grumble;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  seal({ L, R }, sr, 0.1, 1.5);
  limit({ L, R }, 0.8);
  return { sr, L, R };
}

interface Note { t: number; d: number; f0: number; f1: number; arch: number; a: number }

/**
 * A songbird phrase from the trees: a fluting run of whistled notes (blackbird, robin), an accelerating
 * trill ending in a flourish (chaffinch, wren), or a repeated two-note "tea-cher" (great tit). 1–3 s.
 */
export function* bird(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed);
  const notes: Note[] = [];
  const kind = r();
  let t = 0.02;
  if (kind < 0.4) {
    for (let k = 0, m = 3 + Math.floor(r() * 4); k < m; k++) {
      const d = range(r, 0.08, 0.24), f0 = logRange(r, 1500, 2900);
      notes.push({ t, d, f0, f1: f0 * range(r, 0.75, 1.35), arch: range(r, -0.15, 0.2), a: range(r, 0.45, 1) });
      t += d + range(r, 0.03, 0.12);
    }
    if (r() < 0.6) for (let k = 0, m = 3 + Math.floor(r() * 6); k < m; k++) {
      const d = range(r, 0.02, 0.04), f0 = logRange(r, 3800, 6200);
      notes.push({ t, d, f0, f1: f0 * range(r, 0.8, 1.1), arch: 0, a: range(r, 0.15, 0.35) });
      t += d + range(r, 0.015, 0.03);
    }
  } else if (kind < 0.75) {
    const m = 8 + Math.floor(r() * 9), top = range(r, 4300, 5600);
    for (let k = 0; k < m; k++) {
      const x = k / m, d = range(r, 0.03, 0.045), f0 = top * (1 - 0.25 * x);
      notes.push({ t, d, f0, f1: f0 * 0.62, arch: 0.05, a: 0.5 + 0.4 * x });
      t += lerp(0.095, 0.055, x);
    }
    for (let k = 0, m = 2 + Math.floor(r() * 2); k < m; k++) {
      const d = range(r, 0.08, 0.14), f0 = lerp(3600, 2600, k / m);
      notes.push({ t, d, f0, f1: f0 * range(r, 0.85, 1.25), arch: 0.15, a: 0.9 });
      t += d + 0.03;
    }
  } else {
    const hi = range(r, 5200, 6600), lo = hi * range(r, 0.62, 0.72);
    for (let k = 0, m = 3 + Math.floor(r() * 4); k < m; k++) {
      const d1 = range(r, 0.07, 0.1), d2 = range(r, 0.07, 0.1);
      notes.push({ t, d: d1, f0: hi, f1: hi * 0.97, arch: 0, a: 0.8 });
      notes.push({ t: t + d1 + 0.04, d: d2, f0: lo, f1: lo * 0.95, arch: 0, a: 0.7 });
      t += d1 + d2 + range(r, 0.12, 0.18);
    }
  }
  const T = t + 0.25, n = Math.ceil(T * sr);
  const D = new Float32Array(n), L = new Float32Array(n), R = new Float32Array(n);
  const pan = range(r, -0.7, 0.7), [pl, pr] = panGains(pan);
  const h2 = range(r, 0.05, 0.2), vib = range(r, 18, 40), vibD = range(r, 0, 0.012);
  const kSoft = onePole(range(r, 5500, 8000), sr);
  let ph = 0, soft = 0;
  for (const nt of notes) {
    const i0 = Math.floor(nt.t * sr), m = Math.ceil(nt.d * sr);
    for (let i = 0; i < m && i0 + i < n; i++) {
      const x = i / m, u = i / sr;
      const f = (lerp(nt.f0, nt.f1, x) + nt.arch * Math.sin(Math.PI * x) * nt.f0) * (1 + vibD * Math.sin(TAU * vib * u));
      ph += (TAU * f) / sr;
      const e = smooth(x / 0.12) * smooth((1 - x) / 0.25) * nt.a * 0.3;
      D[i0 + i] += (Math.sin(ph) + h2 * Math.sin(2 * ph)) * e;
    }
  }
  yield;
  // softened by the distance and the leaves, with a faint second arrival off the trunks
  const echo = Math.floor(range(r, 0.05, 0.09) * sr);
  for (let i = 0; i < n; i++) {
    soft += kSoft * (D[i] - soft);
    const v = soft + (i >= echo ? D[i - echo] * 0.14 : 0);
    L[i] = v * pl; R[i] = v * pr;
  }
  seal({ L, R }, sr, 0.005, 0.12);
  limit({ L, R }, 0.6);
  return { sr, L, R };
}

/** Crickets at dusk: two to four callers (a carrier near 4.5 kHz in chirps of 3–5 pulses) over a far chorus. 4 s, overlapped. */
export function* cricket(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 4, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let c = 0, m = 2 + Math.floor(r() * 3); c < m; c++) {
    const fc = range(r, 4200, 5200), period = range(r, 0.38, 0.65), pulses = 3 + Math.floor(r() * 3);
    const pd = range(r, 0.011, 0.018), pg = range(r, 0.008, 0.012), amp = range(r, 0.04, 0.14);
    const [gl, gr] = panGains(range(r, -0.9, 0.9));
    for (let t = r() * period; t < T; t += period * range(r, 0.96, 1.04)) {
      for (let p = 0; p < pulses; p++) {
        const i0 = Math.floor((t + p * (pd + pg)) * sr), len = Math.ceil(pd * sr);
        let ph = r() * TAU;
        for (let i = 0; i < len && i0 + i < n; i++) {
          const x = i / len, e = Math.pow(Math.sin(Math.PI * x), 2) * amp;
          ph += (TAU * fc * (1 - 0.02 * x)) / sr;
          const v = (Math.sin(ph) + 0.1 * Math.sin(2 * ph)) * e;
          L[i0 + i] += v * gl; R[i0 + i] += v * gr;
        }
      }
    }
    yield;
  }
  // the far chorus: band-limited noise in a fast pulse, wandering in level
  const bl = new Svf(sr), br = new Svf(sr);
  bl.set(4600, 5); br.set(4500, 5);
  const kw = onePole(0.5, sr), wStd = Math.sqrt(kw / 2), rate = range(r, 26, 34);
  let w = 0;
  for (let i = 0; i < n; i++) {
    w += kw * (N() - w);
    const puls = Math.pow(Math.abs(Math.sin((Math.PI * rate * i) / sr)), 4);
    const e = 0.03 * puls * Math.max(0.2, 1 + 0.4 * (w / wStd));
    bl.run(N()); br.run(N());
    L[i] += (bl.bp / 5) * e; R[i] += (br.bp / 5) * e;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  seal({ L, R }, sr, 0.5, 0.5);
  limit({ L, R }, 0.6);
  return { sr, L, R };
}

/** Summer-afternoon cicadas in the groves: a few callers, each a ~4.8 kHz buzz in tymbal pulses that swells and ebbs, over a far chorus. 5 s, overlapped. */
export function* cicada(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 5, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let c = 0, m = 3 + Math.floor(r() * 3); c < m; c++) {
    const bp = [new Svf(sr), new Svf(sr)];
    bp[0].set(range(r, 4200, 5600), 4); bp[1].set(range(r, 4200, 5600), 4);
    const rate = range(r, 120, 190), swellHz = range(r, 0.25, 0.5), ph0 = r() * TAU, amp = range(r, 0.05, 0.12);
    const [gl, gr] = panGains(range(r, -0.9, 0.9));
    for (let i = 0; i < n; i++) {
      const tym = Math.pow(0.5 + 0.5 * Math.sin((TAU * rate * i) / sr), 2);
      const swl = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(TAU * swellHz * (i / sr) + ph0), 1.5);
      const e = amp * tym * swl;
      L[i] += (bp[0].run(N()), bp[0].bp / 4) * e * gl; R[i] += (bp[1].run(N()), bp[1].bp / 4) * e * gr;
      if ((i % SLICE) === SLICE - 1) yield;
    }
  }
  seal({ L, R }, sr, 0.5, 0.5);
  limit({ L, R }, 0.5);
  return { sr, L, R };
}

/**
 * A gust through dry leaves: a swell of tiny crisp ticks and a hiss, with a few leaves skittering over the
 * cobbles. The scheduler darkens it for green summer leaves. 2–3.5 s.
 */
export function* rustle(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = range(r, 2, 3.5), n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const tp = range(r, 0.4, 0.9), decay = range(r, 0.5, 1.1);
  const env = (t: number) => (t < tp ? smooth(t / tp) : Math.exp(-(t - tp) / decay));
  const pan0 = range(r, -0.8, 0.8), pan1 = range(r, -0.8, 0.8);
  for (let t = 0.01; t < T - 0.05;) {
    t += -Math.log(1 - r() * 0.9999) / (30 + 1100 * env(t));
    const e = env(t);
    tick(L, R, sr, t, logRange(r, 1800, 9000), range(r, 1.2, 3), range(r, 0.0002, 0.0009), (0.05 + 0.5 * Math.pow(r(), 4)) * (0.3 + 0.7 * e), lerp(pan0, pan1, t / T) + range(r, -0.5, 0.5), N);
  }
  yield;
  const kl = onePole(2200, sr);
  let al = 0, ar = 0;
  for (let i = 0; i < n; i++) {
    const e = env(i / sr) * 0.035, wl = N(), wr = N();
    al += kl * (wl - al); ar += kl * (wr - ar);
    L[i] += (wl - al) * e; R[i] += (wr - ar) * e;
    if ((i % SLICE) === SLICE - 1) yield;
  }
  for (let k = 0, m = 1 + Math.floor(r() * 4); k < m; k++) {
    let t = range(r, tp * 0.6, Math.min(T - 0.8, tp + decay));
    const pan = range(r, -0.7, 0.7);
    for (let j = 0, c = 5 + Math.floor(r() * 8); j < c; j++, t += range(r, 0.025, 0.06)) {
      tick(L, R, sr, t, logRange(r, 2500, 6000), 2, range(r, 0.0004, 0.001), range(r, 0.2, 0.45), pan, N);
      if (r() < 0.4) tick(L, R, sr, t, logRange(r, 900, 1500), 2, 0.002, 0.12, pan, N);
    }
  }
  seal({ L, R }, sr, 0.01, 0.2);
  limit({ L, R }, 0.7);
  return { sr, L, R };
}

/** Footsteps crunching in fresh snow: two to four steps, each a heel-and-toe burst of tiny compressions. */
export function* crunch(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const steps = 2 + Math.floor(r() * 3), gap = range(r, 0.5, 0.62);
  const T = steps * gap + 0.4, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const pan0 = range(r, -0.6, 0.6), pan1 = pan0 + range(r, -0.3, 0.3);
  const thud = new Svf(sr); thud.set(120, 0.7);
  const kThud = 0.012 / lpRms(120, sr);
  for (let s = 0; s < steps; s++) {
    const ts = 0.05 + s * gap * range(r, 0.96, 1.04), ds = range(r, 0.16, 0.26), heel = range(r, 0.3, 0.45);
    const env = (u: number) => (u < 0 || u > ds ? 0 : 0.7 * swell(u, ds * 0.15, ds * 0.18) + swell(u, ds * (heel + 0.2), ds * 0.25));
    const pan = lerp(pan0, pan1, s / steps) + (s % 2 ? 0.08 : -0.08);
    for (let u = 0; u < ds;) {
      u += -Math.log(1 - r() * 0.9999) / (200 + 2200 * env(u));
      const e = env(u);
      if (e > 0.02) tick(L, R, sr, ts + u, logRange(r, 700, 4500), range(r, 1.2, 2), range(r, 0.0003, 0.0012), (0.03 + 0.1 * Math.pow(r(), 3)) * e, pan, N);
    }
    const i0 = Math.floor(ts * sr), m = Math.ceil(ds * sr), [gl, gr] = panGains(pan);
    for (let i = 0; i < m && i0 + i < n; i++) {
      thud.run(N());
      const v = thud.lp * kThud * env(i / sr);
      L[i0 + i] += v * gl; R[i0 + i] += v * gr;
    }
    yield;
  }
  seal({ L, R }, sr, 0.005, 0.1);
  limit({ L, R }, 0.5);
  return { sr, L, R };
}

// ---------------------------------------------------------------------------------------------------------
// The Shipyard: shipwrights' tools on oak (decorative mirror of the yard's visible work)
// ---------------------------------------------------------------------------------------------------------

/**
 * A caulking mallet on a trenail or a chisel: a wooden "thock" — a 1–2 ms knock of noise exciting two body
 * resonances (the mallet head ~150–220 Hz, the struck timber ~520–760 Hz), a dull thump under it. 0.4 s.
 */
export function* mallet(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 0.4, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const lo = new Svf(sr), hi = new Svf(sr), kT = onePole(140, sr);
  const qLo = range(r, 5, 8), qHi = range(r, 6, 10);
  lo.set(range(r, 150, 220), qLo); hi.set(range(r, 520, 760), qHi);
  const tauX = range(r, 0.0012, 0.0024), aHi = range(r, 0.45, 0.8);
  let th = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ex = N() * (i < 6 ? (i + 1) / 7 : Math.exp(-(t - 6 / sr) / tauX));
    lo.run(ex); hi.run(ex);
    th += kT * (ex - th);
    // /Q: unity gain at each resonance
    const v = (lo.bp / qLo) * 2.2 + (hi.bp / qHi) * 1.6 * aHi + th * 1.2 * Math.exp(-t / 0.03);
    L[i] = v; R[i] = v;
  }
  yield;
  seal({ L, R }, sr, 0.0005, 0.08);
  limit({ L, R }, 0.5);
  return { sr, L, R };
}

/** An adze dressing a plank: a brighter bite into the grain and a few splinter ticks. 0.3 s. */
export function* adze(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const T = 0.3, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bite = new Svf(sr), body = new Svf(sr);
  const qB = range(r, 2, 3.5);
  bite.set(range(r, 1400, 2400), qB); body.set(range(r, 380, 520), 6);
  const tau = range(r, 0.006, 0.014);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ex = N() * smooth(t / 0.002) * Math.exp(-t / tau);
    bite.run(ex); body.run(ex);
    const v = (bite.bp / qB) * 0.9 + (body.bp / 6) * 1.4;
    L[i] = v; R[i] = v;
  }
  for (let k = 0, m = 2 + Math.floor(r() * 4); k < m; k++) {
    tick(L, R, sr, range(r, 0.008, 0.08), logRange(r, 2200, 5200), 2.5, range(r, 0.0004, 0.001), range(r, 0.06, 0.16), 0, N);
  }
  yield;
  seal({ L, R }, sr, 0.0005, 0.06);
  limit({ L, R }, 0.45);
  return { sr, L, R };
}

/**
 * A pit saw through oak: one push and one pull (the pull a little lower and softer), each a breathy band of
 * noise chattered by the teeth (~55–95 strokes of a tooth per second) under an arched envelope. ~1.1–1.5 s.
 */
export function* saw(seed: number, sr: number): Generator<void, Clip> {
  const r = makeRng(seed), N = noiseOf(r, sr);
  const d1 = range(r, 0.38, 0.55), gap = range(r, 0.06, 0.14), d2 = range(r, 0.36, 0.52);
  const T = 0.02 + d1 + gap + d2 + 0.12, n = Math.ceil(T * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bp = new Svf(sr), kTooth = range(r, 55, 95);
  const strokes: Array<[number, number, number, number]> = [[0.02, d1, range(r, 2400, 3400), 1], [0.02 + d1 + gap, d2, range(r, 1900, 2700), 0.75]];
  let ph = 0;
  for (const [at, d, fc, a] of strokes) {
    bp.set(fc, 1.6);
    const i0 = Math.floor(at * sr), m = Math.ceil(d * sr);
    for (let i = 0; i < m && i0 + i < n; i++) {
      const x = i / m;
      ph += kTooth * (0.8 + 0.4 * Math.sin(Math.PI * x)) / sr; ph -= Math.floor(ph);
      const teeth = 0.35 + 0.65 * Math.pow(1 - ph, 3);
      const e = smooth(x / 0.18) * smooth((1 - x) / 0.25) * a;
      bp.run(N() * teeth * e);
      const v = (bp.bp / 1.6) * 0.32;
      L[i0 + i] += v; R[i0 + i] += v;
      if (((i0 + i) % SLICE) === SLICE - 1) yield;
    }
  }
  seal({ L, R }, sr, 0.005, 0.08);
  limit({ L, R }, 0.4);
  return { sr, L, R };
}

export const SYNTHS: Record<ClipKind, (seed: number, sr: number) => Generator<void, Clip>> = {
  shore: (s, sr) => shoreWash(s, sr, { stone: (s & 3) === 3 }),
  lap,
  reef: reefSurf,
  crackle,
  press,
  halyard,
  bell,
  gull,
  creak,
  drizzle: (s, sr) => patter(s, sr, 45, 0.6),
  rain: (s, sr) => patter(s, sr, 170, 1),
  drip,
  thunder,
  rumble,
  bird,
  cricket,
  cicada,
  rustle,
  crunch,
  mallet,
  adze,
  saw,
};

/** Run a synthesiser to completion (Node, tests). */
export function renderNow<T>(g: Generator<void, T>): T {
  for (;;) { const s = g.next(); if (s.done) return s.value; }
}

/**
 * The offline mix gate's meters (scripts/audio/mix-report.mjs): ITU-R BS.1770-4 loudness (K-weighting, 400 ms
 * blocks at 75 % overlap, the −70 LUFS absolute and −10 LU relative gates), momentary and short-term maxima,
 * the EBU Tech 3342 loudness range, a 4× oversampled true peak, a "laptop speaker" variant (a 4th-order 200 Hz
 * highpass before the K-weighting) and the share of energy above a frequency. Pure functions over PCM channels,
 * no Node or DOM APIs: the CLI and the vitest self-tests (src/harbour/audio/mix-report.test.ts) share them.
 */

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** K-weighting at any rate: the pre-filter's high shelf, then the RLB highpass (BS.1770-4 at 48 kHz). */
export function kWeighting(sr: number): Biquad[] {
  // the analog prototypes behind the Recommendation's 48 kHz coefficients (as libebur128 derives them)
  let K = Math.tan((Math.PI * 1681.974450955533) / sr);
  const Q = 0.7071752369554196, Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0,
  };
  K = Math.tan((Math.PI * 38.13547087602444) / sr);
  const q = 0.5003270373238773, d = 1 + K / q + K * K;
  return [shelf, { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / d, a2: (1 - K / q + K * K) / d }];
}

/** A 2nd-order Butterworth-family highpass (RBJ) at `f0`, quality `q`. */
export function highpass(f0: number, q: number, sr: number): Biquad {
  const w = (2 * Math.PI * f0) / sr, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0 };
}

/** The small-speaker view: a 4th-order Butterworth highpass at 200 Hz (two sections). */
export function laptop(sr: number): Biquad[] {
  return [highpass(200, 0.5411961, sr), highpass(200, 1.3065630, sr)];
}

/** Filter a channel through biquad sections (transposed direct form II, in double precision). */
export function filter(x: ArrayLike<number>, stages: readonly Biquad[]): Float64Array {
  const y = Float64Array.from(x);
  for (const s of stages) {
    let z1 = 0, z2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = y[i], o = s.b0 * v + z1;
      z1 = s.b1 * v - s.a1 * o + z2;
      z2 = s.b2 * v - s.a2 * o;
      y[i] = o;
    }
  }
  return y;
}

/** Loudness of a channel-summed mean square (all channel weights 1: stereo). */
export const lufs = (ms: number): number => -0.691 + 10 * Math.log10(ms);

const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/**
 * The K-weighted mean square of every 100 ms segment, summed over the channels: the gating's quarter blocks.
 * `pre` runs before the K-weighting (the laptop view).
 */
export function segments(channels: readonly ArrayLike<number>[], sr: number, pre: readonly Biquad[] = []): Float64Array {
  const hop = Math.round(sr * 0.1), n = Math.floor(channels[0].length / hop), seg = new Float64Array(n);
  for (const ch of channels) {
    const y = filter(ch, [...pre, ...kWeighting(sr)]);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let i = k * hop; i < (k + 1) * hop; i++) s += y[i] * y[i];
      seg[k] += s / hop;
    }
  }
  return seg;
}

/** Mean squares of every window of `w` consecutive segments (400 ms = 4, 3 s = 30), one per 100 ms. */
export function windows(seg: Float64Array, w: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + w <= seg.length; i++) {
    let s = 0;
    for (let k = i; k < i + w; k++) s += seg[k];
    out.push(s / w);
  }
  return out;
}

/** BS.1770-4 integrated loudness of 400 ms block mean squares: absolute gate −70 LUFS, relative gate −10 LU. */
export function integrated(blocks: readonly number[]): number {
  const abs = blocks.filter((z) => lufs(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = lufs(mean(abs)) - 10;
  return lufs(mean(abs.filter((z) => lufs(z) > rel)));
}

/** EBU Tech 3342 loudness range of 3 s short-term mean squares: gates −70 LUFS and −20 LU, 10th–95th percentile. */
export function loudnessRange(short: readonly number[]): number {
  const abs = short.filter((z) => lufs(z) > -70);
  if (abs.length < 2) return 0;
  const rel = lufs(mean(abs)) - 20;
  const v = abs.map(lufs).filter((l) => l > rel).sort((a, b) => a - b);
  const at = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))];
  return at(0.95) - at(0.1);
}

/** Zeroth-order modified Bessel function (the Kaiser window). */
function bessel0(x: number): number {
  let s = 1, t = 1;
  for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-12 * s) break; }
  return s;
}

/**
 * The 4× interpolator: a Kaiser-windowed sinc, 32 taps per phase, each phase normalised to unit DC gain.
 * Phase 0 is the identity (the input samples themselves), so the true peak is never below the sample peak.
 */
function interpolator(factor: number, taps: number, beta = 8.6): Float64Array[] {
  const n = factor * taps + 1, c = (n - 1) / 2, h = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i - c) / factor, r = (i - c) / c;
    h[i] = (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)) * (bessel0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / bessel0(beta));
  }
  return Array.from({ length: factor }, (_, p) => {
    const ph: number[] = [];
    for (let i = p; i < n; i += factor) ph.push(h[i]);
    const g = ph.reduce((a, b) => a + b, 0);
    return Float64Array.from(ph, (v) => v / g);
  });
}

/**
 * Sample and true peak (BS.1770-4 Annex 2: 4× oversampled) of the channels, in dBFS / dBTP. Only the
 * stretches within 6 dB of the loudest sample are oversampled (an inter-sample over never exceeds that).
 */
export function peaks(channels: readonly ArrayLike<number>[], factor = 4): { sample: number; truePeak: number } {
  let sp = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) sp = Math.max(sp, Math.abs(ch[i]));
  if (sp === 0) return { sample: -Infinity, truePeak: -Infinity };
  const phases = interpolator(factor, 32), T = phases[0].length, B = 1024, floor = sp * 10 ** (-6 / 20);
  let tp = sp;
  for (const ch of channels) {
    for (let b0 = 0; b0 < ch.length; b0 += B) {
      let bp = 0;
      for (let i = b0; i < Math.min(ch.length, b0 + B); i++) bp = Math.max(bp, Math.abs(ch[i]));
      if (bp < floor) continue;
      // every output sample of this stretch (and the filter's reach on either side)
      for (let m = Math.max(0, b0 - T); m < Math.min(ch.length + T, b0 + B + T); m++) {
        for (const ph of phases) {
          let y = 0;
          for (let k = 0; k < ph.length; k++) { const j = m - k; if (j >= 0 && j < ch.length) y += ph[k] * ch[j]; }
          tp = Math.max(tp, Math.abs(y));
        }
      }
    }
  }
  return { sample: 20 * Math.log10(sp), truePeak: 20 * Math.log10(tp) };
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Welch power spectrum (Hann, 50 % overlap) summed over the channels: power per bin of width sr / n. */
export function spectrum(channels: readonly ArrayLike<number>[], n = 8192): Float64Array {
  const p = new Float64Array(n / 2 + 1), w = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  for (const ch of channels) {
    for (let s = 0; s + n <= ch.length; s += n / 2) {
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) re[i] = ch[s + i] * w[i];
      fft(re, im);
      for (let k = 0; k <= n / 2; k++) p[k] += re[k] * re[k] + im[k] * im[k];
    }
  }
  return p;
}

/** Share (0..1) of the (unweighted) energy above `hz`, DC excluded. */
export function energyAbove(channels: readonly ArrayLike<number>[], sr: number, hz: number, n = 8192): number {
  const p = spectrum(channels, n);
  let lo = 0, hi = 0;
  for (let k = 1; k < p.length; k++) { if ((k * sr) / n > hz) hi += p[k]; else lo += p[k]; }
  return hi + lo > 0 ? hi / (hi + lo) : 0;
}

export interface Meter {
  /** integrated loudness (LUFS) and its laptop-speaker variant */
  integrated: number;
  laptop: number;
  momentaryMax: number;
  shortTermMax: number;
  shortTermMin: number;
  /** loudness range (LU) */
  lra: number;
  samplePeak: number;
  truePeak: number;
  /** momentary loudness every 100 ms (the 400 ms window ending there), for on-ramps and timelines */
  momentary: number[];
}

/** Every meter at once for a stereo (or mono) render. */
export function meter(channels: readonly ArrayLike<number>[], sr: number): Meter {
  const seg = segments(channels, sr), blocks = windows(seg, 4), short = windows(seg, 30);
  const lap = windows(segments(channels, sr, laptop(sr)), 4);
  const st = short.map(lufs).filter((l) => l > -70);
  const pk = peaks(channels);
  return {
    integrated: integrated(blocks), laptop: integrated(lap),
    momentaryMax: Math.max(...blocks.map(lufs)), shortTermMax: st.length ? Math.max(...st) : -Infinity,
    shortTermMin: st.length ? Math.min(...st) : -Infinity, lra: loudnessRange(short),
    samplePeak: pk.sample, truePeak: pk.truePeak, momentary: blocks.map(lufs),
  };
}

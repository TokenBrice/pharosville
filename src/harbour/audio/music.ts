/**
 * Generative modal music (D-7): the harbour's third sound state (off → ambience → ambience + music), off by
 * default even when the ambience is on, and loaded as its own lazy chunk only when the visitor picks it.
 *
 * DECORATIVE ONLY. The piece is seeded by the world's day (the visitor's calendar date), never by market data;
 * its mode follows the light (Dorian on D by day, Phrygian on D at night). The weather may only MUTE it: from a
 * WARNING storm up, or in rain, the music stops, because the scene already says so.
 *
 * Three voices, all quiet: a plucked lyre (Karplus-Strong, rendered once per base pitch and transposed by a
 * couple of semitones), a breathy aulos (a live double pipe: a reed line over a held drone, with breath), and
 * now and then a soft frame drum on a phrase's downbeat. A phrase every 20–60 s, the rest silence (≥ 60 %).
 * A day's piece is three motifs, varied (moved along the mode, turned back, cut short).
 */

import { makeRng, type Rng } from "./dsp";

export const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
export const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
/** D3: the lyre's lowest degree; the aulos plays an octave up. */
const ROOT = 50;

/** A seed from the visitor's calendar day (local Y-M-D): one piece per day. */
export function daySeed(d: Date): number {
  const s = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

/** Scale degree (any integer, 7 per octave) → MIDI note in the mode. */
export function degreeToMidi(deg: number, mode: readonly number[], root = ROOT): number {
  const o = Math.floor(deg / 7), k = deg - 7 * o;
  return root + 12 * o + mode[k];
}

export interface MusicEvent { t: number; dur: number; voice: "lyre" | "aulos" | "drone" | "drum"; midi: number; vel: number }
interface Motif { deg: number[]; len: number[] }

/** A motif: 4–7 notes, mostly stepwise, an occasional leap, ending on a stable degree (the root or the fifth). */
export function makeMotif(r: Rng): Motif {
  const n = 4 + Math.floor(r() * 4), deg: number[] = [], len: number[] = [];
  let d = r() < 0.5 ? 4 : 2;
  for (let i = 0; i < n - 1; i++) {
    deg.push(d);
    len.push([1, 1, 0.5, 1.5, 2][Math.floor(r() * 5)]);
    const step = r() < 0.75 ? (r() < 0.5 ? -1 : 1) : (r() < 0.5 ? -2 : 3);
    d = Math.max(0, Math.min(9, d + step));
  }
  deg.push(r() < 0.6 ? 0 : 4); len.push(2);
  return { deg, len };
}

/** Sounding time of a phrase's events (their union), and its span (first start → last end). */
export function sounding(ev: readonly MusicEvent[]): { busy: number; span: number } {
  const iv = ev.map((e) => [e.t, e.t + e.dur] as const).sort((a, b) => a[0] - b[0]);
  let busy = 0, a = -Infinity, b = -Infinity;
  for (const [s, e] of iv) {
    if (s > b) { if (b > a) busy += b - a; a = s; b = e; } else b = Math.max(b, e);
  }
  if (b > a) busy += b - a;
  return { busy, span: iv.length ? Math.max(...iv.map((x) => x[1])) - iv[0][0] : 0 };
}

/** One phrase from the day's motifs: lyre (most often), the aulos alone, or both over a drone; a rare drum. */
export function composePhrase(r: Rng, motifs: readonly Motif[], night: boolean): MusicEvent[] {
  const mode = night ? PHRYGIAN : DORIAN;
  const m = motifs[Math.floor(r() * motifs.length)];
  // a variation: moved along the mode, sometimes turned back or cut short (still ending on its own last note)
  const shift = [0, 0, 2, -3, 4][Math.floor(r() * 5)];
  let deg = m.deg.map((d) => d + shift), len = m.len.slice();
  if (r() < 0.25) { deg = [...deg.slice(0, -1).reverse(), deg[deg.length - 1]]; len = [...len.slice(0, -1).reverse(), len[len.length - 1]]; }
  if (r() < 0.25 && deg.length > 4) { deg = deg.slice(-4); len = len.slice(-4); }
  const kind = r(), ev: MusicEvent[] = [];
  const lyre = kind < 0.55 || kind >= 0.8, aulos = kind >= 0.55;
  if (lyre) {
    const beat = 0.5 + r() * 0.2;
    let t = 0;
    deg.forEach((d, i) => {
      ev.push({ t, dur: 2.2, voice: "lyre", midi: degreeToMidi(d, mode), vel: 0.6 + 0.3 * r() * (i === 0 ? 1.2 : 1) });
      t += len[i] * beat;
    });
    if (aulos) ev.push({ t: 0, dur: t + 1.2, voice: "drone", midi: degreeToMidi(r() < 0.5 ? 7 : 4, mode), vel: 0.5 });
  } else {
    const beat = 1.1 + r() * 0.4;
    let t = 0;
    deg.forEach((d, i) => {
      const dur = len[i] * beat;
      ev.push({ t, dur, voice: "aulos", midi: degreeToMidi(d + 7, mode), vel: 0.7 + 0.2 * r() });
      t += dur;
    });
  }
  // the frame drum, rarely, on the downbeat (and once more halfway)
  if (r() < 0.2) {
    ev.push({ t: 0, dur: 0.7, voice: "drum", midi: 0, vel: 0.6 + 0.2 * r() });
    if (r() < 0.5) ev.push({ t: 2 * (0.6 + 0.6 * r()), dur: 0.7, voice: "drum", midi: 0, vel: 0.4 });
  }
  return ev;
}

/** Silence after a phrase: 20–60 s, never less than 1.5× the phrase (≥ 60 % of the time is silence). */
export function phraseGap(r: Rng, span: number): number {
  return Math.max(20 + 40 * r(), 1.5 * span);
}

/** Muting by the weather the scene already shows: none in fair weather, full from a WARNING storm and in rain. */
export function musicMute(storm: number, rain: number): number {
  const s = Math.max(0, Math.min(1, (storm - 0.6) / 0.15)), w = Math.max(0, Math.min(1, rain * 8));
  return (1 - s * s * (3 - 2 * s)) * (1 - w);
}

/**
 * A plucked gut string (Karplus-Strong): a soft noise burst in a tuned delay loop (a two-point average for the
 * string's loss of brightness, a first-order allpass for the fractional delay), T60 ≈ 2 s at any pitch.
 * Mono, starts and ends at silence, peak 0.5.
 */
export function lyreString(midi: number, sr: number, seed: number): Float32Array {
  const r = makeRng(seed), f = 440 * Math.pow(2, (midi - 69) / 12);
  const T = 2.6, n = Math.ceil(T * sr), out = new Float32Array(n);
  const P = sr / f, N = Math.max(2, Math.floor(P - 0.6)), d = P - 0.5 - N, C = (1 - d) / (1 + d);
  const loop = new Float32Array(N), g = Math.pow(10, -3 / (2.0 * f));
  // the pluck: noise, softened (a finger, not a plectrum), with the pluck point's comb
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += 0.45 * (r() * 2 - 1 - lp); loop[i] = lp; }
  const pk = Math.max(1, Math.floor(N * 0.18));
  for (let i = N - 1; i >= pk; i--) loop[i] -= loop[i - pk];
  let idx = 0, prev = 0, apIn = 0, apOut = 0, mean = 0;
  for (let i = 0; i < N; i++) mean += loop[i] / N;
  for (let i = 0; i < N; i++) loop[i] -= mean;
  for (let i = 0; i < n; i++) {
    const x = loop[idx];
    out[i] = x;
    const avg = 0.5 * (x + prev); prev = x;
    const ap = C * avg + apIn - C * apOut; apIn = avg; apOut = ap;
    loop[idx] = ap * g;
    if (++idx === N) idx = 0;
  }
  return seal(out, sr, 0.002, 0.25, 0.5);
}

/** A frame drum struck softly with the hand: a low falling tone, a skin slap, a short ring. Mono, peak 0.5. */
export function frameDrum(sr: number, seed: number): Float32Array {
  const r = makeRng(seed), T = 0.7, n = Math.ceil(T * sr), out = new Float32Array(n);
  let ph = 0, ph2 = 0, lp = 0;
  const f0 = 68 + 10 * r();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * f0 * (1 + 0.35 * Math.exp(-t / 0.04))) / sr;
    ph2 += (2 * Math.PI * f0 * 2.6) / sr;
    lp += 0.25 * (r() * 2 - 1 - lp);
    out[i] = Math.sin(ph) * Math.exp(-t / 0.22) + 0.15 * Math.sin(ph2) * Math.exp(-t / 0.09) + lp * 0.5 * Math.exp(-t / 0.012);
  }
  return seal(out, sr, 0.001, 0.1, 0.5);
}

/** Fade both ends to exact zero, remove any DC, scale to `peak`. */
function seal(x: Float32Array, sr: number, a: number, b: number, peak: number): Float32Array {
  const n = x.length, na = Math.max(1, Math.floor(a * sr)), nb = Math.max(1, Math.floor(b * sr));
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i] / n;
  for (let i = 0; i < n; i++) x[i] -= mean;
  for (let i = 0; i < na; i++) x[i] *= i / na;
  for (let i = 0; i < nb; i++) x[n - 1 - i] *= i / nb;
  let p = 0;
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(x[i]));
  if (p > 0) for (let i = 0; i < n; i++) x[i] *= peak / p;
  return x;
}

export interface MusicInputs { night: number; storm: number; rain: number; attention: number }

/** The music's bus gain: a lyre note's peak (0.5) lands near −28 dBFS after the master, well under the sea. */
export const MUSIC_GAIN = 0.1;
const SR = 16000;
/** the lyre is rendered at these pitches and transposed at most ±2 semitones */
const BASES = [50, 55, 60, 65, 70, 75];

export class Music {
  private readonly bus: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly rnd: Rng;
  private readonly motifs: Motif[];
  private readonly strings = new Map<number, AudioBuffer>();
  private drum: AudioBuffer | null = null;
  private noise: AudioBuffer | null = null;
  private readonly inputs: MusicInputs = { night: 0, storm: 0, rain: 0, attention: 1 };
  private next: number;
  private timer = 0;
  private disposed = false;

  constructor(private readonly ac: BaseAudioContext, dest: AudioNode, seed: number) {
    this.rnd = makeRng(seed);
    const pr = makeRng(seed ^ 0x9e3779b9);
    this.motifs = [makeMotif(pr), makeMotif(pr), makeMotif(pr)];
    this.bus = ac.createGain();
    this.bus.gain.setValueAtTime(0, ac.currentTime);
    this.bus.gain.linearRampToValueAtTime(MUSIC_GAIN, ac.currentTime + 4);
    this.tone = ac.createBiquadFilter(); this.tone.type = "lowpass"; this.tone.frequency.value = 3200; this.tone.Q.value = 0.5;
    this.tone.connect(this.bus).connect(dest);
    // the first phrase comes after a breath of silence, not on the click
    this.next = ac.currentTime + 6 + this.rnd() * 6;
    this.timer = window.setInterval(() => this.step(), 250);
  }

  set(i: Partial<MusicInputs>): void { Object.assign(this.inputs, i); }

  private string(midi: number): { buf: AudioBuffer; rate: number } {
    const base = BASES.reduce((b, x) => (Math.abs(midi - x) < Math.abs(midi - b) ? x : b), BASES[0]);
    let buf = this.strings.get(base);
    if (!buf) {
      const d = lyreString(base, SR, base * 7919);
      buf = this.ac.createBuffer(1, d.length, SR); buf.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
      this.strings.set(base, buf);
    }
    return { buf, rate: Math.pow(2, (midi - base) / 12) };
  }

  private step(): void {
    if (this.disposed) return;
    const now = this.ac.currentTime, I = this.inputs;
    const mute = musicMute(I.storm, I.rain);
    this.bus.gain.setTargetAtTime(MUSIC_GAIN * mute, now, 1.5);
    if (this.next > now + 0.4) return;
    const r = this.rnd, thin = 0.7 + 0.3 * Math.max(0, Math.min(1, I.attention));
    if (mute < 0.2) { this.next = now + 10; return; }
    const ev = composePhrase(r, this.motifs, I.night > 0.5);
    const at = Math.max(this.next, now + 0.1);
    for (const e of ev) this.voice(e, at);
    this.next = at + sounding(ev).span + phraseGap(r, sounding(ev).span) / thin;
  }

  private voice(e: MusicEvent, at: number): void {
    const ac = this.ac, t = at + e.t;
    if (e.voice === "lyre") {
      const { buf, rate } = this.string(e.midi);
      const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
      const g = ac.createGain(); g.gain.value = e.vel;
      s.connect(g).connect(this.tone); s.start(t);
    } else if (e.voice === "drum") {
      this.drum ??= this.buffer(frameDrum(SR, 77));
      const s = ac.createBufferSource(); s.buffer = this.drum;
      const g = ac.createGain(); g.gain.value = e.vel * 0.8;
      s.connect(g).connect(this.tone); s.start(t);
    } else this.pipe(e, t);
  }

  /** One pipe of the aulos: a reed tone (a sawtooth, darkened) with breath and a slow vibrato, swelled in and out. */
  private pipe(e: MusicEvent, t: number): void {
    const ac = this.ac, f = 440 * Math.pow(2, (e.midi - 69) / 12), end = t + e.dur;
    const peak = (e.voice === "drone" ? 0.1 : 0.17) * e.vel;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + Math.min(0.35, e.dur * 0.3));
    env.gain.setValueAtTime(peak, Math.max(t + 0.35, end - 0.4));
    env.gain.linearRampToValueAtTime(0, end);
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(1800, f * 4); lp.Q.value = 0.7;
    const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    const vib = ac.createOscillator(); vib.frequency.value = 4.6 + this.rnd(); const vd = ac.createGain(); vd.gain.value = 7;
    vib.connect(vd).connect(o.detune);
    o.connect(lp).connect(env).connect(this.tone);
    // breath in the reed
    this.noise ??= this.buffer(Float32Array.from({ length: SR * 2 }, () => this.rnd() * 2 - 1));
    const n = ac.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(3000, f * 3); bp.Q.value = 1.2;
    const ng = ac.createGain(); ng.gain.value = 0.18;
    n.connect(bp).connect(ng).connect(env);
    for (const s of [o, vib, n]) { s.start(t); s.stop(end + 0.05); }
  }

  private buffer(d: Float32Array): AudioBuffer {
    const b = this.ac.createBuffer(1, d.length, SR); b.copyToChannel(d as Float32Array<ArrayBuffer>, 0); return b;
  }

  /** Fade out, then release. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    const now = this.ac.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + 0.8);
    await new Promise((r) => setTimeout(r, 900));
    this.bus.disconnect();
  }
}

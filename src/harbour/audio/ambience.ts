/**
 * The harbour's OPT-IN ambient sound (D13, refined D23): off by default, started only from the visitor's
 * own toggle. Everything is synthesised (no samples to download): the one-shots (waves, laps, reef breaks,
 * crackle, press strokes) by the pure DSP in dsp.ts into a slowly renewed clip bank; the continuous beds and
 * the small calls with native WebAudio nodes. Layers:
 *
 *   - the sea: a swell clock (6–9.5 s periods, i.e. 0.1–0.17 Hz, in sets) drives shore washes on shingle and
 *     stone (break, run-up, backwash rattle), a far sea bed that breathes with it, and laps against hulls and
 *     piles that cluster after each swell; the Shoals reef roars far off, panned to where it lies;
 *   - wind, scaled by the weather (DEWS), in gusts, with a whistle only in a blow;
 *   - gulls (fewer at night), rigging creaks and halyard taps near the harbour, a bell buoy rocked by the swell;
 *   - the Pharos fire's roar and crackle when the camera is near it; the Mint's presses, faintly, near the Mint;
 *   - the foghorn, ONLY while the data is stale, never otherwise.
 *
 * Distance works as in the open air: farther sources are quieter AND darker (lowpassed), and their pan
 * follows where they lie on screen. The master stays well below full scale; start and stop are slow ramps.
 *
 * Pure WebAudio + a small inputs record; no three.js and no engine imports, so the module stays lazy.
 */

import { ClipBank } from "./bank";
import { makeRng, type ClipKind } from "./dsp";

export interface AmbienceInputs {
  /** 0 = closest zoom … 1 = farthest */
  zoom: number;
  /** wind 0..1 (DEWS) */
  wind: number;
  /** stale-data fog 0..1 */
  fog: number;
  /** 0 day … 1 night */
  night: number;
  /** nearness 0..1 of the beaches / rocky shore, and the pan of the nearest stretch */
  shore: number;
  shorePan: number;
  /** nearness 0..1 of the piers and moored hulls */
  harbour: number;
  /** nearness 0..1 of the Shoals reef, and its pan -1..1 */
  reef: number;
  reefPan: number;
  /** nearness 0..1 of the Pharos fire, and its pan */
  fire: number;
  firePan: number;
  /** nearness 0..1 of the Mint (0 when there is none), its pan, and its activity 0..1 */
  mint: number;
  mintPan: number;
  mintRate: number;
}

export interface AmbienceOptions {
  /** no timers: the caller drives step() (offline rendering) and the bank is built at once */
  manual?: boolean;
  seed?: number;
}

const MASTER = 0.7;
const TICK_MS = 120;

/** A stereo noise buffer with independent channels (width without phasiness) and a crossfaded seam. */
function noiseBuffer(ac: BaseAudioContext, seconds: number, color: "white" | "pink", rnd: () => number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd() * 2 - 1;
      if (color === "white") d[i] = w * 0.5;
      else {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      }
    }
    // equal-power crossfade of the loop seam (uncorrelated noise: cos/sin keeps the level)
    const f = Math.min(ac.sampleRate >> 1, n >> 3);
    for (let i = 0; i < f; i++) {
      const a = (i / f) * Math.PI * 0.5;
      d[n - f + i] = d[n - f + i] * Math.cos(a) + d[i] * Math.sin(a);
    }
    buf.copyToChannel(d, ch);
  }
  return buf;
}

/** A noise loop that only runs while it can be heard: started on demand, stopped once its bus has faded. */
class LazyLoop {
  private src: AudioBufferSourceNode | null = null;
  private idle = 0;
  constructor(private readonly ac: BaseAudioContext, private readonly buf: AudioBuffer, private readonly to: AudioNode) {}
  update(on: boolean, off: boolean, now: number, rnd: () => number): void {
    if (on && !this.src) {
      const s = this.src = this.ac.createBufferSource();
      s.buffer = this.buf; s.loop = true;
      s.connect(this.to); s.start(now, rnd() * this.buf.duration);
    }
    if (off && this.src) {
      if (!this.idle) this.idle = now + 4;
      else if (now > this.idle) this.stop();
    } else this.idle = 0;
  }
  stop(): void {
    if (!this.src) return;
    try { this.src.stop(); } catch { /* already stopped */ }
    this.src.disconnect(); this.src = null; this.idle = 0;
  }
}

export class Ambience {
  private readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly inputs: AmbienceInputs = {
    zoom: 0.5, wind: 0.35, fog: 0, night: 0, shore: 0.5, shorePan: 0, harbour: 0.5, reef: 0.2, reefPan: -0.5,
    fire: 0, firePan: 0, mint: 0, mintPan: 0, mintRate: 0.5,
  };
  private readonly rnd: () => number;
  private readonly bank: ClipBank;
  private readonly white: AudioBuffer;
  // the sea
  private readonly shoreBus: GainNode;
  private readonly shoreLp: BiquadFilterNode;
  private readonly bedGain: GainNode;
  private readonly bedSwell: GainNode;
  private readonly bedLp: BiquadFilterNode;
  private readonly lapBus: GainNode;
  private readonly lapLp: BiquadFilterNode;
  private readonly reefBus: GainNode;
  private readonly reefLp: BiquadFilterNode;
  private readonly reefPan: StereoPannerNode;
  // weather
  private readonly windGain: GainNode;
  private readonly windGust: GainNode;
  private readonly windLo: GainNode;
  private readonly windHi: GainNode;
  private readonly windLow: GainNode;
  private readonly whistle: GainNode;
  private readonly whistleLoop: LazyLoop;
  // civic
  private readonly fireBus: GainNode;
  private readonly firePan: StereoPannerNode;
  private readonly mintBus: GainNode;
  private readonly mintLp: BiquadFilterNode;
  private readonly mintPan: StereoPannerNode;
  // event buses
  private readonly harbourBus: GainNode;    // creaks, taps (near)
  private readonly gullBus: GainNode;
  private readonly bellBus: GainNode;
  private readonly hornBus: GainNode;
  private readonly echo: DelayNode;
  private timer = 0;
  private idle = 0;
  private next = { wave: 0, lap: 0, reef: 0, gull: 0, creak: 0, tap: 0, horn: 0, gust: 0, crackle: 0, press: 0, refresh: 0 };
  private setLeft = 0;
  private pressN = 0;
  private disposed = false;
  private readonly lanes = new Map<AudioNode, StereoPannerNode[]>();
  private readonly aims = new Map<AudioParam, number>();

  constructor(readonly ac: BaseAudioContext, opts: AmbienceOptions = {}) {
    this.rnd = makeRng(opts.seed ?? Math.floor(Math.random() * 2 ** 31));
    this.bank = new ClipBank(ac, Math.floor(this.rnd() * 2 ** 31));
    const now = ac.currentTime;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.03; comp.release.value = 0.5;
    this.out = ac.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(MASTER, now + 3);     // a slow fade in, never a jolt
    this.out.connect(comp).connect(ac.destination);

    // a short, damp slap-back echo for the distant events (bell, horn, gulls): the harbour walls
    this.echo = ac.createDelay(1);
    this.echo.delayTime.value = 0.31;
    const fb = ac.createGain(); fb.gain.value = 0.26;
    const damp = ac.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 1700;
    this.echo.connect(damp).connect(fb).connect(this.echo);
    const echoOut = ac.createGain(); echoOut.gain.value = 0.45;
    damp.connect(echoOut).connect(this.out);

    this.white = noiseBuffer(ac, 8.7, "white", this.rnd);
    const pink = noiseBuffer(ac, 9.3, "pink", this.rnd);

    // ---- the shore: wave clips → distance lowpass → bus
    this.shoreBus = ac.createGain(); this.shoreBus.gain.value = 0;
    this.shoreLp = this.filter("lowpass", 6000, 0.5);
    this.shoreLp.connect(this.shoreBus).connect(this.out);

    // ---- the sea bed: every far wave along the coast merged, breathing with the swell
    this.bedGain = ac.createGain(); this.bedGain.gain.value = 0;
    this.bedSwell = ac.createGain(); this.bedSwell.gain.value = 0.6;
    this.bedLp = this.filter("lowpass", 800, 0.5);
    const bedHp = this.filter("highpass", 45, 0.6);
    this.loop(pink, this.bedLp);
    this.bedLp.connect(bedHp).connect(this.bedSwell).connect(this.bedGain).connect(this.out);

    // ---- laps against hulls and piles
    this.lapBus = ac.createGain(); this.lapBus.gain.value = 0;
    this.lapLp = this.filter("lowpass", 5000, 0.5);
    this.lapLp.connect(this.lapBus).connect(this.out);

    // ---- the reef: far, dark, placed
    this.reefBus = ac.createGain(); this.reefBus.gain.value = 0;
    this.reefLp = this.filter("lowpass", 900, 0.5);
    this.reefPan = ac.createStereoPanner();
    this.reefLp.connect(this.reefPan).connect(this.reefBus).connect(this.out);

    // ---- wind: noise in gusts whose colour wanders between a low and a high band (a crossfade of two FIXED
    // filters: automating a filter's cutoff costs a coefficient update per sample), a low buffeting, and a
    // whistle only in a blow
    this.windGain = ac.createGain(); this.windGain.gain.value = 0;
    this.windGust = ac.createGain(); this.windGust.gain.value = 0.6;
    const windLoBp = this.filter("bandpass", 360, 0.7), windHiBp = this.filter("bandpass", 1050, 0.8);
    this.windLo = ac.createGain(); this.windLo.gain.value = 0.7;
    this.windHi = ac.createGain(); this.windHi.gain.value = 0.3;
    this.loop(this.white, windLoBp); this.loop(this.white, windHiBp);
    windLoBp.connect(this.windLo).connect(this.windGust);
    windHiBp.connect(this.windHi).connect(this.windGust);
    this.windGust.connect(this.windGain).connect(this.out);
    this.windLow = ac.createGain(); this.windLow.gain.value = 0;
    const windLp = this.filter("lowpass", 140, 0.6);
    this.loop(pink, windLp);
    windLp.connect(this.windLow).connect(this.windGust);
    this.whistle = ac.createGain(); this.whistle.gain.value = 0;
    const whistleBp = this.filter("bandpass", 1350, 16);
    this.whistleLoop = new LazyLoop(ac, this.white, whistleBp);
    whistleBp.connect(this.whistle).connect(this.windGust);

    // ---- the Pharos fire: overlapped clips of flickering roar and crackle
    this.fireBus = ac.createGain(); this.fireBus.gain.value = 0;
    this.firePan = ac.createStereoPanner();
    this.firePan.connect(this.fireBus).connect(this.out);

    // ---- the Mint's presses
    this.mintBus = ac.createGain(); this.mintBus.gain.value = 0;
    this.mintLp = this.filter("lowpass", 2500, 0.6);
    this.mintPan = ac.createStereoPanner();
    this.mintLp.connect(this.mintPan).connect(this.mintBus).connect(this.out);

    this.harbourBus = ac.createGain(); this.harbourBus.gain.value = 0; this.harbourBus.connect(this.out);
    this.gullBus = ac.createGain(); this.gullBus.gain.value = 0; this.gullBus.connect(this.out); this.gullBus.connect(this.echo);
    this.bellBus = ac.createGain(); this.bellBus.gain.value = 0.11; this.bellBus.connect(this.out); this.bellBus.connect(this.echo);
    this.hornBus = ac.createGain(); this.hornBus.gain.value = 0.26; this.hornBus.connect(this.out); this.hornBus.connect(this.echo);

    const t = now + 0.3;
    this.next = {
      wave: t + 0.2, lap: t + 0.6, reef: t + 1.5, gull: t + 3 + this.rnd() * 4, creak: t + 3, tap: t + 1.5, horn: t + 3, gust: t,
      crackle: t, press: t + 0.5, refresh: t + 20,
    };
    if (opts.manual) this.bank.buildAll();
    else {
      this.pump();
      this.timer = window.setInterval(() => this.step(), TICK_MS);
    }
  }

  /** Synthesise the bank in idle slices, a few ms at a time, never a long task. */
  private pump = (): void => {
    if (this.disposed) return;
    const ric = (globalThis as { requestIdleCallback?: (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const go = (budget: number) => { if (this.bank.work(budget)) this.idle = window.setTimeout(this.pump, 0); };
    if (ric) ric((d) => go(Math.max(2, Math.min(6, d.timeRemaining()))), { timeout: 250 });
    else this.idle = window.setTimeout(() => go(4), 16);
  };

  private filter(type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
    const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }

  private loop(buf: AudioBuffer, to: AudioNode): void {
    const s = this.ac.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(to);
    s.start(this.ac.currentTime, this.rnd() * buf.duration);
    this.sources.push(s);
  }

  /** Play a bank clip into `to` (a one-shot; it ends at exact silence, so no click). */
  private play(kind: ClipKind, at: number, to: AudioNode, level: number, pan = 0, rate = 1): void {
    const buf = this.bank.pick(kind, this.rnd);
    if (!buf) return;      // still being synthesised: the beds carry the scene meanwhile
    const s = this.ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ac.createGain(); g.gain.value = level;
    s.connect(g).connect(this.lane(to, pan));
    s.start(at);
  }

  /** Five fixed pan lanes per destination: a placed one-shot costs two nodes, not three. */
  private lane(to: AudioNode, pan: number): AudioNode {
    let ls = this.lanes.get(to);
    if (!ls) {
      ls = [-0.8, -0.4, 0, 0.4, 0.8].map((v) => { const p = this.pan(v); p.connect(to); return p; });
      this.lanes.set(to, ls);
    }
    return ls[Math.max(0, Math.min(4, Math.round((pan + 0.8) / 0.4)))];
  }

  /** Steer a level only when its target moved: an idle param stays cheap (no automation to evaluate). */
  private aim(p: AudioParam, v: number, tc: number): void {
    const was = this.aims.get(p);
    if (was !== undefined && Math.abs(v - was) <= Math.abs(was) * 0.01 + 1e-4) return;
    this.aims.set(p, v);
    p.setTargetAtTime(v, this.ac.currentTime, tc);
  }

  set(i: Partial<AmbienceInputs>): void { Object.assign(this.inputs, i); }

  /** Scheduler: levels follow the inputs; events are queued a little ahead of the audio clock. */
  step(): void {
    if (this.disposed) return;
    const ac = this.ac, now = ac.currentTime, ahead = now + 0.3, r = this.rnd;
    const I = this.inputs, { zoom, wind, fog, night } = I;
    const near = Math.max(0, Math.min(1, 1 - zoom));
    const tc = 0.8;
    const air = (d: number, lo: number, hi: number) => lo * Math.pow(hi / lo, Math.max(0, Math.min(1, d)));

    // ---- levels: nearer is louder AND brighter
    this.aim(this.shoreBus.gain, 0.5 * (0.3 + 0.7 * I.shore) * (1 - 0.3 * zoom), tc);
    this.aim(this.shoreLp.frequency, air(I.shore * (1 - 0.4 * zoom), 900, 14000), tc);
    this.aim(this.bedGain.gain, (0.16 + 0.16 * zoom + 0.05 * wind) * (1 - 0.5 * I.shore * near), tc);   // a near wave masks the far sea
    this.aim(this.bedLp.frequency, air(1 - zoom, 420, 900), tc);
    this.aim(this.lapBus.gain, 0.06 + 1.1 * I.harbour * I.harbour, tc);
    this.aim(this.lapLp.frequency, air(I.harbour, 1200, 12000), tc);
    this.aim(this.reefBus.gain, (0.12 + 0.55 * I.reef) * (0.7 + 0.5 * wind), tc);
    this.aim(this.reefLp.frequency, air(I.reef, 380, 2600), tc);
    this.aim(this.reefPan.pan, I.reefPan * 0.8, tc);
    this.aim(this.windGain.gain, (0.05 + 0.42 * wind * wind) * (0.7 + 0.3 * zoom), tc);
    this.aim(this.windLow.gain, 1.1 * wind * wind, tc);
    this.whistleLoop.update(wind > 0.56, wind < 0.55, now, r);
    this.aim(this.harbourBus.gain, 0.08 + 1.1 * I.harbour * I.harbour, tc);
    this.aim(this.gullBus.gain, (0.12 + 0.3 * near) * (1 - 0.8 * night) * (1 - 0.5 * fog), tc);
    this.aim(this.fireBus.gain, 0.5 * I.fire * I.fire, 0.5);
    this.aim(this.firePan.pan, I.firePan * 0.8, 0.5);
    this.aim(this.mintBus.gain, 0.16 * I.mint * I.mint, 0.5);
    this.aim(this.mintLp.frequency, air(I.mint, 700, 6000), 0.5);
    this.aim(this.mintPan.pan, I.mintPan * 0.8, 0.5);

    const N = this.next;
    // ---- the swell: one wave per period, in sets; the shore, the bed, the laps and the bell answer it
    if (N.wave < ahead) {
      const at = Math.max(N.wave, now);
      if (this.setLeft <= 0 && r() < 0.18) this.setLeft = 3;
      const big = this.setLeft > 0 ? 1.25 : 1;
      this.setLeft--;
      const size = (0.55 + 0.45 * r()) * big * (0.85 + 0.3 * wind);
      // the main wash, and often a second one further along the beach
      // (the nearest stretch of beach pulls the main wash to its side of the screen)
      const lean = I.shorePan * 0.6 * I.shore;
      this.play("shore", at, this.shoreLp, 0.9 * size, lean + (r() - 0.5) * (1.2 - 0.6 * I.shore), 0.94 + r() * 0.1);
      if (r() < 0.6) this.play("shore", at + 0.8 + r() * 2.4, this.shoreLp, 0.45 * size * (0.6 + 0.4 * r()), r() * 1.6 - 0.8, 0.9 + r() * 0.12);
      // the far bed swells a little ahead of the beach and ebbs after it
      const g = this.bedSwell.gain;
      g.setTargetAtTime(0.65 + 0.55 * size, at, 0.9);
      g.setTargetAtTime(0.45, at + 2.2, 2.2);
      // a cluster of laps as the swell runs through the moorings
      const laps = 2 + Math.floor(r() * 3);
      for (let k = 0; k < laps; k++) this.play("lap", at + 0.9 + k * (0.22 + r() * 0.5), this.lapLp, (0.5 + 0.5 * r()) * size, r() * 1.6 - 0.8, 0.85 + r() * 0.3);
      // the bell buoy rolls with the same swell
      if (r() < 0.3) {
        this.play("bell", at + 1 + r(), this.bellBus, 1, -0.4, 0.99 + r() * 0.02);
        if (r() < 0.35) this.play("bell", at + 2.2 + r() * 0.6, this.bellBus, 0.55, -0.4, 0.99 + r() * 0.02);
      }
      N.wave = at + (6 + r() * 3.5) * (1 - 0.18 * wind);
    }
    // stray laps between the swells
    if (N.lap < ahead) {
      const at = Math.max(N.lap, now);
      this.play("lap", at, this.lapLp, 0.25 + 0.4 * r(), r() * 1.8 - 0.9, 0.8 + r() * 0.4);
      N.lap = at + 0.7 + r() * (2.6 - wind * 1.2);
    }
    if (N.reef < ahead) {
      const at = Math.max(N.reef, now);
      this.play("reef", at, this.reefLp, 0.6 + 0.4 * r(), r() * 0.6 - 0.3, 0.9 + r() * 0.15);
      N.reef = at + 6.5 + r() * 5;
    }
    // gusts: the wind band wanders and swells
    if (N.gust < ahead) {
      const at = Math.max(N.gust, now), d = 1.2 + r() * 2.8;
      const hi = Math.min(1, r() * (0.5 + wind * 0.7));
      this.windLo.gain.setTargetAtTime(1 - hi * 0.7, at, d * 0.4);
      this.windHi.gain.setTargetAtTime(hi, at, d * 0.4);
      this.windGust.gain.setTargetAtTime(0.35 + r() * (0.5 + wind * 0.6), at, d * 0.35);
      // the whistle sings in some gusts of a blow, never as a steady tone
      this.whistle.gain.setTargetAtTime(wind > 0.55 && r() < 0.55 ? (wind - 0.55) * (0.3 + 0.5 * r()) : 0, at, d * 0.3);
      N.gust = at + d;
    }
    // the Pharos fire, only running when it can be heard
    if (I.fire > 0.03) {
      if (N.crackle < ahead) {
        const at = Math.max(N.crackle, now);
        this.play("crackle", at, this.firePan, 0.5, r() * 0.3 - 0.15);
        N.crackle = at + 3.45 + r() * 0.1;     // 4 s clips, half-second fades: a seamless overlap
      }
    } else N.crackle = Math.max(N.crackle, now);
    // the Mint: three presses in a steady rhythm that quickens with the minting
    if (I.mint > 0.03) {
      if (N.press < ahead) {
        const at = Math.max(N.press, now);
        this.play("press", at, this.mintLp, 0.5 + 0.2 * r(), (this.pressN % 3 - 1) * 0.25, 0.92 + (this.pressN % 3) * 0.07);
        this.pressN++;
        N.press = at + (this.pressN % 3 === 0 ? 1.1 : 0.62) / (0.6 + 0.8 * I.mintRate);
      }
    } else N.press = Math.max(N.press, now);
    if (N.gull < ahead) {
      const at = Math.max(N.gull, now);
      if (r() < 1 - 0.75 * night) this.play("gull", at, this.gullBus, 0.5 + 0.35 * r(), r() * 1.2 - 0.6, 0.92 + r() * 0.16);
      N.gull = at + 4 + r() * 10 + night * 10;
    }
    if (N.creak < ahead) {
      const at = Math.max(N.creak, now);
      this.play("creak", at, this.harbourBus, 0.7 + 0.5 * r(), r() * 1.2 - 0.6, 0.85 + r() * 0.3);
      N.creak = at + 2.5 + r() * 6 - wind * 1.5;
    }
    if (N.tap < ahead) {
      const at = Math.max(N.tap, now);
      this.play("halyard", at, this.harbourBus, 0.6 + 0.6 * r() * (0.5 + wind), r() * 1.4 - 0.7, 0.9 + r() * 0.2);
      N.tap = at + 1.2 + r() * (5 - wind * 3.5);
    }
    // the foghorn: stale data only
    if (fog > 0.5 && N.horn < ahead) {
      const at = Math.max(N.horn, now);
      this.horn(at);
      N.horn = at + 26 + r() * 6;
    } else if (fog <= 0.5) N.horn = Math.max(N.horn, now + 2);
    // keep the bank renewing (no wave heard twice the same)
    if (N.refresh < now) {
      const busy = this.bank.pending;
      this.bank.refresh();
      if (!this.timer) this.bank.buildAll();
      else if (!busy) this.pump();
      N.refresh = now + 20;
    }
  }

  private env(at: number, attack: number, hold: number, release: number, peak: number): GainNode {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    g.gain.linearRampToValueAtTime(0, at + attack + hold + release + 0.02);
    return g;
  }

  private pan(v: number): StereoPannerNode {
    const p = this.ac.createStereoPanner(); p.pan.value = v; return p;
  }

  /** The foghorn (diaphone): a low two-tone blast that drops in pitch at its end. Stale data only. */
  private horn(at: number): void {
    const ac = this.ac;
    const dur = 2.6;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.8;
    const g = this.env(at, 0.45, dur - 0.45, 1.4, 0.8);
    lp.connect(g).connect(this.pan(-0.5)).connect(this.hornBus);
    for (const [f, a] of [[98, 0.6], [147, 0.35], [196, 0.12]] as const) {
      const o = ac.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f, at);
      o.frequency.setValueAtTime(f, at + dur - 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, at + dur + 0.6);
      const og = ac.createGain(); og.gain.value = a;
      o.connect(og).connect(lp);
      o.start(at); o.stop(at + dur + 1.5);
    }
  }

  /** Fade out, then release everything. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    clearTimeout(this.idle);
    const now = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.6);
    await new Promise((r) => setTimeout(r, 680));
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.whistleLoop.stop();
    this.out.disconnect();
    if ("close" in this.ac) await (this.ac as AudioContext).close().catch(() => undefined);
  }
}

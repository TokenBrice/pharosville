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
 *   - the foghorn, ONLY while the data is stale, never otherwise;
 *   - WEATHER, all of it data (the supply-weighted DEWS band, through the 'weather' service): rain hissing on
 *     the open sea and pattering on roofs and quays (louder near the town), eaves dripping while things are
 *     wet, snow hushing the whole scene (a high shelf over everything, softer gulls), heavier storm surf with
 *     spray, gusts, a moaning howl and the rigging's whistle in a blow, and thunder after each flash,
 *     delayed by the distance of the strike (a tearing crack and roll when near, a low rumble when far);
 *   - SEASON colour (calendar, declared decorative like the time of day): songbirds in the trees in spring,
 *     crickets at dusk in summer, dry leaves rustling in the gusts of autumn, and the crisp hush of winter
 *     with a crunch of footsteps in the snow near the town.
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
  /** world hour 0..24 */
  hour: number;
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
  /** precipitation intensity 0..1, rain and snow (the TYPE follows the season, the INTENSITY the DEWS band) */
  rain: number;
  snow: number;
  /** wet surfaces 0..1: the eaves keep dripping after the rain */
  wet: number;
  /** storminess 0..1 from the DEWS band: calm 0, watch .25, alert .5, warning .75, danger 1 */
  storm: number;
  /** gustiness 0..1 */
  gust: number;
  /** calendar season weights (sum ≈ 1) and the snow lying on the land 0..1 */
  spring: number;
  summer: number;
  autumn: number;
  winter: number;
  snowCover: number;
  /** nearness 0..1 of the town's roofs and quays, of the trees, and of land at all; pans -1..1 */
  town: number;
  townPan: number;
  trees: number;
  treesPan: number;
  land: number;
  /** prefers-reduced-motion: no startling cracks (thunder only as a far, softer roll) */
  reduced: boolean;
  /** low quality tier (a weaker machine): skip the costlier storm layers (howl, spray, the second rain stream) */
  lean: boolean;
  /**
   * how far BEHIND the listener's look each placed source lies, 0 (ahead or beside) … 1 (straight behind):
   * a pseudo front/back cue, a darker sound from behind, without HRTF panners
   */
  shoreBack: number;
  reefBack: number;
  mintBack: number;
  townBack: number;
  /** the visitor's attention 1 … 0 after a few idle minutes (the ten-minute settle: quieter, sparser) */
  attention: number;
}

export interface AmbienceOptions {
  /** no timers: the caller drives step() (offline rendering) and the bank is built at once */
  manual?: boolean;
  seed?: number;
}

const MASTER = 0.7;
const TICK_MS = 120;
/** at most this many one-shot events sound at once (the continuous beds and the data kinds always play) */
const VOICES = 24;
/** kinds that are a bed (overlapped clips), the swell itself, or data: never dropped by the voice cap */
const ALWAYS = new Set<ClipKind>(["shore", "crackle", "drizzle", "rain", "cricket", "cicada", "thunder", "rumble"]);

/**
 * The ten-minute settle: after a while unwatched the whole mix eases down 3 dB, and it always breathes a
 * slow ±1.5 dB (two incommensurate swells, 2.5 and ~3.9 min) so the scene never sits stationary. In dB.
 */
export function settleDb(attention: number, t: number, phase = 0): number {
  const a = Math.max(0, Math.min(1, attention));
  const breath = 0.6 * Math.sin((2 * Math.PI * t) / 150 + phase) + 0.4 * Math.sin((2 * Math.PI * t) / 233 + 2.1 * phase + 1);
  return -3 * (1 - a) + 1.5 * breath;
}

/** Event-rate multiplier of the settle: 1 while watched … 0.7 (~30 % sparser) when settled. */
export const settleRate = (attention: number) => 0.7 + 0.3 * Math.max(0, Math.min(1, attention));

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

/** Identity to ±0.8, then a tanh knee that approaches (never reaches) ±0.98. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 2049, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.8 ? a : 0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
  }
  return c;
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

/** Cicadas sing on summer afternoons: 0..1 by summer weight, fading in 11–13h and out 17–19h (world hour). */
export function cicadaLevel(summer: number, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const up = Math.max(0, Math.min(1, (h - 11) / 2)), down = Math.max(0, Math.min(1, (19 - h) / 2));
  return Math.max(0, Math.min(1, summer)) * Math.min(up, down);
}

/** Birdsong thins while the cicadas play: 1 = untouched … 0.35 under a full chorus. */
export function birdThinning(cicada: number): number {
  return 1 - 0.65 * Math.max(0, Math.min(1, cicada));
}

export class Ambience {
  private readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly inputs: AmbienceInputs = {
    zoom: 0.5, wind: 0.35, fog: 0, night: 0, hour: 9, shore: 0.5, shorePan: 0, harbour: 0.5, reef: 0.2, reefPan: -0.5,
    fire: 0, firePan: 0, mint: 0, mintPan: 0, mintRate: 0.5,
    rain: 0, snow: 0, wet: 0, storm: 0, gust: 0.3, spring: 0, summer: 0, autumn: 0, winter: 0, snowCover: 0,
    town: 0.3, townPan: 0, trees: 0.2, treesPan: 0, land: 0.3, reduced: false, lean: false, attention: 1,
    shoreBack: 0, reefBack: 0, mintBack: 0, townBack: 0,
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
  private readonly highAir: GainNode;
  private readonly highAirLoop: LazyLoop;
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
  // weather
  private readonly hush: BiquadFilterNode;
  private readonly duck: GainNode;
  private readonly rainFine: GainNode;
  private readonly rainBody: GainNode;
  private readonly rainGust: GainNode;
  private readonly rainLoop: LazyLoop;
  private readonly patterBus: GainNode;
  private readonly patterLp: BiquadFilterNode;
  private readonly dripBus: GainNode;
  private readonly spray: GainNode;
  private readonly sprayBus: GainNode;
  private readonly sprayLoop: LazyLoop;
  private readonly howl: GainNode[];
  private readonly howlBus: GainNode;
  private readonly howlLoop: LazyLoop;
  private readonly thunderBus: GainNode;
  private thunders: number[] = [];
  // season
  private readonly birdBus: GainNode;
  private readonly cricketBus: GainNode;
  private readonly cicadaBus: GainNode;
  private readonly rustleBus: GainNode;
  private readonly rustleLp: BiquadFilterNode;
  private readonly crunchBus: GainNode;
  // the ten-minute settle (and the slow breathing of the whole mix), and the one-shots now sounding
  private readonly settle: GainNode;
  private readonly breathPhase: number;
  private voices: number[] = [];
  private timer = 0;
  private idle = 0;
  private next = {
    wave: 0, lap: 0, reef: 0, gull: 0, creak: 0, tap: 0, horn: 0, gust: 0, crackle: 0, press: 0, refresh: 0,
    rainA: 0, rainB: 0, drip: 0, bird: 0, cricket: 0, cicada: 0, crunch: 0,
  };
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
    // snow hushes the world: a high shelf over everything (snow on the ground and in the air soaks up the highs)
    this.hush = this.filter("highshelf", 2500, 0.7); this.hush.gain.value = 0;
    // a safety soft clip after the glue compressor (linear to 0.8, then a smooth knee that never reaches 1):
    // thunder over a storm surf can never clip, at the cost of a table lookup per sample
    const safety = ac.createWaveShaper();
    safety.curve = softClipCurve();
    this.settle = ac.createGain();
    this.breathPhase = this.rnd() * Math.PI * 2;
    this.out.connect(this.settle).connect(this.hush).connect(comp).connect(safety).connect(ac.destination);
    // the weather beds (wind, rain, spray, howl) pass through a duck that dips under a near thunderclap, so
    // the clap stands out of a downpour without pushing the mix toward full scale
    this.duck = ac.createGain(); this.duck.connect(this.out);

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
    this.windGust.connect(this.windGain).connect(this.duck);
    this.windLow = ac.createGain(); this.windLow.gain.value = 0;
    const windLp = this.filter("lowpass", 140, 0.6);
    this.loop(pink, windLp);
    windLp.connect(this.windLow).connect(this.windGust);
    this.whistle = ac.createGain(); this.whistle.gain.value = 0;
    const whistleBp = this.filter("bandpass", 1350, 16);
    this.whistleLoop = new LazyLoop(ac, this.white, whistleBp);
    whistleBp.connect(this.whistle).connect(this.windGust);
    // the high air of the overview: a thin, broad, very quiet wind that only the farthest zoom hears
    this.highAir = ac.createGain(); this.highAir.gain.value = 0;
    const airBp = this.filter("bandpass", 2500, 0.5);
    this.highAirLoop = new LazyLoop(ac, this.white, airBp);
    airBp.connect(this.highAir).connect(this.windGust);

    // ---- the Pharos fire: overlapped clips of flickering roar and crackle
    this.fireBus = ac.createGain(); this.fireBus.gain.value = 0;
    this.firePan = ac.createStereoPanner();
    this.firePan.connect(this.fireBus).connect(this.out);

    // ---- the Mint's presses
    this.mintBus = ac.createGain(); this.mintBus.gain.value = 0;
    this.mintLp = this.filter("lowpass", 2500, 0.6);
    this.mintPan = ac.createStereoPanner();
    this.mintLp.connect(this.mintPan).connect(this.mintBus).connect(this.out);

    // ---- rain: the fine hiss of drops on the open sea and a heavier body in a downpour, driven by the gusts;
    // the patter of drops on roofs and quays (clips), louder and brighter near the town; eaves dripping
    const rainIn = ac.createGain();
    this.rainFine = ac.createGain(); this.rainFine.gain.value = 0;
    this.rainBody = ac.createGain(); this.rainBody.gain.value = 0;
    this.rainGust = ac.createGain(); this.rainGust.gain.value = 1;
    rainIn.connect(this.filter("bandpass", 6500, 0.5)).connect(this.rainFine).connect(this.rainGust);
    rainIn.connect(this.filter("bandpass", 1500, 0.6)).connect(this.rainBody).connect(this.rainGust);
    this.rainGust.connect(this.duck);
    this.rainLoop = new LazyLoop(ac, this.white, rainIn);
    this.patterBus = ac.createGain(); this.patterBus.gain.value = 0;
    this.patterLp = this.filter("lowpass", 6000, 0.5);
    this.patterLp.connect(this.patterBus).connect(this.duck);
    this.dripBus = ac.createGain(); this.dripBus.gain.value = 0; this.dripBus.connect(this.out);

    // ---- storm surf: the hiss of spray and whitecaps, thrown up with each break
    this.spray = ac.createGain(); this.spray.gain.value = 0.15;
    this.sprayBus = ac.createGain(); this.sprayBus.gain.value = 0;
    const sprayHp = this.filter("highpass", 1800, 0.5);
    this.sprayLoop = new LazyLoop(ac, this.white, sprayHp);
    sprayHp.connect(this.spray).connect(this.sprayBus).connect(this.duck);

    // ---- the howl of a storm round the buildings: three narrow bands crossfaded by the gusts (a moaning glide
    // without automating a cutoff)
    const howlIn = ac.createGain();
    this.howlBus = ac.createGain(); this.howlBus.gain.value = 0; this.howlBus.connect(this.duck);
    this.howl = [330, 460, 620].map((f) => {
      const g = ac.createGain(); g.gain.value = 0.33;
      howlIn.connect(this.filter("bandpass", f, 9)).connect(g).connect(this.howlBus);
      return g;
    });
    this.howlLoop = new LazyLoop(ac, this.white, howlIn);

    // ---- thunder (clips placed by the controller after each flash)
    this.thunderBus = ac.createGain(); this.thunderBus.gain.value = 1.5; this.thunderBus.connect(this.out);

    // ---- season colour
    this.birdBus = ac.createGain(); this.birdBus.gain.value = 0; this.birdBus.connect(this.out);
    this.cricketBus = ac.createGain(); this.cricketBus.gain.value = 0; this.cricketBus.connect(this.out);
    this.cicadaBus = ac.createGain(); this.cicadaBus.gain.value = 0; this.cicadaBus.connect(this.out);
    this.rustleBus = ac.createGain(); this.rustleBus.gain.value = 0;
    this.rustleLp = this.filter("lowpass", 9000, 0.5);
    this.rustleLp.connect(this.rustleBus).connect(this.out);
    this.crunchBus = ac.createGain(); this.crunchBus.gain.value = 0; this.crunchBus.connect(this.out);

    this.harbourBus = ac.createGain(); this.harbourBus.gain.value = 0; this.harbourBus.connect(this.out);
    this.gullBus = ac.createGain(); this.gullBus.gain.value = 0; this.gullBus.connect(this.out); this.gullBus.connect(this.echo);
    this.bellBus = ac.createGain(); this.bellBus.gain.value = 0.11; this.bellBus.connect(this.out); this.bellBus.connect(this.echo);
    this.hornBus = ac.createGain(); this.hornBus.gain.value = 0.26; this.hornBus.connect(this.out); this.hornBus.connect(this.echo);

    const t = now + 0.3;
    this.next = {
      wave: t + 0.2, lap: t + 0.6, reef: t + 1.5, gull: t + 3 + this.rnd() * 4, creak: t + 3, tap: t + 1.5, horn: t + 3, gust: t,
      crackle: t, press: t + 0.5, refresh: t + 20,
      rainA: t, rainB: t + 1.7, drip: t + 1, bird: t + 1 + this.rnd() * 3, cricket: t, cicada: t, crunch: t + 4,
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
    // a global cap on the one-shot events: a busy moment never piles up into a wall of clips
    const now = this.ac.currentTime;
    if (this.voices.length >= VOICES) this.voices = this.voices.filter((e) => e > now);
    if (!ALWAYS.has(kind)) {
      if (this.voices.length >= VOICES) return;
      this.voices.push(at + buf.duration / rate);
    }
    const s = this.ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    // a mono clip holds (L + R) / 2: √2 puts it back at the stereo clip's level through the panner
    const g = this.ac.createGain(); g.gain.value = buf.numberOfChannels === 1 ? level * Math.SQRT2 : level;
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
    const I = this.inputs, { zoom, wind, fog, night, rain, snow, storm, gust } = I;
    const near = Math.max(0, Math.min(1, 1 - zoom));
    const tc = 0.8;
    const air = (d: number, lo: number, hi: number) => lo * Math.pow(hi / lo, Math.max(0, Math.min(1, d)));
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    // the settle: the mix eases down and thins after a few idle minutes; any input brings it back in ~2 s
    const att = clamp01(I.attention), thin = settleRate(att);
    // altitude: from the overview the sea breathes and the quay's detail falls away; a source behind is darker
    const alt = clamp01((zoom - 0.8) / 0.2), point = 1 - 0.5 * alt;
    const behind = (b: number, k: number) => 1 - k * clamp01(b);
    this.aim(this.settle.gain, Math.pow(10, settleDb(att, now, this.breathPhase) / 20), att > 0.99 ? 0.5 : 2);

    // ---- levels: nearer is louder AND brighter; a storm heavies the whole sea
    this.aim(this.shoreBus.gain, 0.5 * (0.3 + 0.7 * I.shore) * (1 - 0.3 * zoom) * (1 + 0.5 * storm), tc);
    this.aim(this.shoreLp.frequency, air(I.shore * (1 - 0.4 * zoom), 900, 14000) * behind(I.shoreBack, 0.55), tc);
    this.aim(this.bedGain.gain, (0.16 + 0.16 * zoom + 0.05 * wind + 0.14 * storm) * (1 - 0.5 * I.shore * near) * (1 - 0.2 * I.snowCover), tc);   // a near wave masks the far sea
    this.aim(this.bedLp.frequency, air(1 - zoom, 420, 900), tc);
    this.aim(this.lapBus.gain, (0.06 + 1.1 * I.harbour * I.harbour) * point, tc);
    this.aim(this.lapLp.frequency, air(I.harbour, 1200, 12000), tc);
    this.aim(this.reefBus.gain, (0.12 + 0.55 * I.reef) * (0.7 + 0.5 * wind) * (1 + 0.6 * storm), tc);
    this.aim(this.reefLp.frequency, air(I.reef, 380, 2600) * behind(I.reefBack, 0.4), tc);
    this.aim(this.reefPan.pan, I.reefPan * 0.8, tc);
    this.aim(this.windGain.gain, (0.05 + 0.42 * wind * wind) * (0.7 + 0.3 * zoom), tc);
    this.aim(this.windLow.gain, 1.1 * wind * wind, tc);
    // the rigging sings in a blow, and in any storm from WARNING up
    const blow = Math.max(wind, storm > 0.6 ? 0.45 + 0.45 * storm : 0);
    this.whistleLoop.update(blow > 0.56, blow < 0.55, now, r);
    this.highAirLoop.update(alt > 0.02, alt < 0.01, now, r);
    this.aim(this.highAir.gain, 0.015 * alt, tc);
    this.aim(this.harbourBus.gain, (0.08 + 1.1 * I.harbour * I.harbour) * (1 - 0.3 * snow) * point, tc);
    // gulls shelter from a storm and the rain, and snow softens them
    this.aim(this.gullBus.gain, (0.12 + 0.3 * near) * (1 - 0.8 * night) * (1 - 0.5 * fog) * (1 - 0.7 * storm) * (1 - 0.5 * rain) * (1 - 0.5 * snow), tc);
    this.aim(this.fireBus.gain, 0.5 * I.fire * I.fire * point, 0.5);
    this.aim(this.firePan.pan, I.firePan * 0.8, 0.5);
    this.aim(this.mintBus.gain, 0.16 * I.mint * I.mint * point, 0.5);
    this.aim(this.mintLp.frequency, air(I.mint, 700, 6000) * behind(I.mintBack, 0.5), 0.5);
    this.aim(this.mintPan.pan, I.mintPan * 0.8, 0.5);

    // ---- weather (data): snow's hush, rain on the sea and the roofs, drips, spray, the howl
    this.aim(this.hush.gain, -(11 * snow + 4 * I.snowCover), 1.5);
    this.rainLoop.update(rain > 0.01, rain < 0.005, now, r);
    this.aim(this.rainFine.gain, 0.28 * Math.pow(rain, 0.7) * (0.8 + 0.2 * zoom), 1);
    this.aim(this.rainBody.gain, 0.4 * rain * rain, 1);
    this.aim(this.patterBus.gain, (0.25 + 0.75 * I.town) * clamp01(rain * 2.5), 1);
    this.aim(this.patterLp.frequency, air(I.town * (1 - 0.4 * zoom), 2200, 12000) * behind(I.townBack, 0.5), 1);
    this.aim(this.dripBus.gain, 0.5 * I.wet * (1 - snow) * (0.15 + 0.85 * I.town), 1);
    this.sprayLoop.update(storm > 0.4 && !I.lean, storm < 0.35 || I.lean, now, r);
    this.aim(this.sprayBus.gain, 0.4 * storm * storm * (0.3 + 0.7 * I.shore), 1);
    const howl = storm > 0.5 ? Math.pow((storm - 0.5) / 0.5, 1.5) : 0;
    this.howlLoop.update(howl > 0.02 && !I.lean, howl < 0.01 || I.lean, now, r);
    this.aim(this.howlBus.gain, 2.4 * howl * (0.5 + 0.5 * gust) * (0.7 + 0.3 * zoom), 1);

    // ---- season colour (calendar): the weather silences it (no birdsong in a downpour)
    const day = 1 - night;
    const quiet = (1 - clamp01(rain * 1.6)) * (1 - 0.9 * storm) * (1 - snow);
    const cic = cicadaLevel(I.summer, I.hour);
    const birds = (I.spring + 0.5 * I.summer + 0.2 * I.autumn + 0.04 * I.winter) * day * quiet * birdThinning(cic);
    this.aim(this.birdBus.gain, birds * (0.05 + 0.5 * I.trees), 1);
    const dusk = clamp01((night - 0.2) / 0.4);
    const crickets = (I.summer + 0.3 * I.spring + 0.5 * I.autumn) * dusk * (1 - clamp01(rain * 2)) * (1 - 0.8 * storm);
    this.aim(this.cricketBus.gain, crickets * (0.04 + 0.4 * I.land), 1);
    const cicadas = cic * day * quiet;
    this.aim(this.cicadaBus.gain, cicadas * (0.03 + 0.25 * I.trees), 1);
    const leafy = I.autumn + 0.35 * (I.spring + I.summer) + 0.04 * I.winter;
    const rustle = Math.pow(wind, 1.2) * leafy * (1 - 0.7 * I.wet);
    this.aim(this.rustleBus.gain, rustle * (0.3 + 2 * I.land), 1);
    this.aim(this.rustleLp.frequency, air(I.autumn, 3200, 11000), 1);    // dry autumn leaves are crisp, green ones soft
    const crunch = I.snowCover > 0.25 && night < 0.85 ? I.town * near * clamp01((I.snowCover - 0.25) * 2) : 0;
    this.aim(this.crunchBus.gain, 0.7 * crunch, 1);

    // only what the scene needs is synthesised
    if (rain > 0.005) this.need(rain < 0.35 ? "drizzle" : "rain");
    if (I.wet > 0.05) this.need("drip");
    if (storm > 0.6) this.need("thunder", "rumble");
    if (birds > 0.01) this.need("bird");
    if (crickets > 0.01) this.need("cricket");
    if (cicadas > 0.01) this.need("cicada");
    if (rustle > 0.01) this.need("rustle");
    if (crunch > 0.01) this.need("crunch");

    const N = this.next;
    // ---- the swell: one wave per period, in sets; the shore, the bed, the laps and the bell answer it
    if (N.wave < ahead) {
      const at = Math.max(N.wave, now);
      if (this.setLeft <= 0 && r() < 0.18 + 0.3 * storm) this.setLeft = 3;
      const big = this.setLeft > 0 ? 1.25 : 1;
      this.setLeft--;
      const size = (0.55 + 0.45 * r()) * big * (0.85 + 0.3 * wind) * (1 + 0.35 * storm);
      const deep = 1 - 0.08 * storm;      // storm breakers are bigger, slower, deeper
      // the main wash, and often a second one further along the beach
      // (the nearest stretch of beach pulls the main wash to its side of the screen)
      const lean = I.shorePan * 0.6 * I.shore;
      this.play("shore", at, this.shoreLp, 0.9 * size, lean + (r() - 0.5) * (1.2 - 0.6 * I.shore), (0.94 + r() * 0.1) * deep);
      if (r() < 0.6 + 0.3 * storm) this.play("shore", at + 0.8 + r() * 2.4, this.shoreLp, 0.45 * size * (0.6 + 0.4 * r()), r() * 1.6 - 0.8, (0.9 + r() * 0.12) * deep);
      // spray flung off the break in a storm
      if (storm > 0.35) {
        const sg = this.spray.gain;
        sg.setTargetAtTime(0.45 + 0.55 * size, at + 0.8, 0.25);
        sg.setTargetAtTime(0.15, at + 1.8, 1.4);
      }
      // the far bed swells a little ahead of the beach and ebbs after it
      const g = this.bedSwell.gain;
      g.setTargetAtTime(0.65 + 0.55 * size, at, 0.9);
      g.setTargetAtTime(0.45, at + 2.2, 2.2);
      // a cluster of laps as the swell runs through the moorings
      const laps = 2 + Math.floor(r() * 3);
      for (let k = 0; k < laps; k++) this.play("lap", at + 0.9 + k * (0.22 + r() * 0.5), this.lapLp, (0.5 + 0.5 * r()) * size, r() * 1.6 - 0.8, 0.85 + r() * 0.3);
      // the bell buoy rolls with the same swell
      if (r() < 0.3 * thin) {
        this.play("bell", at + 1 + r(), this.bellBus, 1, -0.4, 0.99 + r() * 0.02);
        if (r() < 0.35) this.play("bell", at + 2.2 + r() * 0.6, this.bellBus, 0.55, -0.4, 0.99 + r() * 0.02);
      }
      N.wave = at + (6 + r() * 3.5) * (1 - 0.18 * wind) * (1 - 0.12 * storm);
    }
    // stray laps between the swells
    if (N.lap < ahead) {
      const at = Math.max(N.lap, now);
      this.play("lap", at, this.lapLp, 0.25 + 0.4 * r(), r() * 1.8 - 0.9, 0.8 + r() * 0.4);
      N.lap = at + (0.7 + r() * (2.6 - wind * 1.2)) / thin;
    }
    if (N.reef < ahead) {
      const at = Math.max(N.reef, now);
      this.play("reef", at, this.reefLp, 0.6 + 0.4 * r(), r() * 0.6 - 0.3, 0.9 + r() * 0.15);
      N.reef = at + 6.5 + r() * 5;
    }
    // gusts: the wind band wanders and swells
    if (N.gust < ahead) {
      const at = Math.max(N.gust, now), d = (1.2 + r() * 2.8) * (1 - 0.35 * gust);
      const hi = Math.min(1, r() * (0.5 + wind * 0.7 + 0.3 * gust));
      this.windLo.gain.setTargetAtTime(1 - hi * 0.7, at, d * 0.4);
      this.windHi.gain.setTargetAtTime(hi, at, d * 0.4);
      this.windGust.gain.setTargetAtTime(0.35 + r() * (0.5 + wind * 0.6 + 0.4 * gust), at, d * 0.35);
      // the whistle sings in some gusts of a blow, never as a steady tone
      this.whistle.gain.setTargetAtTime(blow > 0.55 && r() < 0.55 ? (blow - 0.55) * (0.3 + 0.5 * r()) : 0, at, d * 0.3);
      // driving rain: sheets of it come with the gusts
      if (rain > 0.01) this.rainGust.gain.setTargetAtTime(0.7 + 0.7 * hi * (0.3 + gust), at, d * 0.35);
      // the howl moans up and down with the gust
      if (howl > 0.01) {
        const p = hi * 2 + (r() - 0.5) * 0.6;
        this.howl.forEach((g, k) => g.gain.setTargetAtTime(0.1 + 0.6 * Math.exp(-1.6 * (p - k) * (p - k)), at, d * 0.45));
      }
      // a gust through the leaves
      if (rustle > 0.01 && r() < 0.25 + 0.6 * wind) this.play("rustle", at + d * 0.15, this.rustleLp, 0.5 + 0.5 * hi, I.treesPan * 0.4 + r() * 1.4 - 0.7, 0.9 + r() * 0.2);
      N.gust = at + d;
    }
    // ---- rain on roofs and quays: overlapped 4 s clips (seamless); a second stream doubles a downpour
    if (rain > 0.01) {
      if (N.rainA < ahead) {
        const at = Math.max(N.rainA, now);
        this.play(rain < 0.3 ? "drizzle" : "rain", at, this.patterLp, 0.9, I.townPan * 0.3 + r() * 0.4 - 0.2, 0.95 + r() * 0.1);
        N.rainA = at + 3.45 + r() * 0.1;
      }
      if (rain > 0.6 && !I.lean) {
        if (N.rainB < ahead) {
          const at = Math.max(N.rainB, now);
          this.play("rain", at, this.patterLp, 0.8 * clamp01((rain - 0.6) / 0.3), r() < 0.5 ? -0.6 : 0.6, 0.9 + r() * 0.15);
          N.rainB = at + 3.45 + r() * 0.1;
        }
      } else N.rainB = Math.max(N.rainB, now + 1.7);
    } else N.rainA = Math.max(N.rainA, now);
    // the eaves drip while things are wet (and after the rain has stopped)
    if (I.wet > 0.05 && snow < 0.5) {
      if (N.drip < ahead) {
        const at = Math.max(N.drip, now);
        this.play("drip", at, this.dripBus, 0.5 + 0.5 * r(), I.townPan * 0.5 + r() * 1.2 - 0.6, 0.85 + r() * 0.3);
        N.drip = at + (0.3 + r() * 2.2) / (0.3 + I.wet);
      }
    } else N.drip = Math.max(N.drip, now);
    // songbirds, and now and then an answer from another tree
    if (birds > 0.01) {
      if (N.bird < ahead) {
        const at = Math.max(N.bird, now), pan = I.treesPan * 0.5 + r() * 1.2 - 0.6;
        this.play("bird", at, this.birdBus, 0.5 + 0.5 * r(), pan, 0.94 + r() * 0.12);
        if (r() < 0.3) this.play("bird", at + 1 + r() * 1.5, this.birdBus, 0.35 + 0.3 * r(), -pan, 0.92 + r() * 0.16);
        N.bird = at + (1.5 + r() * 5) / (0.4 + Math.min(1, birds));
      }
    } else N.bird = Math.max(N.bird, now + r() * 2);
    // crickets: overlapped 4 s clips like the fire
    if (crickets > 0.01) {
      if (N.cricket < ahead) {
        const at = Math.max(N.cricket, now);
        this.play("cricket", at, this.cricketBus, 0.8, I.treesPan * 0.3 + r() * 0.6 - 0.3, 0.97 + r() * 0.06);
        N.cricket = at + 3.45 + r() * 0.1;
      }
    } else N.cricket = Math.max(N.cricket, now);
    // cicadas: overlapped 5 s clips, only on summer afternoons
    if (cicadas > 0.01) {
      if (N.cicada < ahead) {
        const at = Math.max(N.cicada, now);
        this.play("cicada", at, this.cicadaBus, 0.8, I.treesPan * 0.3 + r() * 0.6 - 0.3, 0.97 + r() * 0.06);
        N.cicada = at + 4.45 + r() * 0.1;
      }
    } else N.cicada = Math.max(N.cicada, now);
    // footsteps in the snow, now and then, near the town
    if (crunch > 0.01) {
      if (N.crunch < ahead) {
        const at = Math.max(N.crunch, now);
        this.play("crunch", at, this.crunchBus, 0.6 + 0.4 * r(), I.townPan * 0.5 + r() * 1.2 - 0.6, 0.92 + r() * 0.16);
        N.crunch = at + 7 + r() * 14;
      }
    } else N.crunch = Math.max(N.crunch, now + 3);
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
      N.gull = at + (4 + r() * 10 + night * 10) / thin;
    }
    if (N.creak < ahead) {
      const at = Math.max(N.creak, now);
      this.play("creak", at, this.harbourBus, 0.7 + 0.5 * r(), r() * 1.2 - 0.6, 0.85 + r() * 0.3);
      N.creak = at + (2.5 + r() * 6 - wind * 1.5) / thin;
    }
    if (N.tap < ahead) {
      const at = Math.max(N.tap, now);
      this.play("halyard", at, this.harbourBus, 0.6 + 0.6 * r() * (0.5 + wind), r() * 1.4 - 0.7, 0.9 + r() * 0.2);
      N.tap = at + (1.2 + r() * (5 - wind * 3.5)) / thin;
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

  /** Ask the bank for lazy kinds; start synthesising if it was idle. */
  private need(...kinds: ClipKind[]): void {
    const busy = this.bank.pending;
    let added = false;
    for (const k of kinds) added = this.bank.want(k) || added;
    if (!added) return;
    if (!this.timer) this.bank.buildAll();
    else if (!busy) this.pump();
  }

  /**
   * Thunder for a lightning flash `km` away: it arrives with the sound's own delay (343 m/s), compressed
   * beyond ~10 s so a far strike's roll still answers its flash (monotonic: farther is always later). A near
   * strike (< 4 km) cracks and rolls; a far one is only the low rumble, quieter with distance. Placed at
   * `pan`. At most three rolls at once (a flurry of flashes must not stack into a roar). Reduced motion:
   * never a crack, and softer.
   */
  thunder(km: number, intensity = 1, pan = 0, delaySec = (km * 1000) / 343): void {
    if (this.disposed) return;
    const now = this.ac.currentTime;
    this.thunders = this.thunders.filter((t) => t > now);
    if (this.thunders.length >= 3) return;
    const d = Math.max(0.3, km), reduced = this.inputs.reduced;
    const near = d < 4 && !reduced;
    const delay = delaySec <= 10 ? Math.max(0.2, delaySec) : Math.min(20, 10 + (delaySec - 10) * 0.3);
    const at = now + delay;
    const strength = 0.35 + 0.65 * Math.max(0, Math.min(1, intensity));
    const lvl = strength * (near ? 0.85 * Math.min(1, Math.sqrt(2.5 / d)) : Math.max(0.6, Math.min(0.9, 6 / d))) * (reduced ? 0.6 : 1);
    const kind = near ? "thunder" : "rumble";
    this.need(kind);
    this.play(kind, at, this.thunderBus, lvl, pan, 0.88 + this.rnd() * 0.2);
    if (near) {
      // dip the weather beds under the clap, then let them back over the roll
      const g = this.duck.gain, k = 1 - 0.55 * lvl;
      g.setTargetAtTime(k, at, 0.02);
      g.setTargetAtTime(1, at + 0.5, 1.2);
    }
    this.thunders.push(at + (near ? 10 : 16));
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
    for (const l of [this.highAirLoop, this.rainLoop, this.sprayLoop, this.howlLoop]) l.stop();
    this.out.disconnect();
    if ("close" in this.ac) await (this.ac as AudioContext).close().catch(() => undefined);
  }
}

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
 *     wet, snow hushing the whole scene (a high shelf over everything, softer gulls), gusts,
 *     a moaning howl and the rigging's whistle in a blow, and thunder after each flash,
 *     delayed by the distance of the strike (a tearing crack and roll when near, a low rumble when far);
 *   - SEASON colour (calendar, declared decorative like the time of day): songbirds in the trees in spring,
 *     crickets at dusk in summer, dry leaves rustling in the gusts of autumn, and the crisp hush of winter
 *     with a crunch of footsteps in the snow near the town.
 *
 * Distance works as in the open air: farther sources are quieter AND darker (lowpassed), and their pan
 * follows where they lie on screen. The master meets a ceiling well below full scale; the start is a quick
 * dB-linear on-ramp (a lap first, then the first wash), the stop a slow fade.
 *
 * Pure WebAudio + a small inputs record; no three.js and no engine imports, so the module stays lazy.
 */

import { ClipBank } from "./bank";
import { fillNoise } from "./noise";
import { makeRng, type ClipKind } from "./dsp";

export interface AmbienceInputs {
  /** 0 = closest zoom … 1 = farthest */
  zoom: number;
  /** wind 0..1 (DEWS) */
  wind: number;
  /** Eased ocean uSea: amplitude, chop, whitecaps, bands (off-peg supply share). */
  sea: [number, number, number, number];
  /** A non-null sea reading with current stablecoin truth. Otherwise analytical surf is silent. */
  seaAvailable: boolean;
  /** stale-data fog 0..1 */
  fog: number;
  /** 0 day … 1 night */
  night: number;
  /** world hour 0..24 (the LIGHT hour: dawn, dusk and night as the sky shows them) */
  hour: number;
  /** the world's clock hour 0..24 (wall clock or the pinned ?t=): the hour bell strikes it */
  clock: number;
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
  /** Separate from the rate: fresh idle presses may still work; banked/missing presses never do. */
  mintAvailable: boolean;
  /** nearness 0..1 of the Burn's furnace (0 when there is none), its pan, and the burn activity 0..1 (0 = stale) */
  burn: number;
  burnPan: number;
  burnBack: number;
  burnRate: number;
  /** nearness 0..1 of Wreck Cove (the hush: thinner gulls, darker laps, the wind in the ribs), and its pan */
  cove: number;
  covePan: number;
  /** nearness 0..1 of the Shipyard's slipways (0 when there is none), and its pan */
  ship: number;
  shipPan: number;
  shipBack: number;
  /** precipitation intensity 0..1, rain and snow (the TYPE follows the season, the INTENSITY the DEWS band) */
  rain: number;
  snow: number;
  /** wet surfaces 0..1: the eaves keep dripping after the rain */
  wet: number;
  /** storminess 0..1 from the DEWS band: calm 0, watch .25, alert .5, warning .75, danger 1 */
  storm: number;
  /** gustiness 0..1 */
  gust: number;
  /**
   * the shared gust field at the listener (weather/gust.ts: the cat's-paws that heel the fleet and darken the
   * water), 0 in a lull … 1 in a paw, unscaled; -1 when there is no field (the gusts are then free-running)
   */
  paw: number;
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

export const NEUTRAL_SEA: AmbienceInputs["sea"] = [0.1, 0.35, 0, 0.8];

export interface AmbienceOptions {
  /** no timers: the caller drives step() (offline rendering) and the bank is built at once */
  manual?: boolean;
  /** Start with JS scheduling paused (the owner also suspends the audio clock). */
  paused?: boolean;
  seed?: number;
}

const MASTER = 0.63;
/** The on-ramp (E32): the master rises dB-linearly over ONRAMP s from a floor 24 dB down. */
export const ONRAMP = 1.4, ONRAMP_FLOOR = 10 ** (-24 / 20);
/** The composed arrival: the bell buoy answers the second swell if it comes this soon (s) after the start. */
const ARRIVAL = 20;
/** The beds' pocket while a music phrase plays (E34): 2 dB down. */
export const POCKET = 10 ** (-2 / 20);
/** Where the music joins the mix (musicIn()): an audio input whose phrases may open the beds' pocket. */
export interface MusicInput extends AudioNode { pocket?(at: number, span: number): void }
const TICK_MS = 120;
/** at most this many one-shot events sound at once (the continuous beds and the data kinds always play) */
const VOICES = 24;
/** kinds that are a bed (overlapped clips), the swell itself, or data: never dropped by the voice cap */
const ALWAYS = new Set<ClipKind>(["shore", "crackle", "drizzle", "rain", "cricket", "cicada", "thunder", "rumble", "unroll", "latch", "flick"]);
/** The UI foley's bus gain: a cue's peak (≤ 0.6 in the clip) lands under −24 dBFS after the master. */
export const CUE_GAIN = 0.12;
/**
 * The chart table's foley: a panel opened, a panel closed, a ledger page; and "evening-gun", the decorative
 * sunset gun's dull report, played EVENING_GUN_DELAY after the call (the call is the visual puff).
 */
export type CueName = "open" | "close" | "page" | "evening-gun";
const CUE_KIND: Partial<Record<CueName, ClipKind>> = { open: "unroll", close: "latch", page: "flick" };
/** The evening gun is heard this long after its puff is seen (sound from ~400 m across the bay). */
export const EVENING_GUN_DELAY = 1.2;
/**
 * The far event cues' bus (a titan's conch, the evening gun): with the clip peaks ≤ 0.5 / 0.6 this keeps the
 * conch under the bell buoy and the gun under a far roll of thunder (dsp.test.ts checks both).
 */
export const FAR_GAIN = 0.1;
/** The passing hulls' bus (bow wash and a sail's flog): under a near lap (dsp.test.ts). */
export const PASS_GAIN = 0.5;
/**
 * The Pharos's breath (E33): its partials [Hz, amplitude], D3 A3 D4 A4 (the amplitudes sum to 1, so the breath
 * never peaks above its envelope); its longest envelope (a slow sweep's, s); its envelope's ceiling.
 */
export const BREATH: ReadonlyArray<readonly [number, number]> = [[146.83, 0.24], [220, 0.17], [293.66, 0.38], [440, 0.21]];
export const BREATH_SEC = 5.9;
export const BREATH_PEAK = 0.063;

/**
 * The ten-minute settle: after a while unwatched the whole mix eases down 3 dB, and it always breathes a
 * slow ±1.5 dB (two incommensurate swells, 2.5 and ~3.9 min) so the scene never sits stationary. In dB.
 */
export function settleDb(attention: number, t: number, phase = 0): number {
  const a = Math.max(0, Math.min(1, attention));
  const breath = 0.6 * Math.sin((2 * Math.PI * t) / 150 + phase) + 0.4 * Math.sin((2 * Math.PI * t) / 233 + 2.1 * phase + 1);
  return -3 * (1 - a) + 1.5 * breath;
}

/** 0 → 1 over [a, b], 1 until c, → 0 over [c, d] (hours). */
const trap = (h: number, a: number, b: number, c: number, d: number) =>
  Math.max(0, Math.min(1, (h - a) / (b - a), (d - h) / (d - c)));

/**
 * The day clock (time of day is decorative): the dawn chorus 05–07 h, the noon hush 12–14 h, and the deep
 * night 22–04 h when the owls call. Each 0..1, fading over the hour at its edges. `hour` = the light hour.
 */
export function dayClock(hour: number): { chorus: number; hush: number; deep: number } {
  const h = ((hour % 24) + 24) % 24;
  return {
    chorus: trap(h, 4.6, 5.3, 7, 7.8),
    hush: trap(h, 11.3, 12.2, 13.8, 14.6),
    deep: Math.max(trap(h, 21.4, 22.4, 24.5, 25), trap(h, -1, -0.5, 3.6, 4.5)),
  };
}

/**
 * Strikes of the harbour bell as the clock enters hour `h`: one, from 06 to 22 h, three at noon at most;
 * never a counting peal (sixteen tolls at 16 h would be a jolt), never at night.
 */
export function hourStrikes(h: number): number {
  return h >= 6 && h <= 22 ? (h === 12 ? 3 : 1) : 0;
}

/**
 * The wind's swell at the listener from the shared gust field: a lull 0.35–0.5, a full paw up to ~1.85 in a
 * DEWS blow (the field's shape decides WHEN, only the wind strength decides HOW MUCH). `flutter` 0..1.
 */
export function gustSwell(paw: number, wind: number, gust: number, flutter: number): number {
  const c = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);
  return 0.35 + 0.15 * c(flutter) + c(paw) * (0.25 + 0.85 * c(wind) + 0.25 * c(gust));
}

/** Event-rate multiplier of the settle: 1 while watched … 0.7 (~30 % sparser) when settled. */
export const settleRate = (attention: number) => 0.7 + 0.3 * Math.max(0, Math.min(1, attention));

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
  constructor(private readonly ac: BaseAudioContext, private buf: AudioBuffer | null, private readonly to: AudioNode) {}
  update(on: boolean, off: boolean, now: number, rnd: () => number): void {
    if (on && !this.src && this.buf) {
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
  dispose(): void { this.stop(); this.buf = null; }
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

interface PendingThunder { kind: ClipKind; at: number; level: number; pan: number; rate: number; near: boolean }
/** A cold roll may trail its original deadline by at most one second. */
const THUNDER_LATENESS = 1;

export class Ambience {
  private readonly out: GainNode;
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly inputs: AmbienceInputs = {
    zoom: 0.5, wind: 0.35, fog: 0, night: 0, hour: 9, clock: 9, shore: 0.5, shorePan: 0, harbour: 0.5, reef: 0.2, reefPan: -0.5,
    sea: NEUTRAL_SEA, seaAvailable: false,
    fire: 0, firePan: 0, mint: 0, mintPan: 0, mintRate: 0, mintAvailable: false,
    rain: 0, snow: 0, wet: 0, storm: 0, gust: 0.3, paw: -1, spring: 0, summer: 0, autumn: 0, winter: 0, snowCover: 0,
    town: 0.3, townPan: 0, trees: 0.2, treesPan: 0, land: 0.3, reduced: false, lean: false, attention: 1,
    shoreBack: 0, reefBack: 0, mintBack: 0, townBack: 0, ship: 0, shipPan: 0, shipBack: 0,
    burn: 0, burnPan: 0, burnBack: 0, burnRate: 0, cove: 0, covePan: 0,
  };
  private readonly rnd: () => number;
  private noiseJob: Generator<void> | null = null;
  private readonly loopStarts: Array<{ source: AudioBufferSourceNode; offset: number }> = [];
  private readonly bank: ClipBank;
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
  private readonly burnBus: GainNode;
  private readonly burnLp: BiquadFilterNode;
  private readonly burnPan: StereoPannerNode;
  private readonly bellows: GainNode;
  private readonly bellowsLoop: LazyLoop;
  private readonly shipBus: GainNode;
  private readonly shipLp: BiquadFilterNode;
  private readonly shipPan: StereoPannerNode;
  /** the yard's work: strokes left in this run, the tool, its beat, where on the slip the shipwright stands */
  private ship = { left: 0, tool: "mallet" as ClipKind, beat: 0.6, at: 0 };
  // event buses
  private readonly harbourBus: GainNode;    // creaks, taps (near)
  private readonly gullBus: GainNode;
  private readonly bellBus: GainNode;
  private readonly hornBus: GainNode;
  private readonly echo: DelayNode;
  // weather
  private readonly hush: BiquadFilterNode;
  private readonly pocket: GainNode;
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
  private thunders: Array<{ at: number; end: number }> = [];
  private pendingThunder: PendingThunder[] = [];
  // season
  private readonly birdBus: GainNode;
  private readonly cricketBus: GainNode;
  private readonly cicadaBus: GainNode;
  private readonly rustleBus: GainNode;
  private readonly rustleLp: BiquadFilterNode;
  private readonly crunchBus: GainNode;
  // the day clock: night birds, the hour bell
  private readonly nightBus: GainNode;
  private readonly tollLp: BiquadFilterNode;
  private lastHour = -1;
  private readonly cueBus: GainNode;
  private readonly ribs: GainNode;
  private readonly ribsPan: StereoPannerNode;
  private readonly ribsLoop: LazyLoop;
  /** the anniversary bell, waiting for its clips */
  private knell: { level: number; pan: number } | null = null;
  /** lazy event clips waiting for their synthesis (played when ready, dropped if more than 2 s late) */
  private pending: Array<{ kind: ClipKind; at: number; level: number; pan: number }> = [];
  private readonly farBus: GainNode;
  private readonly passBus: GainNode;
  // the ten-minute settle (and the slow breathing of the whole mix), and the one-shots now sounding
  private readonly settle: GainNode;
  private readonly breathPhase: number;
  private voices: number[] = [];
  private timer = 0;
  private idle: number | null = null;
  private idleCallback = false;
  private pumpEpoch = 0;
  private paused: boolean;
  private readonly manual: boolean;
  private disposal: Promise<void> | null = null;
  private finishFade: (() => void) | null = null;
  private next = {
    wave: 0, lap: 0, reef: 0, gull: 0, creak: 0, tap: 0, horn: 0, gust: 0, crackle: 0, press: 0, refresh: 0,
    rainA: 0, rainB: 0, drip: 0, bird: 0, cricket: 0, cicada: 0, crunch: 0, ship: 0, groan: 0, burn: 0, bellows: 0, owl: 0, nightjar: 0,
  };
  private setLeft = 0;
  /** swells heard so far, the audio time the sound started, and when the Pharos's breath ends (one at a time) */
  private swells = 0;
  private born: number;
  private breathEnd = 0;
  private breaths: Array<{ gate: GainNode; end: number }> = [];
  private pressN = 0;
  private disposed = false;
  private readonly lanes = new Map<AudioNode, Array<StereoPannerNode | undefined>>();
  private readonly aims = new Map<AudioParam, number>();

  constructor(readonly ac: BaseAudioContext, opts: AmbienceOptions = {}) {
    this.manual = !!opts.manual;
    this.paused = !!opts.paused;
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rnd = makeRng(seed);
    this.bank = new ClipBank(ac, Math.floor(this.rnd() * 2 ** 31));
    const now = ac.currentTime;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = 0.03; comp.release.value = 0.5;
    // the ceiling (E31): a fast 20:1 limiter after the glue, so the loudest moment (a near clap over a storm)
    // meets a ceiling near −2.6 dBFS long before the safety clip; its own makeup gain is part of MASTER's level
    const ceiling = ac.createDynamicsCompressor();
    ceiling.threshold.value = -6; ceiling.knee.value = 0; ceiling.ratio.value = 20; ceiling.attack.value = 0.002; ceiling.release.value = 0.25;
    this.out = ac.createGain();
    this.out.gain.value = MASTER * ONRAMP_FLOOR;
    // snow hushes the world: a high shelf over everything (snow on the ground and in the air soaks up the highs)
    this.hush = this.filter("highshelf", 2500, 0.7); this.hush.gain.value = 0;
    // a safety soft clip after the ceiling (linear to 0.8, then a smooth knee that never reaches 1):
    // nothing can ever clip, at the cost of a table lookup per sample
    const safety = ac.createWaveShaper();
    safety.curve = softClipCurve();
    this.settle = ac.createGain();
    this.breathPhase = this.rnd() * Math.PI * 2;
    this.out.connect(this.settle).connect(this.hush).connect(comp).connect(ceiling).connect(safety).connect(ac.destination);
    // the beds (the far sea; the weather's wind, rain, spray and howl) step back 2 dB while a music phrase plays
    this.pocket = ac.createGain(); this.pocket.connect(this.out);
    // the weather beds (wind, rain, spray, howl) pass through a duck that dips under a near thunderclap, so
    // the clap stands out of a downpour without pushing the mix toward full scale
    this.duck = ac.createGain(); this.duck.connect(this.pocket);

    // a short, damp slap-back echo for the distant events (bell, horn, gulls): the harbour walls
    this.echo = ac.createDelay(1);
    this.echo.delayTime.value = 0.31;
    const fb = ac.createGain(); fb.gain.value = 0.26;
    const damp = ac.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 1700;
    this.echo.connect(damp).connect(fb).connect(this.echo);
    const echoOut = ac.createGain(); echoOut.gain.value = 0.45;
    damp.connect(echoOut).connect(this.out);

    const white = ac.createBuffer(2, Math.floor(ac.sampleRate * 8.7), ac.sampleRate);
    const pink = ac.createBuffer(2, Math.floor(ac.sampleRate * 9.3), ac.sampleRate);
    const noiseRng = makeRng(seed, 2);
    // Reserve the original noise draws so slicing cannot change event times or seeded PCM.
    this.rnd = makeRng(seed, 2 + 2 * (white.length + pink.length));

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
    this.bedLp.connect(bedHp).connect(this.bedSwell).connect(this.bedGain).connect(this.pocket);

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
    this.loop(white, windLoBp); this.loop(white, windHiBp);
    windLoBp.connect(this.windLo).connect(this.windGust);
    windHiBp.connect(this.windHi).connect(this.windGust);
    this.windGust.connect(this.windGain).connect(this.duck);
    this.windLow = ac.createGain(); this.windLow.gain.value = 0;
    const windLp = this.filter("lowpass", 140, 0.6);
    this.loop(pink, windLp);
    windLp.connect(this.windLow).connect(this.windGust);
    this.whistle = ac.createGain(); this.whistle.gain.value = 0;
    const whistleBp = this.filter("bandpass", 1350, 16);
    this.whistleLoop = new LazyLoop(ac, white, whistleBp);
    whistleBp.connect(this.whistle).connect(this.windGust);
    // the high air of the overview: a thin, broad, very quiet wind that only the farthest zoom hears
    this.highAir = ac.createGain(); this.highAir.gain.value = 0;
    const airBp = this.filter("bandpass", 2500, 0.5);
    this.highAirLoop = new LazyLoop(ac, white, airBp);
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

    // ---- the Burn's furnace: a deeper roar of the same fire clips, and the bellows breathing into it
    this.burnBus = ac.createGain(); this.burnBus.gain.value = 0;
    this.burnLp = this.filter("lowpass", 2500, 0.5);
    this.burnPan = ac.createStereoPanner();
    this.burnLp.connect(this.burnPan).connect(this.burnBus).connect(this.out);
    this.bellows = ac.createGain(); this.bellows.gain.value = 0;
    const bellowsBp = this.filter("bandpass", 300, 0.7);
    this.bellowsLoop = new LazyLoop(ac, white, bellowsBp);
    bellowsBp.connect(this.bellows).connect(this.burnLp);

    // ---- the Shipyard: mallets, adzes and a pit saw on oak, a treadwheel crane's groan (by day only)
    this.shipBus = ac.createGain(); this.shipBus.gain.value = 0;
    this.shipLp = this.filter("lowpass", 2500, 0.6);
    this.shipPan = ac.createStereoPanner();
    this.shipLp.connect(this.shipPan).connect(this.shipBus).connect(this.out);

    // ---- rain: the fine hiss of drops on the open sea and a heavier body in a downpour, driven by the gusts;
    // the patter of drops on roofs and quays (clips), louder and brighter near the town; eaves dripping
    const rainIn = ac.createGain();
    this.rainFine = ac.createGain(); this.rainFine.gain.value = 0;
    this.rainBody = ac.createGain(); this.rainBody.gain.value = 0;
    this.rainGust = ac.createGain(); this.rainGust.gain.value = 1;
    // (the fine hiss sits where rain on water does, a 4 kHz band with nothing hissing above 9 kHz: not a white roar)
    rainIn.connect(this.filter("bandpass", 4000, 0.5)).connect(this.filter("lowpass", 9000, 0.7)).connect(this.rainFine).connect(this.rainGust);
    rainIn.connect(this.filter("bandpass", 1500, 0.6)).connect(this.rainBody).connect(this.rainGust);
    this.rainGust.connect(this.duck);
    this.rainLoop = new LazyLoop(ac, white, rainIn);
    this.patterBus = ac.createGain(); this.patterBus.gain.value = 0;
    this.patterLp = this.filter("lowpass", 6000, 0.5);
    this.patterLp.connect(this.patterBus).connect(this.duck);
    this.dripBus = ac.createGain(); this.dripBus.gain.value = 0; this.dripBus.connect(this.out);

    // ---- storm surf: the hiss of spray and whitecaps, thrown up with each break (a 3 kHz band, under the breakers)
    this.spray = ac.createGain(); this.spray.gain.value = 0.06;
    this.sprayBus = ac.createGain(); this.sprayBus.gain.value = 0;
    const sprayBp = this.filter("bandpass", 3000, 0.8);
    this.sprayLoop = new LazyLoop(ac, white, sprayBp);
    sprayBp.connect(this.spray).connect(this.sprayBus).connect(this.duck);

    // ---- the howl of a storm round the buildings: three narrow bands crossfaded by the gusts (a moaning glide
    // without automating a cutoff)
    const howlIn = ac.createGain();
    this.howlBus = ac.createGain(); this.howlBus.gain.value = 0; this.howlBus.connect(this.duck);
    this.howl = [330, 460, 620].map((f) => {
      const g = ac.createGain(); g.gain.value = 0.33;
      howlIn.connect(this.filter("bandpass", f, 9)).connect(g).connect(this.howlBus);
      return g;
    });
    this.howlLoop = new LazyLoop(ac, white, howlIn);

    // ---- thunder (clips placed by the controller after each flash)
    this.thunderBus = ac.createGain(); this.thunderBus.gain.value = 0.9; this.thunderBus.connect(this.out);

    // ---- season colour
    this.birdBus = ac.createGain(); this.birdBus.gain.value = 0; this.birdBus.connect(this.out);
    this.cricketBus = ac.createGain(); this.cricketBus.gain.value = 0; this.cricketBus.connect(this.out);
    this.cicadaBus = ac.createGain(); this.cicadaBus.gain.value = 0; this.cicadaBus.connect(this.out);
    this.rustleBus = ac.createGain(); this.rustleBus.gain.value = 0;
    this.rustleLp = this.filter("lowpass", 9000, 0.5);
    this.rustleLp.connect(this.rustleBus).connect(this.out);
    this.crunchBus = ac.createGain(); this.crunchBus.gain.value = 0; this.crunchBus.connect(this.out);
    this.nightBus = ac.createGain(); this.nightBus.gain.value = 0; this.nightBus.connect(this.out); this.nightBus.connect(this.echo);
    // Wreck Cove: a hollow wind through the hulks' ribs (a narrow band of noise), placed at the cove
    this.ribs = ac.createGain(); this.ribs.gain.value = 0;
    this.ribsPan = ac.createStereoPanner();
    const ribsBp = this.filter("bandpass", 240, 6);
    this.ribsLoop = new LazyLoop(ac, white, ribsBp);
    ribsBp.connect(this.ribs).connect(this.ribsPan).connect(this.duck);
    this.cueBus = ac.createGain(); this.cueBus.gain.value = CUE_GAIN; this.cueBus.connect(this.out);
    // the far event cues (conch, evening gun): soft, through the harbour walls' slap-back
    this.farBus = ac.createGain(); this.farBus.gain.value = FAR_GAIN; this.farBus.connect(this.out); this.farBus.connect(this.echo);
    // ships passing the listener: dry and close
    this.passBus = ac.createGain(); this.passBus.gain.value = PASS_GAIN; this.passBus.connect(this.out);
    // the hour bell: soft and far (dark, through the harbour walls' slap-back), from the town
    const tollBus = ac.createGain(); tollBus.gain.value = 0.07;
    this.tollLp = this.filter("lowpass", 2000, 0.5);
    this.tollLp.connect(tollBus); tollBus.connect(this.out); tollBus.connect(this.echo);

    this.harbourBus = ac.createGain(); this.harbourBus.gain.value = 0; this.harbourBus.connect(this.out);
    this.gullBus = ac.createGain(); this.gullBus.gain.value = 0; this.gullBus.connect(this.out); this.gullBus.connect(this.echo);
    this.bellBus = ac.createGain(); this.bellBus.gain.value = 0.11; this.bellBus.connect(this.out); this.bellBus.connect(this.echo);
    this.hornBus = ac.createGain(); this.hornBus.gain.value = 0.26; this.hornBus.connect(this.out); this.hornBus.connect(this.echo);

    // the composed arrival (E32): a lap first, the first full wash once the on-ramp is up, a gull near 4 s and
    // the bell buoy on the second swell (step()); the beds rise with the on-ramp
    const t = now + 0.3;
    this.born = now;
    this.next = {
      wave: now + 1.5, lap: t, reef: t + 1.5, gull: now + 3.7 + this.rnd() * 0.6, creak: t + 3, tap: t + 1.5, horn: t + 3, gust: t,
      crackle: t, press: t + 0.5, refresh: t + 20,
      rainA: t, rainB: t + 1.7, drip: t + 1, bird: t + 1 + this.rnd() * 3, cricket: t, cicada: t, crunch: t + 4,
      ship: t + 2, groan: t + 6, burn: t, bellows: t + 2,
      owl: t + 20 + this.rnd() * 40, nightjar: t + 10 + this.rnd() * 30,
    };
    const prepare = function* (owner: Ambience): Generator<void> {
      yield* fillNoise(white, "white", noiseRng);
      yield* fillNoise(pink, "pink", noiseRng);
      // Noise preparation may outlast the arrival: start its clock and on-ramp with the beds.
      const start = ac.currentTime, delay = start - owner.born;
      owner.born = start;
      for (const key of Object.keys(owner.next) as Array<keyof typeof owner.next>) owner.next[key] += delay;
      owner.out.gain.setValueAtTime(MASTER * ONRAMP_FLOOR, start);
      owner.out.gain.exponentialRampToValueAtTime(MASTER, start + ONRAMP);
      for (const { source, offset } of owner.loopStarts) source.start(start, offset);
      owner.loopStarts.length = 0;
    };
    this.noiseJob = prepare(this);
    if (this.noiseJob.next().done) this.noiseJob = null;
    if (opts.manual) {
      while (this.noiseJob) if (this.noiseJob.next().done) this.noiseJob = null;
      this.bank.buildAll();
    } else if (!this.paused) {
      this.pump();
      this.timer = window.setInterval(() => this.step(), TICK_MS);
    }
  }

  /** Pause JS work and discard pending event cues; beds and deadlines keep their audio clock. */
  pause(): void {
    this.paused = true;
    this.cancelBeam();
    this.pendingThunder.length = 0;
    this.pending.length = 0;
    this.knell = null;
    this.lastHour = -1;
    clearInterval(this.timer); this.timer = 0;
    this.pumpEpoch++;
    if (this.idle !== null) {
      if (this.idleCallback) cancelIdleCallback(this.idle);
      else clearTimeout(this.idle);
      this.idle = null;
    }
  }

  /** Resume once, preserving partially synthesised clips, deadlines and continuous beds. */
  resume(): void {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    if (this.manual) return;
    this.timer = window.setInterval(() => this.step(), TICK_MS);
    // The 300 ms lookahead still covers the next tick. An extra step at frozen time would advance RNG state.
    this.pump();
  }

  /** Synthesise the bank in idle slices, retaining cancellable handles for both scheduling paths. */
  private pump = (): void => {
    if (this.disposed || this.paused || this.manual || this.idle !== null || (!this.noiseJob && !this.bank.pending)) return;
    const epoch = this.pumpEpoch;
    const ric = globalThis.requestIdleCallback;
    const go = (budget: number) => {
      if (this.disposed || this.paused || epoch !== this.pumpEpoch) return;
      this.idle = null;
      const started = performance.now();
      while (this.noiseJob && performance.now() - started < budget) {
        if (this.noiseJob.next().done) this.noiseJob = null;
      }
      if (this.noiseJob || this.bank.work(Math.max(0, budget - (performance.now() - started)))) {
        this.idleCallback = false;
        this.idle = window.setTimeout(() => {
          if (epoch !== this.pumpEpoch) return;
          this.idle = null;
          this.pump();
        }, 0);
      }
    };
    this.idleCallback = !!ric;
    if (ric) this.idle = ric((d) => go(Math.max(2, Math.min(6, d.timeRemaining()))), { timeout: 250 });
    else this.idle = window.setTimeout(() => go(4), 16);
  };

  private filter(type: BiquadFilterType, f: number, q: number): BiquadFilterNode {
    const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  }

  private loop(buf: AudioBuffer, to: AudioNode): void {
    const s = this.ac.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(to);
    this.loopStarts.push({ source: s, offset: this.rnd() * buf.duration });
    this.sources.push(s);
  }

  /** Play a bank clip into `to` (a one-shot; it ends at exact silence, so no click). */
  private play(kind: ClipKind, at: number, to: AudioNode, level: number, pan = 0, rate = 1): boolean {
    const buf = this.bank.pick(kind, this.rnd);
    if (!buf) return false;      // still being synthesised: the beds carry the scene meanwhile
    // a global cap on the one-shot events: a busy moment never piles up into a wall of clips
    const now = this.ac.currentTime;
    if (this.voices.length >= VOICES) this.voices = this.voices.filter((e) => e > now);
    if (!ALWAYS.has(kind)) {
      if (this.voices.length >= VOICES) return false;
      this.voices.push(at + buf.duration / rate);
    }
    const s = this.ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    // a mono clip holds (L + R) / 2: √2 puts it back at the stereo clip's level through the panner
    const g = this.ac.createGain(); g.gain.value = buf.numberOfChannels === 1 ? level * Math.SQRT2 : level;
    s.connect(g).connect(this.lane(to, pan));
    s.start(at);
    return true;
  }

  /** Five fixed pan lanes per destination: a placed one-shot costs two nodes, not three. */
  private lane(to: AudioNode, pan: number): AudioNode {
    let ls = this.lanes.get(to);
    if (!ls) { ls = []; this.lanes.set(to, ls); }
    const index = Math.max(0, Math.min(4, Math.round((pan + 0.8) / 0.4)));
    let lane = ls[index];
    if (!lane) { lane = this.pan([-0.8, -0.4, 0, 0.4, 0.8][index]); lane.connect(to); ls[index] = lane; }
    return lane;
  }

  /**
   * Steer a level only when its target moved: an idle param stays cheap (no automation to evaluate). The first
   * aim lands at once: the on-ramp is the master's alone, so the arrival's first lap is heard (E32).
   */
  private aim(p: AudioParam, v: number, tc: number): void {
    const was = this.aims.get(p);
    if (was !== undefined && Math.abs(v - was) <= Math.abs(was) * 0.01 + 1e-4) return;
    this.aims.set(p, v);
    p.setTargetAtTime(v, this.ac.currentTime, was === undefined ? 0.05 : tc);
  }

  set(i: Partial<AmbienceInputs>): void {
    Object.assign(this.inputs, i);
    if (this.inputs.reduced) this.cancelBeam();
  }

  /** Scheduler: levels follow the inputs; events are queued a little ahead of the audio clock. */
  step(): void {
    if (this.disposed || this.paused || this.noiseJob) return;
    const ac = this.ac, now = ac.currentTime, ahead = now + 0.3, r = this.rnd;
    this.flushThunder();
    const I = this.inputs, { zoom, wind, fog, night, rain, snow, storm, gust } = I;
    const near = Math.max(0, Math.min(1, 1 - zoom));
    const tc = 0.8;
    const air = (d: number, lo: number, hi: number) => lo * Math.pow(hi / lo, Math.max(0, Math.min(1, d)));
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const s = I.seaAvailable ? clamp01((I.sea[0] - 0.1) / 0.75) : 0;
    const caps = I.seaAvailable ? clamp01(I.sea[2]) : 0;
    const rainKind = rain < 0.3 ? "drizzle" : "rain";
    // the settle: the mix eases down and thins after a few idle minutes; any input brings it back in ~2 s
    const att = clamp01(I.attention), thin = settleRate(att);
    // altitude: from the overview the sea breathes and the quay's detail falls away; a source behind is darker
    const alt = clamp01((zoom - 0.8) / 0.2), point = 1 - 0.5 * alt;
    const behind = (b: number, k: number) => 1 - k * clamp01(b);
    this.aim(this.settle.gain, Math.pow(10, settleDb(att, now, this.breathPhase) / 20), att > 0.99 ? 0.5 : 2);

    // ---- levels: nearer is louder AND brighter; surf follows the sea, independently of DEWS
    this.aim(this.shoreBus.gain, I.seaAvailable ? 0.5 * (0.3 + 0.7 * I.shore) * (1 - 0.3 * zoom) * (1 + 0.5 * s) : 0, tc);
    this.aim(this.shoreLp.frequency, air(I.shore * (1 - 0.4 * zoom), 900, 14000) * behind(I.shoreBack, 0.55), tc);
    this.aim(this.bedGain.gain, I.seaAvailable ? (0.16 + 0.16 * zoom + 0.1 * s) * (1 - 0.5 * I.shore * near) * (1 - 0.2 * I.snowCover) : 0, tc);   // a near wave masks the far sea
    this.aim(this.bedLp.frequency, air(1 - zoom, 420, 900), tc);
    this.aim(this.lapBus.gain, (0.06 + 1.1 * I.harbour * I.harbour) * point, tc);
    // Wreck Cove's hush: the laps there are darker, the gulls keep away, the wind hollows through the ribs
    const cove = clamp01(I.cove);
    this.aim(this.lapLp.frequency, air(I.harbour, 1200, 12000) * (1 - 0.5 * cove), tc);
    this.ribsLoop.update(cove > 0.03, cove < 0.02, now, r);
    this.aim(this.ribs.gain, 0.2 * cove * (0.4 + 0.6 * wind), tc);
    this.aim(this.ribsPan.pan, I.covePan * 0.7, tc);
    this.aim(this.reefBus.gain, I.seaAvailable ? (0.12 + 0.55 * I.reef) * (0.7 + 0.5 * s) * (1 + 0.6 * s) : 0, tc);
    this.aim(this.reefLp.frequency, air(I.reef, 380, 2600) * behind(I.reefBack, 0.4), tc);
    this.aim(this.reefPan.pan, I.reefPan * 0.8, tc);
    this.aim(this.windGain.gain, (0.05 + 0.42 * wind * wind) * (0.7 + 0.3 * zoom), tc);
    this.aim(this.windLow.gain, 0.35 * wind * wind, tc);
    // the rigging sings in a blow, and in any storm from WARNING up
    const blow = Math.max(wind, storm > 0.6 ? 0.45 + 0.45 * storm : 0);
    this.whistleLoop.update(blow > 0.56, blow < 0.55, now, r);
    this.highAirLoop.update(alt > 0.02, alt < 0.01, now, r);
    this.aim(this.highAir.gain, 0.015 * alt, tc);
    this.aim(this.harbourBus.gain, (0.08 + 1.1 * I.harbour * I.harbour) * (1 - 0.3 * snow) * point, tc);
    // gulls shelter from a storm and the rain, and snow softens them
    this.aim(this.gullBus.gain, (0.12 + 0.3 * near) * (1 - 0.8 * night) * (1 - 0.5 * fog) * (1 - 0.7 * storm) * (1 - 0.5 * rain) * (1 - 0.5 * snow) * (1 - 0.7 * cove) * (1 - 0.25 * dayClock(I.hour).hush), tc);
    this.aim(this.fireBus.gain, 0.5 * I.fire * I.fire * point, 0.5);
    this.aim(this.firePan.pan, I.firePan * 0.8, 0.5);
    this.aim(this.mintBus.gain, I.mintAvailable ? 0.16 * I.mint * I.mint * point : 0, 0.5);
    this.aim(this.mintLp.frequency, air(I.mint, 700, 6000) * behind(I.mintBack, 0.5), 0.5);
    this.aim(this.mintPan.pan, I.mintPan * 0.8, 0.5);
    const furnace = I.burn * clamp01(I.burnRate);
    this.aim(this.burnBus.gain, 0.4 * I.burn * furnace * point, 0.8);
    this.aim(this.burnLp.frequency, air(I.burn, 500, 4000) * behind(I.burnBack, 0.5), 0.8);
    this.aim(this.burnPan.pan, I.burnPan * 0.8, 0.8);
    this.bellowsLoop.update(furnace > 0.03, furnace < 0.02, now, r);
    // the yard works by day; the shipwrights down tools in the rain and in a storm, and the yard is shut at night
    const yard = I.ship * (1 - clamp01((night - 0.4) / 0.2)) * (1 - clamp01(rain * 1.5)) * (1 - 0.8 * storm);
    this.aim(this.shipBus.gain, 0.55 * yard * I.ship * point, 0.5);
    this.aim(this.shipLp.frequency, air(I.ship, 600, 5000) * behind(I.shipBack, 0.5), 0.5);
    this.aim(this.shipPan.pan, I.shipPan * 0.8, 0.5);

    // ---- weather (data): snow's hush, rain on the sea and the roofs, drips, spray, the howl
    this.aim(this.hush.gain, -(11 * snow + 4 * I.snowCover), 1.5);
    this.rainLoop.update(rain > 0.01, rain < 0.005, now, r);
    this.aim(this.rainFine.gain, 0.042 * Math.pow(rain, 0.7) * (0.8 + 0.2 * zoom), 1);
    this.aim(this.rainBody.gain, 0.08 * rain * rain, 1);
    this.aim(this.patterBus.gain, (0.25 + 0.75 * I.town) * clamp01(rain * 2.5), 1);
    this.aim(this.patterLp.frequency, air(I.town * (1 - 0.4 * zoom), 2200, 12000) * behind(I.townBack, 0.5), 1);
    this.aim(this.dripBus.gain, 0.5 * I.wet * (1 - snow) * (0.15 + 0.85 * I.town), 1);
    this.sprayLoop.update(caps > 0.01 && !I.lean, caps < 0.005 || I.lean, now, r);
    this.aim(this.sprayBus.gain, 0.4 * caps * caps * (0.3 + 0.7 * I.shore), 1);
    const howl = storm > 0.5 ? Math.pow((storm - 0.5) / 0.5, 1.5) : 0;
    this.howlLoop.update(howl > 0.02 && !I.lean, howl < 0.01 || I.lean, now, r);
    this.aim(this.howlBus.gain, 0.9 * howl * (0.5 + 0.5 * gust) * (0.7 + 0.3 * zoom), 1);

    // ---- season colour (calendar): the weather silences it (no birdsong in a downpour)
    const day = 1 - night;
    const quiet = (1 - clamp01(rain * 1.6)) * (1 - 0.9 * storm) * (1 - snow);
    const cic = cicadaLevel(I.summer, I.hour);
    // the day clock: a fuller dawn chorus in spring and summer (more singers, barely louder), a noon hush
    const clock = dayClock(I.hour), chorus = clock.chorus * clamp01(I.spring + I.summer);
    const birds = (I.spring + 0.5 * I.summer + 0.2 * I.autumn + 0.04 * I.winter) * Math.max(day, 0.8 * chorus) * quiet * birdThinning(cic) * (1 - 0.5 * clock.hush);
    const birdRate = 1 + 1.5 * chorus;
    this.aim(this.birdBus.gain, birds * (0.05 + 0.5 * I.trees) * (1 + 0.25 * chorus), 1);
    // owls in the deep night (any season), a nightjar churring on summer nights; the rain silences them
    const owls = clock.deep * (1 - clamp01(rain * 2)) * (1 - 0.9 * storm);
    const jars = I.summer * clamp01((night - 0.5) / 0.3) * (1 - clamp01(rain * 2)) * (1 - 0.9 * storm);
    this.aim(this.nightBus.gain, (0.03 + 0.25 * I.trees) * point, 1);
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
    if (rain > 0.005) this.need(rainKind);
    if (I.wet > 0.05) this.need("drip");
    if (storm > 0.6) this.need("thunder", "rumble");
    if (birds > 0.01) this.need("bird");
    if (crickets > 0.01) this.need("cricket");
    if (cicadas > 0.01) this.need("cicada");
    if (rustle > 0.01) this.need("rustle");
    if (crunch > 0.01) this.need("crunch");
    if (yard > 0.02) this.need("mallet", "adze", "saw");
    if (owls > 0.01) this.need("owl");
    if (jars > 0.01) this.need("nightjar");
    if (I.clock > 5.5 && I.clock < 22.5) this.need("tolling");

    const N = this.next;
    // ---- the swell: one wave per period, in sets; the shore, the bed, the laps and the bell answer it. A wave
    // whose wash is still being synthesised waits for it (E32), with its laps, bell and bed: never spent unheard
    if (N.wave < ahead) {
      const at = Math.max(N.wave, now);
      if (this.setLeft <= 0 && r() < 0.18 + 0.3 * s) this.setLeft = 3;
      const big = this.setLeft > 0 ? 1.25 : 1;
      // (the arrival's first wash is a full one)
      const size = (this.swells ? 0.55 + 0.45 * r() : 1) * big * (0.85 + 0.3 * s) * (1 + 0.35 * s);
      const deep = 1 - 0.08 * s;      // rough-sea breakers are bigger, slower, deeper
      // the main wash, and often a second one further along the beach
      // (the nearest stretch of beach pulls the main wash to its side of the screen)
      const lean = I.shorePan * 0.6 * I.shore;
      if (!I.seaAvailable || this.play("shore", at, this.shoreLp, 0.9 * size, lean + (r() - 0.5) * (1.2 - 0.6 * I.shore), (0.94 + r() * 0.1) * deep)) {
        this.setLeft--;
        const swell = ++this.swells;
        if (I.seaAvailable && r() < 0.6 + 0.3 * s) this.play("shore", at + 0.8 + r() * 2.4, this.shoreLp, 0.45 * size * (0.6 + 0.4 * r()), r() * 1.6 - 0.8, (0.9 + r() * 0.12) * deep);
        // spray flung off whitecaps
        if (caps > 0) {
          const sg = this.spray.gain;
          sg.setTargetAtTime(0.18 + 0.22 * size, at + 0.8, 0.25);
          sg.setTargetAtTime(0.06, at + 1.8, 1.4);
        }
        // the far bed swells a little ahead of the beach and ebbs after it
        const g = this.bedSwell.gain;
        g.setTargetAtTime(0.65 + 0.55 * size, at, 0.9);
        g.setTargetAtTime(0.45, at + 2.2, 2.2);
        // a cluster of laps as the swell runs through the moorings
        const laps = 2 + Math.floor(r() * 3);
        for (let k = 0; k < laps; k++) this.play("lap", at + 0.9 + k * (0.22 + r() * 0.5), this.lapLp, (0.5 + 0.5 * r()) * size, r() * 1.6 - 0.8, 0.85 + r() * 0.3);
        // the bell buoy rolls with the same swell; the arrival rings it on the second swell
        if (at - this.born < ARRIVAL ? swell === 2 : r() < 0.3 * thin) {
          this.play("bell", at + 1 + r(), this.bellBus, 1, -0.4, 0.99 + r() * 0.02);
          if (r() < 0.35) this.play("bell", at + 2.2 + r() * 0.6, this.bellBus, 0.55, -0.4, 0.99 + r() * 0.02);
        }
        N.wave = at + (6 + r() * 3.5) * (1 - 0.12 * s);
      }
    }
    // stray laps between the swells (the arrival's first sound: one waits for its clip rather than pass unheard)
    if (N.lap < ahead) {
      const at = Math.max(N.lap, now);
      if (this.play("lap", at, this.lapLp, 0.25 + 0.4 * r(), r() * 1.8 - 0.9, 0.8 + r() * 0.4)) N.lap = at + (0.7 + r() * (2.6 - s * 1.2)) / thin;
    }
    if (I.seaAvailable && N.reef < ahead) {
      const at = Math.max(N.reef, now);
      this.play("reef", at, this.reefLp, 0.6 + 0.4 * r(), r() * 0.6 - 0.3, 0.9 + r() * 0.15);
      N.reef = at + 6.5 + r() * 5;
    } else if (!I.seaAvailable) N.reef = Math.max(N.reef, now);
    // gusts: the wind band wanders and swells
    if (N.gust < ahead) {
      const at = Math.max(N.gust, now), d = (1.2 + r() * 2.8) * (1 - 0.35 * gust);
      // with the shared field the swell IS the paw passing over the listener (its shape decorative, its
      // strength the DEWS wind), a small flutter on top; without it, the gusts run free as before
      const paw = I.paw >= 0 ? clamp01(I.paw) : -1;
      const hi = paw < 0 ? Math.min(1, r() * (0.5 + wind * 0.7 + 0.3 * gust)) : Math.min(1, (0.15 + 0.2 * r()) * (0.5 + wind) + paw * (0.3 + 0.6 * wind));
      this.windLo.gain.setTargetAtTime(1 - hi * 0.7, at, d * 0.4);
      this.windHi.gain.setTargetAtTime(hi, at, d * 0.4);
      this.windGust.gain.setTargetAtTime(paw < 0 ? 0.35 + r() * (0.5 + wind * 0.6 + 0.4 * gust) : gustSwell(paw, wind, gust, r()), at, d * 0.35);
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
        this.play(rainKind, at, this.patterLp, 0.9, I.townPan * 0.3 + r() * 0.4 - 0.2, 0.95 + r() * 0.1);
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
        N.bird = at + (1.5 + r() * 5) / (0.4 + Math.min(1, birds)) / birdRate / thin;
      }
    } else N.bird = Math.max(N.bird, now + r() * 2);
    // an owl now and then (about one call in 90 s), sometimes answered from another grove
    if (owls > 0.01) {
      if (N.owl < ahead) {
        const at = Math.max(N.owl, now), pan = I.treesPan * 0.5 + r() * 1.0 - 0.5;
        this.play("owl", at, this.nightBus, 0.8 * owls, pan, 0.96 + r() * 0.08);
        if (r() < 0.3) this.play("owl", at + 4 + r() * 3, this.nightBus, 0.4 * owls, -pan, 1.02 + r() * 0.06);
        N.owl = at + (60 + r() * 60) / thin;
      }
    } else N.owl = Math.max(N.owl, now + 20 + r() * 30);
    if (jars > 0.01) {
      if (N.nightjar < ahead) {
        const at = Math.max(N.nightjar, now);
        this.play("nightjar", at, this.nightBus, 0.7 * jars, I.treesPan * 0.4 + r() * 0.8 - 0.4, 0.97 + r() * 0.06);
        N.nightjar = at + (40 + r() * 80) / thin;
      }
    } else N.nightjar = Math.max(N.nightjar, now + 10 + r() * 20);
    // event clips that waited for their synthesis
    if (this.pending.length) {
      this.pending = this.pending.filter((p) => {
        if (now > p.at + 2) return false;
        return !this.play(p.kind, Math.max(p.at, now + 0.05), this.farBus, p.level, p.pan);
      });
    }
    // the anniversary bell (and a death's bell), once its clips are ready
    if (this.knell) {
      this.need("tolling");
      if (this.play("tolling", now + 0.2, this.tollLp, this.knell.level, this.knell.pan, 0.6)) this.knell = null;
    }
    // the hour bell: one soft strike as the clock enters each hour from 06 to 22 h (three at noon)
    const hf = Math.floor(((I.clock % 24) + 24) % 24);
    if (this.lastHour < 0) this.lastHour = hf;
    else if (hf !== this.lastHour) {
      this.lastHour = hf;
      for (let k = 0, m = hourStrikes(hf); k < m; k++) this.play("tolling", now + 0.2 + k * 3.4, this.tollLp, 1 - 0.5 * storm, I.townPan * 0.6, 0.995 + r() * 0.01);
    }
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
    // the Burn: overlapped fire clips slowed to a deeper roar (5.3 s at 0.75, faded 0.67 s), and a bellows
    // breath every few seconds, quicker as the burn grows
    if (furnace > 0.03) {
      if (N.burn < ahead) {
        const at = Math.max(N.burn, now);
        this.play("crackle", at, this.burnLp, 0.5, r() * 0.3 - 0.15, 0.75);
        N.burn = at + 4.6 + r() * 0.1;
      }
      if (N.bellows < ahead) {
        const at = Math.max(N.bellows, now), g = this.bellows.gain;
        g.setTargetAtTime(0.8 * (0.6 + 0.4 * r()), at, 0.25);
        g.setTargetAtTime(0, at + 0.7, 0.35);
        N.bellows = at + (3 + r() * 2) / (0.7 + 0.6 * clamp01(I.burnRate));
      }
    } else { N.burn = Math.max(N.burn, now); N.bellows = Math.max(N.bellows, now + 1); }
    // the Mint: three presses in a steady rhythm that quickens with the minting
    if (I.mintAvailable && I.mint > 0.03) {
      if (N.press < ahead) {
        const at = Math.max(N.press, now);
        this.play("press", at, this.mintLp, 0.5 + 0.2 * r(), (this.pressN % 3 - 1) * 0.25, 0.92 + (this.pressN % 3) * 0.07);
        this.pressN++;
        N.press = at + (this.pressN % 3 === 0 ? 1.1 : 0.62) / (0.6 + 0.8 * I.mintRate);
      }
    } else { N.press = now; this.pressN = 0; }
    // the Shipyard: runs of two to five strokes at a human (uneven) beat, then a pause; now and then the crane
    if (yard > 0.02) {
      const Y = this.ship;
      if (N.ship < ahead) {
        const at = Math.max(N.ship, now);
        if (Y.left <= 0) {
          const k = r();
          Y.tool = k < 0.5 ? "mallet" : k < 0.8 ? "adze" : "saw";
          Y.left = Y.tool === "saw" ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 4);
          Y.beat = Y.tool === "mallet" ? 0.5 + r() * 0.25 : Y.tool === "adze" ? 0.6 + r() * 0.3 : 1.3 + r() * 0.25;
          Y.at = r() * 0.6 - 0.3;
        }
        const lvl = Y.tool === "mallet" ? 0.7 : Y.tool === "adze" ? 0.45 : 0.35;
        this.play(Y.tool, at, this.shipLp, lvl * (0.8 + 0.4 * r()), I.shipPan * 0.6 + Y.at, 0.95 + r() * 0.1);
        Y.left--;
        N.ship = at + (Y.left > 0 ? Y.beat * (0.82 + 0.36 * r()) : (2 + r() * 5) / thin);
      }
      if (N.groan < ahead) {
        const at = Math.max(N.groan, now);
        this.play("creak", at, this.shipLp, 0.8, I.shipPan * 0.6 + 0.2, 0.62 + r() * 0.1);
        if (r() < 0.5) this.play("creak", at + 1.1 + r() * 0.5, this.shipLp, 0.6, I.shipPan * 0.6 + 0.2, 0.6 + r() * 0.1);
        N.groan = at + (9 + r() * 11) / thin;
      }
    } else { N.ship = Math.max(N.ship, now + 1); N.groan = Math.max(N.groan, now + 4); }
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
      if (this.manual) this.bank.buildAll();
      else if (!busy) this.pump();
      N.refresh = now + 20;
    }
  }

  /** Have a lazy kind ready ahead of a cue the controller knows is coming (e.g. a front's far thunder). */
  prepare(kind: ClipKind): void { if (!this.disposed) this.need(kind); }

  /** Ask the bank for lazy kinds; start synthesising if it was idle. */
  private need(...kinds: ClipKind[]): void {
    const busy = this.bank.pending;
    let added = false;
    for (const k of kinds) added = this.bank.want(k) || added;
    if (!added) return;
    if (this.manual) this.bank.buildAll();
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
    if (this.disposed || this.paused) return;
    const now = this.ac.currentTime;
    this.flushThunder();
    const d = Math.max(0.3, km), reduced = this.inputs.reduced;
    const near = d < 4 && !reduced;
    if (this.pendingThunder.length >= 3) {
      const farthest = this.pendingThunder.filter((e) => !e.near).sort((a, b) => b.at - a.at)[0];
      if (!near || !farthest) return;
      this.pendingThunder.splice(this.pendingThunder.indexOf(farthest), 1);
    }
    const delay = delaySec <= 10 ? Math.max(0.2, delaySec) : Math.min(20, 10 + (delaySec - 10) * 0.3);
    const at = now + delay;
    const strength = 0.35 + 0.65 * Math.max(0, Math.min(1, intensity));
    const lvl = strength * (near ? 0.85 * Math.min(1, Math.sqrt(2.5 / d)) : Math.max(0.6, Math.min(0.9, 6 / d))) * (reduced ? 0.6 : 1);
    const kind = near ? "thunder" : "rumble";
    this.need(kind);
    this.pendingThunder.push({ kind, at, level: lvl, pan, rate: 0.88 + this.rnd() * 0.2, near });
    this.flushThunder();
  }

  private flushThunder(): void {
    const now = this.ac.currentTime;
    this.thunders = this.thunders.filter((t) => t.end > now);
    this.pendingThunder = this.pendingThunder.sort((a, b) => a.at - b.at).filter((event) => {
      if (event.at > now + 0.3) return true;
      if (now > event.at + THUNDER_LATENESS) return false;
      const at = Math.max(now, event.at);
      const end = at + (event.near ? 10 : 16);
      // Reserve only the audible interval, including any roll already scheduled inside the lookahead.
      const times = [at, ...this.thunders.map((t) => t.at).filter((t) => t > at && t < end)];
      if (times.some((t) => this.thunders.filter((s) => s.at <= t && s.end > t).length >= 3)) return false;
      if (!this.play(event.kind, at, this.thunderBus, event.level, event.pan, event.rate)) return true;
      if (event.near) {
        // Duck only for an audible clap, never for a cold or expired request.
        const g = this.duck.gain, k = 1 - 0.55 * event.level;
        g.setTargetAtTime(k, at, 0.02);
        g.setTargetAtTime(1, at + 0.5, 1.2);
      }
      this.thunders.push({ at, end });
      return false;
    });
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

  /**
   * A dead coin's anniversary (deathDate, D11: the Wreck Cove panel says "anniversary today"): one low bronze
   * bell from the cove, the hour bell slowed to 0.6. The controller rings it at most once per visit.
   */
  anniversary(level: number, pan: number): void { this.coveBell(level, pan); }

  /** One low bronze bell from Wreck Cove (an anniversary, or a death staged as a moment). */
  coveBell(level: number, pan: number): void {
    if (this.disposed || this.paused) return;
    this.knell = { level: Math.max(0, Math.min(1, level)), pan };
  }

  /** A launch (staged moment): the bell buoy struck twice, softly, a slow breath apart. */
  launchBell(pan: number): void {
    if (this.disposed || this.paused) return;
    const at = this.ac.currentTime + 0.4, p = Math.max(-0.8, Math.min(0.8, pan));
    this.play("bell", at, this.bellBus, 0.55, p, 1);
    this.play("bell", at + 1.9, this.bellBus, 0.42, p, 0.995);
  }

  /** A far event clip (the conch, the gun) `delay` s from now, once synthesised. */
  private far(kind: ClipKind, delay: number, level: number, pan: number): void {
    if (this.disposed || this.paused) return;
    this.need(kind);
    this.pending.push({ kind, at: this.ac.currentTime + delay, level: Math.max(0, Math.min(1, level)) * settleRate(this.inputs.attention), pan: Math.max(-0.8, Math.min(0.8, pan)) });
  }

  /**
   * A ship under way slides past the listener: her bow wash swept from `pan0` to `pan1` over ~2 s, and her
   * canvas shaking once as she comes abeam. The caller limits the rate; nothing under reduced motion.
   */
  passing(level: number, pan0: number, pan1: number): void {
    if (this.disposed || this.paused || this.inputs.reduced || !(level > 1e-3)) return;
    this.need("swish", "flap");
    const buf = this.bank.pick("swish", this.rnd);
    if (!buf) return;
    const ac = this.ac, at = ac.currentTime + 0.05, lv = Math.min(1, level) * settleRate(this.inputs.attention);
    const c = (p: number) => Math.max(-0.85, Math.min(0.85, p));
    const s = ac.createBufferSource(); s.buffer = buf; s.playbackRate.value = 0.94 + this.rnd() * 0.12;
    const g = ac.createGain(); g.gain.value = lv * (buf.numberOfChannels === 1 ? Math.SQRT2 : 1);
    const p = ac.createStereoPanner();
    p.pan.setValueAtTime(c(pan0), at); p.pan.linearRampToValueAtTime(c(pan1), at + buf.duration);
    s.connect(g).connect(p).connect(this.passBus);
    s.start(at);
    this.play("flap", at + 0.7 + this.rnd() * 0.4, this.passBus, 0.6 * lv, c((pan0 + pan1) / 2), 0.95 + this.rnd() * 0.1);
  }

  /** A titan home at her berth: a soft, distant conch from where she lies. */
  conch(level: number, pan: number): void { this.far("conch", 0.3, level, pan); }

  private music: MusicInput | null = null;
  /**
   * Where the (separately loaded) music joins the mix, with a little of the slap-back; each of its phrases
   * opens the beds' pocket through `pocket(at, span)` (E34).
   */
  musicIn(): MusicInput {
    if (!this.music) {
      this.music = Object.assign(this.ac.createGain(), { pocket: (at: number, span: number) => this.makeRoom(at, span) });
      this.music.connect(this.out);
      const send = this.ac.createGain(); send.gain.value = 0.25;
      this.music.connect(send).connect(this.echo);
    }
    return this.music;
  }

  /** A music phrase from `at` for `span` s: the beds step back POCKET just before it and return after it. */
  private makeRoom(at: number, span: number): void {
    if (this.disposed) return;
    const g = this.pocket.gain;
    g.setTargetAtTime(POCKET, Math.max(this.ac.currentTime, at - 0.5), 0.2);
    g.setTargetAtTime(1, at + span + 0.5, 1.5);
  }

  /** A UI cue: one tiny paper-or-wood sound, centred, dry (no echo, no distance). */
  cue(name: CueName): void {
    if (this.disposed || this.paused) return;
    if (name === "evening-gun") { this.far("gun", EVENING_GUN_DELAY, 1 - 0.5 * this.inputs.storm, this.inputs.firePan * 0.4); return; }
    const kind = CUE_KIND[name];
    if (kind) this.play(kind, this.ac.currentTime + 0.01, this.cueBus, 1, 0, 0.97 + this.rnd() * 0.06);
  }

  /**
   * The beam passes over the listener: one breath of the Pharos (E33), an open fifth in the harbour's key, D3 A3
   * D4 A4 (no pitch follows the score; two thirds of its energy in the upper octave, which small speakers carry),
   * swelling in and dying away within 0.8 of the sweep `period`: one breath at a time however fast the beam
   * turns. Dry, unlike the harbour's far calls: on a held tone the walls' 0.31 s slap-back is only a comb that
   * would hollow out the fifth. `at` is the audio time of the crossing the Feeder foresaw.
   */
  beamPass(peak: number, pan = 0, period = 12, at = this.ac.currentTime + 0.05): void {
    if (this.disposed || this.paused || this.inputs.reduced || !(peak > 1e-4)) return;
    const ac = this.ac, start = Math.max(at, ac.currentTime);
    if (start < this.breathEnd) return;
    const len = Math.min(BREATH_SEC, 0.8 * period);
    this.breathEnd = start + len;
    const g = this.env(start, 0.25 * len, 0.07 * len, 0.68 * len, Math.min(BREATH_PEAK, peak) * settleRate(this.inputs.attention));
    const p = this.pan(Math.max(-0.6, Math.min(0.6, pan)));
    const gate = ac.createGain(); gate.gain.value = 1;
    this.breaths = this.breaths.filter((b) => b.end > ac.currentTime);
    this.breaths.push({ gate, end: this.breathEnd });
    g.connect(p).connect(gate).connect(this.out);
    for (const [f, a] of BREATH) {
      const o = ac.createOscillator(); o.frequency.value = f * (0.999 + this.rnd() * 0.002);
      const og = ac.createGain(); og.gain.value = a;
      o.connect(og).connect(g);
      o.start(start); o.stop(start + len + 0.1);
    }
  }

  /** A separate envelope releases even a future breath without disturbing its scheduled attack. */
  cancelBeam(): void {
    if (!this.breaths.length) return;
    const now = this.ac.currentTime;
    for (const { gate } of this.breaths) {
      gate.gain.setValueAtTime(1, now);
      gate.gain.linearRampToValueAtTime(0, now + 0.03);
    }
    this.breaths.length = 0;
    this.breathEnd = now + 0.03;
  }

  /** Release PCM, timers and context once. Toggle-off fades; teardown can interrupt that fade immediately. */
  dispose(fade = true): Promise<void> {
    if (this.disposal) {
      if (!fade) this.finishFade?.();
      return this.disposal;
    }
    this.disposed = true;
    this.pause();
    this.bank.dispose();
    this.noiseJob = null;
    this.loopStarts.length = 0;
    this.disposal = this.release(fade);
    return this.disposal;
  }

  private async release(fade: boolean): Promise<void> {
    if (fade && this.ac.state === "running") {
      const now = this.ac.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(this.out.gain.value, now);
      this.out.gain.linearRampToValueAtTime(0, now + 0.6);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => this.finishFade?.(), 680);
        this.finishFade = () => { clearTimeout(timer); this.finishFade = null; resolve(); };
      });
    }
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect(); s.buffer = null;
    }
    this.sources.length = 0;
    this.whistleLoop.dispose();
    for (const l of [this.ribsLoop, this.bellowsLoop, this.highAirLoop, this.rainLoop, this.sprayLoop, this.howlLoop]) l.dispose();
    this.lanes.clear(); this.aims.clear(); this.thunders.length = 0;
    this.out.disconnect();
    if ("close" in this.ac) await (this.ac as AudioContext).close().catch(() => undefined);
  }
}

/**
 * The offline mix gate's scenes. scripts/audio/mix-report.mjs imports this module into a page of a running dev
 * server, so every scene renders the REAL ambience and music graphs (src/harbour/audio) in an
 * OfflineAudioContext: the ambience is seeded, fed the inputs the Feeder reads at the home view, and stepped on
 * the render clock exactly as its own timer and the controller's feed would (a step every 120 ms, a feed every
 * 250 ms). Weather follows the director's DEWS targets, lightning its strike law, the beam its sweep; the music
 * runs its own scheduler on the same clock. Nothing reaches a speaker: an offline render has no output device.
 *
 * Browser-only (Web Audio); the meters live in Node (scripts/audio/loudness.mts).
 */

import { Ambience, NEUTRAL_SEA, type AmbienceInputs } from "../../src/harbour/audio/ambience";
import { ClipBank } from "../../src/harbour/audio/bank";
import { makeRng, type ClipKind } from "../../src/harbour/audio/dsp";
import { beamBreathPeak, weatherInputs } from "../../src/harbour/audio/feed";
import { daySeed, Music } from "../../src/harbour/audio/music";
import { SEA_STATES } from "../../src/harbour/ocean/waves";
import { showerEnvelope, targetsForLevel } from "../../src/harbour/weather/director";
import { gust } from "../../src/harbour/weather/gust";

export const SR = 48000;
/** One seed for every scene: the same clip variants, and a settle breath that averages 0.0 dB over 40 s. */
export const SEED = 150;
/** The music's day (the piece is seeded by the calendar date). */
const MUSIC_DAY = new Date(2026, 10, 9);

/**
 * The home view's placed sources as the real Feeder read them on v1.6.0 (shot.mjs --eval at ?t=11): an
 * autumn noon over the harbour, the shore at hand, the Mint and the Burn faint across the water.
 */
const HOME: Partial<AmbienceInputs> = {
  zoom: 0.727, shore: 1, shorePan: -0.026, shoreBack: 0.32, harbour: 0.65, reef: 0.111, reefPan: -0.398, reefBack: 0,
  fire: 0.032, firePan: -0.23, mint: 0.054, mintPan: 0.461, mintBack: 0, mintRate: 0.505, mintAvailable: true,
  burn: 0.048, burnPan: -0.177, burnBack: 0, burnRate: 0.482, cove: 0.154, covePan: -0.807, ship: 0.055, shipPan: -0.573, shipBack: 0,
  town: 0.575, townPan: -0.204, townBack: 0.543, land: 0.4, trees: 0.727, treesPan: -0.398,
  spring: 0, summer: 0, autumn: 1, winter: 0, snowCover: 0, hour: 11.5, clock: 11, night: 0, fog: 0,
  reduced: false, lean: false, attention: 1,
};
/** The listener (ground x, z) and the gust field's downwind direction and clock at that capture. */
const EAR = [75.586, 86.906] as const, DOWNWIND = [0.887, -0.461] as const, GUST_T0 = 9.081;
/** The Pharos at that capture: BEDROCK, reach .763; the first time its sweep crosses the listener. */
const REACH = 0.763, BEDROCK = 12;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sea = (step: number): AmbienceInputs["sea"] => { const s = SEA_STATES[step]; return [s.amp, s.chop, s.caps, s.bands]; };

/** The weather service's state at DEWS `level`, `t` s into the scene, through the Feeder's own mapping. */
function dews(level: number, t: number, showers = true): Partial<AmbienceInputs> {
  const w = targetsForLevel(level);
  const rain = showers ? clamp01(w.steady + w.shower * showerEnvelope(t, w.showerOn)) : w.steady;
  return weatherInputs({ state: { level, wind: w.wind, rain, snow: 0, wetness: clamp01(rain * 1.6) }, precip: { rain, snow: 0 } }, { weights: [0, 0, 1, 0], snowCover: 0 }, w.wind, 0);
}

interface Breath { period: number; reach: number; first: number }
interface Scene {
  seconds: number;
  /** false: a silent ambience (never stepped) carries only the music or the breath through the master chain */
  stepped: boolean;
  inputs(t: number): Partial<AmbienceInputs>;
  /** DEWS level of the lightning (its strike rate and distances) */
  lightning?: number;
  /** Forced strikes replace the random lightning schedule for a reproducible peak case. */
  strikes?: Array<{ t: number; km: number; intensity: number; pan: number }>;
  breath?: Breath;
  music?: boolean;
  /** Record every clip the scheduler plays, including failed attempts. */
  log?: boolean;
}

const day = (level: number, step: number, showers = true) => (t: number): Partial<AmbienceInputs> => ({
  ...HOME, ...dews(level, t, showers), sea: sea(step), seaAvailable: true,
  paw: gust(EAR[0], EAR[1], GUST_T0 + t, DOWNWIND[0], DOWNWIND[1]),
});
const beam: Breath = { period: BEDROCK, reach: REACH, first: 2.5 };
const silent = () => ({ ...HOME });

export const SCENES: Record<string, Scene> = {
  first10s: { seconds: 10, stepped: true, inputs: day(0, 0), breath: beam, log: true },
  calm: { seconds: 40, stepped: true, inputs: day(0, 0), breath: beam },
  // Watch between its brief showers: the wind up a step, no rain
  breeze: { seconds: 40, stepped: true, inputs: day(1, 0, false), breath: beam },
  warning: { seconds: 40, stepped: true, inputs: day(3, 0), lightning: 3, breath: beam },
  storm: { seconds: 40, stepped: true, inputs: day(4, 0), lightning: 4, breath: beam },
  // the roughest sea state (≥ 10 % of supply off peg) under a calm sky, then under a Danger storm: the loudest
  // the harbour can be
  rough: { seconds: 40, stepped: true, inputs: day(0, 3), breath: beam },
  "storm-rough": { seconds: 40, stepped: true, inputs: day(4, 3), lightning: 4, breath: beam },
  "storm-near": { seconds: 40, stepped: true, inputs: day(4, 3), strikes: [{ t: 12, km: 2, intensity: 1, pan: 0 }], breath: beam, log: true },
  // stale data: the fog and the foghorn; no analytical surf, no Mint, no breath (the PSI reading is stale too)
  stale: {
    seconds: 40, stepped: true, inputs: (t) => ({ ...day(0, 0)(t), ...weatherInputs(undefined, { weights: [0, 0, 1, 0] }, 0.3, 0), fog: 1, sea: NEUTRAL_SEA, seaAvailable: false, mintAvailable: false, burnRate: 0 }),
  },
  night: { seconds: 40, stepped: true, inputs: (t) => ({ ...day(0, 0)(t), night: 1, hour: 23, clock: 23 }), breath: beam },
  "music-on": { seconds: 40, stepped: true, inputs: day(0, 0), breath: beam, music: true },
  "music-alone": { seconds: 240, stepped: false, inputs: silent, music: true },
  "breath-12": { seconds: 40, stepped: false, inputs: () => ({ ...silent(), night: 1 }), breath: { period: 12, reach: REACH, first: 3.5 } },
  "breath-4": { seconds: 20, stepped: false, inputs: () => ({ ...silent(), night: 1 }), breath: { period: 4, reach: REACH, first: 3.5 } },
  "breath-2.5": { seconds: 20, stepped: false, inputs: () => ({ ...silent(), night: 1 }), breath: { period: 2.5, reach: REACH, first: 3.5 } },
  "breath-1.2": { seconds: 16, stepped: false, inputs: () => ({ ...silent(), night: 1 }), breath: { period: 1.2, reach: REACH, first: 3.5 } },
};

/** Lightning as the weather's Lightning draws it at that DEWS level: Poisson-ish, never closer than 3.5 s. */
function strikes(level: number, seconds: number): Array<{ t: number; km: number; intensity: number; pan: number }> {
  const w = targetsForLevel(level), R = makeRng(SEED ^ 0x7a11), out = [];
  if (!(w.strikesPerMin > 0.05)) return [];
  const mean = 60 / w.strikesPerMin;
  for (let t = 3; t < seconds; t += Math.max(3.5, -Math.log(1 - R() * 0.95) * mean)) {
    const th = (R() * 2 - 1) * (25 * Math.PI) / 180;
    const km = w.strikeKm[0] + (w.strikeKm[1] - w.strikeKm[0]) * R();
    out.push({ t, km, intensity: 0.45 + 0.55 * (1 - clamp01((km - 2) / 16)), pan: Math.sin(th) * 0.8 });
  }
  return out;
}

/** Run `fn` when the render reaches `t` (quantised to a render quantum; several jobs may share one suspend). */
function at(ac: OfflineAudioContext, jobs: Map<number, Array<() => void>>, t: number, fn: () => void): void {
  const frame = Math.round((t * ac.sampleRate) / 128) * 128;
  if (frame <= 0 || frame >= ac.length) return;
  let list = jobs.get(frame);
  if (!list) { list = []; jobs.set(frame, list); void ac.suspend(frame / ac.sampleRate).then(() => { for (const f of list!) f(); return ac.resume(); }); }
  list.push(fn);
}

export interface Rendered {
  sr: number;
  length: number;
  log: Array<{ kind: string; at: number; ok: boolean; level: number }>;
  breaths: number[];
  strikes: Array<{ t: number; km: number; intensity: number }>;
  phrases: number[];
}
const renders = new Map<string, Float32Array[]>();

/**
 * Render one scene; its PCM stays here until free(), read back in chunks. `mute` (a tuning diagnostic) names
 * ambience nodes to disconnect, e.g. ["windGain", "howlBus"], to hear what a mix is without them.
 */
export async function render(name: string, mute: readonly string[] = []): Promise<Rendered> {
  const S = SCENES[name];
  if (!S) throw new Error(`unknown scene ${name}`);
  const ac = new OfflineAudioContext(2, Math.round(S.seconds * SR), SR);
  const amb = new Ambience(ac, { manual: true, seed: SEED });
  for (const k of mute) (amb as unknown as Record<string, AudioNode | undefined>)[k]?.disconnect();
  const out: Rendered = { sr: SR, length: ac.length, log: [], breaths: [], strikes: [], phrases: [] };
  if (S.log) {
    const g = amb as unknown as { play(kind: ClipKind, at: number, to: AudioNode, level: number, pan?: number, rate?: number): boolean };
    const play = g.play.bind(amb);
    g.play = (kind, t, to, level, pan, rate) => { const ok = play(kind, t, to, level, pan, rate); out.log.push({ kind, at: t, ok, level }); return ok; };
  }
  const jobs = new Map<number, Array<() => void>>();
  let I = S.inputs(0);
  amb.set(I);
  // the music runs its own 250 ms scheduler; its wall-clock timer would fire at arbitrary render times, so it is
  // paused and its (private) step driven on the render clock instead
  let music: Music | null = null, stepMusic = () => {};
  if (S.music) {
    music = new Music(ac, amb.musicIn(), daySeed(MUSIC_DAY));
    music.pause();
    const m = music as unknown as { step(): void; voice(e: unknown, at: number): void };
    const voice = m.voice.bind(music);
    m.voice = (e, t) => { if (!out.phrases.includes(t)) out.phrases.push(t); voice(e, t); };
    stepMusic = m.step.bind(music);
  }
  // the controller's feed, four times a second (the music hears the light and the weather)
  for (let t = 0.25; t < S.seconds; t += 0.25) {
    at(ac, jobs, t, () => {
      I = S.inputs(t);
      if (S.stepped) amb.set(I);
      music?.set({ night: I.night ?? 0, storm: I.storm ?? 0, rain: I.rain ?? 0, attention: I.attention ?? 1 });
      stepMusic();
    });
  }
  // the ambience's own scheduler, every 120 ms from its construction
  if (S.stepped) for (let t = 0.12; t < S.seconds; t += 0.12) at(ac, jobs, t, () => amb.step());
  for (const s of S.strikes ?? (S.lightning != null ? strikes(S.lightning, S.seconds) : [])) {
    out.strikes.push({ t: s.t, km: s.km, intensity: s.intensity });
    at(ac, jobs, s.t, () => amb.thunder(s.km, s.intensity, s.pan, (s.km * 1000) / 343));
  }
  if (S.breath) {
    const B = S.breath;
    for (let t = B.first; t < S.seconds; t += B.period) {
      out.breaths.push(t);
      // the Feeder's mapping of the beam's reach, the night and the stale fog; heard from the fire's side
      at(ac, jobs, t - 0.05, () => amb.beamPass(beamBreathPeak(B.reach, true, I.night ?? 0, I.fog ?? 0), (I.firePan ?? 0) * 0.5, B.period, t));
    }
  }
  const buf = await ac.startRendering();
  renders.set(name, [buf.getChannelData(0), buf.getChannelData(1)]);
  await music?.dispose(false);
  await amb.dispose(false);
  return out;
}

/** `count` samples of channel `ch` from `start`, as base64 little-endian float32. */
export async function chunk(name: string, ch: number, start: number, count: number): Promise<string> {
  const pcm = renders.get(name)?.[ch]?.subarray(start, start + count);
  if (!pcm) throw new Error(`no render ${name}`);
  const url = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(new Blob([new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength).slice()]));
  });
  return url.slice(url.indexOf(",") + 1);
}

export function free(name: string): void { renders.delete(name); }

/**
 * How soon the clip bank has its first clips (the on-ramp): main-thread synthesis milliseconds until the first
 * lap, the first shore wash and every first-queue kind are ready, in 4 ms slices as the idle pump spends them.
 */
export function bankTiming(): Record<string, number> {
  const bank = new ClipBank(new OfflineAudioContext(2, 128, SR), SEED);
  const want: ClipKind[] = ["lap", "shore", "reef", "halyard", "gull", "creak", "bell", "crackle", "press"];
  const ready: Record<string, number> = {};
  let spent = 0, slices = 0;
  while (bank.pending && Object.keys(ready).length < want.length) {
    const t0 = performance.now();
    bank.work(4);
    spent += performance.now() - t0; slices++;
    for (const k of want) if (ready[k] === undefined && bank.pick(k, () => 0)) ready[k] = Math.round(spent * 10) / 10;
  }
  return { ...ready, slices };
}

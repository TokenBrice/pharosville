/**
 * The engine proper: one graph, the bed, the borrowed far sounds, the music
 * and the beats, advanced by `tick`. The same engine runs live (a 4 Hz timer)
 * and offline (the recorder steps it before rendering), so what the harness
 * measures is what plays.
 */
import { gardenGustAtWorldPosition, writeWeatherPlan, type WeatherPlan } from "../../systems/weather";
import { createGardenBed, nearDetailForEyeHeight, type BedFrame, type StemTargetSink } from "./bed";
import { playGardenBeat, type GardenSoundBeat } from "./beats";
import { createGardenBorrowed, playBorrowedSound, type BorrowedFrame, type BorrowedSound } from "./borrowed";
import { applyMixOverrides, createAudioGraph, type AudioGraph } from "./graph";
import { createGardenMusic, type MusicFrame } from "./music";
import { AUDIO_MASTER, AUDIO_MIX, AUDIO_STEMS, dbToGain, stemLevelDb, type AudioMixOverrides, type AudioStemName } from "./mix";
import type { AudioSceneSnapshot } from "./scene-snapshot";

/** The engine's 4 Hz parameter tick and how far ahead each tick lands. */
export const AUDIO_TICK_SECONDS = 0.25;
export const AUDIO_LOOKAHEAD_SECONDS = 0.35;

/** What the stems were asked to do: mean power for beds, the loudest intended peak for events. */
export interface StemTargetLog {
  power: Record<AudioStemName, number>;
  samples: Record<AudioStemName, number>;
  peak: Record<AudioStemName, number>;
}

export interface GardenAudioEngine {
  graph: AudioGraph;
  overrides: AudioMixOverrides;
  targets: StemTargetLog | null;
  /**
   * Advance to context time `at`, whose render-clock reading is `renderSeconds`
   * and director-clock reading `directorSeconds` (NaN: no director, no far sounds).
   */
  tick: (at: number, renderSeconds: number, minute: number, directorSeconds: number) => void;
  setMusic: (on: boolean, at: number) => void;
  /** X8 listening pose: lean in (near −2 dB, far +2 dB) or back out, slowly. */
  setListening: (on: boolean, at: number) => void;
  playBeat: (beat: GardenSoundBeat, at: number, pan: number) => boolean;
  /** One far sound now, outside the director (the recorder's audition only). */
  playBorrowed: (sound: BorrowedSound, at: number, seed: number) => boolean;
  /** Drop scheduled-event cursors after a suspend: no backlog of missed sounds. */
  resetEvents: () => void;
}

export function createGardenAudioEngine(
  ctx: BaseAudioContext,
  snapshot: Readonly<AudioSceneSnapshot>,
  options: { music: boolean; overrides: AudioMixOverrides; firstPhraseAt: number; firstBorrowedAt: number; logTargets: boolean },
): GardenAudioEngine {
  const graph = createAudioGraph(ctx);
  applyMixOverrides(graph, options.overrides, null);
  const bed = createGardenBed(graph);
  const music = createGardenMusic(graph, options.firstPhraseAt);
  const borrowed = createGardenBorrowed(graph, options.firstBorrowedAt);
  const borrowedFrame: BorrowedFrame = { at: 0, sea: 0, director: null, directorSeconds: Number.NaN };
  const weather: WeatherPlan = { wind: { x: 1, y: 0, speed: 0, gust: 0 }, breath: 0, stormLevel: 0, lightning: 0 };
  let musicOn = options.music;
  const targets: StemTargetLog | null = options.logTargets ? createTargetLog() : null;
  const sink: StemTargetSink | null = targets
    ? (stem, db) => {
      if (AUDIO_MIX[stem].measure === "rms") {
        targets.power[stem] += dbToGain(db) ** 2;
        targets.samples[stem] += 1;
      } else {
        targets.peak[stem] = Math.max(targets.peak[stem], db);
      }
    }
    : null;
  const bedFrame: BedFrame = {
    at: 0,
    breathTime: 0,
    still: false,
    sea: 0,
    near: 1,
    beaconPresence: 0,
    beamFacing: -1,
    windSpeed: 0,
    gustLeft: 0,
    gustRight: 0,
  };
  const musicFrame: MusicFrame = {
    at: 0,
    breathTime: 0,
    enabled: musicOn,
    ritual: false,
    hour: 12,
    stormLevel: 0,
    beaconPresence: 0,
    minute: 0,
  };

  return {
    graph,
    overrides: options.overrides,
    targets,
    tick(at, renderSeconds, minute, directorSeconds) {
      const still = snapshot.reducedMotion;
      const renderTime = still ? 0 : renderSeconds;
      // The one wind, re-derived from the renderer's own inputs by the same pure function.
      writeWeatherPlan({
        timeSeconds: renderTime,
        wallClockHour: snapshot.hour,
        reducedMotion: still,
        psiStress: snapshot.psiStress,
        baseWind: snapshot.baseWind,
      }, weather);
      // Under Still the picture holds, but the sea keeps breathing (shallower) on the audio clock.
      const breathTime = still ? at : renderTime;
      const reach = snapshot.halfWidth;
      bedFrame.at = at;
      bedFrame.breathTime = breathTime;
      bedFrame.still = still;
      bedFrame.sea = Math.min(1, Math.max(0, (snapshot.swell - 0.12) / 0.8));
      bedFrame.near = nearDetailForEyeHeight(snapshot.eyeHeight);
      bedFrame.beaconPresence = snapshot.beaconPresence;
      bedFrame.beamFacing = snapshot.beamFacing;
      bedFrame.windSpeed = weather.wind.speed;
      bedFrame.gustLeft = gardenGustAtWorldPosition(renderTime, snapshot.targetX - snapshot.rightX * reach, snapshot.targetZ - snapshot.rightZ * reach, weather, still);
      bedFrame.gustRight = gardenGustAtWorldPosition(renderTime, snapshot.targetX + snapshot.rightX * reach, snapshot.targetZ + snapshot.rightZ * reach, weather, still);
      bed.update(bedFrame, sink);

      borrowedFrame.at = at;
      borrowedFrame.sea = bedFrame.sea;
      borrowedFrame.director = snapshot.director;
      borrowedFrame.directorSeconds = directorSeconds;
      borrowed.update(borrowedFrame, sink);

      musicFrame.at = at;
      musicFrame.breathTime = breathTime;
      musicFrame.enabled = musicOn;
      musicFrame.ritual = snapshot.ritual;
      musicFrame.hour = snapshot.hour;
      musicFrame.stormLevel = weather.stormLevel;
      musicFrame.beaconPresence = snapshot.beaconPresence;
      musicFrame.minute = minute;
      music.update(musicFrame, sink);

      applyMixOverrides(graph, options.overrides, at);
    },
    setMusic(on, at) {
      if (on && !musicOn) music.deferTo(at + 10 + Math.random() * 10);
      musicOn = on;
    },
    setListening(on, at) {
      const { nearDb, farDb, inSeconds, outSeconds } = AUDIO_MASTER.listen;
      // Five time constants: the lean is ~99 % there after `inSeconds` / `outSeconds`.
      const tau = (on ? inSeconds : outSeconds) / 5;
      graph.nearLean.gain.setTargetAtTime(on ? dbToGain(nearDb) : 1, at, tau);
      graph.farLean.gain.setTargetAtTime(on ? dbToGain(farDb) : 1, at, tau);
    },
    playBeat(beat, at, pan) {
      return playGardenBeat(graph, beat, at, pan, sink);
    },
    playBorrowed(sound, at, seed) {
      return playBorrowedSound(graph, sound, at, stemLevelDb("borrowed", bedFrame.sea), seed, sink);
    },
    resetEvents() {
      bed.resetEvents();
    },
  };
}

function createTargetLog(): StemTargetLog {
  const power = {} as Record<AudioStemName, number>;
  const samples = {} as Record<AudioStemName, number>;
  const peak = {} as Record<AudioStemName, number>;
  for (const stem of AUDIO_STEMS) {
    power[stem] = 0;
    samples[stem] = 0;
    peak[stem] = Number.NEGATIVE_INFINITY;
  }
  return { power, samples, peak };
}

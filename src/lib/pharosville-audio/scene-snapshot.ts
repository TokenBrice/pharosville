/**
 * W7.2 (sound-1): the one allocation-free struct the renderer writes for the
 * sound engine. The renderer writes it once per drawn frame (a handful of
 * scalar stores, ≪ 0.003 ms); the lazy audio chunk reads it on its own 4 Hz
 * tick and never touches React state or the frame path.
 *
 * This module is deliberately dependency-free and three-free: it is imported
 * by both the world chunk (the consent hook hands it to the engine) and the
 * renderer chunk (the writer), so it lives in the world chunk and the audio
 * chunk only ever receives it by reference.
 */
import type { GardenDirectorState } from "../../systems/garden-director";

export interface AudioSceneSnapshot {
  /** Frames written so far; 0 until the renderer has drawn once. */
  frames: number;
  /** `performance.now()` at the last write: lets the engine extrapolate the render clock. */
  wallMs: number;
  /** The renderer's breath clock (`frame.timeSeconds`; 0 under reduced motion). */
  timeSeconds: number;
  reducedMotion: boolean;
  /** Local wall-clock hour the frame was lit for. */
  hour: number;
  /** How much the beacon owns the scene: the night beat plus half the blue hour. */
  beaconPresence: number;
  /** `seaState.swell` — the ledger's "Sea state" (DEWS threat + PSI stress). */
  swell: number;
  /** `seaState.source.psiStress`, which also sets the beacon's sweep tempo. */
  psiStress: number;
  /**
   * `seaState.wind`, the sustained base the weather plan builds on. The engine
   * re-derives the one wind, gust and storm from these inputs with the same
   * pure `writeWeatherPlan`, so sound and picture share one clock without the
   * renderer handing over its plan.
   */
  baseWind: number;
  /** A director foreground beat (arrival, keeper, almanac…) owns the harbour. */
  ritual: boolean;
  /**
   * X8: the frame's director (a reference store, no copy) and its clock, so a
   * borrowed far sound asks the one director for an environment slot like any
   * other background cue. Null until the renderer has drawn with one.
   */
  director: GardenDirectorState | null;
  directorSeconds: number;
  /** Eye height above the water: low at the rest seat, high over the chart. */
  eyeHeight: number;
  /** View target and the screen-right unit vector in world XZ, for gust travel. */
  targetX: number;
  targetZ: number;
  rightX: number;
  rightZ: number;
  /** Half the visible width at the target, world units. */
  halfWidth: number;
  /** cos(angle between the beam and the bearing from the beacon to the eye), −1…1. */
  beamFacing: number;
}

export const audioSceneSnapshot: AudioSceneSnapshot = {
  frames: 0,
  wallMs: 0,
  timeSeconds: 0,
  reducedMotion: false,
  hour: 12,
  beaconPresence: 0,
  swell: 0,
  psiStress: 0,
  baseWind: 0,
  ritual: false,
  director: null,
  directorSeconds: 0,
  eyeHeight: 16,
  targetX: 0,
  targetZ: 0,
  rightX: 1,
  rightZ: 0,
  halfWidth: 40,
  beamFacing: -1,
};

/** Per-frame clock and sea half: called beside the renderer's own weather plan. */
export function writeAudioSceneFrame(
  frame: {
    timeSeconds: number;
    reducedMotion: boolean;
    wallClockHour: number;
    seaState: { swell: number; wind: number; source: { psiStress: number } };
    gardenDirector?: GardenDirectorState | undefined;
    epochSeconds?: number | undefined;
  },
  beats: { night: number; blue: number },
): void {
  const out = audioSceneSnapshot;
  out.frames += 1;
  out.wallMs = performance.now();
  out.timeSeconds = frame.reducedMotion ? 0 : frame.timeSeconds;
  out.reducedMotion = frame.reducedMotion;
  out.hour = frame.wallClockHour;
  out.beaconPresence = beats.night + 0.5 * beats.blue;
  out.swell = frame.seaState.swell;
  out.psiStress = frame.seaState.source.psiStress;
  out.baseWind = frame.seaState.wind;
  out.ritual = frame.gardenDirector?.active?.foreground === true;
  out.director = frame.gardenDirector ?? null;
  out.directorSeconds = frame.epochSeconds ?? frame.timeSeconds;
}

/**
 * Per-frame view half: called once the beam bearing is final. `right` is the
 * camera's world-space x axis (matrixWorld column 0); the beam points along
 * (cos b, −sin b) in world XZ, the same convention the water's beam road uses.
 */
export function writeAudioSceneView(
  eye: { x: number; y: number; z: number },
  rightX: number,
  rightZ: number,
  target: { x: number; z: number },
  halfWidth: number,
  beaconX: number,
  beaconZ: number,
  beamBearing: number,
  waterY: number,
): void {
  const out = audioSceneSnapshot;
  out.eyeHeight = eye.y - waterY;
  out.targetX = target.x;
  out.targetZ = target.z;
  const rightLength = Math.hypot(rightX, rightZ) || 1;
  out.rightX = rightX / rightLength;
  out.rightZ = rightZ / rightLength;
  out.halfWidth = halfWidth;
  const toEyeX = eye.x - beaconX;
  const toEyeZ = eye.z - beaconZ;
  const toEyeLength = Math.hypot(toEyeX, toEyeZ) || 1;
  out.beamFacing = (Math.cos(beamBearing) * toEyeX - Math.sin(beamBearing) * toEyeZ) / toEyeLength;
}

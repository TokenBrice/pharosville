import type { ShipWaterZone } from "../systems/world-types";
import { GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z } from "../systems/weather";
import {
  GARDEN_WATER_GERSTNER,
  GARDEN_WATER_MAX_DISPLACEMENT,
  GERSTNER_BASE_BEARING,
} from "./garden-water";

/**
 * W4.F10 — the swell passes through (fleet-motion-2).
 *
 * Every hull reads the water's own Gerstner field at its position, with the
 * same phase time, wind rotation and master amplitude the water shader uses
 * (`garden-water.ts`), so neighbours nod in sequence as each crest rolls
 * through the anchorage along the wind. The response is stylised in size (the
 * rendered sea moves 0.02–0.04 u, which would be a 0.1° slope) but true in
 * phase: pitch follows the slope along the keel, roll the slope across it.
 *
 * Cost: one per-frame `prepareGardenHullSwell` (seven directions) and seven
 * sine/cosine pairs per hull; allocation-free.
 */

const COMPONENT_COUNT = GARDEN_WATER_GERSTNER.length;
const componentK = new Float64Array(COMPONENT_COUNT);
const componentDirX = new Float64Array(COMPONENT_COUNT);
const componentDirY = new Float64Array(COMPONENT_COUNT);
const sourceDirX = new Float64Array(COMPONENT_COUNT);
const sourceDirY = new Float64Array(COMPONENT_COUNT);
let gradientRms = 0;
for (let index = 0; index < COMPONENT_COUNT; index += 1) {
  const component = GARDEN_WATER_GERSTNER[index]!;
  const angle = GERSTNER_BASE_BEARING + component.dirOffset;
  sourceDirX[index] = Math.cos(angle);
  sourceDirY[index] = Math.sin(angle);
  componentK[index] = (Math.PI * 2) / component.wavelength;
  gradientRms += (component.amplitude * componentK[index]!) ** 2 / 2;
}
/** RMS height slope of the unit-amplitude spectrum: the pose's unit of slope. */
const GRADIENT_RMS = Math.sqrt(gradientRms);
const BASE_X = Math.cos(GERSTNER_BASE_BEARING);
const BASE_Y = Math.sin(GERSTNER_BASE_BEARING);

const DEG = Math.PI / 180;
/** Pose per RMS slope: open-water peaks land near ±1.8° pitch and ±2° roll at mid swell. */
const PITCH_PER_RMS_SLOPE = 0.7 * DEG;
const ROLL_PER_RMS_SLOPE = 1.2 * DEG;
/** Master amplitude at mid swell, calm weather: the gains' reference. */
const REFERENCE_AMPLITUDE = 0.022 + 0.5 * 0.014;
/** Share of the rendered heave the hull rides (the waterline collar holds). */
const HEAVE_SHARE = 0.6;

/**
 * Where the hull lies decides how much it rocks: the calm and ledger mirrors
 * barely stir, danger water rocks hardest (the band's existing chop, echoed).
 */
const ZONE_SWELL: Readonly<Record<ShipWaterZone, number>> = {
  calm: 0.5,
  ledger: 0.5,
  watch: 0.8,
  alert: 1,
  warning: 1.2,
  danger: 1.5,
};
/** Hulls at a quay lie inside the harbour's calm. */
const BERTH_SWELL = 0.25;

const frame = {
  amplitude: 0,
  phaseTime: 0,
  spatial: 1,
};

/** Per-frame: the water shader's phase time, amplitude and wind rotation. */
export function prepareGardenHullSwell(input: {
  timeSeconds: number;
  tempo: number;
  swell: number;
  stormLevel: number;
  windX: number;
  windZ: number;
  windSpeed: number;
}): void {
  const tempo = Math.min(1, Math.max(0, input.tempo));
  const storm = Math.min(1, Math.max(0, input.stormLevel));
  frame.phaseTime = Math.max(0, input.timeSeconds) * (0.72 + tempo * 0.38);
  frame.amplitude = Math.min(
    GARDEN_WATER_MAX_DISPLACEMENT,
    0.022 + Math.min(1, Math.max(0, input.swell)) * 0.014 + storm * 0.016,
  );
  frame.spatial = 1 + Math.min(1, Math.max(0, input.windSpeed)) * 0.3 + storm * 0.25;
  const windLength = Math.hypot(input.windX, input.windZ);
  const windX = windLength > 1e-8 ? input.windX / windLength : GARDEN_DEFAULT_WIND_X;
  const windZ = windLength > 1e-8 ? input.windZ / windLength : GARDEN_DEFAULT_WIND_Z;
  // Same rotation as `sampleGardenGerstner`: phase gradient opposes travel.
  const phaseWindX = -windX;
  const phaseWindY = windZ;
  const rc = BASE_X * phaseWindX + BASE_Y * phaseWindY;
  const rs = BASE_X * phaseWindY - BASE_Y * phaseWindX;
  for (let index = 0; index < COMPONENT_COUNT; index += 1) {
    componentDirX[index] = rc * sourceDirX[index]! - rs * sourceDirY[index]!;
    componentDirY[index] = rs * sourceDirX[index]! + rc * sourceDirY[index]!;
  }
}

export interface GardenHullSwellPose {
  /** World units up. */
  heave: number;
  /** Radians, bow up. */
  pitch: number;
  /** Radians, starboard side up (the hull lies along a surface rising to starboard). */
  rollToPort: number;
}

/**
 * The hull's swell pose at a world position and heading (tile-space unit
 * heading, world XZ = tile XY). `scale` is the hull's visual scale: long
 * hulls bridge the crests and nod less.
 */
export function sampleGardenHullSwellInto(
  worldX: number,
  worldZ: number,
  headingX: number,
  headingZ: number,
  zone: ShipWaterZone,
  atBerth: boolean,
  scale: number,
  out: GardenHullSwellPose,
): void {
  const waterX = worldX * frame.spatial;
  const waterY = -worldZ * frame.spatial;
  let height = 0;
  let gradientX = 0;
  let gradientY = 0;
  for (let index = 0; index < COMPONENT_COUNT; index += 1) {
    const component = GARDEN_WATER_GERSTNER[index]!;
    const k = componentK[index]!;
    const dirX = componentDirX[index]!;
    const dirY = componentDirY[index]!;
    const phase = k * (dirX * waterX + dirY * waterY) + component.omega * frame.phaseTime;
    const slope = component.amplitude * k * Math.cos(phase);
    height += component.amplitude * Math.sin(phase);
    gradientX += dirX * slope;
    gradientY += dirY * slope;
  }
  const response = (atBerth ? BERTH_SWELL : ZONE_SWELL[zone])
    * Math.min(1, Math.max(0.45, 1.3 - 0.3 * scale))
    * (frame.amplitude / REFERENCE_AMPLITUDE);
  // Water-local Y is −world Z: forward (hx, hz) is (hx, −hz) there, and
  // starboard (−hz, hx) in world XZ is (−hz, −hx).
  const slopeForward = (gradientX * headingX - gradientY * headingZ) / GRADIENT_RMS;
  const slopeStarboard = (-gradientX * headingZ - gradientY * headingX) / GRADIENT_RMS;
  out.heave = HEAVE_SHARE * height * frame.amplitude * (atBerth ? BERTH_SWELL : ZONE_SWELL[zone]);
  out.pitch = PITCH_PER_RMS_SLOPE * slopeForward * response;
  out.rollToPort = ROLL_PER_RMS_SLOPE * slopeStarboard * response;
}

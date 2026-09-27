import { cameraRestBlend, type IsoCamera } from "./projection";

/**
 * K17 / W6.1 (ambient-journey-1, camera-6): the arrival is the air clearing
 * over the true hour. The page opens on the hour's own gradient (index.html);
 * when the world is ready the DOM veil dissolves into the air veil, the air
 * thins from `GARDEN_ARRIVAL_AIR_VEIL` to the hour's own haze over
 * `GARDEN_ARRIVAL_AIR_VEIL_MS`, and the eye rises `GARDEN_ARRIVAL_EYE_RISE`
 * onto the rest ShotSpec over `GARDEN_ARRIVAL_DURATION_MS`.
 */
export const GARDEN_ARRIVAL_DURATION_MS = 9_000;
/** World units the eye rises through: the whole view translates straight up, never sideways, never closer. */
export const GARDEN_ARRIVAL_EYE_RISE = 3;
/** Air-veil multiplier at the first frame (the aerial optical depth; never sea-level fog). */
export const GARDEN_ARRIVAL_AIR_VEIL = 1.8;
export const GARDEN_ARRIVAL_AIR_VEIL_MS = 6_000;
/** Reduced motion: the DOM veil's single non-spatial fade onto the static rest frame. */
export const GARDEN_ARRIVAL_CROSSFADE_MS = 200;
export const GARDEN_ARRIVAL_CEREMONY_MIN_SECONDS = 8;
export const GARDEN_ARRIVAL_CEREMONY_MAX_SECONDS = 12;

export interface GardenArrivalCeremonyPose {
  /** Convoy spacing multiplier; the fleet gathers without collapsing. */
  compression: number;
  /** Ensō wake ring strength at the berth. */
  ensoWake: number;
  /** Shared sail dip, where 1 is the deepest authored bow. */
  sailDip: number;
}

/** Samples the deliberately slow arrival gesture. Reduced motion holds its readable mid-pose. */
export function sampleGardenArrivalCeremonyPose(
  elapsedSeconds: number,
  durationSeconds: number,
  reducedMotion = false,
): GardenArrivalCeremonyPose {
  const duration = Math.max(GARDEN_ARRIVAL_CEREMONY_MIN_SECONDS, Math.min(
    GARDEN_ARRIVAL_CEREMONY_MAX_SECONDS,
    durationSeconds,
  ));
  const progress = reducedMotion ? 0.5 : Math.max(0, Math.min(1, elapsedSeconds / duration));
  if (progress === 0 || progress === 1) {
    return { compression: 1, ensoWake: 0, sailDip: 0 };
  }
  const bow = Math.sin(Math.PI * progress);
  return {
    compression: 1 - 0.16 * bow,
    ensoWake: Math.max(0, 1 - Math.abs(progress - 0.68) / 0.32),
    sailDip: bow,
  };
}

export interface GardenArrivalSample {
  /** The camera to show: the rest carrying the risen-so-far view as a composed shot. */
  camera: IsoCamera;
  /** `setGardenAerialVeil` multiplier for this frame; 1 is the hour's own air. */
  airVeil: number;
  done: boolean;
}

/** The air-veil multiplier at `elapsedMs`: 1.8 thinning to 1 on a smootherstep over 6 s. */
export function gardenArrivalAirVeil(elapsedMs: number): number {
  const thinned = cameraRestBlend(elapsedMs / GARDEN_ARRIVAL_AIR_VEIL_MS);
  return 1 + (GARDEN_ARRIVAL_AIR_VEIL - 1) * (1 - thinned);
}

/**
 * The arrival at `elapsedMs` over `rest`, the rest camera solved for the
 * current viewport (callers re-solve it each frame, so a resize mid-rise lands
 * on the new ShotSpec). The rest ShotSpec view is translated straight down by
 * the part of the rise still to come and shown as a composed shot over the
 * untouched rest: yaw, pitch, FOV and stand-off never change, so nothing slides
 * and nothing zooms; and because the threshold rides the eye's offset from the
 * rest eye, the corner composition is pixel-still through the whole rise.
 */
export function sampleGardenArrival(rest: IsoCamera, elapsedMs: number): GardenArrivalSample {
  const progress = Math.max(0, elapsedMs) / GARDEN_ARRIVAL_DURATION_MS;
  const airVeil = gardenArrivalAirVeil(elapsedMs);
  const view = rest.rest?.view;
  if (progress >= 1 || !view) return { airVeil, camera: rest, done: progress >= 1 };
  const drop = GARDEN_ARRIVAL_EYE_RISE * (1 - cameraRestBlend(progress));
  const camera: IsoCamera = {
    ...rest,
    shot: {
      presence: 1,
      view: {
        eye: { x: view.eye.x, y: view.eye.y - drop, z: view.eye.z },
        target: { x: view.target.x, y: view.target.y - drop, z: view.target.z },
        vFovDeg: view.vFovDeg,
      },
    },
  };
  return { airVeil, camera, done: false };
}

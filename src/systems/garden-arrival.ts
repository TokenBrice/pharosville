import type { IsoCamera } from "./projection";

export const GARDEN_ARRIVAL_DURATION_MS = 9_000;
export const GARDEN_ARRIVAL_CROSSFADE_MS = 320;
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

export function easeOutQuint(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - ((1 - clamped) ** 5);
}

/**
 * W1.0: the arrival starts on the rest ShotSpec itself — the start pose
 * derives from the rest, and the retired −72/+48 px pose-space slide and 0.82
 * zoom are gone. K17's eye rise through the thinning air veil (no lateral
 * slide) is W6's; until then the world emerges under a still camera.
 */
export function gardenArrivalCamera(rest: IsoCamera): IsoCamera {
  return rest;
}

/** The arrival's camera at `elapsedMs`: eased from `from` to `to`, carrying `to`'s rest pose. */
export function sampleGardenArrivalCamera(
  from: IsoCamera,
  to: IsoCamera,
  elapsedMs: number,
): { camera: IsoCamera; done: boolean } {
  const progress = Math.max(0, Math.min(1, elapsedMs / GARDEN_ARRIVAL_DURATION_MS));
  const eased = easeOutQuint(progress);
  const done = progress >= 1;
  if (done || from === to) return { camera: to, done };
  const camera: IsoCamera = {
    offsetX: from.offsetX + (to.offsetX - from.offsetX) * eased,
    offsetY: from.offsetY + (to.offsetY - from.offsetY) * eased,
    zoom: from.zoom + (to.zoom - from.zoom) * eased,
  };
  if (to.rest) camera.rest = to.rest;
  return { camera, done };
}

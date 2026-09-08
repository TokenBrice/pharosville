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

export function gardenArrivalCamera(target: IsoCamera): IsoCamera {
  return {
    offsetX: target.offsetX - 72,
    offsetY: target.offsetY + 48,
    zoom: target.zoom * 0.82,
  };
}

export function sampleGardenArrivalCamera(
  from: IsoCamera,
  to: IsoCamera,
  elapsedMs: number,
): { camera: IsoCamera; done: boolean } {
  const progress = Math.max(0, Math.min(1, elapsedMs / GARDEN_ARRIVAL_DURATION_MS));
  const eased = easeOutQuint(progress);
  return {
    camera: {
      offsetX: from.offsetX + (to.offsetX - from.offsetX) * eased,
      offsetY: from.offsetY + (to.offsetY - from.offsetY) * eased,
      zoom: from.zoom + (to.zoom - from.zoom) * eased,
    },
    done: progress >= 1,
  };
}

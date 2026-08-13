import type { IsoCamera } from "./projection";

export const GARDEN_ARRIVAL_DURATION_MS = 9_000;
export const GARDEN_ARRIVAL_CROSSFADE_MS = 320;

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

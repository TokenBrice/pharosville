import type { PoseBuffer } from "./sim";

const SCALARS = ["heading", "heel", "sailState", "speed", "phase", "slot", "event", "lines", "outing", "pitch"] as const;
export type StillPose = Float64Array;

/** A reduced-motion hold preserves the entire displayed pose, including canvas and mooring state. */
export function snapshotStill(p: PoseBuffer, i: number): StillPose {
  const out = new Float64Array(5 + SCALARS.length);
  for (let k = 0; k < 3; k++) out[k] = p.position[i * 3 + k];
  for (let k = 0; k < 2; k++) out[3 + k] = p.drift[i * 2 + k];
  for (let k = 0; k < SCALARS.length; k++) out[5 + k] = p[SCALARS[k]][i];
  return out;
}

export function writeStill(p: PoseBuffer, i: number, still: StillPose): void {
  for (let k = 0; k < 3; k++) p.position[i * 3 + k] = still[k];
  for (let k = 0; k < 2; k++) p.drift[i * 2 + k] = still[3 + k];
  for (let k = 0; k < SCALARS.length; k++) p[SCALARS[k]][i] = still[5 + k];
}

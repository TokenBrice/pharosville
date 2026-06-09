import { clearShipWaterSegmentHint } from "../motion-water";
import { normalizeHeadingInto } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionState } from "../motion-types";
import { motionMemoryKey, routeIdentityKey } from "./shared";

// Per-route-path heading low-pass memory. The active key still starts with the
// ship id for cheap cleanup, but also carries route/path identity so bucket
// swaps or leg changes never inherit a stale tangent.
interface HeadingMemory {
  hx: number;
  hy: number;
  lastT: number;
  headingDelta: number;
}
const headingMemoryByMotionKey = new Map<string, HeadingMemory>();
const activeMotionMemoryKeyByShipId = new Map<string, string>();
const latestHeadingDeltaByShipId = new Map<string, number>();

export function getShipHeadingDelta(shipId: string): number {
  return latestHeadingDeltaByShipId.get(shipId) ?? 0;
}

// D3: flush per-ship heading memory (and wake memory) when formation offset
// changes so heading converges fresh from the new position.
export function clearShipHeadingMemory(shipId: string): void {
  deleteMotionMemoryForShip(shipId);
  activeMotionMemoryKeyByShipId.delete(shipId);
  latestHeadingDeltaByShipId.delete(shipId);
  clearShipWaterSegmentHint(shipId);
}

// D1/T15: wake intensity low-pass memory mirrors the route-path heading memory.
// Prevents a one-frame jump from full baseWake (sailing) to 0 (arriving at
// progress=0, where 4*0*(1-0)=0).
interface WakeMemory {
  wake: number;
  lastT: number;
}
const wakeIntensityMemoryByMotionKey = new Map<string, WakeMemory>();

export function getShipWakeIntensityMemory(shipId: string): WakeMemory | undefined {
  const activeKey = activeMotionMemoryKeyByShipId.get(shipId);
  if (activeKey) return wakeIntensityMemoryByMotionKey.get(activeKey);
  const prefix = `${shipId}|`;
  for (const [key, memory] of wakeIntensityMemoryByMotionKey) {
    if (key.startsWith(prefix)) return memory;
  }
  return undefined;
}

export function applyWakeSmoothing(memoryKey: string, timeSeconds: number, rawWake: number): number {
  const memory = wakeIntensityMemoryByMotionKey.get(memoryKey);
  if (!memory) {
    wakeIntensityMemoryByMotionKey.set(memoryKey, { wake: rawWake, lastT: timeSeconds });
    return rawWake;
  }
  const rawDt = timeSeconds - memory.lastT;
  // Cold-start: tab-resume, very long pause, or time went backward (new sampling
  // session in tests). Write rawWake directly to avoid cross-session leakage.
  if (rawDt > 1.0 || rawDt < 0) {
    memory.wake = rawWake;
    memory.lastT = timeSeconds;
    return rawWake;
  }
  const dt = Math.min(0.5, rawDt);
  const tau = 0.15;
  const alpha = 1 - Math.exp(-dt / tau);
  const smoothed = memory.wake + (rawWake - memory.wake) * alpha;
  memory.wake = smoothed;
  memory.lastT = timeSeconds;
  return smoothed;
}

function deleteMotionMemoryForShip(shipId: string): void {
  const prefix = `${shipId}|`;
  for (const key of headingMemoryByMotionKey.keys()) {
    if (key.startsWith(prefix)) headingMemoryByMotionKey.delete(key);
  }
  for (const key of wakeIntensityMemoryByMotionKey.keys()) {
    if (key.startsWith(prefix)) wakeIntensityMemoryByMotionKey.delete(key);
  }
}

export function beginRoutePathSample(route: ShipMotionRoute, routePathKey: string | null): string {
  const memoryKey = motionMemoryKey(route.shipId, routePathKey ?? routeIdentityKey(route));
  const previousKey = activeMotionMemoryKeyByShipId.get(route.shipId);
  if (previousKey !== memoryKey) {
    if (previousKey) {
      headingMemoryByMotionKey.delete(previousKey);
      wakeIntensityMemoryByMotionKey.delete(previousKey);
    }
    activeMotionMemoryKeyByShipId.set(route.shipId, memoryKey);
    latestHeadingDeltaByShipId.set(route.shipId, 0);
    clearShipWaterSegmentHint(route.shipId);
  }
  return memoryKey;
}

export function applyHeadingSmoothing(
  memoryKey: string,
  shipId: string,
  state: ShipMotionState,
  timeSeconds: number,
  heading: { x: number; y: number },
  alignmentTangent: { x: number; y: number } | null,
  alignmentT: number,
): void {
  const memory = headingMemoryByMotionKey.get(memoryKey);
  if (memory) {
    const rawDt = timeSeconds - memory.lastT;
    // Cold-start: if the gap is > 0.5s (tab-resume or very long pause), skip
    // the lerp entirely and write the target directly into heading/memory so
    // the filter doesn't produce a phantom heading snap or spurious bank.
    if (rawDt > 0.5) {
      if (alignmentTangent && alignmentT > 0) {
        const lerpX = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
        const lerpY = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
        normalizeHeadingInto(lerpX, lerpY, heading);
      }
      memory.hx = heading.x;
      memory.hy = heading.y;
      memory.lastT = timeSeconds;
      memory.headingDelta = 0;
      latestHeadingDeltaByShipId.set(shipId, 0);
      return;
    }
    // Clamp dt: defends against tab-resume jumps where timeSeconds advances
    // by minutes and the filter would otherwise snap straight to the target.
    const dt = Math.max(0, Math.min(0.2, rawDt));
    // "arriving" turns sharper into the mooring; sailing/departing breathe.
    const tau = state === "arriving" ? 0.06 : 0.18;
    const alpha = 1 - Math.exp(-dt / tau);
    const targetX = heading.x;
    const targetY = heading.y;
    const hx = memory.hx + (targetX - memory.hx) * alpha;
    const hy = memory.hy + (targetY - memory.hy) * alpha;
    normalizeHeadingInto(hx, hy, heading);
    // Docking alignment ramp: lerp the smoothed (unit) heading toward the
    // dockTangent and renormalize, so the ramp is the authoritative final
    // heading at touchdown.
    if (alignmentTangent && alignmentT > 0) {
      const lerpX = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
      const lerpY = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
      normalizeHeadingInto(lerpX, lerpY, heading);
    }

    // Track signed angular velocity for ship-pose's bank-into-turn.
    let headingDelta = 0;
    if (dt > 0) {
      const dot = memory.hx * heading.x + memory.hy * heading.y;
      const cross = memory.hx * heading.y - memory.hy * heading.x;
      headingDelta = Math.atan2(cross, dot) / dt;
    }
    memory.hx = heading.x;
    memory.hy = heading.y;
    memory.lastT = timeSeconds;
    memory.headingDelta = headingDelta;
    latestHeadingDeltaByShipId.set(shipId, headingDelta);
    return;
  }
  // First sample for this ship: seed memory directly (skip the lerp). Apply the
  // alignment ramp before recording so the seed reflects the ramped heading.
  if (alignmentTangent && alignmentT > 0) {
    const hx = heading.x + (alignmentTangent.x - heading.x) * alignmentT;
    const hy = heading.y + (alignmentTangent.y - heading.y) * alignmentT;
    normalizeHeadingInto(hx, hy, heading);
  }
  headingMemoryByMotionKey.set(memoryKey, {
    hx: heading.x,
    hy: heading.y,
    lastT: timeSeconds,
    headingDelta: 0,
  });
  latestHeadingDeltaByShipId.set(shipId, 0);
}

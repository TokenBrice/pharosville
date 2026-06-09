import { MAX_TILE_X, MAX_TILE_Y } from "../world-layout";
import { clamp, pathKey } from "../motion-utils";
import type { SeaState } from "../sea-state";
import type { PharosVilleMotionPlan, ShipMotionRoute, ShipMotionSample, ShipMotionState, ShipWaterPath } from "../motion-types";
import type { ShipNode } from "../world-types";

export interface ResolveShipMotionSampleInput {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  seaState?: SeaState | null;
  ship: ShipNode;
  timeSeconds: number;
  // Optional already-computed flagship samples by ship id. When the consort
  // branch finds its flagship's sample here it skips the redundant
  // sampleRouteCycleInto pass; without it, falls back to the local scratch.
  flagshipSamples?: ReadonlyMap<string, ShipMotionSample>;
}

export function createShipMotionSample(): ShipMotionSample {
  return {
    shipId: "",
    tile: { x: 0, y: 0 },
    state: "idle",
    zone: "calm",
    routeKey: null,
    routePathKey: null,
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speedTilesPerSecond: 0,
    mapVisibilityAlpha: 1,
    wakeIntensity: 0,
    mooringSubPhase: null,
    mooringSwayAmplitude: 1,
    mooringTension: 0,
    lanternAlpha: 0,
    fenderContact: 0,
    seaState: null,
    riskTransition: null,
  };
}

export function resetSampleChoreography(out: ShipMotionSample): void {
  out.mooringSubPhase = null;
  out.mooringSwayAmplitude = 1;
  out.mooringTension = 0;
  out.lanternAlpha = 0;
  out.fenderContact = 0;
  out.seaState = null;
  out.mapVisibilityAlpha = 1;
  out.riskTransition = null;
}

export function routeIdentityKey(route: ShipMotionRoute): string {
  return route.routeKey ?? [
    route.shipId,
    `epoch=${route.routeEpoch ?? "legacy"}`,
    route.zone,
    `${route.riskTile.x},${route.riskTile.y}`,
  ].join(":");
}

export function routePathIdentityKey(route: ShipMotionRoute, kind: string, detail: string | null = null): string {
  return `${routeIdentityKey(route)}|${kind}${detail ? `:${detail}` : ""}`;
}

export function transitRoutePathIdentityKey(
  route: ShipMotionRoute,
  path: ShipWaterPath | undefined,
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">,
  routeStop: ShipMotionRoute["dockStops"][number] | null,
): string {
  const legKey = path ? pathKey(path.from, path.to) : "missing-path";
  return routePathIdentityKey(route, state, `${routeStop?.id ?? "open"}:${legKey}`);
}

export function motionMemoryKey(shipId: string, routePathKey: string): string {
  return `${shipId}|${routePathKey}`;
}

export function writeRouteContextInto(route: ShipMotionRoute, routePathKey: string | null, out: ShipMotionSample): void {
  out.routeKey = routeIdentityKey(route);
  out.routePathKey = routePathKey;
}

export function writeZeroVelocityInto(out: ShipMotionSample): void {
  writeVelocityInto(out, 0, 0);
}

export function writeVelocityInto(out: ShipMotionSample, x: number, y: number): void {
  const vx = Number.isFinite(x) ? x : 0;
  const vy = Number.isFinite(y) ? y : 0;
  if (!out.velocity) {
    out.velocity = { x: vx, y: vy };
  } else {
    out.velocity.x = vx;
    out.velocity.y = vy;
  }
  out.speedTilesPerSecond = Math.hypot(vx, vy);
}

export function copyVelocityInto(source: ShipMotionSample, out: ShipMotionSample): void {
  writeVelocityInto(out, source.velocity?.x ?? 0, source.velocity?.y ?? 0);
}

export function writeMapVisibilityAlphaInto(out: ShipMotionSample, alpha: number): void {
  out.mapVisibilityAlpha = clamp(alpha, 0, 1);
}

export function clampMotionTileInto(x: number, y: number, out: { x: number; y: number }): void {
  out.x = Math.max(0, Math.min(MAX_TILE_X, x));
  out.y = Math.max(0, Math.min(MAX_TILE_Y, y));
}

export function clampAroundPointInto(
  point: { x: number; y: number },
  center: { x: number; y: number },
  radius: number,
  out: { x: number; y: number },
): void {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) {
    clampMotionTileInto(point.x, point.y, out);
    return;
  }
  const scale = radius / distance;
  clampMotionTileInto(center.x + dx * scale, center.y + dy * scale, out);
}

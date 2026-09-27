import { berthSwayPhase } from "../motion-planning";
import { clamp, normalizeHeadingInto, smoothstepRange } from "../motion-utils";
import { MOORING_QUIET_END } from "../motion-config";
import { sampleShipWaterPathInto as sampleWaterPathInto } from "../motion-water";
import { seaStateMooringSwayMultiplier, type SeaState } from "../sea-state";
import type { ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipWaterPath } from "../motion-types";
import {
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeZeroVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";
import { type RouteSamplingRuntime } from "./route-runtime";
import { writeAnchorRideInto } from "./anchor-ride";

const MOORED_MAP_VISIBILITY_FADE_IN_START = 0.84;

export function mooredMapVisibilityAlpha(dwellProgress: number): number {
  return smoothstepRange(MOORED_MAP_VISIBILITY_FADE_IN_START, 1, dwellProgress);
}

const mooringPathPointScratch: { x: number; y: number } = { x: 0, y: 0 };
const mooringPathHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };

interface MooringPhaseInfo {
  headingPrepT: number;
}

function mooringPhaseInfo(dwellProgress: number, secondsRemaining: number): MooringPhaseInfo {
  const progress = clamp(dwellProgress, 0, 1);
  if (progress < MOORING_QUIET_END) return { headingPrepT: 0 };

  const phasePrepT = smoothstepRange(MOORING_QUIET_END, 1, progress);
  const finalSecondsPrepT = smoothstepRange(4, 0, secondsRemaining);
  const headingPrepT = Math.max(phasePrepT, finalSecondsPrepT);
  return {
    headingPrepT,
  };
}

export function mooredSampleInto(input: {
  route: ShipMotionRoute;
  stop: ShipMotionRoute["dockStops"][number];
  dwellProgress: number;
  secondsRemaining: number;
  outgoingPath: ShipWaterPath | undefined;
  seaState: SeaState | null;
  timeSeconds: number;
  runtime: RouteSamplingRuntime;
}, out: ShipMotionSample): void {
  const routePathKey = routePathIdentityKey(input.route, "moored", input.stop.id);
  beginRoutePathSample(input.route, routePathKey);
  const phase = mooringPhaseInfo(input.dwellProgress, input.secondsRemaining);
  const angle = berthSwayPhase(input.timeSeconds, input.stop.mooringTile);
  out.shipId = input.route.shipId;
  writeMooringOffsetInto(input.stop, input.timeSeconds, input.seaState, out.tile);
  out.tile.x += input.stop.mooringTile.x;
  out.tile.y += input.stop.mooringTile.y;
  out.state = "moored";
  out.zone = input.route.zone;
  writeRouteContextInto(input.route, routePathKey, out);
  out.currentDockId = input.stop.dockId;
  out.currentRouteStopId = input.stop.id;
  out.currentRouteStopKind = input.stop.kind;
  // Anchor heading around the dock's natural mooring axis when available so
  // moored boats sway around their berth instead of sweeping full-circle.
  writeMooredHeading(input.stop.dockTangent, angle, out.heading);
  if (phase.headingPrepT > 0 && input.outgoingPath) {
    sampleWaterPathInto(input.outgoingPath, 0.01, mooringPathPointScratch, mooringPathHeadingScratch);
    if (mooringPathHeadingScratch.x !== 0 || mooringPathHeadingScratch.y !== 0) {
      normalizeHeadingInto(
        out.heading.x + (mooringPathHeadingScratch.x - out.heading.x) * phase.headingPrepT,
        out.heading.y + (mooringPathHeadingScratch.y - out.heading.y) * phase.headingPrepT,
        out.heading,
      );
    }
  }
  out.wakeIntensity = 0.05;
  out.sailSet = 0;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, mooredMapVisibilityAlpha(input.dwellProgress));
  out.seaState = input.seaState;
}

export function writeMooredHeading(
  dockTangent: { x: number; y: number } | null,
  angle: number,
  heading: { x: number; y: number },
): void {
  if (dockTangent) {
    const yaw = Math.sin(angle) * 0.035;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    normalizeHeadingInto(dockTangent.x * cosine - dockTangent.y * sine, dockTangent.x * sine + dockTangent.y * cosine, heading);
    return;
  }
  heading.x = 1;
  heading.y = 0;
}

/** Same bounded tether for dwell and transit endpoints; no seam or private rate. */
export function writeMooringOffsetInto(
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  seaState: SeaState | null,
  out: { x: number; y: number },
): void {
  const angle = berthSwayPhase(timeSeconds, stop.mooringTile);
  const radius = Math.min(0.07, 0.04 * seaStateMooringSwayMultiplier(seaState));
  out.x = Math.cos(angle) * radius;
  out.y = Math.sin(angle) * radius * 0.65;
}

/**
 * Rest at the Ledger Mooring buoy: the hull lies to the settled wind on its
 * buoy line exactly as an anchored hull rides its rode (W4.F9), at the calm
 * sheer; the stop metadata keeps the semantic "moored at Ledger Mooring".
 */
export function mooredRouteStopSampleInto(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  out: ShipMotionSample,
  ride: { elapsedSeconds: number; windowSeconds: number; entryPath?: ShipWaterPath | undefined; exitPath?: ShipWaterPath | undefined },
): void {
  const routePathKey = routePathIdentityKey(route, "route-stop", stop.id);
  beginRoutePathSample(route, routePathKey);
  out.shipId = route.shipId;
  writeAnchorRideInto({
    route,
    zone: "ledger",
    timeSeconds,
    anchor: stop.mooringTile,
    elapsedSeconds: ride.elapsedSeconds,
    windowSeconds: ride.windowSeconds,
    entryPath: ride.entryPath,
    exitPath: ride.exitPath,
  }, out.tile, out.heading);
  out.state = "moored";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = stop.id;
  out.currentRouteStopKind = stop.kind;
  out.wakeIntensity = 0.03;
  out.sailSet = 0;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, 1);
}

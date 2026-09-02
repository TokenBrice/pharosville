import { MOTION_TRANSITION_SHARE } from "../motion-config";
import { stableHash } from "../stable-random";
import { pathKey, positiveModulo } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample, ShipWaterPath } from "../motion-types";
import {
  clampMotionTileInto,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";
import { routeSamplingRuntime } from "./route-runtime";
import { transitSampleInto } from "./transit";
import { riskWaterSampleInto } from "./risk-water";
import { riskDriftSampleInto } from "./risk-drift";

export function openWaterPatrolSampleInto(route: ShipMotionRoute, timeSeconds: number, out: ShipMotionSample): void {
  if (!route.openWaterPatrol) {
    riskWaterSampleInto(route, timeSeconds, 0.18, route.restDurationSeconds, out);
    return;
  }
  const runtime = routeSamplingRuntime(route);

  const cyclePosition = timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
  const riskSeconds = route.restDurationSeconds;
  const waypointSeconds = route.riskRestDurationSeconds ?? route.restDurationSeconds;
  const transitSecondsEach = route.legDurationSeconds;
  // W4.23 — pick this cycle's itinerary leg deterministically. Uses
  // stable-hash on (shipId, cycleIndex) so adjacent cycles produce different
  // anchors (Latin-square rotation across cycles).
  const leg = openWaterPatrolLegForCycle(route, cycleIndex);
  let cursor = elapsedSeconds;

  if (cursor < riskSeconds) {
    riskWaterSampleInto(route, timeSeconds, cursor / Math.max(1, riskSeconds), riskSeconds, out);
    return;
  }
  cursor -= riskSeconds;

  if (cursor < transitSecondsEach) {
    const legProgress = cursor / Math.max(1, transitSecondsEach);
    transitSampleInto({
      route,
      path: leg.outbound,
      progress: legProgress,
      transitSeconds: transitSecondsEach,
      routeStop: null,
      runtime,
      state: "sailing",
      sampleState: legProgress < MOTION_TRANSITION_SHARE ? "departing" : "sailing",
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
    }, out);
    return;
  }
  cursor -= transitSecondsEach;

  if (cursor < waypointSeconds) {
    openWaterWaypointRestSampleInto(route, timeSeconds, leg.waypoint, out);
    return;
  }
  cursor -= waypointSeconds;

  const legProgress = cursor / Math.max(1, transitSecondsEach);
  transitSampleInto({
    route,
    path: leg.inbound,
    progress: legProgress,
    transitSeconds: transitSecondsEach,
    routeStop: null,
    runtime,
    state: "sailing",
    sampleState: legProgress >= 1 - MOTION_TRANSITION_SHARE ? "arriving" : "sailing",
    fromMooringStop: null,
    toMooringStop: null,
    timeSeconds,
  }, out);
}

/**
 * W4.23 — pick this cycle's itinerary leg via a deterministic stable hash on
 * (shipId, cycleIndex). The result rotates across cycles so consecutive
 * cycles produce different waypoint orderings while remaining stable for the
 * same (ship, cycle) pair.
 */
function openWaterPatrolLegForCycle(route: ShipMotionRoute, cycleIndex: number): {
  waypoint: { x: number; y: number };
  outbound: ShipWaterPath;
  inbound: ShipWaterPath;
} {
  const patrol = route.openWaterPatrol!;
  const itinerary = patrol.itinerary;
  if (itinerary.length === 0) {
    return { waypoint: patrol.waypoint, outbound: patrol.outbound, inbound: patrol.inbound };
  }
  const index = stableHash(`${route.shipId}.itinerary-cycle.${cycleIndex}`) % itinerary.length;
  return itinerary[index]!;
}

function openWaterWaypointRestSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  waypoint: { x: number; y: number } | null,
  out: ShipMotionSample,
): void {
  const patrol = route.openWaterPatrol;
  if (!patrol) {
    // Defensive fallback (the caller always resolves a patrol leg first);
    // preserve the raw zone-share window for the drift sampler.
    riskDriftSampleInto(route, timeSeconds, 1, route.restDurationSeconds, out);
    return;
  }
  const driftWaypoint = waypoint ?? patrol.waypoint;
  const routePathKey = routePathIdentityKey(route, "waypoint", pathKey(driftWaypoint, driftWaypoint));
  beginRoutePathSample(route, routePathKey);
  out.shipId = route.shipId;
  clampMotionTileInto(driftWaypoint.x, driftWaypoint.y, out.tile);
  out.state = "risk-drift";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  writeMapVisibilityAlphaInto(out, 1);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  out.heading.x = Math.cos(route.routeSeed * 0.00013);
  out.heading.y = Math.sin(route.routeSeed * 0.00013);
  writeVelocityInto(out, 0, 0);
  out.wakeIntensity = 0;
}

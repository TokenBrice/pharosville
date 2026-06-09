import { ZONE_DWELL } from "../motion-config";
import { stableHash } from "../stable-random";
import { normalizeHeadingInto, pathKey, positiveModulo, smoothstep } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample, ShipWaterPath } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
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
    riskWaterSampleInto(route, timeSeconds, 0.18, out);
    return;
  }
  const runtime = routeSamplingRuntime(route);

  const cyclePosition = timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
  const zoneDwell = ZONE_DWELL[route.zone];
  const riskSeconds = route.cycleSeconds * zoneDwell.riskDwell;
  const waypointSeconds = route.cycleSeconds * zoneDwell.dockDwell;
  const transitSecondsEach = (route.cycleSeconds - riskSeconds - waypointSeconds) / 2;
  // W4.23 — pick this cycle's itinerary leg deterministically. Uses
  // stable-hash on (shipId, cycleIndex) so adjacent cycles produce different
  // anchors (Latin-square rotation across cycles).
  const leg = openWaterPatrolLegForCycle(route, cycleIndex);
  let cursor = elapsedSeconds;

  if (cursor < riskSeconds) {
    riskWaterSampleInto(route, timeSeconds, cursor / Math.max(1, riskSeconds), out);
    return;
  }
  cursor -= riskSeconds;

  if (cursor < transitSecondsEach) {
    transitSampleInto({
      route,
      path: leg.outbound,
      progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
      transitSeconds: transitSecondsEach,
      routeStop: null,
      runtime,
      state: "sailing",
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
    }, out);
    return;
  }
  cursor -= transitSecondsEach;

  if (cursor < waypointSeconds) {
    openWaterWaypointDriftSampleInto(route, timeSeconds, cursor / Math.max(1, waypointSeconds), leg.waypoint, out);
    return;
  }
  cursor -= waypointSeconds;

  transitSampleInto({
    route,
    path: leg.inbound,
    progress: smoothstep(cursor / Math.max(1, transitSecondsEach)),
    transitSeconds: transitSecondsEach,
    routeStop: null,
    runtime,
    state: "sailing",
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

function openWaterWaypointDriftSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  progress: number,
  waypoint: { x: number; y: number } | null,
  out: ShipMotionSample,
): void {
  const patrol = route.openWaterPatrol;
  if (!patrol) {
    riskDriftSampleInto(route, timeSeconds, progress, out);
    return;
  }
  const driftWaypoint = waypoint ?? patrol.waypoint;
  const routePathKey = routePathIdentityKey(route, "waypoint", pathKey(driftWaypoint, driftWaypoint));
  beginRoutePathSample(route, routePathKey);
  const angle = timeSeconds * 0.023 + route.routeSeed * 0.00013 + progress * Math.PI * 2;
  out.shipId = route.shipId;
  clampMotionTileInto(
    driftWaypoint.x + Math.cos(angle) * 0.32,
    driftWaypoint.y + Math.sin(angle * 0.85) * 0.22,
    out.tile,
  );
  out.state = "sailing";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  writeMapVisibilityAlphaInto(out, 1);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.85), out.heading);
  writeVelocityInto(
    out,
    -Math.sin(angle) * 0.32 * 0.023,
    Math.cos(angle * 0.85) * 0.22 * 0.85 * 0.023,
  );
  out.wakeIntensity = patrolWakeIntensityForZone(route.zone);
}

function patrolWakeIntensityForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return 0.66;
  if (zone === "warning") return 0.54;
  if (zone === "alert") return 0.48;
  if (zone === "watch") return 0.38;
  if (zone === "ledger") return 0.3;
  return 0.28;
}

import { ZONE_DWELL } from "../motion-config";
import { normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample } from "../motion-types";
import {
  clampMotionTileInto,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";
import { routeSamplingRuntime } from "./route-runtime";
import { mooredRouteStopSampleInto } from "./mooring";
import { riskDriftSampleInto } from "./risk-drift";
import { transitSampleInto } from "./transit";

// D2: scratch samples for the ledger-roaming blend window. Reused across calls
// (zero allocation). Safe: ledgerRoamingSampleInto is not re-entrant.
const ledgerOrbitScratch: ShipMotionSample = {
  shipId: "",
  tile: { x: 0, y: 0 },
  state: "idle",
  zone: "calm",
  currentDockId: null,
  currentRouteStopId: null,
  currentRouteStopKind: null,
  heading: { x: 0, y: 0 },
  wakeIntensity: 0,
  mooringSubPhase: null,
  mooringTension: 0,
  lanternAlpha: 0,
  fenderContact: 0,
};
const ledgerTransitScratch: ShipMotionSample = {
  shipId: "",
  tile: { x: 0, y: 0 },
  state: "idle",
  zone: "calm",
  currentDockId: null,
  currentRouteStopId: null,
  currentRouteStopKind: null,
  heading: { x: 0, y: 0 },
  wakeIntensity: 0,
  mooringSubPhase: null,
  mooringTension: 0,
  lanternAlpha: 0,
  fenderContact: 0,
};

export function riskWaterSampleInto(route: ShipMotionRoute, timeSeconds: number, progress: number, out: ShipMotionSample): void {
  if (route.riskStop?.kind === "ledger") {
    if (route.openWaterPatrol) {
      ledgerRoamingSampleInto(route, route.riskStop, timeSeconds, progress, out);
      return;
    }
    mooredRouteStopSampleInto(route, route.riskStop, timeSeconds, out);
    return;
  }
  riskDriftSampleInto(route, timeSeconds, progress, out);
}

function ledgerRoamingSampleInto(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  progress: number,
  out: ShipMotionSample,
): void {
  const patrol = route.openWaterPatrol;
  if (!patrol) {
    mooredRouteStopSampleInto(route, stop, timeSeconds, out);
    return;
  }

  const idleShare = 0.58;
  const blendStart = 0.55;
  const riskSeconds = route.cycleSeconds * ZONE_DWELL[route.zone].riskDwell;
  const ledgerTransitSecondsEach = riskSeconds * (1 - idleShare) / 2;

  if (progress <= blendStart) {
    mooredRouteStopSampleInto(route, stop, timeSeconds, out);
    return;
  }

  const runtime = routeSamplingRuntime(route);

  // D2: blend window [0.55, 0.58] — smoothstep the orbit displacement toward
  // zero before transit takes over, preventing the ~0.14–0.20 tile position jump.
  if (progress < idleShare) {
    const routePathKey = routePathIdentityKey(route, "ledger-blend", stop.id);
    // Sample orbit (moored) into scratch.
    mooredRouteStopSampleInto(route, stop, timeSeconds, ledgerOrbitScratch);
    // Sample transit at patrolProgress=0 into scratch (start of outbound).
    transitSampleInto({
      route,
      path: patrol.outbound,
      progress: 0,
      transitSeconds: ledgerTransitSecondsEach,
      state: "sailing",
      routeStop: null,
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
      runtime,
    }, ledgerTransitScratch);
    // Blend factor: 0 at blendStart, 1 at idleShare.
    const easeOut = smoothstepRange(blendStart, idleShare, progress);
    beginRoutePathSample(route, routePathKey);
    out.shipId = route.shipId;
    clampMotionTileInto(
      ledgerOrbitScratch.tile.x * (1 - easeOut) + ledgerTransitScratch.tile.x * easeOut,
      ledgerOrbitScratch.tile.y * (1 - easeOut) + ledgerTransitScratch.tile.y * easeOut,
      out.tile,
    );
    // State: use orbit state until easeOut > 0.5, then transit.
    out.state = easeOut > 0.5 ? "sailing" : "moored";
    out.zone = route.zone;
    writeRouteContextInto(route, routePathKey, out);
    out.currentDockId = null;
    out.currentRouteStopId = easeOut > 0.5 ? null : ledgerOrbitScratch.currentRouteStopId;
    out.currentRouteStopKind = easeOut > 0.5 ? null : ledgerOrbitScratch.currentRouteStopKind;
    // Blend heading via component lerp then renormalize.
    const blendHx = ledgerOrbitScratch.heading.x * (1 - easeOut) + ledgerTransitScratch.heading.x * easeOut;
    const blendHy = ledgerOrbitScratch.heading.y * (1 - easeOut) + ledgerTransitScratch.heading.y * easeOut;
    normalizeHeadingInto(blendHx, blendHy, out.heading);
    out.wakeIntensity = ledgerOrbitScratch.wakeIntensity * (1 - easeOut) + ledgerTransitScratch.wakeIntensity * easeOut;
    writeVelocityInto(
      out,
      (ledgerOrbitScratch.velocity?.x ?? 0) * (1 - easeOut) + (ledgerTransitScratch.velocity?.x ?? 0) * easeOut,
      (ledgerOrbitScratch.velocity?.y ?? 0) * (1 - easeOut) + (ledgerTransitScratch.velocity?.y ?? 0) * easeOut,
    );
    writeMapVisibilityAlphaInto(out, 1);
    out.mooringSubPhase = null;
    out.mooringTension = 0;
    out.lanternAlpha = 0;
    out.fenderContact = 0;
    return;
  }

  const patrolProgress = (progress - idleShare) / Math.max(0.0001, 1 - idleShare);
  if (patrolProgress < 0.5) {
    transitSampleInto({
      route,
      path: patrol.outbound,
      progress: smoothstep(patrolProgress * 2),
      transitSeconds: ledgerTransitSecondsEach,
      state: "sailing",
      routeStop: null,
      fromMooringStop: null,
      toMooringStop: null,
      timeSeconds,
      runtime,
    }, out);
    return;
  }

  transitSampleInto({
    route,
    path: patrol.inbound,
    progress: smoothstep((patrolProgress - 0.5) * 2),
    transitSeconds: ledgerTransitSecondsEach,
    state: "sailing",
    routeStop: null,
    fromMooringStop: null,
    toMooringStop: null,
    timeSeconds,
    runtime,
  }, out);
}

import { stableHash, stableUnit } from "../stable-random";
import { clamp, normalizeHeadingInto, smoothstepRange } from "../motion-utils";
import {
  CAST_OFF_LINE_RELEASE_END,
  MOORING_QUIET_END,
  MOORING_WORKING_END,
} from "../motion-config";
import { staleEvidenceMotionFactors } from "../motion-sampling-factors";
import { sampleShipWaterPathInto as sampleWaterPathInto } from "../motion-water";
import { seaStateMooringSwayMultiplier, type SeaState } from "../sea-state";
import type { ShipMooringSubPhase, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipWaterPath } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
import {
  clampMotionTileInto,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeZeroVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";
import { routeSamplingRuntime, type RouteSamplingRuntime } from "./route-runtime";

const MOORED_MAP_VISIBILITY_FADE_IN_START = 0.84;

export function mooredMapVisibilityAlpha(dwellProgress: number): number {
  return smoothstepRange(MOORED_MAP_VISIBILITY_FADE_IN_START, 1, dwellProgress);
}

const mooringPathPointScratch: { x: number; y: number } = { x: 0, y: 0 };
const mooringPathHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };

interface MooringPhaseInfo {
  headingPrepT: number;
  lanternAlpha: number;
  subPhase: ShipMooringSubPhase;
  swayMultiplier: number;
  tension: number;
}

function mooringPhaseInfo(route: ShipMotionRoute, dwellProgress: number, secondsRemaining: number, timeSeconds: number): MooringPhaseInfo {
  const progress = clamp(dwellProgress, 0, 1);
  if (progress < MOORING_WORKING_END) {
    const warmedSway = smoothstepRange(CAST_OFF_LINE_RELEASE_END, MOORING_WORKING_END, progress);
    return {
      headingPrepT: 0,
      lanternAlpha: 0.35 + 0.25 * Math.max(0, Math.sin(timeSeconds * 1.7 + route.routeSeed * 0.00011)),
      subPhase: "working",
      swayMultiplier: 1 + 0.2 * warmedSway,
      tension: 1,
    };
  }

  if (progress < MOORING_QUIET_END) {
    return {
      headingPrepT: 0,
      lanternAlpha: 0,
      subPhase: "quiet",
      swayMultiplier: 1,
      tension: 1,
    };
  }

  const phasePrepT = smoothstepRange(MOORING_QUIET_END, 1, progress);
  const finalSecondsPrepT = smoothstepRange(4, 0, secondsRemaining);
  const headingPrepT = Math.max(phasePrepT, finalSecondsPrepT);
  return {
    headingPrepT,
    lanternAlpha: 0,
    subPhase: "cast-off-prep",
    swayMultiplier: 1,
    tension: 1 - headingPrepT,
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
  const phase = mooringPhaseInfo(input.route, input.dwellProgress, input.secondsRemaining, input.timeSeconds);
  const seed = mooredSeedFor(input.route, input.stop, input.runtime);
  const phaseOffset = mooredPhaseFor(input.route, input.stop, input.runtime);
  const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.stop, input.runtime);
  const staleFactors = staleEvidenceMotionFactors(input.route.staleEvidence);
  const angle = input.timeSeconds * 0.027 * staleFactors.angularFactor + seed * 0.0001 + phaseOffset;
  const radius = mooredRadiusForZone(input.route.zone);
  const seaSway = seaStateMooringSwayMultiplier(input.seaState);
  const swayAmplitude = phase.swayMultiplier * seaSway;
  out.shipId = input.route.shipId;
  out.tile.x = input.stop.mooringTile.x + Math.cos(angle) * radius.x * radiusMultiplier * staleFactors.radiusFactor * swayAmplitude;
  out.tile.y = input.stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleFactors.radiusFactor * swayAmplitude;
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
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, mooredMapVisibilityAlpha(input.dwellProgress));
  out.mooringSubPhase = phase.subPhase;
  out.mooringSwayAmplitude = swayAmplitude;
  out.mooringTension = phase.tension;
  out.lanternAlpha = phase.lanternAlpha;
  out.fenderContact = 0;
  out.seaState = input.seaState;
}

export function writeMooredHeading(
  dockTangent: { x: number; y: number } | null,
  angle: number,
  heading: { x: number; y: number },
): void {
  if (dockTangent) {
    const sway = 0.08;
    const swayX = -Math.sin(angle) * sway;
    const swayY = Math.cos(angle * 0.9) * sway;
    normalizeHeadingInto(dockTangent.x + swayX, dockTangent.y + swayY, heading);
    return;
  }
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.9), heading);
}

export function mooredSeedFor(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  runtime: RouteSamplingRuntime,
): number {
  const cached = runtime.mooredSeedByStopId.get(stop.id);
  if (cached !== undefined) return cached;
  const dockKey = stop.kind === "dock" ? stop.dockId : stop.id;
  return stableHash(`${route.shipId}.${dockKey}.moored`);
}

export function mooredPhaseFor(route: ShipMotionRoute, stop: ShipMotionRouteStop, runtime: RouteSamplingRuntime): number {
  const cached = runtime.mooredPhaseByStopId.get(stop.id);
  if (cached !== undefined) return cached;
  return (stableHash(`${route.shipId}.moored-phase`) % 1000) / 1000 * Math.PI * 2;
}

export function mooredRadiusMultiplierFor(route: ShipMotionRoute, stop: ShipMotionRouteStop, runtime: RouteSamplingRuntime): number {
  const cached = runtime.mooredRadiusMultiplierByStopId.get(stop.id);
  if (cached !== undefined) return cached;
  const stableUnitSigned = (stableUnit(`${route.shipId}.moored-radius`) - 0.5) * 2;
  return 1 + 0.15 * stableUnitSigned;
}

export function mooredRouteStopSampleInto(
  route: ShipMotionRoute,
  stop: ShipMotionRouteStop,
  timeSeconds: number,
  out: ShipMotionSample,
): void {
  const routePathKey = routePathIdentityKey(route, "route-stop", stop.id);
  beginRoutePathSample(route, routePathKey);
  const runtime = routeSamplingRuntime(route);
  const seed = mooredSeedFor(route, stop, runtime);
  const phaseOffset = mooredPhaseFor(route, stop, runtime);
  const radiusMultiplier = mooredRadiusMultiplierFor(route, stop, runtime);
  const staleFactors = staleEvidenceMotionFactors(route.staleEvidence);
  const angle = timeSeconds * 0.018 * staleFactors.angularFactor + seed * 0.0001 + phaseOffset;
  const radius = mooredRadiusForZone(route.zone);
  out.shipId = route.shipId;
  clampMotionTileInto(
    stop.mooringTile.x + Math.cos(angle) * radius.x * 0.72 * radiusMultiplier * staleFactors.radiusFactor,
    stop.mooringTile.y + Math.sin(angle * 0.9) * radius.y * 0.72 * radiusMultiplier * staleFactors.radiusFactor,
    out.tile,
  );
  out.state = "moored";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = stop.id;
  out.currentRouteStopKind = stop.kind;
  writeMooredHeading(stop.dockTangent, angle, out.heading);
  out.wakeIntensity = 0.03;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, 1);
  out.mooringSubPhase = null;
  out.mooringTension = 0;
  out.lanternAlpha = 0;
  out.fenderContact = 0;
}

const MOORED_RADIUS_DANGER = { x: 0.22, y: 0.14 };
const MOORED_RADIUS_WARNING = { x: 0.24, y: 0.16 };
const MOORED_RADIUS_ALERT = { x: 0.26, y: 0.17 };
const MOORED_RADIUS_DEFAULT = { x: 0.28, y: 0.18 };

export function mooredRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return MOORED_RADIUS_DANGER;
  if (zone === "warning") return MOORED_RADIUS_WARNING;
  if (zone === "alert") return MOORED_RADIUS_ALERT;
  return MOORED_RADIUS_DEFAULT;
}

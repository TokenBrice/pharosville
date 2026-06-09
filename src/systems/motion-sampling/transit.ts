import {
  ARRIVING_DECEL_END,
  ARRIVING_FULL_TRANSIT_END,
  CAST_OFF_ACCEL_END,
  CAST_OFF_LINE_RELEASE_END,
} from "../motion-config";
import { staleEvidenceMotionFactors } from "../motion-sampling-factors";
import { sampleShipWaterPathInto as sampleWaterPathInto } from "../motion-water";
import { clamp, normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import { seaStateMooringSwayMultiplier, type SeaState } from "../sea-state";
import type { ShipMotionRoute, ShipMotionSample, ShipMotionState, ShipWaterPath } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
import {
  clampAroundPointInto,
  clampMotionTileInto,
  transitRoutePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeVelocityInto,
} from "./shared";
import { applyHeadingSmoothing, applyWakeSmoothing, beginRoutePathSample } from "./memory";
import { mooredPhaseFor, mooredRadiusForZone, mooredRadiusMultiplierFor, mooredSeedFor } from "./mooring";
import type { RouteSamplingRuntime } from "./route-runtime";

export function transitMapVisibilityAlpha(
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">,
  progress: number,
): number {
  if (state === "departing") {
    return smoothstepRange(CAST_OFF_LINE_RELEASE_END, CAST_OFF_ACCEL_END, progress);
  }
  if (state === "arriving") {
    return 1 - smoothstepRange(ARRIVING_FULL_TRANSIT_END, 1, progress);
  }
  return 1;
}

// Forward-difference scratch buffers used by transitSampleInto for the
// lane-curve aware heading. We sample the lane-displaced point a small step
// ahead and derive the tangent from the actual rendered trajectory.
const aheadPointScratch: { x: number; y: number } = { x: 0, y: 0 };
const aheadHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };
const aheadLaneScratch: { x: number; y: number } = { x: 0, y: 0 };

// Scratch tile reused inside transitSampleInto: holds the lane-adjusted point
// before mooring blend writes it into out.tile.
const transitTileScratch: { x: number; y: number } = { x: 0, y: 0 };

interface TransitPhaseProfile {
  alignmentToDockTangent: number;
  fenderContact: number;
  pathProgress: number;
  speedRatio: number;
}

const ARRIVING_DECEL_DISTANCE_SHARE = (ARRIVING_DECEL_END - ARRIVING_FULL_TRANSIT_END) * (2 / Math.PI);
const ARRIVING_CONTACT_PATH_START = ARRIVING_FULL_TRANSIT_END + ARRIVING_DECEL_DISTANCE_SHARE;
const CAST_OFF_ACCEL_DISTANCE_SHARE = (CAST_OFF_ACCEL_END - CAST_OFF_LINE_RELEASE_END) * (2 / Math.PI);

function transitPhaseProfile(state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">, progress: number): TransitPhaseProfile {
  const p = clamp(progress, 0, 1);
  if (state === "departing") {
    if (p <= CAST_OFF_LINE_RELEASE_END) {
      return {
        alignmentToDockTangent: 1,
        fenderContact: 0,
        pathProgress: 0,
        speedRatio: 0,
      };
    }
    if (p < CAST_OFF_ACCEL_END) {
      const local = (p - CAST_OFF_LINE_RELEASE_END) / (CAST_OFF_ACCEL_END - CAST_OFF_LINE_RELEASE_END);
      const easedDistance = CAST_OFF_ACCEL_DISTANCE_SHARE * (1 - Math.cos(local * Math.PI / 2));
      return {
        alignmentToDockTangent: 1 - smoothstep(local),
        fenderContact: 0,
        pathProgress: easedDistance,
        speedRatio: Math.sin(local * Math.PI / 2),
      };
    }
    const normalProgress = (p - CAST_OFF_ACCEL_END) / (1 - CAST_OFF_ACCEL_END);
    return {
      alignmentToDockTangent: 0,
      fenderContact: 0,
      pathProgress: CAST_OFF_ACCEL_DISTANCE_SHARE + (1 - CAST_OFF_ACCEL_DISTANCE_SHARE) * normalProgress,
      speedRatio: 1,
    };
  }

  if (state === "arriving") {
    if (p <= ARRIVING_FULL_TRANSIT_END) {
      return {
        alignmentToDockTangent: 0,
        fenderContact: 0,
        pathProgress: p,
        speedRatio: 1,
      };
    }
    if (p < ARRIVING_DECEL_END) {
      const local = (p - ARRIVING_FULL_TRANSIT_END) / (ARRIVING_DECEL_END - ARRIVING_FULL_TRANSIT_END);
      return {
        alignmentToDockTangent: smoothstep(local),
        fenderContact: 0,
        pathProgress: ARRIVING_FULL_TRANSIT_END + ARRIVING_DECEL_DISTANCE_SHARE * Math.sin(local * Math.PI / 2),
        speedRatio: 0.1 + 0.9 * Math.cos(local * Math.PI / 2),
      };
    }
    const local = (p - ARRIVING_DECEL_END) / (1 - ARRIVING_DECEL_END);
    const contactT = smoothstep(local);
    return {
      alignmentToDockTangent: 1,
      fenderContact: contactT,
      pathProgress: ARRIVING_CONTACT_PATH_START + (1 - ARRIVING_CONTACT_PATH_START) * contactT,
      speedRatio: 0.1 * (1 - contactT),
    };
  }

  return {
    alignmentToDockTangent: 0,
    fenderContact: 0,
    pathProgress: p,
    speedRatio: 1,
  };
}

export function transitSampleInto(input: {
  route: ShipMotionRoute;
  path: ShipWaterPath | undefined;
  progress: number;
  transitSeconds?: number;
  routeStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  seaState?: SeaState | null;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, out: ShipMotionSample): void {
  const linearProgress = clamp(input.progress, 0, 1);
  const profile = transitPhaseProfile(input.state, linearProgress);
  const routePathKey = transitRoutePathIdentityKey(input.route, input.path, input.state, input.routeStop);
  const memoryKey = beginRoutePathSample(input.route, routePathKey);
  // Write water-path point/heading directly into out.tile / out.heading.
  // F10/T15: pass a route-path key so segment-index hints stay hot within a leg
  // but cannot survive route bucket or path swaps.
  sampleWaterPathInto(input.path, profile.pathProgress, out.tile, out.heading, memoryKey);
  // Apply lane offset (uses heading); write through a scratch tile because
  // the lane formula reads the un-offset point.
  transitLanePointInto(out.tile, out.heading, profile.pathProgress, input.runtime, transitTileScratch);
  out.tile.x = transitTileScratch.x;
  out.tile.y = transitTileScratch.y;

  // #6: derive heading from the forward-difference along the lane-displaced
  // trajectory rather than the raw path tangent. Without this, the lane bulge
  // shifts position perpendicular while heading stays straight, producing a
  // visible "crab" sideways motion.
  const aheadProgress = Math.min(1, profile.pathProgress + 0.01);
  sampleWaterPathInto(input.path, aheadProgress, aheadPointScratch, aheadHeadingScratch, memoryKey);
  transitLanePointInto(aheadPointScratch, aheadHeadingScratch, aheadProgress, input.runtime, aheadLaneScratch);
  const fdx = aheadLaneScratch.x - out.tile.x;
  const fdy = aheadLaneScratch.y - out.tile.y;
  if (fdx !== 0 || fdy !== 0) {
    normalizeHeadingInto(fdx, fdy, out.heading);
  }

  applyFenderContactClampInto(input.toMooringStop, linearProgress, out.tile);
  applyMooringBlendInto({
    progress: linearProgress,
    route: input.route,
    fromMooringStop: input.fromMooringStop,
    toMooringStop: input.toMooringStop,
    seaState: input.seaState ?? null,
    timeSeconds: input.timeSeconds,
    runtime: input.runtime,
  }, out.tile);
  if (input.toMooringStop && linearProgress >= ARRIVING_DECEL_END) {
    clampAroundPointInto(out.tile, input.toMooringStop.mooringTile, 0.5, out.tile);
  }
  out.shipId = input.route.shipId;
  out.state = input.state;
  out.zone = input.route.zone;
  writeRouteContextInto(input.route, routePathKey, out);
  out.currentDockId = input.routeStop?.dockId ?? null;
  out.currentRouteStopId = input.routeStop?.id ?? null;
  out.currentRouteStopKind = input.routeStop?.kind ?? null;
  out.mooringSubPhase = null;
  out.mooringSwayAmplitude = seaStateMooringSwayMultiplier(input.seaState);
  out.mooringTension = input.state === "arriving" ? profile.fenderContact : 0;
  out.lanternAlpha = 0;
  out.fenderContact = profile.fenderContact;
  out.seaState = input.seaState ?? null;
  writeMapVisibilityAlphaInto(out, transitMapVisibilityAlpha(input.state, linearProgress));

  // #5: speed-aware wake. departing/arriving accelerate from rest and decelerate
  // back to rest, so wake should peak mid-leg. sailing (open-water patrol) is
  // mid-leg by construction and stays at full intensity.
  // D1: applyWakeSmoothing prevents the one-frame step when transitioning between
  // sailing (rawWake=baseWake) and arriving (rawWake=0 at progress=0).
  // E2: multiply raw wake by the pre-computed wakeMultiplier (1.0 baseline;
  // boosted when |change24hPct| ≥ 2%). Smoothing is applied after the multiplier
  // so the smoother damps the already-scaled value — no smoothing-induced flicker.
  const baseWake = transitWakeIntensityForZone(input.route.zone);
  let rawWake: number;
  if (input.state === "departing" || input.state === "arriving") {
    rawWake = baseWake * profile.speedRatio * input.route.wakeMultiplier;
  } else {
    rawWake = baseWake * input.route.wakeMultiplier;
  }
  out.wakeIntensity = applyWakeSmoothing(memoryKey, input.timeSeconds, rawWake);

  // #4: per-ship heading low-pass filter. Path-segment tangents jump at every
  // internal waypoint vertex; without smoothing ships visibly twitch when
  // crossing 4-connected A* corners. Skipped for moored/risk-drift (those have
  // intentional orbital headings) and for reduced-motion (deterministic snapshot).
  // Docking choreography: arriving transits start heading alignment during the
  // decel phase and finish with a tiny deterministic fender-contact yaw;
  // departing transits mirror that by holding the dock tangent through line
  // release before rotating back onto the path tangent.
  const alignmentTangent = transitAlignmentTangent(input, profile);
  const alignmentT = alignmentTangent ? profile.alignmentToDockTangent : 0;
  applyHeadingSmoothing(
    memoryKey,
    input.route.shipId,
    input.state,
    input.timeSeconds,
    out.heading,
    alignmentTangent,
    alignmentT,
  );
  const speed = transitSpeedTilesPerSecond(input.path, input.transitSeconds, profile.speedRatio);
  writeVelocityInto(out, out.heading.x * speed, out.heading.y * speed);
}

const fenderHeadingScratch: { x: number; y: number } = { x: 0, y: 0 };

function transitAlignmentTangent(input: {
  route: ShipMotionRoute;
  state: Extract<ShipMotionState, "arriving" | "departing" | "sailing">;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, profile: TransitPhaseProfile): { x: number; y: number } | null {
  if (input.state === "arriving" && input.toMooringStop?.dockTangent) {
    if (profile.fenderContact > 0) {
      writeFenderYawedTangentInto(input.toMooringStop.dockTangent, input.route, input.timeSeconds, profile.fenderContact, fenderHeadingScratch);
      return fenderHeadingScratch;
    }
    return input.toMooringStop.dockTangent;
  }

  return input.state === "departing" && input.fromMooringStop?.dockTangent
    ? input.fromMooringStop.dockTangent
    : null;
}

function transitSpeedTilesPerSecond(
  path: ShipWaterPath | undefined,
  transitSeconds: number | undefined,
  speedRatio: number,
): number {
  const seconds = transitSeconds && transitSeconds > 0 ? transitSeconds : 1;
  const length = path?.totalLength ?? 0;
  const speed = length / seconds * speedRatio;
  return Number.isFinite(speed) ? speed : 0;
}

function writeFenderYawedTangentInto(
  dockTangent: { x: number; y: number },
  route: ShipMotionRoute,
  timeSeconds: number,
  fenderContact: number,
  out: { x: number; y: number },
): void {
  const yaw = Math.sin(timeSeconds * 2.7 + route.routeSeed * 0.00017) * 0.04 * fenderContact;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  normalizeHeadingInto(
    dockTangent.x * cos - dockTangent.y * sin,
    dockTangent.x * sin + dockTangent.y * cos,
    out,
  );
}

function applyFenderContactClampInto(
  stop: ShipMotionRoute["dockStops"][number] | null,
  progress: number,
  tile: { x: number; y: number },
): void {
  if (!stop?.dockTangent || progress < ARRIVING_FULL_TRANSIT_END) return;
  const contactT = smoothstepRange(ARRIVING_FULL_TRANSIT_END, ARRIVING_DECEL_END, progress);
  if (contactT <= 0) return;

  const tangent = stop.dockTangent;
  const normal = { x: -tangent.y, y: tangent.x };
  const dx = tile.x - stop.mooringTile.x;
  const dy = tile.y - stop.mooringTile.y;
  const tangentDistance = dx * tangent.x + dy * tangent.y;
  const normalDistance = dx * normal.x + dy * normal.y;
  let targetDx = tangent.x * clamp(tangentDistance, -0.5, 0.5)
    + normal.x * clamp(normalDistance, -0.5, 0.5);
  let targetDy = tangent.y * clamp(tangentDistance, -0.5, 0.5)
    + normal.y * clamp(normalDistance, -0.5, 0.5);
  const targetDistance = Math.hypot(targetDx, targetDy);
  if (targetDistance > 0.5) {
    const scale = 0.5 / targetDistance;
    targetDx *= scale;
    targetDy *= scale;
  }
  const targetX = stop.mooringTile.x + targetDx;
  const targetY = stop.mooringTile.y + targetDy;
  clampMotionTileInto(
    tile.x + (targetX - tile.x) * contactT,
    tile.y + (targetY - tile.y) * contactT,
    tile,
  );

  if (progress >= ARRIVING_DECEL_END) {
    clampAroundPointInto(tile, stop.mooringTile, 0.5, tile);
  }
}

function applyMooringBlendInto(input: {
  progress: number;
  route: ShipMotionRoute;
  fromMooringStop: ShipMotionRoute["dockStops"][number] | null;
  runtime: RouteSamplingRuntime;
  seaState: SeaState | null;
  toMooringStop: ShipMotionRoute["dockStops"][number] | null;
  timeSeconds: number;
}, tile: { x: number; y: number }): void {
  const staleFactors = staleEvidenceMotionFactors(input.route.staleEvidence);
  const seaSway = seaStateMooringSwayMultiplier(input.seaState);
  let dx = 0;
  let dy = 0;
  if (input.fromMooringStop) {
    const releaseT = smoothstepRange(CAST_OFF_LINE_RELEASE_END, CAST_OFF_ACCEL_END, input.progress);
    const seed = mooredSeedFor(input.route, input.fromMooringStop, input.runtime);
    const phaseOffset = mooredPhaseFor(input.route, input.fromMooringStop, input.runtime);
    const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.fromMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 * staleFactors.angularFactor + seed * 0.0001 + phaseOffset;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * radiusMultiplier * staleFactors.radiusFactor * seaSway * (1 - releaseT);
    dy += Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleFactors.radiusFactor * seaSway * (1 - releaseT);
  }
  if (input.toMooringStop) {
    const mooringTension = smoothstepRange(ARRIVING_DECEL_END, 1, input.progress);
    const seed = mooredSeedFor(input.route, input.toMooringStop, input.runtime);
    const phaseOffset = mooredPhaseFor(input.route, input.toMooringStop, input.runtime);
    const radiusMultiplier = mooredRadiusMultiplierFor(input.route, input.toMooringStop, input.runtime);
    const angle = input.timeSeconds * 0.027 * staleFactors.angularFactor + seed * 0.0001 + phaseOffset;
    const radius = mooredRadiusForZone(input.route.zone);
    dx += Math.cos(angle) * radius.x * radiusMultiplier * staleFactors.radiusFactor * seaSway * mooringTension;
    dy += Math.sin(angle * 0.9) * radius.y * radiusMultiplier * staleFactors.radiusFactor * seaSway * mooringTension;
  }
  if (dx === 0 && dy === 0) return;
  clampMotionTileInto(tile.x + dx, tile.y + dy, tile);
}

function transitLanePointInto(
  point: { x: number; y: number },
  heading: { x: number; y: number },
  progress: number,
  runtime: RouteSamplingRuntime,
  out: { x: number; y: number },
): void {
  const laneStrength = Math.sin(clamp(progress, 0, 1) * Math.PI);
  if (laneStrength <= 0.01) {
    out.x = point.x;
    out.y = point.y;
    return;
  }
  const laneMagnitude = runtime.laneMagnitude * laneStrength;
  clampMotionTileInto(
    point.x + -heading.y * laneMagnitude * runtime.laneSign,
    point.y + heading.x * laneMagnitude * runtime.laneSign,
    out,
  );
}

function transitWakeIntensityForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return 0.72;
  if (zone === "warning") return 0.58;
  if (zone === "alert") return 0.5;
  if (zone === "watch") return 0.42;
  if (zone === "ledger") return 0.34;
  return 0.35;
}

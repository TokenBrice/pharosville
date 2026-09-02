import { normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
import { isWaterTileKind, tileKindAt } from "../world-layout";
import { isGardenObstacleTile } from "../garden-water-exclusion";
import { isSeawallBarrierTileXY } from "../seawall";
import {
  clampMotionTileInto,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";

/** Risk-placement changes retain their short, deterministic tack-out. */
export const RISK_TRANSITION_TACK_OUT_SECONDS = 3;
export const RISK_TRANSITION_HEADING_EASE_SECONDS = 0.5;

/** Existing DEWS patrol rates, now used as local rest-oscillation rates. */
export const PATROL_SPEED_DANGER = 0.26;
export const PATROL_SPEED_WARNING = 0.15;
export const PATROL_SPEED_ALERT = 0.095;
export const PATROL_SPEED_WATCH = 0.052;
export const PATROL_SPEED_DEFAULT = 0.04;

export function patrolSpeedForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return PATROL_SPEED_DANGER;
  if (zone === "warning") return PATROL_SPEED_WARNING;
  if (zone === "alert") return PATROL_SPEED_ALERT;
  if (zone === "watch") return PATROL_SPEED_WATCH;
  return PATROL_SPEED_DEFAULT;
}

const REST_RADIUS_DANGER = 0.6;
const REST_RADIUS_WARNING = 0.4;
const REST_RADIUS_ALERT = 0.24;
const REST_RADIUS_WATCH = 0.12;
const REST_RADIUS_DEFAULT = 0;

function restRadiusForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return REST_RADIUS_DANGER;
  if (zone === "warning") return REST_RADIUS_WARNING;
  if (zone === "alert") return REST_RADIUS_ALERT;
  if (zone === "watch") return REST_RADIUS_WATCH;
  return REST_RADIUS_DEFAULT;
}

function smoothstepDerivative01(value: number): number {
  if (value <= 0 || value >= 1) return 0;
  return 6 * value * (1 - value);
}

function isSafeRestTile(x: number, y: number): boolean {
  return isWaterTileKind(tileKindAt(x, y))
    && !isGardenObstacleTile(x, y)
    && !isSeawallBarrierTileXY(x, y);
}

/**
 * Rest at a risk-water anchor between legs. This is deliberately not a voyage
 * orbit: a bounded local oscillation lets rough water remain perceptible while
 * all meaningful displacement stays in waypoint-to-waypoint legs.
 */
export function riskDriftSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  progress: number,
  riskWindowSeconds: number,
  out: ShipMotionSample,
  anchor: { x: number; y: number } = route.riskTile,
  routePathKey = routePathIdentityKey(route, "risk-rest"),
  allowRiskTransition = true,
): void {
  beginRoutePathSample(route, routePathKey);
  const elapsedRiskSeconds = progress * Math.max(1, riskWindowSeconds);
  const previousRiskTile = allowRiskTransition ? route.previousRiskTile : undefined;
  const tackOutT = previousRiskTile && elapsedRiskSeconds < RISK_TRANSITION_TACK_OUT_SECONDS
    ? smoothstep(elapsedRiskSeconds / RISK_TRANSITION_TACK_OUT_SECONDS)
    : 1;
  const centerX = previousRiskTile
    ? previousRiskTile.x + (anchor.x - previousRiskTile.x) * tackOutT
    : anchor.x;
  const centerY = previousRiskTile
    ? previousRiskTile.y + (anchor.y - previousRiskTile.y) * tackOutT
    : anchor.y;
  const rate = patrolSpeedForZone(route.zone);
  const rampShare = 0.08;
  const entryProgress = progress / rampShare;
  const exitProgress = (1 - progress) / rampShare;
  const entryScale = smoothstepRange(0, 1, entryProgress);
  const exitScale = smoothstepRange(0, 1, exitProgress);
  const radiusScale = entryScale * exitScale;
  const radiusScalePerSecond = (
    smoothstepDerivative01(entryProgress) / rampShare * exitScale
    - entryScale * smoothstepDerivative01(exitProgress) / rampShare
  ) / Math.max(1, riskWindowSeconds);
  const baseRadius = restRadiusForZone(route.zone);
  const radius = baseRadius * radiusScale;
  const phase = route.routeSeed * 0.0001;
  const angle = timeSeconds * rate + phase;
  const secondaryAngle = timeSeconds * rate * 1.7 + phase * 1.31;
  const rawDx = Math.sin(angle) * radius * 0.8;
  const rawDy = Math.sin(secondaryAngle) * radius * 0.6;
  let safeScale = 1;
  if (!isSafeRestTile(centerX + rawDx, centerY + rawDy)) safeScale = 0.5;
  if (!isSafeRestTile(centerX + rawDx * safeScale, centerY + rawDy * safeScale)) safeScale = 0.25;
  if (!isSafeRestTile(centerX + rawDx * safeScale, centerY + rawDy * safeScale)) safeScale = 0;

  out.shipId = route.shipId;
  clampMotionTileInto(centerX + rawDx * safeScale, centerY + rawDy * safeScale, out.tile);
  out.state = "risk-drift";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  const velocityX = baseRadius * 0.8 * (
    Math.cos(angle) * radiusScale * rate + Math.sin(angle) * radiusScalePerSecond
  ) * safeScale;
  const velocityY = baseRadius * 0.6 * (
    Math.cos(secondaryAngle) * radiusScale * rate * 1.7
    + Math.sin(secondaryAngle) * radiusScalePerSecond
  ) * safeScale;
  normalizeHeadingInto(velocityX, velocityY, out.heading);
  if (previousRiskTile && tackOutT < 1) {
    const tackDx = anchor.x - previousRiskTile.x;
    const tackDy = anchor.y - previousRiskTile.y;
    const tackLength = Math.hypot(tackDx, tackDy);
    if (tackLength > 1e-6) {
      const easeIn = smoothstepRange(0, RISK_TRANSITION_HEADING_EASE_SECONDS, elapsedRiskSeconds);
      const easeWeight = easeIn * (1 - tackOutT);
      normalizeHeadingInto(
        out.heading.x + (tackDx / tackLength - out.heading.x) * easeWeight,
        out.heading.y + (tackDy / tackLength - out.heading.y) * easeWeight,
        out.heading,
      );
    }
  }
  writeVelocityInto(out, velocityX, velocityY);
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = Math.min(0.16, (out.speedTilesPerSecond ?? 0) * 0.8);
  out.riskTransition = previousRiskTile && tackOutT < 1
    ? { fromTile: previousRiskTile, toTile: anchor, progress: tackOutT }
    : null;
}

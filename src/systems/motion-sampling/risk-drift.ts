import { normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample, ShipWaterPath } from "../motion-types";
import {
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeZeroVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";
import { writeAnchorRideInto } from "./anchor-ride";

/** Risk-placement changes retain their short, deterministic tack-out. */
export const RISK_TRANSITION_TACK_OUT_SECONDS = 3;
export const RISK_TRANSITION_HEADING_EASE_SECONDS = 0.5;

/** A hull on its rode leaves no wake of its own; the field reads contact only. */
const ANCHORED_WAKE_INTENSITY = 0.03;

const anchorScratch = { x: 0, y: 0 };

/**
 * Rest at a risk-water anchorage between legs (W4.F9): the hull rides to its
 * anchor — bow to the settled wind, sheering on the rode by risk band — and
 * rounds up from, and back onto, the voyages either side of the rest.
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
  entryPath?: ShipWaterPath,
  exitPath?: ShipWaterPath,
): void {
  beginRoutePathSample(route, routePathKey);
  const windowSeconds = Math.max(1, riskWindowSeconds);
  const elapsedRiskSeconds = progress * windowSeconds;
  const previousRiskTile = allowRiskTransition ? route.previousRiskTile : undefined;
  const tackOutT = previousRiskTile && elapsedRiskSeconds < RISK_TRANSITION_TACK_OUT_SECONDS
    ? smoothstep(elapsedRiskSeconds / RISK_TRANSITION_TACK_OUT_SECONDS)
    : 1;
  anchorScratch.x = previousRiskTile ? previousRiskTile.x + (anchor.x - previousRiskTile.x) * tackOutT : anchor.x;
  anchorScratch.y = previousRiskTile ? previousRiskTile.y + (anchor.y - previousRiskTile.y) * tackOutT : anchor.y;

  out.shipId = route.shipId;
  writeAnchorRideInto({
    route,
    zone: route.zone,
    timeSeconds,
    anchor: anchorScratch,
    elapsedSeconds: elapsedRiskSeconds,
    windowSeconds,
    entryPath,
    exitPath,
  }, out.tile, out.heading);
  out.state = "risk-drift";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
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
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = ANCHORED_WAKE_INTENSITY;
  out.sailSet = 0;
  out.riskTransition = previousRiskTile && tackOutT < 1
    ? { fromTile: previousRiskTile, toTile: anchor, progress: tackOutT }
    : null;
}

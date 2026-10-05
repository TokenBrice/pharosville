import { normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import { MOTION_UNDERWAY_MAX_TILES_PER_SECOND } from "../motion-config";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
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
/**
 * The tack-out eases a hull off its OLD risk tile onto a new one. Composed
 * berths put those tiles up to a plate apart, and sweeping that in three
 * seconds is a teleport, not a manoeuvre: beyond what a hull could sail in the
 * window, the new anchorage simply is the anchorage from the first frame.
 */
const RISK_TRANSITION_MAX_TILES = MOTION_UNDERWAY_MAX_TILES_PER_SECOND * RISK_TRANSITION_TACK_OUT_SECONDS;

/** A hull on its rode leaves no wake of its own; the field reads contact only. */
const ANCHORED_WAKE_INTENSITY = 0.03;

const anchorScratch = { x: 0, y: 0 };

/**
 * Rest at a risk-water anchorage between legs (W4.F9): the hull rides to its
 * anchor, bow to the settled wind and sheering on the rode by risk band. The
 * voyages either side blend onto and off that wind-lying heading themselves,
 * so the rest never pins itself to a path and never depends on which rest
 * window a sample falls in.
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
  const windowSeconds = Math.max(1, riskWindowSeconds);
  const elapsedRiskSeconds = progress * windowSeconds;
  const previousRiskTile = allowRiskTransition ? route.previousRiskTile : undefined;
  const tackOutT = previousRiskTile && elapsedRiskSeconds < RISK_TRANSITION_TACK_OUT_SECONDS
    ? smoothstep(elapsedRiskSeconds / RISK_TRANSITION_TACK_OUT_SECONDS)
    : 1;
  // The hull turns onto its new anchorage over the whole tack-out, but it can
  // only SAIL as far as the window allows: composed berths put the old and new
  // risk tiles up to a plate apart, and sweeping that in three seconds is a
  // teleport. The ride starts from the farthest point the hull could have
  // reached, so the heading ease is unchanged and the position stays plausible.
  const tackDistance = previousRiskTile
    ? Math.hypot(anchor.x - previousRiskTile.x, anchor.y - previousRiskTile.y) : 0;
  const sweep = tackDistance > RISK_TRANSITION_MAX_TILES ? RISK_TRANSITION_MAX_TILES / tackDistance : 1;
  anchorScratch.x = previousRiskTile
    ? anchor.x + (previousRiskTile.x - anchor.x) * sweep * (1 - tackOutT) : anchor.x;
  anchorScratch.y = previousRiskTile
    ? anchor.y + (previousRiskTile.y - anchor.y) * sweep * (1 - tackOutT) : anchor.y;

  out.shipId = route.shipId;
  writeAnchorRideInto({
    route,
    zone: route.zone,
    timeSeconds,
    anchor: anchorScratch,
    elapsedSeconds: elapsedRiskSeconds,
    windowSeconds,
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

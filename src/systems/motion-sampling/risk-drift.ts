import { normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
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

/**
 * Hold at the risk-water waypoint between legs. The legacy implementation
 * traced an ellipse continuously, making nominal rest look like imperceptible
 * drift. Wave 4b moves all meaningful displacement into waypoint-to-waypoint
 * legs and leaves this sample allocation-free and still.
 */
export function riskDriftSampleInto(
  route: ShipMotionRoute,
  _timeSeconds: number,
  progress: number,
  riskWindowSeconds: number,
  out: ShipMotionSample,
): void {
  const routePathKey = routePathIdentityKey(route, "risk-rest");
  beginRoutePathSample(route, routePathKey);
  const elapsedRiskSeconds = progress * Math.max(1, riskWindowSeconds);
  const tackOutT = route.previousRiskTile && elapsedRiskSeconds < RISK_TRANSITION_TACK_OUT_SECONDS
    ? smoothstep(elapsedRiskSeconds / RISK_TRANSITION_TACK_OUT_SECONDS)
    : 1;
  const centerX = route.previousRiskTile
    ? route.previousRiskTile.x + (route.riskTile.x - route.previousRiskTile.x) * tackOutT
    : route.riskTile.x;
  const centerY = route.previousRiskTile
    ? route.previousRiskTile.y + (route.riskTile.y - route.previousRiskTile.y) * tackOutT
    : route.riskTile.y;

  out.shipId = route.shipId;
  clampMotionTileInto(centerX, centerY, out.tile);
  out.state = "risk-drift";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(
    Math.cos(route.routeSeed * 0.0001),
    Math.sin(route.routeSeed * 0.0001),
    out.heading,
  );
  if (route.previousRiskTile && tackOutT < 1) {
    const tackDx = route.riskTile.x - route.previousRiskTile.x;
    const tackDy = route.riskTile.y - route.previousRiskTile.y;
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
  writeVelocityInto(out, 0, 0);
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = 0;
  out.riskTransition = route.previousRiskTile && tackOutT < 1
    ? { fromTile: route.previousRiskTile, toTile: route.riskTile, progress: tackOutT }
    : null;
}

import { ZONE_DWELL } from "../motion-config";
import { staleEvidenceMotionFactors } from "../motion-sampling-factors";
import { normalizeHeadingInto, smoothstep, smoothstepRange } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
import {
  clampMotionTileInto,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeRouteContextInto,
  writeVelocityInto,
} from "./shared";
import { beginRoutePathSample } from "./memory";

// W4.25 — fixed-duration tack-out window at the start of the risk-drift phase.
// After 3 seconds the sampler considers the transition complete and the ship
// orbits the new risk tile normally.
export const RISK_TRANSITION_TACK_OUT_SECONDS = 3;

// F2 — risk-repath heading easing. While the W4.25 tack-out translates the
// drift center from previousRiskTile → riskTile, the orbital heading alone
// makes the ship visibly crab sideways along the transition track. Ease the
// heading toward the tack direction over the first 500ms (ramping in, then
// back out as the tack-out completes) so the repath reads as a deliberate
// turn instead of a snap. Pure function of elapsed risk-drift seconds —
// deterministic per (shipId, route, time), no memory.
export const RISK_TRANSITION_HEADING_EASE_SECONDS = 0.5;

export function riskDriftSampleInto(route: ShipMotionRoute, timeSeconds: number, progress: number, out: ShipMotionSample): void {
  const routePathKey = routePathIdentityKey(route, "risk-drift");
  beginRoutePathSample(route, routePathKey);
  const staleFactors = staleEvidenceMotionFactors(route.staleEvidence);
  const angle = timeSeconds * 0.017 * staleFactors.angularFactor + route.routeSeed * 0.0001 + progress * Math.PI * 2;
  const radius = driftRadiusForZone(route.zone);
  // Smooth the drift radius to zero at the entry (progress=0) and exit
  // (progress=1) of the risk-water window. Without this, the departing→risk-drift
  // and risk-drift→arriving boundaries have a visible position jump equal to the
  // full drift offset (~0.54 tiles for danger zone).
  const radiusScale = smoothstepRange(0, 0.12, progress) * smoothstepRange(0, 0.12, 1 - progress);
  // W4.25 — when the route has previousRiskTile set, blend the drift center
  // from previous → current over the first RISK_TRANSITION_TACK_OUT_SECONDS
  // of the risk-drift phase. progress is the fraction of risk-drift elapsed,
  // and the absolute risk-drift seconds = progress × riskSecondsEach.
  const riskSecondsEach = route.cycleSeconds * ZONE_DWELL[route.zone].riskDwell;
  const elapsedRiskSeconds = progress * Math.max(1, riskSecondsEach);
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
  clampMotionTileInto(
    centerX + Math.cos(angle) * radius.x * radiusScale * staleFactors.radiusFactor,
    centerY + Math.sin(angle * 0.8) * radius.y * radiusScale * staleFactors.radiusFactor,
    out.tile,
  );
  out.state = "risk-drift";
  out.zone = route.zone;
  writeRouteContextInto(route, routePathKey, out);
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  normalizeHeadingInto(-Math.sin(angle), Math.cos(angle * 0.8), out.heading);
  // F2 — blend the orbital heading toward the tack direction while the drift
  // center is in motion. Weight ramps in over RISK_TRANSITION_HEADING_EASE_SECONDS
  // (no snap at phase entry) and decays with (1 - tackOutT) so the heading is
  // purely orbital again the moment the tack-out completes.
  if (route.previousRiskTile && tackOutT < 1) {
    const tackDx = route.riskTile.x - route.previousRiskTile.x;
    const tackDy = route.riskTile.y - route.previousRiskTile.y;
    const tackLength = Math.hypot(tackDx, tackDy);
    if (tackLength > 1e-6) {
      const easeIn = smoothstepRange(0, RISK_TRANSITION_HEADING_EASE_SECONDS, elapsedRiskSeconds);
      const easeWeight = easeIn * (1 - tackOutT);
      if (easeWeight > 0) {
        normalizeHeadingInto(
          out.heading.x + (tackDx / tackLength - out.heading.x) * easeWeight,
          out.heading.y + (tackDy / tackLength - out.heading.y) * easeWeight,
          out.heading,
        );
      }
    }
  }
  writeVelocityInto(
    out,
    -Math.sin(angle) * radius.x * radiusScale * staleFactors.radiusFactor * staleFactors.angularFactor * 0.017,
    Math.cos(angle * 0.8) * radius.y * radiusScale * staleFactors.radiusFactor * staleFactors.angularFactor * 0.8 * 0.017,
  );
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = 0.08;
  // W4.25 — surface the transition for detail-panel parity.
  if (route.previousRiskTile && tackOutT < 1) {
    out.riskTransition = {
      fromTile: route.previousRiskTile,
      toTile: route.riskTile,
      progress: tackOutT,
    };
  } else {
    out.riskTransition = null;
  }
}

const DRIFT_RADIUS_DANGER = { x: 0.54, y: 0.36 };
const DRIFT_RADIUS_WARNING = { x: 0.48, y: 0.32 };
const DRIFT_RADIUS_ALERT = { x: 0.44, y: 0.3 };
const DRIFT_RADIUS_WATCH = { x: 0.4, y: 0.28 };
const DRIFT_RADIUS_DEFAULT = { x: 0.38, y: 0.26 };

function driftRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return DRIFT_RADIUS_DANGER;
  if (zone === "warning") return DRIFT_RADIUS_WARNING;
  if (zone === "alert") return DRIFT_RADIUS_ALERT;
  if (zone === "watch") return DRIFT_RADIUS_WATCH;
  return DRIFT_RADIUS_DEFAULT;
}

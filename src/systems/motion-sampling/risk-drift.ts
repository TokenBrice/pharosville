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

/**
 * Radians per second along a patrol circuit (N3), by DEWS band.
 *
 * This is where the risk escalation lives now that amplitude is sized to each
 * region's water. Calm laps in ~145s (meditative); danger laps in ~60s
 * (restless). Everything stays slow enough to be relaxing to watch.
 */
// Chosen so LINEAR speed (radius x angular) still escalates with turbulence
// even though amplitude shrinks toward the tight corner bands:
//   calm 4.8x0.040=0.19  watch 4.3x0.052=0.22  alert 2.9x0.095=0.28
//   warning 2.2x0.150=0.33  danger 1.9x0.260=0.49
// Danger laps its corner every ~24s (restless); calm drifts a wide arc every
// ~157s (serene).
//
// Z3 (Sea Master, 2026-07-25): danger 0.21 -> 0.26.
//
// Zone areas are traffic-proportional now, and Danger Strait carries 11 ships
// against Warning Shoals' 5 — so storm-water grew from ~190 tiles to 953 while
// warning-water sits at 764. With the circuit radii unchanged, that left
// danger's linear speed only 1.21x warning's, and the sampled maximum (which
// picks up waypoint transit as well as the circuit) landed 1% the WRONG side of
// it: the roughest water in the world read as marginally calmer than the band
// below it. 0.26 restores a 1.5x margin, so the escalation is legible rather
// than knife-edge.
const PATROL_SPEED_DANGER = 0.26;
const PATROL_SPEED_WARNING = 0.15;
const PATROL_SPEED_ALERT = 0.095;
const PATROL_SPEED_WATCH = 0.052;
const PATROL_SPEED_DEFAULT = 0.04;

function patrolSpeedForZone(zone: ShipWaterZone): number {
  if (zone === "danger") return PATROL_SPEED_DANGER;
  if (zone === "warning") return PATROL_SPEED_WARNING;
  if (zone === "alert") return PATROL_SPEED_ALERT;
  if (zone === "watch") return PATROL_SPEED_WATCH;
  return PATROL_SPEED_DEFAULT;
}

export function riskDriftSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  progress: number,
  riskWindowSeconds: number,
  out: ShipMotionSample,
): void {
  const routePathKey = routePathIdentityKey(route, "risk-drift");
  beginRoutePathSample(route, routePathKey);
  const staleFactors = staleEvidenceMotionFactors(route.staleEvidence);
  // N3: a circuit took ~6 minutes at 0.017 rad/s, which reads as stationary.
  const patrolSpeed = patrolSpeedForZone(route.zone);
  const angle = timeSeconds * patrolSpeed * staleFactors.angularFactor
    + route.routeSeed * 0.0001
    + progress * Math.PI * 2;
  const radius = driftRadiusForZone(route.zone);
  // Smooth the drift radius to zero at the entry (progress=0) and exit
  // (progress=1) of the risk-water window. Without this, the departing→risk-drift
  // and risk-drift→arriving boundaries have a visible position jump equal to the
  // full drift offset (~0.54 tiles for danger zone).
  const radiusScale = smoothstepRange(0, 0.12, progress) * smoothstepRange(0, 0.12, 1 - progress);
  // W4.25 — when the route has previousRiskTile set, blend the drift center
  // from previous → current over the first RISK_TRANSITION_TACK_OUT_SECONDS
  // of the risk-drift phase. progress is the fraction of risk-drift elapsed,
  // and the absolute risk-drift seconds = progress × riskWindowSeconds, where
  // riskWindowSeconds is the caller's actual scheduled risk-phase duration
  // (docked ships derive it from the runtime dwell override and stop count,
  // not the raw ZONE_DWELL share — recomputing it here overshot by ~3.3×).
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
    -Math.sin(angle) * radius.x * radiusScale * staleFactors.radiusFactor * staleFactors.angularFactor * patrolSpeed,
    Math.cos(angle * 0.8) * radius.y * radiusScale * staleFactors.radiusFactor * staleFactors.angularFactor * 0.8 * patrolSpeed,
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

// N3 (2026-07-25): patrol amplitude, in tiles.
//
// These were 0.38-0.54 — a SUB-TILE circle completed once every ~6 minutes, so
// the fleet read as pinned to the water ("there is barely any ship movement").
// The world is now 4x larger, so there is finally room to sail.
//
// Amplitude is sized to the BAND'S OWN WATER, not to its risk. A patrol that
// overruns its region would carry a ship out of the water it is labelled with
// and break the analytical claim, so the tight corner bands get tight
// circuits: storm-water is ~190 tiles (roughly 14 across) while calm-water is
// ~5,900 (roughly 77 across).
//
// The DEWS escalation rides on SPEED instead (see PATROL_SPEED_FOR_ZONE):
// danger water churns fast in a tight agitated orbit, calm water drifts slowly
// over a wide serene arc. Both readings stay true, and the fleet's motion
// agrees with the swell, chop and foam its region already carries (D6).
const DRIFT_RADIUS_DANGER = { x: 1.9, y: 1.3 };
const DRIFT_RADIUS_WARNING = { x: 2.2, y: 1.5 };
const DRIFT_RADIUS_ALERT = { x: 2.9, y: 2.0 };
const DRIFT_RADIUS_WATCH = { x: 4.3, y: 2.9 };
const DRIFT_RADIUS_DEFAULT = { x: 4.8, y: 3.2 };

function driftRadiusForZone(zone: ShipWaterZone): { x: number; y: number } {
  if (zone === "danger") return DRIFT_RADIUS_DANGER;
  if (zone === "warning") return DRIFT_RADIUS_WARNING;
  if (zone === "alert") return DRIFT_RADIUS_ALERT;
  if (zone === "watch") return DRIFT_RADIUS_WATCH;
  return DRIFT_RADIUS_DEFAULT;
}

import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import { mooredRouteStopSampleInto } from "./mooring";
import { riskDriftSampleInto } from "./risk-drift";

/**
 * Sample the rest at the route's risk-water waypoint. Ledger vessels use the
 * authored ledger mooring; every other band holds at its risk waypoint. The
 * old orbit/roaming branches were deliberately removed in Wave 4b: visible
 * displacement now belongs to travel legs, while rests read as rests.
 */
export function riskWaterSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  progress: number,
  riskWindowSeconds: number,
  out: ShipMotionSample,
): void {
  if (route.riskStop?.kind === "ledger") {
    mooredRouteStopSampleInto(route, route.riskStop, timeSeconds, out);
    return;
  }
  riskDriftSampleInto(route, timeSeconds, progress, riskWindowSeconds, out);
}

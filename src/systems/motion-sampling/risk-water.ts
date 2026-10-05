import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import { mooredRouteStopSampleInto } from "./mooring";
import { riskDriftSampleInto } from "./risk-drift";

/**
 * Sample the rest at the route's risk-water waypoint. Ledger vessels lie to
 * the authored ledger mooring buoy; every other band rides to its anchor at the
 * risk waypoint. Visible displacement belongs to travel legs; rests read as
 * rests, and the voyages either side blend onto the rest's wind-lying heading
 * from their own ends rather than pinning the rest to a path.
 */
export function riskWaterSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  progress: number,
  riskWindowSeconds: number,
  out: ShipMotionSample,
): void {
  if (route.riskStop?.kind === "ledger") {
    const windowSeconds = Math.max(1, riskWindowSeconds);
    mooredRouteStopSampleInto(route, route.riskStop, timeSeconds, out, {
      elapsedSeconds: progress * windowSeconds,
      windowSeconds,
    });
    return;
  }
  riskDriftSampleInto(route, timeSeconds, progress, riskWindowSeconds, out);
}

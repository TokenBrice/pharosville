import type { ShipMotionRoute, ShipMotionSample, ShipWaterPath } from "../motion-types";
import { mooredRouteStopSampleInto } from "./mooring";
import { riskDriftSampleInto } from "./risk-drift";

/**
 * Sample the rest at the route's risk-water waypoint. Ledger vessels lie to
 * the authored ledger mooring buoy; every other band rides to its anchor at the
 * risk waypoint. Visible displacement belongs to travel legs; rests read as
 * rests. `entryPath`/`exitPath` are the voyages either side of the rest.
 */
export function riskWaterSampleInto(
  route: ShipMotionRoute,
  timeSeconds: number,
  progress: number,
  riskWindowSeconds: number,
  out: ShipMotionSample,
  entryPath?: ShipWaterPath,
  exitPath?: ShipWaterPath,
): void {
  if (route.riskStop?.kind === "ledger") {
    const windowSeconds = Math.max(1, riskWindowSeconds);
    mooredRouteStopSampleInto(route, route.riskStop, timeSeconds, out, {
      elapsedSeconds: progress * windowSeconds,
      windowSeconds,
      entryPath,
      exitPath,
    });
    return;
  }
  riskDriftSampleInto(route, timeSeconds, progress, riskWindowSeconds, out, route.riskTile, undefined, true, entryPath, exitPath);
}

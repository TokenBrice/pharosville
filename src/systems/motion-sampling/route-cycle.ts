import { positiveModulo } from "../motion-utils";
import type { SeaState } from "../sea-state";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import { activeStopCountForCycle, routeSamplingRuntime, scheduledDockStopAt } from "./route-runtime";
import { mooredSampleInto } from "./mooring";
import { transitSampleInto } from "./transit";
import { riskWaterSampleInto } from "./risk-water";
import { openWaterPatrolSampleInto } from "./open-water";

export function sampleRouteCycleInto(route: ShipMotionRoute, timeSeconds: number, seaState: SeaState | null, out: ShipMotionSample): void {
  const runtime = routeSamplingRuntime(route);
  if (runtime.scheduledStopCount === 0) {
    openWaterPatrolSampleInto(route, timeSeconds, out);
    out.seaState = seaState;
    return;
  }

  const cyclePosition = timeSeconds + route.phaseSeconds;
  const elapsedSeconds = positiveModulo(cyclePosition, route.cycleSeconds);
  const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
  const stopCount = activeStopCountForCycle(runtime);
  if (stopCount === 0) {
    openWaterPatrolSampleInto(route, timeSeconds, out);
    return;
  }

  const riskSecondsEach = route.cycleSeconds * runtime.zoneDwell.riskDwell / stopCount;
  const dockSecondsEach = route.cycleSeconds * runtime.zoneDwell.dockDwell / stopCount;
  const transitSecondsEach = route.cycleSeconds * runtime.zoneDwell.transit / (stopCount * 2);
  let cursor = elapsedSeconds;

  for (let stopIndex = 0; stopIndex < stopCount; stopIndex += 1) {
    const stop = scheduledDockStopAt(runtime, cycleIndex, stopIndex);
    const nextStop = scheduledDockStopAt(runtime, cycleIndex, (stopIndex + 1) % stopCount);
    if (!stop || !nextStop) break;

    if (cursor < dockSecondsEach) {
      const dwellProgress = cursor / Math.max(1, dockSecondsEach);
      mooredSampleInto({
        route,
        stop,
        dwellProgress,
        secondsRemaining: dockSecondsEach - cursor,
        outgoingPath: runtime.stopToRiskPathByDockId.get(stop.dockId),
        seaState,
        timeSeconds,
        runtime,
      }, out);
      return;
    }
    cursor -= dockSecondsEach;

    if (cursor < transitSecondsEach) {
      transitSampleInto({
        route,
        path: runtime.stopToRiskPathByDockId.get(stop.dockId),
        progress: cursor / Math.max(1, transitSecondsEach),
        transitSeconds: transitSecondsEach,
        state: "departing",
        routeStop: stop,
        seaState,
        fromMooringStop: stop,
        toMooringStop: null,
        timeSeconds,
        runtime,
      }, out);
      return;
    }
    cursor -= transitSecondsEach;

    if (cursor < riskSecondsEach) {
      riskWaterSampleInto(route, timeSeconds, cursor / Math.max(1, riskSecondsEach), out);
      out.seaState = seaState;
      return;
    }
    cursor -= riskSecondsEach;

    if (cursor < transitSecondsEach) {
      transitSampleInto({
        route,
        path: runtime.riskToStopPathByDockId.get(nextStop.dockId),
        progress: cursor / Math.max(1, transitSecondsEach),
        transitSeconds: transitSecondsEach,
        state: "arriving",
        routeStop: nextStop,
        seaState,
        fromMooringStop: null,
        toMooringStop: nextStop,
        timeSeconds,
        runtime,
      }, out);
      return;
    }
    cursor -= transitSecondsEach;
  }

  riskWaterSampleInto(route, timeSeconds, 1, out);
  out.seaState = seaState;
}

import { positiveModulo } from "../motion-utils";
import type { SeaState } from "../sea-state";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import { activeStopCountForCycle, routeSamplingRuntime, scheduledDockStopAt } from "./route-runtime";
import { mooredSampleInto } from "./mooring";
import { transitSampleInto } from "./transit";
import { riskWaterSampleInto } from "./risk-water";
import { openWaterPatrolSampleInto } from "./open-water";
import { MOTION_TRANSITION_SHARE } from "../motion-config";

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

  const riskSecondsEach = route.riskRestDurationSeconds ?? route.restDurationSeconds;
  const dockSecondsEach = route.restDurationSeconds;
  const transitSecondsEach = route.legDurationSeconds;
  let cursor = elapsedSeconds;

  for (let stopIndex = 0; stopIndex < stopCount; stopIndex += 1) {
    const scheduledDockId = route.dockStopSchedule[positiveModulo(cycleIndex, route.dockStopSchedule.length)];
    const stop = scheduledDockId
      ? runtime.dockStopByDockId.get(scheduledDockId) ?? scheduledDockStopAt(runtime, cycleIndex, stopIndex)
      : scheduledDockStopAt(runtime, cycleIndex, stopIndex);
    const nextScheduledDockId = route.dockStopSchedule[
      positiveModulo(cycleIndex + 1, route.dockStopSchedule.length)
    ];
    const nextStop = nextScheduledDockId
      ? runtime.dockStopByDockId.get(nextScheduledDockId) ?? stop
      : stop;
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
        sampleState: cursor / Math.max(1, transitSecondsEach) < MOTION_TRANSITION_SHARE
          ? "departing"
          : "sailing",
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
      riskWaterSampleInto(route, timeSeconds, cursor / Math.max(1, riskSecondsEach), riskSecondsEach, out);
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
        sampleState: cursor / Math.max(1, transitSecondsEach) >= 1 - MOTION_TRANSITION_SHARE
          ? "arriving"
          : "sailing",
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

  riskWaterSampleInto(route, timeSeconds, 1, riskSecondsEach, out);
  out.seaState = seaState;
}

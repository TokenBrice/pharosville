import type { ShipMotionSample } from "../motion-types";
import { createShipMotionSample, resetSampleChoreography, type ResolveShipMotionSampleInput } from "./shared";
import { reducedMotionSampleInto } from "./reduced-motion";
import { consortShadowSampleInto } from "./consort";
import { sampleRouteCycleInto } from "./route-cycle";
import { berthTidePhase, tidePhase } from "../motion-planning";
import { GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z } from "../weather";
import { isWaterTileKind, tileKindAt } from "../world-layout";

export function resolveShipMotionSample(input: ResolveShipMotionSampleInput): ShipMotionSample {
  const out = createShipMotionSample();
  resolveShipMotionSampleInto(input, out);
  return out;
}

export function resolveShipMotionSampleInto(input: ResolveShipMotionSampleInput, out: ShipMotionSample): void {
  const route = input.plan.shipRoutes.get(input.ship.id);
  resetSampleChoreography(out);
  if (input.reducedMotion || !route) {
    reducedMotionSampleInto(input.plan, input.ship, route, input.seaState ?? null, out);
    if (!out.currentDockId) {
      out.heading.x = -GARDEN_DEFAULT_WIND_X;
      out.heading.y = -GARDEN_DEFAULT_WIND_Z;
    }
    return;
  }

  if (input.ship.squadRole === "consort" && input.ship.squadId) {
    if (consortShadowSampleInto(input, route, out)) return;
  }

  sampleRouteCycleInto(route, input.timeSeconds, input.seaState ?? null, out);
  const stop = route.dockStops.find((entry) => entry.id === out.currentRouteStopId) ?? route.riskStop;
  out.tideOffset = Math.sin(stop && out.state === "moored"
    ? berthTidePhase(input.timeSeconds, stop.mooringTile)
    : tidePhase(input.timeSeconds)) * 0.055;
  const windX = input.wind?.x ?? GARDEN_DEFAULT_WIND_X;
  const windY = input.wind?.y ?? GARDEN_DEFAULT_WIND_Z;
  if (!out.currentDockId && (out.state === "moored" || out.state === "idle" || (out.speedTilesPerSecond ?? 0) === 0)) {
    out.heading.x = -windX;
    out.heading.y = -windY;
  } else if (input.wind && (out.speedTilesPerSecond ?? 0) > 0) {
    // Cross-current fades at transit endpoints, preserving the mooring seam.
    const strength = Math.min(1, (out.speedTilesPerSecond ?? 0) / 0.08) * input.wind.speed * 0.012;
    const cross = windX * -out.heading.y + windY * out.heading.x;
    const x = out.tile.x - out.heading.y * cross * strength;
    const y = out.tile.y + out.heading.x * cross * strength;
    if (isWaterTileKind(tileKindAt(Math.round(x), Math.round(y)))) {
      out.tile.x = x;
      out.tile.y = y;
    }
  }
}

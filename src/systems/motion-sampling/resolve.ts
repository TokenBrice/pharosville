import type { ShipMotionSample } from "../motion-types";
import { createShipMotionSample, resetSampleChoreography, type ResolveShipMotionSampleInput } from "./shared";
import { reducedMotionSampleInto } from "./reduced-motion";
import { consortShadowSampleInto } from "./consort";
import { sampleRouteCycleInto } from "./route-cycle";

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
    return;
  }

  if (input.ship.squadRole === "consort" && input.ship.squadId) {
    if (consortShadowSampleInto(input, route, out)) return;
  }

  sampleRouteCycleInto(route, input.timeSeconds, input.seaState ?? null, out);
}

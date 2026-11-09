import type { EngineContext } from "../engine/types";
import type { HarbourModel } from "../model/types";
import type { PreparedPlan } from "../sim/plan-paths";
import { deferred } from "../engine/deferred";
import { abortable } from "../engine/transport";

export interface PreparedFleet { revision: number; commit(): void; dispose(): void }
export type PrepareFleet = (model: HarbourModel, plan: PreparedPlan | undefined, revision: number, signal?: AbortSignal) => Promise<PreparedFleet>;

/** Data can finish planning before FleetSystem has loaded its kit; publication waits for both owners. */
export class FleetPreparation {
  private readonly ready = deferred<PrepareFleet>();
  register(prepare: PrepareFleet): void { this.ready.resolve(prepare); }
  async prepareFleet(model: HarbourModel, plan: PreparedPlan | undefined, revision: number, signal?: AbortSignal): Promise<PreparedFleet> {
    const prepare = signal ? await abortable(this.ready.promise, signal) : await this.ready.promise;
    return prepare(model, plan, revision, signal);
  }
}

export function fleetPreparation(ctx: EngineContext): FleetPreparation {
  let service = ctx.services.get("fleet-preparation");
  if (!service) { service = new FleetPreparation(); ctx.services.set("fleet-preparation", service); }
  return service;
}

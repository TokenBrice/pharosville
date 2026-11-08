import { Engine } from "./engine/engine";
import type { ReadinessState, SimulationStatus } from "./engine/types";
import { publishPresentation, renderedPresentation } from "./ui/presentation";
import { SYSTEMS } from "./systems";
import { mountHarbourUI } from "./ui/mount";

/**
 * Dev/standalone entry (harbour.html). The production React shell mounts the same Engine later.
 * Systems are listed in ./systems.ts (registration order = update order).
 */
async function boot() {
  const root = document.getElementById("harbour-root");
  if (!root) throw new Error("missing #harbour-root");
  const engine = new Engine(root);
  for (const make of SYSTEMS) engine.add(make());
  await engine.init();
  engine.onRendered((rendered) => publishPresentation(engine.ctx, renderedPresentation(rendered,
    engine.ctx.services.get("readiness") as ReadinessState | undefined,
    (engine.ctx.services.get("simulation-status") as SimulationStatus | undefined)?.unavailable === true)));
  engine.start();
  const ui = document.getElementById("harbour-ui");
  if (ui) mountHarbourUI(engine, ui);
}

boot().catch((err) => { console.error("[harbour] boot failed", err); });

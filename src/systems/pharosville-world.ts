import { SHIP_WATER_ANCHORS, waterZoneForPlacement } from "./risk-water-areas";
import { buildVisualCueRegistry } from "./visual-cue-registry";
import { buildDetailIndexStage } from "./pharosville-world/stages/detail-index";
import { buildDockAssignmentStage } from "./pharosville-world/stages/dock-assignment";
import { buildShipsStage } from "./pharosville-world/stages/ship-placement";
import { buildWorldScaffoldStage, resolveGeneratedAt } from "./pharosville-world/stages/world-scaffold";
import type { PharosVilleWorld } from "./world-types";
import type { PharosVilleInputs, PharosVilleWorldBase } from "./pharosville-world/pipeline-types";

export { SHIP_WATER_ANCHORS, waterZoneForPlacement };
export type { PharosVilleInputs };

export function buildPharosVilleWorld(inputs: PharosVilleInputs): PharosVilleWorld {
  const scaffold = buildWorldScaffoldStage(inputs);
  const shipsStage = buildShipsStage(inputs, scaffold.docks);
  const dockAssignmentStage = buildDockAssignmentStage(shipsStage.ships, scaffold.docks);

  const baseWorld: PharosVilleWorldBase = {
    generatedAt: resolveGeneratedAt(inputs),
    routeMode: inputs.routeMode ?? "world",
    freshness: inputs.freshness,
    map: scaffold.map,
    lighthouse: scaffold.lighthouse,
    docks: scaffold.docks,
    areas: scaffold.areas,
    ships: dockAssignmentStage.ships,
    graves: scaffold.graves,
    effects: [],
    legends: [
      { id: "legend.psi", label: "Lighthouse", description: "PSI composite status" },
      { id: "legend.docks", label: "Docks", description: "Top chain harbors by stablecoin supply" },
      { id: "legend.ships", label: "Ships", description: "Active stablecoins" },
      { id: "legend.cemetery", label: "Cemetery", description: "Dead and frozen assets" },
    ],
  };

  const detailIndexStage = buildDetailIndexStage(baseWorld);
  return {
    ...baseWorld,
    detailIndex: detailIndexStage.detailIndex,
    visualCues: buildVisualCueRegistry(),
  };
}

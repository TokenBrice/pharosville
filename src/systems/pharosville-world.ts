import { SHIP_WATER_ANCHORS, waterZoneForPlacement } from "./risk-water-areas";
import { buildVisualCueRegistry } from "./visual-cue-registry";
import { buildCargoTideStage } from "./pharosville-world/stages/cargo-tide";
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
  // Runs last of the data stages: allocating each coin's issuance across the
  // harbours it berths at needs the ships' composed chain presence, which only
  // exists once placement has run.
  const cargoTideStage = buildCargoTideStage(
    scaffold.docks,
    dockAssignmentStage.ships,
    inputs.mintBurn,
  );

  const baseWorld: PharosVilleWorldBase = {
    generatedAt: resolveGeneratedAt(inputs),
    routeMode: inputs.routeMode ?? "world",
    freshness: inputs.freshness,
    map: scaffold.map,
    lighthouse: scaffold.lighthouse,
    pigeonnier: scaffold.pigeonnier,
    docks: cargoTideStage.docks,
    areas: scaffold.areas,
    ships: dockAssignmentStage.ships,
    graves: scaffold.graves,
    fleetIssuance: cargoTideStage.fleetIssuance,
  };

  const detailIndexStage = buildDetailIndexStage(baseWorld);
  return {
    ...baseWorld,
    detailIndex: detailIndexStage.detailIndex,
    entityById: detailIndexStage.entityById,
    visualCues: buildVisualCueRegistry(),
  };
}

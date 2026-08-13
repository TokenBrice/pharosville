import { SHIP_WATER_ANCHORS, waterZoneForPlacement } from "./risk-water-areas";
import { buildVisualCueRegistry } from "./visual-cue-registry";
import { buildCargoTideStage } from "./pharosville-world/stages/cargo-tide";
import { buildDetailIndexStage } from "./pharosville-world/stages/detail-index";
import { buildDockAssignmentStage } from "./pharosville-world/stages/dock-assignment";
import { buildShipsStage } from "./pharosville-world/stages/ship-placement";
import { buildWorldScaffoldStage, resolveGeneratedAt } from "./pharosville-world/stages/world-scaffold";
import type { PharosVilleWorld, ShipNode } from "./world-types";
import { pigeonnierWatchForWorld } from "./pigeonnier-watch";
import type { PharosVilleInputs, PharosVilleWorldBase } from "./pharosville-world/pipeline-types";

export { SHIP_WATER_ANCHORS, waterZoneForPlacement };
export type { PharosVilleInputs };

export function buildPharosVilleWorld(inputs: PharosVilleInputs): PharosVilleWorld {
  const scaffold = buildWorldScaffoldStage(inputs);
  const shipsStage = buildShipsStage(inputs, scaffold.docks);
  const dependencyFormationByChild = new Map<string, NonNullable<PharosVilleWorld["ships"][number]["dependencyFormation"]>>();
  const shipIds = new Set(shipsStage.ships.map((ship) => ship.id));
  for (const edge of inputs.reportCards?.dependencyGraph.edges ?? []) {
    if (!shipIds.has(edge.from) || !shipIds.has(edge.to) || edge.from === edge.to) continue;
    const current = dependencyFormationByChild.get(edge.from);
    if (!current || edge.weight > current.weight) {
      dependencyFormationByChild.set(edge.from, {
        parentId: edge.to,
        type: edge.type,
        weight: Math.max(0, Math.min(1, edge.weight)),
      });
    }
  }
  const dependencyShips: ShipNode[] = shipsStage.ships.map((ship) => ({
    ...ship,
    // Preserve the deliberately authored squad grammar. The dependency graph
    // extends that language to otherwise independent ships.
    dependencyFormation: ship.squadId ? null : dependencyFormationByChild.get(ship.id) ?? null,
  }));
  const dockAssignmentStage = buildDockAssignmentStage(dependencyShips, scaffold.docks);
  // Runs last of the data stages: allocating each coin's issuance across the
  // harbours it berths at needs the ships' composed chain presence, which only
  // exists once placement has run.
  const cargoTideStage = buildCargoTideStage(
    scaffold.docks,
    dockAssignmentStage.ships,
    inputs.mintBurn,
  );
  const pigeonnier = {
    ...scaffold.pigeonnier,
    ...pigeonnierWatchForWorld({ ships: dockAssignmentStage.ships }, inputs.pegSummary),
  };

  const baseWorld: PharosVilleWorldBase = {
    generatedAt: resolveGeneratedAt(inputs),
    routeMode: inputs.routeMode ?? "world",
    freshness: inputs.freshness,
    map: scaffold.map,
    lighthouse: scaffold.lighthouse,
    pigeonnier,
    docks: cargoTideStage.docks,
    areas: scaffold.areas,
    ships: dockAssignmentStage.ships,
    graves: scaffold.graves,
    fleetIssuance: cargoTideStage.fleetIssuance,
    supplyTide: scaffold.supplyTide,
  };

  const detailIndexStage = buildDetailIndexStage(baseWorld);
  return {
    ...baseWorld,
    detailIndex: detailIndexStage.detailIndex,
    entityById: detailIndexStage.entityById,
    visualCues: buildVisualCueRegistry(),
  };
}

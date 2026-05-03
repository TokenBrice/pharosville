import {
  detailForDock,
  detailForGrave,
  detailForLighthouse,
  detailForArea,
  detailForPigeonnier,
  detailForShip,
} from "../../detail-model";
import type { SelectableWorldEntity, ShipNode } from "../../world-types";
import type { DetailIndexStage, PharosVilleWorldBase } from "../pipeline-types";

function buildDetailIndex(world: PharosVilleWorldBase): DetailIndexStage["detailIndex"] {
  // Group ships by their squad so the detail panel can list squad-mates.
  const shipsBySquad = new Map<string, ShipNode[]>();
  for (const ship of world.ships) {
    if (!ship.squadId) continue;
    const list = shipsBySquad.get(ship.squadId) ?? [];
    list.push(ship);
    shipsBySquad.set(ship.squadId, list);
  }
  const details = [
    detailForLighthouse(world.lighthouse),
    detailForPigeonnier(world.pigeonnier),
    ...world.docks.map(detailForDock),
    ...world.ships.map((ship) => (
      ship.squadId
        ? detailForShip(ship, { squadShips: shipsBySquad.get(ship.squadId) ?? [], allShips: world.ships })
        : detailForShip(ship, { allShips: world.ships })
    )),
    ...world.areas.map(detailForArea),
    ...world.graves.map(detailForGrave),
  ];
  return Object.fromEntries(details.map((detail) => [detail.id, detail]));
}

function buildEntityById(world: PharosVilleWorldBase): DetailIndexStage["entityById"] {
  // Single keyed map covering every selectable entity (lighthouse, docks,
  // ships, areas, graves) so detail-panel lookups are O(1). Keyed by the
  // entity's `detailId` to match how callers (`selectedDetailId`) reference
  // selections. Entity `detailId`s are globally unique by prefix
  // (`lighthouse`, `dock.*`, `ship.*`, `area.*`, `grave.*`).
  const entityById: Record<string, SelectableWorldEntity> = {};
  const assign = (entity: SelectableWorldEntity): void => {
    if (entityById[entity.detailId]) {
      throw new Error(`Duplicate entity detailId in PharosVille world: ${entity.detailId}`);
    }
    entityById[entity.detailId] = entity;
  };
  assign(world.lighthouse);
  assign(world.pigeonnier);
  for (const dock of world.docks) assign(dock);
  for (const ship of world.ships) assign(ship);
  for (const area of world.areas) assign(area);
  for (const grave of world.graves) assign(grave);
  return entityById;
}

export function buildDetailIndexStage(world: PharosVilleWorldBase): DetailIndexStage {
  return {
    detailIndex: buildDetailIndex(world),
    entityById: buildEntityById(world),
  };
}

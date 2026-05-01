import {
  detailForDock,
  detailForGrave,
  detailForLighthouse,
  detailForArea,
  detailForShip,
} from "../../detail-model";
import type { ShipNode } from "../../world-types";
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
    ...world.docks.map(detailForDock),
    ...world.ships.map((ship) => (
      ship.squadId
        ? detailForShip(ship, { squadShips: shipsBySquad.get(ship.squadId) ?? [] })
        : detailForShip(ship)
    )),
    ...world.areas.map(detailForArea),
    ...world.graves.map(detailForGrave),
  ];
  return Object.fromEntries(details.map((detail) => [detail.id, detail]));
}

export function buildDetailIndexStage(world: PharosVilleWorldBase): DetailIndexStage {
  return {
    detailIndex: buildDetailIndex(world),
  };
}

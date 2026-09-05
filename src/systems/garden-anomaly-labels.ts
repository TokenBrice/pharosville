import type { ShipNode } from "./world-types";

export const GARDEN_ANOMALY_NAMEPLATE_CAP = 6;

type GardenAnomalyShip = Pick<ShipNode, "detailId" | "marketCapUsd" | "riskZone" | "dexCrossCheck">;

/**
 * Existing analytical cues only: DEX disagreement (`cue.ship.cross-bearing-buoy`)
 * or Danger risk water (`cue.ship.distance`). Missing cross-checks are not alarms.
 * Like arrival beats, bounded insertion prioritizes market cap, then detail id,
 * without sorting or copying the fleet. This selection needs no motion clock.
 */
export function selectGardenAnomalyShipDetailIds(world: { ships: readonly GardenAnomalyShip[] }): string[] {
  const selected: GardenAnomalyShip[] = [];
  for (const ship of world.ships) {
    if (ship.dexCrossCheck?.agrees !== false && ship.riskZone !== "danger") continue;
    let insertAt = selected.length;
    while (insertAt > 0) {
      const previous = selected[insertAt - 1]!;
      const priority = previous.marketCapUsd - ship.marketCapUsd || ship.detailId.localeCompare(previous.detailId);
      if (priority >= 0) break;
      insertAt -= 1;
    }
    if (insertAt >= GARDEN_ANOMALY_NAMEPLATE_CAP) continue;
    selected.splice(insertAt, 0, ship);
    if (selected.length > GARDEN_ANOMALY_NAMEPLATE_CAP) selected.pop();
  }
  return selected.map((ship) => ship.detailId);
}

/** Anomalies retain priority; append arrivals only when their id is not already present. */
export function unionGardenShipLabelDetailIds(
  anomalyShipDetailIds: readonly string[],
  arrivalShipDetailIds: readonly string[],
): string[] {
  const ids = new Set(anomalyShipDetailIds);
  for (const detailId of arrivalShipDetailIds) ids.add(detailId);
  return [...ids];
}

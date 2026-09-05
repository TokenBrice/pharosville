import type { GardenFleetMooringPlacement } from "./garden-fleet-placement";
import type { ShipNode, ShipSizeTier } from "./world-types";

// 0.5 (was 0.7, 2026-09-06): the rest opened out to 0.72 and the fleet must
// stay whole there and through the first zoom-out steps; thinning is for the
// approach to whole-map, not for the resting frame.
export const GARDEN_FLEET_THINNING_START_ZOOM = 0.5;
export const GARDEN_FLEET_THINNING_FADE_WIDTH = 0.05;
export const GARDEN_FLEET_WHOLE_MAP_ZOOM = 0.3;

export interface GardenFleetThinningShip extends GardenFleetMooringPlacement {
  formationFlagship: boolean;
  id: string;
  sizeTier: ShipSizeTier;
}

export interface GardenFleetThinningInput {
  focusedShipId?: string | null;
  hoveredShipId?: string | null;
  selectedShipId?: string | null;
  ships: readonly GardenFleetThinningShip[];
  zoom: number;
}

/** Adapts world ships and their placement hierarchy into the pure thinning input. */
export function gardenFleetThinningShips(
  ships: readonly ShipNode[],
  mooringByShipId: ReadonlyMap<string, GardenFleetMooringPlacement>,
): GardenFleetThinningShip[] {
  return ships.map((ship) => {
    const mooring = mooringByShipId.get(ship.id);
    return {
      dominantMooring: mooring?.dominantMooring ?? true,
      formationFlagship: ship.squadRole === "flagship",
      id: ship.id,
      mooringId: mooring?.mooringId ?? `${ship.riskZone}.0`,
      mooringSize: mooring?.mooringSize ?? 1,
      rankWithinMooring: mooring?.rankWithinMooring ?? 0,
      riskBand: ship.riskZone,
      sizeTier: ship.visual.sizeTier,
    };
  });
}

/**
 * Resolves a reversible display-only presence for every placed hull.
 *
 * The removal order is authored from anchorage structure, never random: outer
 * ranks in the smallest secondary moorings yield first. At whole-map framing
 * the dominant mooring in each band remains intact and every other mooring
 * keeps its one or two innermost representatives. Each removable ship owns a
 * 0.05-wide smooth fade band, so zooming through the thresholds cannot pop.
 */
export function gardenFleetDisplayPresence(
  input: GardenFleetThinningInput,
): Map<string, number> {
  const presenceByShipId = new Map<string, number>();
  if (input.zoom >= GARDEN_FLEET_THINNING_START_ZOOM) {
    for (const ship of input.ships) presenceByShipId.set(ship.id, 1);
    return presenceByShipId;
  }

  const removable = input.ships
    .filter((ship) => !isProtected(ship, input) && !survivesWholeMap(ship))
    .toSorted((left, right) => (
      left.mooringSize - right.mooringSize
      || right.rankWithinMooring - left.rankWithinMooring
      || left.riskBand.localeCompare(right.riskBand)
      || left.mooringId.localeCompare(right.mooringId)
      || left.id.localeCompare(right.id)
    ));
  const removalIndexById = new Map(removable.map((ship, index) => [ship.id, index]));
  const lastRemovalIndex = Math.max(1, removable.length - 1);

  for (const ship of input.ships) {
    const removalIndex = removalIndexById.get(ship.id);
    if (removalIndex === undefined) {
      presenceByShipId.set(ship.id, 1);
      continue;
    }
    const fadeStart = GARDEN_FLEET_THINNING_START_ZOOM
      - (removalIndex / lastRemovalIndex)
        * (GARDEN_FLEET_THINNING_START_ZOOM
          - GARDEN_FLEET_WHOLE_MAP_ZOOM
          - GARDEN_FLEET_THINNING_FADE_WIDTH);
    const t = clamp01(
      (input.zoom - (fadeStart - GARDEN_FLEET_THINNING_FADE_WIDTH))
        / GARDEN_FLEET_THINNING_FADE_WIDTH,
    );
    presenceByShipId.set(ship.id, t * t * (3 - 2 * t));
  }
  return presenceByShipId;
}

function survivesWholeMap(ship: GardenFleetThinningShip): boolean {
  if (ship.dominantMooring) return true;
  const representativeCount = ship.mooringSize >= 4 ? 2 : 1;
  return ship.rankWithinMooring < representativeCount;
}

function isProtected(
  ship: GardenFleetThinningShip,
  input: GardenFleetThinningInput,
): boolean {
  return ship.sizeTier === "titan"
    || ship.sizeTier === "unique"
    || ship.formationFlagship
    || ship.id === input.selectedShipId
    || ship.id === input.hoveredShipId
    || ship.id === input.focusedShipId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

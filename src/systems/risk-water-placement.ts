import { riskWaterAreaForPlacement } from "./risk-water-areas";
import { distanceToStationFootprint, stationFootprintRect } from "./dock-layout";
import { isGardenObstacleTile } from "./garden-water-exclusion";
import {
  EVM_BAY_STATION_SLOTS,
  OUTER_HARBOR_STATION_SLOTS,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEONNIER_STATION_SLOT,
  clampMapTile,
  isWaterTileKind,
  terrainKindAt,
  tileKindAt,
} from "./world-layout";
import type { ShipRiskPlacement } from "./world-types";

/**
 * R4 keep-outs for the nine rendered stations (plan §8 L11). A risk tile is
 * a hazard marker for open water, and one placed inside a harbor reads as a
 * buoy stranded on the quay. This predicate used to ignore dock structures
 * entirely, and the redistributed ring made that visible: every spread mouth
 * now sits inside a risk-anchor field (measured mouth-to-nearest-anchor:
 * south↔watch 0.0 tiles, east↔watch 3.2, the Mole↔calm 4.5, north↔warning
 * 5.0), so placement water reached right onto the stations — the
 * `ethereum-mole` and `calm-engawa-south` mouth tiles were themselves valid
 * safe-harbor water.
 *
 * Each keep-out is the station's measured local envelope, rotated by the
 * cove's authored seaward bearing and rooted at the cove tile. This preserves
 * the real landward apron and hall as well as the seaward pier. Placement is
 * authored before a live chain binds to the berth, so the fixed measured
 * maximum recipe bounds are the conservative contract.
 */
const STATION_FOOTPRINT_RECTS = Object.freeze(
  [
    ...EVM_BAY_STATION_SLOTS,
    ...OUTER_HARBOR_STATION_SLOTS,
    PIGEONNIER_STATION_SLOT,
  ].map((slot) => stationFootprintRect(
    slot.type,
    slot.cove.tile,
    slot.cove.seawardBearing,
    slot.cove.id,
  )),
);

/**
 * A risk marker occupies its whole tile, so a centre within half a tile of
 * an envelope still means the marker's tile overlaps the structure — and
 * that half-tile also absorbs the floating-point dust of a mouth tile
 * sitting exactly on a berth's root corner.
 */
const RISK_MARKER_TILE_HALF = 0.5;


export function isRiskPlacementWaterTile(tile: { x: number; y: number }, placement: ShipRiskPlacement): boolean {
  // Zones-v2 placement fix: painted zone water under the RENDERED island
  // rock (or any decorative islet) is not usable — the garden island mesh is
  // display-decoupled from the terrain model and covers some data water.
  if (isGardenObstacleTile(tile.x, tile.y)) return false;
  // ...and neither is the water a station stands on: a tile whose centre
  // lies within half a tile of the harbor ring's enlarged envelope is quay,
  // pier or mole, not open sea (R4).
  if (STATION_FOOTPRINT_RECTS.some((station) => (
    distanceToStationFootprint(tile, station) <= RISK_MARKER_TILE_HALF
  ))) return false;
  const terrain = terrainKindAt(tile.x, tile.y);
  const validTerrains = riskWaterAreaForPlacement(placement).validTerrains;
  if (validTerrains === "any-water") return isWaterTileKind(tileKindAt(tile.x, tile.y));
  return validTerrains.includes(terrain);
}

export function nearestRiskPlacementWaterTile(
  tile: { x: number; y: number },
  placement: ShipRiskPlacement,
  maxRadius = 12,
): { x: number; y: number } | null {
  if (isRiskPlacementWaterTile(tile, placement)) return tile;

  let bestTile: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = {
          ...clampMapTile({ x: tile.x + dx, y: tile.y + dy }),
        };
        if (!isRiskPlacementWaterTile(candidate, placement)) continue;
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < bestDistance) {
          bestTile = candidate;
          bestDistance = distance;
        }
      }
    }
    if (bestTile) return bestTile;
  }

  return null;
}

// A whole-map scan per placement, and the terrain field it reads is fixed for
// the session — so the answer is too. Memoised because the ship spread asks for
// it once per placement on every world build (and a build happens on every data
// refresh). Callers only read the tiles, so the shared array is frozen.
const candidatesByPlacement = new Map<ShipRiskPlacement, readonly { x: number; y: number }[]>();

export function riskPlacementWaterTiles(placement: ShipRiskPlacement): readonly { x: number; y: number }[] {
  const cached = candidatesByPlacement.get(placement);
  if (cached) return cached;
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const candidate = { x, y };
      if (isRiskPlacementWaterTile(candidate, placement)) candidates.push(Object.freeze(candidate));
    }
  }
  const frozen = Object.freeze(candidates);
  candidatesByPlacement.set(placement, frozen);
  return frozen;
}

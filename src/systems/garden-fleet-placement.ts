import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  terrainKindAt,
} from "./world-layout";
import {
  gardenShipWaterMarginTiles,
  isGardenShipWater,
} from "./garden-water-exclusion";
import { gardenShipVisualScale } from "./garden-observatory-slice";
import type { ShipNode, ShipWaterZone, TerrainKind } from "./world-types";

/**
 * W3 (Grand Scale Revamp): region-scoped blue-noise placement for the whole
 * fleet.
 *
 * Replaces the authored per-zone rings in `representativeShipDisplayOffsets`,
 * which were sized for ~20 visible ships. At 187 the rings saturated and every
 * overflow hull was snapped into the same few free tiles, piling ships onto
 * the island and each other (plan finding F4).
 *
 * Ships are scattered across the painted terrain region their risk band owns —
 * the SAME field `terrainKindAt` gives the simulation (finding F6), so a ship
 * is always drawn inside the region it is labelled with. Spacing is
 * best-candidate sampling (Mitchell), which yields a blue-noise distribution:
 * evenly spread but never a grid, and never clumped.
 *
 * Deterministic by construction. Runs once per world, not per frame.
 */

/** Painted terrain kind that each risk band's ships live on. */
const TERRAIN_FOR_ZONE: Record<ShipWaterZone, TerrainKind> = {
  alert: "alert-water",
  calm: "calm-water",
  danger: "storm-water",
  ledger: "ledger-water",
  warning: "warning-water",
  watch: "watch-water",
};

/**
 * Candidate tiles considered per ship. Higher is more evenly spread and more
 * expensive; 16 is well past the point where the distribution stops visibly
 * improving.
 */
const CANDIDATES_PER_SHIP = 16;

/**
 * W3.2: the composition invariant ("a framed asymmetric composition with
 * useful open water") survives the scale-up as a density field rather than a
 * small ship count.
 *
 * Two rules shape it: keep a clear sightline to the lighthouse so the monument
 * is never crowded out, and thin the fleet toward the map edges so the frame
 * reads as composed rather than tiled.
 */
const LIGHTHOUSE_CLEARANCE_TILES = 9;
const EDGE_FALLOFF_TILES = 6;

export interface GardenFleetPlacement {
  /** Absolute display tile per ship id. */
  tileByShipId: Map<string, { x: number; y: number }>;
}

interface RegionTiles {
  tiles: { x: number; y: number }[];
}

let regionCache: Map<TerrainKind, RegionTiles> | null = null;

/**
 * All navigable tiles of each painted water region, computed once.
 *
 * Obstacle-free at a nominal margin only — the per-ship hull margin is applied
 * at selection time, since it scales with the hull.
 */
function regionTiles(): Map<TerrainKind, RegionTiles> {
  if (regionCache) return regionCache;
  const byKind = new Map<TerrainKind, RegionTiles>();
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const kind = terrainKindAt(x, y);
      const region = byKind.get(kind) ?? { tiles: [] };
      region.tiles.push({ x, y });
      byKind.set(kind, region);
    }
  }
  regionCache = byKind;
  return byKind;
}

/** Test-only: clears the memoised terrain scan. */
export function resetGardenFleetPlacementCache(): void {
  regionCache = null;
}

/**
 * Density weight for a candidate tile: how much this spot wants a ship.
 *
 * Zero means "never place here". The lighthouse clearance keeps the monument's
 * approach open; the edge falloff thins the outer frame so the composition
 * stays asymmetric instead of filling to the borders.
 */
function densityWeight(
  x: number,
  y: number,
  lighthouseTile: { x: number; y: number },
): number {
  const lighthouseDistance = Math.hypot(x - lighthouseTile.x, y - lighthouseTile.y);
  if (lighthouseDistance < LIGHTHOUSE_CLEARANCE_TILES) return 0;

  const edgeDistance = Math.min(
    x,
    y,
    PHAROSVILLE_MAP_WIDTH - 1 - x,
    PHAROSVILLE_MAP_HEIGHT - 1 - y,
  );
  if (edgeDistance <= 0) return 0;
  return Math.min(1, edgeDistance / EDGE_FALLOFF_TILES);
}

/**
 * Scatters the fleet across its regions.
 *
 * Ships are grouped by risk band, then each band's ships are placed one at a
 * time into the band's painted region: sample `CANDIDATES_PER_SHIP` tiles
 * deterministically, score each by distance to the nearest already-placed ship
 * (times the density weight), and keep the best. That is Mitchell's
 * best-candidate algorithm — cheap, deterministic, and blue-noise in
 * character.
 */
export function placeGardenFleet(
  ships: readonly ShipNode[],
  lighthouseTile: { x: number; y: number },
): GardenFleetPlacement {
  const regions = regionTiles();
  const tileByShipId = new Map<string, { x: number; y: number }>();

  const byZone = new Map<ShipWaterZone, ShipNode[]>();
  for (const ship of ships) {
    const group = byZone.get(ship.riskZone) ?? [];
    group.push(ship);
    byZone.set(ship.riskZone, group);
  }

  for (const [zone, group] of byZone) {
    // Stable order so a given ship keeps its berth across refreshes.
    const ordered = group.toSorted((left, right) => left.id.localeCompare(right.id));
    const region = regions.get(TERRAIN_FOR_ZONE[zone]);
    const candidates = region?.tiles ?? [];
    if (candidates.length === 0) {
      // A band with no painted water of its own (possible when a band is
      // empty in the data) falls back to the ship's authored tile.
      for (const ship of ordered) tileByShipId.set(ship.id, { ...ship.tile });
      continue;
    }

    const placed: { x: number; y: number }[] = [];
    for (const ship of ordered) {
      const margin = gardenShipWaterMarginTiles(
        gardenShipVisualScale(ship.visual.scale || 1),
      );
      let best: { x: number; y: number } | null = null;
      let bestScore = -1;

      for (let attempt = 0; attempt < CANDIDATES_PER_SHIP; attempt += 1) {
        const pick = candidates[
          Math.floor(stableUnit(`${ship.id}.place.${attempt}`) * candidates.length)
        ];
        if (!pick) continue;
        // Sub-tile jitter so the fleet never snaps to a lattice.
        const tile = {
          x: pick.x + stableUnit(`${ship.id}.jx.${attempt}`) - 0.5,
          y: pick.y + stableUnit(`${ship.id}.jy.${attempt}`) - 0.5,
        };
        const weight = densityWeight(tile.x, tile.y, lighthouseTile);
        if (weight <= 0) continue;
        if (!isGardenShipWater(tile, margin)) continue;

        let nearest = Number.POSITIVE_INFINITY;
        for (const other of placed) {
          const distance = Math.hypot(tile.x - other.x, tile.y - other.y);
          if (distance < nearest) nearest = distance;
        }
        // First ship in a region has no neighbour — let density decide.
        const score = (nearest === Number.POSITIVE_INFINITY ? 32 : nearest) * weight;
        if (score > bestScore) {
          bestScore = score;
          best = tile;
        }
      }

      const resolved = best ?? { ...ship.tile };
      placed.push(resolved);
      tileByShipId.set(ship.id, resolved);
    }
  }

  return { tileByShipId };
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

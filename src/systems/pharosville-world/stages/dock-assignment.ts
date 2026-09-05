import { dockSeawardVector } from "../../dock-layout";
import {
  GARDEN_MOLE_OBSTACLES,
  gardenShipWaterMarginTiles,
  gardenShipWaterBeamTiles,
  isGardenShipWater,
} from "../../garden-water-exclusion";
import {
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenShipVisualScale,
} from "../../garden-observatory-slice";
import { isSeawallBarrierTile, seawallBarrierDistance } from "../../seawall";
import {
  clampMapTile,
  isNavigableWaterTile,
  MAX_TILE_X,
  MAX_TILE_Y,
} from "../../world-layout";
import type { DockNode, ShipDockVisit, ShipNode } from "../../world-types";
import type { DockAssignmentStage } from "../pipeline-types";

interface OccupiedBerth {
  x: number;
  y: number;
  halfLength: number;
  halfBeam: number;
  forwardX: number;
  forwardY: number;
}

const moleFootprints: readonly OccupiedBerth[] = GARDEN_MOLE_OBSTACLES.map((rect) => {
  const along = (rect.minAlong + rect.maxAlong) / 2;
  const across = (rect.minAcross + rect.maxAcross) / 2;
  return {
    x: rect.origin.x + along * rect.seawardX - across * rect.seawardY,
    y: rect.origin.y + along * rect.seawardY + across * rect.seawardX,
    halfLength: (rect.maxAlong - rect.minAlong) / 2,
    halfBeam: (rect.maxAcross - rect.minAcross) / 2,
    forwardX: rect.seawardX,
    forwardY: rect.seawardY,
  };
});

export function berthFootprint(tile: { x: number; y: number }, ship: ShipNode, dock: DockNode): OccupiedBerth {
  const scale = gardenShipVisualScale(ship.visual.scale || 1);
  const silhouette = GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull];
  const dx = dock.tile.x - tile.x;
  const dy = dock.tile.y - tile.y;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    ...tile,
    halfLength: gardenShipWaterMarginTiles(scale, silhouette),
    halfBeam: gardenShipWaterBeamTiles(scale, silhouette),
    forwardX: dx / distance,
    forwardY: dy / distance,
  };
}

function penetrationOnAxis(a: OccupiedBerth, b: OccupiedBerth, x: number, y: number): number {
  const extent = (berth: OccupiedBerth) =>
    Math.abs(x * berth.forwardX + y * berth.forwardY) * berth.halfLength
    + Math.abs(-x * berth.forwardY + y * berth.forwardX) * berth.halfBeam;
  return extent(a) + extent(b) - Math.abs((a.x - b.x) * x + (a.y - b.y) * y);
}

function berthOverlapDepth(a: OccupiedBerth, b: OccupiedBerth): number {
  return Math.max(0, Math.min(
    penetrationOnAxis(a, b, a.forwardX, a.forwardY),
    penetrationOnAxis(a, b, -a.forwardY, a.forwardX),
    penetrationOnAxis(a, b, b.forwardX, b.forwardY),
    penetrationOnAxis(a, b, -b.forwardY, b.forwardX),
  ));
}

export function berthsOverlap(a: OccupiedBerth, b: OccupiedBerth): boolean {
  return berthOverlapDepth(a, b) > 0;
}

function normalizeDockVisitWeights(visits: ShipDockVisit[]): ShipDockVisit[] {
  const totalWeight = visits.reduce((sum, visit) => sum + visit.weight, 0);
  if (totalWeight <= 0) return visits;
  return visits.map((visit) => ({
    ...visit,
    weight: visit.weight / totalWeight,
  }));
}

function dockOutwardVector(dock: DockNode): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return dockSeawardVector(dock);
}

function dockMooringDepthBonus(ship: ShipNode): number {
  switch (ship.visual.sizeTier) {
    case "titan":
      return 3;
    case "unique":
      return 2;
    case "flagship":
      return 2;
    case "major":
      return 1;
    default:
      return 0;
  }
}

function dockMooringBarrierClearance(ship: ShipNode): number {
  switch (ship.visual.sizeTier) {
    case "titan":
      return 4.0;
    case "unique":
      return 3.3;
    case "flagship":
      return 3.3;
    case "major":
      return 2.8;
    case "regional":
      return 2.2;
    case "local":
      return 1.8;
    case "skiff":
      return 1.5;
    case "micro":
    case "unknown":
      return 1.35;
    default:
      return 1.35;
  }
}

/**
 * Is this tile a berth this ship could hold? Shared by the depth/lane search,
 * the whole-map fallback, and the sticky-berth check below, so a held berth is
 * re-validated against exactly the rule that would have chosen it.
 */
function isBerthTile(
  tile: { x: number; y: number },
  ship: ShipNode,
  dock: DockNode,
  occupied: ReadonlyMap<string, OccupiedBerth>,
): boolean {
  if (occupied.has(`${tile.x}.${tile.y}`)) return false;
  // Zones-v2 placement fix: moorings must also clear the RENDERED island
  // rock and finite plate edge — data water beneath the garden island mesh,
  // or a cove vector composed onto the background beyond the plate, is not a
  // berth. `isGardenShipWater` owns both bounds with the full hull margin.
  if (isSeawallBarrierTile(tile) || !isNavigableWaterTile(tile)) return false;
  const hullMargin = gardenShipWaterMarginTiles(
    gardenShipVisualScale(ship.visual.scale || 1),
    GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
  );
  if (!isGardenShipWater(tile, hullMargin)) return false;
  // A low working apron may be approached; the mole's hall and stone arms
  // are solid. Test the oriented hull so the open basin remains usable.
  const footprint = berthFootprint(tile, ship, dock);
  if (moleFootprints.some((solid) => berthsOverlap(footprint, solid))) return false;
  return seawallBarrierDistance(tile) >= dockMooringBarrierClearance(ship);
}

function dockMooringTile(
  dock: DockNode,
  ship: ShipNode,
  index: number,
  occupied: ReadonlyMap<string, OccupiedBerth>,
): { x: number; y: number } {
  const outward = dockOutwardVector(dock);
  const fan = { x: -outward.y, y: outward.x };
  const baseDepth = 2 + Math.floor(index / 7) + dockMooringDepthBonus(ship);
  const baseLane = (index % 7) - 3;
  const laneOffsets = [0, ...Array.from({ length: 16 }, (_, lane) => [-lane - 1, lane + 1]).flat()];
  const minBarrierClearance = dockMooringBarrierClearance(ship);
  const target = clampMapTile({
    x: dock.tile.x + outward.x * (baseDepth + 2) + fan.x * baseLane,
    y: dock.tile.y + outward.y * (baseDepth + 2) + fan.y * baseLane,
  });
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestOverlap = Number.POSITIVE_INFINITY;

  for (let depth = baseDepth; depth <= baseDepth + 12; depth += 1) {
    for (const laneOffset of laneOffsets) {
      const lane = baseLane + laneOffset;
      const tile = clampMapTile({
        x: dock.tile.x + outward.x * depth + fan.x * lane,
        y: dock.tile.y + outward.y * depth + fan.y * lane,
      });
      if (!isBerthTile(tile, ship, dock, occupied)) continue;
      const score = depth * 10 + Math.abs(laneOffset) + Math.abs(lane) * 0.01;
      // ponytail: local berth envelopes are soft reservations for all possible
      // visits. When full, minimize penetration rather than collapse back to
      // the nearest occupied quay; timed reservations would guarantee capacity.
      const footprint = berthFootprint(tile, ship, dock);
      let overlap = 0;
      for (const other of occupied.values()) {
        overlap += berthOverlapDepth(footprint, other) ** 2;
        if (overlap > bestOverlap) break;
      }
      if (overlap < bestOverlap || (overlap === bestOverlap && score < bestScore)) {
        bestOverlap = overlap;
        bestScore = score;
        bestTile = tile;
      }
    }
  }

  if (bestTile) return bestTile;
  for (let y = 0; y <= MAX_TILE_Y; y += 1) {
    for (let x = 0; x <= MAX_TILE_X; x += 1) {
      const tile = { x, y };
      const key = `${x}.${y}`;
      if (occupied.has(key) || !isNavigableWaterTile(tile)) continue;
      if (!isBerthTile(tile, ship, dock, occupied)) continue;
      const barrierDistance = seawallBarrierDistance(tile);
      if (barrierDistance < minBarrierClearance) continue;
      const score = Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) - barrierDistance * 0.02;
      if (score < bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    }
  }

  if (bestTile) return bestTile;
  throw new Error(`No rim-safe berth available for ${ship.id} at ${dock.id}`);
}

/**
 * STICKY BERTHS — the previous build's mooring tile per (ship, dock).
 *
 * Sticky risk tiles only hold one end of a ship's route. A ship's A* paths run
 * `riskTile <-> mooringTile`, and the berth search is walked in market-cap order
 * with a per-dock running index, so the same supply wiggle that used to move
 * risk tiles also re-berths ships whose dock presence never changed — measured
 * at 13 of 81 moorings. Holding the berth keeps the other end of the path key.
 *
 * A held berth is re-validated against `isBerthTile` before it is honoured, so
 * a reshaped seawall, a new garden obstacle, or a ship that grew into a larger
 * size tier (and therefore needs more barrier clearance) gives its berth up
 * rather than mooring somewhere it no longer fits.
 *
 * The key carries the DOCK'S TILE as well as its id, because `dock.id` is
 * `dock.<chainId>` and outlives the position under it: a chain with no
 * `PREFERRED_DOCK_TILES` entry draws from the shared pool in supply-rank order,
 * so a harbour can move between refreshes without its id changing. `isBerthTile`
 * would still pass a berth left behind at the old harbour — legal water, just
 * nowhere near the dock it belongs to, with the ship's route drawn out to it.
 * Keying on the tile retires that hold instead.
 */
let heldMooringTiles = new Map<string, { x: number; y: number }>();

/** Drops sticky berths so a test starts from a cold build. */
export function resetHeldMoorings(): void {
  heldMooringTiles = new Map();
}

function berthKey(shipId: string, dock: DockNode): string {
  return `${shipId}|${dock.id}|${dock.tile.x}.${dock.tile.y}`;
}

function assignDockVisits(ships: readonly ShipNode[], docks: readonly DockNode[]): ShipNode[] {
  const dockByChainId = new Map(docks.map((dock) => [dock.chainId, dock]));
  const occupied = new Map<string, OccupiedBerth>();
  const dockedIndex = new Map<string, number>();

  const byMarketCap = ships
    .toSorted((a, b) => b.marketCapUsd - a.marketCapUsd || a.id.localeCompare(b.id));

  // Every held berth is claimed before any berth is searched for, so a ship
  // that does need a new berth cannot be handed one another ship is holding.
  const heldForBuild = new Map<string, { x: number; y: number }>();
  for (const ship of byMarketCap) {
    if (ship.squadRole === "consort") continue;
    for (const presence of ship.chainPresence) {
      if (!presence.hasRenderedDock) continue;
      const dock = dockByChainId.get(presence.chainId);
      if (!dock) continue;
      const key = berthKey(ship.id, dock);
      const heldTile = heldMooringTiles.get(key);
      if (!heldTile || !isBerthTile(heldTile, ship, dock, occupied)) continue;
      occupied.set(`${heldTile.x}.${heldTile.y}`, berthFootprint(heldTile, ship, dock));
      heldForBuild.set(key, heldTile);
    }
  }

  const nextHeld = new Map<string, { x: number; y: number }>();
  const assigned = byMarketCap
    .map((ship) => {
      // Squad consorts ride the flagship motion route - they do not dock.
      // Strip dockVisits and homeDockChainId so motion-planning sees a clean
      // dockless ship and consort routes inherit flagship route entirely.
      if (ship.squadRole === "consort") {
        return {
          ...ship,
          dockChainId: null,
          dockVisits: [],
          homeDockChainId: null,
          tile: ship.riskTile,
        };
      }

      const visits = ship.chainPresence
        .filter((presence) => presence.hasRenderedDock)
        .flatMap((presence) => {
          const dock = dockByChainId.get(presence.chainId);
          if (!dock) return [];

          // Held ships still consume a berth slot, so the depth ramp keeps
          // pace with the dock's real population rather than restarting at the
          // waterline for whichever ships happen to need a new berth.
          const index = dockedIndex.get(dock.chainId) ?? 0;
          dockedIndex.set(dock.chainId, index + 1);
          const key = berthKey(ship.id, dock);
          const mooringTile = heldForBuild.get(key) ?? dockMooringTile(dock, ship, index, occupied);
          occupied.set(`${mooringTile.x}.${mooringTile.y}`, berthFootprint(mooringTile, ship, dock));
          nextHeld.set(key, mooringTile);
          return [{
            chainId: presence.chainId,
            dockId: dock.id,
            weight: Math.max(0.08, presence.share),
            mooringTile,
          }];
        });

      const normalizedVisits = normalizeDockVisitWeights(visits);
      return {
        ...ship,
        dockChainId: ship.homeDockChainId ?? null,
        dockVisits: normalizedVisits,
        tile: ship.riskTile,
      };
    });

  heldMooringTiles = nextHeld;
  return assigned;
}

export function buildDockAssignmentStage(
  ships: readonly ShipNode[],
  docks: readonly DockNode[],
): DockAssignmentStage {
  return {
    ships: assignDockVisits(ships, docks),
  };
}

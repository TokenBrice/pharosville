import { isSeawallBarrierTile, seawallBarrierDistance } from "../../seawall";
import {
  clampMapTile,
  isNavigableWaterTile,
  MAX_TILE_X,
  MAX_TILE_Y,
  nearestAvailableWaterTile,
} from "../../world-layout";
import type { DockNode, ShipDockVisit, ShipNode } from "../../world-types";
import type { DockAssignmentStage } from "../pipeline-types";

function normalizeDockVisitWeights(visits: ShipDockVisit[]): ShipDockVisit[] {
  const totalWeight = visits.reduce((sum, visit) => sum + visit.weight, 0);
  if (totalWeight <= 0) return visits;
  return visits.map((visit) => ({
    ...visit,
    weight: visit.weight / totalWeight,
  }));
}

function dockOutwardVector(dock: DockNode): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const dx = dock.tile.x - MAX_TILE_X / 2;
  const dy = dock.tile.y - MAX_TILE_Y / 2;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: dy < 0 ? -1 : 1 };
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

function dockMooringTile(
  dock: DockNode,
  ship: ShipNode,
  index: number,
  occupied: ReadonlySet<string>,
): { x: number; y: number } {
  const outward = dockOutwardVector(dock);
  const fan = { x: -outward.y, y: outward.x };
  const baseDepth = 2 + Math.floor(index / 7) + dockMooringDepthBonus(ship);
  const baseLane = (index % 7) - 3;
  const laneOffsets = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
  const minBarrierClearance = dockMooringBarrierClearance(ship);
  const target = clampMapTile({
    x: dock.tile.x + outward.x * (baseDepth + 2) + fan.x * baseLane,
    y: dock.tile.y + outward.y * (baseDepth + 2) + fan.y * baseLane,
  });
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let depth = baseDepth; depth <= baseDepth + 8; depth += 1) {
    for (const laneOffset of laneOffsets) {
      const lane = baseLane + laneOffset;
      const tile = clampMapTile({
        x: dock.tile.x + outward.x * depth + fan.x * lane,
        y: dock.tile.y + outward.y * depth + fan.y * lane,
      });
      const key = `${tile.x}.${tile.y}`;
      if (occupied.has(key) || isSeawallBarrierTile(tile) || !isNavigableWaterTile(tile)) continue;
      const barrierDistance = seawallBarrierDistance(tile);
      if (barrierDistance < minBarrierClearance) continue;
      const score = depth * 10 + Math.abs(laneOffset) + Math.abs(lane) * 0.01;
      if (score < bestScore) {
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
  return nearestAvailableWaterTile(target, occupied);
}

function assignDockVisits(ships: readonly ShipNode[], docks: readonly DockNode[]): ShipNode[] {
  const dockByChainId = new Map(docks.map((dock) => [dock.chainId, dock]));
  const occupied = new Set<string>();
  const dockedIndex = new Map<string, number>();

  return ships
    .toSorted((a, b) => b.marketCapUsd - a.marketCapUsd || a.id.localeCompare(b.id))
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

          const index = dockedIndex.get(dock.chainId) ?? 0;
          dockedIndex.set(dock.chainId, index + 1);
          const mooringTile = dockMooringTile(dock, ship, index, occupied);
          occupied.add(`${mooringTile.x}.${mooringTile.y}`);
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
}

export function buildDockAssignmentStage(
  ships: readonly ShipNode[],
  docks: readonly DockNode[],
): DockAssignmentStage {
  return {
    ships: assignDockVisits(ships, docks),
  };
}

import { nearestWaterTile } from "./world-layout";
import { stableHash, stableOffset, stableUnit } from "./stable-random";
import { BAND_FIRE_FLICKER_SPEED, OPEN_WATER_PATROL_WAYPOINTS } from "./motion-config";
import { buildCachedShipWaterRoute, LazyShipWaterPathMap, nearestMapWaterTile, reverseWaterPath } from "./motion-water";
import { clamp, pathKey } from "./motion-utils";
import type { PharosVilleBaseMotionPlan, PharosVilleMotionPlan, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipWaterRouteCache } from "./motion-types";
import type { PharosVilleMap, PharosVilleWorld, ShipDockVisit, ShipNode } from "./world-types";

export function buildBaseMotionPlan(world: PharosVilleWorld): PharosVilleBaseMotionPlan {
  const topShips = world.ships
    .toSorted((a, b) => b.marketCapUsd - a.marketCapUsd)
    .slice(0, 48);
  const moverShips = world.ships
    .filter(hasRecentMove)
    .toSorted((a, b) => Math.abs(b.change24hUsd ?? 0) - Math.abs(a.change24hUsd ?? 0))
    .slice(0, 16);
  const baseEffectShipIds = new Set<string>();
  for (const ship of topShips) baseEffectShipIds.add(ship.id);
  for (const ship of moverShips) baseEffectShipIds.add(ship.id);
  const waterRouteCache: ShipWaterRouteCache = new Map();

  return {
    animatedShipIds: new Set(world.ships.map((ship) => ship.id)),
    baseEffectShipIds,
    lighthouseFireFlickerPerSecond: lighthouseFireFlickerSpeed(world.lighthouse.psiBand, world.lighthouse.score),
    moverShipIds: new Set(moverShips.map((ship) => ship.id)),
    shipPhases: new Map(world.ships.map((ship) => [ship.id, stableMotionPhase(ship.id)])),
    shipRoutes: new Map(world.ships.map((ship) => [ship.id, buildShipMotionRoute(ship, world.map, waterRouteCache)])),
  };
}

export function buildMotionPlan(
  world: PharosVilleWorld,
  selectedDetailId: string | null,
  basePlan: PharosVilleBaseMotionPlan = buildBaseMotionPlan(world),
): PharosVilleMotionPlan {
  const effectShipIds = new Set(basePlan.baseEffectShipIds);
  const selectedShip = selectedDetailId
    ? world.ships.find((ship) => ship.detailId === selectedDetailId)
    : null;
  if (selectedShip) effectShipIds.add(selectedShip.id);

  return {
    animatedShipIds: basePlan.animatedShipIds,
    effectShipIds,
    lighthouseFireFlickerPerSecond: basePlan.lighthouseFireFlickerPerSecond,
    moverShipIds: basePlan.moverShipIds,
    shipPhases: basePlan.shipPhases,
    shipRoutes: basePlan.shipRoutes,
  };
}

export function lighthouseFireFlickerSpeed(band: string | null, score: number | null) {
  const base = band ? BAND_FIRE_FLICKER_SPEED[band.toLowerCase()] ?? 0.34 : 0.22;
  if (score == null) return base;
  return base * (0.85 + Math.max(0, Math.min(100, score)) / 500);
}

export function stableMotionPhase(id: string) {
  return (stableHash(id) % 628) / 100;
}

export function isShipMapVisible(ship: ShipNode, sample: ShipMotionSample | null | undefined): boolean {
  return ship.visual.sizeTier === "titan" || sample?.state !== "moored" || sample.currentDockId == null;
}

function hasRecentMove(ship: ShipNode) {
  const absolute = Math.abs(ship.change24hUsd ?? 0);
  const percentage = Math.abs(ship.change24hPct ?? 0);
  return absolute >= 1_000_000 || percentage >= 0.01;
}

function buildShipMotionRoute(
  ship: ShipNode,
  map: PharosVilleMap,
  waterRouteCache: ShipWaterRouteCache = new Map(),
): ShipMotionRoute {
  const riskTile = nearestWaterTile(ship.riskTile);
  const dockStops = ship.dockVisits.map((visit) => ({
    id: visit.dockId,
    kind: "dock" as const,
    chainId: visit.chainId,
    dockId: visit.dockId,
    weight: visit.weight,
    mooringTile: visit.mooringTile,
  }));
  const riskStop: ShipMotionRouteStop | null = ship.riskPlacement === "ledger-mooring"
    ? {
      id: "area.risk-water.ledger-mooring",
      kind: "ledger",
      chainId: null,
      dockId: null,
      weight: 1,
      mooringTile: riskTile,
    }
    : null;
  const cycleSeconds = shipCycleSeconds(ship);
  const waterPaths = new LazyShipWaterPathMap();
  const openWaterPatrol = dockStops.length === 0
    ? buildOpenWaterPatrol(ship, riskTile, map, waterRouteCache)
    : null;
  const homeDockId = primaryDockStop(ship, dockStops)?.dockId ?? null;

  for (const stop of dockStops) {
    const outboundKey = pathKey(riskTile, stop.mooringTile);
    const inboundKey = pathKey(stop.mooringTile, riskTile);
    const outbound = () => buildCachedShipWaterRoute({ from: riskTile, to: stop.mooringTile, map, zone: ship.riskZone }, waterRouteCache);
    waterPaths.setBuilder(outboundKey, outbound);
    waterPaths.setBuilder(inboundKey, () => reverseWaterPath(outbound()));
  }

  return {
    shipId: ship.id,
    cycleSeconds,
    phaseSeconds: stableUnit(`${ship.id}.phase`) * cycleSeconds,
    riskTile,
    dockStops,
    riskStop,
    zone: ship.riskZone,
    dockStopSchedule: weightedDockStopSchedule(ship.id, dockStops),
    homeDockId,
    openWaterPatrol,
    waterPaths,
    routeSeed: stableHash(ship.id),
  };
}

function primaryDockStop(ship: ShipNode, dockStops: readonly ShipMotionRoute["dockStops"][number][]) {
  return dockStops.find((stop) => stop.chainId === ship.homeDockChainId)
    ?? dockStops.toSorted((a, b) => b.weight - a.weight || a.dockId.localeCompare(b.dockId))[0]
    ?? null;
}

function shipCycleSeconds(ship: ShipNode): number {
  const positiveChainCount = ship.chainPresence.length;
  const renderedDockCount = ship.dockVisits.length;
  const base = 1260;
  const breadthBonus = Math.min(360, positiveChainCount * 30 + renderedDockCount * 24);
  const jitter = stableOffset(`${ship.id}.cycle`, 84);
  return clamp(base - breadthBonus + jitter, 780, 1560);
}

function weightedDockStopSchedule(shipId: string, visits: readonly ShipDockVisit[]): string[] {
  if (visits.length === 0) return [];

  const sortedVisits = [...visits].sort((a, b) => b.weight - a.weight || a.dockId.localeCompare(b.dockId));
  const rotation = stableHash(`${shipId}.dock-schedule`) % sortedVisits.length;
  const rotatedUniqueVisits = [...sortedVisits.slice(rotation), ...sortedVisits.slice(0, rotation)];
  const repeated = rotatedUniqueVisits.map((visit) => visit.dockId);
  const totalWeight = sortedVisits.reduce((sum, visit) => sum + Math.max(0, visit.weight), 0);

  for (const visit of sortedVisits) {
    if (repeated.length >= 6) break;
    const normalized = totalWeight > 0 ? Math.max(0, visit.weight) / totalWeight : 1 / sortedVisits.length;
    const repeats = Math.max(0, Math.min(5, Math.round(normalized * 6) - 1));
    for (let index = 0; index < repeats && repeated.length < 6; index += 1) {
      repeated.push(visit.dockId);
    }
  }

  return repeated;
}

function buildOpenWaterPatrol(
  ship: ShipNode,
  riskTile: { x: number; y: number },
  map: PharosVilleMap,
  waterRouteCache: ShipWaterRouteCache,
): ShipMotionRoute["openWaterPatrol"] {
  const waypoint = openWaterPatrolWaypoint(ship, riskTile, map);
  const outbound = buildCachedShipWaterRoute({ from: riskTile, to: waypoint, map, zone: ship.riskZone }, waterRouteCache);
  if (outbound.points.length <= 1 || outbound.totalLength <= 0) return null;
  return {
    waypoint,
    outbound,
    inbound: reverseWaterPath(outbound),
  };
}

function openWaterPatrolWaypoint(
  ship: ShipNode,
  riskTile: { x: number; y: number },
  map: PharosVilleMap,
): { x: number; y: number } {
  const waypoints = OPEN_WATER_PATROL_WAYPOINTS[ship.riskZone];
  const offset = stableHash(`${ship.id}.open-water-patrol`) % waypoints.length;
  let fallback = nearestMapWaterTile(waypoints[offset] ?? riskTile, map);
  let fallbackDistance = Math.hypot(fallback.x - riskTile.x, fallback.y - riskTile.y);

  for (let index = 0; index < waypoints.length; index += 1) {
    const candidate = nearestMapWaterTile(waypoints[(offset + index) % waypoints.length]!, map);
    const distance = Math.hypot(candidate.x - riskTile.x, candidate.y - riskTile.y);
    if (distance > fallbackDistance) {
      fallback = candidate;
      fallbackDistance = distance;
    }
    if (distance >= 8) return candidate;
  }

  return fallback;
}

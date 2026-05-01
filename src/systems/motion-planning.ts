import { clampMapTile, nearestWaterTile } from "./world-layout";
import { stableHash, stableOffset, stableUnit } from "./stable-random";
import { BAND_FIRE_FLICKER_SPEED, OPEN_WATER_PATROL_WAYPOINTS } from "./motion-config";
import { buildCachedShipWaterRoute, LazyShipWaterPathMap, nearestMapWaterTile, reverseWaterPath, waterPathFromPoints } from "./motion-water";
import { clamp, pathKey } from "./motion-utils";
import {
  STABLECOIN_SQUADS,
  squadFormationOffsetForPlacement,
  squadForMember,
} from "./maker-squad";
import { nearestRiskPlacementWaterTile } from "./risk-water-placement";
import { SEAWALL_BARRIER_TILES } from "./seawall";
import type { PharosVilleBaseMotionPlan, PharosVilleMotionPlan, ShipDockMotionStop, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample, ShipWaterPath, ShipWaterRouteCache } from "./motion-types";
import type { DockNode, PharosVilleMap, PharosVilleWorld, ShipDockVisit, ShipNode } from "./world-types";

// World identity is stable across React re-renders for the same TanStack
// payload, so memoizing the signature on the world reference turns ~1000
// transient strings + sort comparisons per render into a single Map lookup.
const signatureByWorld = new WeakMap<PharosVilleWorld, string>();

// Path cache shared across plan rebuilds for the same map identity. When the
// motion plan signature changes (new ship, marketCap reshuffle), only the
// route shapes need to rebuild — the underlying A* paths from waypoint X to Y
// on a stable map remain valid and shouldn't be recomputed.
const pathCacheByMap = new WeakMap<PharosVilleMap, ShipWaterRouteCache>();

function getMapPathCache(map: PharosVilleMap): ShipWaterRouteCache {
  let cache = pathCacheByMap.get(map);
  if (!cache) {
    cache = new Map();
    pathCacheByMap.set(map, cache);
  }
  return cache;
}

// Stable, content-aware signature for the inputs `buildBaseMotionPlan` actually
// reads. Two world instances with different identities but identical ship/dock/
// map/lighthouse-flicker content yield the same string. Live data refetches
// that don't change these fields can therefore reuse the prior plan instead of
// re-running A* warmups. Kept cheap on purpose: short field joins, no
// JSON.stringify of nested objects.
export function motionPlanSignature(world: PharosVilleWorld): string {
  const cached = signatureByWorld.get(world);
  if (cached !== undefined) return cached;
  const shipParts: string[] = [];
  for (const ship of [...world.ships].sort((a, b) => a.id.localeCompare(b.id))) {
    const dockParts: string[] = [];
    for (const visit of [...ship.dockVisits].sort((a, b) => a.dockId.localeCompare(b.dockId))) {
      dockParts.push(`${visit.dockId}:${visit.chainId}:${visit.weight}:${visit.mooringTile.x},${visit.mooringTile.y}`);
    }
    shipParts.push([
      ship.id,
      ship.marketCapUsd,
      ship.change24hUsd ?? "",
      ship.change24hPct ?? "",
      `${ship.riskTile.x},${ship.riskTile.y}`,
      ship.riskPlacement,
      ship.riskZone,
      ship.squadId ?? "",
      ship.squadRole ?? "",
      ship.homeDockChainId ?? "",
      ship.chainPresence.length,
      dockParts.join("|"),
    ].join(";"));
  }
  const dockParts: string[] = [];
  for (const dock of [...world.docks].sort((a, b) => a.id.localeCompare(b.id))) {
    dockParts.push(`${dock.id}:${dock.tile.x},${dock.tile.y}`);
  }
  const lighthouse = `${world.lighthouse.psiBand ?? ""}:${world.lighthouse.score ?? ""}`;
  const map = `${world.map.width}x${world.map.height}:${world.map.waterRatio}`;
  const signature = `S[${shipParts.join("/")}]D[${dockParts.join("/")}]L[${lighthouse}]M[${map}]`;
  signatureByWorld.set(world, signature);
  return signature;
}

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
  const waterRouteCache = getMapPathCache(world.map);

  // Build flagship route per squad first, so each squad's consorts can inherit
  // their own flagship's cycle/phase/zone. When a squad's flagship is missing,
  // its consorts fall back to per-ship routing.
  const flagshipShipBySquad = new Map<string, ShipNode>();
  const flagshipRouteBySquad = new Map<string, ShipMotionRoute>();
  for (const squad of STABLECOIN_SQUADS) {
    const flagship = world.ships.find((ship) => (
      ship.id === squad.flagshipId && ship.squadRole === "flagship" && ship.squadId === squad.id
    ));
    if (!flagship) continue;
    flagshipShipBySquad.set(squad.id, flagship);
    flagshipRouteBySquad.set(squad.id, buildShipMotionRoute(flagship, world.map, world.docks, waterRouteCache));
  }

  const shipRoutes = new Map<string, ShipMotionRoute>();
  for (const ship of world.ships) {
    if (ship.squadRole === "flagship" && ship.squadId) {
      const cached = flagshipRouteBySquad.get(ship.squadId);
      if (cached) {
        shipRoutes.set(ship.id, cached);
        continue;
      }
    }
    if (ship.squadRole === "consort" && ship.squadId) {
      const flagshipShip = flagshipShipBySquad.get(ship.squadId);
      const flagshipRoute = flagshipRouteBySquad.get(ship.squadId);
      if (flagshipShip && flagshipRoute) {
        shipRoutes.set(ship.id, buildConsortMotionRoute(ship, flagshipShip, flagshipRoute));
        continue;
      }
    }
    shipRoutes.set(ship.id, buildShipMotionRoute(ship, world.map, world.docks, waterRouteCache));
  }

  return {
    animatedShipIds: new Set(world.ships.map((ship) => ship.id)),
    baseEffectShipIds,
    lighthouseFireFlickerPerSecond: lighthouseFireFlickerSpeed(world.lighthouse.psiBand, world.lighthouse.score),
    moverShipIds: new Set(moverShips.map((ship) => ship.id)),
    shipPhases: new Map(world.ships.map((ship) => [ship.id, stableMotionPhase(ship.id)])),
    shipRoutes,
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
  return ship.visual.sizeTier === "titan"
    || ship.visual.sizeTier === "unique"
    || sample?.state !== "moored"
    || sample.currentDockId == null;
}

function hasRecentMove(ship: ShipNode) {
  const absolute = Math.abs(ship.change24hUsd ?? 0);
  const percentage = Math.abs(ship.change24hPct ?? 0);
  return absolute >= 1_000_000 || percentage >= 0.01;
}

function buildShipMotionRoute(
  ship: ShipNode,
  map: PharosVilleMap,
  docks: readonly DockNode[] = [],
  waterRouteCache: ShipWaterRouteCache = new Map(),
): ShipMotionRoute {
  const riskTile = nearestWaterTile(ship.riskTile);
  const dockStops: ShipDockMotionStop[] = ship.dockVisits.map((visit) => ({
    id: visit.dockId,
    kind: "dock" as const,
    chainId: visit.chainId,
    dockId: visit.dockId,
    weight: visit.weight,
    mooringTile: visit.mooringTile,
    dockTangent: dockTangentForVisit(visit, docks),
  }));
  const riskStop: ShipMotionRouteStop | null = ship.riskPlacement === "ledger-mooring"
    ? {
      id: "area.risk-water.ledger-mooring",
      kind: "ledger",
      chainId: null,
      dockId: null,
      weight: 1,
      mooringTile: riskTile,
      // Risk-water mooring is open water — no dock tile to anchor to.
      dockTangent: null,
    }
    : null;
  const cycleSeconds = shipCycleSeconds(ship);
  const waterPaths = new LazyShipWaterPathMap();
  const openWaterPatrol = dockStops.length === 0 || ship.riskPlacement === "ledger-mooring"
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
    formationOffset: null,
  };
}

function buildConsortMotionRoute(
  ship: ShipNode,
  flagshipShip: ShipNode,
  flagshipRoute: ShipMotionRoute,
): ShipMotionRoute {
  // Consorts inherit the flagship's cycle, phase, zone, and patrol shape so
  // the squad sails as one body. We only translate spatial waypoints by the
  // placement-aware formation offset; everything else is a clone.
  //
  // Cohesion across the dock cycle is guaranteed at sample time: in
  // `resolveShipMotionSample`, consorts shadow the flagship's sample with this
  // same formation offset. The route built here is used for the reduced-motion
  // idle position and as a fallback when the flagship route is unresolved.
  const squad = squadForMember(ship.id);
  const formationOffset = squad
    ? squadFormationOffsetForPlacement(ship.id, squad, flagshipShip.riskPlacement)
    : null;
  const offset = formationOffset ?? { dx: 0, dy: 0 };
  // Placement-scoped clamping protects motionZone invariants: consort waypoints
  // must stay in flagship's water set or motion-water sampling reads the wrong
  // zone-style. When the placement is too tight to host the offset within
  // radius 4, collapse the consort onto the flagship's tile (overlap) rather
  // than spilling into a different zone — same fallback discipline as
  // `spreadRiskPlacementShips` in pharosville-world.ts.
  const offsetTile = (tile: { x: number; y: number }) => {
    const target = clampMapTile({ x: tile.x + offset.dx, y: tile.y + offset.dy });
    return nearestRiskPlacementWaterTile(target, flagshipShip.riskPlacement, 4) ?? tile;
  };

  const riskTile = offsetTile(flagshipRoute.riskTile);
  const riskStop: ShipMotionRouteStop | null = flagshipRoute.riskStop
    ? { ...flagshipRoute.riskStop, mooringTile: riskTile }
    : null;
  const openWaterPatrol = flagshipRoute.openWaterPatrol
    ? offsetOpenWaterPatrol(flagshipRoute.openWaterPatrol, offsetTile)
    : null;

  return {
    shipId: ship.id,
    cycleSeconds: flagshipRoute.cycleSeconds,
    phaseSeconds: flagshipRoute.phaseSeconds,
    riskTile,
    dockStops: [],
    riskStop,
    zone: flagshipRoute.zone,
    dockStopSchedule: [],
    homeDockId: null,
    openWaterPatrol,
    waterPaths: new LazyShipWaterPathMap(),
    routeSeed: flagshipRoute.routeSeed,
    formationOffset,
  };
}

function offsetOpenWaterPatrol(
  patrol: NonNullable<ShipMotionRoute["openWaterPatrol"]>,
  offsetTile: (tile: { x: number; y: number }) => { x: number; y: number },
): ShipMotionRoute["openWaterPatrol"] {
  const outbound = offsetWaterPath(patrol.outbound, offsetTile);
  return {
    waypoint: offsetTile(patrol.waypoint),
    outbound,
    inbound: reverseWaterPath(outbound),
  };
}

function offsetWaterPath(
  path: ShipWaterPath,
  offsetTile: (tile: { x: number; y: number }) => { x: number; y: number },
): ShipWaterPath {
  const points = path.points.map(offsetTile);
  return waterPathFromPoints(
    points[0] ?? offsetTile(path.from),
    points[points.length - 1] ?? offsetTile(path.to),
    points,
  );
}

// Direction the moored ship's bow should face: from the mooring tile toward
// the dock entity's tile (the natural orientation — bow toward the wharf).
// Falls back to pointing away from the nearest seawall barrier when the dock
// can't be located, so docked ships never face into the wall. Returns `null`
// only when the geometry is degenerate (mooring tile colocated with dock,
// or no barrier within range).
function dockTangentForVisit(
  visit: ShipDockVisit,
  docks: readonly DockNode[],
): { x: number; y: number } | null {
  const dock = docks.find((entry) => entry.id === visit.dockId && entry.chainId === visit.chainId);
  if (dock) {
    const dx = dock.tile.x - visit.mooringTile.x;
    const dy = dock.tile.y - visit.mooringTile.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { x: dx / length, y: dy / length };
  }
  // Fallback: vector pointing away from the nearest seawall barrier.
  let nearestBarrier: { x: number; y: number } | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const barrier of SEAWALL_BARRIER_TILES) {
    const distance = Math.hypot(barrier.x - visit.mooringTile.x, barrier.y - visit.mooringTile.y);
    if (distance < nearestDistance) {
      nearestBarrier = barrier;
      nearestDistance = distance;
    }
  }
  if (!nearestBarrier || nearestDistance === 0) return null;
  const dx = visit.mooringTile.x - nearestBarrier.x;
  const dy = visit.mooringTile.y - nearestBarrier.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return { x: dx / length, y: dy / length };
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

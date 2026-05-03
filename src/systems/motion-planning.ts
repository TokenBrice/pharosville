import { clampMapTile, nearestWaterTile } from "./world-layout";
import { stableHash, stableOffset, stableUnit } from "./stable-random";
import { BAND_FIRE_FLICKER_SPEED, DOCKED_SHIP_DWELL_SHARE, OPEN_WATER_PATROL_WAYPOINTS } from "./motion-config";
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
import { precomputeShipTempos } from "./ship-cycle-tempo";

// World identity is stable across React re-renders for the same TanStack
// payload, so memoizing the signature on the world reference turns ~1000
// transient strings + sort comparisons per render into a single Map lookup.
const signatureByWorld = new WeakMap<PharosVilleWorld, string>();

// Path cache shared across plan rebuilds for the same map identity. When the
// motion plan signature changes (new ship, marketCap reshuffle), only the
// route shapes need to rebuild — the underlying A* paths from waypoint X to Y
// on a stable map remain valid and shouldn't be recomputed.
//
// Regular Map (not WeakMap) so we can apply an LRU bound per entry.
// Call disposePathCacheForMap(map) when the world/map is torn down so the
// entry is released. As of this writing no dispose hook wires this call
// automatically — see T3.4 in PLAN.md for follow-up.
const pathCacheByMap = new Map<PharosVilleMap, BoundedShipWaterRouteCache>();

/** Drop the per-map path cache when the world is disposed. */
export function disposePathCacheForMap(map: PharosVilleMap): void {
  pathCacheByMap.delete(map);
}

/**
 * LRU-bounded cache for A* ship water routes, keyed by zone:shipId:bucket:from→to string.
 * Capacity = min(4096, max(512, 16 × shipCount)) — sized to absorb per-bucket entries
 * across multiple 10-minute windows without thrashing.
 * LRU discipline: on get() the hit entry is moved to the end (most-recently
 * used); the entry at the start (least-recently used) is evicted when full.
 * Implements the same surface as Map<string, ShipWaterPath> so callers in
 * motion-water.ts need no changes.
 */
export class BoundedShipWaterRouteCache implements Map<string, ShipWaterPath> {
  private readonly _map = new Map<string, ShipWaterPath>();
  private readonly _capacity: number;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  readonly [Symbol.toStringTag] = "BoundedShipWaterRouteCache";

  constructor(capacity: number) {
    this._capacity = Math.max(1, capacity);
  }

  get size(): number {
    return this._map.size;
  }

  has(key: string): boolean {
    return this._map.has(key);
  }

  get(key: string): ShipWaterPath | undefined {
    if (!this._map.has(key)) {
      this._misses += 1;
      return undefined;
    }
    this._hits += 1;
    // Move to end (most-recently used).
    const value = this._map.get(key)!;
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key: string, value: ShipWaterPath): this {
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this._capacity) {
      // Evict least-recently used (first key in insertion order).
      this._map.delete(this._map.keys().next().value!);
      this._evictions += 1;
    }
    this._map.set(key, value);
    return this;
  }

  getStats(): { hits: number; misses: number; evictions: number; size: number; capacity: number } {
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      size: this._map.size,
      capacity: this._capacity,
    };
  }

  delete(key: string): boolean {
    return this._map.delete(key);
  }

  clear(): void {
    this._map.clear();
  }

  forEach(callbackfn: (value: ShipWaterPath, key: string, map: Map<string, ShipWaterPath>) => void, thisArg?: unknown): void {
    this._map.forEach(callbackfn, thisArg);
  }

  keys(): ReturnType<Map<string, ShipWaterPath>["keys"]> {
    return this._map.keys();
  }

  values(): ReturnType<Map<string, ShipWaterPath>["values"]> {
    return this._map.values();
  }

  entries(): ReturnType<Map<string, ShipWaterPath>["entries"]> {
    return this._map.entries();
  }

  [Symbol.iterator](): ReturnType<Map<string, ShipWaterPath>["entries"]> {
    return this._map.entries();
  }
}

function getMapPathCache(map: PharosVilleMap, shipCount: number): BoundedShipWaterRouteCache {
  let cache = pathCacheByMap.get(map);
  if (!cache) {
    const capacity = Math.min(4096, Math.max(512, 16 * shipCount));
    cache = new BoundedShipWaterRouteCache(capacity);
    pathCacheByMap.set(map, cache);
  }
  return cache;
}

/**
 * Read current hit/miss/eviction stats for the route cache associated with the
 * given map. Returns null before the first plan build (no cache yet).
 * Intended for the render-loop debug telemetry path only.
 */
export function getCurrentMapPathCacheStats(
  map: PharosVilleMap,
): { hits: number; misses: number; evictions: number; size: number; capacity: number } | null {
  return pathCacheByMap.get(map)?.getStats() ?? null;
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

export function buildBaseMotionPlan(world: PharosVilleWorld, timeSeconds = 0): PharosVilleBaseMotionPlan {
  const bucket = Math.floor(timeSeconds / 600);
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
  const waterRouteCache = getMapPathCache(world.map, world.ships.length);

  // Compute per-ship speed scalars from marketCap quartiles once, at plan-build
  // time. `precomputeShipTempos` does a single sort over the fleet (O(N log N))
  // instead of N independent sorts (O(N² log N)) that the prior loop incurred.
  const tempoById = precomputeShipTempos(world.ships);
  const speedScalarById = new Map<string, number>();
  for (const [shipId, tempo] of tempoById) {
    speedScalarById.set(shipId, tempo.scalar);
  }

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
    flagshipRouteBySquad.set(squad.id, buildShipMotionRoute(flagship, world.map, world.docks, waterRouteCache, bucket, speedScalarById.get(flagship.id) ?? 1));
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
    shipRoutes.set(ship.id, buildShipMotionRoute(ship, world.map, world.docks, waterRouteCache, bucket, speedScalarById.get(ship.id) ?? 1));
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

// Memoizes the per-(basePlan, selectedShipId) effectShipIds set so identity is
// stable across `buildMotionPlan` calls with the same inputs. Without this,
// every call rebuilds `new Set(...)`, which makes downstream identity-keyed
// short-circuits (e.g., `hashIdSet` in renderer ship layers) miss every frame.
const effectShipIdsCache = new WeakMap<PharosVilleBaseMotionPlan, Map<string, ReadonlySet<string>>>();

function memoizedEffectShipIds(
  basePlan: PharosVilleBaseMotionPlan,
  selectedShipId: string,
): ReadonlySet<string> {
  let perPlan = effectShipIdsCache.get(basePlan);
  if (!perPlan) {
    perPlan = new Map();
    effectShipIdsCache.set(basePlan, perPlan);
  }
  const cached = perPlan.get(selectedShipId);
  if (cached) return cached;
  const next = new Set(basePlan.baseEffectShipIds);
  next.add(selectedShipId);
  perPlan.set(selectedShipId, next);
  return next;
}

export function buildMotionPlan(
  world: PharosVilleWorld,
  selectedDetailId: string | null,
  basePlan: PharosVilleBaseMotionPlan = buildBaseMotionPlan(world),
): PharosVilleMotionPlan {
  const selectedShip = selectedDetailId
    ? world.ships.find((ship) => ship.detailId === selectedDetailId)
    : null;
  // When no selected ship needs to be added, return the base set directly so
  // callers see stable identity across rebuilds (no Set allocation).
  const effectShipIds = selectedShip
    ? memoizedEffectShipIds(basePlan, selectedShip.id)
    : basePlan.baseEffectShipIds;

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
  bucket = 0,
  speedScalar = 1,
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
  const cycleSeconds = shipCycleSeconds(ship, speedScalar);
  const waterPaths = new LazyShipWaterPathMap();
  const openWaterPatrol = dockStops.length === 0 || ship.riskPlacement === "ledger-mooring"
    ? buildOpenWaterPatrol(ship, riskTile, map, waterRouteCache, bucket)
    : null;
  const homeDockId = primaryDockStop(ship, dockStops)?.dockId ?? null;

  if (openWaterPatrol) {
    const outbound = pathKey(openWaterPatrol.outbound.from, openWaterPatrol.outbound.to);
    const inbound = pathKey(openWaterPatrol.inbound.from, openWaterPatrol.inbound.to);
    waterPaths.setBuilder(outbound, () => openWaterPatrol!.outbound);
    waterPaths.setBuilder(inbound, () => openWaterPatrol!.inbound);
  }

  for (const stop of dockStops) {
    const outboundKey = pathKey(riskTile, stop.mooringTile);
    const inboundKey = pathKey(stop.mooringTile, riskTile);
    const outbound = () => buildCachedShipWaterRoute({ from: riskTile, to: stop.mooringTile, map, zone: ship.riskZone, shipId: ship.id, bucket }, waterRouteCache);
    waterPaths.setBuilder(outboundKey, outbound);
    waterPaths.setBuilder(inboundKey, () => reverseWaterPath(outbound()));
  }

  // E2: change24hPct is in percent units (e.g. 10 means 10%) per recent-change.ts:16
  // formula: (usd / previous) * 100. Threshold 2 = 2%, scale 20 keeps the same shape.
  const wakeMultiplier = computeWakeMultiplier(ship.change24hPct);
  // E3: broad chain presence (≥4 positive chains) earns +15% dock-dwell share.
  const dockDwellShareOverride = ship.chainPresence.length >= 4
    ? DOCKED_SHIP_DWELL_SHARE * 1.15
    : undefined;

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
    staleEvidence: ship.placementEvidence.stale,
    wakeMultiplier,
    dockDwellShareOverride,
  };
}

// E2: compute wake multiplier from change24hPct (percent units, e.g. 10 = 10%).
// Threshold: |pct| ≥ 2 (i.e. 2%). Scale: 20. Clamp: [0, 0.6].
function computeWakeMultiplier(change24hPct: number | null): number {
  if (change24hPct == null) return 1.0;
  const absPct = Math.abs(change24hPct);
  if (absPct < 2) return 1.0;
  return 1.0 + clamp(absPct / 20, 0, 0.6);
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
    // E1/E2/E3: consorts use their own ship's signals (not the flagship's),
    // so each consort's stale evidence and change24hPct are reflected independently.
    staleEvidence: ship.placementEvidence.stale,
    wakeMultiplier: computeWakeMultiplier(ship.change24hPct),
    dockDwellShareOverride: ship.chainPresence.length >= 4
      ? DOCKED_SHIP_DWELL_SHARE * 1.15
      : undefined,
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

function shipCycleSeconds(ship: ShipNode, speedScalar = 1): number {
  const positiveChainCount = ship.chainPresence.length;
  const renderedDockCount = ship.dockVisits.length;
  const base = 1260;
  const breadthBonus = Math.min(360, positiveChainCount * 30 + renderedDockCount * 24);
  const jitter = stableOffset(`${ship.id}.cycle`, 84);
  return clamp(base / speedScalar - breadthBonus + jitter, 780, 1560);
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
  bucket = 0,
): ShipMotionRoute["openWaterPatrol"] {
  const waypoint = openWaterPatrolWaypoint(ship, riskTile, map);
  const outbound = buildCachedShipWaterRoute({ from: riskTile, to: waypoint, map, zone: ship.riskZone, shipId: ship.id, bucket }, waterRouteCache);
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

/** Test-only — do not use in production. */
export function __testPathCacheSize(map: PharosVilleMap): number {
  return pathCacheByMap.get(map)?.size ?? -1;
}

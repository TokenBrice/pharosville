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

/** Drop per-map motion state when the world is disposed. */
export function disposePathCacheForMap(map: PharosVilleMap): void {
  pathCacheByMap.delete(map);
  previousRiskByMap.delete(map);
}

// ---------------------------------------------------------------------------
// W4.25 — Risk-transition tack-out
// ---------------------------------------------------------------------------
//
// At plan-build time we remember the last riskTile/riskPlacement we saw for
// each ship. When the placement or tile changes between builds, the new
// route records `previousRiskTile` for one cycle so the sampler can blend
// the risk-drift center from previous → new over a 3-second "tack-out"
// window. Detail-panel parity reads the same data via
// `ShipMotionSample.riskTransition`.
//
// The cache survives across plan builds for the same map identity. Cleared
// when the per-map path cache is disposed so separate worlds do not inherit
// each other's previous-risk transition state.

interface PreviousRiskEntry {
  tile: { x: number; y: number };
  placement: string;
  /** Last-seen `riskWaterLabel` so W5.01 consumers can render `from X to Y`. */
  label: string;
}
const previousRiskByMap = new Map<PharosVilleMap, Map<string, PreviousRiskEntry>>();

/** Test-only — reset the per-ship previous-risk cache. */
export function __resetPreviousRiskCache(): void {
  previousRiskByMap.clear();
}

/**
 * LRU-bounded cache for A* ship water routes, keyed by zone:shipId:bucket:from→to string.
 * Capacity = min(4096, max(512, 16 × shipCount)) — sized to absorb per-bucket entries
 * across multiple 10-minute windows without thrashing.
 * LRU discipline: on get() the hit entry is moved to the end (most-recently
 * used); the entry at the start (least-recently used) is evicted when full.
 * The production cache contract intentionally exposes only get/set; tests and
 * debug telemetry read size/has/stats from this concrete class.
 */
export class BoundedShipWaterRouteCache {
  private readonly _map = new Map<string, ShipWaterPath>();
  private readonly _capacity: number;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

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

  set(key: string, value: ShipWaterPath): void {
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this._capacity) {
      // Evict least-recently used (first key in insertion order).
      this._map.delete(this._map.keys().next().value!);
      this._evictions += 1;
    }
    this._map.set(key, value);
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

export function hasRecentMove(ship: ShipNode) {
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
  const dockStopSchedule = weightedDockStopSchedule(ship.id, dockStops);
  const routeKey = motionRouteKey({
    bucket,
    dockStops,
    dockStopSchedule,
    homeDockId,
    openWaterPatrol,
    riskStop,
    riskTile,
    shipId: ship.id,
    zone: ship.riskZone,
  });

  if (openWaterPatrol) {
    // W4.23 — register each itinerary leg's outbound/inbound paths so the
    // sampler can resolve any cycle's path via the shared LazyShipWaterPathMap.
    for (const leg of openWaterPatrol.itinerary) {
      const outboundKey = pathKey(leg.outbound.from, leg.outbound.to);
      const inboundKey = pathKey(leg.inbound.from, leg.inbound.to);
      waterPaths.setBuilder(outboundKey, () => leg.outbound);
      waterPaths.setBuilder(inboundKey, () => leg.inbound);
    }
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

  // W4.25 — capture previousRiskTile when the ship's riskPlacement or
  // riskTile differs from the last build. Survives one cycle then clears.
  const previousRisk = capturePreviousRiskTile(map, ship, riskTile);

  return {
    shipId: ship.id,
    routeEpoch: bucket,
    routeKey,
    cycleSeconds,
    phaseSeconds: stableUnit(`${ship.id}.phase`) * cycleSeconds,
    riskTile,
    dockStops,
    riskStop,
    zone: ship.riskZone,
    dockStopSchedule,
    homeDockId,
    openWaterPatrol,
    waterPaths,
    routeSeed: stableHash(ship.id),
    formationOffset: null,
    staleEvidence: ship.placementEvidence.stale,
    wakeMultiplier,
    ...(dockDwellShareOverride !== undefined ? { dockDwellShareOverride } : {}),
    ...(previousRisk
      ? { previousRiskTile: previousRisk.tile, previousRiskLabel: previousRisk.label }
      : {}),
  };
}

/**
 * W4.25 — returns the previous risk tile when the ship's riskPlacement or
 * riskTile has changed since the last plan build, otherwise undefined.
 * Surfaces the previous tile exactly once per change so the sampler's 3s
 * tack-out fires for the build immediately following the placement change.
 */
function capturePreviousRiskTile(
  map: PharosVilleMap,
  ship: ShipNode,
  newTile: { x: number; y: number },
): { tile: { x: number; y: number }; label: string } | undefined {
  let previousRiskByShipId = previousRiskByMap.get(map);
  if (!previousRiskByShipId) {
    previousRiskByShipId = new Map();
    previousRiskByMap.set(map, previousRiskByShipId);
  }

  const cached = previousRiskByShipId.get(ship.id);
  if (!cached) {
    previousRiskByShipId.set(ship.id, {
      tile: { x: newTile.x, y: newTile.y },
      placement: ship.riskPlacement,
      label: ship.riskWaterLabel,
    });
    return undefined;
  }

  const tileChanged = cached.tile.x !== newTile.x || cached.tile.y !== newTile.y;
  const placementChanged = cached.placement !== ship.riskPlacement;
  if (tileChanged || placementChanged) {
    // Transition observed: surface the previous tile + label, then update
    // the cache to the new state so the next steady-state build returns
    // undefined.
    const previous = { tile: { x: cached.tile.x, y: cached.tile.y }, label: cached.label };
    cached.tile = { x: newTile.x, y: newTile.y };
    cached.placement = ship.riskPlacement;
    cached.label = ship.riskWaterLabel;
    return previous;
  }

  return undefined;
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

  const consortDockDwellOverride = ship.chainPresence.length >= 4
    ? DOCKED_SHIP_DWELL_SHARE * 1.15
    : undefined;
  return {
    shipId: ship.id,
    ...(flagshipRoute.routeEpoch !== undefined ? { routeEpoch: flagshipRoute.routeEpoch } : {}),
    routeKey: `${flagshipRoute.routeKey ?? fallbackRouteKey(flagshipRoute)}:consort:${ship.id}:${offset.dx},${offset.dy}`,
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
    ...(consortDockDwellOverride !== undefined ? { dockDwellShareOverride: consortDockDwellOverride } : {}),
  };
}

function motionRouteKey(input: {
  bucket: number;
  dockStops: readonly ShipDockMotionStop[];
  dockStopSchedule: readonly string[];
  homeDockId: string | null;
  openWaterPatrol: ShipMotionRoute["openWaterPatrol"];
  riskStop: ShipMotionRouteStop | null;
  riskTile: { x: number; y: number };
  shipId: string;
  zone: ShipMotionRoute["zone"];
}): string {
  const stops = input.dockStops
    .map((stop) => `${stop.id}:${stop.chainId}:${stop.dockId}:${stop.mooringTile.x},${stop.mooringTile.y}`)
    .join("|");
  const riskStop = input.riskStop
    ? `${input.riskStop.kind}:${input.riskStop.id}:${input.riskStop.mooringTile.x},${input.riskStop.mooringTile.y}`
    : "-";
  const patrol = input.openWaterPatrol
    ? [
      `${input.openWaterPatrol.waypoint.x},${input.openWaterPatrol.waypoint.y}`,
      waterPathSignature(input.openWaterPatrol.outbound),
      waterPathSignature(input.openWaterPatrol.inbound),
      // W4.23 — itinerary anchors so cycle-rotation variations register in
      // the route key. The first entry mirrors the primary waypoint above.
      `itinerary=${input.openWaterPatrol.itinerary.map((leg) => `${leg.waypoint.x},${leg.waypoint.y}`).join("|")}`,
    ].join("/")
    : "-";

  return [
    input.shipId,
    `epoch=${input.bucket}`,
    input.zone,
    `risk=${input.riskTile.x},${input.riskTile.y}`,
    `home=${input.homeDockId ?? "-"}`,
    `schedule=${input.dockStopSchedule.join(",")}`,
    `stops=${stops}`,
    `riskStop=${riskStop}`,
    `patrol=${patrol}`,
  ].join(";");
}

function fallbackRouteKey(route: ShipMotionRoute): string {
  return [
    route.shipId,
    `epoch=${route.routeEpoch ?? "legacy"}`,
    route.zone,
    `risk=${route.riskTile.x},${route.riskTile.y}`,
    `home=${route.homeDockId ?? "-"}`,
  ].join(";");
}

function waterPathSignature(path: ShipWaterPath): string {
  const first = path.points[0] ?? path.from;
  const last = path.points[path.points.length - 1] ?? path.to;
  return [
    `${path.from.x},${path.from.y}->${path.to.x},${path.to.y}`,
    `n=${path.points.length}`,
    `len=${path.totalLength.toFixed(3)}`,
    `first=${first.x},${first.y}`,
    `last=${last.x},${last.y}`,
  ].join(":");
}

function offsetOpenWaterPatrol(
  patrol: NonNullable<ShipMotionRoute["openWaterPatrol"]>,
  offsetTile: (tile: { x: number; y: number }) => { x: number; y: number },
): ShipMotionRoute["openWaterPatrol"] {
  // W4.23 — translate every itinerary leg, then derive the primary
  // waypoint/outbound/inbound from itinerary[0] so consort cycles rotate
  // through the same anchor set (offset) as their flagship.
  const itinerary = patrol.itinerary.map((leg) => {
    const outbound = offsetWaterPath(leg.outbound, offsetTile);
    return {
      waypoint: offsetTile(leg.waypoint),
      outbound,
      inbound: reverseWaterPath(outbound),
    };
  });
  const primary = itinerary[0]!;
  return {
    waypoint: primary.waypoint,
    outbound: primary.outbound,
    inbound: primary.inbound,
    itinerary,
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
  const base = 1020;
  const breadthBonus = Math.min(360, positiveChainCount * 30 + renderedDockCount * 24);
  const jitter = stableOffset(`${ship.id}.cycle`, 84);
  return clamp(base / speedScalar - breadthBonus + jitter, 660, 1320);
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
  // W4.23 — build the per-ship 2- or 3-anchor itinerary. The first anchor is
  // the legacy single waypoint (cycle 0); the remaining anchors are visited
  // on subsequent cycles via openWaterPatrolItineraryIndex.
  const anchors = openWaterPatrolItineraryAnchors(ship, riskTile, map);
  if (anchors.length === 0) return null;

  const itinerary = anchors
    .map((waypoint) => {
      const outbound = buildCachedShipWaterRoute({ from: riskTile, to: waypoint, map, zone: ship.riskZone, shipId: ship.id, bucket }, waterRouteCache);
      if (outbound.points.length <= 1 || outbound.totalLength <= 0) return null;
      return { waypoint, outbound, inbound: reverseWaterPath(outbound) };
    })
    .filter((leg): leg is { waypoint: { x: number; y: number }; outbound: ShipWaterPath; inbound: ShipWaterPath } => leg !== null);
  if (itinerary.length === 0) return null;

  const primary = itinerary[0]!;
  return {
    waypoint: primary.waypoint,
    outbound: primary.outbound,
    inbound: primary.inbound,
    itinerary,
  };
}

/**
 * W4.23 — pick N (2 or 3) deterministic patrol anchors for the ship from the
 * zone's anchor pool. The legacy single-waypoint pick used
 * `stableHash(${id}.open-water-patrol) % waypoints.length`; this function
 * extends that to a small rotation that yields 2-3 distinct, well-spaced
 * anchors. The first anchor preserves the legacy choice for backwards-compat
 * with route-key signatures and the reduced-motion fallback.
 *
 * N = 2 when `stableUnit(shipId) < 0.5`, else N = 3 — gives roughly half/half
 * itinerary length distribution across the fleet.
 */
export function openWaterPatrolItineraryLength(shipId: string): 2 | 3 {
  return stableUnit(`${shipId}.itinerary-length`) < 0.5 ? 2 : 3;
}

/**
 * Deterministically choose which itinerary anchor to use for a given cycle.
 * Latin-square mod: stable hash on (shipId, cycleIndex) modulo itineraryLength.
 * Across cycles this rotates through different anchors with low autocorrelation,
 * so adjacent cycles produce different waypoint orderings.
 */
export function openWaterPatrolItineraryIndex(shipId: string, cycleIndex: number, itineraryLength: number): number {
  if (itineraryLength <= 0) return 0;
  return stableHash(`${shipId}.itinerary-cycle.${cycleIndex}`) % itineraryLength;
}

function openWaterPatrolItineraryAnchors(
  ship: ShipNode,
  riskTile: { x: number; y: number },
  map: PharosVilleMap,
): { x: number; y: number }[] {
  const length = openWaterPatrolItineraryLength(ship.id);
  const anchors: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  // Cycle through the zone's anchor pool starting at the legacy offset so the
  // first picked anchor matches the prior single-waypoint behaviour exactly.
  // We accumulate N distinct tiles, skipping duplicates that the
  // nearestMapWaterTile snap can produce in dense pools.
  const pool = OPEN_WATER_PATROL_WAYPOINTS[ship.riskZone];
  const baseOffset = stableHash(`${ship.id}.open-water-patrol`) % pool.length;
  // First anchor mirrors the legacy single-waypoint pick exactly so cycle 0
  // and the route-key signature stay stable.
  const primary = openWaterPatrolWaypoint(ship, riskTile, map);
  anchors.push(primary);
  seen.add(`${primary.x},${primary.y}`);
  // Subsequent anchors rotate through the pool with a coprime stride per ship
  // so the spacing varies but stays deterministic.
  const stride = 1 + (stableHash(`${ship.id}.itinerary-stride`) % Math.max(1, pool.length - 1));
  for (let probe = 1; probe < pool.length * 2 && anchors.length < length; probe += 1) {
    const index = (baseOffset + probe * stride) % pool.length;
    const candidate = nearestMapWaterTile(pool[index]!, map);
    const key = `${candidate.x},${candidate.y}`;
    if (seen.has(key)) continue;
    anchors.push(candidate);
    seen.add(key);
  }
  return anchors;
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

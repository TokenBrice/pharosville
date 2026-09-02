import { clampMapTile, isWaterTileKind, nearestWaterTile } from "./world-layout";
import { stableHash, stableUnit } from "./stable-random";
import {
  DOCKED_SHIP_DWELL_SHARE,
  MOTION_CYCLE_MAX_SECONDS,
  MOTION_LEG_MAX_SECONDS,
  MOTION_LEG_MIN_SECONDS,
  MOTION_PAIR_HORIZON_SECONDS,
  MOTION_PAIR_SLOT_SECONDS,
  MOTION_REST_MIN_SECONDS,
  MOTION_TRANSITION_SHARE,
  MOTION_UNDERWAY_MAX_TILES_PER_SECOND,
  MOTION_UNDERWAY_MIN_TILES_PER_SECOND,
  OPEN_WATER_PATROL_WAYPOINTS,
} from "./motion-config";
import { buildCachedShipWaterRoute, nearestMapWaterTile, reverseWaterPath, waterPathFromPoints } from "./motion-water";
import { clamp, pathKey, positiveModulo } from "./motion-utils";
import {
  STABLECOIN_SQUADS,
  squadFormationOffsetForPlacement,
  squadForMember,
} from "./maker-squad";
import { nearestRiskPlacementWaterTile } from "./risk-water-placement";
import { SEAWALL_BARRIER_TILES } from "./seawall";
import type { PharosVilleBaseMotionPlan, PharosVilleMotionPlan, ShipDockMotionStop, ShipMotionRoute, ShipMotionRouteStop, ShipWaterPath, ShipWaterRouteCache } from "./motion-types";
import type { DockNode, PharosVilleMap, PharosVilleWorld, ShipDockVisit, ShipNode } from "./world-types";
import { precomputeShipTempos } from "./ship-cycle-tempo";
import { seaBodyAtTile } from "./sea-bodies";

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
 * Capacity = min(4096, max(512, 24 × shipCount)) — the former 16-entry allowance
 * covered 72-tile island-anchorage motion. Shore-station voyages can reach 96
 * tiles and exercise proportionally more cadence-waypoint candidates.
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
    const capacity = Math.min(4096, Math.max(512, 24 * shipCount));
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
// map content yield the same string. Live data refetches
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
      // W7.7: flow-only refreshes must invalidate the plan whose cycle scalar
      // is derived from this field.
      (ship as ShipNode & { flowIntensity?: number | null }).flowIntensity ?? "",
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
  const map = `${world.map.width}x${world.map.height}:${world.map.waterRatio}`;
  const signature = `S[${shipParts.join("/")}]D[${dockParts.join("/")}]M[${map}]`;
  signatureByWorld.set(world, signature);
  return signature;
}

export function buildBaseMotionPlan(world: PharosVilleWorld, timeSeconds = 0): PharosVilleBaseMotionPlan {
  const bucket = Math.floor(timeSeconds / 600);
  const waterRouteCache = getMapPathCache(world.map, world.ships.length);

  // Compute per-ship speed scalars from 24h mint/redeem flow intensity once,
  // at plan-build time. `precomputeShipTempos` is now an O(N) pass because the
  // rate is independent per coin.
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
    shipRoutes,
  };
}

export function buildMotionPlan(
  world: PharosVilleWorld,
  _selectedDetailId: string | null,
  basePlan: PharosVilleBaseMotionPlan = buildBaseMotionPlan(world),
): PharosVilleMotionPlan {
  return basePlan;
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
  const cadenceIdentity = shipCadenceIdentity(ship);
  const cadenceUnit = stableUnit(`${cadenceIdentity}.leg-cadence`);
  const identityLegDurationSeconds = shipLegDurationSeconds(cadenceUnit, speedScalar);
  const cadenceGeometry = cadenceLegDurationForGeometry({
    ship,
    riskTile,
    dockStops,
    map,
    waterRouteCache,
    bucket,
    identityLegDurationSeconds,
  });
  const legDurationSeconds = cadenceGeometry.legDurationSeconds;
  const voyageDurationSeconds = cadenceGeometry.voyageDurationSeconds;
  const voyageLegCount = cadenceGeometry.voyageLegCount;
  // A long voyage may need a second logical leg. Carry its extension into the
  // dock rest to preserve the identity cadence spread, bounded by the existing
  // 22-minute cycle contract; also keep the opposite rest at its 240 s floor.
  const identityRestDurationSeconds = shipRestDurationSeconds(cadenceUnit, speedScalar);
  const restDurationSeconds = Math.max(
    Math.min(
      identityRestDurationSeconds + (voyageDurationSeconds - identityLegDurationSeconds),
      MOTION_CYCLE_MAX_SECONDS / 3,
    ),
    voyageDurationSeconds + MOTION_REST_MIN_SECONDS / 2,
  );
  const riskRestDurationSeconds = 2 * restDurationSeconds - 2 * voyageDurationSeconds;
  const cycleSeconds = restDurationSeconds + riskRestDurationSeconds + 2 * voyageDurationSeconds;
  const underwaySpeedTilesPerSecond = shipUnderwaySpeed(ship.riskZone, speedScalar);
  const waterPaths = new Map<string, ShipWaterPath>();
  const openWaterPatrol = dockStops.length === 0
    ? buildOpenWaterPatrol(
      ship,
      riskTile,
      map,
      waterRouteCache,
      bucket,
      voyageDurationSeconds,
      underwaySpeedTilesPerSecond,
    )
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
    // W4.23 — publish every itinerary leg while the plan is built. Sampling
    // must only read route geometry; invoking even a cached path builder from
    // RAF makes a cycle boundary capable of stalling a display frame.
    for (const leg of openWaterPatrol.itinerary) {
      const outboundKey = pathKey(leg.outbound.from, leg.outbound.to);
      const inboundKey = pathKey(leg.inbound.from, leg.inbound.to);
      waterPaths.set(outboundKey, leg.outbound);
      waterPaths.set(inboundKey, leg.inbound);
    }
  }

  for (const stop of dockStops) {
    const outboundKey = pathKey(riskTile, stop.mooringTile);
    const inboundKey = pathKey(stop.mooringTile, riskTile);
    const outbound = buildCadenceWaterRoute({
      from: riskTile,
      to: stop.mooringTile,
      map,
      zone: ship.riskZone,
      shipId: ship.id,
      bucket,
      legDurationSeconds: voyageDurationSeconds,
      paceTilesPerSecond: underwaySpeedTilesPerSecond,
    }, waterRouteCache);
    waterPaths.set(outboundKey, outbound);
    waterPaths.set(inboundKey, reverseWaterPath(outbound));
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
    legDurationSeconds,
    voyageDurationSeconds,
    voyageLegCount,
    restDurationSeconds,
    riskRestDurationSeconds,
    underwaySpeedTilesPerSecond,
    phaseSeconds: pairedShipPhaseSeconds({
      cadenceIdentity,
      cycleSeconds,
      voyageDurationSeconds,
      restDurationSeconds,
      riskRestDurationSeconds,
      zone: ship.riskZone,
    }),
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
    legDurationSeconds: flagshipRoute.legDurationSeconds,
    ...(flagshipRoute.voyageDurationSeconds !== undefined
      ? { voyageDurationSeconds: flagshipRoute.voyageDurationSeconds }
      : {}),
    ...(flagshipRoute.voyageLegCount !== undefined
      ? { voyageLegCount: flagshipRoute.voyageLegCount }
      : {}),
    restDurationSeconds: flagshipRoute.restDurationSeconds,
    ...(flagshipRoute.riskRestDurationSeconds !== undefined
      ? { riskRestDurationSeconds: flagshipRoute.riskRestDurationSeconds }
      : {}),
    underwaySpeedTilesPerSecond: flagshipRoute.underwaySpeedTilesPerSecond,
    phaseSeconds: flagshipRoute.phaseSeconds,
    riskTile,
    dockStops: [],
    riskStop,
    zone: flagshipRoute.zone,
    dockStopSchedule: [],
    homeDockId: null,
    openWaterPatrol,
    waterPaths: new Map<string, ShipWaterPath>(),
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

function shipCadenceIdentity(ship: ShipNode): string {
  const squad = squadForMember(ship.id);
  return squad?.flagshipId ?? ship.id;
}

function shipLegDurationSeconds(identityUnit: number, speedScalar: number): number {
  // Flow translates the whole 75-second identity band instead of scaling and
  // clipping its upper tail. Languid ships span 105..180 s; active ships span
  // 90..165 s. Every identity therefore retains a distinct cadence at either
  // pace extreme.
  const pace = clamp(speedScalar, 0.85, 1.15);
  const lowerBound = 97.5 + (1 - pace) * 50;
  return lowerBound + identityUnit * 75;
}

function shipRestDurationSeconds(identityUnit: number, speedScalar: number): number {
  // The independent 155-second rest band shifts with the same pace without a
  // clamp plateau: 265..420 s at measured-zero flow and 250..405 s at max.
  const pace = clamp(speedScalar, 0.85, 1.15);
  const lowerBound = 257.5 + (1 - pace) * 50;
  return lowerBound + identityUnit * 155;
}

function cadenceLegDurationForGeometry(input: {
  ship: ShipNode;
  riskTile: { x: number; y: number };
  dockStops: readonly ShipDockMotionStop[];
  map: PharosVilleMap;
  waterRouteCache: ShipWaterRouteCache;
  bucket: number;
  identityLegDurationSeconds: number;
}): { legDurationSeconds: number; voyageDurationSeconds: number; voyageLegCount: number } {
  const endpoints = input.dockStops.length > 0
    ? input.dockStops.map((stop) => stop.mooringTile)
    : openWaterPatrolItineraryAnchors(input.ship, input.riskTile, input.map);
  let minimumSeconds = MOTION_LEG_MIN_SECONDS;
  for (const endpoint of endpoints) {
    const direct = buildCachedShipWaterRoute({
      from: input.riskTile,
      to: endpoint,
      map: input.map,
      zone: input.ship.riskZone,
      shipId: input.ship.id,
      bucket: input.bucket,
      preferDirect: true,
    }, input.waterRouteCache);
    minimumSeconds = Math.max(
      minimumSeconds,
      direct.totalLength / MOTION_UNDERWAY_MAX_TILES_PER_SECOND,
    );
  }
  const voyageDurationSeconds = Math.max(input.identityLegDurationSeconds, minimumSeconds);
  const voyageLegCount = Math.max(1, Math.ceil(voyageDurationSeconds / MOTION_LEG_MAX_SECONDS));
  const legDurationSeconds = voyageDurationSeconds / voyageLegCount;
  if (legDurationSeconds < MOTION_LEG_MIN_SECONDS - 1e-9) {
    throw new Error(`Cadence split produced a short leg for ${input.ship.id}: ${legDurationSeconds.toFixed(2)}s`);
  }
  return { legDurationSeconds, voyageDurationSeconds, voyageLegCount };
}

function pairedShipPhaseSeconds(input: {
  cadenceIdentity: string;
  cycleSeconds: number;
  voyageDurationSeconds: number;
  restDurationSeconds: number;
  riskRestDurationSeconds: number;
  zone: ShipNode["riskZone"];
}): number {
  // Each identity claims one side of a stable 10 s assignment slot; paired
  // arrival/departure boundaries are assessed in the harbour's 15 s windows.
  // Both sides breathe against the same immutable table without consulting
  // roster rank, so adding a ship cannot shift another ship's clock.
  const slotCount = MOTION_PAIR_HORIZON_SECONDS / MOTION_PAIR_SLOT_SECONDS;
  const pairKey = `${input.zone}:${stableHash(input.cadenceIdentity)}`;
  // Table version 159 keeps both sides represented across at least 80% of
  // the default frame's 15-second windows after the rim fleet expansion.
  const slot = stableHash(`${pairKey}.slot.159`) % slotCount;
  const anchorsArrival = (stableHash(`${pairKey}.side.1`) & 1) === 1;
  const departureBoundary = input.restDurationSeconds;
  const arrivalBoundary = input.restDurationSeconds
    + input.voyageDurationSeconds
    + input.riskRestDurationSeconds
    + input.voyageDurationSeconds * (1 - MOTION_TRANSITION_SHARE);
  const boundary = anchorsArrival ? arrivalBoundary : departureBoundary;
  const slotTime = (slot + 0.5) * MOTION_PAIR_SLOT_SECONDS;
  return positiveModulo(boundary - slotTime, input.cycleSeconds);
}

function shipUnderwaySpeed(zone: ShipNode["riskZone"], speedScalar: number): number {
  const bandBase = zone === "danger" ? 0.72
    : zone === "warning" ? 0.66
      : zone === "alert" ? 0.6
        : zone === "watch" ? 0.54
          : zone === "ledger" ? 0.51
            : 0.48;
  return clamp(
    bandBase * speedScalar,
    MOTION_UNDERWAY_MIN_TILES_PER_SECOND,
    MOTION_UNDERWAY_MAX_TILES_PER_SECOND,
  );
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
  legDurationSeconds = MOTION_LEG_MAX_SECONDS,
  paceTilesPerSecond = MOTION_UNDERWAY_MIN_TILES_PER_SECOND,
): ShipMotionRoute["openWaterPatrol"] {
  // W4.23 — build the per-ship 2- or 3-anchor itinerary. The first anchor is
  // the legacy single waypoint (cycle 0); the remaining anchors are visited
  // on subsequent cycles via openWaterPatrolItineraryIndex.
  const anchors = openWaterPatrolItineraryAnchors(ship, riskTile, map);
  if (anchors.length === 0) return null;

  const itinerary = anchors
    .map((waypoint) => {
      const outbound = buildCadenceWaterRoute({
        from: riskTile,
        to: waypoint,
        map,
        zone: ship.riskZone,
        shipId: ship.id,
        bucket,
        legDurationSeconds,
        paceTilesPerSecond,
        allowEndpointTruncation: true,
      }, waterRouteCache);
      if (outbound.points.length <= 1 || outbound.totalLength <= 0) return null;
      const minLength = MOTION_UNDERWAY_MIN_TILES_PER_SECOND * legDurationSeconds;
      const maxLength = MOTION_UNDERWAY_MAX_TILES_PER_SECOND * legDurationSeconds;
      if (outbound.totalLength < minLength || outbound.totalLength > maxLength) return null;
      return { waypoint: outbound.to, outbound, inbound: reverseWaterPath(outbound) };
    })
    .filter((leg): leg is { waypoint: { x: number; y: number }; outbound: ShipWaterPath; inbound: ShipWaterPath } => leg !== null)
    .slice(0, openWaterPatrolItineraryLength(ship.id));
  if (itinerary.length === 0) return null;

  const primary = itinerary[0]!;
  return {
    waypoint: primary.waypoint,
    outbound: primary.outbound,
    inbound: primary.inbound,
    itinerary,
  };
}

function buildCadenceWaterRoute(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone: ShipNode["riskZone"];
  shipId: string;
  bucket: number;
  legDurationSeconds: number;
  paceTilesPerSecond: number;
  allowEndpointTruncation?: boolean;
}, cache: ShipWaterRouteCache): ShipWaterPath {
  const cadenceKey = `cadence:${input.zone}:${input.shipId}:${input.legDurationSeconds.toFixed(6)}:${input.paceTilesPerSecond.toFixed(6)}:${input.allowEndpointTruncation ? "truncate" : "fixed"}:${pathKey(input.from, input.to)}`;
  const cachedCadence = cache.get(cadenceKey);
  if (cachedCadence) return cachedCadence;
  const direct = buildCachedShipWaterRoute({ ...input, preferDirect: true }, cache);
  const minLength = MOTION_UNDERWAY_MIN_TILES_PER_SECOND * input.legDurationSeconds;
  const maxLength = MOTION_UNDERWAY_MAX_TILES_PER_SECOND * input.legDurationSeconds;
  if (lengthInsideCadenceEnvelope(direct.totalLength, minLength, maxLength)) {
    cache.set(cadenceKey, direct);
    return direct;
  }
  if (input.allowEndpointTruncation && direct.totalLength > maxLength) {
    const truncated = truncateWaterPathToLength(direct, maxLength - 1e-6);
    cache.set(cadenceKey, truncated);
    return truncated;
  }

  for (const authored of OPEN_WATER_PATROL_WAYPOINTS[input.zone]) {
    const waypoint = nearestMapWaterTile(authored, input.map);
    if ((waypoint.x === input.from.x && waypoint.y === input.from.y)
      || (waypoint.x === input.to.x && waypoint.y === input.to.y)) continue;
    const first = buildCachedShipWaterRoute({ ...input, to: waypoint }, cache);
    const second = buildCachedShipWaterRoute({ ...input, from: waypoint }, cache);
    if (first.totalLength <= 0 || second.totalLength <= 0) continue;
    const combined = waterPathFromPoints(
      first.from,
      second.to,
      [...first.points, ...second.points.slice(1)],
    );
    if (!lengthInsideCadenceEnvelope(combined.totalLength, minLength, maxLength)) continue;
    cache.set(cadenceKey, combined);
    return combined;
  }
  const candidates = input.map.tiles
    .filter((tile) => isWaterTileKind(tile.terrain ?? tile.kind)
      && seaBodyAtTile(tile.x, tile.y) === input.zone)
    .map((tile) => ({
      tile,
      score: Math.abs(
        Math.hypot(tile.x - input.from.x, tile.y - input.from.y)
          + Math.hypot(input.to.x - tile.x, input.to.y - tile.y)
          - (minLength + maxLength) / 2,
      ),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);
  for (const candidate of candidates) {
    const waypoint = nearestMapWaterTile(candidate.tile, input.map);
    const first = buildCachedShipWaterRoute({ ...input, to: waypoint }, cache);
    const second = buildCachedShipWaterRoute({ ...input, from: waypoint }, cache);
    if (first.totalLength <= 0 || second.totalLength <= 0) continue;
    const combined = waterPathFromPoints(
      first.from,
      second.to,
      [...first.points, ...second.points.slice(1)],
    );
    if (!lengthInsideCadenceEnvelope(combined.totalLength, minLength, maxLength)) continue;
    cache.set(cadenceKey, combined);
    return combined;
  }
  const lengthened = lengthenWaterPathToEnvelope(direct, minLength, maxLength);
  if (lengthened) {
    cache.set(cadenceKey, lengthened);
    return lengthened;
  }
  // The named motion radius keeps production endpoints inside the maximum
  // envelope. Refuse an impossible route rather than silently returning a leg
  // whose true derivative violates the perceptual speed contract.
  throw new Error(`No cadence-safe water leg for ${input.shipId}: ${direct.totalLength.toFixed(2)} not in ${minLength.toFixed(2)}..${maxLength.toFixed(2)}`);
}

const CADENCE_LENGTH_EPSILON = 1e-6;

function lengthInsideCadenceEnvelope(length: number, minimum: number, maximum: number): boolean {
  return length >= minimum - CADENCE_LENGTH_EPSILON
    && length <= maximum + CADENCE_LENGTH_EPSILON;
}

function lengthenWaterPathToEnvelope(
  direct: ShipWaterPath,
  minLength: number,
  maxLength: number,
): ShipWaterPath | null {
  if (direct.totalLength <= 0 || direct.totalLength > maxLength) return null;
  if (direct.totalLength >= minLength) return direct;

  // Add the shortest necessary out-and-back excursion along the already safe
  // A* chain, then complete the original path. Fractional interpolation stays
  // on that water segment and avoids an out-of-envelope emergency fallback.
  let extraLength = minLength - direct.totalLength;
  const points: Array<{ x: number; y: number }> = [{ ...direct.from }];
  while (extraLength >= 2 * direct.totalLength) {
    points.push(...direct.points.slice(1));
    points.push(...direct.points.slice(0, -1).reverse());
    extraLength -= 2 * direct.totalLength;
  }
  const excursionLength = extraLength / 2;
  const excursion: Array<{ x: number; y: number }> = [{ ...direct.from }];
  let remaining = excursionLength;
  for (let index = 1; index < direct.points.length && remaining > 0; index += 1) {
    const from = direct.points[index - 1]!;
    const to = direct.points[index]!;
    const segmentLength = Math.hypot(to.x - from.x, to.y - from.y);
    if (segmentLength <= remaining) {
      excursion.push({ ...to });
      remaining -= segmentLength;
      continue;
    }
    const ratio = remaining / Math.max(segmentLength, 1e-9);
    excursion.push({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
    remaining = 0;
  }
  if (remaining > 1e-6) return null;
  points.push(
    ...excursion.slice(1),
    ...excursion.slice(0, -1).reverse(),
    ...direct.points.slice(1),
  );
  const path = waterPathFromPoints(direct.from, direct.to, points);
  return path.totalLength >= minLength - 1e-6 && path.totalLength <= maxLength + 1e-6 ? path : null;
}

function truncateWaterPathToLength(path: ShipWaterPath, maxLength: number): ShipWaterPath {
  const points: Array<{ x: number; y: number }> = [{ ...path.from }];
  let remaining = maxLength;
  for (let index = 1; index < path.points.length && remaining > 0; index += 1) {
    const from = path.points[index - 1]!;
    const to = path.points[index]!;
    const segmentLength = Math.hypot(to.x - from.x, to.y - from.y);
    if (segmentLength <= remaining) {
      points.push({ ...to });
      remaining -= segmentLength;
      continue;
    }
    const ratio = remaining / Math.max(segmentLength, 1e-9);
    points.push({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
    remaining = 0;
  }
  return waterPathFromPoints(path.from, points[points.length - 1]!, points);
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
  const anchors: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  // Cycle through the zone's anchor pool starting at the legacy offset so the
  // first picked anchor matches the prior single-waypoint behaviour exactly.
  // We accumulate N distinct tiles, skipping duplicates that the
  // nearestMapWaterTile snap can produce in dense pools.
  const pool = OPEN_WATER_PATROL_WAYPOINTS[ship.riskZone];
  const maxCandidates = Math.min(pool.length, openWaterPatrolItineraryLength(ship.id) * 4);
  const baseOffset = stableHash(`${ship.id}.open-water-patrol`) % pool.length;
  // First anchor mirrors the legacy single-waypoint pick exactly so cycle 0
  // and the route-key signature stay stable.
  const primary = openWaterPatrolWaypoint(ship, riskTile, map);
  anchors.push(primary);
  seen.add(`${primary.x},${primary.y}`);
  // Subsequent anchors rotate through the pool with a coprime stride per ship
  // so the spacing varies but stays deterministic.
  const stride = 1 + (stableHash(`${ship.id}.itinerary-stride`) % Math.max(1, pool.length - 1));
  for (let probe = 1; probe < pool.length * 2 && anchors.length < maxCandidates; probe += 1) {
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

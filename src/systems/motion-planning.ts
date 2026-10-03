import { clampMapTile, isWaterTileKind, nearestWaterTile } from "./world-layout";
import { stableHash, stableUnit } from "./stable-random";
import {
  MOTION_LEG_MAX_SECONDS,
  MOTION_LEG_MIN_SECONDS,
  MOTION_REST_MIN_SECONDS,
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
import type { PharosVilleBaseMotionPlan, PharosVilleMotionPlan, ShipDockMotionStop, ShipInletCrossing, ShipMarketTransition, ShipMotionRoute, ShipMotionRouteStop, ShipWaterPath, ShipWaterRouteCache } from "./motion-types";
import type { DockNode, PharosVilleMap, PharosVilleWorld, ShipDockVisit, ShipNode, ShipRiskPlacement } from "./world-types";
import { precomputeShipTempos, shipCycleTempo } from "./ship-cycle-tempo";
import { seaBodyAtTile } from "./sea-bodies";
import { riskWaterAreaForPlacement } from "./risk-water-areas";
import {
  GARDEN_ATTENTION_DEFAULT_SEED,
  GARDEN_VOYAGE_DEPARTURE_START_SECONDS,
  GARDEN_VOYAGE_HOMECOMING_START_SECONDS,
  GARDEN_VOYAGE_LATTICE_OFFSET_AT_ZERO_SECONDS,
  GARDEN_VOYAGE_PERIOD_SECONDS,
  GARDEN_VOYAGE_WINDOW_SECONDS,
  GARDEN_VOYAGE_WINDOW_SHARE,
  gardenAttentionSlotsBetween,
  gardenWindShiftsBetween,
  type GardenScoreGift,
} from "./garden-attention-scheduler";
import { GARDEN_EMPTY_INLET, gardenInletDistance, isGardenInletCoreTile } from "./garden-inlet";
import { gardenRepresentativeBerth } from "./garden-observatory-slice";

/** One slow berth sway at the quays: a ten-minute cycle, in radians. */
const BERTH_SWAY_PERIOD_SECONDS = 600;

/**
 * A berth's slow sway phase: every quay shares one ten-minute cycle, lagged by
 * at most 24 seconds per berth so neighbours never move in lockstep; raft mates
 * share one berth. Scenery, not data, and never a tide (K45a).
 */
export function berthSwayPhase(timeSeconds: number, berth: { x: number; y: number }): number {
  const time = (Number.isFinite(timeSeconds) ? timeSeconds : 0) - stableUnit(`tide.${berth.x}.${berth.y}`) * 24;
  return positiveModulo(time, BERTH_SWAY_PERIOD_SECONDS) / BERTH_SWAY_PERIOD_SECONDS * Math.PI * 2;
}

/**
 * Wind shifts are issued this far either side of the plan clock: past the
 * 600 s rebuild interval, so a swing in progress at a rebuild continues.
 */
const WIND_SHIFT_HORIZON_SECONDS = 1_800;

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

interface AcceptedMarketReading {
  placement: ShipRiskPlacement;
  /** The decisive row's observation and methodology identify its sample. */
  source: "pegSummary" | "stress";
  observedAt: number | null;
  pegMethodologyVersion: string | null;
  stressMethodologyVersion: string | null;
}

/** Session-owned acceptance state; deliberately separate from display geometry. */
export interface MarketObservationState {
  acceptedByShipId: Map<string, AcceptedMarketReading>;
  occurrenceSequence: number;
}

export function createMarketObservationState(): MarketObservationState {
  return { acceptedByShipId: new Map(), occurrenceSequence: 0 };
}

/** Admit comparable own readings on world refreshes, even without a route rebuild. */
export function captureAcceptedMarketTransitions(
  world: PharosVilleWorld,
  state: MarketObservationState,
): ReadonlyMap<string, ShipMarketTransition> {
  const transitions = new Map<string, ShipMarketTransition>();
  for (const ship of world.ships) {
    const peg = ship.evidence.pegSummary;
    const stress = ship.evidence.stress;
    if (!peg || !stress || peg.state !== "current" || stress.state !== "current"
      || peg.coverage.state !== "complete" || stress.coverage.state !== "complete") continue;
    const source = ship.evidence[ship.ownRisk.source]!;
    const previous = state.acceptedByShipId.get(ship.id);
    const placement = ship.ownRisk.placement;
    const comparable = previous?.pegMethodologyVersion === peg.methodologyVersion
      && previous.stressMethodologyVersion === stress.methodologyVersion;
    if (previous?.placement === placement && previous.source === ship.ownRisk.source
      && previous.observedAt === source.observedAt && comparable) continue;
    state.acceptedByShipId.set(ship.id, {
      placement, source: ship.ownRisk.source, observedAt: source.observedAt,
      pegMethodologyVersion: peg.methodologyVersion, stressMethodologyVersion: stress.methodologyVersion,
    });
    // A methodology switch starts a new comparison baseline, never a market move.
    if (!previous || !comparable || previous.placement === placement) continue;
    transitions.set(ship.id, {
      occurrenceId: ++state.occurrenceSequence,
      fromLabel: riskWaterAreaForPlacement(previous.placement).label,
      toLabel: riskWaterAreaForPlacement(placement).label,
      observedAt: source.observedAt,
    });
  }
  return transitions;
}

/**
 * LRU-bounded cache for A* ship water routes, keyed by zone:shipId:bucket:from→to string.
 * Capacity = min(4096, max(512, 24 × shipCount)) — the former 16-entry allowance
 * covered 72-tile island-anchorage motion. Shore-station voyages reached
 * 96 tiles before the 2026-09 harbour re-siting and now reach ~128 (the
 * south-reed boathouse from a north risk tile), exercising proportionally
 * more cadence-waypoint candidates.
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
    // The representative berth the route anchors at (W5.5): it depends on
    // the whole fleet's selection and blue-noise placement (supply, 7d/24h
    // change, hull, scale, zone), so a world with the same routing fields but
    // different placement inputs — a cached world with schema drift, then the
    // fresh one — must not reuse the plan. Whole tiles, as the route rounds.
    const berth = ship.dockVisits.length > 0 ? gardenRepresentativeBerth(world, ship.id) : null;
    shipParts.push([
      ship.id,
      ship.marketCapUsd,
      ship.change24hUsd ?? "",
      ship.change24hPct ?? "",
      // Only effective pace belongs here: provenance alone cannot replay a voyage.
      shipCycleTempo(ship).scalar,
      `${ship.riskTile.x},${ship.riskTile.y}`,
      berth ? `${Math.round(berth.x)},${Math.round(berth.y)}` : "",
      ship.riskPlacement,
      ship.riskZone,
      ship.riskWaterLabel,
      ship.visual.sizeTier,
      ship.placementEvidence.stale ? 1 : 0,
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

/**
 * `attention` feeds the W1.6 scheduler: its seed, and the score gifts that
 * claim attention slots (W5 passes `planGardenScoreGifts` output; until then
 * every slot is a crossing or wind-shift slot). The same seed's wind shifts
 * ride on every route, so the whole anchorage lies to one settled bearing.
 */
export function buildBaseMotionPlan(
  world: PharosVilleWorld,
  timeSeconds = 0,
  attention: { seed?: string; gifts?: readonly GardenScoreGift[] } = {},
): PharosVilleBaseMotionPlan {
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
    flagshipRouteBySquad.set(squad.id, buildShipMotionRoute(flagship, world.map, world.docks, waterRouteCache, bucket, speedScalarById.get(flagship.id) ?? 1, gardenRepresentativeBerth(world, flagship.id)));
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
    shipRoutes.set(ship.id, buildShipMotionRoute(ship, world.map, world.docks, waterRouteCache, bucket, speedScalarById.get(ship.id) ?? 1, gardenRepresentativeBerth(world, ship.id)));
  }

  const seed = attention.seed ?? GARDEN_ATTENTION_DEFAULT_SEED;
  assignInletCrossingTokens({
    bucket,
    gifts: attention.gifts ?? [],
    seed,
    shipRoutes,
    timeSeconds,
    waterRouteCache,
    world,
  });
  const windShifts = gardenWindShiftsBetween(
    seed,
    timeSeconds - WIND_SHIFT_HORIZON_SECONDS,
    timeSeconds + WIND_SHIFT_HORIZON_SECONDS,
  );
  for (const route of shipRoutes.values()) route.windShifts = windShifts;

  return {
    shipRoutes,
  };
}

/**
 * W1.6 ceremony subjects: the only hulls that may hold an inlet crossing
 * token. The hero band's titan and heritage ("unique") tiers with a harbour to
 * come home to; squads sail in formation and never cross alone.
 */
const INLET_CROSSING_SUBJECT_TIERS: Partial<Record<ShipNode["visual"]["sizeTier"], true>> = { titan: true, unique: true };
/**
 * Tokens are issued for attention slots within this span either side of the
 * plan clock, which covers any voyage in progress at a 600 s plan rebuild
 * and every voyage starting before the next one. Assignment is a pure
 * function of the slot, so successive plans agree on every holder.
 */
const INLET_CROSSING_HORIZON_SECONDS = 1_800;

/**
 * Hands each crossing slot's token to the most significant ceremony subject
 * whose arrival voyage starts inside the slot's admit window, finishes inside
 * its hold, and whose straight route home runs through the inlet core within
 * the voyage's cadence envelope. Every other voyage keeps its inlet-honouring
 * path; a slot with no such arrival passes quietly.
 */
function assignInletCrossingTokens(input: {
  bucket: number;
  gifts: readonly GardenScoreGift[];
  seed: string;
  shipRoutes: Map<string, ShipMotionRoute>;
  timeSeconds: number;
  waterRouteCache: ShipWaterRouteCache;
  world: PharosVilleWorld;
}): void {
  const subjects = input.world.ships
    .filter((ship) => !ship.squadId && ship.dockVisits.length > 0 && INLET_CROSSING_SUBJECT_TIERS[ship.visual.sizeTier])
    .toSorted((left, right) => right.marketCapUsd - left.marketCapUsd || left.id.localeCompare(right.id));
  if (subjects.length === 0) return;
  const slots = gardenAttentionSlotsBetween(
    input.seed,
    input.timeSeconds - INLET_CROSSING_HORIZON_SECONDS,
    input.timeSeconds + INLET_CROSSING_HORIZON_SECONDS,
    input.gifts,
  ).filter((slot) => slot.kind === "crossing");
  const crossingPathByKey = new Map<string, ShipWaterPath | null>();
  const crossingsByShipId = new Map<string, ShipInletCrossing[]>();
  for (const slot of slots) {
    for (const ship of subjects) {
      const route = input.shipRoutes.get(ship.id);
      if (!route || route.dockStopSchedule.length === 0) continue;
      const voyageSeconds = route.voyageDurationSeconds ?? route.legDurationSeconds;
      // Cycle order (route-cycle.ts): dock dwell, departure, risk rest, arrival.
      const arrivalOffsetSeconds = route.restDurationSeconds + voyageSeconds
        + (route.riskRestDurationSeconds ?? route.restDurationSeconds);
      const cycleIndex = Math.ceil((slot.startSeconds + route.phaseSeconds - arrivalOffsetSeconds) / route.cycleSeconds);
      const startSeconds = cycleIndex * route.cycleSeconds - route.phaseSeconds + arrivalOffsetSeconds;
      if (startSeconds >= slot.admitEndSeconds || startSeconds + voyageSeconds > slot.endSeconds) continue;
      const dockId = route.dockStopSchedule[positiveModulo(cycleIndex + 1, route.dockStopSchedule.length)];
      const stop = route.dockStops.find((entry) => entry.dockId === dockId);
      if (!stop) continue;
      const key = `${ship.id}:${stop.dockId}`;
      let path = crossingPathByKey.get(key);
      if (path === undefined) {
        const candidate = buildCachedShipWaterRoute({
          from: route.riskTile,
          to: stop.mooringTile,
          map: input.world.map,
          zone: ship.riskZone,
          shipId: ship.id,
          bucket: input.bucket,
          preferDirect: true,
          inletCrossing: true,
        }, input.waterRouteCache);
        const fitsVoyage = lengthInsideCadenceEnvelope(
          candidate.totalLength,
          MOTION_UNDERWAY_MIN_TILES_PER_SECOND * voyageSeconds,
          MOTION_UNDERWAY_MAX_TILES_PER_SECOND * voyageSeconds,
        );
        path = fitsVoyage && candidate.points.some((point) => isGardenInletCoreTile(point.x, point.y)) ? candidate : null;
        crossingPathByKey.set(key, path);
      }
      if (!path) continue;
      const crossings = crossingsByShipId.get(ship.id) ?? [];
      crossings.push({
        cycleIndex,
        dockId: stop.dockId,
        endSeconds: startSeconds + voyageSeconds,
        path,
        slotIndex: slot.index,
        startSeconds,
      });
      crossingsByShipId.set(ship.id, crossings);
      break;
    }
  }
  for (const [shipId, inletCrossings] of crossingsByShipId) {
    input.shipRoutes.set(shipId, { ...input.shipRoutes.get(shipId)!, inletCrossings });
  }
  // A forced crossing (the director's `crossing` ritual, W5.5) outlives plan
  // rebuilds until its subject is home by its own route.
  for (const [shipId, forced] of forcedInletCrossings) {
    const route = input.shipRoutes.get(shipId);
    // A world rebuild that moved the anchorage invalidates the voyage.
    const sameAnchorage = route && forced.path.from.x === route.riskTile.x && forced.path.from.y === route.riskTile.y;
    if (!route || !sameAnchorage || forced.holdUntilSeconds <= input.timeSeconds - INLET_CROSSING_HORIZON_SECONDS) {
      forcedInletCrossings.delete(shipId);
      continue;
    }
    input.shipRoutes.set(shipId, { ...route, inletCrossings: [...(route.inletCrossings ?? []), forced] });
  }
}

/** Forced crossings by subject id; module state so plan rebuilds keep them. */
const forcedInletCrossings = new Map<string, ShipInletCrossing & { holdUntilSeconds: number }>();

/** Test seam: forget every forced crossing. */
export function __resetForcedInletCrossings(): void {
  forcedInletCrossings.clear();
}

/**
 * W5.5: start a crossing now (the director's forced `crossing` ritual). A
 * ceremony subject (titan or heritage) lying at its anchorage — settled, and
 * with time for the whole voyage before its own homecoming would have ended,
 * the soonest home of them — sails
 * through the inlet at once and then lies at its berth until its route
 * brings it there anyway, so nothing jumps. Mutates `plan` in place (the
 * render loop reads it every frame). Returns the token, or null when no
 * subject can cross now.
 */
export function forceInletCrossing(
  plan: PharosVilleMotionPlan,
  world: PharosVilleWorld,
  timeSeconds: number,
): InletCrossingToken | null {
  if (!Number.isFinite(timeSeconds)) return null;
  const waterRouteCache = getMapPathCache(world.map, world.ships.length);
  const subjects = world.ships
    .filter((ship) => !ship.squadId && ship.dockVisits.length > 0 && INLET_CROSSING_SUBJECT_TIERS[ship.visual.sizeTier])
    .toSorted((left, right) => right.marketCapUsd - left.marketCapUsd || left.id.localeCompare(right.id));
  const routes = plan.shipRoutes as Map<string, ShipMotionRoute>;
  // Of the subjects that can cross now, the one home soonest: a forced
  // crossing is watched from the rest seat, so it should not keep the viewer
  // waiting minutes for its landfall. Ties go to the larger supply.
  let best: { route: ShipMotionRoute; crossing: ShipInletCrossing & { holdUntilSeconds: number } } | null = null;
  for (const ship of subjects) {
    const route = routes.get(ship.id);
    if (!route || route.dockStopSchedule.length === 0 || forcedInletCrossings.has(ship.id)) continue;
    const voyageSeconds = route.voyageDurationSeconds ?? route.legDurationSeconds;
    const riskRestSeconds = route.riskRestDurationSeconds ?? route.restDurationSeconds;
    const cyclePosition = timeSeconds + route.phaseSeconds;
    const cycleIndex = Math.floor(cyclePosition / route.cycleSeconds);
    const intoCycle = cyclePosition - cycleIndex * route.cycleSeconds;
    const riskRestStart = route.restDurationSeconds + voyageSeconds;
    // Settled on the rode (past the round-up) and not yet weighing anchor.
    if (intoCycle < riskRestStart + 40 || intoCycle >= riskRestStart + riskRestSeconds - 40) continue;
    const dockId = route.dockStopSchedule[positiveModulo(cycleIndex + 1, route.dockStopSchedule.length)];
    const stop = route.dockStops.find((entry) => entry.dockId === dockId);
    if (!stop) continue;
    const path = buildCachedShipWaterRoute({
      from: route.riskTile,
      to: stop.mooringTile,
      map: world.map,
      zone: ship.riskZone,
      shipId: ship.id,
      bucket: route.routeEpoch ?? 0,
      preferDirect: true,
      inletCrossing: true,
    }, waterRouteCache);
    if (!path.points.some((point) => isGardenInletCoreTile(point.x, point.y))) continue;
    const crossingSeconds = clamp(
      path.totalLength / route.underwaySpeedTilesPerSecond,
      path.totalLength / MOTION_UNDERWAY_MAX_TILES_PER_SECOND,
      path.totalLength / MOTION_UNDERWAY_MIN_TILES_PER_SECOND,
    );
    const naturalHomecomingEnd = timeSeconds - intoCycle + riskRestStart + riskRestSeconds + voyageSeconds;
    if (timeSeconds + crossingSeconds > naturalHomecomingEnd) continue;
    if (best && best.crossing.endSeconds <= timeSeconds + crossingSeconds) continue;
    best = {
      route,
      crossing: {
        cycleIndex,
        dockId: stop.dockId,
        endSeconds: timeSeconds + crossingSeconds,
        holdUntilSeconds: naturalHomecomingEnd,
        path,
        slotIndex: -1,
        startSeconds: timeSeconds,
      },
    };
  }
  if (!best) return null;
  const { route, crossing } = best;
  forcedInletCrossings.set(route.shipId, crossing);
  routes.set(route.shipId, { ...route, inletCrossings: [...(route.inletCrossings ?? []), crossing] });
  return { ...crossing, shipId: route.shipId };
}

export interface InletCrossingToken extends ShipInletCrossing {
  shipId: string;
}

/**
 * The crossing tokens a plan issued whose voyage overlaps `[from, to)` on the
 * motion clock, in time order. The director (W5) names the holder as the
 * arrival ceremony's subject; no other hull crosses the inlet meanwhile.
 */
export function inletCrossingTokensBetween(
  plan: PharosVilleMotionPlan,
  fromSeconds: number,
  toSeconds: number,
): InletCrossingToken[] {
  const tokens: InletCrossingToken[] = [];
  for (const route of plan.shipRoutes.values()) {
    for (const crossing of route.inletCrossings ?? []) {
      if (crossing.endSeconds > fromSeconds && crossing.startSeconds < toSeconds) tokens.push({ ...crossing, shipId: route.shipId });
    }
  }
  return tokens.toSorted((left, right) => left.startSeconds - right.startSeconds);
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
  anchorage: { x: number; y: number } | null = null,
): ShipMotionRoute {
  // W5.5: a docked representative anchors at the berth it is drawn at, so
  // its voyages start and end there; others anchor at their data tile.
  const riskTile = nearestWaterTile(anchorage && ship.dockVisits.length > 0
    ? { x: Math.round(anchorage.x), y: Math.round(anchorage.y) }
    : ship.riskTile);
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
  // W4.F11: rests are fitted to the scheduler's voyage windows, so the
  // voyage length decides how many lattice steps the anchorage rest spans.
  const windowedCadence = windowedShipCadence(cadenceIdentity, voyageDurationSeconds);
  const restDurationSeconds = windowedCadence.dockRestSeconds;
  const riskRestDurationSeconds = windowedCadence.riskRestSeconds;
  const cycleSeconds = windowedCadence.cycleSeconds;
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
    phaseSeconds: windowedCadence.phaseSeconds,
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
    // Consorts use their own ship's signals (not the flagship's), so each
    // consort's stale evidence and change24hPct are reflected independently.
    staleEvidence: ship.placementEvidence.stale,
    wakeMultiplier: computeWakeMultiplier(ship.change24hPct),
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

// Keep the hull parallel to its wharf. Open-water rest is aligned to wind at
// sample time; only actual dock geometry supplies a fixed tangent here.
function dockTangentForVisit(
  visit: ShipDockVisit,
  docks: readonly DockNode[],
): { x: number; y: number } | null {
  const dock = docks.find((entry) => entry.id === visit.dockId && entry.chainId === visit.chainId);
  if (dock) {
    const dx = dock.tile.x - visit.mooringTile.x;
    const dy = dock.tile.y - visit.mooringTile.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { x: -dy / length, y: dx / length };
  }
  // Tangent parallel to the nearest seawall.
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
  return { x: -dy / length, y: dx / length };
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

/**
 * W4.F11 windowed cadence. The cycle opens with the dock (or first patrol)
 * rest, then the departure voyage, the anchorage rest and the homecoming
 * voyage. Identity chooses where in the voyage lattice the ship casts off and
 * where it lands: most identities (`GARDEN_VOYAGE_WINDOW_SHARE`) inside the
 * departure and homecoming windows, the rest anywhere else in the period, so
 * the harbour gathers its voyages without a regatta and is never frozen.
 * Each rest takes the smallest whole number of lattice periods that keeps it
 * ≥ 600 s — so it stays under 1500 s — and the cycle is then a whole number
 * of periods: every later cycle lands at the same lattice offsets. Nothing
 * reads roster rank, so adding a ship never re-deals another ship's clock.
 */
function windowedShipCadence(cadenceIdentity: string, voyageDurationSeconds: number): {
  cycleSeconds: number;
  dockRestSeconds: number;
  phaseSeconds: number;
  riskRestSeconds: number;
} {
  const period = GARDEN_VOYAGE_PERIOD_SECONDS;
  const window = GARDEN_VOYAGE_WINDOW_SECONDS;
  const latticeOffset = (salt: string, windowStart: number): number => {
    const unit = stableUnit(`${cadenceIdentity}.${salt}-offset`);
    return stableUnit(`${cadenceIdentity}.${salt}-windowed`) < GARDEN_VOYAGE_WINDOW_SHARE
      ? windowStart + unit * window
      : windowStart + window + unit * (period - window);
  };
  const departOffset = latticeOffset("departure", GARDEN_VOYAGE_DEPARTURE_START_SECONDS);
  const homeOffset = latticeOffset("homecoming", GARDEN_VOYAGE_HOMECOMING_START_SECONDS);
  let riskRestSeconds = positiveModulo(homeOffset - departOffset - 2 * voyageDurationSeconds, period);
  while (riskRestSeconds < MOTION_REST_MIN_SECONDS) riskRestSeconds += period;
  let dockRestSeconds = positiveModulo(departOffset - homeOffset, period);
  while (dockRestSeconds < MOTION_REST_MIN_SECONDS) dockRestSeconds += period;
  const cycleSeconds = dockRestSeconds + riskRestSeconds + 2 * voyageDurationSeconds;
  const laps = Math.max(1, Math.round(cycleSeconds / period));
  const lap = stableHash(`${cadenceIdentity}.voyage-lap`) % laps;
  // Motion time of one cast-off: its lattice offset shifted onto the motion
  // clock, on this identity's lap.
  const departureTime = departOffset - GARDEN_VOYAGE_LATTICE_OFFSET_AT_ZERO_SECONDS + lap * period;
  return {
    cycleSeconds,
    dockRestSeconds,
    phaseSeconds: positiveModulo(dockRestSeconds - departureTime, cycleSeconds),
    riskRestSeconds,
  };
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

  const itinerary: Array<NonNullable<ShipMotionRoute["openWaterPatrol"]>["itinerary"][number]> = [];
  for (const waypoint of anchors) {
    if (waypoint.x === riskTile.x && waypoint.y === riskTile.y) continue;
    const outbound = tryBuildCadenceWaterRoute({
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
    if (!outbound || outbound.points.length <= 1 || outbound.totalLength <= 0) continue;
    const minLength = MOTION_UNDERWAY_MIN_TILES_PER_SECOND * legDurationSeconds;
    const maxLength = MOTION_UNDERWAY_MAX_TILES_PER_SECOND * legDurationSeconds;
    if (outbound.totalLength < minLength || outbound.totalLength > maxLength) continue;
    itinerary.push({ waypoint: outbound.to, outbound, inbound: reverseWaterPath(outbound) });
    // Later successful anchors were discarded by the itinerary slice. Keep the
    // same first N successes without planning voyages that can never be sailed.
    if (itinerary.length === openWaterPatrolItineraryLength(ship.id)) break;
  }
  if (itinerary.length === 0) return null;

  const primary = itinerary[0]!;
  return {
    waypoint: primary.waypoint,
    outbound: primary.outbound,
    inbound: primary.inbound,
    itinerary,
  };
}

interface CadenceWaterRouteInput {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone: ShipNode["riskZone"];
  shipId: string;
  bucket: number;
  legDurationSeconds: number;
  paceTilesPerSecond: number;
  allowEndpointTruncation?: boolean;
}

function buildCadenceWaterRoute(input: CadenceWaterRouteInput, cache: ShipWaterRouteCache): ShipWaterPath {
  const route = tryBuildCadenceWaterRoute(input, cache);
  if (route) return route;
  const direct = buildCachedShipWaterRoute({ ...input, preferDirect: true }, cache);
  const minLength = MOTION_UNDERWAY_MIN_TILES_PER_SECOND * input.legDurationSeconds;
  const maxLength = MOTION_UNDERWAY_MAX_TILES_PER_SECOND * input.legDurationSeconds;
  // Required dock legs must not silently violate the perceptual speed contract.
  throw new Error(`No cadence-safe water leg for ${input.shipId}: ${direct.totalLength.toFixed(2)} not in ${minLength.toFixed(2)}..${maxLength.toFixed(2)}`);
}

const cadenceCandidatesByMap = new WeakMap<PharosVilleMap, Map<ShipNode["riskZone"], PharosVilleMap["tiles"]>>();

function cadenceCandidateTiles(map: PharosVilleMap, zone: ShipNode["riskZone"]): PharosVilleMap["tiles"] {
  let zones = cadenceCandidatesByMap.get(map);
  if (!zones) {
    zones = new Map();
    cadenceCandidatesByMap.set(map, zones);
  }
  const cached = zones.get(zone);
  if (cached) return cached;
  const tiles = map.tiles.filter((tile) => isWaterTileKind(tile.terrain ?? tile.kind)
    && seaBodyAtTile(tile.x, tile.y) === zone
    && gardenInletDistance(tile.x, tile.y) > GARDEN_EMPTY_INLET.halfWidth);
  zones.set(zone, tiles);
  return tiles;
}

function tryBuildCadenceWaterRoute(input: CadenceWaterRouteInput, cache: ShipWaterRouteCache): ShipWaterPath | null {
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

  // W1.6: a lengthening mark inside the ma would pull the leg into the approach.
  const outsideInlet = (tile: { x: number; y: number }) => gardenInletDistance(tile.x, tile.y) > GARDEN_EMPTY_INLET.halfWidth;
  for (const authored of OPEN_WATER_PATROL_WAYPOINTS[input.zone]) {
    const waypoint = nearestMapWaterTile(authored, input.map);
    if ((waypoint.x === input.from.x && waypoint.y === input.from.y)
      || (waypoint.x === input.to.x && waypoint.y === input.to.y)
      || !outsideInlet(waypoint)) continue;
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
  // Stable top-four selection preserves full-sort ties in map order, without
  // allocating/sorting the whole zone for every optional itinerary anchor.
  const candidates: Array<{ tile: PharosVilleMap["tiles"][number]; score: number }> = [];
  for (const tile of cadenceCandidateTiles(input.map, input.zone)) {
    const score = Math.abs(
      Math.hypot(tile.x - input.from.x, tile.y - input.from.y)
        + Math.hypot(input.to.x - tile.x, input.to.y - tile.y)
        - (minLength + maxLength) / 2,
    );
    let index = 0;
    while (index < candidates.length && candidates[index]!.score <= score) index += 1;
    if (index >= 4) continue;
    candidates.splice(index, 0, { tile, score });
    if (candidates.length > 4) candidates.pop();
  }
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
  // Optional patrols can rest at their risk tile when no safe leg is feasible.
  return null;
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

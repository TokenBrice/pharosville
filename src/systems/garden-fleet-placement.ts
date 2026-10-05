import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";
import { gardenShipHullReachWorld, gardenShipWaterMarginTiles, isGardenShipWater } from "./garden-water-exclusion";
import { GARDEN_SHIP_ROOT_Y, GARDEN_SILHOUETTE_FOR_HULL, gardenShipVisualScale } from "./garden-observatory-slice";
import { defaultCamera } from "./camera";
import { TILE_SCALE, screenToGround, type ScreenPoint } from "./projection";
import { GARDEN_EMPTY_INLET, gardenInletDistance } from "./garden-inlet";
import { stableFnv1aHash } from "./stable-random";
import { GARDEN_FLEET_FAMILY_ENVELOPES, createGardenFleetFootprint, gardenFleetPolygonOverlap, gardenFleetRestViews, publishGardenFleetProtectedIntervals, writeGardenFleetFootprint, writeGardenFleetFootprintCrop, type GardenFleetFootprint, type GardenFleetRestView } from "./garden-fleet-footprint";
import type { ShipNode, ShipWaterZone, TerrainKind } from "./world-types";
import { shipRestSailBraceRad } from "./ship-visuals";
import { restSeatEyeForAspect, REST_SEAT_YAW_RAD, REST_SEAT_PITCH_RAD, REST_SEAT_VFOV_DEG } from "./rest-seat";

/** Three visual masses share the real risk field. They never classify a coin.
 * Retained berths reserve water first; supply leaders take legal front edges;
 * stable-ID pools fill the shoreline splines and sparse satellites. */
const TERRAIN_FOR_ZONE: Record<ShipWaterZone, TerrainKind> = {
  alert: "alert-water", calm: "calm-water", danger: "storm-water",
  ledger: "ledger-water", warning: "warning-water", watch: "watch-water",
};
export const MIN_HULL_GAP = 1.35;
const CANDIDATES_PER_SHIP = 256;
const MEAN_NEAREST_FLOOR_TILES = 3.5;
const RECOVERY_CANDIDATES_PER_SHIP = 192;
const CLEARANCE_SHORTLIST = 24;
/** Keep a protected interval off the hulls that frame it, in width fractions. */
const INTERVAL_EDGE_MARGIN = 0.004;
/** Readable protected width, as a fraction of viewport width. */
const INTERVAL_MIN_WIDTH = 0.03;
const LIGHTHOUSE_CLEARANCE_TILES = 9;
/** Capacity candidates confirmed against the reserved intervals, per arrival. */
const FALLBACK_SHORTLIST = 24;
const EDGE_FALLOFF_TILES = 6;

/** Quadratic shoreline axes: unequal widths, never per-band seed counts. */
export const GARDEN_FLEET_LOBES = [
  { id: "near-left", weight: 0.56, width: 20, a: { x: 20, y: 73 }, b: { x: 32, y: 113 }, c: { x: 63, y: 114 } },
  { id: "rear-left", weight: 0.25, width: 12, a: { x: 16, y: 44 }, b: { x: 24, y: 17 }, c: { x: 69, y: 24 } },
  { id: "right", weight: 0.15, width: 16, a: { x: 106, y: 112 }, b: { x: 99, y: 67 }, c: { x: 127, y: 28 } },
] as const;
const SPLINE_SAMPLES = GARDEN_FLEET_LOBES.map((axis) => Array.from({ length: 25 }, (_, step) => {
  const t = step / 24; const u = 1 - t;
  return {
    x: u * u * axis.a.x + 2 * u * t * axis.b.x + t * t * axis.c.x,
    y: u * u * axis.a.y + 2 * u * t * axis.b.y + t * t * axis.c.y,
    heading: Math.atan2(u * (axis.b.y - axis.a.y) + t * (axis.c.y - axis.b.y), u * (axis.b.x - axis.a.x) + t * (axis.c.x - axis.b.x)),
  };
}));
const SATELLITES = [{ x: 25, y: 19 }, { x: 79, y: 27 }, { x: 112, y: 121 }] as const;

export interface GardenFleetMooringPlacement {
  dominantMooring: boolean;
  /** Global visual mass, not a risk category. Adjacent legal bands may share it. */
  mooringId: string;
  rankWithinMooring: number;
  mooringSize: number;
  riskBand: ShipWaterZone;
}
export type GardenFleetPlacementPath = "primary" | "relaxed" | "overflow" | "capacity-overflow";
export interface GardenFleetPlacement {
  tileByShipId: Map<string, ScreenPoint>;
  mooringByShipId: Map<string, GardenFleetMooringPlacement>;
  /** Accepted tile-plane heading; renderer rotation.y is its negative. */
  restingHeadingByShipId: Map<string, number>;
  /** Accepted solve tier, retained with the berth for diagnostic provenance. */
  placementPathByShipId: Map<string, GardenFleetPlacementPath>;
}
interface Berth {
  tile: ScreenPoint;
  margin: number;
  mooring: GardenFleetMooringPlacement;
  restingHeadingRad: number;
  placementPath: GardenFleetPlacementPath;
}
interface Candidate extends ScreenPoint {
  lobe: number;
  heading: number;
  distance: readonly number[];
}
interface Placed extends Berth {
  footprints: GardenFleetFootprint[];
  leader: boolean;
  leaderLoss: number[];
  nearestSq: number;
}
interface HullIndex {
  cells: Map<number, Placed[]>;
  maxMargin: number;
  nearestSq: Float64Array;
}
const HULL_CELL = 8;
const HULL_STRIDE = 4096;

/** Exact nearest distances are updated once per admitted hull across the finite
 * tile pool. Candidate scans are O(1), including exhausted narrow waters. */
function clearsPreferredGap(index: HullIndex, tile: ScreenPoint, margin: number): boolean {
  const nearestSq = index.nearestSq[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x]!;
  if (nearestSq < (margin * MIN_HULL_GAP) ** 2) return false;
  if (nearestSq >= (Math.max(margin, index.maxMargin) * MIN_HULL_GAP) ** 2) return true;
  const cx = Math.floor(tile.x / HULL_CELL); const cy = Math.floor(tile.y / HULL_CELL);
  const radius = Math.ceil(Math.max(margin, index.maxMargin) * MIN_HULL_GAP / HULL_CELL);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const cell = index.cells.get((cy + dy) * HULL_STRIDE + cx + dx);
    if (!cell) continue;
    for (const other of cell) {
      const x = tile.x - other.tile.x; const y = tile.y - other.tile.y;
      if (x * x + y * y < (Math.max(margin, other.margin) * MIN_HULL_GAP) ** 2) return false;
    }
  }
  return true;
}
let regionCache: Map<TerrainKind, Candidate[]> | null = null;
let berthCache: { lighthouseX: number; lighthouseY: number; byShipId: Map<string, Berth> } | null = null;
let restChromeKeepoutCache: readonly ScreenPoint[] | null = null;

function restChromeKeepoutPolygon(): readonly ScreenPoint[] {
  if (restChromeKeepoutCache) return restChromeKeepoutCache;
  const viewport = { x: 1600, y: 1000 };
  const camera = defaultCamera({ height: viewport.y, width: viewport.x, map: { height: PHAROSVILLE_MAP_HEIGHT, width: PHAROSVILLE_MAP_WIDTH } });
  restChromeKeepoutCache = [{ x: 1420, y: 880 }, { x: 1600, y: 880 }, { x: 1600, y: 1000 }, { x: 1420, y: 1000 }]
    .map((corner) => screenToGround(corner, camera, viewport, GARDEN_SHIP_ROOT_Y));
  return restChromeKeepoutCache;
}
function restChromeKeepoutDistance(x: number, y: number): number {
  const polygon = restChromeKeepoutPolygon();
  let inside = false;
  let nearest = Infinity;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!; const b = polygon[previous]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x; const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return inside ? 0 : nearest;
}
function densityWeight(x: number, y: number, lighthouseTile: ScreenPoint): number {
  if (gardenInletDistance(x, y) <= GARDEN_EMPTY_INLET.halfWidth || restChromeKeepoutDistance(x, y) <= 0
    || Math.hypot(x - lighthouseTile.x, y - lighthouseTile.y) < LIGHTHOUSE_CLEARANCE_TILES) return 0;
  const edge = Math.min(x, y, PHAROSVILLE_MAP_WIDTH - 1 - x, PHAROSVILLE_MAP_HEIGHT - 1 - y);
  return Math.max(0, Math.min(1, edge / EDGE_FALLOFF_TILES));
}
function isBerthWater(tile: ScreenPoint, margin: number): boolean {
  return gardenInletDistance(tile.x, tile.y) > GARDEN_EMPTY_INLET.halfWidth + margin
    && restChromeKeepoutDistance(tile.x, tile.y) > margin && isGardenShipWater(tile, margin, true);
}
function regionTiles(): Map<TerrainKind, Candidate[]> {
  if (regionCache) return regionCache;
  const regions = new Map<TerrainKind, Candidate[]>();
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y++) for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x++) {
    const distance: number[] = [];
    let lobe = 0;
    let heading = 0;
    for (let index = 0; index < GARDEN_FLEET_LOBES.length; index++) {
      const axis = GARDEN_FLEET_LOBES[index]!;
      let nearest = Infinity;
      let tangent = 0;
      // Fixed spline tessellation is independent of fleet size and data order.
      for (const sample of SPLINE_SAMPLES[index]!) {
        const dx = x - sample.x; const dy = y - sample.y;
        const d = (dx * dx + dy * dy) / (axis.width * axis.width);
        if (d < nearest) {
          nearest = d;
          tangent = sample.heading;
        }
      }
      const reach = Math.sqrt(nearest);
      distance.push(reach);
      if (reach < (distance[lobe] ?? Infinity)) { lobe = index; heading = tangent; }
      if (index === 0) heading = tangent;
    }
    const kind = terrainKindAt(x, y);
    const pool = regions.get(kind) ?? [];
    pool.push({ x, y, lobe, heading, distance });
    regions.set(kind, pool);
  }
  regionCache = regions;
  return regions;
}
/** Test-only: clear accepted berths, terrain pools and the accepted intervals. */
export function resetGardenFleetPlacementCache(): void {
  regionCache = null;
  berthCache = null;
  publishGardenFleetProtectedIntervals(null);
}

/** Only envelopes in front can hide a sail; summed intersection is a safe
 * upper bound on union loss, so overlapping occluders never undercount it. */
function sailLoss(sail: GardenFleetFootprint, occluder: GardenFleetFootprint, scratch: GardenFleetFootprint): number {
  if (occluder.viewDepth >= sail.viewDepth || !sail.identitySail.area) return 0;
  return (gardenFleetPolygonOverlap(sail.identitySail, occluder.hull, scratch)
    + gardenFleetPolygonOverlap(sail.identitySail, occluder.sails, scratch)) / sail.identitySail.area;
}

function fleetEnvelopeOverlap(a: GardenFleetFootprint, b: GardenFleetFootprint, scratch: GardenFleetFootprint): number {
  if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) return 0;
  return gardenFleetPolygonOverlap(a.hull, b.hull, scratch) + gardenFleetPolygonOverlap(a.sails, b.sails, scratch)
    + gardenFleetPolygonOverlap(a.hull, b.sails, scratch) + gardenFleetPolygonOverlap(a.sails, b.hull, scratch);
}
function projectBerth(ship: ShipNode, tile: ScreenPoint, heading: number, footprints: GardenFleetFootprint[]): void {
  const views = gardenFleetRestViews();
  writeGardenFleetFootprint(footprints[0]!, ship, tile, -heading, views[0]!.camera, views[0]!.viewport);
  writeGardenFleetFootprint(footprints[3]!, ship, tile, -heading, views[3]!.camera, views[3]!.viewport);
  for (let eye = 1; eye < 3; eye++) {
    writeGardenFleetFootprintCrop(footprints[eye]!, footprints[0]!, views[0]!.viewport, views[eye]!.viewport);
  }
}

/**
 * One fleet solve per arrival. A single protected interval is RESERVED before
 * it — the authored column, identical for every call — and every admission
 * tier treats it as hard. The second interval is DESCRIPTIVE: measured from
 * the accepted picture's remaining free columns and published with its true
 * width, never reserved. The reservation deliberately carries no state between
 * calls: a berth, and so a voyage length and its place on the lattice, must
 * depend only on the roster and the harbour, never on what was solved before.
 */
export function placeGardenFleet(ships: readonly ShipNode[], lighthouseTile: ScreenPoint): GardenFleetPlacement {
  const views = gardenFleetRestViews();
  publishGardenFleetProtectedIntervals(null);
  const reserved = views.map((view) => view.intervals.slice(0, 1));
  publishGardenFleetProtectedIntervals(reserved);
  const solved = solveFleet(ships, lighthouseTile);
  publishGardenFleetProtectedIntervals(measureIntervals(solved.placed, views, reserved));
  return solved.placement;
}

/**
 * The reserved interval, clipped to the water the committed picture actually
 * left open, plus the widest remaining free column as a measured report. Views
 * 1 and 2 are crops of view 0's projection, so their columns are its affine
 * image rather than three separate decisions.
 */
function measureIntervals(
  placed: readonly Placed[], views: readonly GardenFleetRestView[],
  reserved: readonly (readonly (readonly [number, number])[])[],
): readonly (readonly (readonly [number, number])[])[] {
  const referenceAspect = views[0]!.viewport.x / views[0]!.viewport.y;
  // A crop sees less of the reference frame, so a column near its edge is cut
  // in half by the narrowest gate. Choose only from the band every landscape
  // crop still shows whole, and the reserved interval reads in all of them.
  let visible = 0.5;
  for (const view of views) {
    if (view.viewport.x < view.viewport.y) continue;
    visible = Math.min(visible, 0.5 * (view.viewport.x / view.viewport.y) / referenceAspect);
  }
  const bounds: [number, number] = [0.5 - visible + INTERVAL_EDGE_MARGIN, 0.5 + visible - INTERVAL_EDGE_MARGIN];
  const reference = columnIntervals(placed, views[0]!, 0, reserved[0]?.[0] ?? null, bounds);
  return views.map((view, eye) => {
    if (eye === 0) return reference;
    if (view.viewport.x < view.viewport.y) return columnIntervals(placed, view, eye, reserved[eye]?.[0] ?? null, [0, 1]);
    const aspect = view.viewport.x / view.viewport.y;
    return reference.map(([left, right]) => [
      Math.max(0, 0.5 + (left - 0.5) * referenceAspect / aspect),
      Math.min(1, 0.5 + (right - 0.5) * referenceAspect / aspect),
    ] as [number, number]);
  });
}

function columnIntervals(
  placed: readonly Placed[], view: GardenFleetRestView, eye: number,
  reserved: readonly [number, number] | null, bounds: readonly [number, number],
): readonly (readonly [number, number])[] {
  const spans: Array<[number, number]> = [];
  for (const berth of placed) {
    const footprint = berth.footprints[eye]!;
    for (const polygon of [footprint.hull, footprint.sails]) {
      if (!polygon.clippedArea) continue;
      spans.push([polygon.minX / view.viewport.x, polygon.maxX / view.viewport.x]);
    }
  }
  if (spans.length < 2) return [];
  spans.sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  let covered = spans[0]![1];
  for (const [start, end] of spans) {
    if (start - covered > 2 * INTERVAL_EDGE_MARGIN) {
      gaps.push([covered + INTERVAL_EDGE_MARGIN, start - INTERVAL_EDGE_MARGIN]);
    }
    covered = Math.max(covered, end);
  }
  const first = spans[0]![0];
  if (first > 2 * INTERVAL_EDGE_MARGIN) gaps.push([INTERVAL_EDGE_MARGIN, first - INTERVAL_EDGE_MARGIN]);
  if (covered < 1 - 2 * INTERVAL_EDGE_MARGIN) gaps.push([covered + INTERVAL_EDGE_MARGIN, 1 - INTERVAL_EDGE_MARGIN]);
  const inBounds = gaps
    .map(([left, right]) => [Math.max(left, bounds[0]), Math.min(right, bounds[1])] as [number, number])
    .filter(([left, right]) => right - left > 0);
  const byWidth = inBounds.toSorted((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  // The reservation keeps its column while the picture still leaves it open;
  // a crowded refresh re-cuts it from the quietest water instead.
  let primary = byWidth[0];
  if (reserved) {
    for (const [start, end] of inBounds) {
      const overlap: [number, number] = [Math.max(reserved[0], start), Math.min(reserved[1], end)];
      if (overlap[1] - overlap[0] >= INTERVAL_MIN_WIDTH) { primary = overlap; break; }
    }
  }
  if (!primary) return [];
  const secondary = byWidth.find((gap) => gap !== primary && (gap[1] <= primary![0] || gap[0] >= primary![1]));
  return secondary ? [primary, secondary].toSorted((a, b) => a[0] - b[0]) : [primary];
}

function solveFleet(ships: readonly ShipNode[], lighthouseTile: ScreenPoint): { placement: GardenFleetPlacement; placed: readonly Placed[] } {
  const regions = regionTiles();
  const views = gardenFleetRestViews();
  const tileByShipId = new Map<string, ScreenPoint>();
  const mooringByShipId = new Map<string, GardenFleetMooringPlacement>();
  const restingHeadingByShipId = new Map<string, number>();
  const placementPathByShipId = new Map<string, GardenFleetPlacementPath>();
  const nextBerths = new Map<string, Berth>();
  const placed: Placed[] = [];
  const scratch = views.map(() => createGardenFleetFootprint());
  const hullIndex: HullIndex = { cells: new Map(), maxMargin: 0,
    nearestSq: new Float64Array(PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT).fill(Infinity) };
  const areaByEye = views.map(() => 0);
  const overlapByEye = views.map(() => 0);
  const ordered = ships.toSorted((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0) || a.id.localeCompare(b.id));
  const leaders = new Set(ordered.slice(0, 3).map((ship) => ship.id));
  // Rank leaders by supply even when compressed scales saturate to the same size.
  ordered.splice(3, ordered.length, ...ordered.slice(3).sort((a, b) => b.visual.scale - a.visual.scale || a.id.localeCompare(b.id)));
  const marginFor = (ship: ShipNode): number => gardenShipWaterMarginTiles(gardenShipVisualScale(ship.visual.scale || 1), GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull]);
  const accept = (ship: ShipNode, berth: Berth): void => {
    const footprints = views.map(() => createGardenFleetFootprint());
    projectBerth(ship, berth.tile, berth.restingHeadingRad, footprints);
    const leader = leaders.has(ship.id);
    const leaderLoss = views.map(() => 0);
    for (let eye = 0; eye < views.length; eye++) {
      const footprint = footprints[eye]!;
      areaByEye[eye] = areaByEye[eye]! + footprint.hull.area + footprint.sails.area;
      for (const other of placed) {
        const occupied = other.footprints[eye]!;
        const overlap = fleetEnvelopeOverlap(footprint, occupied, scratch[eye]!);
        if (!overlap) continue;
        overlapByEye[eye] = overlapByEye[eye]! + overlap;
        if (other.leader) other.leaderLoss[eye] = other.leaderLoss[eye]! + sailLoss(occupied, footprint, scratch[eye]!);
        if (leader) leaderLoss[eye] = leaderLoss[eye]! + sailLoss(footprint, occupied, scratch[eye]!);
      }
    }
    const nearestSq = hullIndex.nearestSq[berth.tile.y * PHAROSVILLE_MAP_WIDTH + berth.tile.x]!;
    for (const other of placed) {
      const dx = berth.tile.x - other.tile.x; const dy = berth.tile.y - other.tile.y;
      other.nearestSq = Math.min(other.nearestSq, dx * dx + dy * dy);
    }
    const accepted: Placed = { ...berth, footprints, leader, leaderLoss, nearestSq };
    placed.push(accepted);
    const key = Math.floor(berth.tile.y / HULL_CELL) * HULL_STRIDE + Math.floor(berth.tile.x / HULL_CELL);
    const cell = hullIndex.cells.get(key) ?? [];
    cell.push(accepted); hullIndex.cells.set(key, cell);
    hullIndex.maxMargin = Math.max(hullIndex.maxMargin, berth.margin);
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y++) {
      const dy = y - berth.tile.y;
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x++) {
        const dx = x - berth.tile.x;
        const index = y * PHAROSVILLE_MAP_WIDTH + x;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < hullIndex.nearestSq[index]!) hullIndex.nearestSq[index] = distanceSq;
      }
    }
    tileByShipId.set(ship.id, berth.tile);
    mooringByShipId.set(ship.id, berth.mooring);
    restingHeadingByShipId.set(ship.id, berth.restingHeadingRad);
    placementPathByShipId.set(ship.id, berth.placementPath);
    nextBerths.set(ship.id, berth);
  };
  // Reservations precede all arrivals; never re-rank retained IDs for prettier composition.
  if (berthCache?.lighthouseX === lighthouseTile.x && berthCache.lighthouseY === lighthouseTile.y) {
    for (const ship of ordered) {
      const previous = berthCache.byShipId.get(ship.id);
      if (previous && previous.mooring.riskBand === ship.riskZone && previous.margin === marginFor(ship)) accept(ship, previous);
    }
  }
  const legalPools = new Map<string, Candidate[]>();
  for (const ship of ordered) {
    if (nextBerths.has(ship.id)) continue;
    const margin = marginFor(ship);
    const candidates = regions.get(TERRAIN_FOR_ZONE[ship.riskZone]) ?? [];
    let remaining = stableUnit(`${ship.id}.mass`);
    let preferred: number = GARDEN_FLEET_LOBES.length;
    for (let index = 0; index < GARDEN_FLEET_LOBES.length; index++) {
      if (remaining < GARDEN_FLEET_LOBES[index]!.weight) { preferred = index; break; }
      remaining -= GARDEN_FLEET_LOBES[index]!.weight;
    }
    const satellite = Math.floor(stableUnit(`${ship.id}.satellite`) * SATELLITES.length);
    const key = `${ship.riskZone}.${margin}.${preferred}.${preferred === 3 ? satellite : 0}`;
    let pool = legalPools.get(key);
    const compositionDistance = (tile: Candidate): number => preferred < 3 ? tile.distance[preferred]!
      : Math.hypot(tile.x - SATELLITES[satellite]!.x, tile.y - SATELLITES[satellite]!.y) / 6;
    if (!pool) {
      // Every lobe's pool is explicitly clipped to the actual band's legal water.
      pool = candidates.filter((tile) => densityWeight(tile.x, tile.y, lighthouseTile) > 0 && isBerthWater(tile, margin))
        .sort((a, b) => compositionDistance(a) - compositionDistance(b) || a.y - b.y || a.x - b.x);
      legalPools.set(key, pool);
    }
    const selection: {
      tile: Candidate | null; rank: readonly number[] | null;
      relaxed: Candidate | null; nearest: number; relaxedPreservesMean: boolean;
    } = { tile: null, rank: null, relaxed: null, nearest: -Infinity, relaxedPreservesMean: false };
    const leader = leaders.has(ship.id);
    const offset = Math.floor(stableUnit(`${ship.id}.pool`) * Math.max(1, pool.length));
    const headingVariation = (stableUnit(`${ship.id}.heading`) - 0.5) * 0.16;
    const intervalClear = intervalGuard(ship);
    let nearestSum = 0;
    for (const other of placed) nearestSum += Math.sqrt(other.nearestSq);
    let primaryProjections = 0;
    const evaluate = (tile: Candidate, widerSearch = false): void => {
      const nearest = Math.sqrt(hullIndex.nearestSq[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x]!);
      const preservesMean = preservesMeanNearest(placed, tile, nearest, nearestSum);
      if ((preservesMean && !selection.relaxedPreservesMean)
        || preservesMean === selection.relaxedPreservesMean && nearest > selection.nearest) {
        selection.relaxed = tile; selection.nearest = nearest; selection.relaxedPreservesMean = preservesMean;
      }
      // The coarse hull gap is legality, not composition: no tier relaxes it,
      // and neither land, apron, risk-field nor inlet clearance relaxes here.
      if (nearest < MIN_HULL_GAP || !clearsPreferredGap(hullIndex, tile, margin)) return;
      if (!preservesMean) return;
      if (!widerSearch && primaryProjections++ >= CANDIDATES_PER_SHIP) return;
      const heading = tile.heading + headingVariation;
      projectBerth(ship, tile, heading, scratch);
      let overlap = 0;
      let intervals = 0;
      let leaderViolation = 0;
      let clipping = 0;
      let depth = Infinity;
      for (let eye = 0; eye < views.length; eye++) {
        const footprint = scratch[eye]!;
        const view = views[eye]!;
        let eyeOverlap = 0;
        let ownLoss = 0;
        for (const other of placed) {
          const occupied = other.footprints[eye]!;
          const contribution = fleetEnvelopeOverlap(footprint, occupied, footprint);
          if (!contribution) continue;
          eyeOverlap += contribution;
          if (leader) ownLoss += sailLoss(footprint, occupied, footprint);
          if (other.leader) leaderViolation = Math.max(leaderViolation, other.leaderLoss[eye]! + sailLoss(occupied, footprint, footprint) - 0.095);
        }
        if (leader) leaderViolation = Math.max(leaderViolation, ownLoss - 0.095);
        const area = footprint.hull.area + footprint.sails.area;
        // One objective for every pass: worst-eye overlap share of the whole
        // fleet picture, so candidates stay comparable as the search widens.
        overlap = Math.max(overlap, (overlapByEye[eye]! + eyeOverlap) / Math.max(1, areaByEye[eye]! + area));
        for (const [left, right] of view.intervals) for (const envelope of [footprint.hull, footprint.sails]) {
          if (envelope.maxY < 0 || envelope.minY > view.viewport.y) continue;
          intervals += Math.max(0, Math.min(envelope.maxX, right * view.viewport.x) - Math.max(envelope.minX, left * view.viewport.x)) / view.viewport.x;
        }
        if (leader && footprint.identitySail.area) clipping = Math.max(clipping, 1 - footprint.identitySail.clippedArea / footprint.identitySail.area);
        depth = Math.min(depth, footprint.viewDepth);
      }
      // Hull/inlet safety was decided before projection. Interval protection
      // and the leader-sail envelope are admission requirements in every tier,
      // never traded against overlap; exhaust the pool before overflow.
      if (leaderViolation > 0 || intervals > 0) return;
      const rank = [overlap, Math.max(0, leaderViolation), leader ? clipping : 0,
        leader ? depth / 250 : compositionDistance(tile), leader ? compositionDistance(tile) : -nearest];
      let better = !selection.rank;
      if (selection.rank) for (let i = 0; i < rank.length; i++) {
        if (rank[i] === selection.rank[i]) continue;
        better = rank[i]! < selection.rank[i]!; break;
      }
      if (better) { selection.tile = tile; selection.rank = rank; }
    };
    // Stable-ID spread through the near half of the pool plus region-wide samples.
    // Front-edge candidates are independent of identity/supply scale saturation.
    for (let attempt = 0; attempt < Math.min(CANDIDATES_PER_SHIP, pool.length); attempt++) {
      const reach = attempt < 128 ? Math.min(pool.length, Math.max(128, Math.floor(pool.length * 0.45))) : pool.length;
      const index = attempt < 32 ? attempt : (offset + attempt * 137) % reach;
      evaluate(pool[index]!);
    }
    if (!selection.tile) {
      // Bounded, stable-ID coverage of the entire legal pool, same objective.
      for (let attempt = 0; attempt < Math.min(RECOVERY_CANDIDATES_PER_SHIP, pool.length); attempt++) {
        const index = attempt < 32 ? attempt : (offset + attempt * 137) % pool.length;
        evaluate(pool[index]!, true);
      }
    }
    // Projection budgets never truncate the legal clearance solve: the cached
    // distance field shortlists the farthest legal water — the conservative
    // analytic bound only orders it — and the real projector then confirms
    // interval protection and the leader envelope before anything is accepted.
    let clearance: Candidate | null = null;
    if (!selection.tile) {
      const shortlist: Candidate[] = [];
      const guarded = new Set<Candidate>();
      const order = (tile: Candidate): number => nearestOf(hullIndex, tile) + (guarded.has(tile) ? 1e4 : 0);
      for (const tile of pool) {
        const nearest = Math.sqrt(hullIndex.nearestSq[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x]!);
        if (nearest < MIN_HULL_GAP || !clearsPreferredGap(hullIndex, tile, margin)) continue;
        const preservesMean = preservesMeanNearest(placed, tile, nearest, nearestSum);
        if ((preservesMean && !selection.relaxedPreservesMean)
          || preservesMean === selection.relaxedPreservesMean && nearest > selection.nearest) {
          selection.relaxed = tile; selection.nearest = nearest; selection.relaxedPreservesMean = preservesMean;
        }
        if (!preservesMean) continue;
        if (intervalClear(tile, tile.heading + headingVariation)) guarded.add(tile);
        const score = order(tile);
        let rank = shortlist.length;
        while (rank > 0 && order(shortlist[rank - 1]!) < score) rank--;
        if (rank >= CLEARANCE_SHORTLIST) continue;
        shortlist.splice(rank, 0, tile);
        if (shortlist.length > CLEARANCE_SHORTLIST) shortlist.pop();
      }
      for (const tile of shortlist) {
        if (!protectsIntervals(ship, tile, tile.heading + headingVariation, views, scratch, placed, leader)) continue;
        clearance = tile; break;
      }
    }
    // Legal water that protects the view outranks a wider gap that does not:
    // only genuine exhaustion of the band may cross a protected interval.
    const protects = (tile: ScreenPoint, heading: number): boolean =>
      protectsIntervals(ship, tile, heading, views, scratch, placed, leader);
    let accepted = selection.tile ?? clearance;
    if (!accepted && selection.relaxed && selection.relaxedPreservesMean
      && selection.nearest >= MIN_HULL_GAP && clearsPreferredGap(hullIndex, selection.relaxed, margin)
      && protects(selection.relaxed, selection.relaxed.heading + headingVariation)) accepted = selection.relaxed;
    const resolved = accepted ?? fallbackBerth(candidates, margin, hullIndex, lighthouseTile, ship.tile, placed, nearestSum,
      (tile) => protects(tile, headingVariation));
    const nearest = Math.sqrt(hullIndex.nearestSq[resolved.y * PHAROSVILLE_MAP_WIDTH + resolved.x] ?? Infinity);
    const capacityOverflow = !clearsPreferredGap(hullIndex, resolved, margin)
      || !preservesMeanNearest(placed, resolved, nearest, nearestSum);
    const lobe = accepted?.lobe ?? 0;
    const mooring: GardenFleetMooringPlacement = {
      dominantMooring: lobe === 0 && preferred !== 3,
      mooringId: preferred === 3 ? `satellite-${satellite}` : GARDEN_FLEET_LOBES[lobe]!.id,
      mooringSize: 0, rankWithinMooring: 0, riskBand: ship.riskZone,
    };
    accept(ship, {
      tile: { x: resolved.x, y: resolved.y }, margin, mooring,
      restingHeadingRad: (accepted?.heading ?? 0) + headingVariation,
      placementPath: capacityOverflow ? "capacity-overflow"
        : selection.tile ? "primary" : clearance ? "relaxed" : "overflow",
    });
  }
  const members = new Map<string, string[]>();
  for (const ship of ordered) {
    const mooring = mooringByShipId.get(ship.id)!;
    const ids = members.get(mooring.mooringId) ?? [];
    ids.push(ship.id); members.set(mooring.mooringId, ids);
  }
  for (const ids of members.values()) for (const [rankWithinMooring, id] of ids.entries()) {
    const mooring = { ...mooringByShipId.get(id)!, mooringSize: ids.length, rankWithinMooring };
    mooringByShipId.set(id, mooring);
    nextBerths.get(id)!.mooring = mooring;
  }
  berthCache = { lighthouseX: lighthouseTile.x, lighthouseY: lighthouseTile.y, byShipId: nextBerths };
  return { placement: { mooringByShipId, tileByShipId, restingHeadingByShipId, placementPathByShipId }, placed };
}

/** Every tier here admits only water that leaves the reserved intervals empty:
 * cheap legality ranks a bounded shortlist, the projector confirms it, and a
 * crossing is reached only when the whole band is genuinely exhausted. */
function fallbackBerth(candidates: readonly ScreenPoint[], margin: number, index: HullIndex, lighthouseTile: ScreenPoint, dataTile: ScreenPoint, placed: readonly Placed[], nearestSum: number, protects: (tile: ScreenPoint) => boolean): ScreenPoint {
  const shortlist: Array<{ tile: ScreenPoint; rank: number }> = [];
  let crossing: ScreenPoint | null = null;
  let crossingRank = -Infinity;
  for (const tile of candidates) {
    // The monument's sightline outranks capacity: never crowd it, even here.
    if (!isGardenShipWater(tile, 0) || densityWeight(tile.x, tile.y, lighthouseTile) <= 0) continue;
    const nearest = Math.sqrt(index.nearestSq[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x]!);
    const inlet = gardenInletDistance(tile.x, tile.y);
    const outsideInlet = inlet > GARDEN_EMPTY_INLET.halfWidth;
    const apronClear = inlet > GARDEN_EMPTY_INLET.halfWidth + margin && isGardenShipWater(tile, margin);
    const gapClear = clearsPreferredGap(index, tile, margin);
    const preservesMean = nearest >= MIN_HULL_GAP && outsideInlet
      && preservesMeanNearest(placed, tile, nearest, nearestSum);
    // Legality first, then readable spacing: apron and inlet clearance, the
    // pairwise hull gap, the fleet mean, and only then a wider neighbour gap.
    const rank = (apronClear ? 1e6 : 0) + (gapClear ? 1e5 : 0) + (preservesMean ? 1e4 : 0)
      + (outsideInlet ? 1e3 : 0) + Math.min(nearest, 999);
    if (rank > crossingRank) { crossing = tile; crossingRank = rank; }
    let position = shortlist.length;
    while (position > 0 && shortlist[position - 1]!.rank < rank) position--;
    if (position >= FALLBACK_SHORTLIST) continue;
    shortlist.splice(position, 0, { tile, rank });
    if (shortlist.length > FALLBACK_SHORTLIST) shortlist.pop();
  }
  for (const entry of shortlist) {
    if (protects(entry.tile)) return entry.tile;
  }
  return crossing ?? { x: dataTile.x, y: dataTile.y };
}

/** Existing gate is fleet mean, not a 3.5-tile restriction on every pair.
 * Include reduced distances of old neighbours, not just the arrival's gap. */
function preservesMeanNearest(placed: readonly Placed[], tile: ScreenPoint, nearest: number, previousSum: number): boolean {
  if (placed.length <= 1) return nearest > MEAN_NEAREST_FLOOR_TILES;
  let slack = previousSum + nearest - MEAN_NEAREST_FLOOR_TILES * (placed.length + 1);
  if (slack <= 0) return false;
  for (const other of placed) {
    const dx = tile.x - other.tile.x; const dy = tile.y - other.tile.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < other.nearestSq) slack -= Math.sqrt(other.nearestSq) - Math.sqrt(distanceSq);
    if (slack <= 0) return false;
  }
  return true;
}

function nearestOf(index: HullIndex, tile: ScreenPoint): number {
  return Math.sqrt(index.nearestSq[tile.y * PHAROSVILLE_MAP_WIDTH + tile.x]!);
}

/** The projected proof the shortlist's analytic bound only approximates: no
 * protected interval is crossed and no leading identity sail is overrun. */
function protectsIntervals(
  ship: ShipNode, tile: ScreenPoint, heading: number, views: readonly GardenFleetRestView[],
  scratch: GardenFleetFootprint[], placed: readonly Placed[], leader: boolean,
): boolean {
  projectBerth(ship, tile, heading, scratch);
  for (let eye = 0; eye < views.length; eye++) {
    const footprint = scratch[eye]!;
    const view = views[eye]!;
    for (const [left, right] of view.intervals) for (const envelope of [footprint.hull, footprint.sails]) {
      if (envelope.maxY < 0 || envelope.minY > view.viewport.y) continue;
      if (Math.min(envelope.maxX, right * view.viewport.x) > Math.max(envelope.minX, left * view.viewport.x)) return false;
    }
    let ownLoss = 0;
    for (const other of placed) {
      const occupied = other.footprints[eye]!;
      if (!fleetEnvelopeOverlap(footprint, occupied, footprint)) continue;
      if (leader) ownLoss += sailLoss(footprint, occupied, footprint);
      if (other.leader && other.leaderLoss[eye]! + sailLoss(occupied, footprint, footprint) > 0.095) return false;
    }
    if (leader && ownLoss > 0.095) return false;
  }
  return true;
}

/** Bound every hull/cloth vertex in a world-space box once per arrival.
 * Perspective bounds conservatively reject interval crossings without running
 * the polygon projector during the unbounded clearance-only tile scan. */
function intervalGuard(ship: ShipNode): (tile: ScreenPoint, heading: number) => boolean {
  const family = GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull];
  const descriptor = GARDEN_FLEET_FAMILY_ENVELOPES[family];
  const reach = gardenShipHullReachWorld(1, family, null);
  let x = reach.x; let z = reach.z;
  let top = descriptor.hullHeight + 0.2;
  for (const sail of descriptor.sails) {
    const square = sail.kind === "square";
    const angle = square ? shipRestSailBraceRad(ship.id) : (sail.reverse ? -0.05 : 0.05);
    const c = Math.abs(Math.cos(angle)); const s = Math.abs(Math.sin(angle));
    const along = square ? sail.width / 2 : sail.width + 0.06;
    const thick = 0.24 + sail.width * (square ? 0.2 : 0.14) + (square ? 0 : 0.03);
    x = Math.max(x, Math.abs(sail.x) + c * (square ? thick : along) + s * (square ? along : thick));
    z = Math.max(z, Math.abs(sail.z) + s * (square ? thick : along) + c * (square ? along : thick));
    top = Math.max(top, sail.y + (sail.height + 0.5) / 2);
  }
  const scale = gardenShipVisualScale(ship.visual.scale);
  const form = ship.visual.hullForm;
  x *= scale * (form?.length ?? 1); z *= scale * (form?.beam ?? 1);
  const height = (top + 0.35) * scale * (form?.height ?? 1);
  const rootY = GARDEN_SHIP_ROOT_Y + (form?.waterline ?? 0) * scale;
  const centerY = rootY + (top - 0.35) * scale * (form?.height ?? 1) / 2;
  const cy = Math.cos(REST_SEAT_YAW_RAD); const sy = Math.sin(REST_SEAT_YAW_RAD);
  const cp = Math.cos(REST_SEAT_PITCH_RAD); const sp = Math.sin(REST_SEAT_PITCH_RAD);
  const fov = 1 / (2 * Math.tan(REST_SEAT_VFOV_DEG * Math.PI / 360));
  const views = gardenFleetRestViews();
  return (tile, heading) => {
    const c = Math.abs(Math.cos(heading)); const s = Math.abs(Math.sin(heading));
    const worldX = c * x + s * z; const worldZ = s * x + c * z;
    const horizontal = cy * worldX + sy * worldZ;
    const depthRadius = cp * (sy * worldX + cy * worldZ) + sp * height / 2;
    for (const view of views) {
      const aspect = view.viewport.x / view.viewport.y;
      const eye = restSeatEyeForAspect(aspect).world;
      const dx = tile.x * TILE_SCALE - eye.x; const dz = tile.y * TILE_SCALE - eye.z;
      const depth = -cp * (sy * dx + cy * dz) - sp * (centerY - eye.y);
      const near = depth - depthRadius; const far = depth + depthRadius;
      if (near <= 0) return false;
      const left = cy * dx - sy * dz - horizontal;
      const right = cy * dx - sy * dz + horizontal;
      const minX = 0.5 + left / (left < 0 ? near : far) * fov / aspect;
      const maxX = 0.5 + right / (right > 0 ? near : far) * fov / aspect;
      for (const [a, b] of view.intervals) if (minX < b && maxX > a) return false;
    }
    return true;
  };
}

/** Stable-ID pool hash; neighbouring IDs must not all choose the same lobe. */
function stableUnit(value: string): number {
  return stableFnv1aHash(value) / 0x100000000;
}

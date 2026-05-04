import { isWaterTileKind } from "./world-layout";
import { isSeawallBarrierTile, isSeawallBarrierTileXY } from "./seawall";
import { stableHash, stableOffset, stableUnit } from "./stable-random";
import { clamp, normalizeHeading, normalizeHeadingInto, pathKey, sameTile } from "./motion-utils";
import type { PharosVilleBaseMotionPlan, PharosVilleMotionPlan, ShipWaterPath, ShipWaterPathBuilder, ShipWaterRouteCache } from "./motion-types";
import type { PharosVilleMap, PharosVilleTile, ShipWaterZone } from "./world-types";

export function buildShipWaterRoute(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone?: ShipWaterZone;
  shipId?: string;
  bucket?: number;
}): ShipWaterPath {
  const from = nearestMapWaterTile(input.from, input.map);
  const to = nearestMapWaterTile(input.to, input.map);
  return buildShipWaterRouteFromWaterTiles({ from, to, map: input.map, zone: input.zone, shipId: input.shipId, bucket: input.bucket });
}

export function buildCachedShipWaterRoute(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone: ShipWaterZone;
  shipId: string;
  bucket: number;
}, cache: ShipWaterRouteCache): ShipWaterPath {
  const from = nearestMapWaterTile(input.from, input.map);
  const to = nearestMapWaterTile(input.to, input.map);
  const key = `${input.zone}:${input.shipId}:${input.bucket}:${pathKey(from, to)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const route = buildShipWaterRouteFromWaterTiles({ from, to, map: input.map, zone: input.zone, shipId: input.shipId, bucket: input.bucket });
  cache.set(key, route);
  return route;
}

export function nearestMapWaterTile(tile: { x: number; y: number }, map: PharosVilleMap): { x: number; y: number } {
  const rounded = {
    x: clamp(Math.round(tile.x), 0, map.width - 1),
    y: clamp(Math.round(tile.y), 0, map.height - 1),
  };
  if (isWaterTile(rounded.x, rounded.y, map)) return rounded;

  let bestTile: { x: number; y: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of map.tiles) {
    if (!isMotionWaterTile(candidate) || isSeawallBarrierTile(candidate)) continue;
    const distance = Math.abs(candidate.x - rounded.x) + Math.abs(candidate.y - rounded.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTile = { x: candidate.x, y: candidate.y };
    }
  }
  return bestTile ?? rounded;
}

export class LazyShipWaterPathMap extends Map<string, ShipWaterPath> {
  private readonly builders = new Map<string, ShipWaterPathBuilder>();

  override get size(): number {
    return this.builders.size;
  }

  setBuilder(key: string, builder: ShipWaterPathBuilder): void {
    this.builders.set(key, builder);
  }

  override get(key: string): ShipWaterPath | undefined {
    const cached = super.get(key);
    if (cached) return cached;

    const builder = this.builders.get(key);
    if (!builder) return undefined;

    const path = builder();
    super.set(key, path);
    return path;
  }

  override has(key: string): boolean {
    return this.builders.has(key);
  }
}

export function warmAllWaterPaths(plan: PharosVilleMotionPlan | PharosVilleBaseMotionPlan): void {
  for (const route of plan.shipRoutes.values()) {
    for (const stop of route.dockStops) {
      route.waterPaths.get(pathKey(stop.mooringTile, route.riskTile));
      route.waterPaths.get(pathKey(route.riskTile, stop.mooringTile));
    }
    if (!route.openWaterPatrol) continue;
    route.waterPaths.get(pathKey(route.openWaterPatrol.outbound.from, route.openWaterPatrol.outbound.to));
    route.waterPaths.get(pathKey(route.openWaterPatrol.inbound.from, route.openWaterPatrol.inbound.to));
  }
}

export function reverseWaterPath(path: ShipWaterPath): ShipWaterPath {
  return waterPathFromPoints(path.to, path.from, [...path.points].reverse());
}

export function sampleShipWaterPath(path: ShipWaterPath | undefined, progress: number): { point: { x: number; y: number }; heading: { x: number; y: number } } {
  const point = { x: 0, y: 0 };
  const heading = { x: 0, y: 0 };
  sampleShipWaterPathInto(path, progress, point, heading);
  return { point, heading };
}

// F10: Per-ship cache of the last `waterPathSegmentIndex` result. Path progress
// is monotonically increasing during normal animation, so the next frame's
// segment is almost always the same or the immediate successor. Using the cached
// hint converts the per-frame binary search (O(log N)) into a near-O(1) check
// with a short forward walk, falling back to binary search when the hint misses.
const waterSegmentHintByShipId = new Map<string, number>();

// Constant-bounded forward walk before falling back to binary search. Keeps the
// hint useful when progress steps over a couple of short segments per frame
// while bounding the worst-case linear scan when the hint is stale (e.g. after
// a path swap or a long pause).
const SEGMENT_HINT_FORWARD_WALK = 4;

// NOTE: callers always consume `heading` (lane offset application in
// transitSampleInto, then either ship-pose smoothing or forward-difference
// derivation). Adding a `headingOnly`/`skipHeading` parameter would dead-code
// in production, so the normalize stays unconditional. See Task #13 audit.
export function sampleShipWaterPathInto(
  path: ShipWaterPath | undefined,
  progress: number,
  point: { x: number; y: number },
  heading: { x: number; y: number },
  shipId?: string,
): void {
  if (!path || path.points.length === 0) {
    point.x = 0;
    point.y = 0;
    heading.x = 0;
    heading.y = 0;
    return;
  }
  if (path.points.length === 1 || path.totalLength <= 0) {
    const only = path.points[0]!;
    point.x = only.x;
    point.y = only.y;
    heading.x = 0;
    heading.y = 0;
    return;
  }

  const distance = clamp(progress, 0, 1) * path.totalLength;
  const hint = shipId !== undefined ? waterSegmentHintByShipId.get(shipId) : undefined;
  const index = waterPathSegmentIndex(path.cumulativeLengths, distance, hint);
  if (shipId !== undefined) waterSegmentHintByShipId.set(shipId, index);
  const segmentEnd = path.cumulativeLengths[index]!;
  const segmentStart = path.cumulativeLengths[index - 1]!;
  const previous = path.points[index - 1]!;
  const current = path.points[index]!;
  const segmentProgress = segmentEnd === segmentStart ? 0 : (distance - segmentStart) / (segmentEnd - segmentStart);
  point.x = previous.x + (current.x - previous.x) * segmentProgress;
  point.y = previous.y + (current.y - previous.y) * segmentProgress;
  normalizeHeadingInto(current.x - previous.x, current.y - previous.y, heading);
}

// Drop the cached segment-index hint for a ship. Pair with heading-memory
// resets so a path swap doesn't reuse a hint pointing at the old geometry.
export function clearShipWaterSegmentHint(shipId: string): void {
  waterSegmentHintByShipId.delete(shipId);
}

function waterPathSegmentIndex(cumulativeLengths: readonly number[], distance: number, hint?: number): number {
  const last = cumulativeLengths.length - 1;
  if (last < 1) return 1;

  // Hint fast path: the cached index is valid when the distance falls inside
  // [cumulative[hint-1], cumulative[hint]]. Test it first, then walk forward a
  // bounded number of segments before giving up to the binary search.
  if (hint !== undefined && hint >= 1 && hint <= last) {
    if (distance <= cumulativeLengths[hint]! && distance >= cumulativeLengths[hint - 1]!) {
      return hint;
    }
    if (distance > cumulativeLengths[hint]!) {
      const limit = Math.min(last, hint + SEGMENT_HINT_FORWARD_WALK);
      for (let i = hint + 1; i <= limit; i += 1) {
        if (distance <= cumulativeLengths[i]!) return i;
      }
    }
  }

  let low = 1;
  let high = last;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (distance > cumulativeLengths[mid]!) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function buildShipWaterRouteFromWaterTiles(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone?: ShipWaterZone;
  shipId?: string;
  bucket?: number;
}): ShipWaterPath {
  const { from, to } = input;
  if (sameTile(from, to)) return waterPathFromPoints(from, to, [from]);

  const detouredPoints = findDetouredWaterPath(from, to, input.map, input.zone, input.shipId, input.bucket);
  if (detouredPoints.length > 0) return waterPathFromPoints(from, to, chaikinSmoothPath(detouredPoints));

  const points = findWaterPath(from, to, input.map, input.zone);
  if (points.length > 0) return waterPathFromPoints(from, to, chaikinSmoothPath(points));

  const waypoint = fallbackWaterWaypoint(from, to, input.map);
  const firstLeg = findWaterPath(from, waypoint, input.map, input.zone);
  const secondLeg = findWaterPath(waypoint, to, input.map, input.zone);
  if (firstLeg.length > 0 && secondLeg.length > 0) {
    return waterPathFromPoints(from, to, chaikinSmoothPath([...firstLeg, ...secondLeg.slice(1)]));
  }

  return waterPathFromPoints(from, to, [from]);
}

// Open Chaikin (1 iteration), endpoints preserved. Each interior segment p_i→p_{i+1}
// emits Q_i = 0.75 p_i + 0.25 p_{i+1} and R_i = 0.25 p_i + 0.75 p_{i+1}, so an N-point
// input becomes a 2N-point output. N <= 2 passes through unchanged.
//
// Quadratic-Bezier corner blend (T1.4): for interior triplets where the turn is
// non-trivial (|cross|/(|d1|*|d2|) > 0.1, i.e. sin θ > ~5.7°), 4 additional interior
// Bezier samples are inserted between the two Chaikin points around the apex. The
// Bezier uses B0 = R_{k-1} (last Chaikin point of the incoming segment), B1 = p_k
// (apex), B2 = Q_k (first Chaikin point of the outgoing segment). Both B0 and B2 are
// still emitted by the standard Chaikin logic; the 4 samples fill the arc between them.
// Near-collinear legs fall through unchanged so straight runs are not subdivided.
const BEZIER_CORNER_THRESHOLD = 0.1; // sin θ threshold (~5.7°)
const BEZIER_SAMPLES = 4; // interior t values inserted per corner

export function chaikinSmoothPath(points: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const n = points.length;
  if (n <= 2) return points.map((point) => ({ x: point.x, y: point.y }));

  // Classify each interior apex as a corner that warrants Bezier blending.
  const isCorner = new Uint8Array(n);
  for (let i = 1; i < n - 1; i += 1) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const cross = Math.abs(d1x * d2y - d1y * d2x);
    const len1 = Math.hypot(d1x, d1y);
    const len2 = Math.hypot(d2x, d2y);
    if (len1 > 0 && len2 > 0 && cross / (len1 * len2) > BEZIER_CORNER_THRESHOLD) {
      isCorner[i] = 1;
    }
  }

  // Build output. For each segment i→i+1 we emit the standard Chaikin pair (Q_i, R_i).
  // When points[i+1] is a corner apex with a successor points[i+2], the arc between
  // R_i (=B0) and Q_{i+1} (=B2) is augmented with 4 interior Bezier samples. Those
  // samples are inserted immediately after R_i; Q_{i+1} is then emitted normally by
  // the next iteration, completing the arc without any skip logic.
  const result: Array<{ x: number; y: number }> = [];
  result.push({ x: points[0]!.x, y: points[0]!.y });

  for (let i = 0; i < n - 1; i += 1) {
    const cur = points[i]!;
    const next = points[i + 1]!;

    const qx = 0.75 * cur.x + 0.25 * next.x;
    const qy = 0.75 * cur.y + 0.25 * next.y;
    const rx = 0.25 * cur.x + 0.75 * next.x;
    const ry = 0.25 * cur.y + 0.75 * next.y;

    result.push({ x: qx, y: qy });

    if (isCorner[i + 1] && i + 1 < n - 1) {
      // Apex at next = points[i+1]. B0=(rx,ry), B1=next, B2=Q_{i+1}.
      const afterNext = points[i + 2]!;
      const b2x = 0.75 * next.x + 0.25 * afterNext.x;
      const b2y = 0.75 * next.y + 0.25 * afterNext.y;
      // Emit B0 first (standard R_i), then insert interior arc samples.
      result.push({ x: rx, y: ry });
      for (let s = 1; s <= BEZIER_SAMPLES; s += 1) {
        const t = s / (BEZIER_SAMPLES + 1);
        const u = 1 - t;
        result.push({
          x: u * u * rx + 2 * u * t * next.x + t * t * b2x,
          y: u * u * ry + 2 * u * t * next.y + t * t * b2y,
        });
      }
      // B2 (= Q_{i+1}) will be emitted as the Q of the next iteration.
    } else {
      result.push({ x: rx, y: ry });
    }
  }

  result.push({ x: points[n - 1]!.x, y: points[n - 1]!.y });
  return result;
}

function findDetouredWaterPath(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap, zone?: ShipWaterZone, shipId = "", bucket = 0): Array<{ x: number; y: number }> {
  const waypoints = detourWaterWaypoints(from, to, map, shipId, bucket);
  if (waypoints.length === 0) return [];
  return findWaterPathThroughPoints([from, ...waypoints, to], map, zone);
}

function findWaterPathThroughPoints(points: Array<{ x: number; y: number }>, map: PharosVilleMap, zone?: ShipWaterZone): Array<{ x: number; y: number }> {
  const route: Array<{ x: number; y: number }> = [];
  for (let index = 1; index < points.length; index += 1) {
    const leg = findWaterPath(points[index - 1]!, points[index]!, map, zone);
    if (leg.length === 0) return [];
    route.push(...(route.length === 0 ? leg : leg.slice(1)));
  }
  return route;
}

function detourWaterWaypoints(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap, shipId = "", bucket = 0): Array<{ x: number; y: number }> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 8) return [];

  const seed = stableHash(`${shipId}.${bucket}.${from.x}.${from.y}->${to.x}.${to.y}.wander`);
  const waypointCount = distance > 24 ? 2 : 1;
  const primarySign = seed % 2 === 0 ? 1 : -1;
  const perpendicular = { x: -dy / distance, y: dx / distance };
  const waypoints: Array<{ x: number; y: number }> = [];

  for (let index = 0; index < waypointCount; index += 1) {
    const ratioBase = waypointCount === 1 ? 0.5 : (index + 1) / (waypointCount + 1);
    const ratio = clamp(ratioBase + stableOffset(`${seed}.${index}.ratio`, 4) * 0.018, 0.2, 0.8);
    const sign = waypointCount === 1 ? primarySign : primarySign * (index % 2 === 0 ? 1 : -1);
    const detour = clamp(distance * (0.18 + (stableUnit(`${seed}.${index}.detour`) * 0.12)), 3, 9);
    const candidate = nearestMapWaterTile({
      x: from.x + dx * ratio + perpendicular.x * detour * sign,
      y: from.y + dy * ratio + perpendicular.y * detour * sign,
    }, map);

    if (sameTile(candidate, from) || sameTile(candidate, to)) continue;
    if (waypoints.some((waypoint) => sameTile(waypoint, candidate))) continue;
    waypoints.push(candidate);
  }

  return waypoints;
}

// Module-level reusable buffers for findWaterPath. Lazily resized when mapSize grows.
let pathDistances: Float64Array = new Float64Array(0);
let pathPrevious: Int32Array = new Int32Array(0);
let pathHeapIndices: Int32Array = new Int32Array(0);
let pathHeapPriorities: Float64Array = new Float64Array(0);
let pathHeapSize = 0;
const NEIGHBOR_DX = [1, 0, -1, 0, 1, 1, -1, -1] as const;
const NEIGHBOR_DY = [0, 1, 0, -1, 1, -1, 1, -1] as const;
// Octile heuristic scaled by min-step-cost so it stays admissible against the
// 0.72 cost floor in waterPathCost; Manhattan would overestimate.
const MIN_STEP_COST = 0.72;
const OCTILE_DIAGONAL = Math.SQRT2 - 1;

function ensurePathBuffers(mapSize: number): void {
  if (pathDistances.length < mapSize) {
    pathDistances = new Float64Array(mapSize);
    pathPrevious = new Int32Array(mapSize);
    // 8 neighbors per relaxation can push more stale entries than the 4-connected case.
    pathHeapIndices = new Int32Array(mapSize * 8);
    pathHeapPriorities = new Float64Array(mapSize * 8);
  }
}

function octileHeuristic(dx: number, dy: number): number {
  const adx = dx < 0 ? -dx : dx;
  const ady = dy < 0 ? -dy : dy;
  const max = adx > ady ? adx : ady;
  const min = adx > ady ? ady : adx;
  return MIN_STEP_COST * (max + OCTILE_DIAGONAL * min);
}

function heapPush(index: number, priority: number): void {
  let i = pathHeapSize;
  pathHeapSize += 1;
  pathHeapIndices[i] = index;
  pathHeapPriorities[i] = priority;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (pathHeapPriorities[parent]! <= pathHeapPriorities[i]!) break;
    const tmpIdx = pathHeapIndices[i]!;
    const tmpPri = pathHeapPriorities[i]!;
    pathHeapIndices[i] = pathHeapIndices[parent]!;
    pathHeapPriorities[i] = pathHeapPriorities[parent]!;
    pathHeapIndices[parent] = tmpIdx;
    pathHeapPriorities[parent] = tmpPri;
    i = parent;
  }
}

function heapPopIndex(): number {
  if (pathHeapSize === 0) return -1;
  const top = pathHeapIndices[0]!;
  pathHeapSize -= 1;
  if (pathHeapSize === 0) return top;
  pathHeapIndices[0] = pathHeapIndices[pathHeapSize]!;
  pathHeapPriorities[0] = pathHeapPriorities[pathHeapSize]!;
  let i = 0;
  for (;;) {
    const left = i * 2 + 1;
    const right = left + 1;
    let smallest = i;
    if (left < pathHeapSize && pathHeapPriorities[left]! < pathHeapPriorities[smallest]!) smallest = left;
    if (right < pathHeapSize && pathHeapPriorities[right]! < pathHeapPriorities[smallest]!) smallest = right;
    if (smallest === i) break;
    const tmpIdx = pathHeapIndices[i]!;
    const tmpPri = pathHeapPriorities[i]!;
    pathHeapIndices[i] = pathHeapIndices[smallest]!;
    pathHeapPriorities[i] = pathHeapPriorities[smallest]!;
    pathHeapIndices[smallest] = tmpIdx;
    pathHeapPriorities[smallest] = tmpPri;
    i = smallest;
  }
  return top;
}

function findWaterPath(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap, zone?: ShipWaterZone): Array<{ x: number; y: number }> {
  const startIndex = tileIndex(from.x, from.y, map);
  const endIndex = tileIndex(to.x, to.y, map);
  if (startIndex < 0 || endIndex < 0) return [];

  const mapSize = map.width * map.height;
  ensurePathBuffers(mapSize);
  const distances = pathDistances;
  const previous = pathPrevious;
  for (let i = 0; i < mapSize; i += 1) {
    distances[i] = Number.POSITIVE_INFINITY;
    previous[i] = -1;
  }
  pathHeapSize = 0;
  const shoreMask = ensureShoreDistanceMask(map);


  distances[startIndex] = 0;
  heapPush(startIndex, octileHeuristic(from.x - to.x, from.y - to.y));

  while (pathHeapSize > 0) {
    const poppedPriority = pathHeapPriorities[0]!;
    const currentIndex = heapPopIndex();
    const currentX = currentIndex % map.width;
    const currentY = (currentIndex - currentX) / map.width;
    const expectedPriority = distances[currentIndex]! + octileHeuristic(currentX - to.x, currentY - to.y);
    // Stale entries: when a node was relaxed, we pushed a new entry without removing the old one.
    if (poppedPriority !== expectedPriority) continue;

    if (currentIndex === endIndex) return reconstructPath(previous, endIndex, map);

    for (let n = 0; n < 8; n += 1) {
      const dx = NEIGHBOR_DX[n]!;
      const dy = NEIGHBOR_DY[n]!;
      const nx = currentX + dx;
      const ny = currentY + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const neighborIndex = ny * map.width + nx;
      const tile = map.tiles[neighborIndex];
      if (!tile || isSeawallBarrierTileXY(nx, ny) || !isMotionWaterTile(tile)) continue;
      if (dx !== 0 && dy !== 0) {
        // Reject corner-cuts: a diagonal must have BOTH cardinal neighbors open
        // so the path can't clip through a coast corner or seawall gap.
        const cornerAX = currentX + dx;
        const cornerAY = currentY;
        const cornerBX = currentX;
        const cornerBY = currentY + dy;
        const cornerATile = map.tiles[cornerAY * map.width + cornerAX];
        const cornerBTile = map.tiles[cornerBY * map.width + cornerBX];
        if (!cornerATile || !isMotionWaterTile(cornerATile) || isSeawallBarrierTileXY(cornerAX, cornerAY)) continue;
        if (!cornerBTile || !isMotionWaterTile(cornerBTile) || isSeawallBarrierTileXY(cornerBX, cornerBY)) continue;
      }
      const stepCost = waterPathCost(tile, zone);
      // Graded shore bias: nudge routes 1-2 tiles offshore where viable. Additive
      // on top of zone cost so the octile heuristic stays admissible.
      const shoreD = shoreMask[neighborIndex]!;
      const shorePenalty = shoreD < 1.5 ? 0.08 : shoreD < 2.5 ? 0.03 : 0;
      const cost = (dx !== 0 && dy !== 0 ? (stepCost + shorePenalty) * Math.SQRT2 : stepCost + shorePenalty);
      const nextDistance = distances[currentIndex]! + cost;
      if (nextDistance >= distances[neighborIndex]!) continue;
      previous[neighborIndex] = currentIndex;
      distances[neighborIndex] = nextDistance;
      heapPush(neighborIndex, nextDistance + octileHeuristic(nx - to.x, ny - to.y));
    }
  }

  return [];
}

const shoreDistanceMaskByMap = new WeakMap<PharosVilleMap, Float32Array>();

// Euclidean distance (in tiles) from each tile to the nearest non-water or seawall
// tile. Computed once per map via a 4-connected multi-source BFS seeded from every
// land/seawall tile (and the implicit land border outside the map).
export function ensureShoreDistanceMask(map: PharosVilleMap): Float32Array {
  const cached = shoreDistanceMaskByMap.get(map);
  if (cached) return cached;

  const width = map.width;
  const height = map.height;
  const size = width * height;
  const mask = new Float32Array(size);
  const queue: number[] = [];
  for (let index = 0; index < size; index += 1) {
    const tile = map.tiles[index];
    const isLand = !tile || !isMotionWaterTile(tile) || isSeawallBarrierTile({ x: index % width, y: Math.floor(index / width) });
    if (isLand) {
      mask[index] = 0;
      queue.push(index);
    } else {
      mask[index] = Number.POSITIVE_INFINITY;
    }
  }

  let head = 0;
  while (head < queue.length) {
    const index = queue[head]!;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const baseDistance = mask[index]!;
    const neighbours = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
    for (const neighbour of neighbours) {
      if (neighbour.x < 0 || neighbour.y < 0 || neighbour.x >= width || neighbour.y >= height) continue;
      const neighbourIndex = neighbour.y * width + neighbour.x;
      const candidate = baseDistance + 1;
      if (candidate < mask[neighbourIndex]!) {
        mask[neighbourIndex] = candidate;
        queue.push(neighbourIndex);
      }
    }
  }

  // Treat the implicit border outside the map as land so edge water tiles read 1.
  for (let x = 0; x < width; x += 1) {
    const top = x;
    const bottom = (height - 1) * width + x;
    if (mask[top]! > 1) mask[top] = 1;
    if (mask[bottom]! > 1) mask[bottom] = 1;
  }
  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = y * width + (width - 1);
    if (mask[left]! > 1) mask[left] = 1;
    if (mask[right]! > 1) mask[right] = 1;
  }

  shoreDistanceMaskByMap.set(map, mask);
  return mask;
}

export function shoreDistance(x: number, y: number, map: PharosVilleMap, mask: Float32Array): number {
  const index = tileIndex(x, y, map);
  if (index < 0) return 0;
  return mask[index]!;
}

function reconstructPath(previous: ArrayLike<number>, endIndex: number, map: PharosVilleMap): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let current = endIndex;
  while (current >= 0) {
    points.push(indexToTile(current, map));
    current = previous[current] ?? -1;
  }
  return points.reverse();
}

function waterNeighbors(tile: { x: number; y: number }, map: PharosVilleMap): Array<{ x: number; y: number }> {
  return [
    { x: tile.x + 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x - 1, y: tile.y },
    { x: tile.x, y: tile.y - 1 },
  ].filter((candidate) => isWaterTile(candidate.x, candidate.y, map));
}

function waterPathCost(tile: PharosVilleTile | undefined, zone: ShipWaterZone | undefined): number {
  if (!tile) return Number.POSITIVE_INFINITY;
  const terrain = tile.terrain ?? tile.kind;
  const deepPenalty = terrain === "deep-water" || tile.kind === "deep-water" ? 0.16 : 0;
  if (!zone) return 1 + deepPenalty;

  const zonePenalty = waterZoneTerrainPenalty(zone, terrain);
  return Math.max(0.72, 1 + deepPenalty + zonePenalty);
}

function waterZoneTerrainPenalty(zone: ShipWaterZone, terrain: string): number {
  switch (zone) {
    case "calm":
      if (terrain === "calm-water" || terrain === "harbor-water" || terrain === "water") return 0;
      if (terrain === "watch-water" || terrain === "ledger-water") return 0.12;
      if (terrain === "alert-water") return 0.22;
      if (terrain === "warning-water" || terrain === "storm-water") return 0.72;
      return 0.18;
    case "ledger":
      if (terrain === "ledger-water") return -0.08;
      if (terrain === "calm-water" || terrain === "harbor-water" || terrain === "water") return 0.08;
      if (terrain === "watch-water" || terrain === "alert-water") return 0.2;
      if (terrain === "warning-water" || terrain === "storm-water") return 1.4;
      return 0.18;
    case "watch":
      if (terrain === "watch-water" || terrain === "calm-water" || terrain === "harbor-water" || terrain === "water") return 0;
      if (terrain === "alert-water") return 0.08;
      if (terrain === "warning-water") return 0.24;
      if (terrain === "storm-water") return 0.42;
      return 0.16;
    case "alert":
      if (terrain === "alert-water" || terrain === "watch-water" || terrain === "warning-water") return 0;
      if (terrain === "calm-water" || terrain === "harbor-water" || terrain === "water") return 0.12;
      if (terrain === "storm-water") return 0.22;
      return 0.14;
    case "warning":
      if (terrain === "warning-water" || terrain === "storm-water" || terrain === "alert-water") return 0;
      if (terrain === "watch-water") return 0.12;
      if (terrain === "calm-water" || terrain === "harbor-water" || terrain === "water") return 0.32;
      return 0.16;
    case "danger":
      if (terrain === "storm-water" || terrain === "warning-water") return 0;
      if (terrain === "alert-water") return 0.12;
      if (terrain === "watch-water") return 0.24;
      if (terrain === "calm-water" || terrain === "harbor-water" || terrain === "water") return 0.44;
      return 0.16;
  }
}

function fallbackWaterWaypoint(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap): { x: number; y: number } {
  const seed = stableHash(`${from.x}.${from.y}->${to.x}.${to.y}`);
  const edgeTiles = map.tiles
    .filter((tile) => (
      isMotionWaterTile(tile)
      && !isSeawallBarrierTile(tile)
      && (tile.x === 0 || tile.y === 0 || tile.x === map.width - 1 || tile.y === map.height - 1)
    ))
    .sort((a, b) => {
      const aScore = Math.abs(a.x - from.x) + Math.abs(a.y - from.y) + Math.abs(a.x - to.x) + Math.abs(a.y - to.y);
      const bScore = Math.abs(b.x - from.x) + Math.abs(b.y - from.y) + Math.abs(b.x - to.x) + Math.abs(b.y - to.y);
      return aScore - bScore || ((a.x * 131 + a.y + seed) % 17) - ((b.x * 131 + b.y + seed) % 17);
    });
  const waypoint = edgeTiles[0] ?? map.tiles.find((tile) => isMotionWaterTile(tile) && !isSeawallBarrierTile(tile));
  return waypoint ? { x: waypoint.x, y: waypoint.y } : from;
}

export function waterPathFromPoints(from: { x: number; y: number }, to: { x: number; y: number }, points: Array<{ x: number; y: number }>): ShipWaterPath {
  const cumulativeLengths = [0];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulativeLengths.push(totalLength);
  }
  return {
    from,
    to,
    points,
    cumulativeLengths,
    totalLength,
  };
}

function isWaterTile(x: number, y: number, map: PharosVilleMap): boolean {
  const index = tileIndex(x, y, map);
  if (index < 0) return false;
  const tile = map.tiles[index];
  return !!tile && !isSeawallBarrierTile({ x, y }) && isMotionWaterTile(tile);
}

function isMotionWaterTile(tile: Pick<PharosVilleTile, "kind" | "terrain">): boolean {
  return isWaterTileKind(tile.terrain ?? tile.kind);
}

function tileIndex(x: number, y: number, map: PharosVilleMap): number {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return -1;
  return y * map.width + x;
}

function indexToTile(index: number, map: PharosVilleMap): { x: number; y: number } {
  return {
    x: index % map.width,
    y: Math.floor(index / map.width),
  };
}

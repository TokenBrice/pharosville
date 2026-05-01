import { isWaterTileKind } from "./world-layout";
import { isSeawallBarrierTile } from "./seawall";
import { stableHash, stableOffset, stableUnit } from "./stable-random";
import { clamp, normalizeHeading, pathKey, sameTile } from "./motion-utils";
import type { PharosVilleBaseMotionPlan, PharosVilleMotionPlan, ShipWaterPath, ShipWaterPathBuilder, ShipWaterRouteCache } from "./motion-types";
import type { PharosVilleMap, PharosVilleTile, ShipWaterZone } from "./world-types";

export function buildShipWaterRoute(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone?: ShipWaterZone;
}): ShipWaterPath {
  const from = nearestMapWaterTile(input.from, input.map);
  const to = nearestMapWaterTile(input.to, input.map);
  return buildShipWaterRouteFromWaterTiles({ from, to, map: input.map, zone: input.zone });
}

export function buildCachedShipWaterRoute(input: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  map: PharosVilleMap;
  zone: ShipWaterZone;
}, cache: ShipWaterRouteCache): ShipWaterPath {
  const from = nearestMapWaterTile(input.from, input.map);
  const to = nearestMapWaterTile(input.to, input.map);
  const key = `${input.zone}:${pathKey(from, to)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const route = buildShipWaterRouteFromWaterTiles({ from, to, map: input.map, zone: input.zone });
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
  }
}

export function reverseWaterPath(path: ShipWaterPath): ShipWaterPath {
  return waterPathFromPoints(path.to, path.from, [...path.points].reverse());
}

export function sampleShipWaterPath(path: ShipWaterPath | undefined, progress: number): { point: { x: number; y: number }; heading: { x: number; y: number } } {
  if (!path || path.points.length === 0) return { point: { x: 0, y: 0 }, heading: { x: 0, y: 0 } };
  if (path.points.length === 1 || path.totalLength <= 0) return { point: path.points[0]!, heading: { x: 0, y: 0 } };

  const distance = clamp(progress, 0, 1) * path.totalLength;
  const index = waterPathSegmentIndex(path.cumulativeLengths, distance);
  const segmentEnd = path.cumulativeLengths[index]!;
  const segmentStart = path.cumulativeLengths[index - 1]!;
  const previous = path.points[index - 1]!;
  const current = path.points[index]!;
  const segmentProgress = segmentEnd === segmentStart ? 0 : (distance - segmentStart) / (segmentEnd - segmentStart);
  return {
    point: {
      x: previous.x + (current.x - previous.x) * segmentProgress,
      y: previous.y + (current.y - previous.y) * segmentProgress,
    },
    heading: normalizeHeading({ x: current.x - previous.x, y: current.y - previous.y }),
  };
}

function waterPathSegmentIndex(cumulativeLengths: readonly number[], distance: number): number {
  let low = 1;
  let high = cumulativeLengths.length - 1;
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
}): ShipWaterPath {
  const { from, to } = input;
  if (sameTile(from, to)) return waterPathFromPoints(from, to, [from]);

  const detouredPoints = findDetouredWaterPath(from, to, input.map, input.zone);
  if (detouredPoints.length > 0) return waterPathFromPoints(from, to, detouredPoints);

  const points = findWaterPath(from, to, input.map, input.zone);
  if (points.length > 0) return waterPathFromPoints(from, to, points);

  const waypoint = fallbackWaterWaypoint(from, to, input.map);
  const firstLeg = findWaterPath(from, waypoint, input.map, input.zone);
  const secondLeg = findWaterPath(waypoint, to, input.map, input.zone);
  if (firstLeg.length > 0 && secondLeg.length > 0) {
    return waterPathFromPoints(from, to, [...firstLeg, ...secondLeg.slice(1)]);
  }

  return waterPathFromPoints(from, to, [from]);
}

function findDetouredWaterPath(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap, zone?: ShipWaterZone): Array<{ x: number; y: number }> {
  const waypoints = detourWaterWaypoints(from, to, map);
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

function detourWaterWaypoints(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap): Array<{ x: number; y: number }> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 8) return [];

  const seed = stableHash(`${from.x}.${from.y}->${to.x}.${to.y}.wander`);
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

function findWaterPath(from: { x: number; y: number }, to: { x: number; y: number }, map: PharosVilleMap, zone?: ShipWaterZone): Array<{ x: number; y: number }> {
  const startIndex = tileIndex(from.x, from.y, map);
  const endIndex = tileIndex(to.x, to.y, map);
  if (startIndex < 0 || endIndex < 0) return [];

  const distances = new Array(map.width * map.height).fill(Number.POSITIVE_INFINITY);
  const previous = new Array<number>(map.width * map.height).fill(-1);
  const open = [startIndex];
  distances[startIndex] = 0;

  while (open.length > 0) {
    let bestOpenIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < open.length; index += 1) {
      const currentIndex = open[index]!;
      const current = indexToTile(currentIndex, map);
      const score = distances[currentIndex]! + Math.abs(current.x - to.x) + Math.abs(current.y - to.y);
      if (score < bestScore) {
        bestScore = score;
        bestOpenIndex = index;
      }
    }

    const [currentIndex] = open.splice(bestOpenIndex, 1);
    if (currentIndex === endIndex) return reconstructPath(previous, endIndex, map);

    const current = indexToTile(currentIndex!, map);
    for (const neighbor of waterNeighbors(current, map)) {
      const neighborIndex = tileIndex(neighbor.x, neighbor.y, map);
      const tile = map.tiles[neighborIndex];
      const cost = waterPathCost(tile, zone);
      const nextDistance = distances[currentIndex!]! + cost;
      if (nextDistance >= distances[neighborIndex]!) continue;
      previous[neighborIndex] = currentIndex!;
      distances[neighborIndex] = nextDistance;
      if (!open.includes(neighborIndex)) open.push(neighborIndex);
    }
  }

  return [];
}

function reconstructPath(previous: readonly number[], endIndex: number, map: PharosVilleMap): Array<{ x: number; y: number }> {
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

function waterPathFromPoints(from: { x: number; y: number }, to: { x: number; y: number }, points: Array<{ x: number; y: number }>): ShipWaterPath {
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

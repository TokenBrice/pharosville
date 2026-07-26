import type { ScreenPoint } from "../systems/projection";

export interface HitTarget {
  anchor?: ScreenPoint;
  detailId: string;
  id: string;
  kind: string;
  label: string;
  priority: number;
  rect: { height: number; width: number; x: number; y: number };
}

export interface HitTargetPriorityContext {
  hoveredDetailId?: string | null;
  selectedDetailId?: string | null;
}

export interface HitTargetSnapshot {
  spatialIndex: HitTargetSpatialIndex;
  targets: HitTarget[];
  targetsByDetailId: Map<string, HitTarget>;
}

export interface HitTargetSpatialIndex {
  cellSize: number;
  cells: ReadonlyMap<number, readonly string[]>;
  targetById: ReadonlyMap<string, HitTarget>;
  targetCellKeys: ReadonlyMap<string, readonly number[]>;
  targets: readonly HitTarget[];
}

const HIT_TARGET_SPATIAL_CELL_SIZE = 96;
const SPATIAL_CELL_KEY_OFFSET = 32_768;
const SPATIAL_CELL_KEY_STRIDE = 65_536;

export function buildHitTargetSpatialIndex(
  targets: readonly HitTarget[],
  cellSize = HIT_TARGET_SPATIAL_CELL_SIZE,
): HitTargetSpatialIndex {
  const resolvedCellSize = Math.max(24, Math.floor(cellSize));
  const cells = new Map<number, string[]>();
  const targetById = new Map<string, HitTarget>();
  const targetCellKeys = new Map<string, readonly number[]>();

  for (const target of targets) {
    targetById.set(target.id, target);
    const keys = spatialCellKeysForTarget(target.rect, resolvedCellSize);
    targetCellKeys.set(target.id, keys);
    for (const key of keys) {
      const existing = cells.get(key);
      if (existing) existing.push(target.id);
      else cells.set(key, [target.id]);
    }
  }

  return {
    cellSize: resolvedCellSize,
    cells,
    targetById,
    targetCellKeys,
    targets,
  };
}

export function hitTargetSnapshotFromTargets(
  targets: readonly HitTarget[],
): HitTargetSnapshot {
  const resolvedTargets = [...targets];
  return {
    spatialIndex: buildHitTargetSpatialIndex(resolvedTargets),
    targets: resolvedTargets,
    targetsByDetailId: new Map(
      resolvedTargets.map((target) => [target.detailId, target]),
    ),
  };
}

export function hitTestSpatial(
  index: HitTargetSpatialIndex | null,
  point: ScreenPoint,
  context?: HitTargetPriorityContext,
): HitTarget | null {
  if (!index) return null;
  const cellX = Math.floor(point.x / index.cellSize);
  const cellY = Math.floor(point.y / index.cellSize);
  const candidateIds = index.cells.get(encodeSpatialCellKey(cellX, cellY));
  if (!candidateIds) return null;

  let bestTarget: HitTarget | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const targetId of candidateIds) {
    const target = index.targetById.get(targetId);
    if (!target || !containsPoint(target, point)) continue;
    const priority = effectiveTargetPriority(target, context);
    if (!bestTarget || priority > bestPriority) {
      bestTarget = target;
      bestPriority = priority;
    }
  }
  return bestTarget;
}

export function hitTest(
  targets: readonly HitTarget[],
  point: ScreenPoint,
  context?: HitTargetPriorityContext,
): HitTarget | null {
  let bestTarget: HitTarget | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const target of targets) {
    if (!containsPoint(target, point)) continue;
    const priority = effectiveTargetPriority(target, context);
    if (!bestTarget || priority > bestPriority) {
      bestTarget = target;
      bestPriority = priority;
    }
  }
  return bestTarget;
}

function spatialCellKeysForTarget(
  rect: HitTarget["rect"],
  cellSize: number,
): readonly number[] {
  const keys: number[] = [];
  const minCellX = Math.floor(rect.x / cellSize);
  const maxCellX = Math.floor((rect.x + rect.width) / cellSize);
  const minCellY = Math.floor(rect.y / cellSize);
  const maxCellY = Math.floor((rect.y + rect.height) / cellSize);
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      keys.push(encodeSpatialCellKey(cellX, cellY));
    }
  }
  return keys;
}

function encodeSpatialCellKey(cellX: number, cellY: number): number {
  return (cellY + SPATIAL_CELL_KEY_OFFSET) * SPATIAL_CELL_KEY_STRIDE
    + cellX
    + SPATIAL_CELL_KEY_OFFSET;
}

function containsPoint(target: HitTarget, point: ScreenPoint): boolean {
  return (
    point.x >= target.rect.x
    && point.x <= target.rect.x + target.rect.width
    && point.y >= target.rect.y
    && point.y <= target.rect.y + target.rect.height
  );
}

function effectiveTargetPriority(
  target: HitTarget,
  context?: HitTargetPriorityContext,
): number {
  let priority = target.priority;
  if (target.kind === "area") priority += 10_000;
  if (target.detailId === context?.selectedDetailId) priority += 2;
  if (target.detailId === context?.hoveredDetailId) priority += 1;
  return priority;
}

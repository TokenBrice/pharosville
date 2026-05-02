import type { IsoCamera, ScreenPoint } from "../systems/projection";
import { isShipMapVisible, type ShipMotionSample } from "../systems/motion";
import type { PharosVilleWorld } from "../systems/world-types";
import type { PharosVilleAssetManager } from "./asset-manager";
import {
  entityAssetId,
  resolveEntityGeometry,
  type WorldSelectableEntity,
} from "./geometry";

export interface HitTarget {
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
  recordsById: Map<string, HitTargetRecord>;
  targetsByDetailId: Map<string, HitTarget>;
  spatialIndex: HitTargetSpatialIndex;
  targets: HitTarget[];
}

export interface HitTargetSpatialIndex {
  cellSize: number;
  cells: ReadonlyMap<string, readonly number[]>;
  targets: readonly HitTarget[];
}

interface HitTargetViewport {
  height: number;
  width: number;
}

interface HitTargetRecord {
  entity: WorldSelectableEntity;
  geometry: {
    depth: number;
    targetRect: HitTarget["rect"];
  };
  sortIndex: number;
}

const shipSortIndexByWorld = new WeakMap<PharosVilleWorld, Map<string, number>>();

const HIT_TARGET_SPATIAL_CELL_SIZE = 96;

function targetPriorityBoost(target: Pick<HitTarget, "detailId" | "kind">, selectedDetailId: string | null, hoveredDetailId: string | null): number {
  let priority = 0;
  if (target.kind === "area") priority += 10_000;
  if (target.detailId === selectedDetailId) priority += 2;
  if (target.detailId === hoveredDetailId) priority += 1;
  return priority;
}

function visualPriorityForHitTarget(entity: WorldSelectableEntity, priority: number): number {
  // Ethereum's hub body is drawn before the sorted entity pass so ships sail over it.
  // Keep the dock selectable, but do not let its large hub hitbox outrank ships.
  if (entity.kind === "dock" && entity.chainId === "ethereum") return -1;
  return priority;
}

export function createHitTargetSnapshot(input: {
  assets?: Pick<PharosVilleAssetManager, "get"> | null;
  camera: IsoCamera;
  hoveredDetailId?: string | null;
  selectedDetailId?: string | null;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  viewport?: HitTargetViewport | null;
  world: PharosVilleWorld;
}): HitTargetSnapshot {
  const recordsById = new Map<string, HitTargetRecord>();
  const entities: WorldSelectableEntity[] = [
    input.world.lighthouse,
    ...input.world.docks,
    ...input.world.ships.filter((ship) => isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id))),
    ...input.world.areas,
    ...input.world.graves,
  ];

  for (let sortIndex = 0; sortIndex < entities.length; sortIndex += 1) {
    const entity = entities[sortIndex]!;
    const assetId = entityAssetId(entity);
    const asset = assetId ? input.assets?.get(assetId) ?? null : null;
    const resolved = resolveEntityGeometry({
      asset,
      camera: input.camera,
      entity,
      mapWidth: input.world.map.width,
      shipMotionSamples: input.shipMotionSamples,
    });
    if (!shouldKeepHitTargetCandidate({
      entity,
      geometry: resolved,
      hoveredDetailId: input.hoveredDetailId ?? null,
      selectedDetailId: input.selectedDetailId ?? null,
      viewport: input.viewport ?? null,
    })) {
      continue;
    }
    recordsById.set(entity.id, {
      entity,
      geometry: {
        depth: resolved.depth,
        targetRect: resolved.targetRect,
      },
      sortIndex,
    });
  }

  return snapshotFromRecords(recordsById, {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  });
}

export function updateHitTargetSnapshotShips(input: {
  assets?: Pick<PharosVilleAssetManager, "get"> | null;
  camera: IsoCamera;
  changedShipIds: readonly string[];
  hoveredDetailId?: string | null;
  selectedDetailId?: string | null;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  snapshot: HitTargetSnapshot;
  viewport?: HitTargetViewport | null;
  world: PharosVilleWorld;
  worldShipsById: ReadonlyMap<string, PharosVilleWorld["ships"][number]>;
}): HitTargetSnapshot {
  if (input.changedShipIds.length === 0) return input.snapshot;
  const recordsById = new Map(input.snapshot.recordsById);
  for (const shipId of input.changedShipIds) {
    recordsById.delete(shipId);
    const ship = input.worldShipsById.get(shipId);
    if (!ship) continue;
    if (!isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id))) continue;
    const assetId = entityAssetId(ship);
    const asset = assetId ? input.assets?.get(assetId) ?? null : null;
    const resolved = resolveEntityGeometry({
      asset,
      camera: input.camera,
      entity: ship,
      mapWidth: input.world.map.width,
      shipMotionSamples: input.shipMotionSamples,
    });
    if (!shouldKeepHitTargetCandidate({
      entity: ship,
      geometry: resolved,
      hoveredDetailId: input.hoveredDetailId ?? null,
      selectedDetailId: input.selectedDetailId ?? null,
      viewport: input.viewport ?? null,
    })) {
      continue;
    }
    const previous = input.snapshot.recordsById.get(shipId);
    recordsById.set(shipId, {
      entity: ship,
      geometry: {
        depth: resolved.depth,
        targetRect: resolved.targetRect,
      },
      sortIndex: previous?.sortIndex ?? shipSortIndex(input.world, shipId),
    });
  }

  return snapshotFromRecords(recordsById, {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  });
}

export function collectHitTargets(input: {
  assets?: Pick<PharosVilleAssetManager, "get"> | null;
  camera: IsoCamera;
  hoveredDetailId?: string | null;
  selectedDetailId?: string | null;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  viewport?: HitTargetViewport | null;
  world: PharosVilleWorld;
}): HitTarget[] {
  const snapshot = createHitTargetSnapshot(input);
  const hoveredDetailId = input.hoveredDetailId ?? null;
  const selectedDetailId = input.selectedDetailId ?? null;
  return snapshot.targets.map((target) => ({
    ...target,
    priority: target.priority + targetPriorityBoost(target, selectedDetailId, hoveredDetailId),
  }));
}

export function buildHitTargetSpatialIndex(targets: readonly HitTarget[], cellSize = HIT_TARGET_SPATIAL_CELL_SIZE): HitTargetSpatialIndex {
  const resolvedCellSize = Math.max(24, Math.floor(cellSize));
  const cells = new Map<string, number[]>();
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    const minCellX = Math.floor(target.rect.x / resolvedCellSize);
    const maxCellX = Math.floor((target.rect.x + target.rect.width) / resolvedCellSize);
    const minCellY = Math.floor(target.rect.y / resolvedCellSize);
    const maxCellY = Math.floor((target.rect.y + target.rect.height) / resolvedCellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${cellX}:${cellY}`;
        const existing = cells.get(key);
        if (existing) {
          existing.push(index);
        } else {
          cells.set(key, [index]);
        }
      }
    }
  }
  return { cellSize: resolvedCellSize, cells, targets };
}

export function hitTestSpatial(index: HitTargetSpatialIndex | null, point: ScreenPoint, context?: HitTargetPriorityContext): HitTarget | null {
  if (!index) return null;
  const cellX = Math.floor(point.x / index.cellSize);
  const cellY = Math.floor(point.y / index.cellSize);
  const candidateIndices = index.cells.get(`${cellX}:${cellY}`);
  if (!candidateIndices || candidateIndices.length === 0) return null;
  let bestTarget: HitTarget | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const candidateIndex of candidateIndices) {
    const target = index.targets[candidateIndex];
    if (!target) continue;
    if (!containsPoint(target, point)) continue;
    const priority = effectiveTargetPriority(target, context);
    if (!bestTarget || priority > bestPriority) {
      bestTarget = target;
      bestPriority = priority;
    }
  }
  return bestTarget;
}

export function hitTest(targets: readonly HitTarget[], point: ScreenPoint, context?: HitTargetPriorityContext): HitTarget | null {
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

function snapshotFromRecords(
  recordsById: Map<string, HitTargetRecord>,
  _context: Required<HitTargetPriorityContext>,
): HitTargetSnapshot {
  const sortedRecords = [...recordsById.values()].sort((left, right) => (
    left.geometry.depth - right.geometry.depth
    || (left.entity.kind < right.entity.kind ? -1 : left.entity.kind > right.entity.kind ? 1 : 0)
    || left.sortIndex - right.sortIndex
  ));
  const targets = sortedRecords.map((record, visualIndex) => {
    const basePriority = visualPriorityForHitTarget(record.entity, visualIndex) * 10;
    return {
      detailId: record.entity.detailId,
      id: record.entity.id,
      kind: record.entity.kind,
      label: record.entity.label,
      priority: basePriority,
      rect: record.geometry.targetRect,
    };
  });
  const targetsByDetailId = new Map<string, HitTarget>();
  for (const target of targets) {
    targetsByDetailId.set(target.detailId, target);
  }
  return {
    recordsById,
    targetsByDetailId,
    spatialIndex: buildHitTargetSpatialIndex(targets),
    targets,
  };
}

function shouldKeepHitTargetCandidate(input: {
  entity: WorldSelectableEntity;
  geometry: { targetRect: HitTarget["rect"] };
  hoveredDetailId: string | null;
  selectedDetailId: string | null;
  viewport: HitTargetViewport | null;
}): boolean {
  if (!input.viewport) return true;
  if (input.entity.kind === "area") return true;
  if (input.entity.detailId === input.selectedDetailId || input.entity.detailId === input.hoveredDetailId) return true;
  return rectIntersectsViewport(input.geometry.targetRect, input.viewport, 48);
}

function rectIntersectsViewport(rect: HitTarget["rect"], viewport: HitTargetViewport, margin: number): boolean {
  return (
    rect.x + rect.width >= -margin
    && rect.x <= viewport.width + margin
    && rect.y + rect.height >= -margin
    && rect.y <= viewport.height + margin
  );
}

function shipSortIndex(world: PharosVilleWorld, shipId: string): number {
  const lighthouseCount = 1;
  const dockCount = world.docks.length;
  let indexById = shipSortIndexByWorld.get(world);
  if (!indexById) {
    indexById = new Map<string, number>();
    for (let shipIndex = 0; shipIndex < world.ships.length; shipIndex += 1) {
      indexById.set(world.ships[shipIndex]!.id, shipIndex);
    }
    shipSortIndexByWorld.set(world, indexById);
  }
  const shipIndex = indexById.get(shipId) ?? -1;
  if (shipIndex < 0) return lighthouseCount + dockCount;
  return lighthouseCount + dockCount + shipIndex;
}

function containsPoint(target: HitTarget, point: ScreenPoint): boolean {
  return (
    point.x >= target.rect.x
    && point.x <= target.rect.x + target.rect.width
    && point.y >= target.rect.y
    && point.y <= target.rect.y + target.rect.height
  );
}

function effectiveTargetPriority(target: HitTarget, context?: HitTargetPriorityContext) {
  if (!context) return target.priority;
  return target.priority + targetPriorityBoost(target, context.selectedDetailId ?? null, context.hoveredDetailId ?? null);
}

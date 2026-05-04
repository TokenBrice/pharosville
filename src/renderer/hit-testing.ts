import { tileToScreen, type IsoCamera, type ScreenPoint } from "../systems/projection";
import { isShipMapVisible, type ShipMotionSample } from "../systems/motion";
import type { PharosVilleWorld } from "../systems/world-types";
import type { LoadedPharosVilleAsset, PharosVilleAssetManager } from "./asset-manager";
import {
  areaLabelTargetRect,
  assetTargetRect,
  entityAssetId,
  fallbackTargetRect,
  resolveEntityGeometry,
  type ScreenRect,
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
  cells: ReadonlyMap<number, readonly string[]>;
  targetById: ReadonlyMap<string, HitTarget>;
  targetCellKeys: ReadonlyMap<string, readonly number[]>;
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
  // Cached world-space inputs reused by `recomputeHitTargetsForCameraOnly`
  // so static entities skip the `entityFollowTile`/`entityDepthTile`/
  // `drawableDepth` rebuild on every camera tick. Position-changing entities
  // (ships) overwrite this when motion samples re-resolve their geometry.
  worldGeometry: {
    depthTile: { x: number; y: number };
    followTile: { x: number; y: number };
  };
  sortIndex: number;
}

const shipSortIndexByWorld = new WeakMap<PharosVilleWorld, Map<string, number>>();
const staticHitTargetEntitiesByWorld = new WeakMap<PharosVilleWorld, readonly WorldSelectableEntity[]>();

const HIT_TARGET_SPATIAL_CELL_SIZE = 96;

// Numeric cell-key encoding: pack two int16-range cell coordinates into a
// single number so the spatial-index Map can avoid per-lookup string allocs.
// `cellX`/`cellY` are floor-divided pixel coords; with the 96 px cell size
// this comfortably covers ±3M screen pixels.
const SPATIAL_CELL_KEY_OFFSET = 32_768;
const SPATIAL_CELL_KEY_STRIDE = 65_536;

function encodeSpatialCellKey(cellX: number, cellY: number): number {
  return (cellY + SPATIAL_CELL_KEY_OFFSET) * SPATIAL_CELL_KEY_STRIDE + (cellX + SPATIAL_CELL_KEY_OFFSET);
}

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
  const staticPrefix = staticHitTargetPrefixForWorld(input.world);
  const lighthouseCount = 1;
  const dockCount = input.world.docks.length;
  const shipsAfterStaticPrefixCount = lighthouseCount + dockCount;

  // Iterate the cached static prefix `[lighthouse, ...docks]` followed by
  // ships in place, then `[...areas, ...graves]`. `sortIndex` mirrors the
  // legacy flat-array index so downstream sort semantics are preserved.
  let sortIndex = 0;
  // lighthouse + docks
  while (sortIndex < shipsAfterStaticPrefixCount) {
    const entity = staticPrefix[sortIndex]!;
    appendHitTargetRecord(recordsById, entity, sortIndex, input);
    sortIndex += 1;
  }
  // ships (filtered by map visibility — same predicate as the legacy filter)
  for (let shipIndex = 0; shipIndex < input.world.ships.length; shipIndex += 1) {
    const ship = input.world.ships[shipIndex]!;
    if (!isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id))) continue;
    appendHitTargetRecord(recordsById, ship, shipsAfterStaticPrefixCount + shipIndex, input);
  }
  // areas + graves (sortIndex offsets past the ship slot range to mirror the
  // legacy flat-array layout)
  const trailingOffset = shipsAfterStaticPrefixCount + input.world.ships.length;
  for (let trailingIndex = shipsAfterStaticPrefixCount; trailingIndex < staticPrefix.length; trailingIndex += 1) {
    const entity = staticPrefix[trailingIndex]!;
    appendHitTargetRecord(recordsById, entity, trailingOffset + (trailingIndex - shipsAfterStaticPrefixCount), input);
  }

  return snapshotFromRecords(recordsById, {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  });
}

function appendHitTargetRecord(
  recordsById: Map<string, HitTargetRecord>,
  entity: WorldSelectableEntity,
  sortIndex: number,
  input: {
    assets?: Pick<PharosVilleAssetManager, "get"> | null;
    camera: IsoCamera;
    hoveredDetailId?: string | null;
    selectedDetailId?: string | null;
    shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
    viewport?: HitTargetViewport | null;
    world: PharosVilleWorld;
  },
): void {
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
    return;
  }
  recordsById.set(entity.id, {
    entity,
    geometry: {
      depth: resolved.depth,
      targetRect: resolved.targetRect,
    },
    worldGeometry: {
      depthTile: resolved.depthTile,
      followTile: resolved.followTile,
    },
    sortIndex,
  });
}

function staticHitTargetPrefixForWorld(world: PharosVilleWorld): readonly WorldSelectableEntity[] {
  const cached = staticHitTargetEntitiesByWorld.get(world);
  if (cached) return cached;
  const entities: WorldSelectableEntity[] = [
    world.lighthouse,
    ...world.docks,
    ...world.areas,
    ...world.graves,
    world.pigeonnier,
  ];
  staticHitTargetEntitiesByWorld.set(world, entities);
  return entities;
}

/**
 * Camera-only re-projection path. Reuses the existing record list (entities,
 * sortIndex, visibility decisions) and only re-projects screen rects + re-bins
 * them in the spatial index. Use during drag pan / wheel zoom where no
 * entity additions/removals or selection-state changes have occurred.
 *
 * Falls back to a full rebuild when the existing snapshot is incompatible
 * (different selection/hover boost, or no prior snapshot).
 *
 * Performance: per-record world geometry (`followTile`, `depthTile`, `depth`)
 * is reused from the previous snapshot — only the screen rect is re-projected
 * for the new camera. The API contract guarantees positions are stable; ship
 * motion changes route through `updateHitTargetSnapshotShips` instead.
 */
export function recomputeHitTargetsForCameraOnly(input: {
  assets?: Pick<PharosVilleAssetManager, "get"> | null;
  camera: IsoCamera;
  hoveredDetailId?: string | null;
  selectedDetailId?: string | null;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  snapshot: HitTargetSnapshot;
  viewport?: HitTargetViewport | null;
  world: PharosVilleWorld;
}): HitTargetSnapshot {
  const recordsById = new Map<string, HitTargetRecord>();
  for (const previous of input.snapshot.recordsById.values()) {
    const entity = previous.entity;
    const assetId = entityAssetId(entity);
    const asset = assetId ? input.assets?.get(assetId) ?? null : null;
    const targetRect = projectEntityTargetRect({
      asset,
      camera: input.camera,
      entity,
      followTile: previous.worldGeometry.followTile,
      mapWidth: input.world.map.width,
    });
    if (!shouldKeepHitTargetCandidate({
      entity,
      geometry: { targetRect },
      hoveredDetailId: input.hoveredDetailId ?? null,
      selectedDetailId: input.selectedDetailId ?? null,
      viewport: input.viewport ?? null,
    })) {
      continue;
    }
    recordsById.set(entity.id, {
      entity,
      geometry: {
        depth: previous.geometry.depth,
        targetRect,
      },
      worldGeometry: previous.worldGeometry,
      sortIndex: previous.sortIndex,
    });
  }
  return snapshotFromRecords(recordsById, {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  });
}

// Re-project a record's cached world geometry to a new camera. Mirrors the
// rect-selection branch in `resolveEntityGeometry`, but skips world-tile
// resolution (cached) and the depth recompute (camera-independent).
function projectEntityTargetRect(input: {
  asset: LoadedPharosVilleAsset | null;
  camera: IsoCamera;
  entity: WorldSelectableEntity;
  followTile: { x: number; y: number };
  mapWidth: number;
}): ScreenRect {
  if (input.entity.kind === "area") return areaLabelTargetRect(input.entity, input.camera);
  const screenPoint = tileToScreen(input.followTile, input.camera);
  if (input.asset) {
    return assetTargetRect({
      asset: input.asset,
      camera: input.camera,
      entity: input.entity,
      mapWidth: input.mapWidth,
      point: screenPoint,
    });
  }
  return fallbackTargetRect(input.entity, input.camera, screenPoint);
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
  // Caller invariant: `changedShipIds` is already de-duplicated. Iterate the
  // input directly. In dev, assert the invariant so regressions surface
  // loudly rather than silently double-processing a ship.
  const changedShipIds = input.changedShipIds;
  if (process.env.NODE_ENV !== "production") {
    if (new Set(changedShipIds).size !== changedShipIds.length) {
      throw new Error("updateHitTargetSnapshotShips: changedShipIds contains duplicates");
    }
  }
  const changedShipIdSet = new Set(changedShipIds);
  // Copy-on-write: keep a reference to the previous snapshot's recordsById
  // and only allocate a new Map once we know an actual mutation will land.
  // Pending writes (delete/set) are batched in `pendingDeletes`/`pendingSets`
  // and flushed onto the cloned map in a single pass after the loop.
  const previousRecordsById = input.snapshot.recordsById;
  const updatedRecordsByShipId = new Map<string, HitTargetRecord | null>();
  const pendingSets = new Map<string, HitTargetRecord>();
  const pendingDeletes = new Set<string>();
  let snapshotMutated = false;

  for (const shipId of changedShipIds) {
    const previous = previousRecordsById.get(shipId);
    const ship = input.worldShipsById.get(shipId);
    if (!ship) {
      if (previous) {
        snapshotMutated = true;
        pendingDeletes.add(shipId);
      }
      updatedRecordsByShipId.set(shipId, null);
      continue;
    }

    if (!isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id))) {
      if (previous) {
        snapshotMutated = true;
        pendingDeletes.add(shipId);
      }
      updatedRecordsByShipId.set(shipId, null);
      continue;
    }

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
      if (previous) {
        snapshotMutated = true;
        pendingDeletes.add(shipId);
      }
      updatedRecordsByShipId.set(shipId, null);
      continue;
    }
    const nextRecord: HitTargetRecord = {
      entity: ship,
      geometry: {
        depth: resolved.depth,
        targetRect: resolved.targetRect,
      },
      worldGeometry: {
        depthTile: resolved.depthTile,
        followTile: resolved.followTile,
      },
      sortIndex: previous?.sortIndex ?? shipSortIndex(input.world, shipId),
    };
    if (!previous || !hitTargetRecordGeometryEquals(previous, nextRecord)) {
      snapshotMutated = true;
      pendingSets.set(shipId, nextRecord);
    }
    updatedRecordsByShipId.set(shipId, nextRecord);
  }

  if (!snapshotMutated) return input.snapshot;

  // First confirmed write: clone the records map and apply all batched
  // deletes/sets in one pass. When no ships actually change geometry the
  // early return above keeps the input snapshot's map intact.
  const recordsById = new Map(previousRecordsById);
  for (const shipId of pendingDeletes) {
    recordsById.delete(shipId);
  }
  for (const [shipId, record] of pendingSets) {
    recordsById.set(shipId, record);
  }

  const unchangedRecordsInOrder: HitTargetRecord[] = [];
  for (const target of input.snapshot.targets) {
    if (changedShipIdSet.has(target.id)) continue;
    const record = recordsById.get(target.id);
    if (record) unchangedRecordsInOrder.push(record);
  }

  const updatedRecords = Array.from(updatedRecordsByShipId.values()).filter(
    (record): record is HitTargetRecord => Boolean(record),
  );
  for (const updatedRecord of updatedRecords) {
    insertRecordBySortOrder(unchangedRecordsInOrder, updatedRecord);
  }

  const nextSnapshot = snapshotFromSortedRecords(recordsById, unchangedRecordsInOrder, {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  });
  const nextTargetsById = new Map<string, HitTarget>(nextSnapshot.targets.map((target) => [target.id, target]));
  const nextSpatialIndex = updateHitTargetSpatialIndex({
    changedShipIds: changedShipIdSet,
    nextTargets: nextSnapshot.targets,
    nextTargetsById,
    previousSpatialIndex: input.snapshot.spatialIndex,
  });
  return {
    ...nextSnapshot,
    spatialIndex: {
      ...nextSpatialIndex,
      targets: nextSnapshot.targets,
    },
  };
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
  const cells = new Map<number, string[]>();
  const targetById = new Map<string, HitTarget>();
  const targetCellKeys = new Map<string, readonly number[]>();
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]!;
    targetById.set(target.id, target);
    const keys = spatialCellKeysForTarget(target.rect, resolvedCellSize);
    targetCellKeys.set(target.id, keys);
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const key = keys[keyIndex]!;
      const existing = cells.get(key);
      if (existing) {
        existing.push(target.id);
      } else {
        cells.set(key, [target.id]);
      }
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

export function hitTestSpatial(index: HitTargetSpatialIndex | null, point: ScreenPoint, context?: HitTargetPriorityContext): HitTarget | null {
  if (!index) return null;
  const cellX = Math.floor(point.x / index.cellSize);
  const cellY = Math.floor(point.y / index.cellSize);
  const candidateIds = index.cells.get(encodeSpatialCellKey(cellX, cellY));
  if (!candidateIds || candidateIds.length === 0) return null;
  let bestTarget: HitTarget | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  for (const targetId of candidateIds) {
    const target = index.targetById.get(targetId);
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
  const sortedRecords = [...recordsById.values()].sort(compareHitTargetRecords);
  return snapshotFromSortedRecords(recordsById, sortedRecords, _context);
}

function snapshotFromSortedRecords(
  recordsById: Map<string, HitTargetRecord>,
  sortedRecords: readonly HitTargetRecord[],
  _context: Required<HitTargetPriorityContext>,
): HitTargetSnapshot {
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

function updateHitTargetSpatialIndex(input: {
  changedShipIds: ReadonlySet<string>;
  nextTargets: readonly HitTarget[];
  nextTargetsById: ReadonlyMap<string, HitTarget>;
  previousSpatialIndex: HitTargetSpatialIndex;
}): {
  cellSize: number;
  cells: ReadonlyMap<number, readonly string[]>;
  targetById: ReadonlyMap<string, HitTarget>;
  targetCellKeys: ReadonlyMap<string, readonly number[]>;
  targets: readonly HitTarget[];
} {
  const nextTargetById = new Map<string, HitTarget>(input.nextTargetsById);
  const nextTargetCellKeys = new Map<string, readonly number[]>(
    input.previousSpatialIndex.targetCellKeys,
  );
  const nextCells = new Map<number, string[]>(input.previousSpatialIndex.cells as Map<number, string[]>);
  const ensureCopiedCell = (cellKey: number): string[] | null => {
    const candidates = nextCells.get(cellKey);
    if (!candidates) return null;
    const sourceCandidates = input.previousSpatialIndex.cells.get(cellKey);
    if (candidates === sourceCandidates) {
      const copiedCandidates = [...candidates];
      nextCells.set(cellKey, copiedCandidates);
      return copiedCandidates;
    }
    return candidates;
  };

  for (const changedShipId of input.changedShipIds) {
    const previousCellKeys = input.previousSpatialIndex.targetCellKeys.get(changedShipId);
    nextTargetById.delete(changedShipId);
    nextTargetCellKeys.delete(changedShipId);

    const nextTarget = input.nextTargetsById.get(changedShipId);
    if (!nextTarget) continue;
    const nextCellKeys = spatialCellKeysForTarget(nextTarget.rect, input.previousSpatialIndex.cellSize);
    nextTargetById.set(changedShipId, nextTarget);
    nextTargetCellKeys.set(changedShipId, nextCellKeys);
    const shouldUpdateCells = !areTargetCellKeysEqual(previousCellKeys, nextCellKeys);
    if (shouldUpdateCells) {
      if (previousCellKeys) {
        for (let i = 0; i < previousCellKeys.length; i += 1) {
          const cellKey = previousCellKeys[i]!;
          const candidates = ensureCopiedCell(cellKey);
          if (!candidates) continue;
          const candidateIndex = candidates.indexOf(changedShipId);
          if (candidateIndex < 0) continue;
          candidates.splice(candidateIndex, 1);
          if (candidates.length === 0) {
            nextCells.delete(cellKey);
          }
        }
      }
      for (let i = 0; i < nextCellKeys.length; i += 1) {
        const cellKey = nextCellKeys[i]!;
        let candidates = ensureCopiedCell(cellKey);
        if (!candidates) {
          candidates = [changedShipId];
          nextCells.set(cellKey, candidates);
        } else if (!candidates.includes(changedShipId)) {
          candidates.push(changedShipId);
        }
      }
    }
  }

  return {
    cellSize: input.previousSpatialIndex.cellSize,
    cells: nextCells,
    targetById: nextTargetById,
    targetCellKeys: nextTargetCellKeys,
    targets: input.nextTargets,
  };
}

function areTargetCellKeysEqual(left: readonly number[] | undefined, right: readonly number[]): boolean {
  if (!left || left.length !== right.length) return false;
  // Cell-key arrays are short (typically 1-4 entries for a hit-rect), so a
  // direct membership scan beats the per-call Set allocation.
  for (let i = 0; i < left.length; i += 1) {
    if (right.indexOf(left[i]!) < 0) return false;
  }
  return true;
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

function spatialCellKeysForTarget(targetRect: HitTarget["rect"], cellSize: number): readonly number[] {
  const minCellX = Math.floor(targetRect.x / cellSize);
  const maxCellX = Math.floor((targetRect.x + targetRect.width) / cellSize);
  const minCellY = Math.floor(targetRect.y / cellSize);
  const maxCellY = Math.floor((targetRect.y + targetRect.height) / cellSize);
  // Bounded by min/max derived from `Math.floor`, so the (cellX, cellY)
  // grid pairs are inherently unique — no Set needed for de-dup. Inline
  // array push avoids the Set+spread allocation churn seen on every drag
  // re-projection.
  const cellKeys: number[] = [];
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      cellKeys.push(encodeSpatialCellKey(cellX, cellY));
    }
  }
  return cellKeys;
}

function compareHitTargetRecords(left: HitTargetRecord, right: HitTargetRecord): number {
  return (
    left.geometry.depth - right.geometry.depth
    || (left.entity.kind < right.entity.kind ? -1 : left.entity.kind > right.entity.kind ? 1 : 0)
    || left.sortIndex - right.sortIndex
  );
}

function hitTargetRecordGeometryEquals(left: HitTargetRecord, right: HitTargetRecord): boolean {
  return (
    left.entity.id === right.entity.id
    && left.sortIndex === right.sortIndex
    && left.geometry.depth === right.geometry.depth
    && left.geometry.targetRect.x === right.geometry.targetRect.x
    && left.geometry.targetRect.y === right.geometry.targetRect.y
    && left.geometry.targetRect.width === right.geometry.targetRect.width
    && left.geometry.targetRect.height === right.geometry.targetRect.height
  );
}

function insertRecordBySortOrder(records: HitTargetRecord[], target: HitTargetRecord): void {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (compareHitTargetRecords(target, records[mid]!) < 0) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  records.splice(low, 0, target);
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

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
  worldRecordsById?: Map<string, HitTargetRecord>;
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

export type OrderedHitTargetEntityGroup = "area" | "dock" | "grave" | "lighthouse" | "pigeonnier" | "ship";

export interface OrderedHitTargetEntity {
  entity: WorldSelectableEntity;
  group: OrderedHitTargetEntityGroup;
  sortIndex: number;
}

const orderedHitTargetEntitiesByWorld = new WeakMap<PharosVilleWorld, readonly OrderedHitTargetEntity[]>();
const hitTargetSortIndexByWorld = new WeakMap<PharosVilleWorld, Map<string, number>>();

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

function isShipHitTargetVisible(
  ship: PharosVilleWorld["ships"][number],
  sample: ShipMotionSample | null | undefined,
  context: Required<HitTargetPriorityContext>,
): boolean {
  if (ship.detailId === context.selectedDetailId || ship.detailId === context.hoveredDetailId) return true;
  return isShipMapVisible(ship, sample);
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
  const worldRecordsById = new Map<string, HitTargetRecord>();
  const context = {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  };

  for (const ordered of orderedHitTargetEntities(input.world)) {
    const entity = ordered.entity;
    if (ordered.group === "ship") {
      if (entity.kind !== "ship") continue;
      if (!isShipHitTargetVisible(entity, input.shipMotionSamples?.get(entity.id), context)) continue;
    }
    worldRecordsById.set(entity.id, buildHitTargetRecord({
      ...input,
      entity,
      sortIndex: ordered.sortIndex,
    }));
  }

  return snapshotFromWorldRecords(worldRecordsById, context, input.viewport ?? null);
}

function buildHitTargetRecord(
  input: {
    assets?: Pick<PharosVilleAssetManager, "get"> | null;
    camera: IsoCamera;
    entity: WorldSelectableEntity;
    hoveredDetailId?: string | null;
    previousGeometry?: HitTargetRecord["geometry"];
    previousWorldGeometry?: HitTargetRecord["worldGeometry"];
    selectedDetailId?: string | null;
    shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
    sortIndex: number;
    viewport?: HitTargetViewport | null;
    world: PharosVilleWorld;
  },
): HitTargetRecord {
  const { entity } = input;
  const assetId = entityAssetId(entity);
  const asset = assetId ? input.assets?.get(assetId) ?? null : null;
  if (input.previousGeometry && input.previousWorldGeometry) {
    return {
      entity,
      geometry: {
        depth: input.previousGeometry.depth,
        targetRect: projectEntityTargetRect({
          asset,
          camera: input.camera,
          entity,
          followTile: input.previousWorldGeometry.followTile,
          mapWidth: input.world.map.width,
        }),
      },
      worldGeometry: input.previousWorldGeometry,
      sortIndex: input.sortIndex,
    };
  }
  const resolved = resolveEntityGeometry({
    asset,
    camera: input.camera,
    entity,
    mapWidth: input.world.map.width,
    ...(input.shipMotionSamples ? { shipMotionSamples: input.shipMotionSamples } : {}),
  });
  return {
    entity,
    geometry: {
      depth: resolved.depth,
      targetRect: resolved.targetRect,
    },
    worldGeometry: {
      depthTile: resolved.depthTile,
      followTile: resolved.followTile,
    },
    sortIndex: input.sortIndex,
  };
}

export function orderedHitTargetEntities(world: PharosVilleWorld): readonly OrderedHitTargetEntity[] {
  const cached = orderedHitTargetEntitiesByWorld.get(world);
  if (cached) return cached;

  const ordered: OrderedHitTargetEntity[] = [];
  let sortIndex = 0;
  ordered.push({ entity: world.lighthouse, group: "lighthouse", sortIndex: sortIndex++ });
  for (const dock of world.docks) ordered.push({ entity: dock, group: "dock", sortIndex: sortIndex++ });
  for (const ship of world.ships) ordered.push({ entity: ship, group: "ship", sortIndex: sortIndex++ });
  for (const area of world.areas) ordered.push({ entity: area, group: "area", sortIndex: sortIndex++ });
  for (const grave of world.graves) ordered.push({ entity: grave, group: "grave", sortIndex: sortIndex++ });
  ordered.push({ entity: world.pigeonnier, group: "pigeonnier", sortIndex });

  orderedHitTargetEntitiesByWorld.set(world, ordered);
  hitTargetSortIndexByWorld.set(world, new Map(ordered.map((entry) => [entry.entity.id, entry.sortIndex])));
  return ordered;
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
  const sourceRecords = input.snapshot.worldRecordsById ?? input.snapshot.recordsById;
  const worldRecordsById = new Map<string, HitTargetRecord>();
  const context = {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  };
  for (const previous of sourceRecords.values()) {
    const entity = previous.entity;
    if (entity.kind === "ship") {
      const sample = input.shipMotionSamples?.get(entity.id);
      if (!isShipHitTargetVisible(entity, sample, context)) continue;
      // P5: ships far outside the viewport reuse cached world geometry like
      // static entities — one tile projection instead of a full
      // `resolveEntityGeometry` per camera tick. Offscreen rects are culled
      // from the hover set anyway, and the staleness is bounded: the
      // round-robin display-sample probes rebuild every ship's record within
      // a few frames once camera intent ends, while the generous margin
      // keeps any ship that could drift on-screen mid-gesture on the full
      // path. Selected/hovered ships always resolve fully — they stay
      // hover-relevant even off-screen.
      const cheapProjection = input.viewport
        && entity.detailId !== context.selectedDetailId
        && entity.detailId !== context.hoveredDetailId
        && isCachedShipGeometryFarOffscreen(previous, input.camera, input.viewport);
      worldRecordsById.set(entity.id, buildHitTargetRecord({
        ...input,
        entity,
        ...(cheapProjection
          ? {
            previousGeometry: previous.geometry,
            previousWorldGeometry: previous.worldGeometry,
          }
          : {}),
        sortIndex: previous.sortIndex,
      }));
      continue;
    }
    worldRecordsById.set(entity.id, buildHitTargetRecord({
      ...input,
      entity,
      previousGeometry: previous.geometry,
      previousWorldGeometry: previous.worldGeometry,
      sortIndex: previous.sortIndex,
    }));
  }
  return snapshotFromWorldRecords(worldRecordsById, context, input.viewport ?? null);
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
  // Copy-on-write: keep a reference to the previous snapshot's uncullable records
  // and only allocate a new Map once we know an actual mutation will land.
  // Pending writes (delete/set) are batched in `pendingDeletes`/`pendingSets`
  // and flushed onto the cloned map in a single pass after the loop.
  const previousRecordsById = input.snapshot.worldRecordsById ?? input.snapshot.recordsById;
  const context = {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  };
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
      continue;
    }

    if (!isShipHitTargetVisible(ship, input.shipMotionSamples?.get(ship.id), context)) {
      if (previous) {
        snapshotMutated = true;
        pendingDeletes.add(shipId);
      }
      continue;
    }

    const nextRecord = buildHitTargetRecord({
      ...input,
      entity: ship,
      sortIndex: previous?.sortIndex ?? hitTargetSortIndex(input.world, shipId),
    });
    if (!previous || !hitTargetRecordGeometryEquals(previous, nextRecord)) {
      snapshotMutated = true;
      pendingSets.set(shipId, nextRecord);
    }
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

  return snapshotFromWorldRecords(recordsById, context, input.viewport ?? null);
}

export function collectDisplaySampleHitTargetChanges(input: {
  assets?: Pick<PharosVilleAssetManager, "get"> | null;
  camera: IsoCamera;
  hoveredDetailId?: string | null;
  minScreenDeltaPx?: number;
  selectedDetailId?: string | null;
  shipIds?: readonly string[];
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  snapshot: HitTargetSnapshot;
  world: PharosVilleWorld;
  worldShipsById: ReadonlyMap<string, PharosVilleWorld["ships"][number]>;
}): string[] {
  const sourceRecords = input.snapshot.worldRecordsById ?? input.snapshot.recordsById;
  const minDelta = Math.max(0, input.minScreenDeltaPx ?? 0.5);
  const minAreaDelta = minDelta * minDelta;
  const changedShipIds: string[] = [];
  const shipIds = input.shipIds ?? input.world.ships.map((ship) => ship.id);
  const context = {
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
  };

  for (const shipId of shipIds) {
    const ship = input.worldShipsById.get(shipId);
    const previous = sourceRecords.get(shipId);
    if (!ship) {
      if (previous) changedShipIds.push(shipId);
      continue;
    }

    const visible = isShipHitTargetVisible(ship, input.shipMotionSamples?.get(ship.id), context);
    if (!visible) {
      if (previous) changedShipIds.push(shipId);
      continue;
    }
    if (!previous) {
      changedShipIds.push(shipId);
      continue;
    }

    const nextRecord = buildHitTargetRecord({
      ...input,
      entity: ship,
      sortIndex: previous.sortIndex,
    });
    if (ship.detailId === context.selectedDetailId || ship.detailId === context.hoveredDetailId) {
      if (!hitTargetRecordGeometryEquals(previous, nextRecord)) {
        changedShipIds.push(shipId);
      }
      continue;
    }

    if (
      previous.geometry.depth !== nextRecord.geometry.depth
      || rectScreenDeltaArea(previous.geometry.targetRect, nextRecord.geometry.targetRect) >= minAreaDelta
    ) {
      changedShipIds.push(shipId);
    }
  }

  return changedShipIds;
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
  worldRecordsById: Map<string, HitTargetRecord> = recordsById,
): HitTargetSnapshot {
  const sortedRecords = [...recordsById.values()].sort(compareHitTargetRecords);
  return snapshotFromSortedRecords(recordsById, sortedRecords, _context, worldRecordsById);
}

function snapshotFromWorldRecords(
  worldRecordsById: Map<string, HitTargetRecord>,
  context: Required<HitTargetPriorityContext>,
  viewport: HitTargetViewport | null,
): HitTargetSnapshot {
  const recordsById = new Map<string, HitTargetRecord>();
  for (const record of worldRecordsById.values()) {
    if (!shouldKeepHitTargetCandidate({
      entity: record.entity,
      geometry: record.geometry,
      hoveredDetailId: context.hoveredDetailId,
      selectedDetailId: context.selectedDetailId,
      viewport,
    })) {
      continue;
    }
    recordsById.set(record.entity.id, record);
  }
  return snapshotFromRecords(recordsById, context, worldRecordsById);
}

function snapshotFromSortedRecords(
  recordsById: Map<string, HitTargetRecord>,
  sortedRecords: readonly HitTargetRecord[],
  _context: Required<HitTargetPriorityContext>,
  worldRecordsById: Map<string, HitTargetRecord> = recordsById,
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
    worldRecordsById,
  };
}

// Margin for the camera-only cheap-projection path. Generous relative to the
// 48px hover-cull margin so a sailing ship (≤0.15 tiles/frame post-warmup)
// cannot cross from "cheap" range into the visible viewport within the
// handful of frames a camera gesture suspends the round-robin probes.
const SHIP_CAMERA_ONLY_OFFSCREEN_MARGIN_PX = 384;

function isCachedShipGeometryFarOffscreen(
  record: HitTargetRecord,
  camera: IsoCamera,
  viewport: HitTargetViewport,
): boolean {
  const point = tileToScreen(record.worldGeometry.followTile, camera);
  return (
    point.x < -SHIP_CAMERA_ONLY_OFFSCREEN_MARGIN_PX
    || point.x > viewport.width + SHIP_CAMERA_ONLY_OFFSCREEN_MARGIN_PX
    || point.y < -SHIP_CAMERA_ONLY_OFFSCREEN_MARGIN_PX
    || point.y > viewport.height + SHIP_CAMERA_ONLY_OFFSCREEN_MARGIN_PX
  );
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

function rectScreenDeltaArea(left: ScreenRect, right: ScreenRect): number {
  const leftCenterX = left.x + left.width / 2;
  const leftCenterY = left.y + left.height / 2;
  const rightCenterX = right.x + right.width / 2;
  const rightCenterY = right.y + right.height / 2;
  const dx = leftCenterX - rightCenterX;
  const dy = leftCenterY - rightCenterY;
  const dw = left.width - right.width;
  const dh = left.height - right.height;
  return Math.max(dx * dx + dy * dy, dw * dw, dh * dh);
}

function hitTargetSortIndex(world: PharosVilleWorld, entityId: string): number {
  let sortIndexById = hitTargetSortIndexByWorld.get(world);
  if (!sortIndexById) {
    orderedHitTargetEntities(world);
    sortIndexById = hitTargetSortIndexByWorld.get(world);
  }
  return sortIndexById?.get(entityId) ?? 0;
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

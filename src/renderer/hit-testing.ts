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

interface HitTargetViewport {
  height: number;
  width: number;
}

function targetPriorityBoost(entity: WorldSelectableEntity, selectedDetailId: string | null, hoveredDetailId: string | null): number {
  let priority = 0;
  if (entity.kind === "area") priority += 10_000;
  if (entity.detailId === selectedDetailId) priority += 2;
  if (entity.detailId === hoveredDetailId) priority += 1;
  return priority;
}

function visualPriorityForHitTarget(entity: WorldSelectableEntity, priority: number): number {
  // Ethereum's hub body is drawn before the sorted entity pass so ships sail over it.
  // Keep the dock selectable, but do not let its large hub hitbox outrank ships.
  if (entity.kind === "dock" && entity.chainId === "ethereum") return -1;
  return priority;
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
  const entities: WorldSelectableEntity[] = [
    input.world.lighthouse,
    ...input.world.docks,
    ...input.world.ships.filter((ship) => isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id))),
    ...input.world.areas,
    ...input.world.graves,
  ];

  const targetRecords = entities.map((entity, sortIndex) => {
    const assetId = entityAssetId(entity);
    const asset = assetId ? input.assets?.get(assetId) ?? null : null;
    const geometry = resolveEntityGeometry({
      asset,
      camera: input.camera,
      entity,
      mapWidth: input.world.map.width,
      shipMotionSamples: input.shipMotionSamples,
    });
    return { entity, geometry, sortIndex };
  }).filter(({ entity, geometry }) => shouldKeepHitTargetCandidate({
    entity,
    geometry,
    hoveredDetailId: input.hoveredDetailId ?? null,
    selectedDetailId: input.selectedDetailId ?? null,
    viewport: input.viewport ?? null,
  }));
  // Sort body-pass drawables by iso depth, then by entity kind, then by the
  // construction-order numeric index. This mirrors `sortWorldDrawables` for
  // body-pass drawables, but the per-entity tiebreaker is the numeric
  // sortIndex assigned at entity-list construction time — replacing the
  // previous `entity.id.localeCompare(...)` allocation per comparison.
  const visualPriority = new Map<string, number>();
  [...targetRecords]
    .sort((a, b) => (
      a.geometry.depth - b.geometry.depth
      || (a.entity.kind < b.entity.kind ? -1 : a.entity.kind > b.entity.kind ? 1 : 0)
      || a.sortIndex - b.sortIndex
    ))
    .forEach(({ entity }, index) => {
      visualPriority.set(entity.id, index);
    });

  return targetRecords.map(({ entity, geometry }) => {
    return {
      detailId: entity.detailId,
      id: entity.id,
      kind: entity.kind,
      label: entity.label,
      priority: visualPriorityForHitTarget(entity, visualPriority.get(entity.id) ?? 0) * 10
        + targetPriorityBoost(entity, input.selectedDetailId ?? null, input.hoveredDetailId ?? null),
      rect: geometry.targetRect,
    };
  });
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

export function hitTest(targets: readonly HitTarget[], point: ScreenPoint): HitTarget | null {
  let bestTarget: HitTarget | null = null;
  for (const target of targets) {
    const containsPoint = (
      point.x >= target.rect.x
      && point.x <= target.rect.x + target.rect.width
      && point.y >= target.rect.y
      && point.y <= target.rect.y + target.rect.height
    );
    if (!containsPoint) continue;
    if (!bestTarget || target.priority > bestTarget.priority) bestTarget = target;
  }
  return bestTarget;
}

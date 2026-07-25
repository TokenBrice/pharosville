import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  GARDEN_ZONE_ROOT_Y,
  gardenAreaDisplayTile,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
  gardenShipSelectionRadius,
  gardenTileToScreen,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "../systems/garden-observatory-slice";
import type { ShipMotionSample } from "../systems/motion";
import type { IsoCamera, ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  hitTargetSnapshotFromTargets,
  type HitTarget,
  type HitTargetSnapshot,
} from "./hit-testing";

interface GardenHitTargetViewport {
  height: number;
  width: number;
}

export function createGardenObservatoryHitTargetSnapshot(input: {
  camera: IsoCamera;
  hoveredDetailId?: string | null;
  selectedDetailId?: string | null;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  viewport?: GardenHitTargetViewport | null;
  world: PharosVilleWorld;
}): HitTargetSnapshot {
  const selectedDetailId = input.selectedDetailId ?? null;
  const hoveredDetailId = input.hoveredDetailId ?? null;
  const slice = selectGardenObservatorySlice(input.world, selectedDetailId);
  const targets: HitTarget[] = [];

  const islandTile = gardenIslandDisplayTile(input.world.lighthouse.tile);
  const lighthouseTile = {
    x: islandTile.x + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x / Math.SQRT2,
    y: islandTile.y + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z / Math.SQRT2,
  };
  const lighthouseBase = gardenTileToScreen(
    lighthouseTile,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    input.camera,
  );
  const lighthouseTop = gardenTileToScreen(
    lighthouseTile,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_HEIGHT,
    input.camera,
  );
  const lighthouseAnchor = gardenTileToScreen(
    lighthouseTile,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_BEACON_Y,
    input.camera,
  );
  addVisibleTarget(targets, {
    anchor: lighthouseAnchor,
    detailId: input.world.lighthouse.detailId,
    id: input.world.lighthouse.id,
    kind: input.world.lighthouse.kind,
    label: input.world.lighthouse.label,
    priority: 1_000 + lighthouseAnchor.y,
    rect: rectBetweenAnchors(
      lighthouseTop,
      lighthouseBase,
      80 * input.camera.zoom,
      14 * input.camera.zoom,
    ),
  }, input.viewport, selectedDetailId, hoveredDetailId);

  for (const dock of input.world.docks) {
    const anchor = gardenTileToScreen(
      gardenDockDisplayTile(dock.tile),
      GARDEN_DOCK_ROOT_Y,
      input.camera,
    );
    addVisibleTarget(targets, {
      anchor,
      detailId: dock.detailId,
      id: dock.id,
      kind: dock.kind,
      label: dock.label,
      priority: 2_000 + anchor.y,
      rect: rectAroundAnchor(anchor, 112 * input.camera.zoom, 52 * input.camera.zoom),
    }, input.viewport, selectedDetailId, hoveredDetailId);
  }

  for (const area of input.world.areas) {
    const anchor = gardenTileToScreen(
      gardenAreaDisplayTile(area),
      GARDEN_ZONE_ROOT_Y,
      input.camera,
    );
    addVisibleTarget(targets, {
      anchor,
      detailId: area.detailId,
      id: area.id,
      kind: area.kind,
      label: area.label,
      priority: 1_500 + anchor.y,
      rect: rectAroundAnchor(anchor, 172 * input.camera.zoom, 104 * input.camera.zoom),
    }, input.viewport, selectedDetailId, hoveredDetailId);
  }

  const pigeonnierAnchor = gardenTileToScreen(
    input.world.pigeonnier.tile,
    0.2,
    input.camera,
  );
  addVisibleTarget(targets, {
    anchor: pigeonnierAnchor,
    detailId: input.world.pigeonnier.detailId,
    id: input.world.pigeonnier.id,
    kind: input.world.pigeonnier.kind,
    label: input.world.pigeonnier.label,
    priority: 3_000 + pigeonnierAnchor.y,
    rect: rectAboveAnchor(
      pigeonnierAnchor,
      76 * input.camera.zoom,
      108 * input.camera.zoom,
      16 * input.camera.zoom,
    ),
  }, input.viewport, selectedDetailId, hoveredDetailId);

  for (const grave of input.world.graves) {
    const anchor = gardenTileToScreen(grave.tile, 0.2, input.camera);
    addVisibleTarget(targets, {
      anchor,
      detailId: grave.detailId,
      id: grave.id,
      kind: grave.kind,
      label: grave.label,
      priority: 2_500 + anchor.y,
      rect: rectAboveAnchor(
        anchor,
        36 * input.camera.zoom,
        52 * input.camera.zoom,
        8 * input.camera.zoom,
      ),
    }, input.viewport, selectedDetailId, hoveredDetailId);
  }

  for (const placement of slice.ships) {
    const ship = placement.ship;
    const tile = resolveGardenShipDisplayTile({
      ...placement,
      sample: input.shipMotionSamples?.get(ship.id),
    });
    const anchor = gardenTileToScreen(tile, GARDEN_SHIP_ROOT_Y, input.camera);
    const diameter = Math.max(
      32,
      gardenShipSelectionRadius(ship) * 2 * 16 * input.camera.zoom,
    );
    addVisibleTarget(targets, {
      anchor,
      detailId: ship.detailId,
      id: ship.id,
      kind: ship.kind,
      label: ship.label,
      priority: 10_000 + anchor.y,
      rect: rectAboveAnchor(anchor, diameter * 1.1, Math.max(42, diameter * 1.25), diameter * 0.3),
    }, input.viewport, selectedDetailId, hoveredDetailId);
  }

  return hitTargetSnapshotFromTargets(targets);
}

function addVisibleTarget(
  targets: HitTarget[],
  target: HitTarget,
  viewport: GardenHitTargetViewport | null | undefined,
  selectedDetailId: string | null,
  hoveredDetailId: string | null,
): void {
  if (
    viewport
    && target.detailId !== selectedDetailId
    && target.detailId !== hoveredDetailId
    && !rectIntersectsViewport(target.rect, viewport, 48)
  ) {
    return;
  }
  targets.push(target);
}

function rectAroundAnchor(anchor: ScreenPoint, width: number, height: number) {
  const resolvedWidth = Math.max(28, width);
  const resolvedHeight = Math.max(28, height);
  return {
    height: resolvedHeight,
    width: resolvedWidth,
    x: anchor.x - resolvedWidth / 2,
    y: anchor.y - resolvedHeight / 2,
  };
}

function rectAboveAnchor(
  anchor: ScreenPoint,
  width: number,
  height: number,
  bottomPadding: number,
) {
  const resolvedWidth = Math.max(32, width);
  const resolvedHeight = Math.max(40, height);
  return {
    height: resolvedHeight,
    width: resolvedWidth,
    x: anchor.x - resolvedWidth / 2,
    y: anchor.y - resolvedHeight + bottomPadding,
  };
}

function rectBetweenAnchors(
  top: ScreenPoint,
  bottom: ScreenPoint,
  width: number,
  padding: number,
) {
  const resolvedWidth = Math.max(40, width);
  const topY = Math.min(top.y, bottom.y) - padding;
  const bottomY = Math.max(top.y, bottom.y) + padding;
  return {
    height: bottomY - topY,
    width: resolvedWidth,
    x: (top.x + bottom.x) / 2 - resolvedWidth / 2,
    y: topY,
  };
}

function rectIntersectsViewport(
  rect: HitTarget["rect"],
  viewport: GardenHitTargetViewport,
  margin: number,
): boolean {
  return (
    rect.x + rect.width >= -margin
    && rect.x <= viewport.width + margin
    && rect.y + rect.height >= -margin
    && rect.y <= viewport.height + margin
  );
}

import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  GARDEN_WATER_Y,
  GARDEN_ZONE_ROOT_Y,
  gardenAreaDisplayTile,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
  gardenSemanticView,
  gardenShipSelectionRadius,
  gardenTileToScreen,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "../systems/garden-observatory-slice";
import type { ShipMotionSample } from "../systems/motion";
import type { IsoCamera, ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
// The sea signs are the one piece of scenery whose hit target cannot be derived
// from the world model alone: where a stele stands is decided by the sign
// module's siting pass, and its discrete face-LOD footprint is owned there too.
// Both are imported rather than mirrored. This is a desktop-only module (the
// world runtime is lazy-loaded behind the size gate), so it costs no bytes on
// the blocked path.
import {
  SEA_SIGN_STELE,
  TILE_SCALE,
  seaSignSteles,
  seaSignScaleForZoom,
  type SeaSignStele,
} from "../three/garden-sea-sign-siting";

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
  /** Renderer-owned eased/hysteretic stele scale from the frame just drawn. */
  seaSignScale?: number | null;
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

  const areaPriorityByDetailId = new Map<string, number>();
  for (const area of input.world.areas) {
    const anchor = gardenTileToScreen(
      gardenAreaDisplayTile(area),
      GARDEN_ZONE_ROOT_Y,
      input.camera,
    );
    const priority = 1_500 + anchor.y;
    areaPriorityByDetailId.set(area.detailId, priority);
    addVisibleTarget(targets, {
      anchor,
      detailId: area.detailId,
      id: area.id,
      kind: area.kind,
      label: area.label,
      priority,
      rect: rectAroundAnchor(anchor, 172 * input.camera.zoom, 104 * input.camera.zoom),
    }, input.viewport, selectedDetailId, hoveredDetailId);
  }

  // W2a: the carved stone faces are the sea's primary in-world naming surface, so each
  // one carries its water body's target instead of the invisible zone anchor
  // doing it alone. Same detail id — the stele opens exactly what the zone
  // opens — and one priority point above the zone, which is all it takes:
  // the Tab cycle keeps one stop per detail id and prefers the higher
  // priority, so the body holds its existing place in the cycle and the stop
  // simply lands on something the visitor can see.
  //
  // The duplicate stele targets stand down when a detail panel owns the frame;
  // the steles themselves remain visible and the zone target still carries the
  // body in that state.
  if (gardenSemanticView(input.camera.zoom, selectedDetailId) !== "analyze") {
    // Live callers pass the renderer track's exact last-drawn value. The pure
    // scale is only a construction-time/test fallback before a stele frame
    // exists; it must never overwrite a live hysteresis or eased settle.
    const signScale = input.seaSignScale != null
      && Number.isFinite(input.seaSignScale)
      && input.seaSignScale > 0
      ? input.seaSignScale
      : seaSignScaleForZoom(input.camera.zoom);
    for (const stele of seaSignSteles(input.world.areas)) {
      if (!stele.detailId) continue;
      const rect = seaSignSteleRect(stele, signScale, input.camera);
      const anchor = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      addVisibleTarget(targets, {
        anchor,
        detailId: stele.detailId,
        id: `sea-sign.${stele.body}`,
        kind: "sea-sign",
        label: stele.label,
        priority: (areaPriorityByDetailId.get(stele.detailId) ?? 1_500 + anchor.y) + 1,
        rect,
      }, input.viewport, selectedDetailId, hoveredDetailId);
    }
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

/**
 * The stele face's shared screen footprint.
 *
 * The scale helper is shared with the renderer: true-scale in the inhabited
 * view and one larger chart rung at whole-map zoom. It is never a continuous
 * billboard response.
 *
 * The face is a flat quad yawed to face the camera, so its four corners bound
 * it exactly under the affine iso projection.
 */
function seaSignSteleRect(stele: SeaSignStele, scale: number, camera: IsoCamera) {
  const halfWidth = (SEA_SIGN_STELE.width / 2) * scale;
  // Local +x of the yawed stele, in tiles: three.js maps it to world
  // (cos yaw, 0, -sin yaw).
  const offsetX = (Math.cos(SEA_SIGN_STELE.yaw) * halfWidth) / TILE_SCALE;
  const offsetY = (-Math.sin(SEA_SIGN_STELE.yaw) * halfWidth) / TILE_SCALE;
  const centre = { x: stele.x / TILE_SCALE, y: stele.z / TILE_SCALE };
  const left = { x: centre.x - offsetX, y: centre.y - offsetY };
  const right = { x: centre.x + offsetX, y: centre.y + offsetY };
  const topWorldY = GARDEN_WATER_Y + (SEA_SIGN_STELE.baseY + SEA_SIGN_STELE.height / 2) * scale;
  const bottomWorldY = GARDEN_WATER_Y + (SEA_SIGN_STELE.baseY - SEA_SIGN_STELE.height / 2) * scale;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const corner of [left, right]) {
    for (const worldY of [topWorldY, bottomWorldY]) {
      const point = gardenTileToScreen(corner, worldY, camera);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  // The stele is wide and shallow, so only its height ever needs lifting to
  // the WCAG 2.5.8 minimum. Grown about the centre, so the target stays
  // concentric with what is drawn.
  const width = Math.max(24, maxX - minX);
  const height = Math.max(24, maxY - minY);
  return {
    height,
    width,
    x: (minX + maxX) / 2 - width / 2,
    y: (minY + maxY) / 2 - height / 2,
  };
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

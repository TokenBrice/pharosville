import type { PharosVilleWorld } from "../../systems/world-types";
import {
  drawablePassCounts,
  sortWorldDrawablesInPlace,
  type WorldDrawable,
  type WorldDrawablePass,
  type WorldDrawableSortFields,
} from "../drawable-pass";
import type { RenderFrameCache } from "../frame-cache";
import type { WorldSelectableEntity } from "../geometry";
import type { DrawPharosVilleInput, PharosVilleRenderMetrics } from "../render-types";

export interface EntityPassCallbacks {
  drawDockBody(dock: PharosVilleWorld["docks"][number]): void;
  drawDockOverlay(dock: PharosVilleWorld["docks"][number]): void;
  drawGraveBody(grave: PharosVilleWorld["graves"][number]): void;
  drawGraveOverlay(grave: PharosVilleWorld["graves"][number]): void;
  drawGraveUnderlay(grave: PharosVilleWorld["graves"][number]): void;
  drawLighthouseBody(): void;
  drawLighthouseOverlay(): void;
  drawShipBody(ship: PharosVilleWorld["ships"][number]): void;
  drawShipOverlay(ship: PharosVilleWorld["ships"][number]): void;
  drawShipWake(ship: PharosVilleWorld["ships"][number]): void;
  isBackgroundedHarborDock(dock: PharosVilleWorld["docks"][number]): boolean;
  lighthouseOverlayScreenBounds(selectionRect: { height: number; width: number; x: number; y: number }): {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  visibleShips: readonly PharosVilleWorld["ships"][number][];
}

type EntityDrawAction =
  | "dock-body"
  | "dock-overlay"
  | "grave-body"
  | "grave-overlay"
  | "grave-underlay"
  | "lighthouse-body"
  | "lighthouse-overlay"
  | "ship-body"
  | "ship-overlay"
  | "ship-wake";

interface EntityDrawableDescriptor extends WorldDrawableSortFields {
  drawAction: EntityDrawAction;
  entity: WorldSelectableEntity;
}

type EntityPassDrawable = WorldDrawable | EntityDrawableDescriptor;

export function drawEntityLayer(
  input: DrawPharosVilleInput,
  cache: RenderFrameCache,
  extraDrawables: readonly WorldDrawable[],
  callbacks: EntityPassCallbacks,
): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  const visibleDrawables: EntityPassDrawable[] = [];

  for (const drawable of extraDrawables) {
    if (shouldDrawWorldDrawable(input, drawable)) visibleDrawables.push(drawable);
  }

  for (const dock of input.world.docks) {
    if (!callbacks.isBackgroundedHarborDock(dock)) {
      pushEntityDrawable(input, cache, callbacks, visibleDrawables, dock, "body", "dock-body");
    }
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, dock, "overlay", "dock-overlay");
  }

  for (const ship of callbacks.visibleShips) {
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, ship, "underlay", "ship-wake");
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, ship, "body", "ship-body");
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, ship, "overlay", "ship-overlay");
  }

  for (const grave of input.world.graves) {
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, grave, "underlay", "grave-underlay");
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, grave, "body", "grave-body");
    pushEntityDrawable(input, cache, callbacks, visibleDrawables, grave, "overlay", "grave-overlay");
  }

  pushEntityDrawable(input, cache, callbacks, visibleDrawables, input.world.lighthouse, "body", "lighthouse-body");
  pushEntityDrawable(input, cache, callbacks, visibleDrawables, input.world.lighthouse, "overlay", "lighthouse-overlay");

  const sorted = sortWorldDrawablesInPlace(visibleDrawables);
  for (const drawable of sorted) drawEntityPassDrawable(input.ctx, callbacks, drawable);
  return {
    drawableCount: sorted.length,
    drawableCounts: drawablePassCounts(sorted),
  };
}

function pushEntityDrawable(
  input: DrawPharosVilleInput,
  cache: RenderFrameCache,
  callbacks: EntityPassCallbacks,
  drawables: EntityPassDrawable[],
  entity: WorldSelectableEntity,
  pass: WorldDrawablePass,
  drawAction: EntityDrawAction,
) {
  const geometry = cache.geometryForEntity(entity);
  const screenBounds = entity.kind === "lighthouse" && pass === "overlay"
    ? callbacks.lighthouseOverlayScreenBounds(geometry.selectionRect)
    : geometry.selectionRect;
  const descriptor: EntityDrawableDescriptor = {
    depth: geometry.depth,
    detailId: entity.detailId,
    drawAction,
    entityId: entity.id,
    entity,
    kind: entity.kind,
    pass,
    screenBounds,
    tieBreaker: entity.id,
  };
  if (shouldDrawWorldDrawable(input, descriptor)) drawables.push(descriptor);
}

function drawEntityPassDrawable(
  ctx: CanvasRenderingContext2D,
  callbacks: EntityPassCallbacks,
  drawable: EntityPassDrawable,
) {
  if ("draw" in drawable) {
    drawable.draw(ctx);
    return;
  }

  switch (drawable.drawAction) {
    case "dock-body":
      callbacks.drawDockBody(drawable.entity as PharosVilleWorld["docks"][number]);
      return;
    case "dock-overlay":
      callbacks.drawDockOverlay(drawable.entity as PharosVilleWorld["docks"][number]);
      return;
    case "grave-body":
      callbacks.drawGraveBody(drawable.entity as PharosVilleWorld["graves"][number]);
      return;
    case "grave-overlay":
      callbacks.drawGraveOverlay(drawable.entity as PharosVilleWorld["graves"][number]);
      return;
    case "grave-underlay":
      callbacks.drawGraveUnderlay(drawable.entity as PharosVilleWorld["graves"][number]);
      return;
    case "lighthouse-body":
      callbacks.drawLighthouseBody();
      return;
    case "lighthouse-overlay":
      callbacks.drawLighthouseOverlay();
      return;
    case "ship-body":
      callbacks.drawShipBody(drawable.entity as PharosVilleWorld["ships"][number]);
      return;
    case "ship-overlay":
      callbacks.drawShipOverlay(drawable.entity as PharosVilleWorld["ships"][number]);
      return;
    case "ship-wake":
      callbacks.drawShipWake(drawable.entity as PharosVilleWorld["ships"][number]);
      return;
  }
}

function shouldDrawWorldDrawable(input: DrawPharosVilleInput, drawable: WorldDrawableSortFields) {
  if (drawable.detailId && (
    drawable.detailId === input.selectedTarget?.detailId
    || drawable.detailId === input.hoveredTarget?.detailId
  )) {
    return true;
  }
  return isScreenRectInViewport(drawable.screenBounds, input.width, input.height, Math.max(64, 128 * input.camera.zoom));
}

function isScreenRectInViewport(
  rect: { height: number; width: number; x: number; y: number },
  width: number,
  height: number,
  margin: number,
) {
  return (
    rect.x + rect.width >= -margin
    && rect.x <= width + margin
    && rect.y + rect.height >= -margin
    && rect.y <= height + margin
  );
}

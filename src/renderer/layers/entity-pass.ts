import type { PharosVilleWorld } from "../../systems/world-types";
import { drawablePassCounts, sortWorldDrawables, type WorldDrawable, type WorldDrawablePass } from "../drawable-pass";
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

export function drawEntityLayer(
  input: DrawPharosVilleInput,
  cache: RenderFrameCache,
  extraDrawables: readonly WorldDrawable[],
  callbacks: EntityPassCallbacks,
): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  const drawables: WorldDrawable[] = [
    ...extraDrawables,
    ...input.world.docks.flatMap((dock) => [
      ...(callbacks.isBackgroundedHarborDock(dock)
        ? []
        : [entityDrawable(input, cache, callbacks, dock, "body", () => callbacks.drawDockBody(dock))]),
      entityDrawable(input, cache, callbacks, dock, "overlay", () => callbacks.drawDockOverlay(dock)),
    ]),
    ...callbacks.visibleShips.flatMap((ship) => [
      entityDrawable(input, cache, callbacks, ship, "underlay", () => callbacks.drawShipWake(ship)),
      entityDrawable(input, cache, callbacks, ship, "body", () => callbacks.drawShipBody(ship)),
      entityDrawable(input, cache, callbacks, ship, "overlay", () => callbacks.drawShipOverlay(ship)),
    ]),
    ...input.world.graves.flatMap((grave) => [
      entityDrawable(input, cache, callbacks, grave, "underlay", () => callbacks.drawGraveUnderlay(grave)),
      entityDrawable(input, cache, callbacks, grave, "body", () => callbacks.drawGraveBody(grave)),
      entityDrawable(input, cache, callbacks, grave, "overlay", () => callbacks.drawGraveOverlay(grave)),
    ]),
    entityDrawable(input, cache, callbacks, input.world.lighthouse, "body", callbacks.drawLighthouseBody),
    entityDrawable(input, cache, callbacks, input.world.lighthouse, "overlay", callbacks.drawLighthouseOverlay),
  ];

  const visibleDrawables = drawables.filter((drawable) => shouldDrawWorldDrawable(input, drawable));
  const sorted = sortWorldDrawables(visibleDrawables);
  for (const drawable of sorted) drawable.draw(input.ctx);
  return {
    drawableCount: sorted.length,
    drawableCounts: drawablePassCounts(sorted),
  };
}

function entityDrawable(
  input: DrawPharosVilleInput,
  cache: RenderFrameCache,
  callbacks: EntityPassCallbacks,
  entity: WorldSelectableEntity,
  pass: WorldDrawablePass,
  draw: () => void,
): WorldDrawable {
  const geometry = cache.geometryForEntity(entity);
  return {
    depth: geometry.depth,
    detailId: entity.detailId,
    draw,
    entityId: entity.id,
    kind: entity.kind,
    pass,
    screenBounds: entity.kind === "lighthouse" && pass === "overlay"
      ? callbacks.lighthouseOverlayScreenBounds(geometry.selectionRect)
      : geometry.selectionRect,
    tieBreaker: entity.id,
  };
}

function shouldDrawWorldDrawable(input: DrawPharosVilleInput, drawable: WorldDrawable) {
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

import type { PharosVilleWorld } from "../../systems/world-types";
import {
  sortWorldDrawablesInPlace,
  type WorldDrawable,
  type WorldDrawablePass,
  type WorldDrawableSortFields,
} from "../drawable-pass";
import type { RenderFrameCache } from "../frame-cache";
import type { ResolvedEntityGeometry, WorldSelectableEntity } from "../geometry";
import type { DrawPharosVilleInput, PharosVilleRenderMetrics } from "../render-types";
import { planShipRenderLod } from "./ships";

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

const entityDrawablesScratch: EntityPassDrawable[] = [];
const entityDescriptorPool: EntityDrawableDescriptor[] = [];
let entityDescriptorPoolSize = 0;

export function drawEntityLayer(
  input: DrawPharosVilleInput,
  cache: RenderFrameCache,
  extraDrawables: readonly WorldDrawable[],
  callbacks: EntityPassCallbacks,
): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  entityDrawablesScratch.length = 0;
  entityDescriptorPoolSize = 0;
  const visibleDrawables = entityDrawablesScratch;

  for (const drawable of extraDrawables) {
    if (shouldDrawWorldDrawable(input, drawable)) visibleDrawables.push(drawable);
  }

  for (const dock of input.world.docks) {
    const geometry = cache.geometryForEntity(dock);
    if (!callbacks.isBackgroundedHarborDock(dock)) {
      pushEntityDrawable(input, callbacks, visibleDrawables, geometry, dock, "body", "dock-body");
    }
    pushEntityDrawable(input, callbacks, visibleDrawables, geometry, dock, "overlay", "dock-overlay");
  }

  const shipLodPlan = planShipRenderLod(input, cache, callbacks.visibleShips);
  for (const ship of callbacks.visibleShips) {
    const geometry = cache.geometryForEntity(ship);
    if (shipLodPlan.drawWakeShipIds.has(ship.id)) {
      pushEntityDrawable(input, callbacks, visibleDrawables, geometry, ship, "underlay", "ship-wake");
    }
    pushEntityDrawable(input, callbacks, visibleDrawables, geometry, ship, "body", "ship-body");
    if (shipLodPlan.drawOverlayShipIds.has(ship.id)) {
      pushEntityDrawable(input, callbacks, visibleDrawables, geometry, ship, "overlay", "ship-overlay");
    }
  }

  for (const grave of input.world.graves) {
    const geometry = cache.geometryForEntity(grave);
    pushEntityDrawable(input, callbacks, visibleDrawables, geometry, grave, "underlay", "grave-underlay");
    pushEntityDrawable(input, callbacks, visibleDrawables, geometry, grave, "body", "grave-body");
    pushEntityDrawable(input, callbacks, visibleDrawables, geometry, grave, "overlay", "grave-overlay");
  }

  const lighthouseGeometry = cache.geometryForEntity(input.world.lighthouse);
  pushEntityDrawable(input, callbacks, visibleDrawables, lighthouseGeometry, input.world.lighthouse, "body", "lighthouse-body");
  pushEntityDrawable(input, callbacks, visibleDrawables, lighthouseGeometry, input.world.lighthouse, "overlay", "lighthouse-overlay");

  const sorted = sortWorldDrawablesInPlace(visibleDrawables);
  const drawableCounts: Record<WorldDrawablePass, number> = {
    underlay: 0,
    body: 0,
    overlay: 0,
    selection: 0,
  };
  for (const drawable of sorted) {
    drawableCounts[drawable.pass] += 1;
    drawEntityPassDrawable(input.ctx, callbacks, drawable);
  }
  return {
    drawableCount: sorted.length,
    drawableCounts,
  };
}

function pushEntityDrawable(
  input: DrawPharosVilleInput,
  callbacks: EntityPassCallbacks,
  drawables: EntityPassDrawable[],
  geometry: Pick<ResolvedEntityGeometry, "depth" | "selectionRect">,
  entity: WorldSelectableEntity,
  pass: WorldDrawablePass,
  drawAction: EntityDrawAction,
) {
  const screenBounds = entity.kind === "lighthouse" && pass === "overlay"
    ? callbacks.lighthouseOverlayScreenBounds(geometry.selectionRect)
    : geometry.selectionRect;
  const descriptor = acquireEntityDescriptor();
  descriptor.depth = geometry.depth;
  descriptor.detailId = entity.detailId;
  descriptor.drawAction = drawAction;
  descriptor.entityId = entity.id;
  descriptor.entity = entity;
  descriptor.kind = entity.kind;
  descriptor.pass = pass;
  descriptor.screenBounds = screenBounds;
  descriptor.tieBreaker = entity.id;
  if (shouldDrawWorldDrawable(input, descriptor)) drawables.push(descriptor);
}

function acquireEntityDescriptor(): EntityDrawableDescriptor {
  const descriptor = entityDescriptorPool[entityDescriptorPoolSize];
  if (descriptor) {
    entityDescriptorPoolSize += 1;
    return descriptor;
  }
  const created: EntityDrawableDescriptor = {
    depth: 0,
    detailId: undefined,
    drawAction: "dock-body",
    entityId: undefined,
    entity: null as unknown as WorldSelectableEntity,
    kind: "",
    pass: "body",
    screenBounds: { height: 0, width: 0, x: 0, y: 0 },
    tieBreaker: "",
  };
  entityDescriptorPool.push(created);
  entityDescriptorPoolSize += 1;
  return created;
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

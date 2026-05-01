import { manifestCacheVersion } from "../systems/asset-manifest";
import { isShipMapVisible } from "../systems/motion";
import type { PharosVilleWorld } from "../systems/world-types";
import { createRenderFrameCache, type RenderFrameCache } from "./frame-cache";
import { drawAtmosphere, drawBirds, drawDecorativeLights } from "./layers/ambient";
import { drawDockBody, drawDockOverlay, isBackgroundedHarborDock, type DockRenderState } from "./layers/docks";
import { drawGraveBody, drawGraveOverlay, drawGraveUnderlay, type GraveRenderState } from "./layers/graves";
import { sceneryDrawables } from "./layers/scenery";
import { drawShipBody, drawShipOverlay, drawShipWake, type ShipRenderState } from "./layers/ships";
import { drawEntityLayer } from "./layers/entity-pass";
import { drawCemeteryContext, drawCemeteryGround, drawCemeteryMist } from "./layers/cemetery";
import { drawHarborDistrictGround } from "./layers/harbor-district";
import { drawTerrainBase, drawWaterTerrainOverlays } from "./layers/terrain";
import { drawEthereumHarborSigns, drawWaterAreaLabels } from "./layers/water-labels";
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseSurf, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
import { drawSelection } from "./layers/selection";
import { drawCoastalWaterDetails } from "./layers/shoreline";
import { drawSky } from "./layers/sky";
import { drawNightTint } from "./layers/night-tint";
import { skyState } from "./layers/sky";
import type { DrawPharosVilleInput, PharosVilleRenderMetrics } from "./render-types";

export type { DrawPharosVilleInput, PharosVilleCanvasMotion, PharosVilleRenderMetrics } from "./render-types";

interface WorldCanvasFrame {
  cache: RenderFrameCache;
  dockRenderStates: Map<string, DockRenderState>;
  graveRenderStates: Map<string, GraveRenderState>;
  lighthouseRender: LighthouseRenderState;
  shipRenderStates: Map<string, ShipRenderState>;
  visibleShips: PharosVilleWorld["ships"];
}

interface StaticLayerCacheEntry {
  canvas: HTMLCanvasElement;
  key: string;
  lastUsed: number;
}

type StaticCacheScope = "scene" | "terrain";

const STATIC_CACHE_MAX = 4;
const staticLayerCache: { entries: StaticLayerCacheEntry[] } = { entries: [] };

const worldIdMap = new WeakMap<PharosVilleWorld, number>();
let nextWorldId = 1;

function worldIdFor(world: PharosVilleWorld): number {
  let id = worldIdMap.get(world);
  if (id === undefined) {
    id = nextWorldId;
    nextWorldId += 1;
    worldIdMap.set(world, id);
  }
  return id;
}

function assetLoadTickFor(input: DrawPharosVilleInput): number {
  const stats = input.assets?.getLoadStats();
  if (!stats) return 0;
  return stats.criticalLoadedCount * 1_000_003 + stats.deferredLoadedCount;
}

function staticCacheKey(input: DrawPharosVilleInput, dpr: number, scope: StaticCacheScope): string {
  const zoomBucket = (input.camera.zoom * 100) | 0;
  const offsetX = input.camera.offsetX | 0;
  const offsetY = input.camera.offsetY | 0;
  const dprBucket = Math.max(1, Math.round(dpr * 100));
  const width = input.width | 0;
  const height = input.height | 0;
  const manifest = input.assets?.getManifest();
  const cv = manifest ? manifestCacheVersion(manifest) : "0";
  return `${scope}|${worldIdFor(input.world)}|${width}x${height}|z${zoomBucket}|o${offsetX},${offsetY}|d${dprBucket}|a${assetLoadTickFor(input)}|cv${cv}`;
}

function createStaticCacheCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function paintStaticTerrainPass(input: DrawPharosVilleInput) {
  const { ctx } = input;
  ctx.imageSmoothingEnabled = false;
  drawTerrainBase(input);
}

function paintStaticScenePass(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  const { ctx } = input;
  ctx.imageSmoothingEnabled = false;
  drawHarborDistrictGround(input);
  drawBackgroundedHarborDocks(input, frame);
  drawCemeteryGround(input);
  drawLighthouseHeadland(input);
  drawCemeteryContext(input);
}

function drawStaticPassCached(
  input: DrawPharosVilleInput,
  frame: WorldCanvasFrame,
  scope: StaticCacheScope,
  paint: (input: DrawPharosVilleInput, frame: WorldCanvasFrame) => void,
) {
  const { ctx, width, height } = input;
  const dpr = input.dpr && input.dpr > 0 ? input.dpr : 1;
  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  const key = staticCacheKey(input, dpr, scope);

  const cached = staticLayerCache.entries.find((entry) => entry.key === key);
  if (cached) {
    cached.lastUsed = performance.now();
    blitStaticCanvas(ctx, cached.canvas, backingWidth, backingHeight);
    return;
  }

  const reusableEntry = staticLayerCache.entries.length >= STATIC_CACHE_MAX
    ? evictOldestStaticEntry()
    : null;
  const offCanvas = reusableEntry?.canvas ?? createStaticCacheCanvas(backingWidth, backingHeight);
  if (!offCanvas) {
    paint(input, frame);
    return;
  }
  if (offCanvas.width !== backingWidth) offCanvas.width = backingWidth;
  if (offCanvas.height !== backingHeight) offCanvas.height = backingHeight;
  const offCtx = offCanvas.getContext("2d", { alpha: true });
  if (!offCtx) {
    paint(input, frame);
    return;
  }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, backingWidth, backingHeight);
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint({ ...input, ctx: offCtx }, frame);
  blitStaticCanvas(ctx, offCanvas, backingWidth, backingHeight);
  staticLayerCache.entries.push({ canvas: offCanvas, key, lastUsed: performance.now() });
}

function blitStaticCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  backingWidth: number,
  backingHeight: number,
) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, 0, 0, backingWidth, backingHeight);
  ctx.restore();
}

function evictOldestStaticEntry(): StaticLayerCacheEntry | null {
  if (staticLayerCache.entries.length === 0) return null;
  let oldestIndex = 0;
  for (let index = 1; index < staticLayerCache.entries.length; index += 1) {
    if (staticLayerCache.entries[index]!.lastUsed < staticLayerCache.entries[oldestIndex]!.lastUsed) {
      oldestIndex = index;
    }
  }
  return staticLayerCache.entries.splice(oldestIndex, 1)[0] ?? null;
}

export function drawPharosVille(input: DrawPharosVilleInput): PharosVilleRenderMetrics {
  const { ctx } = input;
  const frame = createWorldCanvasFrame(input);
  const { nightFactor } = skyState(input.motion);
  ctx.imageSmoothingEnabled = false;
  drawSky(input, frame.lighthouseRender);

  const visibleTileCount = countVisibleTiles(input);
  drawStaticPassCached(input, frame, "terrain", paintStaticTerrainPass);
  drawWaterTerrainOverlays(input);
  drawStaticPassCached(input, frame, "scene", paintStaticScenePass);
  drawCoastalWaterDetails(input);
  drawLighthouseSurf(input);
  const entityMetrics = drawEntityPass(input, frame, nightFactor);
  drawWaterAreaLabels(input);
  drawEthereumHarborSigns(input);
  drawNightTint(input, nightFactor);
  drawAtmosphere(input, frame.lighthouseRender);
  drawLighthouseNightHighlights(input, frame.lighthouseRender, nightFactor);
  drawDecorativeLights(input);
  drawLighthouseBeamRim(input, frame.visibleShips, frame.lighthouseRender);
  drawCemeteryMist(input);
  drawBirds(input);
  const selectionDrawableCount = drawSelection(input);
  const drawableCounts = {
    ...entityMetrics.drawableCounts,
    selection: selectionDrawableCount,
  };
  return {
    drawableCount: entityMetrics.drawableCount + selectionDrawableCount,
    drawableCounts,
    movingShipCount: Array.from(input.shipMotionSamples?.values() ?? [])
      .filter((sample) => sample.state !== "idle" && sample.state !== "risk-drift" && sample.state !== "moored").length,
    visibleShipCount: frame.visibleShips.length,
    visibleTileCount,
  };
}

function createWorldCanvasFrame(input: DrawPharosVilleInput): WorldCanvasFrame {
  return {
    cache: createRenderFrameCache(input),
    dockRenderStates: new Map(),
    graveRenderStates: new Map(),
    lighthouseRender: lighthouseRenderState(input),
    shipRenderStates: new Map(),
    visibleShips: visibleShipsForFrame(input),
  };
}

function drawBackgroundedHarborDocks(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  for (const dock of input.world.docks) {
    if (isBackgroundedHarborDock(dock)) drawDockBody(input, frame, dock);
  }
}

function drawEntityPass(input: DrawPharosVilleInput, frame: WorldCanvasFrame, nightFactor: number): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  return drawEntityLayer(
    input,
    frame.cache,
    sceneryDrawables(input),
    {
      drawDockBody: (dock) => drawDockBody(input, frame, dock),
      drawDockOverlay: (dock) => drawDockOverlay(input, frame, dock),
      drawGraveBody: (grave) => drawGraveBody(input, frame, grave),
      drawGraveOverlay: (grave) => drawGraveOverlay(input, frame, grave),
      drawGraveUnderlay: (grave) => drawGraveUnderlay(input, frame, grave),
      drawLighthouseBody: () => drawLighthouseBody(input, frame.lighthouseRender),
      drawLighthouseOverlay: () => drawLighthouseOverlay(input, frame.lighthouseRender),
      drawShipBody: (ship) => drawShipBody(input, frame, ship),
      drawShipOverlay: (ship) => drawShipOverlay(input, frame, ship),
      drawShipWake: (ship) => drawShipWake(input, frame, ship),
      isBackgroundedHarborDock,
      lighthouseOverlayScreenBounds: (selectionRect) => lighthouseOverlayScreenBounds(input, selectionRect, frame.lighthouseRender, nightFactor),
      visibleShips: frame.visibleShips,
    },
  );
}

function visibleShipsForFrame(input: DrawPharosVilleInput): PharosVilleWorld["ships"] {
  return input.world.ships.filter((ship) => isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id)));
}

function countVisibleTiles(input: DrawPharosVilleInput): number {
  // Static-pass cache hides terrain's visible-tile count from the metrics path.
  // Re-derive it cheaply via the same viewport-rect projection terrain uses.
  // Cheap approximation: count tiles inside the screen-rect projection bounds.
  const { camera, width, height, world } = input;
  const margin = 2;
  const corners = [
    screenCornerToTile(0, 0, camera),
    screenCornerToTile(width, 0, camera),
    screenCornerToTile(0, height, camera),
    screenCornerToTile(width, height, camera),
  ];
  const minX = Math.max(0, Math.floor(Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x)) - margin);
  const maxX = Math.min(world.map.width - 1, Math.ceil(Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x)) + margin);
  const minY = Math.max(0, Math.floor(Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y)) - margin);
  const maxY = Math.min(world.map.height - 1, Math.ceil(Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y)) + margin);
  if (minX > maxX || minY > maxY) return 0;
  return (maxX - minX + 1) * (maxY - minY + 1);
}

function screenCornerToTile(
  x: number,
  y: number,
  camera: { offsetX: number; offsetY: number; zoom: number },
): { x: number; y: number } {
  // Inline projection inverse to avoid an extra import; matches screenToTile.
  const TILE_W = 32 * camera.zoom;
  const TILE_H = 16 * camera.zoom;
  const localX = x - camera.offsetX;
  const localY = y - camera.offsetY;
  const tileX = (localX / (TILE_W / 2) - localY / (TILE_H / 2)) / 2;
  const tileY = (localX / (TILE_W / 2) + localY / (TILE_H / 2)) / 2;
  return { x: tileX, y: tileY };
}

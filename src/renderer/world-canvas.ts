import { STABLECOIN_SQUADS } from "../systems/maker-squad";
import { manifestCacheVersion } from "../systems/asset-manifest";
import { isShipMapVisible } from "../systems/motion";
import type { PharosVilleWorld } from "../systems/world-types";
import { createRenderFrameCache, type RenderFrameCache } from "./frame-cache";
import { drawAtmosphere, drawBirds, drawBioluminescentSparkles, drawDecorativeLights, drawMoonReflection, drawSeaMist } from "./layers/ambient";
import { drawDockBody, drawDockOverlay, isBackgroundedHarborDock, type DockRenderState } from "./layers/docks";
import { drawGraveBody, drawGraveOverlay, drawGraveUnderlay, type GraveRenderState } from "./layers/graves";
import {
  computeSquadBoundingEllipse,
  computeSquadPennantPath,
  drawSquadPennant,
  drawSquadSelectionHalo,
  type SquadAnchor,
} from "./layers/maker-squad-chrome";
import { drawSceneryProp, sceneryDrawables } from "./layers/scenery";
import { drawYggdrasil } from "./layers/yggdrasil";
import { drawPigeonnier } from "./layers/pigeonnier";
import { drawShipBody, drawShipOverlay, drawShipWake, shipMastTopScreenPoint, type ShipRenderState } from "./layers/ships";
import { drawEntityLayer } from "./layers/entity-pass";
import { drawCemeteryContext, drawCemeteryGround, drawCemeteryMist } from "./layers/cemetery";
import { drawHarborDistrictGround } from "./layers/harbor-district";
import { drawTerrainBase, drawWaterTerrainOverlays } from "./layers/terrain";
import { drawWaterAreaLabels } from "./layers/water-labels";
import { drawCenterCluster } from "./layers/center-cluster";
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseGodRays, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseSurf, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
import { drawSelection } from "./layers/selection";
import { drawCoastalWaterDetails } from "./layers/shoreline";
import { drawSky } from "./layers/sky";
import { drawNightTint, drawNightVignette } from "./layers/night-tint";
import { skyState } from "./layers/sky";
import { drawWeather } from "./layers/weather";
import type { DrawPharosVilleInput, PharosVilleRenderMetrics } from "./render-types";
import { tileBoundsTileCount, visibleTileBoundsForCamera } from "./viewport";

/**
 * Public render-types re-exports. Kept in sync with `render-types.ts`; consumers
 * (canvas host components, tests) import these from `world-canvas` so the
 * module forms a single public surface for the renderer entry point.
 */
export type { DrawPharosVilleInput, PharosVilleCanvasMotion, PharosVilleRenderMetrics } from "./render-types";

interface WorldCanvasFrame {
  dynamicCameraCacheKeySegment: string;
  staticCameraCache: {
    keySegment: string;
    paintCamera: DrawPharosVilleInput["camera"];
    paddingDprPx: number;
    residualOffsetX: number;
    residualOffsetY: number;
  };
  cache: RenderFrameCache;
  dpr: number;
  dockRenderStates: Map<string, DockRenderState>;
  flagshipById: Map<string, PharosVilleWorld["ships"][number]>;
  graveRenderStates: Map<string, GraveRenderState>;
  lighthouseRender: LighthouseRenderState;
  shipRenderStates: Map<string, ShipRenderState>;
  visibleShips: PharosVilleWorld["ships"];
  wakeDrawnShipIds: Set<string>;
}

interface StaticLayerCacheEntry {
  canvas: HTMLCanvasElement;
  key: string;
  lastUsed: number;
}

interface CameraCacheKeyInput {
  dprBucket: number;
  height: number;
  offsetX: number;
  offsetY: number;
  width: number;
  worldId: number;
  zoomBucket: number;
}

interface DynamicLayerCacheEntry {
  canvas: HTMLCanvasElement;
  key: string;
  lastPhaseBucket: number;
  lastUsed: number;
}

type StaticCacheScope = "scene" | "terrain";
type DynamicCacheScope = "water-overlays";

const STATIC_CACHE_MAX = 4;
const DYNAMIC_CACHE_MAX = 4;
const STATIC_CAMERA_OFFSET_BUCKET = 16;
const staticLayerCache: { entries: StaticLayerCacheEntry[] } = { entries: [] };
const dynamicLayerCache: { entries: DynamicLayerCacheEntry[] } = { entries: [] };
let cameraCacheKeyCache: { key: string; input: CameraCacheKeyInput } | null = null;
let staticCameraCacheKeyCache: { key: string; input: CameraCacheKeyInput } | null = null;

const shipRenderStatesScratch = new Map<string, ShipRenderState>();
const wakeDrawnShipIdsScratch = new Set<string>();
const flagshipByIdScratch = new Map<string, PharosVilleWorld["ships"][number]>();
const dockRenderStatesScratch = new Map<string, DockRenderState>();
const graveRenderStatesScratch = new Map<string, GraveRenderState>();
const visibleShipsScratch: PharosVilleWorld["ships"][number][] = [];
const squadAnchorsScratch: SquadAnchor[] = [];

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
  return input.assets?.getAssetLoadProgressKey() ?? 0;
}

function cameraCacheKeySegment(input: DrawPharosVilleInput, dpr: number): string {
  const inputKey: CameraCacheKeyInput = {
    dprBucket: Math.max(1, Math.round(dpr * 100)),
    height: input.height | 0,
    offsetX: input.camera.offsetX | 0,
    offsetY: input.camera.offsetY | 0,
    width: input.width | 0,
    worldId: worldIdFor(input.world),
    zoomBucket: (input.camera.zoom * 100) | 0,
  };
  const cached = cameraCacheKeyCache;
  if (
    cached
    && cached.input.dprBucket === inputKey.dprBucket
    && cached.input.height === inputKey.height
    && cached.input.offsetX === inputKey.offsetX
    && cached.input.offsetY === inputKey.offsetY
    && cached.input.width === inputKey.width
    && cached.input.worldId === inputKey.worldId
    && cached.input.zoomBucket === inputKey.zoomBucket
  ) {
    return cached.key;
  }
  const key = `${inputKey.worldId}|${inputKey.width}x${inputKey.height}|z${inputKey.zoomBucket}|o${inputKey.offsetX},${inputKey.offsetY}|d${inputKey.dprBucket}`;
  cameraCacheKeyCache = { input: inputKey, key };
  return key;
}

function staticCameraCacheForFrame(input: DrawPharosVilleInput, dpr: number) {
  const offsetX = Math.floor(input.camera.offsetX / STATIC_CAMERA_OFFSET_BUCKET) * STATIC_CAMERA_OFFSET_BUCKET;
  const offsetY = Math.floor(input.camera.offsetY / STATIC_CAMERA_OFFSET_BUCKET) * STATIC_CAMERA_OFFSET_BUCKET;
  const residualOffsetX = input.camera.offsetX - offsetX;
  const residualOffsetY = input.camera.offsetY - offsetY;
  const inputKey: CameraCacheKeyInput = {
    dprBucket: Math.max(1, Math.round(dpr * 100)),
    height: input.height | 0,
    offsetX,
    offsetY,
    width: input.width | 0,
    worldId: worldIdFor(input.world),
    zoomBucket: (input.camera.zoom * 100) | 0,
  };
  const cached = staticCameraCacheKeyCache;
  if (
    cached
    && cached.input.dprBucket === inputKey.dprBucket
    && cached.input.height === inputKey.height
    && cached.input.offsetX === inputKey.offsetX
    && cached.input.offsetY === inputKey.offsetY
    && cached.input.width === inputKey.width
    && cached.input.worldId === inputKey.worldId
    && cached.input.zoomBucket === inputKey.zoomBucket
  ) {
    return {
      ...cached,
      keySegment: cached.key,
      paintCamera: {
        ...input.camera,
        offsetX,
        offsetY,
      },
      paddingDprPx: STATIC_CAMERA_OFFSET_BUCKET * Math.max(1, Math.round(dpr * 100)) / 100,
      residualOffsetX,
      residualOffsetY,
    };
  }
  const key = `${inputKey.worldId}|${inputKey.width}x${inputKey.height}|z${inputKey.zoomBucket}|o${inputKey.offsetX},${inputKey.offsetY}|d${inputKey.dprBucket}`;
  const keySegment = key;
  staticCameraCacheKeyCache = { input: inputKey, key };
  return {
    keySegment,
    paintCamera: {
      ...input.camera,
      offsetX,
      offsetY,
    },
    paddingDprPx: STATIC_CAMERA_OFFSET_BUCKET * Math.max(1, Math.round(dpr * 100)) / 100,
    residualOffsetX,
    residualOffsetY,
  };
}

/**
 * Builds the static-layer cache key. `manifestCacheVersion` is folded in so a
 * bump to `style.cacheVersion` in `public/pharosville/assets/manifest.json`
 * invalidates the in-memory `staticLayerCache` (terrain + scene off-screen
 * canvases) — without it, repromoted asset bytes would still be served from
 * the browser HTTP cache miss path but rendered from a stale offscreen bitmap.
 * See `docs/pharosville/ASSET_PIPELINE.md` (manifest schema v2).
 */
function staticCacheKey(input: DrawPharosVilleInput, scope: StaticCacheScope, cameraCacheKeySegment: string): string {
  const manifest = input.assets?.getManifest();
  const cv = manifest ? manifestCacheVersion(manifest) : "0";
  return `${scope}|${cameraCacheKeySegment}|a${assetLoadTickFor(input)}|cv${cv}`;
}

function dynamicCacheKey(scope: DynamicCacheScope, cameraCacheKeySegment: string): string {
  return `${scope}|${cameraCacheKeySegment}`;
}

function dynamicWaterPhaseBucket(input: DrawPharosVilleInput): number {
  if (input.motion.reducedMotion) return 0;
  // 10 Hz is visually indistinguishable from 24 Hz for the sin-modulated
  // water overlays but cuts dynamic-cache repaint cost by ~58%.
  const cadenceHz = 10;
  return Math.floor(input.motion.timeSeconds * cadenceHz);
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
  drawYggdrasil(input);
  drawCemeteryGround(input);
  drawCenterCluster(input);
  drawLighthouseHeadland(input);
  drawCemeteryContext(input);
}

function paintDynamicWaterPass(input: DrawPharosVilleInput) {
  const { ctx } = input;
  ctx.imageSmoothingEnabled = false;
  drawWaterTerrainOverlays(input);
  drawCoastalWaterDetails(input);
}

function drawStaticPassCached(
  input: DrawPharosVilleInput,
  frame: WorldCanvasFrame,
  scope: StaticCacheScope,
  paint: (input: DrawPharosVilleInput, frame: WorldCanvasFrame) => void,
) {
  const { ctx, width, height } = input;
  const { staticCameraCache: staticCamera, dpr } = frame;
  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  const key = staticCacheKey(input, scope, staticCamera.keySegment);
  const cachedPad = staticCamera.paddingDprPx;
  const backingPadWidth = Math.max(0, Math.round(cachedPad));
  const backingPadHeight = Math.max(0, Math.round(cachedPad));
  const cachedWidth = backingWidth + backingPadWidth * 2;
  const cachedHeight = backingHeight + backingPadHeight * 2;
  const paintInput = {
    ...input,
    camera: staticCamera.paintCamera,
  };
  const sourceX = Math.max(0, Math.min(backingPadWidth, backingPadWidth - Math.round(staticCamera.residualOffsetX * dpr)));
  const sourceY = Math.max(0, Math.min(backingPadHeight, backingPadHeight - Math.round(staticCamera.residualOffsetY * dpr)));

  const cached = staticLayerCache.entries.find((entry) => entry.key === key);
  if (cached) {
    cached.lastUsed = performance.now();
    blitStaticCanvas(ctx, cached.canvas, backingWidth, backingHeight, sourceX, sourceY);
    return;
  }

  const reusableEntry = staticLayerCache.entries.length >= STATIC_CACHE_MAX
    ? evictOldestStaticEntry()
    : null;
  const offCanvas = reusableEntry?.canvas ?? createStaticCacheCanvas(cachedWidth, cachedHeight);
  if (!offCanvas) {
    paint(paintInput, frame);
    return;
  }
  if (offCanvas.width !== cachedWidth) offCanvas.width = cachedWidth;
  if (offCanvas.height !== cachedHeight) offCanvas.height = cachedHeight;
  const offCtx = offCanvas.getContext("2d", { alpha: true });
  if (!offCtx) {
    paint(paintInput, frame);
    return;
  }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, cachedWidth, cachedHeight);
  offCtx.setTransform(dpr, 0, 0, dpr, backingPadWidth, backingPadHeight);
  paint({ ...paintInput, ctx: offCtx }, frame);
  blitStaticCanvas(ctx, offCanvas, backingWidth, backingHeight, sourceX, sourceY);
  staticLayerCache.entries.push({ canvas: offCanvas, key, lastUsed: performance.now() });
}

function drawDynamicPassCached(
  input: DrawPharosVilleInput,
  frame: WorldCanvasFrame,
  scope: DynamicCacheScope,
  paint: (input: DrawPharosVilleInput) => void,
) {
  const { ctx, width, height } = input;
  const { dynamicCameraCacheKeySegment, dpr } = frame;
  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  const key = dynamicCacheKey(scope, dynamicCameraCacheKeySegment);
  const phaseBucket = dynamicWaterPhaseBucket(input);

  const cached = dynamicLayerCache.entries.find((entry) => entry.key === key);
  if (cached && cached.lastPhaseBucket === phaseBucket) {
    cached.lastUsed = performance.now();
    blitStaticCanvas(ctx, cached.canvas, backingWidth, backingHeight);
    return;
  }

  const targetEntry = cached ?? prepareDynamicCacheEntry(key, backingWidth, backingHeight);
  if (!targetEntry) {
    paint(input);
    return;
  }

  const offCtx = targetEntry.canvas.getContext("2d", { alpha: true });
  if (!offCtx) {
    paint(input);
    return;
  }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, backingWidth, backingHeight);
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paint({ ...input, ctx: offCtx });

  targetEntry.lastPhaseBucket = phaseBucket;
  targetEntry.lastUsed = performance.now();
  blitStaticCanvas(ctx, targetEntry.canvas, backingWidth, backingHeight);
}

function prepareDynamicCacheEntry(key: string, backingWidth: number, backingHeight: number): DynamicLayerCacheEntry | null {
  const reusableEntry = dynamicLayerCache.entries.length >= DYNAMIC_CACHE_MAX
    ? evictOldestDynamicEntry()
    : null;
  const offCanvas = reusableEntry?.canvas ?? createStaticCacheCanvas(backingWidth, backingHeight);
  if (!offCanvas) return null;
  if (offCanvas.width !== backingWidth) offCanvas.width = backingWidth;
  if (offCanvas.height !== backingHeight) offCanvas.height = backingHeight;
  const nextEntry: DynamicLayerCacheEntry = reusableEntry
    ? { ...reusableEntry, canvas: offCanvas, key, lastPhaseBucket: Number.NaN, lastUsed: performance.now() }
    : { canvas: offCanvas, key, lastPhaseBucket: Number.NaN, lastUsed: performance.now() };
  dynamicLayerCache.entries.push(nextEntry);
  return nextEntry;
}

function blitStaticCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  backingWidth: number,
  backingHeight: number,
  sourceX = 0,
  sourceY = 0,
) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(canvas, sourceX, sourceY, backingWidth, backingHeight, 0, 0, backingWidth, backingHeight);
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

function evictOldestDynamicEntry(): DynamicLayerCacheEntry | null {
  if (dynamicLayerCache.entries.length === 0) return null;
  let oldestIndex = 0;
  for (let index = 1; index < dynamicLayerCache.entries.length; index += 1) {
    if (dynamicLayerCache.entries[index]!.lastUsed < dynamicLayerCache.entries[oldestIndex]!.lastUsed) {
      oldestIndex = index;
    }
  }
  return dynamicLayerCache.entries.splice(oldestIndex, 1)[0] ?? null;
}

/**
 * Renderer entry point: draws one PharosVille frame to `input.ctx` in layer
 * order (sky, cached terrain + water + scene, lighthouse, entities, squad
 * chrome, water labels, ambient/night/weather, selection) and returns metrics
 * (drawable + visible counts) for HUD overlays and perf telemetry.
 */
export function drawPharosVille(input: DrawPharosVilleInput): PharosVilleRenderMetrics {
  const { ctx } = input;
  const frame = createWorldCanvasFrame(input);
  const { nightFactor } = skyState(input.motion);
  ctx.imageSmoothingEnabled = false;
  drawSky(input, frame.lighthouseRender);

  const visibleTileCount = countVisibleTiles(input);
  drawStaticPassCached(input, frame, "terrain", paintStaticTerrainPass);
  drawDynamicPassCached(input, frame, "water-overlays", paintDynamicWaterPass);
  drawStaticPassCached(input, frame, "scene", paintStaticScenePass);
  drawLighthouseSurf(input);
  const entityMetrics = drawEntityPass(input, frame, nightFactor);
  drawSquadChrome(input, frame);
  drawWaterAreaLabels(input);
  drawNightTint(input, nightFactor);
  drawAtmosphere(input, frame.lighthouseRender);
  drawLighthouseNightHighlights(input, frame.lighthouseRender, nightFactor);
  drawBioluminescentSparkles(input, nightFactor, frame.lighthouseRender);
  drawMoonReflection(input, nightFactor);
  drawSeaMist(input, nightFactor);
  drawDecorativeLights(input);
  drawLighthouseBeamRim(input, frame.visibleShips, frame.lighthouseRender, nightFactor);
  drawLighthouseGodRays(input.ctx, frame.lighthouseRender.firePoint, input.camera.zoom * 1.35, input.motion, nightFactor);
  drawCemeteryMist(input);
  drawBirds(input);
  // Lightning flashes over WARNING/DANGER zones. Placed after night-tint and
  // ambient atmosphere so the flash visibly punches through the dim, but
  // before the night vignette / selection chrome which are UI overlays.
  drawWeather(input);
  drawNightVignette(input, nightFactor);
  const selectionDrawableCount = drawSelection(input);
  const drawableCounts = {
    ...entityMetrics.drawableCounts,
    selection: selectionDrawableCount,
  };
  let movingShipCount = 0;
  if (input.shipMotionSamples) {
    for (const sample of input.shipMotionSamples.values()) {
      if (sample.state !== "idle" && sample.state !== "risk-drift" && sample.state !== "moored") {
        movingShipCount += 1;
      }
    }
  }
  return {
    drawableCount: entityMetrics.drawableCount + selectionDrawableCount,
    drawableCounts,
    movingShipCount,
    visibleShipCount: frame.visibleShips.length,
    visibleTileCount,
  };
}

function createWorldCanvasFrame(input: DrawPharosVilleInput): WorldCanvasFrame {
  const dpr = input.dpr && input.dpr > 0 ? input.dpr : 1;
  shipRenderStatesScratch.clear();
  wakeDrawnShipIdsScratch.clear();
  flagshipByIdScratch.clear();
  dockRenderStatesScratch.clear();
  graveRenderStatesScratch.clear();
  const visibleShips = visibleShipsForFrame(input);
  for (const ship of visibleShips) {
    if (ship.squadId && ship.squadRole === "flagship") {
      flagshipByIdScratch.set(ship.squadId, ship);
    }
  }
  return {
    dynamicCameraCacheKeySegment: cameraCacheKeySegment(input, dpr),
    staticCameraCache: staticCameraCacheForFrame(input, dpr),
    dpr,
    cache: createRenderFrameCache(input),
    dockRenderStates: dockRenderStatesScratch,
    graveRenderStates: graveRenderStatesScratch,
    lighthouseRender: lighthouseRenderState(input),
    shipRenderStates: shipRenderStatesScratch,
    visibleShips,
    wakeDrawnShipIds: wakeDrawnShipIdsScratch,
    flagshipById: flagshipByIdScratch,
  };
}

function drawBackgroundedHarborDocks(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  for (const dock of input.world.docks) {
    if (isBackgroundedHarborDock(dock)) drawDockBody(input, frame, dock);
  }
}

function drawSquadChrome(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  // Draw a separate pennant + halo per active squad so Sky and Maker each
  // get their own streamer rather than one polyline crossing the harbor.
  const selectedId = input.selectedTarget?.id ?? null;
  const anchors = squadAnchorsScratch;
  for (const squad of STABLECOIN_SQUADS) {
    anchors.length = 0;
    let selectedIsSquad = false;
    for (const ship of frame.visibleShips) {
      if (ship.squadId !== squad.id) continue;
      anchors.push({
        id: ship.id,
        mastTop: shipMastTopScreenPoint(input, frame, ship),
      });
      if (selectedId && ship.id === selectedId) selectedIsSquad = true;
    }
    if (anchors.length === 0) continue;
    const path = computeSquadPennantPath(anchors, squad.displayOrder);
    if (path) drawSquadPennant(input.ctx, path);
    if (selectedIsSquad) {
      const ellipse = computeSquadBoundingEllipse(anchors);
      if (ellipse) drawSquadSelectionHalo(input.ctx, ellipse);
    }
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
      drawLighthouseOverlay: () => drawLighthouseOverlay(input, frame.lighthouseRender, nightFactor),
      drawPigeonnierBody: () => drawPigeonnier(input),
      drawSceneryProp: (prop) => drawSceneryProp(input, prop),
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
  visibleShipsScratch.length = 0;
  for (const ship of input.world.ships) {
    if (isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id))) {
      visibleShipsScratch.push(ship);
    }
  }
  return visibleShipsScratch;
}

function countVisibleTiles(input: DrawPharosVilleInput): number {
  // Static-pass caching bypasses terrain's direct visible-tile metrics path.
  // Recompute from the same shared viewport/tile helper terrain now uses.
  const bounds = visibleTileBoundsForCamera({
    camera: input.camera,
    mapHeight: input.world.map.height,
    mapWidth: input.world.map.width,
    tileMargin: 2,
    viewportHeight: input.height,
    viewportWidth: input.width,
  }, input.visibleTileBoundsCache);
  return tileBoundsTileCount(bounds);
}

import { STABLECOIN_SQUADS } from "../systems/maker-squad";
import { manifestCacheVersion } from "../systems/asset-manifest";
import {
  MAX_MAIN_CANVAS_PIXELS,
  MAX_TOTAL_BACKING_PIXELS,
  canvasPixelArea,
  resolveCanvasBackingPixelMetrics,
} from "../systems/canvas-budget";
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
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseGodRays, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseReflection, drawLighthouseSurf, drawLighthouseThunderRim, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
import { drawSelection } from "./layers/selection";
import { drawCoastalWaterDetails } from "./layers/shoreline";
import { drawSky } from "./layers/sky";
import { drawNightTint, drawNightVignette } from "./layers/night-tint";
import { skyState } from "./layers/sky";
import { drawWeather } from "./layers/weather";
import { drawAtmosphericFade, drawCloudShadowDrift, drawEstablishingShotLetterbox, drawFilmGrainPass } from "./layers/cinematic-atmosphere";
import type {
  DrawPharosVilleInput,
  PharosVilleRenderCacheMetrics,
  PharosVilleRenderCacheMode,
  PharosVilleRenderMetrics,
  PharosVilleRenderZoomKeyMode,
} from "./render-types";
import { tileBoundsTileCount, visibleTileBoundsForCamera } from "./viewport";

/**
 * Public render-types re-exports. Kept in sync with `render-types.ts`; consumers
 * (canvas host components, tests) import these from `world-canvas` so the
 * module forms a single public surface for the renderer entry point.
 */
export type {
  DrawPharosVilleInput,
  PharosVilleBackingMetrics,
  PharosVilleCanvasMotion,
  PharosVilleRenderCacheMetrics,
  PharosVilleRenderCacheMode,
  PharosVilleRenderMetrics,
} from "./render-types";

interface WorldCanvasFrame {
  cacheMode: PharosVilleRenderCacheMode;
  cacheStats: RenderCacheFrameStats;
  cache: RenderFrameCache;
  dpr: number;
  dynamicCameraCache: CameraCacheFrame;
  dockRenderStates: Map<string, DockRenderState>;
  flagshipById: Map<string, PharosVilleWorld["ships"][number]>;
  graveRenderStates: Map<string, GraveRenderState>;
  lighthouseRender: LighthouseRenderState;
  protectedCacheEntryKeys: Set<string>;
  shipRenderStates: Map<string, ShipRenderState>;
  staticCameraCache: CameraCacheFrame;
  visibleShips: PharosVilleWorld["ships"];
  wakeDrawnShipIds: Set<string>;
  zoomKeyMode: PharosVilleRenderZoomKeyMode;
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
  zoomKey: string;
}

interface DynamicLayerCacheEntry {
  canvas: HTMLCanvasElement;
  key: string;
  lastPhaseBucket: number;
  lastUsed: number;
}

type StaticCacheScope = "scene" | "terrain";
type DynamicCacheScope = "water-overlays";

const STATIC_CAMERA_OFFSET_BUCKET = 16;
const DYNAMIC_CAMERA_OFFSET_BUCKET = 16;
const DYNAMIC_WATER_CADENCE_HZ = 15;
const DEFAULT_RENDER_CACHE_MODE: PharosVilleRenderCacheMode = "exact-zoom";
const staticLayerCache: { entries: StaticLayerCacheEntry[] } = { entries: [] };
const dynamicLayerCache: { entries: DynamicLayerCacheEntry[] } = { entries: [] };
let staticCameraCacheKeyCache: { key: string; input: CameraCacheKeyInput } | null = null;
let dynamicCameraCacheKeyCache: { key: string; input: CameraCacheKeyInput } | null = null;
let cacheGenerationKey: string | null = null;

interface CameraCacheFrame {
  keySegment: string;
  offsetBucketPx: number;
  paddingDprPx: number;
  paintCamera: DrawPharosVilleInput["camera"];
  residualOffsetX: number;
  residualOffsetY: number;
}

interface RenderCacheFrameStats {
  budgetEvictionCount: number;
  budgetSkipCount: number;
  dynamicHitCount: number;
  dynamicMissCount: number;
  dynamicRepaintCount: number;
  staticHitCount: number;
  staticMissCount: number;
}

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

function resolveRenderCacheMode(input: DrawPharosVilleInput): PharosVilleRenderCacheMode {
  return input.cacheMode ?? DEFAULT_RENDER_CACHE_MODE;
}

function zoomCacheKey(zoom: number, cacheMode: PharosVilleRenderCacheMode): string {
  const safeZoom = Number.isFinite(zoom) ? Math.max(0, zoom) : 1;
  if (cacheMode === "bucketed") return `b${(safeZoom * 100) | 0}`;
  return `x${safeZoom.toFixed(5)}`;
}

function zoomKeyModeFor(cacheMode: PharosVilleRenderCacheMode): PharosVilleRenderZoomKeyMode {
  return cacheMode === "bucketed" ? "bucketed-percent" : "exact";
}

function cameraCacheKeySegment(
  input: DrawPharosVilleInput,
  dpr: number,
  cacheMode: PharosVilleRenderCacheMode,
  offsetBucketPx: number,
  cacheRef: "dynamic" | "static",
): CameraCacheFrame {
  const offsetX = Math.floor(input.camera.offsetX / offsetBucketPx) * offsetBucketPx;
  const offsetY = Math.floor(input.camera.offsetY / offsetBucketPx) * offsetBucketPx;
  const residualOffsetX = input.camera.offsetX - offsetX;
  const residualOffsetY = input.camera.offsetY - offsetY;
  const inputKey: CameraCacheKeyInput = {
    dprBucket: Math.max(1, Math.round(dpr * 100)),
    height: input.height | 0,
    offsetX,
    offsetY,
    width: input.width | 0,
    worldId: worldIdFor(input.world),
    zoomKey: zoomCacheKey(input.camera.zoom, cacheMode),
  };
  const cached = cacheRef === "static"
    ? staticCameraCacheKeyCache
    : dynamicCameraCacheKeyCache;
  if (
    cached
    && cached.input.dprBucket === inputKey.dprBucket
    && cached.input.height === inputKey.height
    && cached.input.offsetX === inputKey.offsetX
    && cached.input.offsetY === inputKey.offsetY
    && cached.input.width === inputKey.width
    && cached.input.worldId === inputKey.worldId
    && cached.input.zoomKey === inputKey.zoomKey
  ) {
    return {
      keySegment: cached.key,
      offsetBucketPx,
      paddingDprPx: offsetBucketPx * inputKey.dprBucket / 100,
      paintCamera: {
        ...input.camera,
        offsetX,
        offsetY,
      },
      residualOffsetX,
      residualOffsetY,
    };
  }
  const key = `${inputKey.worldId}|${inputKey.width}x${inputKey.height}|z${inputKey.zoomKey}|o${inputKey.offsetX},${inputKey.offsetY}|d${inputKey.dprBucket}`;
  if (cacheRef === "static") {
    staticCameraCacheKeyCache = { input: inputKey, key };
  } else {
    dynamicCameraCacheKeyCache = { input: inputKey, key };
  }
  return {
    keySegment: key,
    offsetBucketPx,
    paddingDprPx: offsetBucketPx * inputKey.dprBucket / 100,
    paintCamera: {
      ...input.camera,
      offsetX,
      offsetY,
    },
    residualOffsetX,
    residualOffsetY,
  };
}

function staticCameraCacheForFrame(
  input: DrawPharosVilleInput,
  dpr: number,
  cacheMode: PharosVilleRenderCacheMode,
): CameraCacheFrame {
  return cameraCacheKeySegment(input, dpr, cacheMode, STATIC_CAMERA_OFFSET_BUCKET, "static");
}

function dynamicCameraCacheForFrame(
  input: DrawPharosVilleInput,
  dpr: number,
  cacheMode: PharosVilleRenderCacheMode,
): CameraCacheFrame {
  return cameraCacheKeySegment(input, dpr, cacheMode, DYNAMIC_CAMERA_OFFSET_BUCKET, "dynamic");
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
  const cv = manifestCacheVersionForInput(input);
  return `${scope}|${cameraCacheKeySegment}|a${assetLoadTickFor(input)}|cv${cv}`;
}

function dynamicCacheKey(scope: DynamicCacheScope, cameraCacheKeySegment: string): string {
  return `${scope}|${cameraCacheKeySegment}`;
}

function dynamicWaterPhaseBucket(input: DrawPharosVilleInput): number {
  if (input.motion.reducedMotion) return 0;
  // Pan-friendly cache bucketing keeps small camera moves from repainting this
  // layer, which leaves enough headroom to raise the whole-water cadence above
  // the old 10 Hz step without touching terrain internals.
  return Math.floor(input.motion.timeSeconds * DYNAMIC_WATER_CADENCE_HZ);
}

function createStaticCacheCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function mainBackingPixelsForInput(input: DrawPharosVilleInput, dpr: number): number {
  return canvasPixelArea(Math.max(1, Math.round(input.width * dpr)), Math.max(1, Math.round(input.height * dpr)));
}

function cacheCanvasPixels(canvas: HTMLCanvasElement): number {
  return canvasPixelArea(canvas.width, canvas.height);
}

function staticCachePixels(): number {
  let pixels = 0;
  for (const entry of staticLayerCache.entries) pixels += cacheCanvasPixels(entry.canvas);
  return pixels;
}

function dynamicCachePixels(): number {
  let pixels = 0;
  for (const entry of dynamicLayerCache.entries) pixels += cacheCanvasPixels(entry.canvas);
  return pixels;
}

function totalOffscreenCachePixels(): number {
  return staticCachePixels() + dynamicCachePixels();
}

function cacheEntryId(kind: "dynamic" | "static", key: string): string {
  return `${kind}:${key}`;
}

function manifestCacheVersionForInput(input: DrawPharosVilleInput): string {
  const manifest = input.assets?.getManifest();
  return manifest ? manifestCacheVersion(manifest) : "0";
}

function ensureRendererCacheGeneration(input: DrawPharosVilleInput, dpr: number): void {
  const dprBucket = Math.max(1, Math.round(dpr * 100));
  const nextGenerationKey = [
    worldIdFor(input.world),
    `${input.width | 0}x${input.height | 0}`,
    `d${dprBucket}`,
    `m${resolveRenderCacheMode(input)}`,
    `a${assetLoadTickFor(input)}`,
    `cv${manifestCacheVersionForInput(input)}`,
  ].join("|");
  if (cacheGenerationKey === nextGenerationKey) return;
  clearRendererCaches();
  cacheGenerationKey = nextGenerationKey;
}

function clearRendererCaches(): void {
  staticLayerCache.entries = [];
  dynamicLayerCache.entries = [];
  staticCameraCacheKeyCache = null;
  dynamicCameraCacheKeyCache = null;
}

function reserveCacheCanvas(input: {
  candidateHeight: number;
  candidateWidth: number;
  frame: WorldCanvasFrame;
  mainCanvasPixels: number;
}): HTMLCanvasElement | null {
  const candidatePixels = canvasPixelArea(input.candidateWidth, input.candidateHeight);
  const availableOffscreenPixels = Math.max(0, MAX_TOTAL_BACKING_PIXELS - input.mainCanvasPixels);
  if (candidatePixels <= 0 || candidatePixels > availableOffscreenPixels) {
    input.frame.cacheStats.budgetSkipCount += 1;
    return null;
  }

  let reusableCanvas: HTMLCanvasElement | null = null;
  while (input.mainCanvasPixels + totalOffscreenCachePixels() + candidatePixels > MAX_TOTAL_BACKING_PIXELS) {
    const evicted = evictOldestCacheEntry(input.frame.protectedCacheEntryKeys);
    if (!evicted) {
      input.frame.cacheStats.budgetSkipCount += 1;
      return null;
    }
    input.frame.cacheStats.budgetEvictionCount += 1;
    if (!reusableCanvas) reusableCanvas = evicted.canvas;
  }

  return reusableCanvas ?? createStaticCacheCanvas(input.candidateWidth, input.candidateHeight);
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
    frame.cacheStats.staticHitCount += 1;
    frame.protectedCacheEntryKeys.add(cacheEntryId("static", cached.key));
    blitStaticCanvas(ctx, cached.canvas, backingWidth, backingHeight, sourceX, sourceY);
    return;
  }
  frame.cacheStats.staticMissCount += 1;

  const offCanvas = reserveCacheCanvas({
    candidateHeight: cachedHeight,
    candidateWidth: cachedWidth,
    frame,
    mainCanvasPixels: mainBackingPixelsForInput(input, dpr),
  });
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
  frame.protectedCacheEntryKeys.add(cacheEntryId("static", key));
}

function drawDynamicPassCached(
  input: DrawPharosVilleInput,
  frame: WorldCanvasFrame,
  scope: DynamicCacheScope,
  paint: (input: DrawPharosVilleInput) => void,
) {
  const { ctx, width, height } = input;
  const { dynamicCameraCache: dynamicCamera, dpr } = frame;
  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  const key = dynamicCacheKey(scope, dynamicCamera.keySegment);
  const phaseBucket = dynamicWaterPhaseBucket(input);
  const cachedPad = dynamicCamera.paddingDprPx;
  const backingPadWidth = Math.max(0, Math.round(cachedPad));
  const backingPadHeight = Math.max(0, Math.round(cachedPad));
  const cachedWidth = backingWidth + backingPadWidth * 2;
  const cachedHeight = backingHeight + backingPadHeight * 2;
  const paintInput = {
    ...input,
    camera: dynamicCamera.paintCamera,
  };
  const sourceX = Math.max(0, Math.min(backingPadWidth, backingPadWidth - Math.round(dynamicCamera.residualOffsetX * dpr)));
  const sourceY = Math.max(0, Math.min(backingPadHeight, backingPadHeight - Math.round(dynamicCamera.residualOffsetY * dpr)));

  const cached = dynamicLayerCache.entries.find((entry) => entry.key === key);
  if (cached && cached.lastPhaseBucket === phaseBucket) {
    cached.lastUsed = performance.now();
    frame.cacheStats.dynamicHitCount += 1;
    frame.protectedCacheEntryKeys.add(cacheEntryId("dynamic", cached.key));
    blitStaticCanvas(ctx, cached.canvas, backingWidth, backingHeight, sourceX, sourceY);
    return;
  }
  frame.cacheStats.dynamicMissCount += 1;

  const targetEntry = cached ?? prepareDynamicCacheEntry(key, cachedWidth, cachedHeight, frame, mainBackingPixelsForInput(input, dpr));
  if (!targetEntry) {
    paint(input);
    return;
  }
  frame.protectedCacheEntryKeys.add(cacheEntryId("dynamic", targetEntry.key));

  const offCtx = targetEntry.canvas.getContext("2d", { alpha: true });
  if (!offCtx) {
    paint(input);
    return;
  }
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, cachedWidth, cachedHeight);
  offCtx.setTransform(dpr, 0, 0, dpr, backingPadWidth, backingPadHeight);
  paint({ ...paintInput, ctx: offCtx });

  targetEntry.lastPhaseBucket = phaseBucket;
  targetEntry.lastUsed = performance.now();
  frame.cacheStats.dynamicRepaintCount += 1;
  blitStaticCanvas(ctx, targetEntry.canvas, backingWidth, backingHeight, sourceX, sourceY);
}

function prepareDynamicCacheEntry(
  key: string,
  backingWidth: number,
  backingHeight: number,
  frame: WorldCanvasFrame,
  mainCanvasPixels: number,
): DynamicLayerCacheEntry | null {
  const offCanvas = reserveCacheCanvas({
    candidateHeight: backingHeight,
    candidateWidth: backingWidth,
    frame,
    mainCanvasPixels,
  });
  if (!offCanvas) return null;
  if (offCanvas.width !== backingWidth) offCanvas.width = backingWidth;
  if (offCanvas.height !== backingHeight) offCanvas.height = backingHeight;
  const nextEntry: DynamicLayerCacheEntry = { canvas: offCanvas, key, lastPhaseBucket: Number.NaN, lastUsed: performance.now() };
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

function evictOldestCacheEntry(protectedEntryKeys: ReadonlySet<string>): { canvas: HTMLCanvasElement } | null {
  let oldestKind: "dynamic" | "static" | null = null;
  let oldestIndex = -1;
  let oldestLastUsed = Number.POSITIVE_INFINITY;
  for (let index = 0; index < staticLayerCache.entries.length; index += 1) {
    const entry = staticLayerCache.entries[index]!;
    if (protectedEntryKeys.has(cacheEntryId("static", entry.key))) continue;
    if (entry.lastUsed < oldestLastUsed) {
      oldestKind = "static";
      oldestIndex = index;
      oldestLastUsed = entry.lastUsed;
    }
  }
  for (let index = 0; index < dynamicLayerCache.entries.length; index += 1) {
    const entry = dynamicLayerCache.entries[index]!;
    if (protectedEntryKeys.has(cacheEntryId("dynamic", entry.key))) continue;
    if (entry.lastUsed < oldestLastUsed) {
      oldestKind = "dynamic";
      oldestIndex = index;
      oldestLastUsed = entry.lastUsed;
    }
  }
  if (oldestKind === "static") {
    const entry = staticLayerCache.entries.splice(oldestIndex, 1)[0];
    return entry ? { canvas: entry.canvas } : null;
  }
  if (oldestKind === "dynamic") {
    const entry = dynamicLayerCache.entries.splice(oldestIndex, 1)[0];
    return entry ? { canvas: entry.canvas } : null;
  }
  return null;
}

function createRenderCacheFrameStats(): RenderCacheFrameStats {
  return {
    budgetEvictionCount: 0,
    budgetSkipCount: 0,
    dynamicHitCount: 0,
    dynamicMissCount: 0,
    dynamicRepaintCount: 0,
    staticHitCount: 0,
    staticMissCount: 0,
  };
}

function renderCacheMetricsForFrame(frame: WorldCanvasFrame): PharosVilleRenderCacheMetrics {
  return {
    ...frame.cacheStats,
    cacheMode: frame.cacheMode,
    dynamicCameraOffsetBucketPx: DYNAMIC_CAMERA_OFFSET_BUCKET,
    dynamicWaterCadenceHz: DYNAMIC_WATER_CADENCE_HZ,
    staticCameraOffsetBucketPx: STATIC_CAMERA_OFFSET_BUCKET,
    zoomKeyMode: frame.zoomKeyMode,
  };
}

function backingMetricsForInput(input: DrawPharosVilleInput, dpr: number) {
  return resolveCanvasBackingPixelMetrics({
    dynamicCacheEntryCount: dynamicLayerCache.entries.length,
    dynamicCachePixels: dynamicCachePixels(),
    mainCanvasPixels: mainBackingPixelsForInput(input, dpr),
    maxMainCanvasPixels: MAX_MAIN_CANVAS_PIXELS,
    maxTotalBackingPixels: MAX_TOTAL_BACKING_PIXELS,
    staticCacheEntryCount: staticLayerCache.entries.length,
    staticCachePixels: staticCachePixels(),
  });
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
  drawAtmosphericFade(input, nightFactor);
  drawStaticPassCached(input, frame, "scene", paintStaticScenePass);
  drawLighthouseSurf(input);
  drawLighthouseReflection(input, frame.lighthouseRender, nightFactor);
  const entityMetrics = drawEntityPass(input, frame, nightFactor);
  drawSquadChrome(input, frame);
  drawCloudShadowDrift(input, nightFactor);
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
  drawLighthouseThunderRim(input, frame.lighthouseRender, nightFactor);
  drawNightVignette(input, nightFactor);
  const selectionDrawableCount = drawSelection(input);
  drawEstablishingShotLetterbox(input);
  drawFilmGrainPass(input);
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
    backing: backingMetricsForInput(input, frame.dpr),
    cache: renderCacheMetricsForFrame(frame),
    drawableCount: entityMetrics.drawableCount + selectionDrawableCount,
    drawableCounts,
    movingShipCount,
    visibleShipCount: frame.visibleShips.length,
    visibleTileCount,
  };
}

function createWorldCanvasFrame(input: DrawPharosVilleInput): WorldCanvasFrame {
  const dpr = input.dpr && input.dpr > 0 ? input.dpr : 1;
  ensureRendererCacheGeneration(input, dpr);
  const cacheMode = resolveRenderCacheMode(input);
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
    cacheMode,
    cacheStats: createRenderCacheFrameStats(),
    dpr,
    dynamicCameraCache: dynamicCameraCacheForFrame(input, dpr, cacheMode),
    cache: createRenderFrameCache(input),
    dockRenderStates: dockRenderStatesScratch,
    graveRenderStates: graveRenderStatesScratch,
    lighthouseRender: lighthouseRenderState(input),
    protectedCacheEntryKeys: new Set<string>(),
    shipRenderStates: shipRenderStatesScratch,
    staticCameraCache: staticCameraCacheForFrame(input, dpr, cacheMode),
    visibleShips,
    wakeDrawnShipIds: wakeDrawnShipIdsScratch,
    flagshipById: flagshipByIdScratch,
    zoomKeyMode: zoomKeyModeFor(cacheMode),
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
    if (path) drawSquadPennant(input.ctx, path, { motion: input.motion, world: input.world, squadId: squad.id });
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

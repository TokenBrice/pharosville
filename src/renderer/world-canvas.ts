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
import { createShipBodyCache } from "./ship-body-cache";
import { drawAtmosphere, drawBirds, drawBioluminescentSparkles, drawDecorativeLights, drawMoonReflection, drawSeaMist } from "./layers/ambient";
import { drawDockBody, drawDockOverlay, isBackgroundedHarborDock, type DockRenderState } from "./layers/docks";
import { drawDockCaustics } from "./layers/dock-caustics";
import { drawHarborSurf } from "./layers/harbor-surf";
import { drawGraveBody, drawGraveOverlay, drawGraveUnderlay, type GraveRenderState } from "./layers/graves";
import {
  computeSquadBoundingEllipse,
  computeSquadPennantPath,
  drawSquadPennant,
  drawSquadSelectionHalo,
  type SquadAnchor,
} from "./layers/maker-squad-chrome";
import { drawSceneryProp, drawStaticSceneScenery, sceneryDrawables } from "./layers/scenery";
import { drawYggdrasil } from "./layers/yggdrasil";
import { drawPigeonnier } from "./layers/pigeonnier";
import { drawShipBody, drawShipOverlay, drawShipWake, shipMastTopScreenPoint, type ShipRenderState } from "./layers/ships";
import { drawShipNameplates } from "./layers/ships/nameplates";
import { drawEntityLayer } from "./layers/entity-pass";
import { drawCemeteryContext, drawCemeteryGround, drawCemeteryMist } from "./layers/cemetery";
import { drawHarborDistrictGround } from "./layers/harbor-district";
import { drawTerrainBase, drawWaterTerrainAccents, drawWaterTerrainStaticDetails } from "./layers/terrain";
import { drawWaterAreaLabels } from "./layers/water-labels";
import { drawCenterCluster } from "./layers/center-cluster";
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseGodRays, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseReflection, drawLighthouseSurf, drawLighthouseThunderRim, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
import { drawSelection } from "./layers/selection";
import { drawCoastalWaterDetails, drawCoastalWaterStaticDetails } from "./layers/shoreline";
import { drawSky } from "./layers/sky";
import { drawNightTint, drawNightVignette } from "./layers/night-tint";
import { skyState } from "./layers/sky";
import { drawWeather } from "./layers/weather";
import { applyRevealEnvelope, drawAtmosphericFade, drawCloudShadowDrift, drawEstablishingShotLetterbox, drawFilmGrainPass, type RevealEnvelopePhase } from "./layers/cinematic-atmosphere";
import { drawWorldRimHaze } from "./layers/world-rim-haze";
import type {
  DrawPharosVilleInput,
  PharosVilleRenderCacheMetrics,
  PharosVilleRenderCacheMode,
  PharosVilleRenderMetrics,
  PharosVilleRenderZoomKeyMode,
} from "./render-types";
import { isScheduledPassDegraded, shouldDrawScheduledPass } from "./render-scheduler";
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
  dockRenderStates: Map<string, DockRenderState>;
  flagshipById: Map<string, PharosVilleWorld["ships"][number]>;
  graveRenderStates: Map<string, GraveRenderState>;
  lighthouseRender: LighthouseRenderState;
  protectedCacheEntryKeys: Set<string>;
  protectedShipBodyCacheKeys: Set<string>;
  shipBodyCache: ReturnType<typeof createShipBodyCache>;
  shipBodyCacheManifestVersion: string;
  shipBodyCacheMaxPixels: number;
  shipBodyCacheWarmupBudget: { remaining: number };
  shipRenderStates: Map<string, ShipRenderState>;
  staticCameraCache: CameraCacheFrame;
  visibleShips: PharosVilleWorld["ships"];
  wakeDrawnShipIds: Set<string>;
  zoomKeyMode: PharosVilleRenderZoomKeyMode;
}

interface StaticLayerCacheEntry {
  canvas: HTMLCanvasElement;
  key: string;
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

type StaticCacheScope = "scene" | "terrain";
const STATIC_CAMERA_OFFSET_BUCKET = 16;
const DYNAMIC_WATER_CADENCE_HZ = 0;
const DEFAULT_RENDER_CACHE_MODE: PharosVilleRenderCacheMode = "exact-zoom";
// V4.1 lever 2: under the `recovery` tier the water accent/swell group draws
// at half cadence (alternate frames) instead of every frame — the strokes
// are the dominant draw-call population (census: 918/frame fit, 1537 far
// zoom) and recovery frames are exactly the ones with no headroom. Parity
// toggles per drawn frame, so reduced motion (always `full` tier) and
// constrained (pass fully shed) never reach this path.
let waterAccentCadenceParity = false;
const SHIP_BODY_CACHE_WARMUP_PER_FRAME = 6;
const SHIP_BODY_CACHE_INTERACTION_WARMUP_PER_FRAME = 1;
// P5: warmup scales with scene density so dense fixtures fill the body cache
// in proportionally as many frames as sparse scenes, while the divisor keeps
// the per-frame precompose cost bounded (~10-16 entries on the dense fixture).
const SHIP_BODY_CACHE_WARMUP_VISIBLE_DIVISOR = 16;
// W1.05: keyed lookup so eviction/scan paths run in Map.values() / Map.get()
// rather than O(n) array scans. External API and behaviour unchanged.
const staticLayerCache = new Map<string, StaticLayerCacheEntry>();
const shipBodyCache = createShipBodyCache({ maxPixels: MAX_TOTAL_BACKING_PIXELS });
let staticCameraCacheKeyCache: { key: string; input: CameraCacheKeyInput } | null = null;
let staticCacheGenerationKey: string | null = null;
let shipBodyCacheGenerationKey: string | null = null;

export function releasePharosVilleRendererCaches(): void {
  staticLayerCache.clear();
  shipBodyCache.clear();
  staticCameraCacheKeyCache = null;
  staticCacheGenerationKey = null;
  shipBodyCacheGenerationKey = null;
}

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
const staticGraveRenderStatesScratch = new Map<string, GraveRenderState>();
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

function assetRenderGenerationKeyFor(input: DrawPharosVilleInput): string {
  return input.assets?.getRenderAssetGenerationKey() ?? "0|lg0";
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
  const cached = staticCameraCacheKeyCache;
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
  staticCameraCacheKeyCache = { input: inputKey, key };
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
  return cameraCacheKeySegment(input, dpr, cacheMode, STATIC_CAMERA_OFFSET_BUCKET);
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
  return `${scope}|${cameraCacheKeySegment}|a${assetRenderGenerationKeyFor(input)}|cv${cv}`;
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
  for (const entry of staticLayerCache.values()) pixels += cacheCanvasPixels(entry.canvas);
  return pixels;
}

function totalOffscreenCachePixels(): number {
  return staticCachePixels() + shipBodyCache.stats().pixelCount;
}

function cacheEntryId(kind: "static", key: string): string {
  return `${kind}:${key}`;
}

function manifestCacheVersionForInput(input: DrawPharosVilleInput): string {
  const manifest = input.assets?.getManifest();
  return manifest ? manifestCacheVersion(manifest) : "0";
}

function ensureRendererCacheGeneration(input: DrawPharosVilleInput, dpr: number): void {
  const dprBucket = Math.max(1, Math.round(dpr * 100));
  const worldId = worldIdFor(input.world);
  const assetGenerationKey = assetRenderGenerationKeyFor(input);
  const manifestVersion = manifestCacheVersionForInput(input);
  const nextStaticGenerationKey = [
    worldId,
    `${input.width | 0}x${input.height | 0}`,
    `d${dprBucket}`,
    `m${resolveRenderCacheMode(input)}`,
    `a${assetGenerationKey}`,
    `cv${manifestVersion}`,
  ].join("|");
  if (staticCacheGenerationKey !== nextStaticGenerationKey) {
    staticLayerCache.clear();
    staticCameraCacheKeyCache = null;
    staticCacheGenerationKey = nextStaticGenerationKey;
  }

  const nextShipBodyGenerationKey = [
    worldId,
    `a${assetGenerationKey}`,
    `cv${manifestVersion}`,
  ].join("|");
  if (shipBodyCacheGenerationKey !== nextShipBodyGenerationKey) {
    shipBodyCache.clear();
    shipBodyCacheGenerationKey = nextShipBodyGenerationKey;
  }
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
  drawWaterTerrainStaticDetails(input);
  drawCoastalWaterStaticDetails(input);
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
  drawStaticSceneScenery(input);
  drawNeutralStaticGraveBodies(input);
}

function drawNeutralStaticGraveBodies(input: DrawPharosVilleInput) {
  staticGraveRenderStatesScratch.clear();
  const neutralInput = input.hoveredTarget || input.selectedTarget
    ? { ...input, hoveredTarget: null, selectedTarget: null }
    : input;
  const staticGraveFrame = {
    cache: createRenderFrameCache(neutralInput),
    graveRenderStates: staticGraveRenderStatesScratch,
  };
  for (const grave of neutralInput.world.graves) {
    drawGraveUnderlay(neutralInput, staticGraveFrame, grave);
    drawGraveBody(neutralInput, staticGraveFrame, grave);
  }
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

  const cached = staticLayerCache.get(key);
  if (cached) {
    // O(1) LRU touch: re-insert so Map iteration order stays oldest-first
    // and `evictOldestCacheEntry` can pop from the front without a scan.
    staticLayerCache.delete(key);
    staticLayerCache.set(key, cached);
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
  staticLayerCache.set(key, { canvas: offCanvas, key });
  frame.protectedCacheEntryKeys.add(cacheEntryId("static", key));
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

// Map iteration order is insertion order and `drawStaticPassCached` re-inserts
// on every hit, so the first non-protected entry is the least-recently-used
// one — eviction stops there instead of scanning the whole cache.
function evictOldestCacheEntry(protectedEntryKeys: ReadonlySet<string>): { canvas: HTMLCanvasElement } | null {
  for (const entry of staticLayerCache.values()) {
    if (protectedEntryKeys.has(cacheEntryId("static", entry.key))) continue;
    staticLayerCache.delete(entry.key);
    return { canvas: entry.canvas };
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
    dynamicCameraOffsetBucketPx: 0,
    dynamicWaterCadenceHz: DYNAMIC_WATER_CADENCE_HZ,
    staticCameraOffsetBucketPx: STATIC_CAMERA_OFFSET_BUCKET,
    zoomKeyMode: frame.zoomKeyMode,
  };
}

function backingMetricsForInput(input: DrawPharosVilleInput, dpr: number) {
  return resolveCanvasBackingPixelMetrics({
    dynamicCacheEntryCount: 0,
    dynamicCachePixels: 0,
    mainCanvasPixels: mainBackingPixelsForInput(input, dpr),
    maxMainCanvasPixels: MAX_MAIN_CANVAS_PIXELS,
    maxTotalBackingPixels: MAX_TOTAL_BACKING_PIXELS,
    spriteCacheEntryCount: shipBodyCache.stats().entryCount,
    spriteCachePixels: shipBodyCache.stats().pixelCount,
    staticCacheEntryCount: staticLayerCache.size,
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
  // W4.01 first-load reveal beat. Resolves to identity (sceneAlpha=1, no
  // offset, lighthouse on, sweepScale=1) at steady state; phases shape the
  // first ~1.8s of cold-mount draws driven by `pharosville-world.tsx`.
  const reveal = applyRevealEnvelope(input.revealEnvelope);
  // Lighthouse-aware motion that slows the first sweep by 2.2× during phase 3.
  // We use a wrapper rather than mutating the input motion so the rest of the
  // frame (ships, ambient) keeps real time.
  const lighthouseMotion = reveal.lighthouseSweepScale !== 1
    ? { ...input.motion, timeSeconds: input.motion.timeSeconds / reveal.lighthouseSweepScale }
    : input.motion;
  const lighthouseInput = lighthouseMotion === input.motion
    ? input
    : { ...input, motion: lighthouseMotion };
  ctx.imageSmoothingEnabled = false;
  // V1.1 per-pass instrumentation: coarse performance.now() pairs around the
  // major pass groups only (never per entity) so dense-scene draw cost is
  // attributable in `__pharosVilleDebug.renderMetrics`.
  const skyStartMs = performance.now();
  drawSky(input, frame.lighthouseRender);
  const skyDrawMs = performance.now() - skyStartMs;

  const visibleTileCount = countVisibleTiles(input);
  const terrainBlitStartMs = performance.now();
  drawStaticPassCached(input, frame, "terrain", paintStaticTerrainPass);
  const terrainBlitMs = performance.now() - terrainBlitStartMs;
  const waterAccentStart = performance.now();
  input.ctx.imageSmoothingEnabled = false;
  waterAccentCadenceParity = !waterAccentCadenceParity;
  const waterAccentCadenceDraw = input.renderScheduler?.tier !== "recovery"
    || input.motion.reducedMotion
    || waterAccentCadenceParity;
  const waterAccentTileCount = waterAccentCadenceDraw && shouldDrawScheduledPass(input.renderScheduler, "water-accents")
    ? drawWaterTerrainAccents(input)
    : 0;
  const coastalWaterTileCount = shouldDrawScheduledPass(input.renderScheduler, "coastal-water-motion")
    ? drawCoastalWaterDetails(input)
    : 0;
  const waterAccentDrawMs = performance.now() - waterAccentStart;
  const preSceneAmbientStartMs = performance.now();
  // V1.3 — feather the map rim into the sky backdrop. Before the entity
  // pass so edge-zone ships stay crisp above the haze.
  drawWorldRimHaze(input);
  if (shouldDrawScheduledPass(input.renderScheduler, "atmospheric-fade")) {
    drawAtmosphericFade(input, nightFactor);
  }
  const sceneBlitStartMs = performance.now();
  drawRevealGatedScene(input, frame, reveal);
  const sceneBlitEndMs = performance.now();
  const staticBlitDrawMs = terrainBlitMs + (sceneBlitEndMs - sceneBlitStartMs);
  if (reveal.drawLighthouse) {
    if (shouldDrawScheduledPass(input.renderScheduler, "lighthouse-surf")) drawLighthouseSurf(lighthouseInput);
    if (shouldDrawScheduledPass(input.renderScheduler, "lighthouse-reflection")) {
      drawLighthouseReflection(lighthouseInput, frame.lighthouseRender, nightFactor);
    }
  }
  // Beach-foam ribbon along each chain harbor's seawall edge. Drawn after the
  // backgrounded Ethereum dock body (painted in the static scene pass) and
  // before the main entity pass so the foam sits over the water but under any
  // dock sprite that the entity pass paints on top of the ribbon's anchor.
  if (shouldDrawScheduledPass(input.renderScheduler, "harbor-surf")) drawHarborSurf(input);
  // Caustic shimmer fringe around the four major EVM-bay dock bodies. Same
  // layering contract as harbor-surf: over the water, under the entity-pass
  // dock sprites. Recovery keeps the pass; constrained sheds it.
  if (shouldDrawScheduledPass(input.renderScheduler, "dock-caustics")) drawDockCaustics(input);
  const entityPassStartMs = performance.now();
  const preEntityAmbientMs = (entityPassStartMs - preSceneAmbientStartMs) - (sceneBlitEndMs - sceneBlitStartMs);
  const entityMetrics = drawRevealGatedEntities(input, frame, nightFactor, reveal, lighthouseInput);
  drawSquadChrome(input, frame);
  const entityPassEndMs = performance.now();
  const entityPassDrawMs = entityPassEndMs - entityPassStartMs;
  // Ticker nameplates draw as a fleet-wide pass after all entities so plates
  // sit above neighboring hulls, and before night tint / water labels so they
  // dim with the scene like other in-world signage.
  const nameplateDrawCount = drawShipNameplates(input, frame, frame.visibleShips);
  const nameplateEndMs = performance.now();
  const nameplateDrawMs = nameplateEndMs - entityPassEndMs;
  if (shouldDrawScheduledPass(input.renderScheduler, "cloud-shadow")) {
    drawCloudShadowDrift(input, isScheduledPassDegraded(input.renderScheduler, "cloud-shadow") ? nightFactor * 0.65 : nightFactor);
  }
  drawWaterAreaLabels(input);
  drawNightTint(input, nightFactor);
  if (shouldDrawScheduledPass(input.renderScheduler, "scene-atmosphere")) {
    drawAtmosphere(input, frame.lighthouseRender);
  }
  if (reveal.drawLighthouse) {
    drawLighthouseNightHighlights(lighthouseInput, frame.lighthouseRender, nightFactor);
  }
  if (shouldDrawScheduledPass(input.renderScheduler, "bioluminescent-sparkles")) {
    drawBioluminescentSparkles(input, nightFactor, frame.lighthouseRender);
  }
  if (shouldDrawScheduledPass(input.renderScheduler, "moon-reflection")) drawMoonReflection(input, nightFactor);
  if (shouldDrawScheduledPass(input.renderScheduler, "sea-mist")) drawSeaMist(input, nightFactor);
  if (shouldDrawScheduledPass(input.renderScheduler, "decorative-lights")) drawDecorativeLights(input);
  if (reveal.drawLighthouse) {
    if (shouldDrawScheduledPass(input.renderScheduler, "lighthouse-beam-rim")) {
      drawLighthouseBeamRim(lighthouseInput, frame.visibleShips, frame.lighthouseRender, nightFactor);
    }
  }
  if (reveal.drawLighthouse && shouldDrawScheduledPass(input.renderScheduler, "god-rays")) {
    const godRayNightFactor = isScheduledPassDegraded(input.renderScheduler, "god-rays") ? nightFactor * 0.7 : nightFactor;
    drawLighthouseGodRays(lighthouseInput.ctx, frame.lighthouseRender.firePoint, lighthouseInput.camera.zoom * 1.35, lighthouseMotion, godRayNightFactor);
  }
  if (shouldDrawScheduledPass(input.renderScheduler, "cemetery-mist")) drawCemeteryMist(input);
  if (shouldDrawScheduledPass(input.renderScheduler, "birds")) drawBirds(input);
  // Lightning flashes over WARNING/DANGER zones. Placed after night-tint and
  // ambient atmosphere so the flash visibly punches through the dim, but
  // before the night vignette / selection chrome which are UI overlays.
  if (shouldDrawScheduledPass(input.renderScheduler, "weather")) drawWeather(input);
  if (reveal.drawLighthouse) {
    if (shouldDrawScheduledPass(input.renderScheduler, "lighthouse-thunder-rim")) {
      drawLighthouseThunderRim(lighthouseInput, frame.lighthouseRender, nightFactor);
    }
  }
  if (shouldDrawScheduledPass(input.renderScheduler, "scene-vignette")) drawNightVignette(input, nightFactor);
  const selectionStartMs = performance.now();
  const postEntityAmbientMs = selectionStartMs - nameplateEndMs;
  const selectionDrawableCount = drawSelection(input);
  const selectionEndMs = performance.now();
  const selectionChromeDrawMs = selectionEndMs - selectionStartMs;
  if (shouldDrawScheduledPass(input.renderScheduler, "establishing-letterbox")) drawEstablishingShotLetterbox(input);
  if (shouldDrawScheduledPass(input.renderScheduler, "film-grain")) drawFilmGrainPass(input);
  const ambientDrawMs = preEntityAmbientMs + postEntityAmbientMs + (performance.now() - selectionEndMs);
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
  const scheduler = input.renderScheduler;
  return {
    backing: backingMetricsForInput(input, frame.dpr),
    cache: renderCacheMetricsForFrame(frame),
    shipBodyCacheStats: shipBodyCache.stats(),
    drawableCount: entityMetrics.drawableCount + selectionDrawableCount,
    drawableCounts,
    movingShipCount,
    visibleShipCount: frame.visibleShips.length,
    visibleTileCount,
    waterAccentDrawMs,
    waterAccentMode: input.motion.reducedMotion ? "reduced-motion-direct" : "direct",
    waterAccentTileCount,
    coastalWaterTileCount,
    skyDrawMs,
    staticBlitDrawMs,
    entityPassDrawMs,
    nameplateDrawMs,
    nameplateDrawCount,
    ambientDrawMs,
    selectionChromeDrawMs,
    ...(scheduler?.targetFrameMs !== undefined ? { renderBudgetTargetMs: scheduler.targetFrameMs } : {}),
    ...(scheduler?.degradedPasses ? { schedulerDegradedPasses: scheduler.degradedPasses } : {}),
    ...(scheduler?.skippedPasses ? { schedulerSkippedPasses: scheduler.skippedPasses } : {}),
    ...(scheduler?.tier ? { schedulerTier: scheduler.tier } : {}),
  };
}

function createWorldCanvasFrame(input: DrawPharosVilleInput): WorldCanvasFrame {
  const dpr = input.dpr && input.dpr > 0 ? input.dpr : 1;
  ensureRendererCacheGeneration(input, dpr);
  const mainCanvasPixels = mainBackingPixelsForInput(input, dpr);
  const nonSpriteCachePixels = staticCachePixels();
  const shipBodyCacheMaxPixels = Math.max(0, MAX_TOTAL_BACKING_PIXELS - mainCanvasPixels - nonSpriteCachePixels);
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
    cache: createRenderFrameCache(input),
    dockRenderStates: dockRenderStatesScratch,
    graveRenderStates: graveRenderStatesScratch,
    lighthouseRender: lighthouseRenderState(input),
    protectedCacheEntryKeys: new Set<string>(),
    protectedShipBodyCacheKeys: new Set<string>(),
    shipBodyCache,
    shipBodyCacheManifestVersion: manifestCacheVersionForInput(input),
    shipBodyCacheMaxPixels,
    shipBodyCacheWarmupBudget: {
      remaining: input.renderScheduler?.tier === "full"
        ? Math.max(
          SHIP_BODY_CACHE_WARMUP_PER_FRAME,
          Math.ceil(visibleShips.length / SHIP_BODY_CACHE_WARMUP_VISIBLE_DIVISOR),
        )
        : SHIP_BODY_CACHE_INTERACTION_WARMUP_PER_FRAME,
    },
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
    if (path) drawSquadPennant(input.ctx, path, { motion: input.motion, seaState: input.seaState, squadId: squad.id });
    if (selectedIsSquad) {
      const ellipse = computeSquadBoundingEllipse(anchors);
      if (ellipse) drawSquadSelectionHalo(input.ctx, ellipse);
    }
  }
}

function drawEntityPass(input: DrawPharosVilleInput, frame: WorldCanvasFrame, nightFactor: number, lighthouseInput?: DrawPharosVilleInput): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  const lhInput = lighthouseInput ?? input;
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
      drawLighthouseBody: () => drawLighthouseBody(lhInput, frame.lighthouseRender),
      drawLighthouseOverlay: () => drawLighthouseOverlay(lhInput, frame.lighthouseRender, nightFactor),
      drawPigeonnierBody: () => drawPigeonnier(input),
      drawSceneryProp: (prop) => drawSceneryProp(input, prop),
      drawShipBody: (ship) => drawShipBody(input, frame, ship),
      drawShipOverlay: (ship) => drawShipOverlay(input, frame, ship, nightFactor),
      drawShipWake: (ship) => drawShipWake(input, frame, ship),
      isBackgroundedHarborDock,
      lighthouseOverlayScreenBounds: (selectionRect) => lighthouseOverlayScreenBounds(input, selectionRect, frame.lighthouseRender, nightFactor),
      visibleShips: frame.visibleShips,
    },
  );
}

/**
 * Wraps the static scene pass with the reveal-beat alpha and headland slide.
 * When `reveal.envelope >= 1` (steady state), the cached static path is used
 * unchanged. While the envelope is in flight, the scene paints directly
 * (skipping the cache) so the offset/alpha don't leak into reusable cache
 * entries — the reveal beat is short (~1.8s on cold mount) so the cache miss
 * window is negligible.
 */
function drawRevealGatedScene(input: DrawPharosVilleInput, frame: WorldCanvasFrame, reveal: RevealEnvelopePhase): void {
  if (reveal.envelope >= 1) {
    drawStaticPassCached(input, frame, "scene", paintStaticScenePass);
    return;
  }
  if (reveal.sceneAlpha <= 0) return;
  const ctx = input.ctx;
  ctx.save();
  ctx.globalAlpha = reveal.sceneAlpha;
  if (reveal.headlandYOffset !== 0) ctx.translate(0, reveal.headlandYOffset);
  paintStaticScenePass(input, frame);
  ctx.restore();
}

/**
 * Wraps the entity pass with the reveal-beat alpha and headland slide so
 * ships/docks/scenery fade in aligned with the scene. The lighthouse body
 * is drawn inside the entity pass; during phase 1+2 the lighthouse light
 * passes (beam, god rays, surf, reflection, highlights, rim, thunder rim)
 * are still gated off by callers, so the body reads as "unlit silhouette"
 * even though the entity pass itself is not lighthouse-aware.
 */
function drawRevealGatedEntities(
  input: DrawPharosVilleInput,
  frame: WorldCanvasFrame,
  nightFactor: number,
  reveal: RevealEnvelopePhase,
  lighthouseInput: DrawPharosVilleInput,
): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  if (reveal.envelope >= 1) {
    return drawEntityPass(input, frame, nightFactor, lighthouseInput);
  }
  if (reveal.sceneAlpha <= 0) {
    return { drawableCount: 0, drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 } };
  }
  const ctx = input.ctx;
  ctx.save();
  ctx.globalAlpha = reveal.sceneAlpha;
  if (reveal.headlandYOffset !== 0) ctx.translate(0, reveal.headlandYOffset);
  const metrics = drawEntityPass(input, frame, nightFactor, lighthouseInput);
  ctx.restore();
  return metrics;
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

import { waterTerrainStyle, zoneThemeForTerrain, type WaterTextureKind, type ZoneVisualTheme } from "../../systems/palette";
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from "../../systems/projection";
import { isElevatedTileKind, isShoreTileKind, isWaterTileKind } from "../../systems/world-layout";
import type { TerrainKind } from "../../systems/world-types";
import type { PharosVilleAssetManager } from "../asset-manager";
import { drawAsset, drawDiamond, drawTileLowerFacet, withAlpha } from "../canvas-primitives";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";
import { TERRAIN_TEXTURE, TILE_COLORS } from "../visual-config";
import { visibleTileBoundsForCamera, type VisibleTileBounds } from "../viewport";

// Replicated from lighthouse.ts (read-only reference): one revolution per
// SWEEP_PERIOD seconds with the same easing term. Mirrored locally so terrain
// caustics tint water tiles within the beam arc without coupling to lighthouse
// shared state.
const BEAM_SWEEP_PERIOD = 48;
const BEAM_CAUSTIC_HALF_ARC = (20 * Math.PI) / 180;
// C3: hoisted so the 3 per-tile call sites resolve a module-scope constant.
const BEAM_CAUSTIC_COS = Math.cos(BEAM_CAUSTIC_HALF_ARC);

// C1: gradient coords bake tile pixel position, so we cache color-stop params
// only (zoomBucket × alphaBucket), then reconstruct the gradient per tile.
// This avoids the string-parsing cost while keeping coordinates correct.
type BeamCausticColorStops = [string, string]; // [warm, cool]
const BEAM_CAUSTIC_STOP_CACHE = new Map<string, BeamCausticColorStops>();
const BEAM_CAUSTIC_STOP_CACHE_CAP = 256;

// C8: 256-entry sin LUT for per-tile water-texture renderers.
const SIN_LUT = new Float32Array(256);
for (let _i = 0; _i < 256; _i++) {
  SIN_LUT[_i] = Math.sin(_i * ((2 * Math.PI) / 256));
}
function fastSin(x: number): number {
  return SIN_LUT[((x * (256 / (2 * Math.PI))) | 0) & 255]!;
}

// Task #11 (perf F3): memoize zoneThemeForTerrain since the underlying
// ZONE_THEMES table is `as const` and returns stable singletons. Keyed by the
// stringified terrain kind to avoid the per-tile function-call + lookup cost
// in the ~200-water-tile-per-frame hot path.
const TERRAIN_THEME_CACHE = new Map<string, ZoneVisualTheme>();
function cachedZoneThemeForTerrain(value: string): ZoneVisualTheme {
  let theme = TERRAIN_THEME_CACHE.get(value);
  if (!theme) {
    theme = zoneThemeForTerrain(value);
    TERRAIN_THEME_CACHE.set(value, theme);
  }
  return theme;
}

// Task #31 (perf F2): unit-scale Path2D templates for the diagonal wave and
// accent strokes drawn per visible water tile. Coordinates are in tile-local
// pixels at zoom=1; the caller translate+scales the canvas, then strokes the
// cached path. Two paths total instead of ~200 path rebuilds per frame.
//
// Lazily initialised so module load works in jsdom (which doesn't define
// Path2D); the renderer only runs in browsers where Path2D exists.
let waterOverlayWavePath: Path2D | null = null;
let waterOverlayAccentPath: Path2D | null = null;
function getWaterOverlayWavePath(): Path2D {
  if (waterOverlayWavePath === null) {
    const p = new Path2D();
    p.moveTo(-9, -2);
    p.lineTo(7, 2);
    waterOverlayWavePath = p;
  }
  return waterOverlayWavePath;
}
function getWaterOverlayAccentPath(): Path2D {
  if (waterOverlayAccentPath === null) {
    const p = new Path2D();
    p.moveTo(-3, 4);
    p.lineTo(10, 7);
    waterOverlayAccentPath = p;
  }
  return waterOverlayAccentPath;
}

// Mooring corners hand-picked from AUTHORED_SEAWALL_SEGMENTS in
// src/systems/seawall.ts: NW lighthouse apron, SW market quay, E observatory
// gate. Looping concentric ripples emanate from each.
const SEAWALL_RIPPLE_ANCHORS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 15.4, y: 25.3 },
  { x: 20.4, y: 36.6 },
  { x: 42.1, y: 26.3 },
];
const SEAWALL_RIPPLE_PERIOD = 3;
const DANGER_RIP_PERIOD_SECONDS = 6;
const CALM_MIRROR_PERIOD_SECONDS = 20;
const OPEN_WATER_PLANKTON_PERIOD_SECONDS = 12;
const LEDGER_ROW_HEADERS = ["I", "V", "X"] as const;

const WATER_TERRAIN_ASSET_BY_KIND: Partial<Record<TerrainKind, string>> = {
  "alert-water": "terrain.harbor-water",
  "calm-water": "terrain.harbor-water",
  "deep-water": "terrain.deep-water",
  "harbor-water": "terrain.harbor-water",
  "ledger-water": "terrain.harbor-water",
  "storm-water": "terrain.storm-water",
  "warning-water": "terrain.storm-water",
  "watch-water": "terrain.harbor-water",
  water: "terrain.harbor-water",
};

function landAssetIdFor(kind: TerrainKind, x: number, y: number): string {
  if (kind === "beach" || kind === "shore" || kind === "cliff") return "terrain.shore";
  const h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
  return (h % 5 < 2) ? "terrain.land-scrub" : "terrain.land";
}

function tileHash(tileX: number, tileY: number, salt = 0): number {
  let h = (
    Math.imul(tileX + 101, 374761393)
    ^ Math.imul(tileY + 211, 668265263)
    ^ Math.imul(salt + 17, 2246822519)
  ) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const TERRAIN_ASSET_SCALE = 0.5;

type WaterTextureRenderer = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) => void;

const WATER_TEXTURE_RENDERERS: Partial<Record<WaterTextureKind, WaterTextureRenderer>> = {
  alert: drawAlertChannelTexture,
  calm: drawCalmWaterTexture,
  deep: drawDeepSeaTexture,
  harbor: drawHarborWaterTexture,
  ledger: drawLedgerWaterTexture,
  storm: drawDangerStraitTexture,
  warning: drawWarningShoalTexture,
  watch: drawWatchWaterTexture,
};

export function drawTerrain(input: DrawPharosVilleInput) {
  const bounds = resolveVisibleTileBounds(input, 2);
  const visibleTileCount = drawTerrainBase(input, bounds);
  drawWaterTerrainOverlays(input, bounds);
  return visibleTileCount;
}

export function drawTerrainBase(input: DrawPharosVilleInput, bounds: VisibleTileBounds | null = null) {
  const { assets, camera, ctx, height, motion, width, world } = input;
  if (!bounds) bounds = resolveVisibleTileBounds(input, 2);
  const { width: mapWidth, tiles } = world.map;

  const viewportMarginX = 36 * camera.zoom;
  const viewportMarginY = 22 * camera.zoom;
  const deltaX = (TILE_WIDTH / 2) * camera.zoom;
  const deltaY = (TILE_HEIGHT / 2) * camera.zoom;

  let visibleTileCount = 0;
  if (!bounds) return visibleTileCount;
  let rowScreenX = (bounds.minX - bounds.minY) * deltaX + camera.offsetX;
  let rowScreenY = (bounds.minX + bounds.minY) * deltaY + camera.offsetY;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    let screenX = rowScreenX;
    let screenY = rowScreenY;
    const rowOffset = y * mapWidth;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const tile = tiles[rowOffset + x];
      if (tile) {
        const terrain = tile.terrain ?? tile.kind;
        if (isTileInViewport(screenX, screenY, width, height, viewportMarginX, viewportMarginY)) {
          visibleTileCount += 1;
          if (isWaterTileKind(terrain)) {
            drawWaterTileBase(ctx, screenX, screenY, camera.zoom, terrain, tile.x, tile.y, waterAssetFor(assets, terrain), motion);
          } else {
            drawLandTile(ctx, screenX, screenY, camera.zoom, terrain, tile.x, tile.y, landAssetFor(assets, terrain, tile.x, tile.y));
          }
        }
      }
      screenX += deltaX;
      screenY += deltaY;
    }
    rowScreenX -= deltaX;
    rowScreenY += deltaY;
  }
  return visibleTileCount;
}

export function drawWaterTerrainOverlays(input: DrawPharosVilleInput, bounds: VisibleTileBounds | null = null) {
  const { camera, ctx, height, motion, width, world, visibleTileBoundsCache } = input;
  const { width: mapWidth, height: mapHeight, tiles } = world.map;
  if (!bounds) bounds = visibleTileBoundsForCamera(
    {
      camera,
      mapHeight,
      mapWidth,
      tileMargin: 2,
      viewportHeight: height,
      viewportWidth: width,
    },
    visibleTileBoundsCache,
  );
  const viewportMarginX = 36 * camera.zoom;
  const viewportMarginY = 22 * camera.zoom;
  const deltaX = (TILE_WIDTH / 2) * camera.zoom;
  const deltaY = (TILE_HEIGHT / 2) * camera.zoom;
  if (!bounds) return 0;

  let visibleWaterTileCount = 0;

  const beam = world.lighthouse.unavailable ? null : computeBeamCausticState(input);

  let rowScreenX = (bounds.minX - bounds.minY) * deltaX + camera.offsetX;
  let rowScreenY = (bounds.minX + bounds.minY) * deltaY + camera.offsetY;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    let screenX = rowScreenX;
    let screenY = rowScreenY;
    const rowOffset = y * mapWidth;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const tile = tiles[rowOffset + x];
      if (tile) {
        const terrain = tile.terrain ?? tile.kind;
        if (isWaterTileKind(terrain) && isTileInViewport(screenX, screenY, width, height, viewportMarginX, viewportMarginY)) {
          visibleWaterTileCount += 1;
          drawWaterTileOverlay(ctx, screenX, screenY, camera.zoom, terrain, tile.x, tile.y, mapWidth, mapHeight, motion, beam);
        }
      }
      screenX += deltaX;
      screenY += deltaY;
    }
    rowScreenX -= deltaX;
    rowScreenY += deltaY;
  }
  drawSeawallRipples(ctx, camera, motion);
  return visibleWaterTileCount;
}

function resolveVisibleTileBounds(input: DrawPharosVilleInput, tileMargin: number): VisibleTileBounds | null {
  const { camera, height, world, width, visibleTileBoundsCache } = input;
  return visibleTileBoundsForCamera(
    {
      camera,
      mapHeight: world.map.height,
      mapWidth: world.map.width,
      tileMargin,
      viewportHeight: height,
      viewportWidth: width,
    },
    visibleTileBoundsCache,
  );
}

function isTileInViewport(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  marginX: number,
  marginY: number,
): boolean {
  return (
    screenX >= -marginX
    && screenX <= viewportWidth + marginX
    && screenY >= -marginY
    && screenY <= viewportHeight + marginY
  );
}

function waterAssetFor(assets: PharosVilleAssetManager | null, terrain: TerrainKind) {
  const assetId = WATER_TERRAIN_ASSET_BY_KIND[terrain] ?? null;
  return assetId ? assets?.get(assetId) ?? null : null;
}

function landAssetFor(assets: PharosVilleAssetManager | null, terrain: TerrainKind, x: number, y: number) {
  return assets?.get(landAssetIdFor(terrain, x, y)) ?? null;
}

function terrainColor(kind: TerrainKind) {
  const value = String(kind);
  const waterStyle = waterTerrainStyle(value);
  if (waterStyle) return waterStyle.base;
  const directColor = TILE_COLORS[value];
  if (directColor) return directColor;
  if (value.includes("water")) return value.includes("deep") ? "#050d1b" : "#153d63";
  if (value.includes("cliff")) return TILE_COLORS.cliff;
  if (value.includes("hill")) return TILE_COLORS.hill;
  if (value.includes("grass")) return TILE_COLORS.grass;
  if (value.includes("beach")) return TILE_COLORS.beach;
  return TILE_COLORS.land;
}

function drawWaterTileBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  kind: TerrainKind,
  tileX: number,
  tileY: number,
  asset: NonNullable<ReturnType<PharosVilleAssetManager["get"]>> | null,
  motion: PharosVilleCanvasMotion,
) {
  const value = String(kind);
  const width = 32 * zoom;
  const height = 16 * zoom;
  const theme = cachedZoneThemeForTerrain(value);
  drawDiamond(ctx, x, y, width, height, theme.base);
  if (asset) {
    drawTerrainAsset(ctx, asset, x, y, zoom, 0.18);
  }
  drawWaterDepthOverlay(ctx, x, y, zoom, width, height, tileX, tileY, theme.inner, motion);
}

function drawWaterTileOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  kind: TerrainKind,
  tileX: number,
  tileY: number,
  mapWidth: number,
  mapHeight: number,
  motion: PharosVilleCanvasMotion,
  beam: BeamCausticState | null,
) {
  const value = String(kind);
  const theme = cachedZoneThemeForTerrain(value);
  if (value === "deep-water") {
    drawDeepShelfEdgeDarkening(ctx, x, y, zoom, tileX, tileY, mapWidth, mapHeight);
  }
  drawWaterTerrainTexture(ctx, x, y, zoom, theme, tileX, tileY, motion);
  drawBeamCaustic(ctx, x, y, zoom, tileX, tileY, beam);
  if ((tileX * 13 + tileY * 17) % 9 !== 0) return;
  const wave = motion.reducedMotion
    ? 0.13
    : 0.1 + fastSin(motion.timeSeconds * 1.05 + tileX * 0.27 + tileY * 0.19) * 0.035;
  // Task #31 (perf F2): translate+scale the ctx so cached unit-scale Path2D
  // templates can be reused across all visible water tiles. lineWidth is
  // affected by ctx.scale, so we divide the original `Math.max(1, zoom)` by
  // zoom to keep the rendered stroke width identical to the previous logic.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(zoom, zoom);
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.08, wave));
  ctx.lineWidth = Math.max(1, zoom) / zoom;
  ctx.stroke(getWaterOverlayWavePath());
  if ((tileX + tileY) % 3 === 0) {
    ctx.strokeStyle = withAlpha(theme.accent, 0.18);
    ctx.stroke(getWaterOverlayAccentPath());
  }
  ctx.restore();
}

function drawWaterDepthOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  fill: string,
  motion: PharosVilleCanvasMotion,
) {
  drawDiamond(ctx, x, y + 1 * zoom, width * 0.88, height * 0.76, fill);
  const shimmer = ((tileX * 11 + tileY * 7) % 9 - 4) / 4;
  if (shimmer === 0) return;
  // Slow alpha breath so the static shimmer modulates instead of staying flat.
  const breath = motion.reducedMotion ? 1 : 0.85 + 0.15 * fastSin(motion.timeSeconds * 0.4);
  ctx.save();
  const overlayFill = shimmer > 0
    ? `rgba(218, 236, 224, ${0.01 * shimmer * breath})`
    : `rgba(1, 8, 18, ${-0.012 * shimmer * breath})`;
  ctx.fillStyle = overlayFill;
  drawDiamond(ctx, x, y, width * 0.98, height * 0.9, overlayFill);
  ctx.restore();
}

// Beam caustics: tile is tinted with a soft gold-cyan radial wash when its
// bearing from the lighthouse falls within the current sweep arc. Beam-angle
// math mirrors lighthouse.ts (read-only reference).
interface BeamCausticState {
  firePoint: { x: number; y: number };
  cos: number;
  sin: number;
  reducedMotion: boolean;
  timeSeconds: number;
}

function computeBeamCausticState(input: DrawPharosVilleInput): BeamCausticState | null {
  const { camera, motion, world } = input;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const tCycle = time / BEAM_SWEEP_PERIOD;
  // Same easing term as lighthouse.ts sweep angle.
  const angle = motion.reducedMotion
    ? Math.PI / 4
    : tCycle * Math.PI * 2 + Math.sin(tCycle * Math.PI * 2) * 0.15;
  const center = tileToScreen(world.lighthouse.tile, camera);
  return {
    cos: Math.cos(angle),
    firePoint: center,
    reducedMotion: motion.reducedMotion,
    sin: Math.sin(angle),
    timeSeconds: time,
  };
}

function drawBeamCaustic(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  beam: BeamCausticState | null,
) {
  if (!beam) return;
  const dx = x - beam.firePoint.x;
  const dy = y - beam.firePoint.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  // cos(angle between tile bearing and beam) = dot(unit-tile, unit-beam).
  const dot = (dx * beam.cos + dy * beam.sin) / dist;
  if (dot < BEAM_CAUSTIC_COS) return;
  // Soften toward the arc edges so the band fades smoothly.
  const fall = (dot - BEAM_CAUSTIC_COS) / (1 - BEAM_CAUSTIC_COS);
  const alpha = 0.18 * fall;
  const radius = 18 * zoom;
  ctx.save();
  const zoomBucket = Math.round(zoom * 4) / 4;
  const alphaBucket = Math.round(alpha * 20) / 20;
  const stopKey = `${zoomBucket}:${alphaBucket}`;
  let stops = BEAM_CAUSTIC_STOP_CACHE.get(stopKey);
  if (!stops) {
    stops = [`rgba(255, 220, 140, ${alphaBucket})`, `rgba(150, 220, 220, ${alphaBucket * 0.55})`];
    if (BEAM_CAUSTIC_STOP_CACHE.size >= BEAM_CAUSTIC_STOP_CACHE_CAP) {
      BEAM_CAUSTIC_STOP_CACHE.delete(BEAM_CAUSTIC_STOP_CACHE.keys().next().value!);
    }
    BEAM_CAUSTIC_STOP_CACHE.set(stopKey, stops);
  } else {
    // LRU: move to end on hit.
    BEAM_CAUSTIC_STOP_CACHE.delete(stopKey);
    BEAM_CAUSTIC_STOP_CACHE.set(stopKey, stops);
  }
  // Task #9 (perf F7) considered: caching the full gradient object keyed by
  // (stopKey, x, y, radius). Skipped — radial gradients bake absolute screen
  // coords, and (x, y) are unique per visible tile + shift every camera
  // frame, so the cache hit rate is effectively zero. The colour-stop string
  // cache above already captures the only reusable work.
  const grad = ctx.createRadialGradient(x, y, 1, x, y, radius);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.6, stops[1]);
  grad.addColorStop(1, "rgba(150, 220, 220, 0)");
  ctx.fillStyle = grad;
  const halfW = 16 * zoom;
  const halfH = 8 * zoom;
  ctx.beginPath();
  ctx.moveTo(x, y - halfH);
  ctx.lineTo(x + halfW, y);
  ctx.lineTo(x, y + halfH);
  ctx.lineTo(x - halfW, y);
  ctx.closePath();
  ctx.fill();
  drawBeamAxisGlitter(ctx, x, y, zoom, tileX, tileY, beam, dot, dist);
  ctx.restore();
}

function drawBeamAxisGlitter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  beam: BeamCausticState,
  dot: number,
  dist: number,
) {
  const axisFalloff = Math.max(0, (dot - 0.985) / 0.015);
  if (axisFalloff > 0) {
    ctx.strokeStyle = `rgba(255, 242, 182, ${0.09 * Math.min(1, axisFalloff)})`;
    ctx.lineWidth = Math.max(1, 0.65 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - beam.cos * 9 * zoom, y - beam.sin * 9 * zoom);
    ctx.lineTo(x + beam.cos * 12 * zoom, y + beam.sin * 12 * zoom);
    ctx.stroke();
  }

  const tileDist = dist / Math.max(1, TILE_WIDTH * zoom);
  const travel = beam.reducedMotion ? 4.5 : beam.timeSeconds * 2;
  const phase = ((tileDist - travel) % 8 + 8) % 8;
  const pulse = Math.max(0, 1 - Math.abs(phase - 1.5) / 1.5);
  const coneCenter = Math.max(0, (dot - BEAM_CAUSTIC_COS) / (1 - BEAM_CAUSTIC_COS));
  const alpha = 0.2 * pulse * Math.min(1, coneCenter * 1.6);
  if (alpha < 0.025) return;

  const hash = tileHash(tileX, tileY, 811);
  const count = 1 + (hash % 3);
  const lateralX = -beam.sin;
  const lateralY = beam.cos;
  const px = Math.max(1, Math.round(1.2 * zoom));
  ctx.fillStyle = `rgba(255, 250, 220, ${alpha})`;
  for (let i = 0; i < count; i += 1) {
    const forward = ((((hash >>> (i * 5)) & 7) - 3) * 1.35) * zoom;
    const lateral = ((((hash >>> (i * 5 + 3)) & 7) - 3) * 1.05) * zoom;
    ctx.fillRect(
      Math.round(x + beam.cos * forward + lateralX * lateral),
      Math.round(y + beam.sin * forward + lateralY * lateral),
      px,
      px,
    );
  }
}

// Seawall ripples: looping concentric rings expanding from authored mooring
// anchors. One pass per anchor; each anchor's phase is staggered so they
// don't pulse in lockstep.
function drawSeawallRipples(
  ctx: CanvasRenderingContext2D,
  camera: DrawPharosVilleInput["camera"],
  motion: PharosVilleCanvasMotion,
) {
  if (motion.reducedMotion) return;
  ctx.save();
  for (let i = 0; i < SEAWALL_RIPPLE_ANCHORS.length; i += 1) {
    const anchor = SEAWALL_RIPPLE_ANCHORS[i]!;
    const phase = ((motion.timeSeconds + i * 0.9) % SEAWALL_RIPPLE_PERIOD) / SEAWALL_RIPPLE_PERIOD;
    const screen = tileToScreen(anchor, camera);
    // 0.5–1 tile/sec growth: radius reaches 3 tile-widths over 3s.
    const radius = (4 + phase * 3 * TILE_WIDTH) * camera.zoom;
    const alpha = 0.8 * (1 - phase);
    if (alpha < 0.02) continue;
    ctx.strokeStyle = `rgba(232, 243, 233, ${alpha})`;
    ctx.lineWidth = Math.max(1, 1.1 * camera.zoom);
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y, radius, radius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWaterTerrainTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
) {
  const renderTexture = WATER_TEXTURE_RENDERERS[theme.texture];
  if (renderTexture) {
    renderTexture(ctx, x, y, zoom, tileX, tileY, motion, theme);
    return;
  }
  drawOpenWaterTexture(ctx, x, y, zoom, tileX, tileY, motion, theme);
}

function drawLedgerWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const ledgerPulse = motion.reducedMotion
    ? 0.18
    : 0.15 + fastSin(motion.timeSeconds * 0.62 + tileX * 0.25 + tileY * 0.37) * 0.04 * theme.motion.amplitudeScale;
  ctx.save();
  drawLedgerParchmentUnderbase(ctx, x, y, zoom, tileX, tileY, theme);
  if ((tileX + tileY) % 2 === 0) {
    drawMooringRule(ctx, x, y, zoom, -10, -2, 9, 3, theme.accent, 0.16);
    drawMooringRule(ctx, x, y, zoom, -8, 5, 7, 8, theme.wave, 0.18);
  }
  if ((tileX * 5 + tileY * 11) % 6 === 0) {
    ctx.strokeStyle = withAlpha(theme.accent, 0.24);
    ctx.lineWidth = Math.max(1, 0.75 * zoom);
    ctx.strokeRect(
      Math.round(x - 4 * zoom),
      Math.round(y - 1 * zoom),
      Math.max(2, Math.round(8 * zoom)),
      Math.max(1, Math.round(4 * zoom)),
    );
  }
  ctx.strokeStyle = withAlpha(theme.accent, Math.max(0.12, ledgerPulse) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 10 * zoom, y + 3 * zoom);
  ctx.moveTo(x - 8 * zoom, y + 5 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 8 * zoom);
  ctx.stroke();
  if ((tileX * 7 + tileY * 5) % 5 === 0) {
    ctx.fillStyle = withAlpha(theme.wave, 0.24);
    drawDiamond(ctx, x - 1 * zoom, y + 2 * zoom, 8 * zoom, 3 * zoom, ctx.fillStyle);
  }
  if ((tileX * 3 + tileY) % 7 === 0) {
    drawDepthSounding(ctx, x + 6 * zoom, y + 1 * zoom, zoom, theme.accent, 0.22);
  }
  if ((tileX * 5 + tileY * 9) % 7 === 0) {
    drawLedgerTallyMark(ctx, x, y, zoom, theme, tileX, tileY);
  }
  ctx.restore();
}

function drawHarborWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const pulse = motion.reducedMotion ? 0.16 : 0.13 + fastSin(motion.timeSeconds * 0.85 + tileX * 0.23 + tileY * 0.17) * 0.04;
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.1, pulse));
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 8 * zoom, y + 5 * zoom);
  if ((tileX + tileY) % 3 === 0) {
    ctx.moveTo(x - 5 * zoom, y - 2 * zoom);
    ctx.lineTo(x + 5 * zoom, y + 1 * zoom);
  }
  ctx.stroke();
  if ((tileX * 7 + tileY * 5) % 6 === 0) {
    const reflection = withAlpha(theme.accent, 0.24);
    ctx.fillStyle = reflection;
    drawDiamond(ctx, x + 2 * zoom, y + 2 * zoom, 8 * zoom, 3 * zoom, reflection);
  }
  ctx.restore();
}

function drawCalmWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const hush = motion.reducedMotion
    ? 0.13
    : 0.11 + fastSin(motion.timeSeconds * 0.48 + tileX * 0.19 + tileY * 0.13) * 0.025 * theme.motion.amplitudeScale;
  ctx.save();
  drawCalmMirrorBands(ctx, x, y, zoom, motion, theme, tileX, tileY);
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.08, hush) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom, y + 3 * zoom);
  ctx.quadraticCurveTo(x - 2 * zoom, y + 1.5 * zoom, x + 11 * zoom, y + 3 * zoom);
  if ((tileX * 11 + tileY * 5) % 5 === 0) {
    ctx.moveTo(x - 5 * zoom, y - 1 * zoom);
    ctx.quadraticCurveTo(x, y - 2 * zoom, x + 6 * zoom, y - 1 * zoom);
  }
  ctx.stroke();
  if ((tileX * 7 + tileY * 3) % 8 === 0) {
    drawDepthSounding(ctx, x - 5 * zoom, y + 1 * zoom, zoom, theme.accent, 0.18);
  }
  if ((tileX + tileY) % 6 === 0) {
    const reflection = withAlpha(theme.accent, 0.2);
    ctx.fillStyle = reflection;
    drawDiamond(ctx, x, y + 2 * zoom, 9 * zoom, 2.5 * zoom, reflection);
  }
  if (tileHash(tileX, tileY, 233) % 5 < 2) {
    drawCalmReflectionRing(ctx, x, y, zoom, motion, theme, tileX, tileY);
  }
  ctx.restore();
}

function drawDeepSeaTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const hash = tileHash(tileX, tileY, 419);
  if (hash % 7 !== 0 && hash % 13 !== 0) return;
  const glint = motion.reducedMotion ? 0.08 : 0.06 + fastSin(motion.timeSeconds * 0.42 + tileX * 0.2 + tileY * 0.31) * 0.025;
  ctx.save();
  if (hash % 7 === 0) {
    ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.035, glint * 0.7));
    ctx.lineWidth = Math.max(1, 0.8 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 8 * zoom, y);
    ctx.lineTo(x + 6 * zoom, y + 3 * zoom);
    ctx.stroke();
  }
  if (hash % 13 === 0) {
    const breathe = motion.reducedMotion
      ? 0.62
      : 0.5 + 0.5 * fastSin(motion.timeSeconds * 0.32 + (hash % 97) * 0.11);
    const alpha = 0.12 + breathe * 0.16;
    const px = Math.max(1, Math.round(1.15 * zoom));
    const offsetX = ((((hash >>> 5) % 11) - 5) * 1.6) * zoom;
    const offsetY = ((((hash >>> 11) % 7) - 3) * 1.2) * zoom;
    ctx.fillStyle = `rgba(236, 248, 255, ${alpha})`;
    ctx.fillRect(Math.round(x + offsetX), Math.round(y + offsetY), px, px);
  }
  ctx.restore();
}

function drawDeepShelfEdgeDarkening(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  mapWidth: number,
  mapHeight: number,
) {
  const centerX = (mapWidth - 1) / 2;
  const centerY = (mapHeight - 1) / 2;
  const maxDist = Math.hypot(centerX, centerY);
  if (maxDist <= 0) return;
  const dist = Math.hypot(tileX - centerX, tileY - centerY);
  const edge = Math.max(0, (dist / maxDist - 0.56) / 0.44);
  if (edge <= 0) return;
  drawDiamond(ctx, x, y, 32 * zoom, 16 * zoom, `rgba(0, 3, 10, ${Math.min(0.18, edge * 0.18)})`);
}

function drawAlertChannelTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const pulse = motion.reducedMotion
    ? 0.16
    : 0.14 + fastSin(motion.timeSeconds * 1.1 + tileX * 0.31) * 0.04 * theme.motion.amplitudeScale;
  ctx.save();
  const drift = motion.reducedMotion ? 0 : fastSin(motion.timeSeconds * 0.7 + tileY * 0.23) * 1.5 * zoom;
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.12, pulse - 0.03) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom + drift, y + 4 * zoom);
  ctx.quadraticCurveTo(x - 4 * zoom + drift, y - 3 * zoom, x + 10 * zoom + drift, y);
  if ((tileX + tileY) % 3 === 0) {
    ctx.moveTo(x - 8 * zoom - drift, y + 8 * zoom);
    ctx.quadraticCurveTo(x - 2 * zoom - drift, y + 3 * zoom, x + 8 * zoom - drift, y + 6 * zoom);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha(theme.accent, Math.max(0.16, pulse) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y - 3 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 2 * zoom);
  if ((tileX + tileY) % 2 === 0) {
    ctx.moveTo(x - 3 * zoom, y + 5 * zoom);
    ctx.lineTo(x + 8 * zoom, y + 8 * zoom);
  }
  ctx.stroke();
  if ((tileX * 13 + tileY * 5) % 7 === 0) {
    drawCurrentWakeMark(ctx, x, y, zoom, theme.accent, 0.28);
  }
  if ((tileX * 7 + tileY * 13) % 6 === 0) {
    drawAlertCurrentChevron(ctx, x, y, zoom, theme);
  }
  ctx.restore();
}

function drawWatchWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const crosswind = motion.reducedMotion
    ? 0.16
    : 0.14 + fastSin(motion.timeSeconds * 0.95 + tileY * 0.29) * 0.04 * theme.motion.amplitudeScale;
  ctx.save();
  if ((tileX * 7 + tileY * 2) % 4 !== 1) {
    ctx.strokeStyle = withAlpha(theme.accent, 0.16);
    ctx.lineWidth = Math.max(1, 0.8 * zoom);
    ctx.setLineDash([2.8 * zoom, 3.4 * zoom]);
    ctx.beginPath();
    ctx.moveTo(x - 13 * zoom, y - 1 * zoom);
    ctx.lineTo(x + 11 * zoom, y + 5 * zoom);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.12, crosswind) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y + 1 * zoom);
  ctx.lineTo(x - 3 * zoom, y - 1 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 2 * zoom);
  if ((tileX * 3 + tileY * 7) % 3 === 0) {
    ctx.moveTo(x - 7 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 9 * zoom, y + 5 * zoom);
  }
  ctx.stroke();
  if ((tileX + tileY * 5) % 7 === 0) {
    drawBreakwaterFoam(ctx, x, y, zoom, theme.wave, 0.22);
  }
  if ((tileX * 13 + tileY * 7) % 7 === 0) {
    drawWatchChannelBuoy(ctx, x, y, zoom, motion, theme, tileX, tileY);
  }
  ctx.restore();
}

function drawWarningShoalTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const chop = motion.reducedMotion
    ? 0.2
    : 0.18 + fastSin(motion.timeSeconds * 1.6 + tileY * 0.37) * 0.05 * theme.motion.amplitudeScale;
  ctx.save();
  if ((tileX + tileY) % 2 === 0) {
    const shoalFill = withAlpha(theme.accent, 0.22);
    drawDiamond(ctx, x + 1 * zoom, y + 1 * zoom, 18 * zoom, 7 * zoom, shoalFill);
    ctx.strokeStyle = withAlpha(theme.wave, 0.18);
    ctx.lineWidth = Math.max(1, 0.75 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 7 * zoom, y + 1 * zoom);
    ctx.lineTo(x + 7 * zoom, y + 4 * zoom);
    ctx.moveTo(x - 3 * zoom, y - 2 * zoom);
    ctx.lineTo(x + 10 * zoom, y + 1 * zoom);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.16, chop) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y - 2 * zoom);
  ctx.lineTo(x - 4 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 3 * zoom, y - 1 * zoom);
  ctx.moveTo(x + 3 * zoom, y + 5 * zoom);
  ctx.lineTo(x + 11 * zoom, y + 8 * zoom);
  ctx.stroke();
  drawWarningReefIdentity(ctx, x, y, zoom, theme, tileX, tileY);
  if ((tileX * 11 + tileY * 13) % 9 === 0) {
    drawDepthSounding(ctx, x + 7 * zoom, y + 3 * zoom, zoom, theme.wave, 0.26);
  }
  ctx.restore();
}

function drawDangerStraitTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const whitecap = motion.reducedMotion
    ? 0.22
    : 0.18 + fastSin(motion.timeSeconds * 2.1 + tileX * 0.43 + tileY * 0.29) * 0.08 * theme.motion.amplitudeScale;
  ctx.save();
  if ((tileX * 3 + tileY * 5) % 4 !== 2) {
    ctx.strokeStyle = "rgba(7, 12, 21, 0.34)";
    ctx.lineWidth = Math.max(1, 1.25 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 13 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 12 * zoom, y - 5 * zoom);
    ctx.stroke();
  }
  drawDangerRipRibbon(ctx, x, y, zoom, motion, theme, tileX, tileY);
  drawDangerWhitecapCurl(ctx, x, y, zoom, motion, theme, tileX, tileY);
  drawDangerSprayStreaks(ctx, x, y, zoom, motion, theme, tileX, tileY);
  ctx.strokeStyle = withAlpha(theme.wave, Math.max(0.14, whitecap) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 1.4 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom, y - 4 * zoom);
  ctx.lineTo(x - 6 * zoom, y - 1 * zoom);
  ctx.lineTo(x - 1 * zoom, y - 5 * zoom);
  ctx.moveTo(x + 2 * zoom, y + 4 * zoom);
  ctx.lineTo(x + 8 * zoom, y + 7 * zoom);
  ctx.lineTo(x + 13 * zoom, y + 3 * zoom);
  ctx.stroke();
  if ((tileX + tileY) % 3 === 0) {
    ctx.strokeStyle = withAlpha(theme.accent, 0.22);
    ctx.lineWidth = Math.max(1, 0.85 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 8 * zoom, y + 1 * zoom);
    ctx.lineTo(x - 3 * zoom, y - 3 * zoom);
    ctx.lineTo(x + 2 * zoom, y + 1 * zoom);
    ctx.moveTo(x + 4 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 9 * zoom, y + 2 * zoom);
    ctx.lineTo(x + 13 * zoom, y + 5 * zoom);
    ctx.stroke();
  }
  if ((tileX * 7 + tileY * 11) % 8 === 0) {
    ctx.fillStyle = withAlpha(theme.wave, 0.18);
    ctx.fillRect(Math.round(x - 1 * zoom), Math.round(y - 5 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
    ctx.fillRect(Math.round(x + 5 * zoom), Math.round(y + 3 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
  }
  if ((tileX * 19 + tileY * 23) % 11 === 0) {
    drawDangerStormBurst(ctx, x, y, zoom, motion, theme, tileX, tileY);
  }
  ctx.restore();
}

function drawOpenWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
) {
  const hash = tileHash(tileX, tileY, 503);
  const windFetch = hash % 10 < 3;
  const drift = motion.reducedMotion ? 0.12 : 0.1 + fastSin(motion.timeSeconds * 0.72 + tileX * 0.17 + tileY * 0.21) * 0.03;
  ctx.save();
  if (windFetch) {
    const fetchLength = Math.max(16, 22 * zoom);
    const fetchRise = Math.max(4, 5 * zoom);
    const windShift = motion.reducedMotion
      ? 0
      : fastSin(motion.timeSeconds * 0.36 + (hash % 31) * 0.19) * 1.4 * zoom;
    ctx.strokeStyle = withAlpha(theme.accent, Math.max(0.09, drift));
    ctx.lineWidth = Math.max(1, 0.85 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - fetchLength * 0.5 + windShift, y + fetchRise * 0.5);
    ctx.lineTo(x + fetchLength * 0.5 + windShift, y - fetchRise * 0.5);
    if (hash % 5 === 0) {
      ctx.moveTo(x - fetchLength * 0.35 - windShift * 0.5, y + fetchRise * 0.85);
      ctx.lineTo(x + fetchLength * 0.32 - windShift * 0.5, y + fetchRise * 0.2);
    }
    ctx.stroke();
  } else {
    const breathe = motion.reducedMotion
      ? 0.55
      : 0.5 + 0.5 * fastSin((motion.timeSeconds / OPEN_WATER_PLANKTON_PERIOD_SECONDS) * Math.PI * 2 + (hash % 89) * 0.17);
    const glintX = x + ((((hash >>> 8) % 15) - 7) * 1.2) * zoom;
    const glintY = y + ((((hash >>> 13) % 9) - 4) * 0.9) * zoom;
    ctx.fillStyle = withAlpha(theme.wave, 0.05 + breathe * 0.11);
    ctx.fillRect(Math.round(glintX), Math.round(glintY), 1, 1);
  }
  ctx.restore();
}

function drawLedgerParchmentUnderbase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  theme: ZoneVisualTheme,
) {
  drawDiamond(ctx, x, y, 29 * zoom, 13 * zoom, "rgba(214, 176, 112, 0.055)");
  const grainHash = tileHash(tileX, tileY, 631);
  if (grainHash % 3 !== 0) {
    drawMooringRule(ctx, x, y, zoom, -12, -1.5, 11, 4.5, "#d7b06c", 0.045);
  }
  if ((tileX % 10 === 0 || tileX % 10 === 5) && tileY % 3 === 0) {
    const header = LEDGER_ROW_HEADERS[Math.floor(tileY / 3) % LEDGER_ROW_HEADERS.length]!;
    ctx.save();
    ctx.font = `${Math.max(5, Math.round(6 * zoom))}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = withAlpha(theme.label.fill, 0.18);
    ctx.fillText(header, x - 5 * zoom, y + 1 * zoom, 12 * zoom);
    ctx.restore();
  }
}

function drawMooringRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  alpha: number,
) {
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(1, 0.75 * zoom);
  ctx.beginPath();
  ctx.moveTo(x + fromX * zoom, y + fromY * zoom);
  ctx.lineTo(x + toX * zoom, y + toY * zoom);
  ctx.stroke();
}

function drawDepthSounding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.fillStyle = withAlpha(color, alpha * 0.82);
  ctx.lineWidth = Math.max(1, 0.65 * zoom);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.4, 2.2 * zoom), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(
    Math.round(x - 0.8 * zoom),
    Math.round(y - 0.8 * zoom),
    Math.max(1, Math.round(1.6 * zoom)),
    Math.max(1, Math.round(1.6 * zoom)),
  );
  ctx.restore();
}

function drawCurrentWakeMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  ctx.beginPath();
  ctx.moveTo(x + 2 * zoom, y - 5 * zoom);
  ctx.lineTo(x + 8 * zoom, y - 1 * zoom);
  ctx.lineTo(x + 2 * zoom, y + 3 * zoom);
  ctx.moveTo(x - 5 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 1 * zoom, y + 2 * zoom);
  ctx.lineTo(x - 5 * zoom, y + 6 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawBreakwaterFoam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom, y + 5 * zoom);
  ctx.quadraticCurveTo(x - 8 * zoom, y + 1 * zoom, x - 4 * zoom, y + 5 * zoom);
  ctx.quadraticCurveTo(x, y + 9 * zoom, x + 4 * zoom, y + 5 * zoom);
  ctx.quadraticCurveTo(x + 8 * zoom, y + 1 * zoom, x + 12 * zoom, y + 5 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawCalmMirrorBands(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const hash = tileHash(tileX, tileY, 307);
  const phase = motion.reducedMotion
    ? ((hash % 100) / 100)
    : ((motion.timeSeconds / CALM_MIRROR_PERIOD_SECONDS + ((hash % 100) / 100)) % 1);
  const bandY = y + (-4 + phase * 8) * zoom;
  const alpha = (0.1 + ((hash >>> 9) % 5) * 0.012) * theme.motion.strokeAlphaScale;
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.accent, alpha);
  ctx.lineWidth = Math.max(1, 0.55 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 13 * zoom, bandY);
  ctx.lineTo(x + 13 * zoom, bandY);
  if (hash % 4 === 0) {
    const lowerY = bandY + 2.2 * zoom;
    ctx.moveTo(x - 9 * zoom, lowerY);
    ctx.lineTo(x + 10 * zoom, lowerY);
  }
  ctx.stroke();
  ctx.restore();
}

// Calm Anchorage signature: pebble-in-still-water concentric rings whose
// radius pulses slowly outward.
function drawCalmReflectionRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const phase = motion.reducedMotion
    ? 0.5
    : (fastSin(motion.timeSeconds * 0.42 + tileX * 0.31 + tileY * 0.23) + 1) * 0.5;
  const radius = (4 + phase * 2.4) * zoom * theme.motion.amplitudeScale;
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.wave, 0.55 * (1 - phase * 0.4) * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 1.05 * zoom);
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(theme.accent, 0.4 * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  const innerR = Math.max(1, radius - 2 * zoom);
  ctx.ellipse(x, y, innerR, innerR * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Watch Breakwater signature: a small channel-marker buoy with a vertical
// stripe; bobs gently with the clock.
function drawWatchChannelBuoy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const bob = motion.reducedMotion
    ? 0
    : fastSin(motion.timeSeconds * 0.95 + tileX * 0.41 + tileY * 0.27) * 0.7 * zoom;
  const cx = x + 3 * zoom;
  const cy = y - 1 * zoom + bob;
  ctx.save();
  ctx.fillStyle = withAlpha(theme.accent, 0.82 * theme.motion.strokeAlphaScale);
  ctx.fillRect(
    Math.round(cx - 1 * zoom),
    Math.round(cy - 2 * zoom),
    Math.max(2, Math.round(2 * zoom)),
    Math.max(3, Math.round(4 * zoom)),
  );
  ctx.fillStyle = withAlpha(theme.wave, 0.7);
  ctx.fillRect(
    Math.round(cx - 1 * zoom),
    Math.round(cy - 0.5 * zoom),
    Math.max(2, Math.round(2 * zoom)),
    Math.max(1, Math.round(1 * zoom)),
  );
  ctx.strokeStyle = withAlpha(theme.accent, 0.65);
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 2.5 * zoom);
  ctx.lineTo(cx, cy - 5 * zoom);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(theme.wave, 0.5);
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  ctx.beginPath();
  ctx.moveTo(cx - 4 * zoom, cy + 2.5 * zoom);
  ctx.quadraticCurveTo(cx, cy + 1.4 * zoom, cx + 4 * zoom, cy + 2.5 * zoom);
  ctx.stroke();
  ctx.restore();
}

// Alert Channel signature: directional current chevrons pointing toward
// Pharosville (south-west on iso) so the strip reads as flowing water
// funneling into the harbor.
function drawAlertCurrentChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(theme.accent, 0.7 * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1.4, 1.5 * zoom);
  ctx.beginPath();
  ctx.moveTo(x + 6 * zoom, y - 2 * zoom);
  ctx.lineTo(x - 4 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 6 * zoom, y + 6 * zoom);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(theme.accent, 0.5 * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1.2, 1.3 * zoom);
  ctx.beginPath();
  ctx.moveTo(x + 10 * zoom, y - 5 * zoom);
  ctx.lineTo(x, y - 1 * zoom);
  ctx.lineTo(x + 10 * zoom, y + 3 * zoom);
  ctx.stroke();
  ctx.restore();
}

// Warning Shoals signature: a cluster of three exposed reef triangles —
// submerged rocks breaking the surface. Static (rocks don't move).
function drawWarningReefIdentity(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const variant = tileHash(tileX, tileY, 557) % 10;
  if (variant < 2) {
    drawWarningReefCluster(ctx, x, y, zoom, theme);
    drawWarningBreachPip(ctx, x - 7 * zoom, y + 5 * zoom, zoom, theme);
    return;
  }
  if (variant < 6) {
    const offsetX = ((tileHash(tileX, tileY, 563) % 5) - 2) * zoom;
    drawWarningSingleRockFoam(ctx, x + offsetX, y + 2 * zoom, zoom, theme);
    drawWarningBreachPip(ctx, x + 7 * zoom - offsetX, y - 1 * zoom, zoom, theme);
    return;
  }
  if ((tileX * 5 + tileY * 7) % 4 === 0) {
    drawWarningBreachPip(ctx, x - 2 * zoom, y + 2 * zoom, zoom, theme);
  }
}

function drawWarningReefCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
) {
  ctx.save();
  ctx.fillStyle = withAlpha(theme.accent, 0.78);
  ctx.strokeStyle = withAlpha(theme.wave, 0.65);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  // Larger central rock — the dominant landmark of the cluster.
  ctx.beginPath();
  ctx.moveTo(x - 2 * zoom, y + 1 * zoom);
  ctx.lineTo(x + 4 * zoom, y - 5 * zoom);
  ctx.lineTo(x + 8 * zoom, y + 2 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Two smaller satellites to either side.
  ctx.fillStyle = withAlpha(theme.accent, 0.62);
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 7 * zoom, y + 4 * zoom);
  ctx.lineTo(x - 4 * zoom, y + 1 * zoom);
  ctx.lineTo(x - 1 * zoom, y + 5 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 5 * zoom, y + 5 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 11 * zoom, y + 6 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Foam ring around the main rock — communicates "submerged hazard".
  ctx.strokeStyle = withAlpha(theme.wave, 0.5);
  ctx.lineWidth = Math.max(1, 0.7 * zoom);
  ctx.beginPath();
  ctx.ellipse(x + 3 * zoom, y + 1 * zoom, 7 * zoom, 2.2 * zoom, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWarningSingleRockFoam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
) {
  ctx.save();
  ctx.fillStyle = "rgba(28, 24, 20, 0.72)";
  ctx.strokeStyle = withAlpha(theme.wave, 0.6);
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 4 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 1 * zoom, y - 4 * zoom);
  ctx.lineTo(x + 5 * zoom, y + 3 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = withAlpha(theme.wave, 0.48);
  ctx.lineWidth = Math.max(1, 0.75 * zoom);
  ctx.beginPath();
  ctx.ellipse(x + 1 * zoom, y + 1 * zoom, 8 * zoom, 2.6 * zoom, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWarningBreachPip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
) {
  const size = Math.max(2, Math.round(2 * zoom));
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.wave, 0.44);
  ctx.lineWidth = Math.max(1, 0.65 * zoom);
  ctx.beginPath();
  ctx.ellipse(x, y, 4.2 * zoom, 1.7 * zoom, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(22, 19, 17, 0.78)";
  ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  ctx.restore();
}

function drawDangerWhitecapCurl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const bend = motion.reducedMotion
    ? 0
    : fastSin(motion.timeSeconds * 1.35 + tileX * 0.47 + tileY * 0.31) * 1.4 * zoom * theme.motion.amplitudeScale;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(5, 8, 15, 0.48)";
  ctx.lineWidth = Math.max(2, 2.6 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y - 1 * zoom + bend * 0.25);
  ctx.quadraticCurveTo(x - 2 * zoom, y - 7 * zoom + bend, x + 7 * zoom, y - 2 * zoom);
  ctx.quadraticCurveTo(x + 11 * zoom, y + 1 * zoom, x + 6 * zoom, y + 5 * zoom);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(theme.wave, 0.65);
  ctx.lineWidth = Math.max(1.8, 2.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y - 2 * zoom + bend * 0.2);
  ctx.quadraticCurveTo(x - 2 * zoom, y - 6 * zoom + bend, x + 6 * zoom, y - 2 * zoom);
  ctx.quadraticCurveTo(x + 10 * zoom, y + 1 * zoom, x + 5 * zoom, y + 4 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawDangerSprayStreaks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const hash = tileHash(tileX, tileY, 673);
  const gust = motion.reducedMotion ? 0 : fastSin(motion.timeSeconds * 1.8 + (hash % 41) * 0.13) * 1.2 * zoom;
  const count = 3 + (hash % 2);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = withAlpha(theme.wave, 0.55);
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const sx = x + ((((hash >>> (i * 5)) & 15) - 8) * 1.7) * zoom + gust;
    const sy = y + ((((hash >>> (i * 5 + 4)) & 7) - 3) * 1.5) * zoom;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (3.4 + i * 0.45) * zoom, sy - (1.7 + (i % 2) * 0.8) * zoom);
  }
  ctx.stroke();
  ctx.restore();
}

function drawDangerRipRibbon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const travel = motion.reducedMotion ? 0.38 : (motion.timeSeconds % DANGER_RIP_PERIOD_SECONDS) / DANGER_RIP_PERIOD_SECONDS;
  const phase = ((tileX * 0.17 + tileY * 0.29 - travel) % 1 + 1) % 1;
  const alpha = Math.max(0, 1 - Math.abs(phase - 0.5) / 0.12) * 0.34;
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.accent, alpha * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 1.05 * zoom);
  ctx.setLineDash([4.5 * zoom, 2.5 * zoom]);
  ctx.beginPath();
  ctx.moveTo(x - 15 * zoom, y + 6 * zoom);
  ctx.quadraticCurveTo(x - 3 * zoom, y - 5 * zoom, x + 15 * zoom, y - 4 * zoom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Danger Strait signature: animated whitecap-spray bursts, with a static
// fallback for reduced motion so the zone still reads in static frames.
function drawDangerStormBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const flicker = motion.reducedMotion
    ? 1.0
    : fastSin(motion.timeSeconds * 2.4 + tileX * 0.61 + tileY * 0.43);
  if (!motion.reducedMotion && flicker < 0.6) return;
  const intensity = motion.reducedMotion ? 0.7 : Math.min(1, 0.6 + (flicker - 0.6) * 1.9);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Bright zig-zag spray streak (whitecap break).
  ctx.strokeStyle = withAlpha(theme.wave, 0.92 * intensity * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1.5, 1.7 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 7 * zoom, y - 2 * zoom);
  ctx.lineTo(x - 3 * zoom, y - 6 * zoom);
  ctx.lineTo(x + 1 * zoom, y - 1 * zoom);
  ctx.lineTo(x + 6 * zoom, y - 5 * zoom);
  ctx.stroke();
  // Secondary trailing streak underneath.
  ctx.strokeStyle = withAlpha(theme.accent, 0.68 * intensity * theme.motion.strokeAlphaScale);
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 5 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 1 * zoom, y + 5 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 2 * zoom);
  ctx.stroke();
  // Spume dots flung from the whitecap.
  ctx.fillStyle = withAlpha(theme.wave, 0.85 * intensity);
  const dot = Math.max(2, Math.round(2.2 * zoom));
  ctx.fillRect(Math.round(x + 7 * zoom), Math.round(y - 7 * zoom), dot, dot);
  ctx.fillRect(Math.round(x - 9 * zoom), Math.round(y + 1 * zoom), dot, dot);
  ctx.fillRect(Math.round(x + 4 * zoom), Math.round(y + 5 * zoom), dot, dot);
  ctx.restore();
}

// Ledger Mooring signature: Roman-numeral-style tally tick marks —
// administrative registry strokes. Static; ledgers don't pulse.
function drawLedgerTallyMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  theme: ZoneVisualTheme,
  tileX: number,
  tileY: number,
) {
  const count = ((tileX * 3 + tileY * 5) % 3) + 1;
  ctx.save();
  ctx.strokeStyle = withAlpha(theme.wave, 0.85);
  ctx.lineWidth = Math.max(1.4, 1.3 * zoom);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i += 1) {
    const tx = x - 3.5 * zoom + i * 2.8 * zoom;
    ctx.beginPath();
    ctx.moveTo(tx, y - 3 * zoom);
    ctx.lineTo(tx, y + 3 * zoom);
    ctx.stroke();
  }
  // Crossbar through the strokes when the count maxes out — closed-five
  // tally flavor (purely visual; not an analytical count claim).
  if (count === 3) {
    ctx.strokeStyle = withAlpha(theme.accent, 0.78);
    ctx.lineWidth = Math.max(1.2, 1.1 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 5 * zoom, y + 0.5 * zoom);
    ctx.lineTo(x + 3.5 * zoom, y - 3 * zoom);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLandTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  kind: TerrainKind,
  tileX: number,
  tileY: number,
  asset: NonNullable<ReturnType<PharosVilleAssetManager["get"]>> | null,
) {
  const width = 32 * zoom;
  const height = 16 * zoom;
  drawDiamond(ctx, x, y, width, height, terrainColor(kind));
  if (asset) {
    drawTerrainAsset(ctx, asset, x, y, zoom, 0.62);
  }

  if (isElevatedTileKind(kind)) {
    drawTileLowerFacet(ctx, x, y, width, height, TERRAIN_TEXTURE.cliffFace);
  }

  if (isShoreTileKind(kind)) {
    drawShoreFoam(ctx, x, y, zoom, tileX, tileY);
  }
}

function drawTerrainAsset(
  ctx: CanvasRenderingContext2D,
  asset: NonNullable<ReturnType<PharosVilleAssetManager["get"]>>,
  x: number,
  y: number,
  zoom: number,
  alpha = 1,
) {
  const scale = zoom * TERRAIN_ASSET_SCALE;
  if (alpha < 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawAsset(ctx, asset, x, y + TILE_HEIGHT * zoom * 0.46, scale);
    ctx.restore();
    return;
  }
  drawAsset(ctx, asset, x, y + TILE_HEIGHT * zoom * 0.46, scale);
}

function drawShoreFoam(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, tileX: number, tileY: number) {
  ctx.save();
  ctx.strokeStyle = TERRAIN_TEXTURE.foam;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  if ((tileX + tileY) % 2 === 0) {
    ctx.moveTo(x - 12 * zoom, y + 1 * zoom);
    ctx.lineTo(x - 2 * zoom, y + 6 * zoom);
  } else {
    ctx.moveTo(x + 2 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 12 * zoom, y + 1 * zoom);
  }
  ctx.stroke();
  ctx.strokeStyle = TERRAIN_TEXTURE.sandLight;
  ctx.beginPath();
  ctx.moveTo(x - 6 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 6 * zoom, y + 1 * zoom);
  ctx.stroke();
  ctx.restore();
}

import { ambientSeaPhase } from "../../systems/motion-types";
import {
  waterTerrainStyle,
  zoneThemeForTerrain,
  type WaterTerrainStyle,
  type WaterTextureKind,
  type ZoneMotionTheme,
} from "../../systems/palette";
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from "../../systems/projection";
import { SEAWALL_RENDER_PLACEMENTS, seawallBarrierDistance, type SeawallPlacement } from "../../systems/seawall";
import { tileKey } from "../../systems/tile-key";
import { isWaterTileKind } from "../../systems/world-layout";
import type { PharosVilleMap, PharosVilleTile, TerrainKind } from "../../systems/world-types";
import { withAlpha } from "../canvas-primitives";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";
import { isScreenPointInViewport, visibleTileBoundsForCamera } from "../viewport";

type CoastEdge = "east" | "north" | "south" | "west";

const EDGE_OFFSETS: Record<CoastEdge, { x: number; y: number }> = {
  east: { x: 1, y: 0 },
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

interface FoamSettings {
  alpha: number;
  dash: number[];
  lineWidth: number;
}

const tilesByKeyCache = new WeakMap<PharosVilleMap, Map<string, PharosVilleTile>>();
const coastalCandidatesCache = new WeakMap<PharosVilleMap, CoastalWaterCandidate[]>();
let cachedSeawallSprayAnchors: readonly SeawallSprayAnchor[] | null = null;

// Scratch dash buffer reused across drawCoastEdgeWash calls. The longest
// dash pattern in foamSettings is 4 entries; we reuse this Array (resizing
// length when needed) instead of allocating a fresh one per coast edge.
const dashScratch: number[] = [0, 0, 0, 0];

interface CoastalWaterCandidate {
  coastEdges: CoastEdge[];
  style: WaterTerrainStyle;
  /**
   * `ZONE_THEMES` motion scalars for this tile's terrain. Defaults to
   * `{ amplitudeScale: 1, strokeAlphaScale: 1 }` so terrains without zone
   * tuning render byte-identical to the pre-Phase-2.7 path.
   */
  motion: ZoneMotionTheme;
  tile: PharosVilleTile;
}

export interface SeawallSprayAnchor {
  intensity: number;
  phase: number;
  rotation: number;
  tile: { x: number; y: number };
}

type NearshoreMotifRenderer = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  motion: ZoneMotionTheme,
) => void;

const NEARSHORE_MOTIF_RENDERERS: Partial<Record<WaterTextureKind, NearshoreMotifRenderer>> = {
  alert: drawAlertCurrentChevron,
  calm: drawCalmSandbar,
  harbor: drawHarborRipples,
  ledger: drawLedgerTally,
  storm: drawStormWhitecap,
  warning: drawWarningShoalFlecks,
  watch: drawWatchCrosswind,
};

function tilesByKeyForMap(map: PharosVilleMap): Map<string, PharosVilleTile> {
  let cached = tilesByKeyCache.get(map);
  if (!cached) {
    cached = new Map(map.tiles.map((tile) => [tileKey(tile), tile]));
    tilesByKeyCache.set(map, cached);
  }
  return cached;
}

export function drawCoastalWaterStaticDetails({ camera, ctx, height, width, world, visibleTileBoundsCache }: DrawPharosVilleInput) {
  const bounds = visibleTileBoundsForCamera({
    camera,
    mapHeight: world.map.height,
    mapWidth: world.map.width,
    tileMargin: 3,
    viewportHeight: height,
    viewportWidth: width,
  }, visibleTileBoundsCache);
  const viewportMarginX = 46 * camera.zoom;
  const viewportMarginY = 28 * camera.zoom;
  if (!bounds) return 0;
  const candidates = coastalCandidatesForMap(world.map);
  let drawnTileCount = 0;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const candidate of candidates) {
    const tile = candidate.tile;
    if (tile.x < bounds.minX || tile.x > bounds.maxX || tile.y < bounds.minY || tile.y > bounds.maxY) continue;
    const point = tileToScreen(tile, camera);
    if (!isScreenPointInViewport(point, width, height, viewportMarginX, viewportMarginY)) continue;

    drawnTileCount += 1;
    drawCoastEdgeWash(
      ctx,
      point.x,
      point.y,
      camera.zoom,
      candidate.style,
      candidate.coastEdges,
      tile.x,
      tile.y,
      candidate.motion,
    );
  }
  ctx.restore();
  return drawnTileCount;
}

export function drawCoastalWaterDetails({ camera, ctx, height, motion, width, world, visibleTileBoundsCache }: DrawPharosVilleInput) {
  const bounds = visibleTileBoundsForCamera({
    camera,
    mapHeight: world.map.height,
    mapWidth: world.map.width,
    tileMargin: 3,
    viewportHeight: height,
    viewportWidth: width,
  }, visibleTileBoundsCache);
  const viewportMarginX = 46 * camera.zoom;
  const viewportMarginY = 28 * camera.zoom;
  if (!bounds) return 0;
  const candidates = coastalCandidatesForMap(world.map);
  let drawnTileCount = 0;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const candidate of candidates) {
    const tile = candidate.tile;
    if (tile.x < bounds.minX || tile.x > bounds.maxX || tile.y < bounds.minY || tile.y > bounds.maxY) continue;
    const point = tileToScreen(tile, camera);
    if (!isScreenPointInViewport(point, width, height, viewportMarginX, viewportMarginY)) continue;

    drawnTileCount += 1;
    drawNearshoreWaterMotif(
      ctx,
      point.x,
      point.y,
      camera.zoom,
      candidate.style,
      tile.x,
      tile.y,
      motion,
      candidate.motion,
    );
  }
  drawSeawallSprayPlumes(ctx, camera, motion, width, height);
  ctx.restore();
  return drawnTileCount;
}

export function seawallSprayAnchorsFromPlacements(
  placements: readonly Pick<SeawallPlacement, "rotation" | "tile">[],
  distanceForTile: (tile: { x: number; y: number }) => number = seawallBarrierDistance,
): readonly SeawallSprayAnchor[] {
  const anchors: SeawallSprayAnchor[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index]!;
    const tile = {
      x: Math.round(placement.tile.x * 10) / 10,
      y: Math.round(placement.tile.y * 10) / 10,
    };
    const key = `${tile.x}.${tile.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const distance = distanceForTile(tile);
    const intensity = Math.max(0.18, Math.min(1, 1.05 - distance * 0.28));
    anchors.push({
      intensity,
      phase: ((index * 0.173) % 1 + 1) % 1,
      rotation: placement.rotation,
      tile,
    });
  }
  return anchors;
}

export function seawallSprayPulse(phase: number, timeSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.72;
  return 0.55 + 0.45 * ((Math.sin(timeSeconds * 1.45 + phase * Math.PI * 2) + 1) * 0.5);
}

function seawallSprayAnchorsForRender(): readonly SeawallSprayAnchor[] {
  if (!cachedSeawallSprayAnchors) {
    cachedSeawallSprayAnchors = seawallSprayAnchorsFromPlacements(SEAWALL_RENDER_PLACEMENTS);
  }
  return cachedSeawallSprayAnchors;
}

function drawSeawallSprayPlumes(
  ctx: CanvasRenderingContext2D,
  camera: DrawPharosVilleInput["camera"],
  motion: PharosVilleCanvasMotion,
  viewportWidth: number,
  viewportHeight: number,
) {
  const anchors = seawallSprayAnchorsForRender();
  if (anchors.length === 0) return;
  const islandCenter = tileToScreen({ x: 31, y: 31 }, camera);
  const viewportMarginX = 44 * camera.zoom;
  const viewportMarginY = 32 * camera.zoom;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const anchor of anchors) {
    const point = tileToScreen(anchor.tile, camera);
    if (!isScreenPointInViewport(point, viewportWidth, viewportHeight, viewportMarginX, viewportMarginY)) continue;
    const dx = point.x - islandCenter.x;
    const dy = point.y - islandCenter.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    drawSeawallSprayPlume(ctx, point.x, point.y, dx / len, dy / len, camera.zoom, anchor, motion);
  }
  ctx.restore();
}

function drawSeawallSprayPlume(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outwardX: number,
  outwardY: number,
  zoom: number,
  anchor: SeawallSprayAnchor,
  motion: PharosVilleCanvasMotion,
) {
  const pulse = seawallSprayPulse(anchor.phase, motion.timeSeconds, motion.reducedMotion);
  const intensity = anchor.intensity * pulse;
  const tangentX = -outwardY;
  const tangentY = outwardX;
  const rotationBias = Math.sin((anchor.rotation * Math.PI) / 180) * 0.8 * zoom;
  const baseX = x + outwardX * 2.4 * zoom;
  const baseY = y + outwardY * 2.4 * zoom;

  ctx.strokeStyle = withAlpha("#e8eef0", 0.22 * intensity);
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const lateral = (index - 1) * 2.7 * zoom + rotationBias;
    const reach = (4.5 + index * 1.1) * zoom;
    const startX = baseX + tangentX * lateral;
    const startY = baseY + tangentY * lateral;
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(
      startX + outwardX * reach * 0.5 + tangentX * 1.2 * zoom,
      startY + outwardY * reach * 0.5 + tangentY * 1.2 * zoom,
      startX + outwardX * reach,
      startY + outwardY * reach,
    );
  }
  ctx.stroke();

  ctx.fillStyle = withAlpha("#e8eef0", 0.28 * intensity);
  const dot = Math.max(1, Math.round(1.4 * zoom));
  ctx.fillRect(Math.round(baseX + outwardX * 5.5 * zoom), Math.round(baseY + outwardY * 5.5 * zoom), dot, dot);
  if (intensity > 0.42) {
    ctx.fillRect(
      Math.round(baseX + outwardX * 7 * zoom + tangentX * 2.3 * zoom),
      Math.round(baseY + outwardY * 7 * zoom + tangentY * 2.3 * zoom),
      dot,
      dot,
    );
  }
}

function tileTerrain(tile: PharosVilleTile): TerrainKind {
  return tile.terrain ?? tile.kind;
}

function coastalCandidatesForMap(map: PharosVilleMap): CoastalWaterCandidate[] {
  const cached = coastalCandidatesCache.get(map);
  if (cached) return cached;

  const tilesByKey = tilesByKeyForMap(map);
  const candidates: CoastalWaterCandidate[] = [];
  for (const tile of map.tiles) {
    const terrain = tileTerrain(tile);
    if (!isWaterTileKind(terrain)) continue;
    const coastEdges = computeCoastalEdges(tile, tilesByKey);
    if (coastEdges.length === 0) continue;
    const terrainKey = String(terrain);
    candidates.push({
      coastEdges,
      style: waterTerrainStyle(terrainKey) ?? waterTerrainStyle("water")!,
      motion: zoneThemeForTerrain(terrainKey).motion,
      tile,
    });
  }
  coastalCandidatesCache.set(map, candidates);
  return candidates;
}

function computeCoastalEdges(tile: PharosVilleTile, tilesByKey: ReadonlyMap<string, PharosVilleTile>): CoastEdge[] {
  const edges: CoastEdge[] = [];
  for (const edge of Object.keys(EDGE_OFFSETS) as CoastEdge[]) {
    const offset = EDGE_OFFSETS[edge];
    const neighbor = tilesByKey.get(tileKey({ x: tile.x + offset.x, y: tile.y + offset.y }));
    if (!neighbor) continue;
    if (!isWaterTileKind(tileTerrain(neighbor))) edges.push(edge);
  }
  return edges;
}

function drawCoastEdgeWash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  style: WaterTerrainStyle,
  coastEdges: readonly CoastEdge[],
  tileX: number,
  tileY: number,
  motion: ZoneMotionTheme,
) {
  const settings = foamSettings(style.texture);
  const width = TILE_WIDTH * zoom;
  const height = TILE_HEIGHT * zoom;
  const jitter = ((tileX * 7 + tileY * 11) % 5 - 2) * 0.45 * zoom;
  // Defaults are 1.0, so multiplying preserves the legacy dash/alpha math
  // for terrains without zone tuning.
  const ampScale = motion.amplitudeScale;
  const alphaScale = motion.strokeAlphaScale;

  for (const edge of coastEdges) {
    const [from, to] = edgePoints(x, y + jitter, width, height, edge, 1.8 * zoom);

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(4, 7, 10, 0.28)";
    ctx.lineWidth = Math.max(1.5, (settings.lineWidth + 1) * zoom);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + 1.6 * zoom);
    ctx.quadraticCurveTo(x, y + 2.8 * zoom * ampScale, to.x, to.y + 1.2 * zoom);
    ctx.stroke();

    if (dashScratch.length !== settings.dash.length) dashScratch.length = settings.dash.length;
    for (let i = 0; i < settings.dash.length; i += 1) dashScratch[i] = settings.dash[i]! * zoom;
    ctx.setLineDash(dashScratch);
    ctx.strokeStyle = withAlpha(style.wave, settings.alpha * alphaScale);
    ctx.lineWidth = Math.max(1, settings.lineWidth * zoom);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(
      x,
      y + (edge === "north" || edge === "west" ? -1.5 : 2.2) * zoom * ampScale,
      to.x,
      to.y,
    );
    ctx.stroke();

    if ((tileX * 3 + tileY * 5 + edge.length) % 3 === 0) {
      ctx.setLineDash([]);
      ctx.strokeStyle = withAlpha(style.accent, settings.alpha * 0.72 * alphaScale);
      ctx.lineWidth = Math.max(1, 0.85 * zoom);
      ctx.beginPath();
      ctx.moveTo(from.x * 0.58 + to.x * 0.42, from.y * 0.58 + to.y * 0.42 + 3 * zoom);
      ctx.lineTo(from.x * 0.38 + to.x * 0.62, from.y * 0.38 + to.y * 0.62 + 4.5 * zoom);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function foamSettings(texture: WaterTextureKind): FoamSettings {
  if (texture === "calm") return { alpha: 0.28, dash: [14, 8], lineWidth: 1 };
  if (texture === "watch") return { alpha: 0.34, dash: [7, 5, 2, 5], lineWidth: 1.05 };
  if (texture === "alert") return { alpha: 0.38, dash: [5, 4], lineWidth: 1.15 };
  if (texture === "warning") return { alpha: 0.42, dash: [4, 3, 2, 4], lineWidth: 1.3 };
  if (texture === "storm") return { alpha: 0.5, dash: [8, 3, 2, 3], lineWidth: 1.55 };
  if (texture === "ledger") return { alpha: 0.34, dash: [6, 3, 2, 3], lineWidth: 1.05 };
  if (texture === "harbor") return { alpha: 0.34, dash: [10, 6], lineWidth: 1.05 };
  if (texture === "deep") return { alpha: 0.22, dash: [12, 10], lineWidth: 0.95 };
  return { alpha: 0.31, dash: [11, 7], lineWidth: 1 };
}

function edgePoints(
  x: number,
  y: number,
  width: number,
  height: number,
  edge: CoastEdge,
  inset: number,
): [{ x: number; y: number }, { x: number; y: number }] {
  const top = { x, y: y - height / 2 + inset };
  const right = { x: x + width / 2 - inset, y };
  const bottom = { x, y: y + height / 2 - inset };
  const left = { x: x - width / 2 + inset, y };
  if (edge === "north") return [top, right];
  if (edge === "east") return [right, bottom];
  if (edge === "south") return [left, bottom];
  return [top, left];
}

function drawNearshoreWaterMotif(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  style: WaterTerrainStyle,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  zoneMotion: ZoneMotionTheme,
) {
  // Default scalars are (1, 1); multiplying them through preserves byte-
  // identical output for zones without tuning. Amplitude scales the sea-
  // phase drift; strokeAlphaScale rides on the parent globalAlpha so every
  // motif's per-stroke alpha is uniformly attenuated/boosted.
  const drift = ambientSeaPhase(motion, tileX * 0.23 + tileY * 0.31) * 0.9 * zoom * zoneMotion.amplitudeScale;
  const seed = (tileX * 19 + tileY * 23) % 6;

  ctx.save();
  if (zoneMotion.strokeAlphaScale !== 1) {
    ctx.globalAlpha = ctx.globalAlpha * zoneMotion.strokeAlphaScale;
  }
  ctx.strokeStyle = withAlpha(style.accent, 0.28);
  ctx.fillStyle = withAlpha(style.accent, 0.22);
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  const renderMotif = NEARSHORE_MOTIF_RENDERERS[style.texture] ?? drawOpenEddy;
  renderMotif(ctx, x, y + drift, zoom, seed, style, zoneMotion);
  ctx.restore();
}

function drawCalmSandbar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.accent, 0.2);
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  ctx.beginPath();
  ctx.ellipse(x + (seed - 2) * 1.2 * zoom, y + 2 * zoom, 9 * zoom, 2.2 * zoom, -0.08, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWatchCrosswind(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.wave, 0.32);
  ctx.beginPath();
  ctx.moveTo(x - (10 - seed) * zoom, y - 2 * zoom);
  ctx.lineTo(x - 2 * zoom, y + 1 * zoom);
  ctx.moveTo(x + (seed - 1) * zoom, y + 5 * zoom);
  ctx.lineTo(x + 10 * zoom, y + 2 * zoom);
  ctx.stroke();
}

function drawAlertCurrentChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.accent, 0.34);
  ctx.lineWidth = Math.max(1, zoom);
  const offset = (seed - 2) * 0.9 * zoom;
  ctx.beginPath();
  ctx.moveTo(x - 9 * zoom + offset, y - 2 * zoom);
  ctx.lineTo(x - 2 * zoom + offset, y + 2 * zoom);
  ctx.lineTo(x + 6 * zoom + offset, y - 1 * zoom);
  ctx.stroke();
}

function drawWarningShoalFlecks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.fillStyle = withAlpha(style.accent, 0.32);
  for (let index = 0; index < 3; index += 1) {
    const px = x + (index * 5 - 6 + seed * 0.6) * zoom;
    const py = y + ((index % 2) * 4 - 1) * zoom;
    ctx.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(2.5 * zoom)), Math.max(1, Math.round(1.4 * zoom)));
  }
}

function drawStormWhitecap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.wave, 0.48);
  ctx.lineWidth = Math.max(1, 1.25 * zoom);
  const offset = (seed - 2) * zoom;
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom + offset, y - 2 * zoom);
  ctx.lineTo(x - 6 * zoom + offset, y + 1 * zoom);
  ctx.lineTo(x - 1 * zoom + offset, y - 3 * zoom);
  ctx.moveTo(x + 2 * zoom + offset, y + 5 * zoom);
  ctx.lineTo(x + 8 * zoom + offset, y + 1 * zoom);
  ctx.stroke();
}

function drawLedgerTally(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.accent, 0.3);
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  const startX = x - (7 + seed * 0.3) * zoom;
  ctx.beginPath();
  for (let index = 0; index < 3; index += 1) {
    const px = startX + index * 5 * zoom;
    ctx.moveTo(px, y - 4 * zoom);
    ctx.lineTo(px + 1 * zoom, y + 4 * zoom);
  }
  ctx.moveTo(startX - 1 * zoom, y + 2 * zoom);
  ctx.lineTo(startX + 14 * zoom, y - 1 * zoom);
  ctx.stroke();
}

function drawHarborRipples(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.wave, 0.3);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y + (seed % 2) * zoom);
  ctx.lineTo(x + 8 * zoom, y + 3 * zoom);
  ctx.moveTo(x - 4 * zoom, y + 6 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 7 * zoom);
  ctx.stroke();
}

function drawOpenEddy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  seed: number,
  style: WaterTerrainStyle,
  _motion: ZoneMotionTheme,
) {
  ctx.strokeStyle = withAlpha(style.accent, 0.24);
  ctx.beginPath();
  ctx.ellipse(x + (seed - 2) * zoom, y + 1 * zoom, 7 * zoom, 2.5 * zoom, -0.08, 0.1, Math.PI * 1.6);
  ctx.stroke();
}

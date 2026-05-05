import { tileKindAt } from "../../systems/world-layout";
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from "../../systems/projection";
import type { LoadedPharosVilleAsset } from "../asset-manager";
import { drawAsset, drawDiamond } from "../canvas-primitives";
import { drawableDepth, type WorldDrawable } from "../drawable-pass";
import { drawLamp } from "./ambient";
import type { DrawPharosVilleInput } from "../render-types";

export type SceneryPropKind =
  | "agave-cluster"
  | "barrel"
  | "beacon"
  | "bollards"
  | "bougainvillea-arch"
  | "buoy"
  | "cargo-stack"
  | "citrus-tree"
  | "crate-stack"
  | "cypress"
  | "date-palm"
  | "fig-tree"
  | "grass-tuft"
  | "harbor-bell"
  | "harbor-lamp"
  | "mooring-posts"
  | "moored-dinghy-east"
  | "moored-dinghy-north"
  | "net-rack"
  | "olive-tree"
  | "planter-lavender"
  | "planter-roses"
  | "reed-bed"
  | "reef"
  | "rock"
  | "rope-coil"
  | "sea-wall"
  | "signal-post"
  | "skiff"
  | "stone-steps"
  | "sundial"
  | "timber-pile";

export interface SceneryProp {
  id: string;
  kind: SceneryPropKind;
  scale?: number;
  tile: { x: number; y: number };
}

interface CachedSceneryDrawable extends WorldDrawable {
  currentInput: DrawPharosVilleInput | null;
  readonly prop: SceneryProp;
}

export const CIVIC_VEGETATION_KINDS: ReadonlySet<SceneryPropKind> = new Set([
  "agave-cluster",
  "bougainvillea-arch",
  "citrus-tree",
  "date-palm",
  "fig-tree",
  "olive-tree",
  "planter-lavender",
  "planter-roses",
]);

const TALL_VEGETATION_KINDS: ReadonlySet<SceneryPropKind> = new Set([
  "bougainvillea-arch",
  "citrus-tree",
  "date-palm",
  "fig-tree",
  "olive-tree",
]);

const TALL_VEGETATION_DEPTH_BIAS = 4_200;

export const SCENERY_PROPS: readonly SceneryProp[] = [
  { id: "north-buoy", kind: "buoy", tile: { x: 31.2, y: 16.8 }, scale: 0.78 },
  { id: "north-signal", kind: "signal-post", tile: { x: 36.8, y: 18.7 }, scale: 0.72 },
  { id: "north-net-rack", kind: "net-rack", tile: { x: 28.3, y: 22.1 }, scale: 0.7 },
  { id: "north-rope", kind: "rope-coil", tile: { x: 33.1, y: 21.7 }, scale: 0.62 },
  { id: "north-timber", kind: "timber-pile", tile: { x: 38.8, y: 21.9 }, scale: 0.68 },
  { id: "north-grass", kind: "grass-tuft", tile: { x: 24.2, y: 24.1 }, scale: 0.74 },
  { id: "watch-reef-1", kind: "reef", tile: { x: 4.5, y: 23.6 }, scale: 0.84 },
  { id: "watch-reef-2", kind: "reef", tile: { x: 10.4, y: 40.6 }, scale: 0.74 },
  { id: "watch-buoy", kind: "buoy", tile: { x: 13.8, y: 31.8 }, scale: 0.76 },
  { id: "watch-reeds", kind: "reed-bed", tile: { x: 14.7, y: 28.8 }, scale: 0.64 },
  { id: "watch-rocks", kind: "rock", tile: { x: 12.2, y: 35.6 }, scale: 0.62 },
  { id: "west-lamp", kind: "harbor-lamp", tile: { x: 18.7, y: 31.5 }, scale: 0.78 },
  { id: "west-mooring", kind: "mooring-posts", tile: { x: 17.2, y: 33.2 }, scale: 0.78 },
  { id: "west-barrels", kind: "barrel", tile: { x: 20.1, y: 35.3 }, scale: 0.64 },
  { id: "west-steps", kind: "stone-steps", tile: { x: 19.1, y: 30.0 }, scale: 0.7 },
  { id: "south-skiff", kind: "skiff", tile: { x: 31.4, y: 45.7 }, scale: 0.82 },
  { id: "south-bollards", kind: "bollards", tile: { x: 35.6, y: 42.4 }, scale: 0.82 },
  { id: "south-rope", kind: "rope-coil", tile: { x: 27.9, y: 42.3 }, scale: 0.68 },
  { id: "south-net", kind: "net-rack", tile: { x: 30.6, y: 43.4 }, scale: 0.66 },
  { id: "south-reeds", kind: "reed-bed", tile: { x: 24.7, y: 43.3 }, scale: 0.68 },
  { id: "south-cypress", kind: "cypress", tile: { x: 38.7, y: 39.7 }, scale: 0.58 },
  { id: "east-lamp", kind: "harbor-lamp", tile: { x: 45.8, y: 31.6 }, scale: 0.88 },
  { id: "east-crates", kind: "crate-stack", tile: { x: 44.6, y: 34.8 }, scale: 0.82 },
  { id: "east-mooring", kind: "mooring-posts", tile: { x: 43.6, y: 29.4 }, scale: 0.82 },
  { id: "east-steps", kind: "stone-steps", tile: { x: 41.8, y: 36.2 }, scale: 0.7 },
  { id: "east-rope", kind: "rope-coil", tile: { x: 39.3, y: 38.4 }, scale: 0.58 },
  { id: "east-net", kind: "net-rack", tile: { x: 46.1, y: 29.1 }, scale: 0.58 },
  { id: "watch-southeast-beacon", kind: "beacon", tile: { x: 39.8, y: 50.4 }, scale: 0.9 },
  { id: "watch-southeast-reeds", kind: "reed-bed", tile: { x: 36.4, y: 49.2 }, scale: 0.6 },
  { id: "watch-southeast-reef-1", kind: "reef", tile: { x: 48.4, y: 48.4 }, scale: 0.82 },
  { id: "watch-southeast-reef-2", kind: "rock", tile: { x: 50.2, y: 50.2 }, scale: 0.68 },
  { id: "watch-southeast-buoy", kind: "buoy", tile: { x: 47.2, y: 45.7 }, scale: 0.72 },
  { id: "watch-east-buoy", kind: "buoy", tile: { x: 54.0, y: 38.6 }, scale: 0.84 },
  { id: "watch-east-signal", kind: "signal-post", tile: { x: 55.0, y: 44.0 }, scale: 0.82 },
  { id: "watch-east-reef", kind: "reef", tile: { x: 52.5, y: 47.2 }, scale: 0.72 },
  { id: "civic-sundial", kind: "sundial", tile: { x: 35.0, y: 31.0 }, scale: 0.9 },
  { id: "civic-olive-nw", kind: "olive-tree", tile: { x: 26.6, y: 29.2 }, scale: 0.62 },
  { id: "civic-palm-north", kind: "date-palm", tile: { x: 29.4, y: 27.0 }, scale: 0.54 },
  { id: "civic-palm-se", kind: "date-palm", tile: { x: 34.2, y: 33.0 }, scale: 0.56 },
  { id: "civic-lavender-w", kind: "planter-lavender", tile: { x: 27.2, y: 32.4 }, scale: 0.66 },
  { id: "civic-roses-e", kind: "planter-roses", tile: { x: 33.6, y: 30.6 }, scale: 0.62 },
  { id: "civic-roses-nw", kind: "planter-roses", tile: { x: 28.0, y: 29.8 }, scale: 0.60 },
  { id: "civic-olive-s", kind: "olive-tree", tile: { x: 29.4, y: 35.2 }, scale: 0.58 },
  { id: "civic-citrus-se", kind: "citrus-tree", tile: { x: 32.3, y: 34.9 }, scale: 0.42 },
  { id: "civic-fig-west", kind: "fig-tree", tile: { x: 27.1, y: 33.6 }, scale: 0.39 },
  { id: "civic-agave-se", kind: "agave-cluster", tile: { x: 34.0, y: 32.9 }, scale: 0.46 },
  { id: "civic-bougainvillea-ne", kind: "bougainvillea-arch", tile: { x: 31.7, y: 28.7 }, scale: 0.41 },
  { id: "cemetery-buoy", kind: "buoy", tile: { x: 4.2, y: 49.4 }, scale: 0.7 },
  { id: "cemetery-rock", kind: "rock", tile: { x: 12.2, y: 51.4 }, scale: 0.66 },
  { id: "cemetery-reef", kind: "reef", tile: { x: 10.4, y: 47.8 }, scale: 0.62 },
  { id: "cemetery-reeds", kind: "reed-bed", tile: { x: 6.2, y: 48.2 }, scale: 0.52 },
  { id: "lighthouse-lamp", kind: "harbor-lamp", tile: { x: 17.2, y: 29.0 }, scale: 0.7 },
  { id: "harbor-dinghy-east", kind: "moored-dinghy-east", tile: { x: 43.6, y: 32.4 }, scale: 0.62 },
  { id: "harbor-dinghy-south", kind: "moored-dinghy-north", tile: { x: 30.4, y: 41.6 }, scale: 0.6 },
  { id: "harbor-bell-bsc", kind: "harbor-bell", tile: { x: 22.4, y: 35.2 }, scale: 0.66 },
  { id: "harbor-bell-lighthouse", kind: "harbor-bell", tile: { x: 19.6, y: 27.8 }, scale: 0.6 },
  { id: "harbor-cargo-bsc", kind: "cargo-stack", tile: { x: 21.6, y: 37.4 }, scale: 0.62 },
  { id: "harbor-cargo-base", kind: "cargo-stack", tile: { x: 40.2, y: 37.6 }, scale: 0.6 },
] as const;

const lampSeawardTileCache = new Map<string, { x: number; y: number } | null>();
const lampLightConeSpriteCache = new Map<string, { canvas: HTMLCanvasElement; halfWidth: number; halfHeight: number }>();
const LAMP_LIGHT_CONE_RADIUS_BUCKETS = 2;
const LAMP_LIGHT_CONE_ALPHA_BUCKETS = 20;
const DYNAMIC_SCENERY_KINDS = new Set<SceneryPropKind>(["buoy", "harbor-lamp"]);
const staticSceneryDrawables = SCENERY_PROPS
  .filter((prop) => !DYNAMIC_SCENERY_KINDS.has(prop.kind))
  .map((prop) => createCachedSceneryDrawable(prop));
const dynamicSceneryDrawables = SCENERY_PROPS
  .filter((prop) => DYNAMIC_SCENERY_KINDS.has(prop.kind))
  .map((prop) => createCachedSceneryDrawable(prop));
const sceneryDrawablesScratch: WorldDrawable[] = [];

function quantizeLampConeRadius(value: number): number {
  return Math.max(0.5, Math.round(value * LAMP_LIGHT_CONE_RADIUS_BUCKETS) / LAMP_LIGHT_CONE_RADIUS_BUCKETS);
}

function quantizeLampConeAlpha(alpha: number): number {
  return Math.min(1, Math.max(0, Math.round(alpha * LAMP_LIGHT_CONE_ALPHA_BUCKETS) / LAMP_LIGHT_CONE_ALPHA_BUCKETS));
}

function getLampLightConeSprite(
  radiusX: number,
  radiusY: number,
  alpha: number,
): { canvas: HTMLCanvasElement; halfWidth: number; halfHeight: number } | null {
  if (typeof document === "undefined") return null;
  const bucketedX = quantizeLampConeRadius(radiusX);
  const bucketedY = quantizeLampConeRadius(radiusY);
  const bucketedAlpha = quantizeLampConeAlpha(alpha);
  const key = `${bucketedX}|${bucketedY}|${bucketedAlpha}`;
  const cached = lampLightConeSpriteCache.get(key);
  if (cached) return cached;

  const width = Math.max(1, Math.ceil(bucketedX * 2) + 2);
  const height = Math.max(1, Math.ceil(bucketedY * 2) + 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const offCtx = canvas.getContext("2d");
  if (!offCtx) return null;
  const cx = width / 2;
  const cy = height / 2;
  const gradient = offCtx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bucketedX, bucketedY));
  gradient.addColorStop(0, `rgba(255, 196, 102, ${bucketedAlpha})`);
  gradient.addColorStop(1, "rgba(255, 196, 102, 0)");
  offCtx.save();
  offCtx.fillStyle = gradient;
  offCtx.beginPath();
  offCtx.ellipse(cx, cy, bucketedX, bucketedY, 0, 0, Math.PI * 2);
  offCtx.fill();
  offCtx.restore();

  const entry = { canvas, halfWidth: cx, halfHeight: cy };
  lampLightConeSpriteCache.set(key, entry);
  return entry;
}

function seawardTileForLamp(prop: SceneryProp): { x: number; y: number } | null {
  const cached = lampSeawardTileCache.get(prop.id);
  if (cached !== undefined) return cached;
  const baseX = Math.round(prop.tile.x);
  const baseY = Math.round(prop.tile.y);
  const cardinals = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  for (let step = 1; step <= 2; step += 1) {
    for (const dir of cardinals) {
      const tx = baseX + dir.dx * step;
      const ty = baseY + dir.dy * step;
      if (tileKindAt(tx, ty) === "water" || tileKindAt(tx, ty) === "deep-water") {
        const tile = { x: prop.tile.x + dir.dx * step, y: prop.tile.y + dir.dy * step };
        lampSeawardTileCache.set(prop.id, tile);
        return tile;
      }
    }
  }
  lampSeawardTileCache.set(prop.id, null);
  return null;
}

function drawLampLightCone(input: DrawPharosVilleInput, prop: SceneryProp) {
  const seaward = seawardTileForLamp(prop);
  if (!seaward) return;
  const { camera, ctx, motion } = input;
  const center = tileToScreen(seaward, camera);
  const baseAlpha = 0.18;
  const breath = 0.06;
  const alpha = motion.reducedMotion
    ? baseAlpha
    : baseAlpha + breath * Math.sin(motion.timeSeconds * 0.9 + prop.tile.y);
  const rx = TILE_WIDTH * 0.7 * camera.zoom;
  const ry = TILE_HEIGHT * 0.6 * camera.zoom;
  const sprite = getLampLightConeSprite(rx, ry, alpha);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  if (sprite) {
    ctx.drawImage(
      sprite.canvas,
      center.x - sprite.halfWidth,
      center.y - sprite.halfHeight,
      sprite.canvas.width,
      sprite.canvas.height,
    );
  } else {
    const fallback = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, rx);
    fallback.addColorStop(0, `rgba(255, 196, 102, ${alpha})`);
    fallback.addColorStop(1, "rgba(255, 196, 102, 0)");
    ctx.fillStyle = fallback;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function sceneryDrawables(input: DrawPharosVilleInput): WorldDrawable[] {
  sceneryDrawablesScratch.length = 0;
  updateSceneryDrawablesForFrame(input, staticSceneryDrawables, sceneryDrawablesScratch);
  updateSceneryDrawablesForFrame(input, dynamicSceneryDrawables, sceneryDrawablesScratch);
  return sceneryDrawablesScratch;
}

function createCachedSceneryDrawable(prop: SceneryProp): CachedSceneryDrawable {
  const drawable: CachedSceneryDrawable = {
    currentInput: null,
    depth: sceneryDrawableDepth(prop),
    draw: (ctx) => {
      drawCachedSceneryDrawable(ctx, drawable);
    },
    entityId: prop.id,
    kind: "scenery",
    pass: "body",
    prop,
    screenBounds: { height: 0, width: 0, x: 0, y: 0 },
    tieBreaker: prop.id,
  };
  return drawable;
}

function drawCachedSceneryDrawable(ctx: CanvasRenderingContext2D, drawable: CachedSceneryDrawable) {
  const input = drawable.currentInput;
  if (!input) return;
  drawSceneryProp(input.ctx === ctx ? input : { ...input, ctx }, drawable.prop);
}

function sceneryDrawableDepth(prop: SceneryProp): number {
  return drawableDepth(prop.tile) + (TALL_VEGETATION_KINDS.has(prop.kind) ? TALL_VEGETATION_DEPTH_BIAS : 0);
}

function updateSceneryDrawablesForFrame(
  input: DrawPharosVilleInput,
  drawables: readonly CachedSceneryDrawable[],
  output: WorldDrawable[],
) {
  for (const drawable of drawables) {
    const p = tileToScreen(drawable.prop.tile, input.camera);
    const size = 26 * (drawable.prop.scale ?? 1) * input.camera.zoom;
    drawable.currentInput = input;
    drawable.screenBounds.x = p.x - size / 2;
    drawable.screenBounds.y = p.y - size / 2;
    drawable.screenBounds.width = size;
    drawable.screenBounds.height = size;
    output.push(drawable);
  }
}

export function drawSceneryProp(input: DrawPharosVilleInput, prop: SceneryProp) {
  const { camera, ctx, motion } = input;
  const p = tileToScreen(prop.tile, camera);
  const scale = camera.zoom * (prop.scale ?? 1);
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const wobble = motion.reducedMotion
    ? 0
    : Math.sin(time * 3.4 + prop.tile.x * 1.7 + prop.tile.y * 2.3);
  ctx.save();
  if (prop.kind === "buoy") {
    const bob = Math.sin(time * 0.9 + prop.tile.x) * 1.2 * scale;
    drawBuoy(ctx, p.x, p.y + bob, scale);
  } else if (prop.kind === "harbor-lamp") {
    drawLampLightCone(input, prop);
    drawLamp(ctx, p.x, p.y, scale, time * 0.9 + prop.tile.y);
  } else if (prop.kind === "crate-stack") {
    drawCrateStack(ctx, p.x + wobble, p.y, scale);
  } else if (prop.kind === "barrel") {
    drawBarrels(ctx, p.x + wobble, p.y, scale);
  } else if (prop.kind === "bollards") {
    drawBollards(ctx, p.x, p.y, scale);
  } else if (prop.kind === "cypress") {
    drawCypress(ctx, p.x, p.y, scale);
  } else if (prop.kind === "grass-tuft") {
    drawCoastalGrass(ctx, p.x, p.y, scale);
  } else if (prop.kind === "mooring-posts") {
    drawMooringPosts(ctx, p.x, p.y, scale);
  } else if (prop.kind === "net-rack") {
    drawNetRack(ctx, p.x + wobble, p.y, scale);
  } else if (prop.kind === "reed-bed") {
    drawReedBed(ctx, p.x, p.y, scale);
  } else if (prop.kind === "reef") {
    drawReef(ctx, p.x, p.y, scale);
  } else if (prop.kind === "rock") {
    drawHarborRock(ctx, p.x, p.y, scale);
  } else if (prop.kind === "rope-coil") {
    drawRopeCoil(ctx, p.x + wobble, p.y, scale);
  } else if (prop.kind === "sea-wall") {
    drawSeaWallPiece(ctx, p.x, p.y, scale);
  } else if (prop.kind === "signal-post" || prop.kind === "beacon") {
    drawSignalPost(ctx, p.x, p.y, scale, prop.kind === "beacon");
  } else if (prop.kind === "skiff") {
    drawMiniSkiff(ctx, p.x, p.y, scale);
  } else if (prop.kind === "stone-steps") {
    drawStoneSteps(ctx, p.x, p.y, scale);
  } else if (prop.kind === "sundial") {
    drawSundial(input, p.x, p.y, scale);
  } else if (prop.kind === "olive-tree") {
    const sprite = input.assets?.get("prop.olive-tree");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "date-palm") {
    const sprite = input.assets?.get("prop.date-palm");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "planter-lavender") {
    const sprite = input.assets?.get("prop.planter-lavender");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "planter-roses") {
    const sprite = input.assets?.get("prop.planter-roses");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "fig-tree") {
    const sprite = input.assets?.get("prop.fig-tree");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "citrus-tree") {
    const sprite = input.assets?.get("prop.citrus-tree");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "bougainvillea-arch") {
    const sprite = input.assets?.get("prop.bougainvillea-arch");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "agave-cluster") {
    const sprite = input.assets?.get("prop.agave-cluster");
    if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
  } else if (prop.kind === "moored-dinghy-north") {
    const sprite = input.assets?.get("prop.moored-dinghy-north");
    if (sprite) drawDinghy(ctx, sprite, p.x, p.y, scale, time, prop.tile);
  } else if (prop.kind === "moored-dinghy-east") {
    const sprite = input.assets?.get("prop.moored-dinghy-east");
    if (sprite) drawDinghy(ctx, sprite, p.x, p.y, scale, time, prop.tile);
  } else if (prop.kind === "harbor-bell") {
    const sprite = input.assets?.get("prop.harbor-bell");
    if (sprite) drawHarborBell(ctx, sprite, p.x, p.y, scale, time, prop.tile);
  } else if (prop.kind === "cargo-stack") {
    const sprite = input.assets?.get("prop.cargo-stack");
    if (sprite) drawAsset(ctx, sprite, p.x + wobble, p.y, scale);
  } else if (prop.kind === "timber-pile") {
    drawTimberPile(ctx, p.x, p.y, scale);
  }
  ctx.restore();
}

function drawDinghy(
  ctx: CanvasRenderingContext2D,
  sprite: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
  time: number,
  tile: { x: number; y: number },
) {
  const bob = time === 0 ? 0 : Math.sin(time * 0.9 + tile.x + 0.7) * 1.2 * scale;
  const roll = time === 0 ? 0 : Math.sin(time * 0.6 + tile.y + 1.3) * 0.04;
  if (roll === 0) {
    drawAsset(ctx, sprite, x, y + bob, scale);
    return;
  }
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(roll);
  drawAsset(ctx, sprite, 0, 0, scale);
  ctx.restore();
}

function drawHarborBell(
  ctx: CanvasRenderingContext2D,
  sprite: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
  time: number,
  tile: { x: number; y: number },
) {
  const sway = time === 0 ? 0 : Math.sin(time * 1.4 + tile.x * 0.9 + tile.y * 1.3) * 0.08;
  if (sway === 0) {
    drawAsset(ctx, sprite, x, y, scale);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  drawAsset(ctx, sprite, 0, 0, scale);
  ctx.restore();
}

function drawBuoy(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "rgba(7, 10, 12, 0.26)";
  ctx.beginPath();
  ctx.ellipse(x, y + 5 * scale, 8 * scale, 2.6 * scale, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9b974";
  ctx.fillRect(Math.round(x - 2.5 * scale), Math.round(y - 8 * scale), Math.max(1, Math.round(5 * scale)), Math.max(1, Math.round(13 * scale)));
  ctx.fillStyle = "#b95437";
  ctx.fillRect(Math.round(x - 3 * scale), Math.round(y - 4 * scale), Math.max(1, Math.round(6 * scale)), Math.max(1, Math.round(4 * scale)));
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeRect(Math.round(x - 2.5 * scale), Math.round(y - 8 * scale), Math.max(1, Math.round(5 * scale)), Math.max(1, Math.round(13 * scale)));
}

function drawCrateStack(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const crates = [[-8, -4, "#6f4a2c"], [0, -6, "#8a6840"], [-2, -14, "#6d4c2f"]] as const;
  ctx.fillStyle = "rgba(7, 10, 12, 0.26)";
  drawDiamond(ctx, x, y + 4 * scale, 25 * scale, 9 * scale, ctx.fillStyle);
  for (const [dx, dy, fill] of crates) {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x + dx * scale), Math.round(y + dy * scale), Math.max(1, Math.round(10 * scale)), Math.max(1, Math.round(8 * scale)));
    ctx.strokeStyle = "#2d1b10";
    ctx.lineWidth = Math.max(1, 0.8 * scale);
    ctx.strokeRect(Math.round(x + dx * scale), Math.round(y + dy * scale), Math.max(1, Math.round(10 * scale)), Math.max(1, Math.round(8 * scale)));
  }
}

function drawBarrels(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  for (const [dx, dy] of [[-5, 0], [2, -2], [6, 2]] as const) {
    ctx.fillStyle = "#745133";
    ctx.beginPath();
    ctx.ellipse(x + dx * scale, y + dy * scale, 4 * scale, 6 * scale, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2d1b10";
    ctx.lineWidth = Math.max(1, 0.8 * scale);
    ctx.stroke();
    ctx.strokeStyle = "rgba(230, 198, 130, 0.38)";
    ctx.beginPath();
    ctx.moveTo(x + (dx - 3) * scale, y + dy * scale);
    ctx.lineTo(x + (dx + 3) * scale, y + dy * scale);
    ctx.stroke();
  }
}

function drawBollards(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  for (const offset of [-12, -4, 4, 12]) {
    ctx.fillStyle = "#231811";
    ctx.fillRect(Math.round(x + offset * scale), Math.round(y - 8 * scale), Math.max(1, Math.round(3 * scale)), Math.max(1, Math.round(10 * scale)));
    ctx.fillStyle = "#d49a3e";
    ctx.fillRect(Math.round(x + offset * scale), Math.round(y - 9 * scale), Math.max(1, Math.round(3 * scale)), Math.max(1, Math.round(2 * scale)));
  }
  ctx.strokeStyle = "rgba(69, 45, 25, 0.86)";
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y - 4 * scale);
  ctx.lineTo(x + 14 * scale, y - 3 * scale);
  ctx.stroke();
}

function drawCypress(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "rgba(7, 10, 12, 0.26)";
  drawDiamond(ctx, x + 1 * scale, y + 4 * scale, 18 * scale, 7 * scale, ctx.fillStyle);
  ctx.fillStyle = "#5b3a24";
  ctx.fillRect(Math.round(x - 1.5 * scale), Math.round(y - 22 * scale), Math.max(1, Math.round(3 * scale)), Math.max(1, Math.round(24 * scale)));
  ctx.fillStyle = "#5c5240";
  ctx.beginPath();
  ctx.moveTo(x, y - 38 * scale);
  ctx.quadraticCurveTo(x - 11 * scale, y - 24 * scale, x - 6 * scale, y - 9 * scale);
  ctx.lineTo(x + 7 * scale, y - 8 * scale);
  ctx.quadraticCurveTo(x + 10 * scale, y - 25 * scale, x, y - 38 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(156, 138, 108, 0.34)";
  ctx.beginPath();
  ctx.moveTo(x - 1 * scale, y - 33 * scale);
  ctx.quadraticCurveTo(x - 6 * scale, y - 22 * scale, x - 3 * scale, y - 13 * scale);
  ctx.lineTo(x + 1 * scale, y - 14 * scale);
  ctx.quadraticCurveTo(x + 3 * scale, y - 25 * scale, x - 1 * scale, y - 33 * scale);
  ctx.fill();
}

function drawCoastalGrass(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.strokeStyle = "#7c6b48";
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  for (const [dx, height, lean] of [[-7, 13, -3], [-3, 17, 1], [1, 14, 4], [5, 11, 2], [8, 15, -2]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx * scale, y + 4 * scale);
    ctx.quadraticCurveTo(x + (dx + lean * 0.4) * scale, y - height * 0.45 * scale, x + (dx + lean) * scale, y - height * scale);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(196, 168, 112, 0.42)";
  ctx.beginPath();
  ctx.moveTo(x - 6 * scale, y - 2 * scale);
  ctx.lineTo(x + 5 * scale, y + 2 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawMooringPosts(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 10, 12, 0.24)";
  drawDiamond(ctx, x, y + 5 * scale, 30 * scale, 9 * scale, ctx.fillStyle);
  for (const offset of [-10, 0, 10]) {
    ctx.fillStyle = "#2f2117";
    ctx.fillRect(Math.round(x + offset * scale - 1.5 * scale), Math.round(y - 15 * scale), Math.max(1, Math.round(3 * scale)), Math.max(1, Math.round(18 * scale)));
    ctx.fillStyle = "#8a6840";
    ctx.fillRect(Math.round(x + offset * scale - 2 * scale), Math.round(y - 16 * scale), Math.max(1, Math.round(4 * scale)), Math.max(1, Math.round(3 * scale)));
  }
  ctx.strokeStyle = "rgba(116, 81, 51, 0.9)";
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y - 9 * scale);
  ctx.quadraticCurveTo(x, y - 4 * scale, x + 10 * scale, y - 9 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawNetRack(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 10, 12, 0.22)";
  drawDiamond(ctx, x, y + 5 * scale, 28 * scale, 8 * scale, ctx.fillStyle);
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, 1.4 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 10 * scale, y + 2 * scale);
  ctx.lineTo(x - 10 * scale, y - 24 * scale);
  ctx.moveTo(x + 10 * scale, y + 2 * scale);
  ctx.lineTo(x + 10 * scale, y - 22 * scale);
  ctx.moveTo(x - 12 * scale, y - 17 * scale);
  ctx.lineTo(x + 12 * scale, y - 15 * scale);
  ctx.stroke();

  ctx.strokeStyle = "rgba(184, 165, 124, 0.62)";
  ctx.lineWidth = Math.max(1, 0.8 * scale);
  for (let index = 0; index < 4; index += 1) {
    const offset = -8 + index * 5;
    ctx.beginPath();
    ctx.moveTo(x + offset * scale, y - 16.5 * scale);
    ctx.lineTo(x + (offset - 2) * scale, y - 5 * scale);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x - 9 * scale, y - 11 * scale);
  ctx.lineTo(x + 9 * scale, y - 9 * scale);
  ctx.moveTo(x - 8 * scale, y - 6 * scale);
  ctx.lineTo(x + 8 * scale, y - 4 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawReedBed(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.strokeStyle = "#7c6b48";
  ctx.lineWidth = Math.max(1, 1.05 * scale);
  for (const [dx, height, lean] of [[-9, 16, -2], [-5, 20, 1], [-1, 14, 2], [4, 18, -1], [8, 13, 3]] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx * scale, y + 5 * scale);
    ctx.quadraticCurveTo(x + (dx + lean * 0.5) * scale, y - height * 0.5 * scale, x + (dx + lean) * scale, y - height * scale);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(223, 185, 90, 0.72)";
  ctx.fillRect(Math.round(x - 6 * scale), Math.round(y - 15 * scale), Math.max(1, Math.round(2 * scale)), Math.max(1, Math.round(4 * scale)));
  ctx.fillRect(Math.round(x + 5 * scale), Math.round(y - 12 * scale), Math.max(1, Math.round(2 * scale)), Math.max(1, Math.round(4 * scale)));
  ctx.strokeStyle = "rgba(186, 231, 225, 0.26)";
  ctx.beginPath();
  ctx.moveTo(x - 12 * scale, y + 5 * scale);
  ctx.lineTo(x + 11 * scale, y + 7 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawReef(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "rgba(232, 243, 233, 0.52)";
  for (const [dx, dy, w] of [[-7, -1, 11], [4, 2, 13], [0, -5, 8]] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * scale, y + dy * scale, w * scale, 2.6 * scale, -0.18, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHarborRock(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "#526776";
  drawDiamond(ctx, x, y, 17 * scale, 8 * scale, ctx.fillStyle);
  ctx.fillStyle = "rgba(19, 26, 34, 0.48)";
  drawDiamond(ctx, x + 3 * scale, y + 3 * scale, 15 * scale, 6 * scale, ctx.fillStyle);
}

function drawRopeCoil(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 10, 12, 0.22)";
  drawDiamond(ctx, x, y + 4 * scale, 20 * scale, 7 * scale, ctx.fillStyle);
  ctx.strokeStyle = "#b58a4a";
  ctx.lineWidth = Math.max(1, 1.15 * scale);
  for (const radius of [8, 5.6, 3.2]) {
    ctx.beginPath();
    ctx.ellipse(x, y - 2 * scale, radius * scale, radius * 0.48 * scale, -0.08, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = "#5e3d23";
  ctx.beginPath();
  ctx.moveTo(x + 6 * scale, y + 1 * scale);
  ctx.lineTo(x + 13 * scale, y + 3 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawSeaWallPiece(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "rgba(28, 31, 29, 0.62)";
  drawDiamond(ctx, x, y + 5 * scale, TILE_WIDTH * 1.2 * scale, TILE_HEIGHT * 0.72 * scale, ctx.fillStyle);
  ctx.fillStyle = "rgba(159, 146, 120, 0.78)";
  drawDiamond(ctx, x, y, TILE_WIDTH * scale, TILE_HEIGHT * 0.58 * scale, ctx.fillStyle);
}

function drawSignalPost(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, lit: boolean) {
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y + 3 * scale);
  ctx.lineTo(x, y - 22 * scale);
  ctx.stroke();
  ctx.fillStyle = lit ? "#f7d68a" : "#d49a3e";
  ctx.fillRect(Math.round(x - 3 * scale), Math.round(y - 23 * scale), Math.max(1, Math.round(6 * scale)), Math.max(1, Math.round(6 * scale)));
  if (lit) {
    ctx.fillStyle = "rgba(247, 214, 138, 0.24)";
    ctx.beginPath();
    ctx.ellipse(x, y - 20 * scale, 11 * scale, 5 * scale, -0.08, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMiniSkiff(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "rgba(7, 10, 12, 0.24)";
  drawDiamond(ctx, x, y + 6 * scale, 26 * scale, 8 * scale, ctx.fillStyle);
  ctx.fillStyle = "#5b3423";
  ctx.beginPath();
  ctx.moveTo(x - 12 * scale, y);
  ctx.lineTo(x + 12 * scale, y);
  ctx.lineTo(x + 6 * scale, y + 7 * scale);
  ctx.lineTo(x - 7 * scale, y + 7 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#25170f";
  ctx.lineWidth = Math.max(1, scale);
  ctx.stroke();
  ctx.fillStyle = "#efe5c6";
  ctx.beginPath();
  ctx.moveTo(x, y - 17 * scale);
  ctx.lineTo(x, y - 2 * scale);
  ctx.lineTo(x + 10 * scale, y - 5 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawStoneSteps(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 10, 12, 0.24)";
  drawDiamond(ctx, x + 1 * scale, y + 6 * scale, 28 * scale, 9 * scale, ctx.fillStyle);
  const stones = [
    { dx: -6, dy: -4, w: 20 },
    { dx: -2, dy: 1, w: 24 },
    { dx: 2, dy: 6, w: 28 },
  ] as const;
  for (const stone of stones) {
    ctx.fillStyle = "#9f9278";
    drawDiamond(ctx, x + stone.dx * scale, y + stone.dy * scale, stone.w * scale, 5.6 * scale, ctx.fillStyle);
    ctx.strokeStyle = "rgba(35, 28, 20, 0.48)";
    ctx.lineWidth = Math.max(1, 0.7 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSundial(input: DrawPharosVilleInput, x: number, y: number, scale: number) {
  const sprite = input.assets?.get("prop.sundial");
  if (!sprite) return;
  const hour = ((input.motion.wallClockHour % 24) + 24) % 24;
  if (hour >= 6 && hour <= 18) {
    const angle = Math.PI + Math.PI * ((hour - 6) / 12);
    const ctx = input.ctx;
    const length = 12 * scale;
    const gnomonX = x;
    const gnomonY = y - 4 * scale;
    ctx.save();
    ctx.strokeStyle = "rgba(20, 16, 10, 0.42)";
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(gnomonX, gnomonY);
    ctx.lineTo(gnomonX + Math.cos(angle) * length, gnomonY + Math.sin(angle) * length * 0.55);
    ctx.stroke();
    ctx.restore();
  }
  drawAsset(input.ctx, sprite, x, y, scale);
}

function drawTimberPile(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 10, 12, 0.24)";
  drawDiamond(ctx, x, y + 5 * scale, 28 * scale, 8 * scale, ctx.fillStyle);
  for (const [dx, dy, length] of [[-7, -4, 20], [-2, 0, 24], [4, -8, 18]] as const) {
    ctx.strokeStyle = "#6a4a2e";
    ctx.lineWidth = Math.max(2, 3.2 * scale);
    ctx.beginPath();
    ctx.moveTo(x + dx * scale, y + dy * scale);
    ctx.lineTo(x + (dx + length) * scale, y + (dy + 2) * scale);
    ctx.stroke();
    ctx.strokeStyle = "rgba(230, 198, 130, 0.36)";
    ctx.lineWidth = Math.max(1, 0.8 * scale);
    ctx.beginPath();
    ctx.moveTo(x + (dx + 1) * scale, y + (dy - 1) * scale);
    ctx.lineTo(x + (dx + length - 2) * scale, y + (dy + 1) * scale);
    ctx.stroke();
  }
  ctx.restore();
}

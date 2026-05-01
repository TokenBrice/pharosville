import { tileKindAt } from "../../systems/world-layout";
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from "../../systems/projection";
import { drawDiamond, drawSignBoard } from "../canvas-primitives";
import { drawableDepth, type WorldDrawable } from "../drawable-pass";
import { drawLamp } from "./ambient";
import type { DrawPharosVilleInput } from "../render-types";

type SceneryPropKind =
  | "barrel"
  | "beacon"
  | "bollards"
  | "buoy"
  | "crate-stack"
  | "cypress"
  | "grass-tuft"
  | "harbor-lamp"
  | "mooring-posts"
  | "net-rack"
  | "palm"
  | "reed-bed"
  | "reef"
  | "rock"
  | "rope-coil"
  | "sea-wall"
  | "signal-post"
  | "skiff"
  | "stone-steps"
  | "timber-pile";

interface SceneryProp {
  id: string;
  kind: SceneryPropKind;
  scale?: number;
  tile: { x: number; y: number };
}

interface CachedSceneryDrawable extends WorldDrawable {
  currentInput: DrawPharosVilleInput | null;
  readonly prop: SceneryProp;
}

const SCENERY_PROPS: readonly SceneryProp[] = [
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
  { id: "west-seawall", kind: "sea-wall", tile: { x: 18.5, y: 34.4 }, scale: 0.82 },
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
  { id: "east-seawall", kind: "sea-wall", tile: { x: 45.7, y: 33.2 }, scale: 0.92 },
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
  { id: "cemetery-lamp", kind: "harbor-lamp", tile: { x: 8.4, y: 47.0 }, scale: 0.72 },
  { id: "cemetery-rock", kind: "rock", tile: { x: 12.2, y: 51.4 }, scale: 0.66 },
  { id: "cemetery-cypress", kind: "cypress", tile: { x: 10.4, y: 47.8 }, scale: 0.52 },
  { id: "cemetery-reeds", kind: "reed-bed", tile: { x: 6.2, y: 48.2 }, scale: 0.52 },
  { id: "lighthouse-lamp", kind: "harbor-lamp", tile: { x: 17.2, y: 29.0 }, scale: 0.7 },
] as const;

const lampSeawardTileCache = new Map<string, { x: number; y: number } | null>();
const DYNAMIC_SCENERY_KINDS = new Set<SceneryPropKind>(["buoy", "harbor-lamp"]);
const staticSceneryDrawables = SCENERY_PROPS
  .filter((prop) => !DYNAMIC_SCENERY_KINDS.has(prop.kind))
  .map((prop) => createCachedSceneryDrawable(prop));
const dynamicSceneryDrawables = SCENERY_PROPS
  .filter((prop) => DYNAMIC_SCENERY_KINDS.has(prop.kind))
  .map((prop) => createCachedSceneryDrawable(prop));
const sceneryDrawablesScratch: WorldDrawable[] = [];

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
  const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, rx);
  gradient.addColorStop(0, `rgba(255, 196, 102, ${alpha})`);
  gradient.addColorStop(1, "rgba(255, 196, 102, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
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
    depth: drawableDepth(prop.tile),
    draw: (_ctx) => {
      if (!drawable.currentInput) return;
      drawSceneryProp(drawable.currentInput, drawable.prop);
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

function drawSceneryProp(input: DrawPharosVilleInput, prop: SceneryProp) {
  const { camera, ctx, motion } = input;
  const p = tileToScreen(prop.tile, camera);
  const scale = camera.zoom * (prop.scale ?? 1);
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  if (prop.kind === "buoy") {
    const bob = Math.sin(time * 0.9 + prop.tile.x) * 1.2 * scale;
    drawBuoy(ctx, p.x, p.y + bob, scale);
  } else if (prop.kind === "harbor-lamp") {
    drawLampLightCone(input, prop);
    drawLamp(ctx, p.x, p.y, scale, time * 0.9 + prop.tile.y);
  } else if (prop.kind === "crate-stack") {
    drawCrateStack(ctx, p.x, p.y, scale);
  } else if (prop.kind === "barrel") {
    drawBarrels(ctx, p.x, p.y, scale);
  } else if (prop.kind === "bollards") {
    drawBollards(ctx, p.x, p.y, scale);
  } else if (prop.kind === "cypress") {
    drawCypress(ctx, p.x, p.y, scale);
  } else if (prop.kind === "grass-tuft") {
    drawCoastalGrass(ctx, p.x, p.y, scale);
  } else if (prop.kind === "mooring-posts") {
    drawMooringPosts(ctx, p.x, p.y, scale);
  } else if (prop.kind === "net-rack") {
    drawNetRack(ctx, p.x, p.y, scale);
  } else if (prop.kind === "palm") {
    drawPalm(ctx, p.x, p.y, scale);
  } else if (prop.kind === "reed-bed") {
    drawReedBed(ctx, p.x, p.y, scale);
  } else if (prop.kind === "reef") {
    drawReef(ctx, p.x, p.y, scale);
  } else if (prop.kind === "rock") {
    drawHarborRock(ctx, p.x, p.y, scale);
  } else if (prop.kind === "rope-coil") {
    drawRopeCoil(ctx, p.x, p.y, scale);
  } else if (prop.kind === "sea-wall") {
    drawSeaWallPiece(ctx, p.x, p.y, scale);
  } else if (prop.kind === "signal-post" || prop.kind === "beacon") {
    drawSignalPost(ctx, p.x, p.y, scale, prop.kind === "beacon");
  } else if (prop.kind === "skiff") {
    drawMiniSkiff(ctx, p.x, p.y, scale);
  } else if (prop.kind === "stone-steps") {
    drawStoneSteps(ctx, p.x, p.y, scale);
  } else if (prop.kind === "timber-pile") {
    drawTimberPile(ctx, p.x, p.y, scale);
  }
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

function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.strokeStyle = "#4f331f";
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y + 3 * scale);
  ctx.lineTo(x + 4 * scale, y - 25 * scale);
  ctx.stroke();
  ctx.strokeStyle = "#2f7e48";
  ctx.lineWidth = Math.max(2, 3.2 * scale);
  for (const angle of [-0.9, -0.45, 0.05, 0.5, 0.95]) {
    ctx.beginPath();
    ctx.moveTo(x + 4 * scale, y - 25 * scale);
    ctx.lineTo(x + 4 * scale + Math.cos(angle) * 15 * scale, y - 25 * scale + Math.sin(angle) * 9 * scale);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(7, 10, 12, 0.24)";
  drawDiamond(ctx, x + 1 * scale, y + 4 * scale, 18 * scale, 7 * scale, ctx.fillStyle);
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

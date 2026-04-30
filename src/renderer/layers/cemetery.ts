import { CEMETERY_CENTER, CEMETERY_RADIUS } from "../../systems/world-layout";
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen, type IsoCamera, type ScreenPoint } from "../../systems/projection";
import { drawAsset, drawDiamond } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const CEMETERY_GLOBAL_SCALE = 0.6;
const CEMETERY_CONTEXT_SCALE = 0.82 * CEMETERY_GLOBAL_SCALE;
const CEMETERY_CONTEXT_SOURCE_CENTER = { x: 22.15, y: 41.7 } as const;

const CEMETERY_SURFACE = {
  grass: "rgba(90, 126, 72, 0.72)",
  grassEdge: "rgba(64, 96, 63, 0.56)",
  limestone: "rgba(198, 183, 142, 0.58)",
  limestoneCore: "rgba(220, 202, 154, 0.44)",
  limestoneEdge: "rgba(111, 93, 67, 0.7)",
  path: "rgba(151, 122, 79, 0.74)",
  pathLight: "rgba(232, 200, 136, 0.42)",
  post: "#3a2a1d",
  postCap: "#d2aa61",
  quayDark: "rgba(24, 38, 39, 0.74)",
  quayFoam: "rgba(194, 231, 222, 0.42)",
} as const;

export function drawCemeteryGround({ assets, camera, ctx, world }: DrawPharosVilleInput) {
  ctx.save();
  for (const tile of world.map.tiles) {
    if (tile.kind !== "land" && tile.kind !== "shore") continue;
    const value = cemeteryValue(tile.x, tile.y);
    if (value > 1.08) continue;
    const p = tileToScreen(tile, camera);
    const edge = value > 0.78;
    const inner = value < 0.52;
    drawDiamond(
      ctx,
      p.x,
      p.y,
      32 * camera.zoom,
      16 * camera.zoom,
      edge ? CEMETERY_SURFACE.grassEdge : CEMETERY_SURFACE.grass,
    );
    if (!edge) {
      drawDiamond(
        ctx,
        p.x,
        p.y + 1 * camera.zoom,
        26 * camera.zoom,
        12 * camera.zoom,
        inner ? CEMETERY_SURFACE.limestoneCore : CEMETERY_SURFACE.limestone,
      );
    }
    if ((tile.x * 17 + tile.y * 29) % 7 === 0) {
      drawCemeteryTuft(
        ctx,
        p.x + ((tile.x % 3) - 1) * 4 * camera.zoom * CEMETERY_GLOBAL_SCALE,
        p.y + 3 * camera.zoom * CEMETERY_GLOBAL_SCALE,
        camera.zoom * CEMETERY_GLOBAL_SCALE,
      );
    }
  }

  drawCemeteryQuayEdge(ctx, camera);
  drawCemeteryPath(ctx, camera);
  const terraceAsset = assets?.get("prop.memorial-terrace") ?? null;
  if (terraceAsset) {
    const terracePoint = tileToScreen(CEMETERY_CENTER, camera);
    drawAsset(
      ctx,
      terraceAsset,
      terracePoint.x,
      terracePoint.y + 7 * camera.zoom * CEMETERY_GLOBAL_SCALE,
      camera.zoom * 0.92,
    );
  }
  drawCemeteryFence(ctx, camera);
  ctx.restore();
}

function cemeteryValue(x: number, y: number) {
  return ((x - CEMETERY_CENTER.x) / CEMETERY_RADIUS.x) ** 2
    + ((y - CEMETERY_CENTER.y) / CEMETERY_RADIUS.y) ** 2;
}

function cemeteryContextTile(tile: { x: number; y: number }) {
  return {
    x: CEMETERY_CENTER.x + (tile.x - CEMETERY_CONTEXT_SOURCE_CENTER.x) * CEMETERY_CONTEXT_SCALE,
    y: CEMETERY_CENTER.y + (tile.y - CEMETERY_CONTEXT_SOURCE_CENTER.y) * CEMETERY_CONTEXT_SCALE,
  };
}

function cemeteryContextTiles(tiles: readonly { x: number; y: number }[]) {
  return tiles.map(cemeteryContextTile);
}

function drawCemeteryPath(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  const northPath = cemeteryContextTiles([
    { x: 21.25, y: 35.55 },
    { x: 21.75, y: 38.4 },
    { x: 21.6, y: 41.75 },
    { x: 22.15, y: 44.65 },
    { x: 21.7, y: 47.7 },
  ]);
  drawIsoStroke(ctx, camera, northPath, CEMETERY_SURFACE.path, 10 * CEMETERY_GLOBAL_SCALE);
  drawIsoStroke(ctx, camera, cemeteryContextTiles([
    { x: 14.55, y: 41.7 },
    { x: 17.65, y: 41.32 },
    { x: 21.75, y: 41.78 },
    { x: 25.85, y: 41.35 },
    { x: 29.7, y: 41.85 },
  ]), CEMETERY_SURFACE.limestoneEdge, 6.5 * CEMETERY_GLOBAL_SCALE);
  drawIsoStroke(ctx, camera, cemeteryContextTiles([
    { x: 16.7, y: 38.95 },
    { x: 18.4, y: 39.6 },
    { x: 19.85, y: 40.65 },
  ]), CEMETERY_SURFACE.limestoneEdge, 5.8 * CEMETERY_GLOBAL_SCALE);
  drawIsoStroke(ctx, camera, northPath, CEMETERY_SURFACE.pathLight, 2.5 * CEMETERY_GLOBAL_SCALE);
}

function drawCemeteryQuayEdge(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  const lowerEdge = cemeteryContextTiles([
    { x: 14.35, y: 44.0 },
    { x: 17.75, y: 47.9 },
    { x: 22.2, y: 48.8 },
    { x: 27.3, y: 46.85 },
    { x: 30.6, y: 42.95 },
  ]);
  const upperEdge = cemeteryContextTiles([
    { x: 14.1, y: 40.05 },
    { x: 16.8, y: 36.25 },
    { x: 21.1, y: 34.95 },
    { x: 26.2, y: 35.9 },
    { x: 30.45, y: 40.08 },
  ]);
  drawIsoStroke(ctx, camera, lowerEdge, CEMETERY_SURFACE.quayDark, 7 * CEMETERY_GLOBAL_SCALE);
  drawIsoStroke(ctx, camera, upperEdge, CEMETERY_SURFACE.limestoneEdge, 4.5 * CEMETERY_GLOBAL_SCALE);
  drawIsoStroke(ctx, camera, lowerEdge, CEMETERY_SURFACE.quayFoam, 1.6 * CEMETERY_GLOBAL_SCALE);
}

function drawCemeteryFence(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  const rails = [
    cemeteryContextTiles([
      { x: 14.05, y: 40.2 },
      { x: 16.65, y: 36.7 },
      { x: 20.95, y: 35.2 },
      { x: 25.95, y: 36.15 },
      { x: 30.15, y: 40.25 },
    ]),
    cemeteryContextTiles([
      { x: 14.1, y: 43.35 },
      { x: 17.55, y: 47.25 },
      { x: 22.1, y: 48.05 },
      { x: 26.85, y: 46.25 },
      { x: 30.2, y: 42.75 },
    ]),
  ] as const;

  for (const rail of rails) {
    drawIsoStroke(ctx, camera, rail, "rgba(63, 53, 38, 0.74)", 3 * CEMETERY_GLOBAL_SCALE);
    for (const tile of rail) {
      const p = tileToScreen(tile, camera);
      ctx.fillStyle = CEMETERY_SURFACE.post;
      ctx.fillRect(
        Math.round(p.x - 1 * camera.zoom * CEMETERY_GLOBAL_SCALE),
        Math.round(p.y - 7 * camera.zoom * CEMETERY_GLOBAL_SCALE),
        Math.max(1, Math.round(2 * camera.zoom * CEMETERY_GLOBAL_SCALE)),
        Math.max(3, Math.round(9 * camera.zoom * CEMETERY_GLOBAL_SCALE)),
      );
      ctx.fillStyle = CEMETERY_SURFACE.postCap;
      ctx.fillRect(
        Math.round(p.x - 1 * camera.zoom * CEMETERY_GLOBAL_SCALE),
        Math.round(p.y - 8 * camera.zoom * CEMETERY_GLOBAL_SCALE),
        Math.max(1, Math.round(2 * camera.zoom * CEMETERY_GLOBAL_SCALE)),
        Math.max(1, Math.round(2 * camera.zoom * CEMETERY_GLOBAL_SCALE)),
      );
    }
  }
}

function drawIsoStroke(
  ctx: CanvasRenderingContext2D,
  camera: IsoCamera,
  tiles: readonly { x: number; y: number }[],
  color: string,
  width: number,
) {
  if (tiles.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, width * camera.zoom);
  tiles.forEach((tile, index) => {
    const p = tileToScreen(tile, camera);
    if (index === 0) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  });
  ctx.stroke();
  ctx.restore();
}

function drawCemeteryTuft(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
  ctx.fillStyle = "rgba(78, 126, 68, 0.58)";
  ctx.fillRect(Math.round(x - 2 * zoom), Math.round(y), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(4 * zoom)));
  ctx.fillStyle = "rgba(45, 88, 56, 0.64)";
  ctx.fillRect(Math.round(x + 1 * zoom), Math.round(y + 1 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(3 * zoom)));
}

export function drawCemeteryContext({ camera, ctx }: DrawPharosVilleInput) {
  const contextZoom = camera.zoom * CEMETERY_CONTEXT_SCALE;
  drawCemeteryShrubs(ctx, camera);
  drawMausoleum(ctx, tileToScreen(cemeteryContextTile({ x: 16.85, y: 38.75 }), camera), contextZoom);
  drawMemorialShrine(ctx, tileToScreen(CEMETERY_CENTER, camera), contextZoom);
  drawCemeteryTree(ctx, tileToScreen(cemeteryContextTile({ x: 14.95, y: 39.05 }), camera), contextZoom, false);
  drawCemeteryTree(ctx, tileToScreen(cemeteryContextTile({ x: 29.0, y: 43.35 }), camera), contextZoom, true);
  drawStoneLantern(ctx, tileToScreen(cemeteryContextTile({ x: 24.95, y: 36.65 }), camera), contextZoom);
  drawStoneLantern(ctx, tileToScreen(cemeteryContextTile({ x: 18.65, y: 46.1 }), camera), contextZoom);
}

function drawCemeteryShrubs(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  const shrubs = [
    { x: 15.35, y: 44.65, size: 0.9 },
    { x: 17.6, y: 36.5, size: 0.72 },
    { x: 20.5, y: 47.0, size: 0.78 },
    { x: 24.8, y: 47.25, size: 0.85 },
    { x: 28.3, y: 38.95, size: 0.7 },
    { x: 28.95, y: 45.0, size: 0.92 },
    { x: 14.7, y: 41.45, size: 0.72 },
    { x: 23.8, y: 35.7, size: 0.68 },
    { x: 16.05, y: 47.1, size: 0.74 },
    { x: 29.25, y: 41.1, size: 0.76 },
  ] as const;
  for (const shrub of shrubs) {
    const p = tileToScreen(cemeteryContextTile(shrub), camera);
    drawShrub(ctx, p.x, p.y + 2 * camera.zoom, camera.zoom * shrub.size * CEMETERY_CONTEXT_SCALE);
  }
}

function drawShrub(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
  ctx.save();
  ctx.fillStyle = "#314f37";
  ctx.beginPath();
  ctx.ellipse(x, y + 2 * zoom, 9 * zoom, 4 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f8f58";
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath();
    ctx.arc(x + (index - 1) * 5 * zoom, y - index * zoom, (4 + index) * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMausoleum(ctx: CanvasRenderingContext2D, point: ScreenPoint, zoom: number) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(zoom, zoom);
  ctx.fillStyle = "rgba(18, 20, 18, 0.34)";
  ctx.beginPath();
  ctx.ellipse(0, 7, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f6f64";
  ctx.fillRect(-18, -32, 36, 28);
  ctx.fillStyle = "#b7aa88";
  ctx.fillRect(-14, -29, 28, 23);
  ctx.fillStyle = "#4e4030";
  ctx.fillRect(-7, -18, 14, 14);
  ctx.fillStyle = "#d3bf86";
  ctx.fillRect(-21, -5, 42, 6);
  ctx.fillStyle = "#7b5a3f";
  ctx.beginPath();
  ctx.moveTo(-21, -32);
  ctx.lineTo(0, -48);
  ctx.lineTo(21, -32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d9c58c";
  ctx.fillRect(-2, -57, 4, 12);
  ctx.fillRect(-7, -53, 14, 4);
  ctx.restore();
}

function drawMemorialShrine(ctx: CanvasRenderingContext2D, point: ScreenPoint, zoom: number) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(zoom, zoom);
  ctx.fillStyle = "rgba(16, 19, 16, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 8, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6c6554";
  ctx.fillRect(-20, -1, 40, 7);
  ctx.fillStyle = "#d4c089";
  ctx.fillRect(-16, -7, 32, 7);
  ctx.fillStyle = "#8e836a";
  ctx.fillRect(-14, -27, 28, 22);
  ctx.fillStyle = "#c7b78f";
  ctx.beginPath();
  ctx.moveTo(-11, -6);
  ctx.lineTo(-11, -20);
  ctx.quadraticCurveTo(-10, -31, 0, -35);
  ctx.quadraticCurveTo(10, -31, 11, -20);
  ctx.lineTo(11, -6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3b3023";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.fillStyle = "#71664f";
  ctx.fillRect(-16, -26, 5, 21);
  ctx.fillRect(11, -26, 5, 21);
  ctx.fillStyle = "#eee0a8";
  ctx.fillRect(-8, -15, 16, 2);
  ctx.fillRect(-7, -11, 14, 2);
  ctx.fillStyle = "#d6aa5d";
  ctx.fillRect(-5, -22, 10, 3);
  ctx.restore();
}

function drawCemeteryTree(ctx: CanvasRenderingContext2D, point: ScreenPoint, zoom: number, bare: boolean) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(zoom, zoom);
  ctx.fillStyle = "rgba(14, 18, 13, 0.32)";
  ctx.beginPath();
  ctx.ellipse(2, 6, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5b3a24";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(1, -28);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (const branch of bare ? [-1, 1, 2, -2] : [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, -18 + Math.abs(branch) * 2);
    ctx.lineTo(branch * 10, -31 - Math.abs(branch) * 4);
    ctx.stroke();
  }
  if (!bare) {
    ctx.fillStyle = "#78915b";
    ctx.beginPath();
    ctx.arc(-5, -35, 12, 0, Math.PI * 2);
    ctx.arc(7, -32, 13, 0, Math.PI * 2);
    ctx.arc(1, -45, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStoneLantern(ctx: CanvasRenderingContext2D, point: ScreenPoint, zoom: number) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(zoom, zoom);
  ctx.fillStyle = "rgba(14, 17, 14, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 5, 8, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#91846b";
  ctx.fillRect(-2, -12, 4, 15);
  ctx.fillRect(-7, 1, 14, 4);
  ctx.fillStyle = "#c9b88a";
  ctx.fillRect(-6, -18, 12, 6);
  ctx.fillStyle = "#d4b663";
  ctx.fillRect(-3, -17, 6, 3);
  ctx.restore();
}

export function drawCemeteryMist({ camera, ctx, motion }: DrawPharosVilleInput) {
  const drift = motion.reducedMotion ? 0 : Math.sin(motion.timeSeconds * 0.38) * 8 * camera.zoom;
  const bands = [
    { alpha: 0.13, rx: 45, ry: 4.2, tile: { x: 18.9, y: 44.8 } },
    { alpha: 0.1, rx: 58, ry: 4.2, tile: { x: 22.8, y: 45.4 } },
    { alpha: 0.09, rx: 42, ry: 3.6, tile: { x: 26.7, y: 39.2 } },
    { alpha: 0.08, rx: 37, ry: 3, tile: { x: 17.25, y: 39.0 } },
  ] as const;

  ctx.save();
  for (const band of bands) {
    const p = tileToScreen(cemeteryContextTile(band.tile), camera);
    ctx.strokeStyle = `rgba(205, 218, 194, ${band.alpha})`;
    ctx.lineWidth = Math.max(1, 3 * camera.zoom);
    ctx.beginPath();
    ctx.ellipse(p.x + drift, p.y, band.rx * camera.zoom, band.ry * camera.zoom, -0.08, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}


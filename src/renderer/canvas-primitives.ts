import type { LoadedPharosVilleAsset } from "./asset-manager";

export function drawAsset(
  ctx: CanvasRenderingContext2D,
  asset: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
) {
  const { entry, image } = asset;
  const width = entry.width * entry.displayScale * scale;
  const height = entry.height * entry.displayScale * scale;
  ctx.drawImage(
    image,
    Math.round(x - entry.anchor[0] * entry.displayScale * scale),
    Math.round(y - entry.anchor[1] * entry.displayScale * scale),
    Math.round(width),
    Math.round(height),
  );
}

export function drawAnimatedAsset(
  ctx: CanvasRenderingContext2D,
  asset: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
  frameIndex: number,
  reducedMotion: boolean,
): boolean {
  const animation = asset.entry.animation;
  const resolvedFrameIndex = reducedMotion
    ? animation?.reducedMotionFrame ?? 0
    : frameIndex;
  if (drawAssetFrame(ctx, asset, x, y, scale, resolvedFrameIndex)) return true;
  drawAsset(ctx, asset, x, y, scale);
  return false;
}

export function drawAssetFrame(
  ctx: CanvasRenderingContext2D,
  asset: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
  frameIndex: number,
): boolean {
  const { entry, frameSource } = asset;
  const animation = entry.animation;
  const sheet = animation?.spriteSheet;
  if (!animation || !sheet || !frameSource) return false;
  if (
    !isPositiveInteger(sheet.columns)
    || !isPositiveInteger(sheet.rows)
    || !isPositiveInteger(sheet.frameWidth)
    || !isPositiveInteger(sheet.frameHeight)
  ) return false;

  const normalizedFrame = normalizeFrameIndex(frameIndex, animation.frameCount, animation.loop);
  const column = normalizedFrame % sheet.columns;
  const row = Math.floor(normalizedFrame / sheet.columns);
  if (row >= sheet.rows) return false;

  const drawScale = entry.displayScale * scale;
  const width = sheet.frameWidth * drawScale;
  const height = sheet.frameHeight * drawScale;
  ctx.drawImage(
    frameSource,
    column * sheet.frameWidth,
    row * sheet.frameHeight,
    sheet.frameWidth,
    sheet.frameHeight,
    Math.round(x - entry.anchor[0] * drawScale),
    Math.round(y - entry.anchor[1] * drawScale),
    Math.round(width),
    Math.round(height),
  );
  return true;
}

export function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x, y + height / 2);
  ctx.lineTo(x - width / 2, y);
  ctx.closePath();
  ctx.fill();
}

export function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  minFontSize: number,
  weight: string,
) {
  let nextSize = fontSize;
  while (nextSize > minFontSize) {
    ctx.font = `${weight} ${Math.round(nextSize)}px ui-sans-serif, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    nextSize -= 0.5;
  }
  ctx.fillText(text, x, y, maxWidth);
}

export function drawSignBoard(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  scale: number,
  face: string,
  edge: string,
) {
  ctx.fillStyle = edge;
  ctx.fillRect(Math.round(left - 2 * scale), Math.round(top + 2 * scale), Math.round(width + 4 * scale), Math.round(height - 1 * scale));
  ctx.fillStyle = face;
  ctx.fillRect(Math.round(left), Math.round(top), Math.round(width), Math.round(height));
  ctx.fillStyle = "rgba(39, 24, 15, 0.26)";
  ctx.fillRect(Math.round(left), Math.round(top + height * 0.48), Math.round(width), Math.max(1, Math.round(scale)));
}

export function drawTileLowerFacet(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, y);
  ctx.lineTo(x, y + height / 2);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x, y + height * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function readableInkForFill(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#102333" : "#f8efd2";
}

export function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

export function stableVisualVariant(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function withAlpha(color: string, alpha: number) {
  if (color.startsWith("rgba(")) return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  return color;
}

function normalizeFrameIndex(frameIndex: number, frameCount: number, loop: boolean): number {
  if (!Number.isInteger(frameCount) || frameCount <= 0) return 0;
  const integerFrame = Number.isFinite(frameIndex) ? Math.trunc(frameIndex) : 0;
  if (!loop) return Math.max(0, Math.min(frameCount - 1, integerFrame));
  return ((integerFrame % frameCount) + frameCount) % frameCount;
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

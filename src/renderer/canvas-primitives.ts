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

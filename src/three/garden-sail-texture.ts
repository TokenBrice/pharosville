import {
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
} from "three";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import type {
  ShipLivery,
  ShipLogoShape,
  ShipNode,
  ShipStripePattern,
} from "../systems/world-types";

const TEXTURE_SIZE = 128;

export function createGardenSailTexture(
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;

  paintSailField(context, ship.visual.livery);
  paintSailIdentity(context, ship, logo);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintSailField(
  context: CanvasRenderingContext2D,
  livery: ShipLivery,
): void {
  context.fillStyle = livery.sailColor;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  context.save();
  context.globalAlpha = 0.74;
  context.fillStyle = livery.primary;
  switch (livery.sailPanel) {
    case "center":
      context.fillRect(43, 0, 42, TEXTURE_SIZE);
      break;
    case "field":
      context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      break;
    case "hoist":
      context.fillRect(0, 0, 37, TEXTURE_SIZE);
      break;
    case "quartered":
      context.fillRect(0, 0, 64, 64);
      context.fillRect(64, 64, 64, 64);
      break;
  }
  context.restore();

  paintStripePattern(context, livery.stripePattern, livery.secondary);

  context.save();
  context.globalAlpha = 0.13;
  context.strokeStyle = livery.logoMatte;
  context.lineWidth = 1;
  for (let x = 7; x < TEXTURE_SIZE; x += 10) {
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x - 3, 37, x + 4, 86, x, TEXTURE_SIZE);
    context.stroke();
  }
  context.restore();
}

function paintStripePattern(
  context: CanvasRenderingContext2D,
  pattern: ShipStripePattern,
  color: string,
): void {
  context.save();
  context.globalAlpha = 0.58;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (pattern === "single" || pattern === "double") {
    context.fillRect(0, 28, TEXTURE_SIZE, 10);
    if (pattern === "double") context.fillRect(0, 91, TEXTURE_SIZE, 7);
  } else if (pattern === "diagonal") {
    context.translate(64, 64);
    context.rotate(-Math.PI / 5);
    context.fillRect(-90, -8, 180, 16);
  } else if (pattern === "cross") {
    context.fillRect(0, 57, TEXTURE_SIZE, 14);
    context.fillRect(57, 0, 14, TEXTURE_SIZE);
  } else if (pattern === "chevron") {
    context.lineWidth = 13;
    context.beginPath();
    context.moveTo(9, 37);
    context.lineTo(64, 76);
    context.lineTo(119, 37);
    context.stroke();
  } else if (pattern === "wave") {
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(-8, 73);
    context.bezierCurveTo(22, 43, 43, 101, 73, 70);
    context.bezierCurveTo(95, 47, 112, 84, 137, 61);
    context.stroke();
  } else if (pattern === "ladder") {
    context.lineWidth = 6;
    for (const y of [27, 52, 77, 102]) {
      context.beginPath();
      context.moveTo(13, y);
      context.lineTo(115, y);
      context.stroke();
    }
  } else {
    context.lineWidth = 2;
    for (let y = 16; y < TEXTURE_SIZE; y += 12) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(TEXTURE_SIZE, y - 5);
      context.stroke();
    }
  }
  context.restore();
}

function paintSailIdentity(
  context: CanvasRenderingContext2D,
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): void {
  const centerX = 65;
  const centerY = 64;
  const radius = 47;

  context.save();
  drawLogoShape(context, ship.visual.livery.logoShape, centerX, centerY, radius);
  context.fillStyle = ship.visual.livery.logoMatte;
  context.globalAlpha = 0.94;
  context.fill();
  context.clip();

  if (logo?.image) {
    try {
      const dimensions = containedDimensions(
        logo.image.naturalWidth || logo.image.width,
        logo.image.naturalHeight || logo.image.height,
        radius * 1.68,
      );
      context.globalAlpha = 1;
      context.drawImage(
        logo.image,
        centerX - dimensions.width / 2,
        centerY - dimensions.height / 2,
        dimensions.width,
        dimensions.height,
      );
      context.restore();
      paintIdentityRim(context, ship.visual.livery, centerX, centerY, radius);
      return;
    } catch {
      // The symbol fallback remains deterministic if an image cannot be drawn.
    }
  }

  context.globalAlpha = 1;
  context.fillStyle = identityInk(ship.visual.livery.logoMatte);
  context.font = "700 31px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const label = ship.symbol.trim().slice(0, 7);
  context.fillText(label, centerX, centerY + 1, radius * 1.68);
  context.restore();
  paintIdentityRim(context, ship.visual.livery, centerX, centerY, radius);
}

function paintIdentityRim(
  context: CanvasRenderingContext2D,
  livery: ShipLivery,
  x: number,
  y: number,
  radius: number,
): void {
  context.save();
  drawLogoShape(context, livery.logoShape, x, y, radius);
  context.globalAlpha = 0.92;
  context.lineWidth = 7;
  context.strokeStyle = identityInk(livery.logoMatte);
  context.stroke();
  drawLogoShape(context, livery.logoShape, x, y, radius);
  context.globalAlpha = 0.96;
  context.lineWidth = 3;
  context.strokeStyle = livery.accent;
  context.stroke();
  context.restore();
}

function drawLogoShape(
  context: CanvasRenderingContext2D,
  shape: ShipLogoShape,
  x: number,
  y: number,
  radius: number,
): void {
  context.beginPath();
  if (shape === "diamond") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
  } else if (shape === "hex") {
    for (let index = 0; index < 6; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 3;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
  } else if (shape === "pill") {
    context.roundRect(x - radius, y - radius * 0.72, radius * 2, radius * 1.44, radius * 0.72);
  } else if (shape === "slash") {
    context.moveTo(x - radius * 0.42, y - radius);
    context.lineTo(x + radius, y - radius);
    context.lineTo(x + radius * 0.42, y + radius);
    context.lineTo(x - radius, y + radius);
  } else if (shape === "triangle") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y + radius * 0.8);
    context.lineTo(x - radius, y + radius * 0.8);
  } else {
    context.arc(x, y, radius, 0, Math.PI * 2);
  }
  context.closePath();

  if (shape === "ring") {
    context.moveTo(x + radius * 0.58, y);
    context.arc(x, y, radius * 0.58, 0, Math.PI * 2, true);
  }
}

function identityInk(background: string): string {
  const match = /^#([\da-f]{6})$/i.exec(background);
  if (!match) return "#17343a";
  const value = Number.parseInt(match[1]!, 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  const luminance = (red * 299 + green * 587 + blue * 114) / 255_000;
  return luminance > 0.52 ? "#17343a" : "#f7f1dc";
}

function containedDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maximumSize: number,
): { height: number; width: number } {
  const width = Math.max(1, sourceWidth);
  const height = Math.max(1, sourceHeight);
  const scale = maximumSize / Math.max(width, height);
  return {
    height: height * scale,
    width: width * scale,
  };
}

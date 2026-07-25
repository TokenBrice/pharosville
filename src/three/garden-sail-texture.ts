import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import { safeCssColor } from "./garden-util";
import type {
  ShipLivery,
  ShipLogoShape,
  ShipNode,
  ShipStripePattern,
} from "../systems/world-types";

const TEXTURE_SIZE = 128;

export const GARDEN_SAIL_TEXTURE_SIZE = TEXTURE_SIZE;

/**
 * F1 (2026-07-25): the colour a ship's canvas is DYED — its issuer's dominant
 * brand colour, near enough to be named on sight.
 *
 * The cloth used to be `livery.sailColor`, which is that brand colour mixed
 * 60% into cream. Across a two-hundred-ship fleet at overview zoom that put
 * every sail in the same narrow band of oatmeal, so a ship could only be
 * identified by reading the small mark on its mainsail — which is exactly the
 * "must be instantly recognizable without having to check" the operator
 * asked for and did not have.
 *
 * Two bounds keep it legible rather than merely loud: a lift toward warm
 * canvas so the cloth still reads as cloth, and a luminance floor so a
 * near-black brand (BUIDL, Frax) is a dark navy sail rather than a hole in the
 * scene. Nothing here changes what a colour MEANS — the brand colour was
 * already the ship's identity, it was just being diluted away.
 */
const CLOTH_CANVAS_LIFT = 0.17;
const CLOTH_LUMINANCE_FLOOR = 0.1;
const CLOTH_CANVAS = "#f4ecd8";

export function gardenSailClothColor(livery: ShipLivery | null | undefined): Color {
  const primary = safeCssColor(livery?.primary, CLOTH_CANVAS);
  const cloth = new Color(primary).lerp(new Color(CLOTH_CANVAS), CLOTH_CANVAS_LIFT);
  const luminance = cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722;
  if (luminance < CLOTH_LUMINANCE_FLOOR) {
    cloth.lerp(new Color(CLOTH_CANVAS), (CLOTH_LUMINANCE_FLOOR - luminance) * 2.4);
  }
  return cloth;
}

/**
 * Paints one ship's sail onto its own 128² canvas.
 *
 * Split out of `createGardenSailTexture` for W1/D3: the batched fleet composes
 * these canvases into a single atlas (`garden-sail-atlas.ts`) rather than
 * uploading one texture per ship, so the painting logic has exactly one home.
 *
 * `clothFill` is the difference between the two consumers. The atlas passes
 * `null`, leaving the cloth TRANSPARENT: the batch dyes it per instance in the
 * shader, so the atlas only has to carry each ship's marks and the whole fleet
 * shares one texture. Hero ships pass their cloth colour and get an opaque
 * canvas, because they own a material each.
 */
export function createGardenSailCanvas(
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
  clothFill: string | null = null,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (clothFill) {
    context.fillStyle = clothFill;
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  }
  paintSailField(context, ship.visual.livery);
  paintSailIdentity(context, ship, logo);
  return canvas;
}

export function createGardenSailTexture(
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): CanvasTexture | null {
  const canvas = createGardenSailCanvas(
    ship,
    logo,
    `#${gardenSailClothColor(ship.visual.livery).getHexString()}`,
  );
  if (!canvas) return null;

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
  // F1: no base fill. The cloth is the ship's brand colour, delivered by the
  // material (per-instance for the batched fleet, per-material for heroes), and
  // everything painted here is a MARK on top of it. Painting a field colour
  // here as well would fight the dye and put the ships back in oatmeal.
  //
  // The marks are therefore drawn in the livery's SECONDARY and ACCENT, which
  // are its dark and light poles — they read against a saturated cloth, where
  // the old primary-on-cream panels would now be invisible.
  context.save();
  context.globalAlpha = 0.4;
  context.fillStyle = livery.secondary;
  switch (livery.sailPanel) {
    case "center":
      context.fillRect(43, 0, 42, TEXTURE_SIZE);
      break;
    case "field":
      // A "field" panel is the whole cloth, which under F1 IS the dye — so it
      // paints nothing rather than flattening the sail into one dark slab.
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

  paintStripePattern(context, livery.stripePattern, livery.accent);

  context.save();
  context.globalAlpha = 0.1;
  context.strokeStyle = livery.secondary;
  context.lineWidth = 1;
  for (let x = 7; x < TEXTURE_SIZE; x += 10) {
    context.beginPath();
    context.moveTo(x, 0);
    context.bezierCurveTo(x - 3, 37, x + 4, 86, x, TEXTURE_SIZE);
    context.stroke();
  }
  context.restore();

  paintSailBorder(context, livery);
}

/**
 * W5.4: a livery bolt-rope border framing the cloth, so the sail reads as a
 * finished, branded flag rather than a panel that runs off its own edge.
 *
 * Inset by `SAIL_BORDER_INSET` rather than drawn flush: the batched fleet packs
 * these cells edge-to-edge into one atlas (D3), and a border on the outermost
 * texels would bleed into the neighbouring ship's cell under bilinear
 * filtering. The inset also keeps the band clear of the identity disc
 * (F1: radius 56 about 64,64), so logo legibility at overview zoom is untouched.
 */
const SAIL_BORDER_INSET = 5;

function paintSailBorder(
  context: CanvasRenderingContext2D,
  livery: ShipLivery,
): void {
  const span = TEXTURE_SIZE - SAIL_BORDER_INSET * 2;
  context.save();
  context.globalAlpha = 0.82;
  context.lineWidth = 5;
  context.strokeStyle = livery.secondary;
  context.strokeRect(SAIL_BORDER_INSET, SAIL_BORDER_INSET, span, span);
  context.globalAlpha = 0.9;
  context.lineWidth = 1.5;
  context.strokeStyle = livery.accent;
  context.strokeRect(SAIL_BORDER_INSET + 3, SAIL_BORDER_INSET + 3, span - 6, span - 6);
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

/**
 * F1: the identity mark, and the reason the sail exists.
 *
 * Radius 47 -> 56 (88% of the cloth's width, up from 73%) and the rim thinned
 * from a 7px ink band plus a 3px accent to a single 3px accent hairline. Both
 * changes buy the same thing: at the zoom the operator actually reads the
 * fleet at, the disc is a handful of pixels across, and every pixel spent on a
 * frame is a pixel not spent on the logo inside it.
 */
const IDENTITY_RADIUS = 56;
const IDENTITY_LOGO_SPAN = 1.78;

function paintSailIdentity(
  context: CanvasRenderingContext2D,
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): void {
  const centerX = 64;
  const centerY = 64;
  const radius = IDENTITY_RADIUS;

  context.save();
  drawLogoShape(context, ship.visual.livery.logoShape, centerX, centerY, radius);
  context.fillStyle = ship.visual.livery.logoMatte;
  context.globalAlpha = 0.97;
  context.fill();
  context.clip();

  if (logo?.image) {
    try {
      const dimensions = containedDimensions(
        logo.image.naturalWidth || logo.image.width,
        logo.image.naturalHeight || logo.image.height,
        radius * IDENTITY_LOGO_SPAN,
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
  context.font = "700 36px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const label = ship.symbol.trim().slice(0, 7);
  context.fillText(label, centerX, centerY + 1, radius * 1.76);
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
  context.globalAlpha = 0.96;
  context.lineWidth = 3;
  context.strokeStyle = livery.secondary;
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

import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import { SAIL_DARK_CANVAS_ISSUERS } from "./garden-sail-overrides";
import { GARDEN_IDENTITY_ANISOTROPY, safeCssColor } from "./garden-util";
import type { ShipLivery, ShipNode } from "../systems/world-types";

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

/**
 * H1/D5: the pirate rule.
 *
 * A coin's mark is almost always WHITE, and the emblem keeps its own colours
 * (D1) — so a pale-branded issuer would fly a white mark on pale cloth and
 * vanish. The mark is not ours to recolour; the cloth is. Below this contrast
 * the ship gets black canvas and lets the white mark carry it, which is the
 * most literal reading of the reference anyway.
 *
 * 2.0 puts 28 of 255 issuers (11%) under black sail — measured over
 * `data/brand-colors.json` on 2026-07-25. It catches the genuinely illegible
 * (Blast's #ffff07 at 1.10) without turning a fifth of the fleet black.
 *
 * Deliberately keyed on the BRAND colour against white, not on the extracted
 * mark: this keeps the cloth a pure function of the livery, so a ship never
 * flashes pale and then snaps to black when its logo resolves.
 *
 * The floor is a fleet-wide number and cannot catch everything; the issuers it
 * misses are named in `SAIL_DARK_CANVAS_ISSUERS` rather than moved by nudging
 * this constant, which is an operator decision. Adding the ship id keeps the
 * cloth a pure function of (livery, id) — both known when the ship is built,
 * neither waiting on an image — so the no-flash property above survives.
 */
const PIRATE_CONTRAST_FLOOR = 2;
const PIRATE_SATURATION = 0.4;
const PIRATE_LIGHTNESS = 0.07;

export function gardenSailClothColor(
  livery: ShipLivery | null | undefined,
  shipId: string,
): Color {
  const primary = safeCssColor(livery?.primary, CLOTH_CANVAS);
  const cloth = new Color(primary).lerp(new Color(CLOTH_CANVAS), CLOTH_CANVAS_LIFT);
  const luminance = cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722;
  if (luminance < CLOTH_LUMINANCE_FLOOR) {
    cloth.lerp(new Color(CLOTH_CANVAS), (CLOTH_LUMINANCE_FLOOR - luminance) * 2.4);
  }
  if (SAIL_DARK_CANVAS_ISSUERS.has(shipId) || whiteContrast(cloth) < PIRATE_CONTRAST_FLOOR) {
    // Not #000 — the brand's HUE survives at very low lightness, so Maker reads
    // as a dark bronze-black and Aave as a dark green-black. Invisible at
    // overview zoom, still theirs when you sail up to it.
    //
    // Both conversions are pinned to sRGB. three.js works in LINEAR space, and
    // a lightness of 0.07 read as linear is a mid-dark grey rather than the
    // near-black this rule exists to produce.
    const hsl = { h: 0, l: 0, s: 0 };
    cloth.getHSL(hsl, SRGBColorSpace);
    cloth.setHSL(hsl.h, PIRATE_SATURATION, PIRATE_LIGHTNESS, SRGBColorSpace);
  }
  return cloth;
}

/**
 * WCAG contrast of a colour against white.
 *
 * `Color`'s components are already LINEAR (three.js colour management converts
 * on assignment), so they feed the luminance sum directly — applying the sRGB
 * transfer function here as well would darken every colour twice and fire this
 * rule on issuers that do not need it.
 */
function whiteContrast(color: Color): number {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return 1.05 / (luminance + 0.05);
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
    `#${gardenSailClothColor(ship.visual.livery, ship.id).getHexString()}`,
  );
  if (!canvas) return null;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = GARDEN_IDENTITY_ANISOTROPY;
  texture.needsUpdate = true;
  return texture;
}

function paintSailField(
  context: CanvasRenderingContext2D,
  livery: ShipLivery,
): void {
  // F1: no base fill. The cloth is the ship's brand colour, delivered by the
  // material (per-instance for the batched fleet, per-material for heroes), and
  // everything painted here is a MARK on top of it.
  //
  // H1/D2: no panel, no stripe pattern, no bolt-rope border.
  //
  // This canvas is ONLY ever the identity sail — plain sails take a flat dye
  // from the shader (batched) or their own material (hero) and are never
  // textured. So every mark painted here shared the cloth with the emblem, and
  // a quartered panel or a cross stripe running under a coin's mark is exactly
  // what made the sail read as a sticker rather than painted canvas.
  //
  // What survives is the weave: slack curves down the cloth, which say "fabric"
  // without competing with the emblem for the eye.
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
}

/**
 * The sail is read from fleet scale, where a relief-only emblem collapses into
 * the dyed cloth. Preserve the quiet field treatment introduced by H1, but
 * restore the complete, familiar logo inside one restrained contrast plate.
 *
 * The plate is deliberately neutral and consistent rather than another
 * hash-derived livery shape: the logo is data, not decoration. A 55px radius
 * leaves a safe atlas gutter while giving the authentic asset almost 80% of
 * the cell.
 */
const IDENTITY_FIELD_RADIUS = 55;
const IDENTITY_LOGO_SPAN = 0.78;
const IDENTITY_RIM_WIDTH = 2;

function paintSailIdentity(
  context: CanvasRenderingContext2D,
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): void {
  // An unresolved/failed logo stays as brand-dyed cloth. Ticker letters are
  // not heraldry and must never appear as an asset-loading fallback.
  if (!logo) return;

  const centerX = 64;
  const centerY = 64;
  const box = TEXTURE_SIZE * IDENTITY_LOGO_SPAN;

  paintIdentityField(
    context,
    ship.visual.livery,
    centerX,
    centerY,
    IDENTITY_FIELD_RADIUS,
  );

  context.save();
  drawIdentityFieldPath(context, centerX, centerY, IDENTITY_FIELD_RADIUS);
  context.clip();

  // The unmodified logo is the canonical recognition cue. Prefer it to the
  // extracted emblem so its original disc, colour block and silhouette survive
  // the jump from a texture sample to a handful of pixels on screen.
  if (logo?.image) {
    try {
      // ImageBitmap (the createImageBitmap decode path) has no naturalWidth —
      // its intrinsic size IS width/height.
      const intrinsicWidth = "naturalWidth" in logo.image
        ? logo.image.naturalWidth || logo.image.width
        : logo.image.width;
      const intrinsicHeight = "naturalHeight" in logo.image
        ? logo.image.naturalHeight || logo.image.height
        : logo.image.height;
      const dimensions = containedDimensions(
        intrinsicWidth,
        intrinsicHeight,
        box,
      );
      context.drawImage(
        logo.image,
        centerX - dimensions.width / 2,
        centerY - dimensions.height / 2,
        dimensions.width,
        dimensions.height,
      );
      context.restore();
      return;
    } catch {
      // Fall through to the extracted emblem.
    }
  }

  if (logo?.emblem) {
    try {
      context.drawImage(
        logo.emblem,
        centerX - box / 2,
        centerY - box / 2,
        box,
        box,
      );
      context.restore();
      return;
    } catch {
      // A failed image stays a markless brand-dyed sail.
    }
  }
  context.restore();
}

function paintIdentityField(
  context: CanvasRenderingContext2D,
  livery: ShipLivery,
  x: number,
  y: number,
  radius: number,
): void {
  context.save();
  drawIdentityFieldPath(context, x, y, radius);
  context.globalAlpha = 0.94;
  context.fillStyle = livery.logoMatte;
  context.fill();
  context.globalAlpha = 0.74;
  context.lineWidth = IDENTITY_RIM_WIDTH;
  context.strokeStyle = livery.secondary;
  context.stroke();
  context.restore();
}

function drawIdentityFieldPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.closePath();
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

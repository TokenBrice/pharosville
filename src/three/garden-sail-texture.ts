import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  MathUtils,
  SRGBColorSpace,
} from "three";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import { SAIL_DARK_CANVAS_ISSUERS } from "./garden-sail-overrides";
import { GARDEN_IDENTITY_ANISOTROPY, safeCssColor, stableUnit } from "./garden-util";
import type { ShipLivery, ShipNode } from "../systems/world-types";

const TEXTURE_SIZE = 128;

export const GARDEN_SAIL_TEXTURE_SIZE = TEXTURE_SIZE;

/**
 * F1 (2026-07-25): the colour a ship's canvas is DYED — its issuer's dominant
 * brand colour, near enough to be named on sight.
 *
 * 2026-09-10: the dye is now judged in OKLCH. The previous pipeline lifted the
 * brand toward cream and then toward its own luminance, both as LINEAR lerps.
 * A linear lerp toward a bright colour is a chroma sink for anything dark: 17%
 * cream added to Circle navy (#274a81) lands on #767b8e, Tether green on
 * #7c8e82, sUSD indigo on #6e6b6e — half the fleet (127 of 256 primaries)
 * measured sRGB saturation under 0.2 and read as one grey-blue fleet.
 *
 * Now lightness, chroma and hue are moved independently:
 *  - hue is the brand's, untouched;
 *  - lightness is compressed into a dyed-cloth window so a near-black brand is
 *    dark cloth rather than a hole and a pale brand is a mid dye its ink can
 *    sit on (the mon ink picks dark or light against the cloth, see
 *    `paintSailIdentity`, so no cloth needs blackening for legibility);
 *  - chroma is kept, capped at `CLOTH_CHROMA_CAP` so the fleet stays under the
 *    palette's ceiling and vermillion keeps chroma primacy;
 *  - a neutral brand (Frax, Ethena, BUSD grey) is pulled toward the canvas
 *    hue plane so it reads as undyed cloth rather than a printer grey; the pull
 *    fades out by `CLOTH_NEUTRAL_CHROMA` so a coloured brand keeps its hue.
 */
const CLOTH_LIGHTNESS_MIN = 0.38;
/**
 * Not a legibility bound (the mon ink adapts). It is the value plan: the fleet
 * sits under foam and the lit shelf, so cloth stops short of the water's
 * highlights and a bright brand reads as bright cloth, not a white patch.
 */
const CLOTH_LIGHTNESS_MAX = 0.74;
const CLOTH_LIGHTNESS_SCALE = 0.55;
const CLOTH_LIGHTNESS_BIAS = 0.3;
/** Under the 0.16 palette ceiling and vermillion's 0.177. */
const CLOTH_CHROMA_CAP = 0.15;
const CLOTH_NEUTRAL_CHROMA = 0.04;
const CLOTH_CANVAS_PULL = 0.35;
const CLOTH_CANVAS = "#f4ecd8";

/**
 * Named pale issuers fly dark canvas. The former contrast-floor rule that put
 * 38 issuers under black cloth is gone: the mon ink already picks a dark or
 * light value against the cloth, so a pale dye is legible on its own. The
 * override table is an operator decision and stays.
 *
 * Not #000 — the brand's HUE survives at very low lightness, so Lybra reads
 * as a dark blue-black. Invisible at overview zoom, still theirs up close.
 */
const PIRATE_SATURATION = 0.4;
const PIRATE_LIGHTNESS = 0.07;

const CANVAS_LAB = toOklab(new Color(CLOTH_CANVAS));

export function gardenSailClothColor(
  livery: ShipLivery | null | undefined,
  shipId: string,
): Color {
  const cloth = new Color(safeCssColor(livery?.primary, CLOTH_CANVAS));
  if (SAIL_DARK_CANVAS_ISSUERS.has(shipId)) {
    // Both conversions are pinned to sRGB. three.js works in LINEAR space, and
    // a lightness of 0.07 read as linear is a mid-dark grey rather than the
    // near-black this rule exists to produce.
    const hsl = { h: 0, l: 0, s: 0 };
    cloth.getHSL(hsl, SRGBColorSpace);
    return cloth.setHSL(hsl.h, PIRATE_SATURATION, PIRATE_LIGHTNESS, SRGBColorSpace);
  }
  const lab = toOklab(cloth);
  const lightness = MathUtils.clamp(
    CLOTH_LIGHTNESS_BIAS + lab.L * CLOTH_LIGHTNESS_SCALE,
    CLOTH_LIGHTNESS_MIN,
    CLOTH_LIGHTNESS_MAX,
  );
  const brandChroma = Math.hypot(lab.a, lab.b);
  const pull = CLOTH_CANVAS_PULL * Math.max(0, 1 - brandChroma / CLOTH_NEUTRAL_CHROMA);
  let a = lab.a + (CANVAS_LAB.a - lab.a) * pull;
  let b = lab.b + (CANVAS_LAB.b - lab.b) * pull;
  const chroma = Math.hypot(a, b);
  if (chroma > CLOTH_CHROMA_CAP) {
    a *= CLOTH_CHROMA_CAP / chroma;
    b *= CLOTH_CHROMA_CAP / chroma;
  }
  return fromOklab(lightness, a, b, cloth);
}

/** Ottosson OKLab from three.js LINEAR components. */
function toOklab(color: Color): { L: number; a: number; b: number } {
  const l = Math.cbrt(0.4122214708 * color.r + 0.5363325363 * color.g + 0.0514459929 * color.b);
  const m = Math.cbrt(0.2119034982 * color.r + 0.6806995451 * color.g + 0.1073969566 * color.b);
  const s = Math.cbrt(0.0883024619 * color.r + 0.2817188376 * color.g + 0.6299787005 * color.b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLab back to LINEAR components, written into `target`; out-of-gamut channels clamp. */
function fromOklab(L: number, a: number, b: number, target: Color): Color {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return target.setRGB(
    MathUtils.clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1),
    MathUtils.clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1),
    MathUtils.clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s, 0, 1),
  );
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
  paintSailIdentity(context, ship, logo);
  context.save();
  context.globalCompositeOperation = "multiply";
  paintSailField(context, ship.visual.livery);
  context.restore();
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
  texture.name = `garden-ship-identity-sail.${ship.id}`;
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
 * A complete mon, printed in one value-contrasting ink in the upper third.
 * Wear is cut from a separate ink layer, never from the cloth underneath.
 * The weave is multiplied over the finished print by createGardenSailCanvas;
 * multiplying pale ink into dark dye would make that ink physically invisible.
 */
const IDENTITY_LOGO_SPAN = 0.52;

function paintSailIdentity(
  context: CanvasRenderingContext2D,
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): void {
  const layer = document.createElement("canvas");
  layer.width = TEXTURE_SIZE;
  layer.height = TEXTURE_SIZE;
  const ink = layer.getContext("2d");
  if (!ink) return;
  const centerX = TEXTURE_SIZE / 2;
  const centerY = TEXTURE_SIZE / 3;
  const box = TEXTURE_SIZE * IDENTITY_LOGO_SPAN;
  let painted = false;
  for (const image of [logo?.emblem, logo?.image]) {
    if (!image) continue;
    try {
      const width = "naturalWidth" in image ? image.naturalWidth || image.width : image.width;
      const height = "naturalHeight" in image ? image.naturalHeight || image.height : image.height;
      const dimensions = containedDimensions(width, height, box);
      ink.drawImage(image, centerX - dimensions.width / 2, centerY - dimensions.height / 2,
        dimensions.width, dimensions.height);
      painted = true;
      break;
    } catch {
      // A failed decode tries the canonical image, then the issuer's initials.
    }
  }
  if (!painted) {
    ink.font = "600 36px serif";
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.fillText(ship.symbol.slice(0, 3).toUpperCase(), centerX, centerY, box);
  }
  const cloth = gardenSailClothColor(ship.visual.livery, ship.id);
  const luminance = 0.2126 * cloth.r + 0.7152 * cloth.g + 0.0722 * cloth.b;
  // Neutral OKLab ink L=.25 / .88 corresponds to linear luminance L³.
  const dark = 0.25 ** 3;
  const light = 0.88 ** 3;
  const darkContrast = (Math.max(luminance, dark) + 0.05) / (Math.min(luminance, dark) + 0.05);
  const lightContrast = (Math.max(luminance, light) + 0.05) / (Math.min(luminance, light) + 0.05);
  const value = darkContrast > lightContrast ? dark : light;
  ink.globalCompositeOperation = "source-in";
  ink.fillStyle = `#${new Color(value, value, value).getHexString()}`;
  ink.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  ink.globalCompositeOperation = "destination-out";
  const wearCount = 2 + Math.floor(stableUnit(`${ship.id}.mon.count`) * 2);
  for (let index = 0; index < wearCount; index += 1) {
    ink.globalAlpha = 0.1 + stableUnit(`${ship.id}.mon.alpha.${index}`) * 0.08;
    ink.beginPath();
    ink.arc(
      centerX + (stableUnit(`${ship.id}.mon.x.${index}`) - 0.5) * box * 0.8,
      centerY + (stableUnit(`${ship.id}.mon.y.${index}`) - 0.5) * box * 0.8,
      3 + stableUnit(`${ship.id}.mon.radius.${index}`) * 5,
      0, Math.PI * 2,
    );
    ink.fill();
  }
  context.drawImage(layer, 0, 0);
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

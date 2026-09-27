import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import { hexToOklch, oklchToHex } from "../systems/palette";
import { GARDEN_IDENTITY_ANISOTROPY, safeCssColor, stableUnit } from "./garden-util";
import type { ShipLivery, ShipNode } from "../systems/world-types";

const TEXTURE_SIZE = 128;

export const GARDEN_SAIL_TEXTURE_SIZE = TEXTURE_SIZE;

/**
 * W4.F2 (fleet-craft-2, O20): one dye book for the whole fleet.
 *
 * F1 made the cloth the issuer's own colour so a ship is named on sight. The
 * old recipe then lifted it toward cream in LINEAR RGB and pulled it toward its
 * own luminance, which rotated blue issuers ~13° toward violet (the lilac
 * fleet), left a third of the cloth effectively grey and compressed the fleet's
 * values into L 0.54–0.73; a pirate branch on top flew 13 % of issuers under
 * unrelated near-black canvas.
 *
 * The ladder works in OKLCH instead, as if every sail came out of one dyer's
 * workshop:
 * - **Hue** is the issuer's, exactly. Identity is never rotated.
 * - **Lightness** maps monotonically onto L 0.30–0.86, so issuer order is kept
 *   and the fleet spans ~0.37–0.82 between its 10th and 90th percentiles:
 *   darks stay dark, pales stay pale.
 * - **Chroma** keeps 80 % of the issuer's, capped per natural-dye family (beni
 *   and kaki 0.118, kariyasu ochre 0.10, green 0.085, asagi teal 0.08, ai
 *   indigo 0.11, murasaki 0.09). Every ceiling stays under 0.12 after 8-bit
 *   rounding, so only
 *   `vermillion` and `lantern_warm` exceed it (the hand, rule 5) and neither
 *   `sail_teal` nor `sail_red` is touched.
 * - **Neutral brands** (C < 0.035) dye as unbleached kinari when pale and as
 *   sumi when dark.
 *
 * There is no contrast floor any more: the mon's ink is chosen against the
 * cloth (`paintSailIdentity`), so a pale sail simply takes dark ink. The cloth
 * is a pure function of the livery, so a ship never flashes when its logo
 * resolves. Distance restraint stays a viewing condition in the fleet shader.
 */
const DYE_LIGHTNESS = { floor: 0.3, ceiling: 0.86, sourceLow: 0.2, sourceSpan: 0.6 } as const;
const DYE_CHROMA_KEEP = 0.8;
const DYE_NEUTRAL_CHROMA = 0.035;
const DYE_KINARI = { c: 0.012, h: 80, minLightness: 0.55 } as const;
const DYE_SUMI_CHROMA = 0.008;
/** Natural-dye chroma ceilings by OKLCH hue, interpolated around the wheel. */
const DYE_CHROMA_CEILINGS: readonly (readonly [hue: number, chroma: number])[] = [
  [25, 0.118], // beni / madder
  [55, 0.118], // kaki persimmon
  [90, 0.1], // kariyasu ochre
  [140, 0.085], // green
  [195, 0.08], // asagi teal
  [255, 0.11], // ai indigo
  [305, 0.09], // murasaki
  [345, 0.105], // between murasaki and beni
];
const CLOTH_FALLBACK = "#f4ecd8";

export function gardenSailDyeChromaCeiling(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  const count = DYE_CHROMA_CEILINGS.length;
  for (let index = 0; index < count; index += 1) {
    const [fromHue, fromChroma] = DYE_CHROMA_CEILINGS[index]!;
    const [nextHue, toChroma] = DYE_CHROMA_CEILINGS[(index + 1) % count]!;
    const toHue = nextHue <= fromHue ? nextHue + 360 : nextHue;
    const probe = wrapped < fromHue ? wrapped + 360 : wrapped;
    if (probe >= fromHue && probe <= toHue) {
      return fromChroma + (toChroma - fromChroma) * ((probe - fromHue) / (toHue - fromHue));
    }
  }
  return DYE_CHROMA_CEILINGS[0]![1];
}

export function gardenSailClothColor(livery: ShipLivery | null | undefined): Color {
  const source = `#${new Color(safeCssColor(livery?.primary, CLOTH_FALLBACK)).getHexString()}`;
  const { c, h, l } = hexToOklch(source);
  const lightness = Math.min(DYE_LIGHTNESS.ceiling, Math.max(
    DYE_LIGHTNESS.floor,
    DYE_LIGHTNESS.floor
      + ((l - DYE_LIGHTNESS.sourceLow) / DYE_LIGHTNESS.sourceSpan) * (DYE_LIGHTNESS.ceiling - DYE_LIGHTNESS.floor),
  ));
  if (c < DYE_NEUTRAL_CHROMA) {
    const kinari = lightness >= DYE_KINARI.minLightness;
    return new Color(oklchToHex({
      c: kinari ? DYE_KINARI.c : DYE_SUMI_CHROMA,
      h: kinari ? DYE_KINARI.h : h,
      l: lightness,
    }));
  }
  return new Color(oklchToHex({
    c: Math.min(c * DYE_CHROMA_KEEP, gardenSailDyeChromaCeiling(h)),
    h,
    l: lightness,
  }));
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
  // W4.F5: no painted weave. The cloth reads as cloth from the batch shader's
  // momen-ho panel strips at rest (the thread weave only on inspection), so
  // the cell carries the mon alone.
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
  texture.name = `garden-ship-identity-sail.${ship.id}`;
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = GARDEN_IDENTITY_ANISOTROPY;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A complete mon, printed in one value-contrasting ink in the upper third.
 * Wear is cut from a separate ink layer, never from the cloth underneath.
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
  const cloth = gardenSailClothColor(ship.visual.livery);
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

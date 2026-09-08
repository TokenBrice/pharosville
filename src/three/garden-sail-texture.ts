import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
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
 *
 */
const CLOTH_CANVAS_LIFT = 0.17;

const CLOTH_LUMINANCE_FLOOR = 0.1;
const CLOTH_CANVAS = "#f4ecd8";

/**
 * 2026-09-07: how far the dyed cloth is pulled toward its OWN luminance.
 *
 * F1 was right that a cream wash collapsed the fleet, and it is still not
 * reinstated here — the lift stays at 0.17. The remaining problem is different:
 * 185 hulls each carrying an undiluted brand hue means the frame has 185
 * competing chromas and therefore no palette, which is the clearest single
 * difference from the reference art (each of those boards holds to about
 * three). Lifting toward cream would fix the clash and wreck the picture,
 * because `Color` is LINEAR here: a 0.32 lift drags a near-black brand from
 * luminance 0.10 to 0.27 and throws away the fleet's darks, which are most of
 * its value structure.
 *
 * Pulling toward the cloth's own luminance instead is chroma-only and value-
 * exact. Every gate that reasons about VALUE — the luminance floor, the pirate
 * contrast rule, DAI's pinned 0.4528, the WCAG separations — is arithmetically
 * untouched, and the hues converge just enough to read as one dyed fleet.
 * Same principle the shader's depth restraint already uses
 * (`garden-fleet-batch.ts:1041`), applied once at the dye instead of per frame.
 *
 * 0.30 keeps the two-issuer separation gate at ~0.33 against its 0.30 floor.
 */
const CLOTH_CHROMA_RESTRAINT = 0.3;

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
  // Chroma-only, luminance-exact. Applied before the pirate branch so that
  // branch still reads the cloth's true contrast against white.
  const clothLuma = cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722;
  cloth.lerp(new Color(clothLuma, clothLuma, clothLuma), CLOTH_CHROMA_RESTRAINT);
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

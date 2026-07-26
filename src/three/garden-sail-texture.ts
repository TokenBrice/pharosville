import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  SRGBColorSpace,
} from "three";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
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
 */
const PIRATE_CONTRAST_FLOOR = 2;
const PIRATE_SATURATION = 0.4;
const PIRATE_LIGHTNESS = 0.07;

export function gardenSailClothColor(livery: ShipLivery | null | undefined): Color {
  const primary = safeCssColor(livery?.primary, CLOTH_CANVAS);
  const cloth = new Color(primary).lerp(new Color(CLOTH_CANVAS), CLOTH_CANVAS_LIFT);
  const luminance = cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722;
  if (luminance < CLOTH_LUMINANCE_FLOOR) {
    cloth.lerp(new Color(CLOTH_CANVAS), (CLOTH_LUMINANCE_FLOOR - luminance) * 2.4);
  }
  if (whiteContrast(cloth) < PIRATE_CONTRAST_FLOOR) {
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
    `#${gardenSailClothColor(ship.visual.livery).getHexString()}`,
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
 * H1: the emblem — the mark alone, painted flat onto the cloth.
 *
 * No matte, no clip, no rim. The disc, the frame and the contrasting plate all
 * existed to separate a logo from a cream sail it did not match. The cloth is
 * now dyed in the issuer's own colour, so the emblem belongs to it: framing it
 * is what made it read as a badge pinned to the canvas instead of a device
 * painted on it.
 *
 * Bigger, too — 0.88 of the cloth against the old disc's 0.44 — because with
 * nothing around it the mark can own the sail the way a jolly roger does.
 */
const EMBLEM_SPAN = 0.88;

/**
 * H1: a soft dark relief under the emblem, so the mark separates from ANY cloth.
 *
 * A coin's mark is usually the light element of its logo, and the sail is dyed
 * the colour that mark sat on — so a pale-branded issuer paints a pale mark
 * onto pale cloth and it vanishes. Glo flew a light-green mark on light-green
 * canvas at barely 1.5:1.
 *
 * The two obvious fixes are both wrong here. Recolouring the mark breaks D1,
 * which is the whole point of preserving brand marks. Darkening the cloth
 * breaks F1: capping lightness to 0.42 pulled Circle blue and Tether green
 * from 0.31 apart to 0.24, i.e. it bought emblem contrast by making two
 * issuers harder to tell apart — the exact problem the dye exists to solve.
 * Both were measured, not guessed.
 *
 * A shadow costs neither. It follows the mark's own alpha, so it reads as the
 * emblem being painted ON canvas that has some depth, and it works whatever
 * the two colours happen to be. D5's black sails still do the heavy lifting
 * for the genuinely pale brands; this catches the mid-tone tail.
 */
const EMBLEM_RELIEF_BLUR = 5;
const EMBLEM_RELIEF_DROP = 1.5;
const EMBLEM_RELIEF_INK = "rgba(12,14,18,0.55)";

function withEmblemRelief(context: CanvasRenderingContext2D, draw: () => void): void {
  context.save();
  context.shadowColor = EMBLEM_RELIEF_INK;
  context.shadowBlur = EMBLEM_RELIEF_BLUR;
  context.shadowOffsetY = EMBLEM_RELIEF_DROP;
  draw();
  context.restore();
}

function paintSailIdentity(
  context: CanvasRenderingContext2D,
  ship: ShipNode,
  logo: ThreeLogoAsset | null,
): void {
  const centerX = 64;
  const centerY = 64;
  const box = TEXTURE_SIZE * EMBLEM_SPAN;

  // The emblem: the coin's mark with the disc it came on already cut away.
  if (logo?.emblem) {
    try {
      withEmblemRelief(context, () => {
        context.drawImage(logo.emblem!, centerX - box / 2, centerY - box / 2, box, box);
      });
      return;
    } catch {
      // Fall through to the unframed logo below.
    }
  }

  // D3: no emblem could be separated, so fly the logo untouched — but still
  // unframed. Its own disc shows, yet the sail is dyed the colour that disc is
  // made of, so it mostly melts into the cloth instead of sitting on a plate.
  if (logo?.image) {
    try {
      const dimensions = containedDimensions(
        logo.image.naturalWidth || logo.image.width,
        logo.image.naturalHeight || logo.image.height,
        box,
      );
      context.drawImage(
        logo.image,
        centerX - dimensions.width / 2,
        centerY - dimensions.height / 2,
        dimensions.width,
        dimensions.height,
      );
      return;
    } catch {
      // The symbol fallback remains deterministic if an image cannot be drawn.
    }
  }

  // Nothing has resolved yet. The ticker holds the ship's identity until one
  // does — the invariant that identity never depends on an image loading.
  context.globalAlpha = 1;
  context.fillStyle = identityInk(`#${gardenSailClothColor(ship.visual.livery).getHexString()}`);
  context.font = "700 40px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(ship.symbol.trim().slice(0, 7), centerX, centerY + 1, box * 0.92);
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

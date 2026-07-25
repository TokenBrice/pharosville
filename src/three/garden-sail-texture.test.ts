// @vitest-environment jsdom
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  createGardenSailCanvas,
  createGardenSailTexture,
  gardenSailClothColor,
} from "./garden-sail-texture";
import { Color } from "three";

const drawImage = vi.fn();
const fillRect = vi.fn();
const fillText = vi.fn();
const strokeRect = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
  fillRect.mockClear();
  fillText.mockClear();
  strokeRect.mockClear();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => fakeContext()),
  });
});

describe("createGardenSailTexture", () => {
  it("draws a decoded local logo into an sRGB clamped texture", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    const image = document.createElement("img");
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 64 },
      naturalWidth: { configurable: true, value: 96 },
    });
    // No emblem: exercises the D3 path, where the unframed image is drawn.
    const logo: ThreeLogoAsset = { emblem: null, image, src: "/logos/usdt.png" };

    const texture = createGardenSailTexture(ship, logo);

    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(texture?.colorSpace).toBe(SRGBColorSpace);
    expect(texture?.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture?.wrapT).toBe(ClampToEdgeWrapping);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(fillText).not.toHaveBeenCalled();
  });

  it("uses the stablecoin symbol when no decoded logo is available", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;

    const texture = createGardenSailTexture(ship, null);

    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(drawImage).not.toHaveBeenCalled();
    // H1: with the disc gone the ticker is bounded by the emblem box, not by a
    // disc radius, so it is drawn larger and constrained to 0.92 of that box.
    expect(fillText).toHaveBeenCalledWith(
      ship.symbol.slice(0, 7),
      64,
      65,
      128 * 0.88 * 0.92,
    );
  });
});

describe("H1 emblem sail", () => {
  it("frames the mark with nothing at all", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    createGardenSailTexture(ship, null);

    // The disc, its rim and the bolt-rope border are all gone (D2): the cloth
    // is dyed the issuer's colour, so anything drawn around the mark puts it
    // back to reading as a badge pinned on rather than a device painted on.
    expect(strokeRect).not.toHaveBeenCalled();
  });

  it("prefers the disc-free emblem over the raw logo when one was extracted", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    const image = document.createElement("img");
    Object.defineProperties(image, {
      naturalHeight: { configurable: true, value: 64 },
      naturalWidth: { configurable: true, value: 64 },
    });
    const emblem = document.createElement("canvas");

    createGardenSailTexture(ship, { emblem, image, src: "/logos/usdc.svg" });

    // Drawn once, and it is the EMBLEM — not the image it came from.
    expect(drawImage).toHaveBeenCalledOnce();
    expect(drawImage.mock.calls[0]![0]).toBe(emblem);
    // Square, centred, and filling 0.88 of the cell.
    const [, x, y, width, height] = drawImage.mock.calls[0]!;
    expect(width).toBeCloseTo(128 * 0.88);
    expect(height).toBeCloseTo(128 * 0.88);
    expect(x).toBeCloseTo(64 - (128 * 0.88) / 2);
    expect(y).toBeCloseTo(64 - (128 * 0.88) / 2);
  });
});

function fakeContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage,
    fill: vi.fn(),
    fillRect,
    fillText,
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    strokeRect,
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("F1 brand-dyed cloth", () => {
  const distance = (from: Color, to: Color) => Math.hypot(
    from.r - to.r,
    from.g - to.g,
    from.b - to.b,
  );

  it("dyes the cloth in the issuer's dominant colour, not a cream wash of it", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    // Circle blue: a brand colour whose diluted form is unmistakably paler.
    const livery = { ...base, primary: "#2775ca", sailColor: "#dbe6f7" };
    const primary = new Color("#2775ca");

    // The cloth must land ON the brand colour, not on the cream mix of it that
    // `sailColor` carries — that dilution is what put a 200-ship fleet into one
    // narrow band of oatmeal.
    expect(distance(gardenSailClothColor(livery), primary)).toBeLessThan(0.2);
    expect(distance(new Color(livery.sailColor), primary)).toBeGreaterThan(0.6);
  });

  it("keeps two different issuers visibly apart on the water", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    const circle = gardenSailClothColor({ ...base, primary: "#2775ca" });
    const tether = gardenSailClothColor({ ...base, primary: "#136649" });

    // The old cream wash collapsed these two to within 0.09 of each other.
    expect(distance(circle, tether)).toBeGreaterThan(0.3);
  });

  it("floors the luminance so a near-black brand is dark cloth, not a hole", () => {
    const ink = gardenSailClothColor({
      ...buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery,
      primary: "#000000",
    });

    expect(ink.r * 0.2126 + ink.g * 0.7152 + ink.b * 0.0722).toBeGreaterThan(0.05);
  });

  it("puts a pale issuer under black canvas so its white mark survives", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    // Blast yellow: the palest brand in the inventory, contrast 1.10 vs white.
    const cloth = gardenSailClothColor({ ...base, primary: "#ffff07" });
    const luminance = cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722;

    // Dark enough for a white emblem to read...
    expect(luminance).toBeLessThan(0.05);
    // ...but not #000: the brand HUE survives, so it is their black, not any
    // black. Yellow sits near hue 1/6 and must still be there.
    const hsl = { h: 0, l: 0, s: 0 };
    cloth.getHSL(hsl, SRGBColorSpace);
    expect(hsl.s).toBeGreaterThan(0.2);
    expect(hsl.h).toBeCloseTo(1 / 6, 1);
  });

  it("leaves an issuer with enough contrast in its own colour", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    const cloth = gardenSailClothColor({ ...base, primary: "#2775ca" });

    // Circle blue clears the floor comfortably, so it must NOT be blackened.
    expect(cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722).toBeGreaterThan(0.1);
  });

  it("paints the atlas cell as marks only, leaving the cloth transparent", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;

    createGardenSailCanvas(ship, null, null);

    // No full-cell fill: the batch dyes the cloth per instance and reads a
    // texel's ALPHA as "how much of this is a mark". A field fill here would
    // make every sail opaque again and lose the dye.
    expect(fillRect).not.toHaveBeenCalledWith(0, 0, 128, 128);
  });

  it("still paints an opaque cloth for the hero path, which owns its material", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;

    createGardenSailTexture(ship, null);

    expect(fillRect).toHaveBeenCalledWith(0, 0, 128, 128);
  });
});

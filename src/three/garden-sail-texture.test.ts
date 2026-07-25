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
    const logo: ThreeLogoAsset = { image, src: "/logos/usdt.png" };

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
    // F1: the identity mark grew from radius 47 to 56 and re-centred on the
    // cell, so the symbol fallback is drawn larger and at 64,65.
    expect(fillText).toHaveBeenCalledWith(
      ship.symbol.slice(0, 7),
      64,
      65,
      56 * 1.76,
    );
  });
});

describe("W5.4 livery sail border", () => {
  it("frames the cloth inset from the edge so atlas cells cannot bleed", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    createGardenSailTexture(ship, null);

    expect(strokeRect).toHaveBeenCalled();
    // Every border pass must stay off the outermost texels: the batched fleet
    // packs these 128px cells edge-to-edge into one atlas (D3), so a flush
    // border would smear into the neighbouring ship under bilinear filtering.
    for (const [x, y, width, height] of strokeRect.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x + width).toBeLessThanOrEqual(124);
      expect(y + height).toBeLessThanOrEqual(124);
    }
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

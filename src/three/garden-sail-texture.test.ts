// @vitest-environment jsdom
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  SRGBColorSpace,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import type { StablecoinMeta } from "@shared/types";
import type { ThreeLogoAsset } from "../renderer/world-renderer-backend";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { resolveStablecoinShipBranding } from "../systems/stablecoin-ship-branding";
import { SAIL_DARK_CANVAS_ISSUERS } from "./garden-sail-overrides";
import {
  createGardenSailCanvas,
  createGardenSailTexture,
  gardenSailClothColor,
} from "./garden-sail-texture";
import { Color } from "three";

const arc = vi.fn();
const drawImage = vi.fn();
const fill = vi.fn();
const fillRect = vi.fn();
const fillText = vi.fn();
const stroke = vi.fn();
const strokeRect = vi.fn();
const contexts: CanvasRenderingContext2D[] = [];

beforeEach(() => {
  arc.mockClear();
  contexts.length = 0;
  drawImage.mockClear();
  fill.mockClear();
  fillRect.mockClear();
  fillText.mockClear();
  stroke.mockClear();
  strokeRect.mockClear();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => {
      const context = fakeContext();
      contexts.push(context);
      return context;
    }),
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
    // No emblem: the canonical asset still paints without an extracted mark.
    const logo: ThreeLogoAsset = { emblem: null, image, src: "/logos/usdt.png" };

    const texture = createGardenSailTexture(ship, logo);

    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(texture?.colorSpace).toBe(SRGBColorSpace);
    expect(texture?.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture?.wrapT).toBe(ClampToEdgeWrapping);
    expect(drawImage.mock.calls.some(([source]) => source === image)).toBe(true);
    expect(fillText).not.toHaveBeenCalled();
  });

  it("prints fallback initials when the issuer logo is unresolved", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;

    const texture = createGardenSailTexture(ship, null);

    expect(texture).toBeInstanceOf(CanvasTexture);
    expect(fillText).toHaveBeenCalledWith(
      ship.symbol.slice(0, 3).toUpperCase(), expect.any(Number), expect.any(Number), expect.any(Number),
    );
  });
});

describe("mon on cloth", () => {
  it("contains the complete extracted mark without distorting its aspect ratio", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    const image = document.createElement("img");
    const emblem = document.createElement("canvas");
    emblem.width = 96;
    emblem.height = 32;

    createGardenSailTexture(ship, { emblem, image, src: "/logos/usdc.svg" });

    const [, x, y, width, height] = drawImage.mock.calls.find(([source]) => source === emblem)!;
    expect(width / height).toBeCloseTo(3);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(x + width).toBeLessThan(128);
    expect(y + height).toBeLessThan(128);
    expect(drawImage.mock.calls.some(([source]) => source === image)).toBe(false);
    expect(fillText).not.toHaveBeenCalled();
  });

  it("falls back to the canonical logo when the extracted mark cannot draw", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    const image = document.createElement("img");
    const emblem = document.createElement("canvas");
    drawImage.mockImplementationOnce(() => {
      throw new Error("decode failed");
    });

    createGardenSailTexture(ship, { emblem, image, src: "/logos/usdc.svg" });

    expect(drawImage.mock.calls.some(([source]) => source === image)).toBe(true);
    expect(fillText).not.toHaveBeenCalled();
  });
});

function fakeContext(): CanvasRenderingContext2D {
  return {
    arc,
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage,
    fill,
    fillRect: vi.fn((...args: number[]) => fillRect(...args)),
    fillText,
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    stroke,
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

    // The cloth must stay in the brand's neighbourhood, not on the cream mix of
    // it that `sailColor` carries — that dilution is what put a 200-ship fleet
    // into one narrow band of oatmeal. 2026-09-07: the bound opened 0.2 -> 0.3
    // for CLOTH_CHROMA_RESTRAINT, which is chroma-only; the gap to the cream
    // wash below is what proves the dilution has NOT come back.
    expect(distance(gardenSailClothColor(livery, "usdc-circle"), primary)).toBeLessThan(0.3);
    expect(distance(new Color(livery.sailColor), primary)).toBeGreaterThan(0.6);
  });

  it("keeps two different issuers visibly apart on the water", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    const circle = gardenSailClothColor({ ...base, primary: "#2775ca" }, "usdc-circle");
    const tether = gardenSailClothColor({ ...base, primary: "#136649" }, "usdt-tether");

    // The old cream wash collapsed these two to within 0.09 of each other.
    expect(distance(circle, tether)).toBeGreaterThan(0.3);
  });

  it("floors the luminance so a near-black brand is dark cloth, not a hole", () => {
    const ink = gardenSailClothColor({
      ...buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery,
      primary: "#000000",
    }, "buidl-blackrock");

    expect(ink.r * 0.2126 + ink.g * 0.7152 + ink.b * 0.0722).toBeGreaterThan(0.05);
  });

  it("deepens a pale issuer into a legible dye of its own hue instead of blackening it", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    // Blast yellow: the palest brand in the inventory. 2026-09-10: the mon ink
    // picks dark or light against the cloth, so the cloth no longer has to go
    // black for the mark to read — it stays yellow at a dye lightness.
    const cloth = gardenSailClothColor({ ...base, primary: "#ffff07" }, "usdb-blast");
    const luminance = cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722;

    // Deep enough for a light ink, light enough to still be yellow cloth.
    expect(luminance).toBeGreaterThan(0.1);
    expect(luminance).toBeLessThan(0.45);
    const hsl = { h: 0, l: 0, s: 0 };
    cloth.getHSL(hsl, SRGBColorSpace);
    expect(hsl.s).toBeGreaterThan(0.5);
    expect(hsl.h).toBeCloseTo(1 / 6, 1);
  });

  it("leaves an issuer with enough contrast in its own colour", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    const cloth = gardenSailClothColor({ ...base, primary: "#2775ca" }, "usdc-circle");

    // Circle blue clears the floor comfortably, so it must NOT be blackened.
    expect(cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722).toBeGreaterThan(0.1);
  });

  it("puts a named pale issuer under black canvas without moving the floor", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    // Lybra's sky blue dyes to contrast 2.06 — above the 2.0 floor, so only the
    // override can darken it.
    const cloth = gardenSailClothColor({ ...base, primary: "#6caaef" }, "eusd-lybra");
    const hsl = { h: 0, l: 0, s: 0 };
    cloth.getHSL(hsl, SRGBColorSpace);

    expect(cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722).toBeLessThan(0.05);
    // Still theirs: a dark BLUE-black, not a shared #000. Blue sits near 0.6.
    expect(hsl.s).toBeGreaterThan(0.2);
    expect(hsl.h).toBeCloseTo(0.6, 1);
  });

  it("keeps the five overridden issuers apart from one another", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!.visual.livery;
    const dark = [
      ["bean-beanstalk", "#46bd56"],
      ["cash-phantom", "#b5a88c"],
      ["csusdl-coinshift", "#fc8770"],
      ["eusd-lybra", "#6caaef"],
      ["zchf-frankencoin", "#a3a7b2"],
    ].map(([id, primary]) => gardenSailClothColor({ ...base, primary: primary! }, id!));

    // R2b: growing the black squadron is only acceptable while each ship stays
    // recognisably its own. Every pair must differ somewhere.
    for (let first = 0; first < dark.length; first += 1) {
      for (let second = first + 1; second < dark.length; second += 1) {
        expect(distance(dark[first]!, dark[second]!)).toBeGreaterThan(0);
      }
    }
  });

  it("leaves DAI's amber where decision D5 put it", () => {
    const dai = resolveStablecoinShipBranding("dai-makerdao", {
      flags: { pegCurrency: "USD" },
    } as StablecoinMeta);
    const cloth = gardenSailClothColor(dai, "dai-makerdao");

    // DAI's amber is an operator-owned recognition cue: never under dark
    // canvas, always an amber (hue near 1/9) at full dye chroma. The hex pin
    // is the tripwire: if it moves, someone changed the dye pipeline, not a
    // detail. 2026-09-10: cfae85 -> cb9223 when the dye moved into OKLCH.
    const hsl = { h: 0, l: 0, s: 0 };
    cloth.getHSL(hsl, SRGBColorSpace);
    expect(cloth.getHexString()).toBe("cb9223");
    expect(cloth.r * 0.2126 + cloth.g * 0.7152 + cloth.b * 0.0722).toBeGreaterThan(0.2);
    expect(hsl.h).toBeCloseTo(0.11, 1);
    expect(hsl.s).toBeGreaterThan(0.6);
    expect(SAIL_DARK_CANVAS_ISSUERS.has("dai-makerdao")).toBe(false);
  });

  it("paints the atlas cell as marks only, leaving the cloth transparent", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;

    createGardenSailCanvas(ship, null, null);

    // No full-cell fill: the batch dyes the cloth per instance and reads a
    // texel's ALPHA as "how much of this is a mark". A field fill here would
    // make every sail opaque again and lose the dye.
    expect(contexts[0]!.fillRect).not.toHaveBeenCalledWith(0, 0, 128, 128);
  });

  it("still paints an opaque cloth for the hero path, which owns its material", () => {
    const ship = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;

    createGardenSailTexture(ship, null);

    expect(contexts[0]!.fillRect).toHaveBeenCalledWith(0, 0, 128, 128);
  });
});

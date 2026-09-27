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
  gardenSailDyeChromaCeiling,
} from "./garden-sail-texture";
import { hexToOklch } from "../systems/palette";
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

describe("W4.F2 one dye book", () => {
  const distance = (from: Color, to: Color) => Math.hypot(
    from.r - to.r,
    from.g - to.g,
    from.b - to.b,
  );
  const oklch = (color: Color) => hexToOklch(`#${color.getHexString()}`);
  const hueGap = (from: number, to: number) => Math.abs(((to - from + 540) % 360) - 180);

  it("keeps a blue issuer's hue exactly: no lavender shift", () => {
    for (const primary of ["#2775ca", "#1a54ad", "#0098ea", "#627eea", "#6caaef"]) {
      const cloth = oklch(gardenSailClothColor({ primary } as never));
      expect(hueGap(hexToOklch(primary).h, cloth.h)).toBeLessThan(3);
    }
  });

  it("keeps the fleet's value order: darks stay dark, pales stay pale", () => {
    const ladder = ["#0b2a5c", "#1d7137", "#b2410f", "#f5ac37", "#ffff07"]
      .map((primary) => ({ primary, cloth: oklch(gardenSailClothColor({ primary } as never)).l }));
    for (let index = 1; index < ladder.length; index += 1) {
      expect(Math.sign(ladder[index]!.cloth - ladder[index - 1]!.cloth))
        .toBe(Math.sign(hexToOklch(ladder[index]!.primary).l - hexToOklch(ladder[index - 1]!.primary).l));
    }
    // Blast yellow, the palest brand, flies pale cloth (dark ink carries its mon), not black.
    expect(oklch(gardenSailClothColor({ primary: "#ffff07" } as never)).l).toBeGreaterThan(0.8);
    // A near-black brand is dark cloth, not a hole.
    expect(oklch(gardenSailClothColor({ primary: "#000000" } as never)).l).toBeGreaterThanOrEqual(0.29);
  });

  it("caps every dye under the chroma only vermillion and lantern_warm exceed", () => {
    for (let hue = 0; hue < 360; hue += 15) expect(gardenSailDyeChromaCeiling(hue)).toBeLessThanOrEqual(0.12);
    for (const primary of ["#ff060a", "#ff00ff", "#00ff00", "#8247e5", "#ffa500", "#00ffff"]) {
      expect(oklch(gardenSailClothColor({ primary } as never)).c).toBeLessThanOrEqual(0.121);
    }
  });

  it("dyes neutral brands as kinari when pale and sumi when dark", () => {
    const kinari = oklch(gardenSailClothColor({ primary: "#d9d9d9" } as never));
    const sumi = oklch(gardenSailClothColor({ primary: "#2a2a2a" } as never));
    expect(kinari.c).toBeLessThan(0.02);
    expect(hueGap(kinari.h, 80)).toBeLessThan(10);
    expect(sumi.c).toBeLessThan(0.015);
    expect(sumi.l).toBeLessThan(kinari.l);
  });

  it("keeps two different issuers visibly apart on the water", () => {
    const circle = gardenSailClothColor({ primary: "#2775ca" } as never);
    const tether = gardenSailClothColor({ primary: "#136649" } as never);

    // The old cream wash collapsed these two to within 0.09 of each other.
    expect(distance(circle, tether)).toBeGreaterThan(0.3);
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

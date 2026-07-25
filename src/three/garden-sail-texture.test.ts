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
import { createGardenSailTexture } from "./garden-sail-texture";

const drawImage = vi.fn();
const fillText = vi.fn();
const strokeRect = vi.fn();

beforeEach(() => {
  drawImage.mockClear();
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
    expect(fillText).toHaveBeenCalledWith(
      ship.symbol.slice(0, 7),
      65,
      65,
      78.96,
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
    fillRect: vi.fn(),
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

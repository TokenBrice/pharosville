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

beforeEach(() => {
  drawImage.mockClear();
  fillText.mockClear();
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
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

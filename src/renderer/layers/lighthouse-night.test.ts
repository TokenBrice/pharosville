import { describe, expect, it, vi } from "vitest";
import { drawLighthouseNightHighlights, lighthouseOverlayScreenBounds } from "./lighthouse";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";

function makeCtx() {
  return createCanvasContextStub(
    ["save", "restore", "fillRect", "fill", "beginPath", "moveTo", "lineTo", "closePath", "ellipse", "arc", "translate", "rotate"],
    {
      fillStyle: "",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    },
  );
}

function makeInput(unavailable = false): DrawPharosVilleInput {
  return createDrawInput({
    ctx: makeCtx(),
    motion: {
      plan: {
        animatedShipIds: new Set(),
        effectShipIds: new Set(),
        lighthouseFireFlickerPerSecond: 1,
        moverShipIds: new Set(),
        shipPhases: new Map(),
        shipRoutes: new Map(),
      },
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 0,
    },
    world: {
      lighthouse: { tile: { x: 18, y: 30 }, color: "#ffd877", unavailable },
      ships: [],
    } as unknown as DrawPharosVilleInput["world"],
  });
}

describe("drawLighthouseNightHighlights", () => {
  it("does nothing when nightFactor is 0", () => {
    const input = makeInput();
    drawLighthouseNightHighlights(input, undefined, 0);
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });

  it("does nothing when the lighthouse is unavailable", () => {
    const input = makeInput(true);
    drawLighthouseNightHighlights(input, undefined, 1);
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });

  it("draws all night layers at full night", () => {
    const input = makeInput();
    drawLighthouseNightHighlights(input, undefined, 1);
    const fillMock = input.ctx.fill as unknown as ReturnType<typeof vi.fn>;
    // diffuse(1) + core(1) + right beam(1) + left beam(1) +
    // right shimmer(1) + left shimmer(1) + halo(1) + pool(1) = 8
    expect(fillMock.mock.calls.length).toBe(8);
  });
});

describe("lighthouseOverlayScreenBounds contracts with nightFactor", () => {
  it("returns a smaller (or equal) rect at full night than at noon", () => {
    // Beams fade with nightFactor (drawLighthouseBeam multiplies alpha by
    // 1 - nightFactor), so the beam reach contributing to selection bounds
    // collapses. At full night the bounds reduce to the selection rect.
    const input = makeInput();
    const selectionRect = { x: 0, y: 0, width: 100, height: 100 };
    const noon = lighthouseOverlayScreenBounds(input, selectionRect, undefined, 0);
    const night = lighthouseOverlayScreenBounds(input, selectionRect, undefined, 1);
    expect(night.width).toBeLessThan(noon.width);
  });
});

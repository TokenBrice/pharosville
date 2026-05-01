import { describe, expect, it, vi } from "vitest";
import { drawLighthouseNightHighlights, lighthouseOverlayScreenBounds } from "./lighthouse";
import type { DrawPharosVilleInput } from "../render-types";

function makeCtx() {
  const ctx: Record<string, unknown> = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function makeInput(unavailable = false): DrawPharosVilleInput {
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx: makeCtx(),
    height: 600,
    hoveredTarget: null,
    motion: {
      plan: { lighthouseFireFlickerPerSecond: 1 } as DrawPharosVilleInput["motion"]["plan"],
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 0,
    },
    selectedTarget: null,
    targets: [],
    width: 800,
    world: {
      lighthouse: { tile: { x: 18, y: 30 }, color: "#ffd877", unavailable },
      ships: [],
    } as unknown as DrawPharosVilleInput["world"],
  } as DrawPharosVilleInput;
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

  it("draws halo + warm water pool at full night (>= 2 fills, no beam wedges)", () => {
    const input = makeInput();
    drawLighthouseNightHighlights(input, undefined, 1);
    const fillMock = input.ctx.fill as unknown as ReturnType<typeof vi.fn>;
    // 1 halo arc + 1 water-pool ellipse. Beam wedges removed by design — at
    // night the lighthouse light is purely ambient, beams fade to nothing.
    expect(fillMock.mock.calls.length).toBe(2);
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

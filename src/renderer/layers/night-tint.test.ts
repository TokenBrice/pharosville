import { describe, expect, it, vi } from "vitest";
import { drawNightTint } from "./night-tint";
import type { DrawPharosVilleInput } from "../render-types";

function makeInput(width = 800, height = 600): DrawPharosVilleInput {
  const fillRect = vi.fn();
  const ctx = {
    fillRect,
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx,
    height,
    hoveredTarget: null,
    motion: {
      plan: {} as DrawPharosVilleInput["motion"]["plan"],
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 0,
    },
    selectedTarget: null,
    targets: [],
    width,
    world: {} as DrawPharosVilleInput["world"],
  } as DrawPharosVilleInput;
}

describe("drawNightTint", () => {
  it("does nothing when nightFactor is 0", () => {
    const input = makeInput();
    drawNightTint(input, 0);
    expect(input.ctx.fillRect).not.toHaveBeenCalled();
  });

  it("does nothing when nightFactor is negative (defensive)", () => {
    const input = makeInput();
    drawNightTint(input, -0.1);
    expect(input.ctx.fillRect).not.toHaveBeenCalled();
  });

  it("paints a translucent rect at full night (nightFactor = 1)", () => {
    const input = makeInput(800, 600);
    drawNightTint(input, 1);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(input.ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it("paints at partial alpha during dusk (nightFactor = 0.5)", () => {
    const input = makeInput();
    drawNightTint(input, 0.5);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
  });
});

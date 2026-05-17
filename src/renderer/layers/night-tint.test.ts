import { describe, expect, it, vi } from "vitest";
import { drawNightTint, drawNightVignette, drawSceneVignette } from "./night-tint";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";

function makeInput(width = 800, height = 600): DrawPharosVilleInput {
  const gradient = { addColorStop: vi.fn() };
  const ctx = createCanvasContextStub(
    ["fillRect", "save", "restore"],
    {
      createRadialGradient: vi.fn(() => gradient),
      fillStyle: "",
    },
  );
  return createDrawInput({
    ctx,
    width,
    height,
  });
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

describe("drawSceneVignette", () => {
  it("paints a deterministic day vignette even when nightFactor is 0", () => {
    const input = makeInput(810, 610);
    drawSceneVignette(input, 0);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(input.ctx.fillRect).toHaveBeenCalledWith(0, 0, 810, 610);
  });

  it("keeps the drawNightVignette export compatible", () => {
    const input = makeInput(811, 611);
    drawNightVignette(input, 0);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
  });

  it("uses the full cinematic edge alpha at night", () => {
    const gradient = { addColorStop: vi.fn() };
    const input = makeInput(812, 612);
    (input.ctx as unknown as { createRadialGradient: ReturnType<typeof vi.fn> }).createRadialGradient = vi.fn(() => gradient);

    drawSceneVignette(input, 1);

    expect(gradient.addColorStop).toHaveBeenCalledWith(1, "rgba(5, 3, 18, 0.82)");
  });

  it("reuses the vignette gradient within the same size, DPR, and night bucket", () => {
    const input = makeInput(820, 620);
    input.dpr = 2;

    drawSceneVignette(input, 0.51);
    drawSceneVignette(input, 0.52);

    expect((input.ctx as unknown as { createRadialGradient: ReturnType<typeof vi.fn> }).createRadialGradient)
      .toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it } from "vitest";
import { drawNightTint } from "./night-tint";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";

function makeInput(width = 800, height = 600): DrawPharosVilleInput {
  const ctx = createCanvasContextStub(
    ["fillRect", "save", "restore"],
    { fillStyle: "" },
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

import { describe, expect, it, vi } from "vitest";
import {
  DAY_BEAM_BASE_ALPHA,
  NIGHT_WATER_POOL_RADIUS,
  drawLighthouseNightHighlights,
  drawLighthouseReflection,
  drawLighthouseThunderRim,
  lighthouseOverlayScreenBounds,
} from "./lighthouse";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";
import { lightningThunderRimIntensityForWorld } from "./weather";

function makeCtx() {
  return createCanvasContextStub(
    ["save", "restore", "fillRect", "fill", "beginPath", "moveTo", "lineTo", "closePath", "ellipse", "arc", "translate", "rotate", "clip", "quadraticCurveTo", "stroke"],
    {
      fillStyle: "",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      lineCap: "butt",
      lineJoin: "miter",
      lineWidth: 1,
      strokeStyle: "",
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
      areas: [],
      ships: [],
    } as unknown as DrawPharosVilleInput["world"],
  });
}

function makeThunderWorld(): DrawPharosVilleInput["world"] {
  return {
    lighthouse: {
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 18, y: 30 },
      color: "#ffd877",
      unavailable: false,
      psiBand: "NORMAL",
      score: 80,
      detailId: "lighthouse",
    },
    areas: [{
      id: "area.dews.danger",
      kind: "area",
      label: "Danger Strait",
      tile: { x: 55, y: 4 },
      band: "DANGER",
      count: 1,
      detailId: "area.dews.danger",
    }],
    ships: [],
  } as unknown as DrawPharosVilleInput["world"];
}

function findThunderRimTime(world: DrawPharosVilleInput["world"]): number {
  for (let time = 0; time < 8; time += 0.005) {
    if (lightningThunderRimIntensityForWorld(world, time, false) > 0.8) return time;
  }
  throw new Error("Could not find deterministic thunder-rim apex time");
}

describe("drawLighthouseNightHighlights", () => {
  it("keeps the planned beam and pool constants", () => {
    expect(DAY_BEAM_BASE_ALPHA).toBe(0.08);
    expect(NIGHT_WATER_POOL_RADIUS).toBe(1000);
  });

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
    // diffuse(1) + core(1) + sweep beams(2) + beam-tail glints(12)
    // + ember trails (9 per beam × 2 = 18, last particle filtered by alpha threshold)
    // + pool(1) + directional spill(1) + alert spill(1) = 37
    expect(fillMock.mock.calls.length).toBe(37);
  });

  it("rotates over time", () => {
    const grad1 = { addColorStop: vi.fn() };
    const grad2 = { addColorStop: vi.fn() };
    const linearMock = vi.fn()
      .mockReturnValueOnce(grad1)
      .mockReturnValueOnce(grad2)
      .mockReturnValue({ addColorStop: vi.fn() });

    const input1 = makeInput();
    (input1.ctx as unknown as { createLinearGradient: typeof linearMock }).createLinearGradient = linearMock;
    input1.motion.timeSeconds = 0;
    drawLighthouseNightHighlights(input1, undefined, 1);
    const firstCallArgs = linearMock.mock.calls[0]!;

    linearMock.mockClear();
    linearMock
      .mockReturnValueOnce(grad1)
      .mockReturnValueOnce(grad2)
      .mockReturnValue({ addColorStop: vi.fn() });

    const input2 = makeInput();
    (input2.ctx as unknown as { createLinearGradient: typeof linearMock }).createLinearGradient = linearMock;
    input2.motion.timeSeconds = 12;
    drawLighthouseNightHighlights(input2, undefined, 1);
    const secondCallArgs = linearMock.mock.calls[0]!;

    // Endpoints (x2,y2) of the first sweep beam differ between t=0 and t=12.
    const endpointDiffers = firstCallArgs[2] !== secondCallArgs[2] || firstCallArgs[3] !== secondCallArgs[3];
    expect(endpointDiffers).toBe(true);
  });
});

describe("drawLighthouseReflection", () => {
  it("clips and paints a warm deterministic reflection under the lighthouse headland", () => {
    const input = makeInput();
    drawLighthouseReflection(input, undefined, 1);
    expect(input.ctx.clip).toHaveBeenCalledTimes(1);
    expect(input.ctx.stroke).toHaveBeenCalled();
  });
});

describe("drawLighthouseThunderRim", () => {
  it("paints only at the deterministic lightning apex and stays off under reduced motion", () => {
    const world = makeThunderWorld();
    const apexTime = findThunderRimTime(world);
    const input = makeInput();
    input.world = world;
    input.motion.timeSeconds = apexTime;
    drawLighthouseThunderRim(input, undefined, 1);
    expect(input.ctx.stroke).toHaveBeenCalled();

    const reduced = makeInput();
    reduced.world = world;
    reduced.motion.timeSeconds = apexTime;
    reduced.motion.reducedMotion = true;
    drawLighthouseThunderRim(reduced, undefined, 1);
    expect(reduced.ctx.stroke).not.toHaveBeenCalled();
  });
});

describe("lighthouseOverlayScreenBounds contracts with nightFactor", () => {
  it("returns a smaller (or equal) rect at full night than at noon", () => {
    // Day beam wedge contributes to bounds while daylight reach remains;
    // the night sweep is drawn in a separate full-screen pass and doesn't
    // need the overlay drawable's culling rect, so bounds shrink at night.
    const input = makeInput();
    const selectionRect = { x: 0, y: 0, width: 100, height: 100 };
    const noon = lighthouseOverlayScreenBounds(input, selectionRect, undefined, 0);
    const night = lighthouseOverlayScreenBounds(input, selectionRect, undefined, 1);
    expect(night.width).toBeLessThan(noon.width);
  });
});

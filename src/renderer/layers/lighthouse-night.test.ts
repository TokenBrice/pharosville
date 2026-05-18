import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAY_BEAM_BASE_ALPHA,
  NIGHT_WATER_POOL_RADIUS,
  drawLighthouseGodRays,
  drawLighthouseNightHighlights,
  drawLighthouseOverlay,
  drawLighthouseReflection,
  drawLighthouseThunderRim,
  godRayCacheKey,
  godRayCacheSize,
  lighthouseOverlayScreenBounds,
  resetGodRayCache,
} from "./lighthouse";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";
import { lightningThunderRimIntensityForWorld } from "./weather";

function makeCtx() {
  return createCanvasContextStub(
    ["save", "restore", "drawImage", "fillRect", "fill", "beginPath", "moveTo", "lineTo", "closePath", "ellipse", "arc", "translate", "scale", "rotate", "clip", "quadraticCurveTo", "stroke"],
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
    const strokeMock = input.ctx.stroke as unknown as ReturnType<typeof vi.fn>;
    // diffuse/core + beam bodies + ember trails + warm pool and directional/alert spill.
    // Beam caustics are strokes now.
    expect(fillMock.mock.calls.length).toBeGreaterThanOrEqual(25);
    expect(strokeMock).toHaveBeenCalled();
  });

  it("ignores the authored pyre asset and keeps the procedural lighthouse flame", () => {
    const input = makeInput();
    const pyreAsset = {
      entry: {
        anchor: [32, 56],
        displayScale: 1,
        height: 64,
        width: 64,
      },
      image: {} as HTMLImageElement,
    };
    const assets = {
      get: vi.fn((id: string) => id === "landmark.lighthouse-pyre" ? pyreAsset : null),
    } as unknown as DrawPharosVilleInput["assets"];
    input.assets = assets;

    drawLighthouseOverlay(input, undefined, 1);

    expect(assets?.get).not.toHaveBeenCalledWith("landmark.lighthouse-pyre");
    expect(input.ctx.drawImage).not.toHaveBeenCalled();
    expect(input.ctx.fill).toHaveBeenCalled();
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

describe("godRayCacheKey bucketing", () => {
  it("returns the same key for inputs in the same bucket", () => {
    // Angles within the same 32-bucket slice (≈11.25° each) collapse.
    const tau = Math.PI * 2;
    const bucketWidth = tau / 32;
    const a = bucketWidth * 4.0;
    const b = bucketWidth * 4.0 + bucketWidth * 0.2;
    expect(godRayCacheKey(a, 1.35, 0.8)).toBe(godRayCacheKey(b, 1.35, 0.8));
  });

  it("returns distinct keys when angle, zoom, or night bucket differs", () => {
    const base = godRayCacheKey(0.5, 1.35, 0.8);
    const tau = Math.PI * 2;
    const distinctAngle = godRayCacheKey(0.5 + tau / 32, 1.35, 0.8);
    const distinctZoom = godRayCacheKey(0.5, 0.5, 0.8);
    const distinctNight = godRayCacheKey(0.5, 1.35, 0.1);
    expect(distinctAngle).not.toBe(base);
    expect(distinctZoom).not.toBe(base);
    expect(distinctNight).not.toBe(base);
  });

  it("wraps angles modulo 2π so equivalent rotations share a key", () => {
    const tau = Math.PI * 2;
    expect(godRayCacheKey(0.3, 1.35, 0.8)).toBe(godRayCacheKey(0.3 + tau, 1.35, 0.8));
    expect(godRayCacheKey(0.3, 1.35, 0.8)).toBe(godRayCacheKey(0.3 - tau, 1.35, 0.8));
  });

  it("clamps night factor into [0,1] before bucketing", () => {
    expect(godRayCacheKey(0, 1, 0)).toBe(godRayCacheKey(0, 1, -0.5));
    expect(godRayCacheKey(0, 1, 1)).toBe(godRayCacheKey(0, 1, 1.5));
  });
});

describe("godRaySpriteCache eviction", () => {
  type DocumentStub = {
    createElement: ReturnType<typeof vi.fn>;
  };
  let originalDocument: unknown;
  let documentDefinedBefore: boolean;

  beforeEach(() => {
    resetGodRayCache();
    documentDefinedBefore = "document" in globalThis;
    originalDocument = (globalThis as { document?: unknown }).document;
    const stubContext = {
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      strokeStyle: "",
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
    const documentStub: DocumentStub = {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: () => stubContext,
      })),
    };
    (globalThis as { document?: unknown }).document = documentStub;
  });

  afterEach(() => {
    resetGodRayCache();
    if (documentDefinedBefore) {
      (globalThis as { document?: unknown }).document = originalDocument;
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  function makeMotion(time = 0): PharosVilleCanvasMotion {
    return {
      plan: {
        animatedShipIds: new Set(),
        effectShipIds: new Set(),
        lighthouseFireFlickerPerSecond: 1,
        moverShipIds: new Set(),
        shipPhases: new Map(),
        shipRoutes: new Map(),
      },
      reducedMotion: false,
      timeSeconds: time,
      wallClockHour: 0,
    } as unknown as PharosVilleCanvasMotion;
  }

  function makeStrokeCtx(): CanvasRenderingContext2D {
    return createCanvasContextStub(
      [
        "save", "restore", "beginPath", "moveTo", "lineTo", "stroke", "translate",
        "rotate", "drawImage",
      ],
      {
        fillStyle: "",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        lineCap: "butt",
        lineJoin: "miter",
        lineWidth: 1,
        strokeStyle: "",
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      },
    );
  }

  it("populates the sprite cache and caps it at the LRU limit", () => {
    expect(godRayCacheSize()).toBe(0);

    // A single night-frame populates a handful of buckets (zoom + a few
    // angle/night bucket combinations for the 16 rays).
    const ctx = makeStrokeCtx();
    drawLighthouseGodRays(ctx, { x: 100, y: 100 }, 1.35, makeMotion(0), 0.8);
    const firstCallCount = godRayCacheSize();
    expect(firstCallCount).toBeGreaterThan(0);

    // Repeating the same call shouldn't grow the cache — every bucket hits.
    drawLighthouseGodRays(ctx, { x: 100, y: 100 }, 1.35, makeMotion(0), 0.8);
    expect(godRayCacheSize()).toBe(firstCallCount);

    // Sweeping through 300+ distinct (angle, night) combinations should keep
    // the cache pinned at the 256-entry LRU cap.
    for (let i = 0; i < 320; i += 1) {
      const time = i * 0.5;
      const night = ((i % 20) + 1) / 21;
      drawLighthouseGodRays(ctx, { x: 100, y: 100 }, 1.35, makeMotion(time), night);
    }
    expect(godRayCacheSize()).toBeLessThanOrEqual(256);
  });

  it("uses the cached sprite path instead of per-frame createLinearGradient", () => {
    const ctx = makeStrokeCtx();
    drawLighthouseGodRays(ctx, { x: 100, y: 100 }, 1.35, makeMotion(0), 0.8);
    const firstLinearGradientCalls = (ctx.createLinearGradient as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    // Warm-up populates the cache via offscreen-canvas baking; the main ctx
    // shouldn't see any createLinearGradient calls.
    expect(firstLinearGradientCalls).toBe(0);
    // drawImage should fire for each of the 16 rays now that the sprite is cached.
    expect((ctx.drawImage as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(16);
  });
});

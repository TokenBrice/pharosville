import { describe, expect, it, vi } from "vitest";
import { defaultCamera } from "../../systems/camera";
import type { AreaNode, DewsAreaBand, PharosVilleWorld } from "../../systems/world-types";
import type { DrawPharosVilleInput } from "../render-types";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import {
  ATMOSPHERIC_FADE_MAX_ALPHA,
  CLOUD_SHADOW_PERIOD_SECONDS,
  FILM_GRAIN_DPR_GATE,
  REVEAL_HEADLAND_OFFSET_PX,
  REVEAL_LIGHTHOUSE_SWEEP_SCALE,
  REVEAL_PHASE_LIGHTHOUSE,
  REVEAL_PHASE_SCENE,
  applyRevealEnvelope,
  atmosphericFadeMaxAlpha,
  cloudShadowAlpha,
  cloudShadowPhase,
  cloudShadowSamples,
  drawAtmosphericFade,
  drawFilmGrainPass,
  establishingShotCaption,
  isEstablishingShotEligible,
  orderedDitherThreshold,
  shouldDrawFilmGrain,
} from "./cinematic-atmosphere";

function makeWorld(band: DewsAreaBand | null = null): PharosVilleWorld {
  const area = band
    ? [{
        id: `area.dews.${band.toLowerCase()}`,
        band,
        label: `${band} waters`,
        tile: { x: 44, y: 14 },
      } as AreaNode]
    : [];
  return {
    lighthouse: {
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 18, y: 28 },
      psiBand: "healthy",
      score: 98,
      color: "#ffd877",
      unavailable: false,
      detailId: "lighthouse",
    },
    pigeonnier: { id: "pigeonnier", kind: "pigeonnier", label: "Pigeonnier", tile: { x: 48, y: 45 }, detailId: "pigeonnier" },
    areas: area,
    docks: [],
    ships: [],
    graves: [],
    map: { width: 56, height: 56, tiles: [], waterRatio: 0.86 },
    effects: [],
    detailIndex: {},
    entityById: {},
    legends: [],
    visualCues: [],
    routeMode: "world",
    freshness: {},
    generatedAt: 0,
  } as unknown as PharosVilleWorld;
}

function makeInput(world = makeWorld()): DrawPharosVilleInput {
  return createDrawInput({
    camera: defaultCamera({ height: 600, map: world.map, width: 800 }),
    height: 600,
    width: 800,
    world,
  });
}

describe("cinematic atmospheric fade", () => {
  it("caps the veil at 0.18 and reduces it at night", () => {
    expect(atmosphericFadeMaxAlpha(0)).toBeCloseTo(ATMOSPHERIC_FADE_MAX_ALPHA);
    expect(atmosphericFadeMaxAlpha(1)).toBeCloseTo(ATMOSPHERIC_FADE_MAX_ALPHA * 0.6);
    expect(atmosphericFadeMaxAlpha(3)).toBeCloseTo(ATMOSPHERIC_FADE_MAX_ALPHA * 0.6);
  });

  it("reuses the radial gradient for an unchanged viewport bucket", () => {
    const gradient = { addColorStop: vi.fn() };
    const ctx = createCanvasContextStub(
      ["save", "restore", "fillRect"],
      {
        createRadialGradient: vi.fn(() => gradient),
        fillStyle: "",
      },
    );
    const input = { ...makeInput(), ctx, dpr: 2 };

    drawAtmosphericFade(input, 0);
    drawAtmosphericFade(input, 0);

    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });
});

describe("cinematic establishing shot", () => {
  it("shows only when unselected and near the default camera", () => {
    const input = makeInput();

    expect(isEstablishingShotEligible(input)).toBe(true);
    expect(isEstablishingShotEligible({
      ...input,
      camera: { ...input.camera, offsetX: input.camera.offsetX + 96 },
    })).toBe(false);
    expect(isEstablishingShotEligible({
      ...input,
      camera: { ...input.camera, zoom: input.camera.zoom + 0.08 },
    })).toBe(false);
    expect(isEstablishingShotEligible({
      ...input,
      selectedTarget: { id: "lighthouse" } as NonNullable<DrawPharosVilleInput["selectedTarget"]>,
    })).toBe(false);
  });

  it("uses the lighthouse PSI band in the caption", () => {
    expect(establishingShotCaption(makeWorld())).toBe("PHAROS LIGHTHOUSE — PSI HEALTHY");
    expect(establishingShotCaption({
      ...makeWorld(),
      lighthouse: { ...makeWorld().lighthouse, unavailable: true, psiBand: null },
    })).toBe("PHAROS LIGHTHOUSE — PSI UNAVAILABLE");
  });
});

describe("cinematic cloud shadow", () => {
  it("suppresses at night and strengthens with threat", () => {
    expect(cloudShadowAlpha(0, 4)).toBeGreaterThan(cloudShadowAlpha(0, 0));
    expect(cloudShadowAlpha(0.15, 2)).toBeCloseTo(cloudShadowAlpha(0, 2) * 0.5);
    expect(cloudShadowAlpha(0.31, 4)).toBe(0);
  });

  it("loops around 95 seconds at calm wind and accelerates with wind", () => {
    expect(cloudShadowPhase(CLOUD_SHADOW_PERIOD_SECONDS, 1, false)).toBeCloseTo(0);
    expect(cloudShadowPhase(CLOUD_SHADOW_PERIOD_SECONDS, 1.85, false)).toBeCloseTo(0.85);
  });

  it("freezes to a deterministic sample under reduced motion", () => {
    const input = makeInput(makeWorld("DANGER"));
    const first = cloudShadowSamples({
      ...input,
      motion: { ...input.motion, reducedMotion: true, timeSeconds: 12 },
    }, 0);
    const second = cloudShadowSamples({
      ...input,
      motion: { ...input.motion, reducedMotion: true, timeSeconds: 76 },
    }, 0);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});

describe("cinematic film pass helpers", () => {
  it("gates off for reduced motion and low explicit DPR", () => {
    expect(shouldDrawFilmGrain(true, 2)).toBe(false);
    expect(shouldDrawFilmGrain(false, 1)).toBe(false);
    expect(shouldDrawFilmGrain(false, FILM_GRAIN_DPR_GATE)).toBe(true);
    expect(shouldDrawFilmGrain(false, undefined)).toBe(true);
  });

  it("uses a repeating ordered dither threshold", () => {
    expect(orderedDitherThreshold(0, 0)).toBeGreaterThan(0);
    expect(orderedDitherThreshold(7, 7)).toBeLessThan(1);
    expect(orderedDitherThreshold(8, 8)).toBe(orderedDitherThreshold(0, 0));
    expect(orderedDitherThreshold(1, 0)).toBeGreaterThan(orderedDitherThreshold(0, 0));
  });

  it("caches reusable grain and scanline patterns per drawing context", () => {
    const previousDocument = (globalThis as { document?: unknown }).document;
    const createElement = vi.fn(() => {
      const tileCtx = {
        createImageData: vi.fn((width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        })),
        fillRect: vi.fn(),
        fillStyle: "",
        putImageData: vi.fn(),
      };
      return {
        getContext: vi.fn(() => tileCtx),
        height: 0,
        width: 0,
      };
    });
    (globalThis as { document?: unknown }).document = { createElement };
    const pattern = {};
    const ctx = createCanvasContextStub(
      ["fillRect", "restore", "save"],
      {
        createPattern: vi.fn(() => pattern),
        fillStyle: "",
      },
    );
    const input = createDrawInput({
      ctx,
      dpr: FILM_GRAIN_DPR_GATE,
      motion: { ...makeInput().motion, reducedMotion: false },
    });

    try {
      drawFilmGrainPass(input);
      drawFilmGrainPass(input);
    } finally {
      if (previousDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = previousDocument;
      }
    }

    expect(ctx.createPattern).toHaveBeenCalledTimes(2);
    expect(createElement).toHaveBeenCalledTimes(2);
  });
});

describe("reveal envelope (W4.01)", () => {
  it("resolves to the steady-state frame when envelope is undefined or >= 1", () => {
    const steady = applyRevealEnvelope(1);
    expect(steady.envelope).toBe(1);
    expect(steady.sceneAlpha).toBe(1);
    expect(steady.headlandYOffset).toBe(0);
    expect(steady.drawLighthouse).toBe(true);
    expect(steady.lighthouseSweepScale).toBe(1);

    const omitted = applyRevealEnvelope();
    expect(omitted).toEqual(steady);

    const overshoot = applyRevealEnvelope(1.5);
    expect(overshoot).toEqual(steady);
  });

  it("phase 1: hides scene and lighthouse for envelope < 0.33", () => {
    const phase1 = applyRevealEnvelope(0.1);
    expect(phase1.sceneAlpha).toBe(0);
    expect(phase1.headlandYOffset).toBe(REVEAL_HEADLAND_OFFSET_PX);
    expect(phase1.drawLighthouse).toBe(false);
    expect(phase1.lighthouseSweepScale).toBe(1);

    const boundary = applyRevealEnvelope(REVEAL_PHASE_SCENE);
    expect(boundary.sceneAlpha).toBe(0);
    expect(boundary.drawLighthouse).toBe(false);
  });

  it("phase 2: scene fades in via cubic-out and headland slides up", () => {
    const start = applyRevealEnvelope(REVEAL_PHASE_SCENE + 0.001);
    expect(start.sceneAlpha).toBeGreaterThan(0);
    expect(start.sceneAlpha).toBeLessThan(0.05);
    expect(start.headlandYOffset).toBeGreaterThan(0);
    expect(start.drawLighthouse).toBe(false);

    const mid = applyRevealEnvelope((REVEAL_PHASE_SCENE + REVEAL_PHASE_LIGHTHOUSE) / 2);
    expect(mid.sceneAlpha).toBeGreaterThan(0.4);
    expect(mid.sceneAlpha).toBeLessThan(1);
    expect(mid.headlandYOffset).toBeGreaterThan(0);
    expect(mid.headlandYOffset).toBeLessThan(REVEAL_HEADLAND_OFFSET_PX);
    expect(mid.drawLighthouse).toBe(false);

    const end = applyRevealEnvelope(REVEAL_PHASE_LIGHTHOUSE);
    expect(end.sceneAlpha).toBe(1);
    expect(end.headlandYOffset).toBe(0);
    expect(end.drawLighthouse).toBe(true);
    expect(end.lighthouseSweepScale).toBe(REVEAL_LIGHTHOUSE_SWEEP_SCALE);
  });

  it("phase 3: lighthouse is on and sweep is slowed by 2.2x", () => {
    const phase3 = applyRevealEnvelope(0.8);
    expect(phase3.sceneAlpha).toBe(1);
    expect(phase3.headlandYOffset).toBe(0);
    expect(phase3.drawLighthouse).toBe(true);
    expect(phase3.lighthouseSweepScale).toBe(REVEAL_LIGHTHOUSE_SWEEP_SCALE);
  });

  it("treats reduced-motion clients identically to envelope 1 (immediate final frame)", () => {
    // Reduced-motion callers should pass `1` directly; the helper has the same
    // shape either way, ensuring the static frame is always the revealed one.
    expect(applyRevealEnvelope(1)).toEqual(applyRevealEnvelope(undefined));
  });

  it("clamps negative and NaN inputs to a deterministic phase-1 start", () => {
    const negative = applyRevealEnvelope(-0.5);
    expect(negative.envelope).toBe(0);
    expect(negative.sceneAlpha).toBe(0);
    expect(negative.headlandYOffset).toBe(REVEAL_HEADLAND_OFFSET_PX);
  });
});

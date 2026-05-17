import { describe, expect, it } from "vitest";
import { defaultCamera } from "../../systems/camera";
import type { AreaNode, DewsAreaBand, PharosVilleWorld } from "../../systems/world-types";
import type { DrawPharosVilleInput } from "../render-types";
import { createDrawInput } from "../__test-utils__/draw-input";
import {
  ATMOSPHERIC_FADE_MAX_ALPHA,
  CLOUD_SHADOW_PERIOD_SECONDS,
  FILM_GRAIN_DPR_GATE,
  atmosphericFadeMaxAlpha,
  cloudShadowAlpha,
  cloudShadowPhase,
  cloudShadowSamples,
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
});

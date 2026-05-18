import { describe, expect, it } from "vitest";
import type { PharosVilleWorld } from "../../systems/world-types";
import { ZONE_THEMES } from "../../systems/palette";
import { buildRecordingCanvasContext } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";
import {
  drawHarborSurf,
  HARBOR_SURF_BY_DOCK,
  HARBOR_SURF_PEAK_ALPHA,
} from "./harbor-surf";

function makeDock(overrides: Partial<PharosVilleWorld["docks"][number]> = {}): PharosVilleWorld["docks"][number] {
  return {
    chainId: "ethereum",
    detailId: "dock.ethereum",
    healthBand: "healthy",
    id: "dock.ethereum",
    kind: "dock",
    label: "Ethereum Civic Cove",
    logoSrc: null,
    assetId: "dock.ethereum-civic-cove",
    tile: { x: 42, y: 31 },
    totalUsd: 1000,
    size: 5,
    stablecoinCount: 4,
    concentration: 0.4,
    harboredStablecoins: [],
    ...overrides,
  } as PharosVilleWorld["docks"][number];
}

function makeWorld(docks: PharosVilleWorld["docks"]): PharosVilleWorld {
  return {
    docks,
    map: { width: 56, height: 56, tiles: [], waterRatio: 0.86 },
  } as unknown as PharosVilleWorld;
}

describe("HARBOR_SURF_BY_DOCK", () => {
  it("defines a 6-segment ribbon for each chain harbor it covers", () => {
    const ribbons = Object.values(HARBOR_SURF_BY_DOCK);
    expect(ribbons.length).toBeGreaterThan(0);
    for (const ribbon of ribbons) {
      expect(ribbon).toHaveLength(6);
      for (const segment of ribbon) {
        expect(Number.isFinite(segment.x)).toBe(true);
        expect(Number.isFinite(segment.y)).toBe(true);
        expect(segment.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("drawHarborSurf", () => {
  it("paints a foam wash for each dock with a matching ribbon entry", () => {
    const ethereumDock = makeDock();
    const world = makeWorld([ethereumDock]);
    const recording = buildRecordingCanvasContext({ initialValues: { lineCap: "" } });
    const input = createDrawInput({
      ctx: recording.ctx,
      width: 1280,
      height: 720,
      motion: {
        plan: {
          animatedShipIds: new Set(),
          effectShipIds: new Set(),
          lighthouseFireFlickerPerSecond: 0,
          moverShipIds: new Set(),
          shipPhases: new Map(),
          shipRoutes: new Map(),
        },
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      world,
    });

    drawHarborSurf(input);

    expect(recording.callsTo("beginPath").length).toBe(6);
    expect(recording.callsTo("stroke").length).toBe(6);
    expect(recording.callsTo("quadraticCurveTo").length).toBe(6);

    // Every stroke color should be the spec'd foam_white at some alpha
    // proportional to (wash × peakAlpha × beachFoamAlpha) for the dock's
    // zone. We assert the captured stroke alphas land below the spec peak
    // (peak × beachFoamAlpha) and above 0 — the per-segment wash modulates
    // around 0.58 ± 0.12 so the product stays comfortably within bounds.
    const strokeAlphas = collectStrokeAlphas(recording.setStyles.strokeStyle);
    expect(strokeAlphas.length).toBeGreaterThan(0);
    const peakForEthereum = HARBOR_SURF_PEAK_ALPHA * ZONE_THEMES["alert-water"].beachFoamAlpha;
    const peakForWater = HARBOR_SURF_PEAK_ALPHA * ZONE_THEMES.water.beachFoamAlpha;
    const peakUpperBound = Math.max(peakForEthereum, peakForWater) + 1e-3;
    for (const alpha of strokeAlphas) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(peakUpperBound);
    }
  });

  it("returns a deterministic peak frame under reduced motion", () => {
    const ethereumDock = makeDock();
    const world = makeWorld([ethereumDock]);
    const recordingA = buildRecordingCanvasContext({ initialValues: { lineCap: "" } });
    const recordingB = buildRecordingCanvasContext({ initialValues: { lineCap: "" } });
    const reducedMotionMotion = {
      plan: {
        animatedShipIds: new Set<string>(),
        effectShipIds: new Set<string>(),
        lighthouseFireFlickerPerSecond: 0,
        moverShipIds: new Set<string>(),
        shipPhases: new Map(),
        shipRoutes: new Map(),
      },
      reducedMotion: true,
      timeSeconds: 4.2,
      wallClockHour: 12,
    } satisfies DrawPharosVilleInput["motion"];

    const inputA = createDrawInput({
      ctx: recordingA.ctx,
      width: 1280,
      height: 720,
      motion: reducedMotionMotion,
      world,
    });
    const inputB = createDrawInput({
      ctx: recordingB.ctx,
      width: 1280,
      height: 720,
      motion: { ...reducedMotionMotion, timeSeconds: 17.31 },
      world,
    });

    drawHarborSurf(inputA);
    drawHarborSurf(inputB);

    const allStrokesA = recordingA
      .callsTo("stroke")
      .length;
    expect(allStrokesA).toBe(6);
    expect(recordingB.callsTo("stroke").length).toBe(6);

    // moveTo + quadraticCurveTo arg vectors must match exactly between the
    // two reduced-motion frames since the wash is pinned and `time` is
    // ignored for phase math.
    const moveToA = recordingA.callsTo("moveTo");
    const moveToB = recordingB.callsTo("moveTo");
    const curveA = recordingA.callsTo("quadraticCurveTo");
    const curveB = recordingB.callsTo("quadraticCurveTo");
    expect(moveToA).toEqual(moveToB);
    expect(curveA).toEqual(curveB);
  });

  it("skips docks without a HARBOR_SURF_BY_DOCK entry", () => {
    const unknownDock = makeDock({
      id: "dock.not-in-table",
      detailId: "dock.not-in-table",
      chainId: "not-in-table",
    });
    const world = makeWorld([unknownDock]);
    const recording = buildRecordingCanvasContext({ initialValues: { lineCap: "" } });
    const input = createDrawInput({
      ctx: recording.ctx,
      width: 1280,
      height: 720,
      world,
    });

    drawHarborSurf(input);

    expect(recording.callsTo("stroke")).toHaveLength(0);
    expect(recording.callsTo("beginPath")).toHaveLength(0);
  });
});

// Parses the `rgba(r,g,b,a)` strokeStyle that the layer set on the canvas
// proxy and returns its alpha. We only sample the final assignment — the
// recording stub overwrites on each `ctx.strokeStyle = …` write — which is
// enough to assert the alpha lands inside the spec'd peak band.
function collectStrokeAlphas(latestStrokeStyle: unknown): number[] {
  if (typeof latestStrokeStyle !== "string") return [];
  const match = /rgba\([^)]+,\s*([0-9.]+)\)/.exec(latestStrokeStyle);
  return match ? [Number.parseFloat(match[1]!)] : [];
}

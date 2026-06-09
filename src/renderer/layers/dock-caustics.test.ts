import { describe, expect, it } from "vitest";
import type { PharosVilleWorld } from "../../systems/world-types";
import { buildRecordingCanvasContext } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";
import { drawDockCaustics } from "./dock-caustics";

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
    areas: [],
    docks,
    map: { width: 56, height: 56, tiles: [], waterRatio: 0.86 },
  } as unknown as PharosVilleWorld;
}

describe("drawDockCaustics", () => {
  it("paints three shimmer rings per major dock and reports the dock count", () => {
    const world = makeWorld([
      makeDock(),
      makeDock({ chainId: "base", detailId: "dock.base", id: "dock.base", tile: { x: 39, y: 38 } }),
    ]);
    const recording = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });
    const input = createDrawInput({ ctx: recording.ctx, world });

    const drawn = drawDockCaustics(input);

    expect(drawn).toBe(2);
    expect(recording.callsTo("ellipse")).toHaveLength(6);
    expect(recording.callsTo("stroke")).toHaveLength(6);
  });

  it("skips docks outside the four major EVM-bay bodies", () => {
    const world = makeWorld([
      makeDock({ chainId: "solana", detailId: "dock.solana", id: "dock.solana", tile: { x: 25, y: 22 } }),
    ]);
    const recording = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });
    const input = createDrawInput({ ctx: recording.ctx, world });

    expect(drawDockCaustics(input)).toBe(0);
    expect(recording.callsTo("ellipse")).toHaveLength(0);
  });

  it("freezes to one deterministic frame under reduced motion", () => {
    const world = makeWorld([makeDock()]);
    const reducedMotion = {
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
    const recordingA = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });
    const recordingB = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });

    drawDockCaustics(createDrawInput({ ctx: recordingA.ctx, motion: reducedMotion, world }));
    drawDockCaustics(createDrawInput({
      ctx: recordingB.ctx,
      motion: { ...reducedMotion, timeSeconds: 17.31 },
      world,
    }));

    expect(recordingA.callsTo("ellipse")).toEqual(recordingB.callsTo("ellipse"));
    expect(recordingA.callsTo("ellipse").length).toBeGreaterThan(0);
  });

  it("animates ring radii over time at full motion", () => {
    const world = makeWorld([makeDock()]);
    const recordingA = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });
    const recordingB = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });
    const baseMotion = createDrawInput({}).motion;

    drawDockCaustics(createDrawInput({ ctx: recordingA.ctx, motion: { ...baseMotion, timeSeconds: 0 }, world }));
    drawDockCaustics(createDrawInput({ ctx: recordingB.ctx, motion: { ...baseMotion, timeSeconds: 1.3 }, world }));

    expect(recordingA.callsTo("ellipse")).not.toEqual(recordingB.callsTo("ellipse"));
  });
});

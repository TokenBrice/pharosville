import { describe, expect, it } from "vitest";
import type { PharosVilleWorld } from "../../systems/world-types";
import { buildRecordingCanvasContext } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import type { ResolvedEntityGeometry } from "../geometry";
import { drawDockBody, type DockRenderFrame } from "./docks";

function makeDock(overrides: Partial<PharosVilleWorld["docks"][number]> = {}): PharosVilleWorld["docks"][number] {
  return {
    chainId: "arbitrum",
    detailId: "dock.arbitrum",
    healthBand: "healthy",
    id: "dock.arbitrum",
    kind: "dock",
    label: "Arbitrum Arch Bridge",
    logoSrc: null,
    assetId: "dock.arbitrum-arch-bridge",
    tile: { x: 32, y: 40 },
    totalUsd: 1000,
    size: 5,
    stablecoinCount: 4,
    concentration: 0.4,
    harboredStablecoins: [],
    ...overrides,
  } as PharosVilleWorld["docks"][number];
}

function makeGeometry(x: number, y: number): ResolvedEntityGeometry {
  return {
    assetScale: null,
    depth: 0,
    depthTile: { x: 0, y: 0 },
    drawPoint: { x, y },
    drawScale: 1,
    followTile: { x: 0, y: 0 },
    screenPoint: { x, y },
    selectionRect: { x: x - 16, y: y - 16, width: 32, height: 32 },
    semanticTile: { x: 0, y: 0 },
    targetRect: { x: x - 16, y: y - 16, width: 32, height: 32 },
  };
}

function frameFor(): DockRenderFrame {
  return {
    cache: {
      assetForEntity: () => null,
      geometryForEntity: () => makeGeometry(220, 140),
    } as unknown as DockRenderFrame["cache"],
    dockRenderStates: new Map(),
  };
}

// P3 — chain backing-diversity congestion (cue.dock.congestion).
describe("drawDockBody congestion crates", () => {
  function fillCountFor(backingDiversity: number | null): number {
    const recording = buildRecordingCanvasContext({ initialValues: { lineWidth: 1 } });
    const input = createDrawInput({ ctx: recording.ctx });
    drawDockBody(input, frameFor(), makeDock({ backingDiversity }));
    return recording.callsTo("fill").length;
  }

  it("stacks three crates on concentrated-backing docks and none on diversified ones", () => {
    const diversified = fillCountFor(0.8);
    const concentrated = fillCountFor(0.1);
    // Each crate paints two side faces plus a lid diamond (3 fills).
    expect(concentrated - diversified).toBe(9);
  });

  it("stacks two crates when backing is narrowing but not concentrated", () => {
    const diversified = fillCountFor(0.8);
    const narrowing = fillCountFor(0.4);
    expect(narrowing - diversified).toBe(6);
  });

  it("draws no crates when the health factor is absent", () => {
    expect(fillCountFor(null)).toBe(fillCountFor(0.8));
  });
});

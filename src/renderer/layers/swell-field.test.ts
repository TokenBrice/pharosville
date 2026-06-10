import { describe, expect, it } from "vitest";
import type { PharosVilleMap, PharosVilleWorld, TerrainKind } from "../../systems/world-types";
import { buildRecordingCanvasContext, type RecordedCanvasCall } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";
import { drawSwellField, SWELL_FRONT_COUNT } from "./swell-field";

function makeMap(size: number, landBand: { from: number; to: number } | null = null): PharosVilleMap {
  const tiles = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const land = landBand !== null && x >= landBand.from && x <= landBand.to;
      tiles.push({
        kind: land ? ("land" as const) : ("water" as const),
        terrain: (land ? "land" : "water") as TerrainKind,
        x,
        y,
      });
    }
  }
  return { height: size, tiles, waterRatio: 1, width: size };
}

function makeInput(map: PharosVilleMap, overrides: Partial<DrawPharosVilleInput> = {}): DrawPharosVilleInput {
  const base = createDrawInput({
    camera: { offsetX: 400, offsetY: 100, zoom: 1 } as DrawPharosVilleInput["camera"],
    ...overrides,
  });
  return {
    ...base,
    world: { ...(base.world as object), map } as PharosVilleWorld,
  };
}

function makeCtx() {
  const recording = buildRecordingCanvasContext({
    methods: ["save", "restore", "beginPath", "moveTo", "lineTo", "stroke"],
  });
  return { ctx: recording.ctx, calls: recording.calls as readonly RecordedCanvasCall[] };
}

describe("drawSwellField", () => {
  it("strokes travelling fronts over water (crest + trailing line per front)", () => {
    const { ctx, calls } = makeCtx();
    const fronts = drawSwellField(makeInput(makeMap(24), { ctx }), 1);
    expect(fronts).toBeGreaterThan(0);
    expect(fronts).toBeLessThanOrEqual(SWELL_FRONT_COUNT);
    expect(calls.filter((call) => call.method === "stroke").length).toBe(fronts * 2);
  });

  it("parts fronts around land: a land band splits the polyline into more segments", () => {
    const open = makeCtx();
    const split = makeCtx();
    const openFronts = drawSwellField(makeInput(makeMap(24), { ctx: open.ctx }), 1);
    const splitFronts = drawSwellField(makeInput(makeMap(24, { from: 10, to: 13 }), { ctx: split.ctx }), 1);
    expect(openFronts).toBeGreaterThan(0);
    expect(splitFronts).toBeGreaterThan(0);
    const openMoves = open.calls.filter((call) => call.method === "moveTo").length;
    const splitMoves = split.calls.filter((call) => call.method === "moveTo").length;
    expect(splitMoves).toBeGreaterThan(openMoves);
  });

  it("advances front geometry over time under normal motion", () => {
    const a = makeCtx();
    const b = makeCtx();
    const motion = createDrawInput().motion;
    drawSwellField(makeInput(makeMap(24), { ctx: a.ctx, motion: { ...motion, timeSeconds: 0 } }), 1);
    drawSwellField(makeInput(makeMap(24), { ctx: b.ctx, motion: { ...motion, timeSeconds: 7.5 } }), 1);
    expect(JSON.stringify(a.calls)).not.toBe(JSON.stringify(b.calls));
  });

  it("freezes the time-zero frame under reduced motion", () => {
    const a = makeCtx();
    const b = makeCtx();
    const motion = createDrawInput().motion;
    drawSwellField(makeInput(makeMap(24), {
      ctx: a.ctx,
      motion: { ...motion, reducedMotion: true, timeSeconds: 99 },
    }), 1);
    drawSwellField(makeInput(makeMap(24), {
      ctx: b.ctx,
      motion: { ...motion, reducedMotion: false, timeSeconds: 0 },
    }), 1);
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
  });

  it("scales travel with the wind multiplier", () => {
    const calm = makeCtx();
    const windy = makeCtx();
    const motion = createDrawInput().motion;
    drawSwellField(makeInput(makeMap(24), { ctx: calm.ctx, motion: { ...motion, timeSeconds: 5 } }), 1);
    drawSwellField(makeInput(makeMap(24), { ctx: windy.ctx, motion: { ...motion, timeSeconds: 5 } }), 1.8);
    expect(JSON.stringify(calm.calls)).not.toBe(JSON.stringify(windy.calls));
  });
});

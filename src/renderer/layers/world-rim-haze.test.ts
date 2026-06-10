import { describe, expect, it } from "vitest";
import { TILE_HEIGHT, TILE_WIDTH, tileToScreen } from "../../systems/projection";
import { buildRecordingCanvasContext, type RecordedCanvasCall } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__";
import type { DrawPharosVilleInput } from "../render-types";
import { drawWorldRimHaze } from "./world-rim-haze";

function makeCtx() {
  const recording = buildRecordingCanvasContext({
    methods: ["save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "stroke"],
  });
  return { ctx: recording.ctx, calls: recording.calls as readonly RecordedCanvasCall[] };
}

function makeInput(overrides: Partial<DrawPharosVilleInput> = {}): DrawPharosVilleInput {
  const base = createDrawInput(overrides);
  return {
    ...base,
    world: {
      ...(base.world as object),
      map: { width: 56, height: 56 },
    } as DrawPharosVilleInput["world"],
  };
}

describe("drawWorldRimHaze", () => {
  it("strokes mood-tinted bands along the projected map rim", () => {
    const { ctx, calls } = makeCtx();
    const input = makeInput({ ctx, motion: { ...createDrawInput().motion, wallClockHour: 12 } });
    drawWorldRimHaze(input);

    const strokes = calls.filter((call) => call.method === "stroke");
    expect(strokes.length).toBe(4); // one per haze band

    // The first band traces the diamond rim: north corner is tile (0,0)
    // shifted up half a tile.
    const north = tileToScreen({ x: 0, y: 0 }, input.camera);
    const firstMove = calls.find((call) => call.method === "moveTo");
    expect(firstMove?.args[0]).toBeCloseTo(north.x);
    expect(firstMove?.args[1]).toBeCloseTo(north.y - (TILE_HEIGHT / 2) * input.camera.zoom);

    const east = tileToScreen({ x: 55, y: 0 }, input.camera);
    const firstLine = calls.find((call) => call.method === "lineTo");
    expect(firstLine?.args[0]).toBeCloseTo(east.x + (TILE_WIDTH / 2) * input.camera.zoom);
    expect(firstLine?.args[1]).toBeCloseTo(east.y);
  });

  it("renders identically under reduced motion (no time dependency)", () => {
    const a = makeCtx();
    const b = makeCtx();
    const motionBase = createDrawInput().motion;
    drawWorldRimHaze(makeInput({
      ctx: a.ctx,
      motion: { ...motionBase, reducedMotion: false, timeSeconds: 123.4, wallClockHour: 12 },
    }));
    drawWorldRimHaze(makeInput({
      ctx: b.ctx,
      motion: { ...motionBase, reducedMotion: true, timeSeconds: 0, wallClockHour: 12 },
    }));
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
  });

  it("keeps a dimmer haze at night and skips degenerate maps", () => {
    const night = makeCtx();
    drawWorldRimHaze(makeInput({
      ctx: night.ctx,
      motion: { ...createDrawInput().motion, wallClockHour: 23 },
    }));
    expect(night.calls.filter((call) => call.method === "stroke").length).toBe(4);

    const empty = makeCtx();
    const input = makeInput({ ctx: empty.ctx });
    (input.world as { map: { width: number; height: number } }).map = { width: 0, height: 0 };
    drawWorldRimHaze(input);
    expect(empty.calls.length).toBe(0);
  });
});

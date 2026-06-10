import { describe, expect, it } from "vitest";
import { lighthouseBeamSweepAngle } from "../lighthouse-beam";
import { isoToTile } from "../../systems/projection";
import type { PharosVilleWorld, ShipNode } from "../../systems/world-types";
import { buildRecordingCanvasContext, type RecordedCanvasCall } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";
import { drawLighthouseBeamRim, lighthouseRenderState } from "./lighthouse";

function makeShip(id: string, tile: { x: number; y: number }): ShipNode {
  return {
    kind: "ship",
    id,
    detailId: `ship.${id}`,
    label: id,
    symbol: id.toUpperCase(),
    tile,
    riskTile: tile,
    riskZone: "calm",
    visual: { hull: "treasury-galleon", sizeTier: "major", scale: 1, livery: {} },
  } as unknown as ShipNode;
}

function makeCtx() {
  const recording = buildRecordingCanvasContext({
    methods: ["save", "restore", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill"],
  });
  return { ctx: recording.ctx, calls: recording.calls as readonly RecordedCanvasCall[] };
}

function makeInput(
  ctx: CanvasRenderingContext2D,
  ships: readonly ShipNode[],
  timeSeconds: number,
  reducedMotion = false,
): DrawPharosVilleInput {
  const base = createDrawInput({
    camera: { offsetX: 400, offsetY: 200, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx,
    motion: { ...createDrawInput().motion, reducedMotion, timeSeconds, wallClockHour: 23 },
  });
  return {
    ...base,
    world: {
      ...(base.world as object),
      lighthouse: { tile: { x: 18, y: 28 }, unavailable: false },
      ships,
    } as PharosVilleWorld,
  };
}

/** Place a ship N sprite-units from the fire point along screen bearing `angle`. */
function shipTileAlongBeam(input: DrawPharosVilleInput, angle: number, dist: number): { x: number; y: number } {
  const { firePoint } = lighthouseRenderState(input);
  const screen = {
    x: firePoint.x + Math.cos(angle) * dist,
    y: firePoint.y + Math.sin(angle) * dist,
  };
  const iso = {
    x: (screen.x - input.camera.offsetX) / input.camera.zoom,
    y: (screen.y - input.camera.offsetY) / input.camera.zoom,
  };
  return isoToTile(iso);
}

describe("drawLighthouseBeamRim (V2.2 sweep sync)", () => {
  it("lights a ship inside the sweep arm and skips one square to the beam", () => {
    const time = 10;
    const angle = lighthouseBeamSweepAngle(time, false);
    const probe = makeCtx();
    const probeInput = makeInput(probe.ctx, [], time);

    const onBeamTile = shipTileAlongBeam(probeInput, angle, 220);
    const offBeamTile = shipTileAlongBeam(probeInput, angle + Math.PI / 2, 220);

    const lit = makeCtx();
    drawLighthouseBeamRim(
      makeInput(lit.ctx, [makeShip("on-beam", onBeamTile)], time),
      [makeShip("on-beam", onBeamTile)],
      undefined,
      1,
    );
    expect(lit.calls.filter((call) => call.method === "stroke").length).toBe(1);
    expect(lit.calls.filter((call) => call.method === "fill").length).toBe(1);

    const dark = makeCtx();
    drawLighthouseBeamRim(
      makeInput(dark.ctx, [makeShip("off-beam", offBeamTile)], time),
      [makeShip("off-beam", offBeamTile)],
      undefined,
      1,
    );
    expect(dark.calls.filter((call) => call.method === "stroke").length).toBe(0);
  });

  it("lights the opposite arm too (paired beams)", () => {
    const time = 10;
    const angle = lighthouseBeamSweepAngle(time, false);
    const probe = makeCtx();
    const probeInput = makeInput(probe.ctx, [], time);
    const oppositeTile = shipTileAlongBeam(probeInput, angle + Math.PI, 220);

    const { ctx, calls } = makeCtx();
    drawLighthouseBeamRim(
      makeInput(ctx, [makeShip("opposite", oppositeTile)], time),
      [makeShip("opposite", oppositeTile)],
      undefined,
      1,
    );
    expect(calls.filter((call) => call.method === "stroke").length).toBe(1);
  });

  it("draws nothing in daylight or under reduced motion", () => {
    const time = 10;
    const angle = lighthouseBeamSweepAngle(time, false);
    const probe = makeCtx();
    const probeInput = makeInput(probe.ctx, [], time);
    const tile = shipTileAlongBeam(probeInput, angle, 220);
    const ship = makeShip("s", tile);

    const day = makeCtx();
    drawLighthouseBeamRim(makeInput(day.ctx, [ship], time), [ship], undefined, 0);
    expect(day.calls.length).toBe(0);

    const reduced = makeCtx();
    drawLighthouseBeamRim(makeInput(reduced.ctx, [ship], time, true), [ship], undefined, 1);
    expect(reduced.calls.length).toBe(0);
  });

  it("uses motion-sample tiles when available so the light tracks moving ships", () => {
    const time = 10;
    const angle = lighthouseBeamSweepAngle(time, false);
    const probe = makeCtx();
    const probeInput = makeInput(probe.ctx, [], time);
    const beamTile = shipTileAlongBeam(probeInput, angle, 220);
    const farTile = shipTileAlongBeam(probeInput, angle + Math.PI / 2, 400);
    const ship = makeShip("mover", farTile); // static tile is off-beam

    const { ctx, calls } = makeCtx();
    const input = makeInput(ctx, [ship], time);
    (input as unknown as { shipMotionSamples: Map<string, { tile: { x: number; y: number } }> }).shipMotionSamples =
      new Map([[ship.id, { tile: beamTile }]]);
    drawLighthouseBeamRim(input, [ship], undefined, 1);
    expect(calls.filter((call) => call.method === "stroke").length).toBe(1);
  });
});

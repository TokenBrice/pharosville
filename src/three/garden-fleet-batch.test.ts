import { describe, expect, it } from "vitest";
import { Color } from "three";
import { createFleetBatchGeometry } from "./garden-ships";
import {
  FLEET_SAIL_ATLAS_CELLS,
  beginFleetFrame,
  createFleetBatches,
  disposeFleetBatches,
  endFleetFrame,
  fleetDrawCallCount,
  fleetInstanceCount,
  writeFleetInstance,
  type FleetInstancePose,
} from "./garden-fleet-batch";
import type { GardenHullSilhouette } from "../systems/garden-observatory-slice";

const SILHOUETTES: GardenHullSilhouette[] = ["galleon", "clipper", "schooner", "junk"];

function buildBatches(capacity: number) {
  return createFleetBatches({
    cache: { geometries: new Map(), wakeFillMaterial: null as never, wakeMaterial: null as never },
    capacity,
    geometryFor: (silhouette) => createFleetBatchGeometry(silhouette),
    pennantGeometry: createFleetBatchGeometry("galleon").sails,
    sailTexture: null,
    silhouettes: SILHOUETTES,
  });
}

function pose(overrides: Partial<FleetInstancePose> = {}): FleetInstancePose {
  return {
    atlasCell: 0,
    headingAngle: 0,
    heel: 0,
    hullColor: new Color("#884422"),
    hullForm: { beam: 1, height: 1, length: 1 },
    pennantColor: new Color("#22aa88"),
    sailColor: new Color("#2775ca"),
    trimColor: new Color("#2775ca"),
    mastheadOffset: { x: 0, y: 4 },
    sailFurl: 0,
    pitch: 0,
    scale: 1,
    silhouette: "galleon",
    x: 0,
    y: 0,
    z: 0,
    ...overrides,
  };
}

describe("createFleetBatchGeometry", () => {
  it("merges every silhouette into exactly one hull and one sail geometry", () => {
    for (const silhouette of SILHOUETTES) {
      const source = createFleetBatchGeometry(silhouette);
      expect(source.hull.getAttribute("position").count).toBeGreaterThan(0);
      expect(source.sails.getAttribute("position").count).toBeGreaterThan(0);
      // The livery multiplier rides on vertex colors, so the attribute must
      // survive the merge for every part.
      expect(source.hull.getAttribute("color")).toBeDefined();
      source.hull.dispose();
      source.sails.dispose();
    }
  });

  it("marks exactly one identity sail per silhouette for the atlas path", () => {
    for (const silhouette of SILHOUETTES) {
      const { sails } = createFleetBatchGeometry(silhouette);
      const flags = sails.getAttribute("aAtlasSail");
      expect(flags).toBeDefined();
      let marked = 0;
      for (let index = 0; index < flags.count; index += 1) {
        if (flags.getX(index) > 0.5) marked += 1;
      }
      // Some vertices marked, but never all of them — the plain sails must
      // keep sampling the shared blank-canvas cell.
      expect(marked).toBeGreaterThan(0);
      expect(marked).toBeLessThan(flags.count);
      sails.dispose();
    }
  });

  it("is deterministic across rebuilds", () => {
    const first = createFleetBatchGeometry("clipper");
    const second = createFleetBatchGeometry("clipper");
    const a = first.hull.getAttribute("position");
    const b = second.hull.getAttribute("position");
    expect(a.count).toBe(b.count);
    for (let index = 0; index < a.count; index += 1) {
      expect(a.getX(index)).toBeCloseTo(b.getX(index), 10);
      expect(a.getY(index)).toBeCloseTo(b.getY(index), 10);
    }
    first.hull.dispose();
    first.sails.dispose();
    second.hull.dispose();
    second.sails.dispose();
  });
});

describe("fleet batches", () => {
  it("keeps draw calls flat as the fleet grows", () => {
    const batches = buildBatches(400);

    beginFleetFrame(batches);
    for (let index = 0; index < 20; index += 1) {
      writeFleetInstance(batches, pose({ silhouette: SILHOUETTES[index % 4]!, x: index }));
    }
    endFleetFrame(batches);
    const drawsAt20 = fleetDrawCallCount(batches);
    expect(fleetInstanceCount(batches)).toBe(20);

    beginFleetFrame(batches);
    for (let index = 0; index < 320; index += 1) {
      writeFleetInstance(batches, pose({ silhouette: SILHOUETTES[index % 4]!, x: index }));
    }
    endFleetFrame(batches);

    expect(fleetInstanceCount(batches)).toBe(320);
    // 4 silhouettes x (hull + sails) + 1 pennant batch = 9, at any fleet size.
    expect(fleetDrawCallCount(batches)).toBe(drawsAt20);
    expect(fleetDrawCallCount(batches)).toBe(9);

    disposeFleetBatches(batches);
  });

  it("never exceeds capacity", () => {
    const batches = buildBatches(8);
    beginFleetFrame(batches);
    for (let index = 0; index < 200; index += 1) {
      writeFleetInstance(batches, pose({ silhouette: "galleon", x: index }));
    }
    endFleetFrame(batches);
    expect(fleetInstanceCount(batches)).toBe(8);
    disposeFleetBatches(batches);
  });

  it("routes each instance to its own atlas cell", () => {
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({ atlasCell: 7, silhouette: "galleon" }));
    writeFleetInstance(batches, pose({ atlasCell: 12, silhouette: "galleon" }));
    endFleetFrame(batches);
    const cells = batches.bySilhouette.get("galleon")!.sails.atlasCell!;
    expect(cells.getX(0)).toBe(7);
    expect(cells.getX(1)).toBe(12);
    disposeFleetBatches(batches);
  });

  it("reuses buffers across frames instead of reallocating", () => {
    const batches = buildBatches(64);
    const galleon = batches.bySilhouette.get("galleon")!;
    const matrixBuffer = galleon.hull.mesh.instanceMatrix.array;

    for (let frame = 0; frame < 5; frame += 1) {
      beginFleetFrame(batches);
      for (let index = 0; index < 10 + frame * 5; index += 1) {
        writeFleetInstance(batches, pose({ silhouette: "galleon", x: index }));
      }
      endFleetFrame(batches);
    }

    expect(galleon.hull.mesh.instanceMatrix.array).toBe(matrixBuffer);
    disposeFleetBatches(batches);
  });

  it("writes each ship's own proportions to hull and sails alike (N5a)", () => {
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({
      hullForm: { beam: 0.7, height: 1.3, length: 1.2 },
      silhouette: "galleon",
    }));
    writeFleetInstance(batches, pose({
      hullForm: { beam: 1.25, height: 0.8, length: 0.75 },
      silhouette: "galleon",
    }));
    endFleetFrame(batches);

    const batch = batches.bySilhouette.get("galleon")!;
    for (const part of [batch.hull, batch.sails]) {
      // (length, beam, height) — the rig must deform with the hull it sits on.
      // Stored in a Float32Array, so compare at float precision.
      for (const [slot, expected] of [[0, [1.2, 0.7, 1.3]], [1, [0.75, 1.25, 0.8]]] as const) {
        expect(part.hullForm.getX(slot)).toBeCloseTo(expected[0], 6);
        expect(part.hullForm.getY(slot)).toBeCloseTo(expected[1], 6);
        expect(part.hullForm.getZ(slot)).toBeCloseTo(expected[2], 6);
      }
    }
    // Untouched instances stay at the authored shape rather than collapsing.
    expect(batch.hull.hullForm.getX(9)).toBe(1);
    disposeFleetBatches(batches);
  });

  it("keeps draw calls flat once per-ship deformation is on", () => {
    const batches = buildBatches(64);
    beginFleetFrame(batches);
    for (let index = 0; index < 40; index += 1) {
      writeFleetInstance(batches, pose({
        hullForm: { beam: 0.7 + index * 0.01, height: 1, length: 1.3 - index * 0.01 },
        silhouette: SILHOUETTES[index % 4]!,
      }));
    }
    endFleetFrame(batches);
    // 40 ships, 40 different shapes, still one draw call per part.
    expect(fleetDrawCallCount(batches)).toBe(9);
    disposeFleetBatches(batches);
  });

  it("sizes the sail atlas to hold the rendered fleet", () => {
    // D3: 16x16 cells. Cell 0 is the shared blank canvas, so 255 logo slots
    // must cover the ~205-ship world with headroom.
    expect(FLEET_SAIL_ATLAS_CELLS).toBe(256);
  });
});

describe("F1 brand-dyed cloth", () => {
  it("writes each ship's dye to every sail in its batch", () => {
    const batches = buildBatches(16);
    beginFleetFrame(batches);
    writeFleetInstance(batches, pose({ sailColor: new Color("#2775ca"), silhouette: "galleon" }));
    writeFleetInstance(batches, pose({ sailColor: new Color("#136649"), silhouette: "galleon" }));
    endFleetFrame(batches);

    const tint = batches.bySilhouette.get("galleon")!.sails.sailTint!;
    const circle = new Color("#2775ca");
    const tether = new Color("#136649");
    expect(tint.getX(0)).toBeCloseTo(circle.r, 5);
    expect(tint.getZ(0)).toBeCloseTo(circle.b, 5);
    expect(tint.getY(1)).toBeCloseTo(tether.g, 5);
    // An unwritten instance stays plain canvas rather than going black.
    expect(tint.getX(9)).toBe(1);
    disposeFleetBatches(batches);
  });

  it("keeps the dye off the draw-call count", () => {
    const batches = buildBatches(64);
    beginFleetFrame(batches);
    for (let index = 0; index < 40; index += 1) {
      writeFleetInstance(batches, pose({
        sailColor: new Color().setHSL(index / 40, 0.6, 0.4),
        silhouette: SILHOUETTES[index % 4]!,
      }));
    }
    endFleetFrame(batches);
    // 40 ships, 40 different dyes, still one draw call per part.
    expect(fleetDrawCallCount(batches)).toBe(9);
    disposeFleetBatches(batches);
  });
});

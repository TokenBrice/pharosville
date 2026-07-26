import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { createGardenCrossBearingBuoys, type CrossBearingBuoySpec } from "./garden-cross-bearing-buoys";

function buoyMesh(root: { getObjectByName(name: string): unknown }): InstancedMesh {
  const mesh = root.getObjectByName("cross-bearing-buoys");
  expect(mesh).toBeInstanceOf(InstancedMesh);
  return mesh as InstancedMesh;
}

function instancePosition(mesh: InstancedMesh, index: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

const spec = (detailId: string, hullRadius = 1.4): CrossBearingBuoySpec =>
  ({ detailId, hullRadius });

describe("garden cross-bearing buoys (3b)", () => {
  it("builds nothing at all when no bearings cross", () => {
    const buoys = createGardenCrossBearingBuoys([]);

    expect(buoys.count).toBe(0);
    expect(buoys.root.children).toHaveLength(0);
    // The no-op surface has to be callable: the frame loop places and flushes
    // unconditionally, and the ordinary afternoon is the empty one.
    expect(() => {
      buoys.place(0, 1, 1);
      buoys.flush();
    }).not.toThrow();

    buoys.dispose();
  });

  it("draws the whole fleet's buoys from one instanced mesh", () => {
    // The draw-call budget is the reason this feature exists in this shape:
    // the world runs 620-693 calls against a 700 ceiling, so a mesh per ship
    // was never available. However many bearings cross, this stays one mesh.
    const specs = Array.from({ length: 60 }, (_, index) => spec(`ship.c${index}`));
    const buoys = createGardenCrossBearingBuoys(specs);

    expect(buoys.count).toBe(60);
    expect(buoys.root.children).toHaveLength(1);
    expect(buoyMesh(buoys.root).count).toBe(60);

    buoys.dispose();
  });

  it("rides at the waterline, off the hull rather than on it", () => {
    const buoys = createGardenCrossBearingBuoys([spec("ship.usdx", 1.4)]);
    buoys.place(0, 20, -12);
    const position = instancePosition(buoyMesh(buoys.root), 0);

    expect(position.y).toBeCloseTo(GARDEN_WATER_Y, 6);
    const offset = Math.hypot(position.x - 20, position.z - -12);
    // Beside the ship, not under it and not adrift in a neighbour's water.
    expect(offset).toBeCloseTo(1.4 + 0.9, 6);

    buoys.dispose();
  });

  it("stands further off a titan than off a skiff", () => {
    // A titan's footprint is nearly three times a skiff's; a fixed stand-off
    // would bury the buoy inside the big hulls.
    const buoys = createGardenCrossBearingBuoys([spec("ship.a", 3.9), spec("ship.a", 1.05)]);
    buoys.place(0, 0, 0);
    buoys.place(1, 0, 0);
    const mesh = buoyMesh(buoys.root);

    const titan = instancePosition(mesh, 0);
    const skiff = instancePosition(mesh, 1);
    expect(Math.hypot(titan.x, titan.z)).toBeGreaterThan(Math.hypot(skiff.x, skiff.z));

    buoys.dispose();
  });

  it("keeps the same stand-off across rebuilds", () => {
    // A refresh rebuilds world content from scratch. If the stand-off bearing
    // were random the buoy would jump to the other side of its hull every few
    // minutes, which would read as motion the cue does not have.
    const first = createGardenCrossBearingBuoys([spec("ship.usdx")]);
    const second = createGardenCrossBearingBuoys([spec("ship.usdx")]);
    first.place(0, 4, 9);
    second.place(0, 4, 9);

    expect(instancePosition(buoyMesh(first.root), 0).toArray())
      .toEqual(instancePosition(buoyMesh(second.root), 0).toArray());

    first.dispose();
    second.dispose();
  });

  it("spreads two buoys on hulls at the same spot so neither hides the other", () => {
    const buoys = createGardenCrossBearingBuoys([spec("ship.usdx"), spec("ship.eurz")]);
    buoys.place(0, 0, 0);
    buoys.place(1, 0, 0);
    const mesh = buoyMesh(buoys.root);

    expect(instancePosition(mesh, 0).toArray()).not.toEqual(instancePosition(mesh, 1).toArray());

    buoys.dispose();
  });

  it("follows its hull instead of staying where the ship used to be", () => {
    // Ships patrol up to nine tiles from their anchor. A buoy nailed to the
    // berth would spend most of its life nowhere near the ship it describes.
    const buoys = createGardenCrossBearingBuoys([spec("ship.usdx")]);
    buoys.place(0, 0, 0);
    const first = instancePosition(buoyMesh(buoys.root), 0);
    buoys.place(0, 12, -7);
    const second = instancePosition(buoyMesh(buoys.root), 0);

    expect(second.x - first.x).toBeCloseTo(12, 6);
    expect(second.z - first.z).toBeCloseTo(-7, 6);

    buoys.dispose();
  });

  it("stands tall enough to read at overview zoom", () => {
    const buoys = createGardenCrossBearingBuoys([spec("ship.usdx")]);
    const mesh = buoyMesh(buoys.root);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;

    // The silhouette law: under ~0.7 units of clearance a feature does not
    // read at overview zoom, and a cue nobody can see is pure draw-call cost.
    expect(box.max.y - box.min.y).toBeGreaterThan(0.7);

    buoys.dispose();
  });
});

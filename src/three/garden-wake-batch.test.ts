import {
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenWakeBatch,
  WAKE_BOW_QUADS,
  WAKE_TRAIL_QUADS,
} from "./garden-wake-batch";

const pose = {
  headingY: Math.PI / 2,
  hullScale: 1,
  x: 10,
  y: 0,
  z: -4,
};

describe("createGardenWakeBatch", () => {
  it("allocates exactly two fixed-capacity wake drawables", () => {
    const batch = createGardenWakeBatch(320, new MeshBasicMaterial(), new PlaneGeometry());

    expect(batch.root.name).toBe("fleet-wakes");
    expect(batch.root.children).toEqual([batch.trails, batch.bows]);
    expect(batch.trails.name).toBe("fleet-wake-trails");
    expect(batch.bows.name).toBe("fleet-wake-bows");
    expect(batch.trails.count).toBe(320 * WAKE_TRAIL_QUADS);
    expect(batch.bows.count).toBe(320 * WAKE_BOW_QUADS);
    expect(batch.trails.frustumCulled).toBe(false);
    expect(batch.bows.frustumCulled).toBe(false);
    expect((batch.trails.material as MeshBasicMaterial).forceSinglePass).toBe(true);
  });

  it("composes the local wake layout from the ship pose and intensity", () => {
    const batch = createGardenWakeBatch(4, new MeshBasicMaterial(), new PlaneGeometry());
    batch.setShip(3, pose, true, 1.3);
    batch.commit();

    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    batch.trails.getMatrixAt(3 * WAKE_TRAIL_QUADS, matrix);
    matrix.decompose(position, rotation, scale);

    expect(position.x).toBeCloseTo(10);
    expect(position.y).toBeCloseTo(-0.34);
    expect(position.z).toBeCloseTo(-4 + 2.3 * 1.3);
    expect(scale.x).toBeCloseTo(1.1 * 1.3);
    expect(scale.y).toBeCloseTo(1);
    expect(scale.z).toBeCloseTo(0.9);
  });

  it("collapses every trail and bow matrix for a hidden ship", () => {
    const batch = createGardenWakeBatch(4, new MeshBasicMaterial(), new PlaneGeometry());
    batch.setShip(3, pose, true, 1);
    batch.setShip(3, pose, false, 1);

    const matrix = new Matrix4();
    const scale = new Vector3();
    const matrixScaleLengthSq = () => {
      const elements = matrix.elements;
      scale.set(elements[0], elements[1], elements[2]);
      const x = scale.lengthSq();
      scale.set(elements[4], elements[5], elements[6]);
      const y = scale.lengthSq();
      scale.set(elements[8], elements[9], elements[10]);
      return x + y + scale.lengthSq();
    };
    for (let index = 0; index < WAKE_TRAIL_QUADS; index += 1) {
      batch.trails.getMatrixAt(3 * WAKE_TRAIL_QUADS + index, matrix);
      expect(matrixScaleLengthSq()).toBe(0);
    }
    for (let index = 0; index < WAKE_BOW_QUADS; index += 1) {
      batch.bows.getMatrixAt(3 * WAKE_BOW_QUADS + index, matrix);
      expect(matrixScaleLengthSq()).toBe(0);
    }
  });

  it("marks both instance buffers for upload once writes are committed", () => {
    const batch = createGardenWakeBatch(4, new MeshBasicMaterial(), new PlaneGeometry());
    const trailVersion = batch.trails.instanceMatrix.version;
    const bowVersion = batch.bows.instanceMatrix.version;

    batch.setShip(3, pose, true, 1);
    batch.commit();

    expect(batch.trails.instanceMatrix.version).toBe(trailVersion + 1);
    expect(batch.bows.instanceMatrix.version).toBe(bowVersion + 1);
  });
});

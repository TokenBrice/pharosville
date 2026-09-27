import {
  InstancedMesh,
  Matrix4,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { createGardenFireflies } from "./garden-harbor-life";

const LIGHTHOUSE_TILE = { x: 18, y: 28 };

describe("island fireflies", () => {
  it("keeps fourteen quad fireflies on one dark arc and freezes wind under reduced motion", () => {
    const fireflies = createGardenFireflies([{ x: 0, y: 1, z: 0 }, { x: 100, y: 1, z: 100 }], LIGHTHOUSE_TILE);
    const motes = fireflies.root.children[0] as InstancedMesh;
    const frame = { fullTier: true, night: 1, reducedMotion: true, timeSeconds: 1 };
    fireflies.update(frame);
    const still = instanceMatrices(motes);
    fireflies.update({ ...frame, timeSeconds: 1000, weather: { wind: { x: 1, y: 0, speed: 1, gust: 1 } } });
    expect(instanceMatrices(motes)).toEqual(still);
    expect(motes.geometry.index!.count / 3 * motes.count).toBe(28);
    for (let index = 0; index < motes.count; index += 1) {
      const position = new Vector3().setFromMatrixPosition(instanceMatrix(motes, index));
      expect(Math.hypot(position.x, position.z)).toBeLessThan(6);
    }
    fireflies.update({ ...frame, night: 0 });
    expect(fireflies.root.visible).toBe(false);
  });
});

function instanceMatrices(mesh: InstancedMesh): number[][] {
  return Array.from({ length: mesh.count }, (_, index) => (
    instanceMatrix(mesh, index).toArray()
  ));
}

function instanceMatrix(mesh: InstancedMesh, index: number): Matrix4 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}

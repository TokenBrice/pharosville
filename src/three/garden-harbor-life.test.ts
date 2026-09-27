import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { HARBOR_PALETTE } from "../systems/palette";
import { createGardenFireflies, GARDEN_FIREFLY_COUNT } from "./garden-harbor-life";

const REED_BED = { x: 96, y: -0.11, z: 184 };

describe("reed-bed fireflies", () => {
  it("keeps a few blinking points over the reed bed, dimmer than a lantern, frozen under reduced motion", () => {
    const fireflies = createGardenFireflies(REED_BED);
    const motes = fireflies.root.children[0] as InstancedMesh;
    expect(motes.count).toBe(GARDEN_FIREFLY_COUNT);
    expect(GARDEN_FIREFLY_COUNT).toBeLessThanOrEqual(12);
    const frame = { beautyTier: true, night: 1, reducedMotion: true, timeSeconds: 1 };
    fireflies.update(frame);
    const still = instanceMatrices(motes);
    const stillGlow = glows(motes);
    fireflies.update({ ...frame, timeSeconds: 1000, weather: { wind: { x: 1, y: 0, speed: 1, gust: 1 } } });
    expect(instanceMatrices(motes)).toEqual(still);
    expect(glows(motes)).toEqual(stillGlow);
    // The static pose shows some lit and some dark.
    expect(stillGlow.some((glow) => glow > 0.2)).toBe(true);
    expect(stillGlow.some((glow) => glow < 0.05)).toBe(true);
    for (let index = 0; index < motes.count; index += 1) {
      const position = new Vector3().setFromMatrixPosition(instanceMatrix(motes, index));
      // Over the reeds, a little above them.
      expect(Math.hypot(position.x, position.z)).toBeLessThan(3);
      expect(position.y).toBeGreaterThan(0.3);
      expect(position.y).toBeLessThan(3.4);
    }
    // Under the lanterns' ≤ 2.0 HDR swell (§5.0).
    const material = motes.material as MeshBasicMaterial;
    const lantern = new Color(HARBOR_PALETTE.lantern_glow).multiplyScalar(2);
    expect(material.color.r + material.color.g + material.color.b).toBeLessThan(lantern.r + lantern.g + lantern.b);
    fireflies.update({ ...frame, night: 0 });
    expect(fireflies.root.visible).toBe(false);
  });

  it("blinks slowly: each point is dark for most of its cycle", () => {
    const fireflies = createGardenFireflies(REED_BED);
    const motes = fireflies.root.children[0] as InstancedMesh;
    let lit = 0;
    let samples = 0;
    for (let t = 0; t < 30; t += 0.1) {
      fireflies.update({ beautyTier: true, night: 1, reducedMotion: false, timeSeconds: t });
      for (const glow of glows(motes)) {
        samples += 1;
        if (glow > 0.1) lit += 1;
      }
    }
    expect(lit / samples).toBeGreaterThan(0.05);
    expect(lit / samples).toBeLessThan(0.4);
  });
});

function glows(mesh: InstancedMesh): number[] {
  const color = new Color();
  return Array.from({ length: mesh.count }, (_, index) => mesh.getColorAt(index, color).r);
}

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

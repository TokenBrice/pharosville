import { InstancedMesh, Material, Matrix4, Mesh, Texture, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { PigeonnierNode } from "../systems/world-types";
import { createGardenPigeonnier } from "./garden-landmarks";

describe("garden landmarks", () => {
  it("builds a compact TON dispatch tower with integration anchors", () => {
    const pigeonnier: PigeonnierNode = {
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      tile: { x: 50, y: 50 },
    };

    const landmark = createGardenPigeonnier(pigeonnier);

    expect(landmark.root.position.toArray()).toEqual([
      50 * Math.SQRT2,
      0,
      50 * Math.SQRT2,
    ]);
    expect(landmark.anchor.parent).toBe(landmark.root);
    expect(landmark.anchor.userData).toEqual({
      detailId: "pigeonnier",
      entityId: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      selectionRadius: 2.7,
    });
    expect(landmark.dispatchAnchor.parent).toBe(landmark.root);
    expect(landmark.dispatchAnchor.position.y).toBeGreaterThan(6);
    expect(
      landmark.root.getObjectByName("pigeonnier-timber-posts"),
    ).toBeInstanceOf(InstancedMesh);
    expect(
      landmark.root.getObjectByName("pigeonnier-openings"),
    ).toBeInstanceOf(InstancedMesh);
    expect(
      landmark.root.getObjectByName("pigeonnier-ton-pier"),
    ).toBeInstanceOf(Mesh);
    const pier = landmark.root.getObjectByName("pigeonnier-ton-pier") as Mesh;
    expect(pier.rotation.y).toBeCloseTo(0.14);
    const piles = landmark.root.getObjectByName("pigeonnier-pier-piles") as InstancedMesh;
    expect(piles.count).toBe(3);
    const matrix = new Matrix4();
    const pilePositions: number[][] = [];
    for (let index = 0; index < piles.count; index += 1) {
      piles.getMatrixAt(index, matrix);
      pilePositions.push(new Vector3().setFromMatrixPosition(matrix).toArray());
    }
    const expectedPilePositions = [
      [-1.6, -0.78, -0.12],
      [-2.86, -0.74, 0.77],
      [-4.36, -0.82, 0.37],
    ];
    for (const [index, position] of pilePositions.entries()) {
      position.forEach((value, axis) => {
        expect(value).toBeCloseTo(expectedPilePositions[index]![axis]!, 5);
      });
    }
    expect(objectCount(landmark.root)).toBeLessThan(18);
    expect(hasTexture(landmark.root)).toBe(false);
  });

  it("counts today's depeg roost and circles only over named movers", () => {
    const landmark = createGardenPigeonnier({
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      notableMovers: [
        {
          change24hPctLabel: "+2.0%",
          change24hUsdLabel: "+$2.0M",
          detailId: "ship.alpha",
          id: "alpha",
          riskWaterLabel: "Watch Breakwater",
          symbol: "ALPHA",
        },
      ],
      roost: {
        capped: false,
        comparison: 2,
        eventsToday: 3,
        eventsYesterday: 1,
        visualCount: 3,
      },
      tile: { x: 50, y: 50 },
    });
    expect(landmark.roostPigeons.count).toBe(3);
    expect(landmark.moverPigeons.count).toBe(1);

    landmark.update({
      moverPositions: [{ x: 4, y: 0, z: 8 }],
      reducedMotion: false,
      timeSeconds: 12,
    });
    expect(landmark.moverPigeons.visible).toBe(true);
    landmark.update({
      moverPositions: [{ x: 4, y: 0, z: 8 }],
      reducedMotion: true,
      timeSeconds: 0,
    });
    expect(landmark.moverPigeons.visible).toBe(false);
    expect(landmark.roostPigeons.visible).toBe(true);
  });
});


function objectCount(root: import("three").Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += 1;
  });
  return count;
}

function hasTexture(root: import("three").Object3D): boolean {
  let found = false;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (materialHasTexture(material)) found = true;
    }
  });
  return found;
}

function materialHasTexture(material: Material): boolean {
  return Object.values(material).some((value) => value instanceof Texture);
}

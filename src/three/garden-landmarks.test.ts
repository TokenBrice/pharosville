import {
  InstancedMesh,
  Material,
  Mesh,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";
import { CEMETERY_CENTER } from "../systems/world-layout";
import type { GraveNode, PigeonnierNode } from "../systems/world-types";
import {
  createGardenCemetery,
  createGardenPigeonnier,
} from "./garden-landmarks";

describe("garden landmarks", () => {
  it("creates a canonical cemetery root with one selectable anchor per grave", () => {
    const graves = [
      grave("grave.alpha", "broken-keel", 7.2, 49.4),
      grave("grave.beta", "skeletal", 8.8, 50.6),
      grave("grave.gamma", "grounded", 9.4, 49.8),
      grave("grave.delta", "shattered", 6.9, 50.8),
    ];

    const cemetery = createGardenCemetery(graves);

    expect(cemetery.root.name).toBe("garden-cemetery");
    expect(cemetery.root.position.toArray()).toEqual([
      CEMETERY_CENTER.x * Math.SQRT2,
      0,
      CEMETERY_CENTER.y * Math.SQRT2,
    ]);
    expect(cemetery.anchors.size).toBe(graves.length);
    expect(cemetery.mistAnchor.parent).toBe(cemetery.root);
    for (const graveNode of graves) {
      const anchor = cemetery.anchors.get(graveNode.detailId);
      expect(anchor?.parent).toBe(cemetery.root);
      expect(anchor?.userData).toMatchObject({
        detailId: graveNode.detailId,
        entityId: graveNode.id,
        kind: "grave",
        label: graveNode.label,
      });
      expect(anchor?.position.x).toBeCloseTo(
        (graveNode.tile.x - CEMETERY_CENTER.x) * Math.SQRT2,
      );
      expect(anchor?.position.z).toBeCloseTo(
        (graveNode.tile.y - CEMETERY_CENTER.y) * Math.SQRT2,
      );
    }
  });

  it("batches grave markers instead of adding a drawable per entity", () => {
    const graves = Array.from({ length: 24 }, (_, index) => (
      grave(
        `grave.${index}`,
        (["broken-keel", "skeletal", "grounded"] as const)[index % 3],
        CEMETERY_CENTER.x + ((index % 6) - 2.5) * 0.55,
        CEMETERY_CENTER.y + (Math.floor(index / 6) - 1.5) * 0.48,
      )
    ));

    const cemetery = createGardenCemetery(graves);
    const markerBatches: InstancedMesh[] = [];
    cemetery.root.traverse((object) => {
      if (
        object instanceof InstancedMesh
        && object.name.startsWith("cemetery-markers-")
      ) {
        markerBatches.push(object);
      }
    });

    expect(markerBatches).toHaveLength(3);
    expect(markerBatches.reduce((sum, batch) => sum + batch.count, 0)).toBe(
      graves.length,
    );
    expect(drawableCount(cemetery.root)).toBeLessThan(16);
    expect(hasTexture(cemetery.root)).toBe(false);
  });

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
    expect(drawableCount(landmark.root)).toBeLessThan(18);
    expect(hasTexture(landmark.root)).toBe(false);
  });
});

function grave(
  id: string,
  marker: GraveNode["visual"]["marker"],
  x: number,
  y: number,
): GraveNode {
  return {
    detailId: id,
    entry: {} as GraveNode["entry"],
    id,
    kind: "grave",
    label: id.replace("grave.", "").toUpperCase(),
    logoSrc: null,
    tile: { x, y },
    visual: { marker, scale: 0.36 },
  };
}

function drawableCount(root: import("three").Object3D): number {
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

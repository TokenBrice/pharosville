import {
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Texture,
  Vector3,
} from "three";
import { CAUSE_HEX, type CauseOfDeath } from "@shared/lib/cause-of-death";
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

  it("stages seven representative hull-rib reads and spars in two draws", () => {
    const graves = wreckField(24);
    const cemetery = createGardenCemetery(graves);
    const hullBatches: InstancedMesh[] = [];
    cemetery.root.traverse((object) => {
      if (
        object instanceof InstancedMesh
        && object.name === "cemetery-wrecks-fan"
      ) {
        hullBatches.push(object);
      }
    });

    expect(hullBatches).toHaveLength(1);
    expect(hullBatches[0]!.count).toBe(7);
    expect(cemetery.root.getObjectByName("cemetery-wreck-spars")).toBeInstanceOf(InstancedMesh);
    expect((cemetery.root.getObjectByName("cemetery-wreck-spars") as InstancedMesh).count).toBe(7);
    expect(objectCount(cemetery.root)).toBe(2);
    expect(hasTexture(cemetery.root)).toBe(false);
  });

  it("holds the whole wreck field inside a flat draw budget", () => {
    // The real graveyard is ~89 dead and frozen coins; neither read count nor
    // draw count tracks the ledger length.
    const small = createGardenCemetery(wreckField(12));
    const large = createGardenCemetery(wreckField(120));
    expect(objectCount(large.root)).toBe(objectCount(small.root));
    expect(objectCount(large.root)).toBe(2);
    expect((large.root.getObjectByName("cemetery-wrecks-fan") as InstancedMesh).count).toBe(7);
  });

  it("sits every wreck in the water rather than on a plinth", () => {
    const cemetery = createGardenCemetery(wreckField(24));
    const matrix = new Matrix4();
    const position = new Vector3();
    let checked = 0;
    cemetery.root.traverse((object) => {
      if (!(object instanceof InstancedMesh)) return;
      if (!object.name.startsWith("cemetery-wrecks-")) return;
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        // Local space: the root sits at y=0, so the sea surface is WATER_Y.
        expect(position.y).toBeLessThanOrEqual(-1.45);
        checked += 1;
      }
    });
    expect(checked).toBe(7);
  });

  it("keeps every cause colour while shedding cloth and lantern furniture", () => {
    const graves = [
      grave("grave.a", "grounded", CEMETERY_CENTER.x, CEMETERY_CENTER.y),
      grave("grave.b", "sinking-stern", CEMETERY_CENTER.x + 1, CEMETERY_CENTER.y),
      grave("grave.c", "broken-keel", CEMETERY_CENTER.x + 2, CEMETERY_CENTER.y),
      grave("grave.d", "skeletal", CEMETERY_CENTER.x + 3, CEMETERY_CENTER.y),
      grave("grave.e", "shattered", CEMETERY_CENTER.x + 4, CEMETERY_CENTER.y),
    ];
    const cemetery = createGardenCemetery(graves);
    expect(cemetery.root.getObjectByName("cemetery-wreck-lanterns")).toBeUndefined();
    expect(cemetery.root.getObjectByName("cemetery-wreck-cloth")).toBeUndefined();
    const hulls = cemetery.root.getObjectByName("cemetery-wrecks-fan") as InstancedMesh;
    const actual = new Set<string>();
    const color = new Color();
    for (let index = 0; index < hulls.count; index += 1) {
      hulls.getColorAt(index, color);
      actual.add(`#${color.getHexString()}`);
    }
    expect(actual).toEqual(new Set(Object.values(CAUSE_HEX)));
  });

  it("places wrecks deterministically", () => {
    const first = createGardenCemetery(wreckField(16));
    const second = createGardenCemetery(wreckField(16));
    const read = (cemetery: ReturnType<typeof createGardenCemetery>): number[] => {
      const out: number[] = [];
      const matrix = new Matrix4();
      cemetery.root.traverse((object) => {
        if (!(object instanceof InstancedMesh)) return;
        for (let index = 0; index < object.count; index += 1) {
          object.getMatrixAt(index, matrix);
          out.push(...matrix.elements);
        }
      });
      return out;
    };
    expect(read(first)).toEqual(read(second));
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

function grave(
  id: string,
  marker: GraveNode["visual"]["marker"],
  x: number,
  y: number,
): GraveNode {
  return {
    detailId: id,
    entry: { causeOfDeath: causeForMarker(marker) } as GraveNode["entry"],
    id,
    kind: "grave",
    label: id.replace("grave.", "").toUpperCase(),
    tile: { x, y },
    visual: { marker, scale: 0.36 },
  };
}

function causeForMarker(marker: GraveNode["visual"]["marker"]): CauseOfDeath {
  switch (marker) {
    case "grounded": return "counterparty-failure";
    case "sinking-stern": return "liquidity-drain";
    case "broken-keel": return "regulatory";
    case "shattered": return "algorithmic-failure";
    case "skeletal": return "abandoned";
  }
}

/** A spread of wrecks across three forms, scattered over the shoals. */
function wreckField(count: number): GraveNode[] {
  const forms = ["broken-keel", "skeletal", "grounded"] as const;
  return Array.from({ length: count }, (_, index) => grave(
    `grave.${index}`,
    forms[index % forms.length]!,
    CEMETERY_CENTER.x + ((index % 6) - 2.5) * 0.55,
    CEMETERY_CENTER.y + (Math.floor(index / 6) - 1.5) * 0.48,
  ));
}

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

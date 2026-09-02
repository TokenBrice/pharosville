import {
  Color,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Texture,
  Vector3,
} from "three";
import { CAUSE_HEX, type CauseOfDeath } from "@shared/lib/cause-of-death";
import { describe, expect, it } from "vitest";
import { rimLandAt } from "../systems/garden-rim";
import {
  CEMETERY_CENTER,
  isWaterTileKind,
  terrainKindAt,
} from "../systems/world-layout";
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

  it("stages five to seven representative graves in at most three silhouette draws", () => {
    const graves = wreckField(24);
    const cemetery = createGardenCemetery(graves);
    const renderedBatches: InstancedMesh[] = [];
    cemetery.root.traverse((object) => {
      if (
        object instanceof InstancedMesh
        && object.name.startsWith("cemetery-wrecks-")
      ) {
        renderedBatches.push(object);
      }
    });

    expect(renderedBatches.map((batch) => batch.name).sort()).toEqual([
      "cemetery-wrecks-bare-remains",
      "cemetery-wrecks-broken-keel",
      "cemetery-wrecks-substantial",
    ]);
    expect(renderedBatches.reduce((sum, batch) => sum + batch.count, 0)).toBe(7);
    expect(new Set(renderedBatches.map((batch) => batch.geometry.getAttribute("position").count)).size)
      .toBe(3);
    expect(objectCount(cemetery.root)).toBe(3);
    expect(hasTexture(cemetery.root)).toBe(false);
    expect(renderedBatches.filter((batch) => batch.geometry.userData.hasClusterPool))
      .toHaveLength(1);
    expect(renderedBatches.reduce((visiblePools, batch) => {
      const visibility = batch.geometry.getAttribute("poolVisible");
      return visiblePools + Array.from(
        { length: visibility.count },
        (_, index) => visibility.getX(index),
      ).reduce((sum, value) => sum + value, 0);
    }, 0)).toBe(1);

    for (const available of [4, 5, 6, 7, 12]) {
      const rendered = wreckBatches(createGardenCemetery(wreckField(available)).root)
        .reduce((sum, batch) => sum + batch.count, 0);
      expect(rendered).toBe(Math.min(available, 7));
    }
  });

  it("holds the whole wreck field inside a flat draw budget", () => {
    // The real graveyard is ~89 dead and frozen coins; neither read count nor
    // draw count tracks the ledger length.
    const small = createGardenCemetery(wreckField(12));
    const large = createGardenCemetery(wreckField(120));
    expect(objectCount(large.root)).toBe(objectCount(small.root));
    expect(objectCount(large.root)).toBe(3);
    const readCount = wreckBatches(large.root).reduce((sum, batch) => sum + batch.count, 0);
    expect(readCount).toBe(7);
  });

  it("sinks 60–80 percent of each hull at the waterline", () => {
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
        // Local space: the root sits at y=0, so the instance origin is the
        // canonical WATER_Y and the geometry is sunk around its own y=0.
        expect(position.y).toBeCloseTo(-1.45, 6);
        const tile = {
          x: Math.round(CEMETERY_CENTER.x + position.x / Math.SQRT2),
          y: Math.round(CEMETERY_CENTER.y + position.z / Math.SQRT2),
        };
        const kind = terrainKindAt(tile.x, tile.y);
        expect(isWaterTileKind(kind), `${object.name}.${index} (${kind})`).toBe(true);
        expect(rimLandAt(tile.x, tile.y), `${object.name}.${index}`).toBe(false);
        checked += 1;
      }

      const positions = object.geometry.getAttribute("position");
      const roles = object.geometry.getAttribute("wreckRole");
      const hullYs = Array.from({ length: positions.count }, (_, index) => index)
        .filter((index) => roles.getX(index) === 1)
        .map((index) => positions.getY(index));
      const minY = Math.min(...hullYs);
      const maxY = Math.max(...hullYs);
      const sinkFraction = (0 - minY) / (maxY - minY);
      expect(sinkFraction).toBeGreaterThanOrEqual(0.6);
      expect(sinkFraction).toBeLessThanOrEqual(0.8);
      expect(sinkFraction).toBeCloseTo(object.geometry.userData.sinkFraction, 5);
    });
    expect(checked).toBe(7);
  });

  it("keeps each family readable above water beside a taller stone marker", () => {
    const cemetery = createGardenCemetery(wreckField(24));
    const cues = new Set<string>();
    for (const batch of wreckBatches(cemetery.root)) {
      const positions = batch.geometry.getAttribute("position");
      const roles = batch.geometry.getAttribute("wreckRole");
      const yForRole = (role: number) => Array.from(
        { length: positions.count },
        (_, index) => index,
      ).filter((index) => roles.getX(index) === role)
        .map((index) => positions.getY(index));
      const readableSilhouette = yForRole(3);
      const stone = yForRole(4);
      expect(readableSilhouette.length).toBeGreaterThan(0);
      expect(Math.max(...readableSilhouette)).toBeGreaterThan(0.35);
      expect(Math.max(...stone)).toBeGreaterThan(Math.max(...readableSilhouette));
      cues.add(batch.geometry.userData.aboveWaterCue);
      for (const nominalPixels of batch.userData.nominalPixelLengths) {
        expect(nominalPixels).toBeGreaterThanOrEqual(40);
        expect(nominalPixels).toBeLessThanOrEqual(60);
      }
    }
    expect(cues).toEqual(new Set(["intact-gunwale", "angled-halves", "ribs-only"]));
  });

  it("restricts every cause colour to the small marker stain", () => {
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
    const actual = new Set<string>();
    const color = new Color();
    for (const batch of wreckBatches(cemetery.root)) {
      const masks = batch.geometry.getAttribute("causeMask");
      const colors = batch.geometry.getAttribute("color");
      const roles = batch.geometry.getAttribute("wreckRole");
      expect(batch.userData.causeColorRole).toBe("marker-stain-only");
      expect(batch.geometry.userData.causeColorRole).toBe("marker-stain-only");
      expect(Array.from({ length: masks.count }, (_, index) => masks.getX(index)))
        .toContain(0);
      expect(Array.from({ length: masks.count }, (_, index) => masks.getX(index)))
        .toContain(1);
      const causeVertices = Array.from({ length: masks.count }, (_, index) => index)
        .filter((index) => masks.getX(index) === 1);
      expect(causeVertices.every((index) => roles.getX(index) === 2)).toBe(true);
      const causeXs = causeVertices.map((index) => batch.geometry.getAttribute("position").getX(index));
      const causeZs = causeVertices.map((index) => batch.geometry.getAttribute("position").getZ(index));
      expect(Math.max(...causeXs) - Math.min(...causeXs)).toBeLessThan(0.3);
      expect(Math.max(...causeZs) - Math.min(...causeZs)).toBeLessThan(0.3);
      const nonCauseColors = new Set(
        Array.from({ length: masks.count }, (_, index) => index)
          .filter((index) => masks.getX(index) === 0)
          .map((index) => new Color(
            colors.getX(index),
            colors.getY(index),
            colors.getZ(index),
          ).getHexString()),
      );
      expect(nonCauseColors.size).toBeGreaterThanOrEqual(4);
      for (let index = 0; index < batch.count; index += 1) {
        batch.getColorAt(index, color);
        actual.add(`#${color.getHexString()}`);
      }
    }
    expect(actual).toEqual(new Set(Object.values(CAUSE_HEX)));
  });

  it("scales each hull from its grave value without exceeding the fleet-safe cap", () => {
    const small = grave("grave.small", "grounded", CEMETERY_CENTER.x, CEMETERY_CENTER.y);
    small.visual.scale = 0.25;
    const large = grave("grave.large", "grounded", CEMETERY_CENTER.x + 1, CEMETERY_CENTER.y);
    large.visual.scale = 0.45;
    const extreme = grave("grave.extreme", "grounded", CEMETERY_CENTER.x + 2, CEMETERY_CENTER.y);
    extreme.visual.scale = 4;
    const batch = wreckBatches(createGardenCemetery([small, large, extreme]).root)[0]!;
    const scales = new Map<string, number>();
    const matrix = new Matrix4();
    const scale = new Vector3();
    for (let index = 0; index < batch.count; index += 1) {
      batch.getMatrixAt(index, matrix);
      matrix.decompose(new Vector3(), new Quaternion(), scale);
      scales.set(batch.userData.graveIds[index], scale.x);
    }
    expect(scales.get(small.id)).toBeLessThan(scales.get(large.id)!);
    expect(scales.get(large.id)).toBeLessThan(batch.userData.hullScaleCap);
    expect(scales.get(extreme.id)).toBeCloseTo(batch.userData.hullScaleCap, 6);
    expect(batch.userData.hullScaleCap).toBe(2);
  });

  it("places each wreck deterministically by id even when input order changes", () => {
    const first = createGardenCemetery(wreckField(16));
    const second = createGardenCemetery(wreckField(16).reverse());
    const read = (cemetery: ReturnType<typeof createGardenCemetery>): Map<string, number[]> => {
      const out = new Map<string, number[]>();
      const matrix = new Matrix4();
      for (const object of wreckBatches(cemetery.root)) {
        for (let index = 0; index < object.count; index += 1) {
          object.getMatrixAt(index, matrix);
          out.set(object.userData.graveIds[index], [...matrix.elements]);
        }
      }
      return out;
    };
    expect([...read(first).entries()].sort()).toEqual([...read(second).entries()].sort());
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

/** A spread across all five cause forms, scattered over the shoals. */
function wreckField(count: number): GraveNode[] {
  const forms = ["grounded", "sinking-stern", "broken-keel", "skeletal", "shattered"] as const;
  return Array.from({ length: count }, (_, index) => grave(
    `grave.${index}`,
    forms[index % forms.length]!,
    CEMETERY_CENTER.x + ((index % 6) - 2.5) * 0.55,
    CEMETERY_CENTER.y + (Math.floor(index / 6) - 1.5) * 0.48,
  ));
}

function wreckBatches(root: Object3D): InstancedMesh[] {
  const batches: InstancedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof InstancedMesh && object.name.startsWith("cemetery-wrecks-")) {
      batches.push(object);
    }
  });
  return batches;
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

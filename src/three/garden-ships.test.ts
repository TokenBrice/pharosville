import {
  BoxGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
} from "three";
import { describe, expect, it } from "vitest";
import type { ShipHull, ShipNode, ShipSizeTier } from "../systems/world-types";
import {
  attachGardenHeroModel,
  createFleetLanterns,
  createShip,
  updateFleetLanterns,
  type ShipVisual,
} from "./garden-ships";
import { GARDEN_MODEL_MANIFEST } from "./garden-models";
import type { GardenShipGeometryCache } from "./garden-util";

function makeCache(): GardenShipGeometryCache {
  return {
    geometries: new Map(),
    wakeFillMaterial: new MeshBasicMaterial(),
    wakeMaterial: new LineBasicMaterial(),
  };
}

function ship(id: string, hull: ShipHull, sizeTier: ShipSizeTier, scale = 1): ShipNode {
  return {
    detailId: id,
    id,
    riskZone: "calm",
    tile: { x: 1, y: 1 },
    visual: { hull, scale, sizeTier },
  } as unknown as ShipNode;
}

function build(node: ShipNode): ShipVisual {
  return createShip(node, { x: 0, y: 0 }, true, makeCache());
}

describe("createShip vertex shading", () => {
  it("bakes a vertex-color attribute on the hull and enables vertexColors", () => {
    const visual = build(ship("s1", "treasury-galleon", "major"));
    const meshes = visual.root.children.filter(
      (child): child is Mesh => child instanceof Mesh,
    );
    // The hull carries a baked color attribute and multiplies it by livery.
    const shaded = meshes.find((mesh) => {
      const material = mesh.material;
      const vertexColors = Array.isArray(material)
        ? material[0]!.vertexColors
        : (material as { vertexColors?: boolean }).vertexColors;
      return mesh.geometry.getAttribute("color") && vertexColors;
    });
    expect(shaded).toBeDefined();
    // The dark keel shares the geometry but keeps its flat iron color.
    const keel = meshes.find((mesh) => {
      const material = mesh.material as { vertexColors?: boolean };
      return mesh.geometry.getAttribute("color") && !material.vertexColors;
    });
    expect(keel).toBeDefined();
  });
});

describe("fleet tiers", () => {
  it("assigns lantern strings and slower motion to titans", () => {
    const titan = build(ship("t", "treasury-galleon", "titan"));
    expect(titan.tier).toBe("titan");
    expect(titan.lanternPoints).toHaveLength(3);
    expect(titan.laneIntensity).toBeCloseTo(0.55);
    expect(titan.motionPeriodScale).toBeGreaterThan(1);
    expect(titan.motionAmplitudeScale).toBeLessThan(1);
  });

  it("gives heritage hulls a bow+stern pair", () => {
    const heritage = build(ship("h", "treasury-galleon", "major"));
    expect(heritage.tier).toBe("heritage");
    expect(heritage.lanternPoints).toHaveLength(2);
    expect(heritage.laneIntensity).toBeCloseTo(0.45);
  });

  it("promotes a large-scale local hull to heritage", () => {
    const scaled = build(ship("l", "treasury-galleon", "local", 1.2));
    expect(scaled.tier).toBe("heritage");
  });

  it("keeps a plain skiff at a single stern lantern, standard cadence", () => {
    const standard = build(ship("s", "treasury-galleon", "skiff"));
    expect(standard.tier).toBe("standard");
    expect(standard.lanternPoints).toHaveLength(1);
    expect(standard.laneIntensity).toBeCloseTo(0.3);
    expect(standard.motionPeriodScale).toBe(1);
  });
});

describe("hero hull assignment", () => {
  it("routes titans to the titan hull and uniques to the heritage hull", () => {
    expect(build(ship("t", "treasury-galleon", "titan")).heroModelId).toBe("garden-hero-titan");
    expect(build(ship("u", "treasury-galleon", "unique")).heroModelId).toBe("garden-hero-heritage");
    expect(build(ship("m", "treasury-galleon", "major")).heroModelId).toBeNull();
    expect(build(ship("s", "treasury-galleon", "skiff")).heroModelId).toBeNull();
  });

  it("collects a hideable procedural hull and tracks the identity sail", () => {
    const visual = build(ship("t", "treasury-galleon", "titan"));
    expect(visual.heroHideable.length).toBeGreaterThan(4);
    expect(visual.heroHideable.every((part) => part.visible)).toBe(true);
    expect(visual.identitySail).toBeInstanceOf(Mesh);
    // The identity sail is never in the hideable set — it re-homes onto the GLB.
    expect(visual.heroHideable).not.toContain(visual.identitySail);
  });
});

function heroFixture(id: "garden-hero-titan" | "garden-hero-heritage"): Group {
  const root = new Group();
  root.name = id;
  const wood = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
  wood.name = "wood-hull";
  root.add(wood);
  for (const anchor of Object.values(GARDEN_MODEL_MANIFEST[id].anchors)) {
    const node = new Object3D();
    node.name = anchor.node;
    node.position.fromArray(anchor.position);
    root.add(node);
  }
  return root;
}

describe("attachGardenHeroModel", () => {
  it("hides the procedural hull, mounts the GLB, and re-homes the identity sail", () => {
    const visual = build(ship("t", "treasury-galleon", "titan"));
    const identitySail = visual.identitySail;
    const model = heroFixture("garden-hero-titan");
    const attachedWood = model.getObjectByName("wood-hull") as Mesh;
    const woodGeometry = attachedWood.geometry;
    const sharedMaterial = attachedWood.material;

    attachGardenHeroModel(visual, model);

    expect(visual.heroHideable.every((part) => part.visible)).toBe(false);
    expect(identitySail?.visible).toBe(true);
    expect(visual.root.children).toContain(model);
    // Geometry stays shared with the cache; only the material is cloned + tinted.
    expect(attachedWood.geometry).toBe(woodGeometry);
    expect(attachedWood.material).not.toBe(sharedMaterial);
    // Identity sail moved onto the main-mast area (non-zero masthead height).
    const masthead = GARDEN_MODEL_MANIFEST["garden-hero-titan"].anchors.masthead;
    expect(identitySail?.position.x).toBeCloseTo(masthead?.position[0] ?? 0);
  });

  it("is a no-op for a standard ship with no hero model", () => {
    const visual = build(ship("s", "treasury-galleon", "skiff"));
    const before = visual.heroHideable.map((part) => part.visible);
    attachGardenHeroModel(visual, heroFixture("garden-hero-titan"));
    expect(visual.heroHideable.map((part) => part.visible)).toEqual(before);
  });
});

describe("createFleetLanterns", () => {
  it("packs every ship's lanterns into two shared instanced meshes", () => {
    const ships = [
      build(ship("a", "treasury-galleon", "titan")), // 3
      build(ship("b", "treasury-galleon", "major")), // 2
      build(ship("c", "treasury-galleon", "skiff")), // 1
    ];
    const lanterns = createFleetLanterns(ships, makeCache());
    expect(lanterns.entries).toHaveLength(6);
    expect(lanterns.cores).toBeInstanceOf(InstancedMesh);
    expect(lanterns.glow).toBeInstanceOf(InstancedMesh);
    expect(lanterns.cores.count).toBe(6);
    expect(lanterns.glow.count).toBe(6);
    // Cores bloom (toneMapped off); glow is additive and starts dark.
    expect(lanterns.coreMaterial.toneMapped).toBe(false);
    expect(lanterns.glowMaterial.opacity).toBe(0);
  });

  it("restamps instance matrices without throwing under motion and reduced motion", () => {
    const ships = [build(ship("a", "treasury-galleon", "titan"))];
    const lanterns = createFleetLanterns(ships, makeCache());
    const quaternion = new Quaternion();
    expect(() => updateFleetLanterns(lanterns, quaternion, 4.2, false)).not.toThrow();
    expect(() => updateFleetLanterns(lanterns, quaternion, 4.2, true)).not.toThrow();
    // The first core instance is no longer the zero-scale placeholder.
    const core = lanterns.cores.instanceMatrix.array;
    expect(core.slice(0, 16).some((value) => value !== 0)).toBe(true);
  });
});

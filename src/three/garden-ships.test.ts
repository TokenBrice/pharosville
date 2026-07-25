import {
  BoxGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
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
  createFleetBatchGeometry,
  createFleetLanterns,
  createShip,
  gardenShipVisualScale,
  GARDEN_SHIP_VISUAL_SCALE_MAX,
  GARDEN_SHIP_VISUAL_SCALE_MIN,
  syncShipRippleRings,
  updateFleetLanterns,
  updateShipPennants,
  type ShipVisual,
} from "./garden-ships";
import type { GardenRippleRingEmitter } from "./garden-water-contract";
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
  it("gives every hero-tier ship a distinct, deterministic hull", () => {
    // W5 (D4/O11): ten distinct hulls, assigned deterministically per coin,
    // replacing the two shared models every hero-tier ship used to get.
    const titan = build(ship("t", "treasury-galleon", "titan")).heroModelId;
    const unique = build(ship("u", "treasury-galleon", "unique")).heroModelId;
    expect(titan).toMatch(/^garden-hero-/);
    expect(unique).toMatch(/^garden-hero-/);
    // Stable across rebuilds: a coin must never change ship between refreshes.
    expect(build(ship("t", "treasury-galleon", "titan")).heroModelId).toBe(titan);

    // Only hero tiers get a bespoke hull; the rest join the instanced batches.
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

describe("S5 visual scale spread (D-S5)", () => {
  it("maps the 0.7–3.0 data band to a ~3.7× visual spread with a legibility floor", () => {
    expect(gardenShipVisualScale(0.7)).toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MIN);
    expect(gardenShipVisualScale(3)).toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MAX);
    const spread = gardenShipVisualScale(3) / gardenShipVisualScale(0.7);
    expect(spread).toBeGreaterThan(3.4);
    expect(spread).toBeLessThan(4);
    // Small-ship floor stays close to the old minimum (0.72 × 0.82 ≈ 0.59).
    expect(GARDEN_SHIP_VISUAL_SCALE_MIN).toBeGreaterThanOrEqual(0.5);
    // Monotonic across the data band.
    expect(gardenShipVisualScale(1.5)).toBeGreaterThan(gardenShipVisualScale(1));
    expect(gardenShipVisualScale(2)).toBeGreaterThan(gardenShipVisualScale(1.5));
  });

  it("applies the relaxed mapping to the ship root scale", () => {
    expect(build(ship("tiny", "treasury-galleon", "micro", 0.7)).root.scale.x)
      .toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MIN);
    expect(build(ship("huge", "treasury-galleon", "flagship", 3)).root.scale.x)
      .toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MAX);
  });
});

describe("S1 curved sheer hull", () => {
  it("rises toward bow and stern and narrows at the deck (tumblehome)", () => {
    const cache = makeCache();
    createShip(ship("s1", "treasury-galleon", "major"), { x: 0, y: 0 }, true, cache);
    const hull = cache.geometries.get("hull.galleon")!;
    hull.computeBoundingBox();
    // The old flat extrusion topped out at y ≈ 0.34; sheer lifts the ends past it.
    expect(hull.boundingBox!.max.y).toBeGreaterThan(0.5);
    const position = hull.getAttribute("position");
    let deckBeam = 0;
    let waterlineBeam = 0;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      const halfBeam = Math.abs(position.getZ(index));
      if (y > 0.2) deckBeam = Math.max(deckBeam, halfBeam);
      if (y < -0.4) waterlineBeam = Math.max(waterlineBeam, halfBeam);
    }
    expect(deckBeam).toBeLessThan(waterlineBeam);
  });
});

describe("W5.3 batched silhouette form", () => {
  it("rakes the stern aft as the topsides rise", () => {
    const { hull } = createFleetBatchGeometry("clipper");
    const position = hull.getAttribute("position");
    let lowSternX = 0;
    let highSternX = 0;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      const x = position.getX(index);
      if (x > -2) continue;
      if (y < -0.3) lowSternX = Math.min(lowSternX, x);
      if (y > 0.1) highSternX = Math.min(highSternX, x);
    }
    // The counter overhangs: the deck-level stern reaches further aft (more
    // negative x) than the stern at the waterline.
    expect(highSternX).toBeLessThan(lowSternX);
  });

  it("bakes planking bands into the hull vertex color", () => {
    const { hull } = createFleetBatchGeometry("galleon");
    const color = hull.getAttribute("color");
    const position = hull.getAttribute("position");
    // Sample topside vertices only; planking fades out below the waterline.
    const shades: number[] = [];
    for (let index = 0; index < color.count; index += 1) {
      if (position.getY(index) > 0) shades.push(color.getX(index));
    }
    const unique = new Set(shades.map((value) => value.toFixed(3)));
    // A smooth keel->gunwale ramp alone would not produce this many distinct
    // topside tones; the strake sawtooth does.
    expect(unique.size).toBeGreaterThan(4);
  });

  it("crowns the deck so the rails sit below the centerline", () => {
    const { hull } = createFleetBatchGeometry("schooner");
    const position = hull.getAttribute("position");
    let railY = Number.POSITIVE_INFINITY;
    let centerY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      if (y < 0.3) continue;
      const absZ = Math.abs(position.getZ(index));
      const absX = Math.abs(position.getX(index));
      if (absX > 1.5) continue;
      if (absZ > 0.6) railY = Math.min(railY, y);
      if (absZ < 0.15) centerY = Math.max(centerY, y);
    }
    expect(railY).toBeLessThan(centerY);
  });
});

describe("S2 bellied sails", () => {
  it("displaces the cloth center so sails read wind-filled", () => {
    const visual = build(ship("s2", "treasury-galleon", "major"));
    const sail = visual.identitySail!;
    const position = sail.geometry.getAttribute("position");
    let maxBelly = 0;
    for (let index = 0; index < position.count; index += 1) {
      maxBelly = Math.max(maxBelly, Math.abs(position.getZ(index)));
    }
    expect(maxBelly).toBeGreaterThan(0.15);
    // Grid tessellation: interior vertices exist (a flat shape has ~5).
    expect(position.count).toBeGreaterThan(30);
  });
});

describe("S3 sparse rigging", () => {
  it("adds forestay, backstay, two shrouds and per-sail halyards in one batched LineSegments", () => {
    const visual = build(ship("s3", "treasury-galleon", "major"));
    const rigging = visual.root.children.find(
      (child): child is LineSegments => child instanceof LineSegments,
    )!;
    // 3 galleon masts × 4 standing-rigging lines, plus W5.4 running rigging:
    // 2 halyard segments per sail. All × 2 endpoints. W3 gave the main and
    // mizzen a topsail each, so the galleon now sets 5 sails, not 3.
    const standing = 3 * 4;
    const halyards = 5 * 2;
    expect(rigging.geometry.getAttribute("position").count).toBe((standing + halyards) * 2);
    // The whole rig must stay one draw call however many lines it carries.
    expect(
      visual.root.children.filter((child) => child instanceof LineSegments),
    ).toHaveLength(1);
  });
});

describe("S8 pennant flutter", () => {
  it("flutters underway and freezes flat under reduced motion", () => {
    const visual = build(ship("s8", "treasury-galleon", "major"));
    const pennant = visual.pennant;
    // Hero ships keep their own pennant mesh; batched ships stamp an
    // instance instead and have none (W1 / D2).
    expect(pennant).toBeInstanceOf(Mesh);
    updateShipPennants([visual], 1.35, false);
    expect(pennant!.rotation.y).not.toBe(0);
    updateShipPennants([visual], 1.35, true);
    expect(pennant!.rotation.y).toBe(0);
    expect(pennant!.scale.x).toBe(1);
  });
});

describe("S7 ripple-ring grounding (contract C2)", () => {
  function fakeEmitter(): GardenRippleRingEmitter & { rings: Map<string, unknown> } {
    const rings = new Map<string, unknown>();
    return {
      rings,
      setRing: (ring) => {
        rings.set(ring.id, ring);
      },
      removeRing: (id) => {
        rings.delete(id);
      },
      ringCount: () => rings.size,
    };
  }

  it("is a no-op when the Lane W emitter is absent", () => {
    const visual = build(ship("s7", "treasury-galleon", "major"));
    expect(() => syncShipRippleRings(undefined, [visual], {
      reducedMotion: false,
      tier: "full",
    })).not.toThrow();
    expect(() => syncShipRippleRings(null, [visual], {
      reducedMotion: false,
      tier: "full",
    })).not.toThrow();
  });

  it("rings moored ships and clears them underway, at low tiers, and under reduced motion", () => {
    const emitter = fakeEmitter();
    const visual = build(ship("s7", "treasury-galleon", "major"));
    visual.sampleState = "moored";
    syncShipRippleRings(emitter, [visual], { reducedMotion: false, tier: "balanced" });
    expect(emitter.ringCount()).toBe(1);
    // Movers lose the ring.
    visual.sampleState = "sailing";
    syncShipRippleRings(emitter, [visual], { reducedMotion: false, tier: "balanced" });
    expect(emitter.ringCount()).toBe(0);
    // Below balanced there are no rings.
    visual.sampleState = "moored";
    syncShipRippleRings(emitter, [visual], { reducedMotion: false, tier: "constrained" });
    expect(emitter.ringCount()).toBe(0);
    // Reduced motion freezes the sea — no rings.
    syncShipRippleRings(emitter, [visual], { reducedMotion: true, tier: "full" });
    expect(emitter.ringCount()).toBe(0);
  });
});

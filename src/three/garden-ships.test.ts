import { readFileSync } from "node:fs";
import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
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
import { describe, expect, it, vi } from "vitest";
import {
  GARDEN_HULL_SILHOUETTES,
  type GardenHullSilhouette,
} from "../systems/garden-observatory-slice";
import { gardenShipWaterBeamTiles, gardenShipWaterMarginTiles } from "../systems/garden-water-exclusion";
import { SHIP_HULL_FORM_SPAN } from "../systems/world-types";
import type { ShipHull, ShipNode, ShipSizeTier } from "../systems/world-types";
import {
  assignGardenHeroSailAtlas,
  GARDEN_SAIL_SEGMENTS_V,
  attachGardenHeroModel,
  createBatchedShip,
  createFleetBatchGeometry,
  createFleetLanterns,
  createShip,
  gardenShipVisualScale,
  GARDEN_HULL_FAMILY_PAINT,
  GARDEN_SHIP_VISUAL_SCALE_MAX,
  GARDEN_SHIP_VISUAL_SCALE_MIN,
  resetFleetSailAttention,
  syncFleetSailAttention,
  syncShipRippleRings,
  updateFleetLanterns,
  patchShipLanternEmissiveMaterial,
  updateShipPennants,
  type ShipVisual,
} from "./garden-ships";
import { gardenFleetAttention } from "./garden-fleet-batch";
import type { GardenRippleRingEmitter } from "./garden-water-contract";
import {
  createGardenModelLibrary,
  GARDEN_MODEL_MANIFEST,
  type GardenModelAnchorId,
  type GardenModelId,
  type Vector3Tuple,
} from "./garden-models";
import { disposeThreeObjectTree, type GardenShipGeometryCache } from "./garden-util";

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

  it("shares one cached shield geometry across badge layers and ships, disposing it once", () => {
    const cache = makeCache();
    const root = new Group();
    for (const id of ["shield-a", "shield-b"]) {
      const node = ship(id, "treasury-galleon", "titan");
      node.reportCard = { overallGrade: "A" } as NonNullable<ShipNode["reportCard"]>;
      const visual = createShip(node, { x: 0, y: 0 }, true, cache);
      root.add(visual.root);
      const shield = visual.root.getObjectByName("ship-bluechip-shield") as Mesh;
      const mark = visual.root.getObjectByName("ship-bluechip-shield-mark") as Mesh;
      expect(shield.geometry).toBe(cache.geometries.get("bluechip-shield"));
      expect(mark.geometry).toBe(shield.geometry);
      expect(mark.material).not.toBe(shield.material);
      expect(mark.scale.x).toBe(0.42);
      expect(shield.scale.x).toBe(1);
    }
    const geometry = cache.geometries.get("bluechip-shield")!;
    const dispose = vi.spyOn(geometry, "dispose");
    disposeThreeObjectTree(root);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps report-card fittings on a hero when its model attaches", () => {
    const node = ship("usdt-tether", "treasury-galleon", "titan");
    node.visual.hullForm = { beam: 1, fittingCode: 19, height: 1, length: 1, waterline: 0 };
    const visual = build(node);
    const fittings = visual.root.getObjectByName("ship-seaworthiness-fittings");
    expect(fittings).toBeInstanceOf(Mesh);
    attachGardenHeroModel(visual, heroFixture(visual.heroModelId!));
    expect(fittings?.visible).toBe(true);
    expect(fittings?.parent).not.toBeNull();
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
  it("gives named titans distinct, deterministic hulls", () => {
    const titan = build(ship("usdt-tether", "treasury-galleon", "titan")).heroModelId;
    const circle = build(ship("usdc-circle", "treasury-galleon", "titan")).heroModelId;
    expect(titan).toBe("garden-hero-tether");
    expect(circle).toBe("garden-hero-circle");
    expect(build(ship("usdt-tether", "treasury-galleon", "titan")).heroModelId).toBe(titan);
    expect(build(ship("unnamed", "treasury-galleon", "titan")).heroModelId).toBeNull();

    // Only hero tiers get a bespoke hull; the rest join the instanced batches.
    expect(build(ship("m", "treasury-galleon", "major")).heroModelId).toBeNull();
    expect(build(ship("s", "treasury-galleon", "skiff")).heroModelId).toBeNull();
  });

  it("collects a hideable procedural hull and tracks the identity sail", () => {
    const visual = build(ship("usdt-tether", "treasury-galleon", "titan"));
    expect(visual.heroHideable.length).toBeGreaterThan(4);
    expect(visual.heroHideable.every((part) => part.visible)).toBe(true);
    expect(visual.identitySail).toBeInstanceOf(Mesh);
    // The identity sail is never in the hideable set — it re-homes onto the GLB.
    expect(visual.heroHideable).not.toContain(visual.identitySail);
  });

  it("shares the fleet mark atlas with hero identity sails", () => {
    const visual = build(ship("usdt-tether", "treasury-galleon", "titan"));
    const atlas = new CanvasTexture();
    assignGardenHeroSailAtlas(visual, atlas, 17);
    expect(visual.identitySailMaterial?.map).toBe(atlas);
    expect(visual.identitySailMaterial?.emissiveMap).toBeNull();
    expect(visual.identitySailMaterial?.userData.gardenSailAtlas).toBe(true);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <uv_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>",
    };
    visual.identitySailMaterial?.onBeforeCompile(shader as never, null as never);
    expect(shader.vertexShader).toContain("uHeroAtlasCell");
    expect(shader.fragmentShader).toContain("vHeroAtlasUv");
    atlas.dispose();
  });
});

function heroFixture(id: GardenModelId): Group {
  const root = new Group();
  root.name = id;
  const wood = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ color: "#ffffff" }));
  wood.name = "wood-hull";
  root.add(wood);
  const spar = new Mesh(new BoxGeometry(0.2, 1, 0.2), new MeshStandardMaterial({ color: "#5a3c24" }));
  spar.name = "spar-hull";
  spar.position.y = 1;
  root.add(spar);
  for (const anchor of Object.values(GARDEN_MODEL_MANIFEST[id].anchors)) {
    const node = new Object3D();
    node.name = anchor.node;
    node.position.fromArray(anchor.position);
    root.add(node);
  }
  return root;
}

describe("attachGardenHeroModel", () => {
  it("keeps the real Tether GLB's normalized timber colors through the rendered merge", async () => {
    const visual = build(ship("usdt-tether", "treasury-galleon", "titan"));
    const asset = GARDEN_MODEL_MANIFEST[visual.heroModelId!].artifact.url.split("?")[0];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(readFileSync(`public${asset}`)))));
    try {
      const model = await createGardenModelLibrary().load(visual.heroModelId!);
      const wood = model.getObjectByName("wood-hull") as Mesh;
      const source = wood.geometry.getAttribute("color");
      const indices = wood.geometry.index!;
      const tint = (wood.material as MeshStandardMaterial).color.clone().multiply(visual.heroHullTint);
      attachGardenHeroModel(visual, model);
      const merged = model.getObjectByName("hero-merged-solid") as Mesh;
      const color = merged.geometry.getAttribute("color");
      let error = 0;
      for (let vertex = 0; vertex < indices.count; vertex += 1) {
        const original = indices.getX(vertex);
        error = Math.max(error,
          Math.abs(color.getX(vertex) - source.getX(original) * tint.r),
          Math.abs(color.getY(vertex) - source.getY(original) * tint.g),
          Math.abs(color.getZ(vertex) - source.getZ(original) * tint.b));
      }
      expect(error).toBeLessThan(1e-7);
      const normals = merged.geometry.getAttribute("normal");
      for (let vertex = 0; vertex < normals.count; vertex += 1) {
        expect(Math.hypot(normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex))).toBeCloseTo(1, 3);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("hides the procedural hull, mounts the GLB, and re-homes the identity sail", () => {
    const visual = build(ship("usdt-tether", "treasury-galleon", "titan"));
    const identitySail = visual.identitySail;
    const model = heroFixture(visual.heroModelId!);
    const attachedWood = model.getObjectByName("wood-hull") as Mesh;
    const woodGeometry = attachedWood.geometry;
    const sharedMaterial = attachedWood.material;

    attachGardenHeroModel(visual, model);

    expect(visual.heroHideable.every((part) => part.visible)).toBe(false);
    expect(identitySail?.visible).toBe(true);
    expect(visual.root.children).toContain(model);
    // Static GLB parts collapse to one solid draw plus one canvas draw.
    expect(model.children.filter((child) => child instanceof Mesh)).toHaveLength(1);
    expect(model.getObjectByName("hero-merged-solid")).toBeInstanceOf(Mesh);
    expect(attachedWood.parent).toBeNull();
    expect(woodGeometry).toBeDefined();
    expect(sharedMaterial).toBeDefined();
    // Identity sail moved onto the main-mast area (non-zero masthead height).
    const anchors: Readonly<Partial<Record<GardenModelAnchorId, { readonly position: Vector3Tuple }>>> =
      GARDEN_MODEL_MANIFEST[visual.heroModelId!].anchors;
    const masthead = anchors.masthead;
    expect(identitySail?.position.x).toBeCloseTo(masthead?.position[0] ?? 0);
  });

  it("is a no-op for a standard ship with no hero model", () => {
    const visual = build(ship("s", "treasury-galleon", "skiff"));
    const before = visual.heroHideable.map((part) => part.visible);
    attachGardenHeroModel(visual, heroFixture("garden-hero-tether"));
    expect(visual.heroHideable.map((part) => part.visible)).toEqual(before);
  });

  it("preserves source material response in the existing merged solid draw", () => {
    const visual = build(ship("usdt-tether", "treasury-galleon", "titan"));
    const model = heroFixture(visual.heroModelId!);
    const sources = model.children.filter((child): child is Mesh => child instanceof Mesh);
    const responses = [[0.84, 0], [0.9, 0.35]] as const;
    sources.forEach((mesh, index) => {
      const material = mesh.material as MeshStandardMaterial;
      [material.roughness, material.metalness] = responses[index]!;
    });
    attachGardenHeroModel(visual, model);
    const merged = model.getObjectByName("hero-merged-solid") as Mesh;
    const surface = merged.geometry.getAttribute("aHeroSurface");
    expect(surface.array).toBeInstanceOf(Uint8Array);
    expect(surface.normalized).toBe(true);
    let vertex = 0;
    sources.forEach((mesh, index) => {
      const count = mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count;
      for (let end = vertex + count; vertex < end; vertex += 1) {
        expect(surface.getX(vertex)).toBeCloseTo(responses[index]![0], 2);
        expect(surface.getY(vertex)).toBeCloseTo(responses[index]![1], 2);
      }
      expect((mesh.material as MeshStandardMaterial).roughness).toBe(responses[index]![0]);
    });
    expect(surface.count).toBe(vertex);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <emissivemap_fragment>",
    };
    (merged.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never);
    expect(shader.vertexShader).toContain("vHeroSurface = aHeroSurface");
    expect(shader.fragmentShader).toContain("roughnessFactor *= vHeroSurface.x");
    expect(shader.fragmentShader).toContain("metalnessFactor *= vHeroSurface.y");
    expect(model.children.filter((child) => child instanceof Mesh)).toHaveLength(1);
  });

  it("carries restrained wabi value and age patina onto hero wood, never sails", () => {
    const node = ship("usdt-tether", "treasury-galleon", "titan");
    node.visual.hullForm = {
      beam: 1,
      height: 1,
      length: 1,
      waterline: 0,
      agePatina: 1,
      hullValue: 0.95,
      propRotation: 0.08,
      ropeSag: -0.05,
    };
    const visual = build(node);
    const model = heroFixture(visual.heroModelId!);
    attachGardenHeroModel(visual, model);
    const merged = model.getObjectByName("hero-merged-solid") as Mesh;
    const color = merged.geometry.getAttribute("color");
    const values = Array.from(color.array);
    expect(Math.min(...values)).toBeLessThan(1);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.05);
    const last = color.count - 1;
    expect(color.getY(last)).toBeGreaterThan(0.05);
    expect(visual.identitySailMaterial?.color).not.toEqual((merged.material as MeshStandardMaterial).color);
    expect(visual.pennant?.rotation.z).toBeCloseTo(0.08);
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

  it("feeds per-instance warmth into the lantern emissive term", () => {
    const material = new MeshStandardMaterial();
    patchShipLanternEmissiveMaterial(material);
    const shader = {
      fragmentShader: "#include <emissivemap_fragment>",
      uniforms: {},
      vertexShader: "",
    };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance *= vColor.rgb");

    const ships = [build(ship("a", "treasury-galleon", "titan"))];
    const lanterns = createFleetLanterns(ships, makeCache());
    updateFleetLanterns(lanterns, new Quaternion(), 0, true, {
      hoveredDetailId: "a",
      selectedDetailId: null,
    });
    expect(lanterns.cores.instanceColor?.getX(0)).toBeGreaterThan(1);
  });
});

describe("W1.5 continuous visual scale spread", () => {
  it("preserves the 0.42–1.15 market-cap ladder as a ~2.7× visual spread", () => {
    expect(gardenShipVisualScale(0.42)).toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MIN);
    expect(gardenShipVisualScale(1.15)).toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MAX);
    const spread = gardenShipVisualScale(1.15) / gardenShipVisualScale(0.42);
    expect(spread).toBeGreaterThan(2.7);
    expect(spread).toBeLessThan(2.8);
    expect(GARDEN_SHIP_VISUAL_SCALE_MIN).toBe(0.42);
    // Identity inside the data band, with clamps at either edge.
    expect(gardenShipVisualScale(0.7)).toBe(0.7);
    expect(gardenShipVisualScale(1)).toBe(1);
    expect(gardenShipVisualScale(0.1)).toBe(GARDEN_SHIP_VISUAL_SCALE_MIN);
    expect(gardenShipVisualScale(2)).toBe(GARDEN_SHIP_VISUAL_SCALE_MAX);
  });

  it("applies the continuous mapping to the ship root scale", () => {
    expect(build(ship("tiny", "treasury-galleon", "micro", 0.42)).root.scale.x)
      .toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MIN);
    expect(build(ship("huge", "treasury-galleon", "flagship", 1.15)).root.scale.x)
      .toBeCloseTo(GARDEN_SHIP_VISUAL_SCALE_MAX);
  });
});

describe("S1 curved sheer hull", () => {
  it("rises toward bow and stern and narrows at the deck (tumblehome)", () => {
    const cache = makeCache();
    createShip(ship("s1", "treasury-galleon", "major"), { x: 0, y: 0 }, true, cache);
    const hull = cache.geometries.get("hull.bezaisen")!;
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
  it("keeps every family's maximum deformed length and beam inside its water clearance", () => {
    for (const silhouette of GARDEN_HULL_SILHOUETTES) {
      const source = createFleetBatchGeometry(silhouette);
      source.hull.computeBoundingBox();
      const box = source.hull.boundingBox!;
      const undeformedReach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
      const requiredTiles = undeformedReach * (1 + SHIP_HULL_FORM_SPAN) / Math.SQRT2;
      const clearanceTiles = gardenShipWaterMarginTiles(1, silhouette);

      expect(clearanceTiles, silhouette).toBeGreaterThanOrEqual(requiredTiles);
      const undeformedBeam = Math.max(Math.abs(box.min.z), Math.abs(box.max.z));
      const requiredBeamTiles = undeformedBeam * (1 + SHIP_HULL_FORM_SPAN) / Math.SQRT2;
      expect(gardenShipWaterBeamTiles(1, silhouette), silhouette).toBeGreaterThanOrEqual(requiredBeamTiles);
      source.hull.dispose();
      source.sails.dispose();
    }
  });

  it("authors all six conditional fitting tags into the shared hull geometry", () => {
    const { hull, sails } = createFleetBatchGeometry("bezaisen");
    const mask = hull.getAttribute("aStrakeMask");
    const tags = new Set(Array.from({ length: mask.count }, (_, index) => mask.getX(index)));
    for (let tag = 1; tag <= 6; tag += 1) expect(tags.has(-tag)).toBe(true);
    hull.dispose();
    sails.dispose();
  });

  it("rakes the stern aft as the topsides rise", () => {
    const { hull } = createFleetBatchGeometry("kobaya");
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
    const { hull } = createFleetBatchGeometry("bezaisen");
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
    const { hull } = createFleetBatchGeometry("kobaya");
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
    // One bezaisen mast × 4 standing-rigging lines, plus two halyard segments
    // for its one enormous identity sail. All × 2 endpoints.
    const standing = 4;
    const halyards = 2;
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

describe("hero peg trim (Tier 3 #13)", () => {
  function trimmed(waterline: number): { level: ShipVisual; trimmed: ShipVisual } {
    const node = ship("trim", "treasury-galleon", "major");
    const trimmedNode = ship("trim", "treasury-galleon", "major");
    (trimmedNode.visual as { hullForm?: unknown }).hullForm = {
      beam: 1,
      height: 1,
      length: 1,
      waterline,
    };
    return { level: build(node), trimmed: build(trimmedNode) };
  }

  it("settles every drawable child of a hull trading below its peg", () => {
    const { level, trimmed: low } = trimmed(-0.16);
    const levelHulls = level.root.children.filter((child) => child !== level.wake);
    const lowHulls = low.root.children.filter((child) => child !== low.wake);

    expect(lowHulls).not.toHaveLength(0);
    expect(lowHulls).toHaveLength(levelHulls.length);
    for (const [index, child] of lowHulls.entries()) {
      expect(child.position.y).toBeCloseTo(levelHulls[index]!.position.y - 0.16);
    }
  });

  it("lifts a hull trading above its peg", () => {
    const { level, trimmed: high } = trimmed(0.08);
    const levelDeck = level.root.children.find((child) => child !== level.wake)!;
    const highDeck = high.root.children.find((child) => child !== high.wake)!;
    expect(highDeck.position.y).toBeCloseTo(levelDeck.position.y + 0.08);
  });

  it("leaves the wake on the sea surface however deep the hull rides", () => {
    const { level, trimmed: low } = trimmed(-0.16);
    expect(low.wake.position.y).toBeCloseTo(level.wake.position.y);
  });
});

describe("W3.7 attention bridge", () => {
  function fleetVisual(detailId: string, atlasCell: number, batched = true): ShipVisual {
    return { atlasCell, batched, ship: { detailId } } as unknown as ShipVisual;
  }

  function attentionFrame(overrides: {
    hoveredDetailId?: string | null;
    reducedMotion?: boolean;
    selectedDetailId?: string | null;
    timeSeconds?: number;
  }) {
    return {
      hoveredDetailId: null,
      reducedMotion: true,
      selectedDetailId: null,
      timeSeconds: 0,
      ...overrides,
    } as unknown as Parameters<typeof syncFleetSailAttention>[1];
  }

  it("resolves the hovered ship to its atlas cell and lights only that one", () => {
    resetFleetSailAttention();
    const ships = [fleetVisual("usdc", 4), fleetVisual("usdt", 9)];
    syncFleetSailAttention(
      { logoGenerationKey: null, ships },
      attentionFrame({ hoveredDetailId: "usdt" }),
    );
    expect(gardenFleetAttention(9)).toBe(1);
    expect(gardenFleetAttention(4)).toBe(0);
    resetFleetSailAttention();
  });

  it("never routes attention to a hero ship, which never took the step", () => {
    resetFleetSailAttention();
    // Hero hulls own their own sail material and are not in the batch at all,
    // so their (meaningless) cell must never light a batched stranger.
    const ships = [fleetVisual("dai", 4, false), fleetVisual("usdt", 4)];
    syncFleetSailAttention(
      { logoGenerationKey: null, ships },
      attentionFrame({ hoveredDetailId: "dai" }),
    );
    expect(gardenFleetAttention(4)).toBe(0);
    resetFleetSailAttention();
  });

  it("re-resolves cells when a world replace reshuffles them", () => {
    resetFleetSailAttention();
    const before = [fleetVisual("usdc", 4), fleetVisual("usdt", 9)];
    syncFleetSailAttention(
      { logoGenerationKey: null, ships: before },
      attentionFrame({ selectedDetailId: "usdt" }),
    );
    expect(gardenFleetAttention(9)).toBe(1);

    // Same selection, new fleet, new cell assignment: a memo keyed on the id
    // alone would keep lighting cell 9, which now belongs to a different ship.
    const after = [fleetVisual("usdt", 2), fleetVisual("usdc", 9)];
    syncFleetSailAttention(
      { logoGenerationKey: null, ships: after },
      attentionFrame({ selectedDetailId: "usdt" }),
    );

    expect(gardenFleetAttention(2)).toBe(1);
    expect(gardenFleetAttention(9)).toBe(0);
    resetFleetSailAttention();
  });
});
describe("warm-village C2: per-family hull paint", () => {
  // One ShipHull class per silhouette, for builders keyed on the raw class.
  const HULL_FOR_FAMILY = {
    bezaisen: "treasury-galleon",
    kobaya: "crypto-caravel",
    twinhull: "dao-schooner",
    takasebune: "yield-barque",
    junk: "algo-junk",
    scow: "commodity-peg-hoy",
  } as const satisfies Record<GardenHullSilhouette, ShipHull>;

  /** Ottosson OKLab of a colour's sRGB — same measurement the paint comments cite. */
  function oklchOf(color: Color): { C: number; H: number; L: number } {
    const hex = color.getHexString();
    const channel = (start: number) => {
      const c = parseInt(hex.slice(start, start + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = channel(0), g = channel(2), b = channel(4);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2916691107 * r + 0.6239594514 * g + 0.0845399073 * b);
    const s = Math.cbrt(0.1193444823 * r + 0.2725433442 * g + 0.6475147746 * b);
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    let H = (Math.atan2(bb, a) * 180) / Math.PI;
    if (H < 0) H += 360;
    return {
      C: Math.hypot(a, bb),
      H,
      L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    };
  }

  /** Largest per-channel gap in the working (linear) space the batches store. */
  function maxChannelDistance(a: Color, b: Color): number {
    return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
  }

  function branded(id: string, hull: ShipHull, primary: string): ShipNode {
    const node = ship(id, hull, "major");
    node.visual.livery = { primary } as NonNullable<ShipNode["visual"]["livery"]>;
    return node;
  }

  function batched(node: ShipNode): ShipVisual {
    return createBatchedShip(node, { x: 0, y: 0 }, true, makeCache(), 0);
  }

  it("exports a paint pair for exactly the six families on a readable OKLCH ladder", () => {
    expect(Object.keys(GARDEN_HULL_FAMILY_PAINT).sort())
      .toEqual([...GARDEN_HULL_SILHOUETTES].sort());
    const timbers = Object.entries(GARDEN_HULL_FAMILY_PAINT)
      .map(([family, paint]) => ({ family, ...oklchOf(paint.timber) }));
    for (let i = 0; i < timbers.length; i += 1) {
      for (let j = i + 1; j < timbers.length; j += 1) {
        const a = timbers[i]!;
        const b = timbers[j]!;
        const dL = Math.abs(a.L - b.L);
        let dH = Math.abs(a.H - b.H);
        if (dH > 180) dH = 360 - dH;
        // Warm timbers share one OKLab hue band, so value is their separator;
        // the grey-teal twinhull separates by hue. Either alone must suffice.
        expect(
          dL >= 0.06 || dH >= 25,
          `${a.family}/${b.family}: dL ${dL.toFixed(3)} dH ${dH.toFixed(0)}`,
        ).toBe(true);
      }
    }
  });

  it("keeps every family colour inside the palette's OKLCH chroma ceiling", () => {
    for (const [family, paint] of Object.entries(GARDEN_HULL_FAMILY_PAINT)) {
      expect(oklchOf(paint.timber).C, `${family} timber`).toBeLessThan(0.14);
      expect(oklchOf(paint.trim).C, `${family} trim`).toBeLessThan(0.14);
    }
  });

  it("keys the timber on family: two issuers of one family share it within the brand whisper", () => {
    const timber = GARDEN_HULL_FAMILY_PAINT.kobaya.timber;
    const tether = batched(branded("usdt-tether", HULL_FOR_FAMILY.kobaya, "#2775ca"));
    const circle = batched(branded("usdc-circle", HULL_FOR_FAMILY.kobaya, "#d8b04a"));
    // The whisper lerps channel-wise in the working space, so no channel can
    // sit further than 0.12 from the family timber.
    expect(maxChannelDistance(tether.hullColor, timber)).toBeLessThanOrEqual(0.12 + 1e-6);
    expect(maxChannelDistance(circle.hullColor, timber)).toBeLessThanOrEqual(0.12 + 1e-6);
    // The whisper carries real issuer dye — a hull is never repainted, but a
    // coin's timber never quite forgets its yard either.
    expect(maxChannelDistance(tether.hullColor, timber)).toBeGreaterThan(0);
    expect(tether.hullColor.getHexString()).not.toBe(circle.hullColor.getHexString());
  });

  it("gives six families six distinct timbers under a single issuer", () => {
    const hulls = Object.values(HULL_FOR_FAMILY)
      .map((hull) => batched(branded(`coin-${hull}`, hull, "#2775ca")));
    const hexes = new Set(hulls.map((visual) => visual.hullColor.getHexString()));
    expect(hexes.size).toBe(GARDEN_HULL_SILHOUETTES.length);
  });

  it("keeps the sheer strake carrying the issuer's colour, not the family's", () => {
    const primary = "#2775ca";
    const kobaya = batched(branded("usdt-tether", HULL_FOR_FAMILY.kobaya, primary));
    const junk = batched(branded("eth-issuer", HULL_FOR_FAMILY.junk, primary));
    expect(kobaya.trimColor.getHexString()).toBe(new Color(primary).getHexString());
    // Same issuer, different family: same rail, different timber.
    expect(junk.trimColor.getHexString()).toBe(kobaya.trimColor.getHexString());
    expect(junk.hullColor.getHexString()).not.toBe(kobaya.hullColor.getHexString());
    // A different issuer repaints the rail.
    const otherYard = batched(branded("usdt-tether", HULL_FOR_FAMILY.kobaya, "#d8b04a"));
    expect(otherYard.trimColor.getHexString()).toBe(new Color("#d8b04a").getHexString());
  });

  it("paints an unbranded ship's strake in her family's trim", () => {
    const kobaya = batched(ship("ghost", HULL_FOR_FAMILY.kobaya, "major"));
    const junk = batched(ship("wraith", HULL_FOR_FAMILY.junk, "major"));
    expect(kobaya.trimColor.getHexString())
      .toBe(GARDEN_HULL_FAMILY_PAINT.kobaya.trim.getHexString());
    expect(junk.trimColor.getHexString())
      .toBe(GARDEN_HULL_FAMILY_PAINT.junk.trim.getHexString());
    expect(kobaya.trimColor.getHexString()).not.toBe(junk.trimColor.getHexString());
  });
});

describe("2026-09-07 T1.9: sail bands land on the cloth grid", () => {
  /**
   * The baked cloth bands are vertex color on a
   * GARDEN_SAIL_SEGMENTS_U x GARDEN_SAIL_SEGMENTS_V grid, so a band that falls
   * between two rows is sampled by neither and renders as EXACTLY nothing.
   * That is how three of five junk battens and both reef bands were invisible
   * on every sail in the fleet before T1.9 — the constants existed, the shading
   * never did. This test is the regression: it reads the built cloth, not the
   * table, so re-siting a band off-row fails here even if the constant looks
   * plausible.
   */
  function rowDarkening(geometry: BufferGeometry): Map<number, number> {
    const uv = geometry.getAttribute("uv");
    const color = geometry.getAttribute("color");
    // u = 0 is the mast edge: no seam, no belly falloff. Whatever darkening
    // survives there is a horizontal band and nothing else.
    const byRow = new Map<number, number>();
    for (let index = 0; index < uv.count; index += 1) {
      if (uv.getX(index) > 1e-6) continue;
      const row = Math.round(uv.getY(index) * GARDEN_SAIL_SEGMENTS_V);
      byRow.set(row, Math.max(byRow.get(row) ?? 0, 1 - color.getX(index)));
    }
    return byRow;
  }

  it("darkens exactly the five interior rows of a junk sail, one batten each", () => {
    const source = createFleetBatchGeometry("junk");
    const byRow = rowDarkening(source.sails);
    expect([...byRow.keys()].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const row of [1, 2, 3, 4, 5]) {
      // One batten's full depth, not two overlapping and not a fraction of one:
      // the falloff is under the row pitch, so no row sees a neighbour's band.
      expect(byRow.get(row), `junk row ${row}`).toBeCloseTo(0.18, 6);
    }
    // Head and foot rows stay clear so the yard and the boom read as edges.
    for (const row of [0, 6]) expect(byRow.get(row), `junk row ${row}`).toBe(0);
    source.hull.dispose();
    source.sails.dispose();
  });

});

import {
  BoxGeometry,
  CanvasTexture,
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
import { GARDEN_HULL_SILHOUETTES } from "../systems/garden-observatory-slice";
import { gardenShipWaterMarginTiles } from "../systems/garden-water-exclusion";
import { SHIP_HULL_FORM_SPAN } from "../systems/world-types";
import type { ShipHull, ShipNode, ShipSizeTier } from "../systems/world-types";
import {
  assignGardenHeroSailAtlas,
  attachGardenHeroModel,
  createFleetBatchGeometry,
  createFleetLanterns,
  createShip,
  gardenShipVisualScale,
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

  it("keeps report-card fittings on a hero when its model attaches", () => {
    const node = ship("fitted", "treasury-galleon", "titan");
    node.visual.hullForm = { beam: 1, fittingCode: 19, height: 1, length: 1, waterline: 0 };
    const visual = build(node);
    const fittings = visual.root.getObjectByName("ship-seaworthiness-fittings");
    expect(fittings).toBeInstanceOf(Mesh);
    attachGardenHeroModel(visual, heroFixture("garden-hero-titan"));
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

  it("shares the fleet mark atlas with hero identity sails", () => {
    const visual = build(ship("t", "treasury-galleon", "titan"));
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

function heroFixture(id: "garden-hero-titan" | "garden-hero-heritage"): Group {
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
    // Static GLB parts collapse to one solid draw plus one canvas draw.
    expect(model.children.filter((child) => child instanceof Mesh)).toHaveLength(1);
    expect(model.getObjectByName("hero-merged-solid")).toBeInstanceOf(Mesh);
    expect(attachedWood.parent).toBeNull();
    expect(woodGeometry).toBeDefined();
    expect(sharedMaterial).toBeDefined();
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

  it("carries restrained wabi value and age patina onto hero wood, never sails", () => {
    const node = ship("old", "treasury-galleon", "titan");
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
    const model = heroFixture("garden-hero-titan");
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
  it("keeps every family's maximum deformed x reach inside its water clearance", () => {
    for (const silhouette of GARDEN_HULL_SILHOUETTES) {
      const source = createFleetBatchGeometry(silhouette);
      source.hull.computeBoundingBox();
      const box = source.hull.boundingBox!;
      const undeformedReach = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
      const requiredTiles = undeformedReach * (1 + SHIP_HULL_FORM_SPAN) / Math.SQRT2;
      const clearanceTiles = gardenShipWaterMarginTiles(1, silhouette);

      expect(clearanceTiles, silhouette).toBeGreaterThanOrEqual(requiredTiles);
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

import {
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_LIGHTHOUSE_ROOT_OFFSET } from "../systems/garden-observatory-slice";
import { GARDEN_ISLAND_OBSTACLE } from "../systems/garden-water-exclusion";
import type { PharosVilleWorld } from "../systems/world-types";
import { weatherForFrame } from "../systems/weather";
import {
  createTerracedIsland,
  GARDEN_PATH_SWEEP_POINTS,
  GARDEN_POND_REFLECTION_AXES,
  GARDEN_POND_CENTER,
  GARDEN_NIWAKI_SPECS,
  GARDEN_ISLAND_STONE_GROUPINGS,
  GARDEN_QUAY_STAIR_HEAD,
  GARDEN_QUAY_STAIR_TOP_Y,
  gardenIslandLanternWorldOffsets,
  gardenPrecinctObeliskGateposts,
  mergeIslandStatics,
  updateGardenNiwakiWind,
} from "./garden-island";
import { createGardenOverviewLod } from "./garden-overview-lod";
import { applyGardenHeightFog } from "./garden-height-fog";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { GARDEN_MOON_AZIMUTH } from "./garden-sun";
import { countDrawableObjects, TILE_SCALE } from "./garden-util";

const world = {
  lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" },
} as unknown as PharosVilleWorld;

describe("garden island rockwork", () => {
  it("authors one continuous S-curve from the quay stair to the pavilion", () => {
    expect(GARDEN_PATH_SWEEP_POINTS[0]).toEqual(GARDEN_QUAY_STAIR_HEAD);
    expect(GARDEN_PATH_SWEEP_POINTS.at(-1)).toEqual({ x: 4.4, z: 2.35 });
    const turns = GARDEN_PATH_SWEEP_POINTS.slice(2).map((point, index) => {
      const a = GARDEN_PATH_SWEEP_POINTS[index]!;
      const b = GARDEN_PATH_SWEEP_POINTS[index + 1]!;
      return (b.x - a.x) * (point.z - b.z) - (b.z - a.z) * (point.x - b.x);
    });
    expect(turns.some((turn) => turn < 0)).toBe(true);
    expect(turns.some((turn) => turn > 0)).toBe(true);

    const island = createTerracedIsland(world);
    const path = island.root.getObjectByName("island-path-sweep") as Mesh;
    expect(path).toBeInstanceOf(Mesh);
    expect(path.geometry.getAttribute("position").count).toBeGreaterThan(100);
    expect(path.geometry.index!.count).toBeGreaterThan(300);
    expect(path.receiveShadow).toBe(true);
  });

  it("merges matching static meshes with vertex colour and height fog", () => {
    const root = new Group();
    const warm = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#c58a61", flatShading: true, roughness: 0.9 }),
    );
    const cool = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#617fa5", flatShading: true, roughness: 0.9 }),
    );
    cool.position.x = 3;
    for (const mesh of [warm, cool]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    root.position.set(30, 5, -11);
    const pond = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#315f60", flatShading: true, roughness: 0.9 }),
    );
    pond.name = "island-reflection-pond-skin";
    const shadowSplit = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#6d715d", flatShading: true, roughness: 0.9 }),
    );
    shadowSplit.name = "shadow-split-static";
    const textured = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({
        color: "#8a8d78",
        flatShading: true,
        roughness: 0.9,
        roughnessMap: new DataTexture(),
      }),
    );
    textured.name = "textured-static";
    const explicitKeep = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#8a8d78", flatShading: true, roughness: 0.9 }),
    );
    explicitKeep.name = "explicit-keep-static";
    explicitKeep.userData.gardenKeepSeparate = true;
    const shaderPatched = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#6d715d", flatShading: true, roughness: 0.9 }),
    );
    shaderPatched.name = "shader-patched-static";
    shaderPatched.material.onBeforeCompile = () => {};
    const planting = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#617fa5", flatShading: true, roughness: 0.9 }),
      2,
    );
    planting.name = "island-tree-crowns";
    const hiddenWarm = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#927057", flatShading: true, roughness: 0.84 }),
    );
    const hiddenCool = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#667b91", flatShading: true, roughness: 0.84 }),
    );
    hiddenWarm.visible = false;
    hiddenCool.visible = false;
    const layeredWarm = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#886d55", flatShading: true, roughness: 0.82 }),
    );
    const layeredCool = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#64788d", flatShading: true, roughness: 0.82 }),
    );
    layeredWarm.layers.set(3);
    layeredCool.layers.set(3);
    root.add(
      warm,
      cool,
      pond,
      shadowSplit,
      textured,
      explicitKeep,
      shaderPatched,
      planting,
      hiddenWarm,
      hiddenCool,
      layeredWarm,
      layeredCool,
    );
    applyGardenHeightFog(root);

    const before = countDrawableObjects(root);
    const result = mergeIslandStatics(root);
    const after = countDrawableObjects(root);
    const merged = root.getObjectByName("island-merged-0") as Mesh;

    expect(result.merged).toBe(3);
    expect(result.kept).toBe(after);
    expect(after).toBe(before - 3);
    expect(merged.castShadow).toBe(true);
    expect(merged.receiveShadow).toBe(true);
    expect((merged.material as MeshStandardMaterial).vertexColors).toBe(true);
    expect((merged.material as MeshStandardMaterial).userData.gardenHeightFog).toBe(true);
    expect(root.getObjectByName("island-reflection-pond-skin")).toBe(pond);
    expect(root.getObjectByName("shadow-split-static")).toBe(shadowSplit);
    expect(root.getObjectByName("textured-static")).toBe(textured);
    expect(root.getObjectByName("explicit-keep-static")).toBe(explicitKeep);
    expect(root.getObjectByName("shader-patched-static")).toBe(shaderPatched);
    expect(root.getObjectByName("island-tree-crowns")).toBe(planting);
    const colors = merged.geometry.getAttribute("color");
    expect(new Set(Array.from({ length: colors.count }, (_, index) => (
      new Color(colors.getX(index), colors.getY(index), colors.getZ(index)).getHex()
    )))).toEqual(new Set([warm.material.color.getHex(), cool.material.color.getHex()]));
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox!.min.x).toBeCloseTo(-0.5);
    expect(merged.geometry.boundingBox!.max.x).toBeCloseTo(3.5);
    const mergedMeshes = root.children.filter((child): child is Mesh => (
      child instanceof Mesh && child.name.startsWith("island-merged-")
    ));
    expect(mergedMeshes.some((mesh) => mesh.visible === false)).toBe(true);
    expect(mergedMeshes.some((mesh) => mesh.layers.mask === 1 << 3)).toBe(true);
  });

  it("automatically merges island statics and never touches the four large reads", () => {
    const island = createTerracedIsland(world);
    const after = countDrawableObjects(island.root);
    const secondPass = mergeIslandStatics(island.root);
    expect(secondPass.merged).toBe(0);
    expect(secondPass.kept).toBe(after);
    expect(countDrawableObjects(island.root)).toBe(after);
    // 77 is the measured pre-merge baseline; changing it is a deliberate budget decision.
    expect(after).toBeLessThan(77);
    // Wave 5 is subtractive: the prior island held 61 drawables after merge.
    expect(after).toBeLessThanOrEqual(55);
    for (const name of ["island-reflection-pond-skin", "island-path-sweep", "island-niwaki-pads", "island-danger-rock-face"]) {
      expect(island.root.getObjectByName(name), name).toBeDefined();
    }
  });

  it("re-skins the terraces as vertex-coloured stone that casts shadow", () => {
    const island = createTerracedIsland(world);
    const tiers: Mesh[] = [];
    island.root.traverse((object) => {
      if (
        object instanceof Mesh
        && object.name !== "island-path-sweep"
        && object.material instanceof MeshStandardMaterial
        && object.material.roughnessMap instanceof DataTexture
        && object.material.vertexColors
        && object.geometry.getAttribute("color")
      ) {
        tiers.push(object);
      }
    });
    expect(tiers.length).toBeGreaterThanOrEqual(4);
    for (const tier of tiers) {
      expect(tier.material).toBeInstanceOf(MeshStandardMaterial);
      expect((tier.material as MeshStandardMaterial).flatShading).toBe(true);
      expect(tier.castShadow).toBe(true);
      expect(tier.receiveShadow).toBe(true);
    }
  });

  it("grades the island from a dark wet waterline to a pale crown", () => {
    const island = createTerracedIsland(world);
    const samples: { worldY: number; luminance: number }[] = [];
    island.root.traverse((object) => {
      if (
        !(object instanceof Mesh)
        || !(object.material instanceof MeshStandardMaterial)
        || !object.material.vertexColors
      ) {
        return;
      }
      const colors = object.geometry.getAttribute("color");
      const positions = object.geometry.getAttribute("position");
      if (!colors || !positions) return;
      for (let index = 0; index < colors.count; index += 1) {
        samples.push({
          worldY: object.position.y + positions.getY(index),
          luminance: 0.2126 * colors.getX(index)
            + 0.7152 * colors.getY(index)
            + 0.0722 * colors.getZ(index),
        });
      }
    });
    samples.sort((a, b) => a.worldY - b.worldY);
    const band = Math.max(1, Math.floor(samples.length * 0.12));
    const mean = (slice: typeof samples) => (
      slice.reduce((sum, s) => sum + s.luminance, 0) / slice.length
    );
    const wet = mean(samples.slice(0, band));
    const crown = mean(samples.slice(-band));
    // Wet base must read clearly darker than the pale weathered crown.
    expect(wet).toBeLessThan(crown);
    expect(crown - wet).toBeGreaterThan(0.08);
  });

  it("sheds the fortress and shoreline clutter from the rendered rock", () => {
    const island = createTerracedIsland(world);
    for (const name of [
      "island-shoreline-boulders",
      "pharos-sea-wall",
      "pharos-sunken-column-drums",
      "island-cliff-talus",
      "island-sea-cliffs",
      "island-stepping-stones",
    ]) {
      expect(island.root.getObjectByName(name), name).toBeUndefined();
    }
  });

  it("groups upland stones into Sakuteiki triads with one dominant vertical", () => {
    // Odd-numbered clusters, exactly one dominant ("father") stone each, and
    // the dominant always out-scales its subordinates.
    for (const triad of GARDEN_ISLAND_STONE_GROUPINGS) {
      expect(triad.length % 2).toBe(1);
      const dominants = triad.filter((stone) => stone.dominant);
      expect(dominants).toHaveLength(1);
      const dominant = dominants[0]!;
      for (const stone of triad) {
        if (stone === dominant) continue;
        expect(stone.scale).toBeLessThan(dominant.scale * 0.75);
      }
    }
    const island = createTerracedIsland(world);
    let stones: InstancedMesh | null = null;
    island.decoration.traverse((object) => {
      if (
        object instanceof InstancedMesh
        && object.count === GARDEN_ISLAND_STONE_GROUPINGS.flat().length
      ) {
        stones = object;
      }
    });
    expect(stones).toBeInstanceOf(InstancedMesh);
  });

  it("leaves the keeper cottage its lit window and nothing else that glows", () => {
    // W3.1: the paper-lantern string is deleted, not dimmed. One light per
    // building — the window says the keeper is home, and three more warm
    // points beside it said nothing at all.
    const island = createTerracedIsland(world);
    expect(island.root.getObjectByName("keeper-cottage-lantern-string")).toBeUndefined();
    expect(island.root.getObjectByName("keeper-cottage-lanterns")).toBeUndefined();
    const cottage = island.root.getObjectByName("keeper-cottage")!;
    const glowing: Mesh[] = [];
    cottage.traverse((object) => {
      if (
        object instanceof Mesh
        && object.material instanceof MeshStandardMaterial
        && object.material.emissiveIntensity > 0
        && object.material.emissive.getHex() !== 0
      ) glowing.push(object);
    });
    expect(glowing.map((mesh) => mesh.name)).toEqual(["keeper-cottage-lit-window"]);
  });

  it("stands the obelisk pair as the quay stair's gateposts, unequally", () => {
    // Merged into the stair composition rather than standing free: both posts
    // flank the stair head, squared to the flight, and the pair is deliberately
    // mismatched (fukinsei).
    const posts = gardenPrecinctObeliskGateposts();
    expect(posts).toHaveLength(2);
    const [left, right] = posts as [
      ReturnType<typeof gardenPrecinctObeliskGateposts>[number],
      ReturnType<typeof gardenPrecinctObeliskGateposts>[number],
    ];
    expect(left.scale).not.toBeCloseTo(right.scale);
    // One on each side of the flight, and close enough to it to read as a gate.
    const span = Math.hypot(left.x - right.x, left.z - right.z);
    expect(span).toBeGreaterThan(2.4);
    expect(span).toBeLessThan(4);
    for (const post of posts) {
      expect(Math.hypot(post.x - GARDEN_QUAY_STAIR_HEAD.x, post.z - GARDEN_QUAY_STAIR_HEAD.z))
        .toBeLessThan(2.2);
      // Seated in the rock, not floating over it or buried in it.
      expect(post.y).toBeLessThan(GARDEN_QUAY_STAIR_TOP_Y + 0.2);
      expect(post.y).toBeGreaterThan(GARDEN_QUAY_STAIR_TOP_Y - 1.4);
    }
    // And they are actually built there.
    const island = createTerracedIsland(world);
    const stone = island.root.getObjectByName("pharos-obelisk-stone") as Mesh;
    expect(stone).toBeInstanceOf(Mesh);
    stone.geometry.computeBoundingBox();
    const box = stone.geometry.boundingBox!;
    expect(box.min.x).toBeLessThan(GARDEN_QUAY_STAIR_HEAD.x + 1);
    expect(box.max.x).toBeGreaterThan(GARDEN_QUAY_STAIR_HEAD.x - 1);
    expect(box.min.z).toBeLessThan(GARDEN_QUAY_STAIR_HEAD.z);
    expect(box.max.z).toBeGreaterThan(GARDEN_QUAY_STAIR_HEAD.z);
  });

  it("leaves the terrace surface empty instead of drawing a lamp ring", () => {
    const island = createTerracedIsland(world);
    expect(island.root.getObjectByName("island-terrace-lanterns")).toBeUndefined();
    expect(island.root.getObjectByName("island-terrace-lantern-lamps")).toBeUndefined();
    expect(gardenIslandLanternWorldOffsets()).toHaveLength(2);
  });

  it("applies the shared cloud-shadow source only when it is passed", () => {
    const plain = createTerracedIsland(world);
    expect(cloudHookedMaterialCount(plain.root)).toBe(0);

    const shaded = createTerracedIsland(world, mockCloudShadowSource());
    expect(cloudHookedMaterialCount(shaded.root)).toBeGreaterThan(10);
  });

  it("instances the path lanterns with blooming emissive lamps", () => {
    const island = createTerracedIsland(world);
    const lamps = island.decoration.getObjectByName("island-lantern-lamps");
    expect(lamps).toBeInstanceOf(InstancedMesh);
    const offsets = gardenIslandLanternWorldOffsets();
    expect((lamps as InstancedMesh).count).toBe(offsets.length);
    const material = (lamps as InstancedMesh).material as MeshStandardMaterial;
    expect(material.toneMapped).toBe(false);
    expect(material.emissiveIntensity).toBeGreaterThan(1);
  });

  it("keeps the stair and consolidated Danger face inside the island contract", () => {
    // `GARDEN_ISLAND_OBSTACLE` is what stops hulls mooring on the island, and
    // it is calibrated against the bottom terrace — local centre (0.6, 1.2),
    // see that module's header. Anything the W4.9 detail pass added must stay
    // inside it, or the footprint has grown without the obstacle growing and
    // ships will clip land.
    const island = createTerracedIsland(world);
    const added = [
      "island-danger-rock-face",
      "island-quay-stair-treads",
      "island-quay-stair-cheeks",
    ];
    for (const name of added) {
      const mesh = island.root.getObjectByName(name);
      expect(mesh, name).toBeInstanceOf(Mesh);
      expect(maxObstacleEllipseValue(mesh as Mesh), name).toBeLessThanOrEqual(1.08);
    }
    const face = island.root.getObjectByName("island-danger-rock-face") as InstancedMesh;
    for (const point of instancePositions(face)) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.z).toBeLessThan(0);
    }
  });

  it("keeps the niwaki landscape at authored size through default and whole-map zoom", () => {
    const island = createTerracedIsland(world);
    const grove = island.root.getObjectByName("island-niwaki")!;
    const position = grove.position.clone();
    const scale = grove.scale.clone();
    const lod = createGardenOverviewLod(island.root);
    for (const zoom of [0.50184, 0.28, 0.648]) {
      lod.update({ zoom, reducedMotion: true, deltaSeconds: 0 });
      expect(grove.visible).toBe(true);
      expect(grove.position).toEqual(position);
      expect(grove.scale).toEqual(scale);
    }
  });

  it("leaves bare terrace instead of a shrub and grass carpet", () => {
    const island = createTerracedIsland(world);
    expect(island.root.getObjectByName("island-planting")).toBeUndefined();
    expect(island.root.getObjectByName("island-shrubs")).toBeUndefined();
    expect(island.root.getObjectByName("island-grass-tufts")).toBeUndefined();
  });

  it("keeps a restrained seasonal record inside the pine mass", () => {
    const summer = createTerracedIsland(world, undefined, "summer")
      .root.getObjectByName("island-niwaki-pads") as InstancedMesh;
    const autumn = createTerracedIsland(world, undefined, "autumn")
      .root.getObjectByName("island-niwaki-pads") as InstancedMesh;
    const changed = Array.from({ length: summer.count }, (_, index) => (
      summer.getColorAt(index, new Color()).getHex()
      !== autumn.getColorAt(index, new Color()).getHex()
    )).filter(Boolean).length;
    expect(changed).toBe(GARDEN_NIWAKI_SPECS.at(-1)!.pads.length);
  });

  it("instances five unequal niwaki into a two-draw hero mass", () => {
    expect(GARDEN_NIWAKI_SPECS).toHaveLength(5);
    for (const pine of GARDEN_NIWAKI_SPECS) {
      expect(pine.pads.length).toBeGreaterThanOrEqual(3);
      expect(pine.pads.length).toBeLessThanOrEqual(5);
      expect(pine.pads.length % 2).toBe(1);
      expect(new Set(pine.pads.map((pad) => pad.scaleX)).size).toBe(pine.pads.length);
    }
    expect(new Set(GARDEN_NIWAKI_SPECS.map((pine) => pine.height)).size).toBe(5);
    // Exactly one hero stands on the rock and reaches beyond its -x/+z
    // waterline: the lower-left, camera-side overhang requested by the plan.
    const waterlineValue = (x: number, z: number) => (
      ((x - 0.6) / 18.4) ** 2 + ((z - 1.2) / 13.8) ** 2
    );
    const foreground = GARDEN_NIWAKI_SPECS[0]!;
    expect(waterlineValue(foreground.x, foreground.z)).toBeLessThan(1);
    expect(waterlineValue(
      foreground.x + foreground.leanX,
      foreground.z + foreground.leanZ,
    )).toBeGreaterThan(1);
    const overhangs = GARDEN_NIWAKI_SPECS.filter((pine) => waterlineValue(
      pine.x + pine.leanX,
      pine.z + pine.leanZ,
    ) > 1);
    expect(overhangs).toEqual([foreground]);

    const island = createTerracedIsland(world);
    const grove = island.root.getObjectByName("island-niwaki");
    expect(grove).toBeDefined();
    expect(grove!.children.map((child) => child.name)).toEqual([
      "island-niwaki-trunks",
      "island-niwaki-pads",
    ]);
    expect(grove!.children.every((child) => child instanceof InstancedMesh)).toBe(true);
    expect((grove!.getObjectByName("island-niwaki-pads") as InstancedMesh).count)
      .toBe(GARDEN_NIWAKI_SPECS.reduce((sum, pine) => sum + pine.pads.length, 0));
    const pads = grove!.getObjectByName("island-niwaki-pads") as InstancedMesh<BufferGeometry, MeshStandardMaterial>;
    expect(pads.geometry.getAttribute("aGardenSway").count).toBe(pads.count);
    const weather = weatherForFrame({ baseWind: 0.5, psiStress: 0.2, timeSeconds: 2 });
    updateGardenNiwakiWind(island.decoration, weather, false);
    const uniforms = pads.material.userData.gardenWindSwayUniforms as {
      uGardenWindStrength: { value: number };
    };
    expect(uniforms.uGardenWindStrength.value).toBeGreaterThan(0);
  });

  it("scales every niwaki trunk and branch to its authored endpoint distance", () => {
    const authoredPoint = (pine: (typeof GARDEN_NIWAKI_SPECS)[number], t: number) => {
      const bend = t * t * (1.08 - t * 0.08);
      return new Vector3(
        pine.x + pine.leanX * bend,
        pine.height * t,
        pine.z + pine.leanZ * bend,
      );
    };
    const expectedLengths = GARDEN_NIWAKI_SPECS.flatMap((pine) => {
      const nodes = [0, 0.23, 0.46, 0.68, 0.84, 1].map((t) => authoredPoint(pine, t));
      const trunkLengths = nodes.slice(1).map((node, index) => node.distanceTo(nodes[index]!));
      const branchLengths = pine.pads.map((pad) => {
        const stem = authoredPoint(pine, Math.max(0.25, pad.t - 0.08));
        const centre = authoredPoint(pine, pad.t)
          .add(new Vector3(pad.offsetX, 0, pad.offsetZ));
        return stem.distanceTo(centre);
      });
      return [...trunkLengths, ...branchLengths];
    });
    expect(Math.max(...expectedLengths)).toBeGreaterThan(1.1);

    const island = createTerracedIsland(world);
    const trunks = island.root.getObjectByName("island-niwaki-trunks") as InstancedMesh;
    expect(trunks.count).toBe(expectedLengths.length);
    expectedLengths.forEach((expected, index) => {
      const matrix = new Matrix4();
      trunks.getMatrixAt(index, matrix);
      const yScale = new Vector3().setFromMatrixColumn(matrix, 1).length();
      expect(yScale).toBeCloseTo(expected, 3);
    });
  });

  it("builds one deterministic gravel ribbon with coarse raked relief", () => {
    const first = createTerracedIsland(world).root.getObjectByName("island-path-sweep") as Mesh;
    const second = createTerracedIsland(world).root.getObjectByName("island-path-sweep") as Mesh;
    expect(first).toBeInstanceOf(Mesh);
    const positions = first.geometry.getAttribute("position");
    const colors = first.geometry.getAttribute("color");
    expect(positions.count).toBeGreaterThan(100);
    expect(colors.count).toBe(positions.count);
    expect(Array.from(colors.array)).toEqual(Array.from(second.geometry.getAttribute("color").array));
    const material = first.material as MeshStandardMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.roughness).toBe(1);
    expect(material.normalMap).toBeInstanceOf(DataTexture);
    expect(positions.count).toBe(first.geometry.getAttribute("uv").count);
    const island = createTerracedIsland(world);
    const mossRock = island.root.children.find((child) => (
      child instanceof Mesh
      && child.material instanceof MeshStandardMaterial
      && child.material.roughnessMap instanceof DataTexture
    )) as Mesh | undefined;
    expect(mossRock).toBeDefined();
    // The rake is actual relief, not a flat colour decal.
    const fractionalHeights = Array.from({ length: positions.count }, (_, index) => (
      positions.getY(index) - Math.floor(positions.getY(index) * 10) / 10
    ));
    expect(Math.max(...fractionalHeights) - Math.min(...fractionalHeights)).toBeGreaterThan(0.025);
  });

  it("paints the tower and moon analytically into the existing pond draw", () => {
    const island = createTerracedIsland(world, mockCloudShadowSource());
    const skins: Mesh[] = [];
    island.root.traverse((object) => {
      if (object.name === "island-reflection-pond-skin" && object instanceof Mesh) skins.push(object);
    });
    expect(skins).toHaveLength(1);
    // The image is injected into that one standard pond material: no planar
    // target, reflection pass, texture, or second reflection mesh is built.
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>\n#include <project_vertex>",
      fragmentShader: "#include <common>\n#include <lights_fragment_end>\n#include <opaque_fragment>\n#include <fog_fragment>",
    };
    const material = skins[0]!.material as MeshStandardMaterial;
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.vertexShader).toContain("vGardenPondPosition = position.xy");
    expect(shader.fragmentShader).toContain("float tm=");
    expect(shader.fragmentShader).toContain("float mm=");
    // The existing shared atmosphere hooks still compose around the pond ink.
    expect(shader.fragmentShader).toContain("gardenApplyHeightFog");
    expect(shader.fragmentShader).toContain("gardenCloudLight");
  });

  it("aims the pond image at the real tower and the canonical moon arc", () => {
    expect(GARDEN_POND_REFLECTION_AXES.tower.length()).toBeCloseTo(1);
    expect(GARDEN_POND_REFLECTION_AXES.moon.length()).toBeCloseTo(1);
    // The tower is west of the pond; its local reflection axis must point
    // strongly left rather than becoming a generic camera-aligned stripe.
    expect(GARDEN_POND_REFLECTION_AXES.tower.x).toBeLessThan(-0.8);
    const derivedTower = testPondLocalAxis(
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.x - GARDEN_POND_CENTER.x,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.z - GARDEN_POND_CENTER.z,
    );
    const derivedMoon = testPondLocalAxis(
      Math.cos(GARDEN_MOON_AZIMUTH),
      Math.sin(GARDEN_MOON_AZIMUTH),
    );
    expect(GARDEN_POND_REFLECTION_AXES.tower.distanceTo(derivedTower)).toBeLessThan(0.00001);
    expect(GARDEN_POND_REFLECTION_AXES.moon.distanceTo(derivedMoon)).toBeLessThan(0.00001);
    const island = createTerracedIsland(world);
    const material = island.root.getObjectByName("island-reflection-pond-skin") as Mesh;
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <worldpos_vertex>\n#include <project_vertex>",
      fragmentShader: "#include <common>\n#include <opaque_fragment>\n#include <fog_fragment>",
    };
    (material.material as MeshStandardMaterial).onBeforeCompile(shader as never, null as never);
    const strength = shader.uniforms.uGardenPondStrength.value as Vector2;
    island.pondReflection.update({ daylight: 1, dusk: 0, night: 0 });
    const day = strength.clone();
    island.pondReflection.update({ daylight: 0, dusk: 1, night: 0 });
    const dusk = strength.clone();
    island.pondReflection.update({ daylight: 0, dusk: 0, night: 1 });
    const night = strength.clone();
    expect(day.y).toBe(0);
    expect(dusk.x).toBeGreaterThan(day.x);
    expect(dusk.x).toBeGreaterThan(night.x);
    expect(night.y).toBeGreaterThan(dusk.y);
  });

  it("exports lamp offsets lifted to the lamp height for lane registration", () => {
    const offsets = gardenIslandLanternWorldOffsets();
    expect(offsets).toHaveLength(2);
    for (const offset of offsets) {
      expect(offset.y).toBeGreaterThan(1);
    }
  });
});

// The exclusion ellipse expressed in island-root-local world units.
const OBSTACLE_LOCAL = {
  cx: 0.6,
  cz: 1.2,
  rx: GARDEN_ISLAND_OBSTACLE.rx * TILE_SCALE,
  rz: GARDEN_ISLAND_OBSTACLE.ry * TILE_SCALE,
};

/**
 * Worst ellipse value over a mesh's transformed geometry bounds — every
 * instance for an InstancedMesh. < 1 means fully inside the obstacle. Every
 * mesh checked here hangs off a group seated at the island root's origin, so
 * the instance matrices are already island-local.
 */
function maxObstacleEllipseValue(mesh: Mesh): number {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) throw new Error(`${mesh.name} has no bounding box.`);
  const corners: Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x, y, z));
    }
  }
  const matrices: Matrix4[] = [];
  if (mesh instanceof InstancedMesh) {
    for (let index = 0; index < mesh.count; index += 1) {
      const matrix = new Matrix4();
      mesh.getMatrixAt(index, matrix);
      matrices.push(matrix);
    }
  } else {
    matrices.push(new Matrix4());
  }
  const point = new Vector3();
  let worst = 0;
  for (const matrix of matrices) {
    for (const corner of corners) {
      point.copy(corner).applyMatrix4(matrix);
      worst = Math.max(
        worst,
        ((point.x - OBSTACLE_LOCAL.cx) / OBSTACLE_LOCAL.rx) ** 2
          + ((point.z - OBSTACLE_LOCAL.cz) / OBSTACLE_LOCAL.rz) ** 2,
      );
    }
  }
  return worst;
}

/** Island-local XZ of every instance in an instanced mesh. */
function instancePositions(mesh: InstancedMesh): { x: number; z: number }[] {
  const matrix = new Matrix4();
  const points: { x: number; z: number }[] = [];
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    points.push({ x: position.x, z: position.z });
  }
  return points;
}

function cloudHookedMaterialCount(root: import("three").Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.userData.gardenCloudShadows) count += 1;
    }
  });
  return count;
}

function mockCloudShadowSource(): GardenCloudShadowSource {
  const texture = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
  return {
    texture,
    uniforms: {
      uCloudShadow: { value: texture },
      uCloudShadowTransform: { value: [1 / 170, 1 / 170, 0, 0] },
      uCloudShadowStrength: { value: 0.3 },
    },
    update: () => {},
  };
}

function testPondLocalAxis(worldX: number, worldZ: number): Vector2 {
  const yaw = -0.18;
  return new Vector2(
    Math.cos(yaw) * worldX - Math.sin(yaw) * worldZ,
    -Math.sin(yaw) * worldX - Math.cos(yaw) * worldZ,
  ).normalize();
}

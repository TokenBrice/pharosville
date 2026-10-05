import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  DataTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RGBAFormat,
  ShaderLib,
  Raycaster,
  type IUniform,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi, type Mock } from "vitest";
import { GARDEN_LIGHTHOUSE_ROOT_OFFSET, GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { GARDEN_ISLAND_OBSTACLE } from "../systems/garden-water-exclusion";
import type { PharosVilleWorld } from "../systems/world-types";
import { weatherForFrame } from "../systems/weather";
import {
  createTerracedIsland,
  createGardenChaseki,
  GARDEN_CHASEKI_ANCHORS,
  GARDEN_CHASEKI_FEET,
  GARDEN_CRAG_HEADLAND_NAME,
  GARDEN_PATH_HALF_WIDTH,
  GARDEN_PATH_SWEEP_POINTS,
  GARDEN_POND_REFLECTION_AXES,
  gardenPondMoonImage,
  GARDEN_POND_CENTER,
  GARDEN_POND_RADIUS,
  GARDEN_NIWAKI_SPECS,
  GARDEN_ISLAND_STONE_GROUPINGS,
  GARDEN_QUAY_STAIR_LANDING,
  gardenIslandLanternMaterial,
  gardenLandingStonePerch,
  gardenIslandLanternWorldOffsets,
  gardenIslandPlantingAt,
  ISLAND_LANTERN_DAY_EMBER,
  ISLAND_LANTERN_LAMP_NAME,
  islandTerrainHeight,
  mergeIslandStatics,
  updateGardenNiwakiWind,
} from "./garden-island";
import { createGardenOverviewLod } from "./garden-overview-lod";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { countDrawableObjects, disposeThreeObjectTree, TILE_SCALE } from "./garden-util";
import type { GardenSurfaceAtlasLease, GardenSurfaceAtlasOwner } from "./garden-surface-atlas";
import {
  GARDEN_SURFACE_ROLE_ATTRIBUTE,
  GARDEN_SURFACE_ROLE_CODES,
  GARDEN_SURFACE_WEIGHT_ATTRIBUTE,
  type GardenSurfaceMetadata,
} from "./garden-surfaces";

const world = {
  lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" },
} as unknown as PharosVilleWorld;

describe("garden island rockwork", () => {
  it("authors one continuous S-curve from the quay stair's garden landing to the pavilion", () => {
    expect(GARDEN_PATH_SWEEP_POINTS[0]).toEqual(GARDEN_QUAY_STAIR_LANDING);
    expect(GARDEN_PATH_HALF_WIDTH).toBe(2);
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
    // 42 merged draws: W1.9's single crag headland replaced the three tiers,
    // the three planted shelves and the precinct's cliff box.
    expect(after).toBe(42);
    for (const name of ["island-reflection-pond-skin", "island-path-sweep", "island-niwaki-grove", "island-danger-rock-face"]) {
      expect(island.root.getObjectByName(name), name).toBeDefined();
    }
  });

  it("edges the path with one ō-karikomi wave draw that survives the static merge", () => {
    // garden-8: overlapping clipped wave segments in dark boxwood follow the
    // path's seaward flank — one InstancedMesh.
    const island = createTerracedIsland(world);
    const karikomi = island.root.getObjectByName("island-karikomi");
    expect(karikomi).toBeInstanceOf(InstancedMesh);
    const wave = karikomi as InstancedMesh<BufferGeometry, MeshStandardMaterial>;
    expect(wave.count).toBeGreaterThanOrEqual(12);
    expect(wave.instanceColor, "per-segment tone").not.toBeNull();

    // Solid, textureless, vertex-coloured — never an alpha card: N8AO runs
    // `transparencyAware = false` at half res, so a card occludes as a solid
    // rectangle. The absent roughnessMap is also what keeps the hedge out of
    // the terrace-tier query in the next test.
    expect(wave.material.transparent).toBe(false);
    expect(wave.material.roughnessMap).toBeNull();
    expect(wave.material.map).toBeNull();
    expect(wave.material.flatShading).toBe(false);
    expect(wave.castShadow).toBe(true);
    // Without this the merge pass is entitled to swallow the draw.
    expect(wave.userData.gardenKeepSeparate).toBe(true);
    expect(mergeIslandStatics(island.root).merged).toBe(0);
    expect(island.root.getObjectByName("island-karikomi")).toBe(wave);
    // Not a dome: a low wave segment, long along the path.
    wave.geometry.computeBoundingBox();
    const extent = wave.geometry.boundingBox!.getSize(new Vector3());
    expect(extent.y).toBeLessThan(extent.x * 0.25);
    const halfWidth = extent.z / 2;
    const pathSamples = new CatmullRomCurve3(
      GARDEN_PATH_SWEEP_POINTS.map(({ x, z }) => new Vector3(x, 0, z)),
      false,
      "centripetal",
    ).getSpacedPoints(1024);

    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const placed: { at: Vector3; length: number }[] = [];
    for (let index = 0; index < wave.count; index += 1) {
      wave.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, scale);
      // Clipped low enough to read as a hedge.
      expect(extent.y * scale.y, `segment ${index} height`).toBeLessThan(0.52);
      expect(position.y, `segment ${index} seated on rock`).toBeGreaterThan(0.5);
      const nearest = Math.min(...pathSamples.map(
        ({ x, z }) => Math.hypot(position.x - x, position.z - z),
      ));
      // The segment's inner flank stays off the gravel.
      expect(nearest - halfWidth * scale.z, `segment ${index} off the gravel`)
        .toBeGreaterThan(GARDEN_PATH_HALF_WIDTH);
      placed.push({ at: position.clone(), length: extent.x * scale.x });
    }
    // A wave, not beads: consecutive segments overlap end to end.
    let overlapping = 0;
    for (let index = 1; index < placed.length; index += 1) {
      const step = placed[index]!.at.distanceTo(placed[index - 1]!.at);
      expect(step, `gap ${index}`).toBeGreaterThan(0);
      if (step < (placed[index]!.length + placed[index - 1]!.length) / 2) overlapping += 1;
    }
    expect(overlapping).toBeGreaterThan(placed.length * 0.6);
  });

  it("puts the stone path lanterns on the day cycle instead of a frozen ember", () => {
    // T0.2 remainder (2026-09-07): the lamps were a hard 1.15 at every hour —
    // the last constant aperture in the world after the station windows and
    // the tower/gatehouse went on curves. The build value is now the DAY end
    // of that curve and `updateDayCycle` owns it from the first frame.
    const island = createTerracedIsland(world);
    const material = gardenIslandLanternMaterial(island.decoration);
    expect(material).not.toBeNull();
    expect(material!.emissiveIntensity).toBe(ISLAND_LANTERN_DAY_EMBER);
    expect(ISLAND_LANTERN_DAY_EMBER).toBe(0.22);
    // `toneMapped: false` is why the night end of the curve has a ~2.2 ceiling.
    expect(material!.toneMapped).toBe(false);
    // One material for both lamps: the day cycle writes it once per frame.
    const lamps = island.root.getObjectByName(ISLAND_LANTERN_LAMP_NAME) as InstancedMesh;
    expect(lamps.count).toBe(2);
    expect(lamps.material).toBe(material);
    // The handle is looked up by name, so a build without one must return null
    // rather than throw — the day cycle no-ops on that.
    expect(gardenIslandLanternMaterial(new Group())).toBeNull();
  });

  it("builds the headland as one smooth-shaded, vertex-coloured rock that casts shadow", () => {
    const island = createTerracedIsland(world);
    const crag = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
    expect(crag).toBeInstanceOf(Mesh);
    const material = crag.material as MeshStandardMaterial;
    // The hand (§1.1): organic masses are smooth-shaded; value comes from the
    // authored planes in vertex colour, not from facets.
    expect(material.flatShading).toBe(false);
    expect(material.vertexColors).toBe(true);
    expect(crag.geometry.getAttribute("color")).toBeDefined();
    expect(crag.castShadow).toBe(true);
    expect(crag.receiveShadow).toBe(true);
    const roles = crag.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
    const weights = crag.geometry.getAttribute(GARDEN_SURFACE_WEIGHT_ATTRIBUTE);
    const positions = crag.geometry.getAttribute("position");
    const indices = crag.geometry.index!;
    expect(roles.count).toBe(positions.count);
    expect(weights.count).toBe(positions.count);
    expect([...new Set(Array.from(roles.array))].sort()).toEqual([
      GARDEN_SURFACE_ROLE_CODES.moss, GARDEN_SURFACE_ROLE_CODES.stone, GARDEN_SURFACE_ROLE_CODES.gravel,
    ]);
    for (const name of ["position", "normal", "color", "uv", GARDEN_SURFACE_ROLE_ATTRIBUTE, GARDEN_SURFACE_WEIGHT_ATTRIBUTE]) {
      expect(Array.from(crag.geometry.getAttribute(name).array).every(Number.isFinite), name).toBe(true);
    }
    for (let face = 0; face < indices.count; face += 3) {
      const role = roles.getX(indices.getX(face));
      expect(roles.getX(indices.getX(face + 1))).toBe(role);
      expect(roles.getX(indices.getX(face + 2))).toBe(role);
    }
    for (const weight of Array.from(weights.array)) {
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
    let submerged = 0;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      if (positions.getY(vertex) < GARDEN_WATER_Y - 0.2) {
        submerged += 1;
        expect(weights.getX(vertex)).toBe(0);
      }
    }
    expect(submerged).toBeGreaterThan(0);
    expect(material.userData.gardenSurface).toMatchObject({
      role: "stone", mapping: "triplanar", vertexRoles: true, vertexWeights: true,
    });
    expect(material.roughnessMap).toBeNull();
    expect(material.normalMap).toBeNull();
  });

  it("seats the tower on a level crown court at its root height", () => {
    // The stylobate (half 6.2) must neither float over nor sink into the
    // crag: the court is the tower root, and the crown rises well clear of
    // the lee bench the pond and chaseki rest on.
    for (let x = -6.2; x <= 6.2; x += 0.62) {
      for (let z = -6.2; z <= 6.2; z += 0.62) {
        const height = islandTerrainHeight(GARDEN_LIGHTHOUSE_ROOT_OFFSET.x + x, GARDEN_LIGHTHOUSE_ROOT_OFFSET.z + z);
        expect(height - GARDEN_LIGHTHOUSE_ROOT_OFFSET.y).toBeGreaterThanOrEqual(0);
        expect(height - GARDEN_LIGHTHOUSE_ROOT_OFFSET.y).toBeLessThan(0.05);
      }
    }
    expect(islandTerrainHeight(GARDEN_POND_CENTER.x, GARDEN_POND_CENTER.z)).toBeLessThan(GARDEN_LIGHTHOUSE_ROOT_OFFSET.y - 6);
  });

  it("has one inclined exposed face and unequal shoulders rather than radial terraces", () => {
    const heights = [6.3, 6.7, 7.1, 7.5, 7.9, 8.3].map((z) => islandTerrainHeight(-7, z));
    const drops = heights.slice(1).map((height, i) => heights[i]! - height);
    expect(Math.min(...drops)).toBeGreaterThan(0.5);
    expect(Math.max(...drops) - Math.min(...drops)).toBeLessThan(0.08);
    expect(islandTerrainHeight(-12, 7.5)).toBeGreaterThan(islandTerrainHeight(-2, 9) + 1);
    const island = createTerracedIsland(world);
    const crag = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
    const positions = crag.geometry.getAttribute("position");
    const roles = crag.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
    let exposed = 0, face = 0;
    for (let i = 0; i < positions.count; i += 1) {
      if (positions.getX(i) < -8 || positions.getX(i) > -6 || positions.getZ(i) < 6.3 || positions.getZ(i) > 8.3) continue;
      face += 1;
      if (roles.getX(i) === GARDEN_SURFACE_ROLE_CODES.stone) exposed += 1;
    }
    expect(face).toBeGreaterThan(10);
    expect(exposed / face).toBeGreaterThan(0.9);
    island.dispose();
  });

  it("interrupts the planted pockets with broad bare intervals", () => {
    for (const [x, z] of [[-11.7, 7.8], [-2.3, 8.9], [4.2, 3.3], [10.4, 8.2]]) {
      expect(gardenIslandPlantingAt(x!, z!)).toBeGreaterThan(0.7);
    }
    for (const [x, z] of [[-7, 7], [1, 8], [7, 2], [-6, 10]]) {
      expect(gardenIslandPlantingAt(x!, z!)).toBeLessThan(0.06);
    }
    expect(gardenIslandPlantingAt(-11.7, 7.8 + 0.01))
      .toBeCloseTo(gardenIslandPlantingAt(-11.7, 7.8), 3);
    const island = createTerracedIsland(world);
    const crag = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
    const positions = crag.geometry.getAttribute("position");
    const roles = crag.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
    for (const [x, z] of [[-11.7, 7.8], [-2.3, 8.9], [4.2, 3.3], [10.4, 8.2]]) {
      let moss = 0;
      for (let i = 0; i < positions.count; i += 1) {
        if (Math.hypot(positions.getX(i) - x!, positions.getZ(i) - z!) < 0.6
          && roles.getX(i) === GARDEN_SURFACE_ROLE_CODES.moss) moss += 1;
      }
      expect(moss, `planted pocket ${x},${z} reaches the mesh`).toBeGreaterThan(0);
    }
    island.dispose();
  });

  it("uses the mesh sampler for every terrain vertex and furniture foot", () => {
    const island = createTerracedIsland(world);
    const crag = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
    const positions = crag.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i += 1) {
      expect(positions.getY(i)).toBeCloseTo(islandTerrainHeight(positions.getX(i), positions.getZ(i)), 3);
    }
    const pavilion = island.root.getObjectByName("island-chaseki")!;
    expect(pavilion.position.y).toBe(islandTerrainHeight(pavilion.position.x, pavilion.position.z));
    const pond = island.root.getObjectByName("island-reflection-basin")!;
    expect(pond.position.y).toBeCloseTo(islandTerrainHeight(pond.position.x, pond.position.z) + 0.08, 5);
    const lantern = gardenIslandLanternWorldOffsets()[0]!;
    expect(lantern.y).toBeCloseTo(islandTerrainHeight(lantern.x, lantern.z) + 0.88, 5);
    for (const foot of GARDEN_CHASEKI_FEET) {
      expect(foot.y).toBeCloseTo(islandTerrainHeight(foot.x, foot.z), 5);
    }
    island.dispose();
  });

  it("grades the headland from a dark wet waterline to a pale crown", () => {
    const island = createTerracedIsland(world);
    const samples: { worldY: number; luminance: number }[] = [];
    const crag = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
    const colors = crag.geometry.getAttribute("color");
    const positions = crag.geometry.getAttribute("position");
    // The mineral headland owns this grade; subordinate dark roofs must not
    // change it merely by introducing more vertices at court elevation.
    for (let index = 0; index < colors.count; index += 1) {
      samples.push({
        worldY: positions.getY(index),
        luminance: 0.2126 * colors.getX(index)
          + 0.7152 * colors.getY(index)
          + 0.0722 * colors.getZ(index),
      });
    }
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
    // W4.G4: set stones, a third buried with a crown above the ground.
    const island = createTerracedIsland(world);
    const stones = island.root.getObjectByName("island-set-stones") as Mesh;
    expect(stones).toBeInstanceOf(Mesh);
    expect((stones.material as MeshStandardMaterial).flatShading).toBe(false);
    stones.updateWorldMatrix(true, false);
    const positions = stones.geometry.getAttribute("position");
    const vertex = new Vector3();
    for (const stone of GARDEN_ISLAND_STONE_GROUPINGS.flat()) {
      let top = -Infinity;
      let bottom = Infinity;
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index);
        if (Math.hypot(vertex.x - stone.x, vertex.z - stone.z) > stone.scale * 0.6) continue;
        top = Math.max(top, vertex.y);
        bottom = Math.min(bottom, vertex.y);
      }
      const ground = islandTerrainHeight(stone.x, stone.z);
      expect(top, `stone ${stone.x},${stone.z} crown`).toBeGreaterThan(ground);
      expect(bottom, `stone ${stone.x},${stone.z} seated`).toBeLessThan(ground);
    }
  });

  it("keeps the shoin court's three draws and single warm gatehouse window", () => {
    const island = createTerracedIsland(world);
    expect(island.root.getObjectByName("keeper-cottage")).toBeUndefined();
    const precinct = island.root.getObjectByName("island-shoin-precinct")!;
    expect(countDrawableObjects(precinct)).toBe(3);
    const glowing: Mesh[] = [];
    precinct.traverse((object) => {
      if (
        object instanceof Mesh
        && object.material instanceof MeshStandardMaterial
        && object.material.emissiveIntensity > 0
        && object.material.emissive.getHex() !== 0
      ) glowing.push(object);
    });
    expect(glowing.map((mesh) => mesh.name)).toEqual(["island-shoin-precinct-gatehouse-lit-window"]);
    const masonry = precinct.getObjectByName("island-shoin-precinct-masonry") as Mesh;
    const positions = masonry.geometry.getAttribute("position");
    const roles = masonry.geometry.getAttribute(GARDEN_SURFACE_ROLE_ATTRIBUTE);
    const normals = masonry.geometry.getAttribute("normal");
    let pitchedFaces = 0;
    let underside = 0;
    for (let i = 0; i < positions.count; i += 1) {
      if (roles.getX(i) !== GARDEN_SURFACE_ROLE_CODES.roofTile) continue;
      expect(Math.abs(positions.getX(i) - GARDEN_LIGHTHOUSE_ROOT_OFFSET.x)).toBeLessThanOrEqual(5.01);
      expect(Math.abs(positions.getZ(i) - (GARDEN_LIGHTHOUSE_ROOT_OFFSET.z - 7))).toBeLessThanOrEqual(0.71);
      if (normals.getY(i) > 0.5 && Math.abs(normals.getZ(i)) > 0.1) pitchedFaces += 1;
      if (normals.getY(i) < -0.5) underside += 1;
    }
    expect(pitchedFaces).toBeGreaterThan(0);
    expect(underside).toBeGreaterThan(0);
  });

  it("marks the landing with set stones, not a gate, beside a five-span lee bridge", () => {
    const island = createTerracedIsland(world);
    expect(island.root.getObjectByName("pharos-precinct-obelisks")).toBeUndefined();
    expect(island.root.getObjectByName("pharos-obelisk-stone")).toBeUndefined();
    expect(island.root.getObjectByName("island-landing-torii")).toBeUndefined();
    const stones = island.root.getObjectByName("island-landing-stones") as Mesh;
    expect(stones).toBeInstanceOf(Mesh);
    const positions = stones.geometry.getAttribute("position");
    expect(positions.count / 3).toBeLessThanOrEqual(150);
    // The gull sits on real stone: the perch is the top of the taller stone.
    const perch = gardenLandingStonePerch();
    let crown = -Infinity;
    for (let index = 0; index < positions.count; index += 1) {
      const reach = Math.hypot(positions.getX(index) - perch.x, positions.getZ(index) - perch.z);
      if (reach < 0.6) crown = Math.max(crown, positions.getY(index));
    }
    expect(crown).toBeCloseTo(perch.y, 3);
    expect(perch.y - islandTerrainHeight(perch.x, perch.z)).toBeGreaterThan(1.2);
    const bridge = island.root.getObjectByName("island-lee-plank-bridge") as InstancedMesh;
    expect(bridge).toBeInstanceOf(InstancedMesh);
    expect(bridge.count).toBe(5);
    expect(bridge.geometry.index!.count / 3 * bridge.count).toBeLessThanOrEqual(1_500);
    expect(island.root.getObjectByName("island-quay-foot-stone")).toBeInstanceOf(Mesh);
  });

  it("builds a grounded chaseki with a boarded veranda, open doorway and thick quiet roof", () => {
    const pavilion = createGardenChaseki();
    pavilion.updateMatrixWorld(true);
    const local = (point: Readonly<{ x: number; y: number; z: number }>) =>
      new Vector3(point.x, point.y, point.z).applyMatrix4(pavilion.matrix.clone().invert());
    const deck = pavilion.getObjectByName("chaseki-veranda-deck-frame") as Mesh;
    const plaster = pavilion.getObjectByName("chaseki-recessed-plaster") as Mesh;
    const roof = pavilion.getObjectByName("chaseki-roof-field") as Mesh;
    const courses = pavilion.getObjectByName("chaseki-ridge-end-courses") as Mesh;
    const deckPositions = deck.geometry.getAttribute("position");
    const deckAnchor = local(GARDEN_CHASEKI_ANCHORS.deck);
    const stepAnchor = local(GARDEN_CHASEKI_ANCHORS.threshold);
    // Distinct board edges and a lower, reachable threshold, not one solid slab.
    const boardEdges = new Set<number>();
    for (let i = 0; i < deckPositions.count; i += 1) {
      if (Math.abs(deckPositions.getY(i) - deckAnchor.y) < 1e-5) boardEdges.add(deckPositions.getZ(i));
    }
    expect(boardEdges.size).toBeGreaterThanOrEqual(8);
    expect(stepAnchor.y).toBeCloseTo(deckAnchor.y - 0.14, 5);
    expect(Array.from(deckPositions.array).every(Number.isFinite)).toBe(true);
    const door = local(GARDEN_CHASEKI_ANCHORS.door);
    const ray = new Raycaster(pavilion.localToWorld(new Vector3(door.x, door.y + 0.75, 1.2)),
      new Vector3(0, 0, -1).transformDirection(pavilion.matrixWorld));
    const wallHits = ray.intersectObject(plaster);
    expect(wallHits.length).toBeGreaterThan(0);
    expect(wallHits[0]!.distance).toBeGreaterThan(2.2);
    // The porch stays open across the seating side; no centre post blocks entry.
    const porchHits = ray.intersectObject(deck);
    expect(porchHits).toHaveLength(0);
    const positions = roof.geometry.getAttribute("position");
    const eaveHeights: number[] = [];
    for (let i = 0; i < positions.count; i += 1) {
      if (Math.abs(positions.getZ(i) - 1.45) < 1e-5) eaveHeights.push(positions.getY(i));
    }
    expect(Math.max(...eaveHeights) - Math.min(...eaveHeights)).toBeCloseTo(0.28, 5);
    courses.geometry.computeBoundingBox();
    expect(courses.geometry.boundingBox!.max.y).toBeCloseTo(local(GARDEN_CHASEKI_ANCHORS.ridge).y, 5);
    expect(pavilion.getObjectByName("chaseki-underside-rafters")).toBeInstanceOf(Mesh);
    const feet = pavilion.children.filter((part) => part.name === "chaseki-bearing-foot") as Mesh[];
    expect(feet).toHaveLength(GARDEN_CHASEKI_FEET.length);
    feet.forEach((mesh, index) => {
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.min.y + pavilion.position.y).toBeCloseTo(GARDEN_CHASEKI_FEET[index]!.y - 0.04, 5);
    });
    const lamp = gardenIslandLanternWorldOffsets()[1]!;
    expect(lamp.x).toBe(GARDEN_CHASEKI_ANCHORS.eave.x);
    expect(lamp.z).toBe(GARDEN_CHASEKI_ANCHORS.eave.z);
    expect(lamp.y + 0.415).toBeLessThanOrEqual(GARDEN_CHASEKI_ANCHORS.eave.y);
    disposeThreeObjectTree(pavilion);
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
    // T0.2 remainder (2026-09-07): was `> 1` against the frozen 1.15. The lamp
    // is no longer a constant — `updateDayCycle` writes it every frame — so
    // the build value is the curve's DAY end and a `> 1` build-time floor
    // would now be asserting the opposite of the intent. The night end is
    // pinned in garden-day-cycle.test.ts; what belongs here is that the build
    // leaves the lamp LIT (never 0) at its day level.
    expect(material.emissiveIntensity).toBe(ISLAND_LANTERN_DAY_EMBER);
    expect(material.emissiveIntensity).toBeGreaterThan(0);
  });

  it("keeps the crag, stair and consolidated Danger face inside the island contract", () => {
    // `GARDEN_ISLAND_OBSTACLE` is what stops hulls mooring on the island, and
    // it is calibrated against the island's waterline — local centre (0.6,
    // 1.2), see that module's header. The headland is cut to it exactly, and
    // every other rock or stone addition must stay inside it, or the
    // footprint has grown without the obstacle growing and ships will clip land.
    const island = createTerracedIsland(world);
    const crag = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
    // Float32 positions: the rim ring sits on the ellipse to ~1e-7.
    expect(maxObstacleEllipseValue(crag)).toBeLessThanOrEqual(1 + 1e-5);
    const added = [
      "island-danger-rock-face",
      "island-quay-stair-treads",
      "island-quay-stair-cheeks",
      "island-shoin-precinct-masonry",
      "island-shoin-precinct-recesses",
      "island-shoin-precinct-gatehouse-lit-window",
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

  it("keeps the calendar on the maple alone: the pines never turn", () => {
    const grove = (iso: string) => (createTerracedIsland(world, undefined, new Date(iso))
      .root.getObjectByName("island-niwaki-grove") as InstancedMesh).geometry;
    const summer = grove("2026-07-01T12:00:00Z");
    const autumn = grove("2026-11-28T12:00:00Z");
    const foliage = summer.getAttribute("aGardenFoliage");
    const summerColor = summer.getAttribute("color");
    const autumnColor = autumn.getAttribute("color");
    let turned = 0;
    for (let vertex = 0; vertex < foliage.count; vertex += 1) {
      const changed = summerColor.getX(vertex) !== autumnColor.getX(vertex)
        || summerColor.getY(vertex) !== autumnColor.getY(vertex);
      if (foliage.getX(vertex) > 0) expect(changed).toBe(false);
      else if (changed) turned += 1;
    }
    expect(turned).toBeGreaterThan(0);
  });

  it("grows five niwaki and one maple as one smooth-shaded hero draw", () => {
    expect(GARDEN_NIWAKI_SPECS).toHaveLength(6);
    expect(GARDEN_NIWAKI_SPECS.filter((spec) => spec.kind === "pine")).toHaveLength(5);
    expect(new Set(GARDEN_NIWAKI_SPECS.map((pine) => pine.height)).size).toBe(6);
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
    expect(grove!.children.map((child) => child.name)).toEqual(["island-niwaki-grove"]);
    const mesh = grove!.children[0] as InstancedMesh<BufferGeometry, MeshStandardMaterial>;
    expect(mesh).toBeInstanceOf(InstancedMesh);
    expect(mesh.material.flatShading).toBe(false);
    // Pine pads carry distinct ranks for the month record; bark carries 0.
    const foliage = mesh.geometry.getAttribute("aGardenFoliage");
    const ranks = new Set<number>();
    for (let vertex = 0; vertex < foliage.count; vertex += 1) if (foliage.getX(vertex) > 0) ranks.add(foliage.getX(vertex));
    expect(ranks.size).toBeGreaterThanOrEqual(5 * 5);
    // The overhang's pads reach out over the water.
    const position = mesh.geometry.getAttribute("position");
    let overWater = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      if (foliage.getX(vertex) > 0 && waterlineValue(position.getX(vertex), position.getZ(vertex)) > 1) overWater += 1;
    }
    expect(overWater).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute("aGardenSway").count).toBe(mesh.count);
    const weather = weatherForFrame({ baseWind: 0.5, psiStress: 0.2, timeSeconds: 2 });
    updateGardenNiwakiWind(island.decoration, weather, false);
    const uniforms = mesh.material.userData.gardenWindSwayUniforms as {
      uGardenWindStrength: { value: number };
    };
    expect(uniforms.uGardenWindStrength.value).toBeGreaterThan(0);
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
    expect(material.roughness).toBeGreaterThanOrEqual(0.9);
    expect(material.roughness).toBeLessThanOrEqual(1);
    expect(material.normalMap).toBeNull();
    expect(material.userData.gardenSurface).toMatchObject({
      role: "gravel", mapping: "worldXZ", metresPerRepeat: 0.45,
    });
    expect(positions.count).toBe(first.geometry.getAttribute("uv").count);
    // The rake is actual relief, not a flat colour decal.
    const fractionalHeights = Array.from({ length: positions.count }, (_, index) => (
      positions.getY(index) - Math.floor(positions.getY(index) * 10) / 10
    ));
    expect(Math.max(...fractionalHeights) - Math.min(...fractionalHeights)).toBeGreaterThan(0.025);
  });

  it("shares one atlas lease across terrain finishes and releases it once through owned part disposal", () => {
    const textures = { albedo: new DataTexture(), normal: new DataTexture(), orm: new DataTexture() };
    const disposals = Object.values(textures).map((texture) => vi.spyOn(texture, "dispose"));
    const uniforms = {
      uGardenSurfaceAlbedo: { value: textures.albedo },
      uGardenSurfaceNormal: { value: textures.normal },
      uGardenSurfaceOrm: { value: textures.orm },
      uGardenSurfaceAtlasReady: { value: 0 },
    };
    const release = vi.fn(() => Object.values(textures).forEach((texture) => texture.dispose()));
    const lease: GardenSurfaceAtlasLease = { textures, uniforms, release, ready: Promise.resolve(true), error: null,
      detailSource: { key: "island-test-detail", uniforms,
        glsl: "GardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uv, float role, float repeatMetres) { return GardenSurfaceDetail(vec3(1.0), 0.0, vec3(0.0)); }" } };
    const atlas: GardenSurfaceAtlasOwner = { textures, lease: vi.fn(() => lease), release: vi.fn() };
    const island = createTerracedIsland(world, mockCloudShadowSource(), undefined, atlas);
    expect(atlas.lease).toHaveBeenCalledTimes(1);
    for (const [name, role, mapping] of [
      [GARDEN_CRAG_HEADLAND_NAME, "stone", "triplanar"],
      ["island-danger-rock-face", "stone", "triplanar"],
      ["island-path-sweep", "gravel", "worldXZ"],
      ["island-raked-court", "gravel", "worldXZ"],
    ]) {
      const mesh = island.root.getObjectByName(name) as Mesh;
      expect(mesh).toBeInstanceOf(Mesh);
      const material = mesh.material as MeshStandardMaterial;
      const surface = material.userData.gardenSurface as GardenSurfaceMetadata;
      expect(surface).toMatchObject({ role, mapping, sourceKey: lease.detailSource.key });
      expect(Number.isFinite(surface.metresPerRepeat) && Number.isFinite(surface.detailStrength)).toBe(true);
      expect(material.map).toBeNull();
      expect(material.roughnessMap).toBeNull();
      expect(material.normalMap).toBeNull();
      const shader = { vertexShader: ShaderLib.standard.vertexShader,
        fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, IUniform> };
      material.onBeforeCompile(shader as never, null as never);
      for (const [key, uniform] of Object.entries(uniforms)) expect(shader.uniforms[key]).toBe(uniform);
      if (role === "stone") {
        expect(shader.fragmentShader).toContain("cragWet");
        expect(shader.fragmentShader).toContain("cragNotch");
      }
      if (name === "island-raked-court") expect(shader.fragmentShader).toContain("rakePhase");
      material.dispose();
      for (const disposal of disposals) expect(disposal).not.toHaveBeenCalled();
    }
    island.dispose();
    island.dispose();
    disposeThreeObjectTree(island.root);
    expect(release).toHaveBeenCalledTimes(1);
    expect(atlas.release).not.toHaveBeenCalled();
    for (const disposal of disposals) expect(disposal).toHaveBeenCalledTimes(1);
  });

  it("releases each island atlas lease once across rebuild and teardown before the generic walk", () => {
    const textures = { albedo: new DataTexture(), normal: new DataTexture(), orm: new DataTexture() };
    const releases: Mock[] = [];
    const atlas: GardenSurfaceAtlasOwner = { textures, release: vi.fn(), lease: vi.fn(() => {
      const release = vi.fn();
      releases.push(release);
      const lease: GardenSurfaceAtlasLease = { textures, uniforms: {}, release,
        ready: Promise.resolve(true), error: null, detailSource: {
          key: "island-rebuild-detail", uniforms: {},
          glsl: "GardenSurfaceDetail gardenSampleSurface(vec3 p, vec3 n, vec2 uv, float role, float repeatMetres) { return GardenSurfaceDetail(vec3(1.0), 0.0, vec3(0.0)); }",
        } };
      return lease;
    }) };
    const partRoot = new Group();
    for (let rebuild = 0; rebuild < 2; rebuild += 1) {
      const island = createTerracedIsland(world, undefined, undefined, atlas);
      partRoot.add(island.root);
      const headland = island.root.getObjectByName(GARDEN_CRAG_HEADLAND_NAME) as Mesh;
      const geometryDispose = vi.spyOn(headland.geometry, "dispose");
      const materialDispose = vi.spyOn(headland.material as MeshStandardMaterial, "dispose");
      expect(atlas.lease).toHaveBeenCalledTimes(rebuild + 1);
      island.dispose();
      island.dispose();
      disposeThreeObjectTree(partRoot);
      expect(partRoot.children).toHaveLength(0);
      expect(releases[rebuild]).toHaveBeenCalledTimes(1);
      expect(geometryDispose).toHaveBeenCalledTimes(1);
      expect(materialDispose).toHaveBeenCalledTimes(1);
    }
    expect(atlas.release).not.toHaveBeenCalled();
    Object.values(textures).forEach((texture) => texture.dispose());
  });

  it("paints the tower and moon analytically into the existing pond draw", () => {
    const island = createTerracedIsland(world, mockCloudShadowSource());
    const skins: Mesh[] = [];
    island.root.traverse((object) => {
      if (object.name === "island-reflection-pond-skin" && object instanceof Mesh) skins.push(object);
    });
    expect(skins).toHaveLength(1);
    expect(GARDEN_POND_RADIUS).toBe(5.5);
    skins[0]!.geometry.computeBoundingBox();
    expect(skins[0]!.geometry.boundingBox!.max.x).toBeCloseTo(GARDEN_POND_RADIUS);
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
    // The shared cloud hook still composes around the pond ink; height fog is
    // far-bank opt-in only (G2/W2.4), so the island never carries it.
    expect(shader.fragmentShader).not.toContain("gardenApplyHeightFog");
    expect(shader.fragmentShader).toContain("gardenCloudLight");
  });

  it("aims the pond image at the real tower", () => {
    expect(GARDEN_POND_REFLECTION_AXES.tower.length()).toBeCloseTo(1);
    // The tower is west of the pond; its local reflection axis must point
    // strongly left rather than becoming a generic camera-aligned stripe.
    expect(GARDEN_POND_REFLECTION_AXES.tower.x).toBeLessThan(-0.8);
    const derivedTower = testPondLocalAxis(
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.x - GARDEN_POND_CENTER.x,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.z - GARDEN_POND_CENTER.z,
    );
    expect(GARDEN_POND_REFLECTION_AXES.tower.distanceTo(derivedTower)).toBeLessThan(0.00001);
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
    // Without a moon placed for an eye the pond carries no moon at all.
    expect(night.y).toBe(0);
  });

  it("puts the moon's pond image where a flat mirror shows it to the eye", () => {
    // Eye 10 u above the pond plane, moon 30° up toward local +X.
    const elevation = Math.PI / 6;
    const moon = new Vector3(Math.cos(elevation), 0, Math.sin(elevation));
    const image = gardenPondMoonImage(new Vector3(-4, 1, 10), moon)!;
    // The reflected ray from the eye leaves the specular point at the moon's
    // elevation: horizontal run = height / tan(elevation).
    expect(image.centre.x).toBeCloseTo(-4 + 10 / Math.tan(elevation), 9);
    expect(image.centre.y).toBeCloseTo(1, 9);
    // The road runs from the image back toward the eye.
    expect(image.axis.x).toBeCloseTo(-1, 9);
    expect(gardenPondMoonImage(new Vector3(0, 0, 10), new Vector3(1, 0, -0.1))).toBeNull();
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
 * Worst ellipse value over actual transformed vertices — every instance for
 * an InstancedMesh. The ellipse is convex, so containing each triangle's
 * vertices contains its interior too. A merged chamfered precinct has empty
 * bounding-box corners outside its real footprint; those are not land.
 */
function maxObstacleEllipseValue(mesh: Mesh): number {
  const positions = mesh.geometry.getAttribute("position");
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
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(matrix);
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

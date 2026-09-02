import {
  BoxGeometry,
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
import {
  createTerracedIsland,
  GARDEN_POND_REFLECTION_AXES,
  GARDEN_NIWAKI_SPECS,
  GARDEN_ISLAND_STONE_GROUPINGS,
  GARDEN_QUAY_STAIR_HEAD,
  GARDEN_QUAY_STAIR_TOP_Y,
  gardenIslandLanternWorldOffsets,
  gardenPrecinctObeliskGateposts,
  mergeIslandStatics,
} from "./garden-island";
import { applyGardenHeightFog } from "./garden-height-fog";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { GARDEN_MOON_AZIMUTH } from "./garden-sun";
import { countDrawableObjects, TILE_SCALE } from "./garden-util";

const world = {
  lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" },
} as unknown as PharosVilleWorld;

function countInstanced(root: import("three").Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof InstancedMesh) count += 1;
  });
  return count;
}

describe("garden island rockwork", () => {
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
    root.add(warm, cool, pond, shadowSplit, textured, explicitKeep, shaderPatched, planting);
    applyGardenHeightFog(root);

    const before = countDrawableObjects(root);
    const result = mergeIslandStatics(root);
    const after = countDrawableObjects(root);
    const merged = root.getObjectByName("island-merged-0") as Mesh;

    expect(result.merged).toBe(1);
    expect(after).toBe(before - 1);
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
  });

  it("automatically merges island statics and never touches the pond, gravel or instanced planting", () => {
    const island = createTerracedIsland(world);
    const after = countDrawableObjects(island.root);
    const secondPass = mergeIslandStatics(island.root);
    expect(secondPass.merged).toBe(0);
    expect(countDrawableObjects(island.root)).toBe(after);
    expect(after).toBeLessThan(77);
    expect(after).toBeLessThanOrEqual(40 + countInstanced(island.root));
    for (const name of ["island-reflection-pond-skin", "island-raked-gravel", "island-tree-crowns", "island-shoreline-boulders"]) {
      expect(island.root.getObjectByName(name), name).toBeDefined();
    }
  });

  it("re-skins the terraces as vertex-coloured stone that casts shadow", () => {
    const island = createTerracedIsland(world);
    const tiers: Mesh[] = [];
    island.root.traverse((object) => {
      if (
        object instanceof Mesh
        && object.name !== "island-raked-gravel"
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

  it("scatters a single instanced boulder ring at the shoreline", () => {
    const island = createTerracedIsland(world);
    const boulders = island.root.getObjectByName("island-shoreline-boulders");
    expect(boulders).toBeInstanceOf(InstancedMesh);
    expect((boulders as InstancedMesh).count).toBe(14);
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
        && object !== island.decoration.getObjectByName("island-shoreline-boulders")
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

  it("keeps the terrace lanterns few and unevenly spaced", () => {
    // The stillness ledger's precinct budget: this was a ring of twelve at
    // near-even angular spacing — a uniform placement field of light. What is
    // asserted is the composition, not the count alone: an odd, small number,
    // and at least one wide dark gap in the rim.
    const island = createTerracedIsland(world);
    const lamps = island.root.getObjectByName("island-terrace-lantern-lamps") as InstancedMesh;
    expect(lamps).toBeInstanceOf(InstancedMesh);
    expect(lamps.count).toBeLessThanOrEqual(6);
    expect(lamps.count % 2).toBe(1);
    const material = lamps.material as MeshStandardMaterial;
    // Ember level: under the path lanterns, which are themselves under the beacon.
    expect(material.emissiveIntensity).toBeLessThanOrEqual(1.1);

    const points = instancePositions(lamps);
    const angles = points
      .map((point) => Math.atan2(point.z, point.x))
      .sort((left, right) => left - right);
    const gaps = angles.map((angle, index) => {
      const next = angles[(index + 1) % angles.length]!;
      return (next - angle + Math.PI * 2) % (Math.PI * 2);
    });
    const widest = Math.max(...gaps);
    const narrowest = Math.min(...gaps);
    // An even ring has every gap equal at 360/n; this one leaves a dark arc of
    // more than a quadrant (measured 106°) and its widest gap is over twice
    // its narrowest.
    expect(widest).toBeGreaterThan(Math.PI / 2);
    expect(widest).toBeGreaterThan(((Math.PI * 2) / points.length) * 1.4);
    expect(widest / narrowest).toBeGreaterThan(1.6);
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

  it("keeps every W4.9 rock feature inside the ship-exclusion ellipse", () => {
    // `GARDEN_ISLAND_OBSTACLE` is what stops hulls mooring on the island, and
    // it is calibrated against the bottom terrace — local centre (0.6, 1.2),
    // see that module's header. Anything the W4.9 detail pass added must stay
    // inside it, or the footprint has grown without the obstacle growing and
    // ships will clip land.
    const island = createTerracedIsland(world);
    const added = [
      "island-sea-cliffs",
      "island-cliff-talus",
      "island-quay-stair-treads",
      "island-quay-stair-cheeks",
      "island-shrubs",
      "island-grass-tufts",
      "island-terrace-lantern-posts",
      "island-terrace-lantern-lamps",
    ];
    for (const name of added) {
      const mesh = island.root.getObjectByName(name);
      expect(mesh, name).toBeInstanceOf(Mesh);
      expect(maxObstacleEllipseValue(mesh as Mesh), name).toBeLessThanOrEqual(1);
    }
  });

  it("groups the planting into drifts with open ground between them", () => {
    // The composition contract forbids a uniform scatter: planting must read as
    // thickets with bare rock between, like the Sakuteiki stone groupings. A
    // golden-angle spiral over the whole island satisfies determinism but is
    // isotropic by construction, so assert the distribution is clustered —
    // neighbours close, spread wide.
    const island = createTerracedIsland(world);
    for (const name of ["island-shrubs", "island-grass-tufts"]) {
      const mesh = island.root.getObjectByName(name) as InstancedMesh;
      expect(mesh, name).toBeInstanceOf(InstancedMesh);
      const points = instancePositions(mesh);
      expect(points.length, name).toBeGreaterThan(20);

      let nearestSum = 0;
      for (const point of points) {
        let nearest = Infinity;
        for (const other of points) {
          if (other === point) continue;
          nearest = Math.min(nearest, Math.hypot(point.x - other.x, point.z - other.z));
        }
        nearestSum += nearest;
      }
      const meanNearest = nearestSum / points.length;
      const spreadX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
      const spreadZ = Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z));
      // An even scatter over this footprint sits near 2 units apart; the drifts
      // pack to well under half that while still spanning the island.
      expect(meanNearest, name).toBeLessThan(1);
      expect(Math.max(spreadX, spreadZ), name).toBeGreaterThan(14);
    }
  });

  it("leaves most of the island footprint as open ground", () => {
    // The open ground is the composition, not a coverage gap — the drifts only
    // read as drifts because there is bare rock between them. Measured over the
    // footprint, an even scatter leaves ~27% of the rock clear of planting and
    // the drifts leave ~63%, so this threshold separates the two.
    const island = createTerracedIsland(world);
    const points = instancePositions(
      island.root.getObjectByName("island-grass-tufts") as InstancedMesh,
    );
    let bare = 0;
    let total = 0;
    for (let x = -16; x <= 16; x += 0.5) {
      for (let z = -11; z <= 11; z += 0.5) {
        if (((x - 0.6) / 16.8) ** 2 + ((z - 1.2) / 12.6) ** 2 > 1) continue;
        total += 1;
        const covered = points.some((p) => Math.hypot(x - p.x, z - p.z) <= 2);
        if (!covered) bare += 1;
      }
    }
    expect(bare / total).toBeGreaterThan(0.45);
  });

  it("places planting deterministically across rebuilds", () => {
    const first = instancePositions(
      createTerracedIsland(world).root.getObjectByName("island-shrubs") as InstancedMesh,
    );
    const second = instancePositions(
      createTerracedIsland(world).root.getObjectByName("island-shrubs") as InstancedMesh,
    );
    expect(second).toEqual(first);
  });

  it("adds restrained spring sakura and exactly one autumn momiji", () => {
    const summerShrubs = createTerracedIsland(world, undefined, "summer")
      .root.getObjectByName("island-shrubs") as InstancedMesh;
    const springShrubs = createTerracedIsland(world, undefined, "spring")
      .root.getObjectByName("island-shrubs") as InstancedMesh;
    expect((springShrubs.material as MeshStandardMaterial).color.getHex())
      .not.toBe((summerShrubs.material as MeshStandardMaterial).color.getHex());

    const crowns = createTerracedIsland(world, undefined, "autumn")
      .root.getObjectByName("island-tree-crowns") as InstancedMesh;
    const colors: number[] = [];
    for (let index = 0; index < crowns.count; index += 1) {
      colors.push(crowns.getColorAt(index, new Color()).getHex());
    }
    const frequencies = [...new Set(colors)].map((color) => colors.filter((item) => item === color).length);
    expect(frequencies).toContain(1);
    expect(frequencies).toContain(crowns.count - 1);
  });

  it("merges two asymmetric niwaki into a two-draw hero silhouette", () => {
    expect(GARDEN_NIWAKI_SPECS).toHaveLength(2);
    for (const pine of GARDEN_NIWAKI_SPECS) {
      expect(pine.pads.length).toBeGreaterThanOrEqual(3);
      expect(pine.pads.length).toBeLessThanOrEqual(5);
      expect(pine.pads.length % 2).toBe(1);
      expect(new Set(pine.pads.map((pad) => pad.scaleX)).size).toBe(pine.pads.length);
      expect(Math.hypot(pine.leanX, pine.leanZ)).toBeGreaterThan(1.5);
    }
    // The camera-side pine reaches toward the pond/tower instead of leaning
    // out of frame: its crown is materially closer to the pond than its foot.
    const foreground = GARDEN_NIWAKI_SPECS[0]!;
    const pond = { x: 1.45, z: -2.05 };
    const footDistance = Math.hypot(foreground.x - pond.x, foreground.z - pond.z);
    const crownDistance = Math.hypot(
      foreground.x + foreground.leanX - pond.x,
      foreground.z + foreground.leanZ - pond.z,
    );
    expect(crownDistance).toBeLessThan(footDistance * 0.45);

    const island = createTerracedIsland(world);
    const grove = island.root.getObjectByName("island-niwaki");
    expect(grove).toBeDefined();
    expect(grove!.children.map((child) => child.name)).toEqual([
      "island-niwaki-trunks",
      "island-niwaki-pads",
    ]);
    expect(grove!.children.every((child) => child instanceof Mesh)).toBe(true);
  });

  it("builds deterministic coarse raked relief with vertex-colour wear", () => {
    const first = createTerracedIsland(world).root.getObjectByName("island-raked-gravel") as Mesh;
    const second = createTerracedIsland(world).root.getObjectByName("island-raked-gravel") as Mesh;
    expect(first).toBeInstanceOf(Mesh);
    const positions = first.geometry.getAttribute("position");
    const colors = first.geometry.getAttribute("color");
    expect(positions.count).toBeGreaterThan(400);
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
    expect(GARDEN_POND_REFLECTION_AXES.tower.x).toBeLessThan(-0.9);
    const derivedTower = testPondLocalAxis(
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.x - 1.45,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.z + 2.05,
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
    expect(offsets).toHaveLength(6);
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

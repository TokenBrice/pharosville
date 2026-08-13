import {
  DataTexture,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_ISLAND_OBSTACLE } from "../systems/garden-water-exclusion";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  createTerracedIsland,
  GARDEN_ISLAND_STONE_GROUPINGS,
  GARDEN_QUAY_STAIR_HEAD,
  GARDEN_QUAY_STAIR_TOP_Y,
  gardenIslandLanternWorldOffsets,
  gardenPrecinctObeliskGateposts,
} from "./garden-island";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import { TILE_SCALE } from "./garden-util";

const world = {
  lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" },
} as unknown as PharosVilleWorld;

describe("garden island rockwork", () => {
  it("re-skins the terraces as vertex-coloured stone that casts shadow", () => {
    const island = createTerracedIsland(world);
    const tiers: Mesh[] = [];
    island.root.traverse((object) => {
      if (
        object instanceof Mesh
        && object.material instanceof MeshStandardMaterial
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

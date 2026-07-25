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
  gardenIslandLanternWorldOffsets,
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

  it("strings one instanced lantern trio on the keeper cottage", () => {
    const island = createTerracedIsland(world);
    const string = island.root.getObjectByName("keeper-cottage-lantern-string");
    expect(string).toBeDefined();
    const lanterns = island.root.getObjectByName("keeper-cottage-lanterns");
    expect(lanterns).toBeInstanceOf(InstancedMesh);
    expect((lanterns as InstancedMesh).count).toBe(3);
    const material = (lanterns as InstancedMesh).material as MeshStandardMaterial;
    // Warm but well under the AgX clip — a quiet accent, not a bloom source.
    expect(material.emissiveIntensity).toBeLessThanOrEqual(1);
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

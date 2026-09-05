import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { STATION_SCALE_LADDER } from "../systems/dock-layout";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";
import { authorDock, type StationType } from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import {
  createGardenOverviewLod,
  OVERVIEW_LOD_DETAIL_NAMES,
  OVERVIEW_LOD_FULL_ZOOM,
  OVERVIEW_LOD_HIDDEN_ZOOM,
  OVERVIEW_LOD_WHOLE_RING_NAMES,
  overviewLodTargetDetail,
} from "./garden-overview-lod";

/** A local prop whose geometry sits well away from its own origin. */
function propTree(): { prop: Group; root: Group } {
  const root = new Group();
  const prop = new Group();
  prop.name = "island-quay-stair";
  prop.position.set(4, 0, -2);
  const arm = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  arm.position.set(0, 3, 0);
  prop.add(arm);
  root.add(prop);
  return { prop, root };
}

/**
 * The other shape: ONE group at the world origin whose single mesh already
 * carries every berth's world position, the way `dock-cargo-tide` holds the
 * whole harbour ring's crates. The two quays here stand in for opposite sides
 * of the ring.
 */
function wholeRingTree(): { crates: Mesh[]; prop: Group; root: Group } {
  const root = new Group();
  const prop = new Group();
  prop.name = "dock-cargo-tide";
  const crates = [
    new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()),
    new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()),
  ];
  crates[0]!.position.set(60, 0, -40);
  crates[1]!.position.set(-52, 0, 44);
  prop.add(...crates);
  root.add(prop);
  return { crates, prop, root };
}
const CURRENT_STATION_TYPES: readonly StationType[] = [
  "ethereum-mole",
  "hatago-wharf",
  "uogashi",
  "stepped-inlet",
  "fishing-pier",
  "tea-house-quay",
  "reed-boathouse",
  "storm-mole",
  "pigeonnier-islet",
];

function overviewHarborBatch() {
  return createGardenHarborBatch(CURRENT_STATION_TYPES.map((type, index) => {
    const chainId = `lod-${type}`;
    return authorDock({
      ...dockFixture(chainId, 6),
      station: {
        coveId: `lod-${type}`,
        shoreBearing: (index / CURRENT_STATION_TYPES.length) * Math.PI * 2,
        type,
      },
    }, DISPLAY_TILES[index % DISPLAY_TILES.length]!, ISLAND_TILE);
  }));
}

const SNAP = { deltaSeconds: 10, reducedMotion: false };

describe("overviewLodTargetDetail", () => {
  it("keeps default framing whole and whole-map framing bare", () => {
    // The Wave 1 default camera fits the world at 0.648 and the absolute zoom floor
    // is 0.28; the band has to sit strictly between them so neither framing
    // ever pays for a partially-shed prop.
    expect(OVERVIEW_LOD_HIDDEN_ZOOM).toBeGreaterThan(0.28);
    expect(OVERVIEW_LOD_FULL_ZOOM).toBeLessThan(0.648);

    expect(overviewLodTargetDetail(0.648)).toBe(1);
    expect(overviewLodTargetDetail(2.4)).toBe(1);
    expect(overviewLodTargetDetail(0.28)).toBe(0);
    expect(overviewLodTargetDetail(OVERVIEW_LOD_HIDDEN_ZOOM)).toBe(0);
    expect(overviewLodTargetDetail(OVERVIEW_LOD_FULL_ZOOM)).toBe(1);
  });

  it("crosses the band monotonically", () => {
    const samples = [0.44, 0.48, 0.52, 0.56, 0.6, 0.62]
      .map((zoom) => overviewLodTargetDetail(zoom));
    for (const [index, value] of samples.entries()) {
      if (index === 0) continue;
      expect(value).toBeGreaterThan(samples[index - 1]!);
    }
  });
});

describe("createGardenOverviewLod", () => {
  it("names props the composed world still builds", () => {
    // Guard against an upstream rename silently un-culling the overview frame.
    // The composed-world half of this lives in world-renderer.test.ts.
    expect(new Set(OVERVIEW_LOD_DETAIL_NAMES).size).toBe(OVERVIEW_LOD_DETAIL_NAMES.length);
    expect(OVERVIEW_LOD_DETAIL_NAMES).toEqual(expect.arrayContaining([
      "island-koi",
      "island-niwaki",
    ]));
    expect([...Object.keys(STATION_SCALE_LADDER)].sort()).toEqual([...CURRENT_STATION_TYPES].sort());
    // The path is now a primary island read, not a toy-scale gravel apron.
    expect(OVERVIEW_LOD_DETAIL_NAMES).not.toContain("island-path-sweep");
    // Fine station detail has its own hover/inspect gate and must not be
    // made visible by this overview policy.
    expect(OVERVIEW_LOD_DETAIL_NAMES.some((name) => name.startsWith("harbor-fine-"))).toBe(false);
  });

  it("sheds only harbor greebles while retaining structural station breaks", () => {
    const batch = overviewHarborBatch();
    const visibleNames = new Set<string>();
    const allNames = new Set<string>();
    batch.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      allNames.add(object.name);
      if (object.visible) visibleNames.add(object.name);
    });
    const shedNames = [
      "dock-chain-flag",
      "dock-lamp-heads",
      "dock-posts",
      "harbor-netRack",
      "station-lit-screens",
    ];
    expect(shedNames.every((name) => visibleNames.has(name))).toBe(true);
    expect(shedNames.every((name) => OVERVIEW_LOD_DETAIL_NAMES.includes(name))).toBe(true);

    // These are the coarse station silhouette and structural breaks. The
    // Mole and the ordinary archetypes share these buckets, so they must
    // remain at whole-map framing even as the furniture fades.
    const structuralNames = [
      "harbor-timber",
      "harbor-stone",
      "harbor-metal",
      "harbor-accent",
      "harbor-wall",
      "harbor-roof",
      "harbor-piling",
      "harbor-reedClump",
    ];
    expect(structuralNames.every((name) => !OVERVIEW_LOD_DETAIL_NAMES.includes(name))).toBe(true);
    expect(structuralNames.filter((name) => visibleNames.has(name)).length).toBeGreaterThan(0);
    expect([...allNames]
      .filter((name) => name.startsWith("harbor-fine-"))
      .every((name) => !OVERVIEW_LOD_DETAIL_NAMES.includes(name)))
      .toBe(true);
    batch.dispose();
  });

  it("leaves the authored transform untouched above the band", () => {
    const { prop, root } = propTree();
    const lod = createGardenOverviewLod(root);
    expect(lod.entryCount).toBe(1);

    lod.update({ ...SNAP, zoom: 0.648 });

    expect(lod.detail).toBe(1);
    expect(prop.visible).toBe(true);
    expect(prop.scale.toArray()).toEqual([1, 1, 1]);
    expect(prop.position.toArray()).toEqual([4, 0, -2]);
  });

  it("hides the prop outright below the band", () => {
    const { prop, root } = propTree();
    const lod = createGardenOverviewLod(root);

    lod.update({ ...SNAP, zoom: 0.28 });

    expect(lod.detail).toBe(0);
    expect(prop.visible).toBe(false);
  });

  it("shrinks in place rather than sliding toward the parent origin", () => {
    const { prop, root } = propTree();
    const lod = createGardenOverviewLod(root);

    lod.update({ ...SNAP, zoom: 0.53 });

    const detail = lod.detail;
    expect(detail).toBeGreaterThan(0);
    expect(detail).toBeLessThan(1);
    expect(prop.visible).toBe(true);
    expect(prop.scale.x).toBeCloseTo(detail, 6);
    // The arm's centre sits 3 units above the prop's origin, so a naive scale
    // would drag it down to 3·detail. Holding it put is the whole point.
    prop.updateMatrixWorld(true);
    const arm = prop.children[0]!;
    arm.updateMatrixWorld(true);
    expect(arm.matrixWorld.elements[13]).toBeCloseTo(3, 6);
    expect(arm.matrixWorld.elements[12]).toBeCloseTo(4, 6);
    expect(arm.matrixWorld.elements[14]).toBeCloseTo(-2, 6);
  });

  it("eases across the band instead of stepping", () => {
    const { root } = propTree();
    const lod = createGardenOverviewLod(root);
    lod.update({ ...SNAP, zoom: 0.648 });

    // A single 16 ms frame after a hard zoom-out must travel only part way.
    lod.update({ deltaSeconds: 0.016, reducedMotion: false, zoom: 0.28 });
    expect(lod.detail).toBeGreaterThan(0);
    expect(lod.detail).toBeLessThan(1);

    for (let frame = 0; frame < 60; frame += 1) {
      lod.update({ deltaSeconds: 0.016, reducedMotion: false, zoom: 0.28 });
    }
    expect(lod.detail).toBe(0);
  });

  it("fades a whole-ring group without moving a crate off its own harbour", () => {
    const { crates, prop, root } = wholeRingTree();
    const lod = createGardenOverviewLod(root);

    lod.update({ ...SNAP, zoom: 0.52 });

    expect(lod.detail).toBeGreaterThan(0);
    expect(lod.detail).toBeLessThan(1);
    // The group's transform IS the ring's transform: shrinking it about the
    // ring's centroid scaled the ring, dragging every crate tens of world units
    // toward the middle of the map. Mid-band it must still be untouched.
    expect(prop.visible).toBe(true);
    expect(prop.scale.toArray()).toEqual([1, 1, 1]);
    expect(prop.position.toArray()).toEqual([0, 0, 0]);
    root.updateMatrixWorld(true);
    expect(crates[0]!.matrixWorld.elements[12]).toBeCloseTo(60, 6);
    expect(crates[0]!.matrixWorld.elements[14]).toBeCloseTo(-40, 6);
    expect(crates[1]!.matrixWorld.elements[12]).toBeCloseTo(-52, 6);
    expect(crates[1]!.matrixWorld.elements[14]).toBeCloseTo(44, 6);

    // It still sheds at the same zoom as everything else.
    lod.update({ ...SNAP, zoom: 0.28 });
    expect(prop.visible).toBe(false);
  });

  it("fades the foreground pine silhouette without moving its instances", () => {
    const material = new MeshBasicMaterial();
    const pine = new InstancedMesh(new BoxGeometry(1, 1, 1), material, 1);
    pine.name = "garden-rim-pines";
    pine.setMatrixAt(0, new Matrix4().makeTranslation(60, 0, -40));
    const initial = Array.from(pine.instanceMatrix.array);
    const root = new Group().add(pine);
    const lod = createGardenOverviewLod(root);
    lod.update({ ...SNAP, zoom: 0.52 });
    expect(material.opacity).toBeGreaterThan(0);
    expect(material.opacity).toBeLessThan(1);
    expect(material.transparent).toBe(true);
    expect(Array.from(pine.instanceMatrix.array)).toEqual(initial);
    expect(pine.scale.toArray()).toEqual([1, 1, 1]);
    lod.update({ ...SNAP, zoom: 0.28 });
    expect(pine.visible).toBe(false);
    lod.update({ ...SNAP, zoom: 0.65 });
    expect(material.opacity).toBe(1);
    expect(material.depthWrite).toBe(true);
    pine.geometry.dispose();
    material.dispose();
  });

  it("fades the batched posts, windows, and flags without pulling the ring inward", () => {
    const batch = overviewHarborBatch();
    const root = new Group();
    root.add(batch.root);
    root.updateMatrixWorld(true);
    const posts = batch.propMeshes.post as InstancedMesh;
    const windows = batch.bucketMeshes.window as Mesh;
    const before = {
      flag: instanceWorldPosition(batch.flags, 0),
      post: instanceWorldPosition(posts, 0),
      window: vertexWorldPosition(windows, 0),
    };
    const lod = createGardenOverviewLod(root);

    lod.update({ ...SNAP, zoom: 0.53 });
    root.updateMatrixWorld(true);

    expect(instanceWorldPosition(posts, 0).distanceTo(before.post)).toBeCloseTo(0, 6);
    expect(vertexWorldPosition(windows, 0).distanceTo(before.window)).toBeCloseTo(0, 6);
    expect(instanceWorldPosition(batch.flags, 0).distanceTo(before.flag)).toBeCloseTo(0, 6);
    batch.dispose();
  });

  it("hides the actual batched station-detail drawables below the overview threshold and restores them at default zoom", () => {
    const batch = overviewHarborBatch();
    const root = new Group();
    root.add(batch.root);
    const stationDetails = [
      batch.propMeshes.netRack,
      batch.bucketMeshes.window,
    ];
    expect(stationDetails.every((detail) => (
      detail instanceof Mesh
      && detail.geometry.getAttribute("position").count > 0
      && OVERVIEW_LOD_WHOLE_RING_NAMES.includes(detail.name)
    ))).toBe(true);
    const lod = createGardenOverviewLod(root);

    lod.update({ deltaSeconds: 0.016, reducedMotion: true, zoom: OVERVIEW_LOD_HIDDEN_ZOOM - 0.01 });
    expect(stationDetails.every((detail) => detail?.visible === false)).toBe(true);

    lod.update({ deltaSeconds: 0.016, reducedMotion: true, zoom: 0.648 });
    expect(stationDetails.every((detail) => detail?.visible === true)).toBe(true);
    batch.dispose();
  });

  it("names whole-ring groups the policy already sheds", () => {
    // A name here that the detail list does not carry would shed nothing, and
    // the exemption would be silently dead.
    for (const name of OVERVIEW_LOD_WHOLE_RING_NAMES) {
      expect(OVERVIEW_LOD_DETAIL_NAMES).toContain(name);
    }
  });

  it("snaps under reduced motion, which draws one static frame", () => {
    const { prop, root } = propTree();
    const lod = createGardenOverviewLod(root);
    lod.update({ ...SNAP, zoom: 0.648 });

    lod.update({ deltaSeconds: 0.016, reducedMotion: true, zoom: 0.28 });

    expect(lod.detail).toBe(0);
    expect(prop.visible).toBe(false);
  });
});

const instanceMatrix = new Matrix4();
const instanceWorldMatrix = new Matrix4();
function instanceWorldPosition(mesh: InstancedMesh, index: number): Vector3 {
  mesh.getMatrixAt(index, instanceMatrix);
  instanceWorldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
  return new Vector3().setFromMatrixPosition(instanceWorldMatrix);
}

function vertexWorldPosition(mesh: Mesh, index: number): Vector3 {
  return new Vector3()
    .fromBufferAttribute(mesh.geometry.getAttribute("position"), index)
    .applyMatrix4(mesh.matrixWorld);
}

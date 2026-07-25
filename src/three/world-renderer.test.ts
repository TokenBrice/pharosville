// @vitest-environment jsdom
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Texture,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import type {
  ThreeLogoAssets,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { defaultCamera } from "../systems/camera";
import type { PharosVilleWorld, ShipHull, ShipNode } from "../systems/world-types";
import {
  selectGardenDocks,
  selectGardenObservatorySlice,
  selectRepresentativeShips,
} from "../systems/garden-observatory-slice";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { seaStateForWorld } from "../systems/sea-state";
import {
  createThreeWorldRenderer,
  disposeThreeObjectTree,
} from "./world-renderer";

type TestWebGlRenderer = {
  dispose: ReturnType<typeof vi.fn>;
  lastScene: Scene | null;
  renderLists: { dispose: ReturnType<typeof vi.fn> };
  setPixelRatio: ReturnType<typeof vi.fn>;
};

const rendererHarness = vi.hoisted(() => ({
  instances: [] as TestWebGlRenderer[],
}));

type TestGardenPost = {
  dispose: ReturnType<typeof vi.fn>;
  getPassList: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  setBloomEnabled: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  setGrade: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
};

const postHarness = vi.hoisted(() => ({
  instances: [] as TestGardenPost[],
}));

// The real composer needs a live WebGL2 context, so stub it. The fake still
// draws via the mocked renderer (keeping `lastScene` populated for the scene
// assertions) and tracks the tier policy the renderer drives it with.
vi.mock("./garden-post", () => ({
  createGardenPost: vi.fn((renderer: { render: (scene: unknown, camera: unknown) => void }, scene: unknown, camera: unknown) => {
    let enabled = true;
    const instance: TestGardenPost = {
      dispose: vi.fn(),
      getPassList: vi.fn(() => (enabled ? ["render", "bloom", "grade", "output"] : [])),
      render: vi.fn(() => {
        renderer.render(scene, camera);
      }),
      setBloomEnabled: vi.fn(),
      setEnabled: vi.fn((value: boolean) => {
        enabled = value;
      }),
      setGrade: vi.fn(),
      setSize: vi.fn(),
    };
    postHarness.instances.push(instance);
    return instance;
  }),
}));

const emptyLogoAssets: ThreeLogoAssets = {
  getLogo: () => null,
  getLogoGenerationKey: () => "test",
};

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    dispose = vi.fn();
    info = {
      // `autoReset` and `reset()` mirror the real WebGLRenderer: the renderer
      // accumulates a frame's passes by hand so the post composer's
      // full-screen quads cannot clobber the scene's counts.
      autoReset: true,
      memory: { geometries: 145, textures: 1 },
      render: { calls: 132, lines: 0, points: 0, triangles: 6_605 },
      reset: vi.fn(),
    };
    lastScene: Scene | null = null;
    outputColorSpace = "";
    render = vi.fn((scene: Scene) => {
      this.lastScene = scene;
    });
    renderLists = { dispose: vi.fn() };
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    shadowMap = { autoUpdate: true, enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;

    constructor() {
      rendererHarness.instances.push(this);
    }
  }
  return {
    ...actual,
    WebGLRenderer,
  } as unknown as typeof import("three");
});

beforeEach(() => {
  rendererHarness.instances.length = 0;
  postHarness.instances.length = 0;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => null),
  });
});

describe("disposeThreeObjectTree", () => {
  it("disposes shared and instanced resources exactly once", () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const texture = new Texture();
    const material = new MeshBasicMaterial({ map: texture });
    root.add(
      new Mesh(geometry, material),
      new Mesh(geometry, material),
    );
    const instances = new InstancedMesh(geometry, material, 2);
    root.add(instances);

    const geometryDispose = vi.spyOn(geometry, "dispose");
    const instancesDispose = vi.spyOn(instances, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const textureDispose = vi.spyOn(texture, "dispose");

    disposeThreeObjectTree(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(instancesDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
});

describe("Three world renderer lifecycle", () => {
  it("honors quality tiers and adaptive DPR without removing analytical content", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    const balanced = renderer.render(rendererFrame(world, "balanced", {
      dpr: 3,
      reducedMotion: false,
    }));
    const webGlRenderer = rendererHarness.instances.at(-1)!;
    const scene = webGlRenderer.lastScene!;
    const contentRoot = scene.children.at(-1)!;
    const waterAccents = scene.children[4]!;
    const wakes = wakeGroups(contentRoot);
    const districts = contentRoot.getObjectByName("garden-harbor-districts");
    const gullFlock = contentRoot.getObjectByName("garden-harbor-gull-flock");

    expect(webGlRenderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(waterAccents.visible).toBe(true);
    expect(districts).toBeDefined();
    expect(gullFlock).toBeDefined();
    expect(gullFlock?.visible).toBe(true);
    expect(wakes.length).toBeGreaterThan(0);
    expect(wakes.some((wake) => wake.visible)).toBe(true);

    const recovery = renderer.render(rendererFrame(world, "recovery", {
      dpr: 1.5,
      reducedMotion: false,
    }));
    expect(webGlRenderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(waterAccents.visible).toBe(true);
    expect(wakes.some((wake) => wake.visible)).toBe(true);

    const constrained = renderer.render(rendererFrame(world, "constrained", {
      dpr: 1.5,
      reducedMotion: false,
    }));
    expect(waterAccents.visible).toBe(true);
    expect(gullFlock?.visible).toBe(false);
    expect(wakes.every((wake) => !wake.visible)).toBe(true);

    const reduced = renderer.render(rendererFrame(world, "full", {
      dpr: 1.5,
      reducedMotion: true,
    }));
    expect(waterAccents.visible).toBe(true);
    expect(gullFlock?.visible).toBe(true);
    expect(wakes.every((wake) => !wake.visible)).toBe(true);

    expect([balanced, recovery, constrained, reduced].map((metrics) => metrics.schedulerTier))
      .toEqual(["balanced", "recovery", "constrained", "full"]);
    expect(new Set(
      [balanced, recovery, constrained, reduced].map((metrics) => metrics.objectCount),
    ).size).toBe(1);
    expect(new Set(
      [balanced, recovery, constrained, reduced].map((metrics) => metrics.visibleShipCount),
    ).size).toBe(1);

    renderer.dispose();
  });

  it("creates the post composer, drives it per tier, and disposes it once", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    expect(postHarness.instances).toHaveLength(1);
    const post = postHarness.instances.at(-1)!;

    const full = renderer.render(rendererFrame(world, "full"));
    expect(post.setEnabled).toHaveBeenLastCalledWith(true);
    expect(post.setBloomEnabled).toHaveBeenLastCalledWith(true);
    expect(post.render).toHaveBeenCalled();
    expect(full.composerEnabled).toBe(true);
    expect(full.postPassList).toEqual(["render", "bloom", "grade", "output"]);

    // Recovery keeps the composer but drops the bloom pass.
    renderer.render(rendererFrame(world, "recovery"));
    expect(post.setEnabled).toHaveBeenLastCalledWith(true);
    // W6.3: bloom survives recovery now that it runs at half resolution —
    // it is the night identity and this is the tier the app usually sits in.
    expect(post.setBloomEnabled).toHaveBeenLastCalledWith(true);

    // Constrained bypasses the composer entirely (direct render).
    const constrained = renderer.render(rendererFrame(world, "constrained"));
    expect(post.setEnabled).toHaveBeenLastCalledWith(false);
    expect(constrained.composerEnabled).toBe(false);
    expect(constrained.postPassList).toEqual([]);

    renderer.dispose();
    expect(post.dispose).toHaveBeenCalledTimes(1);
  });

  it("reveals inspection detail only for Explore or the focused entity", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(world, "balanced"));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const contentRoot = scene.children.at(-1)!;
    const shipDetails = namedGroups(contentRoot, "ship-fine-detail");
    const dockDetails = namedGroups(contentRoot, "dock-fine-detail");
    const wakeDetails = namedGroups(contentRoot, "ship-wake-detail");
    expect(shipDetails.length).toBe(selectGardenObservatorySlice(world, null).ships.length);
    expect(dockDetails.length).toBe(world.docks.length);
    expect(shipDetails.every((detail) => !detail.visible)).toBe(true);
    expect(dockDetails.every((detail) => !detail.visible)).toBe(true);
    expect(wakeDetails.every((detail) => !detail.visible)).toBe(true);

    renderer.render(rendererFrame(world, "balanced", { cameraZoom: 1.05 }));
    expect(shipDetails.every((detail) => detail.visible)).toBe(true);
    expect(dockDetails.every((detail) => detail.visible)).toBe(true);
    expect(wakeDetails.every((detail) => detail.visible)).toBe(true);

    const selectedShip = selectGardenObservatorySlice(world, null).ships[0]!.ship;
    renderer.render(rendererFrame(world, "balanced", {
      selectedDetailId: selectedShip.detailId,
    }));
    expect(shipDetails.filter((detail) => detail.visible)).toHaveLength(1);
    expect(dockDetails.every((detail) => !detail.visible)).toBe(true);
    expect(wakeDetails.filter((detail) => detail.visible)).toHaveLength(1);

    renderer.render(rendererFrame(world, "balanced", {
      hoveredDetailId: world.docks[0]!.detailId,
    }));
    expect(shipDetails.every((detail) => !detail.visible)).toBe(true);
    expect(dockDetails.filter((detail) => detail.visible)).toHaveLength(1);
    expect(wakeDetails.every((detail) => !detail.visible)).toBe(true);

    renderer.dispose();
  });

  it("disposes replaced world content and tears down the renderer once", () => {
    const firstWorld = buildPharosVilleWorld(makePharosVilleWorldInput());
    const secondWorld = buildPharosVilleWorld(makePharosVilleWorldInput({
      generatedAt: (firstWorld.generatedAt ?? 0) + 1,
    }));
    const canvas = document.createElement("canvas");
    const renderer = createThreeWorldRenderer({
      canvas,
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(firstWorld, "full"));

    const webGlRenderer = rendererHarness.instances.at(-1)!;
    const scene = webGlRenderer.lastScene!;
    const firstContentRoot = scene.children.at(-1)!;
    const firstGeometry = firstGeometryIn(firstContentRoot);
    const firstGeometryDispose = vi.spyOn(firstGeometry, "dispose");

    renderer.render(rendererFrame(firstWorld, "full"));
    expect(firstGeometryDispose).not.toHaveBeenCalled();

    renderer.render(rendererFrame(secondWorld, "full"));
    const secondContentRoot = scene.children.at(-1)!;
    expect(secondContentRoot).not.toBe(firstContentRoot);
    expect(firstContentRoot.parent).toBeNull();
    expect(firstGeometryDispose).toHaveBeenCalledTimes(1);

    const secondGeometryDispose = vi.spyOn(firstGeometryIn(secondContentRoot), "dispose");
    const waterGeometryDispose = vi.spyOn(
      (scene.children[3] as Mesh).geometry,
      "dispose",
    );
    renderer.dispose();
    renderer.dispose();

    expect(secondGeometryDispose).toHaveBeenCalledTimes(1);
    expect(waterGeometryDispose).toHaveBeenCalledTimes(1);
    expect(webGlRenderer.renderLists.dispose).toHaveBeenCalledTimes(1);
    expect(webGlRenderer.dispose).toHaveBeenCalledTimes(1);
    expect(() => renderer.render(rendererFrame(secondWorld, "full"))).toThrow(
      "Cannot render a disposed Three.js world renderer.",
    );
  });
});

describe("Garden Observatory data selection", () => {
  it("chooses the largest dock and a spatially separate second dock", () => {
    const docks = [
      dock("largest", 100, 0, 0),
      dock("adjacent", 90, 3, 0),
      dock("separate", 80, 12, 0),
    ];

    expect(selectGardenDocks(docks).map((entry) => entry.id)).toEqual([
      "largest",
      "separate",
    ]);
  });

  it("selects a stable cross-section with risk and hull variety when capped", () => {
    const hulls: ShipHull[] = [
      "treasury-galleon",
      "chartered-brigantine",
      "dao-schooner",
      "algo-junk",
      "crypto-caravel",
    ];
    const zones: ShipNode["riskZone"][] = ["calm", "watch", "alert", "warning", "danger"];
    const ships = Array.from({ length: 26 }, (_, index) => ship(
      `ship-${String(index).padStart(2, "0")}`,
      hulls[index % hulls.length]!,
      zones[index % zones.length]!,
      10_000 - index,
    ));

    // D1: the default limit is now 320 (capacity, not composition), so the
    // ranking contract is exercised with an explicit cap.
    const first = selectRepresentativeShips(ships, 20);
    const second = selectRepresentativeShips([...ships].reverse(), 20);

    expect(first).toHaveLength(20);
    expect(second.map((entry) => entry.id)).toEqual(first.map((entry) => entry.id));
    expect(first.some((entry) => entry.riskZone === "danger")).toBe(true);
    expect(new Set(first.map((entry) => entry.visual.hull)).size).toBeGreaterThanOrEqual(4);
  });

});

function rendererFrame(
  world: PharosVilleWorld,
  tier: PharosVilleRenderSchedulerTier,
  options: {
    cameraZoom?: number;
    dpr?: number;
    hoveredDetailId?: string | null;
    reducedMotion?: boolean;
    selectedDetailId?: string | null;
  } = {},
): ThreeWorldRendererFrame {
  const reducedMotion = options.reducedMotion ?? false;
  const camera = defaultCamera({ height: 1000, map: world.map, width: 1440 });
  if (options.cameraZoom != null) camera.zoom = options.cameraZoom;
  const samples = new Map<string, ShipMotionSample>();
  const representative = selectGardenObservatorySlice(world, null).ships[0]?.ship;
  if (representative) {
    samples.set(representative.id, {
      heading: { x: 1, y: 0 },
      mapVisibilityAlpha: 1,
      state: "sailing",
      tile: representative.tile,
      wakeIntensity: 1,
    } as ShipMotionSample);
  }
  return {
    logos: emptyLogoAssets,
    camera,
    dpr: options.dpr ?? 1,
    height: 1000,
    hoveredDetailId: options.hoveredDetailId ?? null,
    motionPlan: { shipRoutes: new Map() } as unknown as ThreeWorldRendererFrame["motionPlan"],
    reducedMotion,
    renderScheduler: {
      targetFrameMs: 16.7,
      tier,
    },
    seaState: seaStateForWorld(world, { reducedMotion, wallClockHour: 12 }),
    selectedDetailId: options.selectedDetailId ?? null,
    shipMotionSamples: samples,
    timeSeconds: reducedMotion ? 0 : 12,
    wallClockHour: 12,
    width: 1440,
    world,
  };
}

function wakeGroups(root: Object3D): Group[] {
  const wakes: Group[] = [];
  root.traverse((object) => {
    if (object instanceof Group && object.name === "ship-wake") {
      wakes.push(object);
    }
  });
  return wakes;
}

function namedGroups(root: Object3D, name: string): Group[] {
  const groups: Group[] = [];
  root.traverse((object) => {
    if (object instanceof Group && object.name === name) groups.push(object);
  });
  return groups;
}

function firstGeometryIn(root: Object3D): BufferGeometry {
  let result: BufferGeometry | null = null;
  root.traverse((object) => {
    if (result) return;
    const geometry = (object as Object3D & { geometry?: BufferGeometry }).geometry;
    if (geometry) result = geometry;
  });
  if (!result) throw new Error("Expected rendered world content to own geometry.");
  return result;
}

function dock(
  id: string,
  totalUsd: number,
  x: number,
  y: number,
): PharosVilleWorld["docks"][number] {
  return {
    detailId: id,
    id,
    tile: { x, y },
    totalUsd,
  } as PharosVilleWorld["docks"][number];
}

function ship(
  id: string,
  hull: ShipHull,
  riskZone: ShipNode["riskZone"],
  marketCapUsd: number,
): ShipNode {
  return {
    change7dPct: marketCapUsd % 7,
    detailId: id,
    id,
    marketCapUsd,
    riskZone,
    tile: { x: 1, y: 1 },
    visual: {
      hull,
    },
  } as ShipNode;
}

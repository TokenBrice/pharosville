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
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureMintBurn,
  fixtureStability,
  makePharosVilleWorldInput,
} from "../__fixtures__/pharosville-world";
import type {
  ThreeLogoAssets,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { defaultCamera } from "../systems/camera";
import { screenToTile } from "../systems/projection";
import type { PharosVilleWorld, ShipHull, ShipNode } from "../systems/world-types";
import {
  selectGardenDocks,
  selectGardenObservatorySlice,
  selectRepresentativeShips,
} from "../systems/garden-observatory-slice";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { seaStateForWorld } from "../systems/sea-state";
import { DAY_CYCLE_SKY_PRESETS, type DayCyclePhase } from "./garden-day-cycle";
import {
  FLIGHT_TENDERS_MESH_NAME,
  FLIGHT_TENDERS_PER_TITAN,
  FLIGHT_TENDER_TITAN_COUNT,
} from "./garden-flight-tenders";
import { OVERVIEW_LOD_DETAIL_NAMES } from "./garden-overview-lod";
import {
  createThreeWorldRenderer,
  disposeThreeObjectTree,
} from "./world-renderer";

type TestWebGlRenderer = {
  clear: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  info: {
    render: { calls: number; lines: number; points: number; triangles: number };
  };
  initTexture: ReturnType<typeof vi.fn>;
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
  isComposerEnabled: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  setAOQuality: ReturnType<typeof vi.fn>;
  setAOTierWeight: ReturnType<typeof vi.fn>;
  setAOZoomDetail: ReturnType<typeof vi.fn>;
  setBloomEnabled: ReturnType<typeof vi.fn>;
  setEnabled: ReturnType<typeof vi.fn>;
  setGrade: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
};

const postHarness = vi.hoisted(() => ({
  instances: [] as TestGardenPost[],
}));

type TestGardenEnvironment = {
  readonly bakeCount: number;
  /**
   * The dome's zenith colour AT EACH BAKE. The probe renders the shared dome
   * material, so this is the sky the bake actually captured — which is not the
   * same thing as the phase it was keyed under unless the renderer grades the
   * dome first.
   */
  readonly bakedZeniths: number[];
  dispose: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const environmentHarness = vi.hoisted(() => ({
  instances: [] as TestGardenEnvironment[],
}));

// The real composer needs a live WebGL2 context, so stub it. The fake still
// draws via the mocked renderer (keeping `lastScene` populated for the scene
// assertions) and tracks the tier policy the renderer drives it with.
vi.mock("./garden-post", () => ({
  createGardenPost: vi.fn((renderer: { render: (scene: unknown, camera: unknown) => void }, scene: unknown, camera: unknown) => {
    let enabled = true;
    let bloomEnabled = true;
    let aoEnabled = true;
    const instance: TestGardenPost = {
      dispose: vi.fn(),
      // Mirrors the real getPassList, which lists only the enabled passes.
      getPassList: vi.fn(() => (enabled
        ? [
          "render",
          ...(aoEnabled ? ["n8ao"] : []),
          ...(bloomEnabled ? ["bloom"] : []),
          "grade",
          "output",
          "lut",
          "smaa",
        ]
        : [])),
      isComposerEnabled: vi.fn(() => enabled),
      render: vi.fn(() => {
        renderer.render(scene, camera);
      }),
      setAOTierWeight: vi.fn((value: number) => {
        aoEnabled = value > 0;
      }),
      setAOQuality: vi.fn(),
      setAOZoomDetail: vi.fn(),
      setBloomEnabled: vi.fn((value: boolean) => {
        bloomEnabled = value;
      }),
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

// W6.5: the PMREM probe needs a live WebGL2 context to bake, so stub it. The
// fake keeps the real module's caching CONTRACT — one bake per distinct
// quantised phase key — so "the probe is not rebuilt per frame" stays a real
// assertion here rather than something only the GPU could check.
vi.mock("./garden-environment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./garden-environment")>();
  return {
    ...actual,
    createGardenEnvironment: vi.fn((
      _renderer: unknown,
      _scene: unknown,
      domeMaterial: { uniforms: { uZenith: { value: { getHex: () => number } } } },
    ) => {
      let bakedKey: string | null = null;
      let bakeCount = 0;
      const bakedZeniths: number[] = [];
      const instance: TestGardenEnvironment = {
        dispose: vi.fn(),
        get bakeCount() {
          return bakeCount;
        },
        bakedZeniths,
        update: vi.fn((phase: DayCyclePhase) => {
          const key = actual.gardenEnvironmentPhaseKey(phase);
          if (key === bakedKey) return;
          bakedKey = key;
          bakeCount += 1;
          // The real bake renders this material. Record what it would have got.
          bakedZeniths.push(domeMaterial.uniforms.uZenith.value.getHex());
        }),
      };
      environmentHarness.instances.push(instance);
      return instance;
    }),
  };
});

const emptyLogoAssets: ThreeLogoAssets = {
  getLogo: () => null,
  getLogoGenerationKey: () => "test",
};

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    autoClear = true;
    clear = vi.fn();
    dispose = vi.fn();
    getClearAlpha = vi.fn(() => 1);
    getClearColor = vi.fn((color: { setRGB: (r: number, g: number, b: number) => void }) => {
      color.setRGB(0, 0, 0);
      return color;
    });
    getRenderTarget = vi.fn(() => null);
    initTexture = vi.fn();
    info = {
      // `autoReset` and `reset()` mirror the real WebGLRenderer: the renderer
      // accumulates a frame's passes by hand so the post composer's
      // full-screen quads cannot clobber the scene's counts.
      autoReset: true,
      memory: { geometries: 145, textures: 1 },
      render: { calls: 0, lines: 0, points: 0, triangles: 0 },
      reset: vi.fn(() => {
        this.info.render.calls = 0;
        this.info.render.lines = 0;
        this.info.render.points = 0;
        this.info.render.triangles = 0;
      }),
    };
    lastScene: Scene | null = null;
    outputColorSpace = "";
    render = vi.fn((scene: Scene) => {
      this.lastScene = scene;
      this.info.render.calls += 1;
      this.info.render.triangles += 2;
    });
    renderLists = { dispose: vi.fn() };
    setClearColor = vi.fn();
    setPixelRatio = vi.fn();
    setRenderTarget = vi.fn();
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
  environmentHarness.instances.length = 0;
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
  it("queues static uploads and reports recurring scene/offscreen work separately", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const webGlRenderer = rendererHarness.instances.at(-1)!;
    expect(webGlRenderer.initTexture).not.toHaveBeenCalled();

    const wakeFrame = (timeSeconds: number) => {
      const frame = rendererFrame(world, "full", { timeSeconds });
      const center = screenToTile(
        { x: frame.width / 2, y: frame.height / 2 },
        frame.camera,
      );
      for (const sample of frame.shipMotionSamples.values()) sample.tile = center;
      return frame;
    };
    const first = renderer.render(wakeFrame(1));
    expect(webGlRenderer.initTexture).toHaveBeenCalledTimes(2);
    expect(first.textureUploads).toMatchObject({
      failed: 0,
      pending: 0,
      uploaded: 2,
    });
    expect(first.environmentBakeCount).toBe(1);
    expect(first.environmentBakeCountChange).toBe(1);
    expect(first.gpu.sceneCalls).toBe(1);
    expect(first.gpu.offscreenCalls).toBe(0);
    expect(first.gpu.calls).toBe(first.gpu.sceneCalls + first.gpu.offscreenCalls);
    expect(first.textureOwnerCensus).toMatchObject({
      minimumUnattributedRendererTextures: 0,
      rendererTextures: 1,
    });

    // The first scene frame collects ship stamps. The next frame consumes
    // them in one feedback and one stamp pass, both represented in the
    // recurring total while the visible scene subtotal stays stable.
    const second = renderer.render(wakeFrame(2));
    expect(second.environmentBakeCountChange).toBe(0);
    expect(second.environmentBakeCalls).toBe(0);
    expect(second.gpu.sceneCalls).toBe(1);
    expect(second.gpu.offscreenCalls).toBe(2);
    expect(second.gpu.calls).toBe(3);

    renderer.dispose();
  });

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

    const full = renderer.render(rendererFrame(world, "full", { timeSeconds: 1 }));
    expect(post.setEnabled).toHaveBeenLastCalledWith(true);
    expect(post.setBloomEnabled).toHaveBeenLastCalledWith(true);
    expect(post.setAOTierWeight).toHaveBeenLastCalledWith(1);
    expect(post.setAOQuality).toHaveBeenLastCalledWith("full");
    expect(post.render).toHaveBeenCalled();
    expect(full.composerEnabled).toBe(true);
    expect(full.postPassList)
      .toEqual(["render", "n8ao", "bloom", "grade", "output", "lut", "smaa"]);

    // Recovery keeps the composer and eases AO away instead of flashing the
    // local grounding multiply off in one frame. The previous quality stays
    // active during fade-out so a recovery transition never recompiles.
    renderer.render(rendererFrame(world, "recovery", { timeSeconds: 2 }));
    expect(post.setEnabled).toHaveBeenLastCalledWith(true);
    // W6.3: bloom survives recovery now that the mipmap-blur pyramid is cheap
    // — it is the night identity and this is the tier the app usually sits in.
    expect(post.setBloomEnabled).toHaveBeenLastCalledWith(true);
    const recoveryWeight = post.setAOTierWeight.mock.calls.at(-1)?.[0] as number;
    expect(recoveryWeight).toBeGreaterThan(0);
    expect(recoveryWeight).toBeLessThan(1);
    expect(post.setAOQuality).toHaveBeenLastCalledWith("full");

    // Constrained sheds the bloom pyramid. Once the damped AO weight reaches
    // exact zero, its pass disables while AgX, grade, vignette and SMAA remain.
    for (let timeSeconds = 3; timeSeconds < 6; timeSeconds += 1) {
      renderer.render(rendererFrame(world, "constrained", { timeSeconds }));
    }
    const constrained = renderer.render(rendererFrame(world, "constrained", {
      timeSeconds: 6,
    }));
    expect(post.setEnabled).toHaveBeenLastCalledWith(true);
    expect(post.setBloomEnabled).toHaveBeenLastCalledWith(false);
    expect(post.setAOTierWeight).toHaveBeenLastCalledWith(0);
    expect(constrained.composerEnabled).toBe(true);
    expect(constrained.postPassList).toEqual(["render", "grade", "output", "lut", "smaa"]);

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
    const wakes = wakeGroups(contentRoot);
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
    expect(wakes.filter((wake) => wake.visible)).toHaveLength(1);

    renderer.render(rendererFrame(world, "balanced", {
      hoveredDetailId: world.docks[0]!.detailId,
    }));
    expect(shipDetails.every((detail) => !detail.visible)).toBe(true);
    expect(dockDetails.filter((detail) => detail.visible)).toHaveLength(1);
    expect(wakeDetails.every((detail) => !detail.visible)).toBe(true);

    renderer.dispose();
  });

  it("sheds overview detail at whole-map framing and restores it at default framing", () => {
    // The dense fixture is the one that composes the props this policy governs
    // (a small world builds no crane and no hero badges).
    const world = buildPharosVilleWorld({
      cemeteryEntries: [],
      chains: denseFixtureChains,
      freshness: {},
      pegSummary: denseFixturePegSummary,
      reportCards: denseFixtureReportCards,
      stability: fixtureStability,
      stablecoins: denseFixtureStablecoins,
      stress: denseFixtureStress,
    });
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(world, "full", { cameraZoom: 0.7776, timeSeconds: 1 }));
    const contentRoot = rendererHarness.instances.at(-1)!.lastScene!.children.at(-1)!;
    const props = new Map(OVERVIEW_LOD_DETAIL_NAMES.map((name) => [
      name,
      namedObjects(contentRoot, name),
    ]));

    // Every name the policy claims must still exist in the composed world; a
    // rename upstream must fail here rather than silently un-cull the frame.
    for (const [name, objects] of props) {
      expect(objects.length, `no composed node named ${name}`).toBeGreaterThan(0);
    }
    const authored = [...props.values()].flat().map((object) => ({
      object,
      position: object.position.clone(),
      scale: object.scale.clone(),
    }));
    expect(authored.every((entry) => entry.object.visible)).toBe(true);

    // A long frame delta snaps the ease, so one whole-map frame is enough.
    renderer.render(rendererFrame(world, "full", { cameraZoom: 0.28, timeSeconds: 11 }));
    for (const [name, objects] of props) {
      expect(objects.every((object) => !object.visible), `${name} still drawn`).toBe(true);
    }

    renderer.render(rendererFrame(world, "full", { cameraZoom: 0.7776, timeSeconds: 21 }));
    for (const entry of authored) {
      expect(entry.object.visible).toBe(true);
      expect(entry.object.scale.equals(entry.scale)).toBe(true);
      expect(entry.object.position.equals(entry.position)).toBe(true);
    }

    renderer.dispose();
  });

  it("puts tenders on the water only while the gauge reports flight to quality", () => {
    const flying = buildPharosVilleWorld(makePharosVilleWorldInput({
      mintBurn: {
        ...fixtureMintBurn,
        gauge: { ...fixtureMintBurn.gauge, flightIntensity: 65, flightToQuality: true },
      },
    }));
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(flying, "full", { timeSeconds: 1 }));
    const flyingRoot = rendererHarness.instances.at(-1)!.lastScene!.children.at(-1)!;
    const boats = namedObjects(flyingRoot, FLIGHT_TENDERS_MESH_NAME)
      .filter((object) => object instanceof InstancedMesh);
    // One draw call for every boat working every titan — and no more titans
    // than the world actually renders, so a small world stays consistent.
    const renderedShips = selectGardenObservatorySlice(flying, null).ships.length;
    expect(boats).toHaveLength(1);
    expect(boats[0]!.count).toBe(
      Math.min(FLIGHT_TENDER_TITAN_COUNT, renderedShips) * FLIGHT_TENDERS_PER_TITAN,
    );

    // Scenery, not fleet: a tender is not a ShipNode, so it can reach neither
    // the fleet's own figures nor the only map this renderer resolves a click
    // or a hover through.
    expect(flying.ships.some((ship) => ship.id.includes("tender"))).toBe(false);
    expect(Object.keys(flying.entityById).some((id) => id.includes("tender"))).toBe(false);
    expect(Object.keys(flying.detailIndex).some((id) => id.includes("tender"))).toBe(false);

    // The gauge reading false builds nothing at all — not a hidden mesh, not an
    // empty instanced draw. The default fixture is exactly that case.
    const calm = buildPharosVilleWorld(makePharosVilleWorldInput());
    expect(calm.fleetIssuance?.flightToQuality).toBe(false);
    renderer.render(rendererFrame(calm, "full", { timeSeconds: 2 }));
    const calmRoot = rendererHarness.instances.at(-1)!.lastScene!.children.at(-1)!;
    expect(namedObjects(calmRoot, FLIGHT_TENDERS_MESH_NAME)
      .filter((object) => object instanceof InstancedMesh)).toHaveLength(0);

    renderer.dispose();
  });

  it("retains semantically identical content, rebuilds visual changes, and tears down once", () => {
    const firstWorld = buildPharosVilleWorld(makePharosVilleWorldInput());
    const metadataOnlyWorld = buildPharosVilleWorld(makePharosVilleWorldInput({
      generatedAt: (firstWorld.generatedAt ?? 0) + 1,
    }));
    const subject = firstWorld.ships[0]!;
    const visuallyChangedWorld: PharosVilleWorld = {
      ...metadataOnlyWorld,
      ships: metadataOnlyWorld.ships.map((ship) => (
        ship.id === subject.id
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    };
    const canvas = document.createElement("canvas");
    const renderer = createThreeWorldRenderer({
      canvas,
      onContextFailure: vi.fn(),
    });
    expect(renderer.render(rendererFrame(firstWorld, "full")).contentReplacementCount).toBe(1);

    const webGlRenderer = rendererHarness.instances.at(-1)!;
    const scene = webGlRenderer.lastScene!;
    const firstContentRoot = scene.children.at(-1)!;
    const firstGeometry = firstGeometryIn(firstContentRoot);
    const firstGeometryDispose = vi.spyOn(firstGeometry, "dispose");

    renderer.render(rendererFrame(firstWorld, "full"));
    expect(firstGeometryDispose).not.toHaveBeenCalled();

    expect(renderer.render(rendererFrame(metadataOnlyWorld, "full")).contentReplacementCount).toBe(1);
    expect(scene.children.at(-1)).toBe(firstContentRoot);
    expect(firstGeometryDispose).not.toHaveBeenCalled();

    expect(renderer.render(rendererFrame(visuallyChangedWorld, "full")).contentReplacementCount).toBe(2);
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
    expect(() => renderer.render(rendererFrame(visuallyChangedWorld, "full"))).toThrow(
      "Cannot render a disposed Three.js world renderer.",
    );
  });

  it("rides out a WebGL context loss that is restored, and only fails if it is not", () => {
    vi.useFakeTimers();
    try {
      const world = buildPharosVilleWorld(makePharosVilleWorldInput());
      const canvas = document.createElement("canvas");
      const onContextFailure = vi.fn();
      const onAssetReady = vi.fn();
      const renderer = createThreeWorldRenderer({ canvas, onAssetReady, onContextFailure });
      const live = renderer.render(rendererFrame(world, "full"));
      expect(live.objectCount).toBeGreaterThan(0);

      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      // Held, not failed: the frame reports the last good numbers so the
      // scheduler sees a hold rather than a collapse.
      expect(onContextFailure).not.toHaveBeenCalled();
      expect(renderer.render(rendererFrame(world, "full"))).toEqual(live);

      canvas.dispatchEvent(new Event("webglcontextrestored"));
      expect(onAssetReady).toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(onContextFailure).not.toHaveBeenCalled();
      expect(renderer.render(rendererFrame(world, "full")).objectCount).toBeGreaterThan(0);

      // A loss that never comes back still retires the world to the DOM
      // overview, just after the grace period rather than immediately.
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      expect(onContextFailure).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(onContextFailure).toHaveBeenCalledTimes(1);

      renderer.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("W6.5 sky-probe environment", () => {
  it("bakes once per quantised day-cycle step, not once per frame, and disposes with the renderer", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    // Twenty frames at one fixed hour. A probe rebuilt per frame would leak a
    // PMREM render target per frame, which is the regression this guards.
    for (let frame = 0; frame < 20; frame += 1) {
      renderer.render(rendererFrame(world, "full", { timeSeconds: frame, wallClockHour: 12 }));
    }
    const environment = environmentHarness.instances.at(-1)!;
    expect(environment.update).toHaveBeenCalledTimes(20);
    expect(environment.bakeCount).toBe(1);

    // Noon to midnight is a different sky, so it must bake again...
    renderer.render(rendererFrame(world, "full", { wallClockHour: 0 }));
    expect(environment.bakeCount).toBe(2);

    // ...but a minute either side of midnight is the same sky, and must not.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 0.02 }));
    renderer.render(rendererFrame(world, "full", { wallClockHour: 23.98 }));
    expect(environment.bakeCount).toBe(2);

    renderer.dispose();
    expect(environment.dispose).toHaveBeenCalledTimes(1);
  });

  it("bakes the sky its key names, starting with the very first frame", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    // The dome's uniforms are CONSTRUCTED at the night preset and only graded
    // once a frame runs. The probe bakes early in the frame — before the full
    // scene update — so a first frame at noon used to cache the night sky under
    // the noon key. `daylight` is pinned at 1 across the whole flat middle of
    // the day, so that key never moved again and every metal surface in the
    // world stayed lit by a night probe until the light started to fail.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 12 }));
    const environment = environmentHarness.instances.at(-1)!;
    expect(environment.bakeCount).toBe(1);
    expect(environment.bakedZeniths[0]).toBe(DAY_CYCLE_SKY_PRESETS.day.zenith.getHex());
    expect(environment.bakedZeniths[0]).not.toBe(DAY_CYCLE_SKY_PRESETS.night.zenith.getHex());

    // And every later rebake is the sky of its own frame, not the last one's.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 0 }));
    expect(environment.bakedZeniths[1]).toBe(DAY_CYCLE_SKY_PRESETS.night.zenith.getHex());

    renderer.dispose();
  });

  it("hands the probe the frame's clock and its own load verdict (W1.5)", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(world, "full", { timeSeconds: 1, wallClockHour: 12 }));
    renderer.render(rendererFrame(world, "full", { timeSeconds: 1.1, wallClockHour: 12 }));
    const environment = environmentHarness.instances.at(-1)!;
    const steady = environment.update.mock.calls.at(-1)![2];
    // The ambient crossfade between bakes is a real-time ease, so the probe
    // needs the same delta every other eased system in the frame runs on —
    // without it the module was left inventing one from `performance.now()`.
    expect(steady.deltaSeconds).toBeCloseTo(0.1, 6);
    expect(steady.reducedMotion).toBe(false);
    expect(steady.bakeAllowed).toBe(true);

    // A camera gesture is the one frame in the app that most wants the budget
    // left alone, and an episodic PMREM bake is exactly the kind of work that
    // can wait for the gesture to end. The wait is bounded inside the probe.
    renderer.render(rendererFrame(world, "interaction", { timeSeconds: 1.2, wallClockHour: 12 }));
    expect(environment.update.mock.calls.at(-1)![2].bakeAllowed).toBe(false);

    // The still frame has no later frame to defer to, and says so.
    renderer.render(rendererFrame(world, "full", { reducedMotion: true, wallClockHour: 12 }));
    expect(environment.update.mock.calls.at(-1)![2].reducedMotion).toBe(true);

    renderer.dispose();
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
    timeSeconds?: number;
    wallClockHour?: number;
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
    timeSeconds: reducedMotion ? 0 : (options.timeSeconds ?? 12),
    wallClockHour: options.wallClockHour ?? 12,
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

function namedObjects(root: Object3D, name: string): Object3D[] {
  const objects: Object3D[] = [];
  root.traverse((object) => {
    if (object.name === name) objects.push(object);
  });
  return objects;
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

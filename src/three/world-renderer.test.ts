// @vitest-environment jsdom
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import { overCapacityWorldFixture } from "../__fixtures__/over-capacity-world";
import { AccessibilityLedger } from "../components/accessibility-ledger";
import type {
  ThreeLogoAssets,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { defaultCamera } from "../systems/camera";
import { gardenWaterPlateContainsTile, screenToTile } from "../systems/projection";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  bearingInsideRimOpening,
  RIM_OPENINGS,
  rimLandAt,
} from "../systems/garden-rim";
import type { DockNode, PharosVilleWorld, ShipHull, ShipNode } from "../systems/world-types";
import {
  GARDEN_HULL_SILHOUETTES,
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenShipVisualScale,
  resolveGardenShipDisplayTile,
  selectGardenDocks,
  selectGardenObservatorySlice,
  selectRepresentativeShips,
} from "../systems/garden-observatory-slice";
import {
  gardenShipWaterMarginTiles,
  isGardenShipWater,
} from "../systems/garden-water-exclusion";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { seaStateForWorld } from "../systems/sea-state";
import { stableUnit } from "../systems/stable-random";
import { gardenAlmanacEventForDate } from "../systems/garden-almanac";
import { DAY_CYCLE_SKY_PRESETS, type DayCyclePhase } from "./garden-day-cycle";
import { gardenQuayEpistemicHazeUniform } from "./garden-height-fog";
import {
  FLIGHT_TENDERS_MESH_NAME,
  FLIGHT_TENDERS_PER_TITAN,
  FLIGHT_TENDER_TITAN_COUNT,
} from "./garden-flight-tenders";
import { OVERVIEW_LOD_DETAIL_NAMES } from "./garden-overview-lod";
import { WAKE_TRAIL_QUADS } from "./garden-wake-batch";
import {
  createThreeWorldRenderer,
  disposeThreeObjectTree,
  gardenStaticShadowBounds,
  gardenHarborLanternLaneId,
  gardenStationRouteEndpoints,
  gardenMistBoundaryTile,
  gardenTransitionWaveReady,
  GARDEN_SHIP_TRANSITION_MIN_SECONDS,
  GARDEN_TRANSITION_WAVE_SECONDS,
  sampleGardenShipTransition,
  type GardenShipTransitionSpec,
} from "./world-renderer";

describe("garden static shadow bounds", () => {
  it("centres a padded square on the island and remote station roots", () => {
    const points = [
      { x: 60, z: 64 },
      { x: 14, z: 74 },
      { x: 131, z: 15 },
      { x: 121, z: 131 },
    ];
    const bounds = gardenStaticShadowBounds(points, 12);

    expect(bounds.centerX).toBeCloseTo(72.5);
    expect(bounds.centerZ).toBeCloseTo(73);
    expect(bounds.radius).toBeCloseTo(70.5);
    for (const point of points) {
      expect(Math.abs(point.x - bounds.centerX)).toBeLessThanOrEqual(bounds.radius - 12);
      expect(Math.abs(point.z - bounds.centerZ)).toBeLessThanOrEqual(bounds.radius - 12);
    }
  });

  it("includes the finite rim mesh extents in the world-derived fit", () => {
    const edge = 140 * Math.SQRT2;
    const bounds = gardenStaticShadowBounds([
      { x: 0, z: 0 },
      { x: edge, z: 0 },
      { x: 0, z: edge },
      { x: edge, z: edge },
      { x: 14, z: 74 },
      { x: 131, z: 15 },
    ], 28);

    expect(bounds.centerX).toBeCloseTo(edge / 2);
    expect(bounds.centerZ).toBeCloseTo(edge / 2);
    expect(bounds.radius).toBeCloseTo(edge / 2 + 28);
  });
});

describe("engawa lantern lane", () => {
  it("displaces harbor-lantern.11 without removing its shore mesh", () => {
    expect(gardenHarborLanternLaneId(10)).toBe("harbor-lantern.10");
    expect(gardenHarborLanternLaneId(11)).toBeNull();
    expect(gardenHarborLanternLaneId(12)).toBe("harbor-lantern.12");
  });
});

describe("station route pulse endpoints", () => {
  it("follows the station's authored seaward bearing instead of the island radial", () => {
    const leftLobe = gardenStationRouteEndpoints({ x: 14, z: 74 }, 0);
    expect(leftLobe.station).toEqual({ x: 18, z: 74 });
    expect(leftLobe.openWater).toEqual({ x: 44, z: 74 });

    const rightCove = gardenStationRouteEndpoints({ x: 131, z: 80 }, Math.PI);
    expect(rightCove.station.x).toBeCloseTo(127);
    expect(rightCove.openWater.x).toBeCloseTo(101);
  });
});

type TestWebGlRenderer = {
  clear: ReturnType<typeof vi.fn>;
  compile: ReturnType<typeof vi.fn>;
  compileAsync: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  info: {
    memory: { geometries: number; textures: number };
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
  simulateAOTextures: false,
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
  createGardenPost: vi.fn((renderer: {
    info: { memory: { textures: number } };
    render: (scene: unknown, camera: unknown) => void;
  }, scene: unknown, camera: unknown) => {
    let enabled = true;
    let bloomEnabled = true;
    let aoEnabled = true;
    let aoZoomDetail = 1;
    let aoTexturesResident = false;
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
        if (
          postHarness.simulateAOTextures
          && enabled
          && aoEnabled
          && aoZoomDetail > 0
          && !aoTexturesResident
        ) {
          renderer.info.memory.textures += 7;
          aoTexturesResident = true;
        }
        renderer.render(scene, camera);
      }),
      setAOTierWeight: vi.fn((value: number) => {
        aoEnabled = value > 0;
      }),
      setAOQuality: vi.fn(),
      setAOZoomDetail: vi.fn((value: number) => {
        aoZoomDetail = value;
        if (postHarness.simulateAOTextures && value <= 0 && aoTexturesResident) {
          renderer.info.memory.textures -= 7;
          aoTexturesResident = false;
        }
      }),
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
    compile = vi.fn(() => new Set());
    compileAsync = vi.fn(() => Promise.resolve());
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
  postHarness.simulateAOTextures = false;
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
  it("builds the docks part and station-root lanes from a station-less fallback dock", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const { station: _station, ...withoutStation } = world.docks[0]!;
    const stationlessWorld = {
      ...world,
      docks: [withoutStation as DockNode, ...world.docks.slice(1)],
    };
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    expect(() => renderer.render(rendererFrame(stationlessWorld, "full"))).not.toThrow();
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    expect(scene.getObjectByName("harbor-batch")).toBeDefined();
    expect(scene.getObjectByName("dock-chain-flag")).toBeInstanceOf(InstancedMesh);
    renderer.dispose();
  });

  it("allocates one hull and one sail batch for each of the six fleet families", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full"));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;

    expect(GARDEN_HULL_SILHOUETTES).toHaveLength(6);
    for (const silhouette of GARDEN_HULL_SILHOUETTES) {
      expect(scene.getObjectByName(`fleet-hull-${silhouette}`)).toBeInstanceOf(InstancedMesh);
      expect(scene.getObjectByName(`fleet-sails-${silhouette}`)).toBeInstanceOf(InstancedMesh);
    }
    expect(scene.getObjectByName("fleet-pennants")).toBeInstanceOf(InstancedMesh);
    renderer.dispose();
  });

  it("luffs chain flags in gusts and restores zero roll for reduced motion", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full", { timeSeconds: 2 }));
    const flags = rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("dock-chain-flag") as InstancedMesh;
    const matrix = new Matrix4();
    flags.getMatrixAt(0, matrix);
    const luffingUp = new Vector3(0, 1, 0).transformDirection(matrix);
    expect(Math.hypot(luffingUp.x, luffingUp.z)).toBeGreaterThan(0);

    renderer.render(rendererFrame(world, "full", { reducedMotion: true }));
    flags.getMatrixAt(0, matrix);
    const stillUp = new Vector3(0, 1, 0).transformDirection(matrix);
    expect(Math.hypot(stillUp.x, stillUp.z)).toBeCloseTo(0, 8);
    renderer.dispose();
  });

  it("mounts the data-derived pigeonnier roost and mover flock", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full", { timeSeconds: 12 }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const roost = scene.getObjectByName("pigeonnier-depeg-roost") as InstancedMesh;
    const movers = scene.getObjectByName("pigeonnier-notable-mover-pigeons") as InstancedMesh;
    expect(roost.count).toBe(world.pigeonnier.roost?.visualCount ?? 0);
    expect(movers.count).toBe(world.pigeonnier.notableMovers?.length ?? 0);
    expect(movers.visible).toBe((world.pigeonnier.notableMovers?.length ?? 0) > 0);
    renderer.dispose();
  });

  it("lets the authored waterfall displace the broad silver-water accents", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full", { timeSeconds: 12 }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    expect(scene.getObjectByName("garden-hero-waterfall")).toBeInstanceOf(Mesh);
    expect(scene.getObjectByName("water-silver-accents")!.visible).toBe(false);
    renderer.dispose();
  });

  it("renders only the frame-selected almanac event and holds its reduced-motion tableau", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const event = gardenAlmanacEventForDate(new Date("2026-08-13T00:00:00Z"));
    renderer.render({ ...rendererFrame(world, "full", { timeSeconds: 0 }), almanacEvent: event });
    renderer.render({ ...rendererFrame(world, "full", { timeSeconds: 9 }), almanacEvent: event });
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    expect(scene.getObjectByName(`garden-almanac-${event.id}`)!.visible).toBe(true);
    for (const id of ["heron-dusk", "lantern-round", "deep-night-meteor"]) {
      if (id !== event.id) expect(scene.getObjectByName(`garden-almanac-${id}`)!.visible).toBe(false);
    }

    renderer.render({
      ...rendererFrame(world, "full", { reducedMotion: true }),
      almanacEvent: event,
    });
    expect(scene.getObjectByName(`garden-almanac-${event.id}`)!.visible).toBe(true);
    renderer.dispose();
  });

  it("selects seasonal dressing once from the injected calendar date", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const spring = createThreeWorldRenderer({
      calendarDate: new Date("2026-04-12T12:00:00.000Z"),
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    spring.render(rendererFrame(world, "full"));
    expect(rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("garden-spring-water-petals")).toBeInstanceOf(InstancedMesh);
    spring.dispose();

    const autumn = createThreeWorldRenderer({
      calendarDate: new Date("2026-10-12T12:00:00.000Z"),
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    autumn.render(rendererFrame(world, "full"));
    expect(rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("garden-spring-water-petals")).toBeUndefined();
    expect(rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("garden-sky-autumn-geese")!.visible).toBe(true);
    autumn.dispose();

    const winter = createThreeWorldRenderer({
      calendarDate: new Date("2026-12-12T12:00:00.000Z"),
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    winter.render(rendererFrame(world, "full"));
    const lanterns = rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("ship-lantern-cores") as InstancedMesh;
    expect((lanterns.material as MeshStandardMaterial).emissive.getHexString())
      .toBe(new Color(HARBOR_PALETTE.lantern_warm).getHexString());
    winter.dispose();
  });

  it("queues static uploads, warms assembled variants, and reports recurring work", async () => {
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
    await renderer.warmup();
    expect(webGlRenderer.compile).toHaveBeenCalledTimes(1);
    expect(webGlRenderer.compile).toHaveBeenCalledWith(
      expect.any(Scene),
      expect.anything(),
    );
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

  it("routes endpoint staleness into existing water and quay draws", () => {
    const freshWorld = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const freshMetrics = renderer.render(rendererFrame(freshWorld, "full", { reducedMotion: true }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const water = scene.getObjectByName("garden-water") as Mesh;
    const waterMaterial = water.material as ShaderMaterial;
    expect(waterMaterial.uniforms.uPegSummaryEpistemicHaze!.value).toBe(0);
    expect(gardenQuayEpistemicHazeUniform.value).toBe(0);

    const staleWorld = {
      ...freshWorld,
      freshness: { chainsStale: true, pegSummaryStale: true },
    };
    const staleMetrics = renderer.render(rendererFrame(staleWorld, "full", { reducedMotion: true }));

    expect(scene.getObjectByName("garden-water")).toBe(water);
    expect(waterMaterial.uniforms.uPegSummaryEpistemicHaze!.value).toBe(1);
    expect(gardenQuayEpistemicHazeUniform.value).toBe(1);
    expect(staleMetrics.objectCount).toBe(freshMetrics.objectCount);
    expect(staleMetrics.gpu.sceneCalls).toBe(freshMetrics.gpu.sceneCalls);
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

  it("keeps N8AO textures cold at the landing and whole-map framings", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const post = postHarness.instances.at(-1)!;

    renderer.render(rendererFrame(world, "full", {
      cameraZoom: 0.648,
      timeSeconds: 1 / 60,
    }));

    // The animated overview LOD eases its own detail value from 1, but the
    // hidden-zoom target is already exact. The post owner must see that target
    // so N8AO cannot upload resources for a pass that is not drawn.
    expect(post.setAOZoomDetail).toHaveBeenLastCalledWith(0);
    renderer.render(rendererFrame(world, "full", {
      cameraZoom: 0.28,
      timeSeconds: 2 / 60,
    }));
    expect(post.setAOZoomDetail).toHaveBeenLastCalledWith(0);
    renderer.dispose();
  });

  it("releases AO textures after an inspection-to-whole-map transition settles", () => {
    postHarness.simulateAOTextures = true;
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());

    const freshWhole = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    freshWhole.render(rendererFrame(world, "full", {
      cameraZoom: 0.28,
      timeSeconds: 1 / 60,
    }));
    const freshWholeTextureCount = rendererHarness.instances.at(-1)!.info.memory.textures;
    freshWhole.dispose();

    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full", { cameraZoom: 1.05, timeSeconds: 1 / 60 }));
    const webgl = rendererHarness.instances.at(-1)!;
    const post = postHarness.instances.at(-1)!;
    expect(webgl.info.memory.textures).toBe(freshWholeTextureCount + 7);

    renderer.render(rendererFrame(world, "full", {
      cameraZoom: 0.28,
      timeSeconds: 2 / 60,
    }));
    const crossingDetail = post.setAOZoomDetail.mock.calls.at(-1)?.[0] as number;
    expect(crossingDetail).toBeGreaterThan(0);
    expect(crossingDetail).toBeLessThan(1);

    for (let frame = 3; frame <= 120; frame += 1) {
      renderer.render(rendererFrame(world, "full", {
        cameraZoom: 0.28,
        timeSeconds: frame / 60,
      }));
    }
    expect(post.setAOZoomDetail).toHaveBeenLastCalledWith(0);
    expect(webgl.info.memory.textures).toBeLessThanOrEqual(freshWholeTextureCount);
    renderer.dispose();
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
    const fishingPier = world.docks.find((dock) => dock.chainId === "solana");
    expect(fishingPier).toBeDefined();
    fishingPier!.station = {
      ...fishingPier!.station,
      type: "fishing-pier",
    };
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(world, "full", { cameraZoom: 0.648, timeSeconds: 1 }));
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

    renderer.render(rendererFrame(world, "full", { cameraZoom: 0.648, timeSeconds: 21 }));
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
    // empty instanced draw. The default fixture is exactly that case. (W4.1:
    // a cross-world refresh amortizes part rebuilds, so settle the queue.)
    const calm = buildPharosVilleWorld(makePharosVilleWorldInput());
    expect(calm.fleetIssuance?.flightToQuality).toBe(false);
    renderSettled(renderer, calm, { timeSeconds: 2 });
    const calmRoot = rendererHarness.instances.at(-1)!.lastScene!.children.at(-1)!;
    expect(namedObjects(calmRoot, FLIGHT_TENDERS_MESH_NAME)
      .filter((object) => object instanceof InstancedMesh)).toHaveLength(0);

    renderer.dispose();
  });

  it("retains semantically identical content, rebuilds only changed parts, and tears down once", () => {
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
    const contentRoot = scene.children.at(-1)!;
    const islandGeometryDispose = vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName("content-part-island")!),
      "dispose",
    );
    const dockGeometryDispose = vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName("content-part-docks")!),
      "dispose",
    );
    const shipsGeometryDispose = vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName("content-part-ships")!),
      "dispose",
    );

    renderer.render(rendererFrame(firstWorld, "full"));
    expect(islandGeometryDispose).not.toHaveBeenCalled();

    expect(renderer.render(rendererFrame(metadataOnlyWorld, "full")).contentReplacementCount).toBe(1);
    expect(scene.children.at(-1)).toBe(contentRoot);
    expect(islandGeometryDispose).not.toHaveBeenCalled();
    expect(shipsGeometryDispose).not.toHaveBeenCalled();

    // W4.1: a ship visual change rebuilds the SHIPS part (and its dependent
    // tenders part) — the content root survives and the island and docks are
    // never disposed or rebuilt.
    const changed = renderSettled(renderer, visuallyChangedWorld);
    expect(changed.contentReplacementCount).toBe(2);
    expect(scene.children.at(-1)).toBe(contentRoot);
    expect(islandGeometryDispose).not.toHaveBeenCalled();
    expect(dockGeometryDispose).not.toHaveBeenCalled();
    expect(shipsGeometryDispose).toHaveBeenCalledTimes(1);

    const waterGeometryDispose = vi.spyOn(
      (scene.children[3] as Mesh).geometry,
      "dispose",
    );
    renderer.dispose();
    renderer.dispose();

    expect(islandGeometryDispose).toHaveBeenCalledTimes(1);
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

describe("W4.2 garden-tempo transition queue", () => {
  const TEST_TRANSITION_MARGIN_TILES = 2.5;
  const transition = (
    overrides: Partial<GardenShipTransitionSpec> = {},
  ): GardenShipTransitionSpec => ({
    bend: 1,
    durationSeconds: 90,
    from: { x: 20, y: 24 },
    kind: "reanchor",
    marginTiles: TEST_TRANSITION_MARGIN_TILES,
    shipId: "ship.test",
    startSeconds: 10,
    to: { x: 62, y: 54 },
    ...overrides,
  });

  it("samples eased curved berths deterministically from the shared clock", () => {
    const spec = transition();
    const first = sampleGardenShipTransition(spec, 55);
    const second = sampleGardenShipTransition(spec, 55);
    expect(second).toEqual(first);
    expect(first.progress).toBe(0.5);
    // The midpoint is deliberately off the straight chord: this is a sail,
    // not a teleport with a longer duration.
    expect(first.x).not.toBeCloseTo((spec.from.x + spec.to.x) / 2, 3);
    expect(first.y).not.toBeCloseTo((spec.from.y + spec.to.y) / 2, 3);
    expect(spec.durationSeconds).toBeGreaterThanOrEqual(GARDEN_SHIP_TRANSITION_MIN_SECONDS);
  });

  it("coalesces visible starts into waves no closer than twenty seconds", () => {
    expect(gardenTransitionWaveReady(100, 100 + GARDEN_TRANSITION_WAVE_SECONDS - 0.001))
      .toBe(false);
    expect(gardenTransitionWaveReady(100, 100 + GARDEN_TRANSITION_WAVE_SECONDS))
      .toBe(true);
    expect(gardenTransitionWaveReady(Number.NEGATIVE_INFINITY, 0)).toBe(true);
  });

  it("snaps the first refresh inside the thirty-second young-world window", () => {
    const worldA = denseRendererWorld();
    const subject = selectGardenObservatorySlice(worldA, null).ships
      .find((entry) => entry.ship.riskZone !== "danger")!.ship;
    const worldB = withDangerShips(worldA, new Set([subject.id]));
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(worldA, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 0,
    }));
    renderer.render(rendererFrame(worldB, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 5,
    }));
    const snapped = rendererHarness.instances.at(-1)!.lastScene!.children[6]!.position.clone();

    const reference = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    reference.render(rendererFrame(worldB, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 0,
    }));
    const target = rendererHarness.instances.at(-1)!.lastScene!.children[6]!.position;
    expect(distanceXZ(snapped, target)).toBeLessThan(1e-6);
    renderer.dispose();
    reference.dispose();
  });

  it("lets sub-five-percent churn sail, then snaps twenty-percent churn and clears it", () => {
    const exactEdge = { x: 70, y: 0.5 };
    const edgeJourney = transition({
      from: exactEdge,
      to: { x: 70, y: 20 },
    });
    const edgeStart = sampleGardenShipTransition(edgeJourney, edgeJourney.startSeconds);
    const edgeSailing = sampleGardenShipTransition(edgeJourney, edgeJourney.startSeconds + 1);
    expect(Math.hypot(edgeSailing.x - edgeStart.x, edgeSailing.y - edgeStart.y)).toBeLessThan(0.5);

    const worldA = denseRendererWorld();
    const subject = selectGardenObservatorySlice(worldA, null).ships
      .find((entry) => entry.ship.riskZone !== "danger")!.ship;
    const lowChurn = withDangerShips(worldA, new Set([subject.id]));
    const massCount = Math.ceil(worldA.ships.length * 0.2);
    const massIds = new Set(worldA.ships.slice(0, massCount).map((ship) => ship.id));
    massIds.add(subject.id);
    const massChurn = withDangerShips(worldA, massIds);
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(worldA, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 0,
    }));
    renderer.render(rendererFrame({ ...worldA }, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 31,
    }));
    const before = rendererHarness.instances.at(-1)!.lastScene!.children[6]!.position.clone();
    renderer.render(rendererFrame(lowChurn, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 40,
    }));
    const sailing = rendererHarness.instances.at(-1)!.lastScene!.children[6]!.position.clone();
    expect(sailing.distanceTo(before)).toBeLessThan(0.5);

    renderer.render(rendererFrame(massChurn, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 65,
    }));
    const snapped = rendererHarness.instances.at(-1)!.lastScene!.children[6]!.position.clone();
    expect(snapped.distanceTo(before)).toBeGreaterThan(5);
    // If the low-churn journey survived the snap, a later frame would move it.
    renderer.render(rendererFrame(massChurn, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 66,
    }));
    expect(distanceXZ(
      rendererHarness.instances.at(-1)!.lastScene!.children[6]!.position,
      snapped,
    ))
      .toBeLessThan(1e-6);
    renderer.dispose();
  });

  it("keeps arrivals and departures on or inside the playable mist boundary", () => {
    const berth = { x: 68, y: 61 };
    const edge = gardenMistBoundaryTile(berth, 0.3, TEST_TRANSITION_MARGIN_TILES);
    const arrivals = transition({ from: edge, kind: "arrival", to: berth });
    const departures = transition({ from: berth, kind: "departure", to: edge });
    for (const spec of [arrivals, departures]) {
      for (let second = 10; second <= 100; second += 3) {
        const sample = sampleGardenShipTransition(spec, second);
        expect(sample.x).toBeGreaterThanOrEqual(0.5);
        expect(sample.x).toBeLessThanOrEqual(138.5);
        expect(sample.y).toBeGreaterThanOrEqual(0.5);
        expect(sample.y).toBeLessThanOrEqual(138.5);
      }
    }
    expect(sampleGardenShipTransition(arrivals, 10).visibility).toBe(0);
    expect(sampleGardenShipTransition(departures, 100).visibility).toBe(0);
    const crossMap = transition({
      from: { x: 12, y: 18 },
      kind: "mist",
      to: { x: 128, y: 122 },
    });
    expect(sampleGardenShipTransition(crossMap, 55).visibility).toBe(0);
  });

  it("keeps every fixture hull's arrival, departure and cross-map path inside the plate", () => {
    const worlds = [
      ["canonical", buildPharosVilleWorld(makePharosVilleWorldInput())],
      ["dense", denseRendererWorld()],
    ] as const;
    for (const [fixture, world] of worlds) {
      const placements = selectGardenObservatorySlice(world, null).ships;
      for (let index = 0; index < placements.length; index += 1) {
        const placement = placements[index]!;
        const ship = placement.ship;
        const margin = gardenShipWaterMarginTiles(
          gardenShipVisualScale(ship.visual.scale || 1),
          GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
        );
        const target = resolveGardenShipDisplayTile({ ...placement, sample: null });
        const farPlacement = placements[(index + Math.floor(placements.length / 2)) % placements.length]!;
        const farTarget = resolveGardenShipDisplayTile({ ...farPlacement, sample: null });
        const edges = [
          gardenMistBoundaryTile(target, stableUnit(`test.arrival.${ship.id}`), margin),
          gardenMistBoundaryTile(farTarget, stableUnit(`test.cross.${ship.id}`), margin),
        ];
        for (const [edgeIndex, endpoint] of edges.entries()) {
          const centerX = (world.map.width - 1) * 0.5;
          const centerY = (world.map.height - 1) * 0.5;
          const bearing = Math.atan2(endpoint.y - centerY, endpoint.x - centerX);
          const label = `${fixture} ${ship.id} edge ${edgeIndex}`;
          expect(rimLandAt(endpoint.x, endpoint.y), label).toBe(false);
          expect(isGardenShipWater(endpoint, margin), label).toBe(true);
          expect(gardenWaterPlateContainsTile(endpoint, world.map), label).toBe(true);
          expect(
            RIM_OPENINGS.some((opening) => bearingInsideRimOpening(bearing, opening)),
            label,
          ).toBe(true);
        }

        const specs = [
          transition({ from: edges[0], kind: "arrival", marginTiles: margin, shipId: ship.id, to: target }),
          transition({ from: target, kind: "departure", marginTiles: margin, shipId: ship.id, to: edges[0] }),
          transition({ from: target, kind: "mist", marginTiles: margin, shipId: ship.id, to: farTarget }),
        ];
        for (const spec of specs) {
          // The sampler clamps outside [start,end]; include both sides to lock
          // down the renderer's real pre-wave and completed-transition range.
          for (let sampleIndex = -1; sampleIndex <= 33; sampleIndex += 1) {
            const time = spec.startSeconds + spec.durationSeconds * (sampleIndex / 32);
            const point = sampleGardenShipTransition(spec, time);
            const label = `${fixture} ${ship.id} ${spec.kind} sample ${sampleIndex}`;
            expect(isGardenShipWater(point, margin), label).toBe(true);
            expect(gardenWaterPlateContainsTile(point, world.map), label).toBe(true);
          }
        }
      }
    }
  });

  it("adopts ledger truth immediately while the selected hull remains en route", () => {
    const worldA = denseRendererWorld();
    const subject = selectGardenObservatorySlice(worldA, null).ships
      .find((entry) => entry.ship.riskZone !== "danger")!.ship;
    const moved = {
      ...subject,
      change24hPct: 37.25,
      riskPlacement: "storm-shelf" as const,
      riskWaterLabel: "Danger Strait",
      riskZone: "danger" as const,
      tile: { x: subject.tile.x + 18, y: subject.tile.y + 9 },
    };
    const worldB: PharosVilleWorld = {
      ...worldA,
      entityById: { ...worldA.entityById, [subject.detailId]: moved },
      ships: worldA.ships.map((ship) => ship.id === subject.id ? moved : ship),
    } as PharosVilleWorld;
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(worldA, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 0,
    }));
    renderer.render(rendererFrame({ ...worldA }, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 31,
    }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const selectedMarker = scene.children[6]!;
    const before = selectedMarker.position.clone();

    renderer.render(rendererFrame(worldB, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 40,
    }));
    const enRoute = selectedMarker.position.clone();
    const ledger = renderToStaticMarkup(createElement(AccessibilityLedger, {
      world: worldB,
    }));
    expect(ledger).toContain("24h supply change +37.3%");
    // One second into a 60-120 second sail remains close to the old berth.
    expect(enRoute.distanceTo(before)).toBeLessThan(0.5);

    renderer.render(rendererFrame(worldB, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 170,
    }));
    expect(selectedMarker.position.distanceTo(before)).toBeGreaterThan(5);
    renderer.dispose();
  });

  it("snaps to the complete static frame under reduced motion", () => {
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const subject = selectGardenObservatorySlice(worldA, null).ships[1]!.ship;
    const moved = {
      ...subject,
      riskPlacement: "storm-shelf" as const,
      riskWaterLabel: "Danger Strait",
      riskZone: "danger" as const,
      tile: { x: subject.tile.x + 15, y: subject.tile.y + 7 },
    };
    const worldB: PharosVilleWorld = {
      ...worldA,
      entityById: { ...worldA.entityById, [subject.detailId]: moved },
      ships: worldA.ships.map((ship) => ship.id === subject.id ? moved : ship),
    } as PharosVilleWorld;
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(worldA, "full", {
      selectedDetailId: subject.detailId,
      timeSeconds: 50,
    }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const selectedMarker = scene.children[6]!;
    renderer.render(rendererFrame(worldB, "full", {
      reducedMotion: true,
      selectedDetailId: subject.detailId,
    }));
    const snapped = selectedMarker.position.clone();

    const reference = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    reference.render(rendererFrame(worldB, "full", {
      reducedMotion: true,
      selectedDetailId: subject.detailId,
    }));
    const referenceScene = rendererHarness.instances.at(-1)!.lastScene!;
    expect(snapped.distanceTo(referenceScene.children[6]!.position)).toBeLessThan(1e-6);
    renderer.dispose();
    reference.dispose();
  });
});

describe("W4.1 per-part refresh reconciliation", () => {
  it("applies ship-only berth and beam-dwell changes in place — nothing rebuilt, nothing disposed", () => {
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const subject = selectGardenObservatorySlice(worldA, null).ships[1]!.ship;
    // A moved data tile plus a new beam-dwell target: pose data only — every
    // build-time input (visuals, membership, docks, zones) holds still.
    const worldB: PharosVilleWorld = {
      ...worldA,
      lighthouse: {
        ...worldA.lighthouse,
        beamDwell: { shipId: subject.id },
      },
      ships: worldA.ships.map((ship) => (
        ship.id === subject.id
          ? { ...ship, tile: { x: ship.tile.x + 4, y: ship.tile.y + 2 } }
          : ship
      )),
    } as PharosVilleWorld;

    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    // Reduced motion parks the beam at its static dwell bearing, which makes
    // the pose adoption observable without reaching into renderer internals.
    const first = renderer.render(rendererFrame(worldA, "full", { reducedMotion: true }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const contentRoot = scene.children.at(-1)!;
    const disposals = ["island", "docks", "ships"].map((name) => vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName(`content-part-${name}`)!),
      "dispose",
    ));
    const beam = namedObjects(contentRoot, "lighthouse-beam-cone")[0]!.parent!;
    const beamBefore = beam.rotation.y;

    const second = renderer.render(rendererFrame(worldB, "full", { reducedMotion: true }));
    expect(second.contentReplacementCount).toBe(first.contentReplacementCount);
    expect(second.contentPartRebuildCount).toBe(first.contentPartRebuildCount);
    expect(second.contentRebuildQueueDepth).toBe(0);
    for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();
    // The world adopted the new dwell target immediately.
    expect(beam.rotation.y).not.toBe(beamBefore);

    renderer.dispose();
  });

  it("amortizes a multi-part refresh one part per frame and drains the queue", () => {
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const dockSubject = worldA.docks[0]!;
    const shipSubject = worldA.ships[0]!;
    // Dock structure + ship structure: dirties docks, harborLife, cargoTide,
    // ships and tenders — five parts, never the island or the landmarks.
    const worldB: PharosVilleWorld = {
      ...worldA,
      docks: worldA.docks.map((dock) => (
        dock.id === dockSubject.id ? { ...dock, label: `${dock.label} II` } : dock
      )),
      ships: worldA.ships.map((ship) => (
        ship.id === shipSubject.id
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    } as PharosVilleWorld;

    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const first = renderer.render(rendererFrame(worldA, "full"));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const contentRoot = scene.children.at(-1)!;
    const islandDispose = vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName("content-part-island")!),
      "dispose",
    );
    const dockDispose = vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName("content-part-docks")!),
      "dispose",
    );

    // One heavy part per frame: the first refresh frame rebuilds exactly one
    // of the five changed parts and queues the other four.
    const start = renderer.render(rendererFrame(worldB, "full"));
    expect(start.contentReplacementCount).toBe((first.contentReplacementCount ?? 0) + 1);
    expect(start.contentPartRebuildCount).toBe((first.contentPartRebuildCount ?? 0) + 1);
    expect(start.contentRebuildQueueDepth).toBe(4);
    expect(dockDispose).toHaveBeenCalledTimes(1);

    const settled = renderSettled(renderer, worldB);
    expect(settled.contentPartRebuildCount).toBe((first.contentPartRebuildCount ?? 0) + 5);
    // The refresh was ONE adoption event however many frames it amortized over.
    expect(settled.contentReplacementCount).toBe((first.contentReplacementCount ?? 0) + 1);
    expect(islandDispose).not.toHaveBeenCalled();

    renderer.dispose();
  });

  it("drains the whole refresh in the one static frame under reduced motion", () => {
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const worldB: PharosVilleWorld = {
      ...worldA,
      docks: worldA.docks.map((dock, index) => (
        index === 0 ? { ...dock, label: `${dock.label} II` } : dock
      )),
      ships: worldA.ships.map((ship, index) => (
        index === 0
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    } as PharosVilleWorld;
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(worldA, "full", { reducedMotion: true }));
    const refreshed = renderer.render(rendererFrame(worldB, "full", { reducedMotion: true }));
    // A reduced-motion visitor sees exactly one deterministic static frame —
    // it must be complete, so the amortization budget does not apply.
    expect(refreshed.contentRebuildQueueDepth).toBe(0);
    renderer.dispose();
  });

  it("adds and removes ONLY transient content when an outsider ship is selected", () => {
    const world = overCapacityWorldFixture();
    const slice = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => (
      !slice.representativeDetailIds.has(ship.detailId)
    ))!;
    expect(outsider).toBeDefined();

    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const base = renderer.render(rendererFrame(world, "full"));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const contentRoot = scene.children.at(-1)!;
    const selectedMarker = scene.children[6]!;
    const disposals = ["island", "docks", "ships"].map((name) => vi.spyOn(
      firstGeometryIn(contentRoot.getObjectByName(`content-part-${name}`)!),
      "dispose",
    ));

    const selected = renderer.render(rendererFrame(world, "full", {
      selectedDetailId: outsider.detailId,
    }));
    // Selection must not trigger any content rebuild — only the one transient
    // visual (and its selection cue) appears.
    expect(selected.contentReplacementCount).toBe(base.contentReplacementCount);
    expect(selected.contentPartRebuildCount).toBe(base.contentPartRebuildCount);
    expect(selected.contentRebuildQueueDepth).toBe(0);
    expect(selected.visibleShipCount).toBe(base.visibleShipCount + 1);
    expect(selectedMarker.visible).toBe(true);

    const deselected = renderer.render(rendererFrame(world, "full"));
    expect(deselected.visibleShipCount).toBe(base.visibleShipCount);
    expect(deselected.contentReplacementCount).toBe(base.contentReplacementCount);
    expect(selectedMarker.visible).toBe(false);

    // Reselect to prove the add/remove cycle is stable, then check nothing
    // shared was ever disposed along the way.
    const reselected = renderer.render(rendererFrame(world, "full", {
      selectedDetailId: outsider.detailId,
    }));
    expect(reselected.visibleShipCount).toBe(base.visibleShipCount + 1);
    for (const dispose of disposals) expect(dispose).not.toHaveBeenCalled();

    renderer.dispose();
  });

  it("collapses a live ship's batched wake trails under reduced motion", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(world, "full", { reducedMotion: true }));

    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const trails = scene.getObjectByName("fleet-wake-trails") as InstancedMesh;
    const matrix = new Matrix4();
    const scaleEnergies = Array.from({ length: WAKE_TRAIL_QUADS }, (_, index) => {
      trails.getMatrixAt(index, matrix);
      return matrixScaleEnergy(matrix);
    });
    expect(scaleEnergies).toEqual(Array.from({ length: WAKE_TRAIL_QUADS }, () => 0));

    renderer.dispose();
  });

  it("writes visible wake quads for the selected outsider beyond a full fleet", () => {
    const world = overCapacityWorldFixture();
    const slice = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => (
      !slice.representativeDetailIds.has(ship.detailId)
    ))!;
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full"));

    const selectedFrame = rendererFrame(world, "full", {
      selectedDetailId: outsider.detailId,
      shipMotionSamples: new Map([[outsider.id, {
        heading: { x: 1, y: 0 },
        mapVisibilityAlpha: 1,
        state: "sailing",
        tile: outsider.tile,
        wakeIntensity: 1,
      } as ShipMotionSample]]),
    });
    renderer.render(selectedFrame);

    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const trails = scene.getObjectByName("fleet-wake-trails") as InstancedMesh;
    const matrix = new Matrix4();
    trails.getMatrixAt(slice.ships.length * WAKE_TRAIL_QUADS, matrix);
    expect(matrixScaleEnergy(matrix)).toBeGreaterThan(0);

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
    shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
    timeSeconds?: number;
    wallClockHour?: number;
  } = {},
): ThreeWorldRendererFrame {
  const reducedMotion = options.reducedMotion ?? false;
  const camera = defaultCamera({ height: 1000, map: world.map, width: 1440 });
  if (options.cameraZoom != null) camera.zoom = options.cameraZoom;
  const samples = new Map<string, ShipMotionSample>(options.shipMotionSamples);
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

function matrixScaleEnergy(matrix: Matrix4): number {
  const elements = matrix.elements;
  return elements[0] ** 2 + elements[1] ** 2 + elements[2] ** 2
    + elements[4] ** 2 + elements[5] ** 2 + elements[6] ** 2
    + elements[8] ** 2 + elements[9] ** 2 + elements[10] ** 2;
}

function denseRendererWorld(): PharosVilleWorld {
  return buildPharosVilleWorld({
    cemeteryEntries: [],
    chains: denseFixtureChains,
    freshness: {},
    pegSummary: denseFixturePegSummary,
    reportCards: denseFixtureReportCards,
    stability: fixtureStability,
    stablecoins: denseFixtureStablecoins,
    stress: denseFixtureStress,
  });
}

function withDangerShips(world: PharosVilleWorld, ids: ReadonlySet<string>): PharosVilleWorld {
  const ships = world.ships.map((ship) => {
    if (!ids.has(ship.id)) return ship;
    const toDanger = ship.riskZone !== "danger";
    return {
      ...ship,
      riskPlacement: toDanger ? "storm-shelf" as const : "safe-harbor" as const,
      riskWaterLabel: toDanger ? "Danger Strait" : "Calm Anchorage",
      riskZone: toDanger ? "danger" as const : "calm" as const,
      tile: {
        x: toDanger ? Math.min(136, ship.tile.x + 18) : Math.max(3, ship.tile.x - 18),
        y: toDanger ? Math.min(136, ship.tile.y + 9) : Math.max(3, ship.tile.y - 9),
      },
    };
  });
  const entityById = { ...world.entityById };
  for (const ship of ships) entityById[ship.detailId] = ship;
  return { ...world, entityById, ships } as PharosVilleWorld;
}

function distanceXZ(
  left: { x: number; z: number },
  right: { x: number; z: number },
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

/**
 * W4.1: heavy part rebuilds amortize one per animated frame, so a multi-part
 * refresh needs a few frames to settle. Renders until the queue drains.
 */
function renderSettled(
  renderer: ReturnType<typeof createThreeWorldRenderer>,
  world: PharosVilleWorld,
  options: Parameters<typeof rendererFrame>[2] = {},
) {
  let metrics = renderer.render(rendererFrame(world, "full", options));
  for (let round = 0; (metrics.contentRebuildQueueDepth ?? 0) > 0 && round < 16; round += 1) {
    metrics = renderer.render(rendererFrame(world, "full", options));
  }
  expect(metrics.contentRebuildQueueDepth ?? 0).toBe(0);
  return metrics;
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

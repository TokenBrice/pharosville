// @vitest-environment jsdom
import { makeSourceStatuses } from "@/__fixtures__/pharosville-world";
import { readFileSync } from "node:fs";
import type { GardenAirState } from "./garden-aerial";
import { GARDEN_AIR } from "./garden-aerial";
import { writeGardenAtmosphereSky } from "./garden-atmosphere";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  DirectionalLight,
  Color,
  Frustum,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  ShaderLib,
  type IUniform,
  type Material,
  Texture,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from "vitest";
import { createElement } from "react";
import { act } from "@testing-library/react";
import { mountGardenLookdev, type GardenLookdevAPI } from "../dev/garden-lookdev";
import { GARDEN_APPEARANCE_DEFAULTS, GARDEN_APPEARANCE_PRESETS } from "./garden-appearance";
import { applyGardenSurface } from "./garden-surfaces";
import { renderToStaticMarkup } from "react-dom/server";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureSafetyGrades,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureMintBurn,
  fixtureStability,
  makePharosVilleWorldInput,
} from "../__fixtures__/pharosville-world";
import { overCapacityWorldFixture } from "../__fixtures__/over-capacity-world";
import { SCENARIOS } from "../__fixtures__/data-contract-scenarios";
import { AccessibilityLedger } from "../components/accessibility-ledger";
import type {
  ThreeLogoAssets,
  ThreeWorldRenderer,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { defaultCamera, withoutRest } from "../systems/camera";
import {
  cameraView,
  cameraViewAngles,
  gardenWaterPlateContainsTile,
  type IsoCamera,
  screenToGround,
} from "../systems/projection";
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
import { createGardenFleetFootprint, writeGardenFleetFootprint } from "../systems/garden-fleet-footprint";
import { buildGardenMonthRecord } from "../systems/garden-month-record";
import { seaStateForWorld } from "../systems/sea-state";
import { stableUnit } from "../systems/stable-random";
import { forceGardenRitual } from "../systems/garden-score";
import { type DayCyclePhase } from "./garden-day-cycle";
import { GARDEN_SKY_BEATS } from "./garden-sky";
import {
  GARDEN_ROUTE_PULSE_ROTATION_SECONDS,
  MAX_GARDEN_LIGHT_LANES,
} from "./garden-lanterns";
import { gardenQuayEpistemicHazeUniform } from "./garden-height-fog";
import { GARDEN_HERO_REFLECTION_LAYER } from "./garden-hero-reflection-pass";
import {
  FLIGHT_TENDERS_MESH_NAME,
  FLIGHT_TENDERS_PER_TITAN,
} from "./garden-flight-tenders";
import { OVERVIEW_LOD_DETAIL_NAMES } from "./garden-overview-lod";
import { GARDEN_THRESHOLD_NAME } from "./garden-threshold";
import * as gardenThreshold from "./garden-threshold";
import { WAKE_TRAIL_QUADS } from "./garden-wake-batch";
import * as gardenWakes from "./garden-wakes";
import {
  createThreeWorldRenderer,
  disposeThreeObjectTree,
  gardenStationRouteEndpoints,
} from "./world-renderer";
import { gardenShipHeelFromTurn } from "./renderer-ship-frame";
import {
  createGardenSpikeTrace,
  type DrawRecorderTarget,
  type GardenSpikeTrace,
} from "./garden-draw-census";
import * as gardenShips from "./garden-ships";
import { GARDEN_MODEL_MANIFEST } from "./garden-models";
import {
  gardenMistBoundaryTile,
  gardenTransitionWaveReady,
  GARDEN_SHIP_TRANSITION_MIN_SECONDS,
  GARDEN_TRANSITION_WAVE_SECONDS,
  sampleGardenShipTransition,
  type GardenShipTransitionSpec,
} from "./renderer-transitions";

// Nearly every test here builds a dense world and renders real frames: 2-4 s
// each on a desktop, 17 s for the two-scene AO test, and several times that on
// a shared CI runner. One file-level ceiling instead of per-test overrides; it
// costs nothing when the tests pass.
vi.setConfig({ testTimeout: 120_000 });

interface SpikeTraceHarness {
  trace: GardenSpikeTrace;
  root: Scene;
  object: Mesh;
  shadowCamera: PerspectiveCamera;
  target: DrawRecorderTarget & { info: DrawRecorderTarget["info"] & { reset(): void }; initTexture(texture: Texture): void };
  draw(triangles: number, object?: Object3D, shadow?: boolean): void;
}

function spikeTraceHarness(): SpikeTraceHarness {
  const root = new Scene();
  const family = new Group();
  family.name = "island";
  const object = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  object.name = "tower";
  root.add(family);
  family.add(object);
  const camera = new PerspectiveCamera();
  const shadowCamera = new PerspectiveCamera();
  let nextTriangles = 0;
  const target = {
    info: {
      render: { calls: 0, triangles: 0 },
      reset() { this.render.calls = 0; this.render.triangles = 0; },
    },
    renderBufferDirect: vi.fn(() => {
      target.info.render.calls += 1;
      target.info.render.triangles += nextTriangles;
    }) as DrawRecorderTarget["renderBufferDirect"],
    initTexture: vi.fn((_texture: Texture) => {}),
  };
  const trace = createGardenSpikeTrace(target);
  trace.setScene(root, shadowCamera);
  return {
    trace, root, object, shadowCamera, target,
    draw(triangles, drawnObject = object, shadow = false) {
      nextTriangles = triangles;
      target.renderBufferDirect(shadow ? shadowCamera : camera, root, object.geometry, object.material, drawnObject, null);
    },
  };
}

describe("DEV exact-frame triangle spike trace", () => {
  it("triggers strictly above 480k on that frame and persists pre/post frames through ring rollover", () => {
    const h = spikeTraceHarness();
    for (let frame = 1; frame <= 8; frame += 1) {
      h.trace.beginFrame(frame, frame / 30);
      h.target.info.reset();
      h.trace.setPass("post");
      h.draw(frame === 8 ? 574_545 : 480_000);
      h.trace.finishFrame(1, h.target.info.render.triangles, 2);
    }
    const immediate = h.trace.snapshot();
    expect(immediate.captures).toHaveLength(1);
    expect(immediate.captures[0]).toMatchObject({ triggerFrame: 8, complete: false });
    expect(immediate.captures[0]!.frames.map(({ frame }) => frame)).toEqual([5, 6, 7, 8]);
    expect(immediate.captures[0]!.frames[3]).toMatchObject({
      frame: 8, triangles: 574_545, reportedTriangles: 574_545, replacementEpoch: 2,
      draws: [{ owner: "island/tower", pass: "scene", calls: 1, triangles: 574_545 }],
    });
    for (let frame = 9; frame <= 30; frame += 1) {
      h.trace.beginFrame(frame, frame / 30);
      h.target.info.reset();
      h.draw(10);
      h.trace.finishFrame(1, 10, 3);
    }
    const persisted = h.trace.snapshot().captures[0]!;
    expect(persisted.complete).toBe(true);
    expect(persisted.frames.map(({ frame }) => frame)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(persisted.frames[3]!.triangles).toBe(574_545);
    h.trace.dispose();
  });

  it("keeps real draws across resets, separates shadow/reflection/scene passes, and records async uploads", () => {
    const h = spikeTraceHarness();
    const originalReset = h.target.info.reset;
    // Between-frame events belong to the next frame, not a delayed sample.
    h.trace.event("model-attach", 7, "hero");
    h.target.initTexture(new Texture());
    h.trace.beginFrame(1, 145);
    h.trace.setPass("environment");
    h.target.info.reset();
    h.draw(60_000);
    h.target.info.reset();
    h.trace.setPass("reflection");
    h.trace.event("shadow-refresh-request", 2048);
    h.draw(30_000, h.object, true);
    h.draw(80_000);
    h.trace.setPass("post");
    h.draw(340_001);
    h.trace.finishFrame(3, 450_001, 7);
    // Both names and ancestry must be those from the recorded frame.
    h.object.removeFromParent();
    h.object.name = "later-name";
    const frame = h.trace.snapshot().captures[0]!.frames[0]!;
    expect(frame).toMatchObject({ frame: 1, timeSeconds: 145, calls: 4, triangles: 510_001, reportedTriangles: 450_001 });
    expect(frame.draws.map(({ pass }) => pass).sort()).toEqual(["environment", "reflection", "scene", "shadow"]);
    expect(frame.draws.every(({ owner, objectName }) => owner === "island/tower" && objectName === "tower")).toBe(true);
    expect(frame.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "model-attach", value: 7, detail: "hero" }),
      expect.objectContaining({ kind: "texture-upload" }),
      expect.objectContaining({ kind: "shadow-refresh-request", value: 2048 }),
      expect.objectContaining({ kind: "counter-reset", pass: "environment", calls: 1, triangles: 60_000 }),
    ]));
    expect(frame.events.every(({ observedAtMs }) => Number.isFinite(observedAtMs))).toBe(true);
    expect(h.target.info.render).toEqual({ calls: 3, triangles: 450_001 });
    h.trace.dispose();
    expect(h.target.info.reset).not.toBe(originalReset); // saved value was the installed wrapper
    h.target.info.reset();
    expect(h.target.info.render).toEqual({ calls: 0, triangles: 0 });
    expect(vi.isMockFunction(h.target.renderBufferDirect)).toBe(true);
    expect(vi.isMockFunction(h.target.initTexture)).toBe(true);
  });

  it("also triggers on reported counters and retains overlapping crossing windows with explicit saturation", () => {
    const h = spikeTraceHarness();
    for (let frame = 0; frame < 80; frame += 1) {
      h.trace.beginFrame(frame, frame);
      h.target.info.reset();
      h.draw(1);
      h.trace.finishFrame(1, frame % 2 === 0 ? 480_001 : 1, frame);
    }
    const snapshot = h.trace.snapshot();
    expect(snapshot.captures).toHaveLength(32);
    expect(snapshot.droppedTriggers).toBe(8);
    expect(snapshot.peakTriangles).toBe(480_001);
    expect(snapshot.captures[0]!.triggerFrame).toBe(0);
    expect(snapshot.captures[0]!.frames.map(({ frame }) => frame)).toEqual([0, 1, 2, 3]);
    expect(snapshot.captures[1]!.frames.map(({ frame }) => frame)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(snapshot.captures[0]!.frames[0]).toMatchObject({ triangles: 1, reportedTriangles: 480_001 });
    h.trace.dispose();
  });

  it("reports bounded draw/event overflow without hiding actual work", () => {
    const h = spikeTraceHarness();
    h.trace.beginFrame(1, 258);
    h.target.info.reset();
    for (let index = 0; index < 130; index += 1) h.trace.event("part-rebuild", index, "ships");
    for (let index = 0; index < 2049; index += 1) h.draw(240, new Object3D());
    h.trace.finishFrame(2049, 491_760, 4);
    const frame = h.trace.snapshot().captures[0]!.frames[0]!;
    expect(frame.triangles).toBe(491_760);
    expect(frame.calls).toBe(2049);
    expect(frame.draws).toHaveLength(2048);
    expect(frame.droppedDraws).toBe(1);
    expect(frame.events).toHaveLength(128);
    expect(frame.droppedEvents).toBeGreaterThan(0);
    h.trace.dispose();
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

  it("keeps all eight rim-mouth routes on the plate and rotates every one", () => {
    const world = denseRendererWorld();
    const routes = selectGardenDocks(world.docks)
      .filter((dock) => Number.isFinite(dock.totalUsd) && dock.totalUsd > 0);
    expect(routes).toHaveLength(8);

    const endpointKey = (
      openWater: { x: number; z: number },
      station: { x: number; z: number },
    ) => [
      openWater.x,
      openWater.z,
      station.x,
      station.z,
    ].map((coordinate) => coordinate.toFixed(3)).join(",");
    const expected = new Set(routes.map((dock) => {
      const endpoints = gardenStationRouteEndpoints(
        { x: dock.tile.x * Math.SQRT2, z: dock.tile.y * Math.SQRT2 },
        dock.station.shoreBearing,
      );
      for (const endpoint of [endpoints.openWater, endpoints.station]) {
        expect(
          gardenWaterPlateContainsTile(
            { x: endpoint.x / Math.SQRT2, y: endpoint.z / Math.SQRT2 },
            world.map,
          ),
          `${dock.station.coveId} endpoint ${endpoint.x},${endpoint.z}`,
        ).toBe(true);
      }
      return endpointKey(endpoints.openWater, endpoints.station);
    }));

    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const observed = new Set<string>();
    for (let window = 0; window < routes.length; window += 1) {
      renderer.render(rendererFrame(world, "full", {
        timeSeconds: window * GARDEN_ROUTE_PULSE_ROTATION_SECONDS,
      }));
      const water = rendererHarness.instances.at(-1)!.lastScene!
        .getObjectByName("garden-water") as Mesh;
      const uniforms = (water.material as ShaderMaterial).uniforms;
      const laneCount = uniforms.uLaneCount!.value as number;
      const laneTexture = uniforms.uLaneTexture!.value as DataTexture;
      const data = laneTexture.image.data as Float32Array;
      let routesThisWindow = 0;
      for (let index = 0; index < laneCount; index += 1) {
        const header = index * 4;
        if (data[header + 3] !== 3) continue;
        const route = (MAX_GARDEN_LIGHT_LANES * 2 + index) * 4;
        observed.add(endpointKey(
          { x: data[header]!, z: data[header + 1]! },
          { x: data[route]!, z: data[route + 1]! },
        ));
        routesThisWindow += 1;
      }
      expect(routesThisWindow).toBeLessThanOrEqual(4);
    }
    expect(observed).toEqual(expected);
    renderer.dispose();
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
  render: { mock: { calls: unknown[][] } };
  lastScene: Scene | null;
  lastCamera: PerspectiveCamera | null;
  renderLists: { dispose: ReturnType<typeof vi.fn> };
  setPixelRatio: ReturnType<typeof vi.fn>;
};

const rendererHarness = vi.hoisted(() => ({
  instances: [] as TestWebGlRenderer[],
}));

type TestGardenPost = {
  dispose: ReturnType<typeof vi.fn>;
  getPassList: ReturnType<typeof vi.fn>;
  getGpuTimings: ReturnType<typeof vi.fn>;
  isComposerEnabled: ReturnType<typeof vi.fn>;
  render: Mock<() => void>;
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
  extraLight: null as AmbientLight | null,
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
  GARDEN_TONE_MAPPING: "neutral",
  GARDEN_BLOOM_PRACTICAL_THRESHOLD: 2.4,
  createGardenPost: vi.fn((renderer: {
    info: { memory: { textures: number } };
    render: (scene: unknown, camera: unknown) => void;
  }, scene: unknown, camera: unknown) => {
    if (postHarness.extraLight) (scene as Scene).add(postHarness.extraLight);
    let enabled = true;
    let bloomEnabled = true;
    let aoEnabled = true;
    let aoZoomDetail = 1;
    let aoTexturesResident = false;
    const instance: TestGardenPost = {
      dispose: vi.fn(),
      getGpuTimings: vi.fn(() => ({
        supported: false,
        disjoint: false,
        frameP50Ms: null,
        frameP95Ms: null,
        passes: [],
      })),
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

// The fake keys the staged shared dome transport, not a flat-midday phase.
// Actual GPU baking/cadence and differential SH have their own focused tests.
vi.mock("./garden-environment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./garden-environment")>();
  return {
    ...actual,
    createGardenEnvironment: vi.fn((
      _renderer: unknown,
      _scene: unknown,
      domeMaterial: Pick<ShaderMaterial, "uniforms">,
    ) => {
      let bakedKey: string | null = null;
      let bakeCount = 0;
      const bakedZeniths: number[] = [];
      const radianceBands: (number | null)[] = Array(9).fill(null);
      let stormBand: number | null = null;
      const instance: TestGardenEnvironment = {
        dispose: vi.fn(),
        get bakeCount() {
          return bakeCount;
        },
        bakedZeniths,
        update: vi.fn((phase: DayCyclePhase, _beats: unknown, stormLevel = 0) => {
          const uniforms = domeMaterial.uniforms;
          const air: GardenAirState = uniforms.uGardenAir.value;
          const sun = phase.daylight + phase.dusk > 0 ? 1 : 0;
          const moon = phase.night > 0 ? 1 : 0;
          const sunDir = uniforms.uSunDir.value as Vector3;
          const moonDir = uniforms.uMoonDir.value as Vector3;
          const values = [(air.clarity + 1) * 0.5,
            sunDir.x * sun, sunDir.y * sun, sunDir.z * sun,
            moonDir.x * moon, moonDir.y * moon, moonDir.z * moon,
            (uniforms.uCloudRim.value as number) / 0.35 * moon,
            (uniforms.uCloudReady.value as number) > 0.5 ? uniforms.uCloudCover.value as number : 0];
          for (let index = 0; index < values.length; index += 1) {
            radianceBands[index] = actual.resolveGardenEnvironmentRadianceBand(
              radianceBands[index]!, values[index]!, index === 8 ? 20 : index === 0 || index === 7 ? 10 : 12,
            );
          }
          stormBand = actual.resolveGardenEnvironmentStormBand(stormBand, stormLevel);
          const key = actual.gardenEnvironmentPhaseKey(phase, stormBand / 4, {
            date: uniforms.uAtmosphereDate.value as number,
            clarity: radianceBands[0]! / 5 - 1,
            sunDir: { x: radianceBands[1]! / 12, y: radianceBands[2]! / 12, z: radianceBands[3]! / 12 },
            moonDir: { x: radianceBands[4]! / 12, y: radianceBands[5]! / 12, z: radianceBands[6]! / 12 },
            moonIllumination: radianceBands[7]! / 10,
            cloudCover: radianceBands[8]! / 20,
          });
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
    readonly domElement: HTMLCanvasElement;
    readonly capabilities = { maxSamples: 4 };
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
    getActiveCubeFace = vi.fn(() => 0);
    getActiveMipmapLevel = vi.fn(() => 0);
    getDrawingBufferSize = vi.fn((size: { set: (width: number, height: number) => unknown }) => (
      size.set(1440, 1000)
    ));
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
    lastCamera: PerspectiveCamera | null = null;
    outputColorSpace = "";
    render = vi.fn((scene: Scene, camera: PerspectiveCamera) => {
      this.lastScene = scene;
      this.lastCamera = camera;
      this.info.render.calls += 1;
      this.info.render.triangles += 2;
    });
    renderLists = { dispose: vi.fn() };
    setClearColor = vi.fn();
    pixelRatio = 1;
    getPixelRatio = vi.fn(() => this.pixelRatio);
    setPixelRatio = vi.fn((ratio: number) => {
      this.pixelRatio = ratio;
    });
    setRenderTarget = vi.fn();
    setSize = vi.fn();
    shadowMap = { autoUpdate: true, enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;

    constructor({ canvas }: { canvas: HTMLCanvasElement }) {
      this.domElement = canvas;
      rendererHarness.instances.push(this);
    }
    xr = { enabled: false };
  }
  return {
    ...actual,
    WebGLRenderer,
  } as unknown as typeof import("three");
});

beforeEach(() => {
  delete (window as typeof window & { __pharosVilleKnockout?: unknown }).__pharosVilleKnockout;
  delete (window as typeof window & { __pharosVilleSpikeTrace?: GardenSpikeTrace }).__pharosVilleSpikeTrace;
  rendererHarness.instances.length = 0;
  postHarness.instances.length = 0;
  postHarness.simulateAOTextures = false;
  postHarness.extraLight = null;
  environmentHarness.instances.length = 0;
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => null),
  });
});

describe("DEV spike trace startup publication", () => {
  it("publishes the installed ring before the first frame and samples the first real frame", () => {
    const originalUrl = window.location.href;
    const traceWindow = window as typeof window & { __pharosVilleSpikeTrace?: GardenSpikeTrace };
    let renderer: ThreeWorldRenderer | null = null;
    try {
      window.history.replaceState(null, "", "?debug=1&still=1&spikeTrace=1");
      renderer = createThreeWorldRenderer({
        canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
      });
      const installed = traceWindow.__pharosVilleSpikeTrace;
      expect(installed).toBeDefined();
      // Bootstrap has completed, but no world frame or sampled census exists yet.
      expect(installed!.snapshot().frameCount).toBe(1);
      const world = buildPharosVilleWorld(makePharosVilleWorldInput());
      const metrics = renderer.render(rendererFrame(world, "full", { reducedMotion: true }));
      expect(metrics.drawOwnerCensus?.sampledAtFrame).toBe(1);
      expect(metrics.drawOwnerCensus?.spikeTrace).toBe(installed);
      expect(installed!.snapshot().frameCount).toBe(2);
      renderer.dispose();
      renderer = null;
      expect(traceWindow.__pharosVilleSpikeTrace).toBe(installed);
      expect(installed!.snapshot().disposed).toBe(true);
    } finally {
      renderer?.dispose();
      delete traceWindow.__pharosVilleSpikeTrace;
      window.history.replaceState(null, "", originalUrl);
    }
  });

  it("re-publishes a successor handle, preserves old windows, and survives both disposal orders", () => {
    const originalUrl = window.location.href;
    const traceWindow = window as typeof window & { __pharosVilleSpikeTrace?: GardenSpikeTrace };
    let first: ThreeWorldRenderer | null = null;
    let second: ThreeWorldRenderer | null = null;
    let third: ThreeWorldRenderer | null = null;
    try {
      window.history.replaceState(null, "", "?debug=1&spikeTrace=1#");
      first = createThreeWorldRenderer({
        canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
      });
      const oldTrace = traceWindow.__pharosVilleSpikeTrace!;
      oldTrace.beginFrame(1, 145);
      oldTrace.finishFrame(1, 574_545, 1);
      second = createThreeWorldRenderer({
        canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
      });
      const successor = traceWindow.__pharosVilleSpikeTrace!;
      expect(successor).not.toBe(oldTrace);
      expect(successor.snapshot()).toMatchObject({
        rendererEpoch: 1, disposed: false,
        captures: [{ triggerFrame: 1, triggerRendererEpoch: 0, complete: false }],
      });
      first.dispose(); // stale cleanup after a successor has installed
      first = null;
      expect(traceWindow.__pharosVilleSpikeTrace).toBe(successor);
      expect(successor.snapshot().disposed).toBe(false);
      const world = buildPharosVilleWorld(makePharosVilleWorldInput());
      expect(second.render(rendererFrame(world, "full", { reducedMotion: true })).drawOwnerCensus?.spikeTrace).toBe(successor);
      expect(successor.snapshot().captures[0]!.frames.at(-1)).toMatchObject({
        rendererEpoch: 0, frame: 1, reportedTriangles: 574_545,
      });
      second.dispose(); // cleanup before constructing the next successor
      second = null;
      expect(traceWindow.__pharosVilleSpikeTrace).toBe(successor);
      expect(successor.snapshot().disposed).toBe(true);
      third = createThreeWorldRenderer({
        canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
      });
      expect(traceWindow.__pharosVilleSpikeTrace).not.toBe(successor);
      expect(traceWindow.__pharosVilleSpikeTrace!.snapshot()).toMatchObject({
        rendererEpoch: 2, disposed: false,
        captures: [{ triggerFrame: 1, triggerRendererEpoch: 0, complete: false }],
      });
    } finally {
      first?.dispose();
      second?.dispose();
      third?.dispose();
      delete traceWindow.__pharosVilleSpikeTrace;
      window.history.replaceState(null, "", originalUrl);
    }
  });

  it("does not install the startup handle in production even when the opt-in is present", () => {
    const originalUrl = window.location.href;
    const traceWindow = window as typeof window & { __pharosVilleSpikeTrace?: GardenSpikeTrace };
    let renderer: ThreeWorldRenderer | null = null;
    vi.stubEnv("DEV", false);
    try {
      window.history.replaceState(null, "", "?debug=1&spikeTrace=1");
      renderer = createThreeWorldRenderer({
        canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
      });
      expect(traceWindow.__pharosVilleSpikeTrace).toBeUndefined();
    } finally {
      renderer?.dispose();
      vi.unstubAllEnvs();
      window.history.replaceState(null, "", originalUrl);
    }
  });
});

describe("static hero reflection appearance", () => {
  it("unchanged applied light holds the cache; a genuine light change recaptures", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const extraLight = new AmbientLight("#8090a0", 0.25);
    postHarness.extraLight = extraLight;
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
    });
    const gl = rendererHarness.instances.at(-1)!;
    const captureCount = () => gl.render.mock.calls.filter(([, camera]) => (
      (camera as PerspectiveCamera).isPerspectiveCamera
      && (camera as PerspectiveCamera).layers.isEnabled(GARDEN_HERO_REFLECTION_LAYER)
    )).length;
    const pinned = rendererFrame(world, "full", { reducedMotion: true, wallClockHour: 10.5 });
    renderer.render(pinned);
    const scene = gl.lastScene!;
    const key = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
    const pinnedColor = key.color.clone();
    const initial = captureCount();
    expect(initial).toBe(1);
    renderer.render({ ...pinned, timeSeconds: 1 });
    renderer.render({ ...pinned, timeSeconds: 2 });
    expect(key.color.equals(pinnedColor)).toBe(true);
    expect(captureCount()).toBe(initial);

    const live = { ...pinned, wallClockHour: 10.5 + 1 / 3600 };
    renderer.render(live);
    expect(key.color.equals(pinnedColor)).toBe(false);
    expect(captureCount()).toBe(initial + 1);
    renderer.render(live);
    expect(captureCount()).toBe(initial + 1);
    const second = { ...live, wallClockHour: 10.5 + 2 / 3600 };
    renderer.render(second);
    expect(captureCount()).toBe(initial + 2);
    renderer.render(second);
    expect(captureCount()).toBe(initial + 2);

    extraLight.color.set("#304050");
    renderer.render(second);
    expect(extraLight.layers.isEnabled(GARDEN_HERO_REFLECTION_LAYER)).toBe(true);
    expect(captureCount()).toBe(initial + 3);
    renderer.render(second);
    expect(captureCount()).toBe(initial + 3);
    extraLight.intensity = 0.5;
    renderer.render(second);
    renderer.render(second);
    expect(captureCount()).toBe(initial + 4);
    extraLight.position.x += 2;
    renderer.render(second);
    renderer.render(second);
    expect(captureCount()).toBe(initial + 5);
    renderer.dispose();
  });

  it("same-wrapper island replacement and context restore refresh static capture", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const canvas = document.createElement("canvas");
    const renderer = createThreeWorldRenderer({ canvas, onContextFailure: vi.fn() });
    const gl = rendererHarness.instances.at(-1)!;
    const captures = () => gl.render.mock.calls.filter(([, camera]) => (
      (camera as PerspectiveCamera).isPerspectiveCamera
      && (camera as PerspectiveCamera).layers.isEnabled(GARDEN_HERO_REFLECTION_LAYER)
    )).length;
    const frame = rendererFrame(world, "full", { reducedMotion: true });
    renderer.render(frame);
    renderer.render(frame);
    expect(captures()).toBe(1);
    const island = gl.lastScene!.getObjectByName("content-part-island")!;
    const oldLand = island.children[0];
    const changedWorld = {
      ...world,
      lighthouse: {
        ...world.lighthouse,
        tile: { ...world.lighthouse.tile, x: world.lighthouse.tile.x + 1 },
      },
    };
    const changedFrame = rendererFrame(changedWorld, "full", { reducedMotion: true });
    renderer.render(changedFrame);
    renderer.render(changedFrame);
    expect(gl.lastScene!.getObjectByName("content-part-island")).toBe(island);
    expect(island.children[0]).not.toBe(oldLand);
    expect(captures()).toBe(2);
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    renderer.render(changedFrame);
    expect(captures()).toBe(2);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    renderer.render(changedFrame);
    renderer.render(changedFrame);
    expect(captures()).toBe(3);
    renderer.dispose();
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
  it("same visible issuance state does not replay on new sample", () => {
    const input = structuredClone(SCENARIOS.largeBalancedGross);
    const world = buildPharosVilleWorld(input);
    const renderer = createThreeWorldRenderer({ canvas: document.createElement("canvas"), onContextFailure: vi.fn() });
    renderer.render(rendererFrame(world, "full", { reducedMotion: true, timeSeconds: 1 }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const working = scene.getObjectByName("fleet-ship-issuance-worksets")!.children[0] as InstancedMesh;
    const quay = scene.getObjectByName("dock-cargo-tide")!.children[0] as InstancedMesh;
    const workingDispose = vi.spyOn(working.geometry, "dispose");
    const quayDispose = vi.spyOn(quay.geometry, "dispose");
    const pose = new Matrix4();
    working.getMatrixAt(0, pose);
    input.mintBurn!.updatedAt += 60;
    const resampled = buildPharosVilleWorld(input);
    renderer.render(rendererFrame(resampled, "full", { reducedMotion: true, timeSeconds: 2 }));
    expect(scene.getObjectByName("fleet-ship-issuance-worksets")!.children[0]).toBe(working);
    expect(scene.getObjectByName("dock-cargo-tide")!.children[0]).toBe(quay);
    const nextPose = new Matrix4();
    working.getMatrixAt(0, nextPose);
    expect(nextPose).toEqual(pose);
    expect(workingDispose).not.toHaveBeenCalled();
    expect(quayDispose).not.toHaveBeenCalled();
    renderer.dispose();
  });
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

  it("seats the calm mask on the Ethereum Mole basin and keeps every harbor ripple", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const harborDocks = selectGardenDocks(world.docks);
    const mole = harborDocks.find((dock) => dock.station.type === "ethereum-mole")!;
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(world, "full"));
    const water = rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("garden-water") as Mesh;
    const uniforms = (water.material as ShaderMaterial).uniforms;
    const ellipse = uniforms.uHarborEllipse!.value;
    const moleX = mole.tile.x * Math.SQRT2;
    const moleZ = mole.tile.y * Math.SQRT2;
    expect(ellipse.x).toBeCloseTo(moleX + Math.cos(mole.station.shoreBearing) * 9);
    expect(ellipse.y).toBeCloseTo(-moleZ - Math.sin(mole.station.shoreBearing) * 9);
    expect(ellipse.z).toBeCloseTo(1 / 9);
    expect(ellipse.w).toBeCloseTo(1 / 7);

    const rippleCount = uniforms.uRippleCount!.value as number;
    const ripples = (uniforms.uRipple!.value as Array<{ x: number; y: number; z: number }>)
      .slice(0, rippleCount);
    for (const dock of harborDocks) {
      const dockX = dock.tile.x * Math.SQRT2;
      const dockZ = dock.tile.y * Math.SQRT2;
      expect(
        ripples.some((ring) => (
          Math.abs(ring.x - dockX) < 1e-6
          && Math.abs(ring.y + dockZ) < 1e-6
          && Math.abs(ring.z - 4.5) < 1e-6
        )),
        `${dock.station.type} pylon ripple`,
      ).toBe(true);
    }
    renderer.dispose();
  });

  it("disables the basin mask when a sparse feed has no Ethereum Mole", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const withoutMole = {
      ...world,
      docks: world.docks.filter((dock) => dock.station.type !== "ethereum-mole"),
    };
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render(rendererFrame(withoutMole, "full"));
    const water = rendererHarness.instances.at(-1)!.lastScene!
      .getObjectByName("garden-water") as Mesh;
    const uniforms = (water.material as ShaderMaterial).uniforms;
    expect(uniforms.uHarborCalm!.value).toBe(0);
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

  it("keeps final hull, rig and lantern peg-only through issuance transitions", async () => {
    const input = makePharosVilleWorldInput();
    const base = buildPharosVilleWorld(makePharosVilleWorldInput({
      stablecoins: {
        ...input.stablecoins!,
        peggedAssets: input.stablecoins!.peggedAssets.filter((coin) => coin.id === "usdc-circle"),
      },
    }));
    const subject = base.ships[0]!;
    const modelId = "garden-hero-circle";
    const bytes = readFileSync(`public${GARDEN_MODEL_MANIFEST[modelId].artifact.url.split("?")[0]}`);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(new Uint8Array(bytes).buffer, "");
    const model = new Group();
    model.add(gltf.scene.getObjectByName(modelId)!);
    const createHero = vi.spyOn(gardenShips, "createShip");
    const createBatch = vi.spyOn(gardenShips, "createBatchedShip");
    const issuanceRows = [8_000_000, -8_000_000, 0, null] as const;
    const worldFor = (
      scale: number,
      waterline: number,
      hero: boolean,
      net: typeof issuanceRows[number],
    ): PharosVilleWorld => {
      const measured = buildPharosVilleWorld(makePharosVilleWorldInput({
        mintBurn: {
          ...fixtureMintBurn,
          coins: net === null ? [] : fixtureMintBurn.coins.map((coin) => ({
            ...coin, netFlow24hUsd: net, flowIntensity: net < 0 ? -100 : 100,
          })),
        },
      })).ships.find((ship) => ship.id === subject.id)!;
      const { issuance: _issuance, ...withoutIssuance } = subject;
      const ship: ShipNode = {
        ...withoutIssuance,
        ...(measured.issuance ? { issuance: measured.issuance } : {}),
        visual: {
          ...subject.visual,
          sizeTier: hero ? "titan" : "major",
          scale,
          hullForm: { ...subject.visual.hullForm, waterline },
        },
      };
      return { ...base, ships: [ship], entityById: { ...base.entityById, [ship.detailId]: ship } };
    };
    const visualIn = (scene: Scene): gardenShips.ShipVisual => {
      const part = scene.getObjectByName("content-part-ships")!;
      const created = [...createHero.mock.results, ...createBatch.mock.results]
        .filter((result) => result.type === "return")
        .map((result) => result.value as gardenShips.ShipVisual);
      return created.findLast((visual) => visual.ship.id === subject.id && visual.root.parent === part)!;
    };
    const render = (
      renderer: ThreeWorldRenderer,
      world: PharosVilleWorld,
      reducedMotion: boolean,
      timeSeconds: number,
    ) => {
      const frame = {
        ...rendererFrame(world, "full", {
          cameraZoom: 1.2, reducedMotion,
          selectedDetailId: world.ships.some((ship) => ship.id === subject.id) ? subject.detailId : null,
          wallClockHour: 22,
        }),
        // Hold the nonfinancial pose fixed, including the ordinary easing
        // frames: issuance cannot acquire a hidden heave through composition.
        shipMotionSamples: new Map<string, ShipMotionSample>(),
        timeSeconds,
      };
      let metrics = renderer.render(frame);
      for (let round = 0; (metrics.contentRebuildQueueDepth ?? 0) > 0 && round < 16; round += 1) {
        metrics = renderer.render(frame);
      }
      expect(metrics.contentRebuildQueueDepth ?? 0).toBe(0);
    };
    const matrixSlot = (mesh: InstancedMesh, position: Vector3, allowMissing = false) => {
      const matrix = new Matrix4();
      let closest = -1;
      let distance = Number.POSITIVE_INFINITY;
      for (let slot = 0; slot < mesh.count; slot += 1) {
        mesh.getMatrixAt(slot, matrix);
        const next = Math.hypot(matrix.elements[12]! - position.x, matrix.elements[14]! - position.z);
        if (next < distance) {
          closest = slot;
          distance = next;
        }
      }
      if (!allowMissing) expect(distance).toBeLessThan(0.1);
      return distance < 0.1 ? closest : -1;
    };
    const snapshot = (scene: Scene, visual: gardenShips.ShipVisual, departing = false) => {
      scene.updateMatrixWorld(true);
      const cores = scene.getObjectByName("ship-lantern-cores") as InstancedMesh;
      let lamp: Matrix4 | null = null;
      if (!departing) {
        lamp = new Matrix4();
        const anchor = visual.sternLantern.clone();
        const form = visual.ship.visual.hullForm;
        if (visual.batched) {
          const t = Math.max(0, Math.min(1, anchor.y / 0.45));
          anchor.x *= form.length;
          anchor.y *= 1 + (form.height - 1) * t * t * (3 - 2 * t);
          anchor.z *= form.beam;
        }
        anchor.y += form.waterline ?? 0;
        anchor.applyMatrix4(visual.root.matrixWorld);
        cores.getMatrixAt(matrixSlot(cores, anchor), lamp);
      }
      const rig = scene.getObjectByName("ship-hero-rig") as gardenShips.FleetLanterns["rig"];
      const lines = rig.geometry.getAttribute("position");
      const rigHeights = Array.from({ length: rig.geometry.drawRange.count }, (_, vertex) => lines.getY(vertex));
      // Physical hull/rig children, not the independently inspected data signals.
      const children = visual.batched ? [] : visual.root.children
        .filter((child) => child.name !== "ship-secondary-signals")
        .map((child) => child.matrixWorld.clone());
      const batchHeights: number[] = [];
      const batchTrims: number[] = [];
      if (visual.batched) {
        let usingFar = false;
        for (const name of ["hull", "sails"]) {
          let mesh = scene.getObjectByName(`fleet-${name}-${visual.silhouette}`) as InstancedMesh;
          let slot = matrixSlot(mesh, visual.root.position, true);
          if (slot < 0) {
            // A deselected departure may now be a footprint-appropriate far hull.
            mesh = scene.getObjectByName(`fleet-far-${visual.silhouette}`) as InstancedMesh;
            slot = matrixSlot(mesh, visual.root.position);
            usingFar = true;
          }
          const form = mesh.geometry.getAttribute("aHullForm");
          batchTrims.push(form.getW(slot));
          const matrix = new Matrix4();
          mesh.getMatrixAt(slot, matrix);
          // Sample the submitted hull/rig vertex after the batch's form
          // deformation, then the actual instance/world matrices.
          const point = new Vector3().fromBufferAttribute(mesh.geometry.getAttribute("position"), 0);
          const t = Math.max(0, Math.min(1, point.y / 0.45));
          point.set(
            point.x * form.getX(slot),
            point.y * (1 + (form.getZ(slot) - 1) * t * t * (3 - 2 * t)) + form.getW(slot),
            point.z * form.getY(slot),
          ).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld);
          batchHeights.push(point.y);
        }
        if (!usingFar) {
          const pennants = scene.getObjectByName("fleet-pennants") as InstancedMesh;
          const pennant = new Matrix4();
          const masthead = gardenShips.gardenShipMastheadOffset(visual.silhouette);
          const anchor = new Vector3(masthead.x, masthead.y, 0.02).applyMatrix4(visual.root.matrixWorld);
          pennants.getMatrixAt(matrixSlot(pennants, anchor), pennant);
          batchHeights.push(pennant.elements[13]!);
        }
      }
      return { root: visual.root.matrixWorld.clone(), children, lamp, rigHeights, batchHeights, batchTrims };
    };
    const supportShips = denseRendererWorld().ships.filter((ship) => ship.id !== subject.id).slice(0, 8);
    const withSupport = (world: PharosVilleWorld): PharosVilleWorld => ({
      ...world,
      ships: [...world.ships, ...supportShips],
      entityById: {
        ...world.entityById,
        ...Object.fromEntries(supportShips.map((ship) => [ship.detailId, ship])),
      },
    });
    try {
      for (const scale of [0.42, 1, 1.15]) {
        for (const hero of [false, true]) {
          const levelRenderer = createThreeWorldRenderer({
            canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
          });
          const levelSceneOwner = rendererHarness.instances.at(-1)!;
          const pegRenderer = createThreeWorldRenderer({
            canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
          });
          const pegSceneOwner = rendererHarness.instances.at(-1)!;
          try {
            for (const bps of [-200, -50, 50, 200]) {
              const trim = Math.sign(bps) * (Math.abs(bps) === 50 ? 0.08 : 0.16);
              // Rebuild both hull paths from the same procedural starting point.
              render(levelRenderer, { ...base, ships: [] }, true, 0);
              render(pegRenderer, { ...base, ships: [] }, true, 0);
              render(levelRenderer, worldFor(scale, 0, hero, null), true, 0);
              render(pegRenderer, worldFor(scale, trim, hero, null), true, 0);
              const levelScene = levelSceneOwner.lastScene!;
              const pegScene = pegSceneOwner.lastScene!;
              const levelVisual = visualIn(levelScene);
              const pegVisual = visualIn(pegScene);
              expect(pegVisual.batched).toBe(!hero);
              let timeSeconds = 1;
              for (const attached of hero ? [false, true] : [false]) {
                if (attached) {
                  gardenShips.attachGardenHeroModel(levelVisual, model.clone(true));
                  gardenShips.attachGardenHeroModel(pegVisual, model.clone(true));
                  render(levelRenderer, worldFor(scale, 0, hero, null), true, timeSeconds);
                  render(pegRenderer, worldFor(scale, trim, hero, null), true, timeSeconds);
                }
                const atRest = snapshot(levelScene, levelVisual);
                for (const net of issuanceRows) {
                  const levelWorld = worldFor(scale, 0, hero, net);
                  const pegWorld = worldFor(scale, trim, hero, net);
                  for (const reducedMotion of [false, true]) {
                    // The first frames after each issuance refresh catch any
                    // residual easing carrier; the later frame catches its end.
                    for (const elapsed of [0.25, 45]) {
                      timeSeconds += elapsed;
                      render(levelRenderer, levelWorld, reducedMotion, timeSeconds);
                      render(pegRenderer, pegWorld, reducedMotion, timeSeconds);
                      const level = snapshot(levelScene, levelVisual);
                      const peg = snapshot(pegScene, pegVisual);
                      const delta = scale * trim;
                      expect(peg.root.elements).toEqual(level.root.elements);
                      expect(level.root.elements).toEqual(atRest.root.elements);
                      expect(peg.root.elements[5]).toBeCloseTo(scale, 6);
                      expect(peg.children).toHaveLength(level.children.length);
                      for (const [index, child] of peg.children.entries()) {
                        expect(child.elements[13]! - level.children[index]!.elements[13]!).toBeCloseTo(delta, 5);
                      }
                      expect(level.batchTrims).toEqual(hero ? [] : [0, 0]);
                      expect(peg.batchTrims).toEqual(hero ? [] : [expect.closeTo(trim, 6), expect.closeTo(trim, 6)]);
                      for (const [index, height] of peg.batchHeights.entries()) {
                        expect(height - level.batchHeights[index]!).toBeCloseTo(delta, 5);
                      }
                      expect(peg.lamp!.elements[13]! - level.lamp!.elements[13]!).toBeCloseTo(delta, 5);
                      expect(level.lamp!.elements[13]).toBeCloseTo(atRest.lamp!.elements[13]!, 5);
                      expect(level.rigHeights).toEqual(atRest.rigHeights);
                      expect(peg.rigHeights).toHaveLength(level.rigHeights.length);
                      if (!attached) expect(peg.rigHeights.length).toBeGreaterThan(0);
                      for (const [index, height] of peg.rigHeights.entries()) {
                        expect(height - level.rigHeights[index]!).toBeCloseTo(delta, 5);
                      }
                    }
                  }
                }
              }
              // One entrant/exit in a nine-ship real-fixture fleet stays below
              // the mass-refresh snap threshold, exercising actual journeys.
              for (const net of issuanceRows) {
                const levelWorld = withSupport(worldFor(scale, 0, hero, net));
                const pegWorld = withSupport(worldFor(scale, trim, hero, net));
                const absent = { ...levelWorld, ships: supportShips };
                render(levelRenderer, absent, true, 0);
                render(pegRenderer, absent, true, 0);
                render(levelRenderer, levelWorld, false, 201);
                render(pegRenderer, pegWorld, false, 201);
                for (const second of [211, 231]) {
                  render(levelRenderer, levelWorld, false, second);
                  render(pegRenderer, pegWorld, false, second);
                  const levelArrival = visualIn(levelScene);
                  const pegArrival = visualIn(pegScene);
                  expect(pegArrival.sampleState).toBe("arriving");
                  const level = snapshot(levelScene, levelArrival);
                  const peg = snapshot(pegScene, pegArrival);
                  const delta = level.root.elements[5]! * trim;
                  expect(peg.root.elements).toEqual(level.root.elements);
                  expect(pegArrival.root.scale.x).toBeGreaterThan(0);
                  for (const [index, child] of peg.children.entries()) {
                    expect(
                      child.elements[13]! - level.children[index]!.elements[13]!,
                      `${scale}/${bps}/${hero}/${net}/${second}: child ${index} ${pegArrival.root.children[index]!.name}`,
                    ).toBeCloseTo(delta, 5);
                  }
                  expect(peg.batchTrims).toEqual(hero ? [] : [expect.closeTo(trim, 6), expect.closeTo(trim, 6)]);
                  for (const [index, height] of peg.batchHeights.entries()) {
                    expect(height - level.batchHeights[index]!).toBeCloseTo(delta, 5);
                  }
                  expect(peg.lamp!.elements[13]! - level.lamp!.elements[13]!).toBeCloseTo(delta, 5);
                  expect(peg.rigHeights).toHaveLength(level.rigHeights.length);
                  // Other ships keep their own height; every shifted rig point
                  // must be the entrant's peg delta under its current pose.
                  for (const [index, height] of peg.rigHeights.entries()) {
                    const shift = height - level.rigHeights[index]!;
                    expect(Math.min(Math.abs(shift), Math.abs(shift - delta))).toBeLessThan(1e-5);
                  }
                }
                render(levelRenderer, levelWorld, false, 350);
                render(pegRenderer, pegWorld, false, 350);
                render(levelRenderer, absent, false, 351);
                render(pegRenderer, absent, false, 351);
                for (const second of [361, 381]) {
                  render(levelRenderer, absent, false, second);
                  render(pegRenderer, absent, false, second);
                  const levelDeparture = visualIn(levelScene);
                  const pegDeparture = visualIn(pegScene);
                  expect(pegDeparture.sampleState).toBe("departing");
                  // Hero departures intentionally become batched ghosts.
                  expect(pegDeparture.batched).toBe(true);
                  const level = snapshot(levelScene, levelDeparture, true);
                  const peg = snapshot(pegScene, pegDeparture, true);
                  const delta = level.root.elements[5]! * trim;
                  expect(peg.root.elements).toEqual(level.root.elements);
                  expect(peg.batchTrims).toEqual([expect.closeTo(trim, 6), expect.closeTo(trim, 6)]);
                  for (const [index, height] of peg.batchHeights.entries()) {
                    expect(height - level.batchHeights[index]!).toBeCloseTo(delta, 5);
                  }
                  // Ghosts never join the live fleet's lamp/rig workset.
                  expect(peg.rigHeights).toEqual(level.rigHeights);
                }
              }
            }
          } finally {
            levelRenderer.dispose();
            pegRenderer.dispose();
          }
        }
      }
    } finally {
      createHero.mockRestore();
      createBatch.mockRestore();
      disposeThreeObjectTree(model);
    }
  });

  it("gives chain flags the harbour's gust and rests them on one pose for reduced motion", () => {
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
    const clothNormal = new Vector3(0, 0, 1).transformDirection(matrix);
    expect(clothNormal.dot(new Vector3(Math.SQRT1_2, 0, Math.SQRT1_2))).toBeGreaterThan(0.95);
    const gusts = flags.geometry.getAttribute("aGust");
    const resting = (index: number) => Math.abs(gusts.getX(index) - 0.35) < 1e-6;
    expect(Array.from({ length: gusts.count }, (_, index) => resting(index)).every(Boolean)).toBe(false);

    renderer.render(rendererFrame(world, "full", { reducedMotion: true }));
    expect(Array.from({ length: gusts.count }, (_, index) => resting(index)).every(Boolean)).toBe(true);
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

  it("draws the scored meteor only while its ritual runs", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    renderer.render({ ...rendererFrame(world, "full", { timeSeconds: 0 }), epochSeconds: 1_000 });
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    expect(scene.getObjectByName("garden-almanac-meteor")!.visible).toBe(false);
    expect(forceGardenRitual("meteor", 1_000)).toBe(true);
    renderer.render({ ...rendererFrame(world, "full", { timeSeconds: 0.3 }), epochSeconds: 1_000.3 });
    expect(scene.getObjectByName("garden-almanac-meteor")!.visible).toBe(true);
    // Reduced motion: no ritual runs and the sky holds no streak.
    renderer.render({ ...rendererFrame(world, "full", { reducedMotion: true }), epochSeconds: 1_000.4 });
    expect(scene.getObjectByName("garden-almanac-meteor")!.visible).toBe(false);
    renderer.dispose();
    // A disposed renderer leaves no handler behind.
    expect(forceGardenRitual("meteor", 1_001)).toBe(false);
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
      const center = screenToGround(
        { x: frame.width / 2, y: frame.height / 2 },
        frame.camera,
        { x: frame.width, y: frame.height },
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
    expect(first.gpu.sceneCalls).toBe(2);
    expect(first.gpu.offscreenCalls).toBe(0);
    expect(first.gpu.calls).toBe(first.gpu.sceneCalls + first.gpu.offscreenCalls);
    const firstFrameRenders = webGlRenderer.render.mock.calls.slice(0, 2);
    expect(firstFrameRenders.filter(([, renderCamera]) => (
      (renderCamera as PerspectiveCamera).layers.isEnabled(GARDEN_HERO_REFLECTION_LAYER)
    ))).toHaveLength(1);
    expect(firstFrameRenders.filter(([, renderCamera]) => (
      !(renderCamera as PerspectiveCamera).layers.isEnabled(GARDEN_HERO_REFLECTION_LAYER)
    ))).toHaveLength(1);
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
    expect(second.gpu.sceneCalls).toBe(2);
    expect(second.gpu.offscreenCalls).toBe(2);
    expect(second.gpu.calls).toBe(4);

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
      freshness: makeSourceStatuses({ chains: { state: "stale" }, pegSummary: { state: "stale" } }),
    };
    const staleMetrics = renderer.render(rendererFrame(staleWorld, "full", { reducedMotion: true }));

    expect(scene.getObjectByName("garden-water")).toBe(water);
    expect(waterMaterial.uniforms.uPegSummaryEpistemicHaze!.value).toBe(1);
    expect(gardenQuayEpistemicHazeUniform.value).toBe(1);
    expect(staleMetrics.objectCount).toBe(freshMetrics.objectCount);
    renderer.dispose();
  });

  it("honors quality tiers and adaptive DPR without removing analytical content", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const createHero = vi.spyOn(gardenShips, "createShip");
    const createBatch = vi.spyOn(gardenShips, "createBatchedShip");
    const createWakes = vi.spyOn(gardenWakes, "createGardenWakes");
    const placements = selectGardenObservatorySlice(world, null).ships;
    const moored = placements[1]!.ship;
    const mooredSample = {
      heading: { x: 1, y: 0 }, mapVisibilityAlpha: 1, state: "moored",
      currentDockId: null, tile: moored.tile, wakeIntensity: 1,
    } as ShipMotionSample;
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
    const harborBatch = contentRoot.getObjectByName("harbor-batch");
    const gullFlock = contentRoot.getObjectByName("garden-harbor-gull-flock");

    expect(webGlRenderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(waterAccents.visible).toBe(true);
    expect(harborBatch).toBeDefined();
    expect(gullFlock).toBeDefined();
    expect(gullFlock?.visible).toBe(true);
    expect(visibleWakeSlots(scene)).toBeGreaterThan(0);
    const wakes = createWakes.mock.results[0]!.value as gardenWakes.GardenWakes;
    const contact = vi.spyOn(wakes, "stampContact");

    const recovery = renderer.render(rendererFrame(world, "recovery", {
      dpr: 1.5,
      reducedMotion: false,
    }));
    expect(webGlRenderer.setPixelRatio).toHaveBeenLastCalledWith(1.5);
    expect(waterAccents.visible).toBe(true);
    expect(visibleWakeSlots(scene)).toBeGreaterThan(0);

    const constrainedFrame = rendererFrame(world, "constrained", {
      dpr: 1.5,
      reducedMotion: false,
      selectedDetailId: moored.detailId,
      shipMotionSamples: new Map([[moored.id, mooredSample]]),
    });
    const constrained = renderer.render(constrainedFrame);
    expect(waterAccents.visible).toBe(true);
    expect(gullFlock?.visible).toBe(false);
    // Selection of a stationary hull must neither invent its trail nor hide
    // the unrelated actual mover at low quality.
    expect(visibleWakeSlots(scene)).toBe(1);
    const visuals = [...createHero.mock.results, ...createBatch.mock.results]
      .map((result) => result.value as gardenShips.ShipVisual);
    const moverVisual = visuals.find((visual) => visual.ship.id === placements[0]!.ship.id)!;
    const mooredVisual = visuals.find((visual) => visual.ship.id === moored.id)!;
    const trails = scene.getObjectByName("fleet-wake-trails") as InstancedMesh;
    const matrix = new Matrix4();
    trails.getMatrixAt(moverVisual.wakeSlot * WAKE_TRAIL_QUADS, matrix);
    expect(matrixScaleEnergy(matrix)).toBeGreaterThan(0);
    trails.getMatrixAt(mooredVisual.wakeSlot * WAKE_TRAIL_QUADS, matrix);
    expect(matrixScaleEnergy(matrix)).toBe(0);
    renderer.render({
      ...constrainedFrame,
      shipMotionSamples: new Map(placements.map(({ ship }) => [
        ship.id, { ...mooredSample, tile: ship.tile },
      ])),
    });
    expect(visibleWakeSlots(scene)).toBe(0);

    const reduced = renderer.render(rendererFrame(world, "full", {
      dpr: 1.5,
      reducedMotion: true,
    }));
    expect(waterAccents.visible).toBe(true);
    expect(gullFlock?.visible).toBe(true);
    expect(visibleWakeSlots(scene)).toBe(0);
    // Static waterline contact survives when reduced motion clears mover trails.
    for (const visual of [moverVisual, mooredVisual]) {
      expect(contact).toHaveBeenCalledWith(
        visual.root.position.x, visual.root.position.z,
        expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), 1,
      );
    }

    expect([balanced, recovery, constrained, reduced].map((metrics) => metrics.schedulerTier))
      .toEqual(["balanced", "recovery", "constrained", "full"]);
    expect(new Set(
      [balanced, recovery, constrained, reduced].map((metrics) => metrics.objectCount),
    ).size).toBe(1);
    expect(new Set(
      [balanced, recovery, constrained, reduced].map((metrics) => metrics.visibleShipCount),
    ).size).toBe(1);

    renderer.dispose();
    contact.mockRestore();
    createWakes.mockRestore();
    createHero.mockRestore();
    createBatch.mockRestore();
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

  it("projects depth with a perspective camera and holds shadows through sub-threshold view movement", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const frame = rendererFrame(world, "full");
    renderer.render(frame);
    const camera = rendererHarness.instances.at(-1)!.lastCamera!;
    expect(camera).toBeInstanceOf(PerspectiveCamera);
    const near = new Vector3(1, 0, -10).applyMatrix4(camera.projectionMatrix);
    const far = new Vector3(1, 0, -20).applyMatrix4(camera.projectionMatrix);
    expect(near.x).toBeCloseTo(far.x * 2);
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const light = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
    const shadowProjection = light.shadow.camera.projectionMatrix.clone();
    const shadowPosition = light.position.clone();
    frame.camera.offsetX += 0.01;
    renderer.render(frame);
    expect(light.shadow.camera.projectionMatrix.equals(shadowProjection)).toBe(true);
    expect(light.position.equals(shadowPosition)).toBe(true);
    renderer.dispose();
  });

  it("never re-fits or re-bakes static shadows for idle breath, including historical spike times", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"), onContextFailure: vi.fn(),
    });
    try {
      const frame = rendererFrame(world, "full", { wallClockHour: 12 });
      renderer.render(frame);
      const gl = rendererHarness.instances.at(-1)!;
      const drawnCamera = gl.lastCamera!;
      const originalEye = drawnCamera.position.clone();
      const scene = gl.lastScene!;
      const light = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
      const originalShadowProjection = light.shadow.camera.projectionMatrix.clone();
      const originalShadowView = light.shadow.camera.matrixWorld.clone();
      const breaths = [
        { dolly: 1.02, pitch: 0.015, yaw: 0.018 },
        { dolly: 0.98, pitch: -0.015, yaw: -0.018 },
        { dolly: 1, pitch: 0.015, yaw: -0.018 },
        { dolly: 1.02, pitch: -0.015, yaw: 0.018 },
        { dolly: 1, pitch: 0, yaw: 0 },
      ];
      let largestEyeDisplacement = 0;
      for (let index = 0; index < breaths.length; index += 1) {
        light.shadow.needsUpdate = false; // model a completed GPU shadow draw
        renderer.render({
          ...frame, timeSeconds: [95, 145, 258, 600, 601][index]!,
          camera: { ...frame.camera, breath: breaths[index]! },
        });
        largestEyeDisplacement = Math.max(largestEyeDisplacement, drawnCamera.position.distanceTo(originalEye));
        expect(light.shadow.needsUpdate).toBe(false);
        expect(light.shadow.camera.projectionMatrix.equals(originalShadowProjection)).toBe(true);
        expect(light.shadow.camera.matrixWorld.equals(originalShadowView)).toBe(true);
        // The color/picking camera still follows the shared breathed view.
        const expectedView = cameraView({ ...frame.camera, breath: breaths[index]! }, { x: frame.width, y: frame.height });
        expect(drawnCamera.position.distanceTo(new Vector3(expectedView.eye.x, expectedView.eye.y, expectedView.eye.z))).toBeLessThan(1e-8);
      }
      expect(largestEyeDisplacement).toBeGreaterThan(0.5); // crosses the old invalidation threshold
      light.shadow.needsUpdate = false;
      renderer.render({
        ...frame, timeSeconds: 602,
        camera: { ...frame.camera, rest: undefined, offsetX: frame.camera.offsetX + 400 },
      });
      expect(light.shadow.needsUpdate).toBe(true); // real visitor movement still refreshes
      light.shadow.needsUpdate = false;
      renderer.render({
        ...frame, timeSeconds: 603, wallClockHour: 18,
        camera: { ...frame.camera, rest: undefined, offsetX: frame.camera.offsetX + 400 },
      });
      expect(light.shadow.needsUpdate).toBe(true); // real sun re-steer still refreshes
    } finally {
      renderer.dispose();
    }
  });

  it("shows the seat threshold only at rest, riding the breathed eye inside the fitted shadow box", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const rest = rendererFrame(world, "full");
    renderer.render(rest);
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const threshold = scene.getObjectByName(GARDEN_THRESHOLD_NAME)!;
    const light = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
    expect(threshold.visible).toBe(true);
    const seat = threshold.position.clone();
    // The visible threshold lies inside the light's XY fit, and every one of
    // its offscreen corner casters (tea-house and behind-seat trees) inside
    // its depth range, or the front bank loses its shade.
    const shadowCamera = light.shadow.camera;
    const view = rendererHarness.instances.at(-1)!.lastCamera!;
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse),
    );
    let visibleVertices = 0;
    threshold.updateMatrixWorld(true);
    threshold.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const toWorld = object.matrixWorld.clone();
      if (object instanceof InstancedMesh) {
        const instance = new Matrix4();
        object.getMatrixAt(0, instance);
        toWorld.multiply(instance);
      }
      const positions = (object.geometry as BufferGeometry).getAttribute("position");
      const point = new Vector3();
      for (let index = 0; index < positions.count; index += 1) {
        point.fromBufferAttribute(positions, index).applyMatrix4(toWorld);
        const visible = frustum.containsPoint(point);
        const light = point.clone().applyMatrix4(shadowCamera.matrixWorldInverse);
        expect(-light.z).toBeGreaterThanOrEqual(shadowCamera.near);
        expect(-light.z).toBeLessThanOrEqual(shadowCamera.far);
        if (!visible) continue;
        visibleVertices += 1;
        expect(light.x).toBeGreaterThanOrEqual(shadowCamera.left);
        expect(light.x).toBeLessThanOrEqual(shadowCamera.right);
        expect(light.y).toBeGreaterThanOrEqual(shadowCamera.bottom);
        expect(light.y).toBeLessThanOrEqual(shadowCamera.top);
      }
    });
    expect(visibleVertices).toBeGreaterThan(0);

    const breathed = { ...rest, camera: { ...rest.camera, breath: { dolly: 1.012, pitch: 0.01, yaw: 0.014 } } };
    renderer.render(breathed);
    const eye = rendererHarness.instances.at(-1)!.lastCamera!.position;
    const restEye = rest.camera.rest!.view.eye;
    expect(threshold.position.x - seat.x).toBeCloseTo(eye.x - restEye.x, 9);
    expect(threshold.position.y - seat.y).toBeCloseTo(eye.y - restEye.y, 9);
    expect(threshold.position.z - seat.z).toBeCloseTo(eye.z - restEye.z, 9);

    renderer.render(rendererFrame(world, "full", { cameraZoom: 0.8 }));
    expect(threshold.visible).toBe(false);
    renderer.dispose();
  });

  it("disposes threshold trees and their atlas leases exactly once across a rim rebuild and teardown", () => {
    const createThreshold = gardenThreshold.createGardenThreshold;
    const leaseReleases: MockInstance<() => void>[] = [];
    const thresholdDisposals: MockInstance<() => void>[] = [];
    const factory = vi.spyOn(gardenThreshold, "createGardenThreshold").mockImplementation((atlas) => {
      if (!atlas) throw new Error("The renderer threshold requires its atlas owner.");
      const leaseCall = vi.spyOn(atlas, "lease");
      try {
        const threshold = createThreshold(atlas);
        expect(leaseCall).toHaveBeenCalledTimes(1);
        const acquired = leaseCall.mock.results[0]!;
        if (acquired.type !== "return" || !acquired.value) throw new Error("The threshold did not acquire its atlas lease.");
        leaseReleases.push(vi.spyOn(acquired.value, "release"));
        thresholdDisposals.push(vi.spyOn(threshold, "dispose"));
        return threshold;
      } finally {
        leaseCall.mockRestore();
      }
    });
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    try {
      const world = buildPharosVilleWorld(makePharosVilleWorldInput());
      const frame = rendererFrame(world, "full", { reducedMotion: true });
      renderer.render(frame);
      const host = renderer.gardenLookdev!;
      const rim = host.owners().find((owner) => owner.name === "rim")!.root;
      const outgoing = rim.getObjectByName(GARDEN_THRESHOLD_NAME)!;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const graphicsDisposals: MockInstance<() => void>[] = [];
      outgoing.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        if (object instanceof InstancedMesh) graphicsDisposals.push(vi.spyOn(object, "dispose"));
      });
      for (const geometry of geometries) graphicsDisposals.push(vi.spyOn(geometry, "dispose"));
      for (const material of materials) graphicsDisposals.push(vi.spyOn(material, "dispose"));
      expect(leaseReleases).toHaveLength(1);
      host.rebuild("rim");
      renderer.render(frame);
      expect(rim.getObjectByName(GARDEN_THRESHOLD_NAME)).not.toBe(outgoing);
      expect(outgoing.parent).toBeNull();
      expect(outgoing.children).toHaveLength(0);
      expect(thresholdDisposals).toHaveLength(2);
      expect(thresholdDisposals[0]).toHaveBeenCalledTimes(1);
      expect(thresholdDisposals[1]).not.toHaveBeenCalled();
      expect(leaseReleases[0]).toHaveBeenCalledTimes(1);
      expect(leaseReleases[1]).not.toHaveBeenCalled();
      for (const dispose of graphicsDisposals) expect(dispose).toHaveBeenCalledTimes(1);
      renderer.dispose();
      renderer.dispose();
      for (const dispose of thresholdDisposals) expect(dispose).toHaveBeenCalledTimes(1);
      for (const release of leaseReleases) expect(release).toHaveBeenCalledTimes(1);
      for (const dispose of graphicsDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      renderer.dispose();
      factory.mockRestore();
    }
  });

  it("applies the camera state's breath around the view target and treats zero breath as the base eye", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const baseFrame = rendererFrame(world, "full");
    const zeroFrame = { ...baseFrame, camera: { ...baseFrame.camera, breath: { dolly: 1, pitch: 0, yaw: 0 } } };
    const base = cameraView(baseFrame.camera, { x: baseFrame.width, y: baseFrame.height });
    const baseAngles = cameraViewAngles(base);

    renderer.render(zeroFrame);
    const camera = rendererHarness.instances.at(-1)!.lastCamera!;
    expect(camera.position.x).toBeCloseTo(base.eye.x, 10);
    expect(camera.position.y).toBeCloseTo(base.eye.y, 10);
    expect(camera.position.z).toBeCloseTo(base.eye.z, 10);

    const breath = {
      dolly: 1.015,
      pitch: Math.PI / 180,
      yaw: 2 * Math.PI / 180,
    };
    renderer.render({ ...baseFrame, camera: { ...baseFrame.camera, breath } });
    const target = new Vector3(base.target.x, base.target.y, base.target.z);
    const targetToEye = camera.position.clone().sub(target);
    expect(targetToEye.length()).toBeCloseTo(baseAngles.distance * breath.dolly, 10);
    expect(Math.asin(targetToEye.y / targetToEye.length())).toBeCloseTo(
      baseAngles.pitch + breath.pitch,
      10,
    );
    expect(Math.atan2(targetToEye.x, targetToEye.z)).toBeCloseTo(
      baseAngles.yaw + breath.yaw,
      10,
    );
    const viewDirection = camera.getWorldDirection(new Vector3());
    expect(camera.position.clone().addScaledVector(viewDirection, baseAngles.distance * breath.dolly).distanceTo(target))
      .toBeLessThan(1e-9);
    renderer.dispose();
  });

  it("removes the shadow sampler on a cold constrained start and restores recovery shadows", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });
    const cold = renderer.render(rendererFrame(world, "constrained"));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const light = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
    expect(light).toBeDefined();
    expect(light.shadow.map).toBeNull();
    expect(light.castShadow).toBe(false);
    expect(cold.shadowMapSize).toBe(0);

    const recovery = renderer.render(rendererFrame(world, "recovery", { timeSeconds: 2 }));
    expect(light.castShadow).toBe(true);
    expect(light.shadow.needsUpdate).toBe(true);
    expect(recovery.shadowMapSize).toBe(768);

    renderer.render(rendererFrame(world, "constrained", { timeSeconds: 3 }));
    expect(light.castShadow).toBe(false);
    expect(light.shadow.intensity).toBe(0);
    renderer.dispose();
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

  it("uses ship pixel detail and focused restoration while retaining dock Explore detail", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const createHero = vi.spyOn(gardenShips, "createShip");
    const createBatch = vi.spyOn(gardenShips, "createBatchedShip");
    const expectPixelDetail = (frame: ThreeWorldRendererFrame) => {
      const footprint = createGardenFleetFootprint();
      for (const result of [...createHero.mock.results, ...createBatch.mock.results]) {
        if (result.type !== "return") continue;
        const visual = result.value as gardenShips.ShipVisual;
        const inspected = visual.ship.detailId === frame.selectedDetailId || visual.ship.detailId === frame.hoveredDetailId;
        writeGardenFleetFootprint(footprint, visual.ship, {
          x: visual.root.position.x / Math.SQRT2, y: visual.root.position.z / Math.SQRT2,
        }, visual.root.rotation.y, frame.camera, { x: frame.width, y: frame.height }, visual.sailRestBraceRad,
        visual.root.scale.x, visual.root.position.y);
        expect(visual.fineDetail.visible, visual.ship.id).toBe(inspected || footprint.sailHeightCssPx >= 48);
      }
    };
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    renderer.render(rendererFrame(world, "balanced", { cameraZoom: 0.8 }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const contentRoot = scene.children.at(-1)!;
    const shipDetails = namedGroups(contentRoot, "ship-fine-detail");
    const dockDetails = namedGroups(contentRoot, "dock-fine-detail");
    expect(shipDetails.length).toBe(selectGardenObservatorySlice(world, null).ships.length);
    expect(dockDetails.length).toBe(world.docks.length);
    expectPixelDetail(rendererFrame(world, "balanced", { cameraZoom: 0.8 }));
    expect(dockDetails.every((detail) => !detail.visible)).toBe(true);

    renderer.render(rendererFrame(world, "balanced", { cameraZoom: 1.05 }));
    expectPixelDetail(rendererFrame(world, "balanced", { cameraZoom: 1.05 }));
    expect(dockDetails.every((detail) => detail.visible)).toBe(true);

    const selectedShip = selectGardenObservatorySlice(world, null).ships[0]!.ship;
    renderer.render(rendererFrame(world, "balanced", {
      cameraZoom: 0.8,
      selectedDetailId: selectedShip.detailId,
    }));
    expectPixelDetail(rendererFrame(world, "balanced", { cameraZoom: 0.8, selectedDetailId: selectedShip.detailId }));
    expect(dockDetails.every((detail) => !detail.visible)).toBe(true);
    expect(visibleWakeSlots(scene)).toBe(1);

    renderer.render(rendererFrame(world, "balanced", {
      cameraZoom: 0.8,
      hoveredDetailId: world.docks[0]!.detailId,
    }));
    expectPixelDetail(rendererFrame(world, "balanced", { cameraZoom: 0.8, hoveredDetailId: world.docks[0]!.detailId }));
    expect(dockDetails.filter((detail) => detail.visible)).toHaveLength(1);

    renderer.dispose();
    createHero.mockRestore();
    createBatch.mockRestore();
  });

  it("sheds overview detail at whole-map framing and restores it at default framing", () => {
    // The dense fixture is the one that composes the props this policy governs
    // (a small world builds no crane and no hero badges).
    const world = buildPharosVilleWorld({
      cemeteryEntries: [],
      chains: denseFixtureChains,
      freshness: makeSourceStatuses(),
      pegSummary: denseFixturePegSummary,
      safetyGrades: denseFixtureSafetyGrades,
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
    // The obelisks are retired (the landing is marked by set stones), so the
    // policy's obelisk name no longer composes.
    const composedOverviewNames = OVERVIEW_LOD_DETAIL_NAMES.filter(
      (name) => name !== "pharos-precinct-obelisks",
    );
    const props = new Map(composedOverviewNames.map((name) => [
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

  it("shows only focused tenders while the gauge reports flight to quality, never at rest", () => {
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
    expect(boats).toHaveLength(1);
    expect(boats[0]!.count).toBe(0);
    expect(boats[0]!.visible).toBe(false);
    const leader = [...selectGardenObservatorySlice(flying, null).ships]
      .sort((a, b) => (b.ship.marketCapUsd ?? 0) - (a.ship.marketCapUsd ?? 0))[0]!.ship;
    renderer.render(rendererFrame(flying, "full", { timeSeconds: 1, selectedDetailId: leader.detailId }));
    expect(boats[0]!.count).toBe(FLIGHT_TENDERS_PER_TITAN);
    expect(boats[0]!.visible).toBe(true);
    renderer.render(rendererFrame(flying, "full", { timeSeconds: 1 }));
    expect(boats[0]!.count).toBe(0);
    expect(boats[0]!.visible).toBe(false);

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
  it("bakes once per quantised staged-radiance key, not once per frame, and disposes with the renderer", () => {
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
    renderer.render(rendererFrame(world, "full", { wallClockHour: 12.0001 }));
    expect(environment.bakeCount).toBe(1);

    // Noon to midnight is a different sky, so it must bake again...
    renderer.render(rendererFrame(world, "full", { wallClockHour: 0 }));
    expect(environment.bakeCount).toBe(2);

    // A neighboring physical instant stays in its hysteretic radiance bin.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 0.02 }));
    expect(environment.bakeCount).toBe(2);
    // 23.98 on this SAME date is almost a day later, not the prior midnight:
    // lunar age/transit changed, so a phase-only cache would now be wrong.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 23.98 }));
    expect(environment.bakeCount).toBe(3);

    renderer.dispose();
    expect(environment.dispose).toHaveBeenCalledTimes(1);
  });

  it("bakes the sky its key names, starting with the very first frame", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({
      canvas: document.createElement("canvas"),
      onContextFailure: vi.fn(),
    });

    // All atmosphere/cloud uniforms must be staged before the first early
    // probe bake; phase-only staging used to capture yesterday's cloud state.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 12 }));
    const environment = environmentHarness.instances.at(-1)!;
    expect(environment.bakeCount).toBe(1);
    expect(environment.bakedZeniths[0]).toBe(writeGardenAtmosphereSky(
      new Color(), new Vector3(0, 1, 0), GARDEN_AIR.sunDir,
      GARDEN_AIR.rayleigh, GARDEN_AIR.mie,
    ).getHex());
    expect(environment.bakedZeniths[0]).not.toBe(GARDEN_SKY_BEATS.night.zenith.getHex());

    // And every later rebake is the sky of its own frame, not the last one's.
    renderer.render(rendererFrame(world, "full", { wallClockHour: 0 }));
    expect(environment.bakedZeniths[1]).toBe(GARDEN_SKY_BEATS.night.zenith.getHex());

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
    const steady = environment.update.mock.calls.at(-1)![3];
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
    expect(environment.update.mock.calls.at(-1)![3].bakeAllowed).toBe(false);

    // The still frame has no later frame to defer to, and says so.
    renderer.render(rendererFrame(world, "full", { reducedMotion: true, wallClockHour: 12 }));
    expect(environment.update.mock.calls.at(-1)![3].reducedMotion).toBe(true);

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
    // Only ships that actually change band count toward the 20 % churn; the
    // stable berth solve no longer moves bystanders, so danger ships would not.
    const massIds = new Set(
      worldA.ships.filter((ship) => ship.riskZone !== "danger").slice(0, massCount).map((ship) => ship.id),
    );
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
  it("refreshes a history-only trace in place, with no island/threshold rebuild and no evidence-only buffer upload", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const withRecord = (score: number): PharosVilleWorld => ({
      ...world, lighthouse: { ...world.lighthouse, gardenMonthRecord: buildGardenMonthRecord({
        ...fixtureStability, history: [{ date: Date.UTC(2026, 7, 13), score, band: "STEADY", methodologyVersion: "v1" }],
      }) },
    });
    const worldA = withRecord(80);
    const worldB = withRecord(81);
    const renderer = createThreeWorldRenderer({ canvas: document.createElement("canvas"), onContextFailure: vi.fn() });
    const first = renderer.render(rendererFrame(worldA, "full", { reducedMotion: true }));
    const scene = rendererHarness.instances.at(-1)!.lastScene!;
    const island = scene.getObjectByName("content-part-island")!.children[0]!;
    const threshold = scene.getObjectByName(GARDEN_THRESHOLD_NAME)!;
    const trace = scene.getObjectByName("garden-month-record-trace") as Mesh;
    const position = trace.geometry.getAttribute("position") as import("three").BufferAttribute;
    const version = position.version;
    const dispose = vi.spyOn(trace.geometry, "dispose");
    const changed = renderer.render(rendererFrame(worldB, "full", { reducedMotion: true }));
    expect(changed.contentPartRebuildCount).toBe(first.contentPartRebuildCount);
    expect(changed.contentRebuildQueueDepth).toBe(0);
    expect(scene.getObjectByName("content-part-island")!.children[0]).toBe(island);
    expect(scene.getObjectByName(GARDEN_THRESHOLD_NAME)).toBe(threshold);
    expect(scene.getObjectByName("garden-month-record-trace")).toBe(trace);
    expect(position.version).toBe(version + 1);
    expect(dispose).not.toHaveBeenCalled();
    const held: PharosVilleWorld = { ...worldB, lighthouse: { ...worldB.lighthouse, gardenMonthRecord: {
      ...worldB.lighthouse.gardenMonthRecord!, evidence: makeSourceStatuses({ stability: { state: "stale" } }).stability,
    } } };
    renderer.render(rendererFrame(held, "full", { reducedMotion: true }));
    renderer.render(rendererFrame(held, "full", { reducedMotion: true, timeSeconds: 45 }));
    expect(position.version).toBe(version + 1);
    renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

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
    /** A rig at this zoom instead of the rest ShotSpec. */
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
  const rest = defaultCamera({ height: 1000, map: world.map, width: 1440 });
  const camera: IsoCamera = options.cameraZoom != null ? { ...withoutRest(rest), zoom: options.cameraZoom } : rest;
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
    freshness: makeSourceStatuses(),
    pegSummary: denseFixturePegSummary,
    safetyGrades: denseFixtureSafetyGrades,
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

/** Ships whose batched wake trail is drawn: a hidden slot is collapsed to scale 0. */
function visibleWakeSlots(root: Object3D): number {
  const trails = root.getObjectByName("fleet-wake-trails") as InstancedMesh;
  const matrix = new Matrix4();
  let visible = 0;
  for (let slot = 0; slot * WAKE_TRAIL_QUADS < trails.count; slot += 1) {
    trails.getMatrixAt(slot * WAKE_TRAIL_QUADS, matrix);
    if (matrixScaleEnergy(matrix) > 0) visible += 1;
  }
  return visible;
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

describe("gardenShipHeelFromTurn", () => {
  // 2026-09-07. The old inline form was `clamp(delta * 2.4, ...)` on a
  // per-FRAME heading delta, so heel depended on the display's refresh rate.
  it("gives the same heel for the same turn at 60 and 120 fps", () => {
    const turnRate = 0.6; // rad/s
    const at60 = gardenShipHeelFromTurn(turnRate / 60, 1 / 60);
    const at120 = gardenShipHeelFromTurn(turnRate / 120, 1 / 120);
    expect(at120).toBeCloseTo(at60, 12);
  });

  it("keeps the historical 60 fps calibration", () => {
    // 0.04 was chosen as 2.4/60 precisely so this holds.
    const delta = 0.01;
    expect(gardenShipHeelFromTurn(delta, 1 / 60)).toBeCloseTo(delta * 2.4, 12);
  });

  it("clamps a hitched frame to a whisper of roll instead of spiking", () => {
    expect(gardenShipHeelFromTurn(3, 1 / 10000)).toBe(0.05);
    expect(gardenShipHeelFromTurn(-3, 1 / 10000)).toBe(-0.05);
  });

  it("is inert on non-finite input", () => {
    expect(gardenShipHeelFromTurn(Number.NaN, 1 / 60)).toBe(0);
    expect(gardenShipHeelFromTurn(0.01, Number.NaN)).toBe(0);
  });
});

describe("Garden production-scene authoring", () => {
  it("preserves default light and semantic content, repaints presets without rebuilding, and tears down", async () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const frozenWorld = JSON.stringify(world);
    const canvas = document.createElement("canvas");
    const container = document.createElement("div");
    container.append(canvas); document.body.append(container);
    const requestPaint = vi.fn();
    const renderer = createThreeWorldRenderer({ canvas, onAssetReady: requestPaint, onContextFailure: vi.fn() });
    const frame = rendererFrame(world, "full", { reducedMotion: true });
    const before = renderer.render(frame);
    const host = renderer.gardenLookdev!;
    const light = host.lights();
    const key = light.key.intensity;
    const ambient = light.ambient.intensity;
    let unmount!: () => void;
    await act(async () => { unmount = mountGardenLookdev(renderer, canvas); });
    const api = (window as typeof window & { __pharosVilleLookdev: GardenLookdevAPI }).__pharosVilleLookdev;
    await act(async () => { renderer.render(frame); });
    expect(light.key.intensity).toBe(key);
    expect(light.ambient.intensity).toBe(ambient);
    expect(api.snapshot().appliedChecksum).toBe(api.snapshot().checksum);
    for (let swap = 0; swap < 20; swap++) {
      const preset = GARDEN_APPEARANCE_PRESETS[swap % GARDEN_APPEARANCE_PRESETS.length]!;
      const paints = requestPaint.mock.calls.length;
      await act(async () => { api.install(preset); });
      expect(requestPaint.mock.calls.length).toBeGreaterThan(paints);
      let metrics = before;
      await act(async () => { metrics = renderer.render(frame); });
      expect(metrics.contentPartRebuildCount).toBe(before.contentPartRebuildCount);
      expect(metrics.contentSignaturePartHashes).toEqual(before.contentSignaturePartHashes);
      expect(metrics.visibleShipCount).toBe(before.visibleShipCount);
      expect(api.snapshot().inspectorActive).toBe(false);
    }
    expect(JSON.stringify(world)).toBe(frozenWorld);
    const landmarks = host.owners().find((owner) => owner.name === "landmarks")!;
    const docks = host.owners().find((owner) => owner.name === "docks")!;
    const dockVisibility = docks.root.visible;
    await act(async () => { api.inspect("isolate", "landmarks"); renderer.render(frame); });
    expect(api.snapshot().inspectorActive).toBe(true);
    expect(docks.root.visible).toBe(false);
    expect(landmarks.root.visible).toBe(true);
    await act(async () => { api.inspect("highlight", "landmarks"); renderer.render(frame); });
    expect(api.snapshot().inspectorActive).toBe(true);
    await act(async () => { api.inspect("reset"); renderer.render(frame); });
    expect(api.snapshot().inspectorActive).toBe(false);
    expect(docks.root.visible).toBe(dockVisibility);
    await act(async () => { api.install(GARDEN_APPEARANCE_DEFAULTS); renderer.render(frame); unmount(); renderer.dispose(); });
    expect((window as typeof window & { __pharosVilleLookdev?: GardenLookdevAPI }).__pharosVilleLookdev).toBeUndefined();
    expect(() => api.install(GARDEN_APPEARANCE_DEFAULTS)).toThrow("disposed");
    expect(() => host.queue(GARDEN_APPEARANCE_DEFAULTS)).toThrow("disposed");
    container.remove();
  });

  it("queues just the named owner, advances its existing epoch, and disposes its old resources once", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({ canvas: document.createElement("canvas"), onContextFailure: vi.fn() });
    const frame = rendererFrame(world, "full", { reducedMotion: true });
    const first = renderer.render(frame);
    const host = renderer.gardenLookdev!;
    const owner = host.owners().find((part) => part.name === "landmarks")!;
    const dispose = vi.spyOn(firstGeometryIn(owner.root), "dispose");
    const epoch = owner.epoch;
    host.rebuild("landmarks");
    expect(host.owners().find((part) => part.name === "landmarks")!.dirty).toBe(true);
    const next = renderer.render(frame);
    expect(next.contentPartRebuildCount).toBe(first.contentPartRebuildCount! + 1);
    expect(next.contentRebuildQueueDepth).toBe(0);
    expect(host.owners().find((part) => part.name === "landmarks")!.epoch).toBe(epoch + 1);
    expect(dispose).toHaveBeenCalledTimes(1);
    renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("cancels a queued owner rebuild on disposal and rejects stale schemas before repainting", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const requestPaint = vi.fn();
    const renderer = createThreeWorldRenderer({ canvas: document.createElement("canvas"), onAssetReady: requestPaint, onContextFailure: vi.fn() });
    renderer.render(rendererFrame(world, "full", { reducedMotion: true }));
    const host = renderer.gardenLookdev!;
    requestPaint.mockClear();
    expect(() => host.queue({ ...GARDEN_APPEARANCE_DEFAULTS, schemaVersion: 0 } as never)).toThrow("Stale");
    expect(requestPaint).not.toHaveBeenCalled();
    host.rebuild("landmarks");
    const dispose = vi.spyOn(firstGeometryIn(host.owners().find((owner) => owner.name === "landmarks")!.root), "dispose");
    renderer.dispose(); renderer.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => host.rebuild("landmarks")).toThrow("disposed");
  });

});

describe("Garden lookdev surface response", () => {
  it("updates mixed-role roughness uniforms without recompiling, and recompiles only the selected role shading", async () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const canvas = document.createElement("canvas");
    const container = document.createElement("div");
    container.append(canvas); document.body.append(container);
    const renderer = createThreeWorldRenderer({ canvas, onContextFailure: vi.fn() });
    const frame = rendererFrame(world, "full", { reducedMotion: true });
    renderer.render(frame);
    const moss = new MeshStandardMaterial();
    const mixed = new MeshStandardMaterial();
    applyGardenSurface(moss, { role: "moss", mapping: "worldXZ", metresPerRepeat: 2, detailStrength: 0.5 });
    applyGardenSurface(mixed, { role: "earth", mapping: "worldXZ", metresPerRepeat: 2, detailStrength: 0.5, vertexRoles: true });
    const owner = renderer.gardenLookdev!.owners().find((part) => part.name === "landmarks")!;
    owner.root.add(new Mesh(new BufferGeometry(), moss), new Mesh(new BufferGeometry(), mixed));
    let unmount!: () => void;
    await act(async () => { unmount = mountGardenLookdev(renderer, canvas); renderer.render(frame); });
    const api = (window as typeof window & { __pharosVilleLookdev: GardenLookdevAPI }).__pharosVilleLookdev;
    const shader = {
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
      uniforms: {} as Record<string, IUniform>,
    };
    mixed.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).not.toContain("\\n");
    expect(shader.fragmentShader.split("\n")).toContain("uniform vec2 uGardenLookdevRoughness;");
    expect(shader.fragmentShader).toContain("gardenLookdevDelta");
    expect(shader.fragmentShader).toContain("vGardenSurfaceRole");
    const uniform = shader.uniforms.uGardenLookdevRoughness!.value as { x: number; y: number };
    expect(uniform.x).toBe(0); expect(uniform.y).toBe(0);
    const mixedVersion = mixed.version;
    const mossVersion = moss.version;
    await act(async () => { api.install(GARDEN_APPEARANCE_PRESETS[1]!); renderer.render(frame); });
    expect(uniform.x).toBeCloseTo(0.03);
    expect(uniform.y).toBeCloseTo(0.02);
    expect(mixed.version).toBe(mixedVersion);
    expect(moss.version).toBe(mossVersion);
    await act(async () => { api.install({ ...GARDEN_APPEARANCE_DEFAULTS, mossShading: "faceted" }); renderer.render(frame); });
    expect(moss.flatShading).toBe(true);
    expect(moss.version).toBe(mossVersion + 1);
    expect(mixed.version).toBe(mixedVersion);
    await act(async () => { unmount(); renderer.dispose(); });
    expect(uniform.x).toBe(0); expect(uniform.y).toBe(0);
    expect(moss.flatShading).toBe(false);
    container.remove();
  });
});

describe("Garden performance shadow telemetry", () => {
  it("counts consumed shadow submissions, not pending requests or cached sampling", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const renderer = createThreeWorldRenderer({ canvas: document.createElement("canvas"), onContextFailure: vi.fn() });
    try {
      const frame = rendererFrame(world, "full", { reducedMotion: true, wallClockHour: 12 });
      const pending = renderer.render(frame);
      expect(pending.shadowRefreshed).toBe(false);
      expect(pending.shadowRefreshCount).toBe(0); // The test GPU has not consumed the request.
      const scene = rendererHarness.instances.at(-1)!.lastScene!;
      const light = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
      const post = postHarness.instances.at(-1)!;
      const draw = post.render.getMockImplementation();
      if (!draw) throw new Error("The post harness must provide its scene draw.");
      post.render.mockImplementation(() => {
        draw();
        if (light.castShadow) light.shadow.needsUpdate = false; // Actual WebGLShadowMap completion.
      });
      expect(renderer.render(frame)).toMatchObject({ shadowRefreshed: true, shadowRefreshCount: 1 });
      expect(renderer.render(frame)).toMatchObject({ shadowRefreshed: false, shadowRefreshCount: 1 });
      expect(renderer.render({ ...frame, wallClockHour: 18 })).toMatchObject({ shadowRefreshed: true, shadowRefreshCount: 2 });
      expect(renderer.render(rendererFrame(world, "constrained", { reducedMotion: true })))
        .toMatchObject({ shadowRefreshed: false, shadowRefreshCount: 2 });
    } finally {
      renderer.dispose();
    }
  });
});

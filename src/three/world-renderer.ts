import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Texture,
  Vector3,
  WebGLRenderer,
  type BufferGeometry as ThreeBufferGeometry,
  type Material,
} from "three";
import type {
  CreateThreeWorldRendererInput,
  ThreeWorldRenderer,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  GARDEN_SILHOUETTE_FOR_HULL as SILHOUETTE_FOR_HULL,
  GARDEN_WATER_Y as WATER_LEVEL,
  GARDEN_ZONE_ROOT_Y,
  gardenAreaDisplayTile,
  gardenCameraViewHeight,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
  gardenSemanticView,
  gardenShipSelectionRadius,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
  type GardenHullSilhouette,
} from "../systems/garden-observatory-slice";
import {
  DEWS_AREA_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../systems/risk-water-areas";
import { HARBOR_PALETTE, zoneThemeForTerrain } from "../systems/palette";
import { screenToTile } from "../systems/projection";
import type {
  AreaNode,
  DockNode,
  PharosVilleWorld,
  ShipNode,
} from "../systems/world-types";
import { createGardenSailTexture } from "./garden-sail-texture";
import {
  createGardenCemetery,
  createGardenPigeonnier,
} from "./garden-landmarks";
import {
  createGardenGullFlock,
  createGardenHarborDistricts,
  type GardenGullFlock,
} from "./garden-harbor-life";
import {
  createGardenModelLibrary,
  gardenModelAnchor,
} from "./garden-models";
import { createGardenWater, type GardenWater } from "./garden-water";

const MAX_THREE_DPR = 2;
const CAMERA_DISTANCE = 110;
const TILE_SCALE = Math.SQRT2;

const GARDEN_COLORS = {
  limestone: "#b7ad96",
  limestoneLight: "#ded6c2",
  limestoneShade: "#958b75",
  path: "#c8bea5",
  roof: "#5b3430",
  vegetation: "#3f5744",
  vegetationLight: "#71805a",
} as const;

const DAY_SKY = new Color("#467c83");
const DUSK_SKY = new Color("#294e59");
const NIGHT_SKY = new Color("#142b38");
const scratchColor = new Color();
const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();

export function createThreeWorldRenderer(input: CreateThreeWorldRendererInput): ThreeWorldRenderer {
  const { canvas, onAssetReady, onContextFailure } = input;
  const scene = createGardenScene();
  const modelLibrary = createGardenModelLibrary();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const renderer = new WebGLRenderer({
    alpha: false,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  let disposed = false;
  let lastDpr = 0;
  let lastHeight = 0;
  let lastWidth = 0;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    onContextFailure("The 3D rendering context was lost.");
  };
  const handleContextCreationError = () => {
    onContextFailure("This browser could not create a 3D rendering context.");
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextcreationerror", handleContextCreationError);

  void modelLibrary.clone("garden-lighthouse-shell")
    .then((model) => {
      if (disposed) {
        disposeThreeObjectTree(model);
        return;
      }
      scene.lighthouseModel = model;
      attachGardenLighthouseModel(scene);
      onAssetReady?.();
    })
    .catch(() => {
      // The procedural shell is the intentional asset failure fallback.
    });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextcreationerror", handleContextCreationError);
      const detachedModel = scene.lighthouseModel?.parent ? null : scene.lighthouseModel;
      disposeThreeObjectTree(scene.root);
      if (detachedModel) disposeThreeObjectTree(detachedModel);
      modelLibrary.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
    },
    render(frame) {
      if (disposed) throw new Error("Cannot render a disposed Three.js world renderer.");

      const dpr = Math.max(1, Math.min(MAX_THREE_DPR, frame.dpr));
      const dprChanged = dpr !== lastDpr;
      if (dprChanged) {
        renderer.setPixelRatio(dpr);
        lastDpr = dpr;
      }
      if (frame.width !== lastWidth || frame.height !== lastHeight || dprChanged) {
        renderer.setSize(frame.width, frame.height, false);
        lastWidth = frame.width;
        lastHeight = frame.height;
      }

      const transientSelectedDetailId = selectGardenTransientShip(
        frame.world,
        frame.selectedDetailId,
      )?.detailId ?? null;
      if (
        scene.world !== frame.world
        || scene.content?.transientSelectedDetailId !== transientSelectedDetailId
      ) {
        replaceWorldContent(scene, frame.world, frame.selectedDetailId);
      }
      if (scene.content) syncShipSailTextures(scene.content, frame);
      updateSceneForFrame(scene, camera, frame);
      renderer.render(scene.root, camera);

      const content = scene.content;
      const renderInfo = renderer.info.render;
      const selected = frame.selectedDetailId ? 1 : 0;
      return {
        drawableCount: content?.drawableCount ?? 0,
        drawableCounts: {
          underlay: 1 + (content?.zones.length ?? 0),
          body: Math.max(0, (content?.drawableCount ?? 0) - selected - 2),
          overlay: 1,
          selection: selected,
        },
        gpu: {
          calls: renderInfo.calls,
          geometries: renderer.info.memory.geometries,
          lines: renderInfo.lines,
          points: renderInfo.points,
          textures: renderer.info.memory.textures,
          triangles: renderInfo.triangles,
        },
        movingShipCount: content?.ships.reduce((count, ship) => (
          ship.sampleState === "sailing" || ship.sampleState === "departing" || ship.sampleState === "arriving"
            ? count + 1
            : count
        ), 0) ?? 0,
        rendererBackend: "three",
        schedulerDegradedPasses: frame.renderScheduler.degradedPasses,
        schedulerSkippedPasses: frame.renderScheduler.skippedPasses,
        schedulerTier: frame.renderScheduler.tier,
        visibleShipCount: content?.visibleShipCount ?? 0,
        visibleTileCount: frame.world.map.width * frame.world.map.height,
      };
    },
  };
}

interface GardenScene {
  ambientLight: AmbientLight;
  content: GardenContent | null;
  directionalLight: DirectionalLight;
  hemisphereLight: HemisphereLight;
  hoverMarker: Mesh<RingGeometry, MeshBasicMaterial>;
  lighthouseModel: Group | null;
  root: Scene;
  selectedMarker: Mesh<RingGeometry, MeshBasicMaterial>;
  water: GardenWater;
  waterAccents: Group;
  world: PharosVilleWorld | null;
}

interface GardenContent {
  assetGeneration: string | null;
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  docks: DockVisual[];
  drawableCount: number;
  entityCues: Map<string, EntityCue>;
  harborLanternMaterial: MeshStandardMaterial;
  gullFlock: GardenGullFlock;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  root: Group;
  routeLine: Line<BufferGeometry, LineBasicMaterial>;
  routeLineKey: string | null;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  ships: ShipVisual[];
  transientSelectedDetailId: string | null;
  visibleShipCount: number;
  weather: GardenWeatherVisual[];
  zones: ZoneVisual[];
}

interface EntityCue {
  radius: number;
  root: Object3D;
  y: number;
}

interface DockVisual {
  dock: DockNode;
  fineDetail: Group;
  root: Group;
}

interface ZoneVisual {
  area: AreaNode;
  field: Mesh<CircleGeometry, MeshBasicMaterial>;
  rings: Array<Mesh<BufferGeometry, MeshBasicMaterial>>;
  root: Group;
}

interface GardenWeatherVisual {
  phase: number;
  root: Group;
  streaks: LineSegments<BufferGeometry, LineBasicMaterial>;
}

interface ShipVisual {
  bobPhase: number;
  displayOffset: { x: number; y: number };
  fineDetail: Group;
  identitySailMaterial: MeshStandardMaterial;
  representative: boolean;
  root: Group;
  sampleState: string;
  selectionRadius: number;
  ship: ShipNode;
  wake: Group;
  wakeDetail: Group;
}

type GardenSailKind = "fore-aft" | "square" | "junk";

interface GardenSailPlan {
  centerY: number;
  height: number;
  kind: GardenSailKind;
  reverse?: boolean;
  width: number;
}

interface GardenMastPlan {
  height: number;
  sails: readonly GardenSailPlan[];
  x: number;
}

interface GardenShipGeometryCache {
  geometries: Map<string, ThreeBufferGeometry>;
  wakeFillMaterial: MeshBasicMaterial;
  wakeMaterial: LineBasicMaterial;
}

const GARDEN_SHIP_RIGS: Record<GardenHullSilhouette, readonly GardenMastPlan[]> = {
  galleon: [
    {
      height: 3.25,
      sails: [{ centerY: 2.25, height: 1.55, kind: "fore-aft", reverse: true, width: 1.35 }],
      x: -1.55,
    },
    {
      height: 4.05,
      sails: [{ centerY: 2.65, height: 1.95, kind: "square", width: 1.85 }],
      x: 0,
    },
    {
      height: 3.55,
      sails: [{ centerY: 2.4, height: 1.65, kind: "square", reverse: true, width: 1.5 }],
      x: 1.55,
    },
  ],
  clipper: [
    {
      height: 3.05,
      sails: [{ centerY: 2.15, height: 1.55, kind: "square", width: 1.25 }],
      x: -1.45,
    },
    {
      height: 3.65,
      sails: [{ centerY: 2.45, height: 1.85, kind: "square", reverse: true, width: 1.45 }],
      x: 0.15,
    },
    {
      height: 3.2,
      sails: [{ centerY: 2.2, height: 1.55, kind: "square", width: 1.2 }],
      x: 1.7,
    },
  ],
  schooner: [
    {
      height: 3.15,
      sails: [{ centerY: 2.05, height: 1.9, kind: "fore-aft", reverse: true, width: 1.35 }],
      x: -1.05,
    },
    {
      height: 3.75,
      sails: [{ centerY: 2.4, height: 2.3, kind: "fore-aft", width: 1.55 }],
      x: 0.85,
    },
  ],
  junk: [
    {
      height: 3.35,
      sails: [{ centerY: 2.25, height: 2.2, kind: "junk", width: 1.9 }],
      x: -0.75,
    },
    {
      height: 2.8,
      sails: [{ centerY: 2, height: 1.7, kind: "junk", reverse: true, width: 1.45 }],
      x: 1.05,
    },
  ],
};

const GARDEN_SHIP_CABINS: Partial<Record<
  GardenHullSilhouette,
  { height: number; width: number; x: number; z: number }
>> = {
  galleon: { height: 0.82, width: 1.65, x: -2.15, z: 1.55 },
  junk: { height: 0.68, width: 1.55, x: -1.35, z: 1.28 },
  schooner: { height: 0.42, width: 1.05, x: -2.15, z: 0.92 },
};

function createGardenScene(): GardenScene {
  const root = new Scene();
  root.background = DAY_SKY.clone();
  root.fog = new Fog(DAY_SKY, 205, 450);

  const hemisphereLight = new HemisphereLight("#d7ece6", "#31483f", 1.15);
  root.add(hemisphereLight);
  const ambientLight = new AmbientLight("#fff0d1", 0.42);
  root.add(ambientLight);
  const directionalLight = new DirectionalLight("#ffe8b5", 2.3);
  directionalLight.position.set(-35, 55, -30);
  root.add(directionalLight);

  // A single oversized surface plus same-color fog/background keeps the sea
  // full-bleed under pan and zoom without visible plane or sky seams.
  const water = createGardenWater(WATER_LEVEL);
  root.add(water.mesh);

  const waterAccents = createWaterAccents();
  root.add(waterAccents);

  const hoverMarker = createCueMarker("#d8eee7", 0.4);
  const selectedMarker = createCueMarker(HARBOR_PALETTE.lantern_glow, 0.78);
  root.add(hoverMarker, selectedMarker);

  return {
    ambientLight,
    content: null,
    directionalLight,
    hemisphereLight,
    hoverMarker,
    lighthouseModel: null,
    root,
    selectedMarker,
    water,
    waterAccents,
    world: null,
  };
}

function createWaterAccents(): Group {
  const root = new Group();
  const indices: number[] = [];
  const positions: number[] = [];
  for (let index = 0; index < 96; index += 1) {
    const centerX = (stableUnit(`water-accent-x.${index}`) - 0.5) * 172;
    const centerZ = (stableUnit(`water-accent-z.${index}`) - 0.5) * 128;
    const radius = 0.75 + stableUnit(`water-accent-r.${index}`) * 2.4;
    const start = -0.52 + stableUnit(`water-accent-a.${index}`) * 0.44;
    const arc = 0.22 + stableUnit(`water-accent-l.${index}`) * 0.34;
    for (let segment = 0; segment < 3; segment += 1) {
      const first = start + (segment / 3) * arc;
      const second = start + ((segment + 1) / 3) * arc;
      const ax = centerX + Math.cos(first) * radius * 2.5;
      const az = centerZ + Math.sin(first) * radius;
      const bx = centerX + Math.cos(second) * radius * 2.5;
      const bz = centerZ + Math.sin(second) * radius;
      const length = Math.max(0.001, Math.hypot(bx - ax, bz - az));
      const width = 0.12 + stableUnit(`water-accent-w.${index}.${segment}`) * 0.08;
      const px = (-(bz - az) / length) * width;
      const pz = ((bx - ax) / length) * width;
      const vertex = positions.length / 3;
      positions.push(
        ax + px, WATER_LEVEL + 0.052, az + pz,
        ax - px, WATER_LEVEL + 0.052, az - pz,
        bx + px, WATER_LEVEL + 0.052, bz + pz,
        bx - px, WATER_LEVEL + 0.052, bz - pz,
      );
      indices.push(
        vertex, vertex + 1, vertex + 2,
        vertex + 2, vertex + 1, vertex + 3,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const accents = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: "#d7e7d8",
      depthWrite: false,
      opacity: 0.28,
      side: DoubleSide,
      transparent: true,
    }),
  );
  accents.name = "water-silver-accents";
  accents.renderOrder = 3;
  root.add(accents);
  return root;
}

function createCueMarker(color: string, opacity: number): Mesh<RingGeometry, MeshBasicMaterial> {
  const marker = new Mesh(
    new RingGeometry(0.82, 1, 40),
    new MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      opacity,
      side: DoubleSide,
      transparent: true,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 20;
  marker.visible = false;
  return marker;
}

function replaceWorldContent(
  scene: GardenScene,
  world: PharosVilleWorld,
  selectedDetailId: string | null,
): void {
  if (scene.content) {
    scene.lighthouseModel?.removeFromParent();
    scene.root.remove(scene.content.root);
    disposeThreeObjectTree(scene.content.root);
  }
  scene.content = createWorldContent(world, selectedDetailId);
  scene.root.add(scene.content.root);
  attachGardenLighthouseModel(scene);
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
  scene.water.setIslandCenter(
    islandTile.x * TILE_SCALE,
    islandTile.y * TILE_SCALE,
  );
  scene.waterAccents.position.set(
    islandTile.x * TILE_SCALE,
    0,
    islandTile.y * TILE_SCALE,
  );
  scene.world = world;
}

function createWorldContent(
  world: PharosVilleWorld,
  selectedDetailId: string | null,
): GardenContent {
  const root = new Group();
  const entityCues = new Map<string, EntityCue>();
  const slice = selectGardenObservatorySlice(world, selectedDetailId);
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);

  const island = createTerracedIsland(world);
  root.add(island.root);
  entityCues.set(world.lighthouse.detailId, {
    radius: 2.7,
    root: island.lighthouseRoot,
    y: 0.12,
  });

  const cemetery = createGardenCemetery(world.graves);
  const pigeonnier = createGardenPigeonnier(world.pigeonnier);
  root.add(cemetery.root, pigeonnier.root);
  for (const [detailId, anchor] of cemetery.anchors) {
    entityCues.set(detailId, {
      radius: anchor.userData.selectionRadius,
      root: anchor,
      y: 0.08,
    });
  }
  entityCues.set(world.pigeonnier.detailId, {
    radius: pigeonnier.anchor.userData.selectionRadius,
    root: pigeonnier.anchor,
    y: 0.08,
  });

  const zones = world.areas.map((area) => createZone(area));
  for (const zone of zones) {
    root.add(zone.root);
    entityCues.set(zone.area.detailId, { radius: 5.2, root: zone.root, y: 0.08 });
  }
  const weather = world.areas
    .filter((area) => area.band === "DANGER")
    .map((area) => createDangerWeather(area));
  for (const effect of weather) root.add(effect.root);

  const docks = world.docks.map((dock, index) => (
    createDock(dock, gardenDockDisplayTile(dock.tile, index), islandTile)
  ));
  const harborDistricts = createGardenHarborDistricts(
    world.docks,
    world.lighthouse.tile,
  );
  root.add(harborDistricts.root);
  for (const dock of docks) {
    root.add(dock.root);
    entityCues.set(dock.dock.detailId, { radius: 2.5, root: dock.root, y: 0.08 });
  }
  const harborLanterns = createHarborLanterns(islandTile);
  const gullFlock = createGardenGullFlock(world.lighthouse.tile);
  root.add(harborLanterns.root, gullFlock.root);

  const shipGeometryCache: GardenShipGeometryCache = {
    geometries: new Map(),
    wakeFillMaterial: new MeshBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.08,
      side: DoubleSide,
      transparent: true,
    }),
    wakeMaterial: new LineBasicMaterial({
      color: HARBOR_PALETTE.foam_white,
      depthWrite: false,
      opacity: 0.38,
      transparent: true,
    }),
  };
  const ships = slice.ships.map(({ displayOffset, representative, ship }) => (
    createShip(ship, displayOffset, representative, shipGeometryCache)
  ));
  const shipShadows = createShipShadows(ships.length);
  root.add(shipShadows);
  for (const ship of ships) {
    root.add(ship.root);
    entityCues.set(ship.ship.detailId, {
      radius: ship.selectionRadius,
      root: ship.root,
      y: -ship.root.position.y + 0.08,
    });
  }

  const routeLine = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      opacity: 0.44,
      transparent: true,
    }),
  );
  routeLine.visible = false;
  routeLine.renderOrder = 4;
  root.add(routeLine);

  const drawableCount = countDrawableObjects(root);
  return {
    assetGeneration: null,
    beacon: island.beacon,
    beaconHalo: island.beaconHalo,
    beam: island.beam,
    decoration: island.decoration,
    docks,
    drawableCount,
    entityCues,
    gullFlock,
    harborLanternMaterial: harborLanterns.lightMaterial,
    lighthouseLight: island.lighthouseLight,
    lighthouseRoot: island.lighthouseRoot,
    lighthouseShell: island.lighthouseShell,
    root,
    routeLine,
    routeLineKey: null,
    shipShadows,
    ships,
    transientSelectedDetailId: slice.transientSelectedDetailId,
    visibleShipCount: ships.length,
    weather,
    zones,
  };
}

function createTerracedIsland(world: PharosVilleWorld): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, gardenIslandDisplayTile(world.lighthouse.tile), 0);

  const wetCliffMaterial = new MeshStandardMaterial({
    color: "#526b66",
    flatShading: true,
    roughness: 0.92,
  });
  const cliffMaterial = new MeshStandardMaterial({
    color: "#858776",
    flatShading: true,
    roughness: 0.98,
  });
  const limestoneMaterial = new MeshStandardMaterial({
    color: "#b9b49d",
    flatShading: true,
    roughness: 0.96,
  });
  const paleStoneMaterial = new MeshStandardMaterial({
    color: "#d8d0b8",
    flatShading: true,
    roughness: 0.94,
  });
  const plantedMaterial = new MeshStandardMaterial({
    color: "#617553",
    flatShading: true,
    roughness: 1,
  });
  const plantedLightMaterial = new MeshStandardMaterial({
    color: "#879064",
    flatShading: true,
    roughness: 1,
  });

  const shoal = new Mesh(
    createIrregularTerraceGeometry(19.6, 20.5, 0.16, 36, 0.8),
    new MeshBasicMaterial({
      color: "#5ca394",
      depthWrite: false,
      opacity: 0.28,
      transparent: true,
    }),
  );
  shoal.position.set(1.2, WATER_LEVEL + 0.055, 1.5);
  shoal.scale.z = 0.72;
  shoal.renderOrder = 1;
  root.add(shoal);

  const shore = new Mesh(
    createIrregularTerraceGeometry(16.8, 18.4, 1.45, 32, 0.3),
    [cliffMaterial, paleStoneMaterial, wetCliffMaterial],
  );
  shore.position.set(0.6, -0.74, 1.2);
  shore.scale.z = 0.75;
  shore.rotation.y = 0.08;
  root.add(shore);

  const lower = new Mesh(
    createIrregularTerraceGeometry(13.7, 15.7, 1.72, 30, 1.25),
    [cliffMaterial, limestoneMaterial, wetCliffMaterial],
  );
  lower.position.set(-1.8, 0.05, 0.65);
  lower.scale.z = 0.7;
  lower.rotation.y = -0.12;
  root.add(lower);

  const middle = new Mesh(
    createIrregularTerraceGeometry(10.1, 12.3, 1.55, 28, 2.2),
    [limestoneMaterial, plantedLightMaterial, cliffMaterial],
  );
  middle.position.set(-4.45, 1.22, 0.05);
  middle.scale.z = 0.64;
  middle.rotation.y = 0.18;
  root.add(middle);

  const crown = new Mesh(
    createIrregularTerraceGeometry(6.1, 8.1, 1.15, 24, 3.35),
    [limestoneMaterial, plantedMaterial, cliffMaterial],
  );
  crown.position.set(-6.7, 2.18, -1.1);
  crown.scale.z = 0.66;
  crown.rotation.y = -0.08;
  root.add(crown);

  for (const [radius, x, y, z, scaleZ, seed] of [
    [4.55, 3.55, 0.92, 2.9, 0.48, 0.4],
    [3.65, -6.0, 1.9, 2.0, 0.43, 1.8],
    [2.9, 2.25, 2.42, -3.7, 0.52, 2.7],
  ] as const) {
    const plantedShelf = new Mesh(
      createIrregularTerraceGeometry(radius, radius * 1.06, 0.2, 16, seed),
      plantedMaterial,
    );
    plantedShelf.position.set(x, y, z);
    plantedShelf.scale.z = scaleZ;
    plantedShelf.rotation.y = x * 0.08;
    root.add(plantedShelf);
  }

  const pathMaterial = new MeshStandardMaterial({
    color: "#d2c9af",
    flatShading: true,
    roughness: 1,
  });
  for (const [x, y, z, width, rotation] of [
    [5.3, 1.16, 3.35, 2.7, -0.46],
    [3.25, 1.45, 3.0, 2.35, -0.3],
    [1.25, 1.78, 2.45, 2.1, -0.23],
    [-0.55, 2.06, 1.8, 1.9, -0.18],
    [-2.2, 2.32, 1.1, 1.75, -0.13],
    [-3.75, 2.55, 0.35, 1.55, -0.03],
    [-5.2, 2.72, -0.35, 1.4, 0.08],
  ] as const) {
    const pathStep = new Mesh(new BoxGeometry(width, 0.18, 0.82), pathMaterial);
    pathStep.position.set(x, y, z);
    pathStep.rotation.y = rotation;
    root.add(pathStep);
  }

  const lighthouseRoot = new Group();
  lighthouseRoot.position.set(
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  );
  root.add(lighthouseRoot);
  const lighthouse = createLighthouse();
  lighthouseRoot.add(lighthouse.root);

  const decoration = createIslandDecoration();
  root.add(decoration);
  root.add(
    createKeeperCottage(),
    createObservatoryPavilion(),
    createIslandReflectionPond(),
  );

  return {
    beacon: lighthouse.beacon,
    beaconHalo: lighthouse.beaconHalo,
    beam: lighthouse.beam,
    decoration,
    lighthouseLight: lighthouse.light,
    lighthouseRoot,
    lighthouseShell: lighthouse.shell,
    root,
  };
}

function attachGardenLighthouseModel(scene: GardenScene): void {
  const content = scene.content;
  const model = scene.lighthouseModel;
  if (!content || !model) return;

  model.removeFromParent();
  content.lighthouseRoot.add(model);
  content.lighthouseShell.visible = false;

  const beaconPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beacon",
  ).position;
  const beamPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beam",
  ).position;
  content.beacon.position.copy(beaconPosition);
  content.beaconHalo.position.copy(beaconPosition);
  content.lighthouseLight.position.copy(beaconPosition);
  content.beam.position.copy(beamPosition);
}

function createIrregularTerraceGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  segments: number,
  seed: number,
): CylinderGeometry {
  const geometry = new CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    segments,
    1,
    false,
  );
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 0.001) continue;
    const angle = Math.atan2(z, x);
    const variation = 1
      + Math.sin(angle * 3 + seed) * 0.045
      + Math.sin(angle * 7 - seed * 0.7) * 0.026
      + Math.sin(angle * 11 + seed * 1.3) * 0.012;
    positions.setX(index, x * variation);
    positions.setZ(index, z * variation);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createLighthouse(): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  light: PointLight;
  root: Group;
  shell: Group;
} {
  const root = new Group();
  const paleStone = new MeshStandardMaterial({
    color: "#d8d0b8",
    flatShading: true,
    roughness: 0.88,
  });
  const midStone = new MeshStandardMaterial({
    color: "#aaa58f",
    flatShading: true,
    roughness: 0.94,
  });
  const shadowStone = new MeshStandardMaterial({
    color: "#777b70",
    flatShading: true,
    roughness: 0.96,
  });
  const bronze = new MeshStandardMaterial({
    color: "#67584a",
    metalness: 0.5,
    roughness: 0.5,
  });
  const copper = new MeshStandardMaterial({
    color: "#547367",
    metalness: 0.42,
    roughness: 0.58,
  });

  const stairMaterial = new MeshStandardMaterial({
    color: "#c9c0a8",
    flatShading: true,
    roughness: 1,
  });
  for (const [width, depth, y, z] of [
    [5.7, 5.2, 0.22, 0],
    [4.9, 4.2, 0.52, 0.35],
    [4.15, 3.4, 0.82, 0.65],
  ] as const) {
    const step = new Mesh(new BoxGeometry(width, 0.34, depth), stairMaterial);
    step.position.set(0, y, z);
    root.add(step);
  }

  const foundation = new Mesh(new CylinderGeometry(2.35, 2.7, 1.45, 8), shadowStone);
  foundation.position.y = 1.42;
  foundation.rotation.y = Math.PI / 8;
  root.add(foundation);

  const lowerTower = new Mesh(
    new CylinderGeometry(1.82, 2.32, 4.6, 8),
    paleStone,
  );
  lowerTower.position.y = 4.35;
  lowerTower.rotation.y = Math.PI / 8;
  root.add(lowerTower);

  const middleTower = new Mesh(
    new CylinderGeometry(1.48, 1.85, 4.15, 8),
    midStone,
  );
  middleTower.position.y = 8.72;
  middleTower.rotation.y = Math.PI / 8;
  root.add(middleTower);

  const upperTower = new Mesh(
    new CylinderGeometry(1.25, 1.52, 2.65, 8),
    paleStone,
  );
  upperTower.position.y = 12.08;
  upperTower.rotation.y = Math.PI / 8;
  root.add(upperTower);

  for (const [radius, y, height] of [
    [2.42, 2.15, 0.24],
    [1.92, 6.55, 0.22],
    [1.57, 10.76, 0.2],
    [1.38, 13.42, 0.22],
  ] as const) {
    const cornice = new Mesh(
      new CylinderGeometry(radius, radius, height, 8),
      shadowStone,
    );
    cornice.position.y = y;
    cornice.rotation.y = Math.PI / 8;
    root.add(cornice);
  }

  const courseGeometry = new CylinderGeometry(1, 1, 0.055, 8);
  for (const [radius, y] of [
    [2.2, 3.0], [2.08, 4.05], [1.95, 5.15],
    [1.76, 7.35], [1.66, 8.45], [1.56, 9.55],
    [1.39, 11.55], [1.31, 12.55],
  ] as const) {
    const course = new Mesh(courseGeometry, shadowStone);
    course.position.y = y;
    course.scale.set(radius, 1, radius);
    course.rotation.y = Math.PI / 8;
    root.add(course);
  }

  const doorMaterial = new MeshStandardMaterial({
    color: "#5a4030",
    roughness: 0.82,
  });
  const door = new Mesh(new BoxGeometry(0.82, 1.65, 0.12), doorMaterial);
  door.position.set(0, 2.3, 2.17);
  root.add(door);

  const windowMaterial = new MeshStandardMaterial({
    color: "#26383a",
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.24,
    roughness: 0.38,
  });
  for (const [angle, y, radius] of [
    [0, 5.0, 2.0],
    [Math.PI / 2, 8.7, 1.68],
    [Math.PI, 11.85, 1.35],
  ] as const) {
    const window = new Mesh(new BoxGeometry(0.56, 0.95, 0.1), windowMaterial);
    window.position.set(
      Math.sin(angle) * radius,
      y,
      Math.cos(angle) * radius,
    );
    window.rotation.y = angle;
    root.add(window);
  }

  const balcony = new Mesh(new CylinderGeometry(1.95, 1.95, 0.34, 16), bronze);
  balcony.position.y = 13.65;
  root.add(balcony);
  const rail = new Mesh(new TorusGeometry(1.78, 0.05, 6, 28), bronze);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 14.38;
  root.add(rail);
  const railPosts = new InstancedMesh(
    new CylinderGeometry(0.035, 0.045, 0.7, 5),
    bronze,
    12,
  );
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    scratchMatrix.makeTranslation(
      Math.cos(angle) * 1.76,
      14.02,
      Math.sin(angle) * 1.76,
    );
    railPosts.setMatrixAt(index, scratchMatrix);
  }
  railPosts.instanceMatrix.needsUpdate = true;
  root.add(railPosts);

  const glazing = new MeshStandardMaterial({
    color: "#d8ebe1",
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.34,
    opacity: 0.44,
    roughness: 0.12,
    transparent: true,
  });
  const lanternRoom = new Mesh(
    new CylinderGeometry(1.25, 1.25, 1.75, 8),
    glazing,
  );
  lanternRoom.position.y = 14.95;
  lanternRoom.rotation.y = Math.PI / 8;
  root.add(lanternRoom);
  const lanternFrame = new InstancedMesh(
    new CylinderGeometry(0.035, 0.045, 1.72, 5),
    bronze,
    8,
  );
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    scratchMatrix.makeTranslation(
      Math.cos(angle) * 1.21,
      14.95,
      Math.sin(angle) * 1.21,
    );
    lanternFrame.setMatrixAt(index, scratchMatrix);
  }
  lanternFrame.instanceMatrix.needsUpdate = true;
  root.add(lanternFrame);

  const roof = new Mesh(
    new ConeGeometry(1.68, 1.65, 8),
    copper,
  );
  roof.position.y = 16.62;
  roof.rotation.y = Math.PI / 8;
  root.add(roof);
  const finial = new Mesh(
    new SphereGeometry(0.18, 8, 6),
    new MeshStandardMaterial({
      color: "#75644f",
      metalness: 0.6,
      roughness: 0.42,
    }),
  );
  finial.position.y = GARDEN_LIGHTHOUSE_HEIGHT;
  root.add(finial);

  const shell = new Group();
  shell.name = "lighthouse-procedural-shell";
  shell.add(...root.children);
  root.add(shell);

  const beacon = new Mesh(
    new SphereGeometry(0.4, 12, 8),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_warm,
      emissive: HARBOR_PALETTE.lantern_glow,
      emissiveIntensity: 3.2,
      roughness: 0.12,
    }),
  );
  beacon.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(beacon);

  const halo = new Mesh(
    new SphereGeometry(1.34, 16, 10),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: HARBOR_PALETTE.lantern_glow,
      depthWrite: false,
      opacity: 0.22,
      transparent: true,
    }),
  );
  halo.position.copy(beacon.position);
  halo.name = "lighthouse-halo";
  root.add(halo);

  const light = new PointLight(
    HARBOR_PALETTE.lantern_warm,
    0.95,
    36,
    2,
  );
  light.position.copy(beacon.position);
  root.add(light);

  const beam = new Group();
  beam.position.copy(beacon.position);
  const beamGeometry = new PlaneGeometry(46, 12);
  beamGeometry.rotateX(-Math.PI / 2);
  beamGeometry.translate(23, 0, 0);
  const beamMaterial = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        float along = vUv.x;
        float across = abs(vUv.y - 0.5);
        float halfWidth = mix(0.02, 0.38, smoothstep(0.0, 1.0, along));
        float feather = 1.0 - smoothstep(halfWidth * 0.42, halfWidth, across);
        float startFade = smoothstep(0.0, 0.08, along);
        float endFade = 1.0 - smoothstep(0.7, 1.0, along);
        float strands = 0.82 + sin(along * 96.0) * 0.18;
        gl_FragColor = vec4(
          uColor,
          uOpacity * feather * startFade * endFade * strands
        );
      }
    `,
    side: DoubleSide,
    transparent: true,
    uniforms: {
      uColor: { value: new Color("#ffdda0") },
      uOpacity: { value: 0.08 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const sweep = new Mesh(beamGeometry, beamMaterial);
  sweep.name = "lighthouse-beam";
  beam.add(sweep);
  root.add(beam);

  return { beacon, beaconHalo: halo, beam, light, root, shell };
}

function createIslandDecoration(): Group {
  const root = new Group();
  const treePoints = [
    [-9.7, 1.12, -2.4, 1.06, -0.9],
    [-7.8, 1.55, 2.15, 0.9, -0.72],
    [-5.9, 1.45, -4.1, 0.84, -0.68],
    [-2.0, 1.33, 5.05, 1.02, -0.38],
    [0.55, 1.08, 4.55, 0.9, -0.25],
    [5.45, 0.92, 1.95, 0.96, 0.32],
    [-5.8, 2.42, 1.45, 0.72, -0.52],
    [2.8, 2.34, -3.55, 0.74, 0.22],
    [-5.4, 0.82, 6.15, 0.66, -0.35],
    [0.4, 0.36, 7.2, 0.58, 0.08],
    [5.7, 0.2, 5.2, 0.64, 0.3],
  ] as const;
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.11, 0.22, 2.15, 7),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    treePoints.length,
  );
  const crowns = new InstancedMesh(
    new DodecahedronGeometry(1, 0),
    new MeshStandardMaterial({
      color: "#6f8058",
      flatShading: true,
      roughness: 0.96,
    }),
    treePoints.length,
  );
  treePoints.forEach(([x, y, z, scale, wind], index) => {
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.9, z);
    trunks.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeScale(scale * 1.55, scale * 0.62, scale * 1.12);
    scratchMatrix.setPosition(x + wind, y + 2.18, z);
    crowns.setMatrixAt(index, scratchMatrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  root.add(trunks, crowns);
  const westPine = createWindPine(1.12, -0.72);
  westPine.position.set(-10.4, 1.18, 0.1);
  westPine.rotation.y = -0.28;
  root.add(westPine);
  const eastPine = createWindPine(0.9, 0.58);
  eastPine.position.set(4.7, 1.25, -2.2);
  eastPine.rotation.y = 0.4;
  root.add(eastPine);

  const stonePoints = [
    [-13.9, -0.12, 2.7, 1.05],
    [-12.1, 0.28, -4.7, 0.82],
    [-9.0, 0.72, 5.9, 0.96],
    [-5.5, 0.55, -7.0, 0.72],
    [-1.0, 0.24, 7.2, 0.88],
    [3.6, 0.16, 6.15, 0.76],
    [8.4, -0.12, 3.7, 1.08],
    [10.8, -0.32, -0.3, 0.82],
    [7.5, -0.22, -5.2, 0.94],
    [2.4, 1.95, -4.9, 0.62],
    [-6.1, 1.52, -4.25, 0.7],
    [-8.4, 1.9, 2.85, 0.66],
    [5.9, 0.86, 4.55, 0.58],
    [-2.7, 1.35, 5.95, 0.55],
    [-7.5, 0.3, 6.2, 0.98],
    [-2.8, -0.06, 8.0, 0.9],
    [2.5, -0.22, 7.55, 1.08],
    [6.8, -0.4, 5.2, 0.94],
  ] as const;
  const stones = new InstancedMesh(
    new DodecahedronGeometry(0.8, 0),
    new MeshStandardMaterial({
      color: "#989986",
      flatShading: true,
      roughness: 1,
    }),
    stonePoints.length,
  );
  stonePoints.forEach(([x, y, z, scale], index) => {
    scratchMatrix.makeScale(scale, scale * 0.62, scale);
    scratchMatrix.setPosition(x, y, z);
    stones.setMatrixAt(index, scratchMatrix);
  });
  stones.instanceMatrix.needsUpdate = true;
  root.add(stones);

  const reedPoints = [
    [8.7, -0.05, 2.6], [9.1, -0.08, 2.1], [9.35, -0.1, 1.5],
    [7.8, 0.02, 3.6], [7.35, 0.05, 4.05], [-11.8, 0.12, 4.0],
    [-12.35, 0.02, 3.5], [-12.7, -0.05, 2.9], [3.8, 0.12, 6.2],
    [4.4, 0.04, 5.9], [5.0, -0.02, 5.5], [-4.6, 0.08, 6.5],
  ] as const;
  const reeds = new InstancedMesh(
    new ConeGeometry(0.13, 1.15, 5),
    new MeshStandardMaterial({ color: "#526a4d", flatShading: true, roughness: 1 }),
    reedPoints.length,
  );
  reedPoints.forEach(([x, y, z], index) => {
    const scale = 0.74 + stableUnit(`reed.${index}`) * 0.5;
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.52 * scale, z);
    reeds.setMatrixAt(index, scratchMatrix);
  });
  reeds.instanceMatrix.needsUpdate = true;
  root.add(reeds);

  for (const [x, y, z] of [
    [-3.2, 2.78, 0.65],
    [1.4, 2.12, 2.52],
    [5.5, 1.22, 3.45],
  ] as const) {
    const lantern = new Group();
    lantern.position.set(x, y, z);
    const pedestal = new Mesh(
      new CylinderGeometry(0.16, 0.22, 0.72, 6),
      new MeshStandardMaterial({ color: "#807f71", flatShading: true, roughness: 1 }),
    );
    pedestal.position.y = 0.36;
    const lamp = new Mesh(
      new BoxGeometry(0.34, 0.32, 0.34),
      new MeshStandardMaterial({
        color: "#d4b66f",
        emissive: HARBOR_PALETTE.lantern_warm,
        emissiveIntensity: 0.7,
        roughness: 0.48,
      }),
    );
    lamp.position.y = 0.88;
    const cap = new Mesh(
      new ConeGeometry(0.32, 0.25, 4),
      new MeshStandardMaterial({ color: "#696a61", flatShading: true, roughness: 0.9 }),
    );
    cap.position.y = 1.17;
    cap.rotation.y = Math.PI / 4;
    lantern.add(pedestal, lamp, cap);
    root.add(lantern);
  }
  return root;
}

function createWindPine(scale: number, bend: number): Group {
  const root = new Group();
  const trunkMaterial = new MeshStandardMaterial({
    color: "#514536",
    flatShading: true,
    roughness: 1,
  });
  const foliageMaterial = new MeshStandardMaterial({
    color: "#3f5d49",
    flatShading: true,
    roughness: 0.96,
  });
  for (const [x, y, rotation, length, radius] of [
    [0, 0.75, bend * 0.12, 1.6, 0.2],
    [bend * 0.18, 2.05, bend * 0.18, 1.35, 0.16],
    [bend * 0.4, 3.12, bend * 0.24, 1.05, 0.12],
  ] as const) {
    const trunk = new Mesh(
      new CylinderGeometry(radius * 0.72, radius, length, 7),
      trunkMaterial,
    );
    trunk.position.set(x, y, 0);
    trunk.rotation.z = rotation;
    root.add(trunk);
  }
  for (const [x, y, z, sx, sy, sz] of [
    [bend * 0.32, 2.35, 0, 1.45, 0.5, 0.92],
    [bend * 0.62, 3.12, 0.18, 1.7, 0.58, 1.0],
    [bend * 0.82, 3.82, -0.1, 1.25, 0.48, 0.82],
    [bend * 0.18, 3.55, 0.12, 0.85, 0.42, 0.72],
  ] as const) {
    const crown = new Mesh(new DodecahedronGeometry(1, 0), foliageMaterial);
    crown.position.set(x, y, z);
    crown.scale.set(sx, sy, sz);
    root.add(crown);
  }
  root.scale.setScalar(scale);
  return root;
}

function createKeeperCottage(): Group {
  const root = new Group();
  root.position.set(-1.2, 2.08, -0.3);
  root.rotation.y = -0.18;
  const foundation = new Mesh(
    new BoxGeometry(4.7, 0.38, 3.2),
    new MeshStandardMaterial({ color: "#8f8d7d", flatShading: true, roughness: 1 }),
  );
  foundation.position.y = 0.18;
  const walls = new Mesh(
    new BoxGeometry(4.1, 1.9, 2.7),
    new MeshStandardMaterial({ color: "#c7bea7", flatShading: true, roughness: 0.96 }),
  );
  walls.position.y = 1.25;
  const roof = new Mesh(
    new ConeGeometry(3.25, 1.5, 4),
    new MeshStandardMaterial({
      color: "#6b4a3e",
      flatShading: true,
      roughness: 0.84,
    }),
  );
  roof.position.y = 2.75;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.72;
  const windowMaterial = new MeshStandardMaterial({
    color: "#dfbd73",
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.45,
    roughness: 0.38,
  });
  const window = new Mesh(new BoxGeometry(0.74, 0.65, 0.08), windowMaterial);
  window.position.set(0.8, 1.42, 1.39);
  root.add(foundation, walls, roof, window);
  return root;
}

function createObservatoryPavilion(): Group {
  const root = new Group();
  root.position.set(4.4, 1.05, 2.35);
  root.rotation.y = 0.22;
  const stoneMaterial = new MeshStandardMaterial({
    color: "#a4a28e",
    flatShading: true,
    roughness: 1,
  });
  const timberMaterial = new MeshStandardMaterial({
    color: "#5d4635",
    roughness: 0.92,
  });
  const copperMaterial = new MeshStandardMaterial({
    color: "#4f7166",
    metalness: 0.28,
    roughness: 0.66,
  });
  const base = new Mesh(new CylinderGeometry(2.2, 2.4, 0.36, 8), stoneMaterial);
  base.position.y = 0.18;
  root.add(base);
  for (const [x, z] of [[-1.25, -0.8], [-1.25, 0.8], [1.25, -0.8], [1.25, 0.8]] as const) {
    const post = new Mesh(new CylinderGeometry(0.09, 0.12, 2.4, 6), timberMaterial);
    post.position.set(x, 1.45, z);
    root.add(post);
  }
  const roof = new Mesh(new ConeGeometry(2.55, 1.15, 8), copperMaterial);
  roof.position.y = 3.05;
  roof.scale.z = 0.72;
  root.add(roof);
  const instrument = new Mesh(
    new SphereGeometry(0.38, 10, 7),
    new MeshStandardMaterial({
      color: "#c79d52",
      metalness: 0.62,
      roughness: 0.38,
    }),
  );
  instrument.position.y = 1.08;
  root.add(instrument);
  return root;
}

function createIslandReflectionPond(): Group {
  const root = new Group();
  root.position.set(1.45, 2.03, -2.05);
  root.rotation.y = -0.18;
  const pond = new Mesh(
    new CircleGeometry(2.65, 32),
    new MeshStandardMaterial({
      color: "#315f60",
      metalness: 0.08,
      roughness: 0.28,
      side: DoubleSide,
    }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.scale.z = 0.62;
  root.add(pond);
  const rim = new Mesh(
    new RingGeometry(2.55, 2.83, 32),
    new MeshStandardMaterial({
      color: "#a8a590",
      flatShading: true,
      roughness: 1,
      side: DoubleSide,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.035;
  rim.scale.z = 0.62;
  root.add(rim);

  const steppingStones = new InstancedMesh(
    new DodecahedronGeometry(0.35, 0),
    new MeshStandardMaterial({
      color: "#bbb6a0",
      flatShading: true,
      roughness: 1,
    }),
    6,
  );
  for (let index = 0; index < steppingStones.count; index += 1) {
    const progress = index / (steppingStones.count - 1);
    scratchMatrix.makeScale(
      1 + (index % 2) * 0.18,
      0.3,
      0.82 + ((index + 1) % 2) * 0.16,
    );
    scratchMatrix.setPosition(
      -1.85 + progress * 3.65,
      0.16 + Math.sin(progress * Math.PI) * 0.03,
      Math.sin(progress * Math.PI * 1.2) * 0.32,
    );
    steppingStones.setMatrixAt(index, scratchMatrix);
  }
  steppingStones.instanceMatrix.needsUpdate = true;
  root.add(steppingStones);
  return root;
}

function createZone(area: AreaNode): ZoneVisual {
  const placement = area.riskPlacement
    ?? (area.band ? DEWS_AREA_PLACEMENTS[area.band] : "safe-harbor");
  const definition = riskWaterAreaForPlacement(placement);
  const theme = zoneThemeForTerrain(definition.terrain);
  const danger = area.band === "DANGER";
  const radius = 5.2 + Math.min(3.8, Math.sqrt(Math.max(1, area.count ?? 1)) * 0.78);
  const root = new Group();
  setTilePosition(root, gardenAreaDisplayTile(area), GARDEN_ZONE_ROOT_Y);
  root.scale.set(radius * 1.25, 1, radius * 0.76);

  const field = new Mesh(
    new CircleGeometry(1, 48),
    new MeshBasicMaterial({
      color: theme.base,
      depthWrite: false,
      opacity: danger ? 0.58 : 0.34,
      side: DoubleSide,
      transparent: true,
    }),
  );
  field.rotation.x = -Math.PI / 2;
  field.renderOrder = 2;
  root.add(field);

  const rings = ([
    [0.4, 0.415, 0.13],
    [0.68, 0.7, 0.19],
    [0.96, 1, 0.32],
  ] as const).map(([inner, outer, opacity], index) => {
    const ring = new Mesh(
      createBrokenRingGeometry(
        inner,
        outer,
        stableUnit(`zone-arc.${area.id}.${index}`),
      ),
      new MeshBasicMaterial({
        color: theme.label.accent,
        depthWrite: false,
        opacity: danger ? opacity * 1.28 : opacity,
        side: DoubleSide,
        transparent: true,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025 + index * 0.008;
    ring.renderOrder = 3;
    root.add(ring);
    return ring;
  });
  return { area, field, rings, root };
}

function createBrokenRingGeometry(
  innerRadius: number,
  outerRadius: number,
  seed: number,
): BufferGeometry {
  const segments = 48;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const progress = (segment / segments + seed * 0.24) % 1;
    const visible = (progress > 0.06 && progress < 0.42)
      || (progress > 0.54 && progress < 0.83);
    if (!visible) continue;

    const start = (segment / segments) * Math.PI * 2;
    const end = ((segment + 1) / segments) * Math.PI * 2;
    const vertex = positions.length / 3;
    positions.push(
      Math.cos(start) * innerRadius, Math.sin(start) * innerRadius, 0,
      Math.cos(start) * outerRadius, Math.sin(start) * outerRadius, 0,
      Math.cos(end) * innerRadius, Math.sin(end) * innerRadius, 0,
      Math.cos(end) * outerRadius, Math.sin(end) * outerRadius, 0,
    );
    indices.push(
      vertex, vertex + 1, vertex + 2,
      vertex + 2, vertex + 1, vertex + 3,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createDangerWeather(area: AreaNode): GardenWeatherVisual {
  const root = new Group();
  setTilePosition(root, gardenAreaDisplayTile(area), GARDEN_ZONE_ROOT_Y);
  const points: Vector3[] = [];
  for (let index = 0; index < 32; index += 1) {
    const x = (stableUnit(`rain-x.${area.id}.${index}`) - 0.5) * 15;
    const z = (stableUnit(`rain-z.${area.id}.${index}`) - 0.5) * 8;
    const y = 1.4 + stableUnit(`rain-y.${area.id}.${index}`) * 7;
    points.push(
      new Vector3(x, y, z),
      new Vector3(x - 0.42, y - 2.1, z + 0.18),
    );
  }
  const streaks = new LineSegments(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({
      color: "#b7c9ca",
      depthWrite: false,
      opacity: 0.16,
      transparent: true,
    }),
  );
  streaks.name = "danger-rain-curtain";
  root.add(streaks);
  return {
    phase: stableUnit(`rain-phase.${area.id}`),
    root,
    streaks,
  };
}

function createHarborLanterns(
  islandTile: { x: number; y: number },
): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, islandTile, 0);
  const count = 12;
  const bodyMaterial = new MeshStandardMaterial({
    color: "#766348",
    metalness: 0.38,
    roughness: 0.65,
  });
  const lightMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.25,
    roughness: 0.25,
  });
  const bodies = new InstancedMesh(
    new CylinderGeometry(0.12, 0.2, 0.42, 6),
    bodyMaterial,
    count,
  );
  const lights = new InstancedMesh(
    new SphereGeometry(0.16, 8, 6),
    lightMaterial,
    count,
  );
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
      + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const radiusX = 22 + (index % 3) * 1.25;
    const radiusZ = 15.5 + (index % 2) * 1.15;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.26, z);
    bodies.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.58, z);
    lights.setMatrixAt(index, scratchMatrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  root.add(bodies, lights);
  return { lightMaterial, root };
}

function createDock(
  dock: DockNode,
  displayTile: { x: number; y: number },
  islandTile: { x: number; y: number },
): DockVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "dock-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, displayTile, GARDEN_DOCK_ROOT_Y);
  const toIslandX = (islandTile.x - displayTile.x) * TILE_SCALE;
  const toIslandZ = (islandTile.y - displayTile.y) * TILE_SCALE;
  root.rotation.y = -Math.atan2(toIslandZ, toIslandX);

  const amountScale = MathUtils.clamp(Math.log10(Math.max(1, dock.totalUsd)) / 11, 0.72, 1.18);
  const length = 7.2 * amountScale;
  const width = 1.65 + amountScale * 0.35;
  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_mid,
    roughness: 0.88,
  });
  const pier = new Mesh(new BoxGeometry(length, 0.42, width), timber);
  pier.position.x = length * 0.2;
  root.add(pier);
  const crossPier = new Mesh(new BoxGeometry(1.25, 0.36, width * 2.25), timber);
  crossPier.position.x = length * 0.56;
  root.add(crossPier);

  const plankPoints: Vector3[] = [];
  for (let index = 0; index <= 7; index += 1) {
    const x = -length * 0.3 + (index / 7) * length;
    plankPoints.push(
      new Vector3(x, 0.225, -width * 0.46),
      new Vector3(x, 0.225, width * 0.46),
    );
  }
  const planks = new LineSegments(
    new BufferGeometry().setFromPoints(plankPoints),
    new LineBasicMaterial({
      color: HARBOR_PALETTE.timber_dark,
      opacity: 0.4,
      transparent: true,
    }),
  );
  fineDetail.add(planks);

  const pylons = new InstancedMesh(
    new CylinderGeometry(0.16, 0.2, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    6,
  );
  let pylonIndex = 0;
  for (const x of [-length * 0.2, length * 0.18, length * 0.55]) {
    for (const z of [-width * 0.55, width * 0.55]) {
      scratchMatrix.makeTranslation(x, -0.85, z);
      pylons.setMatrixAt(pylonIndex, scratchMatrix);
      pylonIndex += 1;
    }
  }
  pylons.instanceMatrix.needsUpdate = true;
  fineDetail.add(pylons);

  const bollards = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 0.44, 6),
    new MeshStandardMaterial({
      color: "#6d5d49",
      metalness: 0.42,
      roughness: 0.62,
    }),
    4,
  );
  let bollardIndex = 0;
  for (const x of [-length * 0.18, length * 0.54]) {
    for (const z of [-width * 0.52, width * 0.52]) {
      scratchMatrix.makeTranslation(x, 0.42, z);
      bollards.setMatrixAt(bollardIndex, scratchMatrix);
      bollardIndex += 1;
    }
  }
  bollards.instanceMatrix.needsUpdate = true;
  fineDetail.add(bollards);

  const signalColor = dockHealthAccent(dock.healthBand);
  const signalMast = new Mesh(
    new CylinderGeometry(0.065, 0.09, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.96 }),
  );
  signalMast.position.set(length * 0.52, 1.25, -width * 0.35);
  root.add(signalMast);
  const signalShape = new Shape();
  signalShape.moveTo(0, 0);
  signalShape.lineTo(0.9, -0.27);
  signalShape.lineTo(0, -0.57);
  signalShape.closePath();
  const signal = new Mesh(
    new ShapeGeometry(signalShape),
    new MeshStandardMaterial({
      color: signalColor,
      emissive: signalColor,
      emissiveIntensity: 0.1,
      side: DoubleSide,
    }),
  );
  signal.position.set(length * 0.52, 2.2, -width * 0.34);
  root.add(signal);

  const storehouse = new Group();
  storehouse.position.set(-length * 0.2, 0.3, 0);
  const storehouseWalls = new Mesh(
    new BoxGeometry(1.7, 0.88, Math.max(1.35, width * 0.86)),
    new MeshStandardMaterial({
      color: "#9f8c68",
      flatShading: true,
      roughness: 0.96,
    }),
  );
  storehouseWalls.position.y = 0.44;
  const storehouseRoof = new Mesh(
    new BoxGeometry(2, 0.2, Math.max(1.58, width)),
    new MeshStandardMaterial({
      color: signalColor,
      flatShading: true,
      roughness: 0.88,
    }),
  );
  storehouseRoof.position.y = 0.98;
  storehouseRoof.rotation.z = -0.06;
  storehouse.add(storehouseWalls, storehouseRoof);
  root.add(storehouse);

  const crateCount = dock.backingDiversity == null
    ? 0
    : dock.backingDiversity < 0.35
      ? 3
      : dock.backingDiversity < 0.55
        ? 2
        : 0;
  if (crateCount > 0) {
    const crates = new InstancedMesh(
      new BoxGeometry(0.46, 0.4, 0.46),
      new MeshStandardMaterial({
        color: "#8d623a",
        flatShading: true,
        roughness: 1,
      }),
      crateCount,
    );
    for (let index = 0; index < crateCount; index += 1) {
      scratchMatrix.makeTranslation(
        length * 0.22 + index * 0.48,
        0.42,
        width * 0.3,
      );
      crates.setMatrixAt(index, scratchMatrix);
    }
    crates.instanceMatrix.needsUpdate = true;
    fineDetail.add(crates);
  }

  const lampPost = new Mesh(
    new CylinderGeometry(0.055, 0.08, 1.52, 6),
    new MeshStandardMaterial({ color: "#615342", metalness: 0.28, roughness: 0.72 }),
  );
  lampPost.position.set(length * 0.55, 1, 0);
  root.add(lampPost);
  const lamp = new Mesh(
    new SphereGeometry(0.23, 8, 6),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    }),
  );
  lamp.position.set(length * 0.55, 1.8, 0);
  root.add(lamp);
  return { dock, fineDetail, root };
}

function dockHealthAccent(healthBand: DockNode["healthBand"]): string {
  if (healthBand === "robust" || healthBand === "healthy") return "#78b689";
  if (healthBand === "mixed") return "#dfb95a";
  if (healthBand === "fragile") return "#d98b54";
  return "#c9675c";
}

function createShip(
  ship: ShipNode,
  displayOffset: { x: number; y: number },
  representative: boolean,
  cache: GardenShipGeometryCache,
): ShipVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "ship-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, ship.tile, GARDEN_SHIP_ROOT_Y);
  const silhouette = SILHOUETTE_FOR_HULL[ship.visual.hull];
  const visualScale = MathUtils.clamp(ship.visual.scale || 1, 0.72, 1.6) * 0.82;
  root.scale.setScalar(visualScale);

  const hullColor = new Color(HARBOR_PALETTE.timber_dark).lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, HARBOR_PALETTE.timber_warm)),
    0.38,
  );
  const accentColor = new Color(HARBOR_PALETTE.timber_warm).lerp(
    new Color(safeCssColor(ship.visual.livery?.accent, GARDEN_COLORS.roof)),
    0.78,
  );
  const keelMaterial = new MeshStandardMaterial({
    color: ship.riskZone === "danger"
      ? "#553833"
      : ship.riskZone === "warning"
        ? "#665143"
        : HARBOR_PALETTE.iron_dark,
    flatShading: true,
    roughness: 0.9,
  });
  const hullMaterial = new MeshStandardMaterial({
    color: hullColor,
    emissive: hullColor,
    emissiveIntensity: 0.035,
    flatShading: true,
    roughness: 0.82,
  });
  const deckMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_warm,
    flatShading: true,
    roughness: 0.92,
  });
  const gunwaleMaterial = new MeshStandardMaterial({
    color: accentColor,
    flatShading: true,
    roughness: 0.86,
  });
  const hullGeometry = cachedShipGeometry(
    cache,
    `hull.${silhouette}`,
    () => createHullGeometry(silhouette),
  );
  const keel = new Mesh(hullGeometry, keelMaterial);
  keel.position.y = -0.16;
  keel.scale.set(1.015, 0.82, 1.015);
  root.add(keel);
  const hull = new Mesh(hullGeometry, hullMaterial);
  hull.position.y = 0.05;
  root.add(hull);
  const gunwale = new Mesh(
    cachedShipGeometry(
      cache,
      `deck.${silhouette}.rim`,
      () => createDeckGeometry(silhouette, 0.91),
    ),
    gunwaleMaterial,
  );
  gunwale.position.y = 0.47;
  root.add(gunwale);
  const deck = new Mesh(
    cachedShipGeometry(
      cache,
      `deck.${silhouette}.inner`,
      () => createDeckGeometry(silhouette, 0.79),
    ),
    deckMaterial,
  );
  deck.position.y = 0.5;
  fineDetail.add(deck);

  const mastMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_dark,
    roughness: 0.92,
  });
  const sailColor = safeCssColor(
    ship.visual.sailColor ?? ship.visual.livery?.sailColor,
    GARDEN_COLORS.limestoneLight,
  );
  const readableSailColor = new Color(sailColor)
    .lerp(new Color(GARDEN_COLORS.limestoneLight), 0.28);
  const plainSailMaterial = new MeshStandardMaterial({
    color: readableSailColor,
    emissive: readableSailColor,
    emissiveIntensity: 0.045,
    roughness: 0.82,
    side: DoubleSide,
  });
  const identitySailMaterial = plainSailMaterial.clone();
  const mastGeometry = cachedShipGeometry(
    cache,
    "mast",
    () => new CylinderGeometry(0.055, 0.08, 1, 6),
  );
  const rig = GARDEN_SHIP_RIGS[silhouette];
  const identitySail = rig
    .flatMap((mastPlan, mastIndex) => mastPlan.sails.map((sailPlan, sailIndex) => ({
      area: sailPlan.width * sailPlan.height,
      mastIndex,
      sailIndex,
    })))
    .toSorted((left, right) => right.area - left.area)[0];
  const hasBowsprit = silhouette === "clipper" || silhouette === "galleon";
  const masts = new InstancedMesh(
    mastGeometry,
    mastMaterial,
    rig.length + (hasBowsprit ? 1 : 0),
  );
  const mastRotation = silhouette === "clipper"
    ? -0.045
    : silhouette === "schooner"
      ? -0.075
      : 0;
  for (const [mastIndex, mastPlan] of rig.entries()) {
    scratchMatrix.makeRotationZ(mastRotation);
    scratchMatrix.scale(scratchPosition.set(1, mastPlan.height, 1));
    scratchMatrix.setPosition(mastPlan.x, 0.55 + mastPlan.height / 2, 0);
    masts.setMatrixAt(mastIndex, scratchMatrix);
    for (const [sailIndex, sailPlan] of mastPlan.sails.entries()) {
      const reverse = sailPlan.reverse ?? false;
      const isIdentitySail = identitySail?.mastIndex === mastIndex
        && identitySail.sailIndex === sailIndex;
      const sail = new Mesh(
        cachedShipGeometry(
          cache,
          [
            "sail",
            silhouette,
            mastIndex,
            sailIndex,
            sailPlan.kind,
            sailPlan.width,
            sailPlan.height,
            reverse ? "reverse" : "forward",
          ].join("."),
          () => createSailGeometry(sailPlan),
        ),
        isIdentitySail ? identitySailMaterial : plainSailMaterial,
      );
      sail.position.set(mastPlan.x + (reverse ? -0.06 : 0.06), sailPlan.centerY, 0.03);
      if (isIdentitySail) sail.scale.set(1.22, 1.22, 1);
      root.add(sail);
    }
  }
  if (hasBowsprit) {
    scratchMatrix.makeRotationZ(Math.PI / 2);
    scratchMatrix.scale(scratchPosition.set(
      1,
      silhouette === "clipper" ? 2.2 : 1.45,
      1,
    ));
    scratchMatrix.setPosition(silhouette === "clipper" ? 4.75 : 4.15, 0.95, 0);
    masts.setMatrixAt(rig.length, scratchMatrix);
  }
  masts.instanceMatrix.needsUpdate = true;
  root.add(masts);

  const cabinDimensions = GARDEN_SHIP_CABINS[silhouette];
  if (cabinDimensions) {
    const cabin = new Mesh(
      cachedShipGeometry(
        cache,
        `cabin.${silhouette}`,
        () => new BoxGeometry(
          cabinDimensions.width,
          cabinDimensions.height,
          cabinDimensions.z,
        ),
      ),
      new MeshStandardMaterial({
        color: accentColor,
        flatShading: true,
        roughness: 0.9,
      }),
    );
    cabin.position.set(cabinDimensions.x, 0.52 + cabinDimensions.height / 2, 0);
    root.add(cabin);
    const cabinRoof = new Mesh(
      cachedShipGeometry(
        cache,
        `cabin.${silhouette}.roof`,
        () => new BoxGeometry(cabinDimensions.width * 1.12, 0.12, cabinDimensions.z * 1.16),
      ),
      mastMaterial,
    );
    cabinRoof.position.set(
      cabinDimensions.x,
      0.58 + cabinDimensions.height,
      0,
    );
    fineDetail.add(cabinRoof);
  }

  const tallestMast = rig.reduce((tallest, entry) => (
    entry.height > tallest.height ? entry : tallest
  ));
  const rigging = new LineSegments(
    cachedShipGeometry(
      cache,
      `rigging.${silhouette}`,
      () => new BufferGeometry().setFromPoints([
        new Vector3(tallestMast.x, tallestMast.height + 0.34, 0),
        new Vector3(4.15, 0.7, 0),
        new Vector3(tallestMast.x, tallestMast.height + 0.34, 0),
        new Vector3(-3.05, 0.72, 0),
        new Vector3(tallestMast.x, tallestMast.height * 0.68, 0.03),
        new Vector3(2.5, 0.62, 0.03),
      ]),
    ),
    new LineBasicMaterial({
      color: "#3f342b",
      opacity: 0.62,
      transparent: true,
    }),
  );
  fineDetail.add(rigging);
  const flag = new Mesh(
    cachedShipGeometry(cache, "pennant", createPennantGeometry),
    new MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.08,
      roughness: 0.82,
      side: DoubleSide,
    }),
  );
  flag.position.set(tallestMast.x, tallestMast.height + 0.52, 0.02);
  fineDetail.add(flag);

  if (ship.visual.overlay !== "none") {
    const overlayColor = ship.visual.overlay === "nav"
      ? HARBOR_PALETTE.lantern_cold
      : ship.visual.overlay === "yield"
        ? HARBOR_PALETTE.aurora_green
        : "#c9675c";
    const signalShape = new Shape();
    signalShape.moveTo(0, 0);
    signalShape.lineTo(0.56, 0);
    signalShape.lineTo(0.56, -0.56);
    signalShape.lineTo(0, -0.56);
    signalShape.closePath();
    const signal = new Mesh(
      cachedShipGeometry(cache, "signal-square", () => new ShapeGeometry(signalShape)),
      new MeshStandardMaterial({
        color: overlayColor,
        emissive: overlayColor,
        emissiveIntensity: 0.1,
        side: DoubleSide,
      }),
    );
    signal.name = `ship-signal-${ship.visual.overlay}`;
    signal.position.set(tallestMast.x + 0.12, tallestMast.height + 0.18, 0.055);
    root.add(signal);
    if (ship.visual.overlay === "watch") {
      const watchQuarter = new Mesh(
        cachedShipGeometry(cache, "signal-watch-quarter", () => new ShapeGeometry(signalShape)),
        new MeshBasicMaterial({
          color: GARDEN_COLORS.limestoneLight,
          side: DoubleSide,
        }),
      );
      watchQuarter.scale.setScalar(0.48);
      watchQuarter.position.set(
        tallestMast.x + 0.12,
        tallestMast.height + 0.18,
        0.06,
      );
      root.add(watchQuarter);
    }
  }

  if (
    (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique")
    && ship.reportCard?.overallGrade
    && ship.reportCard.overallGrade !== "NR"
  ) {
    const shieldShape = new Shape();
    shieldShape.moveTo(0, 0.42);
    shieldShape.lineTo(0.34, 0.18);
    shieldShape.lineTo(0.25, -0.3);
    shieldShape.lineTo(0, -0.5);
    shieldShape.lineTo(-0.25, -0.3);
    shieldShape.lineTo(-0.34, 0.18);
    shieldShape.closePath();
    const shield = new Mesh(
      new ShapeGeometry(shieldShape),
      new MeshStandardMaterial({
        color: "#66717a",
        metalness: 0.56,
        roughness: 0.46,
        side: DoubleSide,
      }),
    );
    shield.name = "ship-bluechip-shield";
    shield.position.set(1.35, 1.05, 0.82);
    shield.rotation.x = -0.18;
    root.add(shield);
    const shieldMark = new Mesh(
      new ShapeGeometry(shieldShape),
      new MeshBasicMaterial({
        color: HARBOR_PALETTE.lantern_glow,
        side: DoubleSide,
      }),
    );
    shieldMark.scale.setScalar(0.42);
    shieldMark.position.set(1.35, 1.05, 0.835);
    shieldMark.rotation.x = -0.18;
    root.add(shieldMark);
  }

  const wake = createWake(cache);
  root.add(wake.root);
  return {
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    identitySailMaterial,
    representative,
    root,
    sampleState: "idle",
    selectionRadius: gardenShipSelectionRadius(ship),
    ship,
    wake: wake.root,
    wakeDetail: wake.detail,
  };
}

function syncShipSailTextures(
  content: GardenContent,
  frame: ThreeWorldRendererFrame,
): void {
  const generation = frame.assets.getRenderAssetGenerationKey();
  if (content.assetGeneration === generation) return;
  content.assetGeneration = generation;

  for (const visual of content.ships) {
    const material = visual.identitySailMaterial;
    const previousTexture = material.map;
    material.map = createGardenSailTexture(
      visual.ship,
      frame.assets.getLogo(visual.ship.logoSrc),
    );
    material.color.set(material.map ? "#f7f2e4" : visual.ship.visual.sailColor);
    material.emissive.set("#fff7e3");
    material.emissiveMap = material.map;
    material.needsUpdate = true;
    if (previousTexture && previousTexture !== material.map) previousTexture.dispose();
  }
}

function createHullGeometry(silhouette: GardenHullSilhouette): ExtrudeGeometry {
  const shape = createHullShape(silhouette, 1);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.13,
    bevelThickness: 0.12,
    depth: 0.72,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.5, 0);
  return geometry;
}

function createDeckGeometry(
  silhouette: GardenHullSilhouette,
  scale: number,
): ShapeGeometry {
  const geometry = new ShapeGeometry(createHullShape(silhouette, scale));
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createHullShape(silhouette: GardenHullSilhouette, scale: number): Shape {
  const points: Record<GardenHullSilhouette, ReadonlyArray<readonly [number, number]>> = {
    galleon: [[-3.35, -1.35], [-3.65, 1.35], [1.95, 1.3], [4.05, 0], [1.95, -1.3]],
    clipper: [[-3.55, -0.72], [-3.45, 0.72], [2.65, 0.76], [4.85, 0], [2.65, -0.76]],
    schooner: [[-3.75, -0.82], [-3.6, 0.82], [2.75, 0.8], [4.35, 0], [2.75, -0.8]],
    junk: [[-3.2, -1.18], [-3.25, 1.18], [2.75, 1.12], [3.65, 0], [2.75, -1.12]],
  };
  const shape = new Shape();
  const [first, ...rest] = points[silhouette];
  shape.moveTo(first![0] * scale, first![1] * scale);
  for (const [x, y] of rest) shape.lineTo(x * scale, y * scale);
  shape.closePath();
  return shape;
}

function createSailGeometry(plan: GardenSailPlan): ShapeGeometry {
  const direction = plan.reverse ? -1 : 1;
  const halfHeight = plan.height * 0.5;
  const shape = new Shape();
  shape.moveTo(0, -halfHeight);
  shape.lineTo(0, halfHeight);
  if (plan.kind === "fore-aft") {
    shape.lineTo(direction * plan.width, -halfHeight * 0.78);
  } else if (plan.kind === "square") {
    shape.lineTo(direction * plan.width * 0.88, halfHeight * 0.7);
    shape.lineTo(direction * plan.width, -halfHeight * 0.72);
  } else {
    shape.lineTo(direction * plan.width * 0.72, halfHeight * 0.68);
    shape.lineTo(direction * plan.width, 0);
    shape.lineTo(direction * plan.width * 0.86, -halfHeight * 0.75);
  }
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = Math.abs(positions.getX(index)) / Math.max(0.01, plan.width);
    const y = positions.getY(index) / Math.max(0.01, plan.height) + 0.5;
    positions.setZ(index, Math.sin(MathUtils.clamp(y, 0, 1) * Math.PI) * x * 0.15);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const uvs = geometry.getAttribute("uv");
  if (bounds && uvs) {
    const width = Math.max(0.01, bounds.max.x - bounds.min.x);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    for (let index = 0; index < positions.count; index += 1) {
      uvs.setXY(
        index,
        (positions.getX(index) - bounds.min.x) / width,
        (positions.getY(index) - bounds.min.y) / height,
      );
    }
    uvs.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPennantGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.68, -0.16);
  shape.lineTo(0, -0.34);
  shape.closePath();
  return new ShapeGeometry(shape);
}

function cachedShipGeometry<T extends ThreeBufferGeometry>(
  cache: GardenShipGeometryCache,
  key: string,
  create: () => T,
): T {
  const cached = cache.geometries.get(key);
  if (cached) return cached as T;
  const geometry = create();
  cache.geometries.set(key, geometry);
  return geometry;
}

function createWake(cache: GardenShipGeometryCache): { detail: Group; root: Group } {
  const root = new Group();
  const detail = new Group();
  root.name = "ship-wake";
  detail.name = "ship-wake-detail";
  root.add(detail);
  const shape = new Shape();
  shape.moveTo(-2.25, 0);
  shape.lineTo(-5.8, -1.24);
  shape.lineTo(-5.12, 0);
  shape.lineTo(-5.8, 1.24);
  shape.closePath();
  const fillGeometry = cachedShipGeometry(cache, "wake.fill", () => {
    const geometry = new ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -0.34, 0);
    return geometry;
  });
  root.add(new Mesh(fillGeometry, cache.wakeFillMaterial));
  for (const z of [-0.5, 0.5]) {
    const geometry = cachedShipGeometry(
      cache,
      `wake.${z}`,
      () => new BufferGeometry().setFromPoints([
        new Vector3(-2.25, -0.33, z * 0.36),
        new Vector3(-3.8, -0.34, z * 1.35),
        new Vector3(-5.8, -0.35, z * 2.48),
      ]),
    );
    detail.add(new Line(geometry, cache.wakeMaterial));
  }
  root.visible = false;
  return { detail, root };
}

function createShipShadows(count: number): InstancedMesh<CircleGeometry, MeshBasicMaterial> {
  const geometry = new CircleGeometry(1, 20);
  geometry.rotateX(-Math.PI / 2);
  const shadows = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({
      color: "#022c34",
      depthWrite: false,
      opacity: 0.2,
      transparent: true,
    }),
    count,
  );
  shadows.renderOrder = 1;
  return shadows;
}

function updateSceneForFrame(
  scene: GardenScene,
  camera: OrthographicCamera,
  frame: ThreeWorldRendererFrame,
): void {
  updateCamera(camera, frame);
  updateDayCycle(scene, frame);
  scene.water.update(frame);
  const content = scene.content;
  if (!content) return;

  const constrained = frame.renderScheduler.tier === "constrained";
  const fullQuality = frame.renderScheduler.tier === "full"
    || frame.renderScheduler.tier === "balanced";
  content.decoration.visible = true;
  scene.waterAccents.visible = true;
  scene.waterAccents.rotation.y = 0;
  for (const effect of content.weather) {
    effect.root.visible = fullQuality;
    effect.streaks.position.y = frame.reducedMotion
      ? 0
      : -((frame.timeSeconds * 0.72 + effect.phase * 2) % 2);
  }
  content.gullFlock.update({
    constrained,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });

  const pulse = frame.reducedMotion ? 1 : 1 + Math.sin(frame.timeSeconds * 1.15) * 0.045;
  content.beacon.scale.setScalar(pulse);
  content.beam.rotation.y = frame.reducedMotion ? -0.55 : frame.timeSeconds * 0.2;
  content.beacon.getWorldPosition(scratchPosition);
  scene.water.setBeaconState(
    scratchPosition.x,
    scratchPosition.z,
    content.beam.rotation.y,
    MathUtils.clamp(0.09 + (content.lighthouseLight.intensity - 0.45) / 7.6, 0, 1),
  );

  const semanticView = gardenSemanticView(frame.camera.zoom, frame.selectedDetailId);
  const showWorldDetail = semanticView === "explore";
  for (const visual of content.docks) {
    visual.fineDetail.visible = showWorldDetail
      || visual.dock.detailId === frame.hoveredDetailId
      || visual.dock.detailId === frame.selectedDetailId;
  }

  let visibleShipCount = 0;
  for (const [index, visual] of content.ships.entries()) {
    const sample = frame.shipMotionSamples.get(visual.ship.id);
    const tile = resolveGardenShipDisplayTile({
      displayOffset: visual.displayOffset,
      representative: visual.representative,
      sample,
      ship: visual.ship,
    });
    visual.root.visible = true;
    visibleShipCount += 1;
    setTilePosition(visual.root, tile, GARDEN_SHIP_ROOT_Y);

    const heading = normalizedHeading(sample?.heading);
    if (heading) visual.root.rotation.y = -Math.atan2(heading.y, heading.x);
    const bobAmplitude = frame.reducedMotion ? 0 : 0.035 + frame.seaState.swell * 0.055;
    visual.root.position.y += Math.sin(frame.timeSeconds * (0.72 + frame.seaState.tempo * 0.25) + visual.bobPhase)
      * bobAmplitude;
    visual.sampleState = sample?.state ?? "idle";
    const wakeIntensity = sample?.wakeIntensity ?? 0;
    visual.wake.visible = !frame.reducedMotion && !constrained && wakeIntensity > 0.08;
    visual.wake.scale.x = 0.7 + Math.min(1.5, wakeIntensity) * 0.85;
    const showShipDetail = showWorldDetail
      || visual.ship.detailId === frame.hoveredDetailId
      || visual.ship.detailId === frame.selectedDetailId;
    visual.fineDetail.visible = showShipDetail;
    visual.wakeDetail.visible = showShipDetail;

    const shadowRadius = Math.max(1.15, visual.selectionRadius * 1.25);
    scratchMatrix.makeScale(shadowRadius * 1.65, 1, shadowRadius * 0.72);
    scratchMatrix.setPosition(
      visual.root.position.x + 1.2,
      WATER_LEVEL + 0.028,
      visual.root.position.z + 1.45,
    );
    content.shipShadows.setMatrixAt(index, scratchMatrix);
  }
  content.shipShadows.instanceMatrix.needsUpdate = true;
  content.visibleShipCount = visibleShipCount;

  for (const zone of content.zones) {
    const definition = zone.area.riskPlacement
      ? riskWaterAreaForPlacement(zone.area.riskPlacement)
      : zone.area.band
        ? riskWaterAreaForPlacement(DEWS_AREA_PLACEMENTS[zone.area.band])
        : riskWaterAreaForPlacement("safe-harbor");
    const theme = zoneThemeForTerrain(definition.terrain);
    const rhythm = frame.timeSeconds * (0.13 + theme.motion.amplitudeScale * 0.025)
      + stableUnit(zone.area.id) * Math.PI * 2;
    const fieldPulse = frame.reducedMotion
      ? 1
      : 1 + Math.sin(rhythm * 0.62) * 0.014 * theme.motion.amplitudeScale;
    zone.field.scale.setScalar(fieldPulse);
    zone.rings.forEach((ring, index) => {
      const phase = frame.reducedMotion ? 1 : 1 + Math.sin(rhythm - index * 0.7) * (0.025 + index * 0.008);
      ring.scale.setScalar(phase);
      ring.visible = true;
    });
  }

  updateSelectedRoute(content, frame);
  updateCueMarker(scene.hoverMarker, content, frame.hoveredDetailId, frame, 0.94);
  updateCueMarker(scene.selectedMarker, content, frame.selectedDetailId, frame, 1.08);
}

function updateCamera(camera: OrthographicCamera, frame: ThreeWorldRendererFrame): void {
  const viewportCenter = { x: frame.width / 2, y: frame.height / 2 };
  const centerTile = screenToTile(viewportCenter, frame.camera);
  const viewHeight = gardenCameraViewHeight(frame.height, frame.camera.zoom);
  const viewWidth = viewHeight * (frame.width / Math.max(1, frame.height));
  const targetX = centerTile.x * TILE_SCALE;
  const targetZ = centerTile.y * TILE_SCALE;

  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.position.set(
    targetX + CAMERA_DISTANCE,
    CAMERA_DISTANCE * Math.sqrt(2 / 3),
    targetZ + CAMERA_DISTANCE,
  );
  camera.lookAt(targetX, 0, targetZ);
  camera.updateProjectionMatrix();
}

function updateDayCycle(scene: GardenScene, frame: ThreeWorldRendererFrame): void {
  const hour = ((frame.wallClockHour % 24) + 24) % 24;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const dusk = Math.max(
    Math.max(0, 1 - Math.abs(hour - 6) / 2),
    Math.max(0, 1 - Math.abs(hour - 18) / 2),
  );
  const night = MathUtils.clamp(1 - daylight - dusk * 0.38, 0, 1);

  const sky = scratchColor.copy(NIGHT_SKY).lerp(DUSK_SKY, dusk).lerp(DAY_SKY, daylight);
  scene.root.background = sky.clone();
  if (scene.root.fog instanceof Fog) scene.root.fog.color.copy(sky);

  scene.hemisphereLight.intensity = 0.82 + daylight * 0.58 + dusk * 0.18;
  scene.ambientLight.intensity = 0.34 + daylight * 0.26 + dusk * 0.12;
  scene.directionalLight.intensity = 0.92 + daylight * 1.58 + dusk * 0.52;
  scene.directionalLight.color.set(daylight > 0.2 ? "#ffe8b5" : dusk > 0.25 ? "#e6baa0" : "#abc4cf");

  if (!scene.content) return;
  const beaconIntensity = 4.2 + night * 5.8 + frame.seaState.source.psiStress * 0.5;
  scene.content.beacon.material.emissiveIntensity = beaconIntensity;
  scene.content.beaconHalo.material.opacity = 0.22 + dusk * 0.1 + night * 0.2;
  scene.content.beaconHalo.scale.setScalar(1.08 + dusk * 0.16 + night * 0.34);
  scene.content.lighthouseLight.intensity = 0.95 + dusk * 2.3 + night * 8.2;
  scene.content.harborLanternMaterial.emissiveIntensity = 0.18
    + dusk * 1.35
    + night * 3.4;
  scene.content.beam.visible = true;
  scene.content.shipShadows.material.opacity = 0.12 + daylight * 0.1;
  for (const ship of scene.content.ships) {
    ship.identitySailMaterial.emissiveIntensity = 0.18
      + dusk * 0.1
      + night * 0.3;
  }
  for (const child of scene.content.beam.children) {
    if (!(child instanceof Mesh)) continue;
    if (child.material instanceof ShaderMaterial) {
      const opacity = child.material.uniforms.uOpacity;
      if (opacity) opacity.value = 0.012 + dusk * 0.034 + night * 0.084;
      continue;
    }
    if (!(child.material instanceof MeshBasicMaterial)) continue;
    child.material.opacity = child.name === "lighthouse-beam-inner"
      ? 0.002 + dusk * 0.013 + night * 0.067
      : 0.001 + dusk * 0.007 + night * 0.036;
  }
}

function updateSelectedRoute(content: GardenContent, frame: ThreeWorldRendererFrame): void {
  const selectedShip = frame.selectedDetailId
    ? content.ships.find((entry) => entry.ship.detailId === frame.selectedDetailId)
    : undefined;
  const sample = selectedShip ? frame.shipMotionSamples.get(selectedShip.ship.id) : undefined;
  const routePathKey = sample?.routePathKey;
  const route = selectedShip ? frame.motionPlan.shipRoutes.get(selectedShip.ship.id) : undefined;
  const path = routePathKey ? route?.waterPaths.get(routePathKey) : undefined;
  const nextKey = selectedShip && path
    ? `${selectedShip.ship.id}|${routePathKey}|${path.points.length}|${selectedShip.displayOffset.x},${selectedShip.displayOffset.y}`
    : null;
  if (nextKey !== content.routeLineKey) {
    content.routeLine.geometry.dispose();
    content.routeLine.geometry = path
      ? new BufferGeometry().setFromPoints(path.points.map((point) => {
        const displayTile = resolveGardenShipDisplayTile({
          displayOffset: selectedShip!.displayOffset,
          representative: selectedShip!.representative,
          sample: { tile: point },
          ship: selectedShip!.ship,
        });
        return new Vector3(
          displayTile.x * TILE_SCALE,
          WATER_LEVEL + 0.12,
          displayTile.y * TILE_SCALE,
        );
      }))
      : new BufferGeometry();
    content.routeLineKey = nextKey;
  }
  content.routeLine.visible = Boolean(path);
}

function updateCueMarker(
  marker: Mesh<RingGeometry, MeshBasicMaterial>,
  content: GardenContent,
  detailId: string | null,
  frame: ThreeWorldRendererFrame,
  pulseScale: number,
): void {
  const cue = detailId ? content.entityCues.get(detailId) : undefined;
  if (!cue) {
    marker.visible = false;
    return;
  }
  cue.root.getWorldPosition(scratchPosition);
  marker.position.set(scratchPosition.x, scratchPosition.y + cue.y, scratchPosition.z);
  const pulse = frame.reducedMotion
    ? 1
    : 1 + Math.sin(frame.timeSeconds * 2.1) * 0.06;
  marker.scale.setScalar(cue.radius * pulse * pulseScale);
  marker.visible = true;
}

function setTilePosition(
  object: Object3D,
  tile: { x: number; y: number },
  height: number,
): void {
  object.position.set(tile.x * TILE_SCALE, height, tile.y * TILE_SCALE);
}

function normalizedHeading(
  heading: { x: number; y: number } | null | undefined,
): { x: number; y: number } | null {
  if (!heading) return null;
  const length = Math.hypot(heading.x, heading.y);
  if (length < 0.0001) return null;
  return { x: heading.x / length, y: heading.y / length };
}

function safeCssColor(value: string | null | undefined, fallback: string): string {
  return value && (/^#[\da-f]{3,8}$/i.test(value) || /^rgb/i.test(value)) ? value : fallback;
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function countDrawableObjects(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if ((object as Mesh).isMesh || (object as Line).isLine) count += 1;
  });
  return count;
}

export function disposeThreeObjectTree(root: Object3D): void {
  const geometries = new Set<ThreeBufferGeometry>();
  const instancedMeshes = new Set<InstancedMesh>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (object instanceof InstancedMesh) instancedMeshes.add(object);
    const candidate = object as Object3D & {
      geometry?: ThreeBufferGeometry;
      material?: Material | Material[];
    };
    if (candidate.geometry) geometries.add(candidate.geometry);
    const objectMaterials = Array.isArray(candidate.material)
      ? candidate.material
      : candidate.material
        ? [candidate.material]
        : [];
    for (const material of objectMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  for (const instancedMesh of instancedMeshes) instancedMesh.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

import {
  AgXToneMapping,
  AmbientLight,
  BufferGeometry,
  CircleGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PointLight,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type {
  CreateThreeWorldRendererInput,
  ThreeWorldRenderer,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import {
  GARDEN_SHIP_ROOT_Y,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenCameraViewHeight,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
  gardenSemanticView,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { screenToTile } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  createGardenCemetery,
  createGardenPigeonnier,
} from "./garden-landmarks";
import {
  createGardenFireflies,
  createGardenGullFlock,
  createGardenHarborDistricts,
  type GardenFireflies,
  type GardenGullFlock,
} from "./garden-harbor-life";
import { createGardenModelLibrary } from "./garden-models";
import { createGardenWater, type GardenWater } from "./garden-water";
import { dayCyclePhase, updateDayCycle, type DayCyclePhase } from "./garden-day-cycle";
import { createGardenSky, type GardenSky } from "./garden-sky";
import { createGardenPost } from "./garden-post";
import {
  createDock,
  createHarborLanterns,
  gardenDockLampWorldPositions,
  type DockVisual,
} from "./garden-docks";
import {
  createGardenLaneRegistry,
  type GardenLaneRegistry,
} from "./garden-lanterns";
import { CEMETERY_CENTER } from "../systems/world-layout";
import {
  createTerracedIsland,
  createWaterAccents,
  gardenIslandLanternWorldOffsets,
} from "./garden-island";
import { attachGardenLighthouseModel } from "./garden-lighthouse";
import {
  attachGardenHeroModel,
  createFleetLanterns,
  createShip,
  createShipShadows,
  syncShipSailTextures,
  updateFleetLanterns,
  type FleetLanterns,
  type ShipVisual,
} from "./garden-ships";
import {
  countDrawableObjects,
  disposeThreeObjectTree,
  normalizedHeading,
  setTilePosition,
  stableUnit,
  TILE_SCALE,
  type GardenShipGeometryCache,
} from "./garden-util";
import {
  createDangerWeather,
  createZone,
  createZoneField,
  updateDangerWeather,
  updateZoneBuoys,
  type GardenWeatherVisual,
  type ZoneField,
  type ZoneVisual,
} from "./garden-zones";

export { disposeThreeObjectTree } from "./garden-util";

const MAX_THREE_DPR = 2;
const CAMERA_DISTANCE = 110;

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
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1.12;
  // D3: soft island-only shadows. Shadow support is compiled once (enabled +
  // castShadow stay on); per-tier cost is driven at runtime via shadow.intensity
  // and mapSize (see updateShadows), which avoids material recompile stalls.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const post = createGardenPost(renderer, scene.root, camera);

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
      attachGardenLighthouseModel(model, scene.content);
      // The GLB shell replaces the procedural one — refresh the shadow map.
      scene.shadowNeedsRender = true;
      onAssetReady?.();
    })
    .catch(() => {
      // The procedural shell is the intentional asset failure fallback.
    });

  // Titan/unique ships get bespoke hero GLB hulls once loaded. Each attach is
  // per-content: a clone that resolves after the world has moved on is dropped
  // (it still shares the cached geometry, so it must not be disposed).
  const loadHeroesForContent = (content: GardenContent | null): void => {
    if (!content) return;
    for (const visual of content.ships) {
      if (visual.heroModelId === null) continue;
      void modelLibrary.clone(visual.heroModelId)
        .then((model) => {
          if (disposed || scene.content !== content) return;
          attachGardenHeroModel(visual, model);
          scene.shadowNeedsRender = true;
          onAssetReady?.();
        })
        .catch(() => {
          // The procedural hull stays visible — the asset-failure fallback.
        });
    }
  };

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextcreationerror", handleContextCreationError);
      const detachedModel = scene.lighthouseModel?.parent ? null : scene.lighthouseModel;
      post.dispose();
      scene.laneRegistry.dispose();
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
        post.setSize(frame.width, frame.height, dpr);
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
        loadHeroesForContent(scene.content);
      }
      if (scene.content) syncShipSailTextures(scene.content, frame);
      const phase = dayCyclePhase(frame.wallClockHour);
      updateSceneForFrame(scene, camera, frame, phase);

      const tier = frame.renderScheduler.tier;
      const shadowMapSize = updateShadows(scene, frame);
      const composerActive = tier !== "constrained";
      post.setEnabled(composerActive);
      post.setBloomEnabled(composerActive && tier !== "recovery");
      post.setGrade(phase.daylight, phase.dusk, phase.night);
      post.render();

      const content = scene.content;
      const renderInfo = renderer.info.render;
      return {
        activeLaneCount: scene.laneRegistry.activeLaneCount,
        composerEnabled: composerActive,
        objectCount: content?.objectCount ?? 0,
        postPassList: post.getPassList(),
        shadowMapSize,
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
        schedulerTier: frame.renderScheduler.tier,
        visibleShipCount: content?.visibleShipCount ?? 0,
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
  laneRegistry: GardenLaneRegistry;
  lighthouseModel: Group | null;
  root: Scene;
  selectedMarker: Mesh<RingGeometry, MeshBasicMaterial>;
  shadowActiveSize: number;
  shadowNeedsRender: boolean;
  sky: GardenSky;
  water: GardenWater;
  waterAccents: Group;
  world: PharosVilleWorld | null;
}

interface GardenContent {
  logoGenerationKey: string | null;
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  docks: DockVisual[];
  objectCount: number;
  entityCues: Map<string, EntityCue>;
  fleetLanterns: FleetLanterns;
  harborLanternMaterial: MeshStandardMaterial;
  fireflies: GardenFireflies;
  gullFlock: GardenGullFlock;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  root: Group;
  routeLine: Line<BufferGeometry, LineBasicMaterial>;
  routeLineKey: string | null;
  shipLanternGlowMaterial: MeshBasicMaterial;
  shipLanternMaterial: MeshStandardMaterial;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  ships: ShipVisual[];
  transientSelectedDetailId: string | null;
  visibleShipCount: number;
  weather: GardenWeatherVisual[];
  zoneField: ZoneField;
  zones: ZoneVisual[];
}

interface EntityCue {
  radius: number;
  root: Object3D;
  y: number;
}

function createGardenScene(): GardenScene {
  const root = new Scene();
  const sky = createGardenSky();
  root.fog = sky.fog;

  const hemisphereLight = new HemisphereLight("#d7ece6", "#31483f", 1.15);
  root.add(hemisphereLight);
  const ambientLight = new AmbientLight("#fff0d1", 0.42);
  root.add(ambientLight);
  const directionalLight = new DirectionalLight("#ffe8b5", 2.3);
  directionalLight.position.set(-35, 55, -30);
  // Tight ortho frustum fitted to the island (~44-unit box); updateShadows
  // re-centres it on the island each frame and toggles cost per tier.
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.bias = -0.0005;
  directionalLight.shadow.normalBias = 0.8;
  const shadowCamera = directionalLight.shadow.camera;
  shadowCamera.left = -22;
  shadowCamera.right = 22;
  shadowCamera.top = 22;
  shadowCamera.bottom = -22;
  shadowCamera.near = 1;
  shadowCamera.far = 140;
  shadowCamera.updateProjectionMatrix();
  root.add(directionalLight);

  // A single oversized surface plus same-color fog/background keeps the sea
  // full-bleed under pan and zoom without visible plane or sky seams.
  const water = createGardenWater(WATER_LEVEL);
  root.add(water.mesh);

  // Shared warm-light lane registry: the water shader samples its packed
  // DataTexture to lay reflection pools for the beacon, harbor lanterns, and
  // dock lamps. The registry owns the per-tier lane cap.
  const laneRegistry = createGardenLaneRegistry();

  const waterAccents = createWaterAccents();
  root.add(waterAccents);

  const hoverMarker = createCueMarker("#d8eee7", 0.4);
  const selectedMarker = createCueMarker(HARBOR_PALETTE.lantern_glow, 0.78);
  root.add(hoverMarker, selectedMarker);
  // The shadow target rides after the markers so water/accents keep the child
  // indices the renderer tests assert; content is still appended last.
  root.add(directionalLight.target);

  // Sky dome/stars/moon are added last so lights and water keep the child
  // indices the renderer tests assert against; world content is appended after.
  root.add(sky.root);

  return {
    ambientLight,
    content: null,
    directionalLight,
    hemisphereLight,
    hoverMarker,
    laneRegistry,
    lighthouseModel: null,
    root,
    selectedMarker,
    shadowActiveSize: 0,
    shadowNeedsRender: true,
    sky,
    water,
    waterAccents,
    world: null,
  };
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
  attachGardenLighthouseModel(scene.lighthouseModel, scene.content);
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
  scene.water.setIsletCenters(
    { x: CEMETERY_CENTER.x * TILE_SCALE, z: CEMETERY_CENTER.y * TILE_SCALE },
    { x: world.pigeonnier.tile.x * TILE_SCALE, z: world.pigeonnier.tile.y * TILE_SCALE },
  );
  scene.water.setZoneState(scene.content.zones.map((zone) => zone.tint));
  registerLightLanes(
    scene.laneRegistry,
    world,
    islandTile,
    scene.content.docks,
    scene.content.zones,
  );
  scene.world = world;
  // New island geometry — re-render the static shadow map on the next frame.
  scene.shadowNeedsRender = true;
}

/**
 * Registers every warm light that should lay a reflection pool on the sea. The
 * beacon keeps its own sweeping lane (water uBeacon* uniforms); these are the
 * omnidirectional pools. Lane world positions mirror the geometry each module
 * builds. The registry caps them per tier; callers register all of them.
 */
function registerLightLanes(
  registry: GardenLaneRegistry,
  world: PharosVilleWorld,
  islandTile: { x: number; y: number },
  docks: readonly DockVisual[],
  zones: readonly ZoneVisual[],
): void {
  registry.clear();
  registry.set({
    color: HARBOR_PALETTE.lantern_glow,
    id: "beacon",
    intensity: 1,
    kind: "beacon",
    worldX: islandTile.x * TILE_SCALE,
    worldZ: islandTile.y * TILE_SCALE,
  });
  // Ring of harbor lanterns around the island (mirrors createHarborLanterns).
  const islandX = islandTile.x * TILE_SCALE;
  const islandZ = islandTile.y * TILE_SCALE;
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2
      + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const radiusX = 22 + (index % 3) * 1.25;
    const radiusZ = 15.5 + (index % 2) * 1.15;
    registry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `harbor-lantern.${index}`,
      intensity: 0.62,
      kind: "lantern",
      worldX: islandX + Math.cos(angle) * radiusX,
      worldZ: islandZ + Math.sin(angle) * radiusZ,
    });
  }
  for (const dock of docks) {
    for (const [lampIndex, lamp] of gardenDockLampWorldPositions(dock).entries()) {
      registry.set({
        color: HARBOR_PALETTE.lantern_glow,
        id: `dock-lamp.${dock.dock.detailId}.${lampIndex}`,
        intensity: lampIndex === 0 ? 0.7 : 0.42,
        kind: "lantern",
        worldX: lamp.x,
        worldZ: lamp.z,
      });
    }
  }
  for (const [index, offset] of gardenIslandLanternWorldOffsets().entries()) {
    registry.set({
      color: HARBOR_PALETTE.lantern_warm,
      id: `island-path-lantern.${index}`,
      intensity: 0.34,
      kind: "lantern",
      worldX: islandX + offset.x,
      worldZ: islandZ + offset.z,
    });
  }
  registry.set({
    color: HARBOR_PALETTE.lantern_warm,
    id: "cemetery-lantern",
    intensity: 0.4,
    kind: "lantern",
    worldX: CEMETERY_CENTER.x * TILE_SCALE,
    worldZ: CEMETERY_CENTER.y * TILE_SCALE,
  });
  registry.set({
    color: HARBOR_PALETTE.lantern_glow,
    id: "pigeonnier-lamp",
    intensity: 0.42,
    kind: "lantern",
    worldX: world.pigeonnier.tile.x * TILE_SCALE,
    worldZ: world.pigeonnier.tile.y * TILE_SCALE,
  });
  // Marker buoys lay a band-coloured reflection on the sea (danger a touch
  // brighter). Their kind lets the registry cap them alongside lanterns.
  for (const zone of zones) {
    for (const [index, buoy] of zone.buoys.entries()) {
      registry.set({
        color: `#${buoy.color.getHexString()}`,
        id: `zone-buoy.${zone.area.id}.${index}`,
        intensity: buoy.danger ? 0.6 : 0.48,
        kind: "buoy",
        worldX: buoy.worldX,
        worldZ: buoy.worldZ,
      });
    }
  }
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
  // Only the island stone/timber (and lighthouse, inside island.root) cast and
  // receive shadows. The flat MeshBasicMaterial shoal is excluded so its
  // transparent disc never stamps a hard shadow; ships/docks/zones get no flags.
  island.root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return;
    const material = object.material;
    object.castShadow = Array.isArray(material)
      ? material.some((entry) => entry instanceof MeshStandardMaterial)
      : material instanceof MeshStandardMaterial;
    object.receiveShadow = true;
  });
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
  const zoneField = createZoneField(zones);
  root.add(zoneField.root);
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
  const fireflies = createGardenFireflies(
    gardenIslandLanternWorldOffsets(),
    islandTile,
  );
  root.add(harborLanterns.root, gullFlock.root, fireflies.root);

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
  // Fleet-wide lantern instances (two shared draw calls); positions are driven
  // per frame from each ship's world transform in the ship loop.
  const fleetLanterns = createFleetLanterns(ships, shipGeometryCache);
  root.add(fleetLanterns.root);

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

  const objectCount = countDrawableObjects(root);
  return {
    logoGenerationKey: null,
    beacon: island.beacon,
    beaconHalo: island.beaconHalo,
    beam: island.beam,
    decoration: island.decoration,
    docks,
    objectCount,
    entityCues,
    fireflies,
    fleetLanterns,
    gullFlock,
    harborLanternMaterial: harborLanterns.lightMaterial,
    lighthouseLight: island.lighthouseLight,
    lighthouseRoot: island.lighthouseRoot,
    lighthouseShell: island.lighthouseShell,
    root,
    routeLine,
    routeLineKey: null,
    shipLanternGlowMaterial: fleetLanterns.glowMaterial,
    shipLanternMaterial: fleetLanterns.coreMaterial,
    shipShadows,
    ships,
    transientSelectedDetailId: slice.transientSelectedDetailId,
    visibleShipCount: ships.length,
    weather,
    zoneField,
    zones,
  };
}

/**
 * Re-centres the directional light's tight shadow frustum on the island and
 * sets the per-tier cost, returning the active shadow-map size (0 when off).
 * Shadow support stays compiled (enabled + castShadow never change); cost is
 * toggled via `shadow.intensity`/`autoUpdate` and the map is only reallocated
 * on a tier change, so no material recompile stalls occur.
 */
function updateShadows(scene: GardenScene, frame: ThreeWorldRendererFrame): number {
  const light = scene.directionalLight;
  const islandTile = gardenIslandDisplayTile(frame.world.lighthouse.tile);
  const centerX = islandTile.x * TILE_SCALE;
  const centerZ = islandTile.y * TILE_SCALE;
  light.position.set(centerX - 35, 55, centerZ - 30);
  light.target.position.set(centerX, 3, centerZ);

  const size = frame.renderScheduler.tier === "full"
    ? 1024
    : frame.renderScheduler.tier === "balanced"
      ? 512
      : 0;
  if (size === 0) {
    light.shadow.intensity = 0;
    light.shadow.autoUpdate = false;
    scene.shadowActiveSize = 0;
    return 0;
  }
  light.shadow.intensity = 1;
  // The casters (island + lighthouse) are static and the light direction is
  // fixed, so the shadow map only needs re-rendering when the scene or frustum
  // size changes — not every frame. This keeps the extra pass near-zero cost.
  light.shadow.autoUpdate = false;
  if (light.shadow.mapSize.width !== size) {
    light.shadow.mapSize.set(size, size);
    // Force a reallocation at the new size (three only builds the map when null).
    light.shadow.map?.dispose();
    light.shadow.map = null;
    scene.shadowNeedsRender = true;
  }
  if (scene.shadowActiveSize !== size) scene.shadowNeedsRender = true;
  scene.shadowActiveSize = size;
  if (scene.shadowNeedsRender) {
    light.shadow.needsUpdate = true;
    scene.shadowNeedsRender = false;
  }
  return size;
}

function updateSceneForFrame(
  scene: GardenScene,
  camera: OrthographicCamera,
  frame: ThreeWorldRendererFrame,
  phase: DayCyclePhase,
): void {
  updateCamera(camera, frame);
  scene.sky.update(phase, {
    reducedMotion: frame.reducedMotion,
    targetX: camera.position.x - CAMERA_DISTANCE,
    targetZ: camera.position.z - CAMERA_DISTANCE,
    timeSeconds: frame.timeSeconds,
  });
  updateDayCycle(scene, frame, phase);
  scene.water.update(frame);
  const content = scene.content;
  if (!content) {
    // No fleet lanes to add — pack the base (beacon/harbor/dock) lanes only.
    const laneCount = scene.laneRegistry.sync(frame.renderScheduler.tier);
    scene.water.setLaneState(scene.laneRegistry.texture, laneCount);
    return;
  }

  const constrained = frame.renderScheduler.tier === "constrained";
  const fullQuality = frame.renderScheduler.tier === "full"
    || frame.renderScheduler.tier === "balanced";
  content.decoration.visible = true;
  scene.waterAccents.visible = true;
  scene.waterAccents.rotation.y = 0;
  for (const effect of content.weather) {
    effect.root.visible = fullQuality;
    updateDangerWeather(
      effect,
      frame.timeSeconds,
      frame.reducedMotion,
      frame.renderScheduler.tier === "full",
    );
  }
  content.gullFlock.update({
    constrained,
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  content.fireflies.update({
    fullTier: frame.renderScheduler.tier === "full",
    night: phase.night,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });

  const pulse = frame.reducedMotion ? 1 : 1 + Math.sin(frame.timeSeconds * 1.15) * 0.045;
  content.beacon.scale.setScalar(pulse);
  // Volumetric cone at full/balanced/interaction; the flat plane is the
  // recovery/constrained fallback; dust motes only at full tier with motion.
  const beamUsePlane = frame.renderScheduler.tier === "recovery"
    || frame.renderScheduler.tier === "constrained";
  for (const child of content.beam.children) {
    if (child.name === "lighthouse-beam-cone") child.visible = !beamUsePlane;
    else if (child.name === "lighthouse-beam") child.visible = beamUsePlane;
    else if (child.name === "lighthouse-beam-dust") {
      child.visible = frame.renderScheduler.tier === "full" && !frame.reducedMotion;
    }
  }
  // Constrained freezes the sweep to a static angle (matching reduced motion).
  content.beam.rotation.y = frame.reducedMotion || constrained
    ? -0.55
    : frame.timeSeconds * 0.2;
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
    let heel = 0;
    if (heading) {
      const headingAngle = Math.atan2(heading.y, heading.x);
      visual.root.rotation.y = -headingAngle;
      // Gentle heel into turns: roll proportional to the frame's heading change,
      // clamped and frozen under reduced motion (D7 motion hierarchy).
      if (!frame.reducedMotion && visual.prevHeadingAngle !== null) {
        let delta = headingAngle - visual.prevHeadingAngle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        heel = MathUtils.clamp(delta * 2.4, -0.16, 0.16);
      }
      visual.prevHeadingAngle = headingAngle;
    } else {
      visual.prevHeadingAngle = null;
    }
    visual.root.rotation.z = heel;
    // Larger hulls bob slower and shallower (titans slowest); standard as-is.
    const bobAmplitude = frame.reducedMotion
      ? 0
      : (0.035 + frame.seaState.swell * 0.055) * visual.motionAmplitudeScale;
    visual.root.position.y += Math.sin(
      frame.timeSeconds * (0.72 + frame.seaState.tempo * 0.25) / visual.motionPeriodScale
      + visual.bobPhase,
    ) * bobAmplitude;
    visual.sampleState = sample?.state ?? "idle";
    // Lay a warm reflection lane on the sea under each ship's lantern(s).
    scene.laneRegistry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `ship-lantern.${visual.ship.id}`,
      intensity: visual.laneIntensity,
      kind: "lantern",
      worldX: visual.root.position.x,
      worldZ: visual.root.position.z,
    });
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

  // Ship transforms are final — restamp the fleet lantern instances from them
  // and re-pack the lane texture now that this frame's ship lanes are set.
  updateFleetLanterns(
    content.fleetLanterns,
    camera.quaternion,
    frame.reducedMotion ? 0 : frame.timeSeconds,
    frame.reducedMotion,
  );
  const activeLaneCount = scene.laneRegistry.sync(frame.renderScheduler.tier);
  scene.water.setLaneState(scene.laneRegistry.texture, activeLaneCount);

  updateZoneBuoys(
    content.zoneField,
    frame.timeSeconds,
    frame.reducedMotion,
    frame.renderScheduler.tier === "full",
  );

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

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
import {
  DEWS_AREA_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../systems/risk-water-areas";
import { HARBOR_PALETTE, zoneThemeForTerrain } from "../systems/palette";
import { screenToTile } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  createGardenCemetery,
  createGardenPigeonnier,
} from "./garden-landmarks";
import {
  createGardenGullFlock,
  createGardenHarborDistricts,
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
  type DockVisual,
} from "./garden-docks";
import { createTerracedIsland, createWaterAccents } from "./garden-island";
import { attachGardenLighthouseModel } from "./garden-lighthouse";
import {
  createShip,
  createShipShadows,
  syncShipSailTextures,
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
  type GardenWeatherVisual,
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
      post.dispose();
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
      }
      if (scene.content) syncShipSailTextures(scene.content, frame);
      const phase = dayCyclePhase(frame.wallClockHour);
      updateSceneForFrame(scene, camera, frame, phase);

      const tier = frame.renderScheduler.tier;
      const composerActive = tier !== "constrained";
      post.setEnabled(composerActive);
      post.setBloomEnabled(composerActive && tier !== "recovery");
      post.setGrade(phase.daylight, phase.dusk, phase.night);
      post.render();

      const content = scene.content;
      const renderInfo = renderer.info.render;
      const selected = frame.selectedDetailId ? 1 : 0;
      return {
        activeLaneCount: 0,
        composerEnabled: composerActive,
        drawableCount: content?.drawableCount ?? 0,
        drawableCounts: {
          underlay: 1 + (content?.zones.length ?? 0),
          body: Math.max(0, (content?.drawableCount ?? 0) - selected - 2),
          overlay: 1,
          selection: selected,
        },
        postPassList: post.getPassList(),
        shadowMapSize: 0,
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
  sky: GardenSky;
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

  // Sky dome/stars/moon are added last so lights and water keep the child
  // indices the renderer tests assert against; world content is appended after.
  root.add(sky.root);

  return {
    ambientLight,
    content: null,
    directionalLight,
    hemisphereLight,
    hoverMarker,
    lighthouseModel: null,
    root,
    selectedMarker,
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

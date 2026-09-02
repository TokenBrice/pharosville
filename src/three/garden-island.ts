import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  RepeatWrapping,
  RGBAFormat,
  RingGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  UnsignedByteType,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenSeason } from "../systems/season";
import type { SupplyTide } from "../systems/supply-tide";
import type { PharosVilleWorld } from "../systems/world-types";
import type { WeatherPlan } from "../systems/weather";
import { createLighthouse } from "./garden-lighthouse";
import {
  applyGardenHeightFog,
  patchGardenHeightFogMaterial,
} from "./garden-height-fog";
import { createGardenKoi } from "./garden-koi";
import { MOON_COLOR, type DayCyclePhase } from "./garden-day-cycle";
import { OVERVIEW_LOD_DETAIL_NAMES } from "./garden-overview-lod";
import { countDrawableObjects, setTilePosition, stableUnit } from "./garden-util";
import { sampleTideLine } from "./garden-tide-line";
import type { GardenCloudShadowSource } from "./garden-water-contract";
import {
  patchGardenInstancedWindSway,
  updateGardenInstancedWindSway,
} from "./garden-rim-mesh";

const scratchMatrix = new Matrix4();
const scratchLeanAxis = new Vector3();
const scratchLeanQuaternion = new Quaternion();

// Height-graded rock ramp: dark wet stone at the waterline climbs to pale
// weathered limestone at the crown. Terrace tops carry a planted colour.
const WATERLINE_Y = WATER_LEVEL;

/** The datum notch: scored iron, not the salt crust the PSI mark already uses. */
const TIDE_DATUM_IRON = new Color(HARBOR_PALETTE.iron_dark);
const CROWN_RAMP_Y = 3.4;
const STONE_WET = new Color("#242d28");
const STONE_MID = new Color("#828874");
const STONE_PALE = new Color("#d2cba9");
const TERRACE_WET = new Color("#33403a");
const TERRACE_MOSS = new Color("#6f8557");
const UP_AXIS = new Vector3(0, 1, 0);
const scratchPosition = new Vector3();
const scratchScale = new Vector3();
const scratchQuaternion = new Quaternion();

function gardenSurfaceTexture(
  size: number,
  sample: (x: number, y: number) => readonly [number, number, number],
): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = sample(x, y);
      const offset = (y * size + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createMossRoughnessTexture(): DataTexture {
  const texture = gardenSurfaceTexture(32, (x, y) => {
    const coarse = Math.sin(x * 0.63 + y * 0.31) * 0.5 + 0.5;
    const fine = Math.sin(x * 2.17 - y * 1.43) * 0.5 + 0.5;
    const roughness = Math.round(188 + coarse * 40 + fine * 22);
    return [roughness, roughness, roughness];
  });
  texture.repeat.set(3, 3);
  return texture;
}

function createRakedGravelNormalTexture(): DataTexture {
  const texture = gardenSurfaceTexture(64, (_x, y) => {
    const slope = Math.cos((y / 64) * Math.PI * 16) * 0.34;
    const normalY = -slope;
    const normalZ = 1 / Math.sqrt(1 + normalY * normalY);
    return [128, Math.round((normalY * normalZ * 0.5 + 0.5) * 255), Math.round((normalZ * 0.5 + 0.5) * 255)];
  });
  texture.repeat.set(4, 4);
  return texture;
}

// Two stone lanterns punctuate the path rather than outlining it. The former
// six-lamp run made the terrace read as a lit quay; these two retain the lane
// contract while leaving the pale gravel itself as the route's large read.
const ISLAND_LANTERN_POSITIONS = [
  [-4.55, -1.75],
  [2.15, 2.15],
] as const;
const LANTERN_LAMP_LOCAL_Y = 0.88;

/**
 * The four craggy rock tiers, as
 * `[topRadius, bottomRadius, height, segments, seed, x, y, z, scaleZ, rotation, topColor]`.
 * Hoisted from the build loop so `islandTerrainHeight()` seats the W4.9
 * additions (stair, talus, planting) against the same numbers the geometry is
 * cut from — a stair floating a hand-tuned distance above the rock was the
 * failure mode this avoids.
 */
const ISLAND_TIERS = [
  [16.8, 18.4, 1.45, 32, 0.3, 0.6, -0.74, 1.2, 0.75, 0.08, TERRACE_WET],
  [13.7, 15.7, 1.72, 30, 1.25, -1.8, 0.05, 0.65, 0.7, -0.12, TERRACE_WET],
  [10.1, 12.3, 1.55, 28, 2.2, -4.45, 1.22, 0.05, 0.64, 0.18, TERRACE_MOSS],
  [6.1, 8.1, 1.15, 24, 3.35, -6.7, 2.18, -1.1, 0.66, -0.08, TERRACE_MOSS],
] as const;

/**
 * Height of the rock surface at a root-relative point: the highest tier whose
 * top cap covers it, or an interpolation down the battered face of whichever
 * tier it sits on. The tier meshes are also radially displaced and yawed a few
 * degrees, so this is an approximation — close enough to seat props on, which
 * is all it is used for.
 */
function islandTerrainHeight(x: number, z: number): number {
  let height = WATER_LEVEL;
  for (const [topRadius, bottomRadius, tierHeight, , , cx, cy, cz, scaleZ] of ISLAND_TIERS) {
    const top = cy + tierHeight / 2;
    const base = cy - tierHeight / 2;
    const inner = Math.hypot((x - cx) / topRadius, (z - cz) / (topRadius * scaleZ));
    if (inner <= 1) {
      height = Math.max(height, top);
      continue;
    }
    const outer = Math.hypot((x - cx) / bottomRadius, (z - cz) / (bottomRadius * scaleZ));
    if (outer > 1) continue;
    // On the battered face: the tier's skirt runs from `bottomRadius` at its
    // base up to `topRadius` at its cap.
    const across = (1 - outer) / Math.max(1e-3, 1 - topRadius / bottomRadius);
    height = Math.max(height, base + (top - base) * clamp01(across));
  }
  return height;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// W4.9 sedimentary bedding. The rock ramp was a smooth wet→pale gradient,
// which is a large part of why the island read as a moulded blob: real sea
// rock is layered, and the bedding planes are what give a cliff its scale. One
// bed is ~0.62 world units, with a shadow line at each bed's base and
// alternating harder (proud, pale) and softer (recessed, dark) courses. This
// is the island's echo of the ashlar coursing on the tower above it.
const STRATA_PERIOD = 0.62;

function strataShade(worldY: number): number {
  const phase = (worldY - WATERLINE_Y) / STRATA_PERIOD;
  const bed = phase - Math.floor(phase);
  const bedding = 1 - 0.18 * (1 - smoothstep01(bed / 0.26));
  const alternating = (((Math.floor(phase) % 2) + 2) % 2) === 0 ? 1.05 : 0.93;
  return bedding * alternating;
}

/**
 * World offsets (relative to the island root) of each path lantern's warm lamp,
 * for the caller to register as light lanes on the sea.
 */
export function gardenIslandLanternWorldOffsets(): { x: number; y: number; z: number }[] {
  return ISLAND_LANTERN_POSITIONS.map(([x, z]) => ({
    x,
    y: islandTerrainHeight(x, z) + LANTERN_LAMP_LOCAL_Y,
    z,
  }));
}

export function createWaterAccents(): Group {
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

const ISLAND_DYNAMIC_NAMES = new Set([
  "island-koi",
  "island-niwaki-pads",
  "island-niwaki-trunks",
  "island-path-sweep",
  "island-reflection-pond-skin",
  "lighthouse-beam",
  "lighthouse-beam-cone",
  "lighthouse-beam-dust",
  "pharos-obelisk-caps",
  "pharos-obelisk-stone",
]);

// These groups are visibility/LOD transform boundaries. Their descendants
// are static relative to the group and may merge with one another, but moving
// them to the island root would leave them behind when the group is hidden or
// scaled (notably when the procedural Pharos shell is replaced by its GLB).
const ISLAND_DYNAMIC_CONTAINER_NAMES = new Set([
  "lighthouse-procedural-shell",
  ...OVERVIEW_LOD_DETAIL_NAMES,
]);

const DEFAULT_STANDARD_ON_BEFORE_COMPILE = MeshStandardMaterial.prototype.onBeforeCompile;
const DEFAULT_STANDARD_PROGRAM_CACHE_KEY = DEFAULT_STANDARD_ON_BEFORE_COMPILE.toString();
const DEFAULT_MESH_ON_BEFORE_RENDER = Mesh.prototype.onBeforeRender;
const DEFAULT_MESH_ON_AFTER_RENDER = Mesh.prototype.onAfterRender;

interface IslandStaticMergeBucket {
  material: MeshStandardMaterial;
  meshes: Mesh<BufferGeometry, MeshStandardMaterial>[];
  owner: Group;
}

function hasMaterialTexture(material: MeshStandardMaterial): boolean {
  return Object.values(material).some((value) => (
    value !== null
    && typeof value === "object"
    && (value as { isTexture?: boolean }).isTexture === true
  ));
}

function hasUnsupportedMaterialPatch(material: MeshStandardMaterial): boolean {
  const cacheKey = material.customProgramCacheKey();
  if (material.userData.gardenHeightFog) {
    return cacheKey !== `${DEFAULT_STANDARD_PROGRAM_CACHE_KEY}|garden-height-fog-v1`;
  }
  return material.onBeforeCompile !== DEFAULT_STANDARD_ON_BEFORE_COMPILE
    || cacheKey !== DEFAULT_STANDARD_PROGRAM_CACHE_KEY;
}

function islandMaterialSignature(
  material: MeshStandardMaterial,
  mesh: Mesh,
): string {
  return JSON.stringify([
    material.flatShading,
    material.roughness,
    material.metalness,
    material.side,
    material.emissive.getHexString(),
    material.emissiveIntensity,
    material.transparent,
    material.opacity,
    material.map === null,
    mesh.castShadow,
    mesh.receiveShadow,
    material.name,
    material.toneMapped,
    material.depthWrite,
    material.depthTest,
    material.colorWrite,
    material.alphaTest,
    material.alphaHash,
    material.alphaToCoverage,
    material.blending,
    material.blendSrc,
    material.blendDst,
    material.blendEquation,
    material.blendSrcAlpha,
    material.blendDstAlpha,
    material.blendEquationAlpha,
    material.blendColor.getHexString(),
    material.blendAlpha,
    material.depthFunc,
    material.premultipliedAlpha,
    material.dithering,
    material.fog,
    material.wireframe,
    material.wireframeLinewidth,
    material.polygonOffset,
    material.polygonOffsetFactor,
    material.polygonOffsetUnits,
    material.stencilWrite,
    material.stencilWriteMask,
    material.stencilFunc,
    material.stencilRef,
    material.stencilFuncMask,
    material.stencilFail,
    material.stencilZFail,
    material.stencilZPass,
    material.shadowSide,
    material.precision,
    material.forceSinglePass,
    material.allowOverride,
    material.clipIntersection,
    material.clipShadows,
    material.clippingPlanes?.map((plane) => [
      plane.normal.x,
      plane.normal.y,
      plane.normal.z,
      plane.constant,
    ]) ?? null,
    material.defines,
    material.envMapIntensity,
    material.envMapRotation.x,
    material.envMapRotation.y,
    material.envMapRotation.z,
    material.visible,
    mesh.visible,
    mesh.layers.mask,
    mesh.renderOrder,
    mesh.frustumCulled,
  ]);
}

function prepareIslandMergeGeometry(
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>,
  relativeMatrix: Matrix4,
): BufferGeometry {
  const geometry = mesh.geometry.index
    ? mesh.geometry.toNonIndexed()
    : mesh.geometry.clone();
  geometry.applyMatrix4(relativeMatrix);

  const positions = geometry.getAttribute("position");
  const sourceColors = geometry.getAttribute("color");
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const offset = index * 3;
    colors[offset] = mesh.material.color.r
      * (mesh.material.vertexColors && sourceColors ? sourceColors.getX(index) : 1);
    colors[offset + 1] = mesh.material.color.g
      * (mesh.material.vertexColors && sourceColors ? sourceColors.getY(index) : 1);
    colors[offset + 2] = mesh.material.color.b
      * (mesh.material.vertexColors && sourceColors ? sourceColors.getZ(index) : 1);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  // None of the eligible materials samples UVs or custom attributes. Keeping
  // only the lit-standard inputs makes unlike primitive geometries mergeable
  // without changing the shader program or its output.
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal" && attribute !== "color") {
      geometry.deleteAttribute(attribute);
    }
  }
  return geometry;
}

function islandStaticMergeOwner(mesh: Mesh, root: Group): Group {
  let ancestor = mesh.parent;
  while (ancestor && ancestor !== root) {
    if (ancestor instanceof Group && ISLAND_DYNAMIC_CONTAINER_NAMES.has(ancestor.name)) {
      return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return root;
}

/**
 * Collapses immutable, untextured island meshes by their complete visible
 * material state. Source albedo is moved into vertex colour, so differently
 * coloured surfaces can share the resulting white material without a shade
 * change. Dynamic, instanced, textured and shader-patched draws stay intact.
 */
export function mergeIslandStatics(root: Group): { merged: number; kept: number } {
  root.updateMatrixWorld(true);
  const ownerIds = new Map<Group, number>([[root, 0]]);
  const buckets = new Map<string, IslandStaticMergeBucket>();

  root.traverse((object) => {
    if (!(object instanceof Mesh) || object instanceof InstancedMesh) return;
    if (
      object.userData.gardenKeepSeparate
      || ISLAND_DYNAMIC_NAMES.has(object.name)
      || Array.isArray(object.material)
      || !(object.material instanceof MeshStandardMaterial)
      || hasMaterialTexture(object.material)
      || hasUnsupportedMaterialPatch(object.material)
      || object.onBeforeRender !== DEFAULT_MESH_ON_BEFORE_RENDER
      || object.onAfterRender !== DEFAULT_MESH_ON_AFTER_RENDER
      || object.customDepthMaterial !== undefined
      || object.customDistanceMaterial !== undefined
      || object.geometry.drawRange.start !== 0
      || object.geometry.drawRange.count !== Infinity
    ) {
      return;
    }
    const owner = islandStaticMergeOwner(object, root);
    if (!ownerIds.has(owner)) ownerIds.set(owner, ownerIds.size);
    const signature = `${ownerIds.get(owner)}|${islandMaterialSignature(object.material, object)}`;
    const bucket = buckets.get(signature) ?? { material: object.material, meshes: [], owner };
    bucket.meshes.push(object as Mesh<BufferGeometry, MeshStandardMaterial>);
    buckets.set(signature, bucket);
  });

  let merged = 0;
  let signatureIndex = 0;
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < 2) {
      continue;
    }
    const ownerInverse = bucket.owner.matrixWorld.clone().invert();
    const geometries = bucket.meshes.map((mesh) => prepareIslandMergeGeometry(
      mesh,
      ownerInverse.clone().multiply(mesh.matrixWorld),
    ));
    const geometry = mergeGeometries(geometries, false);
    for (const prepared of geometries) prepared.dispose();
    if (!geometry) {
      continue;
    }

    const source = bucket.meshes[0]!;
    const material = bucket.material.clone();
    material.color.set("#ffffff");
    material.vertexColors = true;
    material.userData = { ...material.userData };
    delete material.userData.gardenHeightFog;
    if (bucket.meshes.some((mesh) => mesh.material.userData.gardenHeightFog)) {
      patchGardenHeightFogMaterial(material);
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = `island-merged-${signatureIndex}`;
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.renderOrder = source.renderOrder;
    mesh.frustumCulled = source.frustumCulled;
    mesh.visible = source.visible;
    mesh.layers.mask = source.layers.mask;
    bucket.owner.add(mesh);

    for (const original of bucket.meshes) {
      original.removeFromParent();
      original.geometry.dispose();
    }
    merged += bucket.meshes.length - 1;
    signatureIndex += 1;
  }

  return { merged, kept: countDrawableObjects(root) };
}

/**
 * I3 (contract C2(c)): when the integrator passes Lane W's shared cloud-shadow
 * source (`scene.water.cloudShadows`), every lit island material samples the
 * same world-XZ cloud mask the water uses, so light weather drifts across the
 * whole garden at once. With the option absent the island renders exactly as
 * before — the hook is purely additive.
 */
export function createTerracedIsland(
  world: PharosVilleWorld,
  cloudShadows?: GardenCloudShadowSource,
  season: GardenSeason = "summer",
): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  pondReflection: GardenPondReflection;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, gardenIslandDisplayTile(world.lighthouse.tile), 0);

  const rockMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.95,
    roughnessMap: createMossRoughnessTexture(),
    vertexColors: true,
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

  // Craggy stone tiers: same footprint and top-shelf heights as before, but
  // re-skinned as displaced rock with a wet-base → pale-crown vertex gradient.
  for (const [topRadius, bottomRadius, height, segments, seed, x, y, z, scaleZ, rotation, topColor] of ISLAND_TIERS) {
    const tier = new Mesh(
      createRockTerraceGeometry(
        topRadius,
        bottomRadius,
        height,
        segments,
        seed,
        y,
        topColor,
        0.11,
        world.supplyTide,
        { rotation, scaleZ, x, z },
      ),
      rockMaterial,
    );
    tier.position.set(x, y, z);
    tier.scale.z = scaleZ;
    tier.rotation.y = rotation;
    tier.castShadow = true;
    tier.receiveShadow = true;
    root.add(tier);
  }

  for (const [shelfIndex, [radius, x, y, z, scaleZ, seed]] of ([
    [4.55, 3.55, 0.92, 2.9, 0.48, 0.4],
    [3.65, -6.0, 1.9, 2.0, 0.43, 1.8],
    [2.9, 2.25, 2.42, -3.7, 0.52, 2.7],
  ] as const).entries()) {
    const plantedShelf = new Mesh(
      createRockTerraceGeometry(
        radius,
        radius * 1.06,
        0.2,
        16,
        seed,
        y,
        TERRACE_MOSS,
        0.06,
        undefined,
        { rotation: x * 0.08, scaleZ, x, z },
      ),
      rockMaterial,
    );
    plantedShelf.position.set(x, y, z);
    plantedShelf.name = `island-planted-shelf-${shelfIndex}`;
    plantedShelf.scale.z = scaleZ;
    plantedShelf.rotation.y = x * 0.08;
    plantedShelf.castShadow = true;
    plantedShelf.receiveShadow = true;
    root.add(plantedShelf);
  }

  root.add(createGardenPathSweep());

  const lighthouseRoot = new Group();
  lighthouseRoot.position.set(
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  );
  root.add(lighthouseRoot);
  const lighthouse = createLighthouse();
  lighthouse.beacon.userData.gardenKeepSeparate = true;
  lighthouseRoot.add(lighthouse.root);

  const decoration = createIslandDecoration(season);
  root.add(decoration);
  const reflectionPond = createIslandReflectionPond();
  root.add(
    createKeeperCottage(),
    createObservatoryPavilion(),
    reflectionPond.root,
  );
  // The obelisks survive only as the quay stair's deliberately unequal
  // gateposts. The old sea wall and drowned drums are shed: both described a
  // fortress, not a garden-rock, and neither displaced a larger composition.
  root.add(
    createPrecinctObelisks(),
    createDangerRockFace(),
    createQuayStair(),
  );
  mergeIslandStatics(root);
  if (cloudShadows) applyGardenCloudShadows(root, cloudShadows);
  applyGardenHeightFog(root);

  return {
    beacon: lighthouse.beacon,
    beaconHalo: lighthouse.beaconHalo,
    beam: lighthouse.beam,
    decoration,
    lighthouseLight: lighthouse.light,
    lighthouseRoot,
    lighthouseShell: lighthouse.shell,
    pondReflection: reflectionPond.reflection,
    root,
  };
}

// I3 cloud-shadow GLSL (C2(c)): the land samples Lane W's noise texture with
// the same world-XZ mapping the water shader uses — uv = worldXZ * scale +
// offset — so a cloud darkens the sea and the shore in one coherent drift.
const CLOUD_SHADOW_VERTEX_PARS = "varying vec3 vGardenCloudWorldPos;";
const CLOUD_SHADOW_VERTEX_CHUNK = /* glsl */ `
  vec4 gardenCloudWorldPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    gardenCloudWorldPosition = instanceMatrix * gardenCloudWorldPosition;
  #endif
  gardenCloudWorldPosition = modelMatrix * gardenCloudWorldPosition;
  vGardenCloudWorldPos = gardenCloudWorldPosition.xyz;
`;
const CLOUD_SHADOW_FRAGMENT_PARS = /* glsl */ `
  uniform sampler2D uCloudShadow;
  uniform vec4 uCloudShadowTransform;
  uniform float uCloudShadowStrength;
  varying vec3 vGardenCloudWorldPos;
`;
const CLOUD_SHADOW_FRAGMENT_CHUNK = /* glsl */ `
  {
    vec2 gardenCloudUv = vGardenCloudWorldPos.xz * uCloudShadowTransform.xy
      + uCloudShadowTransform.zw;
    float gardenCloudCover = texture2D( uCloudShadow, gardenCloudUv ).r;
    float gardenCloudLight = 1.0 - gardenCloudCover * uCloudShadowStrength;
    reflectedLight.directDiffuse *= gardenCloudLight;
    reflectedLight.indirectDiffuse *= gardenCloudLight;
  }
`;

/**
 * Applies the shared cloud-shadow source (C2(c)) to every lit material under
 * `root` via onBeforeCompile: the diffuse light term is multiplied by the
 * cloud mask sampled in world XZ, matching Lane W's water-side sampling. The
 * uniform objects are shared, not copied, so Lane W's per-frame drift and the
 * tier/reduced-motion gating (strength 0 below balanced, drift frozen) apply
 * here unchanged. Exported so the integrator can also hook late-attached
 * geometry (e.g. the lighthouse GLB shell) with the same helper. Idempotent.
 */
export function applyGardenCloudShadows(
  root: Group,
  source: GardenCloudShadowSource,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (material.userData.gardenCloudShadows) continue;
      material.userData.gardenCloudShadows = true;
      const previousCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        // Share Lane W's uniform objects — never copy — so every consumer
        // samples the same texture, transform, and strength by construction.
        shader.uniforms.uCloudShadow = source.uniforms.uCloudShadow;
        shader.uniforms.uCloudShadowTransform = source.uniforms.uCloudShadowTransform;
        shader.uniforms.uCloudShadowStrength = source.uniforms.uCloudShadowStrength;
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\n${CLOUD_SHADOW_VERTEX_PARS}`,
          )
          .replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>\n${CLOUD_SHADOW_VERTEX_CHUNK}`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\n${CLOUD_SHADOW_FRAGMENT_PARS}`,
          )
          .replace(
            "#include <lights_fragment_end>",
            `#include <lights_fragment_end>\n${CLOUD_SHADOW_FRAGMENT_CHUNK}`,
          );
      };
    }
  });
  // The same helper is used for asynchronously attached lighthouse geometry;
  // keep that late material in the shared air as well as the shared cloud.
  applyGardenHeightFog(root);
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

function stoneRampColor(worldY: number, target: Color, tide?: SupplyTide): Color {
  const t = clamp01((worldY - WATERLINE_Y) / (CROWN_RAMP_Y - WATERLINE_Y));
  if (t < 0.5) target.copy(STONE_WET).lerp(STONE_MID, t / 0.5);
  else target.copy(STONE_MID).lerp(STONE_PALE, (t - 0.5) / 0.5);
  target.multiplyScalar(strataShade(worldY));
  // The tide line rides the ramp the shore rock already paints, so the band
  // costs no geometry and no draw call. Wetting pulls the stone back toward its
  // own submerged colour rather than toward some new ink, which is what keeps
  // the band reading as water on rock instead of as a decal.
  if (tide) {
    const { datum, wet } = sampleTideLine(worldY - WATERLINE_Y, tide);
    if (wet > 0) target.lerp(STONE_WET, wet * 0.6);
    if (datum > 0) target.lerp(TIDE_DATUM_IRON, 0.7);
  }
  // W5.3: salt-polished stone is darkest exactly where the water repeatedly
  // reaches it. This is vertex colour on the existing rock, not another band
  // mesh, so the waterline gains age without a draw call or data meaning.
  const waterlineWear = 1 - smoothstep01((worldY - WATERLINE_Y) / 0.42);
  target.multiplyScalar(1 - waterlineWear * 0.14);
  return target;
}

interface TerraceGroundTransform {
  rotation: number;
  scaleZ: number;
  x: number;
  z: number;
}

function ringWear(distance: number, radius: number, width: number): number {
  return 1 - smoothstep01(Math.abs(distance - radius) / width);
}

/** Wear gathered where feet, roots and pond wash meet the planted cap. */
function gardenGroundWear(x: number, z: number): number {
  let wear = ringWear(Math.hypot(x - 4.4, z - 2.35), 2.28, 0.52); // pavilion sill
  wear = Math.max(wear, ringWear(Math.hypot(x + 10, z + 1), 2.5, 0.48)); // cottage
  const pondRadius = Math.hypot(
    (x - GARDEN_POND_CENTER.x) / 3.6,
    (z - GARDEN_POND_CENTER.z) / 2.45,
  );
  wear = Math.max(wear, 1 - smoothstep01(Math.abs(pondRadius - 1) / 0.18));
  for (const [px, pz] of ISLAND_LANTERN_POSITIONS) {
    wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - px, z - pz) / 0.48));
  }
  wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - 7.2, z - 3.2) / 0.7));
  for (const { x: px, z: pz } of GARDEN_NIWAKI_SPECS) {
    wear = Math.max(wear, 1 - smoothstep01(Math.hypot(x - px, z - pz) / 0.62));
  }
  return wear;
}

/**
 * A displaced, flat-shaded stone tier. Side vertices are pushed radially and
 * crag vertically (rims held so the flat planted shelf stays sealed), and each
 * vertex is coloured by its world height so the wet base reads far darker than
 * the crown. The top cap is coloured `topColor` (sand or moss). Determinism
 * comes from `seed` + `stableUnit` hashing — no `Math.random`.
 */
export function createRockTerraceGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  segments: number,
  seed: number,
  baseElevation: number,
  topColor: Color,
  amplitude = 0.11,
  tide?: SupplyTide,
  groundTransform?: TerraceGroundTransform,
): CylinderGeometry {
  // W4.9: enough height rows to resolve a bedding step (~3 rows per bed at
  // STRATA_PERIOD). Three rows could carry a colour band but never an edge,
  // and an edge is what raking light needs — the same lesson the tower's
  // ashlar coursing taught.
  const heightSegments = Math.max(3, Math.round(height / 0.16));
  const geometry = new CylinderGeometry(topRadius, bottomRadius, height, segments, heightSegments, false);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  const half = height / 2;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const oy = positions.getY(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    const v = (oy + half) / height;
    let colorY = baseElevation + oy;
    if (radius >= 0.001) {
      const angle = Math.atan2(z, x);
      const jitter = stableUnit(`${seed}|${Math.round(angle * 57.29)}`) - 0.5;
      const noise = Math.sin(angle * 3 + seed) * 0.5
        + Math.sin(angle * 7 - seed * 1.3 + v * 4) * 0.3
        + Math.sin(angle * 13 + seed * 2.1) * 0.2
        + jitter * 0.6;
      // W4.9 bedding planes. A vertex's bed is keyed off a gently warped world
      // height so the ledges undulate like real strata instead of ringing the
      // tier as perfect circles; every vertex in a bed shares one radial
      // offset, so the side face steps at each bed boundary. Colour is sampled
      // from the same warped height, which puts the shadow band exactly on the
      // geometric edge rather than near it.
      colorY = baseElevation + oy
        + Math.sin(angle * 2 + seed * 1.7) * 0.13
        + Math.sin(angle * 5 - seed) * 0.06;
      const bed = Math.floor((colorY - WATERLINE_Y) / STRATA_PERIOD);
      const bedStep = ((((bed % 2) + 2) % 2) === 0 ? 0.03 : -0.03)
        + (stableUnit(`${seed}~bed~${bed}`) - 0.5) * 0.05;
      const radialScale = 1 + amplitude * noise + bedStep;
      positions.setX(index, x * radialScale);
      positions.setZ(index, z * radialScale);
      // Vertical crag, tapered to zero at both rims so caps never split open.
      const vignette = 1 - Math.abs(2 * v - 1);
      const crag = Math.sin(angle * 9 + seed * 3) * 0.5
        + (stableUnit(`${seed}#${Math.round(angle * 40)}`) - 0.5);
      positions.setY(index, oy + crag * vignette * height * 0.16);
    }
    const ao = 0.7 + 0.3 * v;
    stoneRampColor(colorY, color, tide).multiplyScalar(ao);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  // Repaint the cap groups: top = planted colour, bottom = darkest wet stone.
  // W4.9: the top cap used to be one flat plate of moss, which is most of why
  // the island read as a smooth green mass from the fixed camera — the caps
  // are the surface it mostly sees. The planting now thins toward the rim and
  // in deterministic bare patches so the rock breaks through, and every cap
  // vertex carries a little mottle.
  const index = geometry.getIndex();
  const capColor = new Color();
  if (index) {
    for (const group of geometry.groups) {
      if (group.materialIndex !== 1 && group.materialIndex !== 2) continue;
      for (let k = group.start; k < group.start + group.count; k += 1) {
        const vertex = index.getX(k);
        if (group.materialIndex === 2) {
          color.copy(STONE_WET).multiplyScalar(0.62);
        } else {
          const vx = positions.getX(vertex);
          const vy = positions.getY(vertex);
          const vz = positions.getZ(vertex);
          const rim = smoothstep01(
            (Math.hypot(vx, vz) / Math.max(0.001, topRadius) - 0.68) / 0.3,
          );
          const patch = stableUnit(
            `${seed}~bare~${Math.round(vx * 2.2)}~${Math.round(vz * 2.2)}`,
          );
          const bare = clamp01(rim * 0.9 + (patch - 0.52) * 1.15);
          stoneRampColor(baseElevation + vy, capColor, tide);
          color.copy(topColor).lerp(capColor, bare);
          // W5.3: two deterministic scales keep moss from reading as one
          // uniform green band. The coarse value drift reads at the default
          // camera; the fine mottle breaks it up in inspection framing.
          const coarse = stableUnit(
            `${seed}~moss-coarse~${Math.round(vx * 0.75)}~${Math.round(vz * 0.75)}`,
          );
          const fine = stableUnit(
            `${seed}~moss-fine~${Math.round(vx * 3)}~${Math.round(vz * 3)}`,
          );
          color.multiplyScalar(0.82 + coarse * 0.2 + fine * 0.14);
          if (groundTransform) {
            const scaledZ = vz * groundTransform.scaleZ;
            const cos = Math.cos(groundTransform.rotation);
            const sin = Math.sin(groundTransform.rotation);
            const rootX = groundTransform.x + vx * cos + scaledZ * sin;
            const rootZ = groundTransform.z - vx * sin + scaledZ * cos;
            color.multiplyScalar(1 - gardenGroundWear(rootX, rootZ) * 0.2);
          }
        }
        colors[vertex * 3] = color.r;
        colors[vertex * 3 + 1] = color.g;
        colors[vertex * 3 + 2] = color.b;
      }
    }
  }

  positions.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.clearGroups();
  geometry.computeVertexNormals();
  return geometry;
}

const CAMERA_FACING_YAW = Math.PI / 4;

// I1 Sakuteiki stone groupings (karesansui): the old uniform 18-stone scatter
// is recomposed into five triads — odd-numbered clusters, each with ONE
// dominant vertical stone and two subordinate horizontals leaning toward it,
// broad faces turned to the fixed camera. The three dropped stones are the
// deliberate subtraction (ma): open ground lets each grouping read.
export interface GardenIslandStoneSpec {
  /** Root-relative placement; y keys the stone to the local terrace shelf. */
  x: number;
  y: number;
  z: number;
  scale: number;
  /** The one vertical "father" stone of the triad; subordinates stay horizontal. */
  dominant?: boolean;
}

export const GARDEN_ISLAND_STONE_GROUPINGS: readonly (readonly GardenIslandStoneSpec[])[] = [
  // West shore triad.
  [
    { x: -13.9, y: -0.12, z: 2.7, scale: 1.15, dominant: true },
    { x: -12.55, y: -0.18, z: 3.65, scale: 0.68 },
    { x: -14.85, y: -0.2, z: 1.7, scale: 0.55 },
  ],
  // North-west shelf triad.
  [
    { x: -12.1, y: 0.28, z: -4.7, scale: 1.0, dominant: true },
    { x: -10.95, y: 0.12, z: -5.6, scale: 0.62 },
    { x: -13.05, y: 0.08, z: -3.6, scale: 0.5 },
  ],
  // East point triad.
  [
    { x: 8.4, y: -0.12, z: 3.7, scale: 1.1, dominant: true },
    { x: 9.6, y: -0.22, z: 2.4, scale: 0.66 },
    { x: 7.2, y: -0.24, z: 4.9, scale: 0.54 },
  ],
  // South shore triad.
  [
    { x: 2.5, y: -0.22, z: 7.55, scale: 1.05, dominant: true },
    { x: 1.1, y: -0.12, z: 8.25, scale: 0.6 },
    { x: 3.8, y: -0.3, z: 6.75, scale: 0.5 },
  ],
  // Upper terrace triad, by the path bend below the lighthouse.
  [
    { x: -6.1, y: 1.52, z: -4.25, scale: 0.78, dominant: true },
    { x: -5.0, y: 1.38, z: -3.55, scale: 0.5 },
    { x: -7.15, y: 1.34, z: -5.0, scale: 0.44 },
  ],
];

function createIslandDecoration(season: GardenSeason): Group {
  const root = new Group();
  // Five hero niwaki replace the 21-tree scatter and its shrub understory.
  // Their two instanced draws read as one asymmetric mass at default height.
  root.add(createNiwakiGrove(season));

  const stoneCount = GARDEN_ISLAND_STONE_GROUPINGS.reduce((sum, triad) => sum + triad.length, 0);
  const stones = new InstancedMesh(
    new DodecahedronGeometry(0.8, 0),
    new MeshStandardMaterial({
      color: "#989986",
      flatShading: true,
      roughness: 1,
    }),
    stoneCount,
  );
  let stoneIndex = 0;
  GARDEN_ISLAND_STONE_GROUPINGS.forEach((triad, triadIndex) => {
    // Each triad leans "in conversation": subordinates tilt toward the
    // dominant stone, the dominant tilts a few degrees back toward them.
    const dominant = triad.find((stone) => stone.dominant) ?? triad[0]!;
    // The dominant stone leans a few degrees back toward its subordinates.
    const subordinates = triad.filter((stone) => stone !== dominant);
    const heartX = subordinates.reduce((sum, stone) => sum + stone.x, 0) / Math.max(1, subordinates.length);
    const heartZ = subordinates.reduce((sum, stone) => sum + stone.z, 0) / Math.max(1, subordinates.length);
    triad.forEach((stone, memberIndex) => {
      const seed = `stone.t${triadIndex}.${memberIndex}`;
      const yaw = CAMERA_FACING_YAW + (stableUnit(seed) - 0.5) * (stone.dominant ? 0.24 : 0.9);
      scratchQuaternion.setFromAxisAngle(UP_AXIS, yaw);
      const targetX = stone.dominant ? heartX : dominant.x;
      const targetZ = stone.dominant ? heartZ : dominant.z;
      const leanX = targetX - stone.x;
      const leanZ = targetZ - stone.z;
      const leanLength = Math.max(0.001, Math.hypot(leanX, leanZ));
      const leanAngle = stone.dominant
        ? 0.05
        : 0.08 + stableUnit(`${seed}.lean`) * 0.06;
      scratchLeanAxis.set(leanZ / leanLength, 0, -leanX / leanLength);
      scratchLeanQuaternion.setFromAxisAngle(scratchLeanAxis, leanAngle);
      scratchQuaternion.multiply(scratchLeanQuaternion);
      if (stone.dominant) {
        scratchScale.set(stone.scale, stone.scale * 1.45, stone.scale * 0.92);
      } else {
        scratchScale.set(stone.scale, stone.scale * 0.55, stone.scale * 0.85);
      }
      scratchPosition.set(stone.x, stone.y, stone.z);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      stones.setMatrixAt(stoneIndex, scratchMatrix);
      stoneIndex += 1;
    });
  });
  stones.instanceMatrix.needsUpdate = true;
  root.add(stones);

  const lanternCount = ISLAND_LANTERN_POSITIONS.length;
  const pedestals = new InstancedMesh(
    new CylinderGeometry(0.16, 0.22, 0.72, 6),
    new MeshStandardMaterial({ color: "#807f71", flatShading: true, roughness: 1 }),
    lanternCount,
  );
  pedestals.name = "island-lantern-pedestals";
  const lamps = new InstancedMesh(
    new BoxGeometry(0.34, 0.32, 0.34),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      // Ember level: these are punctuation, never a second beacon.
      emissiveIntensity: 1.15,
      roughness: 0.42,
      toneMapped: false,
    }),
    lanternCount,
  );
  lamps.name = "island-lantern-lamps";
  const caps = new InstancedMesh(
    new ConeGeometry(0.32, 0.25, 4),
    new MeshStandardMaterial({ color: "#696a61", flatShading: true, roughness: 0.9 }),
    lanternCount,
  );
  caps.name = "island-lantern-caps";
  scratchQuaternion.setFromAxisAngle(UP_AXIS, Math.PI / 4);
  ISLAND_LANTERN_POSITIONS.forEach(([x, z], index) => {
    const y = islandTerrainHeight(x, z);
    scratchMatrix.makeTranslation(x, y + 0.36, z);
    pedestals.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, y + LANTERN_LAMP_LOCAL_Y, z);
    lamps.setMatrixAt(index, scratchMatrix);
    scratchPosition.set(x, y + 1.17, z);
    scratchScale.set(1, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    caps.setMatrixAt(index, scratchMatrix);
  });
  pedestals.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  root.add(pedestals, lamps, caps);
  return root;
}

interface NiwakiPadSpec {
  offsetX: number;
  offsetZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  t: number;
  tone: number;
  yaw: number;
}

export interface NiwakiSpec {
  height: number;
  leanX: number;
  leanZ: number;
  pads: readonly NiwakiPadSpec[];
  x: number;
  z: number;
}

/**
 * Five unequal hero pines form one camera-side mass. The first stands inside
 * the rock but reaches beyond the -x/+z waterline at the lower-left edge of
 * the locked view; the other four hold the mass inland.
 */
export const GARDEN_NIWAKI_SPECS: readonly NiwakiSpec[] = [
  {
    height: 8.5,
    leanX: -6.2,
    leanZ: 7.4,
    x: -4.8,
    z: 8.3,
    pads: [
      { t: 0.4, offsetX: -0.35, offsetZ: 0.18, scaleX: 2.35, scaleY: 0.38, scaleZ: 1.22, tone: 0, yaw: -0.28 },
      { t: 0.55, offsetX: 0.6, offsetZ: -0.28, scaleX: 1.72, scaleY: 0.3, scaleZ: 1.02, tone: 1, yaw: 0.16 },
      { t: 0.69, offsetX: -0.7, offsetZ: 0.15, scaleX: 2.58, scaleY: 0.42, scaleZ: 1.35, tone: 0, yaw: -0.12 },
      { t: 0.83, offsetX: 0.42, offsetZ: 0.24, scaleX: 1.92, scaleY: 0.32, scaleZ: 1.08, tone: 1, yaw: 0.25 },
      { t: 0.96, offsetX: -0.2, offsetZ: -0.05, scaleX: 1.28, scaleY: 0.26, scaleZ: 0.76, tone: 0, yaw: -0.34 },
    ],
  },
  {
    height: 7.15,
    leanX: 1.15,
    leanZ: 0.45,
    x: -8,
    z: 5.8,
    pads: [
      { t: 0.48, offsetX: 0.4, offsetZ: -0.15, scaleX: 2.1, scaleY: 0.36, scaleZ: 1.18, tone: 1, yaw: 0.18 },
      { t: 0.72, offsetX: -0.48, offsetZ: 0.2, scaleX: 2.42, scaleY: 0.4, scaleZ: 1.28, tone: 0, yaw: -0.2 },
      { t: 0.95, offsetX: 0.15, offsetZ: -0.08, scaleX: 1.18, scaleY: 0.25, scaleZ: 0.72, tone: 1, yaw: 0.3 },
    ],
  },
  {
    height: 6.35,
    leanX: -0.55,
    leanZ: 0.85,
    x: -4.5,
    z: 4.2,
    pads: [
      { t: 0.42, offsetX: -0.4, offsetZ: 0.1, scaleX: 2.18, scaleY: 0.36, scaleZ: 1.1, tone: 0, yaw: -0.2 },
      { t: 0.57, offsetX: 0.52, offsetZ: -0.25, scaleX: 1.58, scaleY: 0.29, scaleZ: 0.94, tone: 1, yaw: 0.22 },
      { t: 0.71, offsetX: -0.62, offsetZ: 0.2, scaleX: 2.36, scaleY: 0.39, scaleZ: 1.24, tone: 0, yaw: -0.08 },
      { t: 0.84, offsetX: 0.32, offsetZ: 0.18, scaleX: 1.72, scaleY: 0.31, scaleZ: 0.98, tone: 1, yaw: 0.28 },
      { t: 0.96, offsetX: -0.1, offsetZ: 0, scaleX: 1.05, scaleY: 0.23, scaleZ: 0.65, tone: 0, yaw: -0.26 },
    ],
  },
  {
    height: 5.5,
    leanX: 1.05,
    leanZ: 0.45,
    x: -0.8,
    z: 7,
    pads: [
      { t: 0.5, offsetX: 0.35, offsetZ: -0.1, scaleX: 1.86, scaleY: 0.33, scaleZ: 1.04, tone: 1, yaw: 0.15 },
      { t: 0.73, offsetX: -0.45, offsetZ: 0.18, scaleX: 2.12, scaleY: 0.36, scaleZ: 1.15, tone: 0, yaw: -0.22 },
      { t: 0.95, offsetX: 0.1, offsetZ: -0.05, scaleX: 0.96, scaleY: 0.22, scaleZ: 0.62, tone: 1, yaw: 0.34 },
    ],
  },
  {
    height: 4.65,
    leanX: 0.6,
    leanZ: -0.3,
    x: -9,
    z: 8.5,
    pads: [
      { t: 0.42, offsetX: -0.32, offsetZ: 0.12, scaleX: 1.68, scaleY: 0.3, scaleZ: 0.96, tone: 0, yaw: -0.2 },
      { t: 0.56, offsetX: 0.42, offsetZ: -0.18, scaleX: 1.24, scaleY: 0.25, scaleZ: 0.78, tone: 1, yaw: 0.2 },
      { t: 0.7, offsetX: -0.48, offsetZ: 0.16, scaleX: 1.84, scaleY: 0.32, scaleZ: 1.02, tone: 0, yaw: -0.1 },
      { t: 0.84, offsetX: 0.28, offsetZ: 0.14, scaleX: 1.4, scaleY: 0.27, scaleZ: 0.84, tone: 1, yaw: 0.27 },
      { t: 0.96, offsetX: -0.08, offsetZ: -0.02, scaleX: 0.82, scaleY: 0.2, scaleZ: 0.54, tone: 0, yaw: -0.3 },
    ],
  },
];

function niwakiPoint(spec: NiwakiSpec, t: number): Vector3 {
  const bend = t * t * (1.08 - t * 0.08);
  return new Vector3(
    spec.x + spec.leanX * bend,
    islandTerrainHeight(spec.x, spec.z) + spec.height * t,
    spec.z + spec.leanZ * bend,
  );
}

function setCylinderBetween(
  mesh: InstancedMesh,
  index: number,
  from: Vector3,
  to: Vector3,
  radius: number,
): void {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const rotation = new Quaternion().setFromUnitVectors(UP_AXIS, direction.normalize());
  scratchScale.set(radius, length, radius);
  scratchMatrix.compose(midpoint, rotation, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
}

/**
 * The niwaki carry no analytical meaning. Five large, unequal silhouettes
 * displace the old small-tree/shrub carpet; the first leans out over the
 * camera-side water. Trunks/branches and foliage remain two instanced draws.
 */
function createNiwakiGrove(season: GardenSeason): Group {
  const root = new Group();
  root.name = "island-niwaki";
  const trunkCount = GARDEN_NIWAKI_SPECS.reduce((sum, spec) => sum + 5 + spec.pads.length, 0);
  const padCount = GARDEN_NIWAKI_SPECS.reduce((sum, spec) => sum + spec.pads.length, 0);
  const matsuba = new Color(HARBOR_PALETTE.aurora_green)
    .lerp(new Color(HARBOR_PALETTE.timber_dark), 0.42);
  const matsubaLight = matsuba.clone().lerp(new Color(HARBOR_PALETTE.fog_day), 0.13);
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.72, 1, 1, 7),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.timber_dark,
      flatShading: true,
      roughness: 1,
    }),
    trunkCount,
  );
  trunks.name = "island-niwaki-trunks";
  const foliageMaterial = new MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.98 });
  patchGardenInstancedWindSway(foliageMaterial, 1, 0.76);
  const foliage = new InstancedMesh(
    new SphereGeometry(1, 10, 6),
    foliageMaterial,
    padCount,
  );
  foliage.name = "island-niwaki-pads";
  let trunkIndex = 0;
  let padIndex = 0;
  const padSway = new Float32Array(padCount);
  GARDEN_NIWAKI_SPECS.forEach((spec, pineIndex) => {
    const nodes = [0, 0.23, 0.46, 0.68, 0.84, 1].map((t) => niwakiPoint(spec, t));
    for (let index = 0; index < nodes.length - 1; index += 1) {
      setCylinderBetween(
        trunks,
        trunkIndex,
        nodes[index]!,
        nodes[index + 1]!,
        0.29 - index * 0.025,
      );
      trunkIndex += 1;
    }
    spec.pads.forEach((pad) => {
      const stem = niwakiPoint(spec, Math.max(0.25, pad.t - 0.08));
      const centre = niwakiPoint(spec, pad.t).add(new Vector3(pad.offsetX, 0, pad.offsetZ));
      setCylinderBetween(trunks, trunkIndex, stem, centre, 0.085);
      trunkIndex += 1;
      scratchQuaternion.setFromAxisAngle(UP_AXIS, pad.yaw);
      scratchScale.set(pad.scaleX, pad.scaleY, pad.scaleZ);
      scratchMatrix.compose(centre, scratchQuaternion, scratchScale);
      foliage.setMatrixAt(padIndex, scratchMatrix);
      const color = (pad.tone ? matsubaLight : matsuba).clone();
      if (season === "autumn" && pineIndex === GARDEN_NIWAKI_SPECS.length - 1) {
        color.lerp(new Color(HARBOR_PALETTE.vermillion), 0.42);
      } else if (season === "winter") {
        const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
        color.lerp(new Color(luma, luma, luma), 0.18);
      }
      foliage.setColorAt(padIndex, color);
      padSway[padIndex] = 0.74 + stableUnit(`niwaki-pad-sway.${pineIndex}.${padIndex}`) * 0.48;
      padIndex += 1;
    });
  });
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  foliage.geometry.setAttribute("aGardenSway", new InstancedBufferAttribute(padSway, 1));
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  for (const mesh of [trunks, foliage]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  root.add(trunks, foliage);
  return root;
}

/** Writes the one weather plan into the existing niwaki-pad draw. */
export function updateGardenNiwakiWind(
  decoration: Group,
  weather: WeatherPlan,
  reducedMotion: boolean,
): void {
  const foliage = decoration.getObjectByName("island-niwaki-pads") as InstancedMesh<BufferGeometry, MeshStandardMaterial> | undefined;
  if (foliage) updateGardenInstancedWindSway(foliage.material, weather, reducedMotion);
}

/**
 * The keeper's cottage: foundation, walls, roof, one lit window. That is the
 * whole accessory list, and W3.1 (The Great Quieting) is why — the paper-
 * lantern string along the east eave (three instanced lanterns on two sagging
 * cords, shipped as "I4 warm micro-life") is deleted. It was a fifth glow
 * vocabulary spent on a detail the fixed 30° camera reads at a handful of
 * pixels, and at night it put three more warm points beside the one that says
 * something: the lit window, which is the keeper being home. One light per
 * building; the cottage says it with the window.
 */
function createKeeperCottage(): Group {
  const root = new Group();
  root.name = "keeper-cottage";
  root.position.set(-10, islandTerrainHeight(-10, -1), -1);
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
  window.name = "keeper-cottage-lit-window";
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

export const GARDEN_POND_CENTER = { x: 1.2, z: 5.2 } as const;
const POND_CENTER_X = GARDEN_POND_CENTER.x;
const POND_CENTER_Z = GARDEN_POND_CENTER.z;
const POND_YAW = -0.18;

/**
 * The two image bearings in the pond's local XY plane. Exported as a small,
 * deterministic geometry contract: the tower streak must point at the actual
 * tower root, while the moon streak must agree with the one light arc.
 * The focused test derives both again from those canonical sources, so a
 * future light or tower move cannot leave these shader constants stale.
 */
export const GARDEN_POND_REFLECTION_AXES = {
  moon: new Vector2(-0.19572, -0.98066),
  tower: new Vector2(-0.88397, 0.46754),
} as const;

interface GardenPondReflectionUniforms {
  uGardenPondMoonColor: { value: Color };
  /** x = tower ink, y = moon light. */
  uGardenPondStrength: { value: Vector2 };
}

export interface GardenPondReflection {
  update: (phase: DayCyclePhase) => void;
}

function pondReflectionGlsl(): string {
  return /* glsl */ `
    vec2 p=vGardenPondPosition;
    vec2 tp=vec2(dot(p,vec2(-.88397,.46754)),dot(p,vec2(-.46754,-.88397)));
    float t=(2.8-tp.x)/5.6;
    float w=mix(.78,.22,t)+.2*smoothstep(.66,.72,t)*(1.-smoothstep(.84,.9,t));
    float a=max(fwidth(tp.y),.012);
    float tm=smoothstep(0.,.035,t)*(1.-smoothstep(.965,1.,t))
      *(1.-smoothstep(w-a,w+a,abs(tp.y)))
      *(.62+.38*smoothstep(-.3,.5,sin(tp.x*17.+tp.y*5.)));
    vec2 mp=vec2(dot(p,vec2(-.19572,-.98066)),dot(p,vec2(.98066,-.19572)));
    float mm=exp(-mp.y*mp.y/.16)*(1.-smoothstep(2.4,3.35,abs(mp.x)))
      *mix(.38,1.,smoothstep(.1,.78,sin(mp.x*19.+mp.y*4.)*.5+.5));
    outgoingLight*=1.-clamp(tm*uGardenPondStrength.x,0.,.32);
    outgoingLight += uGardenPondMoonColor
      *clamp(mm*uGardenPondStrength.y,0.,.34);
  `;
}

function patchGardenPondReflection(
  material: MeshStandardMaterial,
  uniforms: GardenPondReflectionUniforms,
): void {
  const previousCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vGardenPondPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGardenPondPosition = position.xy;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGardenPondPosition;
uniform vec3 uGardenPondMoonColor;
uniform vec2 uGardenPondStrength;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `${pondReflectionGlsl()}\n#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "garden-pond-reflection-v1";
}

function createIslandReflectionPond(): { reflection: GardenPondReflection; root: Group } {
  const root = new Group();
  root.name = "island-reflection-basin";
  root.position.set(POND_CENTER_X, islandTerrainHeight(POND_CENTER_X, POND_CENTER_Z) + 0.08, POND_CENTER_Z);
  root.rotation.y = POND_YAW;
  const uniforms: GardenPondReflectionUniforms = {
    uGardenPondMoonColor: { value: MOON_COLOR.clone() },
    uGardenPondStrength: { value: new Vector2(0.08, 0) },
  };
  const pondMaterial = new MeshStandardMaterial({
    color: "#244c4f",
    depthWrite: false,
    metalness: 0.12,
    opacity: 0.82,
    roughness: 0.18,
    side: DoubleSide,
    transparent: true,
  });
  patchGardenPondReflection(pondMaterial, uniforms);
  const pondGeometry = new CircleGeometry(3.6, 40);
  pondGeometry.scale(1, 0.68, 1);
  const pond = new Mesh(pondGeometry, pondMaterial);
  pond.name = "island-reflection-pond-skin";
  pond.rotation.x = -Math.PI / 2;
  // The koi draw first and the translucent skin washes over them; opaque rim
  // and stepping stones still write depth, so no fish appears through stone.
  pond.renderOrder = 5;
  root.add(pond);
  const rimGeometry = new RingGeometry(3.46, 3.78, 40);
  rimGeometry.scale(1, 0.68, 1);
  const rim = new Mesh(
    rimGeometry,
    new MeshStandardMaterial({
      color: "#a8a590",
      flatShading: true,
      roughness: 1,
      side: DoubleSide,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.035;
  root.add(rim);
  const koi = createGardenKoi();
  root.add(koi.mesh);
  const reflection: GardenPondReflection = {
    update: (phase) => {
      uniforms.uGardenPondStrength.value.set(
        phase.daylight * 0.1 + phase.dusk * 0.3 + phase.night * 0.2,
        phase.night * 0.34 + phase.dusk * 0.19,
      );
    },
  };
  return { reflection, root };
}

/**
 * One authored route through the precinct. The end points are contracts: the
 * stair head is the quay threshold and the final point is the pavilion base.
 * Intermediate bends make one broad S without entering the reflection basin.
 */
export const GARDEN_PATH_SWEEP_POINTS: readonly { x: number; z: number }[] = [
  { x: -2, z: -4.6 },
  { x: 4, z: -3 },
  { x: 5.5, z: 0.5 },
  { x: 0.5, z: 2.4 },
  { x: 4.4, z: 2.35 },
] as const;

/**
 * The continuous pale path displaces both the seven box steps and the small
 * pavilion gravel apron. One ribbon is intentionally large enough to remain
 * a line after the 16px blur audit; coarse relief and the existing normal map
 * keep it gravel rather than paint.
 */
function createGardenPathSweep(): Mesh<BufferGeometry, MeshStandardMaterial> {
  const curve = new CatmullRomCurve3(
    GARDEN_PATH_SWEEP_POINTS.map(({ x, z }) => new Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const segments = 56;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const gravel = STONE_PALE.clone().lerp(new Color(HARBOR_PALETTE.fog_day), 0.34);
  const color = new Color();
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
    const normalX = -tangent.z / tangentLength;
    const normalZ = tangent.x / tangentLength;
    const halfWidth = 1.28 + Math.sin(t * Math.PI * 3.2) * 0.12;
    for (const side of [-1, 1] as const) {
      const x = point.x + normalX * halfWidth * side;
      const z = point.z + normalZ * halfWidth * side;
      const rake = Math.cos(t * Math.PI * 42 + side * 0.35);
      let y = islandTerrainHeight(x, z) + 0.18 + rake * 0.025;
      if (t < 0.1) {
        y = Math.max(y, QUAY_STAIR_TOP_Y + 0.06 - t * 1.4);
      }
      positions.push(x, y, z);
      uvs.push((side + 1) / 2, t * 7);
      color.copy(gravel).multiplyScalar(
        (0.94 + (rake + 1) * 0.025) * (1 - gardenGroundWear(x, z) * 0.08),
      );
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({
      flatShading: false,
      normalMap: createRakedGravelNormalTexture(),
      roughness: 1,
      vertexColors: true,
    }),
  );
  mesh.name = "island-path-sweep";
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// W7b — Pharos precinct dressing (2026-07-24 wonder plan, decision D8)
// ---------------------------------------------------------------------------

// Two obelisks — Empereur's precinct finds — flanking the head of the cut
// stone stair from the quay, as its gateposts.
//
// W3.1 (The Great Quieting): they used to stand free on the middle shelf at
// (-9.2, 4.1) and (-4.8, 4.1), a third monument competing with the pavilion
// and the tower for the same seaward read. Nothing is deleted: the pair is
// TRANSFORMED into the stair's threshold, where it earns its stone by giving
// the climb from the water a gate to pass through — one composition instead of
// two. Seated on the rock the stair head lands on, squared to the flight, set
// just outside the cheek walls, and deliberately unequal (fukinsei — a matched
// pair reads as a monument, an unmatched one as a place).
const OBELISK_STAIR_OFFSET = 1.55;
const OBELISK_HEIGHT_SCALES = [1, 0.86] as const;

/**
 * The gatepost pair, derived from the stair itself so the two can never drift
 * apart: seated on the rock at the stair head, squared to the flight, one to
 * each side just outside the cheek walls.
 */
export function gardenPrecinctObeliskGateposts(): {
  scale: number;
  x: number;
  y: number;
  yaw: number;
  z: number;
}[] {
  const yaw = Math.atan2(
    QUAY_STAIR_END.x - QUAY_STAIR_START.x,
    QUAY_STAIR_END.z - QUAY_STAIR_START.z,
  );
  const acrossX = Math.cos(yaw) * OBELISK_STAIR_OFFSET;
  const acrossZ = -Math.sin(yaw) * OBELISK_STAIR_OFFSET;
  return OBELISK_HEIGHT_SCALES.map((scale, index) => {
    const side = index === 0 ? 1 : -1;
    const x = QUAY_STAIR_END.x + side * acrossX;
    const z = QUAY_STAIR_END.z + side * acrossZ;
    // Sunk a finger into the rock: nothing in this garden sits ON the ground.
    return { scale, x, y: islandTerrainHeight(x, z) - 0.05, yaw, z };
  });
}

function createPrecinctObelisks(): Group {
  const root = new Group();
  root.name = "pharos-precinct-obelisks";
  const stoneMaterial = new MeshStandardMaterial({
    color: "#d2cba9",
    flatShading: true,
    roughness: 0.94,
  });
  // Bronze-gilt pyramidion tips carrying the same warm emissive whisper as
  // the crowning Zeus Soter (the vermillion accent stays spent on the flame).
  const giltMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_warm,
    emissive: HARBOR_PALETTE.lantern_glow,
    emissiveIntensity: 0.08,
    metalness: 0.82,
    roughness: 0.32,
  });
  // Geometry budget: the pair bakes into two merged meshes (stone + gilt).
  // Four-sided tapered cylinders read as square shafts; the stair's own yaw
  // squares their faces with the flight they now gate.
  const stoneParts: BufferGeometry[] = [];
  const giltParts: BufferGeometry[] = [];
  for (const post of gardenPrecinctObeliskGateposts()) {
    const place = (geometry: BufferGeometry, localY: number) => {
      // Faces squared to the flight below, so the pair reads as the stair's
      // gate rather than as two stones that happen to stand near it.
      geometry.rotateY(post.yaw);
      geometry.translate(post.x, post.y + localY, post.z);
    };
    const shaftHeight = 3.05 * post.scale;
    const plinth = new BoxGeometry(0.74, 0.3, 0.74);
    place(plinth, 0.15);
    stoneParts.push(plinth);
    const shaft = new CylinderGeometry(0.17, 0.27, shaftHeight, 4);
    place(shaft, 0.3 + shaftHeight / 2);
    stoneParts.push(shaft);
    const cap = new ConeGeometry(0.26, 0.42, 4);
    place(cap, 0.3 + shaftHeight + 0.21);
    giltParts.push(cap);
  }
  const stone = new Mesh(mergeGeometries(stoneParts, false), stoneMaterial);
  stone.name = "pharos-obelisk-stone";
  const caps = new Mesh(mergeGeometries(giltParts, false), giltMaterial);
  caps.name = "pharos-obelisk-caps";
  for (const part of [stone, caps]) {
    part.castShadow = true;
    part.receiveShadow = true;
  }
  root.add(stone, caps);
  return root;
}

function hypot2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

// ---------------------------------------------------------------------------
// W4.9 — the island under the Wonder (grand-scale revamp 2026-07-25)
//
// The concept render's rock is layered, eroded and tree-covered, with cut
// stone stairs climbing to the tower; the tiers alone read as a smooth green
// mass. Everything below is additive and instanced: sea cliffs at the rim,
// scree gathered under them, a cut-stone stair from the quay head to the
// lighthouse terrace, and a denser planting of shrubs and grass. The tier
// silhouette, the Sakuteiki stone groupings and the garden path are untouched.
// ---------------------------------------------------------------------------

const CLIFF_BASE_Y = WATER_LEVEL - 0.4;
const CLIFF_HEIGHT = 4.2;
// One face toward the north-east Danger field (+x/-z from the island). Three
// former cliff runs and their all-round talus read as a boulder border; this
// single longer, taller run reads as one exposed geological plane.
const SEA_CLIFF_RUNS: readonly (readonly [number, number])[] = [
  [4.72, 5.4],
];
const CLIFF_RIM_X = 17.6;
const CLIFF_RIM_Z = 13.2;

/**
 * Steep fractured rock plates standing along the island rim. Their outward
 * face is displaced and their inboard face is left flat so each plate beds
 * into the tier behind it; the wet→pale ramp and the bedding shade are baked
 * per vertex, and every instance shares one base height so the strata line up
 * across the whole face.
 */
function createDangerRockFace(): InstancedMesh {
  const placements: { sx: number; sy: number; x: number; yaw: number; z: number }[] = [];
  SEA_CLIFF_RUNS.forEach(([start, end], runIndex) => {
    const steps = Math.max(1, Math.round((end - start) / 0.09));
    for (let index = 0; index < steps; index += 1) {
      const seed = `cliff.${runIndex}.${index}`;
      const theta = start + ((index + 0.5) / steps) * (end - start);
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      // Outward normal of the rim ellipse, so each plate presents its face to
      // the open sea rather than to the tangent.
      const yaw = Math.atan2(CLIFF_RIM_Z * cos, CLIFF_RIM_X * sin);
      const arcStep = hypot2(CLIFF_RIM_X * sin, CLIFF_RIM_Z * cos) * ((end - start) / steps);
      const reach = 0.97 + stableUnit(`${seed}.r`) * 0.06;
      placements.push({
        sx: arcStep * 1.12,
        // Held near 1 so the bedding planes stay level plate to plate; the
        // silhouette variety comes from the baked crag and the yaw instead.
        sy: 0.94 + stableUnit(`${seed}.h`) * 0.14,
        x: 0.6 + cos * CLIFF_RIM_X * reach,
        yaw,
        z: 1.2 + sin * CLIFF_RIM_Z * reach,
      });
    }
  });
  const cliffs = new InstancedMesh(
    cliffSlabGeometry(),
    new MeshStandardMaterial({ flatShading: true, roughness: 0.97, vertexColors: true }),
    placements.length,
  );
  cliffs.name = "island-danger-rock-face";
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  placements.forEach((placement, index) => {
    scratchQuaternion.setFromAxisAngle(UP_AXIS, placement.yaw);
    scratchPosition.set(placement.x, CLIFF_BASE_Y + (CLIFF_HEIGHT * placement.sy) / 2, placement.z);
    scratchScale.set(placement.sx, placement.sy, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    cliffs.setMatrixAt(index, scratchMatrix);
  });
  cliffs.instanceMatrix.needsUpdate = true;
  return cliffs;
}

function cliffSlabGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(1, CLIFF_HEIGHT, 1.15, 2, 6, 1);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const jitter = stableUnit(
      `cliff.v.${Math.round(x * 24)}.${Math.round(y * 24)}.${Math.round(z * 24)}`,
    ) - 0.5;
    // Fracture the seaward face only; the inboard face stays flat so the plate
    // buries cleanly in the tier it leans against.
    const seaward = Math.max(0, z / 0.575);
    positions.setZ(index, z + jitter * 0.44 * seaward);
    positions.setX(index, x + jitter * 0.14);
    stoneRampColor(CLIFF_BASE_Y + CLIFF_HEIGHT / 2 + y, color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  positions.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// The cut-stone stair: quay head at the waterline on the lee (-z) shore, up to
// the +x edge of the lighthouse terrace. The line is chosen to clear the
// reflection pond, the keeper cottage, the upper stone triad and the garden
// path, so the stair is a second, formal route to the tower rather than a
// duplicate of the winding one.
const QUAY_STAIR_START = { x: 16.9, z: -5.79 } as const;
const QUAY_STAIR_END = { x: -2.0, z: -4.6 } as const;
// The stair head is the precinct's threshold — the obelisk gateposts and their
// planting keep-outs are derived from it, so it is contract, not decoration.
export {
  QUAY_STAIR_END as GARDEN_QUAY_STAIR_HEAD,
  QUAY_STAIR_TOP_Y as GARDEN_QUAY_STAIR_TOP_Y,
};
const QUAY_STAIR_WIDTH = 1.55;
const QUAY_STAIR_TREAD = 0.44;
const QUAY_STAIR_TOP_Y = 2.62;

function quayStairTreads(): { x: number; y: number; z: number }[] {
  const dx = QUAY_STAIR_END.x - QUAY_STAIR_START.x;
  const dz = QUAY_STAIR_END.z - QUAY_STAIR_START.z;
  const run = Math.hypot(dx, dz);
  const count = Math.max(2, Math.round(run / QUAY_STAIR_TREAD));
  const treads: { x: number; y: number; z: number }[] = [];
  let y = WATER_LEVEL + 0.06;
  // Constant nominal rise, raised to meet the rock wherever the tier face
  // climbs faster: flights on the open slope, landings where it flattens.
  const rise = (QUAY_STAIR_TOP_Y - y) / count;
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const x = QUAY_STAIR_START.x + dx * t;
    const z = QUAY_STAIR_START.z + dz * t;
    y = Math.max(y + rise, islandTerrainHeight(x, z) + 0.07);
    treads.push({ x, y, z });
  }
  return treads;
}

function createQuayStair(): Group {
  const root = new Group();
  root.name = "island-quay-stair";
  const treads = quayStairTreads();
  const yaw = Math.atan2(
    QUAY_STAIR_END.x - QUAY_STAIR_START.x,
    QUAY_STAIR_END.z - QUAY_STAIR_START.z,
  );
  scratchQuaternion.setFromAxisAngle(UP_AXIS, yaw);

  const steps = new InstancedMesh(
    new BoxGeometry(QUAY_STAIR_WIDTH, 0.26, QUAY_STAIR_TREAD * 1.12),
    new MeshStandardMaterial({ color: "#a89e84", flatShading: true, roughness: 1 }),
    treads.length,
  );
  steps.name = "island-quay-stair-treads";
  steps.castShadow = true;
  steps.receiveShadow = true;
  treads.forEach((tread, index) => {
    scratchPosition.set(tread.x, tread.y - 0.13, tread.z);
    // Worn treads: a little width jitter keeps the flight from reading as an
    // extruded ramp at overview zoom.
    scratchScale.set(0.92 + stableUnit(`stair.w.${index}`) * 0.16, 1, 1);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    steps.setMatrixAt(index, scratchMatrix);
  });
  steps.instanceMatrix.needsUpdate = true;

  // Cheek walls: one low coping block per tread per side, riding the same
  // profile, so the flight reads as cut into the rock rather than laid on it.
  const cheeks = new InstancedMesh(
    new BoxGeometry(0.3, 0.36, QUAY_STAIR_TREAD * 1.12),
    new MeshStandardMaterial({ color: "#8e876f", flatShading: true, roughness: 1 }),
    treads.length * 2,
  );
  cheeks.name = "island-quay-stair-cheeks";
  cheeks.castShadow = true;
  cheeks.receiveShadow = true;
  const across = QUAY_STAIR_WIDTH / 2 + 0.15;
  treads.forEach((tread, index) => {
    for (const side of [-1, 1] as const) {
      scratchPosition.set(
        tread.x + side * across * Math.cos(yaw),
        tread.y + 0.06,
        tread.z - side * across * Math.sin(yaw),
      );
      scratchScale.set(1, 1, 1);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      cheeks.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), scratchMatrix);
    }
  });
  cheeks.instanceMatrix.needsUpdate = true;

  root.add(steps, cheeks);
  return root;
}

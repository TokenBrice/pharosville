import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NOBORI_CLOTH_ASPECT } from "../systems/dock-layout";
import { HARBOR_DERIVED_PALETTE, HARBOR_PALETTE } from "../systems/palette";
import { gardenGustAtWorldPosition, type WeatherPlan } from "../systems/weather";
import {
  CHAIN_FLAG_ATLAS_COLUMNS,
  CHAIN_FLAG_ATLAS_SIZE_PX,
  CHAIN_FLAG_CELL_HEIGHT_PX,
  CHAIN_FLAG_CELL_WIDTH_PX,
  gardenChainFlagAtlas,
} from "./garden-chain-flag";
import {
  type DockRecipe,
  type DockVisual,
  type HarborBucket,
  type HarborBucketPart,
  type HarborPropInstance,
  type HarborPropKind,
} from "./garden-docks";
import { applyGardenHeightFog } from "./garden-height-fog";
import { patchGardenLanternKindling } from "./garden-lanterns";

const BUCKETS: readonly HarborBucket[] = [
  "timber",
  "stone",
  "metal",
  "accent",
  "wall",
  "window",
  "roof",
];
const PROP_KINDS: readonly HarborPropKind[] = ["post", "plank", "bollard", "piling", "netRack", "reedClump"];

/**
 * Station shoji are land-bound embers, not extra reflection pools. They share
 * one emissive bucket, kindled per station in the evening's order (H-A),
 * while garden-lanterns keeps sole ownership of the limited water-lane budget.
 *
 * This is the value the bucket is BORN with, before the first frame:
 * `updateDayCycle` drives the material every frame off `content.harborBatch`
 * (dark by day, 1.75 dusk / 2.10 night before kindling).
 */
export const HARBOR_WINDOW_EMBER_INTENSITY = 1.6;

type BucketMeshes = Record<HarborBucket, Mesh | null>;
type PropMeshes = Record<HarborPropKind, InstancedMesh | null>;
type ColorRange = { count: number; start: number };

export interface GardenHarborBatch {
  root: Group;
  docks: DockVisual[];
  bucketMeshes: BucketMeshes;
  fineDetailBucketMeshes: BucketMeshes;
  propMeshes: PropMeshes;
  fineDetailPropMeshes: PropMeshes;
  flags: InstancedMesh;
  setFineDetailVisible(visible: boolean): void;
  setDockAccent(chainId: string, color: Color): void;
  /**
   * The harbour's one wind on every nobori and noren (harbour-2/-6): travelling
   * folds from pole to free edge, each cloth taking the shared gust front as it
   * arrives at its pole, and every banner leaning the same way. One small
   * per-frame attribute upload; reduced motion rests on one composed pose.
   */
  updateFlagWind(timeSeconds: number, weather: Pick<WeatherPlan, "wind">, reducedMotion: boolean): void;
  dispose(): void;
}

export function createGardenHarborBatch(recipes: readonly DockRecipe[]): GardenHarborBatch {
  const root = new Group();
  root.name = "harbor-batch";
  const renderRecipes = recipes;
  const docks = recipes.map((recipe): DockVisual => {
    const anchor = new Group();
    anchor.name = `dock-anchor-${recipe.dock.chainId}`;
    anchor.position.copy(recipe.anchorPosition);
    anchor.rotation.y = recipe.anchorRotationY;
    const fineDetail = new Group();
    fineDetail.name = "dock-fine-detail";
    anchor.add(fineDetail);
    return { fineDetail, recipe, root: anchor };
  });

  const accentRanges = new Map<string, Array<{ bucket: HarborBucket; range: ColorRange }>>();
  const bucketMeshes = createBucketMeshes(root, renderRecipes, false, accentRanges);
  const fineDetailBucketMeshes = createBucketMeshes(root, renderRecipes, true);
  const propMeshes = createPropMeshes(root, recipes, false);
  const fineDetailPropMeshes = createPropMeshes(root, recipes, true);
  const fineDetailMeshes = [
    ...Object.values(fineDetailBucketMeshes),
    ...Object.values(fineDetailPropMeshes),
  ].filter((mesh): mesh is Mesh | InstancedMesh => mesh !== null);
  for (const mesh of fineDetailMeshes) mesh.visible = false;
  const { flags, updateFlagWind } = createFlags(recipes);
  root.add(flags);
  applyGardenHeightFog(root, { epistemicHaze: "quay" });

  return {
    bucketMeshes,
    dispose() {
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
        if (object instanceof InstancedMesh) {
          object.instanceMatrix.dispose();
          object.instanceColor?.dispose();
          for (const attribute of Object.values(object.geometry.attributes)) {
            if (attribute instanceof InstancedBufferAttribute) attribute.dispose();
          }
          object.dispose();
        }
      });
      for (const recipe of renderRecipes) {
        for (const part of recipe.parts) part.geometry.dispose();
      }
      root.clear();
    },
    docks,
    fineDetailBucketMeshes,
    fineDetailPropMeshes,
    flags,
    propMeshes,
    root,
    setDockAccent(chainId, color) {
      for (const { bucket, range } of accentRanges.get(chainId) ?? []) {
        const mesh = bucketMeshes[bucket];
        if (!mesh) continue;
        const attribute = mesh.geometry.getAttribute("color") as Float32BufferAttribute;
        for (let index = range.start; index < range.start + range.count; index += 1) {
          attribute.setXYZ(index, color.r, color.g, color.b);
        }
        attribute.needsUpdate = true;
      }
      const dock = docks.find((candidate) => candidate.recipe.dock.chainId === chainId);
      dock?.recipe.accentColor.copy(color);
    },
    setFineDetailVisible(visible) {
      for (const mesh of fineDetailMeshes) mesh.visible = visible;
    },
    updateFlagWind,
  };
}


function emptyBuckets(): BucketMeshes {
  return {
    accent: null,
    metal: null,
    roof: null,
    stone: null,
    timber: null,
    wall: null,
    window: null,
  };
}

function emptyProps(): PropMeshes {
  return { bollard: null, netRack: null, piling: null, plank: null, post: null, reedClump: null };
}

function createBucketMeshes(
  root: Group,
  recipes: readonly DockRecipe[],
  fineDetail: boolean,
  accentRanges?: Map<string, Array<{ bucket: HarborBucket; range: ColorRange }>>,
): BucketMeshes {
  const result = emptyBuckets();
  for (const bucket of BUCKETS) {
    const entries: Array<{ part: HarborBucketPart; recipe: DockRecipe }> = [];
    for (const recipe of recipes) {
      for (const part of recipe.parts) {
        if (part.bucket === bucket && part.fineDetail === fineDetail) entries.push({ part, recipe });
      }
    }
    if (entries.length === 0) continue;
    const geometries: BufferGeometry[] = [];
    let castsShadow = false;
    for (const entry of entries) {
      const chainId = entry.recipe.dock.chainId;
      const geometry = entry.part.geometry.clone();
      normalizeGeometryIndex(geometry, entries.map(({ part }) => part.geometry));
      geometry.applyMatrix4(entry.recipe.rootMatrix);
      const count = geometry.getAttribute("position").count;
      const colorSize = bucket === "wall" ? 4 : 3;
      const colors = new Float32Array(count * colorSize);
      const opacity = Number(entry.part.geometry.userData.harborOpacity ?? 1);
      for (let index = 0; index < count; index += 1) {
        colors[index * colorSize] = entry.part.color.r;
        colors[index * colorSize + 1] = entry.part.color.g;
        colors[index * colorSize + 2] = entry.part.color.b;
        if (colorSize === 4) colors[index * colorSize + 3] = opacity;
      }
      geometry.setAttribute("color", new Float32BufferAttribute(colors, colorSize));
      if (bucket === "window") {
        geometry.setAttribute("aKindleOrder", new Float32BufferAttribute(new Float32Array(count).fill(entry.recipe.kindleOrder.shoji), 1));
      }
      if (bucket === "accent" && !fineDetail && accentRanges) {
        const ranges = accentRanges.get(chainId) ?? [];
        const start = geometries.reduce((sum, candidate) => sum + candidate.getAttribute("position").count, 0);
        ranges.push({ bucket, range: { count, start } });
        accentRanges.set(chainId, ranges);
      }
      castsShadow ||= entry.part.castShadow;
      geometries.push(geometry);
    }
    const merged = mergeCompatible(geometries);
    for (const geometry of geometries) geometry.dispose();
    const mesh = new Mesh(merged, bucketMaterial(bucket));
    mesh.name = !fineDetail && bucket === "window"
      ? "station-lit-screens"
      : `${fineDetail ? "harbor-fine" : "harbor"}-${bucket}`;
    mesh.castShadow = !fineDetail && castsShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    result[bucket] = mesh;
    root.add(mesh);
  }
  return result;
}

function normalizeGeometryIndex(geometry: BufferGeometry, all: readonly BufferGeometry[]): void {
  const indexed = all.filter((candidate) => candidate.index !== null).length;
  if (indexed !== 0 && indexed !== all.length && geometry.index !== null) {
    geometry.copy(geometry.toNonIndexed());
  }
}

function mergeCompatible(geometries: BufferGeometry[]): BufferGeometry {
  const indexed = geometries.filter((geometry) => geometry.index !== null).length;
  const compatible = indexed === 0 || indexed === geometries.length
    ? geometries
    : geometries.map((geometry) => geometry.index === null ? geometry : geometry.toNonIndexed());
  return mergeGeometries(compatible, false)!;
}

function bucketMaterial(bucket: HarborBucket): MeshStandardMaterial {
  switch (bucket) {
    case "timber": return new MeshStandardMaterial({ color: "#ffffff", roughness: 0.88, vertexColors: true });
    case "stone": return new MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.97, vertexColors: true });
    case "metal": return new MeshStandardMaterial({ color: "#ffffff", metalness: 0.42, roughness: 0.62, vertexColors: true });
    case "accent":
    case "roof": return new MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.86, side: DoubleSide, vertexColors: true });
    case "wall": return new MeshStandardMaterial({ color: "#ffffff", flatShading: true, roughness: 0.96, transparent: true, vertexColors: true });
    case "window": {
      const material = new MeshStandardMaterial({ color: "#ffffff", emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: HARBOR_WINDOW_EMBER_INTENSITY, envMapIntensity: 0.3, roughness: 0.9, toneMapped: false, vertexColors: true });
      patchGardenLanternKindling(material, "attribute");
      return material;
    }
  }
}

function createPropMeshes(root: Group, recipes: readonly DockRecipe[], fineDetail: boolean): PropMeshes {
  const result = emptyProps();
  for (const kind of PROP_KINDS) {
    const instances: Array<{ prop: HarborPropInstance; rootMatrix: Matrix4 }> = [];
    for (const recipe of recipes) for (const prop of recipe.props) {
      if (prop.kind === kind && prop.fineDetail === fineDetail) instances.push({ prop, rootMatrix: recipe.rootMatrix });
    }
    if (instances.length === 0) continue;
    const mesh = new InstancedMesh(propGeometry(kind), propMaterial(kind), instances.length);
    mesh.name = !fineDetail && kind === "post"
      ? "dock-posts"
      : `${fineDetail ? "harbor-fine" : "harbor"}-${kind}`;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    instances.forEach(({ prop, rootMatrix }, index) => {
      mesh.setMatrixAt(index, new Matrix4().multiplyMatrices(rootMatrix, prop.matrix));
      if (prop.color) mesh.setColorAt(index, prop.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !fineDetail;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    result[kind] = mesh;
    root.add(mesh);
  }
  return result;
}

function propGeometry(kind: HarborPropKind): BufferGeometry {
  switch (kind) {
    case "post": return new CylinderGeometry(1, 1.2, 1, 6);
    case "plank": return new BoxGeometry(0.1, 0.06, 1);
    case "bollard": return new CylinderGeometry(0.1, 0.14, 0.44, 6);
    case "piling": return new CylinderGeometry(0.075, 0.095, 2.6, 6);
    case "netRack": return netRackGeometry();
    case "reedClump": return reedClumpGeometry();
  }
}

function propMaterial(kind: HarborPropKind): MeshStandardMaterial {
  switch (kind) {
    case "post": return new MeshStandardMaterial({ color: "#5c4d3c", metalness: 0.24, roughness: 0.78 });
    case "plank": return new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.95 });
    case "bollard": return new MeshStandardMaterial({ color: "#6d5d49", metalness: 0.42, roughness: 0.62 });
    case "piling": return new MeshStandardMaterial({ color: new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.iron_dark), 0.45), flatShading: true, roughness: 0.95 });
    case "netRack": return new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.96 });
    case "reedClump": return new MeshStandardMaterial({ color: "#66704a", flatShading: true, roughness: 1 });
  }
}

function netRackGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const x of [-0.5, 0.5]) {
    const post = new BoxGeometry(0.09, 1.45, 0.09);
    post.translate(x, 0.72, 0);
    parts.push(post);
  }
  const rail = new BoxGeometry(1.1, 0.09, 0.09);
  rail.translate(0, 1.38, 0);
  parts.push(rail);
  for (let index = 0; index < 4; index += 1) {
    const twine = new BoxGeometry(0.035, 1.0, 0.035);
    twine.rotateZ(index % 2 === 0 ? 0.42 : -0.42);
    twine.translate(-0.36 + index * 0.24, 0.76, 0);
    parts.push(twine);
  }
  return mergeGeometries(parts, false)!;
}

function reedClumpGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let index = 0; index < 9; index += 1) {
    const height = 0.9 + (index % 4) * 0.18;
    const reed = new CylinderGeometry(0.018, 0.028, height, 4);
    reed.rotateZ((index - 4) * 0.025);
    reed.translate((index % 3 - 1) * 0.18, height / 2, (Math.floor(index / 3) - 1) * 0.16);
    parts.push(reed);
  }
  return mergeGeometries(parts, false)!;
}

/**
 * Harbour cloth in unit-width space: hoist edge on the pole at x = 0, top edge
 * on the crossbar at y = 0, hanging flat to y = −NOBORI_CLOTH_ASPECT; the wind
 * shapes it in the vertex shader. The crossbar is merged into the same
 * geometry with every UV inside the ink hoist band, so it prints as a dark
 * rod and swivels with its cloth at zero extra draws.
 */
function noboriClothGeometry(): BufferGeometry {
  const cloth = new PlaneGeometry(1, NOBORI_CLOTH_ASPECT, 5, 12);
  cloth.translate(0.5, -NOBORI_CLOTH_ASPECT / 2, 0);
  const crossbar = new BoxGeometry(1.08, 0.05, 0.05);
  crossbar.translate(0.5, 0.025, 0);
  const crossbarUv = crossbar.getAttribute("uv");
  for (let index = 0; index < crossbarUv.count; index += 1) crossbarUv.setXY(index, 0.03, 0.5);
  const geometry = mergeGeometries([cloth, crossbar], false)!;
  cloth.dispose();
  crossbar.dispose();
  return geometry;
}

/** `aFlagCell` marks a noren (top-pinned doorway curtain) rather than a nobori. */
const NOREN_CELL = -2;
/** Ai-zome: indigo dyed dark, from the palette's deep sea and stone. */
const NOREN_DYE = new Color(HARBOR_PALETTE.deep_sea_1).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.5);
/** The pinned pose's gust under reduced motion: one deterministic rippled composition. */
const RESTING_GUST = 0.35;
/** How far the shared wind swings every banner about its pole, radians at full cross-wind. */
const NOBORI_WIND_LEAN = 0.28;
/** The cloth hoists this far off the pole axis: the pole's radius. */
const NOBORI_HOIST_OFFSET = 0.055;

function createFlags(recipes: readonly DockRecipe[]) {
  const matrices: Matrix4[] = [];
  const cellValues: number[] = [];
  const phases: number[] = [];
  const poles: Array<{ x: number; z: number }> = [];
  const pole = new Vector3();
  const local = new Matrix4();
  const step = new Matrix4();
  for (const recipe of recipes) {
    for (const banner of recipe.flag.placement.banners) {
      local.makeTranslation(banner.x, banner.clothTopY, banner.z)
        .multiply(step.makeRotationY(recipe.flag.placement.yaw))
        .multiply(step.makeTranslation(NOBORI_HOIST_OFFSET, 0, 0))
        .multiply(step.makeScale(banner.clothWidth, banner.clothWidth, banner.clothWidth));
      matrices.push(new Matrix4().multiplyMatrices(recipe.rootMatrix, local));
      cellValues.push(recipe.flag.atlasCell);
      phases.push(recipe.flag.wavePhase);
      pole.set(banner.x, 0, banner.z).applyMatrix4(recipe.rootMatrix);
      poles.push({ x: pole.x, z: pole.z });
    }
    // Noren hang square to the seaward axis: the curtain's normal is local +x,
    // its "hoist" corner the +z edge, so it spans toward −z.
    for (const noren of recipe.noren) {
      local.makeTranslation(noren.x, noren.topY, noren.z + noren.width / 2)
        .multiply(step.makeRotationY(Math.PI / 2))
        .multiply(step.makeScale(noren.width, noren.height / NOBORI_CLOTH_ASPECT, noren.width));
      matrices.push(new Matrix4().multiplyMatrices(recipe.rootMatrix, local));
      cellValues.push(NOREN_CELL);
      phases.push(recipe.flag.wavePhase + noren.z);
      pole.set(noren.x, 0, noren.z).applyMatrix4(recipe.rootMatrix);
      poles.push({ x: pole.x, z: pole.z });
    }
  }
  const count = matrices.length;
  const geometry = noboriClothGeometry();
  const cells = new InstancedBufferAttribute(new Float32Array(count), 1);
  const gusts = new InstancedBufferAttribute(new Float32Array(count).fill(RESTING_GUST), 1);
  gusts.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aFlagCell", cells);
  geometry.setAttribute("aFlagPhase", new InstancedBufferAttribute(Float32Array.from(phases), 1));
  geometry.setAttribute("aGust", gusts);
  const atlas = gardenChainFlagAtlas();
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    envMapIntensity: 0.3,
    map: atlas.texture,
    roughness: 0.9,
    side: DoubleSide,
  });
  const wind = { uFlagLean: { value: 0 }, uFlagTime: { value: 0 } };
  patchFlagClothMaterial(material, wind);
  const flags = new InstancedMesh(geometry, material, count);
  flags.name = "dock-chain-flag";
  flags.castShadow = false;
  flags.receiveShadow = true;
  flags.frustumCulled = false;
  const plainCloth = new Color(HARBOR_DERIVED_PALETTE.flag_kinari);
  const white = new Color("#ffffff");
  for (let index = 0; index < count; index += 1) {
    const cell = cellValues[index]!;
    const noren = cell === NOREN_CELL;
    const painted = !noren && cell >= 0 && atlas.texture !== null;
    cells.setX(index, noren ? NOREN_CELL : painted ? cell : -1);
    flags.setColorAt(index, noren ? NOREN_DYE : painted ? white : plainCloth);
    flags.setMatrixAt(index, matrices[index]!);
  }
  flags.instanceMatrix.needsUpdate = true;
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;

  const updateFlagWind = (timeSeconds: number, weather: Pick<WeatherPlan, "wind">, reducedMotion: boolean): void => {
    wind.uFlagTime.value = reducedMotion ? 0 : timeSeconds;
    // The shared swing about every pole: the cross-wind component on the one
    // facing all banners share (they all face the rest seat).
    wind.uFlagLean.value = reducedMotion ? 0 : weather.wind.y * NOBORI_WIND_LEAN;
    for (let index = 0; index < count; index += 1) {
      const { x, z } = poles[index]!;
      gusts.setX(index, reducedMotion ? RESTING_GUST : gardenGustAtWorldPosition(timeSeconds, x, z, weather));
    }
    gusts.needsUpdate = true;
  };
  return { flags, updateFlagWind };
}

/**
 * The harbour cloth program (harbour-2, -6). Vertex: travelling folds from
 * the pole to the free edge — two octaves, amplitude from this cloth's gust —
 * with the hoist edge and crossbar pinned on a nobori and only the top pinned
 * on a noren, analytic-by-difference normals so the folds take light and
 * shade, and one shared lean about the pole. Remaps each instance's UVs into
 * its portrait atlas cell, and dims the cloth through the shared
 * `userData.uNightValue` channel (`setGardenFloraNightValue` feeds it from the
 * wall-clock night beat): after dark the banners are pale moonlit cloth,
 * never a lit sign (harbour defect 4).
 */
function patchFlagClothMaterial(
  material: MeshStandardMaterial,
  wind: { uFlagLean: { value: number }; uFlagTime: { value: number } },
): void {
  const night = { value: 0 };
  material.userData.uNightValue = night;
  const cellScaleX = CHAIN_FLAG_CELL_WIDTH_PX / CHAIN_FLAG_ATLAS_SIZE_PX;
  const cellScaleY = CHAIN_FLAG_CELL_HEIGHT_PX / CHAIN_FLAG_ATLAS_SIZE_PX;
  const aspect = NOBORI_CLOTH_ASPECT.toFixed(4);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightValue = night;
    shader.uniforms.uFlagTime = wind.uFlagTime;
    shader.uniforms.uFlagLean = wind.uFlagLean;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute float aFlagCell;
attribute float aFlagPhase;
attribute float aGust;
uniform float uFlagTime;
uniform float uFlagLean;
varying float vFlagCell;
// x: the fold's offset off the cloth plane; y: how far the billow draws the
// cloth in toward its pole, so the free edge scallops as each fold travels.
vec2 gardenClothFold(float along, float drop) {
  float noren = step(aFlagCell, -1.5);
  float pin = mix(pow(clamp(along, 0.0, 1.0), 1.35) * (0.25 + 0.75 * drop), drop, noren)
    * smoothstep(0.0, 0.12, drop);
  float amp = mix(0.05 + 0.11 * aGust, 0.025 + 0.06 * aGust, noren);
  float phase = 6.0 * along + 2.2 * drop - 1.9 * uFlagTime + aFlagPhase;
  return vec2(
    pin * amp * (sin(phase) + 0.3 * sin(2.3 * phase + 1.3)) + noren * drop * drop * 0.3 * aGust,
    pin * amp * 0.6 * (1.0 - cos(phase)) * (1.0 - noren)
  );
}
float gardenClothZ(float along, float drop) {
  return gardenClothFold(along, drop).x;
}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
float flagOnCloth = step(position.y, 0.0005) * (1.0 - step(0.001, abs(position.z)));
float flagDrop = clamp(-position.y / ${aspect}, 0.0, 1.0);
float flagZ = gardenClothZ(position.x, flagDrop);
if (flagOnCloth > 0.5) {
  float dzdx = (gardenClothZ(position.x + 0.02, flagDrop) - flagZ) / 0.02;
  float dzdy = -(gardenClothZ(position.x, flagDrop + 0.02) - flagZ) / (0.02 * ${aspect});
  objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
}
float flagLean = uFlagLean * (1.0 - step(aFlagCell, -1.5));
float flagLeanC = cos(flagLean);
float flagLeanS = sin(flagLean);
objectNormal = vec3(objectNormal.x * flagLeanC + objectNormal.z * flagLeanS, objectNormal.y, objectNormal.z * flagLeanC - objectNormal.x * flagLeanS);`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
transformed.z += flagZ * flagOnCloth;
transformed.x -= gardenClothFold(position.x, flagDrop).y * flagOnCloth;
transformed = vec3(transformed.x * flagLeanC + transformed.z * flagLeanS, transformed.y, transformed.z * flagLeanC - transformed.x * flagLeanS);`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>
vFlagCell = aFlagCell;
#ifdef USE_MAP
if (aFlagCell >= 0.0) {
  float flagColumn = mod(aFlagCell, ${CHAIN_FLAG_ATLAS_COLUMNS}.0);
  float flagRow = floor(aFlagCell / ${CHAIN_FLAG_ATLAS_COLUMNS}.0);
  vMapUv = vec2((flagColumn + uv.x) * ${cellScaleX.toFixed(6)}, 1.0 - (flagRow + 1.0 - uv.y) * ${cellScaleY.toFixed(6)});
}
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNightValue;\nvarying float vFlagCell;")
      .replace("#include <map_fragment>", "if (vFlagCell >= 0.0) {\n  #include <map_fragment>\n}")
      .replace("#include <opaque_fragment>", "outgoingLight *= mix(1.0, 0.3, clamp(uNightValue, 0.0, 1.0));\n#include <opaque_fragment>");
  };
  material.customProgramCacheKey = () => "garden-station-cloth-v3";
}

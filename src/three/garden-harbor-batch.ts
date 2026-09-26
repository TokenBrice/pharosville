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
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NOBORI_CLOTH_ASPECT, type NoboriBanner } from "../systems/dock-layout";
import { HARBOR_DERIVED_PALETTE, HARBOR_PALETTE } from "../systems/palette";
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

const BUCKETS: readonly HarborBucket[] = [
  "timber",
  "stone",
  "metal",
  "accent",
  "wall",
  "window",
  "roof",
];
const PROP_KINDS: readonly HarborPropKind[] = ["post", "lampHead", "plank", "bollard", "piling", "netRack", "reedClump"];

/**
 * Station windows and quay edges are land-bound embers, not extra reflection
 * pools. They therefore share one emissive bucket while garden-lanterns keeps
 * sole ownership of the limited water-lane budget.
 */
/**
 * The value the window bucket is BORN with, before the first frame. T0.2
 * (2026-09-07): `updateDayCycle` now drives this material every frame off
 * `content.harborBatch` (0.35 day / 1.75 dusk / 2.10 night) — it used to be a
 * frozen constant, which is why the harbour was as lit at noon as at midnight.
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
   * Turns every banner of a chain about its own pole (the crossbar swivels)
   * and tilts it by `roll` at the pole head; `yaw` is station-local, as
   * `recipe.flag.placement.yaw`, which restores the authored pose.
   */
  setFlagPose(chainId: string, yaw: number, roll: number): void;
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
  const { flags, flagInstances } = createFlags(recipes);
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
    setFlagPose(chainId, yaw, roll) {
      const instances = flagInstances.get(chainId);
      if (!instances) return;
      for (const { banner, index, rootMatrix } of instances) writeFlagMatrix(flags, rootMatrix, banner, index, yaw, roll);
      flags.instanceMatrix.needsUpdate = true;
    },
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
  return { bollard: null, lampHead: null, netRack: null, piling: null, plank: null, post: null, reedClump: null };
}

function createBucketMeshes(
  root: Group,
  recipes: readonly DockRecipe[],
  fineDetail: boolean,
  accentRanges?: Map<string, Array<{ bucket: HarborBucket; range: ColorRange }>>,
): BucketMeshes {
  const result = emptyBuckets();
  for (const bucket of BUCKETS) {
    const entries: Array<{ chainId: string; part: HarborBucketPart }> = [];
    for (const recipe of recipes) {
      for (const part of recipe.parts) {
        if (part.bucket === bucket && part.fineDetail === fineDetail) entries.push({ chainId: recipe.dock.chainId, part });
      }
    }
    if (entries.length === 0) continue;
    const geometries: BufferGeometry[] = [];
    let castsShadow = false;
    for (const entry of entries) {
      const geometry = entry.part.geometry.clone();
      normalizeGeometryIndex(geometry, entries.map(({ part }) => part.geometry));
      geometry.applyMatrix4(recipes.find((recipe) => recipe.dock.chainId === entry.chainId)!.rootMatrix);
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
      if (bucket === "accent" && !fineDetail && accentRanges) {
        const ranges = accentRanges.get(entry.chainId) ?? [];
        const start = geometries.reduce((sum, candidate) => sum + candidate.getAttribute("position").count, 0);
        ranges.push({ bucket, range: { count, start } });
        accentRanges.set(entry.chainId, ranges);
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
    case "window": return new MeshStandardMaterial({ color: "#ffffff", emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: HARBOR_WINDOW_EMBER_INTENSITY, envMapIntensity: 0.3, roughness: 0.9, toneMapped: false, vertexColors: true });
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
      : !fineDetail && kind === "lampHead"
        ? "dock-lamp-heads"
        : `${fineDetail ? "harbor-fine" : "harbor"}-${kind}`;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    instances.forEach(({ prop, rootMatrix }, index) => {
      mesh.setMatrixAt(index, new Matrix4().multiplyMatrices(rootMatrix, prop.matrix));
      if (prop.color) mesh.setColorAt(index, prop.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !fineDetail && kind !== "lampHead";
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
    case "lampHead": return new SphereGeometry(0.21, 6, 4);
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
    case "lampHead": return new MeshStandardMaterial({ color: HARBOR_PALETTE.lantern_glow, emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 1.5, roughness: 0.25, toneMapped: false });
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
 * Nobori cloth in unit-width space: hoist edge on the pole at x = 0, top edge
 * on the crossbar at y = 0, hanging to y = −NOBORI_CLOTH_ASPECT. The baked
 * curve is a gentle static belly, pinned along the hoist and eased toward the
 * crossbar; wind motion is W4.H2's. The crossbar is merged into the same
 * geometry with every UV inside the ink hoist band, so it prints as a dark
 * rod and swivels with its cloth at zero extra draws.
 */
function noboriClothGeometry(): BufferGeometry {
  const cloth = new PlaneGeometry(1, NOBORI_CLOTH_ASPECT, 4, 13);
  cloth.translate(0.5, -NOBORI_CLOTH_ASPECT / 2, 0);
  const position = cloth.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const along = position.getX(index);
    const drop = -position.getY(index) / NOBORI_CLOTH_ASPECT;
    const pinned = along ** 1.3 * (0.25 + 0.75 * drop);
    position.setZ(index, 0.055 * pinned * Math.sin(3.4 * along + 2.6 * drop + 0.4));
  }
  position.needsUpdate = true;
  cloth.computeVertexNormals();
  const crossbar = new BoxGeometry(1.08, 0.05, 0.05);
  crossbar.translate(0.5, 0.025, 0);
  const crossbarUv = crossbar.getAttribute("uv");
  for (let index = 0; index < crossbarUv.count; index += 1) crossbarUv.setXY(index, 0.03, 0.5);
  const geometry = mergeGeometries([cloth, crossbar], false)!;
  cloth.dispose();
  crossbar.dispose();
  return geometry;
}

interface FlagInstance {
  banner: NoboriBanner;
  index: number;
  rootMatrix: Matrix4;
}

function createFlags(recipes: readonly DockRecipe[]) {
  const instances: Array<FlagInstance & { atlasCell: number; chainId: string; yaw: number }> = [];
  for (const recipe of recipes) {
    for (const banner of recipe.flag.placement.banners) {
      instances.push({
        atlasCell: recipe.flag.atlasCell,
        banner,
        chainId: recipe.dock.chainId,
        index: instances.length,
        rootMatrix: recipe.rootMatrix,
        yaw: recipe.flag.placement.yaw,
      });
    }
  }
  const geometry = noboriClothGeometry();
  const cells = new InstancedBufferAttribute(new Float32Array(instances.length), 1);
  geometry.setAttribute("aFlagCell", cells);
  const atlas = gardenChainFlagAtlas();
  const material = new MeshStandardMaterial({
    color: "#ffffff",
    envMapIntensity: 0.3,
    map: atlas.texture,
    roughness: 0.9,
    side: DoubleSide,
  });
  patchFlagAtlasMaterial(material);
  const flags = new InstancedMesh(geometry, material, instances.length);
  flags.name = "dock-chain-flag";
  flags.instanceMatrix.setUsage(DynamicDrawUsage);
  flags.castShadow = false;
  flags.receiveShadow = true;
  flags.frustumCulled = false;
  const plainCloth = new Color(HARBOR_DERIVED_PALETTE.flag_kinari);
  const white = new Color("#ffffff");
  const flagInstances = new Map<string, FlagInstance[]>();
  for (const instance of instances) {
    const painted = instance.atlasCell >= 0 && atlas.texture !== null;
    cells.setX(instance.index, painted ? instance.atlasCell : -1);
    flags.setColorAt(instance.index, painted ? white : plainCloth);
    writeFlagMatrix(flags, instance.rootMatrix, instance.banner, instance.index, instance.yaw, 0);
    const chain = flagInstances.get(instance.chainId) ?? [];
    chain.push(instance);
    flagInstances.set(instance.chainId, chain);
  }
  cells.needsUpdate = true;
  flags.instanceMatrix.needsUpdate = true;
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  return { flagInstances, flags };
}

/** The cloth hoists this far off the pole axis: the pole's radius. */
const NOBORI_HOIST_OFFSET = 0.055;
const flagScratchA = new Matrix4();
const flagScratchB = new Matrix4();
const flagScratchC = new Matrix4();
function writeFlagMatrix(
  flags: InstancedMesh,
  rootMatrix: Matrix4,
  banner: NoboriBanner,
  index: number,
  yaw: number,
  roll: number,
): void {
  flagScratchA.makeTranslation(banner.x, banner.clothTopY, banner.z);
  flagScratchA.multiply(flagScratchB.makeRotationY(yaw));
  flagScratchA.multiply(flagScratchB.makeRotationZ(roll));
  flagScratchA.multiply(flagScratchB.makeTranslation(NOBORI_HOIST_OFFSET, 0, 0));
  flagScratchA.multiply(flagScratchB.makeScale(banner.clothWidth, banner.clothWidth, banner.clothWidth));
  flagScratchC.multiplyMatrices(rootMatrix, flagScratchA);
  flags.setMatrixAt(index, flagScratchC);
}

/**
 * Remaps each instance's UVs into its portrait atlas cell, and dims the cloth
 * through the shared `userData.uNightValue` channel (`setGardenFloraNightValue`
 * already feeds it from the wall-clock night beat): after dark the banners are
 * pale moonlit cloth, never a lit sign (harbour defect 4).
 */
function patchFlagAtlasMaterial(material: MeshStandardMaterial): void {
  const night = { value: 0 };
  material.userData.uNightValue = night;
  const cellScaleX = CHAIN_FLAG_CELL_WIDTH_PX / CHAIN_FLAG_ATLAS_SIZE_PX;
  const cellScaleY = CHAIN_FLAG_CELL_HEIGHT_PX / CHAIN_FLAG_ATLAS_SIZE_PX;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightValue = night;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFlagCell;\nvarying float vFlagCell;")
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
  material.customProgramCacheKey = () => "garden-station-nobori-v1";
}

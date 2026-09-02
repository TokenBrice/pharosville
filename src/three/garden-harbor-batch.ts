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
import { HARBOR_PALETTE } from "../systems/palette";
import { CHAIN_FLAG_ATLAS_COLUMNS, gardenChainFlagAtlas } from "./garden-chain-flag";
import type {
  DockRecipe,
  DockVisual,
  HarborBucket,
  HarborBucketPart,
  HarborPropInstance,
  HarborPropKind,
} from "./garden-docks";
import { applyGardenHeightFog } from "./garden-height-fog";

const BUCKETS: readonly HarborBucket[] = ["timber", "stone", "metal", "accent", "wall", "window", "roof"];
const PROP_KINDS: readonly HarborPropKind[] = ["post", "lampHead", "plank", "bollard", "crate", "barrel", "pylon", "piling"];

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
  setFlagYaw(chainId: string, yaw: number): void;
  dispose(): void;
}

export function createGardenHarborBatch(recipes: readonly DockRecipe[]): GardenHarborBatch {
  const root = new Group();
  root.name = "harbor-batch";
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
  const bucketMeshes = createBucketMeshes(root, recipes, false, accentRanges);
  const fineDetailBucketMeshes = createBucketMeshes(root, recipes, true, accentRanges);
  const propMeshes = createPropMeshes(root, recipes, false);
  const fineDetailPropMeshes = createPropMeshes(root, recipes, true);
  const { flags, flagIndex, flagYaw } = createFlags(recipes);
  root.add(flags);
  if (recipes.some((recipe) => (
    (recipe.identity.landmark === "gantry" || recipe.identity.enclosure === "grand")
    && recipe.dock.size >= 4
  ))) {
    // Compatibility anchor for the overview-LOD registry. Crane geometry is
    // folded into the world timber/metal buckets, so this node never draws.
    const craneLodAnchor = new Group();
    craneLodAnchor.name = "dock-crane";
    root.add(craneLodAnchor);
  }
  applyGardenHeightFog(root, { epistemicHaze: "quay" });

  return {
    bucketMeshes,
    dispose() {
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
        if (object instanceof InstancedMesh) object.dispose();
      });
      for (const recipe of recipes) {
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
      for (const mesh of Object.values(fineDetailBucketMeshes)) if (mesh) mesh.visible = visible;
      for (const mesh of Object.values(fineDetailPropMeshes)) if (mesh) mesh.visible = visible;
    },
    setFlagYaw(chainId, yaw) {
      const index = flagIndex.get(chainId);
      if (index === undefined) return;
      flagYaw[index] = yaw;
      writeFlagMatrix(flags, recipes[index]!, index, yaw);
      flags.instanceMatrix.needsUpdate = true;
    },
  };
}

function emptyBuckets(): BucketMeshes {
  return { accent: null, metal: null, roof: null, stone: null, timber: null, wall: null, window: null };
}

function emptyProps(): PropMeshes {
  return { barrel: null, bollard: null, crate: null, lampHead: null, piling: null, plank: null, post: null, pylon: null };
}

function createBucketMeshes(
  root: Group,
  recipes: readonly DockRecipe[],
  fineDetail: boolean,
  accentRanges: Map<string, Array<{ bucket: HarborBucket; range: ColorRange }>>,
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
    let start = 0;
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
      if (!fineDetail && (bucket === "roof" || bucket === "accent")) {
        const ranges = accentRanges.get(entry.chainId) ?? [];
        ranges.push({ bucket, range: { count, start } });
        accentRanges.set(entry.chainId, ranges);
      }
      start += count;
      castsShadow ||= entry.part.castShadow;
      geometries.push(geometry);
    }
    const merged = mergeCompatible(geometries);
    for (const geometry of geometries) geometry.dispose();
    const mesh = new Mesh(merged, bucketMaterial(bucket));
    mesh.name = !fineDetail && bucket === "window"
      ? "dock-warehouse-windows"
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
    case "window": return new MeshStandardMaterial({ color: "#ffffff", emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 1.6, roughness: 0.5, toneMapped: false, vertexColors: true });
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
    case "crate": return new BoxGeometry(0.44, 0.4, 0.44);
    case "barrel": return new CylinderGeometry(0.16, 0.16, 0.36, 8);
    case "pylon": return new CylinderGeometry(0.16, 0.2, 2.25, 6);
    case "piling": return new CylinderGeometry(0.075, 0.095, 2.6, 6);
  }
}

function propMaterial(kind: HarborPropKind): MeshStandardMaterial {
  switch (kind) {
    case "post": return new MeshStandardMaterial({ color: "#5c4d3c", metalness: 0.24, roughness: 0.78 });
    case "lampHead": return new MeshStandardMaterial({ color: HARBOR_PALETTE.lantern_glow, emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 1.5, roughness: 0.25, toneMapped: false });
    case "plank": return new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.95 });
    case "bollard": return new MeshStandardMaterial({ color: "#6d5d49", metalness: 0.42, roughness: 0.62 });
    case "crate": return new MeshStandardMaterial({ color: "#8d623a", flatShading: true, roughness: 1 });
    case "barrel": return new MeshStandardMaterial({ color: "#6f5233", flatShading: true, roughness: 1 });
    case "pylon": return new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 });
    case "piling": return new MeshStandardMaterial({ color: new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.iron_dark), 0.45), flatShading: true, roughness: 0.95 });
  }
}

function createFlags(recipes: readonly DockRecipe[]) {
  const meanSag = recipes.reduce((sum, recipe) => sum + recipe.flag.sag, 0) / Math.max(1, recipes.length);
  const meanPhase = recipes.reduce((sum, recipe) => sum + recipe.flag.wavePhase, 0) / Math.max(1, recipes.length);
  const geometry = new PlaneGeometry(1.5, 1, 8, 3);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const along = (position.getX(index) + 0.75) / 1.5;
    position.setZ(index, Math.sin(along * Math.PI * 1.7 + meanPhase) * 0.13 * along);
    position.setY(index, position.getY(index) - along * along * meanSag);
    position.setX(index, position.getX(index) + 0.75);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const cells = new InstancedBufferAttribute(new Float32Array(recipes.length), 1);
  geometry.setAttribute("aFlagCell", cells);
  const atlas = gardenChainFlagAtlas();
  const material = new MeshStandardMaterial({ color: "#ffffff", map: atlas.texture, roughness: 0.82, side: DoubleSide });
  patchFlagAtlasMaterial(material);
  const flags = new InstancedMesh(geometry, material, recipes.length);
  flags.name = "dock-chain-flag";
  flags.instanceMatrix.setUsage(DynamicDrawUsage);
  flags.castShadow = false;
  flags.receiveShadow = true;
  flags.frustumCulled = false;
  const flagIndex = new Map<string, number>();
  const flagYaw = recipes.map((recipe) => recipe.flag.placement.yaw);
  recipes.forEach((recipe, index) => {
    flagIndex.set(recipe.dock.chainId, index);
    cells.setX(index, Math.max(0, recipe.flag.atlasCell));
    flags.setColorAt(index, recipe.flag.atlasCell >= 0 && atlas.texture ? new Color("#ffffff") : recipe.flag.accent);
    writeFlagMatrix(flags, recipe, index, flagYaw[index]!);
  });
  cells.needsUpdate = true;
  flags.instanceMatrix.needsUpdate = true;
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  return { flagIndex, flags, flagYaw };
}

const flagScratchA = new Matrix4();
const flagScratchB = new Matrix4();
const flagScratchC = new Matrix4();
function writeFlagMatrix(flags: InstancedMesh, recipe: DockRecipe, index: number, yaw: number): void {
  const { placement } = recipe.flag;
  flagScratchA.makeTranslation(placement.x, placement.y, placement.z);
  flagScratchA.multiply(flagScratchB.makeRotationY(yaw));
  flagScratchA.multiply(flagScratchB.makeTranslation(0.06, 0, 0));
  flagScratchA.multiply(flagScratchB.makeScale(placement.scale, placement.scale, placement.scale));
  flagScratchC.multiplyMatrices(recipe.rootMatrix, flagScratchA);
  flags.setMatrixAt(index, flagScratchC);
}

function patchFlagAtlasMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFlagCell;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n#ifdef USE_MAP\nfloat flagColumns = ${CHAIN_FLAG_ATLAS_COLUMNS}.0;\nfloat flagRow = flagColumns - 1.0 - floor(aFlagCell / flagColumns);\nvMapUv = vec2(mod(aFlagCell, flagColumns), flagRow) / flagColumns + uv / flagColumns;\n#endif`);
  };
  material.customProgramCacheKey = () => "garden-harbor-flag-v1";
}

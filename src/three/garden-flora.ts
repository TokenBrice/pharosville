import type { Material } from "three";
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  gardenSnowCover,
  seasonalPhenology,
  type GardenDeciduousKind,
  type GardenPhenology,
} from "../systems/garden-calendar";
import { HARBOR_PALETTE } from "../systems/palette";
import type { WeatherPlan } from "../systems/weather";
import { createNiwakiPine, niwakiDefaultBranches, type NiwakiBranchSpec, type NiwakiPine } from "./garden-niwaki";
import { stableUnit } from "./garden-util";

/**
 * W4.G1 — planting like a gardener (garden-2, garden-8, garden-master-4,
 * art-director-7). One shape grammar for every tree in the garden: the
 * niwaki generator's plated trunk, level arms and flat-bottomed cloud pads,
 * smooth-shaded, their value from the pad crown/underside vertex ramp.
 *
 * - pine: a cloud-pruned kuromatsu (the rim/islet grade of `garden-niwaki`).
 * - momiji / cherry: the same grammar opened out into thin layered tiers on
 *   long arms — sky between the layers, never a dome on a stick.
 * - bamboo: a dense clump of olive-gold culms under one continuous tall
 *   leaf hull; clumps gather into groves. No tuft per culm.
 * - karikomi: one ō-karikomi wave segment, three overlapping clipped lobes;
 *   instances chain into long low waves.
 *
 * Foliage vertices carry a neutral light ramp; the leaf hue is per instance
 * (`instanceColor`), applied to foliage only, so bark keeps its own colour
 * and a maple can turn while its neighbour stays green. `aGardenFoliage` is 0
 * on bark and a pad rank in (0, 1] on foliage; pads whose rank passes the
 * instance's `aGardenLeaf` collapse, so a maple drops its crown pad by pad.
 */

/** Dimensions are world units; bamboo is the one vertical accent. */
export const SPECIES = {
  pine: { height: 4.5, flex: 0.08, deciduous: false },
  momiji: { height: 3.6, flex: 0.16, deciduous: true },
  cherry: { height: 3.2, flex: 0.14, deciduous: true },
  bamboo: { height: 6.4, flex: 0.42, deciduous: false },
  karikomi: { height: 0.72, flex: 0.02, deciduous: false },
} as const;
export type GardenSpecies = keyof typeof SPECIES;

export interface SpeciesPlacement {
  position: [number, number, number];
  scale?: number;
  yaw?: number;
  leanX?: number;
  leanZ?: number;
  /** Stable specimen id for phenology (deciduous); defaults to the batch index. */
  seed?: string;
  /** Leaf hue override for this specimen (foliage only). */
  color?: Color;
  /** Value multiplier on the foliage (the near band sets planting down, G3b). */
  value?: number;
}

export interface FloraDress {
  /** The world calendar day: deciduous phenology and the rare snow. */
  date?: Date | undefined;
}

const WHITE = new Color(1, 1, 1);

/** Evergreen and summer leaf hues (per-instance foliage colour). */
export const GARDEN_FLORA_COLORS = {
  /** Black-pine needles: dark, so the evergreen masses hold the shade values. */
  needle: new Color(HARBOR_PALETTE.aurora_green).multiplyScalar(0.36).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.22),
  /** Dark boxwood, not lime (garden-8). */
  boxwood: new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.5).multiplyScalar(0.72),
  momiji: new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.25).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.22),
  cherry: new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.32).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.2),
  bambooLeaf: new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.3).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.2),
} as const;

/**
 * garden-3: autumn without vermillion. Derived tones, all OKLCH C ≤ 0.12, so
 * the beacon flame keeps its primacy (§1.1 rule 5).
 */
const MOMIJI_AMBER = new Color(HARBOR_PALETTE.timber_warm).lerp(new Color(HARBOR_PALETTE.roof_thatch), 0.4);
const MOMIJI_PERSIMMON = new Color(HARBOR_PALETTE.roof_cote_clay).lerp(new Color(HARBOR_PALETTE.timber_mid), 0.58);
const MOMIJI_DEEP = new Color(HARBOR_PALETTE.roof_cote_clay).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.62);
const SHINRYOKU = new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.foam_white), 0.22).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.15);
const BLOSSOM = new Color(HARBOR_PALETTE.foam_white).lerp(new Color(HARBOR_PALETTE.roof_cote_clay), 0.16);
const SNOW = new Color(HARBOR_PALETTE.foam_white).multiplyScalar(0.93);

const PINE_BARK = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.35);
const MAPLE_BARK = new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.timber_dark), 0.45);
const CHERRY_BARK = new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.25);
/** Bamboo culms are olive-gold, not leaf green (garden-8). */
const BAMBOO_CULM = new Color(HARBOR_PALETTE.timber_warm).lerp(new Color(HARBOR_PALETTE.aurora_green), 0.5).multiplyScalar(0.8);
const COOL_SHADE = new Color(HARBOR_PALETTE.fog_blue);

/** Shared night beat; an opt-in material floor changes attenuation, not light or emission. */
export function patchGardenFloraNight(material: MeshStandardMaterial, options?: { nightFloor: number }): void {
  if (options && (!Number.isFinite(options.nightFloor) || options.nightFloor < 0 || options.nightFloor > 1)) {
    throw new RangeError("Garden flora night floor must be finite and between zero and one");
  }
  const floor = options ? { value: options.nightFloor } : undefined;
  if (floor) material.userData.uGardenFloraNightFloor = floor;
  const uniform = { value: 0 };
  material.userData.uNightValue = uniform;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uNightValue = uniform;
    if (floor) shader.uniforms.uGardenFloraNightFloor = floor;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nuniform float uNightValue;${floor ? "\nuniform float uGardenFloraNightFloor;" : ""}`)
      .replace("#include <opaque_fragment>", `outgoingLight *= mix(1.0, ${floor ? "uGardenFloraNightFloor" : "0.055"}, clamp(uNightValue, 0.0, 1.0));\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${key}|${floor ? "garden-flora-night-floor" : "garden-flora-night"}`;
}

/** Feed the wall-clock night beat, never data stress. No per-frame allocations. */
export function setGardenFloraNightValue(root: Object3D, nightValue: number): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const apply = (material: Material) => {
      const uniform = material.userData.uNightValue as { value: number } | undefined;
      if (uniform) uniform.value = Math.max(0, Math.min(1, nightValue));
    };
    if (Array.isArray(object.material)) object.material.forEach(apply);
    else apply(object.material);
  });
}

/**
 * Per-instance foliage hue, leaf fall and pad-top snow. Bark keeps its
 * vertex colour; foliage takes vertex ramp × instance colour. A pad whose
 * rank exceeds the instance's leaf mass collapses to the root (zero-area
 * triangles, no fragments). Snow whitens only up-facing foliage, so pad
 * bellies stay dark (garden-3). The snow amount is fixed at build.
 */
export function patchGardenFoliage(material: MeshStandardMaterial, snow = 0, letsGo?: GardenLetsGoCrown): void {
  const uniform = { value: snow };
  material.userData.uGardenSnow = uniform;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uGardenSnow = uniform;
    if (letsGo) shader.uniforms.uGardenLetsGoCrown = letsGo;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aGardenFoliage;
        attribute float aGardenLeaf;
        uniform float uGardenSnow;
        ${letsGo ? "#define GARDEN_LETS_GO\n        attribute vec3 aGardenPadCentre;\n        uniform float uGardenLetsGoCrown;" : ""}`,
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        #if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
          vColor.xyz = mix( color.xyz, vColor.xyz, step( 0.001, aGardenFoliage ) );
        #endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float gardenFoliage = step( 0.001, aGardenFoliage );
          transformed *= 1.0 - gardenFoliage * step( aGardenLeaf + 0.0001, aGardenFoliage );
          #ifdef GARDEN_LETS_GO
            // X5 (garden-7): the letting-go tree's pads carry −rank; each pad
            // shrinks into its own centre while the crown passes its rank.
            float gardenLetsGoRank = -aGardenFoliage;
            float gardenGone = step( 0.001, gardenLetsGoRank )
              * clamp( ( gardenLetsGoRank - uGardenLetsGoCrown ) / ${GARDEN_LETS_GO_PAD_BAND.toFixed(3)}, 0.0, 1.0 );
            transformed = mix( transformed, aGardenPadCentre, gardenGone );
          #endif
          #ifdef USE_COLOR
            float gardenSnowTop = uGardenSnow * gardenFoliage * smoothstep( 0.55, 0.9, objectNormal.y );
            vColor.xyz = mix( vColor.xyz, vec3( ${SNOW.r.toFixed(4)}, ${SNOW.g.toFixed(4)}, ${SNOW.b.toFixed(4)} ), gardenSnowTop );
          #endif
        }`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|garden-foliage${letsGo ? "-lets-go" : ""}`;
  material.needsUpdate = true;
}

/** The letting-go tree's crown, 1 full … 0 bare: a shared uniform the ritual drives. */
export interface GardenLetsGoCrown {
  value: number;
}

/**
 * Crown span over which one pad of the letting-go tree shrinks away; pad
 * ranks lie in [band, 1], so a crown of 1 shows every pad and 0 none.
 */
export const GARDEN_LETS_GO_PAD_BAND = 0.1;

/**
 * Writes `aGardenFoliage` from a niwaki pad map: bark 0, each pad a distinct
 * rank in (0, 1], shuffled by `seed` so leaf fall is not top-down.
 */
export function writeFoliageRanks(geometry: BufferGeometry, padOfVertex: Int16Array, padCount: number, seed: string): void {
  const order = Array.from({ length: padCount }, (_, pad) => pad)
    .sort((a, b) => stableUnit(`${seed}.rank.${a}`) - stableUnit(`${seed}.rank.${b}`));
  const rankOf = new Float32Array(padCount);
  order.forEach((pad, index) => { rankOf[pad] = (index + 1) / padCount; });
  const foliage = new Float32Array(padOfVertex.length);
  for (let vertex = 0; vertex < padOfVertex.length; vertex += 1) {
    const pad = padOfVertex[vertex]!;
    foliage[vertex] = pad < 0 ? 0 : rankOf[pad]!;
  }
  geometry.setAttribute("aGardenFoliage", new Float32BufferAttribute(foliage, 1));
}

/**
 * Maple and cherry recipes in the niwaki grammar: long level arms carrying
 * thin pads in layers with sky between them. The cherry is lower and wider,
 * its arms arching further out.
 */
function deciduousBranches(kind: GardenDeciduousKind, seed: string): NiwakiBranchSpec[] {
  const tiers = kind === "cherry"
    ? [[0.34, 1.75, 0.55, 0.95, 2], [0.45, 1.55, 0.5, 0.88, 2], [0.58, 1.3, 0.42, 0.8, 2], [0.76, 0.75, 0.2, 0.68, 1]]
    : [[0.42, 1.3, 0.42, 0.82, 2], [0.53, 1.2, 0.38, 0.78, 2], [0.64, 1.05, 0.32, 0.7, 2], [0.78, 0.8, 0.22, 0.62, 1], [0.93, 0.3, 0.08, 0.56, 1]];
  return tiers.map(([at, reach, rise, padSize, pads], index) => ({
    at: at!,
    azimuth: index * 2.4 + (stableUnit(`${seed}.${kind}.tier.${index}`) - 0.5) * 0.7,
    reach: reach!,
    rise: rise!,
    padSize: padSize!,
    pads: pads!,
  }));
}

/** One deciduous specimen in the niwaki grammar, local to its root. */
export function createDeciduousSpecimen(kind: GardenDeciduousKind, seed: string, options: { lod?: "hero" | "rim"; height?: number } = {}): NiwakiPine {
  const height = options.height ?? SPECIES[kind].height;
  return createNiwakiPine({
    seed: `${kind}.${seed}`,
    height,
    lean: { x: height * 0.08, z: height * 0.04 },
    trunkRadius: height * (kind === "cherry" ? 0.04 : 0.032),
    branches: deciduousBranches(kind, seed),
    bark: kind === "cherry" ? CHERRY_BARK : MAPLE_BARK,
    needle: WHITE,
    lod: options.lod ?? "rim",
  });
}

function createBambooClumpGeometry(): { geometry: BufferGeometry; padOfVertex: Int16Array; pads: number } {
  const pieces: BufferGeometry[] = [];
  const owners: number[] = [];
  const culmColor = new Color();
  for (let culm = 0; culm < 11; culm += 1) {
    const angle = culm * 2.4 + stableUnit(`bamboo.culm.${culm}`) * 0.6;
    const radius = 0.18 + stableUnit(`bamboo.culm-r.${culm}`) * 0.6;
    const height = 5.0 + stableUnit(`bamboo.culm-h.${culm}`) * 1.4;
    const geometry = new CylinderGeometry(0.045, 0.065, height, 5, 2, true);
    geometry.deleteAttribute("uv");
    geometry.translate(0, height / 2, 0);
    // Culms splay a little from the clump's heart.
    geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(Math.sin(angle) * 0.08 * radius, 0, -Math.cos(angle) * 0.08 * radius)));
    geometry.translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    culmColor.copy(BAMBOO_CULM).multiplyScalar(0.82 + stableUnit(`bamboo.culm-tone.${culm}`) * 0.3);
    for (let vertex = 0; vertex < count; vertex += 1) culmColor.toArray(colors, vertex * 3);
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    pieces.push(geometry);
    owners.push(-1);
  }
  // One continuous leaf hull over the culm tops: four tall merged lobes.
  const lobeColor = new Color();
  for (let lobe = 0; lobe < 4; lobe += 1) {
    const raw = new IcosahedronGeometry(1, 1);
    raw.deleteAttribute("normal");
    raw.deleteAttribute("uv");
    const geometry = mergeVertices(raw);
    raw.dispose();
    const angle = lobe * 1.9 + stableUnit(`bamboo.lobe.${lobe}`) * 0.5;
    const offset = lobe === 0 ? 0 : 0.42;
    const width = lobe === 0 ? 0.95 : 0.72;
    const rise = lobe === 0 ? 1.55 : 1.15 + stableUnit(`bamboo.lobe-h.${lobe}`) * 0.3;
    const centreY = lobe === 0 ? 5.0 : 4.4 + stableUnit(`bamboo.lobe-y.${lobe}`) * 0.6;
    const position = geometry.getAttribute("position");
    const colors = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const y = position.getY(vertex);
      const lump = 1 + (stableUnit(`bamboo.lump.${lobe}.${vertex}`) - 0.5) * 0.22;
      position.setXYZ(
        vertex,
        position.getX(vertex) * width * lump + Math.cos(angle) * offset,
        y * rise * lump + centreY,
        position.getZ(vertex) * width * lump + Math.sin(angle) * offset,
      );
      // Lit crown, shaded belly — the hull's value is authored, not faceted.
      const lit = (y + 1) / 2;
      lobeColor.copy(WHITE).multiplyScalar(0.5 + 0.5 * lit).lerp(COOL_SHADE, 0.08 * (1 - lit));
      lobeColor.toArray(colors, vertex * 3);
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    pieces.push(geometry);
    owners.push(lobe);
  }
  return mergeOwned(pieces, owners, 4);
}

/**
 * garden-8: one ō-karikomi wave segment. Three overlapping lobes, flat on
 * the ground, shorn flat at 85 % of their height; chained instances read as
 * one long clipped wave.
 */
function createKarikomiWaveGeometry(): { geometry: BufferGeometry; padOfVertex: Int16Array; pads: number } {
  const lobes = [[-0.95, 0.05, 0.95], [0, -0.05, 1.2], [0.9, 0.08, 0.85]] as const;
  const pieces: BufferGeometry[] = [];
  const owners: number[] = [];
  let top = 0;
  for (const [, , radius] of lobes) top = Math.max(top, radius * 0.6);
  const clip = top * 0.85;
  const color = new Color();
  lobes.forEach(([x, z, radius], lobe) => {
    const raw = new IcosahedronGeometry(1, 1);
    raw.deleteAttribute("normal");
    raw.deleteAttribute("uv");
    const geometry = mergeVertices(raw);
    raw.dispose();
    const position = geometry.getAttribute("position");
    const colors = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const lump = 1 + (stableUnit(`karikomi.lump.${lobe}.${vertex}`) - 0.5) * 0.1;
      const y = Math.min(clip, Math.max(0, position.getY(vertex)) * radius * 0.6 * lump);
      position.setXYZ(vertex, position.getX(vertex) * radius * lump + x, y, position.getZ(vertex) * radius * 0.82 * lump + z);
      const lit = y / clip;
      color.copy(WHITE).multiplyScalar(0.5 + 0.5 * lit * lit).lerp(COOL_SHADE, 0.08 * (1 - lit));
      color.toArray(colors, vertex * 3);
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    pieces.push(geometry);
    owners.push(lobe);
  });
  return mergeOwned(pieces, owners, lobes.length);
}

function mergeOwned(pieces: BufferGeometry[], owners: readonly number[], pads: number): { geometry: BufferGeometry; padOfVertex: Int16Array; pads: number } {
  const counts = pieces.map((piece) => piece.getAttribute("position").count);
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  const padOfVertex = new Int16Array(geometry.getAttribute("position").count);
  let cursor = 0;
  counts.forEach((count, piece) => {
    padOfVertex.fill(owners[piece]!, cursor, cursor + count);
    cursor += count;
  });
  return { geometry, padOfVertex, pads };
}

/**
 * The shared geometry of one species, local to the root: position, smooth
 * normal, vertex colour (bark colour; foliage a neutral light ramp) and
 * `aGardenFoliage`.
 */
export function createSpeciesGeometry(species: GardenSpecies): BufferGeometry {
  let built: { geometry: BufferGeometry; padOfVertex: Int16Array; pads: number };
  if (species === "pine") {
    const pine = createNiwakiPine({
      seed: "rim-pine",
      height: SPECIES.pine.height,
      lean: { x: SPECIES.pine.height * 0.1, z: 0 },
      // Seen from 60–240 u: pads large against their gaps, so the tree reads
      // as stacked dark horizontals, never as caps on sticks.
      branches: niwakiDefaultBranches(SPECIES.pine.height, "rim-pine")
        .map((branch) => ({ ...branch, reach: branch.reach * 1.1, padSize: branch.padSize * 1.6 })),
      bark: PINE_BARK,
      needle: WHITE,
      lod: "rim",
    });
    built = { geometry: pine.geometry, padOfVertex: pine.padOfVertex, pads: pine.pads.length };
  } else if (species === "momiji" || species === "cherry") {
    const tree = createDeciduousSpecimen(species, "rim");
    built = { geometry: tree.geometry, padOfVertex: tree.padOfVertex, pads: tree.pads.length };
  } else if (species === "bamboo") {
    built = createBambooClumpGeometry();
  } else {
    built = createKarikomiWaveGeometry();
  }
  writeFoliageRanks(built.geometry, built.padOfVertex, built.pads, species);
  built.geometry.computeBoundingSphere();
  return built.geometry;
}

/**
 * garden-3: a deciduous specimen's leaf hue for its phenology. Green, the
 * spring flush paler, then green → amber → the specimen's own final tone
 * (amber, persimmon or deep rust-brown); a cherry in flower goes to blossom.
 */
export function deciduousLeafColor(kind: GardenDeciduousKind, seed: string, state: GardenPhenology, target = new Color()): Color {
  target.copy(kind === "cherry" ? GARDEN_FLORA_COLORS.cherry : GARDEN_FLORA_COLORS.momiji).lerp(SHINRYOKU, state.flush * 0.55);
  if (state.turn > 0) {
    const pick = stableUnit(`${kind}.${seed}.final`);
    const final = kind === "cherry" || pick < 0.34 ? MOMIJI_AMBER : pick < 0.72 ? MOMIJI_PERSIMMON : MOMIJI_DEEP;
    if (state.turn < 0.4) target.lerp(MOMIJI_AMBER, state.turn / 0.4);
    else target.copy(MOMIJI_AMBER).lerp(final, (state.turn - 0.4) / 0.6);
  }
  if (kind === "cherry" && state.blossom > 0) {
    target.lerp(BLOSSOM, state.blossom / Math.max(0.001, state.blossom + state.leaf * (1 - state.blossom)));
  }
  return target;
}

/** Visible crown mass: leaves, or for a cherry in flower, its blossom. */
export function deciduousCrownMass(kind: GardenDeciduousKind, state: GardenPhenology): number {
  return kind === "cherry" ? Math.max(state.leaf, state.blossom) : state.leaf;
}

const DEFAULT_LEAF: Record<GardenSpecies, Color> = {
  pine: GARDEN_FLORA_COLORS.needle,
  momiji: GARDEN_FLORA_COLORS.momiji,
  cherry: GARDEN_FLORA_COLORS.cherry,
  bamboo: GARDEN_FLORA_COLORS.bambooLeaf,
  karikomi: GARDEN_FLORA_COLORS.boxwood,
};

export function createSpeciesBatch(species: GardenSpecies, placements: readonly SpeciesPlacement[], dress: FloraDress = {}): InstancedMesh<BufferGeometry, MeshStandardMaterial> {
  const material = new MeshStandardMaterial({ flatShading: false, roughness: 0.96, vertexColors: true });
  patchGardenFloraNight(material);
  patchGardenFoliage(material, dress.date ? gardenSnowCover(dress.date) : 0);
  patchGardenInstancedWindSway(material, SPECIES[species].height, SPECIES[species].flex);
  const mesh = new InstancedMesh(createSpeciesGeometry(species), material, placements.length);
  mesh.name = `garden-flora-${species}`;
  const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), position = new Vector3(), scale = new Vector3();
  const sway = new Float32Array(placements.length);
  const leaf = new Float32Array(placements.length).fill(1);
  const color = new Color();
  placements.forEach((placement, i) => {
    rotation.setFromEuler(euler.set(placement.leanX ?? 0, placement.yaw ?? 0, placement.leanZ ?? 0));
    matrix.compose(position.set(...placement.position), rotation, scale.setScalar(placement.scale ?? 1));
    mesh.setMatrixAt(i, matrix);
    sway[i] = 0.7 + stableUnit(`flora.${species}.${i}`) * 0.5;
    color.copy(placement.color ?? DEFAULT_LEAF[species]);
    if ((species === "momiji" || species === "cherry") && dress.date && !placement.color) {
      const seed = placement.seed ?? `${i}`;
      const state = seasonalPhenology(seed, dress.date, species);
      deciduousLeafColor(species, seed, state, color);
      leaf[i] = deciduousCrownMass(species, state);
    }
    mesh.setColorAt(i, color.multiplyScalar(placement.value ?? 1));
  });
  mesh.geometry.setAttribute("aGardenSway", new InstancedBufferAttribute(sway, 1));
  mesh.geometry.setAttribute("aGardenLeaf", new InstancedBufferAttribute(leaf, 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

interface GardenWindSwayUniforms {
  uGardenWindDirection: { value: { x: number; y: number } };
  uGardenWindStrength: { value: number };
}

/**
 * Adds one vertex-only wind response to an existing instanced standard
 * material. Instances differ only by `aGardenSway`; direction, breath and gust
 * all come from the one frame weather plan, never from a local oscillator.
 */
export function patchGardenInstancedWindSway(
  material: MeshStandardMaterial,
  heightScale: number,
  baseFlex = 0,
): void {
  const uniforms: GardenWindSwayUniforms = {
    uGardenWindDirection: { value: { x: 0, y: 0 } },
    uGardenWindStrength: { value: 0 },
  };
  material.userData.gardenWindSwayUniforms = uniforms;
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uGardenWindDirection = uniforms.uGardenWindDirection;
    shader.uniforms.uGardenWindStrength = uniforms.uGardenWindStrength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aGardenSway;
        uniform vec2 uGardenWindDirection;
        uniform float uGardenWindStrength;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 gardenWindWorld = vec3(uGardenWindDirection.x, 0.0, uGardenWindDirection.y);
          vec2 gardenWindLocal = vec2(
            dot(gardenWindWorld, normalize(instanceMatrix[0].xyz)),
            dot(gardenWindWorld, normalize(instanceMatrix[2].xyz))
          );
          float gardenWindHeight = clamp(position.y / ${heightScale.toFixed(3)}, 0.0, 1.0);
          float gardenWindFlex = mix(${baseFlex.toFixed(3)}, 1.0, gardenWindHeight * gardenWindHeight);
          transformed.xz += gardenWindLocal * uGardenWindStrength * aGardenSway * gardenWindFlex;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `${previousKey}|garden-instanced-wind-sway-${heightScale}-${baseFlex}`;
  material.needsUpdate = true;
}

export function updateGardenInstancedWindSway(
  material: MeshStandardMaterial,
  weather: WeatherPlan,
  reducedMotion: boolean,
): void {
  const uniforms = material.userData.gardenWindSwayUniforms as GardenWindSwayUniforms | undefined;
  if (!uniforms) return;
  uniforms.uGardenWindDirection.value.x = weather.wind.x;
  uniforms.uGardenWindDirection.value.y = weather.wind.y;
  const gust = reducedMotion ? 0 : weather.wind.gust;
  uniforms.uGardenWindStrength.value = (
    0.035 + weather.wind.speed * 0.085 + gust * 0.14
  ) * (0.9 + weather.breath * 0.2);
}

import type { Material } from "three";
import { BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenSeason } from "../systems/season";
import type { WeatherPlan } from "../systems/weather";
import { stableUnit } from "./garden-util";

/** Dimensions are world units; only bamboo is a vertical accent. */
export const SPECIES = {
  pine: { height: 4.5, flex: 0.08, deciduous: false },
  momiji: { height: 3.3, flex: 0.18, deciduous: true },
  cherry: { height: 3.1, flex: 0.14, deciduous: true },
  bamboo: { height: 6, flex: 0.42, deciduous: false },
  karikomi: { height: 1.5, flex: 0.02, deciduous: false },
  ground: { height: 0.02, flex: 0, deciduous: false },
} as const;
export type GardenSpecies = keyof typeof SPECIES;
export interface SpeciesPlacement {
  position: [number, number, number];
  scale?: number;
  yaw?: number;
  leanX?: number;
  leanZ?: number;
}

export function patchGardenFloraNight(material: MeshStandardMaterial): void {
  const uniform = { value: 0 };
  material.userData.uNightValue = uniform;
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uNightValue = uniform;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uNightValue;")
      .replace("#include <opaque_fragment>", "outgoingLight *= mix(1.0, 0.055, clamp(uNightValue, 0.0, 1.0));\n#include <opaque_fragment>");
  };
  material.customProgramCacheKey = () => `${key}|garden-flora-night`;
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

function dyed(geometry: BufferGeometry, color: Color): BufferGeometry {
  const colors = new Float32Array(geometry.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Flattened tapered cone sections keep negative space between needle plates. */
export function createFloraPadGeometry(): BufferGeometry {
  return new CylinderGeometry(0.36, 1, 1, 9, 1, false);
}

export function createSpeciesGeometry(species: GardenSpecies, season: GardenSeason = "summer", trunkColor = new Color(HARBOR_PALETTE.timber_dark), foliageColor?: Color): BufferGeometry {
  const pieces: BufferGeometry[] = [];
  const leaf = foliageColor?.clone() ?? new Color(HARBOR_PALETTE.aurora_green).lerp(trunkColor, species === "pine" ? 0.45 : 0.2);
  if (species === "cherry") leaf.lerp(new Color(HARBOR_PALETTE.foam_white), season === "spring" ? 0.85 : 0.22);
  if (species === "cherry" && season === "spring") leaf.lerp(new Color(HARBOR_PALETTE.vermillion), 0.1);
  if (species === "momiji" && season === "autumn") leaf.copy(new Color(HARBOR_PALETTE.vermillion)).lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.18);
  const branch = (a: number[], b: number[], radius: number) => {
    const from = new Vector3(...a), to = new Vector3(...b);
    const direction = to.clone().sub(from);
    const part = dyed(new CylinderGeometry(radius * 0.65, radius, direction.length(), 5, 1, true), trunkColor);
    part.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
    part.translate(...from.add(to).multiplyScalar(0.5).toArray());
    pieces.push(part);
  };
  const pad = (x: number, y: number, z: number, sx: number, sy: number, sz: number, lobed = false) => {
    const part = createFloraPadGeometry();
    if (lobed) {
      const p = part.getAttribute("position");
      for (let i = 0; i < p.count; i += 1) {
        const f = 1 + 0.18 * Math.cos(Math.atan2(p.getZ(i), p.getX(i)) * 5);
        p.setXYZ(i, p.getX(i) * f, p.getY(i), p.getZ(i) * f);
      }
      part.computeVertexNormals();
    }
    part.scale(sx, sy, sz); part.translate(x, y, z);
    pieces.push(dyed(part, leaf));
  };
  if (species === "pine") {
    branch([0, 0, 0], [0.32, 1.65, 0.08], 0.3);
    branch([0.32, 1.65, 0.08], [-0.16, 3, 0.12], 0.23);
    branch([-0.16, 3, 0.12], [0.36, 4.28, -0.08], 0.14);
    const pads = [[-1, 2.57, 0.25, 1.12, 0.32, 0.78], [0.93, 3.2, -0.25, 0.98, 0.28, 0.66], [-0.57, 3.64, 0.4, 0.73, 0.24, 0.58], [0.36, 4.1, -0.08, 0.72, 0.4, 0.56]];
    for (const [x, y, z, sx, sy, sz] of pads) { branch([0, y! - 0.45, 0], [x!, y!, z!], 0.08); pad(x!, y!, z!, sx!, sy!, sz!); }
  } else if (species === "momiji" || species === "cherry") {
    branch([0, 0, 0], [0.15, 1.6, 0], 0.21);
    for (let i = 0; i < 3; i += 1) {
      const a = i * Math.PI * 2 / 3, x = Math.cos(a), z = Math.sin(a);
      branch([0.15, 1.35, 0], [x, 2.8 - i * 0.15, z * 0.7], 0.12);
      branch([x, 2.4 - i * 0.15, z * 0.6], [x * 1.6, 2.85 - i * 0.15, z], 0.055);
      if (season !== "winter") pad(x * 0.7, 2.95 - i * 0.15, z * 0.5, species === "cherry" ? 1.85 : 1.38, species === "cherry" ? 0.23 : 0.38, 1.15, true);
    }
  } else if (species === "bamboo") {
    for (let i = 0; i < 7; i += 1) {
      const a = i * 2.4, x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45, h = 4.5 + i * 0.25;
      const culm = dyed(new CylinderGeometry(0.055, 0.075, h, 5, 1, true), leaf);
      culm.translate(x, h / 2, z); pieces.push(culm);
      pad(x + 0.18, h * 0.78, z, 0.48, 0.12, 0.21);
    }
  } else if (species === "karikomi") {
    const dome = dyed(new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), leaf);
    dome.scale(1, 1.5, 0.85); pieces.push(dome);
  } else {
    const patch = new BufferGeometry();
    patch.setAttribute("position", new Float32BufferAttribute([-1, 0.02, -0.8, -0.9, 0.02, 0.9, 1.2, 0.02, 0.7, 1, 0.02, -0.7], 3));
    patch.setIndex([0, 1, 2, 0, 2, 3]); patch.computeVertexNormals();
    patch.setAttribute("uv", new Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
    pieces.push(dyed(patch, leaf));
  }
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach((piece) => piece.dispose());
  return geometry;
}

export function createSpeciesBatch(species: GardenSpecies, placements: readonly SpeciesPlacement[], season: GardenSeason = "summer"): InstancedMesh<BufferGeometry, MeshStandardMaterial> {
  const material = new MeshStandardMaterial({ flatShading: true, roughness: 0.96, vertexColors: true });
  patchGardenFloraNight(material);
  patchGardenInstancedWindSway(material, SPECIES[species].height, SPECIES[species].flex);
  const mesh = new InstancedMesh(createSpeciesGeometry(species, season), material, placements.length);
  mesh.name = `garden-flora-${species}`;
  const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), position = new Vector3(), scale = new Vector3();
  const sway = new Float32Array(placements.length);
  placements.forEach((placement, i) => {
    rotation.setFromEuler(euler.set(placement.leanX ?? 0, placement.yaw ?? 0, placement.leanZ ?? 0));
    matrix.compose(position.set(...placement.position), rotation, scale.setScalar(placement.scale ?? 1));
    mesh.setMatrixAt(i, matrix);
    sway[i] = 0.7 + stableUnit(`flora.${species}.${i}`) * 0.5;
  });
  mesh.geometry.setAttribute("aGardenSway", new InstancedBufferAttribute(sway, 1));
  mesh.instanceMatrix.needsUpdate = true;
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

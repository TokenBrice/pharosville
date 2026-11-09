/** Test/driver fixtures only: never imported by the world runtime. */
import * as THREE from "three";
import { EffectPass, LUT3DEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import { HarbourMaterials, shaderFeatureKey } from "../world/materials";
import { createWorldUniforms } from "./uniforms";
import { seasonWeights } from "../season/calendar";
import { createFleetMaterials, type FleetUniforms } from "../fleet/fleet-material";
import { HouseFlags } from "../fleet/house-flags";
import { OCEAN_VERT, OCEAN_FRAG } from "../ocean/ocean-material";
import { FULLSCREEN_VERT } from "../ocean/gpu-bake";
import { BeamEffect, BeamSystem, ShimmerEffect, HALO_VERT, HALO_FRAG } from "../beam/beam-system";
import { FLAME_VERT, FLAME_FRAG, EMBER_VERT, EMBER_FRAG, GLOW_VERT, GLOW_FRAG, PLUME_VERT, PLUME_FRAG } from "../beam/fire";
import { BACKDROP_VERT, BACKDROP_FRAG, BAND_FRAG } from "../sky/sky-system";
import { DitherEffect, SCRUB_FRAG } from "./post";
import { chainedKitMaterial, posedDepthMaterial } from "../life/figure-kit";
import { CONTACT_FRAG, CONTACT_VERT } from "../world/contact-shadows";

export type GeometryMode = "static" | "instanced" | "batched";
export interface ShaderRecipe {
  id: string;
  geometry: GeometryMode;
  material: THREE.Material;
}
export interface CalendarRecipe { day: number; key: string; biolum: boolean }

/** SeasonSystem resolves whole calendar days; southern days are a permutation of these same 365 days. */
export function calendarRecipes(): CalendarRecipe[] {
  const u = createWorldUniforms(), mats = new HarbourMaterials(u), seen = new Set<string>(), out: CalendarRecipe[] = [];
  for (let day = 1; day <= 365; day++) {
    u.uSeasonPhase.value = (day - 1) / 365; u.uFoliage.value.set(...seasonWeights(day));
    const key = shaderFeatureKey(mats.featureIdentity()), biolum = u.uFoliage.value.y > 0.001;
    const signature = `${key}:${biolum}`;
    if (!seen.has(signature)) { seen.add(signature); out.push({ day, key, biolum }); }
  }
  mats.dispose();
  return out;
}

export function assembleShader(material: THREE.Material): THREE.WebGLProgramParametersWithUniforms {
  const raw = material as THREE.ShaderMaterial;
  const lib = material instanceof THREE.MeshDepthMaterial ? THREE.ShaderLib.depth : THREE.ShaderLib.standard;
  const shader = {
    vertexShader: raw.isShaderMaterial ? raw.vertexShader : lib.vertexShader,
    fragmentShader: raw.isShaderMaterial ? raw.fragmentShader : lib.fragmentShader,
    uniforms: raw.isShaderMaterial ? { ...raw.uniforms } : THREE.UniformsUtils.clone(lib.uniforms),
    defines: { ...raw.defines },
  } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

/** Each callback owns a recipe only until it returns; the driver compiles/draws synchronously. */
export function visitShaderRecipes(visit: (recipe: ShaderRecipe) => void): void {
  const u = createWorldUniforms(), mats = new HarbourMaterials(u);
  const texture = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  const fleet: FleetUniforms = {
    uFleetData: { value: texture }, uFleetPaint: { value: texture }, uEmblems: { value: texture }, uBoards: { value: texture },
    uEmblemGrid: { value: new THREE.Vector4(1, 1, 1, 1) }, uBoardGrid: { value: new THREE.Vector4(1, 1, 1, 1) },
    uWind: { value: 0.3 }, uFleetTime: { value: 0 },
  };
  const ship = createFleetMaterials(mats, u, fleet);
  const seen = new Set<string>();
  const emit = (id: string, material: THREE.Material, geometry: GeometryMode = "static") => visit({ id, material, geometry });
  try {
    for (const calendar of calendarRecipes()) for (const lite of [false, true]) {
      u.uSeasonPhase.value = (calendar.day - 1) / 365; u.uFoliage.value.set(...seasonWeights(calendar.day)); mats.setLite(lite);
      const signature = shaderFeatureKey(mats.featureIdentity());
      if (seen.has(signature)) continue;
      seen.add(signature);
      // All production kit callers use the default fallback pattern 0; COLOR_0 selects authored patterns at runtime.
      for (const geometry of ["static", "instanced"] as const) {
        emit(`kit/${signature}/${geometry}/colour`, mats.kit(), geometry);
        emit(`kit/${signature}/${geometry}/depth`, mats.kitDepth(), geometry);
      }
      for (const geometry of ["static", "instanced"] as const) emit(`kit/${signature}/${geometry}/predepth`, mats.kitDepth(true), geometry);
      emit(`fleet/${signature}/batched/colour`, ship.material, "batched");
    }
    emit("fleet/batched/depth", ship.depth, "batched");
    for (const [name, material] of Object.entries({ window: mats.window(), emissive: mats.emissive(), lens: mats.lens({ value: 1 }), glass: mats.glass() })) {
      emit(`world/${name}`, material);
    }
    const hooks = { vertexHead: "", vertexPose: "", fragmentHead: "// fixture head", emissive: "// fixture emission", uniforms: {} };
    const life = chainedKitMaterial(mats, "identity", hooks), lifeDepth = posedDepthMaterial("identity", hooks);
    emit("life/colour", life, "instanced"); emit("life/depth", lifeDepth, "instanced"); life.dispose(); lifeDepth.dispose();
    const flags = new HouseFlags(u, { texture, grid: fleet.uEmblemGrid.value } as unknown as ConstructorParameters<typeof HouseFlags>[1], 1);
    emit("fleet/flags", flags.mesh.material as THREE.Material, "instanced"); flags.dispose();
    const raw = (id: string, vertexShader: string, fragmentShader: string, defines = {}) => {
      const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, defines });
      emit(id, material); material.dispose();
    };
    for (const biolum of [false, true]) for (const lite of [false, true]) {
      const material = new THREE.ShaderMaterial({ vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG,
        defines: { ...(biolum ? { HB_BIOLUM: "" } : {}), ...(lite ? { HB_LITE: "" } : {}) } });
      material.customProgramCacheKey = () => `hb_ocean_${Number(biolum)}_${Number(lite)}`;
      emit(`ocean/${biolum ? "summer" : "other"}/${lite ? "low" : "full"}`, material); material.dispose();
    }
    raw("beam/halo", HALO_VERT, HALO_FRAG);
    for (const [name, vertex, fragment] of [
      ["flame", FLAME_VERT, FLAME_FRAG], ["ember", EMBER_VERT, EMBER_FRAG], ["glow", GLOW_VERT, GLOW_FRAG], ["plume", PLUME_VERT, PLUME_FRAG],
    ]) raw(`beam/${name}`, vertex, fragment);
    raw("sky/dome", BACKDROP_VERT, BACKDROP_FRAG); raw("sky/band", FULLSCREEN_VERT, BAND_FRAG);
    raw("world/contact-shadows", CONTACT_VERT, CONTACT_FRAG);
    raw("post/scrub", "varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }", SCRUB_FRAG);
    const camera = new THREE.PerspectiveCamera();
    const beam = new BeamSystem() as unknown as { U: Record<string, THREE.Uniform>; SH: Record<string, THREE.Uniform> };
    const beamPass = new EffectPass(camera, new ShimmerEffect(new Map(Object.entries(beam.SH))), new BeamEffect(new Map(Object.entries(beam.U))));
    beamPass.recompile(); emit("beam/shimmer-shaft", beamPass.fullscreenMaterial); beamPass.dispose();
    const lut = new THREE.Data3DTexture(new Uint16Array(32 ** 3 * 4), 32, 32, 32);
    lut.format = THREE.RGBAFormat; lut.type = THREE.HalfFloatType; // as engine/post.ts builds the grade LUT
    const post = new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
      new LUT3DEffect(lut, { inputColorSpace: THREE.SRGBColorSpace }), new VignetteEffect({ offset: 0.28, darkness: 0.42 }), new DitherEffect(0));
    post.recompile(); emit("post/grade-dither", post.fullscreenMaterial); post.dispose(); lut.dispose();
  } finally { ship.material.dispose(); ship.depth.dispose(); mats.dispose(); texture.dispose(); }
}

import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { GUST_GLSL, type GustService } from "../weather/gust";

/**
 * 08-T3 — crowns, vines, pergola leaf and laundry breathe with the wind (decorative; re-uses the weather's wind,
 * adds no signal). island.glb carries a per-vertex `_SWAY` weight (Blender `hb_export.bake_sway`, stored ×100:
 * 0 at a trunk, up to ~80 at a cypress tip, 100 at a cloth hem); the kit material bends those vertices downwind
 * along `uWindVec` (the weather director's wind incl. gusts — the one the flags read), a few cm at 0.29 Hz (+ a 0.47 Hz flutter),
 * each tree on its own phase (low-frequency noise of world xz). Meshes without the attribute read 0 and stay still.
 * Reduced motion → `uSwayK` 0 (every vertex at rest). Shadows stay static (the default depth pass), acceptable at
 * this amplitude.
 *
 * Gusts: `hbSwayGust(xz)` reads the shared spatial gust field (weather/gust.ts), so a cat's-paw that darkens the
 * water and heels the ships also stirs the crowns it crosses (scaled by the DEWS wind strength, as everywhere).
 */

/** Sway gain: 1 = full, 0 = still (reduced motion). Written once a frame by {@link updateSway}. */
export const swayUniforms = {
  uSwayK: { value: 1 } as THREE.IUniform<number>,
  /** The gust service's (dir x, dir z, amp, time), copied once a frame by {@link updateSway}. */
  uSwayGust: { value: new THREE.Vector4(0.6, 0.8, 0, 0) } as THREE.IUniform<THREE.Vector4>,
};

/** Metres of bend at weight 1: calm floor + wind-proportional share (|uWindVec| ≈ 0..1.4). Mirrors the GLSL. */
export const SWAY_AMP = { calm: 0.05, perWind: 0.22 } as const;
export function swayAmplitude(weight: number, wind: number, k: number): number {
  return weight * k * (SWAY_AMP.calm + SWAY_AMP.perWind * Math.min(Math.max(wind, 0), 1.4));
}

export const SWAY_VERTEX_DECL = /* glsl */ `
attribute float _sway;
uniform vec2 uSwayWind;
uniform float uSwayK;
uniform float uSwayTime;
float hbSwayHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hbSwayNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hbSwayHash(i), hbSwayHash(i + vec2(1.0, 0.0)), f.x), mix(hbSwayHash(i + vec2(0.0, 1.0)), hbSwayHash(i + vec2(1.0)), f.x), f.y);
}
// the shared spatial gust field (weather/gust.ts) multiplies the wind here; 1 = between gusts
uniform vec4 uSwayGust;
${GUST_GLSL}
float hbSwayGust(vec2 xz) {
  #ifdef HB_LITE
  return 1.0;   // (Low tier: the crowns sway with the wind alone, not the passing paws)
  #endif
  return 1.0 + 0.8 * uSwayGust.z * hbGust(xz, uSwayGust.w, uSwayGust.xy);
}
// world-space bend of a vertex of weight w (0..1) at world position wp
vec3 hbSway(vec3 wp, float w) {
  float wind = length(uSwayWind) * hbSwayGust(wp.xz);
  vec2 dir = wind > 1e-3 ? uSwayWind / max(length(uSwayWind), 1e-3) : vec2(0.84, -0.54);
  float ph = hbSwayNoise(wp.xz * 0.11) * 6.2832;                  // ~9 m: one phase per tree, continuous within it
  // fixed frequencies (a spatially varying one would drift a crown's vertices out of phase over the minutes)
  float s = sin(6.2832 * 0.29 * uSwayTime + ph);
  float s2 = sin(6.2832 * 0.47 * uSwayTime + ph * 1.7 + wp.y * 0.6);  // a lighter flutter across the wind
  float amp = w * uSwayK * (${SWAY_AMP.calm.toFixed(3)} + ${SWAY_AMP.perWind.toFixed(3)} * clamp(wind, 0.0, 1.4));
  vec2 d = dir * amp * (0.45 + 0.55 * s) + vec2(-dir.y, dir.x) * amp * 0.3 * s2;
  return vec3(d.x, -0.12 * amp * abs(s), d.y);
}
`;

/** After three's begin_vertex: bend `transformed` (object space; island meshes are unrotated, unit scale). */
export const SWAY_VERTEX_APPLY = /* glsl */ `
  if (_sway > 0.5 && uSwayK > 0.0) {
    vec3 hbSwW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    transformed += (vec4(hbSway(hbSwW, _sway * 0.01), 0.0) * modelMatrix).xyz;
  }
`;

/** Per frame: reduced motion stills every swaying vertex. */
export function updateSway(ctx: EngineContext): void {
  const reduced = (ctx.services.get("motion") as { reduced?: boolean } | undefined)?.reduced ?? false;
  swayUniforms.uSwayK.value = reduced ? 0 : 1;
  const gust = ctx.services.get("gust") as GustService | undefined;
  if (gust) swayUniforms.uSwayGust.value.copy(gust.uniform.value);
}

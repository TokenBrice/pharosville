import * as THREE from "three";

/**
 * Aerial distance tint (01-A1 / 02-L3, operator decision D-2): DECORATIVE, never data. Solids beyond the harbour
 * settle into the same air as the sea and sky: blended toward the hour's haze (uHaze / uHorizon, the colours the
 * horizon is painted with) and slightly desaturated, by camera distance × the hour's `uFogDensity`.
 *
 * It is NOT the stale-data fog (readings/fog.ts): it is static (no noise, no drift, no animation), capped at
 * AERIAL_CAP, zero inside the harbour radius (so the heart and the Pharos are untouched), and identical in every data
 * state (it reads only the clock's haze keys). House flags and crests use their own materials and are exempt; the
 * fleet exempts the hovered / selected hull and its pennant. Legend: "distance".
 *
 * Module-level uniforms (like cloud-shadow) so the kit materials bind them without a context; the ocean system sets
 * the scene centre and radii from the layout. Until then the tint is off (w = 0).
 */
export const AERIAL_CAP = 0.28;

export const aerialUniforms = {
  /** x, y scene centre (world xz), z harbour radius (tint starts), w radius where the world-space ramp is full (0 = off) */
  uAerial: { value: new THREE.Vector4(0, 0, 0, 0) } as THREE.IUniform<THREE.Vector4>,
  /** the cap this frame: AERIAL_CAP by day, less at night so lamps keep their glow (set with uAerial) */
  uAerialCap: { value: AERIAL_CAP } as THREE.IUniform<number>,
  /** xyz unit sun direction, w daylight Mie forward-scatter strength (0 at night; strictly time-of-day, never data) */
  uAerialSun: { value: new THREE.Vector4(0, 1, 0, 0) } as THREE.IUniform<THREE.Vector4>,
};

/** Called once a frame by the ocean system (it owns the layout's sea frame). */
export function updateAerial(centerX: number, centerZ: number, harbourR: number, fullR: number, night: number): void {
  aerialUniforms.uAerial.value.set(centerX, centerZ, harbourR, fullR);
  aerialUniforms.uAerialCap.value = AERIAL_CAP * (1 - 0.45 * night);
}

/**
 * Called once a frame by SkySystem with the clock's sun direction and night weight (strictly decorative/time-of-day,
 * identical across all data states so StaleFog stays semantically separate).
 */
export function updateAerialSun(sunDir: THREE.Vector3, night: number): void {
  const sunUp = THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.08);
  const lowSun = 1 - THREE.MathUtils.smoothstep(sunDir.y, 0.08, 0.55);
  const mie = sunUp * (1 - night) * (0.14 + 0.34 * lowSun);
  aerialUniforms.uAerialSun.value.set(sunDir.x, sunDir.y, sunDir.z, mie);
}

/**
 * Binds uAerialDensity = uFogDensity and uAerialHaze = uHaze (aliased: no clash with other chunks); needs uHorizon.
 * Height-integrated exponential density decay (`exp(-max(wp.y, 0.0) / 85.0)`) lets low distant coasts settle into air
 * while tall cliffs and the Pharos stay crisp, strictly zero inside `uAerial.z` and capped at `uAerialCap`.
 * Fragment stage adds a sun-facing Mie forward-scatter lobe (`pow(max(dot(vDir, uAerialSun.xyz), 0.0), 6.0)`) and a
 * subtle cool receding-layer veil peaking at mid aerial depth (`k * (1.0 - k) * 4.0 * 0.08`).
 * PERF: distance/height attenuation is computed per vertex (`hbAerialVert`); only the colour mix runs per fragment.
 */
export const AERIAL_VERT_GLSL = /* glsl */ `
uniform vec4 uAerial;
uniform float uAerialCap, uAerialDensity;
varying float vHbAerial;
void hbAerialVert(vec3 wp) {
  if (uAerial.w <= 0.0) { vHbAerial = 0.0; return; }
  float kr = smoothstep(uAerial.z, uAerial.w, length(wp.xz - uAerial.xy));
  float camD = length(cameraPosition - wp);
  float hScale = exp(-max(wp.y, 0.0) / 85.0);
  float kd = 1.0 - exp(-max(camD - 350.0, 0.0) * uAerialDensity * 1.6 * hScale);
  vHbAerial = min(kr * kd, uAerialCap);
}
`;

export const AERIAL_GLSL = /* glsl */ `
uniform vec3 uAerialHaze;
uniform vec4 uAerialSun;
varying float vHbAerial;
void hbAerial(inout vec3 c, vec3 wp, float keep) {
  float k = vHbAerial * (1.0 - keep);
  if (k <= 0.0) return;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), k * 0.58);
  vec3 air = mix(uAerialHaze, uHorizon, 0.4);
  if (uAerialSun.w > 1e-4) {
    vec3 vd = wp - cameraPosition;
    float vl = length(vd);
    vec3 vDir = vl > 1e-3 ? vd / vl : vec3(0.0, 0.0, -1.0);
    float mie = pow(max(dot(vDir, uAerialSun.xyz), 0.0), 6.0) * uAerialSun.w;
    air += uHorizon * vec3(1.15, 0.92, 0.68) * mie;
    float veil = smoothstep(0.0, 0.14, uAerialSun.w) * (1.0 - k) * 0.22;
    air = mix(air, mix(uAerialHaze, uHorizon, 0.25) * vec3(0.86, 0.95, 1.12), veil);
  }
  c = mix(c, air, k);
}
`;

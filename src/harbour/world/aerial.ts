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
};

/** Called once a frame by the ocean system (it owns the layout's sea frame). */
export function updateAerial(centerX: number, centerZ: number, harbourR: number, fullR: number, night: number): void {
  aerialUniforms.uAerial.value.set(centerX, centerZ, harbourR, fullR);
  aerialUniforms.uAerialCap.value = AERIAL_CAP * (1 - 0.45 * night);
}

/** Binds uAerialDensity = uFogDensity and uAerialHaze = uHaze (aliased: no clash with other chunks); needs uHorizon. */
export const AERIAL_GLSL = /* glsl */ `
uniform vec4 uAerial;
uniform float uAerialCap, uAerialDensity;
uniform vec3 uAerialHaze;
void hbAerial(inout vec3 c, vec3 wp, float keep) {
  if (uAerial.w <= 0.0) return;
  float kr = smoothstep(uAerial.z, uAerial.w, length(wp.xz - uAerial.xy));
  float camD = length(cameraPosition - wp);
  float kd = 1.0 - exp(-max(camD - 350.0, 0.0) * uAerialDensity * 1.6);
  // tall things (tower tops, masts) stay a little clearer; capped (less at night: lamps keep their glow)
  float k = min(kr * kd * (1.0 - 0.4 * smoothstep(25.0, 110.0, wp.y)), uAerialCap) * (1.0 - keep);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l), k * 0.6);
  c = mix(c, mix(uAerialHaze, uHorizon, 0.4), k);
}
`;

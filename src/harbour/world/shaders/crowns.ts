import * as THREE from "three";
import { LOW_SUN_GLSL } from "../../fleet/sail-light-glsl";

/** Scene-linear luminance cap of a crown's glow: under the bloom threshold, like the sails' cloth. */
export const CROWN_GLOW_CAP = 0.35;
/** The sun-facing shadow lookup's offset toward the sun (m): a crown's own far side is not its occluder. */
export const CROWN_SUN_STEP_M = 2;

/**
 * E21 backlit crowns (O2-I7; decorative: time of day only). Leaf patterns 8 and 14 take the sails' low-sun
 * transmission (fleet/sail-light-glsl.ts): view-dependent (strongest looking toward the sun), only in the 4°..22°
 * window, gone by the blue hour (the moon keys the night), × (1 − bare)(1 − snow). One sun-facing hardware-PCF tap
 * at P + L·2 m keeps crowns behind buildings (and a crown's thick core) dark, so the light reads as warm rims.
 * Capped at .35 scene-linear.
 * Medium and High only (the Low kit program never contains it); `?extras=-crowns` leaves it out at boot.
 * Inserted after shadowmap_pars_fragment: it reads three's directional shadow declarations.
 */
export const CROWN_GLSL = /* glsl */ `
${LOW_SUN_GLSL}
uniform float uNight;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
#endif
float hbCrownLit() {
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0 && defined( SHADOWMAP_TYPE_PCF )
    if (!receiveShadow) return 1.0;
    vec4 c = vDirectionalShadowCoord[ 0 ] + directionalShadowMatrix[ 0 ] * vec4(uHbSunDir * ${CROWN_SUN_STEP_M.toFixed(1)}, 0.0);
    c.xyz /= c.w;
    c.z += directionalLightShadows[ 0 ].shadowBias;
    if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
    return mix(1.0, texture(directionalShadowMap[ 0 ], c.xyz), directionalLightShadows[ 0 ].shadowIntensity);
  #else
    return 1.0;
  #endif
}
vec3 hbCrownGlow(vec3 leaf, float pid, vec3 vc, vec3 N, vec3 V, float snow) {
  float k = 0.55 * pow(max(0.0, dot(-V, uHbSunDir)), 3.0) * hbLowSun(uHbSunDir.y) * (1.0 - smoothstep(0.5, 0.85, uNight)) * max(0.0, dot(-N, uHbSunDir));
  float lumS = hbLuma(uHbSunColor);
  if (k <= 1e-3 || lumS <= 1e-4) return vec3(0.0);
  float keep = (1.0 - hbLeafFall() * (1.0 - hbEvergreen(pid, vc))) * (1.0 - snow);
  vec3 g = leaf * mix(vec3(1.0), min(uHbSunColor / lumS, vec3(2.0)), 0.6) * lumS * k * keep;
  float lg = hbLuma(g);
  if (lg <= 1e-5) return vec3(0.0);
  return g * min(1.0, ${CROWN_GLOW_CAP.toFixed(2)} / lg) * hbCrownLit();
}
`;

/** The call in the kit's lighting block: a uniform test first, so no fragment pays outside low sun. */
export const CROWN_CALL_GLSL = /* glsl */ `
    if (uHbSunDir.y > -0.02 && uHbSunDir.y < 0.375 && hbLeafPid(hbPid) > 0.5) outgoingLight += hbCrownGlow(diffuseColor.rgb, hbPid, hbVc, hbNw, hbVw, hbSnow) * hbCs;   // E21 backlit crowns`;

const luma = (c: THREE.Vector3) => c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722;
const ss = THREE.MathUtils.smoothstep;

/** Reference of hbCrownGlow (tests): N, V and sunDir are unit world vectors, V toward the camera. */
export function crownGlowOf(o: {
  leaf: THREE.Vector3; N: THREE.Vector3; V: THREE.Vector3; sunDir: THREE.Vector3; sunColor: THREE.Vector3;
  night?: number; bare?: number; snow?: number; lit?: number;
}): THREE.Vector3 {
  const { leaf, N, V, sunDir, sunColor, night = 0, bare = 0, snow = 0, lit = 1 } = o;
  const low = (1 - ss(sunDir.y, 0.07, 0.375)) * ss(sunDir.y, -0.02, 0.03);
  const k = 0.55 * Math.max(0, -V.dot(sunDir)) ** 3 * low * (1 - ss(night, 0.5, 0.85)) * Math.max(0, -N.dot(sunDir));
  const lumS = luma(sunColor);
  if (k <= 1e-3 || lumS <= 1e-4) return new THREE.Vector3();
  const hue = sunColor.clone().divideScalar(lumS).min(new THREE.Vector3(2, 2, 2));
  const g = leaf.clone().multiply(new THREE.Vector3(1, 1, 1).lerp(hue, 0.6)).multiplyScalar(lumS * k * (1 - bare) * (1 - snow));
  const lg = luma(g);
  if (lg <= 1e-5) return new THREE.Vector3();
  return g.multiplyScalar(Math.min(1, CROWN_GLOW_CAP / lg) * lit);
}

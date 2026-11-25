import * as THREE from "three";
import { SWELL_PHASE_GLSL } from "../ocean/waves";

/**
 * 3-Zone Mediterranean intertidal stone masonry & wet run-up line (03-O3 + Phase 1 WS1.4, decorative):
 * quay walls, mole faces and rocks carry three physical coastal weathering zones down to `-4.3 m` so submerged
 * stonework viewed through Phase 1 refraction matches the waterline seamlessly:
 *  1. Submerged & tidal algal biofilm (`W.y ∈ [-4.3, +0.42 m]`): organic broken olive-brown marine patina
 *     (darkening deeper underwater), matte submerged algae roughness `0.26–0.38`.
 *  2. Splash / salt-crust band (`W.y ∈ [+0.45, +1.15 m]`): subtle pale caliche/salt rim on exposed coastal stone.
 *  3. Swell-synced wet glaze: relaxed steepness gate (`1.0 - smoothstep(0.25, 0.72, N.y)`), driven by the main
 *     62 m swell phase (`ocean/waves.ts hbSwellPhase`) + `uRunup.x` on the sea clock (stills under reduced motion),
 *     darkening stone and pulling roughness to `0.09` to catch sky-coherent `hbEnvSpec`.
 * Steep stone only (ashlar, rock, render, plain), never hulls or ground. Strictly B07/C04 compliant.
 */
export const runupUniforms = {
  /** x sea amplitude scale (uSea.x), y sea time (s; the MotionClock) */
  uRunup: { value: new THREE.Vector2(0.24, 0) } as THREE.IUniform<THREE.Vector2>,
};

/** Needs hbIs (GLSL_LEAF_FALL) and hbNoise (GLSL_NOISE). */
export const RUNUP_GLSL = /* glsl */ `
#ifndef HB_DECL_URUNUP
#define HB_DECL_URUNUP
uniform vec2 uRunup;
#endif
${SWELL_PHASE_GLSL}
void hbRunup(inout vec3 alb, inout float rough, vec3 W, vec3 N, float pid) {
#ifndef HB_FLEET
  float stone = hbIs(pid, 2.0) + hbIs(pid, 5.0) + hbIs(pid, 10.0) + hbIs(pid, 0.0) * 0.6;
  if (stone <= 0.0 || W.y > 2.0 || W.y < -4.3) return;
  float steep = 1.0 - smoothstep(0.25, 0.72, N.y);
  float bioN = hbNoise(W * 1.15) * 0.65 + hbNoise(W * 3.4 + 11.3) * 0.35;
  float bio = (1.0 - smoothstep(0.18, 0.48, W.y + bioN * 0.14)) * smoothstep(-4.35, -3.9, W.y) * stone * steep;
  float subDeep = 1.0 - smoothstep(-1.4, 0.05, W.y);
  vec3 bioCol = mix(vec3(0.36, 0.44, 0.30), vec3(0.24, 0.31, 0.21), subDeep * 0.65);
  float saltN = hbNoise(W * 1.85 + 23.7);
  float salt = smoothstep(0.38, 0.62, W.y) * (1.0 - smoothstep(0.95, 1.32, W.y)) * steep * stone * (0.45 + 0.55 * saltN);
  vec2 cell = floor(W.xz / 7.0);
  float ph = fract(-hbSwellPhase(W.xz, uRunup.y) * 0.15915494 + fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * 0.35);
  float reach = (0.22 + 0.55 * uRunup.x) * (0.5 + 0.5 * pow(1.0 - ph, 1.5));
  float wet = (1.0 - smoothstep(reach - 0.06, reach + 0.1, W.y)) * smoothstep(-0.35, 0.08, W.y) * steep * stone;
  alb = mix(alb, vec3(0.76, 0.74, 0.68), salt * (1.0 - wet * 0.5) * 0.16);
  alb *= mix(vec3(1.0), bioCol, bio * 0.72);
  rough = mix(rough, mix(0.26, 0.38, subDeep), bio * 0.85);
  alb *= 1.0 - 0.50 * wet;
  rough = mix(rough, 0.09, wet * 0.88);
#endif
}
`;

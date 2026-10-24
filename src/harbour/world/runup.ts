import * as THREE from "three";

/**
 * Wet run-up line on stone (03-O3, decorative): quay walls, mole faces and rocks darken in a band above the sea that
 * each arriving swell re-wets to its full reach and that then dries down slowly (a sawtooth per stretch of wall).
 * The reach scales with the declared sea state's amplitude (uSea.x, off-peg share) like the shore foam already does;
 * it runs on the sea clock, so it stills under reduced motion. Steep stone only (ashlar, rock, render, plain), never
 * hulls or ground. Module-level uniform, set each frame by the ocean system.
 */
export const runupUniforms = {
  /** x sea amplitude scale (uSea.x), y sea time (s; the MotionClock) */
  uRunup: { value: new THREE.Vector2(0.24, 0) } as THREE.IUniform<THREE.Vector2>,
};

/** Needs hbIs (GLSL_LEAF_FALL). */
export const RUNUP_GLSL = /* glsl */ `
uniform vec2 uRunup;
void hbRunup(inout vec3 alb, inout float rough, vec3 W, vec3 N, float pid) {
  float stone = hbIs(pid, 2.0) + hbIs(pid, 5.0) + hbIs(pid, 10.0) + hbIs(pid, 0.0) * 0.6;
  if (stone <= 0.0 || W.y > 2.0 || W.y < -0.6) return;
  float steep = 1.0 - smoothstep(0.45, 0.8, N.y);
  vec2 cell = floor(W.xz / 7.0);
  float ph = fract(uRunup.y * 0.105 + fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * 0.35 + dot(W.xz, vec2(0.011, 0.007)));
  float reach = (0.22 + 0.55 * uRunup.x) * (0.5 + 0.5 * pow(1.0 - ph, 1.5));
  float wet = (1.0 - smoothstep(reach - 0.06, reach + 0.1, W.y)) * steep * stone;
  alb *= 1.0 - 0.32 * wet;
  rough = mix(rough, 0.32, wet * 0.6);
}
`;

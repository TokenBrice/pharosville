import { OCEAN_DISP_GLSL } from "./ocean-disp";

/**
 * Ocean vertex shader (Phase 2 §5.1–§5.5):
 * - High/Medium (`uProjGridOn > 0.5`): evaluates Johanson camera-centered Projected Grid directly on Y = 0
 *   using clip-depth weights (`uGridWeights.xy`) for uniform screen-space vertex density and zero horizon singularities.
 * - Low (`uProjGridOn <= 0.5`): reads static adaptive world-space plane vertices (`position`).
 * - Applies shared `hbOceanDisp` (3-cascade FFT + phase-locked `WAVES[0]` + bathymetric shoaling & shore wrapping on
 *   High/Med; 5-wave Gerstner on Low) plus signed 3D Kelvin wake ridge height from `uWakeLive.a` (`uLiveBounds`).
 */
export const OCEAN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform vec2 uSceneCenter;
uniform float uProjGridOn;
uniform vec2 uGridBL, uGridBR, uGridTL, uGridTR;
uniform vec4 uGridWeights;
uniform sampler2D uWakeLive;
uniform vec4 uLiveBounds;
uniform float uRibbonsOn;
varying vec3 vWorld;
varying float vDamp;
${OCEAN_DISP_GLSL}
vec2 hbGridXZ(vec2 uv) {
  float wN = max(uGridWeights.x, 1.0);
  float wF = max(uGridWeights.y, 1.0);
  vec2 nearXZ = mix(uGridBL, uGridBR, uv.x);
  vec2 farXZ = mix(uGridTL, uGridTR, uv.x);
  float a = (1.0 - uv.y) * wF;
  float b = uv.y * wN;
  return (nearXZ * a + farXZ * b) / max(a + b, 1e-4);
}
void main() {
  vec3 p = uProjGridOn > 0.5 ? vec3(hbGridXZ(position.xy).x, 0.0, hbGridXZ(position.xy).y) : position;
  vec2 suv = (p.xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float mf = smoothstep(470.0, 560.0, length(p.xz - uSceneCenter));
  float coast = mix(200.0, (mix(textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r, 1.0, smoothstep(470.0, 560.0, length(p.xz - uSceneCenter))) - 0.5) * 128.0, inside);
  float depth = mix(40.0, mix(textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).g, 1.0, mf) * 40.0, inside);
  float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
  float camD = length(p.xz - uCameraPos.xz);
  float amp = uSea.x * damp * (1.0 - smoothstep(2500.0, 5000.0, camD));
  vec2 shoreN = vec2(0.0);
  #ifndef HB_LITE
  if (uFftOn > 0.5) shoreN = hbShoreNormal(uSdf, suv, coast, inside);
  #endif
  vec3 disp = hbOceanDisp(p.xz, uTime, amp, damp, camD, depth, coast, shoreN);
  #ifndef HB_LITE
  if (uRibbonsOn > 0.5) {
    vec2 ruv = (p.xz - uLiveBounds.xy) / max(uLiveBounds.zw - uLiveBounds.xy, vec2(1.0));
    vec2 re = min(ruv, 1.0 - ruv);
    float rIn = smoothstep(0.0, 0.04, min(re.x, re.y));
    if (rIn > 0.001) {
      float kelH = textureLod(uWakeLive, clamp(ruv, 0.0, 1.0), 0.0).a;
      disp.y += clamp(kelH, -0.45, 0.55) * rIn * (1.0 - smoothstep(260.0, 720.0, camD));
    }
  }
  #endif
  p += disp;
  vWorld = p;
  vDamp = damp;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

import { wavesGLSL } from "../waves";

export const OCEAN_VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec4 uSea;            // x amplitude scale, y chop, z whitecaps, w foam bands
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
varying vec3 vWorld;
varying float vDamp;
${wavesGLSL()}
void main() {
  vec3 p = position;
  vec2 suv = (p.xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float coast = mix(200.0, (textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r - 0.5) * 128.0, inside);
  float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
  float camD = length(p.xz - uCameraPos.xz);
  float amp = uSea.x * damp * (1.0 - smoothstep(2500.0, 5000.0, camD));
  p += gerstnerDisp(p.xz, uTime, amp);
  vWorld = p;
  vDamp = damp;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

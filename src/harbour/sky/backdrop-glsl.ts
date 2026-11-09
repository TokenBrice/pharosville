import { SKY_BAND_GLSL } from "./sky-glsl";

export const BACKDROP_VERT = /* glsl */ `
uniform vec3 uCam; uniform float uFwdAzV, uR, uSpan, uYBot, uYTop;
varying float vTh; varying float vY;
void main() {
  float u = (position.x - 0.5) * 2.0 * tan(uSpan);
  vec2 f = vec2(sin(uFwdAzV), -cos(uFwdAzV)), r = vec2(cos(uFwdAzV), sin(uFwdAzV));
  vec2 h = uCam.xz + (f + r * u) * uR;
  vec3 wp = vec3(h.x, mix(uYBot, uYTop, position.y), h.y);
  vTh = degrees(atan(u));
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const BACKDROP_FRAG = /* glsl */ `
${SKY_BAND_GLSL}
uniform vec3 uCam; uniform float uR, uPxDeg;
varying float vTh; varying float vY;
void main() {
  float e = degrees(atan((vY - uCam.y) / uR) - atan(-uCam.y / uR));
  vec3 c = skyBand(vTh, e, uPxDeg);
  c += (sbHash(gl_FragCoord.xy) - 0.5) / 255.0;       // de-band
  gl_FragColor = vec4(c, 1.0);
}`;

export const BAND_FRAG = /* glsl */ `
#define SKY_REFLECTION
${SKY_BAND_GLSL}
uniform vec4 uRange;
varying vec2 vUv;
void main() {
  float th = mix(uRange.x, uRange.y, vUv.x), e = mix(uRange.z, uRange.w, vUv.y);
  gl_FragColor = vec4(skyBand(th, e, 0.25), 1.0);
}`;

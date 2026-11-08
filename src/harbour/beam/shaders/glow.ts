export const GLOW_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xyz += normalize(-mv.xyz) * 9.0;           // in front of the colonnade
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;

export const GLOW_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uK;
varying vec2 vQ;
void main() {
  // a tall soft glow round the flames (no hot pinpoint: that read as an electric bulb)
  vec2 e = vec2(vQ.x, (vQ.y + 0.12) * 0.62);
  float r2 = dot(e, e);
  float g = exp(-r2 * 11.0) * 0.42 + exp(-r2 * 4.0) * 0.15;
  gl_FragColor = vec4(uCol * g * uK * (1.0 - smoothstep(0.35, 1.0, dot(vQ, vQ))), 1.0);
}`;

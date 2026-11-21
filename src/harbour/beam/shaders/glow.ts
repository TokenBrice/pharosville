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
  // sculpted warm atmospheric haze cradling the tholos lantern columns (never a harsh white bulb)
  vec2 e = vec2(vQ.x * 0.92, (vQ.y + 0.10) * 0.60);
  float r2 = dot(e, e);
  float inner = exp(-r2 * 13.0) * 0.36;
  float outer = exp(-r2 * 3.4) * 0.17;
  vec3 col = mix(uCol, mix(uCol, vec3(1.0, 0.85, 0.55), 0.35), smoothstep(0.05, 0.35, inner));
  gl_FragColor = vec4(col * (inner + outer) * uK * (1.0 - smoothstep(0.32, 1.0, dot(vQ, vQ))), 1.0);
}`;

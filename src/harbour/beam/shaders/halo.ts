export const HALO_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xyz += normalize(-mv.xyz) * 6.0;               // pull toward the camera past the lantern glass
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;

// star flare: a tight core, a faint glow and a thin four-point glint (never a sphere)
export const HALO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uCore, uGlow, uStreak;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float core = exp(-r * r * 1400.0) * uCore;
  float glow = (exp(-r * r * 60.0) * 0.12 + exp(-r * 9.0) * 0.03) * uGlow;
  float ax = abs(vQ.x), ay = abs(vQ.y);
  float star = (exp(-ay * 220.0) * exp(-ax * 5.5) + exp(-ax * 220.0) * exp(-ay * 9.0) * 0.6) * uStreak;
  float diag = exp(-abs(vQ.x - vQ.y) * 300.0) + exp(-abs(vQ.x + vQ.y) * 300.0);
  star += diag * exp(-r * 14.0) * 0.25 * uStreak;
  gl_FragColor = vec4(uColor * (core + glow + star) * (1.0 - smoothstep(0.85, 1.0, r)), 1.0);
}`;

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

// optical star flare: incandescent inner core, delicate warm aureole and crisp four-point glint (never a flat ball)
export const HALO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uCore, uGlow, uStreak;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float r2 = r * r;
  float core = exp(-r2 * 1600.0) * uCore;
  float aureole = exp(-r2 * 140.0) * 0.22 * uGlow;
  float glow = (exp(-r2 * 52.0) * 0.11 + exp(-r * 8.5) * 0.028) * uGlow;
  float ax = abs(vQ.x), ay = abs(vQ.y);
  float star = (exp(-ay * 240.0) * exp(-ax * 5.2) + exp(-ax * 240.0) * exp(-ay * 8.8) * 0.62) * uStreak;
  float diag = exp(-abs(vQ.x - vQ.y) * 320.0) + exp(-abs(vQ.x + vQ.y) * 320.0);
  star += diag * exp(-r * 13.5) * 0.28 * uStreak;
  vec3 hotCore = mix(uColor, vec3(1.0, 0.96, 0.88), 0.55);
  vec3 col = hotCore * (core + star * 0.55) + uColor * (aureole + glow + star * 0.55);
  gl_FragColor = vec4(col * (1.0 - smoothstep(0.84, 1.0, r)), 1.0);
}`;

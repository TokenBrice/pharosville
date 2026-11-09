export const FLAME_VERT = /* glsl */ `
attribute vec4 aCard;        // x, z offset (m), width, height
attribute vec3 aSeed;        // x phase, y rand, z yaw off the camera (crossed sheets)
uniform vec3 uOrigin;
uniform float uFireT;
uniform float uLevel;
uniform vec4 uWind;          // xy downwind (x, z), z strength
varying vec2 vUv;
varying vec3 vSeed;
void main() {
  // cylindrical billboard turned a little off the camera, so the tongues cross in depth instead of stacking
  vec3 c = uOrigin + vec3(aCard.x, 0.0, aCard.y);
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  vec3 fwd = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  float cy = cos(aSeed.z), sy = sin(aSeed.z);
  vec3 f2 = vec3(fwd.x * cy - fwd.z * sy, 0.0, fwd.x * sy + fwd.z * cy);
  vec3 right = vec3(f2.z, 0.0, -f2.x);
  float ph = aSeed.x * 6.28;
  // each tongue breathes on its own clock: it leaps, gutters and leaps again
  float leap = 0.68 + 0.2 * sin(uFireT * (2.1 + aSeed.y * 1.6) + ph) + 0.12 * sin(uFireT * (5.3 + aSeed.y * 2.0) + ph * 3.1);
  float h = aCard.w * leap * mix(0.25, 1.0, uLevel);
  vec2 q = position.xy;                         // x -0.5..0.5, y 0..1
  float sway = (sin(uFireT * (1.9 + aSeed.y) + ph) * 0.22 + sin(uFireT * 4.7 + ph * 2.0) * 0.08) * q.y * q.y;
  vec3 p = c + right * (q.x * aCard.z + sway * aCard.z) + vec3(0.0, q.y * h, 0.0);
  // the tips lean downwind
  p.xz += uWind.xy * (0.3 + 1.2 * uWind.z) * q.y * q.y * h * 0.12;
  p += fwd * 0.6;                               // a little toward the viewer so the brazier rim never clips the base
  vUv = vec2(q.x + 0.5, q.y);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

// premultiplied "over-additive" blending (ONE, ONE_MINUS_SRC_ALPHA): overlapping tongues keep their colour
// instead of summing to an electric white; only the low core runs white-gold
export const FLAME_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uFireT;
uniform float uLevel;
uniform float uGain;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vSeed;
void main() {
  float u = vUv.x - 0.5, v = vUv.y;
  float sp = 0.55 + 0.35 * vSeed.y;
  // the tongue's outline wanders with low-frequency noise and tapers to a point
  float wob = texture2D(uNoise, vec2(v * 0.35 + vSeed.x, uFireT * 0.23 * sp + vSeed.y)).r - 0.5;
  float hw = mix(0.46, 0.05, pow(max(v, 0.0), 0.75));
  float body = 1.0 - smoothstep(hw * 0.55, hw, abs(u - wob * 0.32 * v));
  // vertically stretched scrolling noise tears the upper half into licks
  vec2 nuv = vec2(u * 0.9 + vSeed.x, v * 0.38 - uFireT * (0.62 * sp + 0.15));
  float n = texture2D(uNoise, nuv).g * 0.62 + texture2D(uNoise, nuv * 2.3 + 0.37).b * 0.42;
  float a = body * smoothstep(v * 1.05 - 0.08, v * 1.05 + 0.18, n * 1.25 + 0.16) * smoothstep(0.0, 0.07, v);
  if (a < 0.01) discard;
  // heat: white-gold low in the core, orange body, deep red torn tips that darken toward soot
  float core = (1.0 - smoothstep(0.0, 0.4, abs(u) / max(hw, 0.05))) * (1.0 - smoothstep(0.05, 0.55, v));
  float heat = clamp((1.0 - v) * 0.85 * a + core * 0.55 - 0.08, 0.0, 1.0);
  vec3 tip = vec3(0.62, 0.05, 0.01), body2 = vec3(1.0, 0.34, 0.04), gold = vec3(1.0, 0.66, 0.18), white = vec3(1.0, 0.9, 0.62);
  vec3 col = heat < 0.35 ? mix(tip, body2, heat / 0.35) : heat < 0.7 ? mix(body2, gold, (heat - 0.35) / 0.35) : mix(gold, white, (heat - 0.7) / 0.3);
  col *= mix(0.5, 1.0, smoothstep(0.1, 0.45, heat));          // the torn tips are dim, not glowing
  col *= uTint;
  float k = a * uLevel;
  gl_FragColor = vec4(col * k * uGain * (0.6 + 0.9 * heat), k * 0.75);
}`;

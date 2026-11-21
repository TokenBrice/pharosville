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
  float ph = aSeed.x * 6.2831;
  // each tongue breathes on its own clock: leaps, curls and gutters organically
  float leap = 0.66 + 0.21 * sin(uFireT * (2.2 + aSeed.y * 1.7) + ph) + 0.13 * sin(uFireT * (5.6 + aSeed.y * 2.2) + ph * 3.1);
  float h = aCard.w * leap * mix(0.25, 1.0, uLevel);
  vec2 q = position.xy;                         // x -0.5..0.5, y 0..1
  float sway = (sin(uFireT * (2.0 + aSeed.y * 1.1) + ph) * 0.25 + sin(uFireT * 5.1 + ph * 2.1) * 0.09) * q.y * q.y;
  vec3 p = c + right * (q.x * aCard.z + sway * aCard.z) + vec3(0.0, q.y * h, 0.0);
  // the tips lean downwind with turbulence
  p.xz += uWind.xy * (0.32 + 1.25 * uWind.z) * q.y * q.y * h * 0.13;
  p += fwd * 0.6;                               // a little toward the viewer so the brazier rim never clips the base
  vUv = vec2(q.x + 0.5, q.y);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

// premultiplied "over-additive" blending (ONE, ONE_MINUS_SRC_ALPHA): overlapping tongues keep sculptural
// blackbody colour instead of summing to flat electric white; only the dense low core runs incandescent white-gold
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
  float sp = 0.58 + 0.36 * vSeed.y;
  // swirling two-frequency outline wander + upward curl
  float wob1 = texture2D(uNoise, vec2(v * 0.34 + vSeed.x, uFireT * 0.24 * sp + vSeed.y)).r - 0.5;
  float wob2 = texture2D(uNoise, vec2(v * 0.85 - vSeed.y, uFireT * 0.48 * sp + vSeed.x)).g - 0.5;
  float wob = wob1 * 0.72 + wob2 * 0.28;
  float hw = mix(0.47, 0.04, pow(max(v, 0.0), 0.72));
  float uShift = u - wob * 0.36 * v;
  float body = 1.0 - smoothstep(hw * 0.48, hw, abs(uShift));
  // vertically stretched multi-octave scrolling turbulence tears the upper half into sculptural licks
  vec2 nuv = vec2(uShift * 0.95 + vSeed.x, v * 0.36 - uFireT * (0.66 * sp + 0.16));
  float n1 = texture2D(uNoise, nuv).g;
  float n2 = texture2D(uNoise, nuv * 2.25 + vec2(0.37, -uFireT * 0.22)).b;
  float n3 = texture2D(uNoise, nuv * 4.1 + vec2(0.71, uFireT * 0.12)).r;
  float n = n1 * 0.54 + n2 * 0.34 + n3 * 0.16;
  float a = body * smoothstep(v * 1.04 - 0.08, v * 1.04 + 0.16, n * 1.3 + 0.14) * smoothstep(0.0, 0.06, v);
  if (a < 0.01) discard;
  // volumetric blackbody temperature: incandescent white-gold core → molten amber → fiery orange → smoky crimson tips
  float core = (1.0 - smoothstep(0.0, 0.42, abs(uShift) / max(hw, 0.05))) * (1.0 - smoothstep(0.04, 0.58, v));
  float heat = clamp((1.0 - v) * 0.84 * a + core * 0.62 - 0.06, 0.0, 1.0);
  vec3 soot = vec3(0.48, 0.03, 0.005);
  vec3 crimson = vec3(0.95, 0.18, 0.02);
  vec3 orange = vec3(1.0, 0.44, 0.06);
  vec3 gold = vec3(1.0, 0.76, 0.26);
  vec3 white = vec3(1.0, 0.95, 0.76);
  vec3 col = heat < 0.25 ? mix(soot, crimson, heat / 0.25)
    : heat < 0.52 ? mix(crimson, orange, (heat - 0.25) / 0.27)
    : heat < 0.78 ? mix(orange, gold, (heat - 0.52) / 0.26)
    : mix(gold, white, (heat - 0.78) / 0.22);
  col *= mix(0.48, 1.08, smoothstep(0.08, 0.48, heat));
  col *= uTint;
  float k = a * uLevel;
  gl_FragColor = vec4(col * k * uGain * (0.62 + 0.98 * heat), k * 0.78);
}`;

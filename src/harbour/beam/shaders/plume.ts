export const PLUME_VERT = /* glsl */ `
attribute vec4 aSeed;        // x slot 0..1, y rand, z rand, w rand
uniform vec3 uOrigin;
uniform float uSmokeT;
uniform vec4 uWind;
uniform float uPlumeScale;   // 1 the lit column; ~0.5 the banked fire's thin wisp
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
varying vec3 vWp;
void main() {
  vSeed = aSeed.yw;
  float life = fract(uSmokeT * 0.028 + aSeed.x);
  float w = uWind.z;
  float rise = (58.0 - 24.0 * w) * (1.0 - exp(-life * 2.0)) * 1.15;
  float drift = (10.0 + 80.0 * w) * life * life + 5.0 * life;
  vec3 c = uOrigin + vec3(uWind.x * drift, rise, uWind.y * drift);
  // each puff wanders off the axis: a billowing column, not a rod
  float ph = uSmokeT * 0.1 + aSeed.y * 6.28 + life * 2.4;
  vec2 off = vec2(sin(ph), cos(ph * 0.83)) * (1.2 + 7.0 * life) + (aSeed.zw - 0.5) * 6.0 * life;
  c.xz += off;
  float size = (3.2 + 19.0 * life) * (0.75 + 0.5 * aSeed.z) * uPlumeScale;
  c.xz = mix(uOrigin.xz, c.xz, 0.4 + 0.6 * uPlumeScale);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (right * position.x + up * position.y) * size;
  vWp = wp;
  vUv = position.xy;
  vLife = life;
  vAlpha = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.35, 1.0, life));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const PLUME_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uFireUnder;
uniform float uOpacity;
uniform sampler2D uNoise;
uniform vec3 uBeamPos;
uniform float uBeamAngle;
uniform vec3 uBeamLight;
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
varying vec3 vWp;
// 05-P7a the beam lights the smoke as it swings under the drifting column: a soft lamp-coloured flare on
// the puffs above the shaft's ground track, fading with height over it (night only: uBeamLight is 0 by day)
float plumeBeam(vec3 p) {
  vec2 rel = p.xz - uBeamPos.xz;
  vec2 bd = vec2(cos(uBeamAngle), sin(uBeamAngle));
  float along = dot(rel, bd);
  float lat = abs(rel.x * bd.y - rel.y * bd.x);
  float w = 5.0 + max(along, 0.0) * 0.12;
  return exp(-lat * lat / (w * w)) * smoothstep(-2.0, 10.0, along) * exp(-max(p.y - uBeamPos.y, 0.0) / 45.0);
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // billowy edge: a soft ball eroded by noise that slowly turns with the puff's age
  float n = texture2D(uNoise, vUv * 0.32 + vSeed + vLife * 0.25).r;
  float a = pow(max(1.0 - r * r, 0.0), 1.5) * smoothstep(0.15, 0.75, n * 1.25 - r * 0.35 + 0.2);
  vec3 col = mix(uShade, uLit, clamp(0.65 + 0.5 * vUv.y, 0.0, 1.0));
  // the fire lights the smoke from below (the night read: a glowing column over the lantern, the underside
  // of each puff warm, fading as the column climbs out of the firelight)
  col += uFireUnder * (1.0 - smoothstep(0.0, 0.5, vLife)) * clamp(0.75 - 0.65 * vUv.y, 0.0, 1.0);
  if (dot(uBeamLight, vec3(1.0)) > 1e-4) col += uBeamLight * plumeBeam(vWp) * clamp(0.8 - 0.5 * vUv.y, 0.2, 1.0) * 0.9;
  gl_FragColor = vec4(col, a * vAlpha * uOpacity * (1.0 - 0.5 * vLife));
}`;

// two populations: brisk glowing sparks spat between the tholos columns, and a curling rising helix of
// embers lifted out of the dome vent on the thermal draft, cooling from incandescent gold to crimson ash
export const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;        // x phase, y rand, z rand, w rand (< 0.42: brazier spark, else the vent column)
uniform vec3 uOrigin;
uniform vec3 uVent;
uniform float uFireT;
uniform float uLevel;
uniform vec4 uWind;          // xy downwind (x, z), z strength
uniform float uPx;           // projection scale (px per metre at 1 m)
varying float vA;
varying float vLife;
varying float vHot;
void main() {
  bool spark = aSeed.w < 0.42;
  float life = fract(uFireT * (spark ? 0.17 + 0.12 * aSeed.y : 0.055 + 0.045 * aSeed.y) + aSeed.x);
  float ang = aSeed.z * 6.2831;
  vec3 p;
  if (spark) {
    float r = 0.5 + 6.8 * life * (0.38 + aSeed.w * 1.1);
    float swirl = ang + life * (2.6 + 1.4 * aSeed.y);
    p = uOrigin + vec3(cos(swirl) * r, 1.2 + life * (9.5 + 12.0 * aSeed.y), sin(swirl) * r);
    p.xz += uWind.xy * (2.2 + 15.0 * uWind.z) * life * life;
  } else {
    // rising thermal helix widening and leaning downwind as embers cool
    float rise = life * (28.0 + 34.0 * aSeed.y);
    float r = 0.45 + 1.4 * aSeed.z + 5.2 * life;
    float sw = uFireT * (0.75 + 0.65 * aSeed.y) + ang + life * 1.8;
    p = uVent + vec3(cos(sw) * r, rise, sin(sw) * r);
    p.xz += uWind.xy * (4.5 + 28.0 * uWind.z) * life * life;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.52 + 0.48 * sin(uFireT * (9.5 + 9.0 * aSeed.y) + aSeed.w * 43.0);
  vA = uLevel * (1.0 - smoothstep(0.5, 1.0, life)) * smoothstep(0.0, 0.04, life) * flick;
  vLife = life;
  vHot = spark ? 1.0 : 0.65;
  float sz = (spark ? 0.38 : 0.46 * (1.0 - 0.48 * life)) * (0.75 + 0.5 * aSeed.y);
  gl_PointSize = clamp(sz * uPx / max(-mv.z, 1.0), 1.3, 5.5);
}`;

export const EMBER_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uGain;
varying float vA;
varying float vLife;
varying float vHot;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float glow = exp(-d * 3.8) * (1.0 - d);
  vec3 hot = mix(vec3(1.0, 0.78, 0.34), vec3(1.0, 0.94, 0.68), vHot * (1.0 - smoothstep(0.0, 0.35, vLife)));
  vec3 cool = vec3(0.88, 0.16, 0.02);
  vec3 c = mix(hot, cool, smoothstep(0.0, 0.72, vLife));
  gl_FragColor = vec4(c * uTint * glow * vA * uGain * 1.35, 1.0);
}`;

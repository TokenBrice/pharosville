// two populations: sparks spat out of the brazier between the columns, and a tall column of embers carried up
// out of the dome's vent on the hot air, cooling from gold to red as they rise and drift downwind
export const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;        // x phase, y rand, z rand, w rand (< 0.4: brazier spark, else the vent column)
uniform vec3 uOrigin;
uniform vec3 uVent;
uniform float uFireT;
uniform float uLevel;
uniform vec4 uWind;          // xy downwind (x, z), z strength
uniform float uPx;           // projection scale (px per metre at 1 m)
varying float vA;
varying float vLife;
void main() {
  bool spark = aSeed.w < 0.4;
  float life = fract(uFireT * (spark ? 0.16 + 0.1 * aSeed.y : 0.055 + 0.04 * aSeed.y) + aSeed.x);
  float ang = aSeed.z * 6.2831;
  vec3 p;
  if (spark) {
    float r = 0.6 + 6.0 * life * (0.4 + aSeed.w);
    p = uOrigin + vec3(cos(ang + life * 2.5) * r, 1.5 + life * (9.0 + 10.0 * aSeed.y), sin(ang + life * 2.5) * r);
    p.xz += uWind.xy * (2.0 + 14.0 * uWind.z) * life * life;
  } else {
    // a loose rising column: a slow helix that widens and leans downwind as it climbs
    float rise = life * (26.0 + 30.0 * aSeed.y);
    float r = 0.5 + 1.2 * aSeed.z + 4.5 * life;
    float sw = uFireT * (0.7 + 0.6 * aSeed.y) + ang;
    p = uVent + vec3(cos(sw) * r, rise, sin(sw) * r);
    p.xz += uWind.xy * (4.0 + 26.0 * uWind.z) * life * life;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.55 + 0.45 * sin(uFireT * (9.0 + 8.0 * aSeed.y) + aSeed.w * 40.0);
  vA = uLevel * (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.0, 0.05, life) * flick;
  vLife = life;
  float sz = spark ? 0.34 : 0.42 * (1.0 - 0.5 * life);
  gl_PointSize = clamp(sz * uPx / -mv.z, 1.2, 5.0);
}`;

export const EMBER_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uGain;
varying float vA;
varying float vLife;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  vec3 c = mix(vec3(1.0, 0.72, 0.3), vec3(0.85, 0.16, 0.03), smoothstep(0.0, 0.7, vLife));
  gl_FragColor = vec4(c * uTint * (1.0 - d) * vA * uGain, 1.0);
}`;

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
  float life = fract(uSmokeT * 0.026 + aSeed.x);
  float w = uWind.z;
  float rise = (62.0 - 24.0 * w) * (1.0 - exp(-life * 2.05)) * 1.15;
  float drift = (11.0 + 82.0 * w) * life * life + 5.5 * life;
  vec3 c = uOrigin + vec3(uWind.x * drift, rise, uWind.y * drift);
  // billowing vortex curl off the axis: lush sculpted smoke column
  float ph = uSmokeT * 0.11 + aSeed.y * 6.2831 + life * 2.6;
  vec2 off = vec2(sin(ph), cos(ph * 0.83)) * (1.3 + 7.6 * life) + (aSeed.zw - 0.5) * 6.4 * life;
  c.xz += off;
  float size = (3.4 + 20.5 * life) * (0.76 + 0.48 * aSeed.z) * uPlumeScale;
  c.xz = mix(uOrigin.xz, c.xz, 0.4 + 0.6 * uPlumeScale);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (right * position.x + up * position.y) * size;
  vWp = wp;
  vUv = position.xy;
  vLife = life;
  vAlpha = smoothstep(0.0, 0.07, life) * pow(max(1.0 - smoothstep(0.36, 0.98, life), 0.0), 1.05);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const PLUME_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uSunRim;
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
  float w = 5.2 + max(along, 0.0) * 0.12;
  return exp(-lat * lat / (w * w)) * smoothstep(-2.0, 10.0, along) * exp(-max(p.y - uBeamPos.y, 0.0) / 48.0);
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // two-octave billowing cumulus density: sculpted puff interior and tattered drifting edge
  float ang = vSeed.x * 6.2831 + vLife * 0.55;
  float ca = cos(ang), sa = sin(ang);
  vec2 rUv = mat2(ca, -sa, sa, ca) * vUv;
  float n1 = texture2D(uNoise, rUv * 0.30 + vSeed + vLife * 0.22).r;
  float n2 = texture2D(uNoise, rUv * 0.68 - vSeed * 1.3 + vec2(0.2, vLife * 0.35)).g;
  float billow = n1 * 0.66 + n2 * 0.34;
  float soft = pow(max(1.0 - r * r, 0.0), 1.40);
  float a = soft * smoothstep(0.16, 0.72, billow * 1.26 - r * 0.34 + 0.20);
  if (a < 0.005) discard;
  // self-shadowed puff shading: sunlit top & billowing crests vs cool shaded core/underside
  float topShade = clamp(0.55 + 0.46 * vUv.y + (billow - 0.5) * 0.40, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, topShade);
  // delicate silver-warm forward/rim scattering along windward upper edges by day
  float rimEdge = smoothstep(0.26, 0.78, r) * (1.0 - smoothstep(0.78, 1.0, r)) * smoothstep(-0.12, 0.75, vUv.y);
  col += uSunRim * (rimEdge * 0.50 + smoothstep(0.52, 0.90, billow) * smoothstep(0.0, 0.8, vUv.y) * 0.22);
  // firelight glowing warmly up through the belly and lower curl of young puffs at dusk & night
  float underMask = (1.0 - smoothstep(0.0, 0.52, vLife)) * clamp(0.82 - 0.68 * vUv.y + (0.5 - billow) * 0.25, 0.0, 1.0);
  col += uFireUnder * underMask;
  if (dot(uBeamLight, vec3(1.0)) > 1e-4) col += uBeamLight * plumeBeam(vWp) * clamp(0.85 - 0.5 * vUv.y, 0.2, 1.0) * 1.05;
  gl_FragColor = vec4(col, a * vAlpha * uOpacity * (1.0 - 0.34 * vLife));
}`;

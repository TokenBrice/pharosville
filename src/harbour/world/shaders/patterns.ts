import { PATTERN_LEAF_EVERGREEN } from "./constants";

// ------------------------------------------------------------------ GLSL

export const GLSL_NOISE = /* glsl */ `
float hbWhite(vec3 c) {
  uvec3 q = uvec3(ivec3(floor(c)) + 65536);
  q = q * uvec3(1597334673u, 3812015801u, 2798796415u);
  uint n = (q.x ^ q.y ^ q.z) * 1597334673u;
  n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;
  return float(n) * (1.0 / 4294967295.0);
}
float hbNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hbWhite(i), b = hbWhite(i + vec3(1, 0, 0)), c = hbWhite(i + vec3(0, 1, 0)), d = hbWhite(i + vec3(1, 1, 0));
  float e = hbWhite(i + vec3(0, 0, 1)), g = hbWhite(i + vec3(1, 0, 1)), h = hbWhite(i + vec3(0, 1, 1)), k = hbWhite(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
// Blender-like noise (detail 2 → 3 octaves, roughness 0.5), ~[0,1] centred on 0.5
float hbFbm(vec3 p) { return (hbNoise(p) * 0.5714 + hbNoise(p * 2.03 + 17.1) * 0.2857 + hbNoise(p * 4.01 + 41.7) * 0.1429); }
`;

export const GLSL_PATTERNS = /* glsl */ `
uniform float uTime;
varying vec3 vHbLocal;
varying vec3 vHbLocalN;
varying vec3 vHbWorld;

// AA'd seam: 1 on the seam line. Faded to its mean coverage when the period is under ~3 px.
// (dc = screen-space footprint of coord, computed outside the pattern branches)
float hbLine(float coord, float period, float width, float dc) {
  float f = fract(coord / period);
  float d = abs(f - 0.5) * 2.0;
  float l = smoothstep(1.0 - width - 0.02, 1.0 - width, d);
  return mix(l, width + 0.01, smoothstep(0.18, 0.45, dc / period));
}
// fade factor for per-element tints / fine noise
float hbFine(float dc, float period) { return 1.0 - smoothstep(0.25, 0.6, dc / period); }

// 2D cellular (cobbles): x = F1 distance, y = distance to the cell edge
vec2 hbVoronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg, mr; float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(hbWhite(vec3(n + g, 7.0)), hbWhite(vec3(n + g, 13.0)));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float ed = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = vec2(hbWhite(vec3(n + g, 7.0)), hbWhite(vec3(n + g, 13.0)));
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec2(sqrt(md), ed);
}

// Returns the albedo multiplier (rgb, includes a little per-element hue jitter); writes roughness.
vec3 hbPattern(float pid, out float rough) {
  // Blender object space: X = glTF x, Y = -glTF z, Z = glTF y
  vec3 P = vec3(vHbLocal.x, -vHbLocal.z, vHbLocal.y);
  vec3 N = normalize(vec3(vHbLocalN.x, -vHbLocalN.z, vHbLocalN.y));
  float az = abs(N.z);
  float vert = 1.0 - smoothstep(0.55, 0.8, az);
  vec2 hn = N.xy; float hl = length(hn);
  vec2 t = hl > 0.08 ? vec2(-hn.y, hn.x) / hl : vec2(1.0, 0.0);
  float u = dot(P.xy, t);
  // derivatives up-front (uniform control flow)
  vec3 dP = fwidth(P);
  float du = fwidth(u);
  vec3 W = vec3(vHbWorld.x, -vHbWorld.z, vHbWorld.y);
  float dW = fwidth(W.x) + fwidth(W.y);
  float f = 1.0;
  vec3 hue = vec3(0.0);
  rough = 0.78;
  if (pid < 0.5) {
    f = 1.0;
  } else if (pid < 1.5) {            // 1 boards: vertical cladding, per-board tint, dark groove
    float bi = floor(u / 0.22);
    float h = hbWhite(vec3(bi, 0.0, 3.0));
    float fine = hbFine(du, 0.22);
    f = (1.0 + (h * 0.12 - 0.06) * fine) * (1.0 - hbLine(u, 0.22, 0.10, du) * 0.38 * vert);
    hue = vec3(0.03, 0.0, -0.03) * (hbWhite(vec3(bi, 1.0, 9.0)) - 0.5) * fine;
  } else if (pid < 2.5) {            // 2 ashlar: coursed stone, staggered joints, per-block tint
    float row = floor(P.z / 0.55);
    float su = u / 1.05 + row * 0.5;
    float jt = max(hbLine(P.z, 0.55, 0.09, dP.z), hbLine(su, 1.0, 0.05, du / 1.05) * vert);
    float fine = hbFine(dP.z, 0.55);
    float h = hbWhite(vec3(row, floor(su), 1.0));
    f = (1.0 + (h * 0.20 - 0.10) * fine) * (1.0 - jt * 0.42);
    hue = vec3(0.035, 0.01, -0.03) * (hbWhite(vec3(row, floor(su), 5.0)) - 0.5) * fine;
  } else if (pid < 3.5) {            // 3 planks_x: deck boards across x
    float pk = floor(P.x / 0.32);
    float fine = hbFine(dP.x, 0.32);
    f = (1.0 + (hbWhite(vec3(pk, 5.0, 0.0)) * 0.22 - 0.11) * fine) * (1.0 - hbLine(P.x, 0.32, 0.09, dP.x) * 0.55);
    hue = vec3(0.03, 0.0, -0.035) * (hbWhite(vec3(pk, 6.0, 2.0)) - 0.5) * fine;
  } else if (pid < 4.5) {            // 4 cobbles: voronoi setts
    float fine = hbFine(dP.x, 0.6);
    f = 0.86;
    if (fine > 0.0) {
      vec2 v = hbVoronoi(P.xy * 1.7);
      float edge = mix(0.55, 1.0, smoothstep(0.0, 0.09, v.y));
      f = mix(f, (0.9 + v.x * 0.22) * edge, fine);
    }
  } else if (pid < 5.5) {            // 5 rock: strata bands + speckle
    float sn = hbFbm(P * 0.108);
    float band = sin(P.z * 1.1 + sn * 6.0) * 0.5 + 0.5;
    float fine = hbFine(dP.z, 0.4);
    f = 0.86 + band * 0.2;
    if (fine > 0.0) f += (hbFbm(P * 2.6) - 0.5) * 0.18 * fine;
  } else if (pid < 6.5) {            // 6 grass: two-scale mottling
    float g1 = hbFbm(P * 0.08);
    float fine = hbFine(dP.x, 0.7);
    f = 0.82 + smoothstep(0.35, 0.65, g1) * 0.28;
    if (fine > 0.0) f += (hbFbm(P * 1.4) - 0.5) * 0.16 * fine;
    hue = vec3(-0.02, 0.0, 0.02) * (g1 - 0.5);
  } else if (pid < 7.5) {            // 7 tiles: vertical joints, rows are geometry
    float trow = floor(P.z / 0.36);
    float fine = hbFine(du, 0.34);
    f = (1.0 + (hbWhite(vec3(floor(u / 0.34 + trow * 0.5), trow, 2.0)) * 0.18 - 0.09) * fine) *
        (1.0 - hbLine(u + trow * 0.17, 0.34, 0.07, du) * 0.35);
  } else if (pid < 8.5 || abs(pid - ${PATTERN_LEAF_EVERGREEN.toFixed(1)}) < 0.25) {   // 8 leaf, 14 leaf_evergreen: up-facing lift + clumps
    f = (0.78 + N.z * 0.28) * (0.9 + hbFbm(P * 0.9) * 0.2);
  } else if (pid < 9.5) {            // 9 strakes: hull planking lines
    f = 1.0 - hbLine(P.z, 0.36, 0.06, dP.z) * 0.22;
    rough = 0.5;
  } else if (pid < 10.5) {           // 10 render: limewash, faint streaks + blotch
    f = 0.95 + hbFbm(P * vec3(0.6, 0.6, 0.12)) * 0.08;
  } else if (pid < 11.5) {           // 11 planks_y
    float pk = floor(P.y / 0.32);
    float fine = hbFine(dP.y, 0.32);
    f = (1.0 + (hbWhite(vec3(pk, 7.0, 0.0)) * 0.22 - 0.11) * fine) * (1.0 - hbLine(P.y, 0.32, 0.09, dP.y) * 0.55);
    hue = vec3(0.03, 0.0, -0.035) * (hbWhite(vec3(pk, 8.0, 2.0)) - 0.5) * fine;
  } else if (pid < 12.5) {           // 12 metal
    float fine = hbFine(dP.x, 0.3);
    f = 0.95;
    if (fine > 0.0) f += hbNoise(P * 4.0) * 0.1 * fine;
    rough = 0.48;
  } else if (pid < 13.5) {           // 13 slate: small staggered slates
    float srow = floor(P.z / 0.26);
    float fine = hbFine(du, 0.4);
    f = (1.0 + (hbWhite(vec3(floor(u / 0.4 + srow * 0.5), srow, 4.0)) * 0.24 - 0.12) * fine) *
        (1.0 - hbLine(u + srow * 0.2, 0.4, 0.06, du) * 0.3);
  }
  // world-space large breakup (cloud-like value drift)
  #ifdef HB_LITE
  float wn = hbNoise(W * 0.035);
  #else
  float wn = hbFbm(W * 0.035);
  #endif
  float fine = hbFine(dW, 1.5);
  float fworld = 0.93 + wn * 0.14;
  if (fine > 0.0) fworld += (hbNoise(W * 0.4) - 0.5) * 0.06 * fine;
  // flat-shaded facet value jitter (Bad North crystal read): one value per facet orientation
  float facet = hbWhite(floor(vHbLocalN * 23.0) + 3.0) - 0.5;
  return f * fworld * (1.0 + facet * 0.05) * (1.0 + hue);
}
`;

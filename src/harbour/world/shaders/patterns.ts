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

/**
 * Procedural kit patterns evaluated in Blender Z-up object space (`P.xy` horizontal, `P.z` vertical).
 * Pattern IDs:
 * - `0` under `HB_VEG_INSTANCED`: Mediterranean bark with vertical fissures (`P.xy * 6.5, P.z * 1.1`),
 *   horizontal plate breaks, matte roughness `0.86–0.94`, and vertical ridge bump (disabled under `HB_LITE`).
 * - `0` without `HB_VEG_INSTANCED`: plain stucco/stone plus coastal beach swash/ripple/wet-sand relief.
 * - `1` vertical boards, `2` coursed ashlar, `3` planks_x, `4` voronoi cobbles, `5` stratified limestone rock,
 *   `6` dead-matte grass (`0.91–0.96`, ±5% macro mottling), `7` terracotta barrel tiles, `8/14` leaf canopies
 *   (offset by `vVegMeta.w * 17.0` under `HB_VEG_INSTANCED`), `9` carvel strakes, `10` limewash render,
 *   `11` planks_y with butt joints, `12` hammered bronze, `13` staggered slates, `15` arable crops.
 * All fine relief and seams fade cleanly via `fwidth` (`hbFine`, `hbBumpFade`, `hbLine`, `hbGroove`), followed by
 * world-space value drift (`fworld`) and non-organic facet jitter (disabled on fleet & instanced vegetation).
 */
export const GLSL_VORONOI = /* glsl */ `vec2 hbVoronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
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
}`;

export const GLSL_PATTERNS = /* glsl */ `
uniform float uTime;
varying vec3 vHbLocal;
varying vec3 vHbLocalN;
varying vec3 vHbWorld;
#ifdef HB_VEG_INSTANCED
varying vec4 vVegMeta;
#endif
float hbLine(float coord, float period, float width, float dc) {
  float f = fract(coord / period);
  float d = abs(f - 0.5) * 2.0;
  float l = smoothstep(1.0 - width - 0.02, 1.0 - width, d);
  return mix(l, width + 0.01, smoothstep(0.18, 0.45, dc / period));
}
float hbFine(float dc, float period) { return 1.0 - smoothstep(0.25, 0.6, dc / period); }
float hbBumpFade(float dc, float period) { return 1.0 - smoothstep(0.14, 0.42, dc / period); }
float hbGroove(float coord, float period, float width, float dc) {
  float f = fract(coord / period);
  float d = min(f, 1.0 - f) * 2.0;
  float g = smoothstep(0.0, max(width * 2.2, 0.04), d);
  return mix(g, 1.0, smoothstep(0.14, 0.42, dc / period));
}
${GLSL_VORONOI}
#ifndef HB_LITE
float hbLeafCell(vec3 p) {
  vec3 b = floor(p - 0.5); float md = 4.0;
  for (int k = 0; k < 2; k++) for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec3 c = b + vec3(float(i), float(j), float(k));
    vec3 r = c + 0.5 + (fract(hbWhite(c + 23.0) * vec3(1.0, 17.31, 53.71)) - 0.5) * 0.22 - p;
    md = min(md, dot(r, r));
  }
  return sqrt(md);
}
#endif
vec3 hbPattern(float pid, out float rough, out float bumpH) {
  vec3 P = vec3(vHbLocal.x, -vHbLocal.z, vHbLocal.y);
  vec3 N = normalize(vec3(vHbLocalN.x, -vHbLocalN.z, vHbLocalN.y));
  float az = abs(N.z);
  float vert = 1.0 - smoothstep(0.55, 0.8, az);
  vec2 hn = N.xy; float hl = length(hn);
  vec2 t = hl > 0.08 ? vec2(-hn.y, hn.x) / hl : vec2(1.0, 0.0);
  float u = dot(P.xy, t);
  vec3 dP = fwidth(P);
  float du = fwidth(u);
  float dPxy = dP.x + dP.y;
  float dPxyz = dPxy + dP.z;
  vec3 W = vec3(vHbWorld.x, -vHbWorld.z, vHbWorld.y);
  float dW = fwidth(W.x) + fwidth(W.y);
  float f = 1.0;
  vec3 hue = vec3(0.0);
  rough = 0.78;
  bumpH = 0.0;
  if (pid < 0.5) {
    #ifdef HB_VEG_INSTANCED
    float fineB = hbFine(dPxyz, 0.28);
    float fissure = hbFbm(vec3(P.xy * 6.5, P.z * 1.1));
    float ridge = smoothstep(0.28, 0.72, fissure);
    float plate = 1.0 - smoothstep(0.0, 0.14, abs(fract(P.z * 2.8 + (fissure - 0.5) * 0.65) - 0.5));
    float plateBreak = plate * smoothstep(0.35, 0.75, hbNoise(vec3(P.xy * 2.4, floor(P.z * 2.8))));
    f = (0.80 + ridge * 0.30 * fineB + (1.0 - fineB) * 0.15) * (1.0 - plateBreak * 0.18 * fineB);
    hue = vec3(0.024, 0.010, -0.022) * (ridge - 0.5) * fineB;
    rough = clamp(mix(0.94, 0.86, ridge * fineB) + plateBreak * 0.04 * fineB, 0.86, 0.94);
    #ifndef HB_LITE
      bumpH = ((ridge - 0.5) * 0.032 - plateBreak * 0.016) * hbBumpFade(dPxyz, 0.28);
    #endif
    #else
    f = 1.0;
    rough = 0.76;
    #ifndef HB_LITE
      bumpH = (hbNoise(P * 3.8) - 0.5) * 0.004 * hbBumpFade(dPxyz, 0.35);
    #endif
    #ifndef HB_FLEET
      float beachMask = smoothstep(-0.4, 0.05, vHbWorld.y) * (1.0 - smoothstep(2.6, 4.4, vHbWorld.y)) * smoothstep(0.60, 0.85, N.z);
      if (beachMask > 0.01) {
        float fineMacro = hbFine(dW, 3.2);
        float fineS = hbFine(dW, 0.85);
        float ripWarp = hbFbm(W * 0.24);
        float swash = sin(dot(W.xy, vec2(0.76, 0.65)) * 1.96 + ripWarp * 4.2) * 0.5 + 0.5;
        float berm = hbFbm(W * 0.52) - 0.5;
        float ripple = sin(dot(W.xy, vec2(0.82, 0.57)) * 7.5 + ripWarp * 5.0) * 0.5 + 0.5;
        float peb = hbFbm(W * 2.1) - 0.5;
        float grit = hbNoise(W * 6.4) - 0.5;
        float wetSand = (1.0 - smoothstep(0.18, 1.48, vHbWorld.y + (ripWarp - 0.5) * 0.35)) * smoothstep(-0.35, 0.02, vHbWorld.y) * beachMask;
        float macroMod = ((swash - 0.5) * 0.11 + berm * 0.14) * fineMacro * beachMask * (1.0 - wetSand * 0.45);
        float fineMod = ((ripple - 0.5) * 0.06 + peb * 0.10 + grit * 0.05 * hbFine(dW, 0.22)) * fineS * beachMask * (1.0 - wetSand * 0.55);
        f = (1.0 + macroMod + fineMod) * (1.0 - 0.38 * wetSand);
        vec3 warmBiscuit = vec3(0.036, 0.020, -0.024) * beachMask + vec3(0.020, 0.010, -0.014) * berm * fineMacro * beachMask;
        hue = mix(warmBiscuit, vec3(-0.012, -0.024, -0.048), wetSand * 0.5);
        rough = mix(rough, 0.88 - 0.06 * swash * fineMacro - 0.04 * ripple * fineS, beachMask);
        rough = mix(rough, 0.20, wetSand * 0.85);
        #ifndef HB_LITE
          bumpH += ((swash - 0.5) * 0.085 * hbBumpFade(dW, 3.2)
                  + berm * 0.065 * hbBumpFade(dW, 2.2)
                  + (ripple - 0.5) * 0.020 * hbBumpFade(dW, 0.85)
                  + peb * 0.016 * hbBumpFade(dW, 0.55)
                  + grit * 0.008 * hbBumpFade(dW, 0.22)) * beachMask * (1.0 - wetSand * 0.50);
        #endif
      }
    #endif
    #endif
  } else if (pid < 1.5) {
    float bi = floor(u / 0.22);
    float h = hbWhite(vec3(bi, 0.0, 3.0));
    float fine = hbFine(du, 0.22);
    float seam = hbLine(u, 0.22, 0.10, du) * vert;
    float grain = hbNoise(vec3(u * 5.5, P.y * 5.5, P.z * 0.95)) - 0.5;
    f = (1.0 + (h * 0.12 - 0.06) * fine + grain * 0.045 * fine) * (1.0 - seam * 0.38);
    hue = vec3(0.03, 0.0, -0.03) * (hbWhite(vec3(bi, 1.0, 9.0)) - 0.5) * fine;
    rough = mix(0.74, 0.90, seam);
    #ifndef HB_LITE
      float bf = hbBumpFade(du, 0.22) * vert;
      bumpH = ((hbGroove(u, 0.22, 0.08, du) - 0.85) * 0.016 + grain * 0.005) * bf;
    #endif
  } else if (pid < 2.5) {
    float row = floor(P.z / 0.55);
    float su = u / 1.05 + row * 0.5;
    float jt = max(hbLine(P.z, 0.55, 0.09, dP.z), hbLine(su, 1.0, 0.05, du / 1.05) * vert);
    float fine = hbFine(dP.z, 0.55);
    float h = hbWhite(vec3(row, floor(su), 1.0));
    float pore = hbNoise(P * 4.6) - 0.5;
    f = (1.0 + (h * 0.20 - 0.10) * fine + pore * 0.045 * fine) * (1.0 - jt * 0.42);
    hue = vec3(0.035, 0.01, -0.03) * (hbWhite(vec3(row, floor(su), 5.0)) - 0.5) * fine;
    rough = mix(0.75 + (h - 0.5) * 0.08 * fine, 0.91, jt);
    #ifndef HB_LITE
      float bf = hbBumpFade(dP.z, 0.55);
      float blk = min(hbGroove(P.z, 0.55, 0.085, dP.z), mix(1.0, hbGroove(su, 1.0, 0.055, du / 1.05), vert));
      bumpH = ((blk - 0.82) * 0.030 + (h - 0.5) * 0.007 * blk + (hbFbm(P * 3.0) - 0.5) * 0.009) * bf;
    #endif
  } else if (pid < 3.5) {
    float pk = floor(P.x / 0.32);
    float fine = hbFine(dP.x, 0.32);
    float h = hbWhite(vec3(pk, 5.0, 0.0));
    float seam = hbLine(P.x, 0.32, 0.09, dP.x);
    float grain = hbNoise(vec3(P.x * 7.0, P.y * 1.2, P.z * 4.0)) - 0.5;
    f = (1.0 + (h * 0.22 - 0.11) * fine + grain * 0.04 * fine) * (1.0 - seam * 0.55);
    hue = vec3(0.03, 0.0, -0.035) * (hbWhite(vec3(pk, 6.0, 2.0)) - 0.5) * fine;
    rough = mix(0.70 + (h - 0.5) * 0.08 * fine, 0.92, seam);
    #ifndef HB_LITE
      bumpH = ((hbGroove(P.x, 0.32, 0.08, dP.x) - 0.85) * 0.018 + grain * 0.005) * hbBumpFade(dP.x, 0.32);
    #endif
  } else if (pid < 4.5) { // 4 cobbles
    rough = 0.80;
    float fine = hbFine(dP.x, 0.6);
    f = 0.86;
    if (fine > 0.0) {
      vec2 v = hbVoronoi(P.xy * 1.7);
      float edge = mix(0.52, 1.0, smoothstep(0.0, 0.09, v.y));
      float crown = smoothstep(0.0, 0.16, v.y) * (1.0 - 0.24 * v.x);
      float stoneTint = hbNoise(P * 2.1) - 0.5;
      f = mix(f, (0.89 + v.x * 0.22 + stoneTint * 0.08) * edge, fine);
      hue = vec3(0.032, 0.010, -0.024) * stoneTint * fine;
      rough = mix(0.80, mix(0.91, 0.62, crown), fine);
      #ifndef HB_LITE
        bumpH = ((crown - 0.58) * 0.046 + (hbNoise(P * 6.5) - 0.5) * 0.006) * hbBumpFade(dPxy, 0.6);
      #endif
    }
  } else if (pid < 5.5) { // 5 rock
    float sn = hbFbm(P * 0.108);
    float band = sin(P.z * 1.1 + sn * 6.0) * 0.5 + 0.5;
    float fine = hbFine(dP.z, 0.4);
    f = 0.86 + band * 0.2;
    if (fine > 0.0) f += (hbFbm(P * 2.6) - 0.5) * 0.18 * fine;
    float ledge = pow(band, 1.45);
    rough = mix(0.82, 0.65, ledge * 0.72);
    #ifndef HB_LITE
      bumpH = (ledge - 0.5) * 0.18 * hbBumpFade(dP.z + dP.x, 1.2);
      if (fine > 0.0) {
        float crackN = hbFbm(P * 2.2);
        float crack = 1.0 - smoothstep(0.0, 0.14, abs(crackN - 0.5));
        rough += crack * 0.12 * fine;
        bumpH += ((crackN - 0.5) * 0.068 - crack * 0.032) * hbBumpFade(dP.z + dP.x, 0.4);
      }
    #endif
  } else if (pid < 6.5) {
    float g1 = hbFbm(P * 0.08);
    float eco = hbNoise(W * 0.024 + 9.0) - 0.5;
    float fine = hbFine(dP.x, 0.7);
    f = (0.82 + smoothstep(0.35, 0.65, g1) * 0.28) * (1.0 + eco * 0.10);
    if (fine > 0.0) f += (hbFbm(P * 1.4) - 0.5) * 0.16 * fine;
    hue = vec3(0.09, 0.025, -0.08) * eco + vec3(-0.03, 0.0, 0.03) * (g1 - 0.5);
    rough = 0.96 - 0.05 * smoothstep(0.35, 0.65, g1);
    #ifndef HB_LITE
      bumpH = (hbNoise(P * 1.4) - 0.5) * 0.032 * hbBumpFade(dPxy, 0.75)
            + (hbNoise(P * 4.6) - 0.5) * 0.012 * hbBumpFade(dPxy, 0.25);
    #endif
  } else if (pid < 7.5) {
    float trow = floor(P.z / 0.36);
    float fine = hbFine(du, 0.34);
    float fineZ = hbFine(dP.z, 0.36);
    float rib = 0.5 + 0.5 * cos(u * 18.479957);
    float courseF = fract(P.z / 0.36);
    float tileCol = floor(u / 0.34);
    float tileRnd = hbWhite(vec3(tileCol, trow, 2.0));
    f = (1.0 + (tileRnd * 0.20 - 0.10) * fine)
      * mix(1.0, 0.82 + 0.26 * rib, fine)
      * mix(1.0, 0.84 + 0.18 * smoothstep(0.0, 0.18, courseF), fineZ);
    hue = vec3(0.04, 0.008, -0.025) * (hbWhite(vec3(tileCol, trow, 11.0)) - 0.5) * fine;
    rough = mix(0.72, mix(0.84, 0.58, rib), fine);
    #ifndef HB_LITE
      float courseStep = smoothstep(0.0, 0.14, courseF) * (1.0 - 0.38 * courseF);
      bumpH = (pow(rib, 0.78) - 0.5) * 0.044 * hbBumpFade(du, 0.34)
            + (courseStep - 0.45) * 0.024 * hbBumpFade(dP.z, 0.36);
    #endif
  } else if (pid < 8.5 || abs(pid - ${PATTERN_LEAF_EVERGREEN.toFixed(1)}) < 0.25) {
    float dPleaf = max(dP.x, max(dP.y, dP.z));
    #ifdef HB_VEG_INSTANCED
      vec3 Pl = P + vVegMeta.w * 17.0;
    #else
      vec3 Pl = P;
    #endif
    float macroClump = hbFbm(Pl * 0.62);
    float clump = hbFbm(Pl * 1.45);
    float tuft = hbFbm(Pl * 3.4);
    float sprig = hbNoise(Pl * 7.8) - 0.5;
    float fineMacro = hbFine(dPleaf, 2.0);
    float fineClump = hbFine(dPleaf, 0.95);
    float fineLeaf = hbFine(dPleaf, 0.42);
    float fineSprig = hbFine(dPleaf, 0.18);
    f = (0.72 + N.z * 0.34)
      * (0.81 + macroClump * 0.34 * fineMacro + (1.0 - fineMacro) * 0.17)
      * (1.0 + (clump - 0.5) * 0.28 * fineClump + (tuft - 0.5) * 0.24 * fineLeaf + sprig * 0.10 * fineSprig);
    hue = vec3(-0.028, 0.016, 0.026) * (0.5 - macroClump) * fineMacro
        + vec3(0.024, 0.014, -0.018) * (clump - 0.5) * fineClump
        + vec3(0.018, 0.010, -0.014) * (tuft - 0.5) * fineLeaf;
    float upCrown = smoothstep(0.22, 0.84, N.z);
    rough = mix(0.78, 0.50, upCrown * smoothstep(0.30, 0.72, macroClump * 0.5 + clump * 0.5));
    #ifndef HB_LITE
      bumpH = (macroClump - 0.5) * 0.18 * hbBumpFade(dPleaf, 2.0)
            + (clump - 0.5) * 0.13 * hbBumpFade(dPleaf, 1.0)
            + (tuft - 0.5) * 0.06 * hbBumpFade(dPleaf, 0.45)
            + sprig * 0.018 * hbBumpFade(dPleaf, 0.18);
      float cellFade = hbBumpFade(dPleaf, 0.40);
      if (cellFade > 0.005) {
        float dCell = hbLeafCell(Pl * 2.5 + vec3(clump - 0.5, tuft - 0.5, macroClump - 0.5) * 0.55);
        float rosette = 1.0 - smoothstep(0.14, 0.66, dCell);
        float cavity = smoothstep(0.42, 0.76, dCell);
        f *= mix(1.0, 1.04 - 0.22 * cavity, cellFade);
        bumpH += (rosette - 0.45) * 0.048 * cellFade;
      }
    #endif
  } else if (pid < 9.5) {
    #ifdef HB_FLEET
      float ux = clamp(vPaintC.x, -1.2, 1.2);
      float sz = P.z - 0.065 * P.x * ux;
      float sp = 0.28;
      float dS = dP.z + dP.x * 0.14;
    #else
      float sz = P.z;
      float sp = 0.36;
      float dS = dP.z;
    #endif
    float fineS = hbFine(dS, sp);
    float si = floor(sz / sp);
    float stRnd = hbWhite(vec3(si, 4.0, 9.0)) - 0.5;
    float seam = hbLine(sz, sp, 0.065, dS);
    float grain = hbNoise(vec3(P.x * 1.4, P.y * 1.4, sz * 11.0)) - 0.5;
    f = (1.0 - seam * 0.28) * (1.0 + stRnd * 0.10 * fineS + grain * 0.055 * fineS);
    hue = vec3(0.022, 0.005, -0.020) * (hbWhite(vec3(si, 11.0, 3.0)) - 0.5) * fineS;
    rough = mix(0.42 + stRnd * 0.05 * fineS + grain * 0.06 * fineS, 0.78, seam);
    #ifndef HB_LITE
      float lap = fract(sz / sp);
      float crest = sin(lap * 3.14159265);
      float caulk = hbGroove(sz, sp, 0.065, dS) - 0.88;
      bumpH = (caulk * 0.024 + (crest - 0.5) * 0.008 + grain * 0.004) * hbBumpFade(dS, sp);
    #endif
  } else if (pid < 10.5) {
    float st1 = hbFbm(P * vec3(0.6, 0.6, 0.14));
    float fineR = hbFine(dPxyz, 0.45);
    f = 0.94 + st1 * 0.09 + (hbNoise(P * 3.6) - 0.5) * 0.03 * fineR;
    rough = 0.82 - 0.07 * st1;
    #ifndef HB_LITE
      bumpH = (hbFbm(P * vec3(1.15, 1.15, 0.72)) - 0.5) * 0.018 * hbBumpFade(dPxyz, 0.6)
            + (hbNoise(P * 5.8) - 0.5) * 0.005 * hbBumpFade(dPxyz, 0.2);
    #endif
  } else if (pid < 11.5) {
    float pk = floor(P.y / 0.30);
    float fine = hbFine(dP.y, 0.30);
    float buttStagger = hbWhite(vec3(pk, 13.0, 5.0)) * 2.4;
    float buttCoord = P.x + buttStagger;
    float buttCell = floor(buttCoord / 2.4);
    float h = hbWhite(vec3(pk, buttCell, 7.0));
    float seam = max(hbLine(P.y, 0.30, 0.085, dP.y), hbLine(buttCoord, 2.4, 0.014, dP.x) * 0.85);
    float grain = hbNoise(vec3(P.x * 1.2, P.y * 7.5, P.z * 4.0)) - 0.5;
    f = (1.0 + (h * 0.22 - 0.11) * fine + grain * 0.045 * fine) * (1.0 - seam * 0.52);
    hue = vec3(0.03, 0.0, -0.035) * (hbWhite(vec3(pk, buttCell, 2.0)) - 0.5) * fine;
    rough = mix(0.68 + (h - 0.5) * 0.08 * fine, 0.92, seam);
    #ifndef HB_LITE
      float gPlank = min(hbGroove(P.y, 0.30, 0.08, dP.y), mix(1.0, hbGroove(buttCoord, 2.4, 0.016, dP.x), hbBumpFade(dP.x, 2.4)));
      bumpH = ((gPlank - 0.86) * 0.022 + grain * 0.005) * hbBumpFade(dP.y, 0.30);
    #endif
  } else if (pid < 12.5) {
    float fineM = hbFine(dPxy, 0.3);
    f = 0.95;
    rough = 0.46;
    if (fineM > 0.0) {
      float mGrain = hbNoise(P * 4.0);
      f += mGrain * 0.10 * fineM;
      rough -= 0.06 * mGrain * fineM;
      #ifndef HB_LITE
        bumpH = ((mGrain - 0.5) * 0.009 + (hbFbm(P * 2.1) - 0.5) * 0.007) * hbBumpFade(dPxyz, 0.35);
      #endif
    }
  } else if (pid < 13.5) {
    float srow = floor(P.z / 0.26);
    float fine = hbFine(du, 0.4);
    float sRnd = hbWhite(vec3(floor(u / 0.4 + srow * 0.5), srow, 4.0));
    f = (1.0 + (sRnd * 0.24 - 0.12) * fine) *
        (1.0 - hbLine(u + srow * 0.2, 0.4, 0.06, du) * 0.3);
    rough = mix(0.62, 0.52 + (sRnd - 0.5) * 0.08, fine);
    #ifndef HB_LITE
      float sCourse = smoothstep(0.0, 0.16, fract(P.z / 0.26));
      bumpH = (sCourse - 0.5) * 0.018 * hbBumpFade(dP.z, 0.26)
            + (hbGroove(u + srow * 0.2, 0.4, 0.06, du) - 0.85) * 0.012 * hbBumpFade(du, 0.4);
    #endif
  } else {
    rough = 0.88;
    #ifndef HB_LITE
      bumpH = (hbFbm(P * 1.2) - 0.5) * 0.030 * hbBumpFade(dPxy, 0.8);
    #endif
  }
  #ifdef HB_LITE
  float wn = hbNoise(W * 0.035);
  #else
  float wn = hbFbm(W * 0.035);
  #endif
  float fine = hbFine(dW, 1.5);
  float fworld = 0.93 + wn * 0.14;
  if (fine > 0.0) fworld += (hbNoise(W * 0.4) - 0.5) * 0.06 * fine;
  #if defined(HB_FLEET) || defined(HB_VEG_INSTANCED)
    float facet = 0.0;
  #else
    float organic = step(abs(pid - 5.0), 0.25) + step(abs(pid - 6.0), 0.25) + step(abs(pid - 8.0), 0.25)
                  + step(abs(pid - ${PATTERN_LEAF_EVERGREEN.toFixed(1)}), 0.25) + step(abs(pid - 15.0), 0.25);
    float facet = (hbWhite(floor(vHbLocalN * 23.0) + 3.0) - 0.5) * (1.0 - min(organic, 1.0));
  #endif
  return f * fworld * (1.0 + facet * 0.05) * (1.0 + hue);
}
`;

/** View-space bump from hbPattern's height (its own chunk: it takes derivatives, so it runs after the pattern's branches). */
export const GLSL_BUMP = /* glsl */ `
#ifndef HB_LITE
// Mikkelsen (2010) surface-gradient bump perturbation in view space: handles static, instanced & batched
// transforms automatically, with edge-straddle & grazing guards so creases and pattern joins stay clean.
vec3 hbApplyBump(vec3 N, float h, float pid, vec3 localN) {
  vec3 dPosX = dFdx(-vViewPosition);
  vec3 dPosY = dFdy(-vViewPosition);
  float dHx = dFdx(h);
  float dHy = dFdy(h);
  float pidJump = fwidth(pid);
  float nJump = length(dFdx(localN)) + length(dFdy(localN));
  float edge = (1.0 - smoothstep(0.01, 0.1, pidJump)) * (1.0 - smoothstep(0.18, 0.45, nJump));
  if (edge < 0.01 || (abs(dHx) + abs(dHy)) < 1e-7) return N;
  vec3 r1 = cross(dPosY, N);
  vec3 r2 = cross(N, dPosX);
  float det = dot(dPosX, r1);
  float ad = abs(det);
  if (ad < 1e-9) return N;
  vec3 grad = sign(det) * (dHx * r1 + dHy * r2) / ad;
  float gl = length(grad);
  grad *= min(1.0, 0.85 / max(gl, 1e-5)) * edge;
  return normalize(N - grad);
}
#endif
`;

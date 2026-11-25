import { DEW_GLSL } from "../../weather/dew";
import { DRY_SEASON_GLSL, SLOPE_TAP_M, SPRING_TURF_GLSL, STRAW_GLSL } from "../ground-year";
import { PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, PATTERN_CROP, SNOW_SLOPE, SNOW_LEAF_KEEP, SNOW_CROWN_KEEP, ICICLE_WALL_PATTERNS } from "./constants";

/**
 * Shared by the kit, instanced vegetation, and their depth twins: calendar leaf fall (`uFoliage` spring/summer/autumn/winter,
 * `uSeasonPhase` 0..1 northern year) and evergreen classification (`pid 14` always; `pid 8` strictly deciduous under
 * `HB_VEG_INSTANCED`, or legacy blue-green conifer heuristic `hbConifer` on uninstanced kit meshes).
 */
export const GLSL_LEAF_FALL = /* glsl */ `
uniform vec4 uFoliage;
uniform float uSeasonPhase;
float hbIs(float pid, float k) { return step(abs(pid - k), 0.25); }
float hbLeafFall() {
  return clamp(uFoliage.w + uFoliage.z * smoothstep(0.84, 0.93, uSeasonPhase) * 0.55, 0.0, 1.0);
}
float hbConifer(vec3 vc) {
  return max(1.0 - smoothstep(0.045, 0.075, vc.g), smoothstep(0.26, 0.33, vc.b / max(vc.g, 1e-3)));
}
float hbLeafPid(float pid) { return hbIs(pid, ${PATTERN_LEAF.toFixed(1)}) + hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)}); }
float hbEvergreen(float pid, vec3 vc) {
  #ifdef HB_VEG_INSTANCED
  return hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)});
  #else
  return max(hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)}), hbConifer(vc));
  #endif
}
`;

/**
 * PERF: the Low tier's lighter kit (HB_LITE): decorative extras that carry no data drop out of the compiled program
 * (gilt/bronze metal sheen, dew and rime, the meadows' terrain dryness, the lamplighting wave on the light pools, the
 * gust paws in the crowns' sway, the fleet's topside weathering), and the beam swath's soft amount is computed per vertex.
 * Every reading (beam light, sea state run-up, hover, weather, season colours, aerial distance) stays.
 *
 * Phase 0 / 1B Mediterranean colour calibration:
 * - Grass (pid 6): preserves baked Cycles AO / olive-terrace darkening (`vcAO = clamp(hbLuma(vc) / 0.215, 0.30, 1.35)`)
 *   under summer straw; balances blue across spring sage-olive, cool olive hollows, sage-olive/warm-russet autumn, and
 *   coastal lichen-moss winter.
 * - Autumn deciduous canopies (pid 8): rebalanced 40% sunlit ochre-gold, 25% warm amber, 15% muted terracotta-rust,
 *   and 20% holdout olive-green, lifted in luminance so autumn trees separate cleanly from terracotta roofs.
 * - Under `HB_VEG_INSTANCED`, `vVegMeta.x` drives one coherent spring-blossom and autumn-hue identity per tree (no
 *   mid-crown 6 m grid cuts), and `hbEvergreen` classifies strictly by `pid == 14`.
 * - Arable fields (pid 15, hbCrop): warm Mediterranean terra-rossa/ochre tilled soil with `hbFbm(W * 0.085)` breakup.
 */
export const GLSL_CROP = /* glsl */ `vec3 hbCrop(vec3 col, vec3 vc, vec3 W, float dW) {
  float shade = clamp(hbLuma(col) / max(hbLuma(vc), 1e-4), 0.6, 1.4);
  float p = fract(uSeasonPhase + (hbNoise(W * 0.012) - 0.5) * 0.05);
  float ang = hbNoise(W * 0.006 + 5.0) * 3.1416;
  float c = dot(W.xz, vec2(cos(ang), sin(ang)));
  float row = 0.5 + 0.5 * sin(c * 6.2832 / 1.3);
  float rowK = 1.0 - smoothstep(0.25, 0.6, dW / 1.3);
  float soilTone = 0.88 + 0.24 * hbFbm(W * 0.085);
  vec3 soil = vec3(0.31, 0.20, 0.105) * soilTone, soilDark = vec3(0.19, 0.115, 0.058) * soilTone;
  vec3 furrow = mix(soil, soilDark, row * rowK * 0.8 + (1.0 - rowK) * 0.4);
  vec3 o = furrow;
  #if HB_CROP_SHOOTS > 0
  vec3 shoots = mix(furrow, vec3(0.16, 0.27, 0.05), 0.55 + 0.35 * (1.0 - row * rowK));
  #if HB_CROP_SHOOTS == 2
  o = shoots;
  #else
  o = mix(o, shoots, smoothstep(0.1, 0.22, p));
  #endif
  #endif
  #if HB_CROP_GREEN > 0
  vec3 green = vec3(0.2, 0.33, 0.07) * (0.92 + 0.16 * hbNoise(W * 0.3));
  #if HB_CROP_GREEN == 2
  o = green;
  #else
  o = mix(o, green, smoothstep(0.24, 0.33, p));
  #endif
  #endif
  #if HB_CROP_GOLD > 0
  vec3 gold = vec3(0.5, 0.37, 0.1) * (0.9 + 0.2 * hbNoise(W * 0.25));
  #if HB_CROP_GOLD == 2
  o = gold;
  #else
  o = mix(o, gold, smoothstep(0.38, 0.47, p));
  #endif
  #endif
  float cut = HB_CROP_CUT == 2 ? 1.0 : HB_CROP_CUT == 1 ? smoothstep(0.5, 0.53, p) : 0.0;
  #if HB_CROP_CUT > 0
  vec3 stubble = vec3(0.47, 0.4, 0.22) * (0.95 + 0.1 * row * rowK);
  o = HB_CROP_CUT == 2 ? stubble : mix(o, stubble, cut);
  #endif
  #ifdef HB_STOOKS
  vec2 cell = floor(W.xz / 3.5), cf = fract(W.xz / 3.5) - 0.5;
  vec2 jit = vec2(hbWhite(vec3(cell, 81.0)), hbWhite(vec3(cell, 83.0))) - 0.5;
  float stook = (1.0 - smoothstep(0.1, 0.15, length(cf - jit * 0.5))) * step(0.35, hbWhite(vec3(cell, 87.0)));
  float shadeSide = smoothstep(0.0, 0.1, dot(cf - jit * 0.5, vec2(0.7, 0.7)));
  float stookK = cut * (1.0 - smoothstep(0.66, 0.7, p));
  float sub = smoothstep(0.3, 0.7, dW / 0.6);
  o = mix(o, mix(vec3(0.56, 0.42, 0.13) * (1.0 - 0.45 * shadeSide), o * 0.97, sub), stook * stookK * (1.0 - sub * 0.9));
  #endif
  #if HB_CROP_PLOUGH > 0
  o = HB_CROP_PLOUGH == 2 ? furrow : mix(o, furrow, smoothstep(0.7, 0.78, p));
  #endif
  return o * shade;
}`;

export const GLSL_SEASON = /* glsl */ `
${GLSL_LEAF_FALL}
uniform float uSnowCover;
uniform float uWetness;
uniform vec3 uHbSunDir;
uniform vec3 uHbSunColor;
float hbLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void hbGrassTerrain(vec3 W, out float dry, out float lush) {
  #ifdef HB_LITE
  dry = 0.0; lush = 0.0; return;
  #endif
  float steep = 0.0, south = 0.0, conv = 0.0;
  if (uAOBounds.z > 0.0) {
    float hE = hbHeight(W.xz + vec2(${SLOPE_TAP_M.toFixed(1)}, 0.0)), hW = hbHeight(W.xz - vec2(${SLOPE_TAP_M.toFixed(1)}, 0.0));
    float hS = hbHeight(W.xz + vec2(0.0, ${SLOPE_TAP_M.toFixed(1)})), hN = hbHeight(W.xz - vec2(0.0, ${SLOPE_TAP_M.toFixed(1)}));
    vec3 n = normalize(vec3(hW - hE, ${(2 * SLOPE_TAP_M).toFixed(1)}, hN - hS));
    steep = 1.0 - n.y;
    south = clamp(n.z / max(length(n.xz), 1e-3), 0.0, 1.0);
    conv = W.y - 0.25 * (hE + hW + hS + hN);
  }
  dry = clamp(smoothstep(10.0, 20.0, W.y) * 0.55 + smoothstep(0.06, 0.3, steep) * south * 0.6 + smoothstep(0.3, 1.6, conv) * 0.5, 0.0, 1.0);
  lush = clamp(smoothstep(0.3, 1.4, -conv) * (1.0 - smoothstep(12.0, 18.0, W.y)), 0.0, 1.0) * (1.0 - dry);
}

${GLSL_CROP}

${DRY_SEASON_GLSL}
vec3 hbFoliage(vec3 col, vec3 vc, float pid, vec3 W, float dW, out float bare) {
  bare = 0.0;
  float leaf = hbLeafPid(pid), grass = hbIs(pid, 6.0);
  if (hbIs(pid, ${PATTERN_CROP.toFixed(1)}) > 0.5) return hbCrop(col, vc, W, dW);
  if (leaf + grass < 0.5) return col;
  float sp = uFoliage.x, su = uFoliage.y, au = uFoliage.z, wi = uFoliage.w;
  float patShade = hbLuma(col) / max(hbLuma(vc), 1e-4);
  float patchN = hbNoise(W * 0.06);
  if (grass > 0.5) {
    float hbDry, hbLush;
    hbGrassTerrain(W, hbDry, hbLush);
    patchN = clamp(patchN + 0.5 * hbDry - 0.35 * hbLush, 0.0, 1.0);
    float vcAO = clamp(hbLuma(vc) / 0.215, 0.30, 1.35);
    float vcShade = vcAO * patShade;
    float colL = hbLuma(col);
    vec3 spring = mix(col, vec3(colL), 0.22) * ${SPRING_TURF_GLSL} + vec3(0.006, 0.009, 0.011) * vcAO;
    vec2 fc = floor(W.xz * 0.6), ff = fract(W.xz * 0.6) - 0.5;
    float meadow = smoothstep(0.3, 0.65, hbNoise(W * 0.05 + 3.0));
    float density = 0.06 + 0.5 * meadow;
    float on = step(1.0 - density, hbWhite(vec3(fc, 53.0)));
    vec2 jit = vec2(hbWhite(vec3(fc, 61.0)), hbWhite(vec3(fc, 67.0))) - 0.5;
    float petal = (1.0 - smoothstep(0.17, 0.25, length(ff - jit * 0.45))) * on;
    float fk = hbWhite(vec3(fc, 71.0));
    vec3 flower = fk < 0.38 ? vec3(0.95, 0.62, 0.01) : fk < 0.6 ? vec3(0.92, 0.9, 0.84) : fk < 0.85 ? vec3(0.92, 0.18, 0.4) : vec3(0.4, 0.2, 0.9);
    float sub = smoothstep(0.3, 0.7, dW * 0.6);
    float cov = mix(petal, density * 0.16, sub);
    spring = mix(spring, mix(flower, vec3(0.88, 0.62, 0.48), sub) * (0.62 + 0.38 * vcShade), cov);
    vec3 summer = mix(col, vec3(colL), 0.38) * vec3(0.72, 0.88, 1.08) * mix(vec3(1.0), vec3(0.90, 1.02, 1.02), hbLush);
    vec3 rains = mix(col, vec3(colL), 0.40);
    vec3 auTint = mix(vec3(0.98, 0.97, 0.98), vec3(1.10, 0.94, 0.90), patchN);
    vec3 wet = spring * sp + summer * su + rains * auTint * au + rains * vec3(0.84, 0.96, 1.08) * wi;
    vec3 straw = ${STRAW_GLSL} * vcShade * (0.8 + 0.4 * patchN) * (1.0 + 0.12 * hbDry);
    straw = mix(straw, summer, hbLush * 0.85);
    return mix(wet, straw, hbDrySeason());
  }
  float conifer = hbEvergreen(pid, vc);
  #ifdef HB_VEG_INSTANCED
    float tree = vVegMeta.x;
  #else
    float tree = hbWhite(floor(W * 0.17) + 31.0);
  #endif
  vec3 lime = col * vec3(1.1, 1.24, 0.38) + vec3(0.008, 0.012, 0.0);
  float bloomTree = step(0.45, tree);
  float dotN = hbWhite(floor(W * 1.15) + 7.0);
  float dots = step(0.45, dotN);
  dots = mix(dots, 0.55, smoothstep(0.2, 0.45, dW * 1.15)) * bloomTree;
  vec3 bloom = mix(vec3(0.95, 0.34, 0.52), vec3(0.93, 0.9, 0.86), step(0.76, tree)) * (0.55 + 0.45 * patShade);
  lime = mix(lime, bloom, (0.55 + 0.45 * dots) * bloomTree);
  vec3 deep = col * vec3(0.68, 0.92, 0.56);
  #ifdef HB_VEG_INSTANCED
    float t = tree;
  #else
    float t = fract(tree * 3.7 + patchN * 0.5);
  #endif
  vec3 holdout = mix(col, vec3(hbLuma(col)), 0.28) / max(patShade, 0.2) * 1.75;
  vec3 hue = t < 0.40 ? mix(vec3(0.54, 0.34, 0.095), vec3(0.62, 0.40, 0.108), t / 0.40)
           : t < 0.65 ? mix(vec3(0.52, 0.245, 0.088), vec3(0.58, 0.295, 0.098), (t - 0.40) / 0.25)
           : t < 0.80 ? mix(vec3(0.44, 0.165, 0.082), vec3(0.50, 0.205, 0.094), (t - 0.65) / 0.15)
           : mix(vec3(0.30, 0.33, 0.105), holdout, (t - 0.80) / 0.20);
  vec3 autumn = hue * patShade * 0.46;
  vec3 twig = vec3(0.12, 0.1, 0.085) * (0.7 + 0.6 * patShade);
  float fall = hbLeafFall();
  vec3 decid = lime * sp + deep * su + autumn * au + mix(autumn, twig, 0.7) * wi;
  decid = mix(decid, twig, fall * 0.35);
  bare = fall * (1.0 - conifer);
  vec3 needles = col * (vec3(1.08, 1.16, 0.78) * sp + vec3(0.84, 0.96, 0.78) * su + vec3(0.92, 0.95, 0.88) * au + vec3(0.8, 0.86, 0.86) * wi);
  return mix(decid, needles, conifer);
}

${DEW_GLSL}
void hbWeather(inout vec3 alb, inout float rough, vec3 N, float pid, vec3 W, float dW, out float snow, out float puddle) {
  snow = 0.0; puddle = 0.0;
  float up = N.y;
  float dry = smoothstep(0.2, 0.75, W.y);
  float leaf = hbLeafPid(pid);
  if (uSnowCover > 0.002) {
    float trod = hbIs(pid, 4.0) * 0.5 + (hbIs(pid, 3.0) + hbIs(pid, 11.0)) * 0.42 + hbIs(pid, 2.0) * 0.22;
    float n1 = hbFbm(W * 0.42);
    float n2 = hbNoise(W * 2.6);
    float lo = mix(${SNOW_SLOPE.lo.toFixed(2)}, ${SNOW_SLOPE.leafLo.toFixed(2)}, leaf), hi = mix(${SNOW_SLOPE.hi.toFixed(2)}, ${SNOW_SLOPE.leafHi.toFixed(2)}, leaf);
    float upm = smoothstep(lo - ${SNOW_SLOPE.give.toFixed(2)} * uSnowCover, hi - ${SNOW_SLOPE.give.toFixed(2)} * uSnowCover, up + (n2 - 0.5) * 0.14 * hbFine(dW, 0.4));
    float cover = uSnowCover * (1.0 - trod) * (1.0 - ${(1 - SNOW_LEAF_KEEP).toFixed(2)} * leaf);
    cover *= 1.0 - ${(1 - SNOW_CROWN_KEEP).toFixed(2)} * hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)});
    float nL = hbNoise(W * vec3(0.045, 0.02, 0.045));
    float field = n1 * 0.45 + nL * 0.45 + 0.1 + (n2 - 0.5) * 0.1 * hbFine(dW, 0.4) - (1.0 - up) * 0.25 * (1.0 - leaf);
    float thr = 1.0 - cover * 0.95;
    snow = smoothstep(thr - 0.07, thr + 0.07, field) * upm * dry;
    if (leaf > 0.5) {
      float crownUp = smoothstep(0.40, 0.78, up + (n2 - 0.5) * 0.18 * hbFine(dW, 0.4));
      float frostPatch = smoothstep(0.26, 0.74, n1 * 0.65 + n2 * 0.35);
      float crownCap = uSnowCover * crownUp * (0.42 + 0.24 * frostPatch) * dry;
      snow = min(max(snow, crownCap), 0.68);
    }
    vec3 snowC = vec3(0.64, 0.675, 0.73) * (0.95 + 0.05 * n2);
    alb = mix(alb, snowC, snow);
    rough = mix(rough, 0.6, snow);
    float wall = (1.0 - smoothstep(0.12, 0.3, abs(up))) * (${ICICLE_WALL_PATTERNS.map((k) => `hbIs(pid, ${k.toFixed(1)})`).join(" + ")});
    if (wall > 0.5 && uAOBounds.z > 0.0) {
      vec2 nh = normalize(N.xz + vec2(1e-5));
      float gap = hbHeight(W.xz - nh * 0.7) - W.y;
      float u = dot(W.xz, vec2(-nh.y, nh.x));
      float col = floor(u / 0.26);
      float len = (0.18 + 0.62 * hbWhite(vec3(col, 3.0, 17.0))) * smoothstep(0.35, 0.8, uSnowCover);
      float f = abs(fract(u / 0.26) - 0.5) * 2.0;
      float tooth = step(f, 0.8 * (1.0 - gap / max(len, 1e-3))) * step(0.02, gap) * step(3.0, W.y) * hbFine(dW, 0.26);
      alb = mix(alb, vec3(0.62, 0.74, 0.82), tooth);
      rough = mix(rough, 0.08, tooth);
      snow = max(snow, tooth * 0.6);
    }
    float rime = uSnowCover * smoothstep(-0.15, 0.3, W.y) * (1.0 - smoothstep(0.7, 1.6, W.y))
               * smoothstep(0.32, 0.6, hbNoise(W * vec3(1.3, 3.5, 1.3))) * (1.0 - leaf);
    rime *= 1.0 - snow;
    alb = mix(alb, vec3(0.66, 0.76, 0.82), rime * 0.8);
    rough = mix(rough, 0.16, rime);
  }
  if (uWetness > 0.002) {
    float w = uWetness * (1.0 - snow);
    #ifdef HB_FLEET
      float cloth = min(1.0, step(0.5, vFleetMisc.z) * step(vFleetMisc.z, 2.5) + step(0.5, vFleetRig.z) * step(vFleetMisc.z, 0.5));
    #else
      float cloth = 0.0;
    #endif
    float porous = mix(1.0 - 0.6 * leaf - 0.7 * hbIs(pid, 12.0) - 0.3 * hbIs(pid, 6.0), 0.52, cloth);
    alb *= 1.0 - 0.42 * w * porous;
    float upw = smoothstep(0.25, 0.9, up);
    float wetRough = mix(mix(0.34, 0.14, upw), max(rough, 0.62), cloth);
    rough = mix(rough, wetRough, w * mix(1.0 - 0.5 * leaf - 0.75 * hbIs(pid, 6.0), 0.45, cloth));
    #ifdef HB_FLEET
      if (cloth > 0.5) rough = max(rough, 0.62);
    #endif
    float hard = (hbIs(pid, 2.0) + hbIs(pid, 3.0) + hbIs(pid, 4.0) + hbIs(pid, 11.0) + hbIs(pid, 0.0) * 0.6) * (1.0 - cloth);
    float pn = hbFbm(W * 0.21) + (hbNoise(W * 1.3) - 0.5) * 0.05;
    float lvl = 0.72 - 0.11 * w;
    puddle = smoothstep(lvl, lvl + 0.035, pn) * smoothstep(0.93, 0.985, up) * hard * w * dry;
    alb = mix(alb, alb * 0.4, puddle);
    rough = mix(rough, 0.03, puddle);
  }
  hbDewRime(alb, rough, pid, W, N, snow);
}
`;

import { DEW_GLSL } from "../../weather/dew";
import { DRY_SEASON_GLSL, SLOPE_TAP_M, SPRING_TURF_GLSL, STRAW_GLSL } from "../ground-year";
import { PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, PATTERN_CROP, SNOW_SLOPE, SNOW_LEAF_KEEP, SNOW_CROWN_KEEP, ICICLE_WALL_PATTERNS } from "./constants";

/** Shared by the kit and its shadow-depth twin: which leaves the calendar has taken. */
export const GLSL_LEAF_FALL = /* glsl */ `
uniform vec4 uFoliage;      // spring, summer, autumn, winter weights (calendar, decorative)
uniform float uSeasonPhase; // 0..1 through the (northern-equivalent) year
float hbIs(float pid, float k) { return step(abs(pid - k), 0.25); }
// late-autumn leaf fall, then the bare winter: how much of a deciduous canopy is gone (0..1)
float hbLeafFall() {
  return clamp(uFoliage.w + uFoliage.z * smoothstep(0.84, 0.93, uSeasonPhase) * 0.55, 0.0, 1.0);
}
// conifers (the dark blue-green spruce) keep their needles all year: 1 = conifer
float hbConifer(vec3 vc) {
  return max(1.0 - smoothstep(0.045, 0.075, vc.g), smoothstep(0.26, 0.33, vc.b / max(vc.g, 1e-3)));
}
// leaf patterns: 8 leaf (evergreen by colour), 14 leaf_evergreen (always evergreen)
float hbLeafPid(float pid) { return hbIs(pid, ${PATTERN_LEAF.toFixed(1)}) + hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)}); }
float hbEvergreen(float pid, vec3 vc) { return max(hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)}), hbConifer(vc)); }
`;

/**
 * PERF: the Low tier's lighter kit (HB_LITE): decorative extras that carry no data drop out of the compiled program
 * (gilt/bronze metal sheen, dew and rime, the meadows' terrain dryness, the lamplighting wave on the light pools, the
 * gust paws in the crowns' sway, the fleet's topside weathering), and the beam swath's soft amount is computed per vertex.
 * Every reading (beam light, sea state run-up, hover, weather, season colours, aerial distance) stays.
 */
export const GLSL_SEASON = /* glsl */ `
${GLSL_LEAF_FALL}
uniform float uSnowCover;
uniform float uWetness;
uniform vec3 uHbSunDir;   // = uSunDir / uSunColor (renamed: the fleet port declares those itself)
uniform vec3 uHbSunColor;
float hbLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// 08-T2: grass dryness from the land (no texture of its own): height, the slope's south aspect and convexity against
// the island height field (uAOTex, 4 taps 7 m out). dry/lush 0..1. E16: the slope is the taps' central differences
// (ground-year.ts grassSlopeOf), continuous across the terrain's triangles; level without the height field.
void hbGrassTerrain(vec3 W, out float dry, out float lush) {
  #ifdef HB_LITE
  dry = 0.0; lush = 0.0; return;   // (Low: the meadow keeps its season colour without the land's shape)
  #endif
  float steep = 0.0, south = 0.0, conv = 0.0;
  if (uAOBounds.z > 0.0) {
    float hE = hbHeight(W.xz + vec2(${SLOPE_TAP_M.toFixed(1)}, 0.0)), hW = hbHeight(W.xz - vec2(${SLOPE_TAP_M.toFixed(1)}, 0.0));
    float hS = hbHeight(W.xz + vec2(0.0, ${SLOPE_TAP_M.toFixed(1)})), hN = hbHeight(W.xz - vec2(0.0, ${SLOPE_TAP_M.toFixed(1)}));
    vec3 n = normalize(vec3(hW - hE, ${(2 * SLOPE_TAP_M).toFixed(1)}, hN - hS));
    steep = 1.0 - n.y;
    south = clamp(n.z / max(length(n.xz), 1e-3), 0.0, 1.0);    // glTF +z = south
    conv = W.y - 0.25 * (hE + hW + hS + hN);
  }
  dry = clamp(smoothstep(10.0, 20.0, W.y) * 0.55 + smoothstep(0.06, 0.3, steep) * south * 0.6 + smoothstep(0.3, 1.6, conv) * 0.5, 0.0, 1.0);
  lush = clamp(smoothstep(0.3, 1.4, -conv) * (1.0 - smoothstep(12.0, 18.0, W.y)), 0.0, 1.0) * (1.0 - dry);
}

// 08-T11: the farm year on the arable fields (pid 15), by the calendar phase (0 = 1 Jan, northern-equivalent):
// winter brown furrows -> spring green shoots -> early-summer gold -> the July harvest: pale stubble with stooks ->
// autumn ploughing. Each field drifts a few days from its neighbours; furrows curve slowly with the land.
vec3 hbCrop(vec3 col, vec3 vc, vec3 W, float dW) {
  float shade = clamp(hbLuma(col) / max(hbLuma(vc), 1e-4), 0.6, 1.4);
  float p = fract(uSeasonPhase + (hbNoise(W * 0.012) - 0.5) * 0.05);
  float ang = hbNoise(W * 0.006 + 5.0) * 3.1416;
  float c = dot(W.xz, vec2(cos(ang), sin(ang)));
  float row = 0.5 + 0.5 * sin(c * 6.2832 / 1.3);
  float rowK = 1.0 - smoothstep(0.25, 0.6, dW / 1.3);            // sub-pixel rows fade to their mean
  vec3 soil = vec3(0.17, 0.105, 0.055), soilDark = vec3(0.11, 0.07, 0.04);
  vec3 furrow = mix(soil, soilDark, row * rowK * 0.8 + (1.0 - rowK) * 0.4);
  vec3 o = furrow;
  // each stage compiles as absent (0), complete (2) or blending by the field's own phase (1): HB_CROP_* from
  // cropStagesAt (the calendar is fixed for a visit, so a field only ever shows one or two stages); the field noise
  // the absent stages would read is never evaluated
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
  // stooks: sheaves stood up on the stubble until carted in (late Jul - Sep); ~3.5 m apart, sub-pixel -> mean tint
  // (compiled in only when the calendar can show them: HB_STOOKS, see stooksAt)
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
  o = HB_CROP_PLOUGH == 2 ? furrow : mix(o, furrow, smoothstep(0.7, 0.78, p));   // autumn ploughing
  #endif
  return o * shade;
}

${DRY_SEASON_GLSL}
// SEASON ON VEGETATION. pid 8 leaf (trees, shrubs, hedges, ivy), 6 grass (meadows, verges).
// col = patterned albedo, vc = authored vertex albedo; W = world position; dW = its screen footprint.
// bare = how much of this fragment the leaf fall takes (deciduous only; the kit discards by it).
vec3 hbFoliage(vec3 col, vec3 vc, float pid, vec3 W, float dW, out float bare) {
  bare = 0.0;
  float leaf = hbLeafPid(pid), grass = hbIs(pid, 6.0);
  if (hbIs(pid, ${PATTERN_CROP.toFixed(1)}) > 0.5) return hbCrop(col, vc, W, dW);
  if (leaf + grass < 0.5) return col;
  float sp = uFoliage.x, su = uFoliage.y, au = uFoliage.z, wi = uFoliage.w;
  float shade = hbLuma(col) / max(hbLuma(vc), 1e-4);     // the pattern's light and dark survive the recolour
  float patchN = hbNoise(W * 0.06);
  if (grass > 0.5) {
    // 08-T2: the land's own shape: dry gold on ridges, crowns and steep south faces, lush in the hollows
    float hbDry, hbLush;
    hbGrassTerrain(W, hbDry, hbLush);
    patchN = clamp(patchN + 0.5 * hbDry - 0.35 * hbLush, 0.0, 1.0);
    // E17 (ruling V12), a Mediterranean ground year by the calendar alone: spring turf (fresh, not acid) strewn with
    // wildflowers (yellow, white, pink, violet) in meadow drifts; June to October straw gold, paler on the dry ridges,
    // the hollows keeping their olive; green again from the first rains in late October through the winter
    vec3 spring = col * ${SPRING_TURF_GLSL} + vec3(0.012, 0.016, 0.0);
    vec2 fc = floor(W.xz * 0.6), ff = fract(W.xz * 0.6) - 0.5;   // ~1.7 m cells: a clump of blooms each
    float meadow = smoothstep(0.3, 0.65, hbNoise(W * 0.05 + 3.0));
    float density = 0.06 + 0.5 * meadow;
    float on = step(1.0 - density, hbWhite(vec3(fc, 53.0)));
    vec2 jit = vec2(hbWhite(vec3(fc, 61.0)), hbWhite(vec3(fc, 67.0))) - 0.5;
    float petal = (1.0 - smoothstep(0.17, 0.25, length(ff - jit * 0.45))) * on;
    float fk = hbWhite(vec3(fc, 71.0));
    vec3 flower = fk < 0.38 ? vec3(0.95, 0.62, 0.01) : fk < 0.6 ? vec3(0.92, 0.9, 0.84) : fk < 0.85 ? vec3(0.92, 0.18, 0.4) : vec3(0.4, 0.2, 0.9);
    float sub = smoothstep(0.3, 0.7, dW * 0.6);            // sub-pixel flowers fade to their mean tint
    float cov = mix(petal, density * 0.16, sub);
    spring = mix(spring, mix(flower, vec3(0.88, 0.62, 0.48), sub) * (0.62 + 0.38 * shade), cov);
    vec3 summer = col * vec3(0.8, 0.95, 0.56) * mix(vec3(1.0), vec3(0.9, 1.05, 0.9), hbLush);     // the olive of the hollows
    vec3 rains = mix(col, vec3(hbLuma(col)), 0.3);       // the wet season's green: soft and olive-grey, never a lawn
    vec3 wet = spring * sp + summer * su + rains * vec3(0.98, 1.0, 0.8) * au + rains * vec3(0.92, 0.97, 0.84) * wi;
    vec3 straw = ${STRAW_GLSL} * shade * (0.8 + 0.4 * patchN) * (1.0 + 0.12 * hbDry);
    straw = mix(straw, summer, hbLush * 0.85);
    return mix(wet, straw, hbDrySeason());
  }
  float conifer = hbEvergreen(pid, vc);
  float tree = hbWhite(floor(W * 0.17) + 31.0);           // ~6 m cells: roughly one value per crown
  // spring: fresh yellow-lime; pink or white blossom on over half the deciduous trees
  vec3 lime = col * vec3(1.1, 1.24, 0.38) + vec3(0.008, 0.012, 0.0);
  float bloomTree = step(0.45, tree);
  float dotN = hbWhite(floor(W * 1.15) + 7.0);
  float dots = step(0.45, dotN);
  dots = mix(dots, 0.55, smoothstep(0.2, 0.45, dW * 1.15)) * bloomTree;
  vec3 bloom = mix(vec3(0.95, 0.34, 0.52), vec3(0.93, 0.9, 0.86), step(0.76, tree)) * (0.55 + 0.45 * shade);
  lime = mix(lime, bloom, (0.55 + 0.45 * dots) * bloomTree);
  // summer: deep, lush green
  vec3 deep = col * vec3(0.68, 0.92, 0.56);
  // autumn: amber, orange, red and gold, tree by tree; a few hold on to green
  float t = fract(tree * 3.7 + patchN * 0.5);
  vec3 hue = t < 0.28 ? mix(vec3(0.78, 0.36, 0.035), vec3(0.86, 0.56, 0.07), t / 0.28)
           : t < 0.55 ? mix(vec3(0.74, 0.18, 0.025), vec3(0.84, 0.38, 0.04), (t - 0.28) / 0.27)
           : t < 0.78 ? mix(vec3(0.5, 0.06, 0.025), vec3(0.68, 0.11, 0.03), (t - 0.55) / 0.23)
           : t < 0.92 ? mix(vec3(0.72, 0.6, 0.08), vec3(0.85, 0.7, 0.12), (t - 0.78) / 0.14)
           : col / max(shade, 0.2) * 1.6;
  vec3 autumn = hue * shade * 0.42;
  // winter: deciduous crowns are bare twigs; conifers darken a little under the cold light
  vec3 twig = vec3(0.12, 0.1, 0.085) * (0.7 + 0.6 * shade);
  float fall = hbLeafFall();
  vec3 decid = lime * sp + deep * su + autumn * au + mix(autumn, twig, 0.7) * wi;
  decid = mix(decid, twig, fall * 0.35);
  bare = fall * (1.0 - conifer);
  vec3 needles = col * (vec3(1.08, 1.16, 0.78) * sp + vec3(0.84, 0.96, 0.78) * su + vec3(0.92, 0.95, 0.88) * au + vec3(0.8, 0.86, 0.86) * wi);
  return mix(decid, needles, conifer);
}

${DEW_GLSL}
// WEATHER ON THE GROUND (snow cover: season + snowfall; wetness: rain, written by the weather director).
// N = shading normal (world). Writes snow / puddle coverage for the lighting additions.
void hbWeather(inout vec3 alb, inout float rough, vec3 N, float pid, vec3 W, float dW, out float snow, out float puddle) {
  snow = 0.0; puddle = 0.0;
  float up = N.y;
  float dry = smoothstep(0.2, 0.75, W.y);                 // nothing lies at or under the water line
  float leaf = hbLeafPid(pid);
  if (uSnowCover > 0.002) {
    // trodden ground holds thinner snow: setts, deck planks, quay ashlar
    float trod = hbIs(pid, 4.0) * 0.5 + (hbIs(pid, 3.0) + hbIs(pid, 11.0)) * 0.42 + hbIs(pid, 2.0) * 0.22;
    float n1 = hbFbm(W * 0.42);
    float n2 = hbNoise(W * 2.6);
    // conifers are dusted (the snow sits on the tiers' tops), not buried
    float lo = mix(${SNOW_SLOPE.lo.toFixed(2)}, ${SNOW_SLOPE.leafLo.toFixed(2)}, leaf), hi = mix(${SNOW_SLOPE.hi.toFixed(2)}, ${SNOW_SLOPE.leafHi.toFixed(2)}, leaf);
    float upm = smoothstep(lo - ${SNOW_SLOPE.give.toFixed(2)} * uSnowCover, hi - ${SNOW_SLOPE.give.toFixed(2)} * uSnowCover, up + (n2 - 0.5) * 0.14 * hbFine(dW, 0.4));
    float cover = uSnowCover * (1.0 - trod) * (1.0 - ${(1 - SNOW_LEAF_KEEP).toFixed(2)} * leaf);
    cover *= 1.0 - ${(1 - SNOW_CROWN_KEEP).toFixed(2)} * hbIs(pid, ${PATTERN_LEAF_EVERGREEN.toFixed(1)});   // flat evergreen crowns: snow-capped, not buried
    // Full authored cover also on hulls: Three's former USE_BATCHING guard was vertex-only,
    // so its fragment-side 0.4 multiplier never ran. Do not turn that dead branch into a look change.
    // two scales: drifts and bare patches the overview can read (~25 m), soft edges up close (~2.5 m);
    // steep ground sheds it
    float nL = hbNoise(W * vec3(0.045, 0.02, 0.045));
    float field = n1 * 0.45 + nL * 0.45 + 0.1 + (n2 - 0.5) * 0.1 * hbFine(dW, 0.4) - (1.0 - up) * 0.25 * (1.0 - leaf);
    float thr = 1.0 - cover * 0.95;
    snow = smoothstep(thr - 0.07, thr + 0.07, field) * upm * dry;
    vec3 snowC = vec3(0.64, 0.675, 0.73) * (0.95 + 0.05 * n2);
    alb = mix(alb, snowC, snow);
    rough = mix(rough, 0.6, snow);
    // icicles: under a snowy eave a fringe of ice teeth hangs down the house wall (the height field just inside
    // the wall is the roof above it); only on clad / rendered / plain house walls, not on quay or terrace stone
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
    // rime: an icy glaze on the rock and stone along the waterline
    float rime = uSnowCover * smoothstep(-0.15, 0.3, W.y) * (1.0 - smoothstep(0.7, 1.6, W.y))
               * smoothstep(0.32, 0.6, hbNoise(W * vec3(1.3, 3.5, 1.3))) * (1.0 - leaf);
    rime *= 1.0 - snow;
    alb = mix(alb, vec3(0.66, 0.76, 0.82), rime * 0.8);
    rough = mix(rough, 0.16, rime);
  }
  if (uWetness > 0.002) {
    float w = uWetness * (1.0 - snow);
    // stone, planks and earth darken most; leaves and metal least
    float porous = 1.0 - 0.6 * leaf - 0.7 * hbIs(pid, 12.0) - 0.3 * hbIs(pid, 6.0);
    alb *= 1.0 - 0.42 * w * porous;
    float upw = smoothstep(0.25, 0.9, up);
    // stone and planks gloss; turf and leaves stay matte (a soaked meadow is not a mirror)
    rough = mix(rough, mix(0.34, 0.14, upw), w * (1.0 - 0.5 * leaf - 0.75 * hbIs(pid, 6.0)));
    // puddles on level stone, setts and planks
    float hard = hbIs(pid, 2.0) + hbIs(pid, 3.0) + hbIs(pid, 4.0) + hbIs(pid, 11.0) + hbIs(pid, 0.0) * 0.6;
    float pn = hbFbm(W * 0.21) + (hbNoise(W * 1.3) - 0.5) * 0.05;
    float lvl = 0.72 - 0.11 * w;
    puddle = smoothstep(lvl, lvl + 0.035, pn) * smoothstep(0.93, 0.985, up) * hard * w * dry;
    alb = mix(alb, alb * 0.4, puddle);
    rough = mix(rough, 0.03, puddle);
  }
  hbDewRime(alb, rough, pid, W, N, snow);   // W12 winter-dawn rime (decorative; not mist)
}
`;

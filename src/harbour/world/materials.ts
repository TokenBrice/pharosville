import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import type { WorldUniforms } from "../engine/uniforms";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms } from "../sky/cloud-shadow";

/**
 * THE HARBOUR MATERIAL PORT — style C "Northern Light" (p1/style-c/nl_common.py build_kit_material,
 * build_glass_material, build_glow_material) as MeshStandardMaterial + onBeforeCompile, so three's
 * physically-correct lights, shadows, fog and instancing all keep working.
 *
 * Kit contract (GLB `COLOR_0`): rgb = albedo per face (±4 % jitter baked), alpha = pattern id / 16.
 * Patterns are evaluated from OBJECT-space position + normal (Blender Z-up, converted here from glTF
 * Y-up), exactly like the Blender node tree, plus a world-space value breakup. Everything that is
 * finer than ~2 px is faded to its average (fwidth) so the overview never shimmers.
 *
 * Material names → port (Blender names on the left, P2 contract names on the right):
 *   M_kit / hb_opaque              → kit
 *   M_window / hb_window           → window  (COLOR_0.r = lit, .g = warmth; emissive × uWindowGlow)
 *   lamp / beacon_red / hb_emissive → emissive (× uLamp)
 *   lens                           → lens (× uLens × lit)
 *   lantern_glass / hb_glass       → glass
 *   M_sail / hb_sail / hb_cover    → kit (plain), double-sided — the fleet owns its instanced sail shader
 */

export type HarbourMaterialKind = "kit" | "window" | "emissive" | "lens" | "glass";

export function materialKindFor(name: string): HarbourMaterialKind | null {
  const n = name.toLowerCase();
  if (n === "m_kit" || n.startsWith("hb_opaque") || n.startsWith("m_kit")) return "kit";
  if (n.startsWith("m_window") || n.startsWith("hb_window")) return "window";
  if (n.startsWith("lamp") || n.startsWith("beacon") || n.startsWith("hb_emissive") || n.startsWith("riding")) return "emissive";
  if (n === "lens" || n.startsWith("hb_lens")) return "lens";
  if (n.startsWith("lantern_glass") || n.startsWith("hb_glass")) return "glass";
  if (n.startsWith("m_sail") || n.startsWith("hb_sail") || n.startsWith("hb_cover")) return "kit";
  return null;
}

/** Light-pool projection shared by every lit material (written by the lights system). */
/** Height-field AO shared by every lit material (written by the island system). */
export interface AOUniforms {
  uAOTex: THREE.IUniform<THREE.Texture>;
  uAOBounds: THREE.IUniform<THREE.Vector4>;
}

export interface PoolUniforms {
  uPoolTex: THREE.IUniform<THREE.Texture>;
  /** (minX, minZ, 1/sizeX, 1/sizeZ) of the pool texture in world x/z. */
  uPoolBounds: THREE.IUniform<THREE.Vector4>;
}

// ------------------------------------------------------------------ GLSL

const GLSL_NOISE = /* glsl */ `
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

const GLSL_PATTERNS = /* glsl */ `
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
    vec2 v = hbVoronoi(P.xy * 1.7);
    float fine = hbFine(dP.x, 0.6);
    float edge = mix(0.55, 1.0, smoothstep(0.0, 0.09, v.y));
    f = mix(0.86, (0.9 + v.x * 0.22) * edge, fine);
  } else if (pid < 5.5) {            // 5 rock: strata bands + speckle
    float sn = hbFbm(P * 0.108);
    float band = sin(P.z * 1.1 + sn * 6.0) * 0.5 + 0.5;
    f = 0.86 + band * 0.2 + (hbFbm(P * 2.6) - 0.5) * 0.18 * hbFine(dP.z, 0.4);
  } else if (pid < 6.5) {            // 6 grass: two-scale mottling
    float g1 = hbFbm(P * 0.08);
    float g2 = hbFbm(P * 1.4);
    f = 0.82 + smoothstep(0.35, 0.65, g1) * 0.28 + (g2 - 0.5) * 0.16 * hbFine(dP.x, 0.7);
    hue = vec3(-0.02, 0.0, 0.02) * (g1 - 0.5);
  } else if (pid < 7.5) {            // 7 tiles: vertical joints, rows are geometry
    float trow = floor(P.z / 0.36);
    float fine = hbFine(du, 0.34);
    f = (1.0 + (hbWhite(vec3(floor(u / 0.34 + trow * 0.5), trow, 2.0)) * 0.18 - 0.09) * fine) *
        (1.0 - hbLine(u + trow * 0.17, 0.34, 0.07, du) * 0.35);
  } else if (pid < 8.5) {            // 8 leaf: up-facing lift + clumps
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
    f = 0.95 + hbNoise(P * 4.0) * 0.1 * hbFine(dP.x, 0.3);
    rough = 0.48;
  } else if (pid < 13.5) {           // 13 slate: small staggered slates
    float srow = floor(P.z / 0.26);
    float fine = hbFine(du, 0.4);
    f = (1.0 + (hbWhite(vec3(floor(u / 0.4 + srow * 0.5), srow, 4.0)) * 0.24 - 0.12) * fine) *
        (1.0 - hbLine(u + srow * 0.2, 0.4, 0.06, du) * 0.3);
  }
  // world-space large breakup (cloud-like value drift)
  float wn = hbFbm(W * 0.035);
  float wn2 = hbNoise(W * 0.4);
  float fworld = 0.93 + wn * 0.14 + (wn2 - 0.5) * 0.06 * hbFine(dW, 1.5);
  // flat-shaded facet value jitter (Bad North crystal read): one value per facet orientation
  float facet = hbWhite(floor(vHbLocalN * 23.0) + 3.0) - 0.5;
  return f * fworld * (1.0 + facet * 0.05) * (1.0 + hue);
}
`;

const GLSL_ENV = /* glsl */ `
uniform vec3 uNightLift;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform vec3 uHorizon;
uniform float uRimK;
// cheap environment specular (stands in for EEVEE's world reflection) + soft sky rim
vec3 hbEnvSpec(vec3 n, vec3 v, float rough, float f0) {
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHemiGround * 0.6, mix(uHorizon * 0.55, uHemiSky, smoothstep(0.0, 0.6, r.y)), smoothstep(-0.2, 0.05, r.y));
  float fr = f0 + (max(1.0 - rough, f0) - f0) * pow(1.0 - ndv, 5.0);
  return sky * fr;
}
`;

const GLSL_POOL = /* glsl */ `
uniform sampler2D uPoolTex;
uniform vec4 uPoolBounds;
uniform float uWindowGlow;
// projected light pools: rgb = additive irradiance on up-facing surfaces, a = source height
vec3 hbPool(vec3 worldPos, vec3 worldN) {
  vec2 uv = (worldPos.xz - uPoolBounds.xy) * uPoolBounds.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec3(0.0);
  vec4 p = texture2D(uPoolTex, uv);
  p.rgb *= min(1.0, 0.5 / max(dot(p.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-4));   // overlapping lamps: a sane max
  float upw = smoothstep(0.2, 0.85, worldN.y);
  float below = smoothstep(p.a + 0.6, p.a - 0.4, worldPos.y);      // floors: only under the source
  float band = exp(-pow((worldPos.y - p.a) / 2.6, 2.0));           // walls: around the source height
  return p.rgb * mix(band * 0.6, below, upw) * smoothstep(0.02, 0.55, uWindowGlow);
}
`;

const GLSL_AO = /* glsl */ `
uniform sampler2D uAOTex;
uniform vec4 uAOBounds;   // (minX, maxZ, 1/sizeX, 1/sizeZ) of the island height field
float hbHeight(vec2 xz) { return texture2D(uAOTex, vec2((xz.x - uAOBounds.x) * uAOBounds.z, (uAOBounds.y - xz.y) * uAOBounds.w)).r; }
// height-field ambient occlusion: how much of the sky the static island hides from this point
float hbAO(vec3 P, vec3 N) {
  if (uAOBounds.z <= 0.0) return 1.0;
  float occ = 0.0, wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.31;
    vec2 d = vec2(cos(a), sin(a));
    float r = (i - (i / 2) * 2 == 0) ? 2.0 : 5.5;
    float w = clamp(dot(vec3(d.x, 0.0, d.y), N) * 0.9 + N.y, 0.0, 1.0);
    float o = clamp((hbHeight(P.xz + d * r) - P.y - 0.3) / r, 0.0, 1.0);
    occ += w * o; wsum += w;
  }
  return 1.0 - 0.8 * occ / max(wsum, 1e-3);
}
`;


/** Shared by the kit and its shadow-depth twin: which leaves the calendar has taken. */
const GLSL_LEAF_FALL = /* glsl */ `
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
`;

/** Late-autumn / winter leaf fall at compile time (mirrors hbLeafFall): > 0 compiles the bare-crown discard in. */
export function leafFallAt(u: WorldUniforms): number {
  const f = u.uFoliage.value;
  const x = THREE.MathUtils.clamp((u.uSeasonPhase.value - 0.84) / 0.09, 0, 1);
  return Math.min(1, f.w + f.z * x * x * (3 - 2 * x) * 0.55);
}

const GLSL_SEASON = /* glsl */ `
${GLSL_LEAF_FALL}
uniform float uSnowCover;
uniform float uWetness;
uniform vec3 uHbSunDir;   // = uSunDir / uSunColor (renamed: the fleet port declares those itself)
uniform vec3 uHbSunColor;
float hbLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// SEASON ON VEGETATION. pid 8 leaf (trees, shrubs, hedges, ivy), 6 grass (meadows, verges).
// col = patterned albedo, vc = authored vertex albedo; W = world position; dW = its screen footprint.
// bare = how much of this fragment the leaf fall takes (deciduous only; the kit discards by it).
vec3 hbFoliage(vec3 col, vec3 vc, float pid, vec3 W, float dW, out float bare) {
  bare = 0.0;
  float leaf = hbIs(pid, 8.0), grass = hbIs(pid, 6.0);
  if (leaf + grass < 0.5) return col;
  float sp = uFoliage.x, su = uFoliage.y, au = uFoliage.z, wi = uFoliage.w;
  float shade = hbLuma(col) / max(hbLuma(vc), 1e-4);     // the pattern's light and dark survive the recolour
  float patchN = hbNoise(W * 0.06);
  if (grass > 0.5) {
    // spring: fresh yellow-lime turf strewn with wildflowers (yellow, white, pink, violet) in meadow drifts
    vec3 spring = col * vec3(1.12, 1.2, 0.42) + vec3(0.012, 0.016, 0.0);
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
    // summer: deep and lush, with sun-gold drifts where the meadow runs dry
    vec3 summer = mix(col * vec3(0.8, 0.95, 0.56), vec3(0.3, 0.25, 0.05) * shade, smoothstep(0.58, 0.85, patchN) * 0.4);
    vec3 straw = vec3(0.26, 0.19, 0.065) * shade * (0.8 + 0.4 * patchN);
    vec3 dormant = mix(col, vec3(0.11, 0.1, 0.055) * shade, 0.65);
    return spring * sp + summer * su + mix(col, straw, 0.3 + 0.4 * patchN) * au + dormant * wi;
  }
  float conifer = hbConifer(vc);
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

// WEATHER ON THE GROUND (snow cover: season + snowfall; wetness: rain, written by the weather director).
// N = shading normal (world). Writes snow / puddle coverage for the lighting additions.
void hbWeather(inout vec3 alb, inout float rough, vec3 N, float pid, vec3 W, float dW, out float snow, out float puddle) {
  snow = 0.0; puddle = 0.0;
  float up = N.y;
  float dry = smoothstep(0.2, 0.75, W.y);                 // nothing lies at or under the water line
  float leaf = hbIs(pid, 8.0);
  if (uSnowCover > 0.002) {
    // trodden ground holds thinner snow: setts, deck planks, quay ashlar
    float trod = hbIs(pid, 4.0) * 0.5 + (hbIs(pid, 3.0) + hbIs(pid, 11.0)) * 0.42 + hbIs(pid, 2.0) * 0.22;
    float n1 = hbFbm(W * 0.42);
    float n2 = hbNoise(W * 2.6);
    // conifers are dusted (the snow sits on the tiers' tops), not buried
    float lo = mix(0.42, 0.34, leaf), hi = mix(0.74, 0.62, leaf);
    float upm = smoothstep(lo - 0.14 * uSnowCover, hi - 0.14 * uSnowCover, up + (n2 - 0.5) * 0.14 * hbFine(dW, 0.4));
    float cover = uSnowCover * (1.0 - trod) * (1.0 - 0.45 * leaf);
    #ifdef USE_BATCHING
      cover *= 0.4;                                        // hulls under way shed it: a dusting on the decks
    #endif
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
    float wall = (1.0 - smoothstep(0.12, 0.3, abs(up))) * (hbIs(pid, 1.0) + hbIs(pid, 10.0) + hbIs(pid, 0.0));
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
}
`;

interface Shader { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }

function injectVaryings(shader: Shader): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vHbLocal;\nvarying vec3 vHbLocalN;\nvarying vec3 vHbWorld;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHbLocal = position;\nvHbLocalN = objectNormal;")
    .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
  {
    vec4 hbW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      hbW = instanceMatrix * hbW;
    #endif
    vHbWorld = (modelMatrix * hbW).xyz;
  }`);
}

/** Peak window radiance: bright enough to bloom softly, low enough that frames and mullions survive it. */
const WIN_MAX = 2.6;

export class HarbourMaterials {
  readonly pool: PoolUniforms;
  readonly ao: AOUniforms;
  private readonly cache = new Map<string, THREE.Material>();
  readonly rimK: THREE.IUniform<number> = { value: 1 };

  constructor(readonly uniforms: WorldUniforms) {
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    black.needsUpdate = true;
    this.pool = { uPoolTex: { value: black }, uPoolBounds: { value: new THREE.Vector4(0, 0, 0, 0) } };
    this.ao = { uAOTex: { value: black }, uAOBounds: { value: new THREE.Vector4(0, 0, 0, 0) } };
  }

  private shared(): Record<string, THREE.IUniform> {
    const u = this.uniforms;
    return {
      uTime: u.uTime, uHemiSky: u.uHemiSky, uHemiGround: u.uHemiGround, uHorizon: u.uHorizon,
      uWindowGlow: u.uWindowGlow, uLamp: u.uLamp, uLens: u.uLens, uNight: u.uNight,
      uWindowOcc: u.uWindowOcc, uNightLift: u.uNightLift,
      uPoolTex: this.pool.uPoolTex, uPoolBounds: this.pool.uPoolBounds, uRimK: this.rimK,
      uAOTex: this.ao.uAOTex, uAOBounds: this.ao.uAOBounds,
      uSnowCover: u.uSnowCover, uWetness: u.uWetness, uFoliage: u.uFoliage, uSeasonPhase: u.uSeasonPhase,
      uHbSunDir: u.uSunDir, uHbSunColor: u.uSunColor,
    };
  }

  /** The one opaque kit material (patterns + world breakup + facets + env spec + pools). */
  kit(opts: { side?: THREE.Side; pattern?: number } = {}): THREE.MeshStandardMaterial {
    const side = opts.side ?? THREE.DoubleSide;
    const key = `kit:${side}:${opts.pattern ?? -1}`;
    const hit = this.cache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true, side });
    m.name = "hb_kit";
    const fallbackPid = (opts.pattern ?? 0).toFixed(1);
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shared(), cloudShadowUniforms);
      injectVaryings(shader);
      // winter / late-autumn bare crowns discard: compiled in only when the calendar can need it
      if (leafFallAt(this.uniforms) > 0.001) shader.defines = { ...shader.defines, HB_BARE: "" };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${GLSL_NOISE}\n${GLSL_PATTERNS}\n${GLSL_ENV}\n${GLSL_POOL}\n${GLSL_AO}\n${CLOUD_SHADOW_GLSL}\n${GLSL_SEASON}`)
        .replace("#include <color_fragment>", `
  vec3 hbVc = vec3(1.0);
  #if defined( USE_COLOR_ALPHA )
    float hbPid = floor(vColor.a * 16.0 + 0.5);
    diffuseColor.rgb *= vColor.rgb; hbVc = vColor.rgb;
  #elif defined( USE_COLOR )
    float hbPid = ${fallbackPid};
    diffuseColor.rgb *= vColor.rgb; hbVc = vColor.rgb;
  #else
    float hbPid = ${fallbackPid};
  #endif
  float hbSdW = fwidth(vHbWorld.x) + fwidth(vHbWorld.z);
  float hbBareNoise = hbNoise(vHbWorld * 1.7);
  float hbRough;
  diffuseColor.rgb *= hbPattern(hbPid, hbRough);
  {
    float hbBare;
    diffuseColor.rgb = hbFoliage(diffuseColor.rgb, hbVc, hbPid, vHbWorld, hbSdW, hbBare);
    #ifdef HB_BARE
      if (hbBareNoise < hbBare * 0.84) discard;     // bare crowns: a sparse net of twigs survives
    #endif
  }
  diffuseColor.a = 1.0;`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = hbRough;")
        .replace("#include <emissivemap_fragment>", `
  float hbSnow, hbPuddle;
  hbWeather(diffuseColor.rgb, roughnessFactor, inverseTransformDirection(normal, viewMatrix), hbPid, vHbWorld, hbSdW, hbSnow, hbPuddle);
  #include <emissivemap_fragment>`)
        .replace("#include <aomap_fragment>", `#include <aomap_fragment>
  float hbOcc = hbAO(vHbWorld, inverseTransformDirection(normal, viewMatrix));
  float hbCs = hbCloudShadow(vHbWorld.xz);   // drifting cloud shadows (sky system)
  reflectedLight.directDiffuse *= hbCs;
  reflectedLight.directSpecular *= hbCs;
  reflectedLight.indirectDiffuse *= hbOcc;
  reflectedLight.indirectSpecular *= hbOcc;
  // wet ground shows a sheen, never a white flare: on wet surfaces the sun / moon / lamp / flash highlight
  // (GGX at puddle roughness peaks thousands of times over) is capped near what the sky lights the scene with
  {
    float hbWetK = smoothstep(0.0, 0.25, uWetness);
    float hbCap = 0.005 + 0.5 * hbLuma(uHemiSky);
    float hbSl = hbLuma(reflectedLight.directSpecular);
    reflectedLight.directSpecular *= mix(1.0, min(1.0, hbCap / max(hbSl, 1e-5)), hbWetK);
  }`)
        .replace("#include <opaque_fragment>", `
  {
    vec3 hbV = normalize(vViewPosition);
    vec3 hbNw = inverseTransformDirection(normal, viewMatrix);
    vec3 hbVw = inverseTransformDirection(hbV, viewMatrix);
    // wet: the sky sheen is capped by the sky's own brightness, so grazing wet slopes never go white
    float hbSkyL = hbLuma(uHemiSky);
    outgoingLight += min(hbEnvSpec(hbNw, hbVw, roughnessFactor, 0.03), vec3(mix(4.0, 0.35 * hbSkyL + 0.01, smoothstep(0.0, 0.25, uWetness)))) * uRimK * hbOcc;
    outgoingLight += diffuseColor.rgb * hbPool(vHbWorld, hbNw);
    // moonlight fill (0 by day): soft, mostly from above, with an albedo floor so dark hulls and
    // navy/black sail covers keep a readable mid-tone at night instead of collapsing to silhouettes
    outgoingLight += max(diffuseColor.rgb, vec3(0.12)) * uNightLift * hbOcc * (0.6 + 0.4 * max(hbNw.y, 0.0));
    // puddles mirror the sky; fresh snow catches the sun in sparse glints (faded where sub-pixel)
    // puddles: dark mirrors of the sky (water's low Fresnel, brighter only toward grazing), capped by the sky
    outgoingLight += min(hbEnvSpec(hbNw, hbVw, 0.02, 0.03), vec3(0.3 * hbSkyL + 0.003)) * hbPuddle * hbOcc;
    if (hbSnow > 0.01) {
      float g = step(0.992, hbWhite(floor(vHbWorld * 4.5) + 101.0)) * hbFine(hbSdW, 0.22);
      float spec = pow(max(dot(reflect(-hbVw, hbNw), uHbSunDir), 0.0), 4.0);
      outgoingLight += uHbSunColor * g * spec * hbSnow * hbCs * 0.5;
    }
  }
  #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => `hb_kit_${fallbackPid}_${leafFallAt(this.uniforms) > 0.001 ? "bare" : "leaf"}`;
    this.cache.set(key, m);
    return m;
  }

  /**
   * Shadow-depth twin of the kit: drops the same bare-crown fragments, so a winter tree casts the shadow of
   * its twigs, not of last summer's canopy. Only needed while leafFallAt() > 0 (the season system assigns it).
   */
  kitDepth(): THREE.MeshDepthMaterial {
    const hit = this.cache.get("kit-depth");
    if (hit) return hit as THREE.MeshDepthMaterial;
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.name = "hb_kit_depth";
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uFoliage: this.uniforms.uFoliage, uSeasonPhase: this.uniforms.uSeasonPhase });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 color;\nvarying vec3 vHbWorld;\nvarying vec4 vHbCol;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
  vHbCol = color;
  {
    vec4 hbW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      hbW = instanceMatrix * hbW;
    #endif
    vHbWorld = (modelMatrix * hbW).xyz;
  }`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${GLSL_NOISE}\n${GLSL_LEAF_FALL}\nvarying vec3 vHbWorld;\nvarying vec4 vHbCol;`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  {
    float pid = floor(vHbCol.a * 16.0 + 0.5);
    float bare = hbIs(pid, 8.0) * hbLeafFall() * (1.0 - hbConifer(vHbCol.rgb));
    if (hbNoise(vHbWorld * 1.7) < bare * 0.84) discard;
  }`);
    };
    m.customProgramCacheKey = () => "hb_kit_depth_v1";
    this.cache.set("kit-depth", m);
    return m;
  }

  /**
   * Windows: painted frame + cross mullion around dark glass by day; by night a share of rooms
   * (uWindowOcc, deterministic per window) glows, each with its own warmth (candle → cool lamp) and level,
   * brighter low in the room, and clamped so frames and mullions stay visible under bloom.
   * Needs the per-window attributes written by prepareWindowGeometry() (apply() does it).
   * COLOR_0.r = authored lit factor (kept as a level hint), .g = warmth.
   */
  window(): THREE.MeshStandardMaterial {
    const hit = this.cache.get("window");
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#22303C"), roughness: 0.08, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
    m.name = "hb_window";
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shared());
      injectVaryings(shader);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 hbWin;\nattribute vec3 hbWinC;\nvarying vec4 vHbWin;\nvarying vec3 vHbWinC;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
  vHbWin = hbWin;
  {
    vec4 c = vec4(hbWinC, 1.0);
    #ifdef USE_INSTANCING
      c = instanceMatrix * c;
    #endif
    vHbWinC = (modelMatrix * c).xyz;
  }`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float uWindowGlow;\nuniform float uWindowOcc;\n${GLSL_NOISE}\n${GLSL_ENV}\nvarying vec3 vHbLocal;\nvarying vec3 vHbLocalN;\nvarying vec3 vHbWorld;\nvarying vec4 vHbWin;\nvarying vec3 vHbWinC;`)
        .replace("#include <color_fragment>", `
  float hbLit = 1.0, hbWarm = 0.0;
  #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
    hbLit = vColor.r; hbWarm = vColor.g;
  #endif
  // frame + cross mullion (metres in the window plane), faded to coverage when under ~2 px
  vec2 hbWm = max(vHbWin.zw, vec2(0.05));
  vec2 hbP = vHbWin.xy * hbWm;
  vec2 hbAA = fwidth(hbP) + 1e-4;
  float hbEdge = min(min(hbP.x, hbWm.x - hbP.x), min(hbP.y, hbWm.y - hbP.y));
  float hbFrame = 1.0 - smoothstep(0.06 - hbAA.x, 0.06 + hbAA.x, hbEdge);
  float hbBar = 1.0 - smoothstep(0.03 - hbAA.x, 0.03 + hbAA.x, min(abs(hbP.x - hbWm.x * 0.5), abs(hbP.y - hbWm.y * 0.6)));
  float hbWood = max(hbFrame, hbBar);
  hbWood = mix(hbWood, 0.3, smoothstep(0.03, 0.09, max(hbAA.x, hbAA.y)));
  float hbGlass = 1.0 - hbWood;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.55), hbWood);`)
        .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.6, 0.08, hbGlass);")
        .replace("#include <emissivemap_fragment>", `
  {
    // one identity per window (its centre), stable across frames, instances and LOD
    vec3 hbId = floor(vHbWinC * 2.0);
    float on = step(hbWhite(hbId + 11.0), uWindowOcc);
    float tint = fract(hbWhite(hbId + 29.0) + hbWarm * 0.35);
    vec3 candle = vec3(1.0, 0.26, 0.04);        // deep candle orange (linear)
    vec3 lamp = vec3(1.0, 0.50, 0.17);          // oil lamp
    vec3 cool = vec3(0.92, 0.72, 0.50);         // cooler electric lamp
    vec3 col = tint < 0.6 ? mix(candle, lamp, tint / 0.6) : mix(lamp, cool, (tint - 0.6) / 0.4);
    float level = 0.45 + 0.55 * max(hbWhite(hbId + 47.0), hbLit * 0.6);
    // lit room: brighter low and centre (the lamp on the table), darker top corners
    vec2 q = vHbWin.xy - vec2(0.5, 0.3);
    float room = 0.6 + 0.55 * exp(-q.x * q.x * 5.0 - q.y * q.y * 4.0);
    totalEmissiveRadiance = col * on * level * room * uWindowGlow * ${WIN_MAX.toFixed(1)} * (hbGlass + 0.04);
  }`)
        .replace("#include <opaque_fragment>", `
  {
    vec3 hbV = normalize(vViewPosition);
    outgoingLight += hbEnvSpec(inverseTransformDirection(normal, viewMatrix), inverseTransformDirection(hbV, viewMatrix), 0.08, 0.06) * 1.4 * hbGlass;
  }
  #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => "hb_window_v2";
    this.cache.set("window", m);
    return m;
  }

  /** Lamp glass / beacons: base colour + emission × uLamp. */
  emissive(glowHex = "#FFAE57", baseHex = "#3B3A33"): THREE.MeshStandardMaterial {
    const key = `emissive:${glowHex}:${baseHex}`;
    const hit = this.cache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(baseHex), roughness: 0.15, metalness: 0, emissive: new THREE.Color(glowHex) });
    m.name = "hb_emissive";
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLamp = this.uniforms.uLamp;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uLamp;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uLamp;");
    };
    m.customProgramCacheKey = () => "hb_emissive";
    this.cache.set(key, m);
    return m;
  }

  /** The Pharos lens: lantern-coloured emission × uLens × lit (lit = 0 for a null PSI band). */
  lens(lit: THREE.IUniform<number>): THREE.MeshStandardMaterial {
    const hit = this.cache.get("lens");
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#E8F3EE"), roughness: 0.15, metalness: 0, emissive: new THREE.Color("#FFE0A8") });
    m.name = "hb_lens";
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uLens = this.uniforms.uLens;
      shader.uniforms.uLensLit = lit;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uLens;\nuniform float uLensLit;")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uLens * uLensLit;");
    };
    m.customProgramCacheKey = () => "hb_lens";
    this.cache.set("lens", m);
    return m;
  }

  /** Lantern glazing: thin, slightly warm, additive-ish glass that never occludes the lens glow. */
  glass(): THREE.MeshStandardMaterial {
    const hit = this.cache.get("glass");
    if (hit) return hit as THREE.MeshStandardMaterial;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color("#C9D6DC"), roughness: 0.1, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    m.name = "hb_glass";
    this.cache.set("glass", m);
    return m;
  }

  /**
   * Replace glTF materials under `root` by the port, by material name.
   * Quantized meshes (KHR_mesh_quantization) are dequantized first so the object-space patterns
   * see metres (see dequantizeForPatterns). Unknown names are left alone.
   * Sets shadows: opaque kit casts + receives; glass/emissive/lens do not cast.
   */
  apply(root: THREE.Object3D, opts: { lensLit?: THREE.IUniform<number> } = {}): void {
    const lensLit = opts.lensLit ?? { value: 1 };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh && !mesh.morphTargetInfluences) dequantizeForPatterns(mesh);
      const swap = (mat: THREE.Material): THREE.Material => {
        const kind = materialKindFor(mat.name);
        const src = mat as THREE.MeshStandardMaterial;
        switch (kind) {
          case "kit": return this.kit();
          case "window": return this.window();
          case "emissive": {
            const glow = mat.name.toLowerCase().startsWith("beacon") ? "#FF5A3C" : "#FFAE57";
            return this.emissive(glow, src.color ? `#${src.color.getHexString()}` : "#3B3A33");
          }
          case "lens": return this.lens(lensLit);
          case "glass": return this.glass();
          default: return mat;
        }
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      if ((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => m.name === "hb_window")) prepareWindowGeometry(mesh.geometry);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // only the opaque kit casts (window panes sit inside walls that already do)
      mesh.castShadow = mats.every((m) => m.name === "hb_kit");
      mesh.receiveShadow = !mats.some((m) => m.name === "hb_glass");
    });
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}

/**
 * Per-window attributes for the window material: every connected piece of a window mesh is one window
 * pane. hbWin = (u, v, width m, height m) in the pane's own plane (u across, v up), hbWinC = its centre.
 * Idempotent; runs once at load (union-find over the index).
 */
export function prepareWindowGeometry(g: THREE.BufferGeometry): void {
  if (g.attributes.hbWin) return;
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const n = pos.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const idx = g.index;
  const triCount = idx ? idx.count : n;
  for (let t = 0; t < triCount; t += 3) {
    const a = find(idx ? idx.getX(t) : t);
    for (let k = 1; k < 3; k++) { const b = find(idx ? idx.getX(t + k) : t + k); if (b !== a) parent[b] = a; }
  }
  const comp = new Map<number, { min: THREE.Vector3; max: THREE.Vector3; n: THREE.Vector3; verts: number[] }>();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let c = comp.get(r);
    if (!c) { c = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), n: new THREE.Vector3(), verts: [] }; comp.set(r, c); }
    p.fromBufferAttribute(pos, i);
    c.min.min(p); c.max.max(p);
    if (nrm) { c.n.x += nrm.getX(i); c.n.y += nrm.getY(i); c.n.z += nrm.getZ(i); }
    c.verts.push(i);
  }
  const win = new Float32Array(n * 4), ctr = new Float32Array(n * 3);
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), centre = new THREE.Vector3();
  for (const c of comp.values()) {
    centre.addVectors(c.min, c.max).multiplyScalar(0.5);
    c.n.y = 0;
    if (c.n.lengthSq() < 1e-6) c.n.set(0, 0, 1);
    side.crossVectors(up, c.n.normalize()).normalize();
    let lo = Infinity, hi = -Infinity;
    for (const i of c.verts) { const s = side.dot(p.fromBufferAttribute(pos, i).sub(centre)); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    const w = Math.max(1e-3, hi - lo), h = Math.max(1e-3, c.max.y - c.min.y);
    for (const i of c.verts) {
      p.fromBufferAttribute(pos, i);
      win[i * 4] = (side.dot(p.clone().sub(centre)) - lo) / w;
      win[i * 4 + 1] = (p.y - c.min.y) / h;
      win[i * 4 + 2] = w; win[i * 4 + 3] = h;
      ctr[i * 3] = centre.x; ctr[i * 3 + 1] = centre.y; ctr[i * 3 + 2] = centre.z;
    }
  }
  g.setAttribute("hbWin", new THREE.BufferAttribute(win, 4));
  g.setAttribute("hbWinC", new THREE.BufferAttribute(ctr, 3));
}

const baked = new WeakSet<THREE.BufferGeometry>();

/**
 * KHR_mesh_quantization stores positions as normalised ints and puts the dequantisation in the node
 * matrix, so `position` is no longer in metres and the object-space patterns would be scaled wrong.
 * Bake the node's local matrix into a float copy of the geometry and reset the node: the vertex data
 * is then in the parent's (asset root's) metres, which is Blender's object space for kit exports.
 */
export function dequantizeForPatterns(mesh: THREE.Mesh): void {
  const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos || (pos.array instanceof Float32Array && !pos.normalized)) return;
  let g = mesh.geometry;
  if (baked.has(g)) g = g.clone();
  const toFloat = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    return new THREE.BufferAttribute(out, a.itemSize);
  };
  for (const name of ["position", "normal", "uv", "color"]) {
    const a = g.attributes[name];
    if (a && (!(a.array instanceof Float32Array) || (a as THREE.BufferAttribute).normalized)) g.setAttribute(name, toFloat(a));
  }
  mesh.updateMatrix();
  g.applyMatrix4(mesh.matrix);
  g.computeBoundingBox(); g.computeBoundingSphere();
  baked.add(g);
  mesh.geometry = g;
  mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

/** The shared HarbourMaterials ('materials' service), created on first use. */
export function getHarbourMaterials(ctx: EngineContext): HarbourMaterials {
  let m = ctx.services.get("materials") as HarbourMaterials | undefined;
  if (!m) { m = new HarbourMaterials(ctx.uniforms); ctx.services.set("materials", m); }
  return m;
}

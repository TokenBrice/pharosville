import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import type { WorldUniforms } from "../engine/uniforms";
import { FLEET_FAR_FRAG } from "./fleet-far";

/**
 * The fleet material: the shared harbour kit material (patterns, world breakup, env spec, light
 * pools, height-field AO — so boats sit in the island's light) extended for one BatchedMesh draw of
 * every hull. Per-instance state lives in `uFleetData` (2 RGBA32F texels per batch instance):
 *   texel 0 = (furl 0..1, signed boom swing rad (>0 = port tack, mirrored rig), highlight 0..1,
 *              pennant: sign = flies (>0) or struck (<0); |w| = 1 + far (0..1: spars recede far away), + 2 when
 *              the CPU struck the rig (see STRUCK))
 *   texel 1 = (brand r, g, b linear, emblem slot or -1; -2 = a v1 hulk; ≤ -9 = a wreck kit v2 piece, -10 - n = nameboard n)
 *   (wreck kit v2 pieces: texel 0.x = their lantern lit 0..1; kinds 3 = epitaph board, 4 = lantern glass)
 * and the static livery in `uFleetPaint` (5 RGBA32F texels per instance, written once at install):
 *   texel 0 = (topside rgb, name board 0|1) · 1 = (stripe / trim rgb, painted 0|1) · 2 = (deck rgb, -) ·
 *   3 = (coachroof rgb, painted 0|1) · 4 = (sail dye rgb, mode 0 canvas | 1 dyed | 2 canvas + brand bands; livery.sailDye).
 *   The kit's aPaint region picks which one a corner wears; sails wear texel 4 by their sail-plan role (aMeta.z).
 * The vertex shader poses the rig (furl morph, mirror, boom/boom_2 about the gooseneck, jib about its
 * stay); the fragment tints _BRAND corners and covers, prints the emblem from the atlas onto sail_main
 * (manifest flip rule; sail-plan.ts re-measures the emblem square: a bigger roundel, and one on the second sail),
 * dyes the sail cloth in the brand colour, and adds cloth seams, sail translucency and the hover rim.
 */
export interface FleetUniforms {
  uFleetData: THREE.IUniform<THREE.DataTexture>;
  uFleetPaint: THREE.IUniform<THREE.DataTexture>;
  uEmblems: THREE.IUniform<THREE.Texture>;
  /** (cols, rows, 1/cols, 1/rows) */
  uEmblemGrid: THREE.IUniform<THREE.Vector4>;
  uWind: THREE.IUniform<number>;
  /** The fleet's decorative clock (s): stands still under reduced motion (rig life, flags, lamp shimmer). */
  uFleetTime: THREE.IUniform<number>;
  /** Wreck Cove epitaph nameboards (alpha = ink) and their grid (cols, rows, 1/cols, 1/rows). */
  uBoards: THREE.IUniform<THREE.Texture>;
  uBoardGrid: THREE.IUniform<THREE.Vector4>;
}

/**
 * Far away the rig recedes so docked rows read as hulls and a few masts, not a forest of sticks. texel 0.w
 * packs it: |w| = 1 + far, or 3 + far when the CPU has struck this hull's rig (furled, small on screen,
 * hash-picked). Standing rigging drops past half fade; a struck rig loses its spars, pennant and the cloth
 * that hangs off them (jib, square sails), keeping the hull and its brand cover. Colour and shadow passes.
 */
const STRUCK = /* glsl */ `
vec2 hbFleetFar(float w) {
  float m = abs(w);
  float struck = m > 2.5 ? 1.0 : 0.0;
  return vec2(clamp(m - 1.0 - 2.0 * struck, 0.0, 1.0), struck);
}
bool hbFleetStruck(float w) {
  vec2 f = hbFleetFar(w);
  float code = aPaint.x;
  if (code > 9.5 && code < 10.5) return f.x > 0.5 || f.y > 0.5;
  if (f.y < 0.5) return false;
  if (code > 7.5 && code < 9.5) return true;                                   // spars, LOD rig
  if (aMeta.w > 0.5) return true;                                              // pennant
  return aMeta.x > 0.5 && aMeta.x < 1.5 && (aMeta.y < 1.5 || aMeta.y > 3.5);  // jib, square sails
}
`;

const VERT_PARS = /* glsl */ `
attribute vec4 aMeta;
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec3 aFurl;
attribute vec3 aFurlN;
attribute vec2 aSailUV;
attribute vec2 aEmbUV;
attribute vec2 aPaint;
uniform highp sampler2D uFleetData;
uniform highp sampler2D uFleetPaint;
uniform float uWind;
varying vec4 vPaintA;       // livery rgb, mode (0 keep · 1 paint · 2 topsides · 3 deck (keeps the grain) · 4 LOD topsides · 5 spar)
varying vec4 vPaintB;       // trim rgb, topside height t
varying vec3 vPaintC;       // x / half loa, name board, far (0 near … 1 a few px: spars recede, margins widen)
varying vec4 vFleetBrand;   // rgb, slot
varying vec4 vFleetMisc;    // highlight, flip (mirrored node now), kind, brand mask | sail role
varying vec4 vFleetUV;      // sail uv, emblem uv
varying vec4 vFleetRig;     // furl, node, flag, side (posed object-space normal z: covers print their roundel on ±z)
varying vec4 vSailDye;      // sails: dye rgb, mode (uFleetPaint texel 4)
vec4 hbFleetTexel(int idx, int k) {
  int size = textureSize(uFleetData, 0).x;
  int j = idx * 2 + k;
  return texelFetch(uFleetData, ivec2(j % size, j / size), 0);
}
mat3 hbRotAxis(vec3 a, float ang) {
  float c = cos(ang), s = sin(ang), t = 1.0 - c;
  return mat3(t * a.x * a.x + c, t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
              t * a.x * a.y - s * a.z, t * a.y * a.y + c, t * a.y * a.z + s * a.x,
              t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c);
}
vec4 hbPaintTexel(int idx, int k) {
  int size = textureSize(uFleetPaint, 0).x;
  int j = idx * 5 + k;
  return texelFetch(uFleetPaint, ivec2(j % size, j / size), 0);
}
// the instance's livery for this corner's kit region (decorative: hash-picked per coin, never data)
void hbFleetLivery(int idx, float far) {
  vPaintA = vec4(0.0); vPaintB = vec4(0.0); vPaintC = vec3(aPaint.y, 0.0, far);
  float code = aPaint.x;
  if (code < 0.5) return;
  if (code > 7.5 && code < 9.5) { vPaintA.w = 5.0; return; }
  vec4 trim = hbPaintTexel(idx, 1);
  if (trim.w < 0.5) return;
  if (code < 2.5 || code > 10.5) {
    vec4 top = hbPaintTexel(idx, 0);
    bool lod = code > 10.5;
    vPaintA = vec4(top.rgb, lod ? 4.0 : 2.0);
    vPaintB = vec4(trim.rgb, (code - (lod ? 11.0 : 1.0)) / 0.98);
    vPaintC.y = top.w;
  } else if (code < 3.5) vPaintA = vec4(trim.rgb, 1.0);                       // sheer stripe / band
  else if (code < 4.995) {                                                     // deck, its margin in the topside paint
    vPaintA = vec4(hbPaintTexel(idx, 2).rgb, 3.0);
    vPaintB = vec4(hbPaintTexel(idx, 0).rgb, (code - 4.0) / 0.98);
  }
  else if (code > 5.5 && code < 6.5) vPaintA = vec4(mix(trim.rgb, vec3(0.8, 0.76, 0.66), 0.35), 1.0); // inside bulwarks
  else if (code > 6.5 && code < 7.5) {                                          // coachroof
    vec4 roof = hbPaintTexel(idx, 3);
    if (roof.w > 0.5) vPaintA = vec4(roof.rgb, 1.0);
  }
}
vec3 hbFleetP; vec3 hbFleetN;
${STRUCK}
void hbFleetPose(vec3 p, vec3 n) {
  #ifdef USE_BATCHING
    int idx = int(getIndirectIndex(gl_DrawID));
  #else
    int idx = 0;
  #endif
  vec4 a = hbFleetTexel(idx, 0);
  vec4 b = hbFleetTexel(idx, 1);
  float furl = a.x, swing = a.y;
  p += aFurl * furl;
  vec3 nn = n + aFurlN * furl;
  n = dot(nn, nn) > 1e-6 ? normalize(nn) : vec3(0.0, 1.0, 0.0);
  float node = aMeta.y;
  float flip = (node > 0.5 && swing > 0.0) ? 1.0 : 0.0;
  if (flip > 0.5) { p.z = -p.z; n.z = -n.z; }
  if (node > 1.5) {
    float ang = node < 3.5 ? swing : 0.6 * swing;
    // a little life in the set sail: the boom works with the swell
    ang += sin(uTime * 0.9 + float(idx) * 1.7) * 0.025 * (1.0 - furl);
    mat3 R = hbRotAxis(aAxis, ang);
    p = aPivot + R * (p - aPivot);
    n = R * n;
  }
  if (aMeta.w > 0.5) {
    // ensign flutter: a travelling wave that grows away from the hoist (+x/-x unknown: use |local x| from the flag's mean)
    float ph = uTime * (6.0 + 3.0 * uWind) + float(idx) * 2.3;
    p.z += sin(ph + p.x * 3.0 + p.y) * (0.05 + 0.08 * uWind) * (1.0 - furl * 0.5);
  }
  if (aMeta.w > 0.5 && a.w < 0.5) p = vec3(0.0); // pennant struck (small hulls seen from afar)
  if (hbFleetStruck(a.w)) p = vec3(0.0);
  hbFleetLivery(idx, hbFleetFar(a.w).x);
  hbFleetP = p; hbFleetN = n;
  vFleetBrand = b;
  vSailDye = aMeta.x > 0.5 && aMeta.x < 1.5 ? hbPaintTexel(idx, 4) : vec4(0.0);
  vFleetMisc = vec4(a.z, flip, aMeta.x, aMeta.z);
  vFleetUV = vec4(aSailUV, aEmbUV);
  vFleetRig = vec4(furl, node, aMeta.w, n.z);
}
`;

const DEPTH_VERT_PARS = /* glsl */ `
attribute vec4 aMeta;
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec3 aFurl;
attribute vec2 aPaint;
uniform highp sampler2D uFleetData;
uniform float uTime;
vec4 hbFleetTexel(int idx, int k) {
  int size = textureSize(uFleetData, 0).x;
  int j = idx * 2 + k;
  return texelFetch(uFleetData, ivec2(j % size, j / size), 0);
}
mat3 hbRotAxis(vec3 a, float ang) {
  float c = cos(ang), s = sin(ang), t = 1.0 - c;
  return mat3(t * a.x * a.x + c, t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
              t * a.x * a.y - s * a.z, t * a.y * a.y + c, t * a.y * a.z + s * a.x,
              t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c);
}
${STRUCK}
vec3 hbFleetPoseP(vec3 p) {
  int idx = int(getIndirectIndex(gl_DrawID));
  vec4 a = hbFleetTexel(idx, 0);
  float furl = a.x, swing = a.y;
  p += aFurl * furl;
  if (aMeta.w > 0.5 && a.w < 0.5) p = vec3(0.0);
  if (hbFleetStruck(a.w)) p = vec3(0.0);
  float node = aMeta.y;
  if (node > 0.5 && swing > 0.0) p.z = -p.z;
  if (node > 1.5) {
    float ang = (node < 3.5 ? swing : 0.6 * swing) + sin(uTime * 0.9 + float(idx) * 1.7) * 0.025 * (1.0 - furl);
    p = aPivot + hbRotAxis(aAxis, ang) * (p - aPivot);
  }
  return p;
}
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D uEmblems;
uniform vec4 uEmblemGrid;
uniform sampler2D uBoards;
uniform vec4 uBoardGrid;
uniform float uLamp;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec4 vFleetBrand;
varying vec4 vFleetMisc;
varying vec4 vFleetUV;
varying vec4 vFleetRig;
varying vec4 vSailDye;
varying vec4 vPaintA;
varying vec4 vPaintB;
varying vec3 vPaintC;
float hbSeam(float c, float period, float w) {
  float f = abs(fract(c / period + 0.5) - 0.5) * period;
  float aa = fwidth(c) * 0.75 + 1e-5;
  return 1.0 - smoothstep(w - aa, w + aa, f);
}
${FLEET_FAR_FRAG}
// livery (decorative, per coin): painted topsides with a sheer stripe and a name board, deck tone, trim
void hbFleetPaint(inout vec3 c) {
  float mode = vPaintA.w;
  if (mode < 0.5) return;
  if (mode > 4.5) {
    // spars far away: a weathered slate that sits into the water instead of a field of bright sticks
    c = mix(c, vec3(0.06, 0.068, 0.072), vPaintC.z * 0.8);
    return;
  }
  if (mode > 2.5 && mode < 3.5) {
    c = vPaintA.rgb * clamp(c / vec3(0.552, 0.356, 0.168), 0.85, 1.15);
    // painted margin boards / inside of the bulwarks: from above, each hull is outlined in its own paint
    float s = abs(vPaintB.w * 2.0 - 1.0), as = fwidth(s) + 1e-4;
    // (wider far away, where a hull is a few pixels across and the margin is all that can carry its colour)
    float edge = mix(0.74, 0.4, vPaintC.z);
    c = mix(c, vPaintB.rgb, smoothstep(edge - as, edge + as, s));
    return;
  }
  c = vPaintA.rgb;
  if (mode < 1.5) return;
  float t = vPaintB.w;
  float aa = fwidth(t) + 1e-4;
  if (mode > 3.5) {
    // LOD: the sheer stripe is painted, not modelled
    float s = smoothstep(0.80 - aa, 0.80 + aa, t) * (1.0 - smoothstep(0.93 - aa, 0.93 + aa, t));
    c = mix(c, vPaintB.rgb, s);
    hbWeather(c, t, aa);
    hbFarLodHull(c, t, aa);
    return;
  }
  hbWeather(c, t, aa);
  if (vPaintC.y > 0.5) {
    // a name board on each bow quarter: a contrasting board, a run of lettering on it
    float u = vPaintC.x, au = fwidth(u) + 1e-4;
    float bx = smoothstep(0.46 - au, 0.46 + au, u) * (1.0 - smoothstep(0.66 - au, 0.66 + au, u));
    float by = smoothstep(0.50 - aa, 0.50 + aa, t) * (1.0 - smoothstep(0.84 - aa, 0.84 + aa, t));
    float board = bx * by;
    if (board > 0.0) {
      bool dark = dot(c, vec3(0.2126, 0.7152, 0.0722)) < 0.12;
      vec3 bg = dark ? vec3(0.72, 0.66, 0.5) : vec3(0.025, 0.03, 0.035);
      vec3 ink = dark ? vec3(0.03, 0.035, 0.04) : vec3(0.62, 0.42, 0.12);
      // letters: short strokes along the board that melt into a mid tone when too small to read
      float k = smoothstep(0.5, 1.5, 1.0 / (au * 90.0));
      float letters = step(0.35, fract(u * 90.0)) * smoothstep(0.58, 0.6, t) * (1.0 - smoothstep(0.74, 0.76, t)) * step(0.49, u) * step(u, 0.63);
      vec3 b = mix(bg, mix(bg, ink, 0.3), 1.0 - k);
      b = mix(b, ink, letters * k);
      c = mix(c, b, board);
    }
  }
}
void hbFleetColor(inout vec3 c) {
  float kind = vFleetMisc.z;
  // derivatives in uniform control flow
  vec2 e = vFleetUV.zw;
  vec2 ex = dFdx(e), ey = dFdy(e);
  vec2 su = vFleetUV.xy;
  float seams = hbSeam(su.y, 0.125, 0.006);
  float tabling = max(1.0 - smoothstep(0.015, 0.03, min(su.x, 1.0 - su.x)), 1.0 - smoothstep(0.02, 0.035, su.y));
  float fine = 1.0 - smoothstep(0.02, 0.08, fwidth(su.y));
  vec2 sx2 = dFdx(su), sy2 = dFdy(su);
  vec2 sw = fwidth(su) + 1e-4;
  float er = length(e - 0.5), era = fwidth(er) + 1e-5;
  // the roundel is clamped to the sail outline with a small margin (1.5% of its size, ≥ 1 px): px to the luff,
  // leech, foot and head along the sail-space gradients
  vec2 sg = vec2(length(vec2(sx2.x, sy2.x)), length(vec2(sx2.y, sy2.y))) + 1e-6;
  float edgePx = min(min(su.x, 1.0 - su.x) / sg.x, min(su.y, 1.0 - su.y) / sg.y);
  float inPx = max(1.0, 0.015 / era);
  float clampR = smoothstep(inPx, inPx + 1.0, edgePx);
  // hulks (v1): salt-bleached, tar-stained timber, never a clean grey (v2 wrecks carry their weathering baked)
  if (vFleetBrand.a < -1.5 && vFleetBrand.a > -2.5) c *= vec3(0.66, 0.58, 0.49);
  if (kind > 3.5) { c = vec3(0.042, 0.04, 0.034); return; }   // lantern glass (its glow is added after lighting)
  if (kind > 2.5) {
    // the epitaph nameboard: the dead coin's name in dark ink, carved into the weathered board
    float board = -vFleetBrand.a - 10.0;
    if (board >= 0.0 && su.x >= 0.0 && su.x <= 1.0 && su.y >= 0.0 && su.y <= 1.0) {
      vec2 cell = vec2(mod(board, uBoardGrid.x), floor(board / uBoardGrid.x));
      // (glTF TEXCOORD_0: v runs top → bottom of the board, as the canvas rows do; flipY puts row 0 at v = 1)
      vec2 uv = vec2((cell.x + su.x) * uBoardGrid.z, 1.0 - (cell.y + su.y) * uBoardGrid.w);
      float ink = textureGrad(uBoards, uv, vec2(sx2.x, -sx2.y) * uBoardGrid.zw, vec2(sy2.x, -sy2.y) * uBoardGrid.zw).a;
      c = mix(c, c * vec3(0.16, 0.13, 0.11), ink * 0.92);
    }
    return;
  }
  vec3 brand = vFleetBrand.rgb;
  float bl = dot(brand, vec3(0.2126, 0.7152, 0.0722));
  vec3 dyed = mix(vec3(bl), brand, 0.7) * 0.74;          // dyed canvas: muted, a shade darker, never plastic
  if (kind > 1.5) {
    // brand sail cover (flaked low on the boom, or a square rig's brailed bundle under its yard): a pale lacing band
    // along its top, lacing ties
    float band = 1.0 - smoothstep(0.035, 0.08, abs(su.y - 0.9));
    float ties = (1.0 - smoothstep(0.025, 0.05, abs(fract(su.x * 7.0) - 0.5))) * smoothstep(0.3, 0.6, su.y);
    c *= mix(dyed, vec3(0.8, 0.76, 0.66), band * 0.65) * (1.0 - ties * 0.22);
    // the coin's roundel printed on each side of the furled cover (hull-kit bakes it in the side plane, u along +x; on
    // a brailed bundle on its forward and aft faces, u along the yard, which faces +z aft): read the right way round
    // from either side (the side is the posed normal's z), faded off the crest and while the sail is still coming down
    float side = vFleetRig.w;
    // (a brailed bundle, node 1, faces fore and aft of a yard braced 30°: its faces are only ~0.5 along z, so a lower
    // threshold; a boom cover's flat side is ~1 and its crest ~0)
    bool bundle = abs(vFleetRig.y - 1.0) < 0.5;
    float show = smoothstep(0.55, 0.9, vFleetRig.x) * (bundle ? smoothstep(0.08, 0.3, abs(side)) : smoothstep(0.25, 0.55, abs(side)));
    if (vFleetBrand.a >= 0.0 && show > 0.0 && e.x >= 0.0 && e.x <= 1.0 && e.y >= 0.0 && e.y <= 1.0) {
      float sx = side < 0.0 ? -1.0 : 1.0;
      vec2 q = vec2(side < 0.0 ? 1.0 - e.x : e.x, e.y);
      vec2 cell = vec2(mod(vFleetBrand.a, uEmblemGrid.x), floor(vFleetBrand.a / uEmblemGrid.x));
      vec2 uv = vec2((cell.x + q.x) * uEmblemGrid.z, 1.0 - (cell.y + q.y) * uEmblemGrid.w);
      vec2 gx = vec2(ex.x * sx * uEmblemGrid.z, -ex.y * uEmblemGrid.w);
      vec2 gy = vec2(ey.x * sx * uEmblemGrid.z, -ey.y * uEmblemGrid.w);
      vec4 t = textureGrad(uEmblems, uv, gx, gy) * show;  // premultiplied
      t = hbFarEmblem(t, dyed * 0.55);
      c = c * (1.0 - t.a) + t.rgb * 0.9;
    }
  } else if (kind > 0.5) {
    vec4 dye = vSailDye;
    if (dye.w > 0.5) {
      // Brand-dyed canvas by sail-plan role (aMeta.z): the body dyed · headsails a light tint with a brand band at
      // foot and leech · upper sails lighter · a titan's head band a deeper shade. A near-white brand (mode 2)
      // keeps the canvas and bands it. The family cloth (cream, tanbark …) shows through a little. Square sails
      // (node 1: hung from _heel / the yards, both side edges alike) take the band along the foot only, a little deeper.
      float role = vFleetMisc.w;
      vec3 cloth = c, pig = hbDyeChroma(dye.rgb), body = mix(pig, cloth, 0.1);
      bool squareSail = abs(vFleetRig.y - 1.0) < 0.5;
      float foot = 1.0 - smoothstep((squareSail ? 0.1 : 0.07) - sw.y, (squareSail ? 0.1 : 0.07) + sw.y, su.y);
      float edge = squareSail ? foot : max(smoothstep(0.93 - sw.x, 0.93 + sw.x, su.x), foot);
      vec3 base;
      if (dye.w > 1.5) base = role > 2.5 ? pig : mix(cloth, pig, edge);
      else if (role > 2.5) base = pig * 0.5;
      else if (role > 1.5) base = mix(cloth, body, 0.65);
      else if (role > 0.5) base = mix(mix(cloth, body, 0.32), pig, edge);
      else base = body;
      // uneven dye take-up and a sun-faded head: canvas, not plastic
      float mott = sin(su.x * 13.0 + sin(su.y * 9.0) * 1.6) * sin(su.y * 21.0 - su.x * 4.0);
      base *= 0.97 + 0.05 * mott;
      c = mix(base, base * 1.1 + 0.015, smoothstep(0.5, 1.0, su.y) * 0.5);
    }
    c *= 1.0 - (seams * 0.07 + tabling * 0.09) * fine;    // cloths + tabling
    // furled canvas (rolled jib, square sails on their yards): weathered cloth, not a white bar
    c = mix(c, c * vec3(0.66, 0.62, 0.55), smoothstep(0.35, 0.95, vFleetRig.x));
    float slot = vFleetBrand.a;
    // the roundel rides the furl morph and fades as the sail comes down (docked: the cover and house flag carry it)
    float show = (1.0 - smoothstep(0.2, 0.6, vFleetRig.x)) * clampR;
    if (slot >= 0.0 && show > 0.0 && er < 0.56) {
      // a thin brand ring round the white disc: a deeper shade on a dyed sail, so it frames the disc
      vec3 ringCol = dye.w > 1.5 ? dye.rgb : dye.w > 0.5 ? dye.rgb * 0.42 : vFleetBrand.rgb;
      float ring = smoothstep(0.482 - era, 0.482 + era, er) * (1.0 - smoothstep(0.535 - era, 0.535 + era, er));
      c = mix(c, ringCol, ring * show);
    }
    if (slot >= 0.0 && show > 0.0 && e.x >= 0.0 && e.x <= 1.0 && e.y >= 0.0 && e.y <= 1.0) {
      // manifest rule: flip u when gl_FrontFacing == isMirrored, with three's det<0 front-face swap.
      // The mirror happens in this vertex shader (no swap), so the rule reduces to: flip on back faces.
      bool flipU = !gl_FrontFacing;
      float u = flipU ? 1.0 - e.x : e.x;
      float sx = flipU ? -1.0 : 1.0;
      vec2 cell = vec2(mod(slot, uEmblemGrid.x), floor(slot / uEmblemGrid.x));
      vec2 inset = vec2(u, e.y) * 0.97 + 0.015;
      // emblem v runs head → foot against the atlas rows (verified on the real GPU: CADC upright)
      vec2 uv = vec2((cell.x + inset.x) * uEmblemGrid.z, 1.0 - (cell.y + inset.y) * uEmblemGrid.w);
      vec2 gx = vec2(ex.x * sx * 0.97 * uEmblemGrid.z, -ex.y * 0.97 * uEmblemGrid.w);
      vec2 gy = vec2(ey.x * sx * 0.97 * uEmblemGrid.z, -ey.y * 0.97 * uEmblemGrid.w);
      vec4 t = textureGrad(uEmblems, uv, gx, gy) * show; // premultiplied
      t = hbFarEmblem(t, (dye.w > 0.5 ? dye.rgb : vFleetBrand.rgb) * 0.5);
      c = c * (1.0 - t.a) + t.rgb * 0.92;                  // printed on cloth: a touch under paper-white
    }
    hbFarCloth(c);
  } else if (vFleetRig.z > 0.5) {
    c = dyed * 1.15;                                       // house pennant in the brand colour (no national ensign)
  } else {
    hbFleetPaint(c);
    c = mix(c, vFleetBrand.rgb, vFleetMisc.w);           // boot-top
  }
}
`;

/** Physical hover (12-M5): a soft sun-coloured sheen on the sail cloth only, by day (uLamp fades it at dusk). */
const HOVER_SHEEN = /* glsl */ `
vec3 hbHoverSheen(vec3 base, float kind, float hi) {
  if (kind < 0.5 || kind > 1.5) return vec3(0.0);
  return base * uSunColor * 0.14 * hi * (1.0 - uLamp);
}
`;

export function createFleetMaterials(mats: HarbourMaterials, u: WorldUniforms, fleet: FleetUniforms): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const kit = mats.kit();
  const baseHook = kit.onBeforeCompile.bind(kit);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  m.name = "hb_fleet";
  m.onBeforeCompile = (shader, renderer) => {
    baseHook(shader, renderer);
    Object.assign(shader.uniforms, fleet, { uSunDir: u.uSunDir, uSunColor: u.uSunColor, uTime: fleet.uFleetTime, uLamp: u.uLamp });
    shader.vertexShader = shader.vertexShader
      .replace("#include <batching_pars_vertex>", `#include <batching_pars_vertex>\nuniform float uTime;\n${VERT_PARS}`)
      .replace("#include <beginnormal_vertex>", "hbFleetPose(position, normal);\nvec3 objectNormal = hbFleetN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif")
      .replace("#include <begin_vertex>", "vec3 transformed = hbFleetP;")
      // the kit port derives vHbWorld from instanceMatrix only: add the batch matrix
      .replace("hbW = instanceMatrix * hbW;\n    #endif", "hbW = instanceMatrix * hbW;\n    #endif\n    #ifdef USE_BATCHING\n      hbW = batchingMatrix * hbW;\n    #endif");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}\n${HOVER_SHEEN}`)
      .replace("float hbRough;", "hbFleetColor(diffuseColor.rgb);\n  float hbRough;")
      // distance tint: the hovered / selected hull and the pennant keep their colour (world/aerial.ts)
      .replace("hbAerial(outgoingLight, vHbWorld, 0.0);", "hbAerial(outgoingLight, vHbWorld, max(smoothstep(0.05, 0.5, vFleetMisc.x), step(0.5, vFleetRig.z) * step(vFleetMisc.z, 0.5)));")
      .replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("gl_FrontFacing ? 1.0 : - 1.0", "(gl_FrontFacing != (vFleetMisc.y > 0.5)) ? 1.0 : - 1.0"))
      .replace("#include <opaque_fragment>", `
  {
    vec3 fN = inverseTransformDirection(normal, viewMatrix);
    vec3 fV = normalize(cameraPosition - vHbWorld);
    // wreck lanterns: warm oil light × uLamp (the hb_emissive contract), a slow uneven flicker
    if (vFleetMisc.z > 3.5) {
      float fl = 0.86 + 0.08 * sin(uTime * 5.3 + vHbWorld.x * 1.7) + 0.06 * sin(uTime * 11.9 + vHbWorld.z * 2.3);
      // (a selected wreck's lantern, 'cove' focus hi = 1, burns bright day or night: her memorial light)
      outgoingLight += vec3(1.0, 0.42, 0.095) * (uLamp * vFleetRig.x + smoothstep(0.7, 1.0, vFleetMisc.x) * (1.6 + 1.4 * uLamp)) * fl;
    }
    // sail cloth glows when the low sun is behind it
    if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) outgoingLight += diffuseColor.rgb * uSunColor * max(0.0, dot(-fN, uSunDir)) * 0.16 * (1.0 - vFleetRig.x);
    // hover / selection: soft warm rim + lift
    float hi = vFleetMisc.x;
    if (hi > 0.001) {
      float rim = pow(1.0 - clamp(abs(dot(fN, fV)), 0.0, 1.0), 3.0);
      float lum = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.02);
      // relative to the scene's own exposure, so it reads the same at noon and at night
      outgoingLight += (vec3(1.0, 0.84, 0.6) * rim * 0.4 * lum * 3.0 + outgoingLight * 0.10) * hi;
      outgoingLight += hbHoverSheen(diffuseColor.rgb, vFleetMisc.z, hi);
    }
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "hb_fleet_v7f";

  const depth = new THREE.MeshDepthMaterial();
  depth.name = "hb_fleet_depth";
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uFleetData: fleet.uFleetData, uTime: fleet.uFleetTime });
    shader.vertexShader = shader.vertexShader
      .replace("#include <batching_pars_vertex>", `#include <batching_pars_vertex>\n${DEPTH_VERT_PARS}`)
      .replace("#include <begin_vertex>", "vec3 transformed = hbFleetPoseP(position);");
  };
  depth.customProgramCacheKey = () => "hb_fleet_depth_v3";
  return { material: m, depth };
}

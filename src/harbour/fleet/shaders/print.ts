import { FLEET_FAR_FRAG } from "../fleet-far";
import { SAIL_LIGHT_GLSL } from "../sail-light-glsl";

/**
 * E04 coins as print (O5-I1/I2/I6, O1-I2; operator ruling V1, a promise amendment of v1.4.1's full-contrast emblems):
 * a coin's device is printed on her cloth, and its contrast follows its own size on screen. The roundel's diameter in
 * CSS px (its derivatives over the effective DPR) prints soft below PRINT_SOFT_PX and crisp from PRINT_FULL_PX; the
 * hovered, selected or searched hull steps forward with the full print (paper ground, full chroma). Decorative only:
 * no reading drives a print's contrast, and every coin keeps her device at every range.
 */
export const PRINT_SOFT_PX = 12, PRINT_FULL_PX = 30;
/** Earth pigment for logo ink: linear (max − min) / (max + min) is capped here, like the sails' dye (livery DYE_MAX_SAT). */
export const PRINT_INK_SAT = 0.65;
/** Highlight (1 hover, 0.5 selected / searched; eased) over which the full print returns. */
export const PRINT_HI: readonly [number, number] = [0.05, 0.25];

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** CPU twin of hbPrintK (tests): 0 = a soft patch of her colours in the cloth … 1 = the crisp print. */
// hbPrint (GLSL below): a logo's paper ground becomes unbleached canvas (warm, at most 0.72 albedo, a breath of the
// family cloth; paper again when highlighted) and its ink takes the earth-pigment chroma (full when highlighted). A
// monogram is lettering inked from the cloth's own value: cream on dark cloth, a deep shade of it on light (the two
// give the cloth equal contrast near 0.24 luminance). Far (k → 0) the ground melts into the cloth (+15 %) and the ink
// keeps its hue at half the value contrast (a grey shift, never a mix with the cloth): a soft patch of her colours.
// Seams, tabling, mottle and the far value law (hbFarCloth) run over the print, as over the cloth.
export function printContrast(discRenderPx: number, dpr: number, highlight = 0): number {
  return Math.max(smooth(PRINT_SOFT_PX, PRINT_FULL_PX, discRenderPx / Math.max(dpr, 0.25)), smooth(PRINT_HI[0], PRINT_HI[1], highlight));
}

const f1 = (x: number) => x.toFixed(2);

export const FRAG_PARS = /* glsl */ `
uniform sampler2D uEmblems;
uniform sampler2D uHeroEmblems;
uniform vec2 uHeroSlots;
uniform vec4 uEmblemGrid;
uniform vec2 uFleetScreen;     // CSS height px, effective DPR
uniform float uEmblemLetters;  // first monogram slot
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
varying float vFleetLamp;
varying vec4 vPaintA;
varying vec4 vPaintB;
varying vec3 vPaintC;
${SAIL_LIGHT_GLSL}
// E04 (O5-F1): the emblem slot / sentinel rides an interpolated varying that lands at 320 ± ε: rounded before any
// mod / floor, or a slot on atlas column 0 (a multiple of the grid width: USDe's 320) flips per pixel between its
// own tile and the clamped edge of the row above. Integers round to themselves, so -1 / -2 / -10 - n stay put.
float hbFleetSlot() { return floor(vFleetBrand.a + 0.5); }
float hbSeam(float c, float period, float w) {
  float f = abs(fract(c / period + 0.5) - 0.5) * period;
  float aa = fwidth(c) * 0.75 + 1e-5;
  return 1.0 - smoothstep(w - aa, w + aa, f);
}
${FLEET_FAR_FRAG}
float hbPrintHi() { return smoothstep(${f1(PRINT_HI[0])}, ${f1(PRINT_HI[1])}, vFleetMisc.x); }
// E04 print law: 0.98 / era = the roundel's diameter in render px
float hbPrintK(float era) {
  return max(smoothstep(${f1(PRINT_SOFT_PX)}, ${f1(PRINT_FULL_PX)}, 0.98 / (era * max(uFleetScreen.y, 0.25))), hbPrintHi());
}
// atlas texel t (premultiplied), coverage a, printed on cloth c (fam: undyed family cloth); see print.ts
vec3 hbPrint(vec3 c, vec3 fam, vec4 t, float a, float k, bool letters) {
  if (a <= 0.0) return c;
  float hi = hbPrintHi(), paper = 0.0;
  vec3 ink = t.rgb / max(t.a, 1e-4), ground = c, soft = c * 1.15;
  if (letters) {
    ink = mix(c * 0.12, vec3(0.86, 0.8, 0.66), 1.0 - smoothstep(0.22, 0.26, dot(c, vec3(0.2126, 0.7152, 0.0722))));
  } else {
    float lo = min(ink.r, min(ink.g, ink.b)), mx = max(ink.r, max(ink.g, ink.b));
    paper = smoothstep(0.72, 0.88, lo) * (1.0 - smoothstep(0.06, 0.16, mx - lo));
    float sat = (mx - lo) / max(mx + lo, 1e-3);
    ink = max(mix(vec3(dot(ink, vec3(0.2126, 0.7152, 0.0722))), ink, mix(min(1.0, ${f1(PRINT_INK_SAT)} / max(sat, 1e-3)), 1.0, hi)), vec3(0.0));
    vec3 canvas = mix(vec3(0.70, 0.65, 0.54), fam * min(1.0, 0.72 / max(max(fam.r, max(fam.g, fam.b)), 1e-3)), 0.15);
    ground = mix(canvas, vec3(0.92), hi);
  }
  // far: half the value contrast, the ink's hue kept
  vec3 inkSoft = max(ink + 0.5 * (dot(soft, vec3(0.2126, 0.7152, 0.0722)) - dot(ink, vec3(0.2126, 0.7152, 0.0722))), vec3(0.0));
  return mix(c, mix(mix(inkSoft, ink, k), mix(soft, ground, k), paper), a);
}
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
    float board = -hbFleetSlot() - 10.0;
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
    vec3 fam = c;
    c *= mix(dyed, vec3(0.8, 0.76, 0.66), band * 0.65);
    // the coin's roundel printed on each side of the furled cover (hull-kit bakes it in the side plane, u along +x; on
    // a brailed bundle on its forward and aft faces, u along the yard, which faces +z aft): read the right way round
    // from either side (the side is the posed normal's z), faded off the crest and while the sail is still coming down
    float side = vFleetRig.w;
    // (a brailed bundle, node 1, faces fore and aft of a yard braced 30°: its faces are only ~0.5 along z, so a lower
    // threshold; a boom cover's flat side is ~1 and its crest ~0)
    bool bundle = abs(vFleetRig.y - 1.0) < 0.5;
    float show = smoothstep(0.55, 0.9, vFleetRig.x) * (bundle ? smoothstep(0.08, 0.3, abs(side)) : smoothstep(0.25, 0.55, abs(side)));
    float slot = hbFleetSlot();
    if (slot >= 0.0 && show > 0.0 && e.x >= 0.0 && e.x <= 1.0 && e.y >= 0.0 && e.y <= 1.0) {
      float sx = side < 0.0 ? -1.0 : 1.0;
      vec2 q = vec2(side < 0.0 ? 1.0 - e.x : e.x, e.y);
      vec2 cell = vec2(mod(slot, uEmblemGrid.x), floor(slot / uEmblemGrid.x));
      vec2 uv = vec2((cell.x + q.x) * uEmblemGrid.z, 1.0 - (cell.y + q.y) * uEmblemGrid.w);
      vec2 gx = vec2(ex.x * sx * uEmblemGrid.z, -ex.y * uEmblemGrid.w);
      vec2 gy = vec2(ey.x * sx * uEmblemGrid.z, -ey.y * uEmblemGrid.w);
      vec4 t;
      if (slot == uHeroSlots.x || slot == uHeroSlots.y) {
        float tile = slot == uHeroSlots.x ? 0.0 : 1.0;
        t = textureGrad(uHeroEmblems, vec2((tile + q.x) * 0.5, 1.0 - q.y), vec2(ex.x * sx * 0.5, -ex.y), vec2(ey.x * sx * 0.5, -ey.y));
      } else t = textureGrad(uEmblems, uv, gx, gy);  // premultiplied
      c = hbPrint(c, fam, t, t.a * show, hbPrintK(era), slot >= uEmblemLetters);
    }
    c *= 1.0 - ties * 0.22;                                // lacing over the print
  } else if (kind > 0.5) {
    vec4 dye = vSailDye;
    vec3 fam = c;
    // uneven dye take-up: canvas, not plastic
    float mott = sin(su.x * 13.0 + sin(su.y * 9.0) * 1.6) * sin(su.y * 21.0 - su.x * 4.0);
    if (dye.w > 0.5) {
      // Brand-dyed canvas by sail-plan role (aMeta.z): the body dyed · headsails a light tint with a brand band at
      // foot and leech · upper sails lighter · a titan's head band a deeper shade. A near-white brand (mode 2)
      // keeps the canvas and bands it. The family cloth (cream, tanbark …) shows through a little. Square sails
      // (node 1: hung from _heel / the yards, both side edges alike) take the band along the foot only, a little deeper.
      float role = vFleetMisc.w;
      vec3 cloth = fam, pig = hbDyeChroma(dye.rgb), body = mix(pig, cloth, 0.1);
      bool squareSail = abs(vFleetRig.y - 1.0) < 0.5;
      float foot = 1.0 - smoothstep((squareSail ? 0.1 : 0.07) - sw.y, (squareSail ? 0.1 : 0.07) + sw.y, su.y);
      float edge = squareSail ? foot : max(smoothstep(0.93 - sw.x, 0.93 + sw.x, su.x), foot);
      vec3 base;
      if (dye.w > 1.5) base = role > 2.5 ? pig : mix(cloth, pig, edge);
      else if (role > 2.5) base = pig * 0.5;
      else if (role > 1.5) base = mix(cloth, body, 0.65);
      else if (role > 0.5) base = mix(mix(cloth, body, 0.32), pig, edge);
      else base = body;
      // uneven dye take-up and a sun-faded head
      base *= 0.97 + 0.05 * mott;
      c = mix(base, base * 1.1 + 0.015, smoothstep(0.5, 1.0, su.y) * 0.5);
    }
    hbSailOpaque = (seams * 0.45 + tabling * 0.55) * fine;  // 06-F12: they stand dark in the backlit glow
    // furled canvas (rolled jib, square sails on their yards): weathered cloth, not a white bar
    c = mix(c, c * vec3(0.66, 0.62, 0.55), smoothstep(0.35, 0.95, vFleetRig.x));
    float slot = hbFleetSlot();
    bool letters = slot >= uEmblemLetters;
    float k = hbPrintK(era);
    // the roundel rides the furl morph and fades as the sail comes down (docked: the cover and house flag carry it)
    float show = (1.0 - smoothstep(0.2, 0.6, vFleetRig.x)) * clampR;
    if (slot >= 0.0 && !letters && show > 0.0 && er < 0.56) {
      // a thin brand ring round the roundel: a deeper shade on a dyed sail, so it frames it
      vec3 ringCol = dye.w > 1.5 ? dye.rgb : dye.w > 0.5 ? dye.rgb * 0.42 : vFleetBrand.rgb;
      float ring = smoothstep(0.482 - era, 0.482 + era, er) * (1.0 - smoothstep(0.535 - era, 0.535 + era, er));
      c = mix(c, ringCol, ring * show * mix(0.4, 1.0, k));
      hbSailOpaque = max(hbSailOpaque, ring * show * 0.5);
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
      vec4 t;
      if (slot == uHeroSlots.x || slot == uHeroSlots.y) {
        float tile = slot == uHeroSlots.x ? 0.0 : 1.0;
        t = textureGrad(uHeroEmblems, vec2((tile + inset.x) * 0.5, 1.0 - inset.y), vec2(ex.x * sx * 0.97 * 0.5, -ex.y * 0.97), vec2(ey.x * sx * 0.97 * 0.5, -ey.y * 0.97));
      } else t = textureGrad(uEmblems, uv, gx, gy); // premultiplied
      float a = t.a * show;
      c = hbPrint(c, fam, t, a, k, letters);
      c *= mix(1.0, 0.97 + 0.05 * mott, a);
      hbSailOpaque = max(hbSailOpaque, a * 0.7);
    }
    c *= 1.0 - (seams * 0.07 + tabling * 0.09) * fine;    // cloths + tabling, over the print
    hbFarCloth(c);                                         // far: the whole sail, print and all
  } else if (vFleetRig.z > 0.5) {
    c = dyed * 1.15;                                       // house pennant in the brand colour (no national ensign)
  } else {
    hbFleetPaint(c);
    c = mix(c, vFleetBrand.rgb, vFleetMisc.w);           // boot-top
    // E04: a mooring buoy (slot -3) weathered: red paint to the ochre of texel 1, white band to earthen limewash
    if (abs(hbFleetSlot() + 3.0) < 0.5) {
      c = mix(c, vFleetBrand.rgb, smoothstep(0.6, 0.85, (c.r - max(c.g, c.b)) / max(c.r, 1e-3)));
      c = mix(c, vec3(0.36, 0.3, 0.22), smoothstep(0.45, 0.75, min(c.r, min(c.g, c.b))));
    }
  }
}
`;

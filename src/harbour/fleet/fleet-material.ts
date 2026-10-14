import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * The fleet material: the shared harbour kit material (patterns, world breakup, env spec, light
 * pools, height-field AO — so boats sit in the island's light) extended for one BatchedMesh draw of
 * every hull. Per-instance state lives in `uFleetData` (2 RGBA32F texels per batch instance):
 *   texel 0 = (furl 0..1, signed boom swing rad (>0 = port tack, mirrored rig), highlight 0..1,
 *              pennant: sign = flies (>0) or struck (<0); |w| = 1 + far (0..1: spars recede far away), + 2 when
 *              the CPU struck the rig (see STRUCK))
 *   texel 1 = (brand r, g, b linear, emblem slot or -1)
 * and the static livery in `uFleetPaint` (4 RGBA32F texels per instance, written once at install, decorative):
 *   texel 0 = (topside rgb, name board 0|1) · 1 = (stripe / trim rgb, painted 0|1) · 2 = (deck rgb, -) ·
 *   3 = (coachroof rgb, painted 0|1). The kit's aPaint region picks which one a corner wears.
 * The vertex shader poses the rig (furl morph, mirror, boom/boom_2 about the gooseneck, jib about its
 * stay); the fragment tints _BRAND corners and covers, prints the emblem from the atlas onto sail_main
 * (manifest flip rule) and adds cloth seams, sail translucency and the hover rim.
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
varying vec4 vFleetMisc;    // highlight, flip (mirrored node now), kind, brand mask
varying vec4 vFleetUV;      // sail uv, emblem uv
varying vec3 vFleetRig;     // furl, node, flag
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
  int j = idx * 4 + k;
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
  vFleetMisc = vec4(a.z, flip, aMeta.x, aMeta.z);
  vFleetUV = vec4(aSailUV, aEmbUV);
  vFleetRig = vec3(furl, node, aMeta.w);
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
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec4 vFleetBrand;
varying vec4 vFleetMisc;
varying vec4 vFleetUV;
varying vec3 vFleetRig;
varying vec4 vPaintA;
varying vec4 vPaintB;
varying vec3 vPaintC;
float hbSeam(float c, float period, float w) {
  float f = abs(fract(c / period + 0.5) - 0.5) * period;
  float aa = fwidth(c) * 0.75 + 1e-5;
  return 1.0 - smoothstep(w - aa, w + aa, f);
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
    return;
  }
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
  // hulks: salt-bleached, tar-stained timber, never a clean grey
  if (vFleetBrand.a < -1.5) c *= vec3(0.66, 0.58, 0.49);
  vec3 brand = vFleetBrand.rgb;
  float bl = dot(brand, vec3(0.2126, 0.7152, 0.0722));
  vec3 dyed = mix(vec3(bl), brand, 0.7) * 0.74;          // dyed canvas: muted, a shade darker, never plastic
  if (kind > 1.5) {
    // brand sail cover: flaked low on the boom, a pale lacing band along its top, lacing ties
    float band = 1.0 - smoothstep(0.035, 0.08, abs(su.y - 0.9));
    float ties = (1.0 - smoothstep(0.025, 0.05, abs(fract(su.x * 7.0) - 0.5))) * smoothstep(0.3, 0.6, su.y);
    c *= mix(dyed, vec3(0.8, 0.76, 0.66), band * 0.65) * (1.0 - ties * 0.22);
  } else if (kind > 0.5) {
    c *= 1.0 - (seams * 0.07 + tabling * 0.09) * fine;    // cloths + tabling
    // furled canvas (rolled jib, square sails on their yards): weathered cloth, not a white bar
    c = mix(c, c * vec3(0.66, 0.62, 0.55), smoothstep(0.35, 0.95, vFleetRig.x));
    float slot = vFleetBrand.a;
    if (slot >= 0.0 && e.x >= 0.0 && e.x <= 1.0 && e.y >= 0.0 && e.y <= 1.0) {
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
      vec4 t = textureGrad(uEmblems, uv, gx, gy);        // premultiplied
      c = c * (1.0 - t.a) + t.rgb * 0.92;                  // printed on cloth: a touch under paper-white
    }
  } else if (vFleetRig.z > 0.5) {
    c = dyed * 1.15;                                       // house pennant in the brand colour (no national ensign)
  } else {
    hbFleetPaint(c);
    c = mix(c, vFleetBrand.rgb, vFleetMisc.w);           // boot-top
  }
}
`;

export function createFleetMaterials(mats: HarbourMaterials, u: WorldUniforms, fleet: FleetUniforms): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const kit = mats.kit();
  const baseHook = kit.onBeforeCompile.bind(kit);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  m.name = "hb_fleet";
  m.onBeforeCompile = (shader, renderer) => {
    baseHook(shader, renderer);
    Object.assign(shader.uniforms, fleet, { uSunDir: u.uSunDir, uSunColor: u.uSunColor, uTime: fleet.uFleetTime });
    shader.vertexShader = shader.vertexShader
      .replace("#include <batching_pars_vertex>", `#include <batching_pars_vertex>\nuniform float uTime;\n${VERT_PARS}`)
      .replace("#include <beginnormal_vertex>", "hbFleetPose(position, normal);\nvec3 objectNormal = hbFleetN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif")
      .replace("#include <begin_vertex>", "vec3 transformed = hbFleetP;")
      // the kit port derives vHbWorld from instanceMatrix only: add the batch matrix
      .replace("hbW = instanceMatrix * hbW;\n    #endif", "hbW = instanceMatrix * hbW;\n    #endif\n    #ifdef USE_BATCHING\n      hbW = batchingMatrix * hbW;\n    #endif");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("float hbRough;", "hbFleetColor(diffuseColor.rgb);\n  float hbRough;")
      .replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("gl_FrontFacing ? 1.0 : - 1.0", "(gl_FrontFacing != (vFleetMisc.y > 0.5)) ? 1.0 : - 1.0"))
      .replace("#include <opaque_fragment>", `
  {
    vec3 fN = inverseTransformDirection(normal, viewMatrix);
    vec3 fV = normalize(cameraPosition - vHbWorld);
    // sail cloth glows when the low sun is behind it
    if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) outgoingLight += diffuseColor.rgb * uSunColor * max(0.0, dot(-fN, uSunDir)) * 0.16 * (1.0 - vFleetRig.x);
    // hover / selection: soft warm rim + lift
    float hi = vFleetMisc.x;
    if (hi > 0.001) {
      float rim = pow(1.0 - clamp(abs(dot(fN, fV)), 0.0, 1.0), 3.0);
      float lum = max(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)), 0.02);
      // relative to the scene's own exposure, so it reads the same at noon and at night
      outgoingLight += (vec3(1.0, 0.84, 0.6) * rim * 0.8 * lum * 3.0 + outgoingLight * 0.10) * hi;
    }
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => "hb_fleet_v3";

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

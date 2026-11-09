import { FLEET_MOTION_GLSL } from "../fleet-motion-glsl";

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

/** uFleetData texels per batch instance (F-fleet3: texel 2 = motion, see FleetUniforms). */
export const FLEET_DATA_TEXELS = 3;
/**
 * E27 (O2-I4, O7-I9): rig as hairlines. A spar or stay narrower than RIG_FLOOR_PX CSS px is drawn at that width
 * (pushed out along its radial normal: hull-kit bakes the tube's radius into aPaint.y and radial normals on rig
 * corners) and fades by true / drawn width, so the energy is kept: a widened stay reads faint, not heavy, and is a
 * continuous thread at DPR 1 instead of dashes crawling as the hull bobs. Colour pass only: the shadow twin keeps
 * the true rig (DEPTH_VERT_PARS), and a struck rig stays struck.
 */
export const RIG_FLOOR_PX = 0.8;
/**
 * CPU twin of hbRigFloor's coverage (tests): true / drawn width for a tube of `radiusM` at `cssPxPerM`. The shader
 * takes the view depth from the view matrix's z row (two mat-vec products, never a mat4 × mat4) and wants half of
 * RIG_FLOOR_PX in object metres: CSS px per metre = 0.5 × P11 × CSS height / depth, times the hull's scale.
 */
export function rigCoverage(radiusM: number, cssPxPerM: number): number {
  const want = (0.5 * RIG_FLOOR_PX) / cssPxPerM;
  return radiusM / Math.max(radiusM, want);
}

export const VERT_PARS = /* glsl */ `
#define FLEET_TEXELS ${FLEET_DATA_TEXELS}
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
uniform vec2 uFleetScreen;
varying vec4 vPaintA;       // livery rgb, mode (0 keep · 1 paint · 2 topsides · 3 deck (keeps the grain) · 4 LOD topsides · 5 spar)
varying vec4 vPaintB;       // trim rgb, topside height t
varying vec3 vPaintC;       // x / half loa, name board, far (0 near … 1 a few px: spars recede, margins widen)
varying vec4 vFleetBrand;   // rgb, slot
varying vec4 vFleetMisc;    // highlight, flip (mirrored node now), kind, brand mask | sail role
varying vec4 vFleetUV;      // sail uv, emblem uv
varying vec4 vFleetRig;     // furl, node, flag, side (posed object-space normal z: covers print their roundel on ±z)
varying vec4 vSailDye;      // sails: dye rgb, mode (uFleetPaint texel 4)
varying float vFleetLamp;   // 06-F6: the stern lantern lit 0|1 (texel 2.z); E27: rig, -coverage
vec4 hbFleetTexel(int idx, int k) {
  int size = textureSize(uFleetData, 0).x;
  int j = idx * FLEET_TEXELS + k;
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
float hbRigR;               // E27: live rig's tube radius (m), else 0
${STRUCK}
${FLEET_MOTION_GLSL}
void hbFleetPose(vec3 p, vec3 n) {
  #ifdef USE_BATCHING
    int idx = int(getIndirectIndex(gl_DrawID));
  #else
    int idx = 0;
  #endif
  vec4 a = hbFleetTexel(idx, 0);
  vec4 b = hbFleetTexel(idx, 1);
  vec4 mo = hbFleetTexel(idx, 2);
  float phase = hbPaintTexel(idx, 2).w;
  float furl = a.x, swing = a.y;
  float node = aMeta.y;
  float mf = hbOarFurl(node, furl, mo);
  p += aFurl * mf;
  vec3 nn = n + aFurlN * mf;
  n = dot(nn, nn) > 1e-6 ? normalize(nn) : vec3(0.0, 1.0, 0.0);
  p = hbSailBreath(p, mo, furl, node, phase);
  p = hbOarStroke(p, n, mo, node, phase);
  float flip = (node > 0.5 && node < 4.5 && swing > 0.0) ? 1.0 : 0.0;
  if (flip > 0.5) { p.z = -p.z; n.z = -n.z; }
  if (node > 1.5 && node < 4.5) {
    float ang = node < 3.5 ? swing : 0.6 * swing;
    // a little life in the set sail: the boom works with the swell
    ang += sin(uTime * 0.9 + phase * 1.7) * 0.025 * (1.0 - furl);
    mat3 R = hbRotAxis(aAxis, ang);
    p = aPivot + R * (p - aPivot);
    n = R * n;
  }
  if (aMeta.w > 0.5) {
    // ensign flutter: a travelling wave that grows away from the hoist (+x/-x unknown: use |local x| from the flag's mean)
    float ph = uTime * (6.0 + 3.0 * uWind) + phase * 2.3;
    p.z += sin(ph + p.x * 3.0 + p.y) * (0.05 + 0.08 * uWind) * (1.0 - furl * 0.5);
  }
  hbRigR = aPaint.x > 7.5 && aPaint.x < 10.5 ? aPaint.y : 0.0;
  if (aMeta.w > 0.5 && a.w < 0.5) p = vec3(0.0); // pennant struck (small hulls seen from afar)
  if (hbFleetStruck(a.w)) { p = vec3(0.0); hbRigR = 0.0; }
  hbFleetLivery(idx, hbFleetFar(a.w).x);
  hbFleetP = p; hbFleetN = n;
  vFleetBrand = b;
  vSailDye = aMeta.x > 0.5 && aMeta.x < 1.5 ? hbPaintTexel(idx, 4) : vec4(0.0);
  vFleetMisc = vec4(a.z, flip, aMeta.x, aMeta.z);
  vFleetUV = vec4(aSailUV, aEmbUV);
  // E04 (O5-F8): a LOD sail furls through its own morph: furled, no print
  vFleetRig = vec4(furl, node, aMeta.w, n.z);
  vFleetLamp = mo.z;
}
// E27: rig to RIG_FLOOR_PX CSS px along its radial normal; returns true / drawn width
float hbRigFloor(inout vec3 p, vec3 n, mat4 bm) {
  if (hbRigR <= 0.0) return 1.0;
  vec4 wp = bm * vec4(p, 1.0);
  float depth = max(-dot(vec4(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2], modelViewMatrix[3][2]), wp), 1e-3);
  float want = ${(RIG_FLOOR_PX * 0.5).toFixed(2)} * depth / max(0.5 * projectionMatrix[1][1] * uFleetScreen.x * length(bm[0].xyz), 1e-6);
  p += n * max(0.0, want - hbRigR);
  return hbRigR / max(hbRigR, want);
}
`;

export const DEPTH_VERT_PARS = /* glsl */ `
#define FLEET_TEXELS ${FLEET_DATA_TEXELS}
attribute vec4 aMeta;
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec3 aFurl;
attribute vec2 aPaint;
attribute vec2 aSailUV;
uniform highp sampler2D uFleetData;
uniform highp sampler2D uFleetPaint;
uniform float uTime;
vec4 hbFleetTexel(int idx, int k) {
  int size = textureSize(uFleetData, 0).x;
  int j = idx * FLEET_TEXELS + k;
  return texelFetch(uFleetData, ivec2(j % size, j / size), 0);
}
float hbFleetPhase(int idx) {
  int size = textureSize(uFleetPaint, 0).x;
  int j = idx * 5 + 2;
  return texelFetch(uFleetPaint, ivec2(j % size, j / size), 0).w;
}
mat3 hbRotAxis(vec3 a, float ang) {
  float c = cos(ang), s = sin(ang), t = 1.0 - c;
  return mat3(t * a.x * a.x + c, t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
              t * a.x * a.y - s * a.z, t * a.y * a.y + c, t * a.y * a.z + s * a.x,
              t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c);
}
${STRUCK}
${FLEET_MOTION_GLSL}
vec3 hbFleetPoseP(vec3 p) {
  int idx = int(getIndirectIndex(gl_DrawID));
  vec4 a = hbFleetTexel(idx, 0);
  vec4 mo = hbFleetTexel(idx, 2);
  float phase = hbFleetPhase(idx);
  float furl = a.x, swing = a.y;
  float node = aMeta.y;
  p += aFurl * hbOarFurl(node, furl, mo);
  vec3 n0 = vec3(0.0, 1.0, 0.0);
  p = hbSailBreath(p, mo, furl, node, phase);
  p = hbOarStroke(p, n0, mo, node, phase);
  if (aMeta.w > 0.5 && a.w < 0.5) p = vec3(0.0);
  if (hbFleetStruck(a.w)) p = vec3(0.0);
  if (node > 0.5 && node < 4.5 && swing > 0.0) p.z = -p.z;
  if (node > 1.5 && node < 4.5) {
    float ang = (node < 3.5 ? swing : 0.6 * swing) + sin(uTime * 0.9 + phase * 1.7) * 0.025 * (1.0 - furl);
    p = aPivot + hbRotAxis(aAxis, ang) * (p - aPivot);
  }
  return p;
}
`;

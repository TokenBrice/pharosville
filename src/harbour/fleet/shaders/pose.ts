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
varying vec4 vPaintA;       // livery rgb, mode (0 keep · 1 paint · 2 topsides · 3 deck (keeps the grain) · 4 LOD topsides · 5 spar)
varying vec4 vPaintB;       // trim rgb, topside height t
varying vec3 vPaintC;       // x / half loa, name board, far (0 near … 1 a few px: spars recede, margins widen)
varying vec4 vFleetBrand;   // rgb, slot
varying vec4 vFleetMisc;    // highlight, flip (mirrored node now), kind, brand mask | sail role
varying vec4 vFleetUV;      // sail uv, emblem uv
varying vec4 vFleetRig;     // furl, node, flag, side (posed object-space normal z: covers print their roundel on ±z)
varying vec4 vSailDye;      // sails: dye rgb, mode (uFleetPaint texel 4)
varying float vFleetLamp;   // 06-F6: the stern lantern lit 0|1 (texel 2.z)
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
  if (aMeta.w > 0.5 && a.w < 0.5) p = vec3(0.0); // pennant struck (small hulls seen from afar)
  if (hbFleetStruck(a.w)) p = vec3(0.0);
  hbFleetLivery(idx, hbFleetFar(a.w).x);
  hbFleetP = p; hbFleetN = n;
  vFleetBrand = b;
  vSailDye = aMeta.x > 0.5 && aMeta.x < 1.5 ? hbPaintTexel(idx, 4) : vec4(0.0);
  vFleetMisc = vec4(a.z, flip, aMeta.x, aMeta.z);
  vFleetUV = vec4(aSailUV, aEmbUV);
  // a LOD sail (aPaint.x 0: no breathing size) has no furl shape: it stands set, so it shows as set (cloth, roundel)
  bool lodSail = aMeta.x > 0.5 && aMeta.x < 1.5 && aPaint.x > -1e-3;
  vFleetRig = vec4(lodSail ? 0.0 : furl, node, aMeta.w, n.z);
  vFleetLamp = mo.z;
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

import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * The fleet material: the shared harbour kit material (patterns, world breakup, env spec, light
 * pools, height-field AO — so boats sit in the island's light) extended for one BatchedMesh draw of
 * every hull. Per-instance state lives in `uFleetData` (2 RGBA32F texels per batch instance):
 *   texel 0 = (furl 0..1, signed boom swing rad (>0 = port tack, mirrored rig), highlight 0..1, lod 0|1)
 *   texel 1 = (brand r, g, b linear, emblem slot or -1)
 * The vertex shader poses the rig (furl morph, mirror, boom/boom_2 about the gooseneck, jib about its
 * stay); the fragment tints _BRAND corners and covers, prints the emblem from the atlas onto sail_main
 * (manifest flip rule) and adds cloth seams, sail translucency and the hover rim.
 */
export interface FleetUniforms {
  uFleetData: THREE.IUniform<THREE.DataTexture>;
  uEmblems: THREE.IUniform<THREE.Texture>;
  /** (cols, rows, 1/cols, 1/rows) */
  uEmblemGrid: THREE.IUniform<THREE.Vector4>;
  uWind: THREE.IUniform<number>;
}

const VERT_PARS = /* glsl */ `
attribute vec4 aMeta;
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec3 aFurl;
attribute vec3 aFurlN;
attribute vec2 aSailUV;
attribute vec2 aEmbUV;
uniform highp sampler2D uFleetData;
uniform float uWind;
varying vec4 vFleetBrand;   // rgb, slot
varying vec4 vFleetMisc;    // highlight, flip (mirrored node now), kind, brand mask
varying vec4 vFleetUV;      // sail uv, emblem uv
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
vec3 hbFleetP; vec3 hbFleetN;
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
  hbFleetP = p; hbFleetN = n;
  vFleetBrand = b;
  vFleetMisc = vec4(a.z, flip, aMeta.x, aMeta.z);
  vFleetUV = vec4(aSailUV, aEmbUV);
}
`;

const DEPTH_VERT_PARS = /* glsl */ `
attribute vec4 aMeta;
attribute vec3 aPivot;
attribute vec3 aAxis;
attribute vec3 aFurl;
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
vec3 hbFleetPoseP(vec3 p) {
  int idx = int(getIndirectIndex(gl_DrawID));
  vec4 a = hbFleetTexel(idx, 0);
  float furl = a.x, swing = a.y;
  p += aFurl * furl;
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
float hbSeam(float c, float period, float w) {
  float f = abs(fract(c / period + 0.5) - 0.5) * period;
  float aa = fwidth(c) * 0.75 + 1e-5;
  return 1.0 - smoothstep(w - aa, w + aa, f);
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
  if (kind > 1.5) {
    c *= vFleetBrand.rgb;                                 // brand sail cover
  } else if (kind > 0.5) {
    c *= 1.0 - (seams * 0.07 + tabling * 0.09) * fine;    // cloths + tabling
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
  } else {
    c = mix(c, vFleetBrand.rgb, vFleetMisc.w);           // boot-top, pennants
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
    Object.assign(shader.uniforms, fleet, { uSunDir: u.uSunDir, uSunColor: u.uSunColor, uTime: u.uTime });
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
    if (vFleetMisc.z > 0.5 && vFleetMisc.z < 1.5) outgoingLight += diffuseColor.rgb * uSunColor * max(0.0, dot(-fN, uSunDir)) * 0.16;
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
  m.customProgramCacheKey = () => "hb_fleet_v1";

  const depth = new THREE.MeshDepthMaterial();
  depth.name = "hb_fleet_depth";
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uFleetData: fleet.uFleetData, uTime: u.uTime });
    shader.vertexShader = shader.vertexShader
      .replace("#include <batching_pars_vertex>", `#include <batching_pars_vertex>\n${DEPTH_VERT_PARS}`)
      .replace("#include <begin_vertex>", "vec3 transformed = hbFleetPoseP(position);");
  };
  depth.customProgramCacheKey = () => "hb_fleet_depth_v1";
  return { material: m, depth };
}

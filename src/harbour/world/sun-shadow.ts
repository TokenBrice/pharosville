import * as THREE from "three";
import { FullscreenPass } from "../ocean/gpu-bake";

/**
 * 02-L1: the key light's shadow map, shared with materials that are not three-lit (the sea's ShaderMaterial).
 * SunRig (world/sun.ts) fills these every frame; consumers read `hbSunShadow(worldPos)` (1 = sunlit). Module-level
 * uniforms, like the cloud shadows (one engine per page). Decorative: time of day only.
 *
 * PERF: the sea does not tap the depth map itself. Read from the sea plane, a 2048-4096² depth map is heavily
 * minified across the mid and far water and every tap misses the texture cache (≈ 5 ms of a laptop iGPU frame for
 * ONE tap). Instead SeaShadowMask resolves the map's verdict for the y = 0 plane into a small mipmapped R8 texture
 * (half the map's resolution, in shadow-uv space) each time the map is re-rendered, and the sea reads that with one
 * filtered tap. The mask carries the matrix it was resolved with, so it stays world-anchored (at most one frame old).
 */
/** bound until the first shadow render: a compare-mode depth texture, so the shadow sampler always matches */
export const NO_SHADOW = new THREE.DepthTexture(1, 1);
NO_SHADOW.compareFunction = THREE.LessEqualCompare;
NO_SHADOW.needsUpdate = true;   // (a never-uploaded texture binds as an empty colour texture: a sampler mismatch)

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

export const sunShadowUniforms = {
  /** the sea plane's sun verdict (SeaShadowMask: 1 lit … 0 shadowed), in shadow uv; WHITE until the first resolve */
  uSeaShadow: { value: WHITE } as THREE.IUniform<THREE.Texture>,
  /** world → shadow uv/depth, as of the mask's resolve */
  uKeyShadowMat: { value: new THREE.Matrix4() } as THREE.IUniform<THREE.Matrix4>,
  /** x enabled 0|1, y PCF radius in uv, z taps (1 | 4), w strength (shadow.intensity) */
  uKeyShadowP: { value: new THREE.Vector4(0, 0, 1, 1) } as THREE.IUniform<THREE.Vector4>,
};

export const SUN_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uSeaShadow;
uniform mat4 uKeyShadowMat;
uniform vec4 uKeyShadowP;
// the sun's (or moon's) shadow at a point of the sea plane: 1 lit … 0 shadowed. Feathered out toward the edge of the
// fitted shadow box (beyond it the map holds nothing, so the open sea stays lit rather than ending on a hard line).
float hbSunShadow(vec3 wp) {
  if (uKeyShadowP.x < 0.5) return 1.0;
  vec3 c = (uKeyShadowMat * vec4(wp, 1.0)).xyz;   // orthographic: w = 1
  vec2 m = min(c.xy, 1.0 - c.xy);
  float fade = smoothstep(0.0, 0.06, min(m.x, m.y));
  if (fade <= 0.0 || c.z >= 1.0) return 1.0;
  return mix(1.0, texture2D(uSeaShadow, c.xy).r, fade * uKeyShadowP.w);
}
`;

const MASK_FRAG = /* glsl */ `
uniform highp sampler2DShadow uKeyShadow;
uniform vec3 uPlane;   // shadow depth of the y = 0 plane = dot(vec3(uv, 1), uPlane)
uniform vec4 uKeyShadowP;
varying vec2 vUv;
void main() {
  float z = dot(vec3(vUv, 1.0), uPlane);
  if (z >= 1.0) { gl_FragColor = vec4(1.0); return; }
  z -= 0.0006;
  float s;
  if (uKeyShadowP.z > 2.5) {
    // 4 taps (each a hardware 2x2 compare) on a fixed diagonal cross: the soft penumbra of the old per-pixel rotated
    // kernel, without its screen-space grain (the mask's own filtering does the rest)
    vec2 d = vec2(0.7071, 0.7071) * uKeyShadowP.y, e = vec2(-d.y, d.x) * 0.5;
    s = 0.25 * (texture(uKeyShadow, vec3(vUv + d, z)) + texture(uKeyShadow, vec3(vUv - d, z))
      + texture(uKeyShadow, vec3(vUv + e, z)) + texture(uKeyShadow, vec3(vUv - e, z)));
  } else {
    s = texture(uKeyShadow, vec3(vUv, z));
  }
  gl_FragColor = vec4(s, s, s, 1.0);
}
`;

/** Resolves the key light's depth map for the sea plane into sunShadowUniforms.uSeaShadow (see the note above). */
export class SeaShadowMask {
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly plane = new THREE.Vector3();
  private readonly pass = new FullscreenPass(MASK_FRAG, {
    uKeyShadow: { value: NO_SHADOW }, uPlane: { value: this.plane }, uKeyShadowP: sunShadowUniforms.uKeyShadowP,
  });

  /** After the map was (re-)rendered with `matrix` (three's light.shadow.matrix): resolve the mask. */
  resolve(renderer: THREE.WebGLRenderer, map: THREE.Texture, mapSize: number, matrix: THREE.Matrix4): void {
    const size = Math.max(256, Math.min(2048, mapSize / 2));
    if (!this.rt || this.rt.width !== size) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(size, size, {
        type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false, generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      });
    }
    // world (x, 0, z) → (u, v, depth) is affine; invert its xz block to write depth as a function of (u, v)
    const e = matrix.elements;   // column-major: row r, column c = e[c * 4 + r]
    const a = e[0], b = e[8], c = e[1], d = e[9];
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12) return;
    // x = ( d (u - e12) - b (v - e13)) / det ; z = (-c (u - e12) + a (v - e13)) / det ; depth = e2 x + e10 z + e14
    const ka = (e[2] * d - e[10] * c) / det, kb = (-e[2] * b + e[10] * a) / det;
    this.plane.set(ka, kb, e[14] - ka * e[12] - kb * e[13]);
    this.pass.material.uniforms.uKeyShadow.value = map;
    this.pass.render(renderer, this.rt);
    sunShadowUniforms.uSeaShadow.value = this.rt.texture;
    sunShadowUniforms.uKeyShadowMat.value.copy(matrix);
  }

  dispose(): void {
    this.rt?.dispose();
    this.pass.dispose();
    sunShadowUniforms.uSeaShadow.value = WHITE;
  }
}

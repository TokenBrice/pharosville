import * as THREE from "three";

/**
 * Drifting cloud shadows: one cheap projected-noise field shared by the sea and every lit kit material.
 * The sky system drives it (wind drift, cover, sun projection, fades it out at night); materials only
 * read `hbCloudShadow(worldXZ)` (1 = sunlit, lower = under a cloud). Module-level uniforms so the island
 * materials can bind them without a context (one engine per page).
 */
export const cloudShadowUniforms = {
  /** xy pattern offset (m), z 1 / feature scale (1/m), w strength 0..1 */
  uCloudShadow: { value: new THREE.Vector4(0, 0, 1 / 1100, 0) } as THREE.IUniform<THREE.Vector4>,
  /** x coverage threshold (lower = more cloud), y edge softness */
  uCloudShadowK: { value: new THREE.Vector2(0.6, 0.16) } as THREE.IUniform<THREE.Vector2>,
  uCloudShadowTex: { value: null } as THREE.IUniform<THREE.Texture | null>,
  /** W01 front: xy unit direction it travels (world xz), z line position along it (m), w active 0/1 */
  uCloudShadowF: { value: new THREE.Vector4(1, 0, 0, 0) } as THREE.IUniform<THREE.Vector4>,
  /** W01 front: behind the line, x coverage threshold, y strength */
  uCloudShadowG: { value: new THREE.Vector2(0.6, 0) } as THREE.IUniform<THREE.Vector2>,
};

export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform vec4 uCloudShadow;
uniform vec2 uCloudShadowK;
uniform sampler2D uCloudShadowTex;
uniform vec4 uCloudShadowF;
uniform vec2 uCloudShadowG;
float hbCloudShadow(vec2 xz) {
  // W01: under a front, the ground behind its line already has the weather it brings (the shadow line crosses
  // the water toward the island); ahead of it, the old sky
  float bh = uCloudShadowF.w > 0.5 ? 1.0 - smoothstep(-60.0, 60.0, dot(xz, uCloudShadowF.xy) - uCloudShadowF.z) : 0.0;
  float w = mix(uCloudShadow.w, uCloudShadowG.y, bh);
  if (w < 0.001) return 1.0;
  float k = mix(uCloudShadowK.x, uCloudShadowG.x, bh);
  vec2 uv = (xz + uCloudShadow.xy) * uCloudShadow.z;
  float n = texture2D(uCloudShadowTex, uv).r * 0.72 + texture2D(uCloudShadowTex, uv * 2.3 + 0.37).g * 0.38;
  float c = smoothstep(k, k + uCloudShadowK.y, n);
  return 1.0 - w * c;
}
`;

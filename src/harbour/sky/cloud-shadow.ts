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
};

export const CLOUD_SHADOW_GLSL = /* glsl */ `
uniform vec4 uCloudShadow;
uniform vec2 uCloudShadowK;
uniform sampler2D uCloudShadowTex;
float hbCloudShadow(vec2 xz) {
  if (uCloudShadow.w < 0.001) return 1.0;
  vec2 uv = (xz + uCloudShadow.xy) * uCloudShadow.z;
  float n = texture2D(uCloudShadowTex, uv).r * 0.72 + texture2D(uCloudShadowTex, uv * 2.3 + 0.37).g * 0.38;
  float c = smoothstep(uCloudShadowK.x, uCloudShadowK.x + uCloudShadowK.y, n);
  return 1.0 - uCloudShadow.w * c;
}
`;

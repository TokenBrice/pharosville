import * as THREE from "three";

/**
 * 02-L1: the key light's shadow map, shared with materials that are not three-lit (the sea's ShaderMaterial).
 * SunRig (world/sun.ts) fills these every frame; consumers read `hbSunShadow(worldPos)` (1 = sunlit). Module-level
 * uniforms, like the cloud shadows (one engine per page). Decorative: time of day only.
 */
/** bound until the first shadow render: a compare-mode depth texture, so the shadow sampler always matches */
export const NO_SHADOW = new THREE.DepthTexture(1, 1);
NO_SHADOW.compareFunction = THREE.LessEqualCompare;
NO_SHADOW.needsUpdate = true;   // (a never-uploaded texture binds as an empty colour texture: a sampler mismatch)

export const sunShadowUniforms = {
  /** the key light's depth map (hardware compare); NO_SHADOW until the first shadow render */
  uKeyShadow: { value: NO_SHADOW } as THREE.IUniform<THREE.Texture>,
  /** world → shadow uv/depth (three's light.shadow.matrix, shared by reference) */
  uKeyShadowMat: { value: new THREE.Matrix4() } as THREE.IUniform<THREE.Matrix4>,
  /** x enabled 0|1, y PCF radius in uv, z taps (1 | 4), w strength (shadow.intensity) */
  uKeyShadowP: { value: new THREE.Vector4(0, 0, 1, 1) } as THREE.IUniform<THREE.Vector4>,
};

export const SUN_SHADOW_GLSL = /* glsl */ `
uniform highp sampler2DShadow uKeyShadow;
uniform mat4 uKeyShadowMat;
uniform vec4 uKeyShadowP;
// the sun's (or moon's) shadow at a world point: 1 lit … 0 shadowed. Feathered out toward the edge of the fitted
// shadow box (beyond it the map holds nothing, so the open sea stays lit rather than ending on a hard line).
float hbSunShadow(vec3 wp) {
  if (uKeyShadowP.x < 0.5) return 1.0;
  vec4 sc = uKeyShadowMat * vec4(wp, 1.0);
  vec3 c = sc.xyz / sc.w;
  vec2 m = min(c.xy, 1.0 - c.xy);
  float fade = smoothstep(0.0, 0.06, min(m.x, m.y));
  if (fade <= 0.0 || c.z >= 1.0) return 1.0;
  c.z -= 0.0006;
  float s;
  if (uKeyShadowP.z > 2.5) {
    // 4 rotated taps (each a hardware 2x2 compare): a soft, stable penumbra
    float a = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    vec2 d = vec2(cos(a), sin(a)) * uKeyShadowP.y;
    vec2 e = vec2(-d.y, d.x);
    s = 0.25 * (texture(uKeyShadow, vec3(c.xy + d, c.z)) + texture(uKeyShadow, vec3(c.xy - d, c.z))
      + texture(uKeyShadow, vec3(c.xy + e * 0.5, c.z)) + texture(uKeyShadow, vec3(c.xy - e * 0.5, c.z)));
  } else {
    s = texture(uKeyShadow, c);
  }
  return mix(1.0, s, fade * uKeyShadowP.w);
}
`;

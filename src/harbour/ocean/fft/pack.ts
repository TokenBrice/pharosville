/**
 * Atlas packing shaders (`hb_fft_pack`, Phase 2 Workstream A, §5.1).
 *
 * Reads the final spatial 2× RGBA MRT fields (`uField0`, `uField1`) from the Stockham IFFT:
 * - `uField0 = (dy, dx, dz, sx)`
 * - `uField1 = (sz, dxx, dzz, dxz)`
 *
 * Packs each cascade `c ∈ {0, 1, 2}` into the 6-layer `RGBA16F` `WebGLArrayRenderTarget` (`uFftAtlas`):
 * - Layer `c` (`0..2`, `FFT_PACK_DISP_FRAG`):
 *   `vec4(dx * uChop, dy, dz * uChop, J_det)`
 *   where `J_det = (1 + uChop·dxx)(1 + uChop·dzz) - (uChop·dxz)²`.
 *   Values `< 0.55` mark steep/folding wave crests for physical breaking foam.
 * - Layer `c + 3` (`3..5`, `FFT_PACK_SLOPE_FRAG`):
 *   `vec4(sx, sz, -(dxx + dzz), sx * sx + sz * sz)`
 *   where `-(dxx + dzz)` is positive crest convergence for Medium Hessian caustics, and
 *   `sx² + sz²` enables exact hardware-mipped LEAN/Toksvig GGX slope variance (`mip(slopeVar) - |mip(slope)|²`).
 */

const SAMPLE_FIELD_GLSL = /* glsl */ `
vec4 sampleField(sampler2D t, ivec2 coord, vec2 uv, int atlasSize) {
  ivec2 srcN = textureSize(t, 0);
  if (srcN.x == atlasSize) return texelFetch(t, coord, 0);
  vec2 p = uv * vec2(srcN) - 0.5;
  ivec2 i0 = ivec2(floor(p));
  vec2 f = p - vec2(i0);
  ivec2 m = max(srcN - ivec2(1), ivec2(0));
  vec4 a = mix(texelFetch(t, i0 & m, 0), texelFetch(t, (i0 + ivec2(1, 0)) & m, 0), f.x);
  vec4 b = mix(texelFetch(t, (i0 + ivec2(0, 1)) & m, 0), texelFetch(t, (i0 + ivec2(1, 1)) & m, 0), f.x);
  return mix(a, b, f.y);
}
`;

export const FFT_PACK_DISP_FRAG = /* glsl */ `
in vec2 vUv;
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform float uChop;
uniform int uAtlasSize;

layout(location = 0) out vec4 out0;
${SAMPLE_FIELD_GLSL}
void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 f0 = sampleField(uField0, coord, vUv, uAtlasSize);
  vec4 f1 = sampleField(uField1, coord, vUv, uAtlasSize);

  float dy = f0.x;
  float dx = f0.y;
  float dz = f0.z;
  float dxx = f1.y;
  float dzz = f1.z;
  float dxz = f1.w;

  float jxx = 1.0 + uChop * dxx;
  float jzz = 1.0 + uChop * dzz;
  float jxz = uChop * dxz;
  float jDet = jxx * jzz - jxz * jxz;

  out0 = vec4(dx * uChop, dy, dz * uChop, jDet);
}
`;

export const FFT_PACK_SLOPE_FRAG = /* glsl */ `
in vec2 vUv;
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform int uAtlasSize;

layout(location = 0) out vec4 out0;
${SAMPLE_FIELD_GLSL}
void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  vec4 f0 = sampleField(uField0, coord, vUv, uAtlasSize);
  vec4 f1 = sampleField(uField1, coord, vUv, uAtlasSize);

  float sx = f0.w;
  float sz = f1.x;
  float dxx = f1.y;
  float dzz = f1.z;
  float conv = -(dxx + dzz);
  float slopeVar = sx * sx + sz * sz;

  out0 = vec4(sx, sz, conv, slopeVar);
}
`;

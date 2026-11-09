/**
 * Zeroes non-finite scene pixels before anything blurs them. One NaN/Inf pixel from any shader (pow of a
 * negative, a half-float overflow) is spread by the bloom mip chain over the whole screen: a black frame.
 * NaN fails every comparison, so the range test catches it even where a driver folds isnan() away.
 * Alpha leaves at 1: the scene-linear passes are done with the harbour mirror's water mask (E35, ocean/mirror-pass.ts).
 */
export const SCRUB_FRAG = /* glsl */ `
uniform sampler2D inputBuffer;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(inputBuffer, vUv);
  bvec3 ok = bvec3(c.r >= 0.0 && c.r <= 65000.0, c.g >= 0.0 && c.g <= 65000.0, c.b >= 0.0 && c.b <= 65000.0);
  gl_FragColor = vec4(ok.r ? c.r : 0.0, ok.g ? c.g : 0.0, ok.b ? c.b : 0.0, 1.0);
}`;

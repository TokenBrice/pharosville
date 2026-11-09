/** Linear resampling for tier-sized history targets, preserving every channel. */
export const COPY_FRAG = /* glsl */ `
uniform sampler2D uSource;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uSource, vUv); }
`;

import * as THREE from "three";
import { Effect } from "postprocessing";

/**
 * HEAT SHIMMER over the beacon fire: the frame is resampled through a rising noise field in a column above the
 * lantern's screen position (mainUv, so it bends whatever lies behind: the dome, the statue, the sky).
 */
export const SHIMMER_FRAG = /* glsl */ `
uniform vec2 uShC;
uniform vec2 uShR;
uniform float uShAmt;
uniform float uShT;
uniform sampler2D uShNoise;
void mainUv(inout vec2 uv) {
  vec2 d = (uv - uShC) / uShR;
  float m = exp(-d.x * d.x * 2.2) * smoothstep(-0.8, 0.1, d.y) * (1.0 - smoothstep(1.0, 3.2, d.y));
  if (m * uShAmt < 1e-4) return;
  vec2 n = texture2D(uShNoise, vec2(d.x * 0.35, d.y * 0.16 - uShT * 0.45)).gb - 0.5;
  uv += n * vec2(1.0, 0.5) * uShAmt * m * uShR.y * 0.09;
}`;

export class ShimmerEffect extends Effect {
  constructor(uniforms: Map<string, THREE.Uniform>) {
    super("HarbourHeatShimmer", SHIMMER_FRAG, { uniforms });
  }
}

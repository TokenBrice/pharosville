import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { bakeTexture, NOISE_GLSL } from "./gpu-bake";

/**
 * Shared procedural textures for sea, sky and beam (baked once on the GPU, cached in ctx.services):
 *  - noise:  256² RGBA8 tileable fbm, channel base frequencies 4 / 8 / 16 / 32.
 *  - ripple: 512² RGBA8 tileable capillary-ripple normal map (rg = slope, a = height), wind-biased.
 */
export interface FxTextures { noise: THREE.Texture; ripple: THREE.Texture; release(): void }

const KEY = "fx:textures";

const NOISE_FRAG = /* glsl */ `
${NOISE_GLSL}
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(pfbm(vUv, 4.0, 1.0, 5), pfbm(vUv, 8.0, 21.0, 5), pfbm(vUv, 16.0, 41.0, 4), pfbm(vUv, 32.0, 61.0, 3));
}`;

const RIPPLE_FRAG = /* glsl */ `
${NOISE_GLSL}
varying vec2 vUv;
void main() {
  const float TAU = 6.28318530718;
  float h = 0.0, hn = 0.0; vec2 d = vec2(0.0);
  for (int k = 0; k < 56; k++) {
    float fk = float(k);
    float ang = (hash12(vec2(fk, 3.1)) - 0.5) * 3.14159 * 1.15 + 0.6;
    float f = 3.0 + floor(pow(hash12(vec2(fk, 7.7)), 1.6) * 30.0);
    vec2 fr = vec2(floor(cos(ang) * f + 0.5), floor(sin(ang) * f + 0.5));
    if (fr.x == 0.0 && fr.y == 0.0) continue;
    float amp = 1.0 / pow(length(fr), 1.2);
    float ph = hash12(vec2(fk, 11.3)) * TAU;
    float p = TAU * dot(fr, vUv) + ph;
    float s = sin(p), c = cos(p);
    float sh = 1.0 - abs(s);
    h += amp * sh * sh; hn += amp;
    d += -2.0 * sh * sign(s) * c * amp * TAU * fr;
  }
  vec2 slope = clamp(-d / 90.0, -1.0, 1.0);
  gl_FragColor = vec4(slope * 0.5 + 0.5, 1.0, h / hn);
}`;

interface Shared extends FxTextures { refs: number }

/** Ref-counted: every system that acquires calls release() in its dispose(). */
export function acquireFxTextures(ctx: EngineContext): FxTextures {
  const hit = ctx.services.get(KEY) as Shared | undefined;
  if (hit) { hit.refs++; return hit; }
  const noiseRT = bakeTexture(ctx.renderer, NOISE_FRAG, { width: 256, height: 256 });
  const rippleRT = bakeTexture(ctx.renderer, RIPPLE_FRAG, { width: 512, height: 512 });
  const fx: Shared = {
    refs: 1,
    noise: noiseRT.texture,
    ripple: rippleRT.texture,
    release() { if (--fx.refs > 0) return; noiseRT.dispose(); rippleRT.dispose(); ctx.services.delete(KEY); },
  };
  ctx.services.set(KEY, fx);
  return fx;
}

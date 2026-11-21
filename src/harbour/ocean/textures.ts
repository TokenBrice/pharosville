import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { bakeTexture, NOISE_GLSL } from "./gpu-bake";

/**
 * Shared procedural textures for sea, sky and beam (baked once on the GPU, cached in ctx.services):
 *  - noise:  256² RGBA8 tileable fbm, channel base frequencies 4 / 8 / 16 / 32.
 *  - ripple: 512² RGBA8 tileable capillary-ripple map (rg = slope, b = Worley ridge, a = height), wind-biased.
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
  for (int k = 0; k < 72; k++) {
    float fk = float(k);
    // primary windward fan + oblique cross-sea capillary spread so facets never read as parallel hatch lines
    float crossWave = step(0.72, hash12(vec2(fk, 19.3)));
    float fan = mix(3.14159 * 1.15, 3.14159 * 1.85, crossWave);
    float ang = (hash12(vec2(fk, 3.1)) - 0.5) * fan + 0.6 + crossWave * 1.1;
    float f = 2.0 + floor(pow(hash12(vec2(fk, 7.7)), 1.45) * 34.0);
    vec2 fr = vec2(floor(cos(ang) * f + 0.5), floor(sin(ang) * f + 0.5));
    if (fr.x == 0.0 && fr.y == 0.0) continue;
    float amp = 1.0 / pow(length(fr), 1.15);
    float ph = hash12(vec2(fk, 11.3)) * TAU;
    float p = TAU * dot(fr, vUv) + ph;
    float s = sin(p), c = cos(p);
    // C1-smooth sharpened wavelets (no C0 abs-sin spikes) for organic Aegean sparkle
    float u = max(0.5 + 0.5 * s, 1e-4);
    float sharp = smoothstep(5.0, 22.0, length(fr));
    float wSharp = 0.35 + 0.45 * sharp;
    float hWave = mix(u, pow(u, 1.55), wSharp);
    vec2 dWave = mix(0.5, 0.775 * pow(u, 0.55), wSharp) * c * TAU * fr;
    h += amp * hWave; hn += amp;
    d += dWave * amp;
  }
  vec2 slope = clamp(-d / 85.0, -1.0, 1.0);
  // tileable periodic Worley/Voronoi cellular ridge field in .b (zero extra texture fetches for caustics & storm foam)
  const float VP = 10.0;
  vec2 vp = vUv * VP, vid = floor(vp), vf = fract(vp);
  float d1 = 8.0, d2 = 8.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 off = vec2(float(ox), float(oy));
      vec2 cell = mod(vid + off + VP, VP);
      vec2 pt = off + 0.15 + 0.70 * vec2(hash12(cell + 13.7), hash12(cell + 71.3));
      float dist = length(pt - vf);
      if (dist < d1) { d2 = d1; d1 = dist; }
      else if (dist < d2) { d2 = dist; }
    }
  }
  float vor = pow(1.0 - smoothstep(0.0, 0.46, d2 - d1), 1.6);
  gl_FragColor = vec4(slope * 0.5 + 0.5, vor, h / hn);
}`;

export interface SharedFxTextures extends FxTextures { refs: number }

/** Ref-counted: every system that acquires calls release() in its dispose(). */
export async function acquireFxTextures(ctx: EngineContext): Promise<FxTextures> {
  let pending = ctx.services.get(KEY);
  if (!pending) {
    pending = (async () => {
      const noiseRT = await bakeTexture(ctx, NOISE_FRAG, { width: 256, height: 256 });
      try {
        const rippleRT = await bakeTexture(ctx, RIPPLE_FRAG, { width: 512, height: 512 });
        const fx: SharedFxTextures = {
          refs: 0, noise: noiseRT.texture, ripple: rippleRT.texture,
          release() { if (--fx.refs > 0) return; noiseRT.dispose(); rippleRT.dispose(); ctx.services.delete(KEY); },
        };
        return fx;
      } catch (error) { noiseRT.dispose(); throw error; }
    })();
    ctx.services.set(KEY, pending);
    void pending.catch(() => { if (ctx.services.get(KEY) === pending) ctx.services.delete(KEY); });
  }
  const fx = await pending;
  fx.refs++;
  return fx;
}

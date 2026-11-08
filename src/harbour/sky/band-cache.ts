import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import type { FullscreenPass } from "../ocean/gpu-bake";

type BandInput = THREE.IUniform<number | THREE.Color | THREE.Vector3 | THREE.Vector4>;
interface BandUniforms {
  uWeather: THREE.IUniform<THREE.Vector3>; uPrecipSky: THREE.IUniform<THREE.Vector4>;
  uStorm: THREE.IUniform<number>; uSkyNoise: THREE.IUniform<THREE.Texture | null>;
}

export class SkyBandCache {
  private bandInputs: BandInput[] = [];
  private bandState: number[] = [];
  private bandNext: number[] = [];
  dirty = true;
  private bandNoise: THREE.Texture | null = null;
  private bandNoiseVersion = -1;

  setInputs(inputs: BandInput[]): void {
    this.bandInputs = inputs;
    this.bandNext = new Array<number>(4 + this.bandInputs.length * 4).fill(0);
    this.bandState = new Array<number>(this.bandNext.length).fill(NaN);
  }

  /** Reuse only identical inputs; animated rain/decks and each lightning flash retain full frame cadence. */
  render(ctx: EngineContext, u: BandUniforms, pass: FullscreenPass, target: THREE.WebGLRenderTarget): void {
    const next = this.bandNext, prev = this.bandState;
    const weather = u.uWeather.value, precip = u.uPrecipSky.value;
    // Below 0.009 the GLSL sum cannot cross its 0.01 branch through float rounding.
    const rain = precip.x + precip.y > 0.009;
    const nightDeck = THREE.MathUtils.smoothstep(weather.x, 0.2, 0.36) * THREE.MathUtils.smoothstep(ctx.uniforms.uNight.value, 0.25, 0.75);
    // A lower threshold than the GLSL branch is conservative around CPU/GPU float rounding.
    const deck = u.uStorm.value > 0.001 || nightDeck > 0.001;
    next[0] = weather.x; next[1] = rain || deck ? weather.z : 0;
    next[2] = rain ? ctx.uniforms.uTime.value : 0; next[3] = weather.y;
    for (let i = 0; i < this.bandInputs.length; i++) {
      const value = this.bandInputs[i].value, offset = 4 + i * 4;
      if (typeof value === "number") next[offset] = value;
      else value.toArray(next, offset);
    }
    const noise = u.uSkyNoise.value;
    let dirty = this.dirty || noise !== this.bandNoise || noise?.version !== this.bandNoiseVersion;
    for (let i = 0; i < next.length; i++) if (next[i] !== prev[i]) dirty = true;
    if (!dirty) return;
    pass.render(ctx.renderer, target);
    for (let i = 0; i < next.length; i++) prev[i] = next[i];
    this.bandNoise = noise; this.bandNoiseVersion = noise?.version ?? -1; this.dirty = false;
  }
}

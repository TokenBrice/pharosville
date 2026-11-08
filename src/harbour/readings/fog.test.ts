import * as THREE from "three";
import type { EffectComposer } from "postprocessing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NIGHT_LIFT, SEA_SMOKE, seaSmoke, StaleFog } from "./fog";
import { TimeOfDay } from "../engine/time-of-day";
import { createWorldUniforms } from "../engine/uniforms";

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const smoke = new THREE.Color(SEA_SMOKE);

/** The hour's haze, horizon and night factor as TimeOfDay writes them (reference day, pinned hour). */
function hourAir(hour: number) {
  const tod = new TimeOfDay(), u = createWorldUniforms();
  tod.setHour(hour);
  tod.update(0, 0, u);
  return { haze: u.uHaze.value.clone(), horizon: u.uHorizon.value.clone(), night: u.uNight.value };
}

describe("E10 stale fog: one sea-smoke hue, the hour's luminance", () => {
  beforeEach(() => vi.stubGlobal("location", { search: "", hash: "" }));
  afterEach(() => vi.unstubAllGlobals());

  it("is a pale, near-neutral grey with a whisper of the stale dot's amber (display sRGB)", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(SEA_SMOKE.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    expect((max - min) / (1 - Math.abs(2 * l - 1))).toBeLessThanOrEqual(0.06);
    expect(b - r).toBeCloseTo(-0.03, 2);
    expect(r).toBeGreaterThan(g); expect(g).toBeGreaterThan(b);
  });

  it("never wears the hour's tint: only the luminance changes, round the clock", () => {
    const out = new THREE.Color();
    for (let h = 0; h < 24; h += 0.25) {
      const { haze, horizon, night } = hourAir(h);
      seaSmoke(out, haze, horizon, night);
      expect(out.r / out.g).toBeCloseTo(smoke.r / smoke.g, 9);
      expect(out.b / out.g).toBeCloseTo(smoke.b / smoke.g, 9);
      const air = THREE.MathUtils.lerp(lum(haze), lum(horizon), 0.25 + 0.45 * night);
      expect(lum(out)).toBeCloseTo(air * (1.05 + 1.3 * night) * (1 + (NIGHT_LIFT - 1) * night), 9);
    }
  });

  it("follows the hour's light: bright by day, a moonlit bank at night lifted ×NIGHT_LIFT over the earlier one", () => {
    const at = (h: number) => { const a = hourAir(h); return { lum: lum(seaSmoke(new THREE.Color(), a.haze, a.horizon, a.night)), ...a }; };
    const noon = at(12), dusk = at(20.7), night = at(22);
    expect(noon.lum).toBeGreaterThan(dusk.lum);
    expect(dusk.lum).toBeGreaterThan(night.lum * 0.999);
    // the v1.5 night bank: the same air, ×(1.05 + 1.3 n)
    const before = THREE.MathUtils.lerp(lum(night.haze), lum(night.horizon), 0.7) * 2.35;
    expect(night.lum / before).toBeCloseTo(NIGHT_LIFT, 9);
    expect(NIGHT_LIFT).toBeGreaterThanOrEqual(1.4);
    // still a veil over the dark scene, far below a lit lamp's HDR excess (the lamps bloom through it)
    expect(night.lum).toBeLessThan(0.2);
  });

  it("stays stale-only: the pass is off at zero and the caller's amount (the data) is passed through unchanged", () => {
    const composer = { addPass: vi.fn(), removePass: vi.fn() } as unknown as EffectComposer;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 300, 600); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const fog = new StaleFog(composer, camera, new THREE.Texture(), new THREE.Uniform(0));
    const inner = fog as unknown as { pass: { enabled: boolean }; effect: { uniforms: Map<string, THREE.Uniform> } };
    const { haze, horizon, night } = hourAir(22);
    fog.update(0, haze, horizon, night);
    expect(inner.pass.enabled).toBe(false);
    fog.update(0.37, haze, horizon, night);
    expect(inner.pass.enabled).toBe(true);
    const uniforms = inner.effect.uniforms;
    expect(uniforms.get("uAmount")!.value).toBe(0.37);
    expect((uniforms.get("uFogCol")!.value as THREE.Color).equals(seaSmoke(new THREE.Color(), haze, horizon, night))).toBe(true);
    fog.dispose();
  });
});

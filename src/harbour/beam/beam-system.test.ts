import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import type { EngineContext } from "../engine/types";
import { TIERS, type QualityService, type QualitySettings } from "../engine/quality";
import { BEAM_FRAG, BeamSystem, beamPassActive, shimmerAmount } from "./beam-system";

interface BeamHarness { SH: { uShAmt: THREE.Uniform<number> }; U: { uIntensity: THREE.Uniform<number> }; pass: { enabled: boolean } }

const LANTERN = new THREE.Vector3(0, 90, 0);

/** A beam over a fake engine: no renderer, the shared noise texture pre-seeded, a lighthouse service and a motion flag. */
async function beamWorld(opts: { lit?: boolean; reduced?: boolean; night?: number } = {}) {
  const camera = new THREE.PerspectiveCamera(25, 1.6, 1, 5000);
  const uniforms = createWorldUniforms();
  uniforms.uNight.value = opts.night ?? 0;
  const lighthouse = { lanternPosition: LANTERN.clone(), sweepAngle: () => 0.4, period: 12, lit: opts.lit ?? true, flicker: 1 };
  const services = new Map<string, unknown>([
    ["fx:textures", { refs: 1, noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }],
    ["lighthouse", lighthouse],
    ["motion", { reduced: opts.reduced ?? false }],
  ]) as Services;
  const composer = { passes: [{}, {}, {}], addPass: vi.fn(), removePass: vi.fn() };
  const ctx = { camera, scene: new THREE.Scene(), uniforms, services, composer } as unknown as EngineContext;
  const beam = new BeamSystem();
  await beam.init(ctx); // fx textures are acquired asynchronously since B13
  const look = (from: [number, number, number], at: THREE.Vector3 = LANTERN) => {
    camera.position.set(...from);
    camera.lookAt(at);
    camera.updateMatrixWorld();
    beam.update({ elapsed: 1, delta: 1 / 60, nowMs: 0 }, ctx);
    const h = beam as unknown as BeamHarness;
    return { shimmer: h.SH.uShAmt.value, intensity: h.U.uIntensity.value, pass: h.pass.enabled };
  };
  return { look, ctx, beam };
}
/** A camera `d` metres from the lantern, a little above it, facing it. */
const at = (d: number): [number, number, number] => [0, 90 + d * 0.3, d * Math.sqrt(1 - 0.09)];

describe("E07 heat shimmer over the beacon", () => {
  beforeEach(() => vi.stubGlobal("location", { search: "" }));
  afterEach(() => vi.unstubAllGlobals());

  it("is a close-range read: full near, easing out by 520 m, gone far (the gate was inverted)", () => {
    expect(shimmerAmount(100, true, true, 1, false)).toBe(1);
    expect(shimmerAmount(140, true, true, 1, false)).toBe(1);
    expect(shimmerAmount(330, true, true, 1, false)).toBeGreaterThan(0.3);
    expect(shimmerAmount(330, true, true, 1, false)).toBeLessThan(0.7);
    expect(shimmerAmount(520, true, true, 1, false)).toBe(0);
    expect(shimmerAmount(730, true, true, 1, false)).toBe(0);
    // it breathes with the fire (breath 0.7 + 0.3 × flicker)
    expect(shimmerAmount(100, true, true, 0.7, false)).toBeCloseTo(0.91, 6);
    // nothing to bend when the fire is out, the lantern off screen, or motion is reduced
    expect(shimmerAmount(100, false, true, 1, false)).toBe(0);
    expect(shimmerAmount(100, true, false, 1, false)).toBe(0);
    expect(shimmerAmount(100, true, true, 1, true)).toBe(0);
  });

  it("drives the pass by day near/far/offscreen/unlit/reduced, and keeps the night shaft", async () => {
    const day = await beamWorld();
    const near = day.look(at(100)), mid = day.look(at(330)), far = day.look(at(730));
    expect(near.intensity).toBe(0);                       // no shaft by day
    expect(near.shimmer).toBeGreaterThan(0.99);
    expect(near.pass).toBe(true);                         // the near-day cost returns, intentionally
    expect(mid.shimmer).toBeGreaterThan(0);
    expect(mid.shimmer).toBeLessThan(near.shimmer);
    expect(far.shimmer).toBe(0);
    expect(far.pass).toBe(false);                         // far by day: no full-screen pass at all
    const away = day.look(at(100), new THREE.Vector3(0, 90 + 30, 400));   // the lantern behind the camera
    expect(away.shimmer).toBe(0);
    expect(away.pass).toBe(false);

    expect((await beamWorld({ lit: false })).look(at(100))).toMatchObject({ shimmer: 0, pass: false });
    expect((await beamWorld({ reduced: true })).look(at(100))).toMatchObject({ shimmer: 0, pass: false });

    const night = (await beamWorld({ night: 1 })).look(at(730));
    expect(night.shimmer).toBe(0);
    expect(night.intensity).toBeGreaterThan(0.002);
    expect(night.pass).toBe(true);                        // the shaft alone keeps the pass on
  });

  it("enables the shared pass for either effect alone", () => {
    expect(beamPassActive(0, 0)).toBe(false);
    expect(beamPassActive(0.002, 0.001)).toBe(false);
    expect(beamPassActive(0.0021, 0)).toBe(true);
    expect(beamPassActive(0, 0.0011)).toBe(true);
  });
});

it("holds beam intensity and decorative clocks under reduction while still accepting analytical reach", async () => {
  vi.stubGlobal("location", { search: "" });
  try {
    const f = await beamWorld({ reduced: true, night: 1 });
    f.look(at(100));
    const h = f.beam as unknown as { U: { uTime: THREE.Uniform<number>; uIntensity: THREE.Uniform<number> }; SH: { uShT: THREE.Uniform<number>; uShAmt: THREE.Uniform<number> } };
    const level = h.U.uIntensity.value;
    const lighthouse = f.ctx.services.get("lighthouse") as { flicker: number };
    for (let i = 0; i < 240; i++) {
      lighthouse.flicker = (i % 10) / 10;
      f.beam.update({ elapsed: i + 10, delta: 1 / 30, nowMs: i * 1000 }, f.ctx);
      expect(h.U.uIntensity.value).toBe(level);
      expect(h.U.uTime.value).toBe(0); expect(h.SH.uShT.value).toBe(0); expect(h.SH.uShAmt.value).toBe(0);
    }
    (f.ctx.services.get("beam") as { setReach(v: number): void }).setReach(0);
    f.beam.update({ elapsed: 300, delta: 1, nowMs: 300_000 }, f.ctx);
    expect(h.U.uIntensity.value).toBeLessThan(level);
    f.beam.dispose(f.ctx);
  } finally { vi.unstubAllGlobals(); }
});

it("scales volumetric shaft raymarch steps with quality tier and unsubscribes on dispose", async () => {
  vi.stubGlobal("location", { search: "" });
  try {
    let listener: ((s: QualitySettings, dpr: number) => void) | undefined;
    const unsubscribe = vi.fn();
    const quality = { settings: TIERS.high, onChange: (fn: typeof listener) => { listener = fn; return unsubscribe; } };
    const f = await beamWorld({ night: 1 });
    f.beam.dispose(f.ctx);
    f.ctx.services.set("quality", quality as unknown as QualityService);
    const beam = new BeamSystem();
    await beam.init(f.ctx);
    const uSteps = (beam as unknown as { U: { uSteps: THREE.Uniform<number> } }).U.uSteps;
    expect(uSteps.value).toBe(28);
    listener?.(TIERS.medium, 1.5);
    expect(uSteps.value).toBe(20);
    listener?.(TIERS.low, 1);
    expect(uSteps.value).toBe(14);
    beam.dispose(f.ctx);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  } finally { vi.unstubAllGlobals(); }
});

it("wires uPrecip rain/snow moisture scatter into the Pharos beam shaft while preserving B07/C04 & optical depth cap", async () => {
  vi.stubGlobal("location", { search: "" });
  try {
    const f = await beamWorld({ night: 1 });
    const h = f.beam as unknown as { U: { uPrecip: THREE.Uniform<number> } };
    expect(h.U.uPrecip.value).toBe(0);

    f.ctx.uniforms.uPrecip.value.set(0.62, 0.18);
    f.look(at(330));
    expect(h.U.uPrecip.value).toBeCloseTo(0.8, 5);

    expect(BEAM_FRAG).toContain("uPrecip");
    expect(BEAM_FRAG).toContain("smoothstep(0.25, 0.90, uPrecip)");
    expect(BEAM_FRAG).toContain("1.0 - exp(-acc.x * 0.74)");

    // B07 / C04 checks on BEAM_FRAG: ascending literal smoothstep only, zero pow(..., 2.0)
    const smoothRe = /(?<![\w.])smoothstep\s*\(([^,]+),([^,]+),/g;
    for (let m = smoothRe.exec(BEAM_FRAG); m; m = smoothRe.exec(BEAM_FRAG)) {
      const e0 = Number(m[1]!.trim());
      const e1 = Number(m[2]!.trim());
      if (Number.isFinite(e0) && Number.isFinite(e1)) {
        expect(e0 < e1, `smoothstep(${m[1]}, ${m[2]})`).toBe(true);
      }
    }
    expect(BEAM_FRAG).not.toMatch(/\bpow\s*\([^)]*,\s*2(?:\.0*)?\s*\)/);

    f.beam.dispose(f.ctx);
  } finally { vi.unstubAllGlobals(); }
});

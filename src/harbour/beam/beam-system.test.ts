import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import type { EngineContext } from "../engine/types";
import { BeamSystem, beamPassActive, shimmerAmount } from "./beam-system";

interface BeamHarness { SH: { uShAmt: THREE.Uniform<number> }; U: { uIntensity: THREE.Uniform<number> }; pass: { enabled: boolean } }

const LANTERN = new THREE.Vector3(0, 90, 0);

/** A beam over a fake engine: no renderer, the shared noise texture pre-seeded, a lighthouse service and a motion flag. */
function beamWorld(opts: { lit?: boolean; reduced?: boolean; night?: number } = {}) {
  const camera = new THREE.PerspectiveCamera(25, 1.6, 1, 5000);
  const uniforms = createWorldUniforms();
  uniforms.uNight.value = opts.night ?? 0;
  const lighthouse = { lanternPosition: LANTERN.clone(), sweepAngle: () => 0.4, period: 12, lit: opts.lit ?? true, flicker: 1 };
  const services = new Map<string, unknown>([
    ["fx:textures", { refs: 1, noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }],
    ["lighthouse", lighthouse],
    ["motion", { reduced: opts.reduced ?? false }],
  ]);
  const composer = { passes: [{}, {}, {}], addPass: vi.fn(), removePass: vi.fn() };
  const ctx = { camera, scene: new THREE.Scene(), uniforms, services, composer } as unknown as EngineContext;
  const beam = new BeamSystem();
  beam.init(ctx);
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

  it("drives the pass by day near/far/offscreen/unlit/reduced, and keeps the night shaft", () => {
    const day = beamWorld();
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

    expect(beamWorld({ lit: false }).look(at(100))).toMatchObject({ shimmer: 0, pass: false });
    expect(beamWorld({ reduced: true }).look(at(100))).toMatchObject({ shimmer: 0, pass: false });

    const night = beamWorld({ night: 1 }).look(at(730));
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

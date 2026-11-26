import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_RIBBONS_HIGH,
  MAX_RIBBONS_MED,
  RIBBON_PTS_HIGH,
  RIBBON_PTS_MED,
  RIBBON_RES_HIGH,
  RIBBON_RES_MED,
  RIBBON_SNAP_M,
  WAKE_RIBBON_FRAG,
  WAKE_RIBBON_VERT,
  WakeRibbons,
  wakeRibbonBoundsFor,
} from "./wake-ribbons";
import type { Bounds4 } from "./sea-sdf";

function fakeRenderer() {
  let target: THREE.WebGLRenderTarget | null = null;
  let clearColor = new THREE.Color(0x224466);
  let clearAlpha = 0.75;
  return {
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((t: THREE.WebGLRenderTarget | null) => { target = t; }),
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn((c: THREE.Color | number, a = 1) => { clearColor = new THREE.Color(c); clearAlpha = a; }),
    clear: vi.fn(),
    render: vi.fn(),
  };
}

describe("WakeRibbons (Phase 2 WS-B: H1 / H2 / H4)", () => {
  it("exports exact tier constants and target-centered 16 m snapped bounds (0.23–0.47 m/texel on High)", () => {
    expect(RIBBON_RES_HIGH).toBe(1024);
    expect(RIBBON_RES_MED).toBe(512);
    expect(MAX_RIBBONS_HIGH).toBe(128);
    expect(MAX_RIBBONS_MED).toBe(64);
    expect(RIBBON_PTS_HIGH).toBe(40);
    expect(RIBBON_PTS_MED).toBe(24);
    expect(RIBBON_SNAP_M).toBe(16);

    // Close (< 340 m): 240 m span -> 0.234 m/texel @ 1024
    const close = wakeRibbonBoundsFor(17, -23, 250);
    expect(close).toEqual([16 - 120, -16 - 120, 16 + 120, -16 + 120]);
    expect((close[2] - close[0]) / RIBBON_RES_HIGH).toBeCloseTo(240 / 1024, 6);

    // Mid (340..719 m): 480 m span -> 0.469 m/texel @ 1024
    const mid = wakeRibbonBoundsFor(-33, 41, 650);
    expect(mid).toEqual([-32 - 240, 48 - 240, -32 + 240, 48 + 240]);
    expect((mid[2] - mid[0]) / RIBBON_RES_HIGH).toBeCloseTo(480 / 1024, 6);

    // Far (>= 720 m): 960 m span
    const far = wakeRibbonBoundsFor(0, 0, 900);
    expect(far).toEqual([-480, -480, 480, 480]);

    // Writes into caller-provided scratch without allocating
    const scratch: Bounds4 = [0, 0, 0, 0];
    expect(wakeRibbonBoundsFor(25, -49, 400, scratch)).toBe(scratch);
    expect(scratch).toEqual([32 - 240, -48 - 240, 32 + 240, -48 + 240]);
  });

  it("enforces H4 material & shader contracts: hb_wake_ribbon, blendEquationSeparate(MAX, ADD), B07/C04 clean", () => {
    const ribbons = new WakeRibbons("high");
    const mat = ribbons.mesh.material;
    expect(mat.name).toBe("hb_wake_ribbon");
    expect(mat.transparent).toBe(true);
    expect(mat.depthTest).toBe(false);
    expect(mat.depthWrite).toBe(false);
    expect(mat.side).toBe(THREE.DoubleSide);
    expect(mat.fog).toBe(false);
    expect(mat.blending).toBe(THREE.CustomBlending);
    expect(mat.blendEquation).toBe(THREE.MaxEquation);
    expect(mat.blendSrc).toBe(THREE.OneFactor);
    expect(mat.blendDst).toBe(THREE.OneFactor);
    expect(mat.blendEquationAlpha).toBe(THREE.AddEquation);
    expect(mat.blendSrcAlpha).toBe(THREE.OneFactor);
    expect(mat.blendDstAlpha).toBe(THREE.OneFactor);

    expect(WAKE_RIBBON_VERT).toContain("uLiveBounds");
    expect(WAKE_RIBBON_VERT).toContain("aRibbonA");
    expect(WAKE_RIBBON_VERT).toContain("aRibbonB");
    expect(WAKE_RIBBON_FRAG).toContain("0.3536"); // Kelvin 19.47° half-angle
    expect(WAKE_RIBBON_FRAG).toContain("headLive"); // stopped vessels fade bow plume with age
    expect(WAKE_RIBBON_FRAG).toContain("gl_FragColor = vec4(foam, churn, hullOcc, signedKelvinH);");
    // Strip half-span comfortably clears Kelvin arm + 2*armW before edgeFade starts (0.80 * span) for skiffs & titans
    for (const hb of [1.2, 2.5, 4.8]) {
      for (const uPos of [5, 25, 80, 140]) {
        const armR = hb * 0.60 + uPos * 0.3536;
        const armW = 0.56 + uPos * 0.025;
        const span = hb * 1.6 + uPos * 0.56 + 2.0;
        expect(armR + armW * 1.5, `hb=${hb} uPos=${uPos}`).toBeLessThan(span * 0.80);
      }
    }
    // B07 / C04: no pow(..., 2) and no descending literal smoothstep
    expect(WAKE_RIBBON_FRAG).not.toMatch(/\bpow\s*\(/);
    for (const m of WAKE_RIBBON_FRAG.matchAll(/\bsmoothstep\s*\(\s*([^,]+),\s*([^,]+),/g)) {
      const a = Number(m[1]), b = Number(m[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) expect(a).toBeLessThan(b);
    }
    ribbons.dispose();
  });

  it("allocates RGBA16F RT per tier (1024² High, 512² Med, 0 MB Low) and keeps preparationEntries stall-free", () => {
    const ribbons = new WakeRibbons();
    const fallback = ribbons.texture;
    expect(ribbons.active).toBe(false);
    expect(ribbons.target).toBeNull();
    expect(fallback).toBeInstanceOf(THREE.DataTexture);
    expect(ribbons.uniforms.uRibbonsOn.value).toBe(0);

    // Off-active preparation resolves to 1×1 RGBA16F compilation target
    const prep = ribbons.preparationEntries();
    expect(prep).toHaveLength(1);
    const compileRT = prep[0].target();
    expect(compileRT).not.toBeNull();
    expect([compileRT!.width, compileRT!.height]).toEqual([1, 1]);
    expect(compileRT!.texture.format).toBe(THREE.RGBAFormat);
    expect(compileRT!.texture.type).toBe(THREE.HalfFloatType);

    // High tier -> 1024² RGBA16F
    ribbons.setTier("high");
    expect(ribbons.active).toBe(true);
    expect(ribbons.uniforms.uRibbonsOn.value).toBe(1);
    const highRT = ribbons.target!;
    expect([highRT.width, highRT.height]).toEqual([1024, 1024]);
    expect(highRT.depthBuffer).toBe(false);
    expect(highRT.texture.format).toBe(THREE.RGBAFormat);
    expect(highRT.texture.type).toBe(THREE.HalfFloatType);
    expect(highRT.texture.generateMipmaps).toBe(false);
    expect(ribbons.texture).toBe(highRT.texture);
    expect(prep[0].target()).toBe(highRT);

    // Medium tier -> 512² RGBA16F, disposing old 1024² RT
    const onHighDispose = vi.fn();
    highRT.addEventListener("dispose", onHighDispose);
    ribbons.setTier("medium");
    expect(onHighDispose).toHaveBeenCalledOnce();
    const medRT = ribbons.target!;
    expect([medRT.width, medRT.height]).toEqual([512, 512]);
    expect(ribbons.texture).toBe(medRT.texture);

    // Low tier -> restores fallback BEFORE disposing RT (0 MB VRAM)
    let fallbackBeforeDispose = false;
    const onMedDispose = vi.fn(() => { fallbackBeforeDispose = ribbons.texture === fallback; });
    medRT.addEventListener("dispose", onMedDispose);
    ribbons.setTier("low");
    expect(onMedDispose).toHaveBeenCalledOnce();
    expect(fallbackBeforeDispose).toBe(true);
    expect(ribbons.active).toBe(false);
    expect(ribbons.target).toBeNull();
    expect(ribbons.uniforms.uRibbonsOn.value).toBe(0);
    expect(prep[0].target()).toBe(compileRT);

    ribbons.dispose();
  });

  it("tracks moving curved turns, filters stationary hulls, resets on teleport, and renders in 1 draw call", () => {
    const ribbons = new WakeRibbons("high");
    const r = fakeRenderer();
    const prev = new THREE.WebGLRenderTarget(16, 16);
    r.setRenderTarget(prev);
    r.setRenderTarget.mockClear();

    // Stationary hull ignored (speed <= 0.25)
    ribbons.beginFrame();
    ribbons.pushMoving(1, 0, 0, 0.1, 0.1, 2, 6, 1, 0, 0);
    expect(ribbons.trackCount).toBe(0);

    // Moving hull curves along a circle over 12 frames -> grows multi-point curved ribbon
    let x = 0, z = 0, heading = 0;
    const speed = 4.0;
    for (let f = 0; f < 12; f++) {
      ribbons.beginFrame();
      heading += 0.14;
      const vx = Math.sin(heading) * speed;
      const vz = Math.cos(heading) * speed;
      x += vx * 0.5;
      z += vz * 0.5;
      ribbons.pushMoving(42, x, z, vx, vz, 2.0, 6.0, 1.0, 0, 0);
      ribbons.render(r as unknown as THREE.WebGLRenderer, 10, -10, 450, 0.5);
    }
    expect(ribbons.trackCount).toBe(1);
    expect(r.render).toHaveBeenCalledTimes(12); // exactly 1 draw per frame
    expect(r.clear).toHaveBeenCalledTimes(12);
    expect(r.getRenderTarget()).toBe(prev);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.75);
    expect(r.getClearColor(new THREE.Color()).getHex()).toBe(0x224466);

    // Multi-segment curved geometry built with positive arc distances & lateral half-span = hb*1.4 + arc*0.42
    const drawCountBefore = ribbons.mesh.geometry.drawRange.count;
    expect(drawCountBefore).toBeGreaterThan(24);
    const ribA = ribbons.mesh.geometry.getAttribute("aRibbonA") as THREE.BufferAttribute;
    expect(ribA.getX(0)).toBeLessThan(0); // bow-tip lead ahead of hull center
    expect(ribA.getY(0)).toBeLessThan(0); // port side
    expect(ribA.getY(1)).toBeGreaterThan(0); // starboard side

    // Teleport (> 45 m jump) resets track back to 2 seed points cleanly (no cross-harbour streak)
    ribbons.beginFrame();
    ribbons.pushMoving(42, x + 120, z + 120, 4, 0, 2.0, 6.0, 1.0, 0, 0);
    ribbons.render(r as unknown as THREE.WebGLRenderer, 10, -10, 450, 0.016);
    expect(ribbons.mesh.geometry.drawRange.count).toBe(12); // 2 quads (bow->head + head->tail) = 12 indices

    // Aging out unseen track reclaims the slot
    for (let f = 0; f < 25; f++) {
      ribbons.beginFrame();
      ribbons.render(r as unknown as THREE.WebGLRenderer, 10, -10, 450, 0.5);
    }
    expect(ribbons.trackCount).toBe(0);
    expect(ribbons.mesh.geometry.drawRange.count).toBe(0);

    prev.dispose();
    ribbons.dispose();
  });

  it("evicts furthest/stale tracks so the nearest/fastest 128 (High) / 64 (Med) vessels always win, and compacts on downgrade", () => {
    const ribbons = new WakeRibbons("high");
    const r = fakeRenderer();

    // Push 160 moving vessels: 128 far (300..427 m) first, then 32 near (10..41 m)
    ribbons.beginFrame();
    for (let i = 0; i < 128; i++) {
      ribbons.pushMoving(1000 + i, 300 + i, 0, 2.0, 0, 1.5, 5, 1, 0, 0);
    }
    for (let i = 0; i < 32; i++) {
      ribbons.pushMoving(i, 10 + i, 0, 4.5, 0, 2.0, 6, 1, 0, 0);
    }
    expect(ribbons.trackCount).toBe(MAX_RIBBONS_HIGH);
    const idMap = (ribbons as unknown as { idToSlot: Map<number, number> }).idToSlot;
    for (let i = 0; i < 32; i++) {
      expect(idMap.has(i)).toBe(true); // every near/fast vessel won a slot!
    }

    // Still 1 single draw call for all 128 tracks
    ribbons.render(r as unknown as THREE.WebGLRenderer, 0, 0, 400, 0.016);
    expect(r.render).toHaveBeenCalledOnce();
    expect(ribbons.mesh.geometry.drawRange.count).toBe(MAX_RIBBONS_HIGH * 12);

    // Downgrade High -> Medium compacts smoothly to at most 64 tracks
    ribbons.setTier("medium");
    expect(ribbons.trackCount).toBe(MAX_RIBBONS_MED);

    // clear() resets all tracks and zeroes the RT while preserving renderer state
    r.clear.mockClear();
    ribbons.clear(r as unknown as THREE.WebGLRenderer);
    expect(ribbons.trackCount).toBe(0);
    expect(r.clear).toHaveBeenCalledOnce();

    // Restores renderer state even if draw throws
    ribbons.beginFrame();
    ribbons.pushMoving(7, 5, 5, 3, 0, 2, 6, 1, 0, 0);
    r.render.mockImplementationOnce(() => { throw new Error("ribbon gpu fail"); });
    expect(() => ribbons.render(r as unknown as THREE.WebGLRenderer, 0, 0, 300, 0.016)).toThrow("ribbon gpu fail");
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.75);

    ribbons.dispose();
  });
});

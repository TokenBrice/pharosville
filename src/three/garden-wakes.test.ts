import {
  Color,
  InstancedMesh,
  MaxEquation,
  Mesh,
  type Scene,
  type ShaderMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createGardenWakes,
  planWakeDecayPass,
  planWakeWindow,
  WAKE_FOAM_HORIZON_SECONDS,
  WAKE_MAX_STAMPS,
  WAKE_SLICK_VISIBLE,
  type GardenWakesFrame,
  type WakeDecayPass,
} from "./garden-wakes";

const FRAME: GardenWakesFrame = {
  deltaSeconds: 1 / 60,
  reducedMotion: false,
  targetX: 47.6,
  targetZ: 38.9,
  viewHalfWidth: 58,
  tier: "full",
};

function rendererStub(onRender?: (scene: Scene, autoClear: boolean) => void) {
  let autoClear = true;
  return {
    get autoClear() {
      return autoClear;
    },
    set autoClear(value: boolean) {
      autoClear = value;
    },
    clear: vi.fn(),
    getClearAlpha: vi.fn(() => 1),
    getClearColor: vi.fn((color: Color) => color.setRGB(0, 0, 0)),
    getRenderTarget: vi.fn(() => null),
    render: vi.fn((scene: Scene) => onRender?.(scene, autoClear)),
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
  };
}

describe("planWakeWindow", () => {
  it("covers the view with margin, clamped to the texel budget", () => {
    // Default framing (half-width ~58): the window covers it with margin.
    expect(planWakeWindow(null, 0, 0, 58).window.halfSize).toBeCloseTo(78.3, 1);
    // Whole-map framing clamps at the cap so 512 texels still hold a wake arm.
    expect(planWakeWindow(null, 0, 0, 400).window.halfSize).toBe(220);
    // Deck-level zoom clamps at the floor.
    expect(planWakeWindow(null, 0, 0, 10).window.halfSize).toBe(72);
  });

  it("anchors in water space: x = worldX, y = -worldZ", () => {
    const { window } = planWakeWindow(null, 47.6, 38.9, 58);
    expect(window.centerX).toBe(47.6);
    expect(window.centerY).toBe(-38.9);
  });

  it("reprojects small pans and zooms but hard-resets teleports", () => {
    const first = planWakeWindow(null, 0, 0, 58).window;
    // A small pan keeps the window policy continuous (no reset).
    expect(planWakeWindow(first, 5, 3, 58).reset).toBe(false);
    // A jump past half the window is a teleport: stale foam must not smear.
    expect(planWakeWindow(first, 100, 0, 58).reset).toBe(true);
    // A zoom-level change resizes the window through feedback reprojection.
    const zoomed = planWakeWindow(first, 0, 0, 200);
    expect(zoomed.reset).toBe(false);
    expect(zoomed.window.halfSize).toBeGreaterThan(first.halfSize);
  });
});

describe("garden wakes stamps", () => {
  it("exposes both ping-pong textures to the owner census", () => {
    const wakes = createGardenWakes(rendererStub() as never);
    const manifest = wakes.getTextureManifest();

    expect(manifest.map(({ owner }) => owner)).toEqual([
      "garden-wakes.target-a",
      "garden-wakes.target-b",
    ]);
    expect(manifest[0]!.texture).not.toBe(manifest[1]!.texture);
    wakes.dispose();
  });

  it("converts world XZ to water space and rejects ships outside the window", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    wakes.update({ ...FRAME }); // establishes the window
    expect(wakes.halfSize).toBeCloseTo(78.3, 1);

    // At the camera target: inside.
    wakes.stamp(47.6, 38.9, 1, 0, 0.8, 1.2);
    expect(wakes.stampCount).toBe(1);
    // 300 units away: outside the ~90-unit reach, cannot contribute.
    wakes.stamp(347.6, 38.9, 1, 0, 0.8, 1.2);
    expect(wakes.stampCount).toBe(1);
    wakes.dispose();
  });

  it("never exceeds the fleet capacity", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    wakes.update({ ...FRAME });
    for (let i = 0; i < WAKE_MAX_STAMPS + 40; i += 1) {
      wakes.stamp(47.6, 38.9, 1, 0, 1, 1);
    }
    expect(wakes.stampCount).toBe(WAKE_MAX_STAMPS);
    wakes.dispose();
  });
});

describe("garden wakes passes", () => {
  function advance(
    wakes: ReturnType<typeof createGardenWakes>,
    frames: number,
    overrides: Partial<GardenWakesFrame> = {},
  ) {
    for (let i = 0; i < frames; i += 1) {
      wakes.update({ ...FRAME, ...overrides });
    }
  }

  it("runs feedback + stamp as two offscreen renders and ping-pongs the front", () => {
    const passes: {
      autoClear: boolean;
      feedbackVisible: boolean;
      stampEquation: number;
      stampCount: number;
      stampEnergy: number;
      stampVisible: boolean;
    }[] = [];
    const renderer = rendererStub((scene, autoClear) => {
      const stamp = scene.children.find(
        (child) => child instanceof InstancedMesh,
      ) as InstancedMesh;
      const feedback = scene.children.find(
        (child) => child instanceof Mesh && !(child instanceof InstancedMesh),
      ) as Mesh;
      const params = stamp.geometry.getAttribute("aParam");
      let stampEnergy = 0;
      if (stamp.visible) {
        for (let index = 0; index < stamp.count; index += 1) {
          stampEnergy += params.getX(index);
        }
      }
      passes.push({
        autoClear,
        feedbackVisible: feedback.visible,
        stampEquation: (stamp.material as ShaderMaterial).blendEquation,
        stampCount: stamp.count,
        stampEnergy,
        stampVisible: stamp.visible,
      });
    });
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1); // establishes the window, no passes yet
    expect(renderer.render).toHaveBeenCalledTimes(0);

    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    const before = wakes.texture;
    advance(wakes, 1);
    // One feedback pass + one stamp pass (stamps were pending).
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(passes).toEqual([
      {
        autoClear: true,
        feedbackVisible: true,
        stampEquation: MaxEquation,
        stampCount: 1,
        stampEnergy: 0,
        stampVisible: false,
      },
      {
        autoClear: false,
        feedbackVisible: false,
        stampEquation: MaxEquation,
        stampCount: 1,
        stampEnergy: expect.closeTo(0.9, 6),
        stampVisible: true,
      },
    ]);
    // CPU pass composition sentinel: one queued stamp contributes its energy
    // once, never once in feedback plus once in the blended pass.
    expect(passes.reduce((sum, pass) => sum + pass.stampEnergy, 0)).toBeCloseTo(0.9);
    expect(wakes.active).toBe(true);
    // The ping-pong swapped the front texture the water samples.
    expect(wakes.texture).not.toBe(before);
    // Stamps were consumed.
    expect(wakes.stampCount).toBe(0);

    // No new stamps: the decay still advances (feedback only, one render).
    advance(wakes, 1);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    wakes.dispose();
  });

  it("resets fresh and runtime reduced motion to the same canonical empty field", () => {
    const freshRenderer = rendererStub();
    const fresh = createGardenWakes(freshRenderer as never);
    advance(fresh, 1, { reducedMotion: true });
    expect(fresh.active).toBe(false);
    expect(fresh.stampCount).toBe(0);
    expect(freshRenderer.clear).toHaveBeenCalledTimes(2);
    expect(freshRenderer.render).toHaveBeenCalledTimes(0);

    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 1);
    expect(wakes.active).toBe(true);
    renderer.render.mockClear();
    renderer.clear.mockClear();

    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 3, { reducedMotion: true });
    expect(renderer.render).toHaveBeenCalledTimes(0);
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    expect(wakes.active).toBe(false);
    expect(wakes.stampCount).toBe(0);
    expect(wakes.centerX).toBe(fresh.centerX);
    expect(wakes.centerY).toBe(fresh.centerY);
    expect(wakes.halfSize).toBe(fresh.halfSize);
    // Holding reduced motion is free after the transition reset.
    renderer.clear.mockClear();
    advance(wakes, 3, { reducedMotion: true });
    expect(renderer.clear).toHaveBeenCalledTimes(0);
    wakes.dispose();
    fresh.dispose();
  });

  it("draws reduced-motion hull contact statically, redrawing only when a footprint moves", () => {
    // Whether the feedback (decay) quad was drawn in each offscreen render.
    const feedbackDrawn: boolean[] = [];
    const renderer = rendererStub((scene) => feedbackDrawn.push(scene.children.some(
      (child) => child instanceof Mesh && !(child instanceof InstancedMesh) && child.visible,
    )));
    const wakes = createGardenWakes(renderer as never);
    const frameWithContact = (x = 47.6) => {
      advance(wakes, 1, { reducedMotion: true });
      wakes.stampContact(x, 38.9, 1, 0, 3, 1, 1);
      wakes.renderStaticContact();
    };
    frameWithContact();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    // Stamps only: the feedback quad (decay) never runs under reduced motion.
    expect(feedbackDrawn).toEqual([false]);
    expect(wakes.stampCount).toBe(0);
    // A still fleet: the field already holds this footprint, so nothing runs.
    renderer.clear.mockClear();
    frameWithContact();
    expect(renderer.clear).toHaveBeenCalledTimes(0);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(wakes.stampCount).toBe(0);
    // A moved hull: cleared once and redrawn.
    frameWithContact(49);
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    // Outside reduced motion the static path does nothing.
    advance(wakes, 1);
    wakes.stampContact(47.6, 38.9, 1, 0, 3, 1, 1);
    wakes.renderStaticContact();
    expect(renderer.render).toHaveBeenCalledTimes(2);
    wakes.dispose();
  });

  it("retains the target through the tier fade, then clears once while invisible", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 1);
    expect(wakes.active).toBe(true);
    renderer.render.mockClear();
    renderer.clear.mockClear();

    advance(wakes, 1, { tier: "recovery", visibleStrength: 1 });
    expect(renderer.clear).toHaveBeenCalledTimes(0);
    expect(renderer.render).toHaveBeenCalledTimes(0);
    expect(wakes.active).toBe(true);
    advance(wakes, 3, { tier: "recovery", visibleStrength: 0.08 });
    expect(renderer.clear).toHaveBeenCalledTimes(0);
    expect(wakes.active).toBe(true);

    advance(wakes, 1, { tier: "recovery", visibleStrength: 0.009 });
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    expect(wakes.active).toBe(false);
    renderer.clear.mockClear();
    // Subsequent recovery frames and an empty ascent cost nothing.
    advance(wakes, 3, { tier: "recovery" });
    advance(wakes, 1, { tier: "full" });
    expect(renderer.clear).toHaveBeenCalledTimes(0);
    expect(renderer.render).toHaveBeenCalledTimes(0);

    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 1, { tier: "full" });
    expect(wakes.active).toBe(true);
    wakes.dispose();
  });

  it("reprojects an active field across a smooth zoom ramp without clearing", () => {
    const uvScales: number[] = [];
    const renderer = rendererStub((scene) => {
      const feedback = scene.children.find(
        (child) => child instanceof Mesh && !(child instanceof InstancedMesh),
      ) as Mesh<never, ShaderMaterial>;
      if (feedback.visible) {
        uvScales.push(feedback.material.uniforms.uUvScale!.value as number);
      }
    });
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 1);
    renderer.clear.mockClear();
    uvScales.length = 0;

    const widths = [61, 67, 74, 82, 92, 108, 130];
    let previousHalfSize = wakes.halfSize;
    const expectedScales: number[] = [];
    for (const viewHalfWidth of widths) {
      const next = planWakeWindow(
        {
          centerX: wakes.centerX,
          centerY: wakes.centerY,
          halfSize: previousHalfSize,
        },
        FRAME.targetX,
        FRAME.targetZ,
        viewHalfWidth,
      ).window;
      expectedScales.push(next.halfSize / previousHalfSize);
      advance(wakes, 1, { viewHalfWidth });
      previousHalfSize = next.halfSize;
      expect(wakes.active).toBe(true);
    }

    expect(renderer.clear).toHaveBeenCalledTimes(0);
    expect(uvScales).toHaveLength(widths.length);
    uvScales.forEach((scale, index) => {
      expect(scale).toBeCloseTo(expectedScales[index]!, 8);
    });
    expect(uvScales.some((scale) => Math.abs(scale - 1) > 0.01)).toBe(true);
    wakes.dispose();
  });

  it("clears queued old-content stamps before a replacement epoch advances", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 1);
    expect(wakes.active).toBe(true);

    // This stamp belongs to the outgoing content but has not rendered yet.
    wakes.stamp(47.6, 38.9, -1, 0, 1, 1.2);
    expect(wakes.stampCount).toBe(1);
    renderer.clear.mockClear();
    renderer.render.mockClear();
    wakes.reset();
    wakes.reset();
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    expect(wakes.active).toBe(false);
    expect(wakes.stampCount).toBe(0);

    // Advancing the new epoch cannot render the discarded stamp.
    advance(wakes, 1);
    expect(renderer.render).toHaveBeenCalledTimes(0);
    wakes.stamp(47.6, 38.9, 0, 1, 0.7, 1);
    advance(wakes, 1);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(wakes.active).toBe(true);
    wakes.dispose();
  });

  it("keeps the slick until its horizon, then clears and sleeps with no hulls in the window", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 4, 1.4, 0.9);
    advance(wakes, 1);
    renderer.clear.mockClear();
    // 59 s of field time (deltas clamp to 0.25 s): G may still hold a lane.
    advance(wakes, 236, { deltaSeconds: 0.25 });
    expect(wakes.active).toBe(true);
    expect(renderer.clear).toHaveBeenCalledTimes(0);
    // Past the 60 s horizon the field is provably empty.
    advance(wakes, 8, { deltaSeconds: 0.25 });
    expect(wakes.active).toBe(false);
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    wakes.dispose();
  });

  it("stays awake on contact stamps alone and sleeps the frame they stop", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 4, 1.4, 0.9);
    advance(wakes, 1);
    // Moored hulls keep writing B every frame long after the last wake.
    for (let frame = 0; frame < 280; frame += 1) {
      wakes.stampContact(47.6, 38.9, 0, 1, 4, 1.4, 1);
      advance(wakes, 1, { deltaSeconds: 0.25 });
    }
    expect(wakes.active).toBe(true);
    renderer.render.mockClear();
    renderer.clear.mockClear();
    // Last frame's B is the only content left; clearing it is exact.
    advance(wakes, 1, { deltaSeconds: 0.25 });
    expect(wakes.active).toBe(false);
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenCalledTimes(0);
    wakes.dispose();
  });
});

describe("wake field decay and residue (K8)", () => {
  /** Rounds a non-negative value to IEEE half precision. */
  function toHalf(value: number, mode: "nearest" | "truncate"): number {
    if (value <= 0) return 0;
    const ulp = 2 ** (Math.max(-14, Math.floor(Math.log2(value))) - 10);
    const units = value / ulp;
    return (mode === "nearest" ? Math.round(units) : Math.floor(units)) * ulp;
  }

  /**
   * Runs one uniform texel of the feedback pass through `seconds` at `hz`,
   * storing to half precision each frame as the GPU does, and samples it.
   */
  function simulate(
    channel: "x" | "y" | "z",
    hz: number,
    seconds: number,
    rounding: "nearest" | "truncate" | "exact",
  ): number {
    const pass: WakeDecayPass = {
      decay: { x: 0, y: 0, z: 0, w: 0 },
      diffuse: { x: 0, y: 0, z: 0, w: 0 },
      floor: { x: 0, y: 0, z: 0, w: 0 },
    };
    const clock = { slickPendingSeconds: 0 };
    let value = 1;
    const frames = Math.round(seconds * hz);
    for (let frame = 0; frame < frames; frame += 1) {
      planWakeDecayPass(clock, 1 / hz, pass);
      const next = Math.max(Math.min(value, 1) * pass.decay[channel] - pass.floor[channel], 0);
      value = rounding === "exact" ? next : toHalf(next, rounding);
    }
    return value;
  }

  for (const hz of [60, 120]) {
    for (const rounding of ["nearest", "truncate"] as const) {
      it(`keeps a slick visible for 25 s and leaves ≤ 1 % at 60 s (${hz} Hz, HalfFloat ${rounding})`, () => {
        expect(simulate("y", hz, 25, rounding)).toBeGreaterThanOrEqual(WAKE_SLICK_VISIBLE * 2);
        expect(simulate("y", hz, 60, rounding)).toBeLessThanOrEqual(0.01);
        expect(simulate("y", hz, 61, rounding)).toBe(0);
      });
    }
  }

  it("decays the slick identically at 60 and 120 Hz", () => {
    for (const seconds of [5, 12.5, 25, 40]) {
      expect(simulate("y", 120, seconds, "exact")).toBeCloseTo(simulate("y", 60, seconds, "exact"), 2);
    }
  });

  it("clears foam by its horizon and holds hull contact for one pass only", () => {
    for (const hz of [60, 120]) {
      expect(simulate("x", hz, 3, "nearest")).toBeGreaterThan(0.2);
      expect(simulate("x", hz, WAKE_FOAM_HORIZON_SECONDS + 0.1, "nearest")).toBe(0);
      expect(simulate("z", hz, 1 / hz, "nearest")).toBe(0);
    }
  });
});

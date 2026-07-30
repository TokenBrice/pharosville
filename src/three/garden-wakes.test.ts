import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Mesh,
  type Scene,
  type ShaderMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createGardenWakes,
  planWakeWindow,
  WAKE_MAX_STAMPS,
  type GardenWakesFrame,
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
      stampBlending: number;
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
        stampBlending: (stamp.material as ShaderMaterial).blending,
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
        stampBlending: AdditiveBlending,
        stampCount: 1,
        stampEnergy: 0,
        stampVisible: false,
      },
      {
        autoClear: false,
        feedbackVisible: false,
        stampBlending: AdditiveBlending,
        stampCount: 1,
        stampEnergy: expect.closeTo(0.9, 6),
        stampVisible: true,
      },
    ]);
    // CPU pass composition sentinel: one queued stamp contributes its energy
    // once, never once in feedback plus once in the additive pass.
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

  it("clears and sleeps after the idle timeout with no ships moving", () => {
    const renderer = rendererStub();
    const wakes = createGardenWakes(renderer as never);
    advance(wakes, 1);
    wakes.stamp(47.6, 38.9, 1, 0, 0.9, 1);
    advance(wakes, 1);
    renderer.clear.mockClear();
    // 15 idle seconds at 1s deltas: past the 14s timeout.
    advance(wakes, 15, { deltaSeconds: 1 });
    expect(wakes.active).toBe(false);
    expect(renderer.clear).toHaveBeenCalledTimes(2);
    wakes.dispose();
  });
});

import { Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { DAY_CYCLE_SKY_PRESETS, dayCyclePhase } from "./garden-day-cycle";
import { countDrawableObjects } from "./garden-util";
import { createGardenHorizon } from "./garden-horizon";

const FRAME = { targetX: 47.6, targetZ: 38.9, tier: "full" as const };

describe("garden horizon (Z4 shakkei)", () => {
  it("is two merged aerial bands (2 draw calls) holding three silhouettes", () => {
    const horizon = createGardenHorizon();
    expect(horizon.root.name).toBe("garden-horizon");
    expect(horizon.silhouetteCount).toBe(3);
    expect(horizon.drawCallCount).toBe(2);
    expect(countDrawableObjects(horizon.root)).toBe(2);
    expect(horizon.root.children.map((child) => child.name)).toEqual([
      "garden-horizon-near",
      "garden-horizon-far",
    ]);
    expect(horizon.triangleCount).toBeGreaterThan(0);
    expect(horizon.triangleCount).toBeLessThan(100);
    horizon.dispose();
  });

  it("re-anchors to the camera target like the sky dome", () => {
    const horizon = createGardenHorizon();
    horizon.update(dayCyclePhase(11), FRAME);
    expect(horizon.root.position.toArray()).toEqual([47.6, 0, 38.9]);
    horizon.update(dayCyclePhase(11), { ...FRAME, targetX: 10, targetZ: -4 });
    expect(horizon.root.position.toArray()).toEqual([10, 0, -4]);
    horizon.dispose();
  });

  it("blends band colors from the C1 sky presets (no authored hex)", () => {
    const horizon = createGardenHorizon();
    const [near, far] = horizon.root.children as Mesh[];
    const nearColor = (near!.material as MeshBasicMaterial).color;
    const farColor = (far!.material as MeshBasicMaterial).color;

    horizon.update(dayCyclePhase(11), FRAME); // day
    const dayNear = DAY_CYCLE_SKY_PRESETS.day.horizon.clone().lerp(DAY_CYCLE_SKY_PRESETS.day.zenith, 1);
    const dayFar = DAY_CYCLE_SKY_PRESETS.day.horizon.clone().lerp(DAY_CYCLE_SKY_PRESETS.day.zenith, 0.92);
    expect(nearColor.r).toBeCloseTo(dayNear.r, 3);
    expect(nearColor.g).toBeCloseTo(dayNear.g, 3);
    expect(nearColor.b).toBeCloseTo(dayNear.b, 3);
    expect(farColor.r).toBeCloseTo(dayFar.r, 3);

    horizon.update(dayCyclePhase(23), FRAME); // night
    const nightNear = DAY_CYCLE_SKY_PRESETS.night.horizon.clone().lerp(DAY_CYCLE_SKY_PRESETS.night.zenith, 0.35);
    expect(nearColor.r).toBeCloseTo(nightNear.r, 3);
    expect(nearColor.b).toBeCloseTo(nightNear.b, 3);

    // The near band keeps more value contrast than the far (dissolving) band.
    horizon.update(dayCyclePhase(11), FRAME);
    const horizonDay = DAY_CYCLE_SKY_PRESETS.day.horizon;
    const distanceTo = (color: { r: number; g: number; b: number }) => Math.hypot(
      color.r - horizonDay.r,
      color.g - horizonDay.g,
      color.b - horizonDay.b,
    );
    expect(distanceTo(nearColor)).toBeGreaterThan(distanceTo(farColor));
    horizon.dispose();
  });

  it("joins the tier ladder at balanced+", () => {
    const horizon = createGardenHorizon();
    const phase = dayCyclePhase(11);
    for (const tier of ["full", "balanced"] as const) {
      horizon.update(phase, { ...FRAME, tier });
      expect(horizon.root.visible).toBe(true);
    }
    for (const tier of ["recovery", "constrained"] as const) {
      horizon.update(phase, { ...FRAME, tier });
      expect(horizon.root.visible).toBe(false);
    }
    horizon.dispose();
  });

  it("is deterministic across creations", () => {
    const first = createGardenHorizon();
    const second = createGardenHorizon();
    const positionsOf = (root: typeof first.root) => (
      (root.children[0] as Mesh).geometry.getAttribute("position").array
    );
    expect(Array.from(positionsOf(first.root))).toEqual(Array.from(positionsOf(second.root)));
    first.dispose();
    second.dispose();
  });
});

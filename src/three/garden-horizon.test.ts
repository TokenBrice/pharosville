import { Color, Mesh, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  blendDayCycleColor,
  DAY_CYCLE_SKY_PRESETS,
  dayCyclePhase,
} from "./garden-day-cycle";
import { countDrawableObjects } from "./garden-util";
import {
  createGardenHorizon,
  GARDEN_HORIZON_VALUE_SCALES,
} from "./garden-horizon";

const FRAME = { targetX: 47.6, targetZ: 38.9, tier: "full" as const };

describe("garden horizon", () => {
  it("merges three base-connected borrowed ridges into one unlit draw", () => {
    const horizon = createGardenHorizon();
    expect(horizon.root.name).toBe("garden-horizon");
    expect(horizon.silhouetteCount).toBe(3);
    expect(horizon.drawCallCount).toBe(1);
    expect(horizon.triangleCount).toBe(60);
    expect(countDrawableObjects(horizon.root)).toBe(1);
    const mesh = horizon.root.children[0] as Mesh;
    expect(mesh.material).toBeInstanceOf(ShaderMaterial);
    const positions = mesh.geometry.getAttribute("position");
    // Each eleven-point strip alternates base/ridge vertices. Both endpoints
    // return to the base, so no layer can become a closed floating pill.
    for (let layer = 0; layer < 3; layer += 1) {
      const start = layer * 22;
      expect(positions.getY(start)).toBe(-18);
      expect(positions.getY(start + 1)).toBe(0);
      expect(positions.getY(start + 20)).toBe(-18);
      expect(positions.getY(start + 21)).toBe(0);
    }
    horizon.dispose();
  });

  it("stays 2–4% off the phase fog at day, dawn, dusk, and night", () => {
    const horizon = createGardenHorizon();
    const material = (horizon.root.children[0] as Mesh).material as ShaderMaterial;
    for (const hour of [12, 6, 19, 22]) {
      const phase = dayCyclePhase(hour);
      horizon.update(phase, FRAME);
      const color = material.uniforms.uFogColor.value as Color;
      const expected = new Color();
      blendDayCycleColor(
        expected,
        DAY_CYCLE_SKY_PRESETS.night.fog,
        DAY_CYCLE_SKY_PRESETS.dusk.fog,
        DAY_CYCLE_SKY_PRESETS.day.fog,
        phase.dusk,
        phase.daylight,
      );
      expect(color.getHex()).toBe(expected.getHex());
      for (const scale of GARDEN_HORIZON_VALUE_SCALES) {
        expect(1 - scale).toBeGreaterThanOrEqual(0.02);
        expect(1 - scale).toBeLessThanOrEqual(0.040_001);
      }
      expect(horizon.root.visible).toBe(true);
    }
    horizon.update(dayCyclePhase(12), { ...FRAME, tier: "constrained" });
    expect(horizon.root.visible).toBe(false);
    horizon.dispose();
  });
});

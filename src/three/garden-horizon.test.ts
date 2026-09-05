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
  GARDEN_HORIZON_DISPLACEMENT,
  GARDEN_HORIZON_VALUE_SCALES,
} from "./garden-horizon";

const FRAME = { targetX: 47.6, targetZ: 38.9, tier: "full" as const };

describe("garden horizon", () => {
  it("merges three base-connected borrowed ridges into one unlit draw", () => {
    const horizon = createGardenHorizon();
    expect(horizon.root.name).toBe("garden-horizon");
    expect(horizon.silhouetteCount).toBe(3);
    expect(horizon.mistBandCount).toBe(1);
    expect(horizon.drawCallCount).toBe(1);
    expect(horizon.triangleCount).toBe(62);
    expect(countDrawableObjects(horizon.root)).toBe(1);
    const mesh = horizon.root.children[0] as Mesh;
    expect(mesh.material).toBeInstanceOf(ShaderMaterial);
    const positions = mesh.geometry.getAttribute("position");
    expect((mesh.material as ShaderMaterial).transparent).toBe(true);
    expect((mesh.material as ShaderMaterial).depthWrite).toBe(false);
    expect((mesh.material as ShaderMaterial).depthTest).toBe(true);
    expect(mesh.geometry.getAttribute("aRelief")).toBeDefined();
    expect(mesh.geometry.getAttribute("aKind")).toBeDefined();
    expect(mesh.geometry.getAttribute("aVertical")).toBeDefined();
    // Each eleven-point strip alternates base/ridge vertices. Both endpoints
    // return to transparent zero relief, so no layer can become a closed pill.
    for (let layer = 0; layer < 3; layer += 1) {
      const start = layer * 22;
      expect(positions.getY(start)).toBe(-7);
      expect(positions.getY(start + 1)).toBe(0);
      expect(positions.getY(start + 20)).toBe(-7);
      expect(positions.getY(start + 21)).toBe(0);
    }
    // The shader derives its value scales from the exported constant — it
    // once hardcoded its own copy and the two drifted apart silently.
    const shader = (mesh.material as ShaderMaterial).fragmentShader;
    for (const scale of GARDEN_HORIZON_VALUE_SCALES) {
      expect(shader).toContain(scale.toFixed(2));
    }
    expect(Math.max(...Array.from(positions.array).filter((_, index) => index % 3 === 1)))
      .toBeGreaterThan(18);
    expect(GARDEN_HORIZON_DISPLACEMENT).toContain("backdrop ridge");
    horizon.dispose();
  });

  it("layers below the phase fog at day, dawn, dusk, and night", () => {
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
        // Warm-village B3 (2026-09-05): the old 2–4% whisper graded the
        // ridges into one flat strip; each now steps ~10% further below the
        // fog value (10/20/30% far→near) so the three planes actually layer.
        expect(1 - scale).toBeGreaterThanOrEqual(0.099_999);
        expect(1 - scale).toBeLessThanOrEqual(0.300_001);
      }
      // Far ridge closest to the fog, near ridge darkest — aerial order.
      expect(GARDEN_HORIZON_VALUE_SCALES[0]).toBeGreaterThan(GARDEN_HORIZON_VALUE_SCALES[1]!);
      expect(GARDEN_HORIZON_VALUE_SCALES[1]).toBeGreaterThan(GARDEN_HORIZON_VALUE_SCALES[2]!);
      expect(horizon.root.visible).toBe(true);
    }
    horizon.update(dayCyclePhase(12), { ...FRAME, tier: "constrained" });
    expect(horizon.root.visible).toBe(false);
    horizon.dispose();
  });
});

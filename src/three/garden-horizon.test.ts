import { describe, expect, it } from "vitest";
import { dayCyclePhase } from "./garden-day-cycle";
import { countDrawableObjects } from "./garden-util";
import { createGardenHorizon } from "./garden-horizon";

const FRAME = { targetX: 47.6, targetZ: 38.9, tier: "full" as const };

describe("garden horizon", () => {
  it("contains no drawable silhouette geometry", () => {
    const horizon = createGardenHorizon();
    expect(horizon.root.name).toBe("garden-horizon");
    expect(horizon.root.children).toHaveLength(0);
    expect(horizon.silhouetteCount).toBe(0);
    expect(horizon.drawCallCount).toBe(0);
    expect(horizon.triangleCount).toBe(0);
    expect(countDrawableObjects(horizon.root)).toBe(0);
    horizon.dispose();
  });

  it("preserves the scene-owner lifecycle without becoming visible", () => {
    const horizon = createGardenHorizon();
    for (const tier of [
      "full",
      "balanced",
      "interaction",
      "recovery",
      "constrained",
    ] as const) {
      horizon.update(dayCyclePhase(11), { ...FRAME, tier });
      expect(horizon.root.position.toArray()).toEqual([47.6, 0, 38.9]);
      expect(horizon.root.visible).toBe(false);
    }
    horizon.dispose();
  });
});

import { describe, expect, it } from "vitest";
import { seawallSprayAnchorsFromPlacements, seawallSprayPulse } from "./shoreline";

describe("seawall spray anchors", () => {
  it("derives deterministic plume anchors from seawall render placements", () => {
    const placements = [
      { rotation: -26.5, tile: { x: 15.4, y: 25.3 } },
      { rotation: -26.5, tile: { x: 15.4, y: 25.3 } },
      { rotation: 26.5, tile: { x: 20.4, y: 36.6 } },
      { rotation: -26.5, tile: { x: 42.1, y: 26.3 } },
    ];

    const anchors = seawallSprayAnchorsFromPlacements(placements, (tile) => tile.x === 42.1 ? 2 : 0);

    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toMatchObject({ phase: 0, tile: { x: 15.4, y: 25.3 } });
    expect(anchors[1]?.phase).toBeGreaterThan(anchors[0]!.phase);
    expect(anchors[2]!.intensity).toBeLessThan(anchors[0]!.intensity);
    expect(anchors[2]!.intensity).toBeGreaterThanOrEqual(0.18);
  });

  it("uses a fixed reduced-motion spray pulse", () => {
    expect(seawallSprayPulse(0.2, 1, true)).toBe(seawallSprayPulse(0.2, 20, true));
    expect(seawallSprayPulse(0.2, 1, false)).not.toBe(seawallSprayPulse(0.2, 20, false));
  });
});

import { describe, expect, it } from "vitest";
import { createGardenCueMarker } from "./garden-cue-marker";

describe("garden cue marker", () => {
  it("is one compact depth-tested waterline ring", () => {
    const marker = createGardenCueMarker("#d8eee7", 0.6);
    expect(marker.name).toBe("garden-cue-marker");
    expect(marker.children).toHaveLength(0);
    expect(marker.material.depthTest).toBe(true);
    expect(marker.material.depthWrite).toBe(false);
    expect(marker.geometry.parameters.thetaSegments).toBe(32);
    marker.geometry.dispose();
    marker.material.dispose();
  });
});

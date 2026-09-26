import { describe, expect, it } from "vitest";
import { createNiwakiPine, niwakiDefaultBranches } from "./garden-niwaki";

describe("niwaki kuromatsu generator", () => {
  it("builds flat-bottomed pads that are dark beneath and lit on the crown", () => {
    const pine = createNiwakiPine({ seed: "test.pine", height: 9 });
    const position = pine.geometry.getAttribute("position");
    const color = pine.geometry.getAttribute("color");
    expect(pine.pads.length).toBeGreaterThanOrEqual(5);
    for (const pad of pine.pads) {
      const base = pad.center.y - pad.halfSize.y;
      let underside = 0;
      let undersideCount = 0;
      let crown = 0;
      let crownCount = 0;
      for (let index = 0; index < position.count; index += 1) {
        const dx = position.getX(index) - pad.center.x;
        const dz = position.getZ(index) - pad.center.z;
        if (Math.hypot(dx, dz) > pad.halfSize.z * 0.5) continue;
        const y = position.getY(index);
        const luma = color.getX(index) + color.getY(index) + color.getZ(index);
        if (Math.abs(y - base) < pad.halfSize.y * 0.25) {
          underside += luma;
          undersideCount += 1;
        } else if (y > pad.center.y + pad.halfSize.y * 0.6) {
          crown += luma;
          crownCount += 1;
        }
      }
      expect(undersideCount, "pad has a flat underside").toBeGreaterThan(0);
      expect(crownCount, "pad has a domed crown").toBeGreaterThan(0);
      expect(underside / undersideCount).toBeLessThan(crown / crownCount * 0.7);
      // Flattened lobes: thickness over half-width stays in 0.25–0.42.
      expect(pad.halfSize.y / pad.halfSize.x).toBeGreaterThanOrEqual(0.25);
      expect(pad.halfSize.y / pad.halfSize.x).toBeLessThanOrEqual(0.42);
    }
    // Pads step down the tree: the lowest tier pad is larger than the apex pad.
    const tiers = niwakiDefaultBranches(9, "test.pine");
    expect(tiers[0]!.padSize).toBeGreaterThan(tiers[tiers.length - 2]!.padSize);
    pine.geometry.dispose();
  });

  it("is smooth-shaded: pad and bark vertices are shared, not per-face", () => {
    const pine = createNiwakiPine({ seed: "test.smooth", height: 6 });
    const vertices = pine.geometry.getAttribute("position").count;
    expect(pine.geometry.index).not.toBeNull();
    // Flat shading would need three vertices per triangle.
    expect(vertices).toBeLessThan(pine.triangleCount * 1.2);
    pine.geometry.dispose();
  });

  it("is deterministic per seed", () => {
    const a = createNiwakiPine({ seed: "same", height: 7 });
    const b = createNiwakiPine({ seed: "same", height: 7 });
    const c = createNiwakiPine({ seed: "other", height: 7 });
    expect(Array.from(b.geometry.getAttribute("position").array)).toEqual(Array.from(a.geometry.getAttribute("position").array));
    expect(c.geometry.getAttribute("position").count === a.geometry.getAttribute("position").count
      && Array.from(c.geometry.getAttribute("position").array).every((value, index) => value === a.geometry.getAttribute("position").array[index]))
      .toBe(false);
    for (const pine of [a, b, c]) pine.geometry.dispose();
  });
});

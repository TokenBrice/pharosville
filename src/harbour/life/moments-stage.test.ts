import { describe, expect, it } from "vitest";
import { MOMENT_DURATION_MS } from "../model/moments";
import { flareAt } from "./moments-stage";

describe("depeg moment: the reef beacon flares", () => {
  it("flares three times, then is dark, well inside the depeg moment", () => {
    const peaks = [0.55, 2.75, 4.95].map(flareAt);
    for (const p of peaks) expect(p).toBeGreaterThan(0.99);
    expect(flareAt(-1)).toBe(0);
    expect(flareAt(1.5)).toBe(0);
    expect(flareAt(6.7)).toBe(0);
    expect(6.6 * 1000).toBeLessThanOrEqual(MOMENT_DURATION_MS.depeg!);
  });
});

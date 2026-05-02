import { describe, expect, it } from "vitest";
import { SEAWALL_RENDER_PLACEMENTS } from "./seawall";

describe("seawall west harbor run", () => {
  it("connects the lighthouse apron to the BSC shoulder without a gap", () => {
    const westHarborRun = SEAWALL_RENDER_PLACEMENTS
      .filter((placement) => (
        placement.rotation < 0
        && placement.tile.x >= 15
        && placement.tile.x <= 21
        && placement.tile.y >= 25
        && placement.tile.y <= 37
      ))
      .toSorted((a, b) => a.tile.y - b.tile.y);

    expect(westHarborRun.length).toBeGreaterThanOrEqual(10);

    expect(westHarborRun[0]?.tile.x).toBeCloseTo(15.4, 1);
    expect(westHarborRun[0]?.tile.y).toBeCloseTo(25.3, 1);
    expect(westHarborRun.at(-1)?.tile.x).toBeCloseTo(20.4, 1);
    expect(westHarborRun.at(-1)?.tile.y).toBeCloseTo(36.6, 1);

    for (let index = 1; index < westHarborRun.length; index += 1) {
      const prev = westHarborRun[index - 1]!;
      const curr = westHarborRun[index]!;
      expect(Math.hypot(curr.tile.x - prev.tile.x, curr.tile.y - prev.tile.y)).toBeLessThan(1.2);
    }
  });
});

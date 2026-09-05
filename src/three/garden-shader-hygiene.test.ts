import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GLSL smoothstep portability", () => {
  it.each([
    "garden-water.ts",
    "garden-sky.ts",
    "garden-sky-billboards.ts",
    "garden-beacon-fire.ts",
  ])("keeps literal edges strictly ascending in %s", (file) => {
    const source = readFileSync(`src/three/${file}`, "utf8");
    // Computed edges still need review; this catches the descending literal
    // ramps that Metal accepted even though GLSL leaves their result undefined.
    const calls = [...source.matchAll(/\bsmoothstep\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(Number(call[1]), `${file}: ${call[0]}`).toBeLessThan(Number(call[2]));
    }
  });
});

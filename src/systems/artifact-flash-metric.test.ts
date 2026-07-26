import { describe, expect, it } from "vitest";
// @ts-expect-error The preview helper is runtime-neutral ESM without TypeScript declarations.
import { analyzeArtifactFlashFrames } from "../../scripts/pharosville/artifact-flash-metric.mjs";

const frame = (values: number[]) => ({ height: 2, luminance: values, width: 4 });

describe("analyzeArtifactFlashFrames", () => {
  it("ignores localized ship and water motion", () => {
    const result = analyzeArtifactFlashFrames([
      frame([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]),
      frame([0.2, 0.38, 0.2, 0.2, 0.2, 0.2, 0.12, 0.2]),
    ]);
    expect(result.flash).toBe(false);
  });

  it("flags a single-frame full-area luminance jump", () => {
    const calm = frame([0.2, 0.22, 0.2, 0.22, 0.2, 0.22, 0.2, 0.22]);
    const flash = frame([0.48, 0.5, 0.48, 0.5, 0.48, 0.5, 0.48, 0.5]);
    const result = analyzeArtifactFlashFrames([calm, flash, calm]);
    expect(result.flash).toBe(true);
    expect(result.transitions.filter(
      (transition: { flash: boolean }) => transition.flash,
    )).toHaveLength(2);
  });

  it("flags excessive pale beam or light coverage in a stable frame", () => {
    const result = analyzeArtifactFlashFrames([
      frame([0.9, 0.9, 0.9, 0.9, 0.2, 0.2, 0.2, 0.2]),
    ], {
      brightCoverageLimit: 0.35,
      brightThreshold: 0.82,
    });
    expect(result.flash).toBe(false);
    expect(result.excessiveBrightCoverage).toBe(true);
    expect(result.frameCoverage[0].brightCoverage).toBe(0.5);
  });
});

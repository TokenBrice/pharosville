/**
 * Detect frame-wide luminance jumps without treating ordinary local motion as
 * a flash. Inputs are deliberately tiny downsampled luminance fields; callers
 * own image decoding so this helper stays dependency-free and unit-testable.
 */
export function analyzeArtifactFlashFrames(frames, options = {}) {
  const pixelDelta = options.pixelDelta ?? 0.1;
  const coverageLimit = options.coverageLimit ?? 0.65;
  const meanDeltaLimit = options.meanDeltaLimit ?? 0.06;
  const brightThreshold = options.brightThreshold ?? 0.55;
  const brightCoverageLimit = options.brightCoverageLimit ?? 0.15;
  const frameCoverage = frames.map((frame, index) => {
    const brightPixels = frame.luminance.filter((value) => value >= brightThreshold).length;
    const brightCoverage = brightPixels / Math.max(1, frame.luminance.length);
    return {
      brightCoverage,
      excessiveBrightCoverage: brightCoverage >= brightCoverageLimit,
      frame: index,
    };
  });
  const transitions = [];
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1];
    const after = frames[index];
    if (
      before.width !== after.width
      || before.height !== after.height
      || before.luminance.length !== after.luminance.length
    ) {
      throw new Error("Artifact flash frames must share one sample grid.");
    }
    let bright = 0;
    let dark = 0;
    let signedTotal = 0;
    for (let pixel = 0; pixel < before.luminance.length; pixel += 1) {
      const delta = after.luminance[pixel] - before.luminance[pixel];
      signedTotal += delta;
      if (delta >= pixelDelta) bright += 1;
      if (delta <= -pixelDelta) dark += 1;
    }
    const count = Math.max(1, before.luminance.length);
    const brightCoverage = bright / count;
    const darkCoverage = dark / count;
    const meanDelta = signedTotal / count;
    const coverage = Math.max(brightCoverage, darkCoverage);
    transitions.push({
      brightCoverage,
      darkCoverage,
      flash: coverage >= coverageLimit && Math.abs(meanDelta) >= meanDeltaLimit,
      from: index - 1,
      meanDelta,
      to: index,
    });
  }
  return {
    excessiveBrightCoverage: frameCoverage.some((frame) => frame.excessiveBrightCoverage),
    frameCoverage,
    flash: transitions.some((transition) => transition.flash),
    transitions,
  };
}

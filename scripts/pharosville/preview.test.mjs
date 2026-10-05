import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(fileURLToPath(new URL("./preview.mjs", import.meta.url)), "utf8");
function loadFunction(name, nextName, globals) {
  const start = source.indexOf(`function ${name}(`);
  const asyncEnd = source.indexOf(`\nasync function ${nextName}(`, start);
  const end = asyncEnd >= 0 ? asyncEnd : source.indexOf(`\nfunction ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)}\n${name}`, globals);
}
const limits = { maxDrawCalls: 700, maxTriangles: 500_000, maxGeometries: 500, maxTextures: 72,
  maxP90Ms: 20, maxP95Ms: 20, maxGpuMs: null, requiredTier: "full" };
function gate(metrics, options = {}) {
  const process = { exitCode: 0 };
  const messages = [];
  const evaluate = loadFunction("evaluateAssertions", "waitForSettledStaticMetrics", {
    process, args: { reduced: false }, staticSettle: null, tailSweep: { continuous: true, p95: 90, windows: 10 },
    limits: { ...limits, ...options }, SKIP_EXIT_CODE: 78, TAIL_POLL_INTERVAL_MS: 800,
    round: (value) => value, console: { log: (...parts) => messages.push(parts.join(" ")), error: (...parts) => messages.push(parts.join(" ")) },
  });
  evaluate(metrics);
  return { code: process.exitCode, messages };
}
function evidenceMetrics(p95 = 16.7) {
  const representative = { p50: 16.7, p90: 16.7, p95, tier: "full", gpuTimings: { supported: true, disjoint: false, frameP95Ms: 3 } };
  return { shipsVisible: 100, samples: 120, tier: "full", p90: 90, p95: 90,
    calls: 240, triangles: 430_000, geometries: 180, textures: 50,
    performanceEvidence: { steadyState: { measured: true, p95, windows: 8, maxFrameMs: 18, representative, gpuTimings: representative.gpuTimings },
      frames: { steady: { calls: 240, triangles: 430_000, geometries: 180, textures: 50 },
        refresh: { calls: 400, triangles: 480_000, geometries: 185, textures: 52 } } },
  };
}

test("resting assertion ignores contaminated timing windows but never a slow resting tail", () => {
  assert.equal(gate(evidenceMetrics()).code, 0);
  const slow = gate(evidenceMetrics(33));
  assert.equal(slow.code, 1);
  assert.match(slow.messages.join("\n"), /p95 frame time 33ms/);
  const slowP90 = evidenceMetrics();
  slowP90.performanceEvidence.steadyState.representative.p90 = 25;
  assert.equal(gate(slowP90).code, 1);
});

test("refresh resource peaks remain under every unchanged hard cap", () => {
  for (const [field, value] of [["calls", 701], ["triangles", 500_001], ["geometries", 501], ["textures", 73]]) {
    const metrics = evidenceMetrics();
    metrics.performanceEvidence.frames.refresh[field] = value;
    const result = gate(metrics);
    assert.equal(result.code, 1, field);
    assert.match(result.messages.join("\n"), /including refresh frames/);
  }
});

test("missing steady telemetry is unmeasured and resting GPU ceilings remain enforced", () => {
  const missing = evidenceMetrics();
  missing.performanceEvidence.steadyState.measured = false;
  assert.equal(gate(missing).code, 78);
  missing.performanceEvidence.frames.refresh.triangles = 500_001;
  assert.equal(gate(missing).code, 1); // Missing resting timing cannot waive an observed hard-cap breach.
  const detached = evidenceMetrics();
  detached.performanceEvidence.frames.coverageBreaks = 1;
  assert.equal(gate(detached).code, 78);
  const missingGpu = evidenceMetrics();
  missingGpu.performanceEvidence.steadyState.representative.gpuTimings.supported = false;
  assert.equal(gate(missingGpu, { maxGpuMs: 12 }).code, 78);
  const slowGpu = evidenceMetrics();
  slowGpu.performanceEvidence.steadyState.representative.gpuTimings.frameP95Ms = 15;
  assert.equal(gate(slowGpu, { maxGpuMs: 12 }).code, 1);
});

test("legacy sweep keys still describe all windows, not rewritten percentiles", () => {
  const summarize = loadFunction("summarizeFrameTail", "printFrameTail", { TAIL_POLL_INTERVAL_MS: 800 });
  const reads = [{ samples: 120, p50: 16.7, p95: 16.7, p99: 17, maxFrameMs: 18 },
    { samples: 120, p50: 16.7, p95: 90, p99: 100, maxFrameMs: 120 }];
  const result = summarize(reads, 12_000);
  assert.equal(result.p95, 90);
  assert.equal(result.maxFrameMs, 120);
  assert.equal(result.windows, 2);
  assert.equal(result.measured, true);
  assert.equal(result.continuous, true);
  assert.match(source, /performanceEvidence,/);
  assert.match(source, /tailSweep,/);
  assert.ok(source.indexOf("await applyStrollCapture") < source.indexOf("const settledAtFrame"));
});

test("provoked refresh arms export independent resources and preserve the resting evidence", () => {
  assert.ok(source.includes("instruments.refresh = await reportRefreshCost(page)"));
  const start = source.indexOf("async function measureOneRefresh(");
  const arm = source.slice(start, source.indexOf("function profileRecorder(", start));
  assert.ok(arm.indexOf("__previewFrameEvidence?.begin()") < arm.indexOf("refreshState.openGate()"));
  assert.ok(arm.includes("FAIL: provoked refresh"));
  assert.ok(source.includes("warmupRound.resources, timingExcluded: true"));
  assert.ok(source.includes("page.clock-owned CPU frame intervals are not resting timing evidence"));
});

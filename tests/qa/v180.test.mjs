import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { budgetDelta, evaluateExtras, extrasMatrix, EXTRA_STATES, observeScoreActivity } from "../../scripts/perf/extras-budget.mjs";
import { evaluateSupersample, observeSupersample, summarizeSupersample } from "../../scripts/perf/supersample-receipt.mjs";
import { clipboardStub, evaluateLinks, linkSmokeUrls } from "../../scripts/harbour/links-smoke.mjs";
import { acceptanceRows, buildReleaseReceipt, V180_ASSERTIONS } from "../../scripts/pharosville/release-receipt.mjs";
import { acceptanceChecks, extrasEvidence, linksEvidence, provenance, supersampleEvidence } from "./v180-fixtures.mjs";

const capture = (input, id) => input.captures.find((c) => c.id === id);
const samples = (input, id, ms) => capture(input, id).data.scenarios[0].runs.forEach((r) => r.rawGpuSamples.forEach((s) => s.ms = ms));

describe("Q2 extras matrix and budget", () => {
  it("covers both low suns, night, DANGER, calm mirror and every staged score on Low", () => {
    const matrix = extrasMatrix();
    expect(new Set(matrix.map((s) => s.id)).size).toBe(matrix.length);
    expect(EXTRA_STATES.filter((s) => s.extras.includes("twilight")).map((s) => s.hour)).toEqual([6.9, 17.6]);
    expect(EXTRA_STATES.find((s) => s.extras.includes("nightsky")).hour).toBe(22);
    expect(EXTRA_STATES.find((s) => s.extras.includes("storm")).weather).toBe("DANGER");
    expect(EXTRA_STATES.find((s) => s.extras.includes("mirror"))).toMatchObject({ hour: 12.5, weather: "CALM" });
    expect(EXTRA_STATES.filter((s) => s.stage).map((s) => s.stage)).toEqual(["score=cranes", "score=murmuration", "score=splash", "doves=now"]);
    for (const state of EXTRA_STATES) {
      expect(matrix.find((s) => s.id === `${state.id}/yardstick`)).toMatchObject({ quality: "low", extras: "none" });
      expect(matrix.find((s) => s.id === `${state.id}/low-all`).extras).toContain("-supersample");
      for (const name of state.extras.filter((n) => ["storm", "precip", "score"].includes(n))) {
        expect(matrix.find((s) => s.id === `${state.id}/${name}-low`)).toMatchObject({ quality: "low", extras: `none,+${name}` });
      }
    }
  });
  it("uses deltas rather than whole Medium/High frames and accepts exact inclusive ceilings", () => {
    expect(budgetDelta(7, 7.4, 4, 0.1)).toMatchObject({ status: "PASS", limitMs: 0.4 });
    expect(budgetDelta(7, 7.401, 4, 0.1).status).toBe("FAIL");
    expect(budgetDelta(8, 8.8, 4, 0.2).status).toBe("PASS");
    expect(budgetDelta(8, 8.801, 4, 0.2).status).toBe("FAIL");
    expect(budgetDelta(4, 4.02, 4, 0, 0.02).status).toBe("PASS");
    expect(budgetDelta(4, 4.021, 4, 0, 0.02).status).toBe("FAIL");
    expect(budgetDelta(4, 3, 4, 0).status).toBe("PASS");
    for (const value of [null, undefined, NaN, Infinity, 0, -1]) expect(budgetDelta(4, 4, value, 0.1).status).toBe("UNVERIFIED");
  });
  it("recomputes raw medians and baseline noise; every state/class must pass", () => {
    expect(evaluateExtras(extrasEvidence()).exitCode).toBe(0);
    const data = extrasEvidence(); samples(data, "dawn/medium-on", 4.401);
    expect(evaluateExtras(data)).toMatchObject({ status: "FAIL", exitCode: 1 });
    samples(data, "dawn/medium-on", 4.4);
    expect(evaluateExtras(data).exitCode).toBe(0);
    samples(data, "storm/precip-low", 4.021);
    expect(evaluateExtras(data).exitCode).toBe(1);
  });
  it("does not let Low total regress even when each class is under its limit", () => {
    const data = extrasEvidence(); samples(data, "night/low-all", 4.021);
    expect(evaluateExtras(data).rows.find((r) => r.id === "night/low-nonregression").status).toBe("FAIL");
  });
  it("never passes missing/unmatched/software/contended/disjoint or unpinned measurements", () => {
    const mutations = [
      (v) => v.captures.pop(),
      (v) => capture(v, "night/nightsky").data.meta.contended = true,
      (v) => capture(v, "night/nightsky").data.meta.prof = "none",
      (v) => capture(v, "night/nightsky").data.meta.apiLatency = "live",
      (v) => capture(v, "night/nightsky").data.meta.uncapped = false,
      (v) => delete capture(v, "night/nightsky").data.meta.warmupMs,
      (v) => capture(v, "night/nightsky").data.meta.origin = "garbage",
      (v) => capture(v, "night/nightsky").data.meta.origin = "http://localhost/?extras=none",
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].provenance.gpu = "SwiftShader",
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].provenance.buildHash = "other",
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs.forEach((r) => r.provenance.fixtureHash = "other"),
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].rawGpuSamples = [],
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].pendingQueries = 1,
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].disjointPolls = 1,
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].timing.states.push("low|1"),
      (v) => delete capture(v, "night/nightsky").data.scenarios[0].runs[0].timing.elapsedMs,
      (v) => capture(v, "night/nightsky").data.scenarios[0].runs[0].provenance.viewport.width = 1600,
    ];
    for (const mutate of mutations) { const data = extrasEvidence(); mutate(data); expect(evaluateExtras(data).exitCode).toBe(78); }
  });
  it("charges only actually active score GPU frames and refuses dormant/production stage flags", () => {
    const data = extrasEvidence(), s = capture(data, "score-cranes/score-low").data.scenarios[0];
    for (const r of s.runs) {
      r.rawGpuSamples.push(...Array.from({ length: 200 }, (_, i) => ({ frame: i + 100, ms: 0.1 })));
      r.rawGpuSamples.slice(0, 100).forEach((sample) => sample.ms = 5);
    }
    expect(evaluateExtras(data).exitCode).toBe(1);
    for (const r of s.runs) r.extraActivity = [];
    expect(evaluateExtras(data).exitCode).toBe(78);
  });
  it("serialized score observer proves DEV activity and tags the profiler's just-rendered frame", () => {
    const stats = {}, life = { scoreOn: true, score: { log: [{ cue: "cranes", t: 10 }] } };
    let rendered;
    const window = { __harbourStats: stats, __gpuPasses: { frame: 42 }, __harbourLife: { life },
      __harbour: { clock: { elapsed: 15 }, onRendered: (fn) => { rendered = fn; } } };
    runInNewContext(`(${observeScoreActivity.toString()})("cranes")`, { window, requestAnimationFrame: (fn) => fn() });
    rendered();
    expect(stats.extraActivity).toEqual([{ frame: 41, stage: "cranes", recognized: true, active: true }]);
    window.__harbour.clock.elapsed = 81; rendered(); expect(stats.extraActivity.at(-1).active).toBe(false);
    life.scoreOn = false; delete life.score; rendered(); expect(stats.extraActivity.at(-1)).toMatchObject({ recognized: true, active: false });
  });
  it("does not erase a measured failure alongside missing evidence", () => {
    const data = extrasEvidence(); data.captures.pop(); samples(data, "dawn/medium-on", 5);
    expect(evaluateExtras(data).exitCode).toBe(1);
    const errors = extrasEvidence(); capture(errors, "night/nightsky").data.scenarios[0].runs[0].consoleErrors.push("warning");
    expect(evaluateExtras(errors).exitCode).toBe(1);
  });
});

describe("Q3 supersampling", () => {
  it("requires three matched auto-quality controls at both 1× viewports and a crispness review", () => {
    const input = supersampleEvidence();
    expect(input.captures).toHaveLength(12);
    expect(evaluateSupersample(input).exitCode).toBe(0);
    const stats = summarizeSupersample(input.captures[1].data.evalResult);
    expect(stats).toMatchObject({ gpuP50Ms: 4, gpuP95Ms: 4, frameP95Ms: 16, frameMaxMs: 16, tierChanges: [] });
    expect(stats.trace.at(-1)).toMatchObject({ dpr: 1.5, pixels: 1920 * 1080 * 2.25, composerPairBytes: 1920 * 1080 * 2.25 * 16 });
  });
  it("fails a single >50 ms frame, sustained pacing miss, tier drop, allocation overflow or rejected crispness", () => {
    for (const mutate of [
      (v) => v.captures[1].data.evalResult.deltas[0] = 50.01,
      (v) => v.captures[1].data.evalResult.deltas.fill(16.701),
      (v) => v.captures[1].data.evalResult.trace[1].tier = "medium",
      (v) => v.crispness.status = "FAIL",
      (v) => { const t = v.captures[1].data.evalResult.trace[1]; t.dpr = 2.01; t.width = Math.floor(1920 * t.dpr); t.height = Math.floor(1080 * t.dpr); t.pixels = t.width * t.height; t.composerPairBytes = t.pixels * 16; },
    ]) { const data = supersampleEvidence(); mutate(data); expect(evaluateSupersample(data).exitCode).toBe(1); }
    const edge = supersampleEvidence(); edge.captures[1].data.evalResult.deltas[0] = 50;
    expect(evaluateSupersample(edge).exitCode).toBe(0);
  });
  it("never promotes a dormant extra or incomplete/mismatched/noisy measurement", () => {
    for (const mutate of [
      (v) => v.captures.pop(), (v) => v.contended = true, (v) => v.crispness = null,
      (v) => v.captures[1].data.evalResult.trace.forEach((t) => t.dpr = 1),
      (v) => v.captures[1].data.evalResult.auto = false,
      (v) => v.captures[1].data.evalResult.displayDpr = 2,
      (v) => v.captures[1].data.evalResult.gpuSamples = [],
      (v) => v.captures[1].data.evalResult.gpuDropped = 1,
      (v) => v.captures[1].data.evalResult.disjoint = 1,
      (v) => v.captures[1].data.provenance.fixtureHash = "other",
      (v) => v.captures[1].data.provenance.effectiveState.weather.band = "DANGER",
      (v) => v.captures[1].data.provenance.gpu = "SwiftShader",
      (v) => v.captures[1].data.url += "&quality=high",
      (v) => v.captures[1].data.paced = true,
    ]) { const data = supersampleEvidence(); mutate(data); expect(evaluateSupersample(data).exitCode).toBe(78); }
  });
  it("serialized observer retains changes and real intervals and excludes pre-window pending queries", async () => {
    let now = 0, backing = 1, n = 0;
    const g = { frameId: 10, gpuCompletedSamples: 0, gpuDisjointSamples: 0, level: 3, tier: "high", auto: true,
      completedGpuSamples: () => n >= 2 ? [{ frame: 10, ms: 3 }, { frame: 11, ms: 4 }] : [] };
    const gl = { get drawingBufferWidth() { return 100 * backing; }, get drawingBufferHeight() { return 100 * backing; } };
    const e = { governor: g, ctx: { services: new Map([["readiness", { prepared: true, revision: 1 }]]), renderer: { getContext: () => gl, getPixelRatio: () => backing } } };
    const window = { __harbour: e, __harbourStats: { renderedRevision: 1 } };
    const result = await runInNewContext(`(${observeSupersample.toString()})({seconds:0.2,timeoutMs:1000})`, { window, document: { hidden: false }, devicePixelRatio: 1,
      performance: { now: () => now }, setTimeout: (cb) => cb(), requestAnimationFrame: (cb) => { now += 100; if (++n === 2) { backing = 1.5; g.level = 4; g.gpuCompletedSamples = 2; } cb(); } });
    expect(result.trace.map((t) => t.dpr)).toEqual([1, 1.5, 1.5]);
    expect(result.deltas).toEqual([100, 100]); expect(result.gpuDropped).toBe(0);
    expect(result.gpuSamples).toEqual([{ frame: 11, ms: 4 }]);
  });
});

describe("built subject links smoke", () => {
  it("constructs canonical-only sharing and distinct subjects without capture/debug parameters", () => {
    expect(linkSmokeUrls("http://localhost:4180/?prof=gpu&extras=none#t=12", "usdc-circle")).toMatchObject({ home: "http://localhost:4180/", first: "http://localhost:4180/?sel=ship.usdc-circle", canonical: "https://pharosville.pharos.watch/?sel=ship.usdc-circle" });
    for (const bad of ["USDC", "../secret", "<script>", "a&b", ""]) expect(() => linkSmokeUrls("http://localhost/", bad)).toThrow();
    expect(() => linkSmokeUrls("http://localhost/", "usdc-circle", "ship.usdc-circle")).toThrow();
    expect(() => linkSmokeUrls("javascript:alert(1)", "usdc-circle")).toThrow();
  });
  it("stubs writeText before navigation without reading or granting clipboard permissions", async () => {
    const window = {}, navigator = {};
    runInNewContext(`(${clipboardStub.toString()})()`, { window, navigator, localStorage: { setItem() {} } });
    await navigator.clipboard.writeText("subject URL");
    expect(window.__linksCopied).toEqual(["subject URL"]);
    expect(navigator.clipboard.readText).toBeUndefined();
  });
  it("requires history +1, Back/Forward, closed panel, canonical copy, reopened subject and zero warnings", () => {
    expect(evaluateLinks(linksEvidence()).exitCode).toBe(0);
    for (const mutate of [
      (v) => delete v.observation.back,
      (v) => v.observation.second.historyAfter++,
      (v) => v.observation.back.subject = "ship.other",
      (v) => v.observation.reopened.title = "Wrong coin",
      (v) => v.observation.forward.url = "http://localhost/?sel=ship.wrong",
      (v) => v.observation.closed.url = "http://localhost/?sel=ship.usdc-circle",
      (v) => v.observation.copied.url += "&t=12",
      (v) => v.consoleErrors.push("[warning] failed request"),
      (v) => delete v.consoleErrors,
    ]) { const data = linksEvidence(); mutate(data); expect(evaluateLinks(data).exitCode).toBe(1); }
    const sw = linksEvidence(); sw.provenance.gpu = "SwiftShader"; expect(evaluateLinks(sw).exitCode).toBe(78);
  });
  it("is wired beside arrival in the local GPU arm and uses the shared browser only", () => {
    const gate = readFileSync(new URL("../../scripts/pharosville/validate-deploy-gate.mjs", import.meta.url), "utf8");
    expect(gate).toContain('"scripts/harbour/links-smoke.mjs"');
    expect(gate.indexOf('"scripts/harbour/links-smoke.mjs"')).toBeGreaterThan(gate.indexOf('"scripts/harbour/arrival-smoke.mjs"'));
    const smoke = readFileSync(new URL("../../scripts/harbour/links-smoke.mjs", import.meta.url), "utf8");
    expect(smoke).toContain("await captureLock()"); expect(smoke).toContain("await connectShared()");
    expect(smoke).not.toMatch(/chromium\.launch|readText\(|grantPermissions/);
  });
});

describe("v1.8.0 receipt acceptance rows", () => {
  const evidence = () => ({ buildHash: "build-a", fixtures: ["fixture-a"], checks: acceptanceChecks() });
  const identity = provenance().deliveryIdentity;
  it("has six PASS/FAIL/SKIP rows with evidence paths and re-evaluates measured links/extras/supersampling", () => {
    const rows = acceptanceRows(evidence(), identity);
    expect(rows.map((r) => r.id)).toEqual(["links", "postcards", "new-readings", "blocked-viewports", "extras", "supersample"]);
    expect(rows.every((r) => r.status === "PASS" && r.file)).toBe(true);
  });
  it("makes absent evidence SKIP, overall UNVERIFIED, and never fills assertions from labels alone", () => {
    expect(acceptanceRows({}, identity).every((r) => r.status === "SKIP")).toBe(true);
    expect(buildReleaseReceipt(null).exitCode).toBe(78);
    for (const id of Object.keys(V180_ASSERTIONS)) {
      const data = evidence(), check = data.checks.find((c) => c.id === id); check.data.assertions.pop();
      expect(acceptanceRows(data, identity).find((r) => r.id === id).status).toBe("SKIP");
      check.data.status = "FAIL";
      expect(acceptanceRows(data, identity).find((r) => r.id === id).status).toBe("FAIL");
    }
  });
  it("rejects artifact/fixture/canonical mismatch and detects forged performance PASS labels", () => {
    const data = evidence(); data.buildHash = "other";
    expect(acceptanceRows(data, identity).every((r) => r.status === "SKIP")).toBe(true);
    const missing = evidence(); missing.checks.find((c) => c.id === "links").data.observation = null;
    expect(acceptanceRows(missing, identity)[0].status).toBe("FAIL");
    const forged = evidence(); samples(forged.checks.find((c) => c.id === "extras").data, "dawn/medium-on", 5);
    expect(acceptanceRows(forged, identity).find((r) => r.id === "extras").status).toBe("FAIL");
  });
});

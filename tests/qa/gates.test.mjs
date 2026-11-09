import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { SOAK_METRICS, summarizeSoak } from "../../scripts/perf/soak-summary.mjs";
import { evaluateSteady } from "../../scripts/perf/steady-gate.mjs";
import { evaluateArrival, observeArrival } from "../../scripts/harbour/arrival-smoke.mjs";
import { buildReleaseReceipt, readEvidence } from "../../scripts/pharosville/release-receipt.mjs";
import { probeShader } from "../../scripts/perf/frame.mjs";
import { trackResources } from "../../scripts/perf/soak-scenarios.mjs";

const provenance = () => ({ device: { platform: "Linux x86_64", input: "pointer", reducedMotion: false }, gpu: "ANGLE (NVIDIA GeForce RTX 5070 Ti, Vulkan)", browser: "Chrome/142", backend: "Vulkan", driver: "test",
  buildHash: "build-a", fixtureHash: "fixture-a", viewport: { width: 1600, height: 1000 }, dpr: 1,
  effectiveState: { hour: 12, quality: "low", weather: { band: "CALM" }, season: { season: "summer" } },
  deliveryIdentity: { documentHash: "document", assetRegistryHash: "registry" } });

const soakSamples = () => ["mounted", "disposed"].flatMap((phase) => Array.from({ length: 12 }, (_, cycle) => ({ cycle, phase, ms: cycle * 180_000,
  ...Object.fromEntries(SOAK_METRICS.map((key) => [key, key === "heapBytes" ? 10_000_000 : 10])) })));

describe("soak assertions", () => {
  it("passes a measured post-warmup plateau", () => expect(summarizeSoak(soakSamples())).toMatchObject({ verdict: "plateau", status: "PASS", exitCode: 0 }));
  it.each(SOAK_METRICS)("fails persistent %s growth", (key) => {
    const samples = soakSamples();
    for (const s of samples) s[key] += s.cycle * (key === "heapBytes" ? 2_000_000 : 3);
    expect(summarizeSoak(samples)).toMatchObject({ verdict: "growth", status: "FAIL", exitCode: 1 });
  });
  it.each(SOAK_METRICS)("does not call missing %s a plateau", (key) => {
    const samples = soakSamples(); samples.at(-1)[key] = null;
    expect(summarizeSoak(samples)).toMatchObject({ verdict: "UNVERIFIED", exitCode: 78 });
  });
  it("requires all phases and four post-warmup measurements", () => {
    expect(summarizeSoak([]).exitCode).toBe(78);
    expect(summarizeSoak(soakSamples().filter((s) => s.phase === "mounted")).exitCode).toBe(78);
    expect(summarizeSoak(soakSamples(), { warmup: 9 }).exitCode).toBe(78);
    expect(summarizeSoak(soakSamples(), { phases: ["mounted"] }).exitCode).toBe(0);
  });
  it("ignores warmup spikes and gives growth/faults priority over gaps", () => {
    const samples = soakSamples(); samples[0].heapBytes = 1e9;
    expect(summarizeSoak(samples).exitCode).toBe(0);
    samples.at(-1).heapBytes = null;
    samples.at(-1).listeners = 1000;
    expect(summarizeSoak(samples).exitCode).toBe(1);
    expect(summarizeSoak([], { failures: ["unrecovered context"] }).exitCode).toBe(1);
  });
  it("serialized instrumentation tracks terminated workers, closed audio and unsupported audio distinctly", () => {
    class WorkerDouble { terminate() {} dispatchEvent() {} }
    class AudioDouble { state = "running"; }
    const window = { Worker: WorkerDouble, AudioContext: AudioDouble };
    runInNewContext(`(${trackResources.toString()})()`, { window, localStorage: { setItem() {} }, WeakRef });
    const w = new window.Worker(), audio = new window.AudioContext();
    expect(window.__soakResources()).toMatchObject({ trackedWorkers: 1, audioContexts: 1 });
    w.terminate(); audio.state = "closed";
    expect(window.__soakResources()).toMatchObject({ trackedWorkers: 0, audioContexts: 0 });
    const unsupported = { Worker: WorkerDouble };
    runInNewContext(`(${trackResources.toString()})()`, { window: unsupported, localStorage: { setItem() {} }, WeakRef });
    expect(unsupported.__soakResources().audioContexts).toBeNull();
  });
});

function arrival() {
  return { gpu: provenance().gpu, consoleErrors: [], evalResult: { simulation: { phase: "ready", unavailable: false }, lifecycle: "READY",
    readiness: { revision: 2, boats: 10, prepared: true }, frame: { revision: 2, drawn: 10 }, rendered: { revision: 2, boats: 10, drawn: 10 },
    firstFleetMs: 1200, live: true, poster: false } };
}

describe("arrival smoke", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("passes only a completed coherent real-GPU arrival", () => expect(evaluateArrival(arrival()).exitCode).toBe(0));
  it("skips software/unknown GPU", () => {
    for (const gpu of ["SwiftShader", "unknown", null]) expect(evaluateArrival({ ...arrival(), gpu }).exitCode).toBe(78);
  });
  it("rejects unavailable simulation, missing drawn proof, stale revision, poster and warnings", () => {
    for (const patch of [{ simulation: { phase: "recovering" } }, { frame: { revision: 2, boats: 10 } }, { rendered: { revision: 1, drawn: 10 } },
      { readiness: { revision: 2, boats: 0, prepared: true } }, { lifecycle: "BOOTING" }, { poster: true }, { firstFleetMs: null }]) {
      const report = arrival(); Object.assign(report.evalResult, patch);
      expect(evaluateArrival(report).exitCode).toBe(1);
    }
    expect(evaluateArrival({ ...arrival(), consoleErrors: ["[warning] incomplete fleet"] }).exitCode).toBe(1);
    expect(evaluateArrival({ ...arrival(), consoleErrors: undefined }).exitCode).toBe(1);
  });
  it("serialized observer subscribes to real lifecycle/render APIs and removes subscriptions", async () => {
    const r = arrival().evalResult;
    let rendered = null;
    const stop = vi.fn(), unrender = vi.fn();
    const engine = { ctx: { services: new Map([["readiness", r.readiness], ["fleet-frame", r.frame], ["simulation-status", r.simulation]]) },
      onLifecycle: (cb) => { cb({ state: "READY" }); return stop; },
      onRendered: (cb) => { rendered = cb; return unrender; } };
    const result = await runInNewContext(`(${observeArrival.toString()})(100)`, {
      window: { __harbour: engine }, document: { documentElement: { hasAttribute: () => true }, getElementById: () => null },
      performance: { now: () => 1, getEntriesByName: () => [{ startTime: 1200 }] },
      requestAnimationFrame: (cb) => { rendered?.(r.rendered); cb(); }, setTimeout,
    });
    expect(result).toEqual(r);
    expect(stop).toHaveBeenCalledOnce(); expect(unrender).toHaveBeenCalledOnce();
  });
  it("local GPU release arm calls arrival beside load; publication remains in release.yml", () => {
    const gate = readFileSync(new URL("../../scripts/pharosville/validate-deploy-gate.mjs", import.meta.url), "utf8");
    expect(gate).toContain('"scripts/harbour/arrival-smoke.mjs"');
    expect(gate.indexOf('"scripts/harbour/arrival-smoke.mjs"')).toBeGreaterThan(gate.indexOf('"scripts/perf/load.mjs"'));
    expect(readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8")).toContain("gh release create");
  });
});

function steady() {
  const run = () => ({ provenance: provenance(), consoleErrors: [], timing: { elapsedMs: 30_001, endMs: 40_000, deltas: Array(1800).fill(16), states: ["low|1"] },
    setup: { quality: "low", effectiveDpr: 1 }, stats: { quality: "low", dpr: 1 }, steadyProgramsCreated: 0, pendingQueries: 0, disjointPolls: 0,
    rawGpuSamples: Array.from({ length: 100 }, () => ({ ms: 8 })), gpuTotal: { p95Ms: 8 },
    cpuProfile: { samples: Array.from({ length: 100 }, () => ({ cpuMs: 4, tier: "low", dpr: 1 })) },
    firstFleetMs: 1000, longTasks: { available: true, dropped: 0, entries: [] } });
  return { status: "PASS", meta: { machine: "quiet", contended: false, prof: "gpu", cpuThrottle: 4, warmupMs: 3500 },
    scenarios: [["day", 12, "CALM"], ["night", 22, "CALM"], ["storm", 12, "DANGER"]].map(([id, hour, requestedWeather]) => ({ id, hour, requestedWeather, runs: [run(), run(), run()] })) };
}

describe("steady gate", () => {
  it("passes three quiet 30s RTX repeats for every critical state", () => expect(evaluateSteady(steady()).exitCode).toBe(0));
  it("fails measured frame/CPU/long-task violations, even with missing other evidence", () => {
    const input = steady(); input.scenarios[0].runs[0].timing.deltas.fill(18);
    input.scenarios[0].runs[0].cpuProfile.samples[0].tier = "high";
    expect(evaluateSteady(input).exitCode).toBe(1);
    const cpu = steady(); cpu.scenarios[0].runs[0].cpuProfile.samples.forEach((s) => s.cpuMs = 9);
    expect(evaluateSteady(cpu).exitCode).toBe(1);
    const tasks = steady(); tasks.scenarios[0].runs[0].longTasks.entries.push({ startMs: 2000, durationMs: 60 });
    expect(evaluateSteady(tasks).exitCode).toBe(1);
  });
  it("never passes contention, missing samples, a short run, missing state, changing tier, disjoint or timerless evidence", () => {
    const mutations = [
      (s) => s.meta.contended = true,
      (s) => s.scenarios.pop(),
      (s) => s.scenarios[0].runs.pop(),
      (s) => s.scenarios[0].runs[0].timing.elapsedMs = 10_000,
      (s) => s.scenarios[0].runs[0].timing.deltas = [],
      (s) => s.scenarios[0].runs[0].timing.states.push("high|1"),
      (s) => s.scenarios[0].runs[0].rawGpuSamples = [],
      (s) => s.scenarios[0].runs[0].disjointPolls = 1,
      (s) => s.scenarios[0].runs[0].provenance.buildHash = "other",
      (s) => s.scenarios[0].runs[0].longTasks.dropped = 1,
    ];
    for (const mutate of mutations) { const input = steady(); mutate(input); expect(evaluateSteady(input).exitCode).toBe(78); }
  });
  it("enforces matching GPU relative ceilings without promoting unavailable hardware", () => {
    expect(evaluateSteady(steady(), steady(), 0.7).exitCode).toBe(1);
    const baseline = steady(); baseline.scenarios.forEach((s) => s.runs.forEach((r) => r.gpuTotal.p95Ms = 12));
    expect(evaluateSteady(steady(), baseline, 0.7).exitCode).toBe(0);
    baseline.meta.contended = true;
    expect(evaluateSteady(steady(), baseline).exitCode).toBe(78);
    const software = steady(); software.scenarios.forEach((s) => s.runs.forEach((r) => r.provenance.gpu = "SwiftShader"));
    expect(evaluateSteady(software).exitCode).toBe(78);
  });
});

function release() {
  const sha = "a".repeat(40);
  const smoke = { status: "PASS", origin: "https://pharosville.pharos.watch/", sha, buildHash: "build-a", identity: provenance().deliveryIdentity };
  const evidence = { sha, buildHash: "build-a", fixtures: ["fixture-a"], art: { status: "PASS", reviewer: "art director", evidence: "native contact sheet" },
    checks: [{ id: "arrival", file: "arrival.json", data: { status: "PASS", provenance: provenance(), observation: arrival().evalResult, consoleErrors: [] } },
      { id: "soak", file: "soak.json", data: { status: "PASS", meta: { provenance: provenance(), mode: "mounted", warmup: 3, elapsedMs: 1800001 }, samples: soakSamples(), scenarios: ["panels", "hidden-wake", "worker-crash", "context-loss"].map((kind) => ({ kind, status: "PASS" })) } },
      { id: "steady", file: "steady.json", data: steady() }] };
  evidence.checks.push({ id: "soak-remount", file: "remount.json", data: { ...evidence.checks[1].data, meta: { ...evidence.checks[1].data.meta, mode: "remount" } } });
  const cpu = steady(); cpu.meta.prof = "1";
  evidence.checks.push({ id: "steady-cpu4", file: "cpu.json", data: cpu });
  const control = steady(); control.meta.prof = "none"; control.meta.cpuThrottle = 1;
  evidence.checks.push({ id: "steady-control", file: "control.json", data: control });
  return { smoke, evidence };
}

describe("release receipt", () => {
  it("treats absent evidence files as missing instead of manufacturing a pass", async () => {
    expect(await readEvidence(new URL("./missing-receipt-file.json", import.meta.url))).toBeNull();
    expect(buildReleaseReceipt(null).exitCode).toBe(78);
  });
  it("extends canonical identity and records real RTX PASS rows plus explicit secondary SKIPs", () => {
    const { smoke, evidence } = release(); const r = buildReleaseReceipt(smoke, evidence);
    expect(r.exitCode).toBe(0); expect(r.canonical).toBe(smoke);
    expect(r.rows.filter((r) => r.status === "SKIP")).toHaveLength(8);
    expect(r.rows.find((r) => r.id === "Apple Silicon Safari (D14)").reason).toContain("Operator ruling");
    expect(r.evidence.checks[2].data.scenarios[0].runs[0].timing.deltas).toHaveLength(1800);
  });
  it("rejects missing checks, mismatched artifacts/fixtures/canonical host and absent art", () => {
    for (const mutate of [
      (_s, e) => e.checks.pop(), (s) => s.origin = "https://preview.pages.dev/", (s) => s.sha = "b".repeat(40),
      (_s, e) => e.buildHash = "other", (_s, e) => e.fixtures = [], (_s, e) => e.art = null,
      (s) => s.identity.documentHash = "other",
    ]) { const { smoke, evidence } = release(); mutate(smoke, evidence); expect(buildReleaseReceipt(smoke, evidence).exitCode).toBe(78); }
  });
  it("cannot promote a PASS label without raw samples, scenarios, or the correct profiler arm", () => {
    for (const mutate of [
      (e) => e.checks[0].data.observation = null,
      (e) => e.checks[1].data.samples = [],
      (e) => e.checks[1].data.scenarios = [],
      (e) => e.checks[2].data.scenarios[0].runs[0].timing.deltas = [],
      (e) => e.checks.find((c) => c.id === "steady-cpu4").data.meta.prof = "none",
    ]) { const { smoke, evidence } = release(); mutate(evidence); expect(buildReleaseReceipt(smoke, evidence).exitCode).toBe(78); }
  });
  it("keeps measured failures red even alongside gaps/skips", () => {
    const { smoke, evidence } = release(); evidence.checks[0].data.status = "FAIL"; evidence.art = null;
    expect(buildReleaseReceipt(smoke, evidence).exitCode).toBe(1);
  });
});


describe("shader diagnostic transform", () => {
  it("inserts exactly one loop and a real newline, including when serialized", () => {
    const source = "void main() { gl_Position = vec4(0.0); }\n";
    const output = runInNewContext(`(${probeShader.toString()})(${JSON.stringify(source)}, 'position.x', 'gl_Position.x')`);
    expect(output).toContain("uniform float pvProbeZero;\nvoid main");
    expect(output.match(/float pvProbe =/g)).toHaveLength(1);
    expect(output).not.toContain("\\n");
    expect(() => probeShader(output, "position.x", "gl_Position.x")).toThrow(/contract/);
    expect(() => probeShader("void main()", "position.x", "gl_Position.x")).toThrow(/contract/);
  });
});

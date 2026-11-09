import { classifyGpu } from "../harbour/capture-provenance.mjs";

const percentile = (samples, p) => [...samples].sort((a, b) => a - b)[Math.min(samples.length - 1, Math.floor(samples.length * p))];
const positive = (samples) => Array.isArray(samples) && samples.length >= 100 && samples.every((n) => Number.isFinite(n) && n > 0);

/** RTX-only acceptance; CPU submission, frame intervals and completed GPU queries stay distinct. */
export function evaluateSteady(summary, baseline = null, maxGpuRatio = 1) {
  const rows = [];
  const row = (id, status, reason, measurements = {}) => rows.push({ id, status, reason, ...measurements });
  if (summary.meta?.warmupMs < 3500 || !Number.isFinite(summary.meta?.warmupMs)) row("warmup", "UNVERIFIED", "At least 3.5 seconds of post-readiness warmup required");
  if (summary.meta?.machine !== "quiet" || summary.meta?.contended !== false) row("quiet", "UNVERIFIED", "Quiet machine evidence required");
  if (!summary.scenarios?.length) row("matrix", "UNVERIFIED", "No steady scenarios");
  for (const state of ["day", "night", "storm"]) {
    const covered = summary.scenarios?.some((s) => state === "storm" ? s.requestedWeather === "DANGER" : s.requestedWeather === "CALM" && (state === "day" ? s.hour >= 7 && s.hour < 19 : s.hour < 7 || s.hour >= 19));
    if (!covered) row(state, "UNVERIFIED", "Required day/night/storm state missing");
  }
  const state = (p) => ({ hour: p?.effectiveState?.hour, quality: p?.effectiveState?.quality, weather: p?.effectiveState?.weather?.band, season: p?.effectiveState?.season?.season });
  for (const scenario of summary.scenarios ?? []) {
    if (scenario.runs?.length !== 3) row(scenario.id, "UNVERIFIED", "Exactly three steady repetitions required");
    const first = scenario.runs?.[0];
    for (const [index, run] of (scenario.runs ?? []).entries()) {
      const id = `${scenario.id}/${index + 1}`, p = run.provenance;
      if (run.status === "SKIP") { row(id, "SKIP", run.error ?? "Real GPU unavailable"); continue; }
      if (run.error || run.consoleErrors?.length) { row(id, "FAIL", run.error ?? "Console errors/warnings"); continue; }
      if (classifyGpu(p?.gpu) !== "hardware" || !/\bRTX\b/i.test(p.gpu)) { row(id, "SKIP", "No real RTX measurement; secondary devices skipped by PLAN §3"); continue; }
      if (!p?.buildHash || !p.fixtureHash || !p.browser || !p.backend || !p.device?.platform || !Array.isArray(run.consoleErrors)) row(id, "UNVERIFIED", "Missing build/fixture/device/browser/console evidence");
      const comparable = (a, b) => ["gpu", "browser", "backend", "driver", "buildHash", "fixtureHash", "viewport", "dpr"].every((key) => JSON.stringify(a?.[key]) === JSON.stringify(b?.[key])) && JSON.stringify(state(a)) === JSON.stringify(state(b));
      if (!comparable(p, first?.provenance)) row(id, "UNVERIFIED", "Repetitions do not match build, fixture, device or effective state");
      const intervals = run.timing?.deltas;
      if (!(run.timing?.elapsedMs >= 30_000) || !positive(intervals)) row(`${id}/interval`, "UNVERIFIED", "Need 30 foreground seconds of raw frame intervals");
      else {
        const p95Ms = percentile(intervals, 0.95);
        row(`${id}/interval`, p95Ms <= 16.7 ? "PASS" : "FAIL", "Frame interval p95 ≤16.7 ms (submission pacing, not presentation or GPU time)", { p95Ms, maxMs: intervals.reduce((max, n) => Math.max(max, n), 0), samples: intervals.length });
      }
      const cpu = run.cpuProfile?.samples;
      const qualityStable = (samples) => samples?.length >= 100 && samples.every((s) => s.tier === run.setup?.quality && s.dpr === run.setup?.effectiveDpr);
      if (run.steadyProgramsCreated !== 0 || run.stats?.quality !== run.setup?.quality || run.stats?.dpr !== run.setup?.effectiveDpr
        || !Array.isArray(run.timing?.states) || run.timing.states.length !== 1 || run.timing.states[0] !== `${run.setup?.quality}|${run.setup?.effectiveDpr}`
        || (cpu && !qualityStable(cpu))) row(`${id}/stability`, "UNVERIFIED", "Tier/DPR/program population changed during measurement");
      if (summary.meta?.cpuThrottle === 4) {
        if (!(cpu?.length >= 100) || !cpu.every((s) => Number.isFinite(s.cpuMs) && s.cpuMs >= 0)) row(`${id}/cpu4`, "UNVERIFIED", "No raw CPU submission samples");
        else { const p95Ms = percentile(cpu.map((s) => s.cpuMs), 0.95); row(`${id}/cpu4`, p95Ms <= 8 ? "PASS" : "FAIL", "CPU ×4 submission p95 ≤8 ms; retained profiler window", { p95Ms, samples: cpu.length }); }
        if (!run.longTasks?.available || run.longTasks.dropped !== 0 || !Number.isFinite(run.firstFleetMs)) row(`${id}/longtasks`, "UNVERIFIED", "Missing complete post-first-fleet Long Tasks evidence");
        else { const tasks = run.longTasks.entries.filter((t) => t.startMs >= run.firstFleetMs && t.startMs <= run.timing.endMs); row(`${id}/longtasks`, tasks.length ? "FAIL" : "PASS", "Zero Long Tasks after first fleet", { tasks }); }
      }
      if (summary.meta?.prof === "gpu") {
        const gpu = run.rawGpuSamples?.map((s) => s.ms);
        if (!positive(gpu) || run.pendingQueries !== 0 || run.disjointPolls !== 0) row(`${id}/gpu`, "UNVERIFIED", "Missing, pending or disjoint GPU query evidence");
        else row(`${id}/gpu`, "PASS", "Completed GPU queries (distinct from frame intervals)", { p95Ms: percentile(gpu, 0.95), samples: gpu.length });
      }
    }
    if (baseline) {
      const previous = baseline.scenarios?.find((s) => s.id === scenario.id);
      const before = previous?.runs?.[0]?.provenance, after = first?.provenance;
      const same = before && after && ["gpu", "browser", "backend", "driver", "fixtureHash", "viewport", "dpr"].every((k) => JSON.stringify(before[k]) === JSON.stringify(after[k])) && JSON.stringify(state(before)) === JSON.stringify(state(after));
      const ratios = scenario.runs?.map((r, i) => r.gpuTotal?.p95Ms / previous?.runs?.[i]?.gpuTotal?.p95Ms);
      if (!same || baseline.meta?.machine !== "quiet" || baseline.meta.contended !== false || baseline.status !== "PASS"
        || previous?.runs?.length !== 3 || !before.buildHash || !ratios?.every((r) => Number.isFinite(r) && r > 0)) row(`${scenario.id}/relative`, "UNVERIFIED", "No matching verified quiet baseline");
      else row(`${scenario.id}/relative`, ratios.every((r) => r <= maxGpuRatio) ? "PASS" : "FAIL", `GPU p95 ratio ≤${maxGpuRatio}`, { ratios });
    }
  }
  const status = rows.some((r) => r.status === "FAIL") ? "FAIL" : rows.some((r) => r.status === "UNVERIFIED") ? "UNVERIFIED" : rows.some((r) => r.status === "SKIP") ? "SKIP" : "PASS";
  return { status, exitCode: status === "PASS" ? 0 : status === "FAIL" ? 1 : 78, rows };
}

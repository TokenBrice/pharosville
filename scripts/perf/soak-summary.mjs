import { median } from "./frame.mjs";

export const SOAK_METRICS = ["geometries", "textures", "programs", "heapBytes", "listeners", "workerTargets", "trackedWorkers", "audioContexts"];

/** Missing counters are evidence gaps, including gaps between otherwise valid samples. */
export function summarizeSoak(samples, { warmup = 3, phases = ["mounted", "disposed"], failures = [] } = {}) {
  const trends = {};
  for (const phase of phases) {
    const late = samples.filter((s) => s.phase === phase && s.cycle >= warmup);
    const window = late.slice(Math.floor(late.length / 2));
    trends[phase] = {};
    for (const key of SOAK_METRICS) {
      const rows = window.filter((s) => Number.isFinite(s[key]) && s[key] >= 0);
      if (late.length < 4 || rows.length < 2 || rows.length !== window.length
        || late.some((s) => !Number.isFinite(s[key]) || s[key] < 0)
        || new Set(rows.map((s) => s.cycle)).size !== rows.length) {
        trends[phase][key] = { verdict: "UNVERIFIED", samples: rows.length, reason: "Insufficient post-warmup measurements or unsupported counter" };
        continue;
      }
      const xMean = rows.reduce((sum, s) => sum + s.cycle, 0) / rows.length;
      const yMean = rows.reduce((sum, s) => sum + s[key], 0) / rows.length;
      const slope = rows.reduce((sum, s) => sum + (s.cycle - xMean) * (s[key] - yMean), 0) / rows.reduce((sum, s) => sum + (s.cycle - xMean) ** 2, 0);
      const width = Math.max(1, Math.floor(rows.length / 3));
      const first = median(rows.slice(0, width).map((s) => s[key])), last = median(rows.slice(-width).map((s) => s[key]));
      const tolerance = key === "heapBytes" ? Math.max(1024 * 1024, first * 0.05) : ["geometries", "textures", "programs"].includes(key) ? 1 : 0;
      trends[phase][key] = { samples: rows.length, firstMedian: first, lastMedian: last, delta: last - first, slopePerCycle: slope, tolerance, verdict: last - first > tolerance && slope > 0 ? "growth" : "plateau" };
    }
  }
  const verdicts = Object.values(trends).flatMap((phase) => Object.values(phase).map((t) => t.verdict));
  const verdict = failures.length ? "failure" : verdicts.includes("growth") ? "growth" : !verdicts.length || verdicts.includes("UNVERIFIED") ? "UNVERIFIED" : "plateau";
  const failed = verdict === "growth" || verdict === "failure";
  return { trends, verdict, status: failed ? "FAIL" : verdict === "plateau" ? "PASS" : "UNVERIFIED", exitCode: failed ? 1 : verdict === "plateau" ? 0 : 78, failures };
}

#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import os from "node:os";

const { values } = parseArgs({ options: {
  help: { type: "boolean" }, url: { type: "string", default: "http://127.0.0.1:4180/?t=12&view=heart&intro=0" },
  "compare-url": { type: "string" }, config: { type: "string", default: "fast4g" },
  runs: { type: "string", default: "5" }, arm: { type: "string", default: "both" },
  out: { type: "string", default: "outputs/perf/load/summary.json" }, baseline: { type: "string" },
  "max-load": { type: "string", default: String(Math.min(4, os.availableParallelism() * 0.75)) },
  "ready-timeout": { type: "string", default: "180" }, "repeat-delay": { type: "string", default: "1800" },
} });
if (values.help) {
  console.log(`Usage: node scripts/perf/load.mjs [options]
  --url URL              A origin/URL (default production-faithful local :4180)
  --compare-url URL      B origin/URL; order alternates A/B then B/A each round
  --config LIST          none,cable,fast4g,fast4g+cpu4,igpu (default fast4g)
  --runs N               samples per URL/config/arm (default 5)
  --arm cold|repeat|both repeat uses a cold seed inside the SAME capture lock
  --repeat-delay MS      seed settle before repeat, default 1800; >60000 for expired media
  --ready-timeout SEC    first-fleet/poster deadline, default 180
  --out FILE             summary JSON (raw runs saved alongside it)
  --baseline FILE        diff medians against a persisted summary
  --max-load N           contended if any 1/5/15-minute load exceeds N
Real GPU only, via shot.mjs and its shared lock. CI/no GPU: SKIP, exit 78.
HTTP-cold is not GPU-driver/shader-cold. No timing thresholds are asserted.`);
  process.exit(0);
}
const configs = {
  none: [], cable: ["--throttle", "cable"], fast4g: ["--throttle", "fast4g"],
  "fast4g+cpu4": ["--throttle", "fast4g", "--cpu-throttle", "4"], igpu: ["--igpu"],
};
const selected = values.config.split(",");
const arms = values.arm === "both" ? ["cold", "repeat"] : [values.arm];
const runs = Number(values.runs), maxLoad = Number(values["max-load"]);
const timeout = Number(values["ready-timeout"]), repeatDelay = Number(values["repeat-delay"]);
if (!Number.isInteger(runs) || runs < 1 || !Number.isFinite(maxLoad) || maxLoad <= 0
  || !Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(repeatDelay) || repeatDelay < 0
  || selected.some((key) => !Object.hasOwn(configs, key)) || arms.some((arm) => !["cold", "repeat"].includes(arm))) {
  throw new Error("Invalid runs, config, arm, timeout, repeat-delay or max-load; see --help");
}
const urls = [{ label: "A", url: new URL(values.url).href }];
if (values["compare-url"]) urls.push({ label: "B", url: new URL(values["compare-url"]).href });
for (const { url } of urls) if (!["http:", "https:"].includes(new URL(url).protocol)) throw new Error("URLs must be HTTP(S)");
const out = resolve(values.out), runDir = resolve(dirname(out), `${out.split("/").pop().replace(/\.json$/, "")}-runs-${Date.now()}`);
await mkdir(runDir, { recursive: true });
const root = fileURLToPath(new URL("../../", import.meta.url));
// Attribute observation is independent from engine readiness. Never treat an empty awaiting render as fleet-ready.
const init = `(() => {
  const m = window.__pvLoad = { crossfadeStartMs: null, posterRemovedMs: null, sawPoster: false };
  performance.setResourceTimingBufferSize(4000);
  const observe = () => {
    m.sawPoster ||= !!document.getElementById("pv-poster");
    if (document.documentElement?.hasAttribute("data-pv-live")) m.crossfadeStartMs ??= performance.now();
    if (m.sawPoster && !document.getElementById("pv-poster")) m.posterRemovedMs ??= performance.now();
  };
  new MutationObserver(observe).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-pv-live"] });
  observe();
})();`;
const evaluate = `(async () => {
  const deadline = performance.now() + ${timeout * 1000};
  while (window.__pvLoad.posterRemovedMs == null && performance.now() < deadline) await new Promise(r => setTimeout(r, 25));
  const mark = name => performance.getEntriesByName(name, "mark")[0]?.startTime ?? null;
  return {
    ...window.__pvLoad, firstFrameMs: mark("pv:first-frame"), firstFleetFrameMs: mark("pv:first-fleet-frame"),
    renderedRevision: window.__harbourStats?.renderedRevision ?? null,
    renderedBoats: window.__harbourStats?.renderedBoats ?? null,
    resources: performance.getEntriesByType("resource").map(e => ({ url: e.name, startMs: e.startTime, responseEndMs: e.responseEnd, transferBytes: e.transferSize, encodedBodyBytes: e.encodedBodySize, decodedBodyBytes: e.decodedBodySize, initiator: e.initiatorType }))
  };
})()`;
const summary = {
  schemaVersion: 1, tool: "load", date: new Date().toISOString(), status: "RUNNING",
  meta: { urls, configs: selected, arms, runs, repeatDelayMs: repeatDelay, viewport: { width: 1600, height: 1000, dpr: 1 },
    machine: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(), maxLoad,
      loadavgStart: os.loadavg(), contended: false },
    byteAccounting: "CDP page-target completed responses including headers. Excludes partial in-flight bodies and unattached worker traffic; not an immutable dependency ledger. See first-frame-bytes.mjs. Local HTTP/1.1 is not CDN transport truth." },
  samples: [], groups: [],
};
if (process.env.CI && process.env.CI !== "false") {
  summary.status = "SKIP";
  summary.reason = "CI has no real GPU; static perf:bytes is the CI lane, SKIP is not PASS.";
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(summary, null, 2) + "\n");
  console.log(`SKIP: ${summary.reason}`);
  process.exit(78);
}
function runShot(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [resolve(root, "scripts/harbour/shot.mjs"), ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolveRun({ code, signal, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }));
  });
}
function distribution(numbers) {
  const sorted = numbers.filter(Number.isFinite).sort((a, b) => a - b), n = sorted.length;
  return n ? { n, median: (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2, min: sorted[0], max: sorted[n - 1] } : { n: 0, median: null, min: null, max: null };
}
const metrics = ["firstFrameMs", "firstFleetFrameMs", "crossfadeStartMs", "posterRemovedMs", "wireBytes", "requests", "true304Count"];
let exitCode = 0;
outer: for (let round = 1; round <= runs; round++) {
  for (const config of selected) for (const arm of arms) {
    const order = round % 2 ? urls : [...urls].reverse();
    for (const target of order) {
      const id = `${target.label}-${config}-${arm}-${round}`, base = resolve(runDir, id);
      const loadavgBefore = os.loadavg();
      const args = ["--url", target.url, "--width", "1600", "--height", "1000", "--dpr", "1", "--seconds", "1", "--wait", "1800",
        "--ready-timeout", String(timeout), "--timeout", String(timeout * 3 + repeatDelay / 1000 + 60), "--waterfall", "--log-requests",
        "--json", `${base}.json`, "--out", `${base}.png`, "--init-script", init, "--eval", evaluate, "--cold", ...configs[config],
        ...(arm === "repeat" ? ["--warm-seed", String(repeatDelay)] : [])];
      console.log(`Capturing ${id}: ${target.url}`);
      const result = await runShot(args);
      await Promise.all([writeFile(`${base}.stdout.txt`, result.stdout), writeFile(`${base}.stderr.txt`, result.stderr)]);
      const loadavgAfter = os.loadavg();
      const sample = { id, label: target.label, url: target.url, config, arm, round, report: `${base}.json`, loadavgBefore, loadavgAfter,
        contended: [...loadavgBefore, ...loadavgAfter].some((load) => load > maxLoad), exitCode: result.code, status: "FAIL" };
      summary.samples.push(sample);
      if (result.code === 78) { sample.status = "SKIP"; summary.status = "SKIP"; exitCode = 78; break outer; }
      if (result.code !== 0) { sample.error = `shot exited ${result.code ?? result.signal}`; exitCode = 1; continue; }
      try {
        const report = JSON.parse(await readFile(`${base}.json`, "utf8"));
        const observed = report.evalResult;
        if (!observed || [observed.firstFrameMs, observed.firstFleetFrameMs, observed.crossfadeStartMs, observed.posterRemovedMs].some((n) => !Number.isFinite(n))
          || !(observed.renderedRevision > 0) || !(observed.renderedBoats > 0)) throw new Error("Missing first/fleet marks, rendered fleet revision, crossfade or poster removal; not a valid load sample");
        const rows = (report.waterfall ?? []).filter((row) => row.fullUrl?.startsWith(new URL(target.url).origin + "/"));
        if (!rows.length) throw new Error("Missing site waterfall; cannot report true network status/bytes");
        Object.assign(sample, { status: "PASS", firstFrameMs: observed.firstFrameMs, firstFleetFrameMs: observed.firstFleetFrameMs,
          crossfadeStartMs: observed.crossfadeStartMs, posterRemovedMs: observed.posterRemovedMs,
          renderedRevision: observed.renderedRevision, renderedBoats: observed.renderedBoats,
          wireBytes: rows.reduce((sum, row) => sum + (row.wire ?? 0), 0), requests: rows.length,
          true304Count: rows.filter((row) => (row.networkStatus ?? row.trueStatus ?? row.status) === 304).length,
          boot: report.stats?.boot ?? null, gpu: report.gpu, waterfall: rows, resources: observed.resources });
        console.log(`${id}: fleet ${Math.round(sample.firstFleetFrameMs)} ms; crossfade ${Math.round(sample.crossfadeStartMs)} ms; removed ${Math.round(sample.posterRemovedMs)} ms${sample.contended ? " [CONTENDED]" : ""}`);
      } catch (error) { sample.error = error.message; exitCode = 1; }
    }
  }
}
for (const target of urls) for (const config of selected) for (const arm of arms) {
  const samples = summary.samples.filter((s) => s.label === target.label && s.config === config && s.arm === arm && s.status === "PASS");
  summary.groups.push({ label: target.label, url: target.url, config, arm, n: samples.length,
    metrics: Object.fromEntries(metrics.map((metric) => [metric, distribution(samples.map((s) => s[metric]))])),
    boot: Object.fromEntries([...new Set(samples.flatMap((s) => Object.keys(s.boot ?? {})))].map((key) => [key, distribution(samples.map((s) => s.boot?.[key]))])) });
}
summary.meta.machine.loadavgEnd = os.loadavg();
summary.meta.machine.contended = summary.samples.some((s) => s.contended);
summary.meta.machine.classification = summary.meta.machine.contended ? "contended" : "quiet";
summary.meta.machine.caveat = "Load averages are a contention heuristic, not proof of GPU/thermal isolation.";
summary.status = exitCode === 78 ? "SKIP" : exitCode ? "FAIL" : "PASS";
if (values.baseline) {
  const baseline = JSON.parse(await readFile(resolve(values.baseline), "utf8"));
  summary.baseline = { file: resolve(values.baseline), differences: summary.groups.map((group) => {
    const previous = baseline.groups?.find((g) => g.label === group.label && g.config === group.config && g.arm === group.arm);
    return { label: group.label, config: group.config, arm: group.arm, previousUrl: previous?.url ?? null,
      metrics: Object.fromEntries(metrics.map((key) => {
        const before = previous?.metrics?.[key]?.median, after = group.metrics[key].median;
        return [key, { before: before ?? null, after, delta: Number.isFinite(before) && Number.isFinite(after) ? after - before : null,
          percent: before > 0 && Number.isFinite(after) ? 100 * (after - before) / before : null }];
      })) };
  }) };
}
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(summary, null, 2) + "\n");
console.log(`${summary.status}: ${out} (${summary.meta.machine.classification}; load ceiling ${maxLoad})`);
process.exitCode = exitCode;

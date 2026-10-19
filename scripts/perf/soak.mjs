#!/usr/bin/env node
/** Refresh/remount resource soak in ONE tab; no navigation between cycles. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { median, runShot } from "./frame.mjs";

const { values: a } = parseArgs({ options: {
  help: { type: "boolean" }, origin: { type: "string", default: "http://127.0.0.1:4180/" }, out: { type: "string", default: "outputs/perf/soak" },
  cycles: { type: "string", default: "12" }, refreshes: { type: "string", default: "3" }, settle: { type: "string", default: "3000" }, warmup: { type: "string", default: "3" },
  width: { type: "string", default: "1600" }, height: { type: "string", default: "1000" }, dpr: { type: "string", default: "1" },
  profile: { type: "string", default: "standard" }, machine: { type: "string", default: "contended" }, gc: { type: "boolean" }, audio: { type: "boolean" },
  "ready-timeout": { type: "string", default: "120" },
} });
if (a.help) {
  console.log(`Usage: node scripts/perf/soak.mjs [options]
  --origin URL --out DIR --cycles 12 --refreshes 3 --settle 3000 --warmup 3
  --width 1600 --height 1000 --dpr 1 --profile standard|igpu --machine contended|quiet
  --audio        exercise sound-ON lifecycle (default sound OFF)
  --gc           force GC before heap samples; record this intrusive choice explicitly
  --ready-timeout 120
Runs feed.refresh(all seven endpoints), waits for a coherent rendered revision, denies/re-admits
via the real viewport gate using CDP, all in one page. Reports renderer.info geometry/texture/program
counts, JS heap (CDP), worker targets + weakly tracked Worker lifetime, audio contexts, disposed-state
counters and post-warmup late-half growth trends. Plateau is an observation, not proof of no leaks.
Requires the React entry with the viewport gate, not the standalone harbour dev entry.`);
} else {
  await main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode ?? 1; });
}

async function main() {
  const cycles = Number(a.cycles), refreshes = Number(a.refreshes), warmup = Number(a.warmup);
  if (!Number.isInteger(cycles) || cycles < 4 || !Number.isInteger(refreshes) || refreshes < 1 || !Number.isInteger(warmup) || warmup < 0 || cycles - warmup < 4) throw new Error("need integer cycles/refreshes and at least four post-warmup cycles");
  if (!["standard", "igpu"].includes(a.profile) || !["contended", "quiet"].includes(a.machine)) throw new Error("invalid profile or machine");
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  const options = { cycles, refreshes, warmup, settle: Number(a.settle), width: Number(a.width), height: Number(a.height), dpr: Number(a.dpr), gc: !!a.gc, audio: !!a.audio, readyTimeoutMs: Number(a["ready-timeout"]) * 1000 };
  const url = new URL(a.origin);
  url.searchParams.set("intro", "0");
  const report = await runShot(["--url", url.href, "--cdp", "--init-script", `(${trackResources.toString()})();`, "--eval", `(${runSoak.toString()})(${JSON.stringify(options)})`, "--eval-wait", "0", "--seconds", "0", "--wait", "0", "--width", a.width, "--height", a.height, "--dpr", a.dpr, "--ready-timeout", a["ready-timeout"], "--timeout", String(Math.max(240, cycles * (options.readyTimeoutMs / 1000 + refreshes * 30 + options.settle / 500))), ...(a.profile === "igpu" ? ["--igpu"] : [])], resolve(out, "capture"));
  const samples = report.evalResult.samples;
  const trends = {};
  for (const phase of ["mounted", "disposed"]) {
    trends[phase] = {};
    const late = samples.filter((s) => s.phase === phase && s.cycle >= warmup);
    const window = late.slice(Math.floor(late.length / 2));
    for (const key of ["geometries", "textures", "programs", "heapBytes", "workerTargets", "trackedWorkers", "audioContexts"]) {
      const rows = window.filter((s) => Number.isFinite(s[key]));
      if (rows.length < 2) { trends[phase][key] = { verdict: "unavailable", samples: rows.length }; continue; }
      const xMean = rows.reduce((sum, s) => sum + s.cycle, 0) / rows.length;
      const yMean = rows.reduce((sum, s) => sum + s[key], 0) / rows.length;
      const slope = rows.reduce((sum, s) => sum + (s.cycle - xMean) * (s[key] - yMean), 0) / rows.reduce((sum, s) => sum + (s.cycle - xMean) ** 2, 0);
      const width = Math.max(1, Math.floor(rows.length / 3));
      const first = median(rows.slice(0, width).map((s) => s[key])), last = median(rows.slice(-width).map((s) => s[key]));
      const tolerance = key === "heapBytes" ? Math.max(1024 * 1024, first * 0.05) : key === "geometries" || key === "textures" || key === "programs" ? 1 : 0;
      trends[phase][key] = { samples: rows.length, firstMedian: first, lastMedian: last, delta: last - first, slopePerCycle: slope, tolerance, verdict: last - first > tolerance && slope > 0 ? "growth" : "plateau" };
    }
  }
  const summary = { meta: { tool: "soak", date: new Date().toISOString(), origin: a.origin, machine: a.machine, profile: a.profile, gpu: report.gpu, ...options, notes: "Late-half trends; heap without forced GC includes garbage. Logical renderer counters are not resident VRAM. Target counts may include browser-global workers; compare to cycle baseline." }, samples, trends, verdict: Object.values(trends).some((phase) => Object.values(phase).some((t) => t.verdict === "growth")) ? "growth" : "plateau", consoleErrors: report.consoleErrors };
  await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`Soak ${summary.verdict}: ${resolve(out, "summary.json")}`);
}

function trackResources() {
  try { localStorage.setItem("harbour.sound", "off"); } catch { /* private window */ }
  const workers = new Map(), audio = new Map();
  let workerId = 0, audioId = 0;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args); this.__soakId = ++workerId; workers.set(this.__soakId, new WeakRef(this)); }
    terminate() { workers.delete(this.__soakId); return super.terminate(); }
  };
  for (const name of ["AudioContext", "OfflineAudioContext"]) {
    const NativeContext = window[name];
    if (!NativeContext) continue;
    window[name] = class extends NativeContext {
      constructor(...args) { super(...args); audio.set(++audioId, new WeakRef(this)); }
    };
  }
  window.__soakResources = () => {
    for (const [id, ref] of workers) if (!ref.deref()) workers.delete(id);
    const states = [];
    for (const [id, ref] of audio) { const ctx = ref.deref(); if (!ctx) audio.delete(id); else states.push(ctx.state); }
    return { trackedWorkers: workers.size, workersCreated: workerId, audioContexts: states.filter((s) => s !== "closed").length, audioContextsCreated: audioId, audioStates: states };
  };
}

async function runSoak(options) {
  const samples = [];
  const waitFor = async (predicate, description) => {
    const deadline = performance.now() + options.readyTimeoutMs;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error(`Soak timed out: ${description}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const sample = async (cycle, phase, info) => {
    if (options.gc) await window.__cdp("HeapProfiler.collectGarbage", {});
    const { metrics } = await window.__cdp("Performance.getMetrics", {});
    const { targetInfos } = await window.__cdp("Target.getTargets", {});
    const workers = targetInfos.filter((t) => t.type === "worker");
    samples.push({ cycle, phase, ms: performance.now(), geometries: info?.memory.geometries ?? null, textures: info?.memory.textures ?? null, programs: info?.programs?.length ?? null, heapBytes: metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? performance.memory?.usedJSHeapSize ?? null, workerTargets: workers.length, workerUrls: workers.map((t) => t.url), ...window.__soakResources(), renderedRevision: window.__harbourStats?.renderedRevision ?? null });
  };
  await window.__cdp("Performance.enable", {});
  for (let cycle = 0; cycle < options.cycles; cycle++) {
    await waitFor(() => { const e = window.__harbour; return e && e.ready.size === e.systems.length && e.ctx.services.get("readiness")?.prepared && window.__harbourStats?.renderedRevision > 0; }, "mounted prepared fleet");
    let engine = window.__harbour;
    if (options.audio) {
      const activated = await window.__cdp("Runtime.evaluate", { expression: `(() => { const sound = window.__harbour.ctx.services.get("sound"); if (!sound) throw new Error("Missing sound controller"); if (sound.on && !sound.playing) sound.toggle(); if (!sound.on) sound.toggle(); })()`, userGesture: true, returnByValue: true });
      if (activated.exceptionDetails) throw new Error("Audio activation failed inside CDP user gesture");
      await waitFor(() => engine.ctx.services.get("sound")?.playing && window.__soakResources().audioStates.includes("running"), "sound-ON playback");
    }
    let feed = engine.ctx.services.get("feed");
    for (let refresh = 0; refresh < options.refreshes; refresh++) {
      const revision = engine.ctx.services.get("readiness").revision;
      await Promise.all(["stablecoins", "chains", "stability", "pegSummary", "stress", "safetyGrades", "mintBurn"].map((key) => feed.refresh(key)));
      await waitFor(() => window.__harbourStats?.renderedRevision > revision, "refreshed model rendered");
      const errors = Object.entries(feed.payloads).filter(([, value]) => value.error).map(([key, value]) => `${key}: ${value.error}`);
      if (errors.length) throw new Error(`Soak feed refresh failed: ${errors.join("; ")}`);
    }
    await new Promise((r) => setTimeout(r, options.settle));
    await sample(cycle, "mounted", engine.ctx.renderer.info);
    await window.__cdp("Emulation.setDeviceMetricsOverride", { width: 400, height: 400, deviceScaleFactor: options.dpr, mobile: false, screenWidth: options.width, screenHeight: options.height });
    await waitFor(() => engine.disposed && window.__harbour !== engine, "viewport denial disposes engine (React entry required)");
    const disposedCounts = { memory: { ...engine.ctx.renderer.info.memory }, programs: { length: engine.ctx.renderer.info.programs?.length ?? 0 } };
    feed = null;
    engine = null;
    await new Promise((r) => setTimeout(r, options.settle));
    await sample(cycle, "disposed", disposedCounts);
    await window.__cdp("Emulation.setDeviceMetricsOverride", { width: options.width, height: options.height, deviceScaleFactor: options.dpr, mobile: false, screenWidth: options.width, screenHeight: options.height });
  }
  await waitFor(() => window.__harbour && window.__harbourStats?.firstFrameMs != null, "final remount");
  return { samples };
}

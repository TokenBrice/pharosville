#!/usr/bin/env node
/** Q3: 1× auto-quality headroom and pressure evidence, separate from the DPR-2 extras sum. */
import os from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runShot } from "./frame.mjs";
import { percentile, positiveSamples, verdict, evidenceUrl } from "./extras-budget.mjs";
import { classifyGpu } from "../harbour/capture-provenance.mjs";

export const SUPERSAMPLE_VIEWS = [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }];
export function summarizeSupersample(s) {
  const trace = s?.trace ?? [], gpu = s?.gpuSamples?.map((v) => v.ms), deltas = s?.deltas;
  const tierChanges = trace.slice(1).filter((t, i) => t.tier !== trace[i].tier);
  return { trace, tierChanges, gpuP50Ms: positiveSamples(gpu) ? percentile(gpu, 0.5) : null,
    gpuP95Ms: positiveSamples(gpu) ? percentile(gpu, 0.95) : null,
    frameP95Ms: positiveSamples(deltas) ? percentile(deltas, 0.95) : null,
    frameMaxMs: positiveSamples(deltas) ? deltas.reduce((a, b) => Math.max(a, b), 0) : null };
}
export function evaluateSupersample(input) {
  const rows = [];
  let identity;
  for (const view of SUPERSAMPLE_VIEWS) for (let repeat = 1; repeat <= 3; repeat++) {
    const pair = [];
    for (const arm of ["off", "on"]) {
      const id = `${view.width}x${view.height}/${repeat}/${arm}`, c = input?.captures?.find((c) => c.id === id);
      if (c?.error && c.exitCode !== 78) rows.push({ id, status: "FAIL", reason: c.error, file: c.file });
      const r = c?.data, p = r?.provenance, s = r?.evalResult, stats = summarizeSupersample(s);
      const url = evidenceUrl(r?.url);
      const hardware = classifyGpu(p?.gpu) === "hardware" && /\bRTX\b/i.test(p.gpu);
      const raw = hardware && p.buildHash && p.fixtureHash && p.browser && p.backend && p.device?.platform && s?.auto === true && s.displayDpr === 1
        && p.effectiveState?.hour === 12.5 && p.effectiveState.weather?.band && p.effectiveState.season?.season
        && p.viewport?.width === view.width && p.viewport?.height === view.height && s.elapsedMs >= 30_000
        && s.gpuDropped === 0 && s.disjoint === 0 && stats.gpuP50Ms != null && stats.frameP95Ms != null && s.trace?.length
        && s.trace.every((t) => Number.isFinite(t.atMs) && Number.isInteger(t.rung) && Number.isFinite(t.dpr) && t.dpr > 0 && ["high", "medium", "low"].includes(t.tier)
          && Number.isInteger(t.width) && Number.isInteger(t.height) && t.width > 0 && t.height > 0
          && Math.abs(t.width - view.width * t.dpr) < 1 && Math.abs(t.height - view.height * t.dpr) < 1 && t.pixels === t.width * t.height && t.composerPairBytes === t.pixels * 16)
        && s.trace[0].tier === "high" && s.trace[0].atMs === 0 && s.trace.at(-1).atMs >= s.elapsedMs
        && url && !url.searchParams.has("quality") && !url.searchParams.has("dpr") && !url.searchParams.has("prof")
        && (arm === "off" ? url.searchParams.get("extras") === "-supersample" : !url.searchParams.has("extras"));
      if (Array.isArray(r?.consoleErrors) && r.consoleErrors.length) rows.push({ id, status: "FAIL", reason: "Console errors/warnings", file: c.file });
      if (!raw || !Array.isArray(r?.consoleErrors) || input?.machine !== "quiet" || input?.contended !== false || r.paced !== false) {
        rows.push({ id, status: "UNVERIFIED", reason: "Missing quiet auto-quality RTX 1× raw trace/interval/GPU evidence", file: c?.file ?? null }); continue;
      }
      const key = JSON.stringify([p.buildHash, p.fixtureHash, p.gpu, p.browser, p.backend, p.driver, p.device, p.effectiveState.hour, p.effectiveState.weather.band, p.effectiveState.season.season]);
      identity ??= key;
      if (identity !== key) { rows.push({ id, status: "UNVERIFIED", reason: "Build/fixture/RTX/browser/effective state mismatch", file: c.file }); continue; }
      const failed = stats.frameMaxMs > 50 || stats.frameP95Ms > 16.7 || stats.trace.some((t) => t.pixels > 8_300_000 || t.composerPairBytes > 8_300_000 * 16)
        || (arm === "on" && stats.trace.some((t) => t.tier !== "high"));
      const exercised = arm === "on" ? stats.trace.some((t) => t.dpr > 1) : stats.trace.every((t) => t.dpr <= 1);
      rows.push({ id, status: failed ? "FAIL" : exercised ? "PASS" : "UNVERIFIED", file: c.file,
        reason: failed ? "Tier drop, >50 ms frame, p95 >16.7 ms or >8.3 MP backing" : exercised ? "Matched auto-quality measurement" : "Supersampling switch was not exercised", ...stats });
      pair.push(s);
    }
    if (pair.length === 2 && pair[0].trace.some((t) => t.tier !== "high")) rows.push({ id: `${view.width}x${view.height}/${repeat}/control`, status: "UNVERIFIED", reason: "Control already drops tier; supersampling cannot be isolated" });
  }
  const art = input?.crispness;
  rows.push({ id: "crispness", status: art?.status === "FAIL" ? "FAIL" : art?.status === "PASS" && art.reviewer && art.evidence?.length ? "PASS" : "UNVERIFIED",
    reason: "Visible crispness gain requires separate native-frame art review", review: art ?? null });
  return { schemaVersion: 1, tool: "supersample-receipt", ...verdict(rows) };
}

/** Serialized in shot's page. Keep rAF clocks real; sample the completed governor ring outside its hot path. */
export async function observeSupersample({ seconds, timeoutMs }) {
  const e = window.__harbour;
  if (!e) throw new Error("No Harbour engine");
  const end = performance.now() + timeoutMs;
  while (!e.ctx.services.get("readiness")?.prepared || window.__harbourStats?.renderedRevision !== e.ctx.services.get("readiness").revision) {
    if (performance.now() > end) throw new Error("No prepared rendered fleet");
    await new Promise((done) => setTimeout(done, 100));
  }
  await new Promise((done) => setTimeout(done, 3500));
  const g = e.governor, renderer = e.ctx.renderer, gl = renderer.getContext();
  const deltas = [], trace = [], gpuSamples = [];
  let start, last, sampledAt = -Infinity, lastFrame = g.completedGpuSamples().at(-1)?.frame ?? 0, completed = g.gpuCompletedSamples, gpuDropped = 0;
  const startFrame = g.frameId, disjoint = g.gpuDisjointSamples;
  const collect = () => {
    const fresh = g.completedGpuSamples().filter((s) => s.frame > lastFrame);
    gpuDropped += Math.max(0, g.gpuCompletedSamples - completed - fresh.length);
    completed = g.gpuCompletedSamples;
    if (fresh.length) { gpuSamples.push(...fresh.filter((s) => s.frame > startFrame)); lastFrame = fresh.at(-1).frame; }
  };
  const snapshot = (atMs) => ({ atMs, rung: g.level, tier: g.tier, dpr: renderer.getPixelRatio(), width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight, pixels: gl.drawingBufferWidth * gl.drawingBufferHeight,
    // Two RGBA16F composer colours; logical allocation bound, not a resident-VRAM measurement.
    composerPairBytes: gl.drawingBufferWidth * gl.drawingBufferHeight * 16 });
  return new Promise((done, fail) => {
    const tick = () => {
      if (window.__harbour !== e || document.hidden) { fail(new Error("Measurement engine changed or page was hidden")); return; }
      const now = performance.now();
      if (start === undefined) { start = last = now; trace.push(snapshot(0)); }
      else { deltas.push(now - last); last = now; }
      const previous = trace.at(-1);
      if (g.level !== previous.rung || g.tier !== previous.tier || renderer.getPixelRatio() !== previous.dpr) trace.push(snapshot(now - start));
      if (now - sampledAt >= 100) { collect(); sampledAt = now; }
      if (now - start < seconds * 1000) requestAnimationFrame(tick);
      else {
        collect(); trace.push(snapshot(now - start));
        done({ auto: g.auto, displayDpr: devicePixelRatio, elapsedMs: now - start, deltas, trace, gpuSamples, gpuDropped,
          disjoint: g.gpuDisjointSamples - disjoint });
      }
    };
    requestAnimationFrame(tick);
  });
}

async function main() {
  const { values: a } = parseArgs({ options: { help: { type: "boolean" }, read: { type: "string" }, origin: { type: "string", default: "http://127.0.0.1:4180/" },
    snapshot: { type: "string" }, crispness: { type: "string" }, out: { type: "string", default: "outputs/perf/supersample" } } });
  if (a.help) { console.log("Usage: node scripts/perf/supersample-receipt.mjs --snapshot FILE [--origin URL --crispness reviewer.json --out DIR]\nOr --read manifest.json (captures:[{id,file}], machine,contended,crispness). Three 45s uncapped 1× auto-quality runs per arm at 1080p/1440p. Governor GPU queries stay enabled (prof=gpu would disable auto headroom). Logical composer colour bytes are reported, not VRAM. Crispness: {status,reviewer,evidence:[paths]}. Exit 0/1/78; missing visual review is UNVERIFIED."); return; }
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  let input;
  if (a.read) {
    const file = resolve(a.read);
    input = JSON.parse(await readFile(file, "utf8"));
    for (const c of input.captures ?? []) {
      try { c.data = JSON.parse(await readFile(resolve(dirname(file), c.file), "utf8")); }
      catch (e) { if (e.code !== "ENOENT") throw e; c.data = null; }
    }
  } else {
    if (!a.snapshot) throw new Error("--snapshot required");
    input = { machine: "quiet", contended: false, captures: [], crispness: a.crispness ? JSON.parse(await readFile(resolve(a.crispness), "utf8")) : null };
    const maxLoad = Math.min(4, os.availableParallelism() * 0.75);
    outer: for (const view of SUPERSAMPLE_VIEWS) for (let repeat = 1; repeat <= 3; repeat++) for (const arm of ["off", "on"]) {
      const id = `${view.width}x${view.height}/${repeat}/${arm}`, url = new URL(a.origin);
      for (const key of ["quality", "dpr", "extras", "prof"]) url.searchParams.delete(key);
      for (const [k, v] of Object.entries({ view: "heart", t: "12.5", intro: "0", ...(arm === "off" ? { extras: "-supersample" } : {}) })) url.searchParams.set(k, v);
      input.contended ||= os.loadavg().some((n) => n > maxLoad);
      try {
        const data = await runShot(["--url", url.href, "--uncapped", "--dpr", "1", "--width", String(view.width), "--height", String(view.height),
          "--snapshot", a.snapshot, "--wait", "0", "--seconds", "0", "--ready-timeout", "120", "--timeout", "240", "--eval-wait", "0",
          "--eval", `(${observeSupersample.toString()})(${JSON.stringify({ seconds: 45, timeoutMs: 120000 })})`], resolve(out, id));
        input.captures.push({ id, file: `${id}.json`, data });
      } catch (error) { input.captures.push({ id, file: `${id}.json`, error: error.message, exitCode: error.exitCode ?? 1 }); break outer; }
      input.contended ||= os.loadavg().some((n) => n > maxLoad);
    }
    await writeFile(resolve(out, "manifest.json"), JSON.stringify({ ...input, captures: input.captures.map(({ id, file, error, exitCode }) => ({ id, file, error, exitCode })) }, null, 2) + "\n");
  }
  if (a.crispness) input.crispness = JSON.parse(await readFile(resolve(a.crispness), "utf8"));
  const result = evaluateSupersample(input);
  await writeFile(resolve(out, "summary.json"), JSON.stringify({ ...result, ...input }, null, 2) + "\n");
  for (const r of result.rows) console.log(`${r.status} ${r.id}: GPU ${r.gpuP50Ms ?? "?"}/${r.gpuP95Ms ?? "?"} ms p50/p95, frame p95 ${r.frameP95Ms ?? "?"} ms; ${r.reason}`);
  process.exitCode = result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error(e.message); process.exit(e.code === "ENOENT" ? 78 : 1); });

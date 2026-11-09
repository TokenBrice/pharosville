#!/usr/bin/env node
/** The release arrival check uses only the serialized, real-GPU shot path. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runShot } from "../perf/frame.mjs";
import { classifyGpu } from "./capture-provenance.mjs";

export function evaluateArrival(report) {
  if (classifyGpu(report?.gpu) !== "hardware") return { status: "SKIP", exitCode: 78, reasons: ["No verified real GPU"] };
  const s = report.evalResult;
  const reasons = [];
  if (s?.simulation?.phase !== "ready" || s.simulation.unavailable !== false) reasons.push("Simulation is not ready");
  if (s?.lifecycle !== "READY") reasons.push("Lifecycle is not READY");
  if (!s?.readiness?.prepared || !(s.readiness.revision > 0) || !(s.readiness.boats > 0)) reasons.push("No prepared first fleet");
  if (!s?.readiness || s.frame?.revision !== s.readiness.revision || s.frame?.drawn !== s.readiness.boats
    || s.rendered?.revision !== s.readiness.revision || s.rendered?.drawn !== s.readiness.boats) reasons.push("Drawn fleet does not match readiness");
  if (!Number.isFinite(s?.firstFleetMs) || s.firstFleetMs < 0 || !s?.live || s.poster) reasons.push("Arrival did not complete");
  if (!Array.isArray(report.consoleErrors) || report.consoleErrors.length) reasons.push("Console errors/warnings or missing console evidence");
  return { status: reasons.length ? "FAIL" : "PASS", exitCode: reasons.length ? 1 : 0, reasons };
}

export async function observeArrival(timeoutMs) {
  const end = performance.now() + timeoutMs;
  let result;
  do {
    const e = window.__harbour;
    let lifecycle = null;
    const stop = e?.onLifecycle(({ state }) => { lifecycle = state; });
    stop?.();
    const services = e?.ctx.services;
    const r = services?.get("readiness"), f = services?.get("fleet-frame"), s = services?.get("simulation-status");
    let rendered = null;
    const unrender = e?.onRendered((frame) => { rendered = { ...frame }; });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    unrender?.();
    result = { lifecycle, readiness: r ? { ...r } : null, frame: f ? { revision: f.revision, drawn: f.drawn } : null,
      simulation: s ? { phase: s.phase, unavailable: s.unavailable } : null, rendered,
      firstFleetMs: performance.getEntriesByName("pv:first-fleet-frame")[0]?.startTime ?? null,
      live: document.documentElement.hasAttribute("data-pv-live"), poster: !!document.getElementById("pv-poster") };
    if (lifecycle === "FAILED") break;
    if (lifecycle === "READY" && r?.prepared && r.boats > 0 && s?.phase === "ready" && !s.unavailable
      && f?.revision === r.revision && f.drawn === r.boats && rendered?.revision === r.revision
      && rendered.drawn === r.boats && result.live && !result.poster && result.firstFleetMs != null) break;
    await new Promise((done) => setTimeout(done, 100));
  } while (performance.now() < end);
  return result;
}

async function main() {
  const { values: a } = parseArgs({ options: { help: { type: "boolean" }, url: { type: "string", default: "http://127.0.0.1:4180/" }, out: { type: "string", default: "outputs/perf/arrival" }, snapshot: { type: "string" }, "ready-timeout": { type: "string", default: "120" } } });
  if (a.help) { console.log("Usage: node scripts/harbour/arrival-smoke.mjs [--url URL --out DIR --snapshot FILE --ready-timeout 120]\nExit 0 PASS, 1 FAIL, 78 no real GPU/CI. Uses shot.mjs only."); return; }
  const timeout = Number(a["ready-timeout"]);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("Invalid ready-timeout");
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  let report, verdict;
  try {
    report = await runShot(["--url", a.url, "--human", "--wait", "0", "--seconds", "0", "--ready-timeout", String(timeout), "--timeout", String(timeout * 2 + 60), "--init-script", "try { localStorage.setItem('harbour.sound', 'off'); } catch {}", "--eval", `(${observeArrival.toString()})(${timeout * 1000})`, "--eval-wait", "0", ...(a.snapshot ? ["--snapshot", a.snapshot] : [])], resolve(out, "capture"));
    verdict = evaluateArrival(report);
  } catch (error) { verdict = { status: error.exitCode === 78 ? "SKIP" : "FAIL", exitCode: error.exitCode === 78 ? 78 : 1, reasons: [error.message] }; }
  await writeFile(resolve(out, "summary.json"), JSON.stringify({ ...verdict, provenance: report?.provenance ?? null, observation: report?.evalResult ?? null, consoleErrors: report?.consoleErrors ?? null }, null, 2) + "\n");
  console.log(`Arrival ${verdict.status}: ${out}`);
  process.exitCode = verdict.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

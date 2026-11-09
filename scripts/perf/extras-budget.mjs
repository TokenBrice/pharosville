#!/usr/bin/env node
/** Q2: matched RTX GPU deltas, charged to the Low frame in the same active state. */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { classifyGpu } from "../harbour/capture-provenance.mjs";
import { median } from "./frame.mjs";

export const EXTRA_STATES = [
  { id: "dawn", hour: 6.9, weather: "CALM", season: "summer", extras: ["crowns", "twilight"] },
  { id: "dusk", hour: 17.6, weather: "CALM", season: "summer", extras: ["crowns", "twilight"] },
  { id: "night", hour: 22, weather: "CALM", season: "summer", extras: ["nightsky"] },
  { id: "storm", hour: 12.5, weather: "DANGER", season: "winter", extras: ["storm", "precip"] },
  { id: "mirror", hour: 12.5, weather: "CALM", season: "summer", extras: ["mirror"] },
  ...["cranes", "murmuration", "splash", "doves"].map((stage) => ({ id: `score-${stage}`, hour: stage === "murmuration" ? 17 : 12.5,
    weather: "CALM", season: stage === "cranes" ? "autumn" : stage === "murmuration" ? "winter" : "summer", extras: ["score"],
    stage: stage === "doves" ? "doves=now" : `score=${stage}` })),
];
const M_PLUS = "none,+crowns,+twilight,+nightsky,+storm,+precip";

export function extrasMatrix() {
  return EXTRA_STATES.flatMap((state) => {
    const capture = (arm, quality, extras) => ({ id: `${state.id}/${arm}`, state: state.id, arm, quality, extras });
    const rows = [capture("yardstick", "low", "none"), capture("low-all", "low", "all,-supersample"), capture("high-none", "high", "none")];
    if (!state.stage) {
      rows.push(capture("medium-off", "medium", "none"), capture("medium-on", "medium", M_PLUS));
      rows.push(capture("high-off", "high", "all,-mirror,-supersample"), capture("high-on", "high", "all,-supersample"));
    }
    for (const name of state.extras) {
      if (name === "mirror") rows.push(capture(name, "high", "none,+mirror"));
      else if (["storm", "precip", "score"].includes(name)) {
        rows.push(capture(`${name}-low`, "low", `none,+${name}`));
        rows.push(capture(name, "medium", `none,+${name}`));
        if (name === "score") rows.push(capture("medium-off", "medium", "none"), capture("score-high", "high", "none,+score"));
      } else rows.push(capture(name, "medium", `none,+${name}`));
    }
    return rows;
  });
}

export function verdict(rows) {
  const status = rows.some((r) => r.status === "FAIL") ? "FAIL" : rows.some((r) => r.status !== "PASS") ? "UNVERIFIED" : "PASS";
  return { status, exitCode: status === "PASS" ? 0 : status === "FAIL" ? 1 : 78, rows };
}
export function budgetDelta(before, after, yardstick, fraction, noise = 0) {
  if (![before, after, yardstick, fraction, noise].every(Number.isFinite) || before <= 0 || after <= 0 || yardstick <= 0 || fraction < 0 || noise < 0) return { status: "UNVERIFIED" };
  const deltaMs = after - before, limitMs = fraction * yardstick + noise;
  return { status: deltaMs <= limitMs + 1e-9 ? "PASS" : "FAIL", deltaMs, limitMs, yardstickMs: yardstick, percentOfLow: 100 * deltaMs / yardstick, noiseMs: noise };
}
export function evidenceUrl(value) {
  try { return new URL(value); } catch { return null; }
}
export const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
export const positiveSamples = (values) => Array.isArray(values) && values.length >= 100 && values.every((v) => Number.isFinite(v) && v > 0);

/** Reject labels/rounded medians without the underlying, matched, non-disjoint samples. */
export function frameEvidence(summary, spec, state) {
  const m = summary?.meta, s = summary?.scenarios?.[0];
  if (!m || m.machine !== "quiet" || m.contended !== false || m.prof !== "gpu" || !m.uncapped || m.apiLatency !== "replayed"
    || !(m.warmupMs >= 3500) || m.quality !== spec.quality || summary.scenarios.length !== 1 || s?.runs?.length !== 3
    || s.view !== "heart" || s.displayDpr !== 2 || s.hour !== state.hour || s.requestedWeather !== state.weather || s.season !== state.season) return null;
  const values = [], first = s.runs[0].provenance;
  for (const r of s.runs) {
    const p = r.provenance;
    let raw = r.rawGpuSamples;
    if (state.stage) {
      const stage = new URLSearchParams(state.stage).get("score") ?? "doves";
      if (!Array.isArray(r.extraActivity) || !r.extraActivity.some((a) => a.stage === stage && a.recognized)) return null;
      if (spec.extras.includes("+score") || spec.extras.startsWith("all")) {
        const active = new Set(r.extraActivity.filter((a) => a.stage === stage && a.recognized && a.active).map((a) => a.frame));
        raw = raw?.filter((s) => active.has(s.frame));
      }
    }
    const samples = raw?.map((v) => v.ms);
    if (!p || !Number.isInteger(p.viewport?.backingWidth) || !Number.isInteger(p.viewport?.backingHeight)
      || !(p.viewport.backingWidth > 0 && p.viewport.backingHeight > 0) || p.viewport.backingWidth * p.viewport.backingHeight > 4_000_000
      || Math.abs(p.viewport.backingWidth - 2560 * p.dpr) >= 1 || Math.abs(p.viewport.backingHeight - 1600 * p.dpr) >= 1
      || classifyGpu(p.gpu) !== "hardware" || !/\bRTX\b/i.test(p.gpu) || !p.buildHash || !p.fixtureHash || !p.browser || !p.backend || !p.device?.platform
      || p.viewport?.width !== 2560 || p.viewport?.height !== 1600 || !Number.isFinite(p.dpr) || p.dpr <= 0
      || p.effectiveState?.quality !== spec.quality || !Number.isFinite(p.effectiveState.hour) || Math.abs(p.effectiveState.hour - state.hour) > 1e-6 || p.effectiveState.weather?.band !== state.weather
      || p.effectiveState.season?.season !== state.season || r.setup?.quality !== spec.quality || r.stats?.quality !== spec.quality
      || r.setup?.effectiveDpr !== p.dpr || r.stats?.dpr !== p.dpr || r.steadyProgramsCreated !== 0 || r.pendingQueries !== 0 || r.disjointPolls !== 0
      || !Array.isArray(r.consoleErrors) || r.consoleErrors.length || !(r.timing?.elapsedMs >= 30_000) || !positiveSamples(r.timing?.deltas)
      || !positiveSamples(samples) || r.timing?.states?.length !== 1 || r.timing.states[0] !== `${spec.quality}|${p.dpr}`
      || ["gpu", "browser", "backend", "driver", "buildHash", "fixtureHash", "viewport", "dpr"].some((k) => JSON.stringify(p[k]) !== JSON.stringify(first?.[k]))) return null;
    values.push(percentile(samples, 0.5));
  }
  return { p50Ms: median(values), noiseMs: Math.max(...values) - Math.min(...values), provenance: first };
}

export function evaluateExtras(input) {
  const rows = [], measured = new Map(), specs = extrasMatrix();
  let build = null;
  const fixtures = new Map();
  if (new Set(input?.captures?.map((c) => c.id)).size !== input?.captures?.length) rows.push({ id: "manifest", status: "UNVERIFIED", reason: "Missing manifest or duplicate capture ids" });
  for (const spec of specs) {
    const entry = input?.captures?.find((c) => c.id === spec.id);
    const state = EXTRA_STATES.find((s) => s.id === spec.state);
    const data = frameEvidence(entry?.data, spec, state);
    const meta = entry?.data?.meta;
    const url = evidenceUrl(meta?.origin);
    if (entry?.data?.scenarios?.some((s) => s.runs?.some((r) => r.status === "FAIL" || r.consoleErrors?.length))) rows.push({ id: spec.id, status: "FAIL", reason: "Capture or console failure", file: entry.file });
    if (!data || url?.searchParams.get("extras") !== spec.extras || (state.stage && (!url || new URLSearchParams(state.stage).get("score") !== url.searchParams.get("score") || new URLSearchParams(state.stage).get("doves") !== url.searchParams.get("doves")))) {
      rows.push({ id: spec.id, status: "UNVERIFIED", reason: "Missing/mismatched quiet RTX raw samples, active-state controls or extras switch", file: entry?.file ?? null }); continue;
    }
    const identity = JSON.stringify([data.provenance.buildHash, data.provenance.gpu, data.provenance.browser, data.provenance.backend, data.provenance.driver]);
    build ??= identity;
    if (build !== identity) { rows.push({ id: spec.id, status: "UNVERIFIED", reason: "All captures must use one build and RTX/browser/backend", file: entry.file }); continue; }
    const fixture = fixtures.get(state.weather);
    if (fixture && fixture !== data.provenance.fixtureHash) { rows.push({ id: spec.id, status: "UNVERIFIED", reason: "Use one immutable snapshot per weather state" }); continue; }
    fixtures.set(state.weather, data.provenance.fixtureHash);
    measured.set(spec.id, data);
  }
  for (const state of EXTRA_STATES) {
    const get = (arm) => measured.get(`${state.id}/${arm}`);
    const y = get("yardstick");
    const compare = (id, before, after, fraction, noise = 0) => rows.push({ id: `${state.id}/${id}`, ...budgetDelta(get(before)?.p50Ms, get(after)?.p50Ms, y?.p50Ms, fraction, noise),
      files: ["yardstick", before, after].map((arm) => input?.captures?.find((c) => c.id === `${state.id}/${arm}`)?.file ?? null),
      reason: fraction ? `Δ GPU p50 ≤ ${fraction * 100}% of same-state Low` : "GPU p50 change within baseline run-to-run noise" });
    // No tolerance is borrowed from the new code: noise is the range of three off repetitions.
    compare("low-nonregression", "yardstick", "low-all", 0, y?.noiseMs);
    if (!state.stage) {
      compare("class-medium", "medium-off", "medium-on", 0.1);
      compare("class-high", "high-off", "high-on", 0.2);
    }
    for (const name of state.extras) {
      if (["storm", "precip", "score"].includes(name)) compare(`${name}-noise`, "yardstick", `${name}-low`, 0, y?.noiseMs);
      if (name === "score") {
        compare("score-medium-noise", "medium-off", "score", 0, get("medium-off")?.noiseMs);
        compare("score-high-noise", "high-none", "score-high", 0, get("high-none")?.noiseMs);
      }
      if (name !== "score") compare(`${name}-budget`, name === "mirror" ? "high-none" : "medium-off", name, name === "mirror" ? 0.2 : 0.1);
    }
    // Fixture/backing identity must match within a state, even across tier arms.
    const p = y?.provenance;
    for (const spec of specs.filter((s) => s.state === state.id)) {
      const q = get(spec.arm)?.provenance;
      if (p && q && ["fixtureHash", "viewport", "dpr"].some((k) => JSON.stringify(p[k]) !== JSON.stringify(q[k]))) rows.push({ id: spec.id, status: "UNVERIFIED", reason: "State fixtures or effective backing differ" });
    }
  }
  return { tool: "extras-budget", schemaVersion: 1, ...verdict(rows) };
}

/** DEV score capture seam: retain only GPU frames in which the requested cue actually runs. */
export function observeScoreActivity(stage) {
  const durations = { cranes: 70, murmuration: 100, splash: 20 };
  const poll = () => {
    const e = window.__harbour;
    if (!e || !window.__harbourLife) { requestAnimationFrame(poll); return; }
    const activity = [];
    e.onRendered(() => {
      const life = window.__harbourLife?.life, profiler = window.__gpuPasses;
      const stats = window.__harbourStats;
      if (!life || !profiler || !stats) return;
      const last = life.score?.log?.at(-1);
      const recognized = stage === "doves" ? typeof life.gulls?.dovesOut === "boolean" : (life.scoreOn === false || Array.isArray(life.score?.log));
      const active = stage === "doves" ? life.gulls?.dovesOut === true : last?.cue === stage && e.clock.elapsed >= last.t && e.clock.elapsed - last.t < durations[stage];
      // GpuPassProfiler advances its frame after composition, before onRendered publication.
      activity.push({ frame: profiler.frame - 1, stage, recognized, active });
      if (activity.length > 10000) activity.splice(0, 1000);
      stats.extraActivity = activity;
    });
  };
  requestAnimationFrame(poll);
}

export async function runFrame(args) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, ["scripts/perf/frame.mjs", ...args], { stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => done(code ?? 1));
  });
}
async function main() {
  const { values: a } = parseArgs({ options: { help: { type: "boolean" }, read: { type: "string" }, origin: { type: "string", default: "http://127.0.0.1:4180/" },
    snapshot: { type: "string" }, out: { type: "string", default: "outputs/perf/extras" } } });
  if (a.help) { console.log("Usage: node scripts/perf/extras-budget.mjs --snapshot 'DIR/{weather}.json' [--origin URL --out DIR]\nOr --read manifest.json ({captures:[{id,file}]} paths relative to manifest). Three 30s repetitions per arm; serialized frame.mjs/shot.mjs only. Uses score=cranes|murmuration|splash and doves=now; these stage flags require a DEV acceptance artifact. Never mix artifacts. Exit 0 PASS / 1 FAIL / 78 UNVERIFIED. Art approval is separate."); return; }
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  let input;
  if (a.read) {
    const file = resolve(a.read);
    input = JSON.parse(await readFile(file, "utf8"));
    for (const c of input.captures ?? []) {
      try { c.data = JSON.parse(await readFile(resolve(dirname(file), c.file), "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; c.data = null; }
    }
  } else {
    if (!a.snapshot) throw new Error("--snapshot is required: live/mixed fixtures cannot prove Q2");
    input = { captures: [] };
    for (const spec of extrasMatrix()) {
      const state = EXTRA_STATES.find((s) => s.id === spec.state), origin = new URL(a.origin);
      origin.searchParams.set("extras", spec.extras);
      for (const [k, v] of new URLSearchParams(state.stage)) origin.searchParams.set(k, v);
      const dir = resolve(out, spec.id);
      const activityFile = resolve(out, state.id, "activity-init.js");
      if (state.stage) {
        await mkdir(dirname(activityFile), { recursive: true });
        const stage = new URLSearchParams(state.stage).get("score") ?? "doves";
        await writeFile(activityFile, `(${observeScoreActivity.toString()})(${JSON.stringify(stage)});`);
      }
      const code = await runFrame(["--origin", origin.href, "--out", dir, "--views", "heart", "--hours", String(state.hour), "--weather", state.weather,
        "--seasons", state.season, "--profiles", "standard", "--dprs", "2", "--quality", spec.quality, "--prof", "gpu", "--machine", "quiet",
        ...(state.stage ? ["--init-script", activityFile] : []), "--width", "2560", "--height", "1600", "--runs", "3", "--seconds", "30", "--snapshot", a.snapshot]);
      let data = null;
      try { data = JSON.parse(await readFile(resolve(dir, "summary.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
      input.captures.push({ id: spec.id, file: `${spec.id}/summary.json`, data });
      await writeFile(resolve(out, "manifest.json"), JSON.stringify({ captures: input.captures.map(({ id, file }) => ({ id, file })) }, null, 2) + "\n");
      if (code !== 0) break;
    }
  }
  const result = evaluateExtras(input);
  await writeFile(resolve(out, "summary.json"), JSON.stringify({ ...result, captures: input.captures }, null, 2) + "\n");
  for (const r of result.rows) console.log(`${r.status} ${r.id}: ${r.deltaMs == null ? r.reason ?? "missing samples" : `Δ ${r.deltaMs.toFixed(4)} ms / limit ${r.limitMs.toFixed(4)} ms (${r.percentOfLow.toFixed(2)}% Low)`}`);
  console.log(`Extras ${result.status}: ${out}`);
  process.exitCode = result.exitCode;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((e) => { console.error(e.message); process.exitCode = e.code === "ENOENT" ? 78 : 1; });

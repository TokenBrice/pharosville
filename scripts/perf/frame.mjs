#!/usr/bin/env node
/** Steady real-GPU matrix. All browser work goes through npm run preview and its shared lock. */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export async function runShot(args, base) {
  if (process.env.CI && process.env.CI !== "false") throw Object.assign(new Error("SKIP: real-GPU performance captures are unavailable in CI (not PASS)"), { exitCode: 78 });
  await mkdir(dirname(base), { recursive: true });
  const log = createWriteStream(`${base}.log`);
  const code = await new Promise((done, reject) => {
    const child = spawn("npm", ["run", "preview", "--", ...args, "--json", `${base}.json`, "--out", `${base}.png`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once("error", reject);
    child.once("close", (code) => done(code ?? 1));
  }).finally(() => new Promise((done) => log.end(done)));
  if (code !== 0) throw Object.assign(new Error(`preview exited ${code}; see ${base}.log`), { exitCode: code });
  return JSON.parse(await readFile(`${base}.json`, "utf8"));
}

export function median(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : null;
}

async function main() {
  const { values: a } = parseArgs({ options: {
    help: { type: "boolean" }, origin: { type: "string", default: "http://127.0.0.1:4180/" }, out: { type: "string", default: "outputs/perf/frame" },
    views: { type: "string", default: "heart,overview" }, hours: { type: "string", default: "12.5,22" }, seasons: { type: "string", default: "summer,winter" },
    weather: { type: "string", default: "CALM,DANGER" }, dews: { type: "string" }, profiles: { type: "string", default: "standard,igpu" }, dprs: { type: "string", default: "1,2" },
    runs: { type: "string", default: "3" }, seconds: { type: "string", default: "6" }, wait: { type: "string", default: "6000" }, settle: { type: "string", default: "3500" },
    quality: { type: "string", default: "high" }, prof: { type: "string", default: "gpu" }, machine: { type: "string", default: "contended" },
    width: { type: "string", default: "1600" }, height: { type: "string", default: "1000" }, "ready-timeout": { type: "string", default: "120" },
    probes: { type: "string", default: "baseline" }, timerless: { type: "boolean" }, "init-script": { type: "string" },
  } });
  if (a.help) {
    console.log(`Usage: node scripts/perf/frame.mjs [options]
  --origin URL                 production-faithful origin (default http://127.0.0.1:4180/)
  --out DIR --runs 3 --seconds 6 --wait 6000 --settle 3500
  --views heart,overview,closest --hours 12.5,18.5,22 --seasons summer,winter
  --weather CALM,DANGER | --dews 0,4  DEV overrides; effective weather is always recorded
  --profiles standard,igpu --dprs 1,2 --quality high|medium|low|auto
  --prof gpu|none --timerless --machine contended|quiet --width 1600 --height 1000
  --probes baseline,island-fragment-flat,ocean-fragment-flat,island-vertex-work,ocean-vertex-work,island-fragment-work,ocean-fragment-work
  --init-script FILE --ready-timeout 120
All runs are uncapped and sequential. Medians are medians of run summaries, not pooled frames.
GPU sums are completed submission intervals, NOT presentation/FPS. Sample counts and pending/disjoint
counts are retained; profiler overhead is uncalibrated. Pair prof=gpu with prof=none controls.
Source probes change ONLY selected main-scene shaders in the capture page (not depth/shadow shaders).
Fragment-flat keeps geometry and authored discard coverage, removing color/material output work.
Vertex-work/fragment-work add 32 dependent ALU iterations with a runtime-zero output weight (same
pixels/density). Compare these diagnostic sensitivity slopes with baseline; not shipping art variants.
Production ignores DEV weather overrides: requested vs effective weather is checked, never assumed.`);
    return;
  }
  const list = (s) => s.split(",").map((v) => v.trim()).filter(Boolean);
  const views = list(a.views), hours = list(a.hours), seasons = list(a.seasons), weather = list(a.dews ?? a.weather), profiles = list(a.profiles), dprs = list(a.dprs), probes = list(a.probes);
  if (![a.runs, a.seconds, a.width, a.height, a["ready-timeout"]].every((v) => Number(v) > 0) || !Number.isInteger(Number(a.runs))) throw new Error("runs/dimensions/durations must be positive (runs an integer)");
  if (!["contended", "quiet"].includes(a.machine) || !["gpu", "none"].includes(a.prof) || !["auto", "high", "medium", "low"].includes(a.quality)) throw new Error("invalid machine, profiler, or quality");
  if (profiles.some((v) => !["standard", "igpu"].includes(v)) || dprs.some((v) => !["1", "2"].includes(v)) || views.some((v) => !["heart", "overview", "closest"].includes(v))) throw new Error("invalid profile, DPR, or view");
  const allowedProbes = ["baseline", "island-fragment-flat", "ocean-fragment-flat", "island-vertex-work", "ocean-vertex-work", "island-fragment-work", "ocean-fragment-work"];
  if (probes.some((v) => !allowedProbes.includes(v))) throw new Error("unknown source probe");
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  const init = (a["init-script"] ? await readFile(resolve(a["init-script"]), "utf8") : "") + (a.timerless ? `;(() => { const original = WebGL2RenderingContext.prototype.getExtension; WebGL2RenderingContext.prototype.getExtension = function(name) { return name === 'EXT_disjoint_timer_query_webgl2' ? null : original.call(this, name); }; })();` : "");
  const initFile = resolve(out, "capture-init.js");
  if (init) await writeFile(initFile, init);
  const summary = { meta: { tool: "frame", date: new Date().toISOString(), origin: a.origin, machine: a.machine, uncapped: true, prof: a.prof, timerless: !!a.timerless, quality: a.quality, displayDprs: dprs, thermal: "not recorded", browser: "shared Chrome; GPU identity in each run", notes: "No CI GPU pass implied. Compare quiet same-state runs only." }, scenarios: [] };
  let failure;
  outer: for (const profile of profiles) for (const dpr of dprs) for (const view of views) for (const hour of hours) for (const season of seasons) for (const state of weather) for (const probe of probes) {
    const id = `${profile}-d${dpr}-${view}-t${hour}-${season}-${state}-${probe}`;
    const scenario = { id, profile, displayDpr: Number(dpr), view, hour: Number(hour), season, requestedWeather: state, probe, runs: [] };
    summary.scenarios.push(scenario);
    for (let run = 1; run <= Number(a.runs); run++) {
      const url = new URL(a.origin);
      for (const key of ["view", "t", "season", "weather", "dews", "quality", "dpr", "prof"]) url.searchParams.delete(key);
      for (const [k, v] of Object.entries({ view: view === "closest" ? "heart" : view, t: hour, season, [a.dews ? "dews" : "weather"]: state, intro: "0", ...(a.quality === "auto" ? {} : { quality: a.quality, dpr }), ...(a.prof === "gpu" ? { prof: "gpu" } : {}) })) url.searchParams.set(k, v);
      const evaluate = `(${prepareFrame.toString()})(${JSON.stringify({ settle: Number(a.settle), closest: view === "closest", probe, requestedWeather: a.dews ? null : state })})`;
      const base = resolve(out, id, `run-${run}`);
      try {
        const report = await runShot(["--url", url.href, "--uncapped", ...(profile === "igpu" ? ["--igpu"] : []), "--dpr", dpr, "--width", a.width, "--height", a.height, "--seconds", a.seconds, "--wait", a.wait, "--ready-timeout", a["ready-timeout"], "--eval", evaluate, "--eval-wait", "0", ...(init ? ["--init-script-file", initFile] : [])], base);
        scenario.runs.push({ run, file: `${id}/run-${run}.json`, fps: report.fps, p50Ms: report.p50, p95Ms: report.p95, maxMs: report.max, elapsedMs: report.timing.elapsedMs, gpu: report.gpu, gpuTotal: report.gpuPasses?.total ?? report.gpuSampleDistribution, gpuSamples: report.gpuPasses?.sampledFrames ?? report.gpuSampleDistribution.samples, pendingQueries: report.gpuPasses?.currentPendingQueries ?? report.stats?.gpuPendingQueries ?? 0, disjointPolls: report.gpuPasses?.disjointPolls ?? 0, stats: report.stats, setup: report.evalResult, steadyProgramsCreated: report.stats.programs - report.evalResult.programs, consoleErrors: report.consoleErrors });
      } catch (error) { scenario.runs.push({ run, error: error.message }); failure = error; break outer; }
    }
    scenario.medians = Object.fromEntries(["fps", "p50Ms", "p95Ms", "maxMs", "elapsedMs", "gpuSamples", "steadyProgramsCreated"].map((key) => [key, median(scenario.runs.map((r) => r[key]))]));
    scenario.gpuMedians = Object.fromEntries(["p10Ms", "p50Ms", "p95Ms"].map((key) => [key, median(scenario.runs.map((r) => r.gpuTotal?.[key]))]));
    scenario.stable = scenario.runs.every((r) => r.steadyProgramsCreated === 0 && r.pendingQueries === 0 && r.stats.quality === r.setup.quality && r.stats.dpr === r.setup.effectiveDpr && r.stats.quality === scenario.runs[0].stats.quality && r.stats.dpr === scenario.runs[0].stats.dpr);
    await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
  }
  await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`Frame matrix: ${resolve(out, "summary.json")} (${a.machine})`);
  if (failure) throw failure;
}

async function prepareFrame({ settle, closest, probe, requestedWeather }) {
  const e = window.__harbour;
  if (!e) throw new Error("No Harbour engine");
  const end = performance.now() + 120000;
  while (e.ready.size < e.systems.length || !e.ctx.services.get("readiness")?.prepared || window.__harbourStats?.renderedRevision < e.ctx.services.get("readiness").revision) {
    if (performance.now() > end) throw new Error("Systems and a prepared rendered model did not become ready");
    await new Promise((r) => setTimeout(r, 100));
  }
  if (closest) { e.ctx.rig.goalDistance = e.ctx.rig.minDistance; e.ctx.rig.distance = e.ctx.rig.minDistance; e.ctx.rig.update(0); }
  let probeMaterials = 0;
  if (probe !== "baseline") {
    const ocean = probe.startsWith("ocean-");
    const selected = new Map();
    e.ctx.scene.traverse((object) => {
      if (!object.isMesh || (ocean ? object.name !== "ocean" : !/^island(?:_|-merged-|$)/i.test(object.name))) return;
      const clone = (source) => {
        if (selected.has(source)) return selected.get(source);
        const material = source.clone();
        if (source.isShaderMaterial) material.uniforms = source.uniforms;
        const original = source.onBeforeCompile;
        material.onBeforeCompile = function(shader, renderer) {
          original.call(source, shader, renderer);
          if (probe.endsWith("fragment-flat")) {
            const before = shader.fragmentShader;
            shader.fragmentShader = ocean
              ? before.replace("gl_FragColor = vec4(col, 1.0);", "gl_FragColor = vec4(0.35, 0.45, 0.5, 1.0);")
              : before.replace("#include <opaque_fragment>", "gl_FragColor = vec4(0.35, 0.45, 0.5, diffuseColor.a);");
            if (shader.fragmentShader === before) throw new Error(`Source contract changed for ${probe}`);
          } else {
            const vertex = probe.endsWith("vertex-work"), key = vertex ? "vertexShader" : "fragmentShader";
            shader.uniforms.pvProbeZero = { value: 0 };
            const input = vertex ? "position.x + position.z" : "gl_FragCoord.x + gl_FragCoord.y";
            const output = vertex ? "gl_Position.x" : "gl_FragColor.x";
            shader[key] = `uniform float pvProbeZero;\\n${shader[key]}`.replace(/}\\s*$/, `float pvProbe = ${input}; for (int pvI=0; pvI<32; pvI++) { pvProbe = sin(pvProbe) * 1.0001 + float(pvI) * 0.01; } ${output} += pvProbe * pvProbeZero; }`);
          }
        };
        material.customProgramCacheKey = () => `${source.customProgramCacheKey()}:perf-source-probe:${probe}`;
        material.needsUpdate = true;
        selected.set(source, material);
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    if (!selected.size) throw new Error(`No main-scene material matched ${probe}`);
    probeMaterials = selected.size;
  }
  await new Promise((r) => setTimeout(r, settle));
  const weather = e.ctx.services.get("weather");
  if (requestedWeather && weather?.band !== requestedWeather) throw new Error(`Requested ${requestedWeather}, rendered ${weather?.band}; use DEV overrides or a matching API fixture`);
  return { programs: e.ctx.renderer.info.programs?.length ?? 0, quality: window.__harbourStats.quality, effectiveDpr: e.ctx.renderer.getPixelRatio(), weather: weather ? { ...weather.state } : null, season: e.ctx.services.get("season")?.season, renderedRevision: window.__harbourStats.renderedRevision, renderedBoats: window.__harbourStats.renderedBoats, probe, probeMaterials };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode ?? 1; });

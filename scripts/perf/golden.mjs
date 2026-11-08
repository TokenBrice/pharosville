#!/usr/bin/env node
/** Deterministic stills and fixed-step normal-motion filmstrips, through the shared preview driver. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { initializeCapture, freezeCapture } from "./golden-controls.mjs";
import { runShot } from "./frame.mjs";

const { values: a } = parseArgs({ options: {
  help: { type: "boolean" }, origin: { type: "string", default: "http://127.0.0.1:4180/" }, out: { type: "string", default: "outputs/perf/golden" }, snapshot: { type: "string" },
  views: { type: "string", default: "heart,overview,closest" }, hours: { type: "string", default: "12.5,18.5,22" }, seasons: { type: "string", default: "summer,winter" }, weather: { type: "string", default: "CALM,DANGER" },
  dprs: { type: "string", default: "1,2" }, quality: { type: "string", default: "high" }, profile: { type: "string", default: "standard" },
  width: { type: "string", default: "1600" }, height: { type: "string", default: "1000" }, epoch: { type: "string" }, seed: { type: "string", default: "20261019" }, elapsed: { type: "string", default: "120" },
  filmstrip: { type: "string" }, interval: { type: "string", default: "100" }, "ready-timeout": { type: "string", default: "120" },
  "empty-fixture": { type: "boolean" },
  "record-snapshot": { type: "string" },
} });
if (a.help) {
  console.log(`Usage: node scripts/perf/golden.mjs --snapshot FILE [options]
  --record-snapshot FILE        record seven real same-origin API responses once; reuse for both arms
  --origin URL --out DIR        default production-faithful http://127.0.0.1:4180/; outputs/perf/golden
  --views heart,overview,closest --hours 12.5,18.5,22 --seasons summer,winter --weather CALM,DANGER
  --dprs 1,2 --quality high|medium|low --profile standard|igpu --width 1600 --height 1000
  --empty-fixture             allow zero office flags only for a verified empty fleet
  --epoch MS --seed 20261019 --elapsed 120 --ready-timeout 120
  --filmstrip N --interval MS   N normal-motion frames, fixed simulation interval (default 100 ms)
Stills pin Date/RNG, boot rAF timestamps, reduced motion, ALL MotionClocks (including ocean), eased
sea/sky/fleet state, weather/engine elapsed, camera, snow and wake history. Final renders use delta=0
and forced shadow refresh. Filmstrips use normal motion and <=1/60s manual steps, not wall-time sleeps.
Snapshots retain actual data/freshness. DEV weather overrides are asserted, not silently trusted on dist.
Run on a DEV origin for override matrices or supply one matching frozen API snapshot per weather case.
Compare same GPU/profile/DPR/snapshot hash with compare.mjs; human native-resolution review is required.`);
} else {
  await main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode ?? 1; });
}

async function main() {
  if (a["record-snapshot"]) {
    const snapshot = { epoch: Date.now(), responses: {} };
    for (const path of ["/api/stablecoins", "/api/chains", "/api/stability-index?detail=true", "/api/peg-summary", "/api/stress-signals", "/api/safety-grades", "/api/mint-burn-flows"]) {
      const response = await fetch(new URL(path, a.origin), { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`Snapshot ${path}: HTTP ${response.status}`);
      const body = await response.text();
      JSON.parse(body);
      snapshot.responses[path] = { status: response.status, headers: Object.fromEntries(response.headers), body };
    }
    await mkdir(resolve(a["record-snapshot"], ".."), { recursive: true });
    await writeFile(resolve(a["record-snapshot"]), JSON.stringify(snapshot));
    console.log(`Recorded immutable API snapshot: ${resolve(a["record-snapshot"])}`);
    if (!a.snapshot) return;
  }
  if (!a.snapshot) throw new Error("--snapshot FILE is required (use --record-snapshot FILE once; do not re-record between arms)");
  const snapshotText = await readFile(resolve(a.snapshot), "utf8"), snapshot = JSON.parse(snapshotText);
  if (!snapshot.responses || !Number.isFinite(Number(a.epoch ?? snapshot.epoch))) throw new Error("Snapshot must contain responses and an epoch (or supply --epoch)");
  const filmstrip = Number(a.filmstrip ?? 0), interval = Number(a.interval);
  if (a.filmstrip && (!Number.isInteger(filmstrip) || filmstrip < 1 || !(interval > 0))) throw new Error("--filmstrip must be a positive frame count; --interval must be positive");
  if (!["standard", "igpu"].includes(a.profile) || !["high", "medium", "low"].includes(a.quality)) throw new Error("invalid profile or quality");
  const list = (value) => value.split(",").map((v) => v.trim()).filter(Boolean);
  const views = list(a.views), hours = list(a.hours), seasons = list(a.seasons), weather = list(a.weather), dprs = list(a.dprs);
  if (views.some((v) => !["heart", "overview", "closest"].includes(v)) || seasons.some((v) => !["spring", "summer", "autumn", "winter"].includes(v)) || weather.some((v) => !["CALM", "WATCH", "ALERT", "WARNING", "DANGER"].includes(v)) || dprs.some((v) => !["1", "2"].includes(v))) throw new Error("invalid view/season/weather/DPR matrix");
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  const controls = { epoch: Number(a.epoch ?? snapshot.epoch), seed: Number(a.seed), elapsed: Number(a.elapsed), filmstrip, interval, emptyFixture: !!a["empty-fixture"] };
  const initFile = resolve(out, "capture-init.js");
  await writeFile(initFile, `(${initializeCapture.toString()})(${JSON.stringify(snapshot)},${JSON.stringify(controls)});`);
  const manifest = { meta: { tool: "golden", date: new Date().toISOString(), origin: a.origin, snapshot: resolve(a.snapshot), snapshotSha256: createHash("sha256").update(snapshotText).digest("hex"), profile: a.profile, quality: a.quality, ...controls, protocol: "pinned Date/RNG/boot-rAF; converged private clocks and uniforms; zero-delta stills or fixed-step normal motion", humanReviewRequired: true }, captures: [] };
  let failure;
  outer: for (const dpr of dprs) for (const view of views) for (const hour of hours) for (const season of seasons) for (const band of weather) {
    const id = `${view}-t${hour}-${season}-${band.toLowerCase()}-d${dpr}`;
    const url = new URL(a.origin);
    for (const [key, value] of Object.entries({ view: view === "closest" ? "heart" : view, t: hour, season, weather: band, quality: a.quality, dpr, motion: filmstrip ? "full" : "reduce", intro: "0" })) url.searchParams.set(key, value);
    const setup = `(${freezeCapture.toString()})(${JSON.stringify({ ...controls, closest: view === "closest", band })})`;
    try {
      const report = await runShot(["--url", url.href, "--fixture-hash", manifest.meta.snapshotSha256, "--init-script-file", initFile, "--eval", setup, "--eval-wait", "0", "--frame-eval", "window.__goldenRender(window.__captureFrameIndex)", "--seconds", "0", "--wait", "0", "--dpr", dpr, "--width", a.width, "--height", a.height, "--ready-timeout", a["ready-timeout"], ...(a.profile === "igpu" ? ["--igpu"] : []), ...(filmstrip > 1 ? ["--burst", String(filmstrip - 1), "--interval", "0"] : [])], resolve(out, id));
      manifest.captures.push({ id, file: `${id}.png`, frames: filmstrip || 1, gpu: report.gpu, provenance: report.provenance, stats: report.stats, state: report.evalResult });
    } catch (error) { manifest.captures.push({ id, error: error.message }); failure = error; break outer; }
    await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
  await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (failure) throw failure;
  console.log(`Golden manifest: ${resolve(out, "manifest.json")}`);
}

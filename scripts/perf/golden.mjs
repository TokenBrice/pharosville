#!/usr/bin/env node
/** Deterministic stills and fixed-step normal-motion filmstrips, through the shared preview driver. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runShot } from "./frame.mjs";

const { values: a } = parseArgs({ options: {
  help: { type: "boolean" }, origin: { type: "string", default: "http://127.0.0.1:4180/" }, out: { type: "string", default: "outputs/perf/golden" }, snapshot: { type: "string" },
  views: { type: "string", default: "heart,overview,closest" }, hours: { type: "string", default: "12.5,18.5,22" }, seasons: { type: "string", default: "summer,winter" }, weather: { type: "string", default: "CALM,DANGER" },
  dprs: { type: "string", default: "1,2" }, quality: { type: "string", default: "high" }, profile: { type: "string", default: "standard" },
  width: { type: "string", default: "1600" }, height: { type: "string", default: "1000" }, epoch: { type: "string" }, seed: { type: "string", default: "20261019" }, elapsed: { type: "string", default: "120" },
  filmstrip: { type: "string" }, interval: { type: "string", default: "100" }, "ready-timeout": { type: "string", default: "120" },
  "record-snapshot": { type: "string" },
} });
if (a.help) {
  console.log(`Usage: node scripts/perf/golden.mjs --snapshot FILE [options]
  --record-snapshot FILE        record seven real same-origin API responses once; reuse for both arms
  --origin URL --out DIR        default production-faithful http://127.0.0.1:4180/; outputs/perf/golden
  --views heart,overview,closest --hours 12.5,18.5,22 --seasons summer,winter --weather CALM,DANGER
  --dprs 1,2 --quality high|medium|low --profile standard|igpu --width 1600 --height 1000
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
  const controls = { epoch: Number(a.epoch ?? snapshot.epoch), seed: Number(a.seed), elapsed: Number(a.elapsed), filmstrip, interval };
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
      const report = await runShot(["--url", url.href, "--init-script-file", initFile, "--eval", setup, "--eval-wait", "0", "--frame-eval", "window.__goldenRender(window.__captureFrameIndex)", "--seconds", "0", "--wait", "0", "--dpr", dpr, "--width", a.width, "--height", a.height, "--ready-timeout", a["ready-timeout"], ...(a.profile === "igpu" ? ["--igpu"] : []), ...(filmstrip > 1 ? ["--burst", String(filmstrip - 1), "--interval", "0"] : [])], resolve(out, id));
      manifest.captures.push({ id, file: `${id}.png`, frames: filmstrip || 1, gpu: report.gpu, stats: report.stats, state: report.evalResult });
    } catch (error) { manifest.captures.push({ id, error: error.message }); failure = error; break outer; }
    await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
  await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (failure) throw failure;
  console.log(`Golden manifest: ${resolve(out, "manifest.json")}`);
}

function initializeCapture(snapshot, controls) {
  let seed = controls.seed >>> 0;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const NativeDate = Date;
  window.__goldenNow = controls.epoch;
  function PinnedDate(...args) {
    if (!new.target) return new NativeDate(window.__goldenNow).toString();
    return Reflect.construct(NativeDate, args.length ? args : [window.__goldenNow], new.target);
  }
  PinnedDate.prototype = NativeDate.prototype;
  Object.setPrototypeOf(PinnedDate, NativeDate);
  PinnedDate.now = () => window.__goldenNow;
  window.Date = PinnedDate;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf(() => callback(0));
  const fetchReal = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
      const row = snapshot.responses[url.pathname + url.search] ?? snapshot.responses[url.pathname];
      if (!row) throw new Error(`API snapshot missing ${url.pathname}${url.search}`);
      const headers = new Headers(row.headers);
      headers.delete("content-encoding"); headers.delete("content-length");
      return new Response(typeof row.body === "string" ? row.body : JSON.stringify(row.body), { status: row.status, headers });
    }
    return fetchReal(input, options);
  };
  try { localStorage.setItem("pv:intro-seen", "1"); } catch { /* storage policy */ }
  const disableAnimations = () => {
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
    document.documentElement.appendChild(style);
  };
  if (document.documentElement) disableAnimations(); else document.addEventListener("DOMContentLoaded", disableAnimations, { once: true });
}

async function freezeCapture({ elapsed, epoch, closest, band, filmstrip, interval }) {
  const e = window.__harbour;
  if (!e) throw new Error("No Harbour engine");
  const data = e.systems.find((s) => s.name === "data");
  const deadline = performance.now() + 120000;
  let legacySince = 0;
  for (;;) {
    const feed = e.ctx.services.get("feed"), readiness = e.ctx.services.get("readiness");
    const base = e.ready.size === e.systems.length && Object.keys(feed?.payloads ?? {}).length === 7;
    if (readiness) {
      // Current contract: a prepared, coherent model with no pending preparation.
      if (base && readiness.prepared && !data.preparing && !data.dirty && data.queued == null) break;
    } else if (base) {
      // Pre-readiness builds (main before need-for-speed): no readiness service; settle 3 s after all payloads land.
      legacySince ||= performance.now();
      if (performance.now() - legacySince > 3000) break;
    }
    if (performance.now() > deadline) throw new Error("Golden requires all systems, seven payloads and a prepared coherent model");
    await new Promise((r) => setTimeout(r, 100));
  }
  // System readiness precedes deferred emblem decode and the office scan's asynchronous
  // preparation/flag publication. Keep updates running until those consumers exist.
  const legacy = !e.ctx.services.get("readiness");
  const fleet = e.systems.find((s) => s.name === "fleet"), identityEntry = e.systems.find((s) => s.name === "identity");
  const identity = legacy ? identityEntry : identityEntry?.system;
  if (!fleet?.atlas || !identity?.dresser || !identity?.flags) throw new Error("Golden requires emblem and crest atlases, not fallback logos");
  if (fleet.atlas.logos === "wait") await fleet.atlas.loadLogos();
  while (fleet.atlas.logos !== "done" || !identity.dresser.complete || identity.scanning || identity.flags.flags.count === 0) {
    if (performance.now() > deadline) throw new Error("Golden requires decoded emblems and completely published office crest flags");
    await new Promise((r) => setTimeout(r, 100));
  }
  const logoTexture = fleet.atlas.texture;
  const combinedAtlas = typeof logoTexture?.image?.getContext === "function";
  const logoCount = Math.ceil((Math.max(-1, ...Object.values(fleet.atlas.meta.ids)) + 1) / fleet.atlas.meta.cols) * fleet.atlas.meta.cols;
  if (!combinedAtlas || logoCount === 0) throw new Error("Golden emblem image failed; refusing a fallback capture");
  // "done" can also mean decode failure. Verify a copied logo tile against a
  // fresh decode; the combined CanvasTexture alone cannot exclude monograms.
  let image = null;
  for (const url of ["/harbour/emblems.avif", "/harbour/emblems.webp"]) {
    try {
      const response = await fetch(url);
      if (response.ok && (response.headers.get("content-type") ?? "").includes("image")) image = await createImageBitmap(await response.blob(), { premultiplyAlpha: "none" });
    } catch { /* the atlas loader tries WebP after AVIF too */ }
    if (image) break;
  }
  if (!image) throw new Error("Golden emblem image did not decode");
  try {
    const { slot: size, cols, ids } = fleet.atlas.meta;
    const slot = Math.min(...Object.values(ids)), x = slot % cols * size, y = Math.floor(slot / cols) * size;
    const reference = document.createElement("canvas");
    reference.width = reference.height = size;
    const context = reference.getContext("2d");
    context.drawImage(image, x, y, size, size, 0, 0, size, size);
    const expected = context.getImageData(0, 0, size, size).data;
    const actual = logoTexture.image.getContext("2d").getImageData(x, y, size, size).data;
    if (!expected.some((value, i) => i % 4 === 3 && value > 0) || !actual.every((value, i) => value === expected[i])) throw new Error("Golden atlas does not contain the decoded logo tile");
  } finally { image.close(); }
  const atlases = { emblemSlots: logoCount, crestFlags: identity.flags.flags.count, combinedAtlas, logoVerified: true };
  await document.fonts.ready;
  e.stop();
  e.ctx.services.get("feed").stop();
  const ocean = e.systems.find((s) => s.name === "ocean"), sky = e.systems.find((s) => s.name === "sky"), weather = e.systems.find((s) => s.name === "weather"), season = e.systems.find((s) => s.name === "season");
  if (!ocean?.clock || !ocean.seaU || !ocean.seaGoal || !weather?.director || !sky?.clock) throw new Error("Golden private-clock contract changed; update capture controls, do not accept an unconverged still");
  const rig = e.ctx.rig;
  if (closest) rig.goalDistance = rig.minDistance;
  rig.distance = rig.goalDistance; rig.target.copy(rig.goalTarget); rig.update(0);
  const clocks = [];
  for (const system of e.systems) {
    const clock = system.clock;
    if (clock && typeof clock.step === "function" && typeof clock.live === "number" && typeof clock.time === "number") {
      clock.time = elapsed; clock.live = filmstrip ? 1 : 0;
      clocks.push(clock);
    }
  }
  e.clock.elapsed = elapsed;
  weather.elapsed = elapsed;
  season.fresh = 0; season.snowCover = season.baseSnow;
  sky.coverS = sky.cover; sky.windS = sky.wind; sky.cirrusDrift = 0;
  sky.seedBanks();
  const frame = { delta: 0, elapsed, nowMs: epoch };
  e.ctx.timeOfDay.update(epoch, elapsed, e.ctx.uniforms);
  season.update(frame, e.ctx);
  if (legacy) {
    // Main's director input is local to update(), before the published input seam existed.
    const reading = e.ctx.services.get("readings")?.weather;
    const sun = Math.max(0, Math.min(1, (e.ctx.uniforms.uSunDir.value.y - 0.03) / 0.22));
    weather.director.snap({ level: reading?.level ?? null, band: reading?.band ?? null, snowShare: e.ctx.services.get("season").snowShare, sunUp: sun * sun * (3 - 2 * sun) * (1 - e.ctx.uniforms.uNight.value), time: elapsed, forceRainbow: weather.q.get("rainbow") === "1" });
  } else weather.director.snap(weather.input);
  weather.update(frame, e.ctx);
  ocean.seaU.value.copy(ocean.seaGoal);
  ocean.time = ocean.seaTime.value = elapsed;
  // Converge pose/material easing without advancing decorative time or authoritative sim time.
  // Updating these selected systems avoids a nondeterministic boot history in fleet heel/storm/highlights.
  const steps = clocks.map((clock) => clock.step);
  for (const clock of clocks) clock.step = () => elapsed;
  try {
    for (let i = 0; i < 4; i++) for (const system of e.systems) if (system.name === "fleet" || system.name === "civic") system.update({ ...frame, delta: 120 }, e.ctx);
  } finally { clocks.forEach((clock, i) => { clock.step = steps[i]; clock.time = elapsed; }); }
  // Canonical initial wake history (zero trail at a held instant); live hull contact is rebuilt below.
  const renderer = e.ctx.renderer, wake = e.ctx.services.get("wake"), target = renderer.getRenderTarget();
  const clear = renderer.getClearColor(ocean.material.uniforms.uDeep.value.clone()), alpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (const rt of [...wake.hist, wake.liveRT]) { renderer.setRenderTarget(rt); renderer.clear(true, false, false); }
  renderer.setRenderTarget(target); renderer.setClearColor(clear, alpha);
  wake.count = 0;
  let stamp = performance.now(), currentFrame = 0;
  let hasRendered = false;
  e.clock.last = stamp;
  // In still mode pin even clocks whose update clamps delta to a minimum (fleet).
  if (!filmstrip) for (const clock of clocks) clock.step = () => elapsed;
  window.__goldenRender = (index) => {
    if (index < currentFrame) throw new Error("Filmstrip frame order changed");
    if (filmstrip) while (currentFrame < index) {
      const steps = Math.max(1, Math.ceil(interval / (1000 / 60)));
      const dt = interval / 1000 / steps;
      for (let step = 0; step < steps; step++) {
        stamp += dt * 1000;
        window.__goldenNow += dt * 1000;
        e.frame(stamp);
      }
      currentFrame++;
    }
    if (!filmstrip) {
      e.clock.elapsed = elapsed; weather.elapsed = elapsed;
      ocean.seaU.value.copy(ocean.seaGoal); sky.coverS = sky.cover; sky.windS = sky.wind;
      season.fresh = 0; season.snowCover = season.baseSnow;
    }
    if (!filmstrip || !hasRendered) {
      // Initial pose evaluation must not add the fleet's minimum decorative dt to a fixed-step strip.
      const previous = clocks.map((clock) => clock.step);
      if (filmstrip) for (const clock of clocks) clock.step = () => elapsed;
      try { e.clock.last = stamp; e.frame(stamp); }
      finally { if (filmstrip) clocks.forEach((clock, i) => { clock.step = previous[i]; }); }
      hasRendered = true;
    }
    if (!filmstrip || index === 0) {
      renderer.shadowMap.needsUpdate = true;
      e.ctx.composer.render(0);
    }
  };
  window.__goldenRender(0);
  window.__goldenRender(0);
  const actual = e.ctx.services.get("weather")?.band;
  if (actual !== band) throw new Error(`Requested ${band}, rendered ${actual}: this origin does not apply DEV weather overrides; use a matching API fixture`);
  return { elapsed: e.clock.elapsed, privateClocks: clocks.length, oceanTime: ocean.clock.time, sea: ocean.seaU.value.toArray(), weather: { ...e.ctx.services.get("weather").state }, season: { ...e.ctx.services.get("season") }, quality: window.__harbourStats.quality, dpr: renderer.getPixelRatio(), renderedRevision: window.__harbourStats.renderedRevision, renderedBoats: window.__harbourStats.renderedBoats, atlases, fixedStepMs: filmstrip ? 1000 / 60 : 0 };
}

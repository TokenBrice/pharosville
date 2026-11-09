export function initializeCapture(controls) {
  let seed = controls.seed >>> 0;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const NativeDate = Date;
  window.__goldenNow = controls.epoch;
  window.__scenarioEpoch = controls.epoch - (controls.atMs ?? 0);
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
  try { localStorage.setItem("pv:intro-seen", "1"); } catch { /* storage policy */ }
  const disableAnimations = () => {
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
    document.documentElement.appendChild(style);
  };
  if (document.documentElement) disableAnimations(); else document.addEventListener("DOMContentLoaded", disableAnimations, { once: true });
}

export async function freezeCapture({ elapsed, epoch, closest, band, filmstrip, interval, emptyFixture, risingFront }) {
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
  while (fleet.atlas.logos !== "done" || !identity.dresser.complete || identity.scanning || (!emptyFixture && identity.flags.flags.count === 0)) {
    if (performance.now() > deadline) throw new Error("Golden requires decoded emblems and completely published office crest flags");
    await new Promise((r) => setTimeout(r, 100));
  }
  if (emptyFixture && window.__harbourStats.renderedBoats !== 0) throw new Error("--empty-fixture requires a rendered empty fleet");
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
    const { cols, ids, width, height } = fleet.atlas.meta;
    const size = logoTexture.image.width / cols, rows = logoCount / cols, srcRow = height / rows;
    const slot = Math.min(...Object.values(ids)), row = Math.floor(slot / cols), x = slot % cols * size, y = row * size;
    const reference = document.createElement("canvas");
    reference.width = logoTexture.image.width; reference.height = size;
    const context = reference.getContext("2d");
    // Match stageLogos' full-row scaling; metadata slots describe the source, not the runtime atlas.
    context.drawImage(image, 0, row * srcRow, width, srcRow, 0, 0, reference.width, size);
    const expected = context.getImageData(x, 0, size, size).data;
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
  if (risingFront) {
    const front = weather.director.state.front;
    if (!front || front.to <= front.from) throw new Error("Requested rising front is not effective");
  } else if (legacy) {
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
    for (let i = 0; i < 4; i++) for (const system of e.systems) if (system.name === "readings" || system.name === "fleet" || system.name === "civic") system.update({ ...frame, delta: 120 }, e.ctx);
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
        window.__scenario?.advanceTo(window.__goldenNow - window.__scenarioEpoch);
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
  if (!risingFront && actual !== band) throw new Error(`Requested ${band}, rendered ${actual}: this origin does not apply DEV weather overrides; use a matching API fixture`);
  return { targets: e.systems.find((s) => s.name === "readings")?.targets ?? null, seaState: ocean.state, elapsed: e.clock.elapsed, privateClocks: clocks.length, oceanTime: ocean.clock.time, sea: ocean.seaU.value.toArray(), weather: { ...e.ctx.services.get("weather").state }, season: { ...e.ctx.services.get("season") }, quality: window.__harbourStats.quality, dpr: renderer.getPixelRatio(), renderedRevision: window.__harbourStats.renderedRevision, renderedBoats: window.__harbourStats.renderedBoats, atlases, fixedStepMs: filmstrip ? 1000 / 60 : 0 };
}

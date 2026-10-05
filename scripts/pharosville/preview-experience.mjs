export const EXPERIENCE_STATES = ["key", "find", "controls", "light", "legend", "ledger", "changelog"];
export const SHELL_MODES = ["blocked", "no-js", "module-failure", "renderer-failure"];
export const STROLL_STATIONS = ["inlet-mouth", "north-deck", "mole-end", "crane-islet", "chaseki-bench", "crag-stair"];

export function parseExperienceFlags(args) {
  if (args["source-details"] !== undefined) throw new Error("--source-details is not supported (S3-P2 was declined).");
  const state = args["experience-state"] ?? (args["reading-key"] ? "key" : args["quick-find"] ? "find" : null);
  if (state !== null && !EXPERIENCE_STATES.includes(state)) throw new Error(`--experience-state needs ${EXPERIENCE_STATES.join("| ")}`);
  if (args["reading-key"] && state !== "key") throw new Error("--reading-key conflicts with --experience-state.");
  const shell = args["capture-shell"] ?? null;
  if (shell !== null && !SHELL_MODES.includes(shell)) throw new Error(`--capture-shell needs ${SHELL_MODES.join("| ")}`);
  if (shell && state) throw new Error("Shell captures cannot open world UI states.");
  const filmstrip = args["cold-filmstrip"];
  let offsets = [];
  if (filmstrip !== undefined) {
    if (typeof filmstrip !== "string" || !filmstrip.trim()) throw new Error("--cold-filmstrip needs comma-separated non-negative seconds.");
    offsets = filmstrip.split(",").map((part) => part.trim() === "" ? NaN : Number(part));
    if (offsets.some((value, index) => !Number.isFinite(value) || value < 0 || (index > 0 && value <= offsets[index - 1]))) {
      throw new Error("--cold-filmstrip offsets must be finite, non-negative and strictly increasing.");
    }
  }
  const station = args.station ?? null;
  if (station !== null && !STROLL_STATIONS.includes(station)) throw new Error(`--station needs ${STROLL_STATIONS.join("| ")}`);
  const rawProgress = args["path-progress"];
  const pathProgress = rawProgress === undefined ? null : Number(rawProgress);
  if (rawProgress !== undefined && (typeof rawProgress !== "string" || rawProgress.trim() === "" || !Number.isFinite(pathProgress) || pathProgress < 0 || pathProgress > 1)) {
    throw new Error("--path-progress needs a finite number in [0, 1].");
  }
  if (pathProgress !== null && station === null) throw new Error("--path-progress requires --station.");
  if (shell && station) throw new Error("Shell captures cannot select a world station.");
  return { state, shell, offsets, station, pathProgress };
}

/** Installed before navigation; all timestamps use the unpinned navigation performance clock. */
export function installExperienceObserver() {
  const timing = { firstMeaningfulDomMs: null, firstCompleteWorldMs: null };
  window.__previewExperienceTiming = timing;
  const sample = () => {
    const heading = document.querySelector(".pv-arrival-shell h1, .pv-arrival-shell h2, .pharosville-narrow h2");
    if (timing.firstMeaningfulDomMs === null && heading && document.querySelector('nav[aria-label="Pharos analytics"] a')) timing.firstMeaningfulDomMs = performance.now();
    const world = document.querySelector('[data-world-ready="true"]');
    const canvas = document.querySelector('[data-testid="pharosville-canvas"][data-renderer-status="ready"]');
    if (timing.firstCompleteWorldMs === null && world && canvas && !document.querySelector('[data-testid="pharosville-charting-veil"]')) timing.firstCompleteWorldMs = performance.now();
    if (timing.firstMeaningfulDomMs !== null && timing.firstCompleteWorldMs !== null) observer.disconnect();
  };
  const observer = new MutationObserver(sample);
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-world-ready", "data-renderer-status"] });
  sample();
}

export function remainingFilmstripDelay(nominalMs, elapsedMs) {
  return Math.max(0, nominalMs - elapsedMs);
}

/** Called directly after response commit, before any canvas/fleet/readiness waits. */
export async function captureColdFilmstrip(page, offsets, basePath, save) {
  const frames = [];
  for (let index = 0; index < offsets.length; index += 1) {
    const nominalMs = offsets[index] * 1000;
    const elapsedMs = await page.evaluate(() => performance.now());
    const delay = remainingFilmstripDelay(nominalMs, elapsedMs);
    if (delay > 0) await page.waitForTimeout(delay);
    const actualMs = await page.evaluate(() => performance.now());
    const path = `${basePath.replace(/\.png$/i, "")}-cold-${String(index).padStart(2, "0")}.png`;
    const png = await page.screenshot({ animations: "allow", type: "png" });
    const completedMs = await page.evaluate(() => performance.now());
    await save(path, png);
    frames.push({ nominalMs, actualMs, completedMs, path });
  }
  return frames;
}

export async function readExperienceTiming(page) {
  return page.evaluate(() => ({
    firstMeaningfulDomMs: window.__previewExperienceTiming?.firstMeaningfulDomMs ?? null,
    firstCompleteWorldMs: window.__previewExperienceTiming?.firstCompleteWorldMs ?? null,
    responseCommitMs: performance.getEntriesByType("navigation")[0]?.responseStart ?? null,
    observedAtMs: performance.now(),
  }));
}

export async function applyExperienceState(page, state) {
  if (!state) return;
  if (state === "key") {
    const toggle = page.getByRole("button", { name: "Read key", exact: true });
    await toggle.waitFor({ state: "visible", timeout: 10_000 });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await page.getByRole("button", { name: /^(Got it|Close reading key)$/ }).waitFor({ state: "visible" });
    return;
  }
  if (state === "find") {
    await page.keyboard.press("/");
    await page.getByTestId("pharosville-quick-find").waitFor({ state: "visible" });
    return;
  }
  const controls = page.getByTestId("pharosville-world-controls");
  if (await controls.getAttribute("data-expanded") !== "true") await page.getByRole("button", { name: "Explore harbor controls", exact: true }).click();
  if (state === "controls") return;
  if (state === "light") {
    await page.getByRole("button", { name: /^Light and motion:/ }).click();
    await page.getByRole("group", { name: "Light and motion", exact: true }).waitFor({ state: "visible" });
    return;
  }
  if (state === "legend" || state === "changelog") {
    await controls.getByRole("button", { name: "legend", exact: true }).click();
    await page.getByTestId("pharosville-legend-panel").waitFor({ state: "visible" });
    if (state === "changelog") {
      const more = page.getByTestId("pharosville-legend-panel").locator(".pharosville-legend-panel__more");
      if (await more.getAttribute("open") === null) await more.locator("summary").click();
      await page.getByTestId("pharosville-legend-panel").getByRole("button", { name: /changelog/i }).click();
      await page.getByTestId("pharosville-changelog-panel").waitFor({ state: "visible" });
    }
    return;
  }
  await controls.getByRole("button", { name: "Harbor ledger", exact: true }).click();
  await page.getByTestId("pharosville-harbor-ledger-panel").waitFor({ state: "visible" });
}

/** Apply the authored route before any settling/timing waits, never fake camera state. */
export async function applyStrollCapture(page, { station, pathProgress }) {
  if (station === null) return;
  await page.waitForFunction(() => typeof window.__pharosVilleStroll?.station === "function", undefined, { timeout: 10_000 });
  const applied = await page.evaluate(({ station, pathProgress }) => {
    const api = window.__pharosVilleStroll;
    return api.station(station) === true && (pathProgress === null || api.pathProgress(pathProgress) === true);
  }, { station, pathProgress });
  if (!applied) throw new Error("Stroll capture was refused; no station/path evidence was measured.");
}

/**
 * Observe the existing debug publication, without another RAF or polling timer.
 * Scalars and fixed records only in the hot path; summaries allocate on export.
 * Refresh identification is semantic, never based on a slow-frame threshold.
 */
export function installFrameEvidenceObserver() {
  window.__previewFrameEvidence?.dispose();
  const causes = ["shadow", "atlas-upload", "data-refresh", "environment", "warmup", "tier-change", "gpu-disjoint"];
  const makeTotals = () => ({ frames: 0, cpuTotalMs: 0, cpuMaxMs: 0, calls: 0, triangles: 0, geometries: 0, textures: 0 });
  const totals = [makeTotals(), makeTotals(), makeTotals()];
  const causeFrames = new Uint32Array(causes.length);
  const causeCpu = new Float64Array(causes.length);
  const gpuNames = ["scene", "n8ao", "bloom", "grade", "smaa", "frame"];
  const gpuBaseline = new Float64Array(gpuNames.length);
  const gpuCompleted = new Float64Array(gpuNames.length).fill(NaN);
  const gpuClean = new Uint8Array(gpuNames.length);
  let sequence = 0;
  let lastRefresh = 0;
  let lastSnapshot = -1;
  let previousUploaded = -1;
  let previousLogos = -1;
  let previousContent = -1;
  let previousParts = -1;
  let previousWorld = null;
  let previousEnvironment = -1;
  let previousTier = null;
  let reporting = false;
  let collecting = false;
  let disposed = false;
  const sample = (value, world) => {
    if (disposed || !value || !Number.isFinite(value.snapshotRebuildCount)
      || (value.snapshotRebuildCount === lastSnapshot && world === previousWorld)) return;
    lastSnapshot = value.snapshotRebuildCount;
    sequence += 1;
    reporting = typeof value.shadowRefreshed === "boolean" && Number.isFinite(value.shadowRefreshCount);
    const uploaded = value.textureUploads?.uploaded ?? -1;
    const content = value.contentReplacementCount ?? -1;
    const parts = value.contentPartRebuildCount ?? -1;
    const environment = value.environmentBakeCount ?? -1;
    const tier = value.schedulerTier ?? null;
    const logos = value.logoAssetsLoaded ?? -1;
    let refresh = false;
    const cpu = Number.isFinite(value.drawDurationMs) ? value.drawDurationMs : 0;
    for (let index = 0; index < causes.length; index += 1) {
      const active = index === 0 ? value.shadowRefreshed === true
        : index === 1 ? (value.textureUploads?.pending ?? 0) > 0 || uploaded !== previousUploaded || logos !== previousLogos
        : index === 2 ? content !== previousContent || parts !== previousParts || world !== previousWorld || (value.contentRebuildQueueDepth ?? 0) > 0
        : index === 3 ? environment !== previousEnvironment || (value.environmentBakeCountChange ?? 0) > 0
        : index === 4 ? (value.gpuWarmupCount ?? 0) > 0
        : index === 5 ? tier !== previousTier : value.gpuTimings?.disjoint === true;
      if (active) {
        refresh = true;
        if (collecting) { causeFrames[index] += 1; causeCpu[index] += cpu; }
      }
    }
    previousUploaded = uploaded;
    previousLogos = logos;
    previousContent = content;
    previousParts = parts;
    previousWorld = world;
    previousEnvironment = environment;
    previousTier = tier;
    if (refresh || !reporting) lastRefresh = sequence;
    const timing = value.gpuTimings;
    if (Number.isFinite(timing?.frameSamplesCompleted) && timing.frameSamplesCompleted < gpuCompleted[5]) {
      gpuCompleted.fill(0);
      gpuBaseline.fill(0);
    }
    if (timing?.supported && !timing.disjoint) {
      gpuCompleted[5] = timing.frameSamplesCompleted ?? NaN;
      for (const pass of timing.passes) {
        const index = gpuNames.indexOf(pass.name);
        if (index >= 0) gpuCompleted[index] = pass.samplesCompleted ?? NaN;
      }
    }
    for (let index = 0; index < gpuNames.length; index += 1) {
      if (refresh || !reporting) gpuBaseline[index] = Number.isFinite(gpuCompleted[index]) ? gpuCompleted[index] : 0;
      // 120 retained results plus at most 8 already-pending queries.
      gpuClean[index] = timing?.supported && !timing.disjoint && gpuCompleted[index] - gpuBaseline[index] > 128 ? 1 : 0;
    }
    if (!collecting) return;
    const total = totals[reporting ? refresh ? 1 : 0 : 2];
    total.frames += 1;
    total.cpuTotalMs += cpu;
    total.cpuMaxMs = Math.max(total.cpuMaxMs, cpu);
    const gpu = value.gpu;
    if (gpu) {
      total.calls = Math.max(total.calls, gpu.calls);
      total.triangles = Math.max(total.triangles, gpu.triangles);
      total.geometries = Math.max(total.geometries, gpu.geometries);
      total.textures = Math.max(total.textures, gpu.textures);
    }
  };
  let coverageBreaks = 0;
  let coverageLost = false;
  window.__pharosVilleFrameEvidence = sample;
  const checkCoverage = () => {
    const missing = disposed || window.__pharosVilleFrameEvidence !== sample;
    if (missing && !coverageLost) coverageBreaks += 1;
    coverageLost = missing;
    if (missing) {
      reporting = false;
      lastRefresh = sequence;
    }
  };
  window.__previewFrameEvidence = {
    dispose() {
      disposed = true;
      collecting = false;
      if (window.__pharosVilleFrameEvidence === sample) delete window.__pharosVilleFrameEvidence;
      checkCoverage();
    },
    begin() {
      checkCoverage();
      collecting = true;
      coverageBreaks = 0;
      for (const total of totals) {
        total.frames = total.cpuTotalMs = total.cpuMaxMs = total.calls = total.triangles = total.geometries = total.textures = 0;
      }
      causeFrames.fill(0);
      causeCpu.fill(0);
    },
    snapshot() {
      checkCoverage();
      return {
        reporting, sequence, coverageBreaks, framesSinceRefresh: sequence - lastRefresh,
        gpuFrameClean: gpuClean[5] === 1,
        gpuCleanPasses: gpuNames.filter((name, index) => index < 5 && gpuClean[index] === 1),
        steady: { ...totals[0] }, refresh: { ...totals[1] },
        unclassified: { ...totals[2] },
        causes: causes.map((name, index) => ({ name, frames: causeFrames[index], associatedCpuMs: causeCpu[index] })),
      };
    },
  };
}

/** A window is clean only after all 120 pacing samples have aged past refresh. */
export function isSteadyFrameWindow(read) {
  return read.frameEvidence?.reporting === true && (read.samples ?? 0) >= 100
    && read.frameEvidence.framesSinceRefresh > 120
    && read.visibilityState === "visible";
}

/** Timer spans identify the largest reading, NOT a removable/additive pass cost. */
export function dominantPassReading(gpu, renderer, cleanPasses = null) {
  if (!gpu?.supported || gpu.disjoint) return { name: null, p95Ms: null, basis: "not measured" };
  const passes = (gpu.passes ?? []).filter((pass) => Number.isFinite(pass.p95Ms) && pass.samples > 0
    && (cleanPasses === null || cleanPasses.includes(pass.name)));
  const largest = passes.reduce((best, pass) => !best || pass.p95Ms > best.p95Ms ? pass : best, null);
  if (!largest) return { name: null, p95Ms: null, basis: "not measured — no refresh-free pass ring" };
  return {
    name: largest?.name ?? null, p95Ms: largest?.p95Ms ?? null,
    basis: /metal/i.test(renderer ?? "") ? "largest overlapping ANGLE Metal timer span; not pass cost" : "largest non-additive GPU timer span; not pass cost",
  };
}

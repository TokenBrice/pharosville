import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EXPERIENCE_STATES, SHELL_MODES, parseExperienceFlags, remainingFilmstripDelay,
  captureColdFilmstrip, applyExperienceState, installExperienceObserver,
  STROLL_STATIONS, applyStrollCapture, installFrameEvidenceObserver, isSteadyFrameWindow, dominantPassReading,
} from "./preview-experience.mjs";

test("fixed DOM states and reading-key alias are accepted without a Sources action", () => {
  assert.deepEqual(EXPERIENCE_STATES, ["key", "find", "controls", "light", "legend", "ledger", "changelog"]);
  for (const state of EXPERIENCE_STATES) assert.equal(parseExperienceFlags({ "experience-state": state }).state, state);
  assert.equal(parseExperienceFlags({ "reading-key": true }).state, "key");
  assert.equal(parseExperienceFlags({ "quick-find": true }).state, "find");
  assert.throws(() => parseExperienceFlags({ "experience-state": "sources" }));
  assert.throws(() => parseExperienceFlags({ "source-details": true }), /declined/);
  assert.throws(() => parseExperienceFlags({ "reading-key": true, "experience-state": "ledger" }), /conflicts/);
});

test("shell modes are explicit DOM states, never mixed with world panels", () => {
  for (const shell of SHELL_MODES) assert.equal(parseExperienceFlags({ "capture-shell": shell }).shell, shell);
  assert.throws(() => parseExperienceFlags({ "capture-shell": "unknown" }));
  assert.throws(() => parseExperienceFlags({ "capture-shell": "no-js", "reading-key": true }));
});

test("cold filmstrip validates ordered seconds and never invents a zero timestamp", async () => {
  assert.deepEqual(parseExperienceFlags({ "cold-filmstrip": "0,0.5,1,2" }).offsets, [0, 0.5, 1, 2]);
  for (const value of [true, "", "0,", "-1,2", "0,NaN", "0,Infinity", "1,0", "0,0"]) {
    assert.throws(() => parseExperienceFlags({ "cold-filmstrip": value }));
  }
  assert.equal(remainingFilmstripDelay(500, 100), 400);
  assert.equal(remainingFilmstripDelay(0, 120), 0);
  let elapsed = 120;
  const saves = [];
  const page = {
    evaluate: async () => elapsed,
    waitForTimeout: async (ms) => { elapsed += ms; },
    screenshot: async () => { elapsed += 650; return Buffer.from("frame"); },
  };
  const frames = await captureColdFilmstrip(page, [0, 0.5, 2], "outputs/arrival.png", async (path) => saves.push(path));
  assert.deepEqual(frames.map(({ nominalMs, actualMs, completedMs }) => ({ nominalMs, actualMs, completedMs })), [
    { nominalMs: 0, actualMs: 120, completedMs: 770 },
    { nominalMs: 500, actualMs: 770, completedMs: 1420 },
    { nominalMs: 2000, actualMs: 2000, completedMs: 2650 },
  ]);
  assert.deepEqual(saves, ["outputs/arrival-cold-00.png", "outputs/arrival-cold-01.png", "outputs/arrival-cold-02.png"]);
});

test("key capture does not close an already open first-visit key", async () => {
  let clicks = 0;
  const locator = { waitFor: async () => {}, getAttribute: async () => "true", click: async () => { clicks += 1; } };
  const page = { getByRole: () => locator };
  await applyExperienceState(page, "key");
  assert.equal(clicks, 0);
  locator.getAttribute = async () => "false";
  await applyExperienceState(page, "key");
  assert.equal(clicks, 1);
});

test("timing observer keeps first observations and separates meaningful DOM from the complete world", () => {
  let now = 18;
  let complete = false;
  let observe;
  let disconnected = false;
  const pageWindow = {};
  const pageDocument = { querySelector: (selector) => {
    if (selector.includes("h1") || selector.startsWith("nav")) return {};
    if (selector.includes("pharosville-charting-veil")) return complete ? null : {};
    return complete ? {} : null;
  } };
  class Observer {
    constructor(callback) { observe = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  }
  new Function("window", "document", "MutationObserver", "performance", `(${installExperienceObserver.toString()})();`)(
    pageWindow, pageDocument, Observer, { now: () => now },
  );
  assert.deepEqual(pageWindow.__previewExperienceTiming, { firstMeaningfulDomMs: 18, firstCompleteWorldMs: null });
  now = 950;
  complete = true;
  observe();
  assert.deepEqual(pageWindow.__previewExperienceTiming, { firstMeaningfulDomMs: 18, firstCompleteWorldMs: 950 });
  assert.equal(disconnected, true);
});

test("preview installs navigation instruments before commit, filmstrip before canvas/fleet waits, and uses native UI actions", () => {
  const preview = readFileSync(fileURLToPath(new URL("./preview.mjs", import.meta.url)), "utf8");
  assert.ok(preview.indexOf("page.addInitScript(installExperienceObserver)") < preview.indexOf('waitUntil: "commit"'));
  assert.ok(preview.indexOf("await captureColdFilmstrip") < preview.indexOf("await canvas.waitFor"));
  assert.ok(preview.indexOf("await captureColdFilmstrip") < preview.indexOf("const populateDeadline"));
  assert.match(preview, /javaScriptEnabled: experience\.shell !== "no-js"/);
  assert.match(preview, /Blocked shell requested world resources/);
  assert.match(preview, /gpuMeasured: false/);
  assert.doesNotMatch(applyExperienceState.toString(), /__pharosVilleDebug|setAttribute|dispatchEvent/);
});

test("station captures validate finite route progress and refuse ignored debug actions", async () => {
  for (const station of STROLL_STATIONS) assert.equal(parseExperienceFlags({ station }).station, station);
  assert.equal(parseExperienceFlags({ station: STROLL_STATIONS[0], "path-progress": "0" }).pathProgress, 0);
  assert.equal(parseExperienceFlags({ station: STROLL_STATIONS[0], "path-progress": "1" }).pathProgress, 1);
  for (const value of [true, "", "NaN", "Infinity", "-0.1", "1.1"]) {
    assert.throws(() => parseExperienceFlags({ station: STROLL_STATIONS[0], "path-progress": value }));
  }
  assert.throws(() => parseExperienceFlags({ "path-progress": "0.5" }), /requires/);
  assert.throws(() => parseExperienceFlags({ station: "unknown" }));
  assert.throws(() => parseExperienceFlags({ "capture-shell": "no-js", station: STROLL_STATIONS[0] }));
  const calls = [];
  const page = {
    waitForFunction: async () => {},
    evaluate: async (fn, options) => new Function("window", "options", `return (${fn.toString()})(options);`)({
      __pharosVilleStroll: { station: (id) => { calls.push(id); return true; }, pathProgress: (progress) => { calls.push(progress); return true; } },
    }, options),
  };
  await applyStrollCapture(page, parseExperienceFlags({ station: STROLL_STATIONS[0], "path-progress": "0.5" }));
  assert.deepEqual(calls, [STROLL_STATIONS[0], 0.5]);
  page.evaluate = async () => false;
  await assert.rejects(applyStrollCapture(page, parseExperienceFlags({ station: STROLL_STATIONS[0] })), /refused/);
});

function evidenceHarness() {
  const window = {};
  new Function("window", `(${installFrameEvidenceObserver.toString()})();`)(window);
  window.__pharosVilleDebug = { worldGeneratedAtMs: 100 };
  let count = 0;
  const sample = (patch = {}) => {
    window.__pharosVilleFrameEvidence({
      snapshotRebuildCount: ++count, shadowRefreshed: false, shadowRefreshCount: 1,
      textureUploads: { uploaded: 4, pending: 0 }, contentReplacementCount: 1,
      contentPartRebuildCount: 6, contentRebuildQueueDepth: 0, environmentBakeCount: 1,
      environmentBakeCountChange: 0, gpuWarmupCount: 0, schedulerTier: "full",
      drawDurationMs: 2, gpu: { calls: 200, triangles: 400_000, geometries: 180, textures: 50 },
      ...patch,
    }, 100);
  };
  return { window, sample, snapshot: () => window.__previewFrameEvidence.snapshot() };
}

test("every debug publication classifies real refreshes without suppressing slow resting frames", () => {
  const h = evidenceHarness();
  h.sample();
  h.window.__previewFrameEvidence.begin();
  for (let index = 0; index < 121; index += 1) h.sample();
  assert.equal(isSteadyFrameWindow({ samples: 120, visibilityState: "visible", frameEvidence: h.snapshot() }), true);
  h.sample({ drawDurationMs: 70 });
  assert.equal(h.snapshot().refresh.frames, 0); // A slow frame alone never earns an exemption.
  assert.equal(h.snapshot().steady.cpuMaxMs, 70);
  h.sample({ shadowRefreshed: true, shadowRefreshCount: 2, drawDurationMs: 12,
    gpu: { calls: 300, triangles: 510_000, geometries: 185, textures: 52 } });
  assert.equal(h.snapshot().refresh.frames, 1);
  assert.equal(h.snapshot().refresh.triangles, 510_000);
  assert.equal(h.snapshot().causes[0].frames, 1);
  for (let index = 0; index < 120; index += 1) h.sample();
  assert.equal(isSteadyFrameWindow({ samples: 120, visibilityState: "visible", frameEvidence: h.snapshot() }), false);
  h.sample();
  assert.equal(isSteadyFrameWindow({ samples: 120, visibilityState: "visible", frameEvidence: h.snapshot() }), true);
  assert.equal(isSteadyFrameWindow({ samples: 120, visibilityState: "hidden", frameEvidence: h.snapshot() }), false);
  h.sample({ textureUploads: { uploaded: 5, pending: 0 } });
  assert.equal(h.snapshot().causes[1].frames, 1);
  h.sample({ contentPartRebuildCount: 7 });
  assert.equal(h.snapshot().causes[2].frames, 1);
  h.sample({ environmentBakeCountChange: 1 });
  assert.equal(h.snapshot().causes[3].frames, 1);
  h.sample({ shadowRefreshed: undefined, shadowRefreshCount: undefined });
  assert.equal(h.snapshot().reporting, false);
  assert.equal(h.snapshot().unclassified.frames, 1);
});

test("pass dominance names a valid largest timer span without inventing Metal costs", () => {
  const gpu = { supported: true, disjoint: false, passes: [
    { name: "scene", p95Ms: 4, samples: 20 }, { name: "n8ao", p95Ms: 5, samples: 20 },
    { name: "invalid", p95Ms: NaN, samples: 20 }, { name: "empty", p95Ms: 90, samples: 0 },
  ] };
  assert.equal(dominantPassReading(gpu, "NVIDIA").name, "n8ao");
  assert.match(dominantPassReading(gpu, "ANGLE Metal").basis, /overlapping.*not pass cost/);
  assert.equal(dominantPassReading({ ...gpu, disjoint: true }, "NVIDIA").name, null);
  assert.equal(dominantPassReading(null, "NVIDIA").name, null);
  assert.equal(dominantPassReading(gpu, "NVIDIA", ["scene"]).name, "scene");
  assert.equal(dominantPassReading(gpu, "NVIDIA", []).name, null);
});

test("GPU ring provenance waits for completed results, including pending queries and disabled tracks", () => {
  const h = evidenceHarness();
  const timing = (completed, sceneCompleted = completed) => ({ supported: true, disjoint: false,
    frameSamplesCompleted: completed, passes: [{ name: "scene", samplesCompleted: sceneCompleted, samples: 120, p95Ms: 4 }] });
  h.sample({ gpuTimings: timing(10) });
  h.sample({ gpuTimings: timing(138) });
  assert.equal(h.snapshot().gpuFrameClean, false);
  h.sample({ gpuTimings: timing(139, 10) });
  assert.equal(h.snapshot().gpuFrameClean, true);
  assert.deepEqual(h.snapshot().gpuCleanPasses, []); // A disabled/stalled pass is not flushed by frame count.
  h.sample({ gpuTimings: timing(150), shadowRefreshed: true });
  h.sample({ gpuTimings: timing(278) });
  assert.equal(h.snapshot().gpuFrameClean, false);
  h.sample({ gpuTimings: timing(279) });
  assert.equal(h.snapshot().gpuFrameClean, true);
  assert.deepEqual(h.snapshot().gpuCleanPasses, ["scene"]);
  h.sample({ gpuTimings: { ...timing(280), disjoint: true } });
  assert.equal(h.snapshot().gpuFrameClean, false);
  h.sample({ gpuTimings: timing(281) });
  assert.equal(h.snapshot().gpuFrameClean, false); // Disjoint never resets provenance to an invented zero.
});

test("React debug cleanup cannot detach the DEV frame observer; a replaced observer is unmeasured", () => {
  const h = evidenceHarness();
  h.sample();
  h.window.__previewFrameEvidence.begin();
  for (let index = 0; index < 121; index += 1) h.sample();
  assert.equal(h.snapshot().reporting, true);
  const debug = h.window.__pharosVilleDebug;
  delete h.window.__pharosVilleDebug;
  h.window.__pharosVilleDebug = { ...debug };
  h.sample();
  assert.equal(h.snapshot().reporting, true);
  assert.equal(h.snapshot().coverageBreaks, 0);
  assert.equal(h.snapshot().framesSinceRefresh, 122);
  h.window.__pharosVilleFrameEvidence = null;
  assert.equal(h.snapshot().reporting, false);
  assert.equal(h.snapshot().coverageBreaks, 1);
  assert.equal(h.snapshot().coverageBreaks, 1); // Re-reading one detachment never creates another event.
});

test("logo decode generations classify atlas repaint even when texture handle count is unchanged", () => {
  const h = evidenceHarness();
  h.sample({ logoAssetsLoaded: 2 });
  h.window.__previewFrameEvidence.begin();
  h.sample({ logoAssetsLoaded: 3 });
  assert.equal(h.snapshot().refresh.frames, 1);
  assert.equal(h.snapshot().causes[1].frames, 1);
  assert.equal(h.snapshot().refresh.textures, 50);
});

test("frame observer is DEV-only and called before mutable global publication without a new RAF", () => {
  const hook = readFileSync(fileURLToPath(new URL("../../src/hooks/use-world-render-loop.ts", import.meta.url)), "utf8");
  const start = hook.indexOf("function updateDebugFrame(");
  const publication = hook.slice(start, hook.indexOf("function isCameraWithinBounds(", start));
  assert.ok(publication.includes("if (import.meta.env.DEV && input.world.generatedAt !== null)"));
  assert.ok(publication.includes("debugWindow.__pharosVilleFrameEvidence?.(input.renderMetrics, input.world.generatedAt)"));
  assert.ok(publication.indexOf("__pharosVilleFrameEvidence?.(") < publication.indexOf("Object.assign"));
  assert.doesNotMatch(publication, /requestAnimationFrame|setInterval|setTimeout/);
});

test("observer registration replaces and disposes the prior callback idempotently", () => {
  const h = evidenceHarness();
  h.sample();
  const previous = h.window.__previewFrameEvidence;
  const previousCallback = h.window.__pharosVilleFrameEvidence;
  const previousSequence = previous.snapshot().sequence;
  new Function("window", `(${installFrameEvidenceObserver.toString()})();`)(h.window);
  const currentCallback = h.window.__pharosVilleFrameEvidence;
  assert.notEqual(currentCallback, previousCallback);
  assert.notEqual(h.window.__previewFrameEvidence, previous);
  previousCallback({ snapshotRebuildCount: 999 }, 100);
  assert.equal(previous.snapshot().sequence, previousSequence);
  assert.equal(previous.snapshot().reporting, false);
  previous.dispose();
  previous.dispose();
  assert.equal(h.window.__pharosVilleFrameEvidence, currentCallback); // An old owner cannot detach the new owner.
  h.sample();
  assert.equal(h.window.__previewFrameEvidence.snapshot().sequence, 1);
  const current = h.window.__previewFrameEvidence;
  current.dispose();
  current.dispose();
  assert.equal(h.window.__pharosVilleFrameEvidence, undefined);
  assert.equal(current.snapshot().coverageBreaks, 1);
  assert.equal(current.snapshot().reporting, false);
});

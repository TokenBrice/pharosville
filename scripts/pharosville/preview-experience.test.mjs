import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EXPERIENCE_STATES, SHELL_MODES, parseExperienceFlags, remainingFilmstripDelay,
  captureColdFilmstrip, applyExperienceState, installExperienceObserver,
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
  const preview = readFileSync(new URL("./preview.mjs", import.meta.url), "utf8");
  assert.ok(preview.indexOf("page.addInitScript(installExperienceObserver)") < preview.indexOf('waitUntil: "commit"'));
  assert.ok(preview.indexOf("await captureColdFilmstrip") < preview.indexOf("await canvas.waitFor"));
  assert.ok(preview.indexOf("await captureColdFilmstrip") < preview.indexOf("const populateDeadline"));
  assert.match(preview, /javaScriptEnabled: experience\.shell !== "no-js"/);
  assert.match(preview, /Blocked shell requested world resources/);
  assert.match(preview, /gpuMeasured: false/);
  assert.doesNotMatch(applyExperienceState.toString(), /__pharosVilleDebug|setAttribute|dispatchEvent/);
});

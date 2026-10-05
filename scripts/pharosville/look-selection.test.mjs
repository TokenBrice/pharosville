import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { gardenReviewEntries, normalizeLookMatrix, previewArguments, recaptureLookWinner, runLookSelection } from "./look-selection.mjs";

async function setup(t, { burst = false, twoCases = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "pharosville-look-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = [];
  for (const id of ["baseline", "candidate"]) {
    const checkout = resolve(root, id);
    const appearance = resolve(root, `${id}.json`);
    await mkdir(checkout);
    await writeFile(appearance, JSON.stringify({ schemaVersion: 1, preset: id, keyLight: id === "baseline" ? 1 : 0.9 }));
    for (const name of twoCases ? ["noon", "night"] : ["noon"]) entries.push({
      id, case: name, checkout, appearance, url: `http://localhost:${id === "baseline" ? 5173 : 5174}`,
      fixture: "quiet-dense", observer: { dateMode: "fixed" }, clock: "2026-10-05T00:00:00Z",
      hash: name === "night" ? "#t=22" : "#t=12.25", width: 1200, height: 640, dpr: 1,
      reduced: true, clean: true, stem: `${name}-${id}`, ...(burst ? { burst: 2, clip: [0, 0, 64, 40] } : {}),
    });
  }
  return { root, matrix: { schemaVersion: 1, outputDirectory: resolve(root, "review"), entries } };
}

function manifest(entry) {
  const params = new URLSearchParams(entry.hash.slice(1));
  const camera = params.has("cam") ? params.get("cam").split(",").map(Number) : [0, 0, 0.28];
  return {
    scriptCheckout: { root: "/preview-tools", commit: "tool-sha", dirtyPaths: [] },
    servedCheckout: { root: entry.checkout, commit: `${entry.id}-sha`, sourceHash: (entry.id === "baseline" ? "a" : "b").repeat(64), dirtyPaths: [], changedDuringCapture: false },
    fixture: { name: entry.fixture ?? "live", payloadHash: "f".repeat(64), ...(entry.fixture === null ? { complete: true, observedPaths: ["/api/stablecoins"], failedPaths: [] } : {}) },
    appearance: { ...entry.appearanceIdentity, appliedChecksum: entry.appearanceIdentity.checksum }, inspectorActive: false,
    observer: { dateMode: entry.observer.dateMode, observerOriginMs: entry.observer.observerOriginMs ?? 1_700_000_060_000, timeZone: entry.observer.timeZone ?? "UTC", hourPin: { source: "t", value: Number(params.get("t")) }, calendarPin: entry.clock.slice(0, 10) },
    camera: { offsetX: camera[0], offsetY: camera[1], zoom: camera[2] },
    viewport: { width: entry.width, height: entry.height }, deviceScaleFactor: entry.dpr, devicePixelRatio: entry.dpr, effectiveDpr: entry.dpr,
    browserVersion: "Chrome test", vendor: "NVIDIA", renderer: "ANGLE NVIDIA Vulkan", screen: { width: 1920, height: 1080 },
    timeZone: "UTC", headed: true, reducedMotion: entry.reduced, clean: entry.clean, stillCamera: true, selectedDetailId: params.get("sel"),
    hash: `${entry.hash}&d=${entry.clock.slice(0, 10)}`, screenshotPhase: { stage: "main", hour: Number(params.get("t")), sky: "day" }, screenshotTiming: "after settle",
    outputs: { screenshot: entry.screenshot, json: entry.manifest },
  };
}

async function capture(entry) {
  const png = await sharp({ create: { width: 64, height: 40, channels: 3, background: entry.id === "baseline" ? "#496246" : "#424f3b" } }).png().toBuffer();
  await writeFile(entry.screenshot, png);
  const report = { capture: manifest(entry), instruments: {} };
  if (entry.burst) {
    const paths = [];
    for (let index = 0; index < entry.burst; index++) {
      const path = `${entry.screenshot.slice(0, -4)}-burst-${index}.png`;
      await writeFile(path, png); paths.push(path);
    }
    report.instruments.burst = { count: entry.burst, paths, intervalMs: 600, clip: entry.clip ? { x: entry.clip[0], y: entry.clip[1], width: entry.clip[2], height: entry.clip[3] } : null };
  }
  await writeFile(entry.manifest, JSON.stringify(report));
  return report;
}

test("garden programme includes five hours, both gates, both motion modes, dense/live/selection/overview", () => {
  const entries = gardenReviewEntries([{ id: "a" }, { id: "b" }], { clock: "2026-10-05", selectedDetailId: "chain-test" });
  assert.equal(entries.length, 72);
  assert.equal(new Set(entries.map((entry) => entry.case)).size, 36);
  assert.deepEqual([...new Set(entries.map((entry) => `${entry.width}x${entry.height}`))], ["1200x640", "900x720"]);
  for (const reduced of [false, true]) {
    const arm = entries.filter((entry) => entry.id === "a" && entry.width === 1200 && entry.reduced === reduced);
    assert.deepEqual(arm.slice(0, 5).map((entry) => entry.hash), ["#t=7", "#t=12.25", "#t=18.5", "#t=19.2", "#t=22"]);
    assert.ok(arm.some((entry) => entry.fixture === null && entry.observer.dateMode === "flowing"));
    assert.ok(arm.some((entry) => entry.fixture === "dense"));
    assert.ok(arm.some((entry) => entry.hash.includes("sel=chain-test")));
    assert.ok(arm.some((entry) => entry.hash.includes("cam=0,0,0.28")));
  }
});

test("preview arguments pin serving tree, DEV appearance and existing burst instruments", async (t) => {
  const { matrix } = await setup(t, { burst: true });
  const plan = await normalizeLookMatrix(matrix);
  const entry = plan.entries[0];
  const args = previewArguments(entry);
  for (const flag of ["--url", "--served-checkout", "--appearance", "--headed", "--still-camera", "--clock", "--hash", "--width", "--height", "--dpr", "--clean", "--reduced", "--assert", "--burst-sheet", "--clip"]) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf("--served-checkout") + 1], entry.checkout);
  assert.equal(args[args.indexOf("--appearance") + 1], entry.appearance);
  assert.ok(!args.includes("--contact-sheet"));
});

test("serial captures produce blind full-frame sheets, secondary crops and owner-only private key", async (t) => {
  const { matrix } = await setup(t, { burst: true, twoCases: true });
  let active = 0; const order = [];
  const result = await runLookSelection(matrix, { choose: () => 1, capture: async (entry) => {
    assert.equal(active, 0); active++;
    order.push(`${entry.case}:${entry.id}`);
    await new Promise((done) => setTimeout(done, 5));
    const report = await capture(entry); active--; return report;
  } });
  assert.deepEqual(order, ["noon:baseline", "noon:candidate", "night:baseline", "night:candidate"]);
  const review = JSON.parse(await readFile(result.reviewPath, "utf8"));
  const key = JSON.parse(await readFile(result.keyPath, "utf8"));
  assert.equal(key.cases[0].X.entry.id, "candidate");
  assert.equal(key.cases[0].Y.entry.id, "baseline");
  assert.equal((await stat(result.keyPath)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(review).includes("candidate"));
  assert.ok(!JSON.stringify(review).includes("baseline"));
  for (const item of result.cases) {
    const meta = await sharp(item.fullFrame).metadata();
    assert.equal(meta.height, 80); assert.ok(meta.width >= 128);
    assert.equal(item.secondaryDetails.length, 2);
  }
  assert.equal(review.presentationOrder, "all full frames first, secondary details second");
});

test("identity drift, incomplete identity and wrong serving tree emit no qualifying sheet or key", async (t) => {
  for (const [name, mutate] of [
    ["effectiveDpr", (report) => { report.capture.effectiveDpr = 2; }],
    ["Wrong.*served checkout", (report) => { report.capture.servedCheckout.root = "/wrong-tree"; }],
    ["Inspector", (report) => { report.capture.inspectorActive = true; }],
    ["fixture", (report) => { delete report.capture.fixture.payloadHash; }],
    ["Serving checkout changed", (report) => { report.capture.servedCheckout.changedDuringCapture = true; }],
  ]) {
    const { matrix } = await setup(t);
    await assert.rejects(runLookSelection(matrix, { capture: async (entry) => {
      const report = await capture(entry); if (entry.id === "candidate") mutate(report); return report;
    } }), new RegExp(name, "i"));
    const files = await readdir(matrix.outputDirectory);
    assert.ok(!files.some((path) => path.startsWith("full-") || path === "review.json" || path === "private-xy-key.json"));
  }
});

test("secondary burst metadata must match before any blind review sheets are emitted", async (t) => {
  const { matrix } = await setup(t, { burst: true });
  await assert.rejects(runLookSelection(matrix, { capture: async (entry) => {
    const report = await capture(entry);
    if (entry.id === "candidate") report.instruments.burst.intervalMs = 700;
    return report;
  } }), /secondary burst/);
  assert.ok(!(await readdir(matrix.outputDirectory)).some((path) => path.startsWith("full-")));
});

test("matrix rejects mismatched requested inputs and never overwrites evidence", async (t) => {
  const { matrix } = await setup(t);
  const invalid = structuredClone(matrix); invalid.entries[1].dpr = 2;
  await assert.rejects(normalizeLookMatrix(invalid), /requested dpr/);
  const reordered = structuredClone(matrix);
  reordered.entries[0].observer = { dateMode: "fixed", timeZone: "UTC" };
  reordered.entries[1].observer = { timeZone: "UTC", dateMode: "fixed" };
  await normalizeLookMatrix(reordered);
  await mkdir(matrix.outputDirectory); await writeFile(resolve(matrix.outputDirectory, "keep.txt"), "existing evidence");
  let called = false;
  await assert.rejects(runLookSelection(matrix, { capture: () => { called = true; } }), /fresh output directory/);
  assert.equal(called, false);
  assert.equal(await readFile(resolve(matrix.outputDirectory, "keep.txt"), "utf8"), "existing evidence");
});

test("cold winner recapture uses the private mapping and rejects changed winning code or appearance", async (t) => {
  const { root, matrix } = await setup(t);
  const result = await runLookSelection(matrix, { capture, choose: () => 1 });
  const key = JSON.parse(await readFile(result.keyPath, "utf8"));
  const winner = await recaptureLookWinner(key, "noon", "X", resolve(root, "winner"), { capture });
  assert.ok((await stat(winner.screenshot)).size > 0);
  await assert.rejects(recaptureLookWinner(key, "noon", "X", resolve(root, "changed-code"), { capture: async (entry) => {
    const report = await capture(entry); report.capture.servedCheckout.sourceHash = "c".repeat(64); return report;
  } }), /Winner checkout changed/);
  await writeFile(key.cases[0].X.entry.appearance, JSON.stringify({ schemaVersion: 1, preset: "changed", keyLight: 0.2 }));
  await assert.rejects(recaptureLookWinner(key, "noon", "X", resolve(root, "changed-appearance"), { capture }), /appearance document changed/);
});

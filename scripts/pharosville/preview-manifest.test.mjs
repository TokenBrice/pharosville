import assert from "node:assert/strict";
import { test } from "node:test";
import { appearanceDocumentIdentity, assertComparableCaptures, fetchServedCheckoutIdentity, hashFixturePayloads, buildCaptureManifest, phaseForHour } from "./preview-manifest.mjs";

test("fixture hash ignores object key order but preserves values and epoch", () => {
  const payloads = { stablecoins: { peggedAssets: [{ id: "a", circulating: { peggedUSD: 100 } }] }, chains: { total: 100 } };
  const reordered = { chains: { total: 100 }, stablecoins: { peggedAssets: [{ circulating: { peggedUSD: 100 }, id: "a" }] } };
  const hash = hashFixturePayloads(payloads, 1_700_000_000_000);
  assert.equal(hashFixturePayloads(reordered, 1_700_000_000_000), hash);
  const nudged = structuredClone(payloads);
  nudged.stablecoins.peggedAssets[0].circulating.peggedUSD += 1;
  assert.notEqual(hashFixturePayloads(nudged, 1_700_000_000_000), hash);
  assert.notEqual(hashFixturePayloads(payloads, 1_700_000_001_000), hash);
});

test("missing optional capture evidence is null with an unavailable reason", () => {
  const capture = buildCaptureManifest({ commit: "abc", dirtyPaths: [] });
  assert.equal(capture.commit, "abc");
  assert.deepEqual(capture.dirtyPaths, []);
  assert.equal(capture.vendor, null);
  assert.equal(capture.worldGeneratedAtMs, null);
  assert.ok(capture.unavailable.some(({ field, reason }) => field === "vendor" && typeof reason === "string" && reason.length > 0));
  assert.ok(capture.unavailable.some(({ field }) => field === "worldGeneratedAtMs"));
  assert.equal(capture.phaseForHour, null);
  assert.ok(capture.unavailable.some(({ field }) => field === "phaseForHour"));
  assert.equal(capture.selectedDetailId, null);
  assert.equal(capture.fixture, null);
});

test("phaseForHour identifies fixed date and hour sky plateaus", () => {
  for (const date of [new Date(2026, 5, 21, 12), new Date(2026, 11, 21, 12)]) {
    assert.equal(phaseForHour(12, date), "day");
    assert.equal(phaseForHour(0, date), "night");
    assert.equal(phaseForHour(23, date), "night");
  }
});

test("phaseForHour leaves missing or invalid date and hour unknown", () => {
  assert.equal(phaseForHour(null, new Date(2026, 5, 21)), null);
  assert.equal(phaseForHour(12, null), null);
  assert.equal(phaseForHour(Number.NaN, new Date(2026, 5, 21)), null);
  assert.equal(phaseForHour(12, new Date(Number.NaN)), null);
});

function comparisonCapture() {
  return {
    scriptCheckout: { root: "/script", commit: "script-sha" },
    servedCheckout: { root: "/garden-a", commit: "served-sha", sourceHash: "served-bytes" },
    fixture: { name: "dense", payloadHash: "fixture-sha" },
    appearance: { schemaVersion: 1, preset: "accepted", checksum: "abc12345", appliedChecksum: "abc12345" },
    inspectorActive: false,
    observer: { dateMode: "fixed", observerOriginMs: 1_700_000_060_000, timeZone: "UTC", hourPin: { source: "t", value: 12 }, calendarPin: "2026-10-05" },
    camera: { offsetX: 0, offsetY: 0, zoom: 0.28 },
    viewport: { width: 1200, height: 640 }, effectiveDpr: 1, deviceScaleFactor: 1, devicePixelRatio: 1,
    browserVersion: "Chrome 130", vendor: "NVIDIA", renderer: "ANGLE NVIDIA Vulkan",
    screen: { width: 1920, height: 1080 }, timeZone: "UTC", headed: true, reducedMotion: true,
    stillCamera: true, clean: true, selectedDetailId: null, hash: "#t=12&d=2026-10-05",
    screenshotPhase: { stage: "main", hour: 12, sky: "day" }, screenshotTiming: "after settle",
  };
}

test("manifest distinguishes script checkout, served checkout and applied appearance", () => {
  const input = comparisonCapture();
  const capture = buildCaptureManifest(input);
  assert.deepEqual(capture.scriptCheckout, input.scriptCheckout);
  assert.deepEqual(capture.servedCheckout, input.servedCheckout);
  assert.deepEqual(capture.appearance, input.appearance);
  assert.deepEqual(capture.screenshotPhase, input.screenshotPhase);
  assert.equal(capture.inspectorActive, false);
});

test("comparison permits intentional checkout and preset differences, not evidence drift", () => {
  const left = comparisonCapture();
  const right = structuredClone(left);
  right.servedCheckout = { root: "/garden-b", commit: "other-commit", sourceHash: "other-bytes" };
  right.scriptCheckout.commit = "other-script";
  right.appearance = { schemaVersion: 1, preset: "soft-moss", checksum: "new12345", appliedChecksum: "new12345" };
  assert.doesNotThrow(() => assertComparableCaptures(left, right));
  for (const [name, change] of [
    ["fixture", (capture) => { capture.fixture.payloadHash = "different"; }],
    ["observer", (capture) => { capture.observer.observerOriginMs++; }],
    ["camera", (capture) => { capture.camera.zoom = 0.3; }],
    ["viewport", (capture) => { capture.viewport.width++; }],
    ["effectiveDpr", (capture) => { capture.effectiveDpr = 2; }],
    ["browserVersion", (capture) => { capture.browserVersion = "another Chrome"; }],
    ["renderer", (capture) => { capture.renderer = "different GPU"; }],
    ["screenshotPhase", (capture) => { capture.screenshotPhase.hour = 22; }],
    ["reducedMotion", (capture) => { capture.reducedMotion = false; }],
  ]) {
    const drift = structuredClone(right); change(drift);
    assert.throws(() => assertComparableCaptures(left, drift), new RegExp(name));
  }
});

test("missing identity, unapplied appearance and inspector frames block comparison", () => {
  const left = comparisonCapture();
  for (const field of ["fixture", "observer", "camera", "viewport", "effectiveDpr", "browserVersion", "renderer", "servedCheckout", "scriptCheckout", "appearance", "inspectorActive"]) {
    const missing = structuredClone(left); delete missing[field];
    assert.throws(() => assertComparableCaptures(left, missing));
  }
  const queued = structuredClone(left); queued.appearance.appliedChecksum = null;
  assert.throws(() => assertComparableCaptures(left, queued), /unapplied/);
  const inspector = structuredClone(left); inspector.inspectorActive = true;
  assert.throws(() => assertComparableCaptures(left, inspector), /Inspector/);
});

test("appearance document checksum is canonical and protects the local export", () => {
  const document = { schemaVersion: 1, preset: "accepted", skyFill: 1, thresholdProfile: {} };
  const identity = appearanceDocumentIdentity(document);
  assert.deepEqual(appearanceDocumentIdentity(Object.fromEntries(Object.entries(document).reverse())), identity);
  assert.deepEqual(appearanceDocumentIdentity({ ...document, checksum: identity.checksum }), identity);
  assert.throws(() => appearanceDocumentIdentity({ ...document, checksum: "invalid" }), /checksum mismatch/);
  assert.throws(() => appearanceDocumentIdentity({ preset: "accepted" }), /Invalid/);
});

test("DEV serving identity is obtained from the explicit URL, independently of the script checkout", async () => {
  const identity = { root: "/actual-serving-tree", commit: "served-commit", dirtyPaths: ["src/world.ts"], sourceHash: "a".repeat(64) };
  let requested;
  const actual = await fetchServedCheckoutIdentity("http://localhost:5184/garden?d=2026-10-05", async (url) => {
    requested = url.href; return { status: 200, ok: true, json: async () => identity };
  });
  assert.equal(requested, "http://localhost:5184/__pharosville/checkout");
  assert.deepEqual(actual, identity);
  assert.equal(await fetchServedCheckoutIdentity("http://localhost:5184", async () => ({ status: 404 })), null);
  await assert.rejects(fetchServedCheckoutIdentity("http://localhost:5184", async () => ({ status: 503, ok: false })), /identity failed/);
  await assert.rejects(fetchServedCheckoutIdentity("http://localhost:5184", async () => ({ status: 200, ok: true, json: async () => ({ ...identity, dirtyPaths: [".env.local"] }) })), /environment paths/);
});

test("comparison refuses changed-source ordinary previews and missing viewport/camera identity", () => {
  const changed = comparisonCapture(); changed.servedCheckout.changedDuringCapture = true;
  assert.throws(() => assertComparableCaptures(changed, comparisonCapture()), /checkout changed/);
  const incomplete = comparisonCapture(); incomplete.servedCheckout.samplingIncomplete = true;
  assert.throws(() => assertComparableCaptures(incomplete, comparisonCapture()), /sampling was incomplete/);
  const camera = comparisonCapture(); camera.camera = {};
  assert.throws(() => assertComparableCaptures(camera, comparisonCapture()), /camera identity/);
  const viewport = comparisonCapture(); viewport.viewport = {};
  assert.throws(() => assertComparableCaptures(viewport, comparisonCapture()), /viewport.DPR/);
  const live = comparisonCapture(); live.fixture.name = "live";
  assert.throws(() => assertComparableCaptures(live, comparisonCapture()), /incomplete/);
});

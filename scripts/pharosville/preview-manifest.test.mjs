import assert from "node:assert/strict";
import { test } from "node:test";
import { hashFixturePayloads, buildCaptureManifest, phaseForHour } from "./preview-manifest.mjs";

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

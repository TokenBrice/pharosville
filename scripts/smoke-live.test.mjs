import assert from "node:assert/strict";
import { endpointChecks, findFreshnessProblems } from "./smoke-live.mjs";

const now = Date.UTC(2026, 10, 9, 12) / 1000;
const depeg = endpointChecks.find(({ path }) => path.startsWith("/api/depeg-events"));
const reserves = endpointChecks.find(({ path }) => path.startsWith("/api/stablecoin-reserves"));
const liquidity = endpointChecks.find(({ path }) => path === "/api/dex-liquidity");
assert.ok(depeg && reserves && liquidity);
assert.equal(depeg.freshness.producerIntervalSec, 900);
assert.equal(reserves.freshness.producerIntervalSec, 14_400);
assert.equal(liquidity.freshness.producerIntervalSec, 1800);

const events = { events: [{ startedAt: now - 3600, endedAt: null, peakDeviationBps: -120, direction: "below", source: "live" }], total: 1 };
assert.doesNotThrow(() => depeg.validate(events));
assert.doesNotThrow(() => depeg.validate({ events: [], total: 0 }));
assert.throws(() => depeg.validate({ events: [{}], total: 1 }));
assert.deepEqual(findFreshnessProblems(depeg.path, events, depeg.freshness, now, new Headers({ "x-data-age": "60" })), []);
assert.equal(findFreshnessProblems(depeg.path, events, depeg.freshness, now, new Headers({ age: "60" })).length, 1);
assert.ok(findFreshnessProblems(depeg.path, events, depeg.freshness, now, new Headers({ "x-data-age": "60", warning: '110 - "Response is stale"' })).some((p) => p.includes("Warning 110")));

const backing = { stablecoinId: "usdc-circle", mode: "live", estimated: false, liveAt: now - 60,
  reserves: [{ name: "Cash", pct: 100, risk: "low" }], provenance: { freshnessMode: "verified" } };
assert.doesNotThrow(() => reserves.validate(backing));
assert.deepEqual(findFreshnessProblems(reserves.path, backing, reserves.freshness, now), []);
assert.ok(findFreshnessProblems(reserves.path, { ...backing, liveAt: now - 28_801 }, reserves.freshness, now).some((p) => p.includes("28800s budget")));
assert.ok(findFreshnessProblems(reserves.path, { ...backing, sync: { stale: true } }, reserves.freshness, now).some((p) => p.includes("stale reserve sync")));
assert.ok(findFreshnessProblems(reserves.path, { ...backing, mode: "curated-fallback", estimated: true }, reserves.freshness, now).some((p) => p.includes("unverified")));
assert.throws(() => reserves.validate({ ...backing, displayUrl: "http://example.com" }));
assert.throws(() => reserves.validate({ ...backing, stablecoinId: "another-coin" }));

const row = { totalTvlUsd: 0, effectiveTvlUsd: 0, liquidityScore: null, coverageClass: "unobserved", coverageConfidence: 0,
  liquidityEvidenceClass: "unobserved", hasMeasuredLiquidityEvidence: false, updatedAt: now - 60, methodologyVersion: "v3" };
assert.deepEqual(liquidity.validate({ "usdc-circle": row }), []);
assert.deepEqual(findFreshnessProblems(liquidity.path, { "usdc-circle": row }, liquidity.freshness, now), []);
assert.throws(() => liquidity.validate({ "usdc-circle": { ...row, totalTvlUsd: null } }));
assert.throws(() => liquidity.validate({ "usdc-circle": { ...row, liquidityEvidenceClass: "healthy" } }));
assert.throws(() => liquidity.validate({ "usdc-circle": { ...row, methodologyVersion: Array.from({ length: 40_000 }, (_, i) => i.toString(36)).join(",") } }), /30 KB gzip budget/);
assert.equal(liquidity.validate({}).length, 1);
console.log("Panel smoke shape and freshness self-check passed");

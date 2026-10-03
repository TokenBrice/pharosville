import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import {
  installPreviewFixture, analyzeTargetOverlap,
  previewClockDescriptor, createAttentionWatch, snapshotAttentionWatch, summarizeAttentionWatch,
} from "./preview-fixture.mjs";
import { require as tsxRequire } from "tsx/cjs/api";

const { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY: endpointPaths } = tsxRequire("../../shared/lib/pharosville-api-endpoints.ts", import.meta.url);
const { createGardenDirector, requestGardenBeat } = tsxRequire("../../src/systems/garden-director.ts", import.meta.url);
const { debugDirectorLog } = tsxRequire("../../src/lib/pharosville-debug.ts", import.meta.url);

test("fixture routes reuse checked-in data with coherent fresh metadata and reproducible clocks", async () => {
  for (const name of ["calm", "dense", "stress"]) {
    const routes = [];
    const realm = clockRealm();
    const page = {
      addInitScript: async (install, epoch) => vm.runInContext(`(${install.toString()})(${epoch})`, realm.context),
      route: async (predicate, handler) => routes.push({ predicate, handler }),
    };
    await installPreviewFixture(page, name);
    assert.equal(routes.length, 7);
    assert.equal(realm.now(), 1_700_000_060_000);
    let stability;
    let fleet;
    for (const route of routes) {
      let response;
      await route.handler({ fulfill: async (value) => { response = JSON.parse(value.body); } });
      assert.equal(response._meta.updatedAt, 1_700_000_000);
      if (route.predicate(new URL("http://localhost/api/stability-index?detail=true"))) stability = response;
      if (route.predicate(new URL("http://localhost/api/stablecoins"))) fleet = response;
    }
    assert.ok(fleet.peggedAssets.length >= (name === "calm" ? 2 : 100));
    assert.equal(stability.current.score, name === "calm" ? 82 : name === "dense" ? 72 : 12);
  }
});

async function routedFixture(name) {
  const routes = [];
  const realm = clockRealm();
  const identity = await installPreviewFixture({
    addInitScript: async (install, epoch) => vm.runInContext(`(${install.toString()})(${epoch})`, realm.context),
    route: async (predicate, handler) => routes.push({ predicate, handler }),
  }, name);
  const payloads = {};
  const paths = endpointPaths;
  assert.equal(routes.length, 7);
  assert.equal(realm.now(), 1_700_000_060_000);
  for (const route of routes) {
    let response;
    await route.handler({ fulfill: async (value) => { response = JSON.parse(value.body); } });
    assert.equal(response._meta.status, "fresh");
    assert.equal(response._meta.updatedAt, 1_700_000_000);
    const key = Object.keys(paths).find((key) => route.predicate(new URL(paths[key], "http://localhost")));
    assert.ok(key, "every routed endpoint belongs to the fixture contract");
    payloads[key] = response;
  }
  return { ...payloads, identity };
}

test("quiet-dense routes the normalized 132-identity universe", async () => {
  const data = await routedFixture("quiet-dense");
  assert.equal(data.stablecoins.peggedAssets.length, 132);
  assert.equal(data.chains.globalChange7dPct, 0);
  for (const asset of data.stablecoins.peggedAssets) {
    const holdings = Object.values(asset.chainCirculating).reduce((sum, point) => sum + point.current, 0);
    const circulating = Object.values(asset.circulating).reduce((sum, value) => sum + value, 0);
    assert.ok(holdings <= circulating + circulating * 1e-12, asset.id);
  }
  assert.equal(data.stability.current.band, "STEADY");
  assert.equal(data.stability.current.score, 82);
  for (const coin of data.pegSummary.coins) {
    assert.equal(coin.activeDepeg, false);
    assert.equal(coin.currentDeviationBps, 0);
  }
});

test("mixed-capacity keeps the universe with crowded risk waters", async () => {
  const quiet = await routedFixture("quiet-dense");
  const mixed = await routedFixture("mixed-capacity");
  assert.deepEqual(mixed.stablecoins.peggedAssets.map(({ id }) => id), quiet.stablecoins.peggedAssets.map(({ id }) => id));
  assert.equal(mixed.stability.current.band, "CRISIS");
  assert.equal(mixed.stability.current.score, 25);
  assert.ok(mixed.pegSummary.coins.some(({ activeDepeg }) => activeDepeg));
  assert.ok(Object.values(mixed.stress.signals).some(({ band }) => band === "DANGER"));
});

test("quiet-normal is the two-ship quiet case", async () => {
  const data = await routedFixture("quiet-normal");
  assert.equal(data.stablecoins.peggedAssets.length, 2);
  assert.equal(data.chains.globalChange7dPct, 0);
  assert.equal(data.stability.current.band, "BEDROCK");
  assert.equal(data.stability.current.score, 98);
  for (const row of data.mintBurn.coins) {
    assert.equal(row.mintVolume24hUsd, 0);
    assert.equal(row.burnVolume24hUsd, 0);
    assert.equal(row.has24hActivity, false);
    assert.equal(row.netFlowDirection24h, "inactive");
  }
  assert.equal(data.mintBurn.gauge.band, "FLAT");
});

test("unknown preview preset throws before installing routes", async () => {
  await assert.rejects(installPreviewFixture({}, "unknown"), /Unknown fixture/);
});

test("overlap clips targets to viewport and reports selected and dominant bounds without counting touching edges", () => {
  const target = (detailId, x, y, width, height) => ({ kind: "ship", detailId, rect: { x, y, width, height } });
  const result = analyzeTargetOverlap([
    target("a", -10, 0, 30, 20), target("b", 10, 0, 20, 20), target("c", 30, 0, 10, 20), target("outside", 200, 0, 10, 10),
  ], "b", 100, 100);
  assert.equal(result.visibleShipTargets, 3);
  assert.equal(result.overlappingPairs, 1);
  assert.deepEqual(result.selected.overlaps, [{ detailId: "a", fraction: 0.5 }]);
  assert.deepEqual(result.largestTargets[0].rect, { x: 0, y: 0, width: 20, height: 20 });
});


function clockRealm() {
  let elapsedMs = 0;
  const context = vm.createContext({
    performance: { now: () => elapsedMs, getEntries: () => ["native entry"] },
    requestAnimationFrame() {}, cancelAnimationFrame() {},
    setTimeout() {}, clearTimeout() {}, setInterval() {}, clearInterval() {},
  });
  vm.runInContext(`
    globalThis.before = {
      performance, now: performance.now, getEntries: performance.getEntries,
      requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout, setInterval, clearInterval,
      NativeDate: Date, parse: Date.parse, UTC: Date.UTC, prototype: Date.prototype,
    };
  `, context);
  return { context, advance: (ms) => { elapsedMs = ms; }, now: () => vm.runInContext("Date.now()", context) };
}

function assertNativeSchedulers(context, expectedMs) {
  context.expectedMs = expectedMs;
  assert.equal(vm.runInContext(`[
    performance === before.performance, performance.now === before.now,
    performance.getEntries === before.getEntries,
    requestAnimationFrame === before.requestAnimationFrame, cancelAnimationFrame === before.cancelAnimationFrame,
    setTimeout === before.setTimeout, clearTimeout === before.clearTimeout,
    setInterval === before.setInterval, clearInterval === before.clearInterval,
    Date.parse === before.parse, Date.UTC === before.UTC, Date.prototype === before.prototype,
    performance.getEntries()[0] === "native entry",
    Date.now() === expectedMs, new Date().getTime() === expectedMs,
    Date("ignored") === new before.NativeDate(expectedMs).toString(),
    new Date(0).getTime() === 0, new Date("2000-01-01T00:00:00Z").getUTCFullYear() === 2000,
    Date.parse("1970-01-01T00:00:00Z") === 0, Date.UTC(1970, 0, 1) === 0,
    new Date() instanceof before.NativeDate,
    (() => { class ChildDate extends Date {} const child = new ChildDate();
      return child instanceof ChildDate && child instanceof Date && child.getTime() === expectedMs; })(),
  ].every(Boolean)`, context), true);
}

test("fixed mode stays fixed while native performance advances", async () => {
  const realm = clockRealm();
  await installPreviewFixture({
    addInitScript: async (install, epoch) => vm.runInContext(`(${install.toString()})(${epoch})`, realm.context),
    route: async () => {},
  }, "calm");
  realm.advance(123_456);
  assertNativeSchedulers(realm.context, 1_700_000_060_000);
  assert.equal(vm.runInContext("performance.now()", realm.context), 123_456);
});

test("flowing fixture observer releases ordinary admission at +90 s and leaves performance/RAF/timers native", async () => {
  const realm = clockRealm();
  await installPreviewFixture({
    addInitScript: async (install, epoch) => vm.runInContext(`(${install.toString()})(${epoch})`, realm.context),
    route: async () => {},
  }, "quiet-dense", { dateMode: "flowing" });
  assertNativeSchedulers(realm.context, 1_700_000_060_000);
  const director = createGardenDirector("flowing-observer-boundary", realm.now() / 1000);
  const request = { kind: "arrival", foreground: true, durationSeconds: 10, priority: 90 };
  realm.advance(89_999);
  assert.equal(requestGardenBeat(director, request, realm.now() / 1000), null);
  assertNativeSchedulers(realm.context, 1_700_000_149_999);
  realm.advance(90_000);
  assert.equal(requestGardenBeat(director, request, realm.now() / 1000)?.startSeconds, 1_700_000_150);
  assertNativeSchedulers(realm.context, 1_700_000_150_000);
  assert.equal(vm.runInContext("performance.now()", realm.context), 90_000);
});

test("free-hour descriptor injects no t= and adds d= only with --clock", () => {
  const defaultHour = previewClockDescriptor({ fixture: "calm" });
  assert.equal(new URLSearchParams(defaultHour.hash.slice(1)).get("t"), "12");
  const clock = { date: "2026-09-26", epochMs: Date.UTC(2026, 8, 26) };
  for (const hash of ["#", "#sel=ship.usdc-circle"]) {
    for (const pin of [null, clock]) {
      const descriptor = previewClockDescriptor({ fixture: "calm", dateMode: "flowing", hash, clock: pin });
      const params = new URLSearchParams(descriptor.hash.slice(1));
      assert.equal(params.get("t"), null);
      assert.equal(params.get("n"), null);
      assert.equal(params.get("sel"), hash.includes("sel=") ? "ship.usdc-circle" : null);
      assert.equal(params.get("d"), pin?.date ?? null);
      assert.equal(descriptor.hourPin, null);
      assert.equal(descriptor.calendarPin, pin?.date ?? null);
      assert.equal(descriptor.dateMode, "flowing");
    }
  }
  assert.deepEqual(previewClockDescriptor({ hash: "#n=1" }).hourPin, { source: "n", value: 22 });
  assert.deepEqual(previewClockDescriptor({ hash: "#", search: "?t=22" }).hourPin, { source: "t", value: 22 });
  assert.equal(previewClockDescriptor({ hash: "#sel=ship.usdc-circle", search: "?t=22" }).hourPin, null);
  assert.equal(previewClockDescriptor({ hash: "#d=2026-09-26", search: "?d=2026-09-27" }).calendarPin, "2026-09-27");
  assert.throws(() => previewClockDescriptor({ hash: "#d=2026-09-26", clock }), /drop the d=/);
});

const epochMs = 1_700_000_000_000;
function admission(id, startMs, endMs, extra = {}) {
  return { rowType: "admission", clockDomain: "epoch", foreground: true, kind: "ritual",
    priority: 30, id, admittedAtWallMs: epochMs + startMs,
    startSeconds: (epochMs + startMs) / 1000, endSeconds: (epochMs + endMs) / 1000, ...extra };
}
function poll(hostMs, directorLog, browserEpochMs = epochMs + hostMs) {
  return { hostMs, epochMs: browserEpochMs, directorLog };
}

test("occupancy counts one ritual once and clips at both bounds", () => {
  const beat = admission("kindling", 500, 9_500);
  const watch = createAttentionWatch(poll(0, []));
  snapshotAttentionWatch(watch, poll(1_000, [beat,
    { ...beat, rowType: "ritual-start", endSeconds: beat.startSeconds },
    admission("environment", 0, 10_000, { foreground: false, kind: "weather" }),
    admission("voyage", 0, 10_000, { rowType: "forced-motion", clockDomain: "motion" }),
  ]));
  // Snapshots retain the early admission after the browser's capped log evicts it.
  beat.endSeconds = (epochMs + 10_000) / 1000;
  snapshotAttentionWatch(watch, poll(10_000, Array.from({ length: 200 }, (_, index) => ({
    ...admission(`diagnostic-${index}`, 2_000, 2_000), rowType: "ritual-start",
  }))));
  const summary = summarizeAttentionWatch(watch);
  assert.equal(summary.admissionCount, 1);
  assert.equal(summary.occupancyPct, 90);
  assert.equal(summary.longestQuietMs, 500);
  assert.deepEqual(summary.quietRuns, [{ startMs: 0, endMs: 500 }, { startMs: 9_500, endMs: 10_000 }]);

  const clipped = createAttentionWatch(poll(0, [admission("already-active", -2_000, 2_000)]));
  snapshotAttentionWatch(clipped, poll(10_000, [
    admission("adjacent", 2_000, 4_000),
    admission("overlap", 3_000, 6_000),
    admission("past-end", 8_000, 12_000),
    admission("at-end", 10_000, 11_000),
  ]));
  const bounds = summarizeAttentionWatch(clipped);
  assert.equal(bounds.admissionCount, 3);
  assert.equal(bounds.occupancyPct, 80);
  assert.deepEqual(bounds.occupiedRuns, [{ startMs: 0, endMs: 6_000 }, { startMs: 8_000, endMs: 10_000 }]);
  assert.equal(bounds.longestQuietMs, 2_000);
});

test("preempted beat ends at replacement", () => {
  const startSeconds = epochMs / 1000;
  const director = createGardenDirector("preempted-watch-span");
  const old = requestGardenBeat(director, { kind: "ritual", foreground: true, durationSeconds: 30, priority: 30 }, startSeconds);
  assert.ok(old);
  const watch = createAttentionWatch(poll(0, debugDirectorLog.filter((row) => row.id === old.id)));
  const replacement = requestGardenBeat(director, { kind: "market", foreground: true, durationSeconds: 2, priority: 100 }, startSeconds + 3);
  assert.ok(replacement);
  snapshotAttentionWatch(watch, poll(10_000, debugDirectorLog.filter((row) => row.id === old.id || row.id === replacement.id)));
  const summary = summarizeAttentionWatch(watch);
  assert.equal(summary.admissionCount, 1);
  assert.equal(summary.urgentAdmissionCount, 1);
  assert.equal(summary.occupancyPct, 50);
  assert.equal(summary.longestQuietMs, 5_000);
  assert.equal(summary.events[0].endSeconds, startSeconds + 3);
});

test("frozen epoch reports unmeasured rather than quiet", () => {
  const frozen = admission("frozen", 0, 9_000);
  const watch = createAttentionWatch(poll(0, [frozen], epochMs));
  snapshotAttentionWatch(watch, poll(10_000, [frozen], epochMs));
  const summary = summarizeAttentionWatch(watch);
  assert.equal(summary.status, "unmeasured");
  assert.equal(summary.epochStartMs, summary.epochEndMs);
  assert.equal(summary.occupancyPct, null);
  assert.equal(summary.longestQuietMs, null);
  assert.equal(summary.quietRuns, null);
});

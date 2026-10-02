import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { installFixedDate, installPreviewFixture, analyzeTargetOverlap } from "./preview-fixture.mjs";
import { require as tsxRequire } from "tsx/cjs/api";

const { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY: endpointPaths } = tsxRequire("../../shared/lib/pharosville-api-endpoints.ts", import.meta.url);

test("fixture routes reuse checked-in data with coherent fresh metadata and reproducible clocks", async () => {
  for (const name of ["calm", "dense", "stress"]) {
    const routes = [];
    let fixedTime;
    const page = { addInitScript: async (install, time) => { assert.equal(install, installFixedDate); fixedTime = time; }, route: async (predicate, handler) => routes.push({ predicate, handler }) };
    await installPreviewFixture(page, name);
    assert.equal(routes.length, 7);
    assert.equal(fixedTime, 1_700_000_060_000);
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
  let fixedTime;
  const identity = await installPreviewFixture({
    addInitScript: async (install, time) => { assert.equal(install, installFixedDate); fixedTime = time; },
    route: async (predicate, handler) => routes.push({ predicate, handler }),
  }, name);
  const payloads = {};
  const paths = endpointPaths;
  assert.equal(routes.length, 7);
  assert.equal(fixedTime, 1_700_000_060_000);
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


test("Date-only init preserves native performance, RAF, timer identities and Date constructor semantics", () => {
  const context = vm.createContext({
    performance: { now: () => 123.456789, getEntries: () => ["native entry"] },
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
  vm.runInContext(`(${installFixedDate.toString()})(1700000060000)`, context);
  assert.equal(vm.runInContext(`[
    performance === before.performance, performance.now === before.now,
    performance.getEntries === before.getEntries,
    requestAnimationFrame === before.requestAnimationFrame, cancelAnimationFrame === before.cancelAnimationFrame,
    setTimeout === before.setTimeout, clearTimeout === before.clearTimeout,
    setInterval === before.setInterval, clearInterval === before.clearInterval,
    Date.parse === before.parse, Date.UTC === before.UTC, Date.prototype === before.prototype,
    performance.now() === 123.456789, performance.getEntries()[0] === "native entry",
    Date.now() === 1700000060000, new Date().getTime() === 1700000060000,
    Date("ignored") === new before.NativeDate(1700000060000).toString(),
    new Date(0).getTime() === 0, new Date("2000-01-01T00:00:00Z").getUTCFullYear() === 2000,
    Date.parse("1970-01-01T00:00:00Z") === 0, Date.UTC(1970, 0, 1) === 0,
    new Date() instanceof before.NativeDate,
    (() => { class ChildDate extends Date {} const child = new ChildDate();
      return child instanceof ChildDate && child instanceof Date && child.getTime() === 1700000060000; })(),
  ].every(Boolean)`, context), true);
});

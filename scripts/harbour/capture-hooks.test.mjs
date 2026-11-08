import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { observeLongTasks } from "./long-tasks.mjs";
import { replaySnapshot, pinCaptureClock } from "../perf/snapshot-replay.mjs";

test("Long Tasks observer installs buffered before navigation and bounds retained records", () => {
  let notify, options;
  class Observer {
    static supportedEntryTypes = ["longtask"];
    constructor(callback) { notify = callback; }
    observe(value) { options = value; }
  }
  const window = {};
  runInNewContext(`(${observeLongTasks.toString()})()`, { window, PerformanceObserver: Observer });
  assert.equal(options.type, "longtask"); assert.equal(options.buffered, true);
  const entry = { startTime: 1, duration: 51, attribution: [{ name: "self", containerType: "window" }] };
  notify({ getEntries: () => Array(4100).fill(entry) });
  assert.equal(window.__harbourLongTasks.entries.length, 4096);
  assert.equal(window.__harbourLongTasks.dropped, 4);
  assert.equal(window.__harbourLongTasks.entries[0].durationMs, 51);
});
test("unsupported Long Tasks remains explicitly unavailable", () => {
  const window = {};
  runInNewContext(`(${observeLongTasks.toString()})()`, { window });
  assert.equal(window.__harbourLongTasks.available, false);
});
test("snapshot replay preserves source body/status, rejects missing API rows and leaves other fetches alone", async () => {
  const window = { fetch: async () => "network" };
  runInNewContext(`(${replaySnapshot.toString()})(${JSON.stringify({ responses: { "/api/stablecoins": { status: 200, headers: { "content-encoding": "br", "content-length": "999", "x-source-age": "3600" }, body: '{"updatedAt":123}' } } })})`, { window, location: { href: "http://localhost:5173/", origin: "http://localhost:5173" }, URL, Headers, Response });
  const response = await window.fetch("/api/stablecoins");
  assert.equal(response.status, 200); assert.equal(await response.text(), '{"updatedAt":123}');
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("x-source-age"), "3600");
  await assert.rejects(window.fetch("/api/chains"), /snapshot missing/);
  assert.equal(await window.fetch("/asset.js"), "network");
});
test("capture clock anchors Date/RNG without replacing the performance clock or rAF", () => {
  const raf = () => 1, window = { requestAnimationFrame: raf };
  let elapsed = 0;
  const context = { window, Date, Math: Object.create(Math), performance: { now: () => elapsed } };
  runInNewContext(`(${pinCaptureClock.toString()})({epoch:123456,seed:42})`, context);
  assert.equal(window.Date.now(), 123456);
  assert.equal(+new window.Date(), 123456);
  assert.equal(+new window.Date(789), 789);
  elapsed = 1000;
  assert.equal(window.Date.now(), 124456);
  assert.equal(window.requestAnimationFrame, raf);
});

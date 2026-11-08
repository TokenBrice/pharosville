import { afterEach, describe, expect, it, vi } from "vitest";
import { createReplay } from "../tests/helpers/scenario";
import current from "../tests/fixtures/scenarios/current.json";
import empty from "../tests/fixtures/scenarios/empty.json";
import pending from "../tests/fixtures/scenarios/pending.json";
import storm from "../tests/fixtures/scenarios/storm.json";
import depeg from "../tests/fixtures/scenarios/depeg-recovery.json";
import outage from "../tests/fixtures/scenarios/unknown-stale-outage.json";
import malformed from "../tests/fixtures/scenarios/malformed-good.json";
import { endpointProjector, type ProjectionJson } from "../functions/api/_project";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { HarbourFeed } from "./harbour/data/fetch";
import { buildHarbourModel } from "./harbour/model/build";
import { detectEvents, eventSnapshot, type EventState } from "./harbour/model/events";
import { deriveTargets } from "./harbour/readings/bind";
import type { Scenario } from "../tests/helpers/scenario";

const fixtures = [current, empty, pending, storm, depeg, outage, malformed];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function world(scenario: Scenario) {
  const replay = createReplay(scenario);
  vi.stubGlobal("fetch", replay.fetch);
  vi.spyOn(Date, "now").mockImplementation(replay.now);
  const feed = new HarbourFeed({ now: replay.now, setTimer: () => 0, clearTimer: () => {} });
  await feed.start();
  return { replay, feed, model: () => buildHarbourModel(feed.payloads, replay.now(), { dead: [] }) };
}

describe("shared projected scenario seam", () => {
  it("keeps fixtures within the production projector contract", () => {
    for (const fixture of fixtures) for (const step of fixture.steps) for (const [key, entry] of Object.entries(PHAROSVILLE_ENDPOINT_REGISTRY)) {
      const row = (step.responses as Record<string, { status: number; body: unknown }>)[entry.path];
      if (row?.status === 200) expect(endpointProjector(entry.key)(row.body as ProjectionJson), key).toEqual(row.body);
    }
  });
  it("supports single snapshots and refuses unbounded/dishonest clocks and delays", async () => {
    const replay = createReplay({ epoch: current.epoch, responses: current.steps[0]!.responses });
    expect((await replay.fetch('/api/stablecoins')).status).toBe(200);
    expect(() => replay.advanceTo(-1)).toThrow();
    expect(() => createReplay({ epoch: 1, steps: [{ atMs: 0, responses: { '/api/stablecoins': { delayMs: 5001 } } }] })).toThrow();
    await expect(replay.fetch('/api/missing')).rejects.toThrow('Scenario missing');
  });
  it("replays valid empty, storm and unknown analytical states", async () => {
    const a = await world(empty); expect(a.model().hasFleet).toBe(true); expect(a.model().boats).toHaveLength(0); a.feed.stop();
    const b = await world(storm); expect(deriveTargets({ model: b.model(), chainsChange7d: 0, stablecoinsAttempted: true }).weather?.band).toBe('DANGER'); b.feed.stop();
    const c = await world(outage); expect(c.model().readings.psi).toMatchObject({ lit: false, score: null, band: null }); c.feed.stop();
  });
  it("confirms depeg and recovery only on two distinct projected polls", async () => {
    const { replay, feed, model } = await world(depeg);
    let state: EventState | null = null;
    const events: string[][] = [];
    for (const step of depeg.steps) {
      replay.advanceTo(step.atMs);
      await Promise.all(Object.values(PHAROSVILLE_ENDPOINT_REGISTRY).map((e) => feed.refresh(e.key)));
      const result = detectEvents(state, eventSnapshot(model(), feed.payloads, replay.now()));
      state = result.state; events.push(result.events.map((e) => e.kind));
    }
    expect(events).toEqual([[], [], ['depeg'], [], ['recovery']]); feed.stop();
  });
  it("ages saved readings through stale/outage and recovers without remount", async () => {
    const { replay, feed, model } = await world(outage);
    for (const step of outage.steps.slice(1)) {
      replay.advanceTo(step.atMs);
      await Promise.all(Object.values(PHAROSVILLE_ENDPOINT_REGISTRY).map((e) => feed.refresh(e.key)));
      expect(model().truth.stablecoins.state).toBe(step.atMs < 900000 ? 'stale' : 'current');
      expect(deriveTargets({ model: model(), chainsChange7d: 0, stablecoinsAttempted: true }).fog).toBe(step.atMs < 900000);
    }
    feed.stop();
  });
  it("recovers a rejected malformed response on the next good poll", async () => {
    const { replay, feed, model } = await world(malformed);
    expect(model().hasFleet).toBe(false);
    replay.advanceTo(60000); await feed.refresh('stablecoins');
    expect(model().boats).toHaveLength(1); expect(feed.payloads.stablecoins?.error).toBeNull(); feed.stop();
  });
  it("bounds pending and failure injection and honors cancellation", async () => {
    vi.useFakeTimers();
    const replay = createReplay(pending), abort = new AbortController();
    const request = replay.fetch('/api/stablecoins', { signal: abort.signal });
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' }); abort.abort(); await rejected;
    const failed = createReplay({ epoch: 1, responses: { '/api/chains': { failure: true } } });
    await expect(failed.fetch('/api/chains')).rejects.toThrow('Scenario transport failure');
    const delayed = replay.fetch('/api/stablecoins'); await vi.advanceTimersByTimeAsync(5000); expect((await delayed).status).toBe(200);
  });
});

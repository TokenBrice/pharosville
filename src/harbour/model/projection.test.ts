import { afterEach, describe, expect, it, vi } from "vitest";
import { PHAROSVILLE_ENDPOINT_REGISTRY_LIST } from "@shared/lib/pharosville-endpoint-registry";
import { endpointProjector } from "../../../functions/api/_project";
import { projectedFixtures, TRUTH_COIN_ID, TRUTH_NOW, upstreamFixtures, type UpstreamFixtures } from "../__fixtures__/projection";
import { defaultFetcher, HarbourFeed } from "../data/fetch";
import { deriveTargets } from "../readings/bind";
import { buildHarbourModel } from "./build";
import { detectEvents, eventSnapshot, type EventState } from "./events";
import type { EndpointKey } from "./types";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function observe(input = upstreamFixtures(), atMs = TRUTH_NOW, headers: Partial<Record<EndpointKey, HeadersInit>> = {}) {
  const projected = projectedFixtures(input);
  vi.spyOn(Date, "now").mockReturnValue(atMs);
  vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
    expect(init.cache).toBe("no-cache");
    const key = PHAROSVILLE_ENDPOINT_REGISTRY_LIST.find((e) => e.path === path)!.key;
    return Response.json(projected[key], { headers: headers[key] ?? {} });
  }));
  const feed = new HarbourFeed({ fetcher: defaultFetcher, now: () => atMs, setTimer: () => 0, clearTimer: () => {}, isOnline: () => true });
  await feed.start();
  feed.stop();
  const model = buildHarbourModel(feed.payloads, atMs, { dead: [] });
  const targets = deriveTargets({ model, stablecoinsAttempted: true, chainsChange7d: feed.payloads.chains?.data?.globalChange7dPct });
  return { model, targets, payloads: feed.payloads, snapshot: eventSnapshot(model, feed.payloads, atMs) };
}
const obj = (value: unknown) => value as Record<string, unknown>;
const row = (input: UpstreamFixtures, key: "pegSummary" | "safetyGrades" | "mintBurn") => obj((input[key][key === "safetyGrades" ? "grades" : "coins"] as unknown[])[0]);

describe("projector → standalone schema → fetcher/feed → model → targets/events", () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])("retains PSI qualification %s/%s and only the consumed booleans", async (dewsUnavailable, depegEventsUnavailable) => {
    const input = upstreamFixtures();
    obj(input.stability.current).inputDegradation = { dewsUnavailable, depegEventsUnavailable, failureDiagnostic: "private detail" };
    const { model, targets, payloads } = await observe(input);
    expect(payloads.stability?.data?.current?.inputDegradation).toEqual({ dewsUnavailable, depegEventsUnavailable });
    expect(model.readings.psi.qualified).toBe(dewsUnavailable || depegEventsUnavailable);
    expect(targets.psi).toMatchObject({ lit: true, qualified: dewsUnavailable || depegEventsUnavailable });
    expect(payloads.stability?.data?.current?.computedAt).toBe(TRUTH_NOW / 1000 - 60);
  });
  it("retains all three tide fractions; only the seven-day reading moves the gauge", async () => {
    const { model, targets } = await observe();
    expect(model.readings.tide).toMatchObject({ change24h: 0.001, change7d: 0.004, change30d: -0.01 });
    expect(targets.tide.pct).toBe(0.4);
  });
  it.each(["complete", "partial", undefined] as const)("requires explicit complete hourly valuation for events: %s", async (valuation) => {
    const initial = await observe();
    const state = detectEvents(null, initial.snapshot).state;
    const input = upstreamFixtures(TRUTH_NOW + 3600_000);
    const hours = input.mintBurn.hourly as Array<Record<string, unknown>>;
    Object.assign(hours[23], { mintVolumeUsd: 100e6, netFlowUsd: valuation === "partial" ? null : 99e6 });
    if (valuation === undefined) delete hours[23].valuation;
    else hours[23].valuation = valuation;
    const next = await observe(input, TRUTH_NOW + 3600_000);
    expect(next.snapshot.flowHour?.complete).toBe(valuation === "complete");
    expect(detectEvents(state, next.snapshot).events.some((e) => e.kind === "flow-hour")).toBe(valuation === "complete");
    expect(next.model.readings.flows.hourly[23].netUsd).toBe(valuation === "partial" ? null : 99e6);
  });
  it.each(["full", "partial-history", "lagging", "bootstrapping", "disabled", "unknown"])("carries flow coverage, window evidence and nullable nets unchanged: %s", async (status) => {
    const input = upstreamFixtures();
    const coin = row(input, "mintBurn");
    coin.coverage = { status, has24hWindow: false, isPartial: true, historyStartAt: null };
    coin.netFlow24hUsd = null;
    coin.netFlow7dUsd = null;
    coin.valuation = { window24h: { completeness: "partial", mintCompleteness: "complete", burnCompleteness: "partial" }, netFlow7d: "unknown" };
    const result = await observe(input);
    expect(result.model.readings.flows.coins?.[0]).toMatchObject({ netFlow24hUsd: null, netFlow7dUsd: null, coverage: coin.coverage, valuation: coin.valuation });
    expect((await observe()).model.readings.flows.coins?.[0].netFlow24hUsd).toBe(0);
  });
  it.each(["stability", "stress", "safetyGrades", "pegSummary"] as const)("rebaselines endpoint methodology changes silently: %s", async (key) => {
    let state: EventState | null = null;
    for (let poll = 0; poll < 3; poll++) {
      const atMs = TRUTH_NOW + poll * 300_000;
      const input = upstreamFixtures(atMs);
      if (poll) {
        if (key === "stability") { Object.assign(obj(input.stability.current), { methodologyVersion: "psi-2", band: "TREMOR", score: 60 }); }
        if (key === "stress") { input.stress.methodology = { version: "stress-2" }; obj(obj(input.stress.signals)[TRUTH_COIN_ID]).band = "DANGER"; }
        if (key === "safetyGrades") { input.safetyGrades.methodologyVersion = "grade-2"; row(input, key).grade = "F"; }
        if (key === "pegSummary") { input.pegSummary.methodology = { version: "peg-2" }; Object.assign(row(input, key), { activeDepeg: true, currentDeviationBps: -500 }); }
      }
      const result = detectEvents(state, (await observe(input, atMs)).snapshot);
      expect(result.events).toEqual([]);
      state = result.state;
    }
  });
  it.each([true, false])("peg row version changes rebaseline; same-method changes confirm (version changed=%s)", async (changedMethod) => {
    let state: EventState | null = null;
    let events: ReturnType<typeof detectEvents>["events"] = [];
    for (let poll = 0; poll < 3; poll++) {
      const atMs = TRUTH_NOW + poll * 300_000;
      const input = upstreamFixtures(atMs);
      if (poll) Object.assign(row(input, "pegSummary"), { activeDepeg: true, currentDeviationBps: -500, methodologyVersion: changedMethod ? "peg-row-2" : "peg-1" });
      const result = detectEvents(state, (await observe(input, atMs)).snapshot);
      state = result.state; events = result.events;
    }
    expect(events.some((e) => e.kind === "depeg")).toBe(!changedMethod);
  });
  it("unknown source evidence and young fallback never accept events or fog an undated fleet", async () => {
    const input = upstreamFixtures();
    for (const body of Object.values(input)) delete body._meta;
    const unknown = await observe(input);
    expect(Object.values(unknown.model.truth).every((t) => t.state === "unknown" && t.ageSec === null)).toBe(true);
    expect(Object.values(unknown.snapshot.endpoints).every((e) => !e.current)).toBe(true);
    expect(unknown.targets).toMatchObject({ fog: false, psi: { lit: false }, sea: null, weather: null, tide: { pct: null }, flows: { available: false } });
    const fallback = await observe(upstreamFixtures(), TRUTH_NOW, { stability: { Warning: '110 - "Response is stale"' } });
    expect(fallback.model.truth.stability).toMatchObject({ state: "stale", reason: "stale-fallback" });
    expect(fallback.targets.psi.lit).toBe(false);
    expect(fallback.snapshot.endpoints.stability.current).toBe(false);
    expect(fallback.targets.fog).toBe(false);
  });
  it("fresh fleet with independent stale side feeds keeps dated values and neutralizes analytical targets", async () => {
    const input = upstreamFixtures();
    for (const key of ["stability", "pegSummary", "stress", "safetyGrades", "mintBurn", "chains"] as const) obj(input[key]._meta).status = "stale";
    const { model, targets } = await observe(input);
    expect(model.boats[0].grade).toBe("A");
    expect(model.readings.psi.score).toBe(91);
    expect(targets).toMatchObject({ fog: false, psi: { lit: false }, sea: null, weather: null, cones: null, tide: { pct: null }, flows: { available: false } });
  });
  it.each(["stability", "stress", "pegSummary", "chains", "mintBurn", "safetyGrades"] as const)("unknown %s does not demote fresh fleet evidence or other sources", async (key) => {
    const input = upstreamFixtures(); delete input[key]._meta;
    const { model, targets, snapshot } = await observe(input);
    expect(model.truth[key].state).toBe("unknown");
    expect(model.truth.stablecoins.state).toBe("current");
    expect(snapshot.endpoints[key].current).toBe(false);
    expect(targets.fog).toBe(false);
    if (key === "stability") expect(targets.psi.lit).toBe(false);
    else expect(targets.psi.lit).toBe(true);
    if (key === "stress") expect(targets.weather).toBeNull();
    if (key === "pegSummary") expect(targets.sea).toBeNull();
    if (key === "chains") expect(targets.tide.pct).toBeNull();
    if (key === "mintBurn") expect(targets.flows.available).toBe(false);
  });
  it("uses root PSI methodology when the current row has no version", async () => {
    let state: EventState | null = null;
    for (let poll = 0; poll < 3; poll++) {
      const atMs = TRUTH_NOW + poll * 300_000;
      const input = upstreamFixtures(atMs);
      delete obj(input.stability.current).methodologyVersion;
      if (poll) { input.stability.methodology = { version: "psi-root-2" }; obj(input.stability.current).band = "TREMOR"; }
      const result = detectEvents(state, (await observe(input, atMs)).snapshot);
      expect(result.events).toEqual([]); state = result.state;
    }
  });
  it("keeps null stress rows as missing coverage and rejects malformed projected endpoints wholesale", async () => {
    const input = upstreamFixtures(); input.stress.signals = { [TRUTH_COIN_ID]: null };
    expect((await observe(input)).model.readings.weather.level).toBeNull();
    expect(endpointProjector("pegSummary")({ coins: [null] })).toEqual({ coins: [null] });
  });
});

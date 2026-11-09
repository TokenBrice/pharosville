import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { panelEndpointProjector } from "../../../functions/api/_project-panels";
import type { ProjectionJson } from "../../../functions/api/_project";
import { PHAROSVILLE_PANEL_ENDPOINT_KEYS, panelEndpointPath, PHAROSVILLE_PANEL_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-panel-endpoints";
import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import { WORLD_ENDPOINT_KEYS } from "@shared/lib/pharosville-endpoint-registry";
import { panelUpstreamFixtures, PANEL_NOW, PANEL_COIN_ID } from "../__fixtures__/panels";
import { PanelFetcher } from "./panel-fetch";
import { PanelLiquidityRowSchema } from "@shared/types/pharosville-panels";
import runtimeSlim from "@shared/data/stablecoins/runtime-slim.json";

const signal = () => new AbortController().signal;
function mockReading(key: typeof PHAROSVILLE_PANEL_ENDPOINT_KEYS[number], change: Record<string, ProjectionJson> = {}, headers: HeadersInit = {}) {
  const input = { ...panelUpstreamFixtures()[key], ...change };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(panelEndpointProjector(key)(input), { headers }));
}

describe("coin-panel fetch path", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(PANEL_NOW); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each(PHAROSVILLE_PANEL_ENDPOINT_KEYS)("validates upstream → projection → schema → %s state only on demand", async (key) => {
    const request = mockReading(key);
    const panels = new PanelFetcher();
    expect(request).not.toHaveBeenCalled();
    const result = await panels.fetch(key, PANEL_COIN_ID, signal());
    expect(result).toMatchObject({ state: "current", reason: null });
    expect(result.sourceUpdatedAtMs).toBeLessThanOrEqual(PANEL_NOW - 60_000);
    expect(request).toHaveBeenCalledWith(panelEndpointPath(key, PANEL_COIN_ID), expect.objectContaining({ cache: "no-cache", signal: expect.any(AbortSignal) }));
    expect((request.mock.calls[0][0] as string).startsWith("/api/")).toBe(true);
  });

  it("never requests a pre-launch, frozen, live-only or malformed subject", async () => {
    const request = mockReading("depegEvents");
    for (const key of PHAROSVILLE_PANEL_ENDPOINT_KEYS) for (const id of ["unknown", "USDC-CIRCLE", "usdc-circle/extra", ...runtimeSlim.map((coin) => coin.id)]) {
      expect(await new PanelFetcher().fetch(key, id, signal())).toMatchObject({ state: "unavailable", data: null });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it.each(PHAROSVILLE_PANEL_ENDPOINT_KEYS)("shares %s in-flight work and expires its visit cache on producer cadence", async (key) => {
    const request = mockReading(key);
    const panels = new PanelFetcher();
    await Promise.all([panels.fetch(key, PANEL_COIN_ID, signal()), panels.fetch(key, PANEL_COIN_ID, signal())]);
    expect(request).toHaveBeenCalledTimes(1);
    await panels.fetch(key, PANEL_COIN_ID, signal());
    expect(request).toHaveBeenCalledTimes(1);
    vi.setSystemTime(PANEL_NOW + PHAROSVILLE_PANEL_ENDPOINT_REGISTRY[key].cacheTtlSec * 1000);
    await panels.fetch(key, PANEL_COIN_ID, signal());
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("shares the liquidity map across selected coins, retaining evidence classes and null scores", async () => {
    const request = mockReading("dexLiquidity");
    const panels = new PanelFetcher();
    const first = await panels.fetch("dexLiquidity", PANEL_COIN_ID, signal());
    const second = await panels.fetch("dexLiquidity", "usdt-tether", signal());
    expect(request).toHaveBeenCalledTimes(1);
    expect(first.data).toBe(second.data);
    const rows = Object.values(first.data!).map((row) => PanelLiquidityRowSchema.parse(row));
    expect(rows.some((row) => row.liquidityScore === null)).toBe(true);
    expect(new Set(rows.map((row) => row.liquidityEvidenceClass))).toEqual(new Set(["unobserved", "measured", "partial_measured", "observed_unmeasured"]));
  });

  it("preserves empty events and their total without inventing a healthy history", async () => {
    mockReading("depegEvents", { events: [], total: 0 });
    expect(await new PanelFetcher().fetch("depegEvents", PANEL_COIN_ID, signal())).toMatchObject({ state: "current", data: { events: [], total: 0 } });
  });

  it("requires transport source evidence for liquidity too, while reserves use their own verified liveAt", async () => {
    const request = mockReading("dexLiquidity", { _meta: null });
    expect(await new PanelFetcher().fetch("dexLiquidity", PANEL_COIN_ID, signal())).toMatchObject({ state: "unavailable", reason: "unverified-source", sourceUpdatedAtMs: null });
    request.mockRestore();
    mockReading("stablecoinReserves", { _meta: null });
    expect(await new PanelFetcher().fetch("stablecoinReserves", PANEL_COIN_ID, signal())).toMatchObject({ state: "current" });
  });

  it("never publishes another subject's reserve composition", async () => {
    mockReading("stablecoinReserves", { stablecoinId: "usdt-tether" });
    expect(await new PanelFetcher().fetch("stablecoinReserves", PANEL_COIN_ID, signal())).toMatchObject({ state: "unavailable", reason: "invalid-payload", data: null });
  });

  it.each([
    { change: { _meta: null }, headers: { Age: "20" }, state: "unavailable", reason: "unverified-source" },
    { change: { _meta: null }, headers: { "X-Data-Age": "20", Age: "10" }, state: "current", reason: null },
    { change: { _meta: null }, headers: { "X-Data-Age": "-1" }, state: "unavailable", reason: "unverified-source" },
    { change: { _meta: null }, headers: { Warning: '110 - "Response is stale"' }, state: "stale", reason: "stale-fallback" },
    { change: {}, headers: { Warning: '110 - "Response is stale"' }, state: "stale", reason: "stale-fallback" },
    { change: { _meta: { updatedAt: PANEL_NOW / 1000 - 20_000, ageSeconds: 20_000, status: "fresh" } }, headers: {}, state: "stale", reason: "source-stale" },
  ] as const)("classifies source evidence $reason ($state)", async ({ change, headers, state, reason }) => {
    mockReading("depegEvents", change, headers);
    const result = await new PanelFetcher().fetch("depegEvents", PANEL_COIN_ID, signal());
    expect(result).toMatchObject({ state, reason });
    expect(result.data).not.toBeNull();
  });

  it.each([
    { mode: "curated-fallback", estimated: true, state: "unavailable", reason: "unverified-source" },
    { mode: "template-fallback", estimated: true, state: "unavailable", reason: "unverified-source" },
    { mode: "live-stale", estimated: false, state: "stale", reason: "source-stale" },
    { mode: "unavailable", estimated: false, state: "unavailable", reason: "no-observation" },
  ])("keeps $mode reserve provenance honest", async ({ mode, estimated, state, reason }) => {
    mockReading("stablecoinReserves", { mode, estimated });
    expect(await new PanelFetcher().fetch("stablecoinReserves", PANEL_COIN_ID, signal())).toMatchObject({ state, reason });
  });

  it.each([
    { change: { sync: { status: "ok", stale: true } }, state: "stale", reason: "source-stale" },
    { change: { liveAt: PANEL_NOW / 1000 - 8 * 3600 }, state: "current", reason: null },
    { change: { liveAt: PANEL_NOW / 1000 - 8 * 3600 - 1 }, state: "stale", reason: "source-stale" },
    { change: { liveAt: PANEL_NOW / 1000 + 60 }, state: "unavailable", reason: "unverified-source" },
    { change: { liveAt: null }, state: "unavailable", reason: "unverified-source" },
    { change: { provenance: { evidenceClass: "static-validated", sourceModel: "validated-static", freshnessMode: "unverified" } }, state: "unavailable", reason: "unverified-source" },
    { change: { reserves: [] }, state: "unavailable", reason: "no-observation" },
    { change: { reserves: null }, state: "unavailable", reason: "invalid-payload" },
  ])("uses reserve-specific liveAt/sync evidence ($reason)", async ({ change, state, reason }) => {
    mockReading("stablecoinReserves", change);
    expect(await new PanelFetcher().fetch("stablecoinReserves", PANEL_COIN_ID, signal())).toMatchObject({ state, reason });
  });

  it("does not retain Warning-110 fallbacks in the visit cache", async () => {
    const request = mockReading("depegEvents", {}, { Warning: '110 - "Response is stale"' });
    const panels = new PanelFetcher();
    await panels.fetch("depegEvents", PANEL_COIN_ID, signal());
    await panels.fetch("depegEvents", PANEL_COIN_ID, signal());
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([400, 404, 429, 500, 503])("reports HTTP %s as unavailable", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
    expect(await new PanelFetcher().fetch("depegEvents", PANEL_COIN_ID, signal())).toMatchObject({ state: "unavailable", reason: "http", data: null });
  });

  it("rejects missing/malformed slices and a missing liquidity row", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({}));
    expect(await new PanelFetcher().fetch("stablecoinReserves", PANEL_COIN_ID, signal())).toMatchObject({ reason: "invalid-payload" });
    expect(await new PanelFetcher().fetch("dexLiquidity", PANEL_COIN_ID, signal())).toMatchObject({ state: "unavailable", reason: "no-observation" });
    request.mockImplementation(async () => Response.json({ [PANEL_COIN_ID]: null }));
    expect(await new PanelFetcher().fetch("dexLiquidity", PANEL_COIN_ID, signal())).toMatchObject({ reason: "invalid-payload" });
  });

  it("cancels each caller independently and aborts abandoned requests", async () => {
    let complete: (response: Response) => void = () => {};
    const request = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const panels = new PanelFetcher();
    const first = new AbortController(), second = new AbortController();
    const a = panels.fetch("depegEvents", PANEL_COIN_ID, first.signal);
    const b = panels.fetch("depegEvents", PANEL_COIN_ID, second.signal);
    const cancelled = expect(a).rejects.toMatchObject({ name: "AbortError" });
    first.abort();
    await cancelled;
    const underlying = request.mock.calls[0][1]!.signal!;
    expect(underlying.aborted).toBe(false);
    complete(Response.json(panelEndpointProjector("depegEvents")(panelUpstreamFixtures().depegEvents)));
    expect(await b).toMatchObject({ state: "current" });
    const last = new AbortController();
    const c = new PanelFetcher().fetch("depegEvents", PANEL_COIN_ID, last.signal);
    const closed = expect(c).rejects.toMatchObject({ name: "AbortError" });
    last.abort();
    await closed;
    expect(request.mock.calls[1][1]!.signal!.aborted).toBe(true);
  });

  it("keeps the seven world endpoints and the panel import boundary unchanged", () => {
    expect(WORLD_ENDPOINT_KEYS).toEqual(PHAROSVILLE_API_ENDPOINT_KEYS);
    expect(WORLD_ENDPOINT_KEYS).toHaveLength(7);
    const root = resolve(__dirname, "../..");
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => /\.[cm]?[jt]sx?$/.test(file) && !file.includes(".test."));
    const callers = files.filter((file) => /(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*panel-fetch["']/.test(readFileSync(resolve(root, file), "utf8")));
    expect(callers.filter((file) => !file.startsWith("harbour/ui/coin-readings/"))).toEqual([]);
  });
});

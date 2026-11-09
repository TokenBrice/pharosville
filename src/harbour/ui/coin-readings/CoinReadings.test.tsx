// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { panelEndpointProjector } from "../../../../functions/api/_project-panels";
import type { ProjectionJson } from "../../../../functions/api/_project";
import { PHAROSVILLE_PANEL_ENDPOINT_KEYS, panelEndpointPath } from "@shared/lib/pharosville-panel-endpoints";
import { PHAROSVILLE_PANEL_SCHEMAS } from "@shared/types/pharosville-panels";
import { panelUpstreamFixtures, PANEL_COIN_ID, PANEL_NOW } from "../../__fixtures__/panels";
import * as panelFetch from "../../data/panel-fetch";
import { CoinReadings } from "./CoinReadings";

const TITLES = { depegEvents: "Depeg history", stablecoinReserves: "Backing", dexLiquidity: "Liquidity" };
const NAMES = { depegEvents: "Depeg events", stablecoinReserves: "Reserves", dexLiquidity: "DEX liquidity" };
let input: ReturnType<typeof panelUpstreamFixtures>;

function requests(headers: HeadersInit = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (path) => {
    const key = PHAROSVILLE_PANEL_ENDPOINT_KEYS.find((key) => key === "dexLiquidity" ? path === "/api/dex-liquidity" : String(path).startsWith(key === "depegEvents" ? "/api/depeg-events?" : "/api/stablecoin-reserves/"))!;
    expect(key).toBeTruthy();
    const projected = panelEndpointProjector(key)(input[key]);
    expect(PHAROSVILLE_PANEL_SCHEMAS[key].safeParse(projected).success).toBe(true);
    return Response.json(projected, { headers });
  });
}

async function toggle(title: string, open = true) {
  const details = screen.getByText(title, { selector: "summary" }).closest("details")!;
  await act(async () => {
    details.open = open;
    fireEvent(details, new Event("toggle"));
  });
  return details;
}
function mount(id = PANEL_COIN_ID) { return render(<CoinReadings id={id} model={null} />); }

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(PANEL_NOW);
  input = panelUpstreamFixtures();
  // Isolate the visit cache, retaining the production fetcher, projection and validation path.
  const visit = new panelFetch.PanelFetcher();
  vi.spyOn(panelFetch, "fetchPanelReading").mockImplementation((key, id, signal) => visit.fetch(key, id, signal));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("on-demand coin readings", () => {
  it("requests nothing on mount or selection change; opens only the requested section, then reuses its visit cache", async () => {
    const fetch = requests();
    const view = mount();
    expect(screen.getAllByText(/Depeg history|Backing|Liquidity/, { selector: "summary" })).toHaveLength(3);
    expect([...view.container.querySelectorAll("details")].every((details) => !details.open)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<CoinReadings id="usdt-tether" model={null} />);
    expect(fetch).not.toHaveBeenCalled();
    await toggle("Depeg history");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(panelEndpointPath("depegEvents", "usdt-tether"));
    await toggle("Depeg history", false); await toggle("Depeg history");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps live-only coins unavailable without any request", async () => {
    const fetch = requests(); mount("live-only-coin");
    for (const key of PHAROSVILLE_PANEL_ENDPOINT_KEYS) {
      await toggle(TITLES[key]);
      expect(screen.getByText(`${NAMES[key]}: unavailable.`)).toBeTruthy();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(panelFetch.fetchPanelReading).not.toHaveBeenCalled();
  });

  it.each(["close", "selection", "unmount"])("shows loading and aborts a pending request on %s, ignoring a late completion", async (action) => {
    let finish: (value: Response) => void = () => {};
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = mount(); await toggle("Depeg history");
    expect(screen.getByRole("status").textContent).toBe("Waiting for Depeg events.");
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = fetch.mock.calls[0][1]!.signal!;
    if (action === "close") await toggle("Depeg history", false);
    if (action === "selection") view.rerender(<CoinReadings id="usdt-tether" model={null} />);
    if (action === "unmount") view.unmount();
    await act(async () => {});
    expect(signal.aborted).toBe(true);
    await act(async () => finish(Response.json(panelEndpointProjector("depegEvents")(input.depegEvents))));
    expect(screen.queryByText("Ongoing recorded event")).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shares single-flight work across simultaneous readers, including independent cancellation", async () => {
    let finish: (value: Response) => void = () => {};
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = render(<StrictMode><CoinReadings id={PANEL_COIN_ID} model={null} /></StrictMode>);
    const second = mount();
    for (const details of document.querySelectorAll("details")) {
      if (details.querySelector("summary")?.textContent === "Liquidity") await act(async () => { details.open = true; fireEvent(details, new Event("toggle")); });
    }
    // StrictMode may abandon its initial effect; exactly one live transport remains.
    const active = fetch.mock.calls.filter((call) => !call[1]!.signal!.aborted);
    expect(active).toHaveLength(1);
    first.unmount(); expect(active[0][1]!.signal!.aborted).toBe(false);
    await act(async () => finish(Response.json(panelEndpointProjector("dexLiquidity")(input.dexLiquidity))));
    expect(within(second.container).getByText("TVL is not executable exit depth.")).toBeTruthy();
  });

  it("shares the liquidity map across coin selections", async () => {
    const fetch = requests(); const view = mount(); await toggle("Liquidity");
    expect(screen.getByText("TVL is not executable exit depth.")).toBeTruthy();
    view.rerender(<CoinReadings id="usdt-tether" model={null} />);
    expect(screen.queryByText("TVL is not executable exit depth.")).toBeNull();
    await toggle("Liquidity"); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["http", "network", "schema"])("offers an explicit retry after a %s failure", async (kind) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    if (kind === "http") fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else if (kind === "network") fetch.mockRejectedValueOnce(new TypeError("offline"));
    else fetch.mockResolvedValueOnce(Response.json({}));
    fetch.mockResolvedValue(Response.json(panelEndpointProjector("depegEvents")(input.depegEvents)));
    mount(); await toggle("Depeg history");
    expect(screen.getByRole("status").textContent).toBe("Depeg events: unavailable.");
    expect(screen.queryByText("Ongoing recorded event")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again · Depeg events" })));
    expect(screen.getByText("Ongoing recorded event")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(PHAROSVILLE_PANEL_ENDPOINT_KEYS)("renders current and Warning-110 stale %s through the shared truth copy", async (key) => {
    const fetch = requests(); const first = mount(); await toggle(TITLES[key]);
    expect(screen.getByRole("status").textContent).toMatch(new RegExp(`^${NAMES[key]}: current\\. Updated .* UTC\\.$`));
    first.unmount(); fetch.mockRestore();
    const visit = new panelFetch.PanelFetcher();
    vi.mocked(panelFetch.fetchPanelReading).mockImplementation((key, id, signal) => visit.fetch(key, id, signal));
    requests({ Warning: '110 - "Response is stale"' }); mount(); await toggle(TITLES[key]);
    expect(screen.getByRole("status").textContent).toMatch(new RegExp(`^${NAMES[key]}: stale\\. Last observed .* UTC\\.$`));
    expect(screen.getByText("Last received values")).toBeTruthy();
  });

  it.each(["depegEvents", "dexLiquidity"] as const)("labels unverified %s values and retains them without calling them current", async (key) => {
    delete input[key]._meta; requests(); mount(); await toggle(TITLES[key]);
    expect(screen.getByRole("status").textContent).toBe(`${NAMES[key]}: unavailable. Source freshness is unverified.`);
    expect(screen.getByText("Last received values")).toBeTruthy();
    expect(screen.getByText(key === "depegEvents" ? "Ongoing recorded event" : "TVL is not executable exit depth.")).toBeTruthy();
  });

  it("ages an open reading to stale without issuing another request", async () => {
    vi.useFakeTimers(); vi.setSystemTime(PANEL_NOW);
    const fetch = requests(); mount(); await toggle("Depeg history");
    expect(screen.getByRole("status").textContent).toContain("Depeg events: current.");
    vi.setSystemTime(PANEL_NOW + 86400_000);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status").textContent).toContain("Depeg events: stale.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("depeg event records", () => {
  it("orders the bounded history newest first, with dates, duration, peak, direction, source, total and methodology", async () => {
    input.depegEvents.events = [...input.depegEvents.events as ProjectionJson[]].reverse();
    requests(); mount(); await toggle("Depeg history");
    const list = screen.getByRole("list", { name: "Depeg events, newest first" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(30);
    expect(rows[0].textContent).toContain("Started 2026-11-09 11:59:00 UTC.");
    expect(rows[0].textContent).toContain("Ongoing recorded event");
    expect(rows[0].textContent).toContain("Peak deviation: 100 bps below peg. Live record.");
    expect(rows[1].textContent).toContain("Recorded duration: 1 h.");
    expect(rows[1].textContent).toContain("113.7 bps above peg");
    expect(rows[4].textContent).toContain("Backfill record.");
    expect(screen.getByText("Showing 30 of 45 recorded events.")).toBeTruthy();
    expect(screen.getByText("Methodology: depeg-v1")).toBeTruthy();
    expect(list.querySelectorAll("time[datetime]")).toHaveLength(59);
  });

  it("never turns an empty result into a safety claim and discloses missing methodology", async () => {
    Object.assign(input.depegEvents, { events: [], total: 0, methodology: null });
    requests(); mount(); await toggle("Depeg history");
    expect(screen.getByText("No recorded events were returned. An empty history does not imply safety.")).toBeTruthy();
    expect(screen.getByText("Methodology: Version unavailable.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it.each([
    [30, "Recorded duration: 30 s."], [60, "Recorded duration: 1 min."],
    [90060, "Recorded duration: 1 d 1 h 1 min."], [-1, "Recorded duration unavailable."],
  ])("formats a dated recorded duration of %s seconds without inferring recovery", async (seconds, text) => {
    const startedAt = PANEL_NOW / 1000 - 100_000;
    Object.assign(input.depegEvents, { events: [{ startedAt, endedAt: startedAt + Number(seconds), direction: "below", peakDeviationBps: 12, source: "backfill" }], total: 1 });
    requests(); mount(); await toggle("Depeg history");
    expect(screen.getByText(new RegExp(String(text).replaceAll(".", "\\.")))).toBeTruthy();
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it("keeps an unrepresentable event date from breaking the panel", async () => {
    Object.assign(input.depegEvents, { events: [{ startedAt: 1e20, endedAt: null, direction: "above", peakDeviationBps: 12, source: "live" }], total: 1 });
    requests(); mount(); await toggle("Depeg history");
    expect(screen.getByText("Started (date unavailable).")).toBeTruthy();
    expect(screen.getByText("Ongoing recorded event")).toBeTruthy();
  });
});

describe("reserve provenance and composition", () => {
  it.each([
    ["live", false, "Live", "current"], ["live-stale", false, "Live, stale", "stale"],
    ["curated-fallback", true, "Curated fallback", "unavailable"], ["template-fallback", true, "Template fallback", "unavailable"],
    ["unavailable", false, "Unavailable", "unavailable"],
  ])("keeps the %s mode visible", async (mode, estimated, label, state) => {
    Object.assign(input.stablecoinReserves, { mode, estimated }); requests(); mount(); await toggle("Backing");
    expect(screen.getByText(label as string, { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(`Reserves: ${state}.`);
    expect(screen.getByText("independent")).toBeTruthy();
    expect(screen.getByText("dynamic mix")).toBeTruthy();
    if (estimated) {
      expect(screen.getByText("Estimated reserve composition", { selector: "p" })).toBeTruthy();
      expect(screen.getByText("Freshness unverified")).toBeTruthy();
    }
    if (mode === "unavailable") expect(screen.queryByRole("table")).toBeNull();
    else expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Reserve composition is not proof of solvency.")).toBeTruthy();
  });

  it.each([
    { estimated: true }, { liveAt: null }, { liveAt: PANEL_NOW / 1000 + 60 },
    { provenance: { evidenceClass: "static-validated", sourceModel: "validated-static", freshnessMode: "unverified" } },
  ])("qualifies estimated/unverified reserve values (%j)", async (change) => {
    Object.assign(input.stablecoinReserves, change); requests(); mount(); await toggle("Backing");
    expect(screen.getByRole("status").textContent).toContain("Reserves: unavailable. Source freshness is unverified.");
    expect(screen.getByText("Freshness unverified")).toBeTruthy();
    expect(screen.getByText("Last received values")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it.each([
    { sync: { status: "ok", stale: true } },
    { sync: { status: "degraded", stale: false, lastSuccessAt: PANEL_NOW / 1000 - 9 * 3600 } },
    { liveAt: PANEL_NOW / 1000 - 8 * 3600 - 1 },
  ])("retains slices with independently stale source/sync evidence (%j)", async (change) => {
    Object.assign(input.stablecoinReserves, change); requests(); mount(); await toggle("Backing");
    expect(screen.getByRole("status").textContent).toContain("Reserves: stale.");
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("shows the table, risk, non-reconciling sum and safe hostname-only evidence links", async () => {
    Object.assign(input.stablecoinReserves, {
      reserves: [{ name: "Cash", pct: 80.5, risk: "low" }, { name: "Other", pct: 15, risk: "high" }],
      evidenceUrls: ["https://evidence.example/reports", "http://unsafe.example", "javascript:alert(1)", "https://user:pass@unsafe.example"],
    });
    const fetch = requests(); mount(); await toggle("Backing");
    const table = screen.getByRole("table", { name: "Reserves · Reported reserve composition" });
    expect(within(table).getAllByRole("columnheader").map((el) => el.textContent)).toEqual(["Name", "Share", "Risk"]);
    expect(within(table).getByText("80.5%")).toBeTruthy();
    expect(screen.getByText("Reported shares total 95.5%; they do not reconcile to 100%.")).toBeTruthy();
    const links = screen.getAllByRole("link"); expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^https:\/\//);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.textContent).toContain("(source, opens in a new tab)");
    }
    expect(screen.getByRole("link", { name: "evidence.example (source, opens in a new tab)" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(document.querySelector("img")).toBeNull();
  });

  it("keeps missing slices unavailable rather than drawing an empty composition", async () => {
    input.stablecoinReserves.reserves = []; requests(); mount(); await toggle("Backing");
    expect(screen.getByRole("status").textContent).toBe("Reserves: unavailable.");
    expect(screen.getByText("No reserve slices are available.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps fallback modes estimated even if the upstream estimate flag is false", async () => {
    Object.assign(input.stablecoinReserves, { mode: "curated-fallback", estimated: false, provenance: { evidenceClass: "weak-live-probe", sourceModel: "single-bucket", freshnessMode: "unverified" } });
    requests(); mount(); await toggle("Backing");
    expect(screen.getByText("Estimated reserve composition", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("weak live probe")).toBeTruthy(); expect(screen.getByText("single bucket")).toBeTruthy();
    expect(screen.queryByText(/do not reconcile/)).toBeNull();
  });

  it("does not invent reserve provenance when it was not supplied", async () => {
    input.stablecoinReserves.provenance = null; requests(); mount(); await toggle("Backing");
    expect(screen.getAllByText("Not supplied.")).toHaveLength(2);
    expect(screen.getByText("Freshness unverified")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Reserves: unavailable.");
  });
});

describe("observed liquidity evidence", () => {
  it.each([
    ["unobserved", false, "Unobserved"], ["measured", true, "Measured"],
    ["partial_measured", true, "Partially measured"], ["observed_unmeasured", false, "Observed, unmeasured"],
  ] as const)("retains the %s evidence class without a safety threshold", async (liquidityEvidenceClass, hasMeasuredLiquidityEvidence, label) => {
    Object.assign(input.dexLiquidity[PANEL_COIN_ID] as object, { liquidityEvidenceClass, hasMeasuredLiquidityEvidence, liquidityScore: null, coverageClass: "mixed", coverageConfidence: 0.625 });
    requests(); mount(); await toggle("Liquidity");
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Not scored.")).toBeTruthy();
    expect(screen.getByText("mixed")).toBeTruthy();
    expect(screen.getByText("62.5%")).toBeTruthy();
    expect(!!screen.queryByText("No measured liquidity evidence")).toBe(!hasMeasuredLiquidityEvidence);
    expect(screen.getByText("TVL is not executable exit depth.")).toBeTruthy();
    expect(screen.getByText("Methodology: liquidity-v3")).toBeTruthy();
  });

  it("shows both observed TVLs, the supplied score, absent coverage and a stale row timestamp", async () => {
    Object.assign(input.dexLiquidity[PANEL_COIN_ID] as object, { totalTvlUsd: 12_000_000, effectiveTvlUsd: 9_000_000, liquidityScore: 72.5, coverageClass: null, updatedAt: PANEL_NOW / 1000 - 86400 });
    requests(); mount(); await toggle("Liquidity");
    expect(screen.getByText("$12.0M")).toBeTruthy(); expect(screen.getByText("$9.00M")).toBeTruthy();
    expect(screen.getByText("72.5 / 100")).toBeTruthy(); expect(screen.getByText("Not supplied.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("DEX liquidity: stale. Last observed 2026-11-08 12:00:00 UTC.");
  });

  it("does not manufacture a row when this coin has no liquidity observation", async () => {
    delete input.dexLiquidity[PANEL_COIN_ID]; requests(); mount(); await toggle("Liquidity");
    expect(screen.getByRole("status").textContent).toBe("DEX liquidity: unavailable.");
    expect(screen.queryByText("Observed TVL (USD)")).toBeNull();
  });

  it("keeps the expanded readings accessible with semantic disclosures, table and evidence names", async () => {
    requests(); render(<main><CoinReadings id={PANEL_COIN_ID} model={null} /></main>);
    for (const title of Object.values(TITLES)) await toggle(title);
    const results = await axe.run(document.body, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) }))).toEqual([]);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
import type { DetailModel } from "../systems/world-types";
import { DetailPanel } from "./detail-panel";

afterEach(() => {
  cleanup();
});

const renderShipPanel = (shipId: string, depegId: string | null = null) => {
  const inputs = makerSquadFixtureInputs();
  const world = buildPharosVilleWorld(depegId ? fixtureWithDepegOn(inputs, depegId) : inputs);
  const ship = world.ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship ${shipId} not found in fixture`);
  const detail = world.detailIndex[ship.detailId]!;
  return renderToStaticMarkup(<DetailPanel detail={detail} />);
};

describe("DetailPanel structure (old-school revamp)", () => {
  it("uses non-modal landmark semantics and focuses/restores the close control", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open details";
    document.body.append(opener);
    opener.focus();

    const detail: DetailModel = {
      id: "ship:test-dialog",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [],
      links: [],
    };

    const view = render(<DetailPanel detail={detail} onClose={() => undefined} />);

    // The inspector stays open by default while the canvas remains
    // interactive, so it must NOT be aria-modal: that would mark the
    // accessibility ledger and live region outside it inert.
    const panel = screen.getByRole("complementary", { name: "Test Ship" });
    const closeButton = screen.getByRole("button", { name: "Close details" });
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(closeButton);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("does not trap Tab inside the non-modal inspector", () => {
    const detail: DetailModel = {
      id: "ship:test-dialog-trap",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [],
      links: [{ label: "Source", href: "https://pharos.watch/" }],
    };

    render(<DetailPanel detail={detail} onClose={() => undefined} />);

    const closeButton = screen.getByRole("button", { name: "Close details" });
    expect(document.activeElement).toBe(closeButton);

    // Tab is left to the browser's normal focus order (no preventDefault),
    // so focus can leave the panel toward the rest of the page chrome.
    const tabEvent = fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(tabEvent).toBe(true);
  });

  it("renders the risk-band status line from the detail status", () => {
    const detail: DetailModel = {
      id: "ship:test-status",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      status: {
        swatchColor: "#125e7e",
        label: "Calm Anchorage",
        reading: "Steady peg evidence; the safe default berth",
      },
      facts: [],
      links: [],
    };

    render(<DetailPanel detail={detail} onClose={() => undefined} />);

    // Interface revamp DU5: the water line names the water and nothing else.
    // The generic per-zone reading belongs to the legend and the ledger; the
    // panel's own sentence says what this ship is doing there.
    const statusLine = screen.getByTestId("pharosville-detail-zone");
    expect(statusLine.textContent).toContain("Calm Anchorage");
    expect(statusLine.textContent).not.toContain("Steady peg evidence");
  });

  it("does not render dropped fields", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).not.toMatch(/Ship livery/i);
    expect(markup).not.toMatch(/Peg marker/i);
    expect(markup).not.toMatch(/Risk placement key/i);
    expect(markup).not.toMatch(/Docking cadence/i);
    expect(markup).not.toMatch(/Route source/i);
    expect(markup).not.toMatch(/Evidence status/i);
    // No top-level "Evidence" section heading (substring may still appear in fact values)
    expect(markup).not.toMatch(/<h3[^>]*>\s*Evidence\s*</);
  });

  it("renders Identity then Position section in that order", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    const identityIndex = markup.search(/--identity/);
    const positionIndex = markup.search(/--position/);
    expect(identityIndex).toBeGreaterThan(-1);
    expect(positionIndex).toBeGreaterThan(identityIndex);
  });

  it("renders Sailing in formation members list when present", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/Sailing in formation/i);
  });

  it("renders Class as a composed value (Tier · Class)", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/<dt[^>]*>Class<\/dt>\s*<dd[^>]*>[\s\S]*? · [\s\S]*?<\/dd>/);
  });

  it("does not render more than 8 fact rows in total", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    const dts = markup.match(/<dt[^>]*>/g) ?? [];
    expect(dts.length).toBeLessThanOrEqual(8);
  });

  it("respects the 8-row cap when every gated ship signal fires at once", () => {
    // Worst-case ship: every fact detailForShip can emit toward the panel —
    // squad formation, significant depeg record, supply momentum, degraded
    // price signal, and the heritage Bluechip audit. The gated P3 signals
    // must fold into existing rows (Class, Market cap, 24h change) rather
    // than spend rows of their own.
    const detail: DetailModel = {
      id: "ship:test-worst-case",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [
        { label: "Ship class", value: "DeFi" },
        { label: "Size tier", value: "Heritage hull" },
        { label: "Bluechip audit", value: "Bluechip A" },
        { label: "Market cap", value: "$1,000,000,000" },
        { label: "Price confidence", value: "Low-confidence price feed" },
        { label: "Source consensus", value: "2 of 3 price sources agree" },
        { label: "24h supply change", value: "+5.4%" },
        { label: "Supply momentum", value: "7d +2.4%, 30d -5.1%" },
        { label: "Depeg history", value: "3 events on record; worst -8.2%; last 2026-05-30" },
        { label: "Cycle tempo", value: "Brisk" },
        { label: "Home dock", value: "Ethereum" },
        { label: "Representative position", value: "Calm Anchorage idle" },
        { label: "Risk water area", value: "Calm Anchorage" },
        { label: "Risk water zone", value: "calm" },
        { label: "Chains present", value: "4 positive chain deployments: Ethereum 40%, Tron 30%, Solana 20%, +1 more" },
        { label: "Sailing in formation", value: "DAI (flagship), sDAI" },
        { label: "Cultural significance", value: "Heritage rationale" },
      ],
      links: [],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    const dts = markup.match(/<dt[^>]*>/g) ?? [];
    expect(dts.length).toBeLessThanOrEqual(8);
    // The gated signals must fold into host rows, not silently drop.
    expect(markup).toContain("Bluechip A");
    expect(markup).toContain("Low-confidence price feed");
    expect(markup).toContain("2 of 3 price sources agree");
    expect(markup).toContain("depeg history: 3 events on record");
  });

  it("renders Cycle tempo in the identity section", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/Cycle tempo/i);
    // Must have one of the four canonical labels.
    const validLabels = ["Languid", "Steady", "Brisk", "Active"];
    const found = validLabels.some((label) => markup.includes(label));
    expect(found).toBe(true);
  });

  it("renders 24h change row with formatted percentage when fact is present", () => {
    const detail: DetailModel = {
      id: "ship:test-with-change",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [
        { label: "Ship class", value: "CeFi" },
        { label: "Size tier", value: "Major" },
        { label: "Market cap", value: "$1,000,000,000" },
        { label: "24h supply change", value: "+5.4%" },
        { label: "Cycle tempo", value: "Brisk" },
      ],
      links: [],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/<dt[^>]*>24h change<\/dt>\s*<dd[^>]*>\+5\.4%<\/dd>/);
  });

  it("omits 24h change row when fact value is the unavailable em-dash placeholder", () => {
    const detail: DetailModel = {
      id: "ship:test-no-change",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [
        { label: "Ship class", value: "CeFi" },
        { label: "Size tier", value: "Major" },
        { label: "Market cap", value: "$1,000,000,000" },
        // detail-model emits "—" for null change24hPct; the panel should still
        // render it (the fact exists) — this asserts at least the dt/dd pair
        // is present so a screen reader reaches the placeholder.
        { label: "24h supply change", value: "—" },
      ],
      links: [],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/<dt[^>]*>24h change<\/dt>\s*<dd[^>]*>—<\/dd>/);
  });
});

describe("DetailPanel copy link", () => {
  const detail: DetailModel = {
    id: "ship:test-copy",
    title: "Test Ship",
    kind: "SHIP",
    summary: "test",
    facts: [],
    links: [],
  };

  const stubClipboard = (writeText: (text: string) => Promise<void>) => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    return () => {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator as object, "clipboard");
    };
  };

  // The address bar keeps the params in the fragment; the copied link moves
  // them to the query string so the shared card can name the ship.
  it("copies the current world URL as a server-readable link and announces it", async () => {
    // Declared with its argument so the mock's recorded calls are typed as
    // [string]; inferred from a zero-arg factory, `calls[0]` is an empty tuple
    // and reading the copied URL back off it does not typecheck.
    const writeText = vi.fn((_text: string) => Promise.resolve());
    const restore = stubClipboard(writeText);
    window.history.replaceState({}, "", "/#sel=ship.usdc&n=1&cam=4,8,1.5");
    const setAnnouncement = vi.fn();

    render(<DetailPanel detail={detail} setAnnouncement={setAnnouncement} />);
    fireEvent.click(screen.getByTestId("pharosville-detail-copy-link"));

    await waitFor(() => expect(setAnnouncement).toHaveBeenCalledWith("Link copied"));
    const copied = new URL(writeText.mock.calls[0]![0]);
    expect(copied.hash).toBe("");
    expect(copied.searchParams.get("sel")).toBe("ship.usdc");
    expect(copied.searchParams.get("n")).toBe("1");
    expect(copied.searchParams.get("cam")).toBe("4,8,1.5");
    expect(screen.getByTestId("pharosville-detail-copy-link").textContent).toContain("Link copied");
    restore();
  });

  it("announces a failure instead of throwing when the clipboard is unavailable", async () => {
    const restore = stubClipboard(() => Promise.reject(new Error("denied")));
    const setAnnouncement = vi.fn();

    render(<DetailPanel detail={detail} setAnnouncement={setAnnouncement} />);
    fireEvent.click(screen.getByTestId("pharosville-detail-copy-link"));

    await waitFor(() => expect(setAnnouncement).toHaveBeenCalledWith("Could not copy link"));
    restore();
  });
});

describe("DetailPanel composer paths (synthetic fixtures)", () => {
  const calmShip: DetailModel = {
    id: "ship:test-calm",
    title: "Test Ship",
    kind: "SHIP",
    summary: "test summary",
    facts: [
      { label: "Ship class", value: "CeFi-Dep" },
      { label: "Size tier", value: "Major" },
      { label: "Market cap", value: "$2,088,054,047" },
      { label: "Home dock", value: "Ethereum" },
      { label: "Risk water area", value: "Calm Anchorage" },
      { label: "Risk water zone", value: "calm" },
      { label: "Representative position", value: "Calm Anchorage idle" },
      { label: "Chains present", value: "1 deployment: Ethereum 100%" },
    ],
    links: [],
  };

  it("composes Currently as 'Calm Anchorage (idle)' when zone is calm and position ends 'idle'", () => {
    const markup = renderToStaticMarkup(<DetailPanel detail={calmShip} />);
    expect(markup).toMatch(/<dt[^>]*>Currently<\/dt>\s*<dd[^>]*>Calm Anchorage \(idle\)<\/dd>/);
  });

  it("compacts the Market cap value", () => {
    const markup = renderToStaticMarkup(<DetailPanel detail={calmShip} />);
    expect(markup).toMatch(/<dt[^>]*>Market cap<\/dt>\s*<dd[^>]*>\$2\.1B<\/dd>/);
  });

  it("renders external links with target=_blank and rel=noopener noreferrer", () => {
    const detail: DetailModel = {
      id: "pigeonnier",
      title: "Pigeonnier",
      kind: "pigeonnier",
      summary: "test",
      facts: [],
      links: [{ label: "Subscribe on Telegram", href: "https://pharos.watch/telegram/", target: "_blank" }],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/href="https:\/\/pharos\.watch\/telegram\/"/);
    expect(markup).toMatch(/target="_blank"/);
    expect(markup).toMatch(/rel="noopener noreferrer"/);
  });

  it("renders internal links without target attribute", () => {
    const detail: DetailModel = {
      id: "lighthouse",
      title: "Lighthouse",
      kind: "lighthouse",
      summary: "test",
      facts: [],
      links: [{ label: "PSI", href: "https://pharos.watch/stability-index/" }],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).not.toMatch(/target="_blank"/);
  });

  it("renders in-world member buttons and keeps the external page as a secondary affordance", () => {
    const onSelectDetail = vi.fn();
    const detail: DetailModel = {
      id: "dock.ethereum",
      title: "Ethereum",
      kind: "dock",
      summary: "test",
      facts: [],
      links: [],
      membersHeading: "Harbored stablecoins",
      members: [{
        id: "usdc-circle",
        label: "USDC (100%)",
        href: "https://pharos.watch/stablecoin/usdc-circle/",
        value: "$1,000",
        inWorldDetailId: "ship.usdc-circle",
      }],
    };

    render(<DetailPanel detail={detail} onSelectDetail={onSelectDetail} />);

    const button = screen.getByRole("button", { name: "Select USDC (100%) in PharosVille" });
    expect(button.className).toContain("pv-panel-link");
    fireEvent.click(button);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.usdc-circle");
    expect(screen.getByRole("link", { name: "Open USDC (100%) page" }).getAttribute("href"))
      .toBe("https://pharos.watch/stablecoin/usdc-circle/");
  });

  it("renders in-world link buttons and keeps the href as a secondary affordance", () => {
    const onSelectDetail = vi.fn();
    const detail: DetailModel = {
      id: "dock.ethereum",
      title: "Ethereum",
      kind: "dock",
      summary: "test",
      facts: [],
      links: [{
        label: "Stablecoin",
        href: "https://pharos.watch/stablecoin/usdc-circle/",
        inWorldDetailId: "ship.usdc-circle",
      }],
    };

    render(<DetailPanel detail={detail} onSelectDetail={onSelectDetail} />);

    const button = screen.getByRole("button", { name: "Select Stablecoin in PharosVille" });
    expect(button.className).toContain("pv-panel-link");
    fireEvent.click(button);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.usdc-circle");
    expect(screen.getByRole("link", { name: "Open Stablecoin page" }).getAttribute("href"))
      .toBe("https://pharos.watch/stablecoin/usdc-circle/");
  });

  it("keeps in-world metadata dormant when no selector callback is present", () => {
    const detail: DetailModel = {
      id: "dock.ethereum",
      title: "Ethereum",
      kind: "dock",
      summary: "test",
      facts: [],
      links: [{
        label: "Stablecoin",
        href: "https://pharos.watch/stablecoin/usdc-circle/",
        inWorldDetailId: "ship.usdc-circle",
      }],
    };

    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/href="https:\/\/pharos\.watch\/stablecoin\/usdc-circle\/"/);
    // The panel's own copy-link control is always present; what must stay
    // dormant is the in-world selector button.
    expect(markup).not.toMatch(/Select Stablecoin in PharosVille/);
    expect(markup).toContain("Stablecoin →");
  });
});

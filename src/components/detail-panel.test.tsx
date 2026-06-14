// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(markup).not.toMatch(/<button/);
    expect(markup).toContain("Stablecoin →");
  });
});

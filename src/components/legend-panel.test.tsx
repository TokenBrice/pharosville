// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { LEGEND_MARK_ROWS } from "../systems/visual-cue-registry";
import { LegendPanel } from "./legend-panel";

afterEach(() => {
  cleanup();
});

describe("LegendPanel", () => {
  it("explains rim-cove stations and the connected Ethereum precinct", () => {
    render(<LegendPanel onClose={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Shore stations & landmarks" })).toBeTruthy();
    expect(screen.getByText(/Ethereum's boathouse precinct/)).toBeTruthy();
  });
  it("names all six East-Asian hull families", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    for (const family of [
      "Bezaisen carrier",
      "Kobaya runner",
      "Twin-hull council boat",
      "Takasebune barge",
      "Battened junk",
      "Bullion scow",
    ]) {
      expect(markup).toContain(family);
    }
    expect(markup).toContain("Unclassified or missing-governance fallback");
    expect(markup).not.toContain("Crypto-backed centralized issuer");
    expect(markup).not.toMatch(/galleon|brigantine|schooner/i);
  });

  it("lists all seven canonical named waters", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    for (const area of ["Calm Anchorage", "Watch Breakwater", "Alert Channel", "Warning Shoals", "Danger Strait", "Ledger Mooring", "Wreck Shoal"]) {
      expect(markup).toContain(area);
    }
  });

  it("explains the leg/rest route cadence and its meaning caveat", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    expect(markup).toContain("90–180 s legs");
    expect(markup).toContain("240–480 s rests");
    expect(markup).toContain("arrivals and departures are paired");
    expect(markup).toContain("Routes show rendered-chain and risk-water presence only");
    expect(markup).not.toMatch(/bigger coins cycle|extended dwell/i);
  });

  it("uses modal dialog semantics and focuses/restores the close control", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open legend";
    document.body.append(opener);
    opener.focus();

    const view = render(<LegendPanel onClose={() => undefined} />);

    const panel = screen.getByRole("dialog", { name: "Legend" });
    const closeButton = screen.getByRole("button", { name: "Close legend" });
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("renders one marks row for each registered analytical mark cue", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    expect(markup).toContain("Marks to look for");
    expect(markup).toContain("beam warmth tracks fleet-wide PSI");
    expect(markup).toContain("they are separate signals");
    for (const row of LEGEND_MARK_ROWS) {
      expect(markup).toContain(`data-cue-id="${row.cueId}"`);
      expect(markup).toContain(row.label);
    }
    expect(markup.match(/data-cue-id=/g) ?? []).toHaveLength(LEGEND_MARK_ROWS.length);
    expect(markup).toContain("Audit shields are near-zoom marks");
  });

  it("renders recent mover supply labels when provided", () => {
    const markup = renderToStaticMarkup(
      <LegendPanel
        onClose={() => undefined}
        recentFleetTrend={{
          growers: [{ detailId: "ship.usde", symbol: "USDe", change7dPct: 18 }],
          shrinkers: [{ detailId: "ship.dai", symbol: "DAI", change7dPct: -8 }],
          elevatedShipCount: 4,
        }}
      />,
    );

    expect(markup).toContain("Click a ship and read the water it sails in first");
    expect(markup).toContain("Recent movers");
    expect(markup).toContain("USDe supply +18% (7d)");
    expect(markup).toContain("DAI supply -8% (7d)");
    expect(markup).toContain("4 ships in elevated water");
  });

  it("closes and starts observing from the closing call to action", () => {
    const calls: string[] = [];
    render(
      <LegendPanel
        onClose={() => calls.push("close")}
        onObserve={() => calls.push("observe")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Watch the harbor" }));
    expect(calls).toEqual(["close", "observe"]);
  });

  it("places the primary action immediately after Close in the focus order", () => {
    render(
      <LegendPanel
        onClose={() => undefined}
        onObserve={() => undefined}
        onSelectDetail={() => undefined}
        recentFleetTrend={{
          growers: [{ detailId: "ship.usde", symbol: "USDe", change7dPct: 18 }],
          shrinkers: [],
          elevatedShipCount: 1,
        }}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "Legend" });
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"),
    );
    expect(focusable.slice(0, 2).map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim()))
      .toEqual(["Close legend", "Watch the harbor"]);
  });

  it("omits the call to action when observing is unavailable", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    expect(markup).not.toContain("Watch the harbor");
  });

  it("renders the flat-week recent mover message", () => {
    const markup = renderToStaticMarkup(
      <LegendPanel
        onClose={() => undefined}
        recentFleetTrend={{ growers: [], shrinkers: [], elevatedShipCount: 0 }}
      />,
    );

    expect(markup).toContain("no notable supply moves this week; 0 ships in elevated water");
  });
});

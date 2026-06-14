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
    expect(markup).toContain("Consensus rigging and audit shields are near-zoom marks");
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

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
import type { DetailModel } from "../systems/world-types";
import { DetailPanel } from "./detail-panel";

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

  it("does not render more than 7 fact rows in total", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    const dts = markup.match(/<dt[^>]*>/g) ?? [];
    expect(dts.length).toBeLessThanOrEqual(7);
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
});

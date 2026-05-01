import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
import { DetailPanel } from "./detail-panel";

describe("DetailPanel fact grouping", () => {
  it("routes 'Sailing in formation' and 'Squad override' facts into the route group", () => {
    // sUSDS is a Sky-squad consort; depegging it produces an override that
    // surfaces both facts in the consort's detail panel.
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky"));
    const susds = world.ships.find((ship) => ship.id === "susds-sky")!;
    const detail = world.detailIndex[susds.detailId]!;

    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);

    const routeSectionMatch = markup.match(
      /<section[^>]*pharosville-detail-panel__section--route[^>]*>([\s\S]*?)<\/section>/,
    );
    expect(routeSectionMatch).not.toBeNull();
    const routeSection = routeSectionMatch![1];
    expect(routeSection).toContain("Sailing in formation");
    expect(routeSection).toContain("Squad override");

    const factsSectionMatch = markup.match(
      /<section[^>]*pharosville-detail-panel__section--facts[^>]*>([\s\S]*?)<\/section>/,
    );
    if (factsSectionMatch) {
      const factsSection = factsSectionMatch[1];
      expect(factsSection).not.toContain("Sailing in formation");
      expect(factsSection).not.toContain("Squad override");
    }
  });
});

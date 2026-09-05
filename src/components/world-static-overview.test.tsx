// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PharosVilleWorld } from "../systems/world-types";
import { WorldStaticOverview } from "./world-static-overview";

it("presents the four ranked signals and opens their existing details", () => {
  const onSelectDetail = vi.fn();
  render(<WorldStaticOverview world={overviewWorld()} onSelectDetail={onSelectDetail} />);

  expect(screen.getByRole("heading", { name: "Harbor signal overview" })).toBeTruthy();
  expect(screen.getByText("The Pharos lighthouse reports PSI 82, STEADY.")).toBeTruthy();
  expect(screen.getByText(/USDC is the observatory's leading risk watch/)).toBeTruthy();
  expect(screen.getByText(/DAI has the observatory's largest weekly percentage supply change/)).toBeTruthy();
  expect(screen.getByText(/Ethereum Dock has the observatory's highest dock concentration/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Open Weekly supply details" }));
  expect(onSelectDetail).toHaveBeenCalledWith("ship.dai");
});

function overviewWorld(): PharosVilleWorld {
  return {
    docks: [{
      concentration: 0.72,
      detailId: "dock.ethereum",
      id: "dock.ethereum",
      label: "Ethereum Dock",
      tile: { x: 6, y: 6 },
      totalUsd: 2_000,
    }],
    lighthouse: {
      detailId: "lighthouse",
      psiBand: "STEADY",
      score: 82,
      tile: { x: 4, y: 4 },
      unavailable: false,
    },
    ships: [
      {
        change7dPct: 4,
        detailId: "ship.usdc",
        id: "ship.usdc",
        marketCapUsd: 1_000,
        pegDeviationBps: 45,
        riskPlacement: "outer-rough-water",
        riskTile: { x: 7, y: 2 },
        riskZone: "warning",
        symbol: "USDC",
        tile: { x: 2, y: 3 },
      },
      {
        change7dPct: -12,
        detailId: "ship.dai",
        id: "ship.dai",
        marketCapUsd: 800,
        pegDeviationBps: 2,
        riskPlacement: "inner-harbor",
        riskTile: { x: 5, y: 2 },
        riskZone: "calm",
        symbol: "DAI",
        tile: { x: 3, y: 3 },
      },
    ],
  } as PharosVilleWorld;
}

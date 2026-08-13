import { describe, expect, it } from "vitest";
import type { ShipVisual } from "./garden-ships";
import {
  createGardenShipIssuanceWorksets,
  SHIP_ISSUANCE_WORKSET_NAME,
  shipIssuanceWorksetSpecs,
} from "./garden-ship-issuance";

function visual(direction: "minting" | "redeeming" | "flat", event = false): ShipVisual {
  return {
    selectionRadius: 2,
    ship: {
      id: direction,
      issuance: {
        direction,
        flowIntensity: direction === "minting" ? 80 : -60,
        netFlow24hUsd: direction === "minting" ? 4_000_000 : -4_000_000,
        largestEvent24h: event ? { amountUsd: 3_000_000, direction: "mint", timestamp: 1 } : null,
      },
    },
  } as ShipVisual;
}

describe("ship issuance worksets", () => {
  it("builds two working lighters only for active per-ship issuance", () => {
    const specs = shipIssuanceWorksetSpecs([visual("minting", true), visual("redeeming"), visual("flat")]);
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({ direction: "minting", hasLargestEvent: true, intensity: 0.8 });
    const worksets = createGardenShipIssuanceWorksets(specs);
    expect(worksets.count).toBe(4);
    expect(worksets.root.getObjectByName(SHIP_ISSUANCE_WORKSET_NAME)).toBeDefined();
    worksets.dispose();
  });

  it("builds no mesh when per-coin issuance is unavailable", () => {
    const worksets = createGardenShipIssuanceWorksets([]);
    expect(worksets.count).toBe(0);
    expect(worksets.root.children).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  GARDEN_ANOMALY_NAMEPLATE_CAP,
  selectGardenAnomalyShipDetailIds,
  unionGardenShipLabelDetailIds,
} from "./garden-anomaly-labels";
import { selectGardenArrivalBeatShipDetailIds } from "./garden-arrival-beats";
import type { ShipMotionSample } from "./motion-types";
import type { ShipNode } from "./world-types";

type LabelShip = Pick<ShipNode, "id" | "detailId" | "marketCapUsd" | "riskZone" | "dexCrossCheck">;

function ship(id: string, marketCapUsd: number, overrides: Partial<LabelShip> = {}): LabelShip {
  return { id, detailId: `ship.${id}`, marketCapUsd, riskZone: "calm", ...overrides };
}

function crossCheck(agrees: boolean): NonNullable<ShipNode["dexCrossCheck"]> {
  return {
    agrees,
    dexPrice: 0.98,
    dexDeviationBps: -200,
    oraclePrice: 1,
    oracleDeviationBps: 0,
    sourcePools: 2,
    sourceTvlUsd: 1_000_000,
  };
}

describe("selectGardenAnomalyShipDetailIds", () => {
  it("names DEX disagreements and Danger ships, not healthy or unmeasured ships", () => {
    const ships = [
      ship("healthy", 100, { dexCrossCheck: crossCheck(true) }),
      ship("unmeasured", 90),
      ship("warning", 80, { riskZone: "warning" }),
      ship("crossed", 70, { dexCrossCheck: crossCheck(false) }),
      ship("danger", 60, { riskZone: "danger", dexCrossCheck: crossCheck(true) }),
      ship("both", 50, { riskZone: "danger", dexCrossCheck: crossCheck(false) }),
    ];
    expect(selectGardenAnomalyShipDetailIds({ ships })).toEqual(["ship.crossed", "ship.danger", "ship.both"]);
  });

  it("caps at six by descending market cap then detail id, regardless of fleet order", () => {
    const ships = [
      ship("z", 10), ship("d", 60), ship("c", 70), ship("b", 70),
      ship("a", 100), ship("f", 40), ship("e", 50), ship("g", 40),
    ].map((entry) => ({ ...entry, riskZone: "danger" as const }));
    const originalIds = ships.map((entry) => entry.detailId);
    const expected = ["ship.a", "ship.b", "ship.c", "ship.d", "ship.e", "ship.f"];
    expect(selectGardenAnomalyShipDetailIds({ ships })).toEqual(expected);
    expect(expected).toHaveLength(GARDEN_ANOMALY_NAMEPLATE_CAP);
    expect(selectGardenAnomalyShipDetailIds({ ships: [...ships].reverse() })).toEqual(expected);
    expect(ships.map((entry) => entry.detailId)).toEqual(originalIds);
  });
});

describe("unionGardenShipLabelDetailIds", () => {
  it("keeps an anomaly outside every arrival window and appends unique arrivals after anomalies", () => {
    const ships = [
      ship("resting-anomaly", 100, { dexCrossCheck: crossCheck(false) }),
      ship("arriving-healthy", 90),
      ship("arriving-anomaly", 80, { riskZone: "danger" }),
    ];
    const samples = new Map<string, Pick<ShipMotionSample, "segment">>([
      ["resting-anomaly", { segment: { kind: "risk-rest" as const, secondsInto: 20, secondsRemaining: 200 } }],
      ["arriving-healthy", { segment: { kind: "dock-dwell" as const, secondsInto: 1, secondsRemaining: 100 } }],
      ["arriving-anomaly", { segment: { kind: "dock-dwell" as const, secondsInto: 1, secondsRemaining: 100 } }],
    ]);
    const arrivalIds = selectGardenArrivalBeatShipDetailIds(ships, samples, false);
    const anomalyIds = selectGardenAnomalyShipDetailIds({ ships });
    expect(arrivalIds).toEqual(["ship.arriving-healthy", "ship.arriving-anomaly"]);
    expect(unionGardenShipLabelDetailIds(anomalyIds, arrivalIds)).toEqual([
      "ship.resting-anomaly", "ship.arriving-anomaly", "ship.arriving-healthy",
    ]);
    expect(unionGardenShipLabelDetailIds(anomalyIds, [])).toEqual([
      "ship.resting-anomaly", "ship.arriving-anomaly",
    ]);
  });
});

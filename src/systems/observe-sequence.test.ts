import { describe, expect, it } from "vitest";
import { buildObserveSequence, selectGardenObservatoryAreas } from "./observe-sequence";
import type { PharosVilleWorld } from "./world-types";

function ship(
  id: string,
  riskZone: PharosVilleWorld["ships"][number]["riskZone"],
  change7dPct: number,
  pegDeviationBps = 0,
): PharosVilleWorld["ships"][number] {
  return {
    id,
    detailId: id,
    symbol: id.toUpperCase(),
    label: id,
    riskZone,
    riskPlacement: riskZone === "danger" ? "storm-shelf" : "safe-harbor",
    marketCapUsd: 1_000,
    pegDeviationBps,
    change7dPct,
    riskTile: { x: 4, y: 5 },
    tile: { x: 3, y: 4 },
  } as PharosVilleWorld["ships"][number];
}

describe("buildObserveSequence", () => {
  it("orders factual lighthouse, risk, supply, and concentration beats", () => {
    const world = {
      lighthouse: {
        detailId: "lighthouse",
        score: 82,
        psiBand: "STEADY",
        unavailable: false,
        tile: { x: 18, y: 28 },
      },
      ships: [
        ship("calm-growth", "calm", 18),
        ship("danger-watch", "danger", -2, 125),
      ],
      docks: [
        { detailId: "dock.a", id: "dock.a", label: "Alpha", concentration: 0.4, totalUsd: 2, tile: { x: 1, y: 1 } },
        { detailId: "dock.b", id: "dock.b", label: "Beta", concentration: 0.8, totalUsd: 1, tile: { x: 2, y: 2 } },
      ],
    } as unknown as Pick<PharosVilleWorld, "docks" | "lighthouse" | "ships">;

    const beats = buildObserveSequence(world);

    expect(beats.map((beat) => beat.kind)).toEqual([
      "lighthouse",
      "risk",
      "supply",
      "concentration",
    ]);
    const aged = buildObserveSequence({ ...world, freshness: { chainsStale: true } });
    expect(aged.map((beat) => beat.detailId)).toEqual(beats.map((beat) => beat.detailId));
    expect(aged[3]?.label).toContain("stale or unavailable evidence");
    expect(aged[0]?.label).toBe(beats[0]?.label);
    expect(beats[2]?.label).toContain("largest weekly percentage supply change");
    expect(beats[1]).toMatchObject({ detailId: "danger-watch", tile: { x: 4, y: 5 } });
    expect(beats[2]).toMatchObject({ detailId: "calm-growth", tile: { x: 3, y: 4 } });
    expect(beats[3]).toMatchObject({ detailId: "dock.b", tile: { x: 2, y: 2 } });
    expect(beats[3]?.label).toBe(
      "Beta has the observatory's highest dock concentration at HHI 0.80 — higher means supply is concentrated in fewer stablecoins; $1 total supply.",
    );
  });

  it("stays useful when analytical inputs are unavailable", () => {
    const world = {
      lighthouse: {
        detailId: "lighthouse",
        score: null,
        psiBand: null,
        unavailable: true,
        tile: { x: 18, y: 28 },
      },
      ships: [],
      docks: [],
    } as unknown as Pick<PharosVilleWorld, "docks" | "lighthouse" | "ships">;

    expect(buildObserveSequence(world)).toEqual([{
      detailId: "lighthouse",
      kind: "lighthouse",
      label: "The Pharos lighthouse is waiting for a current PSI reading.",
      tile: { x: 18, y: 28 },
    }]);
  });

  it("does not describe calm or ledger ships as elevated risk", () => {
    const world = {
      lighthouse: {
        detailId: "lighthouse",
        score: 82,
        psiBand: "STEADY",
        unavailable: false,
        tile: { x: 18, y: 28 },
      },
      ships: [
        ship("calm", "calm", 4),
        ship("ledger", "ledger", 2),
      ],
      docks: [],
    } as unknown as Pick<PharosVilleWorld, "docks" | "lighthouse" | "ships">;

    expect(buildObserveSequence(world).map((beat) => beat.kind)).not.toContain("risk");
  });
});

describe("selectGardenObservatoryAreas", () => {
  it("selects the highest severity area, then the busiest remaining risk area", () => {
    const areas = [
      area("calm", "CALM", 12),
      area("warning", "WARNING", 2),
      area("danger", "DANGER", 1),
      area("watch", "WATCH", 20),
    ];

    expect(selectGardenObservatoryAreas(areas).map((entry) => entry.id)).toEqual([
      "danger",
      "watch",
    ]);
  });

  it("does not invent an area when no analytical band is active", () => {
    const areas = [
      area("danger", "DANGER", 0),
      area("calm", "CALM", 8),
      { ...area("ledger", "CALM", 2), band: undefined, count: null },
    ] as PharosVilleWorld["areas"];

    expect(selectGardenObservatoryAreas(areas)).toEqual([]);
  });
});

function area(
  id: string,
  band: NonNullable<PharosVilleWorld["areas"][number]["band"]>,
  count: number,
): PharosVilleWorld["areas"][number] {
  return {
    band,
    count,
    detailId: `area.${id}`,
    id,
    kind: "area",
    label: id,
    tile: { x: 1, y: 1 },
  };
}

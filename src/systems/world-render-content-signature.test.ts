import { describe, expect, it } from "vitest";
import { fixtureStability, makePharosVilleWorldInput, makeSourceStatuses } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import type { PharosVilleWorld } from "./world-types";
import { worldRenderContentPartHashes, worldRenderContentSignature } from "./world-render-content-signature";
import { buildGardenMonthRecord } from "./garden-month-record";
import { SCENARIOS } from "../__fixtures__/data-contract-scenarios";

describe("worldRenderContentSignature", () => {
  it("isolates changed daily scores, gaps and methodology from the structural lighthouse/island key", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const history = [
      { date: Date.UTC(2026, 7, 12), score: 70, band: "STEADY", methodologyVersion: "v1" },
      { date: Date.UTC(2026, 7, 13), score: 80, band: "STEADY", methodologyVersion: "v1" },
    ];
    const daily = buildGardenMonthRecord({ ...fixtureStability, history });
    const withRecord = (gardenMonthRecord: NonNullable<PharosVilleWorld["lighthouse"]["gardenMonthRecord"]>) => ({
      ...world, lighthouse: { ...world.lighthouse, gardenMonthRecord },
    });
    const baseline = withRecord(daily);
    const baselineHashes = worldRenderContentPartHashes(baseline);
    for (const changedHistory of [
      [history[0]!, { ...history[1]!, score: 81 }],
      [history[0]!, { ...history[1]!, methodologyVersion: "v2" }],
      [history[1]!],
      [history[0]!, { ...history[1]!, date: history[1]!.date + 3_600_000 }],
    ]) {
      const changed = withRecord(buildGardenMonthRecord({ ...fixtureStability, history: changedHistory }));
      const hashes = worldRenderContentPartHashes(changed);
      expect(worldRenderContentSignature(changed)).not.toBe(worldRenderContentSignature(baseline));
      expect(Object.keys(hashes).filter((key) => hashes[key] !== baselineHashes[key])).toEqual(["gardenMonthRecord"]);
    }
    const held = withRecord({ ...daily, evidence: makeSourceStatuses({ stability: { state: "stale", reason: "held" } }).stability });
    expect(worldRenderContentSignature(held)).toBe(worldRenderContentSignature(baseline));
    const seconds = withRecord(buildGardenMonthRecord({ ...fixtureStability, history: history.map((point) => ({ ...point, date: point.date / 1000 })) }));
    expect(worldRenderContentSignature(seconds)).toBe(worldRenderContentSignature(baseline));
  });

  it("ignores refresh metadata and detail-only records", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const refreshed: PharosVilleWorld = {
      ...world,
      detailIndex: { ...world.detailIndex },
      entityById: { ...world.entityById },
      freshness: { ...world.freshness, stablecoins: { ...world.freshness.stablecoins, state: "stale" } },
      generatedAt: (world.generatedAt ?? 0) + 60_000,
      visualCues: [...world.visualCues],
    };

    expect(worldRenderContentSignature(refreshed)).toBe(worldRenderContentSignature(world));
  });

  it("ignores sub-band dock-supply noise but catches an authored size-band change", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const nudgeDocks = (factor: number): PharosVilleWorld => ({
      ...world,
      docks: world.docks.map((dock) => ({ ...dock, totalUsd: dock.totalUsd * factor })),
    });
    const resized: PharosVilleWorld = {
      ...world,
      docks: world.docks.map((dock, index) => (
        index === 0 ? { ...dock, size: dock.size === 1 ? 2 : dock.size - 1 } : dock
      )),
    };

    expect(worldRenderContentSignature(nudgeDocks(1.0005)))
      .toBe(worldRenderContentSignature(world));
    expect(worldRenderContentSignature(resized))
      .not.toBe(worldRenderContentSignature(world));
  });

  it("limits a sub-percent refresh that crosses the mover threshold to the pigeonnier role", () => {
    const input = makePharosVilleWorldInput();
    const stablecoins = {
      ...input.stablecoins!,
      peggedAssets: input.stablecoins!.peggedAssets.map((asset) => ({
        ...asset,
        circulating: asset.circulating
          ? {
              ...asset.circulating,
              peggedUSD: (asset.circulating.peggedUSD ?? 0) * 1.0004,
            }
          : asset.circulating,
      })),
    };
    const baseline = buildPharosVilleWorld(input);
    const refreshed = buildPharosVilleWorld({ ...input, stablecoins });

    const baselineSignature = JSON.parse(worldRenderContentSignature(baseline));
    const refreshedSignature = JSON.parse(worldRenderContentSignature(refreshed));
    expect(refreshedSignature.pigeonnier.moverDetailIds).toContain("ship.usdt-tether");
    expect({ ...refreshedSignature, pigeonnier: baselineSignature.pigeonnier })
      .toEqual(baselineSignature);
  });

  it("changes for baked ship visuals and analytical area semantics", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const subject = world.ships[0]!;
    const changedShip: PharosVilleWorld = {
      ...world,
      ships: world.ships.map((ship) => (
        ship.id === subject.id
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    };
    const changedArea: PharosVilleWorld = {
      ...world,
      areas: world.areas.map((area, index) => (
        index === 0 ? { ...area, label: `${area.label} revised` } : area
      )),
    };

    expect(worldRenderContentSignature(changedShip))
      .not.toBe(worldRenderContentSignature(world));
    expect(worldRenderContentSignature(changedArea))
      .not.toBe(worldRenderContentSignature(world));
  });

  it("changes when a ship's baked issuance work changes", () => {
    const world = buildPharosVilleWorld(structuredClone(SCENARIOS.largeMint));
    const subject = world.ships.find((ship) => ship.id === "usdc-circle")!;
    const changed: PharosVilleWorld = {
      ...world,
      ships: world.ships.map((ship) => ship.id === subject.id
        ? {
            ...ship,
            issuance: { ...ship.issuance!, activity: "redeeming", direction: "redeeming", netFlow24hUsd: -9_000_000 },
          }
        : ship),
    };
    expect(worldRenderContentSignature(changed)).not.toBe(worldRenderContentSignature(world));
  });

  it("provenance-only change keeps the signature", () => {
    const world = buildPharosVilleWorld(structuredClone(SCENARIOS.largeBalancedGross));
    const refreshed: PharosVilleWorld = {
      ...world,
      ships: world.ships.map((ship) => ship.issuance ? { ...ship, issuance: {
        ...ship.issuance, evidence: { ...ship.issuance.evidence, publishedAt: 1_700_000_060_000 },
      } } : ship),
      docks: world.docks.map((dock) => ({ ...dock, cargoTide: {
        ...dock.cargoTide!, evidence: { ...dock.cargoTide!.evidence, publishedAt: 1_700_000_060_000 },
      } })),
    };
    expect(worldRenderContentSignature(refreshed)).toBe(worldRenderContentSignature(world));
    const held = {
      ...refreshed, ships: refreshed.ships.map((ship) => ship.issuance ? { ...ship, issuance: {
        ...ship.issuance, evidence: { ...ship.issuance.evidence, state: "stale" as const },
      } } : ship),
    };
    expect(worldRenderContentSignature(held)).not.toBe(worldRenderContentSignature(world));
  });

  it("updates moving-work eligibility without replaying within-policy amount changes", () => {
    const world = buildPharosVilleWorld(structuredClone(SCENARIOS.largeMint));
    const input = structuredClone(SCENARIOS.largeMint);
    Object.assign(input.mintBurn!.coins[0]!, { mintVolume24hUsd: 110_000_000, netFlow24hUsd: 110_000_000 });
    const refreshed = buildPharosVilleWorld(input);
    expect(worldRenderContentSignature(refreshed)).toBe(worldRenderContentSignature(world));
    const small = buildPharosVilleWorld(structuredClone(SCENARIOS.oneDollarNet));
    const active = world.ships.find((ship) => ship.id === "usdc-circle")!;
    const reduced = {
      ...world, ships: world.ships.map((ship) => ship.id === active.id
        ? { ...ship, issuance: small.ships.find((entry) => entry.id === active.id)!.issuance! } : ship),
    };
    expect(worldRenderContentSignature(reduced)).not.toBe(worldRenderContentSignature(world));
  });
});

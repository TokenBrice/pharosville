import { describe, expect, it } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import type { PharosVilleWorld } from "./world-types";
import { worldRenderContentSignature } from "./world-render-content-signature";
import { SCENARIOS } from "../__fixtures__/data-contract-scenarios";

describe("worldRenderContentSignature", () => {
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

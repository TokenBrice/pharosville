import { describe, expect, it } from "vitest";
import type { BackingType, GovernanceType, PegCurrency, StablecoinMeta } from "@shared/types";
import { makeAsset } from "../__fixtures__/pharosville-world";
import { resolveShipClass, resolveShipSizeTier, resolveShipVisual } from "./ship-visuals";

function makeMeta(input: {
  backing?: BackingType;
  governance?: GovernanceType;
  navToken?: boolean;
  pegCurrency?: PegCurrency;
  yieldBearing?: boolean;
}): StablecoinMeta {
  return {
    flags: {
      backing: input.backing ?? "rwa-backed",
      governance: input.governance,
      navToken: input.navToken ?? false,
      pegCurrency: input.pegCurrency ?? "USD",
      rwa: input.backing !== "crypto-backed",
      yieldBearing: input.yieldBearing ?? false,
    },
  } as StablecoinMeta;
}

describe("resolveShipVisual", () => {
  it("uses governance class for base ship models", () => {
    expect(resolveShipClass(makeMeta({ governance: "centralized" }))).toMatchObject({
      hull: "treasury-galleon",
      label: "CeFi",
      shipClass: "cefi",
    });
    expect(resolveShipClass(makeMeta({ governance: "centralized-dependent" }))).toMatchObject({
      hull: "chartered-brigantine",
      label: "CeFi-Dep",
      shipClass: "cefi-dependent",
    });
    expect(resolveShipClass(makeMeta({ governance: "decentralized" }))).toMatchObject({
      hull: "dao-schooner",
      label: "DeFi",
      shipClass: "defi",
    });
  });

  it("keeps algorithmic backing on the defensive legacy fallback", () => {
    expect(resolveShipClass(makeMeta({ backing: "algorithmic", governance: "centralized" }))).toMatchObject({
      hull: "algo-junk",
      label: "Legacy algorithmic",
      shipClass: "legacy-algo",
    });
  });

  it("maps market caps to compressed size tiers", () => {
    expect(resolveShipSizeTier(20_000_000_000)).toEqual({ label: "Flagship", scale: 3, tier: "flagship" });
    expect(resolveShipSizeTier(2_000_000_000)).toEqual({ label: "Major", scale: 1.8, tier: "major" });
    expect(resolveShipSizeTier(200_000_000)).toEqual({ label: "Regional", scale: 1.25, tier: "regional" });
    expect(resolveShipSizeTier(20_000_000)).toEqual({ label: "Local", scale: 0.95, tier: "local" });
    expect(resolveShipSizeTier(2_000_000)).toEqual({ label: "Skiff", scale: 0.78, tier: "skiff" });
    expect(resolveShipSizeTier(500_000)).toEqual({ label: "Micro", scale: 0.7, tier: "micro" });
    expect(resolveShipSizeTier(0)).toEqual({ label: "Unknown", scale: 0.7, tier: "unknown" });
    expect(resolveShipSizeTier(2_000_000_000).scale).toBeGreaterThan(1.5);
  });

  it("preserves peg, overlay, and compressed scale channels", () => {
    const meta = makeMeta({
      backing: "crypto-backed",
      governance: "centralized-dependent",
      navToken: true,
    });
    const visual = resolveShipVisual(makeAsset({
      id: "susde-ethena",
      symbol: "sUSDe",
      circulating: { peggedUSD: 11_000_000_000 },
    }), meta, null);

    expect(visual.hull).toBe("chartered-brigantine");
    expect(visual.shipClass).toBe("cefi-dependent");
    expect(visual.classLabel).toBe("CeFi-Dep");
    expect(visual.rigging).toBe("dependent-rig");
    expect(visual.pennant).toBe("emerald");
    expect(visual.overlay).toBe("nav");
    expect(visual.sizeTier).toBe("flagship");
    expect(visual.sizeLabel).toBe("Flagship");
    expect(visual.scale).toBe(3);
  });

  it("derives deterministic fallback livery variants instead of one peg color", () => {
    const meta = makeMeta({ governance: "centralized", pegCurrency: "USD" });
    const first = resolveShipVisual(makeAsset({
      id: "alpha-dollar",
      symbol: "ALPHA",
      circulating: { peggedUSD: 100_000_000 },
    }), meta, null);
    const second = resolveShipVisual(makeAsset({
      id: "bravo-dollar",
      symbol: "BRAVO",
      circulating: { peggedUSD: 100_000_000 },
    }), meta, null);
    const repeat = resolveShipVisual(makeAsset({
      id: "alpha-dollar",
      symbol: "ALPHA",
      circulating: { peggedUSD: 100_000_000 },
    }), meta, null);

    expect(first.livery.source).toBe("peg-fallback");
    expect(first.livery.label).toBe("USD peg derived livery");
    expect(first.livery).toEqual(repeat.livery);
    expect([
      first.livery.primary,
      first.livery.accent,
      first.livery.sailColor,
      first.livery.sailPanel,
      first.livery.stripePattern,
    ]).not.toEqual([
      second.livery.primary,
      second.livery.accent,
      second.livery.sailColor,
      second.livery.sailPanel,
      second.livery.stripePattern,
    ]);
  });

  it("gives USDC, USDS, and USDT dedicated titan hull treatments", () => {
    const meta = makeMeta({ governance: "centralized" });
    const dependentMeta = makeMeta({ governance: "centralized-dependent" });
    const usdc = resolveShipVisual(makeAsset({
      id: "usdc-circle",
      symbol: "USDC",
      circulating: { peggedUSD: 50_000_000_000 },
    }), meta, null);
    const usds = resolveShipVisual(makeAsset({
      id: "usds-sky",
      symbol: "USDS",
      circulating: { peggedUSD: 8_000_000_000 },
    }), dependentMeta, null);
    const usdt = resolveShipVisual(makeAsset({
      id: "usdt-tether",
      symbol: "USDT",
      circulating: { peggedUSD: 100_000_000_000 },
    }), meta, null);

    expect(usdc.hull).toBe("treasury-galleon");
    expect(usdc.spriteAssetId).toBe("ship.usdc-titan");
    expect(usdc.sizeTier).toBe("titan");
    expect(usdc.sizeLabel).toBe("Titan");
    expect(usds.hull).toBe("chartered-brigantine");
    expect(usds.spriteAssetId).toBe("ship.usds-titan");
    expect(usds.sizeTier).toBe("titan");
    expect(usds.sizeLabel).toBe("Titan");
    expect(usdt.spriteAssetId).toBe("ship.usdt-titan");
    expect(usdt.sizeTier).toBe("titan");
    expect(usdt.sizeLabel).toBe("Titan");
    expect(usds.scale).toBe(1.6);
    expect(usdc.scale).toBe(1.8);
    expect(usdt.scale).toBe(2);
    expect(usds.scale).toBeLessThan(usdc.scale);
    expect(usdt.scale).toBeGreaterThan(usdc.scale);
  });
});

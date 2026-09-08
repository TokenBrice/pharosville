import { describe, expect, it } from "vitest";
import type { BackingType, GovernanceType, PegCurrency, StablecoinMeta } from "@shared/types";
import { makeAsset } from "../__fixtures__/pharosville-world";
import { STABLECOIN_SQUAD_MEMBER_IDS } from "./maker-squad";
import {
  marketCapVisualScale,
  resolveShipClass,
  resolveShipSizeTier,
  resolveShipVisual,
} from "./ship-visuals";
import { UNIQUE_SHIP_DEFINITIONS } from "./unique-ships";

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
    });
    expect(resolveShipClass(makeMeta({ governance: "centralized-dependent" }))).toMatchObject({
      hull: "chartered-brigantine",
      label: "CeFi-Dep",
    });
    expect(resolveShipClass(makeMeta({ governance: "decentralized" }))).toMatchObject({
      hull: "dao-schooner",
      label: "DeFi",
    });
  });

  it("keeps algorithmic backing on the defensive legacy fallback", () => {
    expect(resolveShipClass(makeMeta({ backing: "algorithmic", governance: "centralized" }))).toMatchObject({
      hull: "algo-junk",
      label: "Legacy algorithmic",
    });
  });

  it.each([
    ["$1M coin", 1_000_000, 0.42],
    ["$100M coin", 100_000_000, 0.6656],
    ["$10B coin", 10_000_000_000, 1.0550],
    ["USDT", 200_000_000_000, 1.15],
  ])("maps %s onto the continuous market-cap scale", (_label, marketCap, expected) => {
    expect(marketCapVisualScale(marketCap)).toBeCloseTo(expected, 2);
  });

  it("keeps the established market-cap tier labels", () => {
    expect(resolveShipSizeTier(20_000_000_000)).toMatchObject({ label: "Flagship", tier: "flagship" });
    expect(resolveShipSizeTier(2_000_000_000)).toMatchObject({ label: "Major", tier: "major" });
    expect(resolveShipSizeTier(200_000_000)).toMatchObject({ label: "Regional", tier: "regional" });
    expect(resolveShipSizeTier(20_000_000)).toMatchObject({ label: "Local", tier: "local" });
    expect(resolveShipSizeTier(2_000_000)).toMatchObject({ label: "Skiff", tier: "skiff" });
    expect(resolveShipSizeTier(500_000)).toMatchObject({ label: "Micro", tier: "micro" });
    expect(resolveShipSizeTier(0)).toEqual({ label: "Unknown", scale: 0.42, tier: "unknown" });
  });

  it("splits hull family by collateral model, not governance alone (N5a)", () => {
    // Crypto collateral under a central issuer is not a treasury ship.
    expect(resolveShipClass(makeMeta({
      backing: "crypto-backed",
      governance: "centralized",
    })).hull).toBe("chartered-brigantine");
    expect(resolveShipClass(makeMeta({
      backing: "rwa-backed",
      governance: "centralized",
    })).hull).toBe("treasury-galleon");

    // A NAV share over real paper is a fund in a hull; over crypto it is not.
    expect(resolveShipClass(makeMeta({
      backing: "rwa-backed",
      governance: "centralized-dependent",
      navToken: true,
    })).hull).toBe("treasury-galleon");
    expect(resolveShipClass(makeMeta({
      backing: "crypto-backed",
      governance: "centralized-dependent",
      navToken: true,
    })).hull).toBe("chartered-brigantine");

    // A DAO holding real paper and paying it out runs a treasury — and since
    // that branch is yield-bearing by definition, it always sails the indiaman.
    expect(resolveShipClass(makeMeta({
      backing: "rwa-backed",
      governance: "decentralized",
      yieldBearing: true,
    })).hull).toBe("yield-indiaman");
    // The DAO pool is 14 ships; W2 deliberately does NOT split it further, so a
    // yield-bearing crypto-collateral DAO coin stays on the schooner.
    expect(resolveShipClass(makeMeta({
      backing: "crypto-backed",
      governance: "decentralized",
      yieldBearing: true,
    })).hull).toBe("dao-schooner");
  });

  it("W2: yield-bearing and commodity pegs earn their own hulls", () => {
    // Holding reserves and paying a yield out of them are different voyages.
    expect(resolveShipClass(makeMeta({
      backing: "rwa-backed",
      governance: "centralized",
    })).hull).toBe("treasury-galleon");
    expect(resolveShipClass(makeMeta({
      backing: "rwa-backed",
      governance: "centralized",
      yieldBearing: true,
    })).hull).toBe("yield-indiaman");

    expect(resolveShipClass(makeMeta({
      backing: "crypto-backed",
      governance: "centralized",
    })).hull).toBe("chartered-brigantine");
    expect(resolveShipClass(makeMeta({
      backing: "crypto-backed",
      governance: "centralized",
      yieldBearing: true,
    })).hull).toBe("yield-barque");

    // Bullion is cargo, not a currency: it gets the short deep hoy, while a
    // foreign FIAT peg keeps the trading junk.
    for (const pegCurrency of ["GOLD", "SILVER"] as const) {
      expect(resolveShipClass(makeMeta({
        backing: "rwa-backed",
        governance: "centralized",
        pegCurrency,
      })).hull).toBe("commodity-peg-hoy");
    }
    for (const pegCurrency of ["EUR", "JPY", "BRL"] as const) {
      expect(resolveShipClass(makeMeta({
        backing: "rwa-backed",
        governance: "centralized",
        pegCurrency,
      })).hull).toBe("foreign-peg-junk");
    }
  });

  it("preserves peg, overlay, and continuous scale channels", () => {
    const meta = makeMeta({
      backing: "crypto-backed",
      governance: "centralized-dependent",
      navToken: true,
    });
    const visual = resolveShipVisual(makeAsset({
      id: "synthetic-placeholder",
      symbol: "sUSDe",
      circulating: { peggedUSD: 11_000_000_000 },
    }), meta, null);

    expect(visual.hull).toBe("chartered-brigantine");
    expect(visual.classLabel).toBe("CeFi-Dep");
    expect(visual.overlay).toBe("nav");
    expect(visual.sizeTier).toBe("flagship");
    expect(visual.sizeLabel).toBe("Flagship");
    expect(visual.scale).toBeCloseTo(1.065, 3);
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
    expect(usdc.sizeTier).toBe("titan");
    expect(usdc.sizeLabel).toBe("Titan");
    expect(usds.hull).toBe("chartered-brigantine");
    expect(usds.sizeTier).toBe("titan");
    expect(usds.sizeLabel).toBe("Titan");
    expect(usdt.sizeTier).toBe("titan");
    expect(usdt.sizeLabel).toBe("Titan");
    expect(usds.scale).toBeCloseTo(1.03, 2);
    expect(usdc.scale).toBe(1.15);
    expect(usdt.scale).toBe(1.15);
  });

  it("resolves the titan tier for every stablecoin squad member", () => {
    const meta = makeMeta({ governance: "centralized-dependent" });
    for (const id of STABLECOIN_SQUAD_MEMBER_IDS) {
      const visual = resolveShipVisual(makeAsset({
        id,
        symbol: id.toUpperCase(),
        circulating: { peggedUSD: 1_000_000_000 },
      }), meta, null);
      expect(visual.sizeTier, `expected titan tier for ${id}`).toBe("titan");
    }
  });

  it("keeps heritage treatment while deriving its scale from market cap", () => {
    const meta = makeMeta({ governance: "decentralized" });
    for (const [id, def] of Object.entries(UNIQUE_SHIP_DEFINITIONS)) {
      const visual = resolveShipVisual(makeAsset({
        id,
        symbol: id.toUpperCase(),
        circulating: { peggedUSD: 250_000_000 },
      }), meta, null);
      expect(visual.sizeTier, id).toBe("unique");
      expect(visual.sizeLabel, id).toBe("Heritage hull");
      expect(visual.scale, id).toBeCloseTo(marketCapVisualScale(250_000_000));
      expect(visual.uniqueRationale, id).toBe(def.rationale);
    }
  });

  it("keeps the heritage tier while market cap controls scale", () => {
    const meta = makeMeta({ governance: "decentralized" });
    const tinyCap = resolveShipVisual(makeAsset({
      id: "crvusd-curve",
      symbol: "crvUSD",
      circulating: { peggedUSD: 500_000 },
    }), meta, null);
    const hugeCap = resolveShipVisual(makeAsset({
      id: "crvusd-curve",
      symbol: "crvUSD",
      circulating: { peggedUSD: 50_000_000_000 },
    }), meta, null);

    expect(tinyCap.sizeTier).toBe("unique");
    expect(tinyCap.sizeLabel).toBe("Heritage hull");
    expect(hugeCap.sizeTier).toBe("unique");
    expect(hugeCap.sizeLabel).toBe("Heritage hull");
    expect(tinyCap.scale).toBe(0.42);
    expect(hugeCap.scale).toBe(1.15);
  });

  it("titan tier wins if a stablecoin id ever appears in both registries", () => {
    // The resolver must short-circuit on the titan branch before considering
    // any possible heritage definition.
    const meta = makeMeta({ governance: "centralized" });
    const visual = resolveShipVisual(makeAsset({
      id: "usdc-circle",
      symbol: "USDC",
      circulating: { peggedUSD: 50_000_000_000 },
    }), meta, null);
    expect(visual.sizeTier).toBe("titan");
    expect(visual.sizeLabel).toBe("Titan");
    expect(visual.uniqueRationale).toBeUndefined();
  });

  it("leaves uniqueRationale undefined for non-unique ships", () => {
    const meta = makeMeta({ governance: "centralized" });
    const visual = resolveShipVisual(makeAsset({
      id: "alpha-dollar",
      symbol: "ALPHA",
      circulating: { peggedUSD: 100_000_000 },
    }), meta, null);
    expect(visual.uniqueRationale).toBeUndefined();
    const titanVisual = resolveShipVisual(makeAsset({
      id: "usdt-tether",
      symbol: "USDT",
      circulating: { peggedUSD: 100_000_000_000 },
    }), meta, null);
    expect(titanVisual.uniqueRationale).toBeUndefined();
  });

  it("uses one cap-derived scale for stablecoin squad members", () => {
    const meta = makeMeta({ governance: "centralized-dependent" });
    for (const id of STABLECOIN_SQUAD_MEMBER_IDS) {
      const visual = resolveShipVisual(makeAsset({
        id,
        symbol: id.toUpperCase(),
        circulating: { peggedUSD: 1_000_000_000 },
      }), meta, null);
      expect(visual.scale, id).toBeCloseTo(marketCapVisualScale(1_000_000_000));
    }
  });
});

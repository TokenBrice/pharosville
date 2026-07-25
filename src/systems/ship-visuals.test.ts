import { describe, expect, it } from "vitest";
import type { BackingType, GovernanceType, PegCurrency, StablecoinMeta } from "@shared/types";
import { makeAsset } from "../__fixtures__/pharosville-world";
import { STABLECOIN_SQUAD_MEMBER_IDS } from "./maker-squad";
import { TITAN_SHIPS, resolveShipClass, resolveShipSizeTier, resolveShipVisual } from "./ship-visuals";
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

    // A DAO holding real paper and paying it out runs a treasury.
    expect(resolveShipClass(makeMeta({
      backing: "rwa-backed",
      governance: "decentralized",
      yieldBearing: true,
    })).hull).toBe("treasury-galleon");
    expect(resolveShipClass(makeMeta({
      backing: "crypto-backed",
      governance: "decentralized",
      yieldBearing: true,
    })).hull).toBe("dao-schooner");
  });

  it("preserves peg, overlay, and compressed scale channels", () => {
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
    expect(usdc.sizeTier).toBe("titan");
    expect(usdc.sizeLabel).toBe("Titan");
    expect(usds.hull).toBe("chartered-brigantine");
    expect(usds.sizeTier).toBe("titan");
    expect(usds.sizeLabel).toBe("Titan");
    expect(usdt.sizeTier).toBe("titan");
    expect(usdt.sizeLabel).toBe("Titan");
    expect(usds.scale).toBe(1.15);
    expect(usdc.scale).toBe(1.53);
    expect(usdt.scale).toBe(1.7);
    // Sky flagship sails in formation, so it's smaller than solo titans.
    expect(usds.scale).toBeLessThan(usdc.scale);
    expect(usdt.scale).toBeGreaterThan(usdc.scale);
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

  it("keeps positive scales for every titan definition", () => {
    for (const [id, definition] of Object.entries(TITAN_SHIPS)) {
      expect(definition.scale, id).toBeGreaterThan(0);
    }
  });

  it("resolves the heritage tier for every cultural-significance stablecoin", () => {
    const meta = makeMeta({ governance: "decentralized" });
    for (const [id, def] of Object.entries(UNIQUE_SHIP_DEFINITIONS)) {
      const visual = resolveShipVisual(makeAsset({
        id,
        symbol: id.toUpperCase(),
        circulating: { peggedUSD: 250_000_000 },
      }), meta, null);
      expect(visual.sizeTier, id).toBe("unique");
      expect(visual.sizeLabel, id).toBe("Heritage hull");
      expect(visual.scale, id).toBe(def.scale);
      expect(visual.uniqueRationale, id).toBe(def.rationale);
    }
  });

  it("unique tier overrides marketcap-derived size for crvusd-curve at any cap", () => {
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
    expect(tinyCap.scale).toBe(UNIQUE_SHIP_DEFINITIONS["crvusd-curve"].scale);
    expect(hugeCap.scale).toBe(UNIQUE_SHIP_DEFINITIONS["crvusd-curve"].scale);
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

  it("uses the re-tuned scale band for stablecoin squad members", () => {
    const meta = makeMeta({ governance: "centralized-dependent" });
    const expectedScales: Record<string, number> = {
      "usds-sky": 1.15,
      "dai-makerdao": 1.06,
      "susds-sky": 0.94,
      "sdai-sky": 0.94,
      "stusds-sky": 0.98,
      "usde-ethena": 1.20,
      "susde-ethena": 0.95,
    };
    for (const [id, expectedScale] of Object.entries(expectedScales)) {
      const visual = resolveShipVisual(makeAsset({
        id,
        symbol: id.toUpperCase(),
        circulating: { peggedUSD: 1_000_000_000 },
      }), meta, null);
      expect(visual.scale, `expected scale ${expectedScale} for ${id}`).toBe(expectedScale);
    }
  });
});

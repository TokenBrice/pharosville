import type { ReportCard, StablecoinData, StablecoinMeta } from "@shared/types";
import { getCirculatingRaw } from "@/lib/supply";
import type { ShipClass, ShipHull, ShipSizeTier, ShipVisual } from "./world-types";
import { resolveStablecoinShipBranding } from "./stablecoin-ship-branding";
import { uniqueDefinitionFor } from "./unique-ships";

const GOVERNANCE_LABELS_SHORT = {
  centralized: "CeFi",
  "centralized-dependent": "CeFi-Dep",
  decentralized: "DeFi",
} as const;


interface ShipClassDefinition {
  hull: ShipHull;
  label: string;
  shipClass: ShipClass;
  rigging: ShipVisual["rigging"];
}

interface ShipSizeDefinition {
  label: string;
  scale: number;
  tier: ShipSizeTier;
}

interface TitanShipDefinition {
  spriteAssetId: string;
  scale: number;
}

const UNKNOWN_CLASS: ShipClassDefinition = {
  hull: "crypto-caravel",
  label: "Unclassified",
  shipClass: "unclassified",
  rigging: "issuer-rig",
};

// Squad members reduced by ~20% from prior tuning to relieve formation overlap
// at common zoom levels (Sky: USDS+sUSDS+stUSDS; Maker: DAI+sDAI). USDC and
// USDT remain at their solo titan scales since they don't sail in formation.
export const TITAN_SHIPS: Record<string, TitanShipDefinition> = {
  "usdc-circle": { spriteAssetId: "ship.usdc-titan", scale: 1.53 },
  "usds-sky": { spriteAssetId: "ship.usds-titan", scale: 1.15 },
  "usdt-tether": { spriteAssetId: "ship.usdt-titan", scale: 1.7 },
  "dai-makerdao": { spriteAssetId: "ship.dai-titan", scale: 1.06 },
  "susds-sky": { spriteAssetId: "ship.susds-titan", scale: 0.94 },
  "sdai-sky": { spriteAssetId: "ship.sdai-titan", scale: 0.94 },
  "stusds-sky": { spriteAssetId: "ship.stusds-titan", scale: 0.98 },
  "usde-ethena": { spriteAssetId: "ship.usde-titan", scale: 1.20 },
  "susde-ethena": { spriteAssetId: "ship.susde-titan", scale: 0.95 },
  "pyusd-paypal": { spriteAssetId: "ship.pyusd-titan", scale: 1.40 },
  "usd1-world-liberty-financial": { spriteAssetId: "ship.usd1-titan", scale: 1.35 },
  "buidl-blackrock": { spriteAssetId: "ship.buidl-titan", scale: 1.40 },
};

export const TITAN_SHIP_ASSET_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(TITAN_SHIPS).map(([id, definition]) => [id, definition.spriteAssetId]),
);

export function resolveShipClass(meta: StablecoinMeta): ShipClassDefinition {
  const backing = meta.flags?.backing;
  const governance = meta.flags?.governance;
  if (backing === "algorithmic") {
    return {
      hull: "algo-junk",
      label: "Legacy algorithmic",
      shipClass: "legacy-algo",
      rigging: "dependent-rig",
    };
  }

  if (governance === "centralized") {
    return {
      hull: "treasury-galleon",
      label: GOVERNANCE_LABELS_SHORT.centralized,
      shipClass: "cefi",
      rigging: "issuer-rig",
    };
  }

  if (governance === "centralized-dependent") {
    return {
      hull: "chartered-brigantine",
      label: GOVERNANCE_LABELS_SHORT["centralized-dependent"],
      shipClass: "cefi-dependent",
      rigging: "dependent-rig",
    };
  }

  if (governance === "decentralized") {
    return {
      hull: "dao-schooner",
      label: GOVERNANCE_LABELS_SHORT.decentralized,
      shipClass: "defi",
      rigging: "dao-rig",
    };
  }

  return UNKNOWN_CLASS;
}

export function resolveShipSizeTier(marketCapUsd: number): ShipSizeDefinition {
  if (!Number.isFinite(marketCapUsd) || marketCapUsd <= 0) {
    return { label: "Unknown", scale: 0.7, tier: "unknown" };
  }
  if (marketCapUsd >= 10_000_000_000) return { label: "Flagship", scale: 3, tier: "flagship" };
  if (marketCapUsd >= 1_000_000_000) return { label: "Major", scale: 1.8, tier: "major" };
  if (marketCapUsd >= 100_000_000) return { label: "Regional", scale: 1.25, tier: "regional" };
  if (marketCapUsd >= 10_000_000) return { label: "Local", scale: 0.95, tier: "local" };
  if (marketCapUsd >= 1_000_000) return { label: "Skiff", scale: 0.78, tier: "skiff" };
  return { label: "Micro", scale: 0.7, tier: "micro" };
}

export function resolveShipVisual(asset: StablecoinData, meta: StablecoinMeta, reportCard: ReportCard | null): ShipVisual {
  const marketCap = getCirculatingRaw(asset);
  const shipClass = resolveShipClass(meta);
  const size = resolveShipSizeTier(marketCap);
  const titan = TITAN_SHIPS[asset.id];
  // Titan registry wins if a stablecoin id ever appears in both. Unique
  // resolution only runs when the titan lookup misses.
  const uniqueDef = !titan ? uniqueDefinitionFor(asset) : null;
  const branding = resolveStablecoinShipBranding(asset.id, meta);
  const spriteAssetId = titan?.spriteAssetId ?? uniqueDef?.spriteAssetId;
  return {
    hull: shipClass.hull,
    ...(spriteAssetId ? { spriteAssetId } : {}),
    ...(uniqueDef ? { uniqueRationale: uniqueDef.rationale } : {}),
    shipClass: shipClass.shipClass,
    classLabel: shipClass.label,
    rigging: shipClass.rigging,
    livery: branding,
    sailColor: branding.sailColor,
    sailStripeColor: branding.primary,
    overlay: meta.flags.navToken ? "nav" : meta.flags.yieldBearing ? "yield" : reportCard?.overallGrade === "D" || reportCard?.overallGrade === "F" ? "watch" : "none",
    sizeTier: titan ? "titan" : uniqueDef ? "unique" : size.tier,
    sizeLabel: titan ? "Titan" : uniqueDef ? "Heritage hull" : size.label,
    scale: titan?.scale ?? uniqueDef?.scale ?? size.scale,
  };
}

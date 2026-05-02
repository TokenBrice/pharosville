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

const UNKNOWN_CLASS: ShipClassDefinition = {
  hull: "crypto-caravel",
  label: "Unclassified",
  shipClass: "unclassified",
  rigging: "issuer-rig",
};

export const TITAN_SHIP_ASSET_IDS: Record<string, string> = {
  "usdc-circle": "ship.usdc-titan",
  "usds-sky": "ship.usds-titan",
  "usdt-tether": "ship.usdt-titan",
  "dai-makerdao": "ship.dai-titan",
  "susds-sky": "ship.susds-titan",
  "sdai-sky": "ship.sdai-titan",
  "stusds-sky": "ship.stusds-titan",
};

// Squad members reduced by ~20% from prior tuning to relieve formation overlap
// at common zoom levels (Sky: USDS+sUSDS+stUSDS; Maker: DAI+sDAI). USDC and
// USDT remain at their solo titan scales since they don't sail in formation.
const TITAN_SHIP_SCALES: Record<string, number> = {
  "usdc-circle": 1.8,
  "usdt-tether": 2,
  "usds-sky": 1.35,    // 1.7 * 0.8
  "dai-makerdao": 1.25, // 1.55 * 0.8
  "susds-sky": 1.1,    // 1.35 * 0.8
  "sdai-sky": 1.1,     // 1.35 * 0.8
  "stusds-sky": 1.15,  // 1.45 * 0.8
};

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
  const titanSpriteAssetId = TITAN_SHIP_ASSET_IDS[asset.id];
  // Titan registry wins if a stablecoin id ever appears in both. Unique
  // resolution only runs when the titan lookup misses.
  const uniqueDef = !titanSpriteAssetId ? uniqueDefinitionFor(asset) : null;
  const branding = resolveStablecoinShipBranding(asset.id, meta);
  const spriteAssetId = titanSpriteAssetId ?? uniqueDef?.spriteAssetId;
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
    sizeTier: titanSpriteAssetId ? "titan" : uniqueDef ? "unique" : size.tier,
    sizeLabel: titanSpriteAssetId ? "Titan" : uniqueDef ? "Heritage hull" : size.label,
    scale: TITAN_SHIP_SCALES[asset.id] ?? uniqueDef?.scale ?? size.scale,
  };
}

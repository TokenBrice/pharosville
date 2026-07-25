import type { ReportCard, StablecoinData, StablecoinMeta } from "@shared/types";
import { getCirculatingRaw } from "@/lib/supply";
import type { ShipHull, ShipSizeTier, ShipVisual } from "./world-types";
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
}

interface ShipSizeDefinition {
  label: string;
  scale: number;
  tier: ShipSizeTier;
}

interface TitanShipDefinition {
  scale: number;
}

const UNKNOWN_CLASS: ShipClassDefinition = {
  hull: "crypto-caravel",
  label: "Unclassified",
};

// Squad members reduced by ~20% from prior tuning to relieve formation overlap
// at common zoom levels (Sky: USDS+sUSDS+stUSDS; Maker: DAI+sDAI). USDC and
// USDT remain at their solo titan scales since they don't sail in formation.
export const TITAN_SHIPS: Record<string, TitanShipDefinition> = {
  "usdc-circle": { scale: 1.53 },
  "usds-sky": { scale: 1.15 },
  "usdt-tether": { scale: 1.7 },
  "dai-makerdao": { scale: 1.06 },
  "susds-sky": { scale: 0.94 },
  "sdai-sky": { scale: 0.94 },
  "stusds-sky": { scale: 0.98 },
  "usde-ethena": { scale: 1.20 },
  "susde-ethena": { scale: 0.95 },
  "pyusd-paypal": { scale: 1.40 },
  "usd1-world-liberty-financial": { scale: 1.35 },
  "buidl-blackrock": { scale: 1.40 },
};

/**
 * N5(a): the hull family a ship sails, derived from what the stablecoin
 * actually *is* rather than from its governance flag alone.
 *
 * Governance still decides the broad family, because it is the trait with the
 * strongest visual analogue (who commands the ship). Within that, the
 * collateral model reassigns the cases where governance alone was misleading:
 *
 * - A crypto-backed coin under centralized governance is not a treasury ship;
 *   its reserves are on-chain and volatile, so it sails the brigantine rather
 *   than the galleon.
 * - An RWA/NAV-bearing decentralized coin holds off-chain paper, which reads
 *   as a laden merchant hull, not a lean DAO schooner.
 * - A yield-bearing centralized-dependent coin is a carrier for someone else's
 *   yield, which is the galleon's job.
 *
 * The batched fleet renders four silhouettes as instanced meshes, so this
 * function chooses *which* of the four a ship joins; it cannot vary geometry
 * per ship. Per-ship proportions need per-instance attributes in the fleet
 * batch — see the N5(a) note in the plan.
 */
export function resolveShipClass(meta: StablecoinMeta): ShipClassDefinition {
  const backing = meta.flags?.backing;
  const governance = meta.flags?.governance;
  const yieldBearing = meta.flags?.yieldBearing ?? false;
  const navToken = meta.flags?.navToken ?? false;
  // `rwa` is true for almost everything that is not crypto-backed, so it is
  // useless as a splitter on its own — pairing it with navToken/yieldBearing is
  // what isolates the genuinely fund-like coins.
  const realWorldBacked = backing === "rwa-backed";

  if (backing === "algorithmic") {
    return {
      hull: "algo-junk",
      label: "Legacy algorithmic",
    };
  }

  // A non-dollar peg is the strongest single split available on this data
  // (53 of 188 batched ships) and it is genuinely a different trade. The label
  // stays governance-truthful — only the hull changes — because `classLabel` is
  // what the UI shows and it must never claim something the coin is not.
  if (meta.flags?.pegCurrency !== undefined && meta.flags.pegCurrency !== "USD") {
    return {
      hull: "foreign-peg-junk",
      label: governance === undefined
        ? UNKNOWN_CLASS.label
        : GOVERNANCE_LABELS_SHORT[governance],
    };
  }

  if (governance === "centralized") {
    // Crypto collateral under a central issuer: volatile reserves, lighter hull.
    if (backing === "crypto-backed") {
      return {
        hull: "chartered-brigantine",
        label: GOVERNANCE_LABELS_SHORT.centralized,
      };
    }
    return {
      hull: "treasury-galleon",
      label: GOVERNANCE_LABELS_SHORT.centralized,
    };
  }

  if (governance === "centralized-dependent") {
    // A NAV share over real paper is a fund in a hull — BUIDL, USYC. A NAV
    // share over crypto collateral (sUSDe) is still a synthetic, and stays on
    // the lighter chartered hull.
    if (navToken && realWorldBacked) {
      return {
        hull: "treasury-galleon",
        label: GOVERNANCE_LABELS_SHORT["centralized-dependent"],
      };
    }
    return {
      hull: "chartered-brigantine",
      label: GOVERNANCE_LABELS_SHORT["centralized-dependent"],
    };
  }

  if (governance === "decentralized") {
    // A DAO that holds real paper AND pays it out is running a treasury, not a
    // lean protocol — it earns the merchant hull.
    if (realWorldBacked && yieldBearing) {
      return {
        hull: "treasury-galleon",
        label: GOVERNANCE_LABELS_SHORT.decentralized,
      };
    }
    return {
      hull: "dao-schooner",
      label: GOVERNANCE_LABELS_SHORT.decentralized,
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

/**
 * N5(a): the ship's proportions, derived from what the stablecoin is.
 *
 * Traits set the signal; a deterministic per-id jitter breaks ties so two coins
 * with identical flags still read as two different vessels rather than one hull
 * stamped twice. Everything is clamped into `SHIP_HULL_FORM_SPAN`, which is
 * sized so a deformed hull cannot self-intersect or overflow its berth.
 *
 * The mappings are meant to be legible on the water, not merely encoded:
 * - beam is stability, so peg health widens or narrows the hull;
 * - height is freeboard, so real reserves ride high and thin ones sit low;
 * - length is reach, so yield-bearing and NAV carriers run longer.
 */
const PEG_GRADE_STIFFNESS: Record<string, number> = {
  A: 0.16, B: 0.09, C: 0, D: -0.1, F: -0.17,
};

function resolveShipHullForm(
  asset: StablecoinData,
  meta: StablecoinMeta,
  reportCard: ReportCard | null,
): ShipHullForm {
  const flags = meta.flags;
  const clamp = (value: number): number => Math.min(
    1 + SHIP_HULL_FORM_SPAN,
    Math.max(1 - SHIP_HULL_FORM_SPAN, value),
  );
  // Two independent jitter channels off one hash, so length and beam do not
  // move together and produce a fleet of scaled copies.
  const hash = stableFnv1aHash(asset.id);
  const jitter = (shift: number): number => (
    (((hash >>> shift) & 0xff) / 255 - 0.5) * 2
  );

  let length = 1;
  if (flags?.yieldBearing) length += 0.14;
  if (flags?.navToken) length += 0.08;
  if (flags?.backing === "crypto-backed") length -= 0.07;

  let beam = 1 + (PEG_GRADE_STIFFNESS[reportCard?.overallGrade ?? ""] ?? 0);
  if (flags?.backing === "rwa-backed") beam += 0.06;

  let height = 1;
  if (flags?.rwa) height += 0.1;
  if (flags?.backing === "algorithmic") height -= 0.18;
  if (flags?.yieldBearing) height += 0.05;

  return {
    beam: clamp(beam + jitter(8) * 0.09),
    height: clamp(height + jitter(16) * 0.08),
    length: clamp(length + jitter(0) * 0.1),
  };
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
  return {
    hull: shipClass.hull,
    ...(uniqueDef ? { uniqueRationale: uniqueDef.rationale } : {}),
    classLabel: shipClass.label,
    livery: branding,
    sailColor: branding.sailColor,
    overlay: meta.flags.navToken ? "nav" : meta.flags.yieldBearing ? "yield" : reportCard?.overallGrade === "D" || reportCard?.overallGrade === "F" ? "watch" : "none",
    sizeTier: titan ? "titan" : uniqueDef ? "unique" : size.tier,
    sizeLabel: titan ? "Titan" : uniqueDef ? "Heritage hull" : size.label,
    scale: titan?.scale ?? uniqueDef?.scale ?? size.scale,
  };
}

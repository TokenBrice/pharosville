/**
 * Heritage-tier ("unique") ship registry: maps a stablecoin asset id to its
 * cultural-significance rationale and the render scale that places its Three
 * hero hull between standard and titan tiers.
 *
 * Cross-file contracts:
 * - `systems/ship-visuals.ts` calls `uniqueDefinitionFor` — when a definition
 *   exists and the asset has no titan definition, it stamps `sizeTier: "unique"`,
 *   `sizeLabel: "Heritage hull"`, and uses `definition.scale` as the ship's
 *   render scale.
 * - Runtime ship visuals use the tier, scale, and definition metadata to keep
 *   heritage vessels distinct from standard and titan ships.
 * - `three/garden-ships.ts` calls `heroHullModelFor`; only the eight named
 *   titans receive GLBs, while every other ship joins the procedural batch.
 *
 * Risk areas: scale must sit in the band ~1.20–1.32 (between standard and
 * titan); pushing higher visually competes with titans and starves layout,
 * lower drops below standard hull readability.
 */

import type { StablecoinData } from "@shared/types";

export interface UniqueShipDefinition {
  rationale: string;
  scale: number;
}

export const UNIQUE_SHIP_DEFINITIONS = {
  "crvusd-curve":       { rationale: "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.", scale: 1.28 },
  "bold-liquity":       { rationale: "Spartan crest hull — Liquity's stance on credibly neutral decentralization.", scale: 1.23 },
  "fxusd-f-x-protocol": { rationale: "Mathematical livery — f(x) Protocol's analytic identity.", scale: 1.23 },
  "xaut-tether":        { rationale: "Bullion barge — Tether's gold treasury reserve.", scale: 1.28 },
  "paxg-paxos":         { rationale: "Gilded merchantman — Paxos institutional gold custody.", scale: 1.32 },
  "usyc-hashnote":      { rationale: "Yield-bearing tokenised treasury vessel — Hashnote's institutional cash carrier.", scale: 1.20 },
  // W5.2 (decision D4/O11): the 24 largest stablecoins all carry a hero hull.
  // The twelve titans are covered by `TITAN_SHIPS`; these eleven close the gap.
  "usdf-falcon":        { rationale: "Overcollateralized synthetic runner — Falcon's universal collateral engine.", scale: 1.30 },
  "usdg-paxos":         { rationale: "Consortium hull — the Global Dollar Network's regulated issuance.", scale: 1.28 },
  "rlusd-ripple":       { rationale: "Settlement packet — Ripple's bank-facing cross-border rails.", scale: 1.28 },
  "usdy-ondo-finance":  { rationale: "Tokenised note carrier — Ondo's yield-bearing treasury exposure.", scale: 1.27 },
  "usdd-tron-dao-reserve": { rationale: "Reserve-backed hull rebuilt after its algorithmic first life.", scale: 1.26 },
  "usdtb-ethena":       { rationale: "Custodied sibling to Ethena's synthetic fleet — reserves, not basis trade.", scale: 1.25 },
  "m-m0":               { rationale: "Shared-issuance keel — M0's minting substrate under other people's brands.", scale: 1.24 },
  "u-united-stables":   { rationale: "Aggregating hull — United Stables routes across issuers rather than minting.", scale: 1.24 },
  "usdai-usd-ai":       { rationale: "Compute-collateralised hull — USD.AI lends against GPU hardware.", scale: 1.23 },
  "susdai-usd-ai":      { rationale: "Staked sibling of the compute-collateralised hull.", scale: 1.21 },
  "usd0-usual":         { rationale: "RWA-backed hull with governance-distributed yield — Usual's model.", scale: 1.22 },
} as const satisfies Record<string, UniqueShipDefinition>;

export function uniqueDefinitionFor(asset: Pick<StablecoinData, "id">): UniqueShipDefinition | null {
  return UNIQUE_SHIP_DEFINITIONS[asset.id as keyof typeof UNIQUE_SHIP_DEFINITIONS] ?? null;
}

/**
 * The eight named-titan hull GLBs, kept as bare string literals so the systems
 * layer stays free of renderer imports. `unique-ships.test.ts` asserts this
 * list agrees with the model manifest.
 */
export const HERO_HULL_MODEL_IDS = [
  "garden-hero-tether",
  "garden-hero-circle",
  "garden-hero-maker",
  "garden-hero-sky",
  "garden-hero-ethena",
  "garden-hero-liberty",
  "garden-hero-paypal",
  "garden-hero-bullion",
] as const;

/**
 * N5(b): the bespoke hulls. Each belongs to exactly one stablecoin and is
 * never handed out by the hash fallback — that is what makes them bespoke.
 * `BESPOKE_HULL_OWNER` is the inverse of the assignments below and exists so
 * the unit tests can assert the exclusivity rather than trusting the table.
 */
export const BESPOKE_HULL_OWNER: Readonly<Record<string, string>> = {
  "garden-hero-tether": "usdt-tether",
  "garden-hero-circle": "usdc-circle",
  "garden-hero-maker": "dai-makerdao",
  "garden-hero-sky": "usds-sky",
  "garden-hero-ethena": "usde-ethena",
  "garden-hero-liberty": "usd1-world-liberty-financial",
  "garden-hero-paypal": "pyusd-paypal",
  "garden-hero-bullion": "xaut-tether",
};

export type HeroHullModelId = typeof HERO_HULL_MODEL_IDS[number];

/**
 * Coin -> named-titan hull. All non-named titans and heritage ships are
 * intentionally absent: `heroHullModelFor` returns null for them so they use
 * the procedural fleet family already assigned by the observatory slice.
 */
export const HERO_HULL_BY_ASSET: Readonly<Record<string, HeroHullModelId>> = {
  // N5(b) bespoke titans: one hull, one coin, no sharing.
  "usdt-tether": "garden-hero-tether",
  "usdc-circle": "garden-hero-circle",
  "dai-makerdao": "garden-hero-maker",
  "usds-sky": "garden-hero-sky",
  "usde-ethena": "garden-hero-ethena",
  "usd1-world-liberty-financial": "garden-hero-liberty",
  "pyusd-paypal": "garden-hero-paypal",
  // W5 (decision D6): XAUT gets its own hull. It shared the generic treasury
  // galleon with BUIDL, which is why it was the one named titan a viewer could
  // not recognise — it was not its own ship.
  "xaut-tether": "garden-hero-bullion",
};

/**
 * Resolves a named titan's bespoke hull. A null result deliberately routes
 * every ordinary hero-tier coin through the procedural fleet batch.
 */
export function heroHullModelFor(assetId: string): HeroHullModelId | null {
  return HERO_HULL_BY_ASSET[assetId] ?? null;
}

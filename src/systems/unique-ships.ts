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
 * - `three/garden-ships.ts` calls `heroHullModelFor` to pick which of the ten
 *   hero hull GLBs a titan or heritage ship sails.
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
 * Every hero hull GLB, in the authoring order of
 * `scripts/pharosville/generate-garden-heroes.mjs`: ten shared hulls, then the
 * seven bespoke titan hulls (N5(b)). Kept as bare string literals rather than
 * imported from `three/garden-models.ts` so the systems layer stays free of
 * renderer imports; `unique-ships.test.ts` asserts the two lists agree.
 */
export const HERO_HULL_MODEL_IDS = [
  "garden-hero-titan",
  "garden-hero-heritage",
  "garden-hero-carrack",
  "garden-hero-brigantine",
  "garden-hero-dhow",
  "garden-hero-junk",
  "garden-hero-barquentine",
  "garden-hero-cog",
  "garden-hero-xebec",
  "garden-hero-cutter",
  "garden-hero-tether",
  "garden-hero-circle",
  "garden-hero-maker",
  "garden-hero-sky",
  "garden-hero-ethena",
  "garden-hero-liberty",
  "garden-hero-paypal",
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
};

export type HeroHullModelId = typeof HERO_HULL_MODEL_IDS[number];

/**
 * Coin -> hero hull. An explicit table, not a hash of market cap or rank, so a
 * stablecoin can never change ship between refreshes: rank moves, this does
 * not. Siblings of the same issuer share a hull on purpose — a staked variant
 * reading as the same vessel as its parent is information, not repetition.
 *
 * Covers the 24 largest stablecoins plus the heritage hulls that sit outside
 * that band. Anything else that reaches titan or heritage tier falls through
 * to `heroHullModelFor`'s deterministic hash, which is also stable per id.
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
  // Treasury galleon — the treasure fleet: reserves held, not strategies run.
  "buidl-blackrock": "garden-hero-titan",
  "xaut-tether": "garden-hero-titan",
  // War carrack — the regulated fortresses.
  "usdg-paxos": "garden-hero-carrack",
  "paxg-paxos": "garden-hero-carrack",
  // Xebec — fast, lean, synthetic. susde stays on the shared xebec: the
  // staked wrapper is a sibling of the basis runner, not a second bespoke.
  "susde-ethena": "garden-hero-xebec",
  "usdtb-ethena": "garden-hero-xebec",
  "fxusd-f-x-protocol": "garden-hero-xebec",
  // Barquentine — the rest of the Sky fleet trails the squadron flagship.
  "susds-sky": "garden-hero-barquentine",
  "stusds-sky": "garden-hero-barquentine",
  // Cog — the elders, and the minimalists.
  "sdai-sky": "garden-hero-cog",
  "bold-liquity": "garden-hero-cog",
  // Tea clipper — the fast institutional carriers.
  "rlusd-ripple": "garden-hero-heritage",
  // Junk — reserve-backed hulls outside the western issuance stack.
  "usdd-tron-dao-reserve": "garden-hero-junk",
  // Brigantine — the collateral engines.
  "usdf-falcon": "garden-hero-brigantine",
  "usd0-usual": "garden-hero-brigantine",
  "u-united-stables": "garden-hero-brigantine",
  "crvusd-curve": "garden-hero-brigantine",
  // Dhow — the tokenised-yield trade routes.
  "usyc-hashnote": "garden-hero-dhow",
  "usdy-ondo-finance": "garden-hero-dhow",
  // Cutter — small, sharp, single-purpose.
  "m-m0": "garden-hero-cutter",
  "usdai-usd-ai": "garden-hero-cutter",
  "susdai-usd-ai": "garden-hero-cutter",
};

/**
 * Resolves the hero hull a titan or heritage ship sails. Pure and total: the
 * explicit table first, then a seeded FNV-1a hash of the asset id, so an
 * unlisted hero-tier coin still gets the same hull on every refresh and in
 * every session.
 */
export function heroHullModelFor(assetId: string): HeroHullModelId {
  const assigned = HERO_HULL_BY_ASSET[assetId];
  if (assigned !== undefined) return assigned;

  let hash = 0x811c9dc5;
  for (let index = 0; index < assetId.length; index += 1) {
    hash ^= assetId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return SHARED_HERO_HULL_IDS[hash % SHARED_HERO_HULL_IDS.length];
}

/**
 * The fallback pool. Bespoke titan hulls are excluded on purpose: without this
 * filter an unlisted coin could hash onto `garden-hero-tether` and sail USDT's
 * one-of-a-kind vessel, which would quietly destroy the thing N5(b) exists to
 * create.
 */
const SHARED_HERO_HULL_IDS: readonly HeroHullModelId[] = HERO_HULL_MODEL_IDS
  .filter((id) => BESPOKE_HULL_OWNER[id] === undefined);

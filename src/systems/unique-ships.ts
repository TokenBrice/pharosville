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
} as const satisfies Record<string, UniqueShipDefinition>;

export function uniqueDefinitionFor(asset: Pick<StablecoinData, "id">): UniqueShipDefinition | null {
  return UNIQUE_SHIP_DEFINITIONS[asset.id as keyof typeof UNIQUE_SHIP_DEFINITIONS] ?? null;
}

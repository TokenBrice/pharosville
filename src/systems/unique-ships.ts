/**
 * Heritage-tier ("unique") ship registry: maps a stablecoin asset id to its
 * dedicated 136×100 PixelLab sprite, a per-ship cultural-significance
 * rationale, and the render scale that places the hull between standard and
 * titan tiers.
 *
 * Cross-file contracts:
 * - `systems/ship-visuals.ts` calls `uniqueDefinitionFor` — when a definition
 *   exists and the asset has no titan sprite, it stamps `sizeTier: "unique"`,
 *   `sizeLabel: "Heritage hull"`, and uses `definition.scale` as the ship's
 *   render scale.
 * - `renderer/layers/ships.ts` reads `UNIQUE_SPRITE_IDS` to skip titan-only
 *   chrome (foam, spray, full pose, sail flutter) on heritage hulls.
 *
 * Risk areas: scale must sit in the band ~1.20–1.32 (between standard and
 * titan); pushing higher visually competes with titans and starves layout,
 * lower drops below standard hull readability. Adding a new entry without a
 * matching `ship.<id>-unique` sprite asset will silently fall back to default.
 */

import type { StablecoinData } from "@shared/types";

export interface UniqueShipDefinition {
  spriteAssetId: string;
  rationale: string;
  scale: number;
}

export const UNIQUE_SHIP_DEFINITIONS = {
  "crvusd-curve":       { spriteAssetId: "ship.crvusd-unique", rationale: "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.", scale: 1.28 },
  "bold-liquity":       { spriteAssetId: "ship.bold-unique",   rationale: "Spartan crest hull — Liquity's stance on credibly neutral decentralization.",    scale: 1.23 },
  "fxusd-f-x-protocol": { spriteAssetId: "ship.fxusd-unique",  rationale: "Mathematical livery — f(x) Protocol's analytic identity.",                       scale: 1.23 },
  "xaut-tether":        { spriteAssetId: "ship.xaut-unique",   rationale: "Bullion barge — Tether's gold treasury reserve.",                                scale: 1.28 },
  "paxg-paxos":         { spriteAssetId: "ship.paxg-unique",   rationale: "Gilded merchantman — Paxos institutional gold custody.",                         scale: 1.32 },
  "usyc-hashnote":      { spriteAssetId: "ship.usyc-unique",   rationale: "Yield-bearing tokenised treasury vessel — Hashnote's institutional cash carrier.", scale: 1.20 },
} as const satisfies Record<string, UniqueShipDefinition>;

export const UNIQUE_SPRITE_IDS: ReadonlySet<string> = new Set(
  Object.values(UNIQUE_SHIP_DEFINITIONS).map((d) => d.spriteAssetId),
);

export function uniqueDefinitionFor(asset: Pick<StablecoinData, "id">): UniqueShipDefinition | null {
  return UNIQUE_SHIP_DEFINITIONS[asset.id as keyof typeof UNIQUE_SHIP_DEFINITIONS] ?? null;
}

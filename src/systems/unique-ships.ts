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
} as const satisfies Record<string, UniqueShipDefinition>;

export const UNIQUE_SPRITE_IDS: ReadonlySet<string> = new Set(
  Object.values(UNIQUE_SHIP_DEFINITIONS).map((d) => d.spriteAssetId),
);

export function uniqueDefinitionFor(asset: Pick<StablecoinData, "id">): UniqueShipDefinition | null {
  return UNIQUE_SHIP_DEFINITIONS[asset.id as keyof typeof UNIQUE_SHIP_DEFINITIONS] ?? null;
}

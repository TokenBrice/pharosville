// Two stablecoin squads sail in fixed formation: Sky (USDS flagship + sUSDS +
// stUSDS) and Maker (DAI flagship + sDAI). Each squad shares its flagship's
// risk placement and motion route; consorts snap to a placement-aware
// formation offset around the flagship's tile.

export type SquadId = "sky" | "maker" | "ethena";
export type SquadRole = "flagship" | "consort";

export interface StablecoinSquad {
  readonly id: SquadId;
  readonly label: string;
  readonly flagshipId: string;
  readonly memberIds: readonly string[];
  readonly displayOrder: readonly string[];
  readonly formationOffsets: Readonly<Record<string, { dx: number; dy: number }>>;
}

// Sky squad — issuance + savings + risk-capital module.
// stUSDS leads as risk-capital icebreaker (vanguard, dy=-3).
// sUSDS flanks starboard-forward as the savings cutter.
export const SKY_SQUAD: StablecoinSquad = {
  id: "sky",
  label: "Sky",
  flagshipId: "usds-sky",
  memberIds: ["usds-sky", "stusds-sky", "susds-sky"],
  displayOrder: ["usds-sky", "stusds-sky", "susds-sky"],
  formationOffsets: {
    "usds-sky": { dx: 0, dy: 0 },
    "stusds-sky": { dx: 0, dy: -3 },
    "susds-sky": { dx: 2, dy: -2 },
  },
};

// Maker squad — eldest CDP stable + its savings vault.
// sDAI flanks port-forward as savings cutter mirroring sUSDS.
export const MAKER_SQUAD: StablecoinSquad = {
  id: "maker",
  label: "Maker",
  flagshipId: "dai-makerdao",
  memberIds: ["dai-makerdao", "sdai-sky"],
  displayOrder: ["dai-makerdao", "sdai-sky"],
  formationOffsets: {
    "dai-makerdao": { dx: 0, dy: 0 },
    "sdai-sky": { dx: -2, dy: -2 },
  },
};

// Ethena squad — synthetic dollar + its staked savings vault, mirroring
// the Maker DAI/sDAI shape.
export const ETHENA_SQUAD: StablecoinSquad = {
  id: "ethena",
  label: "Ethena",
  flagshipId: "usde-ethena",
  memberIds: ["usde-ethena", "susde-ethena"],
  displayOrder: ["usde-ethena", "susde-ethena"],
  formationOffsets: {
    "usde-ethena": { dx: 0, dy: 0 },
    "susde-ethena": { dx: -2, dy: -2 },
  },
};

export const STABLECOIN_SQUADS: readonly StablecoinSquad[] = [SKY_SQUAD, MAKER_SQUAD, ETHENA_SQUAD];

const SQUAD_BY_MEMBER: ReadonlyMap<string, StablecoinSquad> = new Map(
  STABLECOIN_SQUADS.flatMap((squad) => squad.memberIds.map((id) => [id, squad] as const)),
);

export const STABLECOIN_SQUAD_MEMBER_IDS: readonly string[] = STABLECOIN_SQUADS.flatMap(
  (squad) => squad.memberIds,
);

export function squadForMember(id: string): StablecoinSquad | null {
  return SQUAD_BY_MEMBER.get(id) ?? null;
}

export function isSquadMember(id: string): boolean {
  return SQUAD_BY_MEMBER.has(id);
}

export function squadRole(id: string): SquadRole | null {
  const squad = squadForMember(id);
  if (!squad) return null;
  return id === squad.flagshipId ? "flagship" : "consort";
}

// Tight placements (small water pockets) halve the formation toward the flagship
// so consorts don't spill outside the placement's water set.
export const TIGHT_PLACEMENT_IDS: ReadonlySet<string> = new Set(["storm-shelf", "harbor-mouth-watch"]);

export function squadFormationOffsetForPlacement(
  id: string,
  squad: StablecoinSquad,
  placement: string,
): { dx: number; dy: number } | null {
  const base = squad.formationOffsets[id];
  if (!base) return null;
  if (!TIGHT_PLACEMENT_IDS.has(placement)) return base;
  return { dx: Math.trunc(base.dx / 2), dy: Math.trunc(base.dy / 2) };
}

export function formationLabel(id: string, role: SquadRole, symbol: string): string {
  if (role === "flagship") return `${symbol} (flagship)`;
  if (id === "stusds-sky") return `${symbol} (vanguard)`;
  return symbol;
}

// Backwards-compat aliases — preserved for the Sky squad's flagship/membership
// API used by existing tests and DOM helpers. New code should prefer
// `squadForMember()` and the squad objects directly.
export const MAKER_SQUAD_FLAGSHIP_ID = SKY_SQUAD.flagshipId;
export const MAKER_SQUAD_MEMBER_IDS: readonly string[] = STABLECOIN_SQUAD_MEMBER_IDS;

export function isMakerSquadMember(id: string): boolean {
  return isSquadMember(id);
}

export function makerSquadRole(id: string): SquadRole | null {
  return squadRole(id);
}

export function makerSquadFormationOffsetForPlacement(
  id: string,
  placement: string,
): { dx: number; dy: number } {
  const squad = squadForMember(id);
  if (!squad) return { dx: 0, dy: 0 };
  return squadFormationOffsetForPlacement(id, squad, placement) ?? { dx: 0, dy: 0 };
}

// Display order across both squads, used by accessibility ledger fallback.
export function makerSquadFormationOrder(): readonly string[] {
  return STABLECOIN_SQUADS.flatMap((squad) => squad.displayOrder);
}

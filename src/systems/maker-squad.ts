export const MAKER_SQUAD_FLAGSHIP_ID = "usds-sky" as const;

export const MAKER_SQUAD_MEMBER_IDS = [
  "usds-sky",
  "dai-makerdao",
  "susds-sky",
  "sdai-sky",
  "stusds-sky",
] as const;

export type MakerSquadMemberId = (typeof MAKER_SQUAD_MEMBER_IDS)[number];
export type MakerSquadRole = "flagship" | "consort";

const MEMBER_SET: ReadonlySet<string> = new Set(MAKER_SQUAD_MEMBER_IDS);

export function isMakerSquadMember(id: string): id is MakerSquadMemberId {
  return MEMBER_SET.has(id);
}

export function makerSquadRole(id: string): MakerSquadRole | null {
  if (id === MAKER_SQUAD_FLAGSHIP_ID) return "flagship";
  if (MEMBER_SET.has(id)) return "consort";
  return null;
}

// Formation in flagship-local tile coordinates (camera-up = -y).
// stUSDS leads as risk-capital icebreaker (vanguard, dy = -3).
// Savings cutters flank the flagship forward of parent stables.
// Flagship sits centre; DAI flanks port-aft as elder consort.
const FORMATION_OFFSETS: Record<MakerSquadMemberId, { dx: number; dy: number }> = {
  "usds-sky": { dx: 0, dy: 0 },
  "stusds-sky": { dx: 0, dy: -3 },
  "susds-sky": { dx: 2, dy: -2 },
  "sdai-sky": { dx: -2, dy: -2 },
  "dai-makerdao": { dx: -2, dy: 2 },
};

export function makerSquadFormationOffset(id: MakerSquadMemberId): { dx: number; dy: number } {
  return FORMATION_OFFSETS[id];
}

// Tight placements (small water pockets) halve the formation toward the flagship.
export const TIGHT_PLACEMENT_IDS = new Set(["storm-shelf", "harbor-mouth-watch"]);

export function makerSquadFormationOffsetForPlacement(
  id: MakerSquadMemberId,
  placement: string,
): { dx: number; dy: number } {
  const base = FORMATION_OFFSETS[id];
  if (!TIGHT_PLACEMENT_IDS.has(placement)) return base;
  return { dx: Math.trunc(base.dx / 2), dy: Math.trunc(base.dy / 2) };
}

// Listing order in DOM/detail-panel formation lines:
// flagship, vanguard, savings cutters (port then starboard by symbol order), DAI port-aft.
const FORMATION_DISPLAY_ORDER: readonly MakerSquadMemberId[] = [
  "usds-sky",
  "stusds-sky",
  "susds-sky",
  "sdai-sky",
  "dai-makerdao",
];

export function makerSquadFormationOrder(): readonly MakerSquadMemberId[] {
  return FORMATION_DISPLAY_ORDER;
}

export function formationLabel(id: string, role: MakerSquadRole, symbol: string): string {
  if (role === "flagship") return `${symbol} (flagship)`;
  if (id === "stusds-sky") return `${symbol} (vanguard)`;
  return symbol;
}

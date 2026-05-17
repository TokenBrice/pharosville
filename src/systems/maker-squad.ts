/**
 * Stablecoin squad model: small fleets of related stablecoins that sail in a
 * shared formation, inheriting risk placement and motion route from their
 * flagship.
 *
 * Three squads live here today: Sky (USDS flagship + sUSDS + stUSDS), Maker
 * (DAI flagship + sDAI), and Ethena (USDe flagship + sUSDe). A squad
 * activates iff its flagship is in `activeAssets`; consorts then snap to a
 * placement-aware formation offset around the flagship's tile.
 *
 * Cross-file contracts:
 * - `motion-planning.ts` and `ship-placement.ts` consume `flagshipId` /
 *   `memberIds` to clone routes and place consorts.
 * - The navToken → `ledger-mooring` short-circuit is OVERRIDDEN for any
 *   consort whose flagship is active — see `pharosville-world.ts`.
 * - `renderer/layers/maker-squad-chrome.ts` paints per-squad bunting and
 *   selection halos; identifying a member uses `squadForMember`.
 *
 * Risk areas: changing `formationOffsets` shifts visual alignment but also
 * collision footprint with the harbor; `displayOrder` controls render z-order
 * within the squad and indirectly the chrome stacking.
 *
 * See `docs/pharosville/CURRENT.md` for the broader squad narrative.
 */

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

// ---------------------------------------------------------------------------
// W4.24 — Squad formation gain
// ---------------------------------------------------------------------------
//
// Multiplies the consort {dx, dy} offset based on the flagship's current
// state and zone so squads visibly fan out during calm cruising and collapse
// into single-file during arrival approaches. Tight-placement consorts
// (storm-shelf / harbor-mouth-watch) keep their halved offset by clamping
// the gain at 1.0 — never expanding beyond what
// `squadFormationOffsetForPlacement` already considered safe.

export type SquadFormationFlagshipState =
  | "idle"
  | "moored"
  | "departing"
  | "sailing"
  | "risk-drift"
  | "arriving";

export const SQUAD_FORMATION_GAIN_CALM_CRUISING = 1.4;
export const SQUAD_FORMATION_GAIN_ARRIVING = 0.55;
export const SQUAD_FORMATION_GAIN_DEFAULT = 1.0;
const SQUAD_FORMATION_CALM_SPEED_THRESHOLD_TILES_PER_SECOND = 0.01;

/**
 * W4.24 — gain factor multiplied into the consort's {dx, dy} offset.
 *
 *   - flagship arriving → 0.55 (single-file approach so consorts queue behind)
 *   - flagship cruising the calm zone → 1.4 (fan out for the wide-anchor look)
 *   - otherwise → 1.0
 *
 * Tight placements (`storm-shelf` / `harbor-mouth-watch`) keep the existing
 * halved offset — they never fan beyond 1.0 so consorts can't spill out of
 * the small water pocket the placement guarantees.
 */
export function formationGain(input: {
  zone: string;
  flagshipSpeed: number;
  flagshipState: SquadFormationFlagshipState;
  placement: string;
}): number {
  const isTight = TIGHT_PLACEMENT_IDS.has(input.placement);
  if (input.flagshipState === "arriving") {
    return isTight
      ? Math.min(SQUAD_FORMATION_GAIN_ARRIVING, SQUAD_FORMATION_GAIN_DEFAULT)
      : SQUAD_FORMATION_GAIN_ARRIVING;
  }
  if (
    input.zone === "calm"
    && input.flagshipState === "sailing"
    && input.flagshipSpeed > SQUAD_FORMATION_CALM_SPEED_THRESHOLD_TILES_PER_SECOND
  ) {
    return isTight ? SQUAD_FORMATION_GAIN_DEFAULT : SQUAD_FORMATION_GAIN_CALM_CRUISING;
  }
  return SQUAD_FORMATION_GAIN_DEFAULT;
}

// ---------------------------------------------------------------------------
// W4.24 — Lagged consort heading
// ---------------------------------------------------------------------------
//
// Time constant matching the task spec: 0.6s lerp toward the flagship's
// heading. Per-sample callers convert dt into an alpha via:
//   alpha = 1 - exp(-dt / TAU)
// and the standard component-lerp + renormalize pattern used elsewhere in
// motion-sampling. Exposed as a constant + helper so tests can verify the
// time constant without poking the sampler internals.

export const SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS = 0.6;

export function squadConsortHeadingLerpAlpha(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  if (deltaSeconds >= 10 * SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS) return 1;
  return 1 - Math.exp(-deltaSeconds / SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS);
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

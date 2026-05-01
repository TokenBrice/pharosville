# USDS Titan Squad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform USDS from a lone titan into the flagship of a five-ship Sky/Maker squad (USDS + DAI + sUSDS + stUSDS + sDAI) that sails together at all times, with titan-tier dedicated sprites and lore-accurate formation chrome.

**Architecture:** Introduce a `squad` concept in the world model. The squad has one flagship (USDS) and four consorts (DAI, sUSDS, stUSDS, sDAI). Risk placement and motion routing are computed once at the flagship, then propagated to consorts as fixed formation offsets — overriding the navToken→ledger-mooring split for squad members. All five remain individually selectable ships (preserving DOM/detail parity). The renderer extends the existing `TITAN_SPRITE_IDS` machinery to all five hulls and adds squad-only chrome (formation pennant line, shared selection halo).

**Tech Stack:** TypeScript, Vite, React, Canvas 2D, Vitest, Playwright visual snapshots, PixelLab MCP for sprite generation.

**Out of scope (do NOT do here):**
- Changing peg/risk-band methodology, scoring thresholds, or DEWS semantics
- Touching API/Pages Function or shared/contract code
- Adding squad concepts for non-Maker stables (Frax/Circle/Tether stay as-is)
- Mobile/responsive changes; desktop gate is preserved

---

## Lore & Visual Design Rationale

The squad maps to Maker's actual capital structure, not just branding:

| Hull               | Asset    | Scale | Position             | Lore                                                                       |
|--------------------|----------|-------|----------------------|----------------------------------------------------------------------------|
| `usds-titan`       | USDS     | 1.7   | Flagship (centre)    | Upgraded DAI, current Sky issuance helm; carries the admiral's banner.     |
| `dai-titan`        | DAI      | 1.55  | Veteran consort (port-aft) | Eldest CDP stable, 1:1 swappable with USDS; weathered hull patches read as elder. |
| `susds-titan`      | sUSDS    | 1.35  | Savings cutter (stbd-fwd, downstream) | ERC-4626 SSR vault over USDS; agile derivative riding off the flagship's wake. |
| `sdai-titan`       | sDAI     | 1.35  | Savings cutter (port-fwd, downstream) | ERC-4626 DSR vault over DAI; mirrors sUSDS, derived from the elder.        |
| `stusds-titan`     | stUSDS   | 1.45  | Vanguard / icebreaker (forward) | Sky's risk-capital module; absorbs slashing & bad debt — leads from the front, taking first impact. Forge-glow at hull joints. |

Visual identity:
- Sky palette (deep navy `#19284a` + amber `#e1893e`) drives flagship + savings cutters.
- Maker palette (classic crimson `#a23a36` + cream `#f4eedc`) keeps DAI distinct as the elder hull.
- stUSDS uses a darker iron livery (`#4a3a2c`) with copper-trimmed gunwales and a low forge-glow at hull joints to telegraph its loss-absorbing role.
- **Shared squad accent:** every hull carries the same warm brass lantern at the masthead and the same amber mooring-line color. This is the unifying device that prevents the two palette families reading as two factions.
- **Admiral's banner** flies from USDS's mainmast only — a single distinct masthead pennant marking the squad lead.
- **Synchronised wake:** all five share a route, so wake foam overlaps into one interference pattern — read in the renderer as a single "squad wake" rather than five independents.
- **Formation pennant** is a continuous golden bunting/streamer rendered in **world-space wake-layer geometry**: catenary-sagged between mast tops, bobbing with each hull's pose. Not a screen-space dashed line.
- **Squad-wide selection halo:** any squad member's selection adds a soft, low-alpha amber bounding ring around the whole formation. The per-ship `drawSelectedShipOutline` still fires on the actually-clicked hull — the halo is **secondary chrome**, thinner and lower-alpha than the per-ship ring.

**Symbolism notes (for reviewers):**
- Savings vaults (`sUSDS`, `sDAI`) sit *forward of* their parent stables (`USDS`, `DAI`). This is deliberate: vaults are downstream products, so they appear "downstream" in the diorama's reading order. Acknowledge as a stylistic choice, not a nautical convention.
- stUSDS leading the formation reverses standard naval line-of-battle. Justified: risk capital takes the first hit, so it visually fronts the squad. The forge-glow + dark iron livery sells "icebreaker," not "straggler."

The formation reads as one diorama element from camera distance but resolves into five interactive ships up close.

---

## File Structure

**New files:**
- `src/systems/maker-squad.ts` — pure squad model (constants, formation offsets, flagship/consort identification, navToken-override logic)
- `src/systems/maker-squad.test.ts` — unit tests for the squad model
- `src/renderer/layers/maker-squad-chrome.ts` — squad-only chrome (formation pennant, shared selection halo)
- `src/renderer/layers/maker-squad-chrome.test.ts` — pure-geometry tests for the chrome helpers

**Modified files:**
- `src/systems/world-types.ts` — add `squadId?: "maker"`, `squadRole?: "flagship" | "consort"` to `ShipNode`; add `squadOverride?: boolean` to `PlacementEvidence`.
- `src/systems/risk-placement.ts` — squad consorts inherit the flagship's placement; expose a placement-severity helper.
- `src/systems/pharosville-world.ts` — squad members co-locate via formation offsets, bypass per-ship spread; flagship-missing semantics deactivate the squad cleanly.
- `src/systems/motion-planning.ts` — consort routes derive from flagship route + formation offset, with placement-scoped water clamping; consort `dockVisits === []` and `homeDockId === null`.
- `src/systems/ship-visuals.ts` — extend `TITAN_SHIP_ASSET_IDS` and `TITAN_SHIP_SCALES` to all five Maker hulls.
- `src/renderer/layers/ships.ts` — extend `TITAN_SPRITE_IDS` and **all four** per-titan offset tables (`SHIP_SAIL_MARKS`, `SHIP_PEG_MARKS`, `SHIP_TRIM_MARKS`, `SHIP_SAIL_TINT_MASKS`); add identity accents (admiral's banner, forge-glow, weathered patches); render flagship wake before consort wakes for synchronised interference.
- `src/renderer/world-canvas.ts` — wire squad chrome (pennant + halo) into the ships pass.
- `public/pharosville/assets/manifest.json` — register four new titan sprite assets with full field set; mark dai/stusds as critical; update critical-asset list at line ~41; bump `style.cacheVersion`.
- `public/pharosville/assets/ships/*.png` — four new sprite pairs (single + 4-frame strip) generated via PixelLab MCP.
- `docs/pharosville/CURRENT.md` — document the squad invariant.
- `docs/pharosville-page.md` — surface the squad in the route contract.

**Test files:**
- `src/systems/maker-squad.test.ts` (new)
- `src/renderer/layers/maker-squad-chrome.test.ts` (new)
- `src/systems/pharosville-world.test.ts` — add squad invariants
- `src/systems/motion.test.ts` — add formation-cohesion test
- `tests/visual/pharosville.spec.ts` — re-bake the relevant baselines after sprites land

---

## Task 1: Squad model — pure data

**Files:**
- Create: `src/systems/maker-squad.ts`
- Create: `src/systems/maker-squad.test.ts`

- [ ] **Step 1: Write failing tests for the squad model**

```typescript
// src/systems/maker-squad.test.ts
import { describe, expect, it } from "vitest";
import {
  MAKER_SQUAD_FLAGSHIP_ID,
  MAKER_SQUAD_MEMBER_IDS,
  isMakerSquadMember,
  makerSquadFormationOffset,
  makerSquadRole,
} from "./maker-squad";

describe("maker-squad", () => {
  it("has USDS as flagship and four consorts", () => {
    expect(MAKER_SQUAD_FLAGSHIP_ID).toBe("usds-sky");
    expect(MAKER_SQUAD_MEMBER_IDS).toHaveLength(5);
    expect(MAKER_SQUAD_MEMBER_IDS).toEqual(
      expect.arrayContaining(["usds-sky", "dai-makerdao", "susds-sky", "sdai-sky", "stusds-sky"]),
    );
  });

  it("identifies members and non-members", () => {
    expect(isMakerSquadMember("usds-sky")).toBe(true);
    expect(isMakerSquadMember("dai-makerdao")).toBe(true);
    expect(isMakerSquadMember("usdt-tether")).toBe(false);
  });

  it("assigns flagship/consort roles", () => {
    expect(makerSquadRole("usds-sky")).toBe("flagship");
    expect(makerSquadRole("dai-makerdao")).toBe("consort");
    expect(makerSquadRole("usdt-tether")).toBeNull();
  });

  it("returns deterministic, distinct formation offsets per member", () => {
    const offsets = MAKER_SQUAD_MEMBER_IDS.map((id) => makerSquadFormationOffset(id));
    const keys = offsets.map((o) => `${o.dx}.${o.dy}`);
    expect(new Set(keys).size).toBe(MAKER_SQUAD_MEMBER_IDS.length);
    // flagship sits at origin
    expect(makerSquadFormationOffset("usds-sky")).toEqual({ dx: 0, dy: 0 });
  });

  it("places stUSDS as the forward vanguard (dy < 0)", () => {
    const stUsds = makerSquadFormationOffset("stusds-sky");
    expect(stUsds.dy).toBeLessThan(0);
    // and ahead of the savings cutters
    expect(stUsds.dy).toBeLessThan(makerSquadFormationOffset("susds-sky").dy);
    expect(stUsds.dy).toBeLessThan(makerSquadFormationOffset("sdai-sky").dy);
  });

  it("contracts the formation in tight water placements", () => {
    const baseDai = makerSquadFormationOffset("dai-makerdao");
    const tightDai = makerSquadFormationOffsetForPlacement("dai-makerdao", "storm-shelf");
    expect(Math.abs(tightDai.dx)).toBeLessThanOrEqual(Math.abs(baseDai.dx));
    expect(Math.abs(tightDai.dy)).toBeLessThanOrEqual(Math.abs(baseDai.dy));
    // open water is unaffected
    expect(makerSquadFormationOffsetForPlacement("dai-makerdao", "safe-harbor")).toEqual(baseDai);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
npx vitest run src/systems/maker-squad.test.ts
```
Expected: fail (module missing).

- [ ] **Step 3: Implement the model**

```typescript
// src/systems/maker-squad.ts
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

// Formation is laid out in flagship-local tile coordinates (camera-up = -y).
// stUSDS leads the formation as risk-capital icebreaker (vanguard, dy = -3).
// Savings cutters (sUSDS, sDAI) flank the flagship forward of the parent stables.
// Flagship sits centre; DAI flanks port-aft as elder consort.
const FORMATION_OFFSETS: Record<MakerSquadMemberId, { dx: number; dy: number }> = {
  "usds-sky": { dx: 0, dy: 0 },
  "stusds-sky": { dx: 0, dy: -3 },   // vanguard / icebreaker
  "susds-sky": { dx: 2, dy: -2 },    // stbd-fwd savings cutter
  "sdai-sky": { dx: -2, dy: -2 },    // port-fwd savings cutter
  "dai-makerdao": { dx: -2, dy: 2 }, // veteran consort, port-aft
};

// Contraction rule: when the flagship's risk placement is a small water pocket
// (storm-shelf, harbor-mouth-watch), formation offsets are halved and rounded
// toward the flagship to avoid spilling outside the placement's water tiles.
export const TIGHT_PLACEMENT_IDS = new Set(["storm-shelf", "harbor-mouth-watch"]);

export function makerSquadFormationOffsetForPlacement(
  id: MakerSquadMemberId,
  placement: string,
): { dx: number; dy: number } {
  const base = FORMATION_OFFSETS[id];
  if (!TIGHT_PLACEMENT_IDS.has(placement)) return base;
  return {
    dx: Math.trunc(base.dx / 2),
    dy: Math.trunc(base.dy / 2),
  };
}

export function makerSquadFormationOffset(id: MakerSquadMemberId): { dx: number; dy: number } {
  return FORMATION_OFFSETS[id];
}
```

- [ ] **Step 4: Confirm tests pass**

```bash
npx vitest run src/systems/maker-squad.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/maker-squad.ts src/systems/maker-squad.test.ts
git commit -m "Add Maker squad model (USDS flagship + 4 consorts)"
```

---

## Task 2: Risk placement — squad members inherit the flagship's placement

**Files:**
- Modify: `src/systems/risk-placement.ts`
- Modify: `src/systems/pharosville-world.ts:230-275` (where `risk` is resolved per asset)

The current behaviour sends `navToken=true` ships to `ledger-mooring`. Squad consorts must override this and adopt the flagship's placement so that depeg/stress events keep the whole squad together.

**Decisions (tested below):**
1. **Flagship missing** (USDS not in `activeAssets`): squad concept does not activate. Consorts route by their normal per-asset rules (sUSDS/stUSDS/sDAI back to `ledger-mooring`, DAI to peg/DEWS). No squad chrome renders. The `squadId`/`squadRole` fields stay undefined for everyone.
2. **Consort stress stronger than flagship** (e.g. DAI active depeg while USDS calm): the squad still sails together at the flagship's placement, but the consort's individual `placementEvidence` includes a `squadOverride` flag noting that the consort's own stress signal is being suppressed visually. The consort's report card / detail panel / accessibility ledger must surface its own stress regardless — Task 9 adds an explicit "DAI in distress — squad sheltering at flagship" banner row.
3. **`placementEvidence.sourceFields`** for consorts must merge the flagship's source fields with `meta.flags.navToken` (when applicable) so the audit trail still records why navToken routing was overridden.

- [ ] **Step 1: Write failing world tests**

Add to `src/systems/pharosville-world.test.ts`:

```typescript
import { MAKER_SQUAD_MEMBER_IDS } from "./maker-squad";

it("places all Maker squad members at the same risk placement", () => {
  const world = buildPharosVilleWorldFromFixture(/* existing fixture */);
  const placements = MAKER_SQUAD_MEMBER_IDS.map((id) =>
    world.ships.find((s) => s.id === id)?.riskPlacement,
  );
  expect(placements.every((p) => p && p === placements[0])).toBe(true);
});

it("flagship-missing: consorts revert to per-asset placement, no squadId stamped", () => {
  const inputs = fixtureWithoutAsset("usds-sky");
  const world = buildPharosVilleWorld(inputs);
  for (const id of ["susds-sky", "stusds-sky", "sdai-sky"]) {
    const ship = world.ships.find((s) => s.id === id)!;
    expect(ship.squadId).toBeUndefined();
    expect(ship.squadRole).toBeUndefined();
    // navToken short-circuit re-engages
    expect(ship.riskPlacement).toBe("ledger-mooring");
  }
  const dai = world.ships.find((s) => s.id === "dai-makerdao")!;
  expect(dai.squadId).toBeUndefined();
});

it("placementEvidence keeps navToken sourceField for consorts whose meta.flags.navToken=true", () => {
  const world = buildPharosVilleWorldFromFixture(/* … */);
  const susds = world.ships.find((s) => s.id === "susds-sky")!;
  expect(susds.placementEvidence.sourceFields).toEqual(
    expect.arrayContaining(["meta.flags.navToken"]),
  );
});

it("consort with stronger stress still tracks flagship placement but flags squadOverride evidence", () => {
  const inputs = fixtureWithDepegOn("dai-makerdao");
  const world = buildPharosVilleWorld(inputs);
  const dai = world.ships.find((s) => s.id === "dai-makerdao")!;
  const usds = world.ships.find((s) => s.id === "usds-sky")!;
  expect(dai.riskPlacement).toBe(usds.riskPlacement);
  expect(dai.placementEvidence.squadOverride).toBe(true);
});
```

(Adapt `buildPharosVilleWorldFromFixture`, `fixtureWithoutAsset`, `fixtureWithDepegOn` to the existing test helpers — check the file before writing.)

- [ ] **Step 2: Confirm fail**

```bash
npx vitest run src/systems/pharosville-world.test.ts -t "Maker squad"
```

- [ ] **Step 3: Resolve all squad placements off the flagship (only when flagship is active)**

In `src/systems/pharosville-world.ts`, modify `buildShips`:

```typescript
import { MAKER_SQUAD_FLAGSHIP_ID, isMakerSquadMember, makerSquadRole } from "./maker-squad";

// Resolve the flagship's risk first iff USDS is active. Closure-captures the
// same pegById/stressById maps used in the per-asset .map below, so flagship
// and consort risk are computed off identical inputs.
const flagshipAsset = activeAssets(inputs.stablecoins).find((a) => a.id === MAKER_SQUAD_FLAGSHIP_ID);
const flagshipRisk = flagshipAsset
  ? resolveShipRiskPlacement({
      asset: flagshipAsset,
      meta: RUNTIME_ACTIVE_META_BY_ID.get(flagshipAsset.id)!,
      pegCoin: pegById.get(flagshipAsset.id),
      stress: stressById[flagshipAsset.id],
      freshness: inputs.freshness,
    })
  : null;
const squadActive = flagshipAsset !== undefined && flagshipRisk !== null;

// In the .map((asset) => …) callback:
const ownRisk = resolveShipRiskPlacement({
  asset, meta, pegCoin: pegById.get(asset.id), stress: stressById[asset.id], freshness: inputs.freshness,
});

let risk: { placement: ShipRiskPlacement; evidence: PlacementEvidence };
if (squadActive && isMakerSquadMember(asset.id) && asset.id !== MAKER_SQUAD_FLAGSHIP_ID) {
  // Consort: inherit flagship placement, merge sourceFields, mark squadOverride
  // when the consort's own stress was stronger than the flagship's.
  const consortHasStrongerSignal = consortStressTrumpsFlagship(ownRisk, flagshipRisk!);
  const sourceFields = Array.from(new Set([
    ...flagshipRisk!.evidence.sourceFields,
    ...(meta.flags.navToken ? ["meta.flags.navToken"] : []),
    ...(consortHasStrongerSignal ? ownRisk.evidence.sourceFields : []),
  ]));
  risk = {
    placement: flagshipRisk!.placement,
    evidence: {
      ...flagshipRisk!.evidence,
      sourceFields,
      reason: `Maker squad member; inherits flagship placement (${flagshipRisk!.evidence.reason})`,
      squadOverride: consortHasStrongerSignal,
    },
  };
} else {
  risk = ownRisk;
}
```

Also store the squad role on the ShipNode (only when squad is active):

```typescript
return {
  // …existing fields
  squadId: squadActive && isMakerSquadMember(asset.id) ? "maker" : undefined,
  squadRole: squadActive ? (makerSquadRole(asset.id) ?? undefined) : undefined,
};
```

Add `consortStressTrumpsFlagship` as a small helper in the same file (or in `risk-placement.ts`) that compares severity ranks of the two placements (storm-shelf > outer-rough-water > harbor-mouth-watch > safe-harbor > ledger-mooring) and returns `true` when consort > flagship.

Add `squadOverride?: boolean` to `PlacementEvidence` in `world-types.ts`.

- [ ] **Step 4: Add `squadId` and `squadRole` to `ShipNode` type**

In `src/systems/world-types.ts`:

```typescript
export interface ShipNode {
  // …existing fields
  squadId?: "maker";
  squadRole?: "flagship" | "consort";
}
```

- [ ] **Step 5: Confirm test passes**

```bash
npx vitest run src/systems/pharosville-world.test.ts -t "Maker squad"
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/systems/pharosville-world.ts src/systems/pharosville-world.test.ts src/systems/world-types.ts
git commit -m "Squad consorts inherit flagship risk placement"
```

---

## Task 3: Co-locate the squad — bypass per-ship spread for consorts

**Files:**
- Modify: `src/systems/pharosville-world.ts` (functions `spreadShipRiskAnchorsAcrossWater` and `spreadRiskPlacementShips`)
- Use existing helpers in `src/systems/risk-water-placement.ts`: `nearestRiskPlacementWaterTile` and `isRiskPlacementWaterTile` (NOT generic `nearestAvailableWaterTile` from `world-layout.ts`).

Today, each ship within a placement is spread independently. Consorts must instead snap to `flagship.tile + makerSquadFormationOffsetForPlacement(consort.id, placement)` (clamped to **the same placement's** water tiles only — generic-water clamping would let consorts spill out of storm-shelf into warning-water and break `motionZone` invariants).

- [ ] **Step 1: Write failing tests**

Add to `src/systems/pharosville-world.test.ts`:

```typescript
it("places squad consorts at flagship + formation offset, never outside the placement's water", () => {
  const world = buildPharosVilleWorldFromFixture(/* … */);
  const flagship = world.ships.find((s) => s.id === "usds-sky");
  expect(flagship).toBeDefined();
  for (const id of MAKER_SQUAD_MEMBER_IDS) {
    if (id === "usds-sky") continue;
    const consort = world.ships.find((s) => s.id === id)!;
    const offset = makerSquadFormationOffsetForPlacement(id, flagship!.riskPlacement);
    const expected = clampMapTile({ x: flagship!.tile.x + offset.dx, y: flagship!.tile.y + offset.dy });
    // allow ±1 tile drift from placement-scoped water clamping
    expect(Math.abs(consort.tile.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(consort.tile.y - expected.y)).toBeLessThanOrEqual(1);
    // consort must still be in the flagship's placement water set
    expect(isRiskPlacementWaterTile(consort.tile, flagship!.riskPlacement)).toBe(true);
  }
});

it("contracts the formation when flagship is in storm-shelf", () => {
  const world = fixtureWithFlagshipPlacement("storm-shelf");
  const flagship = world.ships.find((s) => s.id === "usds-sky")!;
  const stusds = world.ships.find((s) => s.id === "stusds-sky")!;
  // contracted formation: |dy| should be 1, not 3
  expect(Math.abs(stusds.tile.y - flagship.tile.y)).toBeLessThanOrEqual(2);
  expect(isRiskPlacementWaterTile(stusds.tile, "storm-shelf")).toBe(true);
});
```

- [ ] **Step 2: Confirm fail**

```bash
npx vitest run src/systems/pharosville-world.test.ts -t "formation offset"
```

- [ ] **Step 3: Implement formation snapping with placement-scoped clamping**

Modify `spreadRiskPlacementShips` in `src/systems/pharosville-world.ts`:

```typescript
function spreadRiskPlacementShips(
  ships: readonly ShipNode[],
  placement: ShipRiskPlacement,
  occupied: Set<string>,
): ShipNode[] {
  // 1) Place flagship and non-squad ships first (so flagship.tile is fixed)
  // 2) Snap consorts to flagship.tile + (placement-aware) formation offset
  // 3) Clamp via nearestRiskPlacementWaterTile — NEVER generic water tiles —
  //    so the consort cannot spill outside the placement's motion zone.

  const consorts = ships.filter((s) => s.squadRole === "consort");
  const others = ships.filter((s) => s.squadRole !== "consort");

  const placedOthers = othersSpread(others, placement, occupied);
  const placedFlagship = placedOthers.find((s) => s.squadRole === "flagship") ?? null;

  const placedConsorts = consorts.map((consort) => {
    if (!placedFlagship) return consort; // squad inactive in this placement
    const offset = makerSquadFormationOffsetForPlacement(
      consort.id as MakerSquadMemberId,
      placement,
    );
    const target = clampMapTile({
      x: placedFlagship.tile.x + offset.dx,
      y: placedFlagship.tile.y + offset.dy,
    });
    // Strictly placement-scoped: nearestRiskPlacementWaterTile returns a tile
    // inside the placement's water set, or null if the placement is too tight.
    const placementTile = nearestRiskPlacementWaterTile(target, placement, 4)
      ?? placedFlagship.tile; // fallback: collapse onto flagship rather than spill
    occupied.add(tileKey(placementTile));
    return { ...consort, tile: placementTile, riskTile: placementTile };
  });

  // preserve original ordering
  const byId = new Map([...placedOthers, ...placedConsorts].map((s) => [s.id, s]));
  return ships.map((s) => byId.get(s.id) ?? s);
}
```

(Extract the existing per-ship spread logic into `othersSpread`. Don't reuse `spacedRiskPlacementTile` for consorts — they must stay in formation, not spread. **Never** call `nearestAvailableWaterTile` here — it doesn't enforce the placement's water-tile set.)

- [ ] **Step 4: Confirm test passes and run full system test file**

```bash
npx vitest run src/systems/pharosville-world.test.ts
npx vitest run src/systems/world-layout.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/pharosville-world.ts src/systems/pharosville-world.test.ts
git commit -m "Snap Maker consorts to flagship formation offsets"
```

---

## Task 4: Motion — consorts ride the flagship's route

**Files:**
- Modify: `src/systems/motion-planning.ts` (`buildShipMotionRoute` and `buildBaseMotionPlan`)

Squad consorts must follow the flagship: same route, same dock cycle, same departure phase, just spatially offset by their formation tile delta. Consorts should not have independent dock visits or independent open-water patrols.

**Decisions:**
- All offset operations use `nearestRiskPlacementWaterTile(target, flagship.riskPlacement)`. **Never** use the zone-blind `nearestWaterTile` — it can drop consorts into the wrong DEWS zone and break `motion-water.ts` zone-style sampling.
- `dockVisits` for consorts must be cleared (`[]`) — the squad sails as one, dock-visit semantics are owned by the flagship. Tested explicitly.
- `homeDockId` is **not** copied from the flagship. Each consort computes its own from its own `chainPresence` (via the existing `primaryDockStop` logic over its own dock visits, which is now empty — so consorts have `homeDockId: null`). This preserves DOM/contract parity for downstream consumers that read `homeDockId` against `chainPresence`.
- Cycle and phase **are** inherited from the flagship so they never desynchronise visually.

- [ ] **Step 1: Write failing motion tests**

Add to `src/systems/motion.test.ts`:

```typescript
it("Maker consorts hold tight formation and same zone as flagship across full motion cycle", () => {
  const world = /* build with squad active and at a sailing risk placement */;
  const plan = buildMotionPlan(world, null);
  const flagshipRoute = plan.shipRoutes.get("usds-sky")!;
  for (const consortId of ["dai-makerdao", "susds-sky", "sdai-sky", "stusds-sky"]) {
    const consortRoute = plan.shipRoutes.get(consortId)!;
    expect(consortRoute.cycleSeconds).toBe(flagshipRoute.cycleSeconds);
    expect(consortRoute.phaseSeconds).toBe(flagshipRoute.phaseSeconds);
    // zone parity: consorts must stay in flagship's motion zone
    expect(consortRoute.zone).toBe(flagshipRoute.zone);
    // theoretical max distance per offset = max(|dx|,|dy|) base + 1 clamp drift
    // largest base offset is hypot(2,3) ≈ 3.6, so 4.5 is the tight cohesion bound
    for (let t = 0; t < flagshipRoute.cycleSeconds; t += flagshipRoute.cycleSeconds / 8) {
      const flagSample = resolveShipMotionSample(world.ships.find((s) => s.id === "usds-sky")!, flagshipRoute, t);
      const consortSample = resolveShipMotionSample(world.ships.find((s) => s.id === consortId)!, consortRoute, t);
      const dx = consortSample.tile.x - flagSample.tile.x;
      const dy = consortSample.tile.y - flagSample.tile.y;
      expect(Math.hypot(dx, dy)).toBeLessThan(4.5);
    }
  }
});

it("consorts have no dock visits and homeDockId=null", () => {
  const world = /* squad-active fixture */;
  for (const id of ["dai-makerdao", "susds-sky", "sdai-sky", "stusds-sky"]) {
    const ship = world.ships.find((s) => s.id === id)!;
    expect(ship.dockVisits).toEqual([]);
    expect(ship.homeDockChainId).toBeNull();
  }
});

it("reduced-motion frame still places the squad in formation", () => {
  const world = /* squad-active fixture */;
  const plan = buildMotionPlan(world, null);
  const flagshipShip = world.ships.find((s) => s.id === "usds-sky")!;
  for (const consortId of ["dai-makerdao", "susds-sky", "sdai-sky", "stusds-sky"]) {
    const consortShip = world.ships.find((s) => s.id === consortId)!;
    const sample = resolveShipMotionSample(consortShip, plan.shipRoutes.get(consortId)!, 0);
    const flagSample = resolveShipMotionSample(flagshipShip, plan.shipRoutes.get("usds-sky")!, 0);
    expect(Math.hypot(sample.tile.x - flagSample.tile.x, sample.tile.y - flagSample.tile.y)).toBeLessThan(4.5);
  }
});
```

- [ ] **Step 2: Confirm fail**

```bash
npx vitest run src/systems/motion.test.ts -t "formation"
```

- [ ] **Step 3: Implement consort route inheritance**

In `buildBaseMotionPlan`, build the flagship route first, then derive consort routes from it:

```typescript
const shipRoutes = new Map<string, ShipMotionRoute>();
const flagshipShip = world.ships.find((s) => s.id === MAKER_SQUAD_FLAGSHIP_ID && s.squadRole === "flagship");
if (flagshipShip) {
  shipRoutes.set(flagshipShip.id, buildShipMotionRoute(flagshipShip, world.map, waterRouteCache));
}

for (const ship of world.ships) {
  if (shipRoutes.has(ship.id)) continue;
  if (ship.squadRole === "consort" && flagshipShip && shipRoutes.has(flagshipShip.id)) {
    shipRoutes.set(ship.id, buildConsortMotionRoute(ship, shipRoutes.get(flagshipShip.id)!, world.map, waterRouteCache));
    continue;
  }
  shipRoutes.set(ship.id, buildShipMotionRoute(ship, world.map, waterRouteCache));
}
```

`buildConsortMotionRoute` clones the flagship route, replaces its `shipId`, applies the formation offset to every stop's mooring tile via **placement-scoped** lookup, drops dock visits, owns its own `homeDockId`, and reuses the flagship's cycle + phase:

```typescript
function buildConsortMotionRoute(
  ship: ShipNode,
  flagshipShip: ShipNode,
  flagshipRoute: ShipMotionRoute,
  map: PharosVilleMap,
  waterRouteCache: ShipWaterRouteCache,
): ShipMotionRoute {
  const placement = flagshipShip.riskPlacement;
  const offset = makerSquadFormationOffsetForPlacement(ship.id as MakerSquadMemberId, placement);

  // Zone-aware: stays within the flagship's placement water set.
  const offsetTile = (t: { x: number; y: number }) =>
    nearestRiskPlacementWaterTile({ x: t.x + offset.dx, y: t.y + offset.dy }, placement, 4)
      ?? nearestWaterTile(t); // last-resort if the placement is too tight

  const riskTile = offsetTile(flagshipRoute.riskTile);
  const riskStop = flagshipRoute.riskStop
    ? { ...flagshipRoute.riskStop, mooringTile: riskTile }
    : null;
  const waterPaths = new LazyShipWaterPathMap();
  // Consorts don't dock — dockStops cleared, no per-dock water paths.
  return {
    shipId: ship.id,
    cycleSeconds: flagshipRoute.cycleSeconds,
    phaseSeconds: flagshipRoute.phaseSeconds,
    riskTile,
    dockStops: [],
    riskStop,
    zone: flagshipRoute.zone, // inherit zone, not own riskZone, to stay in sync
    dockStopSchedule: [],
    homeDockId: null, // consort owns its own homeDockId from its empty dock visits
    openWaterPatrol: flagshipRoute.openWaterPatrol
      ? { ...flagshipRoute.openWaterPatrol, waypoints: flagshipRoute.openWaterPatrol.waypoints.map(offsetTile) }
      : null,
    waterPaths,
    routeSeed: flagshipRoute.routeSeed,
  };
}
```

Update the call site in `buildBaseMotionPlan` to pass `flagshipShip` alongside `flagshipRoute`. Also update `buildShips` (Task 2/3) so consorts are emitted with `dockVisits: []` and `homeDockChainId: null` when squadActive — this keeps the world model and motion model self-consistent.

- [ ] **Step 4: Confirm test passes; run motion suite**

```bash
npx vitest run src/systems/motion.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/systems/motion-planning.ts src/systems/motion.test.ts
git commit -m "Maker consorts ride the flagship motion route"
```

---

## Task 5: Sprite assets — register four new titan hulls

**Files:**
- Generate via PixelLab MCP and save to `public/pharosville/assets/ships/`:
  - `dai-titan.png` (single frame) + `dai-titan-frames.png` (4 frames horizontal)
  - `susds-titan.png` + `susds-titan-frames.png`
  - `sdai-titan.png` + `sdai-titan-frames.png`
  - `stusds-titan.png` + `stusds-titan-frames.png`
- Modify: `public/pharosville/assets/manifest.json` — register four new entries, bump `style.cacheVersion` to `2026-MM-DD-maker-squad-titans-v1`, update the critical-asset list at `manifest.json:~41`.

**Required reading first**: `docs/pharosville/PIXELLAB_MCP.md` and `docs/pharosville/ASSET_PIPELINE.md`. Then read `manifest.json` lines 909–1060 to see the exact shape of an existing titan entry (`ship.usds-titan`) before mirroring it.

- [ ] **Step 1: Read pipeline docs and existing titan entries**

```bash
cat docs/pharosville/PIXELLAB_MCP.md docs/pharosville/ASSET_PIPELINE.md
sed -n '909,1060p' public/pharosville/assets/manifest.json
```

- [ ] **Step 2: Generate sprites via PixelLab MCP — concrete dimensions**

| Asset            | width | height | anchor (x,y) | spritesheet | frame count | Critical? | Reason if critical |
|------------------|-------|--------|--------------|-------------|-------------|-----------|--------------------|
| `ship.dai-titan` | 144   | 104    | (72, 96)     | 4 cols × 1 row, frame=144×104 | 4 | yes | DAI is the second-largest squad hull and must render on first coherent frame to avoid the squad reading as USDS-only |
| `ship.susds-titan` | 128 | 92     | (64, 84)     | 4×1, 128×92                   | 4 | no  | Smaller savings cutter; deferred-load tolerated     |
| `ship.sdai-titan`  | 128 | 92     | (64, 84)     | 4×1, 128×92                   | 4 | no  | Mirror of sUSDS                                     |
| `ship.stusds-titan`| 136 | 96     | (68, 88)     | 4×1, 136×96                   | 4 | yes | Vanguard hull leads the formation; if missing on first frame the squad reads inverted |

Footprint and hitbox follow the same proportions as `ship.usds-titan` (footprint matches sprite minus alpha bleed; hitbox is the visible hull rectangle).

PixelLab MCP prompts MUST start from the manifest's style anchor block ("16-bit maritime isometric, deep navy/teal sea, weathered-wood palette, limestone island family, transparent background, no text, no logos, no token badges, three-quarter overhead view, hard pixel outline, 1-light shading"). Then append the per-hull body:

| Hull          | Per-hull prompt body (append to anchor block)                                                                                                                                                                                                                                                                                                                  |
|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `dai-titan`   | "Veteran Maker treasury frigate, classic crimson hull (`#a23a36`) with cream sails (`#f4eedc`), weathered hull-patches near the waterline reading as elder ship, single warm brass lantern at masthead, amber mooring lines coiled on deck."                                                                                                                  |
| `susds-titan` | "Sky savings cutter, deep-navy hull (`#19284a`) with amber chevron-stripe sails (`#e1893e`), agile narrow profile, single warm brass lantern at masthead, amber mooring lines."                                                                                                                                                                                |
| `sdai-titan`  | "DAI savings cutter, crimson hull (`#a23a36`) with cream chevron-stripe sails (`#f4eedc`), agile narrow profile mirroring sUSDS shape, single warm brass lantern at masthead, amber mooring lines."                                                                                                                                                            |
| `stusds-titan`| "Sky risk-capital icebreaker, dark-iron hull (`#4a3a2c`) with charcoal sails (`#2a2a2a`), copper-trimmed gunwales (`#b87333`), low forge-glow at hull joints reading as molten-metal seams, reinforced bow ram, single warm brass lantern at masthead, amber mooring lines."                                                                                  |

**No logos. No 4626 sigils. No symbols on sails.** PixelLab quality gate rejects text/badge content; the squad's identity is carried by hull color, sail pattern, lantern, mooring lines, and (for stUSDS) the forge-glow — not by symbology painted on the sprite.

The shared brass lantern + amber mooring lines are the unifying squad accent; bake them into all four prompts so the two palette families read as one squad.

- [ ] **Step 3: Add manifest entries with full field set**

For each new asset, mirror every field present on `ship.usds-titan`:

```jsonc
{
  "id": "ship.dai-titan",
  "path": "ships/dai-titan.png",
  "category": "ship",
  "layer": "ships",
  "width": 144,
  "height": 104,
  "anchor": { "x": 72, "y": 96 },
  "footprint": { /* match usds-titan proportions */ },
  "hitbox":    { /* match usds-titan proportions */ },
  "loadPriority": "critical",      // dai + stusds: critical; susds + sdai: deferred
  "criticalReason": "DAI is the second-largest squad hull; missing it on first frame breaks squad-coherence reading.",
  "animation": {
    "frameCount": 4,
    "frameSource": "ships/dai-titan-frames.png",
    "fps": 4,
    "loop": true,
    "frameWidth": 144,
    "frameHeight": 104,
    "reducedMotionFrame": 0
  },
  "tool": "pixellab-mcp",
  "promptKey": "ship.dai-titan",
  "semanticRole": "DAI Maker veteran consort titan stablecoin ship hull",
  "paletteKeys": ["limestone", "weathered wood", "maker crimson", "maker cream"],
  "promptProvenance": {
    "jobId": "<populated by MCP>",
    "styleAnchorVersion": "<current value of style.styleAnchorVersion>"
  }
}
```

Append the four new IDs to the critical-asset list at `manifest.json:~41` for the two critical entries (`ship.dai-titan`, `ship.stusds-titan`); leave the savings cutters out of the critical list. Bump `style.cacheVersion`.

- [ ] **Step 4: Validate assets**

```bash
npm run check:pharosville-assets
npm run check:pharosville-colors
```

- [ ] **Step 5: Commit**

```bash
git add public/pharosville/assets/ships/ public/pharosville/assets/manifest.json
git commit -m "Add Maker squad titan sprites (DAI, sUSDS, sDAI, stUSDS)"
```

---

## Task 6: Wire sprites into ship visuals

**Files:**
- Modify: `src/systems/ship-visuals.ts` (`TITAN_SHIP_ASSET_IDS`, `TITAN_SHIP_SCALES`)

- [ ] **Step 1: Extend tables**

```typescript
const TITAN_SHIP_ASSET_IDS: Record<string, string> = {
  "usdc-circle": "ship.usdc-titan",
  "usds-sky": "ship.usds-titan",
  "usdt-tether": "ship.usdt-titan",
  "dai-makerdao": "ship.dai-titan",
  "susds-sky": "ship.susds-titan",
  "sdai-sky": "ship.sdai-titan",
  "stusds-sky": "ship.stusds-titan",
};

// Re-tuned scale band so the squad collectively dominates the frame next to
// the existing 1.8 USDC and 2.0 USDT. USDS bumps from 1.6 → 1.7.
const TITAN_SHIP_SCALES: Record<string, number> = {
  "usdc-circle": 1.8,
  "usds-sky": 1.7,
  "usdt-tether": 2,
  "dai-makerdao": 1.55,
  "susds-sky": 1.35,
  "sdai-sky": 1.35,
  "stusds-sky": 1.45,
};
```

`sizeTier === "titan"` is intentionally retained for all squad members: they inherit the existing titan chrome (foam, mooring details, bow spray, lanterns). Verify each of those draw functions multiplies its absolute pixel offsets by `geometry.drawScale` — if any titan-chrome offset is hard-coded, foam will detach from the smaller consort hulls. Add a quick regression test: render at scale 1.35 and assert foam endpoints stay within hull bounds.

- [ ] **Step 2: Add a unit test for visual resolution**

Add to `src/systems/ship-visuals.test.ts`:

```typescript
it("resolves a titan sprite for every Maker squad member", () => {
  for (const id of MAKER_SQUAD_MEMBER_IDS) {
    const visual = resolveShipVisual(/* fixture asset */, /* meta */, null);
    expect(visual.spriteAssetId).toBeDefined();
    expect(visual.sizeTier).toBe("titan");
  }
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run src/systems/ship-visuals.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/systems/ship-visuals.ts src/systems/ship-visuals.test.ts
git commit -m "Promote Maker squad members to titan sprites"
```

---

## Task 7: Renderer — extend titan chrome to all squad members

**Files:**
- Modify: `src/renderer/layers/ships.ts:109` (`TITAN_SPRITE_IDS`)
- Modify: `src/renderer/layers/ships.ts` — **all four** per-titan offset tables:
  - `SHIP_SAIL_MARKS` (~line 20)
  - `SHIP_PEG_MARKS` (~line 31)
  - `SHIP_TRIM_MARKS` (~line 49)
  - `SHIP_SAIL_TINT_MASKS` (~line 80)

Missing entries in any of these tables silently fall back to generic-hull rendering and break the titan reading. Every new titan ID must appear in **all four** tables.

- [ ] **Step 1: Extend the titan id set**

```typescript
const TITAN_SPRITE_IDS = new Set([
  "ship.usdc-titan",
  "ship.usds-titan",
  "ship.usdt-titan",
  "ship.dai-titan",
  "ship.susds-titan",
  "ship.sdai-titan",
  "ship.stusds-titan",
]);
```

- [ ] **Step 2: Add placeholder entries to all four offset tables**

For each new titan ID, seed each of the four tables with the `ship.usds-titan` block (Task 7.5 will tune the actual values once sprites are visible). This step's goal is "no fallback to generic hull"; numerical accuracy comes next.

- [ ] **Step 3: Add a guard test that catches missing entries (cross-product coverage)**

Add to `src/renderer/layers/ships.test.ts` (create if absent):

```typescript
import { MAKER_SQUAD_MEMBER_IDS } from "@/systems/maker-squad";
import {
  SHIP_SAIL_MARKS, SHIP_PEG_MARKS, SHIP_TRIM_MARKS, SHIP_SAIL_TINT_MASKS, TITAN_SPRITE_IDS,
} from "./ships";

it("every Maker squad titan sprite is registered in all per-titan offset tables", () => {
  const titanIds = MAKER_SQUAD_MEMBER_IDS.map((id) => `ship.${id.split("-")[0]}-titan`);
  // Adjust to actual id mapping if different
  for (const titanId of titanIds) {
    expect(TITAN_SPRITE_IDS.has(titanId)).toBe(true);
    expect(SHIP_SAIL_MARKS[titanId]).toBeDefined();
    expect(SHIP_PEG_MARKS[titanId]).toBeDefined();
    expect(SHIP_TRIM_MARKS[titanId]).toBeDefined();
    expect(SHIP_SAIL_TINT_MASKS[titanId]).toBeDefined();
  }
});
```

(Export the four tables from `ships.ts` if they aren't already.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/renderer
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/layers/ships.ts src/renderer/layers/ships.test.ts
git commit -m "Register Maker consorts in all titan offset tables"
```

---

## Task 7.5: Visual offset tuning (before baselines)

**Files:**
- Modify: `src/renderer/layers/ships.ts` — tune the placeholder offsets seeded in Task 7 against actual sprite output.

The per-titan offsets in Task 7 are seeded from `usds-titan` and will be wrong for hulls of different pixel dimensions. We must tune them *before* baking visual baselines, otherwise Task 10's snapshot update bakes the wrong offsets in as ground truth.

- [ ] **Step 1: Stand up a throwaway harness page**

Create a throwaway local harness page that mounts the world canvas with a deterministic squad-active fixture, no DEWS chrome, no labels. Run `npm run dev` and open it.

- [ ] **Step 2: Iterate per consort**

For each of `dai-titan`, `susds-titan`, `sdai-titan`, `stusds-titan`:
1. Toggle a debug overlay that draws sail-mark / peg-mark / trim-mark / tint-mask anchor crosshairs on top of the hull.
2. Adjust the offset entries in `ships.ts` until each chrome element sits on the intended hull feature (mast for sail, prow for peg, gunwale for trim).
3. Reload, eyeball, repeat. No screenshot baselines are written or updated in this task.

- [ ] **Step 3: Sanity check the foam scaling at the smallest consort scale**

```bash
npx vitest run src/renderer/layers/ships -t "foam stays within hull bounds"
```
(This is the regression test added in Task 6.)

- [ ] **Step 4: Delete the harness file; commit only the offset edits**

```bash
git add src/renderer/layers/ships.ts
git commit -m "Tune Maker squad titan offsets to actual sprite geometry"
```

---

## Task 8: Squad chrome — formation pennant + shared selection halo + identity accents

**Files:**
- Create: `src/renderer/layers/maker-squad-chrome.ts`
- Create: `src/renderer/layers/maker-squad-chrome.test.ts`
- Modify: `src/renderer/world-canvas.ts` (call the new layer in the right pass)
- Modify: `src/renderer/layers/ships.ts` — add per-hull identity accents (admiral's banner on USDS, forge-glow on stUSDS, weathered patches on DAI) drawn on top of the sprite.
- Modify: `src/renderer/hit-testing.ts` — verify (do not extend) that pennant + halo are render-only and do not affect hit testing.

**Pennant rendering decision:** The pennant is a continuous golden bunting/streamer in **world-space** geometry, anchored at each squad member's mast top, with catenary-sag between adjacent anchor points. It bobs with each hull's pose (so the streamer follows the wake-layer motion). It is **not** a screen-space dashed line.

**Selection halo decision:** The squad halo is **secondary chrome** drawn on top of hulls but **thinner and lower-alpha** than the per-ship `drawSelectedShipOutline`. Both fire when a squad member is selected — the per-ship outline marks the actually-clicked hull; the halo signals "this hull is part of a squad." This composes additively rather than replacing.

**Hit testing:** The pennant strokes and the halo ellipse are rendered to the ships canvas. Hit testing in `src/renderer/hit-testing.ts` is geometric (per-entity bounding-box / sprite-mask), not pixel-sampled. Confirm by reading the file. If it reads pixels, add an exclusion: render pennant/halo on a separate decorative layer that hit testing skips.

**Identity accents (per-hull, drawn in the ships layer after sprite, before chrome):**
- USDS — single distinct masthead pennant ("admiral's banner"), narrow rectangle slightly above the mast tip.
- stUSDS — low forge-glow at hull joints, drawn as a soft warm-orange radial gradient on the hull line near the bow ram.
- DAI — three or four weathered hull-patches near the waterline, drawn as subtle desaturated rectangles (already present in the sprite if Task 5's prompt landed correctly; this draw call is the fallback if the sprite doesn't carry them).

- [ ] **Step 1: Write failing geometry tests**

```typescript
// src/renderer/layers/maker-squad-chrome.test.ts
import { describe, expect, it } from "vitest";
import { computeSquadBoundingEllipse, computeSquadPennantPath } from "./maker-squad-chrome";

describe("maker-squad-chrome", () => {
  it("returns null pennant path when fewer than 2 squad members are visible", () => {
    expect(computeSquadPennantPath([])).toBeNull();
    expect(computeSquadPennantPath([{ id: "usds-sky", mastTop: { x: 0, y: 0 } }])).toBeNull();
  });

  it("orders the pennant path stUSDS → sUSDS → USDS → sDAI → DAI (vanguard-first)", () => {
    const path = computeSquadPennantPath([
      { id: "dai-makerdao", mastTop: { x: -3, y: 2 } },
      { id: "usds-sky",     mastTop: { x:  0, y: 0 } },
      { id: "stusds-sky",   mastTop: { x:  0, y: -3 } },
      { id: "sdai-sky",     mastTop: { x: -3, y: -2 } },
      { id: "susds-sky",    mastTop: { x:  3, y: -2 } },
    ]);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(5);
    expect(path![0]).toEqual({ x: 0, y: -3 }); // stUSDS leads (vanguard)
    expect(path![2]).toEqual({ x: 0, y: 0 });  // flagship in middle
    expect(path![4]).toEqual({ x: -3, y: 2 }); // DAI trails (port-aft)
  });

  it("computes a bounding ellipse around all visible squad members", () => {
    const ellipse = computeSquadBoundingEllipse([
      { id: "usds-sky",     mastTop: { x: 0,  y: 0 } },
      { id: "dai-makerdao", mastTop: { x: 30, y: 0 } },
      { id: "stusds-sky",   mastTop: { x: 15, y: 20 } },
    ]);
    expect(ellipse!.center.x).toBeCloseTo(15, 1);
    expect(ellipse!.radiusX).toBeGreaterThanOrEqual(15);
    expect(ellipse!.radiusY).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Confirm fail**

```bash
npx vitest run src/renderer/layers/maker-squad-chrome.test.ts
```

- [ ] **Step 3: Implement chrome helpers + draw functions**

```typescript
// src/renderer/layers/maker-squad-chrome.ts
const PENNANT_ORDER = ["stusds-sky", "susds-sky", "usds-sky", "sdai-sky", "dai-makerdao"] as const;

export interface SquadAnchor {
  id: string;
  // Mast-top in screen space, including hull pose (bob, roll). Caller must
  // supply the world-space-bobbed position so the pennant follows wake motion.
  mastTop: { x: number; y: number };
}

export function computeSquadPennantPath(anchors: readonly SquadAnchor[]): { x: number; y: number }[] | null {
  if (anchors.length < 2) return null;
  const byId = new Map(anchors.map((a) => [a.id, a.mastTop]));
  return PENNANT_ORDER.map((id) => byId.get(id)).filter(Boolean) as { x: number; y: number }[];
}

export function computeSquadBoundingEllipse(anchors: readonly SquadAnchor[]) {
  if (anchors.length === 0) return null;
  const xs = anchors.map((a) => a.mastTop.x);
  const ys = anchors.map((a) => a.mastTop.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 16 },
    radiusX: Math.max(40, (maxX - minX) / 2 + 36),
    radiusY: Math.max(28, (maxY - minY) / 2 + 24),
  };
}

// Catenary-sagged bunting between adjacent mast tops. Sag depth scales with
// segment length so longer gaps droop more (reads as physical streamer, not
// straight line).
export function drawSquadPennant(ctx: CanvasRenderingContext2D, path: readonly { x: number; y: number }[]) {
  ctx.save();
  ctx.strokeStyle = "rgba(232, 187, 96, 0.78)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1], b = path[i];
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 + Math.hypot(b.x - a.x, b.y - a.y) * 0.1;
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

// Drawn AFTER hulls; thinner and lower-alpha than the per-ship selected ring
// so the halo reads as squad context, not as the primary selection signal.
export function drawSquadSelectionHalo(ctx: CanvasRenderingContext2D, ellipse: NonNullable<ReturnType<typeof computeSquadBoundingEllipse>>) {
  ctx.save();
  ctx.strokeStyle = "rgba(232, 187, 96, 0.42)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(ellipse.center.x, ellipse.center.y, ellipse.radiusX, ellipse.radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
```

(Removed the dead `MAKER_SQUAD_RENDER_IDS` re-export.)

- [ ] **Step 3a: Add identity accents in the ships layer**

In `src/renderer/layers/ships.ts`, after the sprite blit but before generic chrome, add three small helpers gated on ship.id:

```typescript
function drawAdmiralBanner(ctx, x, y, scale) { /* small rectangle pennant above mast */ }
function drawForgeGlow(ctx, x, y, scale)     { /* warm radial gradient at bow ram joint */ }
function drawWeatheredPatches(ctx, x, y, scale) { /* 3-4 desaturated waterline rectangles */ }
```

Wire each to the corresponding ship.id. Add unit tests that the helper paths run without throwing for the relevant IDs.

- [ ] **Step 3b: Synchronised wake**

In the existing wake loop in `ships.ts`, when more than one squad member is in the `motion.plan.moverShipIds` set, render the wake pass for the flagship first and let the consort wakes overdraw on top — the existing additive blending will produce the interference pattern naturally. Add a small assertion test that the flagship's wake is drawn before any consort's when both are mover ships.

- [ ] **Step 4: Wire into the canvas**

In `src/renderer/world-canvas.ts`, in the ships pass:
- After hulls (so the bunting passes in front of mast tips, behind any sails-of-other-ships overlap is acceptable), call `drawSquadPennant` if `computeSquadPennantPath` is non-null. Compute the mast-top anchor per ship from the same posed geometry the hull pass used (so the pennant inherits bob + roll).
- After hulls and pennant, if `selectedDetailId` belongs to any squad member, call `drawSquadSelectionHalo`. The per-ship `drawSelectedShipOutline` still fires for the actually-clicked hull.

- [ ] **Step 4a: Confirm hit testing is geometric, not pixel-sampled**

```bash
grep -n "getImageData\|isPointInPath\|pixel" src/renderer/hit-testing.ts
```
Expected: no pixel-sampling. If hit testing reads pixels, the pennant/halo strokes could swallow clicks that should fall through to water. In that case, render them on a separate decorative canvas layer that hit testing skips. The plan assumes geometric hit testing — confirm or escalate.

- [ ] **Step 4b: Hit-test uniqueness under formation overlap**

Add to hit-testing tests (`src/renderer/hit-testing.test.ts`):

```typescript
it("resolves to the exact squad member at each member's anchor", () => {
  const world = /* squad-active fixture */;
  for (const id of MAKER_SQUAD_MEMBER_IDS) {
    const ship = world.ships.find((s) => s.id === id)!;
    const screenPoint = projectShipScreenPoint(ship, /* camera */);
    const hit = hitTest(world, screenPoint);
    expect(hit?.id).toBe(`ship.${id}`);
  }
});
```

- [ ] **Step 5: Confirm tests + typecheck**

```bash
npx vitest run src/renderer/layers/maker-squad-chrome.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/layers/maker-squad-chrome.ts src/renderer/layers/maker-squad-chrome.test.ts src/renderer/world-canvas.ts
git commit -m "Squad chrome: formation pennant and shared selection halo"
```

---

## Task 9: DOM/detail parity (including squad-override stress contract)

**Files:**
- Modify: `src/systems/detail-model.ts` and/or `src/components/accessibility-ledger.tsx`

Per `CURRENT.md`: "Canvas is not the only source of analytical meaning. Any new visual signal needs matching detail-panel or accessibility-ledger text."

This task also resolves the contract violation flagged in Task 2 decision #2: when a consort's own stress signal would have routed it elsewhere, the canvas places it with the squad — but the consort's own report card still flags the stress. The DOM must reconcile these two truths explicitly.

- [ ] **Step 1: Add squad text to the detail panel**

When a Maker squad member is selected, the panel surfaces:
- "Sailing in formation with the Sky-Maker squad: USDS (flagship), stUSDS (vanguard), sUSDS, sDAI, DAI"
- The placement-evidence text from Task 2 ("inherits flagship placement (...)").
- **If `placementEvidence.squadOverride === true`**, an explicit banner row: `"<symbol> in distress — squad sheltering at flagship's position"` with the consort's actual stress band visible.

- [ ] **Step 2: Add to accessibility ledger**

A single squad row that lists all five members and the shared placement. When any consort has `squadOverride === true`, the ledger row includes a sub-row naming the consort and its actual stress signal.

- [ ] **Step 3: Add tests for both**

```typescript
it("squad detail panel surfaces all five members and the shared placement", () => { /* … */ });
it("squad detail panel surfaces the override banner when DAI is depegged", () => { /* … */ });
it("accessibility ledger includes a sub-row for any squadOverride consort", () => { /* … */ });
```

```bash
npx vitest run src/systems/detail-model.test.ts src/components
```

- [ ] **Step 4: Commit**

```bash
git add src/systems/detail-model.ts src/components/accessibility-ledger.tsx
git commit -m "Surface the Maker squad and override-banner in detail and ledger DOM"
```

---

## Task 10: Visual regression baselines + docs

**Files:**
- Modify: `tests/visual/pharosville.spec.ts` (only if a new dedicated squad shot is needed; existing shots will re-bake naturally)
- Modify: `docs/pharosville/CURRENT.md`
- Modify: `docs/pharosville-page.md`

- [ ] **Step 1: Re-bake baselines with enforced diff review**

```bash
npm run build
npx playwright test tests/visual/pharosville.spec.ts --update-snapshots
git diff --stat tests/visual/pharosville.spec.ts-snapshots
git diff -- tests/visual/pharosville.spec.ts-snapshots | head -200
```

For every snapshot listed in `--stat`:
1. Justify the change in one sentence (e.g. "USDS at scale 1.7 displaces 2 px of bow foam left").
2. If a snapshot drift is **not** explained by squad work, revert that file: `git checkout -- <path>` and investigate.
3. The commit body in Step 4 must paste the `git diff --stat` output as evidence.

This gate is mandatory. The plan does not accept "looked at it, ship it." Each snapshot must have a written justification before it's added.

- [ ] **Step 1a: Cache invalidation audit**

```bash
grep -n "= new Map" src/renderer/layers/ships.ts src/renderer/world-canvas.ts
```

`shipSailTintCache` (in `ships.ts:111`) is keyed on `entry.id + sailColor + primary + accent`. For the **new** consort IDs this is fine. If any existing titan sprite bytes were edited (e.g. usds-titan re-touched), this cache won't invalidate on `style.cacheVersion` bump — note explicitly in the commit body whether existing sprites were modified, and add a `cacheVersion` segment to the cache key only if so.

- [ ] **Step 2: Document the squad invariant**

In `docs/pharosville/CURRENT.md`:

> The five Maker stables (USDS, DAI, sUSDS, sDAI, stUSDS) form a fixed squad. USDS is the flagship; consorts inherit its risk placement and motion route, and render with a shared formation pennant and selection halo. NavToken→ledger-mooring routing is overridden for squad members.

In `docs/pharosville-page.md`, surface the squad as a route-contract feature (one paragraph).

- [ ] **Step 3: Final validation**

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

- [ ] **Step 4: Commit**

```bash
git add tests/visual docs/pharosville/CURRENT.md docs/pharosville-page.md
git commit -m "Re-bake baselines and document the Maker squad"
```

---

## Resolved decisions (was: Open Questions)

The first plan revision left these as open questions; they are now decided in-line and reflected above:

1. **Formation offsets** — constant in tile space, with a documented contraction rule for tight placements (`storm-shelf`, `harbor-mouth-watch`). Not camera-zoom-driven.
2. **Risk placement override** — consorts inherit flagship placement; `placementEvidence.sourceFields` retains `meta.flags.navToken`; `squadOverride: true` flag fires when consort's own stress signal is stronger; report card / detail panel / accessibility ledger surface the consort's actual stress regardless (Task 9 banner).
3. **Pennant rendering** — world-space wake-layer geometry, catenary-sagged, anchored at posed mast tops. Not screen-space dashed.
4. **Hit testing** — geometric (confirmed in Task 8 Step 4a). Per-member bounding boxes resolve uniquely; tested explicitly in Task 8 Step 4b.
5. **Squad scale** — re-tuned to USDS 1.7, DAI 1.55, savings 1.35, stUSDS 1.45. Visual prototype happens in Task 7.5 (offset-tuning harness) before baselines bake.
6. **stUSDS role** — vanguard / icebreaker, leading the formation. Lore: risk capital absorbs first impact. Forge-glow + dark-iron livery sells it.

## Remaining open question (escalate to user before execution)

**O1.** Pennant z-order: drawn after hulls in this revision (so it passes in front of mast tips). Alternative: draw between wake and hulls (under sails). Risk of either: with five hulls in formation, pennant-over-hull may visually crowd masts on small zoom levels; pennant-under-hull may be hidden by sails. Decide after seeing one rendered baseline; revisit before snapshotting Task 10.

---

## Self-Review Notes

- Spec coverage: all five stables (✅), sail together at all times via shared route + zone parity (✅, Task 4), titan-tier visual (✅, Tasks 5–8), lore accuracy with stUSDS as vanguard (✅, formation table revised).
- Placeholder scan: no TBDs; PixelLab prompts in Task 5 are MCP-conformant (style anchor + per-hull body, no logos/text); manifest fields fully enumerated.
- Type consistency: `squadId`, `squadRole`, `MAKER_SQUAD_FLAGSHIP_ID`, `MAKER_SQUAD_MEMBER_IDS`, `makerSquadFormationOffset`, `makerSquadFormationOffsetForPlacement`, `squadOverride` used consistently.
- Correctness gates added: placement-scoped water clamping (Task 3, 4), flagship-missing semantics (Task 2), tighter cohesion bound `< 4.5` + zone equality (Task 4), reduced-motion test (Task 4), hit-test uniqueness (Task 8), cross-product offset-table guard (Task 7), foam-scaling regression (Task 6), enforced visual-baseline review gate (Task 10).
- Identity accents added: admiral's banner (USDS), forge-glow (stUSDS), weathered patches (DAI), shared brass lantern + amber mooring lines (all five), synchronised wake interference (all five).
- Task 7.5 inserted to break the offset/baseline chicken-and-egg.

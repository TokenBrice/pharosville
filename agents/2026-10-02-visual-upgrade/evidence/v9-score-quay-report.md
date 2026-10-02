# v9-score-quay — verification report (packet S1 rows "Within-zone score", "Quay flow", oracle "Geography and formation")

HEAD `599c822` (matches the reviewed commit). Read-only repo; all probes are throwaway files under `outputs/verify-v9-score-quay/`.

Probe commands (re-runnable):
```
npx vitest run --config outputs/verify-v9-score-quay/vitest.probe.config.ts --reporter=verbose --disableConsoleIntercept outputs/verify-v9-score-quay/probe-score.probe.test.ts
npx vitest run --config outputs/verify-v9-score-quay/vitest.probe.config.ts --reporter=verbose --disableConsoleIntercept outputs/verify-v9-score-quay/probe-cargo.probe.test.ts
npx vitest run --config outputs/verify-v9-score-quay/vitest.probe.config.ts --reporter=verbose --disableConsoleIntercept outputs/verify-v9-score-quay/probe-wording.probe.test.tsx
```

## Claim ledger

| # | Packet claim (verbatim) | Verdict | Evidence / correction |
|---|---|---|---|
| 1 | "Keep exact DEWS inspect-only." | **PARTLY** | At HEAD the exact DEWS score is **dropped from the DetailPanel**: `detailForShip` emits `{label:"Within-zone anchoring"}` (`src/systems/detail-model.ts:1305`) but `"within-zone anchoring"` is not in `DETAIL_FACT_LABELS` (`src/lib/format-detail.ts:124-173`), so `buildDetailFactSections` discards it. Rendered probe: panel markup contains `"Within-zone"`=false, `"DEWS"`=false; ledger contains both. The score survives only in the AccessibilityLedger clause (`src/components/accessibility-ledger.tsx:523,528`) and the cue text (`src/systems/visual-cue-registry.ts:252`). "Keep exact" therefore requires **adding** a registered panel surface, not just deleting the edge clause. |
| 2 | "Retire calm-edge/rough-edge positioning claims" | **CONFIRMED** (the wording is unsupportable) | Claim sites: `src/systems/detail-model.ts:599-602` (`toward the calm edge` / `toward the rough edge` / `mid-water`), `src/systems/visual-cue-registry.ts:252` ("score magnitude draws the berth from its calm edge toward its rough edge"), `src/components/accessibility-ledger.tsx:528`, `src/systems/world-types.ts:567` ("calm-edge 0 … rough-edge 1 anchoring"). Probe: the sentence renders in the ledger and cue list, not in the panel. |
| 3 | "final placement ignores riskDepth" | **WRONG** | Cold-build dense-fixture scan (`probe-score`, 132 ships, one ship's score 5→95 at a time): **108/132 ships' own final tiles changed**; **940 fleet tile changes** across the 132 scans. Response is real but not a faithful ordering: `usdt-tether` (storm-shelf, 11 ships) 11/11 distinct tiles, Spearman(score, x−y)=**1.000**; `usde-ethena` 11/11, ρ=0.984 (+9/−1); `usdc-circle` 11/11, ρ=0.995; but `satusd-river` **2/11** (single jump at score 90), `yusd-aegis` 4/11 (+3/−1), `pyusd-paypal` 3/11 (jump at 40), `usds-sky` **2/11** (moves only at score 100), `dai-makerdao` **1/11** (never moves). Mechanism: riskDepth → preferred tile via anchor interpolation (`src/systems/pharosville-world/stages/ship-placement.ts:145-174`); spread score `spacing*1000 − preferredDistance*preferredWeight`, weight 150 vs 0.1 (`ship-placement.ts:802-805`); the first-placed ship in a water gets pure preference (`base = -preferredDistance`, line 805) → monotone, everyone else is spacing-dominated → step/constant. Sticky gate freezes |Δdepth| < 0.02 (`ship-placement.ts:593`): warm-rebuild probe holds the tile at 0.30→0.31/0.32/0.33, re-spreads at 0.40/0.50. Correct wording: **"the score biases a preferred berth tile; it does not order the final tile, which is farthest-point packing."** |
| 4 | "Restore spatial score only with final-position monotonic and safety tests." | **UNVERIFIABLE-HERE** (proposal) | Turned into a design + test plan (Design §C). New constraint the packet missed: sticky placement (`ship-placement.ts:507-560`) exists to stop refresh teleporting; a strictly monotone final position reintroduces it for every DEWS wiggle unless the depth is quantized and the hold gate retained. |
| 5 | "Label quay figures as estimated 24h allocation by held supply, including scope/renormalization." | **CONFIRMED** (defect real) | Per-dock flow is an allocation: each active coin's mint/burn is split by `weight = presence.share / scopedShare`, where `scopedShare` sums only presences on `trackedChainIds = rendered docks ∩ payload scope` (`src/systems/pharosville-world/stages/cargo-tide.ts:199-241`). The label carries no qualifier: probe renders `-$3.0M burning — mint $1.0M, burn $4.0M` (`detail-model.ts:881-908`; panel + ledger). `DockCargoTide.tracked: true` (`world-types.ts:496-513`) plus a bare figure reads as measured. |
| 6 | "Keep measured raw coin/fleet flow exact." | **CONFIRMED** (already true; keep) | `buildFleetIssuance` sums payload coin mint/burn/net directly (`cargo-tide.ts:136-165`); probe: fleet mint **11,000,000** / burn **6,000,000** / net **5,000,000** = payload raw sums, byte-identical under a dock subset. Per-ship `buildShipIssuance` copies `coin.netFlow24hUsd` (`src/systems/ship-issuance.ts:6-31`). Only the per-dock allocation needs the estimate wording. |
| 7 | "Harbor-subset changes cannot invent measured attribution" | **WRONG at HEAD** | Probe, payload scope `[ethereum, polygon, solana, base]`, all docks: ethereum `tracked` mint **666,666.67**, burn **2,666,666.67**, net **−2,000,000**. Remove the polygon berth from the rendered set, same payload/ships/scope: ethereum mint **850,000**, burn **3,400,000**, net **−2,500,000**, still `tracked: true` — a 27.5% inflation with no wording change. The subset is real: `MAX_CHAIN_HARBORS = 8` (`src/systems/chain-docks.ts:14,183-204`) while the dense fixture has 10 chains; the built world rendered 8 docks (bsc, optimism absent) and a payload coin whose presence is only on an unrendered chain vanishes with no `unattributed` flag (scopedShare ≤ 0 → skipped, `cargo-tide.ts:224-240`). |
| 8 | "Score wording matches final placement" | **WRONG at HEAD** | Same evidence as rows 1-3: the wording claims an ordering the placement does not reliably produce, and the panel does not even display it. |

## What the packet missed

1. **The panel silently loses the DEWS score.** `Within-zone anchoring` is unregistered in `DETAIL_FACT_LABELS` (`format-detail.ts:124-173`), so "keep exact DEWS inspect-only" is not a deletion-only change; the value must be re-registered or it disappears with the retired claim. Verified with a rendered probe.
2. **"Ignores riskDepth" is factually wrong and testable.** 108/132 ships respond; 940 fleet tile changes. The correct defect statement is "the final tile is farthest-point packing that the score only biases", and the retraction needs a characterization/safety test, not just copy edits.
3. **Sticky placement interacts.** A held ship ignores any depth move < 0.02 (measured), so a 1-point DEWS change never moves a ship; ≥0.02 re-spreads and may or may not land elsewhere. The existing `"places a stronger score toward the rough edge"` test (`ship-placement.test.ts:226-244`) uses a two-ship fixture where the subject is placed first in its water (`base = -preferredDistance`) — it passes for a reason that does not generalize and will keep passing while the wording is false.
4. **The existing test file resets held placements**, hiding the sticky interaction from every placement test.
5. **A harbor subset already exists in the dense fixture** (`MAX_CHAIN_HARBORS=8` vs 10 chains) and renormalization is invisible: the fleet ledger line discloses the *payload* scope, but the docks divide by the *rendered ∩ scope* set. Two different denominators, only one disclosed.
6. **Scoped-out flow is not counted as doubt.** `unattributedGrossUsd` only covers coins with no chain presence at all (`cargo-tide.ts:207-221`); a coin whose presences are all outside the rendered scope is dropped silently, so no calm quay is flagged `unattributed`.
7. **Raw measured surfaces already exist and are distinguishable**: `FleetIssuance` (payload sums + scope label) and `ShipIssuance` (per-coin raw). "Keep measured raw coin/fleet flow exact" needs zero code change; the risk is wording leakage from the dock estimate into those.
8. The codebase documentation already knows the dock figure is an allocation (`world-types.ts:481-484`, changelog "allocated per coin by chain-presence share", cue `sourceField` `visual-cue-registry.ts:403`), but the rendered label does not carry it. The defect is rendering, not modelling.

## Implementation design

### A. Score wording truth (direct correction; independently revertible)

1. **`src/systems/detail-model.ts:593-603`** — rename `riskAnchoringDepthLabel` → `dewsScoreLabel`; delete the `edge` ternary; return `` `DEWS ${score}/100` ``; rewrite the doc comment: exact reading, inspect-only; the berth inside a water is farthest-point packing and is **not** ordered by the score (first-placed ship excepted). Reason: removes the retracted claim at its source; the function is the only producer of the sentence.
2. **`src/systems/detail-model.ts:1305`** — fact label `"Within-zone anchoring"` → `"DEWS score"` (value unchanged, still gated on `riskDepth != null`). Reason: "anchoring" is the retracted claim; the exact reading stays.
3. **`src/lib/format-detail.ts`** — add `"dewsScore"` to `DetailFactKey` (after `"riskWaterZone"`); add `"dews score": "dewsScore"` to `DETAIL_FACT_LABELS`; add `dewsScore?: string | null` to `CurrentlyParts`; in `composeCurrently` append it after the stress driver in every branch (`[value, stressDriver, dewsScore].filter(Boolean).join(" · ")`, and the bare fallback `[position, area, stressDriver, dewsScore].filter(Boolean).join(" · ")`); in `buildDetailFactSections` (lines 418-428) read `lookup.get("dewsScore")` and pass it to `composeCurrently` **without** emitting an identity row. Reason: the score reaches the panel inside the existing risk-water "Currently" line with **zero new fact rows** (measured: a dense ship already renders 9 `pv-fact-row`s; the test density contract is ≤8 for its synthetic fixture). Result: `Danger Strait idle · Driven by: peg deviation · DEWS 96/100`.
4. **`src/components/accessibility-ledger.tsx:28,523,528`** — import/use `dewsScoreLabel`; replace clause `` `within-zone anchoring ${riskDepth}` `` with the value verbatim (`...(riskDepth ? [riskDepth] : [])`), yielding `… risk zone danger; DEWS 96/100; livery …`. Reason: panel/ledger parity for the exact reading, no positional words.
5. **`src/systems/visual-cue-registry.ts:252-253`** — cue `cue.ship.distance`: remove "within each named DEWS water, score magnitude draws the berth from its calm edge toward its rough edge"; replace with: `"ship placement into the named DEWS water its band belongs to; the exact DEWS score is stated in the ship record, while the berth inside a water is the anchorage packing rather than a calm-to-rough order"`. In `domEquivalent`, replace "Within-zone anchoring" with `"DEWS score (folded into the Currently line)"`. Reason: the ledger renders `cue.visual` and `cue.domEquivalent` verbatim, so the retracted claim is user-visible DOM (`probe-wording` confirms `calm edge toward its rough edge` in ledger markup).
6. **`src/systems/world-types.ts:567-568`** — replace the doc comment with: `/** Fresh DEWS score normalized to 0…1. Biases the preferred berth tile inside the water; it does not order the final tile (farthest-point spread). */` Reason: the type doc currently asserts the retracted anchoring contract.
7. **`src/systems/pharosville-world/stages/ship-placement.ts:135,145-151,507-530,790-805`** — comment-only: state that `riskDepth` selects the preferred anchor and biases the spread; the final tile is spacing-dominated; the sticky gate freezes sub-0.02 depth moves. Reason: the next maintainer must not re-derive the retracted claim from the comments.
8. **Tests** — see below. Delete the false oracle; do not re-pin it.

Deferred alternative (operator decision, Design C): restore an actually monotone spatial encoding.

### B. Quay estimate disclosure (direct correction; independently revertible)

1. **`src/systems/detail-model.ts:881-908`** — in `cargoTideLabel`, tracked branches only, prefix one constant:
   ```ts
   const allocationBasis =
     "Estimated 24h allocation by held supply, renormalized across rendered in-scope chains";
   ```
   Exact new strings:
   - minting: `Estimated 24h allocation by held supply, renormalized across rendered in-scope chains: +$8.0M minting — mint $10.0M, burn $2.0M`
   - burning: `Estimated 24h allocation by held supply, renormalized across rendered in-scope chains: -$8.0M burning — mint $10.0M, burn $2.0M`
   - flat: `Estimated 24h allocation by held supply, renormalized across rendered in-scope chains: balanced — mint $4.0M, burn $4.0M`
   - inactive: `Estimated 24h allocation by held supply, renormalized across rendered in-scope chains: no issuance activity in 24h`
   Untracked strings unchanged (`Not measured on this chain` / `Unavailable — issuance scope unreported` / `Unavailable — 24h issuance could not be matched to this harbor's coins` / `Unavailable — no issuance feed`). Reason: the figure's denominator is the rendered ∩ scoped set; saying so is the only way a harbor-subset change cannot masquerade as measurement. Keep the row label `Net flow 24h` (no classifier churn); the value carries the estimate.
2. **`src/systems/visual-cue-registry.ts:403,406`** — `sourceField`: `"…allocated across harbours by each coin's chain presence"` → `"…estimated 24h allocation by held-supply share, renormalized across the rendered, in-scope harbours (mintBurn.scope.chainIds)"`; `domEquivalent`: add `"the estimate is disclosed in the row"`. Legend text line 57 unchanged (it names the row accurately).
3. **`src/systems/world-types.ts:481-484,489-495`** — doc: the cargoTide figure is an **estimated allocation**, not a chain-local measurement; `tracked` means "inside the payload scope and rendered", and the figure renormalizes over the rendered ∩ scope set, so the rendered harbour set changes it. Reason: code-level truth so the rendered label cannot silently regress.
4. **No change** to `buildFleetIssuance` / `shipIssuanceDetailLabel` / the fleet ledger "measured over" line — those are the raw measured surfaces (claim 6).

### C. Alternative design (only if the operator chooses to restore a monotone spatial score)

Goal: final tile order within a named water is non-decreasing in `riskDepth`, without breaking packing/legality/sticky-hold.

- **M1 (recommended shape) — windowed spread by ranked roughness.** For each placement, precompute each candidate tile's `roughnessRank` = normalized rank of `x − y` among the placement's water tiles (same statistic the preferred-anchor ordering already uses, `ship-placement.ts:152-156`). A ship's candidate window is `{tiles with |rank − depth| ≤ w}` (default `w = 0.15`, widened if the window holds fewer candidates than ships), then run the existing farthest-point spread **inside the window**. Two ships whose depths differ by > 2w get disjoint windows → ordered by construction; pairs inside one window stay packing-ordered, so the oracle must state the tolerance.
- **M2 (rejected)** — raise `preferredWeight` so preference dominates `spacing*1000`: destroys farthest-point packing, violates the cluster/empty-circle contract (`docs/pharosville/CONTRACTS.md:118-122`) and risks collisions.
- **M3 (rejected shape)** — sort ships and tiles by depth and assign: monotone by construction but re-packs the water every build; conflicts with sticky hold and causes teleporting.
- **Interaction with sticky hold (mandatory):** quantize the spatial depth to bands (e.g. 5) and feed the banded value through the existing hold gate, or keep the hold gate on the continuous depth but require the monotonicity oracle to accept held tiles. Otherwise every DEWS refresh re-tiles the fleet — the ~320 ms refresh and 36/205 tile-move problem documented at `ship-placement.ts:507-530`.

### Tests

Score:
- `src/systems/detail-model.test.ts` — new `it("states the DEWS score exactly and claims no berth edge")`: `dewsScoreLabel({riskDepth:0.37}) === "DEWS 37/100"`, `{riskDepth:0.05}`, `{riskDepth:0.95}` same shape, `null`/`NaN` → null, `1.4` → `DEWS 100/100`. Oracle: exact reading, no positional words.
- `src/lib/format-detail.test.ts` — extend `composeCurrently`: `it("appends the DEWS reading after the stress driver")` → `composeCurrently({position:"Warning Shoals idle", area:"Warning Shoals", zone:"warning", stressDriver:"Driven by: peg deviation", dewsScore:"DEWS 96/100"}) === "Warning Shoals idle · Driven by: peg deviation · DEWS 96/100"`; existing cases without `dewsScore` unchanged (regression). Add `classifyDetailFactLabel("  DEWS  SCORE ") === "dewsScore"` and a `buildDetailFactSections` case proving the fact folds into `position` and does **not** add an identity row (density oracle).
- `src/components/detail-panel.test.tsx` — rendered oracle: a ship DetailModel carrying `{label:"DEWS score", value:"DEWS 96/100"}` renders `DEWS 96/100` inside the `Currently` row, markup contains no `calm edge`/`rough edge`, and the `pv-fact-row` count equals the same detail without the DEWS fact (fold, not a row).
- `src/components/accessibility-ledger.test.tsx` — rendered oracle: the ship ledger line contains `DEWS 96/100`, the ledger contains no `toward the rough edge`, and the Visual cues list contains no `calm edge toward its rough edge`.
- `src/systems/pharosville-world/stages/ship-placement.test.ts` — **delete** `"places a stronger score toward the rough edge of the same named water"` (lines 226-244; false general claim, two-ship fixture) and replace:
  1. `it("holds a ship's tile while its DEWS depth moves less than the sticky gate")` — cold build `@0.30`, warm rebuilds `@0.31/@0.32/@0.33` (no reset between builds), same `riskTile`; behavioral oracle for the gate. (Order-sensitive: relies on held memory, `src/test-setup.ts` resets it in `beforeEach`.)
  2. `it("keeps every cold DEWS sweep tile in legal, collision-free water")` — for scores `[5,25,50,75,95]` × the largest ship in each of storm-shelf/breakwater-edge/safe-harbor: all spread `riskTile`s unique and `isRiskPlacementWaterTile(tile, placement)` true. Safety oracle, survives either policy.
  3. Optional retraction lock `it("does not order the fleet by DEWS depth")` — `dai-makerdao` keeps one tile across the sweep (or `usds-sky` holds until 100). Comment that it must be deleted/replaced if Design C lands.
- Keep `"normalizes only fresh finite DEWS scores"` as is.

Quay:
- `src/systems/pharosville-world/stages/cargo-tide.test.ts` — new:
  1. `it("renormalizes a coin's allocation over the rendered in-scope harbours")` — same payload, docks `[ethereum, polygon, solana]` vs `[ethereum, solana]`; the ethereum figure **increases** and stays `tracked` (documents the estimate's subset dependence — the oracle behind the disclosure).
  2. `it("keeps fleet totals at the measured payload sums under any rendered subset")` — `fleetIssuance` mint/burn/net identical across the two dock sets and equal to the payload sums (raw-measurement invariant).
- `src/systems/detail-model.test.ts:1643-1675` — update the three tracked expectations to the exact new strings; add `it("says the quay figure is an allocation estimate")` asserting the clause appears for minting/burning/flat/inactive and never for the four untracked reasons.
- `src/components/accessibility-ledger.test.tsx:290-318` — update `net flow 24h +$8.0M minting` to the new string; keep `net flow 24h Not measured on this chain`; add: the fleet line still reads `measured over …` (raw) while the dock line carries `Estimated 24h allocation`.
- `src/lib/format-detail.test.ts:209-216` unchanged (row label kept).

### Acceptance commands

```
npx vitest run src/systems/detail-model.test.ts src/lib/format-detail.test.ts \
  src/components/detail-panel.test.tsx src/components/accessibility-ledger.test.tsx \
  src/systems/pharosville-world/stages/ship-placement.test.ts \
  src/systems/pharosville-world/stages/cargo-tide.test.ts
npm run typecheck
```
(Orchestrator runs `npm run typecheck`/lint/build centrally; no visual lane is required for this slice — the change is DOM wording only, no renderer surface changed. If a preview arm is run, `npm run preview -- --fixture dense --value-plan` is the existing value dump lane.)

### Stop conditions / risks

- The `Currently` line grows by one clause for every ship with fresh DEWS; if measurement shows the line wrapping badly in the panel (visual check), promote the reading to its own identity row (needs a density check against the ≤8 contract) or drop the fold — do not re-introduce the edge claim.
- The quay value string grows ~10 words in panel and ledger; verify the dock row still renders without truncation; compact alternative: `Estimated 24h allocation by held supply across rendered in-scope chains:` (drops the explicit renormalization word).
- Changing tracked `cargoTideLabel` strings necessarily updates `detail-model.test.ts` and `accessibility-ledger.test.tsx` expectations in the same commit — they are the label contract, not incidental wording.
- Do **not** touch `FleetIssuance` / `shipIssuance*` strings or arithmetic; they are the raw measurements the packet wants kept exact.
- Design C conflicts with sticky-hold/teleporting and the authored-anchorage contract; do not land it inside this slice.
- Do not rename `riskDepth` here (wide blast radius: world-types, ship-placement, motion, detail, ledger, tests); doc-only.

## Enhancements

1. **Rename the panel row label `Net flow 24h` → `Est. net flow 24h`** (value, chip, panel, ledger). Value: scanner-level honesty without reading the sentence. Cost: 3 files + 3 test expectations (`detail-model.ts:1026`, `format-detail.ts:145,407`, `accessibility-ledger.tsx:446-449,466`, `format-detail.test.ts:209-236`, `detail-model.test.ts:1721`). Risk: low. Direct correction (optional).
2. **Make the allocation denominator subset-stable** — denormalize each coin over the payload scope instead of the rendered ∩ scope set, and count coins whose presences are entirely outside the rendered scope as `unattributed` (today they vanish, `cargo-tide.ts:224-240`). Value: harbor-subset changes stop inflating measured-looking figures at the source. Cost: cargo-tide + unattributed accounting + tests; likely interacts with the U0/S1 coverage/status model. Risk: medium (more quays may correctly read unverifiable). Operator decision; recommend after the wording fix.
3. **Stronger cue disclosure** — the cue `sourceField` already says "allocated … by each coin's chain presence" but `sourceField` is not rendered in the ledger; move that sentence into `visual`/`domEquivalent` (part of design B step 2). Value: redundancy beyond the row value. Cost: trivial. Direct correction.
4. **Restore strictly monotone spatial score (Design C/M1)** with monotonicity, legal-water, collision, and refresh-churn tests. Value: makes the original "score draws the berth" idea true. Cost: high (candidate windowing, quantization, sticky interaction, banding). Risk: high. Operator product decision; conflicts with the churn-avoidance rationale.
5. **Internal naming hygiene** — `riskDepth` → `dewsScore`, `DockCargoTide.tracked: true` → an explicit `estimatedAllocation`/`measured` discriminant. Value: stops the next maintainer re-deriving the retracted claims from identifiers. Cost: broad mechanical rename. Risk: low but noisy. Operator decision.

## Open decisions for the operator

1. **Retire vs restore the within-water spatial score.** Recommended default: retire the wording now (design A), keep the score exact in the record, and treat Design C as a separate, explicitly accepted product change with its own monotonic/safety tests (the packet's own deferred alternative).
2. **Where the exact DEWS reading lives in the panel.** Recommended default: fold into the `Currently` line (zero new rows); alternative: its own identity row if the operator accepts the density risk.
3. **Quay wording length.** Recommended default: the full string with "renormalized across rendered in-scope chains"; compact alternative given in Stop conditions.
4. **Row label rename (`Est. net flow 24h`).** Recommended default: yes, cheap and independently revertible; the value carries the substantive disclosure either way.
5. **Semantic denominator fix (Enhancement 2).** Recommended default: not in this slice; schedule with U0/S1 coverage states, since the honest fix needs to say *why* a scoped-out coin's flow is not attributed (unrendered vs unmeasured) — a status model this slice does not own.

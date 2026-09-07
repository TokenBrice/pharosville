# Composition consensus plan — sea-zone ladder, cemetery water, berth truth

Date: 2026-09-07. Starting revision: current `main` (worktree carries an
unrelated operator edit to `src/systems/palette.ts`; leave it alone).
Objective: implement the consensus of the 2026-09-07 composition review
(two independent reviewers: `agent://ComposerAstra`, `agent://ComposerSystems`;
ground truth in `outputs/compose-map.txt`, regenerable with
`npx tsx outputs/compose-map.ts`).

Verdict being acted on: the harbour-garden composition (island + lighthouse,
eight-mouth ring, two openings, SW graveyard) **holds and is not re-authored**.
What is wrong is the *risk map inside it* and three descriptions the code
makes about itself that the field refutes.

## 0. Baseline facts (measured, not assumed)

| Fact | Value | Source |
| --- | --- | --- |
| Map | 140×140 tiles, centre (69.5, 69.5) | `world-layout.ts:40-42` |
| Island | x 58–88, y 64–82; `LIGHTHOUSE_TILE` (60,70) | dump; `world-layout.ts:56` |
| Body tiles | calm 4798 · open 3841 · watch 1920 · ledger 1601 · alert 1282 · wreck 1120 · danger 801 · warning 638 (16,001 total) | dump counts |
| Shares vs `SEA_BODY_TARGET_SHARE` | all eight within 0.01 pt | `world-layout.test.ts:194-205` |
| Watch \| Danger seam | 9 sampled contacts, (120,50)→(128,58) | dump rows 50–58 |
| Watch \| Warning seam | 6 contacts, (114–120, 48–52) | dump |
| Calm \| Watch seam | **0** | dump |
| Alert \| Danger seam | 4 contacts | dump |
| Wreck \| Open seam | 0 (wreck is a cul-de-sac inside calm + rim) | dump |
| Wreck water nearest the Mole | (14,96) is wreck; Mole mouth is (15,95) | dump rows 94–96 |
| `danger-gorge` (131,59) | boundary tile: (130,60)=watch, (132,58)=danger | dump row 58 |
| Alert finger in Warning band | x+y=140 diagonal reads alert→warning→alert@(118,22)→warning→danger | dump rows 20–24 |
| North cap between openings | x 76→126 at y=0 (~50 tiles wide), gone by y=14 | dump rows 0–14 |
| Rest camera (all gates, zoom 0.72 / 0.60) | frames Mole→lighthouse→island; cemetery at screen x≈−318, both openings and Danger off-frame | `outputs/rest-frame.ts` |

The existing "escalation" gate (`world-layout.test.ts:220-239`) orders body
**centroids** by `(x−y)`. It is green today while Watch sits outboard of Alert
and touches Danger — it cannot fail on the fault being fixed. It is replaced in
WP1, not kept alongside a stronger test.

## 1. Scope

In scope (consensus, ranked by impact):

1. **WP1** Re-cut the east so W→E reads open → watch → alert → (warning) → danger; Watch must not touch Danger.
2. **WP2** De-finger the NE corner so the diagonal reads open → alert → warning → danger monotonically.
3. **WP3** Pull wreck water off the Ethereum Mole's stern.
4. **WP4** Swap the Solana and Hyperliquid berths so the flagship peg is not moored in Danger Strait.
5. **WP5** Correct the stale self-descriptions in code comments.

Optional, not consensus (Astra only) — **do not do unless the operator asks**:
- Widen the NW opening (`bearingEnd −85° → −70°`) to narrow the north cap.
  Touches the rim contract (`garden-rim.test.ts:71-104`), perimeter coverage
  band 55–65 %, the north berth's rim depth, and VISUAL_INVARIANTS' "two
  openings" language. The rest camera never shows the cap, so impact is
  whole-map-zoom only.
- Thin the nearest wreck group (`WRECK_GROUP_SIZES [5,4,4,5] → [5,4,4,3]`,
  `src/three/garden-landmarks.ts`). Same reason: off-frame at rest.

Non-goals: moving the lighthouse, island, cemetery centre/ellipse, pigeonnier,
any rim contour or opening, the eight cove tiles except `danger-gorge` if WP1
forces it, DEWS band semantics, colours/swell per body, station forms.

## 2. Tooling and the iteration loop

All field work is done in `src/systems/sea-bodies.ts` seeds and then
**re-solved**; never hand-tune `SEA_BODY_REACH`.

```bash
# 1. Render the partition after a seed change (fresh cache every run)
CALIBRATE_SEA_BODIES=1 npx vitest run src/systems/sea-bodies.map.test.ts
# 2. Re-solve reach against SEA_BODY_TARGET_SHARE; paste the printed block into SEA_BODY_REACH
CALIBRATE_SEA_BODIES=1 npx vitest run src/systems/sea-bodies.calibrate.test.ts
# 3. Re-dump with markers + counts (throwaway, already in outputs/)
npx tsx outputs/compose-map.ts > outputs/compose-map.txt
# 4. Focused gates
npx vitest run src/systems/world-layout.test.ts src/systems/garden-rim.test.ts \
  src/systems/risk-water-areas.test.ts src/systems/risk-water-placement.test.ts \
  src/systems/garden-sea-regions.test.ts src/systems/garden-zone-coverage.test.ts \
  src/systems/chain-docks.test.ts src/systems/pharosville-world/stages/dock-assignment.test.ts
```

Loop per seed edit: (1) → eyeball → (2) → paste → (3) → (4). The calibrator
re-imports the module graph per round (see its header) — a seed edit without
step (2) will trip the ±2 pt share band at `world-layout.test.ts:203`.

Add a **seam counter** to `outputs/compose-map.ts` before starting WP1: for
every 4-neighbour pair of water tiles with different bodies, count by
unordered pair. This is the number the acceptance criteria below are written
against; the same routine becomes the test helper in WP1.4.

## 3. Work packages

### WP1 — East side: put Watch inboard of Alert, off Danger

**Target:** `src/systems/sea-bodies.ts` `SEA_BODIES` (`watch` :190-201, `alert`
:202-210, `danger` :223-233), `SEA_BODY_REACH` :141-150,
`src/systems/garden-rim.ts` `danger-gorge` :133,
`src/systems/world-layout.test.ts` :220-239.

**Change:**

1. Watch shoulder — move it south and inboard so it no longer reaches the
   (120,50) corner. Trial: `capsule(0.72,0.46,0.80,0.80,0.12)` →
   `capsule(0.78,0.54,0.80,0.80,0.12)`. Keep the inner-bank run
   `capsule(0.88,0.48,0.86,0.66,0.07)` only if it still connects; if it is
   what carries Watch up to Danger, shorten its northern end to `0.88,0.56`.
   Keep the pigeonnier reach `capsule(0.56,0.84,0.95,0.93,0.085)` untouched
   (TON's wharf must stay Watch: `garden-rim.test.ts:236`, `PIGEONNIER_STATION_SLOT.body`).
2. Alert tail — extend it east and south so Alert occupies the water Watch
   vacates and becomes the buffer against Danger's continuation. Trial:
   `capsule(0.68,0.24,0.62,0.44,0.065)` → `capsule(0.70,0.28,0.76,0.46,0.065)`.
3. Danger continuation `capsule(0.90,0.27,0.94,0.43,0.035)` — shorten to
   `0.94,0.38` if it still meets Watch after 1–2. Do not remove it: it is what
   gives `danger-gorge` its water (`garden-rim.ts:131-133`).
4. Re-solve reach (§2 step 2), paste.
5. `danger-gorge` (131,59): after the re-cut, re-check
   `terrainKindAt(131,59) === "storm-water"` (`garden-rim.test.ts:236`). If it
   fell into alert, move the mouth **north along the east shore** to the first
   tile that is storm-water, `rimShoreDistance ∈ (0,2]`, ≥6 tiles from
   `watch-east-bay` (132,80) and `warning-stone-notch` (118,10), outside both
   openings, with rim land within 14 tiles westward (`world-layout.test.ts:282-289`).
   Candidate band: x 131–132, y 48–56. Do **not** re-body the cove to alert:
   Danger must keep a mouth or body diversity drops to 5 < 6
   (`world-layout.test.ts:293`; `garden-rim.test.ts:251` pins the exact set).
6. Replace `world-layout.test.ts:220-239` ("keeps the escalation running
   north-east…") with a seam-adjacency test (helper: the seam counter from
   §2). Assert:
   - `seam("watch","danger") === 0`
   - `seam("calm","watch") === 0` is **not** asserted (open separates them by
     design, D2) — instead assert `seam("open","watch") > seam("alert","watch") > 0`
     and `seam("alert","danger") <= seam("warning","danger") / 4`.
   - Keep the pole assertions (`danger` centroid x > 0.6·W, y < 0.4·H;
     `wreck` centroid x < 0.4·W, y > 0.6·H).
   Delete the centroid-bearing ladder; it pins nothing observable.

**Side effects to check:**
- `risk-water-areas.test.ts:105-149` orders *label tiles*; label/anchor tiles
  are snapped into their body (`risk-water-areas.ts:260-270`) so they follow
  the re-cut. `watch.y > alert.y` etc. should still hold; if the Watch label
  snaps north, move the authored `labelTile` (`risk-water-areas.ts:110-111`)
  south within design space rather than loosening the test.
- `world-layout.test.ts:207-218` contiguity > 0.9 per body — Watch's
  pigeonnier arm is the fragile one (`sea-bodies.ts:377-383`).
- `world-layout.test.ts:241-252` derived anchors body-local.
- Ship density: watch share stays 0.12 by calibration, but Watch's *shape*
  changes; check `garden-fleet-placement.test.ts` and the dense fixture in
  `motion.test.ts` still pass (they are slow; run once at the end of WP1).
- `docs/pharosville/RUNTIME_FACTS.md` is generated: `npm run docs:runtime-facts`
  after any cove tile change.

**Acceptance:** seam table from the dump shows watch|danger = 0 and
watch|warning = 0; a W→E scan at y=54 reads open → alert → watch is **gone**
and instead reads open → watch → alert → danger (or open → alert → danger with
watch entirely south of y≈60); all eight shares within ±2 pt; all six named
mouths still in their declared body; focused gates green.

### WP2 — De-finger the NE corner

**Target:** `sea-bodies.ts` `alert` seed :207.

**Change:** tip `capsule(0.755,0.04, 0.66,0.26, 0.075)` →
`capsule(0.73,0.06, 0.66,0.26, 0.075)`. Re-solve reach. Combine with WP1's
calibration round — one paste, not two.

**Acceptance:** along x+y=140 from (60,80) to (135,5), the body sequence has
no repeats: open → alert → warning → danger. Add this as one assertion in the
WP1.6 test (walk the diagonal, collapse runs, assert the collapsed list
equals `["open","alert","warning","danger"]` after dropping leading
calm/open). `warning-stone-notch` (118,10) must stay warning-water.

### WP3 — Pull wreck water off the Mole

**Target:** `sea-bodies.ts` `wreck` seed :237; `world-layout.ts:146-148` comment.

**Change:** `capsule(0.08,0.82, 0.24,0.95, 0.11)` →
`capsule(0.09,0.87, 0.24,0.95, 0.10)`. Re-solve reach (same round as WP1/2).
Expected: wreck's north lobe retreats from y≈96 to y≈104+; share 0.07 → ~0.06
is inside the ±2 pt band. If the solver pushes wreck's reach up to recover
0.07 and the lobe returns, lower `SEA_BODY_TARGET_SHARE.wreck` to 0.06 and
state why in the comment at :267-276 (traffic to the graveyard is graves, not
ships; the share was sized for the old 89-hull field).

**Side effects:**
- `wreck-shoal-east` (31,125) must remain wreck-water (`garden-rim.test.ts:236`).
- Every grave stays on wreck-water (`world-layout.test.ts:395-401`); the
  ellipse is y ≥ 115, so a lobe retreat at y<105 cannot touch it.
- `garden-water-exclusion.ts` `GARDEN_CEMETERY_OBSTACLE` is measured off
  rendered hulls, not the water body — unchanged.
- Calm's south-west anchors (`risk-water-areas.ts:88-99`) re-snap into calm;
  fine.

**Acceptance:** `terrainKindAt(x,y)` for every water tile within Chebyshev
distance 6 of (15,95) is calm-water; wreck|calm seam count drops; graves and
the wreck mouth unchanged.

### WP4 — Swap Solana ↔ Hyperliquid berths

**Target:** `src/systems/world-layout.ts` `PREFERRED_DOCK_STATIONS` :125-126.

**Change:**
```ts
solana: OUTER_HARBOR_STATION_SLOTS[3]!, // market hall, watch east bay (east)
hyperliquid: OUTER_HARBOR_STATION_SLOTS[1]!, // fishing pier, danger gorge (east)
```
Rationale for the record: a trading venue moored at the storm gorge reads as
the place's weather; the flagship peg moored there reads as a false depeg.
Arbitrum (storm mole, wreck water) and Tron (stepped inlet, warning shoals)
stay — their station copy already speaks as the *place* (`detail-model.ts:171-178`
is band-keyed for areas; station copy is not band-keyed). No copy change.

**Pins to update (re-pin to the new binding, do not delete):**
- `chain-docks.test.ts:133,140` — Solana's tile/type become
  `PREFERRED_DOCK_TILES.solana` / `"uogashi"`; add the mirror for
  hyperliquid → `"fishing-pier"`.
- `chain-docks.test.ts:493-517` — the "generic chain outranks hyperliquid"
  case: sui now inherits **danger-gorge / fishing-pier**, not
  watch-east-bay / uogashi. Update both expectations and the comment.
- `dock-assignment.test.ts:294-301` — `MOVED_TILE = PREFERRED_DOCK_TILES.solana`
  is only a "far side of the rim" fixture; watch-east-bay (132,80) is still
  far from the Mole, so the test holds; update the comment wording
  ("Solana's watch-east-bay mouth").
- `docs/pharosville/RUNTIME_FACTS.md:123` lists preferred chain IDs (order,
  not berths) — regenerate anyway (`npm run docs:runtime-facts`) and diff.
- grep `src/` and `docs/` for `fishing-pier` / `danger-gorge` / `uogashi`
  paired with `solana` or `hyperliquid` in fixtures (`src/__fixtures__/`),
  visual specs (`tests/visual/`), and snapshots; re-pin.

**Acceptance:** `buildChainDocks` with the standard fixture feed puts
`solana` at (132,80) `uogashi` and `hyperliquid` at the danger mouth
`fishing-pier`; the full ring is still eight docks; `npm run docs:runtime-facts`
produces no drift.

### WP5 — Stale self-descriptions

Edit comments only; each edit must state what the field actually does.

| File:lines | Currently claims | Replace with |
| --- | --- | --- |
| `sea-bodies.ts:152-160` (D4) | "escalation stays monotonic along a north-east bearing: Calm → open → Watch → Alert → Warning → Danger" | Poles hold (Danger NE, Wreck SW). Ladder reads outward from the island: open ring → Watch (E/SE, inboard) → Alert → Warning → Danger along the NE diagonal; Watch never touches Danger; guarded by the seam test in `world-layout.test.ts`. |
| `sea-bodies.ts:187-190` | Watch is "the water between the anchorage and the alert channel" | After WP1 this becomes true; keep the sentence, add "inboard of Alert on the east shelf". If WP1 lands Watch entirely south of Alert instead, say that. |
| `sea-bodies.ts:174-176` | Ledger is "the mooring shelf along the northern **shore**" | "along the northern edge, running out through the borrowed-horizon opening — there is no northern shore on that arc." |
| `sea-bodies.ts:239-242` | open sea includes "a channel running south to the map edge" | "a channel running south to the south rim" (rim closes y ≥ 134). |
| `world-layout.ts:146-148` | "Cemetery remains a separate memorial islet … bottom-left edge" | Delete these two lines; the N2 comment at :149-150 is the correct one. Also `CEMETERY_ISLAND_RADIUS` :155-156 — check for readers (`lsp references`); if none, delete the constant. |
| `garden-rim.ts:33-35` and `RIM_DESIGN_NOTES[0]` :146 | "short, deep headland" / "steep, narrow headland divides them" | "a broad, shallow cap (~50 tiles wide at the north edge, ~12 deep) divides them; the two-passage reading comes from the openings' bearings, not from a narrow spit." Only if the optional NW-opening change is **not** taken. |

`RIM_DESIGN_NOTES` is exported and may be consumed by docs or the mesh-author
handoff — `lsp references` before editing; if a test pins the string, re-pin.

## 4. Order of execution

1. Extend `outputs/compose-map.ts` with the seam counter; capture the
   **before** dump to `outputs/compose-map.before.txt`.
2. WP1.1–1.3 + WP2 + WP3 seed edits together (one calibration round).
   Render (§2 step 1), iterate seeds until the WP1/2/3 acceptance shapes are
   visible in the ASCII render, then calibrate and paste.
3. WP1.5 cove check; move `danger-gorge` only if forced.
4. WP1.6 / WP2 tests. Confirm the new test **fails** against the before-state
   (stash the seed edit, run, unstash) — that is the regression proof.
5. WP4 swap + pin updates.
6. WP5 comments.
7. Regenerate: `npm run docs:runtime-facts`.
8. Focused gates (§2 step 4). Then the slow motion/fleet suites once.
9. `npm run validate:changed`.
10. Visual confirmation on the real GPU only: `npm run preview` at whole-map
    zoom — the rest frame does not show any of the changed water except the
    Mole's stern (WP3). Capture `outputs/composition-after-wholemap.png` and
    `outputs/composition-after-mole.png`. Never read frame times or colour
    from a Playwright browser (AGENTS.md).
11. Changelog entry in `src/content/pharosville-changelog.ts` (new id
    `2026-09-07-true-waters` or similar, version per
    `docs/pharosville/RELEASES.md`); bullets: Watch re-cut inboard of Alert
    and off the strait; NE corner ordering; graveyard water pulled off the
    Mole; Solana and Hyperliquid trade berths. State explicitly that no
    harbour count, cemetery, lighthouse, rim, or opening moved.

## 5. Acceptance (whole plan)

- Seam table (after): `watch|danger = 0`, `watch|warning = 0`,
  `alert|danger` small (≤ 25 % of `warning|danger`), `wreck|open = 0`.
- Diagonal x+y=140: collapsed sequence `open, alert, warning, danger`.
- No wreck-water within Chebyshev 6 of (15,95).
- All eight shares within ±2 pt of target; every body ≥ 0.9 contiguous.
- `RIM_COVES` still 8, same id set, six named bodies with a mouth
  (`calm, watch, warning, danger, ledger, wreck`), `alert` still mouthless.
- Solana at watch-east-bay/uogashi; Hyperliquid at danger-gorge/fishing-pier.
- New seam/diagonal test fails on the before-state and passes after.
- `npm run validate:changed` green; `check:runtime-facts` no drift.
- Whole-map `npm run preview` capture shows Watch water no longer meeting the
  strait's storm water on the east shelf.

## 6. Risks and fallbacks

- **Solver oscillation** between Watch and Alert on the east shelf (they now
  compete for the same water). Damped fixed point should converge; if shares
  land outside ±2 pt after 80 rounds, reduce Watch's shoulder radius 0.12 →
  0.11 rather than touching `BOUNDARY_RELIEF` (0.60 is a topology ceiling,
  `sea-bodies.ts:375-383`).
- **Watch fragmentation**: the pigeonnier arm is thin. If contiguity < 0.9,
  widen `capsule(0.56,0.84,0.95,0.93,0.085)` to r 0.095 before moving
  anything else.
- **`danger-gorge` loses storm water** and no valid storm tile exists on the
  east shore within the constraints: shorten Alert's tail (WP1.2) end from
  `0.76,0.46` to `0.74,0.42` — Danger's continuation must keep a shore
  contact at y ≈ 48–60.
- **Label test** (`risk-water-areas.test.ts:118-126`) flips: move authored
  `labelTile`s in design space; never relax the inequalities.
- **Visual density**: same shares, different shapes — Watch ships thin out of
  the NE and pack the E/SE shelf. Acceptable; that is where "early-warning"
  water belongs. Re-check `garden-fleet-thinning.test.ts`.

## 7. Cleanup

- Keep `outputs/compose-map.ts` (it is now the seam tool) — but nothing in
  `outputs/` is committed. If the seam counter proves useful beyond this
  pass, promote it into `src/systems/sea-bodies.map.test.ts` (already
  `CALIBRATE_SEA_BODIES`-gated) rather than a new script.
- Delete `outputs/rest-frame.ts` and the `.before.txt` dump when done.
- No docs other than RUNTIME_FACTS regeneration and the changelog entry
  unless `RIM_DESIGN_NOTES` wording is mirrored in `docs/pharosville/`.

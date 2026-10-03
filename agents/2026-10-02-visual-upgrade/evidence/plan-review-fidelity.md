# Fidelity review — `agents/2026-10-02-visual-upgrade/01-implementation-plan.md` (reviewer: glm-fidelity)

Scope: every number in plan §1, §2 and the `Verified.` paragraphs of §6 checked against `evidence/*-report.md`, `evidence/*-audit.md`, the repo at `599c822`, and `outputs/baseline-2026-10-02/*.json`; every audit must-fix traced into the plan; packet PDF + companion README cross-checked for unadopted claims. Read-only; no repo file touched.

## Findings

| # | Severity | Plan location | Evidence | Proposed replacement / addition |
|---|---|---|---|---|
| 1 | minor | §6 U0a (Files/Steps; also §5 ownership row for `visual-cue-registry.ts`) | v2-u0-audit must-fix 1: "`visual-cue-registry.ts` domEquivalent strings + their test pins" must be "a named in-repo contract and synchronization owner for U0". The plan lists the file in U0a's Files and the §5 table, but **no U0a step** tasks reconciling the `domEquivalent` strings, which are rendered verbatim into the shipped ledger and already promise the rows U0a composes (`visual-cue-registry.ts:292,160,215,278,127,116,138,149` per the audit). S1b step 4 does this for the DEWS cue, showing the pattern is needed. | Add to U0a Steps (as step 8): "`visual-cue-registry.ts`: reconcile every `domEquivalent` string and its test pins with the composed rows — the ledger renders them verbatim and several already promise the rows this packet adds (Peg deviation, Harbor light, Station/Rim cove, Water surface, Quay haze, Depeg roost/Notable movers); update any whose row shape changes (folded vs standalone), and keep the cue registry named as the synchronization owner for record-row wording." |
| 2 | minor | §1 W1 ("What is actually true") | Plan: "not monotone **except for the first-placed ship in each water**". v9-score-quay-audit, Missed risks 2, refines the report: "Even first-placed ships are not strictly monotone in dense waters: `usde-ethena` is the largest ship in safe-harbor (12B) and still has ρ=0.984 with one decrease — the `nearestRiskPlacementWaterTile` snap breaks strict x−y ordering before the spread ever runs." Authority order is plan > audits > reports, but the plan here repeats the report's claim the audit corrected, without explanation. No executor harm (D8 already requires a "monotone preferred-tile snap"), but the sentence is false as written. | Replace with: "The response is real but **not monotone** — not even reliably for the first-placed ship in each water (`usde-ethena`, first-placed in safe-harbor, still takes one backward step because the preferred-tile snap is not strictly ordered; `dai-makerdao` never moves; `usds-sky` moves only at 100)." |
| 3 | minor | §6 S1c-2 / §4 D12 (nothing scheduled) | Companion README, "Tests the fixture shape cannot express yet": "**PSI candidate interrupted by staleness: preserve accepted historical state, restart acceptance observation, expose observed-versus-easing record text**". The plan covers PSI as-of/`inputDegradation` (S1c-2 step 3) and the lamp's observed-vs-eased distinction (D12, U0a step 3), but no packet schedules the PSI-specific observed-versus-easing record disclosure or the acceptance-restart sequence test. | Add a test row to S1c-2 Tests: "`detail-panel.test.tsx`: `stale PSI keeps the accepted historical reading and discloses observed versus eased appearance` (last accepted PSI retained with its as-of and a held qualifier; the eased sky presentation named separately, mirroring D12 for the lamp)" — or fold the same wording into D12's decision text. |
| 4 | minor | §1 W-table / §4 decisions (absent) | Packet p.5 "Risk and atmosphere" deferred alternatives: "Retained geography, **squad escape** or PSI-only sea behavior each need their own decision and tests." The plan handles retained geography (D6 defer) and PSI-only sea (W1 extension note "No PSI-only sea (that is a product decision)"), but "squad escape" (a distressed member leaving the shared formation) appears nowhere — neither adopted, corrected, nor scheduled. | Add one row to §4: "D26 | Squad escape (distressed member leaving the shared formation) | Out of scope here; formation policy stays as-is (U0a leads the Formation row with own distress). Any escape policy is its own later product packet with navigation/formation-state tests. | U0a". |

No blockers and no majors found. Every number I could re-derive matched (details below).

## §2 baseline — re-derived from `outputs/baseline-2026-10-02/*.json`

- `preflight-calm.json`: tier full, p90 16.7, tailSweep p95 16.8, calls 145, triangles 296,239, geometries 160, textures 50, ships 2 → plan row 1 exact ("16.7 / 16.8").
- `calm-reduced.json`: calls 131, triangles 232,939, 160/50, ships 2, samples 0 (static n/a) → row 2 exact.
- `dense-assert.json`: p90 16.7, tailSweep p95 16.8, calls 173, triangles 357,753, geometries 176, textures 50, ships 132, logos 131/131 → row 3 exact.
- `dense-day.json` / `dense-night.json`: 156 / 286,999 / 174 / 50 / 132 and 156 / 286,458 / 174 / 50 / 132; targets `#t=12.25&d=2026-09-26` and `#t=22&d=2026-09-26` match the stated arms → rows 4–5 exact.
- Ninths: day `[47.69, 57.09, 56.70, 41.25, 39.53, 44.56, 14.46, 19.19, 23.61]` and night `[12.98, 13.76, 15.40, 9.47, 9.26, 10.12, 0.83, 0.61, 0.99]` round to the plan's table exactly; targets match `VISUAL_INVARIANTS.md:29-36` (noon 60/72/68·27/45/42·15/38/23; night 9/14/11·5/12/8·3/7/4); recomputed MAE 8.98≈9.0 / 3.28≈3.3 and r 0.859≈0.86 / 0.755≈0.76; bottom-middle misses 18.8≈19 (day) and 6.4≈6 (night); night bottom row all < L*1. Renderer string "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)".
- Bundle: 986,112 − 980,562 = 5,550 B JS spare; 8,192 − 7,974 = 218 B CSS spare — matches §2 and W-table; independently re-measured by v7 report + audit.
- Not independently re-derived: "2,095 passed / 2 skipped, 195 files" and the orchestrator's typecheck/lint/build ✓s (full-suite runs are outside this review's allowed commands; they are attributed to the orchestrator and nothing in the evidence contradicts them).

## Spot-verified repo facts (all match)

`preview.mjs:157` fixture whitelist; `:274` `args.hash ?? "#t=12"`; `:361` `if (clock && !fixture)`; `:2014` `installFlowingDate`; `:2097` CI→skip; `preview-fixture.mjs:2,13-23` fixed Date at epoch+60 s; `pharosville-world.tsx:195-199` omits `reducedMotion`; `use-world-time-controls.ts:43-57` 1 s Date tick; `garden-score.ts:581-584,631-635` unconditional companion catch-up; `garden-observatory-slice.ts:33` / `garden-fleet-batch.ts:73` = 320; `ship-placement.ts:82` trim ladder (±50→±0.08, ±200→±0.16, stale→0); `ship-issuance.ts:5,29-34` draft formula; `garden-threshold.ts:577-581,601-605` six anchors; `garden-flora.ts:111-123` `mix(1.0, 0.055, uNightValue)`; `garden-threshold.test.ts:128-130` ≤15,000; `garden-island.ts:939,2310` two crag callers; `format-detail.ts:44-47` calm early return; `chain-docks.ts:14` MAX_CHAIN_HARBORS=8; endpoint keys = 7 while `accessibility-ledger.tsx:597-605` lists six (no mintBurn); `TESTING.md:471` 72/72 textures; `VISUAL_INVARIANTS.md:62` night sky L*7–15. Companion exports `quietNormalInput`/`denseQuietArtInput`/`denseMixedCapacityInput`/`installFlowingFixtureDate` with STEADY/82, CRISIS/25, BEDROCK/98, FLAT, T=1,700,000,000 s — all as the plan's H0 tests expect. All npm scripts the plan names exist (`worktree:new`, `onboard:agent`, `test:guard-scripts`, `validate`, `validate:release`, `test:visual:dist:interaction`, `test:visual:cross-browser`, `check:pharosville-colors`, `docs:runtime-facts`, …).

## Audit must-fix coverage

| Audit | Must-fix | Landed in plan |
|---|---|---|
| v1-c0 | (verdict: none; polish a/b cite fixes; c knockout-off guard + content-swap record reset) | c → C0 Tests header ("run with the visual-debug knockout **off**") + C0 step 3 ("Reset the record on content replacement, comparing values"); a/b not repeated by the plan |
| v2-u0 | 1 cue-registry domEquivalent sync owner | **Partial — finding 1** (file in Files/§5, no step) |
| v2-u0 | 2 name `composeCurrently` calm early return | U0a step 2 "in every branch including the calm early return"; S1b step 2 cites `:44-47` |
| v2-u0 | 3 rewrite whole "does not render dropped fields" test | U0a Tests ("Rewrite `detail-panel.test.tsx:122-132`…") |
| v2-u0 | 4 budget/descope DEX-disagreement fixture | U0a Tests ("budget it or drop that one combination") |
| v2-u0 | 5 ≤8 comment sweep incl. `format-detail.test.ts:89-90`, `detail-panel.test.tsx:161` | U0a step 7 (names both) |
| v3-a1 | 1 drop `--draw-census` from `--reduced` arms | §7.2 (census only in the animated step-3 arm) + explicit "Do **not** combine `--draw-census` with `--reduced`" |
| v3-a1 | 2 "3,872 unchanged triangles" wording | Not repeated by the plan (no stale copy) |
| v3-a1 | 3 `installFlowingDate` cite | Plan cites `preview.mjs:2014` (matches corrected range) |
| v4 | 1 `worldRenderContentSignature` churn | S1d Verified + step 6 + `world-render-content-signature.test.ts` oracle + §1 "issuance provenance would churn the motion epoch" |
| v4 | 2 `buildShips` → `buildShipsStage` | S1d step 2 / Files |
| v4 | 3 drop `GARDEN_SCALAR_TRANSITION_SECONDS` import + `shipIssuanceDraft` test import | S1a step 3 (`:92`, lint) + Tests (`:6`) |
| v4 | 4 `visual-cue-registry.test.ts` as affected caller | S1a step 5 (`:128-132,259-263`); S1d step 7 |
| v5 | 1 'held' vs four-value enum | S1c-1 step 2 DOM vocabulary ("held (as of …)") |
| v5 | 2 companion path re-pin | H0 installs at `src/__fixtures__/data-contract-scenarios.ts` (wave 1, before S1c-1); §2 notes it is not in the tree |
| v5 | 3 `now-caption.tsx` + `visual-cue-registry.ts:157` + mandatory memoization | S1c-1 Files (both) + step 4 ("this is mandatory") |
| v5 | 4 "other six remain current" needs fresh meta | S1c-1 Tests ("fresh meta on the six untouched sources") |
| v5 | 5 cosmetic cites | N/A (plan uses its own verified cites) |
| v6 | 1 T=1.7e9 cite re-point | N/A (plan cites the fixture module, correct) |
| v6 | 2 companion absent at HEAD; use `.mjs` installer | W6 + H0 step 1 (delete TS helper) + C1b step 1 (move `.mjs` installer) |
| v6 | 3 companion-resume test vs 90 s silence | C1a Tests parenthetical |
| v6 | 4 tsxRequire under `node --test` | C1b Tests header |
| v6 | 5 cosmetic cites | N/A |
| v7 | 1 $11,237,782,400 vs $11,615,145,600 | W14 (exact audit numbers incl. +$377,363,200) |
| v7 | 2 `gardenSkyDay` second tsxRequire | H0 step 4 |
| v7 | 3 jsdom pragma + spec imports | H1 Tests ("add `// @vitest-environment jsdom` or read through `globalThis`") + step 3 ("add the missing fixture/world-builder imports") |
| v7 | 4 drifted line cites | N/A (plan's cites independently verified) |
| v7 | 5 phaseForHour echo test | H0 manifest test ("fixed (date, hour) pairs and the null branch, not a re-derivation") |
| v8 | 1–2 citation fixes | N/A |
| v8 | 3 cache-collision hazard = potential only | A2 Verified ("today's compiled programs already differ through standard parameters, so the key-collision risk applies to future parameter-identical consumers") |
| v8 | 4 (optional) "Garden record, 30d" clause | Optional; U0a step 3 folds it as a distinct clause (no span-disclosure change scheduled — acceptable per "optional") |
| v9 | 1 capitalized tails vs prefix | S1b step 6 ("keep each existing tail verbatim (including the capitalized `Balanced —` / `No issuance activity in 24h`)") |
| v9 | 2 `Est. net flow 24h` re-cost if adopted | Moot — D9 keeps the row label |
| v9 | 3 minor cites | N/A |

Also folded (audits' missed risks): 200-row debug cap snapshot (C1b step 4), frozen `admittedAtWallMs` → unmeasured (C1b step 4 + test), `selectGardenTransientShip` `:186` sharing the override (H1 step 1), light-cycle four settles (C0 acceptance note), `plantPine` returned pad order for the existing test (A1 step 1), `--hash '#'` bypass (W5/C1b step 2), settled-static requirement on `--reduced --assert` (§7.2), fresh-meta prerequisite for the `it.each` oracle (S1c-1), memoized status map (S1c-1 step 4).

## Packet-claim coverage (PDF + companion README)

Adopted/scheduled: direction, C0/U0/A1/A1b/A2/P1/B1/W1/S1a–S1d/S2/C1a/C1b/H0/H1/I0, all counterfactual families, capture manifest, preflight/deploy-gate/exit semantics, tiered picture matrix, 30-minute watch, reading review, stop/rollback, executor brief. Corrected via W-table: W1–W15 (each verified against its slice evidence; see spot-checks above). Gaps found: finding 3 (PSI observed-vs-easing sequence test) and finding 4 (squad escape deferred alternative). The packet's own "current verification scope" totals (743 renderer tests etc.) need no plan action.

## Overall

The plan is a faithful transcription: all §1/§2/§6 numbers I could re-derive — baseline table, ninths (including MAE/r), bundle bytes, triangle/owner counts, line cites, constants — match the evidence, audits, captures, or repo exactly, and 33 of 35 audit must-fixes are demonstrably folded in (one partial → finding 1; one optional, acceptably unaddressed). The four findings are minor precision gaps: an untasked cue-registry sync step, one W1 sentence the v9 audit refuted, one companion sequence oracle never scheduled, and one packet deferred-alternative ("squad escape") with no home. No executor-blocking or rework-inducing error was found.

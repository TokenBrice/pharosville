# Garden Observatory — execution overrides (authoritative)

Date: 2026-10-05. Branch: `feat/garden-observatory` (from `main` @ `ccbfca8`).

**Authority order for every implementation task:**

1. Operator decisions (`00-implementation-plan.md` §4).
2. This file.
3. Plan §5–§9.
4. Spec text in `specs/`.

Where a spec disagrees with a higher source, the higher source wins. Report the conflict; do not silently pick the spec.

## 1. Execution mode (supersedes plan §5.1 worktrees)

**Shared tree.** All implementation agents edit the **same working tree** on `feat/garden-observatory`. Other agents may be editing other files at the same time.
- Touch only the files your packet names, plus the doc sections and tests it names.
- If an edit fails on a stale snapshot tag, re-read the file and re-apply. Never revert, reformat or reorder content you did not write.
- **Shared seams:** `src/three/world-renderer.ts`, `src/pharosville-world.tsx`, `scripts/pharosville/preview.mjs`, `docs/pharosville/CONTRACTS.md`, `docs/pharosville/VISUAL_INVARIANTS.md`, `docs/pharosville/TESTING.md`, `docs/pharosville/ASSET_PIPELINE.md`, `CHANGELOG.md`. Make minimal, localized insertions or edits in these, never wholesale rewrites.

**Agents edit only.** No tests, typecheck, lint, build, formatters, `npm run preview`, Playwright, browsers, or git commands that change state.
- Write and update the tests your spec names; the orchestrator runs them.
- Read-only diagnostics such as `git log`/`git show`, `curl` against `http://localhost:5173/api/*`, or a `node -e` schema probe are allowed when a packet explicitly needs diagnosis (S3-P7, S9-P4).

**Orchestrator owns** gates, GPU captures (serialized), visual review, bundle-cap edits (`scripts/bundle-budgets.mjs`), commits and merges.
- Visual feedback arrives as a message with capture paths under `outputs/`. Read the images with `read` and revise.

**Changelog.** Append one plain-language bullet per packet under `## Unreleased - Garden Observatory` in `CHANGELOG.md`.
- Do **not** edit `src/content/pharosville-changelog.ts` or version files; the release PR mirrors them.
- This overrides every spec line that says "each packet updates `src/content/pharosville-changelog.ts`".

**Unavailable evidence.** Apple M5 Pro calibration and the 12-person reading test cannot run in this environment. Never claim them. Write protocols and leave evidence slots explicitly pending.

## 2. Declined and conditional packets

| Packet | Status | Consequence |
|---|---|---|
| **S3-P2** (scoped source health) | **Declined (D7)** | Exclusive warning precedence stays (`CONTRACTS.md:101-105`). No `Sources` health action. No `issuance-unavailable`/`issuance-held`/`sources-mixed` presets. No `--source-details` flag. The reading key (S3-P3) is a separate DOM surface beside the unchanged caption. |
| **S3-P6** | Reconciled | Keep the existing storage key and value format. Visitors already recorded as seen are **not** re-taught (D6d declined); only future teaching stops being consumed invisibly. |
| **S2-P2** | Scoped | Compiler for generator-produced assets plus surface-atlas compilation, glTF validation and census. **No `.blend` ingestion**: no authored asset is elected, and Blender is not installed. |
| **S2-P3** | Not executed | GLTFLoader cutover stays dormant unless a packet proves a procedural silhouette cannot meet acceptance and the orchestrator elects an authored asset. |
| **S2-P4** | KTX2 not adopted | PNG mip strips only (needs S2-P3). |
| **S4-P6** | Conditional | PCSS is executed only if, after S1-P4, stabilized PCF visibly fails grounding in orchestrator review. Stabilized PCF counts as a complete result. |
| **S9-P5a** | Partial | Doc and tooling work (Linux `--headed` note, calibration protocol, budget reconciliation text) is executed. M5 runs are pending hardware. |
| **S9-P5b** | Pending | Hardware. |

## 3. Splits

| Packet | Scope | Depends |
|---|---|---|
| **S7-P3a** | Pure kit builders `src/three/garden-architecture-kit.ts` and tests, with role tags and metric UVs. No adoption. | — |
| **S7-P3b** | Adoption into `garden-docks.ts` and harbour buckets. | S2-P4, S2-P7 |
| **S8-P4a** | Immediate DOM details (remove 70 % glide gating), measured panel rect, bounded candidate scoring, elevated three-quarter views. | S8-P2, S6-P1/P2 |
| **S8-P4b** | Station-local restoration and stroll clearance paths. | S8-P3 |
| **S9-P7a** | Done in Layer 0 (stale snapshots removed). Audit-shield copy moves to S3-P1, duplicate `pv-panel-enter` to S8-P2, og-card to S8-P7. | — |

## 4. Operator decisions as they apply to code

- **D1 = A, moss-side.**
  - S1-P1 authors **one** graybox candidate of macro A, the oblique moss ravine. Macro B is never authored.
  - CP-Destination is run by the orchestrator against the A board, because the operator asked for autonomous execution. Evidence is archived for the operator's final review.
  - Fleet masses arrive in S6-P1 (L2) and are reviewed then.
- **D11 = stylized PBR.** No NPR, Kuwahara or print overlay.
- **D2 = charter adopted.** Each retired clause changes only atomically with its owning packet's code, tests and docs. Everything else in CONTRACTS/VISUAL_INVARIANTS stays binding (plan §9 keep-list).
- **D4 = region floors** (boundary pairs ≥4 L\*, materials ≥3 L\*, ≥90 % approach pixels ≥ L\*6). Indigo sky L\* 7–15; beacon dominant; open-water mean emission ≤0.016.
- **D5 = static signatures.** Remove forced agitation only after S5-P1's codebook exists. Inlet quieting extends after the comprehension proxy, i.e. the orchestrator's blinded exemplar match.
- **D6a = gravel PSI record.** ≤30 UTC daily closes ending on the newest supplied day; last write wins per day. No rolling average, no interpolation across gaps or methodology edges.
- **D6b = at most two collision-safe rest water names.** The ledger stays complete.
- **D6c = full S3 channel table approved.** This includes retiring the grade/backing/yield/NAV proportion deltas in `ship-visuals.ts`. All facts stay in details and ledger.
- **D8 = six-station stroll.**
  - Home returns to the seat.
  - Escape or deselection returns to the saved station-local pose.
  - Idle never tours.
- **D9** = decorative land up to 18 tiles outboard on all sides. Classification field, `GARDEN_PLATE_MARGIN_TILES` and map bounds are unchanged.
- **D10** = projected masses; size law `clamp(0.42·(cap/1e6)^0.10, 0.42, 1.15)` unchanged; no aggregation.
- **D13** = supporting pigments C ≤0.12 with scoped exceptions; four anchors untouched.
- **D14** = seasonal apex clamp [0.42, 0.85] rad.
- **D16** = branded gradient shell; modal-synthesis basin; sound opt-in.
- **Budget** = earned only.
  - Report estimated JS KiB and owner draw/triangle/texture deltas in your final reply.
  - At rest stay ≤480k triangles, ≤60 textures, ≤285 scene calls.
  - Never edit `scripts/bundle-budgets.mjs` or caps yourself.

## 5. Branch and release

- Operator adoption supersedes the old `feat/hour-print` clause (`CONTRACTS.md:488-492`); S9-P1 edits that section.
- No push, PR, tag or release by agents.
- The single release happens only after CP-Final, the reading gate and M5 evidence, via `docs/pharosville/RELEASES.md`.

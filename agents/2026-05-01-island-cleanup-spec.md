# PharosVille Island Cleanup Spec

Date: 2026-05-01
Status: Draft — pending user approval before plan generation
Scope: Standalone `pharosville` repository only

## Objective

Clean up the island's slate before any new aesthetic content is designed for the central plaza. Remove four orphan harbor-themed scenery props that sit on inland limestone, delete one fully dead scenery code path, fix one doc-vs-manifest drift, and archive the implementation plans whose outcomes are already canonical in `CURRENT.md`. No new content, no rework of working systems.

## Why

The user identified the central plaza as the visually weakest part of the map. The audit found that a small group of harbor-flavored props (bollards, crates, rope, lamp) is currently placed on inland tiles where the harbor flavor doesn't read, contributing to a "cluttered but empty" feel. Separately, one scenery prop kind (`palm`) is wired through the type union and switch but has no `SCENERY_PROPS` entry, so its draw function is unreachable. CURRENT.md has a cache-version line that lags the manifest, and `agents/` mixes implemented plans with active ones, raising cognitive load when scanning. Cleaning these up now produces an honest baseline for the next brainstorm, which will design what should fill the central plaza.

## Non-negotiable preservation rules

- Preserve the canvas-not-only-source-of-meaning rule, the desktop gate (`1280 x 760`), and same-origin `/api/*` access.
- Preserve every other entry in `SCENERY_PROPS` (lines 42-89 of `src/renderer/layers/scenery.ts`) — only the four `civic-*` entries are removed.
- Preserve all 21 remaining `SceneryPropKind` values, all draw helpers other than `drawPalm`, and `seawardTileForLamp`.
- Preserve the manifest, all 43 asset entries, `requiredForFirstRender`, `style.cacheVersion`, and `style.styleAnchorVersion`. No PixelLab generation, no sprite changes, no manifest cap edits.
- Preserve `LIGHTHOUSE_TILE`, world geometry, all DEWS/risk-water semantics, all named risk-water labels, the seawall ring, harbor districts, ship class/scale/sprite logic, motion rules, dock logic, and reduced-motion contract.
- Preserve all docs other than the two cache-version lines explicitly listed in Phase 3, and preserve all unmoved plans under `agents/`.

## Scope

In:

- Visual: delete four `civic-*` orphan scenery prop entries from `SCENERY_PROPS`.
- Code: remove the dead `palm` scenery kind end-to-end (type union, switch branch, draw function).
- Docs: fix two cache-version lines in `docs/pharosville/CURRENT.md` to match the manifest's actual `style.cacheVersion`.
- Repo housekeeping: create `agents/completed/` and move seven implementation plans whose outcomes are already canonical in `CURRENT.md`.

Out (anti-scope, explicit):

- No new sprites, no PixelLab generation, no manifest entry/asset changes, no manifest cap edits.
- No design or implementation of new content for the central plaza. That belongs to the next brainstorm using `agents/2026-05-01-island-center-build-brief.md`.
- No edits to ship, dock, risk-water, motion, render-pass ordering, or API/desktop-gate code.
- No relocation of the four removed props to other tiles. They are deleted outright.
- No reclassification or archival of `agents/` plans the audit did not confirm as implemented.
- No broader CURRENT.md sweep beyond the two cache-version lines. Other claims (asset count, tile count, named-water-area sets) were verified accurate by the audit.
- No edits to test fixtures unless typecheck or focused tests reveal an unavoidable adjustment.

## Phase 1: Visual cleanup — remove four civic-* props

File: `src/renderer/layers/scenery.ts`.

In the `SCENERY_PROPS` literal (lines 42-89), remove these four entries (currently lines 80-83):

```ts
{ id: "civic-bollards", kind: "bollards", tile: { x: 31.2, y: 31.5 }, scale: 0.86 },
{ id: "civic-crates", kind: "crate-stack", tile: { x: 29.2, y: 30.0 }, scale: 0.62 },
{ id: "civic-rope", kind: "rope-coil", tile: { x: 33.9, y: 32.6 }, scale: 0.62 },
{ id: "civic-lamp-east", kind: "harbor-lamp", tile: { x: 36.0, y: 32.8 }, scale: 0.66 },
```

No other entries change. The `kind` values used by the four removed props (`bollards`, `crate-stack`, `rope-coil`, `harbor-lamp`) are still used by other (correctly placed) props, so their draw helpers stay.

Acceptance:

- `SCENERY_PROPS.length` drops by exactly 4.
- The four entry IDs do not appear anywhere else in `src/`.
- `seawardTileForLamp`'s cache no longer receives an entry for `civic-lamp-east` (verified by inspection — the function is only called for live `harbor-lamp` props).

## Phase 2: Code cleanup — remove dead `palm` kind end-to-end

File: `src/renderer/layers/scenery.ts`. Three coordinated edits, single commit:

1. Remove `"palm"` from the `SceneryPropKind` union (line 19).
2. Remove the `else if (prop.kind === "palm")` branch (currently lines 219-220) from `drawSceneryProp`. The `else if` chain stays well-formed.
3. Delete the `drawPalm` function body (currently lines 394-411).

These three edits land in a single commit. Splitting them produces a temporarily-inconsistent type/code state.

Acceptance:

- `npm run typecheck` passes.
- No file references `drawPalm` or `kind === "palm"` afterwards.
- The 21 remaining draw helpers remain reachable from their `drawSceneryProp` switch branches.

## Phase 3: Doc drift — cache-version lines in CURRENT.md

File: `docs/pharosville/CURRENT.md`. Two edits:

- Line 29: replace `2026-05-01-harbor-trim-v1` with `2026-05-01-unique-ships-v2`.
- Line 193: same replacement.

Verified actual value at plan time: `public/pharosville/assets/manifest.json:4` `"cacheVersion": "2026-05-01-unique-ships-v2"`.

No other CURRENT.md edits. The audit verified the other claims (43 runtime assets / 25 critical / 18 deferred, 393 main-island land tiles, named-water-area set) match current code.

Acceptance:

- A grep for `harbor-trim-v1` in the repo returns no hits in `docs/`.
- A grep for `unique-ships-v2` matches both occurrences in `CURRENT.md` plus the manifest itself.

## Phase 4: Repo housekeeping — archive implemented plans

Action: create `agents/completed/`. Move these seven files into it via `git mv`:

- `agents/completed/pharosville-main-island-revamp-plan.md` (moved from `agents/`)
- `agents/completed/pharosville-lighthouse-integration-plan.md` (moved from `agents/`)
- `agents/completed/pharosville-zone-theming-base-plan.md` (moved from `agents/`)
- `agents/completed/pharosville-island-coherence-plan.md` (moved from `agents/`)
- `agents/completed/pharosville-seawall-precision-plan.md` (moved from `agents/`)
- `agents/completed/usds-titan-squad-plan.md` (moved from `agents/`)
- `agents/completed/2026-05-01-unique-ship-category-plan.md` (moved from `agents/`)

Justification per file (audit + CURRENT.md cross-check):

| File | Evidence it's implemented |
| --- | --- |
| `pharosville-main-island-revamp-plan.md` | CURRENT.md:19-57 documents the compact-island outcome; tests pin 393-tile count. |
| `pharosville-lighthouse-integration-plan.md` | CURRENT.md:40-46 documents `overlay.lighthouse-headland` + `drawLighthouseHeadland` wired up. |
| `pharosville-zone-theming-base-plan.md` | CURRENT.md:179 documents `ZONE_THEMES` table; enforced by `palette.test.ts`. |
| `pharosville-island-coherence-plan.md` | CURRENT.md:36-57 documents the limestone substrate, headland sprite, regenerated seawall set. |
| `pharosville-seawall-precision-plan.md` | CURRENT.md:48-54 documents `src/systems/seawall.ts` with placement list and blocked coast ring. |
| `usds-titan-squad-plan.md` | CURRENT.md:59-80 documents Sky/Maker squads in detail. |
| `2026-05-01-unique-ship-category-plan.md` | CURRENT.md:84-100 documents the heritage-hull tier, all five sprites in manifest. |

Leave alone (status unclear, active, or a non-plan companion):

- `pharosville-zone-theming-howto.md` — companion authoring guide, still current.
- `pharosville-zone-themes-research.md` — research artifact, audit said code-untouched.
- `pharosville-visual-rework-plan.md` — audit flagged as partially landed.
- `2026-05-01-render-maintainability-dedup-tasklist.md` — active P0 work.
- `NFS2.md`, `NFS3.md` — review/summary docs, not plans.
- `pharosville-need-for-speed-plan.md`, `pharosville-no-cluster-performance-plan.md`, `pharosville-ship-sea-zone-motion-plan.md`, `pharosville-ledger-mooring-north-reorg-plan.md` — audit did not classify; require per-file verification before archiving and that's out of scope here.

Use `git mv` so history follows the file. Do not edit the contents of moved plans.

Acceptance:

- `agents/completed/` exists and contains exactly the seven moved files.
- `agents/` retains all listed-as-untouched files.
- A grep for relative paths to the seven moved files across the rest of the repo returns no broken references (`docs/**`, `src/**`, `scripts/**`, other plans). If any reference is found, update its path to the new location in the same commit.

## Validation

Focused, in this order:

```bash
npm run typecheck
npm test -- src/renderer src/systems
npm run check:pharosville-assets
npm run check:pharosville-colors
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"
npm run validate:docs
```

Then update visual baselines only after manually inspecting the snapshot diff. The intentional drift is the disappearance of four small props in roughly tile (29-36, 30-32). No other baseline change should appear.

Pre-claim gate (per `AGENTS.md`):

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Commit shape

Recommended: one commit per phase with focused messages. Phase 4 commits last so the repository move doesn't churn intermediate test runs. Each commit ends with the required `Co-Authored-By` trailer.

If Phase 1 and Phase 2 produce identical typecheck/test runs, they may bundle in a single commit since they're both in `scenery.ts`. Phase 3 (doc) and Phase 4 (archive) stay independent.

## Done criteria

- The four civic props are gone from the rendered map; visual baseline updated after manual diff review.
- `SceneryPropKind` no longer includes `"palm"`; the switch branch and `drawPalm` function are deleted; `npm run typecheck` clean.
- `CURRENT.md` cache-version lines (29, 193) match `manifest.json` (`2026-05-01-unique-ships-v2`).
- `agents/completed/` exists with exactly the seven listed files; nothing else moved; nothing else deleted; no broken cross-references in the rest of the repo.
- Pre-claim gate passes.
- No changes to ship/dock/risk-water/motion/API/desktop-gate code, no manifest entry changes, no PixelLab generation.

## Hand-off

After this spec is approved and merged, the next brainstorm picks up from `agents/2026-05-01-island-center-build-brief.md` to design the central-plaza build phase.

# PharosVille Lighthouse Integration Plan

Date: 2026-04-30
Status: Implemented (Path Y, procedural-only)
Scope: Standalone `pharosville` repository only
Primary request: Fix the lighthouse + central-island overlay integration so
the lighthouse reads as cleanly seated on a substantial cliff base instead of
floating on the prior sandy plateau, while preserving all sea, ship, dock,
and DEWS systems.

## Implementation Constraint: Separate Worktree

This work was implemented on a dedicated git worktree
(`~/.config/superpowers/worktrees/pharosville/lighthouse-integration`,
branch `lighthouse-integration`) to keep iteration on PixelLab/OpenAI
candidates and renderer experiments isolated from `main` until the final
approach was chosen.

## Forensic Diagnosis (why current was broken)

At `LIGHTHOUSE_TILE = (18, 28)` and `CENTRAL_ISLAND_MODEL_TILE = (31.0, 39.0)`
with `CENTRAL_ISLAND_MODEL_SCALE = 1.08`, the overlay PNG (400x320, anchor
`[200, 280]`) covers approximately tile-x 17.5..44.5, tile-y 20..41 — its
west corner overlapped the lighthouse area. Four layers fought for the same
pixels around `LIGHTHOUSE_TILE`:

1. `terrain.land` green diamonds (`drawTerrain`).
2. `central-island.png` overlay at 0.72 alpha
   (`drawCentralIslandModel`, `src/renderer/world-canvas.ts:431-457`) — its
   western terracotta houses + sandy limestone shelf bled over the lighthouse.
3. Procedural `drawLighthouseHeadland`
   (`src/renderer/world-canvas.ts:1878-1910`): halo + cliff + grass crown +
   stone cap + 6 `HEADLAND_TERRAIN_ACCENTS`. Sized too small (cliff `74x30`,
   stone cap `42x16`) to actually anchor the lighthouse silhouette.
4. Lighthouse PNG (`landmarks/lighthouse-alexandria.png`, 320×320), itself
   visually fine in isolation with a clean self-sufficient base.

The visible result: lighthouse perched on a tiny pebble against a sandy
plateau with disjoint visual fragments around it.

## Approaches Considered

Three approaches were considered and discussed with the user:

- **Approach 1 (Path X)**: regenerate `overlay.central-island.png` via
  PixelLab (`mcp:create_map_object`) and/or OpenAI gpt-image edit with an
  explicit empty-west invariant, letting the procedural headland be the
  sole authority for the lighthouse base. Multiple rounds were attempted
  during the worktree iteration:
  - Round 1: 3 candidates from-scratch at 400x320; one had a tower, one
    warm-sand palette, one generic fantasy village.
  - Round 2: 3 more candidates with stricter prohibitions; cand 5 (stone
    plateau) and cand 1 (cliff with stair) were the strongest, but cand 1
    contained a watchtower and signature watermark.
  - Round 2.5: OpenAI gpt-image-1 inpaint of cand 1 to remove the tower
    (PixelLab's own inpaint mode caps at 192x192 and produces standalone
    objects, unsuitable for in-place rewrites). Result was clean but the
    silhouette was too narrow and read as a "floating fragment" in the
    dense-civic-core view.
  - Round 3: 2 fresh candidates with all prior learnings baked in;
    Variant B (`30371d1d-c8b3-4de3-a0b6-2df2da4505cb`) was a wide cascading
    cliff village matching the user's reference inspiration. Shipped to
    runtime + safety pass, evaluated in dev server.
  - User judgment: Variant B is not clearly better than the prior overlay
    in the broader views; declined to ship.

- **Approach 2 (deferred)**: hybrid imagemagick-only edit of the existing
  overlay (alpha-mask west, color-curve sandy palette toward cool
  limestone). Held in reserve as a safety net; not exercised because
  Path Y was chosen.

- **Approach 3 (Path Y, chosen)**: tune the procedural
  `drawLighthouseHeadland` constants and `HEADLAND_TERRAIN_ACCENTS` only.
  No asset regeneration, no manifest changes. The procedural mount expands
  to substantially anchor the lighthouse, covering the prior sandy plateau
  in the immediate lighthouse area. Smallest blast radius, fully
  deterministic, no manifest budget impact.

## What Path Y Actually Changed

**Edited file**: `src/renderer/world-canvas.ts`.

`LIGHTHOUSE_HEADLAND` constants (lines ~76-87): added `cliffEdge`, `foam`,
`grassTuft`, `stoneShadow`; switched `stone` from warm tan `#9b8f74` to cool
limestone `#c8b88a` (palette-aligned with the manifest style anchor).

`HEADLAND_TERRAIN_ACCENTS` (lines ~287-298): expanded from 6 to 10 accent
positions, slightly tighter ring around the lighthouse, with symmetric
positions to read as a cohesive surrounding terrain rather than scattered
debris.

`drawLighthouseHeadland()` (lines ~1878-1925): kept the same draw order but:

- Larger warm beacon halo: `70x24` → `95x32`.
- New foam ring at the cliff-water boundary (a cool teal ellipse just below
  the contact shadow).
- Larger contact shadow diamond: `88x38` → `130x55`.
- Larger cliff diamond: `74x30` → `110x46`.
- Larger grass crown: `58x22` → `84x32`.
- Larger limestone foundation under the lighthouse: `42x16` → `60x24`,
  paired with a `stoneShadow` lower-facet for dimensional depth.
- Six small grass tufts painted across the crown for vegetation texture
  (channeling the user's reference inspiration of vegetation atop the
  lighthouse cliff).
- 10 surrounding accent diamonds (up from 6) to integrate the headland
  into nearby terrain.

No code change to `LIGHTHOUSE_TILE`, `CENTRAL_ISLAND_MODEL_TILE`,
`CENTRAL_ISLAND_MODEL_SCALE`, overlay alpha, lighthouse PNG, manifest, or
hit-testing.

## What Was NOT Changed (Out Of Scope)

- `landmark.lighthouse.png` (the lighthouse PNG itself).
- `overlay.central-island.png` (the central island overlay).
- `manifest.json` (no asset/cacheVersion changes).
- `world-layout.ts`, `risk-water-areas.ts`, `chain-docks.ts` (no geometry
  or dock changes).
- Ship art/logic, motion, API, desktop gate.
- DEWS zone semantics, Ledger Mooring.
- Cemetery, Ethereum hub, harbor signs.

## Files Changed

- `src/renderer/world-canvas.ts` — `LIGHTHOUSE_HEADLAND`,
  `HEADLAND_TERRAIN_ACCENTS`, `drawLighthouseHeadland` body.
- `tests/visual/pharosville.spec.ts-snapshots/pharosville-desktop-shell-linux.png`
- `tests/visual/pharosville.spec.ts-snapshots/pharosville-dense-lighthouse-linux.png`
- `tests/visual/pharosville.spec.ts-snapshots/pharosville-dense-civic-core-linux.png`
- `tests/visual/pharosville.spec.ts-snapshots/pharosville-dense-evm-bay-linux.png`
- `.gitignore` — added `output/` so PixelLab/OpenAI prototype scratch is
  not committable.
- `agents/pharosville-lighthouse-integration-plan.md` (this file).

## Validation Record

- `npm run typecheck`: clean.
- `npm test`: 217/217 unit tests pass across 27 files.
- `npm run check:pharosville-assets`: 34/34 assets pass (no manifest
  changes; the existing manifest still validates).
- `npm run check:pharosville-colors`: 55 source files pass.
- `npm run build`: succeeds.
- `npm run test:visual`: 13/13 visual tests pass after regenerating the
  affected snapshots and confirming visually that the lighthouse area is
  meaningfully better grounded.

## Why Not Path X

The user evaluated Variant B in dev server and judged it not clearly better
than the prior overlay in the dense-civic-core and dense-evm-bay views.
Path Y has a much smaller blast radius, no asset budget impact, no
manifest churn, and addresses the core complaint (lighthouse looking
ungrounded) at the immediate lighthouse focus.

The Path X work products (rounds 1-3 candidates, OpenAI inpaint of cand 1,
imagemagick safety pass scripts) are preserved in `output/` (gitignored)
in the worktree for reference if a future iteration revisits the overlay.

## Done Criteria

- Lighthouse reads as cleanly seated on a substantial cool-limestone +
  dark-stone cliff base, with grass crown and surrounding terrain accents.
- Original "circled" sandy plateau under the lighthouse is materially
  covered by the expanded procedural headland.
- All AGENTS.md focused checks pass; full pre-claim gate passes.
- No regressions in dense-civic-core, dense-EVM-bay, dense-cemetery,
  named-risk-water, stressed-ship, reduced-motion, or desktop-gate lanes.
- Plan document records what was done.

---
name: Ethereum Harbor Yggdrasil Spec
description: Plant an epic world-tree landmark in the inner plaza of the Ethereum civic-cove rotunda
type: spec
date: 2026-05-02
status: Draft — pending user approval before plan generation
---

# PharosVille Ethereum Yggdrasil Spec

Date: 2026-05-02
Status: Draft — pending user approval before plan generation
Scope: Standalone `pharosville` repository only

## Objective

Plant an epic, mythic world-tree (Yggdrasil) inside the empty inner plaza of the Ethereum civic-cove rotunda (the small ring at the center of `dock.ethereum-civic-cove`). The tree reads as a paired landmark with the lighthouse — silhouette-dominant on the eastern half of the map, slightly shorter than the lighthouse silhouette so the lighthouse stays the primary vertical anchor.

One new PixelLab landmark sprite (`landmark.yggdrasil`), one new renderer layer, one cache-version bump, and one validator-cap bump (55 → 56). Pure flavor, no analytical signal — same contract as `overlay.center-cluster`.

## Why

The Ethereum civic-cove rotunda has a visually empty inner plaza at the top of its sprite. The user wants an Yggdrasil-style world tree there as a thematic landmark for Ethereum's role as the "settlement layer" / world tree of the on-chain economy — Celtic-knot interwoven trunk reads as "interconnected protocols," roots dipping into the harbor water read as "feeding from the harbor."

Aesthetically: a single epic tree on the east side balances the lighthouse anchor on the west, gives the eastern half of the map a memorable silhouette, and removes the "another bonsai-among-bonsais" failure mode by being intentionally outsized — taller than every other tree, slightly under the lighthouse top.

This is the lowest-contract-risk way to add a major eastern landmark: pure decoration, no detail-panel parity required (matches `overlay.center-cluster` precedent), no DEWS / risk-water / motion / API surface touched.

## Non-negotiable preservation rules

- Preserve `LIGHTHOUSE_TILE = (18, 28)` and lighthouse clearance box `x:14..24, y:23..32`. Lighthouse silhouette must remain the dominant vertical anchor — the Yggdrasil's sprite-top must sit **at least 16 px below the lighthouse beacon point at 1× zoom** to guarantee the lighthouse wins the silhouette contest visually.
- Preserve `dock.ethereum-civic-cove` geometry: anchor `[200, 250]`, footprint `[208, 78]`, hitbox `[24, 40, 352, 240]`, displayScale `0.8`. The cove sprite is not regenerated.
- Preserve all 55 existing manifest entries. **One new entry** (`landmark.yggdrasil`) is added; nothing relocates, nothing else is removed.
- Preserve `requiredForFirstRender` count. The Yggdrasil is **deferred-tier** — eastern map can render without it for the first frame.
- Preserve `style.styleAnchorVersion = 2026-04-29-lighthouse-hill-v5`. Only `style.cacheVersion` bumps.
- Preserve all DEWS / risk-water semantics, named risk-water labels, seawall ring, harbor districts, ship class/scale/sprite logic, motion rules, dock logic, reduced-motion contract, world layout, same-origin `/api/*` access, desktop-gate.
- Preserve the static-scene render order: terrain → district pad → center cluster → lighthouse-headland → lighthouse body. The Yggdrasil renders in the **entity pass** (z-sorted with ships) so eastern ships at the side berths can pass *in front of* the trunk near the foreground and *behind* the trunk on the far side.
- Do not bake analytical color bands, chain names, logos, banners, embedded text, or numerals into the PNG. Canopy lantern count is decorative — must not be tied to L2 chain count or any live metric.
- Canvas-not-only-source-of-meaning: the Yggdrasil carries no analytical signal, so it gets no detail-panel entry and no accessibility-ledger entry. It is not a selectable hit target.

## Open question — must be resolved before Plan generation

**Manifest is at the validator cap of 55.** Pick one path before sprite generation:

- **Option A (recommended): Bump validator cap from 55 to 56.** One-line change in `scripts/check-pharosville-assets.*` (or wherever `maxManifestAssets` lives). Justified by ~16 KiB / ~80,000 px additional decoded budget — well inside the global manifest budgets (`<= 900 KiB` source, `<= 1,300,000` decoded pixels). Cleanest separation: tree is a discrete landmark with its own provenance.
- **Option B: Retire one deferred prop.** `prop.olive-tree` or `prop.fig-tree` are candidate retirements only if the user explicitly says they're losing density (recommend not — recent commits added these intentionally).
- **Option C: Bake the Yggdrasil into a regenerated `dock.ethereum-civic-cove`.** No new manifest entry; loses runtime separability (can't independently load/swap/animate the tree); regeneration risks losing the polished cove sprite the user already approved. Not recommended.

This spec assumes **Option A** for all subsequent phases. Flag if you want B or C — the rest of the spec changes accordingly.

## Scope

In:

- Add `landmark.yggdrasil` (PixelLab `create_object`, 256×320, deferred-tier landmark) to the manifest.
- Add `drawYggdrasil` in a new `src/renderer/layers/yggdrasil.ts`; wire into the entity pass via `entity-pass.ts` so it z-sorts with ships at the cove.
- Place the tree at tile **(45, 32)** (matches the visual center of the cove's inner plaza after the `dockDrawTileOverride` of `(44.9, 32.15)` for the Ethereum dock at `(42, 31)`).
- Bump `style.cacheVersion` from `2026-05-02-ethereum-harbor-v1` to `2026-05-02-ethereum-yggdrasil-v1` in `public/pharosville/assets/manifest.json`.
- Bump validator `maxManifestAssets` cap from 55 to 56.
- Update `docs/pharosville/CURRENT.md`: cache-version bump, asset-count line, short paragraph in Current Visual Model.
- Update `docs/pharosville-page.md`: add a single sentence to the Ethereum harbor description noting the world-tree landmark.

Out (anti-scope, explicit):

- No regeneration of `dock.ethereum-civic-cove`.
- No new analytical encoding — no canopy lantern count tied to L2 count, no leaf-color shift on supply state, no glow tied to peg health.
- No detail-panel entry, no accessibility-ledger entry, no hit-test target, no selection ring.
- No animation. The Yggdrasil is a single static sprite. Sway/leaf-rustle is a future pass — out of scope here.
- No edits to ship, dock, risk-water, motion, world-layout, API, desktop-gate, or seawall code.
- No relocation of any existing scenery prop, dock, or landmark.
- No edits to `style.styleAnchorVersion`.
- No additions to `requiredForFirstRender`.
- No new behavioral tests beyond updating the asset-manifest count fixture and validator-cap fixture.
- No PixelLab generation of variants beyond the one new entry.

## Phase 1: PixelLab generation

Generate one PixelLab job against the locked style anchor `2026-04-29-lighthouse-hill-v5`. Save candidates to `outputs/pharosville/pixellab-prototypes/ethereum-yggdrasil-2026-05-02/`.

### 1a. `landmark.yggdrasil` — `create_object`

Target: 256×320, transparent background.

```text
old-school 16-bit maritime isometric RPG pixel art, low top-down view, crisp pixel edges, transparent background.

A mythic world-tree, ancient and epic, growing from the center of a small circular limestone plaza. Trunk is a Celtic-knot interwoven braid of three to four major boughs in dark weathered timber #3a2818 / #5a3a22 mid / #8a6a44 highlight, with the braided weave clearly readable as overlapping bands rather than a single trunk. Two prominent root masses dangle off the south-southwest and south-southeast lower edges, twisting downward off the plaza into the harbor water below — roots taper to fine fibrous tips in #4a3018 / #6a4828 mid. A broad rounded canopy in layered greens — #2a4a28 deep shade / #3a6a32 mid / #5a8a44 highlight / #7aaa54 sun-glint — sits high on the trunk; canopy silhouette is mounded and slightly asymmetric (denser to the west, thinner to the east), with two or three small dark cavities suggesting nested hollows. Three small warm pinpoint lanterns (#f7d68a, 1-2 px each) tucked into canopy hollows for life — no glow halo, no radial light. Base sits on a small circular stone plinth in pale limestone #d8c8a8 / #f0e2c4 highlight / #8e8470 mortar, integrated with the trunk via exposed surface roots crossing the plinth. Ground-contact bottom of the plinth sits at y≈300 so manifest anchor [128, 300] aligns. Strong dark contact shadow under the plinth.

Maximum tree-top altitude: ≤ 200 px from sprite bottom (canopy crown near y≈100). Trunk is roughly centered horizontally. Sprite content stays within the 256×320 frame; hanging roots may extend slightly past the plinth on the lower edges.

No banners, no text, no logos, no UI, no analytical color bands, no faces in the bark, no rune carvings, no obvious treehouses or doors, no dwarves/elves/figures, no painterly antialiasing, no soft outlines, no fantasy-village motifs, no spire/lighthouse silhouette, no second tree.
```

Acceptance for 1a:

- Dimensions exactly 256×320.
- Transparent background.
- Canopy crown sits at y ≤ 110 (giving total tree height ≤ ~200 px).
- Visible Celtic-knot interweave on the trunk (silhouette test: cover the canopy and the trunk should still read as braided).
- Two prominent dangling roots off the lower-south edges.
- Three or fewer lantern pinpoints; no glow halos.
- No fantasy-village motifs, no embedded text/numerals/runes, no faces in the bark.
- When placed at tile (45, 32) at displayScale 1, canopy top at 1× zoom sits at least 16 px below the lighthouse beacon screen-y. (Verify by computing `tileToScreen(LIGHTHOUSE_TILE, camera).y - 47` vs `tileToScreen({x:45,y:32}, camera).y - 300 + 100`.)
- Per-image landmark budget: ≤ 96 KiB / ≤ 131,072 decoded pixels (256×320 = 81,920 pixels — fits).

Promote accepted PNG to:

- `public/pharosville/assets/landmarks/yggdrasil.png`

## Phase 2: Manifest update

File: `public/pharosville/assets/manifest.json`.

Add `landmark.yggdrasil`, mirroring the field shape of `landmark.lighthouse`:

- `width`: 256, `height`: 320
- `category`: `landmark`, `layer`: `landmarks`
- `displayScale`: 1
- `anchor`: `[128, 300]` (trunk base / plinth bottom-center)
- `footprint`: `[48, 24]` (the plinth — kept tight so it visually sits inside the cove inner ring without overlapping the rotunda walls)
- `hitbox`: not required for non-selectable landmarks; if the schema demands one, set `[60, 80, 196, 300]` but **do not register a detail target** (see Phase 3)
- `loadPriority`: `deferred`
- `paletteKeys`: `["weathered timber", "deep canopy", "limestone", "warm lantern"]`
- `promptKey`: `landmark.yggdrasil`
- `semanticRole`: `"ethereum world-tree landmark — pure flavor, no analytical signal"`
- `tool`: `mcp:create_object`
- `promptProvenance`: `{ jobId: <from PixelLab job>, styleAnchorVersion: "2026-04-29-lighthouse-hill-v5" }`

Bump `style.cacheVersion` from `2026-05-02-ethereum-harbor-v1` to `2026-05-02-ethereum-yggdrasil-v1`. `style.styleAnchorVersion` unchanged.

Also: bump validator `maxManifestAssets` cap from 55 to 56 in the validator script (likely `scripts/check-pharosville-assets.ts` or similar — confirm path during plan execution).

Acceptance:

- `manifest.assets.length === 56`.
- `requiredForFirstRender.length` unchanged.
- `style.cacheVersion === "2026-05-02-ethereum-yggdrasil-v1"`.
- `npm run check:pharosville-assets` passes (cap is now 56; we're at the cap).

## Phase 3: Renderer integration

### 3a. `src/renderer/layers/yggdrasil.ts` (new file)

Export `drawYggdrasil(input: DrawPharosVilleInput)` and `YGGDRASIL_TILE: { x: 45, y: 32 }` (or wherever the cove's inner-plaza visual center lands — verify against the rendered cove sprite during integration; the spec value (45, 32) is the targeted starting placement).

Body:

```ts
const asset = assets.get("landmark.yggdrasil");
if (!asset) return;
const screen = tileToScreen(YGGDRASIL_TILE, camera);
drawAsset(ctx, asset, screen.x, screen.y, camera.zoom);
```

Pattern matches `drawLighthouseBody` in `src/renderer/layers/lighthouse.ts` but with no beacon/fire/beam follow-on calls.

### 3b. `src/renderer/layers/entity-pass.ts` — z-sort with ships

The Yggdrasil must paint in the entity pass (not the static scene) so eastern ships at the cove's side berths can z-sort against it: ships approaching from the south should pass in front of the trunk's lower portion; ships moored on the far side of the rotunda should be drawn behind the canopy.

Insert a synthetic drawable into the entity-pass list, anchored at tile (45, 32), with sort-y matching the plinth bottom screen-y. Drawable kind: a new `"yggdrasil"` discriminator; callback dispatches to `drawYggdrasil(input)`.

If adding a new drawable kind to `entity-pass.ts` proves invasive, fall back to drawing the Yggdrasil as a separate "tall landmark" pass between the dock-overlay pass and the ship pass — this loses ship/tree z-sorting but keeps the entity pass untouched. **The plan should evaluate both approaches and pick whichever is more surgical.**

### 3c. `src/renderer/world-canvas.ts` — wire entity-pass dispatch

Pass `drawYggdrasil: () => drawYggdrasil(input)` into the entity-pass callbacks alongside `drawDockBody` / `drawDockOverlay` / ship draw callbacks.

Static-scene cache key already includes `style.cacheVersion`, so bumping the cache version invalidates any stale static cache automatically — no cache-key edit required.

Acceptance for Phase 3:

- `npm run typecheck` passes.
- New file `yggdrasil.ts` exports `drawYggdrasil` and `YGGDRASIL_TILE`.
- Eastern ships at cove side berths visually pass in front of the trunk near foreground and behind on far side (or, under the fallback approach, ships always pass behind — flag this in screenshot review).
- Lighthouse silhouette still wins the vertical-dominance test in the desktop shell screenshot (canopy top at least 16 px below beacon point at 1× zoom).
- The Yggdrasil is **not** registered as a hit target / detail entity / selection target.

## Phase 4: Documentation

File: `docs/pharosville/CURRENT.md`.

Edits:

- Update both cache-version mentions from `2026-05-02-ethereum-harbor-v1` to `2026-05-02-ethereum-yggdrasil-v1`.
- Update the asset-count summary line (currently 51 / 27 critical / 24 deferred at last write — re-derive from validator output) to **"56 assets / N critical / M deferred (validator cap raised to 56)"**.
- Add a paragraph in the Current Visual Model section, immediately after the central-cluster paragraph: "The Ethereum civic cove's inner plaza is anchored by the `landmark.yggdrasil` world-tree at tile (45, 32) — a pure-flavor mythic landmark drawn in the entity pass so eastern ships z-sort against its trunk. Canopy top sits ≥ 16 px below the lighthouse beacon at 1× zoom; the lighthouse remains the dominant vertical anchor. The Yggdrasil carries no analytical signal and no detail-panel parity, matching the `overlay.center-cluster` precedent."

File: `docs/pharosville-page.md`.

Edits:

- Add to the Ethereum harbor sentence: "...with a mythic world-tree landmark anchoring the rotunda's inner plaza."

No `VISUAL_INVARIANTS.md` edits unless the lighthouse-dominance invariant needs to call out the Yggdrasil explicitly — recommend adding a one-line invariant: "The Yggdrasil canopy top must remain ≥ 16 px below the lighthouse beacon at 1× zoom."

No `ASSET_PIPELINE.md` edits — pipeline is unchanged; only manifest entry count and cap moved.

Acceptance:

- `npm run validate:docs` passes.
- `grep -r 2026-05-02-ethereum-harbor-v1 docs/` returns no hits after the bump.
- The new paragraph mentions the tile, entity-pass z-sort, and the lighthouse-dominance invariant.

## Phase 5: Tests

Update only:

- `src/systems/asset-manifest.test.ts` — assert count 56 and the new ID exists.
- The validator-cap test fixture (likely in `tests/check-pharosville-assets.test.ts` or asserted inside the validator script's own self-check).

Visual baselines drift in:

- `pharosville-desktop-shell-linux.png` (Yggdrasil visible on the eastern half).
- Any dense-civic-core fixture that frames the cove (verify by running the visual suite first; only update intentionally-drifting baselines).

Update via `--update-snapshots` only after manual diff inspection confirms only the cove inner-plaza region changed and the lighthouse remains visually dominant.

## Validation

Focused (during iteration):

```bash
npm run typecheck
npm test -- src/renderer src/systems
npm run check:pharosville-assets
npm run check:pharosville-colors
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"
npm run validate:docs
```

Manual screenshot review focus:

- **Desktop shell**: tree sits centered in the cove's inner plaza; canopy reads as a single epic silhouette; lighthouse remains the taller landmark; no fantasy-village artefacts; no banners/text.
- **Z-sorting test**: pick a fixture with a ship moored at an Ethereum side berth and confirm the ship draws in front of the trunk's foreground portion, behind the canopy on the far side. (If using the fallback render path, document that ships always pass behind.)
- **Hit-test test**: clicking the tree does NOT open a detail panel — clicks fall through to the Ethereum dock or to background.

Pre-claim broad gate per `AGENTS.md`:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Done criteria

- `landmark.yggdrasil` exists as a PNG under `public/pharosville/assets/landmarks/yggdrasil.png`, dimensions 256×320, transparent background.
- `manifest.json` lists 56 assets including the new entry; `requiredForFirstRender` count unchanged; `style.cacheVersion` is `2026-05-02-ethereum-yggdrasil-v1`.
- Validator `maxManifestAssets` cap raised from 55 to 56.
- `src/renderer/layers/yggdrasil.ts` exists and is wired into the entity pass at tile (45, 32).
- The tree is **not** a hit-test target / detail entity / selection target.
- `CURRENT.md` reflects the new cache version, the new asset count, the new paragraph, and (optionally) the new lighthouse-dominance invariant.
- `docs/pharosville-page.md` mentions the world-tree landmark.
- All focused tests + pre-claim gate pass.
- Visual baselines updated only after manual diff confirms only the cove inner-plaza region changed and the lighthouse remains the dominant vertical.
- No ship/dock/risk-water/motion/API/desktop-gate code touched.

## Hand-off

After approval (and after the Option A/B/C question is locked), the writing-plans skill produces a step-by-step implementation plan that follows the five phases above with bite-sized tasks. The plan is then executed inline with surgical commits per phase.

## Decisions still open (require user input before plan generation)

1. **Option A vs B vs C** for the manifest slot. Recommended: A (bump cap to 56).
2. **Tile placement** — spec assumes (45, 32). Final value verified against a screenshot of the cove sprite at the dockDrawTileOverride of (44.9, 32.15) during plan execution; may shift ± 1 tile.
3. **Lantern count in canopy** — spec assumes "three or fewer pinpoints, decorative." Confirm not tied to live L2 count.
4. **Z-sort approach** — entity-pass integration (recommended, more polished) vs. dedicated tall-landmark pass (simpler, tree always drawn over all ships near it). Plan picks based on entity-pass.ts inspection during execution.

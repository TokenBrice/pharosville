# PharosVille Visual Rework Plan And Task Tracker

Date: 2026-04-30
Status: Draft execution tracker
Scope: Standalone `pharosville` repository only
Canonical app: https://pharosville.pharos.watch/

## Objective

Rework PharosVille from the current patchwork of divergent sprites and renderer
treatments into a cohesive dark maritime observatory diorama inspired by a
pixel-art coastal lighthouse village.

The rework must preserve the current analytical model:

- Lighthouse = PSI status.
- Harbors/docks = chain stablecoin supply and top chain cargo.
- Ships = active stablecoin representatives.
- Ship class, scale, logos, route cadence, and risk placement = existing
  stablecoin metadata, chain presence, market cap tiers, and DEWS/peg evidence.
- Named water areas = DEWS/risk-water districts and Ledger Mooring.
- Cemetery = dead/frozen lifecycle assets.

Do not add new analytical meanings, new API contracts, mobile canvas support,
client-side secrets, or decorative landmarks that imply non-existent data.

## Current Diagnosis

The logic is sound, but the rendered result reads as a collage because the scene
mixes multiple visual systems:

- Procedural terrain diamonds with high-frequency water texture.
- A generated central island overlay that reads like a pasted asset.
- A cropped lighthouse sprite plus separate hand-drawn headland and effects.
- Many dock sprites with inconsistent palette, camera, water bases, and mass.
- Procedural scenery props that do not share the generated sprite language.
- Ships, logos, flags, water labels, and wakes fighting the water texture.
- Heavy RPG-style DOM chrome that boxes in the canvas instead of feeling like
  a chart-room instrument layer.

The fix should first unify rendering language and composition, then regenerate
assets as coherent families.

## Art Direction

Target: dark coastal chart room plus working maritime observatory harbor.

Core visual language:

- Deep slate/navy sea, quieter base water, stronger semantic texture only where
  DEWS/risk meaning requires it.
- Pale limestone cliffs, seawalls, and lighthouse materials.
- Terracotta roof accents, dark timber quays, rope, crates, posts, skiffs.
- Oxidized bronze/brass signal hardware and warm lantern/beacon light.
- Cool teal water-bounce edge light on sprites and harbor structures.
- Crisp old-school 16-bit isometric pixel art, low top-down camera, dark contact
  shadows, restrained analytics palette, readable silhouettes.

Avoid:

- Cozy/fantasy village lore, ClaudeVille concepts, or decorative copy.
- Generic Web3 glass/glow.
- Extra buildings or landmarks without clear data mapping.
- Large in-world name boards that compete with chain/logo flags.
- Visual encodings for bridge volume, transfers, issuer operations, DEX
  liquidity, redemption guarantees, or blacklist activity.

## Non-Negotiable Invariants

- Work only in this repo.
- Keep browser requests same-origin `/api/*`.
- Never expose `PHAROS_API_KEY` or PixelLab tokens.
- Do not weaken the desktop gate: below `1280px` width or `760px` height, the
  world runtime, world data, manifest, canvas, and sprite/logo decode paths must
  not mount.
- Preserve reduced-motion determinism and no RAF loop in reduced motion.
- Keep canvas semantics backed by DOM detail panel or accessibility ledger text.
- Preserve named risk-water details, labels, hit targets, and selection priority.
- Keep printed water labels above entity sprites unless intentionally changing
  the product contract and tests.
- Keep motion sampling, hit testing, selected rings, follow-selected, and debug
  frame state aligned.
- Preserve `MAX_CHAIN_HARBORS`, Ethereum/L2 preferred dock reservations, and
  dock-chain semantic meaning.
- Keep runtime assets local under `public/pharosville/assets/` with accurate
  manifest entries.
- Keep generated `dist/`, `test-results/`, `.env*`, and scratch PixelLab outputs
  out of commits.

## Key Files

Runtime and shell:

- `src/App.tsx`
- `src/client.tsx`
- `src/pharosville-world.tsx`
- `src/pharosville.css`
- `src/components/world-toolbar.tsx`
- `src/components/detail-panel.tsx`
- `src/components/accessibility-ledger.tsx`

World model:

- `src/systems/pharosville-world.ts`
- `src/systems/world-layout.ts`
- `src/systems/chain-docks.ts`
- `src/systems/risk-water-areas.ts`
- `src/systems/risk-water-placement.ts`
- `src/systems/area-labels.ts`
- `src/systems/ship-visuals.ts`
- `src/systems/motion.ts`
- `src/systems/camera.ts`
- `src/systems/palette.ts`
- `src/systems/visual-cue-registry.ts`

Renderer:

- `src/renderer/world-canvas.ts`
- `src/renderer/geometry.ts`
- `src/renderer/hit-testing.ts`
- `src/renderer/layers/selection.ts`
- `src/renderer/layers/shoreline.ts`
- `src/renderer/asset-manager.ts`

Assets and docs:

- `public/pharosville/assets/manifest.json`
- `public/pharosville/assets/**`
- `docs/pharosville-page.md`
- `docs/pharosville/CURRENT.md`
- `docs/pharosville/VISUAL_INVARIANTS.md`
- `docs/pharosville/ASSET_PIPELINE.md`
- `docs/pharosville/PIXELLAB_MCP.md`
- `docs/pharosville/TESTING.md`

Validation:

- `tests/visual/pharosville.spec.ts`
- `src/renderer/hit-testing.test.ts`
- `src/systems/world-layout.test.ts`
- `src/systems/palette.test.ts`
- `src/systems/asset-manifest.test.ts`
- `scripts/pharosville/validate-assets.mjs`
- `scripts/check-pharosville-colors.mjs`

## Phase 0: Baseline And Guardrails

Status: Pending

Tasks:

- [ ] Run `git status --short` and identify unrelated dirty files before edits.
- [ ] Capture or review current visual baselines:
  - `pharosville-desktop-shell`
  - `pharosville-dense-lighthouse`
  - `pharosville-dense-evm-bay`
  - `pharosville-dense-ship-flotillas`
  - `pharosville-dense-cemetery`
  - `pharosville-dense-civic-core`
  - `pharosville-dense-risk-water`
  - `pharosville-narrow-fallback`
- [ ] Confirm current checks before starting broad changes:
  - `npm run check:pharosville-assets`
  - `npm run check:pharosville-colors`
  - `npm test -- src/renderer/hit-testing.test.ts src/systems/world-layout.test.ts src/systems/palette.test.ts`
- [ ] Decide whether the existing `landmark.lighthouse` remains the style anchor.
  Current recommendation: keep it as the first anchor and only replace it after
  a successful style proof.

Acceptance:

- Current known failures, dirty files, and visual baselines are documented.
- No generated asset URLs, tokens, or scratch files are introduced.

## Phase 1: Art Bible And Prompt Contract

Status: Pending

Tasks:

- [ ] Add/update a concise art-direction section in `docs/pharosville/ASSET_PIPELINE.md`
  or a dedicated route doc.
- [ ] Define the shared visual kit:
  - Palette.
  - Pixel scale.
  - Outline weight.
  - Light direction.
  - Contact shadow rules.
  - Water texture hierarchy.
  - Plaque/sign style.
  - Selection style.
  - UI chrome material style.
- [ ] Update `docs/pharosville/CURRENT.md` if the implementation target changes.
- [ ] Keep `docs/pharosville-page.md` unchanged unless app behavior or mapping
  changes.

PixelLab base prompt:

```text
old-school 16-bit maritime isometric RPG pixel art, cohesive coastal lighthouse village kit, crisp pixel edges, low top-down view, deep navy and teal sea, pale limestone and terracotta harbor buildings, oxidized bronze lanterns, dark timber piers, cream sail cloth, warm beacon light, cool teal water-bounce edge light, dark contact shadow, restrained analytics palette, readable silhouettes, transparent background, no text, no logos, no UI
```

Acceptance:

- One documented direction explains lighthouse, sea zones, ships, harbors,
  cemetery, toolbar, detail panel, and fallback screen.
- Asset prompts explicitly forbid text, logos, UI, baked analytics colors, and
  chain names.

## Phase 2: Renderer Unification Pass

Status: First-pass completed on 2026-04-30

Goal: Make the existing assets feel less divergent before spending a large
PixelLab budget.

Tasks:

- [x] Introduce shared renderer style constants or helpers in/near
  `src/renderer/world-canvas.ts` and `src/systems/palette.ts`.
- [x] Reduce high-frequency base water noise while preserving distinct
  `WATER_TERRAIN_STYLES`.
- [x] Treat semantic water zones as underpainting:
  - Base water quiet.
  - Calm/watch subtle.
  - Alert/warning/danger increasingly legible.
  - Ledger distinct but quiet.
- [ ] Improve coast continuity in `src/renderer/layers/shoreline.ts`:
  - Shared foam ribbons.
  - Cliff/shallow shelf bands.
  - Quay edge continuity.
- [x] Rebalance `drawCentralIslandModel`, `drawLighthouseHeadland`,
  `drawHarborDistrictGround`, and `drawCemeteryGround` so overlays do not fight
  each other.
- [x] Replace obvious debug-like rectangular selection visuals on tall landmarks
  with rings/halos while preserving hit targets.
- [x] Keep labels selectable and above sprites; adjust only material treatment,
  contrast, and plaque style.

First-pass notes:

- Water terrain now draws a solid semantic base first and only a faint material
  texture above it, reducing repeated tile-carpet noise.
- Palette bases were darkened and harmonized while keeping the palette distance
  tests intact.
- Existing central-island, harbor-pad, and dock-underlay drawing were toned
  toward one limestone/navy material set.
- Selection rectangles were replaced with base halos for entities and bracket
  treatment for printed area labels.
- `src/renderer/layers/shoreline.ts` remains a later refinement target.

Files likely touched:

- `src/renderer/world-canvas.ts`
- `src/renderer/layers/shoreline.ts`
- `src/renderer/layers/selection.ts`
- `src/systems/palette.ts`
- `src/systems/palette.test.ts`

Acceptance:

- Water remains visibly 78-82% dominant in the shell.
- Risk-water areas are still distinguishable by color and texture.
- Labels remain readable and selectable.
- Lighthouse, docks, ships, cemetery, and water no longer fight as separate
  style systems in the dense fixture.
- No world-model semantics change is required for this phase.

Focused checks:

```bash
npm test -- src/systems/palette.test.ts src/renderer/hit-testing.test.ts
npm run check:pharosville-colors
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual"
```

## Phase 3: UI Chrome Rework

Status: First-pass completed on 2026-04-30

Goal: Make DOM chrome feel like harbor-master chart instrumentation while
keeping the world dominant.

Tasks:

- [x] Rework `.pharosville-shell` frame and vignette to be lighter.
- [x] Restyle toolbar/detail panels:
  - Thin brass edges.
  - Dark desaturated navy panels.
  - Subtle pixel seams.
  - Less bulky clipped RPG framing.
- [x] Standardize fullscreen/home buttons with toolbar styling.
- [x] Keep icon-first toolbar controls.
- [ ] Consider converting the `Ledger` text button to a consistent icon + label
  treatment while preserving `aria-pressed`.
- [x] Keep detail grouping: Facts, Route, Notes, Members, Links.
- [x] Improve selected entity title hierarchy and source/caveat legibility.
- [x] Keep focus-visible states high contrast and keyboard friendly.
- [x] Keep narrow/short fallback behavior and no world runtime requests below
  the gate.

First-pass notes:

- DOM chrome was retuned in `src/pharosville.css` only.
- Toolbar, detail panel, fullscreen/home controls, loading, query error, and
  narrow fallback now share a quieter chart-room treatment.
- Component structure and accessibility labels were left intact.

Files likely touched:

- `src/pharosville.css`
- `src/components/world-toolbar.tsx`
- `src/components/detail-panel.tsx`
- `src/pharosville-world.tsx`
- `src/desktop-only-fallback.tsx`

Acceptance:

- Toolbar, detail panel, fullscreen button, home button, and fallback page share
  one visual system.
- The canvas is visually dominant at `1440x1000`.
- Desktop gate tests still prove no runtime/asset/API requests below threshold.

Focused checks:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "desktop"
npx playwright test tests/visual/pharosville.spec.ts --grep "fallback"
npm run check:pharosville-colors
```

## Phase 4: PixelLab Style Proof

Status: Pending

Goal: Generate a small candidate set before replacing many runtime assets.

Use PixelLab MCP tools only. Do not call PixelLab as a normal REST API.

Candidate set:

- [ ] `overlay.central-island` replacement candidate, `400x320`.
- [ ] One compact dock candidate, `160-176x120-128`.
- [ ] One large dock or Ethereum-adjacent harbor candidate, `208-224x152-160`
  or `336x240` for Ethereum hub if selected.
- [ ] One ship hull candidate, `104x80`.

Generation rules:

- [ ] Save candidates under scratch space such as
  `output/pharosville/pixellab-prototypes/`.
- [ ] Inspect dimensions, transparency, contact shadow, silhouette, waterline,
  and style match.
- [ ] Do not promote candidates directly into runtime paths.
- [ ] Do not store download URLs, tokens, or curl commands in docs or manifest.

Acceptance:

- At least one candidate family convincingly matches the lighthouse and target
  art direction.
- Candidate does not include text, logos, UI panels, status colors, or chain
  names.
- Ship candidate preserves a clean sail/pennant mark area compatible with
  runtime logo placement.

## Phase 5: Asset Family Regeneration

Status: Pending

Goal: Replace divergent runtime sprites with coherent families without expanding
the manifest surface unnecessarily.

### 5A: Central Island And Terrain

Tasks:

- [ ] Replace `overlay.central-island` only after style proof approval.
- [ ] Preserve `400x320` if possible to minimize manifest and renderer drift.
- [ ] If geometry changes, update anchor, footprint, hitbox, and renderer offsets.
- [ ] Regenerate terrain tiles only if renderer unification plus island
  replacement still exposes mismatch.
- [ ] Keep terrain textures subtle because DEWS water semantics are
  renderer-controlled.

Assets:

- `overlay.central-island`
- `terrain.deep-water`
- `terrain.harbor-water`
- `terrain.land`
- `terrain.shore`
- `terrain.road`
- `terrain.storm-water`

### 5B: Harbor Infrastructure

Tasks:

- [ ] Regenerate dock/quay family from one prompt kit.
- [ ] Preserve existing dimensions where possible.
- [ ] Keep Ethereum hub selectable but visually backgrounded behind ship traffic.
- [ ] Preserve dock tile assignments and `MAX_CHAIN_HARBORS`.
- [ ] Normalize underlays and flags so the EVM bay reads as one harbor system.

Assets:

- `dock.harbor-ring-quay`
- `dock.ethereum-harbor-hub`
- `dock.compact-harbor-pier`
- `dock.grand-quay`
- `dock.container-wharf`
- `dock.twin-slip`
- `dock.stone-breakwater`
- `dock.market-marina`
- `dock.relay-pontoon`
- `dock.rollup-ferry-slip`
- `dock.vault-quay`
- `dock.bridge-pontoon`
- `dock.sentinel-breakwater`
- `dock.wooden-pier`

### 5C: Ship Hulls

Tasks:

- [ ] Regenerate all five hulls as one coherent family if sprite divergence
  remains visible after renderer/harbor work.
- [ ] Preserve `104x80`.
- [ ] Preserve or update `SHIP_SAIL_MARKS` deliberately.
- [ ] Keep class silhouette distinct:
  - Treasury galleon.
  - Chartered brigantine.
  - DAO schooner.
  - Crypto caravel fallback.
  - Legacy algorithmic junk.
- [ ] Keep runtime logo and pennant overlays as overlays, not baked into PNGs.

Assets:

- `ship.treasury-galleon`
- `ship.chartered-brigantine`
- `ship.dao-schooner`
- `ship.crypto-caravel`
- `ship.algo-junk`

### 5D: Memorial Props

Tasks:

- [ ] Keep memorial props unless the new island/dock kit makes them stand out.
- [ ] If replacing, preserve cause-aware marker meanings and quiet cemetery tone.

Assets:

- `prop.memorial-terrace`
- `prop.memorial-headstone`
- `prop.ledger-slab`
- `prop.reliquary-marker`
- `prop.regulatory-obelisk`

Manifest requirements for all promoted assets:

- [ ] Accurate dimensions.
- [ ] Accurate anchors, footprints, and hitboxes.
- [ ] Correct category/layer/load priority.
- [ ] `promptProvenance.jobId`.
- [ ] `promptProvenance.seed` when available.
- [ ] `promptProvenance.styleAnchorVersion` matching manifest
  `style.styleAnchorVersion`.
- [ ] `tool` set to the PixelLab MCP tool used.
- [ ] `style.cacheVersion` bumped whenever PNG bytes or geometry change.
- [ ] `style.styleAnchorVersion` changed only when the visual anchor changes
  materially.

Focused checks:

```bash
npm run check:pharosville-assets
npm test -- src/systems/asset-manifest.test.ts src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual"
```

## Phase 6: Composition And Entity Readability

Status: Pending

Tasks:

- [ ] Tune ship contact shadows so ships sit in water rather than floating.
- [ ] Tune wake opacity and caps so dense scenes remain readable.
- [ ] Add or improve small sail-logo backplates if needed.
- [ ] Ensure selected and hovered states read clearly without debug-like boxes.
- [ ] Rebalance cluster count pennants so they read as long-tail groups, not
  primary assets.
- [ ] Keep cemetery visually quieter than active risk water.
- [ ] Revisit default camera after asset scale stabilizes.

Files likely touched:

- `src/renderer/world-canvas.ts`
- `src/renderer/geometry.ts`
- `src/renderer/layers/selection.ts`
- `src/systems/camera.ts`
- `src/systems/ship-visuals.ts`

Acceptance:

- Dense ship fixtures are scannable.
- USDT/USDC-scale flagships remain spottable but not absurdly oversized.
- Hit targets still align after scale/anchor changes.
- Follow-selected centers selected entities correctly.
- Motion and reduced-motion samples remain deterministic.

Focused checks:

```bash
npm test -- src/systems/motion.test.ts src/renderer/hit-testing.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "motion"
npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual"
```

## Phase 7: Visual Test Review And Snapshot Updates

Status: First-pass completed on 2026-04-30

Tasks:

- [x] Run visual tests and inspect diffs before accepting snapshot changes.
- [x] Update snapshots only when rendered drift is intentional.
- [x] Check all dense regional clips:
  - Lighthouse.
  - EVM bay.
  - Ship flotillas.
  - Cemetery.
  - Civic core.
  - Risk water.
- [x] Confirm narrow and short fallback screenshots remain stable or
  intentionally updated.
- [x] Confirm draw-duration p95 remains within budget.
- [x] Confirm backing-store cap remains within budget.

First-pass notes:

- Updated intentional visual baselines for desktop shell, dense regional clips,
  and narrow fallback.
- Full `npm run test:visual` passed after snapshot review.

Acceptance:

- Visual snapshots represent the new cohesive direction.
- No semantic, hit-target, or accessibility regressions are hidden by snapshot
  updates.

## Phase 8: Documentation And Handoff

Status: Pending

Tasks:

- [ ] Update `docs/pharosville/CURRENT.md` with the new implemented visual model.
- [ ] Update `docs/pharosville/ASSET_PIPELINE.md` if generation workflow or
  style anchor changed.
- [ ] Update `docs/pharosville/PIXELLAB_MCP.md` if new tool usage, prompt
  rules, or promotion rules emerge.
- [ ] Update `docs/pharosville/TESTING.md` if validation lanes change.
- [ ] Update `docs/pharosville-page.md` only if product behavior or visual
  grammar changed.
- [ ] Record exact validation commands and outcomes in this tracker or a final
  handoff note.

Acceptance:

- Future agents can tell what changed, what remains pending, and which tests
  were run.

## Final Validation Gate

Before claiming broad completion:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

For deployed changes:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

Latest local validation, 2026-04-30:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Outcome: passed. `npm run build` still reports the existing Vite large chunk
warning for `pharosville-desktop-data`; no build failure.

Latest water-harmony follow-up, 2026-04-30:

- Expanded DEWS water coverage over the exposed outer perimeter strips called
  out in visual review:
  - Calm Anchorage now reaches the full left/southwest edge, including the
    cemetery-side perimeter.
  - Watch Breakwater now covers the upper edge strip that previously fell back
    to deep-water.
  - Alert Channel now continues down the far east approach so the right-side
    edge no longer renders as an isolated deep-water band.
- Made the central-island no-DEWS halo more authoritative by increasing the
  island periphery buffer and scoping that halo to the main island instead of
  also suppressing DEWS around the detached cemetery islet.
- Updated geography assertions and visual baselines for the intentional water
  mask change.

Validation:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Outcome: passed. `npm run build` still reports the existing Vite large chunk
warning for `pharosville-desktop-data`; no build failure.

## Settled Decisions

Settled on 2026-04-30.

- [x] Keep current `landmark.lighthouse` as the style anchor for the first pass.
  - Outcome: do not regenerate the lighthouse during the initial rework. Preserve
    the existing lighthouse crop, beacon geometry, and manifest role unless a
    later explicit style-anchor reset is approved.
- [x] Make `overlay.central-island` the authoritative island mass only after it
  is regenerated as a cohesive coastal village/island asset.
  - Outcome: do not treat the current overlay as final authoritative art. Use it
    as a temporary layer until a better island asset is generated and reviewed.
- [x] Replace docks as one generated family and promote them in one reviewed
  batch.
  - Outcome: avoid long-lived mixed harbor styles. Candidate review can be
    incremental, but runtime promotion should keep the dock family cohesive.
- [x] Regenerate terrain after renderer unification and island/dock proof.
  - Outcome: first quiet and normalize renderer terrain/water handling, then
    decide whether terrain PNGs still need replacement.
- [x] Update UI chrome before full asset promotion.
  - Outcome: chart-room/harbor-master chrome should establish the material
    language before committing a large PixelLab asset batch.

## Notes From Validation Agents

Renderer/layout validation:

- Mixed draw stack is the main patchwork source.
- Keep `world-layout.ts` semantics stable initially.
- Build cohesion through shared style helpers, quieter water, coast continuity,
  normalized dock underlays, and labels integrated as diegetic plaques.

Asset/PixelLab validation:

- Current manifest has 32 assets and validation passes.
- Runtime cap is 34 assets; prefer replacement over expansion.
- Preserve dimensions where possible.
- Biggest replacement candidates are `overlay.central-island`, dock family, and
  optionally ship family.
- Lighthouse crop/beacon and ship logo offsets are hard renderer contracts.

Product/visual validation:

- Direction is valid if framed as a maritime observatory diorama, not a cozy
  village.
- UI chrome should become quieter chart instrumentation.
- Avoid adding decorative buildings or new canvas meanings.
- Keep route/source/caveat details visible because canvas interpretation depends
  on DOM parity.

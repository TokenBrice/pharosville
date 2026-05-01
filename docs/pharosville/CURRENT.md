# Current PharosVille Agent Source Of Truth

Last updated: 2026-05-01

Use this file before changing PharosVille. It summarizes the current standalone Vite implementation shape for maintainers; the verified product contract remains `docs/pharosville-page.md`.

## Status

PharosVille is an implemented desktop-only standalone app served at `https://pharosville.pharos.watch/`. It is an old-school maritime isometric analytics surface backed by existing Pharos APIs, local PNG sprites, a pure world model, a Canvas 2D renderer, and DOM-accessible details.

The current visual revamp target is a dense dark-first maritime observatory
diorama: richer local sprites, textured sea/coast/harbor materials, warm
lighthouse and harbor lighting, readable in-world plaques, and polished
route-local chrome. It is not a ClaudeVille port; ClaudeVille contributed the
quality bar and validation habits, not its lore, fantasy-village objects,
agent mechanics, copy voice, or data semantics.

The current main-island revamp from
`agents/pharosville-main-island-revamp-plan.md` is implemented as a coordinated
layout, asset, renderer, test, and docs change:

- The accepted water-ratio target is 85.2-85.6% by tile count; the measured map
  ratio is about 85.4%.
- Baseline main-island land tiles were 592, excluding the cemetery islet. The
  compact island has 393 main-island land tiles, a 33.6% reduction.
- `LIGHTHOUSE_TILE` remains `{ x: 18, y: 28 }` and the visual-clearance box
  remains `x:14..24, y:23..32`.
- Runtime asset cache version is
  `2026-05-01-harbor-trim-v1`; the manifest-wide style
  anchor remains `2026-04-29-lighthouse-hill-v5` so all asset provenance stays
  validator-aligned. The static-scene cache key in `src/renderer/world-canvas.ts`
  includes `manifestCacheVersion`, so bumping `style.cacheVersion` invalidates
  the in-memory `staticLayerCache` rather than just the browser HTTP cache.
- The land-tile substrate is the limestone-family PixelLab tile pack
  (`terrain.land`, `terrain.land-scrub`, `terrain.shore`, batch
  `7b5aca9d-4984-4409-b1fe-76c1f781696f` seed `50501`); `landAssetIdFor`
  in `src/renderer/layers/terrain.ts` picks `terrain.land` vs
  `terrain.land-scrub` per tile via a 2D PRNG hash to break the iso-diagonal
  banding that a small-prime mod would have produced.
- The lighthouse rests on `overlay.lighthouse-headland` (384x192, PixelLab job
  `be1f0841-b378-48b5-9fb4-7f3e8749c92d`, post-processed in scratch with an
  ImageMagick sky color-key plus radial alpha vignette so its edges feather
  into surrounding tiles). It is drawn from the previously empty
  `drawLighthouseHeadland` stub at `camera.zoom * 0.5` so the sprite covers
  ~6 tiles around `LIGHTHOUSE_TILE` rather than overrunning the southern
  island half.
- Perimeter masonry now comes from a shared seawall model in
  `src/systems/seawall.ts`: a denser `overlay.seawall-*` placement list feeds
  `harbor-district.ts`, and the same module exports a blocked coastal-water ring
  that motion/path helpers treat as wall-capped water instead of navigable sea.
  The procedural `drawSeawallRun` taupe-and-light strokes that the previous
  build relied on are deleted. `overlay.seawall-straight` was regenerated to
  160x96 (PixelLab `3ff6e65f-e080-4971-ae3e-70dd9f0fb8b2`) so it reads as a wall
  not a curb; `overlay.seawall-corner` is unchanged.
- `overlay.central-island` and `drawCentralIslandModel` are retired. The
  diorama PNG was already dead code (no callers), and removing it lets the
  limestone tile pack carry the visible ground without a competing overlay.

Historical plans in this directory are context, not live instructions. If they conflict with this file, follow this file and the verified docs.

## Runtime Entry Points

- HTML and metadata shell: `index.html`
- React root and query provider: `src/main.tsx`
- App shell and screen-reader H1: `src/App.tsx`
- Viewport gate and dynamic desktop mount: `src/client.tsx`
- Desktop fallback: `src/desktop-only-fallback.tsx`
- Data hook aggregation: `src/pharosville-desktop-data.tsx`
- Canvas/runtime shell: `src/pharosville-world.tsx`
- Route styles: `src/pharosville.css`
- Pure world model: `src/systems/pharosville-world.ts`
- Map/terrain layout: `src/systems/world-layout.ts`
- Seawall geometry and wall-blocked coast ring: `src/systems/seawall.ts`
- Chain dock model: `src/systems/chain-docks.ts`
- Ship risk placement: `src/systems/risk-placement.ts`
- Risk-water source of truth: `src/systems/risk-water-areas.ts`
- Risk-water placement validation: `src/systems/risk-water-placement.ts`
- Printed water labels: `src/systems/area-labels.ts`
- Ship visuals and size classes: `src/systems/ship-visuals.ts`
- Deterministic ship routes: `src/systems/motion.ts`
- Detail/DOM parity: `src/systems/detail-model.ts`, `src/components/accessibility-ledger.tsx`
- Renderer facade and hit testing: `src/renderer/world-canvas.ts`, `src/renderer/hit-testing.ts`
- Renderer layers: `src/renderer/layers/*`, with shared primitives in `src/renderer/canvas-primitives.ts`
- Shared render geometry: `src/renderer/geometry.ts`
- Asset manifest/types: `public/pharosville/assets/manifest.json`, `src/systems/asset-manifest.ts`

## Current Route Invariants

- The desktop world must not mount below `1280px` width or `760px` height. Below that gate, keep the DOM fallback and avoid world queries, manifest fetches, canvas setup, and sprite decoding.
- PharosVille uses same-origin `/api/*` requests proxied by the Cloudflare Pages Function. Do not add client-side cross-origin API calls or expose `PHAROS_API_KEY`.
- The world model should stay pure and deterministic. Canvas drawing, hit testing, selected rings, follow-selected behavior, and debug frame state must sample the same motion model.
- Reduced-motion users get a deterministic non-animated frame without a running RAF loop.
- Normal motion uses one route-owned RAF clock. Motion caps, cue priority, and
  debug expectations are recorded in `docs/pharosville/MOTION_POLICY.md`.
- Canvas is not the only source of analytical meaning. Any new visual signal needs matching detail-panel or accessibility-ledger text.
- Ship placement and semantic water zones express peg/DEWS risk or source confidence. Dock visits express positive chain presence and supply share; they must not imply bridge volume, transaction flow, or real-time transfers.
- Fresh DEWS risk water uses edge-anchored compound/coast-aware masks. Ledger Mooring remains the only non-DEWS named risk-water area and now spans the entire top mooring shelf, touching Calm Anchorage along the western flank.

### DEWS zone geometry

Edge-anchored compound masks (current iteration as of 2026-04-30):

| Zone | Primary edge | Bounds | Approx tiles |
|------|--------------|--------|-------------:|
| WATCH | y=55 / east shelf | south breakwater basin plus the entire eastern shelf below the Alert ring | ~786 |
| CALM | x=0 | large left-edge vertical anchorage | ~665 |
| LEDGER | top edge | non-DEWS NAV mooring shelf spanning the entire top of the diamond, touching Calm at the western flank | ~310 |
| ALERT | x=55/eastern corner | upper outer eastern ring at the (55, 0) corner | ~150 |
| WARNING | x=55/eastern corner | middle eastern ring bridged into Danger Strait | ~65 |
| DANGER | x=55/eastern corner | inner/right storm strait on the angled shelf | ~48 |

The southeast corner basin is WATCH water rather than Calm Anchorage. The
eastern corner is covered by overlapping ALERT+WARNING+DANGER water at the
(55, 0) corner only; the eastern shelf below the Alert ring is reabsorbed into
Watch Breakwater so Alert Channel reads as a compact upper ring instead of a
strip running down the right edge. Warning Shoals touches the Danger Strait
shelf rather than leaving a generic water gap. The four-tile Chebyshev island
periphery is generic water except where the Watch shelf intentionally reaches
the coast; the lighthouse visual-clearance box (x:14..24, y:23..32) remains
generic water.
- Stale or missing peg evidence maps to Calm Anchorage with an evidence caveat unless a fresher risk signal exists; it must not create a separate sea zone or masquerade as storm/depeg risk.
- Stablecoin supply values from the list payload are already USD-denominated. Use `getCirculatingRaw()` for market-cap visual tiers.
- Local runtime assets come from `public/pharosville/assets/` and `manifest.json`. Do not reference remote prototype URLs at runtime.
- Treat `public/pharosville/assets/manifest.json` and `npm run check:pharosville-assets` as the asset inventory source of truth. At this update, the manifest contains 34 runtime assets, split by `loadPriority` into 23 critical/first-render entries and 11 deferred entries; rerun the validator instead of hand-maintaining prose counts.

## Current Visual Model

- Chain harbors are built from top chain supply and capped by `MAX_CHAIN_HARBORS` in `chain-docks.ts`.
- The authored map is `56 x 56` tiles. Deep outer water is intentionally a narrow perimeter shelf, not a large default border.
- The current composition target is 85.2-85.6% water by tile count after the compact main-island revamp. Tests pin both water ratio and the 393-tile main-island land count, excluding the cemetery islet.
- Named sea areas use printed cartographic water labels backed by
  `systems/area-labels.ts`; renderer drawing, hit targets, and follow-selected
  behavior must use the same placement metadata.
- Printed water labels render above entity sprites, so label visibility and label hit targets intentionally win over overlapping ships or tall landmarks.
- Sea terrain is semantic: harbor water, calm DEWS anchorage water, watch breakwater water, alert current, warning shoals, storm strait, ledger water, generic navigable water, and deep outer shelf each have distinct palette/texture handling. Manifest terrain sprites draw first; renderer overlays preserve analytical color semantics while adding shoals, foam, current streaks, storm chop, ledger glow, and reef/buoy context.
- Per-zone visual styling lives in a single `ZONE_THEMES` table in `src/systems/palette.ts`. Each entry bundles base/inner/wave/accent water colors, the procedural texture kind, label outline/fill/plaque colors, and motion amplitude/stroke-alpha scalars. `drawWaterAreaLabels` (`src/renderer/layers/water-labels.ts`) reads the theme via `RISK_WATER_AREAS[area.riskPlacement].terrain` so it routes Danger Strait through `storm-water` rather than a non-existent `danger-water` key. The exhaustiveness invariant (`SHIP_WATER_ZONES` ↔ `ZONE_THEMES`) is enforced both by `as const satisfies Record<...>` constraints on `ZONE_THEMES`, `ZONE_DWELL`, `OPEN_WATER_PATROL_WAYPOINTS`, and `ZONE_ROUGHNESS`, and by `src/systems/palette.test.ts`. Adjusting a zone's color, label styling, wave amplitude, or accent stroke alpha is a one-table edit; texture geometry, frequency, and procedural cadence still live inside the per-zone draw functions in `src/renderer/layers/terrain.ts`.
- Ship risk routes expose both `riskWaterLabel` and `riskZone` in details and the accessibility ledger. Reduced-motion ships freeze at their current risk-water idle tile, or Ledger Mooring for NAV ledger assets; harbor moorings are route stops, not the static representative position. In normal motion, routed ships spend one third of each cycle moored; non-titan ships are hidden while moored, while titan ships remain visible.
- Dock sprites are rank/preference selected through manifest IDs such as `dock.ethereum-harbor-hub`, `dock.harbor-ring-quay`, `dock.compact-harbor-pier`, `dock.rollup-ferry-slip`, and `dock.bridge-pontoon`; Ethereum's hub remains selectable while its dock body is drawn behind ships so harbor traffic sails over it.
- Dock selection reserves the Ethereum/L2 harbor cluster (`ethereum`, `base`, `arbitrum`, `polygon`) when those chains are present, intentionally suppresses Optimism as a rendered harbor, then fills the remaining eight-dock cap by chain stablecoin supply.
- The Ethereum/L2 cove prints `ETHEREUM HARBOR` and `L2 BAY` plaque signs using the same canvas label treatment as named DEWS water areas.
- Ship class is derived from governance/backing metadata:
  - centralized -> treasury galleon
  - centralized-dependent -> chartered brigantine
  - decentralized -> DAO schooner
  - algorithmic backing -> legacy algorithmic junk
  - unknown -> defensive caravel fallback
- Ship size is a compressed market-cap tier, not linear area.
- The current runtime manifest uses schema v2. `style.cacheVersion` controls image cache busting; `style.styleAnchorVersion` is the provenance/style anchor for generated assets.
- Asset loading is intentionally staged: the route loads the manifest and critical/first-render sprites before the initial canvas frame, then loads deferred sprite families after the core scene can render. Do not move visual-only sprites into the critical set without checking first-render need and the manifest cap.
- The current lighthouse asset is `landmark.lighthouse` at `public/pharosville/assets/landmarks/lighthouse-alexandria.png`, with manifest cache version `2026-05-01-harbor-trim-v1` and style anchor `2026-04-29-lighthouse-hill-v5`.
- Current ship sprites share the lighthouse style anchor, keep logo-safe sail/pennant zones, and treat overlays as small lanterns/pennants/signals rather than badges. Standard class hulls use 104 x 80 transparent PNGs; USDC, USDS, and USDT use dedicated titan hull PNGs, with USDS a bit smaller than USDC and USDT allowed to read larger than both.
- Current cemetery props share the same style anchor and use a local memorial sprite set under `public/pharosville/assets/props/`: `memorial-terrace`, `memorial-headstone`, `ledger-slab`, `reliquary-marker`, and `regulatory-obelisk`.

## Agent Workflow

1. Read `docs/pharosville-page.md`, this file, `CHANGE_CHECKLIST.md`, and `TESTING.md`.
2. Use `CHANGE_PLAYBOOK.md` to classify the task and choose the smallest relevant source/doc/test set.
3. For visual semantics, read `VISUAL_INVARIANTS.md`; for fixture or browser coverage, read `SCENARIO_CATALOG.md` and `VISUAL_REVIEW_ATLAS.md`.
4. For visual/asset changes, also read `ASSET_PIPELINE.md`; for PixelLab sprite generation, read `PIXELLAB_MCP.md`; for repeat-risk checks, read `KNOWN_PITFALLS.md`.
5. Run `git status --short` before editing. Preserve existing dirty work and inspect any file you intend to touch.
6. Keep code changes surgical and route-local unless the user asks for broader behavior.
7. Update `docs/pharosville-page.md` only when route behavior changes. Update this maintenance pack when process, ownership, or handoff guidance changes.

## Local Code Orientation

- `src/systems/README.md` explains the pure data-to-world layer and its extension points.
- `src/renderer/README.md` explains Canvas drawing, asset loading, hit testing, and renderer validation.

## Known Historical Drift

- `12-chain-harbor-docks-plan.md` describes a top-six dock target; the current model is governed by `MAX_CHAIN_HARBORS`.
- `13-ship-liveliness-motion-plan.md` and `14-ship-liveliness-handover.md` describe the implementation history of motion and DOM parity; the current code and this file are authoritative.
- `15-ship-classes-pixellab-plan.md` describes the generation/implementation plan for ship classes; use `ship-visuals.ts` and `ASSET_PIPELINE.md` for current behavior.
- `16-lighthouse-hill-regeneration-plan.md` is a completed asset history; use the manifest and `ASSET_PIPELINE.md` for current asset edits.

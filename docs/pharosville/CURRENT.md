# Current PharosVille Agent Source Of Truth

Last updated: 2026-05-03

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
`agents/completed/pharosville-main-island-revamp-plan.md` is implemented as a coordinated
layout, asset, renderer, test, and docs change:

- The accepted water-ratio target is 85.7-86.2% by tile count; the measured map
  ratio is about 85.9%.
- Baseline main-island land tiles were 592, excluding the cemetery islet. The
  compact island has 377 main-island land tiles, a 36.3% reduction.
- `LIGHTHOUSE_TILE` remains `{ x: 18, y: 28 }` and the visual-clearance box
  remains `x:14..24, y:23..32`.
- Runtime asset cache version is
  `2026-05-03-pigeonnier-v1`; the manifest-wide style
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

- The five Maker-family stables form two distinct squads that sail
  independently. **Sky squad**: USDS flagship + sUSDS savings cutter + stUSDS
  vanguard icebreaker. **Maker squad**: DAI flagship + sDAI savings cutter.
  Each squad activates iff its own flagship is in `activeAssets`; consorts
  inherit their squad's flagship risk placement and motion route, snap to a
  placement-aware formation offset around their flagship's tile, and render
  with a per-squad world-space golden bunting plus a per-squad bounding
  selection halo. The navToken→`ledger-mooring` short-circuit is overridden
  for any consort whose flagship is active. The squad data model lives in
  `src/systems/maker-squad.ts` (exports `SKY_SQUAD`, `MAKER_SQUAD`,
  `STABLECOIN_SQUADS`, `squadForMember`); chrome in
  `src/renderer/layers/maker-squad-chrome.ts`. Per-hull identity accents
  (admiral's banner on each squad flagship, forge-glow at hull joints on
  stUSDS, weathered patches on DAI) and synchronised wake interference live
  in `src/renderer/layers/ships.ts`. Squad-member titan scales are reduced
  ~20% from solo titans (USDS 1.35, DAI 1.25, sUSDS/sDAI 1.1, stUSDS 1.15)
  to relieve formation overlap; USDC and USDT remain at solo scales (1.8 /
  2.0). Each titan sprite has a dedicated PixelLab asset; sail-tint masks
  are tuned for DAI and sDAI, seeded for sUSDS/stUSDS whose painted sail
  colours fall outside `isSailTintPixel`'s recognised range (sprites render
  their painted colour without runtime livery tinting; see
  `UNTUNED_TITAN_IDS` in `src/renderer/ship-sail-tint.test.ts`).

- Heritage hulls (unique tier) sit between titans and standard hulls and are
  curated by cultural significance rather than market cap. Members get
  dedicated 136×100 PixelLab sprites (single-frame, deferred load) and stay
  visible/selectable while moored, but skip titan-only chrome (foam, spray,
  full pose, sail flutter). The current registry in
  `src/systems/unique-ships.ts` covers crvUSD (Curve / llama), BOLD (Liquity
  / spartan), fxUSD (f(x) Protocol / mathematical livery), xAUT (Tether gold
  barge), and PAXG (Paxos gilded merchantman). All five sprites share an
  oxidized-bronze masthead lantern and cream bowsprit pennant as a tier-
  unifying device. Each carries a per-ship rationale string surfaced as a
  "Cultural significance" line in the detail panel and accessibility
  ledger. The user-facing `sizeLabel` is `"Heritage hull"` while the
  internal `sizeTier === "unique"` discriminator drives all rendering and
  routing. Mooring uses flagship-tier dock placement (depth bonus 2,
  barrier clearance 3.3). Sail-tint masks are tuned for paxg-unique; the
  remaining four (`crvusd`/`bold`/`fxusd`/`xaut`) sit in
  `UNTUNED_UNIQUE_IDS` because their painted brand colors fall outside
  `isSailTintPixel`'s recognised range — these ships render their painted
  identity directly by design.

- **Iconographic sail emblem rule (unique + titan tiers).** Every unique-
  and titan-tier ship carries a single iconographic silhouette painted
  directly into the mainsail at heraldic scale (~1/4 sail). Marks are
  silhouette-only — no text, no numerals, no literal logos. Brand identity
  reads through sail-cloth tint × emblem silhouette together (Curve →
  llama, Tether → kraken, Circle → compass rose). Standard hulls keep the
  runtime SVG-logo overlay drawn at render time. The painted-emblem ships
  are excluded from `drawSailLogo` via an explicit ship-id allowlist in
  `src/renderer/layers/ships.ts`. Per Phase 1
  (`agents/2026-05-02-iconographic-sail-emblem-plan.md`), USDT and USDC
  ship as static (single-frame) titans while their painted emblems land;
  future titans re-introduce frame animation once the generation pipeline
  guarantees per-frame emblem consistency.

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
| LEDGER | top edge | non-DEWS NAV mooring shelf spanning the top of the diamond, touching Calm at the western flank; top two rows (y∈[0,1]) taper east at x=22 to widen the buffer to the Alert ring | ~294 |
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
- Treat `public/pharosville/assets/manifest.json` and `npm run check:pharosville-assets` as the asset inventory source of truth. The validator's `maxManifestAssets` cap is currently 62 (see `scripts/pharosville/validate-assets.mjs`); rerun the validator instead of hand-maintaining prose counts.

## Current Visual Model

- Chain harbors are built from top chain supply and capped by `MAX_CHAIN_HARBORS` in `chain-docks.ts`.
- The authored map is `56 x 56` tiles. Deep outer water is intentionally a narrow perimeter shelf, not a large default border.
- The current composition target is 85.7-86.2% water by tile count after the compact main-island revamp. Tests pin both water ratio and the 377-tile main-island land count, excluding the cemetery islet.
- Named sea areas use printed cartographic water labels backed by
  `systems/area-labels.ts`; renderer drawing, hit targets, and follow-selected
  behavior must use the same placement metadata.
- Printed water labels render above entity sprites, so label visibility and label hit targets intentionally win over overlapping ships or tall landmarks.
- Sea terrain is semantic: harbor water, calm DEWS anchorage water, watch breakwater water, alert current, warning shoals, storm strait, ledger water, generic navigable water, and deep outer shelf each have distinct palette/texture handling. Manifest terrain sprites draw first; renderer overlays preserve analytical color semantics while adding shoals, foam, current streaks, storm chop, ledger glow, and reef/buoy context.
- Per-zone visual styling lives in a single `ZONE_THEMES` table in `src/systems/palette.ts`. Each entry bundles base/inner/wave/accent water colors, the procedural texture kind, label outline/fill/plaque colors, and motion amplitude/stroke-alpha scalars. `drawWaterAreaLabels` (`src/renderer/layers/water-labels.ts`) reads the theme via `RISK_WATER_AREAS[area.riskPlacement].terrain` so it routes Danger Strait through `storm-water` rather than a non-existent `danger-water` key. The exhaustiveness invariant (`SHIP_WATER_ZONES` ↔ `ZONE_THEMES`) is enforced both by `as const satisfies Record<...>` constraints on `ZONE_THEMES`, `ZONE_DWELL`, `OPEN_WATER_PATROL_WAYPOINTS`, and `ZONE_ROUGHNESS`, and by `src/systems/palette.test.ts`. Adjusting a zone's color, label styling, wave amplitude, or accent stroke alpha is a one-table edit; texture geometry, frequency, and procedural cadence still live inside the per-zone draw functions in `src/renderer/layers/terrain.ts`.
- Ship risk routes expose both `riskWaterLabel` and `riskZone` in details and the accessibility ledger. Reduced-motion ships freeze at their current risk-water idle tile, or Ledger Mooring for NAV ledger assets; harbor moorings are route stops, not the static representative position. In normal motion, routed ships spend one third of each cycle moored; non-titan, non-unique ships are hidden while moored, while titan and heritage-hull ships remain visible.
- Dock sprites are rank/preference selected through manifest IDs such as `dock.ethereum-harbor-hub`, `dock.harbor-ring-quay`, `dock.compact-harbor-pier`, `dock.rollup-ferry-slip`, and `dock.bridge-pontoon`; Ethereum's hub remains selectable while its dock body is drawn behind ships so harbor traffic sails over it.
- Dock selection reserves the Ethereum/L2 harbor cluster (`ethereum`, `base`, `arbitrum`, `polygon`) when those chains are present, intentionally suppresses Optimism as a rendered harbor, then fills the remaining eight-dock cap by chain stablecoin supply.
- Ship class is derived from governance/backing metadata:
  - centralized -> treasury galleon
  - centralized-dependent -> chartered brigantine
  - decentralized -> DAO schooner
  - algorithmic backing -> legacy algorithmic junk
  - unknown -> defensive caravel fallback
- Ship size is a compressed market-cap tier, not linear area.
- The current runtime manifest uses schema v2. `style.cacheVersion` controls image cache busting; `style.styleAnchorVersion` is the provenance/style anchor for generated assets.
- Asset loading is intentionally staged: the route loads the manifest and critical/first-render sprites before the initial canvas frame, then loads deferred sprite families after the core scene can render. Do not move visual-only sprites into the critical set without checking first-render need and the manifest cap.
- The current lighthouse asset is `landmark.lighthouse` at `public/pharosville/assets/landmarks/lighthouse-alexandria.png`, with manifest cache version `2026-05-02-ethereum-yggdrasil-v1` and style anchor `2026-04-29-lighthouse-hill-v5`.
- The central plaza is filled by the ambient `overlay.center-cluster` observatory citadel — a dense limestone+terracotta residential cluster anchored at `CIVIC_CORE_CENTER (31, 31)`, drawn between the district-pad and lighthouse-headland passes via `src/renderer/layers/center-cluster.ts`. It carries no analytical signal and no detail-panel parity. A single `prop.sundial` at tile (35, 31) reinforces the observatory identity. The lighthouse remains the dominant vertical anchor; the cluster's silhouette caps at ≈ 110 px in 1× zoom.
- A `landmark.pigeonnier` carrier-pigeon dovecote sits on a single-tile islet
  at `(42, 48)` in the south Watch Breakwater basin (mirroring the cemetery
  islet across the south coast). Sprite is a 128×160 PixelLab map object
  (`mcp:create_map_object` job `2eb5872c-416d-4708-b746-7cb4ee8328bc`) at
  `displayScale 0.55`. The islet is geometry-only — `PIGEON_ISLAND_CENTER` and
  `PIGEON_ISLAND_RADIUS` extend `islandValue()` in
  `src/systems/world-layout.ts` so it is excluded from the 377-tile main-island
  count, matching the cemetery pattern. The pigeonnier is a
  signal-bearing-flavor entity: it carries a `PigeonnierNode` (kind
  `"pigeonnier"`) with a detail panel + accessibility-ledger row that
  advertises the PharosWatch Telegram bot for stablecoin depeg and
  safety-score alerts. The detail link (`https://pharos.watch/telegram/`) is
  the route's first external destination and renders with
  `target="_blank" rel="noopener noreferrer"` via an optional `target` field
  on `DetailModel.links`. Renderer pass lives in
  `src/renderer/layers/pigeonnier.ts`, called between `drawYggdrasil` and
  `drawCemeteryGround` in `world-canvas.ts`.
- The Ethereum civic-cove rotunda's inner plaza is anchored by the `landmark.yggdrasil` world-tree (256×320 PixelLab job `750b6527`, displayScale `0.6`) at tile `(42.5, 29.2)` — pure-flavor mythic landmark drawn in the static-scene pass after the cove dock body and before the lighthouse-headland pass, so harbor traffic sails over its canopy. The cove dock displayScale was bumped from 0.8 to 0.9 (+12%) so the rotunda holds the tree without crowding; the surrounding `civic-*` plant/decoration props are scaled down ~12% to balance. Lighthouse silhouette remains the dominant vertical anchor. The Yggdrasil carries no analytical signal and no detail-panel parity, matching the `overlay.center-cluster` precedent. Validator `maxManifestAssets` was bumped from 55 to 56 to fit `landmark.yggdrasil`.
- Solana and Hyperliquid harbors were relocated off the prior north-wall pairing: Solana sits at the NW shoulder `(25, 23)` near the lighthouse, Hyperliquid sits on the south periphery `(36, 39)` between Base and Arbitrum. Aptos slid west into Solana's old N-wall slot at `(32, 22)`. Hyperliquid is now an explicit entry in `PREFERRED_DOCK_TILES` (was previously placed dynamically into a spare slot).
- Current ship sprites share the lighthouse style anchor. Standard class hulls (104×80) reserve a logo-safe sail/pennant zone for the runtime SVG-logo overlay; unique- and titan-tier hulls carry an iconographic silhouette painted directly into the mainsail (no runtime overlay). Secondary `ShipVisual.overlay` cues render as small lanterns, pennants, or signal flags rather than badges. USDC, USDS, and USDT use dedicated titan hull PNGs, with USDS a bit smaller than USDC and USDT allowed to read larger than both.
- Current cemetery props share the same style anchor and use a local memorial sprite set under `public/pharosville/assets/props/`: `memorial-terrace`, `memorial-headstone`, `ledger-slab`, `reliquary-marker`, and `regulatory-obelisk`.

## Agent Workflow

1. Read `docs/pharosville/AGENT_ONBOARDING.md`.
2. Read `docs/pharosville-page.md`, this file, `CHANGE_CHECKLIST.md`, and `TESTING.md`.
3. Use `CHANGE_PLAYBOOK.md` to classify the task and choose the smallest relevant source/doc/test set.
4. For visual semantics, read `VISUAL_INVARIANTS.md`; for fixture or browser coverage, read `SCENARIO_CATALOG.md` and `VISUAL_REVIEW_ATLAS.md`.
5. For visual/asset changes, also read `ASSET_PIPELINE.md`; for PixelLab sprite generation, read `PIXELLAB_MCP.md`; for repeat-risk checks, read `KNOWN_PITFALLS.md`.
6. Run `git status --short` before editing. Preserve existing dirty work and inspect any file you intend to touch.
7. Keep code changes surgical and route-local unless the user asks for broader behavior.
8. Update `docs/pharosville-page.md` only when route behavior changes. Update this maintenance pack when process, ownership, or handoff guidance changes.

## Local Code Orientation

- `src/systems/README.md` explains the pure data-to-world layer and its extension points.
- `src/renderer/README.md` explains Canvas drawing, asset loading, hit testing, and renderer validation.

## Known Historical Drift

- `12-chain-harbor-docks-plan.md` describes a top-six dock target; the current model is governed by `MAX_CHAIN_HARBORS`.
- `13-ship-liveliness-motion-plan.md` and `14-ship-liveliness-handover.md` describe the implementation history of motion and DOM parity; the current code and this file are authoritative.
- `15-ship-classes-pixellab-plan.md` describes the generation/implementation plan for ship classes; use `ship-visuals.ts` and `ASSET_PIPELINE.md` for current behavior.
- `16-lighthouse-hill-regeneration-plan.md` is a completed asset history; use the manifest and `ASSET_PIPELINE.md` for current asset edits.

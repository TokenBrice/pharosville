# Harbor Diversity Revamp — Design

Date: 2026-05-01
Branch: `harbor-diversity`
Worktree: `.worktrees/harbor-diversity`

## Problem

The current chain dock sprite roster has three issues:

1. **Three sprites are double-booked** across chains (`bridge-pontoon` for arbitrum + scroll, `sentinel-breakwater` for linea + zksync, `compact-harbor-pier` for bsc + solana).
2. **Five sprites bake water/turf into the PNG** (`bridge-pontoon`, `sentinel-breakwater`, `compact-harbor-pier`, `rollup-ferry-slip`, `vault-quay`), which fights the harbor-water terrain tile and reads as poorly cut sprites.
3. **No chain identity** — the docks form a generic-maritime mix without any per-chain reading.

The user-approved sprites are `ethereum-harbor-hub` ("good") and `market-marina` ("ok"). Both are still regenerated as part of this revamp so the harbor reads as one cohesive new style set rather than a mix of old and new.

## Goals

- Each chain in the dense-scenario roster gets its own visually distinct dock sprite.
- Subtle chain motifs in architecture/material — never logos, chain names, or analytical colors.
- All 10 new sprites share one coherent style anchor matching the existing manifest.
- Cleanly remove deprecated sprites and IDs.

## Scope

### In scope
- 10 new dock sprites for the dense-fixture chain roster.
- Manifest entries (geometry, anchor, hitbox, prompt provenance).
- Chain → asset mapping in `src/systems/chain-docks.ts`.
- Tile mapping in `src/systems/world-layout.ts` (drop mantle, add avalanche).
- `style.cacheVersion` bump.
- Visual snapshot rebaseline for the 7 affected dense screenshots.

### Out of scope
- Renderer flag/pennant code (`world-canvas.ts:2767+`).
- Ship sprites, terrain, landmarks, props.
- Sprites for mantle/linea/scroll/zksync (these ride the `wooden-pier` fallback by design).
- Live deploy.
- The pre-existing motion / frame-cache / api-hooks uncommitted changes in the main checkout.

## Roster

The 10 chains in `DENSE_CHAIN_IDS` (`src/__fixtures__/pharosville-world.ts`) define the roster. All other chains fall back to `dock.wooden-pier`.

| Chain | New asset ID | Theme | Tier | Approx. dimensions |
|---|---|---|---|---|
| ethereum | `dock.ethereum-civic-cove` | Civic limestone curved harbor wall, bronze beacon mast, central colonnade pavilion. | 1 | 280 × 200 |
| tron | `dock.tron-arena-wharf` | Terracotta amphitheater archway over water, broad stone landing, bronze trim. | 1 | 256 × 184 |
| bsc | `dock.bsc-mercantile-wharf` | Stacked timber-warehouse pier, rows of warm lantern posts, cargo crates and rope coils. | 2 | 224 × 160 |
| solana | `dock.solana-prism-stilt` | Slender pier on tall stilts with a row of crystal-glass column lamps catching teal light. | 2 | 208 × 160 |
| base | `dock.base-modular-slip` | Riveted navy-painted steel pier with parallel girder beams and a low signal mast. | 3 | 192 × 136 |
| arbitrum | `dock.arbitrum-arch-bridge` | Limestone arch span connecting two stone berths, small judge's pavilion at the apex. | 3 | 192 × 136 |
| polygon | `dock.polygon-hexmarket` | Hex-tiled deck, terracotta-cloth awnings, trader stalls. | 3 | 192 × 136 |
| optimism | `dock.optimism-sunrise-beacon` | Compact stone landing, tall terracotta-and-bronze beacon tower, warm lantern. | 4 | 176 × 128 |
| aptos | `dock.aptos-jade-pagoda` | Small pier, single eastern-tiered pavilion in pale limestone with teal-glazed eaves. | 4 | 176 × 128 |
| avalanche | `dock.avalanche-alpine-watch` | Compact dock, steep-pitched dark-timber lookout tower, single warm lantern. | 4 | 176 × 128 |

**Retained legacy sprite**: `dock.wooden-pier` (96 × 64). All other 13 existing dock sprites are removed.

The dimensions in the table are **generation targets** — PixelLab output may diverge by a few pixels. The actual delivered width/height are recorded in `manifest.json` once each candidate is accepted and the renderer's anchor/footprint/hitbox are derived from the real PNG.

The ethereum sprite must keep the lateral footprint that lets ships sail "behind" it as the renderer currently expects (`world-canvas.ts:572` and 1657–1672). Visual content can be lighter than the current 336×240 ring as long as the sprite anchor and footprint preserve the back-render layering.

## Generation Workflow

Per `docs/pharosville/PIXELLAB_MCP.md`. Each sprite goes through:

1. **Generate** — `mcp__pixellab__create_map_object` with the manifest style anchor + chain motif + tier dimensions. Single-shot per chain. No review packs.
2. **Stage** — download to `output/pharosville/pixellab-prototypes/harbor-diversity/<chain>.png` via `curl --fail`. Do not touch `public/pharosville/assets/` until accepted.
3. **Quality gate** — verify per `PIXELLAB_MCP.md`:
   - transparent background, clean waterline contact shadow, no baked water/turf bleed
   - silhouette legible at intended display scale
   - no text, logos, chain colors competing with DEWS overlays
   - flag/pennant area free for runtime logo
   - dimensions match the assigned tier
4. **Promote** — copy PNG to `public/pharosville/assets/docks/<id>.png`, write manifest entry with `tool: "mcp:create_map_object"`, `promptProvenance.jobId`, optional `seed`, `styleAnchorVersion: "2026-04-29-lighthouse-hill-v5"`.

**Prompt template**:

```
old-school 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, deep navy and teal sea, pale limestone and terracotta island city, bronze and gold beacon light, restrained analytics palette, readable silhouettes, no text, no logos, no UI, transparent background.

Object: <motif phrase>. Materials: <chain-specific material cue>. Clean dark contact shadow at the waterline. No painted water or turf around the dock. Flag/pennant area left clean for runtime mark.

view: low top-down. outline: single color outline. shading: medium shading. detail: medium detail.
```

**Iteration policy**: max 2 regenerations per chain. If a third attempt still fails the quality gate, surface to the operator before burning more credits.

## Code Changes

| File | Change |
|---|---|
| `src/systems/chain-docks.ts` | Replace `PREFERRED_DOCK_ASSET_IDS` with the 10-key map. Trim `DOCK_ASSET_IDS` to just the 10 new IDs. Keep `dock.wooden-pier` final fallback. |
| `src/systems/world-layout.ts` | `PREFERRED_DOCK_TILES`: drop `mantle`, add `avalanche` to an `OUTER_HARBOR_DOCK_TILES` slot. Result: 5 EVM-bay + 5 outer slots used. |
| `public/pharosville/assets/manifest.json` | Remove the 13 deprecated dock entries, add the 10 new entries with proper anchor / footprint / hitbox / promptProvenance. Prune `requiredForFirstRender`. Bump `style.cacheVersion` to `"2026-05-01-pharosville-harbor-diversity-v1"`. |
| `public/pharosville/assets/docks/` | Delete 13 obsolete PNGs (everything except `wooden-pier.png`). Add the 10 new PNGs. |

## Validation

**Per sprite (cheap, run after each promotion)**:
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run typecheck`

**Final pass (after all 10 sprites promoted and code wired)**:
- `npm test` — unit suite, including chain-docks and world-layout coverage.
- `npm run build` — Vite build.
- `npm run test:visual` — Playwright snapshots. The 7 dense screenshots will diff:
  - `pharosville-dense-evm-bay-linux.png`
  - `pharosville-dense-cemetery-linux.png`
  - `pharosville-dense-ledger-north-linux.png`
  - `pharosville-dense-lighthouse-linux.png`
  - `pharosville-dense-risk-water-linux.png`
  - `pharosville-dense-ship-flotillas-linux.png`
  - `pharosville-desktop-shell-linux.png`

  Inspect diffs manually, then re-baseline with `--update-snapshots`. Snapshot updates land in the same commit that lands the revamp.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| PixelLab returns a candidate with baked water/turf again. | Quality gate is run per sprite; bad candidates stay in scratch. Iteration policy caps at 2 regens before surfacing. |
| New ethereum sprite breaks back-render layering of ships. | Match anchor and lateral footprint of current ring. Visual snapshot of `pharosville-desktop-shell-linux.png` will catch breakage. |
| Visual snapshot drift hides incidental regressions in unrelated regions. | Inspect each diff before re-baselining; do not blanket update. |
| Cache invalidation misses some clients. | `style.cacheVersion` bump in manifest forces re-fetch on next load. |
| 10 sprite generations × 2 regens worst case = high PixelLab credit burn. | Iteration cap surfaces failures early; one-shot first attempt per chain. |
| Mantle/linea/scroll/zksync (still in `ETHEREUM_L2_DOCK_CHAIN_IDS` priority list) appearing in production would render as the tiny 96×64 `wooden-pier` in an EVM-bay slot, looking visually mismatched against the larger themed neighbors. | Acceptable per the user's chosen scope (option A — only the 10 dense-fixture chains get themed sprites). If this ever becomes a real visual problem, expanding the roster to 14 is a follow-up, not a blocker. |

## Rollout

1. All work happens on `harbor-diversity` branch in `.worktrees/harbor-diversity`.
2. Sprites generated and promoted iteratively. Per-sprite cheap validation between promotions.
3. Once all 10 sprites are in place and code is wired, run the full validation suite.
4. After validation passes, invoke `superpowers:finishing-a-development-branch` to choose merge or PR path.
5. Live deploy is a separate, manual gate — not part of this scope.

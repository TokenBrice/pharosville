# PharosVille Wave 6 — Implementation Prep

- Date: 2026-05-18
- Parents:
  - `agents/2026-05-17-pharosville-wow-revamp-plan.md`
  - `agents/2026-05-18-pharosville-wow-revamp-followup.md`
- Status: PROPOSED — handoff for the human + future implementation agents
- Scope: only Wave 6 (W6.01 – W6.14). Wave 5 is a hard prereq and is treated as
  upstream context.

This document is the operational substrate for executing Wave 6 with no
further investigation. Every claim about a file path, line number, or
interface shape is backed by a tool call run against `main` on
2026-05-18.

---

## 1. Asset-pipeline mechanics

### 1.1 Manifest format

Authoring source: `public/pharosville/assets/manifest.json` (2,730 lines, schema v2, 69 entries today). Runtime trim: `manifest.runtime.json` is emitted by `scripts/pharosville/build-runtime-manifest.mjs` and the Vite plugin in `vite.config.ts`, stripping `prompt`, `promptKey`, `promptProvenance`, `semanticRole`, `criticalReason`, `paletteKeys`, `tool`, plus `style.anchor` and `style.generationDefaults`.

Type contract — `src/systems/asset-manifest.ts:28-53`:

```ts
export interface PharosVilleAssetManifestEntry {
  animation?: PharosVilleAssetAnimation;
  anchor: [number, number];
  beacon?: [number, number];
  category: PharosVilleAssetCategory;          // "terrain"|"landmark"|"dock"|"ship"|"prop"|"overlay"
  criticalReason?: string;
  displayScale: number;
  footprint: [number, number];
  height: number;
  hitbox: [number, number, number, number];
  id: string;
  layer: string;
  loadPriority: PharosVilleAssetPriority;       // "critical" | "deferred"
  paletteKeys?: string[];
  phase?: PharosVilleAssetPhase;                // "shellCritical"|"visibleCritical"|"deferred"
  path: string;
  promptKey?: string;
  promptProvenance?: {
    jobId?: string;
    seed?: number;
    styleAnchorVersion: string;                 // MUST match manifest.style.styleAnchorVersion
  };
  semanticRole?: string;
  tool?: string;                                // e.g. "mcp:create_map_object"
  width: number;
}
```

Animation block (`src/systems/asset-manifest.ts:13-26`):

```ts
export interface PharosVilleAssetAnimation {
  durationMs?: number;                           // exactly one of durationMs|fps required
  fps?: number;
  frameCount: number;
  frameSource: string;                           // PNG sprite-sheet path, relative to /pharosville/assets/
  loop: boolean;
  reducedMotionFrame: number;                    // < frameCount
  spriteSheet?: { columns: number; frameHeight: number; frameWidth: number; rows: number };
}
```

Required per-entry fields (validator: `validate-assets.mjs:129-236`): `id` matches `/^(building|dock|landmark|overlay|prop|ship|terrain)\.[a-z0-9-]+$/`; `category` ∈ allowed set (line 17); `layer` non-empty; `loadPriority` ∈ `{critical, deferred}` (line 18); optional `phase` ∈ `{shellCritical, visibleCritical, deferred}` (line 19, default-derived from `loadPriority` at `asset-manifest.ts:117-120`); `displayScale` ∈ `(0, 4]`; `width`/`height` positive int matching PNG IHDR; `anchor [x,y]` within bounds; `footprint [w,h]` positive; `hitbox [x,y,w,h]` inside image; `path` relative, ends `.png`; `promptProvenance.styleAnchorVersion` MUST equal `manifest.style.styleAnchorVersion`; `loadPriority: "critical"` ⇔ entry in `manifest.requiredForFirstRender`; `criticalReason` only valid on critical / first-render entries.

Animated entries require `animation.frameSource` to exist as a separate PNG (validator: `validate-assets.mjs:488-520`). Every titan animation today uses a 4×1 4-fps sprite sheet at the same per-frame dimensions as `path`.

#### Example: titan entry (USDT, `manifest.json:1907-1956`)

```json
{
  "id": "ship.usdt-titan",
  "path": "ships/usdt-titan.png",
  "category": "ship",
  "layer": "ships",
  "width": 192,
  "height": 128,
  "displayScale": 1,
  "anchor": [96, 111],
  "footprint": [70, 28],
  "hitbox": [30, 2, 128, 112],
  "loadPriority": "critical",
  "criticalReason": "USDT uses the largest dedicated titan hull on the first coherent ship frame.",
  "animation": {
    "frameCount": 4,
    "frameSource": "ships/usdt-titan-frames.png",
    "fps": 4,
    "loop": true,
    "reducedMotionFrame": 0,
    "spriteSheet": { "columns": 4, "rows": 1, "frameWidth": 192, "frameHeight": 128 }
  },
  "promptKey": "ship.usdt-titan",
  "semanticRole": "USDT supreme titan stablecoin ship hull",
  "paletteKeys": ["weathered wood", "limestone", "bronze beacon", "teal sea"],
  "tool": "mcp:create_map_object+imagemagick",
  "promptProvenance": {
    "jobId": "c33f2297-b6ba-4d55-9e3a-1b6023365f06",
    "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5"
  }
}
```

`frameSource` for animated ships points at a horizontal sprite sheet
sibling PNG. Asset loader reads it via
`loadAssetFrameSource(asset, manifest, signal)` at
`src/renderer/asset-manager.ts:470-483`, gated by
`asset.animation?.frameSource`. The validator reads its
`bytes.readUInt32BE(16/20)` to ensure the sheet covers
`columns × frameWidth` × `rows × frameHeight`.

#### Example: dock entry (Solana, `manifest.json:780-815`)

`{ "id": "dock.solana-prism-stilt", "path": "docks/solana-prism-stilt.png", "category": "dock", "layer": "docks", "width": 192, "height": 136, "displayScale": 1, "anchor": [96,106], "footprint": [98,40], "hitbox": [10,16,172,110], "loadPriority": "critical", "criticalReason": "…", "promptKey": "dock.solana-prism-stilt", "semanticRole": "solana prismatic stilt-pier", "paletteKeys": ["limestone","weathered wood","teal sea"], "tool": "mcp:create_map_object+imagemagick", "promptProvenance": { "jobId": "b429c45f-…", "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5" } }`

#### Example: prop entry (sundial, `manifest.json:2228-2261`)

`{ "id": "prop.sundial", "path": "props/sundial.png", "category": "prop", "layer": "props", "width": 64, "height": 64, "displayScale": 1, "anchor": [32,56], "footprint": [20,12], "hitbox": [16,14,32,42], "loadPriority": "deferred", "promptKey": "prop.sundial", "semanticRole": "observatory sundial monument", "paletteKeys": ["limestone","copper"], "tool": "mcp:create_object", "promptProvenance": { "jobId": "94047e66-…", "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5" } }`

#### `promptProvenance` shape

Always 1–3 fields: `{ jobId, seed?, styleAnchorVersion }`. `seed` only appears for seeded tile/probe runs. Sister assets sometimes reuse a job ID via sentinel prefix (e.g. `"reuse:imperial-A:..."` at `manifest.json:1207` for `ship.usde-titan` / `ship.susde-titan`, sharing the USDC titan campaign body). The validator only enforces the `styleAnchorVersion` field equality with the top-level value.

#### `frameSource` for animated ships

For titans with animation, the runtime gets two images: `path` (static / reduced-motion frame) and `animation.frameSource` (sprite sheet). The loader builds both into `LoadedPharosVilleAsset` (`asset-manager.ts:9-15, 246-250`). Sprite-sheet geometry validates against the frame-source PNG dimensions in `validateSpriteSheet` (`validate-assets.mjs:522-542`).

### 1.2 Style anchor

Current value `2026-04-29-lighthouse-hill-v5`. **Manifest-level** under `manifest.style.styleAnchorVersion` (`manifest.json:5`), enforced both ways: schema-required for v2 (`validate-assets.mjs:384`, `asset-manifest.ts:73`), and every per-asset `promptProvenance.styleAnchorVersion` MUST equal the manifest value (`validate-assets.mjs:226-229`). The per-asset value is effectively a copy. **Do not bump `styleAnchorVersion` during Wave 6** — only `cacheVersion` changes.

### 1.3 Manifest cap config

Location: `scripts/pharosville/validate-assets.mjs:25-32`. Current value: `const maxManifestAssets = 69;`

Recent history (comment block lines 25-31): 55→56 (yggdrasil), 56→61 (harbor-life decor), 61→62 (pigeonnier), 62→63 (TON pigeonnier pier), 63→69 (first-render squad additions).

Enforcement at line 82: `if (manifest.assets?.length > maxManifestAssets) errors.push(…)`. **Counts entries (`manifest.assets.length`)**, not files. WebP twins under a `webpPath` field on an existing entry count zero (one `id` per entry).

#### Projected delta for Wave 6 (entries, not files)

| Task | Entries added |
|---|---|
| W6.01 USDT regen | 0 (in-place) |
| W6.02 five remaining titans regen | 0 (in-place) |
| W6.03 xAUT regen | 0 (in-place) |
| W6.06 FRAX heritage | +1 (`ship.frax-unique`) |
| W6.06 GHO heritage | +1 (`ship.gho-unique`) |
| W6.07 agora regen | 0 (in-place, `overlay.center-cluster`) |
| W6.08 Hyperliquid dock | +1 (`dock.hyperliquid-trading-floor`) |
| W6.09 Solana scale-up | 0 (in-place, dims change) |
| W6.10 AVAX/Base/Polygon/Arbitrum regens | 0 (in-place) |
| W6.11 Sundial bump | 0 (in-place, dims change) |
| W6.12 dock-awning prop | +1 |
| W6.12 dock-figures prop | +1 |
| W6.12 lantern-string prop | +1 |
| W6.13/W6.14 WebP twins / provenance | 0 (`webpPath` field on existing entries) |

**Net entries added: +6.** Followup plan §5 (W6.12 cap-allowance note)
estimates +6 to +9; if W6.12 figures or awnings end up duplicated per
chain (per-chain tints) as separate manifest entries instead of a single
shared sprite, the cap raises by an additional +0..+4. Recommended new
cap (assuming single shared figure/awning/lantern-string sprites,
per-chain tint applied at render time via the prop's `livery.primary`
table lookup, mirroring the existing dock-flag tint pattern):

```js
// 2026-06-W6: bumped 69 -> 75 for Wave 6 identity pass
//   (+1 dock.hyperliquid-trading-floor, +2 FRAX/GHO heritage hulls,
//    +3 dock-side ambient prop kinds: dock-awning, dock-figures, lantern-string).
const maxManifestAssets = 75;
```

**Locked (decision D1 §6):** dock-figures / dock-awning / lantern-string
are **one PNG each**, shared across harbors. The awning is tinted per
harbor at render time via `drawTintedAsset` (§1.6 step 3); figures and
lantern strings are universal silhouettes.

The cap raise must happen **exactly once at wave start**, in the first
PR of the wave, before any new entries are added. The same comment line
must record the bump rationale per the existing convention
(`validate-assets.mjs:25-31`).

#### First-render budget interaction

`firstRenderBudgets` at `validate-assets.mjs:33-38`: `{ maxCount: 33, maxBytes: 575 KiB, maxDecodedPixels: 875_000 }`. Today exactly 33 critical assets (verified). A new `dock.hyperliquid-trading-floor` at `loadPriority: critical` overflows to 34. **Required: ship W6.08 as `loadPriority: deferred`** unless `firstRenderBudgets.maxCount` is also bumped 33→34 in the cap-raise PR. The parent plan §Wave 4 W6.08 says only "+1 manifest entry". W6.09 (Solana scale-up) stays in-budget because `dock.solana-prism-stilt` is already on `requiredForFirstRender` (`manifest.json:33`).

### 1.4 Cache version locations

One literal in `manifest.json` drives every downstream consumer. To bump atomically, change the source; consumers re-derive.

| File | Line | Use |
|---|---|---|
| `public/pharosville/assets/manifest.json` | `4` | source of truth (`"cacheVersion": "2026-05-03-ton-pigeonnier-pier-v3"`) |
| `src/systems/asset-manifest.ts` | `72`, `101-103` | typed accessor `manifestCacheVersion(manifest)` |
| `src/systems/asset-manifest.ts` | `109-111` | `assetUrl(asset, manifest)` appends `?v=${encodeURIComponent(cacheVersion)}` to every PNG URL |
| `src/renderer/asset-manager.ts` | `5`, `246-247`, `478` | propagates the cache version via `assetUrl` for both `path` and `animation.frameSource` |
| `src/renderer/world-canvas.ts` | `241-251`, `284-286`, `297`, `618` | folds `manifestCacheVersion` into `staticLayerCache` key + `shipBodyCache` manifest-version key |
| `scripts/pharosville/validate-assets.mjs` | `383-385` | required-field validation for v2 schema |

**Effects of bumping:** (1) Browser HTTP cache miss on every asset URL (the `?v=` query string changes). (2) In-memory `staticLayerCache` (terrain + scene off-screen canvases) keyed on `cv${cacheVersion}` (`world-canvas.ts:249-251`) invalidates on the next frame after the new manifest loads. (3) `shipBodyCache` invalidates via `shipBodyCacheManifestVersion` (`world-canvas.ts:618`). No client refresh, no module reload — new value takes effect on the next route mount.

Test-fixture literals in `src/systems/asset-manifest.test.ts:60-61` and `src/renderer/asset-manager.test.ts:429,438` are unrelated stubs (`cache-v2`, `test-cache`); do not touch.

**Bump exactly once, in the final PR.** Slug proposed in followup §5: `2026-06-W6-identity-pass`. Pair with the consolidated provenance ledger (W6.14).

### 1.5 WebP rendering today

**WebP is not used at runtime.** Hard finding: no `webpPath` field anywhere in the manifest or renderer; no `<picture>` element; `loadImage` in `src/renderer/asset-manager.ts:542-584` does `new Image(); image.src = src;` unconditionally. The validator's orphan check at `validate-assets.mjs:106-108` lists `*.png` only — WebP files on disk are neither validated nor flagged. Grep for `webp` finds it only in (1) `validate-assets.mjs:24` regex for `/logos/...` external references and (2) `check-committed-secrets.mjs:31` binary skip list. Nothing in `src/` or `shared/`.

**Locked migration shape (decision D2 in §6; single coordinated edit, W6.13):** (1) Add optional `webpPath?: string` to `PharosVilleAssetManifestEntry`. (2) Add `webpFrameSource?: string` to `PharosVilleAssetAnimation` for sprite-sheet twins. (3) Add `assetWebpUrl(asset, manifest)` returning `undefined` when absent. (4) Extend `loadImage` (or add `loadImageWithFallback`) to prefer WebP, fall back to PNG on `image.onerror`. `<img>.decode()` supports WebP across the Chromium-linux Playwright matrix. (5) Extend `validate-assets.mjs`: read WebP file, check 12-byte signature `RIFF????WEBP`, add to `referenced` set so orphan check sees it; add per-category WebP byte budget (≈ 60-70% of PNG; concrete numbers from USDT canary in §4.1); cap counts entries, not files. (6) Fallback is a **manifest-field** convention (canvas-paint renderer can't use DOM `<picture>`; fallback happens at decode time).

Once the renderer fallback infra is in (PR 1), each subsequent W6 task adds two files + one manifest field.

### 1.6 SCENERY_PROPS system

Authoritative tables in `src/renderer/layers/scenery.ts`:

- `SceneryPropKind` union at `scenery.ts:9-41` (32 kinds today).
- `SCENERY_PROPS` literal placement array at `scenery.ts:78-134` (~60 records of `{ id, kind, tile, scale }`).
- `SCENERY_MOTION_CLASS_BY_KIND` at `scenery.ts:140-173` is a `Record<SceneryPropKind, SceneryMotionClass>` with `satisfies` clause (`static` or `dynamic` — buckets props between cached static layer and per-frame pass).
- `CIVIC_VEGETATION_KINDS` at lines 57-66; tall-vegetation depth bias at lines 68-74.
- `drawSceneryProp` dispatch at `scenery.ts:361-448` — `if/else if` chain on `prop.kind`. Each branch either draws procedurally (`drawBuoy`, `drawCypress`, …) or pulls a sprite via `input.assets?.get("prop.<id>")` + `drawAsset(ctx, sprite, p.x, p.y, scale)`.

#### Steps to add new scenery prop kinds (W6.12 — `dock-awning` / `dock-figures` / `lantern-string`):

1. **Type union** at `scenery.ts:9-41` — add three string literals (alphabetical).
2. **Motion class** at `scenery.ts:140-173` — add three rows: `"dock-awning": "static"`, `"dock-figures": "static"`, `"lantern-string": "dynamic"` (festoon pulses via `nightFactor`). Omission breaks the `satisfies Record<SceneryPropKind, SceneryMotionClass>` compile check.
3. **Dispatch branch** in `drawSceneryProp` at `scenery.ts:361-448`. Mirror the `prop.olive-tree` sprite pattern at lines 408-410:
   ```ts
   } else if (prop.kind === "dock-awning") {
     const sprite = input.assets?.get("prop.dock-awning");
     if (sprite) drawTintedAsset(ctx, sprite, p.x, p.y, scale, harborTintForProp(prop));
   } else if (prop.kind === "dock-figures") {
     const sprite = input.assets?.get("prop.dock-figures");
     if (sprite) drawAsset(ctx, sprite, p.x, p.y, scale);
   } else if (prop.kind === "lantern-string") {
     const sprite = input.assets?.get("prop.lantern-string");
     const { nightFactor } = skyState(input.motion);
     if (sprite && nightFactor > 0) {
       multiplyGlobalAlpha(ctx, nightFactor);
       drawAsset(ctx, sprite, p.x, p.y, scale);
     }
   }
   ```
   `drawTintedAsset` does not exist today — new utility in `src/renderer/canvas-primitives.ts` (composite sprite, then `globalCompositeOperation = "source-atop"` + fill harbor accent at low alpha). Alternative: preprocess per-chain via sail-tint-style recolor (see `recolorSailImageData` in `src/renderer/ship-sail-tint.ts`). Decision D1 (§6) confirms one shared `dock-awning` sprite tinted at draw time — not per-chain variants.
4. **Manifest entries** — three deferred prop entries (skeleton in §3 W6.12 below).
5. **Placements** in `SCENERY_PROPS` (lines 78-134) — ~2 awnings + 1 figure pair + 1 lantern string per major harbor (Ethereum / Tron / BSC / Base / Arbitrum / Polygon). Skip cemetery cove and pigeonnier islet per followup §5.
6. **Asset preload** — automatic via `loadDeferred()` (`asset-manager.ts:220-227`) once entries are in the manifest.
7. **Tests** — `src/renderer/layers/scenery.test.ts:54-78` asserts `SCENERY_MOTION_CLASS_BY_KIND` covers every prop in `SCENERY_PROPS`. New kinds need test rows.
8. **Cue-priority arbiter** (W4.27, shipped) treats scenery as the lowest cue tier; no code change in `src/systems/cue-priority.ts`.

---

## 2. PixelLab campaign — prompt sheet

Style anchor `2026-04-29-lighthouse-hill-v5` for every entry. WebP twin
implied for every asset; the `webpPath` field lands once W6.13 ships
the renderer fallback. Prompts below merge the parent plan §6/§Wave 2
/ §Wave 4 tables with the follow-up plan §5 table.

| # | Sprite | Target dims | Path (PNG) | Path (WebP twin) | Prompt | Post-process | Sail-tint polygon refresh? |
|---|---|---|---|---|---|---|---|
| W6.01 | `ship.usdt-titan` regen | 192 × 128 | `ships/usdt-titan.png` + `ships/usdt-titan-frames.png` | `ships/usdt-titan.webp` + `ships/usdt-titan-frames.webp` | "isometric 16-bit pixel-art stablecoin galleon, Tether-teal `#009393` sail-cloth, **bold off-cream kraken silhouette painted into largest mainsail at ~1/4 sail scale** (no text, no numerals, no Tether wordmark), oxidized-bronze masthead lantern, cream bowsprit pennant, weathered limestone hull, dark contact shadow, transparent background, low top-down view, single dark outline; style anchor `2026-04-29-lighthouse-hill-v5`" | retain 4-frame static-animation sheet (or revert to static if the painted kraken slips between frames — parent plan §8 explicitly allows static); imagemagick crop to 192×128 anchor; verify `SHIP_SAIL_TINT_MASKS["ship.usdt-titan"]` (`ship-sail-tint.ts:74-83`) still tints the new kraken sails (USDT teal `#136649` livery) | YES — re-derive polygons from new PNG via `outputs/task75/derive_masks.py` |
| W6.02a | `ship.pyusd-titan` regen | 128 × 96 | `ships/pyusd-titan.png` + `ships/pyusd-titan-frames.png` | matching `.webp` twins | "isometric pixel-art stablecoin galleon, PayPal navy `#1f5f95` sail-cloth, **off-cream porthole-compass rose silhouette painted into mainsail at ~1/4 sail** (no PYUSD wordmark, no numerals), oxidized-bronze masthead lantern, cream bowsprit pennant, weathered limestone hull; style anchor `2026-04-29-lighthouse-hill-v5`" | 4-frame sprite sheet, anchor 64,85 | YES |
| W6.02b | `ship.usd1-titan` regen | 128 × 96 | `ships/usd1-titan.png` + `ships/usd1-titan-frames.png` | matching `.webp` | "isometric pixel-art stablecoin galleon, USD1 gold `#d4a838` sail-cloth, **off-cream liberty-torch silhouette painted into mainsail at ~1/4 sail** (no USD1 wordmark, no flame text), oxidized-bronze masthead lantern; style anchor `2026-04-29-lighthouse-hill-v5`" | 4-frame sprite sheet | YES |
| W6.02c | `ship.buidl-titan` regen | 128 × 96 | `ships/buidl-titan.png` + `ships/buidl-titan-frames.png` | matching `.webp` | "isometric pixel-art stablecoin galleon, BlackRock near-black `#1a1a1a` sail-cloth, **brass-rimmed institutional anchor silhouette painted into mainsail at ~1/4 sail** (no BUIDL wordmark), oxidized-bronze masthead lantern, brass deck plate detail; style anchor `2026-04-29-lighthouse-hill-v5`" | 4-frame sprite sheet | YES |
| W6.02d | `ship.usde-titan` regen | 128 × 96 | `ships/usde-titan.png` + `ships/usde-titan-frames.png` | matching `.webp` | "isometric pixel-art stablecoin galleon, Ethena charcoal-violet `#393b3c` sail-cloth, **off-cream Greek-delta (Δ) silhouette painted into mainsail at ~1/4 sail** (no USDe wordmark, no letters elsewhere), oxidized-bronze masthead lantern; style anchor `2026-04-29-lighthouse-hill-v5`" | 4-frame sprite sheet | YES |
| W6.02e | `ship.susde-titan` regen | 128 × 96 | `ships/susde-titan.png` + `ships/susde-titan-frames.png` | matching `.webp` | "isometric pixel-art stablecoin galleon, Ethena staked grey-violet `#686963` sail-cloth, **off-cream Greek-delta inside an oxidized-bronze vault ring painted into mainsail at ~1/4 sail** (no sUSDe wordmark, no letters elsewhere), oxidized-bronze masthead lantern; style anchor `2026-04-29-lighthouse-hill-v5`" | 4-frame sprite sheet | YES |
| W6.03 | `ship.xaut-unique` regen | 136 × 100 | `ships/xaut-unique.png` | `ships/xaut-unique.webp` | "isometric pixel-art heritage bullion-barge silhouette, **gilded bronze `#b48a3a` hull** with **gold `#d8b04a` banded waterline trim**, cream sail-cloth, **single gold bullion-ingot silhouette painted into mainsail at ~1/4 sail** (no XAUT wordmark, no oz markings), oxidized-bronze masthead lantern, cream bowsprit pennant; style anchor `2026-04-29-lighthouse-hill-v5`" | static single-frame (heritage tier — no animation block); anchor 68,92 | YES (existing entry at `ship-sail-tint.ts:135-140` is a single rectangle; refresh after regen) |
| W6.06a | `ship.frax-unique` net-new | 136 × 100 | `ships/frax-unique.png` | `ships/frax-unique.webp` | "isometric pixel-art heritage hull silhouette, **graphite `#2f3437` sail-cloth**, **off-cream fractal/binary octagon silhouette painted into mainsail at ~1/4 sail** (no FRAX wordmark, no numerals), oxidized-bronze masthead lantern, cream bowsprit pennant; style anchor `2026-04-29-lighthouse-hill-v5`" | static single-frame; anchor 68,92 | YES (new entry — derive polygons from generated PNG) |
| W6.06b | `ship.gho-unique` net-new | 136 × 100 | `ships/gho-unique.png` | `ships/gho-unique.webp` | "isometric pixel-art heritage hull silhouette, **Aave purple-violet `#7e2ecf` sail-cloth**, **off-cream ghost silhouette painted into mainsail at ~1/4 sail** (no GHO wordmark), oxidized-bronze masthead lantern, cream bowsprit pennant; style anchor `2026-04-29-lighthouse-hill-v5`" | static single-frame; anchor 68,92 | YES (new entry — derive polygons from generated PNG) |
| W6.07 | `overlay.center-cluster` regen | 384 × 224 | `overlays/center-cluster.png` | `overlays/center-cluster.webp` | "isometric pixel-art overlay of a Pharos civic district: **central open colonnaded agora pavilion (4 limestone columns, low terracotta hip roof, no walls, ~80×80 px)** flanked by **7 staggered residential terracotta-roof clusters**, weathered limestone walls, restrained scrub greenery; **cap silhouette ≤ 110 px so lighthouse remains the dominant vertical**; transparent background, dark contact shadow, low top-down view; style anchor `2026-04-29-lighthouse-hill-v5`" | imagemagick crop to 384×224 anchor 192,168 — same footprint/hitbox as current | NO |
| W6.08 | `dock.hyperliquid-trading-floor` net-new | 192 × 136 | `docks/hyperliquid-trading-floor.png` | `docks/hyperliquid-trading-floor.webp` | "isometric pixel-art harbor dock: **obsidian-glass trading-pit silhouette** with **three teal `#15858c` terminal column lamps** and **horizontal orange `#d49a3e` ticker-tape band** running along the deck, dark timber waterline, weathered posts, rope/crate clutter, dark contact shadow, transparent background; style anchor `2026-04-29-lighthouse-hill-v5`" | imagemagick crop to 192×136 anchor 96,106 — match Solana original geometry footprint 98×40 | NO |
| W6.09 | `dock.solana-prism-stilt` regen at new dims | 280 × 180 | `docks/solana-prism-stilt.png` | `docks/solana-prism-stilt.webp` | "isometric pixel-art compact stilt-pier with **deck-mounted neon-cyan `#3cd6c7` light strip** and **three crystalline prism beacons rising from the deck**, weathered timber posts, rope/crate clutter, dark contact shadow; style anchor `2026-04-29-lighthouse-hill-v5`" | imagemagick crop to 280×180; **anchor scales from 96,106 → 140,150** (proportional from 192×136 → 280×180); footprint 98×40 → 143×53; verify with `DOCK_OUTWARD_VECTOR_OVERRIDES` (§3 W6.09 below) and `seawall clip` | NO |
| W6.10a | `dock.avalanche-alpine-watch` regen | 192 × 136 | `docks/avalanche-alpine-watch.png` | `docks/avalanche-alpine-watch.webp` | "isometric pixel-art dock with **snow-capped limestone watchtower mast flying a red lookout pennant**, dark timber pier, contact shadow; style anchor `2026-04-29-lighthouse-hill-v5`" | retain footprint 98×40 anchor 96,106 (or whatever the current entry holds — `manifest.json:965` matches Solana geometry) | NO |
| W6.10b | `dock.base-modular-slip` regen | 228 × 165 | `docks/base-modular-slip.png` | `docks/base-modular-slip.webp` | "isometric pixel-art industrial wharf with **steel-blue `#0052ff` accent strip** and **three royal-blue freight containers stacked on deck**, central watchtower, freight-crane silhouette; style anchor `2026-04-29-lighthouse-hill-v5`" | retain anchor 114,129 footprint 117,45 | NO |
| W6.10c | `dock.polygon-hexmarket` regen | 192 × 136 | `docks/polygon-hexmarket.png` | `docks/polygon-hexmarket.webp` | "isometric pixel-art quay with **hex-tile tarp panels in violet `#8247e5` and magenta `#bd35cc`** stretched over the dock deck, an **abacus-style rack of beads visible on the planks**, weathered posts; style anchor `2026-04-29-lighthouse-hill-v5`" | retain anchor 96,106 footprint 98,40 | NO |
| W6.10d | `dock.arbitrum-arch-bridge` regen | 192 × 136 | `docks/arbitrum-arch-bridge.png` | `docks/arbitrum-arch-bridge.webp` | "isometric pixel-art arch-bridge cove with **raised limestone keystone** and **suspended scroll/ledger banner draped under the arch** (no text on the banner), weathered timber pier; style anchor `2026-04-29-lighthouse-hill-v5`" | retain anchor 96,106 footprint 98,40 | NO |
| W6.11 | `prop.sundial` bump | 96 × 96 | `props/sundial.png` | `props/sundial.webp` | "isometric pixel-art observatory sundial monument, **limestone plinth** with **oxidized-bronze gnomon**, **3-pixel wedge umbra/penumbra step shadow on the dial face**, transparent background, dark contact shadow; style anchor `2026-04-29-lighthouse-hill-v5`" | imagemagick crop to 96×96; **anchor 32,56 → 48,84** (proportional from 64×64); footprint 20,12 → 30,18 (proportional); update hitbox [16,14,32,42] → [24,21,48,63] (proportional) | NO |
| W6.12a | `prop.dock-awning` net-new | 64 × 48 [PROPOSE — not in parent plan] | `props/dock-awning.png` | `props/dock-awning.webp` | "isometric pixel-art **canvas tarp awning supported on two timber posts**, neutral cream `#f0ead2` tarp, dark timber posts with mooring rope wrapped around base, dark contact shadow, transparent background — designed to be tinted per harbor at render time; style anchor `2026-04-29-lighthouse-hill-v5`" | crop to 64×48 anchor 32,42 footprint ~18,8; tint per chain via runtime recolor | NO |
| W6.12b | `prop.dock-figures` net-new | 48 × 64 [PROPOSE] | `props/dock-figures.png` | `props/dock-figures.webp` | "isometric pixel-art **silhouette pair of two stevedore figures handling a crate**, dark indigo silhouettes (no facial detail), dark contact shadow, transparent background; style anchor `2026-04-29-lighthouse-hill-v5`" | crop to 48×64 anchor 24,60 footprint ~14,10; non-selectable (hit detection disabled) | NO |
| W6.12c | `prop.lantern-string` net-new | 96 × 32 [PROPOSE] | `props/lantern-string.png` | `props/lantern-string.webp` | "isometric pixel-art **horizontal festoon-lantern garland of 8 warm-yellow lanterns** strung between two timber posts, dark contact shadow under the posts, transparent background — designed to fade in proportional to `nightFactor`; style anchor `2026-04-29-lighthouse-hill-v5`" | crop to 96×32 anchor 48,28 footprint 30,4; static night-only sprite | NO |

#### Notes on the W6.12 ambient prop dimensions

The parent plan does not provide explicit dimensions or prompts for
W6.12 ambient props (`dock-awning`, `dock-figures`, `lantern-string`).
Proposed dimensions and anchors above are extrapolations from
comparable props (`prop.harbor-bell` 64×80 anchor 32,72 footprint 18,12;
`prop.cargo-stack` 80×96 anchor 40,88 footprint 44,20). Decision D1
(§6) locks one shared sprite per kind; the awning is tinted per chain
at draw time.

GHO color is locked at Aave purple `#7e2ecf` (decision D4 §6). The
matching update to `STABLECOIN_SAIL_COLORS["gho-aave"]` at
`src/systems/stablecoin-ship-branding.ts:28` lands in the same PR as
the W6.06 heritage hull so the runtime sail-tint matches the painted
emblem.

---

## 3. Concrete file-change list per task

Every code change is anchored to a current file path and line range,
with the existing surrounding code shown for context.

### W6.01 — Regenerate `ship.usdt-titan`

- **Files changed:** `ships/usdt-titan.png` replaced; `ships/usdt-titan-frames.png` replaced (or removed if static); two `.webp` twins (W6.13 pair); manifest entry `manifest.json:1907-1956` updates `promptProvenance.jobId`; dimensions 192×128 verified against PNG IHDR.
- **Sail-tint polygon refresh:** `SHIP_SAIL_TINT_MASKS["ship.usdt-titan"]` at `src/renderer/ship-sail-tint.ts:74-83` (current bounds `{ x:26, y:4, width:138, height:112 }`, six polygons). Re-derive after regen via `outputs/task75/derive_masks.py` (referenced in `ship-sail-tint.ts:86`). Coverage gate enforced by `src/renderer/ship-sail-tint.test.ts`.
- **Sail emblem override:** `SHIP_SAIL_EMBLEM_OVERRIDES["usdt-tether"]` at `src/renderer/ship-visual-config.ts:60-62` points at `/sail-emblems/usdt-kraken.png` — **remove** once the kraken is painted into the sprite. USDT is **not** currently in `SHIP_SAIL_EMBLEM_PAINTED` (`ship-visual-config.ts:64-74`) — add it (the file already spreads `...Object.keys(SHIP_SAIL_EMBLEM_OVERRIDES)` so removing the override and adding the explicit set member is the right shape).
- **Test impact:** `src/renderer/layers/ships.test.ts:165` asserts `SHIP_SAIL_TINT_MASKS[titanId]` exists for every titan.

### W6.02 — Paint emblems on PYUSD / USD1 / BUIDL / USDe / sUSDe

- **Files:** 5 titan PNGs + 5 frame sheets + 10 WebP twins; manifest entries `manifest.json:1263-1416` (PYUSD/USD1/BUIDL) + `1161-1262` (USDe/sUSDe). Update `promptProvenance.jobId` per asset.
- **Sail-tint (decision D7 §6 — defer to USDT canary):** All five are absent from `SHIP_SAIL_TINT_MASKS` (mirroring `ship.usdc-titan`'s explicit omission per comment at `ship-sail-tint.ts:57-61`). The W6.01 USDT canary drives whether to leave omitted (bake emblem, no runtime tint) or to add polygons after regen. The PR 2 description records the canary outcome; PR 3 inherits the decision for the remaining five titans.
- **Emblem set:** all five already in `SHIP_SAIL_EMBLEM_PAINTED` (`ship-visual-config.ts:64-74`). No change.
- **Test impact:** if omission retained, mirror the USDC `UNTUNED_TITAN_IDS` pattern in `src/renderer/ship-sail-tint.test.ts:53-58`.

### W6.03 — Regenerate `ship.xaut-unique`

- **Files:** `ships/xaut-unique.png` replaced; manifest entry `manifest.json:1754-1791`; WebP twin.
- **Sail-tint:** `SHIP_SAIL_TINT_MASKS["ship.xaut-unique"]` at `ship-sail-tint.ts:135-140` is a single small rectangle today. Re-derive after regen.
- **Heritage definition:** `UNIQUE_SHIP_DEFINITIONS["xaut-tether"]` at `src/systems/unique-ships.ts:33` keeps `spriteAssetId: "ship.xaut-unique"`, scale 1.28, rationale unchanged.

### W6.04 — SHIP_HERITAGE_NAMEPLATES table

- **Confirmed: no such table exists** (grep across `src/` and `shared/` finds zero references).
- **Where:** Add to `src/renderer/ship-visual-config.ts` alongside `SHIP_PENNANT_MARKS` / `SHIP_TRIM_MARKS`. Skeleton (parent plan W2.04 lists 6 entries; W6.06 adds FRAX/GHO in same PR):

  ```ts
  export const SHIP_HERITAGE_NAMEPLATES: Record<string, string> = {
    "ship.crvusd-unique": "CURVE",
    "ship.bold-unique":   "LIQUITY",
    "ship.fxusd-unique":  "F(X)",
    "ship.paxg-unique":   "PAXOS",
    "ship.xaut-unique":   "TETHER GOLD",
    "ship.usyc-unique":   "HASHNOTE",
    "ship.frax-unique":   "FRAX",   // W6.06
    "ship.gho-unique":    "GHO",    // W6.06
  };
  ```

- **Render integration:** new `drawHeritageNameplate` helper in `src/renderer/layers/ships/sail.ts` (heritage chrome lives on the sail-side of the post-W5.02 split), gated on `camera.zoom >= 0.7` (locked, decision D8 §6 — tighter than the dock-plaque gate at 0.55 because nameplates are inspect-a-hull-level detail). Re-export `SHIP_HERITAGE_NAMEPLATES` from `ships/index.ts`.
- **Tests:** add coverage row in `src/renderer/layers/ships.test.ts` asserting every id in `UNIQUE_SPRITE_IDS` (`unique-ships.ts:38-40`) has a nameplate.

### W6.05 — Per-ship mast-lantern color

- **Code site:** `getShipLanternSprite(radius)` at `src/renderer/layers/ships.ts:238-264`. Cache `shipLanternSpriteCache` (line 232) is `Map<number, …>` with no LRU. Color hard-coded `rgba(255, 200, 80, 1)` at line 253. Change cache key to `${quantizedRadius}|${quantizedHexColor}` and accept a `tint` (`livery.primary` lightened ~70%) argument.
- **Color helper:** add `lightenHexForLantern(primary: string, amount = 0.7): string` to `src/renderer/canvas-primitives.ts` (which already exports `hexToRgba` per `ships.ts:12`).
- **Call site:** `ships.ts:1519` — `getShipLanternSprite(lanternRadius)` becomes `getShipLanternSprite(lanternRadius, lanternTintForShip(ship))` with the helper reading `ship.visual.livery.primary`.
- **Cache sizing:** add `SHIP_LANTERN_SPRITE_CACHE_MAX = 64` (mirroring `SHIP_SAIL_TINT_CACHE_MAX = 48` at `ships.ts:57`). Expose hits/misses/evicts via `__pharosVilleDebug` (`src/hooks/use-world-render-loop.ts:760-805`) — the same slot W5.06 adds for sail caches. Exit gate: ≥ 99% hit rate steady-state (followup §5).
- **Tests:** add to `src/renderer/layers/ships.test.ts` — two ships with different `livery.primary` yield distinct cache keys; reduced-motion resolves deterministically.

### W6.06 — FRAX + GHO heritage hulls

- **New rows in `UNIQUE_SHIP_DEFINITIONS`** at `src/systems/unique-ships.ts:29-36`. Keys MUST match `STABLECOIN_SAIL_COLORS` keys in `src/systems/stablecoin-ship-branding.ts:14-49`. **Locked (decision D3 §6): FRAX heritage keys on `frxusd-frax`** (the current Frax USD product). `frax-frax` and `sfrxusd-frax` rows remain as livery fallbacks but are not heritage-tiered. GHO heritage keys on `gho-aave` (line 28).

  ```ts
  "frxusd-frax": { spriteAssetId: "ship.frax-unique", rationale: "Fractal hull — Frax's algorithmic/binary octagon identity.", scale: 1.23 },
  "gho-aave":    { spriteAssetId: "ship.gho-unique",  rationale: "Ghost-veiled hull — Aave's overcollateralized GHO mint.",  scale: 1.23 },
  ```

- **Test impact:** `src/systems/unique-ships.test.ts:37` asserts `UNIQUE_SPRITE_IDS.size === 6` → bump to `=== 8`.
- **New manifest entries** (geometry copied from `ship.crvusd-unique` at `manifest.json:1716-1753`: 136×100, anchor [68,92], footprint [46,22], hitbox [30,4,92,90], `loadPriority: "deferred"`, paletteKeys + `promptKey: "ship.frax-unique"` / `"ship.gho-unique"`, semanticRole "FRAX/GHO heritage hull (unique tier)", `tool: "mcp:create_map_object+imagemagick"`, new `promptProvenance.jobId`).
- **Sail-tint:** two new entries in `SHIP_SAIL_TINT_MASKS` (`ship-sail-tint.ts:23-159`) derived from the generated PNGs.
- **Trim marks (optional):** rows in `SHIP_TRIM_MARKS` (`ship-visual-config.ts:182-324`) mirroring `ship.crvusd-unique` at lines 294-299.
- **Nameplates:** two new rows in `SHIP_HERITAGE_NAMEPLATES` (lands with W6.04).
- **STABLECOIN_SAIL_COLORS fix (decision D4 §6):** update `gho-aave` at `src/systems/stablecoin-ship-branding.ts:28` from green `#3cae68` to Aave purple `#7e2ecf` in the same PR. Without this the runtime sail-tint pulse fights the painted ghost silhouette.
- **Doc:** update `docs/pharosville/CURRENT.md` (currently mentions heritage hulls at lines 181, 204-205, 225).
- **Motion / wake:** no code change — heritage hulls inherit motion shape via `UNIQUE_SPRITE_IDS` derived at module load (`unique-ships.ts:38-40`).

### W6.07 — Regenerate `overlay.center-cluster` (agora)

- **Files:** `overlays/center-cluster.png` replaced; manifest entry at `manifest.json:444-479`. Dimensions 384×224, anchor [192,168], footprint [240,144], hitbox [40,25,304,155] all stay the same. WebP twin via `webpPath`.
- **Test impact:** `pharosville-dense-civic-core` fixture (`tests/visual/pharosville.spec.ts:565`) drifts; rebake at wave close. Verify civic vegetation reshuffle (W4.11, shipped commit `3f1bbc9`) still composes correctly.

### W6.08 — Generate `dock.hyperliquid-trading-floor`

- **Files:** new `docks/hyperliquid-trading-floor.png` + `.webp`; new manifest entry slotted in the docks block (current docks end at line 1002). Skeleton mirrors `dock.solana-prism-stilt` geometry (192×136, anchor [96,106], footprint [98,40], hitbox [10,16,172,110]). **`loadPriority: "deferred"` (locked, decision D5 §6)** — no first-render budget bump; south-shore briefly empty before pop-in is acceptable.
- **Chain-dock registration:** Hyperliquid is mapped to `HYPERLIQUID_HARBOR_DOCK_TILE = { x: 36, y: 39 }` (`src/systems/world-layout.ts:82, 90, 106`) but **`PREFERRED_DOCK_ASSET_IDS` in `src/systems/chain-docks.ts:29-40` does NOT list Hyperliquid yet.** Add `hyperliquid: "dock.hyperliquid-trading-floor"` row and add the asset id to `_DOCK_ASSET_IDS` at lines 16-27.
- **`DOCK_FLAG_EXPLICIT_MARKS`** already has `hyperliquid: "HYPE"` at `src/renderer/layers/docks.ts:592`. No change.
- **Manifest cap:** +1 entry. See §1.3.

### W6.09 — Regenerate `dock.solana-prism-stilt` at 280×180

- **Files:** `docks/solana-prism-stilt.png` replaced at 280×180; new `.webp` twin; manifest entry `manifest.json:780-815` updates `width: 192→280`, `height: 136→180`, `anchor: [96,106]→[140,150]`, `footprint: [98,40]→[143,53]`, `hitbox: [10,16,172,110]→[15,21,250,145]` (all proportional; verified by `validate-assets.mjs:194-198` against new PNG IHDR).
- **`DOCK_OUTWARD_VECTOR_OVERRIDES`** at `src/systems/dock-layout.ts:6-10`:

  ```ts
  const DOCK_OUTWARD_VECTOR_OVERRIDES: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
    "25.23": { x: 0, y: -1 },   // NW-shoulder Solana faces north
  };
  ```

  Tile (25, 23) is `SOLANA_HARBOR_DOCK_TILE` (`world-layout.ts:84`). Override forces north-facing gangway. The new 280×180 sprite has a wider footprint (143×53 tiles) — verify the south-edge gangway tile still clears the seawall via `src/renderer/geometry.test.ts` (currently tests Hyperliquid outward at line 31).
- **Visual fixture drift:** NW-shoulder dense fixture rebakes at wave close.

### W6.10 — Regenerate AVAX / Base / Polygon / Arbitrum dock sprites

- **Files:** four PNGs replaced in place, four WebP twins. Manifest entries: `manifest.json:965-1001` (avalanche), `:817-852` (base), `:891-926` (polygon), `:854-889` (arbitrum). Update only `promptProvenance.jobId` + add `webpPath`. Parent §Wave 4 W4.18 explicitly says "same anchor/footprint" — do NOT change geometry.
- **`DOCK_FLAG_EXPLICIT_MARKS`** at `src/renderer/layers/docks.ts:585-596` already has AVAX/ARB/POL — no change.

### W6.11 — Sundial bump to 96×96

- **Files:** `props/sundial.png` replaced at 96×96; new `.webp`; manifest entry `manifest.json:2228-2261` updates `width: 64→96`, `height: 64→96`, `anchor: [32,56]→[48,84]`, `footprint: [20,12]→[30,18]`, `hitbox: [16,14,32,42]→[24,21,48,63]` (all proportional).
- **Render scale (locked, decision D6 §6):** keep `civic-sundial` placement at `scenery.ts:114` at `scale: 0.9`. Rendered sundial grows ~1.5× on screen — matches the parent plan's "bigger sundial" intent. No code change at the placement site; only the manifest geometry and PNG file change.

### W6.12 — Dock-side ambient prop pack

- **Files:** three new PNGs (`props/dock-awning.png`, `dock-figures.png`, `lantern-string.png` — proposed dims in §2 above), three WebP twins, three new manifest entries (`loadPriority: "deferred"`, `category: "prop"`, `layer: "props"`, anchor/footprint/hitbox proportional to dims, `tool: "mcp:create_map_object"`, new `promptProvenance.jobId`).
- **`SceneryPropKind`** extension + dispatch — full steps in §1.6 above.
- **`SCENERY_MOTION_CLASS_BY_KIND`** at `scenery.ts:140-173` — three new rows (`dock-awning: "static"`, `dock-figures: "static"`, `lantern-string: "dynamic"`).
- **`SCENERY_PROPS`** at `scenery.ts:78-134` — append ~2 awnings + 1 figure pair + 1 lantern string per major harbor (Ethereum/Tron/BSC/Base/Arbitrum/Polygon). Skip cemetery cove + pigeonnier islet per followup §5. Example placements (mirror per harbor using existing tile refs at lines 90-105):
  ```ts
  { id: "ethereum-awning-w",   kind: "dock-awning",     tile: { x: 42.8, y: 31.2 }, scale: 0.62 },
  { id: "ethereum-awning-e",   kind: "dock-awning",     tile: { x: 44.2, y: 32.7 }, scale: 0.62 },
  { id: "ethereum-figures-1",  kind: "dock-figures",    tile: { x: 43.6, y: 32.0 }, scale: 0.55 },
  { id: "ethereum-lanterns-1", kind: "lantern-string",  tile: { x: 43.4, y: 31.8 }, scale: 0.7 },
  ```
- **Cue priority:** W4.27 (shipped) treats scenery as lowest tier; no code change in `src/systems/cue-priority.ts`.

### W6.13 — Full WebP migration

- **Files:** every PNG not paired in 6A/6B gets a sibling `.webp` (~41 entries: 69 total − 28 paired in 6A/6B). Add `"webpPath": "<dir>/<file>.webp"` field to each manifest entry.
- **Code changes:** see §1.5 above. Summary: extend type, add `assetWebpUrl`, add `loadImageWithFallback`, extend validator (signature check, orphan-set, byte budget).
- **Test impact:** every visual fixture rebakes at wave close.

### W6.14 — Provenance ledger + `cacheVersion` bump

- **Files:** `manifest.json:4` — bump `"cacheVersion": "2026-05-03-ton-pigeonnier-pier-v3"` → `"2026-06-W6-identity-pass"`. Every regenerated entry's `promptProvenance.jobId` updated. Consolidated provenance ledger lands either at `agents/2026-05-W6/provenance.md` (recommended) or inlined per-entry (existing convention).
- **Auto-propagation:** `staticCacheKey` (`world-canvas.ts:249-251`) and `shipBodyCacheManifestVersion` (`world-canvas.ts:618`) pick up the new value via `manifestCacheVersion(manifest)` — no source change needed. Test stubs in `asset-manifest.test.ts:60` (`"cache-v2"`) are unrelated.
- **Test impact:** all 35 visual fixtures rebake (see §4.4).

---

## 4. Risks and pre-flight checks

### 4.1 Sprite-encoding canary (USDT kraken at q=85)

The followup plan §6 handshake #4 explicitly gates Wave 6A on a USDT
canary. Workflow:

1. Bake `ships/usdt-titan.png` via the W6.01 prompt.
2. Encode `ships/usdt-titan.webp` at q=85 (recommended:
   `cwebp -q 85 -m 6 -af -mt usdt-titan.png -o usdt-titan.webp`).
3. Run a side-by-side Playwright screenshot diff at the `pharosville-dense-evm-bay`
   fixture (matches the titan-heavy harbor) with the new renderer
   fallback in place — one bake with `webpPath` set, one with it
   unset (forcing PNG). The pixel-level emblem readability is the
   gate.
4. Sign-off: Visual Director confirms the kraken silhouette reads
   identically at home zoom and at `dense-ship-flotillas` zoom.
5. If the q=85 wash-out kills emblem readability, raise `q=90` (still
   gets ≥ 1 MB savings on full migration) or punt WebP to a follow-up
   wave.

USDT is the lightest titan to canary because it's a single-ship
manifest entry (no consorts share its sprite — unlike USDC which
seeds USDe/sUSDe via `reuse:imperial-A` provenance at
`manifest.json:1207`). Iterating on USDT alone does not block the
USDC/USDe/sUSDe trio.

### 4.2 Manifest cap raise — once and only once

The cap raise is a single-line change in
`scripts/pharosville/validate-assets.mjs:32`. To avoid oscillation:

- **Wave-open PR (first PR of Wave 6):** bump from 69 to 75 with the
  comment block update.
- **Validator counts entries**, not files. WebP twins under a
  `webpPath` field on an existing entry count once. **Confirmed** by
  reading `validate-assets.mjs:82`:

  ```js
  if (manifest.assets?.length > maxManifestAssets)
    errors.push(`Manifest has ${manifest.assets.length} assets; v0.1 core cap is ${maxManifestAssets}.`);
  ```

  `manifest.assets.length` is the entry count, not file count. A
  `webpPath` field does not introduce a new entry.
- The wave-close PR does **not** re-bump or reset the cap; the new
  value persists.

### 4.3 `cacheVersion` bump — once and atomically

The bump must happen exactly once, in the final PR. Every file that
consumes `cacheVersion` is listed in §1.4 above. The single literal
in `manifest.json:4` propagates to:

1. `src/systems/asset-manifest.ts:101-103` accessor.
2. `src/systems/asset-manifest.ts:109-111` `assetUrl` query string.
3. `src/renderer/asset-manager.ts:478` for frame sources.
4. `src/renderer/world-canvas.ts:249-251` static-layer cache key.
5. `src/renderer/world-canvas.ts:618` ship-body cache key.

No other source code touches the literal. The validator at
`validate-assets.mjs:383-385` only asserts the field exists and is a
string for schema v2 — any wave-named slug is accepted. The slug
proposed by the followup plan is `2026-06-W6-identity-pass`.

### 4.4 Visual baseline rebake

The Wave 6 rebake covers both fixture sets:

- `tests/visual/pharosville.spec.ts-snapshots/` — 24 PNGs (12 dev + 12
  dist; `desktop-chromium-linux` suffix marks Playwright dist
  matrix).
- `tests/visual/pharosville.spec.ts-snapshots-built-dist/` — 12 PNGs.

Every fixture will drift, because every regenerated sprite touches the
common static layer:

- `pharosville-desktop-shell{,-desktop-chromium-linux}.png`
- `pharosville-dawn{,-desktop-chromium-linux}.png`
- `pharosville-dusk{,-desktop-chromium-linux}.png`
- `pharosville-night{,-desktop-chromium-linux}.png`
- `pharosville-narrow-fallback{,-desktop-chromium-linux}.png` — likely
  no drift (narrow fallback DOM only).
- `pharosville-dense-lighthouse{,-desktop-chromium-linux}.png`
- `pharosville-dense-evm-bay{,-desktop-chromium-linux}.png`
- `pharosville-dense-ship-flotillas{,-desktop-chromium-linux}.png`
- `pharosville-dense-cemetery{,-desktop-chromium-linux}.png` — minimal
  drift (no W6 changes in the cemetery cove).
- `pharosville-dense-civic-core{,-desktop-chromium-linux}.png` — W6.07
  agora + W6.11 sundial both drift here.
- `pharosville-dense-risk-water{,-desktop-chromium-linux}.png`
- `pharosville-dense-ledger-north{,-desktop-chromium-linux}.png`

Recommended single rebake batch is 23 of 24 (skip narrow-fallback if
no drift) + 12 of 12 dist fixtures = 35 PNGs total. Per the followup
plan §5 Wave 6 exit gates, the rebake is **single, consolidated** and
happens after every Wave 6 PR has merged. See `docs/pharosville/VISUAL_REGEN.md`
for the regen procedure (referenced from `AGENTS.md:35`).

### 4.5 Per-ship mast-lantern color — cache cardinality

The current `shipLanternSpriteCache` at
`src/renderer/layers/ships.ts:232` has no LRU cap (it's a plain
`Map<number, …>`). Today the cache has one entry per radius bucket
(`SHIP_LANTERN_RADIUS_BUCKET`, imported from
`src/renderer/visual-scales.ts`) — roughly 3 entries observed in
steady-state.

Projected growth: ~3 → ~30 (one per unique livery color). The
followup plan §5 W6.05 exit gate is "Sail-cache hit rate ≥ 99%
steady-state (W5.06 telemetry confirms W6.05 sizing)". To meet that:

- Wave 5's W5.06 telemetry must already be live; cardinality is
  observable via `__pharosVilleDebug` (`src/hooks/use-world-render-loop.ts:760-805`).
- Recommended LRU cap for `shipLanternSpriteCache`: 64 (matches
  the W5.06 sail-emblem cap pattern at `ships.ts:2023` — value 128 —
  scaled down because lantern sprites are tiny per-color quantized
  ovals rather than full sail-emblem composites).

Existing reference cache caps for comparison:

| Cache | Cap | Location |
|---|---|---|
| `shipSailTintCache` | 48 | `ships.ts:57` |
| `sailLogoSpriteCache` | 128 | `ships.ts:1791` |
| `sailEmblemSpriteCache` | 128 | `ships.ts:2023` |
| `shipLanternSpriteCache` (W6.05) | 64 (proposed) | `ships.ts:232` |

---

## 5. Recommended PR sequence

Six PRs in order. The first PR cap-raises the manifest; the final PR
bumps `cacheVersion` + ledger + rebakes baselines. Every intermediate
PR depends on Wave 5 W5.02 (`ships.ts` split, currently 2,749 LOC at
`src/renderer/layers/ships.ts`) and W5.06 (sail-cache telemetry).

### PR 1 — "Wave 6 wave-open: cap raise + WebP loader plumbing"

- Scope:
  - `scripts/pharosville/validate-assets.mjs:25-32` — bump
    `maxManifestAssets: 69 → 75` with comment block update.
  - `src/systems/asset-manifest.ts:13-53` — add `webpPath?: string` to
    entry interface and `webpFrameSource?: string` to animation
    interface. Add `assetWebpUrl` helper.
  - `src/renderer/asset-manager.ts:542-584` — add
    `loadImageWithFallback`. Wire into `loadAsset` /
    `loadAssetFrameSource`.
  - `scripts/pharosville/validate-assets.mjs` — extend
    `validateAsset` to accept `webpPath` (signature check, orphan
    add).
- Manifest cap raise: **here**.
- cacheVersion bump: no.
- Baseline rebake: no (no rendered drift).
- Wave 5 dependency: nothing — this PR can land in parallel with
  Wave 5 W5.02 if the patch is small enough; if W5.02 splits
  `ships.ts` first, this PR is unaffected.

### PR 2 — "Wave 6A.1: USDT canary + W6.01 / W6.02 titan regens"

- Scope:
  - PixelLab campaign job for USDT + 5 other titans.
  - Six titan PNG replacements + six WebP twins +
    six 4-frame sheets + their WebP twins.
  - `src/renderer/ship-sail-tint.ts` — refresh `ship.usdt-titan`
    polygons (and optionally add the five other titans, per the canary
    decision).
  - `src/renderer/ship-visual-config.ts:60-74` — remove
    `usdt-tether` from `SHIP_SAIL_EMBLEM_OVERRIDES`, add to
    `SHIP_SAIL_EMBLEM_PAINTED`.
  - `public/pharosville/assets/manifest.json` — six entries updated
    (provenance + `webpPath`).
- Manifest cap raise: no.
- cacheVersion bump: no.
- Baseline rebake: no — wait for wave close.
- Wave 5 dependency: W5.02 (split ships.ts) so the sail-tint /
  emblem changes hit small files.

### PR 3 — "Wave 6A.2: xAUT regen + heritage chrome + FRAX/GHO additions"

- Scope:
  - W6.03 `ship.xaut-unique` regen.
  - W6.04 `SHIP_HERITAGE_NAMEPLATES` table + render integration.
  - W6.05 per-ship mast-lantern color (depends on W5.06 sail-cache
    telemetry being live — verify cardinality after deploy).
  - W6.06 FRAX + GHO heritage hulls — code + sprites + manifest
    entries + sail-tint polygons + `UNIQUE_SHIP_DEFINITIONS` updates +
    `unique-ships.test.ts:37` cardinality bump.
- Manifest cap raise: no.
- cacheVersion bump: no.
- Baseline rebake: no.
- Wave 5 dependency: W5.02 + W5.06.

### PR 4 — "Wave 6B.1: harbors — agora + Hyperliquid + Solana scale-up"

- Scope:
  - W6.07 `overlay.center-cluster` regen (in-place).
  - W6.08 `dock.hyperliquid-trading-floor` new sprite + manifest
    entry + `PREFERRED_DOCK_ASSET_IDS` row + `_DOCK_ASSET_IDS` row.
  - W6.09 `dock.solana-prism-stilt` scale-up to 280×180 + manifest
    geometry update + `DOCK_OUTWARD_VECTOR_OVERRIDES` review for
    tile (25, 23).
- Manifest cap raise: no (the cap was raised in PR 1).
- cacheVersion bump: no.
- Baseline rebake: no.
- Wave 5 dependency: none beyond what landed in earlier PRs.

### PR 5 — "Wave 6B.2: AVAX/Base/Polygon/Arbitrum dock regens + sundial + ambient props"

- Scope:
  - W6.10 four dock sprite regens (in-place, geometry unchanged).
  - W6.11 sundial bump 64×64 → 96×96 + manifest geometry update.
  - W6.12 three new prop kinds (`dock-awning`, `dock-figures`,
    `lantern-string`) — `SceneryPropKind`, motion class table,
    dispatch in `drawSceneryProp`, new manifest entries, placements
    in `SCENERY_PROPS`.
- Manifest cap raise: no.
- cacheVersion bump: no.
- Baseline rebake: no.
- Wave 5 dependency: none beyond what landed earlier.

### PR 6 — "Wave 6C: full WebP migration + cacheVersion bump + baseline rebake"

- Scope:
  - W6.13 WebP migration for the remaining 41 entries that didn't get
    a twin in PRs 2–5 (terrain, landmarks not regenerated, props not
    regenerated, ships not regenerated). Each gets a sibling `.webp`
    + `"webpPath": …` manifest field.
  - W6.14 `public/pharosville/assets/manifest.json:4` —
    `"cacheVersion"` bump to `"2026-06-W6-identity-pass"`.
  - W6.14 consolidated provenance ledger:
    `agents/2026-05-W6/provenance.md` or inlined in manifest entries.
  - **Visual baseline rebake** of all 35 PNGs (24 in
    `pharosville.spec.ts-snapshots/` + 12 in
    `pharosville.spec.ts-snapshots-built-dist/`, minus the
    narrow-fallback fixture if unchanged).
- Manifest cap raise: no (already in PR 1).
- cacheVersion bump: **here, exactly once**.
- Baseline rebake: **here, single consolidated batch**.

### Dependency on Wave 5

Every PR after PR 1 expects Wave 5 to be merged:

- **W5.02** (`ships.ts` split) is a hard prereq for PR 2, PR 3,
  and PR 5. Ships.ts at 2,749 LOC today (`grep` confirmed) would make
  the sail-tint / emblem / nameplate edits hard to review;
  splitting first localizes changes.
- **W5.06** (sail-cache telemetry counters) is a hard prereq for
  W6.05 in PR 3 — the cache cardinality target ≥ 99% hit rate is only
  observable after the counters land.
- **W5.01** (detail-panel + a11y-ledger parity for `riskTransition`)
  has no dependency on Wave 6 and can land in parallel.
- **W5.03** (beach-foam ribbon per dock) is a near-prereq for the
  Wave 6 harbor PRs because the dock-pad surf data shape
  (`HARBOR_SURF_BY_DOCK`) is consumed by the dock regens, but it's
  not blocking — W6.07/W6.08/W6.09/W6.10 can land before W5.03 if the
  generalized data shape is documented.

---

## 6. Decisions (resolved 2026-05-18)

All eight open questions from the original draft of this document
were resolved on 2026-05-18 in a single human review pass. The
decisions below are authoritative for Wave 6 kickoff — no further
handshakes owed before PR 1.

**D1. Ambient prop variants (W6.12) — one shared sprite per kind.**
`prop.dock-awning` is one sprite tinted per harbor at draw time via
`drawTintedAsset` (§1.6 step 3); `prop.dock-figures` and
`prop.lantern-string` are universal silhouettes. Manifest cap
projection in §1.3 stands: 69 → 75. PixelLab budget: 3 sprites total
for the prop pack.

**D2. WebP fallback (W6.13) — manifest field + JS fallback.** Add
`webpPath?: string` to `PharosVilleAssetManifestEntry` and
`webpFrameSource?: string` to `PharosVilleAssetAnimation`. `loadImage`
prefers WebP, falls back to PNG on `image.onerror`. No DOM `<picture>`
element (the renderer paints to canvas). Migration shape spec'd in
§1.5.

**D3. FRAX heritage stablecoin id (W6.06) — `frxusd-frax`.** The
current Frax USD product. `UNIQUE_SHIP_DEFINITIONS["frxusd-frax"]`
gets the heritage row + `spriteAssetId: "ship.frax-unique"`. The
`frax-frax` and `sfrxusd-frax` ids stay in `STABLECOIN_SAIL_COLORS`
as livery fallbacks but are not heritage-tiered.

**D4. GHO color (W6.06) — Aave purple `#7e2ecf` + matching
`STABLECOIN_SAIL_COLORS` fix.** The new heritage hull paints a ghost
silhouette on a purple-violet `#7e2ecf` sail. The same PR updates
`STABLECOIN_SAIL_COLORS["gho-aave"]` at
`src/systems/stablecoin-ship-branding.ts:28` from green `#3cae68` to
a purple-derived livery so the runtime sail-tint pulse stays
consistent with the painted emblem.

**D5. Hyperliquid load priority (W6.08) — deferred.** The new dock
sprite ships with `loadPriority: "deferred"`. No bump to
`firstRenderBudgets.maxCount` (stays 33). South-shore briefly empty
before Hyperliquid pop-in is acceptable.

**D6. Sundial scale (W6.11) — keep `scale: 0.9`.** The 96 × 96 PNG
renders ~1.5× larger than today. Matches the parent plan §Wave 4
W4.10 "bigger sundial" intent. No code change at the placement site
(`scenery.ts:114`); only the manifest geometry and PNG file change.

**D7. Sail-tint strategy for the six titan regens (W6.01–W6.02) —
defer to USDT canary.** Bake USDT first under PR 2. If the q=85 WebP
encoding preserves the kraken silhouette and the lit-from-above sail
reads cleanly without runtime tint, the remaining five titans
(PYUSD/USD1/BUIDL/USDe/sUSDe) follow the same omission pattern in
PR 3. Otherwise PR 3 derives `SHIP_SAIL_TINT_MASKS` polygons for all
five and updates `UNTUNED_TITAN_IDS` accordingly. The PR 2
description records the canary outcome.

**D8. Heritage nameplate zoom threshold (W6.04) — `camera.zoom ≥
0.7`.** Tighter than the dock-plaque gate (`≥ 0.55`, W4.15) because
the heritage nameplate is inspect-a-hull-level detail rather than
general harbor signage. `drawHeritageNameplate` lives in
`src/renderer/layers/ships/sail.ts` (heritage chrome is sail-layer
work after the W5.02 split).

---

**End of prep document.** Total Wave 6 deliverables: 14 task IDs,
6 proposed PRs, 1 manifest cap raise (69 → 75), 1 `cacheVersion`
bump (`2026-05-03-ton-pigeonnier-pier-v3` → `2026-06-W6-identity-pass`),
1 consolidated visual baseline rebake (≈ 35 PNGs across two fixture
sets). All 8 prior open questions resolved as decisions D1–D8 in §6
on 2026-05-18 — kickoff-ready.

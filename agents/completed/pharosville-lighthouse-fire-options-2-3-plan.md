# PharosVille Lighthouse Fire — Options 2 & 3 Implementation Plan

Date: 2026-05-01
Status: Research / not yet implemented
Scope: standalone `pharosville` repo only
Sibling effort: Option 1 (recolor + organic-ize the existing procedural fire/embers in
`drawLighthouseFire` / `drawHearthEmbers` / `drawPixelFlame`) is being executed in parallel.
This plan covers Options 2 and 3 only. It assumes Option 1 lands first or alongside, and
neither option here rewrites the polygon flame body or ember spawner.

---

## Goal

Today's lighthouse renders cool-white directional cone beams at night that read as a modern
Fresnel-lens lighthouse. The user wants the Pharos to feel like a fantastical, eerie,
warm fire bowl — closer to the historical Alexandria pyre. Two parallel design directions:

- **Option 2** — keep the procedural beams (recolored by Option 1) and **add a real
  PixelLab-animated brazier flame sprite** drawn at the beacon point. Renderer stays in
  charge; the sprite is just another animated asset.
- **Option 3** — drop directional beams entirely and become a **point-source bonfire** with
  an omnidirectional warm haze, animated heat-shimmer rings, water-pool reflection, and
  ember-glow — point light, not searchlight.

Both options should be feasible in a single session at "minimum viable" level and grow
incrementally.

---

## Key Constants & Reference Geometry

Pinned values needed by both options. All sprite-units unless noted.

- `landmark.lighthouse`: 256×256 PNG at `public/pharosville/assets/landmarks/lighthouse-alexandria.png`
  - `width: 256, height: 256, displayScale: 1`
  - `anchor: [128, 245]` (foot of the headland)
  - `beacon: [128, 47]` (the cupola fire-bowl point — derived `firePoint` flows through
    `lighthouseRenderState` in `src/renderer/layers/lighthouse.ts:8-25`)
  - cupola/dome silhouette inspected from the PNG: roughly 32–40px wide at the bowl rim,
    sloping inward to ~20px at the dome top, with ~30–40px headroom above the rim before
    the sprite ends. Manifest `displayScale: 1`, runtime `LIGHTHOUSE_DRAW_SCALE = 1.224`,
    so 1 sprite-unit ≈ 1.224 × `camera.zoom` screen px.
- `LIGHTHOUSE_TILE = (18, 28)` (`src/systems/world-layout.ts:11`).
- `motion.timeSeconds`, `motion.reducedMotion`, `motion.plan.lighthouseFireFlickerPerSecond`
  already wired (see `src/systems/motion-types.ts:88`, `src/systems/motion-planning.ts:65`).
- Manifest cache key is `style.cacheVersion` (currently `"2026-05-01-unique-ships-v2"` at
  `public/pharosville/assets/manifest.json:4`). Per `docs/pharosville/CHANGE_CHECKLIST.md:31`
  and `docs/pharosville/ASSET_PIPELINE.md:16`, **bump `style.cacheVersion` whenever promoted
  asset bytes, manifest geometry, or animation frame assets change.**
- Animation schema is `PharosVilleAssetAnimation` in `src/systems/asset-manifest.ts:5-18`:
  ```ts
  { frameCount, frameSource, fps?, durationMs?, loop, reducedMotionFrame, spriteSheet?: { columns, rows, frameWidth, frameHeight } }
  ```
- Animated assets are loaded via `PharosVilleAssetManager.loadAsset` (sets `frameSource` =
  separate `HTMLImageElement` for the strip — `src/renderer/asset-manager.ts:148-175,303-316`).
- Animated draw helper is `drawAssetFrame` / `drawAnimatedAsset` in
  `src/renderer/canvas-primitives.ts:22-79`. Frame index advancement convention is
  `Math.floor(timeSeconds * fps + phase)` (see `shipAnimationFrameIndex` at
  `src/renderer/layers/ships.ts:784-791`). Reduced-motion forces `reducedMotionFrame`.
- All ship animation strips are stored as separate `*-frames.png` in horizontal strips
  (e.g. `public/pharosville/assets/ships/usds-titan-frames.png` — 576×104, columns:4,
  rows:1, frameWidth:144, frameHeight:104). The single-frame `path` PNG remains the
  reduced-motion / fallback source.
- Per `docs/pharosville/IMAGE_TOOLING_NOTES.md:48-52`: `n_frames` only on `create_object`
  (square, max 256). `animate_object` operates on an existing `object_id` from
  `create_object` (frame_count 4–16 even). Production sprites have used
  `mcp:create_map_object+imagemagick` for static PNGs; **no animated landmark precedent
  exists in the repo today**.

---

## Option 2 — PixelLab Animated Brazier Sprite

### Concept

Render a small, animated, looping flame sprite at `firePoint` so the warmth/movement comes
from a real pixel-art flame rather than only procedural ellipses. Coexists with the
procedurally-recolored ember motes / soft glow base from Option 1; the procedural code
keeps owning the glow layer because it modulates with `lighthouseFireFlickerPerSecond` and
`world.lighthouse.psiBand` (peg health → flicker speed). The animated sprite is purely
decorative; it does NOT carry analytical signal.

### 1. PixelLab MCP call (literal)

There is no animated-landmark precedent in the manifest. The closest precedent is the
ship animation flow: ships were generated single-frame via `mcp:create_map_object`, then
their animation strips were authored separately. For a **square, animated** asset the
canonical PixelLab path is `create_object(directions:1)` → `animate_object`. The static
PNG generated by `create_object` doubles as the `reducedMotionFrame` source.

#### Step A — generate the still object (returns an `object_id`)

```jsonc
// mcp__pixellab__create_object
{
  "description": "isometric pixel-art brazier flame burning on a stone fire bowl, ancient lighthouse pyre at the top of a tall tower, warm orange-and-gold flame core with deeper crimson base and pale-yellow tongue tip, faint smoke wisp curling upward, three or four small embers floating up from the bowl, single dominant flame mass with two subordinate licks, fantastical and slightly eerie, restrained 16-bit pixel-art palette: deep ember red (#7a2c12), warm orange (#e07a2a), gold (#f5b541), pale highlight (#fff1a8), charcoal smoke (#3a2a22). 16-bit maritime isometric RPG pixel art, crisp pixel edges, low top-down view, transparent background, no text, no logos, no UI, no characters. Style anchor: 2026-04-29-lighthouse-hill-v5.",
  "directions": 1,
  "n_frames": 4,
  "size": 64,
  "view": "low top-down",
  "object_view": "top-down"
}
```

Notes:
- `size: 64` is the smallest power-of-two that fits the flame footprint comfortably (see
  §2 below). PixelLab `create_object` is square-only and capped at 256.
- `n_frames: 4` puts the object in `review` status; inspect via `get_object`, then
  `select_object_frames(object_id, indices:[<best>])` to promote a single canonical frame
  for the static PNG. This becomes the reduced-motion frame and the `path` source.
- No seed support on `create_object` (per `IMAGE_TOOLING_NOTES.md:44-46`). Re-roll if the
  first batch is off-style.

#### Step B — animate the chosen object (returns animated frames)

```jsonc
// mcp__pixellab__animate_object
{
  "object_id": "<UUID from Step A after select_object_frames>",
  "animation_description": "flame flickering and dancing with subtle crackle, warm orange-gold tongues curling and licking gently, embers rising and fading, smoke wisp swaying, no large pose change so the silhouette remains a continuous brazier flame between every frame, frame N must loop seamlessly into frame 0",
  "directions": ["unknown"],
  "frame_count": 8,
  "animation_name": "lighthouse-pyre-loop"
}
```

Notes:
- `frame_count: 8` is even (required), divides cleanly to 8fps (~1s loop) or 16fps (0.5s
  loop). Start with 8.
- `directions: ["unknown"]` because `directions` from Step A was 1.
- The seam-quality clause in `animation_description` is the only lever for a clean loop;
  PixelLab does not expose a "loop" toggle here.
- Generation is async (~30–60s). Poll `get_object(object_id)` until status is `completed`.

#### Step C — promote to runtime

1. Download the 8 animation frames via PixelLab download URLs into
   `outputs/pharosville/pixellab-prototypes/lighthouse-pyre/` (gitignored scratch).
   Use `curl --fail` per `PIXELLAB_MCP.md:91-95`.
2. Imagemagick post-process: alpha-key the teal background to transparent
   (`PIXELLAB_MCP.md`, `IMAGE_TOOLING_NOTES.md:32-33`); composite the 8 frames into one
   horizontal strip via:
   ```bash
   magick frame-0.png frame-1.png ... frame-7.png +append lighthouse-pyre-frames.png
   ```
3. Promote single still: `cp frame-0-keyed.png <landmark-still-dest>`.
4. Promote strip: `cp lighthouse-pyre-frames.png <landmark-strip-dest>`.

### 2. Frame size & beacon alignment

The beacon is at `[128, 47]` in 256×256 sprite-units. Inspecting the lighthouse PNG, the
useful brazier zone is approximately:
- 32–40 sprite-units wide at the bowl rim
- 48–56 sprite-units of vertical headroom above the rim before the sprite ends (256 − 47 −
  buffer)

Recommended sprite footprint: **64×64**, anchored so the bowl-bottom of the flame sits
exactly at the beacon point. With `anchor: [32, 56]` the flame body fills 0..56 (above
beacon) and the bottom 8 px sit slightly below the beacon (overlapping the bronze bowl).
That footprint:
- Fits within the 32–40 wide silhouette at the bowl rim and grows wider as the flame
  rises (visually correct — flames fan out)
- Leaves 64 − 56 = 8 px of headroom above the flame for embers/smoke wisp
- Is square (PixelLab `create_object` requirement) and a power of two (clean scaling)

If 64×64 is too small to read at default zoom, the next step up is **96×96** with
`anchor: [48, 80]`. Do not exceed 96; bigger flames start visually overpowering the
lighthouse silhouette and break the "fire bowl on top of a tower" silhouette.

Manifest `displayScale: 1` (matches `landmark.lighthouse`). At runtime the renderer applies
`camera.zoom * 1.32` (matching the existing `drawLighthouseFire` zoom factor at
`src/renderer/layers/lighthouse.ts:181`) so the flame scales with the lighthouse.

### 3. Asset storage layout

Mirror the ship-animation convention exactly (`public/pharosville/assets/manifest.json:880-922`,
USDC titan):

- Static / reduced-motion PNG: `lighthouse-pyre-still` (planned output artifact, not yet provisioned).
- Animation strip: `lighthouse-pyre-frames` (planned output artifact, not yet provisioned).

New manifest entry under `assets[]`:

```jsonc
{
  "id": "landmark.lighthouse-pyre",
  "path": "landmarks/lighthouse-pyre.png",
  "category": "landmark",
  "layer": "landmarks",
  "width": 64,
  "height": 64,
  "displayScale": 1,
  "anchor": [32, 56],
  "footprint": [24, 8],
  "hitbox": [16, 8, 48, 56],
  "loadPriority": "deferred",
  "animation": {
    "frameCount": 8,
    "frameSource": "landmarks/lighthouse-pyre-frames.png",
    "fps": 8,
    "loop": true,
    "reducedMotionFrame": 0,
    "spriteSheet": { "columns": 8, "rows": 1, "frameWidth": 64, "frameHeight": 64 }
  },
  "promptKey": "landmark.lighthouse-pyre",
  "semanticRole": "Animated brazier flame on the PSI lighthouse beacon point",
  "paletteKeys": ["bronze beacon", "warm orange", "gold", "ember red"],
  "tool": "mcp:create_object+select_object_frames+animate_object+imagemagick",
  "promptProvenance": {
    "jobId": "<animate_object animation group id from Step B>",
    "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5"
  }
}
```

Decisions:
- `loadPriority: "deferred"`. The lighthouse silhouette is fully readable without the
  flame sprite (procedural fire still draws as a fallback per `drawLighthouseOverlay`
  branch at `src/renderer/layers/lighthouse.ts:180-181`). Critical-budget pressure is real;
  do not add to `requiredForFirstRender`.
- **Do not** add to the `requiredForFirstRender` array at `manifest.json:23-49`.
- Bump `style.cacheVersion` to `"2026-05-01-lighthouse-pyre-v1"`.

### 4. Renderer integration

File: `src/renderer/layers/lighthouse.ts`.

#### A. Acquire the flame asset alongside the lighthouse asset

In `lighthouseRenderState` (lines 8-25), pull the flame asset:

```ts
const lighthouseAsset = assets?.get("landmark.lighthouse");
const pyreAsset = assets?.get("landmark.lighthouse-pyre"); // new
```

Add `pyreAsset` to the returned object so downstream draw functions can read it from the
cached state. Update `LighthouseRenderState` type via `ReturnType` inference (no manual
type edits needed).

#### B. Frame-index helper

Add (mirrors `shipAnimationFrameIndex` at `src/renderer/layers/ships.ts:784-791`, but
modulated by `lighthouseFireFlickerPerSecond` so peg health drives flicker pace):

```ts
function lighthousePyreFrameIndex(
  asset: LoadedPharosVilleAsset,
  motion: PharosVilleCanvasMotion,
): number {
  const animation = asset.entry.animation;
  if (!animation || animation.frameCount <= 1) return 0;
  const baseFps = animation.fps ?? 8;
  // Peg health modulates flame energy. Healthy peg → stable ~1.0× speed; off-peg → wilder.
  const speed = motion.plan.lighthouseFireFlickerPerSecond;
  return Math.floor(Math.max(0, motion.timeSeconds) * baseFps * speed);
}
```

#### C. Draw the sprite at the firePoint

In `drawLighthouseOverlay` (lines 172-182), add a sprite draw call ABOVE the procedural
fallback:

```ts
export function drawLighthouseOverlay(
  input: DrawPharosVilleInput,
  cached?: LighthouseRenderState,
  nightFactor = 0,
) {
  const { camera, ctx, motion, world } = input;
  const { firePoint, lighthouseAsset, pyreAsset } = cached ?? lighthouseRenderState(input);
  if (!world.lighthouse.unavailable) drawLighthouseBeam(ctx, firePoint, camera.zoom * 1.35, motion, nightFactor);

  // Procedural flame branch only when the lighthouse PNG itself is missing.
  // When the PNG is present AND the pyre is loaded, the animated sprite replaces
  // the procedural flame body. Embers (drawHearthEmbers) and the soft glow base
  // belong to Option 1 and remain procedural; they composite under the sprite.
  if (!lighthouseAsset) {
    drawLighthouseFire(ctx, firePoint, camera.zoom * 1.32, world.lighthouse.color, motion);
    return;
  }
  if (!pyreAsset) {
    // Fallback: pyre asset deferred-load not arrived yet — keep procedural flame
    // (this is also the reduced-motion path until first-frame settles).
    drawLighthouseFire(ctx, firePoint, camera.zoom * 1.32, world.lighthouse.color, motion);
    return;
  }
  drawLighthousePyreSprite(ctx, firePoint, camera.zoom * 1.32, pyreAsset, motion);

  // Embers always animate above the sprite (procedural smoke/spark layer).
  drawHearthEmbers(ctx, firePoint, camera.zoom * 1.32, world.lighthouse.color, motion);
}
```

And the new sprite-draw helper:

```ts
function drawLighthousePyreSprite(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  asset: LoadedPharosVilleAsset,
  motion: PharosVilleCanvasMotion,
) {
  const frame = lighthousePyreFrameIndex(asset, motion);
  // drawAnimatedAsset already handles reducedMotion → reducedMotionFrame and falls
  // back to drawAsset (static PNG) if the strip failed to load.
  drawAnimatedAsset(ctx, asset, point.x, point.y, zoom, frame, motion.reducedMotion);
}
```

Add the import at the top of the file:
```ts
import { drawAnimatedAsset, drawAsset } from "../canvas-primitives";
```

#### D. Composite ordering with Option 1's recolored procedural layers

Option 1 is recoloring `drawLighthouseFire` and `drawHearthEmbers` (warm fire palette,
animated noise on alpha, dynamic ember spawner). The sprite path bypasses
`drawLighthouseFire` entirely (the polygon body is replaced) but keeps
`drawHearthEmbers` as the spark/ember layer drawn on top of the sprite. This means:
- Option 1's recolored ember spawner remains active and visible.
- Option 1's recolored polygon flame is the **fallback only** (when `pyreAsset` missing).
- Coexistence: zero risk of double-drawing the flame body. The `drawHearthEmbers` call
  needs to be hoisted out of `drawLighthouseFire` (currently called at line 245) into the
  `drawLighthouseOverlay` body — see pseudocode above. Option 1 should be aware of this
  refactor.

### 5. Asset-loading registration

`PharosVilleAssetManager.loadCritical` and `loadDeferred` walk the manifest entirely
(`src/renderer/asset-manager.ts:123-138`). With `loadPriority: "deferred"` the new asset
will be picked up automatically by the deferred batch — no code change is needed in the
loader.

`loadAsset` at `src/renderer/asset-manager.ts:148-175` calls `loadAssetFrameSource` for
any entry with `animation.frameSource` set, which loads the strip in parallel and stores
it on the loaded asset as `frameSource`. So **the entire load path is already implemented
for animated entries** (proven by the existing titan-ship use). No changes required to the
asset manager.

The `assets.get("landmark.lighthouse-pyre")` lookup in `lighthouseRenderState` will return
`null` while the deferred batch is in flight, which triggers the procedural fallback —
graceful degradation.

### 6. Service-worker / cache-version impact

Per `docs/pharosville/CHANGE_CHECKLIST.md:31` and `docs/pharosville/ASSET_PIPELINE.md:16`:
> Bump `style.cacheVersion` whenever promoted asset bytes, manifest geometry, or animation
> frame assets change.

`assetUrl` at `src/systems/asset-manifest.ts:93-95` appends `?v=<cacheVersion>` to every
asset request, so bumping `style.cacheVersion` invalidates all browser/CDN caches for all
assets. No service worker exists in the runtime today (verified — no `*.sw.ts` /
service-worker registration in `src/`); the `cacheVersion` is the only cache lever.

Required bump for Option 2:
```jsonc
"style": {
  "cacheVersion": "2026-05-01-lighthouse-pyre-v1",   // was "2026-05-01-unique-ships-v2"
  ...
}
```

`scripts/pharosville/validate-assets.mjs` enforces a `maxManifestAssets` cap. Current
budget is 45 (bumped during the unique-ship plan). Adding one new entry takes total from
44 → 45 — at the cap. **Action:** verify by running `npm run check:pharosville-assets`. If
at-cap fails, bump `maxManifestAssets` to 50 in `scripts/pharosville/validate-assets.mjs`
with an inline comment, mirroring the precedent in
`agents/completed/2026-05-01-unique-ship-category-plan.md` Step 5.0.

### 7. Risks

- **Palette match across PixelLab regenerations.** PixelLab cannot be seeded for
  `create_object` (`IMAGE_TOOLING_NOTES.md:44-46`). Re-rolls are not deterministic.
  Mitigation: explicit hex codes in the prompt + post-process palette quantization in
  imagemagick (`-remap palette.png`) if needed. Accept the chosen frames once and never
  regenerate piecemeal — regenerate the whole 8-frame loop together so the loop seam stays
  coherent.
- **Loop seam.** PixelLab `animate_object` does not guarantee a clean loop. Mitigation:
  the prompt clause "frame N must loop seamlessly into frame 0" is the only steering
  knob. After download, manually swap frame ordering or duplicate-and-cross-fade if the
  seam pops. If still bad after one regeneration, fall back to **6 frames** and let the
  flame visibly cycle slower — eye is more forgiving of a slow continuous loop than a
  fast one with a hitch.
- **Low zoom.** At `camera.zoom < 0.6` the flame sprite collapses to ≤ ~24×24 screen
  px and reads as a fuzzy blob. The procedural soft glow underneath (Option 1) carries the
  reading at low zoom; the sprite becomes a tiny accent. Verify visually in the
  `pharosville-dense-desktop-shell` baseline (the most zoomed-out fixture).
- **Reduced motion.** `drawAnimatedAsset` already pins `reducedMotionFrame` (frame 0).
  Verify Option 1's recolored embers also gate on `motion.reducedMotion` (existing
  behavior at lines 269-272 already does).
- **Critical-asset budget.** Even though the entry is deferred, the strip PNG (8 × 64×64
  RGBA = ~33KB raw, ~5–10KB compressed) is small. No first-render byte budget impact.

### Files changed (Option 2)

| File | Lines | Change |
| --- | --- | --- |
| `public/pharosville/assets/manifest.json` | bump `style.cacheVersion` (line 4); add new `assets[]` entry after the last landmark | one new entry, cache bump |
| `lighthouse-pyre.png` | new file | 64×64 still |
| `lighthouse-pyre-frames.png` | new file | 512×64 strip |
| `src/renderer/layers/lighthouse.ts` | 8-25 (lighthouseRenderState), 172-182 (drawLighthouseOverlay), new helper | sprite acquisition, frame-index, sprite draw |
| `scripts/pharosville/validate-assets.mjs` | `maxManifestAssets` constant (~line 25) | conditional bump if 45-cap is exceeded |
| `agents/pharosville-lighthouse-fire-options-2-3-plan.md` | this file | (delete on completion or move to `agents/completed/`) |

### Implementation effort

- **Medium.** ~1 session for sprite generation + iteration (~30–60min PixelLab + several
  re-rolls + imagemagick post). ~1 session for renderer wiring + tests + visual baseline
  rebake.

### Minimum viable Option 2

1. Skip `animate_object`. Just `create_object(directions:1, n_frames:1, size:64)` for a
   single-frame brazier flame PNG.
2. Promote the still as `landmark.lighthouse-pyre` with **no `animation` block**.
3. Renderer draws it via `drawAsset` once, at `firePoint`, as a static overlay on top of
   the (Option-1-recolored) procedural flame.
4. The recolored procedural fire underneath provides the motion; the sprite provides the
   pixel-art quality boost.

Effort: 1–2 hours. Trade-off: no real flame animation, but a visible quality lift over
pure procedural ellipses, and validates the integration path before committing to a
full animation cycle.

---

## Option 3 — Volumetric Warm Haze (Replace Beams)

### Concept

The lighthouse becomes a fantastical bonfire/pyre point-source, not a directional
searchlight. No beam cones. The fire's presence is communicated by:
- A large omnidirectional warm bloom that gently illuminates the surrounding island and
  water
- Pulsing/expanding heat-shimmer rings emanating from the firePoint
- A flickering reflection pool projected into the water tiles to the south of the lighthouse
- A close-perimeter ember-glow tied to the existing fire (Option 1)
- Subtle radial vignette/darkness at the world periphery to reinforce night

### 1. Layer-by-layer specification

Replace the body of `drawLighthouseNightHighlights`
(`src/renderer/layers/lighthouse.ts:430-581`). Layer order is bottom-up; all use additive
composite (`globalCompositeOperation = "lighter"`) except the dark vignette which uses
`source-over` with low alpha (or alternately `multiply` if available).

| # | Layer | Composite | Geometry | Color stops | Animation |
| --- | --- | --- | --- | --- | --- |
| 1 | Periphery vignette (subtle) | `source-over` | radial gradient outside firePoint | `rgba(0,8,16, 0)` at r=1200×zoom → `rgba(0,8,16, 0.18*nightFactor)` at r=2200×zoom | none |
| 2 | Warm wide bloom | `lighter` | radial, r₁=80*zoom → r₂=820*zoom centered on firePoint | `rgba(255,210,140, 0.20*nightFactor)` → `rgba(255,150,70, 0.10*nightFactor)` @0.45 → `rgba(255,120,40, 0)` | breath: ×(1 + 0.06*sin(t*0.6)) on alpha |
| 3 | Mid orange halo | `lighter` | radial, r₁=20*zoom → r₂=320*zoom on firePoint | `rgba(255,180,90, 0.30*nightFactor)` → `rgba(255,130,50, 0.18*nightFactor)` @0.5 → `rgba(255,100,30, 0)` | breath: ×(1 + 0.08*sin(t*0.9 + 0.5)) on alpha |
| 4 | Inner hot core | `lighter` | radial, r=80*zoom on firePoint | `rgba(255,245,210, 0.35*nightFactor)` → `rgba(255,200,120, 0.18*nightFactor)` @0.5 → `rgba(255,150,80, 0)` | flicker: alpha ×(1 + 0.10*sin(t*5*flickerSpeed) + 0.05*sin(t*8*flickerSpeed)) — uses `lighthouseFireFlickerPerSecond` so peg health modulates |
| 5 | Heat-shimmer rings (3 active) | `lighter` | stroked circles, see §3 | `rgba(255,180,100, alpha)` per-ring | continuous expansion + alpha-fade — see §3 |
| 6 | Water reflection pool | `lighter` over water area | tilted ellipse to the south of firePoint, see §4 | gradient `rgba(255,180,90, 0.45*nightFactor)` → `rgba(245,140,60, 0)` | sub-flicker: alpha ×(1 + 0.07*sin(t*1.3 + 1.1)); 4 sub-glints with low-alpha small ellipses at offsets, each phase-staggered |
| 7 | Ember-glow (close perimeter) | `lighter` | small radial r=24*zoom on firePoint | `rgba(255,220,150, 0.25*nightFactor)` → `rgba(255,160,80, 0)` | ride along Option 1's existing flicker so the close glow throbs in lockstep with the procedural fire |

Concrete RGBA values are inline above. Easing math:
- All breath/flicker oscillators use `Math.sin(time * hz + phase)`. Hz values picked so the
  layers are mutually incommensurate (6, 9, 13, ~50× flickerSpeed) to avoid visible
  beating.
- Reduced motion: clamp every oscillator to `0` (use `motion.reducedMotion ? 0 : motion.timeSeconds`)
  but keep all static alpha values so the night scene is still warm and present.

### 2. Function-by-function diff sketch for `drawLighthouseNightHighlights`

Current shape (lines 430-581):
1. Wide diffuse fill (cool-ish)
2. Core (cool-white)
3. Right beam cone
4. Left beam cone
5. Right water shimmer (along right beam)
6. Left water shimmer (along left beam)
7. Warm halo
8. Warm water pool

Mapping to Option 3:

| Current | Action | Option 3 replacement |
| --- | --- | --- |
| Wide diffuse fill (lines 446-458) | **Replace** | Layer 1 (periphery vignette) + Layer 2 (warm wide bloom) |
| Core (461-473) | **Replace** | Layer 4 (inner hot core) — warmer, smaller, flicker-modulated |
| Right beam cone (483-497) | **Delete** | Layer 5 ring 1 expanding outward (ring is omnidirectional) |
| Left beam cone (499-513) | **Delete** | Layer 5 ring 2 expanding outward (phase-offset) |
| Right water shimmer (520-530) | **Delete** | Layer 6 water pool sub-glint |
| Left water shimmer (532-542) | **Delete** | Layer 6 water pool sub-glint |
| Warm halo (544-559) | **Replace** | Layer 3 (mid orange halo) — thicker, wider |
| Warm water pool (562-580) | **Replace** | Layer 6 (water reflection pool) — bigger, animated, sub-glints |

Also delete `drawLighthouseBeamRim` (lines 324-402) — it brightens ship edges within the
beam wedges; with no beams it has no purpose. The ship edges still get rim-light from
`drawAtmosphere` which is unaffected.

Also update `lighthouseOverlayScreenBounds` (lines 83-110) — its `beamBounds` calculation
becomes meaningless without beams. Replace with a circular bounds derived from
`NIGHT_HALO_OUTER_RADIUS` (which keeps its name but now refers to the warm bloom radius):

```ts
const haloReach = NIGHT_HALO_OUTER_RADIUS * input.camera.zoom;
const haloBounds = {
  x: firePoint.x - haloReach,
  y: firePoint.y - haloReach,
  width: haloReach * 2,
  height: haloReach * 2,
};
```

The `lighthouseOverlayScreenBounds` test (`lighthouse-night.test.ts:65-76`) asserts night
bounds are smaller than noon. With Option 3, the warm bloom *replaces* the day beams as
the night reach. Update the test: night bounds should be **roughly equal to** noon bounds
(both the day beam wedge and the night halo reach contribute to selection bounds, but at
different times). Or just assert "non-zero at full night."

### 3. Heat-shimmer ring system

Pseudocode (insert as a new `drawHeatShimmerRings` helper):

```ts
const SHIMMER_RING_COUNT = 3;
const SHIMMER_PERIOD_SECONDS = 2.4;     // each ring's lifetime
const SHIMMER_MAX_RADIUS = 360;          // sprite-units
const SHIMMER_MIN_RADIUS = 30;

function drawHeatShimmerRings(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  time: number,
  nightFactor: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < SHIMMER_RING_COUNT; i += 1) {
    const phaseOffset = (i / SHIMMER_RING_COUNT) * SHIMMER_PERIOD_SECONDS;
    const localT = ((time + phaseOffset) % SHIMMER_PERIOD_SECONDS) / SHIMMER_PERIOD_SECONDS; // 0..1
    const eased = 1 - Math.pow(1 - localT, 1.8); // ease-out (rings expand fast then settle)
    const r = (SHIMMER_MIN_RADIUS + (SHIMMER_MAX_RADIUS - SHIMMER_MIN_RADIUS) * eased) * zoom;
    // Triangular alpha curve: 0 at birth → peak at t=0.35 → 0 at death
    const alphaCurve = localT < 0.35
      ? localT / 0.35
      : 1 - (localT - 0.35) / 0.65;
    const alpha = 0.22 * alphaCurve * nightFactor;
    if (alpha <= 0.001) continue;
    // Slight per-ring perturbation: jitter the center by 1.5*zoom (noise from sin)
    const jx = Math.sin(time * 1.7 + i * 2.3) * 1.5 * zoom;
    const jy = Math.cos(time * 1.3 + i * 1.9) * 1.5 * zoom;
    ctx.strokeStyle = `rgba(255, 180, 100, ${alpha})`;
    ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.beginPath();
    ctx.arc(point.x + jx, point.y + jy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
```

Notes:
- 3 rings with 1/3-period offset gives one always-newborn, one at peak, one fading.
- Triangular alpha curve avoids hard pop-in at birth.
- Noise jitter is intentionally tiny (1.5*zoom) so it reads as heat distortion rather than
  the rings drifting around.
- Reduced motion: pass `time = 0` so all three rings sit at their phase-offset positions,
  static. Aesthetically acceptable as "ambient heat present, no animation."

### 4. Water reflection design

Find water tiles relative to the lighthouse. From `src/systems/world-layout.ts:11`,
`LIGHTHOUSE_TILE = (18, 28)`. The peninsula extends roughly south/east — water tiles are
all tiles with `isWaterTileKind(kind) === true` (`src/systems/world-layout.ts:124`). Water
sits below and to the south/southwest of the lighthouse based on the existing
`LIGHTHOUSE_SURF` array (lines 27-36 of `lighthouse.ts`) which all have y≥25.7, x∈[15.2,22.0].

Design a downward-projected pool tilted slightly along the prevailing tile-isometric axis:

```ts
const POOL_OFFSET_Y = 56;          // sprite-units below firePoint (further down than current 36)
const POOL_RADIUS_X = 720;         // wider than current 640 — peninsula water fan
const POOL_RADIUS_Y = 220;         // flatter (height ~30% of width) — read as on-water reflection
const POOL_TILT = -0.08;           // radians, follows isometric x-axis tilt

function drawLighthouseReflectionPool(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  time: number,
  nightFactor: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const poolY = point.y + POOL_OFFSET_Y * zoom;
  const breath = 1 + 0.07 * Math.sin(time * 1.3 + 1.1);

  // Main pool gradient
  const main = ctx.createRadialGradient(point.x, poolY, 24 * zoom, point.x, poolY, POOL_RADIUS_X * zoom);
  main.addColorStop(0, `rgba(255, 180, 90, ${0.45 * nightFactor * breath})`);
  main.addColorStop(0.5, `rgba(245, 140, 60, ${0.22 * nightFactor * breath})`);
  main.addColorStop(1, "rgba(245, 140, 60, 0)");
  ctx.fillStyle = main;
  ctx.translate(point.x, poolY);
  ctx.rotate(POOL_TILT);
  ctx.beginPath();
  ctx.ellipse(0, 0, POOL_RADIUS_X * zoom, POOL_RADIUS_Y * zoom, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sub-glints — 4 small flickering ellipses at staggered offsets within the pool
  const glints = [
    { dx: -180, dy: 30,  rx: 80, ry: 18, hz: 1.7, ph: 0.0 },
    { dx:   60, dy: 50,  rx: 100, ry: 22, hz: 2.1, ph: 1.3 },
    { dx:  220, dy: 14,  rx: 70, ry: 16, hz: 1.5, ph: 2.4 },
    { dx: -100, dy: 90,  rx: 90, ry: 20, hz: 1.9, ph: 3.7 },
  ];
  for (const g of glints) {
    const a = 0.35 * nightFactor * (0.6 + 0.4 * Math.sin(time * g.hz + g.ph));
    if (a <= 0.001) continue;
    ctx.fillStyle = `rgba(255, 200, 130, ${a})`;
    ctx.beginPath();
    ctx.ellipse(g.dx * zoom, g.dy * zoom, g.rx * zoom, g.ry * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

Notes:
- The pool is drawn after the night tint and after the procedural surf
  (`drawLighthouseSurf` at line 38 — already drawn before night highlights at world-canvas
  line 283). It tints the existing teal water layer warmly without erasing the surf
  strokes.
- No water-mask gating: the pool extends past the peninsula but the alpha gradient and
  additive composite mean any pixel landing on the limestone headland just gets a little
  warmer — visually acceptable as "warm light wash on the immediate cliff base," and
  cheaper than testing each pixel against `isWaterTileKind`.
- If the warm wash on land reads wrong in visual review, the cleanest fix is to **mask
  the pool to water tiles** by drawing a clip path from the world's terrain mask. This is
  more expensive and not in scope for the minimum-viable cut.

### 5. Gameplay readability tradeoff

Today's beams convey "the lighthouse is active and pegged within healthy band" via
their pulse and color. With Option 3 they go away. The fire bowl carries activity
(via flicker) and warmth (via glow), but loses **directionality** — the user no longer
sees "the lighthouse is sweeping the sea looking for ships."

Reading-loss audit:
- "Lighthouse is on" — preserved (warm haze, ember pulse, heat shimmer).
- "Lighthouse health" — preserved via flicker speed (`lighthouseFireFlickerPerSecond`)
  modulating Layer 4 and Layer 5.
- "Sweep / scan" — **lost.** Beams visually rotated/pulsed; the haze does not.
- Ship rim-lighting (`drawLighthouseBeamRim`) — lost as a side effect.

Mitigations:
- **Optional fallback (recommended):** keep a faint, low-alpha, *warm* directional hint —
  two thin slow-rotating warm ember-streaks that tail off well before reaching the screen
  edge (max reach ~120 sprite-units, vs current 250). Reads as "embers blowing on the
  wind" rather than a scan beam. Code: 2 thin elongated additive ellipses, rotating
  ~0.05 rad/s, alpha 0.10*nightFactor. About 30 lines.
- Mark this as a decision point: ship the omnidirectional cut first, then add the warm
  ember-streaks if the user judges signal-loss too strong. Both can coexist; the streaks
  are decorative, not the primary read.
- Keep `drawLighthouseBeamRim` but rename + retune to `drawShipNightWarmRim` —
  ships within the warm bloom radius get their masts/sails lit warm at low alpha.
  Cheaper than a full per-pixel light test; keeps "ships near the lighthouse glow"
  reading.

### 6. Performance

Current `drawLighthouseNightHighlights` does 8 fills (per the existing test
`lighthouse-night.test.ts:60`). Option 3 budget:

- Layer 1: 1 fill (large radial)
- Layer 2: 1 fill (large radial — 820 zoom radius)
- Layer 3: 1 fill (medium radial)
- Layer 4: 1 fill (small radial, flicker-modulated alpha but only 1 draw per frame)
- Layer 5: 3 strokes (rings)
- Layer 6: 1 fill main pool + 4 sub-glints = 5 fills
- Ember-glow (Layer 7): 1 fill
- Optional warm directional hint: 2 fills

Total: **~13–15 draw operations** per frame, vs current 8. About 2× more fills, but each
is at most one large radial gradient.

Canvas 2D radial gradient cost is dominated by the **fill area in pixels** more than by
gradient creation. The biggest fill is Layer 2 (warm wide bloom) at ~820*zoom radius. At
default zoom (~1.0) that's a ~5300×5300 px fill area — within the same magnitude as the
current diffuse fill (`r=1000*zoom`, ~6300×6300). So the dominant cost (one large radial
fill) is **roughly equal**.

Concerns:
- 3 stroked circles at `r=360*zoom` are stroke-only (cheap; just a circle perimeter, not a
  filled disk).
- The 4 sub-glints are small (~80×18) — negligible.
- Off-screen culling: `lighthouseOverlayScreenBounds` is consumed by selection, not by the
  draw call — the draw call always runs at full size when `nightFactor > 0`. This matches
  current behavior; no regression.

**Verdict:** roughly comparable to current cost. Watch out for the warm bloom (Layer 2) on
4K viewports — at `camera.zoom > 1.5` the pixel area scales O(zoom²). If frame-time
regresses, cap Layer 2 radius at `min(820*zoom, 1400)`.

### Files changed (Option 3)

| File | Lines | Change |
| --- | --- | --- |
| `src/renderer/layers/lighthouse.ts` | 67-72 (NIGHT_HALO_*, NIGHT_WATER_POOL_* constants) | retune values |
| `src/renderer/layers/lighthouse.ts` | 83-110 (`lighthouseOverlayScreenBounds`) | replace `beamBounds` with circular halo bounds |
| `src/renderer/layers/lighthouse.ts` | 283-322 (`drawLighthouseBeam`) | **delete** — beams gone |
| `src/renderer/layers/lighthouse.ts` | 324-402 (`drawLighthouseBeamRim`) | **delete** OR rename + retune to warm-rim |
| `src/renderer/layers/lighthouse.ts` | 430-581 (`drawLighthouseNightHighlights`) | full body replace per §1, §3, §4 |
| `src/renderer/layers/lighthouse.ts` | 172-182 (`drawLighthouseOverlay`) | remove `drawLighthouseBeam` call |
| `src/renderer/world-canvas.ts` | 293 (`drawLighthouseBeamRim` call) | delete or rename |
| `src/renderer/layers/lighthouse-night.test.ts` | 55-62 | update fill count assertion (8 → ~13) |
| `src/renderer/layers/lighthouse-night.test.ts` | 65-76 | rewrite bounds test — night bounds become circular, not "smaller than noon" |

### Implementation effort

- **Medium-large.** Renderer math + testing. Visual baseline rebake will be wide (every
  night-lane snapshot diffs).
- Visual baseline blast list (mirrors the unique-ship plan precedent):
  - `pharosville-dense-dawn`
  - `pharosville-dense-dusk`
  - `pharosville-dense-night`
  - `pharosville-dense-lighthouse` (any time-of-day variant present)
  - Possibly `pharosville-dense-desktop-shell` if the night halo extends into its crop

Estimated: 1 session for the core layer rewrite, 1 session for tuning + visual review,
1 session for snapshot baseline updates and any beam-rim follow-up.

### Minimum viable Option 3

Ship a single-commit cut that swaps out only the cool-white beams for a warm
omnidirectional bloom + small heat shimmer:

1. Delete the two cool-white beam cone fills (lines 483-513 in `drawLighthouseNightHighlights`).
2. Recolor the existing wide diffuse fill (lines 446-458) from cool-grey to warm orange:
   `rgba(255, 180, 90, 0.20*nightFactor)` → `rgba(255, 130, 60, 0)`.
3. Recolor the core (461-473) from cool-white to warm gold: `rgba(255, 220, 130, 0.30*nightFactor)`.
4. Keep the existing warm halo and water pool as-is (they were already warm).
5. Delete the two water shimmers (520-542) since they were beam-aligned.
6. Keep `drawLighthouseBeam` and `drawLighthouseBeamRim` for now (they fade with
   `nightFactor` already, so at full night they're invisible).

Lines changed: ~50 deletions + recolor of ~10 RGBA values. No new shimmer rings, no
sub-glints, no vignette. About 1–2 hours. Trade-off: the night looks warm but
"flat" — no expanding rings, no glints. Validates the design direction with the user
before investing in the full set.

---

## Cross-cutting

### Interaction with Option 1

Option 1 is recoloring the procedural fire (warm palette), adding noise on alpha, and
making the ember spawner dynamic.

- **Option 1 + Option 2:** the recolored procedural fire becomes the **fallback** (when
  the pyre asset hasn't loaded). The recolored ember spawner stays active and draws above
  the sprite. Recommendation: Option 1 lands first, Option 2 plugs in afterward and
  disables the polygon-flame branch when the sprite is present.
- **Option 1 + Option 3:** zero conflict. Option 1 owns the immediate flame/embers at the
  brazier. Option 3 owns the night halo / shimmer / water reflection. They composite cleanly
  because Option 1 draws inside `drawLighthouseOverlay` (entity pass) and Option 3 draws
  inside `drawLighthouseNightHighlights` (post-night-tint pass).
- **Option 2 + Option 3:** also compatible. Sprite at the bowl + omnidirectional haze
  around it = the cleanest fantasy-bonfire reading. If shipping all three, ship in order:
  1, 3, 2 (each step is independently shippable; 2 lands last because it requires PixelLab
  generation).

### Shared file impact

Both options touch `src/renderer/layers/lighthouse.ts`. Option 2 touches lines 8-25 and
172-182. Option 3 rewrites 430-581 and removes 283-402. The two diffs do not overlap, so
both can land in any order.

### Tests

Both options need `src/renderer/layers/lighthouse-night.test.ts` updated:
- Option 2: no change needed (test exercises `drawLighthouseNightHighlights`, untouched
  by Option 2).
- Option 3: see "Files changed" table above; update fill count and bounds-test logic.

Both options need visual baseline rebakes — see per-option blast lists.

### Cache version

- Option 2: bump `style.cacheVersion` (new asset bytes).
- Option 3: no manifest change needed (no new assets, no geometry change), so no cache
  bump strictly required. Optional: bump anyway to flush any baked-in browser cache for
  any asset whose composite-on-screen behavior depends on timing.

### Linter / type / asset checks

Standard pre-claim gate (per `AGENTS.md:48-58`):
```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Option 2 specifically: `npm run check:pharosville-assets` validates the new manifest
entry. May need to bump `maxManifestAssets` in `scripts/pharosville/validate-assets.mjs`
if at the 45-cap (see §6 in Option 2 above).

---

## References

- `src/renderer/layers/lighthouse.ts` — current procedural lighthouse fire + night highlights
- `src/renderer/canvas-primitives.ts:22-79` — `drawAnimatedAsset` / `drawAssetFrame`
- `src/renderer/asset-manager.ts:148-175,303-316` — animated frame-source loader (already exists)
- `src/systems/asset-manifest.ts:5-18,93-95` — animation schema + `assetUrl` cache busting
- `public/pharosville/assets/manifest.json:880-922` — USDC titan animated entry (closest precedent)
- `agents/completed/2026-05-01-unique-ship-category-plan.md` — manifest+validator+cache version pattern
- `agents/completed/usds-titan-squad-plan.md:680-731` — animated ship sprite manifest entry shape
- `docs/pharosville/PIXELLAB_MCP.md` — MCP tool selection + prompt construction
- `docs/pharosville/IMAGE_TOOLING_NOTES.md` — PixelLab gotchas (no seed on `create_object`,
  teal background, watermark, animate_object specifics)
- `docs/pharosville/CHANGE_CHECKLIST.md:31` — cache version bump rule
- `docs/pharosville/ASSET_PIPELINE.md:14-17` — manifest + cache version contract
- `agents/completed/pharosville-lighthouse-integration-plan.md` — prior lighthouse work, plan style anchor

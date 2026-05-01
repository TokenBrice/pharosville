# Lighthouse Night — Design Spec

**Date:** 2026-05-01
**Status:** Approved (pending implementation plan)
**Scope:** PharosVille canvas renderer

## Goal

Make night feel like night, and make the lighthouse the dominant light source in it.

Today the renderer cycles through dawn/day/dusk/night sky moods (see `skyState` in `src/renderer/layers/sky.ts:196`), but only the sky backdrop changes. The world below — terrain, water, ships, docks, the lighthouse beam and fire — renders identically at noon and midnight. As a result "night" reads as a slightly bluer sky over an otherwise daytime world, and the lighthouse never feels like it's doing any work.

This spec adds:

1. **A real-time-of-day cycle.** The mood follows the user's wall clock instead of a 166-second simulated loop.
2. **A continuous `nightFactor` ∈ [0, 1].** Smoothly interpolated across dawn (05:00–07:00) and dusk (18:00–20:00).
3. **A single global "night tint" pass** that darkens everything below the lighthouse and lamp layers in proportion to `nightFactor`.
4. **Boosted lighthouse output at night** — bigger halo, brighter and longer beams, and a new warm pool of light that re-illuminates the lighthouse headland and the water immediately around it.

The result: at night the world is roughly B/C-deep on the darkness scale we mocked up (~60–70% darker than day), with the lighthouse area as the only fully-lit zone outside the beam wedges.

## Non-goals

- No physically-correct per-material lighting. Everything below the tint pass darkens uniformly.
- No sweeping rotating beam. The existing static-wedge / soft-pulse beam style is preserved.
- No new asset work. PixelLab pipeline untouched.
- No tower window decals or sprite recolors. The existing lighthouse sprite is reused as-is.
- No mood-aware terrain/water/ship/dock palettes. (Approach 2 in the brainstorm; explicitly rejected as scope creep.)
- No smoothing of sky-mood color snaps at band boundaries. (Approach B2 in the brainstorm; rejected — `nightFactor` smoothness handles the perceptually critical part.)

## Architecture

### Cycle driver

`skyState(motion)` is the single source of truth for sky mood and now also `nightFactor`. It becomes a pure function of a new motion field, `wallClockHour: number` (0..24, fractional).

- `motion.wallClockHour` is populated in `src/pharosville-world.tsx` once per frame from `new Date().getHours() + getMinutes()/60`.
- `skyState` reads only `motion.wallClockHour`. No `Date` calls inside the renderer.
- **Reduced motion**: when `prefers-reduced-motion: reduce` is set, the populating site in `pharosville-world.tsx` pins `wallClockHour = 12` instead of reading the wall clock. RM users get a stable noon scene every visit (matching the prior intent of frozen-mood, but at noon-mood instead of dusk-mood). `skyState` itself remains pure and unaware of reduced motion — the pin happens at the producer.
- Tests pass an explicit `wallClockHour` for determinism.

**Timezone / latitude limitation**: we use the user's local clock hour, not solar elevation. A user in Reykjavík in December will see "night" at 14:00 even though their sky was already dark; a user in Helsinki in June will see "night" at 22:00 while it's still bright outside. This is acceptable for a stylized harbor visualization. Documented here so first-user feedback doesn't read as a bug.

Hour bands (consumed by both mood selection and `nightFactor`):

| Hours | Mood | nightFactor |
|------|------|------------|
| 05:00–07:00 | dawn | linear 1 → 0 |
| 07:00–18:00 | day | 0 |
| 18:00–20:00 | dusk | linear 0 → 1 |
| 20:00–05:00 | night | 1 |

`nightFactor` is computed independently from `mood` so it stays continuous even though `mood` is discrete (snaps at band boundaries are accepted — see "Smoothing" below).

`skyState` returns `{ mood, progress, nightFactor }`. `progress ∈ [0, 1)` continues to be the value consumed by the existing celestial arc / sun / moon paths in `sky.ts` (`drawCelestialArc`, `drawSun`, `drawMoon`, all of which call `skyPathPoint(width, height, progress, ...)` to place the sun/moon along an arc).

New derivation: `progress = (((wallClockHour - 6) / 24) % 1 + 1) % 1`. The 6-hour offset puts dawn at `progress = 0` (sun appears upper-left in `skyPathPoint`), noon at `progress ≈ 0.25` (sun at top of arc), dusk at `progress = 0.5` (sun upper-right / setting), and midnight at `progress = 0.75` (below horizon, where `sunAlpha = 0` hides it anyway). This preserves the existing `skyPathPoint` geometry without re-tuning its math.

### Render pipeline

> **Implementation note (post-review revision):** The original render-order proposal put boosted versions of `drawLighthouseBeam` and `drawLighthouseFire` after the tint pass. In the actual codebase, the lighthouse beam and fire are drawn within the entity-pass via `drawLighthouseOverlay`, and the production sprite path skips `drawLighthouseFire` entirely. Refactoring the entity pass to extract beam/fire is invasive and risks z-ordering regressions with adjacent ships. Instead, we keep the existing beam/fire draws unchanged and add a single new `drawLighthouseNightHighlights` pass after the tint that draws an additive halo (lighter composite) at `firePoint`, an additive secondary beam stack, and a warm water/headland pool. The existing in-entity-pass beam/fire continue to render and get darkened by the tint; the new additive layer pushes the lighthouse area back above ambient brightness. Same user-facing outcome ("lighthouse pops at night"), considerably less invasive.

The new render order in `src/renderer/world-canvas.ts`:

```
1. drawSky                          (mood-aware backdrop — existing)
2. drawStaticPassCached "terrain"   (cached — existing)
3. drawWaterTerrainOverlays         (existing)
4. drawStaticPassCached "scene"     (cached, includes drawLighthouseHeadland — existing)
5. drawCoastalWaterDetails          (existing)
6. drawLighthouseSurf               (existing)
7. drawEntityPass                   (existing — ships, docks, graves, lighthouse body+overlay incl. existing beam/fire; everything here gets darkened by step 10)
8. drawWaterAreaLabels              (existing)
9. drawEthereumHarborSigns          (existing)
10. drawNightTint                   (NEW — single fillRect, alpha = MAX_NIGHT_DARKNESS * nightFactor)
11. drawAtmosphere                  (MOVED from before-tint to post-tint so mist reads against the dark scene)
12. drawLighthouseNightHighlights   (NEW — additive halo + boosted beam stack + warm water pool. Lights up the headland too because the halo radius covers it)
13. drawDecorativeLights            (existing — already uses additive composite, lamps shine through)
14. drawLighthouseBeamRim           (MOVED — was directly after entity pass; now after lamps so ship-edge highlights shine through the tint)
15. drawCemeteryMist                (existing)
16. drawBirds                       (existing)
17. drawSelection                   (existing)
```

Anything above the tint (steps 11–14) shines through. Anything below (steps 1–9) gets darkened uniformly. Sky stays untouched because it has its own mood-aware coloring already.

**Headland geometry note**: the cached "scene" pass at step 4 includes `drawLighthouseHeadland`, which means the headland is darkened by the tint at step 10. The "lit headland" requirement is satisfied by step 12 — `drawLighthouseNightHighlights` draws an additive halo centered on `firePoint` with a radius (~320 sprite units × camera.zoom) wide enough to envelop the headland sprite (the headland sits ~150 units below `firePoint` in screen space). The additive `lighter` composite means the warm halo brightens the dark headland back up. No need to bust the static-scene cache.

### Components

#### `src/renderer/layers/night-tint.ts` (new)

```
export function drawNightTint(input: DrawPharosVilleInput, nightFactor: number): void
```

- `nightFactor` is passed in (computed once per frame in `drawPharosVille`); this layer does not import `sky.ts`.
- Early return when `nightFactor <= 0`.
- Fills the canvas with a deep-blue translucent rect: `rgba(8, 14, 28, MAX_NIGHT_DARKNESS * nightFactor)`.
- `MAX_NIGHT_DARKNESS = 0.62` (starting tunable; aimed at the B/C interpolation — between mockup B ~55% and mockup C ~75% — and adjusted in-browser).

That's the entire pass. Single `fillRect`, no offscreen canvas.

#### `src/renderer/layers/lighthouse.ts` (modified)

The existing `drawLighthouseFire`, `drawLighthouseBeam`, and `drawLighthouseOverlay` are **unchanged**. Adding `nightFactor` parameters to them was the original spec's idea, but as noted in the implementation note above, the production sprite path skips `drawLighthouseFire` entirely and the entity-pass z-ordering of the existing beam needs to be preserved. Instead we add one new function:

```
export function drawLighthouseNightHighlights(
  input: DrawPharosVilleInput,
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
): void
```

- Returns early when `nightFactor <= 0` or when `world.lighthouse.unavailable`.
- Sets `globalCompositeOperation = "lighter"` for the halo and the beam stack.
- **Halo**: radial gradient at `firePoint` with outer radius `NIGHT_HALO_OUTER_RADIUS * camera.zoom`. Alpha at center `NIGHT_HALO_MAX_ALPHA * nightFactor`, dropping to 0 at the rim. Wide enough to wash warmth onto the headland sprite below.
- **Beam stack**: re-paints two wedges over the existing beam at alpha `NIGHT_BEAM_ALPHA * nightFactor`, with wedge endpoints multiplied by `1 + NIGHT_BEAM_LENGTH_BOOST * nightFactor` so the beams reach further into the dark water.
- **Water pool**: switches to `source-over`, draws an elliptical radial gradient centered slightly below `firePoint`, outer radius `NIGHT_WATER_POOL_RADIUS * camera.zoom`, alpha `NIGHT_WATER_POOL_MAX_ALPHA * nightFactor`. Warms the water around the headland.

Constants:

```
NIGHT_HALO_OUTER_RADIUS = 320       // sprite units
NIGHT_HALO_MAX_ALPHA = 0.55
NIGHT_BEAM_ALPHA = 0.22
NIGHT_BEAM_LENGTH_BOOST = 0.3
NIGHT_WATER_POOL_RADIUS = 280       // sprite units
NIGHT_WATER_POOL_MAX_ALPHA = 0.35
```

`nightFactor` is **passed in as a parameter**, not derived from `motion` inside the function. This keeps `lighthouse.ts` from importing `sky.ts` (which already imports `lighthouseRenderState` from `lighthouse.ts` — re-deriving inside `lighthouse.ts` would create a circular import).

**Selection bounds**: when the beam length is boosted at night, the existing `lighthouseOverlayScreenBounds` (used for the selection rect's union with the beam's bounding box) under-covers the new wedge endpoints. Update `lighthouseOverlayScreenBounds` to accept a `nightFactor` and scale its hard-coded magnitudes (250, 168, 228, 154) by the same `1 + NIGHT_BEAM_LENGTH_BOOST * nightFactor` multiplier so click targets and selection halos still cover the lit beam tip.

#### `src/renderer/layers/sky.ts` (modified)

`skyState` rewritten to read `motion.wallClockHour` and emit `nightFactor`. Existing 4-mood discrete return preserved for `drawSky` callers that depend on it. The `motion.reducedMotion ? 0.58 : ...` override is removed — `skyState` is now a pure function of `motion.wallClockHour`. Per-frame animation suppression for reduced-motion (twinkle, wind drift, beam pulse) is unchanged; reduced-motion's stable-scene guarantee is now provided by pinning `motion.wallClockHour = 12` at the producer (see `pharosville-world.tsx` below).

#### `src/renderer/render-types.ts` (modified)

`PharosVilleCanvasMotion` gains `wallClockHour: number`. Required field — populated in `pharosville-world.tsx` and in every test fixture.

#### `src/pharosville-world.tsx` (modified)

In the rAF loop where `timeSeconds` is computed, also compute `wallClockHour`. When `reducedMotion` is true, pin `wallClockHour = 12` (RM users get a stable noon scene). Otherwise compute from `new Date().getHours() + getMinutes()/60`. ~6 lines.

#### `src/renderer/world-canvas.ts` (modified)

Inside `drawPharosVille`, compute `skyState(input.motion)` once per frame at the top of the function and capture `nightFactor`. Pass `nightFactor` directly into `drawNightTint` and `drawLighthouseNightHighlights` so neither layer needs to import `sky.ts`. Insert the new layers in the render order shown above; move `drawAtmosphere` after the tint; move `drawLighthouseBeamRim` after `drawDecorativeLights`.

### Smoothing

- **`nightFactor`**: linear interpolation across dawn and dusk windows. Continuous and monotone within each window.
- **Sky mood (`top`/`horizon`/`lower` colors)**: hard switches at 05:00, 07:00, 18:00, 20:00. Accepted — see Non-goals.

A user sitting through 19:59 → 20:00 will see a small color snap in the sky gradient. The world tint and lighthouse boost will be at `nightFactor ≈ 0.97` either side of that snap, so the perceptually dominant change (the world going dark and the lighthouse popping) is smooth. The sky-color snap is an isolated, brief artifact that we'll only escalate to mood-blending (Approach B2) if it reads as broken in practice.

## Data flow

```
new Date() (in pharosville-world.tsx, once per frame; pinned to 12 for reduced-motion)
    ↓
motion.wallClockHour
    ↓
skyState(motion) → { mood, progress, nightFactor }      [computed once, in drawPharosVille]
    ↓             ↓                          ↓
drawSky          (drawSky/sun/moon use      drawNightTint(input, nightFactor)
(mood colors)    progress for arc)          drawLighthouseNightHighlights(input, cached, nightFactor)
```

`skyState` is computed exactly once per frame in `drawPharosVille` (top of `world-canvas.ts:drawPharosVille`). The `nightFactor` value is passed as an explicit parameter into the new layers, avoiding redundant `skyState(motion)` calls and avoiding circular imports between `lighthouse.ts`, `night-tint.ts`, and `sky.ts`. Existing callers in `sky.ts` and `ambient.ts` continue to call `skyState` directly — those call sites are not in the lighthouse import graph and are cheap to leave as-is.

## Error handling

- `motion.wallClockHour` out of [0, 24): clamp via `((h % 24) + 24) % 24`. No throw — defensive against future weirdness, but the production callsite always produces a valid value.
- `skyState` is pure. No I/O, no timers, no DOM.
- `drawNightTint` early-returns when `nightFactor <= 0` so the daytime hot path takes no extra work.
- `drawLighthouseNightHighlights` same early return when `nightFactor <= 0` or when the lighthouse is unavailable.
- No new asset loads, no new network calls.

## Testing

### Unit tests — new file `src/renderer/layers/sky.test.ts`

- `nightFactor` is 0 at noon (12.0).
- `nightFactor` is 1 at midnight (0.0 and 24.0).
- `nightFactor` is 0.5 at 19:00 (mid-dusk) and 06:00 (mid-dawn).
- `nightFactor` is 1.0 at 20:00 and 05:00 boundaries (hold values, not transitions).
- Mood selection: dawn at 06:00, day at 12:00, dusk at 19:00, night at 22:00.
- `wallClockHour` clamping: -1 → 23; 25 → 1; 48.5 → 0.5.

### Unit tests — `src/renderer/layers/lighthouse-night.test.ts` (new)

- `drawLighthouseNightHighlights` early-returns when `nightFactor === 0` (mock canvas, assert no `fill` calls).
- `drawLighthouseNightHighlights` early-returns when `world.lighthouse.unavailable` is true.
- Halo + beam stack + water pool all draw at `nightFactor === 1` (count of `fill` calls ≥ 4).

### Visual tests — `tests/visual/pharosville.spec.ts`

- All existing tests pinned to `wallClockHour: 12` (clear day) by an `installWallClockOverride(page, hour)` helper that uses `page.addInitScript` to override `Date.prototype.getHours` and `Date.prototype.getMinutes` only — **not** `page.clock.install`, which virtualizes `requestAnimationFrame` and would hang tests that don't `fastForward`.
- New: `wallClockHour: 19` (dusk transition) — captures `nightFactor ≈ 0.5` halfway through the dusk band.
- New: `wallClockHour: 22` (deep night) — `nightFactor === 1`, full darkness + lighthouse pool + boosted beams.
- New: `wallClockHour: 6` (mid-dawn) — captures `nightFactor ≈ 0.5` on the rising side, with dawn-mood sky.

Baselines re-baked after manual review of the diffs. The CLAUDE.md "inspect screenshot diffs before updating baselines" rule applies. This is the same workflow used for recent commits (`56c2953 Re-bake visual baselines for limestone island and precision seawall`).

Step 9 of the implementation plan also explicitly checks **label legibility** at night (the `drawWaterAreaLabels` and `drawEthereumHarborSigns` text gets darkened by the tint), and confirms that **village lamps**, **gold dock lanterns**, and **risk-zone water tints** still read correctly under uniform darkening. If anything reads as broken, those layers can be hoisted above the tint pass in a follow-up — not this PR.

### Validation gate

Before marking work complete:

```
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

## Files touched

**New:**
- `src/renderer/layers/night-tint.ts`
- `src/renderer/layers/sky.test.ts`

**Modified:**
- `src/renderer/layers/sky.ts`
- `src/renderer/layers/lighthouse.ts`
- `src/renderer/render-types.ts`
- `src/renderer/world-canvas.ts`
- `src/pharosville-world.tsx`
- `tests/visual/pharosville.spec.ts`
- `tests/visual/pharosville.spec.ts-snapshots/**` (re-baked, not hand-edited)

**Untouched:**
- `src/systems/palette.ts`, `src/systems/world-layout.ts`, all of `src/systems/motion*`, terrain/ships/docks/scenery/buildings/water-labels layers
- `shared/**`, `functions/**`, `wrangler.toml`
- Asset files and PixelLab-generated sprites
- `src/renderer/layers/ambient.ts` (lamps already use additive composite; no changes needed)

## Risks & open tunables

1. **Tint color** (`rgba(8, 14, 28, …)`) and **`MAX_NIGHT_DARKNESS = 0.62`** are starting values. We tune in-browser after first render. If the night reads as flat gray instead of cool-blue, shift toward `(6, 12, 32)`. If lighthouse contrast is insufficient, raise `MAX_NIGHT_DARKNESS` toward 0.7.
2. **Water-pool radius and alpha** — too small and the headland looks orphaned in dark; too big and it competes with the beam. Tune in-browser.
3. **Beam length boost** — at night the +30% length might run beams into ships farther out than today. Visually this is desirable, but if `drawLighthouseBeamRim` (the ship-edge highlighter) reads weird against the longer wedges we revisit.
4. **Sky color snap at band boundaries** — accepted artifact; revisit only if user feedback flags it.
5. **Visual baseline churn** — most existing baselines need re-baking even at noon, because the legacy frozen `progress = 0.58` rendered the dusk-mood backdrop and we're moving to day-mood. Expected, not surprising.

## Approval trail

- Cycle driver: real local time (Section 1, approved).
- Darkness intensity: between B and C, ~60–70% darker (mockup, approved).
- Lighthouse footprint: full ambient (halo + sweeping beams + warm pool + lit headland).
- Implementation approach: global tint pass (Approach 1 of three considered).
- Mood smoothing: hard switches with smooth `nightFactor` (Approach B1).

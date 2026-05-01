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
- Tests pass an explicit `wallClockHour` for determinism.

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

The new render order in `src/renderer/world-canvas.ts`:

```
1. drawSky                       (mood-aware backdrop — existing)
2. drawLighthouseHeadland        (existing)
3. terrain / water / water-labels / surf / ships / docks / scenery / buildings / birds  (existing — these are darkened by step 4)
4. drawNightTint                 (NEW — single fillRect over the canvas)
5. drawLighthouseBeam            (existing — alpha and length boosted by nightFactor)
6. drawLighthouseWaterPool       (NEW — warm radial gradient on water + headland)
7. drawAtmosphere                (existing — moved from before-tint to after-tint)
8. drawDecorativeLights          (existing — already uses additive composite)
9. drawLighthouseFire + halo     (existing — radii + alphas boosted by nightFactor)
10. drawLighthouseBeamRim        (existing — ship illumination)
```

Anything above the tint (steps 5–10) shines through. Anything below (steps 1–3) gets darkened. Sky stays untouched because it has its own mood-aware coloring already.

### Components

#### `src/renderer/layers/night-tint.ts` (new)

```
export function drawNightTint(input: DrawPharosVilleInput): void
```

- Reads `nightFactor` from `skyState(input.motion)`.
- Early return when `nightFactor <= 0`.
- Fills the canvas with a deep-blue translucent rect: `rgba(8, 14, 28, MAX_NIGHT_DARKNESS * nightFactor)`.
- `MAX_NIGHT_DARKNESS = 0.62` (starting tunable; aimed at the B/C interpolation — between mockup B ~55% and mockup C ~75% — and adjusted in-browser).

That's the entire pass. Single `fillRect`, no offscreen canvas.

#### `src/renderer/layers/lighthouse.ts` (modified)

Three existing functions take a `nightFactor` parameter (passed by `world-canvas.ts` after computing `skyState` once per frame):

- `drawLighthouseFire` — ellipse and arc radii multiplied by `1 + HALO_NIGHT_BOOST * nightFactor`; `globalAlpha` multiplied by `1 + 0.25 * nightFactor` (clamped to ≤ 1).
- `drawLighthouseBeam` — pulse alpha multiplied by `1 + BEAM_NIGHT_ALPHA_MULT * nightFactor`; wedge length factors (the `250`/`168`/`228`/`154` magnitudes) multiplied by `1 + BEAM_NIGHT_LENGTH_MULT * nightFactor`.
- `drawHearthEmbers` — unchanged (the existing flicker is enough; further amplification would distract).

One new function:

```
export function drawLighthouseWaterPool(
  input: DrawPharosVilleInput,
  cached?: LighthouseRenderState,
): void
```

- Reads `nightFactor` and returns early when `nightFactor <= 0`.
- Centers a radial gradient slightly below `firePoint` so it covers the island base and a ring of nearby water.
- Outer radius: `WATER_POOL_RADIUS * camera.zoom`.
- Alpha at center: `WATER_POOL_MAX_ALPHA * nightFactor`. Drops to 0 at the rim.
- Drawn with default `source-over` (warming, not over-saturating).

Constants in `lighthouse.ts`:

```
HALO_NIGHT_BOOST = 0.5
BEAM_NIGHT_ALPHA_MULT = 1.5
BEAM_NIGHT_LENGTH_MULT = 0.3
WATER_POOL_RADIUS = 280       // sprite units
WATER_POOL_MAX_ALPHA = 0.35
```

#### `src/renderer/layers/sky.ts` (modified)

`skyState` rewritten to read `motion.wallClockHour` and emit `nightFactor`. Existing 4-mood discrete return preserved for `drawSky` callers that depend on it. The `motion.reducedMotion ? 0.58 : ...` override is removed — reduced-motion now reflects the user's actual wall clock too. Per-frame animation suppression for reduced-motion (twinkle, wind drift, beam pulse) is unchanged; only the mood selection becomes wall-clock-driven.

#### `src/renderer/render-types.ts` (modified)

`PharosVilleCanvasMotion` gains `wallClockHour: number`. Required field — populated in `pharosville-world.tsx` and in every test fixture.

#### `src/pharosville-world.tsx` (modified)

In the rAF loop where `timeSeconds` is computed, also compute and set `wallClockHour` from `new Date()`. ~3 lines.

### Smoothing

- **`nightFactor`**: linear interpolation across dawn and dusk windows. Continuous and monotone within each window.
- **Sky mood (`top`/`horizon`/`lower` colors)**: hard switches at 05:00, 07:00, 18:00, 20:00. Accepted — see Non-goals.

A user sitting through 19:59 → 20:00 will see a small color snap in the sky gradient. The world tint and lighthouse boost will be at `nightFactor ≈ 0.97` either side of that snap, so the perceptually dominant change (the world going dark and the lighthouse popping) is smooth. The sky-color snap is an isolated, brief artifact that we'll only escalate to mood-blending (Approach B2) if it reads as broken in practice.

## Data flow

```
new Date() (in pharosville-world.tsx, once per frame)
    ↓
motion.wallClockHour
    ↓
skyState(motion) → { mood, progress, nightFactor }
    ↓                    ↓                  ↓
drawSky          drawSky/sun/moon      drawNightTint, lighthouse boost,
(mood colors)    (progress arc)        water pool
```

`skyState` is called once per frame and the result is passed (or recomputed cheaply) to each consumer. Existing callers in `sky.ts` and `ambient.ts` continue to work because the return type is a superset of today's.

## Error handling

- `motion.wallClockHour` out of [0, 24): clamp via `((h % 24) + 24) % 24`. No throw — defensive against future weirdness, but the production callsite always produces a valid value.
- `skyState` is pure. No I/O, no timers, no DOM.
- `drawNightTint` early-returns when `nightFactor <= 0` so the daytime hot path takes no extra work.
- `drawLighthouseWaterPool` same early return when `nightFactor <= 0`.
- No new asset loads, no new network calls.

## Testing

### Unit tests — new file `src/renderer/layers/sky.test.ts`

- `nightFactor` is 0 at noon (12.0).
- `nightFactor` is 1 at midnight (0.0 and 24.0).
- `nightFactor` is 0.5 at 19:00 (mid-dusk) and 06:00 (mid-dawn).
- `nightFactor` is 1.0 at 20:00 and 05:00 boundaries (hold values, not transitions).
- Mood selection: dawn at 06:00, day at 12:00, dusk at 19:00, night at 22:00.
- `wallClockHour` clamping: -1 → 23; 25 → 1; 48.5 → 0.5.

### Unit tests — `src/renderer/layers/lighthouse.test.ts` (extend existing if present, otherwise new)

- `drawLighthouseWaterPool` early-returns when `nightFactor === 0` (mock canvas, assert no `fill` calls).
- Beam length scales with `nightFactor`.

### Visual tests — `tests/visual/pharosville.spec.ts`

- All existing tests pinned to `wallClockHour: 12` (clear day).
- New: `wallClockHour: 19` (dusk transition) — captures `nightFactor ≈ 0.5` halfway through the dusk band.
- New: `wallClockHour: 22` (deep night) — `nightFactor === 1`, full darkness + lighthouse pool + boosted beams.

Baselines re-baked after manual review of the diffs. The CLAUDE.md "inspect screenshot diffs before updating baselines" rule applies. This is the same workflow used for recent commits (`56c2953 Re-bake visual baselines for limestone island and precision seawall`).

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

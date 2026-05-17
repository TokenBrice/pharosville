# PharosVille Atmosphere / Zones / Motion / Detail Sweep

Date: 2026-05-03
Author: planning agent (synthesis of five parallel diagnostic explorers)
Status: proposal — not yet authorized for implementation

## Purpose

Evaluate improvement opportunities across five domains and rank them as a unified
implementation sequence:

1. Atmosphere & lighting (sky, lighthouse, night tint, weather)
2. Sea zone themes (palette, water textures, shoreline)
3. Ship pathing & motion (routes, smoothing, formations)
4. Animation & visual cues (titans, harbor life, props)
5. In-world details & chrome (plaques, dock clutter, scatter)

Diagnostics were produced by five parallel explorer agents; the per-domain notes
are summarized inline. Do not treat individual line numbers as load-bearing —
re-read source before editing.

---

## Diagnostic summary by domain

### Atmosphere
- **Implemented well:** day/night cycle (`sky.ts` 7-level mood), lighthouse
  sweep beam + god-rays + brazier flame + heat shimmer + smoke wisp
  (`lighthouse.ts`), bioluminescent sparkles + moon reflection + sea-mist
  patches + village lamps + bird flocks (`ambient.ts`), night tint + radial
  vignette (`night-tint.ts`).
- **Bug surfaced:** atmospheric mist ellipse desaturates the warm water pool at
  night (`ambient.ts:118-131`). 1-line gate fix.
- **Gap (highest-impact):** zero coupling between renderer and DEWS threat
  bands. Danger Strait, Warning Shoals, and CRISIS-band ships look identical
  to Calm. Cloud opacity, fog density, wind drift, and lightning are all
  static or absent.
- **Smaller gaps:** moon reflection competes with fire pool at wide zoom;
  bioluminescent sparkles wash to white inside warm halo; no time-of-day
  temperature grade beyond mood transitions.

### Sea zone themes
- **Implemented well:** centralized `ZONE_THEMES` in `palette.ts` with palette
  + texture + label + motion scalars per zone. `palette.test.ts` enforces
  hex-distance separation and exhaustiveness. Procedural textures in
  `terrain.ts` are well-differentiated (calm rings → watch dashes → alert
  chevrons → warning shoals → storm zigzags → ledger rules).
- **Gap:** Deep & Harbor zones default to motion (1.0, 1.0) — they read like
  generic Alert. Deep accent alpha 0.10 reads as absent rather than deep.
- **Gap:** Danger (#091a30) and Deep (#06131d) collide on the eastern corner;
  research already flagged but not patched.
- **Gap:** `shoreline.ts` reads the legacy `waterTerrainStyle` API — it never
  picks up `ZONE_THEMES.motion` scalars, so coastal motifs ignore zone tuning.
- **Smaller gaps:** Warning olive (#3d4332) reads muddy at distance; ledger
  asymmetry undocumented; generic-water fallback intentionally sparse.

### Ship pathing & motion
- **Implemented well:** deterministic, squad-aware, zone-sensitive routes with
  cached A\* paths, Chaikin smoothing, dock-stop schedules, lane offsets, and
  per-zone wake / drift / dwell tuning.
- **Gap (highest-impact):** heading snaps at every A\* waypoint vertex —
  ships visibly twitch on coast bends. Low-pass smoothing was scoped in
  `2026-05-01-ship-motion-liveliness-plan.md` but is not yet wired in.
- **Gap:** lane offset is perpendicular to the underlying straight heading,
  so ships "crab" sideways through the S-curve instead of steering into it.
- **Gap:** A\* is 4-connected; long open-water transits look like staircases
  unless detour waypoints are injected.
- **Gap:** moored ships sweep a full Lissajous (including pointing into the
  pier); dock-tangent anchoring is sketched but unfinished.
- **Gap:** all ships in the same risk zone moor and depart in lockstep
  phases; consort formations are integer-offset frozen with no breathing.
- **Allocation gap:** transient `ShipMotionSample` objects produce ~30k/sec
  GC churn during data refreshes; in-place mutable samples were planned and
  enable several of the smoothing changes above.

### Animation & visual cues
- **Implemented well:** titans get full wake / foam / roll / sail flutter /
  lantern flicker / mooring tension; standard hulls get a single bob; harbor
  buoys bob and harbor lamps breathe; relationship markers pulse on
  selection; cemetery mist drifts.
- **Gap:** harbor-bell, dinghies, cargo stacks, barrels, crates, rope coils,
  net racks are **all static sprites**. They land as photographs in an
  otherwise breathing scene.
- **Gap:** no banner/pennant snap on squad chrome; pennants are static
  catenary curves.
- **Gap:** Yggdrasil canopy is static — no leaf rustle, no root pulse tied
  to stability index.
- **Gap:** no ambient fauna (seabirds beyond bird flock orbits, no crane
  motion), no chimney smoke, no candle flicker on grave centerpieces, no
  steam from titans.
- **Gap:** sundial silhouette never rotates with `wallClockHour`.
- **Risk:** several animation sites do not check `motion.reducedMotion`
  before computing oscillators — a reduced-motion audit is overdue.

### In-world details & chrome
- **Implemented well:** 8-9 chain harbors with architecturally distinct
  dock sprites; printed water labels with rotation + outline; cemetery
  centerpiece flagship with submerged-rock field; lighthouse + Yggdrasil +
  center cluster + seawall coverage.
- **Gap:** **zero printed land labels.** Lighthouse, Observatory citadel,
  Cemetery Terrace, and Civic Plaza are all anonymous on canvas.
  Accessibility ledger lists water labels but no land landmark labels.
- **Gap:** dock pads are procedural diamonds with no scatter beneath. ~250
  walkway tiles across all docks have no barrel, rope coil, bollard, or
  crate. Docks read as floating signage rather than working harbors.
- **Gap:** civic plaza interior (~150 tiles) carries 6 trees + 3 planters.
  Reads as a lawn, not a curated public space.
- **Gap:** cemetery terrace beyond the wreck centerpiece reads flat —
  no scatter pebbles, weathered plaques, lichen, broken anchors.
- **Gap:** dock health-band flag colors and wreck cause-color pennants
  exist visually but have no DOM color-swatch legend; sighted users get
  more signal than ledger readers.
- **Manifest:** current runtime has 56 assets at the validator cap (61
  manifest-internal entries; 56 live runtime IDs). Adding props means
  bumping `maxManifestAssets` and going through the asset pipeline +
  PixelLab provenance.

---

## Cross-cutting principles

- **Zone semantics over decoration.** Improvements that make DEWS risk
  visible (atmosphere, motion, palette) outrank decorative additions.
- **Table edits before new layers.** `palette.ts` and `motion-config.ts`
  edits ship faster and safer than new draw layers; prefer them when they
  cover the same gap.
- **Animation parity.** New ambient motion must check `motion.reducedMotion`
  before scheduling oscillators.
- **Manifest discipline.** Any new prop sprite increases the cap and demands
  a PixelLab job, alpha mask, asset-validator update, and visual baseline
  refresh. Pack adds in single batches, not one-offs.
- **DOM parity.** Any new analytical visual (e.g., lightning over CRISIS)
  needs a matching detail-panel or accessibility-ledger string per the
  CURRENT.md invariant.

---

## Prioritized implementation phases

Phases group by risk and dependency, not strictly by impact ranking, so each
phase can ship and validate independently.

### Phase 0 — Quick fixes (≤ 1 day, no manifest changes)

| # | Change | Files | LOC |
|---|--------|-------|----:|
| 0.1 | Gate atmospheric mist at `nightFactor > 0.4` to stop desaturating warm pool | `src/renderer/layers/ambient.ts` | 1 |
| 0.2 | Suppress bioluminescent sparkles inside `NIGHT_WATER_POOL_RADIUS` | `src/renderer/layers/ambient.ts` | ~15 |
| 0.3 | Drop moon-reflection alpha ~25% and cool tint to stop competing with fire pool | `src/renderer/layers/ambient.ts` | ~3 |
| 0.4 | Speed-aware wake intensity (parabolic envelope `4·p·(1-p)` near endpoints) | `src/systems/motion-sampling.ts` | ~5 |
| 0.5 | `palette.ts` table edits: bump Deep accent alpha 0.10→0.16; set Harbor motion to (0.85, 0.95); shift Danger hex toward `#0a1f35`; bump Warning accent 0.30→0.35; document Ledger asymmetry inline | `src/systems/palette.ts` | ~15 |
| 0.6 | Verify `palette.test.ts` still enforces hex-distance after Danger shift; refresh visual baselines once intentional drift is reviewed | `src/systems/palette.test.ts`, `tests/visual/*` | review only |

**Why first:** all are local edits, no asset pipeline, no manifest cap change,
and they fix two visible bugs (mist desaturation, Deep/Harbor zone identity).
Validate with `npm run validate:changed` + targeted `test:visual`.

### Phase 1 — Motion smoothing (≈ 2-3 days, no manifest changes)

| # | Change | Files | Source plan |
|---|--------|-------|-------------|
| 1.1 | Heading low-pass smoothing (transit τ≈0.18s, dock-approach τ≈0.06s) against previous-frame heading; clamp dt to [0, 0.1] | `src/systems/motion-sampling.ts`, `motion-types.ts` | liveliness #4 |
| 1.2 | Lane-curve aware heading: derive heading from forward-difference of two lane-displaced points; ramp lane curve smoothly | `src/systems/motion-sampling.ts` | liveliness #6 |
| 1.3 | Cache `dockTangent` per stop at route-build time; anchor moored sway around it | `src/systems/motion-planning.ts`, `motion-sampling.ts` | liveliness #9 |
| 1.4 | Add per-consort sub-tile breathing during transit only (`sin/cos` perturbation ≤ 0.18 tile) | `src/systems/motion-sampling.ts` | liveliness #8 |
| 1.5 | Stagger mooring phase per ship: jitter `phaseSeconds` by a stable hash so fleets desynchronize at busy harbors | `src/systems/motion-planning.ts` | new |

**Why:** these are the highest-impact ship animation fixes per the diagnostic
and the previous liveliness plan, but require no new assets. Re-run
`motion.test.ts` and `npm run test:visual`.

### Phase 2 — DEWS-aware atmosphere (≈ 3-4 days, no manifest changes)

| # | Change | Files |
|---|--------|-------|
| 2.1 | Thread per-zone threat into renderer context (read `RISK_WATER_AREAS` + zone classifications already in world) | `src/renderer/world-canvas.ts`, `src/renderer/layers/ambient.ts`, `sky.ts` |
| 2.2 | Cloud opacity & cover scale with max active threat; thicker, lower clouds over Warning/Danger | `src/renderer/layers/sky.ts` |
| 2.3 | Sea-mist patches modulate density + drift speed by zone threat | `src/renderer/layers/ambient.ts` |
| 2.4 | Wind-drift multiplier on star drift, bird path, mist drift, and any pennant motion (Phase 4) | `src/renderer/layers/sky.ts`, `ambient.ts` |
| 2.5 | Lightning bursts over Danger/CRISIS: screen-space alpha flash + radial highlight at zone centroid; rate-limited and gated by reduced-motion | new `src/renderer/layers/weather.ts` |
| 2.6 | DOM parity: surface zone-threat / weather-state strings in detail panel + accessibility ledger | `src/systems/detail-model.ts`, `src/components/accessibility-ledger.tsx` |
| 2.7 | Coastal shoreline reads `ZONE_THEMES` motion scalars (replace legacy `waterTerrainStyle` lookup) | `src/renderer/layers/shoreline.ts` |

**Why:** biggest analytical-coherence win. Players currently can't read peg
risk visually — the canvas hides what the data already knows. Watch
performance: cloud and mist updates must reuse cached gradients per mood, not
rebuild per-frame.

### Phase 3 — Ambient motion pass (≈ 2-3 days, no manifest changes)

| # | Change | Files |
|---|--------|-------|
| 3.1 | Bell sway: rotate `prop.harbor-bell` ±0.08 rad at 1.4 rad/s, gated by reduced-motion | `src/renderer/layers/scenery.ts` |
| 3.2 | Dinghy bob + roll: oscillate `moored-dinghy-*` like buoys with per-tile phase offset | `src/renderer/layers/scenery.ts` |
| 3.3 | Cargo / crate / barrel micro-wobble: ±1px x-shift on tile-hashed phase (very subtle) | `src/renderer/layers/scenery.ts` |
| 3.4 | Pennant snap: animate squad-chrome pennant endpoints (sin perturbation), anchored to wind multiplier from Phase 2 | `src/renderer/layers/maker-squad-chrome.ts` |
| 3.5 | Yggdrasil canopy sway + root glow pulse tied to lighthouse band | `src/renderer/layers/yggdrasil.ts` |
| 3.6 | Sundial shadow rotation tied to `wallClockHour` | `src/renderer/layers/scenery.ts` |
| 3.7 | Reduced-motion audit: every animation site must short-circuit when `motion.reducedMotion` | all `src/renderer/layers/*.ts` (test added) |

**Why:** harbor sprites already exist; motion is pure renderer-side oscillator
math. Each change is small, but the compound effect closes the "static
photograph" feeling around the working harbors.

### Phase 4 — A\* and motion infrastructure (≈ 3-5 days, internal refactor)

| # | Change | Files | Source plan |
|---|--------|-------|-------------|
| 4.1 | Mutable in-place `ShipMotionSample`: one reusable per ship, helpers take out-parameters | `src/systems/motion-sampling.ts`, `motion-types.ts` | liveliness #3 |
| 4.2 | Reuse flagship sample across consorts (compute once per frame) | `src/systems/motion-sampling.ts`, `pharosville-world.tsx` | liveliness #2 |
| 4.3 | Cache squad formation offsets at route-build (no live lookup per frame) | `src/systems/motion-planning.ts`, `motion-sampling.ts` | liveliness #13 |
| 4.4 | 8-connected A\* with corner-cut rejection; rescale octile heuristic by min-step cost (0.72) | `src/systems/motion-water.ts` | liveliness #10 |

**Why:** unlocks larger fleets, smoother turns, and removes per-frame
allocation churn. Lower visible delta than Phase 1-3 but a foundation for
future motion work; ships afterward.

### Phase 5 — In-world labels & DOM parity (≈ 2-3 days, no new sprites)

| # | Change | Files |
|---|--------|-------|
| 5.1 | ~~Printed land plaques~~ — **DROPPED 2026-05-03 by operator** | — |
| 5.2 | Dock name plaque always-on at low priority (currently only on emphasis) | `src/renderer/layers/docks.ts` |
| 5.3 | Accessibility ledger: dock health-band color legend + wreck cause-color swatch legend | `src/components/accessibility-ledger.tsx` |
| 5.4 | Squad distress override: visual cue when consort sheltered at flagship (DOM-only today) | `src/renderer/layers/maker-squad-chrome.ts`, `src/components/accessibility-ledger.tsx` |

**Why:** closes the largest accessibility-visual parity gap and gives the
diorama narrative anchors without consuming manifest slots.

### Phase 6 — Diorama density (≈ 1-2 weeks, requires asset pipeline) — **DEFERRED 2026-05-03 by operator**

This phase requires bumping `maxManifestAssets` and PixelLab generation per
`ASSET_PIPELINE.md` and `PIXELLAB_MCP.md`. Plan as one batch to minimize
manifest-cap churn.

| # | Change | New assets | Notes |
|---|--------|-----------|-------|
| 6.1 | Harbor walkway clutter under each dock | barrel-stack, rope-coil-large, mooring-bollard, small-crate (~4) | Procedural scatter in `scenery.ts` keyed to dock tiles |
| 6.2 | Civic plaza scatter | marble-bench, well-cover, torch-sconce (~3) | Fills 150-tile plaza interior |
| 6.3 | Cemetery scatter | broken-anchor, weathered-plaque-flat, lichen-stone (~3) | Adds depth to wreck terrace |
| 6.4 | Water ephemera | foam-wake, seabird-low-flight, driftwood-log (~2-3) | Animated; render along common shipping routes |
| 6.5 | Manifest cap bump (currently 56) and `check:pharosville-assets` validator update | `public/pharosville/assets/manifest.json`, validator config | Coordinated with all of 6.1-6.4 |

**Why last:** highest cost, smallest per-tile delta. Should land only after
Phases 0-5 prove the existing diorama reads as alive.

### Deferred / explicit non-goals

- Time-of-day light-temperature grading beyond the 4-mood system (cosmetic
  polish, defer until Phase 2 atmosphere settles).
- Bank/roll into turns (`liveliness #7`) — depends on Phase 4 heading delta;
  worth revisiting only if titans look wooden afterward.
- Typed-array path geometry, numeric path keys, cross-plan path cache
  (`liveliness #11/14/15`) — performance work for a later sweep.
- Generic-water texture rework — current sparse fallback is correct by
  design; document in `VISUAL_INVARIANTS.md` instead.

---

## Validation strategy per phase

- After each phase: `npm run validate:changed`, then targeted suites:
  - Phase 0, 2, 3, 5: `npm run check:pharosville-assets`,
    `npm run check:pharosville-colors`, `npx playwright test tests/visual/pharosville.spec.ts`
  - Phase 1, 4: `npm test -- src/systems/motion`,
    `npm test -- src/renderer/layers/ships`
  - Phase 6: full asset pipeline checks plus visual baseline refresh
- Before any baseline update: inspect screenshot diffs per
  `CHANGE_CHECKLIST.md`. Update only when drift is intentional.

## Open questions

1. Which DEWS-band metadata is actually exposed to the renderer today? Phase
   2.1 needs a confirmation pass before the rest of Phase 2 lands.
2. Does the manifest cap bump for Phase 6 break any deploy-time validators
   beyond `check:pharosville-assets`?
3. Should Phase 5 land plaques use the same printed-label component as water
   labels, or get their own component for different rotation/anchoring rules?
4. Are PixelLab provenance + style-anchor changes blocked for Phase 6, or can
   this batch reuse the `2026-04-29-lighthouse-hill-v5` style anchor?

These should be settled with the operator before authorizing Phase 2 or
Phase 6 specifically.

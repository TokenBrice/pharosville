# Ship Identity Recognition — Evaluation & Plan

Date: 2026-06-09
Author: Claude (Fable 5)
Goal: every ship recognizable at a glance on the map — no hover, no click.
Evidence screenshots: `outputs/ship-identity-eval/` (current state + a live
prototype of the P1 fix).

## EXECUTION STATUS (2026-06-09, same session)

P1+P2+P5, P3, and P4 are implemented and validated; P6 deferred as planned.
Deviations from the plan as written:
- P1 and P2 were consolidated: the dyed sail emblem went directly into the
  precomposed body path (`drawShipBodyInline`) instead of landing in the
  overlay first. Cache key carries the emblem identity via the existing
  `liveryKey` slot so the deferred logo load recomposes the body.
- Brand colors ship as compact `"#primary|#secondary"` strings
  (`data/brand-colors.json`, 255 entries); the OKLab distance guard runs at
  extraction time in `scripts/pharosville/extract-brand-colors.mjs`.
  3 logos defeated extraction (dusd-standx, rwausdi-multipli,
  tbill-openeden) — they fall back to peg liveries; fixable via
  `data/brand-color-overrides.json`.
- Nameplates (`src/renderer/layers/ships/nameplates.ts`) draw as a
  fleet-wide pass in `drawPharosVille` after squad chrome, zoom-gated at
  `SHIP_NAMEPLATE_MIN_ZOOM = 1.1`, greedy overlap rejection by tier.
- Bundle budgets bumped (`scripts/bundle-budgets.mjs`) for the brand table;
  4 dense visual baselines updated after diff inspection (ship-only drift).
Final screenshots: `outputs/ship-identity-eval/final-{default,mid,near}.png`.

## 1. Diagnosis — why ships look the same

Fleet composition: ~120 ships. 12 titan sprites (`TITAN_SHIPS`,
`src/systems/ship-visuals.ts:42`) and 6 heritage uniques get bespoke painted
art. **Everything else (~85% of the fleet) shares 5 class hull sprites**
(hull = governance class, `resolveShipClass`), differentiated only by livery.
Four compounding problems:

### 1a. The logo regression (root cause)

Commit `6f29949` ("dye logo emblems into generic-hull sails") painted each
issuer's logo into the recolored mainsail of standard hulls — the biggest
identity surface a ship has. Commit `084a71c` ("Enrich ship identity chrome",
2026-05-17) **replaced** that branch for standard sprites with:

- a mast pennant with the symbol's first 3 chars at **0.52 alpha**, ~6 px
  (`drawMastPennantChrome`, `src/renderer/layers/ships/sail.ts:125`) —
  illegible even at 200% zoom;
- a bowsprit logo mark of ~8 px, **only for regional/major/flagship tiers**
  (`shouldDrawBowspritLogoMark`, `sail.ts:84`).

The branch order in `drawShipOverlay` (`draw-ship.ts:1064`) means
`if (standardSprite)` wins and `drawDyedSailEmblem` is now dead code for the
population it was built for (it only fires for titan emblem overrides, i.e.
USDT's kraken). Net effect: **327 logos load for every ship
(`use-asset-loading-pipeline.ts:130`) and are displayed on essentially none
of the standard fleet.**

Prototype check (this eval): re-adding the `drawDyedSailEmblem` call to the
standard branch immediately puts readable logo emblems on sails
(`outputs/ship-identity-eval/proto-tight.png` — gold hex emblem) with zero
new infrastructure: `SHIP_SAIL_TINT_MASKS` covers all 5 standard hulls and
the silhouette sprite cache + fold shading already exist.

### 1b. Color space collapse

Only ~35 coins have hand-tuned liveries (`STABLECOIN_SAIL_COLORS`,
`src/systems/stablecoin-ship-branding.ts:15`). Everything else gets
`derivedFallbackLivery`: a per-peg pastel base mixed 28–56% toward one of 8
fixed accents. Since most coins are USD-pegged, most of the fleet converges
on near-identical sage/off-white sails — confirmed visually at every zoom.
Brand colors are never consulted, even though every ship has a logo file to
extract them from.

### 1c. Identity chrome is LOD-budgeted away

All identity cues (pennant, bowsprit, emblem) live in the **overlay pass**,
capped at `SHIP_OVERLAY_BUDGET_RATIO = 0.64` of visible ships — and 15–50%
under interaction/constrained/recovery tiers (`SHIP_LOD_BUDGET_MULTIPLIERS`,
`draw-ship.ts:196`). So even the weak cues that exist vanish on a third or
more of the fleet exactly when the user is panning around looking for a ship.

### 1d. No text channel

Heritage nameplates (`drawHeritageNameplate`, zoom ≥ 0.7) exist for 6 ships
only. Standard ships have no readable symbol anywhere on canvas.

## 2. Recognition budget — what "recognizable" can mean per zoom

A standard hull is ~25–40 px on screen at the default fit zoom (~0.4) and
~80–140 px at zoom 1.5–2.5. Set explicit, testable targets per band:

| Zoom band | Identity carrier | Target |
|---|---|---|
| far (≤0.6) | sail/hull **color block** | distinguish issuer families & the big ships |
| mid (0.6–1.1) | color + **sail logo emblem** | recognize any regional+ ship outright |
| near (≥1.1) | color + emblem + **ticker nameplate** | recognize every ship, including skiffs |

Far-zoom uniqueness for 120 ships is not achievable (nor needed); the
guarantee "no hover/click needed" is delivered by mid/near bands plus search.

## 3. Plan (ranked by impact ÷ effort)

### P1 — Restore the dyed sail-logo emblem on standard hulls (S) ✅ prototyped

Re-add `drawDyedSailEmblem` to the `standardSprite` branch of
`drawShipOverlay` (keep pennant + bowsprit). Tuning while in there:
- raise emblem presence: alpha 0.88 → ~0.95, fold-shading floor 0.55 → 0.7
  (`bakeSailFoldShading`, `sail.ts:594`);
- raise `SAIL_EMBLEM_SPRITE_CACHE_MAX` 128 → 256 (cardinality grows from
  ~10 liveries to ~120 ships × zoom buckets);
- check why 084a71c removed it (visual review notes); if the objection was
  pale-logo-on-pale-sail, P3 fixes the substrate.
- Files: `draw-ship.ts`, `sail.ts`. Verify: visual snapshots (intentional
  broad drift — follow `VISUAL_REGEN.md`), emblem cache hit-rate via
  `__pharosVilleDebug.sailCacheStats`.

### P2 — Make identity always-on: bake it into the ship body cache (S–M)

Identity must not be LOD-budgeted. Move sail tint + emblem from the overlay
pass into `drawShipBodyInline` / the precomposed ship-body canvas — the body
cache is already keyed per ship (`buildShipBodyCacheKey` includes `shipId`),
so a baked emblem costs zero extra per frame and survives constrained tiers.
Overlay keeps transient chrome only (selection, hover, signals, weathering,
lantern). Include the body-cache key version bump so stale composites drop.
- Files: `draw-ship.ts`, `ship-body-cache.ts`. Verify: perf baselines
  (`sustained-motion.spec.ts`), emblem visible on 100% of ships under
  `constrained` tier in a dense fixture.

### P3 — Brand-color-first liveries (M)

Replace the peg-pastel fallback with brand-derived liveries:
- Build-time script (`scripts/pharosville/extract-brand-colors.mjs`) extracts
  dominant + secondary color from each `public/logos/*` file into a generated
  `data/brand-colors.json` (checked in, deterministic).
- `derivedFallbackLivery` becomes brand-first: brand hue drives sail cloth /
  sail panel / pennant / trim; peg identity moves to a small, consistent cue
  (e.g. stripe pattern already encodes some of this).
- Enforce minimum perceptual distance (OKLab) between liveries within the
  same risk zone / dock neighborhood; deterministic tie-break nudges
  lightness, never hue.
- Saturate regional+ sails toward full brand cloth (titans already prove
  dark/saturated cloth works — USDT black, BUIDL charcoal); skiffs/micros can
  stay pastel + strong trim.
- Hand-tuned `STABLECOIN_SAIL_COLORS` entries remain as overrides.
- Files: new script, `stablecoin-ship-branding.ts`. Verify: a fleet-lineup
  fixture rendering all ships side by side (also becomes a permanent visual
  baseline + the asset for legend/docs); `npm run check:pharosville-colors`.

### P4 — Ticker nameplates at near zoom (M)

Generalize the heritage nameplate: zoom-gated (≥ ~1.1) ticker label per ship,
cached as tiny text sprites, density-capped per viewport cell to avoid label
soup (selected/hovered/titan always win). This is the hard guarantee that
**every** ship — including the 40 near-identical USD skiffs — is identifiable
without hover. Must stay out of the canvas-only-meaning trap: it duplicates
the symbol already in detail panel/ledger, so no parity work needed.
- Files: `sail.ts` or new `nameplates.ts`, zoom gate helper (coordinate with
  upgrade-plan item 2.7's centralized zoom gates). Verify: visual snapshot at
  zoom 1.5 dense fixture; hit-testing unaffected; perf at near zoom.

### P5 — Emblem & pennant legibility pass (S)

- Enlarge `SHIP_SAIL_MARKS` boxes for the 5 standard hulls (~15×18 → as large
  as the painted sail allows).
- Pennant text alpha 0.52 → ≥0.8; pennant fill stays brand primary (after P3
  this becomes a real far-zoom color cue, like real signal flags).
- Bowsprit mark: extend to `local` tier or drop in favor of the sail emblem.

### P6 — Silhouette variation (L, later, optional)

Procedural per-issuer flourishes (figurehead variants, sail-count trims) for
the top ~20 non-titan ships. Weakest channel for 120 entities — only worth it
after color + emblem + nameplate land and if confusion remains.

## 4. Sequencing & interactions

1. **P1 + P5** in one PR (small, same files) → immediate, biggest win.
2. **P2** (always-on identity) — also a small perf win (overlay pass shrinks).
3. **P3** (brand colors) — largest visual-baseline churn; regen once.
4. **P4** (nameplates) — after 2.7-style zoom-gate helper exists.
5. Re-evaluate P6.

Ties to existing backlog: Wave 6 identity pass (painted emblems) continues to
cover titans/uniques; upgrade-plan 1.5 (search) and 1.3 (tooltips) are
complements, not substitutes — this plan is about pre-attentive recognition.
Item 2.7 (progressive disclosure) must treat identity cues as the *last*
thing to simplify at far zoom, not the first.

## 5. Constraints & risks

- **Manifest cap (75)**: everything here is procedural (logos load outside
  the sprite manifest) — no new manifest entries needed.
- **Visual baselines**: P1/P3 shift nearly every ship pixel — regen per
  `VISUAL_REGEN.md`, inspect diffs deliberately.
- **Perf**: emblem sprites and body-cache composites are cached; watch
  cache cardinality (raise emblem LRU cap) and body-cache warmup budget with
  120 distinct bodies. Reduced-motion path must stay deterministic (emblem
  baking is static — safe).
- **Why was the emblem removed in 084a71c?** Unknown from the log. If it was
  an aesthetic call, P3's higher-contrast substrate changes the calculus;
  confirm with the operator before shipping P1 broadly.
- **Brand color extraction quality**: some logos are white-on-transparent or
  multi-color; the extractor needs a luminance/saturation filter and a manual
  override column in the generated JSON.

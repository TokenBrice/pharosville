# PharosVille Visual Upgrade — Effort × Reward Implementation Plan

Date: 2026-06-10

## Goal

A coordinated visual upgrade across three pillars, ranked by effort vs reward:

1. **Ships** — more interesting, diversified, recognizable.
2. **Sea & atmosphere** — more alive.
3. **Performance** — PharosVille should feel seamless.

This plan was produced from a broad exploration of the renderer, systems,
asset pipeline, prior plan history (recovered from git: the wow-revamp
council plan, ship-identity recognition plan, upgrade follow-up, Wave 6 prep,
P4 specs), and live screenshots.

## Scope

- In scope: renderer layers, ship/water/sky visual systems, PixelLab sprite
  campaigns, render-loop performance, manifest/asset pipeline work.
- Out of scope: new API contracts (cargo deck / attestation pennants stay
  blocked on the endpoint-allowlist operator decision in the recovered P4
  specs), minimap (already specced separately), audio (decided LATER),
  anything violating the Decided NOTs reaffirmed below.

## Grounding — current state evidence

- Live fleet: ~201 ships (123 docked) on a 56×56, ~86% water map.
- Captured frames at 141%/240% zoom show **2–4 fps in the footer counter**
  (`outputs/f5-caustics-default-view.png`, `outputs/f5-caustics-zoomed-evm-bay.png`).
  Captures were taken under automation load, so treat as a ceiling indicator,
  not a precise measurement — but the CI dense-fixture draw budget of
  **median ≤ 140ms / p95 ≤ 200ms** (`tests/perf/sustained-motion.spec.ts`)
  confirms dense-scene draw cost is the real bottleneck. The spec's own
  comment records the tightening goal: **median → 100ms, p95 → 140ms**.
- Ship identity P1–P5 already landed (brand-color liveries, dyed sail
  emblems, ticker nameplates ≥ 1.1 zoom, legibility pass). P6 silhouette
  variation was explicitly deferred — it is picked up here.
- Sea already has: per-zone procedural textures from `ZONE_THEMES`, harbor
  surf, dock caustics, lighthouse beam + god rays, threat-aware clouds/mist/
  lightning, birds, bioluminescence, 6 sky moods, night lighting. What it
  lacks is large-scale motion coherence (swell), edge/horizon treatment, and
  beam–world interaction.

## Constraints (hard rails — do not relitigate silently)

- Manifest: **73/75 entries used; 2 slots free**
  (`scripts/pharosville/validate-assets.mjs` is the source of truth).
- Heritage hull tier: ~7 max (currently 6). Adding FRAX + GHO makes 8 —
  needs operator sign-off or pick one.
- Motion policy: one route-owned RAF clock; speed classes + cue caps per
  `docs/pharosville/MOTION_POLICY.md`; every analytical cue needs
  detail/ledger parity; reduced motion = deterministic static frame, no RAF.
- Static-layer cache: terrain + scene passes are baked
  (`drawStaticPassCached` in `src/renderer/world-canvas.ts`). Anything that
  animates must live in a per-frame pass and respect scheduler tiers
  (`full | interaction | recovery | constrained`).
- Zone water colors are analytical semantics — style around them, never
  repaint them (`ZONE_THEMES` in `src/systems/palette.ts`).
- Decided NOTs still in force: no dirty-rect rendering, no sprite-atlas /
  OffscreenCanvas-worker / WebGL migration (revisit only via the decision
  memo below), no ambient non-data ships, no tidal animation, no new npm
  deps, no bloom/CSS filters on canvas.

## Effort × Reward matrix

Effort: S < 1 day, M 1–3 days, L 3–7 days, XL multi-session campaign.
Reward: ★ (nice) → ★★★★★ (transforms the product feel).

| # | Item | Pillar | Effort | Reward | Ratio |
|---|------|--------|:------:|:------:|:-----:|
| V1.1 | Per-pass render instrumentation | Perf | S | ★★★★ (enabler) | Best |
| V1.2 | Batched asset-load cache invalidation | Perf | S | ★★★ | Best |
| V1.3 | Horizon & world-edge atmosphere | Sea | M | ★★★★★ | Best |
| V1.4 | Hull chrome for standard + heritage tiers | Ships | S | ★★★★ | Best |
| V1.5 | Nameplate sprite caching | Perf | S–M | ★★★ | Good |
| V2.1 | Swell field — coherent crossing wave fronts | Sea | M | ★★★★★ | Best |
| V2.2 | Lighthouse beam sweeps ships & water | Sea | M | ★★★★ | Good |
| V2.3 | Persistent foam wake trails | Sea/Ships | M | ★★★ | Good |
| V2.4 | Threat-aware sky staging + Danger squall | Sea | S–M | ★★★ | Good |
| V2.5 | Harbor ambient polish (lanterns, gull dives) | Sea | S–M | ★★★ | Good |
| V3.1 | Titan multi-pose sprite sets (turning ships) | Ships | XL | ★★★★★ | Ambitious |
| V3.2 | Standard-hull silhouette variants (P6) | Ships | L | ★★★★ | Ambitious |
| V3.3 | Heading-driven sail trim & billow | Ships | M | ★★★ | Good |
| V3.4 | Wave 6 asset completion (heritage, regens, WebP) | Ships | M–L | ★★★ | Good |
| V3.5 | Risk-zone hull weathering | Ships | S–M | ★★ | OK |
| V4.1 | Dense-scene frame-budget program | Perf | M–L | ★★★★★ | Best |
| V4.2 | Ship-body cache & pose-cardinality tuning | Perf | M | ★★★ | Good |
| V4.3 | Decision memo: rendering substrate revisit | Perf | S (memo) | enabler | — |

Recommended execution order: **V1 (foundations) → V2 (sea) → V4.1 (perf
program, informed by V1.1 data) → V3 (ship campaigns)**. V3.1's sprite
campaign can start in parallel early since PixelLab jobs have long lead time.

---

## Phase V1 — Foundations & quick wins

### V1.1 Per-pass render instrumentation — Effort S, Reward ★★★★ (enabler)

Only `waterAccentDrawMs` is instrumented today (`src/renderer/render-types.ts`).
Dense-scene draw cost is unattributed, so every perf decision below is a guess
until this lands. Do this first.

- [x] Extend `PharosVilleRenderMetrics` with `skyDrawMs`, `staticBlitDrawMs`,
      `entityPassDrawMs`, `nameplateDrawMs`, `nameplateDrawCount`,
      `ambientDrawMs`, `selectionChromeDrawMs` (draw counts already covered by
      `drawableCounts` + `visibleShipCount`).
- [x] Wire timers in `drawPharosVille` (`src/renderer/world-canvas.ts`) around
      the existing pass boundaries; expose via `window.__pharosVilleDebug`.
- [x] Capture a before-baseline on the dense fixture and record the pass
      breakdown in this file (table below this task when measured).
- [x] Presence guard + breakdown logging in `tests/perf/sustained-motion.spec.ts`.
- Risk: timer overhead — use coarse `performance.now()` pairs per pass, not
  per entity.

**Measured baseline (2026-06-10, local dev machine, dense fixture, 5s
sustained, ~5ms median draw):** entity pass **2.01ms (~62%)**, water accents
0.86ms (~26%), ambient 0.25ms, sky 0.11ms, staticBlit 0.01ms, selection
0.01ms, nameplates 0 (default fit zoom 0.88 < 1.1 gate). Entity pass is the
V4.1 priority target; CI 4-vCPU scales these ~25-30× but proportions hold.

### V1.2 Batched asset-load cache invalidation — Effort S, Reward ★★★

Every deferred sprite arrival bumps the asset tick and invalidates both
static caches (~40 full offscreen repaints during the first minute).

- [x] `getAssetLoadProgressKey()` now quantizes the in-flight deferred count
      into `PHAROSVILLE_DEFERRED_PROGRESS_BATCH = 8` buckets and restores the
      exact count once `areDeferredAssetsSettled()` — ~40 trickle decodes now
      cost ≤ 6 static-cache clears instead of one each.
- [x] Critical-phase behavior unchanged (exact per-asset progress; those
      sprites gate the first visible frame).
- [x] Verified: `asset-manager.test.ts` batch-boundary test (keys move only
      at 0 → 8 → exact-on-settle for an 11-asset group); full renderer+hooks
      unit lanes green.

### V1.3 Horizon & world-edge atmosphere — Effort M, Reward ★★★★★

Highest reward-per-effort visual item. Today the world diamond ends abruptly
against a flat gradient (clearly visible in the evidence screenshots). A
horizon treatment makes the diorama read as a sea, not a game board — and it
is fully static, so it bakes into cached passes for **zero per-frame cost**.

- [x] World-rim haze (`src/renderer/layers/world-rim-haze.ts`): four soft
      mood-tinted bands stroked along the projected map-diamond rim, drawn
      before the entity pass so edge-zone ships stay crisp. Pure function of
      (map, camera, mood) — reduced motion renders the identical frame.
      Chosen over a static-pass bake so it can follow the sky mood without
      staling the terrain cache (cost: 4 strokes/frame).
- [x] Horizon band in the sky backdrop: 5-silhouette distant cloud bank +
      sea-meets-sky line at the water-veil boundary, mood/night-scaled,
      baked into the cached sky backdrop (zero per-frame cost).
- [x] Bonus in-scope fix: `drawSkyClouds` now strokes layered top-arc humps
      instead of full ellipse outlines, which read as wireframe rings
      against the open horizon at far zoom.
- [ ] (Deferred to V2.2) warm beam glint on the horizon when the sweep
      points off-map — folds naturally into the beam-interaction work.
- [x] Reduced motion: identical static composition (tested).
- [x] Verified: 3 new rim-haze tests; sky/cinematic suites green; visual
      lane 20/20 within tolerances (no regen needed); far-zoom eyeball
      `outputs/visual-upgrade/v13-far.png`.

### V1.4 Hull chrome for standard + heritage tiers — Effort S, Reward ★★★★

Titans get hull foam, bow spray, stern churn, mooring rope/fender
(`src/renderer/layers/ships/wake.ts`); standard hulls get only a contact
shadow and heritage hulls get nothing. The fleet's 85% reads as flat decals.

- [x] `HULL_CHROME_TIERS` in `wake.ts`: standard (0.68× geometry, foam only,
      1 spray strand), unique (0.85×, foam + mooring details, 2 strands),
      titan (unchanged). Stern churn stays titan+unique.
- [x] Cached unit-scale Path2D templates are shared across tiers — the tier
      factor rides ctx.scale, so zero path-cache cardinality growth.
- [x] LOD-bounded by construction (wake-underlay only draws for
      `planShipRenderLod().drawWakeShipIds`); standard hulls additionally
      gate at `SHIP_CHROME_MIN_ZOOM` so far zoom stays clean.
- [x] Verified: 4 new tier tests in `ships.test.ts` (51 green); full visual
      lane 20/20 within existing tolerances (no baseline regen needed);
      mid-zoom eyeball check `outputs/visual-upgrade/v14-mid.png`.

### V1.5 Nameplate sprite caching — Effort S–M, Reward ★★★

`drawShipNameplates` (`src/renderer/layers/ships/nameplates.ts`) measures and
fills text for every visible ship every frame at zoom ≥ 1.1 — up to ~200
`measureText`+`fillText` calls per frame exactly when zoomed-in scenes are
heaviest.

- [x] Plates pre-render once per `(symbol, fontPx, dprBucket)` into padded
      offscreen sprites (LRU 256, `plateSpriteCacheStats()` telemetry) and
      blit via one drawImage; jsdom/no-2D environments keep the original
      direct path as fallback.
- [x] Greedy overlap rejection untouched (rect-based, sprite-agnostic).
- [x] Verified: 6 nameplate tests including sprite-blit + fallback cases;
      visual lane 20/20; live check at dpr 2 — 55 plates in ~0.3ms
      (`outputs/visual-upgrade/v15-nameplates.png`, crisp).

---

## Phase V2 — The sea comes alive

### V2.1 Swell field — coherent crossing wave fronts — Effort M, Reward ★★★★★

The single best "alive" upgrade. Current water accents are per-tile sparse
marks from a precomputed candidate list (`waterAccentCandidatesForMap` in
`src/renderer/layers/terrain.ts`) — correct but visually incoherent: the sea
never moves *as a body of water*.

- [ ] Add a zone-aware swell pass: 2–3 long, slow wave fronts per visible
      water region that drift across many tiles (single batched Path2D
      stroke per front per frame — not per tile), amplitude/speed scaled by
      `ZONE_THEMES` motion scalars and the sea-state wind multiplier.
- [ ] Phase is a pure function of (tile, time) — deterministic, no state.
- [ ] Keep zone base colors untouched; fronts are translucent highlights
      using each zone's existing `wave`/accent colors.
- [ ] Scheduler: join the `water-accents` shed group (constrained sheds,
      recovery keeps); reduced motion freezes time-zero like dock caustics.
- [ ] Danger/storm zones get steeper, shorter fronts; Calm gets long lazy
      ones — reinforcing existing zone semantics without new meaning.
- [ ] Verify: motion visual lane; `waterAccentDrawMs` stays within budget
      (batched strokes should add ≤ 1–2ms); MOTION_POLICY.md Slow class note.

### V2.2 Lighthouse beam sweeps ships & water — Effort M, Reward ★★★★

Completes the "lighthouse touches the sea" theme: today the beam washes tiles
but ignores entities.

- [ ] When the sweep arc crosses a ship, apply a brief warm rim-light pulse
      (translucent overlay in `draw-ship.ts`, alpha from beam-angle distance,
      reusing `computeBeamCausticState`).
- [ ] A faint glitter trail on water tiles just behind the sweep edge
      (slow class, capped to the existing beam-caustic tile set).
- [ ] Reduced motion: beam angle is already frozen — apply the static
      rim-light only to ships inside the frozen arc (deterministic).
- [ ] No analytical meaning (beam = PSI band already documented; the rim is
      flavor attached to an existing cue) — no parity work needed, confirm
      via `visual-cue-registry.ts` note.
- Risk: per-ship overlay cost in dense scenes — gate behind overlay LOD
  budget; profile with V1.1 metrics.

### V2.3 Persistent foam wake trails — Effort M, Reward ★★★

Queued in the recovered upgrade plan as "wake trail upgrade (hot path —
profile)". Fast speed class → capped to selected / top-supply / recent-mover
ships per MOTION_POLICY.

- [ ] Ring buffer of recent stern positions per eligible ship (≤ 5 ships,
      ~60 samples) in the render-loop frame state; render a tapering,
      fading polyline in `wake.ts` using the zone wave color.
- [ ] Deterministic fallback: reduced motion renders no trail (matches
      current wake behavior).
- [ ] Profile before/after with V1.1; abort if entity pass regresses.

### V2.4 Threat-aware sky staging + Danger squall — Effort S–M, Reward ★★★

Clouds, mist, stars, and lightning are already threat-aware — the sky
gradient itself is not. Extend the existing channel (precedent set, no new
semantics class).

- [ ] Modulate sky mood colors by max active DEWS threat (subtle: ≤ 15%
      darkening + cool shift at WARNING+, in `sky.ts` mood resolution).
- [ ] A drifting rain-squall curtain over Danger Strait while any ship holds
      DANGER placement (slow class, localized, joins the weather pass next
      to the existing lightning).
- [ ] Document in `VISUAL_INVARIANTS.md` (sky/threat channel) — the ledger
      already exposes per-ship risk zones; add a legend note for the squall.
- [ ] Reduced motion: static squall texture, frozen drift.

### V2.5 Harbor ambient polish — Effort S–M, Reward ★★★

- [ ] Dock lanterns: 1–2 per rendered dock joining the fixed civic lantern
      list (`drawDecorativeLights`), with per-lantern deterministic flicker
      phase; respects the existing bounded-set cap and debug exposure.
- [ ] Gull harbor dives: extend 2 of the 9 existing orbit gulls with an
      occasional dive arc over the busiest harbor (pure function of time,
      stays inside the capped bird set).
- [ ] Awning/flag micro-sway on dock sprites at near zoom (slow class,
      zoom-gated by `SHIP_DETAIL_REVEAL_ZOOM`-style constant in
      `visual-scales.ts`).
- All flavor-only: no detail-panel attachment (decided NOT), no new sets.

---

## Phase V3 — Ship identity: the ambitious bets

### V3.1 Titan multi-pose sprite sets — Effort XL, Reward ★★★★★

The queued W2.14 completion from the recovered wow plan §11, and the most
ambitious ship upgrade available: ships that visibly **turn**. Today all
sprites are single-facing; titans fake heading with ±0.035 skew and 5 pose
buckets; standard hulls just X-flip.

- [ ] PixelLab campaign: per titan, 4 directional variants (E, NE, N, NW) +
      existing neutral; mirror for the W/SW/S/SE half. 12 titans × 4 new
      poses. Run the USDT canary first (Wave 6 §4.1 precedent) to validate
      style consistency and WebP encoding before the batch.
- [ ] Pack poses as added frame columns in each titan's existing animation
      sheet (manifest cost **0 entries**; sheet pixel budgets must be
      re-checked against `scripts/pharosville/asset-budgets.mjs` caps).
- [ ] Renderer: `resolveShipVisualOrientation` (`draw-ship.ts`) selects pose
      column from heading octant, blending with the existing skew inside an
      octant so transitions stay smooth; keep current behavior as fallback
      for sheets without pose columns (incremental rollout per titan).
- [ ] Ship-body cache key already carries pose/orientation — verify
      cardinality with V4.2 before enabling all 12 titans.
- [ ] Reduced motion: pose from frozen heading (`dockTangent` berth heading) —
      deterministic.
- [ ] Visual baselines: titan-heavy snapshots will drift intentionally;
      regen per `VISUAL_REGEN.md`.
- Sequencing: start PixelLab jobs early (long lead time); land renderer
  support behind a per-asset capability check.

### V3.2 Standard-hull silhouette variants (ship-identity P6) — Effort L, Reward ★★★★

~85% of the fleet shares 5 class hulls. Brand liveries + emblems (landed)
fixed color identity; silhouettes are still clones.

- [ ] 2 additional hull variants per class (rig height, bow shape, stern
      castle differences), same 104×80 box and anchor so footprints/hitboxes
      hold. Pack as 3-column variant sheets replacing the 5 existing
      standard-hull entries in place — manifest cost **0 entries**.
- [ ] Deterministic variant assignment: `stableHash(shipId) % 3` in
      `shipRenderState` (`draw-ship.ts`); sail-tint masks per variant in
      `ship-sail-tint.ts` / `SHIP_SAIL_TINT_MASKS`.
- [ ] Class must stay readable: variants share each class's distinctive
      rigging silhouette (galleon vs schooner vs junk etc.) since class is
      an analytical signal (`classification-to-boat.ts`).
- [ ] Verify: class-recognition spot-check at mid zoom, hit-testing
      unchanged, sail emblem legibility on all 15 variant×class combos.

### V3.3 Heading-driven sail trim & billow — Effort M, Reward ★★★

- [ ] Procedural mainsail deformation by (heading × wind): slight billow
      skew downwind, luff flatten upwind — a 2-segment vertical shear on
      the sail-tint region in `ship-sail-tint.ts`, deterministic per
      (ship, time).
- [ ] Amplitude small enough to keep painted/dyed emblems readable
      (≤ 4–5% shear); reduced motion freezes neutral trim.
- [ ] Pairs naturally with V3.1 poses; can land independently first.

### V3.4 Wave 6 asset completion — Effort M–L, Reward ★★★

Still-open items from the recovered Wave 6 prep, updated for current state:

- [ ] FRAX + GHO heritage hulls — **fills the manifest exactly to 75/75**.
      ⚠ Heritage count goes 6 → 8, exceeding the "~7 max" decided NOT:
      **operator decision required** (pick one, or bless 8).
- [ ] Remaining titan emblem/regen passes (W6.01–W6.03 set) if any are
      still unpainted after the identity pass — re-audit first; CURRENT.md
      suggests most landed.
- [ ] Dock regens by visual-quality audit (Solana scale-up, AVAX/Base/
      Polygon/Arbitrum) — replace-in-place, 0 manifest cost.
- [ ] Dock-side ambient prop pack (W6.12) — needs cap raise decision if
      pursued after FRAX/GHO; otherwise defer.
- [ ] Full WebP migration + single atomic `cacheVersion` bump + baseline
      rebake (W6.13/W6.14 discipline).

### V3.5 Risk-zone hull weathering — Effort S–M, Reward ★★

- [ ] Subtle procedural weathering on hulls by risk zone (salt streaks /
      darkened waterline in Warning/Danger; clean in Calm) applied in the
      precomposed body path so it's cache-friendly (`liveryKey` gains a
      zone bucket).
- [ ] Parity exists: risk zone is already a detail-panel/ledger field.
      Register the cue in `visual-cue-registry.ts`.
- Risk: body-cache cardinality ×6 zones — bucket to 3 weathering levels.

---

## Phase V4 — Performance program

### V4.1 Dense-scene frame-budget program — Effort M–L, Reward ★★★★★

Goal: hit the documented tightening target — dense-fixture draw **median
≤ 100ms, p95 ≤ 140ms** (then lower the CI budgets in
`sustained-motion.spec.ts` to lock it in). Work the V1.1 data top-down;
candidate levers in expected-impact order:

- [x] Far-zoom fleet LOD: below `SHIP_CHROME_MIN_ZOOM` the LOD plan returns
      only preserve tiers (titan/unique) + selected/hovered — no candidate
      scoring, no wake/overlay drawables for the standard fleet. Probe at
      zoom 0.48 (93 ships): entity pass **1.9 → 1.5ms**. Disclosure-gate
      note: signal flags / depeg weathering / lanterns / contact shadows
      join the ≥ 0.6 inspect tier for standard hulls (parity intact).
- [ ] Water accent cadence: render the accent/swell group at half cadence
      under `recovery` (alternate frames; the eye can't tell at these
      speeds) instead of binary keep/shed.
      **Deferred until V2.1 swell lands (in flight on main)** — cadence
      should cover the combined accent+swell group; same files. Probe
      evidence: at zoom 0.48 water accents are the dominant pass (2.6ms vs
      1.5ms entity).
- [ ] Entity-pass draw-call audit: collapse per-ship save/restore pairs and
      gradient re-creation (hoist per-frame constants; reuse gradient
      objects per zone).
- [ ] Hover-only repaints: when only hover state changed (no camera/motion
      delta in reduced-motion or paused states), skip non-chrome passes.
- [x] Scheduler hysteresis tune: downshift streak 3 → 2; tier-flap guards in
      `render-scheduler.test.ts` stay green (calm frames reset the streak,
      upshift still needs 8).
- [ ] After each lever: re-run dense perf lane; record pass-time deltas in
      this file; stop when the target is met (avoid speculative churn).
      Lever-by-lever local probe numbers recorded above; CI-budget
      tightening still pending the full program.

### V4.2 Ship-body cache & pose-cardinality tuning — Effort M, Reward ★★★

Prereq for V3.1/V3.5 at scale (cache keys gain pose/weathering dimensions).

- [x] Measure live hit-rate via existing cache stats in dense scenes —
      `shipBodyCacheStats` now exposed in `renderMetrics` (debug contract);
      probe at `tests/probes/ship-body-cache.probe.spec.ts`. Dense fixture:
      99 entries steady, **99.96% hit rate, 0 evictions, 0 budget skips,
      6.5% pixel fill**; zoom adds zero new keys (keys are zoom-independent
      by design). Cardinality math: ~201 live ships + V3.1 pose columns
      (+52) ≈ 253 brushed the old 256 cap exactly when poses land →
      `DEFAULT_SHIP_BODY_CACHE_MAX_ENTRIES` raised 256 → 512 (entry cap is
      cheap; pixels stay the hard guard). Cardinality test added.
- [x] Quantize pose/zoom inputs — verified nothing to quantize today: dpr is
      hardcoded 1, logicalSize is zoom-independent, pose/orientation apply
      via ctx transforms at draw (never baked). **V3.1 must key new poses as
      octant-bucket `poseKey`** (modeled in the cardinality test), not raw
      heading.
- [x] Warmup sticky priority — covered by existing
      `ships.test.ts` "bypasses an exhausted warmup budget" test; bypass is
      unconditional on tier/selection so higher cardinality doesn't change
      it. Probe showed zero budget skips under the dense fixture.

### V4.3 Decision memo: rendering substrate revisit — Effort S (memo only)

The May 3 NO-GO on atlas/worker/WebGL predates the 201-ship fleet and the
140ms dense medians. **Not a build item.** Write a one-page memo with V1.1
pass-breakdown data answering: can Canvas 2D + the V4.1 program reach 60fps
at dense zoom, or is the ceiling structural? Present keep/revisit options to
the operator. Only revisit the NOT with explicit operator approval.

**Done (2026-06-11):** memo at
`agents/2026-06-11-v4.3-substrate-decision-memo.md`, awaiting operator
decision (recommendation: keep NO-GO). Headline evidence: dense fixture at
zoom 2.4 draws *faster* than fit zoom (3.4ms vs 4.2–4.8ms local median,
~3.5× headroom vs 60fps); the 2–4 fps captures were automation-load
artifacts. Measurement probe kept at
`tests/probes/zoom-pass-breakdown.probe.spec.ts`
(`npx playwright test --config playwright.probe.config.ts`, port 4179, not a
CI lane).

---

## Explicitly not in this plan (and why)

- Minimap, collateral cargo deck, attestation pennants — specced/blocked in
  the recovered P4 specs; cargo deck + pennants await the endpoint-allowlist
  operator decision. Separate track.
- Dirty-rect rendering, sprite atlas, OffscreenCanvas+worker, WebGL —
  decided NOTs; only the V4.3 memo may reopen them.
- Ambient non-data ships, tidal animation, kelp/wreckage props, aurora,
  particle rain, compass rose on water — decided NOTs, reaffirmed.
- Audio — decided LATER; unchanged.

## Validation

Per-phase while iterating:

- [ ] `npm run validate:changed`
- [ ] Perf work: `npx playwright test --config playwright.perf.config.ts`
- [ ] Visual work: `npm run check:pharosville-assets`,
      `npm run check:pharosville-colors`,
      `npx playwright test tests/visual/pharosville.spec.ts --grep "pharosville"`
- [ ] Motion-policy changes: update `docs/pharosville/MOTION_POLICY.md` +
      `visual-cue-registry.ts` and verify the debug contract
      (`activeMotionLoopCount`, `motionCueCounts`).
- [ ] Baseline regen only after diff inspection, dist set from the CI Docker
      image per `docs/pharosville/VISUAL_REGEN.md`.

Before claiming any phase complete, run the full AGENTS.md gate
(onboard, smoke, docs, typecheck, unit, assets, colors, build, visual).

## Handoff

- Files changed: this plan only (exploration session — no code changes).
- Risks/notes:
  - Operator decisions needed: (1) heritage count 6→8 for FRAX+GHO (V3.4),
    (2) manifest cap raise beyond 75 if the prop pack is wanted (V3.4),
    (3) substrate revisit memo outcome (V4.3).
  - V1.3 and V3.1/V3.2 cause intentional broad baseline drift — schedule
    regens once per phase, not per task.
  - PixelLab campaigns (V3.1, V3.2, V3.4) have lead time — kick off the
    USDT pose canary as soon as Phase V1 starts.
- Follow-ups: record V1.1 pass-breakdown measurements in this file; tighten
  CI perf budgets after V4.1 lands.

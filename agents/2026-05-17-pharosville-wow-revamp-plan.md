# PharosVille "Wow" Revamp — Council Plan

- Date: 2026-05-17
- Status: ACTIVE — partially implemented on `main`; this file now tracks shipped scope and remaining candidates
- Goal: push PharosVille from "impressive" into the **wow / amazing** band — visually compelling, informative, lively, useful
- Council members: Visual Director (VD), Ship Sculptor (SS), Hydrographer (HY), Harbormaster (HM), Helmsman (HL), Engineer (EN)
- Source reports:
  - `outputs/council/01-visual/report.md`
  - `outputs/council/02-ships/report.md`
  - `outputs/council/03-water/report.md`
  - `outputs/council/04-harbors/report.md`
  - `outputs/council/05-motion/report.md`
  - `outputs/council/06-engineering/report.md`

## 0. Implementation status — updated 2026-05-17 by Codex

This plan started as a proposed council roadmap. The first implementation batch has since landed on `main` in commits `4940b86` through `30569c8`, with a small pre-existing footer commit `800e184` now at HEAD before this update. The current follow-up pass implements W4.26.

Validation already run for the prior batch:

- `npm run typecheck`
- `npm test`
- `npm run check:pharosville-assets`
- `npm run check:pharosville-colors`
- `npm run build`
- `npm run test:visual`
- `npm run smoke:api-local`
- `npm run smoke:dev-proxy`
- `npm run validate:docs`

Implemented highlights from the prior batch:

- **Palette / atmosphere / water identity:** W1.13–W1.18, W3.01–W3.16, W4.02–W4.06.
- **Runtime hardening and a11y controls:** W1.07–W1.12, W2.19, plus W4.04 time controls.
- **Motion substrate and choreography:** W1.20–W1.21, W2.14–W2.16, W3.17–W3.19.
- **Ship and harbor liveliness:** W2.07, W2.09–W2.13, W2.17, W4.14–W4.16, W4.20–W4.22.
- **Visual baselines:** refreshed in `30569c8` after intentional render drift.

Partial / deferred:

- **W1.02** is partial: strict flags landed except `exactOptionalPropertyTypes`.
- **W1.01, W1.03–W1.06, W1.19, W2.01–W2.06, W2.08, W2.18, W2.20, W3.20, W4.01, W4.07–W4.13, W4.17–W4.19, W4.23–W4.25, W4.27–W4.29** remain candidates unless a later note says otherwise.
- Asset regeneration and WebP work are intentionally deferred until a dedicated asset wave because they require PixelLab/provenance review and manifest cap coordination.

Implemented in this update:

- **W4.26 Selection follow-cam:** `use-canvas-resize-and-camera.ts` now starts a continuous selected-ship chase loop with a 0.45s velocity lead and damped camera convergence. Manual pan, zoom, reset, clear, and new selection release the chase; reduced-motion still snaps once. Focused helper tests cover the lead and damping math.

Most impactful next candidates:

- **W4.23 Calm patrol itineraries** — high visible motion variety with no new assets.
- **W3.20 Sea-room separation** — improves dense-harbor readability and helps screenshots.
- **W4.24 Squad formation gain / lagged heading** — makes squads read as fleets rather than stacked ships.
- **W4.01 First-load reveal** — high perceived polish, but touches render input and visual baselines.
- **W4.08–W4.18 asset regeneration wave** — largest remaining identity lift, but should be run as a coordinated sprite/WebP/provenance batch.

## 1. North star

Push PharosVille from a high-quality data instrument into a place. The frame on the page should:

- **Compel** — read like a poster, not a dashboard;
- **Inform** — every new visible cue carries data weight, with detail-panel + accessibility-ledger parity;
- **Live** — the world breathes, reacts, intends, without becoming a game;
- **Help** — a returning user identifies harbors, ships, and risk-zones *faster* than before, not slower.

Audio is **deferred** (see §10). The world-first revamp earns more user-visible delta per hour now.

## 2. Hard rails (preserved across every wave)

These are non-negotiable and apply to every task below.

- Detail-panel + accessibility-ledger parity for every new analytical cue (VD #15 included).
- Desktop-only gate (no mount below 720×360); world-fallback DOM unchanged.
- 85.7–86.2% water ratio; 377-tile main-island land count; cemetery/pigeon islets excluded.
- Pure deterministic world model; one route-owned RAF; reduced-motion path always returns a deterministic, *informative* frame.
- No remote sprite URLs at runtime. No `PHAROS_API_KEY` exposure. Same-origin `/api/*` only.
- No new npm dependencies unless explicitly justified.
- One `style.cacheVersion` bump per wave; consolidated provenance.
- Update Playwright visual baselines only for *intentional* drift, after screenshot review.

## 3. The Council's Ten Must-Haves

If we could only ship ten things, these were the unanimous-or-near-unanimous picks. Together they deliver the bulk of the perceived "wow" delta.

1. **Heading → hull orientation.** Flip standards on `heading.x < 0` today; queue titan 5-pose sprites. *(HL #1 — single largest "intent" win.)*
2. **Land painted emblems on the six unfinished titans** (USDT kraken, PYUSD compass, USD1 torch, BUIDL anchor, USDe delta, sUSDe vaulted delta). *(SS #1, #2.)*
3. **Atmospheric perspective veil.** Cool/fade the outer shelf 12–18% from the lighthouse outward — gives the diorama z-depth. *(VD #2.)*
4. **Danger Strait visibly violent + Warning reef as default identity.** Two of three storm-tier zones currently fail the "stay away / watch out" test. *(HY #2, #3.)*
5. **Standard-hull logo → painted mast pennant + lantern.** Retires the white-matte sticker; lifts every standard hull one tier. *(SS #3.)*
6. **Sea-state master signal `{swell, wind, tempo}`.** Coordinates ship pose, mooring sway, lighthouse fire flicker, weather, ambient — the diorama starts breathing as one ocean. *(HL #5.)*
7. **DEWS chroma ladder widened + Ledger Mooring re-based to parchment slate.** Color is the cheapest legibility lever. *(HY #1, #11.)*
8. **Lighthouse beam reaches the water.** Day glitter trail + night directional warm-pool spill + ambient color chord on the lantern. *(HY #7, HY #14, VD #15.)*
9. **Per-chain harbor identity wave.** Hyperliquid net-new sprite, Solana scaled up, Avalanche/Base/Polygon/Arbitrum regenerated. *(HM #1, #8, #9.)*
10. **Selection / hover / follow / squad rings made distinguishable + squad bunting amplified.** With 30+ ships on screen, today they're indistinguishable without the detail panel. *(SS #7, SS #8.)*

These ten are spread across Waves 1–4 below.

## 4. Epics (cross-cut themes)

| ID | Epic | Primary owners | One-line scope |
|---|---|---|---|
| **E1** | Palette + identity refit | VD + HY + SS | One palette pass — warm anchor + widened DEWS ramp + Ledger parchment |
| **E2** | Lighthouse beam to the sea | HY + HM + VD | Day glitter trail, night directional spill, ambient color chord, thunder-rim |
| **E3** | Ship identity pass (titans + heritage) | SS | Land all painted emblems; promote heritage chrome; per-ship lantern color |
| **E4** | Standard hulls + interaction chrome | SS + VD | Painted pennant on standards; differentiated rings; lower-thirds; per-class wakes |
| **E5** | Water drama | HY | Each zone reads at a glance — reefs, mirrors, wind-fetch, storms, plaque chrome |
| **E6** | Atmosphere + onboarding | VD | First-load reveal, establishing letterbox, time-of-day scrub, vignette, scanline, cloud shadow |
| **E7** | Land liveliness | HM | Civic agora, dock figures, lantern strings, awnings, mooring bunting, cemetery memorial props |
| **E8** | Per-chain harbor distinctiveness | HM | Hyperliquid sprite + Solana scale-up + Avalanche/Base/Polygon/Arbitrum regen + beach-foam ribbon |
| **E9** | Motion polish | HL | Sea-state signal, 3-phase docking, cast-off mirror, squad fan, tack-out, follow-cam, sea-room |
| **E10** | Engineering foundation | EN | Split ships.ts, WebP migration, perf caches, keyboard a11y, security/lifecycle hardening |

## 5. Wave plan

Four waves of roughly 1–2 weeks each. Each wave has a single coordinated `style.cacheVersion` bump and one consolidated visual-baseline rebake.

### Wave 1 — Foundation (substrate + code-health prereqs)

**Goal.** Land the structural and palette substrate so ship/water/atmosphere waves don't fight merges or palette drift. Plus quick perf and security wins.

| # | Task | Owner | Source | Cx | Impact |
|---:|---|---|---|---|---|
| W1.01 | **Split `ships.ts` into `layers/ships/{draw-ship,sail,wake,livery,index}.ts`** (Phase 8 of `world-canvas-decomposition`). Zero behavior change. Must land before Wave 2. | EN | EN #3 | L | velocity compounding |
| W1.02 | **Tighten `tsconfig.json`** with `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`. Clean up the surface that fails. | EN | EN #11 | S | code health |
| W1.03 | **Cache lighthouse god-ray gradients** (per angle/zoom/nightFactor bucket sprite cache replacing `createLinearGradient` calls per frame). | EN | EN #1 | S | -2 to -4ms night |
| W1.04 | **Path2D-cache titan foam / bow-spray / mooring-detail** (~700 path rebuilds/sec → ~0). | EN | EN #2 | S | -1 to -3ms |
| W1.05 | Static layer cache: array → Map. | EN | EN #5 | XS | hygiene |
| W1.06 | Ring-buffer the debug telemetry windows (reuse `DrawDurationWindow`). | EN | EN #12 | XS | dev trustworthiness |
| W1.07 | Fix `pharosville-world.tsx:132-170` wire effect: add explicit dep array. | EN | EN #4 | XS | hygiene |
| W1.08 | Disconnect-then-assign for `longtaskObserverRef`. | EN | EN #14 | XS | defensive |
| W1.09 | Type + document `__pharosVilleTestWallClockHour` in `src/test-setup.ts` and `MOTION_POLICY.md`. | EN | EN #15 | XS | type safety |
| W1.10 | **Harden `functions/_log.ts`** — Origin check, security-headers wrapper, per-IP rate-limit via `caches.default`, projected fields only. | EN | EN #6 | S | security |
| W1.11 | Add AbortSignal lifecycle to `error-reporter.ts` (cancel pending `postWithBackoff` on `visibilitychange === hidden` + `pagehide`). | EN | EN #7 | S | bug fix |
| W1.12 | Structured logging in `functions/api/[[path]].ts` 502/timeout paths. | EN | EN #13 | XS | observability |
| W1.13 | **E1 palette refit — single coordinated edit.** Anchor warm side on `HARBOR_PALETTE.lantern_warm` (#d49a3e); widen DEWS escalation ladder; rebase Ledger Mooring to sepia-tinted slate; encode monotonicity invariants in `palette.test.ts`. See §6.1 for the merged spec. | VD + HY | VD #1 · HY #1 · HY #11 | M | very high |
| W1.14 | Day-warm horizon haze gradient bridging sky to sea (`paintSkyBackdrop` extension; cache key includes mood-driven horizon-bleed alpha). | VD | VD #5 | S | med |
| W1.15 | Add `predawn` + `golden` sky moods to `SKY_MOODS`; extend `sky.test.ts` boundaries. | VD | VD #6 | S | med |
| W1.16 | Cinematic vignette across the day/night cycle (`drawNightVignette` → `drawSceneVignette`, modulated by `nightFactor`). | VD | VD #10 | S | med |
| W1.17 | Detail-panel ↔ canvas warm-light bridge (selection halo to `rgba(248,229,178,0.45)`; brass-tinted detail-panel left-edge shadow). | VD | VD #9 | S | med |
| W1.18 | Tighten lightning palette (warmer cream highlight); add 1-frame thunder-rim on the lighthouse silhouette synced to flash apex. | VD | VD #13 | S | med |
| W1.19 | **Reduced-motion deterministic-frame audit.** Walk every per-zone `drawXxxTexture`, every new ship cue, every motion path; assert each produces an identifying frame in the static branch. Codify as a future render-suite reduced-motion test. | HY + SS + HL | HY #13 · SS #14 · HL #14 | S | required policy |
| W1.20 | **Reduced-motion: freeze routed ships at primary-dock berth, heading = dockTangent.** NAV ledger ships keep Ledger freeze. Truthful canonical snapshot. | HL | HL #14 | S | a11y truthfulness |
| W1.21 | Per-ship pose personality bias (`rollAmplitudeBias` 0.8–1.2, `bobAmplitudeBias` 0.85–1.15, `lanternRateBias` 0.75–1.25 from `stableUnit(shipId)`). Cheap; compounds Wave-2 work. | HL | HL #12 | XS | low individually, high compounded |

**Wave 1 exit gates.**
- `npm run validate:release` green
- `tsc --noEmit` clean post-tsconfig tightening
- `npm run test:visual` baselines rebaked once for intentional palette/sky/vignette drift, screenshots reviewed
- `palette.test.ts` monotonicity invariants present and green
- `npm run smoke:live` post-deploy clean
- A11y check: reduced-motion routed ships render at their home dock berth, with detail-panel parity

### Wave 2 — Ship identity (every titan + heritage hits the crvUSD bar; standards jump one tier)

**Goal.** The fleet stops looking like reskins of the same dark hull. Every titan has a heraldic painted emblem, every standard ship has a livery-pulled mast pennant, heritage hulls finally read as a distinct tier, and selection chrome scales with active interaction.

**Hard dependency.** W1.01 (`ships.ts` split) must be merged first.

| # | Task | Owner | Source | Cx | Impact |
|---:|---|---|---|---|---|
| W2.01 | **Regenerate `ship.usdt-titan`** — Tether-teal `#009393` sail-cloth, bold off-cream kraken silhouette painted into largest mainsail (~1/4 sail), no text/numerals, oxidized-bronze masthead lantern, cream bowsprit pennant. PixelLab prompt in SS #1; style anchor `2026-04-29-lighthouse-hill-v5`. Sail-tint polygon refresh. Pair with WebP generation. | SS | SS #1 | S sprite | very high |
| W2.02 | **Paint emblems on the five remaining titans** — PYUSD porthole-compass, USD1 liberty torch, BUIDL institutional anchor on black, USDe Greek-delta, sUSDe delta inside a vault ring. Brand-tinted sail cloth × silhouette only. Pair with WebP. | SS | SS #2 | M (5 sprites) | high |
| W2.03 | **Regenerate `ship.xaut-unique`** — gilded bullion barge silhouette, gold-banded waterline trim, single ingot silhouette on sail. | SS | SS #5 | S sprite | med-high |
| W2.04 | **Promote heritage tier chrome** — taller cream bowsprit pennant on a dark spar; oxidized-bronze masthead lantern ring; per-ship sterns engraved nameplate ("CURVE", "LIQUITY", "F(X)", "PAXOS", "TETHER GOLD", "HASHNOTE") at zoom-in. New `SHIP_HERITAGE_NAMEPLATES` table. | SS | SS #4 | S–M | high |
| W2.05 | **Animate sail flutter on heritage hulls** at reduced amplitude (peak 0.35 vs titan 0.52+0.24); reduced-motion frame stays flat. | SS | SS #12 | S | med-high |
| W2.06 | **Reconsider heritage roster.** Document USYC as titan-promotion-eligible (no code change today). Add **FRAX** (fractal/binary octagon silhouette) and **GHO** (ghost silhouette in Aave purple) as heritage hulls. New entries in `UNIQUE_SHIP_DEFINITIONS`, two new PNGs, two new sail-tint polygons, doc update in `CURRENT.md`. | SS | SS #6 | M (2 sprites + 1 doc) | med-high |
| W2.07 | **Per-titan hull-color story.** Lift the `if (!isTitanSprite)` gate at `ships.ts:653` for the trim path only (sail-logo skip retained). Add titan rows to `SHIP_TRIM_MARKS`: USDC bronze rails, USDT teal gunwales, USDe purple pin-stripe, PYUSD navy band, BUIDL near-black with brass plate, USD1 gold-veined. 1–2 px on the hull only. | SS | SS #9 | M | med (cumulative high) |
| W2.08 | **Per-ship mast-lantern color** derived from `livery.primary` lightened ~70%. Cache cardinality grows ~3 → ~30; verify LRU eviction holds (EN telemetry counters from W3.13). | SS | SS #13 | M | high at night |
| W2.09 | **Standard-hull pennant + lantern** replacing `drawSailLogoInline`'s white-matte sticker. New `drawMastPennant` (swallowtail in `livery.primary` with 3-letter symbol burned at low contrast). Bowsprit logo-mark kept at tier ≥ regional; dropped on skiff/micro. New `SHIP_PENNANT_MARKS` table. | SS | SS #3 | M | very high |
| W2.10 | **Wake personality per class.** Per-hull `wakeStyle` override: galleon wide-slow, brigantine medium, schooner narrow-glide, junk choppy-irregular, caravel baseline. Multiplicative scalars over `wakeStyleForZone` color. | SS | SS #10 | S | med |
| W2.11 | **Differentiated rings** — `drawHoverShipOutline` (1px gold dashed), `drawSelectedShipOutline` (current + 0.5s opacity pulse), `drawFollowShipOutline` (double-ring), squad halo tinted by `squadForMember()` (Sky orange, Maker amber, future-Ethena charcoal). Reduced-motion freezes pulse at brightest deterministic phase. | SS | SS #7 | M | high |
| W2.12 | **Amplify squad bunting and admiral banner.** Bunting → `rgba(232,187,96,0.92)` 2px stroke + black-outlined drop-shadow; admiral banner → ~18×6 with clear forked tip + dark spar shadow, raised 12px above mast tip. | SS | SS #8 | S | high |
| W2.13 | **Mast-string of two signal flags** for `overlay = nav | yield | watch`. NAV = blue square + white triangle; YIELD = green square + yellow triangle; WATCH = black-and-yellow checker square + red triangle. Detail-panel parity unchanged. | SS | SS #11 | S | med |
| W2.14 | **Heading → hull orientation, flip path.** Standards: `ctx.scale(-1, 1)` when `sample.heading.x < 0`. Titans: subtle yaw-skew until 5-pose sprites land. Quantize heading into 5 buckets. Hit-test geometry must follow the flip. | HL | HL #1 (flip-only) | S | very high |
| W2.15 | **Heading-aware spray asymmetry + top-mover bow priority.** Couple `drawTitanBowSpray` to `getShipHeadingDelta(shipId)`: outer rail +50% length / +20% alpha; inner rail −30% alpha; top-3 24h movers get fourth strand. | HL | HL #8 | S | med |
| W2.16 | **Sea-state master signal `{swell, wind, tempo}`.** New `src/systems/sea-state.ts` deriving from max active DEWS band + lighthouse PSI + day-night factor; 8-second τ lerp. Consumers: `ship-pose.ts` (`ZONE_ROUGHNESS *= 0.6 + 0.4*swell`), `motion-sampling.ts` mooring sway, `maker-squad-chrome.ts` pennants (replace `windMultiplierForMotion`), `ambient.ts`. World summary gains a "Sea state" line for DOM parity. | HL | HL #5 | M | high (wow) |
| W2.17 | **Lower-thirds caption strip for selected entity.** Slim brass-edged strip at canvas bottom (24px tall) with name + one-line caption ("USDC — Treasury Galleon — Calm Anchorage") in `PV Plaque`. `aria-live="polite"`. Auto-hides on deselect. | VD | VD #12 | M | high |
| W2.18 | **WebP variants with `<picture>` fallback** for every PNG regenerated in this wave (W2.01–06 ship sprites). Extend manifest schema with `webpPath`; renderer prefers WebP. Visual Director sign-off on q=85 visual identity. Ship Sculptor confirms emblem readability post-encode. | EN | EN #10 (partial, ship-pass) | M | partial; full migration in W4 |
| W2.19 | **Keyboard entity-cycling for canvas selection.** Tab/Shift+Tab cycle through `hitTargetsRef.current` in z-order; Enter to select; Escape clears (already wired). Announce via existing `aria-live` element. | EN | EN #8 | M | material a11y |
| W2.20 | **Telemetry counters** for `sailEmblemSpriteCache`, `sailLogoSpriteCache`, `shipSailTintCache`; expose via `__pharosVilleDebug` (mirroring A3 route-LRU pattern). | EN | EN #16 | XS | observability for W2.08 sizing |

**Wave 2 exit gates.**
- All 12 titans + 7 heritage hulls render distinct painted emblems / chrome at default zoom
- Standard hulls show mast-pennant + lantern; bowsprit logo-mark at tier ≥ regional
- Selection / hover / follow / squad rings visually distinct in single capture
- `sea-state` signal observed across pose + mooring + pennants + ambient in one frame
- Manifest cache version bumped once (consolidated provenance entries for all ship regens)
- Sail-cache hit rate ≥ 99% steady-state (W2.20 telemetry)
- Reduced-motion suite passes for every new cue (W1.19 gate carries forward)

### Wave 3 — Water drama + lighthouse touches the sea

**Goal.** Each water zone reads its meaning at a glance without the plaque. The lighthouse stops being a static landmark and starts orchestrating the harbor.

| # | Task | Owner | Source | Cx | Impact |
|---:|---|---|---|---|---|
| W3.01 | **Make Danger Strait visually violent.** Always-on dark whitecap J-stroke per tile (`lineWidth = 2.2*zoom`, alpha 0.65, `amplitudeScale 1.8`); wind-driven spray streaks (3–4 short slashes per tile, 0.55 alpha, ungated); cross-front "rip" ribbon drifting across the strait every ~6s; tighten flicker gate from `<0.45` to `<0.6`. Reduced-motion: static curl + spray. | HY | HY #2 | M | highest single-zone wow |
| W3.02 | **Promote Warning Shoals reef** from optional motif (20%) to default identity (~60%). Two variants: 3-rock cluster (20%) and single-rock + foam-ring (40%). Add breach pixel — 2×2 dark rock pip + foam halo. | HY | HY #3 | S–M | high |
| W3.03 | **Calm Anchorage glass-mirror signature.** Densify reflection rings; add long horizontal mirror bands (single-pixel-tall low-alpha strokes drifting vertically over ~20s). Reads as positive quiet, not absence. | HY | HY #4 | S | med-high |
| W3.04 | **Generic open water wind-fetch identity.** Replace 25%-fires pattern with deterministic SW→NE drift lines (30% tile coverage, ≥16px on screen); remaining 70% get 1-pixel plankton glint on 12s breathe cycle. Document in detail-panel area copy that generic water carries no DEWS meaning. | HY | HY #5 | S | high (largest tile class) |
| W3.05 | **Deep outer shelf starlight glints + radial edge-darkening.** Sparse 1px white glints at <8% of tiles, breathing slowly; radial darkening alpha grows with distance from map centroid. | HY | HY #6 | S | med |
| W3.06 | **Soft zone-border feathering with hard inner-band core.** When water tile X borders water tile Y, paint 1-tile diagonal blend at 0.25 alpha. Inner-band tiles (≥2 tiles from a different zone) keep hard core identity. Hit-testing/ship-placement use the discrete tile band — feather is render-only. Cache neighbor-zone lookup on `world.map` identity. | HY | HY #9 | M | high |
| W3.07 | **Watch Breakwater split** between south basin (keep dashed crosswind + buoy) and east shelf (faint eastward current arrows). Both remain Watch band; consider sub-area labels in `area-labels.ts`. Coordinate detail-panel copy. | HY | HY #10 | M | med |
| W3.08 | **Ledger Mooring parchment underbase.** Re-base to sepia-tinted slate (`#3d4860` / `#3a4858`) with low-contrast warm-paper texture: faint Roman-numeral row-headers (I, V, X) along map-x at large intervals. Off-DEWS-axis identity finally legible. | HY | HY #11 | M | high |
| W3.09 | **Per-zone label plaque chrome.** Extend `ZoneLabelTheme` with `chromeStyle`. Danger = charred/cracked dark frame + red wax-seal pennant; Warning = weathered amber wood + split-rivet pennant; Calm = cream-parchment + green ribbon; Ledger = ink-and-vellum (paper-color body, sepia border, no rivets). Validate legibility at minimum scale 0.72. | HY | HY #12 | M | high polish |
| W3.10 | **Seawall coastal-ring spray plumes + ripple-anchor enrichment.** Per-barrier-tile spray plume (small white spume burst on seaward edge, modulated by `seawallBarrierDistance`). Expand `SEAWALL_RIPPLE_ANCHORS` from 3 to 8–12 with phase-staggered concentric ripples (one per `AUTHORED_SEAWALL_SEGMENTS` corner). Spray reads "wall impact," not "shoal" — `foam_white #e8eef0`. | HY + HM | HY #8 · HM #11 cross-cut | M | high |
| W3.11 | **Lighthouse beam reaches the water — Day.** Extend `drawBeamCaustic` with (a) a narrower bright streak along the beam axis at low alpha and (b) a periodic glitter pulse — a 3-tile-wide swarm of white pixels riding the beam outward at ~2 tile/s. Gate to beam-cone tiles only. Reduced-motion: static glint trail at `Math.PI / 4`. | HY | HY #7 | M | high (wow) |
| W3.12 | **Lighthouse beam reaches the water — Night.** Extend `drawLighthouseNightHighlights` warm pool with a directional second ellipse stretched along prevailing wind axis: spills into Watch east-shelf with sub-pool slightly warming Alert Channel. Cap 0.18 alpha so storm-water dark base survives at night. | HY | HY #14 | M | med-high |
| W3.13 | **Single ambient color chord (PSI × max DEWS × nightFactor).** One-frame computation blending the three; passed to existing god-rays / lantern code as a tint multiplier (±8% chroma). At DANGER + night the lantern goes deep amber; at calm-day cream. DOM parity: lighthouse detail panel caption ("Beam burning hot — elevated DEWS threat") + accessibility-ledger row when multiplier > threshold. | VD | VD #15 | M | high |
| W3.14 | **Day-beam pulse alpha down (0.11 → 0.08); night-aura pool radius +11% (900 → 1000).** Stops day-beam from reading as stage spotlight; wraps the south wharf row at full night. | HM | HM #14 | S | polish |
| W3.15 | **Lighthouse reflection on water under the headland.** Vertical mirrored streak of warm color clipped to seawall edge; new `drawLighthouseReflection` pass between `drawLighthouseSurf` and entity pass. | HY (with HM input) | cross-lane (HM ask) | M | med-high |
| W3.16 | **Halve sparkle density on the eastern shelf** (cull every other entry whose `isoX > 32*16` from `SPARKLE_POINT_DEFS`). Storm chop + lightning + Ledger parchment get the visual stage. | VD | VD #16 | S | med |
| W3.17 | **Real docking choreography: 3-phase approach.** Split `arriving` into 0.0–0.85 full transit / 0.85–0.96 decelerate envelope `cos((p−0.85)/0.11 × π/2)` (wake → ~0.1, heading aligning to `dockTangent`) / 0.96–1.0 fender contact (clamp to berth-perpendicular within 0.5 tile, micro-yaw ±0.04 rad, mooring tension ramps in). Wake decays through last three frames. Hydrographer's fender ripple at p=0.97 (W3.18). | HL | HL #3 | M | high |
| W3.18 | **Cast-off mirror.** Symmetric phases for `departing`: 0.0–0.04 line release (Hydrographer paints small splash); 0.04–0.18 slow-build accel (sine ramp); 0.18–1.0 normal transit. Heading rotation alone carries most of the value if splash slips. | HL + HY | HL #4 | M | med-high |
| W3.19 | **Mooring sub-phases.** Split 1/3-cycle dwell into working (25%, sway ×1.2, occasional `lanternAlpha` flicker) → quiet (50%, current) → cast-off prep (25%, heading rotates toward path tangent over 4s, mooring tension → 0). Composes with W3.17/W3.18 phases. | HL | HL #10 | S–M | med |
| W3.20 | **Sea-room soft separation in busy zones.** Per-frame relaxation pass: ships within `0.7 tile` get nudged by `(d − 0.7)/2` along separation axis, capped 0.15 tile/frame. Radius modulated by `motion.seaState.swell` (W2.16). Skip moored ships and squad consorts. Stable id-sorted order for determinism. | HL | HL #11 | S–M | med (scales with density) |

**Wave 3 exit gates.**
- Each named water zone identifiable from a 1-second glance at a static frame
- Lighthouse beam visible on water in both day and night frames
- Danger Strait fails a "would I sail through here?" gut check — i.e., reads as scary
- 3-phase docking visibly decelerates; cast-off visibly accelerates
- No two ships overlap (≤ 0.7 tile) in steady state in any harbor
- Reduced-motion suite still asserts every zone signature present in static frame
- Cache `world.map`-keyed neighbor-zone lookup is shared between W3.06 and W3.10

### Wave 4 — Atmosphere, land liveliness, motion narrative

**Goal.** The "wow" finishing touches — first-load arrival beat, civic agora replacing the wallpaper plaza, lively docks, fleet motion intent, harbor distinctiveness.

| # | Task | Owner | Source | Cx | Impact |
|---:|---|---|---|---|---|
| W4.01 | **1.8s first-load reveal beat.** Plumb a `revealEnvelope` 0..1 through `DrawPharosVilleInput`. Phases: 0–600ms sky+outer water only + unlit lighthouse; 600–1200ms scene fades in + headland slides up 6px (cubic-out); 1200–1800ms lighthouse first-sweep at 2.2× duration. Reduced-motion → final frame immediately. Skip on subsequent client-side route reloads. | VD | VD #3 | M | wow |
| W4.02 | **Atmospheric perspective veil.** New `drawAtmosphericFade` pass after `drawWaterTerrainOverlays` and before scenery. Screen-space gradient anchored at the lighthouse tile: `rgba(20,28,48,alpha)` veil 0 → 0.18 from island centroid to visible edge; reduce alpha by `state.nightFactor * 0.4`. Cap 0.18 to preserve DEWS readability; sample for JND. | VD | VD #2 | M | wow |
| W4.03 | **Establishing-shot letterbox + caption** while no entity selected and camera at home. 8px top/bottom `rgba(5,8,12,0.55)` bars; bottom-centered "PHAROS LIGHTHOUSE — PSI <band>" caption. Auto-hide on first pan/zoom/select. | VD | VD #4 | M | high |
| W4.04 | **Time-of-day badge + manual scrub override** in the toolbar. Brass chip showing current band ("Dawn"/"Day"/"Golden"/"Dusk"/"Night"); long-press menu to override the time-of-day for the current session (no persistence). Reduced-motion still gets a frozen scene at the chosen hour. | VD | VD #11 | M | high |
| W4.05 | **Soft scanline + ordered-dither film grain.** Final screen-space pass: 1px horizontal scanline at `rgba(5,8,12,0.05)` every other row (`multiply`) + 64×64 ordered-dither tile at `globalAlpha 0.04`. Gated off below CSS DPR < 1.25; disabled on `motion.reducedMotion`. | VD | VD #7 | S | high |
| W4.06 | **Cloud-shadow drift across the island** once per ~95s, scaled by `windMultiplier(threat)` (route through `sea-state.wind`), suppressed at night (`nightFactor > 0.3`). Uses the existing motion clock. | VD | VD #8 | S | med |
| W4.07 | **Loading state re-skin** with canvas palette (deep `#050d13` background, single warm spinner halo, distant horizon-ship silhouettes mirroring `drawHorizonShips`). Continuity across cold loads. | VD | VD #14 | S | med |
| W4.08 | **Generate `dock.hyperliquid-trading-floor`** — obsidian-glass trading-pit silhouette (~192×136) with three teal terminal pillars + orange ticker-tape band. Bump validator `maxManifestAssets` cap. WebP twin. | HM | HM #1 | S | identity gap close |
| W4.09 | **Regenerate `overlay.center-cluster`** with a central open colonnaded agora pavilion (4 limestone columns, low terracotta hip roof, no walls, ~80×80 px) + 7 staggered residential roofs. Same 384×224 footprint, anchor, scale; cap silhouette ≤ 110 px so lighthouse remains dominant. WebP twin. | HM | HM #2 | M | highest single-land win |
| W4.10 | **Bump sundial sprite** to 96×96 with 3 px wedge gnomon shadow (umbra/penumbra step). WebP twin. | HM | HM #3 | S | med-high |
| W4.11 | **Civic vegetation reshuffle** around the new agora — remove 3 entries that crowd the pavilion footprint; reposition 2 to flank the agora entrance. No new assets. | HM | HM #13 | S | prereq cleanup |
| W4.12 | **Chimney smoke wisps on the center cluster** — three procedural wisps at fixed offsets, reusing a lower-amplitude variant of `drawBrazierSmoke` (peak alpha 0.10, ~80 px rise). Day-visible; suppressed at `nightFactor > 0.7`. | HM | HM #10 | S | med |
| W4.13 | **Dock-side ambient prop pack** — three new prop kinds in `SCENERY_PROPS` and manifest: `dock-awning` (canvas tarp, per-chain tint), `dock-figures` (silhouette stevedore pair, non-selectable), `lantern-string` (festoon lights, night-only). ~2 awnings + 1 figure pair + 1 lantern string per major harbor. WebP twins. Cap bump. | HM | HM #4 | M | single largest "lively" lift |
| W4.14 | **Per-chain dock-side land flag** — second per-chain identity flag flown on land adjacent to each dock; rectangular pennant on a 2-tile pole. Same `drawHarborFlag` code with `kind: "mast" | "land"` discriminator. Gate to `camera.zoom ≥ 0.6`. | HM | HM #5 | S | high |
| W4.15 | **Permanent waystone plaque per harbor.** Replace hover-only `drawDockNameRibbon` with permanent limestone slab (24×16 px at 1× zoom, 6 px serif engraved name). Gate to `camera.zoom ≥ 0.55`. Reuse `drawSignBoard`. | HM | HM #6 | S–M | high |
| W4.16 | **Pigeonnier night halo + 4 bird-silhouette orbital particles.** Warm halo around the roof lantern at night (reuse `getLampLightConeSprite` at 0.6× scale). 4 small pigeon silhouettes in slow elliptical pattern (~3s loop, drift radius 18 px). Birds non-selectable. | HM | HM #7 | S | discoverability of Telegram CTA |
| W4.17 | **Regenerate `dock.solana-prism-stilt`** at 280×180 (was 192×136) with deck-mounted neon-cyan light strip and three crystalline prism beacons. Verify seawall clip + `DOCK_OUTWARD_VECTOR_OVERRIDES` for tile (25,23). WebP twin. | HM | HM #8 | M | med-high |
| W4.18 | **Regenerate Avalanche / Base / Polygon / Arbitrum dock sprites** (same anchor/footprint, painted content only): Avalanche snow-cap + watchtower mast with red lookout pennant; Base steel-blue accent + three blue containers; Polygon hex tarp panels in violet/magenta + abacus rack; Arbitrum raised keystone + suspended scroll/ledger banner. WebP twins. | HM | HM #9 | L (4 sprites) | biggest harbor-distinctiveness win |
| W4.19 | **Beach-foam ribbon per dock pad** — 6-tile thin foam ribbon (3 px wide, peak alpha 0.6) along the seawall edge where each pad meets water. Generalize `LIGHTHOUSE_SURF` data shape into `HARBOR_SURF_BY_DOCK`. Per-zone alpha multiplier from `ZONE_THEMES`. | HM (with HY) | HM #11 | M | high |
| W4.20 | **Mooring bunting strings** between dock posts — when a dock has ≥2 visible mooring-post props, draw a 3-pennant bunting string in chain accent color at 0.8 alpha. Day-visible. Gate to `camera.zoom ≥ 0.5`. Skip cemetery cove + pigeonnier islet. | HM | HM #12 | S | med-high |
| W4.21 | **Yggdrasil canopy lantern revival** — `drawYggdrasilLanterns` overlay, 3 fixed 1–2 px warm pinpoints + 2 px halo at canopy-relative positions, gated `nightFactor > 0.3`. | HM | HM #15 | S | med |
| W4.22 | **Cemetery cove memorial props** — 2 floating shroud lanterns (votive candles on driftwood) drifting on the lagoon, 1 broken oar angled into the sandbar near the flagship wreck. Procedural; no new PNG. | HM | HM #16 | S | A → A+ |
| W4.23 | **Inter-route variety: Calm patrol itineraries.** Replace single-waypoint `stableHash % 7` pick with per-ship 2- or 3-anchor itinerary; each cycle visits a different ordered pair via deterministic Latin-square mod. Engineer confirms LRU headroom for ~6× path growth. | HL | HL #2 | S–M | high (densest zone) |
| W4.24 | **Squad-as-fleet: gain-modulated formation + lagged heading.** `formationGain(zone, flagshipSpeed)`: Calm cruising 1.4 (fan out), arriving 0.55 (single-file), tight-placement cap. Consort heading lags via `lerp(prevHeading, flagshipHeading, dt/0.6s)`. Fall back to flagship-tile clamp if fan-out pushes consorts onto wrong tiles. | HL | HL #6 | M | high |
| W4.25 | **Risk-transition tack-out.** On `riskPlacement` change at plan build, record `previousRiskTile` for one cycle; insert a 3s blended transit from previous → new risk tile *before* the next dock cycle. Detail-panel parity: "tracking new risk band" line during the 3s. | HL | HL #7 | M | med-high (the data event reads on canvas) |
| W4.26 | **Selection follow-cam — continuous chase.** Replace one-shot tween in `use-canvas-resize-and-camera.ts:400-445` with a damped spring (`k≈4, c≈1`) toward the ship's tile + a 0.45s × velocity lead so the ship sits 30% off-center. Release on manual pan/zoom/new selection. Reduced-motion keeps the one-shot snap. | HL | HL #9 | M | high (demo/narrative) |
| W4.27 | **Cue-priority arbiter** to enforce `MOTION_POLICY` priority on cap-bound cues. New `cuePriority(ship)`: selected > active risk > recent supply > scenery. When two ships compete for a slot, the higher-priority cue runs solo; lower-priority falls back to static reduced state. | HL | HL #13 | M | med |
| W4.28 | **WebP migration full sweep.** Complete the migration for any remaining PNGs not covered by Wave 2/3/4 regens (terrain, props, landmarks, overlays). All paired with PNG fallback via `<picture>` (or the `webpPath` manifest field). | EN | EN #10 (close-out) | M (remaining) | -2 to -3 MB initial payload |
| W4.29 | **Cooperative `requestIdleCallback` budgeting** for deferred prefetch. Split batches in `use-asset-loading-pipeline.ts:111-127` into ~3 sprites/idle slice; longtask.count → 0 in the perf lane. | EN | EN #9 | M | smoother zoom gestures |

**Wave 4 exit gates.**
- First-load reveal beat plays once per cold load; reduced-motion users see the final frame immediately
- Atmospheric perspective veil verified non-regressive on DEWS chroma JND
- Civic agora visible at home zoom; lighthouse remains the dominant vertical
- Hyperliquid sprite present; Solana visibly scaled; Avalanche/Base/Polygon/Arbitrum identifiable without label
- Selection follow-cam reliably tracks a Calm titan through a full cycle
- Full WebP migration: initial payload drop measured (≥ 2 MB)
- `npm run smoke:live` + `npm run check:release-readiness` green

## 6. Merged specs for cross-lane epics

Three cross-lane epics were called out by multiple agents and need a single coordinated specification before any one of them lands. The Wave numbers above point to where each line item executes — these subsections collect them so a single owner can drive the bake.

### 6.1 Palette refit — single coordinated edit (Wave 1, W1.13)

Owners: Visual Director + Hydrographer + Ship Sculptor.
One PR; one baseline rebake.

- Anchor warm side on `HARBOR_PALETTE.lantern_warm` (#d49a3e). All accent rotations stay within ±20° of warm/cool complementary pairs.
- DEWS escalation chroma ladder (`WATER_TERRAIN_STYLES`):
  - Calm `#0f6f8d` → `#125e7e` (VD) / `#1a7da0` (HY) → **resolved: `#125e7e`** (preserves placid-positive read; HY's `#1a7da0` lifts perceived activity, which fights the stale-evidence-sink semantics).
  - Watch `#194d6e` → `#1a4868` (VD) / `#296a82` (HY) → **resolved: `#1a4868`** with a touch more chroma `#1c4d6d` (compromise that holds the cool-coastal feel HY also wanted).
  - Alert `#286f78` → **`#3d6e58`** (HY's sickly teal-green pulls it perceptually off-axis from Calm/Watch).
  - Warning `#3d4332` → **`#5e5535`** (HY's warm ochre-olive — sits between Alert green and Danger plum, monotonic luminance).
  - Danger `#0a1f35` → **`#1a1428`** (HY's bruised plum-black — away from deep-water collision, reads "violent" not "abyssal").
  - Ledger `#2b5966` → **`#3d4860`** (HY's cool slate-violet — off-DEWS-axis, complements W3.08 parchment underbase).
- `ledger-water.accent` from `rgba(123,198,207,0.25)` → `rgba(180,210,196,0.24)` (VD: reads bronze-on-blue not a third teal).
- Encode monotonicity invariants in `palette.test.ts`:
  - Calm → Watch → Alert → Warning → Danger: monotonic luminance decrease.
  - Calm → Watch → Alert → Warning → Danger: monotonic chroma-distance from `lantern_warm` (the warm anchor) within ±5%.
  - Ledger lies off-axis from the DEWS ladder by ≥ N hex distance from the nearest DEWS color.
- Update `check:pharosville-colors` to validate the new lantern-anchor constraint.
- Pair with VD #5 horizon haze (W1.14) so the warm side bleeds into sky-water transition without contradicting the cool DEWS escalation.
- Sample under reduced-motion and night-tint, not just default day, to confirm the ramp survives.

### 6.2 Lighthouse beam to the sea (Wave 3, W3.11–W3.16)

Owners: Hydrographer (primary, owns water rendering) + Harbormaster (beam appearance + alpha) + Visual Director (ambient color chord).

Coordination notes (avoid double-tinting / contradiction):

- Day-beam pulse alpha drop (HM W3.14: 0.11 → 0.08) lands **before** the day glitter trail (HY W3.11) so the trail isn't washed out by a stage-spotlight beam.
- Night warm-pool directional spill (HY W3.12) caps at 0.18 alpha and modulates against, not over, the night-tint multiplier (must not double-darken in W3.16 sparkle cull).
- Ambient color chord (VD W3.13) is read **once per frame** by both `drawLighthouseBeam` and `getShipLanternSprite` (W2.08) so the lantern brand-color and the beam tint share a coherent mood.
- DOM parity for VD W3.13: when the chord crosses a threshold (e.g. amber multiplier > 1.08), the lighthouse detail panel surfaces "Beam burning hot — elevated DEWS threat" and the accessibility ledger gets a parallel row.
- Lighthouse reflection on water (W3.15) is Hydrographer's pass owning the geometry; Harbormaster owns the beam silhouette that the reflection mirrors.

### 6.3 Sea-state master signal `{swell, wind, tempo}` (Wave 2, W2.16)

Owner: Helmsman.
Consumers (must wire in the same change to avoid stale-signal flicker):

- `src/renderer/layers/ship-pose.ts` — `ZONE_ROUGHNESS *= 0.6 + 0.4*swell`.
- `src/systems/motion-sampling.ts` — mooring sway amplitude scaled by `swell`.
- `src/renderer/layers/maker-squad-chrome.ts` — pennants and bunting motion read `wind` (replaces `windMultiplierForMotion` for these consumers).
- `src/renderer/layers/ambient.ts` — sparkle phase + cloud-shadow speed (W4.06) read `wind`.
- `src/renderer/layers/lighthouse.ts` — fire flicker and brazier smoke read `swell` (lower swell → calmer flicker).

Smoothing: 8-second τ lerp so band escalations don't snap the whole canvas at once.
DOM parity: world summary header gains a "Sea state" line; reduced-motion path returns deterministic flat values.

## 7. Cross-lane handshakes still owed before Wave 1 starts

Resolve these in a 30-minute review before kicking off Wave 1.

1. **Ship Sculptor × Engineer.** Confirm no in-flight branches conflict with the `ships.ts` split (W1.01). Sculptor's Wave 2 work explicitly depends on this landing first.
2. **Visual Director × Engineer.** Sign-off on WebP q=85 visual identity. Ship Sculptor needs to confirm painted-emblem readability survives encoding (the W2.18 partial migration is the canary).
3. **Hydrographer × Visual Director.** Lock the merged palette spec in §6.1. Disagreements above are pre-resolved but the colors need to be sampled in-app under day + night + reduced-motion before the test invariants are codified.
4. **Helmsman × Engineer.** Path-cache headroom for Calm itineraries (W4.23). The `BoundedShipWaterRouteCache` is sized `min(4096, max(512, 16×shipCount))` — Engineer to project the ~6× growth and either confirm fit or propose a cap raise.
5. **Harbormaster × Hydrographer.** Beach-foam ribbon per dock (W4.19) reads a foam-alpha multiplier per zone from `ZONE_THEMES`. Hydrographer publishes that contract before Harbormaster wires the renderer.
6. **All lanes × Engineer.** Manifest `maxManifestAssets` cap will grow: Wave 2 adds 2 (FRAX, GHO heritage); Wave 4 adds 4–7 (Hyperliquid + 3 props + WebP twin entries if separate). Reset the cap at each wave boundary, not at task boundary, so the validator doesn't oscillate.

## 8. Asset-pipeline conventions (Wave 2+ sprite regens)

Every regen in this plan must:

- Keep `style.styleAnchorVersion = 2026-04-29-lighthouse-hill-v5`.
- Bump `style.cacheVersion` exactly **once per wave** with a wave-named slug (proposed: `2026-05-W2-ship-emblems`, `2026-05-W3-water-drama`, `2026-05-W4-land-liveliness`).
- Record `promptProvenance` per asset (PixelLab job ID + prompt + style anchor + dimensions + post-processing notes).
- Pair PNG with WebP twin (Wave 2+) under the new `webpPath` manifest field (W2.18, W4.28).
- Pass `npm run check:pharosville-assets` and `npm run check:pharosville-colors` before merging.
- Visual baseline rebake happens **once per wave**, after the wave is fully merged, against the canonical fixture set.

## 9. Operating cadence

Each wave runs roughly 1–2 weeks and closes with:

- `npm run validate:release` green
- `npm run test:visual` baselines updated only for intentional drift, after screenshot review
- `npm run smoke:live -- --url https://pharosville.pharos.watch` post-deploy
- Manifest cap reset check (`scripts/pharosville/validate-assets.mjs`)
- A single `style.cacheVersion` bump for the wave
- Cross-lane retrospective (10 min, written): what the council called wrong, what surprised the implementer, what to carry into the next wave

## 10. Decided NOTs

The council explicitly chose not to do the following — record the reasoning so they don't reappear unprompted.

- **Audio.** LATER. Web Audio is technically feasible (~78 KB gzip for 3 WAVs + 80-LoC mixer) but current priorities (ships, visuals, motion, perf, a11y) return more user-visible delta per engineering hour. When it ships: off-by-default, gated by `prefers-reduced-motion`, persisted in localStorage, toggle in `world-toolbar.tsx`. Revisit after Wave 4.
- **Bloom / CSS filters on canvas.** Bilinears the pixel art. Hard no.
- **OffscreenCanvas + Worker rendering / sprite-atlas texture packing / WebGL migration.** Already evaluated NO-GO in the May 3 perf/animation/routing follow-up, Phase F. Revisit alongside WebGL only.
- **Dirty-rect rendering.** Incompatible with water shimmer + sub-pixel ship motion.
- **Velocity-physics ship-avoidance.** Out of deterministic-decorative scope. The W3.20 relaxation pass is the deterministic substitute.
- **Hand-authored named voyages.** Breaks the pure data-driven contract. Use detail-panel narratives instead.
- **Ambient non-data ships** (fishing boats, ferries, etc.). Dilutes the encoded-asset contract.
- **More than ~7 heritage hulls.** Tier loses meaning beyond that.
- **Banking on non-titans.** Sub-pixel at 80×60 px; revisit only after W2.14 sprite-orient lands.
- **Bridge between main island and pigeonnier islet.** Geometric separation depends on `islandValue()` tests.
- **New analytical signal on Yggdrasil / center-cluster / cemetery.** Pure-flavor; do not migrate.
- **Detail-panel attachment to new ambient props** (dock figures, awnings, lantern strings, bunting). Pure decoration; attaching panels creates noise without signal.
- **Aurora borealis / parallax mouse-tilt / particle rain / day-night slider replacing wall clock.** All considered and rejected in Visual Director's report for being game-y or competing with the lighthouse focal hierarchy.
- **Kelp beds / wreckage props in Warning Shoals.** Reef cluster (W3.02) suffices.
- **Tidal animation.** Introduces analytical ambiguity ("docked or tide came in?") with no proportional read gain.
- **Compass rose / wind-indicator on water.** Belongs on UI chrome, not water; would compete with the zone plaques (canonical printed labels).
- **Replacing the procedural water pass with a tile atlas.** The procedural pass is what carries per-zone semantics. Solve by doing more with it, not less.
- **Replacing the React shell.** Entry chunk is 7.6 KB; not the cost center.
- **New npm dependencies.** None of the proposals require any.

## 11. Future / queued (post-Wave-4)

Captured here so they're not forgotten:

- **Titan 5-pose sprite set** to complete W2.14 (`HL #1`) full implementation. Pixellab asset campaign — one neutral pose per titan + four directional variants (E, NE, N, NW). Significant batch; pair with a future wave.
- **USYC titan promotion** trigger doc (`SS #6`). When Hashnote's circulating supply crosses the titan threshold, document the promotion path (heritage entry retires, titan entry activates).
- **Audio layer** per §10 — re-evaluate after Wave 4 lands.
- **`motion-sampling.ts` split** (Engineer cross-lane ask — `motion-sampling.ts` is 1,045 LOC, at threshold for a split). Helmsman to assess test coverage and propose breakdown.
- **Stretched WebP coverage** for any post-Wave-4 sprite regens — keep the `webpPath` discipline.
- **Pigeonnier interaction polish** — the Wave 4 night-halo + birds improve discoverability; a future polish could add an in-canvas toast on hover ("PharosWatch Telegram bot — click for depeg alerts") so the CTA reads even before clicking through.

## 12. Appendix — Full proposal index

Reference for tracing each task back to its council source. Status reflects whether the proposal made it into a wave above.

### Visual Director (16 → 14 adopted, 2 deferred/merged)

| ID | Title | Wave | Notes |
|---|---|---|---|
| VD #1 | Tighten ramp around lantern warm anchor | W1.13 | Merged with HY #1/#11 in §6.1 |
| VD #2 | Atmospheric perspective veil | W4.02 | |
| VD #3 | 1.8s first-load reveal beat | W4.01 | |
| VD #4 | Establishing-shot letterbox + caption | W4.03 | |
| VD #5 | Day-warm horizon haze | W1.14 | |
| VD #6 | Pre-dawn + golden hour moods | W1.15 | |
| VD #7 | Soft scanline + dither film grain | W4.05 | |
| VD #8 | Cloud shadow drift | W4.06 | |
| VD #9 | Detail-panel ↔ canvas warm-light bridge | W1.17 | |
| VD #10 | Cinematic vignette across day/night | W1.16 | |
| VD #11 | Time-of-day badge + scrub override | W4.04 | |
| VD #12 | Lower-thirds caption strip | W2.17 | |
| VD #13 | Lightning palette tighten + thunder-rim | W1.18 | |
| VD #14 | Loading state continuity | W4.07 | |
| VD #15 | Ambient color chord (PSI×DEWS×night) | W3.13 | Coordinated in §6.2 |
| VD #16 | Halve eastern sparkle density | W3.16 | |

### Ship Sculptor (14 → 14 adopted)

| ID | Title | Wave |
|---|---|---|
| SS #1 | USDT kraken regen | W2.01 |
| SS #2 | Five unfinished titans (PYUSD/USD1/BUIDL/USDe/sUSDe) | W2.02 |
| SS #3 | Standard-hull pennant + lantern | W2.09 |
| SS #4 | Heritage tier chrome (pennant/lantern/nameplate) | W2.04 |
| SS #5 | xAUT regen | W2.03 |
| SS #6 | USYC re-tier + FRAX + GHO additions | W2.06 |
| SS #7 | Differentiated rings | W2.11 |
| SS #8 | Squad bunting + admiral banner volume | W2.12 |
| SS #9 | Per-titan hull trim | W2.07 |
| SS #10 | Wake personality per class | W2.10 |
| SS #11 | Signal-flag mast string | W2.13 |
| SS #12 | Heritage sail flutter | W2.05 |
| SS #13 | Per-ship mast-lantern color | W2.08 |
| SS #14 | Reduced-motion frames audit | W1.19 |

### Hydrographer (14 → 14 adopted)

| ID | Title | Wave |
|---|---|---|
| HY #1 | DEWS chroma ladder widen | W1.13 (§6.1) |
| HY #2 | Danger Strait violence | W3.01 |
| HY #3 | Warning reef default identity | W3.02 |
| HY #4 | Calm glass-mirror | W3.03 |
| HY #5 | Open water wind-fetch | W3.04 |
| HY #6 | Deep starlight + radial darkening | W3.05 |
| HY #7 | Beam daytime glitter trail | W3.11 (§6.2) |
| HY #8 | Seawall spray plumes + ripple anchors | W3.10 |
| HY #9 | Zone-border feathering | W3.06 |
| HY #10 | Watch south/east split | W3.07 |
| HY #11 | Ledger parchment underbase | W3.08 (§6.1) |
| HY #12 | Per-zone plaque chrome | W3.09 |
| HY #13 | Reduced-motion audit | W1.19 |
| HY #14 | Beam night directional spill | W3.12 (§6.2) |

### Harbormaster (16 → 16 adopted)

| ID | Title | Wave |
|---|---|---|
| HM #1 | Hyperliquid sprite | W4.08 |
| HM #2 | Center-cluster agora regen | W4.09 |
| HM #3 | Sundial bump | W4.10 |
| HM #4 | Dock prop pack | W4.13 |
| HM #5 | Per-chain land flag | W4.14 |
| HM #6 | Waystone plaque | W4.15 |
| HM #7 | Pigeonnier halo + birds | W4.16 |
| HM #8 | Solana scale-up | W4.17 |
| HM #9 | AVAX/Base/Polygon/Arbitrum regen | W4.18 |
| HM #10 | Chimney smoke wisps | W4.12 |
| HM #11 | Beach-foam ribbon | W4.19 |
| HM #12 | Mooring bunting | W4.20 |
| HM #13 | Civic vegetation reshuffle | W4.11 |
| HM #14 | Day-beam alpha + night-pool radius | W3.14 (§6.2) |
| HM #15 | Yggdrasil canopy lanterns | W4.21 |
| HM #16 | Cemetery memorial props | W4.22 |

### Helmsman (14 → 14 adopted)

| ID | Title | Wave |
|---|---|---|
| HL #1 | Heading → hull orientation (flip path) | W2.14 |
| HL #2 | Calm patrol itineraries | W4.23 |
| HL #3 | 3-phase docking | W3.17 |
| HL #4 | Cast-off mirror | W3.18 |
| HL #5 | Sea-state master signal | W2.16 (§6.3) |
| HL #6 | Squad fan + heading lag | W4.24 |
| HL #7 | Risk-transition tack-out | W4.25 |
| HL #8 | Heading-aware spray asymmetry | W2.15 |
| HL #9 | Follow-cam spring chase | W4.26 |
| HL #10 | Mooring sub-phases | W3.19 |
| HL #11 | Sea-room separation relaxation | W3.20 |
| HL #12 | Per-ship pose personality bias | W1.21 |
| HL #13 | Cue-priority arbiter | W4.27 |
| HL #14 | Reduced-motion freeze at primary dock | W1.20 |

### Engineer (16 → 16 adopted)

| ID | Title | Wave |
|---|---|---|
| EN #1 | Cache lighthouse god-ray gradients | W1.03 |
| EN #2 | Path2D-cache titan foam/spray/mooring | W1.04 |
| EN #3 | Split `ships.ts` | W1.01 |
| EN #4 | Wire effect dep array | W1.07 |
| EN #5 | Static cache → Map | W1.05 |
| EN #6 | Harden `_log.ts` | W1.10 |
| EN #7 | error-reporter AbortSignal lifecycle | W1.11 |
| EN #8 | Keyboard entity-cycling | W2.19 |
| EN #9 | requestIdleCallback prefetch budgeting | W4.29 |
| EN #10 | WebP migration | W2.18 (partial) → W4.28 (close-out) |
| EN #11 | Tighten `tsconfig.json` | W1.02 |
| EN #12 | Ring-buffer telemetry windows | W1.06 |
| EN #13 | Structured logging on 502/timeout | W1.12 |
| EN #14 | Disconnect-then-assign longtaskObserver | W1.08 |
| EN #15 | Type `__pharosVilleTestWallClockHour` | W1.09 |
| EN #16 | Sail cache telemetry counters | W2.20 |

---

**End of plan.** Total adopted: 90 of 90 proposals across 4 waves, 11 of them coordinated as 3 cross-lane epics (§6.1 / §6.2 / §6.3). Mid-Wave-2 deliverable: every titan + heritage hull paints its emblem with painted livery + masthead lantern + signal flags + differentiated rings. End-of-Wave-4 deliverable: a first-load reveal beat, civic agora plaza, lively docks across all chains, fleet-feel motion, and a lighthouse that touches every named water zone day and night.

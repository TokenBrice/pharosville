# PharosVille Upgrade Plan — Consolidated & Ranked

Date: 2026-06-09
Author: Claude (Fable 5), from a 5-lane parallel exploration of the repo
(visual/rendering, performance, metaphor/data, motion/UX, existing backlog).

## Execution status (updated 2026-06-09, same-day execution pass)

Waves A–C plus the contained slice of Wave D were executed in this session.
Summary of what landed (validated: typecheck, 839 unit tests, build, all 20
visual lanes with regenerated baselines):

- **DONE 1.1** Legend/onboarding overlay — auto-opens first visit
  (`use-legend-dialog.ts`, `legend-panel.tsx`); zone swatches derive from
  `RISK_WATER_AREAS`/`ZONE_THEMES`. Test setups seed the dismissed flag.
- **DONE 1.2 (recalibrated)** Depeg dramatization — `ShipNode.depegHistory`
  + hull-weathering streaks (severity shared with the "Depeg history"
  detail/ledger row via `depegHistorySeverity`), lighthouse "Last fleet
  depeg" fact. Beam-warmth-by-recency was dropped: the beam already warms
  under elevated DEWS (pre-existing, with parity copy).
- **DONE 1.3** Hover tooltips (RAF-positioned DOM card) + hover halo.
- **DONE 1.5** Ship search with select-then-follow.
- **DONE 1.6** Scheduler hysteresis (3-frame down / 8-frame up streaks);
  manifest + sprite Cache-Control rules in `public/_headers`. Decode
  batching + WebP fallback were already in-tree (W6.13 landed).
- **DONE 2.5** Supply-momentum sails (`supplySailMomentumFactor`) + the
  "Supply momentum" fact (folded into the panel's 24h row to respect the
  <= 8-row density contract; standalone line in the ledger).
- **DONE 3.2 / 3.3 / 3.4** Keyboard-focus beacon, panel entrance
  animations, zone arrival pulse (one-shot label glow off W4.25 routes).
- **ALREADY IN-TREE (verified, no work needed)** 2.1 lighthouse night
  presence (lighthouse-night layer, fire glow, god rays), 2.3 storm
  atmosphere (weather.ts threat clouds + per-zone lightning + parity
  descriptors), the entire Tier-4 P0 correctness batch, `functions/_shared.ts`,
  allocation-light telemetry rings, and risk-transition DOM parity (W5.01).
  The 2026-05-22 code-health plan's P0 section is stale — treat as done.
- **PARTIAL 2.2** Lighthouse contact shadow added; docks already had a
  grounding underlay. Dock caustics not done.
- **PARTIAL 2.6** Constrained tier now sheds `water-accents` +
  `coastal-water-motion`; the full static/accent split (smoothness Phase 3)
  remains open.
- **REMAINING (deliberately deferred to a fresh session — determinism-
  sensitive refactors):** 1.4 docking maneuver phases + heading easing,
  motion-sampling.ts split, terrain.ts visible-tile extraction, 2.7
  zoom-gated progressive disclosure (note: overlay/wake LOD budgeting and
  heritage-nameplate zoom gates already exist), Tier 2.4 metaphor
  quick-wins, Tier 3 remainder, Wave 6 asset pass.

## How this plan was built

Five exploration passes surfaced ~90 raw opportunities. This file dedupes and
ranks them by **estimated impact** (user-visible delta per unit of effort),
folding overlapping ideas into single tasks. Pre-existing committed backlogs
(Wave 6 identity pass in `agents/2026-05-18-wave6-implementation-prep.md`,
code-health plan in `agents/2026-05-22-code-health-implementation-plan.md`)
are referenced, not re-planned — see the Appendix.

File references and line numbers below come from exploration agents; verify
before editing. Effort: S (< half day), M (½–2 days), L (multi-day).

## Standing constraints (apply to every task)

- Canvas is never the only carrier of meaning: any new **analytical** visual
  signal needs matching detail-panel / accessibility-ledger text
  (`docs/pharosville/CURRENT.md`). Pure-flavor additions (atmosphere) are
  exempt but must carry no implied data semantics.
- Reduced motion must keep a deterministic non-animated frame with no RAF loop
  (`docs/pharosville/MOTION_POLICY.md`).
- Manifest cap is 75 entries (currently 73); new sprite assets are expensive —
  check `scripts/pharosville/validate-assets.mjs` and first-render budgets.
- Desktop gate: narrow viewports must not mount the world runtime.
- Dock visits express chain presence/supply share only — never bridge volume
  or transfer flow.
- Validate per `AGENTS.md`; use `npm run validate:changed` while iterating.

---

## Tier 1 — Highest impact (do these first)

### 1.1 First-visit onboarding / legend overlay — Impact: HIGH, Effort: M

The single biggest legibility gap: a new visitor lands on a dense isometric
map with no explanation that ships = stablecoins, water zones = risk states,
docks = chains, ship size = market-cap tier, lighthouse = PSI. Nothing in the
UI teaches the metaphor.

- [ ] Add a dismissible legend/onboarding panel (DOM, not canvas) shown on
      first load, persisted via `localStorage`; reachable later from the
      toolbar as a "Legend" button.
- [ ] Content: water-zone color key (from `ZONE_THEMES` in
      `src/systems/palette.ts`), ship class/size key, lighthouse meaning,
      pointer/keyboard controls.
- [ ] Reduced-motion: static panel, no entrance animation.
- Files: new onboarding-panel component (under `src/components/`) + hook;
  `world-toolbar`; `src/pharosville.css`.
- Verify: vitest for first-load/dismiss/persist logic; visual snapshot;
  keyboard + screen-reader pass.

### 1.2 Depeg-event dramatization (market weather) — Impact: HIGH, Effort: M

The world's core promise is "see market drama at a glance," but historical /
frequency depeg signals already in the fetched `pegSummary` payload
(`eventCount`, `worstDeviationBps`, `lastEventAt`) are only used for
placement. Big events should *visibly* change the world.

- [ ] Drive lighthouse beam warmth/intensity from fleet-wide recent depeg
      recency (`lastEventAt` max across coins): recent event (<7d) shifts the
      beam warm; calm fleet returns it to white. Extend the existing
      threat-aware beam code (`src/renderer/layers/lighthouse.ts`,
      `src/renderer/lighthouse-beam.ts`).
- [ ] Per-ship "weathering" cue for high `eventCount` / deep
      `worstDeviationBps` ships (hull scorch/scar overlay pass), with a
      matching "Depeg history" line in `detail-model.ts` and the
      accessibility ledger.
- [ ] Optional: storm-zone chop/foam intensity scales with concentration of
      high-deviation ships present (ties into Tier 2 storm-chop task).
- Files: `src/systems/detail-model.ts`, `src/renderer/layers/ships/*`,
  `lighthouse.ts`; data already in `src/pharosville-desktop-data.tsx`.
- Verify: fixture scenario with a fresh depeg event (`SCENARIO_CATALOG.md`);
  detail/ledger parity tests; visual snapshot for warm-beam state.

### 1.3 Canvas hover tooltips + hover emphasis — Impact: HIGH, Effort: M

Hit-testing already resolves hover targets, but the only feedback is the
selection ring on click. Casual inspection currently costs a click + panel
read per entity.

- [ ] Position-anchored DOM tooltip on entity hover: name/symbol, risk-zone
      label, supply tier (ship); chain + deployment count (dock); zone band
      (water label). ~200ms fade-in, none under reduced motion.
- [ ] Subtle hover glow/emphasis on the hovered entity in
      `src/renderer/layers/selection.ts` (low-alpha halo, no scale pop).
- Files: new tooltip component + hook wired to existing hit-testing in
  `src/pharosville-world.tsx`; `selection.ts`.
- Verify: hover does not steal focus or break keyboard nav; perf check that
  hover redraws stay within interaction-tier budget.

### 1.4 Ship state-transition animation + risk-transition DOM parity — Impact: HIGH, Effort: L

Ships currently snap between analytical states (mooring, risk-zone changes).
The motion side of risk transitions is already wired
(`ShipMotionSample.riskTransition`, from the wow-revamp plan W4.25) but the
detail panel / ledger never surface it — a half-finished feature.

- [ ] Surface "tracking new risk band" in `detail-model.ts` and
      `accessibility-ledger.tsx` (closes the deferred W4.25 parity gap).
- [ ] Docking maneuver phases: decelerate on dock approach → gentle contact →
      taut mooring, instead of linear slide (`src/systems/motion-sampling.ts`
      transit profiles; wake dampening in
      `src/renderer/layers/ships/wake.ts`).
- [ ] Heading/sail-trim easing (400–600ms) on risk-zone escalation instead of
      instant repath.
- Verify: motion determinism tests still pass; reduced-motion freeze
  positions unchanged; ledger parity test for the new row.
- Note: coordinate with the `motion-sampling.ts` split (Tier 4) — doing the
  split first makes this safer.

### 1.5 Ship search / filter — Impact: HIGH, Effort: M

With 100+ ships there is no way to find a specific stablecoin except panning
and squinting.

- [ ] Toolbar search box: filter/jump by name or symbol; selecting a result
      selects the ship and engages follow-selected (camera logic already
      exists in `src/hooks/camera-intent.ts`).
- [ ] Highlight matches with the existing selection-halo treatment; announce
      result count for screen readers.
- Files: new `use-ship-search.ts`, `world-toolbar`; reuse follow-selected.
- Verify: keyboard-only flow (type → enter → focused ship); works with
  moored-hidden standard hulls (search should still resolve them — surface
  via detail panel even when sprite is hidden, or temporarily reveal).

### 1.6 Perf quick-wins bundle — Impact: HIGH (load + smoothness), Effort: S–M

Three independently small changes with measurable payoff; ship as one pass.

- [ ] **Render-scheduler hysteresis**: require a multi-frame streak before
      tier downshifts/upshifts to stop pass-flicker under load
      (`src/renderer/render-scheduler.ts`; mirror the existing
      ADAPTIVE_DPR_DOWNSHIFT_STREAK pattern). (S)
- [ ] **Manifest caching**: cache headers / local cacheVersion check so the
      ~71KB `manifest.runtime.json` isn't re-fetched every load
      (`src/renderer/asset-manager.ts`, Cloudflare headers config). (S)
- [ ] **Deferred-asset decode batching**: decode deferred sprites in idle
      slots (and prefer WebP once W6.13 lands) instead of 6-way parallel
      fetch+decode on the main thread (`asset-manager.ts`). (M)
- Verify: `npm run test:visual` perf project (`sustained-motion.spec.ts`
  baselines: median ≤140ms, p95 ≤200ms); compare
  `window.__pharosVilleDebug.renderMetrics` before/after.

---

## Tier 2 — High value, second wave

### 2.1 Lighthouse night presence (glow, god-rays, lens flare) — Impact: HIGH (visual), Effort: M

The lighthouse is the world's anchor but reads as a silhouette at night.

- [ ] Warm radial bloom around the fire point at night; stronger beacon
      reflection on nearby water (`src/renderer/layers/lighthouse.ts`,
      `night-tint.ts`).
- [ ] Richer god-ray fan (more rays, softer falloff; optionally wider spread
      at higher threat) — extends the existing pre-baked ray cache.
- [ ] Small lens-flare rings at the beam origin (S add-on).
- Verify: visual snapshots at night fixture; static-cache invalidation still
  correct; frame budget unchanged (rays are pre-baked).

### 2.2 Depth & grounding pass: landmark shadows + dock caustics — Impact: MED-HIGH, Effort: M

Ships have contact shadows; the lighthouse, docks, and seawall do not, so
tall elements float visually.

- [ ] Soft procedural contact shadows under the lighthouse, major docks, and
      tall props (static-scene pass, so cached — near-zero frame cost).
- [ ] Subtle animated caustic shimmer beneath major dock bodies, modulated by
      the existing wind multiplier.
- Files: `src/renderer/layers/docks.ts`, `lighthouse.ts`, static scene pass
  in `world-canvas.ts`.
- Verify: visual snapshots; confirm shadows land in the cached static layer.

### 2.3 Storm/danger-zone atmosphere — Impact: MED-HIGH, Effort: M

Danger Strait should feel menacing; today it's mostly a palette change.

- [ ] Procedural whitecap streaks + foam flecks in WARNING/DANGER zones,
      amplitude from `ZONE_THEMES` motion scalars and threat level.
- [ ] Scale the existing bioluminescent sparkle intensity/density by threat
      (`src/renderer/layers/ambient.ts` SPARKLE_POINT_DEFS). (S)
- Files: `src/renderer/layers/terrain.ts` zone draw functions.
- Verify: zone semantics unchanged (palette test `palette.test.ts`); perf
  tier degradation still skips accents under load (see 2.6).

### 2.4 Metaphor quick-wins (no new endpoints) — Impact: MED-HIGH, Effort: S each

Fields already fetched but never visualized. Each needs detail/ledger parity.

- [ ] **Price-confidence compass**: small compass emblem clarity/saturation
      from `priceConfidence` (high → bright; fallback → obscured). Detail
      line exists conceptually in placement evidence — surface it.
- [ ] **Source-consensus rigging**: rigging density from
      `consensusSources`/`agreeSources` count; detail panel lists sources.
- [ ] **Audit shield**: small heraldic audit badge (✓/✗) on selected /
      titan / heritage ships from `reportCards.rawInputs.smartContractAudit`
      + `bluechipGrade`; detail line "Smart contract audit".
- [ ] **Chain diversity lanes**: dock visual density from per-chain
      `backingDiversity` (narrow congested slip vs open harbor); detail line
      on the dock panel.
- Files: `src/systems/ship-visuals.ts`, `detail-model.ts`,
  `src/renderer/layers/ships/*`, `docks.ts`.
- Verify: ledger parity tests per signal; emblem rules respect the painted
  sail-emblem policy (`SHIP_SAIL_EMBLEM_PAINTED`).

### 2.5 Supply-volatility sails — Impact: HIGH (metaphor), Effort: M

`circulatingPrevDay/Week/Month` are fetched but unused. Supply churn is the
most "alive" market signal available without new endpoints.

- [ ] Sail fullness/billow amplitude driven by recent supply-change velocity;
      calm supply = slack sails. Modest, zone-readable amplitudes.
- [ ] Detail panel: "Supply momentum" line (24h/7d/30d deltas, some already
      shown via `change24hUsd` — extend to the longer windows).
- Files: `src/renderer/layers/ships/sail.ts`, `ship-visuals.ts`,
  `detail-model.ts`.
- Verify: reduced-motion static sail; cue-priority unaffected; visual
  snapshot on dense fixture.

### 2.6 Water pass degradation + static/accent split — Impact: MED (perf), Effort: M

Per-frame procedural water accents (`drawWaterTerrainAccents`,
`drawCoastalWaterDetails`) redraw 1000+ tiles every frame. The smoothness
follow-up plan (Phase 3) already proposes splitting static texture from
continuous accents — finish it.

- [ ] Degrade/skip water accent passes in `recovery`/`constrained` scheduler
      tiers; consider half-rate accents during interaction.
- [ ] Land the Phase 3 static-vs-accent split from
      `agents/2026-05-17-pharosville-smoothness-follow-up-plan.md` (do its
      Phase 2 allocation-light telemetry first for a honest baseline).
- Verify: perf baselines; visual diff acceptable in degraded tiers.

### 2.7 Zoom-dependent progressive disclosure — Impact: MED-HIGH, Effort: M

All detail renders at all zooms; far zoom is noisy, near zoom underused.

- [ ] Below a zoom threshold: simplify ships (skip overlays/pennants/logos);
      above ~1.0: reveal extra detail (pennants, nameplates, chain glows).
- [ ] Centralize zoom gates as helpers (e.g. in `src/renderer/geometry.ts`
      or `visual-config.ts`) instead of per-layer magic numbers.
- Verify: hit targets unchanged across zoom; perf improves at far zoom.

---

## Tier 3 — Valuable, schedule opportunistically

### 3.1 Minimap / viewport indicator — Impact: MED-HIGH, Effort: L
Small corner minimap (docks + titan ships at coarse scale, viewport rect,
click-to-jump). Big nav win when zoomed in, but a new render surface +
interaction model — schedule after Tier 1 UX items prove out.

### 3.2 Keyboard-focus beacon on canvas — Impact: MED, Effort: S
Tab/arrow cycling works (`use-world-keyboard-targets.ts`) but is invisible on
the map. Add a pulsing focus outline (static ring under reduced motion).
Strong a11y win for small effort.

### 3.3 Panel motion polish — Impact: MED, Effort: S
Entrance/exit transitions (200–300ms) for detail panel, changelog panel, and
accessibility ledger; respect `prefers-reduced-motion`. Pure CSS.

### 3.4 Risk-zone data-update pulse — Impact: MED, Effort: S
One-shot shimmer pulse (400ms fade) on a water area when its band changes on
refetch, plus a ledger announcement. Makes live data feel live.

### 3.5 Wake/foam upgrade — Impact: MED, Effort: M
Spray particles above a speed threshold; faint trail persistence with fade.
Touches the hot path — gate behind scheduler tier and profile.

### 3.6 Sky depth + cloud parallax — Impact: MED, Effort: M
Second slower cloud layer with parallax drift; wispy high-altitude streaks
(`src/renderer/layers/sky.ts`).

### 3.7 Collateral-composition cargo deck — Impact: HIGH (metaphor), Effort: L
Stacked cargo modules color-coded by reserve type/risk tier from
`reportCards.rawInputs.collateralQuality` / reserves data, with detail-panel
drilldown. The strongest unbuilt metaphor, but needs design care + possibly
endpoint allowlisting for live reserves — spec it before building.

### 3.8 Attestation pennants — Impact: MED-HIGH (metaphor), Effort: S–M
Pennant flags encoding attestation method mix. **Blocked on allowlisting the
live-reserves endpoint** in `functions/api/[[path]].ts` — confirm backend
contract first per `AGENTS.md` change rules.

### 3.9 Governance-quality hull detailing — Impact: MED, Effort: M
Extend the governance→class mapping with hull-condition detailing from
`rawInputs.governanceQuality` (strong = polished, weak = patched), plus a
"Ship integrity" detail line.

### 3.10 Harbor/dock lantern glow + flicker — Impact: LOW-MED, Effort: M
Warm pulsing glow under harbor lamps, flicker tempo loosely coupled to the
lighthouse PSI band. Atmosphere only; no parity needed.

### 3.11 Cemetery atmosphere — Impact: LOW-MED, Effort: M
Per-cause marker glow tints and weathering detail in
`src/renderer/layers/graves.ts`. Emotional polish for an already-loved
feature.

---

## Tier 4 — Hygiene & foundations (enables the above)

These are mostly pre-identified in the code-health plan; the items below are
the ones that directly unblock Tier 1–2 work or are correctness-relevant.

- [ ] **P0 correctness batch** from
      `agents/2026-05-22-code-health-implementation-plan.md`: API path
      normalization hardening, stale visual-test split grep, squad evidence
      copy, variant validation alignment, `previousRiskByShipId` lifecycle.
      All still open. (S–M total, do early — cheap insurance.)
- [ ] **Split `motion-sampling.ts` (~1900 LOC)** by concern before touching
      docking/transition animation (unblocks 1.4). (M)
- [ ] **Extract visible-tile traversal from `terrain.ts` (~2000 LOC)** before
      adding storm chop / water accents (unblocks 2.3, 2.6). (M)
- [ ] **Allocation-light telemetry** (smoothness plan Phase 2): fixed-size
      rings + scratch buffers so perf work in 1.6/2.6 measures honestly. (M)
- [ ] **Static-cache LRU O(1) eviction** (`world-canvas.ts`
      `evictOldestCacheEntry` is O(n) per eviction). (M, MED impact)
- [ ] **Ship-body-cache warmup tuning**: warm proportionally to visible ship
      count; sticky priority for selected/flagship ships. (S)
- [ ] **Hit-target culling/deferral**: compute hit geometry only for
      margin-viewport entities, or recompute on pointer movement. (M)
- [ ] Prune ~20MB of stale unnamed `*-linux.png` visual baselines (dedicated
      PR, confirm unused first). (S)

---

## Suggested sequencing

1. **Wave A (foundation + quick wins):** Tier 4 P0 batch → 1.6 perf bundle →
   3.2/3.3/3.4 small UX polish.
2. **Wave B (legibility):** 1.1 onboarding/legend → 1.3 tooltips → 1.5 search.
3. **Wave C (drama):** 1.2 depeg dramatization → 2.1 lighthouse night →
   2.3 storm atmosphere → 2.5 volatility sails.
4. **Wave D (depth):** motion-sampling split → 1.4 transitions → 2.2 shadows
   /caustics → 2.7 progressive disclosure → 2.6 water split.
5. **Wave E (expansion):** Tier 3 picks by appetite; spec 3.7 cargo deck.

Run the full `AGENTS.md` validation suite before claiming completion of any
wave; inspect visual diffs before updating baselines.

---

## Appendix — pre-existing committed backlogs (not re-planned here)

- **Wave 6 identity pass** (`agents/2026-05-18-wave6-implementation-prep.md`):
  painted titan emblems (USDT canary first), xAUT regen, FRAX/GHO heritage
  hulls, agora overlay, Hyperliquid/Solana/AVAX/Base/Polygon/Arbitrum dock
  regens, sundial + 3 ambient props, **WebP fallback infra (W6.13 — also a
  prerequisite for the decode-batching item in 1.6)**, manifest cap raise
  69→75, consolidated provenance + cache bump. Status: open, decisions
  D1/D2/D4 locked.
- **Code-health implementation plan**
  (`agents/2026-05-22-code-health-implementation-plan.md`): P0–P4 ladder
  (correctness → source-of-truth consolidation → modularization → systems
  cleanup → test/config cleanup). Tier 4 above cherry-picks the items that
  unblock this plan; the rest remain valid as written.
- **Smoothness follow-up**
  (`agents/2026-05-17-pharosville-smoothness-follow-up-plan.md`): Phase 1
  camera-in-world-RAF, Phase 2 allocation-light telemetry, Phase 3 water
  split. Phases 2–3 are folded into 1.6/2.6/Tier 4 above; Phase 1 remains
  open as written.
- **Explicitly deferred by predecessors:** audio/sonification (wow-revamp
  plan §10) — revisit only after Waves A–C land.

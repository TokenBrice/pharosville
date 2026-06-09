# PharosVille Upgrade — Follow-Up Plan (deferred items)

Date: 2026-06-09
Predecessor: `agents/pharosville-upgrade.md` (see its "Execution status"
section for what already landed and which plan items turned out to be
pre-existing). This file scopes the work that was deliberately deferred to a
fresh session because it is refactor-heavy or determinism-sensitive.

Read first: `AGENTS.md`, `docs/pharosville/CURRENT.md`,
`docs/pharosville/MOTION_POLICY.md`, `docs/pharosville/VISUAL_REGEN.md`.

## Session notes from the 2026-06-09 execution pass (gotchas)

- **Detail panel density contract:** the visible panel caps at 8 fact rows
  (`detail-panel.test.tsx`). New ship signals should fold into existing rows
  (see how "Supply momentum" joins the 24h row in
  `src/lib/format-detail.ts`) or be significance-gated. The accessibility
  ledger has no cap — full lines go there.
- **Panel fact whitelist:** `buildDetailFactSections` in
  `src/lib/format-detail.ts` curates which DetailModel facts reach the DOM
  panel. A new fact label must be registered there or it only reaches the
  ledger.
- **Shared severity pattern:** when a canvas cue and its DOM copy encode the
  same signal, derive both from one exported function
  (`depegHistorySeverity` in `src/systems/detail-model.ts` is the
  precedent), so they can never disagree.
- **jsdom in vitest has no `localStorage`**; component tests needing it must
  stub it (see `src/hooks/use-legend-dialog.test.tsx`). Browser-only
  first-visit features must be seeded off in `src/test-setup.ts` and in
  `installWallClockOverride` (`tests/helpers/pharosville-debug.ts`), which
  every visual/perf lane runs before `page.goto`.
- **Visual baseline regen:** dev-config baselines regenerate locally; dist
  baselines must come from the CI Docker image (`VISUAL_REGEN.md`). The
  container writes root-owned files into `dist/`, `test-results/`, and
  `node_modules/.package-lock.json` — chown them back via a follow-up
  `docker run … chown` or sudo, or local `npm run build` fails with EACCES.
- **Long-lived dev tabs** accumulate broken HMR state across module-graph
  edits and can trip the route error boundary; always re-verify on a fresh
  load before suspecting a code defect.

## P1 — Motion depth (the core deferred work)

### F1. Split `motion-sampling.ts` (~1900 LOC) by concern — Effort: M
Prerequisite for F2. Mechanical split preserving every public export:
consort shadowing, reduced-motion freeze, route-cycle resolution, transit
profiles, mooring, ledger behavior, risk drift, sea-room. No behavior
change; the gate is `npm test` byte-identical motion expectations plus the
normal-motion visual lane.

- [ ] Map public exports and their consumers first; keep `motion-sampling.ts`
      as a re-export barrel so callers don't churn.
- [ ] Move pure helpers per concern into `src/systems/motion-sampling/*.ts`.
- [ ] Verify: `npm test`, `npm run test:perf`, normal + reduced-motion visual
      lanes unchanged (no baseline updates expected).

### F2. Docking maneuver phases + risk-heading easing (plan 1.4 remainder) — Effort: L
Ships currently slide linearly to berth and snap heading on risk repath.

- [ ] Three-phase dock approach in the transit profile: cruise → decelerate
      (~last 15% of the approach path) → gentle contact + taut mooring
      (reuse `mooringTension`).
- [ ] Heading/sail-trim easing (400–600ms) when a route's risk target
      changes, layered on the existing W4.25 tack-out blend.
- [ ] Constraints: deterministic per (shipId, route, time) — no wall-clock or
      RNG in the sampler; reduced-motion freeze positions must not move;
      `ShipMotionSample` shape changes need debug-field parity in
      `use-world-render-loop` telemetry and MOTION_POLICY.md updates.
- [ ] Verify: motion determinism tests, dock-berth freeze tests,
      `test:visual` motion lane, perf baselines (sampler is hot-path).

### F3. Smoothness plan remainder — Effort: M
From `agents/2026-05-17-pharosville-smoothness-follow-up-plan.md`:

- [ ] Phase 1: move camera stepping fully into the world RAF (kill the
      hook-local camera RAF during camera animation).
- [ ] Phase 3: full water static/accent split. Note the constrained-tier
      shedding of `water-accents`/`coastal-water-motion` already landed
      (2026-06-09); this item is about making the static portion cacheable so
      the accents-only pass gets cheaper at full tier too.

## P2 — Renderer depth

### F4. Zoom-gated progressive disclosure (plan 2.7) — Effort: M
Partially exists: overlay/wake LOD budgeting (`planShipRenderLod`),
`SHIP_LOD_SKIP_THRESHOLD`, and the heritage-nameplate zoom gate. Remaining:

- [ ] Centralize zoom thresholds as named constants (e.g. in
      `src/renderer/visual-scales.ts`) instead of per-layer magic numbers.
- [ ] Below ~0.6 zoom: skip pennants/logo overlays on standard hulls.
- [ ] Above ~1.0 zoom: reveal extra detail (chain glows, richer pennants).
- [ ] Hit targets must not change across zoom; verify hover/selection tests.

### F5. Dock caustic shimmer (plan 2.2 remainder) — Effort: S-M
Docks already have grounding underlays; add a subtle animated caustic ripple
under the four major dock bodies, modulated by the existing wind multiplier,
gated behind the scheduler (`recovery` keeps, `constrained` sheds).

### F6. Terrain visible-tile traversal extraction — Effort: M
`terrain.ts` (~2000 LOC) repeats bounds/row/projection loops across
`drawTerrainBase` / `drawWaterTerrainStaticDetails` /
`drawWaterTerrainAccents`. Extract one visible-tile scanner helper before
any further water work (unblocks F3 Phase 3).

## P3 — Metaphor quick-wins (plan 2.4, all unblocked)

Each needs detail/ledger parity and respects the 8-row panel cap (fold or
gate). Data is already fetched.

- [ ] Price-confidence cue from `priceConfidence` (compass emblem clarity or
      detail-row only first pass).
- [ ] Source-consensus rigging density from `consensusSources`/`agreeSources`.
- [ ] Audit shield from `reportCards.rawInputs.smartContractAudit` +
      `bluechipGrade` (selected/titan/heritage ships only).
- [ ] Chain-diversity dock congestion from `chains.backingDiversity`.

## P4 — Larger bets (spec before building)

- [ ] **Minimap / viewport indicator** (plan 3.1, L): corner minimap with
      docks + titans + viewport rect + click-to-jump. Spec interaction with
      the desktop gate and fullscreen mode first.
- [ ] **Collateral-composition cargo deck** (plan 3.7, L): strongest unbuilt
      metaphor; needs design spec + possibly live-reserves endpoint
      allowlisting in `functions/api/[[path]].ts` (backend contract change —
      confirm intentionally per AGENTS.md).
- [ ] **Attestation pennants** (plan 3.8): blocked on the same endpoint
      allowlisting decision.
- [ ] Tier 3 remainder by appetite: wake trail upgrade (hot path — profile),
      sky cloud parallax, governance hull detailing, harbor lantern flicker,
      cemetery marker atmosphere.

## P5 — Code health remainder

From `agents/2026-05-22-code-health-implementation-plan.md` — P0 is done
(verified 2026-06-09; the plan file predates the fixes). Still worth doing,
in this order:

- [ ] P1 source-of-truth consolidations (endpoint metadata, payload schema
      map, live-reserve adapter registry, duplicate-key guards, env
      discovery, executable budgets).
- [ ] Static-cache LRU O(1) eviction (`world-canvas.ts`
      `evictOldestCacheEntry` is O(n) per eviction).
- [ ] Ship-body-cache warmup proportional to visible ship count + sticky
      priority for selected/flagship ships.
- [ ] Hit-target culling/deferral (compute hit geometry only for
      margin-viewport entities or on pointer movement).
- [ ] Prune ~20MB of legacy unnamed `*-linux.png` baselines (dedicated PR,
      confirm unused first).
- [ ] P2/P3/P4 ladder items as capacity allows.

## Wave 6 asset pass

Unchanged and still open: `agents/2026-05-18-wave6-implementation-prep.md`
(painted titan emblems with the USDT canary first, FRAX/GHO heritage hulls,
dock regens, ambient props, manifest cap raise 69→75 — note the manifest
currently holds 73 entries against a cap of 75, so re-derive the headroom
math before starting). W6.13 WebP infra is already implemented.

## Suggested order

1. F1 (split) → F2 (docking phases) — the headline motion upgrade.
2. F6 (terrain extraction) → F3 (water split + camera RAF).
3. F4 + F5 renderer depth.
4. P3 metaphor quick-wins as palate cleansers between refactors.
5. Spec P4 items; decide the endpoint-allowlisting question once for both
   cargo deck and pennants.

Validation per `AGENTS.md` before claiming completion of any group; visual
baseline updates must follow `VISUAL_REGEN.md` (dist set from the CI Docker
image) with diffs inspected first.

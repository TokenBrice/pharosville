# Follow-up Implementation Plan
Date: 2026-05-03 (sequel)
Predecessor: `agents/perf-anim-routing-2026-05-03/PLAN.md`
Scope: enhancement opportunities surfaced by six specialized research agents, plus closure on the deferred items from the prior plan.

## Sources

Six research subagents ran in parallel:
1. **Renderer hot-path deep dive** — audited `cemetery.ts`, `lighthouse.ts`, `harbor-district.ts`, `center-cluster.ts`, `docks.ts`, `maker-squad-chrome.ts`, `terrain.ts`, `night-tint.ts`, `sky.ts` — files not covered in the original audit. Found 15 concrete opportunities.
2. **React lifecycle wiring** — answered the deferred questions about where `disposePathCacheForMap` belongs and how plan-rebuild on bucket-flip can attach. Verified that `world.map` is a module-singleton (`world-layout.ts:463-484`) so identity never changes mid-session.
3. **Behavioral richness** — proposed 6 candidate data-driven ship behaviors plus 5 explicit anti-features.
4. **Worker / atlas feasibility** — NO-GO on both, with reasoning.
5. **State-transition seam audit** — 7 transitions checked; 3 found discontinuous, including a high-impact wake-intensity step and a ~0.2-tile jump at the ledger-roaming seam.
6. **Telemetry expansion** — 8 proposed signals, sequenced by zero-cost-first.

## Verifiable success criteria

1. All existing tests + new tests green.
2. `npm run test:perf` passes with new behavioral assertions (heading delta, position delta, cache hit ratio).
3. Visual snapshots remain at zero pixel diff *or* drift is justified, isolated to a baseline-refresh PR, and operator-approved.
4. The deferred follow-ups from `PLAN.md` (dispose hook + bucket-flip rebuild) are wired and tested.
5. Seam-jump unit test prevents regression of the ledger-roaming seam fix.

---

## Phase A — Telemetry and test-pattern foundations *(land first)*

These build the safety net that lets later phases land confidently.

### A1. `shipMaxHeadingDeltaDeg` debug signal — zero-cost win
- `getShipHeadingDelta(shipId)` already exists (`motion-sampling.ts:119`). Aggregate the max in `updateDebugFrame` (`use-world-render-loop.ts:662-702`), publish on `renderMetrics.shipMaxHeadingDeltaDeg`. Gate behind `isVisualDebugAllowed()`.
- Add a perf-lane assertion: `expect(debug.renderMetrics.shipMaxHeadingDeltaDeg).toBeLessThanOrEqual(45)` over the polling loop.
- Risk: zero. Computation already happens.

### A2. `shipMaxPositionDeltaTile` debug signal
- Diff `frameState.samples` against a scratch `Map<string, {x,y}>` per frame. Take max Euclidean delta. Publish on `renderMetrics.shipMaxPositionDeltaTile`.
- Perf-lane assertion ≤ 0.5 tiles. This is the regression guard for seam-jump fixes (D1, D2 below).

### A3. `BoundedShipWaterRouteCache` hit/miss/eviction counters
- Add private `_hits`, `_misses`, `_evictions` to the class in `motion-planning.ts:47`. Expose `getStats(): { hits, misses, evictions, size, capacity }`.
- Surface via `renderMetrics.routeCacheStats: { hitRatio, evictionRate, size, capacity }`.
- Perf-lane assertion: hit ratio ≥ 0.85 after 10s warmup; eviction rate ≤ 5% of sets.
- Gives us the data needed to actually tune T3.4's LRU capacity formula in production.

### A4. Seam-detection unit test pattern
- New test in `motion.test.ts` that walks `resolveShipMotionSample` across a full cycle in 1/60s steps and asserts `tileDelta < 0.08` and `headingDelta < 23°` between adjacent samples (excluding moored states where heading sway is intentional).
- Will fail before D1/D2 land — leave as `.skip` initially or use it to drive the seam fixes.

### A5. `longtask` PerformanceObserver
- Register inside `isVisualDebugAllowed()` branch. Track count + max duration over 60-frame window. Publish `renderMetrics.longtask`.
- Perf-lane assertion: count == 0 over 5s sustained motion (any longtask = regression).

**Estimated cost:** 1 PR, ~150 LOC, no other-file ripple. Land before everything else.

---

## Phase B — Close the deferred lifecycle items from PLAN.md

### B1. Wire `disposePathCacheForMap(world.map)` into world unmount
- Attach a `useEffect(() => () => disposePathCacheForMap(world.map), [world.map])` cleanup in `src/pharosville-world.tsx` `PharosVilleWorldInner` after line 238.
- Add a test-only export `__testPathCacheSize(map)` to `motion-planning.ts`. Re-export through `motion.ts`.
- Test: render `PharosVilleWorldInner`, prime cache via `buildBaseMotionPlan`, assert `__testPathCacheSize > 0`, unmount, assert `__testPathCacheSize === -1`.
- Confirmed safe by Agent 2: `buildPharosVilleMap()` is a module singleton (`world-layout.ts:463-466`), so the dep array never re-fires mid-session.

### B2. Wire bucket-flip plan rebuild — approach (a)
- Add `lastBucketRef = useRef(0)` and `onBucketFlip?: (bucket: number) => void` to `useWorldRenderLoop`. Call the callback inside `drawFrame` when `Math.floor(accSecondsRef.current / 600)` changes.
- In `pharosville-world.tsx`, add `const [motionBucket, setMotionBucket] = useState(0)` and pass `onBucketFlip: setMotionBucket`. Update the `useMemo` deps for `baseMotionPlan` to include `motionBucket`, and call `buildBaseMotionPlan(world, motionBucket * 600)`.
- Cost: one React re-render per 600s, one `buildBaseMotionPlan` call (~0.5–2ms at 100 ships, dominated by sort + Map allocation; A* paths are still lazy).
- Test: stub a fast clock that advances `accSecondsRef` by 700s, assert `setMotionBucket` was called once, assert plan was rebuilt with `bucket=1`.
- Add `bucketFlipCount` to debug surface for monitoring.

**Estimated cost:** 1 PR, ~80 LOC. Depends on Phase A being landed (uses `bucketFlipCount` telemetry).

---

## Phase C — Render hot-path optimizations

These are independent of each other unless flagged. Group into 2 PRs by impact band.

### C-PR1: High-impact gradient and call-site fixes

#### C1. `terrain.ts:360` — beam-caustic gradient cache (HIGH) *(per Q1: per-tile LRU cache)*
- Replace per-tile `createRadialGradient` with an LRU cache keyed on `(x|0, y|0, zoom-bucket-4, alpha-bucket-20)`. Module-level Map; cap at ~256 entries (small relative to lit-tile count, preserves identity over many frames). Preserves the existing visual primitive — each tile still gets its own radial — so zero baseline-drift risk.
- Full-screen overlay variant explicitly out of scope per Q1.
- Estimated savings: ~10ms on dense-fixture frames.

#### C2. `night-tint.ts:26` — vignette gradient cache (HIGH)
- Cache the radial gradient on `(width|0, height|0, nightFactor-bucket-20)`. Module-level Map with size cap (3–5 entries — viewport rarely changes).
- Pattern already used by `getNightGradientBundle` in `lighthouse.ts`.

#### C3. `terrain.ts:354,356` — module-scope `BEAM_CAUSTIC_COS` constant (MED)
- `Math.cos(BEAM_CAUSTIC_HALF_ARC)` evaluated 3× per tile per frame. Hoist to module scope. One-line change. Pair with C1.

#### C4. `lighthouse.ts:489,512` — replace `forEach` with `for` loops (MED)
- Eliminates 9 closures + destructuring tuples per night frame.

### C-PR2: Medium-impact closures, parsing, and array allocs

#### C5. `docks.ts:232` — hoist `flagPath` closure (MED)
- N closures per frame currently. Convert to a free function `paintFlagPath(ctx, ...)`.

#### C6. `docks.ts:244` — `hexToRgba` parse cache (MED)
- Add `Map<string, { r, g, b }>` cache; pre-build the rgba string for the two alpha variants used.

#### C7. `maker-squad-chrome.ts:44,53-54` — scratch arrays for squad geometry (MED)
- Replace 4 `.map` calls + spread varargs with `for` loops into module-scope scratch arrays. ~10 allocs/frame × 2 squads.

#### C8. `terrain.ts:275,309,434,481` — sin lookup table for water textures (MED)
- 256-entry shared lookup table for harbor/calm/alert texture sin calls. Hits on every dynamic cache-miss frame (~10×/sec).

### C-PR3: Low-impact sweep (single PR)

- C9. `lighthouse.ts:600,753,344` — fold sweepAngle + fireFlicker compute (M4+M5).
- C10. `docks.ts:322,341` — hoist duplicate `ctx.font` assignment.
- C11. `cemetery.ts:452` — hoist `ctx.lineWidth` outside the 4-band mist loop.
- C12. `harbor-district.ts:47-49` — `WeakMap`-cache the L2 dock filter.
- C13. `sky.ts:410` — inline `starX` closure.
- C14. `night-tint.ts:23` — `Math.hypot` viewport diagonal cache (subsumed by C2 if implemented properly).
- C15. `lighthouse.ts:831` — hoist `flickerFreq = flickerSpeed * Math.PI * 2` outside glint loop.

**Estimated total Phase C savings:** 15–35ms on dense frames; budget tighten from 200ms toward 140ms (the actual goal of follow-up #1 in PLAN.md) becomes safe after this lands.

---

## Phase D — State-transition seam smoothness

### D1. Sailing → Arriving wake step (HIGH)
- `motion-sampling.ts:393-399` — wake jumps from full `baseWake` to 0 in one frame (arriving's `4p(1-p)` envelope is 0 at p=0).
- Add a per-ship `wakeIntensityMemory` (similar pattern to `headingMemoryByShipId`) with a fast exponential decay (tau ~0.15s). Feed raw computed wake through it before writing `out.wakeIntensity`.
- Test: sample 1/60s steps across the seam, assert `|wakeDelta| < 0.5`. Telemetry: `shipMaxWakeDelta` debug signal (extends A2 pattern).

### D2. Ledger idle → transit jump (HIGH)
- `motion-sampling.ts:717-750` — at progress=0.58 the orbit displacement (~0.14–0.20 tiles) is shed instantly as the ship hands off to `transitSampleInto` at `patrolProgress=0`.
- Fix: in `ledgerRoamingSampleInto`, for `progress ∈ [0.55, 0.58]`, smoothstep the orbit displacement toward zero before transit takes over. Equivalent to `applyMooringBlendInto`'s easeOut for ledger-roaming.
- Test: A4 seam-detection test catches this once unskipped.

### D3. Placement-change formation teleport (MED)
- `motion-planning.ts:381-385` + `motion-sampling.ts:173-209` — when squad consort distress flips placement, the new `formationOffset` applies instantly while heading memory persists, producing a position teleport + lagged heading.
- Fix: expose `clearShipHeadingMemory(shipId)` from `motion-sampling.ts`; call from plan-rebuild for ships whose `formationOffset` changed. Optionally track `prevFormationOffset` in route runtime and blend over 1–2s.
- Test: simulate a placement change mid-cycle, assert heading converges to new direction within 30 frames without a >0.4-rad snap.

---

## Phase E — Behavioral richness (data-driven motion)

These add new motion channels driven by existing `ShipNode` fields. All require DOM parity per `MOTION_POLICY`.

### E1. Stale-evidence lazy drift (HIGH legibility-per-cost)
- **Signal:** `ship.placementEvidence.stale: boolean`
- **Visual:** when stale, mooring orbit radius × 1.35; orbit angular speed × 0.65. Ship drifts visibly larger and slower — "uncertain position."
- **Implementation:** read `route.staleEvidence` (threaded at plan time) inside `mooredSampleInto` / `mooredRouteStopSampleInto` / `riskDriftSampleInto`. Or read `ship.placementEvidence.stale` at sample time (small refactor to pass `ship` into the inner samplers).
- **DOM parity:** `detail-model.ts` already emits "Evidence status" (fresh/caveat). Add a `visualCues` entry tying motion channel to the `placementEvidence.stale` source field.
- **Tests:** assert orbit radius/angular speed change for stale ships; ledger evidence-status text unchanged.

### E2. 24h-change wake intensity multiplier (HIGH)
- **Signal:** `ship.change24hPct` (already on ShipNode, populated by `recent-change.ts`).
- **Visual:** when `|change24hPct| ≥ 2%` and ship is in `departing`/`sailing`, multiply `wakeIntensity` by `1 + clamp(|pct| / 20, 0, 0.6)`. +10% supply day → ~50% stronger wake.
- **Implementation:** add `wakeMultiplier: number` to `ShipMotionRoute` (1.0 baseline; computed at plan time). Apply inside `transitSampleInto` after `speedEnvelope * baseWake`.
- **DOM parity:** add `{ label: "24h supply change", value: ... }` to `detailForShip` facts; add to `KNOWN_LABELS` regex in `detail-panel.tsx`; append to ledger ship `<li>`.
- **Tests:** unit test asserting wake multiplier matches formula; ledger/panel snapshots include new field.

### E3. Chain-breadth dwell bonus (MED)
- **Signal:** `ship.chainPresence.length`
- **Visual:** ships with `chainPresence.length ≥ 4` get +15% dock-dwell share. They linger at berth more visibly.
- **Implementation:** in `motion-planning.ts:buildShipRoute` (or equivalent), compute `dockDwellShare = chainCount >= 4 ? base * 1.15 : base`. Pass through route. `motion-sampling.ts:dockedShipZoneDwell` reads route's override.
- **DOM parity:** extend existing `dockingCadenceLabel` text to mention "extended dwell" when applicable.

### E4. ~~`riskZone` → moored angular speed gradient~~ — **dropped per Q2**
The zone-driven radius inversion in `mooredRadiusForZone` stays as-is. Avoiding the baseline-refresh PR cost outweighs the legibility win.

### E5. Skip — explicit anti-features
- Squad consort lag for distress (Agent 3 candidate #5) — low ROI, looks like a bug.
- `marketCapUsd` quartile → wake (Agent 3 candidate #6) — redundant signal dimension with T3.2.
- Anti-features A–E from Agent 3's report — flagged in source report, do NOT pursue.

---

## Phase F — Document NO-GO architectural moves

Both Worker rendering and sprite atlas were investigated and rejected. Add a short note to `docs/pharosville/CURRENT.md` (or wherever architectural decisions live) so future agents don't re-investigate without new motivation:

- **Worker + OffscreenCanvas: NO-GO** at current draw budget. Bottleneck is GPU 2D compositing, not main-thread JS scheduling. Refactor surface (~12-15 files, asset type migration, 7 `document.createElement` sites). Revisit only if WebGL migration happens.
- **Sprite atlas: NO-GO** in 2D context. Static-layer cache already coalesces high-cost draws; sail-tint bake is amortized to zero in steady state; per-livery color matrix can't be expressed as a 2D filter. Revisit alongside any WebGL migration.

---

## Sequencing and PRs

| # | PR | Phase | Depends on |
|---|----|-------|------------|
| 1 | Telemetry foundation (A1+A2+A3+A5) + seam test pattern (A4 skipped) | A | — |
| 2 | Lifecycle wiring: dispose hook + bucket-flip rebuild (B1, B2) | B | PR1 (uses telemetry) |
| 3 | Render hot-path HIGH (C1+C2+C3+C4) | C | — |
| 4 | Render hot-path MED (C5+C6+C7+C8) | C | — |
| 5 | Render hot-path LOW sweep (C9–C15) | C | — |
| 6 | Tighten `drawDurationMs` 200 → 160ms (Q3) | C | PRs 3–5 land + 1 CI week |
| 7 | Seam smoothness D1+D2 + un-skip A4 test | D | PR1 |
| 8 | Seam smoothness D3 (placement-change blend) | D | PR7 |
| 9 | Behavioral E1 (stale-evidence drift) | E | — |
| 10 | Behavioral E2 (24h wake) | E | — |
| 11 | Behavioral E3 (chain-breadth dwell) | E | PRs 9, 10 land + 1 week observation |
| 12 | ~~E4 zone angular speed~~ — **dropped per Q2** | — | — |
| 13 | Architectural decisions doc (Phase F) | F | — |

PRs 1, 3, 4, 5 can run in parallel. PR 7 depends on PR 1 for the test scaffolding. PR 12 needs an isolated baseline refresh PR (mirrors T0.1 from the original plan).

## Cost estimate

- Phase A: 1 PR, ~150 LOC, low risk.
- Phase B: 1 PR, ~80 LOC, low-med risk (touches React lifecycle).
- Phase C: 3 PRs, ~300 LOC total, low risk (most are isolated micro-opts).
- Phase D: 2 PRs, ~120 LOC, med risk (motion behavior changes).
- Phase E: 3 PRs (E4 dropped), ~280 LOC, low risk (DOM parity additions, zero baseline impact).
- Phase F: 1 PR, doc-only.

Total: ~11 PRs, ~930 LOC, ~3 days of focused work for one engineer.

## Resolved decisions (2026-05-03)

| # | Decision | Implication |
|---|----------|-------------|
| Q1 | C1 → **per-tile LRU gradient cache** keyed on `(x\|0, y\|0, zoom-bucket-4, alpha-bucket-20)` | Preserves the current visual primitive; ~10ms recovery; minimal baseline-drift risk. Full-screen overlay variant is *not* in scope. |
| Q2 | E4 → **skip entirely** | Phase E reduces to E1+E2+E3. No baseline-refresh PR needed for behavioral richness. The zone-driven radius inversion in `mooredRadiusForZone` stays as-is. |
| Q3 | Tighten `drawDurationMs` budget at `pharosville.spec.ts:1196` **from 200ms to 160ms** as PR 6, after Phase C lands and one CI week confirms stable headroom. **Do not go further to 140ms** in this batch. | One-step tighten. The new `test:perf` lane (median ≤ 140 / p95 ≤ 200) remains the primary regression guard for sustained motion. |
| Q4 | Phase E scope = **E1 + E2 + E3**, ordered as listed (stale-evidence drift → 24h wake → chain-breadth dwell). E4 dropped per Q2. | Three PRs, all zero-baseline-impact. Land E1+E2 first, observe a week, then E3. |

# PharosVille — Comprehensive Repository Review (Issues, Impact × Effort)

**Date:** 2026-06-14
**Author:** review synthesizer (7-dimension fan-out + adversarial verification)
**Companion docs:** `agents/2026-06-14-pharosville-enhancement-tasklist.md` (feature backlog T1–T33), `agents/2026-06-10-visual-upgrade-effort-reward.md`

## Method & provenance

Seven parallel dimension-finders read the codebase independently — renderer-correctness,
data-semantics-correctness, performance, security, accessibility/UX, code-quality, and
DX/CI/docs. Every finding was then re-checked by an independent skeptic agent; the three
highest-leverage findings were additionally spot-checked against source by hand.

- **43 findings, 43 confirmed, 0 false positives, 6 impact down-grades.**
- Baseline at review time was **green**: `typecheck` ✓, `lint` ✓ (0 warnings), `npm test` 989/989 ✓.
- Impact = 1 (trivial) … 5 (large user/correctness/security). Effort: **XS** <15 min · **S** <1 h · **M** half-day · **L** multi-day · **XL** week+.
- ⤵ marks findings whose original severity the verifier reduced (still real, lower blast radius).

## Overall health: strong

This is a **disciplined, mature codebase** — one TODO marker in all of `src/`, a hardened
single-origin API proxy (`functions/api/[[path]].ts`) with an exact-match allowlist + SSRF
guards, ~989 unit tests, and dedicated guard scripts. **No critical bugs, no secret leaks.**
Findings skew to subtle correctness edges, dead code from half-landed work, accessibility
gaps, and CI/process holes — the profile of a repo already past its gross-defect stage.

A recurring theme: several items are **unfinished or abandoned tasklist work**, not new
defects — `T27` capture-frame, `T24` controls-cheatsheet, and the reverted fleet-focus pass
(orphaned `band-key`/`notable-movers`). The cheapest wins are *deciding* finish-vs-delete.

---

## Effort × Reward at a glance (all 43, quick-wins first)

> A "quick win" (✅) = corrected effort ≤ S **and** corrected impact ≥ 3.

| # | Dim | Issue | Impact | Effort | QW | Key files |
|---|-----|-------|:------:|:------:|:--:|-----------|
| 1 | a11y-ux | **detail-panel-not-a-dialog** — DetailPanel forces focus into a bare `<aside>` with no dialog role; SRs don't announce it | 3 | XS | ✅ | src/components/detail-panel.tsx:34-53 |
| 2 | code-quality | **capture-frame-untracked-orphan** — `src/lib/capture-frame.ts` untracked and imported nowhere (half-landed T27) | 3 | XS | ✅ | src/lib/capture-frame.ts |
| 3 | dx-ci-docs | **viewport-gate-missing-from-ci** — hard-rule viewport-gate drift guard runs in neither CI nor the deploy gate | 3 | XS | ✅ | scripts/check-viewport-gate.mjs<br>.github/workflows/deploy-cloudflare.yml:78-89<br>scripts/pharosville/validate-deploy-gate.mjs:5-18 |
| 4 | perf | **dead-desktop-modulepreload** — modulepreload plugin never fires; ~300 KiB-gz desktop JS fetches in a serial waterfall after entry | 3 | XS | ✅ | vite.config.ts:118-123<br>src/client.tsx:9-11 |
| 5 | perf | **aggregate-budget-headroom** — JS gzip at ~99.98 % of the 382 KiB cap; the 127 KiB-gz `pharosville-world` chunk has no per-chunk guard | 3 | XS | ✅ | scripts/bundle-budgets.mjs:9-34<br>vite.config.ts:191-205 |
| 6 | bugs-render | **raf-loop-stall-early-return** — two `drawFrame` early-returns fire before `scheduleFrame()`; animated loop can permanently stall | 3 | S | ✅ | src/hooks/use-world-render-loop.ts:360,367,466,643-645 |
| 7 | perf | **seastate-recomputed-per-layer** — `seaStateForWorld` recomputed/re-allocated 7–9×/frame (~420 alloc/s) instead of threaded | 3 | S | ✅ | src/hooks/use-world-render-loop.ts:423<br>src/renderer/layers/lighthouse.ts:459,1021<br>src/renderer/layers/ambient.ts:450,585,836 |
| 8 | security | **headers-not-validated-pre-deploy** — `public/_headers` CSP validated only *post-deploy*; a broken CSP ships before detection | 3 | S | ✅ | public/_headers:10<br>.github/workflows/deploy-cloudflare.yml:235,262 |
| 9 | a11y-ux | **no-live-announce-on-data-refresh** — background data refresh / stale→fresh never announced to screen readers | 3 | S | ✅ | src/pharosville-world.tsx:601<br>src/hooks/use-pharosville-world-data.ts:141-189 |
| 10 | dx-ci-docs | **viewport-gate-no-self-test** — `checkViewportGate` (injectable) has no case in `check-guards.test.mjs` | 3 | S | ✅ | scripts/check-guards.test.mjs<br>scripts/check-viewport-gate.mjs:40-64 |
| 11 | dx-ci-docs | **release-readiness-not-gated** — documented release sign-off lane is wired into no CI workflow | 3 | S | ✅ | package.json:52<br>docs/pharosville/OPERATIONS.md:152 |
| 12 | a11y-ux | **dialogs-no-focus-management** — Legend & Changelog `role=dialog` panels: no focus-on-open/trap/restore/aria-modal; Legend auto-opens for first-time visitors | 4 | M | | src/components/legend-panel.tsx:43-49<br>src/components/changelog-panel.tsx:18-24<br>src/hooks/use-legend-dialog.ts:33-54 |
| 13 | bugs-data | **dews-band-counts-vs-placement-divergence** — zone "Stablecoins" count (raw stress signals) ≠ ships actually placed there (depeg/deviation-first + freshness gate); canvas/detail parity violation | 3 | M | | src/systems/pharosville-world/stages/world-scaffold.ts:150-211<br>src/systems/risk-placement.ts:42-114 |
| 14 | a11y-ux | **controls-cheatsheet-dead** — `ControlsCheatsheet` keyboard-help built + tested but never rendered (orphan T24) | 2 | XS | | src/components/controls-cheatsheet.tsx |
| 15 | a11y-ux | **since-last-visit-not-announced** — silent `<aside>` relying on a shared live region that may already be consumed | 2 | XS | | src/components/since-last-visit.tsx:62-80 |
| 16 | bugs-data | **depeg-history-above-peg-suppressed** — severity gate assumes negative sign; above-peg depegs of equal magnitude don't register | 2 | XS | | src/systems/detail-model.ts:230-249 |
| 17 | bugs-data | **change-pct-negative-zero** — tiny negative supply changes render as `-0.0%` | 2 | XS | | src/systems/detail-model.ts:140-155 |
| 18 | bugs-data | **dock-fallback-share-zero-total** — `supplyUsd = totalUsd × share` yields `$0` row when `totalUsd` is 0 | 2 | XS | | src/systems/chain-docks.ts:72-90<br>src/systems/detail-model.ts:515-524 |
| 19 | bugs-render | **hit-target-null-rebuild-loses-hover** — initial snapshot rebuild omits `hoveredDetailId`, dropping hover for one cycle | 2 | XS | | src/hooks/use-world-render-loop.ts:468-480<br>src/renderer/hit-testing.ts:115-144 |
| 20 | code-quality | **orphaned-component-files** — `band-key.tsx` + `notable-movers.tsx` + ~18 lines dead CSS (unmounted by the fleet-focus revert) | 2 | XS | | src/components/band-key.tsx<br>src/components/notable-movers.tsx<br>src/pharosville.css:~1419 |
| 21 | code-quality | **dead-cron-intervals-module** — `cron-intervals.ts` exports consumed only by its own test | 2 | XS | | src/lib/cron-intervals.ts |
| 22 | dx-ci-docs | **eslint-config-module-typeless-warning** — missing `"type":"module"` ⇒ Node reparse warning on every lint | 2 | XS | | package.json:1<br>eslint.config.js |
| 23 | bugs-data | **lighthouse-score-float-display** — "Score" fact stringifies raw PSI float while the panel elsewhere uses `formatPsiNumber` | 1 | XS | | src/systems/detail-model.ts:399-401 |
| 24 | code-quality | **deprecated-unused-type-alias** — `@deprecated LiveReserveFeedClass` has zero usages | 1 | XS | | shared/types/live-reserves.ts:133 |
| 25 | perf | **empty-vendor-zod-chunk** — `manualChunks` emits an empty orphan `vendor-zod` chunk every build | 1 | XS | | vite.config.ts:198-200 |
| 26 | security | **capture-frame-orphan-clipboard-no-gesture** ⤵ — orphan writes canvas to clipboard with no gesture guard (dead unless wired) | 1 | XS | | src/lib/capture-frame.ts:29,80 |
| 27 | security | **permissions-policy-omits-features** — Permissions-Policy omits display-capture/screen-wake-lock/serial/etc. | 1 | XS | | public/_headers:7<br>functions/_shared.ts:15 |
| 28 | a11y-ux | **shared-live-region-clobber** ⤵ — single aria-live region clobbered by rapid successive announcements | 2 | S | | src/pharosville-world.tsx:601<br>src/hooks/use-world-selection.ts:22-41 |
| 29 | bugs-data | **quartile-tie-collapse** — marketCap quartiles collapse to "Active" for many zero/tied caps | 2 | S | | src/systems/ship-cycle-tempo.ts:25-104 |
| 30 | bugs-data | **generatedat-fallback-zero-epoch** — `resolveGeneratedAt` returns epoch 0 (1970) when all timestamps missing, masking "unknown" | 2 | S | | src/systems/pharosville-world/stages/world-scaffold.ts:28-49 |
| 31 | bugs-render | **static-camera-key-cache-cross-instance** ⤵ — module-global cache keys assume a single live canvas | 2 | S | | src/renderer/world-canvas.ts:127-129,209-234 |
| 32 | bugs-render | **reduced-motion-bucket-flip-frozen** — under reduced motion the 10-min bucket flip never fires (route variation frozen) | 2 | S | | src/hooks/use-world-render-loop.ts:378-419 |
| 33 | code-quality | **duplicated-clamp-lerp-helpers** — identical `clamp`/`lerp` reimplemented in 5+ files | 2 | S | | src/systems/motion-utils.ts:41<br>src/renderer/layers/ships/draw-ship.ts:387 |
| 34 | perf | **perpass-perfnow-in-prod** — ~14 `performance.now()` pairs/frame feed only the dev/debug HUD | 2 | S | | src/renderer/world-canvas.ts:551-655<br>src/hooks/use-world-render-loop.ts:647-717 |
| 35 | security | **spa-csp-allows-gtm-while-ga-inactive** — CLOSED: static CSP keeps exact GA/GTM hosts for optional `VITE_GA_ID`; runtime remains gated and static validation rejects wildcard sources | 2 | S | ✅ | public/_headers:10<br>src/google-analytics.ts:12<br>docs/pharosville/SECURITY_HEADERS.md:28 |
| 36 | security | **grave-sourceurl-unvalidated-scheme** — `sourceUrl` is `z.string()` not `.url()`; a `javascript:`/`data:` URL would render clickable | 2 | S | | src/systems/detail-model.ts:697<br>src/components/detail-panel.tsx:160<br>shared/types/stablecoin-meta-schemas.ts:94 |
| 37 | bugs-data | **consort-stale-evidence-leak** ⤵ — consort inherits flagship `stale` flag while merging its own sources | 1 | S | | src/systems/pharosville-world/stages/ship-placement.ts:96-126 |
| 38 | bugs-render | **frame-pacing-windows-survive-resize** — pacing ring buffers persist across canvasSize/dpr RAF rebinds | 1 | S | | src/hooks/use-world-render-loop.ts:286-338 |
| 39 | security | **deps-caret-ranges-supply-chain** ⤵ — caret ranges; lockfile + `npm ci` already constrain (low urgency) | 1 | S | | package.json |
| 40 | code-quality | **consort-tile-validation-todo** — documented `TODO(W4.24)`: consorts can sail onto non-water tiles on high gain | 2 | M | | src/systems/motion-sampling/consort.ts:136 |
| 41 | dx-ci-docs | **validate-deploy-gate-claims-exact-mirror** — OPERATIONS.md says the gate "exactly" mirrors CI; the two lists drift independently | 2 | M | | docs/pharosville/OPERATIONS.md:73-76<br>scripts/pharosville/validate-deploy-gate.mjs:5-18 |
| 42 | bugs-render | **module-cache-not-released-on-unmount** ⤵ — offscreen canvas caches not freed on teardown (single-view SPA → minor) | 1 | XS | | src/renderer/world-canvas.ts:125-129 |

> (42 distinct rows — the two capture-frame findings from different finders are merged at row 2/26.)

---

## Tier 0 — Quick wins (do now)

### 1. `dead-desktop-modulepreload` — perf · impact 3 · XS  ⭐ biggest perf ROI
The `desktopChunkModulePreload` plugin matches the lazy chunk via
`entry.facadeModuleId?.endsWith("/src/pharosville-desktop-data.tsx")` (`vite.config.ts:121`).
But `client.tsx:9-11` wraps the dynamic import — `import(...).then(mod => ({default: mod.PharosVilleDesktopData}))`
— so rollup emits the chunk with `facadeModuleId = null`. The predicate never matches, the
plugin returns `[]`, and **zero media-gated `modulepreload` links are emitted**
(`grep -c pharosville-desktop-data dist/index.html` = 0). On desktop the LCP-critical canvas
waits on a fetch waterfall: parse entry → *then* `import()` begins fetching ~300 KiB-gz.
**Fix:** match `entry.name === "pharosville-desktop-data"` (populated regardless of facade);
add a build-time assertion that ≥1 desktop modulepreload link was injected.

### 2. `raf-loop-stall-early-return` — render · impact 3 · S  ⭐ only real user-visible bug
`drawFrame` clears `animationFramePendingRef.current = false` at `use-world-render-loop.ts:360`,
then early-returns at `:367` (`!activeCamera` / zero canvas size) and `:466` (`!frameCamera`),
both **before** the self-reschedule `if (!reducedMotion) { scheduleFrame() }` at `:643-645`.
When either fires in animated mode the loop drops its pending flag and never re-arms rAF;
it recovers only on a coincidental external `requestPaint()` (asset tick, hover, resize).
**Fix:** re-arm `scheduleFrame()` on both early-return paths (guarded by `!reducedMotion`),
e.g. `try/finally` around the draw body.

### 3. `viewport-gate-missing-from-ci` — DX · impact 3 · XS  ⭐ hard-rule guard hole
`check-viewport-gate.mjs` enforces a **hard constraint** (the desktop gate) by asserting the
`MIN_LONG_SIDE_PX`/`MIN_SHORT_SIDE_PX` constants match `index.html`'s hard-coded media query.
It runs in **no** CI job (`deploy-cloudflare.yml` guards job omits it) and **not** in
`validate-deploy-gate.mjs` (the pre-push gate on `main`). Editing the media query or the
constants without the other passes every gate and ships, silently breaking the gate on real
mobile devices. **Fix:** add `check:viewport-gate` to the CI `guards` job **and** to
`DEPLOY_GATE_COMMANDS`. (Pairs with #10 `viewport-gate-no-self-test`.)

### 4. `detail-panel-not-a-dialog` — a11y · impact 3 · XS
`DetailPanel` programmatically moves focus to its close button on mount and restores on unmount
(`detail-panel.tsx:34-45`) — dialog behavior — but the container is a bare
`<aside aria-labelledby>` with no `role`. A screen-reader user is dropped on a Close button
with no announced container. **Fix:** add `role="dialog"` + `aria-modal="true"` (it already has
`aria-labelledby`).

### 5. `seastate-recomputed-per-layer` — perf · impact 3 · S
`seaStateForWorld` is a pure function of `(world, wallClockHour, reducedMotion)` yet is invoked
7–9×/frame: the loop computes it once at `use-world-render-loop.ts:423` but does **not** pass it
into `drawPharosVille`, so lighthouse (×2), ambient (×3), and maker-squad-chrome each recompute
it — each call allocating a fresh `SeaState` + nested `source` and iterating all `world.areas`
(`sea-state.ts:89-220`). ~420 redundant allocations/sec at 60 fps. **Fix:** add `seaState` to
`DrawPharosVilleInput` and thread the already-computed value through.

### 6. `headers-not-validated-pre-deploy` — security · impact 3 · S
The entire SPA security policy (CSP/HSTS/COOP/CORP/Permissions-Policy) lives only in
`public/_headers` (no `<meta>` CSP fallback) and is **never statically parsed by any test**.
The only check, `check-security-headers.mjs`, hard-requires HTTPS (`:150`) so it can't run on a
build, and in CI runs **only in the deploy job, after `wrangler pages deploy`** — never on PRs.
A typo / dropped directive passes every PR check, deploys live, and is flagged post-hoc with no
rollback. **Fix:** add a static `_headers` parser guard (assert required directives) to the CI
`guards` job and `validate`.

### 7. `no-live-announce-on-data-refresh` — a11y · impact 3 · S
The sole `aria-live="polite"` region (`pharosville-world.tsx:601`) is fed only by user actions
(selection, dialog open/close, copy-link, visit-snapshot). Background React-Query refetches that
change `world.generatedAt` / freshness flags announce nothing; the accessibility-ledger re-renders
its stale-source line silently (no `aria-live`). **Fix:** diff freshness/`generatedAt` across
renders and `setAnnouncement` a throttled "Harbor data updated." / "PSI feed is now stale."

### 8. `aggregate-budget-headroom` — perf · impact 3 · XS
Built JS gzip ≈ 383.9 KiB vs the 382 KiB aggregate cap — **~7 KiB headroom** — and the
second-largest chunk (`pharosville-world`, 127 KiB-gz) matches **no per-chunk budget**, so its
growth is caught only by the nearly-exhausted aggregate, with no diagnostic locality. **Fix:**
add a `pharosville-world-*` per-chunk budget; raise the aggregate deliberately or split rarely-hit
layers (weather/cemetery/cinematic-atmosphere) behind a second dynamic import.

### 9–10. `viewport-gate-no-self-test` + `release-readiness-not-gated` — DX · impact 3 · S
`checkViewportGate` is written injectable for unit testing but has no case in
`check-guards.test.mjs` (its brittle regex parsers are uncovered). Separately,
`check:release-readiness` (the documented sign-off: cross-browser a11y + live header + smoke)
is referenced **only in docs** — CI runs subsets piecemeal (Firefox-only dist a11y), never the
aggregate. **Fix:** add a fixture-based `checkViewportGate` test; wire the readiness lane into a
`push`-to-main CI job or downgrade the docs claim.

### 11. `capture-frame` orphan — cleanup · impact 3 · XS  *(decision)*
`src/lib/capture-frame.ts` is untracked, fully implemented (117 lines), and imported nowhere
(half-landed `T27`). Leaving an untracked unimported module risks accidental partial commits.
**Decide:** wire a capture button/keyboard action calling `captureFrame`, or delete. Do not
silently commit. (If wired, also add the user-gesture guard from finding #26.)

---

## Tier 1 — Highest impact (worth real effort)

### `dialogs-no-focus-management` — a11y · impact 4 · M  ⭐ #1 user-facing finding
The Legend and Changelog `role="dialog"` panels have **no `aria-modal`, no focus-on-open, no
focus trap, and no focus restore** — and the Legend **auto-opens for first-time visitors**
(`use-legend-dialog.ts:33`). A keyboard/SR user lands behind a visually-modal panel with focus
still on `<body>`, must Tab through the whole app to reach it, and loses focus on close.
`DetailPanel` already implements the correct pattern (`detail-panel.tsx:34-45`) — copy it
(record `activeElement`, move focus in, trap Tab, `aria-modal`, restore on close).

### `dews-band-counts-vs-placement-divergence` — data · impact 3 · M  *(parity contract)*
A zone's "Stablecoins" count is tallied from raw `stress.signals[].band`
(`world-scaffold.ts:158-162`, surfaced at `detail-model.ts:732`), but the ship that *renders*
there is placed by `resolveShipRiskPlacement` with a different precedence
(activeDepeg → deviationBps → stress.band → navToken → safe-harbor) and a `stressStale` gate
(`risk-placement.ts:72`). So a stale-data zone or a NAV-token zone can show "N stablecoins" with
**zero ships moored** — a **canvas / detail-panel parity violation** (a hard rule). **Fix:**
derive `area.count` from the actually-placed ships, *or* relabel the fact "DEWS signals in band"
and gate it on `freshness.stressStale`.

---

## Tier 2 — Data-correctness edges (cheap, low individual blast radius)

All XS–S, mostly in `src/systems/detail-model.ts` / world stages — see rows 16–18, 23, 29, 30:
- **above-peg depegs suppressed** → use `Math.abs(worst)` in the severity gate.
- **`-0.0%`** → round before choosing the sign (`Math.round(x*10)/10`, then `+0`).
- **dock `$0` row** when `totalUsd === 0` → filter `totalUsd > 0` in `harboredStablecoins`.
- **quartile tie-collapse** → assign by rank position, not value thresholds, when `q1 === q3`.
- **`generatedAt` → epoch 0** → return `null` + treat null as "freshness unknown".
- **lighthouse score float** → route through `formatPsiNumber`.

## Tier 3 — Dead code (finish-or-delete decisions, XS each)
Rows 14, 20, 21, 24, 25, 42 + the eslint rename (22):
`band-key.tsx` + `notable-movers.tsx` + dead CSS (delete; keep `systems/notable-movers.ts`) ·
`controls-cheatsheet.tsx` (wire into the legend/help surface — it's the better keyboard ref — or
delete) · `cron-intervals.ts` · `@deprecated LiveReserveFeedClass` · empty `vendor-zod` chunk ·
rename `eslint.config.js` → `.mjs` (kills the lint warning, surgical).

## Tier 4 — Security polish (defense-in-depth, low impact)
Rows 26, 27, 36, 39: validate `grave.sourceUrl` with `.url()`/scheme allowlist ·
add
`display-capture=()`/`screen-wake-lock=()`/etc. to Permissions-Policy · pin security-adjacent deps
(lockfile + `npm ci` already constrain — lowest urgency).

## Tier 5 — Documented / low-priority
Rows 19, 28, 31, 32, 34, 37, 38, 40, 41: gate per-pass `performance.now()` behind
`isVisualDebugAllowed()` · document or fix the reduced-motion bucket-flip freeze · the
`consort` non-water-tile `TODO(W4.24)` · reconcile the OPERATIONS.md "exactly mirrors" claim ·
the module-global cache cross-instance/teardown caveats (single-view SPA → minor) ·
`duplicated-clamp-lerp` (consolidate opportunistically, not a dedicated PR).

---

## Overlap with the existing enhancement tasklist (T1–T33)

- `T1` (strip eager zod off boot graph) ↔ #4 `dead-desktop-modulepreload` + #25 `empty-vendor-zod-chunk` — these are the *measured* boot-graph realities; do them with T1.
- `T27` (capture-this-frame) ↔ #2/#11/#26 — the implementation already exists on disk untracked; finish-or-delete is the real decision.
- `T24` (controls cheatsheet) ↔ #14 — the component is built; only wiring remains.
- Fleet-focus removal (commit `cfab83f`) ↔ #20 — left `band-key`/`notable-movers` orphans.
- `T32` (lazy-split DetailPanel) and `T30/T31` (perf budgets) relate to #8 `aggregate-budget-headroom`.

Net: a meaningful fraction of "issues" are **closing out half-landed tasklist work** rather than
net-new defects.

## Verification honesty note

The workflow's skeptic pass confirmed **all 43** findings (down-grading 6 impacts, rejecting
none) — a slightly generous bar. The Tier 0–1 items were additionally re-confirmed against
source by hand and are solid. Several lower-tier items are genuine **judgment calls** (delete vs
wire orphans; whether the reduced-motion freeze is intended) that belong to the maintainer.

## Suggested first batch

`#1`, `#2`(decision), `#3`, `#4`, `#8` — independent, mostly one-line, ~1–2 h total: a
desktop-LCP win, the animation-stall fix, two CI guard-holes closed, and a bundle-locality guard.
Then the a11y trio (`#4`/`#7`/Tier 1 dialogs) for the biggest user-facing lift.

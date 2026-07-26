# PharosVille — improvement ideas, prioritized by impact vs effort

Date: 2026-07-26. Produced by a six-agent sweep (metaphor, visual, performance,
debugging/observability, UX/accessibility, backlog mining) over the repo at
v0.4.0 "The Lantern Sea" + 793ce68. 56 raw ideas, deduplicated to 38, ranked
below. Every idea is grounded in a file or plan doc the sweep actually read.

**Impact** 1–5 (5 = changes how users understand the market or how the product
survives). **Effort** S/M/L. Ordering within each tier is impact-per-effort.

---

## Corrections first — stale beliefs the sweep disproved

These are recorded so no future round re-fixes solved problems:

- **The "constrained tier drops colour grading" cliff is already fixed.**
  `world-renderer.ts:405-412` keeps grade/AgX and sheds only bloom.
  `agents/2026-07-25-remaining-work.md` and the grand-scale plan §10.4 still
  describe the old cliff.
- **The two stale visual-lane assertions (20-ship cap, removed hour slider)
  were fixed in 793ce68** with explanatory comments in the specs.
  `remaining-work.md` still reports them red. Confirm with
  `npm run test:visual`, then update that note.
- **Hygiene find:** `garden-post.ts:167` declares `setGrade(day, dusk, night)`
  but the implementation (line 292) ignores the `nightMix` that
  `world-renderer.ts:413` passes — dead param, delete before it drifts.

---

## Tier 1 — do next (high impact, small/medium effort)

### 1. Production survivability & observability cluster
The single biggest gap. The app is public and solo-maintained, and today the
operator is blind to production failure: client errors report to nothing,
outages render a blank world, and stale upstream data passes every check.

| # | Idea | Impact | Effort | Ground truth |
|---|------|--------|--------|--------------|
| 1a | **Wire `reportClientError` into real failure sites** — it has zero callers; call it from `failThreeRenderer` (use-world-render-loop.ts:195, 287, 634), WebGL context-loss, and the world-data error path | 4 | S | `src/error-reporter.ts:8-15,109` |
| 1b | **Make `/_log` durable** — it ends in `console.error` nobody watches; enable Workers Logs or a KV counter, and have the canary POST one synthetic report to prove the pipe | 4 | M | `functions/_log.ts`; canary never touches `/_log` |
| 1c | **Edge stale-on-error** — proxy caches only 200s with short TTL; store a long-TTL last-good copy per endpoint and serve it (with age headers the client meta pipeline already understands) when upstream fails. Turns an API outage into a degraded-but-alive world | 4 | M | `functions/api/[[path]].ts` 502 path; `functions/_shared.ts` |
| 1d | **Canary freshness gate** — `smoke-live.mjs` only type-checks; assert `updatedAt` recency per endpoint so a stuck producer serving day-old data trips the 30-min canary. Start as warning tier | 4 | S | `scripts/smoke-live.mjs:149-177` |
| 1e | **External uptime monitor** beyond GitHub Actions (Cloudflare health check or UptimeRobot on `/` + one `/api/*`) — already on ROADMAP.md | 3 | S | `ROADMAP.md:11`, `OPERATIONS.md:91-92` |

### 2. Sharing & first-impression fixes (all small)

| # | Idea | Impact | Effort | Ground truth |
|---|------|--------|--------|--------------|
| 2a | **Fix the meta description** — index.html:8 calls the product "A beta desktop RPG island-city", contradicting PRODUCT.md's anti-references in the first sentence Google/Twitter/Slack show. Rewrite description/OG/twitter copy to the maritime-observatory framing | 3 | S | `index.html:8,19,28` |
| 2b | **Copy-link button in the detail panel** — URL deep links (sel/cam/t/n) exist but are invisible; one button + clipboard write + live-region announcement. Check clipboard-write against the Permissions-Policy header | 4 | S | `use-world-url-state.ts` `buildWorldUrlHref` |
| 2c | **Legend → "Watch the harbor" CTA** — the first-visit legend closes into a silent world while observe mode (captioned camera beats) hides behind a bare Eye icon. One button bridging them is the cheapest onboarding win available. Respect the reduced-motion guard | 4 | S | `use-legend-dialog.ts`; `pharosville-world.tsx:676` |

### 3. Metaphor: spend the signals already fetched but unused
The sweep grep-verified these payloads arrive in the browser today and drive
nothing: `pegSummary.summary`, `dexPriceCheck`, `stability.history`,
`stability.current.contributors` (world side), chain `change*Pct`,
deviation sign, `trackingSpanDays`, `priceConfidence`.

| # | Idea | Impact | Effort | Signals consumed |
|---|------|--------|--------|------------------|
| 3a | **Observatory signal mast** hoisting one pennant per active depeg, storm cone when `worstCurrent` crosses a threshold — period-accurate storm-warning practice; gives "fleet condition at a glance" a single anchor. Reuse the chain-flag system; keep it calm, not alarming | 4 | M | `pegSummary.summary.*` |
| 3b | **Cross-bearing buoy** moored beside a ship when `dexPriceCheck.agrees === false` — two instruments disagreeing is a leading depeg indicator, currently invisible even in the panel. Nullable field must render nothing when absent | 3 | S | `dexPriceCheck.*` |
| 3c | **High-water mark** — tide-stain band on the lighthouse rocks marking the worst PSI band of the trailing 30d; static, deterministic; separates "calm" from "recently-recovered calm" | 3 | S | `stability.history[]` |
| 3d | **Lighthouse beam dwells on top PSI contributors** — the beacon periodically settles toward the ship contributing most to the index; contributors already have DOM rows. Wording: "largest PSI contributor", never accusation | 4 | M | `stability.current.contributors[]` |

### 4. Visual: the two items that raise the whole frame

| # | Idea | Impact | Effort | Ground truth |
|---|------|--------|--------|--------------|
| 4a | **Hero-ship mirror reflections** — extend the Pharos mirror-column technique (inverted geometry obeying region reflectivity, no extra pass) to the ~29 hero hulls. W6.4 was the concept render's defining feature and was never started; reflectivity already encodes risk region, so it's analytical spectacle | 4 | M | `garden-water.ts:686,953`; grand-scale plan §9.3 |
| 4b | **Island detail pass (W4.9)** — strata, cliffs, stone stair, denser planting. The island is now the last major mass at "credible draft" quality and it anchors every framing. Beware the rendered-vs-terrain ~6-tile offset trap (H1) and the 0.7-unit silhouette law | 4 | M | grand-scale plan §9.3; `garden-island.ts` |

### 5. Reach & trust

| # | Idea | Impact | Effort | Ground truth |
|---|------|--------|--------|--------------|
| 5a | **Quick find: press `/` to locate a ship/harbor by name** — the #1 first-session intent ("where is my coin?") has no direct path; selection/camera/announcement plumbing all exist | 4 | M | `use-world-keyboard-targets.ts`; `world.entityById` |
| 5b | **Grow the fleet ~205 → 300** — operator decision O5 deferred this while rendering was the ceiling; instancing (v0.4.0, 320-ship capacity) removed the ceiling. A third of the tracked market is invisible. Watch map density (O6) and long-tail logo gaps | 4 | M | grand-scale plan §7 Q1, §8 O5 |
| 5c | **Make the dist-visual and perf lanes trustworthy** — one dist visual failure remains (Observe/DOM-labels stability timeout) and `test:perf` has never run clean (SwiftShader fleet-population timeouts). Red-but-ignored gates already masked real regressions once | 4 | M | fleet plan "dist visual lane"; sea plan §11.3 |

---

## Tier 2 — cheap wins to batch into any round (all S)

- **Stale/degraded-data caveat test** — test meta is hardcoded `fresh`; the
  "stale evidence is a caveat, not confirmed stress" invariant has zero
  coverage. Parameterize `mockPharosVillePayloads` meta. (Impact 3)
- **Perf tripwire: `preview.mjs --assert`** — it already measures tier /
  p50-p90 / draw calls on the real GPU but only prints; add thresholds
  (tier=full, p90≤20ms, calls≤700) and wire into `validate:deploy-gate`.
  TESTING.md admits GPU regressions are caught pre-push or not at all. (3)
- **Reduced-motion observe mode** — observe is gated off entirely under
  reduced motion; offer manual step-through beats (instant focusTile +
  caption) instead of nothing. (3)
- **Sea-sign boards as keyboard hit targets** — the sea plan's own N6 spec,
  dropped at execution; boards are aria-hidden canvas today. Hit-target
  plumbing exists. (3) *(flagged by both visual and backlog sweeps)*
- **`_headers` caching for `/logos/*` and `/chains/*`** — 326 files / 2.9MB
  revalidate every visit before sails paint; `max-age=86400` (names aren't
  content-hashed, so a day, not a year). (2)
- **Re-measure the ~855 draw-call whole-map frame** — measured mid-flight
  during concurrent work, never re-checked after it settled; one
  `npm run preview` probe decides overrun vs stale budget. (2)
- **Small-screen fallback copy** — two-sentence metaphor explainer +
  descriptive link labels; today's bare "PSI / Depegs" teach a mobile
  first-toucher nothing. No world data, gate rule holds. (2)
- **Time-of-day keys `[` / `]`** — replace the documented "type t=18.5 into
  the address bar" anti-affordance; write through existing clamp + URL state. (2)
- **Night-sky horizontal band** — undiagnosed sea-plan residual 5; suspect the
  Shakkei horizon cards. Confirm attribution before editing. (2)
- **Gulls over the top-3 hero ships** — the one deliberately carried W6 item;
  approach pre-solved (parent to hero root like `garden-summit-birds`). (2)
- **Node engines pin vs runtime (24 vs 26)** — every session opens with a
  warning that trains agents to ignore warnings. (2)
- **Pale-sail sweep (contrast floor 2.0→2.2)** — fixes six weak sail marks
  incl. DAI, but D5 was an explicit operator decision protecting DAI's amber.
  **Needs operator sign-off, not a silent change.** (2)
- **Update `remaining-work.md`** per the corrections section above. (2)

---

## Tier 3 — bigger bets (worth a dedicated round each)

Ordered by recommended sequence, not raw impact.

1. **Sticky ship placement across refreshes** (impact 3, M) — carry previous
   placements so unchanged ships keep tiles and path keys; kills most of the
   A* + fleet-rebuild cost per refresh *and* stops refresh teleporting. Do
   this before the worker — it may make it unnecessary.
2. **Web Worker for world build + A* re-solve** (4, L) — the measured ~550ms
   main-thread freeze per data refresh (`world-renderer.ts:376-390` documents
   it). Only if sticky placement leaves a visible hitch. World model must be
   structured-clone-safe; measure the clone cost first.
3. **Mint/burn cargo tide** (5, L) — the highest-impact metaphor idea: crates
   loaded/offloaded at docks for net mint/burn, `flightToQuality` as skiffs
   converging on titans. Needs a new endpoint key in the contract + Pages
   Function allowlist, world stage, cues, DOM rows, tests. The one idea that
   makes supply *flow* — the core stablecoin dynamic — visible.
4. **Tide line: global supply as water level** (4, L) — `globalChange7dPct`
   as a wet/dry band on pilings and rock. Systemic and beautiful, but touches
   the water/island contract and must not shift water-tile classification.
5. **PMREM environment + depth cueing (W6.5/W6.8)** (3, M) — cheapest global
   step from flat-lit to lit-by-its-sky; delicate against the Lantern Sea AgX
   calibration; judge only via `npm run preview`.
6. **Fractal coastlines in `sea-bodies.ts`** (3, S/M) — sea-plan residual 1,
   "contained follow-up"; noise must apply at classification time so tint,
   ships, and buoys agree (the D1 lesson), and area shares (±2pt) must hold.
7. **Client-side last-good persistence** (3, M) — TanStack persister so a
   returning visitor renders instantly from labeled-stale data; complements
   1c for total-outage survival.
8. **Refresh-soak leak gate** (3, S) — cycle 10–20 world payloads in the perf
   spec and assert `renderer.info.memory` returns to baseline; the
   leave-it-open-for-hours use case is currently unguarded.
9. **Idle frame governor** (3, M) — after N minutes without input, render at
   half rate; the scheduler already tracks `cameraIntentActive`. Real-GPU
   judgement only.
10. **Failure-injection browser lane** (4, M) + **unit tests for
    `use-pharosville-world-data`** (3, M) — the essentials-first grace path
    was built from a live 502 incident and has no regression guard; the
    247-line hook is the most intricate untested logic in the data path.
11. **Logo vectorisation Batch B** (3, L) — 210 of 332 logos still raster;
    the brief's tier ordering bounds it. Grind work; good background task.
12. **Per-selection social cards** (3, M) — HTMLRewriter on the HTML route
    swapping og:title/description for `?sel=` links; text-only first. Do
    after 2a/2b prove the sharing loop matters.
13. **Ship trim for deviation direction** (3, M) and **harbor tempo from
    chain 24h change** (3, M) — good second-wave metaphor items once 3a–3d
    land; both need care against the silhouette law / calm brand.
14. **Visible "Harbor ledger" view** (3, M) — surface the superb sr-only
    accessibility ledger as a readable trust artifact for sighted analysts.
15. **Overview LOD cull** (2, M) — pair with whichever visual round (4a/4b)
    spends the draw-call headroom; ease transitions, no popping.
16. **Meshopt-compress runtime GLBs** (2, M) — ~60-75% off 2.3MB of models
    at generator time; hero-silhouettes harness guards quantization.
17. **~40% docked ratio (W3.5/O12)** (2, M) — settled operator decision never
    wired; verify first that docked share hasn't since acquired analytics
    meaning (it encodes chain supply share since v0.3.0).

---

## Deliberately not proposed

- Anything gated on Playwright frame-quality or frame-time judgements —
  every look/perf call above routes through `npm run preview` (SwiftShader rule).
- Mobile runtime, wallets, accounts — ROADMAP "not planned".
- Thin-consensus haze ring and veteran sail patina — both collide with
  existing channels (lighthouse fog = freshness failure; weathering = risk
  water) and were the weakest of the metaphor set; revisit only with a
  legend redesign that can carry more channels.

## Suggested first round

1a + 1d + 2a + 2b + 2c in one small PR-sized round (all S, two files each),
then 1b + 1c as the outage-survival pair, then pick one of 3a (signal mast)
or 4a (reflections) as the next visible release's headline.

---

# Implementation status — 2026-07-26

33 commits on local `main`, nothing pushed. Written at `fe49052`; the logo
and media-guard work described below was in the working tree, uncommitted,
at that point. `npm run validate` was last recorded green at `3ca4596`
(1260 tests, typecheck, lint, build, bundle-size, docs, secrets, colours);
the five waves after it are not covered by that run.

This supersedes the earlier version of this section, written at `3ca4596`,
which listed the pale sails, the docked ratio, the Web Worker, the harbour
tempo animation, the `flightToQuality` cue and the duplicated band→body
mapping as unresolved. All six have since been closed.

## Shipped

Tier 1 complete: error reporting wired, `/_log` durable behind an optional
KV binding, edge stale-on-error, canary freshness gate, monitoring runbook,
meta copy, copy-link, legend→observe CTA, signal mast, cross-bearing buoy,
PSI high-water mark, beacon dwell, island planting, quick find, test lanes.

Tier 2 complete: logo cache headers, Node engines, night-sky band, gulls,
time-of-day keys, sea-sign keyboard targets, stale-caveat coverage,
overview draw-call re-measure, and the pale sails (see below — done without
touching the floor, so D5 stands and no sign-off was required).

Tier 3 shipped: overview LOD cull, hero reflections, sticky placement,
mint/burn cargo tide, tide line, PMREM + depth cueing, client-side
last-good persistence, refresh-soak leak gate, idle governor,
failure-injection lane, world-data hook unit tests, social cards, ship
trim, visible harbor ledger, meshopt compression, harbour tempo (both
halves), and the `flightToQuality` skiffs.

Also landed, not on the original list:

- **The band→body mapping is one authority again.** `seaBodyForArea` in
  `src/systems/sea-bodies.ts` — three-free, so it imports anywhere without
  dragging the renderer across a chunk boundary. All four former copies
  agreed exactly, so there was no hidden divergence to report.
- **A byte-level runtime media guard.** `check:runtime-media` verified that
  referenced files exist; it now verifies they can render — PNG/JPEG/WebP
  container integrity, truncation, SVG sanity, and vector-behind-raster
  extension swaps. It immediately caught `public/logos/340-rwausdi.png`:
  truncated since the bootstrap commit `c023b2c` (IDAT declares 3198 bytes,
  385 present) and rendering blank in production ever since.
- **Logo vectorisation, partial.** Batch A needed no work — all 11 chain
  marks were already true SVG and knock out correctly at the real 89px flag
  size; the brief's premise that they are PNGs was stale. Batch B landed 11
  long-tail marks (manifest 122 → 133 SVG) from two verified sources.

## Measured, not estimated

- Overview framing was **917 draw calls at tier `recovery`, 37.7fps**. After
  the LOD cull: **402 at tier `full`**. Default framing 687/700, tier `full`.
- Models 2,282,072 → 1,133,132 bytes (−50.3%), max geometry deviation
  2.44e-4 units — under 1% of the finest authored feature.
- Sticky placement: a sub-percent supply wiggle moves **0** risk tiles and
  **0** moorings, down from 38/205 and 13/81. World model rebuild 303ms → 34ms.
- Refresh cost on the real GPU against the production bundle, median
  main-thread busy time: **0ms** identical payload, **239ms** common case
  (sub-percent wiggle, sticky placement holding), **795ms** full churn.
  Style, layout and paint total 14ms across the whole window.
- Perf lane baseline recorded green: p90 16.7ms, 534 calls, 366 geometries,
  44 textures, 70 programs; refresh-soak flat across 12 payloads.
- Pale sails: dark canvas 26 → 31 of 256 issuers (10% → 12%).
- Harbour tempo: one scalar (chain `change24hPct` against 3% full scale)
  drives orbit rate ±45% (0.047–0.123 rad/s), radius 1.8–3.0, height
  3.7–4.7. No new draw calls — quay gulls are extra instances (9 + 2N,
  N ≤ 10) of the flock's existing `InstancedMesh`.
- Symbol-keyed logo sources: **0 of 26** candidates were the correct mark.

## What the independent review found

Late in the day an independent review ran over the day's diff in four
slices (renderer, UI, systems, server/tooling). It returned **14 findings.
All 14 were verified as real. All 14 were fixed.** That hit rate is the
point: mass-parallel authoring, where each agent validates only its own
slice, reliably produces defects that no slice's own tests can see. Budget
for a review pass; it is cheaper than the alternative.

The three most instructive:

- **The PMREM probe baked a night sky and cached it.** `environment
  .update(phase)` ran before the sky's own update wrote the dome uniforms,
  and those initialise to the night preset. The first bake — the one that
  sets `bakedKey` — therefore rendered night whatever the hour, and the
  early return held it. At midday the quantised key never moves, so every
  metal surface was lit wrong through the whole flat middle of the day. The
  feature's own tests passed: they checked that a bake happened and was
  cached, which is exactly what went wrong.
- **The Harbor ledger was unreadable by keyboard** — the audience it was
  built for. Its Tab trap found one focusable element (Close), because the
  accessibility ledger renders no links or buttons at all and the scroll
  container was a plain `div` with no `tabIndex`. The legend panel only
  survives the same trap because its body is full of buttons. Reusing a
  working idiom is not the same as reusing its preconditions.
- **`smoke-live.mjs` asserted more than the contract guarantees.** The new
  `/api/mint-burn-flows` validator hard-failed on empty `coins` and missing
  `scope`, both of which `MintBurnFlowsResponseSchema` permits. A
  contract-legal payload would have failed the deploy smoke through every
  retry and turned the 30-minute production canary permanently red. Both
  moved to a warning tier that can never fail the run.

The rest, briefly: the overview LOD dragged the cargo tide and tide line
toward the map centre (Box3 pivot is the ring centroid for one instanced
group spanning every harbour); the idle governor ran at 20fps, not the 30
its comment claimed, because two 60Hz vsync intervals are 33.33ms and
always beat a 33.4ms target; the cargo tide printed "No issuance activity"
for flow it could not attribute, which reads as a measurement rather than a
gap; Escape inside any panel cleared the ship selection, a pre-existing
collision the new panel inherited; reduced-motion "Watch the harbor" gave
one beat and died on the first Tab; restored payload age was computed once
at restore, so with the API down the UI reported its page-load age forever;
the error reporter deduped on message, and browsers report every
cross-origin script failure as the literal `"Script error."`, so the first
one permanently suppressed all later ones; plus per-frame allocation in new
update paths and an idle tier freeze that failed open.

## Deliberately not done, with reasons

- **Pale-sail contrast floor 2.0→2.2 — not done, and the goal reached
  anyway.** Raising the floor was the one-line lever and is exactly what
  was avoided: D5 set 2.0 and kept DAI's amber on purpose. The plan's own
  alternative shipped instead — a per-coin override table
  (`src/three/garden-sail-overrides.ts`) naming five issuers
  (bean-beanstalk, cash-phantom, csusdl-coinshift, eusd-lybra,
  zchf-frankencoin). The floor is untouched, nothing else in the fleet
  moves, DAI is pinned by test to `#daac69` and asserted absent from the
  table. Reverses by deleting a line.
- **Fleet growth to 300** — blocked upstream, not by code. There is no filter
  to loosen: `shared/data/stablecoins/coins/` holds exactly 217 entries and
  every compatibility shell is `[]`. `StablecoinMeta` is required, so an
  uncatalogued coin cannot become a ship without inventing its peg currency
  and backing. Needs the host-repo catalog workflow. Worth carrying upstream:
  count is not the binding constraint — outer-rough-water has 762 tiles and
  storm-shelf 948, so crowding would appear during a stress event, not at rest.
- **~40% docked ratio (O12)** — superseded, verified. The footer figure
  counts ships with a dock visit, and visits only exist for chains that
  render a harbour, chosen by `totalUsd`. That is a live statement about
  supply concentration, not instantaneous mooring; forcing it to 40% would
  overwrite data with decoration. The moored split O12 actually meant is
  `DOCKED_SHIP_DWELL_SHARE` = 1/3, already at target and already
  zone-shaped. The words were the defect: the footer said "docked", which a
  reader takes as moored right now, and now reads "hold a berth". The
  computation is unchanged.
- **Web Worker for world build — measured and ruled out.** A new `--refresh`
  arm in `preview.mjs` measured the real cost (numbers above) rather than
  inheriting the stale ~550ms note. Sticky placement already took the world
  rebuild 303ms → 34ms, and that 34ms is all a worker could move out of the
  common case's 239ms; the rest cannot leave the thread that owns the GL
  context, and at 14ms of style/layout/paint it is not the DOM either. The
  real remaining target is `replaceWorldContent`, which recreates resources
  identical to ones it just disposed. The comment in `world-renderer.ts` now
  says what was measured and points at that stage.
- **Logo vectorisation Batch B, remainder** — 150 of 161 long-tail rasters
  still raster. Stopped deliberately rather than lower the bar, because the
  sourcing finding below makes the cheap paths unsafe.
- **Brand-colour re-extraction** — `data/brand-colors.json` and
  `extract-brand-colors.mjs` untouched. The 11 swaps were accepted only when
  mark *and* colourway matched the incumbent raster, so existing colours
  should remain valid. Re-extraction is an operator call needing a visual
  review.

## Open follow-ups

- **`replaceWorldContent` recreates what it just disposed.** The measured
  successor to the worker idea, and the only remaining structural win in the
  239ms common-case refresh.
- **`public/logos/340-rwausdi.png` is still broken.** The guard now names
  it, but sourcing a correct replacement hits the same provenance problem as
  the rest of the tail.
- **150 long-tail logos remain raster.** Four deliberate skips are worth an
  operator eye, all "same brand, changed treatment": `218-satusd` (River,
  colourway inverts), `254-eurcv` / `307-usdcv` (SG FORGE, disc flips),
  `153-busd` (badge → glyph-only), `229-lvlusd` (correct but 210 KB / 603
  paths of sub-pixel detail — rejected on payload, not correctness).
- **The signal mast's storm-cone threshold is borrowed.** `status-thresholds.ts`
  has no peg-deviation constant, so 500 bps derives from the 5% price-diff
  gate. If the cone reads too rare or too eager, that is the line to move.

## Lesson worth carrying: ticker-keyed icon sets are unsafe

Long-tail stablecoin tickers collide hard across issuers, so matching a
logo by symbol produces confidently wrong marks. Of 26 symbol-matched
candidates, **0 were correct**: one identical orange "D" came back for
three different USDX issuers, Beanstalk's BEAN resolved to a ghost logo,
Tether's EURT to a black "E". Static greps and shape metrics did not catch
any of it — IoU on badge-form logos just measures "both are discs". The
gate that caught every one was rendering candidate and incumbent side by
side and looking at them. Any future run must keep a visual gate and must
not land on filename agreement. Related: official brand kits publish the
*corporate* logo rather than the per-token mark, and several protocol CDNs
serve `.svg` files that are embedded bitmaps.

## Needs the operator's real-GPU `npm run preview`

Everything visual this round was built to geometric and numeric invariants;
none of it has been judged by eye. Specifically: sea-body relief at 0.60,
signal mast placement and scale, tide-stain and tide-line marks, beacon
dwell, hero reflection strength, gulls, island planting drifts, ship trim
legibility, the cargo-tide crates, the flight-to-quality skiffs, quay-gull
tempo, and whether the idle governor's 30fps — now actually 30 — still
reads as calm.

Two that changed after the review and want a fresh look:

- **PMREM lighting across the whole day cycle.** Any earlier look at this
  was reading a night bake; the day is genuinely different now.
- **The pale sails, for R2b.** Dark canvas at 12% of issuers grows the risk
  the heraldry plan flagged — that black starts to read as distress.

Night check at `t=23` zoomed out for the removed sky stripe.

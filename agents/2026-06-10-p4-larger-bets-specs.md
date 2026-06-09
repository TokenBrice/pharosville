# P4 Larger Bets — Specs (minimap, cargo deck, attestation pennants)

Date: 2026-06-10
Author: Claude (Fable 5), spec-only session.
Predecessor: `agents/pharosville-upgrade-followup.md` §"P4 — Larger bets
(spec before building)"; original framing in `agents/pharosville-upgrade.md`
§3.1 / §3.7 / §3.8.

This file is a spec, not an execution log. **No source code changes were made
in this session**, and per `AGENTS.md` the Pages Function allowlist in
`functions/api/[[path]].ts` must not be touched until the operator approves
the decision in §4.

Read first: `AGENTS.md`, `docs/pharosville/CURRENT.md`,
`docs/pharosville/MOTION_POLICY.md`, `docs/pharosville/CHANGE_CHECKLIST.md`.

Cross-cutting sequencing note: a concurrent ship-identity session owns
`world-canvas.ts`, `draw-ship.ts`, `ship-visual-config.ts`, and the ships
layers (see followup "BLOCKED THIS SESSION: F4, F5"). §2 and §3 land in those
files; do not start them until that work merges. §1 touches
`use-world-render-loop.ts` and `pharosville-world.tsx` only — lower conflict
risk, but re-check `git status` before starting.

---

## 1. Minimap / viewport indicator (plan 3.1) — Effort: L

Corner minimap showing the island at coarse scale: docks, titan/heritage
ships, the current viewport rectangle, click-to-jump. Navigation win when
zoomed in past ~1.2×.

### 1.1 Hard constraints discovered in code

- **No independent minimap loop.** `MOTION_POLICY.md` explicitly forbids it
  ("No independent CSS animation, sprite loop, minimap loop, interval, or
  timer may encode analytical state outside the main motion clock"). The
  minimap must be painted from the existing world RAF in
  `src/hooks/use-world-render-loop.ts` (the same loop that calls
  `stepCameraRef.current(time, …)` and `drawPharosVille`). Reduced motion has
  **no live RAF**; the minimap repaints only on the discrete `requestPaint()`
  events that already drive reduced-motion repaints.
- **A pixel budget already exists.** `MAX_MINIMAP_PIXELS = 300_000` is
  declared (and currently unused) in `src/systems/canvas-budget.ts`. The
  minimap backing store must fit it and be folded into
  `resolveCanvasBudget` / `MAX_TOTAL_BACKING_PIXELS` accounting.
- **Desktop gate.** The world (and therefore the minimap) only mounts when
  `isWidescreenViewport` passes (`src/systems/viewport-gate.ts`: long side
  ≥ 720px, short side ≥ 360px) via `src/client.tsx`. The minimap component
  must be imported only from `pharosville-world.tsx` (inside the lazy
  `PharosVilleDesktopData` chunk) so narrow viewports load none of it.
- **Outside-click handler.** `pharosville-world.tsx` installs a capture-phase
  `pointerdown` listener that clears selection for shell clicks outside the
  detail panel / `.pharosville-overlay` / fullscreen + home buttons. Mounting
  the minimap **inside `.pharosville-overlay`** keeps minimap clicks from
  clearing selection for free.
- **Camera intent is the only mutation path.** All camera writes go through
  `queueCameraTarget(target, mode)` in
  `src/hooks/use-canvas-resize-and-camera.ts`; the per-frame stepping is
  world-RAF-owned (`stepCamera`, debug contract
  `cameraFrameSource: "world-render-loop"`). Click-to-jump must be one more
  intent, never a direct camera write.
- Zoom clamps are 0.48–2.4 (`zoomCameraAt` in `src/systems/projection.ts`);
  `defaultCamera` / `clampCameraToMap` live in `src/systems/camera.ts`. The
  minimap never changes zoom — click-to-jump pans only.

### 1.2 Render surface — decision

**Separate small DOM `<canvas>`** inside `.pharosville-overlay`, not an inset
on the main canvas.

Rationale:
- The main canvas backing store is cleared/resized by the render loop and
  budgeted by adaptive DPR; an inset would be repainted (or composited) every
  world frame and would sit under the world's hit-testing
  (`src/renderer/hit-testing.ts`), which knows nothing about a reserved
  corner. A sibling DOM canvas needs zero hit-testing changes.
- DOM placement matches every existing chrome precedent (hover tooltip, HUD,
  detail dock) and gives free CSS positioning in fullscreen.
- Two-layer structure: one offscreen static base canvas (regenerated rarely)
  plus the visible canvas that composites base + dynamic marks. Both sized
  from one constant, e.g. 176×~100 CSS px at DPR ≤ 2 → ≤ 70k device px,
  comfortably under `MAX_MINIMAP_PIXELS`.

Mini-projection: a fixed `IsoCamera` computed once per minimap size with
`fitCameraToMap({ width, height, map, padding: ~4px })`
(`src/systems/projection.ts`). All mapping reuses `tileToScreen` /
`screenToIso` / `isoToTile` — no new math, only a smaller camera.

### 1.3 What is drawn at coarse scale

Static base (offscreen, regenerated only when the `world` memo identity
changes — zone bands and docks can only change on refetch):
- Island/land silhouette: fill tiles where the map is land (one pass over the
  56×56 grid; source of truth `src/systems/world-layout.ts`).
- Risk-water zone tints: flat fills from `ZONE_THEMES` base colors
  (`src/systems/palette.ts`) keyed through `RISK_WATER_AREAS`
  (`src/systems/risk-water-areas.ts`). Semantic colors must match the main
  map (palette is the single source — no hardcoded hex).
- Dock pips: 2–3px squares at `world.docks` tiles, neutral harbor color.
- Lighthouse pip at `LIGHTHOUSE_TILE` (orientation anchor).

Dynamic pass (visible canvas, throttled):
- Viewport rectangle: invert the main camera —
  `screenToIso({0,0}, camera)` and `screenToIso(canvasSize, camera)` give the
  visible iso rect; draw it through the mini camera. 1px bright stroke.
- Titan + heritage ship dots (`ship.sizeTier === "titan" | "unique"`,
  `src/systems/world-types.ts`): position from the same
  `shipMotionSamplesRef` map the render loop already fills; one 2px dot per
  ship, tinted by risk zone. Standard hulls are **not** drawn (noise at this
  scale, and moored standard hulls are hidden on the main map anyway).
- Selected-entity marker (cue priority 1 in `MOTION_POLICY.md`): small ring
  at the selected ship/dock tile.

### 1.4 Update cadence + perf budget

- Static base: regen on `world` change only. Never per frame.
- Viewport rect: redraw on frames where `cameraStep.cameraChanged` is true or
  a camera intent is active (the `CameraStepResult` from `stepCamera` already
  reports both). Idle camera ⇒ zero minimap work.
- Ship dots: at most every 250ms of motion-clock time (compare against the
  RAF `time` already flowing through the loop — **not** `Date.now()`).
- Scheduler interplay (`src/renderer/render-scheduler.ts`): keep the viewport
  rect in all tiers (it is interaction feedback); shed the 4 Hz ship-dot
  refresh in `constrained` (dots freeze, rect stays live).
- Budget: dynamic pass < 0.4ms p50 at DPR 1, zero per-frame allocations
  (precompute tile→mini-px lookups; reuse scratch arrays per the
  allocation-light telemetry precedent). Add `minimapDrawMs` to the
  `renderMetrics` debug object so the perf lane can see it.
- Reduced motion: every paint is event-driven through `requestPaint()`;
  `activeMotionLoopCount` must stay 0 and `activeCameraLoopCount` 0.

### 1.5 Interaction model

- `pointerdown` / `pointermove`-while-down on the minimap canvas:
  `screenToIso(point, miniCamera)` → `isoToTile` →
  `followTile({ camera: currentCameraBase(), map: world.map, tile, viewport: canvasSizeRef.current })`
  → `queueCameraTarget(target, "minimap")`.
- Add `"minimap"` to the `CameraIntentMode` union in
  `src/hooks/camera-intent.ts`; include it in `cameraModeCancelsFollow`
  (jumping cancels follow-selected, same as `"toolbar"`); damping same as
  toolbar. Reduced motion needs no special casing — `queueCameraTarget`
  already short-circuits to `applyCameraImmediately`.
- Drag-to-scrub: same math per `pointermove` with pointer capture; each move
  re-queues the target (the intent controller eases toward the latest).
- Zoom is untouched by minimap interaction; the clamp in `clampCameraToMap`
  guarantees the jump target stays legal.

### 1.6 Accessibility

- The minimap canvas is `aria-hidden="true"` — it is a pointer shortcut, not
  a sole carrier of meaning. Keyboard parity already exists: arrow-key pan,
  `+`/`-` zoom, Home/reset button, ship search with select-then-follow, and
  Tab entity cycling all reach every destination click-to-jump reaches. State
  this explicitly in the PR; no new keyboard surface is required for v1.
- One focusable DOM control: a collapse/expand toggle (`aria-expanded`,
  label "Minimap"), state persisted in `localStorage`. Session-note gotcha:
  jsdom has no `localStorage` — stub it in component tests (see
  `src/hooks/use-legend-dialog.test.tsx`) and keep the default (expanded)
  deterministic for visual lanes (seed in `src/test-setup.ts` +
  `installWallClockOverride` in `tests/helpers/pharosville-debug.ts` if the
  persisted state can affect first paint).
- The toggle and minimap must not intercept Escape (fullscreen exit and
  selection clearing are handled at the shell `onKeyDown`).
- Legend panel (`src/components/legend-panel.tsx`): add one line describing
  the minimap and the keyboard equivalents.
- Reduced motion: click-to-jump is an instant reposition (already guaranteed).

### 1.7 Desktop gate and fullscreen behavior

- Gate: nothing extra to build — the minimap lives inside
  `PharosVilleWorldInner`, which only mounts behind `client.tsx`'s gate. Add
  a guard test asserting the fallback DOM (`desktop-only-fallback`) renders
  no minimap node and the world chunk is not fetched (existing gate tests
  cover the chunk; extend the assertion).
- Sizing at gate minimum (e.g. 720×360 landscape): clamp CSS size, e.g.
  `width: clamp(132px, 16vw, 200px)` with height = width × map aspect
  (≈ 0.55 for the 56×56 diamond). At 360px height the minimap must not
  collide with `.pharosville-home-button` (`bottom: 30px` in
  `pharosville.css`) or the beta tag; place it bottom-right with
  `bottom: ~84px`, and verify at 720×360 in the visual lane.
- Fullscreen (`src/hooks/use-fullscreen-mode.ts` +
  `pharosville-shell--fullscreen`): the minimap is inside the shell overlay,
  so it travels into fullscreen automatically. Two requirements:
  1. Invalidate any cached minimap bounding rect when `fullscreenMode`
     flips — same pattern as the `canvasRectRef.current = null` effect in
     `use-canvas-resize-and-camera.ts` (lines 138–140).
  2. The viewport rect recomputes from `canvasSizeRef` per dynamic pass, so
     the ResizeObserver-driven resize on fullscreen entry needs no extra
     wiring — but the spec test must cover it (enter fullscreen → rect grows
     to match the reclamped camera).

### 1.8 Implementation ladder (verify gates)

1. **Pure module** `minimap.ts` (new, under `systems/`): mini-camera fit for a given CSS
   size, `tileToMinimapPoint`, `minimapPointToTile`, `viewportRectInMinimap`,
   click→`followTile` target builder. No DOM, no canvas.
   → verify: new `minimap.test.ts` round-trips against
   `projection.ts` (`screenToTile(tileToScreen(t)) ≈ t`), rect math at zoom
   0.48 / 1.0 / 2.4; `npm run typecheck`, `npm test`.
2. **Camera intent mode**: add `"minimap"` to `camera-intent.ts` +
   `cameraModeCancelsFollow`.
   → verify: `use-canvas-resize-and-camera.test.ts` case: queueing a minimap
   target cancels an active follow-chase.
3. **Static base renderer** `minimap-base.ts` (new, under `renderer/`; offscreen canvas;
   zone tints from `ZONE_THEMES`, land, dock pips, lighthouse pip).
   → verify: unit test asserts palette colors come from `ZONE_THEMES` (no
   literals); regen count = 1 across repeated paints with a stable world.
4. **Mount + dynamic pass**: minimap component inside
   `.pharosville-overlay`; paint hook called from `use-world-render-loop.ts`
   after `drawPharosVille`, gated by the cadence rules in §1.4; wire
   `minimapDrawMs` into `renderMetrics`; account the backing store against
   `MAX_MINIMAP_PIXELS`.
   → verify: debug contract unchanged (`activeMotionLoopCount` 1/0,
   `activeCameraLoopCount` 0, `motionClockSource` values); reduced-motion
   lane shows a painted minimap with no RAF alive.
5. **Interaction**: pointer handlers + pointer capture; confirm the
   outside-`pointerdown` selection-clear exclusion holds (overlay membership);
   collapse toggle + persistence.
   → verify: browser test — click a minimap corner, assert main camera
   centers that tile (`window.__pharosVilleDebug` camera state); selection
   survives a minimap click; Escape still exits fullscreen with minimap
   focused.
6. **Gate/fullscreen/visual/perf pass**: CSS at 720×360 and 1280×800;
   fullscreen entry/exit; legend copy.
   → verify: `npm run test:visual` (static lanes pick up the new chrome —
   inspect diffs, baselines update intentionally per `VISUAL_REGEN.md`); perf
   lane budgets unchanged (`sustained-motion.spec.ts`); `npm run build`.

---

## 2. Collateral-composition cargo deck (plan 3.7) — Effort: L

A stablecoin's reserve composition rendered as cargo on the ship's deck —
the strongest unbuilt metaphor. Two phases, split by the §4 decision:

- **Phase A (unblocked today, no backend change):** drive a coarse cargo
  style from `reportCards.rawInputs.collateralQuality` — already fetched via
  `/api/report-cards` and already present in the world fixture
  (`src/__fixtures__/pharosville-world.ts:155`). Five values
  (`shared/types/core.ts:93`): `"native" | "rwa" | "eth-lst" |
  "alt-lst-bridged-or-mixed" | "exotic"`.
- **Phase B (blocked on §4):** per-coin live composition from
  `/api/stablecoin-reserves/:id`.

### 2.1 Data shape (Phase B)

Endpoint: `API_PATHS.stablecoinReserves(id)` →
`/api/stablecoin-reserves/{id}` (`shared/lib/api-endpoints/paths.ts:18`).
Response contract already exists client-side as
`StablecoinReservesResponse` + `StablecoinReservesResponseSchema` in
`shared/types/live-reserves.ts`:

```ts
{
  stablecoinId: string;
  mode: "live" | "live-stale" | "curated-fallback" | "template-fallback" | "unavailable";
  reserves: ReserveSlice[];        // { name, pct (0–100], risk, coinId?, depType?, blacklistable? }
  estimated: boolean;
  liveAt?: number;
  provenance?: { evidenceClass; sourceModel; freshnessMode?; scoringEligible };
  displayBadge?: { kind: "live" | "curated-validated" | "proof"; label };
  metadata?: LiveReserveSnapshotMetadata;  // collateralizationRatio, totalReserveUsd, …
  sync?: ReserveSyncStateView;
}
```

`ReserveSlice.risk` is `"very-low" | "low" | "medium" | "high" | "very-high"`
(`shared/types/reserves.ts`). The producer is the upstream
`sync-live-reserves` cron, every 4h (`shared/lib/cron-jobs.ts`, intervalSec
`4 * 3600`), through the 44-adapter registry
(`shared/lib/live-reserve-adapters-registry.ts` /
`live-reserve-adapters-definitions.ts`) — the client never talks to
adapters, only to the snapshot endpoint.

### 2.2 Fetch policy (Phase B)

- **Selected-ship lazy query only.** Do not join reserves into
  `buildPharosVilleWorld` — that would churn the world memo signature
  (`use-pharosville-world-data.ts`) per selection and drag a per-coin payload
  into the registry-guarded world endpoint set. Instead follow the
  `riskTransitionByShipId` precedent in `pharosville-world.tsx`: a side
  channel computed/fetched outside `world` and threaded to the ship layer +
  detail panel as its own prop.
- React Query: `queryKey: ["stablecoin-reserves", stablecoinId]`,
  `staleTime` 30–60min (producer cadence 4h; edge cache fronts it),
  fetch-on-select, no prefetch in v1 (an optional later wave may prefetch the
  12 titans — explicitly out of scope here).
- While loading or on error: render no cargo and no panel row (absence is the
  significance gate, not a spinner on deck).

### 2.3 Visual metaphor

- **Where:** deck cargo on **titan + heritage hulls only** (the audit-shield
  precedent from plan 2.4; standard 104×80 hulls have no readable deck).
  Phase B live composition additionally requires the ship to be **selected**
  (that is when the data exists, per §2.2). Phase A class styling can apply
  to all titan/heritage ships since `collateralQuality` is fleet-wide data.
- **What:** a fixed deck budget of 6 cargo units per ship. Phase B
  apportions units to risk buckets by largest-remainder over slice `pct`,
  after grouping `ReserveSlice[]` into ≤ 4 classes:
  - `very-low | low` → pale strapped crates (treasuries/cash reading),
  - `medium` → plain timber crates,
  - `high | very-high` → dark tarred barrels with hazard lashing,
  - unknown remainder (`metadata.unknownExposurePct`) → grey shrouded bale.
  Phase A maps `collateralQuality` to a single uniform crate style
  (`native`→timber, `rwa`→pale strapped, `eth-lst`→timber+teal band,
  `alt-lst-bridged-or-mixed`→mixed two-tone, `exotic`→tarred barrel).
- **How drawn:** procedural canvas primitives in the ship layer
  (`src/renderer/layers/ships/draw-ship.ts` neighborhood), **not** new
  manifest sprites — the manifest sits at 73 entries against a cap of 75
  (`docs/pharosville/CURRENT.md`); burning slots on cargo crates is not
  justified for v1. A sprite upgrade can ride a future Wave-6-style pass.
- **Zoom gating:** cargo draws only at zoom ≥ ~1.0, using the centralized
  threshold constants F4 is introducing (`src/renderer/visual-scales.ts`).
  If F4 has not landed, define the constant there anyway — do not add a new
  magic number. Hit targets must not change across zoom (F4 rule).
- **Ordering/determinism:** cargo unit order is a pure sort by
  (risk desc, pct desc, name asc) — pure function of (shipId, payload). No
  RNG, no `Date.now()`, no per-frame variation: cargo is **Static** speed
  class per `MOTION_POLICY.md`; identical under reduced motion.

### 2.4 Detail-panel / ledger parity (8-row cap)

- The visible panel caps at 8 fact rows (`detail-panel.test.tsx:51`), and
  facts only reach the DOM panel if registered in
  `DETAIL_FACT_LABELS` / `buildDetailFactSections`
  (`src/lib/format-detail.ts`). Decision: **fold**, do not gate —
  one new row `Reserves` whose value composes the top 2 slices plus a count:
  e.g. `Treasuries 81% · Cash 9% · 3 more (live)`. Phase A folds nothing: the
  value is the collateral-class label, e.g. `RWA-backed class`.
- The accessibility ledger has **no cap**: emit one line per slice
  (`name pct% — risk`), plus mode/provenance (`live, attested 2026-06-09`,
  `curated fallback`, `estimated`).
- Shared-derivation rule (the `depegHistorySeverity` precedent in
  `src/systems/detail-model.ts`): export one function, e.g.
  `reserveCargoSummary(payload): { units: CargoUnit[]; panelValue: string;
  ledgerLines: string[] } | null`, consumed by both the renderer and
  `detail-model.ts`, so canvas and DOM can never disagree. Returns `null`
  when `mode` is `"unavailable"` or `"template-fallback"` (no cargo, no row).
- `estimated: true` and `mode: "curated-fallback"` must be visible in the
  text (`est.` suffix / `displayBadge.label`) — the deck cargo itself does
  not encode provenance (that is §3's job).

### 2.5 Implementation ladder (verify gates)

1. **Phase A**: extend `ShipVisual` derivation in
   `src/systems/ship-visuals.ts` with a `cargoClass` from
   `collateralQuality`; `reserveCargoSummary` Phase-A shape; panel row +
   ledger line registration in `format-detail.ts` / `detail-model.ts`.
   → verify: parity unit tests (panel row folds, ledger full line), 8-row cap
   test still green, `npm test`.
2. **Phase A renderer**: procedural crates on titan/heritage decks behind the
   zoom-gate constant.
   → verify: visual lane diff inspected at 1.0× and 2.4×; hover/selection
   hit-target tests unchanged; perf lane unchanged.
3. **Gate on §4 decision** — stop here until the allowlist expansion is
   approved and landed.
4. **Phase B fetch**: `useStablecoinReserves(selectedShipId)` hook validated
   by `StablecoinReservesResponseSchema`; side-channel prop threading.
   → verify: msw/fixture unit tests for all 5 `mode` values; no world-memo
   re-runs on selection (assert `worldInputSignature` stability).
5. **Phase B cargo**: largest-remainder apportionment in
   `reserveCargoSummary`; selected-ship deck upgrade from class-style to
   composition stacks.
   → verify: determinism test (same payload ⇒ identical units), reduced-motion
   freeze identical, visual lane with a live-reserves fixture scenario added
   to `SCENARIO_CATALOG.md`.
6. Full `AGENTS.md` validation sweep before claiming completion.

---

## 3. Attestation pennants (plan 3.8) — Effort: S–M, blocked on §4

Pennant flags encoding how a coin's reserves are evidenced. Entirely blocked
on the same `/api/stablecoin-reserves/:id` allowlisting as §2 Phase B — the
needed fields ride the same response (`provenance`, `displayBadge`, `liveAt`,
`metadata.freshnessMode`). Build it as a small rider on §2 Phase B, sharing
its fetch hook and fixture scenarios.

- **Data → treatment** (titan + heritage, selected ship, zoom ≥ 1.0, same
  gate constant as cargo):
  - `provenance.evidenceClass`: `independent` → two crisp swallow-tail
    pennants; `static-validated` → one square flag; `weak-live-probe` → one
    narrow triangle.
  - `displayBadge.kind` tints: `live` → teal, `proof` → gold,
    `curated-validated` → neutral linen.
  - Staleness (`mode === "live-stale"` or `sync.stale`) → desaturated/drooped
    variant. No new animation: pennants are static cloth; any flutter must
    reuse the existing sail/wind treatment (Slow class ceiling), nothing
    independent.
- **Parity:** one ledger line `Reserve attestation: independent feed, live
  (attested <date>)` derived from the same `reserveCargoSummary`-adjacent
  helper (single exported derivation, never two). Panel-side it folds into
  the §2.4 `Reserves` row's parenthetical (`… (live)`) — no second panel row,
  preserving the 8-row cap.
- **Reduced motion / determinism:** static drawing, pure function of payload.
- **Not worth a degenerate pre-decision version:** `rawInputs.collateralFromLive`
  (boolean, already fetched in report cards) could drive a minimal "live
  reserves" pennant today, but a one-bit pennant is below the significance
  bar — skip it and wait for §4.
- Verify gates: parity unit test, hit-targets unchanged, visual lane diff on
  a titan with each `evidenceClass` fixture, reduced-motion lane.

---

## 4. Decision memo — allowlisting the live-reserves endpoint

**The single decision the operator must make** (for both §2 Phase B and §3):
expand the Pages Function read allowlist with the per-stablecoin reserves
path family `GET /api/stablecoin-reserves/{id}` — or decline and keep both
features at their Phase-A/blocked state.

### What the allowlist is today

`functions/api/[[path]].ts` → `getAllowedEndpoint(url)` exact-matches
`${url.pathname}${url.search}` against `PHAROSVILLE_API_CLIENT_ENDPOINTS`,
which derives from `PHAROSVILLE_ENDPOINT_REGISTRY`
(`shared/lib/pharosville-endpoint-registry.ts`): exactly six fixed strings
(`/api/stablecoins`, `/api/chains`, `/api/stability-index?detail=true`,
`/api/peg-summary`, `/api/stress-signals`, `/api/report-cards`). Everything
else 404s; non-GET 405s; the upstream origin is pinned to
`https://api.pharos.watch` and `PHAROS_API_KEY` is attached server-side only.

### Why this expansion is not just "one more string"

`/api/stablecoin-reserves/{id}` is parameterized, so the exact-match
mechanism cannot express it. Options:

- **(a) Recommended — registry-driven path family.** Add an entry kind to the
  endpoint registry, e.g.
  `{ kind: "path-family", prefix: "/api/stablecoin-reserves/", idPattern: /^[a-z0-9._-]{1,64}$/, metaMaxAgeSec }`,
  and teach `getAllowedEndpoint` to match it: exactly one extra path segment,
  segment matches `idPattern`, **`url.search === ""`** (no query passthrough).
  The registry stays the single source of truth, so `check:runtime-facts`
  (which compares the smoke allowlist to the registry) stays derivable.
- **(b) Aggregate upstream endpoint** (`/api/stablecoin-reserves-all`): one
  exact-match string, zero proxy mechanism change — but it requires new
  upstream work outside this repo, and ships a fleet-wide payload
  (~150 coins × slices, est. 100–400KB) to every client versus ~1–6KB per
  selection with (a). Rejected unless the upstream team prefers it.
- **(c) Decline.** §2 stays at Phase A (collateral *class*, not composition);
  §3 stays blocked. Zero new surface.

### Security posture under (a)

- Read-only proxy unchanged: GET-only (405 otherwise), origin pinned by
  `normalizeBaseUrl`, `PHAROS_API_KEY` remains a Pages secret attached in
  `fetchUpstream` and never reaches the client.
- The id segment is the **only new attacker-influenced input** forwarded
  upstream. The strict charset/length pattern (reject `.`/`..` traversal,
  encoded slashes, query smuggling — validate the *decoded* segment, forward
  the encoded original) plus `search === ""` keeps the forwarded URL space
  bounded. Unknown ids pass through as upstream 404 JSON.
- Cache-poisoning/amplification: `buildPathCacheKey` keys per full path, so
  entries are per-id; confirm `maybeStoreJsonEdgeCache` in
  `functions/_shared.ts` keeps its store-only-success policy so junk-id 404s
  don't fill the edge cache. Cardinality is bounded by the id length cap.
- No rate limiting exists in the function today (Cloudflare defaults only);
  the client-side selected-ship-only fetch (§2.2) keeps organic volume to
  ~1 request per selection, and the edge cache absorbs hot ids.

### Payload / caching

- ~1–6KB JSON per coin; producer cadence 4h (`sync-live-reserves`).
- Add `stablecoinReserves` to `API_FRESHNESS_MAX_AGE_SEC`
  (`shared/lib/api-freshness.ts`) — suggest **1800s** edge `metaMaxAgeSec`
  (well under the 4h producer interval; matches the `chains` lane order of
  magnitude), `producerIntervalSec: CRON_INTERVALS`-derived 14400.

### Lockstep updates required (the "intentional expansion" checklist)

One PR, reviewed as a backend-contract change per `AGENTS.md`:

1. `shared/types/pharosville.ts` — add `stablecoinReserves:
   StablecoinReservesResponseSchema` to `PHAROSVILLE_API_PAYLOAD_SCHEMAS`
   (schema already exists in `shared/types/live-reserves.ts`).
2. `shared/lib/pharosville-endpoint-registry.ts` — the path-family entry
   (and decide whether it joins `WORLD_ENDPOINT_KEYS`; it should **not** —
   it is a detail endpoint, not a world-build input).
3. `functions/api/[[path]].ts` — family matching in `getAllowedEndpoint`.
4. `shared/lib/pharosville-smoke-matrix.ts` — allowed probe with a stable id
   (e.g. `/api/stablecoin-reserves/usdc`) + blocked variants: query suffix
   (`?extra=1`), nested segment (`/usdc/x`), invalid charset
   (`/USD%2FC`, `/..%2fadmin`), bare prefix (`/api/stablecoin-reserves/`).
5. `check:runtime-facts` snapshot + `npm run validate:docs` regen.
6. Smoke lanes: `npm run smoke:api-local`, `npm run smoke:dev-proxy`, and
   post-deploy `npm run smoke:live -- --url https://pharosville.pharos.watch`.

### Recommendation

Approve **(a)** — one parameterized, strictly-validated, read-only path
family. The exposure delta is small (public read data, server-side key
untouched, bounded forwarded-URL space, per-id edge caching), and it unlocks
the two highest-value unbuilt metaphors with a single contract change.
Sequence: build §2 Phase A now (needs no decision), land the allowlist
expansion as its own PR with the checklist above, then ship §2 Phase B and
§3 on top. If declined, Phase A still ships and this memo stands as the
record of what was deferred and why.

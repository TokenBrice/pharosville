# PharosVille "Wow" Revamp — Follow-Up Plan

- Date: 2026-05-18
- Parent: `agents/2026-05-17-pharosville-wow-revamp-plan.md` (closes the deferred items)
- Status: PROPOSED — code review of `main` confirms the items in §2 are still outstanding; this plan organizes the highest-impact deferred work into two coordinated waves
- Scope: only items the parent plan recorded as Partial / Deferred. Items already shipped (W1.03–W1.21, W2.07, W2.09–W2.17, W2.19, W3.01–W3.20, W4.01–W4.07, W4.11–W4.12, W4.14–W4.16, W4.20–W4.22, W4.23–W4.27, W4.29) stay out of scope.

## 1. Why a follow-up

The parent plan landed three batches that resolved roughly two thirds of the
adopted proposals — palette, water drama, motion choreography, atmosphere,
runtime hardening. The remaining third clusters around two things:

1. **Asset regenerations** that need PixelLab/provenance coordination
   (every titan emblem, four chain harbors, the civic agora, the Hyperliquid
   dock, the dock-side prop pack, FRAX/GHO heritage, full WebP).
2. **A single wired-but-silent data event** — `riskTransition` reads on the
   canvas (W4.25 shipped) but never surfaces in the detail panel or
   accessibility ledger.

Plus a few small code hygiene items (`ships.ts` split, ring-buffer telemetry,
`exactOptionalPropertyTypes`).

The painted-titan-emblem set is Council Must-Have #2 and the per-chain harbor
identity wave is Must-Have #9. Neither has shipped yet. They are the single
largest blocks of "wow delta per engineering hour" still on the table.

## 2. Verified state on `main` (as of 2026-05-18)

Spot-checks of the working tree, not the parent plan's self-report:

- `src/renderer/layers/ships.ts` is **2,749 LOC, single file** (W1.01 unsplit).
- `tsconfig.json` has `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch` — **missing
  `exactOptionalPropertyTypes`** (W1.02 partial).
- `public/pharosville/assets/manifest.json` has **0 `webpPath` entries** across
  82 PNG references (W2.18 + W4.28 not started).
- `public/pharosville/assets/docks/`: no `hyperliquid-trading-floor.png`;
  `solana-prism-stilt.png` is 192×136 (target 280×180); Avalanche/Base/
  Polygon/Arbitrum sprites are the original `55e7ea2` set (not regenerated).
- `public/pharosville/assets/props/sundial.png` is 64×64 (target 96×96).
  No `dock-awning`, `dock-figures`, or `lantern-string` props.
- `public/pharosville/assets/ships/`: titan PNGs exist but emblems are still
  the placeholder white-matte stickers (W2.01–W2.03 unstarted). No FRAX or
  GHO sprite (W2.06).
- `src/systems/motion-sampling.ts` writes `sample.riskTransition` and tests
  cover it, but `src/systems/detail-model.ts` and
  `src/components/accessibility-ledger.tsx` never read it
  (W4.25 detail-panel parity deferred).
- `src/hooks/use-world-render-loop.ts` still uses bespoke `LongtaskWindow`
  and bespoke frame-interval / numeric-max windows alongside
  `DrawDurationWindow` (W1.06 outstanding).
- No `SHIP_HERITAGE_NAMEPLATES`, no per-hull `wakeStyle` override
  (W2.04 nameplate piece, W2.10 unstarted).
- No `shipSailTintCache` / `sailEmblemSpriteCache` telemetry counters
  (W2.20 unstarted).
- `cacheVersion` still pinned to `2026-05-03-ton-pigeonnier-pier-v3` — no
  asset regen has bumped it.

The parent plan's "shipped" claims for batches 1–3 (W3.20, W4.23–W4.27, W4.01,
W4.07, W1.03–W1.05, W4.11–W4.12, W4.29) verify against `git log` and the
expected code surfaces; this follow-up does not retread them.

## 3. North star (carried over)

Same as parent §1: **Compel · Inform · Live · Help**. Two more rails on top:

- The Wave 6 asset batch is **one PixelLab job campaign + one
  `style.cacheVersion` bump + one consolidated baseline rebake**. Resist the
  urge to ship sprites one at a time.
- The Wave 5 code pass is **single-PR-per-task and surgical**. Do not refactor
  surfaces the change does not touch.

## 4. Prioritization — what "most impacting" means here

Five impact tiers; the wave plan in §5 lands them in order:

| Tier | Items | Why |
|---|---|---|
| **T1 — Largest single visual lifts** | W2.01–W2.03 painted titan emblems; W4.09 civic agora regen; W4.08 Hyperliquid sprite; W4.17/W4.18 chain dock regens | Council Must-Haves #2 and #9; titans + harbors are the dominant on-screen entities |
| **T2 — Wired-but-silent data** | W4.25 detail-panel + ledger parity for `riskTransition` | The motion event already reads on canvas; DOM parity is a surgical edit that closes an a11y gap |
| **T3 — Lively land + dock identity polish** | W4.13 dock prop pack; W4.19 beach-foam ribbon; W4.10 sundial bump; W2.08 per-ship mast-lantern color | "Single largest lively lift" + per-dock identity + night atmosphere |
| **T4 — Asset / code prereqs** | W1.01 `ships.ts` split; W2.18 + W4.28 WebP sweep; W2.20 sail-cache telemetry | Unblock Wave 6 fleet work and lock in payload budget |
| **T5 — Hygiene** | W1.02 `exactOptionalPropertyTypes`; W1.06 ring-buffer consolidation; W2.10 wake personality; W2.04 heritage nameplates; W2.06 FRAX + GHO heritage | Below-the-line polish; bundle into Wave 5 if cheap, otherwise punt |

Explicit non-goals for this follow-up:

- **Titan 5-pose sprite set** stays in "Future / queued" (parent §11). The
  W2.14 yaw-skew approximation is acceptable until a separate pose campaign.
- **USYC titan promotion** — wait for circulating supply trigger; documented
  but not actioned here.
- **Audio**, **OffscreenCanvas/Worker**, **WebGL migration** — all parent
  §10 "Decided NOTs" still hold.
- **W1.19 reduced-motion audit** as a discrete pass — every batch-3 task
  already documented and tested reduced-motion behavior; codify the policy
  as a render-suite invariant if/when we touch `tests/visual` next, not
  before.

## 5. Wave plan

Two coordinated waves. Wave 5 ships first because (a) `ships.ts` split is a
hard dependency for Wave 6 fleet work and (b) the W4.25 a11y gap is the
single highest-leverage code-only fix.

### Wave 5 — Code lock-in (1 week, no PixelLab)

**Goal.** Close W4.25 (DOM parity for the live `riskTransition` data event),
land the `ships.ts` split that gates Wave 6 fleet work, generalize the
lighthouse surf data shape, and clean up the small code-hygiene items.
No new sprites. No `style.cacheVersion` bump. One baseline rebake only if
W4.19 produces drift.

| # | Task | Owner | Source | Cx | Impact |
|---:|---|---|---|---|---|
| W5.01 | **Detail-panel + accessibility-ledger parity for `riskTransition`.** Add a "tracking new risk band" row to `src/systems/detail-model.ts` (read `sample.riskTransition.{fromTile,toTile,progress}` for the selected ship; suppress when `progress >= 1`). Mirror in `src/components/accessibility-ledger.tsx` under the existing ship summary block. Detail index is built once per world refresh today — accept the constraint that the row updates at world-refresh cadence rather than per-frame; that's truthful enough for a 3 s transit and avoids new infrastructure. Tests in `detail-model.test.ts` for both transition-in-progress and transition-complete states. | VD + EN | parent W4.25 follow-up | M | high (closes the wired-but-silent cue) |
| W5.02 | **Split `ships.ts` into `src/renderer/layers/ships/{draw-ship,sail,wake,livery,index}.ts`.** Zero behavior change. Phase 8 of the world-canvas-decomposition. Run `npm run typecheck`, `npm test`, `npm run test:visual` (no baseline rebake expected). | EN | parent W1.01 | L | velocity compounding; unblocks W6 fleet items |
| W5.03 | **Beach-foam ribbon per dock pad.** Generalize `LIGHTHOUSE_SURF` data shape into `HARBOR_SURF_BY_DOCK` (keyed by dock id, 6-tile thin ribbon along the seawall edge, 3 px wide, peak alpha 0.6, per-zone alpha multiplier from `ZONE_THEMES`). New `drawHarborSurf` pass between the dock pass and the entity pass. Reduced-motion returns the static peak frame. Visual rebake expected for the 6 dock pads. | HM + HY | parent W4.19 | M | high (per-dock identity) |
| W5.04 | **`exactOptionalPropertyTypes` cleanup.** Enable the final strict flag; fix the surface that fails. Most likely fallout in motion-types and detail-model shapes that use `?:` for "intentionally absent." Run `tsc --noEmit` clean. | EN | parent W1.02 | S | code health |
| W5.05 | **Ring-buffer the remaining telemetry windows.** Migrate `frame-interval`, `numeric-max`, `longtask` windows in `use-world-render-loop.ts` to reuse the `DrawDurationWindow` ring-buffer pattern. Behavior unchanged; allocations down. | EN | parent W1.06 | XS | dev trustworthiness |
| W5.06 | **Sail cache telemetry counters.** Expose `sailEmblemSpriteCache`, `sailLogoSpriteCache`, `shipSailTintCache` hit/miss/evict counts via `__pharosVilleDebug` (mirroring A3 route-LRU pattern). Needed to size W6.05 per-ship mast-lantern cache. | EN | parent W2.20 | XS | observability prereq for W6 |
| W5.07 | **Per-class wake personality.** Per-hull `wakeStyle` override layered on top of `wakeStyleForZone` (galleon wide-slow, brigantine medium, schooner narrow-glide, junk choppy-irregular, caravel baseline). Multiplicative scalars only — color stays zone-driven. | SS | parent W2.10 | S | med |

**Wave 5 exit gates.**
- `npm run validate:release` green
- `tsc --noEmit` clean post-`exactOptionalPropertyTypes`
- `npm run test:visual` baselines rebaked only for W5.03 dock-surf drift, after
  screenshot review
- Detail panel + accessibility ledger show the new risk-transition row on a
  ship caught in tack-out (verify with the W4.25 fixture)
- `__pharosVilleDebug` exposes the three new sail-cache counters
- `ships.ts` is gone; `ships/index.ts` re-exports the previous public surface

**Wave 5 NOT in scope.** No `style.cacheVersion` bump. No manifest cap change.
No new PNGs. No WebP. No heritage roster changes.

### Wave 6 — Identity pass: fleet + harbors (2–3 weeks, one PixelLab campaign)

**Goal.** Every titan paints its heraldic emblem; every chain harbor reads as
its chain at zoom; the civic agora replaces the wallpaper plaza; dock-side
life lands; full WebP coverage. **One** `style.cacheVersion` bump (proposed
slug `2026-06-W6-identity-pass`). **One** consolidated baseline rebake at
wave close. **One** manifest cap reset.

**Hard dependency.** Wave 5 must merge first — `ships.ts` split (W5.02),
sail-cache telemetry (W5.06).

Two phases run roughly in parallel; one provenance ledger, one PR per
sub-batch (ship fleet, chain harbors, civic land, WebP migration).

#### Phase 6A — Fleet identity (Ship Sculptor lane)

| # | Task | Source | Cx | Impact |
|---:|---|---|---|---|
| W6.01 | **Regenerate `ship.usdt-titan`** with Tether-teal `#009393` sail-cloth + bold off-cream kraken silhouette painted into the largest mainsail (~1/4 sail, no text/numerals), oxidized-bronze masthead lantern, cream bowsprit pennant. PixelLab prompt + style anchor `2026-04-29-lighthouse-hill-v5`. WebP twin. Sail-tint polygon refresh. | parent W2.01 | S sprite | very high |
| W6.02 | **Paint emblems on the five remaining titans** — PYUSD porthole-compass, USD1 liberty torch, BUIDL institutional anchor on black, USDe Greek-delta, sUSDe delta-in-vault-ring. Brand-tinted sail cloth × silhouette only. WebP twins. | parent W2.02 | M (5 sprites) | very high |
| W6.03 | **Regenerate `ship.xaut-unique`** — gilded bullion-barge silhouette, gold-banded waterline, single-ingot sail emblem. WebP twin. | parent W2.03 | S sprite | med-high |
| W6.04 | **Heritage tier engraved nameplates.** New `SHIP_HERITAGE_NAMEPLATES` table mapping each heritage hull to its stern engraving ("CURVE", "LIQUITY", "F(X)", "PAXOS", "TETHER GOLD", "HASHNOTE"). Render at `camera.zoom ≥ 0.7`. No new sprites. | parent W2.04 (nameplate piece) | S | high (completes heritage chrome) |
| W6.05 | **Per-ship mast-lantern color** derived from `livery.primary` lightened ~70%. Cache cardinality grows ~3 → ~30; verify against W5.06 telemetry that LRU eviction holds. | parent W2.08 | M | high at night |
| W6.06 | **FRAX + GHO heritage hulls.** New entries in `UNIQUE_SHIP_DEFINITIONS` (FRAX fractal/binary octagon silhouette; GHO ghost silhouette in Aave purple). Two new PNGs + sail-tint polygons; WebP twins. Doc update in `CURRENT.md`. *Cap allowance: +2 manifest entries.* | parent W2.06 | M | med-high |

#### Phase 6B — Harbors + civic land (Harbormaster lane)

| # | Task | Source | Cx | Impact |
|---:|---|---|---|---|
| W6.07 | **Regenerate `overlay.center-cluster`** with central open colonnaded agora pavilion (4 limestone columns, low terracotta hip roof, no walls, ~80×80 px) + 7 staggered residential roofs. Same 384×224 footprint, anchor, scale. Cap silhouette ≤ 110 px so the lighthouse remains the dominant vertical. WebP twin. | parent W4.09 | M | highest single-land win |
| W6.08 | **Generate `dock.hyperliquid-trading-floor`** — obsidian-glass trading-pit silhouette (~192×136) with three teal terminal pillars + orange ticker-tape band. WebP twin. *Cap allowance: +1 manifest entry.* | parent W4.08 | S | identity gap close |
| W6.09 | **Regenerate `dock.solana-prism-stilt`** at 280×180 (was 192×136) with deck-mounted neon-cyan light strip and three crystalline prism beacons. Verify seawall clip + `DOCK_OUTWARD_VECTOR_OVERRIDES` for tile (25,23). WebP twin. | parent W4.17 | M | med-high |
| W6.10 | **Regenerate Avalanche / Base / Polygon / Arbitrum dock sprites** (same anchor/footprint, painted content only): Avalanche snow-cap + watchtower mast with red lookout pennant; Base steel-blue accent + three blue containers; Polygon hex tarp panels in violet/magenta + abacus rack; Arbitrum raised keystone + suspended scroll/ledger banner. WebP twins. | parent W4.18 | L (4 sprites) | biggest harbor-distinctiveness win |
| W6.11 | **Bump sundial sprite** to 96×96 with 3 px wedge gnomon shadow (umbra/penumbra step). WebP twin. | parent W4.10 | S | med-high |
| W6.12 | **Dock-side ambient prop pack** — three new prop kinds in `SCENERY_PROPS` and manifest: `dock-awning` (canvas tarp, per-chain tint), `dock-figures` (silhouette stevedore pair, non-selectable), `lantern-string` (festoon lights, night-only). ~2 awnings + 1 figure pair + 1 lantern string per major harbor. WebP twins. *Cap allowance: +3 manifest entries; +6–10 prop instances.* | parent W4.13 | M | single largest "lively" lift |

#### Phase 6C — WebP close-out + provenance

| # | Task | Source | Cx | Impact |
|---:|---|---|---|---|
| W6.13 | **Full WebP migration.** All PNGs not paired in 6A/6B (terrain, landmarks, props, overlays not regenerated) get a WebP twin under the `webpPath` manifest field. Renderer prefers WebP; `<picture>` fallback (or manifest-field fallback) for PNG. Visual Director sign-off on q=85 visual identity at full board. | parent W2.18 (partial) + W4.28 (close-out) | M | -2 to -3 MB initial payload |
| W6.14 | **Provenance ledger consolidation.** One PixelLab campaign ID; one ledger entry per regenerated asset (job ID + prompt + style anchor + dims + post-process notes). Single `cacheVersion` bump to `2026-06-W6-identity-pass`. | parent §8 conventions | S | required |

**Wave 6 exit gates.**
- Every titan + heritage hull paints a distinct heraldic emblem at home zoom
- Hyperliquid sprite present; Solana visibly scaled; AVAX/Base/Polygon/Arbitrum
  identifiable without label
- Civic agora visible at home zoom; lighthouse remains the dominant vertical
- Dock-side props visible at ≥2 harbors; suppressed at home zoom on the
  cemetery cove + pigeonnier islet
- `npm run check:pharosville-assets` green with manifest cap raised exactly
  once and reset to a new ceiling reflecting +6–9 entries (1 Hyperliquid + 2
  FRAX/GHO + 3 prop kinds + agora + sundial; subtract any prop kinds counted
  as a single manifest entry)
- `npm run check:pharosville-colors` green (no palette regression)
- Full WebP coverage measurable: initial payload drop ≥ 2 MB on
  `npm run check:release-readiness`
- Single consolidated baseline rebake against the canonical fixture set
- Sail-cache hit rate ≥ 99% steady-state (W5.06 telemetry confirms W6.05 sizing)
- `npm run smoke:live` post-deploy clean

## 6. Cross-lane handshakes

Resolve before Wave 5 PR #1 lands:

1. **Engineer ↔ Ship Sculptor.** Confirm `ships.ts` split shape (W5.02). Public
   export surface from `ships/index.ts` must match what `world-render.ts` and
   `entity-pass.ts` import today. No in-flight branches should be touching
   `ships.ts` during the split PR.
2. **Visual Director ↔ Engineer.** Lock the detail-panel row copy for W5.01
   ("tracking new risk band — *from* ${fromZone} *to* ${toZone}") and confirm
   that the world-refresh-cadence constraint is acceptable for the 3 s window.
   Alternative is a per-frame detail-panel rebuild infrastructure, which the
   parent plan explicitly punted on.
3. **Harbormaster ↔ Hydrographer.** Beach-foam alpha multiplier per zone
   (W5.03) — Hydrographer publishes the `ZONE_THEMES.beachFoamAlpha` field
   before Harbormaster wires the renderer.

Resolve before Wave 6 PR #1 lands:

4. **Ship Sculptor ↔ Engineer.** WebP q=85 readability canary — bake one
   titan (USDT kraken) early, screenshot-compare emblem readability post-encode
   against PNG. Sign-off gates 6A.
5. **Harbormaster ↔ Engineer.** Manifest cap raise — project the wave delta
   (+6–9 entries) and lift `maxManifestAssets` in `scripts/pharosville/
   validate-assets.mjs` exactly once at wave start.
6. **All lanes ↔ Engineer.** Single `style.cacheVersion` bump
   (`2026-06-W6-identity-pass`) lands on the final PR of the wave; no
   intermediate bumps. Provenance entries land in the same PR as their sprite.

## 7. Operating cadence (carried from parent §9)

- `npm run validate:release` per PR
- `npm run test:visual` baselines updated only for intentional drift,
  screenshots reviewed
- `npm run smoke:live -- --url https://pharosville.pharos.watch` post-deploy
- Manifest cap reset check at wave close
- Cross-lane retrospective (10 min, written) at wave close: what surprised
  the implementer, what to carry forward

## 8. Risk register

| Risk | Mitigation |
|---|---|
| WebP encoding washes out painted emblems on titans | W5.06 telemetry + early USDT canary (handshake #4) gate the wave |
| `ships.ts` split breaks visual baselines | Pure refactor; if any baseline drifts, the split is wrong — revert and re-split |
| Detail-panel world-refresh cadence (W5.01) drops a transition row mid-3 s | Acceptable per parent plan §0; if it bites, escalate to per-frame detail rebuild as separate work |
| PixelLab queue latency stretches Wave 6 past 3 weeks | Phases 6A and 6B can land independently — each is its own provenance ledger entry. Only the `cacheVersion` bump must be once-per-wave. |
| Manifest cap raised twice during wave | Project +6–9 in handshake #5 and reset cap exactly once at wave start, exactly once at wave close. |
| New props (W6.12) push entity pass over LOD budget | Reuse the W4.27 cue-priority arbiter — scenery is the lowest tier; cap-bound frames drop awnings/figures/lanterns first. |

## 9. Tasks not included and why

Items the parent plan recorded as deferred but **excluded** from this
follow-up:

- **W1.19 reduced-motion audit as a discrete pass.** Already executed
  piecemeal across batch 3; codify as a render-suite invariant only when
  next touching `tests/visual`.
- **Titan 5-pose sprite set** (parent §11). Pure asset campaign; would more
  than double Wave 6 scope. Queue for a dedicated post-Wave-6 wave.
- **USYC titan promotion** (parent §11). Trigger-gated on circulating supply;
  do not preempt.
- **`motion-sampling.ts` split** (parent §11). 1,045 LOC, at threshold but
  not over; defer until a structural reason forces it.

---

**End of plan.** Total items: 7 in Wave 5 (code-only, ~1 week), 14 in Wave 6
(asset + WebP, ~2–3 weeks). End-of-Wave-6 deliverable: every titan paints its
emblem, every chain harbor reads as its chain, the civic agora replaces the
wallpaper plaza, dock-side life lands, full WebP coverage drops initial
payload ≥ 2 MB, and the wired-but-silent risk-transition cue finally reads
in the DOM.

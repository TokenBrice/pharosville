# L10 — Data-as-garden opportunity map

## Verdict
The app has enough data and already has garden metaphors; the gap is that its meaningful garden surfaces are tiny, outside the rest frame, or subordinate to the fleet. A step change should move a few trustworthy readings into composed, materially convincing garden surfaces—not add another vocabulary of microcues. The strongest opportunity is a quiet, visible dry-garden record, with concentration stonework and inspection-scale patina behind it.

## Evidence

1. **Exactly seven feeds are admitted**, not the entire Pharos catalogue. The proxy matches path **and query** against the shared registry (`functions/api/[[path]].ts:79-82,209-217`); the hook requests all seven (`src/hooks/use-pharosville-world-data.ts:201-213`). Paths resolve through `shared/lib/api-endpoints/paths.ts:15,20,61-71`:

   | Feed | Available dimensions; present use / opportunity |
   |---|---|
   | `/api/stablecoins` | Price/provenance/confidence; circulating stocks and previous day/week/month; chain presence (`shared/types/market.ts:23-49`). Fleet scale/identity/presence already use these. Previous stock is **not** measured issuance. |
   | `/api/chains` | Supply, attribution gap, changes, top issuer shares, five health factors (`shared/types/chains.ts:48-100`). Supply frontage, quay health and weekly tidal flat already exist; top-share composition deserves a more legible surface. |
   | `/api/stability-index?detail=true` | Official current score/band/components/contributors and dated history with optional historical components (`shared/types/stability.ts:4-51`). Tower/sky, pine month record and DOM long record already use it. Historical component trajectories appear unused [INFERENCE]. |
   | `/api/peg-summary` | Deviation, active depeg, peg score, event count/worst/last, tracking span, peg percentage, trust/coverage (`shared/types/market.ts:362-399`). Risk/record/ship age already use parts; tracking history is visually under-expressed. |
   | `/api/stress-signals` | Own score/band, component availability, amplifiers, observation time (`shared/types/market.ts:587-630`). Risk berths already use this. This all-coins endpoint does **not** supply per-coin history. |
   | `/api/safety-grades` | Grade/score, methodology, publication/as-of (`shared/types/safety-grades.ts:7-21`). No reserve composition or audit history; do not invent either. |
   | `/api/mint-burn-flows` | 24h gross/net/counts, longer net windows, hourly buckets, baseline/pressure, largest event, explicit scope/coverage (`shared/types/mint-burn.ts:8-107`). Cargo uses 24h; longer windows/hourly/pressure appear unused [INFERENCE]. |

   Shared reserve, yield and transaction-event types are **not evidence of allowed fetches**. `_shared.ts` owns security/cache helpers, not another allowlist; its last-good storage checks parseability, not schema (`functions/_shared.ts:142-175`).

2. **Confirm H1/H2/H4 visually, with qualification.** `day-chrome.png` (bottom third) shows a broad green bank without readable analytical garden texture; the mid-distance sails dominate the data surface. `overview.png` (left shore) reveals the dry garden, but not as a rest-view reading. Raked gravel and cemetery stone groups already exist (`src/three/garden-stone-garden.ts:32-44,148-175`); the contract explicitly puts them outside rest (`docs/pharosville/CONTRACTS.md:253-258`). This is placement/scale/attention failure, not absence of garden vocabulary. Cultural authenticity or actual user comprehension cannot be established from screenshots [INFERENCE].

3. **Existing slow truths are good seams, not blank territory.** Month pines encode newest-history-anchored 30d average PSI (`src/systems/garden-month-record.ts:15-41`) with a ledger twin (`:45-59`). Chain top shares already enter dock records (`src/systems/chain-docks.ts:43-62,178`). Tracking span already participates in hull patina, carefully distinguished from launch age (`src/systems/ship-age.ts:110-158`). The weekly supply tide already occupies the tidal-flat/wrack channel (`docs/pharosville/CONTRACTS.md:227-229`).

4. **Confirm H5; the failure matters more than its copy.** `day-chrome.png` (bottom caption) exposes schema failure and the endpoint. Production's warn mode is not permission to render broken values: the render-critical guard still throws (`src/lib/api.ts:363-375`; `src/lib/world-payload-guard.ts:51-58`). The hook retains previous payloads but reports held/unavailable evidence (`src/hooks/use-pharosville-world-data.ts:153-170,253-259`). The truncated capture does not identify the offending field. Prior drift already removed issuance/harbours and later prevented offline persistence (`agents/2026-10-02-visual-upgrade/02-execution-record.md:24-27,90-94`). Any flow-driven garden requires a real producer/consumer contract repair; unknown coverage must never become “inactive.”

5. **Calendar is independent, intentionally.** The 72 kō and per-tree phenology follow solar longitude/hemisphere; evergreens alone carry market history (`src/systems/garden-calendar.ts:4-17,122-127,194-223`). PSI sky already has observation gating, held appearance, DOM twins and 90s easing (`src/systems/psi-sky.ts:23-51,83-95,150-167`). Do not make autumn mean financial decline or market health mean daylight.

## Levers — ranked by insight × beauty × feasibility

All mappings below are proposals [INFERENCE], not measured gains. Preserve same-origin/gate/parity contracts (`CONTRACTS.md:19-26`), zero-RAF reduced motion (`:415-419`), and hard resource ceilings (`TESTING.md:98-103`); measure bundle delta against the existing narrow allowance. Update cue registry, detail model and accessibility ledger together.

### 1. A visible dry-garden month record
**Change:** Recompose a modest foreground gravel court in place of part of the blank bank. Repurpose the month-pine reading: one broad rake contour follows sampled daily PSI over the supported trailing window; subsidiary furrows are decorative, not additional measurements. Reuse `garden-month-record.ts`, `long-record.ts` and the anti-moiré shader approach in `garden-stone-garden.ts`; disclose dated values, gaps, sample span and methodology changes in a DOM table. Never fill absent days or imply a 30-day average from complete daily coverage when coverage is sparse.

**Impact 5/5:** establishes garden identity and a readable slow market memory in the resting picture. **Effort M. Risk:** decorative ripple may be mistaken for risk geography; fine furrows may alias. **Touches:** explicitly relax textureless/unpickable threshold and three-reading restriction (`VISUAL_INVARIANTS.md:47-67`); retain empty inlet and tower dominance. **Dependencies:** terrain/composition/material owner. **Verification:** matched rest/blur/night/static captures; month-window, gaps and DOM-table tests; census and M5 Pro pacing. Remove the superseded analytical pine cue, not the pines.

### 2. Concentration as composed shore stones
**Change:** In each inspected harbour garden, replace decorative shore rocks with an asymmetric top-issuer grouping. Projected stone footprint—not height or colour—represents reported share; a distinct low residual bed represents unlisted supply. Use `DockNode.harboredStablecoins` and `garden-harbor-batch.ts`; preserve exact issuer/share/supply rows in the harbour record. Missing top rows means “composition unavailable,” not a fictitious diversified group.

**Impact 4/5:** a garden-native answer to “how dependent is this chain on one coin?” **Effort M. Risk:** death-stone grammar collision; label the living harbour grouping and keep cemetery cause-family forms exclusive. **Touches:** coarse-rest budget and decorative-landscape rule (`CONTRACTS.md:117-118,212-215`); no new monument or permanent captions. **Dependencies:** dock layout, selection framing, batched stones. **Verification:** concentrated/diversified/missing-row fixtures, residual arithmetic and DOM parity tests; selected harbour plus rest/night GPU captures.

### 3. Inspection patina as record length, not virtue
**Change:** Use one selected-coin garden stone with lichen/moss extent tied only to `trackingSpanDays`, in explicit coarse duration bands. Reuse the existing age provenance rather than silently equating tracking and launch; retire overlapping inspection-age embellishments. Keep depeg events in a separate readable record row, not green “goodness.”

**Impact 3/5:** makes long observation tangible without promising safety. **Effort M. Risk:** users infer old = safe; copy must say “observed record length.” **Touches:** landscape-no-new-meaning rule (`CONTRACTS.md:212-215`), bounded record rows (`:119-125`), palette anchors. **Dependencies:** selection/record design and materially convincing stone/moss. **Verification:** missing/short/long/held/coverage-limited fixtures and age provenance tests; close and rest captures establish that it stays subordinate.

### 4. A scoped issuance basin, only after feed repair
**Change:** Diagnose the rejected live payload and fix the actual schema/adapter mismatch, preserving validation. Then replace—not supplement—selected issuance cargo emphasis with a small stone water basin: bounded static fill denotes **reported 24h signed net**, with mint/burn/gross stated together in DOM. A separate record trace uses hourly buckets; no invented transaction replay. Do not move navigable sea level, allocate chain flows as measurements, or use `pressureShiftScore` without its supported semantics.

**Impact 4/5:** creation/redemption becomes a quiet, comprehensible garden reading. **Effort M**, contract repair uncertainty included. **Risk:** basin suggests cumulative reserves; caption window/scope and distinguish zero from unavailable/held. **Touches:** cargo cutover and only-tide rule (`CONTRACTS.md:142-180,227-229`); retain weekly sea tide, name basin “issuance balance,” not tide. **Dependencies:** live producer evidence, ingestion, cargo owner, DOM record. **Verification:** drift regression payload, balanced/inactive/partial/held fixtures, net/gross conservation tests; static/night captures and selection-resource settling.

## Do-not-do / traps

- No koi-count = coin-count: four existing koi are decorative; a moving fish ledger would add ambiguity and attention cost.
- No health lantern ring: night has one beacon hierarchy, and source freshness already uses Harbor light. No data-driven blossom seasons.
- No faux causal claims: price premium does not prove demand; supply change does not prove mint/burn; age does not prove reliability.
- Do not repeat rejected grove/hull micro-tuning (`02-execution-record.md:17-20`). Make substrate, scale and semantic replacements visible at rest before polishing.

## Invariants worth challenging

Challenge the **smooth textureless three-draw threshold** and **exactly three coarse readings** (`VISUAL_INVARIANTS.md:56-62`): they protect calm but currently reserve a large screen area for analytically empty, visibly generic terrain. Admit one static slow-record surface by displacement. Keep time/data separation, all-record reachability, source qualifications, fleet capacity and negative space; none blocks this opportunity.

## Captures wanted

Run serially on real GPU; commands use existing preview flags. Additional targeted data fixtures above need implementation before they can be captured. First obtain the rejected mint/burn payload securely to identify drift; screenshots cannot diagnose its field.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --fixture quiet-dense --hash '#t=12.25' --blur-audit --draw-census --assert --out holistic/l10-record.png --json holistic/l10-record.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1200 --height 640 --fixture mixed-capacity --hash '#t=22' --reduced --assert --out holistic/l10-night-static.png --json holistic/l10-night-static.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --width 1600 --height 1000 --hash '#sel=ship.usdc-circle&t=12.25' --draw-census --assert --out holistic/l10-live-selected.png --json holistic/l10-live-selected.json
```

Read-only review: no tests, builds, gates or browser runs performed.

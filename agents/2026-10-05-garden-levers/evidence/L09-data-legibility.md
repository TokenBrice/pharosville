# L09 — Data encodings and glance legibility

## Verdict
The world has an unusually complete analytical vocabulary but almost no readable chart grammar: a visitor sees boats, rough water and a lighthouse, not an ordered market condition. The step change is **three strong, taught, screen-space readings**, with secondary facts revealed deliberately—not additional micro-cues.

## Evidence

1. **Funnel grades [INFERENCE, expert review]: glance 1/5 → understand why 2/5 → inspect facts 4/5** (`PRODUCT.md:22-24`). `day-chrome.png` shows near sail marks and a commanding tower, but no PSI band, named waters or ordinal risk scale. Both gate captures lose peripheral context; `selected-usdc.png` explains Watch Breakwater despite −1 bps, with exact cap/rank/change. Provenance, DEWS, contributors and issuance qualifications exist in `src/systems/detail-model.ts:791-823,1276-1314`; the record starts folded (`src/components/detail-panel.tsx:52-57,179-201`). Ledger/keyboard operation and user comprehension were not tested here.

2. **Inventory.** R = `src/systems/visual-cue-registry.ts`; cited lines specify sources/parity. Unprefixed docs mean `docs/pharosville/`; captures mean `outputs/holistic/`. Visibility is **1600 / 1200×640 / 900×720 at rest**: P = partly visible, not reliably decoded; N = not legible; U = state absent/unexercised, no visibility proof. Learnability [INFERENCE]: easy after one explanation, or hard without exemplars. Legend: B = basic section, M = prose under “More”, — = not explicitly taught.

| Encoding: data → visual channel (evidence) | Visibility | Learn / legend |
|---|---|---|
| PSI `stability.current.band` → beacon/beam, three range visibilities, six-step clouds (R:143-151), wind calm (`CONTRACTS.md:220-224`) | P/P/P; ladder/wind changes U | Hard/B, no ladder exemplars |
| Seven-source state/coverage/errors → lamp temperature, speed, intensity (R:154-162) | U/U/U | Hard/M |
| Top-20 active depegs + supply weights → pennant count, ≥1% storm cone (R:165-173) | N/N/N | Hard/M |
| 30-day PSI history → pine fullness/browning (R:176-184) | N/N/N | Hard/M |
| Largest PSI contributor → sweep dwell/bearing (R:187-195) | U/U/U; stills cannot prove dwell | Hard/— |
| Peg/DEWS → risk-water berth; packed position is **not score order** (R:250-258) | P/P/P | Easy/B, ordinal geography untaught |
| Sea partition/risk/NAV/cemetery → mirror/ripple/streak/chop/leaden surface, subdued hue, inspection boards (R:272-280) | P/P/P; names N/N/N | Hard/B, swatches not surfaces |
| DANGER band/fleet threat → local rain pocks, mist, chop, darker sky staging (R:449-457) | U/U/U | Hard/— |
| Fresh signed peg deviation → high/low hull at ±50/200 bps (R:286-294) | U/U/U | Hard/M; intentionally inspect-scale |
| Circulating supply → compressed ship scale (R:320-328) | P/P/P | Easy/B; not proportional area |
| Governance/backing/yield/NAV/peg currency → six hull families (R:297-306) | P/N/N | Hard/M, names without silhouettes |
| Safety grade/backing → beam; RWA/algorithmic/yield → freeboard; yield/NAV/backing → length, all mixed with ID jitter (`src/systems/ship-visuals.ts:223-239`), unregistered | N/N/N | Hard/— |
| Authored issuer groups + flagship berth/own distress → consort formation/distress mark (`src/systems/maker-squad.ts:25-79`; `src/systems/detail-model.ts:1130-1135`) | P/N/N | Hard/— |
| Issuer identity → complete branded mon/initials and cloth livery (`src/systems/world-types.ts:105-115`; `CONTRACTS.md:278-290`) | P/P/P, near ships only | Easy/B |
| NAV; yield; D/F grade → blue; green/gold; checkered mast signals (R:331-361) | N/N/N | Hard/M NAV/yield; grade — |
| DEX/consensus disagreement → striped cross-bearing buoy (R:198-206) | U/U/U | Easy/M |
| Launch/milestone/tracking age → even patina/verdigris (R:427-435) | N/N/N | Hard/M |
| Warning/Danger placement → salt band/weathering (R:438-446) | N/N/N | Hard/M; competes with age finish |
| Chain presence + supported signed issuance intensity → routes/cadence; risk → anchor swing (R:261-269) | U/U/U; temporal evidence needed | Hard/— explicit pace teaching |
| Chain ID/supply/top coins → cove/archetype/frontage/nobori (R:209-217) | P/P/P; few near names | Easy/B |
| Ethereum ID → fixed-scale Mole and uniquely still enclosed basin, **not a supply magnitude** (R:220-247) | P/P/P | Easy/B Mole; basin — |
| Backing diversity; health-factor average → crate congestion; cracked quay/leaning bollard (R:364-383) | N/N/N | Hard/M congestion; condition — |
| Supply movers; daily depeg count → circling pigeons; ≤12 roost birds (R:132-140) | U/U/U | Hard/M |
| Non-current peg summary; chains → bounded water haze; quay haze (R:110-129) | U/U/U | Hard/M; easily confused with stress |
| Complete-current coin issuance → aboard/ashore/opposing lighters + static largest-event lift (R:309-317) | U/U/U: live feed unavailable | Hard/M |
| Estimated issuance allocations → quay cargo direction/count (R:399-407) | U/U/U: same outage | Hard/M |
| Flight-to-quality gauge/intensity → tenders’ proximity/count around biggest hulls (R:416-424) | U/U/U: same outage | Hard/M |
| Global chain supply change 7d + stored visit → exposed tidal flat/datum/wrack line (R:388-396) | N/N/N | Hard/M |
| Cemetery cause/peak cap → grouped stone form/log size; death month → anniversary lantern (R:460-479) | N/N/N: outside rest | Hard/M stone text; anniversary text |

3. **Hypothesis 4 confirmed, with nuance:** the back fleet is a horizontal barcode, while near logos are readable (`day-chrome.png`, mid-frame). Surface difference exists—smooth central inlet versus checker-like right-hand ripples—but five ordered bands cannot be reconstructed from it. The legend teaches coloured swatches, not the actual static surface vocabulary (`src/components/legend-panel.tsx:160-189`). Hypothesis 3’s night data collapse is confirmed visually (`night.png`, fleet/water); no luminance measurement was performed. Hypothesis 1’s toy plate is visible in `overview.png`, but garden authenticity is outside this lens.

4. **Hypothesis 5 confirmed and causally important:** the raw issuance failure occupies the caption in all chrome captures. Any non-current source pre-empts teaching and market context (`src/systems/detail-model.ts:117-135`). Lessons still expire/mark themselves seen independently [INFERENCE from `src/hooks/use-visitor-line.ts:74-85`]. The legend says beam warmth follows PSI (`src/components/legend-panel.tsx:195-196`), although freshness is layered onto that lamp. Risk-area copy additionally teaches clouds by DEWS (`src/systems/detail-model.ts:328-333`), conflicting with PSI-only sky authority (`CONTRACTS.md:220-225`).

## Ranked levers

1. **Make water an ordered chart · Impact 5 · M.** Co-design `garden-water.ts`, placement and legend: five recognisable static surface signatures, clear projected separation, and sparse readable boundary names in the rest view. Keep open approach empty. **Risk:** signage/noisy seams. **Contracts:** explicitly bend inspection-only boards (`VISUAL_INVARIANTS.md:59-67`; `CONTRACTS.md:243-247`), preserve authoritative field and non-colour parity. **Dependencies:** water/composition. **Verify:** real-GPU matched quiet/stress/gate/night/reduced captures; blind band-identification task; region/placement/parity tests.

2. **Focus + context fleet hierarchy · Impact 5 · L.** In placement/batch/camera, give supply leaders deliberate readable near silhouettes and unequal distant flotillas with projected inter-group water voids; make own-risk focus distinguish consorts from their flagship’s inherited berth. Keep every eligible hull and identity; do not imply precise market-cap area. **Risk:** view bias/risk occlusion. **Contracts:** preserve full fleet/inlet (`CONTRACTS.md:264-290`), challenge compressed scale only if leader identification remains weak. **Dependencies:** fleet, composition, picking. **Verify:** all gate captures with `--overlap`, leader-identification and own-risk tests; count/resources unchanged or budgeted.

3. **A live reading key, not a prose dictionary · Impact 5 · M.** Rework `legend-panel`, cue registry and caption into three linked readings—market band, named risk water, leading ships—with actual miniature surface/silhouette/cloud exemplars and click/focus-to-world targets. Keep source health separately visible; never suppress its qualification. **Risk:** dashboard intrusion. **Contracts:** bend warning monopolisation (`CONTRACTS.md:101-105`), retain DOM parity and calm (`PRODUCT.md:48-55`). **Dependencies:** chrome/onboarding. **Verify:** first-visit/outage captures; legend, visitor-line, caption and keyboard tests; five-second comprehension review.

4. **Semantic channel ownership · Impact 4 · M.** Audit registry/detail/legend/renderers together: PSI owns broad clarity; source health owns bounded fog plus distinct DOM qualification; demote patina, mast marks, cargo and tiny history cues to inspection. Correct warmth/cloud contradictions; peg direction must not assert demand/redemption causation without flow evidence. **Risk:** deleting useful peripheral discovery. **Contracts:** three rest readings (`CONTRACTS.md:117-118`), channel parity, PSI sky authority. **Dependencies:** ingestion/render pipeline. **Verify:** source-current/stale/unavailable and PSI-band matrix, normal/reduced; cue-parity tests.

5. **“Why this market?” guided reading · Impact 4 · M.** Extend existing Observe, rather than invent another tour: PSI → actual contributor/own stress driver → inspected record, with explicit actionable stop. Current sequence instead picks worst risk, largest weekly **percentage** mover and highest HHI (`src/systems/observe-sequence.ts:68-105`). **Risk:** microcap drama and camera overload. **Contracts:** opt-in only; no idle tour; zero-RAF reduced state (`CONTRACTS.md:415-419,427-434`). **Dependencies:** detail/selection/camera. **Verify:** Observe interruption, contributor/risk provenance tests and narrated GPU capture.

All levers retain same-origin data/security, desktop gate, local assets, one renderer, and resource ceilings (`CONTRACTS.md:14-26,385-395`); measure on M5 Pro, not only the supplied RTX.

## Do-not-do / traps
Do not add pennants, brighten all boats, make risk motion-only, equate absent cargo with inactivity, or remove the long tail. Inherited squad water is not own risk. Audit shields were deleted (`src/content/pharosville-changelog.ts:93`), yet legend copy still teaches them (`src/components/legend-panel.tsx:247-249`). A2/B1/P1 micro-tuning was rejected (`agents/2026-10-02-visual-upgrade/02-execution-record.md:17-20`).

## Invariants worth challenging
Inspection-only water names and warning-only caption directly block learning; relax narrowly, not into permanent labels everywhere. Reconsider the compressed size law only with leader-reading evidence. Keep negative space, clock-owned light, colour redundancy and complete static reduced motion.

## Captures wanted
Run each command serially; inspect images plus JSON, not FPS alone. Flags/fixtures: `TESTING.md:115-147`.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --hash '#t=12.25' --blur-audit --overlap --out l09/quiet.png --json l09/quiet.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --hash '#t=12.25' --overlap --out l09/stress.png --json l09/stress.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --hash '#t=22' --reduced --out l09/night-static.png --json l09/night-static.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --hash '#sel=ship.usdc-circle&t=12.25' --out l09/own-risk.png --json l09/own-risk.json
```

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --width 1200 --height 640 --hash '#t=12.25' --out l09/gate-wide.png --json l09/gate-wide.json
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --width 900 --height 720 --hash '#t=12.25' --out l09/gate-tall.png --json l09/gate-tall.json
```
Request current mint/redeem/balanced, signed ±peg trim and source-health scenario captures; supplied stills cannot validate them. No preview, tests or browser sessions were run.

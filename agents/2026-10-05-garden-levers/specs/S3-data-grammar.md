# S3 — Data reading grammar

## Lever statement
Make the garden a quiet chart: three immediate readings, one slow record, and instrument qualifications. Teach with actual exemplars and inspectable links. A secondary feed failure qualifies its reading, not the garden's entire voice.

## Verified current state
- Registry spans PSI, source lamp, mast, history, contributor, fleet/dock/water/lifecycle cues (`src/systems/visual-cue-registry.ts:110-479`). Supply scale is compressed (`src/systems/ship-visuals.ts:161-179`); grade/backing/flag dimensions mix with ID jitter (`:223-239`).
- Any non-current feed wins the caption/raw reason (`src/systems/detail-model.ts:117-143`); ledger preserves seven-source evidence (`src/components/accessibility-ledger.tsx:198-212`). Missing/loading and failed-refresh/held classification is already correct (`src/hooks/use-pharosville-world-data.ts:153-170`).
- Teaching marks seen on incidental input or seven-second expiry, independent of actual visibility (`src/hooks/use-visitor-line.ts:74-94`). Legend uses colour swatches (`src/components/legend-panel.tsx:166-189`), promises PSI warmth (`:195-196`) and deleted audit shields (`:247-249`; assertion `legend-panel.test.tsx:82`).
- **Wave-1 correction:** DEWS-cloud and threat-sky claims are stale copy, not runtime authority: weather receives PSI (`src/three/world-renderer.ts:961-966`), storm derives from PSI (`src/systems/weather.ts:128-143`), sky consumes accepted clarity (`src/three/garden-sky.ts:1104-1150`). Contradictions exist in detail (`detail-model.ts:275-286,328-334`), duplicate ledger descriptors (`accessibility-ledger.tsx:91-101`) and registry (`visual-cue-registry.ts:452-453`). Source lamp cooling/slowing is real (`world-renderer.ts:3612-3620`; `src/systems/lamp-status.ts:98-101`); warmth alone cannot decode PSI.
- **Wave-1 correction:** purported cedar boards are implemented as stone steles (`src/three/garden-sea-signs.ts:113-122`), hidden without inspection (`:232-241`). Month-pine modulation affects island niwaki/karikomi, not threshold planting (`src/three/garden-month-record.ts:36-81`). Current month builder averages samples without daily deduplication (`src/systems/garden-month-record.ts:21-40`); `src/systems/long-record.ts:137-145` provides daily sorting/deduplication precedent. History includes methodology per point (`shared/types/stability.ts:40-46`).
- **Guard correction:** `src/lib/world-payload-guard.ts:51-58` is handwritten, not Zod; production throws here (`src/lib/api.ts:363-376`). Zod (`shared/types/mint-burn.ts:99-107`) also gates persistence (`src/lib/world-payload-cache.ts:258-263`), guard gates restore (`:196`). Live offending field remains unidentified.

## Target state and channel budget
Day/night: tower/sky names stability, ordered water names peg/DEWS risk, separated leading sails identify supply leaders. Subordinate foreground gravel remembers daily PSI. At both gates (1200×640, 900×720), compact key/Sources remain legible without covering tower/inlet; examples expand on request. Reduced motion preserves every static signature/record.

**Keep-rest:** taught/composition-tested. **Inspection-only:** exact DOM/ledger/expanded-guide meaning; natural forms may persist without promised glance decoding. Detachable analytical overlays/work are inspection-gated, not eligible hulls. **Retire:** remove mapping, retain facts.

| Encoding | Decision / reason |
|---|---|
| PSI beacon, far ranges, six cloud states/wind | Keep-rest; one broad stability channel |
| Seven-source lamp + bounded instrument haze | Keep-rest qualification, not market score; never teach warmth as PSI alone |
| Top-20 off-peg pennants/cone | Inspection-only; duplicates fleet condition |
| 30d pine fullness/browning | Retire; replace with dated gravel trace |
| Largest-contributor beam dwell | Inspection-only; motion cannot teach first glance |
| Peg/DEWS berth | Keep-rest; categorical geography, not within-band score order |
| Five risk surfaces/boundary names | Keep-rest; ordered static codebook |
| Danger rain pocks | Retire analytical meaning; no extra risk grammar; S5 removes risk-bound effect |
| Signed peg hull trim | Inspection-only; direction, not demand/redemption causation |
| Compressed supply scale | Keep-rest; qualitative size + exact rank |
| Six hull families | Inspection-only meaning; macro silhouettes remain |
| Grade/backing/yield/NAV dimension deltas | Retire; redundant unregistered mixture; retain authored family/ID variation |
| Maker formation/own distress | Inspection-only; inherited berth is not own risk |
| Branded mon/initials/livery | Keep-rest; leader identity |
| NAV mast signal | Inspection-only; pricing model, not risk |
| Yield mast signal | Inspection-only; not safety |
| D/F checkered signal | Inspection-only; exact grade separate |
| DEX disagreement buoy | Inspection-only; not which price is correct |
| Age patina | Inspection-only; age is not virtue |
| Risk salt weathering | Inspection-only; redundant local texture |
| Chain routes/issuance pace/risk swing | Inspection-only; no transaction interpretation |
| Chain cove/frontage/nobori | Inspection-only; no fourth rest headline |
| Ethereum fixed monument/still basin | Inspection-only identity; fixed size not magnitude |
| Backing congestion crates | Inspection-only; missing crates not safety |
| Quay health cracks/bollard | Inspection-only; mixed-factor explanation |
| Movers/depeg pigeons | Inspection-only; absence not calm |
| Ship issuance/largest-event lift | Inspection-only; complete-window measurement, no replay |
| Estimated quay issuance | Inspection-only; allocation not chain measurement |
| Flight-to-quality tenders | Inspection-only; reported gauge, no inferred transfer |
| Weekly supply tide/visit wrack | Inspection-only; keep sole tide semantics |
| Cemetery cause/peak-cap stones | Inspection-only; lifecycle separate from live risk |
| Anniversary lantern | Inspection-only; calendar remembrance |
| Audit shields | Retire stale copy/test; already deleted |

## Ordered packets
Production targets ≤6; tests/docs listed separately. Budget deltas are proposed ceilings, not measurements. Each packet updates `src/content/pharosville-changelog.ts`. CONTRACTS/VISUAL_INVARIANTS below mean `docs/pharosville/CONTRACTS.md` and `docs/pharosville/VISUAL_INVARIANTS.md`.

### S3-P1 · Channel ownership and copy · M
**Files:** `src/systems/visual-cue-registry.ts`, `src/systems/detail-model.ts`, `src/components/accessibility-ledger.tsx`, `src/components/legend-panel.tsx`, `src/systems/ship-visuals.ts`, `src/systems/world-types.ts`.
**Change:** Add explicit presentation tier to `VisualCue`; apply table consistently. Share surface/atmosphere wording instead of duplicate DEWS-cloud descriptors. Correct beam wording to PSI character plus separate source qualification; remove threat-sky, audit-shield and peg-causation claims. Replace unregistered financial dimension deltas with family-authored proportions and bounded decorative ID variation. S6-P2 consumes inspection policy for secondary fleet overlays; static architectural textures need no new visibility system.
**Amend:** CONTRACTS §§Analytical authority/channels, Sea partition; VISUAL_INVARIANTS §Coarse truth. Delete audit-shield assertion; rewrite registry tier/source parity and trait-delta pins, retain finite/clamp/identity tests.
**Budget:** 0 calls/tris/textures; ≤0 net JS KiB by deleting duplicated mapping/copy.
**Acceptance:** capture A; `npm test -- src/systems/visual-cue-registry.test.ts src/systems/detail-model.test.ts src/systems/ship-visuals.test.ts src/components/legend-panel.test.tsx src/components/accessibility-ledger.test.tsx`.
**Depends:** none. **Risk/rollback:** class silhouette changes; revert proportion cutover as a whole, never restore false claims.

### S3-P2 · Independent source health · M — **DECLINED by operator 2026-10-05 (D7); not executed. Exclusive warning precedence (`CONTRACTS.md:101-105`) stays. Nothing below in this packet is authoritative.**
**Files:** `src/systems/detail-model.ts`, `src/components/now-caption.tsx`, `src/components/accessibility-ledger.tsx`, `src/pharosville-world.tsx`, `src/__fixtures__/data-contract-scenarios.ts`, `scripts/pharosville/preview-fixture.mjs`.
**Change:** Return independent market/health models; healthy PSI survives issuance outage. Rest health: “Issuance unavailable · Sources”; held includes labelled as-of/unknown observation; loading says loading; current partial/unknown coverage stays qualified. Multiple failures show state counts, all seven exact rows remain reachable. Sources opens ledger focused at Source status, with return focus. Announce semantic changes once, never minute/raw-error repetition. Add `issuance-unavailable`, `issuance-held`, `sources-mixed` preview presets.
**Amend:** CONTRACTS §§Runtime/source states, warning precedence (`101-105`); preserve qualifications and single-ledger swap. Rewrite now-caption warning-monopoly tests (`56-79`), preserve clock silence/reduced instant update; matrix-test raw reason parity and all states/coverage combinations.
**Budget:** 0 GPU deltas; ≤1 JS KiB; reuse ledger/state clock.
**Acceptance:** B/C; `npm test -- src/components/now-caption.test.tsx src/systems/detail-model.test.ts src/components/accessibility-ledger.test.tsx src/hooks/use-pharosville-world-data.test.tsx`.
**Depends:** S3-P1. **Risk/rollback:** false reassurance; rollback layout only, retain scoped status and evidence.

### S3-P3 · Live key and sparse naming · L
**Files:** `src/components/legend-panel.tsx`, `src/systems/visual-cue-registry.ts`, `src/pharosville-world.tsx`, `src/three/garden-sea-signs.ts`, `src/systems/reading-key.ts` (new), `public/garden-reading-atlas.webp` (new).
**Change:** Export reusable nonmodal key from legend: Lighthouse / Water / Sails; live official PSI/band with evidence, five ordered surfaces, top-three supply names/ranks and compressed-scale caveat. Native buttons activate existing `selectDetail` targets; keyboard focus previews location without unsolicited camera travel; activation composes selection, reduced motion cuts. Bake actual shader/silhouette stills through existing renderer/crop capture, local atlas, labelled decorative images—not CSS hatch approximations or another runtime renderer. Consume S5 `RISK_SURFACE_SIGNATURES`: mirror / long ribbons / paired interrupted strokes / short oblique groups / dense dark groups; Ledger/Wreck separate, never sixth/seventh risk bands. At rest admit at most two legible boundary names: Calm plus highest visible occupied elevated band, deterministic collision exclusions; other names on inspection. No inlet-center signage, no fake off-frame leader.
**Amend:** CONTRACTS Sea names `243-247`, VISUAL_INVARIANTS Coarse truth `63-65`; rewrite inspection-only sign pins, retain canonical field/hit authority; add reading-key tests, legend/detail/ledger/exemplar ID parity.
**Budget:** ≤2 previously hidden sign draws, unchanged triangles, ≤1 existing ink texture now resident; ≤2 JS KiB; atlas DOM-only, no GPU texture.
**Acceptance:** A/D + blinded protocol; `npm test -- src/systems/reading-key.test.ts src/components/legend-panel.test.tsx src/three/garden-sea-signs.test.ts src/three/garden-sea-sign-siting.test.ts src/systems/visual-cue-registry.test.ts`.
**Depends:** S3-P1, S5-P1, S4-P5 (S3-P2 declined: no `Sources` health action and no scoped-health presets; the key is a separate DOM surface that coexists with the unchanged caption, whose warning precedence stays exclusive); capture acceptance S9:lookdev/S8-P1 (not a runtime dependency cycle). **Risk/rollback:** atlas drift/clutter; regenerate atlas with shaders, fall back to DOM-only names.

### S3-P4 · Exact daily garden record · M
**Files:** `src/systems/garden-month-record.ts`, `src/systems/world-types.ts`, `src/systems/pharosville-world/stages/world-scaffold.ts`, `src/systems/detail-model.ts`, `src/components/accessibility-ledger.tsx`, `src/components/detail-panel.tsx`.
**Change:** Build at most 30 UTC daily closes ending newest supplied day; last write wins per day; preserve methodology/time, gaps and source qualification. Return raw daily segments, coverage count and bounds; no invented closes/interpolation across gaps/version edges. Fixed score 0–100, oldest-left/newest-right. Shared DOM table in lighthouse inspector/ledger preserves every dated score, band/version/gap; no extra first-screen figure. One point is a mark, no data means neutral bed. Retain full Long Record separately.
**Amend:** CONTRACTS Analytical authority/month history; rewrite growth/browning tests to daily dedup/gaps/window/seconds-vs-ms/version/held parity; preserve observation provenance.
**Budget:** 0 GPU deltas; ≤1 JS KiB; ≤30 points computed per refresh.
**Acceptance:** D; `npm test -- src/systems/garden-month-record.test.ts src/systems/pharosville-world/stages/world-scaffold.test.ts src/components/detail-panel.test.tsx src/components/accessibility-ledger.test.tsx`.
**Depends:** S3-P1/P3. **Risk/rollback:** misleading continuous history; withhold trace, retain dated table.

### S3-P5 · Replace pine history with gravel trace · M
**Files:** `src/three/garden-month-record.ts`, `src/three/world-renderer.ts`, `src/systems/world-render-content-signature.ts`, `src/systems/visual-cue-registry.ts`.
**Change:** Replace `applyGardenMonthRecord` with one non-emissive trace in S1 inset; fixed-width shallow furrow ribbon/mark, ≤30 samples, no smooth overshoot or decorative parallel statistical lines. Reuse gravel material; anti-alias by footprint, no fine moiré. Remove island pine mutation/import/call; keep pines decorative/calendar-owned. Key record updates independently of island structural key (`world-renderer.ts:1913-1925`); refresh buffer only on changed dated content, dispose/reuse resources, no frame allocation.
**Amend:** VISUAL_INVARIANTS threshold/three-reading clauses; CONTRACTS landscape/month-record meaning. Delete pine colour/fullness pins in `src/three/garden-month-record.test.ts`; replace with trace geometry/discontinuity/disposal/static tests; rewrite registry month cue.
**Budget:** ≤1 call/128 tris/0 textures/≤0 net JS KiB, replacing vertex-mutation machinery.
**Acceptance:** D; `npm test -- src/three/garden-month-record.test.ts src/three/world-renderer.test.ts src/systems/world-render-content-signature.test.ts`.
**Depends:** S3-P4, S1-P2, S2-P1/P4 (gravel role/isotropic normals; exempt trace from decorative pattern). **Risk/rollback:** risk/record confusion; remove trace, retain table/neutral pines.

### S3-P6 · Teaching that is actually seen · S
**Files:** `src/hooks/use-visitor-line.ts`, `src/pharosville-world.tsx`, `src/components/legend-panel.tsx`.
**Change (reconciled 2026-10-05, D6d declined):** Replace invisible timed teachings with `teachingOpen`/`dismissTeaching`; explicit dismissal or completed user-activated steps alone mark teaching seen. **Keep the existing storage key and value format** so visitors already recorded as seen are NOT re-taught (no v2 migration). Incidental input, hidden tabs, timer expiry and source outages never consume *future* teaching. Teaching lives in the reading key, not the caption, so the unchanged exclusive caption warning cannot swallow it. Storage denied: session-dismissible key, not silent suppression. Return summary remains separate. Read key always reopenable; initial teaching mounts with ready world, not after nine-second ceremony. S8 owns shell/edge layout.
**Amend:** CONTRACTS onboarding only (warning precedence `101-105` stays unchanged); delete timer/input-completion tests (`use-visitor-line.test.tsx:31-55`), rewrite visibility/persistence/storage/outage/keyboard tests; preserve return-summary semantics.
**Budget:** 0 GPU deltas; ≤0 JS KiB, fewer global listeners/timers.
**Acceptance:** E' = `env -u CI npm run preview -- --url http://localhost:5173 --headed --first-visit --fixture quiet-dense --reduced --width 900 --height 720 --out s3/teaching.png` (no `issuance-held` preset exists; S3-P2 declined); `npm test -- src/hooks/use-visitor-line.test.tsx src/components/legend-panel.test.tsx src/pharosville-world.test.tsx` including a test that an existing stored "seen" value suppresses teaching.
**Depends:** S3-P3 (S3-P2 declined). **Risk/rollback:** persistent help obstructs; compact presentation, never restore invisible completion.

### S3-P7 · Repair issuance drift at contract boundary · M
**Files:** `shared/types/mint-burn.ts`, `src/lib/api.ts`, `src/lib/world-payload-guard.ts`, `src/lib/world-payload-cache.ts`, `src/__fixtures__/pharosville-world.ts`, `src/__fixtures__/data-contract-scenarios.ts`.
**Change:** Obtain rejected body only through existing same-origin proxy; no upstream credential request/logging. In a private diagnostic session run shared schema `safeParse` and guard independently; report field paths + issue codes/expected type, not payload/header dumps. Compare producer documented semantics before adapting rename/null/enum/unit drift; preserve finite signed net, nonnegative gross, unknown coverage and unsupported intensity. Store minimal synthetic regression reproducing actual field; align guard/full schema/consumer together, never loosen validation globally or zero-fill. Inspect cache-warning metadata separately; require repaired live body accepted before claiming issuance restored. No new endpoint.
**Amend:** CONTRACTS issuance/source states; document diagnosed field and producer version without secrets; add guard-vs-Zod regression, invalid-critical rejection, held persistence and gross/net/coverage tests. No pins deleted.
**Budget:** 0 GPU deltas; ≤0 net JS KiB; keep full schema off critical startup path.
**Acceptance:** F; repaired live response passes both validators and persists/restores; `npm test -- src/lib/api.test.ts src/lib/world-payload-guard.test.ts src/lib/world-payload-cache.test.ts src/hooks/use-pharosville-world-data.test.tsx src/systems/ship-issuance.test.ts`.
**Depends:** none; health presentation does not wait for repair. **Risk/rollback:** producer semantics inaccessible; retain unavailable/held, state exact missing contract, never fabricate a field diagnosis; revert only adapter/schema change.

## Capture and reading acceptance
Executor runs serially; no checks/captures run here. Presets/actions must land first. A–F:

```bash
# A
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --hash '#t=12.25' --width 1200 --height 640 --out s3/key-day.png --json s3/key-day.json
# B
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture issuance-unavailable --hash '#t=12.25' --width 1200 --height 640 --out s3/outage.png --json s3/outage.json
# C
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture sources-mixed --hash '#t=22' --width 900 --height 720 --source-details --out s3/sources.png
# D
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --hash '#t=22' --width 900 --height 720 --reduced --reading-key --draw-census --out s3/static-night.png --json s3/static-night.json
# E
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture issuance-held --first-visit --reduced --width 900 --height 720 --out s3/teaching-held.png
# F
 env -u CI npm run preview -- --url http://localhost:5173 --headed --hash '#sel=ship.usdc-circle&t=12.25' --source-details --out s3/live-repaired.png --json s3/live-repaired.json
```

**Blinded five-second protocol:** randomize baseline/candidate order, equal fixtures/date/viewport, no release labels; 12 unfamiliar participants, day/night × both gates × normal/static balanced. Show frame with collapsed key for five seconds, mask it, ask overall stability, risk ordering, two leading identities, and whether all readings are current. Score against fixture truth before reviewing explanations. Then permit one key opening and repeat with a different frame; separately grayscale-match five surface exemplars and identify Ledger/Wreck as non-risk. Ship if ≥10/12 get primary meanings and health qualification right, ≥80% band matches, no recurring held=calm or size=proportional inference; report baseline/candidate errors, not just preference. Exact DOM/ledger/source/version/rank parity is mandatory regardless of user score. Operator separately approves calm whole-frame composition.

## Operator decisions required
1. Admit one foreground slow record beyond three immediate readings? **Recommend yes, by replacing pine encoding**, not adding another headline.
2. Two rest boundary names or DOM-only names? **Recommend two collision-safe names**; reject permanent labels across every water.
3. Re-teach prior v1 “seen” visits once? **Recommend v2 explicit-dismiss teaching**, because old completion may have been invisible.

## Out of scope / do-not-do
No WebGPU, extra renderer/library, remote assets/feeds, inferred price/stock causality, fake issuance or failure reassurance. Preserve same-origin API/server-only `PHAROS_API_KEY`, sorted desktop gates/world-unmounted fallback, eligible fleet, ledger parity, static reduced motion and releases solely via `.github/workflows/release.yml`. S4/S5/S6/S8 implement light/water/fleet/layout.

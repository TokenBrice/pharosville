## Claim ledger

Scope: read-only review of U0 against HEAD `599c822`; no source changes. The whole nine-page PDF and both authorized companion members were read. Appearance, physical first-screen fit, native-browser disclosure behavior and painted lamp state were not measured here. Source citations below refer to HEAD; scratch citations refer to this investigation.

| # | Packet claim (short verbatim quote) | Verdict | Evidence | Correction |
|---|---|---|---|---|
| 1 | “The model emits important facts that the actual DetailPanel filters out” | CONFIRMED | `src/systems/detail-model.ts:1278-1315`; `src/lib/format-detail.ts:121-173,278-283,417-432`; `outputs/verify-v2-u0/probe-results.jsonl:1-8` | The filter/composer owner is **`src/lib/format-detail.ts`**, not the JSX alone. Add it and its tests to U0's file scope. It recognizes neither Evidence nor Evidence status nor Squad override, and never emits a row for the recognized pegDeviation key. |
| 2 | “including evidence/time” | PARTLY | `src/systems/detail-model.ts:605-606,802,1313-1315`; `src/systems/world-types.ts:54-59`; `outputs/verify-v2-u0/probe-results.jsonl:2` | Ship source fields and placement caveat exist and are dropped. Ship observation time does **not** exist in emitted facts. Lighthouse Snapshot as of exists, but is `world.generatedAt`, not a source-specific observation epoch (`src/systems/pharosville-world/stages/detail-index.ts:29-35`). V5 must supply source/row observation time before U0 can display it honestly. |
| 3 | “a squad member’s own-distress banner” | CONFIRMED | `src/systems/detail-model.ts:1131-1135,1235-1239,1311-1312`; `outputs/verify-v2-u0/probe-results.jsonl:1` | Acute sUSDS has +800 bps and a real Squad override fact, yet the rendered panel contains no distress banner after opening the record; header names Calm Anchorage. Preserve shared placement and disclose the member's own distress beside formation; changing formation/geography is out of U0. |
| 4 | “Other summaries and the ledger retain some overlap” | CONFIRMED | `src/systems/detail-model.ts:1143-1152,1323`; `src/components/accessibility-ledger.tsx:230-243,360-379,524-550`; `outputs/verify-v2-u0/probe-results.jsonl:1-7` | Precisely “some”: ledger retains own distress and full peg explanation; lighthouse ledger retains snapshot/sky/garden history, but not actual Harbor light value. Ship ledger has no per-row observation time, no detailed chain shares/home dock, no price-confidence/source-consensus clause. |
| 5 | “Add compact explicit mappings inside existing disclosures and real rendered-value tests, including opening Read the record” | CONFIRMED | `src/components/detail-panel.tsx:70-79,181-202`; `src/components/detail-panel.test.tsx:1-24,122-131,161-201,315-332`; `vitest.config.ts:8-20` | Appropriate smallest correction. Test world→detailIndex→DetailPanel using RTL/jsdom; open native `<details>` via click plus explicit toggle modeling in jsdom. SSR alone includes closed disclosure content and cannot establish reachability. Existing component suite does not open Read the record. |
| 6 | “Do not append all raw facts or require a wholesale typed-fact refactor” | CONFIRMED | `src/lib/format-detail.ts:54-103,121-173,278-435`; `src/components/detail-panel.tsx:189-190` | Reuse label classifier, finite section mappings and existing rows. Do not change raw fact-array contract or dump unknown facts; keep intentionally omitted redundant/internal labels omitted. |
| 7 | “Preserve bounded first-screen density” | CONFIRMED | `src/lib/format-detail.ts:187-191,208-237,267-274`; `outputs/verify-v2-u0/probe-results.jsonl:1,8,13-14` | The **enforced first-screen bound is three reading figures**. The <=8 expanded-row comments/synthetic test are stale: real normal ship has 9 rows, consort 10. Recommended U0 density: unchanged ≤3 figures, no extra first-screen prose, ≤11 ship core rows including one DEX exception and formation, bounded explicitly composed lines inside those rows. Do not silently truncate facts at eight. |
| 8 | “relevant source/as-of, peg explanation, actual harbour-light state and flow coverage reach the rendered record” | PARTLY | `src/systems/detail-model.ts:299-303,775-806,1189-1200`; `src/systems/ship-issuance.ts:7-26,42-56`; `src/three/world-renderer.ts:841-849,3543-3554`; `outputs/verify-v2-u0/probe-results.jsonl:1-8` | Peg explanation and current Harbor light *observed-status* fact are dropped. Actual painted status is not in DetailModel: renderer intentionally applies two-observation hysteresis and easing while DOM shows current truth. Coverage is discarded before the detail model; V4/V5 dependencies, not filter fixes. Label observed status versus eased appearance; do not claim source-specific time from snapshot receipt. |
| 9 | “Own distress survives squad disclosure” | CONFIRMED | `src/systems/detail-model.test.ts:960-971`; `src/components/accessibility-ledger.tsx:360-379`; `outputs/verify-v2-u0/probe-results.jsonl:1` | Existing model test's name says “detail panel” but checks facts only; it passes while actual panel loses the banner. A new rendered regression must select the consort and open its record, not merely assert the squad ledger's global sub-row. |
| 10 | “Expose own acute distress and historical caveats in rendered records” | PARTLY | `src/systems/detail-model.ts:1149-1151,1288,1314`; `src/lib/format-detail.ts:325-332`; `src/components/accessibility-ledger.tsx:530-543` | Own banner is missing; placement stale caveat survives some summaries but its explicit fact is dropped. Significant depeg history already survives the composed 24h row and ledger; garden 30d survives ledger but is dropped from panel. Old-row age and source-status caveats require V5; U0 must not invent them. |

Verdicts: **7 CONFIRMED, 3 PARTLY, 0 WRONG, 0 UNVERIFIABLE-HERE**. Recommendations marked CONFIRMED mean source supports the implementation approach, not that the unimplemented result passed acceptance.

Observed execution:
- `npx vitest run src/components/detail-panel.test.tsx`: **23 passed**.
- `npx vitest run src/components/accessibility-ledger.test.tsx`: **50 passed**.
- `npx vitest run src/systems/detail-model.test.ts`: **89 passed**.
- `npx vitest run --config outputs/verify-v2-u0/vitest.config.ts outputs/verify-v2-u0/record-parity.test.tsx`: **3 passed** characterization probes; directly rendered real model output, explicitly opened/toggled record, observed missing banner/full peg/as-of/light, mintBurn-only all-current error, discarded coverage, and 9/10 live row counts. These are investigation probes, not desired-behavior permanent tests.
- Exact observations: `outputs/verify-v2-u0/probe-results.jsonl:1-21`. No browser/GPU/appearance/performance pass is claimed. LSP reference lookup returned “No language server found for this action”; discovery therefore used direct source reads/search, not an asserted symbol graph.

## What the packet missed

1. **Actual owner and test blind spot.** DetailPanel delegates recognition and composition to `src/lib/format-detail.ts:278-435` via `src/components/detail-panel.tsx:70`; `buildDetailFactSections` needs edits. The existing panel test positively bans Evidence status (`src/components/detail-panel.test.tsx:122-131`), and its eight-row specimen omits real service-age/issuance/home-dock combinations (`:161-201`). Delete those implementation/wording pins; do not simply change their expected wording. Existing model distress test proves only model output (`src/systems/detail-model.test.ts:960-971`).
2. **Peg is recognized but never composed.** Classifier contains pegDeviation (`src/lib/format-detail.ts:156`), but no identity/position emitter consumes it. First-screen reading selection takes supply/rank/24h first, so ordinary ranked ships do not even quote the peg reading there (`:227-235,267-274`). Header preserves signed bps only, not direction or actual hull trim (`src/systems/detail-model.ts:1264-1267,1324-1328`). This is distinct from an unknown-label drop.
3. **Much wider entity leakage.** Rank/share/HHI/quay condition are dropped from dock record despite ledger parity. Lighthouse drops Market stability, snapshot, actual observed light, far shore/sky and garden-month record. Pigeonnier drops *every fact*; with no movers it has no record disclosure at all (`src/components/detail-panel.tsx:75-79`; `src/systems/detail-model.ts:634-660`). Named-water Water surface mismatches the recognized Water style key; Risk-water haze and Quay haze are unrecognized. Exhaustive table below distinguishes real loss from intentional redundancy.
4. **Evidence “time” is missing upstream.** PlacementEvidence has reason/source/stale only (`src/systems/world-types.ts:54-59`); ship fact constructor emits no as-of (`src/systems/detail-model.ts:1278-1315`). Current lighthouse snapshot is world generation, and its light's clock suffix is truncated to HH:MM (`:293-303,802`). V5 owns correct availability/time/source semantics. Do not add `Date.now()` at render or relabel generatedAt as a source observation.
5. **Flow coverage cannot be recovered by JSX.** `buildShipIssuance` retains direction/intensity/net/largest event only (`src/systems/ship-issuance.ts:15-26`); partial/full window, mint/burn gross, source scope are absent. Probe confirms partial six-hour input produces ordinary “24h” net-mint wording with no partial caveat (`outputs/verify-v2-u0/probe-results.jsonl:8`). V4 owns transport→issuance preservation/state; U0 reserves its existing issuance row as the destination.
6. **Observed truth versus painted lamp is intentionally different.** `lighthouseLampStatusLabel` uses raw fold; renderer advances hysteresis and eases separately (`src/systems/detail-model.ts:299-303`; `src/three/world-renderer.ts:841-849,3543-3554`). U0 should expose observed feed status immediately and explicitly say appearance eases; exposing the painted state itself requires a renderer presentation-state contract, not a misleading name on raw status. [INFERENCE] Requiring exact per-frame rendered state in React would add update traffic unnecessarily.
7. **Ledger is not already an exhaustive evidence record.** Freshness list omits mintBurn (`src/components/accessibility-ledger.tsx:597-605`) and says all-current when that alone is stale (probe `:7`). It prints “fresh/caveat,” not the model's exact placement caveat (`:530-532`), omits price confidence/consensus and backing diversity (`:439-468,524-550`), and nests distress only in a separate squad section (`:360-379`). V5 owns shared seven-source status; U0 owns faithfully surfacing its results, avoiding a second local list.
8. **The eight-row “contract” is not the actual runtime bound.** Normal world-generated ship has 9 rows; acute consort 10 (`outputs/verify-v2-u0/probe-results.jsonl:1,8,13-14`). Current worst emitted layout is 11 rows (nine base + formation + DEX exception), from fixed composers `src/lib/format-detail.ts:285-333,366-398,417-432`. This is a source-derived maximum, not a measured exhaustive-condition run. Documentation's normative rule is analytical parity, not eight rows (`docs/pharosville/CONTRACTS.md:25-27,60-65`). Preserve first-screen figure cap, replace inaccurate comments and synthetic density pins with real-world density/meaning tests.
9. **No additional squad detail kind or hidden enrichment.** Squads are ordinary ships with optional facts; world detail index constructs six kinds: lighthouse, pigeonnier, dock, ship, area, grave (`src/systems/pharosville-world/stages/detail-index.ts:28-53`). LongRecord/member/link content is separate from raw fact routing (`src/components/detail-panel.tsx:189-215`). Standard areas inject only Water style and Source, plus Source fields duplicate (`src/systems/pharosville-world/stages/world-scaffold.ts:377-379,399-401`); open-ended custom `node.facts` are not an enumerable seventh schema and must not get an automatic dump.

Priority of losses (analytical importance, not decorative completeness):
1. **P0 evidence caveat/source/time + own distress:** Caveat/Evidence/Override already available; source time waits for V5. This prevents calm shared water certifying the selected member as healthy/current.
2. **P0 full signed peg interpretation and trim:** above/below/at peg and actual hull high/low explanation already emitted, currently lost.
3. **P0 named issuance coverage and source window:** high analytical value, but depends on V4/V5, not raw-label registration.
4. **P1 observed Harbor light + lighthouse evidence/as-of:** current raw fold exists; exact painted state requires separate presentation decision. Never call snapshot generation the PSI row timestamp.
5. **P1 quay HHI/rank/share/condition/haze; named-water surface/haze:** emitted and lost; required existing cue parity, corrected allocation wording comes from V9.
6. **P2 month-garden/sky/roost/footprint/class details:** useful analytical context or accessibility parity; redundant raw keys/livery are intentionally lower priority.

## Implementation design

Implementation-only future steps below; no source edit is proposed for this investigation. Keep U0 an independently revertible bounded-record commit, with V5/V4 interfaces supplied separately. Do not block the directly available value repair on decorative A1 or renderer-policy redesign.

1. **`src/lib/format-detail.ts` — `DetailFactKey`, `DETAIL_FACT_LABELS`, `buildDetailFactSections`: add finite label mappings, not a raw-fact fallback.** Register Evidence status, Evidence, Route source, Squad override, Tracking new risk band, Chain footprint, Market stability, Snapshot as of, Harbor light, Beam warmth cue, Far shore, Sky cover, Garden record 30d, dock rank/share/HHI/quay condition/station/cove/haze, Water surface/Risk-water haze, and pigeonnier Channel/Alerts/Depeg roost/Notable movers. Peg deviation is already classified; consume its key. Register Grave Symbol and keep Cause/Date/Peak display mapping explicit if repeating those in the record. Leave opaque Risk placement key/Risk placement and redundant livery out; do not revive within-zone spatial claims (V9 replaces their meaning). Reason: the filter is the actual value-loss owner, and explicit finite routing keeps accidental future labels from bloating the card.

2. **`src/lib/format-detail.ts` — ship section composition: retain existing row layout, append only named meaning to host rows.** No extra ship fact rows. Identity keeps Class, Market cap, optional DEX exception, 24h change, Route cadence, In service/tracked, Issuance work, Home dock. Position remains Currently, Chains, optional Sailing in formation. Within Currently, order lines: representative position + existing stress driver; **full Peg deviation** including direction/trim; **Evidence status** with stale reason; labeled **Evidence/source**; active **Tracking new risk band**. Do not fold provenance into Market cap (risk evidence is not market-cap evidence). Chains orders deployment shares → Chain footprint/dock-stop caveat → explicitly named Route source. Formation orders **Squad override first if present**, then the existing member list so own acute evidence cannot be buried behind siblings. Preserve flagship shared position; never reinterpret ownReason as final placement. Reason: ≤11 real-model ship rows, ≤3 first-screen figures, direct repair without re-layout. Use deliberate line breaks or subordinate textual clauses in existing `<dd>`; only a small `DetailDisplayRow` extension for named lines if needed, no new fact abstraction. Retain DEX exception as its own row rather than burying disagreement.

3. **`src/lib/format-detail.ts` — lighthouse composition: explicit bounded Identity ordering.** Add Market stability row containing existing Score/Band, observed availability/caveat, then **source/as-of slot** and separate **snapshot generation**. Add one “Sky and far shore” row with existing Far shore and Sky cover. Order: Market stability; Sky/far shore; Trend; Composition; Signal mast; Fleet peg; Harbor light; Beam bearing; Worst band 30d; Supply tide; Flight to quality; Last fleet depeg. Harbor light contains existing observed status value, then Beam warmth cue as a distinct clause (never confuse freshness and PSI warmth). Worst band row folds Garden record 30d as a distinctly labeled month-history clause, not the same quantity as the worst band. Max 12 current core rows, no new first-screen figures, contributors and LongRecord untouched. Correct source time is supplied by V5; do not relabel existing snapshot. Reason: every previously emitted analytical tower fact gets an explicit slot without unlimited rows.

4. **`src/lib/format-detail.ts` — dock/area/pigeonnier/grave finite mappings.** Dock Identity: “Stablecoin supply” folds count + Harbor rank + supply share; “Health” folds Concentration then Quay condition; existing Backing diversity; existing 24h change/momentum; existing flow row; Position “Station” folds Station type → Rim cove → Quay haze. Flow row retains V9's corrected **estimated allocation** label and future coverage/scope qualifier, not measured chain issuance. Six core rows, ≤3 reading figures; harbored members unchanged. Area Identity: Water style (existing), **Water surface (new)**, Atmosphere with Risk-water haze clause, Source fields (existing deduplicated Source alias). No raw Risk placement/zone dump; summary/first-screen/ledger cover category. Pigeonnier: Identity “Channel” combines Channel+Alerts; Identity “Depeg roost” includes roost and labeled Notable movers (keep “None today” when no members); two rows ensure record exists even with no movers. Grave: Symbol, Lifecycle (Cause/Date/optional Peak), existing Stone garden; source link/obituary unchanged. Reason: fixes meaningful holes across all real selectable kinds while preserving finite composition. Exact copy labels are design suggestions, not test oracles.

5. **`src/components/detail-panel.tsx` — renderSection/record integration only.** Keep Identity before Position and native session-persistent Read the record disclosure (`:70-84,181-202`), preserve focus/share/navigation. If existing string joining becomes unreadable, teach `renderSection` to render the explicitly authored subordinate lines in `<dd>` without concatenating unknown facts; `hasRecord` continues to reflect actual sections. No new first-screen paragraph or figure. Reason: record repair should not expand the plaque. [INFERENCE] Twelve lighthouse rows and multi-line ship evidence need operator-browser scrolling/readability confirmation at minimum supported viewport; jsdom cannot verify physical density.

6. **`src/components/accessibility-ledger.tsx` — `shipLedgerLine`, `dockLedgerLine`, lighthouse/pigeonnier/area clauses: mirror the selected meanings, not a second model.** Reuse existing label helpers. Ship: add own override **within that ship's line**, retaining global squad line; preserve ownReason and ownPlacement distinctly from shared location. Add price-confidence/source-consensus and existing chains/footprint/home-dock values missing from the ship record; use existing label helpers (make the current private formatting helper available only where necessary, no alternate strings). Dock: add backing-diversity clause and local Quay haze (global haze alone is not selected-station parity). Lighthouse: include observed Harbor light and Market stability caveat, correct source-as-of separately from generated snapshot, and explicit Beam warmth versus freshness. Area: local risk-water haze in each affected area. Pigeonnier already retains channel meaning/roost/movers; ensure full mover values remain obtainable via its existing detail members. Keep identical analytical body in visible and sr-only presentations (`src/components/accessibility-ledger.test.tsx:129-144`), and do not copy all raw facts wholesale.

7. **Missing-value handoff slots, with owners and sequencing.**
   - **V5 / selected ship observation:** after Evidence status in Position/Currently, list only relevant risk sources (peg/DEWS/NAV provenance) with row/source observation epoch and state. Unknown time stays explicitly unknown; snapshot receipt remains separately labeled. Ledger same ship line, next to peg/placement. Any upstream selected-evidence contract must be consumed here, not recalculated from `Date.now()`.
   - **V4 + V5 / issuance:** existing Identity/Issuance work dd: categorical state → gross mint/burn and net → named reporting window and partial-history coverage → relevant source/scope/as-of → staged tempo disclaimer. Ledger corresponding ship issuance clause mirrors them. V4 owns quantities/states and availability; U0 does not infer coverage from signed intensity or fabricate full-day volume.
   - **V5 / lighthouse:** Market stability Identity row: official PSI reading plus correct PSI source/row observation and degradation/caveat; separately Snapshot generated at. Harbor light Identity row: observed seven-source status + status-as-of. Ledger lighthouse clause mirrors; top ledger freshness consumes the same registry supplied by V5, deleting the six-entry local source list. This fixes mintBurn-only all-current without a new U0-only registry.
   - **Painted lamp / renderer owner + operator:** if an actual accepted/easing presentation state is made available, append it after observed Harbor light as “appearance holding/easing toward …”, not instead of observed truth. Otherwise truthful U0 default is observed status plus explicit delayed/eased-appearance caveat; do not claim exact pixels. Actual painted-state telemetry is not a prerequisite for fixing the currently dropped observed-status fact.
   - **V9 / quay + score:** consume corrected estimated-allocation/inspect-only score values and labels cleanly. Do not newly surface old Within-zone anchoring “calm edge/rough edge” wording. Score slot, if provided after correction, belongs to Currently as “DEWS reading,” never geography.

8. **`src/components/detail-panel.test.tsx`, `src/components/accessibility-ledger.test.tsx`, `src/systems/detail-model.test.ts`, `src/lib/format-detail.test.ts`: cut over tests to behavioral oracles below.** Delete the banned-Evidence-status test and fake “every signal fires” fixture; delete/rewrite implementation-only label/class/section-order pins only where affected, not re-pin them to new labels. Keep genuine focus/link/clipboard behavior tests. Add actual-world rendered value regressions, including disclosure opening and own distress, and update stale <=8 comments in model/composer to the agreed density rule. Model tests remain useful for conditional generation but cannot be the sole end-to-end oracle.

9. **Existing documentation only — `docs/pharosville/CONTRACTS.md` analytical authority section / `docs/pharosville/RELEASES.md` appropriate unreleased entry.** After proof, document three-figure first-screen rule, bounded explicit record composition, observed versus eased light, evidence/coverage availability and preserved squad policy. No new documentation file and no claim that U0 accepts data-policy or visual-upgrade work.

### Tests

Use the actual adjacent conventions: RTL `render`, `screen`, `fireEvent`, `waitFor`, `cleanup` under `// @vitest-environment jsdom` in `detail-panel.test.tsx:1-15`; ledger currently uses SSR `renderToStaticMarkup` in `accessibility-ledger.test.tsx:1-16`. For ledger value/reachability tests, add jsdom/RTL where opening visible ship/dock details is needed; keep SSR only for full text equivalence between presentations. Build fresh worlds using `buildPharosVilleWorld(makePharosVilleWorldInput(...))` / `makerSquadFixtureInputs()` / `fixtureWithDepegOn()`; `WorldBuilder` handles missing/stale payload variants (`src/__fixtures__/world-builder.ts:90-135`). Shared setup resets held placement before each test (`src/test-setup.ts:76-90`); deep-clone changed payloads, do not mutate exported fixtures.

Disclosure helper: find `screen.getByText('Read the record', {selector:'summary'})`, get parent details, ensure closed state explicitly for the test (session state persists), `fireEvent.click(summary)`, and, because jsdom lacks native default summary action, set `details.open=true` then `fireEvent(details, new Event('toggle', {bubbles:true}))`; await `open===true`. Inspect `<dt>/<dd>` within the opened disclosure via scoped DOM/RTL, not global markup substring. Similarly open visible ledger ship/dock details. Explicitly model close in cleanup for test isolation so the module-level record-open session memory cannot mask the opening path. A real-browser operator smoke remains necessary for native keyboard/default-action proof; jsdom assertion is not such proof.

| File | Proposed behavioral test name | Input and oracle |
|---|---|---|
| `detail-panel.test.tsx` | `keeps a consort's acute own peg and distress visible in its shared formation record` | Existing maker squad baseline vs `fixtureWithDepegOn(...,'susds-sky')`. Select sUSDS's real detail; open record. Header still shared Calm Anchorage; opened formation contains selected sUSDS distress and its own reason; peg line says +800 bps, above peg and actual hull high. Calm baseline lacks distress; do not require relocation. |
| `detail-panel.test.tsx` | `qualifies retained stale placement next to its peg and relevant source` | Build same peg row with pegSummaryStale/stressStale variant via fixture/WorldBuilder. Open selected ship record. Selected source fields and stale reason appear alongside retained peg; ordinary summary/record must not positively certify that retained value as current. V5 variant asserts old row time remains old under fresh envelope; integration-dependent. |
| `detail-panel.test.tsx` | `preserves the sign and explanation of peg readings without adding a first-screen figure` | Parameterize ±50/±200 bps with same assets/supplies and fixed net issuance (or V4 peg-only corrected output). Real built-world detail. Opened record matches signed value and above/below interpretation; actual hull trim clause matches composed visual. Reading dl stays ≤3; no assertion against class names alone. V4 owns elimination of issuance sign inversion. |
| `detail-panel.test.tsx` | `makes observed lighthouse status and separately named snapshot reachable` | Full fixture, then mintBurn-only stale and PSI unavailable. Open lighthouse. Match each detail's actual Harbor light value, current/stale/unavailable qualifier, full generated snapshot and relevant source-as-of when V5 adds it. Never infer painted cooler/slower from raw truth. |
| `detail-panel.test.tsx` | `qualifies partial issuance instead of presenting a complete reporting window` | Clone existing fixtureMintBurn coverage with six-hour history/has24hWindow=false while preserving net/gross. V4-produced real detail after adapter repair. Open issuance row; reported amount remains unscaled; window/partial qualifier visible, balanced activity distinct from inactivity. This is blocked on V4, not an assertion U0 can make pass alone. |
| `detail-panel.test.tsx` | `retains chain concentration and allocated flow meaning in the selected harbour` | Built fixture dock with known HHI/rank/share, held supply and cargo allocation. Open record; verify actual HHI/rank/share/condition values, estimated-not-measured allocation semantics from V9, held-supply change separate from flow, member share/value retained. |
| `detail-panel.test.tsx` | `exposes watched-roost values even when there are no movers` | Existing fixture with no notable movers; record must exist and open. Exact roost today/yesterday values or unavailable state plus no movers remain reachable, not just Telegram link. |
| `detail-panel.test.tsx` | `keeps selected water surface and local stale haze inspectable` | Actual built world with stressStale/chainsStale separately. Area record shows selected surface and risk-water-only haze; dock record shows quay-only haze. Do not treat haze as financial storm or apply quay haze to unrelated water. |
| `detail-panel.test.tsx` | `retains month history and fallen-coin identity in bounded records` | Existing fixture cemetery entries and lighthouse history. Open respective real details, verify symbol/cause/date/peak and garden-record meaning distinctly from worst-band mark; separate lifecycle/model test if each needs isolation. |
| `detail-panel.test.tsx` | `bounds real composed records without dropping exceptions` | Build a real maximum-signal ship (maker consort, price confidence low, disagreeing consensus/DEX data, significant history, mintBurn, age). ≤3 reading cells, ≤11 ship rows; assert actual distress/peg/caveat/DEX/history/issuance values survive. Do not supply handmade raw fact arrays or prove only row count. |
| `accessibility-ledger.test.tsx` | `preserves the selected ship's own distress and caveat in each ledger presentation` | Same actual consort/stale worlds; inspect selected ship's own row, not only global squad section. Mirror full peg/override/relevant source state/epoch; normalized visible and sr-only analytical body remains equal. |
| `accessibility-ledger.test.tsx` | `includes mint-burn in observed-source status without false all-current` | Single-source stale parameterization through V5 registry, specifically mintBurn-only case. Actual lighthouse/ledger show stale and same source observation; missing is not current. Missing/pending/recovery semantic state tests belong to V5. |
| `accessibility-ledger.test.tsx` | `preserves backing diversity, scope and partial flow beside allocated harbour values` | Real fixture-built station/issuance values; selected station row retains diversity and estimated-allocation context; per-coin partial flow clause agrees with inspector after V4/V5. |
| `detail-model.test.ts` | `keeps shared placement separate from the selected consort's own evidence` | Existing fixture-driven test gains strong ownReason/ownPlacement/shared-placement distinction where needed. Do not duplicate label-copy/forwarding tests: rendering regression above is the main value-loss oracle. |
| `format-detail.test.ts` | `retains qualifier associations without leaking unrelated source meaning` | Test composition boundary with real model output if needed: peg/placement sources stay under position; cap/price consensus stay with cap; flow/window stays issuance. Remove old implementation shape pins when incompatible, not wholesale tests for unaffected numeric helpers. |

### Acceptance commands

Focused commands supported by package's `test: vitest run` (`package.json:26`), run after implementation; they are not all claimed executed here:
```sh
npm test -- src/components/detail-panel.test.tsx
npm test -- src/components/accessibility-ledger.test.tsx
npm test -- src/systems/detail-model.test.ts
npm test -- src/lib/format-detail.test.ts
```
Orchestrator centrally owns `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:bundle-size` and existing browser accessibility/DOM gates (`package.json:21-40,54`). Operator must actually select consort/lighthouse/dock/water/pigeonnier with keyboard, open Read the record, inspect the values and switch the visible ledger at supported minimum viewport. For appearance/layout only use real operator GPU lane, e.g. `npm run preview -- --url http://localhost:5173 --fixture dense --reduced --assert --out outputs/u0-record.png --json outputs/u0-record.json` (`package.json:76`; `docs/pharosville/TESTING.md:95-109,122-153`); a screenshot without opening/selecting the records does not itself prove this surface. This worker did not start a server, build or execute browser/GPU gates.

### Stop conditions / risks

- Do not accept U0 as full truth completion while V5/V4 missing-value interfaces are absent. Direct existing-value mappings can land independently, but source time/coverage acceptance must remain explicitly blocked on those owners.
- Stop for any selected own distress disappearing; new currentness from missing evidence; regenerated as-of on old row; partial volume rescaled to 24h; net/gross/intensity conflation; quay estimate presented as measured chain issuance.
- Do not show old within-zone anchoring semantics merely to satisfy exhaustive table coverage; V9 clean cutover supplies inspect-only score meaning.
- Keep first-screen ≤3 figures. Recommended ship ≤11 core rows, not arbitrary raw-fact dumps; evaluate long `<dd>` and lighthouse ≤12 rows in real minimum-size DOM. If readable physical fit fails, shorten repeated labels/duplicate route/source clauses rather than dropping material caveats. [INFERENCE] Wrapping can grow height even with unchanged row count.
- Native disclosure keyboard/accessibility and visible/sr-only equivalence need operator/browser proof; RTL/jsdom cannot certify focus traversal/default summary activation or pixel readability.
- Renderer truth-immediacy contract means raw status may precede painted lamp. Do not claim exact painted-state parity without actual state plumbing/measurement; bounded explanatory caveat is the small default.
- Shared file conflict: V4/V5/V9 also touch detail-model/ledger; one integration owner merges explicit interfaces and wording, no duplicated source lists or competing formatting helper.

## Enhancements

Ranked by consumer value; cost/risk are relative engineering assessments **[INFERENCE]**, not measured estimates.

1. **Complete selected-record caveat chain** — value: prevents calm formation/healthy summary hiding own distress or stale observations; cost: low for existing facts, medium with V5 integration; risk: low for mappings, medium for source-state interface. **Direct correction.** Position/Currently and Formation are the bounded homes; do not move risk geography.
2. **Signed peg interpretation + distinct observed lamp truth** — value: makes key WebGL readings intelligible without color; cost: low mapping plus one bounded explanatory caveat; risk: low if observed-versus-painted is explicitly named. **Direct correction** for dropped existing values; exact painted-state exposure is separate operator decision.
3. **Coverage-aware issuance and estimated harbour disclosure** — value: prevents incomplete reported window and allocated figures masquerading as direct 24h measurements; cost: medium upstream V4/V5, low U0 rendering; risk: medium contract cutover. **Direct correction**, with materiality/cargo attention policies explicitly excluded.
4. **Behavioral composed-world tests replacing raw-fact pins** — value: catches model→composer→DOM losses across future labels and missing sources; cost: medium fixture setup; risk: low with deterministic clocks and held-placement resets. **Direct correction**; do not create a generic exhaustive-label dump test that enforces every raw field.
5. **Per-record local haze/HHI/roost/month-history completion** — value: closes overlooked meaningful selectable-entity parity gaps; cost: low finite mappings; risk: low semantic, medium text density. **Direct correction**; inspect minimum viewport before acceptance.
6. **Actual accepted/easing lamp state as an optional presentation clause** — value: reconciles momentary picture/current observation for advanced inspection; cost: medium renderer presentation plumbing; risk: medium update cadence/ownership. **Needs operator product decision**, recommended defer exact telemetry in favor of observed-status disclosure and existing intentional easing explanation.

## Open decisions for the operator

1. **Expanded-record density rule.** Recommended default: retain three first-screen figures and unchanged first-screen prose; acknowledge current 9 normal/10 squad rows, permit max **11 core ship rows** including one DEX exception and formation, no raw fallback; lighthouse 12, dock 6, pigeonnier 2, grave 3 in proposed finite layout. This corrects stale <=8 comments/test rather than reorganizing all records to satisfy an unmaintained number. Alternative hard eight requires intentional layout tradeoffs; never silently hide meaning to meet it.
2. **Own distress outside the disclosure?** Recommended default: repair inside existing formation disclosure, leading with selected own distress; full peg plus caveat next to position. No new first-screen warning band in U0. If operator wants acute safety at-a-glance, approve a later single bounded warning replacing—not appending to—summary; formation/geography policy remains separate.
3. **Harbor light means observed or painted?** Recommended default: name current observed source status and explain render easing. Do not label raw fold as exact instantaneous appearance. Actual accepted/easing state exposure is optional separately owned presentation plumbing; immediate data truth remains authoritative (`src/three/world-renderer.ts:845-849`).
4. **Missing source time and coverage delivery.** Recommended default: coordinate V5 selected-evidence contract and V4 issuance contract before integrated U0 acceptance; no invented timestamps, no unknown-as-current placeholder. Existing available-value mapping commit remains independently revertible.
5. **Inspector completeness versus intentionally redundant fields.** Recommended default: material analytical values/caveats covered below, but omit raw internal placement keys and detailed livery duplicate; keep ledger exact semantic access. Do not add every raw field just because it exists. Pigeonnier and named-water mappings are direct parity corrections, not decorative redesign.

### Appendix — exhaustive fact routing at HEAD

Interpretation: **First screen** means DOM outside the closed Read the record disclosure; `header`, `summary`, `prose`, and `reading` are distinguished. **Record** means actual composed value inside that disclosure, not mere presence in `detail.facts`. **Ledger** means actual semantic value rendered, whether visible disclosure or sr-only body; “partial” means only a subset or equivalent but less complete value. Optional facts are evaluated when emitted. No field dump is recommended. All table verdicts are from displayed source; direct smoke samples are `outputs/verify-v2-u0/probe-results.jsonl:1-21`. No physical pixel-fit claim follows from these tables.

Common routing evidence: first-screen renderer `src/components/detail-panel.tsx:145-176`, reading selector `src/lib/format-detail.ts:208-237,267-274`, registry `:121-173`, composer `:278-435`, record renderer `src/components/detail-panel.tsx:181-215`.

#### Ship (including flagship/vanguard/consort)

All ordinary/squad facts come from the **same** `detailForShip`; squad conditional rows are marked. There is no separate squad kind (`src/systems/pharosville-world/stages/detail-index.ts:41-48`).

| Emitted fact label / emitter | First screen? | Read the record? | AccessibilityLedger? | Loss/reason; intended action |
|---|---|---|---|---|
| Peg deviation — `detail-model.ts:1279` | Header signed bps; reading only if earlier candidates do not fill 3 slots | **No full fact** | Yes full direction/trim (`accessibility-ledger.tsx:539`) | Recognized `pegDeviation` but composer never consumes it; add full value to Currently. |
| Market cap — `:1280` | Reading compact supply | Yes compact Market cap | Yes compact (`ledger:525`) | Retained, formatted. |
| Fleet rank — `:1281` | Reading when emitted | Folded Market cap | Yes (`ledger:513-525`) | Retained. |
| Share of fleet — `:1282` | No | Folded Market cap | Yes (`ledger:512-525`) | Retained. |
| Price confidence — `:1283` | No | Folded Market cap | **No** (`ledger:524-550`) | Panel retains significance-gated value; add ledger clause. |
| Source consensus — `:1284` | No | Folded Market cap | **No** (`ledger:524-550`) | Panel retains; add ledger clause. |
| DEX cross-check — `:1285` | No | Identity exception row | Yes, including agreement (`ledger:544-547`) | Retained when emitted (model emits disagreement only); do not bury exception. |
| 24h supply change — `:1286` | Reading when valid | 24h change, including placeholder | Yes (`ledger:541`) | Retained; reading deliberately omits unavailable placeholder. |
| Supply momentum — `:1287` | No | Folded 24h change | Yes (`ledger:542`) | Retained. |
| Depeg history — `:1288` | No | Folded 24h change | Yes (`ledger:543`) | Significant historical fact already retained; not a U0 loss. |
| In service since / tracked — `:1289` | No | Identity age row | Yes (`ledger:536`) | Retained, neutral/unavailable stated. |
| Cycle tempo — `:1290` | Reading fallback only | Folded Route cadence | Yes (`ledger:533`) | Retained. |
| Safety grade — `:1291` | No | Folded Class | Yes (`ledger:549`) | Retained. |
| Route cadence — `:1292` | No | Identity row | Yes (`ledger:534`) | Retained staged-presence caveat. |
| Issuance work, 24h — `:1293` | No | Identity row | Yes (`ledger:535`) | Current value retained; **coverage/gross/window absent upstream**, not filter loss. |
| Ship class — `:1294` | No exact class (kind says stablecoin) | Folded Class | **No exact class** (`ledger:524-550`) | Panel retained; ledger currently only livery/name. Add if enforcing class analytical parity. |
| Size tier — `:1295` | No | Folded Class | **No exact tier** (`ledger:524-550`) | Panel retained; cap magnitude is not equivalent category label. Add bounded class/tier clause. |
| Mast signal — `:1296` | No | Folded Class | Yes (`ledger:540`) | Retained NAV/yield meaning. |
| Cultural significance — `:1298` | Yes heritage prose | No separate row | Yes source clause heritage (`ledger:532`) | Deliberately prose, not dropped. |
| Ship livery — `:1300` | No | **No** | Yes (`ledger:529`) | Unrecognized; intentional cosmetic duplicate omission, keep out unless operator needs exact sail-detail record. |
| Representative position — `:1301` | Summary may paraphrase, not exact | Currently | Yes (`ledger:508,525`) | Retained exact record. |
| Risk water area — `:1302` | Header label | Folded Currently | Yes (`ledger:527`) | Retained/collapsed with representative position. |
| Risk water zone — `:1303` | No raw enum | Used to compose Currently; enum not displayed | Yes (`ledger:527`) | Deliberate internal enum suppression; named water retained. |
| Risk placement key — `:1304` | No | **No** | Yes anchor (`ledger:526`) | Unrecognized internal key; leave out, not a necessary user-facing duplicate. |
| Within-zone anchoring — `:1305` | No | **No** | Yes (`ledger:523,528`) | Unrecognized; **do not restore old spatial claim**. V9 replaces with inspect-only DEWS meaning. |
| Stress driver — `:1306` | Summary may mention generic reason | Folded Currently | Yes (`ledger:548`) | Retained actual driver. |
| Tracking new risk band — `:1251,1307` / patch `:1101` | No | **No** | Yes active transition clause (`ledger:509-511,550`) | Unrecognized; add to Currently, remove at completion via existing model gating. |
| Home dock — `:1308` | No | Identity row | **No explicit home** (`ledger:527`) | Retained panel; counts of dock stops are not home-dock identity. Add ledger. |
| Chains present — `:1309` | No | Position/Chains | **Partial** counts only (`ledger:527`) | Panel retains top3 chain identities/shares; ledger loses those values. Reuse existing helper, no second truncation convention. |
| Chain footprint — `:1310` | No | **No** | **Partial** counts, no broad/narrow descriptor (`ledger:527`) | Unrecognized; fold into Chains. |
| Sailing in formation (squad only) — `:1311` | Shared placement may be narrative | Position row | Yes squad list (`ledger:352-366`) | Retained. |
| Squad override (squad only) — `:1312` | **No own banner** | **No** | Yes separate squad sub-row (`ledger:369-379`) | Unrecognized material loss; prepend in Formation and ship-local ledger line. |
| Route source — `:1313` | No | **No** | **Partial** placement source clause, not fixed route sources (`ledger:532`) | Unrecognized; named route provenance joins Chains. |
| Evidence status — `:1314` | Placement summary sometimes paraphrases caveat (`detail-model:1149-1151,1323`) | **No** | **Partial** fresh/caveat + separate reason (`ledger:530-531`) | Unrecognized; show exact caveat next to selected position/peg, never rely on summary fallback. |
| Evidence — `:1315` | No | **No** | Yes source fields (`ledger:532`) | Label not alias of Source fields; explicit evidenceFields key and position slot. |

**Missing, not emitted:** ship source/row as-of (`world-types.ts:54-59`; `detail-model.ts:1278-1315`); issuance coverage/full window/gross mint+burn (`ship-issuance.ts:15-26`). These have no existing raw-fact row to “unfilter”; V5/V4 supply them into reserved slots.

#### Dock / quay

Emitter `src/systems/detail-model.ts:1012-1029`; ledger clauses `src/components/accessibility-ledger.tsx:439-468`; composed keys `src/lib/format-detail.ts:399-407`.

| Fact / emitter line | First screen? | Read the record? | Ledger? | Loss/reason; intended action |
|---|---|---|---|---|
| Stablecoin supply — `:1013` | Reading compact supply | **No** | Yes compact (`ledger:457`) | Raw label not Market cap; add dock supply host row, retaining raw exact quantity inspectably. |
| Harbor rank — `:1014` | No | **No** | Yes (`ledger:443,458`) | Unrecognized; fold dock supply. |
| Share of stablecoin supply — `:1015` | No | **No** | Yes (`ledger:444,459`) | Unrecognized; fold dock supply. |
| Concentration — `:1016` | No | **No** | Yes HHI (`ledger:445,460`) | Unrecognized material analytical value; Health host row. |
| Stablecoin count — `:1017` | Reading | **No** | Yes (`ledger:461`) | First-screen-only value; fold dock supply record. |
| Health — `:1018` | Reading | **No** | Yes (`ledger:462`) | Unrecognized by section classifier; new finite Health host row. |
| Backing diversity — `:1019` | No | Identity row | **No** (`ledger:439-468`) | Panel retained; ledger parity hole. |
| Quay condition — `:1020` | No | **No** | Yes (`ledger:455,463`) | Unrecognized; fold Health. |
| 24h supply change — `:1024` | No | 24h change | Yes (`ledger:464`) | Retained held-supply meaning. |
| Supply momentum — `:1025` | No | Folded 24h change | Yes (`ledger:465`) | Retained. |
| Net flow 24h — `:1026` | No | Identity row | Yes (`ledger:466`) | Retained current wording; V9 changes estimate semantics/label, U0 must migrate mapping cleanly. |
| Station type — `:1027` | Summary exact | **No** | Yes readable station (`ledger:457`) | Unrecognized, partly redundant prose; compose Station record. |
| Rim cove — `:1028` | Summary exact | **No** | Yes (`ledger:457`) | Unrecognized, partly redundant; compose Station. |
| Quay haze (conditional) — `:1029` | No | **No** | Global Instrument haze only (`ledger:207-208`) | Unrecognized local cue; Station caveat, local ledger clause. |

Members' names/shares/exact USD are not facts; DetailPanel retains them inside record (`detail-model.ts:1033-1040`; `detail-panel.tsx:193-202`). Ledger's harboring list keeps compact coin USD but not each member share (`ledger.tsx:440-442`); add share if exact station-member parity is required, not by dumping facts.

#### Lighthouse

Emitter `src/systems/detail-model.ts:797-816`; ledger lighthouse/body `src/components/accessibility-ledger.tsx:177-180,211-216,230-243`; classifier/composer `src/lib/format-detail.ts:133-147,334-365`.

| Fact / emitter line | First screen? | Read the record? | Ledger? | Loss/reason; intended action |
|---|---|---|---|---|
| Score — `:797` | Reading if available | **No** | Yes (`ledger:232`) | First-screen-only figure; fold Market stability record so unavailable remains reachable. |
| Band — `:798` | Reading; summary names band | **No** | Yes (`ledger:233`) | First-screen-only reading; same host row. |
| Market stability — `:799` | Summary partly covers stale/unavailable | **No** | **Partial** global stale list, score/band; no selected qualifier (`ledger:178-180,232-233`) | Unrecognized; Market stability host. |
| Far shore — `:800` | No | **No** | Yes (`ledger:211-212`) | Unrecognized; bounded Sky/far-shore record. |
| Sky cover — `:801` | No | **No** | Yes (`ledger:215-216`) | Unrecognized; same bounded row. |
| Snapshot as of — `:802` | No | **No** | Yes Generated at (`ledger:177,589-594`) | Unrecognized; show with its true snapshot meaning, not source time. |
| Trend — `:803` | No | Identity row | Yes (`ledger:234`) | Retained. |
| Composition — `:804` | No | Identity row | Yes (`ledger:235`) | Retained. |
| Beam warmth cue — `:805` | No | **No** | Yes, uses actual areas rather than generic capability (`ledger:233`; `detail-model:279-290`) | Unrecognized; clause separate from freshness in Harbor light. Actual-world cue derivation remains owner's policy. |
| Harbor light — `:806` | No | **No** | **No actual value** (`ledger:230-243`; probe:3) | Unrecognized; explicit observed-status host row. Painted state is a separate contract. |
| Beam bearing — `:807` | No | Identity row | Yes (`ledger:239`) | Retained. |
| Worst band, 30d — `:808` | No | Identity row | Yes (`ledger:240`) | Retained. |
| Garden record, 30d — `:809` | No | **No** | Yes (`ledger:241`) | Unrecognized; fold explicitly into month-history/worst-band host, preserve distinction. |
| Supply tide 7d — `:810` | No | Identity row | Yes (`ledger:242`) | Retained. |
| Flight to quality — `:811` | No | Identity row | Yes equivalent fleet clause (`ledger:496-498`) | Ledger not exact intensity value; if intensity remains analytical, reuse full helper in lighthouse clause. |
| Signal mast — `:812` | No | Identity row | Yes (`ledger:237`) | Retained. |
| Fleet peg — `:813` | No | Identity row | Yes (`ledger:238`) | Retained. |
| Last fleet depeg — `:815-816` | No | Identity row (including None on record) | **No date clause** (`ledger:230-243`) | Panel retained; add missing ledger date/no-record value. |

Contributors and LongRecord are not facts and already render inside disclosure (`detail-model.ts:820-831`; `detail-panel.tsx:191-202`); ledger includes contributor text (`ledger:236`). Correct PSI source-as-of and accepted/easing lamp presentation are absent from these facts; reserve slots, do not infer.

#### Pigeonnier

Emitter `src/systems/detail-model.ts:635-646`; ledger `src/components/accessibility-ledger.tsx:254-263`; no reading preset (`src/lib/format-detail.ts:208-237`).

| Fact / emitter line | First screen? | Read the record? | Ledger? | Loss/reason; intended action |
|---|---|---|---|---|
| Channel — `:635` | Summary names watch; primary Telegram link | **No** | Yes meaning PharosWatch Telegram (`ledger:256`) | Unrecognized; Channel row. |
| Alerts — `:636` | Summary same meaning | **No** | Yes (`ledger:256`) | Unrecognized; Channel row clause. |
| Depeg roost — `:638-641` | No | **No** | Yes (`ledger:257-259`) | Unrecognized meaningful comparison; own bounded row. |
| Notable movers — `:644-646` | No | **Partial** names via members only when nonempty | Yes names/none (`ledger:260-262`) | Unrecognized; None today currently has no panel slot; fold roost row, retain member detailed values. |

#### Grave / fallen coin

Emitter `src/systems/detail-model.ts:1352-1357`; ledger `src/components/accessibility-ledger.tsx:553-558`.

| Fact / emitter line | First screen? | Read the record? | Ledger? | Loss/reason; intended action |
|---|---|---|---|---|
| Symbol — `:1352` | **No exact symbol guaranteed**; title is name (`:1347-1349`) | **No** | Yes (`ledger:558`) | Unrecognized; small Identity symbol row. |
| Cause — `:1353` | Reading (epitaph/obituary may also mention it, not guaranteed) | **No** | Yes (`ledger:554,558`) | First-screen-only fact; explicit Lifecycle record if repeat is wanted. |
| Stone garden — `:1354` | No | Identity row | Yes (`ledger:558`) | Retained. |
| Date — `:1355` | Reading (epitaph/obituary may also mention it, not guaranteed) | **No** | Yes (`ledger:558`) | First-screen-only; Lifecycle host. |
| Peak market cap (finite optional) — `:1357` | Reading compact | **No** | Yes compact (`ledger:555-558`) | First-screen-only; Lifecycle host with actual USD inspectable. |

Obituary survives as a first-screen paragraph; source link survives as a secondary link inside record (`detail-model.ts:1350,1360-1362`; `detail-panel.tsx:165,205-215`).

#### Named area / risk water / Ledger Mooring / Wreck Shoal

Emitter `src/systems/detail-model.ts:1378-1386`; injected facts owner `src/systems/pharosville-world/stages/world-scaffold.ts:377-379,399-401`; ledger `src/components/accessibility-ledger.tsx:299-305`.

| Fact / emitter line | First screen? | Read the record? | Ledger? | Loss/reason; intended action |
|---|---|---|---|---|
| DEWS band (banded waters) — `:1378` | Reading; summary band | **No** | Yes (`ledger:302`) | Intentionally first-screen/summary; no need raw duplicate row. |
| Stablecoins (banded count) — `:1379` | Reading | **No** | Yes (`ledger:302`) | First-screen-only count, not lost overall. |
| Risk water zone (optional) — `:1380` | No raw enum | Key recognized but `composeCurrently` alone returns empty for zone-only (`format-detail.ts:36-51,417-428`) | **Partial** zone only when no band (`ledger:302`) | No host row; internal category redundancy can remain omitted. |
| Risk placement (optional) — `:1381` | Summary named water, not raw key | **No** | Yes (`ledger:302`) | Label not registered (and not Risk placement key); internal key omission intentional. |
| Atmosphere — `:1382` | No | Identity row | Yes banded reading, not exact full value for unbanded (`ledger:86-87,303`) | Retained panel; ensure unbanded semantics don't diverge when adding clauses. |
| Water surface (optional) — `:1383` | No | **No** | Yes (`ledger:304`) | **Label mismatch**: Water style recognized, Water surface not. Explicit new finite row. |
| Risk-water haze (conditional) — `:1384` | No | **No** | Global Instrument haze only (`ledger:207-208`) | Unrecognized local qualifier; fold Atmosphere + local ledger clause. |
| Water style (`node.facts`) — `:1385`; `world-scaffold:378,400` | No | Identity row | Yes area fact list (`ledger:302`) | Retained. |
| Source (`node.facts`) — `:1385`; `world-scaffold:379,401` | No | Source fields alias, overwritten by identical later Source fields | Yes raw area fact list (`ledger:302`) | Deliberate deduplication, not missing evidence. |
| Source fields — `:1386` | No | Identity row | Yes (`ledger:302`) | Retained; single chosen source-fields row. |
| Other custom `node.facts` — `:1385` | Depends on finite reading preset | Only existing recognized mappings | Yes raw area facts (`ledger:302`) | Open-ended extension, no fixed emitted label list at HEAD; do not register unknowns or append blindly. Production scaffold's full injected list is only Water style/Source above. |

No other selectable detail kinds are emitted by world detail index (`src/systems/pharosville-world/stages/detail-index.ts:28-53`). This appendix includes every literal fact label emitted by assigned `detail-model.ts` constructors and every current scaffold-injected label; structural `members`, `longRecord`, summary, status and links are called out separately so they are not mistaken for filtered facts.

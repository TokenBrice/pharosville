# PharosVille data-contract acceptance fixtures

For the implementing agent, against repository main commit `599c8225839702e3d1baf047ab3b46f04137d01b`.

Repository: https://github.com/TokenBrice/pharosville

## What this companion is

`data-contract-scenarios.ts` exports **21 proposed acceptance scenarios** using the current repository's `PharosVilleInputs`, payload schemas, constructors and import aliases. It imports without running diagnostics, asserting today's defects, changing the clock, or logging anything. `validateFixturePayloads()` and `validateSyntheticBookkeeping()` run only when explicitly called.

These fixtures are test support for a plan. They are **not an implemented fix**, actual market snapshots, a new API schema, or passing desired-behavior tests. Several proposed oracles intentionally disagree with current code. All fixture identities are actual curated IDs; all amounts/conditions are synthetic. In particular, the $1M DAI outlier is not a statement about DAI's real supply or risk.

The raw `INVALID_CRITICAL_PAYLOADS` are deliberately outside the copied full schema. Keep them separate from shape-valid inputs when testing fail-closed adaptation.

## Install and check

Read `AGENTS.md` and the routed contract/testing documentation before implementation. Install the module at:

`src/__fixtures__/data-contract-scenarios.ts`

Keep this README with the planning handoff or beside the fixtures. The deliverable companion contains only this README and the pure module; no custom check configuration is needed.

Its `@/` and `@shared/` imports are existing repository aliases. The module can also import from another repository-local folder through those aliases, but the existing full typecheck includes `src/`; installing at the specified location makes that standard command check this module too. No absolute filesystem path is required.

From repository root after normal dependency installation:

```sh
npm ci
npm run typecheck
node --import tsx --input-type=module -e 'import { validateFixturePayloads, validateSyntheticBookkeeping } from "./src/__fixtures__/data-contract-scenarios.ts"; const result = validateFixturePayloads(); validateSyntheticBookkeeping(); console.log(`Validated ${Object.keys(result).length} scenario shapes and synthetic bookkeeping.`);'
```

The preparation check on the pinned repository passed focused `tsc` on the pure module and all 21 scenarios' present payloads against copied endpoint schemas. Additional bookkeeping checks passed for global/attributed/unattributed stock totals, asset chain lists, per-coin held supply no greater than circulating, related safety IDs, peg aggregate active count and mint/burn tracked supply. These checks do not validate risk policy, visual appearance, activity admission or producer methodology.

Use a deep clone before changing an exported scenario. Do not mutate shared fixtures or depend on the original diagnostic runner's top-level current-failure assertions.

## Two kinds of fixture

### Small boundary and counterfactual cases

`quietNormal` has two ships. It is useful for unit/adapter isolation; it is not a whole-frame taste baseline.

`largeMint`, `largeRedemption`, `largeBalancedGross` and `oneDollarNet` intentionally change USDC's reported gross/net/direction/activity while holding supply, peg, PSI, signed `flowIntensity=0`, and gauge `FLAT/score0` constant. This isolates the gross-versus-net contract. They do **not** claim to be naturally strong normalized-intensity or all-channel producer snapshots. Current route pace should remain at its intensity-zero result in this counterfactual; proposed cargo behavior should change independently. Do not recompute or forge PSI/gauge methodology to make the test look more natural.

`severeSingleCoinDepeg`, `mildDeviationStrongDews` and `unknownStressBand` likewise hold other official source outputs constant to isolate local-risk resolution. A physically severe local input and held healthy PSI are deliberate counterfactuals, not a claim about how Pharos would calculate a real aggregate.

`smallCoinCalmBaseline` / `smallCoinOutlier` share the same three identities, supply, chains, grades, global totals and covered-flow universe; only the added coin's own peg/DEWS condition changes. Compare them to avoid conflating a population change with risk change.

`calmConsortBaseline` / `acuteConsort` share the same USDS+sUSDS universe and $2B stock, matching grades, chains, flow coverage and aggregate totals. Only the sUSDS own peg state changes. Their purpose is to test related-issuer formation without suppressing own evidence.

`staleRisk` is an **upstream-status injection**, with a retained source sample and stale flags. It is not an elapsed-age simulation. Use the query stub and an explicit later observer time for age-based tests. `oldStressRowFreshEnvelope` is a different case: row time is one day older than the fresh envelope time.

`partialFlow` requests a 24h reporting window but has only six hours of available history, `has24hWindow=false`, no 30d/90d window and partial-history status. Do not rescale that amount into a full-day measurement.

### Representative art and capacity cases

`denseQuietArt` preserves all **132** identities and the current dense stock size distribution, held chain presence and ID-linked branding/assets. It normalizes:

- Known healthy PSI `STEADY/82`, not the stock browser helper's unsupported `ELEVATED`
- All peg deviations zero and active depegs false; explicit DEWS `CALM/8`
- Safety A; full-window zero issuance, covered by an explicitly synthetic chain scope
- Previous supply and chain-stock histories equal current, giving true zero stock change
- Weekly global change raw fraction zero, not the original `1.8` interpreted as +180%
- Seven original overallocated per-coin chain holdings that summed to 102% are scaled to 100%, preserving chain proportions/IDs and original ship stock/size
- Asset chain lists, per-chain totals/dominant holdings and global/attributed/unattributed stock totals

Its global stock is $75,303,140,000; attributed chain stock is $63,687,994,400; $11,615,145,600 is explicitly unattributed (floating-point residue is below $0.00002). Do not quietly expand chain shares to erase that difference. NAV-category vessels may remain in Ledger Mooring; the rest are calm. If the calm basin cannot hold the representative fleet without crowding, that is useful composition/capacity evidence. Do not mix in risk simply to spread the fleet and make a calmer-looking screenshot.

`denseMixedCapacity` keeps the same 132 identities, sizes, chains and stock totals, but restores the existing mixed peg/DEWS/safety rows and uses known `CRISIS/25` PSI. Use it for crowded risk waters, selection and local-category readability. It is not a calm-art approval frame or a producer-derived PSI calculation.

These synthetic baselines do not replace the final authorized production-like full-fleet snapshot gate. Preserve staged voyages and the current garden score during the pine/bank/crag method proof; use matched inputs and clocks so art changes can be judged separately from semantic changes.

## Clock discipline

`T=1700000000` is Unix **seconds**. `NOW_MS=T*1000` is the observer epoch in milliseconds. Source samples, renderer elapsed seconds and illumination hour are separate clocks.

- Fake-timer model/query tests: set the observer to `NOW_MS`, then advance deliberately. Advance source row `computedAt`/payload `updatedAt` only when a genuinely new sample is being supplied.
- Still comparisons: a fixed observer Date plus a fixed illumination hour is acceptable, while performance, RAF and timers remain native. It proves a still, not director/event behavior over an hour.
- Long watches: a fixed Date can leave the director in its initial 90-second silence forever. The exported `installFlowingFixtureDate` is **proposed test support only**; it is not integrated into the current preview CLI.

Install `installFlowingFixtureDate` **once in a fresh browser context, before any fixed-Date proxy or other clock override**. Never layer it over the stock fixture's fixed Date and never reinstall it in the same context. It anchors Date to the fixture epoch and advances Date from native `performance.now()`; it does not replace performance, RAF or timers. Keep native Date before installation in isolated tests and restore it in `finally`, or discard the browser context for teardown.

To simulate a healthy long watch, the transport must also produce coherent new payload/row timestamps at its synthetic producer cadence. Returning the same old payload with freshly rewritten `_meta` is an outage/row-age test, not healthy live data. Repeated same-value new samples are valid and must not replay transactions or trigger repeated captions. History/methodology/event timestamps should only change when their own observation changes.

For a watch that includes the day score, flowing Date alone is insufficient while `#t=12` (or another fixed session-hour override) pins the sky/score hour. The future harness must bypass the stock fixture's default fixed `#t=12` and let the illumination/score clock advance. Keep fixed-hour overrides only for matched stills or an explicitly scoped constant-light motion test. Do not claim an all-day/score watch from a pinned hour.

The helper was checked in an isolated process for: side-effect-free import, `Date()`/`new Date()`/`Date.now()`, explicit numeric/string/multi-argument constructors, native elapsed progression, preserved timer/performance functions, and explicit restoration. Do not install it on a user's normal browser tab.

## Proposed scene oracles

**Phases matter.** Missing/unknown truth claims, peg-only draft, gross-versus-net preservation, explicit “estimated 24h allocation by held supply” wording and rendered-record/source parity are direct-correction oracles. Most-severe own placement and formation changes, PSI-only broad sea, and retained historical-risk geography are **proposed policy-change oracles** to adopt with their own navigation/state tests after policy acceptance. Materiality/attention constants and any autoplay subtraction require calibration/readability evidence. None of those larger policy oracles is a mandatory pine/bank/crag art-proof gate; keep the art proof's signals and staged voyage score frozen.


| Input | Required interpretation |
|---|---|
| Quiet complete normal | Measured zero flow; no invented analytical work. Illustrative voyages keep their disclosed holdings meaning. |
| Severe own depeg | Own acute risk remains visible, including consort; peg-only signed draft. |
| Mild peg deviation plus stronger DEWS | Most-severe own current presentation category; official DEWS and peg observations stay separate. |
| Market-wide stress | PSI owns broad atmosphere; local deterioration remains local; wall-clock light does not become a financial indicator. |
| Large mint / redemption | Distinct static cargo direction; no issuance draft added to peg trim. |
| Large balanced gross | Activity remains positive even with net zero; show measured gross/net separately. |
| Tiny net / below-threshold work | No claim that an overview suppression means no reported activity. Materiality constants are uncalibrated prototype policy, not a passing safety rule. |
| Missing / pending / failed enrichment | Partial world can open, but no positive all-current certification or measured-calm fallback. |
| Stale retained data | Historical qualification, no apparent recovery caused by source loss; trim may neutralize and cargo may pause. |
| Partial history / unknown coverage | No complete-24h zero or normalized activity claim. |
| Small-coin outlier | Local severe condition; same PSI implies same broad atmosphere. |
| Unknown stress band | Unsupported carrier unavailable, never fresh Calm; known other evidence retained. |
| Old row under fresh envelope | Row's own age/time survives; response freshness cannot make it a new observation. |
| PSI input degradation | Preserve official published value and qualify its inputs. |
| Legacy intensity semantics | Do not infer gross work from absolute intensity; preserve raw gross/direction/window evidence. |

Use the reported/exact net direction for the primary static cargo pose. Do not erase a material nonzero mint or burn into a 10% “balanced” deadband; positive gross with truly reported flat/net-zero is balanced activity. First prove the categorical static cargo grammar. Candidate $1M / 1% / .1% / top-three admission values from the plan require representative-snapshot and real-GPU calibration. They are not facts about market inactivity or prerequisites to the art-method proof. Removing autoplay voyages, quay estimates or flight tenders is also a later evidence-led product decision, not a required parity correction.

## Tests the fixture shape cannot express yet

Current `PharosVilleInputs` has stale booleans but no explicit per-source availability/coverage/time model. Missing/pending/failed query stubs use the actual `ApiQueryWithMetaResult` fields; the proposed observation adapter must carry those states into the world before its richer oracles can pass. Do not insert invented API properties just to satisfy the new test.

Add deterministic sequence tests:

- Calm → Watch → Calm → Watch with distinct source observations: three changes, two recurring calm-to-Watch entries; duplicate refresh gives none
- Fresh → stale/error with the same sample → genuinely new complete sample: quality changes do not narrate market recovery; subdued state work may resume on the new sample even if its bin is unchanged
- Essentials arrive, grace expires, an enricher fails, others arrive later: no empty-world reset or all-current gap
- Hidden two hours → resume: age before restarting activity; no catch-up burst
- PSI candidate interrupted by staleness: preserve accepted historical state, restart acceptance observation, expose observed-versus-easing record text
- Known-band methodology change: provenance updates; no invented improvement from incomparable versions

Use current pure-system tests and the actual rendered `DetailPanel` + `AccessibilityLedger` as oracles. A value in `detail-model.facts` is insufficient: the current composed record filters several key rows. Preserve bounded first-screen density while verifying relevant source/as-of, peg explanation, actual harbour-light state and flow coverage reach the rendered record.

Appearance/performance acceptance uses the repository's real-GPU `npm run preview` lane. Do not judge either through Playwright/SwiftShader. This module does not extend `--fixture` options in the current CLI; a future authorized test-harness integration must route these exact payloads through the existing same-origin fixture mechanism and keep hardware admission intact.

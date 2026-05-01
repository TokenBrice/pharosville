# PharosVille Scenario Catalog

Last updated: 2026-04-30

Use these scenarios to validate visual-world changes without rediscovering the fixture surface. The canonical fixture helpers live in `src/__fixtures__/pharosville-world.ts`.

## Base Fixture

`fixtureStablecoins`, `fixtureChains`, `fixtureStability`, `fixturePegSummary`, `fixtureStress`, and `fixtureReportCards` define the clean two-ship/two-dock route fixture used by unit and Playwright tests. Use `makeAsset`, `makePegCoin`, `makeChain`, and `makeReportCard` to build focused variants.

`denseFixtureStablecoins`, `denseFixtureChains`, `denseFixturePegSummary`,
`denseFixtureStress`, and `denseFixtureReportCards` define the dense atlas
fixture: 8 rendered chain docks, all 132 current dense-fixture active ships rendered
individually in the world model, rotating normal-motion map visibility for
moored non-titan ships, no ship-cluster targets, mixed DEWS bands, and enough
active metadata coverage to exercise the current ship visual classes.

## Scenario Matrix

| Scenario | Fixture/Test anchor | What it proves | Command |
| --- | --- | --- | --- |
| Clean desktop world | `systems/pharosville-world.test.ts` `builds deterministic core entities without React or canvas`; Playwright `pharosville renders desktop canvas shell` | Base world model, lighthouse, docks, active ships, cemetery, details, visual cues, nonblank canvas, asset health, and no retired building targets | `npm test -- src`; `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"` |
| Dense visual atlas | Playwright `pharosville dense visual fixture preserves districts, dense ships, and render budget` | District density, coherent ship sprites, 8 rendered chain docks, 132 dense-fixture ship motion samples, rotating normal-motion visible ship targets, no ship-cluster targets, cemetery/civic/risk-water crops, and normal-motion p95 draw budget | `npx playwright test tests/visual/pharosville.spec.ts --grep "dense visual fixture"` |
| Named risk-water areas | `systems/risk-water-areas.test.ts`; `systems/area-labels.test.ts`; `systems/pharosville-world.test.ts` `names DEWS water areas from live band counts`; `maps warning and danger DEWS ships...`; Playwright `pharosville exposes all named risk water areas in browser details` | DEWS bands plus Ledger Mooring map to named water areas, printed labels, placement terrain, browser-selectable details, risk-water labels, and risk zones | `npm test -- src/systems/risk-water-areas.test.ts src/systems/area-labels.test.ts src/systems/pharosville-world.test.ts`; `npx playwright test tests/visual/pharosville.spec.ts --grep "named risk water"` |
| Active depeg Danger Strait placement | `systems/pharosville-world.test.ts` `keeps active-depeg ships in the storm zone`; Playwright `pharosville renders a stressed ship in storm-shelf detail` | Active depeg evidence selects Danger Strait/storm-shelf storm water and exposes named risk water plus evidence in DOM detail | `npx playwright test tests/visual/pharosville.spec.ts --grep "stressed ship"` |
| Dock visits and home dock | `systems/pharosville-world.test.ts` `assigns rendered dock visits while preserving the representative risk tile`; `uses the largest rendered positive chain as home dock` | Chain presence, home dock, rendered dock visits, and risk placement stay separate | `npm test -- src/systems/pharosville-world.test.ts` |
| Dense active catalog | `systems/pharosville-world.test.ts` `renders every dense active stablecoin as an individual ship without clusters` | The current dense active catalog stays inspectable as individual ships with named risk-water area, risk zone, and detail entries rather than ship-cluster targets | `npm test -- src/systems/pharosville-world.test.ts` |
| Authored geography | `systems/world-layout.test.ts` | Sea-first ratio, generated-mountain lighthouse placement, risk anchors, cemetery scatter, and civic placement invariants | `npm test -- src/systems/world-layout.test.ts` |
| Dock atlas placement | `systems/chain-docks.test.ts` | Ethereum/L2 preferred harbors and top-eight chain harbor cap | `npm test -- src/systems/chain-docks.test.ts` |
| Ship visual channels | `systems/ship-visuals.test.ts` | Hull, rigging, pennant, overlay, and market-cap tier mapping | `npm test -- src/systems/ship-visuals.test.ts` |
| Visual cue auditability | `systems/visual-cue-registry.test.ts` | Visual cues have source fields and DOM equivalents | `npm test -- src/systems/visual-cue-registry.test.ts` |
| Motion route behavior | `systems/motion.test.ts` | Normal-motion routes, one-third docked dwell, titan-only moored visibility, all six risk-water zones, meaningful dockless patrols, ordered DEWS dwell/wake/drift, danger/Ledger visits, and water-only samples | `npm test -- src/systems/motion.test.ts` |
| Risk precedence | `systems/risk-placement.test.ts` | Active depeg, NAV ledger mooring, fresh DEWS, stale evidence, and fallback placement precedence | `npm test -- src/systems/risk-placement.test.ts` |
| Hit target alignment | `renderer/hit-testing.test.ts` | Manifest hitboxes, moving ship targets, titan moored targets, hidden non-titan moored targets, and absence of retired building selection targets | `npm test -- src/renderer/hit-testing.test.ts` |
| Narrow viewport fallback | Playwright `pharosville narrow fallback avoids world runtime requests` | Sub-1280 viewport renders DOM fallback and avoids world/runtime requests | `npx playwright test tests/visual/pharosville.spec.ts --grep "narrow fallback"` |
| Short desktop fallback | Playwright `pharosville short desktop fallback avoids clipped map` | Short desktop height renders fallback and avoids world/runtime requests | `npx playwright test tests/visual/pharosville.spec.ts --grep "short desktop"` |
| Ultrawide backing budget | Playwright `pharosville ultrawide canvas keeps DPR backing store capped` | DPR/backing pixels stay within budget on large screens | `npx playwright test tests/visual/pharosville.spec.ts --grep "ultrawide"` |
| Interaction and camera | Playwright `pharosville canvas interactions update details and camera` | Selection, detail anchors, blank-map clearing, zoom, pan, fullscreen, and camera bounds | `npx playwright test tests/visual/pharosville.spec.ts --grep "interactions"` |
| Reduced motion | Playwright `pharosville reduced motion keeps ship samples static without RAF`; `responds to live reduced-motion preference transitions` | Static samples, no RAF loop, and live preference transitions | `npx playwright test tests/visual/pharosville.spec.ts --grep "reduced motion"` |
| Normal motion | Playwright `starts bounded world animation and keeps moving ship targets selectable` | Bounded RAF startup, moving ship samples, moving target hitboxes, and route facts in detail/ledger | `npx playwright test tests/visual/pharosville.spec.ts --grep "normal motion"` |

## Adding A Scenario

- Prefer a focused unit test for data semantics and a Playwright test only when pixels, viewport gating, or browser interactions matter.
- Build variants from fixture helpers instead of production fallback data.
- Name the scenario after the user-visible behavior it protects.
- Update this catalog and `VISUAL_REVIEW_ATLAS.md` when the scenario becomes a canonical visual review entry.

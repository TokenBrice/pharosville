# PharosVille Runtime and Analytical Contracts

Last updated: 2026-10-19

This file owns runtime, truth, access and resource limits for The Harbour.
World meaning and art direction are the locked decisions D1-D14 in
`agents/2026-10-13-pharosville-reboot/PLAN.md` (circuits D10, minimal UI D11,
chart voice D12). The Garden Observatory contracts were retired with that world
at the Harbour cutover (2026-10-14) and remain in git history. Change a
contract only with explicit intent and matching code, tests and route docs.

## Runtime, security and access

- One production three.js WebGL2 world (`src/harbour/`). If it cannot start,
  the first-paint poster stays up with the guide and the analytics links;
  never boot another graphical renderer.
- Both the device screen and the current viewport must satisfy the
  sorted-dimension `720×600` size profile before React, the Harbour
  chunk, world data, three.js, GLBs or logos load. `src/main.tsx` owns this
  pre-React admission and activates inert HTML preloads only after both checks.
  These are size tests, never
  orientation tests. Blocked devices and small windows receive the welcome page
  with the guide, a static illustration ("Illustration, not live readings")
  and actual Pharos analytics links, and request no world/API/GLB/logo
  resource. A stale import cannot mount after admission is withdrawn, and
  readmission restores the poster. Coverage: `src/client.test.tsx`,
  `src/harbour/app/admission.test.ts`, `npm run check:viewport-gate`.
- First-byte HTML supplies identity, the three-line guide, an honest stage and
  working links over a poster with no live numbers. Successful reveal requires
  the committed model's prepared revision and complete boat count to match a
  composer-completed `fleet-frame` report, not merely a first canvas frame.
  A valid zero-boat revision is ready and says so. While stablecoins remains
  pending, the approved trial may reveal a completed boatless world after
  2 s from this mount's first completed-render callback; successful data still
  preparing cannot use that deadline. First-request or initial-worker failure
  reveals honest unavailable copy. If a matching prepared revision renders
  fewer boats than it holds for more than 3 s (a hull the kit cannot pose),
  the world reveals with "some boats could not be displayed" rather than
  holding the poster. No fake boats, waiting fog or synchronous main-thread
  planning fallback. The 1100 ms fade stays unchanged.
  Coverage: `src/harbour/app/reveal.test.ts`, `src/harbour/sim/plan-paths.test.ts`,
  `src/harbour/fleet/reconcile.test.ts`. No inline script, so the CSP pins no hash.
- Browser world code calls same-origin `/api/*` only. `PHAROS_API_KEY` remains
  server-side; never expose it through client code, fixtures, docs or logs.
- The endpoint registry (`shared/lib/pharosville-endpoint-registry.ts`) owns
  the seven sources and their cadences. The feed keeps the last good payload
  per endpoint; a failed refresh never blanks the harbour, it lets that payload
  age into stale. Freshness comes from the payload `_meta`, `X-Data-Age`, `Age`
  and `Warning` evidence and the shared freshness ratios; unknown age is never
  assumed current. Coverage: `src/harbour/data/fetch.test.ts`,
  `src/harbour/model/build.test.ts`.
- Truth states are part of the picture: stale data reads as fog, awaiting data
  is an empty harbour (never a fixture fleet), and missing evidence never reads
  as calm.
- Every reading the world encodes is also readable on demand (hover tag, side
  panel, ledger), with its freshness. Colour is never the only carrier of
  meaning; keyboard search, selection and Escape stay useful without
  inspecting WebGL pixels.

## Runtime preparation and rendering

- Model/route preparation is task-owned, with monotonic result precedence.
  Installed model, plan, pose and readiness publish together; FleetSystem
  reports the revision/count actually posed and submitted. Refresh reconciles
  boats by ID rather than replacing their motion/identity state indiscriminately.
- Shader preparation owns its temporary variants, bounds and cancels work,
  and restores live target/light/material state before awaiting completion.
  The current quality tier continues drawing during preparation, then the next
  tier publishes atomically. DPR-only changes do not trigger shader preparation.
  Resize, supersession, season changes and disposal invalidate obsolete work.
  A 30 s preparation deadline warns once and preserves a still-active partial
  batch rather than erasing scenery; its first real draw may synchronously
  finish compilation. KHR waits race cancellation and timed-out idle callbacks
  receive a bounded 4 ms submission slice. Without
  `KHR_parallel_shader_compile`, driver compilation can also block. Neither
  path is guaranteed hitch-free.
- The island/civic depth prepass admits only explicit supported static
  contributors. Depth variants must match colour-pass transforms, sidedness,
  alpha/procedural discard and live leaf↔bare state. Clear/write order preserves
  their depth for colour rendering; non-target visibility is not swapped.
- Fleet visual skips preserve authoritative simulation, picking, wakes/contact,
  camera and shadow contributors, and the exact pose on reentry. A hull that
  can cast into the live shadow camera is not skipped merely for being offscreen.
- The approved deferred life/identity trial may delay people, gulls and sea
  labels. Settled-pixel equivalence does not approve its arrival timing; both
  approved trials still need the operator's normal-motion filmstrip acceptance.
  See `src/harbour/app/README.md` and `TESTING.md`.


## Standalone API representation

Only PharosVille consumes these allowlisted routes. The Pages Function projects
successful JSON to the complete world **and** on-demand panel contract below;
the upstream analytical schemas are not the standalone response contract.
`shared/types/pharosville.ts` owns the standalone schemas (contract version 3).
Every `_meta` object is retained intact, including unavailable dependencies.
Nulls and missing readings are not filled, and no live stablecoin or chain is
filtered out. The existing active-ID safety-grade filter is unchanged.

| Endpoint | Retained fields |
|---|---|
| `/api/stablecoins` | Every `peggedAssets` row: `id`, `name`, `symbol`, `pegType`, `chains`, `circulating`, `circulatingPrevDay/Week/Month`, each `chainCirculating.*.current` |
| `/api/chains` | Every row's `id`, `name`, `totalUsd`, `healthScore`, `change24hPct`, `change7dPct`, `change30dPct`; top-level `globalChange24hPct`, `globalChange7dPct`, `globalChange30dPct` |
| `/api/stability-index?detail=true` | `current.score`, `band`, `avg24h`, `computedAt`, `methodologyVersion`, `inputDegradation.dewsUnavailable/depegEventsUnavailable`, root `methodology.version`; components `severity`, `breadth`, `stressBreadth`, `trend`; `history` retains the panel's last 30 finite-score rows sorted by ascending date, each `date`, `score`, and `methodologyVersion` |
| `/api/peg-summary` | Every coin's `id`, `currentDeviationBps`, `activeDepeg`, `pegScore`, and `pegReference.valueUsd/source/contributorCount`; coin `methodologyVersion`; root `methodology.asOf/version` |
| `/api/stress-signals` | Every signal ID and its `score`, `band`; top-level `updatedAt`, `methodology.version` |
| `/api/safety-grades` | Existing runtime-active rows, each `id`, `grade`; top-level `updatedAt`, `methodologyVersion` |
| `/api/mint-burn-flows` | Every hourly row's `hourTs`, `netFlowUsd`, `mintVolumeUsd`, `burnVolumeUsd`, `valuation`; `scope.chainIds`; every coin's `stablecoinId`, `mintVolume24hUsd`, `burnVolume24hUsd`, `netFlow24hUsd`, `netFlow7dUsd`, `coverage.status/has24hWindow/historyStartAt/isPartial`, `valuation.window24h.completeness/mintCompleteness/burnCompleteness`, `valuation.netFlow7d` |

Publication timestamps (`_meta`, `computedAt`, `methodology.asOf`, `updatedAt`) are kept so
`npm run smoke:live` can age-check every projected body. Deliberately dropped upstream extras
include stablecoin `price`; chains' `globalTotalUsd`, `unattributedTotalUsd`, row
`dominanceShare` and `healthBand`; stress signal `computedAt`; the rest of peg `methodology`; and
mint/burn `gauge`. These are not available to world/UI consumers; new uses must explicitly extend
the projector and standalone contract first.

Source age requires valid `_meta` or `X-Data-Age`; `Age` only adds CDN residence.
Warning 110 always marks a stale fallback, independently of source age.
Browser/edge cache lifetime is bounded by producer cadence (`cacheTtlSec`), separately from
analytical source tolerance and 24-hour last-good retention; stricter upstream policies survive.
The ETag is a SHA-256 digest of the serialized **projected** representation,
not the upstream ETag. GET `If-None-Match` supports weak/strong comparisons,
lists and `*`; a match returns bodyless 304 with the current freshness,
cache and security headers. The browser reuses its cached body; the feed does
not send manual validators or treat an exposed 304 as a JSON payload.
The edge stores full 200 responses even when the requesting browser gets 304.
Projection epoch `pv3` namespaces normal and last-good internal keys and ETags.
Old-epoch representations are ignored, never re-projected as a new contract.
The feed uses browser revalidation (`cache: "no-cache"`). A first post-cutover outage
may have no compatible last-good observation and is reported unavailable.
Last-good outage responses always send the full 200 body with `Warning: 110`,
`no-store` and their age, even when a browser validator matches, so stale
demotion never depends on browser-specific merging of 304 headers.

## On-demand panel readings

`shared/lib/pharosville-panel-endpoints.ts` is separate from the seven world endpoints;
`HarbourFeed`, `WORLD_ENDPOINT_KEYS` and `PHAROSVILLE_API_ENDPOINT_KEYS` do not change.
Only the admitted coin-panel slot (`ui/coin-readings`) may import `src/harbour/data/panel-fetch.ts`.
It makes an explicit same-origin GET when opened, with no prefetch or polling, and
the caller cancels on close, selection change or unmount. Blocked viewports never mount this slot.
`shared/types/pharosville-panels.ts` owns these narrow standalone schemas. Each projector
keeps `_meta`, nulls and absence without manufacturing readings.

| Reading / canonical path | Retained fields | Cache lifetime |
|---|---|---|
| Depeg events — `/api/depeg-events?stablecoin=<id>&limit=30` | `events[].{startedAt,endedAt,direction,peakDeviationBps,source}`, `total`, `methodology.version` | 900 s per id |
| Reserves — `/api/stablecoin-reserves/<id>` | `stablecoinId`, `mode`, `estimated`, `liveAt`, `reserves[].{name,pct,risk}`, `provenance.{evidenceClass,sourceModel,freshnessMode}`, `sync.{status,stale,lastSuccessAt}`, `displayUrl`, `evidenceUrls`, `metadata.sourceTimestamp` | 14,400 s per id (`sync-live-reserves`) |
| DEX liquidity — `/api/dex-liquidity` | Runtime-active id map; each row's `totalTvlUsd`, `effectiveTvlUsd`, `liquidityScore`, `coverageClass`, `coverageConfidence`, `liquidityEvidenceClass`, `hasMeasuredLiquidityEvidence`, `updatedAt`, `methodologyVersion` | 1,800 s, one map shared across coin selections |

Ids must be in `RUNTIME_ACTIVE_IDS`. Paths are compared exactly, including query order and
`limit=30`, with a 128-character ceiling. Extra/repeated/missing parameters, uppercase ids,
encoded characters/separators and trailing slashes return 404 before any upstream request.
Live-only ids outside the register return unavailable in the client without a request.
DEX rows outside the register are omitted; the fixture-fed budget test caps the projected map
at 30 KB gzip. No per-coin DEX endpoint is invented.

The panel proxy shares the world proxy's 8-second upstream deadline, security headers,
projected-byte ETags, `pv3` cache namespace and 24-hour last-good retention. Upstream 5xx or
transport failure can serve last-good with `Warning: 110` and `no-store`; 4xx remains 4xx.
Normal browser/edge and in-memory visit caches never exceed producer cadence; stricter
upstream HTTP policies survive. Warning-110 bodies are not stored in the visit cache.

`fetchPanelReading(key, id, signal)` returns `{state, reason, sourceUpdatedAtMs, data}`.
The states are `current`, `stale`, `unavailable`; an accepted payload with unknown age is
`unavailable` with reason `unverified-source` and its data retained, so the UI can disclose
“Freshness unverified” without describing it as current. No payload/HTTP failure/invalid
schema returns unavailable with null data. Source evidence uses the world fetcher's
`sourceFreshness` rules (`_meta` or `X-Data-Age`, plus CDN `Age`; Warning 110 always stale).
Depeg and liquidity retain the shared 12× stale threshold; liquidity additionally uses the
selected row's `updatedAt` conservatively. Cache hits re-evaluate age rather than freezing state.

Reserves use their own evidence: verified, non-estimated `live` composition with `liveAt`
(and an older `sync.lastSuccessAt`, when supplied) within eight hours is current;
`live-stale`, `sync.stale`, or older verified live data is stale. Curated/template and
unverified live evidence stay unverified, regardless of HTTP metadata. An unavailable mode
or empty composition stays unavailable. Labels for estimates remain the UI's responsibility.
Evidence URLs survive only if HTTPS without embedded credentials. Consumers label by hostname,
use the existing new-tab wording and `rel="noopener noreferrer"`, and fetch no previews/favicons.

## Approval and delivery

The reboot runs on `reboot/harbour` through the gates in the PLAN (§8).
Agents never push, open PRs, tag or release. Releases go through
`RELEASES.md` and the protected workflow; validation routing lives in
`TESTING.md`.

After a successful main-push Pages deployment, the workflow checks the production
origin's asset bytes, browser-native content decoding and immutable caching;
an asset-delivery mismatch fails the deploy job.

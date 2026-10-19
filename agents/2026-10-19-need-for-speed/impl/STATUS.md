# Need for Speed — implementation record

Recorded: 2026-10-19. Scope: `perf/need-for-speed`, `main..HEAD` (phase-1 commit
`15ce9766`, phase-2 commit `d829f950`) plus the integrated phase-3 working tree.
The research-time status at the top of `../PLAN.md` is historical; this record
maps its implementation dispositions without rewriting the original forecasts.

**“Shipped” below means retained in the branch's implementation, not published
or release-qualified.** v1.3.0 “Fair Wind” is a release declaration, not a tag,
GitHub Release or production deployment. Only `docs/pharosville/RELEASES.md`'s
protected workflow publishes it. Integrated measurements, operator acceptance
of the two trials and outstanding hardware/production checks are separate from
source completion. No validation or capture was run while writing this record.

## Disposition key

- **Shipped:** retained implementation/tooling, with acceptance limitations noted.
- **Rejected-with-evidence:** measured trial removed, or research evidence shows
  the proposed change is unnecessary/incorrect. It is not a booked saving.
- **Parked:** deliberately not implemented, conditional on evidence, or an
  acceptance/evidence deliverable not yet established. This is not a PASS.
- **Declined:** operator rejected the change; reopen only on explicit request.

Split IDs have a disposition for each branch. Every NFS-001–NFS-120 appears
below; additional PLAN review/spike findings follow the register mapping.

## Retained runtime implementation

Paths in this table are relative to the repository root. Existing focused test
files beside these implementations describe regression coverage, not proof that
all browser, motion or performance gates passed.

| PLAN item / register IDs | Disposition and retained behavior | File pointers |
|---|---|---|
| Lane A: NFS-001, NFS-006–008, NFS-011, NFS-044 | **Shipped.** Single-owner prepared plans, compact versioned seeds, persistent planning worker and content-addressed path reuse. Task-owned model/plan/pose installation; no synchronous frame fallback. Initial worker failure reveals an honestly unavailable boatless world; a later refresh can retry. Worker loss after install holds installed readings with real aging. | `src/harbour/sim/system.ts`, `src/harbour/sim/warm-legs.ts`, `src/harbour/sim/warm-legs.worker.ts`, `src/harbour/sim/seeds.ts`, `src/harbour/sim/plan-paths.ts`, `src/harbour/sim/sim.ts` |
| Lane E: NFS-003 | **Shipped.** Exact identity placement-loop reuse and bounds rejection; not a new placement-worker architecture. | `src/harbour/identity/labels.ts` |
| W1: NFS-004, ownership branch | **Shipped.** Ground-bake ownership/disposal follows its GPU consumers; reverse system teardown releases lights first. No offline-bake or steady-memory-saving claim. | `src/harbour/world/ground.ts`, `src/harbour/world/island-system.ts`, `src/harbour/lights/lights-system.ts`, `src/harbour/engine/engine.ts` |
| Lane E: NFS-005 | **Shipped.** Fused static geometry decode/merge, independent of the rejected boot scheduler. | `src/harbour/engine/static-merge.ts`, `src/harbour/civic/assemble.ts` |
| W1: NFS-012 | **Shipped.** Generate cloud-atlas mips after baking rather than repeatedly during it. | `src/harbour/sky/clouds.ts` |
| W1: NFS-014; Lane C: NFS-015–016, NFS-018 | **Shipped.** Compile against composer target/initial light state, cover post/private/shadow passes and stage uploads/preparation in bounded cancellable batches. Preserve live state across awaits. KHR-absent compilation can block; the 30 s deadline preserves an active partial batch with a warning and possible synchronous first-use completion rather than losing scenery. | `src/harbour/engine/engine.ts`, `src/harbour/engine/prepare.ts`, `src/harbour/engine/post.ts`, `src/harbour/lights/lights-system.ts` |
| W1: NFS-017 | **Shipped.** Right-sized/batched initial emblem placeholder atlas. | `src/harbour/fleet/emblems.ts` |
| Lane F: NFS-019, NFS-024 | **Shipped.** Complete consumer-contract API projection and validators over projected bytes. Stale last-good outage responses remain full 200 responses with honest warning/age evidence. | `functions/api/_project.ts`, `functions/api/[[path]].ts`, `shared/types/pharosville.ts`, `docs/pharosville/CONTRACTS.md` |
| Lane B: NFS-020–021, NFS-025 | **Shipped.** Browser-native Brotli transport, 49-kit/17-civic lossless packs, one hashed asset registry, immutable objects and exactly two retained releases. No JS Brotli inflater or lossy model change. | `scripts/harbour/build-asset-registry.mjs`, `scripts/harbour/retain-assets.mjs`, `scripts/harbour/check-asset-delivery.mjs`, `src/harbour/engine/asset-pack.ts`, `src/harbour/engine/assets.ts`, `public/_headers`, `docs/pharosville/OPERATIONS.md` |
| W1: NFS-026 | **Shipped.** Per-engine promise cache deduplicates JSON/manifest requests and parses across prefetch and consumers. | `src/harbour/engine/assets.ts`, `src/harbour/engine/prefetch.ts`, `src/harbour/fleet/hull-kit.ts`, `src/harbour/civic/civic-system.ts`, `src/harbour/civic/shipyard.ts`, `src/harbour/identity/identity-system.ts` |
| Lane F: NFS-027 | **Shipped.** Lossless WebP logo library; decoded pixels, not a new quality/codec compromise. | `public/logos/`, `src/harbour/fleet/emblems.ts` |
| Lane F: NFS-032–034 | **Shipped.** Lazy panels/search/ledger and full cemetery/prelaunch prose with eager exact scenery projections. Detail warmup starts at reveal; early interactions keep a non-empty loading surface and close controls. | `src/harbour/ui/App.tsx`, `src/harbour/ui/details.ts`, `src/harbour/ui/DetailFallback.tsx`, `src/harbour/ui/yard.ts`, `src/harbour/model/obituary.ts`, `scripts/vite/static-data-plugin.ts` |
| Lane F: NFS-052 | **Shipped.** React-free physical-screen AND viewport admission, inert preloads, useful denied welcome, stale-import cancellation and poster restoration on readmission. | `src/main.tsx`, `src/react-entry.tsx`, `src/client.tsx`, `src/harbour/app/poster.ts`, `index.html` |
| Lane A: NFS-053 | **Shipped.** Reveal compares prepared model revision/count with an actual FleetSystem `fleet-frame` report after composer completion; valid zero-boat data is explicitly ready. | `src/harbour/fleet/fleet-system.ts`, `src/harbour/engine/engine.ts`, `src/harbour/engine/types.ts`, `src/harbour/app/harbour-app.tsx` |
| Lane D: NFS-057 | **Shipped.** Skip only unobservable hull visual posing; use camera AND live shadow-camera contribution, retain authoritative sim/picking/wakes/contact and exact reentry pose. No reduced-rate simulation. | `src/harbour/fleet/visibility.ts`, `src/harbour/fleet/fleet-system.ts`, `src/harbour/fleet/visibility.test.ts` |
| W1: NFS-058 | **Shipped.** Stationary-camera sky-horizon geometry reuse. | `src/harbour/sky/sky-system.ts` |
| W1: NFS-059 | **Shipped, narrowly audited.** Freeze static local transforms for merged childless output meshes; do not freeze moving descendants or claim traversal elimination. | `src/harbour/engine/static-merge.ts`, `src/harbour/civic/assemble.ts` |
| Lane A: NFS-060 | **Shipped, phase contract corrected.** Reconcile by ID, but store the original model-order rig phase separately from allocation IDs so partial-model installs do not change motion. | `src/harbour/fleet/fleet-system.ts`, `src/harbour/fleet/reconcile.test.ts`, `impl/VX1-fleet-pixels.md` |
| Lane D: NFS-061 | **Shipped.** Shared frame projection context, cached measurements and read-before-write UI updates. | `src/harbour/ui/measurements.ts`, `src/harbour/ui/measurements.test.ts`, `src/harbour/app/README.md` |
| Lane D: NFS-062–063 | **NFS-062 shipped; NFS-063 reverted for arithmetic exactness.** Dirty/ranged fleet/fender uploads remain; mooring curves use main's JavaScript evaluation and final Float32 rounding, not prematurely rounded GLSL inputs. | `src/harbour/fleet/fleet-system.ts`, `src/harbour/fleet/mooring-lines.ts`, `src/harbour/fleet/uploads.test.ts`, `impl/VX1-fleet-pixels.md` |
| W1: NFS-064 | **Shipped.** Cache static worker/crest placements. | `src/harbour/civic/workers.ts`, `src/harbour/identity/crest-flags.ts` |
| W1: NFS-065–066 | **Shipped.** Hoist frame allocations and cache static walkway edges. | `src/harbour/civic/mint.ts`, `src/harbour/life/walkways.ts`, `src/harbour/season/season-system.ts`, `src/harbour/weather/director.ts`, `src/harbour/weather/weather-system.ts` |
| W1: NFS-067 | **Shipped.** Reuse held poses under reduced motion while continuing lookahead/freshness work. | `src/harbour/sim/system.ts` |
| W1: NFS-080–081, NFS-085, NFS-088 hoist branch | **Shipped.** Exact sky rejection/early exits, dead opposite beam-foot removal and uniform fog hoist. | `src/harbour/sky/sky-glsl.ts`, `src/harbour/beam/`, `src/harbour/readings/fog.ts`, `src/harbour/ocean/ocean-material.ts` |
| Lane D: NFS-086 exact-reuse branch | **Shipped.** Dirty reuse of sky reflection band with input invalidation; no reduced cadence. | `src/harbour/sky/sky-system.ts` |
| W1: NFS-087 | **Shipped.** Skip exactly zero-output daylight glow draws after initial-light fix. | `src/harbour/lights/lights-system.ts` |
| Lane C: NFS-097 controller branch | **Shipped.** One governor separates resolution from effect-tier choices; DPR-only changes skip preparation and tier changes publish atomically after preparation returns, including its explicit partial-batch timeout path. No sub-1 DPR floor. | `src/harbour/engine/governor.ts`, `src/harbour/engine/quality.ts`, `src/harbour/engine/engine.ts` |
| Lane D: NFS-098 ownership branch | **Reverted for pixel exactness.** Restore the combined canvas, original decode/upload and common mip chain, and original per-call sampling arithmetic. NFS-017 reservation/batching and cached metadata remain. | `src/harbour/fleet/emblems.ts`, `impl/VX1-fleet-pixels.md` |
| W1: NFS-099 | **Shipped.** Single-channel chart lettering with lossless WebP transport. | `src/harbour/identity/lettering.ts`, `public/harbour/chart-lettering.webp` |
| Lane G: NFS-101; W1: NFS-104 | **Shipped.** Explicit engine/service/listener/worker/cache/audio disposal and hidden-tab audio scheduling pause. Soak acceptance is distinct. | `src/harbour/engine/engine.ts`, `src/harbour/sim/system.ts`, `src/harbour/audio/controller.ts`, `src/harbour/audio/ambience.ts`, `src/harbour/audio/bank.ts` |
| Lane F analytics decision | **Shipped within app ownership.** Google Analytics starts after reveal's shell timer; denied welcome waits for a paint opportunity. CDN-injected scripts are outside this runtime's ownership; there is no app-owned Cloudflare beacon injector. | `src/harbour/app/harbour-app.tsx`, `src/harbour/app/README.md`, `src/main.tsx` |

## The two approved trials

| IDs | Disposition | Contract and pointers |
|---|---|---|
| NFS-055; REVIEW-LOAD-08 | **Shipped trial code; operator arrival acceptance still required.** | Pending-only 2000 ms hold starts at this mount's first composer-completed callback. The next eligible boatless frame reveals waiting copy, with no waiting fog or fixture fleet; successful-but-preparing data cannot use the deadline. Complete prepared boats arrive together. `src/harbour/app/harbour-app.tsx`, `src/harbour/app/reveal.test.ts`, `src/harbour/app/README.md`. |
| NFS-036 | **Shipped trial code; operator arrival acceptance still required.** | Deferred life then identity wrappers import in their original initialization slots. People, gulls and sea labels may appear later. Preparation supersession restores visibility and retries boundedly; genuine init failures remain explicit. `src/harbour/systems.ts`, `src/harbour/life/lazy-system.ts`, `src/harbour/identity/lazy-system.ts`, `src/harbour/engine/engine.ts`, `src/harbour/app/lazy-systems.test.ts`. |

## Measured rejections and evidence-based exclusions

| IDs / item | Disposition and evidence | Pointers |
|---|---|---|
| NFS-002, parallel prepare / ordered commit scheduler | **Rejected-with-evidence; prototype and scheduler-specific tests reverted.** Same-bundle interleaved A/B, n=3/config/arm: fast4g first fleet 4845.9 → 4864.7 ms (**+18.8 ms**); fast4g+CPU4 6182.2 → 6172.8 ms (**−9.4 ms**). Neither reaches the experiment's 50 ms useful-gain threshold. Serial boot remains. Its retained depth-prepass installation hook belongs to SP-FRAG-01, not this scheduler. | `outputs/need-for-speed/e3/comparison.json`, `outputs/need-for-speed/e3/base.json`, `src/harbour/engine/engine.ts` |
| NFS-075, spatial static batching | **Rejected-with-evidence; trial source removed.** Two targets became 74 chunks. Heart whole-GPU window means 36.185 → 35.861 ms (about 0.32 ms); overview p50 40.611 → 40.626 ms and p95 41.132 → 41.231 ms, 238 draws. No useful overview gain justifies extra chunks. | `outputs/need-for-speed/phase3/spatial-heart.json`, `outputs/need-for-speed/phase3/spatial-overview.json`, `src/harbour/world/island-system.ts` |
| NFS-075 snow prerequisite | **Rejected-with-evidence as a premise; dead branch removed.** `USE_BATCHING` was vertex-only, so the fragment-side 0.4 snow-cover branch never ran. Enabling it would change the actual full-cover hull appearance; preserve actual pixels, not the dead branch's apparent intent. | `src/harbour/world/materials.ts`, `agents/2026-10-19-need-for-speed/impl/review-p12.md` (historical review context) |
| NFS-115 | **Rejected-with-evidence / dropped as already correct.** Not an omitted implementation task. | `agents/2026-10-19-need-for-speed/PLAN.md` W0, `agents/2026-10-19-need-for-speed/p2/review-load.md` |
| Generic island simplification; SP-FRAG-04; SP-FRAG-07 | **Rejected-with-evidence.** Generic meshopt simplification yielded only 2.15%; PBR/PCF/single-sided kit changes failed goldens; ocean phase fusion showed no reliable win. Do not count knockout ceilings or those trials as shipped savings. | `agents/2026-10-19-need-for-speed/p2/sp-island.md`, `agents/2026-10-19-need-for-speed/p2/sp-frag.md`, `agents/2026-10-19-need-for-speed/PLAN.md` §6 |

## Parked / conditional runtime work

These retain the PLAN disposition unless the reason below records a deliberate
implementation-stage decision. The evidence pointers are research/decision
sources, not claims that a candidate implementation was benchmarked.

| IDs / item | Disposition and reason | Pointers |
|---|---|---|
| NFS-004 offline bake; NFS-009–010, NFS-013 | **Parked.** Offline ground bake, speculative sim caches and compile hints need measured audience-specific bottlenecks; ownership fix remains shipped. | `PLAN.md` §6, `p2/REGISTER.md` |
| NFS-028–029; REVIEW-LOAD-10 | **Parked together.** Yard logo/monogram/board and hull-stage producers can affect first-visible yard content. Do not remove one eager producer independently or silently defer scenery. | `src/harbour/engine/prefetch.ts`, `src/harbour/civic/shipyard.ts`, `p2/review-load.md` |
| NFS-035, NFS-037–038, NFS-040–043, NFS-045, NFS-047–051, NFS-056 | **Parked.** Conditional weather modules, early request/custom SWR, Early Hints/edge/polyfill/decoder/dictionary/service-worker/bfcache work, prop redesign and inline CSS remain out of this cutover. | `PLAN.md` §6, `p2/REGISTER.md`, `p2/review-load.md` |
| NFS-068–070, NFS-071 lower-query-frequency branch, NFS-072 | **Parked.** No lower-rate distant boats or speculative frame/governor changes; NFS-071's correctness/query-ring branch is shipped separately below. | `PLAN.md` §6, `p2/REGISTER.md`, `p2/review-runtime.md` |
| NFS-077, NFS-079, NFS-102 | **Parked / conditional.** Conditional depth-copy/NaN-scrub work has no demonstrated saving while beam/shimmer consume depth; NFS-102 is folded into that consumer audit. | `PLAN.md` Lane D and parked list, `p2/sp-igpu.md`, `src/harbour/engine/post.ts` |
| NFS-082–084 | **Parked / conditional.** Exact ocean work needs isolated pass evidence. Phase-fusion rejection does not mean NFS-083/084 themselves were measured and rejected. | `PLAN.md` Lane D, `p2/sp-frag.md`, `src/harbour/ocean/ocean-material.ts` |
| NFS-090–092, NFS-095–096 | **Parked.** Other shadow/sky/cloud proposals need a specific bottleneck; Low-floor shadow proxies and 30 Hz shadows are not part of this release. | `PLAN.md` §6, `p2/REGISTER.md`, `p2/review-runtime.md` |
| NFS-093–094, NFS-100; SP-FRAG-05 | **Parked, not yet put to the operator.** Backface/far-LOD/baked-spill and lower-resolution visual sea proposals need measured evidence and any required visual approval. | `PLAN.md` W3, `p2/sp-frag.md` |
| NFS-119–120 | **Parked.** No OffscreenCanvas worker renderer or three.js upgrade (r186 was already latest stable during research). | `PLAN.md` §6, `p2/REGISTER.md` |
| SP-FRAG-02, pattern-ID specialization | **Parked, not a measured rejection.** Census found 16 pattern IDs; splitting draws/program families has no proven gain. The approximately 5.3 ms knockout ceiling overlaps prepass work and is not an achievable additive saving. | `outputs/need-for-speed/glb/patterns.json`, `p2/sp-frag.md`, `src/harbour/world/materials.ts` |

## Operator-declined branches

All entries below are **declined**, not secretly traded for a target number.
The decision authority and detailed descriptions are `PLAN.md` §6/§8 and
`p2/REGISTER.md`.

| IDs | Declined change |
|---|---|
| NFS-022–023 | Lighter/lossy model encodings. |
| NFS-030–031; NFS-098 codec/ownership branches | Smaller/compressed sail-logo alternatives remain declined; the immutable/dynamic atlas split was reverted after deterministic pixel differences. |
| NFS-039 | Persisting last-good data between visits; always await fresh data. |
| NFS-054 | Faster poster fade; the existing 1100 ms crossfade stays. |
| NFS-073–074, NFS-076, NFS-078, NFS-088 half-resolution branch, NFS-089 | Half-resolution bloom and simpler sea/wake/AA/fog/beam alternatives. NFS-088's exact uniform hoist remains shipped. |
| NFS-086 cadence branch | Lower sky-reflection cadence; exact dirty reuse remains shipped. |
| NFS-097 sub-1 floor | Lower resolution on weak GPUs; controller separation remains shipped. |
| NFS-103 | 30 fps mode. |

## W0 tooling and integrated-gate dispositions

| IDs / item | Disposition | File / evidence pointers |
|---|---|---|
| NFS-046, NFS-110; REVIEW-LOAD-09 | **Shipped tooling.** Static first-frame dependency ledger, media budgets and preload audit; these are not CDN-wire measurements. | `scripts/perf/first-frame-bytes.mjs`, `scripts/perf/budgets.json`, `scripts/perf/README.md`, `.github/workflows/deploy-cloudflare.yml` |
| NFS-071 query-ring branch, NFS-105, NFS-114; RR-04 | **Shipped tooling.** Readiness failures, real elapsed pacing, bounded completed-query samples and trace/report plumbing. Lower query frequency remains parked. | `scripts/harbour/shot.mjs`, `src/harbour/engine/governor.ts`, `src/harbour/engine/gpu-passes.ts`, `scripts/perf/frame.mjs` |
| NFS-106; REVIEW-LOAD-02 | **Shipped tooling/contract.** First fleet-bearing rendered revision, crossfade and poster removal reported separately; no empty-frame speedup. | `src/harbour/engine/engine.ts`, `src/harbour/app/harbour-app.tsx`, `scripts/perf/load.mjs` |
| NFS-108, NFS-112 | **Shipped tooling, partial exercised evidence.** Production-faithful origin/cold-repeat harness and Pages delivery checker. E3 A/B and B1 preview fixtures are not the full integrated/live rollback matrix. | `scripts/perf/origin.mjs`, `scripts/perf/load.mjs`, `scripts/harbour/check-asset-delivery.mjs`, `scripts/harbour/verify-asset-registry.mjs`, `docs/pharosville/OPERATIONS.md` |
| NFS-111; REVIEW-LOAD-04 | **Shipped deterministic still/motion/diff tooling; eight corrected still pairs pass.** Final heart/overview × 12.5/22 h × summer/winter, calm, DPR1/Low comparisons are byte-identical. This is not the full weather/DPR/temporal acceptance matrix. | `scripts/perf/golden.mjs`, `scripts/perf/compare.mjs`, `outputs/need-for-speed/phase3/final-golden-diff/summary.json`, `docs/pharosville/TESTING.md` |
| NFS-116–117 | **Shipped tooling/policy.** Contention metadata, manual real-GPU lanes, CI-safe byte checks, GPU-unavailable SKIP (78), never fabricated PASS. | `scripts/perf/load.mjs`, `scripts/perf/frame.mjs`, `scripts/perf/README.md`, `docs/pharosville/TESTING.md` |
| NFS-118 | **Shipped harness + leak fix.** Soak found three r186's module-scope DFG LUT retaining every disposed renderer; engine teardown now releases it. Twenty-cycle mounted heap slope +110.9 KB → +21.4 KB/cycle, flattening to +9.4 KB/cycle (main: +7.6 MB/cycle with accumulating AudioContexts). No zero-slope guarantee. | `scripts/perf/soak.mjs`, `src/harbour/engine/engine.ts`, `impl/INTEGRATION-load.md` |
| NFS-107 | **Shipped.** `validate-deploy-gate.mjs` runs static bytes, then on a real GPU a cold fast4g n=3 load against `scripts/perf/baselines/branch-load.json` (first-fleet median ≤ baseline +15%); CI reports `SKIP_PERF_CI`, no GPU `SKIP_PERF_NO_GPU` — never PASS. | `scripts/pharosville/validate-deploy-gate.mjs`, `scripts/check-guards.test.mjs`, `docs/pharosville/TESTING.md` |
| NFS-109; RR-06 | **Partly done.** Main-vs-branch steady matrix on RTX + Raphael iGPU (DPR1/DPR2) measured (`impl/INTEGRATION-final.md`, `impl/INTEGRATION-confirm.md`). M5 Max native-DPR2 Safari/Chrome and thermal plateau are the operator's hands-on test after deploy. No typical-laptop claim. | `scripts/perf/frame.mjs`, `impl/INTEGRATION-*.md` |
| NFS-113 | **Shipped.** Persisted contended load baselines `scripts/perf/baselines/{main,branch}-load.json` (distributions; raw samples in `outputs/`). | `scripts/perf/baselines/`, `scripts/perf/load.mjs` |
| RR-08 | **Done via spikes.** Per-ingredient material probes ran in `sp-frag`; the integrated per-pass profiler (`?prof=gpu`) found the summer kit-shadow discard regression (3.5 → 16.4 ms) fixed in `world/materials.ts`. | `p2/sp-frag.md`, `impl/IGPU-total-fix.md` |
| Per-pass GPU profiler | **Shipped tooling.** `?prof=gpu` uses completed frame/state-tagged per-pass queries; competing governor query disabled, no nested elapsed queries. Timerless/disjoint paths remain honest. | `src/harbour/engine/gpu-passes.ts`, `src/harbour/engine/engine.ts`, `src/harbour/engine/governor.ts` |
| Integrated budget re-tightening | **Shipped.** Entry chunk cap 64/24 → 10/4 KiB, Harbour chunk 1,020/352 → 832/281 KiB (measured + ~10%); total JS cap kept (2,198 KiB measured, growth is lazy chunks); static first-frame byte budgets in `scripts/perf/budgets.json`, enforced in `npm run validate`. | `scripts/bundle-budgets.mjs`, `scripts/perf/budgets.json` |

## Additional PLAN findings

| Findings | Disposition / mapping | Pointers |
|---|---|---|
| RR-01, RR-02, RR-03 | **Shipped.** Retain bloom materials, compile against initial light state, prepare seasonal bare/leaf keys coherently. | `src/harbour/engine/post.ts`, `src/harbour/engine/engine.ts`, `src/harbour/engine/prepare.ts`, `src/harbour/world/materials.ts`, `src/harbour/season/season-system.ts` |
| RR-05 | **Shipped.** Skip resize fan-out when dimensions have not changed. | `src/harbour/engine/engine.ts`, `src/harbour/engine/post.ts` |
| RR-07 | **Shipped.** No clear before full-overwrite wake decay pass. | `src/harbour/ocean/wake.ts` |
| REVIEW-LOAD-01 | **Shipped.** Exact planar-delta sea transport/reconstruction, independent of any visual sea-resolution proposal. | `scripts/harbour/build-asset-registry.mjs`, `src/harbour/engine/assets.ts`, `scripts/harbour/verify-asset-registry.mjs` |
| REVIEW-LOAD-03 | **Shipped**, folded into NFS-014/RR-02, not a separate saving. | `src/harbour/engine/engine.ts`, `src/harbour/lights/lights-system.ts` |
| REVIEW-LOAD-05 | **Shipped.** Monotonic request/revision ownership prevents late results from overwriting fresher data. | `src/harbour/data/fetch.ts`, `src/harbour/sim/system.ts`, `src/harbour/sim/feed-precedence.test.ts` |
| REVIEW-LOAD-06–07 | **Shipped.** Poster restoration/readmission and shared physical-screen/viewport predicates guard inert preloads. | `src/main.tsx`, `src/harbour/app/poster.ts`, `src/harbour/app/admission.test.ts` |
| SP-FRAG-01 | **Shipped implementation, integrated acceptance separate.** Explicit supported static island/civic depth contributors, matching colour transforms/sidedness/seasonal discard, owned attach/remove/invalidation/disposal and depth clear/preserve order. No global visibility swaps. | `src/harbour/world/depth-prepass.ts`, `src/harbour/world/materials.ts`, `src/harbour/engine/post.ts`, `src/harbour/engine/engine.ts` |
| SP-FRAG-03 | **Shipped.** Dark-pool exact early return. | `src/harbour/world/materials.ts` |
| SP-FRAG-06 | **Shipped as Lane B evidence**, not a separate optimization or additive win. | `p2/sp-frag.md`, Lane B rows above |
| SP-HITCH-01–03 | **Shipped**, mapped to actual compile target/initial light state and bloom-material retention. | `src/harbour/engine/engine.ts`, `src/harbour/engine/post.ts`, `p2/sp-hitch.md` |
| SP-HITCH-04–05 | **Shipped preparation mechanism; no universal non-blocking claim.** KHR-absent driver work and partial-batch timeout completion can block; transition maxima need separate reporting. | `src/harbour/engine/prepare.ts`, `p2/sp-hitch.md` |
| SP-IGPU-01–02 | **Shipped profiler/exact sky mechanism**, not a release-qualified whole-device matrix. | `src/harbour/engine/gpu-passes.ts`, `src/harbour/sky/sky-glsl.ts`, `p2/sp-igpu.md` |
| SP-IGPU-03, SP-IGPU-06 | **Declined.** Half-bloom / DPR-0.75 downgrades. | `PLAN.md` W3, `p2/sp-igpu.md` |
| SP-IGPU-04 | **Parked**, with NFS-077/079: no demonstrated conditional depth-copy saving under current consumers. | `p2/sp-igpu.md`, `src/harbour/engine/post.ts` |
| SP-IGPU-05 | **Parked.** No separately proven optimization retained. | `p2/sp-igpu.md`, `PLAN.md` Lane D |

## Evidence boundary at handoff

The implementation preserves scenery/data meaning except the two explicitly
approved arrival trials. Their **trial approval is not acceptance of the final
arrival**. M1's corrected eight-pair still comparison is now complete:
`outputs/need-for-speed/phase3/final-golden-diff/summary.json` reports SSIM 1,
zero MAE/RMSE, zero maximum channel error and zero changed channels for every
heart/overview × 12.5/22 h × summer/winter pair, calm, 1600×1000, DPR1, Low.
Both arms use snapshot SHA-256
`173e0415cd161e08d1c8fe065c6320379bbe6ae0d1b4f1a960c37b89a0c30dee`.
M1 reports the real AMD Raphael GPU and reviewed contact sheets; no capture was
run by the documentation author. Both arms were recaptured after the harness
waited for fleet atlas decode and completed identity dressing/flags, so older
pre-fix failure artifacts are superseded for these eight pairs. A narrower
live-season summer→winter→summer comparison also reported zero changed
pixels/MAE and zero new programs in winter/return-summer first renders.
Neither result replaces the full view/weather/DPR and temporal matrix.

Remaining release-confidence evidence includes the quiet integrated
cold/repeat/cross-deploy/rollback load arms, first fleet/crossfade/removal metrics,
the remaining still matrix and normal-motion filmstrips, transitions with and
without KHR, timer-unavailable behavior, resource/soak plateaus, M5 Max native
retina checks, and live CDN/actual production rollback transport. B1's Pages
preview delivery and two-release fixtures are useful evidence, not proof of an
actual production rollback. The integration owner fills measured release figures
in `CHANGELOG.md` and mirrors them into the in-app notes; no forecast in PLAN is
promoted to a result here.

The subsequent uncapped GPU timing matrix is **not a complete accepted
eight-case result**. M1 reports a night/winter readiness timeout in
`outputs/need-for-speed/phase3/night-winter-readiness.json`: deferred life shader
preparation exceeded the 30 s deadline, with a similar symptom in the phase-2
baseline. The frame harness rejected the sample; no readiness bypass or
successful timing is claimed. Profiler/uncapped saturation is an unproven
hypothesis, not an established cause. This does not invalidate the separately
completed normal-profile, byte-identical eight-pair still comparison.

Preparation changed again during timing collection, so M1 stopped the baseline
origin and cancelled the in-flight overview capture. Partial
`accepted-*-overview-frame` artifacts are **not integrated evidence**.
The three clean heart pairs in `accepted-base-frame` / `accepted-after-frame`
precede that preparation fix and are contended single 6 s runs, not a
release-qualified timing result. Integration must remeasure the fixed source;
those historical samples do not fill the release's measurement comment.

E2's subsequent preparation fix gives timed-out idle callbacks the same bounded
4 ms budget as the timer path, races KHR completion against cancellation, and
warns once/retains a partial batch at the 30 s deadline so scenery is not
discarded. First-use compilation can consequently still occur. E2 reports two
capped Raphael readiness captures with no preparation errors/timeouts
(`outputs/need-for-speed/phase3/preparation-capped-readiness-1.json` and
`preparation-capped-readiness-2.json`); this is readiness evidence, not a
controlled frame-time speedup or completed replacement matrix. The earlier
uncapped timing rejection remains historical, not silently converted to PASS.

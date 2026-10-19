# PLAN executable-program audit

## Scope and method

Read-only senior-engineering audit of `../PLAN.md` at snapshot A9EE, focused on dependencies/ownership, scenery invariants, compatibility, forecasts, and executable fan-out. References below are relative to `agents/2026-10-19-need-for-speed/` unless prefixed `src/`. Read the brief, register entries, both adversarial reviews, fragment and hitch spikes, and actual engine, lights and material definitions. Two read-only scouts checked platform/transport and scenery/source contracts. No implementation, builds, captures, gates, tests, linters, or formatters were run. Existing measurement claims remain those of their cited authors; this audit did not reproduce them.

**Verdict:** one literal implementation instruction is a blocker: disposing the ground render target immediately after readback destroys a still-live texture. The prioritization is otherwise substantially sound, but advertised independent fan-out is not executable and the no-visual-change tranche needs stronger temporal/platform acceptance. Findings are ordered by severity; stable issue IDs are retained. Replacement blocks are proposed edits, not applied changes.

## B1. Blocker — W1 ground disposal destroys a still-live scenery input

**PLAN:** line 135 (“Own and dispose the ground-bake render target after CPU extraction”; “~20 MiB VRAM”).

**Failure mechanism / impact:** the render target's color texture is returned as `GroundService.texture` and still sampled by water-pillar lighting after CPU extraction. Disposing the target then invalidates the only GPU ground-height field; a surviving JavaScript Texture reference does not preserve its render-target contents. The purported memory-only safe win can change land masking/night lighting.

**Evidence:** `src/harbour/world/ground.ts:41,75–96` allocates/readbacks the target and returns `rt.texture`; `src/harbour/lights/lights-system.ts:168–173,197–202` binds and samples that texture to discard pillars over land. `p2/review-load.md:232` explicitly warns that readback completion does not authorize destroying this consumer's texture.

**Exact replacement for the W1 row:**

> | Memory | NFS-004 (ownership part) | Give the ground-bake target explicit ownership and dispose it only after all GPU consumers are torn down. If reclaiming the bake target during boot, first install an independently owned, exact height texture for every live consumer, preserving dimensions, row orientation, sampling and thresholds, then dispose the old target. | Teardown leak fix; steady/peak byte saving is conditional on the replacement's measured final allocation, not an unconditional ~20 MiB | `world/ground.ts`, `world/island-system.ts`, `lights/lights-system.ts`, ground-service type and lifecycle owner |

## 1. Major — shared writers and an incomplete dependency graph invalidate the parallel fan-out

**PLAN:** lines 91–102, 124–126, 130–141, and 237–245.

**Failure mechanism / impact:** §7 promises six W1 units, whereas the table names nine distinct units. They are not file-disjoint: GPU-init and shader work touch lights; Fetch, Frame CPU and Bundle touch civic; W1 Frame CPU and Lane A touch simulation. W2 A/C/D/E/G modify engine lifecycle/rendering; C and D modify post; F admission teardown depends on G and A reveal semantics. Mermaid omits actual boot-scheduling E and lifecycle G and calls the JS lane E instead of F. A future orchestrator can dispatch simultaneous edits with incompatible readiness, cancellation, material and asset lifetimes, even if merges are textually clean.

**Evidence:** `src/harbour/engine/engine.ts:87–104,123–165,199–225,266–288` places quality publication, boot/deferred compilation, render readiness, resize and disposal in one owner. `src/harbour/lights/lights-system.ts:295–336` places daylight glow and tier light visibility in the same system. `p2/sp-hitch.md:132–152` requires synchronous target restoration, preparation-owned materials and atomic light publication; `p2/review-runtime.md:129–137` enumerates ownership dependencies. SP-FRAG-03 itself is **not** principally a lights-system edit: `src/harbour/world/materials.ts:271–284` implements `hbPool`; this file is missing from W1's shader ownership list and also belongs to Lane D specialization/batching and Lane C seasonal keys.

**Exact replacement for §7 (and make the diagram express these same dependencies):**

> W0 has four deliverables: load/readiness/byte harness; completed-frame GPU/pacing harness; deterministic still-and-motion harness; persisted baselines/soak/CI policy. Each has a named owner before dispatch. W1 has nine table groups, not six, and groups sharing files are ordered below rather than declared independent.
>
> Assign one integration owner for `engine.ts`, `engine/types.ts`, `post.ts`, `quality.ts`/governor and lights quality publication. That owner lands W1 target/initial-light/bloom fixes first, owns the render-completed revision hook requested by A, and integrates C preparation, D prepass/depth-consumer changes, E scheduling and G teardown in that order of shared-interface dependencies. Other owners submit changes through the agreed interfaces, not concurrent edits to these files. Keep both normal and profiled frame paths coherent.
>
> Assign one material owner for `world/materials.ts` and seasonal color/depth contracts: W1 SP-FRAG-03 → C bare/leaf invalidation contract → D pattern specialization and batching. Move NFS-087 into the lights owner's queue after RR-02. Assign one civic/asset owner to serialize W1 NFS-026/033 and civic NFS-064 edits, then B demand-loading changes, then E decode/commit work. W1 NFS-067 precedes A's sim/system cutover. W1 NFS-017 precedes D's NFS-098. W1 ground disposal and G use one ownership contract; W1 NFS-104 uses G's cancellation seam rather than creating a second audio lifetime.
>
> After W0, A, B, D research/isolated implementation, F API/UI work, and G ownership implementation may proceed concurrently outside these shared files. C starts after W1 GPU-init and the material/lifecycle interfaces; E starts after A+B delivery and C's preparation interface. Final acceptance of F admission waits for A's reveal and G's teardown. No lane is marked complete before its cross-lane acceptance passes.
>
> Before dispatch, record ticket ID, owner, exact writable files, prerequisites, exported contract, and acceptance artifact. Split A into ownership/readiness → seeds → planning worker/slices → cache/reconciliation; B into registry/retention → GLB packs/transport → sea decode → demand/preloads; C into private-pass coverage → next-state ownership → seasonal/resize/governor; D into prepass → specialized materials/batching and fleet cull → dirty uploads/ropes, with conditional post work separately; E into scheduler, fused decode, identity loops; F into admission, UI split, API projection → validators; G into engine/service cancellation and audio/cache disposal. Use the acceptance contracts in §5 plus each ticket's specific invariants; no aggregate lane receives an undifferentiated “passes §5” sign-off.

## 2. Major — §5 cannot establish temporal and semantic equivalence for the actual W1/W2 changes

**PLAN:** lines 74–87, 138, 149–150, 159–160, 177–179, 191–196.

**Failure mechanism / impact:** the protocol's reduced-motion, zero-delta stills cover a broad visual state grid but not arrival, active motion, culling/reentry, failed/empty data, normal-motion ropes or lazy UI first use. Filmstrips are required only for explicit cadence/AA/LOD changes. Thus an implementation can pass the stated gate while revealing an empty world, popping in yard paint/people, freezing offscreen wake contributors, starving route lookahead under reduced-motion caching, or delaying first selection.

**Evidence:** `p2/review-load.md:111–119,140–143,151,172,176–177,194–200`; `p2/review-runtime.md:36,42,46,143`; `p2/sp-hitch.md:173–180`. In particular NFS-067 must preserve the independent lookahead drain even when pose results are cached (runtime review line 46), and NFS-053 requires a composer-completed revision, not a snapshot or populated instance count (load review line 141).

**Exact addition after §5.1:**

> Still equivalence is necessary, not sufficient. Every arrival, lazy-loading, culling, cache, rope, readiness or state-publication change also requires matched normal-motion filmstrips and semantic assertions for its affected path. Cover camera pan/zoom and offscreen reentry; offscreen shadow/wake/light/reflection contributions; moving close-up ropes; refresh and changed IDs; held-motion cache invalidation with continued lookahead/freshness bookkeeping; first selection/search/ledger; slow or failed imports; pending, failed and valid zero-boat data; admission denial/readmission. Compare initial and later yard/board/people/label visibility, not merely the final settled world. NFS-053 may reveal only after the committed model revision's complete fleet pose and dependent state have passed a composer render; valid zero-boat/error readiness is explicit, not `visibleBoats > 0`. Preserve the existing timeout origin and fade constants. If a scheduling change changes visible arrival or motion rather than eliminating redundant work, move that behavior to W3 for approval.

## 3. Major — NFS-036 is promoted against the load review, and NFS-028/029 lack an arrival-neutral boundary

**PLAN:** lines 159–160 and 193–194.

**Failure mechanism / impact:** life/identity already initialize late; delaying their *code* can move their visible arrival later still. W2 explicitly includes this in a no-visual-change tranche and the combined 60–85 KB claim. Similarly, “real demand” for yard content is not defined by panel interaction: boards and shipyard scenery may already be visible. Deferring both fetch producers proves byte scheduling, not identical scenery.

**Evidence:** `p2/REGISTER.md:64` marks NFS-036 marginal arrival risk; `p2/review-load.md:111–119,180,192` parks NFS-036 and requires yard appearance checks. `p2/review-load.md:52` gives a forecast sensitivity, not permission to count an unqualified split as achieved bytes.

**Exact replacement for the relevant Lane B/F sentences:**

> NFS-028+029 move requests only to the earliest lifecycle point that still prepares the same visible yard/board content before its first draw; remove both eager prefetch and eager buildYard demand together. Compare first-visible yard/board content and close/overview arrival under slow network/CPU. If the only saving requires later visible content, submit it to W3 rather than shipping it as exact.
>
> NFS-032/034 split panels/search/ledger and cemetery prose while keeping exact scenery projections eager and preserving first-action response; measure the resulting compressed initial graph. Park NFS-036 until an arrival filmstrip proves no later people/gulls/labels or the operator approves the temporal change. Do not book its 22–24 KB in the safe implementation result before that gate.

## 4. Major — depth prepass/material batching need a precise per-renderable contract, not the prototype's summer result

**PLAN:** lines 45–47, 174–179; §5.1.

**Failure mechanism / impact:** “include every renderable” can be misread as putting every renderable into the prepass, whereas the prototype needed discovery of every renderable in order to *exclude non-targets*. Generic opaque depth is incorrect for shader-discard foliage. Reusing shadow custom depth blindly also does not establish batching/world-position, sidedness, or main-pass parity. A winter endpoint still alone does not exercise the bare-class transition or live late additions. Spatial batching currently applies moving-hull snow semantics to all batched objects.

**Evidence:** `p2/sp-frag.md:93,97,126–127,141` limits the exact result to sampled summer heart pairs and records black sea artifacts from late non-targets. `src/harbour/world/materials.ts:419–421` uses `USE_BATCHING` to multiply snow cover by 0.4; `:610–637` implements leaf-discard depth with world-position inputs and an instancing transform. `p2/sp-hitch.md:123,142,156,177–180` requires real leaf/bare invalidation and depth coverage. `p2/review-runtime.md:59` requires separate main/shadow/ground frusta.

**Exact replacement for Lane D's prepass/batching wording:**

> SP-FRAG-01 is a production candidate with measured −5.6/−5.9 ms and byte-identical output only in the tested summer heart noon/night pairs, not a universal equivalence proof. Define an explicit target registry for static island+civic depth contributors; account for every renderable, but exclude non-targets. Each target's depth variant must match its color pass's vertex transforms (including batches/instances), sidedness, clipping and alpha/procedural discard, including live leaf↔bare transitions. Own late attach/remove, material invalidation, composer clear/depth order and disposal; never ship diagnostic global visibility swaps. Gate summer/winter plus threshold-crossing, snow/storm, all cameras/DPRs and normal motion, with CPU traversal included in total cost.
>
> Before NFS-075, replace `USE_BATCHING` as the snow-role discriminator with an explicit moving-hull semantic shared by color/depth preparation. Existing moving hulls retain their 0.4 cover; static batched scenery retains its original cover. Validate transforms, foliage discard and independent main/shadow/ground visibility; do not use the main-camera frustum to remove shadow or ground contributors.

## 5. Major — fleet culling is underspecified and must not become a hidden lower-rate simulation

**PLAN:** lines 177–178.

**Failure mechanism / impact:** a boat outside the camera can still cast an in-frame shadow, stamp a wake, or return onscreen with stale transforms. Culling pose/wave/rope work by screen visibility alone changes those outputs and can make ranged uploads retain stale rows. Do not invent an offscreen hull-mirror pass: the current ocean reflects the sky band/town pool, and riding-light streak creation is already visible-only. Preserve those existing semantics rather than expanding or deleting contributors.

**Evidence:** `p2/review-runtime.md:36,41–42,103,143` explicitly requires authoritative pose/picking/wake/light/shadow preservation and reentry; `p2/REGISTER.md:95,100` links visual cull to dirty ownership. Scenery scout source inspection found matrices updated before camera visibility (`src/harbour/fleet/fleet-system.ts:679–752`), wake/contact consumers at `:806–818`, visible-only riding lights at `:789–810`, and sky-band/town-pool reflections at `src/harbour/ocean/ocean-material.ts:258–288`; `p1/pipeline.md:116–119` records the absence of planar boat reflections.

**Exact replacement for the NFS-057→062 sentence:**

> NFS-057 may skip only proven unobservable visual work. Keep authoritative simulation/history/freshness and current transforms for camera/shadow contributors; preserve picking, existing wake/contact stamping, visible-only riding lights/reflection streaks and exact pose on reentry. Only then implement NFS-062 dirty rows against the same per-ID/per-consumer invalidation contract. Acceptance includes offscreen wake/shadow contributors and fast pan/zoom/reentry at normal motion. Profile actual savings; the offscreen boat census is not a saved-work fraction. Reduced-rate authoritative simulation or delayed visible refresh is not part of W2; it requires a separately approved W3 change.

## 6. Major — no-KHR shader preparation lacks an explicit acceptance branch

**PLAN:** lines 59, 164–171, 243–245.

**Failure mechanism / impact:** “prepare before publishing while the current tier keeps drawing” is not an implemented or universally available nonblocking completion guarantee. Without KHR, compile submission can still block on link/reflection; with KHR, polling live material `currentProgram` can await the wrong tier. Generic quiet measurements on the tested iGPU will not catch this. A universal ≤50 ms transition statement currently reads as part of the forecast although the complete fix was not prototyped.

**Evidence:** `src/harbour/engine/engine.ts:139–142` already distinguishes KHR availability; `p2/sp-hitch.md:119,148–152,166–179` states the no-KHR limitation, live-material race and required extension-less acceptance. `p2/review-runtime.md:144,157` retains the conditional proposal.

**Exact addition to Lane C:**

> Implement the preparation-owned material/state contract from sp-hitch §5, including immediate `finally` restoration of render target/cube face/mip, light visibility and object materials before any await. Poll only preparation-owned programs; cover private/post/shadow/late groups, and cancellation on superseding state, resize, season change and disposal. Test KHR-present and KHR-unavailable separately. Without KHR, compile submission is not proof of completion or nonblocking behavior: measure first-use reflection/link waits while the current scene runs, and retain a reported unresolved transition target if the portable implementation cannot satisfy it. Do not silently remove support, suppress diagnostics, freeze motion, or change quality to pass. Count total poster-to-fleet latency and retained/peak preparation memory.

## 7. Major — retina/shared-memory acceptance is present as a matrix label, not an executable resource gate

**PLAN:** lines 58–60, 84–85, 114, 118, 167–171, 198–205, 253–254.

**Failure mechanism / impact:** DPR2 is named but lacks a concrete resolution/effective-DPR/thermal policy or memory budget. A remount leak soak does not detect a large legitimate resident allocation or temporary old+new target/pack/worker/prewarm peak. Optimizations can pass the DPR1 GPU gate yet context-lose or thrash on a shared-memory laptop.

**Evidence:** `p2/review-runtime.md:95–99` estimates 834.37 MiB screen targets and 1059.37 MiB including High fixed targets at 2560×1440 CSS @2, before assets/CPU arrays/driver overhead, explicitly logical not resident bytes. `:121,142,149–159` requires thermal, effective-DPR and no-timer controls. `p2/review-load.md:163` requires candidate workers and retained pack buffers in the soak.

**Exact addition to §5.3 and W0 matrix:**

> Record CSS dimensions, display DPR, effective DPR, tier, browser/driver and thermal/battery state for every result. Run pinned DPR1/native DPR2 cost lanes plus a separate adaptive-governor transition lane and timer-unavailable lane on the supported laptop. Require a sustained thermal plateau, not only short windows. Inventory final logical render-target/texture/geometry/program bytes separately from observed memory and boot/resize/prewarm peaks; include old+new targets, pack/decode buffers, worker transfers/copies, canvases and retained preparation programs. Check context loss and post-disposal plateaus. Set device-specific accepted resource envelopes from W0 evidence and operator hardware policy before asserting the retina target; do not label logical byte counts measured resident VRAM.

## 8. Major — forecast table mixes supported estimates with unproven acceptance aspirations

**PLAN:** lines 49–60.

**Failure mechanism / impact:** the 4.7–5.2 s load forecast and 2.2–3.0 s repeat envelope have explicit model support. The ≤33 ms no-visual-change GPU column does not: the depth pass takes the sampled noon total from 44.33 to 38.77 ms, and the pattern knockout is a ceiling, not an additive remaining saving after early-z. The representative laptop and ≤50 ms transition values are policy goals, not evidence-based forecasts. The stretch poster cell also ambiguously mixes the unchanged-fade forecast with another 0.5 s fade reduction.

**Evidence:** `p2/review-load.md:48–64`; `p2/review-runtime.md:147–159`; `p2/sp-frag.md:84–95,126–127`. No combined exact tranche measurement demonstrates ≤33 ms. Patterns and prepass optimize overlapping fragment work.

**Exact replacement for the relevant table rows and note:**

> | Cold fast4g poster fully removed | 7.2 s | modeled ~6.2 s (5.85–6.45), unchanged 1.1 s fade | modeled 5.6–6.1 s with approved geometry, still 1.1 s fade; a separately approved 600 ms fade subtracts ~0.5 s from that range only |
> | Raphael iGPU, heart noon, DPR1 | ~45 ms | improvement goal p50≤33 ms, not forecast achieved by W1+W2 | improvement goal p50≤25 ms / p95≤33 ms; approval and combined measurement required |
> | Representative laptop iGPU, heart noon, DPR1 | unmeasured | proposed acceptance goal p50≤12 ms / p95≤16 ms, pending named hardware/thermal baseline | — |
> | Tier/weather/selection transitions | up to 4.4 s freeze | proposed acceptance: no unprepared program activation for covered states; no attributable visible transition task >50 ms, verified separately with/without KHR | — |
>
> Load ranges are modeled forecasts. GPU and transition numbers are proposed goals, not guaranteed outcomes of the exact tranche. Report residual gaps after the integrated measurement; do not add knockout ceilings to prepass savings or introduce an unapproved scenery change to meet a target.

## 10. Major — transport acceptance must distinguish native HTTP Brotli from JavaScript decompression

**PLAN:** lines 80–83, 154–158; §8.

**Failure mechanism / impact:** a local Brotli server or header check is not evidence that the production loader works on supported Firefox/Safari. Native HTTP Brotli decoding and JavaScript `DecompressionStream` codec support are separate. A cutover that simply changes the existing gzip JavaScript inflater to Brotli can fail despite correct browser HTTP support; a loader that inflates an already HTTP-decoded response can double-decode.

**Evidence:** `p2/sp-island.md:79–90` requires supported Chrome/Firefox/Safari, real headers, no double decode and memory gates; `p1/external.md:43–45` distinguishes HTTP Brotli support. Source inspection by the transport scout confirms `src/harbour/engine/assets.ts:8–10,20–22,50–63` currently uses JavaScript gzip decompression and a raw GLB fallback. `p2/review-load.md:103,204` says local transport does not prove Pages negotiation.

**Exact addition to Lane B acceptance:**

> On declared supported Chrome, Firefox and Safari versions, fetch the fingerprinted GLB packs and exact sea transport through the browser HTTP stack, including a browser without JavaScript Brotli `DecompressionStream` support. The HTTP-decoded path must not require JavaScript Brotli inflation or decompress twice. Verify encoding, MIME, validators/cache separation, decoded hashes, pack entry bounds and successful shipped-decoder parsing on Pages delivery, not only localhost. If negotiation is used, prove correct encoded/identity representation selection and cache variation; if explicit encoded URLs are used, document and test their header contract. Exercise only the fallback representations actually supported by that contract. Include sea reconstruction CPU/peak-memory and exact coast/channel equality.

## 11. Major — unchanged CSP and successful page render do not prove the worker cutover works

**PLAN:** lines 68, 145–150, 203–206, 219.

**Failure mechanism / impact:** the existing same-origin worker can fail and settle into a main-thread planning fallback. That could mask CSP/worker failures during rollout; removing the fallback without a proven worker path can instead strand readiness. Stock blob-worker loaders, especially a later KTX2 experiment, cannot be assumed compatible merely because WASM eval is allowed.

**Evidence:** transport scout source inspection: `src/harbour/sim/warm-legs.ts:30–56` constructs a same-origin module worker and settles on errors; `public/_headers:10` has `default-src 'self'` and no explicit `worker-src`. `p2/REGISTER.md:146,222` calls out blob-worker CSP for optional codecs. WASM permission is not worker-source permission.

**Exact addition to Lane A and W3 codec acceptance:**

> Under the exact production CSP and emitted worker URLs, prove worker startup, result delivery and adopted model/pose revision on every supported browser; collect worker errors/CSP violations and assert that a successful render did not silently take an obsolete main-thread compute fallback. Test worker cancellation/error/disposal without detaching the live coast buffer or publishing incomplete readiness. Keep same-origin workers under the current CSP; any optional decoder that assumes blob workers must use a compatible same-origin worker integration or remain blocked pending an explicit policy decision. Do not weaken script-src or treat wasm-unsafe-eval as worker authorization.

## 12. Major — fingerprint rollback is listed as a question but not a release invariant

**PLAN:** lines 155–157, 203–206, 251.

**Failure mechanism / impact:** a cross-deploy reload normally loads new HTML and new hashes. It does not exercise an old tab requesting its first lazy asset after deployment or a cached release shell after rollback. Immutable caching does not guarantee that a cold miss for an old hash remains available from the new production deployment.

**Evidence:** `p2/review-load.md:108,188,246` makes old-tab/rollback retention mandatory and explicitly says Pages caching is not permanent old-object retention. `p2/sp-island.md:82` requires prior hashed assets. Transport scout checked `docs/pharosville/OPERATIONS.md:51–66`: rollback selects a prior production deployment; preview deployments are not rollback targets.

**Exact replacement for §8.2 and addition to Lane B's release gate:**

> Decide and persist the immutable namespace, retention window and artifact publication strategy before shipping NFS-025. Retain every asset reachable by supported cached HTML/manifests/old tabs across that window, including lazy assets and shell CSS/fonts. In a two-release production-faithful fixture, deploy A→B, request a never-yet-fetched lazy A asset from an A tab, then exercise the supported rollback representation set and verify both supported releases' references resolve to their exact hashed bytes with correct MIME/encoding/cache headers. Do not assume preview promotion is a production rollback. Run live smoke after an actual production rollback; retention is an implementation/release condition, not an optional follow-up.

## 14. Major — welcome admission lists scenarios but not the required markup/poster outcomes

**PLAN:** lines 191–192; §5.

**Failure mechanism / impact:** zero React on denied viewports is useful, but the static entry and the current two React denial variants are not interchangeable. A bootstrap can pass “no world requests” while losing useful copy/links or leaving “Raising the harbour” forever. The named readmission scenario also has a concrete existing poster-restoration gap: dismiss removes its DOM; reset only removes a root attribute. Merely listing a test scenario does not define which owner restores arrival presentation.

**Evidence:** `p2/review-load.md:140,176–177,194–196`; scenery scout inspected `index.html:37–60`, `src/client.tsx:58–77`, `src/desktop-only-fallback.tsx:25–64` for the distinct markup; `src/harbour/app/poster.ts:12–26` removes the node without recreating it on reset. Main/React imports remain unconditional in `src/main.tsx:1–14`, so preload removal alone cannot provide the saving.

**Exact replacement for NFS-052 wording:**

> NFS-052 uses a tiny same-origin pre-React bootstrap, not zero JavaScript. Preserve the useful welcome heading/status, guide/links and both screen-incapable/window-too-small variants. Reuse sorted 720×600 physical-screen AND viewport predicates; admit React/client/world/API only when both pass, preserving desktop preload lead without leaking requests in physical-screen-denied/viewport-admitted or zoom cases. Failed imports leave an honest useful welcome and retain intended error reporting/analytics. The admission owner explicitly restores/remounts the arrival poster for denied→admitted→denied→readmitted and coordinates teardown with G and rendered readiness with A. Assert the same welcome content and coherent arrival presentation, not only network absence.

## 9. Minor — several low-value experiments are promoted while unresolved safe candidates have no disposition

**PLAN:** lines 218–231; W1/W2 tables.

**Failure mechanism / impact:** NFS-069, NFS-092 and NFS-096 are offered as W3 execution candidates despite the runtime review recommending parking on current evidence; NFS-095 belongs there for this Low-floor target unless High profiling changes the economics. NFS-059 and both branches of NFS-086 have no explicit disposition. This is not a missing demonstrated multi-millisecond win, but it undermines traceable triage and invites speculative work ahead of the real main-scene bottleneck.

**Evidence:** `p2/review-runtime.md:38,48,70,76,79–80,135,180`; `p2/REGISTER.md:97,129`. The exact sky reuse branch must not confuse a stationary camera with stationary weather/time.

**Exact replacement/addition to Parked:**

> Park NFS-069/092/096 and Low-floor NFS-095; reopen only with a measured audience-specific bottleneck, preserving W3 approval for any eventual temporal/visual change. NFS-059 is an optional small exact local-transform cleanup after profiling, never a recursive moving-descendant freeze or a claimed traversal elimination. NFS-086 exact dirty reuse is parked pending measured reuse with all time/weather/flash inputs; its lower-cadence branch remains an explicitly operator-approved visual experiment, not an exact W2 change.

## 13. Minor — §8 lacks gate-policy and supported-platform decisions needed to close the program

**PLAN:** lines 247–258.

**Failure mechanism / impact:** the list names hardware and retention but leaves who can accept missing/contended evidence, supported browser floors, and the behavior of first-action lazy UI unstated. An orchestrator cannot infer whether lack of laptop evidence is an accepted SKIP or release-blocking. Engineering mechanism choices need not become operator questions.

**Evidence:** `p2/REGISTER.md:222–224` lists platform, baseline/golden storage, quiet policy, hardware release policy and UI-loading behavior; `p2/review-load.md:115,152,161–163` preserves first-action responsiveness, SKIP≠PASS and qualified evidence; `p2/review-runtime.md:155–159` requires hardware qualification without silently weakening scenery.

**Exact addition to §8:**

> 7. Supported browser/OS floor and acceptance coverage: name Chrome/Firefox/Safari versions, no-KHR/no-timer paths and approved worker/codec policy under the unchanged CSP.
> 8. Gate policy: name release-blocking versus periodic hardware lanes, the quiet-slot owner, persisted baseline/golden location, and how unavailable hardware or contended evidence is recorded as SKIP rather than PASS. Set memory/thermal envelopes with the named hardware; do not silently raise limits.
> 9. Lazy interaction policy: preserve current first selection/search/ledger and welcome behavior; if additional visible waiting is proposed, approve its loading treatment explicitly before shipping it as a safe byte saving.

## Overall decisions and accepted prioritization

The major first moves are correct: trustworthy fleet-readiness metrics, wrong-target/initial-light/bloom ownership, simulation ownership, lossless delivery, and the measured main-scene prepass candidate. The plan correctly avoids booking a universal two-second simulation median win, correctly keeps RGB6/OCT8 and sub-DPR1 behind approval, and correctly declines to ship the ocean phase-fusion prototype on source-ALU intuition. NFS-053 is defensibly neutral only under completed rendered-revision proof; it is not equivalent to NFS-054/055. NFS-052 can preserve the welcome experience without React, but zero React is not zero bootstrap JavaScript and must not mean deleting the current denied-path content.

§8 should additionally settle supported browser/OS floors and extension-less acceptance, concrete old-deploy retention and rollback availability, hardware/resource/thermal envelopes, release-blocking versus periodic hardware gates and the quiet-evidence/SKIP policy, and first-action loading behavior for lazy UI. Engineering implementation choices (worker versus deterministic slices, exact cache keys, render-pass ownership) should be resolved in ticket contracts from the evidence rather than punted to the operator as aesthetic decisions.

## Verification actually performed

Document and source reads only. No executable verification or image inspection was performed by this audit. All empirical results above are attributed to existing reports, with their scope/limitations retained. Main should reconcile the proposed text, issue concrete owner/ticket contracts, and later run the specified implementation acceptance—not treat this audit as a passed runtime gate.

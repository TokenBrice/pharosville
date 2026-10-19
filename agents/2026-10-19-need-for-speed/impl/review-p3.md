# Independent review — Need for Speed phase 3 + review fixes (`d829f950..8ea6f27c`)

Read-only review of the single commit `8ea6f27c` ("static depth prepass, fused decode/merge, review fixes
(fleet-frame reveal evidence, worker-failure path, preparation deadline), v1.3.0 notes"), plus a re-check of
every blocker/major/minor in `review-p12.md`. Every claim cites file:line as read at `8ea6f27c` (working
tree identical to the commit for reviewed files). Library behaviour claims were checked against the pinned
deps (`three` r186, `postprocessing` 6.39.5 in `node_modules`), not assumed.

**Tests run (all green):** `CI=false npx vitest run` over `world/depth-prepass.test.ts`,
`engine/static-merge-fused.test.ts`, `engine/static-merge.test.ts`, `engine/prepare.test.ts`,
`engine/engine.test.ts`, `sim/system.test.ts`, `app/reveal.test.ts`, `fleet/visibility.test.ts`,
`fleet/reconcile.test.ts`, `sim/plan-paths.test.ts`, `ui/details-loading.test.tsx` → 11 files / 83 tests
passed; `functions/api/proxy.test.ts` → 83 passed.

## Verdict

No new blockers, no new majors in the runtime code. One **major from p12 (M2) remains unaddressed in this
range** (carried, see §Re-check). The phase-3 mechanisms (depth prepass, fused decode, preparation
deadline, fleet-frame reveal evidence, worker-failure terminal state) are implemented, wired correctly at
the pinned-library level, and covered by behavioural tests that assert the exact failure modes p12 found
missing. Remaining findings are minors/latent hazards with concrete repro conditions that are not reachable
with the shipped assets and closed data model today.

## Re-check of review-p12 findings

| p12 ID | Status | Evidence at `8ea6f27c` |
|---|---|---|
| **B1** worker failure before first install strands the poster | **Fixed** | `sim/system.ts:133-143` `workerUnavailable` sets `status.unavailable = installedPayloads === null` (service registered at init, line 77) + `console.warn`; `harbour-app.tsx:81-82` reveals the honest terminal `"unavailable"` stage when `boatless && (snapshot?.data === null \|\| simulation?.unavailable)`; recovery: `sim/system.ts:157-165` retries `restartWarm()` only on a *register* refresh (`stablecoins !== failedSnapshot`), never per optional arrival; the reveal keeps watching while unavailable (`harbour-app.tsx:63`) so a later successful prepare upgrades the copy to "live". Tests: `sim/system.test.ts:190-236` (failure surfaces honestly; recovery on refresh only), `app/reveal.test.ts:150-169` (poster reveals despite successful data; later live upgrade; listener retained). |
| **M1** material disposal during deferred init silently disposes life/identity | **Fixed (bounded form)** | `engine/engine.ts:229-244`: per-root retry loop, `DEFERRED_PREPARATION_ATTEMPTS = 3` (line 21); aborts retried, non-aborts rethrown to the outer catch which now *always logs* (`engine.ts:246-247` `if (!this.disposed && !this.aborted) console.error`) before dispose; after the last attempt it warns and **keeps the scenery** (`engine.ts:240-241`); visibility restore moved to `finally` (`engine.ts:253-254`). This is a bounded variant of the suggested "mirror the governor loop" — deliberate and safer than unbounded retry; the residual risk (scenery shown with unprepared shaders) is logged once. Tests: `engine.test.ts` "retries deferred preparation aborts…", "bounds repeated preparation aborts…", "logs real deferred errors…", "does not retry deferred preparation after teardown…". |
| **M2** island GLB preloaded `fetchpriority: "low"` | **Not addressed in this range — carried open** | `scripts/harbour/build-asset-registry.mjs:108` is byte-identical to `d829f950`; no A/B or decision recorded in `impl/STATUS.md`. The *intent* is documented in pre-NFS research (p1 `priorart.md` L4 "2.6 MB island must not hold back JS"; `edge.md:209` browser-verified "island Low"; NFS-046 audit "priorities already correct"), so this is a deliberate policy, not an accident — but p12's specific ask (re-measure against the *new* load model where packs/fused decode changed the frontier, or drop the override) is still owed at the integrated gate. Keep it on the integrated A/B list; do not count it as closed. |
| **M3** tautological "entire fleet drew" comparison | **Fixed** | `engine/engine.ts:346-349` `recordRendered` now reads the `fleet-frame` service (what FleetSystem actually posed) instead of copying readiness; `fleet/fleet-system.ts:1039-1042` publishes `{revision: modelRevision, boats: posed}` at the end of the fleet update that feeds the composer render; `harbour-app.tsx:74-76` compares that real evidence against readiness. Tests: `engine.test.ts` ("Desired readiness must not invent a posed boat", "does not turn installed readiness into render evidence without a posed fleet service"), `fleet/visibility.test.ts` "fleet-frame submission evidence" (publishes full pose on install, actual culled count after; no copy on pose-count mismatch/missing hull/upload throw). |
| Minor 1 — stale 304 demotion | **Fixed** | `functions/api/[[path]].ts:265,273` no longer wrap `staleLastGoodResponse` in `conditionalResponse`; CONTRACTS.md documents "always send the full 200 body". `proxy.test.ts` now covers fetch-error/5xx × strong/weak/list/wildcard validators, all expecting 200 + `Warning: 110` + no double Age. |
| Minor 2 — first-click blank panels | **Fixed** | `ui/DetailFallback.tsx` (real panel chrome, role=status loading copy, focus management, working close/Esc) wired as the Suspense fallback in `ui/App.tsx:90`; `preloadDetails()` moved from the 1200 ms shell timer to reveal time (`harbour-app.tsx:66`). Tests: `ui/details-loading.test.tsx`, `reveal.test.ts` ("Warm the first interaction immediately"). |
| Minor 3 — offscreen pose-skip inert under shadows | **Fixed** | `fleet/visibility.ts:26-31` `fleetShadowFrustum` refreshes the shadow camera from *this frame's* light fit (IslandSystem updates before FleetSystem in `systems.ts` order); `fleet-system.ts:880-882` gates on `mesh.castShadow && (!shadowFrustum \|\| shadowFrustum.intersectsSphere(...))` plus selected/hover/hi/wrecked/debug needsFullPose. Four new tests in `visibility.test.ts` including the "grazing the shadow box" sphere case. Allocation-checked: `LightShadow.updateMatrices` uses module temporaries and `getFrustum()` returns the cached `_frustum` (verified against r186), so this is per-frame allocation-free. |
| Minor 4 — registry rewrite drops sourcemaps | **Fixed** | `vite.config.ts:148-153` uses `MagicString` with `generateMap({ hires: true, includeContent: true })`. |
| Minor 5 — document dropped upstream extras | **Done** | `docs/pharosville/CONTRACTS.md` "Deliberately dropped upstream extras include…" paragraph. |
| Minor 6 — check-asset-delivery only manual | **Done** | `.github/workflows/deploy-cloudflare.yml` "Verify production immutable asset delivery" step runs the checker against the production origin after the Pages deployment. |
| Minor 7 — visibility restore in `finally` | **Done** | `engine.ts:253-254`. |
| Minor 8 — planKey time-independence assertion | **Done** | `sim/plan-paths.test.ts` "keeps planning identity independent of the model clock and freshness". |
| Process reminders (trials acceptance, integrated gates) | **Recorded as outstanding, not silently dropped** | `impl/STATUS.md` states the trials' operator acceptance and the full integrated measurement matrix remain open, and marks v1.3.0 as a declaration, not a release. Correct bookkeeping. |

## Focus-area findings

### Depth prepass (`world/depth-prepass.ts`, `engine/post.ts`, `world/materials.ts`)

Verified correct, with the wiring checked against the pinned postprocessing 6.39.5:

- **Admission is fail-closed** (`depth-prepass.ts:16-23`): single canonical `hb_kit` material only
  (`colour === this.materials.kit({side})`, and `apply()` always assigns the one cached DoubleSide instance,
  `materials.ts:829`), opaque/depthWrite/depthTest/LessEqual, no alpha hash/coverage/test, no
  map/alphaMap/displacement/wireframe/morph/skin/instanceColor, no `onBeforeRender` hook, no material
  arrays, no BatchedMesh. Windows/glass/emissive/ocean/actors are structurally excluded.
- **Pinned-library wiring is right**: `composer.addPass(pass, index)` exists in 6.39.5 (verified in the
  bundle), so `post.ts:222` really inserts the prepass at index 0 behind the seal-time system passes;
  `EffectComposer.render` passes `inputBuffer` first, `RenderPass.render` renders into `inputBuffer` with
  `clearPass.enabled` checked (`installDepthPrepass`, `post.ts:214`) — the prepass fills the composer's own
  depth attachment (`depth-prepass.ts:104-109`) and the colour pass retains it. Composer `multisampling`
  is 0 and stencil false, so `renderer.clear(true, true, true)` is well-defined. Production never sets
  `scene.background` (grep: only the dev `fallbackSea` path), so three's color-background force-clear
  cannot wipe the prepass depth in production. (Dev-only note below.)
- **Late attach/remove** (`sync`, `depth-prepass.ts:56-79`): proxies stay invisible until the source's
  parent chain reaches the world; first attach latches `entry.attached`, and any later detach removes the
  proxy *before* the prepass renders (sync runs first in `render()`), so a source disposed by a merge can
  never be drawn from the registry. `replaceStaticDepth` (`:87-91`) transfers ownership on civic merges;
  `mergeStaticMeshes` users (island) instead rely on sync's detach-remove, which fires before the next
  prepass render. Covered by `depth-prepass.test.ts`.
- **Disposal** is idempotent and ordered safely: `materials.dispose()` (`materials.ts:849-853`) disposes the
  registry (proxy materials) and the cached templates; `PostChain.dispose` → `StaticDepthPass.dispose` →
  `registry.dispose()` again is a no-op; engine dispose order (systems reverse → materials → post) never
  touches a disposed proxy material's program after the renderer is gone.
- **Seasonal discard** (`kitDepth`, `materials.ts:637-675`): the prepass twin compiles the same
  `HB_BARE` define/threshold (`:646`, discard at `:663-670`) from the same `uFoliage/uSeasonPhase` shared
  uniform objects (clone keeps `onBeforeCompile`/`customProgramCacheKey` from the template, which close over
  the live uniforms — `depth-prepass.ts:24-27`), and `invalidateSeason` bumps every proxy clone
  (`materials.ts:518-531`, `depth-prepass.ts:81`) so the leaf↔bare program swap happens coherently with the
  colour material. Test asserts version bump + cache-key change and return.
- **Exclusions for batched/instanced**: BatchedMesh rejected (`:17`); instanced proxies share
  `instanceMatrix` by reference (static-only assumption) and instanceColor'd instancing is rejected (`:23`).

Minor / latent notes (none reachable as a pixel bug today):

1. **A removed-then-re-attached source never regains prepass coverage** — `depth-prepass.ts:64` deletes the
   contributor on detach and nothing re-runs `add()` on re-attach. Fail-closed (the colour pass still writes
   depth; only early-Z coverage is lost). No current system detaches/reattaches static kit meshes; civic
   merges go through `replaceStaticDepth`. *Fix if ever needed: keep the contributor and reset
   `entry.attached` instead of removing on transient detach.*
2. **Dev-only: the fallback sea's `scene.background` colour force-clears depth inside RenderPass** —
   `world/island-system.ts:74` sets a Color background on the no-ocean dev path; three's WebGLBackground
   sets `forceClear` for colour backgrounds and clears color+depth, discarding that frame's prepass. Output
   is still correct (the scene renders with fresh depth); only the dev stand-in wastes the prepass. Not
   worth code; noting so nobody "fixes" the prepass chasing it.

### Fused decode/merge (`engine/static-merge.ts`, `civic/assemble.ts`, `world/materials.ts`)

Verified equivalent to the eager reference path, including the tricky parts:

- `deferPatternDecode` (`static-merge.ts:5-12`) stashes the full local matrix and zeroes the node;
  `decodeMeshAttribute` (`:21-31`) applies the stashed local first (float32 arithmetic identical to
  `dequantizeForPatterns`) and then the parent-chain `matrixWorld` via a subarray view — bit-for-bit the
  two-step the old pipeline performed. `dequantizeForPatterns` (`materials.ts:917-939`) consumes a leftover
  stashed transform via `takePatternTransform`, so singleton/unmerged deferred meshes materialize correctly
  (`island-system.ts:54`, `assemble.ts` `!filter(m)` branch). The deferral gate (`materials.ts:822`) only
  defers single-use, tangent-free, single-material kit meshes, with a `uses` map preventing mixed
  eager/deferred mutation of one shared geometry (`:812-817`).
- `mergeInto`'s copy branch was correctly hardened this range (`static-merge.ts:177` also requires
  `!patternTransforms.has(m)`), so a deferred mesh's float32 *normals* can no longer be copied un-baked.
  Winding is flipped for mirrored sources (`determinant() < 0`), bounds are computed from the always-float
  decoded positions, and index width switches at 65536. `static-merge-fused.test.ts` asserts exact
  attribute/index/bounds equality against `dequantizeForPatterns` + `worldGeometry` + `mergeGeometries`
  for both the island and civic paths, plus the materialize-on-exclusion path.

Latent (pre-existing classification, unchanged this range, not reachable with shipped assets):

3. **`mergeInto` classifies only `position`/`normal` as transform-touched** (`static-merge.ts:174`): in the
   copy branch (`:177`) `kind === null` attributes are copied as stored even when `mats[i]` is non-null,
   while `decodeMeshAttribute` (`:22`) treats `hbWinC` as a point. So `hbWinC` would be transformed in the
   decode branch but not the copy branch, and `tangent` is never transformed at all (three's
   `applyMatrix4` transforms tangents; `dequantizeForPatterns:933` does too). Unreachable today: window
   meshes (the only `hbWinC` carriers) merge exclusively through civic `mergeStatic`, which always decodes
   via `decodeMeshAttribute` (`assemble.ts:143`); deferred meshes exclude tangents by gate; no merged
   material consumes tangents (no normal maps in the port). *Fix if window geometries ever route through
   `mergeStaticMeshes`: compute `kind` for `hbWinC` and tangents in `mergeInto` too.*

### Preparation deadline (`engine/prepare.ts`, `engine.ts` initLater / boot loop)

- 30 s deadline (`prepare.ts:208`) cancels the controller; the catch (`:270-279`) returns the still-active
  batch instead of disposing it — submitted program references stay alive for the first real draw — and
  warns exactly once per `ProgramPreparation` (`timeoutWarned`, `:65`). `prepareGroup`/`prepareWorld`/
  boot/initLater/governor callers therefore *settle* rather than aborting scenery; the previously observed
  night/winter deferred-life readiness hang path now degrades honestly. `onAbort` (`:209`) still disposes
  clones on genuine supersession, so the timeout path leaks nothing until the holder's normal release.
- Saturated-idle bound (`:95`): `didTimeout` idle callbacks grant the same 4 ms slice as the timer path —
  the exhaustive-100 ms-per-material failure mode p12-era profiling implied is closed
  (`prepare.test.ts` "makes bounded progress when saturated idle callbacks arrive with no remaining time").
- `compileAsync` completion is raced against cancellation (`:254`), so an unresolved driver promise cannot
  bypass the deadline or hold a disposed group hostage.
- initLater now retries preparation aborts (3×), warns and keeps scenery, restores visibility in `finally`,
  and logs real errors before disposing (`engine.ts:229-254`) — the M1 fix, with tests for every branch
  including teardown mid-abort.

### Fleet-frame / reveal (`fleet/fleet-system.ts`, `fleet/visibility.ts`, `app/harbour-app.tsx`)

The ordering contract behind NFS-053 is now real evidence: DataSystem publishes model+readiness in a task;
FleetSystem's update installs the model, captures `readiness.revision` at install (`fleet-system.ts:464`),
poses every boat while `needsFullPose` (`:880`, `:885`), publishes `fleet-frame` at the end of the update
(`:1040-1042`); the engine copies it after `composer.render()` (`engine.ts:346-349`) and the reveal compares
against readiness (`harbour-app.tsx:74-76`). A readiness mutation alone, a not-yet-posed new revision, a
pose-count mismatch, or an upload failure all fail the comparison (tested).

**The specific question — can a boat that cannot be posed strand the poster forever?** Answer: **not with
the shipped data model and assets; yes in principle if the kit manifest ever regresses.** Chain: a boat
without a kit hull is dropped by `reconcileBoat` (`fleet-system.ts:492`), so `posed ≤ this.boats.length <
readiness.boats` forever, `needsFullPose` never clears (`:1039`), `rendered.boats !== readiness.boats`
holds every frame, and neither fallback branch applies because `boatless` requires
`model.boats.length === 0` (`harbour-app.tsx:80`) — the poster would crossfade never, silently. Reachability
today: `rigFor` (`model/classify.ts:31-38`) maps *every* `pegType` into the five indexed families;
`hullClassFor` covers the full supply ladder; `pickVariant` (`fleet/variants.ts:24-38`) falls back to
family → other → usd → any usd variant, and the shipped manifest has usd hulls in all six classes (verified:
`public/harbour/kit/manifest.json`, 22 hulls, usd×6 classes); a manifest hull whose GLB fails to load makes
`loadKit` reject (`hull-kit.ts:331-347` — only the optional `.lod` has a catch), which fails
`FleetSystem.init` → `engine.init` → the honest `"failed"` boot stage. So the strand requires editing the
manifest to drop the usd family — a silent failure mode for a future asset regression.

4. **Minor (latent hardening)** — the reveal has no terminal state for "prepared model with boats the fleet
   can never fully pose", and `needsFullPose` stays on permanently in that case (every frame poses
   everything — a silent perf loss too). *Fix: make readiness count only installable boats (or have
   `fleet-frame` report `matched` separately), or add a watchdog in `harbour-app.tsx` that reveals honest
   copy when `readiness.prepared && rendered.boats < readiness.boats` persists past a deadline.*
5. **Minor (latent, unreachable)** — if `DataSystem.init` ever takes its "no layout service" early return
   (`sim/system.ts:79`), the `model` service is never registered, so `model?.hasFleet` is undefined and no
   reveal branch can fire. LayoutSystem initializes before DataSystem and its own failure already fails
   boot, so this cannot trigger without a systems-order regression; one line of hardening (register the
   empty model before the early return) would close it.

### Worker-failure path (`sim/system.ts`)

- `workerUnavailable` (`:133-143`) is the single funnel for warm-start errors and `warm.prepare` rejections
  (the old duplicated catch logic is gone); it is idempotent per failure (`workerFailed` guard), captures
  `failedSnapshot`, sets `status.unavailable` only when nothing was installed, and re-queues preparation.
- Failure before first install: prepare's early return (`:157-165`) clears `dirty`, never plans on the main
  thread, and restarts the worker only when the *stablecoins* snapshot object changes (register refresh) —
  optional arrivals cannot busy-retry (tested, including `failed.stop` accounting).
- Failure after install: playback of `installedPayloads` with real aging, `status.unavailable = false`,
  stable `planKey` (now test-pinned as clock-independent). The comment trail (`warm-legs.ts:12-14`)
  honestly documents "no failure authorizes animation-frame fallback".

## Test quality (summary)

The new/changed tests are behavioural and target exactly the gaps p12 called out: worker-failure boot and
recovery (`system.test.ts:190-236`), deferred-init abort bounding/teardown/visibility (`engine.test.ts`),
preparation deadline and saturated idle (`prepare.test.ts`), fleet-frame submission evidence incl. failure
modes (`visibility.test.ts`), reveal stage machine incl. readmission (`reveal.test.ts`), fused-decode bit
equivalence (`static-merge-fused.test.ts`), prepass admission/season/merge/dispose (`depth-prepass.test.ts`),
stale-200 matrix (`proxy.test.ts`). Weak spots: `visibility.test.ts`/`reconcile.test.ts` still reach into
privates via harness interfaces (acceptable, documented); no test constructs the missing-usd-family manifest
regression (finding 4 above) — a kit-fixture test asserting `pickVariant` non-null for all five families ×
six classes against the shipped manifest would pin the assumption the reveal now leans on.

## Bottom line for the integration owner

Runtime code at `8ea6f27c` is fit to proceed to the integrated gates. Carry forward: **M2 (island
`fetchpriority: low`)** as an explicit item on the quiet interleaved A/B (decision or drop), and optionally
the two latent hardening minors (4, 5) which are one-line-ish guards against future asset/manifest
regressions, not current defects.

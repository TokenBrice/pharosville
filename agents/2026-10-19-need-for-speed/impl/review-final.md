# Independent review — final pre-release (`8ea6f27c..b295b830`)

Read-only review of the last four commits on `perf/need-for-speed` @ b295b830 (working tree verified
identical to the commit except one file, see Blocker 1). Scope: tier-change fixed light slots + SMAA
residency, reveal watchdog + sim unavailable paths, depth-prepass reattach, merge tangent
classification, DFG LUT teardown, deploy perf tripwire, fleet parity restoration (NFS-063/NFS-098
reverts), kit shadow discard gating, dead code from the reverts, test quality, docs.

Verification run: `npx vitest run` on the 14 touched suites (reveal, engine, post, prepare, governor,
static-merge, static-merge-fused, lights-system, sim/system, depth-prepass, emblems, fleet-material,
mooring-lines, reconcile) — **108/108 pass**; `node scripts/check-guards.test.mjs` — **pass**.

## Verdict

No runtime-source blocker. One tooling blocker (the branch's own pixel-parity lane is broken as
committed), one docs/contract major, four minors. The reverts are clean: no split-atlas, GPU-rope or
`lightPreparation` stragglers survive in `src/`, and STATUS.md/ARCHITECTURE.md now describe the
reverted state accurately.

## Blockers

1. **`scripts/perf/golden.mjs:149-151,178` (at b295b830) still probes the removed split atlas on the
   branch path.** `legacy = !services.get("readiness")` is false on the branch, so the capture takes
   `fleet.atlas.logoTexture` / `fleet.atlas.logoCount.value` — both deleted from `EmblemAtlas` by the
   same commit's NFS-098 revert — and throws `TypeError` reading `.value` of `undefined`. `npm run
   perf:golden` (the branch-vs-main parity lane this release's evidence rests on) cannot run at all
   at the reviewed commit. Note: an **uncommitted** working-tree fix appeared mid-review
   (` M scripts/perf/golden.mjs`, mtime 20:12, peer-owned — I did not touch it) that rewrites the
   block to a uniform combined-canvas check (`fleet.atlas.texture` + `getContext` detection + fresh
   decode tile comparison, `logoVerified: true`); that rewrite is correct and must be committed
   before release. INTEGRATION-final.md §"golden" describes the committed (broken) legacy-split
   shape and should be re-worded once the fix lands.

## Majors

1. **Docs still promise "never a partial fleet" after the reveal watchdog shipped.**
   `harbour-app.tsx:18,91-104` reveals a prepared-but-never-completing fleet as a new `partial`
   stage after `FLEET_WAIT_MS` = 3 s ("some boats could not be displayed"), but
   `docs/pharosville/CONTRACTS.md:29-37` (unchanged in range) and `CHANGELOG.md:17` ("once ready, the
   boats arrive together, never as a partial fleet") both still state the opposite. The watchdog is
   the right liveness fix (it closes review-p3 Minor 4), but the contract paragraph and the v1.3.0
   bullet need the 3 s incomplete-fleet fallback recorded.

## Correctness findings (verified against three r186 / postprocessing 6.39.5 sources)

- **Fixed light slots** (`lights/lights-system.ts:13-31,222-249,336,355-380`): three collects lights
  by `visible`/layers only (`WebGLRenderer.js:1410-1412,1880-1882`) and zeroes colour via
  `intensity` (`WebGLLights.js` `color.copy(light.color).multiplyScalar(light.intensity)`), so
  keeping all 16 `PointLight`s visible with `intensity 0` pins `NUM_POINT_LIGHTS` at 16 for every
  tier; the patched `lights_fragment_begin` skip (`pointLight.color != vec3(0.0)` + `directLight.visible`)
  makes dark slots contribute exactly zero. `applyQuality` zeroes `intensity` **and** `userData.base`
  synchronously, so a render between publication and the next `update` cannot draw stale promoted
  light (asserted by the new test). Day path stays `base * glow = 0` (`update` line 336). Removed
  `lightPreparation` service has no remaining references.
- **SMAA residency** (`engine/post.ts:238-278`, `engine/engine.ts:333-366,425-428`,
  `engine/prepare.ts`): postprocessing presets differ only through `defines`
  (`SMAAEffect.applyPreset` → `orthogonalSearchSteps`/`DISABLE_DIAGONAL_DETECTION`/… setters), and
  three's program cache key always includes `defines` (`WebGLPrograms.js:417-425`) independent of
  the pinned `customProgramCacheKey` (postprocessing overrides neither `customProgramCacheKey` nor
  carries preset state there — verified by grep). So the prepared clones compile exactly the
  programs the live SMAA materials acquire after `applyPreset`, with live defines never mutated
  during await (clones via `preparationMaterial`). Retention in `qualityPrograms` until teardown is
  required and sufficient: `adopt()`/`prepareSeason` dispose only `current`/`held` world batches.
  Bloom `levels` swaps render targets only (no defines → no recompile), shadow-map size is
  target-only: the "tier changes create no new programs" claim holds. `warmQuality` runs once after
  the first fleet frame; per-tier promise cache with abort-retry; late completion after dispose is
  released (tested). Governor's `setPreparation` `signal` param is now ignored by the only registrant
  (see Minor 2).
- **Reveal watchdog + no-layout terminal model** (`app/harbour-app.tsx:63-114`,
  `sim/system.ts:80-86`): timer resets on revision change; `partial` reveal stops watching (poster
  gone, honest copy, one `console.warn`); the boatless/unavailable and 2 s pending lanes are
  unchanged. The no-layout early return now publishes an empty terminal model
  (`buildHarbourModel({}, now)` → `boats: []`, `hasFleet: false` — valid per `model/build.ts:66-68`)
  plus `status.unavailable`, so reveal resolves via the unavailable branch instead of stranding
  (closes review-p3 Minor 5; tested in `sim/system.test.ts` and `reveal.test.ts:191`).
- **Depth-prepass reattach** (`world/depth-prepass.ts:56-79`): registration now survives transient
  detaches; `proxy.visible` recomputed per sync; permanent removal still flows through
  `replaceStaticDepth`/`registry.remove`/`dispose`. Detach/reattach/remove covered by new tests.
  Residual nit: `attached` became write-only (Minor 1).
- **Merge transform classification** (`engine/static-merge.ts:20-21,24-35,125-160,188`): tangent
  handling matches `BufferGeometry.applyMatrix4` semantics — xyz through the matrix, renormalise with
  `|| 1` zero-guard, `w` handedness preserved; both the fused (`static-merge-fused.test.ts:45-55`)
  and mixed-storage (`static-merge.test.ts:139-166`) tests compare against an eager reference.
- **DFG LUT teardown** (`engine/engine.ts:425-448`): three r186 owns a module-singleton
  `DataTexture` (`DFGLUTData.js:31-49`) assigned into every physical material's uniforms
  (`WebGLRenderer.js:2743-2745`). The teardown reads the actual uniform (avoiding a second singleton
  via `three/src`), traverses before system/renderer disposal while `properties` still hold the
  uniforms, and disposes once; remount is safe because each renderer's dispose listener removes
  itself and a fresh renderer re-uploads from per-renderer properties. The new test drives three
  remount cycles and asserts the listener count returns to zero.
- **Kit shadow discard gating** (`world/materials.ts:634-668`): both depth twins now compile the
  leaf-discard only under `HB_BARE` (`leafFallAt > 0.001`), matching where the legacy shadow ever
  discarded (dynamic `hbLeafFall()` is 0 in summer, so the no-define program is pixel-identical and
  skips noise/discard — the measured iGPU 16→4 ms). Cache key bumped v2→v3; runtime season crossing
  stays correct through `staticDepth.invalidate()`/`needsUpdate` recompiles. Docs
  (ARCHITECTURE.md:136-139) match the code.
- **Fleet parity restoration**: `mooring-lines.ts` is byte-identical to main (`git diff b71dd282
  b295b830` empty); its test now asserts exact `Math.fround` CPU parabola endpoints. Emblems are back
  on main's single combined canvas with the same decode options
  (`createImageBitmap(..., { premultiplyAlpha: "none" })`), same `drawImage(img, 0, 0)` + bounded
  `clearRect`, same placeholder/monogram/failure semantics; growth reserves main's final size once
  (grid/mip chain equal at steady state, and slot UVs are row-count-invariant). Rig phase is stored
  in the previously unused deck-alpha channel (`fleet-system.ts:434-441`, paint offset `inst*20+11`
  = texel 2.w) equal to the installed-live ordinal main's `float(idx)` used, refreshed on every
  install **after** `writePaint` zeroes the span, and read by both colour and depth shaders
  (`fleet-material.ts:131,141,197` + `hbFleetPhase`); reconciled allocation slots no longer change
  motion (reconcile.test.ts:70-80). Split-atlas leftovers (`EMBLEM_GLSL`, `logoTexture`, `logoGrid`,
  `logoCount`, `uEmblemLogos*`, `aCurve`) are gone from `src/` — only the negative assertions in
  tests remain, plus the golden.mjs straggler above.
- **Deploy perf tripwire** (`scripts/pharosville/validate-deploy-gate.mjs`): self-invoking
  `--perf-only` child; static byte gate runs everywhere, GPU loads only outside CI with a real-GPU
  probe through the shared operator Chrome (AGENTS-compliant; no bundled-Chromium fallback); exit 78
  (`SKIP_PERF_NO_GPU`/`SKIP_PERF_CI`) keeps the three-outcome vocabulary and the GHA warning.
  `evaluateHarbourLoad` requires 3 valid cold fast4g samples both sides, limit = baseline median
  +15 %, boundary-tested (1150 pass / 1151 fail vs 1000). Origin startup matches origin.mjs's exact
  ready line; SIGTERM cleanup escalates to SIGKILL. Baselines: `branch-load.json` (2.2 MB, n=5,
  fast4g cold median ≈ 4904 ms vs main ≈ 5976 ms) is load-bearing; `main-load.json` (3.7 MB) is
  evidence-only (see Minor 3). `perf/origin.mjs` API-base default matches vite's dev proxy.
  Bundle budgets re-tightened (entry 10/4 KiB, harbour 832/281 KiB) and RUNTIME_FACTS.md matches;
  TESTING.md describes the tripwire, its skip codes and the contended-baseline caveat accurately.

## Test quality

Strong. New/updated tests assert mechanisms, not just shape: dark-slot zeroing between publication
and update; SMAA clone defines per tier with live defines untouched and clone disposal; per-tier
preparation caching, supersession retry and post-teardown release; three-cycle DFG listener
bookkeeping; watchdog deadline/revision-reset/immediate-complete-race; no-layout terminal services;
detach/reattach registry retention; `Math.fround` rope endpoints; phase-vs-allocation independence;
tripwire threshold boundaries. `prepare.test.ts` was updated for the 16 ms idle timeout and asserts
the `{ timeout: 16 }` option.

## Minors

1. `world/depth-prepass.ts:7,65` — `Contributor.attached` is now write-only (the old removal
   latch was its only reader); the field and interface member are dead state.
2. `engine/governor.ts:105,144` — `setPreparation` still types/forwards an `AbortSignal` the only
   registrant (`engine.ts:118`) ignores; also, an engine disposed mid-transition makes the governor
   log "quality preparation failed; retaining current tier" for an expected AbortError (noise only).
3. 5.9 MB of load-capture JSON committed under `scripts/perf/baselines/` — only `branch-load.json`
   is load-bearing for the tripwire; `main-load.json` (3.7 MB) is linked as evidence from
   INTEGRATION-load.md. Intentional, but the repo will re-carry this weight on every re-baseline.
4. `engine/static-merge.ts:21,149` — a hypothetical itemSize-3 `tangent` attribute is classified as
   transformable but silently copied untransformed (the fast path handles n=4 only). No current
   geometry produces vec3 tangents (kit + tests are vec4); a dev-time guard would make the gap loud.

## Bottom line

Ship-ready once Blocker 1's golden.mjs fix is committed and the two "never partial" doc claims
(Major 1) are amended; minors are non-blocking. No scenery-parity regression found in the reviewed
mechanisms, and every revert left its area byte-consistent with main (mooring lines literally so).

# BUNDLE — JavaScript composition, deferral and V8 cost

## 1. Scope and method

Research only; no tracked runtime/config/script/public changes, no normal `npm run build`, no shared `dist/` writes, no worktree or code spike. Read `AGENTS.md`, research brief, architecture/runtime/testing docs, requested entry/config/budget files and import owners. Sources are HEAD's standalone WebGL2 harbour, not the retired garden.

Commands/artifacts:

- `npx vite build --config outputs/need-for-speed/bundle/vite.analysis.config.ts --sourcemap --outDir outputs/need-for-speed/bundle/dist`. Scratch config imports the real Vite config and records Rollup module/export metadata; no production behavior override.
- `npx --yes source-map-explorer 'outputs/need-for-speed/bundle/dist/assets/*.js' --json outputs/need-for-speed/bundle/source-map-explorer.json --no-border-checks` (2.5.3). Full module/export inventory: `rollup-modules.json`; top-30 tables below.
- `npx vite build --minify esbuild --outDir outputs/need-for-speed/bundle/esbuild-dist` and `npx vite build --target esnext --outDir outputs/need-for-speed/bundle/esnext-dist`.
- `node outputs/need-for-speed/bundle/analyze.mjs`: filesystem raw bytes, `gzipSync` sizes, source-map slices, compact JSON measurements; results `measurements.json`, `projection-measurements.json`.
- Two completed `npm run preview -- --url http://127.0.0.1:4173/ --cold --profile outputs/need-for-speed/bundle/startup-{1,2}.cpuprofile --profile-us 100 --wait 0 --seconds 3 ...` diagnostics. A queued third capture was cancelled when the orchestrator prioritized measurement owners. These are **not** a three-run browser benchmark. Do not infer scenery quality from the saved PNGs; none is claimed here.
- `node --experimental-vm-modules outputs/need-for-speed/bundle/compile-bench.mjs`: three fresh Node processes per chunk per cold/cached mode, constructor-only `vm.SourceTextModule` timings; cache bytes generated separately. `compile-bench.json` contains all runs. This is an explicit V8 proxy, **not** browser parse attribution.

All CPU timings below are **contended**. Builds are one run each; their wall times are not performance findings. Fast4g estimates use compressed decimal KB / 1.1 KB/ms and are serialization-time equivalents, not additive promises for first-frame improvement; requests, API, shaders and GPU work overlap.

## 2. Measurements

### 2.1 Baseline and minifier/target variants

Actual baseline files, without sourcemap footers (decimal bytes):

| Chunk | Raw B | gzip B | Loading boundary |
|---|---:|---:|---|
| index | 10,684 | 4,039 | Every viewport |
| vendor-react | 219,335 | 68,424 | Every viewport; real static dependency, not merely a preload |
| vendor-rendering | 859,952 | 247,512 | Admitted world |
| harbour-app | 930,166 | 322,146 | Admitted world |
| warm-legs.worker | 49,988 | 19,917 | Separate worker realm |
| ambience | 40,047 | 14,693 | Already dynamically imported on audio activation |
| **All JS** | **2,110,172** | **676,731** | Not all critical |

Initial entry + React + renderer + harbour code is 2,020,137 B raw / 642,121 B gzip. Layout is already a separate 289,810-ish B asset, not a 290 KB JS literal (`layout.json?url` contributes 38 mapped B).

Peer S15 subsequently completed blocked live captures; inspected `outputs/need-for-speed/firstpaint/blocked-live-{1,2,3}.json`: all three have **zero API requests**, but still request index and React. Request-size fields show React **69,701 B median** (69,698/69,701/69,701), plus index **5,407 B** each. Thus the current shell accounts for **75,108 B** median transferred script response bytes on the blocked welcome, before replacing it with a small bootstrap. These are captured request measurements, not the filesystem gzip figures above; they support BUNDLE-01 and are the same S15 opportunity, not an additional saving.

| Configuration | All-JS raw B | All-JS gzip B | gzip delta vs baseline | Conclusion |
|---|---:|---:|---:|---|
| Current terser, es2022 | 2,110,172 | 676,731 | — | Keep |
| esbuild, es2022 | 2,116,954 | 691,783 | **+15,052 B** | Worse loading, about +13.7 ms fast4g serialization |
| terser, esnext | 2,111,734 | 677,314 | **+583 B** | No gain; also narrows syntax support |

Largest esbuild regression is harbour-app gzip: 331,950 vs 322,146 B (+9,804). Renderer esbuild saves 4,982 raw bytes but **adds 2,977 gzip bytes**. Do not choose a minifier from raw size alone. Sourcemap variant is 296 raw / 236 gzip bytes larger overall due to sourceMappingURL footers; compare no-map variants above.

### 2.2 Data which really ships

Rollup `renderedLength` is **pre-minifier generated JS length**, not the source-map final-byte column. Independent compact JSON gzip is a sizing proxy, not the exact incremental chunk gzip contribution.

| Data | Included in world JS? | Rollup rendered length | Compact JSON raw / gzip B |
|---|---|---:|---:|
| `shared/data/stablecoins/coins.generated.json` | **No** | absent | 447,616 / 108,215 (excluded, not an available saving) |
| `shared/data/dead-stablecoins.json` | **Yes** | 68,514 | 63,806 / 21,783 |
| `shared/data/stablecoins/runtime-slim.json` | **Yes**, through UI yard snapshot | 21,866 | 20,511 / 6,965 |
| `src/harbour/data/prelaunch.json` | **Yes; lazy boundary defeated** | 91,935 | 86,963 / 26,820 |
| `data/logos.json` | Yes | 28,714 | 25,985 / 7,221 |
| `data/brand-colors.json` | Yes | 19,950 | 17,843 / 8,191 |
| `src/harbour/model/cemetery-logos.json` | Yes | 5,123 | not separately measured |
| `src/content/pharosville-changelog.ts` | **No** | absent | zero world contribution |

**Important mapping caveat:** generated JSON has no useful original source locations. Source-map-explorer assigns its literal bytes to adjacent mapped sources. The 110,373 B `ui/places.ts` allocation includes generated data (not 110 KB of place-name implementation); `data/fetch.ts` likewise inherits a large allocation. Cross-check with the Rollup data table before assigning ownership. These tables are allocation measurements, not proof that deleting the named authored source removes that many bytes.

Two illustrative, non-implemented scenery projections were measured with the same JSON serialization:

- Prelaunch `{id,name,symbol,pegCurrency,launchPhase,expectedLaunchDate,brandColor,llamaId}`: **7,509 raw / 1,544 gzip B**, vs 26,820 gzip for the complete book. Full phase descriptions/milestones remain available on demand. Exact production schema must follow all consumers.
- Dead records `{id,name,symbol,pegCurrency,causeOfDeath,deathDate,peakMcap}`: **14,637 raw / 2,839 gzip B**, before adding the existing derived cause family. Generate the exact existing `causeFamily` result, rather than removing obituary text and thereby changing classification! Allow roughly another 0.5–1 KB gzip for derived fields/labels [estimate].

### 2.3 Parse/compile evidence and limitations

Browser CPU profile observations, **diagnostic only, n=2, not a benchmark median**:

| Run | Navigation→first frame ms | Profile window ms | `(program)` sampled self ms | React sampled self ms |
|---|---:|---:|---:|---:|
| 1 | 4,187 | 4,882.1 | 825.9 | 62.2 |
| 2 | 1,776 | 1,885.8 | 253.1 | 17.1 |

The 2.36× first-frame spread is precisely why contended captures are not a reliable bundle delta. `(program)` includes unclassified/native work and **must not be reported as V8 compilation**. Named `onBeforeCompile` samples are three.js shader hooks, not JavaScript compilation. `shot.mjs:146-199` starts CPU profiling before navigation, but its `--trace` starts only at `:237-242`, **after** the first-frame wait. Therefore this tooling does not expose a trustworthy startup `V8.Compile` event total. Exact browser parse/compile ms remains unmeasured.

Measured isolated V8 constructor timings: Node v24.16.0, V8 13.6.233.17-node.49; **n=3 per cell, fresh process each, medians, contended**. No linking, module evaluation, first render, lazy-function execution, network, or GPU work is included.

| Chunk | Cold parse/compile proxy ms | Serialized-cache consume proxy ms |
|---|---:|---:|
| index | 0.534 | 0.281 |
| vendor-react | 4.329 | 0.201 |
| vendor-rendering | 10.909 | 1.904 |
| harbour-app | 16.290 | 1.619 |
| warm-legs.worker | 1.381 | 0.193 |
| ambience | 1.170 | 0.271 |

Sum of the four initial-chunk medians: **32.06 ms cold vs 4.01 ms cache consumption** (sum is a proxy, not a measured page total). Existing stable hashed vendor chunks and immutable `/assets/*` already allow HTTP/V8-cache reuse; cold cache clearing explicitly removes that benefit. No claim that V8 code cache always exists on the second visit: browser policy, resource size, prior execution and eviction govern it. Do not put custom V8 cache machinery in application code. A 100 KB raw deferral corresponds to roughly 1.5–2.0 ms of cold constructor work on this desktop proxy [estimate]; about 6–8 ms at an assumed 4× slower CPU [estimate], not observed Chrome CPU-throttle data.

### 2.4 Deferral boundaries and overlap

| Candidate | Measured size reference | Actual boundary and caveat |
|---|---|---|
| Panel + Ledger + Search | Mapped raw: 38,882 + 13,505 + 3,733 = **56,120 B**; broader panel/facts/places/yard group **175,847 raw / 53,673 gzip B** | Group includes generated prelaunch data, so do not add its gzip to prelaunch savings. Leaf UI-only code is roughly **18–25 KB gzip** [estimate] once hover metadata is split. |
| Whole overlay | Source-map slice **213,242 raw / 66,639 gzip B** | Includes metadata; `mountHarbourUI` executes after `engine.start()` but is statically imported before boot. Lazy-import overlay while engine initializes, await before poster crossfade: removes initial module evaluation ordering, not necessarily network bytes before first frame. |
| Prelaunch narratives/book | **26,820 gzip B** compact data proxy | `civic-system.ts:211-225` starts yard unawaited during init; static `ui/yard.ts:12` pulls book into world. Restoring dynamic import alone can move critical JS, but its fetch may still race the first frame unless deliberately scheduled. |
| Dead narratives | **21,783 gzip B** full data proxy | World needs exact IDs/rank/death/family, not all narrative text; retain compact derived projection eagerly, load full detail for hover/panel/ledger. |
| Weather visuals | Weather directory **31,859 raw / 11,846 gzip B**; the three visual helpers total **23,414 mapped raw B** | Keep director/uniform/service state eager. Lightning/precipitation/rainbow can be conditionally loaded only with state-aware warmup. **6–9 KB gzip** initial deferral [estimate], with storm correctness constraints. |
| Seasons | **5,939 raw / 2,572 gzip B** | Calendar, season blends, sun/grade/foliage affect the current first frame. There are not four independent seasonal modules waiting to remove. Not worthwhile. |
| Wreck Cove geometry | **10,475 mapped raw / 4,550 gzip B** | Visible first-frame scenery and data-derived wreck forms; not action-only. Do not defer/remove the cove merely because its panel is on demand. |
| Audio | Whole ambience chunk **40,047 raw / 14,693 gzip B** | **Already deferred**; no 14.7 KB new saving. |
| Life + identity implementation | Mapped source slices **67,892 raw / 25,327 gzip B** (life14,469; identity11,773 gzip separately) | Their **initialization is already deferred**, but `systems.ts:12-13` still imports implementations eagerly. Civic workers share `life/figure-kit.ts` (2,704 mapped B), which must remain in the eager shared closure. |
| Worker duplication | Main route/graph/path/outings/obstacles **52,816 mapped B**, duplicate worker equivalents **47,364 B** | Separate V8 realms; shared HTTP module alone does not remove separate execution. See S9 for worker-owned planning and fallback cleanup. |

## 3. Findings and prioritized opportunities

Gains below are incremental **critical-path gzip** estimates unless explicitly described otherwise; do not add overlapping metadata/UI buckets. Scenery class “none” still requires interaction/contract verification when implementing. No implementation A/B was performed.

| ID | Opportunity | Evidence | Proposed change | Expected gain and method | Visual impact / verification | Effort | Risk | Dependencies/conflicts | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| BUNDLE-01 | Gate before React for blocked welcome | `main.tsx:1-13`, `client.tsx:2-15,58-77`; static vendor import in emitted index; 68,424 B gzip React | Tiny external vanilla sorted screen+viewport admission bootstrap; render equivalent static welcome HTML and import React app only upon admission, including resize. Merely deleting the preload does not fix static imports. | **~68 KB gzip / ~62 ms fast4g** avoided on blocked viewports, plus ~4.3 ms Node cold compile proxy; **0** world-desktop JS reduction. Small bootstrap overhead [estimate]. | none to world; compare welcome, physical-screen AND viewport gate, resize admission, focus, error handling and analytics | M | medium shell behavior | Same opportunity as S15; count once. Keep CSP external-script model. | H bytes / M implementation |
| BUNDLE-02 | Load closed panels/search/ledger only on first use | `ui/App.tsx:6-8,80-88` eagerly imports and renders all three, even closed; `HoverTag.tsx:2-5` imports shared details | Split lightweight hover/labels from detailed facts/yard metadata; lazy-import a shared detail-UI boundary on first selection, L, / or control activation. Parent must gate first mount: lazy components rendered unconditionally still download in order to return null. Preserve presence/close transitions and focus restoration. Warm on intent or after arrival if desired. | **18–25 KB gzip / 16–23 ms fast4g** [estimate, mapped leaf code plus shared helpers, excluding prelaunch/dead savings]; ~1–2 ms desktop parse proxy [estimate]. | none scenery; verify all selection kinds, keyboard/open-close/focus, ledger caveats and first-action latency | M | medium interaction latency/import coupling | First split hover dependencies; BUNDLE-03/04 are separate overlapping data work. Do not postpone meaningful accessibility UI indefinitely. | M |
| BUNDLE-03 | Restore broken prelaunch deferral; separate scenery fields from narrative book | Build warns static `ui/yard.ts:12` defeats `civic-system.ts:221` dynamic import; `ui/yard.ts:132-145` builds fallback rows at module evaluation | Make civic service the canonical scenery source, retain exact small projected hull/hover fields, load full descriptions/milestones when needed. Preserve snapshot source-link merge and fallback semantics rather than deleting them. Schedule already nonawaited yard detail work with boot owner. | **~24–25 KB gzip / 22–23 ms fast4g** [estimate]; measured full book26,820 vs illustrative projection1,544 B. Up to another6,965 B runtime-slim deferral only if fallback/source-link duties migrate safely; **not counted**. | none if hull timing stays unchanged; marginal risk if fetch moves later—compare crossfade/shipyard populated state and every launch stage | M | medium lost milestone sources / yard pop-in | BUNDLE-02 hover split; S6/S11 scheduling ownership. Build currently regresses prior v1.1 deferral, not a wholly new idea. | H leak / M gain |
| BUNDLE-04 | Keep exact wreck classification compact; defer cemetery prose | `model/obituary.ts:10,37-50,97-112`, `model/build.ts:73-74`, `ui/facts.ts:5`; full dead table21,783 B gzip | At sync/build time generate exact eager world projection including current `causeFamily` result and required label fields; fetch full obituary/source text only for interaction. Existing regex-based cause mapping must remain identical. | **~17–18 KB gzip / 15–16 ms fast4g** [estimate, full21,783 less projected2,839 plus derived-field allowance]; ~1 ms desktop parse proxy [estimate]. | none only with exact derived equality; compare wreck count, rank, sizes/forms/locations and all obituary/hover content | M | medium data-mapping regression if prose simply dropped | S3/S11 world consumers; BUNDLE-02 facts split. No change to what wrecks mean. | M |
| BUNDLE-05 | Conditional weather geometry modules, not conditional data meaning | `weather-system.ts:15-17,87-113,167-184`; helpers23,414 mapped raw B, whole weather11,846 B gzip | Keep director/services/uniforms eager; load precipitation/lightning/rainbow implementations when state warrants, with time to prepare before a visible transition. Await required visual code if initial data already demands storm/snow. | **6–9 KB gzip / 5–8 ms fast4g** on initially calm visits [estimate, helper share of measured weather slice]; **0** on storm starts; likely <1 ms desktop parse [estimate]. | **visual-risk** until verified: first-frame danger storm, forced strike/rainbow, winter rain→snow, live band transitions, reduced motion, audio thunder subscription | M | medium asynchronous transition correctness; small payoff | Coordinate S10 weather/runtime owner. Do not default unknown data to calm or delay honest weather mapping. | M/L |
| BUNDLE-06 | Remove modulepreload compatibility polyfill only if browser floor allows | Emitted index contains Vite `relList.supports`/MutationObserver/fetch IIFE; measured702 raw/392 standalone gzip B | `build.modulePreload: { polyfill: false }`, retaining native modulepreload and custom desktop hints | **~0.3–0.4 KB gzip / <0.4 ms fast4g** [estimate incremental compression]; near-zero CPU. | none on supported native browsers; verify declared Safari/Firefox/Chromium floor, gate requests and dynamic CSS preload error path | S | low on modern browsers, compatibility risk otherwise | Browser support policy decision; current older-browser polyfill does not evaluate `media` before fetch. | H bytes / M eligibility |
| BUNDLE-07 | Remove main-thread planning copies only after worker becomes canonical | Main duplicated route helpers52,816 mapped raw B; worker49,988 raw/19,917 gzip B | S9's worker-owned transactional planning can eventually remove obsolete main plan paths/fallbacks, retaining actual startup/error behavior; do not simply re-chunk duplicate realms | **~15–20 KB gzip / 14–18 ms fast4g** main-code removal ceiling [estimate from worker's measured compression]; 0 guaranteed until ownership cutover is designed | none with identical deterministic routes; compare plans, collision/dock behavior, cancellation and cold worker failure handling | L | high behavioral migration | Entirely depends on S9 worker design; overlapping CPU project, not a standalone easy bundle win | L byte removal / M duplication |
| BUNDLE-08 | Lazy-load implementations of already deferred life/identity systems | `systems.ts:12-13` static imports; `engine.ts:118-134,150-158,209-212` already defers their initialization until after first render; mapped combined67,892 B raw/25,327 B gzip | Extend the existing deferred factory boundary to import life/identity implementations after the core frame, preserving registration order, service publication, abort/dispose and `?defer=0` A/B behavior. Keep shared civic figure-kit helpers eager. This is code/network deferral, **not** a proposal to defer initialization again. | **~22–24 KB gzip / 20–22 ms fast4g** shifted off initial static graph [estimate from measured combined slice minus eager shared helpers/import overhead]; ~1 ms desktop parse proxy [estimate]. Total session bytes unchanged. | marginal risk of later people/gulls/labels arrival; compare core first frame, poster crossfade, settled overview/heart and service-dependent civic animations, especially slow network | M | medium additional asynchronous arrival and cancellation | S6/S11 own deferred-system lifecycle; coordinate with their existing boot work. Do not delay essential labels past supported interaction. | H eager inclusion / M gain |

**Prioritization:** BUNDLE-01 (blocked-only), then jointly BUNDLE-02/03/04 for supported-world loading, followed by BUNDLE-08's already-deferred-system code boundary. BUNDLE-02/03/04 target roughly **59–68 KB gzip / 54–62 ms fast4g** nonoverlapping savings [estimate]; BUNDLE-08 could add another **22–24 KB / 20–22 ms** initial-code deferral if later scenery arrival stays acceptable. These plus only a few desktop milliseconds of isolated V8 compilation do not explain seconds of first-render shader/upload work. BUNDLE-05 is secondary due to modest benefit and scene-transition risk. BUNDLE-06 is cleanup contingent on browser policy. BUNDLE-07 belongs to the simulation cutover, not a quick split.

## 4. Leak list and ruled out / not worth it

- **No WebGPU/TSL/nodes leak:** emitted three module inventory is exactly `three.core.js`, `three.module.js`, GLTFLoader, MeshoptDecoder, BufferGeometryUtils, SkeletonUtils. No WebGPURenderer, `three/webgpu`, `three/tsl`, node-material module or TSL chunk. `WebGPUCoordinateSystem` exported constant is not a second renderer.
- **Expected examples/jsm only:** GLTFLoader42,996 B, MeshoptDecoder27,284 B, BufferGeometryUtils4,608 B (mergeGeometries/mergeAttributes/toTrianglesDrawMode), SkeletonUtils442 B (`clone` only; retarget/retargetClip removed). These are not accidental duplicate loaders. S3 confirms **all 89 shipped GLBs require EXT_meshopt_compression**, so decoder removal is ruled out. Delaying it would stall mandatory GLB decoding.
- **No zod runtime payload:** both sourcemaps and Rollup emitted-module inventory contain no zod. Build does transform zod and emit the known `regexes.js:74`/`util.js:400` misplaced `@__PURE__` **comment** warnings, but that is not evidence of runtime inclusion. `src/lib/api.ts:241-252` guards production away from contract auto-import. Do not remove validation or suppress a warning as a loading optimization.
- **No full coin registry or changelog payload:** both absent; claiming108 KB gzip full-registry saving would re-propose an already shipped optimization. `runtime-slim` and prelaunch remain as described above.
- **Postprocessing tree-shakes real effects:** retained visible effects are Bloom, ToneMapping, LUT3D/LUT support, TiltShift and SMAA, Vignette plus Effect/EffectPass/custom fog/beam infrastructure; `engine/post.ts:144-166` uses them. Removed exports include SSAO, GodRays, Outline, DOF/Bokeh, FXAA, Glitch, Noise, SelectiveBloom and LUT file loaders. `n8ao`, `lucide-react` and `@tanstack/react-query` are dependency entries but absent from this emitted client module inventory. Deleting package declarations alone saves zero runtime bytes.
- **No straightforward three tree-shaking fix:** named namespace property references are statically resolvable; hundreds of unused three exports are already removed. `three.module.js` retains WebGL shader/renderer machinery (362 KB mapped) and core classes (247 KB). GLTFLoader intentionally retains animation/skinning/material-extension classes. A custom restricted loader or patched three shader registry could reduce bytes but is a high-maintenance semantic compatibility fork; no measured safe win here. Do not recommend replacing the renderer or dropping scenery effects.
- **Keep terser/es2022:** measured esbuild and esnext variants are larger gzip. Raising target is not a performance optimization by itself.
- **Do not defer seasons/current scenery:** season weights affect first-frame sun/grade/foliage; code is just2.6 KB gzip. Wreck Cove is visible and carries data meaning. Remove neither to hide initial-load cost.
- **Audio already lazy:** ambience14.7 KB gzip is not on the critical static import graph; existing `CornerMark` activation imports it. Additional splitting DSP likely trades more requests for negligible initial benefit.
- **No same-realm duplicate React/three:** each lives in its vendor chunk. Deliberate worker duplication is real but cross-realm; sharing a filename does not share parsed heap/functions. Worker-owned planning, not manualChunks cosmetics, is the meaningful fix.
- **Stable-chunk caching is largely shipped:** retain vendor chunks, hashed URLs and immutable headers. More granular static chunks do not reduce cold initial bytes. Moving metadata into a hashed import still changes referencing chunk URLs/hashes when data changes; do not promise stable parent V8 cache across data releases without verifying the actual output dependency hashes. A stable manifest indirection would be a separate delivery design, not a free result of `import()`.
- Existing budgets (`bundle-budgets.mjs:24-26`) explicitly say prelaunch had moved out; it has regressed. Aggregate budget alone misses this: a new deferred chunk counts toward the same total even if it leaves startup, and an eager regression can fit under caps. After implementation, add/adjust **initial static-closure** and forbidden-import checks (zod/full registry/changelog/prelaunch detail) as part of the owning change; zero immediate speed gain, but protects measured savings.

## 5. Open questions / implementation verification needs

1. Browser support floor: is native modulepreload universal across supported versions? Needed only for BUNDLE-06.
2. Exact startup Chrome `V8.Compile`/parse attribution remains unavailable from stock `shot --trace` (steady-only). A future approved startup-trace mode would resolve it; do not treat `(program)` or shader hooks as the answer. No additional shared captures were queued after orchestration requested lock relief.
3. Pick detail-UI loading policy: intent prewarm versus first-action fetch versus idle-after-arrival. All can preserve scenery, but only the first two avoid unconditional post-frame download for visitors who never use panels. First-action latency must be measured on fast4g.
4. Metadata projection requires exact equality against existing world classification and fallback/source-link semantics. No license to simplify data mappings. The illustrative JSON projections are sizing evidence, not a final schema.
5. Browser startup diagnostics were `4173` with no API. They describe code presence and profiler limits, not production fleet initialization or a CDN/network baseline. Use S1's production-faithful/live matrix for whole-page priorities.

## Appendix: per-chunk top-30 source-map allocations

All modules are listed when a chunk has fewer than30. Generated-JSON attribution caveat in §2.2 applies. Full JSON and export list remain in scratch for implementation planning.

### harbour-app — 930,215 B with sourcemap footer

| Module | Mapped minified B |
|---|---:|
| `src/harbour/ui/places.ts` | 110,373 |
| `src/harbour/data/fetch.ts` | 67,746 |
| `src/harbour/ui/Panel.tsx` | 38,882 |
| `src/harbour/world/materials.ts` | 34,701 |
| `src/harbour/fleet/fleet-system.ts` | 29,617 |
| `src/harbour/ocean/ocean-material.ts` | 28,744 |
| `src/harbour/sim/sim.ts` | 25,806 |
| `src/lib/logos.ts` | 25,689 |
| `src/harbour/model/build.ts` | 21,762 |
| `src/harbour/fleet/fleet-material.ts` | 20,159 |
| `src/harbour/sim/layout-graph.ts` | 19,020 |
| `src/harbour/sky/sky-glsl.ts` | 14,354 |
| `src/harbour/weather/precip.ts` | 14,184 |
| `src/harbour/ui/Ledger.tsx` | 13,505 |
| `src/harbour/beam/fire.ts` | 12,726 |
| `src/harbour/sim/path.ts` | 11,781 |
| `src/harbour/lights/lights-system.ts` | 11,390 |
| `src/harbour/civic/fx.ts` | 11,335 |
| `src/harbour/sim/plan.ts` | 11,153 |
| `src/harbour/fleet/wreck-cove.ts` | 10,475 |
| `src/harbour/civic/shipyard.ts` | 10,378 |
| `src/harbour/beam/beam-system.ts` | 10,193 |
| `src/harbour/civic/civic-system.ts` | 9,758 |
| `src/harbour/ui/picking.ts` | 9,577 |
| `src/harbour/sim/outings.ts` | 9,549 |
| `src/harbour/sky/sky-system.ts` | 9,403 |
| `src/harbour/life/folk.ts` | 9,049 |
| `src/harbour/fleet/hull-kit.ts` | 8,720 |
| `src/harbour/sim/routes.ts` | 8,520 |
| `src/harbour/identity/labels.ts` | 7,785 |

Mapped929,194 B; unmapped971 B; remainder footer/EOL.

### vendor-rendering — 860,006 B with footer

| Module | Mapped minified B |
|---|---:|
| `three/build/three.module.js` | 362,248 |
| `three/build/three.core.js` | 246,727 |
| `postprocessing/build/index.js` | 175,646 |
| `three/examples/jsm/loaders/GLTFLoader.js` | 42,996 |
| `three/examples/jsm/libs/meshopt_decoder.module.js` | 27,284 |
| `three/examples/jsm/utils/BufferGeometryUtils.js` | 4,608 |
| `three/examples/jsm/utils/SkeletonUtils.js` | 442 |

Mapped859,951 B; unmapped0 B.

### vendor-react — 219,385 B with footer

| Module (`node_modules/`) | Mapped minified B |
|---|---:|
| `react-dom/cjs/react-dom-client.production.js` | 203,360 |
| `react/cjs/react.production.js` | 7,753 |
| `react-dom/cjs/react-dom.production.js` | 3,561 |
| `scheduler/cjs/scheduler.production.js` | 3,478 |
| `react/cjs/react-jsx-runtime.production.js` | 332 |
| `react-dom/client.js` | 287 |
| `react-dom/index.js` | 258 |
| `react/index.js` | 126 |
| `react/jsx-runtime.js` | 105 |
| `scheduler/index.js` | 31 |

Mapped219,291 B; unmapped43 B.

### index — 10,727 B with footer

| Module | Mapped minified B |
|---|---:|
| `src/components/section-error-boundary.tsx` | 1,978 |
| `src/desktop-only-fallback.tsx` | 1,955 |
| `src/error-reporter.ts` | 1,915 |
| `src/components/arrival-shell.tsx` | 1,309 |
| `src/client.tsx` | 1,107 |
| `src/fallback-links.ts` | 464 |
| `src/harbour/app/poster.ts` | 399 |
| `src/App.tsx` | 276 |
| `src/main.tsx` | 147 |
| `src/systems/viewport-gate.ts` | 105 |
| `src/rotate-to-landscape.tsx` | 47 |

Mapped9,702 B; unmapped980 B (Vite-generated code included here rather than a named authored module).

### warm-legs.worker — 50,042 B with footer

| Module | Mapped minified B |
|---|---:|
| `src/harbour/sim/layout-graph.ts` | 16,571 |
| `src/harbour/sim/outings.ts` | 9,487 |
| `src/harbour/sim/path.ts` | 8,922 |
| `src/harbour/sim/routes.ts` | 8,459 |
| `src/harbour/sim/obstacles.ts` | 3,925 |
| `src/harbour/sim/plan.ts` | 896 |
| `src/harbour/sim/sim.ts` | 712 |
| `src/harbour/sim/warm-legs.worker.ts` | 620 |
| `src/harbour/model/classify.ts` | 212 |
| `src/harbour/sim/math.ts` | 158 |

Mapped49,962 B; unmapped25 B.

### ambience — 40,093 B with footer

| Module | Mapped minified B |
|---|---:|
| `src/harbour/audio/dsp.ts` | 19,578 |
| `src/harbour/audio/ambience.ts` | 18,322 |
| `src/harbour/audio/bank.ts` | 2,146 |

Mapped40,046 B; unmapped0 B.

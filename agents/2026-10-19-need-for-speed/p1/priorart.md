# Prior art, rulings and constraints — `priorart`

Stage: RESEARCH (2026-10-19). Base `main` @ b71dd282 (v1.2.1).

## 1. Scope + method

Read-only history/doc research; no code edits, no builds, no captures (capture lock is reserved for the
measurement owners; this slice needs none).

- `git log --oneline | grep -iE 'perf|speed|load|budget|lazy|preload|compress|cache|draw|fps|frame'` (~120 hits), then
  `git show --stat` / targeted diffs of every assigned commit: 3a015980, ce74627e, 77a03538, beb6a8ca, 37dc031b,
  76895735, 8abe3322, a3de17ad, 4a48bed6, 685ddbd1, e9e1dad8, b5ff0196, 468c0ec0, plus 7cea95b6, c03ab537,
  a0485a2a (garden need-for-speed plan), 89b4251c, d94e3aca, 0254a36f, 3b0a8b65, eb07eccc, 3e363dbd and the
  P7 acceptance JSONs.
- Planning artifacts: `agents/2026-10-13-pharosville-reboot/` (00-brief, PLAN D1–D14, p1/BRIEF+VERDICT,
  p2/BRIEF, research/01–05), `agents/2026-10-15-classical-town/` (PLAN, BRIEF, FANOUT-RULES), `CHANGELOG.md`
  v1.0.0–v1.2.1, `ROADMAP.md`, `PRODUCT.md`, `docs/pharosville/{ARCHITECTURE,RUNTIME_FACTS,TESTING,
  SECURITY_HEADERS}.md`, `public/_headers`, `scripts/bundle-budgets.mjs`, `package.json` scripts,
  `vite.config.ts`, and HEAD sources `src/harbour/{engine,sim,data,fleet,readings}/` to confirm each item
  still ships.
- Era split: **Harbour era** = a8d555f5 (2026-10-14 reboot) → HEAD. **Garden era** = everything before
  (canvas-2D then garden three.js world, deleted at cutover 0254a36f). b5ff0196 and 4a48bed6 (2026-10-03) are
  garden-era by date, but the Terser config still ships at HEAD.

## 2. Shipped (Harbour era, verified at HEAD unless noted)

### 2.1 Loading / boot

| # | Item | Commit | Files | Stated gain |
|---|------|--------|-------|-------------|
| L1 | Desktop-gate lazy mount: blocked viewports (sorted 720×600 size profile) never import the Harbour chunk, fetch GLBs or `/api/*` | garden-era rule, harbour wiring 0254a36f | `src/client.tsx`, `src/systems/viewport-gate.ts`; guard `npm run check:viewport-gate` | phones/folded foldables pay ~0 bytes (RUNTIME_FACTS Viewport Gate) |
| L2 | Poster first paint, no inline script; poster preloaded `fetchpriority=high` (AVIF 960/1600 `imagesrcset`), crossfade after first frame + first payload (8 s cap); WebGL2 failure keeps poster | P2-era; poster re-render e252a135 | `index.html:14-16,37-43`, `public/arrival-shell.css`, `src/harbour/app/harbour-app.tsx` | first paint = 1 image + CSS, before any JS (ARCHITECTURE.md First paint) |
| L3 | Media-gated `modulepreload` of harbour-app + vendor chunks on admitted viewports only | 0254a36f (plugin infra from c03ab537) | `vite.config.ts:149-201` | chunks start in the first RTT |
| L4 | First-frame **fetch preloads**: hashed layout JSON, sea-sdf.webp, lighthouse, civic+kit manifests, island.glb.gz at `fetchpriority=low` (2.6 MB island must not hold back JS); `as=fetch crossorigin` so the engine's own fetches consume them | 3a015980 | `vite.config.ts:151-181` | part of the ~25% cold-frame win |
| L5 | **Byte prefetch** of every first-frame GLB at Engine construction (island, lighthouse, all civic + kit + LOD GLBs once manifests land); parsing stays per-system; runs inside Engine so gated viewports fetch nothing | 3a015980 | `src/harbour/engine/prefetch.ts`, `engine.ts` ctor, `engine/assets.ts:37-48` | removes per-system serialization of downloads |
| L6 | Pre-gzipped `.glb.gz` (zopfli, deterministic bytes) fetched + inflated client-side via `DecompressionStream` (CF Pages serves `model/gltf-binary` uncompressed); plain `.glb` fallback; handles a server that already decoded it | garden pattern 77a03538-era; harbour assets.ts (P2), re-compressed in 3a015980 (all kit/civic GLBs ~4-5% smaller) | `src/harbour/engine/assets.ts:20-66`, `scripts/harbour/compress-assets.mjs` | island 4.6 MB → 2.56 MB over the wire |
| L7 | Meshopt decoder on all harbour GLBs (from `three/examples`, not a CDN — CSP rule) | P2-era | `src/harbour/engine/assets.ts:13` | (garden measured −50% model bytes at 77a03538) |
| L8 | **Sim plan off the first frame**: feed `start()` overlaps SDF decode; first model install runs in `installEarly()` (a task after payloads + workers), then workers pre-build the plan legs, then poses | 3a015980 | `src/harbour/sim/system.ts:84-126`, `sim.ts` (`pathRequests`, `seedPaths`, `buildPlanLegPath` pure fn) | first update() finds model installed and paths cached |
| L9 | **Warm-legs workers** (≤4): representative leg times (~0.7 s of path building), outing answers, and the first plan's leg paths built off-thread during world load; no-Worker/failure fallback builds in-thread | d94e3aca, extended 3a015980 | `src/harbour/sim/warm-legs.ts:30-69`, `warm-legs.worker.ts` | ≈0.7 s of CPU off the boot critical path |
| L10 | Deferred systems: `life` + `identity` (overlays/decoration) init right after the first frame; every service reader tolerates absence | 89b4251c | `src/harbour/engine/engine.ts:13-17` | boot: life 188 ms, identity 746 ms moved off first frame (orchestrator baseline labels) |
| L11 | Feed keeps last-good payload per endpoint in memory; failed refresh ages to "stale", never blanks | P2-era | `src/harbour/data/fetch.ts:2-4,158-163` | robustness on flaky networks |

### 2.2 Runtime / frame

| # | Item | Commit | Files | Stated gain |
|---|------|--------|-------|-------------|
| R1 | QualityGovernor: DPR×tier ladder, `EXT_disjoint_timer_query_webgl2` GPU timer (honest number under vsync), rAF-delta path for Safari/Chrome-Mac, one rung per decision, hysteresis + cooldown that swallows tier-change recompiles; **CPU-bound frames hold the rung**; `?dpr=`/`?quality=` pins | b1371858→3b0a8b65→3a015980 | `src/harbour/engine/governor.ts:6-14,142-159` | no oscillation, no useless downshift on CPU-bound frames |
| R2 | Cheaper iGPU frames: ocean shader coherent-branch skips of exactly-zero terms (caustics when sun down, whitecap lanes on calm sea, haze band for near water — uniform-weighted so branches stay coherent); batched `hullHeights` (10 trig per hull at rest vs 25) with per-hull swell cache; `DAMP_BY_BYTE` LUT; SDF texel fast path | 3a015980 | `src/harbour/ocean/ocean-material.ts`, `ocean-system.ts`, `waves.ts` | "frames are cheaper on integrated GPUs" (CHANGELOG v1.1.0) |
| R3 | Tier ladder: shadowMapSize 4096/2048/2048, `shadowInterval` + `shadowMinFrames` (a slow frame alone never re-renders the map), pointLights 16/8/4, bloomLevels 8/7/6, SMAA high/medium/low | 3a015980 (tier set earlier) | `src/harbour/engine/quality.ts:27-31` | cheaper medium/low tiers |
| R4 | Post-load **static merge**: never-moving meshes merged to one draw per (material, layout, shadow flags) in main AND shadow pass; skips instanced/skinned/morph/material-array | 89b4251c, +122 lines & tests 3a015980 | `src/harbour/engine/static-merge.ts:1-53` | draw-call reduction (P8: 104 draws at heart) |
| R5 | Island GLB baked "merged per material for few draws, AO in vertex colour" | P2 brief contract | `agents/.../p2/BRIEF.md:99`, island bake scripts | 15 meshes / 287k tris island (classical PLAN §6.5) |
| R6 | Emblem atlas: AVIF primary + WebP fallback; canvas holds logo rows + 1 spare and **grows a row at a time** (slots never move, UVs follow); monograms for logo-less coins; crests.webp lossless decoded once | 3a015980 | `src/harbour/fleet/emblems.ts` | emblems 2.03 MB webp → 1.48 MB avif; crests 235 KB png → 51 KB webp; smaller initial GPU texture |
| R7 | Terser pinned, **two compress passes** (no unsafe options); manual chunks `vendor-react` / `vendor-rendering`; `chunkSizeWarningLimit` quieted because budgets are the truth | b5ff0196 (garden date, ships at HEAD) | `vite.config.ts:228-252`, TESTING.md | restored bundle headroom (garden); still active |
| R8 | zod out of the client bundle: registry/dead-coin data validated at test + sync time, not runtime; `runtime-slim.json` slim registry cut (full registry stays server-side) | 3a015980 | `shared/lib/dead-stablecoins.ts`, `shared/data/stablecoins/runtime-slim.json`, `scripts/harbour/sync-check.mjs`, `src/harbour/ui/yard.ts:10-12` | harbour chunk 1,319.7→904.3 KiB raw / 400.4→312.9 gzip (bundle-budgets.mjs:20-26); total 2,444.1→2,055.2 raw / 736.9→658.8 gzip (:59-62) |
| R9 | NaN/Inf scrub pass before bloom (one bad pixel otherwise spreads through the mip chain = whole-frame black) | P7-era | `src/harbour/engine/post.ts:94-98` | black-frame robustness |
| R10 | Stale-fog EffectPass inserted lazily, only when data actually goes stale (adding a depth pass to a running pmndrs composer recreates its buffers → blacked frame) | P8/89b4251c-era fix | `src/harbour/readings/fog.ts:78-83` | healthy harbour skips the composer's depth blit |
| R11 | Measurement tooling: `?prof=1` per-system frame profiler (`window.__harbourProf`), `window.__harbourStats` (draws, tris, programs, textures, gpuMs, boot per-system timings); shot.mjs `--cold --throttle --cpu-throttle --waterfall --log-requests --profile --steady-profile --heap-sample --trace --uncapped --igpu` | 3a015980 (+142 lines shot.mjs) | `src/harbour/engine/engine.ts:19-23,52-61`, `scripts/harbour/shot.mjs` | enables every other perf slice |

**Stated outcomes to date** (do not re-claim): v1.1.0 cold first frame on fast 4G ≈ **−25%**, main script
**−30%** (CHANGELOG.md:40). P8-era: 104 draws at heart, 2.1–2.3 s first frame (d94e3aca title; the
classical-town restyle has since moved the orchestrator's warm-cache dist baseline to 97 draws / ~3.1 s
firstFrameNavMs). P7 acceptance (overview 18.5, worktree run): 151 draws, 1.25 M tris, p95 16.8 ms,
firstFrameMs 3766, firstRender 1300 (`agents/.../p7/acceptance/overview-18.5.json`).

## 3. Ruled out (with evidence)

| Item | Where | Reason | Still valid? |
|------|-------|--------|--------------|
| WebGPU / `WebGPURenderer` + TSL | p1/VERDICT.md:31-37; run rule 00-BRIEF.md:29 | WebGLRenderer+GLSL gave the same look on the operator's default Chrome (Linux, **no WebGPU adapter**), 2–4× less CPU, faster first frame, honest GPU timer | **Y — hard rule for this run** (no renderer switch, no graphical fallback) |
| Web Worker for the data-refresh path | beb6a8ca (garden, measured) | Common-case refresh = 239 ms main-thread busy of which only 34 ms (world-model rebuild) could leave the GL-owning thread; sticky placement had already taken rebuild 303→34 ms | **Unknown for Harbour**: harbour's refresh path is different; workers DO pay for boot path planning (L9). Re-propose only with a fresh measurement of the harbour's model-rebuild cost |
| Per-hull analytic reflections in the water fragment shader | 37dc031b (garden) | The Pharos mirror column exploited the fixed ortho-iso view; "does not scale to 29 hulls — 29 loop iterations per water fragment"; replaced by one InstancedMesh | Y as a principle (per-fragment per-instance loops don't scale); harbour instead uses light pools/pillar sprites, ≤16 real point lights near camera (p2/BRIEF.md:62) |
| Planar reflections / second scene render | research/03 §2 | "Planar reflection is not worth a second scene render here" | Y (and A1 confirms: no PMREM/CubeCamera at HEAD) |
| Pre-rendered relit sprites; Gaussian splats; painterly NPR (Kuwahara) post | research/03 §5 | Sprites conflict with continuous headings/wakes/zoom; splats not relightable or animatable; NPR "can turn data into mush" | Y |
| Lateen rigs | classical PLAN §4.7(5) | Boom group only rotates about vertical Y (`hull-kit.ts:105`) | Y (art/perf coupling; don't propose rigs needing new transform plumbing for perf reasons) |
| Mobile/touch-first runtime; phones getting the world | D2; ROADMAP.md "Not Currently Planned" | Desktop first; v1.1.0 compact profile already admits unfolded foldables/tablets (720×600 sorted) | Y |
| Changing what the world MEANS (data mappings, D1–D14) | run rule 00-BRIEF.md:30-31; classical PLAN §7 | Data honesty is the product | Y — hard rule |
| `query-persist-client-core` for payload persistence | 468c0ec0 (garden) | Restores cache verbatim: old `_meta` would let a 2-hour-old payload claim freshness | Y as a pattern (hand-roll with recomputed age/demotion if persistence returns) |
| Pixel-MAE / draw-count / art-recipe test assertions | research/02 §4; reboot PLAN §7 rule 4 | Tests pin semantics and budgets only, never art (688 exact-number assertions strangled the garden) | Y |
| CDN-hosted decoder/scripts; new CSP sources; inline script | SECURITY_HEADERS.md:26-36; 77a03538 | Same-origin runtime media is a repo rule; `wasm-unsafe-eval` + `img-src blob:` are already the required minimum for meshopt WASM + blob-URL textures | Y |
| Terser unsafe optimizations / stripping localhost instrumentation | b5ff0196 → TESTING.md | Pinned Terser, default safe transforms only | Y |
| Silent budget raises | ce74627e, b15cab96, 3a015980 history | Budgets move only with a measured re-baseline recorded in `scripts/bundle-budgets.mjs` comments | Y |
| FFT ocean / SSR / clustered lights / TRAA as baseline features | reboot PLAN §6 (WebGPU tier polish only) | WebGL2 is the one renderer now; night readability is authored on the WebGL2 baseline | Absorbed: moot under the WebGL2-only ruling |

### 3.1 Lapsed, NOT ruled out (garden-era shipped, absent at HEAD — re-examination candidates)

- **localStorage last-good payload persistence** (468c0ec0): TanStack `initialData`/`initialDataUpdatedAt`,
  24 h max age, 1 MB/entry, zod on the write side behind a dynamic import. At HEAD only error history
  (`src/error-reporter.ts`), sound choice and intro flag use localStorage; `HarbourFeed` (`data/fetch.ts`)
  keeps last-good **in memory only**. A repeat-visit fast-start would be new work in the harbour, not a
  re-proposal — reuse 468c0ec0's data-honesty rules if attempted.

## 4. Constraints checklist (an optimization must respect these)

| Constraint | Source |
|---|---|
| Desktop gate: sorted-size 720×600 profile on physical screen AND current window; blocked viewports mount no runtime, fetch no world data; never orientation/aspect tests; `check:viewport-gate` | AGENTS.md:19; RUNTIME_FACTS Viewport Gate; docs/pharosville/ARCHITECTURE.md:24-30 |
| CSP: no new sources; `script-src 'wasm-unsafe-eval'` + `img-src … blob:` are load-bearing (meshopt WASM, blob-URL GLB textures); no inline script/hash; exact analytics hosts, no wildcards; static validator enforces | docs/pharosville/SECURITY_HEADERS.md:26-36; public/_headers; `check:security-headers:static` |
| No WebGPU/renderer switch, no graphical fallback; WebGL2 failure = poster + honest message stays | 00-BRIEF.md:29; AGENTS.md:20; RUNTIME_FACTS App And Routes |
| Same-origin `/api/*` only; `PHAROS_API_KEY` server-side only, never in VITE_/static/HTML/logs | AGENTS.md:15-17 |
| Same-origin runtime media under `/harbour/`; decoder libs from `three/examples`, not CDN | AGENTS.md:15-17; 77a03538; RUNTIME_FACTS Runtime Media |
| GLB node-name contracts must survive re-export/merge: civic nodes (`fire_core`, `press_0..2`, `slip_0..5`, `crest_panel`, `awning`, `flag_pole_top`, registry's FORBIDDEN nodes…) and hull contract (`sail_main` + TEXCOORD_0/1, `furl` morph, cleats, `masthead_light`) — `npm run check:harbour-contracts` | package.json:44; scripts/harbour/check-civic-contract.mjs:20-44; classical PLAN §6.1 |
| Runtime media structural validation (container/extension agreement, retired paths) — `npm run check:runtime-media` | package.json:45; scripts/pharosville/validate-runtime-media.mjs |
| Bundle budgets: entry 64/24, harbour-app 1,020/352, vendor-rendering 960/276, CSS 28/7 KiB, total JS 2,260/724 KiB; WebGPU chunks forbidden; re-baseline only measured | scripts/bundle-budgets.mjs; `check:bundle-size`; RUNTIME_FACTS Bundle Budgets |
| `npm run build` rewrites tracked `public/harbour/**/*.gz` (compress-assets) — never casually; variant builds via `npx vite build --outDir outputs/...` | 00-BRIEF.md:15-17; scripts/harbour/compress-assets.mjs:3-13 |
| Looks/frame time judged ONLY on the real GPU via `npm run preview` (shot.mjs); Playwright/SwiftShader reports fiction (read 20-43 fps where the real GPU reads 59) | AGENTS.md:20-21; TESTING.md:38-55 |
| Data honesty: fog = stale data ONLY; nothing pretends live when stale; unknown ≠ calm; stale feeds age visibly; numbers only on hover/panel/ledger (D11) | reboot PLAN D11 + §4.4; CHANGELOG v1.0.0:50; PRODUCT.md:70-81 |
| Determinism: same harbour for every viewer (`hash(id)+UTC`); optimized planning kept **byte-identical routes**; sim tests pin semantics | reboot PLAN §4.2; 4a48bed6 |
| Art direction (classical): crafted-miniature medium stays (flat-ish shading, vertex colour + pattern ids, AO in vertex colour, plain warm window openings); Pharos the only monument/tower, nothing else >~18 m; no slate/clapboard/dormers/brick stacks; painted meander band must survive LOD+AO; era "Hellenistic with vernacular licence" | classical PLAN §2.2, §3.1-3.3, Q1; reboot PLAN §5 |
| Density is art, not waste: "the town reads as inhabited"; declutter applies only to water/data surfaces | reboot PLAN §5 |
| Budgets: ≤400 k triangles on screen, ≤120 draw calls, first view ≤6 MB; every restyle phase lands at or below today's tris+GLB bytes for what it replaces (island today 287 k tris / 4.55 MB GLB / 2.55 MB gz) | reboot PLAN §6; classical PLAN §6.5 |
| Meshopt quantization ceiling: encoder refuses max POSITION shift > 2.5e-4 (authored features like the 0.035 mortar joint must not move; 18/24 mantissa bits was the floor, 12 visibly too coarse) | 77a03538 |
| One metaphor; no new landmark/ritual without operator yes; operator verdict is the only taste gate; ≤2 fix loops; silence ≠ acceptance | reboot PLAN §7 rules 1,7; classical PLAN process rules |
| Accessibility parity: DOM ledger reaches every coin; reduced motion stills the world; colour/3D never sole carrier | PRODUCT.md:83-90; CHANGELOG v1.0.0:53 |
| Releases only via release.yml after green main deploy; never manual tags | AGENTS.md:22 |
| Opt-in sound only, off by default, lazily loaded bank | D13; classical PLAN §4.8 |

## 5. Scenery-essential elements (what "the beautiful scenery" means in the plans — must not degrade)

- **The Pharos** as the tallest silhouette and only monument: square base → octagon → lantern gallery,
  fire beacon + bronze mirror, beam whose rhythm/reach/colour = PSI, unlit lantern = no reading, glint and
  reflection on the water (reboot PLAN D8, §4.3; classical R3; CHANGELOG v1.0.0).
- **The living sea**: Gerstner swell + detail normals, contact foam around shore/piles/hulls, real Kelvin
  wakes in a shared world-space RT, depth-absorption colour from the baked bathymetry SDF, sky reflection,
  sea state = off-peg share in 4 declared steps (reboot PLAN §4.4; "the place to beat ClaudeVille").
- **Art-directed sky and time**: real sun/moon path on the visitor's clock, keyframe palettes, star field,
  soft cloud banks + cloud shadows, cloud cover = DEWS stress band (reboot PLAN §4.4).
- **Night readability**: lit windows as plain warm openings, riding lights, pier lamps / fire-bowl beacons,
  moonlit sea, bloom; "night must stay readable" is a core locked feature (reboot PLAN §5; classical Q1).
- **The fleet alive**: ~25-40 (now ~31%) boats under way, docking as the signature animation (approach →
  turn → ease in → sail down → mooring lines), real logos legible at harbour zoom, brand-dyed sails,
  burgees/covers when docked, wakes (reboot PLAN D5/D10, §4.2; CHANGELOG v1.1.0).
- **Harbour legibility**: piers as the supply map (Ethereum Grand Pier visibly longest), empty berths as
  bollard slots, painted quay supply bars; flagship/large hulls ≥60 px at overview zoom (reboot PLAN §4.2).
- **Meaningful places**: Shoals (off-peg, heeling), Wreck Cove obituaries, tide-board mint/burn bars, storm
  cones, sea-zone chart lettering — the world carries the reading (reboot PLAN §3-4; D11).
- **Town density in the crafted-miniature style**: streets, lamps, trees, harbour furniture, seasonal
  vegetation; Tiny Glade/Townscaper warmth, Bad North restraint, ClaudeVille density (reboot PLAN §5;
  classical PLAN §4.4-4.6).
- **Composition**: horseshoe bay, land+piers fill 60-70% of the default frame, sky band at overview,
  "harbour heart" default camera (reboot PLAN §4.1; p1/VERDICT.md).
- **Signature grade**: soft ink outlines/rim, painterly grade, slight colour noise; saturated hue reserved
  for status and brand sails; restrained warm-stone/teal/slate environment (reboot PLAN §5).

## 6. Traps — looked like easy wins, broke before

1. **Cache cap below the working set** → LRU thrash: sail-sprite cache cap 128 vs ~150 visible rebuilt 5-18
   canvases per zoom frame (76895735). Raise caps only with measured cardinality (745da7f5).
2. **Governor keyed on one signal**: DPR keyed solely on JS draw time *raised* DPR on raster-bound machines;
   camera-interaction frames poisoned the 120-frame pacing window so the scheduler shed water/sparkles/birds
   for ~2 s after every pan/zoom (76895735). Harbour governor now requires GPU-bound evidence.
3. **Per-frame full scans**: nearest-water resolver re-scanned the whole plate every frame for ~20 off-plate
   tiles → ~10 ms JS/frame, tier recovery (a3de17ad). Keep SDF/lookups LUT'd and O(1)-rejected.
4. **Blind supersampling**: DPR-1 supersample climbed to 1.5× without measuring fill cost (a3de17ad) — now
   gated on measured GPU headroom.
5. **Late cache invalidation**: render caches not refreshed after late-arriving logo batches (37770aee);
   deferred asset-load invalidations must be batched (60fe5db3).
6. **Black frames**: (a) a single NaN/Inf pixel spreads through the bloom mip chain → whole-frame black
   (`post.ts` scrub pass); (b) adding a depth pass to a *running* pmndrs composer recreates its buffers and
   blacked the frame (`readings/fog.ts:78-83` now defers the insert). Any new EffectPass must be added at
   init or proven safe; the P7 "black-frame fix" (89b4251c) was exactly this class.
7. **Tier-change recompile hitch**: quality changes recompile shaders; cooldowns swallow them and CPU-bound
   frames must hold the rung (`governor.ts:10-14`).
8. **Measurement lies**: SwiftShader fiction (20-43 fps vs real 59) — never Playwright for perf; CI Firefox
   has no WebGL at all, default Chromium can silently fall to SwiftShader (TESTING.md:66-95); deep-linked
   ships absent from fixtures and same-document fragment navigations made the garden perf lane red-but-
   meaningless (8abe3322); gate on the worst second, not the average frame (44b9b07c); measure the *settled*
   still frame (9dd34ff8).
9. **Budget discipline both ways**: raising budgets silently = creep (b15cab96 was an honest measured raise);
   tightening after a diet prevents re-fattening (3a015980 re-tightened to measured+~10-12%).
10. **Determinism must survive optimization**: byte-identical routes were the acceptance bar for the 13 s→<2 s
    planning win (4a48bed6); sim tests will fail route drift.
11. **Zopfli determinism**: `.gz` must have no name/mtime; an existing valid `.gz` is kept so machines without
    zopfli don't churn tracked bytes (`compress-assets.mjs:4-8`) — never "recompress for a few bytes" ad hoc.
12. **Don't buy back frame budget with art regressions**: the overview cull (917→402 draws) was justified by
    the repo's own silhouette law (~0.7-unit features read as mud at that distance), then the headroom was
    *spent* on visible hero reflections (37dc031b) — the pattern to repeat: cut what cannot resolve, spend on
    what the operator sees.
13. **Workers need a measured case**: garden measured only 34 of 239 ms could leave the GL thread before
    rejecting the worker (beb6a8ca); harbour's warm-legs workers pass that test (0.7 s of pure path math).
    Apply the same bar to any new worker (e.g. payload parsing) — and note the CSP already allows workers.
14. **Procedural stand-ins and empty lawns**: procedural TS hero props never reached the bar; perf work must
    not thin the town/vegetation back to the "generic low-poly / empty lawns" failure mode (research/02 §2-4;
    reboot PLAN §5).

## 7. Open questions (operator/decision)

1. Is the missing cross-visit payload persistence (468c0ec0 pattern) at HEAD a decision or just un-ported
   harbour work? (No ruling found against it in the harbour era.)
2. `public/_headers` sets no `Cache-Control` for `/harbour/*` (CF default → revalidate): no commit or doc
   records a decision either way. If adding immutable caching there, filenames are not content-hashed
   (except kit/civic GLBs re-compressed per release) — needs a versioning answer first. (S8's territory; the
   prior-art finding is "no prior decision exists".)
3. `beb6a8ca`'s worker ruling is garden-specific: before re-proposing a worker for the harbour's per-poll
   model rebuild, someone must measure the harbour's rebuild cost the way beb6a8ca measured garden's.

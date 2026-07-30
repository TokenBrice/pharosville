# PharosVille: From "Nice" to "Breathtaking" — Rendering State-of-the-Art Plan

Date: 2026-07-29
Status: exploration/planning only — no code written yet
Inputs: full renderer audit of `main @ 3c5c72a` (v0.6.2), three.js mid-2026 capability scan (r185 era), technique extraction from 13 praised three.js/WebGL projects (Bruno Simon folio-2025, ZERO/BUNQ, Windland, Cerebrium, igloo.inc, Active Theory, takram, and others).

---

## 1. Goal and north star

Make PharosVille feel like an award-tier WebGL piece — the kind of scene that gets a "how is this running in a browser" reaction — **without** breaking the things that make it production-grade: the desktop viewport gate, the quality-tier color invariance, the 60fps floor on the operator's real GPU, the bundle budgets, and the no-Playwright-judgment testing rule.

North star, concretely: someone opens `https://pharosville.pharos.watch/` at dusk, the sky is doing real atmospheric scattering, the lighthouse beam throws visible volumetric shafts across mist, ships sit in the water with soft occlusion and their wakes persist behind them, wind visibly moves rain, flags, and water together — and the FPS footer still reads 59-60.

### What "breathtaking" means here (from the award-winner study)

The ten techniques that most separate award-winning three.js work from merely-nice work, mapped to PharosVille:

1. **Bake light, spend savings on post** (Windland, ZERO, CHILE20) — we already render the shadow map once per scene change; the win is redirecting that budget into AO, god rays, and a per-phase post chain.
2. **GPU-native asset budgets** (ZERO, Bruno Simon: KTX2/ETC1S + Draco/meshopt + atlases + self-hosted decoders) — we have meshopt; KTX2 is the open item.
3. **Instancing + vertex-shader animation over CPU/skeletal** (Windland, Paper Planes) — already our fleet pattern; extend to all ambient life.
4. **One master scalar drives everything** (ZERO's virtual scroll; our world clock + day-cycle already do this — keep it sacred).
5. **Measured adaptive quality tiers** (ZERO, Windland) — already our scheduler; new effects must plug into it, never bypass it.
6. **Texture upload as a frame-time budget** (ZERO: `createImageBitmap` + idle drain + `initTexture` prewarm) — we don't do this; it's invisible polish users feel.
7. **Tuned post chain per scene state** (Windland: day DOF / night bloom swap) — our single static chain is a big gap.
8. **Fake motion and light in shaders; move nothing** (Cerebrium's UV pulses) — already our light-lane philosophy; extend it.
9. **Procedural generation where content repeats** (igloo.inc) — our procedural island/fleet already; keep it.
10. **Environment as a system of systems** (Bruno Simon's dependency-ordered `DayCycles → Weather → Wind → Lighting/Water/Lanterns` graph) — **our biggest architectural gap**: we have a day cycle but no weather/wind system that everything else consumes.

The uncomfortable finding: PharosVille already does 4 of the 10 well (4, 5, 8, 9). The gap to "breathtaking" is the other six — and they are mostly *post-processing, atmosphere, and systemic weather*, not new content.

---

## 2. Current state — honest summary

**What's already strong** (do not break, do not rebuild):

- three **0.185.1** (current stable), React 19 shell, vanilla imperative renderer — the right architecture per 2026 practitioner consensus (R3F buys nothing here; stay vanilla).
- AgX tone mapping, 4×MSAA HalfFloat composer target, custom grade pass (lift/gamma/gain, split-tone, vignette), day-cycle-adaptive UnrealBloom (`src/three/garden-post.ts`).
- 1676-line custom water shader with ~12 subsystems (`src/three/garden-water.ts`), PMREM probe baked from the sky dome itself per day-phase (`src/three/garden-environment.ts`).
- Fleet instancing: 187 ships in 9 draw calls, logo sail atlas, hero-hull mirror reflections in one draw.
- A real quality scheduler (full/balanced/recovery/constrained + interaction tier), adaptive DPR, idle governor, tier color invariance.
- Perf tripwire: `npm run preview -- --assert` (tier `full`, p90 ≤ 20ms, ≤ 700 draw calls, 500k tris, 72 textures).

**The candid gaps** (what "nice, not breathtaking" looks like in code):

- **No ambient occlusion of any kind.** Ships ground into the water via painted instanced discs. This is the single cheapest-looking thing in the scene.
- **One static post chain.** No AO, no SMAA, no DOF, no selective bloom, no per-day-phase chain tuning. AA is MSAA-only, so glitter/ripple shimmer is hand-managed with `fwidth`.
- **No volumetrics.** The lighthouse beam is a mesh cone; no god rays, no mist banks, no volumetric clouds. Fog is a single linear `Fog`.
- **Sky is a gradient dome** + 720 star points + moon sphere — fine, but 2026 ships precomputed atmospheric scattering (takram) and volumetric clouds.
- **Weather is one rain curtain** (`garden-zones.ts`). No wind parameter, no storm states, no coupling between weather and water/wakes/sails/beam.
- **Water is a sine-sum heightfield**, not a Gerstner spectrum; wakes are per-ship ripple rings with no persistence; foam is not advected; reflections are shader lanes + inverted mirror columns (good fakes, but no planar/SSR fallback at `full`).
- **Camera is locked isometric orthographic** — pan/zoom only. No perspective mode, no cinematic moves; Observe mode only sequences pan/zoom.
- **WebGL-only.** No WebGPU path, no compute, no TSL. The r171–r185 frontier (RenderPipeline, GTAO/SSGI nodes, compute water, million-particle systems) is entirely untouched.

**The binding constraints** (every phase must reckon with these):

- Draw-call headroom: **~680 used of a 700 ceiling** at default framing (~400 whole-map). New geometry must be instanced into existing batches or something old must be shed. Budget guidance from the last audit: *batch it, don't raise the number.*
- Renderer chunk budget: 1.6MB raw / 420KB gz (raised by operator permission O9); currently ~830KB raw / ~225KB gz → **~190KB gz earmarked headroom**.
- Standing guidance from the 2026-07-27 cleanliness audit (all items shipped): **remove/simplify layers before adding any new rendering technique; at most one primary cue per concept per zoom level; preserve sea-first negative space around the island.** New effects must displace or absorb old ones, not stack on top.
- Never judge look/perf through Playwright (SwiftShader reads fiction). Look/frame-time calls go through `npm run preview` only.
- Tier color invariance: no tier may change semantic hues, palette authority,
  composer/grade/AgX, or vignette; enumerated fidelity effects may change
  bounded local luminance/contrast without changing meaning.

---

## 3. Key strategic decisions (must be settled before Phase 1)

### Decision A — WebGPU now, later, or never?

The 2026 landscape: `WebGPURenderer` is production-ready since r171 with automatic WebGL2 fallback; Safari 26 (Sept 2025) made WebGPU universal; the new `RenderPipeline` (r183, TSL node-graph post, MRT in one geometry pass) plus built-in `GTAONode`/`SSGINode`/`SSSNode` (r181) is where all the good new effects live. **But** classic `ShaderMaterial` GLSL is ignored by the WebGPU backend — our 1676-line water shader, sky dome, beacon fire, and grade pass would all need TSL ports, and Cerebrium's write-up documents TSL graph-compile costing ~20s startup (since improved ~3×) and every effect needing per-backend recalibration.

**Recommendation: defer the full WebGPU swap; structure for it.** The app's bottleneck is *not* GPU compute — it's authored fidelity (AO, atmosphere, volumetrics), most of which has mature WebGL implementations today (N8AO, pmndrs/postprocessing, takram atmosphere, screen-space god rays). Phases 1-4 ship on WebGL and deliver the breathtaking delta. Phase 5 is a timeboxed WebGPU spike whose go/no-go criterion is a working TSL port of the water shader with acceptable startup compile time. If the spike succeeds, the WebGL work largely ports (concepts and parameters transfer; GLSL→TSL is the cost either way).

Rejected alternatives: (a) WebGPU-first — gates everything on the riskiest, least reversible work; (b) never — leaves the r18x frontier (compute water, SSGI, million-particle life) permanently off the table; (c) R3F migration — buys ergonomics we don't need, inherits a second moving target, pmndrs' best pieces are WebGL-only anyway.

### Decision B — Post-processing stack on WebGL

EffectComposer is frozen legacy but works; **pmndrs/postprocessing** is the 2026 WebGL quality king (fused über-shader passes = fewer full-screen draws, selective mipmap-blur bloom, SMAA, DoF) and hosts N8AO. Migrating `garden-post.ts` to pmndrs is a Phase-1 enabler: it's the platform AO, per-phase chains, and better AA all hang off. Bundle cost is well inside the ~190KB gz headroom. It is WebGL-only — acceptable under Decision A, since RenderPipeline replaces it if Phase 5 lands.

### Decision C — Camera

Keep isometric orthographic as the default identity of the piece, but breathtaking needs *some* camera language. Lowest-risk: a cinematic "Observe 2.0" — spline dolly paths with a slightly-lowered pitch, easing, and subtle handheld noise, still orthographic, still within the existing camera state model. A true perspective mode is a bigger art-direction change (horizon, fog, LOD all retune) and is parked as a Phase-4 stretch item with an explicit operator sign-off gate.

---

## 4. Phased plan

Each phase ends with `npm run preview -- --assert` green on the operator's real GPU plus `npm run validate:release` before merge. Phases are independently shippable.

### Phase 0 — Baseline and spikes (0.5–1 day)

1. Capture the current baseline with the real-GPU path: `npm run preview -- --assert` numbers (tier, p90, calls, tris) + reference screenshots at overview/explore/analyze zooms, day/dusk/night, stored under `outputs/2026-07-29-breathtaking-baseline/`. Every later phase compares against these.
2. **Spike 1 — pmndrs/postprocessing**: swap the existing EffectComposer chain (RenderPass → UnrealBloom → grade → Output) for pmndrs equivalents in a branch. Go/no-go: identical-or-better frame (colors under tier invariance) at equal-or-better p90; renderer chunk delta recorded.
3. **Spike 2 — N8AO at half-res** on the island + hero hulls only. Go/no-go: visible grounding improvement at ≤1.5ms p90 cost on the real GPU.
4. **Spike 3 — screen-space god rays** (occlusion-buffer radial blur) masked to the lighthouse beam. Go/no-go: reads as volumetric at explore zoom without haloing artifacts at night.
5. Update `docs/pharosville/THREEJS_AGENT_REFERENCE.md` non-negotiables if the post stack changes hands.

### Phase 1 — Depth, grounding, and the post platform (2–4 days)

*Theme: the scene stops looking "flat-shaded diorama" and starts looking lit.*

1. **Migrate the post chain to pmndrs/postprocessing** (`src/three/garden-post.ts`): SMAA (replaces reliance on MSAA alone — kills the remaining glitter/ripple shimmer the `fwidth` hacks currently manage), selective mipmap-blur bloom preserving the day-cycle-adaptive threshold/strength behavior, the existing grade ported as a custom effect, vignette last. Keep the 4×MSAA HalfFloat target; keep tier color invariance exactly.
2. **N8AO ambient occlusion** at half resolution, distance-faded so overview zoom pays ~nothing. Ships, docks, island terraces, lighthouse ground in their medium; the painted contact discs stay as the `recovery`/`constrained` fallback (tier invariance = same grounding *intent*, different fidelity).
3. **Per-day-phase post tuning** (the Windland day/night swap): bloom strength/threshold, AO intensity, and grade presets become per-phase blends driven by the existing day-cycle scalar — one config table, no new runtime branching.
4. **Texture-upload budgeting** (the ZERO trick): `createImageBitmap` + `requestIdleCallback` drain + `renderer.initTexture` prewarm for the sail atlas, region field, and GLB textures; target: eliminate the first-upload hitch on world refresh (complements the known `replaceWorldContent` 239ms busy item from `agents/2026-07-26-improvement-ideas-prioritized.md`).
5. Shed to stay within budget: bloom moves into the fused chain (one less full-screen pass vs EffectComposer), AO replaces the visual *role* of some contact discs. Assert ≤ 700 calls, p90 ≤ 20ms at `full`.

### Phase 2 — Atmosphere and weather system (3–5 days)

*Theme: the sky becomes physics, and weather becomes a system, not a curtain.*

1. **Precomputed atmospheric scattering sky** via `@takram/three-atmosphere` (production-provenance, Bruneton model), replacing the gradient dome; sun elevation comes from the existing day-cycle scalar so sky/fog/water/light-rig stay coherent. The PMREM probe bake (`garden-environment.ts`) re-points at the new sky — one source of truth for environment light, as today. Keep the stylized palette authority: the takram output feeds the same grade/AgX, and the dusk-ember west band survives as an authored overlay. Fallback: keep the gradient dome if takram fights the art direction (it's tunable, but the ukiyo-e palette wins every argument).
2. **Volumetric god rays for the lighthouse beam** (Phase-0 spike result): occlusion buffer + radial blur, composited before bloom, masked to the beam cone; replaces the mesh cone at `full`/`balanced`, cone stays below. Storm/fog states (below) modulate shaft density.
3. **Height fog + mist banks**: exponential height fog in the water shader and as a scene pass, with 2–4 drifting billboard mist banks in the far sea lanes at dawn/night — one instanced draw, tier-gated. This is where "sea-first negative space" gets *more* atmospheric, not more cluttered.
4. **Wind as a first-class system** (the Bruno Simon graph): `src/systems/weather.ts` owns `{windDir, windSpeed, gustPhase, stormLevel}` driven by the world clock + seeded variation, and everything consumes it: water swell direction/chop (`garden-water.ts` region field), rain curtain slant (`garden-zones.ts`), sail/pennant flutter vertex phases (`garden-fleet-batch.ts`), cloud-shadow drift speed, gull paths, mist bank drift. One parameter set, six consumers — this is the single biggest "alive" upgrade.
5. **Storm states**: the existing PSI-stress signal already drives the beam sweep; extend it to stormLevel — rain intensity, swell amplitude, sky darkening, god-ray density, bloom threshold all follow. Danger zones get lightning: a single full-screen flash via the grade pass + brief shadow-light intensity spike (no new lights).
6. Clouds: defer true volumetrics (takram three-clouds / r184 volumetric-clouds approach) to Phase 5's WebGPU evaluation; in WebGL, add one layer of slow billboard cumulus at the horizon line, instanced, tier-gated, replacing *nothing* (the horizon stays geometry-free per the cleanliness audit — these live above the fog line, not on it).

### Phase 3 — Water 2.0 (3–5 days)

*Theme: the sea is 60% of the frame; it's where "breathtaking" is won.*

Current: sine-sum heightfield + ~12 fragment subsystems in one shader (`garden-water.ts`). Keep every authored subsystem (posterized depth bands, region tints, light lanes, moon road, karesansui rings — these are the identity); upgrade the physics and persistence:

1. **Gerstner spectrum displacement**: replace the 3-wave sine sum with 6–8 Gerstner components driven by the Phase-2 wind system (direction, amplitude, chop per region from the existing region-field DataTexture). Vertex cost is trivial; the payoff is directional, wind-coherent swell with sharp crests. Art direction stays posterized/stylized — Gerstner supplies *motion*, the fragment shader keeps the *look*.
2. **Persistent ship wakes**: a low-res (512²) ping-pong wake/trail render target in world space around the camera target; moving ships stamp decaying V-wakes; the water fragment shader samples it for foam and normal perturbation. One extra small target, zero draw-call growth at scene level (stamps go into the existing fleet batch's instancing path). This is the nullschool/flow-field trick applied to the harbor — motion that *remembers*.
3. **Foam advection**: crest foam from the Gerstner Jacobian + wake target, advected by wind — replaces the current static-threshold foam where they conflict (one primary cue per concept, per the cleanliness rule).
4. **Reflections at `full` only**: evaluate a half-res planar reflection (Reflector-style) for the island-facing harbor calm region, blended over the existing mirror columns + light lanes. Hard gate: must fit inside the 700-call / 20ms budget with DPR already adapted; if not, the current fakes stay (they're good fakes). SSR explicitly rejected: ortho camera + stylized posterized water make it all cost, no payoff.
5. **Caustic light under the Pharos**: extend the existing caustic island-glow subsystem with an animated caustic web around the lighthouse base at `full`, fed by the wake target.

### Phase 4 — Cinematics and world life (2–4 days)

*Theme: the piece gets a camera language and a pulse.*

1. **Observe 2.0**: spline-based dolly paths (Catmull-Rom through authored keyframes around the harbor districts), eased virtual progress (ZERO's single-driver pattern — one eased scalar, every segment a `{enter, scrub, update, teardown}` lifecycle that replays cleanly), subtle positional noise for handheld feel, still orthographic. Wakes the world-clock camera only; the interactive pan/zoom model is untouched.
2. **Ambient life upgrades within existing instanced draws**: gull flocks get a cheap boid-ish heading field (instanced, shader-side steering — no CPU per-bird work); fireflies gain wind-coupled drift; a new "harbor gulls scatter" beat when the storm level crosses a threshold.
3. **Data-pulse shaders** (Cerebrium's "nothing moves" trick): the busiest trade routes get UV-scroll pulse lanes — per-path randomized phase/speed so nothing syncs robotically. Reuses the light-lane DataTexture registry (`garden-lanterns.ts`); zero new scene geometry. Mint/burn cargo tide already does this for crates — extend the same idiom to the routes themselves.
4. **Presence as ambient entities** (Paper Planes pattern): *evaluate only* — other live viewers as distant dim lights beyond the fog line. Cheap (one instanced draw), but requires a server-side presence feed that doesn't exist today; park behind an API decision, do not build the backend as part of this plan.
5. **Stretch (operator sign-off required): perspective camera mode** at deepest zoom ("deck level"), a controlled 3D peek rather than free orbit. Parked unless Phases 1-3 land under budget; horizon, fog, and LOD retune is the hidden cost.

### Phase 5 — The WebGPU leap (timeboxed spike → optional program)

*Theme: cross the frontier only if the spike proves it cheap.*

1. **Timeboxed spike (≤ 2 days)**: `WebGPURenderer` via `three/webgpu` behind a runtime flag with the automatic WebGL2 fallback; port the *water shader only* to TSL (the hardest asset — if it ports, everything ports); measure TSL graph-compile startup time and `full`-tier p90 on the operator's GPU + one Safari 26 device.
2. **Go criteria**: startup compile ≤ 3s (cached thereafter), p90 ≤ WebGL baseline, fallback path verified on Safari < 26 / old iOS, and the testing story still holds (real-GPU gate must be able to force both backends).
3. **If go**, in priority order: (a) post chain → `RenderPipeline` with MRT (one geometry pass emits color+normals+material data — kills the multi-pass tax); (b) N8AO → built-in `GTAONode` with temporal filtering, evaluate `SSGINode` for lantern bounce at night; (c) compute water — the r182 `webgpu_compute_water` approach replaces the Gerstner heightfield with a real height-field sim, with ship wakes as boundary conditions (the Phase-3 wake target becomes a compute read/write); (d) compute particles — million-particle spray/foam/gull-murmuration at storm peak, feature-gated (compute never falls back); (e) `BatchedMesh` + indirect draw for fleet growth beyond 320 when the coin catalog allows it.
4. **If no-go**: the WebGL work from Phases 1-4 stands on its own; revisit at r187+.

### Explicitly not doing (and why)

- **R3F migration** — wrong tool for a bespoke perf-tuned imperative world (Decision A research).
- **Gaussian splatting (Spark etc.)** — photoreal captured set-dressing fights the authored ukiyo-e art direction; the hard part (capture→train→compress) buys nothing here.
- **HTMLTexture** — Chrome-only.
- **FFT/JONSWAP ocean** — realism overkill for a posterized stylized sea; Gerstner + persistence is the cost/art sweet spot (WebGL). Compute water is the *correct* form of this ambition if Phase 5 lands.
- **True volumetric clouds on WebGL** — raymarched clouds at ortho isometric angles are all cost; billboards carry the look until Phase 5 re-evaluates.
- **SSR, TAA, PCSS** — wrong camera, artifact-prone, and not-in-core respectively, for negative payoff at this art direction.

---

## 5. Non-negotiables carried into every phase

From `docs/pharosville/THREEJS_AGENT_REFERENCE.md`, `VISUAL_INVARIANTS.md`, and the 2026-07-27 cleanliness audit:

- One renderer, one RAF; no hot-path allocation; 320-instancing fleet contract.
- Tier color invariance — no tier changes semantic hue, palette, grade, or
  tone mapping; enumerated fidelity effects may shed bounded local
  luminance/contrast, never meaning.
- Remove/simplify before adding; at most one primary cue per concept per zoom level; sea-first negative space around the island.
- Desktop gate untouched (long side ≥ 900 AND short side ≥ 720, size tests only, never orientation).
- Draw calls ≤ 700, p90 ≤ 20ms at `full`, renderer chunk ≤ 1.6MB raw / 420KB gz — or get explicit operator permission to move a budget, citing measured numbers (the O9 precedent).
- `PHAROS_API_KEY` stays server-side; browser calls same-origin `/api/*` only (unchanged by all of the above).

## 6. Validation protocol (per phase)

1. Smallest relevant check while iterating; `npm run validate:changed` for mixed scope; `npm run validate:release` before merge.
2. `npm run preview -- --assert` on the operator's real GPU — the only legitimate look/perf judge. Never Playwright frame times (SwiftShader reads `recovery` at 20-43fps where the real GPU reads `full` at 59).
3. Visual diff against the Phase-0 baseline screenshots at all three zooms × day/dusk/night; every perceptible change must be intentional.
4. Bundle: `npm run check:bundle-size` — record the renderer-chunk delta per phase against the ~190KB gz headroom.
5. After any deployed phase: `npm run smoke:live -- --url https://pharosville.pharos.watch`.

## 7. Effort and sequencing summary

| Phase | Theme | Effort | Risk | Breathtaking-per-day |
|---|---|---|---|---|
| 0 | Baseline + 3 spikes | 0.5–1d | low | — |
| 1 | AO + pmndrs post + upload budgeting | 2–4d | low-med | high (grounding) |
| 2 | Atmosphere + wind/weather system | 3–5d | med | highest (mood + aliveness) |
| 3 | Water 2.0 (Gerstner, wakes, foam) | 3–5d | med | highest (60% of frame) |
| 4 | Observe 2.0 + life + data pulses | 2–4d | low | high (cinematics) |
| 5 | WebGPU spike → optional program | 2d spike | high | frontier-only |

Suggested order is 0 → 1 → 2 → 3 → 4 → 5-spike. Phases 2 and 3 can swap if wind-driven water coherence argues for doing them together (the Gerstner displacement consumes the wind system; landing 2 first keeps 3 small).

## 8. Key sources

- three.js 2026 state: [utsubo threejs-2026](https://www.utsubo.com/blog/threejs-2026-what-changed), [three.js releases](https://github.com/mrdoob/three.js/releases), [Maxime Heckel TSL field guide](https://blog.maximeheckel.com/posts/field-guide-to-tsl-and-webgpu/), [threejsroadmap post-processing 2026](https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026), [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing), [N8AO](https://www.npmjs.com/package/n8ao)
- Award-winner breakdowns: [Bruno Simon folio-2025 repo](https://github.com/brunosimon/folio-2025), [ZERO engineering (Codrops)](https://tympanus.net/codrops/2026/07/17/zero-the-engineering-behind-a-defiant-interactive-narrative/), [Windland case study (Codrops)](https://tympanus.net/codrops/2022/04/25/case-study-windland-an-immersive-three-js-experience/), [Cerebrium (Codrops)](https://tympanus.net/codrops/2026/07/23/building-cerebrium-making-serverless-infrastructure-tangible/), [igloo.inc showcase](https://www.webgpu.com/showcase/igloo-inc-procedural-crystals/), [takram three-geospatial](https://github.com/takram-design-engineering/three-geospatial)
- Water canon: [david.li/waves (FFT)](http://david.li/waves), [Shadertoy Seascape](https://www.shadertoy.com/view/Ms2SD1), [Evan Wallace WebGL Water](https://madebyevan.com/webgl-water/), [WebTide (WebGPU FFT)](https://github.com/BarthPaleologue/WebTide)
- Internal: `docs/pharosville/THREEJS_AGENT_REFERENCE.md`, `docs/pharosville/VISUAL_INVARIANTS.md`, `docs/pharosville/TESTING.md`, `agents/2026-07-27-threejs-rendering-cleanliness-audit-plan.md`, `agents/2026-07-26-improvement-ideas-prioritized.md`

## Implementation record (updated 2026-07-30)

Phases 1–4 produced retained WebGL work in the uncommitted tree. The Phase 5
experiment produced a valid NO-GO result but was not a shippable backend; its
production route and modules were removed in the follow-up. The original
per-phase preview runs established performance, not complete correctness:
later audits found camera, wake, sail, water-math, and whole-map resource
regressions tracked by the follow-up plan.

| Phase | Status | Implementation record |
|---|---|---|
| 0 baseline + spikes | **incomplete/substituted** | pmndrs and N8AO were evaluated, but the required reproducible baseline matrix was not preserved |
| 1 post platform | **delivered; follow-ups open** | pmndrs chain, N8AO, and per-phase post table landed; upload scheduling and direct post coverage remain follow-ups |
| 2 atmosphere + weather | **substituted; review open** | deterministic weather landed; the sky is authored analytic rather than the named precomputed technique, and billboard/fog/beam treatments require visual review |
| 3 water 2.0 | **delivered; repair open** | Gerstner, wake, whitecap, and caustic work landed; derivative, pass-order, persistence, and reduced-motion defects are tracked separately |
| 4 cinematics + life | **delivered; repair open** | Observe 2.0, ambient wind coupling, and route pulse lanes landed; interruption, clock, resize, and tier-capacity defects are tracked separately |
| 5 WebGPU spike | **failed spike; removed** | r185 measurements proved the production look lacked shader and post parity. The query route, backend, TSL probe, harness, and spike budgets were removed; the historical report is retained |

Bundle trajectory (renderer chunk): 931 KiB raw / 259 KiB gzip at the
Phase-0 baseline → 1257.3 / 420.4 after Phase 4 → 1415.2 / 465.0 with the
Phase-5 spike's shared-core carry-over. Gzip cap raised 420 → 454 (Phase 4,
measured+8%) → temporarily 480 (Phase 5, measured+3%). Removing the failed
spike restored the 454 KiB renderer and 820 KiB aggregate gzip caps; the
production checker now rejects the former WebGPU/TSL chunk names.

Deferred:

- **Presence entities** (Phase 4 item 4): needs a server-side presence feed
  that does not exist; no backend built, deliberately.
- **Perspective camera mode** (Phase 4 item 5): parked pending explicit
  operator sign-off.
- **WebGPU migration**: NO-GO at r185. Revisit only when the report's parity,
  fallback, and hardware-gating conditions change, using an isolated entry.
- **Visual tuning**: storm/bloom/lightning/pulse-lane/tour feel constants
  are preview-verified only; remaining polish passes are owned by operator
  preview (`npm run preview`), never by Playwright readings.

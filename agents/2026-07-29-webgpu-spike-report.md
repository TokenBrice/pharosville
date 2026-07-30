# Phase 5 WebGPU spike — go/no-go report

**Date:** 2026-07-29 · **Verdict: NO-GO for a WebGPU migration at three r185.**

Timeboxed spike per `agents/2026-07-29-breathtaking-rendering-plan.md` §Phase 5.
The spike temporarily exposed `?webgpu=1` / `?webgpu=compat` while these
measurements were collected. It preserved the default WebGL frame behavior,
but it did **not** leave the default production build byte-identical: Rollup
moved WebGPU-only `three.core` exports into the default renderer chunk, adding
about 157.9 KiB raw / 44.6 KiB gzip.

**Follow-up, 2026-07-30:** the NO-GO backend, query switch, TSL probe, and
measurement harness were removed from the production repository. The
production build now rejects WebGPU/TSL spike chunk names. This report remains
as historical evidence, not as a supported test route.

## Preserved evidence

Evidence was captured as
`outputs/webgpu-spike-{day,night,compat}.{png,json}`,
`outputs/flame-closeup-{webgl,webgpu}.png`, and `outputs/webgl-night.png`.
Those scratch artifacts and the historical measurements below are the record;
the removed query routes cannot be reproduced from the current production
entry.

## Headline measurements (operator's RTX 5070 Ti, Dawn adapter `nvidia/blackwell`)

| measurement | WebGPU (`?webgpu=1`) | WebGL2 compat (`?webgpu=compat`) | WebGL baseline |
|---|---|---|---|
| adapter/backend | `webgpu` (nvidia/blackwell) | `webgl2` (forced) | ANGLE/Vulkan NVIDIA |
| `renderer.init()` wall time | 68.5–77.4 ms | 7 ms | — (sync ctor) |
| `three/webgpu` chunk load (dev server) | 36.8–87 ms | 48.9 ms | — |
| factory start → first world frame | 247–308 ms | 213 ms | — |
| navigation → `data-renderer-status=ready` | 847–1005 ms | 662 ms | ~1 s (dev) |
| TSL flame `compileAsync` (cold / warm) | 45.1 ms / 24.2 ms | 21.1 ms | — |
| frame (vsync 60 Hz) | 59.96 fps, p50=p90=16.7 ms, tier `full` | 60.0 fps, p90=16.7 ms, tier `full` | 60 fps, p90=16.7 ms, tier `full` |
| draw calls | 844–935 (direct render, no post) | 897 | 611–623 (with post) |

Caveat on the frame numbers: under the flag the pmndrs composer is **bypassed** (it is WebGL-only), so the WebGPU frame renders the scene straight to canvas with no N8AO/bloom/grade/SMAA. Vsync-bound 16.7 ms without post is NOT evidence that a full WebGPU stack with equivalent post meets p90 ≤ the WebGL baseline — it only shows the renderer core is not slower on this frame.

## Subsystem inventory under `?webgpu=1`

Classification from the day/night screenshots and the console: three r185 logs `THREE.NodeBuilder: Material "ShaderMaterial" is not compatible.` (21 instances at boot) and substitutes an **empty default NodeMaterial** — so classic GLSL surfaces render black/invisible rather than throwing. `onBeforeCompile` is silently ignored (the function is copied onto the node material as a property and never called), producing the renders-wrong class.

| subsystem | status | why |
|---|---|---|
| island, docks, terraced terrain | **works** | `MeshStandardMaterial` → `MeshStandardNodeMaterial` via the compat layer (`NodeLibrary.fromMaterial`) |
| lighthouse GLB shell + hero GLB hulls | **works** | standard/physical materials upgrade; textures upload fine |
| fleet batch (320 instanced) | **renders-wrong** | base material upgrades and hulls look right, but the sail-atlas cell addressing and per-instance tint live in `onBeforeCompile` patches — silently dropped → pale, logo-less sails |
| harbor/ship lanterns, emissives, contact-shadow discs | **works** | `MeshBasicMaterial`/standard materials upgrade |
| water (Gerstner, 1,043 GLSL lines) | **invisible** | `ShaderMaterial` has no node class → default empty NodeMaterial; the sea is black |
| sky dome + stars/moon | **invisible** | same; scene background/fog therefore black |
| volumetric beam (3 ShaderMaterials) | **invisible** | same |
| beacon fire (flame/embers/smoke) | **invisible as GLSL**; the flame is swapped for the TSL probe under the flag (see below) | same |
| gulls, summit birds | **invisible** | `ShaderMaterial` wings |
| hero reflections | **invisible** | `ShaderMaterial` mirror columns |
| sky billboards (clouds) | **invisible** | `ShaderMaterial` |
| wakes (Phase 3) | **stubbed by the spike** | GLSL ping-pong feedback + stamp passes through `setRenderTarget`; not attempted |
| PMREM sky probe (W6.5) | **stubbed by the spike** | `PMREMGenerator.fromScene` on a classic `ShaderMaterial` dome; node-based PMREM exists in the webgpu build but the dome itself would need a TSL port first |
| pmndrs post chain + N8AO + grade | **bypassed by the spike** | `postprocessing`/`n8ao` are WebGL-only. This is the whole Phase 1–4 post stack — no WebGPU equivalent exists off the shelf |
| shadow mapping | **works, with one error** | PCFSoft shadows render; one `Destroyed texture [Texture "ShadowDepthTexture"] used in a submit` validation error per session (dynamic shadow mapSize switching disposes a texture the WebGPU backend still references — an r185 backend bug) |

The frame still reaches tier `full` at vsync with 185 ships because the *majority of pixels* (island, fleet, heroes, lanterns) are standard materials. But the picture is not PharosVille: no sea, no sky, no fire, no beam, no grade.

## TSL feasibility probe (beacon flame)

The flame was the smallest shader that exercised the machinery the water needs: value-noise fbm, `fwidth` screen-space AA, discard, posterized bands, HDR gain. Its spike-only TSL probe was removed after the WebGPU no-go decision.

- **Size:** 69 GLSL lines → 74 TSL lines (≈1:1.07). The vertex stage needs no port (`uv()` + default pipeline).
- **Compile:** 45.1 ms cold / 24.2 ms warm on real WebGPU (`compileAsync` in an empty scene); 21.1 ms on the WebGL2 backend. Extrapolating by size, the 1,043-line water port is ≈0.4–0.7 s of one-time pipeline compile — inside the plan's ≤3 s cached-startup budget, but paid at first frame unless precompiled.
- **Fidelity:** same teardrop silhouette, same three-band posterization, same vermillion fringe (compare `outputs/flame-closeup-webgl.png` vs `-webgpu.png`). The remaining delta is the missing post chain (bloom spreads the warm halo in the WebGL shot), not the port.
- **Gotchas found:** TSL `If`/`Discard` throws on a null stack unless wrapped in a `Fn()` body; `fwidth` exists; TSL `uniform()` does not bind classic `{ value }` uniform objects — the probe syncs the CPU-written `uTime/uFlicker/uIntensity` values into TSL uniform nodes once per frame.

## Port-surface inventory (the migration bill)

Classic GLSL that must be ported or replaced before a WebGPU frame is PharosVille:

| file | ShaderMaterials | GLSL lines | onBeforeCompile patches | injected lines (approx) |
|---|---|---|---|---|
| `src/three/garden-water.ts` | 1 | 1,043 | — | — |
| `src/three/garden-beacon-fire.ts` | 3 | 149 | — | — |
| `src/three/garden-lighthouse.ts` | 3 | 127 | 5 | ~18 |
| `src/three/garden-sky.ts` | 2 | 101 | — | — |
| `src/three/garden-sky-billboards.ts` | 1 | 88 | — | — |
| `src/three/garden-wakes.ts` | 2 | 66 | — | — |
| `src/three/garden-hero-reflections.ts` | 1 | 53 | — | — |
| `src/three/garden-summit-birds.ts` | 1 | 31 | — | — |
| `src/three/garden-ship-gulls.ts` | 1 | 29 | — | — |
| `src/three/garden-fleet-batch.ts` | — | — | 2 | ~35 |
| `src/three/garden-island.ts` | — | — | 2 | ~13 |
| `src/three/garden-post.ts` (pmndrs grade Effect) | 1 | 38 | — | — |
| **total** | **16** | **1,725** | **9** | **~66** |

Plus the WebGL-only dependencies that need replacing, not porting: `postprocessing` (pmndrs composer, bloom, SMAA, grade pass) and `n8ao` → `RenderPipeline` + `GTAONode` per the plan's Phase-5-if-go ordering. The water shader alone is ~15× the probe — at the probe's measured 1:1.07 line ratio and ~25–45 ms compile per ~70 lines, budget **~2–3 weeks of porting + retune** for the shader surface and **~0.4–0.7 s** of added first-compile time.

## Go criteria scorecard (plan §Phase 5)

| criterion | result |
|---|---|
| startup compile ≤ 3 s (cached thereafter) | **met for the spike scope** (≤1.1 s ready, 0.25–0.31 s to first frame, 24–45 ms TSL compiles); projected ≤ ~1.5 s with the water ported. Not decisive. |
| p90 ≤ WebGL baseline | **not evaluable** — the spike bypasses the post chain (no WebGPU post exists); direct render is vsync-bound, but that is not the production frame. |
| fallback verified (Safari < 26 / old iOS) | **not met** — `forceWebGL` WebGL2 compat boots at 60 fps headless on this machine, but no Safari/iOS device was available to this spike. |
| testing story holds | **weakened** — headless Chrome on this Linux box exposes only a SwiftShader (CPU) WebGPU adapter; the real `nvidia/blackwell` adapter requires HEADED Chrome + `--enable-unsafe-webgpu --enable-features=Vulkan`. The real-GPU gate (`preview.mjs`) is headless; it can drive the flag via `--url` but only ever measures the compat backend or a CPU adapter. A real-WebGPU gate would need a headed lane. |
| working TSL water port (the spike's named go/no-go hinge) | **not attempted at water scale** — the probe says the port is mechanical (1:1.07 lines, ms compiles, good fidelity), but the water is 1,043 lines with 20+ uniform surfaces (lanes, zones, cloud shadows, ripple rings, wakes texture, harbor calm mask), and its fragment shader consumes systems (wakes, lane registry) that would each need porting first. |

## Recommendation: NO-GO at r185

1. **The entire authored look is GLSL** — 1,725 lines across 16 ShaderMaterials plus 9 `onBeforeCompile` patches. r185's compat layer upgrades standard materials (which is why 70% of the frame survives) but classic `ShaderMaterial` gains *nothing*: it renders as an empty default NodeMaterial. A migration is a full port of the water, sky, beam, fire, wakes and reflection systems, not a renderer swap.
2. **The post stack has no WebGPU path today.** Phases 1–4 (N8AO, pmndrs bloom/SMAA, fused grade+tone-map) are WebGL-only; parity requires a `RenderPipeline` + `GTAONode` rebuild and re-tune *before* the p90 criterion can even be measured honestly.
3. **Fallback and testing criteria are unproven** (Safari untested; headless real-WebGPU gating unavailable on Linux).
4. **Nothing urgent is bought.** The frame is vsync-bound on WebGL today; the bottleneck is authored fidelity, which Phases 1–4 already addressed on WebGL. WebGPU's unique wins (compute water, compute particles) are a program, not a spike, and should be justified after a TSL water port exists.

**What the spike proved for later:** the renderer core is fast (init 68–77 ms, vsync-bound direct render), the compat layer covers every standard material in the world, the WebGL2 compat backend gives a single-codebase fallback (60 fps headless), and TSL ports at ~1:1 line cost with good fidelity and millisecond compiles. The r185 blocker observed — `ShadowDepthTexture` destroyed-texture validation on dynamic shadow `mapSize` switches — should be rechecked next round.

Revisit only when the migration conditions change, not because a particular
Three.js version exists: (a) the operator schedules a TSL port of
`garden-water.ts` as its own phase; (b) `RenderPipeline` + `GTAONode` are
demonstrated at parity with the current pmndrs+N8AO frame; (c) the real-WebGPU
gate has a maintainable headed or hardware-backed lane; and (d) the target
fallback browsers are tested. A future spike must use an isolated entry or
worktree and contribute zero modules or bytes to the production graph.

## Historical spike implementation

The temporary implementation consisted of an async renderer detour in
`world-renderer.ts`, a WebGPU factory, a TSL beacon-flame feasibility probe,
flag-parser tests, and a headed measurement harness. It also widened the frame
loop to accept a sync-or-promise renderer and raised three spike chunk budgets,
the renderer gzip budget from 454 to 480 KiB, and aggregate JS from 3,200/820
to 3,600/1,100 KiB.

The 2026-07-30 follow-up deleted the backend, probe, parser tests, and harness;
restored the synchronous WebGL factory and the 454 KiB renderer / 820 KiB
aggregate gzip caps; and added a production bundle assertion forbidding the
former WebGPU/TSL chunk names.

## Historical validation

- `npm run typecheck` — clean.
- `npx vitest run src/three src/renderer` — 397/397 pass (36 files).
- `npm run build` + `npm run check:bundle-size` — pass (renderer chunk 1,382.0/454.1 KiB, webgpu chunk 658.0/184.9 KiB, totals 3,232.2/994.7 KiB).
- `npm run preview -- --assert` (default path, real GPU) — PASS: tier `full`, p90 16.7 ms, 623 calls.
- `npx eslint` on all touched files — clean.

## Removal validation

- `npm run build` — pass; 385 modules transformed and no WebGPU/TSL chunk
  emitted.
- `npm run check:bundle-size` — pass; renderer 1,258.2 KiB raw / 420.9 KiB
  gzip, total JS 2,437.1 / 771.4 KiB. These are binary KiB from the budget
  checker; Vite reports the same files in decimal kB.
- `npm run test:guard-scripts` — pass, including the forbidden-chunk fixture.
- `npm test -- src/three/world-renderer.test.ts` — 12/12 pass.

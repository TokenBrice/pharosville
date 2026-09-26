# Rendering headroom & enabling techniques — headroom

## Verdict
The @1x/60 Hz baselines understate the operator's real load by about 7×. The M5 Pro MacBook runs PharosVille at DPR 2 (~6 MP, under the 8 MP cap, `render-surface-budget.ts:1,208-209`) and at display rate, 120 Hz, because the loop only gates idle frames (`use-world-render-loop.ts:538`). The `gpu` line in every `.txt` does not measure pass cost: per-pass values sum to ~45 ms against a 13.9 ms frame (`noon.txt`), and `golden.txt`/`morning.txt` report a frame p50 of 17.2/17.3 ms with 0 dropped frames. Nobody can honestly spend GPU ms today. Triangles (118k free) and draws (~410 free) are plentiful; textures are full (whole-map at 72/72). At 120 Hz the binding costs are CPU per-frame work and retina fill. So the leap is shader-only beauty (volumetric air, cloth, sky), funded by three reclaims: a 60 Hz ambient cadence, a post chain sized in CSS pixels, and cutting the 84 hairline wake draws.

## What I looked at
- **Baseline frames:** `noon.png`, `noon-1440p.png`, `golden.png`, `night.png`, `selected-ship.png`, plus every `outputs/opus-review/*.txt` (the `frame`/`gpu`/`motion`/`draw` lines, compared across all 15).
- **My captures (5 of 6):**
  - `outputs/opus-review/headroom/census.png`: draw census, tier `full`, 279 draws reconciled. This was the first capture, run before the swarm peaked.
  - `golden-dpr2.png`: first attempt timed out at screenshot; the retry rendered an empty world (fleet 0).
  - `golden-dense-dpr2.png` and `noon-dpr2.png`: both fell to tier `constrained`. CPU-only metrics doubled (motion sample 3.3 vs 1.6 ms), which shows machine-wide contention. **All DPR-2 probes are void.** I quote none of their timings.
- **Crops (derived from baselines):** `headroom/crop-ship-wake.png`, `crop-reflection.png`, `crop-far-fleet.png`, `crop-tiltshift.png`, `crop-night-beam.png`.
- **Code:**
  - `garden-post.ts`: GPU timer at 1100-1216; chain at 1491-1639; W0.2 AA A/B at 1497-1537; god rays at 830-837 and 1084-1090; bloom levels at 158.
  - `world-renderer.ts`: shadow map at 883-891 and 1984-2003; `updateShadows` at 3994-4111; reflection layer at 3272-3309; frame sequence at 1365-1498.
  - `garden-hero-reflection-pass.ts:71-139`, `garden-ships.ts:2838-2861`, `garden-fleet-batch.ts:1064-1080,1237-1251`, `garden-lighthouse.ts:933-1095`, `garden-water.ts:1150-1163,1326-1400`, `garden-water-contract.ts:27,37`.
  - `render-scheduler.ts`, `render-surface-budget.ts:1-17`, `use-world-render-loop.ts:538,828-917`, `preview.mjs:88-89,113-130,623`.
- **Docs and history:** `docs/pharosville/TESTING.md:80,326-388`, `THREEJS_AGENT_REFERENCE.md:14-18`, `agents/2026-07-29-webgpu-spike-report.md`, `agents/pharosville-reborn/reviews/render-perf-budget.md`, the decision ledger, plan §6.

### Headroom table (reference M5 Pro, noon rest frame)

| Resource | Current | Ceiling | Free | Note |
| --- | ---: | ---: | ---: | --- |
| Draw calls (recurring) | 277–293; census 279 | 700 (`preview.mjs:115`) | ~410 | 84 are hairline wake lines, 24 are post quads, ~21 are hero-reflection repeats |
| CPU cost per draw | ~11 µs [INFERENCE: 3.1 ms submit / 279] | — | — | +100 draws ≈ +1.1 ms main thread |
| Triangles | 378–382k | 500k | ~118k | rim+flora 117k, fleet 93k (184 ships), lighthouse 73k, reflection repeats ~48k |
| Geometries | 192–202 | 500 | ~300 | not binding |
| Textures (`renderer.info`) | 50–52 | 72 | ~20 | what `--assert` reads |
| Textures (census, renderer allocations) | 67 default, **72 whole-map** | 72 | **5 / 0** | `TESTING.md:382-388`: "do not raise". **Binding.** |
| CPU per frame | sample 1.5–1.8 + hits 0.3–0.6 + submit 2.5–3.6 = **4.3–6.0 ms** | 16.7 (60 Hz) / **8.3 (120 Hz)** | ~11 / **~2.5–4** | at 120 Hz the CPU is the tight resource |
| GPU @1600×1000@1x | not measurable from the `gpu` line (see Spell-breaker 1); held 120 fps / p50 8.3 ms on 2026-08-13, before god rays, tilt-shift and hero reflection (`garden-post.ts:1527-1529`) | 16.7 / 8.3 | ≥8 ms at 60 Hz; **unknown at 120 Hz today** | |
| GPU @2560×1440@1x (3.7 MP) | 60 fps, 0/120 dropped (`noon-1440p.txt`) | 16.7 | >0, not quantified | |
| GPU @DPR 2 (~6 MP, the operator's display) | **unmeasured serially** | 8.3 @120 Hz | **unknown** | measure first (idea 4) |
| three.js | 0.185.1, postprocessing 6.39.4, n8ao 2.0.0 (`package.json:81-95`) | — | — | Same revision as the July NO-GO spike, so **nothing new is unlocked**: 1,725 GLSL lines, no pmndrs/N8AO WebGPU path (`webgpu-spike-report.md:106-111`). WebGL2 stays. |

### Technique cost catalogue (Δ vs noon rest, 1600×1000@1x)
All ms figures are **[INFERENCE]** from pixel and tap arithmetic. Basis: an M-series Pro GPU does a bandwidth-bound RGBA16F full-screen read+write at 1.6 MP (~26 MB) in about 0.1 ms. Multiply every per-pixel figure by ~4 at DPR 2, and halve the frame budget at 120 Hz. Verify each one with idea 4's knockout harness.

| Technique | Δdraws | Δtris | ΔGPU ms | Δtex | Risk | Tier gating | Verdict |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Analytic in-scatter in the fused grade pass: height fog + sun Mie + beacon beam (idea 2) | −3 (beam cone, dust, halo) | −~1.3k | +0.10–0.20 | 0 | double fog with `Fog` (`garden-sky.ts:512`) | full/balanced; recovery = fog only | **Do** |
| Existing shadow-march god rays (36 steps, half res) | 0 | 0 | +0.3–0.6 (dawn/golden only) | 1 | — | full | Keep; fold into the above at 16 steps |
| Screen-space radial shafts | +2 | 0 | +0.1 | +1 | ghosts through occluders (`garden-lighthouse.ts:952-955`) | — | Reject |
| Raymarched froxel volume | +2–3 | 0 | +0.6–1.2 | +1 (3D) | overkill for a clear harbour | — | Reject |
| PCSS-lite contact hardening (16 blocker + 16 PCF taps) | 0 | 0 | +0.2–0.4 | 0 | patches `shadowmap_pars` for every MeshStandard | full only | Do, low sun only (idea 8) |
| VSM/ESM prefiltered static map | 0 (+2 on re-steer) | 0 | −0.05 | +1–2 | light bleeding on terraces; texture slots | — | Reject (texture ceiling) |
| Cascaded shadows | +casters on re-steer | +~250k on re-steer frames | +0.05 | +1–2 | fitted plate already covers the view (`world-renderer.ts:4007-4046`) | — | Reject (plan §6:344 still right) |
| Hero planar reflection (exists) | 21 | ~48k | +0.3–0.5 | 1 | — | frozen when reduced | Keep; LOD it (idea 7) |
| Near fleet in hero reflection via `fleet-far-*` proxies | +6 | +3k | +0.05–0.1 | 0 | instance filtering | full | Optional |
| SSR on water | +1 pass | 0 | +0.4–0.8 | +2 (MRT) | patch every material for normal/mask | — | Reject |
| TAA / TRAA / temporal upsampling | +1–2 | 0 | +0.2 | +2–3 | velocity needs previous instance matrices, but the sail program is at the 16-attribute cap (`garden-fleet-batch.ts:1070-1073`); ghosting on bobbing hulls | — | Reject (contract stands) |
| Supersampling (DPR 1.5 on DPR-1 monitors) | 0 | 0 | scene fill ×2.25 (+1–2) | 0 | fill on weak GPUs; governed | full + governor | Do (idea 1) |
| Alpha-to-coverage | 0 | 0 | 0 | 0 | no `alphaTest` materials exist | — | N/A |
| Cloth sail billow, vertex only (idea 5) | 0 | 0 (+20–40k if sails ×4 tessellated) | +0.02 | 0 | hit targets use CPU geometry | all; reduced = static belly | Do |
| Foliage wind (exists, `garden-flora.ts:148`) | 0 | 0 | ~0 | 0 | — | — | Extend to rim pines |
| Far-fleet impostors (exist: `fleet-far-*`, 6 draws, 3.3k tris) | — | — | — | — | octahedral atlases cost textures | — | Done; do not re-open |
| Cloud dome in the existing sky shader | 0 | 0 | +0.10–0.25 | 0 (procedural) / +1 | must obey the PSI clarity channel (D15) | full 4 octaves, balanced 2 | Do (sky lane) |
| Petals/fireflies as one GPU-animated `Points` draw each | +1 each | 0 | <0.05 | 0 | overdraw at DPR 2 if sprites >8 CSS px | full/balanced; reduced = few static | Do |
| N8AO full res or more samples | 0 | 0 | +0.3–0.6 | 0 | invisible under grade (`garden-post.ts:221-226`) | — | Reject |
| FFT ocean | +1–2 | 0 | +0.5–1 | +2–4 | texture ceiling | — | Reject (plan §6) |

## Spell-breakers (defects)
1. **The GPU cost oracle reports fiction.**
   - What is wrong: per-pass values are near-equal (~9 ms each) and sum to ~45 ms against a 13.9 ms frame (`noon.txt`). `golden.txt` and `morning.txt` report a frame p50 of 17.2/17.3 ms with 0/120 dropped at vsync 60. `wholemap-dusk.txt` puts SMAA at 10.3 ms for three full-screen draws.
   - Cause [INFERENCE]: ANGLE Metal attributes whole command-buffer or wait time to each `TIME_ELAPSED` query (`garden-post.ts:1100-1216`).
   - Consequence: the debug HUD's "ms p95" and `--max-gpu-ms` (`preview.mjs:128`) cannot allocate budget. Every lane's ΔGPU-ms claim is unverifiable.
   - Fix: idea 4. Cost S.
2. **White hairline wake scratches.**
   - Where: two 3-point `GL_LINES` per near ship (`garden-ships.ts:2838-2861`), 84 draws in total (30% of all draws), rasterised as aliased 1-px white strokes. Visible beside hulls in `noon.png` (~1165,770 and ~820,830; see `headroom/crop-ship-wake.png`), `golden.png` (~950,795 and ~1180,772), and in `night.png` (~940,795 and ~1185,775), where they are among the brightest marks on the sea.
   - Why it breaks the calm: they read as scratches on the glass, not foam.
   - Fix: delete `createWake`'s Line children. `GardenWakeBatch` and the wake feedback field (`garden-wakes.ts`) already draw wakes. Saves 84 draws and ~0.9 ms CPU [INFERENCE]. Cost S.
3. **The beacon beam is a flashlight stuck in the wall.**
   - Where: `night.png` ~700-760,215-290 (`headroom/crop-night-beam.png`). A stubby grey cone, foreshortened toward the camera, emerges beside the tower shaft below the lantern gallery.
   - Cause: the shader's scattering maths was written "under the fixed ortho view" (`garden-lighthouse.ts:945-963`), but the camera is now perspective (`garden-post.ts:1689-1691`).
   - Why it breaks the calm: at night, the one dominant light (bible "Atmosphere") has no body in the air.
   - Fix: idea 2. Cost M.
4. **Hull shadows baked into a static map.**
   - What is wrong: fleet hulls keep `castShadow = true` (`garden-fleet-batch.ts:1079`; only sails, far and pennant are cleared at 1246-1265), but the map renders only on re-steer or camera move (`world-renderer.ts:4096-4109`). The sails' own comment (1241-1245) calls this "stale ghosts".
   - Consequence [INFERENCE, not observed in the baselines]: a hull's old shadow stays on docks and other hulls until the next re-steer, and every re-steer re-renders 93k fleet triangles into the map.
   - Fix: `hull.mesh.castShadow = false`. The live water-contact discs (`garden-ships.ts:2863`) already ground the ships. Cost S.
5. **Tilt-shift doubles edges in close postcards.**
   - Where: `selected-ship.png`, the purple flag at ~600-700,380-420 (`headroom/crop-tiltshift.png`) shows a sharp contour plus a soft ghost.
   - Cause: a half-res sigma-2 blur mixed by a depth band without foreground rejection (`garden-post.ts:640-700`).
   - Fix: CoC-weighted gather that rejects samples nearer than the centre, reusing the same two half-res targets. +~0.1 ms, 0 textures. Cost M. Confidence M.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### headroom-1 ★ Retina-true pixel budget: post chain sized in CSS pixels, AA chosen by DPR
- **Picture:** On the MacBook the rigging, lantern cage and masonry stay knife-clean at DPR 2. On a 1440p desk monitor the stays stop crawling and read as drawn with a fine brush, the way the 2× ground-truth render did. The fans stay quiet.
- **Why:**
  - Every intermediate post target follows the device buffer: N8AO half-res of 6.4 MP, hero reflection at `size/2` (`garden-hero-reflection-pass.ts:108-109`), god rays at 0.5 (`garden-post.ts:830,1077-1082`), full-res bloom luminance, and three SMAA passes. At DPR 2 all of that pays 4× for low-frequency signals (AO, bloom, reflection, shafts) that the eye cannot resolve at that density.
  - The W0.2 A/B (`garden-post.ts:1507-1516`) used a 2× supersample as ground truth. Supersampling is the best AA this repo has measured, and it was only ever run @1x.
- **Impact:** stunning 3, relaxing 3 (heat and fan). **Confidence:** M (needs the serial DPR-2 baseline).
- **Cost:** M. **Perf:** 0 draws, 0 tris. At DPR 2, post pixel work drops ~70% [INFERENCE: AO 1.6→0.4 MP, reflection 1.6→0.4 MP, rays 1.6→0.4 MP, bloom prefilter 6.4→1.6 MP, SMAA 3×6.4 MP→0]. −4 textures when SMAA is disposed at DPR ≥1.75. On DPR-1 monitors the supersample adds ~2.25× scene fill (+1–2 ms [INFERENCE]), under governor control.
- **How:**
  - In `createGardenPost` resize (`garden-post.ts` `setSize` path), pass `internalScale = 1/effectiveDpr` to N8AO's size (keep `halfRes`), bloom (`resolutionScale`), `GardenGodRaysEffect.setSize`, tilt-shift targets and the hero reflection target (`floor(size/(2·dpr))`).
  - `smaaPass.enabled = effectiveDpr < 1.75` (a flag, no recompile), and dispose its targets while disabled.
  - Supersampling: in `render-surface-budget.ts:207-209` let the governor's ceiling be `max(requestedDpr, 1.5)` when device DPR is 1. The existing `sqrt(8 MP / css)` clamp caps 1440p at ~1.47. Upshift only on the existing calm streak (`ADAPTIVE_DPR_UPSHIFT_*`).
- **Displaces:** SMAA on retina; three quarters of AO, reflection and ray pixels at DPR 2.
- **Truth & a11y:** none analytical. Reduced motion is unchanged (one static frame at the same DPR).
- **Risks:** AO halo grows by one CSS pixel at DPR 2. The governor oscillating near thresholds (existing cooldown handles it). `world-renderer.test.ts` pass-list assertions (`:867`) need a DPR arm.
- **Acceptance:**
  - Serial `npm run preview -- --dpr 2 --hash "#t=22"` and `#t=12.25`: tier `full`, 0 dropped. Night lantern-cage crop RMSE vs a 2× reference is within noise of the @1x MSAA+SMAA arm.
  - `--width 2560 --height 1440`: rigging crop of `noon-1440p` (~1150-1250,660-720) shows continuous stays.

### headroom-2 ★ One air: depth-aware in-scatter (sun, fog, beacon) inside the existing fused grade pass
- **Picture:**
  - At golden hour the air thickens toward the sun, and the far fleet and borrowed hills sink into lit haze instead of flat orange.
  - At night one pale blade leaves the lantern, sweeps through real air, is occluded by the tower and the hulls it passes behind, and lands on the sea exactly where the water's existing beam pool is.
  - Nothing else glows.
- **Why:**
  - The beam cone is a perspective-broken ortho relic (Spell-breaker 3).
  - Distance haze is linear `Fog` with one colour (`garden-sky.ts:512`), with no view-to-sun term, so `golden.png`'s upper third is a flat gradient.
  - The grade pass already receives the composer's resolved depth and reconstructs world position for the god rays (`garden-post.ts:1485-1489,1703-1704`), so an analytic volume costs ALU, not passes.
- **Impact:** stunning 5, poetic 5. **Confidence:** M.
- **Cost:** M. **Perf:** −3 draws (`lighthouse-beam-cone`, `lighthouse-beam-dust` (40 points), `lighthouse-halo`), −~1.3k tris, +0.10–0.20 ms at 1x [INFERENCE: one extra ~150-ALU term in an existing full-screen shader], 0 textures.
- **How:**
  - New `GardenAirEffect` in the grade `EffectPass`, after god rays and before grade (`garden-post.ts:1611-1618`).
  - Per pixel: `t = linear depth`.
  - Height fog: `T = exp(-σ·∫ρ(h))`, with the closed form for exponential height density.
  - Sun: `inscatter = sunColor · HG(dot(v, sunDir), g = 0.6–0.75) · (1-T)`.
  - Beacon beam: closed-form single scattering of a narrow spot. Intersect the view ray with the beam cylinder or cone (axis from `uBeaconAngle`, which the water already has at `garden-water.ts:552`), clamp to `[0, t]` so geometry occludes it, and integrate `I·exp(-σd)/d²` analytically. The airlight integral has an arctan closed form, so no march is needed.
  - Tie σ to the day-cycle fog colour so material `Fog` and post haze share one contract. Reduce material `Fog` far-strength by the same amount to avoid double haze.
- **Displaces:** the beam cone, dust, halo meshes and the ortho-era scattering code. The 36-step god-ray march can drop to 16 steps, because the analytic sun term carries the broad glow.
- **Truth & a11y:** the beacon's analytical reading (tower = market stability) keeps its existing DOM ledger. The bearing semantics come from `garden-beam-dwell.ts` unchanged. Reduced motion: beam frozen at `beamStaticBearing` (`garden-beam-dwell.ts:88`), still volumetric.
- **Risks:** the fog double-count at the horizon band; analytic banding (use the existing dither in the LUT stage); the night value plan (bible: beacon 92, everything else ember).
- **Acceptance:** serial `#t=22` and `#t=17.6` at 1600×1000 and DPR 2. The beam originates at the lantern, is occluded by the tower shaft (no light through masonry), and its sea landing coincides with the water's beam pool. The draw census shows −3 beam owners.

### headroom-3 ★ Ambient 60 Hz cadence on high-refresh displays, display rate while touched
- **Picture:** The garden looks identical: ships drift 0.5 px per frame either way. The MacBook stays silent and cool for an hour-long watch, and the budget each frame gets for light and air doubles.
- **Why:**
  - The loop renders every vsync. Only idle is gated, at 33 ms (`use-world-render-loop.ts:538`). On the operator's ProMotion panel that is 120 Hz, leaving a 2.5–4 ms CPU margin after 4.3–6.0 ms of sample, hits and submit (all `.txt`).
  - `RENDER_SCHEDULER_TARGET_FRAME_MS = 16.7` (`render-scheduler.ts:3`) shows 60 was always the intent.
  - A relaxing, slow-motion world gains nothing visible at 120 Hz; it just pays for it twice.
- **Impact:** relaxing 4, and an enabler of everything else. **Confidence:** H.
- **Cost:** S. **Perf:** halves CPU and GPU work per second on 120 Hz panels. The per-frame budget goes from 8.3 to 16.7 ms. 0 draws, 0 textures.
- **How:**
  - Reuse the idle gate: `if (!interacting && time - lastWall < 16.7 - 4) { schedule; return; }`. The 4 ms tolerance prevents 120/60 beat.
  - Run at display rate while the scheduler tier is `interaction` (drag, zoom, hover), and ease back after 500 ms calm.
  - Feed the adaptive-DPR governor draw-duration p90, not pacing p90, while capped. Otherwise pacing (16.7) always exceeds `ADAPTIVE_DPR_UPSHIFT_P90_MS = 13.6` (`render-surface-budget.ts:4`) and the governor never upshifts.
- **Displaces:** the second frame of every 8.3 ms pair.
- **Truth & a11y:** there is still one motion clock (dt-based). Reduced motion is unaffected (static). Interaction stays at full responsiveness.
- **Risks:** a perceptible smoothness step when a drag starts (by design it gets smoother under the hand); pacing tests that assume the display rate.
- **Acceptance:** headed run on the ProMotion panel. The `frame` line shows 60 fps at rest and ~120 during `--pan-zoom`, with 0 extra drops at the transition.

### headroom-4 The cost oracle: serial uncapped knockout harness (prerequisite for every ms claim)
- **Picture:** None on screen. The orchestrator can finally say "the air costs 0.14 ms" and mean it.
- **Why:** Spell-breaker 1. The prior lane asked for per-pass timers (`render-perf-budget.md` §3). They were built, and they are not additive on ANGLE Metal.
- **Impact:** enabler for all lanes. **Confidence:** H.
- **Cost:** S. **Perf:** debug-only; 0 production bytes.
- **How:**
  - `preview.mjs --uncapped` launches system Chrome with `--disable-gpu-vsync --disable-frame-rate-limit`. Throughput p50 then becomes a real cost.
  - Add `--knockout ao|bloom|smaa|rays|reflection|water-lanes|tilt` through the existing dev-only test-global seam used by `--force-tier` (`preview.mjs:110-111`, `render-scheduler.ts:160`).
  - Report Δms = knockout − full over three alternating serial runs.
  - Relabel the `gpu` line "command-buffer time (not additive)" on Metal, and refuse `--max-gpu-ms` there.
  - Add a DPR-2 arm to the serial baseline set.
- **Displaces:** the misleading HUD ms and per-pass line.
- **Truth & a11y:** none.
- **Risks:** uncapped runs heat the GPU (run serially); flag passthrough on Linux wrapper Chrome.
- **Acceptance:** knockout deltas sum to within ±15% of the full-frame throughput delta. SMAA knockout reads <0.3 ms at 1x.

### headroom-5 GPU-only motion kit: cloth, wind, petals, fireflies, pennants with zero per-frame JS
- **Picture:** Sails breathe with a slow belly that fills and slackens in the harbour wind. The rim pines and bamboo sway on the same weather. A handful of petals or, at night, a few fireflies drift through the near garden. Nothing ticks, nothing jitters.
- **Why:** at 120 Hz the CPU is the scarce resource (headroom table), and each JS-animated object costs matrix writes plus uploads. `signal-mast-root` spends 9 draws on 216 triangles (census) for five pennants. Vertex-shader motion costs ~0.
- **Impact:** poetic 4, relaxing 3. **Confidence:** H.
- **Cost:** M. **Perf:**
  - Cloth: 0 draws, +0.02 ms. Tessellating sails 4× adds +20–40k tris, inside the reclaim from idea 7.
  - Particles: +1 draw each, <0.05 ms.
  - Pennants: −7 draws (merge five pennants plus yard into one mesh with vertex flutter).
  - 0 textures.
- **How:**
  - Sail vertex shader: `belly = sin(π·uv.x)·sin(π·(1-uv.y))·(0.12 + 0.05·gust)`, displaced along the local normal. Phase = `hash(instanceMatrix[3].xz)`. **No new attributes**: the sail program is at the 16-slot cap (`garden-fleet-batch.ts:1070-1073`). Wind comes from the shared weather-plan uniforms the rim already uses (`garden-rim-mesh.test.ts:544-545`).
  - Particles: one `Points` draw each. Position comes from `gl_VertexID` hashes plus `uTime` on looping curl-noise paths. Size ≤ 6 CSS px to bound overdraw at DPR 2.
- **Displaces:** JS pennant animation and any per-frame CPU flutter. Under the bible, particles must displace an existing ambient motion (for example, fewer gull flaps).
- **Truth & a11y:** decorative only; must never encode data. Reduced motion shows one static belly pose and no particles.
- **Risks:** hit targets use CPU geometry, so a billowed sail's pick edge moves by ≤0.1 units (acceptable). Attention budget. `garden-fleet-batch` program-cache tests.
- **Acceptance:** motion sheet `node outputs/opus-review/tools/motion-sheet.mjs --hash "#t=12" --frames 9 --interval 600 --clip 900,700,500,250`: sails visibly fill and slack. The census shows `signal-mast-root` at ≤2 draws. The `motion sample` ms is unchanged.

### headroom-6 Texture-slot economy: one packed "garden noise" texture and recycled post slots
- **Picture:** The same frame, but the sky can have clouds, the water caustics, the sails weave, and the air grain, without breaching 72.
- **Why:** the whole-map arm is at 72/72 (`TESTING.md:383-388`). It is the one hard ceiling with no room, and several lanes will ask for noise, cloud or LUT textures.
- **Impact:** enabler. **Confidence:** H.
- **Cost:** S. **Perf:** −4 textures at DPR ≥1.75 (SMAA area, search, edges, weights; idea 1). +1 texture for a 256² RGBA8 tileable pack (R blue-noise, G fbm, B Worley, A curl), shared by sky, water, air and particles. The dither texture (`garden-post.ts:1666`) folds into its R channel: net −1.
- **How:** one loader and one module-owned `Texture` handed to materials as a uniform. Add a texture-census manifest entry.
- **Displaces:** any per-lane noise texture; the separate dither texture.
- **Truth & a11y:** none.
- **Risks:** blue-noise dither must keep its tiling period. Channel sharing couples lanes, so assign the channels in the plan.
- **Acceptance:** `npm run preview -- --texture-census --hash "#t=12.25&cam=0,0,0.28"` shows ≤72 renderer textures after the new visual features land.

### headroom-7 Triangle reclaim: LOD proxies for the reflection layer, decimation of the rim land
- **Picture:** No visible change. The reflection is half-res and normal-distorted (`garden-water.ts:1157`), so a coarser tower in it is invisible. The freed triangles pay for sail tessellation and denser near flora.
- **Why:**
  - `garden-lighthouse-shell/stone-shell` draws 34k tris twice (68,864 across 2 calls, census). The reflection re-renders ~48k tris per frame (`world-renderer.ts:3298-3308`).
  - `garden-rim-land` is 42,740 tris in one draw for mostly flat, grassy terrain.
- **Impact:** enabler. **Confidence:** M.
- **Cost:** S–M. **Perf:** ~−26k tris (an 8k reflection proxy for the stone shell, on `GARDEN_HERO_REFLECTION_LAYER` only, while the main-layer shell leaves layer 7) plus ~−15–20k tris (rim-land edge-collapse to ~25k, keeping silhouette edges). 0 draws, 0 textures.
- **How:** `mergeVertices` + meshoptimizer-style simplify at build time (or authored), for layer 7 only. Rim: slope-weighted simplify in `garden-rim-mesh.ts` `buildLandGeometry`.
- **Displaces:** triangles only.
- **Truth & a11y:** none.
- **Risks:** reflection silhouette mismatch at the waterline; rim shading facets if normals are recomputed. `garden-rim-mesh.test.ts` triangle expectations.
- **Acceptance:** the census shows stone-shell ≤42k across 2 calls and rim-land ≤28k. An A/B crop of `noon.png` ~560-960,720-1000 shows no difference.

### headroom-8 Spend the static shadow map once: contact-hardening penumbrae at low sun
- **Picture:** At golden hour the tower's shadow runs long across the terraces: sharp where the torii foot meets stone, feathering wide at its far tip, the way a real 17:30 sun behaves. Noon stays crisp.
- **Why:** the map is re-rendered only on re-steer (`world-renderer.ts:4049-4109`), so per-frame cost is purely the receiver taps. The fixed radius-4 PCF (`:1999-2003`) gives every shadow the same 0.17-unit blur, whether it is a bollard or the 34-unit tower.
- **Impact:** stunning 3, poetic 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws, 0 textures, +0.2–0.4 ms at 1x [INFERENCE: 32 taps over ~60% of pixels]. Gate to the full tier and sun elevation < 25°, else the existing PCF.
- **How:** `onBeforeCompile` on the `shadowmap_pars_fragment` chunk. A 16-tap Vogel blocker search, then penumbra `w = (d_recv − d_block)/d_block · lightSize`, then a 16-tap filter. Switch through a uniform, not a define, so no tier-change compile hitch.
- **Displaces:** the uniform PCF radius. Also drop hull casters (Spell-breaker 4).
- **Truth & a11y:** none. Reduced motion is identical (the sun is wall-clock).
- **Risks:** shader variant churn across the MeshStandard fleet; acne at grazing angles, where the existing bias hygiene (`:1986-1998`) must hold.
- **Acceptance:** serial `#t=17.6` crop of the island terraces (~560-1110,600-780 in `golden.png` coordinates): penumbra width grows with distance from the caster.

## Subtractions
- **`ship-wake-detail` Lines**: −84 draws (30%), −~0.9 ms CPU, and the white scratches go away (Spell-breaker 2).
- **SMAA at DPR ≥1.75**: −3 full-screen passes at 4× pixels, −4 textures (idea 1).
- **`lighthouse-beam-cone`, `lighthouse-beam-dust`, `lighthouse-halo`**: replaced by idea 2.
- **Hull shadow casting into the static map** (`garden-fleet-batch.ts:1079`): removes stale ghosts and the 93k-tri re-steer cost.
- **`signal-mast-root`**: 9 draws for 216 tris becomes ≤2 (idea 5).
- **The per-pass `gpu` line and HUD "ms p95" as budget instruments on Metal** (idea 4).

## Reversals
1. **W0.2 "keep both MSAA 4× and SMAA"** (`garden-post.ts:1497-1537`).
   - Evidence: the A/B ran only @1x. Its best-vs-MSAA-only gap was 1.5% RMSE by day and 8.5% at night.
   - Argument: at DPR 2, 4× MSAA already gives 16 coverage samples per CSS pixel, while SMAA costs three passes at 4× pixels plus 4 of the scarcest resource, texture slots.
   - Proposal: re-run the same RMSE A/B at `--dpr 2` and keep SMAA only below DPR 1.75.
   - Risk: the night lantern hoop. Measure it before deciding.
2. **The render-perf lane's "build a per-pass GPU-ms readout" as the budget instrument** (`render-perf-budget.md` §3, implemented at `garden-post.ts:1100-1216`).
   - Evidence: Spell-breaker 1 (non-additive; frame p50 > vsync with zero drops).
   - Proposal: replace it with knockout-on-uncapped throughput (idea 4).
   - Risk: none to the product.
3. **The @1x/60 Hz reference captures as the only perf truth** (brief table, `TESTING.md:326-330`).
   - Evidence: `render-surface-budget.ts:208-209` gives the operator's retina panel ~6 MP, and the loop runs at 120 Hz.
   - Proposal: add serial `--dpr 2` arms, plus headed-120 Hz arms, to the baseline set before consolidation.
4. **Beam as an additive mesh cone** (the "analytic cone over screen-space" decision, `garden-lighthouse.ts:952-955`).
   - Evidence: the cone was reasoned for an ortho camera that no longer exists (`night.png` crop). The earlier rejection of post-space shafts was about the lack of depth-aware masking, and the grade pass now has depth (`garden-post.ts:1485-1489`).
   - Proposal: keep "analytic", move it into post (idea 2).
- **Not reversed:**
  - WebGPU (D12; ledger 2026-07-29). three is still 0.185.1, the same revision as the NO-GO. The blockers (GLSL surface, no pmndrs/N8AO path) are unchanged, and WebGL2 has the headroom that matters.
  - TAA. It stays rejected; the attribute cap makes fleet velocity infeasible without splitting the sail program.

## Cross-lane dependencies
- **All lanes:** use this catalogue's Δdraws/Δtris/Δtex. Treat every ms as [INFERENCE] until idea 4 lands. The orchestrator should schedule idea 4 plus a serial DPR-2 baseline **first**, then ideas 3 and 1, before spending on visuals.
- **LanePharos / LaneLight / LaneSky:**
  - Idea 2 is the natural home for the beacon beam, golden haze and sun glow. It must respect the bible's night value plan (beacon 92, everything else ember) and the D15 channel treaty: PSI owns clarity aloft, so σ aloft may follow PSI and stale-source fog stays separate.
  - Clouds belong in the existing sky-dome shader and draw from idea 6's packed noise.
- **LaneFleetCraft / LaneFleetMotion:** cloth must not add vertex attributes to the sail program (16-slot cap). Sail tessellation should draw on idea 7's triangle reclaim.
- **LaneWater:** agreed to retire the wake hairlines (message received). Any water texture must come from idea 6's slots or reuse existing targets. Fleet reflections should use the `fleet-far-*` proxies (+6 draws, +3k tris), not the 93k-tri hull batches.
- **LaneGarden / LaneGardenMaster / LaneLife:** particles and wind follow idea 5 (GPU-only, ≤6 CSS px sprites, displace an existing motion).
- **LaneCamera / LaneChrome:** idea 3's display-rate-while-interacting needs the interaction tier to cover every camera gesture. The tilt-shift gather fix (Spell-breaker 5) touches close-postcard framing.

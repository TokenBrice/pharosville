# 01 — ClaudeVille anatomy: why it reads better, and what transfers

Scope: read-only study of `/home/ahirice/Documents/git/claude-ville` at `1b7e726` (v0.54.0, 2026-10-13). Nothing there was edited or run, and no PixelLab or paid calls were made. Images viewed: `shots/capture.jpg`, `docs/assets/github/world-{day,night}.png`, `output/render-baselines/current/north-star-action-storm--postfx.png`. PharosVille comparison images: `agents/pharosville-revamp/captures/production-live-noon.png` and the June 2026 shell `docs/pharosville/media/pharosville-desktop-shell.png` @ `564b96f`.

## Verdict

ClaudeVille does not look better because of pixel art as such. PharosVille already shipped isometric PixelLab pixel art in May–June 2026, and it looked worse. The June capture shows a small island inside a huge, flat, tiled sea diamond, with sprites in mixed styles and unreadable labels. ClaudeVille looks better for five reasons:

1. **It keeps one direction.** It has run a single art direction for six months (Apr→Oct, ~900 commits, 118 changelog entries).
2. **The land fills the frame.** The camera shows the land at a scale where each landmark is 250–380 px tall.
3. **Its rules are measurable and enforced.** It has hard, numeric craft contracts (palette ladder, one pixel grid, a brightest-thing rule) that offline tools check.
4. **Every pixel means one thing.** A strict semantic grammar: buildings are durable concepts, bodies are live sessions, light means real work, gold means verified success.
5. **Taste is judged on rendered frames.** The operator approves screenshots and contact sheets ("before/after contact sheet reviewed and signed off by the maintainer", CHANGELOG v0.46.0). The rubric alone does not decide.

The renderer is impressive engineering, but it is not why the image works. An approved base image came first. The engineering arrived later to protect it.

## 1. Rendering technology

| Aspect | Fact | Source |
|---|---|---|
| Backends | Three: WebGPU (Chromium default), WebGL2 (Safari/Firefox), Canvas2D fallback. All consume one record stream. | `character-mode/README.md` §Renderer selection |
| Canvas stack | `#worldCanvas` (2D sky/backdrop, hit-testing) + `#worldFxCanvas` (GPU scene) + `#worldOverlayCanvas` (ungraded labels, marks, letterbox) | README §Data sources |
| Projection | True 2:1 dimetric, `TILE_WIDTH 64`, `TILE_HEIGHT 32`, `MAP_SIZE 40` (40×40 tiles) | `src/config/constants.js` |
| Depth | Painter sort through `DrawablePass.js`, by `sortY → sortBand → kind → stableKey`. Tall props `splitForOcclusion` into back and front halves. Long walls use per-column occlusion slices. The GPU writes a 16-bit painter depth only so particles can be hidden behind fronts. | README §Depth drawable contract |
| Pixel scale / DPR | Every sprite draws at an integer multiple of the world texel (contract C3). Zoom ladder `[1,2,3]` × `round(dpr)/dpr`, plus a "survey" tier of `1/dpr` on DPR-2 screens and half rungs. Fractional zoom happens only during camera flight, with "fat-pixel" sampling. | `Camera.js:52,195-228`; `docs/design-decisions.md` "One pixel grid" |
| Lighting | `GradeEvaluator.js` has one pure grade with 8 daily keyframes, weather rows, moon and season. It never reads agent state. Light comes from authored **emissive sidecars** (`base.emissive.png`). The sidecar *is* the light map: `ApertureLights.js` cuts its blobs into stepped multiplicative pools. Windows light **per room, per working agent** (`base.rooms.png`). Bloom is optional and HDR highlights are an opt-in on WebGPU. | `docs/building-style-contract.md` §Sidecars/Rooms/Aperture; design-decisions C2 |
| Material channels | Per-building `base.material.png`, `base.occluder.png` (height + face class + occlusion), `base.rooms.png` | `docs/material-channel-contract.md` (846 lines) |
| Water | A sub-tile SDF coast bake (`CoastBake.js`) with five depth stops, foam lace and wet sand. All water motion is **palette cycling**: a texel steps to the adjacent authored stop and never blends. The sea also has a sun/moon path ramp (`seaPath`), a Lighthouse beam drawn as dashes on the sea, starlight glints, and hull reflections as mirrored records on painted water only. | README "Living water"; `artPalette.js` header |
| Ground | `GroundBake.js` is one splat bake on the master ramps. PixelLab Wang tiles survive only as luminance sources, because the original mapping was the defect. | design-decisions "ground and sea are one bake" |
| Perf | Measured: app render p50 3.1–3.4 ms at 24 agents, real FULL frame ≈4 ms GPU. A quality ladder sheds effects. Terrain bakes persist. Retained-frame reuse skips identical frames. The rule is that new per-frame cost must be baked, must replace an existing cost, or must carry a budget receipt. FPS chips in the doc screenshots (11/21 fps) come from capture environments `[INFERENCE: software/loaded host]`. | Waking Isle plan (`git show 9131a81:agents/plans/claudeville-opus55-xhigh-visual-plan.md`) |
| Size | 170k LOC JS, 118k of it in `character-mode/`. Zero build, vanilla ES modules, 231 test files. 23 MB of assets. | `wc`; `docs/design-decisions.md` "Dependency-free runtime" |

The key finding: the hard visual decisions are **baked offline**: ground, coast, building sidecars, hull roll strips and the village gate, which is ray-cast to pixels by `scripts/sprites/bake-village-gate.mjs`. Runtime only *selects* among authored colours (grade, palette cycles, stepped pools). That is why the frame stays coherent: no runtime shader invents a colour the palette does not contain.

## 2. Art pipeline

- **Source.** All landmark, character, prop and foliage art comes from PixelLab. Command, Archive, Task Board, Forge, Mine and Portal were made with REST `generate-image-v2`, **using an existing approved building as the style image** (`building.observatory`, then `building.command`). Harbor, Observatory and Watchtower were single `create_map_object` calls with `view: low top-down, outline: selective, shading: detailed, detail: high` (`docs/building-style-contract.md` §Generation recipe; `docs/pixellab-reference.md`). A full refresh costs well under 500 generations, and spend is approved per batch.
- **Inventory.** 9 buildings (256–360 px wide, 232–384 px tall; the Lighthouse/watchtower is 288×384), with 66 PNGs counting sidecars and part strips. 29 character identities over 208 PNGs (92 px cells, bodies 48–75 world px). 129 prop PNGs, 48 vegetation, 25 terrain (`assets/sprites/`; `manifest.yaml` is 4,213 lines).
- **Palette control.** `src/config/artPalette.js` holds named ramps (void, deepWater, grass, dirt, road, plaza, stone, ashlar, slate, timber, clothCrimson, emissive, seaPath, beaconFire…) and a **value ladder** made of four luminance tiers. Tier A (L>0.70 or S>0.65) is reserved for unresolved status marks, the selected ring, and authored emission at night. The ground was measured as "the loudest thing on screen" (median S 0.61) and muted to 0.45–0.50. A strict ≤0.40 mock "read grey and was rejected" (design-decisions C1). `npm run art:analyze` flags off-ramp pixels, more than 400 colours per sprite, semi-alpha edges and non-integer scales.
- **Style contract.** The contract sets these rules: one 1-px selective warm near-black outline, a single upper-left key, 3–4 cel steps per material with Bayer dither, slate-blue roofs as the family motif, unlit glass by day, and doors at least 1.2× body height. Sprites contain no ground slab. Terrain owns all grounding, and one of four grounding profiles is declared per building (`building-style-contract.md` §Craft rules, `config/buildingGrounding.js`).
- **Coherence enforcement.** `world:validate-buildings` checks window-rect coverage (≥60%), part-strip geometry, fps 4–8, `restIsBase` and gates. Bake scripts have `--check` modes. Frozen render baselines live in `docs/rendering-baselines.md`.
- **Repair over regenerate.** When four buildings came back as "resampled painterly images with 10k–27k colours beside clean 1-px iso art", they were re-authored on the approved grid. When terrain looked patchy, the *mapping* was fixed instead of regenerating the tiles (design-decisions D3 and 3.2–3.5).

## 3. Composition and information design

- **Data-to-place contract** (`docs/visual-experience-crafting.md` §2): durable concepts become buildings (Command = orchestration, Forge = edits/builds, Mine = token/quota burn, Archive = reads/docs, Observatory = monitoring, Harbor = git pushes, Portal = arrivals, Task Board = plans). Sessions become villagers who **walk to the building that matches their current tool**. Recent events become stepped one-shot stamps, and dense truth lives in DOM panels. The stated test is that users can say "that job is stuck near the repair shop".
- **Town plan** (`config/townPlan.js`, 419 lines; `config/buildings.js`): a bounded island with a curtain wall, a gatehouse that carries the village's name, district yards, and approach files, queue slots and overflow tiles per landmark. Bodies have authored places to stand, so crowds read as queues and not as scatter.
- **Labels in five tiers** (design-decisions C5): T1 attention plates (NEEDS YOU / ERROR / LIMIT, never culled, docked at the frame edge when off-screen), T2 selected/hovered, T3 brass landmark plaques with the **exact count folded in** (`FORGE │ 10`), T4 routine names only at close zoom, T5 `+N` crowd tabs. Permanent names were removed because "nine overlapping BELL WAITING pills buried the one fact that mattered".
- **HUD** (`DESIGN.md` §Top bar): a 48 px bar with four KPI stacks (a 22 px numeral over an 8 px caption). Zeros recede to `ink-4`. One lit, framed slot exists, and only while a count is above zero. There are two bitmap faces on integer grids (PS2P 8/16, Departure Mono 11/22), and saturated colour belongs to status only. The chrome is a warm dark "keep" frame and deliberately does not tint with the world.
- **Glanceable vs on demand.** Glanceable: plaque counts, top-bar numerals, lit windows (only real work lights a window at night), attention plates. On demand: the sidebar roster, the Activity Panel character sheet, and Dashboard mode as "the product-shaped escape hatch" (`PRODUCT.md`).
- **Motion budget** (`docs/motion-budget.md`): four pulse bands (slow >1 s, medium ~600 ms, fast <300 ms, static), one owner each. Every motion has a static reduced-motion frame. Moments follow one envelope (anticipation → one cream peak frame → four-step follow-through) with at most one Major at a time. Idle agents and building lights are *static*.

## 4. Process

- **Lineage.** A fork of a Korean upstream (`c2bf640`, 2026-02-18) that already had an isometric canvas village. The operator's April refresh (`43e1aba`) added PixelLab sprites. **The metaphor was never changed.** Every later release (v0.x → v0.54) refined it.
- **Cadence.** 453 commits in April, then 50–110 a month. Releases come with poetic names and plain-language changelogs.
- **Taste loop.** Each major visual round was a fan-out of parallel Opus explorations: 13 for *The Painted Isle*, 16 plus a three-lens council for *The Waking Isle*. They captured real-GPU frames, painted PIL mockups over real captures, and wrote numbered **maintainer decisions** (D1–D5, M1–M27) that the operator settled before any code. Sign-off was on a contact sheet. The organizing findings are measurements, such as "deep water changes 0.6% of pixels over 2 s… idle villagers move more than working ones".
- **Subtraction is a release.** v0.52.0 *The Cleared Commons* came from operator screenshots of four failure modes (prop on a path, trees in water, random piles, overlapping crowns). A scored per-prop map led to rules R1–R6. Trees went from 142 to 100, about −33% of props, with night path light *up* (31%→42%), and a density test now stops creep (`agents/plans/claudeville-prop-cleanup.md`). v0.53.1 removed monuments. Killed items stay killed unless new evidence appears.
- **Base image before effects.** The v0.46 plan's thesis: "ClaudeVille does not lack effects. It lacks a correct base image." The work went in this order: grade → one pixel grid → baked ground and sea → coherent architecture → calm signals → moments → camera.

## 5. Weaknesses and ceilings

1. **The sea is the weakest surface.** Their own audit found the outer ocean "one flat fill: 30–45% texture-free… 67% one colour at z1 noon". Palette cycling and moon paths fixed some of this, but the far sea is still a dark band. This is exactly where PharosVille must be strong.
2. **Pixel art caps "state of the art".** A fixed iso camera with no rotation, no parallax depth, no real sky (the sky is a stepped plate only visible in survey shots), and nearest-neighbour art. It is charming, but it is a deliberately retro register, not a showcase of what browsers can do in Oct 2026.
3. **Complexity debt.** 118k LOC in one presentation folder, an 846-line material contract and a 132 KB renderer README. Sophistication accreted on top of sprites. A reboot must not copy this surface area.
4. **The renderer hid its own work.** The ladder shed the night on a 4 ms budget, the resident path dropped the grade, and particles were never drawn on the GPU path (plans v0.46, v0.48). Measured truth repeatedly contradicted assumed truth.
5. **Not truly responsive.** Desktop is designed at ≥1280 px, and mobile is a separate `/m/` profile.
6. **Generated-art drift.** PixelLab outputs needed re-authoring passes, plus hand-built pennants, frames and gatehouses for consistency. Strip animation (6 frames, 4–8 fps) is the motion ceiling.

## 6. The ten most transferable lessons (ranked)

| # | Lesson | Applied to PharosVille |
|---|---|---|
| 1 | **Commit to one direction and iterate it for months.** ClaudeVille has had one metaphor in 54 versions. PharosVille has had six art directions in six months (`pharosville-revamp/03-process-history.md`). | Pick once, then judge only by deltas on the same scene. |
| 2 | **Approved base image before effects.** Grade, grid, ground and sea, then architecture, then signals, then motion. | Do not build data plumbing or capture tooling until one still frame is operator-signed. |
| 3 | **Fill the frame with a bounded, legible place.** Land fills about 70% of the view and landmarks are 250–380 px. June PharosVille was mostly empty sea, and the 3D build reads as distant small boats. | The lighthouse plus 6–9 landmarks plus a harbor should dominate the frame. The sea frames the scene but does not fill it. |
| 4 | **Data-to-place contract written before art.** Buildings are durable categories, actors are live entities, light means real activity, and DOM holds dense truth. | Map endpoints to stable landmarks (peg desk, stress signals, safety grades, mint/burn flows, chains as quays). Stablecoins are ships with a stable identity hash. |
| 5 | **One palette and value ladder in code, with a brightest-thing rule.** Saturation is reserved for status, and the environment is muted. | Peg/stress status alone owns Tier A. The sea and sky stay below it, except the beacon. |
| 6 | **Light means truth.** Windows light only when work is inside, and the weather never reads data. | The lighthouse beam and harbor lamps follow the clock. Depeg or stress gets exactly one attention grammar, not mood tints. |
| 7 | **Labels in tiers, counts on plaques.** Brass chips with exact counts, attention plates never culled, names only on demand. | `PEG DESK │ 3 depegged` style plaques. No permanent per-ship labels. |
| 8 | **A thin HUD with a few big numerals, zeros receding, and one lit slot.** | 3–5 numerals (total supply, depegged count, PSI band, stress alerts). |
| 9 | **Coherence through style references and offline enforcement.** Generate each asset with an approved asset as the style anchor. Analyzers check the palette, outline and scale. | With Blender this becomes a shared material library, one key light, one camera, and a render-time palette or LUT check. |
| 10 | **Subtraction as a measured release, with operator screenshots as the input.** | Plan a "Cleared Commons" pass. Cap prop density with a test. |

## 7. What NOT to copy

- **Pixel art as the medium.** PharosVille has tried it already (May–June). It sets a retro ceiling against a "state of the art" brief, and a sea of nearest-neighbour texels is the weakest part of ClaudeVille. Copy the *discipline* (one grid, one key light, one palette), not the texel.
- **The three-backend renderer and the 800-line contracts.** That is hardening after success. A reboot should have one modern path, plus a static fallback for the desktop gate.
- **Fixed isometric orthography with no sky.** The brief asks for a beautiful sky and sea. ClaudeVille shows the horizon only in survey shots.
- **Medieval keep chrome, Press Start 2P, and RPG voice.** These are brand-specific. PharosVille needs its own frame (maritime and instrument-like). The *rules* still apply: two faces, integer sizes, saturated colour for status only.
- **Embodied walking actors as the core motion.** Agents change tools every few seconds, but stablecoins change slowly. Ship motion must not imply activity the data lacks: "Motion is expensive attention" (`visual-experience-crafting.md` §7).
- **A 16-agent planning council per wave as a substitute for operator verdicts.** It worked here only because the operator signed off contact sheets. Keep the frame-level sign-off. The scale of the fan-out is optional.

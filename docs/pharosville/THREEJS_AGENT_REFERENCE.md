# Three.js Runtime Guide

Last updated: 2026-09-02

This is the implementation guide for the production Three.js renderer. Read
`ARCHITECTURE.md` first for the app boundary; this file explains how to change
the engine without breaking its data, interaction, or resource contracts.

## Non-negotiable boundary

- Three.js is imperative and owns only presentation. `src/systems/` owns data
  semantics, placement, risk, detail models, and provenance.
- There is one WebGL renderer. Do not add React Three Fiber, a renderer switch,
  a second RAF, or a Canvas fallback without an explicit architecture decision.
  A measured WebGPU spike at r185 was a NO-GO and was removed from the
  production graph; see `agents/2026-07-29-webgpu-spike-report.md`. Do not
  restore its runtime query switch. A future spike needs an isolated entry or
  worktree and must add zero bytes to the production build.
- Rendering, hit testing, keyboard targets, following, detail anchors, and
  debug output must use the same display tile and ship motion sample.
- Reduced motion renders a deterministic frame on demand; normal motion owns
  exactly one route-level RAF.
- A failed module, context, or render transitions to DOM `WorldStaticOverview`.

## Runtime map

| Area | Owner | Use it for |
| --- | --- | --- |
| Frame/lifecycle contract | `src/renderer/world-renderer-backend.ts` | renderer input, status, metrics, disposal |
| Scheduling and interaction index | `src/renderer/` | adaptive quality, hit targets, pointer lookup |
| Route orchestrator | `src/pharosville-world.tsx` | DOM overlays, selection, refs, camera integration |
| Frame loop | `src/hooks/use-world-render-loop.ts` | RAF, samples, DPR, scheduler, metrics, failure |
| Scene root | `src/three/world-renderer.ts` | scene lifecycle and per-frame composition |
| Pure world | `src/systems/` | facts, geography, water classification, movement |

Within `src/three/`, keep ownership local:

| Module group | Responsibility |
| --- | --- |
| `garden-water`, `garden-sea-regions`, `garden-zones`, `garden-wakes` | shader water (Gerstner + region field), persistent wake field, weather and buoy cues |
| `garden-ships`, `garden-fleet-batch`, `garden-sail-atlas` | ship geometry, hero attachment, fleet instances, shared sail atlas |
| `garden-docks`, `garden-chain-flag`, `garden-harbor-life` | harbor forms, flag atlas, districts and ambient life |
| `garden-island`, `garden-lighthouse`, `garden-landmarks`, `garden-islets` | island, Pharos (volumetric beam), wreckyard, pigeonnier, scenic anchors |
| `garden-sky`, `garden-sky-billboards`, `garden-horizon`, `garden-day-cycle`, `garden-post` | scattering sky, mist/cumulus billboards, time-of-day composition, pmndrs post |
| `garden-models`, generators | model manifest, cached GLBs, deterministic artifacts |

Two cross-module systems own their own contracts:

- **Weather** (`src/systems/weather.ts`): one pure plan — wind, gust,
  stormLevel, lightning — derived from the world clock and the sea state's
  PSI stress. Deterministic (no Math.random; lightning is an integer-slot
  hash), allocation-free via `writeWeatherPlan`, frozen with the clock under
  reduced motion. Weather is WORLD state like the day cycle: identical at
  every tier, and it may change color — tiers only shed fidelity. Water,
  rain, fleet cloth, gulls, sky, the PMREM probe key, and post all consume
  the same per-frame plan; add consumers, never a second weather source.
- **Post** (`garden-post.ts`): pmndrs `postprocessing`, not the three/examples
  EffectComposer stack. Chain: RenderPass → N8AOPostPass (half-res,
  full/balanced only, zoom-faded) → Bloom → fused grade+AgX (one custom
  Effect) → SMAA. Per-day-phase values live in one config table that also
  carries the storm scalars; add phase/storm tuning as table entries, never
  runtime branches. The grade's `flash` uniform is the lightning channel.
  `n8ao` and `postprocessing` are exact-pinned. N8AO 2.0.0 publishes no
  TypeScript declarations, so `src/types/n8ao.d.ts` documents only the pass
  surface this app consumes and must be checked against the installed source
  before either dependency changes.

## Frame contract

`ThreeWorldRenderer.render(frame)` receives world, camera, size/DPR,
selection/hover, motion plan and samples, logo access, time, sea state, and
scheduler tier. It returns GPU and render metrics. Do not reach around this
contract to create a parallel timer, fetch data, or read React state.

The render loop may be called repeatedly with the same world and changing
motion; a rebuilt world replaces scene content. A frame may also occur after a
logo or GLB load. Code must therefore be safe to refresh without accumulating
objects, textures, lights, or event listeners.

Quality tiers are `full`, `balanced`, `interaction`, `recovery`, and
`constrained`. The scheduler can reduce shadows, post effects, ambient work,
or inspection detail. It cannot remove analytical truth, selection, or DOM
parity. Reduced motion pins a single full-quality static composition.

Two rules keep the ladder from reading as a flicker rather than a quality
step. First, no tier may change semantic hues, palette authority, AgX tone
mapping, the day-cycle grade, or the vignette. Those composer stages stay on
at every tier. Enumerated fidelity effects may change local luminance or
contrast — the bloom pyramid at `constrained`, N8AO at `recovery` and below
(painted contact discs carry the grounding intent) — but transitions must be
bounded and must not change analytical meaning. Second, `interaction` is a
transient flag raised for the length of a camera gesture, not a load
measurement — gating scenery
visibility on it blinks that scenery out exactly while the user is moving
the camera, so treat it as `balanced` for anything the eye can see appear
or disappear.

New effects plug into the ladder, never around it: the volumetric beam runs
at full/balanced and degrades to the plain cone below (`uVolumetric`), mist
billboards and the wake field ease in at balanced+ (the caustic web at full
only), and route pulse lanes animate at balanced+ and hold static below —
the same static-lane behavior every lane has always had. The authored
cumulus billboard layer is disabled pending operator A/B review at whole-map
zoom.

## Offscreen passes and the draw-call budget

`renderer.info` is accumulated by hand across the whole frame (autoReset is
off), so every offscreen pass counts against the 700-call budget unless it
runs BEFORE the manual reset at the top of `render()`. The wake field's
ping-pong stamp/fade passes and the sky PMREM rebake are deliberately placed
there — the budget then measures the scene, and a wake update or probe bake
cannot read as a draw-call spike. Any new offscreen pass goes in the same
pre-reset slot or accepts being counted.

Bundle caps (`scripts/bundle-budgets.mjs`): renderer chunk 1,600 KiB raw /
454 KiB gzip; aggregate JS 3,200 KiB raw / 820 KiB gzip. The checker also
rejects the removed WebGPU factory, `three.webgpu`, and TSL probe chunk names.

## Scene and resource discipline

1. Create long-lived renderer, scene-level caches, and DOM event handlers once.
2. Build a `GardenContent` subtree from a world; replace and dispose it on a
   semantic world change.
3. Update transforms, uniforms, instance matrices, and draw ranges per frame.
4. Dispose renderer-owned geometry, materials, textures, render targets,
   listeners, and model libraries when their owner dies.

Use the existing helpers and caches. Never allocate a geometry, material,
texture, vector-heavy collection, light, or async loader in the hot frame path.
Shared GLB geometry remains cache-owned: if a stale hero clone resolves after
content replacement, drop the attachment without disposing shared resources.

### Harbor batch

`authorDock` writes dock-local `DockRecipe` data; it does not construct a
renderable subtree. `createGardenHarborBatch` transforms those recipes into
world-wide, vertex-coloured material buckets, one instanced mesh per prop kind,
and one atlas-driven instanced flag cloth. The per-dock roots remain empty
anchors for cues and interaction. Runtime changes go only through
`setDockAccent`, `setFlagPose`, and `setFineDetailVisible`; Wave 3 shore-station
archetypes should author into the same recipe surface rather than add per-dock
meshes.

The normal fleet is fixed-capacity instancing (320 ships). Keep its cost flat
by extending shared batch geometry or attributes instead of adding an object
tree per ship. Hero ships are the deliberate exception and retain their own
checked GLB scene graph.

## Coordinates and semantic parity

The pure map is tile-based. Use the established slice/display helpers for
tile-to-world and tile-to-screen transforms; do not invent a renderer-local
offset. The terrain classification is authoritative for water bodies and ship
placement. Shader boundary smoothing is presentation only and must not change
a tile's semantic region.

When a visual change encodes data, update all of the following as applicable:

- source field and explanation in `src/systems/visual-cue-registry.ts`;
- detail model and accessibility ledger wording;
- hit-test/keyboard target geometry;
- reduced-motion equivalent;
- unit tests plus visual evidence.

## Media rules

- Stablecoin sails and harbor flags use shared in-memory atlases. A failed
  image leaves a painted symbol/initials fallback, never an empty identity.
- GLBs are content-addressed manifest entries with deterministic generators.
  Change the generator, regenerate, then run `npm run check:garden-models`;
  do not edit the binary by hand.
- Models attach over aligned procedural fallbacks. Preserve origin, scale,
  anchors, pick proxy, and budget together.
- Runtime image paths are same-origin. Do not add remote generation URLs,
  tokens, or unreviewed asset inventories.

## Change recipes

### New or changed analytical cue

1. Model its meaning and provenance in `src/systems/`.
2. Add DOM/detail parity and a reduced-motion representation.
3. Render it from the existing frame inputs; share transforms with hit targets.
4. Test the data rule before taking visual evidence.

### Scene appearance or material

1. Change the owning `src/three/garden-*.ts` module.
2. Reuse palette, day-cycle, tier, and resource helpers.
3. Inspect day, dusk, night, reduced-motion, selection, and constrained-tier
   behavior. Inspect it with `npm run preview`, never through a Playwright
   browser — see "Measure on the GPU" below.
4. Run focused Three.js tests, `npm run test:visual`, and `npm run test:perf`
   when resource cost could move.

### Fleet or water scaling

1. Start in `garden-fleet-batch.ts` or `garden-sea-regions.ts`, not the DOM.
2. Preserve capacity, region placement, open-water clearance, and shared
   resource ownership.
3. Check GPU metrics and long-session stability; never relax a budget merely
   to hide unexplained drift.

### Measure on the GPU

Playwright's bundled Chromium is SwiftShader — a CPU rasteriser — and so is
`chromium.launch({ channel: "chrome" })`, which skips the wrapper that applies
the operator's `chrome-flags.conf`. A software frame looks approximately right
and reports fiction, which is the worst combination available: it invites tuning
the renderer against a bottleneck that does not exist. The same scene read
`recovery`/`constrained` at 20-43 fps through the bundle and `full` at 59 fps
(p90 16.7 ms) on the discrete GPU.

Practical consequences for anyone tuning this renderer:

- Use `npm run preview` for every look and every frame time. It exits non-zero
  rather than report a software frame.
- Do not add a detail level, drop a pass, or lower a tier threshold because a
  Playwright run looked slow. Confirm the cost on the GPU first.
- `schedulerTier` from a Playwright run tells you nothing about the operator's
  machine. Neither does `effectiveFps`.
- A frame time is only meaningful once the fleet is on screen AND the pacing
  ring has refilled: the snapshot rebuild resets it, and the load spike lingers
  in the 120-sample window as a false p90 of ~33 ms.

### Model or texture

Follow `ASSET_PIPELINE.md`, then run:

```bash
npm run check:runtime-media
npm test -- src/three/garden-models.test.ts
npm run test:visual
npm run test:perf
```

## Before handing off

```bash
npm test -- src/three src/renderer
npm run check:viewport-gate
npm run test:visual
npm run test:perf
git diff --check
```

Use `TESTING.md` for which browser and evidence lane applies. Update
`RUNTIME_FACTS.md` only through its generator when an extracted contract moves.

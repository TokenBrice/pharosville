# Three.js Phase 0 Evidence

Date: 2026-07-23

Status: Phase 0 complete

Plan:
[`2026-07-23-threejs-implementation-plan.md`](./2026-07-23-threejs-implementation-plan.md)

## Reference Machine

- CPU: AMD Ryzen 7 7800X3D, 8 cores / 16 threads
- GPU: NVIDIA GeForce RTX 5070 Ti
- Memory: 61 GiB
- Browser lane: bundled Playwright Chromium
- Reference viewport: 1440 x 1000

All later local gates must use this machine and viewport unless the operator
changes the reference explicitly.

## Beauty Spike

Concept renders:

- `outputs/threejs-beauty-spike/concepts/garden-observatory-day.png`
- `outputs/threejs-beauty-spike/concepts/garden-observatory-dusk.png`

Runnable scene:

- `outputs/threejs-beauty-spike/`
- `http://localhost:5173/outputs/threejs-beauty-spike/`

Binding candidate reference:

- `outputs/threejs-beauty-spike/visual-reference.md`

The first runnable spike was rejected because it was centered, monochromatic,
too full, and too dependent on literal garden imagery. The revised spike uses a
left-biased island, quiet full-bleed sea, two docks, three distinct hull
silhouettes, two localized risk fields, restrained light, and no literal garden
props. It passed browser validation with WebGL active and no console, page,
network, or HTTP errors.

The runnable scene is a procedural-feasibility proof, while the day and dusk
concepts are the binding finish target for production.

## Canvas Baseline

Production bundle:

| Surface | Raw | Gzip |
| --- | ---: | ---: |
| Entry | 7.9 KiB | 3.0 KiB |
| Desktop data | 632.5 KiB | 173.5 KiB |
| World | 396.2 KiB | 126.0 KiB |
| Total JavaScript | 1,285.6 KiB | 382.4 KiB |

`npm run build` and `npm run check:bundle-size` passed.

Canonical perf lane:

```bash
PHAROSVILLE_VISUAL_REUSE=0 npm run test:perf
```

- Two dense-fixture sustained-motion tests passed.
- Cold first coherent frame: 1.561 seconds.
- Cold entity-pass average: 2.85 ms.
- Steady entity-pass average: 1.55 ms.
- Long tasks during the five-second sustained window: 0.

Live-data capture at 1440 x 1000:

| State | First coherent | p90 | FPS | Long tasks | Scheduler | Visible ships |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Day | 1.98 s | 33.4 ms | 40.2 | 1 / 97 ms max | recovery | 137 |
| Dusk | 2.09 s | 33.4 ms | 31.2 | 2 / 78 ms max | recovery | 136 |
| Night | 1.03 s | 33.4 ms | 30.3 | 3 / 103 ms max | recovery | 137 |
| Reduced motion | 0.36 s | no loop | static | 3 / 709 ms max | full | 187 |
| 12x CPU pressure | 15.42 s | 866.7 ms | 2.0 | 64 / 2,366 ms max | constrained | 135 |

The deliberately pressured row exists to capture the constrained visual state,
not as a normal performance expectation.

Screenshots and the reproducible capture script:

- `outputs/threejs-baseline/canvas-day.png`
- `outputs/threejs-baseline/canvas-dusk.png`
- `outputs/threejs-baseline/canvas-night.png`
- `outputs/threejs-baseline/canvas-reduced-motion.png`
- `outputs/threejs-baseline/canvas-pressured-quality.png`
- `outputs/threejs-baseline/canvas-baseline-metrics.json`
- `outputs/threejs-baseline/capture.mjs`

## Preserved Invariants

- Browser code calls same-origin `/api/*` only.
- `PHAROS_API_KEY` remains server-side.
- The desktop gate runs before world data, renderer, or 3D asset loading.
- `PharosVilleWorld` remains the canonical analytical state.
- Lighthouse, docks, ships, water, routes, and cemetery retain their documented
  meanings and caveats.
- One world clock owns motion, drawing, picking, selection, and camera state.
- Reduced motion has deterministic placement and no continuous animation loop.
- Exact facts, labels, source fields, failures, and caveats remain in the DOM.
- Search, URL state, keyboard traversal, focus restoration, announcements,
  details, and the accessibility ledger remain available.
- Quality downshifts remove decoration before analytical meaning.
- Changes to overview fleet density require explicit product approval and an
  update to the visual invariants.

## Experiment Flag

The `three-experiment` Vite mode defines
`__PHAROSVILLE_THREE_EXPERIMENT__`. Ordinary `npm run build` defines it as
false and retains the unchanged bundle contract.

Validation:

- `npm run typecheck` passed.
- Ordinary `npm run build` passed.
- Ordinary `npm run check:bundle-size` passed at the baseline sizes above.

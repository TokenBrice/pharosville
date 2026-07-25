# PharosVille Testing and Visual Review

Last updated: 2026-07-25

Use the smallest check that proves the contract you changed. The production
world has one Three.js renderer and a DOM `WorldStaticOverview` for renderer or
GPU failure.

## Choose a lane

| Change | First check | Add when needed |
| --- | --- | --- |
| Pure world, data, layout, motion | `npm test -- src/systems` | focused scenario test |
| Renderer, material, hit testing | `npm test -- src/three src/renderer` | `npm run test:visual` |
| Model, atlas, texture, runtime URL | `npm run check:runtime-media` | `npm run test:perf` |
| Viewport/loading boundary | `npm run check:viewport-gate` | visual gate lane |
| Docs only | `npm run validate:docs` | `git diff --check` |
| Mixed or uncertain scope | `npm run validate:changed` | relevant browser/perf lane |

`npm run test:visual` runs the production behavior, interaction, gate, and
failure coverage. Run `npm run test:visual:cross-browser` when accessibility or
browser interaction changes. Chromium is the reference-performance browser;
Firefox is the second accessibility/interaction browser. Safari is not a
cutover acceptance browser.

## Required browser contracts

The visual lane must keep proving:

- a nonblank ready Three.js surface (`data-renderer="three"`);
- resize, pan, zoom, selection, blank-world clear, Escape, deep links, and
  Observe interruption;
- the complete capacity-bounded fleet, its individual hit targets, and a
  temporary selected outsider only when capacity is exceeded;
- detail-panel, label, announcement, and accessibility-ledger parity;
- day, dusk, night, reduced motion, hidden/offscreen pause, and renderer
  module/WebGL/context failure;
- a blocked viewport with no world data, Three.js, model, or logo request.

## Visual review

Use deterministic API fixtures, screen/viewport, time, and reduced-motion
state. Keep scratch evidence under `outputs/`, never in `test-results/` or the
repository history.

| State | Review question |
| --- | --- |
| Day, 1440×1000 | Is the lighthouse dominant, sea legible, fleet readable, and chrome clear? |
| Dusk and night | Do light, water, flags, and details retain hierarchy? |
| Reduced motion | Is this a complete composed frame, not an accidental pause? |
| Overview and inspection | Are livery, marks, harbors, water bodies, labels, and selection clear? |
| Dense fleet | Do ships preserve water-safe spacing, open-water clearance, and bounded cost? |
| GPU failure | Is the selectable DOM overview useful with no broken WebGL visible? |
| Narrow/portrait | Does the intended DOM fallback/rotate prompt make no world requests? |
| Ultrawide | Does framing stay stable with no UI/world overlap? |

Before accepting visual drift, verify the fixture, camera, time/reduced-motion
state, semantic detail, model/logo availability, GPU metrics, and DOM meaning.
GPU raster variation is not automatically a product change. Do not replace
evidence merely to silence unexplained differences.

## Performance and bundle

```bash
npm run test:perf
npm run build
npm run check:bundle-size
```

The performance suite measures coherent startup, pacing, long tasks, GPU
resources, long-session stability, transient selection cleanup, and clock
shutdown. Current resource ceilings are 700 draw calls, 500 geometries, 72
textures, and 500,000 triangles. `npm run test:perf:reference` is the strict
reference-hardware gate; headless or integrated results are diagnostics, not a
substitute for the designated reference environment.

### Never judge the look or the frame time through a Playwright browser

Playwright's bundled Chromium falls back to **SwiftShader**, a CPU rasteriser,
and so does `chromium.launch({ channel: "chrome" })` — the latter because it
launches `/opt/google/chrome/chrome` directly and skips the wrapper that applies
the operator's `~/.config/chrome-flags.conf`. On a hybrid-GPU box that file is
what pins rendering to the discrete card.

The same scene, same machine, measured 2026-07-25:

| | bundled Chromium | operator's Chrome |
| --- | --- | --- |
| renderer | SwiftShader (CPU) | NVIDIA RTX 5070 Ti |
| p50 / p90 | ~17 / 33.4 ms | 16.7 / 16.7 ms |
| effective fps | 20–43 | 59 (vsync-capped) |
| scheduler tier | `recovery` → `constrained` | `full` |

A software frame looks approximately right and reports fiction, which is the
worst combination: it invites tuning the renderer against a bottleneck that does
not exist. Use:

```bash
npm run preview                                    # default framing
npm run preview -- --hash "#t=22&n=1" --out night.png
npm run preview -- --headed --seconds 8
```

`scripts/pharosville/preview.mjs` goes through the wrapper, exits non-zero rather
than report a software frame, and prints the scheduler tier, p50/p90, draw calls,
triangles and visible ship count alongside a screenshot in `outputs/`. It waits
for the fleet to populate and then for the pacing ring to refill before reading,
because both the snapshot rebuild and the load spike otherwise dominate the
window.

## Release confidence

```bash
npm run validate:release
npm run smoke:live -- --url https://pharosville.pharos.watch
```

Report the checks actually run and anything intentionally skipped. A green
local run does not authorize a manual tag or GitHub Release; follow
`RELEASES.md`.

# PharosVille Testing and Visual Review

Last updated: 2026-10-14

Use the smallest check that proves the contract you changed. The production
world is The Harbour (`src/harbour/`), one three.js WebGL2 Engine; if WebGL2
cannot start, the first-paint poster and guide stay up. The Garden Observatory
lanes, census and calibration protocols were retired with that world at the
Harbour cutover (2026-10-14); they remain in git history.

## Choose a lane

| Change | First check | Add when needed |
| --- | --- | --- |
| Harbour data, model, sim, readings | `npx vitest run src/harbour` | focused scenario test |
| Engine, systems, shaders, fleet, UI | `npx vitest run src/harbour` | `npm run preview` (real GPU) |
| Shell, viewport gate, first paint | `npm test -- src/client.test.tsx` | `npm run check:viewport-gate`, `npm run test:visual` |
| Runtime GLB, texture, poster, logo | `npm run check:runtime-media` | `npm run preview` |
| Bundle weight | `npm run build && npm run check:bundle-size` | a measured re-baseline in `scripts/bundle-budgets.mjs` |
| Docs only | `npm run validate:docs` | `git diff --check` |
| Mixed or uncertain scope | `npm run validate:changed` | relevant browser lane |

## Required browser contracts

`npm run test:visual` (`tests/visual/harbour-dom.spec.ts`) asserts DOM state
only, never pixels:

- the first paint carries the title, the poster, the guide and the links;
- a blocked viewport (screen or window too small; size tests, never
  orientation) gets the welcome page and requests no `/api/*`, GLB or Harbour
  chunk;
- an admitted desktop viewport mounts the world canvas, or, without WebGL2,
  keeps the poster with an honest failure message and the links.

`npm run test:visual:cross-browser` runs the accessibility subset in Chromium
and Firefox.

## Looks and frame time: real GPU only

Never judge how the Harbour looks or how fast it runs through a Playwright
browser: the bundled Chromium and `channel: "chrome"` both fall back to
SwiftShader and report fiction. Use `npm run preview`, which runs
`scripts/harbour/shot.mjs`: it launches the operator's Chrome through its
wrapper (headed), refuses to report a software frame, saves a PNG and prints
the GPU identity, frame-time p50/p95/max and `window.__harbourStats` (draws,
triangles, first frame, pixel ratio, GPU ms):

```bash
npm run preview -- --url "http://localhost:5173/?t=18.5" --out outputs/harbour/x.png --seconds 4
```

`?t=<hour>` pins the time of day; `?view=heart|overview` picks the camera.
LOOK at every PNG before claiming anything about the picture.

### The CI visual lane renders no world

Reproduced in `mcr.microsoft.com/playwright:v1.59.1-noble`, the CI image at the
time (`deploy-cloudflare.yml` has since moved to `v1.63.0-noble`; the finding
has not been re-measured there):

- **Firefox gets no WebGL context at all** — not with `webgl.force-enabled`,
  `webgl.disabled`, `webgl.forbid-software`, `LIBGL_ALWAYS_SOFTWARE`,
  `GALLIUM_DRIVER=llvmpipe` or `MOZ_ENABLE_WEBRENDER`. Locally Firefox is fine
  both on the GPU and forced to software GL, so this is the container.
  the Firefox half of `visual` therefore exercises the DOM fallback, which it
  does correctly: the signal overview renders and the accessibility ledger
  carries every ship.
- **Default Chromium can reach SwiftShader and block DOM assertions** —
  omitting hardware flags does not prevent software WebGL. The original motion
  lane timed out on `locator.screenshot` at 180s; the expanded dense-data DOM
  cases also stalled while their correct caveat ledger was already present.

**How it is resolved.** CI gates on `@visual-dom` in
`tests/visual/harbour-dom.spec.ts`: the contract a visitor whose browser cannot
render the world is owed, which is precisely what a GPU-less runner is. Under CI
Chromium launches with `--disable-webgl` unless `PHAROSVILLE_VISUAL_GPU=1`, so
the Harbour's boot fails deterministically and the lane proves the poster, the
arrival guide, the failure message and the links stay useful, and that a
blocked viewport requests nothing.

**Known cost, stated plainly:** a renderer regression that only shows on a GPU
will not be caught by CI, and the Harbour has no automated real-GPU frame-time
tripwire yet (`validate:deploy-gate` reports `PASS_PERF_SKIPPED`). Until one is
wired, measure with `npm run preview` before every release.

## Release confidence

```bash
npm run validate:release
npm run smoke:live -- --url https://pharosville.pharos.watch
```

Report the checks actually run and anything intentionally skipped. A green
local run does not authorize a manual tag or GitHub Release; follow
`RELEASES.md`.

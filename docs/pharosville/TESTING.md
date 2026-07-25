# PharosVille Testing

Last updated: 2026-07-24

Use the smallest lane that proves the changed contract. The production world
has one Three.js renderer and a DOM static overview for renderer/GPU failure.

## Fast Checks

World model or motion:

```bash
npm test -- src/systems
```

Three.js scene or materials:

```bash
npm test -- src/three
```

Lighthouse artifact:

```bash
npm run check:garden-models
npm test -- src/three/garden-models.test.ts
```

Viewport import boundary:

```bash
npm run check:viewport-gate
```

Docs only:

```bash
npm run validate:docs
```

Mixed or uncertain scope:

```bash
npm run validate:changed
```

## Browser Behavior

Run the production Three.js behavior and gate lane when pixels, camera
interaction, selection, Observe, labels, day cycle, reduced motion,
WebGL failure, or DOM fallback behavior changes:

```bash
npm run test:visual
```

Run Chromium and Firefox when browser behavior or accessibility changes:

```bash
PHAROSVILLE_VISUAL_BROWSERS=chromium,firefox npm run test:visual
```

Safari is not a cutover acceptance browser.

The browser lane must cover:

- a nonblank Three.js world with `data-renderer="three"`;
- resize, pan, zoom, selection, blank-world clear, and Escape;
- stable 20-ship overview plus transient outsider selection;
- DOM detail and accessibility-ledger parity;
- day, dusk, night, and reduced-motion frames;
- analytical labels and interruptible Observe mode;
- blocked viewport behavior with no data, Three.js, model, or logo requests;
- WebGL/module/render failure showing `WorldStaticOverview`, not another
  graphical renderer.

## Performance

Headless diagnostics:

```bash
npm run test:perf
```

Reference-hardware gate:

```bash
npm run test:perf:reference
```

The performance suite measures:

- time to first coherent frame;
- steady frame-pacing p90 and effective FPS;
- recurring long tasks;
- draw calls, geometries, textures, and triangles;
- resource stability over a long session;
- transient outsider selection and disposal;
- hidden-tab and reduced-motion clock shutdown;
- delayed or failed renderer-module behavior.

The current diagnostic ceilings in
`tests/visual/pharosville-performance.spec.ts` are:

| Resource | Ceiling |
| --- | ---: |
| Draw calls | 450 |
| Geometries | 275 |
| Textures | 24 |
| Triangles | 42,000 |

Reference performance must run on the operator's reference machine with the
intended discrete GPU render node. Headless software or integrated-GPU results
are useful diagnostics but are not substitutes for that gate.

## Visual Review

Screenshots should answer product questions, not merely prove nonblank pixels.
Review at `1440 x 1000` and an ultrawide desktop:

- water reads as water rather than a flat color field;
- lighthouse shell, beacon, beam, and reflection are coherent;
- the island has asymmetric garden composition and useful negative space;
- sail logos and fallback symbols remain legible;
- ships do not collide incoherently or cover labels;
- risk areas remain distinguishable without overpowering the scene;
- the detail panel, world controls, labels, and world do not overlap;
- reduced motion remains a complete static composition;
- the GPU fallback is useful without WebGL.

Use `VISUAL_REVIEW_ATLAS.md` for the review matrix.

## Build And Bundle

```bash
npm run build
npm run check:bundle-size
```

The build must contain the required Three.js renderer chunk and stay within the
per-chunk and aggregate budgets in `scripts/bundle-budgets.mjs`.

## Release Confidence

Before claiming broad release confidence:

```bash
npm run validate:release
```

For deployed changes:

```bash
npm run smoke:live -- --url https://pharosville.pharos.watch
```

A green local run does not authorize a manual semantic tag or GitHub Release.
Follow `RELEASES.md`; `.github/workflows/release.yml` publishes only after a
green `main` deployment.

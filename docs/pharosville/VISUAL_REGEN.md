# PharosVille Visual Evidence

Last updated: 2026-07-24

Three.js output can vary slightly across GPU vendors, drivers, and browser
versions. Use deterministic inputs and review semantic appearance plus measured
resources; do not treat every pixel difference as a regression.

## Before Capturing

1. Use the repository Node 24 toolchain.
2. Fix the browser, viewport, device screen, wall-clock hour, fixture, and
   reduced-motion state.
3. Confirm `data-renderer="three"` and renderer status `ready`.
4. Close stale browser sessions that may hold the dev server or GPU context.
5. Keep scratch output under `outputs/`.

## Capture Lane

```bash
npm run test:visual
```

For performance evidence:

```bash
npm run test:perf
```

The browser specs capture day, dusk, night, reduced motion, labels, Observe,
interaction, and relevant telemetry. Use the reference-hardware lane for strict
performance acceptance.

## Review Before Accepting Drift

- Is the same model and logo data loaded?
- Is the camera at the same target and zoom?
- Did day-cycle or reduced-motion state change?
- Did a semantic detail level change?
- Did draw calls, geometry, textures, or triangles move unexpectedly?
- Is the difference a GPU rasterization edge or a product-visible change?
- Does the DOM detail/ledger meaning remain unchanged?

Regenerate or replace committed browser evidence only for intentional product
changes. Record the reason in the change or release context.

## Never Commit

- `outputs/`
- `test-results/`
- `.playwright-cli/`
- local environment files
- reference-hardware telemetry containing machine-specific scratch paths

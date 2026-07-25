# PharosVille Renderer Boundary

The production world uses Three.js. The immutable `PharosVilleWorld` model,
camera, motion sampler, selection state, and DOM analytics stay engine-neutral.

Agent deep-dive: `docs/pharosville/THREEJS_AGENT_REFERENCE.md` (module map,
frame contract, disposal, tiers, and change recipes).

## Files

- `world-renderer-backend.ts` is the narrow frame and lifecycle contract.
- `render-scheduler.ts` selects balanced, interaction, recovery, constrained,
  and deterministic reduced-motion quality.
- `garden-observatory-hit-testing.ts` projects the full capacity-bounded Three
  composition into accessible pointer and keyboard targets.
- `hit-testing.ts` owns the small spatial index and target resolver.
- `../three/` owns scene construction, water, models, landmarks, ship identity,
  and GPU resource disposal.

## Contracts

- The renderer consumes world data; analytical meaning belongs in `systems/`.
- Drawing, hit targets, labels, and follow-selected use the same display tiles
  and motion samples.
- Reduced motion renders a deterministic frame without a continuous loop.
- Blocked or portrait viewports import no desktop data, Three.js, or GLB.
- GPU/context failure shows the DOM signal overview; there is no Canvas
  renderer fallback.
- Runtime models are same-origin, content-addressed, budgeted, and validated.

## Validation

```bash
npm test -- src/renderer src/three
npm run check:garden-models
npm run test:visual
npm run test:perf
```

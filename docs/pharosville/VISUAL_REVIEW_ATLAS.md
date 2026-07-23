# PharosVille Visual Review Atlas

Last updated: 2026-07-24

The atlas is a review matrix for the production Three.js world. Scratch
screenshots and telemetry belong under `outputs/`; committed docs should record
the contract, not transient machine output.

## Required Frames

| Frame | Review |
| --- | --- |
| Day, `1440 x 1000` | asymmetric Garden Observatory composition, water depth, lighthouse silhouette, ship identity, UI fit |
| Dusk | warm beacon, restrained sky transition, legible ships and zones |
| Night | beacon/beam/reflection hierarchy, harbor lights, readable details |
| Reduced motion | complete time-zero composition, no missing analytical cues |
| Explore zoom | dock and ship inspection detail without overlap |
| Selected outsider | transient 21st ship, detail parity, route/follow behavior |
| Dense fixture | 20-ship readability, collision behavior, labels, draw inventory |
| GPU failure | selectable DOM overview, details, no visible broken WebGL surface |
| Narrow/portrait | intended DOM fallback or rotate prompt; no world requests |
| Ultrawide | stable framing, DPR budget, no UI/world overlap |

## Commands

Functional and visual states:

```bash
npm run test:visual
```

Chromium and Firefox:

```bash
PHAROSVILLE_VISUAL_BROWSERS=chromium,firefox npm run test:visual
```

Performance and resource inventory:

```bash
npm run test:perf
```

## Product Checklist

- Water has broad depth hierarchy, shallow shore color, fine directional
  ripples, wakes, and lighthouse reflection; it does not read as a flat blue
  block or noisy camouflage.
- The lighthouse is the first visual anchor and reads as active during day,
  dusk, and night.
- The island resembles a planted observatory garden, not stacked placeholder
  primitives.
- Negative space remains intentional while the harbor still feels inhabited.
- Stablecoin identity is readable through sail logo/symbol, livery, and hull
  accent.
- Ship families differ without relying on tiny detail.
- Analytical zone treatments remain quieter than the ships and lighthouse.
- DOM labels and detail panels never overlap primary world content
  incoherently.
- Cemetery and pigeonnier remain distinct and understandable.
- Ambient gulls and weather add life without becoming focal animation.
- Reduced motion is composed, not merely paused mid-frame.
- No missing-image box, prototype URL, debug material, or unlicensed asset is
  visible.

## Evidence Rules

- Capture the full page and, when useful, the WebGL surface alone.
- Record browser, viewport, screen size, reduced-motion state, wall-clock hour,
  and renderer metrics.
- Compare against the approved composition and current route contract.
- Investigate unexplained drift before replacing any baseline.
- Do not commit `outputs/`, `test-results/`, or local browser scratch.

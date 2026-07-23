# PharosVille Motion Policy

Last updated: 2026-07-24

PharosVille uses one route-owned motion clock. `useWorldRenderLoop` advances
motion sampling, camera intent, hit targets, scheduler state, and Three.js
rendering from the same `requestAnimationFrame` lifecycle.

Reduced motion renders deterministic static frames on demand and must not keep
a continuous RAF alive.

## Speed Classes

- **Static:** island terraces, dock footprints, district pads, cemetery
  markers, DOM labels, and detail UI.
- **Slow:** water shader motion, lighthouse beam and reflection, harbor lights,
  zone pulses, weather drift, ship bobbing, and the nine-gull ambient flock.
- **Medium:** deterministic ship movement, camera follow, and Observe camera
  transitions.
- **Fast:** wakes, recent-change signals, and risk/weather accents only.

## Priority

1. Selected or keyboard-focused entity.
2. Active risk or critical PSI state.
3. Recent supply or data change.
4. Harbor, cemetery, or landmark state.
5. Ambient life.

Decorative motion must never obscure or delay a higher-priority analytical cue.

## Renderer Scheduler

The shared render scheduler derives `full`, `interaction`, `constrained`, or
`recovery` from camera intent, draw duration, frame pacing, and reduced motion.

- Analytical entities, selection, hit targets, DOM labels, and details remain.
- Inspection-only ship and dock geometry may be hidden outside Explore/focus.
- Wakes, weather detail, gulls, or other ambient work may be reduced or hidden
  under pressure.
- A constrained tier must change bounded detail, not analytical meaning.

The gull flock is exactly nine instanced silhouettes. Its motion is
deterministic, freezes at the time-zero composition under reduced motion, and
may hide on the constrained tier.

## Ship Motion

- Ship routes use the existing water-only motion plan and risk-placement
  semantics.
- Calm, watch, alert, warning, danger, and ledger remain ordered analytical
  water destinations.
- Higher turbulence may increase dwell, drift, and wake intensity without
  changing the underlying risk classification.
- Route geometry is deterministic for the same world and cycle inputs.
- Motion sampling, rendered pose, hit testing, follow-selected, and debug state
  must use the same sample.
- Reduced-motion ships use deterministic static positions and headings.
- Docking cadence visualizes rendered chain presence; it does not claim real
  transfer or issuer activity.

## Observe

Observe mode advances through a bounded analytical sequence using the existing
clock and one timeout per beat. It is available only during normal motion.

Pointer, wheel, keyboard, visibility, or reduced-motion changes must interrupt
Observe immediately. It may focus the top risk mover, growth story, and
concentration story, but it cannot invent a new ranking or analytical field.

## Visibility

When the WebGL surface is offscreen or the document is hidden:

- cancel the pending frame;
- retain current semantic motion state;
- resume with a zero accumulated time delta;
- do not teleport ships across a delayed interval.

## Prohibited Motion

- independent analytical CSS animations;
- a second renderer loop;
- per-entity intervals or timers;
- unbounded particles or ambient entities;
- wall-clock randomness;
- motion with no reduced-motion equivalent;
- decorative motion that implies transfers, activity, or risk.

## Debug Contract

Development and test builds expose the shared debug state, including:

- `motionClockSource`
- `activeMotionLoopCount`
- `motionCueCounts`
- `motionFrameCount`
- `reducedMotion`
- renderer and GPU metrics

Reduced motion reports `activeMotionLoopCount = 0` and
`motionClockSource = "reduced-motion-static-frame"`. Normal motion reports one
active loop and `motionClockSource = "requestAnimationFrame"`.

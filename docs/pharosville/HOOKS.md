# PharosVille Hooks — Memoization Conventions

Created: 2026-05-04
Source: maint F8 audit from the May 4 Optimizantus health-checkup.

This doc captures the memoization rules used (and to be used) across
`src/hooks/` and the canvas-side consumers in `src/pharosville-world.tsx`.
It exists because audits surfaced inconsistency between hooks of comparable
size — `use-canvas-resize-and-camera.ts` (542 LOC) defines 19 `useCallback`s
while `use-world-render-loop.ts` (842 LOC) defines exactly 1. Neither
extreme is wrong on its own; the rules below explain when each is right.

---

## When to `useMemo`

Use it when **at least one** holds:

1. The value is structurally expensive to recompute (full A* warmup, world
   build, Map construction over N ships).
2. The reference identity is read by a downstream `React.memo`, `useMemo`,
   `useEffect` dep array, or hook input that triggers an effect re-bind on
   identity change.
3. The value is passed into a hook that internally treats it as a stable
   reference (e.g., `motionPlanRef = useLatestRef(motionPlan)` —
   downstream readers expect identity churn to mean a real change).

Examples in-tree:

- `use-pharosville-world-data.ts:134` — `world` is built once per
  data-content change; downstream hooks key 5+ effects on `world` identity,
  so churn would tear down the RAF loop.
- `pharosville-world.tsx:40,46,47` — `baseMotionPlan`, `motionPlan`, and
  `shipsById` all feed downstream effect dep arrays.
- `use-asset-loading-pipeline.ts:130` — `uniqueLogoSrcs` derives a sorted,
  deduped list, then a content signature drives the loader effect.

## When to `useCallback`

Use it when **at least one** holds:

1. The callback is consumed as a prop by a `React.memo` child.
2. The callback is added to an event listener (`addEventListener`, RAF,
   IntersectionObserver) where re-binding every render would mean a
   detach/attach cycle.
3. The callback is in a hook input object whose hook depends on its
   identity (typical for our hook-to-hook plumbing).

Examples in-tree:

- `use-canvas-resize-and-camera.ts:209-472` — every pointer/keyboard
  handler is consumed by JSX event props; identity stability avoids
  re-attaching React listeners on every render.
- `use-fullscreen-mode.ts:6,14` — `exitFullscreen`/`toggleFullscreen` are
  surfaced to the toolbar (`React.memo`-eligible) and the keyboard hook.
- `pharosville-world.tsx:70,76` — `recomputeHitTargets*` wrappers are
  passed into the canvas hook; their identity must be stable so the
  canvas hook doesn't re-bind its pointer handlers.

## When NOT to `useMemo`/`useCallback`

Skip it when **all** hold:

1. Computation is cheap (string concat, primitive math, single small
   allocation).
2. Identity isn't read by downstream memos / effects / `React.memo`.
3. The value isn't propagated through `useLatestRef` or hook inputs.

Empirically every "just in case" memo we've added has cost more in
dependency-array maintenance and reader confusion than it has saved in
allocations. Render-loop hot paths live inside the RAF callback, not in
React render — memoizing render-pass values to "speed up" the canvas is a
category error.

---

## PharosVille-specific patterns

### `useLatestRef` (`src/hooks/use-latest-ref.ts`)

Returns a ref whose `.current` is updated **synchronously during render**.
Use it instead of the `useEffect(() => { ref.current = value; }, [value])`
pattern when an event handler / RAF / observer needs the latest committed
value without an effect tick of lag.

Canonical sites: `pharosville-world.tsx:56-58` (hovered/selected/motionPlan
mirroring), `use-canvas-resize-and-camera.ts:97-98` (camera/canvasSize
mirroring).

Rule: **don't** include a `useLatestRef` ref object in a dep array — the
ref is stable, the *value* it holds is what changes, and reading
`.current` in the consumer is the whole point.

### Render-loop ref forwarding

`use-world-render-loop.ts` mounts a single big `useEffect` keyed only on
plumbing that requires a full re-bind (`world`, `canvasSize.{x,y}`,
`assetManager`, `cameraReady`, `nightMode`, `shipsById`, `reducedMotion`).
Everything else — `hoveredDetailId`, `selectedDetailId`, `motionPlan`,
`camera`, `criticalAssetAttemptsSettled` — is read through refs from
`drawFrame`. This is why this hook has 26 `useRef`s and only 1
`useCallback`: refs are the optimization, not callbacks.

The `requestPaint` callback (`use-world-render-loop.ts:118-121`) is the
template for cross-effect signaling: it dereferences a stable
`paintRequestRef` whose `.current` is overwritten inside the RAF effect.
Consumers can include `requestPaint` in their dep arrays without
triggering re-binds.

When extending this hook, add a new ref + `useLatestRef`/`useRef`
mirroring effect rather than a new dep on the RAF effect.

### TanStack Query identity-stable returns

TanStack returns the same `data` reference across re-renders unless the
content actually changed. We exploit this in two places:

- `use-pharosville-world-data.ts:134` — `useMemo` for `world` keys on
  `data` identities directly. The comment at line 160 calls out the
  contract.
- `use-api-query.ts:74` — `notifyOnChangeProps: ["data", "error",
  "isLoading"]` excludes `isFetching`, preventing background polling
  ticks from re-rendering the desktop shell. This is the project's
  selector pattern; new queries should opt into the same shape unless
  they specifically need background-fetch state in the UI.

When a derived value is expensive *and* you want it per-query, prefer
TanStack's `select` option over a downstream `useMemo` — it runs at the
query layer and respects the same identity-stable contract.

---

## Audit findings

The following sites came from the original audit. Keep the resolved items as
examples of the project convention and use the remaining deferred items as
independently shippable cleanup candidates.

### F1 (P1) — Resolved: render-side mutation of `recomputeHitTargets*Ref.current`

- **Where:** `src/pharosville-world.tsx`
- **Resolution:** `recomputeHitTargetsRef` and the sync wrapper are assigned from
  effects, not by mutating `.current` during render. Keep future ref updates on
  the effect side of the render boundary unless the ref follows the
  `useLatestRef` pattern documented above.

### F2 (P2) — Documented contract: `useWorldRenderLoop` and `onBucketFlip` identity

- **Where:** `src/hooks/use-world-render-loop.ts:572-573` (eslint-disable),
  callback site at `:274`
- **Current contract:** `onBucketFlip` is read out of the input object once per
  re-bind. The current caller passes `setMotionBucket` from `useState`, so the
  callback identity is stable. The hook input documents that `onBucketFlip`
  must be stable.
- **Optional hardening:** Mirror `onBucketFlip` through `useLatestRef` and call
  `onBucketFlipRef.current?.(newBucket)` from the RAF closure if a future caller
  needs non-stable callback support.

### F3 (P2) — Debug telemetry `useEffect` dep list churns on every interaction

- **Where:** `src/hooks/use-world-render-loop.ts:583-623`
- **Issue:** 14-item dep list runs on every hover/select/asset-tick even
  in production where `isVisualDebugAllowed()` returns `false` after the
  early return at line 584. The effect body short-circuits, but React
  still walks the dep array and runs the cleanup of the previous tick.
- **Fix sketch:** Gate the effect on `isVisualDebugAllowed()` at the
  hook-call level (skip the `useEffect` entirely when not allowed) by
  conditionally wrapping in a sub-hook `useDebugTelemetryPublish(...)`
  that itself early-returns before declaring the effect — but that
  violates rules-of-hooks. Alternative: keep dep list but extract the
  early return to a guard ref so cleanup is a no-op.

### F4 (P3) — Over-callback in `use-canvas-resize-and-camera.ts`

- **Where:** `src/hooks/use-canvas-resize-and-camera.ts:430` and similar
- **Issue:** `handleFollowSelected` lists `cameraRef` and
  `shipMotionSamplesRef` in its dep array. Both are `MutableRefObject`s
  from `useLatestRef` — their identity never changes, so the callback
  identity never changes from this dependency. Noise; consistency drift
  vs. `canvasPoint:154-162` which (correctly) omits ref objects from
  deps.
- **Fix sketch:** Audit pass through every `useCallback` in the file,
  drop ref objects from dep arrays, and add a one-line ESLint inline
  comment explaining the omission so `react-hooks/exhaustive-deps`
  doesn't flag it. Same fix applies to `use-fullscreen-mode.ts:6,14,44`
  (`shellRef` in deps).

### F5 (P3) — Resolved: `usePharosVilleWorldData` world memo signature

- **Where:** `src/hooks/use-pharosville-world-data.ts`
- **Resolution:** The world memo now keys on `worldInputSignature`, which
  captures payload and freshness inputs in a single auditable dependency. Keep
  changes to that signature close to the world-build inputs it represents.

---

## Cross-references

- Repository conventions live in `AGENTS.md`; `docs/pharosville/README.md`
  links this memoization guide from the start-here list.
- Hook ownership boundaries and the canvas/render-loop split are
  documented in `docs/pharosville/CURRENT.md`.
- `CLAUDE.md` (top-level) intentionally minimal — see `AGENTS.md` for
  the canonical agent contract; memoization rules belong here, not
  there.

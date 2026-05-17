# Option 3: portrait-rotate state (follow-up to screen-capability gate)

Builds on the screen-capability gate ("option 1") landed in [the wide-screen-all-devices PR](#).
Where option 1 lets foldables and tablets through the desktop gate by measuring
`screen.width/height` instead of viewport, option 3 adds a polite "rotate to
landscape" prompt for those devices when the user is currently in portrait.

## Truth table

| screen-capable | portrait | render |
|---|---|---|
| false | — | `<DesktopOnlyFallback />` |
| true | true | `<RotateToLandscape />` (new) |
| true | false | `<PharosVilleDesktopData />` (lazy) |

## 1. Orientation detection

Add a separate `useIsPortrait()` hook in `src/client.tsx` (don't fold it into the
screen-capability hook — different question, different change source).

- **Primary detection:** `window.matchMedia("(orientation: portrait)")`. Same
  shape as `src/systems/reduced-motion.ts:7`.
- **Why not `screen.orientation.type`:** missing on older iOS Safari and some
  WebViews; disagrees with the visual layout when a desktop browser window is
  taller than wide on a landscape monitor. The CSS `(orientation: portrait)`
  query is defined against the viewport aspect, which is what we want for
  "rotate or widen".
- **Failure modes:**
  - Guard `typeof window !== "undefined" && typeof window.matchMedia === "function"`; default `isPortrait = false`.
  - Use `addEventListener("change", …)` on the `MediaQueryList` (same pattern as `useDesktopViewport` at `src/client.tsx:19-20`).
  - Foldables fire both `screen.orientation` `change` and `matchMedia` `change` on unfold; `matchMedia` debounces correctly.

Initialize `isPortrait` synchronously in `useState(() => mq.matches)` — first
render *is* the post-mount render in this SPA, and a two-pass pattern would
briefly mount `PharosVilleDesktopData` (and trigger its lazy chunk + Tanstack
queries) on portrait phones.

## 2. RotateToLandscape component

New file `src/rotate-to-landscape.tsx`. Don't overload `DesktopOnlyFallback` —
the two states are semantically different ("device too small" vs. "device fine,
just rotate"), and conflating them muddies copy and breaks `aria-live`
distinguishability.

Reuse the existing `pharosville-narrow` BEM family
(`src/pharosville.css:182-294`) — same parchment/timber/brass tokens.

Keep the analytics escape-hatch nav (PSI / Stablecoins / Chains / Depegs /
Cemetery). Hoist `FALLBACK_LINKS` into `src/fallback-links.ts` so both
components import it (avoids drift if URLs change).

```tsx
// src/rotate-to-landscape.tsx
import { FALLBACK_LINKS } from "./fallback-links";

export function RotateToLandscape() {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-rotate-title">
      <div className="pharosville-narrow__inner">
        <div className="pharosville-narrow__beacon" aria-hidden="true" />
        <p className="pharosville-narrow__kicker">Desktop map</p>
        <h2 id="pharosville-rotate-title">Turn the harbor sideways.</h2>
        <p>
          PharosVille is a desktop-only map. Your device is wide enough — rotate it to
          landscape (or widen this window) to chart the market winds.
        </p>
        <nav className="pharosville-narrow__links" aria-label="Pharos analytics">
          {FALLBACK_LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </div>
    </section>
  );
}
```

The "or widen this window" phrasing is load-bearing for the desktop-narrow-tall-window
case — keep it.

## 3. Gating wire-up in `PharosVilleClient`

```tsx
export function PharosVilleClient() {
  const canFit = useScreenCapability();   // from option 1
  const isPortrait = useIsPortrait();      // new

  if (!canFit) return <DesktopOnlyFallback />;
  if (isPortrait) return <RotateToLandscape />;

  return (
    <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
```

## 4. CSS

Pure conditional rendering — no new class on `<html>`. By the time orientation
is known, React is mounted. Adding a class duplicates truth that lives in
`useIsPortrait()`. No existing `(orientation: …)` queries to consolidate.

## 5. Edge cases

- **Foldables** — fold/unfold fires both `screen.orientation` `change` and
  `matchMedia` `change`. With option 1 also re-checking `screen.width/height`,
  transitions narrow → rotate → desktop cleanly.
- **Desktop, narrow-tall window** — `screen` passes, `matchMedia` says
  portrait → user gets rotate prompt. The "or widen" copy covers this.
- **iPad Safari "Request Desktop Site"** — reports desktop UA but
  `screen.width/height` still match the device; option 3 correctly prompts
  landscape on a portrait-held iPad mini.
- **No `screen.orientation` API** — don't depend on it. `matchMedia('(orientation: portrait)')` is in CSS Media Queries 4 and ships everywhere we target.
- **StrictMode** — `useState` lazy initializer reads `matchMedia(...).matches`
  once per render; the subscribe-effect is idempotent. Fine.

## 6. Test plan

**Unit** — extract `observeOrientation(cb, matchMedia?)` into
`src/systems/orientation.ts` and mirror `src/systems/reduced-motion.test.ts`
exactly. ~25 lines, node env (no jsdom). Asserts: initial `cb(false)`, change
to `true`, dispose unsubscribes.

**Playwright** — add one spec to `tests/visual/pharosville.spec.ts`:
- Mock screen to a tablet size (≥ 1000×640), set portrait viewport, navigate,
  expect "Turn the harbor sideways." visible.
- Resize to landscape viewport, expect canvas (`pharosville-canvas` testid) or
  loading spinner.
- Skip a screenshot baseline for now to avoid flake — visual regression risk
  is low (reuses existing `pharosville-narrow` styles).

**Don't add** a vitest+jsdom test for `PharosVilleClient` — would require
mocking both hooks, `lazy()`, and `Suspense`. Hook-unit + Playwright pair
gives enough confidence.

## Implementation step sequence

1. Extract `FALLBACK_LINKS` into `src/fallback-links.ts`; update `src/desktop-only-fallback.tsx`.
2. Add `src/systems/orientation.ts` with `observeOrientation(cb, matchMedia?)`.
3. Add `src/systems/orientation.test.ts` mirroring `reduced-motion.test.ts`.
4. Add `useIsPortrait()` to `src/client.tsx`, synchronous initial value from `matchMedia(...).matches`.
5. Add `src/rotate-to-landscape.tsx`.
6. Wire up `PharosVilleClient` per §3.
7. Add Playwright spec for portrait + rotate prompt.
8. Run `npm run test` and the visual suite.

## Pre-existing inconsistency to flag (not part of option 3)

`vite.config.ts:11` declares
`pharosVilleDesktopQuery = "(min-width: 1280px) and (min-height: 760px)"` for
the build-time desktop-chunk modulepreload — stricter than the 1000×640 gate.
Means many devices that pass the gate won't get the chunk preloaded (just
lazy-loads on demand, so not broken — only slightly suboptimal). Worth
revisiting when option 1 lands.

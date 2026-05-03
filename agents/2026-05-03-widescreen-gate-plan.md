# Wide-Screen Gate Plan — Drop the desktop gate to ≥1000 px

Author: SonnetPusher (Opus 4.7)
Date: 2026-05-03
Scope: PharosVille standalone (`/`)

## Problem

Two issues observed when the user opened PharosVille in a Chrome window of
~1268 px width:

1. **The desktop fallback rendered as near-invisible black-on-near-black.**
   The screenshot at `outputs/widescreen-fix/` shows the design intent (parchment
   panel, brass beacon, dark-brown title, brass-button links) is hidden by a
   dark blue body background.
2. **The gate at `min-width: 1280px and min-height: 760px` is too aggressive.**
   Common laptop widths and any windowed Chrome below 1280 fall into the
   fallback even though the canvas could comfortably render.

## Root cause for the visual regression

`src/pharosville.css` defined the chrome design tokens
(`--pv-parchment-*`, `--pv-timber-*`, `--pv-brass-*`, `--pv-ink-*`,
`--pv-seal-red*`) inside the `.pharosville-shell {}` block (lines 273–309 in
the pre-fix file). Three rule sets that render *outside* the shell —
`.pharosville-loading`, `.pharosville-query-error`, and `.pharosville-narrow`
plus its `__inner`, `__beacon`, `__kicker`, `h2`, `p`, `__links` rules — all
reference those tokens via `var(--pv-…)`. Since the shell is never mounted on
narrow viewports (or pre-React-mount), each `var(...)` resolved to its
default (transparent / `currentColor`) on top of the `body { background:
#050d13 }` body, producing the black panel and barely-visible black text.

The committed visual baseline
`tests/visual/pharosville.spec.ts-snapshots/pharosville-narrow-fallback-linux.png`
also captures the regressed state, so the test inadvertently locked the bug
in. When the chrome tokens were originally written they sat at the top of
the file; they were folded into `.pharosville-shell` at some later point. The
hoist back to `:root` is a one-rule fix.

## Fix already applied in this session (commit-ready)

`src/pharosville.css`

- Added a `:root {}` block right after the `body` rule containing the 17
  chrome tokens (`--pv-timber-*` ×4, `--pv-brass-*` ×5, `--pv-parchment-*` ×3,
  `--pv-ink-text`, `--pv-ink-soft`, `--pv-seal-red`, `--pv-seal-red-dark`).
- Removed the same 17 declarations from `.pharosville-shell` so the tokens
  have a single source of truth. The runtime-only tokens (`--pv-ink`,
  `--pv-panel*`, `--pv-gold*`, `--pv-parchment` (single), `--pv-muted`,
  `--pv-border*`, `--pv-ruby`, `--pv-teal`, `--pv-copper`, `--pv-shadow`,
  `--pv-control*`, `--pv-chart-line`) stay scoped to the shell.
- Verified the fix in Playwright at 1268×700 — `.pharosville-narrow` now
  renders the parchment panel, brass beacon, dark-brown title, and brass
  buttons exactly as designed (see
  `outputs/widescreen-fix/fallback-after-css-hoist-1268.png`).

The fix is independent of the gate change below — it can ship today as a
standalone bug fix.

## Proposal: drop the desktop gate from 1280×760 to 1000×640

Why these numbers:

- The canvas hooks (`useCanvasResizeAndCamera`) and camera (`defaultCamera`)
  already scale to arbitrary viewport widths/heights. The map fits via
  `fitCameraToMap` with constant padding (`right: 128`, `bottom: 80`,
  `top/left: 0`); at 1000×640 it has `1000 − 128 = 872` px and `640 − 80 =
  560` px of usable framing area, which still satisfies the existing
  `defaultCamera` zoom math (camera.zoom expected ≈ 0.81 in
  `camera.test.ts`).
- The detail dock width is `min(390px, calc(100% − 520px))`. At 1000 px
  shell width, that resolves to `min(390, 480)` = 390 px, leaving 480 px+
  for the canvas and HUD chrome. At 999 px it drops to 389 px without
  layout breakage. We pick 1000 as the round, communicable threshold.
- Height 640 covers most laptop windows (1280×720 widescreen, 1366×768
  notebooks, 1280×800 MacBooks). Going lower starts to crowd the
  fullscreen/home buttons (each 56 px tall plus 30 px margin = 86 px top +
  86 px bottom = 172 px reserved chrome) on top of canvas.

Open questions for the operator:

- Confirm `1000×640` thresholds. If 700 height is preferred for the beta
  tag clearance, we'll use 700.
- Confirm we update the fallback copy to match (currently says "1280px wide
  and 760px tall").

## Implementation task list

The first task is the immediate bug fix already applied in this session.
The remaining tasks form one cohesive change set behind the new gate.

### Group A — Ship the visual fix (already implemented in this session)

1. **Hoist chrome tokens to `:root`.**
   `src/pharosville.css`. Done in this session.
2. **Regenerate the narrow-fallback visual baseline.**
   `tests/visual/pharosville.spec.ts-snapshots/pharosville-narrow-fallback-linux.png`
   (and the `-desktop-chromium-` variant if present). Run
   `npx playwright test tests/visual/pharosville.spec.ts --grep "narrow
   fallback" --update-snapshots`, then review the new PNG before
   committing. This must ship with the CSS fix.
3. **Visual sanity sweep.** Run the full `npm run test:visual` to confirm
   nothing else moved (e.g. `pharosville-loading` or
   `pharosville-query-error` should look the same, since the same tokens
   resolve to identical hex values — the difference is *whether* they
   resolve, not *to what*).

### Group B — Lower the desktop gate to 1000×640

4. **Update the runtime gate.** `src/client.tsx` —
   `DESKTOP_QUERY = "(min-width: 1000px) and (min-height: 640px)"`.
5. **Update the CSS gate twin.** `src/pharosville.css` — both
   `@media (max-width: 1279px), (max-height: 759px)` and
   `@media (min-width: 1280px) and (min-height: 760px)` blocks
   (lines 146 and 152) need to swap to `999`/`639` and `1000`/`640`.
6. **Update the fallback copy.**
   `src/desktop-only-fallback.tsx` line 17: change "at least 1280px wide
   and 760px tall" to "at least 1000px wide and 640px tall".
7. **Update the index preload media query.**
   `index.html` line 30: `media="(min-width: 1000px) and (min-height: 640px)"`.
8. **Detail-dock width audit at narrow widths.** Verify
   `--pv-detail-panel-width: min(390px, calc(100% − 520px))` reads well at
   1000 px, and consider lowering the 520 reservation if the HUD looks
   crowded. No code change expected; flag if needed.
9. **Camera default-zoom audit at 1000×640.** Run a one-off probe (e.g. a
   Vitest assertion or a manual screenshot at 1000×640) to confirm
   `defaultCamera` produces a non-empty visible map without dead margin
   beyond what the test currently asserts at 1280×760. The padding values
   (`right: 128`, `bottom: 80`) may want a soft scaling factor for
   sub-1280 widths so the right-side gutter doesn't dominate; flag if so.

### Group C — Test updates that pin the gate

10. **`src/renderer/viewport.test.ts`.** Add a parallel case at 1000×640
    so the bounds expansion logic stays covered at the new floor (keep the
    existing 1280×760 case).
11. **`src/systems/camera.test.ts`.** Add `{ x: 1000, y: 640 }` to the
    viewport iteration in the framing test (`frames the authored island
    mass…`). Verify the existing assertions about
    `camera.zoom ≈ 0.8136` and the relative-center bands still hold; if
    not, widen the bands or split into per-viewport expectations.
12. **`src/renderer/layers/entity-pass.test.ts`,
    `src/renderer/hit-testing.test.ts`,
    `src/renderer/layers/ships.test.ts`.** These pin
    1280×760 only as a representative viewport, not as a gate boundary.
    Leave them at 1280×760 unless a bug surfaces; their assertions are
    independent of the gate threshold.

### Group D — Playwright spec updates

13. **`tests/visual/pharosville.spec.ts`** changes:
    - `pharosville narrow fallback avoids world runtime requests`: switch
      the viewport from `1279×900` to `999×900`.
    - `pharosville short desktop fallback avoids clipped map`: switch from
      `1280×720` to `1000×639`.
    - `pharosville desktop gate includes threshold viewport and excludes
      edge-below viewports`: switch
      threshold pass to `1000×640`, edge-below to `999×640` and `1000×639`.
    - `pharosville resizing below desktop gate unmounts world runtime…`:
      switch the resize-down viewport from `1279×759` to `999×639`.
    - `pharosville canvas interactions update details and camera`: the
      down-resize at the end currently goes to `1280×760`. Decide whether
      to keep that to test resize stability or change to `1000×640`.
    - The ultrawide DPR test at `2560×1440` is unaffected.
14. **Refresh visual baselines impacted by the new minimum.** Re-run
    `npm run test:visual --update-snapshots` for the narrow-fallback case
    (already done in Group A) and any widescreen tests where the layout
    proportions changed, if any. Most baselines render at fixed
    `1440×1000` and are unaffected.

### Group E — Documentation updates

15. Update every `1280` / `760` reference in:
    - `docs/pharosville-page.md` (lines 34, 141, 142, 173)
    - `docs/pharosville/CURRENT.md` (line 146)
    - `docs/pharosville/AGENT_ONBOARDING.md` (line 55)
    - `docs/pharosville/KNOWN_PITFALLS.md` (line 27)
    - `docs/pharosville/TESTING.md` (lines 82, 148)
    - `docs/pharosville/VISUAL_REVIEW_ATLAS.md` (lines 41–42, 67)
    - `docs/pharosville/SCENARIO_CATALOG.md` (line 35)
    - `docs/pharosville/VISUAL_INVARIANTS.md` (line 9)
    - `docs/pharosville/README.md` (line 42)

   to `1000`/`640`. Keep the wording about the world being
   desktop-only — only the threshold changes.

### Group F — Validation

16. `npm run typecheck` — fast.
17. `npm test` — Vitest, will surface the camera/viewport test changes in
    Group C.
18. `npm run test:visual` — Playwright, will surface any baseline drift.
19. `npm run validate:docs` — catches missed `1280`/`760` mentions.
20. `npm run smoke:dev-proxy` and `npm run smoke:api-local` — unchanged
    behavior expected.
21. `npm run build` — confirms the production bundle still ships.

## Risk and rollback

- **Risk: detail dock crowds canvas at 1000 px.** Mitigation: tune
  `--pv-detail-panel-width` reservation only if the audit in step 8 flags
  it. The current `min(390, 100% − 520)` formula already handles this
  gracefully.
- **Risk: world rendering looks empty at 1000×640 because of generous
  camera padding.** Mitigation: Group B step 9 — adjust
  `cameraPadding` defaults if the gutter dominates at narrow widths.
  Worst case, scale `right` from 128 down to ~64 for widths < 1200.
- **Rollback:** the gate change is a single constant + matching CSS query +
  doc updates. Reverting Group B–E restores the 1280×760 contract without
  touching Group A.

## Out of scope

- True mobile/tablet support (touch toolbar, responsive canvas pan/zoom,
  small-screen detail drawer). Still explicitly out of scope per
  `docs/pharosville-page.md`.
- Adjusting world map dimensions or default zoom math beyond the audit in
  step 9.
- Changing the chrome design tokens themselves.

# PharosVille Review Execution Status

Date: 2026-06-14

Scope: execution tracker for the 2026-06-14 PharosVille repository review
plan supplied to the agent.

## Summary

- Review rows handled: 42 / 42
- Source fixes committed: yes
- Documentation/process closures committed: yes
- Remaining open rows from the review: 0

The `capture-frame.ts` helper was an untracked orphan at startup and was
deleted rather than wired. Because it was never tracked by git, there is no
deletion entry in the commit history.

## Commit Batches

| Commit | Scope |
|---|---|
| `c02952a` | Desktop chunk modulepreload, bundle budgets, viewport/deploy guard coverage, release-readiness docs wording. |
| `f7b75bf` | Dialog focus management, live refresh announcements, controls cheatsheet wiring, orphan component/dead module cleanup. |
| `c9f5d5f` | RAF early-return rescheduling, single-frame sea-state threading, hover preservation, renderer cache cleanup. |
| `3f20dfb` | Static security-header parser/wiring, CSP host tightening, Permissions-Policy expansion, URL scheme validation, ESLint config rename, dependency pinning. |
| `d2f70c9` | Data/detail correctness: placed-ship DEWS counts, generated-at unknowns, depeg/percentage formatting, dock fallback rows, rank tempo buckets, consort stale evidence. |
| `d569bb8` | Production pass-timing instrumentation gated behind visual-debug allowance. |
| `d07f5af` | Consort high-gain samples collapse back to waterborne flagship tiles. |
| `f4b4209` | Queued screen-reader announcements to avoid live-region clobber. |
| `d18f81a` | Reduced-motion route bucket advances via deterministic timer and one-shot repaint. |
| `78334d4` | Shared clamp/lerp helper consolidation. |

## Row Closure

| # | Finding | Closure |
|---:|---|---|
| 1 | `detail-panel-not-a-dialog` | `DetailPanel` now has dialog semantics, modal state, focus trap, and restore tests. |
| 2 | `capture-frame-untracked-orphan` | Untracked orphan removed after finish-vs-delete decision. |
| 3 | `viewport-gate-missing-from-ci` | `check:viewport-gate` runs in CI guards and deploy gate. |
| 4 | `dead-desktop-modulepreload` | Vite preload plugin matches the dynamic chunk by name and asserts targets. |
| 5 | `aggregate-budget-headroom` | Added `pharosville-world-*` budget and deliberate aggregate headroom. |
| 6 | `raf-loop-stall-early-return` | Animated early returns reschedule RAF; regressions added. |
| 7 | `seastate-recomputed-per-layer` | Render loop computes sea state once and passes it through draw inputs. |
| 8 | `headers-not-validated-pre-deploy` | Static `_headers` validation is wired into docs/deploy/CI guards. |
| 9 | `no-live-announce-on-data-refresh` | Generated-at and freshness changes announce through the live region. |
| 10 | `viewport-gate-no-self-test` | Guard parser fixture tests added. |
| 11 | `release-readiness-not-gated` | Docs now mark the heavy live/browser checklist as manual, not CI-required. |
| 12 | `dialogs-no-focus-management` | Legend and changelog dialogs now manage focus and trap Tab. |
| 13 | `dews-band-counts-vs-placement-divergence` | Area counts derive from final placed ships. |
| 14 | `controls-cheatsheet-dead` | Controls cheatsheet is mounted inside Legend. |
| 15 | `since-last-visit-not-announced` | Banner is a polite status live region. |
| 16 | `depeg-history-above-peg-suppressed` | Depeg severity uses absolute worst deviation. |
| 17 | `change-pct-negative-zero` | Percent formatters normalize rounded negative zero. |
| 18 | `dock-fallback-share-zero-total` | Zero-dollar fallback dock members are suppressed. |
| 19 | `hit-target-null-rebuild-loses-hover` | Initial snapshot rebuild now passes `hoveredDetailId`. |
| 20 | `orphaned-component-files` | Dead UI files and CSS removed. |
| 21 | `dead-cron-intervals-module` | Dead wrapper module removed. |
| 22 | `eslint-config-module-typeless-warning` | ESLint config renamed to `.mjs`; lint warning gone. |
| 23 | `lighthouse-score-float-display` | Score fact uses `formatPsiNumber`. |
| 24 | `deprecated-unused-type-alias` | Unused alias removed. |
| 25 | `empty-vendor-zod-chunk` | Empty manual zod chunk rule removed. |
| 26 | `capture-frame-orphan-clipboard-no-gesture` | Closed with capture-frame orphan deletion. |
| 27 | `permissions-policy-omits-features` | Static and API policies deny the additional sensitive features. |
| 28 | `shared-live-region-clobber` | Announcements are queued through the existing live region. |
| 29 | `quartile-tie-collapse` | Tempo quartiles use deterministic rank position. |
| 30 | `generatedat-fallback-zero-epoch` | Missing timestamps resolve to `null` and render as unknown. |
| 31 | `static-camera-key-cache-cross-instance` | Renderer cache reset clears camera key state on unmount. |
| 32 | `reduced-motion-bucket-flip-frozen` | Reduced-motion bucket flips use a deterministic timer plus one-shot repaint. |
| 33 | `duplicated-clamp-lerp-helpers` | Plain helpers consolidated to `motion-utils`. |
| 34 | `perpass-perfnow-in-prod` | Pass timings are collected only when visual debug is allowed. |
| 35 | `spa-csp-allows-gtm-while-ga-inactive` | Wildcards removed; exact-host policy documented as static `_headers` closure. |
| 36 | `grave-sourceurl-unvalidated-scheme` | Shared schema and detail rendering require/filter HTTP(S). |
| 37 | `consort-stale-evidence-leak` | Consort stale evidence includes stricter own-risk stale evidence. |
| 38 | `frame-pacing-windows-survive-resize` | Frame pacing state resets on canvas resize. |
| 39 | `deps-caret-ranges-supply-chain` | Direct dependency ranges pinned to lockfile versions. |
| 40 | `consort-tile-validation-todo` | High-gain consort offsets collapse back to waterborne flagship tiles. |
| 41 | `validate-deploy-gate-claims-exact-mirror` | Operations wording no longer claims an exact CI mirror. |
| 42 | `module-cache-not-released-on-unmount` | Renderer caches are released from render-loop unmount cleanup. |

## Validation Notes

Focused validation was run per commit batch. Final broad validation was
performed after all source commits:

- `npm run validate:docs`
- `npm run typecheck`
- `npm run lint`
- `npm test -- src`
- `npm run build`
- `npm run check:bundle-size`

Environment caveat: local onboarding reports Node `v26.1.0`; the repository
expects Node 24.

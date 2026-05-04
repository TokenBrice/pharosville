---
name: PharosVille Health Checkup — Implementation Plan
date: 2026-05-04
sources:
  - 01-performance.md (11 findings)
  - 02-mobile-accessibility.md (10 findings)
  - 03-load-bundle.md (12 findings)
  - 04-maintainability.md (14 findings)
  - 05-documentation.md (10 findings)
---

# PharosVille Health Checkup — Implementation Plan

Synthesises 57 findings across 5 audit dimensions into a prioritised, scope-bounded
work plan. **Scope filter applied per request:** low/mid effort × low/mid/high reward.
High-effort items are listed in **§ Deferred** with notes, but not in the active plan.

## Top-line health snapshot

| Dimension       | State           | Headline                                                   |
| --------------- | --------------- | ---------------------------------------------------------- |
| Performance     | Solid           | Adaptive DPR, LOD, frame caches in place. Per-tile allocations + hit-test redundancy are the remaining hot spots. |
| Mobile / a11y   | Sound base      | Desktop gate + sr-ledger + reduced-motion are working. Detail-panel focus + WCAG contrast are the gaps. |
| Load / bundle   | Lean JS, fat assets | 7 KB entry, 922 KB lazy desktop chunk (259 KB gz). 6.6 MB of PNGs is the real load problem. |
| Maintainability | Concentrated risk | Strict TS, clean systems/renderer split. Concentration in `ships.ts` (1988 LOC) + no ESLint = drift risk. |
| Documentation   | Comprehensive   | 17 docs, validator enforces paths/scripts. Subsystem docs + JSDoc + arch diagram are missing. |

---

## Wave 1 — Quick wins (low effort, mid+ reward)

Ship these first. Each is < 2 hours and unblocks something measurable.

| # | Title                                                       | Effort | Reward | Source            |
| - | ----------------------------------------------------------- | ------ | ------ | ----------------- |
| 1 | Fix detail-panel WCAG AA contrast (`--pv-muted`)            | low    | high   | mobile F4         |
| 2 | Add `min-height/min-width: 44px` to detail-panel close btn  | low    | mid    | mobile F6         |
| 3 | Compress `og-card.png` (156 KB → ~50 KB)                    | low    | mid    | bundle F2         |
| 4 | Add `Cache-Control: immutable` to `_headers` for hashed assets | low | mid    | bundle F4         |
| 5 | Path2D-cache water-tile overlay strokes in `terrain.ts`     | low    | mid    | perf F2           |
| 6 | Extract gate thresholds to shared constant (preload sync) [done — a7-viewport-gate] | low    | mid    | mobile F3         |
| 7 | JSDoc `manifestCacheVersion` at the static-cache key site   | low    | mid    | doc F3            |
| 8 | Add "Plan Artifact Lifecycle" section to docs README        | low    | mid    | doc F6            |
| 9 | Extract `SHIP_SAIL_MARKS` + `TILE_COLORS` to a config module | low   | mid    | maint F5          |
| 10 | SVGO pass on `public/*.svg` (15 KB save, 10 min)           | low    | low    | bundle F10        |
| 11 | Minify `public/og-card.png` and add WebP variant            | low   | mid    | bundle F2 (alt)   |

## Wave 2 — Focus & accessibility hardening (mid effort, mid+ reward)

Targets the largest UX gap surfaced by the audit (a11y).

| # | Title                                                       | Effort | Reward | Source            |
| - | ----------------------------------------------------------- | ------ | ------ | ----------------- |
| 12 | Implement focus management on `detail-panel.tsx`            | mid    | high   | mobile F2         |
| 13 | Consolidate aria-live announcements (remove panel race)     | mid    | mid    | mobile F1         |
| 14 | Add Playwright pinch-zoom test in a11y suite                | mid    | mid    | mobile F8         |
| 15 | Extend `check-pharosville-colors.mjs` with WCAG contrast    | mid    | mid    | mobile F4 (sustain) |
| 16 | Remove dead toolbar ledger-toggle code in `world-toolbar.tsx` | low  | low    | mobile F9         |

## Wave 3 — Renderer hot-path optimisations (low/mid effort, mid reward)

Each is independently shippable; no architectural change required.

| # | Title                                                       | Effort | Reward | Source            | Status |
| - | ----------------------------------------------------------- | ------ | ------ | ----------------- | ------ |
| 17 | Camera-only fast path in `recomputeHitTargetsForCameraOnly` | mid    | mid    | perf F4           | done — owner: a3-hit-testing |
| 18 | Defer Map clone in `updateHitTargetSnapshotShips` (CoW)     | mid    | mid    | perf F5           | done — owner: a3-hit-testing |
| 19 | Cache beam-caustic gradient (LRU expansion)                 | low    | low    | perf F7           |        |
| 20 | Memoize `PharosVilleDesktopData` (skip identity re-render)  | low    | low    | perf F6           |
| 21 | Cache `theme` once per tile-kind in water dispatch          | low    | low    | perf F3           |
| 22 | Last-index hint for `waterPathSegmentIndex` binary search   | mid    | low    | perf F10          |
| 23 | Skip normalize when only position is needed in water path   | low    | low    | perf F1           |

## Wave 4 — Code health & guardrails (mid effort, mid reward)

Foundational; pays off across every subsequent change.

| # | Title                                                       | Effort | Reward | Source            |
| - | ----------------------------------------------------------- | ------ | ------ | ----------------- |
| 24 | Wire ESLint with `@typescript-eslint` preset                | mid    | mid    | maint F4          |
| 25 | Add `no-restricted-imports` rule to enforce `shared/` boundary | low | mid    | maint F10         |
| 26 | Add `: void` return types to all exported `draw*` functions | low    | low    | maint F2          |
| 27 | Audit + document hook memoization conventions               | mid    | mid    | maint F8          |
| 28 | Reorganise renderer-layer exports (config vs. function)     | mid    | mid    | maint F3          |
| 29 | Expand `__test-utils__/` with canvas-context-builder        | low    | mid    | maint F6          |
| 30 | Centralise visual scales in `src/renderer/visual-scales.ts` | low    | low    | maint F13         |

## Wave 5 — Documentation completeness (low/mid effort, mid+ reward)

| # | Title                                                       | Effort | Reward | Source            |
| - | ----------------------------------------------------------- | ------ | ------ | ----------------- |
| 31 | Add header docblocks to `maker-squad.ts`, `seawall.ts`, `unique-ships.ts` | mid | high | doc F2 |
| 32 | JSDoc public exports of `world-layout.ts`, `world-canvas.ts` | mid   | mid    | doc F1            |
| 33 | Lightweight `ARCHITECTURE.md` (text + ASCII; not full diagram) | low | mid    | maint F14 / doc F5 (light) |
| 34 | "What is PharosVille?" lead paragraph in repo README        | low    | low    | doc F9            |
| 35 | Reverse-link AGENTS.md from AGENT_ONBOARDING.md             | low    | low    | doc F4            |
| 36 | Intent comment on `CLAUDE.md` minimalism                    | low    | low    | doc F10           |

## Wave 6 — Backlog polish (low effort, low reward)

Pick up opportunistically when touching the area.

- Defer GA install to `requestIdleCallback` (bundle F5)
- Lucide-react manual chunk if icon use diverges (bundle F12)
- `routeSamplingRuntimeCache` WeakMap → keyed Map (perf F9)
- Batch `useLatestRef` updates into single effect (perf F11)
- Error reporter: category field + backoff (maint F9)
- World-builder fixture DSL (maint F11)
- Asset miss telemetry counter (maint F12)
- Doc-staleness lint in `check-doc-paths-and-scripts.mjs` (doc F8)

---

## Deferred — high effort (out of requested scope)

These were surfaced by audits but excluded by the effort filter. Each warrants its
own plan artifact when prioritised.

| Item                                                          | Effort | Reward | Note |
| ------------------------------------------------------------- | ------ | ------ | ---- |
| WebP/AVIF format negotiation for all PNGs (~3-4 MB savings)   | high   | high   | Biggest single load win available; requires `<picture>` or content-negotiation pipeline. **Strong candidate for next sprint.** |
| Sprite-atlasing of 82 pharosville PNGs                        | high   | mid    | Saves 150-200 KB + eliminates 80 HTTP requests; requires renderer UV remapping. |
| Split `ships.ts` (1988 LOC) into livery / wake / LOD modules  | high   | high   | Every ship feature touches this file today; refactor pays compounding interest. |
| Full SVG/Mermaid `ARCHITECTURE.md` with diagrams              | high   | high   | Wave 5 #33 ships the text version; this is the upgrade. |
| Canvas keyboard entity-cycling (Tab/Shift+Tab through hits)   | high   | mid    | Closes the screen-reader interactivity gap. |
| `prefers-color-scheme: light` palette                         | high   | low    | Design-intent decision needed first. |
| `CONTRIBUTING.md` + `SECURITY.md`                             | high   | low    | Only valuable if external collaboration scope grows. |
| Path2D templates for ship shadows / foam / mooring            | mid-high | low  | Marginal; revisit if profiling flags it. |

---

## Suggested execution order

1. **Wave 1** in a single PR — 11 changes, mostly independent, no behavioural risk.
2. **Wave 2 #12 + #13** as one a11y PR (focus + announcements ship together).
3. **Wave 4 #24 + #25 + #26** as the "lint hardening" PR — must precede Wave 4 #28 to keep diffs clean.
4. **Wave 3** items spread across motion/renderer follow-up PRs — touch only when nearby work is happening.
5. **Wave 5 docs** in a single sweep PR after the maintainability changes settle, so cited line numbers are stable.

## Validation gates

Each PR must pass `npm run validate` (typecheck + tests + asset/colour guards + bundle budget).
Visual changes additionally require `npm run test:visual` and approved snapshot diffs.
A11y-touching PRs require `npm run test:visual:accessibility` and `npm run test:visual:cross-browser`.

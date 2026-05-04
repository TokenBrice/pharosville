---
name: PharosVille Health Checkup — Follow-up Implementation Plan
date: 2026-05-04
parent_plan: ../health-checkup-2026-05-04/00-implementation-plan.md
shipped_pr_range: 42c300e..a885c56 (12 commits, deployed)
---

# PharosVille Health Checkup — Follow-up Plan

The first pass shipped 33 of 35 audit-driven changes (Optimizantus
swarm, deployed in run 25320127737). This plan is the *carry-over*: items
explicitly deferred by the original effort/reward filter, items
closed-with-reason that warrant a re-look, and new findings discovered
during execution.

## What carries over from the original pass

### Closed-with-reason — re-evaluate
- **Memoize `PharosVilleDesktopData`** (perf F6) — needs test-infra rewrite to use a `useSyncExternalStore`-based mock notifier. The optimisation itself is sound; the test harness is the blocker.

### Wave 6 backlog (low effort, low reward)
The original plan parked these as "pick up opportunistically":
- Defer GA install to `requestIdleCallback` (bundle F5)
- `lucide-react` manual chunk if icon use diverges (bundle F12)
- `routeSamplingRuntimeCache` WeakMap → keyed Map (perf F9)
- Batch `useLatestRef` updates into a single effect (perf F11)
- Error reporter: category field + exponential backoff (maint F9)
- Asset miss telemetry counter on `PharosVilleRenderMetrics` (maint F12)
- World-builder fixture DSL (maint F11)
- Doc-staleness lint in `check-doc-paths-and-scripts.mjs` (doc F8)

### Deferred — high effort
- **WebP/AVIF format negotiation** for ~6.6 MB of PNGs (~3-4 MB savings, biggest single load win)
- **Sprite-atlasing of 82 pharosville PNGs** (~150-200 KB + 80 HTTP requests eliminated)
- **Split `ships.ts`** into livery / wake / LOD modules (Round 2 already cut 1988→1793 LOC; further split unlocks every ship feature change)
- **Full SVG/Mermaid `ARCHITECTURE.md`** (the text-only version shipped this pass)
- **Canvas keyboard entity-cycling** (Tab/Shift+Tab through hits → close the screen-reader interactivity gap)
- **`prefers-color-scheme: light` palette** — design-intent decision needed first
- **`CONTRIBUTING.md` + `SECURITY.md`** — only valuable if external collaboration scope grows
- **Path2D templates for ship shadows / foam / mooring** — marginal; revisit only if profiling flags it

## What this pass discovered

### HOOKS.md audit — 5 ranked findings written but not fixed
A15 wrote `docs/pharosville/HOOKS.md` documenting the conventions plus
five concrete hook-correctness/perf findings with file:line.

- **F1 (P1)** — refs assigned during render in `pharosville-world.tsx:121-157` (rules-of-hooks purity violation; fragile under concurrent rendering).
- **F2 (P2)** — `useWorldRenderLoop` RAF effect silently captures `onBucketFlip` via `eslint-disable exhaustive-deps`; depends on caller-side stability.
- **F3 (P2)** — debug-telemetry `useEffect` dep list churns on every interaction; cleanup runs even when the body short-circuits.
- **F4 (P3)** — over-callback noise in `use-canvas-resize-and-camera.ts` (ref objects in dep arrays).
- **F5 (P3)** — `usePharosVilleWorldData` 14-item `useMemo` dep array; should reduce to a single content signature.

### ESLint warnings — 43 warnings under a 50 budget
ESLint shipped this pass at `0 errors / 43 warnings`, deliberately
gated at `--max-warnings=50`. Top rule offenders:
- `react-hooks/refs` — 21 (overlaps with HOOKS.md F1)
- `@typescript-eslint/no-unused-vars` — 10
- `react-hooks/exhaustive-deps` — 4 (overlaps with F2 + F4)
- single-instance: `no-useless-escape`, `no-control-regex`, `no-useless-assignment`, `preserve-caught-error`, `no-empty-object-type`, `react-hooks/set-state-in-effect`

Lint was intentionally NOT added to `npm run validate` until cleanup.

### CI vs local rasteriser variance
The mid-dusk visual snapshot diverges between local (Arch + chromium 1217) and CI (`mcr.microsoft.com/playwright:v1.59.1-noble` on GitHub `ubuntu-latest`) by ~1% of pixels on the lighthouse-hill + cemetery-islet sprites — even though local-vs-Docker-container produced identical pixels. We band-aided with `maxDiffPixelRatio: 0.012` for that one test; root cause unidentified.

### Asset budget warning
`landmark.yggdrasil` is 256×320 at displayScale 0.6 — `check:pharosville-assets` warns "consider trimmed/downscaled source art". Not blocking, but on the watch list.

### Dead CSS tokens
A1's `--pv-muted` contrast bump (0.72 → 0.92) was defensive — the token is currently unused (the detail panel uses `--pv-ink-text/-soft` on parchment). Several other `--pv-*` tokens may also be dead. Sweep would simplify the palette.

### Cosmetic — pre-existing duplicated comment
`src/systems/maker-squad.ts` had a duplicated `// risk placement and motion route; consorts` line in the comment block that I worked around in Round 1 by adding a `/** */` header above it. The duplicate is still there; cleanup is one-line.

### Process — parallel-write race during agent swarm
4 `git reset` events during Round 1 wiped early agents' work and required manual re-application. Future swarms should use `npm run worktree:new` per agent or a write-mutex strategy.

---

## Wave plan

### Wave A — Quick wins (low effort, mid+ reward)
| # | Title | Effort | Reward | Source |
| - | - | - | - | - |
| 1 | Maker-squad.ts: drop duplicated comment line | low | low | discovered |
| 2 | Dead `--pv-*` CSS tokens sweep | low | low | discovered |
| 3 | Defer GA install to `requestIdleCallback` | low | low | bundle F5 |
| 4 | Batch `useLatestRef` updates into single effect | low | low | perf F11 |
| 5 | Error-reporter category field + backoff | low | low | maint F9 |
| 6 | `routeSamplingRuntimeCache` WeakMap → Map | low | low | perf F9 |
| 7 | Add doc-staleness warn to `check-doc-paths-and-scripts.mjs` | mid | low | doc F8 |
| 8 | `lucide-react` manual chunk if icon use diverges | low | low | bundle F12 |

### Wave B — Hook & lint hygiene (mid effort, mid reward)
| # | Title | Effort | Reward | Source |
| - | - | - | - | - |
| 9 | Fix render-side ref assignment in `pharosville-world.tsx:121-157` (HOOKS F1) | mid | mid | HOOKS F1 + react-hooks/refs (21 warnings) |
| 10 | Document `useWorldRenderLoop` RAF stability contract (HOOKS F2) | low | mid | HOOKS F2 |
| 11 | Stabilise debug-telemetry `useEffect` dep list (HOOKS F3) | mid | low | HOOKS F3 |
| 12 | Drop ref objects from `useCallback` deps in `use-canvas-resize-and-camera.ts` (HOOKS F4) | low | low | HOOKS F4 |
| 13 | Reduce `usePharosVilleWorldData` 14-dep memo to content signature (HOOKS F5) | mid | mid | HOOKS F5 |
| 14 | ESLint cleanup pass: drive remaining warnings to 0 | mid | mid | discovered (post-#9–#13) |
| 15 | Add `npm run lint` to `npm run validate` once at 0 warnings | low | mid | discovered |
| 16 | Upgrade ESLint to `recommended-type-checked` rules | mid | mid | maint F4 follow-up |

### Wave C — Test & telemetry investments (mid effort, mid reward)
| # | Title | Effort | Reward | Source |
| - | - | - | - | - |
| 17 | Memoize `PharosVilleDesktopData` (rewrite test infra with useSyncExternalStore mock) | mid | low | perf F6 (re-open) |
| 18 | World-builder fixture DSL | mid | low | maint F11 |
| 19 | Asset miss telemetry counter on `PharosVilleRenderMetrics` | mid | low | maint F12 |
| 20 | Investigate CI-vs-local rasteriser variance; remove dusk threshold band-aid | mid | low | discovered |

### Wave D — Asset & landmark polish (mid effort, low/mid reward)
| # | Title | Effort | Reward | Source |
| - | - | - | - | - |
| 21 | Trim/downscale `landmark.yggdrasil` source PNG | mid | low | check:pharosville-assets warning |

### Wave E — High-effort high-reward (each warrants its own plan artifact)
| # | Title | Effort | Reward | Source |
| - | - | - | - | - |
| 22 | WebP/AVIF format negotiation for `public/{logos,chains,pharosville}/*.png` (~3-4 MB saved) | high | high | bundle F1 |
| 23 | Split `ships.ts` (still 1793 LOC) into livery / wake / LOD modules | high | high | maint F1 |
| 24 | Sprite-atlasing for 82 `public/pharosville/assets/*.png` (~150-200 KB + 80 requests) | high | mid | bundle F3 |
| 25 | Canvas keyboard entity-cycling for screen-reader interactivity | high | mid | mobile F5 |
| 26 | Full SVG/Mermaid `ARCHITECTURE.md` upgrade | high | mid | maint F14 / doc F5 |

### Wave F — Process improvements (meta — not features)
| # | Title | Effort | Reward | Source |
| - | - | - | - | - |
| 27 | Document worktree-per-agent workflow for parallel swarms in AGENTS.md | low | mid | discovered (parallel-write race) |
| 28 | Document container-based snapshot regen workflow (`docker run` + `--update-snapshots`) | low | low | discovered (CI variance) |

### Backlog — only if scope changes
- `prefers-color-scheme: light` palette (high effort, low reward without design intent)
- `CONTRIBUTING.md` + `SECURITY.md` (only if external collaboration grows)
- Path2D templates for ship shadows / foam / mooring (only if profiling flags it)

---

## Suggested execution order

1. **Wave A (one PR)** — 8 micro-changes, mostly orthogonal, no behavioural risk.
2. **Wave B #9–#13 then #14 then #15** — fix hook-warning sources first, then run a sweep, then gate. Each closure mechanically reduces lint count.
3. **Wave C #20** before Wave A items that touch visuals; that band-aid is an open question that could affect any future visual change.
4. **Wave C #17** is its own PR (test-infra rewrite) — deferred from this pass with a clear handle.
5. **Wave E** items each become their own plan artifact in `agents/`. Don't bundle.

## Validation expectations

- Waves A-D should keep `npm run validate` + `npm run validate:release` green.
- Wave B #15 changes `npm run validate` (adds lint) — that's a one-time gate movement; expect cleanup PRs to chase it.
- Wave E items will likely require visual snapshot updates (asset format change, ships.ts split) — re-baseline in `mcr.microsoft.com/playwright:v1.59.1-noble` per the pinned workflow.
- Wave E #25 (canvas keyboard cycling) introduces a new accessibility test surface; extend `test:visual:accessibility` and the cross-browser variant.

## Out of scope

- Anything not surfaced by the original 5-dimension audit or by this pass's execution. New audits should use a fresh `agents/health-checkup-<DATE>/` folder, not append to this one.

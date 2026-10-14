# 02 - Prior attempts: what was tried, what is salvageable (2026-10-13)

Sources: `agents/pharosville-revamp/{02,03,08,10,11}`, `agents/2026-10-05-garden-levers/02-CP-Final-record.md`, `agents/2026-10-02-visual-upgrade/02-execution-record.md`, `git log` (941 commits on main, 2026-04-30 to 2026-10-13), `.worktrees/inlet` (`git log main..HEAD`), repo layout. Unmarked claims are cited in 03; `[INFERENCE]` marks judgment.

## 1. Timeline of art directions

1. **05-02 to 06-14, Canvas-2D "wow-revamp" (v0.1 to v0.2.2, ~446 May commits).** Pixel-sprite maritime map with timber/parchment/brass chrome and PixelLab sprites. Stalled at the 2D sprite ceiling, then 26 days of silence; replaced by the Three.js rebuild.
2. **07-26, Three.js "Lantern Sea" (v0.4 to v0.6.2).** Full renderer swap. Stalled: v0.6.0 retracted v0.4/0.5 excess the next day, and v0.6.1/2 restored logos the migration had lost.
3. **08-13, "Garden of Light" (v0.8.0).** Quiet, atmospheric, subtractive. The 09-02 plan's own verdict: "an infinite water shader with a rock in it, decorated with Japanese props".
4. **09-02, "Seven-Water Lighthouse Garden" (v0.9 to v0.13).** Finite plate, land rim, engawa, shore stations, East-Asian hull families. Structural, but craft complaints returned within days.
5. **09-05, "Epic Pharos / warm village" (v0.14.0).** Sailed-in zoom, always-on chips, fortified precinct. Reversed in 24 h by v0.14.1 "Room to Sail" because fleet legibility lost.
6. **09-07, "Golden Garden" (v0.15.0).** Honey key light over violet shadow. Later banned as an anti-target; neutral noon restored.
7. **09-08, "Reborn" (v0.17.0).** The "mother of all upgrade plans": low perspective camera, five-beat light score, garden director. Operator re-asked for a "massive leap" 18 days later.
8. **09-26, Opus swarm to "Hour-Print" (v0.19.0).** 30 docs and 9,922 lines of review, then a 72-ko maple calendar, heron, keeper, geese, meteor, sound. Widest scope yet and still unsatisfying.
9. **10-02, visual-upgrade micro-packets (v0.20.x).** A2, B1, P1, W1 rejected as "indistinguishable". Only the data-truth packets shipped.
10. **10-05, "Garden Observatory" (squash `3f4cdb1`, +30k/-10k lines).** Release blocked because the reading test and M5 calibration never ran. The operator then permitted replacing everything.
11. **10-08, "Tidal Observatory" (branch).** Five Blender GLB families, 16.9 MB. Parked at 572,150 triangles against a 500,000 cap, scheduler in recovery. Foreground stairs and distant cliffs were unfinished. Described as "promising early results".
12. **10-09, Blender tower on main (`d1bd2b0`).** Deleted a 1,537-line procedural generator for a 4.6 MB GLB. The operator is now hand-wiring a CC0 kit fetcher (uncommitted `fetch-kit.mjs`).
13. **10-13, "Pharos Inlet" (`feat/pharos-inlet`).** Fixed 16:9, Blender-baked plates plus slim Three.js, leaders and flotillas. Beauty scores in 11: pond plate 7, karesansui 6, inlet plate 5, runtime spikes 4-5, current main ~5, Tidal ~6, both nights ~3 (of 10). Operator now judges it uninteresting.

## 2. Root causes of being stuck (max 8)

1. **The taste loop never closed (process).** There was no recorded frame-level verdict between three escalating re-asks (09-08, 09-26, 10-08). The visual-upgrade record says "the operator delegated every art and reading decision to the orchestrator" (`2026-10-02-visual-upgrade/02-execution-record.md:3-6`). CP-Destination was run by the orchestrator, and the A-board says "No score or candidate acceptance is claimed".
2. **Targets were derived from the current frame (process).** The A-board is "annotations over observed baseline captures", and Macro B was never authored, so D1 was ratification, not choice. The only external target, the ImageGen/Cycles concept, produced the only positive operator signal. The approved concept image was lost when `outputs/` was wiped (08).
3. **Agents authored art in code (art).** Sprite bakes, procedural lighthouse, cloud pads and karikomi never reached the operator's bar. 03 and 08 conclude that procedural geometry has an aesthetic ceiling.
4. **The art was never composed as one picture (art).** 08 diagnoses a gap in "silhouette design, density at several scales, surface variation, contact, lighting and composition together", not in parameters. Hundreds of unequal-size sails plus 184 to 320 one-coin-one-ship hulls fight the "calm" brief.
5. **Inlet was mostly plumbing (process; see below).** 88 commits on `feat/pharos-inlet`. By prefix:
   - Provenance/docs (P): 15.
   - Tests and acceptance (T 8, Q 7): 15.
   - Integration and cutover (I): 10.
   - Data model (M 8, D 4): 12.
   - Asset-pipeline and runtime (assets 8, runtime 2): 10, partly art, partly hashing and receipts.
   - Renderer (R): 10.
   - UI and visual (StreamU): 13.

   Only about 23 of 88 (R plus StreamU, ~26%) are renderer or visual work, ~35% if all asset commits count as art. About 60% (P, T, Q, I, M, D) is plumbing, tests, provenance or contracts. Subjects confirm it: "document final night processing and canonical mask ownership", "reject startup context loss and no-op frame settlement", "account encoded HTTP bodies", "bind manual captures to explicit candidate preview URL". Against main it removes 160k lines and adds 25k (879 files), with ~7.3k lines added in tests, scripts and docs. The brief's "~50 commits" undercounts.
6. **Test and doc accretion taxed every visual change (process).** 03 counts tests+docs at ~181k added lines against ~180k for art. 02 counts 10.7k assertions pinning one composition, 8,141 decimal literals in `src/three`, and 93-94% of visual commits also touching tests. Also 42 commits that only rebake baselines and 75 docs-only commits. The Tidal pass touched 139 code files and still missed budget.
7. **Authored assets met no budget (tech).** 572k triangles against a 500k cap, ~80 MB texture residency, a 4.6 MB tower, and a 1,003 KB gzip JS payload behind a half-float MSAA/N8AO/bloom/god-ray post chain. Phone reach was never measured. The M5/phone calibration has been "pending hardware" since 10-05.
8. **Burst engagement produced re-charters, not verdicts (process).** 321 commits in May 1-3; 195 commits and twelve releases in Sept 2-10; silence between bursts (06-14 to 07-10, 08-13 to 09-02). Each burst opened a new plan instead of judging the last one: about 15 major plans, each superseded within days.

## 3. Salvage inventory

| Component | Path | Verdict | Why |
|---|---|---|---|
| Pages Function proxy | `functions/` (1,005 lines + 1,288 test; `index.ts`, `_shared.ts`, `_log.ts`, `api/`) | Keep as-is | Depends only on `shared`. Allowlist, edge cache, last-good, CSP, server-side `PHAROS_API_KEY`. Self-contained and security-critical. |
| Shared types and classification | `shared/types`, `shared/lib`, `shared/data` (8.3k lines, 1.3 MB JSON) | Keep (trim) | Runtime-neutral zod contracts. 202 of 642 exports are unused, vendored from the host repo. Recent edits are in the working tree (`chain-circulating.ts`, `market.ts`); do not clobber. |
| Data fetching, zod guard, TanStack | `src/lib/world-payload-guard.ts`, `src/hooks` data hooks (~2.2k lines), `pharosville-desktop-data.tsx` | Adapt | Renderer-free and proven by live outages. Operator has uncommitted guard edits. Split `pharosville-world.tsx` from evidence semantics first. |
| Semantic world model | ~8-9k lines of `src/systems` (`detail-model`, `source-evidence`, `lamp-status`, `ship-issuance`, `supply-tide`, `sea-state`) | Adapt | Data meaning is separable. Placement and tile stages (`ship-placement`, `dock-assignment`) and 74% of `systems` are plate-bound; discard. |
| Accessibility ledger and detail panels | `src/components/accessibility-ledger.tsx`, detail panel (~2.6k lines) | Keep / adapt | Touches no renderer except `harbor-label-chips.tsx`. DOM parity doubles as search and screen-reader truth. |
| Fixtures | `src/__fixtures__/data-contract-scenarios.ts`, `agents/2026-10-13-pharosville-reboot/prior-data/data/` | Keep as-is | Reusable scenarios (outage, null chain, unknown DEWS). |
| CI and security scripts | `scripts/check-*.mjs`, `check-committed-secrets`, `check-security-headers`, `check-release-credentials`, `.github/workflows/{codeql,canary-smoke,deploy-cloudflare}.yml` | Keep | Cheap, art-independent. Drop art-specific guards (`check-pharosville-colors`, `look-selection`, `generate-garden-*`). |
| Release workflow | `.github/workflows/release.yml`, `release-contract.mjs`, `docs/pharosville/RELEASES.md` | Keep, simplify | Required by repo rule (CLAUDE.md). Remove any coupling to garden baselines. |
| Blender tower | `assets/pharosville/blender/pharos-tower.blend`, `export-glb.py` | Adapt | Real authored lighthouse, but 87k tris / 4.6 MB. Needs an LOD and a rework to the new art direction. |
| Tidal kit | `feat/tidal-observatory` (5 GLB families, headland, causeway, flora, horizon) | Adapt, as reference | Scanned headland and flora are the best authored pieces. They are component libraries, not a scene (08). Mine for meshes and lessons; do not carry the 268k-triangle set whole. |
| CC0 kit | `assets/pharosville/kit/`, `scripts/pharosville/fetch-kit.mjs` (uncommitted) | Keep | Operator's own in-progress pipeline. |
| Ship/sail atlas, hull families | `generate-reading-atlas.mjs`, six East-Asian hull families, mon sails | Adapt (knowledge) | Hull-family knowledge and sail-area calibration are reusable. The atlas is tuned to the 140x140 plate and the sail "barcode" it produced. |
| Water shaders and normals | `generate-water-normals.mjs`, `src/three` water | Adapt (lessons) | Water-shader lessons transfer; code is bound to the plate and post chain. |
| Scheduler, visibility, context loss, DPR governor, hit-testing | `src/hooks/use-world-render-loop`, `render-surface-budget.ts`, `src/renderer` | Adapt (port patterns) | Mature and phone-aware; 02 recommends porting the patterns, not the files. |
| Inlet runtime pieces | `.worktrees/inlet/src/{world,world-model,ui}` | Adapt, selectively | Pure model, meshopt fleet loading, shared phone classifier. Its art is not carried. |
| Beauty plates, spikes, slice-a | `agents/pharosville-revamp/{beauty,spikes,slice-a}` | Discard as art, keep as measurements | Scored 4-7 of 10 and are never integrated. |
| Garden renderer | `src/three/**` (46k + 24k test lines), `src/systems` placement/motion/camera | Discard | Composition-pinned (688 exact-number assertions). |
| Tests | `src/**/*.test.*` (201 files), `tests/visual/` | Mixed | Keep data-truth, DOM parity, disposal, budget and security tests. Discard art-recipe, draw-count and pixel-baseline tests. |
| Docs | `docs/pharosville/` (4.5k lines) | Discard most | Keep `OPERATIONS`, `SECURITY_HEADERS`, `RELEASES`, `AGENT_ONBOARDING`. `VISUAL_INVARIANTS` and `CONTRACTS` encode the old composition. |

## 4. Anti-patterns to forbid next run

- **Orchestrator-as-operator.** Agent verdicts standing in for the operator's (`02-execution-record.md:3-6`; D3 override). Rule: no art accepted without a recorded prefer/reject from the operator on a real-GPU frame.
- **Destinations annotated over the current frame, or one-candidate elections** (A-board, "Macro B never authored"). Require at least 3 independently authored candidates.
- **Tests pinning art numbers** (42 island draws, named threshold meshes, 8,141 literals, pixel-MAE headlines, 688 exact-number assertions). Test semantics and budgets only.
- **Review swarms and plan-of-plans** (9,922-line Opus council, L01-L20 audits, 15 superseded programme plans). One short brief, then build.
- **Docs bloat.** 75 docs-only commits, 258 agent files committed, 4.5k lines of docs. Cap docs; do not write an invariant doc before the art is accepted.
- **Provenance and receipts before beauty.** Inlet spent 15 commits on `P:` docs and 8 on `T:`, while frame quality stayed at plate scores of 5/10. Do not build hashing, receipts or capture-binding until a frame passes.
- **Procedural hero props in TypeScript.** Use Blender.
- **New ritual/event systems before the base frame is accepted** (72-ko calendar, meteor, geese).
- **Judging look or speed through Playwright** (SwiftShader; hard rule). **Ephemeral evidence:** the approved concept was lost with `outputs/`; commit small stills under `agents/`.
- **Whole-tree rewrite with deletion of the old app before the replacement passes.** Inlet deleted 143k lines on the branch.

## 5. Genuinely required vs self-imposed constraints

**Genuinely required**
- `PHAROS_API_KEY` stays a server-side Pages secret; the browser calls same-origin `/api/*` only, through the allowlisted proxy with CSP and last-good caching.
- Versioned releases come only from `release.yml` after a green main deploy. This is an operator hard rule.
- Data truth and freshness: show stale, unknown and null states honestly (v0.18 to v0.20 fixes; the null-chain fix `b6588ae`). 421 of 625 assets lack local metadata, so disclose coverage.
- DOM parity for accessibility and search (every coin reachable). It carries real value, not only compliance.
- Working only inside the repo, plus the real-GPU rule: judge looks and speed through `npm run preview`, never Playwright.
- Canonical URL, Cloudflare Pages hosting, and no committing of `dist/`, secrets or scratch.

**Self-imposed (revisitable; brief already says earlier decisions are not binding)**
- Desktop gate. The CLAUDE.md rule says gate on size, never orientation. The 2026-10-13 decision "mobile required" is a product choice and drives the budget; flag whether the reboot truly needs live phone rendering.
- 500,000-triangle and 72-texture caps, and the 1,003 KB gzip budget. These are sound as discipline but were calibrated to procedural geometry.
- One-coin-one-ship (184 to 320 hulls). A deliberate operator policy, but it fights calm. The Inlet answer was leaders plus flotillas.
- Japanese-garden metaphor and its anti-targets (no honey grade, no mountains). Inherited from the 09-08 brief.
- Fixed 16:9 only, "no artist", 140x140 plate, the 19-clause invariant charter, the exact-literal test culture, and "ship every programme as a versioned release".

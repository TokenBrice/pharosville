# PharosVille Ultimate — autonomous execution runbook

Authority: the operator rulings of 2026-11-08 in `PLAN.md` §3. `PLAN.md` §5 defines what ships in each
version. The `round2/` specs give exact file anchors, copy and tests. This file says how to run it with no
operator in the loop. Read `AGENTS.md`/`CLAUDE.md` first; their hard rules are restated in §10 and always win.

## 1. Mandate

- **Ship four versions in order:** v1.5.0 True Bearing → v1.6.0 Clear Air → v1.7.0 Lamplighter → v1.8.0 Golden
  Hour.
- **One PR per version**, on `release/vX.Y.Z`, carrying all the work and its changelog, to minimise CI time.
  Agents merge it and let `release.yml` publish.
- **Fully autonomous.** No interim reports. One final report at the end (§9).
- **Decide, don't ask.** Make every judgment call yourself within the rulings and log it (§7). Stop only for
  a true operator-only blocker, and keep working on everything else meanwhile (§8).
- **Incidents are fixed forward**, never rolled back. Brief downtime is acceptable but should be avoided (§6).
- **Evidence is this machine only:** the RTX via `scripts/harbour/shot.mjs`, plus CPU throttling. Apple, iGPU
  and device rows are recorded as SKIP. Absolute weak-GPU numbers are estimates.

## 2. Roles, models and budget (per version: ≤ 30 Sol + ≤ 10 Opus agents)

| Role | Model | Owns | Notes |
|---|---|---|---|
| Orchestrator | Opus (main session) | schedule, worktrees, integration merges, gates, PR/merge/release, logs, final report | Edits shared files only between lane merges |
| R — renderer integrator | Sol xhigh, one per version | `ocean/ocean-material.ts`, `world/materials.ts`, `engine/post.ts`, `sky/*`, extracted shader modules | Serialises every patch to these files, including other lanes' requests |
| F — fleet engineer | Sol xhigh | `fleet/fleet-material.ts`, `fleet/*` render code | Print law, contact shadows, atlas work |
| Code lanes | Sol high (xhigh for B/G/H) | A truth, B perf, C resilience/QA, D experience (U = UI/CSS owner), G choreography, H enablers, I new readings | Codex `write: true`, `cwd` = the lane's worktree |
| A — Blender artist | Opus | `scripts/harbour/blender/**` sources and exports (D4) | Headless `blender -b` only; asset gates in §4 |
| S — sound | Opus for tuning (E31–E34), Sol for robustness (S21, C10) | `src/harbour/audio/**` | Offline mix report via the shared browser (E31) |
| AD — art director | Opus, one per visual version | sign-off on every visual change | Uses the O10 metrics + full-frame preference; logs to `exec/ART-LOG.md` |
| TR — truth reviewer | Sol high | review of every data-facing change | D11 checklist (§4); logs to `exec/TRUTH-LOG.md` |

**Concurrency**
- Run at most ~12 lanes at once, to limit integration churn.
- Brief Sol lanes with the matching `round2/` section, plus a ≤ 150-word report cap.
- Re-use `missions/OPUS-COMMON.md`'s capture rules for Opus lanes.

## 3. Branches, worktrees and integration

1. `git switch main && git pull`; create `release/vX.Y.Z` from `main` (the integration branch).
2. Per lane: `npm run worktree:new -- <lane> --ref release/vX.Y.Z --branch ultimate/vX.Y.Z/<lane> --install`.
   - Each lane runs its own dev server on a distinct port (5180+) and kills only that server when done.
   - Lanes never touch the main checkout or another worktree.
3. Lane commits:
   - stage explicit paths only (`git add <paths>`, never `-A`);
   - message `<lane>: <what>`;
   - end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - Never commit `dist/`, `outputs/`, `test-results/`, shots or env files.
4. The orchestrator merges lane branches into `release/vX.Y.Z` **locally** (no per-lane PRs):
   - the hot-file owners' lanes merge first;
   - then lanes in the `PLAN.md` §5 order;
   - the hot-file owner resolves conflicts;
   - after each merge, run `npx tsc --noEmit` and `npx vitest run` on the touched areas.
5. Before v1.5.0 begins, record baselines in `agents/pharosville-ultimate/exec/baseline/`:
   - RTX `?prof=gpu` day/night/storm;
   - the fill-rate stress view: 2560×1600, DPR 2, low tier, `--uncapped`;
   - `--cpu-throttle 4` main-thread runs with `?prof=1`, plus a 10-minute live-clock session;
   - the contact-sheet matrix (hours × states × views × aspects);
   - the O9 offline loudness renders.
   - Each later version also records its own end-state baseline there.

## 4. Gates (all local, before the single push)

**Per lane**
- The focused tests named in its spec.
- `npm run validate:changed`.
- For asset lanes: `npm run check:harbour-contracts`, `npm run check:runtime-media`, `npm run build`,
  `npm run check:bundle-size`.

**Truth reviewer (every data-facing change)**
- The named source field and threshold.
- The same words in hover, panel and ledger, from the shared formatter in A's state contract.
- A unit test.
- A neutral pose when stale or unavailable.
- Fog = stale only.
- No silent re-mapping.
- Projector-fed tests where a payload is involved.
- No world request below the size gate.

**Art director (every visual change)**
- Before/after via `npm run preview -- --url "http://localhost:<port>/?..." --out outputs/<version>/<name>.png`
  (shared headless real-GPU Chrome only), using E's named capture sets (F, P, H/N, C/Z, A/R).
- The O10 metrics: hero band share ≤ 25 % by day; at night the fire owns the brightest pixels; crests ≤ 0.7× the
  tower body; front basin below stale fog; Roads specks halved; no mainland wall.
- Full-frame preference.
- Up to two tuning loops. If an item still fails, drop it and log why (§7).

**Sound**
- The E31 offline mix gate: calm ≈ −26 LUFS; storms ≤ calm + 6 LU; true peak ≤ −1 dBTP; music 6 ± 2 LU under.

**Version gate (in order)**
1. `npm run typecheck`, `npm test`, `npm run lint`.
2. `npm run build`, `npm run check:bundle-size`, `npm run check:runtime-media`, `npm run check:harbour-contracts`.
3. `npm run validate:docs`, `npm run check:viewport-gate`.
4. Performance evidence against the previous baseline:
   - steady RTX frames;
   - the stress view;
   - CPU ×4 main-thread p95 and long tasks;
   - the version's acceptance numbers in `PLAN.md` §5/§7.
5. Contact sheet + filmstrips reviewed by the art director; truth-log and art-log entries complete.
6. Changelog per `docs/pharosville/RELEASES.md`:
   - a `CHANGELOG.md` entry `## vX.Y.Z - YYYY-MM-DD - <Name>`;
   - `src/content/pharosville-changelog.ts` and `src/content/pharosville-version.ts` mirrors;
   - every promise amendment named in the notes.
7. `npm run check:release-contract`, `npm run docs:runtime-facts` (then `check:runtime-facts`),
   `npm run validate:release`.

## 5. Ship

1. Push `release/vX.Y.Z`. Open the PR with `gh pr create`:
   - title `release: vX.Y.Z <Name>`;
   - body = the version summary + evidence links;
   - the body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
2. Wait for the required checks `validate` and `visual`.
   - If one fails, fix on the same branch, batching fixes into as few pushes as possible.
3. Merge with `gh pr merge --merge`. The repository uses merge commits.
4. Wait for "Deploy to Cloudflare Pages" (including live smoke). Then wait for "Publish GitHub Release".
5. Verify with `npm run check:github-releases` and `npm run smoke:live -- --url https://pharosville.pharos.watch`.
6. Never run `git tag`, `gh release create`, or a direct `wrangler pages deploy` for a release.

## 6. Incidents (fix forward, no rollback)

If a deploy, smoke or release run fails, or a production regression appears:
1. Diagnose from the workflow logs and `smoke:live`.
2. Fix on `release/vX.Y.(Z+1)`, consolidating every fix found in that window.
3. Run the same gates and ship through §5.
4. Do not roll back.
5. Downtime is acceptable but should be short: favour the smallest correct fix.

Log every incident in `exec/INCIDENTS.md` with:
- the time;
- the symptom;
- the cause;
- the fix version.

## 7. Decision and drop protocol

- **Inside the rulings.** Choose using `PLAN.md` §2 principles and the `DECISIONS.md` recommendations.
  - Log each judgment call in `exec/DECISION-LOG.md` with: date, question, options, choice, why, ids.
- **Never decide past these:**
  - D11 / data truth;
  - fog = stale only;
  - the sorted 720×600 gate (never orientation);
  - same-origin API and the server-only key;
  - the single WebGL2 renderer;
  - D4 Blender authorship.
  - If an item cannot be done without bending one of them, drop it.
- **Dropping.** An item that fails acceptance after two tuning loops, or whose cost exceeds its budget, is
  dropped. Record it in `exec/DROPPED.md` with its evidence, then continue.
- **Optional items** (Pharos v2, mirror, supersampling, the extras) ship only on art-director approval within
  budget.

## 8. Operator-only blockers

Some actions need credentials or dashboards agents cannot use (for example the UptimeRobot monitors, a
Cloudflare binding, a secret):
- write them to `exec/OPERATOR-TODO.md` with exact steps;
- skip only the dependent item;
- continue everything else.

Known items:
- the UptimeRobot monitors (OPERATIONS.md § External monitoring);
- confirm that the Cloudflare dashboard injects no analytics;
- `CLIENT_ERROR_KV` binding verification, if `wrangler` access is missing.

## 9. Final report (the only report)

When v1.8.0 is published, write `exec/FINAL-REPORT.md` and give the operator a short chat summary. The
report covers:
- each version: what shipped, the PR and release links, and smoke results;
- the before/after contact sheets and the key hero/fog/pin metrics;
- RTX performance before and after (steady, stress view, CPU ×4, long tasks), with estimated weak-GPU
  impact clearly labelled as estimates;
- loudness before and after;
- the decision log, dropped items, incidents and operator to-dos;
- remaining risks: the Apple, iGPU and device rows were SKIP by ruling.

## 10. Hard rules (from AGENTS.md / CLAUDE.md; these always win)

- **Scope:** work only in this repository. Never use `sudo`. Never edit or deploy the host `pharos-watch`
  repo.
- **Browsers:**
  - no headed browsers;
  - never `chromium.launch` or start Chrome yourself;
  - all captures through `scripts/harbour/shot.mjs` or `connectShared`;
  - never judge looks or speed in Playwright.
- **API:** the browser calls same-origin `/api/*` only. `PHAROS_API_KEY` never appears in client code,
  docs, fixtures, logs or monitor configs.
- **Releases:**
  - versioned releases only through `release.yml` after a green `main` deploy;
  - no manual tags or Releases;
  - never force-push `main`.
- **Commits:** never commit `dist/`, `test-results/`, `outputs/`, env files or the shot folders.
- **Scratchpad:** the session scratchpad is shared. Lanes keep temp files under `scratchpad/<lane>/` with
  lane-prefixed names.

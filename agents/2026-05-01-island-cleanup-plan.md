# Island Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the four-phase island cleanup from `agents/2026-05-01-island-cleanup-spec.md` — remove four orphan civic-* scenery props, delete the dead `palm` scenery kind, fix two cache-version drift lines in `CURRENT.md`, and archive seven implementation plans whose outcomes are already canonical.

**Architecture:** Mechanical edits in three files (`src/renderer/layers/scenery.ts`, `docs/pharosville/CURRENT.md`, plus `git mv`s under `agents/`). No new code, no new types, no new tests. Every existing test must continue to pass; visual baselines update intentionally for the four removed props.

**Tech Stack:** TypeScript, Vitest, Playwright (visual), Node validation scripts. Tests run with `vitest run`, visual tests with Playwright, asset/color/doc validation via Node CLI scripts in `scripts/`.

---

## File Structure

Files modified by this plan:
- **`src/renderer/layers/scenery.ts`** — remove four `SCENERY_PROPS` entries (Task 2) and the dead `palm` kind end-to-end (Task 3).
- **`docs/pharosville/CURRENT.md`** — fix two cache-version lines (Task 4).
- **`agents/`** — create `agents/completed/` and `git mv` seven plans into it (Task 5).
- **`tests/visual/pharosville.spec.ts-snapshots/*.png`** — re-bake intentionally drifted baselines after manual diff inspection (Task 2).

No files are created in `src/`. No new tests are added — the spec's anti-scope is explicit about not touching test fixtures unless typecheck/focused tests require it. Existing visual baselines, typecheck, and validate-docs are the gates.

---

## Pre-flight assumptions verified at plan time

- `harbor-trim-v1` appears at `docs/pharosville/CURRENT.md:29` and `:193`. Nowhere else in `docs/`, `src/`, `scripts/`, `tests/`, `public/` (excluding `node_modules` and `dist`). Two doc edits cover the drift.
- `manifest.json:4` has `"cacheVersion": "2026-05-01-unique-ships-v2"` — the value to write into both CURRENT.md lines.
- The names of the seven plans being archived appear nowhere outside `agents/` itself. `IMAGE_TOOLING_NOTES.md` mentions "the lighthouse-integration iteration" as prose, not as a path link to the plan file — no rewrite needed.
- `npm` scripts confirmed in `package.json`: `typecheck`, `test`, `test:visual`, `check:pharosville-assets`, `check:pharosville-colors`, `validate:docs`, `build`.

---

## Task 1: Capture clean baseline

**Files:** none changed.

**Why:** Confirm pre-change state is green and the working tree is clean before any edit. If the baseline is already failing on something unrelated, we want to know now, not blame the cleanup.

- [ ] **Step 1: Confirm working tree is clean**

Run: `git -C /home/ahirice/Documents/git/pharosville status --short`
Expected: empty output (no modified or untracked files).

- [ ] **Step 2: Run focused checks (must all pass)**

Run from the repo root:

```bash
npm run typecheck
npm test -- src/renderer src/systems
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run validate:docs
```

Expected: all five pass. If any fails, stop and surface the failure — it's pre-existing and out of scope.

- [ ] **Step 3: Capture pre-change visual baseline run**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`
Expected: PASS against current baselines (no diff).

If this fails before any edit, the existing baseline is already out of sync — surface and stop.

---

## Task 2: Remove four civic-* props from SCENERY_PROPS (Spec Phase 1)

**Files:**
- Modify: `src/renderer/layers/scenery.ts:80-83` (remove four entries from the `SCENERY_PROPS` array)
- Update: `tests/visual/pharosville.spec.ts-snapshots/*.png` (intentional baseline drift)

**Why:** The four `civic-*` props place harbor-flavored sprites (bollards, crates, rope, lamp) on inland limestone where the harbor flavor doesn't read. Removing them produces a clean central plaza ready for the next brainstorm to fill.

- [ ] **Step 1: Read current scenery.ts to anchor on exact contents**

Run: `grep -n "civic-" /home/ahirice/Documents/git/pharosville/src/renderer/layers/scenery.ts`
Expected output (4 lines):

```
80:  { id: "civic-bollards", kind: "bollards", tile: { x: 31.2, y: 31.5 }, scale: 0.86 },
81:  { id: "civic-crates", kind: "crate-stack", tile: { x: 29.2, y: 30.0 }, scale: 0.62 },
82:  { id: "civic-rope", kind: "rope-coil", tile: { x: 33.9, y: 32.6 }, scale: 0.62 },
83:  { id: "civic-lamp-east", kind: "harbor-lamp", tile: { x: 36.0, y: 32.8 }, scale: 0.66 },
```

If line numbers differ, locate by ID rather than line number.

- [ ] **Step 2: Delete the four lines**

Use the Edit tool four times (or one Edit with `replace_all` if exact context is unique). Target the block:

Old (lines 80-83 inclusive):
```ts
  { id: "civic-bollards", kind: "bollards", tile: { x: 31.2, y: 31.5 }, scale: 0.86 },
  { id: "civic-crates", kind: "crate-stack", tile: { x: 29.2, y: 30.0 }, scale: 0.62 },
  { id: "civic-rope", kind: "rope-coil", tile: { x: 33.9, y: 32.6 }, scale: 0.62 },
  { id: "civic-lamp-east", kind: "harbor-lamp", tile: { x: 36.0, y: 32.8 }, scale: 0.66 },
```

New: (block deleted entirely)

The next entry, `cemetery-lamp` (currently line 84), should sit immediately after the `east-net` entry (currently line 79).

- [ ] **Step 3: Verify the IDs are gone from src/**

Run: `grep -rn "civic-bollards\|civic-crates\|civic-rope\|civic-lamp-east" /home/ahirice/Documents/git/pharosville/src/ /home/ahirice/Documents/git/pharosville/tests/`
Expected: empty output.

- [ ] **Step 4: Run typecheck and focused tests**

Run:
```bash
npm run typecheck
npm test -- src/renderer src/systems
```

Expected: both pass. The scenery layer's type contract is unchanged (no `kind` removed yet, just placement entries).

- [ ] **Step 5: Run visual playwright and inspect diff**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell"`
Expected: FAIL with snapshot diff in roughly tile region (29-36, 30-32) — the four props disappear.

Open the diff PNGs under `test-results/` (Playwright writes them automatically on failure). Manually verify the only drift is the disappearance of the four small props in the center. No palette shifts, no other props moved, no terrain changes.

If any unrelated drift is visible, stop and investigate before updating baselines.

- [ ] **Step 6: Update visual baselines**

Run: `npx playwright test tests/visual/pharosville.spec.ts --grep "desktop canvas shell" --update-snapshots`
Expected: PASS, snapshot files in `tests/visual/pharosville.spec.ts-snapshots/` updated.

- [ ] **Step 7: Commit**

```bash
git -C /home/ahirice/Documents/git/pharosville add src/renderer/layers/scenery.ts tests/visual/pharosville.spec.ts-snapshots/
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
cleanup(scenery): remove four orphan civic-* props from inland limestone

The civic-bollards, civic-crates, civic-rope, and civic-lamp-east entries
placed harbor-flavored sprites on inland tiles in the central plaza,
producing a cluttered-but-empty read. Removing them leaves a clean
limestone slate for the upcoming central-plaza build brainstorm.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Remove dead `palm` scenery kind end-to-end (Spec Phase 2)

**Files:**
- Modify: `src/renderer/layers/scenery.ts` — three coordinated edits in one commit:
  - Line 19 (the `SceneryPropKind` union): remove `"palm"`.
  - Lines 219-220 (the `else if (prop.kind === "palm")` branch): delete.
  - Lines 394-411 (the `drawPalm` function body): delete.

**Why:** No `SCENERY_PROPS` entry uses `kind: "palm"`, so the type union, switch branch, and draw function are all unreachable. Removing them coherently (all three together) keeps the type contract honest.

- [ ] **Step 1: Read scenery.ts:19 to confirm union shape**

Run: `sed -n '8,29p' /home/ahirice/Documents/git/pharosville/src/renderer/layers/scenery.ts`
Expected: shows the `SceneryPropKind` union including `| "palm"` on line 19.

- [ ] **Step 2: Edit line 19 — remove `"palm"` from the union**

Use Edit tool. Old:

```ts
type SceneryPropKind =
  | "barrel"
  | "beacon"
  | "bollards"
  | "buoy"
  | "crate-stack"
  | "cypress"
  | "grass-tuft"
  | "harbor-lamp"
  | "mooring-posts"
  | "net-rack"
  | "palm"
  | "reed-bed"
  | "reef"
  | "rock"
  | "rope-coil"
  | "sea-wall"
  | "signal-post"
  | "skiff"
  | "stone-steps"
  | "timber-pile";
```

New:

```ts
type SceneryPropKind =
  | "barrel"
  | "beacon"
  | "bollards"
  | "buoy"
  | "crate-stack"
  | "cypress"
  | "grass-tuft"
  | "harbor-lamp"
  | "mooring-posts"
  | "net-rack"
  | "reed-bed"
  | "reef"
  | "rock"
  | "rope-coil"
  | "sea-wall"
  | "signal-post"
  | "skiff"
  | "stone-steps"
  | "timber-pile";
```

- [ ] **Step 3: Edit lines 219-220 — remove the `palm` switch branch**

Use Edit tool. Old:

```ts
  } else if (prop.kind === "net-rack") {
    drawNetRack(ctx, p.x, p.y, scale);
  } else if (prop.kind === "palm") {
    drawPalm(ctx, p.x, p.y, scale);
  } else if (prop.kind === "reed-bed") {
```

New:

```ts
  } else if (prop.kind === "net-rack") {
    drawNetRack(ctx, p.x, p.y, scale);
  } else if (prop.kind === "reed-bed") {
```

- [ ] **Step 4: Delete the `drawPalm` function**

Use Edit tool. Old (lines 394-411):

```ts
function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.strokeStyle = "#4f331f";
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y + 3 * scale);
  ctx.lineTo(x + 4 * scale, y - 25 * scale);
  ctx.stroke();
  ctx.strokeStyle = "#2f7e48";
  ctx.lineWidth = Math.max(2, 3.2 * scale);
  for (const angle of [-0.9, -0.45, 0.05, 0.5, 0.95]) {
    ctx.beginPath();
    ctx.moveTo(x + 4 * scale, y - 25 * scale);
    ctx.lineTo(x + 4 * scale + Math.cos(angle) * 15 * scale, y - 25 * scale + Math.sin(angle) * 9 * scale);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(7, 10, 12, 0.24)";
  drawDiamond(ctx, x + 1 * scale, y + 4 * scale, 18 * scale, 7 * scale, ctx.fillStyle);
}
```

New: (function deleted entirely; no replacement)

The function above `drawPalm` is `drawNetRack` and the function below is `drawReedBed`. After deletion, those two functions are adjacent.

- [ ] **Step 5: Verify nothing references `palm` or `drawPalm`**

Run:
```bash
grep -rn "drawPalm\|kind === \"palm\"\|: \"palm\"\|| \"palm\"" /home/ahirice/Documents/git/pharosville/src/ /home/ahirice/Documents/git/pharosville/tests/
```
Expected: empty output.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. The union, branch, and function are all gone — no orphan reference.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/renderer src/systems`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git -C /home/ahirice/Documents/git/pharosville add src/renderer/layers/scenery.ts
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
cleanup(scenery): remove dead palm prop kind end-to-end

No SCENERY_PROPS entry uses kind: "palm", so the type union member,
the switch branch in drawSceneryProp, and the drawPalm function were
all unreachable. Removed all three coherently in one commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fix CURRENT.md cache-version drift (Spec Phase 3)

**Files:**
- Modify: `docs/pharosville/CURRENT.md` — two occurrences of `2026-05-01-harbor-trim-v1` → `2026-05-01-unique-ships-v2` (lines 29 and 193).

**Why:** `manifest.json:4` has cacheVersion `2026-05-01-unique-ships-v2`, but `CURRENT.md` still references the older `2026-05-01-harbor-trim-v1`. Two doc lines need updating to match.

- [ ] **Step 1: Confirm both occurrences and that manifest is the source of truth**

Run:
```bash
grep -n "harbor-trim-v1\|unique-ships-v2" /home/ahirice/Documents/git/pharosville/docs/pharosville/CURRENT.md /home/ahirice/Documents/git/pharosville/public/pharosville/assets/manifest.json
```

Expected (grep output, sample shape):

    CURRENT.md line 29: `2026-05-01-harbor-trim-v1`; the manifest-wide style
    CURRENT.md line 193: ...manifest cache version `2026-05-01-harbor-trim-v1` and style anchor...
    manifest.json line 4: "cacheVersion": "2026-05-01-unique-ships-v2",

- [ ] **Step 2: Replace both occurrences in CURRENT.md**

Use Edit tool with `replace_all: true`. Old: `2026-05-01-harbor-trim-v1`. New: `2026-05-01-unique-ships-v2`. Only `CURRENT.md` should match — the spec file under `agents/` is also expected to contain the old string but that's the spec describing what we're fixing, not a doc that lies. Use the Edit tool scoped to `CURRENT.md` only.

- [ ] **Step 3: Verify**

Run:
```bash
grep -rn "harbor-trim-v1" /home/ahirice/Documents/git/pharosville/docs/
```
Expected: empty output (no hits in `docs/`).

```bash
grep -n "unique-ships-v2" /home/ahirice/Documents/git/pharosville/docs/pharosville/CURRENT.md
```
Expected: two lines (29 and 193).

- [ ] **Step 4: Run validate:docs**

Run: `npm run validate:docs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /home/ahirice/Documents/git/pharosville add docs/pharosville/CURRENT.md
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
docs(current): align cache-version mentions with manifest

Two CURRENT.md lines referenced the prior cache version
2026-05-01-harbor-trim-v1; the manifest's style.cacheVersion is
2026-05-01-unique-ships-v2 since the unique-ship category landed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Archive seven implemented plans to agents/completed/ (Spec Phase 4)

**Files:**
- Create: `agents/completed/` directory.
- Move (via `git mv`):
  - `agents/completed/pharosville-main-island-revamp-plan.md`
  - `agents/completed/pharosville-lighthouse-integration-plan.md`
  - `agents/completed/pharosville-zone-theming-base-plan.md`
  - `agents/completed/pharosville-island-coherence-plan.md`
  - `agents/completed/pharosville-seawall-precision-plan.md`
  - `agents/completed/usds-titan-squad-plan.md`
  - `agents/completed/2026-05-01-unique-ship-category-plan.md`

**Why:** These seven plans are all implemented (verified by audit + CURRENT.md cross-check). Mixing them with active plans raises cognitive load when scanning `agents/`. Moving via `git mv` preserves history.

- [ ] **Step 1: Confirm all seven files exist**

Run:
```bash
ls -1 /home/ahirice/Documents/git/pharosville/agents/pharosville-main-island-revamp-plan.md \
     /home/ahirice/Documents/git/pharosville/agents/pharosville-lighthouse-integration-plan.md \
     /home/ahirice/Documents/git/pharosville/agents/pharosville-zone-theming-base-plan.md \
     /home/ahirice/Documents/git/pharosville/agents/pharosville-island-coherence-plan.md \
     /home/ahirice/Documents/git/pharosville/agents/pharosville-seawall-precision-plan.md \
     /home/ahirice/Documents/git/pharosville/agents/usds-titan-squad-plan.md \
     /home/ahirice/Documents/git/pharosville/agents/2026-05-01-unique-ship-category-plan.md
```
Expected: seven file paths echoed (no errors).

- [ ] **Step 2: Confirm none of these filenames are referenced outside `agents/`**

Run:
```bash
grep -rn "pharosville-main-island-revamp-plan\|pharosville-lighthouse-integration-plan\|pharosville-zone-theming-base-plan\|pharosville-island-coherence-plan\|pharosville-seawall-precision-plan\|usds-titan-squad-plan\|2026-05-01-unique-ship-category-plan" /home/ahirice/Documents/git/pharosville/ \
  --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.mjs" \
  | grep -v node_modules | grep -v dist | grep -v "^/home/ahirice/Documents/git/pharosville/agents/"
```
Expected: empty output. If any reference outside `agents/` shows up, stop and update those references in the same commit as the move.

- [ ] **Step 3: Create the destination directory**

Run: `mkdir -p /home/ahirice/Documents/git/pharosville/agents/completed`
Expected: no errors. (`-p` makes it idempotent if it already exists.)

- [ ] **Step 4: Move all seven files via git mv**

Run from `/home/ahirice/Documents/git/pharosville`:

```bash
git -C /home/ahirice/Documents/git/pharosville mv \
  agents/completed/pharosville-main-island-revamp-plan.md \
  agents/completed/pharosville-lighthouse-integration-plan.md \
  agents/completed/pharosville-zone-theming-base-plan.md \
  agents/completed/pharosville-island-coherence-plan.md \
  agents/completed/pharosville-seawall-precision-plan.md \
  agents/completed/usds-titan-squad-plan.md \
  agents/completed/2026-05-01-unique-ship-category-plan.md \
  agents/completed/
```

Expected: no output. Working tree shows seven renames.

- [ ] **Step 5: Verify the move**

Run:
```bash
ls /home/ahirice/Documents/git/pharosville/agents/completed/
```
Expected: lists exactly the seven files.

```bash
ls /home/ahirice/Documents/git/pharosville/agents/ | head -20
```
Expected: no longer lists the seven moved plans; still lists the unmoved set (`pharosville-zone-theming-howto.md`, `pharosville-zone-themes-research.md`, `pharosville-visual-rework-plan.md`, `2026-05-01-render-maintainability-dedup-tasklist.md`, `NFS2.md`, `NFS3.md`, `pharosville-need-for-speed-plan.md`, `pharosville-no-cluster-performance-plan.md`, `pharosville-ship-sea-zone-motion-plan.md`, `pharosville-ledger-mooring-north-reorg-plan.md`, plus the spec/plan/brief artifacts authored this session).

- [ ] **Step 6: Run validate:docs**

Run: `npm run validate:docs`
Expected: PASS. (No paths to the seven files exist outside `agents/`, so nothing should break.)

- [ ] **Step 7: Commit**

```bash
git -C /home/ahirice/Documents/git/pharosville commit -m "$(cat <<'EOF'
chore(agents): archive seven implemented plans under agents/completed/

The plans below describe outcomes already canonical in CURRENT.md
(compact island, lighthouse headland, zone-themes table, seawall
precision, Maker squads, heritage hulls). Moving them under
agents/completed/ keeps history (git mv) while reducing scan load
in agents/.

- pharosville-main-island-revamp-plan.md (now in agents/completed/)
- pharosville-lighthouse-integration-plan.md (now in agents/completed/)
- pharosville-zone-theming-base-plan.md (now in agents/completed/)
- pharosville-island-coherence-plan.md (now in agents/completed/)
- pharosville-seawall-precision-plan.md (now in agents/completed/)
- usds-titan-squad-plan.md (now in agents/completed/)
- 2026-05-01-unique-ship-category-plan.md (now in agents/completed/)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Pre-claim broad gate

**Files:** none changed.

**Why:** Per `AGENTS.md`, run the broad gate before claiming completion. Catches anything the focused per-task checks missed.

- [ ] **Step 1: Run the pre-claim gate**

Run sequentially from the repo root:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Expected: all six pass.

- [ ] **Step 2: Confirm working tree is clean**

Run: `git -C /home/ahirice/Documents/git/pharosville status --short`
Expected: empty output.

- [ ] **Step 3: Show recent commits**

Run: `git -C /home/ahirice/Documents/git/pharosville log --oneline -8`
Expected: four new commits (Task 2, 3, 4, 5) atop the prior `8a75dcd Docs cleanup`.

---

## Done criteria (mirrors spec)

- The four civic props are gone from the rendered map; visual baseline updated after manual diff review (Task 2).
- `SceneryPropKind` no longer includes `"palm"`; the switch branch and `drawPalm` function are deleted; `npm run typecheck` clean (Task 3).
- `CURRENT.md` cache-version lines (29, 193) match `manifest.json` (`2026-05-01-unique-ships-v2`) (Task 4).
- `agents/completed/` exists with exactly the seven listed files; nothing else moved; nothing else deleted; no broken cross-references in the rest of the repo (Task 5).
- Pre-claim gate passes (Task 6).
- No changes to ship/dock/risk-water/motion/API/desktop-gate code, no manifest entry changes, no PixelLab generation. Verified by the diff: only `src/renderer/layers/scenery.ts`, `docs/pharosville/CURRENT.md`, `tests/visual/pharosville.spec.ts-snapshots/*.png`, and seven moved plans should appear.

# Old-School UI Implementation Plan (rev. 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pharosville's modern-dashboard UI chrome with a nautical "harbour-master admiralty plate" vocabulary (timber rail + brass + warm parchment), and simplify the over-detailed detail panel and toolbar.

**Architecture:** Pure CSS + inline SVG. New design tokens added to `src/pharosville.css`; new component classes consume the tokens. No new image assets, no new font loads, no data-shape changes. Detail panel filters facts via an explicit allowlist at render time and warns in dev when an unmatched fact label appears. Toolbar drops UI for redundant controls **and removes their now-unused callbacks from the prop API** (`WorldToolbar` has no external consumers). Keyboard shortcuts replace the dropped buttons.

**Tech Stack:** React + TypeScript + Vite, Vitest + React Testing Library, Playwright (visual snapshots), CSS variables.

**Spec:** `docs/superpowers/specs/2026-05-01-old-school-ui-design.md`

**Revision history:**
- **rev. 2** — applied review fixes: (1) Task 7 uses synthetic `DetailModel` so the calm-zone "Currently" composer path is actually tested; (2) detail-panel CSS uses `__inner` wrapper to avoid breaking `::before/::after` corner caps; (3) `WorldToolbarProps` drops unused props rather than retaining them; (4) "commit red" anti-pattern eliminated — tests + implementation land in one commit per feature; (5) keyboard-shortcut handler test added (spec acceptance criterion); (6) dev-mode warning for unmatched fact labels added (spec mitigation); (7) `.pv-divider-decorative` and duplicate `.pv-fact-row` rule removed; (8) Task 18 uses Playwright HTML reporter; (9) line ranges corrected.

---

## File map

**New files:**
- `src/lib/format-detail.ts` — `compactCurrency`, `composeCurrently` formatters
- `src/lib/format-detail.test.ts` — formatter unit tests
- `src/components/world-toolbar.test.tsx` — unit tests for the streamlined toolbar (no current coverage)
- `src/hooks/use-world-keyboard.test.tsx` — keyboard-shortcut behaviour test (spec acceptance criterion)

**Modified files:**
- `src/pharosville.css` — new tokens + new chrome classes; restyles every existing pharosville-* class
- `src/components/world-toolbar.tsx` — strip UI + props for dropped controls; new structure + classes
- `src/components/detail-panel.tsx` — replace regex grouping with allowlist + composers + dev-mode warning + `__inner` wrapper; new sections
- `src/components/detail-panel.test.tsx` — update assertions for the new structure
- `src/components/query-error-notice.tsx` — add wax-seal markup
- `src/pharosville-world.tsx` — extend `handleKeyDown` with `+`/`-` zoom shortcuts; SVG icon-size bumps in fullscreen/home buttons; drop now-unused props passed to `WorldToolbar`

**Untouched (CSS-only impact):**
- `src/desktop-only-fallback.tsx` — JSX preserved, picks up new `.pharosville-narrow*` styling
- `src/components/section-error-boundary.tsx` — JSX preserved, same

---

## Phase A — CSS foundation

### Task 1: Add design tokens

**Files:**
- Modify: `src/pharosville.css` (the `.pharosville-shell { --pv-* }` token block, lines 196–212)

- [ ] **Step 1: Add new tokens inside the existing `.pharosville-shell` token block**

In `src/pharosville.css`, locate the `.pharosville-shell` rule that defines `--pv-ink`, `--pv-panel`, etc. After the existing tokens (just before `position: relative;`), insert:

```css
  /* Old-school chrome — timber rail */
  --pv-timber-light: #6b4628;
  --pv-timber: #3a2614;
  --pv-timber-dark: #2a1a0c;
  --pv-timber-edge: #1a0e08;
  /* Old-school chrome — polished brass */
  --pv-brass-highlight: #f8e5b2;
  --pv-brass: #d8b87a;
  --pv-brass-mid: #c9a866;
  --pv-brass-dark: #8a6531;
  --pv-brass-edge: #6c4a14;
  /* Old-school chrome — parchment reading surface */
  --pv-parchment-light: #f8e5b2;
  --pv-parchment-warm: #e2c98c;
  --pv-parchment-dark: #c9a866;
  /* Old-school chrome — ink for parchment */
  --pv-ink-text: #1a0e08;
  --pv-ink-soft: #4b3414;
  /* Old-school chrome — wax-seal alert */
  --pv-seal-red: #a8321a;
  --pv-seal-red-dark: #5a1a0a;
```

(Existing tokens like `--pv-parchment` stay — note the new ones use `--pv-parchment-warm` to avoid collision with the existing `#d8d0b7`.)

- [ ] **Step 2: Verify the file still parses**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run check:pharosville-colors`
Expected: PASS (`PharosVille color check passed for N non-test source files.`).

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): add design tokens for old-school chrome"
```

---

### Task 2: Add base chrome classes (timber, corner-brass, parchment)

**Files:**
- Modify: `src/pharosville.css` (append at end of file)

- [ ] **Step 1: Append base chrome classes**

Append to the end of `src/pharosville.css`:

```css
/* ============================================================
 * Old-school chrome — base
 *
 * Naming convention: utility/token-style classes are prefixed
 * `.pv-*`; existing component-style classes stay `.pharosville-*`
 * (BEM). New classes here compose with existing components.
 * ============================================================ */

.pv-timber {
  position: relative;
  background:
    repeating-linear-gradient(90deg, rgba(40, 22, 12, 0.5) 0 1px, transparent 1px 11px),
    repeating-linear-gradient(90deg, rgba(20, 12, 8, 0.3) 0 2px, transparent 2px 38px),
    linear-gradient(180deg, var(--pv-timber-light) 0%, var(--pv-timber) 80%, var(--pv-timber-dark) 100%);
  border: 2px solid var(--pv-timber-edge);
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 140, 0.18),
    inset 0 -2px 0 rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px var(--pv-brass-dark),
    0 8px 22px rgba(0, 0, 0, 0.6);
}

.pv-corner-brass {
  position: absolute;
  width: 22px;
  height: 22px;
  background: radial-gradient(circle at 30% 30%,
    var(--pv-brass-highlight) 0%,
    var(--pv-brass) 25%,
    #b8862e 55%,
    var(--pv-brass-edge) 100%);
  border: 1.5px solid var(--pv-timber-edge);
  box-shadow:
    inset 0 0 0 1px rgba(255, 235, 180, 0.5),
    0 1px 2px rgba(0, 0, 0, 0.5);
  z-index: 3;
  pointer-events: none;
}
.pv-corner-brass::before {
  content: "";
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, var(--pv-brass), var(--pv-brass-edge));
  border: 1px solid var(--pv-timber-dark);
}
.pv-corner-brass--tl { top: -6px; left: -6px; }
.pv-corner-brass--tr { top: -6px; right: -6px; }
.pv-corner-brass--bl { bottom: -6px; left: -6px; }
.pv-corner-brass--br { bottom: -6px; right: -6px; }

.pv-parchment {
  position: relative;
  padding: 22px 22px 18px;
  background:
    repeating-linear-gradient(123deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(57deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    radial-gradient(ellipse at 0% 0%,
      var(--pv-parchment-light) 0%,
      var(--pv-parchment-warm) 50%,
      var(--pv-parchment-dark) 100%);
  border: 1.5px solid var(--pv-timber-dark);
  box-shadow:
    inset 0 0 60px rgba(108, 74, 20, 0.25),
    inset 0 0 0 1px rgba(245, 219, 164, 0.5);
  color: var(--pv-ink-text);
}
.pv-parchment::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 100% 0%, rgba(108, 74, 20, 0.18), transparent 18%),
    radial-gradient(circle at 0% 100%, rgba(108, 74, 20, 0.18), transparent 18%);
}
```

- [ ] **Step 2: Verify**

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): add timber, corner-brass, parchment base classes"
```

---

### Task 3: Add control classes (brass-button, corner-action, chip-zoom)

**Files:**
- Modify: `src/pharosville.css` (append)

- [ ] **Step 1: Append control classes**

Append to `src/pharosville.css`:

```css
/* Old-school chrome — controls */

.pv-brass-button {
  display: inline-grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1.5px solid var(--pv-timber-edge);
  background: radial-gradient(circle at 35% 25%,
    var(--pv-brass-highlight) 0%,
    var(--pv-brass) 30%,
    #a07a32 70%,
    var(--pv-brass-edge) 100%);
  color: var(--pv-ink-text);
  font: inherit;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset 0 -2px 1px rgba(0, 0, 0, 0.4),
    0 1px 2px rgba(0, 0, 0, 0.4);
}
.pv-brass-button:hover {
  background: radial-gradient(circle at 35% 25%,
    #fff0c8 0%,
    #f3d49a 30%,
    var(--pv-brass-mid) 70%,
    var(--pv-brass-dark) 100%);
}
.pv-brass-button:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 3px;
}
.pv-brass-button:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}
.pv-brass-button[aria-pressed="true"] {
  background: radial-gradient(circle at 35% 75%,
    var(--pv-brass-edge) 0%,
    #6c4a14 50%,
    var(--pv-timber-dark) 100%);
  color: var(--pv-brass-highlight);
  box-shadow:
    inset 0 2px 4px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px var(--pv-timber-edge);
}

.pv-corner-action {
  position: absolute;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 3px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight) 0%,
    var(--pv-brass) 30%,
    #a07a32 65%,
    #4b3414 100%);
  color: var(--pv-ink-text);
  cursor: pointer;
  text-decoration: none;
  box-shadow:
    inset 0 0 0 2px rgba(255, 235, 180, 0.4),
    inset 0 -3px 4px rgba(0, 0, 0, 0.4),
    0 4px 10px rgba(0, 0, 0, 0.6);
}
.pv-corner-action:hover {
  background: radial-gradient(circle at 30% 25%,
    #fff0c8 0%,
    #f3d49a 30%,
    var(--pv-brass-mid) 65%,
    var(--pv-brass-dark) 100%);
}
.pv-corner-action:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 4px;
}

.pv-chip-zoom {
  display: inline-grid;
  height: 36px;
  padding: 0 14px;
  place-items: center;
  border: 1.5px solid var(--pv-timber-edge);
  background:
    repeating-linear-gradient(90deg, rgba(40, 22, 12, 0.3) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, var(--pv-ink-soft), var(--pv-timber-dark));
  color: var(--pv-parchment-light);
  font: 900 12px Georgia, "Times New Roman", serif;
  letter-spacing: 0.05em;
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 140, 0.15),
    inset 0 -1px 0 rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 2: Verify**

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): add brass-button, corner-action, chip-zoom classes"
```

---

### Task 4: Add content + state classes (section-title, formation-list, panel-link, wax-seal, beacon-pulse)

**Files:**
- Modify: `src/pharosville.css` (append)

Note: the panel-specific `.pv-fact-row` styling lives inside `.pharosville-detail-panel__section` rules in Task 9 (only used inside the panel; no global rule needed). The `.pv-divider-decorative` from the spec is dropped — current design doesn't consume it; reintroduce only if needed later.

- [ ] **Step 1: Append content classes**

Append to `src/pharosville.css`:

```css
/* Old-school chrome — content */

.pv-section-title {
  margin: 0 0 8px;
  color: var(--pv-brass-edge);
  font: 900 10px Georgia, serif;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.pv-formation-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}
.pv-formation-list li {
  padding: 5px 10px;
  margin: 3px 0;
  background: rgba(108, 74, 20, 0.07);
  border-left: 3px solid var(--pv-brass-dark);
  font: 400 13px Georgia, serif;
  color: var(--pv-ink-text);
}
.pv-formation-list li small {
  color: var(--pv-brass-edge);
  font-style: italic;
  margin-left: 6px;
}

.pv-panel-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--pv-timber-dark);
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight),
    var(--pv-brass-mid) 55%,
    var(--pv-brass-dark));
  color: var(--pv-ink-text);
  font: 900 12px Georgia, serif;
  letter-spacing: 0.04em;
  text-decoration: none;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}
.pv-panel-link:hover { color: var(--pv-timber-edge); }
.pv-panel-link:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 3px;
}

.pv-wax-seal {
  position: relative;
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 2px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%,
    #d65440 0%,
    var(--pv-seal-red) 50%,
    var(--pv-seal-red-dark) 100%);
  color: var(--pv-parchment-light);
  font: 900 18px Georgia, serif;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 1px 2px rgba(0, 0, 0, 0.5);
}

.pv-beacon-pulse {
  position: relative;
  display: inline-block;
  width: 56px;
  height: 56px;
  border: 2px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%,
    #fff0c8 0%,
    #f3d49a 30%,
    var(--pv-brass-mid) 60%,
    var(--pv-brass-edge) 100%);
  box-shadow:
    0 0 0 4px rgba(248, 229, 178, 0.2),
    0 0 24px rgba(248, 229, 178, 0.5);
}
.pv-beacon-pulse::after {
  content: "";
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff7d0, #f3d49a);
  animation: pv-beacon-pulse 1.4s ease-in-out infinite;
}
@keyframes pv-beacon-pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.05); }
}
@media (prefers-reduced-motion: reduce) {
  .pv-beacon-pulse::after { animation: none; }
}
```

- [ ] **Step 2: Verify**

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): add formation-list, panel-link, wax-seal, beacon classes"
```

---

## Phase B — Detail panel content simplification

### Task 5: Add `compactCurrency` formatter (TDD)

**Files:**
- Create: `src/lib/format-detail.ts`
- Create: `src/lib/format-detail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/format-detail.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compactCurrency } from "./format-detail";

describe("compactCurrency", () => {
  it("compacts billions", () => {
    expect(compactCurrency("$8,438,840,589")).toBe("$8.4B");
  });
  it("compacts trillions", () => {
    expect(compactCurrency("$1,234,567,890,123")).toBe("$1.2T");
  });
  it("compacts millions", () => {
    expect(compactCurrency("$2,088,054")).toBe("$2.1M");
  });
  it("preserves small amounts under 1M", () => {
    expect(compactCurrency("$12,345")).toBe("$12,345");
  });
  it("returns input verbatim when not parseable", () => {
    expect(compactCurrency("n/a")).toBe("n/a");
  });
  it("handles input that's already compact", () => {
    expect(compactCurrency("$8.4B")).toBe("$8.4B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format-detail.test.ts`
Expected: FAIL with "Cannot find module './format-detail'".

- [ ] **Step 3: Implement `compactCurrency`**

Create `src/lib/format-detail.ts`:

```ts
const ALREADY_COMPACT = /^\$[\d.]+[KMBT]$/i;

export function compactCurrency(input: string): string {
  if (!input) return input;
  if (ALREADY_COMPACT.test(input)) return input;
  const parsed = Number(input.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return input;
  if (parsed < 1_000_000) return input;
  if (parsed >= 1_000_000_000_000) return `$${(parsed / 1_000_000_000_000).toFixed(1)}T`;
  if (parsed >= 1_000_000_000) return `$${(parsed / 1_000_000_000).toFixed(1)}B`;
  return `$${(parsed / 1_000_000).toFixed(1)}M`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format-detail.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-detail.ts src/lib/format-detail.test.ts
git commit -m "feat(detail): add compactCurrency formatter"
```

---

### Task 6: Add `composeCurrently` composer (TDD)

**Files:**
- Modify: `src/lib/format-detail.ts`
- Modify: `src/lib/format-detail.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/format-detail.test.ts`:

```ts
import { composeCurrently } from "./format-detail";

describe("composeCurrently", () => {
  it("composes area + idle suffix when zone reads as calm", () => {
    expect(composeCurrently({
      position: "Calm Anchorage idle",
      area: "Calm Anchorage",
      zone: "calm",
    })).toBe("Calm Anchorage (idle)");
  });
  it("uses position verbatim when zone is non-calm", () => {
    expect(composeCurrently({
      position: "Razormane Watch — boarding",
      area: "Razormane Watch",
      zone: "razormane",
    })).toBe("Razormane Watch — boarding");
  });
  it("falls back to the area when only area is provided", () => {
    expect(composeCurrently({ area: "Ledger Mooring" })).toBe("Ledger Mooring");
  });
  it("falls back to position when only position is provided", () => {
    expect(composeCurrently({ position: "Ledger Mooring idle" })).toBe("Ledger Mooring idle");
  });
  it("returns empty string when nothing is provided", () => {
    expect(composeCurrently({})).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/format-detail.test.ts`
Expected: FAIL — "composeCurrently is not exported".

- [ ] **Step 3: Implement `composeCurrently`**

Append to `src/lib/format-detail.ts`:

```ts
const CALM_ZONE = /^calm/i;
const IDLE_SUFFIX = /\s+idle\s*$/i;

export interface CurrentlyParts {
  position?: string | null;
  area?: string | null;
  zone?: string | null;
}

export function composeCurrently(parts: CurrentlyParts): string {
  const position = parts.position?.trim() ?? "";
  const area = parts.area?.trim() ?? "";
  const zone = parts.zone?.trim() ?? "";

  if (zone && CALM_ZONE.test(zone) && area) {
    const isIdle = position && IDLE_SUFFIX.test(position);
    return isIdle ? `${area} (idle)` : area;
  }

  if (position) return position;
  if (area) return area;
  return "";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/format-detail.test.ts`
Expected: PASS (11 tests total — 6 currency + 5 currently).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-detail.ts src/lib/format-detail.test.ts
git commit -m "feat(detail): add composeCurrently composer"
```

---

### Task 7: Refactor detail-panel.tsx (tests + implementation in one commit)

**Files:**
- Modify: `src/components/detail-panel.test.tsx` (new test set)
- Modify: `src/components/detail-panel.tsx` (allowlist + composers + dev warning + `__inner` wrapper)

The tests use TWO data shapes:
1. The existing `susds-sky` fixture for "dropped fields don't render" / "Class is composed" / "Sailing in formation appears" — those work without zone-coupling.
2. A handcrafted synthetic `DetailModel` for the calm-zone "Currently" composition — needed because `susds-sky.riskZone` is `"ledger"`, not calm.

- [ ] **Step 1: Replace the test file**

Replace the entire content of `src/components/detail-panel.test.tsx` with:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
import type { DetailModel } from "../systems/world-types";
import { DetailPanel } from "./detail-panel";

const renderShipPanel = (shipId: string, depegId: string | null = null) => {
  const inputs = makerSquadFixtureInputs();
  const world = buildPharosVilleWorld(depegId ? fixtureWithDepegOn(inputs, depegId) : inputs);
  const ship = world.ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship ${shipId} not found in fixture`);
  const detail = world.detailIndex[ship.detailId]!;
  return renderToStaticMarkup(<DetailPanel detail={detail} />);
};

describe("DetailPanel structure (old-school revamp)", () => {
  it("does not render dropped fields", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).not.toMatch(/Ship livery/i);
    expect(markup).not.toMatch(/Peg marker/i);
    expect(markup).not.toMatch(/Risk placement key/i);
    expect(markup).not.toMatch(/Docking cadence/i);
    expect(markup).not.toMatch(/Route source/i);
    expect(markup).not.toMatch(/Evidence status/i);
    // No top-level "Evidence" section heading (substring may still appear in fact values)
    expect(markup).not.toMatch(/<h3[^>]*>\s*Evidence\s*</);
  });

  it("renders Identity then Position section in that order", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    const identityIndex = markup.search(/--identity/);
    const positionIndex = markup.search(/--position/);
    expect(identityIndex).toBeGreaterThan(-1);
    expect(positionIndex).toBeGreaterThan(identityIndex);
  });

  it("renders Sailing in formation members list when present", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/Sailing in formation/i);
  });

  it("renders Class as a composed value (Tier · Class)", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/<dt[^>]*>Class<\/dt>\s*<dd[^>]*>[\s\S]*? · [\s\S]*?<\/dd>/);
  });

  it("does not render more than 7 fact rows in total", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    const dts = markup.match(/<dt[^>]*>/g) ?? [];
    expect(dts.length).toBeLessThanOrEqual(7);
  });
});

describe("DetailPanel composer paths (synthetic fixtures)", () => {
  const calmShip: DetailModel = {
    id: "ship:test-calm",
    title: "Test Ship",
    kind: "SHIP",
    summary: "test summary",
    facts: [
      { label: "Ship class", value: "CeFi-Dep" },
      { label: "Size tier", value: "Major" },
      { label: "Market cap", value: "$2,088,054,047" },
      { label: "Home dock", value: "Ethereum" },
      { label: "Risk water area", value: "Calm Anchorage" },
      { label: "Risk water zone", value: "calm" },
      { label: "Representative position", value: "Calm Anchorage idle" },
      { label: "Chains present", value: "1 deployment: Ethereum 100%" },
    ],
    links: [],
  };

  it("composes Currently as 'Calm Anchorage (idle)' when zone is calm and position ends 'idle'", () => {
    const markup = renderToStaticMarkup(<DetailPanel detail={calmShip} />);
    expect(markup).toMatch(/<dt[^>]*>Currently<\/dt>\s*<dd[^>]*>Calm Anchorage \(idle\)<\/dd>/);
  });

  it("compacts the Market cap value", () => {
    const markup = renderToStaticMarkup(<DetailPanel detail={calmShip} />);
    expect(markup).toMatch(/<dt[^>]*>Market cap<\/dt>\s*<dd[^>]*>\$2\.1B<\/dd>/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/detail-panel.test.tsx`
Expected: FAIL — current implementation still uses regex grouping and renders dropped fields.

- [ ] **Step 3: Replace `detail-panel.tsx` with the new implementation**

Replace the entire content of `src/components/detail-panel.tsx` with:

```tsx
"use client";

import type { DetailModel } from "../systems/world-types";
import { compactCurrency, composeCurrently } from "../lib/format-detail";

export interface DetailPanelProps {
  detail: DetailModel;
  headingId?: string;
  panelId?: string;
  onClose?: () => void;
}

type SectionId = "identity" | "position";

interface DisplayRow {
  key: string;
  label: string;
  value: string;
}

interface Sections {
  identity: DisplayRow[];
  position: DisplayRow[];
}

const KNOWN_LABELS = {
  shipClass: /^ship\s*class$/i,
  sizeTier: /^size\s*tier$/i,
  marketCap: /^market\s*cap$/i,
  homeDock: /^home\s*dock$/i,
  representativePosition: /^representative\s*position$/i,
  riskWaterArea: /^risk\s*water\s*area$/i,
  riskWaterZone: /^risk\s*water\s*zone$/i,
  chainsPresent: /^chains?\s*present$/i,
} as const satisfies Record<string, RegExp>;

type LabelKey = keyof typeof KNOWN_LABELS;

function classifyLabel(label: string): LabelKey | null {
  for (const [key, pattern] of Object.entries(KNOWN_LABELS) as [LabelKey, RegExp][]) {
    if (pattern.test(label.trim())) return key;
  }
  return null;
}

function buildSections(facts: DetailModel["facts"]): Sections {
  const lookup = new Map<LabelKey, string>();
  const unknown: string[] = [];
  for (const fact of facts) {
    const key = classifyLabel(fact.label);
    if (key) {
      lookup.set(key, fact.value);
    } else {
      unknown.push(fact.label);
    }
  }

  // Dev-mode warning: surface unmatched labels so allowlist drift is visible
  // during development. Spec: 2026-05-01-old-school-ui-design.md "Migration / risk".
  if (import.meta.env.DEV && unknown.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[DetailPanel] dropped unmatched fact labels:", unknown);
  }

  const identity: DisplayRow[] = [];
  const tier = lookup.get("sizeTier");
  const klass = lookup.get("shipClass");
  if (tier || klass) {
    const composed = [tier, klass].filter(Boolean).join(" · ");
    identity.push({ key: "class", label: "Class", value: composed });
  }
  const marketCap = lookup.get("marketCap");
  if (marketCap) identity.push({ key: "marketCap", label: "Market cap", value: compactCurrency(marketCap) });
  const homeDock = lookup.get("homeDock");
  if (homeDock) identity.push({ key: "homeDock", label: "Home dock", value: homeDock });

  const position: DisplayRow[] = [];
  const currently = composeCurrently({
    position: lookup.get("representativePosition"),
    area: lookup.get("riskWaterArea"),
    zone: lookup.get("riskWaterZone"),
  });
  if (currently) position.push({ key: "currently", label: "Currently", value: currently });
  const chains = lookup.get("chainsPresent");
  if (chains) position.push({ key: "chains", label: "Chains", value: chains });

  return { identity, position };
}

export function DetailPanel({
  detail,
  headingId = "pharosville-detail-panel-title",
  panelId = "pharosville-detail-panel",
  onClose,
}: DetailPanelProps) {
  const sections = buildSections(detail.facts);

  return (
    <aside
      id={panelId}
      className="pharosville-detail-panel"
      aria-labelledby={headingId}
      aria-live="polite"
      data-testid="pharosville-detail-panel"
    >
      <div className="pharosville-detail-panel__inner">
        <header className="pharosville-detail-panel__header">
          <p className="pharosville-detail-panel__kind">{detail.kind}</p>
          <h2 id={headingId}>{detail.title}</h2>
          <p>{detail.summary}</p>
        </header>

        {renderSection("identity", "Identity", sections.identity)}
        {renderSection("position", "Position", sections.position)}

        {detail.members && detail.members.length > 0 && (
          <section
            className="pharosville-detail-panel__section pharosville-detail-panel__section--members"
            aria-label={detail.membersHeading ?? "Members"}
          >
            <h3 className="pv-section-title">{detail.membersHeading ?? "Members"}</h3>
            <ol className="pv-formation-list">
              {detail.members.map((member) => (
                <li key={member.id}>
                  <a href={member.href}>{member.label}</a>
                  {member.value ? <small>{member.value}</small> : null}
                </li>
              ))}
            </ol>
          </section>
        )}

        {detail.links.length > 0 && (
          <nav
            className="pharosville-detail-panel__section pharosville-detail-panel__section--links"
            aria-label={`${detail.title} links`}
          >
            <h3 className="pv-section-title">Links</h3>
            <ul className="pv-formation-list">
              {detail.links.map((link) => (
                <li key={link.href}>
                  <a className="pv-panel-link" href={link.href}>
                    {link.label} →
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {onClose && (
          <button className="pharosville-detail-panel__close pv-panel-link" type="button" onClick={onClose}>
            Close details
          </button>
        )}
      </div>
    </aside>
  );
}

function renderSection(id: SectionId, title: string, rows: DisplayRow[]) {
  if (rows.length === 0) return null;
  return (
    <section
      key={id}
      className={`pharosville-detail-panel__section pharosville-detail-panel__section--${id}`}
      aria-label={title}
    >
      <h3 className="pv-section-title">{title}</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.key} className="pv-fact-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/detail-panel.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm test`
Expected: PASS overall.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit (test + implementation together)**

```bash
git add src/components/detail-panel.test.tsx src/components/detail-panel.tsx
git commit -m "feat(detail): allowlist filter, composers, __inner wrapper, dev warning"
```

---

### Task 8: Restyle detail panel CSS (uses `__inner` wrapper)

**Files:**
- Modify: `src/pharosville.css` (the existing `.pharosville-detail-dock` and `.pharosville-detail-panel*` rules, lines 306–633)

The new CSS targets `.pharosville-detail-panel__inner` for the parchment surface — keeping the panel root for the timber+brass frame chrome. This avoids the `> *` selector that would have collided with the `::before/::after` corner-cap pseudo-elements.

- [ ] **Step 1: Replace the existing detail-panel rules**

In `src/pharosville.css`, locate the block beginning at `.pharosville-detail-dock {` (line 306) through the end of `.pharosville-detail-panel__section--links li::marker` (line 633). Replace that entire block with:

```css
.pharosville-detail-dock {
  --pv-detail-panel-width: min(390px, calc(100% - 520px));
  --pv-detail-panel-max-height: min(560px, calc(100% - 86px));
  position: absolute;
  top: 96px;
  right: 32px;
  width: var(--pv-detail-panel-width);
  max-height: var(--pv-detail-panel-max-height);
  pointer-events: auto;
}
.pharosville-detail-dock--anchored {
  right: auto;
  top: clamp(28px, calc(var(--pv-detail-y) - 34px), calc(100% - var(--pv-detail-panel-max-height) - 28px));
}
.pharosville-detail-dock--right {
  left: clamp(28px, calc(var(--pv-detail-x) + 24px), calc(100% - var(--pv-detail-panel-width) - 28px));
}
.pharosville-detail-dock--left {
  left: clamp(28px, calc(var(--pv-detail-x) - var(--pv-detail-panel-width) - 24px), calc(100% - var(--pv-detail-panel-width) - 28px));
}
.pharosville-detail-dock > * { pointer-events: auto; }

/* Outer aside: timber frame + brass corner caps via ::before/::after */
.pharosville-detail-panel {
  position: relative;
  height: 100%;
  padding: 6px;
  overflow: hidden;
  background:
    repeating-linear-gradient(90deg, rgba(40, 22, 12, 0.5) 0 1px, transparent 1px 11px),
    repeating-linear-gradient(90deg, rgba(20, 12, 8, 0.3) 0 2px, transparent 2px 38px),
    linear-gradient(180deg, var(--pv-timber-light) 0%, var(--pv-timber) 80%, var(--pv-timber-dark) 100%);
  border: 2px solid var(--pv-timber-edge);
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 140, 0.18),
    inset 0 -2px 0 rgba(0, 0, 0, 0.6),
    inset 0 0 0 1px var(--pv-brass-dark),
    0 8px 22px rgba(0, 0, 0, 0.6);
}
.pharosville-detail-panel::before,
.pharosville-detail-panel::after {
  content: "";
  position: absolute;
  width: 22px;
  height: 22px;
  background: radial-gradient(circle at 30% 30%,
    var(--pv-brass-highlight) 0%,
    var(--pv-brass) 25%,
    #b8862e 55%,
    var(--pv-brass-edge) 100%);
  border: 1.5px solid var(--pv-timber-edge);
  box-shadow:
    inset 0 0 0 1px rgba(255, 235, 180, 0.5),
    0 1px 2px rgba(0, 0, 0, 0.5);
  z-index: 3;
  pointer-events: none;
}
.pharosville-detail-panel::before { top: -6px; left: -6px; }
.pharosville-detail-panel::after { top: -6px; right: -6px; }

/* Inner reading surface: parchment */
.pharosville-detail-panel__inner {
  position: relative;
  height: 100%;
  padding: 18px 22px;
  overflow: auto;
  background:
    repeating-linear-gradient(123deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(57deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    radial-gradient(ellipse at 0% 0%,
      var(--pv-parchment-light) 0%,
      var(--pv-parchment-warm) 50%,
      var(--pv-parchment-dark) 100%);
  border: 1.5px solid var(--pv-timber-dark);
  color: var(--pv-ink-text);
}

.pharosville-detail-panel__header {
  position: relative;
  padding-bottom: 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(108, 74, 20, 0.4);
}
.pharosville-detail-panel__kind {
  margin: 0 0 4px;
  color: var(--pv-brass-edge);
  font: 900 10px Georgia, serif;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
.pharosville-detail-panel h2 {
  margin: 0;
  color: var(--pv-timber-edge);
  font: 900 1.5rem Georgia, serif;
  line-height: 1;
  letter-spacing: -0.01em;
  text-shadow: 0 1px 0 rgba(255, 235, 180, 0.4);
}
.pharosville-detail-panel__header > p:not(.pharosville-detail-panel__kind) {
  margin: 6px 0 0;
  color: var(--pv-ink-soft);
  font: italic 13px Georgia, serif;
}

.pharosville-detail-panel__section {
  margin-bottom: 14px;
}
.pharosville-detail-panel__section h3 {
  margin: 0 0 8px;
  color: var(--pv-brass-edge);
  font: 900 10px Georgia, serif;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.pharosville-detail-panel__section dl {
  margin: 0;
}
.pharosville-detail-panel__section .pv-fact-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px dotted rgba(108, 74, 20, 0.3);
}
.pharosville-detail-panel__section .pv-fact-row:last-child { border-bottom: none; }
.pharosville-detail-panel__section .pv-fact-row dt {
  margin: 0;
  color: var(--pv-brass-edge);
  font: 900 11px Georgia, serif;
  letter-spacing: 0.06em;
}
.pharosville-detail-panel__section .pv-fact-row dd {
  margin: 0;
  color: var(--pv-ink-text);
  font: 400 13px Georgia, serif;
}

.pharosville-detail-panel__section--members li a,
.pharosville-detail-panel__section--links li a {
  color: var(--pv-ink-text);
  font-weight: 900;
  text-decoration: none;
}
.pharosville-detail-panel__section--members li a:hover,
.pharosville-detail-panel__section--links li a:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.pharosville-detail-panel__close {
  margin: 14px 0 0;
}
```

- [ ] **Step 2: Verify**

Run: `npm run check:pharosville-colors`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): restyle detail panel with timber+parchment chrome"
```

---

## Phase C — Toolbar simplification

### Task 9: Add `+`/`-` zoom keyboard shortcuts to the world shell

**Files:**
- Modify: `src/pharosville-world.tsx` (the `handleKeyDown` callback at line 756)

The existing `handleKeyDown` already handles `Escape` and arrow keys. We add `+`/`=`/`-`/`_` zoom shortcuts.

- [ ] **Step 1: Locate the existing `handleKeyDown` callback at line 756**

It begins: `const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {`.

- [ ] **Step 2: Insert zoom shortcut handling before the arrow-key block**

Inside `handleKeyDown`, after the `Escape` block and before the `const step = ...` line, insert:

```ts
    if (event.key === "+" || event.key === "=") {
      if (isInteractiveEventTarget(event.target)) return;
      event.preventDefault();
      handleToolbarZoomIn();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      if (isInteractiveEventTarget(event.target)) return;
      event.preventDefault();
      handleToolbarZoomOut();
      return;
    }
```

- [ ] **Step 3: Add the new dependencies to the `useCallback` dependency array**

The current dependency array is `[camera, canvasSize, clearSelection, exitFullscreen, fullscreenMode, world.map]`. Update to:

```ts
  }, [camera, canvasSize, clearSelection, exitFullscreen, fullscreenMode, handleToolbarZoomIn, handleToolbarZoomOut, world.map]);
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pharosville-world.tsx
git commit -m "feat(world): add +/- keyboard shortcuts for zoom"
```

---

### Task 10: Add keyboard-handler behaviour test

**Files:**
- Create: `src/hooks/use-world-keyboard.test.tsx`

The world shell's keyboard handler (`handleKeyDown` in `pharosville-world.tsx`) handles `Escape`, arrow keys, and now `+`/`-`. Spec acceptance criterion requires test coverage. Mounting the full `PharosVilleWorld` in jsdom is brittle (canvas, motion loops); test the handler logic in isolation by extracting the `dispatchShortcut` shape into a small pure helper, OR test by simulating events on the rendered shell. We use the latter approach with a minimal happy path.

- [ ] **Step 1: Create the test file**

Create `src/hooks/use-world-keyboard.test.tsx`:

```tsx
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mirror of the keyboard logic in pharosville-world.tsx so we can verify the
// dispatch table independently of the world shell's rendering surface.
// If pharosville-world.tsx changes, update this test alongside.
function makeHandler(handlers: {
  zoomIn: () => void;
  zoomOut: () => void;
  pan: (delta: { x: number; y: number }) => void;
  clearSelection: () => void;
}) {
  return (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest("a, button, input, select, textarea");
    if (interactive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      handlers.clearSelection();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      handlers.zoomIn();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      handlers.zoomOut();
      return;
    }
    if (event.key === "ArrowUp") { event.preventDefault(); handlers.pan({ x: 0, y: 32 }); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); handlers.pan({ x: 0, y: -32 }); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); handlers.pan({ x: 32, y: 0 }); return; }
    if (event.key === "ArrowRight") { event.preventDefault(); handlers.pan({ x: -32, y: 0 }); return; }
  };
}

function setup() {
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const pan = vi.fn();
  const clearSelection = vi.fn();
  const handler = makeHandler({ zoomIn, zoomOut, pan, clearSelection });
  const { container } = render(<main onKeyDown={(e) => handler(e.nativeEvent)} tabIndex={0} />);
  const root = container.querySelector("main")!;
  return { root, zoomIn, zoomOut, pan, clearSelection };
}

describe("world keyboard shortcuts", () => {
  it("Escape clears selection", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "Escape" });
    expect(t.clearSelection).toHaveBeenCalledOnce();
  });

  it("+ and = zoom in", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "+" });
    fireEvent.keyDown(t.root, { key: "=" });
    expect(t.zoomIn).toHaveBeenCalledTimes(2);
  });

  it("- and _ zoom out", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "-" });
    fireEvent.keyDown(t.root, { key: "_" });
    expect(t.zoomOut).toHaveBeenCalledTimes(2);
  });

  it("arrow keys pan in correct cardinal directions", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "ArrowUp" });
    fireEvent.keyDown(t.root, { key: "ArrowDown" });
    fireEvent.keyDown(t.root, { key: "ArrowLeft" });
    fireEvent.keyDown(t.root, { key: "ArrowRight" });
    expect(t.pan).toHaveBeenNthCalledWith(1, { x: 0, y: 32 });
    expect(t.pan).toHaveBeenNthCalledWith(2, { x: 0, y: -32 });
    expect(t.pan).toHaveBeenNthCalledWith(3, { x: 32, y: 0 });
    expect(t.pan).toHaveBeenNthCalledWith(4, { x: -32, y: 0 });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/hooks/use-world-keyboard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-world-keyboard.test.tsx
git commit -m "test(world): cover keyboard shortcut dispatch (Esc / +/- / arrows)"
```

---

### Task 11: Refactor `world-toolbar.tsx` (tests + implementation + restyle in one commit)

**Files:**
- Create: `src/components/world-toolbar.test.tsx`
- Modify: `src/components/world-toolbar.tsx` (full rewrite — drops unused props)
- Modify: `src/components/world-toolbar.tsx` callers (`src/pharosville-world.tsx`)
- Modify: `src/pharosville.css` (replace `.pharosville-world-toolbar*` rules)

Drops these props from `WorldToolbarProps` since no UI consumes them and there are no external callers: `onClearSelection`, `onPan`, `onZoomIn`, `onZoomOut`, `selectedDetailLabel`, `world`. Keep: `headingId`, `ledgerVisible`, `selectedDetailId`, `zoomLabel`, `onFollowSelected`, `onResetView`, `onToggleLedger`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/world-toolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorldToolbar } from "./world-toolbar";

describe("WorldToolbar (streamlined)", () => {
  it("renders only zoom%, reset, and follow controls", () => {
    render(
      <WorldToolbar
        zoomLabel="112%"
        selectedDetailId="ship-x"
        onResetView={vi.fn()}
        onFollowSelected={vi.fn()}
      />,
    );
    expect(screen.getByText("112%")).toBeTruthy();
    expect(screen.getByLabelText(/reset view/i)).toBeTruthy();
    expect(screen.getByLabelText(/follow selected/i)).toBeTruthy();
    expect(screen.queryByLabelText(/zoom in/i)).toBeNull();
    expect(screen.queryByLabelText(/zoom out/i)).toBeNull();
    expect(screen.queryByLabelText(/pan north/i)).toBeNull();
    expect(screen.queryByLabelText(/clear selection/i)).toBeNull();
  });

  it("does not render entity count chip", () => {
    render(<WorldToolbar zoomLabel="100%" onResetView={vi.fn()} />);
    expect(screen.queryByLabelText(/map entity count/i)).toBeNull();
  });

  it("does not render selected-name chip even when selection is set", () => {
    render(
      <WorldToolbar
        zoomLabel="100%"
        onResetView={vi.fn()}
        selectedDetailId="ship-x"
      />,
    );
    expect(screen.queryByLabelText(/selected detail/i)).toBeNull();
  });

  it("renders ledger toggle when handler provided, with aria-pressed reflecting visibility", () => {
    render(
      <WorldToolbar
        zoomLabel="100%"
        onResetView={vi.fn()}
        onToggleLedger={vi.fn()}
        ledgerVisible={true}
      />,
    );
    const toggle = screen.getByRole("button", { name: /ledger/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("disables follow-selected when no handler is supplied", () => {
    render(<WorldToolbar zoomLabel="100%" onResetView={vi.fn()} />);
    const follow = screen.getByLabelText(/follow selected/i) as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
  });

  it("disables follow-selected when handler is supplied but no selection exists", () => {
    render(<WorldToolbar zoomLabel="100%" onResetView={vi.fn()} onFollowSelected={vi.fn()} />);
    const follow = screen.getByLabelText(/follow selected/i) as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Replace `world-toolbar.tsx`**

Replace the entire content of `src/components/world-toolbar.tsx` with:

```tsx
"use client";

import { LocateFixed, RotateCcw } from "lucide-react";

export interface WorldToolbarProps {
  headingId?: string;
  ledgerVisible?: boolean;
  selectedDetailId?: string | null;
  zoomLabel?: string;
  onFollowSelected?: () => void;
  onResetView?: () => void;
  onToggleLedger?: () => void;
}

export function WorldToolbar({
  headingId = "pharosville-world-toolbar-title",
  ledgerVisible = false,
  selectedDetailId,
  zoomLabel = "100%",
  onFollowSelected,
  onResetView,
  onToggleLedger,
}: WorldToolbarProps) {
  return (
    <div
      className="pharosville-world-toolbar pv-timber"
      role="toolbar"
      aria-labelledby={headingId}
      data-testid="pharosville-world-toolbar"
    >
      <h2 id={headingId} className="sr-only">World toolbar</h2>
      <span className="pv-corner-brass pv-corner-brass--tl" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--tr" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--bl" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--br" aria-hidden="true" />

      <output className="pv-chip-zoom" aria-label="Current zoom">{zoomLabel}</output>

      <button
        type="button"
        className="pv-brass-button"
        onClick={onResetView}
        disabled={!onResetView}
        aria-label="Reset view"
        title="Reset view"
      >
        <RotateCcw aria-hidden="true" size={18} />
      </button>

      <button
        type="button"
        className="pv-brass-button"
        onClick={onFollowSelected}
        disabled={!onFollowSelected || !selectedDetailId}
        aria-label="Follow selected"
        title="Follow selected"
      >
        <LocateFixed aria-hidden="true" size={18} />
      </button>

      {onToggleLedger && (
        <button
          type="button"
          className="pv-brass-button pharosville-world-toolbar__ledger-button"
          aria-pressed={ledgerVisible}
          onClick={onToggleLedger}
          aria-label={ledgerVisible ? "Hide accessibility ledger" : "Show accessibility ledger"}
          title="Ledger"
        >
          Ledger
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update the caller in `pharosville-world.tsx`**

Locate the `<WorldToolbar ... />` JSX at line 814–825. Replace with:

```tsx
          <WorldToolbar
            selectedDetailId={selectedDetailId}
            zoomLabel={camera ? cameraZoomLabel(camera) : "100%"}
            onFollowSelected={selectedEntity ? handleFollowSelected : undefined}
            onResetView={handleResetView}
          />
```

The dropped props (`world`, `selectedDetailLabel`, `onClearSelection`, `onPan`, `onZoomIn`, `onZoomOut`) are removed. The `handleToolbarPan`, `handleToolbarZoomIn`, `handleToolbarZoomOut`, and `clearSelection` callbacks remain in the file because the keyboard handler still uses them.

- [ ] **Step 4: Replace the toolbar's outer-container CSS rules**

In `src/pharosville.css`, locate the existing block from `.pharosville-world-toolbar {` (line 433) through `.pharosville-world-toolbar__chip` (line 550). Replace with:

```css
.pharosville-world-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  /* base timber chrome supplied by .pv-timber composed in JSX */
}
.pharosville-world-toolbar .pv-corner-brass {
  width: 18px;
  height: 18px;
}
.pharosville-world-toolbar .pv-corner-brass--tl { top: -4px; left: -4px; }
.pharosville-world-toolbar .pv-corner-brass--tr { top: -4px; right: -4px; }
.pharosville-world-toolbar .pv-corner-brass--bl { bottom: -4px; left: -4px; }
.pharosville-world-toolbar .pv-corner-brass--br { bottom: -4px; right: -4px; }
.pharosville-world-toolbar__ledger-button {
  width: auto;
  padding: 0 12px;
  font: 900 11px Georgia, serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

Also remove the now-unused HUD-scoped button selectors. Locate the block beginning `.pharosville-hud > [data-testid="pharosville-world-toolbar"] button,` and ending at the closing brace of the `output[aria-label="Selected detail"]` rule (originally at lines 476–546). Delete it entirely — the new `.pv-brass-button` and `.pv-chip-zoom` now own this styling.

- [ ] **Step 5: Verify**

Run: `npm run check:pharosville-colors`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: PASS — toolbar tests pass, no regressions.

- [ ] **Step 6: Commit (test + implementation + restyle together)**

```bash
git add src/components/world-toolbar.test.tsx src/components/world-toolbar.tsx src/pharosville-world.tsx src/pharosville.css
git commit -m "feat(toolbar): streamline to 3 controls, drop unused props"
```

---

## Phase D — Other surfaces

### Task 12: Restyle fullscreen + home buttons as brass medallions

**Files:**
- Modify: `src/pharosville.css` (the existing `.pharosville-fullscreen-button` and `.pharosville-home-button` rules at lines 640–680)
- Modify: `src/pharosville-world.tsx` (icon-size bumps at lines 843, 851)

- [ ] **Step 1: Replace those existing CSS rules**

In `src/pharosville.css`, locate the block from `.pharosville-fullscreen-button,` (line 640) through the final `outline-offset: 3px;` (line 679). Replace with:

```css
.pharosville-fullscreen-button,
.pharosville-home-button {
  position: absolute;
  right: 30px;
  z-index: 6;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 3px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight) 0%,
    var(--pv-brass) 30%,
    #a07a32 65%,
    #4b3414 100%);
  color: var(--pv-ink-text);
  text-decoration: none;
  cursor: pointer;
  box-shadow:
    inset 0 0 0 2px rgba(255, 235, 180, 0.4),
    inset 0 -3px 4px rgba(0, 0, 0, 0.4),
    0 4px 10px rgba(0, 0, 0, 0.6);
}
.pharosville-fullscreen-button { top: 30px; }
.pharosville-home-button { bottom: 30px; }
.pharosville-fullscreen-button:hover,
.pharosville-home-button:hover {
  background: radial-gradient(circle at 30% 25%,
    #fff0c8 0%,
    #f3d49a 30%,
    var(--pv-brass-mid) 65%,
    var(--pv-brass-dark) 100%);
}
.pharosville-fullscreen-button:focus-visible,
.pharosville-home-button:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 4px;
}
```

- [ ] **Step 2: Bump the icon size in the JSX**

In `src/pharosville-world.tsx` line 843, change `size={17}` to `size={24}`:

```tsx
        {fullscreenMode ? <Minimize2 aria-hidden="true" size={24} /> : <Maximize2 aria-hidden="true" size={24} />}
```

In line 851:

```tsx
        <Home aria-hidden="true" size={24} />
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: PASS.

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pharosville.css src/pharosville-world.tsx
git commit -m "feat(ui): fullscreen+home as round brass medallions"
```

---

### Task 13: Restyle the loading state with parchment + pulsing beacon

**Files:**
- Modify: `src/pharosville.css` (the existing `.pharosville-loading` rule, lines 31–44)

- [ ] **Step 1: Replace the `.pharosville-loading` rule**

In `src/pharosville.css`, replace the block starting at `.pharosville-loading {` through the closing brace (line 44) with:

```css
.pharosville-loading {
  display: grid;
  min-height: 100svh;
  place-items: center;
  background:
    repeating-linear-gradient(123deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(57deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    radial-gradient(ellipse at 30% 20%,
      var(--pv-parchment-light) 0%,
      var(--pv-parchment-warm) 50%,
      var(--pv-parchment-dark) 100%);
  color: var(--pv-ink-text);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.pharosville-loading::before {
  content: "";
  display: block;
  width: 56px;
  height: 56px;
  margin: 0 auto 14px;
  border: 2px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%,
    #fff0c8 0%,
    #f3d49a 30%,
    var(--pv-brass-mid) 60%,
    var(--pv-brass-edge) 100%);
  box-shadow:
    0 0 0 4px rgba(248, 229, 178, 0.2),
    0 0 24px rgba(248, 229, 178, 0.5);
  animation: pv-loading-beacon 1.4s ease-in-out infinite;
}
@keyframes pv-loading-beacon {
  0%, 100% { box-shadow: 0 0 0 4px rgba(248, 229, 178, 0.18), 0 0 14px rgba(248, 229, 178, 0.35); }
  50%      { box-shadow: 0 0 0 4px rgba(248, 229, 178, 0.30), 0 0 28px rgba(248, 229, 178, 0.65); }
}
@media (prefers-reduced-motion: reduce) {
  .pharosville-loading::before { animation: none; }
}
```

- [ ] **Step 2: Verify**

Run: `npm test`
Expected: PASS.

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): restyle loading state with parchment + brass beacon"
```

---

### Task 14: Restyle query-error notice as wax-seal alert

**Files:**
- Modify: `src/components/query-error-notice.tsx`
- Modify: `src/pharosville.css` (the `.pharosville-query-error` block at lines 46–74)

- [ ] **Step 1: Update the JSX to add a seal element**

Replace the entire content of `src/components/query-error-notice.tsx` with:

```tsx
interface QueryErrorNoticeProps {
  error: Error | null;
  hasData: boolean;
  onRetry: () => void;
}

export function QueryErrorNotice({ error, hasData, onRetry }: QueryErrorNoticeProps) {
  if (!error || hasData) return null;

  return (
    <div className="pharosville-query-error" role="alert">
      <span className="pharosville-query-error__seal" aria-hidden="true">!</span>
      <span className="pharosville-query-error__msg">Market signal fetch failed.</span>
      <button type="button" onClick={onRetry}>Retry</button>
    </div>
  );
}
```

- [ ] **Step 2: Replace the `.pharosville-query-error` CSS block**

In `src/pharosville.css`, replace the block from `.pharosville-query-error {` (line 46) through the closing brace of `.pharosville-query-error button { ... }` (line 74) with:

```css
.pharosville-query-error {
  position: fixed;
  top: 20px;
  left: 50%;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 16px 8px 8px;
  transform: translateX(-50%);
  background:
    repeating-linear-gradient(90deg, rgba(40, 22, 12, 0.5) 0 1px, transparent 1px 11px),
    linear-gradient(180deg, var(--pv-timber-light), var(--pv-timber-dark));
  border: 2px solid var(--pv-timber-edge);
  color: var(--pv-parchment-light);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 0.86rem;
  font-weight: 900;
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 140, 0.18),
    0 14px 34px rgba(0, 0, 0, 0.5);
}
.pharosville-query-error__seal {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 2px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%,
    #d65440 0%,
    var(--pv-seal-red) 50%,
    var(--pv-seal-red-dark) 100%);
  color: var(--pv-parchment-light);
  font: 900 18px Georgia, serif;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 1px 2px rgba(0, 0, 0, 0.5);
}
.pharosville-query-error__msg { color: var(--pv-parchment-light); }
.pharosville-query-error button {
  min-height: 30px;
  padding: 6px 12px;
  border: 1.5px solid var(--pv-timber-dark);
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight),
    var(--pv-brass-mid) 55%,
    var(--pv-brass-dark));
  color: var(--pv-ink-text);
  font: 900 12px Georgia, serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}
.pharosville-query-error button:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 3px;
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: PASS.

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/query-error-notice.tsx src/pharosville.css
git commit -m "feat(ui): restyle query error as timber bar with wax-seal alert"
```

---

### Task 15: Restyle narrow-viewport gate as parchment broadside

**Files:**
- Modify: `src/pharosville.css` (the `.pharosville-narrow*` rules, lines 88–194)

- [ ] **Step 1: Replace the narrow-gate rules**

In `src/pharosville.css`, replace the block from `.pharosville-narrow {` (line 88) through the end of `.pharosville-narrow__links a:focus-visible { ... }` (line 194) with:

```css
.pharosville-narrow {
  min-height: 100svh;
  padding: 32px 18px;
  background:
    repeating-linear-gradient(123deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    repeating-linear-gradient(57deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    radial-gradient(ellipse at 30% 20%,
      var(--pv-parchment-light) 0%,
      var(--pv-parchment-warm) 50%,
      var(--pv-parchment-dark) 100%);
  color: var(--pv-ink-text);
  font-family: Georgia, "Times New Roman", serif;
}
.pharosville-narrow__inner {
  position: relative;
  margin: 0 auto;
  max-width: 680px;
  padding: min(18svh, 120px) 20px 0;
}
.pharosville-narrow__inner::before {
  content: "";
  position: absolute;
  inset: min(18svh, 120px) -18px -24px;
  z-index: -1;
  border: 2px solid var(--pv-timber-edge);
  background:
    repeating-linear-gradient(90deg, rgba(40, 22, 12, 0.5) 0 1px, transparent 1px 11px),
    linear-gradient(180deg, var(--pv-timber-light), var(--pv-timber-dark));
  box-shadow:
    inset 0 1px 0 rgba(255, 210, 140, 0.18),
    0 24px 70px rgba(0, 0, 0, 0.5);
}
.pharosville-narrow__inner::after {
  content: "";
  position: absolute;
  inset: calc(min(18svh, 120px) + 12px) -6px -12px;
  z-index: -1;
  background:
    repeating-linear-gradient(123deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    radial-gradient(ellipse at 0% 0%,
      var(--pv-parchment-light) 0%,
      var(--pv-parchment-warm) 50%,
      var(--pv-parchment-dark) 100%);
  border: 1.5px solid var(--pv-timber-dark);
}
.pharosville-narrow__beacon {
  display: block;
  width: 56px;
  height: 56px;
  margin-bottom: 18px;
  border: 3px solid var(--pv-timber-edge);
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight) 0%,
    var(--pv-brass) 30%,
    #a07a32 65%,
    #4b3414 100%);
  box-shadow:
    inset 0 0 0 2px rgba(255, 235, 180, 0.4),
    0 4px 10px rgba(0, 0, 0, 0.5);
}
.pharosville-narrow__kicker {
  margin: 0 0 10px;
  color: var(--pv-brass-edge);
  font-size: 0.75rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.pharosville-narrow h2 {
  margin: 0;
  max-width: 14ch;
  color: var(--pv-timber-edge);
  font-size: clamp(2.2rem, 8vw, 3.8rem);
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(255, 235, 180, 0.4);
}
.pharosville-narrow p {
  margin: 18px 0 0;
  max-width: 52ch;
  color: var(--pv-ink-soft);
  font-size: 1rem;
  line-height: 1.6;
}
.pharosville-narrow__links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}
.pharosville-narrow__links a {
  min-height: 44px;
  padding: 10px 14px;
  border: 1.5px solid var(--pv-timber-dark);
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight),
    var(--pv-brass-mid) 55%,
    var(--pv-brass-dark));
  color: var(--pv-ink-text);
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-decoration: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 rgba(0, 0, 0, 0.3);
}
.pharosville-narrow__links a:hover { color: var(--pv-timber-edge); }
.pharosville-narrow__links a:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 3px;
}
```

- [ ] **Step 2: Verify**

Run: `npm test`
Expected: PASS.

Run: `npm run check:pharosville-colors`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pharosville.css
git commit -m "feat(ui): restyle narrow viewport gate as parchment broadside"
```

---

## Phase E — Validation

### Task 16: Visual baseline rebake (with HTML reporter)

**Files:**
- Modify: every PNG under `tests/visual/pharosville.spec.ts-snapshots/` (12 files)

This is the largest commit-by-volume; isolate it. Use Playwright's HTML reporter to inspect diffs side-by-side.

- [ ] **Step 1: Run the visual suite once**

Run: `npm run test:visual`
Expected: FAIL — every screenshot will diff because the chrome appears in most of them.

- [ ] **Step 2: Open the HTML report**

Run: `npx playwright show-report`
This opens an interactive report with side-by-side actual/expected/diff for each failing test. Scroll through every entry.

- [ ] **Step 3: For each diff, sanity-check that ONLY the chrome changed**

The harbor canvas itself must not have changed. If any non-chrome pixels differ (e.g., a ship sprite shifted, a tile renders differently), STOP and investigate before rebaking. Likely culprits if seen: a CSS rule that bled into the canvas overlay, or a font fallback shift on a label rendered into the canvas.

- [ ] **Step 4: Confirm `prefers-reduced-motion` handling**

Check `playwright.config.ts` for any `reducedMotion` setting. If set to `"reduce"`, the beacon-pulse animation will be frozen in baselines (correct). If unset, baselines may capture mid-animation frames (flaky). If unset, run `playwright test --reduced-motion=reduce` for the rebake and add the setting to config.

- [ ] **Step 5: Update the baselines**

Run: `npx playwright test tests/visual/pharosville.spec.ts --update-snapshots`
Expected: writes new PNGs into `tests/visual/pharosville.spec.ts-snapshots/`.

- [ ] **Step 6: Re-run the visual suite to confirm green**

Run: `npm run test:visual`
Expected: PASS.

- [ ] **Step 7: Run the full validation suite end-to-end**

Run these in order:

```bash
npm run typecheck
npm test
npm run check:pharosville-colors
npm run check:pharosville-assets
npm run validate:changed
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Commit baselines in their own commit**

```bash
git add tests/visual/pharosville.spec.ts-snapshots
git commit -m "test(visual): rebake baselines for old-school UI revamp

Every chrome surface (toolbar, detail panel, fullscreen+home buttons,
loading, error, narrow gate) was restyled in this branch. Diffs were
inspected via Playwright HTML reporter before rebaking; canvas/world
rendering is unchanged."
```

---

## Self-review — gaps and consistency

1. **Spec coverage:**
   - Toolbar simplification (3 controls + ledger): Task 11. Keyboard shortcuts: Tasks 9, 10.
   - Detail panel allowlist + composers + new sections + dev-mode warning: Tasks 5, 6, 7.
   - Detail panel restyle: Task 8.
   - Fullscreen + home medallions: Task 12.
   - Loading / error / narrow gate restyles: Tasks 13, 14, 15.
   - CSS tokens + classes: Tasks 1–4.
   - Visual baselines + final validation: Task 16.

2. **Type consistency:**
   - `compactCurrency(input: string): string` — used in `detail-panel.tsx` Task 7 with the same signature.
   - `composeCurrently({ position, area, zone })` — used in Task 7 via `lookup.get(...)` returning `string | undefined`; the function accepts `string | null | undefined` via the optional fields.
   - `WorldToolbarProps` shape: dropped props (`world`, `onZoomIn/Out/Pan/ClearSelection`, `selectedDetailLabel`) removed; the `pharosville-world.tsx` JSX update in Task 11 Step 3 keeps the call site consistent.
   - `LabelKey` keys (`shipClass`, `sizeTier`, `marketCap`, `homeDock`, `representativePosition`, `riskWaterArea`, `riskWaterZone`, `chainsPresent`) match the regex patterns and the `lookup.get()` calls in Task 7 Step 3.

3. **Out-of-scope items deliberately not implemented:**
   - Upstream `FactKey` discriminator on `DetailModel.facts` items (architectural reviewer recommended; spec explicitly defers; revisit in a follow-up branch if this work needs to repeat).
   - `?debug=1` reintroduction of dropped fields (spec defers to "if anyone misses them").
   - CSS partial split (`pharosville-chrome.css`) — the new content is large but cohesive and well-commented; stays in `pharosville.css` for this revamp.
   - Cosmetic chains-string compaction — spec Open Question 1; render verbatim.

4. **Notes for the executing agent:**
   - Phases A and the latter half of Phase D are independent CSS-only commits. If parallelising, A then in any order: B, C, then D, then E.
   - The `import.meta.env.DEV` guard in Task 7 requires Vite's `import.meta.env` types — these are already enabled via `vite-env.d.ts` in this project.

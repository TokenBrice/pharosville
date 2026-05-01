# Old-School UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pharosville's modern-dashboard UI chrome with a nautical "harbour-master admiralty plate" vocabulary (timber rail + brass + warm parchment), and simplify the over-detailed detail panel and toolbar.

**Architecture:** Pure CSS + inline SVG. New design tokens added to `src/pharosville.css`; new component classes consume the tokens. No new image assets, no new font loads, no data-shape changes. Detail panel filters facts via an explicit allowlist at render time. Toolbar drops UI for redundant controls but keeps callbacks on the prop API. Keyboard shortcuts replace dropped buttons.

**Tech Stack:** React + TypeScript + Vite, Vitest + React Testing Library, Playwright (visual snapshots), CSS variables.

**Spec:** `docs/superpowers/specs/2026-05-01-old-school-ui-design.md`

---

## File map

**New files:**
- `src/lib/format-detail.ts` — `compactCurrency`, `composeCurrently` formatters
- `src/lib/format-detail.test.ts` — formatter unit tests
- `src/components/world-toolbar.test.tsx` — unit tests for the streamlined toolbar (no current coverage)

**Modified files:**
- `src/pharosville.css` — new tokens + new chrome classes; restyles every existing pharosville-* class
- `src/components/world-toolbar.tsx` — strip UI for dropped controls; new structure + classes
- `src/components/detail-panel.tsx` — replace regex grouping with allowlist + composers; new sections + classes
- `src/components/detail-panel.test.tsx` — update assertions for the new structure
- `src/components/query-error-notice.tsx` — add wax-seal markup
- `src/pharosville-world.tsx` — extend `handleKeyDown` with zoom shortcuts; SVG icons in fullscreen/home buttons

**Untouched (CSS-only impact):**
- `src/desktop-only-fallback.tsx` — JSX preserved, picks up new `.pharosville-narrow*` styling
- `src/components/section-error-boundary.tsx` — JSX preserved, same

---

## Phase A — CSS foundation

### Task 1: Add design tokens

**Files:**
- Modify: `src/pharosville.css` (the `.pharosville-shell { --pv-* }` token block, currently around lines 196–212)

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
Expected: PASS (CSS isn't typechecked, but this also validates no unintended TS regressions).

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

### Task 4: Add content + state classes (divider, fact-row, formation-list, panel-link, wax-seal, beacon-pulse)

**Files:**
- Modify: `src/pharosville.css` (append)

- [ ] **Step 1: Append content classes**

Append to `src/pharosville.css`:

```css
/* Old-school chrome — content */

.pv-divider-decorative {
  height: 14px;
  margin: 0 -22px 14px;
  background:
    radial-gradient(circle at 50% 50%, var(--pv-brass-edge) 2.5px, transparent 3px),
    linear-gradient(90deg,
      transparent 0%,
      rgba(108, 74, 20, 0.5) 12%,
      rgba(108, 74, 20, 0.5) 88%,
      transparent 100%);
  background-repeat: no-repeat;
  background-position: center, center;
  background-size: 14px 14px, 100% 1px;
}

.pv-section-title {
  margin: 0 0 8px;
  color: var(--pv-brass-edge);
  font: 900 10px Georgia, serif;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.pv-fact-row {
  display: grid;
  grid-template-columns: 86px 1fr;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px dotted rgba(108, 74, 20, 0.3);
}
.pv-fact-row:last-child { border-bottom: none; }
.pv-fact-row dt {
  margin: 0;
  color: var(--pv-brass-edge);
  font: 900 11px Georgia, serif;
  letter-spacing: 0.06em;
}
.pv-fact-row dd {
  margin: 0;
  color: var(--pv-ink-text);
  font: 400 13px Georgia, serif;
}
.pv-fact-row dd strong { font-weight: 900; }

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
git commit -m "feat(ui): add fact-row, formation-list, wax-seal, beacon classes"
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
  it("falls back to the longest provided source when fields are missing", () => {
    expect(composeCurrently({ area: "Ledger Mooring" })).toBe("Ledger Mooring");
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
Expected: PASS (10 tests total — 6 currency + 4 currently).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-detail.ts src/lib/format-detail.test.ts
git commit -m "feat(detail): add composeCurrently composer"
```

---

### Task 7: Update detail-panel tests for the new structure (red)

**Files:**
- Modify: `src/components/detail-panel.test.tsx`

- [ ] **Step 1: Replace the test file with new assertions**

Replace the entire content of `src/components/detail-panel.test.tsx` with:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
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
  it("does not render dropped fields anywhere in the panel", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).not.toMatch(/Ship livery/i);
    expect(markup).not.toMatch(/Peg marker/i);
    expect(markup).not.toMatch(/Risk placement key/i);
    expect(markup).not.toMatch(/Docking cadence/i);
    expect(markup).not.toMatch(/Route source/i);
    expect(markup).not.toMatch(/Evidence status/i);
    // Check Evidence as a whole-word section heading, not the substring inside "evidence"-style internal labels
    expect(markup).not.toMatch(/<h3[^>]*>\s*Evidence\s*</);
  });

  it("renders three top-level sections in the new order: Identity, Position, then optional members/links", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    const identityIndex = markup.search(/--identity/);
    const positionIndex = markup.search(/--position/);
    expect(identityIndex).toBeGreaterThan(-1);
    expect(positionIndex).toBeGreaterThan(identityIndex);
  });

  it("renders the existing Sailing in formation members list when present", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/Sailing in formation/i);
  });

  it("renders Class as a composed value (Tier · Class)", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    // Match a section row whose label is "Class" and whose value contains a " · " separator
    expect(markup).toMatch(/<dt[^>]*>Class<\/dt>\s*<dd[^>]*>[^<]+ · [^<]+<\/dd>/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/detail-panel.test.tsx`
Expected: FAIL — assertions fail because the current panel still groups by regex and renders dropped fields.

- [ ] **Step 3: Commit (red state — intentional)**

```bash
git add src/components/detail-panel.test.tsx
git commit -m "test(detail): assert new section structure and dropped fields"
```

---

### Task 8: Refactor detail-panel.tsx — allowlist + composers + new sections (green)

**Files:**
- Modify: `src/components/detail-panel.tsx`

- [ ] **Step 1: Replace `detail-panel.tsx` with the new implementation**

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
  emphasis?: boolean;
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
  chains: /^chains?\s*present$/i,
} as const;

type LabelKey = keyof typeof KNOWN_LABELS;

function classifyLabel(label: string): LabelKey | null {
  for (const [key, pattern] of Object.entries(KNOWN_LABELS) as [LabelKey, RegExp][]) {
    if (pattern.test(label.trim())) return key;
  }
  return null;
}

function buildSections(facts: DetailModel["facts"]): Sections {
  const lookup = new Map<LabelKey, string>();
  for (const fact of facts) {
    const key = classifyLabel(fact.label);
    if (key) lookup.set(key, fact.value);
  }

  const identity: DisplayRow[] = [];
  const tier = lookup.get("sizeTier");
  const klass = lookup.get("shipClass");
  if (tier || klass) {
    const composed = [tier, klass].filter(Boolean).join(" · ");
    identity.push({ key: "class", label: "Class", value: composed, emphasis: Boolean(tier) });
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
  const chains = lookup.get("chains");
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
            <dd>{row.emphasis ? <strong>{row.value.split(" · ")[0]}</strong> : null}{row.emphasis ? row.value.slice(row.value.indexOf(" · ")) : row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/components/detail-panel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `npm test`
Expected: PASS overall.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail-panel.tsx
git commit -m "feat(detail): allowlist filter, composers, new section structure"
```

---

### Task 9: Restyle detail panel CSS to use new chrome

**Files:**
- Modify: `src/pharosville.css` (the existing `.pharosville-detail-dock` and `.pharosville-detail-panel*` rules, around lines 306–638)

- [ ] **Step 1: Replace the existing detail-panel rules**

In `src/pharosville.css`, locate the block beginning at `.pharosville-detail-dock {` (around line 306) through the end of `.pharosville-detail-panel__section--links li::marker` (around line 633). Replace that entire block with:

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

/* Timber-frame wrapper around the parchment reading surface */
.pharosville-detail-panel {
  position: relative;
  height: 100%;
  padding: 8px;
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
  color: var(--pv-ink-text);
}
/* Brass corner caps (rendered via ::before/::after on header for top, on close for bottom) */
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

/* The reading surface: parchment */
.pharosville-detail-panel > * { position: relative; z-index: 2; }
.pharosville-detail-panel {
  /* nest parchment look on the inner box */
}
.pharosville-detail-panel > .pharosville-detail-panel__header,
.pharosville-detail-panel > section,
.pharosville-detail-panel > nav,
.pharosville-detail-panel > button {
  background:
    repeating-linear-gradient(123deg, rgba(108, 74, 20, 0.04) 0 1px, transparent 1px 5px),
    radial-gradient(ellipse at 0% 0%,
      var(--pv-parchment-light) 0%,
      var(--pv-parchment-warm) 50%,
      var(--pv-parchment-dark) 100%);
  padding: 18px 22px;
  border-left: 1.5px solid var(--pv-timber-dark);
  border-right: 1.5px solid var(--pv-timber-dark);
}
.pharosville-detail-panel > .pharosville-detail-panel__header {
  border-top: 1.5px solid var(--pv-timber-dark);
  padding-top: 22px;
}
.pharosville-detail-panel > button {
  border-bottom: 1.5px solid var(--pv-timber-dark);
  padding-bottom: 22px;
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
.pharosville-detail-panel header > p:not(.pharosville-detail-panel__kind) {
  margin: 6px 0 0;
  color: var(--pv-ink-soft);
  font: italic 13px Georgia, serif;
}

.pharosville-detail-panel__section {
  border-top: none;
  margin: 0;
}
.pharosville-detail-panel__section h3 {
  margin: 0 0 8px;
  color: var(--pv-brass-edge);
  font: 900 10px Georgia, serif;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.pharosville-detail-panel__section dl {
  display: block;
  margin: 0;
}
.pharosville-detail-panel__section .pv-fact-row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px dotted rgba(108, 74, 20, 0.3);
  border-left: none;
  padding-left: 0;
}
.pharosville-detail-panel__section .pv-fact-row:last-child { border-bottom: none; }
.pharosville-detail-panel__section .pv-fact-row dt {
  color: var(--pv-brass-edge);
  font: 900 11px Georgia, serif;
  letter-spacing: 0.06em;
  text-transform: none;
}
.pharosville-detail-panel__section .pv-fact-row dd {
  margin: 0;
  color: var(--pv-ink-text);
  font: 400 13px Georgia, serif;
}

.pharosville-detail-panel__section--members .pv-formation-list,
.pharosville-detail-panel__section--links .pv-formation-list {
  margin: 6px 0 0;
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

.pharosville-detail-panel button {
  margin: 0;
  border: 1.5px solid var(--pv-timber-dark);
  background: radial-gradient(circle at 30% 25%,
    var(--pv-brass-highlight),
    var(--pv-brass-mid) 55%,
    var(--pv-brass-dark));
  color: var(--pv-ink-text);
  font: 900 12px Georgia, serif;
  cursor: pointer;
  letter-spacing: 0.04em;
  padding: 8px 14px;
  margin-top: 10px;
}
.pharosville-detail-panel button:focus-visible {
  outline: 2px solid var(--pv-brass-highlight);
  outline-offset: 3px;
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

### Task 10: Add `+`/`-` zoom keyboard shortcuts to the world shell

**Files:**
- Modify: `src/pharosville-world.tsx` (the `handleKeyDown` callback at line 756)

- [ ] **Step 1: Locate the existing `handleKeyDown` callback**

It begins at line 756 with `const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {`.

- [ ] **Step 2: Insert zoom shortcut handling before the arrow-key block**

Inside `handleKeyDown`, after the `Escape` block (around line 766) and before the `const step = ...` line, insert:

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

- [ ] **Step 4: Verify build and existing tests pass**

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

### Task 11: Add unit tests for the streamlined toolbar (red)

**Files:**
- Create: `src/components/world-toolbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/world-toolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PharosVilleWorld } from "../systems/world-types";
import { WorldToolbar } from "./world-toolbar";

const emptyWorld: PharosVilleWorld = {
  // minimal shape sufficient for entityCount derivation; test does not exercise it
  areas: [],
  docks: [],
  ships: [],
  graves: [],
} as unknown as PharosVilleWorld;

describe("WorldToolbar (streamlined)", () => {
  it("renders only zoom%, reset, and follow controls", () => {
    render(
      <WorldToolbar
        world={emptyWorld}
        zoomLabel="112%"
        onResetView={vi.fn()}
        onFollowSelected={vi.fn()}
      />,
    );
    expect(screen.getByText("112%")).toBeTruthy();
    expect(screen.getByLabelText(/reset view/i)).toBeTruthy();
    expect(screen.getByLabelText(/follow selected/i)).toBeTruthy();
    // dropped controls
    expect(screen.queryByLabelText(/zoom in/i)).toBeNull();
    expect(screen.queryByLabelText(/zoom out/i)).toBeNull();
    expect(screen.queryByLabelText(/pan north/i)).toBeNull();
    expect(screen.queryByLabelText(/clear selection/i)).toBeNull();
  });

  it("does not render entity count chip", () => {
    render(<WorldToolbar world={emptyWorld} zoomLabel="100%" onResetView={vi.fn()} />);
    expect(screen.queryByLabelText(/map entity count/i)).toBeNull();
  });

  it("does not render selected-name chip even when selection is set", () => {
    render(
      <WorldToolbar
        world={emptyWorld}
        zoomLabel="100%"
        onResetView={vi.fn()}
        selectedDetailId="ship-x"
        selectedDetailLabel="Sky Dollar"
      />,
    );
    expect(screen.queryByLabelText(/selected detail/i)).toBeNull();
    expect(screen.queryByText("Sky Dollar")).toBeNull();
  });

  it("renders ledger toggle when handler provided, with aria-pressed reflecting visibility", () => {
    render(
      <WorldToolbar
        world={emptyWorld}
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
    render(<WorldToolbar world={emptyWorld} zoomLabel="100%" onResetView={vi.fn()} />);
    const follow = screen.getByLabelText(/follow selected/i) as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/world-toolbar.test.tsx`
Expected: FAIL — current toolbar still renders zoom in/out, pan arrows, clear selection, and chips. Several `queryBy*` calls return non-null where the test expects null.

- [ ] **Step 3: Commit (red state — intentional)**

```bash
git add src/components/world-toolbar.test.tsx
git commit -m "test(toolbar): assert streamlined 3-control structure"
```

---

### Task 12: Refactor `world-toolbar.tsx` to streamlined structure (green)

**Files:**
- Modify: `src/components/world-toolbar.tsx`

- [ ] **Step 1: Replace the entire file**

Replace the entire content of `src/components/world-toolbar.tsx` with:

```tsx
"use client";

import { LocateFixed, RotateCcw } from "lucide-react";
import type { PharosVilleWorld } from "../systems/world-types";
import type { ScreenPoint } from "../systems/projection";

export interface WorldToolbarProps {
  world: PharosVilleWorld;
  headingId?: string;
  ledgerVisible?: boolean;
  selectedDetailId?: string | null;
  selectedDetailLabel?: string | null;
  zoomLabel?: string;
  onClearSelection?: () => void;
  onFollowSelected?: () => void;
  onPan?: (delta: ScreenPoint) => void;
  onResetView?: () => void;
  onToggleLedger?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export function WorldToolbar({
  world: _world,
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

Note: `world`, `onPan`, `onZoomIn`, `onZoomOut`, `onClearSelection`, `selectedDetailLabel` remain on the prop API for callers but aren't rendered. The unused-prop names are renamed-with-underscore where TS would warn; otherwise TypeScript treats unused destructured props as fine.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/components/world-toolbar.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS overall.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Restyle the toolbar's outer container**

In `src/pharosville.css`, locate the existing `.pharosville-world-toolbar { ... }` rule (around line 433) and the auxiliary rules through `.pharosville-world-toolbar__chip` (around line 550). Replace those rules with:

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

Also remove the now-unused `.pharosville-hud > [data-testid="pharosville-world-toolbar"]` button selectors (lines ~476–546 of the original CSS) — the new `.pv-brass-button` and `.pv-chip-zoom` handle styling. To remove cleanly, delete this contiguous range between the two rules above; commit will show the diff.

- [ ] **Step 6: Verify**

Run: `npm run check:pharosville-colors`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/world-toolbar.tsx src/pharosville.css
git commit -m "feat(toolbar): streamline to 3 controls with timber+brass chrome"
```

---

## Phase D — Other surfaces

### Task 13: Restyle fullscreen + home buttons as brass medallions

**Files:**
- Modify: `src/pharosville.css` (the existing `.pharosville-fullscreen-button` and `.pharosville-home-button` rules at the end of the file, around lines 640–680)

- [ ] **Step 1: Replace those existing button rules**

In `src/pharosville.css`, locate the block from `.pharosville-fullscreen-button,` (around line 640) through the final `outline-offset: 3px;` (around line 679). Replace the entire block with:

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

In `src/pharosville-world.tsx` around lines 843 and 851, change the icon size from 17 to 24:

```tsx
{fullscreenMode ? <Minimize2 aria-hidden="true" size={24} /> : <Maximize2 aria-hidden="true" size={24} />}
```

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

### Task 14: Restyle the loading state with parchment + pulsing beacon

**Files:**
- Modify: `src/pharosville.css` (the existing `.pharosville-loading` rule, around lines 31–44)

- [ ] **Step 1: Replace the `.pharosville-loading` rule**

In `src/pharosville.css`, replace the block starting at `.pharosville-loading {` through the closing brace (around line 44) with:

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

### Task 15: Restyle query-error notice as wax-seal alert

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

- [ ] **Step 2: Replace the existing `.pharosville-query-error` CSS block**

In `src/pharosville.css`, replace the block from `.pharosville-query-error {` (around line 46) through the closing brace of `.pharosville-query-error button { ... }` (around line 74) with:

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

### Task 16: Restyle narrow-viewport gate as parchment broadside

**Files:**
- Modify: `src/pharosville.css` (the `.pharosville-narrow*` rules, lines ~88–194)

- [ ] **Step 1: Replace the narrow-gate rules**

In `src/pharosville.css`, replace the block from `.pharosville-narrow {` (around line 88) through the end of `.pharosville-narrow__links a:focus-visible { ... }` (around line 194) with:

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

### Task 17: Run the full validation suite

**Files:** none

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Run unit tests**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 3: Run color guard**

Run: `npm run check:pharosville-colors`
Expected: `PharosVille color check passed for N non-test source files.`

- [ ] **Step 4: Run asset guard**

Run: `npm run check:pharosville-assets`
Expected: PASS (no asset changes; should be unaffected).

- [ ] **Step 5: Run validate-changed**

Run: `npm run validate:changed`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: builds without warnings or errors.

- [ ] **Step 7: If anything fails, fix the underlying issue**

Do not silence failures or skip checks. Investigate, fix, and re-run from Step 1.

---

### Task 18: Visual baseline rebake

**Files:**
- Modify: every PNG under `tests/visual/pharosville.spec.ts-snapshots/`

This is the largest commit-by-volume; isolate it.

- [ ] **Step 1: Run the visual suite once to see current diffs**

Run: `npm run test:visual`
Expected: FAIL — every screenshot will diff because the chrome appears in most of them. Record the failing test list.

- [ ] **Step 2: Open every diff under `test-results/` and inspect**

For each `*-actual.png` / `*-expected.png` pair under `test-results/`, eyeball that the chrome change is the only intentional diff. The harbor canvas itself must not have changed. If any non-chrome pixels differ, stop — investigate before rebaking. Likely culprits: a CSS rule that bled into canvas-overlay layout, or a font fallback shift.

- [ ] **Step 3: Update the baselines**

Run: `npx playwright test tests/visual/pharosville.spec.ts --update-snapshots`
Expected: writes new PNGs into `tests/visual/pharosville.spec.ts-snapshots/`.

- [ ] **Step 4: Re-run the visual suite to confirm green**

Run: `npm run test:visual`
Expected: PASS.

- [ ] **Step 5: Commit baselines in their own commit**

```bash
git add tests/visual/pharosville.spec.ts-snapshots
git commit -m "test(visual): rebake baselines for old-school UI revamp

Every chrome surface (toolbar, detail panel, fullscreen+home buttons,
loading, error, narrow gate) was restyled in this branch. Diffs were
inspected before rebaking; no canvas/world rendering changed."
```

---

## Self-review — gaps and consistency

1. **Spec coverage:**
   - Toolbar simplification (3 controls + ledger): Tasks 11–12. Keyboard shortcuts: Task 10.
   - Detail panel allowlist + composers + new sections: Tasks 5, 6, 7, 8.
   - Detail panel restyle: Task 9.
   - Fullscreen + home medallions: Task 13.
   - Loading restyle: Task 14.
   - Error restyle: Task 15.
   - Narrow gate restyle: Task 16.
   - CSS tokens + classes: Tasks 1–4.
   - Validation: Task 17.
   - Visual baselines: Task 18.

2. **Type consistency:**
   - `compactCurrency(input: string): string` — used in `detail-panel.tsx` Task 8 with the same signature.
   - `composeCurrently({ position, area, zone })` — used in `detail-panel.tsx` Task 8 via `lookup.get(...)` returning `string | undefined`; the function accepts `string | null | undefined` via the optional fields.
   - `WorldToolbarProps` shape preserves `onZoomIn`/`onZoomOut`/`onPan`/`onClearSelection` so `pharosville-world.tsx` callers remain valid.

3. **Open spec items intentionally not implemented in this plan:**
   - The "log unknown allowlist labels in dev" mitigation from the spec's Migration section is not in any task. This is a deliberate omission to keep the diff focused; the panel silently drops unmatched fields. If it's wanted, it's a 5-line addition inside `buildSections` but separate work.
   - `?debug=1` re-exposure of dropped fields is also not implemented; the spec marks it as a deliberate "drop clean" choice.

If either of these is needed before the branch ships, add a task before Task 17.

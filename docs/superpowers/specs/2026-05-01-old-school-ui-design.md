# Pharosville · Old-School UI · Design Spec

**Status:** approved (brainstorming session 2026-05-01)
**Owners:** PharosVille
**Scope:** all in-app UI chrome (toolbar, detail panel, corner action buttons, loading, error, narrow gate)
**Out of scope:** canvas/world rendering, sprite assets, font loads, backend data shape

## Why

The current UI vocabulary reads as a modern dashboard: thin 1px borders, slightly rounded corners, sparse layout on dark teal. Sat next to a richly detailed isometric pixel-art harbor (lighthouse, ships, docks), the chrome looks like a different application stapled on top.

Two problems compound the visual mismatch:

1. **Detail panel surfaces internal metadata.** Fields like `Ship livery`, `Peg marker`, `Risk placement key`, `Docking cadence`, `Route source`, `Evidence status`, `Evidence` describe sprite-spec data and pipeline citations — useful to developers, noise to users. The current panel renders ~17 rows; only ~7 are user-facing.
2. **Toolbar duplicates affordances already in the canvas.** Pan arrows duplicate drag-to-pan; zoom +/− duplicate the wheel/pinch; clear-selection duplicates the panel's own close button. 14 controls vs. ~3 needed.

This spec covers a coordinated visual revamp **and** content/control simplification, treated as one deliverable.

## Design direction (settled in brainstorming)

- **Theme**: nautical / age-of-sail "harbour-master admiralty plate" — translates the user's medieval-fantasy inspirations (Diablo, Disgaea, classic WoW) into the project's actual setting (Pharosville, lighthouse, ships, docks).
- **Weight**: medium (full nautical kit — timber rail, brass corner brackets, polished-brass button caps — but not maximum-ornament).
- **Detail panel treatment**: warm parchment reading surface inside a timber+brass frame.
- **Scope**: all UI surfaces.
- **Rendering**: smooth/painted (not pixel-art chrome). The chrome and the canvas are deliberately two languages: the canvas is pixel-art harbor, the chrome is painted brass-and-timber.

## Principles

1. **One vocabulary across all surfaces.** Toolbar, detail panel, corner medallions, loading, error, narrow gate share the same components and tokens. No surface looks orphaned.
2. **Thematic fit, not theme cosplay.** "Harbour master's admiralty plate" is the era — nautical, not generic medieval-fantasy.
3. **Old-school weight, modern legibility.** Body text stays on Georgia at present sizes. Section labels get small-caps treatment; we are *not* adopting a pixel font, blackletter face, or low-contrast sepia for body copy.
4. **Information design first.** The visual revamp is paired with content cuts. Fewer fields and controls is the point, not a side-effect.
5. **CSS-first, no new assets.** Pure CSS gradients, repeating patterns, multi-layer borders, inline SVG for icons. No image assets, no PixelLab work, no font loads. Asset-pipeline complexity is deferred to a later, optional pass.

## In-scope surfaces

| # | Surface | Source | New treatment |
|---|---------|--------|---------------|
| 1 | World toolbar | `src/components/world-toolbar.tsx` | streamlined to 3 controls in a timber rail |
| 2 | Detail panel | `src/components/detail-panel.tsx` | parchment inside timber+brass frame, ~7 fields |
| 3 | Fullscreen button | `src/pharosville-world.tsx` (`.pharosville-fullscreen-button`) | round brass medallion |
| 4 | Home button | `src/pharosville-world.tsx` (`.pharosville-home-button`) | round brass medallion |
| 5 | Loading state | `.pharosville-loading` in `src/pharosville.css` | parchment card with pulsing beacon |
| 6 | Query error notice | `src/components/query-error-notice.tsx` (and `.pharosville-query-error`) | timber bar with wax-seal alert |
| 7 | Narrow viewport gate | `.pharosville-narrow*` in `src/pharosville.css` | parchment broadside with brass medallion beacon |
| 8 | Accessibility ledger | `src/components/accessibility-ledger.tsx` | inherits the new tokens; no structural change |

## Visual tokens (additions to existing `--pv-*`)

```css
/* Timber */
--pv-timber-light: #6b4628;
--pv-timber: #3a2614;
--pv-timber-dark: #2a1a0c;
--pv-timber-edge: #1a0e08;

/* Brass */
--pv-brass-highlight: #f8e5b2;
--pv-brass: #d8b87a;
--pv-brass-mid: #c9a866;
--pv-brass-dark: #8a6531;
--pv-brass-edge: #6c4a14;

/* Parchment */
--pv-parchment-light: #f8e5b2;
--pv-parchment: #e2c98c;
--pv-parchment-dark: #c9a866;

/* Ink */
--pv-ink: #1a0e08;
--pv-ink-soft: #4b3414;

/* Seal (errors) */
--pv-seal-red: #a8321a;
--pv-seal-red-dark: #5a1a0a;
```

The existing `--pv-gold/--pv-parchment/--pv-teal/--pv-ruby` etc. tokens stay (canvas overlays still use them). New tokens layer on top; the chrome consumes only the new tokens.

## Component classes

- `.pv-timber` — wood-grain rail (linear plank lines + base gradient + inset highlights).
- `.pv-corner-brass` with `.tl/.tr/.bl/.br` — small brass corner cap.
- `.pv-corner-action` — large 56px round brass medallion (fullscreen, home).
- `.pv-brass-button` — embossed brass-cap action button (toolbar).
- `.pv-chip-zoom` — recessed wood chip displaying the zoom percentage.
- `.pv-parchment` — parchment reading surface (fibre grain + aged glow + inner stains).
- `.pv-divider-decorative` — center-bullet horizontal rule for parchment sections.
- `.pv-fact-row` — label/value pair with dotted separator.
- `.pv-formation-list` — left-rule list for sailing formation.
- `.pv-panel-link` — embossed brass link button.
- `.pv-wax-seal` — circular embossed seal medallion (error banner, narrow gate icon).
- `.pv-beacon-pulse` — pulsing beacon for the loading screen.

All classes live in `src/pharosville.css`. None require new image assets.

## Toolbar simplification

### Final controls

| Element | Type | Visible when |
|---------|------|--------------|
| Zoom % | `<output>` (read-only) | always |
| Reset view | `<button>` | always (disabled if `!onResetView`) |
| Follow selected | `<button>` | always (disabled if `!onFollowSelected` OR no selection) |
| Ledger toggle | `<button aria-pressed>` | only when `onToggleLedger` is provided |

### Removed UI (callbacks retained on props)

- Zoom in / zoom out buttons
- Pan ↑ → ↓ ← buttons
- Clear-selection button
- Entity-count chip (`{n} entities`)
- Selected-name chip (`Sky Dollar` etc.)

`WorldToolbarProps` keeps `onZoomIn`, `onZoomOut`, `onPan`, `onClearSelection` so external integrations and keyboard handlers can still call them. Only the rendered UI changes.

### Keyboard parity (replaces dropped buttons)

Add to the world shell (`src/pharosville-world.tsx` or wherever it currently mounts the canvas key listeners):

| Keystroke | Action | Wired via |
|-----------|--------|-----------|
| `+` / `=` | zoom in | `onZoomIn` |
| `-` / `_` | zoom out | `onZoomOut` |
| Arrow keys | pan | `onPan` (32px steps) |
| `Esc` | clear selection | `onClearSelection` |

Existing wheel/pinch zoom and drag-pan continue to work unchanged.

## Detail panel simplification

### Section structure

1. **Header** — kind ("SHIP"), name, italic tagline (`detail.summary`).
2. **Identity** — Class (composed from `Size tier` + `Ship class`), Market cap, Home dock.
3. **Position** — Currently (composed from `Representative position` / `Risk water area` / `Risk water zone`), Chains.
4. **Members** — rendered with the new `formation-list` style. The heading is whatever the upstream model provides via `detail.membersHeading` (typically "Sailing in formation" for ships, "Members" for areas, etc.). Section omitted when `detail.members` is empty.
5. **Links** — only when non-empty. Existing `detail.links` shape is unchanged; styled with `.pv-panel-link`.

`detail.members` and `detail.links` data shapes are unchanged. Only `detail.facts` is filtered + composed at render time.

### Field allowlist (rendering filter)

The current `groupFacts()` regex-based bucketing is replaced with an explicit allowlist:

```ts
type FactKey = "shipClass" | "sizeTier" | "marketCap" | "homeDock" | "currently" | "chains";

const FIELD_DISPLAY: Record<FactKey, { section: "identity" | "position"; label: string; format?: (v: string) => string }> = {
  shipClass:  { section: "identity", label: "Class" },     // composed with sizeTier
  sizeTier:   { section: "identity", label: "Class" },
  marketCap:  { section: "identity", label: "Market cap", format: compactCurrency },
  homeDock:   { section: "identity", label: "Home dock" },
  currently:  { section: "position", label: "Currently" }, // composed
  chains:     { section: "position", label: "Chains" },
};
```

A small label-normalizer maps incoming `fact.label` strings (e.g., `"Ship class"`, `"SHIP CLASS"`, `"shipClass"`) to a `FactKey`. Unknown labels are silently dropped from the panel. Composition (Class, Currently) resolves at render time before the row is emitted.

### Dropped fields

Excluded by allowlist (no UI; data still flows through the model unchanged):

- `Ship livery`
- `Peg marker`
- `Risk placement key`
- `Docking cadence`
- `Route source`
- `Evidence status`
- `Evidence`
- Any other label not in the allowlist

These are not destructive removals from the data model — only from the rendered view.

### Formatters

Two small pure utilities, both in `src/lib/format-detail.ts` (new file):

- `compactCurrency("$8,438,840,589") → "$8.4B"` (handles `$x,xxx,xxx`, `$x.xM`, `$x.xB`, `$x.xT`).
- `composeCurrently({ position, area, zone })` → `"Calm Anchorage (idle)"` when zone is calm, otherwise `"Razormane Watch"` etc.

Composition logic is deterministic; bad input falls back to the longest non-empty source string verbatim.

### Display vs. data

The data model (`DetailModel.facts`) is unchanged. We do not edit `world-types.ts`, the world build, or any upstream system. The simplification is entirely a rendering-layer change in `detail-panel.tsx` plus `format-detail.ts`.

## Surface-by-surface specifics

### Loading (`.pharosville-loading`)
- Background: parchment fibre grain + warm radial glow (replaces dark teal).
- Center: 56px `.pv-beacon-pulse` (pulsing brass beacon) above an italic message.
- Kicker: small-caps "PHAROS BEACON" above the message.
- Wrapper: small timber rail with brass corner caps.

### Error notice (`.pharosville-query-error`)
- Becomes a horizontal timber bar with a wax-seal medallion at the leading edge (32px, `--pv-seal-red`).
- Message text in `--pv-parchment-light` (legible on timber).
- Retry button restyled to `.pv-panel-link` (brass-cap).

### Narrow gate (`.pharosville-narrow*`)
- Background swaps to parchment with low-contrast woodgrain border.
- The current `__beacon` swatch becomes a `.pv-corner-action`-style brass medallion.
- All copy preserved verbatim.
- Existing `__links` use `.pv-panel-link` styling.

### Fullscreen / home buttons
- Square teal buttons → 56px round `.pv-corner-action` brass medallions.
- Inline SVG icons (24px, stroke `--pv-ink`):
  - Fullscreen: four corner brackets (stroke).
  - Home: pitched-roof house silhouette (stroke).

## States

- **Hover**: brass elements brighten one step (`--pv-brass-highlight`); timber lifts `1px`.
- **Focus-visible**: 2px outline `--pv-brass-highlight`, 3px offset (preserves current pattern).
- **Disabled**: `opacity: 0.46`, no transform, `cursor: not-allowed`.
- **`aria-pressed="true"`**: brass-cap with a darker recessed center; the ledger toggle is the canonical example.

## Accessibility

- `role="toolbar"` and `aria-labelledby` retained.
- All `<button>`s keep `aria-label` and `title` (current behaviour).
- All decorative SVG icons get `aria-hidden="true"`.
- Detail panel `aria-live="polite"` retained.
- `.sr-only` heading retained.
- Color contrast (verify in implementation):
  - Ink-on-parchment body: `#1a0e08` on `#e2c98c` ≈ 12:1 (passes AA & AAA).
  - Section labels: `#6c4a14` on `#e2c98c` ≈ 5.8:1 (passes AA).
  - Parchment-light on timber-dark: `#f8e5b2` on `#2a1a0c` ≈ 11:1 (passes AAA).
- Keyboard parity for every dropped button (see Toolbar section).

## Testing impact

| Area | Action |
|------|--------|
| `src/components/detail-panel.test.tsx` | Update for new section structure, allowlist, formatters, dropped fields. |
| `src/components/world-toolbar.test.tsx` (new) | Add unit tests for the streamlined toolbar (no current coverage). |
| Keyboard handler test (new) | Cover `+`/`-`/arrow/`Esc` shortcuts on the world shell. |
| `tests/visual/pharosville.spec.ts-snapshots/*.png` | All 12 baselines need rebake. Bake in a single dedicated commit; inspect every diff before accepting (per `AGENTS.md`). |
| `npm run check:pharosville-colors` | No allowlist update needed — script bans specific patterns (purple drift, orb/bokeh, checkerboard) that the new palette doesn't trigger. |
| `npm run check:pharosville-assets` | Unchanged — no new assets. |
| `npm run typecheck` / `npm test` / `npm run build` | Must stay green. |

## Migration / risk

- **Visual baselines churn**: every baseline diffs because the chrome appears in most screenshots. Strategy: implementation lands first, baselines rebake in a dedicated follow-up commit on the same branch with screenshot review. Commit message must call out the rebake.
- **External callers**: `WorldToolbarProps.onZoomIn/onZoomOut/onPan/onClearSelection` callbacks remain on the prop API (no breaking change). Only the rendered UI changes.
- **Silent drop of unknown facts**: the allowlist filter could hide a future useful field. Mitigation: in dev mode (`import.meta.env.DEV`) log unmatched labels to console once per render so a regression is visible during development.
- **Data composition fragility**: the "Currently" composer depends on multiple fact labels being present. If only one source is provided, fall back to that single string verbatim rather than emitting a malformed composition.

## Acceptance criteria

- [ ] Toolbar renders 3 controls (4 with ledger). No pan-arrows, no clear-selection, no entity chip, no name chip.
- [ ] Keyboard: arrow keys pan; `+`/`-` zoom; `Esc` clears selection.
- [ ] Detail panel renders ≤7 fact rows total (incl. composed Class/Currently), three sections (Identity, Position, Sailing in formation), plus optional Links/Members.
- [ ] Dropped fields (`Ship livery`, `Peg marker`, `Risk placement key`, `Docking cadence`, `Route source`, `Evidence status`, `Evidence`) do not render.
- [ ] Fullscreen + home buttons render as 56px round brass medallions.
- [ ] Loading, error, and narrow-gate screens use the parchment+timber+brass vocabulary consistent with the toolbar.
- [ ] All a11y attributes (roles, labels, focus-visible) preserved or improved.
- [ ] `npm run typecheck`, `npm test`, `npm run build`, `npm run check:pharosville-colors`, `npm run check:pharosville-assets` green.
- [ ] Visual baselines rebaked, with screenshot review noted in commit message.

## Open Questions

1. **Chains formatter**: parsing the upstream "7 positive chain deployments: Ethereum 94%, Base 1.7%, Optimism 1.2%, +4 more" string is brittle. Recommendation: render verbatim if normalization isn't trivial; cosmetic compaction is a stretch goal.
2. **`?debug=1` reintroduction**: dropped fields will be gone unless re-exposed. Recommendation: drop clean, add a debug pane only if anyone misses them.
3. **Pixel-rendering of brass**: chrome is smooth, canvas is pixel-art. If the visual mismatch reads as "two languages" in production, a follow-up can quantize the brass via a CSS pixel-snap filter — out of scope here.

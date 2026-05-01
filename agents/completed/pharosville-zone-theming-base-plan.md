# PharosVille Zone-Theming Base Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the DEWS zone abstraction so future zone-specific visual variants are a one-table edit, not a renderer-wide refactor. After this plan, re-skinning a zone (CALM / WATCH / ALERT / WARNING / DANGER / LEDGER) means editing one entry in a `ZONE_THEMES` table — not three files.

**Architecture:** Three small consolidations + one renderer parameterization, gated by Vitest unit tests and Playwright visual snapshots. No user-visible change at any phase boundary.

**Tech Stack:** TypeScript, Vitest, Playwright visual regression. Existing repo conventions in `CLAUDE.md`, `AGENTS.md`, `docs/pharosville/CURRENT.md`, `docs/pharosville/VISUAL_INVARIANTS.md`.

**Out of scope (intentional):**
- Designing the new per-zone visuals. This plan only prepares the surface.
- Decoupling `ShipRiskPlacement ↔ ShipWaterZone`. The 1:1 mapping is load-bearing for motion.
- Reordering `terrainKindAt` zone predicates. Order is correct; just under-documented.

---

## Synthesis Of The Three Audits

### Geometry (`world-layout.ts`, `risk-water-areas.ts`) — mostly healthy
- Single source of truth holds: tile → zone is decided ONLY by predicates in `world-layout.ts:terrainKindAt` (lines 131–138). Metadata (label, anchors, scatter) lives ONLY in `risk-water-areas.ts:RISK_WATER_AREAS`.
- Predicate order is `Danger → Warning → Alert → Ledger → Watch → Calm`; earlier checks claim overlapping tiles. Correct, but inconsistently commented.
- Magic numbers / duplication:
  - Threshold `1.63` (Alert outer ring) appears in `isAlertChannel:203` AND as a guard in `isSoutheastWatchShelf:236`. If Alert's outer threshold changes, the guard silently breaks.
  - The south-basin rectangle `x∈[16,43] && y≥45` is duplicated between `isWatchBreakwater:227` and `isCalmAnchorage:240`.
  - East-corner ellipse center `(55, 0)`, SE-corner `(55, 55)`, radius `14` are scattered.
- Adding a zone today requires touching ≥6 places (predicate, `terrainKindAt` branch, `RISK_WATER_AREAS`, `DEWS_AREA_PLACEMENTS`, `TerrainKind`, `ShipRiskPlacement`, `DewsAreaBand`). No type-level exhaustiveness check.

### Rendering (`terrain.ts`, `water-labels.ts`, `palette.ts`) — NOT ready for theming
- Colors are mostly centralized in `palette.ts:WATER_TERRAIN_STYLES` (one entry per terrain kind: `base`/`inner`/`wave`/`accent`/`texture` kind).
- Procedural texture is hardcoded: 6 zones each have a 40–100 line `drawXxxTexture` function (`drawCalmWaterTexture` … `drawDangerStraitTexture`) selected by a switch on `style.texture` in `drawWaterTerrainTexture` (terrain.ts:253–304). Stroke widths, wave amplitudes, motion frequencies, accent alphas are inline literals — not in the theme.
- Label rendering hardcodes appearance (water-labels.ts:87–148):
  - Font `700 ${fontSize}px Georgia` (line 103)
  - Outline `rgba(5, 10, 17, 0.7)` (line 131)
  - Fill `rgba(238, 218, 169, 0.78)` (line 134)
  - Plaque `rgba(74, 50, 27, 0.5)` / `rgba(15, 10, 7, 0.76)` (line 116)
  - Only the per-band accent color comes from `DEWS_AREA_LABEL_COLORS`.
- Result: re-theming a zone today touches palette.ts (colors), the dedicated draw function (texture/motion), and water-labels.ts (label appearance). Three files per zone.

### Integration (motion, detail, accessibility) — load-bearing 1:1 contracts
- `ShipRiskPlacement ↔ ShipWaterZone` is 1:1 and consumed by:
  - `OPEN_WATER_PATROL_WAYPOINTS` (motion-config.ts:27)
  - `ZONE_DWELL` (motion-config.ts:16)
  - `ZONE_ROUGHNESS` (ship-pose.ts:8)
  - `waterZoneTerrainPenalty` (motion-water.ts:272)
- Detail facts and accessibility-ledger rows read `node.band`, `node.riskZone`, `node.riskPlacement`, `node.label` (detail-model.ts:158–177; accessibility-ledger.tsx:62–92).
- Hit testing: areas get `+10000` priority (hit-testing.ts:27); printed labels' rectangles win over overlapping ships (VISUAL_INVARIANTS.md:65).
- Refactor risk: contained to `palette.ts`, `terrain.ts`, `water-labels.ts`. As long as we preserve the existing enums and 1:1 mappings, this plan touches no integration contracts.

### Verdict
- Geometry is healthy enough — just needs naming.
- Renderer is not — needs consolidation before zone-specific visuals are tractable.
- Integration is rock solid — risk is contained to palette + renderer.

---

## Phase 0: Capture The Pre-Refactor Baseline

**Files:** none modified; baseline only.

- [ ] **Step 0.1: Verify the working tree is clean and on `main` at the latest commit.**

  Run:
  ```bash
  git status --short
  git log --oneline -1
  ```
  Expected: empty status; latest commit is the alert-strip → watch absorption commit (`241053e Absorb alert east strip into Watch Breakwater`) or later.

- [ ] **Step 0.2: Capture baseline visual snapshots.**

  Run:
  ```bash
  npm run test:visual -- --update-snapshots
  ```
  Expected: snapshots regenerate; tests pass; `git status --short` shows updated `tests/visual/pharosville.spec.ts-snapshots/*.png` files.

- [ ] **Step 0.3: Commit baseline snapshots.**

  ```bash
  git add tests/visual/pharosville.spec.ts-snapshots
  git commit -m "$(cat <<'EOF'
  Refresh visual baselines before zone-theming refactor

  Captures the current pixel state of every visual lane so the upcoming
  zone-theming refactor can prove it is a no-op for users.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

  *If `git status` shows no changed snapshots, skip this commit — the existing baselines are already current.*

- [ ] **Step 0.4: Run the full pre-refactor gate to confirm green starting point.**

  Run:
  ```bash
  npm run typecheck && npm test && npm run check:pharosville-assets && npm run check:pharosville-colors
  ```
  Expected: all four commands exit 0. If any fail, stop and fix before proceeding.

---

## Phase 1: Name The Zone Geometry Constants

**Goal:** Name the *cross-predicate-shared* constants that today couple zones to one another (the Alert ring threshold reused as a guard, the south-basin rectangle duplicated between Watch and Calm) and the east-corner ellipse parameters. Pure refactor; no behavior change.

**Out of scope for this phase (intentional):** zone-private constants that don't drift across predicates — the Calm leftBasin ellipse `(8.2, 31.0, 15.0, 20.5)` and threshold `1.08`, the lighthouse-clearance rectangle, the Ledger-mooring rectangle, the deep-sea-shelf threshold `8`, the top-shelf gap, and the `nearIslandEdge = 0.82` value. These are single-use and naming them adds noise without removing risk.

**Files:**
- Modify: `src/systems/world-layout.ts`
- Existing tests already cover this: `src/systems/world-layout.test.ts`, `src/systems/risk-water-areas.test.ts`.

- [ ] **Step 1.1: Add a named-constants block at the top of `world-layout.ts`.**

  Insert immediately after `export const ISLAND_PERIPHERY_TILE_DISTANCE = 4;` (around line 16):

  ```ts
  // Zone geometry constants.
  // East-corner Alert/Warning/Danger rings share a single ellipse anchored at
  // the (55, 0) corner. Thresholds slice that ellipse into three concentric
  // bands; isSoutheastWatchShelf re-uses ALERT_RING_OUTER as a guard so it never
  // claims tiles that should be Alert.
  const EAST_CORNER_CENTER = { x: 55, y: 0 } as const;
  const SOUTHEAST_CORNER_CENTER = { x: 55, y: 55 } as const;
  const CORNER_RADIUS = 14;
  const DANGER_RING_OUTER = 0.26;
  const WARNING_RING_OUTER = 0.66;
  const ALERT_RING_INNER = 0.66;
  const ALERT_RING_OUTER = 1.63;

  // South breakwater basin shared between Watch Breakwater (primary) and the
  // Calm Anchorage southBay fallback.
  const SOUTH_BASIN_BOUNDS = { minX: 16, maxX: 43, minY: 45 } as const;

  // Compact upper Alert ring covers the eastern shelf above this threshold;
  // tiles beyond it on the eastern edge belong to Watch Breakwater.
  const EAST_SHELF_MIN_X = 45;
  const EAST_SHELF_MIN_Y = 18;
  const SOUTH_SHELF_MIN_Y = 38;
  const SOUTH_SHELF_DIAGONAL_THRESHOLD = 78;
  ```

- [ ] **Step 1.2: Replace literals in `eastCornerRiskValue` and the three east-corner predicates.**

  In `eastCornerRiskValue`:
  ```ts
  function eastCornerRiskValue(x: number, y: number): number {
    return ellipseValue(x, y, EAST_CORNER_CENTER.x, EAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS);
  }
  ```

  In `isAlertChannel`:
  ```ts
  function isAlertChannel(x: number, y: number): boolean {
    const value = eastCornerRiskValue(x, y);
    return value >= ALERT_RING_INNER && value < ALERT_RING_OUTER;
  }
  ```

  In `isWarningShoals`:
  ```ts
  function isWarningShoals(x: number, y: number): boolean {
    const value = eastCornerRiskValue(x, y);
    return value >= DANGER_RING_OUTER && value < WARNING_RING_OUTER;
  }
  ```

  In `isDangerStrait`:
  ```ts
  function isDangerStrait(x: number, y: number): boolean {
    return eastCornerRiskValue(x, y) < DANGER_RING_OUTER;
  }
  ```

- [ ] **Step 1.3: Replace literals in `isWatchBreakwater` and `isSoutheastWatchShelf`.**

  ```ts
  function isWatchBreakwater(x: number, y: number): boolean {
    // South breakwater basin plus the southeast/east shelf below the Alert ring.
    const southBasin =
      x >= SOUTH_BASIN_BOUNDS.minX && x <= SOUTH_BASIN_BOUNDS.maxX && y >= SOUTH_BASIN_BOUNDS.minY;
    const eastBridge =
      isSoutheastWatchShelf(x, y)
      && ellipseValue(x, y, SOUTHEAST_CORNER_CENTER.x, SOUTHEAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS) >= 1.0;
    const southeastBasin =
      ellipseValue(x, y, SOUTHEAST_CORNER_CENTER.x, SOUTHEAST_CORNER_CENTER.y, CORNER_RADIUS, CORNER_RADIUS) < 1.0;
    return southBasin || eastBridge || southeastBasin;
  }

  function isSoutheastWatchShelf(x: number, y: number): boolean {
    if (x < 28 || x > MAX_TILE_X || y < EAST_SHELF_MIN_Y || y > MAX_TILE_Y) return false;
    // Stay clear of the east-corner Alert/Warning/Danger ring stack.
    if (eastCornerRiskValue(x, y) < ALERT_RING_OUTER) return false;
    const easternShelf = x >= EAST_SHELF_MIN_X;
    const southernShelf =
      y >= SOUTH_SHELF_MIN_Y && x + y >= SOUTH_SHELF_DIAGONAL_THRESHOLD;
    return easternShelf || southernShelf;
  }
  ```

- [ ] **Step 1.4: Replace the duplicated south-basin literal in `isCalmAnchorage`.**

  ```ts
  function isCalmAnchorage(x: number, y: number): boolean {
    const leftEdge = x <= 15 && y >= 10 && y <= MAX_TILE_Y;
    const leftBasin = ellipseValue(x, y, 8.2, 31.0, 15.0, 20.5) < 1.08 && x <= 22 && y >= 10;
    const southBay =
      x >= SOUTH_BASIN_BOUNDS.minX && x <= SOUTH_BASIN_BOUNDS.maxX && y >= SOUTH_BASIN_BOUNDS.minY;
    return leftEdge || leftBasin || southBay;
  }
  ```

- [ ] **Step 1.5: Run the focused zone tests.**

  Run:
  ```bash
  npx vitest run src/systems/world-layout.test.ts src/systems/risk-water-areas.test.ts src/systems/pharosville-world.test.ts
  ```
  Expected: 100% pass. The constants must produce identical predicate outputs.

- [ ] **Step 1.6: Commit.**

  ```bash
  git add src/systems/world-layout.ts
  git commit -m "$(cat <<'EOF'
  Name DEWS zone geometry constants

  Pull east-corner ellipse center, radius, ring thresholds, south-basin
  bounds, and east/south-shelf bounds out of the predicate bodies into a
  single named-constants block at the top of world-layout.ts. Replaces
  the duplicated southBasin literal between Watch and Calm and the
  ALERT_RING_OUTER guard on isSoutheastWatchShelf so future Alert range
  edits propagate.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase 2: Build The Unified `ZONE_THEMES` Table

**Goal:** One table indexed by terrain kind that bundles every per-zone visual parameter the renderer reads — colors, motion params, label styling. Initially mirrors current values exactly so phases 3 and 4 are pure threading.

**Files:**
- Modify: `src/systems/palette.ts`
- Test: `src/systems/palette.test.ts`

- [ ] **Step 2.1: Define the `ZoneVisualTheme` interface in `palette.ts`.**

  Add after `WATER_TERRAIN_STYLES` (around line 141):

  ```ts
  export interface ZoneLabelTheme {
    /** Per-zone accent color for plaque pennants and underline. */
    accent: string;
    /** Outline drawn behind the title text. */
    outline: string;
    /** Title fill color. */
    fill: string;
    /** Plaque highlight color (top edge). */
    plaqueLight: string;
    /** Plaque shadow color (body). */
    plaqueDark: string;
  }

  export interface ZoneMotionTheme {
    /** Multiplier on procedural texture wave amplitude (1 = current). */
    amplitudeScale: number;
    /** Multiplier on accent stroke alpha (1 = current). */
    strokeAlphaScale: number;
  }

  export interface ZoneVisualTheme extends WaterTerrainStyle {
    label: ZoneLabelTheme;
    motion: ZoneMotionTheme;
  }
  ```

- [ ] **Step 2.2: Define the shared default label theme constants.**

  Add after the interface block:

  ```ts
  // Defaults preserved from drawCartographicWaterLabel pre-refactor.
  const DEFAULT_LABEL_OUTLINE = "rgba(5, 10, 17, 0.7)";
  const DEFAULT_LABEL_FILL = "rgba(238, 218, 169, 0.78)";
  const DEFAULT_LABEL_PLAQUE_LIGHT = "rgba(74, 50, 27, 0.5)";
  const DEFAULT_LABEL_PLAQUE_DARK = "rgba(15, 10, 7, 0.76)";
  const DEFAULT_MOTION: ZoneMotionTheme = { amplitudeScale: 1, strokeAlphaScale: 1 };

  function defaultLabelTheme(accent: string): ZoneLabelTheme {
    return {
      accent,
      outline: DEFAULT_LABEL_OUTLINE,
      fill: DEFAULT_LABEL_FILL,
      plaqueLight: DEFAULT_LABEL_PLAQUE_LIGHT,
      plaqueDark: DEFAULT_LABEL_PLAQUE_DARK,
    };
  }
  ```

- [ ] **Step 2.3: Build the `ZONE_THEMES` table.**

  Add after the defaults:

  ```ts
  export const ZONE_THEMES: Record<keyof typeof WATER_TERRAIN_STYLES, ZoneVisualTheme> = {
    "alert-water": {
      ...WATER_TERRAIN_STYLES["alert-water"],
      label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.ALERT),
      motion: DEFAULT_MOTION,
    },
    "calm-water": {
      ...WATER_TERRAIN_STYLES["calm-water"],
      label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.CALM),
      motion: DEFAULT_MOTION,
    },
    "deep-water": {
      ...WATER_TERRAIN_STYLES["deep-water"],
      label: defaultLabelTheme("#d8b56a"), // matches riskWaterAreaColor fallback
      motion: DEFAULT_MOTION,
    },
    "harbor-water": {
      ...WATER_TERRAIN_STYLES["harbor-water"],
      label: defaultLabelTheme("#d8b56a"),
      motion: DEFAULT_MOTION,
    },
    "ledger-water": {
      ...WATER_TERRAIN_STYLES["ledger-water"],
      label: defaultLabelTheme("#d9b974"), // matches riskWaterAreaColor for "ledger"
      motion: DEFAULT_MOTION,
    },
    "storm-water": {
      ...WATER_TERRAIN_STYLES["storm-water"],
      label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.DANGER),
      motion: DEFAULT_MOTION,
    },
    "watch-water": {
      ...WATER_TERRAIN_STYLES["watch-water"],
      label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.WATCH),
      motion: DEFAULT_MOTION,
    },
    "warning-water": {
      ...WATER_TERRAIN_STYLES["warning-water"],
      label: defaultLabelTheme(DEWS_AREA_LABEL_COLORS.WARNING),
      motion: DEFAULT_MOTION,
    },
    water: {
      ...WATER_TERRAIN_STYLES.water,
      label: defaultLabelTheme("#d8b56a"),
      motion: DEFAULT_MOTION,
    },
  };

  export function zoneThemeForTerrain(kind: string): ZoneVisualTheme {
    return ZONE_THEMES[kind as keyof typeof ZONE_THEMES] ?? ZONE_THEMES.water;
  }
  ```

- [ ] **Step 2.4: Write a failing exhaustiveness test in `palette.test.ts`.**

  Append at the end of the existing `describe`:

  ```ts
  it("provides a complete ZoneVisualTheme for every water terrain", () => {
    const waterKinds = Object.keys(WATER_TERRAIN_STYLES);
    expect(Object.keys(ZONE_THEMES).sort()).toEqual(waterKinds.sort());
    for (const kind of waterKinds) {
      const theme = ZONE_THEMES[kind as keyof typeof ZONE_THEMES];
      expect(theme.base).toBe(WATER_TERRAIN_STYLES[kind as keyof typeof WATER_TERRAIN_STYLES].base);
      expect(theme.label.outline).toBeTruthy();
      expect(theme.label.fill).toBeTruthy();
      expect(theme.label.plaqueLight).toBeTruthy();
      expect(theme.label.plaqueDark).toBeTruthy();
      expect(theme.label.accent).toMatch(/^#|^rgba/);
      expect(theme.motion.amplitudeScale).toBeGreaterThan(0);
      expect(theme.motion.strokeAlphaScale).toBeGreaterThan(0);
    }
  });
  ```

  Add the import at the top:
  ```ts
  import { WATER_TERRAIN_STYLES, ZONE_THEMES } from "./palette";
  ```

- [ ] **Step 2.5: Run the test.**

  Run:
  ```bash
  npx vitest run src/systems/palette.test.ts
  ```
  Expected: PASS. The table mirrors `WATER_TERRAIN_STYLES` exactly with default labels and motion.

- [ ] **Step 2.6: Run the full unit suite to confirm no regression.**

  Run:
  ```bash
  npm test
  ```
  Expected: all green.

- [ ] **Step 2.7: Commit.**

  ```bash
  git add src/systems/palette.ts src/systems/palette.test.ts
  git commit -m "$(cat <<'EOF'
  Introduce ZONE_THEMES table mirroring current visuals

  Adds ZoneVisualTheme bundling water-terrain colors with label styling
  and motion scalars. ZONE_THEMES preserves every existing pixel value
  exactly; future zone-specific visuals can edit one entry instead of
  three files.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase 3: Parameterize The Six Procedural Water-Texture Functions

**Goal:** Each `drawXxxTexture` reads motion amplitudes and accent stroke alphas from the theme. No pixel change because every theme defaults to `amplitudeScale: 1, strokeAlphaScale: 1`.

**Files:**
- Modify: `src/renderer/layers/terrain.ts`
- Visual gate: `tests/visual/pharosville.spec.ts` snapshots.

**Note:** Each draw function in `terrain.ts:299–631` already receives the `WaterTerrainStyle`. The change is to (a) thread the full `ZoneVisualTheme` through and (b) multiply `motion.amplitudeScale` into wave amplitudes and `motion.strokeAlphaScale` into stroke alphas. We do this one zone at a time, testing visual snapshots between each.

- [ ] **Step 3.1: Update `drawWaterTerrainTexture` to dispatch on theme, not just style.**

  In `terrain.ts:253–304`, change the function signature:

  ```ts
  function drawWaterTerrainTexture(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    zoom: number,
    theme: ZoneVisualTheme,
    tileX: number,
    tileY: number,
    motion: PharosVilleCanvasMotion,
  ) {
    // ...existing dispatch on theme.texture, passing `theme` instead of `style`...
  }
  ```

  Update the import at the top of `terrain.ts`:
  ```ts
  import { WATER_TERRAIN_STYLES, ZONE_THEMES, zoneThemeForTerrain, type WaterTerrainStyle, type ZoneVisualTheme } from "../../systems/palette";
  ```

  Update both callers in `terrain.ts:175–227`:
  ```ts
  // In drawWaterTileBase at terrain.ts:188
  const theme = zoneThemeForTerrain(value);
  drawDiamond(ctx, x, y, width, height, theme.base);
  // ...
  drawWaterDepthOverlay(ctx, x, y, zoom, width, height, tileX, tileY, theme.inner);

  // In drawWaterTileOverlay at terrain.ts:207
  const theme = zoneThemeForTerrain(value);
  drawWaterTerrainTexture(ctx, x, y, zoom, theme, tileX, tileY, motion);
  // existing wave + accent stroke code uses theme.wave / theme.accent
  ```

- [ ] **Step 3.2: Update each of the six `drawXxxTexture` signatures to accept `ZoneVisualTheme`.**

  For each function in `terrain.ts:299, 373, 428, 467, 506, 549`, change the last parameter from `style: WaterTerrainStyle` to `theme: ZoneVisualTheme`. Inside each body, replace `style.` reads with `theme.`. The compiler enforces this — no other change required yet.

- [ ] **Step 3.3: Run the type check and unit tests.**

  Run:
  ```bash
  npm run typecheck && npm test
  ```
  Expected: all green. The threading is structural; behavior is identical.

- [ ] **Step 3.4: Run the visual snapshot suite.**

  Run:
  ```bash
  npm run test:visual
  ```
  Expected: all snapshots match (no diffs). If any lane drifts, stop and inspect — there's a hidden read of `style.` that wasn't migrated.

- [ ] **Step 3.5: Commit Step 3.1–3.4 as one structural commit.**

  ```bash
  git add src/renderer/layers/terrain.ts
  git commit -m "$(cat <<'EOF'
  Thread ZoneVisualTheme through procedural water textures

  Replaces the WaterTerrainStyle parameter on the six procedural water-
  texture draw functions with the broader ZoneVisualTheme so future zone-
  specific motion and accent variations are configurable from one table.
  No pixel change: every theme keeps motion.amplitudeScale=1 and
  strokeAlphaScale=1.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 3.6: Apply `motion.amplitudeScale` to the EXACT wave amplitude literals listed below.**

  Only the literals in this table are wrapped with `* theme.motion.amplitudeScale`. Do NOT scale: DC offsets, frequency multipliers, pixel drift (anything multiplied by `* zoom`), or `Math.max(...)` floors — those control different visual properties and the byte-identical guarantee depends on leaving them alone.

  | File / Function | Line | Before | After |
  |---|---|---|---|
  | `drawCalmWaterTexture` | 381 | `... * 0.025` (the amplitude on the `Math.sin` only) | `... * 0.025 * theme.motion.amplitudeScale` |
  | `drawAlertChannelTexture` | 436 | `... * 0.04` (sine amplitude on `pulse`) | `... * 0.04 * theme.motion.amplitudeScale` |
  | `drawWatchWaterTexture` | 475 | `... * 0.04` (sine amplitude on `crosswind`) | `... * 0.04 * theme.motion.amplitudeScale` |
  | `drawWarningShoalTexture` | 514 | `... * 0.05` (sine amplitude on `chop`) | `... * 0.05 * theme.motion.amplitudeScale` |
  | `drawDangerStraitTexture` | 557 | `... * 0.08` (sine amplitude on `whitecap`) | `... * 0.08 * theme.motion.amplitudeScale` |
  | `drawLedgerWaterTexture` | 307 | `... * 0.04` (sine amplitude on `ledgerPulse`) | `... * 0.04 * theme.motion.amplitudeScale` |

  These are the only amplitudes. The DC offsets that sit *next to* them on the same line (`0.11`, `0.14`, `0.18`, `0.15`) MUST stay literal; scaling them would collapse the static reflection alpha when a future variant uses `amplitudeScale: 0`.

  Concrete diff for `drawCalmWaterTexture:381`:
  ```ts
  // Before:
  const hush = motion.reducedMotion ? 0.13 : 0.11 + Math.sin(motion.timeSeconds * 0.48 + tileX * 0.19 + tileY * 0.13) * 0.025;
  // After:
  const hush = motion.reducedMotion
    ? 0.13
    : 0.11 + Math.sin(motion.timeSeconds * 0.48 + tileX * 0.19 + tileY * 0.13) * 0.025 * theme.motion.amplitudeScale;
  ```

- [ ] **Step 3.7: Apply `motion.strokeAlphaScale` to the EXACT motion-coupled stroke alphas listed below.**

  Only the alpha values inside `Math.max(floor, motionVar)` patterns are wrapped — these tie stroke visibility to the live motion variable and are the only alphas a future zone variant would meaningfully tune. Static reflection alphas, foam-call alphas, and depth-sounding alphas stay literal so `strokeAlphaScale: 1` remains byte-identical AND `strokeAlphaScale: 0.5` doesn't accidentally fade reflections.

  | File / Function | Line | Before | After |
  |---|---|---|---|
  | `drawCalmWaterTexture` | 383 | `Math.max(0.08, hush)` | `Math.max(0.08, hush) * theme.motion.strokeAlphaScale` |
  | `drawAlertChannelTexture` | 439, 449 | `Math.max(0.12, pulse - 0.03)` and `Math.max(0.16, pulse)` | wrap each with `* theme.motion.strokeAlphaScale` |
  | `drawWatchWaterTexture` | 487 | `Math.max(0.12, crosswind)` | `Math.max(0.12, crosswind) * theme.motion.strokeAlphaScale` |
  | `drawWarningShoalTexture` | 528 | `Math.max(0.16, chop)` | `Math.max(0.16, chop) * theme.motion.strokeAlphaScale` |
  | `drawDangerStraitTexture` | 567 | `Math.max(0.14, whitecap)` | `Math.max(0.14, whitecap) * theme.motion.strokeAlphaScale` |
  | `drawLedgerWaterTexture` | 323 | `Math.max(0.12, ledgerPulse)` | `Math.max(0.12, ledgerPulse) * theme.motion.strokeAlphaScale` |

  The static-alpha calls (`drawDepthSounding(..., 0.18)`, `drawBreakwaterFoam(..., 0.22)`, `drawCurrentWakeMark(..., 0.28)`, the `withAlpha(style.accent, 0.16)` dashed line in Watch, etc.) stay untouched.

- [ ] **Step 3.8: Re-run the visual gate.**

  Run:
  ```bash
  npm run test:visual
  ```
  Expected: identical output (since `amplitudeScale = strokeAlphaScale = 1` for every zone).

- [ ] **Step 3.9: Commit.**

  ```bash
  git add src/renderer/layers/terrain.ts
  git commit -m "$(cat <<'EOF'
  Parameterize wave amplitude and accent alpha by theme

  Wave amplitudes and accent stroke alphas in the six procedural water-
  texture functions now scale by theme.motion.amplitudeScale and
  strokeAlphaScale respectively. With every zone's scalars at 1.0 the
  rendered output is byte-identical, but a future zone variant can dial
  motion intensity per zone from the ZONE_THEMES table.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase 4: Theme The Cartographic Labels

**Goal:** `drawCartographicWaterLabel` reads outline, fill, plaque colors from the theme. No pixel change because each zone's label theme defaults to the legacy hardcoded values.

**Files:**
- Modify: `src/renderer/layers/water-labels.ts`
- Visual gate: `tests/visual/pharosville.spec.ts` snapshots.

- [ ] **Step 4.1: Extend the input contract for `drawCartographicWaterLabel`.**

  In `water-labels.ts:87`, replace the input type:

  ```ts
  function drawCartographicWaterLabel(input: {
    accent: string;
    align: "center" | "left" | "right";
    ctx: CanvasRenderingContext2D;
    fill: string;
    label: string;
    maxWidth: number;
    outline: string;
    plaqueDark: string;
    plaqueLight: string;
    rotation: number;
    x: number;
    y: number;
    zoom: number;
  }) {
    const { accent, align, ctx, fill, label, maxWidth, outline, plaqueDark, plaqueLight, rotation, x, y, zoom } = input;
    // ...existing setup unchanged...
  ```

  Replace the four hardcoded constants in the body:
  - Line 116: `"rgba(74, 50, 27, 0.5)"` → `plaqueLight`; `"rgba(15, 10, 7, 0.76)"` → `plaqueDark`
  - Line 131: `"rgba(5, 10, 17, 0.7)"` → `outline`
  - Line 134: `"rgba(238, 218, 169, 0.78)"` → `fill`

- [ ] **Step 4.2: Update `drawWaterAreaLabels` to look up the theme via the area's terrain field.**

  ⚠️ **DO NOT** use string concat `\`${area.riskZone}-water\`` — Danger Strait has `riskZone: "danger"` but `terrain: "storm-water"` (`risk-water-areas.ts:142–145`). The concatenation produces `"danger-water"`, which is missing from `ZONE_THEMES` and silently falls back to generic water, fading the Danger Strait label. Look up the terrain via the metadata table instead.

  Replace the `drawCartographicWaterLabel` call at `water-labels.ts:45–55`:

  ```ts
  for (const area of world.areas) {
    const placement = cachedAreaLabelPlacement(area);
    const p = tileToScreen(placement.anchorTile, camera);
    const terrainKind = RISK_WATER_AREAS[area.riskPlacement].terrain;
    const theme = zoneThemeForTerrain(terrainKind);
    drawCartographicWaterLabel({
      accent: theme.label.accent,
      align: placement.align,
      ctx,
      fill: theme.label.fill,
      label: area.label,
      maxWidth: placement.maxWidth,
      outline: theme.label.outline,
      plaqueDark: theme.label.plaqueDark,
      plaqueLight: theme.label.plaqueLight,
      rotation: placement.rotation,
      x: p.x,
      y: p.y,
      zoom: camera.zoom,
    });
  }
  ```

  Add the imports at the top:
  ```ts
  import { zoneThemeForTerrain } from "../../systems/palette";
  import { RISK_WATER_AREAS } from "../../systems/risk-water-areas";
  ```

  This routes through the canonical placement → terrain mapping that already exists in `RISK_WATER_AREAS`. All six placements round-trip to a valid `ZONE_THEMES` key (verified: `safe-harbor → calm-water`, `breakwater-edge → watch-water`, `harbor-mouth-watch → alert-water`, `outer-rough-water → warning-water`, `storm-shelf → storm-water`, `ledger-mooring → ledger-water`).

- [ ] **Step 4.3: Update the `drawEthereumHarborSigns` callsite to pass defaults.**

  At `water-labels.ts:64`, the harbor-sign labels are not zoned — they use the existing accent and need the same default outline/fill/plaque. Inline the default constants here so the function signature change doesn't break:

  ```ts
  drawCartographicWaterLabel({
    accent: sign.accent,
    align: "center",
    ctx,
    fill: "rgba(238, 218, 169, 0.78)",
    label: sign.label,
    maxWidth: sign.maxWidth,
    outline: "rgba(5, 10, 17, 0.7)",
    plaqueDark: "rgba(15, 10, 7, 0.76)",
    plaqueLight: "rgba(74, 50, 27, 0.5)",
    rotation: sign.rotation,
    x: p.x,
    y: p.y,
    zoom: camera.zoom,
  });
  ```

  *Optional follow-up (out of this plan):* extract these literals into a shared `DEFAULT_PLAQUE_THEME` constant inside `water-labels.ts` if they're referenced more than twice.

- [ ] **Step 4.4: Drop the now-unused helpers.**

  In `water-labels.ts`, the `dewsAreaColor` and `riskWaterAreaColor` helpers (lines 78–85) are now reachable only via the new theme path. Verify with grep:

  ```bash
  grep -n "dewsAreaColor\|riskWaterAreaColor" src/
  ```

  If no callers remain outside `water-labels.ts`, delete both functions. Otherwise leave them.

- [ ] **Step 4.5: Run the type check and unit tests.**

  Run:
  ```bash
  npm run typecheck && npm test
  ```
  Expected: green.

- [ ] **Step 4.6: Run the visual snapshot suite.**

  Run:
  ```bash
  npm run test:visual
  ```
  Expected: byte-identical snapshots. Any drift means a hardcoded constant was missed or the riskZone-to-terrain mapping is off.

- [ ] **Step 4.7: Commit.**

  ```bash
  git add src/renderer/layers/water-labels.ts
  git commit -m "$(cat <<'EOF'
  Theme cartographic water labels

  drawCartographicWaterLabel now sources its outline, fill, and plaque
  colors from the per-zone ZoneLabelTheme instead of hardcoded literals.
  All existing zones inherit defaults that preserve the current pixel
  output. The Ethereum Harbor sign uses inline defaults since it is not
  a DEWS zone.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Phase 5: Type-Level Zone Exhaustiveness And Docs

**Goal:** Make it a compiler error to add a new `ShipWaterZone` without a theme entry, anchor list, or motion config. Document the new theming surface so future zone-visual work knows where to land.

**Files:**
- Modify: `src/systems/palette.ts`, `src/systems/motion-config.ts`, `src/renderer/layers/ship-pose.ts`
- Modify: `docs/pharosville/CURRENT.md`, `docs/pharosville/VISUAL_INVARIANTS.md`
- Test: `src/systems/palette.test.ts`

- [ ] **Step 5.1: Type `ZONE_THEMES` to require every `TerrainKind` water variant.**

  In `palette.ts`, replace the type annotation on `ZONE_THEMES`:

  ```ts
  export const ZONE_THEMES = {
    "alert-water": { /* ... */ },
    /* ... */
  } as const satisfies Record<keyof typeof WATER_TERRAIN_STYLES, ZoneVisualTheme>;
  ```

  This makes the `Record<...>` constraint enforce coverage at compile time.

- [ ] **Step 5.2: First, define `SHIP_WATER_ZONES` as a runtime tuple in `world-types.ts`.**

  Replace the existing `export type ShipWaterZone = "calm" | "watch" | ...` declaration in `src/systems/world-types.ts` (around line 128) with the tuple-derived form so the runtime list and compile-time type stay in sync:

  ```ts
  export const SHIP_WATER_ZONES = ["calm", "watch", "alert", "warning", "danger", "ledger"] as const;
  export type ShipWaterZone = typeof SHIP_WATER_ZONES[number];
  ```

  Run `npm run typecheck` to confirm no callers broke. Expected: green.

- [ ] **Step 5.3: Add a `ShipWaterZone`-keyed exhaustiveness test.**

  In `palette.test.ts`:

  ```ts
  import { SHIP_WATER_ZONES } from "./world-types";
  import { RISK_WATER_AREAS, DEWS_AREA_PLACEMENTS, riskWaterAreaForPlacement, waterZoneForPlacement } from "./risk-water-areas";
  import { ZONE_THEMES } from "./palette";

  it("every ShipWaterZone has a matching ZONE_THEMES entry via RISK_WATER_AREAS", () => {
    for (const zone of SHIP_WATER_ZONES) {
      // Find the placement whose motionZone is this zone.
      const placement = (Object.values(RISK_WATER_AREAS).find((area) => area.motionZone === zone));
      expect(placement, zone).toBeDefined();
      const terrainKind = placement!.terrain;
      expect(ZONE_THEMES[terrainKind], `${zone} → ${terrainKind}`).toBeDefined();
    }
  });
  ```

  This test catches the `danger → storm-water` asymmetry: it routes via the canonical placement → terrain map, exactly like the renderer does after Step 4.2.

- [ ] **Step 5.4: Run the test to verify it passes.**

  Run:
  ```bash
  npx vitest run src/systems/palette.test.ts
  ```
  Expected: PASS.

- [ ] **Step 5.5: Tighten `OPEN_WATER_PATROL_WAYPOINTS` and `ZONE_DWELL` types.**

  In `motion-config.ts`, add `satisfies` clauses:

  ```ts
  export const OPEN_WATER_PATROL_WAYPOINTS = {
    /* ... */
  } as const satisfies Record<ShipWaterZone, readonly { x: number; y: number }[]>;

  export const ZONE_DWELL = {
    /* ... */
  } as const satisfies Record<ShipWaterZone, { dockDwell: number; riskDwell: number; transitShare: number }>;
  ```

  Repeat for `ZONE_ROUGHNESS` in `src/renderer/layers/ship-pose.ts`. The compiler will catch any future zone added to `SHIP_WATER_ZONES` without a corresponding entry.

- [ ] **Step 5.6: Update `docs/pharosville/CURRENT.md` to document the new theming surface.**

  Append to the "Current Visual Model" section:

  ```markdown
  - Per-zone visual styling lives in a single `ZONE_THEMES` table in
    `src/systems/palette.ts`. Each entry bundles base/inner/wave/accent
    colors, the procedural texture kind, label outline/fill/plaque
    colors, and motion amplitude/stroke-alpha scalars. Adjusting a
    zone's look is a one-table edit; visual snapshot tests gate any
    pixel drift. The 1:1 `ShipWaterZone ↔ ZONE_THEMES` invariant is
    enforced by `src/systems/palette.test.ts`.
  ```

- [ ] **Step 5.7: Update `docs/pharosville/VISUAL_INVARIANTS.md`.**

  Add to the "Renderer Rules" section:

  ```markdown
  - Per-zone water styling (base color, depth overlay, wave/accent strokes,
    procedural texture, label appearance, motion intensity) is sourced
    from `ZONE_THEMES` in `src/systems/palette.ts`. Renderers must not
    re-introduce hardcoded zone color literals; pull from the theme.
  ```

- [ ] **Step 5.8: Run the full validation gate.**

  Run:
  ```bash
  npm run typecheck && npm test && npm run check:pharosville-assets && npm run check:pharosville-colors && npm run build && npm run test:visual
  ```
  Expected: all green.

- [ ] **Step 5.9: Commit.**

  ```bash
  git add src/systems/palette.ts src/systems/palette.test.ts src/systems/world-types.ts src/systems/motion-config.ts src/renderer/layers/ship-pose.ts docs/pharosville/CURRENT.md docs/pharosville/VISUAL_INVARIANTS.md
  git commit -m "$(cat <<'EOF'
  Enforce ShipWaterZone exhaustiveness and document ZONE_THEMES

  Promotes the existing zone enum to a runtime tuple, types ZONE_THEMES /
  OPEN_WATER_PATROL_WAYPOINTS / ZONE_DWELL / ZONE_ROUGHNESS as
  Record<ShipWaterZone, ...>, and adds a Vitest assertion that every
  zone has a matching theme. Adds CURRENT.md and VISUAL_INVARIANTS.md
  notes pointing future zone-visual work at the single theming surface.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Done Criteria

- All five phases committed; `git log` shows five new focused commits since the plan-start baseline.
- `npm run validate` (or its expansion: `typecheck && test && guard-scripts && check:committed-secrets && check:doc-paths-and-scripts && check:pharosville-assets && check:pharosville-colors && build`) passes.
- `npm run test:visual` produces zero pixel diffs against the Phase-0 baseline.
- After this plan, the following classes of zone tweak become **one-table edits** in `ZONE_THEMES`:
  - Base / depth-overlay / wave / accent colors.
  - Label outline, fill, plaque-light, plaque-dark, accent.
  - Wave amplitude scalar (per-tile sine output magnitude).
  - Motion-coupled accent stroke alpha scalar.
- The following remain inside the per-zone `drawXxxTexture` function and are **NOT** in scope for this plan (a follow-up plan can lift them to the theme if and when needed):
  - Wave **frequency** multipliers (e.g., `* 1.1` in Alert vs `* 0.48` in Calm).
  - Procedural path geometry (`drawMooringRule`, `drawBreakwaterFoam`, shoal-diamond rectangles).
  - Spatial cadence moduli (`% 3`, `% 6`, `% 9`).
  - The `"rgba(7, 12, 21, 0.34)"` hardcoded shadow stroke at `drawDangerStraitTexture:560`.
  - Reduced-motion baseline alphas (`0.13`, `0.16`, `0.18`, `0.22`).
- A new `ShipWaterZone` entry produces TypeScript errors at every required table (`ZONE_THEMES`, `OPEN_WATER_PATROL_WAYPOINTS`, `ZONE_DWELL`, `ZONE_ROUGHNESS`) until all entries are filled in.

## Snapshot Coverage Note

`tests/visual/pharosville.spec.ts` covers Watch (Ledger-North lane), Alert/Warning/Danger (dense risk-water lane), and the global desktop-shell. **Calm Anchorage is only sampled inside the global shell**, where a `maxDiffPixels: 750` budget could absorb a small per-zone color drift. Before merging Phase 4, eyeball the Calm region of the desktop-shell snapshot manually. If reviewer-level confidence is required, add a clipped lane around the Calm label (`{ x: 8, y: 35 }` per `RISK_WATER_AREAS["safe-harbor"].labelTile`) as a follow-up — but it is not blocking, since the Calm theme inherits the same defaults as every other zone in this plan.

---

## Reviewer Signoff Summary

**Status:** First-pass plan validated by a code-review agent on 2026-05-01. Verdict: **Yellow → Green**. Issues raised:

1. ✅ **Fixed:** `riskZone → terrain` string-concat would route Danger Strait to the generic-water fallback (`"danger-water"` does not exist in `ZONE_THEMES`). Step 4.2 now looks up via `RISK_WATER_AREAS[area.riskPlacement].terrain`.
2. ✅ **Fixed:** Phase 3 amplitude/alpha rules were too vague — would have collapsed DC offsets and faded static reflections. Steps 3.6 and 3.7 now list the exact literal at each line.
3. ✅ **Fixed:** Step 5.2 ordering — define `SHIP_WATER_ZONES` tuple BEFORE writing the test that imports it.
4. ✅ **Fixed:** Phase 1 scope claim — explicitly limited to cross-predicate-shared constants; zone-private literals stay inline by design.
5. ✅ **Fixed:** Done criteria — explicit list of what is one-table editable and what stays in the renderer.
6. ⚠️ **Acknowledged, not blocking:** Calm Anchorage label not in a dedicated snapshot lane; manual eyeball check at Phase 4 plus optional follow-up lane.

Recommended pre-merge reviewer dispatch:

- **Correctness reviewer** — confirms the named-constants extraction (Phase 1) and theme-threading (Phases 3–4) are byte-identical and that no `style.` callsite was missed.
- **Test-design reviewer** — confirms the exhaustiveness test (Phase 5) actually catches a missing zone (try removing one locally; the test must fail).
- **Docs/contract reviewer** — confirms CURRENT.md and VISUAL_INVARIANTS.md changes match the new code surface and don't imply behaviors the code doesn't provide.
- **Visual-quality reviewer** — eyeballs `desktop-shell.png` and `dense risk water` snapshots before/after each phase to spot subtle drift the snapshot tolerance might miss.

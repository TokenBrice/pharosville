# Zone Theme Authoring Guide

> Companion to `pharosville-zone-theming-base-plan.md`. Where the base plan installed the surface, this guide is how to *use* it. Read this before authoring or iterating on a `ZONE_THEMES` entry.

## TL;DR

- **One file, one table.** All per-zone visual knobs live in `src/systems/palette.ts:ZONE_THEMES`. Edit a row, the renderer picks it up.
- **Three knob classes:** static colors (`base`, `inner`, `wave`, `accent`), label appearance (`label.*`), motion intensity (`motion.amplitudeScale`, `motion.strokeAlphaScale`).
- **One footgun:** `theme.base` and `theme.inner` flow through the static-scene cache. Edit them and the rendered map won't update until the cache is evicted (zoom, camera move, manifest `cacheVersion` bump, or page reload).
- **Validation:** `npx vitest run src/systems/palette.test.ts` (unit) plus `npm run test:visual` (snapshot regression) plus eyeball at `http://localhost:5173/`.
- **What's still NOT themable:** wave frequency, procedural geometry, cadence moduli, reduced-motion baselines, static reflection/foam/sounding alphas, the hardcoded `rgba(7,12,21,0.34)` shadow in `drawDangerStraitTexture`. These encode shape, not band escalation — lifting them is a future plan.

---

## The Theme Contract

`src/systems/palette.ts` exports one type and one table. Every authoring change touches a row of the table.

```ts
export interface ZoneVisualTheme extends WaterTerrainStyle {
  // From WaterTerrainStyle (inherited):
  base: string;                      // tile diamond fill — opaque hex
  inner: string;                     // depth-overlay fill — usually rgba with alpha
  wave: string;                      // wave/foam stroke color — rgba
  accent: string;                    // accent stroke and shoal/sounding fill color — rgba
  texture: WaterTextureKind;         // which procedural draw function fires (do NOT change post-creation)

  // Per-zone label styling:
  label: {
    accent: string;                  // pennant + underline color — usually a band/threat color
    outline: string;                 // text outline behind the title
    fill: string;                    // text body
    plaqueLight: string;             // plaque highlight (top edge)
    plaqueDark: string;              // plaque body shadow
  };

  // Motion-intensity scalars; future-variant levers:
  motion: {
    amplitudeScale: number;          // multiplier on per-tile sine amplitude (1 = current)
    strokeAlphaScale: number;        // multiplier on motion-coupled accent/wave stroke alpha (1 = current)
  };
}
```

**Index keys** are terrain kinds — `"alert-water"`, `"calm-water"`, `"deep-water"`, `"harbor-water"`, `"ledger-water"`, `"storm-water"`, `"warning-water"`, `"watch-water"`, `"water"`. The `as const satisfies Record<keyof typeof WATER_TERRAIN_STYLES, ZoneVisualTheme>` constraint forces every kind to have an entry.

**Lookup** is `zoneThemeForTerrain(kind: string): ZoneVisualTheme`. Falls back to `ZONE_THEMES.water` if the kind isn't recognized — never returns null.

**Important asymmetry — `riskZone` vs terrain key:**

`AreaNode.riskZone` is `"calm" | "watch" | "alert" | "warning" | "danger" | "ledger"`. The terrain key uses the same names except `"danger"` → `"storm-water"`. **Don't string-concat `${riskZone}-water`** — Danger Strait will silently route to the generic-water fallback. Always look up via the canonical `RISK_WATER_AREAS[area.riskPlacement].terrain` (see `src/renderer/layers/water-labels.ts:45`).

---

## Where Each Field Is Read (And When)

This determines what invalidates and what's free to iterate.

| Field | Read by | Cached? | Cost to change |
|---|---|---|---|
| `theme.base` | `drawWaterTileBase` (terrain.ts:187) | ✅ static-scene cache | 🔥 needs cache evict |
| `theme.inner` | `drawWaterTileBase` (terrain.ts:191) | ✅ static-scene cache | 🔥 needs cache evict |
| `theme.wave` | `drawWaterTileOverlay` (terrain.ts:212) + 8 texture fns + `drawCoastalWaterDetails` | ❌ per frame | free |
| `theme.accent` | `drawWaterTileOverlay` (terrain.ts:219) + 8 texture fns + `drawCoastalWaterDetails` | ❌ per frame | free |
| `theme.texture` | `drawWaterTerrainTexture` dispatcher (terrain.ts:261) | ❌ per frame | free, but changing this routes to a different procedural function |
| `theme.label.*` | `drawCartographicWaterLabel` via `drawWaterAreaLabels` (water-labels.ts:46–61) | ❌ per frame | free |
| `theme.motion.amplitudeScale` | 6 DEWS+Ledger texture functions | ❌ per frame | free |
| `theme.motion.strokeAlphaScale` | 6 DEWS+Ledger texture functions | ❌ per frame | free |

The renderer reads `zoneThemeForTerrain` once per visible water tile per frame. With ~2700 water tiles and a 56×56 map, that's well under a millisecond — themes are not on the hot path.

### The static-scene cache footgun

`src/renderer/world-canvas.ts:paintStaticTerrainPass` paints all base tiles into an offscreen canvas keyed by viewport + zoom + dpr + asset load tick + `manifestCacheVersion`. The key does **not** include a theme version. So:

- Edit `theme.wave` / `accent` / `motion.*` / `label.*` → live next frame, no action needed.
- Edit `theme.base` or `theme.inner` → cached canvas keeps the old color until *something else* invalidates the key.

**To force a refresh in dev:**
1. Easiest: bump `style.cacheVersion` in `public/pharosville/assets/manifest.json` (existing convention; see `docs/pharosville/CURRENT.md` line 31). This propagates into `manifestCacheVersion`, changes the cache key, evicts everything.
2. Lazier: zoom in/out one click in the map toolbar — the zoom bucket changes, key changes, cache misses, rerenders.
3. Nuclear: hard reload (`Ctrl+Shift+R`) in the browser.

**For visual baselines:** if you bake a new theme into `ZONE_THEMES`, also update `tests/visual/pharosville.spec.ts-snapshots/*.png` (run `npm run test:visual -- --update-snapshots`). Without that, snapshot tests fail forever.

---

## Authoring Workflows

### Soft tweak (recolor without touching motion or labels)

Use case: "make Calm Anchorage's accent slightly warmer".

1. Edit `ZONE_THEMES["calm-water"].accent` in `src/systems/palette.ts`. Use rgba with explicit alpha.
2. Save. The dev server hot-reloads the module; the next frame uses the new color.
3. If you also touched `.base` or `.inner`, bump `style.cacheVersion` in `manifest.json` (any string change works; convention: ISO date suffix like `2026-05-02-calm-warmer-v1`).
4. Eyeball at `http://localhost:5173/`.
5. Run `npm run test:visual -- --update-snapshots` once the look is right; commit the snapshot diff alongside the theme edit.

### Motion intensity dial (DEWS escalation)

Use case: "Danger Strait should feel more turbulent than Warning Shoals".

1. Edit `ZONE_THEMES["storm-water"].motion.amplitudeScale` (currently `1`). Try `1.6` for noticeable bump, `2.0` for dramatic.
2. Edit `ZONE_THEMES["storm-water"].motion.strokeAlphaScale` independently if you want stronger stroke visibility without faster waves.
3. **Static cache is not involved** — change is live.
4. Run `npm run test:visual` to confirm only the storm/danger lanes drift.
5. Commit.

Suggested escalation gradient (recommend, not enforced):
- CALM ≈ 0.5–0.7
- WATCH ≈ 0.85
- ALERT = 1.0 (baseline)
- WARNING ≈ 1.2–1.4
- DANGER ≈ 1.6–1.9
- LEDGER ≈ 0.4–0.6 (off-ladder; quiet/scholarly)

### Per-zone label restyling

Use case: "Ledger Mooring's plaque should look like parchment, not the bronze pinned signage everywhere else".

1. Edit `ZONE_THEMES["ledger-water"].label.plaqueLight` and `plaqueDark` (the existing wood/iron defaults).
2. Optionally edit `label.outline` (text stroke) and `label.fill` (text body) — current defaults are oxidized cream on near-black.
3. The `label.accent` is the pennant/underline. By convention this matches the band's threat color (`DEWS_AREA_LABEL_COLORS.WATCH` etc.) — don't change it for DEWS bands. Ledger has free reign.
4. Live; no cache concern.

### Adding a new theme field

Use case: "Add a `wave.frequency` scalar so I can slow Calm and speed Danger".

1. Extend `ZoneMotionTheme` (or add a new sub-object on `ZoneVisualTheme`):
   ```ts
   export interface ZoneMotionTheme {
     amplitudeScale: number;
     strokeAlphaScale: number;
     frequencyScale: number;  // new
   }
   ```
2. Add `frequencyScale: 1` to `DEFAULT_MOTION` so existing zones default to no-op.
3. Find the per-zone literal you want to scale. For frequency, that's the `* F` inside `Math.sin(motion.timeSeconds * F + ...)` — see the table in `pharosville-zone-theming-base-plan.md` step 3.6.
4. Wrap: `Math.sin(motion.timeSeconds * F * theme.motion.frequencyScale + ...)`.
5. Run typecheck; the `as const satisfies Record<...>` will demand the new field on every entry.
6. Run visual snapshots — should be identical at scale=1.
7. Now you can edit per-zone values.

### Building a theme variant set ("alternate skin")

Use case: "I want a high-contrast accessibility variant" or "a daytime/nighttime mode".

The current `ZONE_THEMES` is a single source of truth. To add a variant:

1. Build a parallel constant — `ZONE_THEMES_HIGH_CONTRAST` — typed the same way (`as const satisfies Record<keyof typeof WATER_TERRAIN_STYLES, ZoneVisualTheme>`).
2. Replace `zoneThemeForTerrain` with a parameterized form: `zoneThemeForTerrain(kind, themeSet = ZONE_THEMES)`.
3. Thread `themeSet` selection through `DrawPharosVilleInput` (or a render-time context) so renderers can pass it down.
4. Pick the active set from a feature flag, env var, or media query (`prefers-contrast: more`).
5. Visual snapshot lanes need to multiply: one snapshot suite per variant.

This is bigger surgery — doable but earns its keep only if multiple skins are actually shipping. For one-off zone tweaks, edit `ZONE_THEMES` directly.

### Per-tile or per-camera override

Not supported. Themes are zone-keyed, not tile-keyed. If you need this, the cleanest extension is a "modifier" function the texture draw passes consult — out of scope for this guide.

---

## Validation Checklist

Before merging a theme change:

- [ ] `npm run typecheck` — passes
- [ ] `npm test` — passes (the `palette.test.ts` exhaustiveness test catches missing zones; the hex-distance test catches palette collapse)
- [ ] `npm run check:pharosville-colors` — passes (some hex literals are gated by an allowlist; if a new color trips it, add it intentionally to `scripts/check-pharosville-colors.mjs`)
- [ ] `npm run test:visual` — either passes or you reviewed the diff and ran `--update-snapshots`
- [ ] Manual eyeball at `http://localhost:5173/` against each zone (Watch, Alert, Warning, Danger visible at the east edge; Calm on the west; Ledger on the top shelf)
- [ ] If `theme.base` or `theme.inner` changed: `style.cacheVersion` in `manifest.json` bumped

---

## Limitations And Escape Hatches (What's Not Yet Themable)

The base plan deliberately stopped at color + label + motion-scalar. Things still hardcoded inside the per-zone draw functions:

| Hardcoded | Where | Why it's still hardcoded |
|---|---|---|
| Wave frequency | `Math.sin(timeSeconds * 1.1...)` etc. in 8 texture fns | Frequency encodes shape, not band intensity; could be lifted via `frequencyScale` |
| Procedural geometry | `drawMooringRule` paths in Ledger, `drawBreakwaterFoam` placement in Watch, shoal diamond rectangles in Warning | Each is a per-zone visual signature; lifting requires a mini-DSL |
| Spatial cadence moduli | `(tileX + tileY) % 3`, `% 6`, `% 9` | Controls how often an effect fires per tile; lifting would require per-zone cadence config |
| Reduced-motion baseline alphas | `0.13`, `0.16`, `0.18`, `0.2`, `0.22` in each function | These are the static-frame visibility floors; likely should remain literal so reduced-motion is predictable |
| Hardcoded danger shadow | `"rgba(7, 12, 21, 0.34)"` at `terrain.ts:560` (`drawDangerStraitTexture`) | One-off; if you re-theme Danger heavily, lift it into `theme.shadow` |
| Static reflection / foam / sounding alphas | `0.18`, `0.22`, `0.28` etc. in `drawDepthSounding`, `drawBreakwaterFoam`, `drawCurrentWakeMark` calls | These describe shape (a reflection's visibility), not threat — left literal so they don't fade with `strokeAlphaScale` |

**Escape hatch when needed:** add a field to `ZoneVisualTheme`, default it to the current literal, and thread it through the function that uses it. The `as const satisfies` constraint will tell you every theme entry that needs the new field.

---

## Other Consumers To Be Aware Of

- `src/renderer/layers/shoreline.ts` reads `waterTerrainStyle(kind)` — the older `WaterTerrainStyle` API — for coastal foam and nearshore motifs. Since `ZoneVisualTheme extends WaterTerrainStyle`, color edits flow through correctly. But if you add a NEW field beyond the inherited four (`base/inner/wave/accent/texture`), shoreline won't see it. Either migrate shoreline to `zoneThemeForTerrain` or accept that coastal effects stay zone-aware-but-theme-agnostic.
- `src/renderer/layers/water-labels.ts` is fully theme-aware (post Phase 4).
- `src/renderer/layers/terrain.ts` is fully theme-aware (post Phase 3).
- Ship visuals (`ship-pose.ts`, `ships.ts`) consume `ShipWaterZone` for roughness / wake intensity, not the theme. If you want ship motion to scale with theme amplitude, that's a separate refactor — don't do it as part of a theme tweak.

---

## Recommended File Organization For A New Theme

For a single-zone tweak: edit `ZONE_THEMES` in place. Commit as one focused commit. Update `docs/pharosville/CURRENT.md` if the change shifts the visual contract (e.g., "Watch is now noticeably more turbulent than Alert").

For a coordinated multi-zone refresh (likely what comes out of `pharosville-zone-themes-research.md`):

1. One commit per logical zone family if they're independent (DEWS gradient as a unit; Ledger separately).
2. Bump `style.cacheVersion` in `manifest.json` once per refresh, with a date-tagged identifier (`2026-05-02-zone-themes-v1`).
3. Refresh visual snapshots once, after the multi-zone edit is finalized.
4. Document the gradient choice in `CURRENT.md`'s Visual Model section so the next theme reviewer doesn't re-derive the rationale.

---

## Hot Loop For Theme Iteration

While the dev server runs at `http://localhost:5173/`:

1. Edit `ZONE_THEMES["…-water"].…` field.
2. Vite hot-reloads the module.
3. The renderer re-paints next frame.
4. If the change touched `theme.base`/`inner`: tap the zoom in/out button once to evict the static cache, OR bump `manifest.json` `cacheVersion`.
5. Compare against the previous look; nudge values; repeat.
6. When happy: `npm run test:visual -- --update-snapshots`, commit theme + snapshot diff together.

Typical cycle time: ~2 seconds per tweak (HMR latency dominates). Theme iteration is fast specifically because the surface is one table.

# PharosVille Zone Themes — Research & Proposal

Design proposal for `ZONE_THEMES` (`src/systems/palette.ts`). Code-untouched.

## 1. Theme philosophy

The five DEWS zones form an **escalation gradient on the cool maritime axis**: as the band climbs, saturation drains, depth shadow deepens, motion amplitude rises, and the warm accent shifts from "lantern-on-still-water" toward "foam-blown-by-wind". Hue stays in the limestone-warm vs cool-water family — escalation is encoded by **saturation drop + shadow depth + motion**, not hue chaos. Label accents continue from `THREAT_BAND_HEX`, untouched, so analytical signal stays independent of aesthetic. **Ledger Mooring** is orthogonal: parchment-and-ink, warm desaturated `timber_*`/`lantern_*`, narrow amplitude — *a different kind of place*, not "calmer than CALM".

## 2. Per-zone proposed themes

Tables omit kept-verbatim fields. All zones keep `texture` and shared `label.outline/fill/plaqueLight/plaqueDark`; `label.accent` from `THREAT_BAND_HEX` (Ledger: `#d9b974`).

### 2.1–2.3 Calm / Watch / Alert (motion-only edits)

All colors and label accents **kept** verbatim from current `WATER_TERRAIN_STYLES` and `DEWS_AREA_LABEL_COLORS`. Only motion knobs change. Existing colors in §3 matrix.

| Zone (key) | `amplitudeScale` | `strokeAlphaScale` | Rationale |
|---|---|---|---|
| Calm Anchorage (`calm-water`) | `0.6` (changed) | `0.85` (changed) | Hush, ~40% under baseline; sleepier reflections. |
| Watch Breakwater (`watch-water`) | `0.85` (changed) | `0.95` (changed) | Activity, not chop; visibility on the ~786-tile shelf. |
| Alert Channel (`alert-water`) | `1.0` (kept) | `1.0` (kept) | Baseline reference. |

### 2.4 Warning Shoals (`warning-water`, WARNING) — label accent `#f97316` kept

| Field | Proposed | Rationale |
|---|---|---|
| `base` | `#3d4332` | Olive-stone, more desaturated than `#4a4a35`; "shoaling". |
| `inner` | `rgba(82, 70, 42, 0.28)` | Browner sand-shadow under chop. |
| `wave` | `rgba(224, 214, 174, 0.20)` | 0.18→0.20 for visible chop. |
| `accent` | `rgba(215, 174, 100, 0.30)` | 0.28→0.30; shoal-fill firms up. |
| `motion.amplitudeScale` | `1.3` | Visible chop. |
| `motion.strokeAlphaScale` | `1.15` | Strokes punch through. |

All fields **changed**.

### 2.5 Danger Strait (`storm-water`, DANGER) — label accent `#ef4444` kept

| Field | Proposed | Rationale |
|---|---|---|
| `base` | `#06192d` | One step darker than `#08243b`; near-black storm. |
| `inner` | `rgba(2, 9, 18, 0.36)` | 0.32→0.36; pitch depth. |
| `wave` | `rgba(218, 232, 224, 0.22)` | 0.18→0.22; whitecaps catch the eye. |
| `accent` | `rgba(232, 238, 240, 0.26)` | `foam_white`-leaning sea-spray. |
| `motion.amplitudeScale` | `1.8` | Heaviest motion. |
| `motion.strokeAlphaScale` | `1.35` | Whitecaps above baseline. |

All fields **changed**.

### 2.6 Ledger Mooring (`ledger-water`, non-DEWS) — label accent `#d9b974` kept; OFF THREAT_BAND_HEX axis

| Field | Proposed | Rationale |
|---|---|---|
| `base` | `#3a4338` | Slate-olive parchment shadow; warmer than CALM, not threatening. |
| `inner` | `rgba(58, 42, 30, 0.22)` | `timber_dark`-rgba; ink-stain, not deep-sea. |
| `wave` | `rgba(232, 218, 175, 0.18)` | `lantern_glow`-leaning ledger line. |
| `accent` | `rgba(212, 154, 62, 0.28)` | `lantern_warm`-rgba; bronze ink, tighter than DEWS warm. |
| `motion.amplitudeScale` | `0.5` | Quietest in the world. |
| `motion.strokeAlphaScale` | `1.05` | Ink lines stay crisp where waves are absent. |

All fields **changed**.

## 3. Escalation matrix (DEWS only)

| Knob | CALM | WATCH | ALERT | WARNING | DANGER |
|---|---|---|---|---|---|
| `base` | `#27734f` (green) | `#194d6e` (steel) | `#276f78` (teal) | `#3d4332` (olive) | `#06192d` (near-black) |
| `inner` α | 0.20 | 0.22 | 0.24 | 0.28 | 0.36 |
| `wave` α | 0.14 | 0.16 | 0.18 | 0.20 | 0.22 |
| `accent` α | 0.20 | 0.22 | 0.22 | 0.30 | 0.26 |
| `amplitudeScale` | 0.6 | 0.85 | 1.0 | 1.3 | 1.8 |
| `strokeAlphaScale` | 0.85 | 0.95 | 1.0 | 1.15 | 1.35 |

Saturation falls (green → steel → teal → olive → near-black); shadow deepens; motion climbs. WARNING's accent α (0.30) tops DANGER's (0.26) intentionally: WARNING signals via warm shoal-fill, DANGER via cool foam — different carriers, both escalating.

## 4. Ledger justification

Ledger sits **off the DEWS ladder** because it encodes NAV-ledger placement, not threat. It must read as *administrative* — not *quiet-because-safe* (CALM) and not *quiet-because-empty* (generic water).

- **Hue:** warm `timber_*`/`lantern_*` tokens; CALM is fully cool. Different sides of the warm-island vs cool-water split.
- **Texture:** `drawLedgerWaterTexture` already draws mooring rules and ledger frames — reads as ruled paper, not waves.
- **Motion:** `amplitudeScale 0.5` is *lower* than CALM's 0.6, but `strokeAlphaScale 1.05` is *higher* than CALM's 0.85 — quieter waves with sharper accents. Reviewer test: "is the ledger stroke crisper than the calm ripple?"

## 5. Risks and open questions

1. **CALM desaturation:** `amplitudeScale 0.6` may read sleepier than "safe-and-active". Snapshot suite samples Calm only inside global desktop-shell at 750-px diff budget; eyeball Calm at `labelTile {x:8, y:35}` and consider a clipped Calm lane before merge.
2. **Color allowlist:** `scripts/check-pharosville-colors.mjs` only blocks purple drift and orb/bokeh language. All proposed values are cool-blue/olive/teal/timber — passes.
3. **Watch tile count (~786):** `amplitudeScale 0.85` chosen to avoid shimmer at density. If the shelf reads too quiet, lift to 0.92, not above.
4. **DANGER vs deep-water:** `#06192d` neighbors `deep-water`'s `#06131d`. Whitecaps and ring overlap should carry the distinction; verify on the ultrawide lane.
5. **Warning olive:** risk of "muddy" read. Mitigation: warm shoal-fill (`accent` 0.30) provides the pop.
6. **Label uniformity:** every zone keeps the shared default plaque. Per-zone variants didn't earn their keep — plaque is the cartographic frame, not the threat signal.

## 6. Implementation handoff

Update only these `ZONE_THEMES` entries in `src/systems/palette.ts`; values are in §2/§3.

- `calm-water` → motion `(0.6, 0.85)`.
- `watch-water` → motion `(0.85, 0.95)`.
- `alert-water` → no change (baseline).
- `warning-water` → colors per §2.4; motion `(1.3, 1.15)`.
- `storm-water` → colors per §2.5; motion `(1.8, 1.35)`.
- `ledger-water` → colors per §2.6; motion `(0.5, 1.05)`.

**Do NOT touch:** `DEWS_AREA_LABEL_COLORS`; `DEFAULT_LABEL_*` and `defaultLabelTheme`; `harbor-water` / `deep-water` / `water` themes; `src/renderer/layers/terrain.ts` (geometry stays; only motion scalars feed in).

Run `npm run check:pharosville-colors`, Vitest (esp. `palette.test.ts`), `npm run test:visual`. Expect intentional diffs in Calm/Watch/Warning/Danger/Ledger lanes; refresh baselines after reviewer sign-off.

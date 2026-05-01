# PharosVille Lighthouse Sweep-Beam + Wider Aura Plan

Date: 2026-05-01
Status: Research / proposal — not implemented
Scope: Standalone `pharosville` repository, night rendering only

## Goal

Move past the current dual-cone close-intense beams and toward a more atmospheric,
fantastical night feel:

1. **Less intense close beams** — the existing left/right warm wedges feel like
   pasted-on cones at close zoom. Reduce their visual weight.
2. **Wider warm aura** — push the diffuse halo out farther so the whole island
   reads as gently lit rather than a tight hotspot at the brazier.
3. **One (or two) long-reaching gently-rotating beams** that sweep the whole
   map, like a real Alexandria-style mirrored fire. Feels alive without being
   mechanical or distracting.

Pre-state: commit `624541b` (`feat(lighthouse): warm fire overlay…`) ships
warm amber close beams + living flame + ember stream.

## What Stays, What Goes

`src/renderer/layers/lighthouse.ts:430` — `drawLighthouseNightHighlights`
currently draws (in order, additive):

| Layer | r / shape | Status |
|---|---|---|
| Diffuse fill (warm beige, r=1000) | radial | **Expand** to ~1500, drop alpha ~0.5x |
| Core glow (warm white, r=68) | radial | **Keep** — sells the brazier as a light source |
| Right cone (warm amber wedge) | linear gradient | **Reduce alpha** ~0.4x or **delete** |
| Left cone (warm amber wedge) | linear gradient | **Reduce alpha** ~0.4x or **delete** |
| Right water shimmer (warm gold ellipse) | radial | **Delete** — replaced by sweep tail |
| Left water shimmer | radial | **Delete** |
| Warm halo (orange→red, r=760) | radial | **Expand** to ~1100, keep alpha |
| Warm water pool (orange ellipse, source-over) | radial | **Keep, expand** to ~900 |
| **NEW** sweep beam(s) | rotated wedge | **Add** |
| **NEW** sweep beam tail glints | small water specks under sweep tip | optional polish |

Net layer count stays roughly the same (8 → ~7-8 with sweep), so existing
test counter logic just needs a new expected value. Day-beam (`drawLighthouseBeam`)
stays untouched — it fades out at night already.

## Map / Reach Numbers

- Map: 56×56 tiles. Iso bounds ≈ 1760 × 880 (TILE_WIDTH=32, TILE_HEIGHT=16).
- Lighthouse tile (18, 30) → iso (-192, 384). Worst-case corner distance to
  bottom-right (55,55)=(880, 880) is ≈ **1181 iso units**.
- Beam math uses `point + N * beamZoom` where `beamZoom = camera.zoom * 1.35`.
  To clear all corners at camera.zoom=1: `N ≥ 1181 / 1.35 ≈ 875`. Use **1200**
  for margin and edge fade.

## Sweep Beam Design

### Geometry (screen-space rotation)

```ts
const SWEEP_LENGTH = 1200;       // sprite-units (camera-zoom independent)
const SWEEP_APEX_HALF = 6;       // narrow at the brazier
const SWEEP_FAR_HALF = 90;       // fans out at the far end
const SWEEP_PERIOD = 48;         // seconds per revolution — "gentle"
const SWEEP_PEAK_ALPHA = 0.22;   // additive, lighter composite
```

Per-frame:

```ts
const angle = (motion.timeSeconds / SWEEP_PERIOD) * Math.PI * 2;
const cos = Math.cos(angle);
const sin = Math.sin(angle);
const px = -sin, py = cos;       // perpendicular

const apexAx = firePoint.x + px * SWEEP_APEX_HALF * beamZoom;
const apexAy = firePoint.y + py * SWEEP_APEX_HALF * beamZoom;
const apexBx = firePoint.x - px * SWEEP_APEX_HALF * beamZoom;
const apexBy = firePoint.y - py * SWEEP_APEX_HALF * beamZoom;
const farAx  = firePoint.x + cos * SWEEP_LENGTH * beamZoom + px * SWEEP_FAR_HALF * beamZoom;
const farAy  = firePoint.y + sin * SWEEP_LENGTH * beamZoom + py * SWEEP_FAR_HALF * beamZoom;
const farBx  = firePoint.x + cos * SWEEP_LENGTH * beamZoom - px * SWEEP_FAR_HALF * beamZoom;
const farBy  = firePoint.y + sin * SWEEP_LENGTH * beamZoom - py * SWEEP_FAR_HALF * beamZoom;
```

Linear gradient along the beam axis:

```ts
const grad = ctx.createLinearGradient(
  firePoint.x, firePoint.y,
  firePoint.x + cos * SWEEP_LENGTH * beamZoom,
  firePoint.y + sin * SWEEP_LENGTH * beamZoom,
);
const a = SWEEP_PEAK_ALPHA * nightFactor;
grad.addColorStop(0,    `rgba(255, 240, 195, ${a})`);          // warm-white at brazier
grad.addColorStop(0.25, `rgba(255, 200, 110, ${a * 0.65})`);   // amber
grad.addColorStop(0.65, `rgba(240, 140, 70,  ${a * 0.30})`);   // ember
grad.addColorStop(1,    `rgba(180, 60, 30, 0)`);                // fade to transparent
```

Modulate `a` by the same `fireFlicker` term the close beams use so the sweep
breathes with the flame:

```ts
const a = (SWEEP_PEAK_ALPHA + fireFlicker * 0.06) * nightFactor;
```

### Single beam vs paired

Recommend **paired** (180° offset) — feels more lighthouse-y, costs one extra
gradient. If too busy, drop to a single beam. The user said "a long-reaching
beam" (singular) — possible interpretations:
- One beam → calmer, more eerie
- Two opposite beams → classic lighthouse rhythm

Default to **paired** with a "single beam" const flag for quick A/B.

### Speed tuning

- 48s/revolution feels gentle. At 60fps the angular delta is 7.5°/sec — slow
  enough to track without dizziness, fast enough to read as motion.
- Consider easing the angular motion (cosine instead of linear) for a "real
  rotating mirror" feel — it briefly accelerates through center and slows at
  the apex of each sweep. Optional polish:
  ```ts
  const t = motion.timeSeconds / SWEEP_PERIOD;
  const angle = t * Math.PI * 2 + Math.sin(t * Math.PI * 2) * 0.15;
  ```

### Reduced motion

If `motion.reducedMotion`, freeze the beam at angle 0 and reduce its alpha to
~0.10 so it reads as a soft directional hint rather than a stopped scan.
Or: skip the sweep entirely and rely on the wider aura.

## Aura Expansion

```ts
// Diffuse fill
const DIFFUSE_RADIUS = 1500;     // was 1000
const DIFFUSE_INNER_ALPHA = 0.10 * nightFactor;  // was 0.14
const DIFFUSE_MID_ALPHA   = 0.045 * nightFactor; // was 0.07

// Warm halo
const HALO_RADIUS = 1100;        // was 760
const HALO_ALPHA  = NIGHT_HALO_MAX_ALPHA * 0.36 * nightFactor;  // was 0.32

// Warm water pool
const POOL_RADIUS = 900;         // was 640 (NIGHT_WATER_POOL_RADIUS)
```

The expansion + alpha drop is a wash trade — the fill area grows, the
per-pixel light drops, the perceptual "soft glow" enlarges without making
the center brighter.

## Close-Beam Reduction

**Recommendation: delete the two static cones entirely.**

The sweep already provides directional light, the aura provides radial fill.
The two static cones were a bridge between cool-white directional and warm
volumetric — with the sweep in place they're redundant and they read as the
"close-intense" the user wants gone.

Diff: delete lines 477-513 (right + left beam blocks) in
`drawLighthouseNightHighlights`. Also delete the two water-shimmer ellipses
(514-542) — the sweep + pool cover that role.

Fallback if the sweep alone reads as too sparse:
- Keep the cones but at `beamPulse * 0.35` and only when `nightFactor > 0.7`
  (so they fade in deep night only).

## Selection Bounds

`lighthouseOverlayScreenBounds` (line 83) currently inflates the selection
rect by the static beam wedge geometry. With a rotating beam, the
contributing bound becomes a circle of radius `SWEEP_LENGTH * beamZoom * (1 - nightFactor mapping)`.

Simplification: at `nightFactor > 0`, use a circle around firePoint; at
`nightFactor = 0` keep the day-beam wedge logic. Existing test
("returns a smaller (or equal) rect at full night than at noon") still
holds — circle radius < day-beam reach.

## File Changes (sketch)

Single file: `src/renderer/layers/lighthouse.ts`.

| Lines (current) | Change |
|---|---|
| 69-72 (constants) | bump `NIGHT_HALO_OUTER_RADIUS` 760→1100, `NIGHT_WATER_POOL_RADIUS` 640→900; add `SWEEP_LENGTH`, `SWEEP_APEX_HALF`, `SWEEP_FAR_HALF`, `SWEEP_PERIOD`, `SWEEP_PEAK_ALPHA` |
| 83-110 (`lighthouseOverlayScreenBounds`) | replace beam-wedge inflation with a circle inflation when `nightFactor > 0` |
| 446-458 (diffuse fill) | radius 1000→1500, alphas 0.14→0.10, 0.07→0.045 |
| 477-513 (left+right cones) | **delete** (or gate behind `nightFactor > 0.7` at low alpha) |
| 514-542 (water shimmers) | **delete** |
| 547-559 (warm halo) | radius constant change covers it; bump 0.32 factor → 0.36 |
| 565-580 (water pool) | radius constant change |
| insert after halo | new sweep-beam block (paired or single, see geometry above) |

## Test Impact

`src/renderer/layers/lighthouse-night.test.ts:61` asserts exactly 8 `fill`
calls. New layer count after this proposal:

- diffuse, core, halo, water-pool: 4 unchanged
- removed: 2 cones + 2 shimmers (-4)
- added: 2 sweep beams (+2)

→ **6 fill calls**. Update the assertion. Add a new test that
`drawLighthouseNightHighlights` produces a non-empty rotation (call it twice
at different `motion.timeSeconds`, assert the gradient endpoints differ).

## Performance

Canvas 2D radial gradients are the expensive primitive. The sweep is a
linear gradient + 4-point polygon — cheap. Net cost should be **lower** than
today (deleting 2 cones + 2 shimmers > adding 2 sweep wedges).

## Open Questions

1. Beam color profile: keep warm-white→amber→ember→transparent, or push
   weirder for "fantastical" (a faint psi-color tint near the tip, modulated
   by `world.lighthouse.color`)?
2. Sweep period 48s — verify in browser; may want 30s or 60s.
3. Single vs paired sweep — needs a visual check both ways.
4. Should the sweep be visible during dawn/dusk transitions, or strictly
   `nightFactor > 0.4`? Currently it'd fade linearly; a threshold makes the
   sweep "turn on" once the sky is dark enough.
5. Does the sweep rotation conflict with the moon position
   (`drawMoonReflection`)? Both add light to the water — verify they don't
   create a competing focal point.

## Minimum Viable Version

If we want the simplest one-session ship:

- Delete the two close cones + two water shimmers (4 fewer fills).
- Bump the halo radius 760→1100, diffuse 1000→1500.
- Add a single (not paired) rotating beam at SWEEP_PERIOD=45.
- Update test assertion 8→5.

That alone removes the "close-intense" feel, expands the aura, and adds the
sweep — covering all three asks in roughly 60 lines of edits.

# PharosVille Lighthouse Sweep-Beam — Polish Follow-Ups

Date: 2026-05-01
Status: Research / proposal — code-ready snippets, not yet implemented
Scope: PharosVille standalone, night rendering only
Companion to: `agents/2026-05-01-pharosville-lighthouse-sweep-beam-plan.md`

This plan covers polish that is **out of scope** for the in-flight sweep-beam +
expanded-aura overhaul. The implementer is currently editing
`src/renderer/layers/lighthouse.ts` and `src/renderer/layers/lighthouse-night.test.ts`.
Land each topic below as its own commit on top of that work.

Layer ordering (post-implementer state, see `world-canvas.ts:277-298`):

```
drawSky → static terrain → water → static scene → drawLighthouseSurf
→ entity pass → squad chrome → labels
→ drawNightTint → drawAtmosphere → drawLighthouseNightHighlights
→ drawBioluminescentSparkles → drawMoonReflection → drawSeaMist
→ drawDecorativeLights → drawLighthouseBeamRim → drawCemeteryMist
→ drawBirds → drawNightVignette → drawSelection
```

Note: the requested neighbour files (`atmosphere.ts`, `moon-reflection.ts`,
`sea-mist.ts`, `decorative-lights.ts`, `bioluminescent.ts`) are all
consolidated in `src/renderer/layers/ambient.ts`. `night-tint.ts` exists
standalone. All cohesion-review file paths below resolve there.

---

## Topic 1 — Heat Shimmer Over Brazier

**Rule:** A faint vertical mottled ellipse that wobbles ±1 sprite-unit
horizontally just above `firePoint`. Sells "this is hot fire, the air above
distorts." Must read as ambient distortion, not as a sprite.

**Geometry:**

- Position: centre at `(firePoint.x, firePoint.y - 35 * zoom)` — 35 sprite-units
  above the fire bowl, sitting in the brazier headroom.
- Size: ellipse `rx = 12 * zoom`, `ry = 22 * zoom` (taller than wide; heat rises).
- Three vertical bands of additive warm grey:
  - inner: `rgba(255, 230, 190, 0.10 * heatAlpha)`
  - mid:   `rgba(255, 200, 150, 0.07 * heatAlpha)`
  - rim:   `rgba(255, 180, 120, 0)` (transparent)
- `heatAlpha` mixes day + night: visible in any mood (heat doesn't care about
  time-of-day) but suppressed under `motion.reducedMotion`.

**Animation:**

- Horizontal offset: `Math.sin(time * 2 * Math.PI / 1.6) * 1.0 * zoom`
  (full cycle ~1.6s, peak ±1 sprite-unit, slow enough to read as wobble not jitter).
- Per-band alpha perturbation:
  `bandAlpha *= 0.85 + 0.15 * Math.sin(time * fireFlickerHz + bandIndex * 1.7)`
  where `fireFlickerHz = 9 * motion.plan.lighthouseFireFlickerPerSecond`.
- The shimmer breathes with `lighthouseFireFlickerPerSecond` so peg health
  modulates the heat (off-peg fire is wilder).

**Code (~32 LOC):**

```ts
function drawBrazierHeatShimmer(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
) {
  if (motion.reducedMotion) return;
  const time = motion.timeSeconds;
  const flickerHz = 9 * motion.plan.lighthouseFireFlickerPerSecond;
  const wobbleX = Math.sin(time * (Math.PI * 2 / 1.6)) * 1.0 * zoom;
  const cy = point.y - 35 * zoom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bands: Array<{ rx: number; ry: number; r: number; g: number; b: number; a: number }> = [
    { rx: 5,  ry: 16, r: 255, g: 230, b: 190, a: 0.10 },
    { rx: 9,  ry: 20, r: 255, g: 210, b: 160, a: 0.07 },
    { rx: 12, ry: 22, r: 255, g: 190, b: 130, a: 0.04 },
  ];
  for (let i = 0; i < bands.length; i += 1) {
    const b = bands[i]!;
    const breath = 0.85 + 0.15 * Math.sin(time * flickerHz + i * 1.7);
    const alpha = b.a * breath;
    ctx.fillStyle = `rgba(${b.r}, ${b.g}, ${b.b}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(point.x + wobbleX, cy, b.rx * zoom, b.ry * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

**Integration:**

Call from inside `drawLighthouseFire` immediately after `ctx.restore()` (current
line 295) and before `drawHearthEmbers(ctx, point, zoom, ...)` at line 297. That
draw order keeps the shimmer above the flame body but below the rising embers,
which composites correctly because it's additive ("lighter").

```ts
// inside drawLighthouseFire, replacing lines 295-297:
ctx.restore();
drawBrazierHeatShimmer(ctx, point, zoom, motion);
drawHearthEmbers(ctx, point, zoom, psiColor, motion);
```

No `nightFactor` gate — heat shimmer is real in daylight too. It's so subtle
that during day it disappears under the day-beam highlights anyway.

---

## Topic 2 — Smoke Wisp

**Rule:** A thin dark plume rising from `firePoint`, drifting horizontally with
slow sine, fading to transparent ~120 sprite-units up. Subtle: peak alpha 0.18.
Reads as "fire produces smoke," never as "lighthouse is burning."

**Composite choice:** Use `source-over` with a dark RGBA. **Not `multiply`**:
the night tint is already a flat `rgba(14, 8, 38, 0.49)` over the whole canvas
(`night-tint.ts:3-13`), so `multiply`-blending an additional dark colour against
that already-dark layer would crush near-black to invisibility. **Not `lighter`**:
that brightens, not darkens, defeating the purpose. Plain `source-over` with
`rgba(28, 24, 30, alpha)` reliably reads as a dark veil over both day sky and
night-tinted sky.

**Day vs night:** Visible at any time-of-day, but alpha multiplied by
`(0.55 + 0.45 * (1 - nightFactor))` — so smoke is most visible during the day
(reads as a working pyre against bright sky) and softens at night (where the
warm aura would otherwise silhouette it weirdly). It never disappears entirely.

**Geometry / animation:**

- Particle stream of 10 puffs, each with lifetime 4.5s, evenly phase-staggered.
- Vertical rise: `dy = -t * 120 * zoom` (t ∈ 0..1).
- Horizontal drift: `dx = sin(time * 0.4 + seed) * 14 * zoom * t` (drift grows
  as the puff rises, like wind catches it later).
- Per-puff radius grows: `r = (3 + t * 6) * zoom`.
- Per-puff alpha curve: triangular, peaks at t=0.25, fades to 0 by t=1.
  `peak = 0.18 * (0.55 + 0.45 * (1 - nightFactor))`.

**Code (~30 LOC):**

```ts
const SMOKE_PUFF_COUNT = 10;
const SMOKE_LIFETIME = 4.5;

function drawBrazierSmoke(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  nightFactor: number,
) {
  if (motion.reducedMotion) return;
  const time = motion.timeSeconds;
  const peakBase = 0.18 * (0.55 + 0.45 * (1 - nightFactor));
  ctx.save();
  // source-over (default) — dark smoke must darken, not brighten
  for (let i = 0; i < SMOKE_PUFF_COUNT; i += 1) {
    const offset = (i / SMOKE_PUFF_COUNT) * SMOKE_LIFETIME;
    const t = ((time + offset) % SMOKE_LIFETIME) / SMOKE_LIFETIME; // 0..1
    const seed = i * 1.913;
    const dy = -t * 120 * zoom;
    const dx = Math.sin(time * 0.4 + seed) * 14 * zoom * t;
    const r = (3 + t * 6) * zoom;
    // Triangle alpha: ramps to 0.25, fades to 1.0
    const aShape = t < 0.25 ? t / 0.25 : (1 - t) / 0.75;
    const alpha = peakBase * aShape;
    if (alpha < 0.005) continue;
    ctx.fillStyle = `rgba(28, 24, 30, ${alpha})`;
    ctx.beginPath();
    ctx.arc(point.x + dx, point.y - 18 * zoom + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

**Integration:**

Call from `drawLighthouseOverlay` (around current line 219), **after**
`drawLighthouseFire` so the smoke sits in front of the flame body but behind the
night highlights (which draw later in the frame from `drawLighthouseNightHighlights`).
Since `nightFactor` is passed into `drawLighthouseOverlay`, it's available:

```ts
// drawLighthouseOverlay body, after drawLighthouseFire(...):
drawLighthouseFire(ctx, firePoint, camera.zoom * 1.32, world.lighthouse.color, motion, !lighthouseAsset);
drawBrazierSmoke(ctx, firePoint, camera.zoom * 1.32, motion, nightFactor);
```

Smoke draws in the entity pass (above static scene, below night tint). Night
tint then dims it slightly, which is exactly what we want.

---

## Topic 3 — Psi-Color Tip on Sweep Beams

**Rule:** The last 8-12% of each sweep beam tints toward `world.lighthouse.color`
(the PSI band hex). Gives the beam a "fantastical" colour signature tied to peg
health. Healthy peg = green tip, off-peg = orange/red tip.

**Constraint check:** there are **6 PSI bands**, not 4 (`shared/lib/psi-colors.ts`):
BEDROCK #22c55e (green), STEADY #14b8a6 (teal), TREMOR #eab308 (yellow),
FRACTURE #f97316 (orange), CRISIS #ef4444 (red), MELTDOWN #991b1b (dark red).
Plus an `unavailable` fallback `#8aa0a6` (cool grey). The yellows/oranges/reds
already harmonise with the warm-amber-ember beam gradient and read as deeper
ember tones; the green/teal cases create the genuinely "fantastical" reading.
The grey unavailable fallback is fine because the beam doesn't draw when
`world.lighthouse.unavailable` is true (gated upstream in `drawLighthouseOverlay`).

**Code change to the sweep-beam gradient (replaces the implementer's gradient
stop block):**

```ts
// world.lighthouse.color is "#rrggbb" hex; convert once per beam to rgb tuple.
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Defensive parse — fall back to warm ember if malformed.
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return { r: 240, g: 140, b: 70 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Inside sweep-beam draw, replacing the linear-gradient stops:
const tip = hexToRgb(world.lighthouse.color); // fallback to warm ember on parse fail
const grad = ctx.createLinearGradient(
  firePoint.x, firePoint.y,
  firePoint.x + cos * SWEEP_LENGTH * beamZoom,
  firePoint.y + sin * SWEEP_LENGTH * beamZoom,
);
grad.addColorStop(0,    `rgba(255, 240, 195, ${a})`);              // warm-white at brazier
grad.addColorStop(0.25, `rgba(255, 200, 110, ${a * 0.65})`);       // amber
grad.addColorStop(0.65, `rgba(240, 140, 70,  ${a * 0.30})`);       // ember
grad.addColorStop(0.88, `rgba(${tip.r}, ${tip.g}, ${tip.b}, ${a * 0.22})`); // psi-tinted
grad.addColorStop(1,    `rgba(${tip.r}, ${tip.g}, ${tip.b}, 0)`);  // fade out in psi color
```

**Notes:**

- The 0.65 → 0.88 transition is short (23% of beam length) so the psi colour
  appears as a tip-tint, not a beam-recolour. The colour cross-fades from amber
  ember through to psi at the very end.
- Alpha at the tip stop is `a * 0.22` — quiet enough that BEDROCK green doesn't
  scream "laser beam" but is unambiguously not orange.
- `hexToRgb` is needed once; place at module scope. If the codebase already
  has one, reuse it (search `src/renderer/` for an existing helper before
  duplicating).
- For psi bands whose hex ends up brighter than the ember (e.g. BEDROCK
  #22c55e is luminance ~150), the `a * 0.22` keeps additive blending below the
  visual threshold of "neon tube." Verify in browser; if BEDROCK still pops
  too hard, drop tip alpha to `a * 0.14` for the psi stop only.

---

## Topic 4 — Reflective Coastline + Ship Sail Glints

**Rule:** When the sweep beam crosses a ship or a dock, briefly brighten its
silhouette. Strong recommendation: **the cheap ambient approach**, not the
accurate per-frame angular check.

**Why cheap:**

- The map is 1760×880 iso units; at gameplay zoom (~0.6-1.0) the eye doesn't
  reliably register a 5° angular gate against a sweep that takes 48s to rotate.
- Per-frame angular checks for ~30 ships × 3-4 docks add up. Visible gain is
  marginal vs. the cost.
- The accurate approach also has an ugly edge: the rim pops on/off as the beam
  edge crosses, which reads worse than a continuous ambient glow.

**Replacement strategy:**

The existing `drawLighthouseBeamRim` (lines 399-477) is wedge-based and
sweep-beam-naïve — it uses the static day-beam wedges hardcoded in `wedges`
(lines 416-427). After the implementer removes the static cones, this function
either (a) keeps lighting based on stale wedge geometry (visually wrong), or
(b) silently does nothing useful at night.

**Replace `drawLighthouseBeamRim` body** with a distance-based ambient warm rim.
Ships and docks within `RIM_RADIUS = 380` sprite-units of `firePoint` get a warm
rim with alpha that falls off with distance and is modulated by a slow pulse
synced to the sweep period. No angular check.

**Code (~50 LOC, replaces lines 399-477):**

```ts
const RIM_RADIUS = 380;        // sprite-units — ambient warm-rim falloff radius
const RIM_PEAK_ALPHA = 0.45;   // peak alpha for the brightest pulse

export function drawLighthouseBeamRim(
  input: DrawPharosVilleInput,
  visibleShips: readonly DrawPharosVilleInput["world"]["ships"][number][],
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
) {
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, world } = input;
  if (motion.reducedMotion) return;
  if (world.lighthouse.unavailable) return;
  const { firePoint } = cached ?? lighthouseRenderState(input);
  const time = motion.timeSeconds;
  // Two-phase pulse synced to sweep — gives a "the light just passed" cadence
  // even though we don't actually compute angle.
  const pulseA = 0.7 + 0.3 * Math.sin(time * (Math.PI * 2 / SWEEP_PERIOD) * 2);
  const pulseB = 0.7 + 0.3 * Math.sin(time * (Math.PI * 2 / SWEEP_PERIOD) * 2 + Math.PI);
  const rimRadius = RIM_RADIUS * camera.zoom * 1.35;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, 1.6);

  for (const ship of visibleShips) {
    const sample = input.shipMotionSamples?.get(ship.id);
    const tile = sample?.tile ?? ship.tile;
    const screen = tileToScreen(tile, camera);
    const dx = screen.x - firePoint.x;
    const dy = screen.y - firePoint.y;
    const dist = Math.hypot(dx, dy);
    if (dist > rimRadius) continue;
    const falloff = 1 - dist / rimRadius;
    // Phase varies per-ship by horizontal sign so port/starboard side feels alternating.
    const pulse = dx >= 0 ? pulseA : pulseB;
    const alpha = falloff * pulse * RIM_PEAK_ALPHA * nightFactor;
    if (alpha < 0.02) continue;
    const shipScale = camera.zoom * ship.visual.scale * 0.7;
    const bboxWidth = 28 * shipScale;
    const bboxHeight = 28 * shipScale;
    const bboxX = screen.x - bboxWidth / 2;
    const bboxY = screen.y + 12 * camera.zoom - 30 * shipScale;
    // Rim the side facing the lighthouse.
    const facingLeft = dx >= 0;
    ctx.strokeStyle = `rgba(255, 210, 140, ${alpha})`;
    ctx.beginPath();
    if (facingLeft) {
      ctx.moveTo(bboxX, bboxY);
      ctx.lineTo(bboxX, bboxY + bboxHeight);
    } else {
      ctx.moveTo(bboxX + bboxWidth, bboxY);
      ctx.lineTo(bboxX + bboxWidth, bboxY + bboxHeight);
    }
    ctx.stroke();
  }
  ctx.restore();
}
```

**Notes:**

- Drops the `pointInTriangle` machinery and the wedge geometry — replaced by
  one `Math.hypot`. Cheaper than today.
- `pulseA` / `pulseB` give port/starboard sides a phase offset so the rim feels
  like the beam is sweeping past, even though it's pure ambient math.
- The implementer's sweep period const (`SWEEP_PERIOD`) must be exported (or
  re-declared at the same module scope) so this function can read it. If they
  haven't, declare locally as `48` and add a comment to keep them in sync.
- Docks: not currently passed into `drawLighthouseBeamRim`. **Optional follow-up
  follow-up** (out of scope for first cut): extend the function to take
  `frame.visibleDocks` and apply the same falloff logic. Defer until the basic
  ship rim is verified visually.

---

## Topic 5 — Ember Spark Trail Behind Sweep

**Rule:** 10 small ember-glow particles distributed along an arc that lags the
current sweep angle by ~10°, each fading over ~1.5s. Reads as "the air
remembers the light just passed."

**Math:**

- Trail occupies `[currentAngle - 25°, currentAngle - 10°]` (15° spread,
  trailing edge well clear of the actual beam).
- 10 particles distributed at `angle = currentAngle - 10° - (i / 9) * 15°`.
- Each particle's birth-time follows `tBirth = time - (i / 9) * 1.5`, so as
  time advances, particle 0 is youngest and particle 9 is oldest.
- Particle radius from `firePoint`: jittered along beam axis,
  `r = SWEEP_LENGTH * (0.55 + 0.35 * fract(i * 0.713))`. (Spreads out roughly
  along beam length, deterministic.)
- Alpha: `1 - age / 1.5` where `age = time - tBirth`. By construction `age = (i/9)*1.5`, so this becomes `(1 - i/9)`, matching the lag intuition.
- Particle size: `(1.5 + 0.6 * fract(i * 0.379)) * zoom`.
- For the **paired** sweep (per implementer), draw a trail per beam (lag both
  by 10° from each beam's angle).

**Code (~40 LOC):**

```ts
const TRAIL_PARTICLE_COUNT = 10;
const TRAIL_LAG_RAD = (10 * Math.PI) / 180;
const TRAIL_SPREAD_RAD = (15 * Math.PI) / 180;

function drawSweepEmberTrail(
  ctx: CanvasRenderingContext2D,
  firePoint: ScreenPoint,
  beamZoom: number,
  beamAngle: number,         // rotation of THIS sweep beam at current frame
  alphaScale: number,        // pass nightFactor (or nightFactor * fadeForReducedMotion)
) {
  if (alphaScale <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < TRAIL_PARTICLE_COUNT; i += 1) {
    const lag = TRAIL_LAG_RAD + (i / (TRAIL_PARTICLE_COUNT - 1)) * TRAIL_SPREAD_RAD;
    const angle = beamAngle - lag;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Deterministic per-particle "noise" via fractional multiply.
    const nR = ((i * 0.713) % 1);
    const nS = ((i * 0.379) % 1);
    const dist = SWEEP_LENGTH * beamZoom * (0.55 + 0.35 * nR);
    const px = firePoint.x + cos * dist;
    const py = firePoint.y + sin * dist;
    const lifeFraction = i / (TRAIL_PARTICLE_COUNT - 1); // 0 = newest, 1 = oldest
    const alpha = (1 - lifeFraction) * 0.42 * alphaScale;
    if (alpha < 0.01) continue;
    const radius = (1.4 + 0.6 * nS) * beamZoom;
    ctx.fillStyle = `rgba(255, 195, 110, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
```

**Integration:**

Inside `drawLighthouseNightHighlights`, after the implementer draws each sweep
beam (and ideally after the beam-tail glints, so the trail composites on top):

```ts
// after drawing sweep beam at angle `angle`:
if (!motion.reducedMotion) {
  drawSweepEmberTrail(ctx, firePoint, beamZoom, angle, nightFactor);
  if (SWEEP_PAIRED) {
    drawSweepEmberTrail(ctx, firePoint, beamZoom, angle + Math.PI, nightFactor);
  }
}
```

`SWEEP_PAIRED` and `SWEEP_LENGTH` are constants the implementer is adding;
keep them as the source of truth and read both from module scope.

Reduced-motion: skip the trail entirely. The beam itself is frozen in that mode,
so a "trail of where the beam was" is meaningless.

---

## Cohesion Review

The new lighthouse light field is a **large warm aura** (diffuse r=1500, halo
r=1100, water pool r=900) plus **two long sweep beams** (length 1200) plus
**phase-staggered haze rings**. That's a much bigger warm footprint than today.
The neighbour layers below were balanced against the old tight-cone composition;
some now over-compete or visually conflict.

For each finding: **P0 = ship-blocking**, **P1 = should-fix-soon**, **P2 = nice-to-have**.

### `src/renderer/layers/sky.ts`

**Finding 1 (P2):** `paintSkyBackdrop` already draws a warm radial glow around
`firePoint` (lines 122-138, alpha 0.72, radius 260*zoom). This is **above the
horizon, in the sky**, separate from the new ground-level halo, so they don't
literally overlap pixel-for-pixel. But at zoomed-out shots both glows are
visible and they create a "two halos stacked vertically" reading.

- File: `src/renderer/layers/sky.ts:124-138`
- Suggested change: lower the sky glow alpha at night only — multiply line 124's
  `globalAlpha = 0.72` by `(1 - 0.4 * nightFactor)`. Requires threading
  `nightFactor` into `paintSkyBackdrop` (pass via signature, invalidates the
  cache key — add `nightFactor` rounded to 0.05 increments to the cache key on
  line 154). Diff:
  ```ts
  // line 154 (key):
  const key = `${width}x${height}|${moodKeyFor(mood)}|${firePointX},${firePointY}|z${(zoom * 100) | 0}|n${(nightFactor * 20) | 0}`;
  // line 124:
  target.globalAlpha = 0.72 * (1 - 0.4 * nightFactor);
  ```
- Test: `sky.test.ts` will likely need a new fixture for the night-only branch.

**Finding 2 (P2):** `drawMoon` at line 277-311 draws a glow radius `radius * 4.2 = ~58.8*zoom`. Tiny vs. the new aura. No conflict. Skip.

### `src/renderer/layers/ambient.ts` → `drawAtmosphere` (lines 104-114)

**Finding 3 (P0):** Draws a 190*zoom mist ellipse at firePoint y+30. With the
new water pool at radius 900 and warm halo at 1100, the atmosphere mist is
*inside* the warm pool and adds a **cool teal/grey tint** (`mood.mist` is
`"rgba(200, 219, 205, 0.12)"` at night) directly on top of the warm fill.
This will visibly desaturate the pool centre.

- File: `src/renderer/layers/ambient.ts:108-113`
- Suggested change: at night, either (a) skip drawAtmosphere entirely (cleanest),
  or (b) shift the ellipse's centre and shrink it so it doesn't overlap the warm
  pool. Recommend (a): early-return at line 105 when `nightFactor > 0.4`. Diff:
  ```ts
  export function drawAtmosphere(input: DrawPharosVilleInput, lighthouse?: LighthouseRenderState) {
    const { camera, ctx, motion } = input;
    const sky = skyState(motion);
    if (sky.nightFactor > 0.4) return; // ← add: warm pool replaces this mist at night
    const mood = sky.mood;
    ...
  }
  ```
- Test: `ambient`-related tests need the 0.4 threshold mentioned. No fixture
  for ambient tests today (search confirmed none); manual visual check.

### `src/renderer/layers/ambient.ts` → `drawMoonReflection` (lines 220-240)

**Finding 4 (P1):** Draws a tilted ellipse at `(width*0.28, height*0.38)` —
upper-left quadrant, away from the lighthouse (which sits on the south-west
peninsula at tile 18,28 → screen-left of centre). The two reflections are not
co-located, so they don't fight for the same pixels. **However**: on very wide
viewports the moon reflection's `Math.hypot * 0.42` radius can reach all the
way to firePoint. They'll stack additively (both `globalCompositeOperation = "lighter"`).

- File: `src/renderer/layers/ambient.ts:228-230`
- Suggested change: drop the moon-reflection alpha by ~25% at night, and tint
  it slightly cooler so it reads as "moon" not "competing warm light". Current:
  ```ts
  grad.addColorStop(0, `rgba(185, 205, 230, ${0.13 * nightFactor})`);
  grad.addColorStop(0.35, `rgba(160, 185, 215, ${0.06 * nightFactor})`);
  ```
  Suggested:
  ```ts
  grad.addColorStop(0, `rgba(170, 195, 225, ${0.10 * nightFactor})`);
  grad.addColorStop(0.35, `rgba(145, 175, 210, ${0.045 * nightFactor})`);
  ```
  Slight blue shift + 22-25% lower alpha. Keeps the moon reflection visible but
  lets the warm lighthouse pool clearly own the southern water.

### `src/renderer/layers/ambient.ts` → `drawSeaMist` (lines 242-257)

**Finding 5 (P1):** 10 mist patches drift across the sea at low alpha
(0.042 + tiny variation, multiplied by `nightFactor`). The sweep beam (length
1200 sprite-units, peak alpha 0.22) draws **after** sea mist in the layer
order (`world-canvas.ts:290` vs `:293`), so the beam composites *on top of*
sea mist additively. Result: where the beam crosses a mist patch, the warm
beam light tints the mist warm-grey — actually a *good* visual. **No fix
needed for the basic interaction.**

But: patches `4.x` (`x: 44.2, y: 24.3`, `x: 50.1, y: 29.8`) are far enough that
the sweep beam crosses them at full beam length, which means those mist
patches will visibly flicker as the beam sweeps. That's the desired "fog
catches the light" reading — keep it.

- File: `src/renderer/layers/ambient.ts:242-257`
- Suggested change: **none for this layer** — the existing rendering composes
  correctly. P2 only: if the implementer's haze rings (3 phase-staggered)
  visually clutter against the mist patches, drop sea-mist alpha by 15% at
  night. Diff (only if visual review flags it):
  ```ts
  // line 250:
  const alpha = (0.036 + Math.sin(time * patch.speed * 1.8 + patch.phase) * 0.010) * nightFactor;
  ```

### `src/renderer/layers/ambient.ts` → `drawDecorativeLights` (lines 161-167)

**Finding 6 (P2):** Village lamps at `VILLAGE_LIGHTS` (lines 6-19) — 12 warm
yellow halos at 22*zoom radius each. Most cluster in the village (tiles 16-44
on x-axis). The new aura's outer reach (1500 sprite-units) covers them all.
The lamps' warm halos already fade gracefully into the warm aura; reading
should be "lamps individually visible against a generally warm scene."

- File: `src/renderer/layers/ambient.ts:189-218` (`drawLamp`)
- Suggested change: **none structurally**, but verify the lamps still read as
  point lights. If they wash out, bump `glow` (line 190) alpha by ~12% at high
  nightFactor:
  ```ts
  // line 190:
  const glow = 0.22 + Math.sin(phase * 1.6) * 0.04;
  // change to:
  const glow = (0.22 + Math.sin(phase * 1.6) * 0.04) * 1.12;
  ```
  Only apply if visual review at full night shows lamps disappearing.

### `src/renderer/layers/ambient.ts` → `drawBioluminescentSparkles` (lines 169-187)

**Finding 7 (P1):** 54 cyan sparkles (`rgba(140, 230, 215, alpha)`) twinkle
across the water, peak alpha `0.55 * nightFactor`. They draw with `lighter`
composite. Where the warm sweep beam crosses a sparkle cluster, you get cyan
points additively blended with warm amber light — the result reads as "white"
(R+G+B all high), which slightly washes out both effects.

- File: `src/renderer/layers/ambient.ts:169-187`
- Suggested change: suppress sparkle alpha for any sparkle within the warm halo
  radius. Cheap distance check, comparable to Topic 4. Diff:
  ```ts
  // around line 173, take firePoint as a parameter (refactor signature):
  export function drawBioluminescentSparkles(
    input: DrawPharosVilleInput,
    nightFactor: number,
    lighthouse?: LighthouseRenderState,
  ): void {
    if (nightFactor <= 0) return;
    const { camera, ctx, motion } = input;
    const { firePoint } = lighthouse ?? lighthouseRenderState(input);
    const haloRadius = 900 * camera.zoom; // matches NIGHT_WATER_POOL_RADIUS
    const time = motion.reducedMotion ? 0 : motion.timeSeconds;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const sp of SPARKLE_POINTS) {
      const p = tileToScreen(sp, camera);
      const dx = p.x - firePoint.x;
      const dy = p.y - firePoint.y;
      const dist = Math.hypot(dx, dy);
      // Suppress sparkles inside the warm pool — let warm light dominate there.
      const haloSuppress = dist < haloRadius ? Math.min(1, dist / haloRadius) : 1;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + sp.phase);
      const alpha = twinkle * twinkle * nightFactor * 0.55 * haloSuppress;
      ...
    }
  }
  ```
- Caller update: `world-canvas.ts:291`:
  ```ts
  drawBioluminescentSparkles(input, nightFactor, frame.lighthouseRender);
  ```
- Test: `entity-pass.test.ts` and any sparkle-related tests will need an extra
  argument; trivial.

### `src/renderer/layers/night-tint.ts`

**Finding 8 (P0):** `drawNightTint` (lines 8-16) — flat full-canvas
`rgba(14, 8, 38, 0.49)` overlay at full night. **No halo conflict** because
this is uniform; uniform tint doesn't create a competing halo, it just
reduces the overall brightness floor. The new warm aura already accounts for
this (it's drawn *after* night-tint at world-canvas line 290, with
`globalCompositeOperation = "lighter"`).

`drawNightVignette` (lines 18-33) — radial darkness from screen centre to edges,
peak alpha 0.82 at corners. This **does** affect the new aura's reach:
the corners darken to near-black, so the warm fill at r=1500 is partially
swallowed by the vignette in screen corners. This is *intended* behaviour
(vignette is supposed to darken edges) and actually helps the aura read as
"warm island, dark ocean."

- File: `src/renderer/layers/night-tint.ts:18-33`
- Suggested change: **none.** The vignette currently does the right thing.
  Only revisit if the warm aura looks "cut off" at the screen edges in visual
  review — in which case, drop vignette outer alpha from 0.82 to 0.72:
  ```ts
  // line 28:
  vignette.addColorStop(1, `rgba(5, 3, 18, ${0.72 * nightFactor})`);
  ```

---

## Cohesion Conflict Summary

**P0 (must-fix before shipping the sweep-beam overhaul):**

- **#3** — `drawAtmosphere` mist ellipse desaturates the new warm pool centre.
  Add early-return at `nightFactor > 0.4` in `ambient.ts:104-114`.
- **#8** — confirmed no conflict (night tint is uniform, vignette is intended).

**P1 (ship-blocking for visual quality, fix in same PR if possible):**

- **#4** — Moon-reflection lighter ellipse can stack on the warm pool on wide
  viewports. Drop alpha 22-25% and shift slightly cooler.
- **#7** — Bioluminescent sparkles within the warm halo wash to white. Add
  distance-based suppression inside `NIGHT_WATER_POOL_RADIUS`.

**P2 (nice-to-have, defer):**

- **#1** — Sky glow above firePoint creates a stacked-halos look at zoom-out.
  Lower its alpha at night by 40%.
- **#5** — Sea-mist patches under the beam read as "fog catches light" — leave
  alone unless visual review flags them.
- **#6** — Village lamps may need a 12% glow boost if they wash out under the
  expanded aura.

---

## Suggested Landing Order

1. **Commit A** (after implementer lands): Topic 3 (psi-color tip) — single-file,
   isolated, smallest surface. Visual baseline diff bounded.
2. **Commit B**: Topic 1 (heat shimmer) + Topic 2 (smoke wisp) together. Both
   live in `lighthouse.ts`, both draw inside the entity pass, no neighbour
   touching.
3. **Commit C**: Cohesion P0/P1 (#3, #4, #7). One commit per finding if visual
   review wants individual rollback. The `#7` change touches `world-canvas.ts`
   signature; do it as its own commit.
4. **Commit D**: Topic 4 (`drawLighthouseBeamRim` rewrite to ambient warm-rim).
5. **Commit E**: Topic 5 (ember spark trail). Smallest visual change; ship last
   so other tuning is locked in.
6. **Commit F (optional)**: P2 cohesion findings #1 #5 #6 only if visual review
   flags them.

Each commit independently rebakeable for visual baselines; each independently
revertable.

## Cache Version

None of these polish topics introduce new asset bytes or manifest changes. **No
`style.cacheVersion` bump required.**

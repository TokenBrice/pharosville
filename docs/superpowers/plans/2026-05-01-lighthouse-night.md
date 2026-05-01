# Lighthouse Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PharosVille world become much darker after sunset (driven by the user's real local time) and make the lighthouse the dominant light source in that dark world.

**Architecture:** Drive a continuous `nightFactor` ∈ [0, 1] from `motion.wallClockHour`, populated each frame from `new Date()`. Render the world normally, then a single `drawNightTint` translucent dark-rect pass darkens everything. After the tint, `drawLighthouseNightHighlights` adds an additive halo + boosted beam + warm water pool around the lighthouse, plus the existing village lamps and beam-rim ship illumination shine through. No per-layer mood-aware palette work — uniform global tint plus selective additive highlights.

**Tech Stack:** TypeScript, React, HTML5 Canvas 2D, Vitest (unit), Playwright (visual baselines).

**Spec:** [`docs/superpowers/specs/2026-05-01-lighthouse-night-design.md`](../specs/2026-05-01-lighthouse-night-design.md)

**Refinement vs spec:** The spec described modifying `drawLighthouseFire` and `drawLighthouseBeam` to multiply their internal radii/alphas by `nightFactor`. This plan instead adds a separate post-tint additive overlay (`drawLighthouseNightHighlights`) that does not modify the existing fire/beam functions. Same user-facing outcome (the lighthouse pops at night), less invasive (entity-pass z-ordering of the existing beam is preserved, no parameter plumbing through `drawLighthouseFire`/`drawLighthouseBeam`). The water-pool addition from the spec is preserved as part of the new function.

**Render order (after this plan):**

```
1.  drawSky                              (existing — mood-aware backdrop)
2.  drawStaticPassCached "terrain"      (existing — cached)
3.  drawWaterTerrainOverlays             (existing)
4.  drawStaticPassCached "scene"        (existing — cached, includes headland)
5.  drawCoastalWaterDetails              (existing)
6.  drawLighthouseSurf                   (existing)
7.  drawEntityPass                       (existing — ships/docks/graves/lighthouse body+overlay)
8.  drawWaterAreaLabels                  (existing — darkened by tint, still readable)
9.  drawEthereumHarborSigns              (existing — same)
10. drawNightTint                        (NEW — single fillRect, dark blue, alpha = MAX_NIGHT_DARKNESS * nightFactor)
11. drawAtmosphere                       (MOVED — was step ≈6; now post-tint so mist reads against night)
12. drawLighthouseNightHighlights        (NEW — additive halo + boosted beam + warm water pool)
13. drawDecorativeLights                 (existing — village lamps; already use additive composite)
14. drawLighthouseBeamRim                (existing — ship-edge highlights)
15. drawCemeteryMist                     (existing)
16. drawBirds                            (existing)
17. drawSelection                        (existing)
```

**File structure:**

| File | Status | Responsibility |
|------|--------|----------------|
| `src/renderer/render-types.ts` | modify | Add `wallClockHour: number` to `PharosVilleCanvasMotion`. |
| `src/renderer/layers/sky.ts` | modify | `skyState` reads `motion.wallClockHour`; emit `nightFactor` and recompute `progress`. |
| `src/renderer/layers/sky.test.ts` | create | Unit tests for `skyState` (mood, progress, nightFactor, clamping). |
| `src/renderer/layers/night-tint.ts` | create | `drawNightTint(input)` — single dark fillRect, alpha scaled by nightFactor. |
| `src/renderer/layers/night-tint.test.ts` | create | Unit test for early-return when nightFactor ≤ 0 (mock canvas). |
| `src/renderer/layers/lighthouse.ts` | modify | Add `drawLighthouseNightHighlights(input, cached?)` (additive halo + boosted beam + warm water pool). Add five tunable constants. |
| `src/renderer/world-canvas.ts` | modify | Insert `drawNightTint`, move `drawAtmosphere` after the tint, insert `drawLighthouseNightHighlights`. |
| `src/pharosville-world.tsx` | modify | Compute `wallClockHour` once per frame, populate motion, expose in `__pharosVilleDebug`. |
| `tests/visual/pharosville.spec.ts` | modify | Pin existing tests to noon (`12:00 UTC`); add two new tests for dusk and deep night. Extend the runtime debug snapshot type to include `wallClockHour`. |
| `tests/visual/pharosville.spec.ts-snapshots/` | re-bake | Re-bake all baselines after manual visual review. |
| `playwright.config.ts` | modify | Set `timezoneId: "Etc/UTC"` so `wallClockHour` is reproducible across runners. |

---

## Task 1: Add `wallClockHour` to motion type

**Files:**
- Modify: `src/renderer/render-types.ts:8-12`

- [ ] **Step 1.1: Add `wallClockHour` field to `PharosVilleCanvasMotion`**

In `src/renderer/render-types.ts`, change:

```ts
export interface PharosVilleCanvasMotion {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  timeSeconds: number;
}
```

to:

```ts
export interface PharosVilleCanvasMotion {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * User's local wall-clock hour as a fractional value in [0, 24).
   * Production: derived from `new Date().getHours() + getMinutes()/60`.
   * Tests: injected via Playwright clock + UTC timezone for determinism.
   */
  wallClockHour: number;
}
```

- [ ] **Step 1.2: Run typecheck — expect failures**

Run: `npm run typecheck`
Expected: failures in `pharosville-world.tsx`, `ship-pose.test.ts`, and any other site that constructs `PharosVilleCanvasMotion`. Note the failing files. Do NOT fix yet — fixed in Task 2.

- [ ] **Step 1.3: Commit**

```bash
git add src/renderer/render-types.ts
git commit -m "Add wallClockHour to PharosVilleCanvasMotion"
```

---

## Task 2: Plumb `wallClockHour` through production and tests

**Files:**
- Modify: `src/pharosville-world.tsx:325-346, 380-384, 440-462`
- Modify: `src/renderer/layers/ship-pose.test.ts` (and any other test files reported by typecheck)

- [ ] **Step 2.1: Compute `wallClockHour` in the render loop**

In `src/pharosville-world.tsx`, locate the block at line 325 that computes `timeSeconds`. Immediately after that block (after `timeSeconds = accSecondsRef.current;`) add:

```ts
const wallClockNow = new Date();
const wallClockHour = ((wallClockNow.getHours() + wallClockNow.getMinutes() / 60) % 24 + 24) % 24;
```

- [ ] **Step 2.2: Pass `wallClockHour` into the motion object**

In the same file at the `motion: { plan: activeMotionPlan, reducedMotion, timeSeconds },` site (~line 380), add the new field:

```ts
motion: {
  plan: activeMotionPlan,
  reducedMotion,
  timeSeconds,
  wallClockHour,
},
```

- [ ] **Step 2.3: Expose `wallClockHour` on the debug snapshot**

In the same file, locate the `frameStateRef.current` type definition (~line 48-52):

```ts
const frameStateRef = useRef<{
  samples: ...;
  targets: ...;
  timeSeconds: number;
}>({ samples: new Map(), targets: [], timeSeconds: 0 });
```

Add `wallClockHour: number;` to the type and `, wallClockHour: 0` to the initial value.

In the rAF body, after `nextFrameState.timeSeconds = timeSeconds;` (~line 369), add:

```ts
nextFrameState.wallClockHour = wallClockHour;
```

In the `useEffect` that publishes `__pharosVilleDebug` (~line 440-462), add to the published object:

```ts
wallClockHour: frameState.wallClockHour,
```

In the `PharosVilleDebugState` type at the top of the file (search for `interface PharosVilleDebugState` or the inline type used for `__pharosVilleDebug`), add `wallClockHour: number;`.

- [ ] **Step 2.4: Fix all motion fixtures in unit tests**

Run typecheck:

```bash
npm run typecheck
```

For each file flagged as missing `wallClockHour`, add `wallClockHour: 12` (noon — safe default for tests that don't care about time-of-day) to the offending motion object.

If `src/renderer/layers/ship-pose.test.ts` is flagged, those tests construct shapes that match `Pick<PharosVilleCanvasMotion, "reducedMotion" | "timeSeconds">` — they don't actually need `wallClockHour`. Verify by reading what `resolveShipPose` actually requires; if it doesn't read `wallClockHour`, leave the test inputs alone (the spread `Pick` doesn't require all `PharosVilleCanvasMotion` fields).

- [ ] **Step 2.5: Run typecheck and unit tests — expect green**

```bash
npm run typecheck
npm test
```

Expected: typecheck clean, all unit tests pass. Visual tests not yet updated — don't run them yet.

- [ ] **Step 2.6: Commit**

```bash
git add src/pharosville-world.tsx src/renderer/layers/ship-pose.test.ts
git commit -m "Populate wallClockHour each frame and expose in debug snapshot"
```

(Adjust the staged files to match what you actually changed.)

---

## Task 3: Refactor `skyState` to drive from `wallClockHour` and emit `nightFactor`

**Files:**
- Create: `src/renderer/layers/sky.test.ts`
- Modify: `src/renderer/layers/sky.ts:196-208`

- [ ] **Step 3.1: Write the failing tests**

Create `src/renderer/layers/sky.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { skyState } from "./sky";
import type { PharosVilleCanvasMotion } from "../render-types";

function motionAt(wallClockHour: number, reducedMotion = false): PharosVilleCanvasMotion {
  return {
    // skyState only reads wallClockHour; the rest are required by the type but unused here.
    plan: { lighthouseFireFlickerPerSecond: 1 } as PharosVilleCanvasMotion["plan"],
    reducedMotion,
    timeSeconds: 0,
    wallClockHour,
  };
}

describe("skyState", () => {
  describe("nightFactor", () => {
    it("is 0 at noon", () => {
      expect(skyState(motionAt(12)).nightFactor).toBe(0);
    });

    it("is 1 at midnight (wraps around)", () => {
      expect(skyState(motionAt(0)).nightFactor).toBe(1);
      expect(skyState(motionAt(24)).nightFactor).toBe(1);
    });

    it("is 1 across the night band (20:00–05:00)", () => {
      expect(skyState(motionAt(20)).nightFactor).toBe(1);
      expect(skyState(motionAt(22)).nightFactor).toBe(1);
      expect(skyState(motionAt(2)).nightFactor).toBe(1);
      expect(skyState(motionAt(5)).nightFactor).toBe(1);
    });

    it("ramps linearly across dusk (18:00–20:00)", () => {
      expect(skyState(motionAt(18)).nightFactor).toBe(0);
      expect(skyState(motionAt(19)).nightFactor).toBeCloseTo(0.5, 5);
      expect(skyState(motionAt(20)).nightFactor).toBe(1);
    });

    it("ramps linearly across dawn (05:00–07:00)", () => {
      // 05:00 is the night→dawn boundary; nightFactor should be 1 at the start
      // of the dawn ramp and 0 at the end.
      expect(skyState(motionAt(5)).nightFactor).toBe(1);
      expect(skyState(motionAt(6)).nightFactor).toBeCloseTo(0.5, 5);
      expect(skyState(motionAt(7)).nightFactor).toBe(0);
    });

    it("clamps wallClockHour values outside [0, 24)", () => {
      expect(skyState(motionAt(-1)).nightFactor).toBe(skyState(motionAt(23)).nightFactor);
      expect(skyState(motionAt(25)).nightFactor).toBe(skyState(motionAt(1)).nightFactor);
    });
  });

  describe("mood selection", () => {
    it("returns dawn at 06:00", () => {
      expect(skyState(motionAt(6)).mood.top).toBe("#223b57");
    });

    it("returns day at 12:00", () => {
      expect(skyState(motionAt(12)).mood.top).toBe("#496f8b");
    });

    it("returns dusk at 19:00", () => {
      expect(skyState(motionAt(19)).mood.top).toBe("#151a32");
    });

    it("returns night at 22:00", () => {
      expect(skyState(motionAt(22)).mood.top).toBe("#100b12");
    });

    it("returns night at midnight", () => {
      expect(skyState(motionAt(0)).mood.top).toBe("#100b12");
    });
  });

  describe("progress (celestial arc placement)", () => {
    it("places sun upper-left at 06:00 (progress = 0)", () => {
      expect(skyState(motionAt(6)).progress).toBeCloseTo(0, 5);
    });

    it("places sun at top of arc at 12:00 (progress = 0.25)", () => {
      expect(skyState(motionAt(12)).progress).toBeCloseTo(0.25, 5);
    });

    it("places sun upper-right at 18:00 (progress = 0.5)", () => {
      expect(skyState(motionAt(18)).progress).toBeCloseTo(0.5, 5);
    });
  });

  describe("reduced motion", () => {
    it("uses wallClockHour even when reducedMotion is true", () => {
      // No more frozen progress = 0.58. Reduced motion just suppresses
      // per-frame animation, not the mood selection.
      expect(skyState(motionAt(12, true)).nightFactor).toBe(0);
      expect(skyState(motionAt(22, true)).nightFactor).toBe(1);
    });
  });
});
```

- [ ] **Step 3.2: Run the test — expect failures**

Run: `npx vitest run src/renderer/layers/sky.test.ts`
Expected: All tests fail because `skyState` does not yet read `wallClockHour` and does not return `nightFactor`.

- [ ] **Step 3.3: Rewrite `skyState`**

In `src/renderer/layers/sky.ts`, replace the existing `skyState` function (lines 196-208) with:

```ts
export function skyState(motion: PharosVilleCanvasMotion) {
  const hour = ((motion.wallClockHour % 24) + 24) % 24;
  const mood = hour < 5
    ? SKY_MOODS.night
    : hour < 7
      ? SKY_MOODS.dawn
      : hour < 18
        ? SKY_MOODS.day
        : hour < 20
          ? SKY_MOODS.dusk
          : SKY_MOODS.night;
  const progress = (((hour - 6) / 24) % 1 + 1) % 1;
  const nightFactor = computeNightFactor(hour);
  return { mood, progress, nightFactor };
}

function computeNightFactor(hour: number): number {
  if (hour < 5) return 1;
  if (hour < 7) return 1 - (hour - 5) / 2;
  if (hour < 18) return 0;
  if (hour < 20) return (hour - 18) / 2;
  return 1;
}
```

- [ ] **Step 3.4: Run the test — expect green**

Run: `npx vitest run src/renderer/layers/sky.test.ts`
Expected: All tests pass.

- [ ] **Step 3.5: Run the full unit suite — expect green**

Run: `npm test`
Expected: green. The ambient.ts call to `skyState(motion)` continues to work because the return type is a superset.

- [ ] **Step 3.6: Commit**

```bash
git add src/renderer/layers/sky.ts src/renderer/layers/sky.test.ts
git commit -m "Drive skyState from wallClockHour and emit nightFactor"
```

---

## Task 4: Add `drawNightTint` layer

**Files:**
- Create: `src/renderer/layers/night-tint.ts`
- Create: `src/renderer/layers/night-tint.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `src/renderer/layers/night-tint.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { drawNightTint } from "./night-tint";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

function makeInput(wallClockHour: number, width = 800, height = 600): DrawPharosVilleInput {
  const fillRect = vi.fn();
  const ctx = {
    fillRect,
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const motion: PharosVilleCanvasMotion = {
    plan: { lighthouseFireFlickerPerSecond: 1 } as PharosVilleCanvasMotion["plan"],
    reducedMotion: false,
    timeSeconds: 0,
    wallClockHour,
  };
  const input = {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx,
    height,
    hoveredTarget: null,
    motion,
    selectedTarget: null,
    targets: [],
    width,
    world: {} as DrawPharosVilleInput["world"],
  } as DrawPharosVilleInput;
  return input;
}

describe("drawNightTint", () => {
  it("does not paint during the day (nightFactor = 0)", () => {
    const input = makeInput(12);
    drawNightTint(input);
    expect((input.ctx.fillRect as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("paints a translucent rect at full night", () => {
    const input = makeInput(22);
    drawNightTint(input);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(input.ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it("paints with proportional alpha during dusk", () => {
    const input = makeInput(19); // nightFactor = 0.5
    drawNightTint(input);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
    // The exact fillStyle string is implementation-detail; we just verify
    // a fill happened and the call was made.
  });
});
```

- [ ] **Step 4.2: Run the test — expect failure**

Run: `npx vitest run src/renderer/layers/night-tint.test.ts`
Expected: FAIL — `drawNightTint` not yet defined.

- [ ] **Step 4.3: Implement `drawNightTint`**

Create `src/renderer/layers/night-tint.ts`:

```ts
import type { DrawPharosVilleInput } from "../render-types";
import { skyState } from "./sky";

const MAX_NIGHT_DARKNESS = 0.62;
const NIGHT_TINT_R = 8;
const NIGHT_TINT_G = 14;
const NIGHT_TINT_B = 28;

export function drawNightTint(input: DrawPharosVilleInput): void {
  const { ctx, height, motion, width } = input;
  const { nightFactor } = skyState(motion);
  if (nightFactor <= 0) return;
  const alpha = MAX_NIGHT_DARKNESS * nightFactor;
  ctx.save();
  ctx.fillStyle = `rgba(${NIGHT_TINT_R}, ${NIGHT_TINT_G}, ${NIGHT_TINT_B}, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
```

- [ ] **Step 4.4: Run the test — expect green**

Run: `npx vitest run src/renderer/layers/night-tint.test.ts`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add src/renderer/layers/night-tint.ts src/renderer/layers/night-tint.test.ts
git commit -m "Add drawNightTint layer for global night darkening"
```

---

## Task 5: Add `drawLighthouseNightHighlights`

**Files:**
- Modify: `src/renderer/layers/lighthouse.ts` (append new function and constants)

- [ ] **Step 5.1: Add tunable constants and the new function in `lighthouse.ts`**

In `src/renderer/layers/lighthouse.ts`, near the top of the file (after the existing imports and `LIGHTHOUSE_HEADLAND_SCALE` constant at line 67), add:

```ts
const NIGHT_HALO_OUTER_RADIUS = 320;       // sprite units — extra additive halo at firePoint
const NIGHT_HALO_MAX_ALPHA = 0.55;
const NIGHT_BEAM_ALPHA = 0.22;             // additive beam intensity on top of the existing pulse
const NIGHT_BEAM_LENGTH_BOOST = 0.3;       // wedges reach this much further at full night
const NIGHT_WATER_POOL_RADIUS = 320;       // sprite units — warm pool centered slightly below firePoint
const NIGHT_WATER_POOL_MAX_ALPHA = 0.42;
```

At the end of the file, add:

```ts
export function drawLighthouseNightHighlights(
  input: DrawPharosVilleInput,
  cached?: LighthouseRenderState,
): void {
  const { camera, ctx, motion, world } = input;
  const { nightFactor } = skyStateForNight(motion);
  if (nightFactor <= 0) return;
  if (world.lighthouse.unavailable) return;

  const { firePoint } = cached ?? lighthouseRenderState(input);
  const zoom = camera.zoom;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Warm halo — additive radial centered on firePoint.
  const haloRadius = NIGHT_HALO_OUTER_RADIUS * zoom;
  const haloAlpha = NIGHT_HALO_MAX_ALPHA * nightFactor;
  const halo = ctx.createRadialGradient(
    firePoint.x, firePoint.y, 12 * zoom,
    firePoint.x, firePoint.y, haloRadius,
  );
  halo.addColorStop(0, `rgba(255, 220, 130, ${haloAlpha})`);
  halo.addColorStop(0.35, `rgba(255, 180, 80, ${haloAlpha * 0.4})`);
  halo.addColorStop(1, "rgba(255, 160, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(firePoint.x, firePoint.y, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  // Boosted beam wedges — reach further at night and stack on the existing beam.
  const beamZoom = zoom * 1.35;
  const reach = 1 + NIGHT_BEAM_LENGTH_BOOST * nightFactor;
  ctx.globalAlpha = NIGHT_BEAM_ALPHA * nightFactor;
  ctx.fillStyle = "rgba(255, 234, 160, 1)";
  ctx.beginPath();
  ctx.moveTo(firePoint.x + 4 * beamZoom, firePoint.y - 2 * beamZoom);
  ctx.lineTo(firePoint.x + 250 * beamZoom * reach, firePoint.y - 74 * beamZoom);
  ctx.lineTo(firePoint.x + 228 * beamZoom * reach, firePoint.y + 28 * beamZoom);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(firePoint.x - 5 * beamZoom, firePoint.y);
  ctx.lineTo(firePoint.x - 168 * beamZoom * reach, firePoint.y - 42 * beamZoom);
  ctx.lineTo(firePoint.x - 154 * beamZoom * reach, firePoint.y + 25 * beamZoom);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.restore();

  // Warm water pool — centered slightly below firePoint, drawn with default
  // composite (source-over) so it warms the dark water rather than over-saturating.
  ctx.save();
  const poolY = firePoint.y + 36 * zoom;
  const poolRadius = NIGHT_WATER_POOL_RADIUS * zoom;
  const poolAlpha = NIGHT_WATER_POOL_MAX_ALPHA * nightFactor;
  const pool = ctx.createRadialGradient(
    firePoint.x, poolY, 18 * zoom,
    firePoint.x, poolY, poolRadius,
  );
  pool.addColorStop(0, `rgba(255, 175, 90, ${poolAlpha})`);
  pool.addColorStop(0.4, `rgba(245, 150, 65, ${poolAlpha * 0.45})`);
  pool.addColorStop(1, "rgba(245, 150, 65, 0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(firePoint.x, poolY, poolRadius, poolRadius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

Add a local helper at the top of `lighthouse.ts` (after the imports) so the file doesn't have a circular import on `sky.ts` — the existing file already does not import `skyState`, and we want to keep it that way:

```ts
import { skyState as skyStateForNight } from "./sky";
```

(If `lighthouse.ts` already has an import block, add the import alongside — adjust the ordering to keep it tidy.)

- [ ] **Step 5.2: Add a unit test for the early-return path**

Append to `src/renderer/layers/lighthouse.ts`-tests if a test file already exists; otherwise create `src/renderer/layers/lighthouse-night.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { drawLighthouseNightHighlights } from "./lighthouse";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

function makeInput(wallClockHour: number): DrawPharosVilleInput {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    set fillStyle(_v: unknown) {},
    set globalAlpha(_v: number) {},
    set globalCompositeOperation(_v: string) {},
  } as unknown as CanvasRenderingContext2D;
  const motion: PharosVilleCanvasMotion = {
    plan: { lighthouseFireFlickerPerSecond: 1 } as PharosVilleCanvasMotion["plan"],
    reducedMotion: false,
    timeSeconds: 0,
    wallClockHour,
  };
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx,
    height: 600,
    hoveredTarget: null,
    motion,
    selectedTarget: null,
    targets: [],
    width: 800,
    world: {
      lighthouse: { tile: { x: 18, y: 30 }, color: "#fff", unavailable: false },
      ships: [],
    } as unknown as DrawPharosVilleInput["world"],
  } as DrawPharosVilleInput;
}

describe("drawLighthouseNightHighlights", () => {
  it("does nothing during the day", () => {
    const input = makeInput(12);
    drawLighthouseNightHighlights(input);
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });

  it("draws halo, beams, and water pool at night", () => {
    const input = makeInput(22);
    drawLighthouseNightHighlights(input);
    // 1 halo arc + 2 beam wedges + 1 pool ellipse = 4 fill calls.
    expect((input.ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("does nothing when the lighthouse is unavailable", () => {
    const input = makeInput(22);
    (input.world as { lighthouse: { unavailable: boolean } }).lighthouse.unavailable = true;
    drawLighthouseNightHighlights(input);
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.3: Run the test — expect green (or fix small mismatches)**

Run: `npx vitest run src/renderer/layers/lighthouse-night.test.ts`
Expected: PASS. If a setter mock complains, switch to a `Proxy`-based ctx mock or use `Object.defineProperty` for `fillStyle`/`globalAlpha`/`globalCompositeOperation`.

- [ ] **Step 5.4: Run typecheck and full unit suite**

```bash
npm run typecheck
npm test
```

Expected: green.

- [ ] **Step 5.5: Commit**

```bash
git add src/renderer/layers/lighthouse.ts src/renderer/layers/lighthouse-night.test.ts
git commit -m "Add drawLighthouseNightHighlights additive overlay"
```

---

## Task 6: Wire the new layers into `world-canvas.ts`

**Files:**
- Modify: `src/renderer/world-canvas.ts:5, 15, 167-183`

- [ ] **Step 6.1: Add the imports**

In `src/renderer/world-canvas.ts`, add to the existing `./layers/lighthouse` import line (line 15):

```ts
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseSurf, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
```

Add a new import line below the existing `./layers/sky` import:

```ts
import { drawNightTint } from "./layers/night-tint";
```

- [ ] **Step 6.2: Reorder the render pipeline in `drawPharosVille`**

In `drawPharosVille` (~lines 167-183), change:

```ts
drawSky(input, frame.lighthouseRender);

const visibleTileCount = countVisibleTiles(input);
drawStaticPassCached(input, frame, "terrain", paintStaticTerrainPass);
drawWaterTerrainOverlays(input);
drawStaticPassCached(input, frame, "scene", paintStaticScenePass);
drawCoastalWaterDetails(input);
drawAtmosphere(input, frame.lighthouseRender);
drawLighthouseSurf(input);
const entityMetrics = drawEntityPass(input, frame);
drawLighthouseBeamRim(input, frame.visibleShips, frame.lighthouseRender);
drawWaterAreaLabels(input);
drawEthereumHarborSigns(input);
drawDecorativeLights(input);
drawCemeteryMist(input);
drawBirds(input);
```

to:

```ts
drawSky(input, frame.lighthouseRender);

const visibleTileCount = countVisibleTiles(input);
drawStaticPassCached(input, frame, "terrain", paintStaticTerrainPass);
drawWaterTerrainOverlays(input);
drawStaticPassCached(input, frame, "scene", paintStaticScenePass);
drawCoastalWaterDetails(input);
drawLighthouseSurf(input);
const entityMetrics = drawEntityPass(input, frame);
drawWaterAreaLabels(input);
drawEthereumHarborSigns(input);
drawNightTint(input);
drawAtmosphere(input, frame.lighthouseRender);
drawLighthouseNightHighlights(input, frame.lighthouseRender);
drawDecorativeLights(input);
drawLighthouseBeamRim(input, frame.visibleShips, frame.lighthouseRender);
drawCemeteryMist(input);
drawBirds(input);
```

Three changes from the prior order:

1. `drawAtmosphere` moved from before `drawLighthouseSurf` to after `drawNightTint`.
2. `drawNightTint` and `drawLighthouseNightHighlights` inserted post-entity-pass.
3. `drawLighthouseBeamRim` moved from immediately after the entity pass to after `drawDecorativeLights`, so the bright ship-edge highlights remain visible on top of the night tint.

- [ ] **Step 6.3: Run typecheck and unit tests**

```bash
npm run typecheck
npm test
```

Expected: green.

- [ ] **Step 6.4: Manual smoke check in dev**

Run: `npm run dev`
Open http://localhost:5173 in a browser.

The current wall-clock time on your machine determines the appearance:
- 07:00–18:00: scene should look unchanged from before (nightFactor = 0).
- 20:00–05:00: scene should be visibly darker; lighthouse halo + beams + warm water pool should be prominent.
- Dusk/dawn: smooth transition.

If you can't easily wait for nightfall, temporarily hack `motion.wallClockHour = 22` in `pharosville-world.tsx` to verify the night render, then revert before committing.

- [ ] **Step 6.5: Commit**

```bash
git add src/renderer/world-canvas.ts
git commit -m "Wire night tint and lighthouse highlights into render pipeline"
```

---

## Task 7: Configure Playwright for deterministic timezone

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 7.1: Set `timezoneId` in the Playwright config**

In `playwright.config.ts`, change:

```ts
use: {
  ...devices["Desktop Chrome"],
  baseURL: "http://127.0.0.1:4173",
  viewport: { width: 1440, height: 960 },
  trace: "on-first-retry",
},
```

to:

```ts
use: {
  ...devices["Desktop Chrome"],
  baseURL: "http://127.0.0.1:4173",
  viewport: { width: 1440, height: 960 },
  trace: "on-first-retry",
  timezoneId: "Etc/UTC",
},
```

This makes `new Date().getHours()` in the browser return UTC hours, so `wallClockHour` is reproducible across runners regardless of host TZ.

- [ ] **Step 7.2: Commit**

```bash
git add playwright.config.ts
git commit -m "Pin Playwright timezone to UTC for deterministic wall-clock"
```

---

## Task 8: Update visual tests — pin existing to noon, add dusk and night

**Files:**
- Modify: `tests/visual/pharosville.spec.ts`

- [ ] **Step 8.1: Extend the runtime debug snapshot type**

In `tests/visual/pharosville.spec.ts`, find the `PharosVilleVisualDebug` type that includes `timeSeconds?: number;` (~line 85) and add:

```ts
wallClockHour?: number;
```

Find the `waitForRuntimeDebug` and `readRuntimeSnapshot` helpers (~line 1081-1115) and ensure `wallClockHour` is read from the debug object the same way `timeSeconds` is. Where the snapshot object is constructed:

```ts
{
  reducedMotion: debug?.reducedMotion ?? null,
  ...
  timeSeconds: debug?.timeSeconds ?? -1,
}
```

Add:

```ts
wallClockHour: debug?.wallClockHour ?? -1,
```

- [ ] **Step 8.2: Pin all existing tests to noon (12:00 UTC)**

For every `test(...)` block in `tests/visual/pharosville.spec.ts` that calls `await page.goto("/")`, insert (before the `goto`):

```ts
await page.clock.install({ time: new Date("2026-04-28T12:00:00Z") });
```

If a test already calls `page.clock.install` (search the file — currently only line 1037 does), leave that test alone; the explicit time it installs is fine. For all other tests, default to noon.

- [ ] **Step 8.3: Add a deep-night visual test**

Append to `tests/visual/pharosville.spec.ts`:

```ts
test.describe("pharosville night", () => {
  test("renders deep-night atmosphere with dominant lighthouse glow", async ({ page }) => {
    await mockPharosVilleData(page);
    await page.clock.install({ time: new Date("2026-04-28T22:00:00Z") });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await page.waitForFunction(() => {
      const debug = (window as typeof window & {
        __pharosVilleDebug?: { wallClockHour?: number };
      }).__pharosVilleDebug;
      return debug?.wallClockHour !== undefined && debug.wallClockHour >= 21.5 && debug.wallClockHour < 22.5;
    });
    await expect(page).toHaveScreenshot("pharosville-night.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });

  test("renders dusk transition with partial night tint", async ({ page }) => {
    await mockPharosVilleData(page);
    await page.clock.install({ time: new Date("2026-04-28T19:00:00Z") });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await page.waitForFunction(() => {
      const debug = (window as typeof window & {
        __pharosVilleDebug?: { wallClockHour?: number };
      }).__pharosVilleDebug;
      return debug?.wallClockHour !== undefined && debug.wallClockHour >= 18.5 && debug.wallClockHour < 19.5;
    });
    await expect(page).toHaveScreenshot("pharosville-dusk.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });
});
```

(Adjust the `mockPharosVilleData` import / helper name if the new tests are placed in a section where it must be re-resolved.)

- [ ] **Step 8.4: Run typecheck and unit tests**

```bash
npm run typecheck
npm test
```

Expected: green.

- [ ] **Step 8.5: Commit (without re-baking baselines yet)**

```bash
git add tests/visual/pharosville.spec.ts
git commit -m "Pin visual tests to noon and add dusk and deep-night cases"
```

---

## Task 9: Re-bake visual baselines

**Files:**
- Re-bake: `tests/visual/pharosville.spec.ts-snapshots/**`

- [ ] **Step 9.1: Run the visual suite — expect failures**

```bash
npm run test:visual
```

Expected: most baselines fail because (a) all noon-pinned tests now render the "day" mood (was: frozen `progress = 0.58` rendering dusk), and (b) the new `pharosville-night.png` and `pharosville-dusk.png` baselines do not yet exist.

- [ ] **Step 9.2: Inspect the diffs — manual review (CRITICAL)**

For each failing test, open the diff image at `test-results/<test-name>/<file>-diff.png`. Confirm the drift is intentional:

- Day tests: should look brighter and more golden than the previous "frozen dusk" baselines, with no other unexpected differences.
- Dusk test: should show a partial dark tint (~31% darkening, since `nightFactor ≈ 0.5`) plus a visibly stronger lighthouse glow.
- Night test: should show ~62% darkening, dominant lighthouse halo, warm water pool around the headland, brighter sweeping beams.

If anything else looks wrong (e.g., a ship missing, a label clipped), STOP and investigate before re-baking.

- [ ] **Step 9.3: Update baselines**

Once the diffs are accepted:

```bash
npm run test:visual -- --update-snapshots
```

- [ ] **Step 9.4: Re-run visual suite — expect green**

```bash
npm run test:visual
```

Expected: PASS.

- [ ] **Step 9.5: Commit baselines**

```bash
git add tests/visual/pharosville.spec.ts-snapshots
git commit -m "Re-bake visual baselines for day, dusk, and night moods"
```

---

## Task 10: Full validation

**Files:** None — verification only.

- [ ] **Step 10.1: Run the full validation sequence**

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

All commands must exit 0. If any fails, fix the underlying issue and re-run before claiming completion.

- [ ] **Step 10.2: In-browser tuning (one round)**

Run `npm run dev` and view the page near 22:00 local time (or temporarily hack `wallClockHour = 22` to force night, reverting before commit). Sanity-check:

- World is darker than before but not flat black.
- Lighthouse halo is the brightest thing on screen.
- Beams reach further into the dark water.
- Warm pool warms the headland and the water immediately around it.
- Village lamps remain visible as warm pinpricks.
- Ship-beam edge highlighting still works.

If the night reads as flat gray, raise `MAX_NIGHT_DARKNESS` toward 0.7 in `night-tint.ts`.
If lighthouse contrast is insufficient, raise `NIGHT_HALO_MAX_ALPHA` and `NIGHT_BEAM_ALPHA` in `lighthouse.ts`.
If the warm pool dominates, lower `NIGHT_WATER_POOL_MAX_ALPHA`.

If you tune any constants, re-run Task 9 to re-bake baselines and commit.

- [ ] **Step 10.3: Final commit (only if Step 10.2 changed anything)**

```bash
git add src/renderer/layers/night-tint.ts src/renderer/layers/lighthouse.ts tests/visual/pharosville.spec.ts-snapshots
git commit -m "Tune night-tint and lighthouse highlight constants after visual review"
```

---

## Self-Review

**Spec coverage:**
- [x] Cycle driver = real local time → Tasks 2, 3.
- [x] Continuous `nightFactor` ∈ [0, 1] with linear dawn/dusk ramps → Task 3.
- [x] Hour bands (5/7/18/20) → Task 3.
- [x] Reduced motion uses wall clock (no frozen progress) → Task 3.
- [x] Sky `progress` derivation `= ((wallClockHour - 6)/24) mod 1` → Task 3.
- [x] Single global tint pass between world content and lights → Tasks 4, 6.
- [x] Lighthouse halo, beam, and water-pool boost → Task 5 (additive overlay refinement of spec Section 3 — see top of plan).
- [x] `MAX_NIGHT_DARKNESS = 0.62` starting tunable → Task 4.
- [x] `drawAtmosphere` moved post-tint → Task 6.
- [x] Hard sky-mood color switches retained (Approach B1) → Task 3.
- [x] Test injection via `wallClockHour` motion field → Task 1, Task 8.
- [x] Visual tests pinned to noon, plus new dusk and night cases → Task 8.
- [x] Visual baseline re-bake with manual diff review → Task 9.
- [x] Full validation gate → Task 10.

**Placeholder scan:** no TBD/TODO/"add appropriate" placeholders. Each step shows the actual code or the actual command.

**Type consistency:** `wallClockHour: number` is the same name in `PharosVilleCanvasMotion` (Task 1), `pharosville-world.tsx` (Task 2), `skyState` consumers (Task 3), test helpers (Tasks 3-5), debug snapshot (Tasks 2, 8), and Playwright assertions (Task 8). `nightFactor` is the same name in `skyState` (Task 3), `drawNightTint` (Task 4), and `drawLighthouseNightHighlights` (Task 5).

**Scope:** Single feature, single PR, no decomposition needed.

**Ambiguity:** Tunable constants are starting values; in-browser tuning is an explicit step (10.2). Visual diffs are reviewed manually before baseline updates (9.2).

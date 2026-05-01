# Lighthouse Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PharosVille world become much darker after sunset (driven by the user's real local time) and make the lighthouse the dominant light source in that dark world.

**Architecture:** Drive a continuous `nightFactor` ∈ [0, 1] from `motion.wallClockHour`, populated each frame from `new Date()` (or pinned to 12 for reduced-motion users). `drawPharosVille` computes `skyState(motion)` once per frame and passes `nightFactor` as a parameter to the new layers — neither `night-tint.ts` nor `lighthouse.ts` imports `sky.ts`, avoiding the circular import that would otherwise occur (sky.ts already imports from lighthouse.ts). Render the world normally, then a single `drawNightTint` translucent dark-rect pass darkens everything. After the tint, `drawLighthouseNightHighlights` adds an additive halo + boosted beam + warm water pool around the lighthouse. The existing village lamps (already additive composite) and beam-rim ship illumination shine through. No per-layer mood-aware palette work — uniform global tint plus selective additive highlights.

**Tech Stack:** TypeScript, React, HTML5 Canvas 2D, Vitest (unit), Playwright (visual baselines).

**Spec:** [`docs/superpowers/specs/2026-05-01-lighthouse-night-design.md`](../specs/2026-05-01-lighthouse-night-design.md)

**Plan refinements vs spec:** Two intentional deviations from the original spec, both reflected in the spec's "Implementation note" and "Components" sections:

1. **No internal modification of `drawLighthouseFire`/`drawLighthouseBeam`.** A separate `drawLighthouseNightHighlights` runs post-tint and additively re-lights the lighthouse area. Reasons: (a) the production sprite path skips `drawLighthouseFire` entirely (`drawLighthouseOverlay` returns early when the asset is loaded), so internal scaling there delivers nothing in production; (b) the existing beam draws inside `drawEntityPass` with depth z-ordering against ships — keeping it in place avoids regressions.
2. **`nightFactor` passed as a parameter, not derived inside layers.** Avoids a circular import between `lighthouse.ts` and `sky.ts` (sky.ts already imports `lighthouseRenderState` from `lighthouse.ts`). `skyState` is computed exactly once per frame in `drawPharosVille`.

**Render order (after this plan):**

```
1.  drawSky                              (existing — mood-aware backdrop)
2.  drawStaticPassCached "terrain"       (existing — cached)
3.  drawWaterTerrainOverlays             (existing)
4.  drawStaticPassCached "scene"         (existing — cached, includes drawLighthouseHeadland)
5.  drawCoastalWaterDetails              (existing)
6.  drawLighthouseSurf                   (existing)
7.  drawEntityPass                       (existing — ships/docks/graves/lighthouse body+overlay incl. existing beam/fire)
8.  drawWaterAreaLabels                  (existing — darkened by tint, still readable)
9.  drawEthereumHarborSigns              (existing — same)
10. drawNightTint                        (NEW — single fillRect, dark blue, alpha = MAX_NIGHT_DARKNESS * nightFactor)
11. drawAtmosphere                       (MOVED — was step ≈6; now post-tint so mist reads against night)
12. drawLighthouseNightHighlights        (NEW — additive halo + boosted beam + warm water pool)
13. drawDecorativeLights                 (existing — village lamps; already use additive composite)
14. drawLighthouseBeamRim                (MOVED — was right after entity pass; now after lamps so ship-edge highlights shine through)
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
| `src/renderer/layers/night-tint.ts` | create | `drawNightTint(input, nightFactor)` — single dark fillRect, alpha scaled by nightFactor. Does NOT import sky.ts. |
| `src/renderer/layers/night-tint.test.ts` | create | Unit test for early-return when nightFactor ≤ 0 (mock canvas). |
| `src/renderer/layers/lighthouse.ts` | modify | Add `drawLighthouseNightHighlights(input, cached, nightFactor)` (additive halo + boosted beam + warm water pool). Update `lighthouseOverlayScreenBounds` to extend with the night beam length boost. Add six tunable constants. Does NOT import sky.ts. |
| `src/renderer/layers/lighthouse-night.test.ts` | create | Unit tests for the new function and screen bounds. |
| `src/renderer/world-canvas.ts` | modify | Compute `skyState` once per frame; pass `nightFactor` to the new layers; insert them; reorder `drawAtmosphere` and `drawLighthouseBeamRim`. |
| `src/pharosville-world.tsx` | modify | Compute `wallClockHour` once per frame (pinned to 12 for reduced-motion); populate motion; expose in `__pharosVilleDebug`. |
| `tests/visual/pharosville.spec.ts` | modify | Add `installWallClockOverride(page, hour)` helper using `page.addInitScript` (NOT `page.clock.install`). Pin all existing tests to hour 12. Add three new tests (dawn 6, dusk 19, night 22). Extend the runtime debug snapshot type to include `wallClockHour`. |
| `tests/visual/pharosville.spec.ts-snapshots/` | re-bake | Re-bake all baselines after manual visual review. |

**`playwright.config.ts` is NOT modified** — the `installWallClockOverride` helper sets the hour explicitly via `Date.prototype` overrides, so the host machine's timezone doesn't affect the rendered hour.

---

## Task 1: Add `wallClockHour` and plumb it through (single commit)

This task combines the type addition with all consumer fixes so we never commit a state where `npm run typecheck` fails.

**Files:**
- Modify: `src/renderer/render-types.ts:8-12`
- Modify: `src/pharosville-world.tsx` (the rAF body and the debug-snapshot effect)

- [ ] **Step 1.1: Add `wallClockHour` to `PharosVilleCanvasMotion`**

In `src/renderer/render-types.ts`, replace the existing interface (lines 8-12):

```ts
export interface PharosVilleCanvasMotion {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * User's local wall-clock hour as a fractional value in [0, 24).
   * Production: derived from `new Date().getHours() + getMinutes()/60` (or 12
   * when reducedMotion is true, so RM users get a stable noon scene).
   * Tests: overridden via `installWallClockOverride(page, hour)` (Playwright
   * `addInitScript` overriding `Date.prototype.getHours`/`getMinutes`).
   */
  wallClockHour: number;
}
```

- [ ] **Step 1.2: Compute `wallClockHour` in the render loop**

In `src/pharosville-world.tsx`, locate the block at line 325-341 that computes `timeSeconds`. Immediately after `timeSeconds = accSecondsRef.current;` (line 340) and before `const shipMotionSamples = ...` (line 342), insert:

```ts
let wallClockHour: number;
if (reducedMotion) {
  // Reduced-motion users: pin to noon for a stable, drift-free scene every visit.
  // Mirrors the prior behavior where reducedMotion forced a fixed sky-state progress.
  wallClockHour = 12;
} else {
  const wallClockNow = new Date();
  wallClockHour = ((wallClockNow.getHours() + wallClockNow.getMinutes() / 60) % 24 + 24) % 24;
}
```

- [ ] **Step 1.3: Pass `wallClockHour` into the motion object**

In the same file, find the `motion: { plan: activeMotionPlan, reducedMotion, timeSeconds },` site (~line 380-384) and add the new field:

```ts
motion: {
  plan: activeMotionPlan,
  reducedMotion,
  timeSeconds,
  wallClockHour,
},
```

- [ ] **Step 1.4: Expose `wallClockHour` on `frameStateRef` and the debug snapshot**

In the same file, locate the `frameStateRef` type at lines 48-52:

```ts
const frameStateRef = useRef<{
  samples: ...;  // existing types preserved
  targets: ...;
  timeSeconds: number;
}>({ samples: new Map(), targets: [], timeSeconds: 0 });
```

Add `wallClockHour: number;` to the inline type and `, wallClockHour: 0` to the initial value.

In the rAF body, after `nextFrameState.timeSeconds = timeSeconds;` (~line 369), add:

```ts
nextFrameState.wallClockHour = wallClockHour;
```

In the `useEffect` that publishes `__pharosVilleDebug` (~line 440-462), add to the published object alongside `timeSeconds: frameState.timeSeconds,`:

```ts
wallClockHour: frameState.wallClockHour,
```

In the inline type for `__pharosVilleDebug?` (search for `interface PharosVilleDebugState` at the top of the file, or the inline window-cast types), add `wallClockHour: number;`.

- [ ] **Step 1.5: Search the rest of the codebase for fixture sites that need updating**

Run:

```bash
grep -rn "timeSeconds:" src tests --include="*.ts" --include="*.tsx" | grep -v "PharosVilleCanvasMotion\|interface\|type "
```

For each construction of a `PharosVilleCanvasMotion`-shaped object (the search will surface them), add `wallClockHour: 12` (noon — safe default for tests that don't care about time-of-day).

In particular check `src/renderer/layers/ship-pose.test.ts` — those tests construct `Pick<PharosVilleCanvasMotion, ...>`-style shapes, NOT full `PharosVilleCanvasMotion`. They likely don't need `wallClockHour`. Verify by reading what `resolveShipPose` actually requires — if it doesn't read `wallClockHour`, leave them alone.

- [ ] **Step 1.6: Run typecheck and unit tests — must be green**

```bash
npm run typecheck
npm test
```

Expected: green. If any test or production site is missing `wallClockHour`, fix it now (not in a follow-up commit).

- [ ] **Step 1.7: Commit**

```bash
git add src/renderer/render-types.ts src/pharosville-world.tsx
# plus any test fixture files you needed to update in 1.5
git commit -m "Add wallClockHour to motion and plumb it through frame loop"
```

---

## Task 2: Refactor `skyState` to drive from `wallClockHour` and emit `nightFactor`

**Files:**
- Create: `src/renderer/layers/sky.test.ts`
- Modify: `src/renderer/layers/sky.ts:196-208`

- [ ] **Step 2.1: Write the failing tests**

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
    it("places sun at horizon-left at 06:00 (progress = 0)", () => {
      expect(skyState(motionAt(6)).progress).toBeCloseTo(0, 5);
    });

    it("places sun at top of arc at 12:00 (progress = 0.25)", () => {
      expect(skyState(motionAt(12)).progress).toBeCloseTo(0.25, 5);
    });

    it("places sun at horizon-right at 18:00 (progress = 0.5)", () => {
      expect(skyState(motionAt(18)).progress).toBeCloseTo(0.5, 5);
    });
  });

  describe("reduced motion", () => {
    it("uses wallClockHour even when reducedMotion is true", () => {
      // skyState is a pure function of wallClockHour. The reduced-motion
      // pin happens at the producer (pharosville-world.tsx), not here.
      expect(skyState(motionAt(12, true)).nightFactor).toBe(0);
      expect(skyState(motionAt(22, true)).nightFactor).toBe(1);
    });
  });
});
```

- [ ] **Step 2.2: Run the test — expect failures**

Run: `npx vitest run src/renderer/layers/sky.test.ts`
Expected: All tests fail because `skyState` does not yet read `wallClockHour` and does not return `nightFactor`.

- [ ] **Step 2.3: Rewrite `skyState`**

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

- [ ] **Step 2.4: Run the test — expect green**

```bash
npx vitest run src/renderer/layers/sky.test.ts
npm test
```

Expected: green.

- [ ] **Step 2.5: Commit**

```bash
git add src/renderer/layers/sky.ts src/renderer/layers/sky.test.ts
git commit -m "Drive skyState from wallClockHour and emit nightFactor"
```

---

## Task 3: Add `drawNightTint` layer

`drawNightTint` accepts `nightFactor` as an explicit parameter — it does **not** import `sky.ts` (kept import-clean for the eventual `lighthouse.ts` callsite).

**Files:**
- Create: `src/renderer/layers/night-tint.ts`
- Create: `src/renderer/layers/night-tint.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/renderer/layers/night-tint.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { drawNightTint } from "./night-tint";
import type { DrawPharosVilleInput } from "../render-types";

function makeInput(width = 800, height = 600): DrawPharosVilleInput {
  const fillRect = vi.fn();
  const ctx = {
    fillRect,
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx,
    height,
    hoveredTarget: null,
    motion: {
      plan: {} as DrawPharosVilleInput["motion"]["plan"],
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 0,
    },
    selectedTarget: null,
    targets: [],
    width,
    world: {} as DrawPharosVilleInput["world"],
  } as DrawPharosVilleInput;
}

describe("drawNightTint", () => {
  it("does nothing when nightFactor is 0", () => {
    const input = makeInput();
    drawNightTint(input, 0);
    expect(input.ctx.fillRect).not.toHaveBeenCalled();
  });

  it("does nothing when nightFactor is negative (defensive)", () => {
    const input = makeInput();
    drawNightTint(input, -0.1);
    expect(input.ctx.fillRect).not.toHaveBeenCalled();
  });

  it("paints a translucent rect at full night (nightFactor = 1)", () => {
    const input = makeInput(800, 600);
    drawNightTint(input, 1);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(input.ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it("paints at partial alpha during dusk (nightFactor = 0.5)", () => {
    const input = makeInput();
    drawNightTint(input, 0.5);
    expect(input.ctx.fillRect).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.2: Run the test — expect failure**

Run: `npx vitest run src/renderer/layers/night-tint.test.ts`
Expected: FAIL — `drawNightTint` not yet defined.

- [ ] **Step 3.3: Implement `drawNightTint`**

Create `src/renderer/layers/night-tint.ts`:

```ts
import type { DrawPharosVilleInput } from "../render-types";

const MAX_NIGHT_DARKNESS = 0.62;
const NIGHT_TINT_R = 8;
const NIGHT_TINT_G = 14;
const NIGHT_TINT_B = 28;

export function drawNightTint(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { ctx, height, width } = input;
  const alpha = MAX_NIGHT_DARKNESS * nightFactor;
  ctx.save();
  ctx.fillStyle = `rgba(${NIGHT_TINT_R}, ${NIGHT_TINT_G}, ${NIGHT_TINT_B}, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
```

- [ ] **Step 3.4: Run the test — expect green**

```bash
npx vitest run src/renderer/layers/night-tint.test.ts
npm test
```

Expected: green.

- [ ] **Step 3.5: Commit**

```bash
git add src/renderer/layers/night-tint.ts src/renderer/layers/night-tint.test.ts
git commit -m "Add drawNightTint layer with nightFactor parameter"
```

---

## Task 4: Add `drawLighthouseNightHighlights` and extend `lighthouseOverlayScreenBounds`

Both new behaviors take `nightFactor` as a parameter — no import of `sky.ts`.

**Files:**
- Modify: `src/renderer/layers/lighthouse.ts`
- Create: `src/renderer/layers/lighthouse-night.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `src/renderer/layers/lighthouse-night.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { drawLighthouseNightHighlights, lighthouseOverlayScreenBounds } from "./lighthouse";
import type { DrawPharosVilleInput } from "../render-types";

function makeCtx() {
  const ctx: Record<string, unknown> = {
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
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function makeInput(unavailable = false): DrawPharosVilleInput {
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx: makeCtx(),
    height: 600,
    hoveredTarget: null,
    motion: {
      plan: { lighthouseFireFlickerPerSecond: 1 } as DrawPharosVilleInput["motion"]["plan"],
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 0,
    },
    selectedTarget: null,
    targets: [],
    width: 800,
    world: {
      lighthouse: { tile: { x: 18, y: 30 }, color: "#ffd877", unavailable },
      ships: [],
    } as unknown as DrawPharosVilleInput["world"],
  } as DrawPharosVilleInput;
}

describe("drawLighthouseNightHighlights", () => {
  it("does nothing when nightFactor is 0", () => {
    const input = makeInput();
    drawLighthouseNightHighlights(input, undefined, 0);
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });

  it("does nothing when the lighthouse is unavailable", () => {
    const input = makeInput(true);
    drawLighthouseNightHighlights(input, undefined, 1);
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });

  it("draws halo + 2 beam wedges + 1 water pool at full night (≥ 4 fills)", () => {
    const input = makeInput();
    drawLighthouseNightHighlights(input, undefined, 1);
    const fillMock = input.ctx.fill as unknown as ReturnType<typeof vi.fn>;
    expect(fillMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("lighthouseOverlayScreenBounds extends with nightFactor", () => {
  it("returns a wider rect at full night than at noon", () => {
    const input = makeInput();
    const selectionRect = { x: 0, y: 0, width: 100, height: 100 };
    const noon = lighthouseOverlayScreenBounds(input, selectionRect, undefined, 0);
    const night = lighthouseOverlayScreenBounds(input, selectionRect, undefined, 1);
    expect(night.width).toBeGreaterThan(noon.width);
  });
});
```

- [ ] **Step 4.2: Run the test — expect failure**

Run: `npx vitest run src/renderer/layers/lighthouse-night.test.ts`
Expected: FAIL — `drawLighthouseNightHighlights` not yet defined; `lighthouseOverlayScreenBounds` doesn't accept the new param.

- [ ] **Step 4.3: Add constants and the new function in `lighthouse.ts`**

In `src/renderer/layers/lighthouse.ts`, after the existing `LIGHTHOUSE_HEADLAND_SCALE` constant (line 67), add:

```ts
const NIGHT_HALO_OUTER_RADIUS = 320;       // sprite units — additive halo at firePoint
const NIGHT_HALO_MAX_ALPHA = 0.55;
const NIGHT_BEAM_ALPHA = 0.22;             // additive beam intensity on top of the existing pulse
const NIGHT_BEAM_LENGTH_BOOST = 0.3;       // wedges reach this much further at full night
const NIGHT_WATER_POOL_RADIUS = 280;       // sprite units — warm pool centered slightly below firePoint
const NIGHT_WATER_POOL_MAX_ALPHA = 0.35;
```

At the end of the file, append:

```ts
export function drawLighthouseNightHighlights(
  input: DrawPharosVilleInput,
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
): void {
  if (nightFactor <= 0) return;
  if (input.world.lighthouse.unavailable) return;

  const { camera, ctx } = input;
  const { firePoint } = cached ?? lighthouseRenderState(input);
  const zoom = camera.zoom;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Warm halo — additive radial centered on firePoint, large enough to wash
  // warmth onto the headland sprite below.
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
  // composite (source-over) so it warms the dark water without over-saturating.
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

- [ ] **Step 4.4: Update `lighthouseOverlayScreenBounds` to accept `nightFactor`**

`lighthouseOverlayScreenBounds` is used by `entity-pass` to compute the union rect of the selection-target and the beam wedges (so click reach extends into the lit beam). The hard-coded magnitudes are 250, 168, 228, 154. At night, the boosted beam length is `× (1 + NIGHT_BEAM_LENGTH_BOOST * nightFactor)`. Update the signature and apply the same multiplier.

In `src/renderer/layers/lighthouse.ts`, find the existing function signature (~line 78-101) and modify:

```ts
export function lighthouseOverlayScreenBounds(
  input: DrawPharosVilleInput,
  selectionRect: { height: number; width: number; x: number; y: number },
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
): { height: number; width: number; x: number; y: number } {
  const { firePoint } = cached ?? lighthouseRenderState(input);
  const beamZoom = input.camera.zoom * 1.35;
  const reach = 1 + NIGHT_BEAM_LENGTH_BOOST * nightFactor;
  const beamBounds = {
    height: 120 * beamZoom,
    width: 436 * beamZoom * reach,
    x: firePoint.x - 176 * beamZoom * reach,
    y: firePoint.y - 82 * beamZoom,
  };
  const minX = Math.min(selectionRect.x, beamBounds.x);
  const minY = Math.min(selectionRect.y, beamBounds.y);
  const maxX = Math.max(selectionRect.x + selectionRect.width, beamBounds.x + beamBounds.width);
  const maxY = Math.max(selectionRect.y + selectionRect.height, beamBounds.y + beamBounds.height);
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}
```

The signature change is a breaking change for callers — Step 5.2 fixes the one callsite in `world-canvas.ts`.

- [ ] **Step 4.5: Run the new tests — expect green**

```bash
npx vitest run src/renderer/layers/lighthouse-night.test.ts
```

Expected: green.

- [ ] **Step 4.6: Run typecheck — expect failures from `world-canvas.ts`**

```bash
npm run typecheck
```

Expected: TypeScript will flag `lighthouseOverlayScreenBounds` callsite in `world-canvas.ts` as missing the new `nightFactor` argument. That's fixed in Task 5. Don't commit yet.

- [ ] **Step 4.7: Run the full unit suite (it should pass — typecheck failure is a separate command)**

```bash
npm test
```

Expected: green.

- [ ] **Step 4.8: Commit (typecheck still red — Task 5 fixes it; this is a single commit because the function pair must be reviewed together)**

```bash
git add src/renderer/layers/lighthouse.ts src/renderer/layers/lighthouse-night.test.ts
git commit -m "Add drawLighthouseNightHighlights and extend overlay bounds for night beams"
```

(Yes, typecheck is red here because `world-canvas.ts` hasn't been updated. Task 5 fixes it in the very next commit. Tests pass on their own.)

---

## Task 5: Wire the new layers into `world-canvas.ts`

This task computes `skyState` once per frame, threads `nightFactor` to the new layers, and reorders the pipeline.

**Files:**
- Modify: `src/renderer/world-canvas.ts`

- [ ] **Step 5.1: Add the imports**

In `src/renderer/world-canvas.ts`, update the existing `./layers/lighthouse` import (line 15) to include the new function:

```ts
import { drawLighthouseBeamRim, drawLighthouseBody, drawLighthouseHeadland, drawLighthouseNightHighlights, drawLighthouseOverlay, drawLighthouseSurf, lighthouseOverlayScreenBounds, lighthouseRenderState, type LighthouseRenderState } from "./layers/lighthouse";
```

Add a new import line just below the existing `./layers/sky` import (line 18):

```ts
import { drawNightTint } from "./layers/night-tint";
import { skyState } from "./layers/sky";
```

(`skyState` was previously imported transitively; now we use it directly inside `drawPharosVille`.)

- [ ] **Step 5.2: Compute `nightFactor` once and reorder the render pipeline**

Inside `drawPharosVille` (~line 163), at the very top of the function (before `ctx.imageSmoothingEnabled = false;`), add:

```ts
const { nightFactor } = skyState(input.motion);
```

Then change the existing pipeline (lines 167-183) from:

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
drawNightTint(input, nightFactor);
drawAtmosphere(input, frame.lighthouseRender);
drawLighthouseNightHighlights(input, frame.lighthouseRender, nightFactor);
drawDecorativeLights(input);
drawLighthouseBeamRim(input, frame.visibleShips, frame.lighthouseRender);
drawCemeteryMist(input);
drawBirds(input);
```

- [ ] **Step 5.3: Fix the `lighthouseOverlayScreenBounds` callsite in `drawEntityPass` config**

Find the callsite (~line 232):

```ts
lighthouseOverlayScreenBounds: (selectionRect) => lighthouseOverlayScreenBounds(input, selectionRect, frame.lighthouseRender),
```

Change to:

```ts
lighthouseOverlayScreenBounds: (selectionRect) => lighthouseOverlayScreenBounds(input, selectionRect, frame.lighthouseRender, nightFactor),
```

(`nightFactor` is in scope because Step 5.2 computed it at the top of `drawPharosVille`.)

- [ ] **Step 5.4: Run typecheck and unit tests**

```bash
npm run typecheck
npm test
```

Expected: both green. The failure introduced in Task 4.6 is now resolved.

- [ ] **Step 5.5: Manual smoke check in dev**

Run: `npm run dev` and open http://localhost:5173.

The current wall-clock time on your machine determines the appearance:
- 07:00–18:00: scene unchanged from before (`nightFactor = 0`).
- 20:00–05:00: scene visibly darker; lighthouse halo + beams + warm water pool prominent.
- Dusk/dawn: smooth transition.

If you can't easily wait for nightfall, temporarily edit Step 1.2's branch to force `wallClockHour = 22`, verify the night render, then revert before committing.

- [ ] **Step 5.6: Commit**

```bash
git add src/renderer/world-canvas.ts
git commit -m "Wire night tint and lighthouse highlights into render pipeline"
```

---

## Task 6: Update visual tests — pin existing to noon, add dawn/dusk/night cases

This task uses `page.addInitScript` to override `Date.prototype.getHours/getMinutes` per-test. We deliberately do NOT use `page.clock.install` because that virtualizes `requestAnimationFrame` and would hang any test that doesn't subsequently call `clock.fastForward` or `clock.resume` — many existing tests rely on rAF advancing in real time.

**Files:**
- Modify: `tests/visual/pharosville.spec.ts`

- [ ] **Step 6.1: Add the `installWallClockOverride` helper**

In `tests/visual/pharosville.spec.ts`, add a helper near the top (next to `mockPharosVilleData`):

```ts
async function installWallClockOverride(page: Page, hour: number): Promise<void> {
  // Override Date.prototype.getHours/getMinutes so motion.wallClockHour is
  // deterministic per-test. Does NOT virtualize rAF (unlike page.clock.install),
  // so requestAnimationFrame keeps advancing normally and existing tests still
  // see motionFrameCount progress.
  const flooredHour = Math.floor(hour);
  const minutes = Math.round((hour - flooredHour) * 60);
  await page.addInitScript(({ h, m }) => {
    const origGetHours = Date.prototype.getHours;
    const origGetMinutes = Date.prototype.getMinutes;
    Date.prototype.getHours = function () { return h; };
    Date.prototype.getMinutes = function () { return m; };
    // Keep originals reachable in case any other code path needs them.
    (Date.prototype as { __origGetHours?: typeof origGetHours }).__origGetHours = origGetHours;
    (Date.prototype as { __origGetMinutes?: typeof origGetMinutes }).__origGetMinutes = origGetMinutes;
  }, { h: flooredHour, m: minutes });
}
```

- [ ] **Step 6.2: Extend the runtime debug snapshot type**

Find the `PharosVilleVisualDebug` type that includes `timeSeconds?: number;` (~line 85) and add:

```ts
wallClockHour?: number;
```

In `readRuntimeSnapshot` (~line 1108-1115) where the snapshot object includes `timeSeconds: debug?.timeSeconds ?? -1`, add:

```ts
wallClockHour: debug?.wallClockHour ?? -1,
```

- [ ] **Step 6.3: Pin all existing tests to noon**

For each `test(...)` block in the file, find its `await page.goto("/")` (or `await page.goto(...)` with a URL) and insert this line **before** the `goto`:

```ts
await installWallClockOverride(page, 12);
```

Tests to update (by approximate line based on a fresh checkout):
- `test("…")` blocks around lines 280, 343, 383, 496, 522, 597, 611, 624, 642, 674, 732, 855, 894, 1038.

For the test at line 1037 that already calls `page.clock.install({ time: new Date("2026-04-28T00:00:00Z") })`: leave the existing `clock.install` line in place (it controls rAF stepping for the explicit `fastForward` calls below it). Add `await installWallClockOverride(page, 12);` BEFORE the `clock.install` line so the wallClockHour pin takes effect at page load. (Note: with `clock.install`, the in-page `Date` is already mocked to `2026-04-28T00:00:00Z`, but we want the rendered scene to be daytime regardless. The `installWallClockOverride` overrides `getHours`/`getMinutes` directly, so it wins over `clock.install`'s Date mocking. Verify this works by inspecting the runtime debug snapshot in the test — `wallClockHour` should equal 12.)

If any test uses a different `goto` form (e.g., `await page.goto(new URL(...))`), the same insertion before that line still applies.

- [ ] **Step 6.4: Add three new visual tests for dawn / dusk / night**

Append at the end of the file:

```ts
test.describe("pharosville night atmosphere", () => {
  test("renders mid-dawn with partial night tint", async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 6);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await expect(page).toHaveScreenshot("pharosville-dawn.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });

  test("renders mid-dusk with partial night tint and warming lighthouse", async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 19);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await expect(page).toHaveScreenshot("pharosville-dusk.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });

  test("renders deep-night with dominant lighthouse glow and warm water pool", async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 22);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await expect(page).toHaveScreenshot("pharosville-night.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });
});
```

- [ ] **Step 6.5: Run typecheck and unit tests**

```bash
npm run typecheck
npm test
```

Expected: green.

- [ ] **Step 6.6: Commit (without re-baking baselines yet)**

```bash
git add tests/visual/pharosville.spec.ts
git commit -m "Pin visual tests to noon and add dawn dusk and night cases"
```

---

## Task 7: Re-bake visual baselines

**Files:**
- Re-bake: `tests/visual/pharosville.spec.ts-snapshots/**`

- [ ] **Step 7.1: Run the visual suite — expect failures**

```bash
npm run test:visual
```

Expected: most baselines fail because (a) all noon-pinned tests now render the "day" mood (was: legacy frozen `progress = 0.58` rendering dusk-mood backdrop and dusk sun position); (b) the new `pharosville-dawn.png`, `pharosville-dusk.png`, and `pharosville-night.png` baselines do not yet exist.

- [ ] **Step 7.2: Inspect the diffs — manual review (CRITICAL)**

For each failing test, open the diff image at `test-results/<test-name>/<file>-diff.png`. Confirm the drift is intentional:

- **Day tests**: should look brighter and more golden than the previous "frozen dusk" baselines, with no other unexpected differences. Sun visible at top of arc.
- **Dawn test**: should show a partial dark tint (~31% darkening since `nightFactor ≈ 0.5`), warm horizon, lighthouse subtly more visible.
- **Dusk test**: similar partial darkening but with dusk-mood sky colors and lighthouse glow rising.
- **Night test**: ~62% darkening, dominant lighthouse halo, warm water pool around the headland, brighter sweeping beams.

**Specifically check at night**:
- Water-area labels (Calm Anchorage, etc.) — still readable through tint?
- Gold dock lanterns — still visible?
- Risk-zone fluorescent water tints (warning shoals, danger strait) — still differentiable?
- Warm-colored ship sails — visible enough outside the beam?

If any of these read as broken, STOP and adjust. Likely fix: hoist that layer above the tint pass (would be a follow-up PR — flag it but do not block this PR).

If anything else looks wrong (a ship missing, a label clipped), STOP and investigate before re-baking.

- [ ] **Step 7.3: Update baselines**

Once the diffs are accepted:

```bash
npm run test:visual -- --update-snapshots
```

- [ ] **Step 7.4: Re-run visual suite — expect green**

```bash
npm run test:visual
```

Expected: PASS.

- [ ] **Step 7.5: Commit baselines**

```bash
git add tests/visual/pharosville.spec.ts-snapshots
git commit -m "Re-bake visual baselines for day dawn dusk and night moods"
```

---

## Task 8: Full validation

**Files:** None — verification only.

- [ ] **Step 8.1: Run the full validation sequence**

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

All commands must exit 0. If any fails, fix the underlying issue and re-run before claiming completion.

- [ ] **Step 8.2: In-browser tuning (one round)**

Run `npm run dev` and view the page near 22:00 local time (or temporarily hack `wallClockHour = 22` to force night, reverting before commit). Sanity-check:

- World is darker than before but not flat black.
- Lighthouse halo is the brightest thing on screen.
- Beams reach further into the dark water.
- Warm pool warms the headland and the water immediately around it.
- Village lamps remain visible as warm pinpricks.
- Ship-beam edge highlighting still works.
- Water-area labels still legible.

If the night reads as flat gray, raise `MAX_NIGHT_DARKNESS` toward 0.7 in `night-tint.ts`.
If lighthouse contrast is insufficient, raise `NIGHT_HALO_MAX_ALPHA` and `NIGHT_BEAM_ALPHA` in `lighthouse.ts`.
If the warm pool dominates, lower `NIGHT_WATER_POOL_MAX_ALPHA`.

If you tune any constants, re-run Task 7 to re-bake baselines and commit.

- [ ] **Step 8.3: Final commit (only if Step 8.2 changed anything)**

```bash
git add src/renderer/layers/night-tint.ts src/renderer/layers/lighthouse.ts tests/visual/pharosville.spec.ts-snapshots
git commit -m "Tune night-tint and lighthouse highlight constants after visual review"
```

---

## Self-Review

**Spec coverage:**
- [x] Cycle driver = real local time → Task 1 (production); Task 6 (tests).
- [x] Continuous `nightFactor` ∈ [0, 1] with linear dawn/dusk ramps → Task 2.
- [x] Hour bands (5/7/18/20) → Task 2.
- [x] Reduced motion pinned to noon → Task 1 Step 1.2.
- [x] Sky `progress` derivation `= ((wallClockHour - 6)/24) mod 1` → Task 2.
- [x] Single global tint pass between world content and lights → Task 3, 5.
- [x] Lighthouse halo, beam, and water-pool boost (additive overlay) → Task 4.
- [x] Halo radius covers headland (lit-headland requirement satisfied without busting static cache) → Task 4 Step 4.3 with `NIGHT_HALO_OUTER_RADIUS = 320`.
- [x] `lighthouseOverlayScreenBounds` extends with night beam length → Task 4 Step 4.4.
- [x] `MAX_NIGHT_DARKNESS = 0.62` starting tunable → Task 3.
- [x] `drawAtmosphere` moved post-tint → Task 5.
- [x] `drawLighthouseBeamRim` moved after `drawDecorativeLights` to shine through tint → Task 5.
- [x] `nightFactor` passed as parameter; no circular import → Tasks 3, 4, 5.
- [x] Hard sky-mood color switches retained (Approach B1) → Task 2.
- [x] Test injection via `installWallClockOverride` (Date.prototype override, NOT clock.install) → Task 6.
- [x] Visual tests pinned to noon, plus new dawn/dusk/night cases → Task 6.
- [x] Visual baseline re-bake with manual diff review including label legibility check → Task 7.
- [x] Full validation gate → Task 8.

**Placeholder scan:** no TBD/TODO/"add appropriate" placeholders. Each step shows the actual code or the actual command.

**Type consistency:** `wallClockHour: number` is the same name in `PharosVilleCanvasMotion` (Task 1), `pharosville-world.tsx` (Task 1), `skyState` consumers (Task 2), test helpers (Tasks 2-4), debug snapshot (Tasks 1, 6), and Playwright assertions (Task 6). `nightFactor: number` is the same name in `skyState` (Task 2), `drawNightTint` (Task 3), `drawLighthouseNightHighlights` (Task 4), `lighthouseOverlayScreenBounds` (Task 4), and the `world-canvas.ts` thread-through (Task 5). No name drift.

**No circular imports:** `night-tint.ts` imports only `render-types`. `lighthouse.ts` is unchanged in its imports (still no `sky.ts` import). `sky.ts` continues to import from `lighthouse.ts`. `world-canvas.ts` imports from both `sky.ts` and `lighthouse.ts` and is the seam where `nightFactor` is computed and threaded.

**Order of operations:** Tasks 1, 2, 3 each commit a green typecheck and green tests. Task 4 commits a state where typecheck is red on `world-canvas.ts` because the changed `lighthouseOverlayScreenBounds` signature won't match its single callsite — Task 5's first commit fixes it. The two-commit window with red typecheck is contained: a developer running `git bisect` between Tasks 4 and 5 will see one red commit. This is acceptable because the function pair (definition + callsite) must be reviewed together; merging Task 4 and Task 5 into one giant commit would obscure the change.

**Scope:** Single feature, single PR, no decomposition needed.

**Ambiguity:** Tunable constants are starting values; in-browser tuning is an explicit step (8.2). Visual diffs are reviewed manually before baseline updates (7.2). Label-legibility and risk-zone-water readability checks are explicit in 7.2.

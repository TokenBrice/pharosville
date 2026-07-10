# PharosVille — Ship Capacity & Island-Resize Investigation

**Date:** 2026-06-27
**Trigger:** "We show only ~200/300 ships. Could we downscale the main island ~30% (it has an empty middle) while preserving all harbors, to welcome more ships?"
**Status:** Investigation only — no code changed. Decision pending (see §5).

## TL;DR

The premise is partly a misread of the bottleneck. Three findings change the framing:

1. **Today's ~200 is a *data* gate, not a layout/capacity wall.** 217 stablecoins are
   tracked; `2 frozen + 22 pre-launch` are excluded, leaving **~193 active** ships. The
   placement pipeline has **no cap/slice** — it places however many are active.
2. **Water tiles are not the constraint for 300.** Safe-harbor alone holds **600+** water
   tiles; ledger-mooring **280+**; total water is in the thousands. 300 ships fit easily by
   tile count. The screenshot's "crowding" is **visual density near the island**, not a wall.
3. **Shrinking the island is feasible math but an expensive cascade**, and it does *not*
   increase the ship count. Its only real benefit is density/aesthetics — and the "empty
   middle" you circled is **interior land**, so compressing it adds *zero* ship room.

## 1. Why ~200 today (data, not layout)

- `shared/lib/stablecoins/runtime-registry.ts:15-16` — `RUNTIME_ACTIVE_STABLECOINS` filters out
  `status === "pre-launch" | "frozen"`. 217 tracked → ~193 active.
- `src/systems/pharosville-world/stages/ship-placement.ts:47-51` — `activeAssets()` → ships,
  **no `.slice`/limit/top-N anywhere**. Count scales with active data.
- ⇒ To show *more ships today* you flip coins from pre-launch/frozen → active, or track new
  coins. **No island change affects this.**

## 2. Water capacity is ample

- `src/systems/risk-water-placement.ts` + zone tests: safe-harbor 600+, ledger-mooring 280+
  water tiles; **no per-zone or per-dock ship caps** exist.
- Placement is tile-availability bound, and tiles are abundant. 300 ships is not a capacity
  problem; it is a *spacing/aesthetics* problem in the near-island rings where titan ships
  (USDC/USDT/DAI, scale 3.0) cluster.

## 3. What a 30% island downscale actually entails

Island shape is a pure function — `mainIslandValue` = `min` of two ellipses
(`src/systems/world-layout.ts:248-258`): main oval center (31,31) radii **(12.0, 9.5)** +
lighthouse promontory (19.5,28.5) r (4.0,3.0). Editing the radii is one line. The **cascade**
is the cost:

- **12 hard-coded dock tiles move into open water.** `EVM_BAY_DOCK_TILES`,
  `OUTER_HARBOR_DOCK_TILES`, `PREFERRED_DOCK_TILES` (`world-layout.ts:71-114`) are fixed
  perimeter coords. At 0.7× they sit *outside* the new coast (e.g. Ethereum (42,31), Base
  (39,38)) → must be recomputed onto the smaller perimeter to "preserve harbors."
- **Yggdrasil anchor (42.5, 29.2) lands in water.** Sprite scale is zoom-proportional (fine),
  but the anchor tile is fixed → must be moved inward. (`src/renderer/layers/yggdrasil.ts:6`.)
- **Seawall.** The *barrier* auto-derives from `mainIslandValue` (`seawall.ts:55-61`) so it
  follows a smaller oval; but the *rendered* seawall carries authored segments → visual/barrier
  mismatch unless regenerated.
- **Interior features** (rock ellipses `world-layout.ts:225-226`, civic core radius 8.5,
  center-cluster offsets, lighthouse promontory) need a coordinated rescale.
- **Big sprites are fixed-resolution PNGs** drawn at zoom scale. A 30%-smaller island means the
  same lighthouse/Yggdrasil/plaza art covers proportionally *more* land — the plaza gets
  *tighter*, edge art can overhang water. The "empty middle" is partly the breathing room those
  large sprites need.
- **Tests** pin zone tile counts and dock positions (`terrain.test.ts`,
  `world-layout.test.ts`) → expected failures to re-baseline.

**The conflation to surface:** shrinking the island has two *separable* effects —
(a) compress the empty interior plaza = cosmetic, **0 ship room**; (b) pull the coastline
inward = opens a ring of premium near-island water **but drags every harbor + sprite inward
with it**. You cannot get (b)'s benefit from only (a).

## 4. Cheaper levers (no geometry change) if the real goal is "fit more / less crowded"

All in `ship-placement.ts` / `risk-water-areas.ts`, surgical and reversible:

- **Spacing weight** `score = spacing*1000 - preferredDistance*0.1`
  (`ship-placement.ts:~406`) — lower the `1000` (→ 250–500) to let ships pack 2–4× tighter.
- **Per-zone scatter radii** (`risk-water-areas.ts:64,95,116,…`) — trim 30–50% to compress
  clusters.
- **Preference weight** — raise the `0.1` so ships leave "preferred" anchors sooner.

These reduce crowding directly and ready the world for a larger active fleet without touching
the island, sprites, harbors, or seawall.

## 5. Decision (for the operator)

What is the actual objective?

- **A. Show more ships *now*** → data task (activate pre-launch/frozen, or track new coins).
  Island is irrelevant.
- **B. Ready the world so a growing fleet doesn't look packed** → start with §4 packing knobs
  (cheap, reversible, test-guarded). Recommended 80/20.
- **C. The island genuinely looks too big / the empty plaza bothers you** → a deliberate
  island-reshape project: rescale ellipses + recompute 12 docks + reposition Yggdrasil +
  regenerate seawall + reposition interior art + re-baseline tests, verified in-browser. Real
  work, *does not* change the ship count.

B and C are independent and can both happen; A is orthogonal (data).

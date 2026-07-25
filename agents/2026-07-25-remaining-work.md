# PharosVille — Remaining Work

Date: 2026-07-25
Context: `agents/2026-07-25-grand-scale-revamp-plan.md` (§9 first pass, §10 N-series).
Source: the N6 visual review's 18 findings. Fourteen are closed; four remain.

State at handoff: 896 tests green, `npm run validate` clean, 46 fps at whole-map
framing, 623 draw calls / 304k triangles against the 700 / 500k budgets. 50
commits on local `main`, nothing pushed.

---

## 1. Regions still read as an onion (review #6)

**The problem.** The DEWS bands are concentric rings around the island. D5
replaced the tinted ellipses with the terrain field the simulation obeys — but
the underlying risk geometry is itself radial, so rasterising it faithfully
still produces an onion. This is the exact complaint D5 set out to kill, and it
is the single biggest thing still standing between the sea and "a place".

**Where.** `src/systems/garden-sea-regions.ts` — `buildSeaRegionField`.

**The fix.** Add a low-frequency DIRECTIONAL warp on top of the existing
`BOUNDARY_WARP_TILES` noise, so bands elongate into straits, basins and shoals
with lobes rather than rings. At least one region should reach the map edge.

**The constraint that matters.** The warp is presentation-only. A tile's
classification must never change — `garden-sea-regions.test.ts` pins the
per-tile majority against the raw field, and that test is the guard against
display and data drifting apart again. Keep it green.

---

## 2. Density is lopsided (review #11)

**The problem.** The upper-right quadrant is a solid raft of overlapping hulls;
the lower-left third is nearly bare. It reads as a bug rather than as
composition.

**Where.** `src/systems/garden-fleet-placement.ts` — `placeGardenFleet`.

**The fix.** A per-region occupancy cap with overflow spill into adjacent
water. Blue-noise currently spreads *within* a region but nothing bounds how
many ships one region may hold, so a populous band packs while a large empty
one stays empty.

**Worth doing at the same time.** Give the wreck shoals sparse nearby traffic.
The graveyard currently sits in a bare corner, so it reads as where the map ran
out rather than as water ships avoid. A thin scatter of live hulls near — not
in — the shoals makes the avoidance legible.

---

## 3. Nothing breathes, and the beam is a smudge (review #13, #14)

**The problem.** Two halves of the same gap: the world is populated but not
alive.

- Trees are static, there is no smoke drift, and no berth arrivals or
  departures read as events. `src/three/garden-summit-birds.ts` is gated to
  full/balanced only — on the reference iGPU the app sits in `recovery`, so the
  birds are never once seen.
- The beam is the title object's only motion beat and it currently reads as a
  smudge.

**Where.** `src/three/garden-summit-birds.ts` and the ambient systems in
`src/three/garden-harbor-life.ts`; the beam in `src/three/garden-lighthouse.ts`
(`beam`, `rayFan`).

**The fix.** Enable one or two ambient systems at `recovery` — they are cheap
instanced work and the tier can afford them now. Give the beam a slow sweep, a
visible cone where it meets the water, and a pulse tied to PSI, so the
monument's one motion beat carries data rather than just moving.

---

## 4. Polish batch (review #12, #15, #16, #18)

Four small, independent items.

| # | Problem | Where |
| --- | --- | --- |
| 12 | Detached chain dock platforms hover above the surface with no pilings reaching down | `src/three/garden-docks.ts` |
| 15 | Buoys read as litter — dozens of small dark cones with no role at overview zoom. Cull by zoom, keep boundary anchors only | `src/three/garden-zones.ts` |
| 16 | Selection ring is a flat white ellipse floating over the island. Ground-project it; consider a soft vertical shaft | `src/three/world-renderer.ts` (`selectedMarker`, `hoverMarker`) |
| 18 | Permalinks lose time of day — stored night/hour state overwrites `#t=` / `#n=` on load, which also undermines fixed-hour capture tooling | `src/hooks/use-world-url-state.ts` vs `use-world-time-controls.ts` |

---

## Open decisions, not tasks

These need a call rather than an implementation.

- **A3/A4 are unmet.** Frame p90 is above the 20 ms gate and the scheduler
  settles in `recovery`. Shadows and bloom now survive that tier, so the visual
  cost is paid, but the gate fails. Shipping documented rather than by cutting
  features, per operator decision O4.
- **The `constrained` tier drops the whole composer**, losing colour grading
  along with bloom. Grade is one cheap full-screen pass carrying the entire
  day/dusk/night identity, so the cliff costs far more than the pass does. Not
  changed unmeasured — `constrained` is the last-resort recovery valve.
- **Visual baselines are not regenerated** (operator decision O10 deferred them
  to the end). The visual lane is expected red until that pass runs, via the
  Docker CI lane, then `chown` back.
- **Chain flag logos are disabled.** `check:runtime-media` correctly flagged
  them as a new runtime-media class that is not allowlisted, and this repo
  ships no `public/chains/`. Harbours fly a deterministic painted per-chain
  mark instead. Enabling the real logos means shipping the directory, adding
  the class to the allowlist and `VISUAL_INVARIANTS`, and regenerating
  `RUNTIME_FACTS`. The switch and instructions are in
  `src/three/garden-chain-flag.ts`.

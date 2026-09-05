# Garden cold pass

Starting revision: `056fbc5` (clean worktree). Objective: the operator's five
visual complaints and the Japanese garden / stablecoin observatory composition.
Earlier refinement reports are context, not acceptance evidence for this pass.

## Findings and work

| Requirement | Current work | Acceptance still required |
| --- | --- | --- |
| Recognizable ports / visible flags | Move standards out of roofs to seaward staffs, enlarge cloth, preserve Base's complete logo, constrain wind yaw around authored facing | Combined live and fixture day/night/overview/harbor views |
| Wooden sea signs | Replace the literal 5×7 pixel alphabet with native serif lettering on cedar boards and pilings; one shared atlas, same two draws | Final static and low-tier frames; hover/selection and resource checks |
| Distinct waters | Broaden Watch/Alert/Warning hue differences and shorten shared seam dilution while keeping field classification | Day/night/overview water continuity and analytical tests |
| Lighthouse centerpiece | Fresh default image proves current masonry/drum/statue substantially exceeds reference's blank shell; preserve it | Integrated night hierarchy |
| Boat design | Replace four flat cargo-box covers with arched, hooped reed covers in the same merged barge hull | Integrated frames and hull/resource checks |
| Boat movement / congestion | Remove obsolete 96-tile display cap and sailing/arrival clearance mismatch; minimize crowded-berth penetration; implement separation on final displayed hull positions | Continuous motion, water safety, displayed-target parity and density evidence |
| Broader garden composition | Restore authored mature island pines wrongly shrunk/hidden by furniture LOD | Default/overview/night balance and resource checks |

## Evidence gathered

- Original five attachments inspected by owning lanes; fresh baseline is
  `outputs/cold-look-day.png`: checked dense fixture, 132 ships, noon,
  1600×1000, ANGLE Metal / Apple M5 Pro. Full tier, 282 calls, 42 textures.
- Intermediate integrated frame `outputs/garden-pass-day.png` visibly shows
  readable flags, cedar signs, the island grove and arched barge covers.
  Same dense fixture/viewport/noon: full, 282 calls, 283,275 triangles,
  225 geometries, 43 textures; worst-window p95 16.8 ms. An isolated 833.2 ms
  frame remains in its sweep; this is not a stutter-free startup claim.
- The actual dense motion plan reproduced 15 sailing→arrival display jumps,
  up to 11.78 tiles across 2 ms. The focused regression now checks every
  eligible dense voyage across that boundary and passes at <0.05 tiles.
- First-stage potential oriented berth-envelope intersections across all possible dense
  visits fall from 1,962 to 831, including Ethereum 56→26 and Base 522→208.
  These are conservative reservations for every possible visit, not observed
  simultaneous hull collisions. Unique safe centers, local stations and
  320/321-ship assignment checks still pass.

## Live-harbor follow-through

The first selected live Ethereum frame still showed a packed quay. Its real
population substantially exceeds the generic dense fixture's 14 Ethereum visits.
The final existing fan searches ±16 lateral lanes and 12 depths ahead; candidate
ranking minimizes squared hull penetration, stopping a score early once it
cannot beat the best. An oriented hull may not intersect the mole's actual
hall/arm rectangles. This preserves the navigable basin and avoids the previous
blanket exemption for all dock masonry.

- Controlled 136-Ethereum assignment: potential hull pairs **2,174→833**,
  **62% fewer**. Both sides use the same mole exclusion. Maximum reach grows
  from 30.08 to 36.72 tiles; acceptance explicitly allows a 38-tile local
  anchorage at this load. The generic dense maximum is 25.5 within 30 tiles.
  Unique centers, water, mole clearance, and 320/321 capacity checks pass.
- A saved local live payload has 125 actual Ethereum visits: **1,426→762**
  potential pairs, maximum reach 34.89 tiles. The harbor record's 136 count
  includes supply-bearing assets that do not all receive rendered voyages.
  The matched mechanism probe is in `outputs/live-berth-probe.log`.
- `outputs/garden-wide-ethereum.png` visibly opens the waterfront compared with
  `outputs/garden-final-ethereum.png`. Both are live close views, not immutable
  same-clock fleet snapshots. The latter is an intermediate frame despite its
  filename. Final wider view: full, 138 calls, 284,096 triangles, 192 geometries,
  51 textures; worst p95 and worst sampled frame 16.8 ms.
- On the final dense plan, 30 Hz simulation at t=70/80/90/100/110/120 seconds
  measures raw→avoided oriented hull pairs **52→27 / 58→35 / 51→37 / 57→32 /
  48→34 / 59→38**. The pass needs time to settle (t=60 is 47→47). It operates
  on final displayed positions, preserves route-facing headings and fixed
  moored berths, updates follow velocity, and keeps water/mole clearance.
  These conservative footprint measurements are not sail-pixel occlusion or
  a promise of collision-free saturated anchorages and formations.
- Longer voyages changed the arrival/departure pairing. The existing immutable
  slot table was recalibrated from salt 699 to 114: 31→32 paired 15-second
  windows out of 40. All 103 motion tests preserve roster-stable clocks and
  existing moored/underway/transition/speed bands.
- Flags survive whole-map LOD and have separate cloth hit targets derived from
  the renderer's shared staff/cloth placement. They do not turn the empty sea
  between a flag and its quay into one oversized click target.
- Final night ink is 48% less luminous than the first cream lettering, retaining
  daytime and active colors. `outputs/garden-final-night-ink.png` remains legible
  and beacon-led: full, 208 calls, 43 textures, worst p95 16.8 ms.
- Live settled static: `outputs/garden-final-live-static.png`, 185 ships,
  229 calls, 343,744 triangles, 212 geometries, 43 textures and zero continuous
  RAF. The intermediate compact 1200×640 constrained view in
  `outputs/garden-final-laptop-constrained.png` exposed a cropped lighthouse crown: 176 calls, 29 textures,
  worst p95 16.8 ms. Its isolated 716.6 ms startup-window frame is retained as
  a measurement limit, not hidden by raising a threshold.

## Integrated checks

- `npm run validate:release` **PASS**: 1,903 tests / 165 files pass, two
  existing skips; typecheck, lint, docs/media/viewport/header/color contracts,
  production build and unchanged bundle limits pass. Chromium production
  behavior: 18 checks; Firefox accessibility: two checks.
- Both real-GPU release arms measured successfully. Final live animated frame:
  full, 247 calls, 343,025 triangles, 227 geometries, 44 textures; worst
  p95 and worst frame 16.8 ms. Settled static: 233 calls, 343,519 triangles,
  215 geometries, 44 textures. Log: `outputs/garden-final-release.log`.
- `npm run test:perf`: **eight checks pass**, including steady state, bounded
  resources, selected/reduced frames, repeated world replacement, pause and
  renderer failure. This is the correctness/resource lane, not visual or
  reference frame-time evidence. Log: `outputs/garden-final-perf.log`.

## Final framing correction and release preparation

Final composition review found that the opening camera move reached its
destination, then generic camera intent pulled it back toward the stale intro
origin. Earlier unpinned captures therefore show the intro framing; pinned
whole-map and selected-subject captures remain valid. The compact screenshot
above is intermediate evidence, not acceptance of the cropped crown.

The stress-night real-GPU sweep passed over 60.6 seconds: full tier,
281 calls, 282,033 triangles, 227 geometries, 43 textures, worst p95 16.8 ms.
An isolated 900 ms frame remains recorded; it is not a claim of hitch-free
startup. Local evidence: `outputs/garden-final-stress.log`.

The operator authorized the changelog and release. Publication follows the
protected PR, green main deployment, and automated GitHub Release workflow.


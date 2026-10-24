# 07 — Ship movement & traffic logic

Vertical 07, PharosVille "prettier & more magical" sweep. Baseline `main` @ v1.2.1. Read-only review.
Captures: `shots/07-heart-traffic.png` (t=10, heart), `shots/07-roads-close.png` (t=16, `cam=-40,0,-330,260,30`).

## 1. Current state

- **The sim is deterministic and already rich** (`src/harbour/sim/sim.ts`, `plan.ts`, `path.ts`). A 6 h UTC-aligned
  plan uses periods that divide the cycle, with dock time ∝ supply share (D10). Legs are filleted polylines with turn
  radius ∝ LOA, run in an "effort" coordinate `q = ∫ds/vrel`, so hulls slow in bends and
  speed up offshore (`openWaterFactor`, up to `OPEN_WATER_MAX`). They gather way at `ACCEL = 0.12 m/s²`, glide in over
  the last 2 LOA at ≤0.3×, warp off and on alongside berths, back out of bow-in slips on a curve, bump the fenders
  (`bumpAt`), and throw lines bow → stern → spring (`lines`, `mooring-lines.ts`). This is a strong base.
- **Traffic etiquette exists.** Lanes are one-way (`layout.json lanes.oneWay`). Hulls keep a lane position by speed
  (slow to starboard, fast overtake to port). A two-pass give-way shove lets the smaller hull yield, and moored hulls
  sheer away from a passer (`separate`, `mooredYield`). Departures and arrivals at a gate are bucketed ≥20 s apart
  (`GATE_BUCKET_S`), so **queues at the mouth cannot form by design**. The world shows no contention, and none happens.
- **Wind is shown only partly.** `windFrom` is one constant from the layout (`bowHeadingRad -1.0`). The weather
  director reuses it (`weather-system.ts:188`), so flags, smoke and moorings agree. Under way, though, **heading
  ignores the wind.** Circuit legs follow the lane graph straight into the wind's eye with canvas drawing. Speed has no
  polar. Heel (`writeLeg`, sim.ts:797) is `±sailState·(0.04+0.08·strength)`: a **binary side with constant magnitude**.
  Close-hauled, a beam reach and a dead run all heel the same, and a hull bow-to-wind snaps (render-eased) from one side
  to the other. Only outings tack (`outings.ts:353`).
- **Rig response is good but generic.** `targetSwing` (fleet/variants.ts) eases the boom out with the wind angle and
  rate-limits the gybe. Furl and hoist are driven by distance from the berth. Nothing marks the "no-go zone" (luffing).
- **The Roads read as confetti.** Since v1.2.1, `sailSetAt()` keeps sails set at swinging moorings and in rafts. With
  ~260 hulls on O-* moorings, every one shows a full emblem sail broadside to the camera
  (`07-roads-close.png`, `07-heart-traffic.png` upper right). It reads as a mob at a regatta start, not ships riding
  at anchor. They do swing believably: wind + spatial tide set + per-hull yaw with periods that divide the cycle
  (`swingHeading`). But the wind never veers, so the fleet never moves as one body.
- **Give-way is a pure sideways crab.** The lane offset and shove move the position without yawing the heading, so a
  hull slides sideways when it steps aside (eased, small, but visible at heart zoom).
- **The one-off voyages are plain voyages.** `EV_TO_SHOALS` sails at nominal speed with canvas set and only flogs on
  arrival (`restPose`). `EV_TOW` (death → Wreck Cove) is just `tNom·1.8` with sails set, so a dead coin sails herself
  to the graveyard and nothing tows her. `EV_LAUNCH` rejoins from `launchPath[0]` like any voyage.
- **Galley oars are static.** `hb_ancient.py` bakes oars as "furl 0 = out mid-stroke". Nothing animates a stroke,
  and galleys sail under canvas in the harbour like everyone else.

## 2. Ideas

### M1 Points of sail: polar speed, true heel, luffing
**What:** In `path.ts` (path build, cached), multiply each sample's `vrel` by a polar `P(θ)` of the angle off the
wind (θ<40°: 0.55, close-hauled 0.8, beam reach 1.0, broad reach 1.1, run 0.95). The leg is still solved to its
duration `D`, so D10 timing is untouched; the hull just spends its time differently along the path. In `writeLeg`,
set heel = `side·sail·strength·k·sin²(θ)`-shaped (peaks on a beam reach, ~0 head-to-wind and on a dead run) instead of
a constant. In `fleet-material.ts`, add a per-instance "luff" scalar (θ<40° → sail flutter at the leech, the same
wave as the ensign flutter, line 147).
**Why magical:** Each hull visibly *works* the wind. Ships lean and hurry across the breeze, ghost upwind with canvas
shivering, and roll along downwind. The harbour gets one invisible organising force.
**Data:** Decorative (wind direction is layout, strength is the DEWS band as today). No new signal.
**Where:** `sim/path.ts` (vrel), `sim/sim.ts writeLeg`, `fleet/variants.ts`, `fleet/fleet-material.ts`, instance
attribute.
**Cost:** S–M. Zero draws, +1 float per instance, ~10 ALU in the sail vertex shader. Path-build cost unchanged.
**Risk:** Low. `sim.test` speed caps need the polar max folded in.

### M2 Beat to windward on open-water legs (and row in harbour)
**What:** In `routes.ts`/`buildLegPath`, where a lane run in open water (`openWaterFactor > 1.2`, clearance ≥ 40 m)
lies within ~40° of `windFrom`, replace it with 2–4 tacks of ±45° about the rhumb line. Reuse the tack generator in
`outings.ts:340-360`. Inside the moles, galleys (`rig` with oars) **row**: oars get a stroke cadence ∝ speed in the
vertex shader, and the sail is brailed (sailState 0.3) until they clear the mouth. Sailing rigs keep the lane.
**Why magical:** The signature behaviour of real sail. Zig-zag wakes offshore, and galleys pulling past the Pharos
with oars beating, which fits the Ptolemaic setting.
**Data:** Decorative. Leg length grows, so `plan.ts` must count tack metres in `MAX_SAIL_FRAC` (as scenic metres are).
**Where:** `sim/routes.ts`, `sim/outings.ts` (extract the tack helper), `sim/plan.ts` (rep-leg metres),
`fleet/fleet-material.ts` (oar stroke on the `oars` group), `fleet/hull-kit.ts`.
**Cost:** M. Paths are cached, so the cost is one-time build. The oar stroke is ~6 ALU on oar verts only.
**Risk:** Medium on plan capacity (more time under way, so watch the ~31% under-way share and `UNDER_WAY_SOFT_CAP`).
Tacks crossing lanes must stay off `FAR_NEED_LANE`.

### M3 Riding at anchor: brailed canvas in the Roads
**What:** At swing/raft slots, hold `sailState` at a **brailed** ~0.35–0.45 (the sail gathered up to the yard, the
emblem roundel still legible on the lower panel) instead of 1. Hoist to full over the cast-off (`SET_FROM_LOA`
already drives this). Optional per-hull 10% exception: "drying sails" fully set, phase-hashed, for life.
**Why magical:** The Roads become a calm anchorage, a forest of masts and yards. Then one hull *hoists* and you see
her about to leave. Departures become events you can anticipate.
**Data:** Decorative. **This reverses part of the v1.2.1 "sails set away from berths" decision; flag it to the
operator.** It is a legibility trade (emblem size) against calm. Make it a constant in `sim.ts sailSetAt`.
**Where:** `sim/sim.ts sailSetAt/restPose`, `sim/path.ts` set/furl ramps, `fleet/fleet-material.ts` furl morph (verify
the roundel clamp holds at partial furl).
**Cost:** S. Zero perf.
**Risk:** Truth none. Calm improves. Identity legibility in the Roads drops, which hover tags mitigate.

### M4 Cat's-paws: gusts that sweep the fleet
**What:** Render-side only. Sample a cheap moving gust field `g(x,z,t)` (two travelling sine lobes along the wind,
the same that could darken the ocean in vertical 0x). Add `heel += g·k·sailDrawing` for hulls under way, and a small
extra yaw/surge to moored hulls as a gust passes. Ships across the Roads lean in sequence as a dark patch runs over the
water.
**Why magical:** You *see the wind travel*. This is the most "alive" ten-minute-watch detail per line of code.
**Data:** Decorative. Gust amplitude scales with the existing DEWS wind strength (no re-map).
**Where:** `fleet/fleet-system.ts` (heel/roll block ~L700), shared gust fn in `weather/` or `ocean/` for the
water-darkening twin.
**Cost:** S. ~20 flops per hull per frame on CPU, zero draws.
**Risk:** Reduced motion is already stilled by the frozen clock. Keep amplitude ≤ 0.05 rad.

### M5 Slow wind veer: the anchorage turns as one
**What:** Add a deterministic decorative veer `ψ(t) = 0.25·sin(2πt/CYCLE·k)` (divisor-periodic, ±15°) to the
**rest-pose** wind only (`swingHeading`) and to the render wind (weather `windTo`, flags, smoke). Path building keeps
the layout's `windFrom`, so caches and plan are untouched. Each moored hull follows with her own lag (`r.lag` is
hashed per hull in `sim.ts` but read nowhere today).
**Why magical:** Over a few minutes the whole Roads wheels slowly like a flock. It is the signature image of an
anchorage.
**Data:** Decorative. Must stay out of the analytical wind (DEWS = strength only).
**Where:** `sim/sim.ts swingHeading`, `weather/weather-system.ts:188`, `sim/layout-graph.ts` (swing clearance
already tests ±1.2 rad, so ±0.25 extra is inside it; re-run `hull-clearance.test`).
**Cost:** S. Zero perf.
**Risk:** Moorings packed tighter than ±1.2 rad would overlap (the test covers this). Under-way M1 heel uses the
unveered wind, which is negligible.

### M6 The last voyage: under tow to Wreck Cove
**What:** On `EV_TOW`, strike the dying hull's canvas (`sailState 0`, a slight list growing over the voyage) and
spawn a **declared-decorative harbour tug**, a small rowed lighter, one instance from the existing `boat`/`skiff`
kit with a neutral livery. It sails the same path ~1.5 LOA ahead with a towline drawn by the `mooring-lines.ts`
segment batcher (one line, sagging catenary). At the cove the tug casts off and rows home along the lane.
**Why magical:** A solemn little procession for a coin's death. It reads instantly, without text.
**Data:** Data-bound **event** already exists (`state → wrecked`, obituary panel). The tug carries no data; its
hover says "harbour tug". Fully deterministic from the voyage record.
**Where:** `sim/sim.ts voyageTo` (EV_TOW: tug pose = path eval at `s + offset`, written to a small extra pose slot),
`fleet/fleet-system.ts`, `fleet/mooring-lines.ts`.
**Cost:** M. +1 instance and +1 line while a tow is live (rare). No steady-state cost.
**Risk:** Calm good. It must not linger after arrival.

### M7 Adrift to the Shoals
**What:** On `EV_TO_SHOALS`, make the voyage a drift. Sail half-loose and flogging (`sailState 0.25 + flutter`,
reuse the Shoals restPose formula), speed ×0.6 via `D`, a heading wander of ±12° on the path (an added yaw term, not
a new path), and heel easing toward her Shoals list. `EV_REJOIN` on recovery does the inverse: sail sheeted home,
she comes upright.
**Why magical:** A depeg becomes a visible loss of control, then a recovery you can watch. Drama without alarm.
**Data:** Data-bound, existing (`activeDepeg`/state → Shoals; the panel already says so). Intensity could scale with
`pegDeviationBps` (already drives `heelBase`). No new signal.
**Where:** `sim/sim.ts` voyage branch of `evalBoat`/`writeLeg` (kind-aware sail/heel/yaw).
**Cost:** S. Zero perf.
**Risk:** On a bad day dozens drift at once. That is acceptable and is the truth.

### M8 Yaw into the give-way (no crabbing)
**What:** Render-side. Blend the drawn heading toward the smoothed velocity direction (`b.vx/b.vz`, already computed
in fleet-system) by up to ~0.15 rad when moving forward (skip on astern and warp phases). Or, in the sim, have
`evalLeg` output `d(laneOffset)/ds` and add `atan` of it.
**Why magical:** Hulls *steer* round each other instead of sliding sideways. It makes traffic look piloted.
**Data:** None.
**Where:** `fleet/fleet-system.ts` (~L690), or `sim/path.ts evalLeg` + `sim.ts separate`.
**Cost:** S. A few flops per hull.
**Risk:** The click/hover hit-test uses the sim pose. A heading delta ≤0.15 rad is harmless.

### M9 Titans take a pilot
**What:** Flagship/large hulls on `PH_APPROACHING` through the main mouth (`L-m`) pick up a declared-decorative
pilot gig. It waits off the Pharos and leads her in from the gate to ~3 LOA from the berth, then peels off back to
a fixed pilot station. The gig's pose is a pure function of the titan's leg (path eval ahead plus a peel-off
curve), so no extra planning is needed.
**Why magical:** It conveys scale and ceremony ("the big ones need help") and gives the Harbourmaster's Office a job.
**Data:** Decorative (class is already size). The hover says "harbour pilot".
**Where:** `sim/sim.ts` (pilot pose pass after `separate`), `fleet/fleet-system.ts`, layout `pilot` station node.
**Cost:** M. ≤2–3 extra instances live (titans move rarely: `PERIOD_MIN flagship 24`, but few hulls).
**Risk:** Clutter if overused. Restrict it to flagships.

### M10 Laden or light: draft from mint/redeem
**What:** A hull whose coin net-minted in the last 24 h sits deeper (y −0.1…−0.35 m by log net flow, scaled by
LOA), with a cargo stack (amphorae/bales, an existing prop kit) on deck while docked. Net-redeeming hulls ride
high, showing more boot-top.
**Why magical:** Supply growth becomes physical: full ships come in low.
**Data:** **Data-bound, new cue.** Source is `/api/mint-burn-flows` per coin (`MintBurnFlowsResponse.hourly
netFlowUsd`). It needs a panel line ("laden: +$X minted 24 h") and the ledger column. Per-coin flows must exist;
the model currently aggregates `hourly`, so verify per-coin coverage before committing.
**Where:** `src/harbour/model/` (per-boat flow), `fleet/fleet-system.ts` (y offset), cargo props (D4 Blender), panel UI.
**Cost:** M. Cargo as one instanced mesh, ≤1 draw, low tris.
**Risk:** Truth. It must not imply on-chain transfer between piers (the legend already disclaims sailing ≠ bridge).

### M11 Arrival & departure rituals
**What:** Small and cheap. (a) Anchor/buoy pickup at a swing slot: a splash puff at the bow and the rode
appearing (lines already exist for berths; add a single rode line for moorings). (b) The ensign dips once passing
the Pharos inbound, a flag-height animation keyed to distance from `L-m`. (c) The audio vertical hooks a soft
horn/bell on `st.dockings` (opt-in, D13).
**Why magical:** It punctuates the watch with tiny ceremonies.
**Data:** Decorative.
**Where:** `fleet/mooring-lines.ts`, `fleet/house-flags.ts`, `sim/sim.ts stats`.
**Cost:** S each.
**Risk:** Keep the frequency low (dockings per minute are already capped by the plan).

### M12 Launch day, properly
**What:** `EV_LAUNCH` currently starts at `launchPath[0]` as a voyage. Make it a launch. The first ~6 s slide stern-first
down the yard ways (on the ground height, accelerating), then a splash, a pitch-up rebound and a heel settle (reuse
the bump math). Dress her overall with bunting (a flag-line strip from the lines batcher) for her first circuit.
**Why magical:** New coins get a birth.
**Data:** Data-bound event (new coin in the payload), already shown.
**Where:** `sim/sim.ts launch`, `sim/layout-graph.ts launchPath`, `fleet/fleet-system.ts`, `civic/yard.ts` (crowd hook).
**Cost:** S–M.
**Risk:** On the first load nothing replays (correct). Only real diffs trigger it.

### M13 Convoys of an issuer (declare carefully)
**What:** Coins from the same issuer that share ≥2 chains get plan phase offsets pulled within ~40 s of each
other, so they cast off and sail in line astern.
**Data:** **Data-bound and new.** It needs an issuer field (the model has none today: `Boat` lacks it), a panel
line ("sails with …") and the ledger grouping. It also fights `GATE_BUCKET_S`, since line-astern needs a "convoy" gate
exception. **I recommend deferring it**: high truth and plan risk for modest beauty.

## 3. Top picks

1. **M1 Points of sail.** The biggest believability gain for near-zero perf. It makes wind the organising force.
2. **M3 Brailed canvas in the Roads.** It fixes the confetti read of ~260 moored hulls and makes departures
   anticipatable. It is a one-constant change, but it is an operator decision.
3. **M4 Cat's-paws.** Visible travelling wind across the fleet, render-only, about 20 lines. Pure magic per cost.
4. **M6 Under tow to Wreck Cove** (with **M7 Adrift to the Shoals**). It gives the existing data-bound events the
   gravity they deserve, with no new signals.
5. **M2 Tacking offshore and rowing galleys.** The signature of sail and of the Ptolemaic setting. It is M, because it
   touches plan capacity.

Honourable mention: **M8** (steer, don't crab) is a 10-line polish to fold into any of the above.

## 4. Sim vs render split (determinism)

- **Sim (pure f(model, layout, UTC)):** polar `vrel` (M1, at path build), tack paths (M2), brailed sailState (M3),
  veer in `swingHeading` (M5), voyage-kind sail/heel/yaw (M6/M7), tug/pilot poses as path evals (M6/M9),
  launch slide (M12). All are closed-form and preallocated, with no history.
- **Render (visual only, may be smoothed):** luff flutter, oar stroke (M1/M2), gust heel (M4), yaw-into-velocity
  (M8), draft offset and cargo (M10), ensign dip and splash (M11).

## 5. Cross-vertical hooks

- **Ocean/weather:** the M4 gust field should also darken the water (cat's-paw ripples), and the M5 veer must drive
  smoke, flags and clouds together (`weather-system.ts:188` already reads `sim.wind`).
- **Wakes:** tack zig-zags (M2) and tow wakes (M6) rely on the wake service. Check how long wakes persist.
- **Audio (D13):** creak of the tow, oar splash cadence, docking bell (M11).
- **Civic/yard:** the launch crowd and a pilot station on the Harbourmaster's quay (M9, M12).
- **Assets (D4):** tug/pilot gig livery, cargo props, brailed-sail morph check in `hb_hulls.py`/`hb_ancient.py`.
- **UI/panel:** hover strings for "harbour tug", "harbour pilot", "adrift", and "laden" (M10, if adopted).

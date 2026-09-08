# Fleet motion quality

## Verdict

Over ten minutes the fleet reads as a busy simulation but not yet a living harbour: stable phases and long cadences prevent frantic noise, yet most hulls act as unrelated particles with no harbour-scale rhythm. The code now gives hulls credible local water response and frame-rate-independent turn heel, but `noon.png` cannot distinguish underway from moored vessels and shows neither traffic lanes nor readable wakes. Arrivals/departures exist as four-second micro-beats, too brief and too spatially diffuse to organize attention. The step change is to make motion communal and legible—tides, chain convoys, anchorage rules, and rare market-authored ceremonies—rather than adding more per-ship oscillation.

## Findings

### Verification of 2026-09-07 items

- **T0.3 pitch dead channel — LANDED (DEFECT fixed).** Resting motion now writes roll and pitch (`src/three/world-renderer.ts:4599-4619`); both reach the batch pose (`src/three/world-renderer.ts:4773-4782`) and its YXZ quaternion (`src/three/garden-fleet-batch.ts:1375-1382`). Reduced motion explicitly zeros pitch (`src/three/world-renderer.ts:4608-4612`).
- **T0.4 frame-rate-dependent heel — LANDED (DEFECT fixed).** Heel is derived from angular rate, `deltaRadians / deltaSeconds`, then clamped (`src/three/world-renderer.ts:4012-4029`), and the frame delta is passed at the turn site (`src/three/world-renderer.ts:4547-4559`).
- **T1.5 — PARTIAL.** Roll+pitch landed as above. In the allowed motion-planning header there is no `REST_RADIUS`; it imports cadence/speed constants only (`src/systems/motion-planning.ts:3-14`), and the inspected fleet-transform path contains no 45 s moored-heading sway—only per-hull bob/roll/pitch driven by `bobT` (`src/three/world-renderer.ts:4584-4619`). Thus **REST_RADIUS = 0.07 and 45 s moored sway are not evidenced/appear not landed** in the named implementation surface. This is a GAP, not a regression claim.

### Behaviour and readability

- **GAP — cadence is calm but narratively flat.** Identity legs span 90–180 s (`src/systems/motion-planning.ts:697-704`) and nominal rests 250–420 s across pace extremes (`src/systems/motion-planning.ts:707-712`). The cycle algebra is three times dock-rest duration (`src/systems/motion-planning.ts:319-327`): dock dwell is exactly one third, risk rest is generally the largest share, and only roughly one fifth to one quarter is underway [INFERENCE from those formulas]. In ten minutes, a viewer sees many asynchronous events but little evolution of any one recognizable ship.
- **GAP — speed is internally coherent, not visibly physical.** Risk bands vary base speed from 0.48 to 0.72 tiles/s (`src/systems/motion-planning.ts:785-796`), and geometry extends/splits voyages to respect maximum speed (`src/systems/motion-planning.ts:727-747`). But ship size, wind angle, and sail state do not enter speed here; tiny and large hulls therefore share risk-authored kinematics. `noon.png @ entire basin` shows no readable speed hierarchy.
- **GAP — turning is smooth but generic.** Display position/heading use time-constant damping (`src/systems/visual-motion.ts:52-58,110-118`) and compatible lifecycle transitions are smoothed (`src/systems/visual-motion.ts:189-205`). Turn heel is credible, but there is no apparent anticipation, lane-following, or harbour right-of-way. `noon.png @ right/open water and left quay` shows mixed headings rather than traffic flow.
- **GAP — arrivals/departures are technically present but perceptually tiny.** The flourish is only four seconds, with a three-second nameplate and two-second wake impulse (`src/systems/garden-arrival-beats.ts:3-10,46-70`), capped to six market-cap-prioritized ships (`src/systems/garden-arrival-beats.ts:86-110`). Existing wake stamps persist in the shared field (`src/three/world-renderer.ts:4672-4718`), but `noon.png @ all water` has no clearly readable ship wake or berth event.
- **GAP — moored hulls are not still in a meaningful way.** They do not translate in this transform section, but all non-reduced-motion hulls bob, roll, and pitch (`src/three/world-renderer.ts:4584-4619`). This feels afloat, not secured: no common tide swing, taut-line limit, bow-to-wind rule, or raft coupling. `noon.png @ far-left quay and bottom-right shore` shows dockside bows fanning in unrelated directions.
- **GAP — latent group motion is underexploited.** Consorts already inherit a flagship’s cycle, phase, and path and are intended to shadow its sample (`src/systems/motion-planning.ts:480-492`), but `noon.png @ left basin` reads as overlap/packing, not procession.

## Ranked ideas

### 1. STEP CHANGE — Chain processions on authored harbour lanes

**What:** Build a small lane graph and departure windows per chain in `motion-planning.ts`; promote existing flagship/consort inheritance into 3–7 ship single-file processions with size-aware spacing, staggered starts, and shared turns. **Why:** converts random independent vectors into slow, legible commerce; chain affiliation becomes visible without captions. **Cost:** +0 draws/+0 tris/+0 tex; ~0.1–0.3 ms CPU [INFERENCE], **L**. **Risk:** congestion/over-regularity; allow only 1–2 active processions and dissolve outside harbour. **Re-pin:** `motion.test.ts` formation offsets, collision/water-zone, cadence and duty-cycle expectations. **Dependencies:** fleet-density strategy, data-story/chain identity, wake lane rendering.

### 2. STEP CHANGE — Harbour tide as the master clock

**What:** Add one 8–12 minute tide oscillator; every moored hull swings slowly within a strict 0.07-tile tether arc, phase-adjusted by berth geometry, while rafted hulls share phase. Underway ships receive a much smaller cross-current. **Why:** the basin breathes as one garden instead of 185 independent sine toys; moorings feel physically connected. **Cost:** +0 draws/tris/tex; <0.1 ms [INFERENCE], **M**. **Risk:** synchronized “metronome”; use one global tide plus bounded berth lag, not random phases. **Re-pin:** `motion.test.ts` exact 0.07 radius, 45 s minimum/target sway contract, reduced-motion determinism. **Dependencies:** water/tide and sky-time lanes.

### 3. Bow-to-wind anchorage with dock-line constraints

**What:** At open-water rest, blend headings toward apparent wind; at docks, preserve the existing dock tangent (`src/systems/motion-planning.ts:651-683`) and permit only a narrow tide-induced yaw. **Why:** instantly separates anchored, berthed, and sailing states; the fleet responds to shared weather. **Cost:** +0 draws/tris/tex; <0.1 ms [INFERENCE], **M**. **Risk:** headings become too uniform; shoreline and hull inertia should cap response. **Re-pin:** `motion.test.ts` moored headings and transition continuity. **Dependencies:** authoritative wind vector from sky/weather.

### 4. Persistent calligraphic wakes and two traffic lanes

**What:** Lengthen the existing wake field’s memory for underway hulls and accumulate subtle paired brush-stroke lanes along shared routes; erase quickly at berths. **Why:** makes voyages and speed readable in a still and leaves a meditative history of commerce. **Cost:** +0–1 draw, +0 tris, +0–1 texture, ~0.2–0.7 ms GPU [INFERENCE], **M**. **Risk:** water clutter/ghost trails; displaces generic foam and caps simultaneous strong wakes. **Re-pin:** `motion.test.ts` wake intensity/state boundaries. **Dependencies:** water renderer and lane graph.

### 5. Rare arrival ceremony, not six simultaneous chips

**What:** Every 2–4 minutes choose one data-significant arrival: nearby harbour lanterns bow in sequence, its convoy compresses, sails dip, wake makes an ensō-like ring, and a single accessible market annotation appears for 8–12 s. **Why:** gives the long cadence memorable punctuation and makes Pharos data observable. **Cost:** reuse lights/wake/nameplate; +0 draws/tris/tex, ~0.1 ms [INFERENCE], **M**. **Risk:** gamification and attention theft; displaces the current six-way four-second beat, never overlaps beacon climax. **Re-pin:** `garden-arrival-beats.test.ts` windows, priority, simultaneity cap (=1 ceremony); ledger parity. **Dependencies:** data-story event ranking, HUD/accessibility.

### 6. Depeg departure as an exceptional procession

**What:** On threshold-crossing depeg, schedule (not teleport) a slow escorted departure from chain berth toward the risk water, with one restrained red pennant/wake accent and ledger narration. **Why:** turns market risk change into spatial consequence. **Cost:** +0 draws/tris/tex; ~0.1 ms [INFERENCE], **L**. **Risk:** alarming or stale semantics; require hysteresis/cooldown and truthful timestamp. **Re-pin:** `motion.test.ts` route/state transition and stability; `garden-arrival-beats.test.ts` departure envelope/priority. **Dependencies:** data transition history and accessibility ledger.

### 7. Rafted pairs as quiet punctuation

**What:** Author a minority of related/same-chain ships side-by-side at dock/risk rest, coupled in position, roll and tethered yaw; unraft sequentially before departure. **Why:** creates recognizable social structure and varied negative space. **Cost:** +0 draws/tris/tex; <0.1 ms [INFERENCE], **M**. **Risk:** overlap/hit-target ambiguity; enforce hull-aware beam spacing. **Re-pin:** `motion.test.ts` deterministic pairing, separation, and unraft transition. **Dependencies:** fleet density/placement ownership.

### 8. Wind-driven speed and choreography rhythm

**What:** Modulate target speed by projected wind, hull silhouette/size, and sea state, then quantize only harbour departure opportunities into loose 45–75 s phrases. **Why:** adds physical causality while preserving contemplative rests; visible fast/slow classes make data motion easier to parse. **Cost:** +0 draws/tris/tex; <0.1 ms [INFERENCE], **M**. **Risk:** cadence tests and arrival bunching; clamp tightly and keep deterministic wall-clock purity. **Re-pin:** `motion.test.ts` speed bounds, route duration, pair windows; `garden-arrival-beats.test.ts` maximum concurrent beats. **Dependencies:** weather, hull metadata, lane scheduler.

## Rejected

- **More random bob/noise:** already present; increases agitation without harbour meaning.
- **Per-ship particle wakes:** needless draws/overdraw when the persistent field already exists.
- **Make every depeg ship flee immediately:** sensational, unstable, and destroys the relaxing premise.
- **Shorten every rest:** increases activity but makes the scene busier rather than more alive.

## Cross-lane notes

Fleet-density should reserve negative space and lane corridors before procession routing. Water should expose tide/current and wake-memory controls; sky/weather should own wind truth. Data-story and HUD/accessibility lanes must define ceremony/depeg semantics and ledger parity. The motion lane should own deterministic scheduling and all `motion.test.ts` / `garden-arrival-beats.test.ts` re-pins.
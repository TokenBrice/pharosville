# Fleet motion — fleet-motion

## Verdict
The ships don't float. They are rigid tokens on a sheet of moving water, and at rest they spin. Every anchored hull takes its heading from the tangent of a tiny Lissajous orbit (`risk-drift.ts:111-136`). A calm ship turns 0.55 full circles a minute and a danger ship 3.6, with occasional whip-arounds that reach 995–5 215 °/s before damping. In `anchorage-noon-500ms` frames 03→04 a junk swings about 50° in half a second. Heel and pitch come only from a 10-minute tide sine (≤0.6°), so in `open-water-800ms` nothing on the water moves for 9.6 s while the sea scrolls under it. Wakes are 1-px white whiskers (`noon.png`, `golden.png` around the right-hand hulls) and cost 84 draws. The leap is physical grace plus communal stillness: ride to the anchor, rock with the swell and heel to the wind, leave a glassy wake slick, and let the whole anchorage swing together at the turn of the tide, then rest.

## What I looked at
- Baseline: `noon.png`, `noon-1440p.png`, `golden.png`, `selected-ship.png`, `wholemap-noon.png`; `morning.txt` (motion sample 1.5 ms, draw submit 2.7 ms).
- My captures in `outputs/opus-review/fleet-motion/`:
  - `anchorage-noon-500ms` (12 frames @ 500 ms). Tier was `constrained` and then `recovery` on the retry. I use it for motion only, not for wakes.
  - `harbour-tempo-5s` (12 @ 5 s, `full`).
  - `left-quay-2500ms` (12 @ 2.5 s, `full`).
  - `open-water-800ms` (12 @ 800 ms, `interaction`, motion only).
  - `danger-basin-2s` (12 @ 2 s, `interaction`, motion only).
  - Crops: `crop-whiskers.png`, `crop-green.png`, `crop-danger-strip.png`.
  - Caveat: the camera drifts through every sheet (landing zoom and breathing), so I judged ship motion relative to nearby land.
- Numeric check: I replicated the `risk-drift.ts` heading maths in a scratch script for each band and got turns per minute, peak yaw rate and seconds above 57 °/s.
- Code read:
  - Samplers: `motion-config.ts`, `visual-motion.ts` (smoothing and state compatibility), `motion-sampling/{transit,mooring,open-water,risk-drift,risk-water,resolve,consort,route-cycle,memory}.ts`, `motion-planning.ts` (tide, cadence, pairing, speeds).
  - Wakes: `garden-wakes.ts`, `garden-wake-batch.ts`, `garden-ships.ts:2838-2861` (wake lines).
  - Arrivals: `garden-arrival-beats.ts`, `pharosville-world.tsx:540-591`.
  - Renderer: fleet section of `world-renderer.ts` (4100-4131, 4600-4805) and data transitions (646-688).
  - Also: sail shader `garden-fleet-batch.ts:678-712`; Gerstner CPU reference `garden-water.ts:152-330`; the wake mix in water at 810-822 and 1168.
  - History: the prior lane review and the decision ledger.

## Spell-breakers (defects)
1. **Anchored hulls pirouette.**
   - Where: `riskDriftSampleInto` sets heading to the velocity of a sub-tile Lissajous (`risk-drift.ts:111-136`) for every risk rest and every open-water waypoint rest (`risk-water.ts:22`, `open-water.ts:121`). `resolve.ts:39` only applies bow-to-wind when speed is exactly 0, which never happens here.
   - Measured, per band:

     | Band | Full turns / min | Peak yaw (°/s) |
     | --- | --- | --- |
     | calm | 0.55 | 995 |
     | alert | 1.3 | — |
     | danger | 3.6 | 5 215 |

     Danger ships spend 27 s of every 10 minutes above 57 °/s.
   - Seen in `anchorage-noon-500ms` frames 03→04 (foreground junk, about 50° in 0.5 s) and `crop-danger-strip.png` (the navy sailboat goes from edge-on to broadside in about 8 s while at rest). A boat at anchor that spins like a compass needle is the loudest token tell in the harbour.
   - Fix: idea fleet-motion-1. **M**
2. **Hard heading snaps at every rest↔voyage boundary.**
   - `isCompatibleStateTransition` (`visual-motion.ts:189-208`) has no `sailing↔risk-drift` pair. Transit legs report `sailing` at their ends (`route-cycle.ts:85-87,115-117`), so both boundaries fall through to `copyExactSample`: the heading jumps by an arbitrary angle in one frame.
   - New route-path memory keys also seed with no lerp (`memory.ts:161-174`).
   - The renderer converts that one-frame jump into a 0.16 rad (9°) heel flick (`world-renderer.ts:4124-4131`).
   - [INFERENCE] About 184 ships × 4 boundaries per ~20-minute cycle gives roughly 0.6 snaps per second somewhere in the frame.
   - Fix:
     - Add the missing compatible pairs.
     - Replace the exponential heading lerp in `smoothHeadingInto` (`visual-motion.ts:230-255`) with a yaw-rate limiter: ≤20 °/s underway, ≤4 °/s at rest, with rate easing.
     - Derive turn heel from that limited, low-passed rate, and lower the clamp from 0.16 to 0.05.
   - Cost **S**.
3. **Whisker wakes.**
   - Two 1-px `LineBasicMaterial` polylines per hull (`garden-ships.ts:2847-2858`, opacity .38, `world-renderer.ts:3627-3632`) splay from the stern like cat whiskers or broken rigging.
   - Seen in `crop-whiskers.png`, `noon.png` near (1195–1215, 770), and `golden.png` near (1185–1215, 770) and (940–975, 795).
   - LaneHeadroom's census puts them at 84 of 279 draws.
   - Fix: delete them. Cost **S**, saves about 84 draws and about 0.9 ms CPU (at ~11 µs per draw).
4. **Hulls are rigid on a moving sea.**
   - Roll = `tideOffset·0.18` and pitch = `tideOffset·0.08`, with `tideOffset = sin(10-min tide)·0.055` (`resolve.ts:34-36`, `world-renderer.ts:4701-4704`). That is ≤0.57° roll with a 600 s period, which reads as zero.
   - `open-water-800ms`: across 9.6 s no hull heaves, pitches or rolls while the Gerstner and normal detail keep moving. The hulls look pasted on.
   - Fix: idea fleet-motion-2. **M**
5. **The wake field is invisible by day.**
   - Foam mixes into the water at ≤`0.26·(0.2+0.08·daylight)·w` (`garden-water.ts:1168`), which is about 3% at noon.
   - The batch quads are at opacity 0.08 (`world-renderer.ts:3620-3626`).
   - `crop-green.png`: a hull under way shows no foam, no bow cushion and no wedge. Only `golden.png` (1090–1150, 680–700) shows a faint arc.
   - Fix: idea fleet-motion-3. **S–M**
6. **The arrival caption is untruthful and late.**
   - `supplyTrend` falls back to "increased" whenever issuance is `flat` or missing (`pharosville-world.tsx:577`; the type is `"minting"|"redeeming"|"flat"`, `world-types.ts:588`).
   - The ceremony triggers only once the ship is already tied up, via dock-dwell `secondsInto<10` (`garden-arrival-beats.ts:130-133`), so the words land after the event.
   - Candidates are not limited to hulls visible in the frame. `selected-ship.png` and `wholemap-noon.png` announce arrivals at Ethereum that cannot be seen.
   - [INFERENCE] The harbour named is the ship's home dock (`pharosville-world.tsx:570`), not necessarily the berth the scheduler sent it to (`weightedDockStopSchedule`).
   - Fix: see fleet-motion-5. The truth part is **S**.
7. **Sails dip across the whole fleet.**
   - Every ship collapses its sails to 0.6 at every berth arrival and again before every departure (`world-renderer.ts:4607-4608` applies `beatSailScale` to all ships; `garden-arrival-beats.ts:121-128`).
   - [INFERENCE] With 184 ships on roughly 20-minute cycles, about 3 ships are dipping at any moment. These are not ceremonies, they are twitches.
   - Fix: limit the dip to the ceremony subject; see fleet-motion-5. **S**
8. **Consort formations use world axes and teleport.**
   - The offset `(dx, dy)` is added in world space (`consort.ts:141-144`), so when a squad turns the consorts crab sideways rather than wheeling.
   - When an offset lands on land, the consort is dropped onto the flagship's tile (`consort.ts:159-169`), so two hulls overlap.
   - A ±0.18-tile "breathing" sine adds drift (`consort.ts:150-155`).
   - `danger-basin-2s` frames 07–11 show a newly arrived hull resting in contact with the navy sailboat. [INFERENCE] I cannot tell from the frames whether that pair is a consort pair.
   - Fix: fleet-motion-7. **S–M**
9. **Docking twitch.**
   - The fender yaw is `sin(t·2.7)·0.04` (`transit.ts:340`), a 2.3 s nervous wobble at contact.
   - Arrivals turn with τ 0.06 s (`memory.ts:131`), a snap into the berth.
   - Fix: a single damped settle, 0.03 rad decaying over 6 s, and τ ≥ 0.25 s. **S**
10. **Data-change arrivals grow out of nothing.**
    - Arrivals scale from 0 over the first 16% of the transition (`world-renderer.ts:681`, `4665-4668`), and departures shrink the same way.
    - Fix: keep full scale and fade through `mist`/`mapVisibilityAlpha` at the fog edge. **S**

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### ★ fleet-motion-1 Ride to the anchor; swing at the turn of the tide
- **Picture:** Each anchored boat lies bow to wind and current, a little downstream of an unseen anchor, and sheers gently on its rode. Calm-water boats are nearly still; boats in danger water sheer and snub hard. Every five minutes the tide turns. Over about a minute the whole anchorage swings together, each berth a few seconds behind its neighbour, like a school of fish turning. Then everything settles and nothing moves for minutes.
- **Why:** Spell-breakers 1–2. The code already has a harbour-master tide (`motion-planning.ts:29-37`, `berthTidePhase` with ≤24 s lag) but uses it only for a ≤0.07-tile tether and ±2° dock yaw (`mooring.ts:91,109`). Nothing in the frame shows it. A swing at slack water is true to the sea, communal, and happens on a schedule: the bible's "an event, then quiet" (`VISUAL_INVARIANTS.md:64-65`).
- **Impact:** relaxing 5, poetic 5, stunning 3. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws / 0 tris / 0 tex; CPU ≤0.05 ms, about the same as the Lissajous it replaces [INFERENCE].
- **How:** Rewrite the body of `riskDriftSampleInto` (`risk-drift.ts:76-157`) and `openWaterWaypointRestSampleInto` (`open-water.ts:104-131`) as anchor kinematics.
  - **Stream vector.** `S = w·windDir + c(t)·currentDir`.
    - `c(t) = cos(berthTidePhase(t, anchor))`, a 600 s cycle, so the current reverses every 300 s.
    - `currentDir` is a per-basin constant: a unit vector along the local channel axis, one per sea body.
    - Weights `w = 0.45`, current amplitude `0.8`. Both are tunable; with these weights `S` rotates about 110–150° per turn.
  - **Ride heading.** Target heading `ψ = atan2(-S)`.
    - Near slack, `|c|` is small and the wind dominates.
    - Integrate `ψ` with a critically damped second-order filter, ω = 0.12 rad/s (the swing takes about 40–60 s). Cap the rate at 4 °/s.
  - **Rode position.** The hull centre sits `r = 0.35·hullLength` tiles downstream of the anchor, along `−ψ`. It therefore moves on an arc during the swing; the constant is `REST_RIDE_RODE = 0.35` in hull lengths.
  - **Sheer and snub, the risk encoding.** Add `ψ += A_band·sin(2π t/T_band + seed)`, keeping the ordering the DOM copy promises ("more restless in risk order", `motion-config.ts:51`):

    | Band | A_band | T_band |
    | --- | --- | --- |
    | calm | 2° | 70 s |
    | watch | 4° | 55 s |
    | alert | 7° | 40 s |
    | warning | 11° | 30 s |
    | danger | 16° | 22 s |

    Add a surge of `±0.04·A_band/16` tiles along the heading, with the same period and a quarter-phase lead.
  - **Constants.** Delete `REST_RADIUS_*` and the Lissajous; keep `PATROL_SPEED_*` only for their DOM meaning.
  - **Clean entries and exits.** `riskDriftSampleInto` receives the incoming transit heading and blends `ψ` from it over 12 s. On exit, the rest's last `ψ` becomes the leg's starting heading. The departure transit ramps its lane offset from 0 (already `sin(progress·π)`).
  - **Slack-water hush.** Choose `pairedShipPhaseSeconds` slots (`motion-planning.ts:758-789`) so that no voyage boundary falls within ±30 s of a tide turn (60 of the 600 s horizon, i.e. 6 of 60 slots are forbidden). The swing is then the only thing happening.
- **Displaces:** the Lissajous pirouette and its heel flicks; the 0.07–0.6-tile rest orbits; the ±2° dock yaw sine (`mooring.ts:91`), which becomes this sheer at `A_calm`.
- **Truth & a11y:**
  - Risk band stays ordinal through sheer amplitude and rate. Update the copy in `motionCadenceDetailLabel` (`motion-config.ts:50-52`) to "rests ride and sheer at anchor more restlessly from calm to danger".
  - The tide carries no data. Say so once in the reading guide ("the harbour tide is scenery").
  - Reduced motion: `ψ = atan2(-windDir)` with the rode offset and zero sheer. `resolve.ts:19-24` already sets bow-to-wind, so this is the existing static tableau.
- **Risks:**
  - A synchronised 150-hull swing could read as choreography. The per-berth lag (0–24 s) plus a per-sea-body current axis breaks the unison, and the lag can be raised to 0–45 s.
  - Rode arcs could touch neighbouring hulls: clamp `r` by the anchorage separation that fleet-placement already enforces.
  - Re-pins: rest-radius/orbit expectations in `motion.test.ts`; pair-window coverage (salt re-scan per `motion-planning.ts:772-777`).
- **Acceptance:**
  - `node outputs/opus-review/tools/motion-sheet.mjs --hash "#t=12" --frames 12 --interval 5000 --clip 900,460,700,300`, timed across a tide turn (wall time mod 600 s ≈ 150 or 450; that is the minute when `c(t)` crosses 0). The contact sheet shows the right-hand anchorage bows rotating together over about 60 s.
  - A 500 ms sheet away from the turn shows no hull yaw above 4 °/s.
  - A scratch sampler reports 0 heading changes above 20 °/s over 30 minutes for the whole fleet.

### ★ fleet-motion-2 Let the swell pass through; heel to the wind
- **Picture:** Long swells roll in along the wind bearing. The boats nearest the approach lift their bows first, then the next row, then the next, a slow wave of nodding hulls crossing the anchorage. The inlet by the tower barely stirs. When a gust front crosses the harbour, the sails under way lean together by a few degrees and come back up.
- **Why:** Spell-breaker 4.
  - Hulls read as rigid because no degree of freedom follows the sea (`world-renderer.ts:4701-4704`).
  - The sea already has a deterministic Gerstner spectrum with a CPU reference, `sampleGardenGerstner` (`garden-water.ts:228`), and the sails already feel a gust front travelling at `GARDEN_GUST_WORLD_SPEED` (`garden-fleet-batch.ts:686-697`). The hull ignores both.
  - A swell passing through the fleet is the one motion that makes 184 hulls feel like one body of water.
- **Impact:** stunning 4, relaxing 4, poetic 4. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws / 0 tris / 0 tex; about 1.3k sin/cos per frame, roughly 0.03–0.06 ms CPU [INFERENCE]. The per-ship matrix writes already exist.
- **How:**
  - **Move the Gerstner reference.** Move `sampleGardenGerstner` and `GARDEN_WATER_GERSTNER` into a pure `src/systems/sea-swell.ts` and re-export them. This keeps the `motion-types.ts:161` rule that the renderer never owns a hull oscillator.
  - **Sample it per ship.** In `resolveShipMotionSampleInto` (`resolve.ts:32-36`), sample it at the hull's world position with the shader's phase time `uTime·(0.72+uTempo·0.38)` and the same wind rotation. Emit `sample.swellHeave`, `swellPitch` and `swellRoll` in place of `tideOffset`.
  - **Pitch and roll.** Project the gradient `∇h` onto the hull axes: `pitch = G_p·(∇h·fwd)`, `roll = G_r·(∇h·side)`.
    - `G_p` and `G_r` are chosen so that at swell 0.5 the amplitudes are ±1.2° pitch and ±2.0° roll. A literal slope would be about 0.1°, because rendered displacement is only 0.022–0.036 u (`garden-water.ts:2148-2151`), so the hull response is deliberately stylised in amplitude but follows the real phase.
    - Hull-length filter: `×clamp(1 − L/60, 0.35, 1)`, so long titans nod less than kobaya.
  - **Where it rocks.** Region factor `×0.2` inside the harbour calm mask (mirroring `harborCalm·0.8`, `garden-water.ts:507`), and `×1.5` in danger water.
  - **Heave.** `0.6·h·amp`, with the waterline collar rising with it.
  - **Wind heel, under way only.** Apparent wind `AW = trueWind − v`.
    - `heel = −sign(AW×fwd)·6°·|sin(AWA)|·windSpeed·(0.6+0.4·gust(x, z, t))·sailSet`.
    - Low-pass with τ 2.5 s. Use `gardenGustAtWorldPosition`, which already exists for pennants (`garden-fleet-batch.ts:1496`).
    - Moored and anchored hulls get zero wind heel.
  - **Turn heel.** Lower the clamp from 0.16 to 0.05 (`world-renderer.ts:4130`).
  - **Renderer.** Replace `world-renderer.ts:4701-4704` with the new channels.
- **Displaces:** the tide heave/roll proxy and most of the turn-heel range; the flat, parked-on-glass look.
- **Truth & a11y:** No analytical meaning. The existing danger-water chop gets a hull echo, which is consistent with the band and already carried in the DOM. Reduced motion: level hulls and static heave, as today.
- **Risks:**
  - Visible desync if the CPU phase time drifts from the shader. The water's `uTime` and tempo must feed both, from one source.
  - Hit-testing and follow-selected use the same pose (`garden-fleet-batch.ts:1413-1415`), so they stay consistent.
  - The heave must not break the waterline collar.
- **Acceptance:**
  - `open-water-800ms` recapture (same clip): hulls near (1000–1100, 640–700) show visible pitch/roll phase differences frame to frame, and neighbours nod in sequence along the swell bearing.
  - The harbour-calm inlet hulls barely move.
  - A `--reduced` still is identical to today's.

### ★ fleet-motion-3 The wake as a glassy slick, not whiskers
- **Picture:** Behind each boat under way lies a long, smooth, darker-mirrored lane where the water's small ripples have been flattened. It lasts about half a minute and bends where the boat bent. There is a small churn of foam at the stern and a soft cushion at the bow, never lines. At golden hour the slicks catch the sky like brushed lacquer; at night they cut the moon road. The paths of the day are written on the water and slowly erased.
- **Why:** Spell-breakers 3 and 5. Real wakes in a light chop read mostly as a slick, not a white V. The field already exists (512², `garden-wakes.ts`), but its 8 s foam-only memory (`WAKE_DECAY_RATE 0.12`, `:67`) and a ≤3% day mix (`garden-water.ts:1168`) make it invisible. Ship-locked quads at 0.08 opacity and 1-px lines stand in for it.
- **Impact:** stunning 4, poetic 5, relaxing 4. **Confidence:** M–H.
- **Cost:** S–M. **Perf:** **−84 draws** (whisker lines) and −2 draws (trail/bow quads hidden at `balanced` and above); 0 tris; 0 new textures (reuses the RGBA target's G channel); +0 fetches (`uWakeMap` is already sampled three times). ≤0.05 ms GPU at 1×, [INFERENCE] about 4× that at DPR 2.
- **How:**
  - **Delete the whiskers.** Remove `createWake` line detail (`garden-ships.ts:2847-2858`) and `wakeMaterial`.
  - **Two decay rates.** Feedback (`garden-wakes.ts:160-183`) gets `uniform vec4 uDecay`: R (foam) `exp(−0.35·dt)`, about 3 s; G (slick) `exp(−0.035·dt)`, about 30 s. Diffusion stays on R only; G gets a 0.25 weight so the lane softens as it ages.
  - **Stamp (`:208-225`).**
    - R: bow cushion (Gaussian 0.35·L ahead of the stern origin); stern churn (`s<0.6L`); and Kelvin arms at 19.5° clipped to `s<1.2L`, so the arms stay short and hull-scaled.
    - G: a centre wash of width `1.1·beam·(0.6+0.4·speedRatio)` with no taper, laid continuously each frame.
    - `aParam.y` already carries hull length; pack beam into the stamp's unused sign bit or derive it as `0.28·L`.
  - **Water (`garden-water.ts:810-822,1160-1170`).** Read `slick = texture.g`.
    - Detail-normal amplitude `×(1−0.75·slick)`; the mirror-zone env weight `+0.3·slick`.
    - Foam colour mix cap 0.26 → 0.40, applied to R only.
  - **Tier handling.** At `balanced` and above, set `visual.wake.visible=false` for the batch quads (`world-renderer.ts:4741-4755`) and keep them as the low-tier fallback only.
- **Displaces:** whisker lines (84 draws), ghost trail/bow quads, and the diffuse ~8 s foam smear.
- **Truth & a11y:**
  - Wake strength already encodes risk zone (`transit.ts:445-452`) and |24h change| ≥ 2% (`computeWakeMultiplier`, `motion-planning.ts:483-488`). Keep that mapping by scaling slick length through G stamp intensity.
  - The underlying facts (band, 24h change) are in the detail panel (`selected-ship.png` "+0.2% 24h"). No DOM copy names wakes today, and none is needed.
  - Reduced motion: the field resets to empty (`garden-wakes.ts:36-38`), as today.
- **Risks:**
  - Slicks from 50+ simultaneous movers could stripe the basin, which is why fleet-motion-4 matters.
  - Slick contrast must never out-draw the tower's reflection. Cap the env boost inside `mirrorZone`.
  - 512² over halfSize ≤220 u gives about 0.86 u per texel at the far end, so slicks stay ≥2 texels wide on hulls of beam ≥1.7 u. Near-camera quality holds.
- **Acceptance:**
  - `harbour-tempo-5s` recapture at `#t=12` and `#t=17.6`: a moving hull shows a readable slick at least 3 hull-lengths long that fades within about 40 s.
  - The draw count in the `.txt` drops by about 84.
  - `crop-whiskers`-equivalent crops show no hairlines.

### fleet-motion-4 Long rests, tide windows: fewer hulls moving at once
- **Picture:** At any moment perhaps a dozen boats are under way in the whole harbour and four or five in the rest frame. Departures gather on the ebb and homecomings on the flood; in between, the anchorage is almost wholly still. You can follow one voyage from start to end without three others crossing it.
- **Why:**
  - Legs of 90–180 s and rests of 240–480 s (`motion-config.ts:36-40`; `shipRestDurationSeconds`, `motion-planning.ts:713-719`) give about a 29% underway share. [INFERENCE] That is about 53 of 184 hulls moving at any instant.
  - The pair slots spread boundaries evenly over 600 s (`motion-planning.ts:770-788`), so there is never a communal lull.
  - `harbour-tempo-5s`: in every 5 s frame several hulls have moved somewhere. The bible asks for long rests (`VISUAL_INVARIANTS.md:64`).
- **Impact:** relaxing 5, poetic 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0 / 0 / 0; slightly less wake and heading work.
- **How:**
  - `MOTION_REST_MIN/MAX_SECONDS` 240/480 → 600/1500, keeping the 155 s identity spread scaled proportionally. Keep legs at 90–180 s, so a voyage stays an event.
  - `MOTION_CYCLE_MAX_SECONDS` → 3600. Quantise each ship's `cycleSeconds` to a multiple of the 600 s tide by absorbing the remainder into the risk rest.
  - In `pairedShipPhaseSeconds`, weight slot choice 3:1 so that departure boundaries fall in tide quarter-phases [0, 150) and arrival boundaries in [300, 450), and keep the ±30 s slack hush from fleet-motion-1.
  - [INFERENCE] Resulting underway share is about 11%, about 20 hulls map-wide, with peaks of about 30 in the windows.
- **Displaces:** roughly 60% of the simultaneous hull motion and the constant background shuffle.
- **Truth & a11y:**
  - Routes carry no meaning (`MOTION_ROUTE_MEANING_CAVEAT`, `motion-config.ts:48`). Update `motionCadenceDetailLabel` to the new ranges and "voyages leave on the ebb and return on the flood".
  - Reduced motion: unchanged (a static berth or rest pose).
- **Risks:**
  - The `motion.test.ts` duty-cycle, cadence and pair-coverage pins need re-pinning (salt re-scan).
  - A harbour that looks too dead at some hours. The arrival ceremony and the tide swing are what carry the life.
- **Acceptance:** A scratch count of `speedTilesPerSecond>0.1` across 30 minutes shows median ≤22 and max ≤34. A 12 × 5 s sheet outside the windows shows ≤3 moving hulls in the rest frame.

### fleet-motion-5 The approach is the ceremony
- **Picture:** A significant ship rounds into view about 40 s before her berth. Her wake slick lengthens, then shortens as she bleeds speed. The upper sails come in one by one, the course is brailed up, and she ghosts the last hull-length and kisses the fender. A single line of text names her and her harbour, correctly, then fades. Everything else in the harbour is still.
- **Why:**
  - Spell-breakers 6–7 and 9.
  - The ceremony fires after berthing (`garden-arrival-beats.ts:130-133`), may name an off-frame or home harbour, and claims "supply increased" by default (`pharosville-world.tsx:570-577`).
  - Meanwhile every ship in the fleet dips its sails.
  - The deceleration is squeezed into the last 11% of the transit (`motion-config.ts:54-55`, `transit.ts:107-114`) with a 0.06 s τ snap-turn (`memory.ts:131`).
- **Impact:** poetic 5, relaxing 3, stunning 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0 / 0 / 0.
- **How:**
  - **Trigger.** Nominate the ceremony at arrival-transit `progress ≥ 0.66`, where `sampleState` is already `arriving`, and only for candidates whose berth projects inside the rest frustum with a 10% margin. Use `projection.ts`, the same test hit-testing uses.
  - **Wiring.** Pass the director's active subject to the renderer instead of `selectGardenArrivalBeatShipDetailIds` (`world-renderer.ts:4580`), and gate `beatSailScale` to that subject only.
  - **Glide.**
    - `ARRIVING_FULL_TRANSIT_END` 0.85 → 0.70 and `ARRIVING_DECEL_END` 0.96 → 0.94.
    - Speed profile `1 − smoothstep`³, so the ship coasts.
    - Heading τ 0.06 → 0.3 s.
    - Replace the fender sine with one damped yaw: 0.03 rad, ζ = 0.4, 6 s.
  - **Sail handling, subject only.**
    - Uppers furl progressively over progress 0.70–0.85, one bit per 2 s.
    - The course dips to 0.6 over 0.85–0.94 and holds to berth, then recovers to "set, slack" (no flutter; see fleet-motion-6) after 20 s, because identity must stay on the cloth.
  - **Copy.**
    - Use `supplyTrend` only when `direction` is minting or redeeming; for `flat` or missing issuance, omit the clause.
    - Name `motion.currentDockId`'s dock, not `dockChainId`.
    - Keep "arrives at" but add to the reading guide that voyages are scenery and the clause is the fact.
- **Displaces:** fleet-wide sail dips (~3 concurrent), the post-berth nameplate burst, the fender jiggle and the snap-turn.
- **Truth & a11y:** Fixes a false claim. The caption and `setAnnouncement` already give DOM parity (`pharosville-world.tsx:583-586`). Reduced motion: no ceremony (as today) and the ledger unchanged.
- **Risks:**
  - Fewer ceremonies once they must be in frame. That is acceptable; the director's 2–4 min interval (`:13-14`) and fleet-motion-4's flood windows supply candidates.
  - Re-pins: `garden-arrival-beats.test.ts` windows and trigger.
- **Acceptance:** A 12 × 4 s sheet of the Ethereum quay (`clip 0,420,760,420`) during a ceremony shows one hull decelerating over at least 40 s with staged sails and no other sail dips. The caption appears before the ship stops. With a `flat`-issuance fixture, no "increased" appears.

### fleet-motion-6 Sailing, not sliding: trim, belly, luff, leeway
- **Picture:** Sails under way hold a steady belly to leeward and are braced to the wind. A boat beating upwind heels and crabs slightly; one running free sits upright with her sail squared. A moored boat's sail hangs slack, and a boat pointing straight into the wind lets its sail shiver. The fleet stops flapping like laundry.
- **Why:**
  - Sail motion is a symmetric `sin(flutterPhase)` about flat (`garden-fleet-batch.ts:703-709`), which is a luff on every point of sail.
  - Sails never trim to the wind, and speed is the same on every heading (`transit.ts:322-331`).
  - `crop-green.png`: a flat sail on a boat under way.
- **Impact:** stunning 3, poetic 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws / 0 tris / 0 tex; no new vertex attributes (the program is at 16, per LaneHeadroom). All from `instanceMatrix` and `uWindDir`, about 10 ALU per sail vertex.
- **How:**
  - **In the shader.**
    - `AWA` = angle between the instance forward (`instanceMatrix[0].xz`) and `uWindDir`, with a per-instance hash from `instanceMatrix[3]`.
    - Camber: `transformed.z = sign(side)·(bakedBelly)·(0.7+0.3·set)`. LaneFleetCraft bakes the belly in +z; flip it by leeward sign.
    - Ripple: `0.2×` today's amplitude.
    - Luff (today's full flutter) only when `|AWA|<35°`, or when moored/anchored, where it is slack: belly 0.2, flutter 0.3.
  - **Brace.** Drive LaneFleetCraft's per-instance brace angle `clamp(AWA/2, ±40°)`; the static hashed brace is the reduced/moored pose.
  - **Leeway, in `transitSampleInto`.** Add a heading offset of `−4°·sin(AWA)` toward windward, visual only, with the path unchanged.
  - **Point-of-sail pace.** Re-parametrise progress by a per-path cumulative weight `k(AWA)`: 0.75 close-hauled, 1.0 beam, 0.9 run. Normalise it so the total leg time is unchanged, which keeps the pinned durations. Store it with `ShipWaterPath` (`motion-planning.ts` path cache).
- **Displaces:** the symmetric flutter everywhere; constant speed on every heading.
- **Truth & a11y:** No meaning. Reduced motion: `uWindTime` 0, static camber and brace (`garden-fleet-batch.ts:137-138`).
- **Risks:**
  - The mark on the sail (`D8` mon on cloth) must stay legible through camber. Keep the belly ≤ today's baked max.
  - Integrating `k` along the path touches path caching.
- **Acceptance:** A close still at `#t=12` (zoom ≥1.3) shows under-way sails bellied to one side and moored sails slack. A 500 ms sheet shows no sail oscillating through flat except head-to-wind boats.

### fleet-motion-7 Follow in the wake: consorts as time-delayed path followers
- **Picture:** Squads leave harbour in single file, each boat stepping into the slick of the one ahead and turning at the same mark. At anchor they lie as a small raft beside their flagship.
- **Why:** Spell-breaker 8. World-axis offsets crab on turns and teleport on land. A time delay on the flagship's own water-safe path cannot touch land, turns in true arcs, and makes processions (prior lane idea 1, `W4.5`) almost free.
- **Impact:** poetic 4, relaxing 3. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 / 0 / 0; one extra flagship route sample per consort per frame (≤0.1 ms) [INFERENCE].
- **How:**
  - **Under way.** In `consortShadowSampleInto` (`consort.ts:65-207`), for flagship states `departing | sailing | arriving`, sample the flagship route at `t − i·Δ` (`sampleRouteCycleInto(flagshipRoute, t − i·Δ, …)`).
    - `Δ = spacing/speed`, with `spacing = 1.4·max(L_i, L_{i-1})` tiles, giving about 4–7 s.
    - Keep that sample's heading and wake, and delete the world offset and breathing.
  - **At rest.** Use the existing offset rotated into the flagship's heading frame (rotate `dx, dy` by `ψ_flagship`) and apply the rode kinematics from fleet-motion-1 with shared `ψ`.
- **Displaces:** formation gain swings (1.4 → 0.55), world-axis crabbing, the land-collapse teleport, and the ±0.18-tile breathing.
- **Truth & a11y:** Squad membership is already in DOM parity (maker-squad). Reduced motion: the rest raft pose.
- **Risks:** Consorts would reach the berth up to about 20 s after the flagship, so dwell must absorb the delay. Re-pins: consort offset tests in `motion.test.ts`.
- **Acceptance:** A 12 × 2 s sheet of a departing squad shows single file and no hull overlap. A scratch check shows 0 consort tiles off-water over 30 minutes.

## Subtractions
- Delete the whisker wake lines, `createWake` detail and `wakeMaterial` (`garden-ships.ts:2847-2858`, `world-renderer.ts:3627-3632`): −84 draws.
- Hide the ghost wake trail/bow quads at `balanced` and above (`garden-wake-batch.ts`, opacity 0.08): −2 draws.
- Delete the Lissajous rest orbit and heading (`risk-drift.ts:109-136`) and the `REST_RADIUS_*` table.
- Delete the fleet-wide sail dip; keep it only for the ceremony subject (`world-renderer.ts:4607-4608`).
- Delete the fender yaw sine (`transit.ts:333-348`) and the 0.06 s arrival τ (`memory.ts:131`).
- Delete the consort breathing sine (`consort.ts:150-155`) and formation gain modulation (`consort.ts:135-142`).
- Delete the tide-driven roll/pitch proxy (`world-renderer.ts:4703-4704`), replaced by fleet-motion-2.
- Delete scale-from-zero data arrivals (`world-renderer.ts:681,4665-4668`); fade at the mist edge instead.

## Reversals
- **Motion cadence, 90–180 s legs / 240–480 s rests with evenly spread pair slots** (`motion-config.ts:36-51`; prior lane "Rejected: shorten every rest").
  - Evidence: `harbour-tempo-5s` shows constant multi-hull motion; [INFERENCE] about 29% underway share.
  - Argument: the bible's "long rests" is violated by aggregate, not per-ship, activity. Lengthening rests and windowing departures is the opposite of the rejected shortening.
  - Risk: re-pins, and a quieter harbour that needs the ceremony and the tide swing to stay alive.
- **"Rests read as rests"** (Wave 4b note, `risk-water.ts:5-10`) is contradicted by its own implementation.
  - The rest encodes risk as orbit radius and rate, which produces spinning.
  - Reopen the encoding: keep the DOM promise "more restless in risk order", but carry it with anchor sheer, snub and pitch instead of orbits.
- **Risk-water restlessness as displacement** (`REST_RADIUS_DANGER = 0.6` tiles).
  - Danger ships wander 0.6 tiles and collide visually with neighbours (`danger-basin-2s`, the crowded left basin).
  - Replace positional wander with angular sheer. It is legible without eating space and needs no new DOM text.
- **"Sails never held furled at berth"** (`garden-arrival-beats.ts:105`): keep for identity (D8), but reverse the implicit "set and fluttering at berth". Slack, unfluttered cloth keeps the mon readable and stops moored boats from looking under way.

## Cross-lane dependencies
- **LaneFleetCraft:**
  - fleet-motion-6 drives their per-instance brace angle and flips their baked +z belly by leeward sign, with no new attributes. Their centred-sail geometry keeps `aSailHead`/`sailDrop` semantics (confirmed via IRC).
  - Their far-LOD hull slabs (the pale "planks" in the `noon.png` right anchorage) will slide like tiles unless fleet-motion-2 pitch/heave applies to far instances too.
- **LaneWater:**
  - fleet-motion-3 edits the water fragment (`garden-water.ts:810-822,1160-1170`) and the wake RT channel use.
  - fleet-motion-2 needs `sampleGardenGerstner` moved to `src/systems` and a single source for water `uTime`/tempo.
  - The slick must respect their mirror-zone and hero-reflection priorities.
- **LaneHeadroom:** −86 draws from subtractions funds others. The CPU cost of fleet-motion-2/7 is JS per ship per frame; ask them to sanity-check it at 120 Hz.
- **Garden director / LaneLife:** the slack-water tide swing (fleet-motion-1) should be registered as a director environmental beat, so heron, lantern and arrival beats avoid the same minute.
- **Weather/sky:** one authoritative wind vector and gust field for heel, trim and the rode (`weather.ts`, `gardenGustAtWorldPosition`). PSI "wind calm" (D15) will modulate heel; keep the heel cap small so market calm is not read off the boats.
- **LaneDataPoetry / LaneChrome:** the arrival caption grammar fix (issuance clause only when minting/redeeming; actual berth name) and the reading-guide line that voyages and tide are scenery.
- **Camera lane:** every contact sheet drifted (landing zoom and breathing), which confounds reading ship motion. Motion judgements need a camera-still capture mode for acceptance.

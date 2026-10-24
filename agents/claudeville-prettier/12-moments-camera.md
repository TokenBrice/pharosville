# 12 — Moments, camera & interaction

Vertical 12 of the "prettier & more magical" sweep. Read-only study of `src/harbour/engine/{camera-rig,input,post}.ts`,
`layout/{framing,layout-system}.ts`, `app/`, `ui/`, `life/`, the fleet hover shader, and the sim's event codes.
One new capture: `shots/12-lamplighting.png` (t=19.2, heart). I also re-read `shots/01-overview.png`, `dusk.png`
and `06-berth-close.png`.

## 1. Current state

- **The rig is calm but has no sense of a "move".** `CameraRig.update` uses one exponential chase
  (`k = 1 − e^(−6Δ)`, about 170 ms time constant) for everything: wheel ticks, `flyTo`, `goHome`. A long flight
  starts at full speed and then decays, so it snaps away and drifts in. There is no ease-in, no duration that
  grows with distance, and no arc. Pitch and yaw are fixed (D1, good).
- **Input is solid**: the wheel zooms, drag pans, and touch gets a fling plus pinch-about-midpoint
  (`input.ts`). Wheel zoom goes toward the screen centre, not the cursor (`zoom`, not `zoomAt`). Mouse users
  lose the "zoom where I'm looking" behaviour that touch already has.
- **Selection already works well.** `store.flyTo` frames each kind at its own distance and keeps the subject
  clear of the side panel or bottom sheet. Selection adds a ring on the water (`fleet-system.updateRing`). The
  fleet shader adds a warm rim plus a 10 % lift on hover (hover = 1, selected = 0.5), and a selected wreck's
  lantern lights the sand (`fleet-material.ts:405-425`, `fleet-system.ts:166`). Landmarks get **no in-world
  hover feedback**: `UIPicking.setHover` only forwards boats.
- **Arrival**: the poster (`#pv-poster`) crossfades over 1.1 s once the first frame is drawn, the data is in,
  and 4 frames have settled (`app/harbour-app.tsx`, `poster.ts`). The camera is already at rest when the world
  appears, so the reveal is a dissolve with no gesture. A one-time intro hint exists (`CornerMark`, `?intro=`).
- **Post**: tilt-shift fades in only at overview distance (`post.ts:189-192`), and the pass is skipped at
  opacity 0. This gives a reusable focus pass at no idle cost.
- **Zoom-dependent detail already exists in places**: water lettering for sea zones (`identity-system`
  `lettering.camDist`), far-flag scaling, the shadow distance, and audio zoom. Chain and pier names appear
  only in `C` chart mode.
- **Keys**: `/`, `L`, `C`, `H`/Home, Esc, and double-click or double-tap on water to go home. There are no
  keyboard pan, zoom, follow, or next/previous-ship keys.
- **Scheduled "score"**: there is none. Life (`folk`, `gulls`, `smoke`, `drift`, `flags`) is continuous. The
  sim has **real data events**: `EV_LAUNCH` (a pre-launch coin goes live and leaves the slipway), `EV_TOW`
  (a wreck is towed to the cove), `EV_TO_SHOALS` and `EV_REJOIN` (`sim/sim.ts:27`). They play out without
  any acknowledgement. Window lights come on by a per-window hash share (`time-of-day windowGlow`), so dusk
  lights the town all at once (see `12-lamplighting.png`).
- **History**: v0.19 had Wander (postcard tour) and Stay. The reboot dropped both. The 2026-10-05 L13 review
  explicitly warned against "automatic idle tours" and against DOF that hides neighbours. I honour that below.

## 2. Ideas

### M1 Minimum-jerk glides (`glideTo`)
**What**: Add `CameraRig.glideTo(preset, {ms})`. It eases target and distance from the current pose with a
quintic (minimum-jerk) curve. Duration is `clamp(0.9 + 0.0018·travel_m, 0.9, 2.4)` s. Hops longer than about
250 m also get a soft **crane lift**: distance rises by up to about 12 % mid-flight, then settles. Any pan,
zoom or fling cancels the glide by writing the goal, as today. `flyTo`, `goHome` and M2 use it. The wheel and
drag keep the existing exponential chase.
**Why magical**: The camera moves like a hand-cranked survey crane rather than a spring. The start of a move
is as soft as its end.
**Data**: none (camera).
**Where**: `engine/camera-rig.ts`, `ui/store.ts` (`flyTo`, `goHome`).
**Cost**: S. No GPU cost.
**Risk**: Reduced motion keeps the current `immediate` cut. Make sure `isAt()` reads the glide goal.

### M2 The harbour wakes (arrival drift-in)
**What**: At crossfade, `harbour-app.tsx` places the rig about 14 % further out and about 25 m higher along
its own line of sight (immediate), then `glideTo(home, 6–7 s)` with the M1 curve while the poster dissolves.
The poster is captured from that same pulled-back pose, so the dissolve lines up. During the drift:
(a) the Pharos fire ramps from 0 to its live PSI intensity over about 2 s (a beam-system intro multiplier;
it ends at the true PSI value, so it never lies); (b) at dusk or night, the town's lamps light in a **wave
outward from the Pharos** (see M8a). Any input cancels the drift. Reduced motion skips it.
**Why magical**: The first ten seconds become an arrival by sea: you drift in as the light is kindled.
**Data**: decorative ramp that ends at the real values.
**Where**: `app/harbour-app.tsx`, `app/poster.ts`, `beam/beam-system.ts` (intro scalar), M1. The poster
generator needs a pose offset.
**Cost**: S–M. No per-frame cost after 7 s.
**Risk**: The drift must not block the first click. A timeout (`DATA_WAIT_MS`) arrival must still drift.
"Sails filling" is **not** proposed: the sails are the sim's true state (`sailState`), and faking a furl
would misreport boats under way.

### M3 Route as a chart line on the water
**What**: When a boat is selected, draw its **plan itinerary** on the water:
- the current leg (`legPath` in the sim) as a fine ink/brass dashed line that fades out behind her and
  ahead to the next berth;
- later legs as fainter dotted lines;
- a small brass tick at each port of call.

The line is one ribbon (≤ 2k verts) that sits on `ocean.heightAt`. It is drawn after the water and before
the hulls, with `depthTest` on. It fades in after the glide lands, and its dashes draw on over about 600 ms
(stroke-offset uniform).
**Why magical**: "Where is she bound?" is answered the way a navigator would pencil it on a chart.
**Data**: data-bound. The plan's segments are the coin's time docked per chain, which is supply share (D11).
The DOM equivalent already exists: the panel's `ChainSplit` stops list (`Panel.tsx:144-199`). Label the line
"route (from supply share)" in the ledger legend.
**Where**: a sim getter `itineraryOf(id)` → polylines (`sim/sim.ts` already holds `legPath`/`PathRec`), a new
`fleet/route-line.ts`, `ui/store.ts` select hook.
**Cost**: M. One draw call, about 2k tris while selected, trivial ALU.
**Risk**: Do not draw it for static single-chain hulls (no route). It must not imply a forecast, so the
copy says "today's rounds".

### M4 Focus pull on the subject
**What**: While a boat, wreck or yard hull is selected, reuse the existing `TiltShiftEffect`. Set the focus
band's `offset` to the subject's NDC y, with `focusArea` about 0.45 and opacity ≤ 0.3. It fades in over
400 ms once the glide lands. Use no depth DOF. Disable it for harbour and zone landmarks, where the subject
is wide.
**Why magical**: The eye settles where the panel is talking, like a model photographed with a macro lens.
**Data**: decorative.
**Where**: `engine/post.ts` (selection override of the tilt params), `ui/store.ts` sets a `focus` service.
**Cost**: S. A half-resolution blur pass only while selected, about 0.2–0.3 ms on an integrated GPU (it
already runs at overview).
**Risk**: L13 warned that DOF must not hide neighbours. Keep the effect weak, with no blur inside a band
about 2× the subject's height, and A/B it before shipping.

### M5 Physical hover: the lantern answers
**What**: Today's boat hover rim reads like a UI outline at noon. Make it physical:
- **Boats**: hover raises the stern lantern to full and adds a tiny warm `harbourlight` pool on the water
  via `LightsService` (as the cove lamp does), lerped over 200 ms. In daylight it becomes a soft sail sheen
  (sun-coloured lift on the cloth only). Reduce the rim factor from 0.8 to 0.4.
- **Landmarks** (currently no feedback): hover lifts that building's window glow by about 30 % at night and
  adds a brass rim in the civic/world materials. Route it through `UIPicking.setHover` → a new
  `world-picking.setHoverLandmark(id)`.

**Why magical**: The thing you point at seems to notice you.
**Data**: decorative feedback. The hover tag remains the text.
**Where**: `fleet/fleet-material.ts` (hi channel), `fleet/fleet-system.ts`, `lights/lights-service.ts`,
`ui/picking.ts`, civic/world materials.
**Cost**: S–M. One extra pooled light slot, no new draws.
**Risk**: Uses the lights budget (`lights.add` count). Hover jitter is already debounced (120 ms re-pick).

### M6 Follow her (gentle)
**What**: The panel for a boat under way gets a quiet "follow" toggle (key `F`). Each frame the rig's goal
target eases toward the boat's position plus the panel offset, with a damped spring (about 1.2 s lag) so
heel and bob never shake the view. Any pan, zoom, Esc or Home releases it. Docking at a berth ends follow
with a 2 s settle.
**Why magical**: You ride along on a voyage; the harbour slides past.
**Data**: none.
**Where**: `ui/store.ts` (follow id, uses `picking.worldPosition`), `ui/Panel.tsx`, `ui/App.tsx` keys.
**Cost**: S.
**Risk**: In reduced motion the world is still, so follow is moot; hide the toggle. Respect the pan
bounds clamp.

### M7 Harbourmaster's watch (opt-in, not automatic)
**What**: Do **not** add an automatic tour (L13 trap, PRODUCT anti-reference). Add two things:
(a) after 3 min of no input and no panel open, an **idle breath**: ±3 % distance and a few metres of pan
around home on a 90 s sine, stopped by any input. It keeps a ten-minute watch alive without travelling.
(b) An opt-in `W` "watch" that steps through **data-ranked** subjects: the biggest mover today, the coin in
the Shoals with the worst deviation, the latest launch. It uses M1 glides with about 20 s dwells, and each
stop pins the hover tag (the DOM text). It is never started by idleness.
**Why magical**: The harbour is never a frozen screenshot, and the watch teaches by observation (PRODUCT
principle 3).
**Data**: (b) is data-ranked from model fields (supply change, peg deviation, `EV_LAUNCH`). The tag and
panel are the DOM equivalent.
**Where**: `ui/store.ts`, `ui/App.tsx`, `ui/CornerMark.tsx` key strip.
**Cost**: S (a), M (b).
**Risk**: Contested territory. Ship (a) first. (b) needs operator sign-off against the v0.19 Wander lesson.

### M8 The daily score (rare moments, rarity-budgeted)
**What**: A `life/score.ts` service. It is deterministic per local date (seeded) and has a **budget**: at
most one "rare" cue per 20 minutes of visit, and every cue is at most 8 s. The cues:
- **a. Lamplighting (decorative, daily).** At dusk the window/lamp share is ordered by distance from the
  Pharos plus a hash jitter, not a pure hash. The town lights in a slow wave over about 90 s, like a
  lamplighter's round. Same share curve, different order. This costs nothing (`time-of-day` /
  `world/materials` window hash).
- **b. First light (decorative, daily).** As the sun clears the horizon, the Pharos fire is "banked": the
  beam fades over 20 s while a thin smoke wisp rises (`life/smoke`).
- **c. The evening gun (decorative, daily).** At sunset, one white puff from the battery terrace (v1.2.0),
  followed 1.2 s later by a dull report only if sound is on (D13).
- **d. Launch day (data: `EV_LAUNCH`).** When a pre-launch coin goes live and leaves the slips, she sails
  out dressed overall (yard bunting already exists), the bell buoy rings twice (sound on), and her first
  hover tag reads "launched today". The source is the `/api/stablecoins` appearance. The DOM equivalent is
  the tag plus a panel line.
- **e. A titan comes home (data: plan leg end).** When a titan's leg ends at her berth, her house flag
  breaks out at the masthead and the quay folk gather (`life/folk` density bump for 30 s). The data source
  is the sim plan; the panel already shows the berth.
- **f. Wreck tow (data: `EV_TOW`).** The tow is escorted at half speed with the cove bell tolling once.
  Solemn, never celebratory.

**Why magical**: Over a ten-minute watch something small and true happens, and it is never noisy.
**Data**: a–c decorative (time of day); d–f bound to existing sim events, each with a tag/panel DOM line.
**Where**: new `life/score.ts`, hooks in `sim/sim.ts` events, `life/smoke.ts`, `life/folk.ts`,
`audio/ambience.ts`, `world/materials.ts`.
**Cost**: M overall; a is S. Negligible GPU cost (reuses smoke and flags).
**Risk**: Calm. Enforce the budget in code and in a test. Reduced motion: cues become instant state
changes (lights on, flag up), with no puffs or wave.

### M9 Chart-paper flourish for the panel and ledger
**What**: The panel opens as an **unrolled chart**: a `clip-path: inset()` reveal from the top over 280 ms,
plus a 1 px brass rule that draws across the head. The pinned tag's brass leader extends to the panel edge
(SVG `stroke-dashoffset`, 300 ms) and then fades, tying object and text together. The ledger opens with the
same unroll. Closing is a plain 160 ms fade.
**Why magical**: The UI behaves like paper instruments on a chart table, not a web drawer.
**Data**: none.
**Where**: `ui/harbour-ui.css` (`.hb-panel`, `.hb-ledger`), `ui/Panel.tsx`, `ui/HoverTag.tsx`.
**Cost**: S. CSS only.
**Risk**: `.hb-reduced` makes it instant (the existing pattern).

### M10 Postcard (framed print)
**What**: Key `P` or a corner-strip button. On the next frame, after the composer renders,
`renderer.domElement.toBlob()` is called in the same task, so `preserveDrawingBuffer` is not needed. The
image goes into a 2D canvas with:
- a deckle paper margin;
- a hairline brass frame;
- a two-line caption set in the wordmark serif: *"PharosVille · 24 October 2026 · 19:12 · Pharos Stability
  Index 78, Steady"* and a freshness line (*"readings as of 19:05 UTC"*).

It shows in a small paper dialog with **Save** (download) and **Close**, and the UI is hidden for the
capture frame.
**Why magical**: You take home a dated print of the harbour as it was that evening.
**Data**: the caption is data-bound (PSI score and band, `truth` ages from the model). The dialog text is
the DOM equivalent.
**Where**: new `ui/Postcard.tsx`, `ui/App.tsx` key, `engine/engine.ts` (one-shot post-render hook).
**Cost**: M. Zero runtime cost until used. Bundle about 2 KB.
**Risk**: A stale feed must say so on the card (`fog = stale` truth). Do not upscale-render (a 2× capture
would spike the GPU); capture at display resolution.

### M11 Keyboard affordances
**What**:
- Arrows/WASD pan via `dragToWorld`, and `+`/`−` zoom via M1 short glides.
- `[` / `]` step through hulls **visible in the current view**, largest first, opening each with the M1
  glide. Announce each through the existing `.hb-sr` live region.
- `F` follow (M6) and `P` postcard (M10).
- The wheel zooms about the cursor (`rig.zoomAt`), matching pinch.

**Why magical**: Not magical so much as dignified. A keyboard visitor gets the whole harbour.
**Data**: none.
**Where**: `ui/App.tsx`, `engine/input.ts`, `ui/CornerMark.tsx` key strip (only `/ L C H` stay visible; the
rest are listed in the ledger).
**Cost**: S.
**Risk**: Must not fire while typing (the `typing()` guard exists).

### M12 Zoom-tiered reveal
**What**:
- **Far** (distance > about 650): pier chain names appear as faint engraved **water lettering** at each
  pier approach, using the identity lettering already used for THE ROADS and THE SHOALS. Chain mode `C`
  stays the full label set.
- **Near** (< about 180): deck life appears. 1–3 `figure-kit` crew per moored hull within 120 m of the
  target, plus cargo stacks (amphorae, bales) on the quay at the hull's berth, sized by that coin's
  mint/burn flow. Both fade with distance.

**Why magical**: Zooming out turns the scene into a chart; zooming in shows a working quay. Each zoom level
gets its own detail.
**Data**: chain names are data (pier = chain), with the ledger and chart labels as DOM equivalents. Cargo by
flow is data-bound (`/api/mint-burn-flows`), with the panel `FlowBars` as the DOM equivalent. Crew are
decorative.
**Where**: `identity/identity-system.ts` (lettering), `life/folk.ts`, `life/figure-kit.ts`, a civic cargo
instancer.
**Cost**: M. Far lettering is one draw. Near crew are instanced and capped at about 60 figures (about 30k
tris), and only near.
**Risk**: D11 says text only on demand. Far lettering is a stretch: keep it at the same faint register as
the zone lettering and flag it for operator sign-off.

### M13 Home with a breath
**What**: `H` and double-click currently snap-chase home. With M1, home becomes a 1.6 s glide with the crane
lift. If the visitor is already home, `H` gives a gentle 4 % push-in and return ("here you are") instead of
doing nothing.
**Why magical**: Home always confirms itself.
**Where**: `ui/store.ts`. **Cost**: S. **Risk**: none.

## 3. Top picks (impact ÷ cost)

1. **M1 Minimum-jerk glides**: S effort. Every camera move improves at once (fly-to, home, and the base for
   M2, M6, M7 and M11).
2. **M2 The harbour wakes**: S–M. It turns the poster dissolve into an arrival, the drift-in plus the
   kindled Pharos, ending at the true PSI.
3. **M3 Route chart line**: M. Magical and truthful: it draws supply share as a voyage, and the DOM
   equivalent already exists in `ChainSplit`.
4. **M8 Daily score (lamplighting wave + launch day first)**: The lamplighter wave costs almost nothing and
   transforms dusk (`12-lamplighting.png` shows everything lit at once). Launch day gives a real data event
   a ceremony.
5. **M10 Postcard**: M. A shareable, dated, PSI-captioned print with zero runtime cost. It spreads the
   harbour without adding chrome.

Runners-up: M5 (landmark hover is a real gap) and M9 (CSS-only polish).

## 4. Cross-vertical hooks

- **Lights / night**: the M8a lamplighting order; M5 hover lantern pools (lights budget).
- **Beam / Pharos**: the M2 kindling ramp; M8b banking the fire at first light.
- **Audio (D13)**: the M8c gun report, M8d launch bell and M8f tow bell. All only when sound is on.
- **Fleet / ships**: M3 route ribbon on the water; M5 sail sheen; M8e titan house flag.
- **Ocean**: M3 ribbon height via `heightAt`; route foam at the bow when the line is drawn on.
- **Life / folk**: M12 near-zoom crew and cargo; M8e quay gathering; M8b smoke.
- **Post / grade**: M4 focus pull shares tilt-shift with the overview miniature cue.
- **UI chrome / identity**: M9 paper flourish, M10 postcard typography, M12 water lettering.

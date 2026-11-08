# O7: Motion, cinematography and enchantment over a 10-minute watch

Lane O7 · Opus · 2026-11-08 · baseline `main` @ `29e0b2a3` (v1.4.1). The structured version of this report is `O7-motion-enchantment.json`.
I used 11 of the 12 allowed captures, on the real GPU through `shot.mjs`. All of them, plus the derived crops and sheets, are in `shots/O7-*`:
`arrival-night` (`--human`, 15 frames), `tow`, `shoals` (+ the dev depeg moment), `launch`, `watch`, `follow-postcard`,
`lampwave` (80× time-lapse), `dolphins`, `dolphins2`, `shadowpop`, `shadowpop-golden`. The log is `shots/O7-capture-log.txt`.

## 1. Verdict

The camera code is already good craft. `CameraRig` has minimum-jerk glides, log-space zoom, a sin² crane lift and a breath
offset that only affects rendering and never moves the goal (`engine/camera-rig.ts:6-44, :70`). The night arrival, once the poster is gone, is the best six seconds in the product
(`O7-arrival-night-13.png`). What fails is the seams between things: poster and world, the landing distance and the first zoom,
a staged moment and the visitor's gaze, dusk and the lamps. Most fixes are S or M with near-zero GPU cost.

## 2. What I saw

**The arrival.** In `O7-arrival-night-sheet.png`, frames 0–1 show the poster and the card. In frame 2 (`O7-arrival-night-01.png`) the poster has
shrunk to 0.893 while still mostly opaque: a **hard-edged inset rectangle** with 85/53 px margins, and the **golden-hour key art double-exposed over the
dark harbour**. It still shows the v1.2 confetti fleet (`e252a135`). In frame 3 the caption is already up while the fire kindles. Frames 4–14 are lovely:
the beam grows to its live reach and the camera settles. But every lamp is lit from the first frame, so the kindling has nothing to answer it.

**The moments.** Projected into the landing frame (heart preset, 650 m, fov 25°), Wreck Cove falls at x ≈ −300 px, off-screen, and the slipway at
x ≈ 87 px, on the edge (`O7-launch-crops.png`). The tow is beautiful at 3× zoom (`O7-tow-zoom.png`: struck canvas, rowed tug, sagging towline),
but from the seat it is a sail-less hull drifting off frame. By day the reef flare adds at most about 20 luma on a 17 px patch, no more than the surf varies
(`O7-shoals-beacon.png`). There is no on-screen notice; the Day book is the only witness.

**The watch and follow.** `O7-watch-sheet.png` shows W at today's three stops (USPD, pmUSD, USYC; `O7-watch.json`), centred at 260 m with the tag
pinned. A sailing subject lands off-centre and is then chased. The postcard (`O7-follow-04.png`) is a handsome print, but it bakes in the selection
ring and the pencilled route.

**The dusk.** The 80× time-lapse (`O7-lampwave-sheet.png`, `O7-lampwave-mole.png`) shows that the wave now exists as a front in stills.
The Pharos, the mole head and the near quays light first, and the far town lights last. But the front takes about 40 min, from 16:28 to 17:08 local on 8 November, and it is done by
sunset, in golden light. Each lamp ramps over about 3 min, so live nothing is ever seen to light.

**Temporal quality.** These captures were taken with the world held still (`?motion=reduce`):

| | Change |
|---|---|
| 641 m → 639 m | 131,763 px darken by more than 10 luma (8.2 %) |
| Back to 641 m | 131,837 px brighten again |
| Control, 641 m → 641 m | 0.7 % |

The cause is `fleet-system.ts:901`. `castShadow` is a binary switch at 640 m, 10 m inside the landing distance, so all ship shadows pop at the first
wheel notch, on every select glide, on every watch glide and on Home (`O7-shadowpop-golden-compare.png`). The rigging also crawls: with a static camera, the stays render as
broken dashes whose gaps move from frame to frame (`O7-crawl-rigging.png`). The mooring-line ribbon's comment says it is "AA'd in the fragment" (`mooring-lines.ts:28`), but its
fragment writes a flat colour (`:36`), and the composer has no MSAA (`engine.ts:88, :100`).

**Life from the seat.** Life is for the zoomed-in view. Townsfolk are 4–6 px specks (`O7-crop-day-quay.png`). I froze a dolphin pod mid-roll and it was not
legible at the mouth (`O7-dolphins2-crop.png`): at 760 m its fin and back are about 1.5 × 4.5 px.

## 3. Findings (ranked)

1. **F1 (high): the arrival crossfade shows a hard-edged picture-in-picture and a golden-over-night double exposure.** The poster scales while
   still opaque (`poster.ts:30-33`, `wake.ts:14`) and shows the pre-v1.4 fleet. On tablets and ultrawides, the cover crop and the refitted camera
   frame different scenes, so the Pharos jumps. Every visitor sees this first.
2. **F2 (high): every ship shadow switches at 640 m against a 650 m landing distance** (`fleet-system.ts:79-81, :901`; 8.2 % of the frame flips).
3. **F3 (medium): staged moments happen where the visitor is not looking.** The stage dresses only launch (bunting) and depeg (an invisible-by-day flare)
   (`moments-stage.ts:68-89`). Recovery, psi-band, dews-band and flow-hour are "staged" with no dressing but still spend the 3-minute budget (`moments.ts:23-29`).
4. **F4 (medium): the death ceremony cannot occur in production, and the bells ring a poll late.** `wrecked` comes only from the bundled `DEAD_STABLECOINS`
   (`model/build.ts:14, :74, :104`), so the tug, tow and cove bell exist only behind `?simevent=tow`. For launches, the slide and bunting start at poll 1 while the bell
   and the Day book wait for poll 2 (`audio/feed.ts:384-392`). A one-poll blip would still launch a hull.
5. **F5 (medium): the watch and follow land behind a moving ship, then lurch.** The glide's destination is frozen at its start (`camera-rig.ts:96-104`), and the springs restart at zero
   velocity (`store.ts:486, :643`). At 2.6–4.2 m/s that is 35–90 px off-target at 260 m and 43–107 px at 210 m.
6. **F6 (medium): thin lines alias into crawling dashes.** The evidence is the rigging capture, the mooring-line comment/code mismatch and SMAA-only post.
7. **F7 (medium): the watch and postcard are keyboard-only, and the watch is a 60-second loop.** Both bindings are in `App.tsx:80-82`. Touch tablets admitted by the gate cannot start either. A
   ten-minute watch shows the same three ships ten times at a fixed 260 m, and hover is suspended while it runs (`store.ts:155`).
8. **F8 (low): the lamplighting wave runs in golden light, and each lamp fades over about 3 minutes.** See `lamp-wave.ts:36-43`; REVIEW #8 is half-fixed.
9. **F9 (low): small pops and steps.** The tug appears and vanishes mid-water (`fleet-system.ts:614`); mooring lines cut hard at 650 m (`:1168`),
   so the idle breath toggles them; townsfolk blink (`folk.ts:428-470`); landmark hover jumps between buildings (`landmark-hover.ts:25-31`); the
   hover pool steps 1.5 m (`hover-lantern.ts:8, :45`). REVIEW #14 (hover fades) is otherwise fixed.
10. **F10 (low): postcards include world chrome and mix clocks.** They keep the selection ring, the route line and the panel offset, and they set the local scene hour against a UTC as-of time (`postcard.ts:25, :33`).
11. **F11 (low): the arrival sequence competes with itself.** The caption shows 1.4 s after the model is ready, during the kindle (`CornerMark.tsx:36`). An interrupt snaps the fire to full
    (`wake.ts:52`). Any keydown, Tab included, freezes the drift mid-way (`wake.ts:57-59`). Under reduced motion the golden poster cuts to night in 1 ms
    (`arrival-shell.css:90-92`).
12. **F12 (low): decorative life answers the weather without a legend line.** Dolphins appear only in DEWS CALM/WATCH with fresh data, and townsfolk, gulls and herds thin in the DEWS wind
    (`life-system.ts:207-236`). The Ledger says the townsfolk and animals carry no data (`Ledger.tsx:107`). This needs an operator decision.
13. **F13 (low): life is invisible from the landing seat.** Dolphins, folk, goats and cats are rewards for zooming in.

## 4. Ideas

**O7-I1: Seamless arrival (S, professional).** Feather the poster with a CSS mask while it scales; register it to projected hero points of the live
wake framing so the Pharos holds still on every aspect; at dusk or night, dip it toward night with a CSS filter in step with the fade; refresh the key
art from v1.4 (optionally a night variant chosen before fetch, by `cf.timezone`); under reduced motion, a 400–600 ms opacity-only fade instead of
the 1 ms cut. Cost: CSS only, for 1.1 s.

**O7-I2: The Pharos kindles, the harbour answers (S, enchanting).** The first 8 s become darkness, fire, town, settle, words.
- One uniform, `uLampArrive`, folds into `hbLampGlow`. Every lamp, window and riding light already has a Pharos-distance rank (`lamp-wave.ts:61-74`), so after the kindle
  (about 2.9 s) the town catches outward in about 3 s and ends at the clock's true state.
- By day, phase-align the sweep once so the mirror's glint passes over the viewer as the drift settles. Only the phase moves; the period, which is the PSI rhythm, does not.
- The caption appears after the settle.
- Interrupts ramp the fire up over 0.4 s, and only camera inputs cancel the drift.

Cost: about 3 ALU for about 3 s. Truth holds: the beam ends on the live PSI, and a banked PSI keeps today's edge-first order.

**O7-I3: The lamplighter's round (S, enchanting).**
- Ignite instead of fade: about 2 s with a 15 % wick overshoot, in place of `LAMP_RAMP` 0.04 (about 3 min).
- Move the window to sunset through the early blue hour: `LAMP_WAVE_START` from 0.3 to about 0.45.
- Keep the slow front. With 118 lamps and pierheads that is about one ignition every 18 s, walking out from the Pharos.
- Optional: a lamplighter figure on the existing `rankOf` hook (`lights-service.ts:24`).

**O7-I4: Moments you notice (M, informative).** For a staged moment's ≤20 s, a quiet paper slip shows the Day book's own sentence and a **Look** button (G), and an off-screen subject gets a glide on request. It is aria-live and never
moves the camera on its own. The W watch inserts the moment as its next stop. Drop the no-op kinds from the scheduler, or give them a slip.

**O7-I5: Smoke by day, fire by night (S, enchanting).** For a depeg, the reef beacon sends three dark smoke puffs by day using the existing smoke particles, on the same
timing. The night flare stays. The smoke is a vertical column, so it never reads as fog. It is data-bound to the same event, with the same Day book line.

**O7-I6: Bells on the beat (M, enchanting, DECISION-NEEDED).** Hold the launch slide until the confirming poll (the hull waits on the slip and her
tag says so), then ring the bell at the splash, with the bunting and the Day book entry. The sim emits `splash` and `beached` beats for audio. Deaths
need a live source, or stay dev-only.

**O7-I7: Glides that land on a moving ship (S, professional).** Give the glide a live goal and hand the ship's velocity to the spring at landing. `glidePose` already makes
the end velocity equal the target's. This applies to select, the watch and follow.

**O7-I8: The harbourmaster's round (M, informative).** Up to 8 data-ranked stops, each captioned in its panel's words: Pharos/PSI, the mover, the Shoals' count and the worst depeg, the storm
station if DEWS is at least WATCH, the newest coin or the next launch, the largest 30-day chain change (T6), Wreck Cove anniversaries, then home. Each stop is framed by its size, with a 2–3 % push-in over a 14–20 s
dwell. Hover stays alive and there is a touch button. It is never started by idleness (D-5).

**O7-I9: Temporal calm pass (M, prettier).** Bundles the F2/F9 fixes: a dithered fade band with hysteresis for fleet shadows (PCF turns the dither
into a real fade), ribbon coverage AA and distance fades for mooring lines, a tug that rows out, townsfolk who leave at path ends, a two-slot landmark
hover and a continuous hover pool. Cost: about 0.1–0.3 ms, only inside the shadow band.

**O7-I10: The hour told by doves (M, enchanting).** On each hour bell strike from 06 to 22, about 12 doves lift from the Tower of the Winds,
circle for about 25 s and settle (12 extra instances in the gull draw). With sound off, the picture alone keeps the time.

**O7-I11: Seasonal skies seen from the seat (M, enchanting).** At most one cue per 20 minutes, calendar-true, none under reduced motion: a crane V
in the real migration windows, a starling murmuration over the west lobe at winter dusk, and a white splash ring on the dolphins' leap.

**O7-I12: Postcards worth keeping (M, professional).** A 1.2 s "photographer's step" to a composed frame (or one of three hour views), no world
chrome in the print, one clock on the card, a touch button, and an optional 2×2-tile crisp print.

**O7-I13: An anniversary lantern at Wreck Cove (S, enchanting).** The anniversary bell is audio-only today. This gives it a picture: a votive lamp on the coin's hulk, with
"anniversary today" in its tag. It is data-bound to `deathDate` through `anniversaryToday`.

**O7-I14: The paper and the world answer each other (S, informative).** Ledger, search and Day book rows light their ship in the world (an edge
tick when she is off-screen); closing the panel unwinds the clearance offset.

## 5. Top picks (impact ÷ cost)

1. **O7-I2.** The most memorable 10 s for every dusk or night visitor, at S effort, about 0 GPU and full PSI truth.
2. **O7-I1.** Fixes the defect every visitor meets first, mostly with CSS.
3. **O7-I9.** Removes the 8.2 %-of-frame shadow pop on the first zoom, plus the line crawl.
4. **O7-I3.** Makes dusk a daily, visible ritual with a few constants.
5. **O7-I4.** The existing staging finally gets witnessed, with Day-book-identical text.

O7-I7 (S, confidence 5) is sixth; I4, I8, I12 and I14 build on it.

## 6. Decisions for the operator

- **D-4, launches only:** hold the slide until the confirming poll, so picture, bell and Day book land together?
- **Deaths** are bundled, so the tow is dev-only. Keep it, or add a live source (a new allowlisted endpoint, DECISION-NEEDED)?
- **Life and weather:** declare "life shelters in storms; dolphins only in calm" in the Weather legend, or decouple life from DEWS?
- **Poster:** refreshed golden key art plus a CSS dusk dip (S), or hour-matched posters chosen at the edge (M)?
- **Watch scope:** landmark stops and a touch button, still never started by idleness?
- **Decorative score:** cranes and a murmuration at most once per 20 minutes, plus doves on the hour?
- **Thin-line AA:** 4× MSAA on High (O2 to measure on Apple Silicon), or rigging minimum width plus ribbon AA?

## 7. Cross-lane hooks

- **O5:** shadow-fade variant, ribbon AA, tug row-out, rigging minimum width (`hull-kit.ts:85`).
- **O2:** MSAA measurement, bloom checks for the lamp overshoot and arrival catch, new poster key art.
- **O3:** dolphin splash legibility; depeg smoke must not read as fog over the surf.
- **O4:** bird flocks against the cloud banks.
- **O6:** lamplighter path, dove roost, anniversary-lantern perch, a November olive-harvest tableau.
- **Audio:** share the hour clock with the doves; key the bells to the sim beats.
- **UI/a11y:** slip aria-live, touch buttons for W and P, DOM-to-world hover without camera moves.
- **Perf:** fleet shadow cost once the gate becomes a fade band.

## 8. How to reproduce

The exact `shot.mjs` arguments for every capture are in `shots/O7-capture-log.txt` and in each `shots/O7-*.json` report.

# Ambient journey: the experience over time (`ambient-journey`)

## Verdict
At rest the world can be calm; the trouble is at the edges of time. A night visit opens on a **white page (luma 255)**, then a **stale v0.16 noon screenshot with baked-in old chrome (94)**, then cuts in 320 ms to the **night world (15.6)** (`ambient-journey/load-night.png`). The first world frame is the least finished part of the rim (giant untextured tree, purple flag), followed by an easeOutQuint lurch. A second later the caption announces a minor asset (“USP arrives at Ethereum…”). After landing, **every pointer movement jolts the harbour ~28 px, and it jolts back 2.5 s later** (`ambient-journey/breath-snap-sheet.png`): the perpetual camera breath switches off and on instantly. The leap is choreography, not assets: emerge from phase-true mist, never snap the camera, offer an explicit “Stay” watch mode. Removing jolts will relax viewers more than adding effects.

## What I looked at
- **Baseline frames:** `noon.png`, `reduced-noon.png`, `dawn.png`, `golden.png`, `blue.png`, `night.png`, `selected-ship.png`, `selected-lighthouse.png`, and `public/pharosville/stills/garden-noon.jpg`, the loading veil.
- **My captures** (5 captures; one retry failed on a screenshot timeout; all on the real GPU):
  - `outputs/opus-review/ambient-journey/arrival-noon.png`: 12 frames at 500 ms, settle 0. Tier printed `interaction` because the arrival camera moves the whole time; the tier is expected, so I did not retry.
  - `…/load-night.png` plus `load-night-frames/`: 16 frames from navigation at `#t=22`, no debug HUD, with veil state and caption logged per frame. Tier `full`. Script: `…/load-seq.mjs`.
  - `…/breath-snap-sheet.png` plus `breath-snap/`: pre, +120 ms and +3.3 s around one pointermove over empty sky, two trials. Script: `…/breath-snap.mjs`.
  - `…/noon-rest-12s-frames/00–06`: first run, tier `full`. Used for the luminance/diff analysis in `…/noon-diff-00-01.png`.
  - `…/attract-golden.png`: 9 frames at 4.5 s after 116 s idle, tier `full`.
  - `…/reduced-vs-noon-crops.png`: a crop comparison of existing baseline frames; not a capture.
- **Code read:**
  - `src/pharosville-world.tsx:1063-1111` (arrival state machine and veil), `:704-753` (attract eligibility), `:536-591` (arrival ceremony caption).
  - `src/systems/garden-arrival.ts:3-67`; `src/systems/garden-attract.ts:7-37`; `src/systems/garden-director.ts:38-81`.
  - `src/hooks/use-canvas-resize-and-camera.ts:358-387,683-757`; `src/hooks/camera-intent.ts:13-23,83-114`.
  - `src/hooks/use-world-render-loop.ts:74-76,773-784` (camera breath); `src/three/world-renderer.ts:5063-5069`.
  - `src/systems/weather.ts:66-88,125-176`; `src/renderer/render-scheduler.ts:16-28`.
  - `src/hooks/use-visit-snapshot.ts:37-144`; `src/components/since-last-visit.tsx`; `src/systems/detail-model.ts:81-112` (`nowCaption`).
  - `src/pharosville.css:128-168,742-795`; `index.html`; `src/three/garden-height-fog.ts:44-78`; `src/systems/day-cycle-beats.ts`.
  - History: the prior lane review `astra-ambient-experience.md`, the decision ledger, and reborn plan W1.3.

### Watch timeline, measured and read from source (noon, motion on, no input)
| When | What the visitor gets | Evidence |
| --- | --- | --- |
| 0–0.1 s | Blank **white** page, luma 255. `index.html` has no background. | `load-night-frames/00.png` |
| 0.1–5.4 s | Noon JPEG veil at every hour, dimmed 18→72 %, with bold sans “Charting market winds…” on the tower. v0.16 chrome (“Harbor ledger · 142 of 185 have harbor ties · 60 fps”) shows under the live caption. | `load-night-frames/01.png`; `pharosville.css:135-141` |
| 5.4 s | 320 ms opacity cut to the world at the arrival pose. At night luma falls 94 → 15.6; under reduced motion it is an instant cut (`pharosville.css:164-167`). | `load-night-frames/03.png` |
| 5.4–14 s | 9 s easeOutQuint. About 67 % of the travel happens in the first 1.8 s; the rest is sub-pixel creep. | `arrival-noon.png` frames 0–3 vs 4–11; `garden-arrival.ts:39-41,57-58` |
| ~6.4 s | Caption flips from “22:00 — a quiet night · readings current” to “USP arrives at Ethereum · supply increased in the window” and holds about 9 s. | `load-seq` log; `garden-director.ts:41,67` (`lastForegroundEnd = −∞`) |
| 14 s–2 min | Camera breath: yaw ±2° over 118 s, pitch ±1° over 97 s, dolly ±1.5 % over 131 s. Any input, hover or selection zeroes it in one frame. | `use-world-render-loop.ts:773-784` |
| 2 min | Attract is requested and the chrome hides (`data-attract-holding`). In my capture the camera **held still for 36 s**, because the director gate refused the attract beat. | `attract-golden.png`; `use-canvas-resize-and-camera.ts:707-713` |
| 3 min | The render duty cycle halves to about 30 fps, including any later postcard pans. | `render-scheduler.ts:16,28` |
| 3–30 min | One environment cue every 6–10 min, which gives about 3–4 postcard relocations. Foreground arrivals are separated by 6–12 min silences. The gust front comes every 600 s. Light holds the 07:15–16:15 daylight plateau (`day-cycle-beats.ts:29-30`), so a noon watch sees no light change. | `garden-director.ts:45,75-78`; `weather.ts:70-72` |
| Return visit | A top-right toast reads “Since last visit: PSI STEADY -> WATCH; new notable movers: …”, with an ASCII arrow, no time-away and no in-world echo. | `use-visit-snapshot.ts:129-144`; `since-last-visit.tsx` |

### Relaxation physiology (measured where possible)
- **Shared breath:** 9 s, which is 0.11 Hz and inside the target band (`weather.ts:67`).
- **Global luminance at rest:** frame means at noon drift 137.5 → 138.3 over about 20 s (0.6 %). At golden hour the sky region varies ±1 % while the beam sweeps. **No flicker.**
- **The noise band is the water.** Mean |Δ| between frames 1.5 s apart is 12.4–13.3 grey levels in the water patches, against 0.8 in the sky. The dominant ripple wavelength is about 80 px vertically at 1600×1000. This is the highest-energy salient motion field in the frame, a high-frequency, high-contrast shimmer. Handed to LaneWater.
- **Moving salient objects** could not be counted per frame, because the camera breath moves every edge in the frame (`noon-diff-00-01.png`: the tower silhouette lights up). 19 % of pixels have σ > 15 over 9 s. The one hard fact: while the camera breathes, **nothing in the frame is still**.
- **Abrupt transitions per touch: two.** Breath off takes one frame; breath back on takes one frame, 2.5 s later. Every caption change is also a hard text swap.

## Spell-breakers (defects)
1. **The camera breath snaps on every touch.**
   - *What:* in `breath-snap-sheet.png` (trial 1), one pointermove over empty sky moves the Ethereum tower and headland **28–29 px left and 6–7 px up in under 120 ms**. They move 24 px back when breath resumes. In trial 0, the far fleet moved 84 px between the pre frame and the resume frame.
   - *Where:* `use-world-render-loop.ts:773-784` replaces breath with `STILL_CAMERA_BREATH` whenever there is hover, selection, camera intent, or input in the last 2.5 s. `world-renderer.ts:5065-5068` applies it with no blend.
   - *Why it breaks the calm:* the harbour jolts twice each time a hand moves. It also jolts during hover, which is exactly when the visitor is reading a ship. The reborn plan specified “freezes on input” (W1.3); the implementation *resets* to zero instead of freezing.
   - *Fix:* see idea 2. **Cost S.**
2. **The cold load is a luminance slam at the wrong hour, over a stale screenshot.**
   - *What:* the page goes white (255) → noon veil (94) → night (15.6) in `load-night-frames/00–03`. The veil JPEG is a v0.16 frame with its old bottom bar and control glyphs baked in, and they ghost under the live caption (`01.png`, bottom). “Charting market winds…” is set in bold UI sans on the tower. The veil's framing does not match the arrival pose, so the crossfade is a cut between two compositions.
   - *Where:* `index.html` (no background), `pharosville.css:135-141,148-167`, `pharosville-world.tsx:1148-1159`.
   - *Why:* it breaks the wall-clock premise (“no flattering default hour”) on the first screen. At night it is a flashbang for someone who opened the harbour to wind down.
   - *Fix:* idea 1. **Cost S** for the background and veil colour, **M** for the full mist arrival.
3. **The arrival starts on the least finished frame and lurches.**
   - *What:* `arrival-noon-frames/00.png` shows an untextured low-poly tree blob, a yellow cylinder and an orange roof in the near corners, and a Polygon flag filling a sixth of the frame. The HUD in my capture shows **583k tris on that pose**, above the 500k preview ceiling. easeOutQuint starts at 5× mean velocity just as the veil clears.
   - *Where:* `garden-arrival.ts:44-50` (−72 px / +48 px, zoom×0.82) and `:39-41,58`.
   - *Why:* the first composed image is the worst one of the session, and the fastest motion comes before the eye has found the tower.
   - *Fix:* idea 1. **Cost S.**
4. **The first sentence is a minor asset, not the market.**
   - *What:* the arrival ceremony is admitted about 1 s after landing, because the director starts with `lastForegroundEndSeconds = −∞` (`garden-director.ts:41,67`). “USP arrives at Ethereum · supply increased in the window” replaces the phase line while the veil is still lifting (load log at 6.4 s). It is still the caption in `selected-lighthouse.png` while the Pharos card is open.
   - *Why:* PRODUCT's first reading is the market's broad condition. A random small-supply arrival takes the only caption slot at the most attentive moment.
   - *Fix:* initialise `lastForegroundEndSeconds` to the director's creation time, so the first 360–720 s silence starts at arrival. Alternatively, register the page arrival itself as a 90 s foreground beat. **Cost S.**
5. **Caption changes are hard text swaps.**
   - *Where:* `.pharosville-now-caption` (`pharosville.css:742-758`) has no transition, and `NowCaption` replaces its text in place.
   - *Why:* the only line of prose in the product changes mid-glance. It is the one abrupt visual event left at rest.
   - *Fix:* two stacked spans; the old one fades out over 400 ms, then the new one fades in over 600 ms using `--pv-motion-curve-breathe`. `aria-live` still announces once. Under reduced motion, swap instantly. **Cost S.**
6. **The reduced-motion tableau freezes motion blur.**
   - *What:* in `reduced-noon.png` (crown, about 820–870 × 70–120) and `reduced-vs-noon-crops.png` (top left), the gull flock is frozen as dark brush-stroke smears next to the statue; a still bird should never look motion-blurred. Bottom right, three cut-off hulls and their sails pile under the Explore chip.
   - *Why:* the still reads as a paused video frame, not an authored scene.
   - *Fix:* idea 7. **Cost S–M.**
7. **Selection lands on a frame where the subject is hidden.**
   - *What:* in `selected-ship.png`, the dolly to zoom 1.2 (`camera-intent.ts:18,121-133`) leaves USD Coin behind a blurred near-rim tree and a yellow cylinder, with depth-of-field smear over the lower third. The glide is exponential damping with rate 5 (`camera-intent.ts:15,90`), so its peak velocity is at t = 0.
   - *Why:* the calmest thing a camera can do after a click is arrive gently and show the subject.
   - *Fix:* idea 4. **Cost S–M.** Needs LaneHarbour/LaneGardenMaster for the occluders.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### ambient-journey-1 ★ Mist lifting: an arrival in the true hour
- **Picture:**
  - The page opens on the current hour's own sky-to-sea gradient: deep indigo at 22:00, pearl at 06:00. There is no picture and no white flash.
  - A soft sea-mist fills the harbour, and the world fades in *inside* it.
  - Over about 6 s the mist thins from the top down. The tower crown emerges first, then the gallery and the lit windows, then the inlet and its reflection, and last the receding fleet, while the camera settles a few degrees downward into rest.
  - At night the beacon kindles about 2 s in, before the fleet appears. The visitor feels the harbour becoming readable, not loading.
- **Why:**
  - Spell-breakers 2 and 3. Mean luma goes 255 → 94 → 15.6 on a night load (`load-night-frames`).
  - `gardenArrivalCamera` reveals the least finished corner of the rim (`arrival-noon-frames/00.png`), and easeOutQuint puts 67 % of the motion into the first 1.8 s.
  - The height fog already *is* a vertical reveal: it is densest at the water, so raising density and falloff makes high objects emerge first without any new geometry (`garden-height-fog.ts:59-72`).
  - This matches the bible's instruction that an arrival should be an event (“Let an arrival… become an event, then leave the garden quiet”).
- **Impact:** poetic 5, relaxing 5, stunning 4. **Confidence:** H for the veil and colour; M for the mist tuning.
- **Cost:** M. **Perf:** 0 draws, 0 tris, 0 textures. One extra scalar multiply in the fog uniform write. GPU ≈ 0 ms [INFERENCE]. The first-frame shader-compile hitch is hidden under mist.
- **How:**
  1. **Inline pre-paint:**
     - Add a `<style>` in `index.html` with `html,body{background:#12313d}`, matching the existing `theme-color`.
     - Add a ≤40-line inline `<script>` that reads local hour and minute, evaluates `dayCycleBeats` (copied as a pure 25-line function), and sets `--pv-veil-top/--pv-veil-bottom` on `<html>` from `DAY_CYCLE_SKY_PRESETS` zenith and horizon.
     - The white frame disappears, and the first paint is already the true hour.
  2. **Veil:**
     - `.pharosville-loading` (`pharosville.css:135-141`) becomes `linear-gradient(var(--pv-veil-top), var(--pv-veil-bottom))`, with a second radial gradient of mist colour at 30 % across the horizon band.
     - Drop `garden-noon.jpg` from the in-app veil. Keep the file only for the narrow-viewport fallback (`client.tsx:10`), and recapture it without chrome.
     - Move “Charting market winds…” into the caption slot (bottom-left, Garamond, `--mist`), so the loading line and the first caption occupy the same place and change in place.
  3. **Mist uniform:**
     - Add `arrivalMist: number` (0..1) to `GardenHeightFogFrame` (`garden-height-fog.ts:44-49`).
     - Multiply density by `1 + 3·m` and falloff by `1 + 1.5·m` next to the existing storm term at `:59-65`.
     - Drive `m` from the arrival clock in `use-canvas-resize-and-camera.ts:683-697`: m = 1 − smootherstep(0.6 s, 6.6 s, t).
     - Veil opacity crosses to 0 over 900 ms at t ∈ [0, 0.9 s], while m ≈ 1, so the handoff is mist to mist. This replaces the 320 ms cut at `pharosville.css:155`.
  4. **Camera:**
     - Replace `gardenArrivalCamera` (`garden-arrival.ts:44-50`) with a same-bearing approach: offsetX unchanged, offsetY −28 px (a slightly higher look that settles down), zoom × 0.95.
     - Change the curve to quintic smootherstep over 7 s (`GARDEN_ARRIVAL_DURATION_MS` 9000 → 7000). Peak velocity then comes mid-reveal, not at t = 0, and the start pose stays inside the authored rest composition, so no unfinished rim is shown.
  5. **Caption:** give the director a 90 s initial silence (spell-breaker 4) so the phase sentence (“22:00 — a quiet night · readings current”) is the first thing read.
- **Displaces:**
  - The noon JPEG veil, the 320 ms cut, the −72/+48/0.82 opening pose, easeOutQuint, and the centred bold loading label.
  - The first-minute arrival ceremony moves to the first ordinary director slot.
- **Truth & a11y:**
  - No data encoding. The veil keeps `role=status` and `aria-busy`, and the loading text stays in DOM.
  - **Reduced motion:** no mist animation and no camera move. The inline gradient paints, the veil swaps to the settled rest frame with a single 200 ms opacity crossfade (a non-spatial fade is acceptable under the reduced-motion convention), and m = 0 from the first frame.
- **Risks:**
  - Arrival tests pin `GARDEN_ARRIVAL_DURATION_MS` and the `crossfade` stage (`pharosville-world.test.tsx:280-294`); they need re-pinning.
  - Mist that is too dense at day reads as smog. Tune per phase: day at ×2.5, night at ×3.5, where mist over dark water reads as moonlit haze.
  - The inline script must stay tiny and pure.
- **Acceptance:**
  - `load-seq.mjs` at `#t=22` and `#t=12.25`: no frame with mean luma above 1.3× the settled world's mean; no white frame; no bitmap under the veil.
  - A 12 × 500 ms `motion-sheet` at settle 0 shows the crown before the fleet.
  - The first frame's triangle count is ≤ 500k.
  - The caption reads the phase sentence for the first 90 s.

### ambient-journey-2 ★ A still camera that breathes only in solitude, and never snaps
- **Picture:**
  - While you look, point or read, the harbour does not move under you: the camera is a tripod.
  - Leave it alone for a while and, over a slow twelve seconds, the view starts drifting a hand's breadth, as if the visitor had settled deeper into the engawa.
  - Touch it again and the drift glides to a stop over a second and a half, like a held breath, never a jump.
- **Why:**
  - Spell-breaker 1, measured at 28–29 px per touch and 84 px of far-fleet travel between pre and resume frames (`breath-snap/`).
  - The yaw amplitude of ±2° parallaxes the horizon by up to about 3.5 % of scene depth (`use-world-render-loop.ts:783`).
  - Reborn W1.3 already recorded its own exit condition: *“if the 30-minute watch reads as drift, it becomes idle-only.”* A diagram-like stillness at rest was the fear; the water, the 9 s breath and the fleet already supply life (19 % of pixels change at rest without it).
- **Impact:** relaxing 5, stunning 2. **Confidence:** H.
- **Cost:** S. **Perf:** 0/0/0; one scalar per frame.
- **How:**
  1. In `use-world-render-loop.ts:773-784`, replace the boolean with a weight `w` held in a ref.
  2. Targets: `targetW = idle ≥ 45 s && no hover/selection/intent ? 1 : 0`.
  3. Advance `w` as a critically damped approach: τ = 0.5 s going to 0, which settles in about 1.5 s; going to 1, a smootherstep ramp over 12 s.
  4. Breath becomes `{dolly: 1 + w·0.012·sin…, pitch: w·0.6°·sin…, yaw: w·0.8°·sin…}`. Amplitudes drop from ±2° to ±0.8° yaw, ±1° to ±0.6° pitch, and ±1.5 % to ±1.2 % dolly.
  5. The phase keeps running, so resuming never jumps: the amplitude grows from zero.
  6. Change `CAMERA_BREATH_INPUT_FREEZE_MS` 2500 into the 45 s idle threshold.
- **Displaces:** perpetual camera drift during attentive use, and two whole-frame jolts per touch.
- **Truth & a11y:** hit targets and DOM anchors hold during interaction, since `w = 0` while you point. Reduced motion keeps `w = 0`, as today.
- **Risks:**
  - Tests asserting breath on and off by boolean (`world-renderer.test.ts:924-983` covers only the renderer side; the loop test would need re-pinning).
  - Attract and breath must not stack: keep `w = 0` while a tour holds the camera, as it effectively does today via `cameraIntentActive`.
- **Acceptance:** rerun `breath-snap.mjs`. Region shift pre→post and post→resume must be ≤ 1 px on the headland and left-tower boxes, and a 60 s idle sheet shows drift starting smoothly only after 45 s.

### ambient-journey-3 ★ “Stay”: the harbour as a window you leave open
- **Picture:**
  - Press **S** or choose *Stay* in Explore. The page goes full-screen, the cursor dissolves after 4 s, and every piece of chrome fades to nothing over 2 s.
  - Only the world and the time of day remain. The screen does not sleep.
  - When something true happens (a band change, a stale feed, an evening kindling), the caption rises in the corner for the beat's duration, then sinks back.
  - It becomes a harbour on a second monitor or a living-room TV, which is what PRODUCT describes (“leave the world running as a calm ambient view”).
- **Why:**
  - The attract path already hides controls when holding (`pharosville.css:791-795`, `data-attract-holding`), and in `attract-golden.png` the camera sat still with the chrome gone. That is an accidental Stay mode, but it only arrives after 120 s, keeps the caption and debug chrome logic, and is broken by any mouse twitch.
  - The 30 fps idle duty after 3 min (`render-scheduler.ts:16,28`) makes the rare postcard pans the most judder-prone motion in the product.
- **Impact:** relaxing 5, poetic 4. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws. Postcard travel legs render at full rate, which costs the 30 fps saving only during 20–35 s pans, 3–4 times per 30 min.
- **How:**
  1. A `stay` state in `pharosville-world.tsx` next to `still`, with a URL flag `stay=1` for kiosk links.
  2. On entry:
     - `document.documentElement.requestFullscreen()`, feature-gated.
     - `navigator.wakeLock.request("screen")`, released on exit and on `visibilitychange`.
     - `data-stay="true"` on the chrome root.
     - `cursor: none` after 4 s without pointer movement.
     - Attract idle drops to 45 s (`GARDEN_ATTRACT_IDLE_MS` becomes a function of the mode).
  3. CSS: `[data-stay] .pharosville-world-controls, .pharosville-now-caption { opacity: 0; transition: opacity 2s var(--pv-motion-curve-breathe) }`. The caption returns to `opacity: .92` only while `arrivalAnnotationLive`, while a transition or stale caption is active, or for 20 s after each local :00 minute, which gives a quiet hourly “17:00 — the golden hour · readings current”.
  4. Only `Esc` or a click exits. Pointer movement alone does not, so the breath weight and the chrome stay down.
  5. Keep the idle 30 fps duty during holds. Lift it to full rate only while a postcard `travel` leg is active (`attractState.holding === false`).
- **Displaces:** the implicit chrome-hiding-by-attract behaviour (fold it into Stay), and the always-visible caption during long watches.
- **Truth & a11y:**
  - Market events still surface in text, and the ledger is one `Esc` away.
  - Entering Stay announces “Stay mode — press Escape to return” via the existing live region.
  - **Reduced motion:** Stay shows the authored tableau (idea 7) with no attract. The tableau repaints once per wall-clock minute so the light still follows the hour [INFERENCE: confirm reduced-motion repaint on hour change].
- **Risks:**
  - The Fullscreen and Wake Lock APIs need user activation; fail silently to windowed.
  - Hidden cursor versus hover picking: disable hover picking in Stay.
  - Must not break the desktop gate.
- **Acceptance:**
  - `?stay=1#t=21` at 1600×1000: after 5 s, a frame with zero DOM chrome pixels.
  - A 10-minute log shows the caption surfacing only on director and market beats and on the hour.
  - Reduced-motion `?stay=1` produces a single composed still.

### ambient-journey-4 Min-jerk glides, and a selection that lands on its subject
- **Picture:**
  - Click a ship and the view eases *into* motion and eases out on a frame where the ship sits clear in open water, on a lower third, with its reflection.
  - Close the card and the view drifts home the same way.
  - Every camera move in the product shares one unhurried, symmetrical rhythm.
- **Why:**
  - The exponential damping (`camera-intent.ts:15-17,90`, rates 5 and 4) has peak velocity at t = 0: the first 60 Hz frame covers 8 % of the whole move. That start is the lurch.
  - `selected-ship.png` lands with USD Coin occluded by a blurred rim tree and cylinder.
  - The reset command uses damping 12 (`:23`), which snaps.
- **Impact:** relaxing 4, stunning 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0/0/0; CPU per-frame math only.
- **How:**
  - For modes `selection`, `selection-return`, `reset` and `toolbar`, sample a quintic smootherstep over `T = clamp(1.1 + 0.4·log2(1 + d/240 px), 1.3, 2.6)` s, where d is the screen-space distance plus zoom delta in px equivalents.
  - When a new target arrives mid-glide, start the new curve from the current pose and velocity (a cubic Hermite blend over the first 0.3 s).
  - Keep exponential damping for drag, wheel and follow, where direct manipulation needs it.
  - `selectionCameraTarget` (`camera-intent.ts:121-133`) should frame the hull at (0.42 W, 0.58 H) rather than dead centre, and reject candidate framings whose projected hull box intersects the near-rim occluder mask. The mask is owned by LaneGardenMaster and LaneHarbour; fall back to zoom 1.05.
- **Displaces:** the damped lurch and centre framing.
- **Truth & a11y:** no semantic change. Reduced motion applies the target immediately, as today (`use-canvas-resize-and-camera.ts:350`).
- **Risks:**
  - Duration-based motion must stay interruptible.
  - Tests at `use-canvas-resize-and-camera.test.ts:192-196` (monotone zoom under damping) need a rewrite.
- **Acceptance:** at `#t=14&sel=ship.usdc-circle`, the hull and its mon are unoccluded and outside any DOF blur. A 12 × 150 ms motion sheet of a click shows displacement per frame rising and falling symmetrically, with no frame-1 jump above 3 % of the travel.

### ambient-journey-5 The evening kindling: one rite a day, at the real dusk
- **Picture:**
  - At the true blue-hour onset (18:15 local by the current beats), the harbour pauses.
  - The beacon catches in three breaths: a spark in the lantern room, a steady flame, and then the beam begins its first slow sweep.
  - Over the next 20 s the mole lanterns kindle one by one, walking *outward* from the tower's foot, each only an ember.
  - At dawn the rite reverses: lamps go out walking inward, and the beacon last.
  - A visitor who sees it once comes back at dusk for it.
- **Why:**
  - A 30-minute noon watch has no light event: the daylight plateau runs 07:15–16:15 (`day-cycle-beats.ts:29-30`).
  - The bible names “kindling lamps” as the model event.
  - The prior review's idea 3 proposed a walking keeper at cost L. This is the same rite without a figure: cheaper, and it avoids fantasy-village lore.
  - Lantern emissives already exist and ride the breath (`world-renderer.ts:4258-4260`); only per-lamp onset timing is new.
- **Impact:** poetic 5, relaxing 3, stunning 4. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws. One per-instance float (onset delay), baked into an existing instanced attribute or derived from the instance index in shader. **Check the 16-attribute cap** on the fleet program if any ship lamps are included; mole lamps only is safer. GPU ≈ 0.
- **How:**
  1. A director `kind: "keeper"` foreground beat, which already exists in the `GardenBeatKind` union (`garden-director.ts:1`), requested when the blue beat's weight crosses 0.05 and at dawn when the night weight falls below 0.95. Priority 50, 60 s duration.
  2. Beacon lamp mix is gated by `smoothstep(0, 4 s)`, then `smoothstep(4, 9 s)`. Beam opacity starts from 0 at 9 s.
  3. Mole lamps each get `onset = 9 s + 0.8 s × rankByDistanceFromTower`, with emissive `smoothstep(onset, onset + 1.6 s)`.
  4. Caption: “18:15 — the lamps are lit · readings current”.
  5. When the tab loads mid-rite or later, show the settled state; never replay, which matches the director's no-replay rule (`garden-director.ts:83`).
- **Displaces:** the almanac lantern-round spheres (seven tiny points, `garden-almanac-dressing.ts:149-184`) and the instant phase-driven lamp-on.
- **Truth & a11y:**
  - Clock-only. It must never co-occur with a market beat; market beats pre-empt it (`garden-director.ts:64`).
  - The ledger's almanac entries list “Evening kindling 18:15”.
  - **Reduced motion:** lamps are simply on or off per hour.
- **Risks:** lamp staggering could read as a light show if too bright. Keep every lamp within the bible's ember rule; the beacon stays the only dominant light.
- **Acceptance:** `motion-sheet --hash "#t=18.24" --settle 30000 --frames 12 --interval 2500`: the beacon is lit before any mole lamp, lamps light in outward order, and nothing exceeds beacon luminance.

### ambient-journey-6 The harbour remembers: a return visit told in place
- **Picture:**
  - You come back after three days. The mist-lift arrival (idea 1) begins framed on what changed:
    - the tower, if stability moved band;
    - the berth of the first notable mover, if not.
  - The caption, in the same Garamond line as always, reads: *“Since you were here on Tuesday — the tower's clarity eased from Steady to Watch; USDC and DAI changed water.”*
  - After four seconds the view drifts to rest and the sentence becomes the ordinary phase line. The harbour noticed you were gone.
- **Why:**
  - Today the return is a toast: top-right `pv-notice`, an ASCII “->”, upper-case band codes, no time-away, no in-world anchor (`use-visit-snapshot.ts:129-144`, `since-last-visit.tsx:19-37`).
  - PRODUCT principle 3 says camera framing should teach.
  - The snapshot already stores `generatedAt`, band and movers (`:10-17`), so no new data is needed.
- **Impact:** poetic 4, relaxing 3. **Confidence:** M.
- **Cost:** M. **Perf:** 0/0/0.
- **How:**
  - `visitSnapshotDeltaSummary` produces prose: a weekday or “n days ago” from `previousGeneratedAt`, band names in title case via the existing band labels, a “→” glyph, and at most two symbols plus “and n more”.
  - The sentence routes into `nowCaption` as a new top-precedence input for the first 20 s (`detail-model.ts:97-112`). The `SinceLastVisitBanner` goes away, but a “Since your last visit” section stays in the harbour ledger for persistence and dismissal parity.
  - The arrival `to` pose is unchanged. The `from` pose becomes `followTile(subject)` at zoom 1.05, held 4 s under mist, then a 7 s smootherstep to rest.
  - An explicit `cam=` or `sel=` URL still wins (`pharosville-world.tsx:1082`).
- **Displaces:** the since-last-visit toast and its dismiss button, and the generic arrival pose on return visits.
- **Truth & a11y:**
  - Pure restatement of stored deltas; no new claims.
  - `aria-live` announces the same sentence once, and the ledger section carries it permanently.
  - **Reduced motion:** no framing glide; the sentence is identical.
- **Risks:** tests on the banner (`pharosville-since-last-visit` test id) and on summary wording need re-pinning. Framing must not reveal unfinished rim (reuse idea 4's occluder check).
- **Acceptance:** seed `localStorage["pharosville.snapshot.v1"]` with an older band and one mover, load, and capture a `motion-sheet` at settle 0. The first frames frame the tower or the mover, and the caption shows the prose sentence for about 20 s, then the phase line.

### ambient-journey-7 The still garden: an authored reduced-motion tableau
- **Picture:**
  - Under reduced motion the harbour is a finished woodblock rather than a paused film.
  - Gulls stand on the gallery cornice instead of smearing past the crown.
  - The fleet rests at its authored anchorages with the inlet open, the corners breathe, and the water holds one calm specular pattern.
  - It changes once a minute with the real light, like a scroll someone rehangs.
- **Why:**
  - `reduced-noon.png` freezes the gull motion blur as brush strokes (`reduced-vs-noon-crops.png`) and crowds three cut-off hulls under the Explore chip.
  - The rest of the reduced frame is actually *better composed* than `noon.png`: the inlet is emptier and the reflection clearer. It is worth finishing.
- **Impact:** relaxing 4, stunning 3. **Confidence:** M.
- **Cost:** S–M. **Perf:** fewer draws than today's motion frame (181 vs 283 in the baseline `.txt`); +0 textures.
- **How:**
  - Under `frame.reducedMotion`, the gull flock uses the existing quay-perch pose (`garden-harbor-life.ts:492-493`, `air = 0`) and skips its motion-trail/blur material. If no perch pose exists for the island flock, hide it.
  - Apply a corner-keepout to the reduced-motion ship pose: no hull centroid inside the 180 × 120 px bottom-right chrome box at the rest camera. Pick the next free anchor slot, leaving the data (ship present, anchorage band) unchanged.
  - Water uses the t = 0 normals (already the case) with glitter clamped by 20 %, so frozen specular doesn't read as noise.
- **Displaces:** frozen motion blur and the corner pile.
- **Truth & a11y:** ships stay in their risk-band water; only the slot within the anchorage changes, which needs sign-off from the fleet lane.
- **Risks:** anchorage slot tests; perch geometry may not exist for the island flock.
- **Acceptance:** `npm run preview -- --reduced --hash "#t=12.25"`: no bird smear, and no hull or sail within the bottom-right chrome box.

### ambient-journey-8 Deepening calm: the world slows with the watcher
- **Picture:** in the first minutes after you stop touching the harbour, it slows the way a pulse slows. The breath lengthens to a resonant ten seconds, flags ripple a little more lazily, and the high-frequency sparkle softens. None of it can be pointed at, but twenty minutes in, the room feels quieter.
- **Why:**
  - 0.1 Hz (10 s per cycle, about 4 s in and 6 s out) is the resonance-breathing frequency used in HRV biofeedback. The current 9 s cycle with a 0.4 rise share (`weather.ts:67-68`) sits just above it.
  - Water inter-frame change (12–13 grey levels per 1.5 s) is the dominant visual noise at rest.
- **Impact:** relaxing 4. **Confidence:** M (the physiology is well established; the perceptual effect of these small changes is not measured).
- **Cost:** S. **Perf:** 0/0/0.
- **How:**
  - `GARDEN_BREATH_SECONDS` 9 → 10 (the breath token in `motion-tokens.ts:19` becomes 10 s, and the CSS `--pv-motion-duration-breathe` follows).
  - Add an `idleDepth` scalar (0 → 1 by smootherstep over 5 min of no input, back to 0 over 1.5 s on input), exposed on the frame beside `weather`.
  - Multiply chain-flag flutter frequency by `1 − 0.2·idleDepth`, the water normal-scroll speed and glitter gain by `1 − 0.25·idleDepth` (LaneWater owns the numbers), and wake hairline alpha by `1 − 0.4·idleDepth`.
  - Never touch fleet route speed (route clock) or any data cue.
- **Displaces:** a constant-energy scene that never rewards staying.
- **Truth & a11y:** decorative channels only. Stale fog, PSI sky and band water are untouched. Reduced motion is unaffected, since it is static.
- **Risks:** the rate scale must integrate phase (`phase += rate·dt`) rather than scale time, or flags jump. That needs a per-system phase accumulator where one does not exist yet.
- **Acceptance:** a 9 × 1.5 s noon sheet at 6 min idle, compared with 30 s idle, shows water mean |Δ| down at least 20 % at equal mean luminance, and no visible jump when a pointer moves.

## Subtractions
- **The in-app `garden-noon.jpg` veil** (`pharosville.css:141`). It is the wrong hour, shows v0.16 chrome, and does not match the arrival composition. Recapture a chrome-free still for the narrow-viewport fallback only.
- **The bold centred “Charting market winds…”** (`pharosville-world.tsx:1158`, `pharosville.css:143-146`). Move it into the caption slot in Garamond.
- **The first-minute arrival ceremony caption** (spell-breaker 4).
- **The since-last-visit toast** (`since-last-visit.tsx`), replaced by idea 6.
- **Camera-breath amplitude:** yaw ±2° → ±0.8°, and no breath at all during attentive use (idea 2).
- **Stacked announcements:** show at most one arrival nameplate chip, the admitted ceremony's subject. `GARDEN_ARRIVAL_BEAT_CAP_FULL` currently lets several route-boundary ships wear plates at once (`garden-arrival-beats.ts:165-184`). The “OpenDollar USDO Calm” chip hangs over the fleet in `dawn.png`, `golden.png`, `blue.png` and `night.png` (around 430,575) while the caption talks about something else.

## Reversals
- **Reborn W1.3 “perpetual camera breathing”** (`agents/pharosville-reborn/01-implementation-plan.md:129`; reviewed in `reviews/camera-composition.md:30`).
  - *Evidence:* `breath-snap-sheet.png`, 28–29 px whole-frame jumps on a single pointermove and 24–28 px on resume. At rest it also prevents a still reference frame, because every edge moves (`noon-diff-00-01.png`).
  - *Argument:* the plan's own acceptance clause (“if the 30-minute watch reads as drift, it becomes idle-only”) has been met, and more. A Japanese garden asks the visitor to sit still while the garden moves. The ledger's July rejection of idle drift and the 2026-08-13 rejection of handheld noise both point the same way.
  - *Risk:* rest stills feel more diagrammatic. Mitigated because water, breath and fleet already move 19 % of pixels, and idea 2 keeps a smaller breath after 45 s of solitude.
- **Arrival as a camera fly-in** (`garden-arrival.ts:44-67`, W4-era).
  - *Evidence:* `arrival-noon-frames/00.png` (unfinished rim, 583k tris) and front-loaded easeOutQuint.
  - *Argument:* in a garden the arrival is a reveal, not a travel shot (idea 1).
  - *Risk:* test re-pins only.

## Cross-lane dependencies
- **LaneLight:** per-phase mist density and colour for idea 1 (the `garden-height-fog.ts` presets) and the inline veil gradient colours, which must match `DAY_CYCLE_SKY_PRESETS`. Beacon kindling curves for idea 5 must stay under the ember rule.
- **LanePharos:** the beam's first-sweep onset (idea 5). At golden hour the daylight beam reads as a pale searchlight blade every ~30 s (`attract-golden.png` frames 0–2, 7–8), which is the most salient periodic event at dusk. Please keep its daylight visibility near zero until blue hour.
- **LaneWater:** owns the glitter/normal-scroll numbers behind idea 8. Water shimmer (12–13 grey levels per 1.5 s, ~80 px wavelength) is the dominant noise at rest.
- **LaneChrome:** Stay mode UI (idea 3), the caption crossfade (spell-breaker 5), the toast removal (idea 6), and the loading line moving to the caption slot.
- **LaneGardenMaster / LaneHarbour:** the near-rim occluder mask for selection and return framing (idea 4). The unfinished near-rim props seen by the old arrival pose should also be finished or culled.
- **LaneFleetMotion:** the reduced-motion corner keepout and anchor-slot reassignment (idea 7). Confirm that no route or speed channel is touched by idea 8.
- **LaneLife:** the perched gull pose under reduced motion (idea 7), and any perched heron at dusk sharing the kindling beat.
- **LaneDataPoetry:** the return-visit sentence and the band prose (idea 6); the first-90 s phase sentence as the market's opening statement.
- **Headroom:** every idea here is 0 draws and 0 textures. Idea 5 needs a per-instance onset value; use the instance index or an existing attribute, not a new one (the fleet program is at the 16-attribute cap).

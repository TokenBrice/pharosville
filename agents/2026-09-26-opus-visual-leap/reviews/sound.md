# Generative soundscape & music — sound

## Verdict
The harbour is silent, and the frames show the cost. Half of `noon.png` is moving water and `dawn.png`'s lavender haze is pure air: both carry better as sound than as pixels. My sheet (`sound/gust-front.png`) shows the world's one wind front can't be seen at rest; you could hear it cross the harbour. The leap is not W4.20's "three seamless loops". It is a procedural voice tied to clocks that already exist: the 9 s breath, the 600 s gust, the five-beat hour, the director's silences, the sea state. Sound and picture then play as one instrument. The bed needs zero asset bytes, a lazy chunk of about 10 KB gzip, and 0 GPU. The music is breath-paced pentatonic with no semitones; its only data gesture is dropping the major third when the caption reads "watchful". Sound died twice for lack of tuning evidence, so build the tuning harness first.

## What I looked at
- **Frames:** `outputs/opus-review/noon.png` (water fills the lower 45%, stones at bottom right, reeds at left of centre), `night.png` (beam at upper left of the lantern, broken ember reflection), `golden.png`, `dawn.png` (haze band behind the fleet), `wholemap-noon.png` (the caption reads "Frax USD arrives at Ethereum · supply increased in the window", so arrivals are captioned in the DOM).
- **Captured:** `outputs/opus-review/sound/gust-front.png`: 9 frames, 2.5 s apart, `#t=11`, clip `0,280,1600,560`, taken 2.5–22.5 s after load, which is inside the gust attack/release (`weather.ts:69-74`, `179-192`). The first attempt ran at tier `constrained` and timed out. The retry ran at tier `interaction`, so I used it only to judge motion, not look. Across the frames the flags and sails show no front you can read.
- **Code:**
  - `src/systems/weather.ts:66-88,125-231` (breath, gust, named phase offsets, gust delay).
  - `src/systems/sea-state.ts:57-64,81-116,152-179`.
  - `src/systems/day-cycle-beats.ts:18-44`.
  - `src/systems/garden-director.ts:45,64-94`.
  - `src/hooks/use-garden-director.ts:6-11`.
  - `src/hooks/use-world-render-loop.ts:284-289,555-606,773-784,1062-1068`.
  - `src/three/world-renderer.ts:4414-4442` (sweep 0.2–0.42 rad/s).
  - `shared/lib/psi-colors.ts:56-63`.
  - `src/systems/detail-model.ts:81-112` (now-caption grammar).
  - `src/systems/garden-arrival-beats.ts:9-14,78-96`.
  - `src/systems/garden-almanac.ts:35-56`.
  - `src/three/garden-almanac-dressing.ts:123-127`.
  - `src/systems/season.ts:7-15`.
  - `src/components/world-controls.tsx:88-126`.
  - `src/pharosville-world.tsx:95,1234-1247`.
  - `src/hooks/use-legend-dialog.ts:6-20`.
  - `src/components/accessibility-ledger.tsx:226-227`.
  - `src/systems/visual-cue-registry.ts:10-12,167-168,206-212`.
  - `scripts/bundle-budgets.mjs`, `vite.config.ts:146`, `src/hooks/use-api-query.ts:108-122`.
- **History:**
  - Decision ledger row 12 (`agents/pharosville-reborn/reviews/decision-ledger.md:12`).
  - Plan D11, W4.7, W4.20 (`agents/pharosville-reborn/01-implementation-plan.md:65,189,202`).
  - The 2026-08-13 W8.1 brief and the handoff that explains why its prototype was cut (`agents/2026-08-13-ultimate-garden-design-plan.md:166,186-189`).
- **Confirmed:** there is no `AudioContext`, audio element or audio asset anywhere in `src/`.

## Spell-breakers (defects)
There is no audio at runtime, so nothing at runtime can be wrong yet. These are defects in the approved plan and one cue that goes unused. All are observed in the text or the frames.

1. **W4.20 asks for loops, and loops break the one clock.**
   - **Where:** `01-implementation-plan.md:202`: "three seamless originals/licensed loops — water, wind, wood creak".
   - **What's wrong:** A fixed-length loop cannot follow the shared 9 s breath (`weather.ts:66-68`) or the 600 s gust (`weather.ts:69-74`). Within a minute it drifts out of phase with the water you can see. That is exactly why the 2026-08-13 prototype was killed ("duplicated the W3.2 breath/W3.4 sortie clocks", `ultimate-garden-design-plan.md:186-189`). Sea audio that swells while the picture exhales feels subtly wrong, like dubbed film.
   - **Fix:** a procedural bed that samples `gardenBreathAt`/`gardenGustEnvelope` directly (sound-1).
   - **Cost:** S to change the spec.
2. **W4.20 budgets 5 MB compressed and 24 MB decoded.**
   - **Where:** `01-implementation-plan.md:202`.
   - **What's wrong:** That is about 12× more than the design needs: 0 bytes for the bed and ≤400 KB of one-shots. A 5 MB fetch on "Sound on" also means seconds of silence after the gesture, which feels broken.
   - **Fix:** a procedural bed, plus one-shots lazily fetched after the bed is already audible.
   - **Cost:** S.
3. **The one wind is visually illegible at rest.**
   - **Where:** `sound/gust-front.png`, all 9 frames. The Ethereum flag (top left) and the left-quay sails barely change during the 12 s attack and 36 s release (`weather.ts:69-74`).
   - **What's wrong:** A world-scale system (the gust delay, `weather.ts:194-231`) moves every sail and flag, yet nobody can perceive it as an event. The CPU spend buys no calm "moment".
   - **Fix:** let the ear carry the gust (sound-1, gust travel).
   - **Cost:** S once the bed exists.
   - **Confidence:** M. Contact-sheet scale at tier `interaction` understates small flutter.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### sound-1 ★ One wind, heard: a procedural bed bound to the existing clocks
- **Picture:**
  - You press Sound. Over six seconds the room fills with slow, low surf that inhales and exhales exactly as the water in `noon.png` breathes. Stone-lap ticks land on the island's rocks just after each swell.
  - Every ten minutes a gust rises, first in the upwind ear, then across the stereo field as the flags lift in sequence downwind, and then settles over 36 seconds.
  - At night the surf darkens, and each time the beam turns toward you the air brightens a hair, a soft "hhh" of light passing.
  - Zoomed out to `wholemap-noon.png`, the near detail falls away and you hear open ocean, wide and hushed.
- **Why:**
  - The world already has one calm clock system (`weather.ts:66-88`), a truthful sea state (`sea-state.ts:93-95`) and a wall-clock hour (`day-cycle-beats.ts:18-44`). Binding sound to them gives perfect sight–sound coherence at zero new oscillators. That is the "one wind" principle (`visual-cue-registry.ts` `sharedGardenWind` note: "no new oscillator").
  - The breath is 9 s, about 0.1 Hz, the paced-breathing rate used in HRV biofeedback. The listener entrains to it without being told.
- **Impact:** relaxing 5, poetic 4, stunning 3. **Confidence:** H.
- **Cost:** M, 2–3 days to build, plus tuning under sound-2. **Perf:** Δdraws 0 / Δtris 0 / ΔGPU 0 / Δtex 0.
  - Main thread about 0.003 ms/frame amortised: a 4 Hz parameter tick of about 20 `setTargetAtTime` calls at about 0.05 ms each.
  - Audio thread: about 1–2% of one M5 Pro P-core [INFERENCE, measure via `chrome://tracing` "audio" category].
  - 0 asset bytes. About 4 KB gzip of the lazy chunk. About 3 MB decoded: one 8 s stereo white-noise buffer at 48 kHz, plus the reverb IR shared with sound-3.
- **How:** new lazy module `src/lib/pharosville-audio/bed.ts`. Every source is filtered noise from one generated white-noise `AudioBuffer`: L and R use different loop offsets and playbackRates 0.97/1.03 so they decorrelate.
  - **Sea body:** noise → 2× lowpass (−24 dB/oct).
    - Cutoff = 380 Hz + 520 Hz · `gardenBreathAt(t, GARDEN_BREATH_PHASE.water)` · (0.6 + 0.4·swell).
    - Gain swings ±3 dB at Calm sea and ±6 dB at Storm sea.
    - Each breath cycle gets a seeded ±2.5 dB amplitude, with "sets" of bigger waves every 5–7 cycles. The 9 s period never sounds mechanical, yet no second clock is added.
  - **Wash:** noise → bandpass 1.2 kHz (Q 0.5), enveloped by the same breath 0.1 cycle later.
  - **Stone lap** (near detail): 60–180 ms bandpassed bursts (700–2200 Hz) at phase `GARDEN_BREATH_PHASE.wakes`.
    - Seeded ±0.6 s jitter, 30% skipped.
    - Gain × `nearDetail = smoothstep(0.45, 1.2, camera.zoom)`, so at the whole-map zoom of 0.28 they vanish.
  - **Wind:** noise → bandpass (Q 0.8).
    - Centre = 250 + 850·`wind.speed` Hz. Gain from `wind.speed`.
    - Plus a resonant whistle band (Q 9, 620–880 Hz), only when `wind.speed > 0.65`, which in practice means storm (`weather.ts:146`).
  - **Gust travel:** `gust` modulates wind gain by up to +6 dB and +200 Hz. The stereo pan of the wind layer is swept from −0.7 to +0.7 by evaluating `gardenGustAtWorldPosition` (`weather.ts:216-231`) at two world points, left and right of the frame, and using their difference. The ear hears the front arrive from upwind, as the flags do.
    - The front crosses the harbour in about 15 s at 6 u/s [INFERENCE from the ~90-unit map].
  - **Storm:** rain (highpass 2 kHz noise plus sparse 3 ms drop clicks) from `stormLevel > 0.3`.
    - A distant rumble 2.5–4 s after a lightning slot: lowpass 160 Hz, 600 ms attack, no crack transient, at most 20/h.
  - **Night:** a darker sea (cutoff × 0.8) weighted by `dayCycleBeats().night`.
  - **Beacon pass:** "air" gain rises +3 dB at −42 dBFS when `cos(beamAngle − cameraBearing) > 0.9`.
    - The renderer exposes `scene.beamAngle` (`world-renderer.ts:4433`) as a returned metric.
    - The period is 15–31 s, set by the PSI sweep rate (`world-renderer.ts:4420`).
  - **Inputs:** the render loop writes an allocation-free `AudioSceneSnapshot` into a ref right after `writeWeatherPlan` (`use-world-render-loop.ts:600-606`).
    - Fields: `motionTimeSeconds`, hour, swell, `wind.{speed,gust,x,y}`, stormLevel, lightning, zoom, camera target, beam angle, `director.active`.
    - The engine reads it on its own 4 Hz timer and never touches React state.
    - Smoothing: `setTargetAtTime`, τ = 0.8 s for levels and 1.5 s for zoom.
  - **Spatialisation:** `StereoPannerNode`, pan = clamp((screenX/width·2−1)·0.7, ±0.8), because the rig has a fixed yaw (`projection.ts:107`). No HRTF `PannerNode`: it costs CPU and only helps on headphones.
  - **Speakers:** voice the sea's energy at 200–900 Hz. Laptop speakers cannot play the <120 Hz body, which is a headphone bonus only.
- **Displaces:** the W4.20 loops and the 08-13 duplicated breath/sortie clocks. Nothing visual changes: the visuals must stand alone.
- **Truth & a11y:**
  - Sea loudness, brightness and wind come from `seaState.swell/wind` and `stormLevel` (DEWS + PSI). The DOM equivalent already exists: the ledger's "Sea state" clause (`accessibility-ledger.tsx:226-227` via `seaStateSummary`, `sea-state.ts:112-116`).
  - The beacon pass follows the sweep, whose DOM parity is the Harbor light / Beam bearing rows (`visual-cue-registry.ts:167,206-212`).
  - Under reduced motion or Still (`pharosville-world.tsx:95`) the weather plan is time-zero, so the gust is off and wind is static. The sea still breathes on the audio clock, at ±1 dB instead of ±3. Sound is not motion, but the soundscape should be as still as the picture.
- **Risks:**
  - Filtered-noise sea can sound like "hiss" if the lowpass sits too high. The 380 Hz floor and 2× filtering are deliberate; tune them on laptop speakers.
  - Thunder, even as a distant rumble, must be operator-approved (see Reversals).
- **Acceptance:** In real Chrome, `?debug=1&audio=record:60` (sound-2) at `#t=12.25`, `--fixture calm` and `--fixture stress`:
  - Stem RMS within ±2 dB of the mix sheet.
  - A spectrogram shows the 9 s swell aligned to the water phase (±150 ms against `gardenBreathAt`).
  - During the gust the wind stem's pan crosses 0 in the downwind direction within 20 s of the attack.

### sound-2 ★ The tuning harness and consent lifecycle (the thing that failed twice)
- **Picture:**
  - For the viewer: a quiet speaker glyph beside Light and motion. Click it and the harbour fades in over 6 s. Switch tabs and it breathes out in 0.6 s. Return and it rises again, never with a backlog of missed sounds.
  - For the operator: `?debug=1` adds a small mixer with per-layer faders, solo/mute, and a "Record 60 s" button that saves a WAV. Tuning becomes evidence rather than vibes.
- **Why:**
  - Sound was withheld on 2026-08-13 for lack of "3–5 days of real audio tuning" evidence (`decision-ledger.md:12`, `ultimate-garden-design-plan.md:186-189`). D11/W4.20 inherits the same gate (`01-implementation-plan.md:65,202`). Without a harness, "tuning time" can't be shown or reviewed.
  - The autoplay policy and truth rules make lifecycle work a correctness problem, not polish.
- **Impact:** enabling; relaxing 4 through restraint. **Confidence:** H.
- **Cost:** M, 2 days. **Perf:**
  - 0 GPU.
  - Entry/world chunk: +~1.2 KB gzip for the control and `use-garden-sound.ts`.
  - New lazy chunk `pharosville-audio-*.js`, estimated 25–40 KB raw / 8–12 KB gzip for engine, bed, events, music and mix together.
  - With sound off (the default) the chunk is never fetched, and 0 audio-thread CPU is used (no context exists).
- **How:**
  - **Control.** `world-controls.tsx`: a second `<details className="pharosville-sound-control">` mirroring the light control (`:112-126`). Build it on LaneChrome's shared "almanac drawer" panel class (Garamond label, sans controls, 44 px targets, lantern focus ring), not a second style.
    - `Volume2`/`VolumeX` lucide icons, not a bell (see Reversals). The glyph never animates at rest; the armed state is a static dot.
    - Panel: a "Sound" switch (`role="switch"`, `aria-checked`), a "Volume" range (0–100, gain = v², default 70 ≈ −6 dB), a "Music" checkbox (default on when Sound is on), and one `<small>`: "Sound follows the sea and the hour. Every reading is also written in the ledger."
  - **Consent.** New `src/hooks/use-garden-sound.ts`, in the main chunk.
    - It creates `new AudioContext({ latencyHint: "playback", sampleRate: 48000 })` synchronously inside the click handler, so user activation is spent before any `await`. It then `await import("./lib/pharosville-audio/pharosville-audio")` and hands the context over.
    - Preference is stored in `localStorage["pharosville.sound"] = {v:1,on,volume,music}` with the try/catch pattern of `use-legend-dialog.ts:6-20`.
    - On a return visit with `on:true`, the glyph shows an "armed" state. The first `pointerdown`/`keydown` on the world shell creates and resumes the context with an 8 s fade from −∞. There is no resume without a gesture, and a motion preference never implies audio consent (D11).
  - **Lifecycle.**
    - `visibilitychange` → hidden: 0.6 s fade, then `ctx.suspend()`. Visible: `resume()` plus a 2.5 s fade. The director never replays missed beats (`garden-director.ts:83-94`), so resume is clean.
    - Canvas off-screen (the IntersectionObserver in `use-world-render-loop.ts:284-289`): duck −12 dB, not stop. Reading the ledger with the harbour behind you is lovely.
    - `BroadcastChannel("pharosville-sound")`: the most recently focused tab owns sound and the others fade out.
    - Sound off: `ctx.close()`, so CPU returns to 0.
    - The desktop-gate fallback never loads the module.
  - **Data saving.** When `prefers-reduced-data: reduce` or `navigator.connection.saveData` is set, use the synth-only path and never fetch samples (sound-5). Birds are then omitted, not faked.
  - **Mix as data.** `src/lib/pharosville-audio/mix.ts` exports one typed `AUDIO_MIX` constant holding the mix sheet below. Code never inlines a level.
  - **Harness.** Under `isDebugChromeEnabled()` (`pharosville-debug.ts:9`), a mixer panel writes overrides into `AUDIO_MIX` at runtime and "Copy mix" exports JSON.
    - `&audio=record:N` taps a `MediaStreamAudioDestinationNode` → `MediaRecorder` and downloads the recording.
    - A throwaway `outputs/opus-review/tools/audio-render.mjs`, using system Chrome like `motion-sheet.mjs`, renders 60 s through `OfflineAudioContext` at fixed seeds for {calm, stress} × {noon, golden, night}. It prints per-stem RMS, peak and integrated LUFS.
  - **Budgets.** `scripts/bundle-budgets.mjs` gets `audio: { pattern: /^pharosville-audio-[A-Za-z0-9_-]+\.js$/, maxRawBytes: 48*1024, maxGzipBytes: 16*1024 }`, plus a `public/audio/` asset cap of 400 KB. Re-measure the aggregate gzip against 886 KiB (`bundle-budgets.mjs:103-104`) when it lands. If the aggregate is near its cap, keep the chunk out of the aggregate the way the renderer's is tracked separately.
  - **Mix sheet** (levels at volume 100%, before master; peak for events, RMS for beds; starting points for tuning).

    | Layer | Calm sea, noon | Storm sea | Rate / hour | Notes |
    | --- | --- | --- | --- | --- |
    | Sea body | −30 RMS | −22 RMS | continuous | LP 380→900 Hz on breath `water`; ±3 dB (±6 storm) |
    | Wash | −36 RMS | −26 RMS | per breath (400/h) | BP 1.2 kHz, breath +0.1 cycle, sets every 5–7 |
    | Stone lap (× nearDetail) | −34 pk | −30 pk | ~280/h | `wakes` phase, 30% skip, ±0.6 s |
    | Wind | −44 RMS | −28 RMS | continuous | BP 250–1100 Hz; gust +6 dB, 1 per 600 s |
    | Wind whistle | off | −34 RMS | — | only `wind.speed > 0.65` |
    | Rain | off | −30 RMS | — | `stormLevel > 0.3` |
    | Thunder rumble | off | −30 pk | ≤ 20 | CRISIS+ only; LP 160 Hz, 600 ms attack |
    | Beacon pass (night) | −42 | −42 | per revolution (115–240/h) | a bed modulation, not an event |
    | Night air / insects | −52 / −46 | −52 / off | continuous 20:00–04:45 | insects summer/autumn only |
    | Bell buoy | −34 pk | −34 pk | 4 → 24 | Poisson on swell; off-frame |
    | Rope / timber creak (× nearDetail) | −38 pk | −34 pk | 6 → 14 | harbour-level, never per ship |
    | Gulls (distant) | −36 pk | off | 6 (06–18 h) | none at night or in storm |
    | Dawn waders | −38 pk | off | 12 (05:00–07:00) | then 0 |
    | Arrival (luff + fender + tonic) | −32 pk | −32 pk | ≤ 5 (director) | identical for increase/decrease |
    | Keeper kindling | −40 pk | — | ≤ 8 per 180 s beat | dusk/dawn only |
    | Heron wings | −38 pk | — | 1/day | almanac |
    | Meteor | bed −4 dB dip | — | 1/day | subtraction |
    | Foghorn (stale feed) | −30 pk | −30 pk | entry + ≤ 4 | panned to the stale water |
    | Music mallet / pluck | −30 / −32 pk | music −9 dB | 6–13 notes/min in phrase | ≤ 45% of each hour active |
    | Music pad | −38 RMS | −9 dB | — | tacet 00:00–04:45 |
    | Reverb | return −20 | | | sends: music −10, events −16, bed −28 |
    | Master | comp thr −24, 2.5:1, knee 10, 30/800 ms; limiter thr −8, 20:1 | | | ceiling −6 dBTP; calm ≈ −27 LUFS at 100%, ≈ −33 at default |

  - **Ducking.** Director foreground beat: music −6 dB over 1.5 s. Find/text-input focus: master −6 dB. Selection: see sound-7.
  - **Voice caps.** ≤ 6 concurrent event voices (W4.20). ~12 bed nodes. ≤ 4 music voices.
  - **Phases.**
    - P0: this harness plus sound-1. Gate: a 30-min listening log on laptop speakers and headphones at three hours.
    - P1: sound-3.
    - P2: sound-4 and sound-6.
    - P3: sound-5 samples and sound-7.
    - Each phase ships only with its recorded renders.
- **Displaces:** the 08-13 "diegetic ship's bell" toggle and unverifiable "tuning days".
- **Truth & a11y:**
  - Default off. The switch state and volume are in the accessibility tree.
  - Nothing announces through sound; the `aria-live` now-caption stays the truth.
  - Screen-reader users who never touch the control hear nothing.
- **Risks:**
  - Autoplay edge cases, especially Safari: resume must happen inside the gesture. Creating the context synchronously in the handler is the mitigation.
  - The armed return state could surprise someone in an office. The 8 s fade from silence softens this, and the operator may prefer "armed until the Sound glyph is clicked" (see Reversals, item 2).
- **Acceptance:**
  - `audio-render.mjs` prints a stem table within ±2 dB of `AUDIO_MIX` for 6 scenarios, and true peak ≤ −6 dBTP.
  - Manual check in real Chrome: hiding the tab mutes within 0.7 s, and after 20 minutes hidden, returning plays no backlog.
  - `npm run build` shows the audio chunk under its budget, and with sound off there is no `pharosville-audio` request in the network log.

### sound-3 ★ Breath music: an anhemitonic pentatonic scale as a rule, silence as the score
- **Picture:**
  - In the long quiet between beats, a felt-mallet note falls on an inhale, then another two breaths later, then a low plucked string. It is three or four notes, then a minute of sea.
  - At golden hour a bowed-glass fifth opens underneath, the warmest the day gets. At blue hour the notes rise high and far apart. Past midnight the music stops; only the sea keeps watch.
  - When the market is stressed and the caption reads "a watchful noon", the harmony quietly loses its major third. It never sours; it becomes open, suspended and attentive.
- **Why:**
  - The operator values music and relaxation (task brief).
  - The yo scale (D E G A B) and the major pentatonic (D E F♯ A B) share the property that matters: no semitones. Any overlap of any notes is consonant, so a generative line can never play a "wrong" note and silence can be the structure. That is ma as a principle.
  - The costume lies in idiom, not the pitch set. The hemitonic in scale (D E♭ G A B♭, instantly "Japanese"), koto tremolo and oshide bends, shakuhachi breath, temple bells and taiko are all excluded.
  - Moving between the two scale sets is one note: F♯ ↔ G. That lets data change colour without ever adding tension. The threshold is exactly the caption's `psi < 50` → "watchful" (`detail-model.ts:83-89`), so every musical state has a written equivalent.
- **Impact:** poetic 5, relaxing 5, stunning 3. **Confidence:** M. Generative music lives or dies in tuning.
- **Cost:** L, 3–4 days plus listening. **Perf:**
  - 0 GPU. About 4 KB gzip of the lazy chunk.
  - Instrument buffers pre-rendered in JS during idle (about 15 ms main thread, split across `requestIdleCallback`): 8 pitches × 2 timbres × 3.5 s at 24 kHz ≈ 5.4 MB decoded.
  - Audio thread under 0.5% [INFERENCE]: ≤ 4 `AudioBufferSourceNode` voices plus a 2-oscillator pad.
- **How:** `src/lib/pharosville-audio/music.ts`.
  - **Tonic D.** The pitch set is {D E F♯ A B} ("quiet") or {D E G A B} ("watchful"), in 5-limit just intonation relative to D.
  - **Grid.** Onsets land only at breath phase 0 (inhale start) or 0.4 (inhale peak) of `gardenBreathAt` (`weather.ts:164-176`), humanised ±60 ms. Tempo is the breath: 6.7 cycles/min.
  - **Phrases.** 3–7 notes as a seeded random walk: step ±1 at p = 0.7, leap ±2 at p = 0.2, repeat at p = 0.1. At most one note per breath (occasionally two). Phrases always end on D or A. After a phrase, rest 2–8 breaths.
  - **Windows.** Music is active for 4–7 min, then tacet for 5–10 min, so at most 45% of any hour.
    - It never starts a phrase during a director foreground beat (`garden-director.ts:64-79`).
    - One breath after a foreground beat ends, it may answer with a single tonic. That is the only call-and-response.
  - **Seed.** `${utcDayKey}:${minuteBucket}`, the same day key as the director (`pharosville-world.tsx:188-189`). Everyone watching at the same minute hears the same phrase: one harbour, one clock.
  - **Hour orchestration** (weights from `dayCycleBeats`, `day-cycle-beats.ts:18-44`):

    | Beat | Instruments | Register |
    | --- | --- | --- |
    | Dawn | mallet only | D5–B5, sparsest |
    | Day | mallet + pluck | D4–A5 |
    | Golden | pad (open fifth D3–A3) + pluck + mallet | fullest |
    | Blue | pad + high mallet | wide spacing |
    | Night (20:00–24:00) | pad on D2/A2 + rare low pluck | low |
    | 00:00–04:45 | tacet | — |

  - **Timbres.**
    - Mallet: modal ratios 1 : 4.0 : 9.2 (partial 2 at −18 dB with 0.3 s decay, partial 3 at −30 dB with 0.08 s decay). Fundamental decay 2–3 s. 4 ms attack plus a −30 dB lowpassed "felt" click.
    - Pluck: Karplus–Strong, averaging loss 0.996, peaking body at 250 Hz, 3–5 s decay, no bends or tremolo.
    - Pad: two detuned sines per voice (±3 cents), each partial with its own 0.03–0.08 Hz amplitude drift, 12–20 s crossfades.
  - **Space.** One shared generated reverb IR: stereo exponential-decay noise, T60 3.2 s, 40 ms pre-delay, high frequencies damping from 8 kHz to 2 kHz over the tail. The whole garden shares one air.
  - **Storms.** Under `stormLevel > 0.5` the music thins: −9 dB, pad only. Music in a storm would be a lie about mood.
  - **Observe mode** (the attract tour): phrase probability +20%, because it is a lean-back mode.
- **Displaces:** the 08-13 "chime-grade pentatonic interaction tones" (hover/selection chimes). Music belongs to the garden's quiet, not to the pointer.
- **Truth & a11y:**
  - The only analytic gesture is the removed third, mirrored 1:1 by "quiet"/"watchful" in the now-caption (`detail-model.ts:86`).
  - Add a registry entry with channel `sound` in `visual-cue-registry.ts`. Add a test that no cue lists `sound` as its only primary channel.
  - Reduced motion: music allowed and unchanged. It is sound, and the director is frozen anyway (`use-garden-director.ts:6-11`), so there is no beat-coupled answer.
  - Music has its own "Music" checkbox.
- **Risks:**
  - It could still read as spa or "zen app" if phrases are too frequent. The ≤ 45% window and the long rests are the defence; hold that line in tuning.
  - The F♯/G swap may go unnoticed. Acceptable: it is a grace note, not a carrier.
  - The art-director and garden-master lanes should review the timbres for costume.
- **Acceptance:**
  - `audio-render.mjs` 20-min render at `#t=17.6` (golden) and `#t=2.5`: the golden render shows ≤ 45% music-active time, every onset within ±80 ms of a breath phase 0/0.4, and the 02:30 render has no music.
  - A PSI < 50 fixture renders without F♯ and the calm fixture with it.
  - The operator listens for 30 min on laptop speakers and reports it restful rather than decorative.

### sound-4 Beats you can hear: the director's events, scored once each
- **Picture:**
  - An arrival: as the sail dips you hear canvas luff and a rope run. As the hull settles, a soft wooden fender knock. At the dip's lowest point the music's tonic sounds once, a mallet D, whether supply rose or fell.
  - At dusk the keeper's round is a string of small wood "tocks" and a breath of flame at each lamp.
  - The heron's arrival is three slow wingbeats.
  - For the deep-night meteor the whole sea drops 4 dB for seven seconds: the harbour holds its breath.
- **Why:**
  - The director spends a lot of care to make events rare, 6–12 min silences (`garden-director.ts:45,74-79`), yet at rest they are easy to miss. A foreground beat you can hear lets the eye find it without the picture getting louder.
  - Arrivals already carry DOM annotations (`garden-arrival-beats.ts:92-96`, visible in `wholemap-noon.png`).
- **Impact:** poetic 4, relaxing 3. **Confidence:** M/H.
- **Cost:** M, 1.5 days. **Perf:**
  - 0 GPU, ≤ 3 concurrent voices, main thread negligible.
  - Luff and fender are synthesised (shaped noise); creak and wingbeat come from sound-5's samples, about 40 KB.
- **How:** `events.ts` watches `snapshot.director.active.id` and schedules sounds on a new id.
  - **Arrival** (`kind: "arrival"`):
    - Luff at t0 + `GARDEN_SAIL_DIP_ATTACK_SECONDS` × 0.2: highpassed noise with a 0.8 s flutter at 11 Hz AM.
    - Mallet D4 at t0 + 1.2 s, the dip minimum (`garden-arrival-beats.ts:9-11`).
    - Fender knock at the end of the beat: a 180 Hz damped sine and a noise tick.
    - Panned to the ship's screen x.
  - **Keeper** (`kind:"keeper"`, 180 s, `garden-almanac-dressing.ts:123-127`): one tock per lamp as it kindles. The renderer exposes a lamp-lit count in the snapshot.
  - **Heron** (`heron-dusk-flight`, `garden-summit-birds.ts:133-137`): a wingbeat sample at the flight's start.
  - **Meteor** (`deep-night-meteor`, 10 s, `garden-almanac.ts:47-54`): bed dip −4 dB with 3 s down, 4 s hold and 6 s up. No sound of its own.
  - **Market** priority-100 beats (`garden-director.ts:64`) get no sound, ever.
- **Displaces:** it lets W4.7 keep "No bell" (`01-implementation-plan.md:189`). Depeg and recovery stay silent visual stories.
- **Truth & a11y:**
  - The arrival sound is identical for increase and decrease. The direction lives only in the caption text, so no happy/sad scoring editorialises supply.
  - Heron, keeper and meteor are decorative and carry no meaning (`visual-cue-registry.ts:11`).
  - Reduced motion: the director is frozen, so there are no event sounds. That matches the static tableau.
- **Risks:**
  - Timing drift between sight and sound. Schedule with `ctx.currentTime + outputLatency`; the director's `startSeconds` is on the render clock, so convert once per beat.
- **Acceptance:**
  - A `#t=17.9` session recorded with `?debug=1&audio=record:240`: the keeper tocks line up with lamp kindling frames within 100 ms (checked against a `motion-sheet.mjs` capture at the same hash).
  - An arrival sequence has its mallet at the sail-dip minimum.

### sound-5 Borrowed sound: shakkei for the ear
- **Picture:**
  - Beyond the frame, a bell buoy rocks: rarely on a calm day, every few minutes when the sea is rough.
  - Gulls call from somewhere past the right edge at midday. At dawn, a pair of waders pipe from the shallows for half an hour and then stop.
  - On summer and autumn nights a thin bed of insects rises from the garden at your feet, the dark pine bough of the bible's picture made audible.
  - The world gets bigger than the frame without a single draw call.
- **Why:**
  - Borrowed scenery (shakkei) is already the garden's depth principle (`VISUAL_INVARIANTS.md:13-15`). Borrowed sound gives depth without spending the attention budget the bible guards (`VISUAL_INVARIANTS.md:62-68`, plan §6 "More birds…" rejected).
  - Real birds are one of the few things procedural synthesis does badly. Fake synth birds are pure tech demo, hence a small sample set.
- **Impact:** poetic 4, relaxing 4, stunning 2. **Confidence:** M.
- **Cost:** M. Sourcing and licensing is most of it. **Perf:**
  - 0 GPU.
  - Samples: about 13 mono one-shots and one 4 s insect grain source, 48 kbps AAC-LC `.m4a` (Opus/WebM where `canPlayType` allows). About 36 s total, roughly 220 KB, capped at 400 KB.
  - Fetched after the bed is audible, never on first load. Decoded about 3.5 MB.
- **How:** `borrowed.ts`.
  - **Bell buoy:** modal synthesis, zero bytes. Partials 0.5, 1, 1.19, 1.5, 2.0, 2.51 × 392 Hz with 1.5–6 s decays. Strike times come from a seeded Poisson process at λ = 4 + 20·swell per hour (`sea-state.ts:93`). Pan +0.85 (off-frame right, the harbour mouth), lowpass 3 kHz for distance.
  - **Gulls:** only 06:00–18:00 by `dayCycleBeats().day`, none when `stormLevel > 0.4`.
  - **Dawn waders:** active while `dawn > 0.5`.
  - **Insects:** from `seasonFromDate` (`season.ts:7-15`), summer or autumn and `night > 0.6`. Granular: 8 overlapping randomly offset grains of the 4 s source, highpass 3 kHz, at −46.
  - **Rope/timber creak:** λ = 6 + 8·swell per hour × nearDetail, panned to a random moored-ship screen x. Sway already scales with swell (`sea-state.ts:152-155`).
  - **Licensing:** CC0 only (or commissioned originals), listed in `public/audio/LICENSES.txt`.
  - **Species:** harbour-universal (gulls, terns, waders, crickets). No uguisu, higurashi or temple bell.
- **Displaces:** any pressure to add visible birds or buoys to make the world feel alive. Sound supplies that life without counts.
- **Truth & a11y:**
  - Bell-buoy frequency follows swell, which appears in the DOM through the ledger "Sea state" clause. It is a redundant, physical echo, never a unique carrier.
  - Everything else is decorative, with a registry note.
  - With data saving on, samples are omitted and only the synth buoy remains.
- **Risks:**
  - Poor recordings are worse than none; budget curation time.
  - AAC decode on Linux Firefox can fail, so fall back to Opus. The browser matrix is [INFERENCE], verify.
- **Acceptance:**
  - `audio-render.mjs` at 05:30, 12:25 and 22:00 (summer fixture date): the event log shows waders only at 05:30, gulls only at 12:25, insects only at 22:00, and buoy strikes/hour within ±30% of λ.
  - `public/audio/` totals ≤ 400 KB.

### sound-6 Fog has a voice: a stale feed sounds a distant foghorn
- **Picture:**
  - A feed goes stale. The now-caption says "DEX prices stale since 14:02", and a bounded fog bank sits over that water.
  - Far off, from the side of the harbour where the fog lies, a low two-tone horn sounds once: long, soft and melancholy. It may sound again every quarter hour until the feed recovers. Then it stops without comment.
- **Why:**
  - Stale data is "reduced visibility". A foghorn is the one maritime sound whose literal meaning is exactly that. It is a truthful metaphor, not an alarm.
  - It honours the channel treaty (stale sources own bounded local fog, `VISUAL_INVARIANTS.md:58-60`) and uses the same precedence as the caption (`detail-model.ts:109-110`).
- **Impact:** poetic 4, relaxing 2. **Confidence:** M.
- **Cost:** S. **Perf:** 0 GPU, 0 bytes (synthesised), 1 voice.
- **How:**
  - Two detuned sawtooth oscillators at A1/E2 (55/82.4 Hz) plus their octaves, lowpass 400 Hz.
  - Envelope: 1.2 s attack, 2.5 s hold, 3 s release. 5-cent vibrato at 4.5 Hz.
  - Pan toward the stale water's centroid screen x; −30 dBFS peak; send −10 to reverb.
  - Triggered on entering stale (a `freshness` key flips true), then at most every 15 min (≤ 4/h). Silent while a foreground director beat is active.
- **Displaces:** nothing.
- **Truth & a11y:**
  - DOM parity is the caption stale clause and the ledger freshness rows.
  - The horn never says which feed; the caption does.
  - Reduced motion: allowed. It is a state, not an animation, and fires only on state entry and the long repeat.
- **Risks:**
  - If staleness is common in production, the horn nags. Check the freshness history. If stale appears more than about 10% of hours, sound only on entry.
  - Operator sign-off is needed that this is not an "alarm" under D11.
- **Acceptance:** a stale-feed fixture (`--fixture stress` or a mocked freshness flag) sounds exactly one horn on entry and ≤ 4/h after, panned to the side of that water's fog bank, confirmed in the rendered stem.

### sound-7 Listening pose: Still + Sound, and leaning in on selection
- **Picture:**
  - Tick Still. The picture becomes a woodblock print, `reduced-noon.png`'s static tableau, yet the sea keeps breathing and the buoy keeps its slow count. It is like standing still in a garden with your eyes resting.
  - Select the lighthouse and the mix leans in: the sea softens 2 dB, and from the lantern room comes the low breathing roar of the flame.
  - Select a ship and you hear water knocking at her hull and her rope working, panned to where she sits.
  - Close the panel and the harbour opens back out.
- **Why:**
  - Still exists (`world-controls.tsx:123`, `pharosville-world.tsx:95`) but today means "less". With sound it becomes a distinct, restful way to watch.
  - Selection is the product's "inspect" gesture. Diegetic focus of the audio is the auditory version of the detail panel, and much better than a UI chime.
- **Impact:** relaxing 4, poetic 4. **Confidence:** M.
- **Cost:** S/M. **Perf:** 0 GPU, +2 voices while something is selected, 0 bytes (flame = lowpassed noise; hull knock reuses the lap/fender synths).
- **How:**
  - When `snapshot.selectedDetailId` changes: duck the bed −2 dB (τ 0.6 s).
  - Start a focus source panned to the target's screen anchor (the render loop already publishes `selectedDetailAnchor`).
    - Lighthouse: noise → bandpass 180 Hz, Q 1.2, with 0.3 Hz AM, −38.
    - Ship: lap bursts at 2× rate plus creak, −36.
  - Release on deselect with a 1.2 s tail.
  - Under reduced motion/Still, the bed's breath depth drops to ±1 dB (sound-1) and no event sounds play. Otherwise sound continues.
- **Displaces:** hover/selection chimes (08-13 W8.1).
- **Truth & a11y:**
  - No meaning. The focus sound is identical for every ship regardless of risk or peg. A risky ship does not "sound worse".
  - Keyboard selection triggers it identically.
- **Risks:**
  - Fast keyboard traversal of 184 ships could chatter. Debounce: start the focus source 400 ms after the selection settles.
- **Acceptance:** record `#t=16&sel=lighthouse` and `#t=14&sel=ship.usdc-circle` with `audio=record:30`. The bed is −2 dB against the unselected baseline and the focus stem is panned to the target's screen-x sign.

## Subtractions
- **No UI sounds.** No hover, click, open or close tones. With 184 hulls under a sweeping pointer they would chatter, and UI sound is an app idiom, not a garden. This rejects the 08-13 W8.1 interaction chimes.
- **No sound for market events.** Depeg, band transitions and priority-100 `market` beats (`garden-director.ts:64`) stay silent. D11's "no market alarms" is absolute.
- **No per-ship voices.** Creaks and laps are harbour-level with ≤ 6 event voices. Sound must not re-create the carpet the bible fights.
- **No loops.** The W4.20 spec is replaced by the procedural bed.
- **Silence at night.** No music from 00:00 to 04:45, the day-cycle night plateau.
- **The meteor gets silence** instead of a sound.
- **No costume.** No in scale, koto idiom, shakuhachi, temple bell (bonshō), shō clusters or taiko.
- **No sound before consent,** and never during the 1.8 s reveal.

## Reversals
1. **W4.20's "three seamless loops, ≤5 MB compressed, ≤24 MB decoded"** (`01-implementation-plan.md:202`).
   - Evidence: loops can't follow `gardenBreathAt`/`gardenGustEnvelope` (`weather.ts:66-74`). The 08-13 prototype was cut for duplicating those clocks (`ultimate-garden-design-plan.md:186-189`). The 08-13 plan itself had already chosen "pure Web Audio synthesis, zero asset bytes" (`:166`).
   - Proposal: procedural bed at 0 bytes, samples ≤ 400 KB, decoded ≤ 12 MB.
   - Risk: synthesis quality needs the harness (sound-2).
2. **"Suspended on hidden tabs"** (W4.20). Keep it as the default, but offer an opt-in "Keep listening in other tabs" checkbox.
   - Argument: the operator values relaxation, and the most common way people use ambient sound is while working in another tab.
   - Truth guard: while hidden, react-query stops refetching (`use-api-query.ts:108-122`; `refetchIntervalInBackground` defaults to false [INFERENCE]). So every data-driven modulation freezes at the last reading, and the whole mix fades out over 20 s after 30 min hidden, so a calm sound can't outlive a market that may have moved.
   - Risk: a truth drift of up to 30 minutes of audio-only calm. Operator decision.
3. **The 08-13 "diegetic toggle (a small ship's bell, not a speaker icon)"** (`ultimate-garden-design-plan.md:166`). Use the honest speaker glyph.
   - A bell reads as notifications and couples sound to alarm semantics.
   - A control someone needs to find in a hurry, to silence a tab in a meeting, must be conventional.
4. **The decision ledger's "Ship the soundscape only with committed tuning time"** (`decision-ledger.md:12`). Keep the gate, reframed from time to evidence.
   - Per phase: `audio-render.mjs` stem tables within ±2 dB of `AUDIO_MIX`, true peak ≤ −6 dBTP, and a 30-min operator listening log on speakers and headphones.
   - Days of tuning with no artefact can't be reviewed; renders can.
5. **Thunder.** The plan's "no market alarms" could be read as banning it. I propose allowing only a transient-free distant rumble (LP 160 Hz, 600 ms attack, ≤ 20/h) at CRISIS+, when lightning is already visible (`weather.ts:102-108`).
   - Risk: startle.
   - Operator can veto; then storms are carried by wind, whistle and rain alone.

## Cross-lane dependencies
- **LaneWater / LaneFleetMotion:** sound assumes the 9 s breath, the `GARDEN_BREATH_PHASE.water/wakes` offsets and the sail-dip timing (`garden-arrival-beats.ts:9-11`) stay the single clocks. If either lane changes them, audio follows automatically, but no lane may add a second wave clock.
- **LaneAmbientJourney / LaneLife:** any new or renamed director beat (subject strings, keeper lamp-lit count, heron) needs an event hook in `events.ts`. Fauna choices (gulls, heron) should match borrowed-sound species.
- **LanePharos / LaneLight:** the renderer must expose `beamAngle` and lamp-lit progress in its returned metrics (`world-renderer.ts:4433`) for the beacon pass and keeper tocks.
- **LaneChrome:** placement of the Sound `<details>` in `world-controls.tsx` next to Light and motion, its copy and the armed state. Already messaged.
- **LaneDataPoetry:** add a `sound` channel to `visual-cue-registry.ts`, plus the invariant that sound is never a cue's only primary channel. Sign off the "watchful" F♯/G swap and the stale-feed foghorn.
- **LaneHeadroom:** the audio chunk's bundle entry and aggregate reconciliation (`bundle-budgets.mjs:80-105`). The audio-thread CPU check (target < 2% of one P-core) belongs in its budget table, separate from GPU ms.
- **LaneArtDirector / LaneGardenMaster:** a costume review of timbres and species. Music tacet windows should line up with the director's quiet, not compete with its beats.
- **LaneHarbour:** world positions of the harbour mouth (buoy pan), the quays (creak pan) and the stone rim (lap focus) for the spatial map.

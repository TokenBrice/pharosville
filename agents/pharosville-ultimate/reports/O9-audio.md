# O9 — Sound design and the soundscape

Lane O9 (audio). Baseline `main` @ `29e0b2a3` (v1.4.1). Structured twin: `reports/O9-audio.json`.

I cannot listen, so I treated the harbour like a mix session: I read the whole graph, timed every synthesiser, logged the first 12.5 s after a real click in the live page, and rendered the real `Ambience` graph offline (17 renders: scenes and per-layer solos). Each render was measured with BS.1770 loudness, a "laptop speaker" variant (4th-order highpass at 200 Hz before K-weighting) and octave spectra.

**Evidence** (in `shots/`):
- `O9-sound-first10s.json`: one trusted click at `t=11`; event log, bank fill, output RMS every 90 ms, the Feeder's real inputs.
- `O9-sound-menu.png` and `-crop.png`: the sound menu.
- `O9-offline-mix-analysis.json`: every loudness and spectrum number quoted below.
- `O9-mix-evidence.png`: chart of the on-ramp, loudness and octave bands.

Nothing played on the operator's speakers (`sinkId: none` behind a zero-gain tap). The shared profile's remembered choice was restored.

## 1. Current state

- **Excellent craft, fully procedural.** There are no audio files; 32 seeded synthesisers (`dsp.ts:24-38`) model peeling shore washes with an interaural delay, Minnaert foam, pebble rattle and N-wave thunder. They fill a clip bank that renews itself (`bank.ts:82-88`). The eager bank costs 291 ms of CPU in idle slices (longest step 3.3 ms), and the whole graph renders at about 2–3.5 % of one desktop core. Keep this house style.
- **One click works.** A trusted click puts the AudioContext in `running` synchronously, and the ambience is built 149 ms later, with no long task and no frame over 33 ms. The "two clicks" note in INTEGRATION-NOTES is stale. The caret opens a keyboard-complete three-state menu (`SoundToggle.tsx:54-91`).
- **Spatialisation is good.** The listener sits on the camera ray, nearness is inverse-square, pan follows the screen bearing (`feed.ts:248-327`), sources behind the look are darker, and an altitude crossfade takes over at the overview.
- **The data voices are mostly honest.** The foghorn sounds only when data is stale (`ambience.ts:1012-1017`). DEWS drives wind, rain, howl and distance-delayed thunder. The breath follows the beam's reach. The Burn falls silent when banked. Launch and death moments are already budgeted.
- **Long-watch care exists:** a ten-minute settle, a ±1.5 dB breath, a 24-voice cap and a thunder cap.
- **Weak:** loudness across states, the storm's spectrum, the masked music, an inaudible Pharos voice, the sea-state re-map, the Mint on stale data, an undocumented sound grammar, a noise-first on-ramp, and a stationary texture (about 2.7 audible one-shots per second, forever).

## 2. Measurements (offline render, home view)

| Scene | Integrated LUFS | Laptop LUFS | Momentary max | LRA | Peak dBFS |
|---|---|---|---|---|---|
| Calm autumn noon | **−28.6** | −30.4 | −24.1 | 4.8 | −13.5 |
| Close to the quay | −27.7 | −28.2 | −21.3 | 5.2 | −10.5 |
| Overview | −28.1 | −30.7 | −24.4 | 4.9 | −12.8 |
| Night (+ breaths) | −28.7 | −31.1 | −25.1 | 5.0 | −13.4 |
| Stale fog (horn) | −27.6 | −29.9 | −20.6 | 6.3 | −9.3 |
| Danger storm | **−12.4** | −12.9 | −9.4 | **2.6** | **−0.6** |
| Music alone | **−41.8** | −42.4 | −39.3 | — | −34.7 |
| Beam breath alone | −33.2 | **−45.2** | −28.0 | — | −23.6 |

**Calm-mix shares (K-weighted power):**
- noise beds 68 %;
- sea one-shots 15.5 %;
- rigging 9.4 %;
- gulls 7.2 % (the loudest recurring event: −28.4 LUFS momentary, 63 % of their energy in 2–5 kHz);
- bells 5.6 %;
- the Mint and Shipyard about −85 LUFS: inaudible, yet still scheduled about 1.4 times a second.

**Spectrum:** the calm mix is scooped (500 Hz −39.7, 1 kHz −46.1, 2 kHz −43.0 dB). The storm is flat from 31.5 Hz to 16 kHz.

**Memory:** about 20–25 MB of PCM.

## 3. Findings (ranked)

1. **F1 (high): the storm is a volume grab.** Danger plays 16 LU louder than calm and peaks at −0.6 dBFS into the soft clipper. With LRA 2.6 LU and a white-noise tilt, thunder barely rises over the bed.
   - Causes: additive layers (`ambience.ts:704` windLow 1.1·wind², `:741` howl ×2.4, `:502/:732` rain fine bandpass at 6.5 kHz with Q 0.5, `:514` spray highpass, `:689/:700` surf and reef ×1.5 and ×1.6).
   - The glue compressor (`:389-390`) flattens the result instead of controlling it.
2. **F2 (high): silent re-map of the sea.** The audible surf grows with the DEWS storm (`:689, :789-790, :814, :700`). The visible amplitude, whitecaps and run-up follow the off-peg sea state (`ocean-system.ts:241-246, :300-301`; `runup.ts:6`), exactly as the Ledger says (`Ledger.tsx:95`). The off-peg signal has no audible twin.
3. **F3 (high): the opt-in music is masked.** Phrases sit 13 LU under the ambience and 13–17 dB under the bed in every octave where the lyre lives (250 Hz: −52.3 against −39.3). Adding music moves the mix by +0.18 dB. Cause: `MUSIC_GAIN 0.1`, root D3 (`music.ts:172, :20`).
4. **F4 (high, verify on one iPad): remembered "on" may never start on touch.**
   - `arm()` listens for `pointerdown`/`keydown` and disarms after the first try (`controller.ts:149-152, :81`).
   - For touch, `pointerdown` is not activation-triggering, so WebKit keeps the context suspended. The visitor gets silence, the speaker drawn "on", and no retry.
   - The emulated test was inconclusive, because Playwright's evaluate grants a gesture.
5. **F5 (medium): the Pharos's only voice is inaudible on small speakers.**
   - The breath is 110/220 Hz sines (`:1185`) with 93 % of its energy below 150 Hz; laptop-weighted it is −45.2 LUFS against a −31.1 bed.
   - Its 5.9 s envelope overlaps 2–3 times at FRACTURE and CRISIS sweeps (`psi-colors.ts:56-63`), an accidental throb under stress.
   - At 1.2 s sweeps the 4 Hz crossing test aliases (`feed.ts:160-162`).
6. **F6 (medium): the Mint fakes activity on stale data.** The visible presses stop when banked (`mint.ts:124`, `flows.ts:75`). The audible ones keep stamping at 0.77 strokes/s (`ambience.ts:715, :970`), and `mintRate ?? 0.5` treats a missing reading as half-busy (`feed.ts:294`).
7. **F7 (medium): the launch bell is the random buoy, played quieter.** Same clip at 0.55/0.42 (`:1116-1121`) against 1.0 at 2–3 strikes a minute (`:810-813`), so it carries no meaning.
8. **F8 (medium): the on-ramp is noise-first.**
   - The output is under −45 dBFS for 1.2 s (3 s linear fade, `:392-393`).
   - The first wash breaks 8–10 dB down.
   - The buoy misses the first swell: a failed `play()` still advances the swell (`:794, :814`).
   - The first full wave arrives about 8.6 s after the click.
9. **F9 (medium): the Ledger names no audible cue** (`Ledger.tsx:63-115`). The planned anniversary-bell legend line never landed.
10. **F10 to F15 (low):**
    - F10: a frozen 9.3 s bed loop and a 1 kHz hole.
    - F11: PCM held outside the budget; drizzle synthesised where it cannot play (`:769` against `:731`).
    - F12: dead evening-gun code.
    - F13: random ±3 % bell and conch detune; a G-minor buoy against the Dorian lyre.
    - F14: inaudible one-shots still allocate nodes and voice slots.
    - F15: the music echoes through a 310 ms feedback slap.

## 4. Ideas

**I1 — Loudness architecture (professional, M).**
- Targets:
  - calm −26 ±2 LUFS;
  - every DEWS state ≤ +6 LU over calm;
  - events ≤ +8 LU over the bed;
  - music −6 ±2 LU under the ambience;
  - peak ≤ −3 dBFS.
- A ceiling limiter (−6 dBFS, ratio 20, 2 ms attack) before the soft clip.
- This lane's eval becomes `scripts/audio/mix-report.mjs`, a gate in `validate:release` (about 30 s).

**I2 — A storm you can listen to (enchanting, M).** DEWS still drives every layer; only gains and filters change. Target: Danger ≤ −20 LUFS, LRA ≥ 6.
- windLow 1.1 → 0.35·wind² with a 30 Hz highpass.
- howl 2.4 → 0.9.
- Rain to a 4 kHz bandpass plus a 9 kHz lowpass.
- Spray to a 3 kHz bandpass.
- Squall lulls: the director's gust cells (`director.ts:92`) swell the weather bus ±5 dB, so near thunder lands +8 LU over a lull.

**I3 — The Pharos voice (enchanting, S).**
- A D3/A3/D4/A4 partial stack plus a breath formant, with at least 60 % of its energy above 250 Hz.
- Brightness follows the same reach (no new claim).
- One breath at a time, with the envelope scaled to the sweep period.
- Timed by the lighthouse's own sweep phase.

**I4 — The harbour key (enchanting, S).** Every pitched voice in D, so "the Pharos sings in D" becomes the identity:
- the buoy to A4 with a C5 partial;
- the hour bell to D4 ±3 cents;
- the conch to A3;
- launch hand bells D5/A5;
- the breath to D.

**I5 — Music you can hear (enchanting, S).** +9 dB, the lyre an octave up, a 2 dB bed pocket during phrases, and a reverb send instead of the slap. It stays at least 60 % silence.

**I6 — A harbour-shaped reverb (enchanting, M).** A procedural convolver impulse response: quay reflections at 45, 95 and 150 ms, then a 2.2 s tail that darkens as it decays. Far sources get more reverb; the beds stay dry. Cost: about 1–2 % of a laptop core. The lean tier keeps the slap.

**I7 — The sea you see (informative, M).**
- Feed `ocean.shared.uSea` (the eased amplitude, chop and whitecaps) into the ambience.
- Surf size, period, run-up hiss and whitecap spray follow the sea state.
- DEWS keeps wind, rain, howl and thunder.
- Same words as the Ledger and the Shoals panel; a unit test proves the surf ignores DEWS.

**I8 — "By ear" (informative, S).** A Ledger entry, shown while sound is on, that names each audible cue in the visuals' words: foghorn means stale; the breath follows reach; the Mint and Burn follow 24 h; thunder is the early-warning storm; the surf is the sea state; launch and death bells; the rest is decorative. Plus one caption line in the menu.

**I9 — A composed first ten seconds (enchanting, S).**
- A dB-linear 1.4 s fade.
- A reordered `FIRST` queue.
- The first swell waits for its clip.
- A seeded arrival: a lap at about 0.3 s, a full wash at about 1.5 s, a gull at about 4 s, the buoy on the second swell.
- The chunk warms on speaker hover (a D13 question).

**I10 — Activity clouds (enchanting, M).**
- A slow random walk sets decorative rates, giving lulls and episodes.
- Gulls call in flocks, panned to the visible gulls.
- Halyards and creaks follow the visible cat's-paw at the listener (already read, unused by the rigging).
- A reading posture while a panel is open.

**I11 — Moments with their own voice (informative, M).**
- Launch: the hull's rumble down the ways, then two hand bells.
- Death: the cove bell gains partials at 260 Hz and above.
- The buoy and gulls hold for ±15 s around a moment.

**I12 — Life you can hear (enchanting, M).** Each only when near and only when the picture shows it:
- the dolphins' blow (calm bands only);
- goat bells in the harbour key;
- the hay cart's axle.

**I13 — Adaptive decorative music (enchanting, M).** An hour curve: dawn aulos, a noon hush, golden-hour drone, phrases that answer the hour bell, a sparse night in Phrygian. Season colours on top. Still seeded by the calendar day and never by data.

**I14 — Tablet and battery robustness (all-devices, S).**
- Arm on `pointerup`, `keydown` or `click`, and retry until the context is `running`.
- iOS: an `ambient` audio session and a silent-mode hint.
- Suspend after 20 idle minutes.
- A small-speaker rule in the mix report.
- Optional: a phone sound postcard (decision needed).

**I15 — A calmer, richer, unfrozen bed (enchanting, M).**
- The bed about −4 dB at near views.
- A 1–4 kHz run-up foam band tied to each wash.
- Live AudioWorklet noise instead of the frozen 9.3 s and 8.7 s loops (−6.9 MB).

## 5. Top picks (impact ÷ cost)

1. **I9: composed first ten seconds.** S effort and the first impression.
2. **I3: the Pharos voice.** S effort; the hero gets a voice that exists on laptops and tablets.
3. **I2: re-voiced storm.** Fixes the worst measured defect; pair it with the I1 gate.
4. **I7: surf from the sea state.** Removes a D11 re-map with one input.
5. **I5: audible music.** S effort; the third sound state finally delivers.

## 6. Decisions for the operator

1. **Loudness.** Raise calm to about −26 LUFS and cap storms at +6 LU, or keep calm whisper-quiet and only cap storms?
2. **Music level.** About −6 LU under the sea (audible) rather than −13 LU (masked)?
3. **Surf follows the sea state, not DEWS.** A storm over a calm sea-state would then be wind and rain with modest surf, matching the picture.
4. **Chunk warm-up.** May the speaker's hover warm the lazy sound JS, despite D13's "loads only when enabled"?
5. **Phones.** An opt-in, decorative-only sound postcard on the phone welcome page?
6. **iPadOS silent mode.** Obey it (`ambient` session), or use `playback`, which pauses the visitor's own music?
7. **Life sounds.** Welcome texture, or too close to "decorative lore"?
8. **Evening gun.** Delete the dead code?

## 7. Cross-lane hooks

- **O3:** `uSea` as the single sea-state signal, plus the run-up swell phase.
- **O4:** the squall envelope.
- **O2 / Pharos owner:** the sweep phase and period.
- **O7:** moment start times; dolphin, herd and gull read-only services.
- **O6:** Mint press-strike events and the banked state; the shipyard "ways".
- **O8:** the "By ear" text and the menu caption.
- **QA:** the mix-report gate and a real-iPad check of remembered sound.

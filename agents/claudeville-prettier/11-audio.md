# 11 — Audio (vertical 11)

Read-only study of `src/harbour/audio/**` against `main` @ v1.2.1. No captures (audio vertical).

## 1. Current state

- **Fully procedural, zero sample bytes.** `dsp.ts` (949 lines) synthesises 19 clip kinds (shore, lap, reef, crackle, press, halyard, bell, gull, creak, drizzle, rain, drip, thunder, rumble, bird, cricket, cicada, rustle, crunch). `bank.ts` builds seeded variants in time-sliced generator jobs and slowly *replaces* them (`refresh()` every ~20 s), so no wave repeats. Weather/season kinds are `LAZY` (synthesised only when the scene asks). This is excellent and should stay the house style.
- **Lazy and gesture-safe.** `controller.ts` creates the `AudioContext` only inside a user gesture (toggle click, or first pointerdown/keydown if the visitor left it on); `ambience.ts` is a dynamic `import()`; suspend on `visibilitychange`. Off by default, choice in `localStorage` (D13). Main-chunk cost is only controller+toggle.
- **Camera-aware already.** Listener = 45 % along the camera ray; each source gets `near = ref²/(d²+h²)` and a screen-bearing pan from the camera's ground-right vector (`feed()`, 4 Hz). Sources: coast segments, berths, Shoals reef, Pharos fire, Mint, town windows, hamlet groves, land polygon. Distance also darkens (lowpass "air"). Five fixed pan lanes per bus keep a one-shot to two nodes.
- **Data bindings are honest.** DEWS → storm/gust/rain/snow/howl/whistle/thunder (via `weather` service + `onLightning`); stale fog → foghorn *only* (`fog > 0.5`); Mint activity → press rhythm. Season and hour are decorative (birds, dusk crickets, cicadas 11–19 h in summer, autumn rustle, snow crunch).
- **Mix hygiene is good:** 3 s master fade-in, glue compressor + soft-clip curve, thunder duck on weather beds, slap-back for far events, max three thunder rolls, `lean` tier drops costly storm layers, `reduced` turns thunder into a far soft roll.
- **Weak / missing:**
  - Quarters that *move visibly* are silent: the **Shipyard** (shipwrights hammer, treadwheel cranes turn — `civic/shipyard.ts`), the **Burn** furnace (fire + plume ∝ burn volume — `civic/burn.ts`), **Wreck Cove**, the moving fleet.
  - The **Pharos beam (PSI)** — the world's central signal — has no voice; only the fire crackle near the lantern.
  - Time of day is a blunt `night` scalar: no dawn chorus, no deep-night layer outside summer-ish crickets, no harbour bells/hours.
  - No UI foley (panel open/close, ledger, chart pins).
  - Long-watch fatigue: density and level are constant for as long as the tab is open; no idle settle.
  - Spatial is stereo-only (no front/back cue); `TICK_MS = 120` scheduler + 4 Hz feed is cheap, but the bank holds **~18 MB of PCM** (`bank.ts` comment) — a real cost on 8 GB Apple Silicon tabs.

## 2. Ideas

### A1 The Shipyard's voice
- **What:** a new `shipyard` source (civic layout kind `shipyard` / slipway position, like `mint`). Three new procedural kinds in `dsp.ts`: `mallet` (wood-on-wood thock: short noise burst through two resonant bandpasses ~180/620 Hz), `adze` (brighter chip), `saw` (sawtooth-modulated bandpassed noise strokes in pairs). Workers' strokes at an irregular human rhythm (2–5 strokes, pause); a treadwheel crane's slow wooden groan (reuse `creak` at rate 0.7).
- **Why magical:** zoom toward the slipways and the yard comes alive under your cursor; pull back and it fades into the harbour hum.
- **Data:** decorative mirror of existing visuals; optional density ∝ number of hulls on the building berths (`civic.shipyard.length`, DOM = the Slipway panel). No new claim.
- **Where:** `controller.ts gatherSources/feed`, `ambience.ts` (bus + scheduler block like the Mint), `dsp.ts`, `bank.ts PLAN/RATE` (LAZY until `shipyard > 0.02`).
- **Cost:** S–M. 3 kinds × 3 variants × ~1 s @ 16 kHz ≈ 0.3 MB; 2 nodes per stroke. Zero GPU.
- **Risk:** hammering is percussive — keep level ≤ Mint presses, lowpass when far, silent at night (yard closed: `night > 0.6`).

### A2 The Burn furnace roars with the burn
- **What:** a `burn` source whose bed reuses `crackle` clips at rate 0.75 (deeper) plus a bellows breath every 3–5 s; level ∝ `civic` burn activity (expose `burnRate` beside `mintRate`). `?stale=mintBurn` already banks the fires visually — the roar drops to embers too.
- **Why magical:** the Mint clanks, the Burn breathes — the two halves of supply flow heard as call and answer.
- **Data:** data-bound **mirror** of an existing visual (burn volume, `/api/mint-burn-flows`); DOM equivalent = the Burn panel. Not a new mapping.
- **Where:** `civic/civic-system.ts CivicService` (+`burnRate`), `controller.ts`, `ambience.ts`.
- **Cost:** S. No new clip kind; ~6 nodes.
- **Risk:** low; must fall silent on stale mint-burn data, never fake activity.

### A3 The beam's passing (PSI, heard)
- **What:** each time the lighthouse sweep (`lighthouse.sweepAngle()`) crosses the camera's bearing from the tower, a single very soft low "breath" — a sine+octave pad at ~A2 with 1.5 s attack, 4 s release, through the slap-back. Its **level/brightness follows the beam's reach** (the beam already = PSI), its interval is simply the beam's own period. Nothing when the lamp is unlit (`lit === false`).
- **Why magical:** the light passes over *you*; at night you feel the lighthouse breathing.
- **Data:** mirrors the existing beam signal exactly (no re-mapping); DOM equivalent = the PSI readout/panel. Do not add pitch-to-score — a pitch is too readable as "up/down = good/bad" and invites trading urgency.
- **Where:** `controller.ts` (read `lighthouse` + beam reach; needs a `reach` getter on `BeamService` in `beam/beam-system.ts`), `ambience.ts` new `beamBus`.
- **Cost:** S. 2 oscillators started per pass, stopped after release.
- **Risk:** rhythmic fatigue → ≤ −30 dBFS, heavily lowpassed by distance, ducked under foghorn; muted when fog > 0.5 (stale data owns the voice).

### A4 Day clock: dawn chorus, deep night, harbour bells
- **What:** replace the single `night` scalar in the bird/cricket math with an hour curve: **dawn chorus** (birds ×2.5 for 05–07 h, spring/summer), **noon hush**, **dusk** (existing crickets), **deep night** (a `owl` kind: two-note hoot, very rare ~1/90 s near groves; a `nightjar` churr in summer); a **temple/harbour bell** striking the world hours 06–22 (bronze: additive inharmonic partials 1, 2.0, 2.76, 5.4 with long decay — a new `tolling` kind, reuse `bell` synthesis with different partials), panned to the town.
- **Why magical:** you can *tell the hour with closed eyes*; the bell at 18:00 lands with the dusk palette.
- **Data:** decorative (time of day is declared decorative). The hour bell must follow world hour `ctx.timeOfDay.hour`, including `?t=`.
- **Where:** `ambience.ts` season block + scheduler, `dsp.ts` (`owl`, `tolling`), `bank.ts` LAZY.
- **Cost:** S–M; ~0.5 MB PCM.
- **Risk:** bell must be soft and far (slap-back, lowpass 2 kHz); one strike per hour, no counting peals (16 tolls at 16 h would be a jolt) — a single toll, three at noon at most.

### A5 Titan arrival conch
- **What:** when one of the four Titans (`fleet/titans.ts`) docks, a soft distant conch/salpinx call (sine through formant bandpasses, gentle vibrato, 2.5 s), placed at its berth's pan and distance. Rate-limited to one per 3 min.
- **Why magical:** the big ships are *announced*, like a real harbour.
- **Data:** event mirror of a visible docking (sim already counts `stats.dockings`); needs a `sim.onDock(cb)` emitter with coin id. DOM equivalent = the ship's panel/ledger "docked" state. Decorative-ish; does not assert anything new.
- **Where:** `sim/sim.ts` (emitter), `controller.ts` subscribe like `onLightning`, `ambience.ts`, `dsp.ts conch`.
- **Cost:** S–M (emitter is the only engine touch).
- **Risk:** must not feel like a trading "ding": low register, slow attack, far reverb, never louder than gulls.

### A6 Wreck Cove: the hush and the anniversary bell
- **What:** near `layout.wreckCove.polygon` the mix *thins* (gulls ×0.3, laps lowpassed, a hollow wind through ribs = bandpassed noise at 240 Hz Q 6). On a dead coin's `deathDate` anniversary (`shared/types/core.ts` `deathDate`), once per visit, a single low bronze bell from the cove (reuse A4 `tolling` at rate 0.6).
- **Why magical:** a memorial you *hear* as quiet; the anniversary bell is a small, dignified ritual.
- **Data:** the bell is data-bound (`deathDate`) → the Wreck Cove panel must show "anniversary today" when it rings. The hush is decorative.
- **Where:** `controller.ts` (cove source + model access), `ambience.ts`.
- **Cost:** S.
- **Risk:** truth — ring only when the panel says so; at most one ring per session.

### A7 Paper-and-wood UI foley
- **What:** tiny procedural ticks, only while sound is on: panel open = soft parchment unroll (shaped pink-noise sweep 120 ms), close = wooden latch tick, ledger page = paper flick, ship pick = a faint rope creak. All ≤ −24 dBFS, no hover sounds (hover is too frequent).
- **Why magical:** the chart UI feels like a physical portolan on a chart table.
- **Data:** none (UI feedback). Respects D13 (sound off = silent).
- **Where:** a tiny `sound.cue(name)` on `SoundController`; call sites in `src/harbour/ui/**` panel open/close. Cues synthesised in `dsp.ts` (`tick`, `unroll`).
- **Cost:** S; <20 KB PCM.
- **Risk:** must not leak into the main chunk — cues route through the lazy controller and no-op when `!playing`.

### A8 The ten-minute settle (long-watch mix)
- **What:** an attention envelope in `controller.ts`: after 3 min without pointer/keys, master eases −3 dB over 60 s and event rates (gulls, laps between swells, halyards) thin by ~30 %; any interaction restores in 2 s. Also cap simultaneous one-shots globally (e.g. 24 voices) and add slow ±1.5 dB "breathing" of the whole bed over 2–4 min so the scene never feels stationary.
- **Why magical:** the harbour seems to settle into the visitor's attention instead of looping at them.
- **Data:** none.
- **Where:** `controller.ts` (idle timer, `inputs.attention`), `ambience.ts` (rate/level multipliers).
- **Cost:** S. Reduces CPU over time.
- **Risk:** none; it's the calm non-negotiable made audible.

### A9 Front/back cue and altitude mix
- **What:** sources *behind* the listener's look direction (dot with camera forward < 0) get an extra lowpass (−6 dB above 3 kHz) — cheap pseudo-HRTF without `PannerNode` HRTF cost. At far zoom (> 0.8) crossfade in a thin "high air" bed (very quiet broadband wind) and reduce point sources further, so overview = the sea's breath, heart view = the quay's detail.
- **Why magical:** zooming feels like descending from a cliff top into the harbour.
- **Data:** none.
- **Where:** `controller.ts feed()` (forward vector from `matrixWorld.elements[8..10]`), `ambience.ts` per-bus lowpass targets (already exist for most buses).
- **Cost:** S; 0 new nodes for buses that already have a lowpass.
- **Risk:** low.

### A10 Town voices
- **What:** near the town (`I.town`), by day a distant murmur bed (several detuned bandpassed noise "formant" streams, AM at syllabic 3–5 Hz, heavily lowpassed — unintelligible, no words); in the evening (19–22 h) now and then a short lyre phrase from a window (A11's Karplus-Strong), panned to the nearest lit window.
- **Why magical:** the town is inhabited without showing a single person or a speech bubble.
- **Data:** decorative.
- **Where:** `ambience.ts`, `dsp.ts` (`murmur` lazy loop, `lyre`).
- **Cost:** S–M.
- **Risk:** "decorative lore/roleplay" anti-reference — keep it ambient texture, never voices you can parse.

### A11 Generative modal music (separate opt-in)
- **What:** an optional music layer *inside* the sound toggle (a second state: off → ambient → ambient + music; or a long-press/menu), off by default even when ambient is on. Karplus-Strong lyre (plucked string = delay-line noise burst, ~40 lines in `dsp.ts`), a breathy aulos (filtered saw + noise), soft frame drum on rare downbeats. Dorian on D by day, Phrygian at night; a phrase every 20–60 s, long rests (≥ 60 % silence), seeded by the world day so a visit has a "piece".
- **Why magical:** the diorama gets a soundtrack that feels found, not composed for you.
- **Data:** **decorative only.** Do NOT tie mode/density to DEWS/PSI ("market calm" seeding would be a new analytical cue with no DOM equivalent and invites mood-reading the market). Weather may *mute* it (storm ≥ WARNING, rain) because the scene already says so.
- **Where:** `ambience.ts` or a sibling lazy `music.ts` (own dynamic import), `SoundToggle.tsx`, `controller.ts` key `harbour.sound` → tri-state.
- **Cost:** M. Lyre notes rendered to the bank (12 pitches × 2 variants × 2 s @ 24 kHz ≈ 2.3 MB) or played live via `AudioWorklet` (more CPU).
- **Risk:** taste/fatigue; tri-state UI must keep accessible labels (`aria-pressed` won't fit a tri-state — use a menu button).

### A12 Passing hulls
- **What:** when a ship under way passes within ~60 m of the listener, a bow-wash swish (reuse `lap` at rate 1.2, longer) and a sail flap (new `flap` kind) panned with its motion; at most two per 10 s.
- **Why magical:** the fleet has *physical* presence as it slides past the camera.
- **Data:** decorative mirror of sim motion.
- **Where:** `controller.ts` needs ship positions (fleet/sim service), `ambience.ts`.
- **Cost:** M (iterating hulls at 4 Hz is cheap, but needs a positions accessor).
- **Risk:** density in a busy harbour (7–16 dockings/min) — strict rate limit.

### A13 Halve the PCM bank
- **What:** cut the ~18 MB bank: drop to 2–3 variants for low-salience kinds (reef, rumble, crunch), store mono where the clip is panned anyway (gull, bell, halyard, creak, press — stereo width comes from the lane), lower `RATE` for dark kinds (lap 16 kHz, crackle 16 kHz). Target ≤ 8 MB, which pays for A1–A6.
- **Why magical:** enabler — more voices for the same memory.
- **Where:** `bank.ts PLAN/RATE`, `dsp.ts` (mono `Clip`).
- **Cost:** S. **Risk:** subtle quality loss; A/B by ear.

## 3. Top picks (impact ÷ cost)

1. **A1 The Shipyard's voice** — the most visible silent quarter; pure decorative mirror, fits the Mint pattern, tiny bytes.
2. **A3 The beam's passing** — gives the world's central signal (PSI) a calm voice without re-mapping it; the single most "magical" moment at night.
3. **A4 Day clock** — dawn chorus, owls and an hour bell make time of day legible by ear at near-zero cost.
4. **A8 The ten-minute settle** — directly serves the calm/ten-minute-watch goal and *lowers* CPU over time.
5. **A2 The Burn furnace** — completes the mint/burn call-and-answer with no new clip kind and an existing data source.

(A13 is the enabler to schedule first if A1–A6 land together.)

## 4. Cross-vertical hooks

- **Civic / town vertical:** A1/A2 need stable shipyard/burn positions in layout and a `burnRate` on `CivicService`; any new animated civic prop should declare a sound source.
- **Lighthouse/beam vertical:** A3 needs `BeamService.reach` getter and stable `sweepAngle()`; if the beam's look changes (pulse, colour), the breath should follow the same envelope.
- **Sky/time-of-day vertical:** A4 should key off the same dawn/dusk curve the sky uses (shared helper, not a second definition).
- **Weather/ocean vertical:** any new DEWS visual (spray, swell height) should share the `weather.state` fields the audio already reads; storm muting of A11 music.
- **Fleet/sim vertical:** A5/A12 need `sim.onDock` and a positions accessor; Wreck Cove vertical owns the "anniversary today" DOM line for A6.
- **UI vertical:** A7 cue call sites; A11 tri-state toggle design and labels.

## Notes on policy

- **Autoplay:** keep the current gesture-only `AudioContext`; new layers add no new start path. A11's extra state must also start only from a click.
- **Reduced motion:** keep thunder softening; additionally skip A12 swishes and A3's breath attack < 1.5 s. Sound stays opt-in, so reduced motion need not silence it.
- **Bundle:** everything stays procedural in the lazy `ambience` chunk; no samples, no licensing. If Opus/OGG were ever needed (e.g. a real lyre), lazy-fetch from `public/harbour/audio/` at < 30 KB each, CC0 only — not recommended.
- **CPU:** scheduler is 120 ms ticks; new layers must be bus-gated with `LazyLoop`/`need()` so silent layers cost nothing.

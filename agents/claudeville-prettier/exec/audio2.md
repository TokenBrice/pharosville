# Lane AUDIO-B (Round B): exec notes for the orchestrator

## Changelog bullets (user-facing)

- Sound is one click again: the speaker turns sound on or off (back to what you last chose), and the small caret beside it opens the menu where you can add the music.
- The wind you hear is the wind you see: its gusts are the same cat's-paws that run across the water and heel the ships, felt where you are looking.
- Thunder before the storm: when a storm front rises over the horizon, two far, low rolls come from the side the weather is coming from, before its rain arrives.
- The harbour marks its moments by ear, softly: a new coin's launch rings the bell buoy twice; a coin towed to Wreck Cove gets one low bell from the cove; a titan (USDT, USDC, USDe, USDS) coming home to her berth sounds a far conch, at most once every three minutes. A ship going on or off the Shoals makes no sound.
- Ships passing close by sound as they pass: the hiss of a bow wave going by and a short shake of canvas.

## Legend lines

None. Every new cue is decorative, or the sound twin of a moment that is already staged and written in the Day book.

## Truth notes (D11)

- Launch bell and cove bell fire only from `events.onMoment` (staged moments, already budgeted by `moments.ts`; nothing under reduced motion; never on first load). The Day book entry is the DOM twin. Depeg and recovery are silent by decision: a bell for a depeg would sound like an alarm, and the bell buoy already rings at random, so a "barely there" one would carry no meaning.
- Conch: sim `docking` events for the four `TITANS` ids. It is a sound mirror of a hull you can see berthing (motion, not data). `CONCH_GAP_SEC` is 180, and it is skipped while `events.current` is staged. Test: `controller.test.ts` "the conch".
- Front thunder: `weather.state.front` rising by at least `FRONT_MIN`, toward a level whose `targetsForLevel(to).strikesPerMin` is above 0 (Warning and up, the same rule as the sky's lightning), and only while `progress < FRONT_HERE[0]`. Rolls at progress 0.07 and 0.21. Goes through `thunder()` caps and reduced-motion softening. Test: "thunder ahead of a storm front".
- Gusts: the field's shape is decorative. Its effect is scaled by the DEWS wind (`gustSwell`). Test: "the shared gust field".

## Hooks / merge notes

- **Evening gun (no owner found):** the SIGNALS branch has no evening gun or puff. I exposed `getSoundController(ctx).cue("evening-gun")`. Call it at the moment of the visual puff; the dull report plays `EVENING_GUN_DELAY` (1.2 s) later. It is a no-op unless sound is playing. Nothing calls it yet.
- Passing hulls read `sim.pose` (`count`, `position`, `heading`, `speed`, `phase`), which is already public, so `sim.ts` was not edited.
- `SoundToggle.tsx`: the speaker is now `aria-pressed` with the label "Sound". The new `.hb-sound-more` caret holds `aria-haspopup="menu"`. Any test that looked for the speaker's old `aria-haspopup` must target `.hb-sound-more` instead.
- `localStorage harbour.music` is no longer cleared by "off". It remembers the last sound choice for the one-click toggle.

## Levels (offline, clip peak/loudest 50 ms after bus and master, before the glue compressor)

bell buoy −24.8/−33.2 · near lap −19.1/−32.2 · hour bell −30.7/−38.5 · conch (0.85) −31.8/−37.6 · evening gun −30.6/−38.8 · bow wash (closest) −27.1/−37.2 · sail flog −35.4/−48.0 dBFS. An in-page OfflineAudioContext render of the full graph with every cue gave no NaN and DC ~1e-4 (the bed). Each cue rose ≤ 4–5 dB over a ~−30 dB RMS bed.

## Dev

No new URL params. Use the existing `?moment=launch`, `?moment=death:<id>`, `?front=warning` and `?simevent=launch`. Turn sound on first; it needs a click.

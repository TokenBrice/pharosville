# Lane AUDIO — exec notes (for the orchestrator)

## Changelog bullets (user-facing)

- Sound has three states now, from the speaker's small menu: off, ambient sound, or ambient sound and music. Music is off unless you pick it.
- Optional music: a quiet lyre and aulos in the old modes (Dorian by day, Phrygian at night), mostly silence, a new piece each day. It stops in storms and rain.
- The Shipyard is heard by day: mallets, an adze, a pit saw and the crane's treadwheel; the yard is quiet at night.
- The Burn's furnace roars and breathes with the day's burning, answering the Mint's presses; it falls silent when the mint-burn data is stale.
- The lighthouse beam breathes softly each time it sweeps past you; fuller when its reach is long, never when the lamp is unlit or stale fog lies on the water.
- The day has a clock: a dawn chorus in spring and summer, a noon hush, owls in the deep night, a nightjar on summer nights, and one soft harbour bell on each hour from 06 to 22 (three at noon).
- Wreck Cove is quieter: fewer gulls, darker water, wind through the ribs. On a dead coin's anniversary a low bell rings once from the cove, and the cove's panel says so.
- Panels and the ledger make small paper-and-wood sounds while sound is on.
- After a few idle minutes the harbour settles: a little quieter and sparser, back in two seconds when you move.
- Lighter sound: the clip bank uses less than half the memory (18 → 7.6 MB).

## Legend line (Ledger)

- **Anniversary bell** — a low bell from Wreck Cove, once per visit, when today is the death-date anniversary of a dead coin (full YYYY-MM-DD dates only); the Wreck Cove panel shows "anniversary today".

## D11 cue record

- Anniversary bell: source `readings.wrecks[].deathDate`; threshold: same local month and day as a full death date in an earlier year (month-only dates never qualify); panel line "‹SYM› died on this day in ‹year›: anniversary today."; test `controller.test.ts` "Wreck Cove's anniversary bell". Only one coin (2024-04-22) has a full date today.
- Burn furnace: mirror of `civic.burn.activity` (new add-only `CivicService.burnRate`); 0 when `banked`/stale (`burnRateOf` test).
- Beam breath: mirror of the beam's reach (`beam.reach?.()`, else `readings.psi.reach`); nothing unlit; muted under stale fog; no pitch-to-score.

## Dev params

`?today=YYYY-MM-DD` (dev only: the visitor's date for anniversaries and the day's music seed). Existing `?t=…&speed=…` makes the hour bell strike; `?stale=mintBurn` / `?burn=` drive the furnace.

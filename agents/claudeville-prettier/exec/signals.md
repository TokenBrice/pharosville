# Lane SIGNALS (Round B) — exec notes

## Changelog bullets (user-facing)

- Storm signals at the masthead: each of the five worst early-warning (DEWS Alert or worse) coins flies the Storm Station's shape over her own masthead — a cone at Alert, a drum at Warning, a cone over a drum at Danger. Early warning, not a depeg.
- Dressed overall: a coin new to the register this week, or launched while you watch, sails with a line of signal flags in her colours from bow to masthead to stern (a launch for her first circuit).
- Harbour offices read the month: a chain whose stablecoin supply grew 8 % or more over 30 days has building works against its office — scaffolding, a treadwheel hoist turning slowly, stacked ashlar and a half-built bay; one that shrank 8 % or more has its awnings rolled up. Hover the harbour for the figure.
- When a coin is confirmed off its peg, the reef beacon's fire flares three times, softly; the Storm Station's shapes are hauled up hand over hand; a flagship coming home breaks out her house flag.

## Legend lines

- Storm signal at a masthead — one of the five worst early-warning (DEWS Alert+) coins: cone Alert, drum Warning, cone and drum Danger. Early warning, not a depeg. (as DATA's)
- Bunting (dressed overall) — new to the register this week (no supply on record a week or a month ago), or launched during your visit (first circuit).
- Harbour office under works / awnings rolled up — the chain's stablecoin supply over 30 days, ≥ +8 % (held to +6 %) / ≤ −8 % (held to −6 %); not the 24 h movers flags.
- Reef beacon flare — three soft flares when a coin is confirmed off its peg (two readings in a row); recorded in the Day book.

## Sources, thresholds, DOM (D11)

| Cue | Source · threshold | Hover / panel | Test |
|---|---|---|---|
| Masthead signal | `readings.stormFlags` (DATA: band ≥ ALERT, ≤ 5 worst) | boat hover "signal hoisted: early warning, not a depeg"; Boat panel Signals row | `fleet/signals.test.ts` (vocabulary, hoist), DATA's cues tests |
| Bunting | `readings.maidens` (DATA's strict rule) + sim `launch` until first `docking` (≤ 20 min) | hover "dressed overall: new to the register this week" / "dressed overall: launched today"; Boat panel maiden caption | `fleet/signals.test.ts`, `ui/ui.test.ts` |
| Office works / furled | `readings.offices` (bind.ts; furled now has hysteresis: enter ≤ −8 %, leave > −6 %) | harbour hover appends the chain panel line ("office under works: supply +12.0% over 30 d") | `model/cues.test.ts`, `identity/identity.test.ts` |
| Reef flare | staged `depeg` moment (events service) | Shoals panel line | `life/moments-stage.test.ts` |

## Dropped / skipped (and why)

- DA-08 half-mast memorial pennant: not cheap — the cove's pennants are a baked prop with no mast to lower on; Wreck Cove already marks a fresh death with the wreath (90 d), and a second freshness cue on a 7-day window would double-encode it.
- Recovery gulls lifting off the reef: the gull system has no perches on the reef (perches = chimneys, pier lights, cove hulks). Skipped as allowed.
- PSI band change: nothing added — the Pharos's rhythm already eases and the beam is the PSI; staging it on the storm station would re-map a signal.
- Evening gun: there is no battery terrace in this harbour (no node, plot or layout entry); inventing one is out of this lane's scope.
- Furled office shutter: the furled awning alone reads clearly on real frames; a shutter would need per-office door geometry.

## New URL params

None (uses DATA's `?stormflags=`, `?maiden=`, `?office=`, `?moment=`).

## Merge hazards

- `events.onMoment` fires inside the readings system's update; a system that subscribes in its own `update()` misses a moment staged that same frame (the dev `?moment=` one always). `moments-stage.ts` polls `events.current` instead; AUDIO-B should do the same or subscribe in `init()`.
- fleet-system.ts: new hunks (mast signals + bunting sync/hull/end/dispose, sim.onEvent subscription, titan flag breakout, burgee lift above the signal).
- identity/offices.ts: awnings no longer go through mergeStaticMeshes; their own merged mesh `offices-awnings`. `officePlots()` gains `rot`.
- readings/storm-cones.ts: shape helpers exported; hoist now hauled (rate × rhythm).
- New system order: `identity → office-works → moments-stage`.
- public/harbour/civic/manifest.json gains `office-works` (merged with `--only`).

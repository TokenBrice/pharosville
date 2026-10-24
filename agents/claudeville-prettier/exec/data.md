# Lane DATA — exec notes (changelog bullets, legend lines, model fields)

## Changelog bullets (user-facing)

- The tide gauge speaks. Hover it for the week's change in all stablecoin supply; click it for a panel with the 24 h, 7 d and 30 d figures, the gauge's scale and its freshness. Only the 7-day figure moves the water.

## Legend lines

- Tide gauge — the 7-day change in all stablecoin supply (/api/chains), square-root scale, full height at ±2 %.

## Model fields for other lanes

- `model.readings.tide: { change24h, change7d, change30d, available, stale }` — FRACTIONS from `/api/chains globalChange{24h,7d,30d}Pct`; null when absent/non-finite.

## F-events (`src/harbour/model/events.ts`)

- `detectEvents(prev: EventState | null, next: EventSnapshot, { confirmPolls = 2 }) → { state, events: HarbourEvent[] }` — pure.
  `eventSnapshot(model, payloads, atMs)` builds `next`. Events are CONFIRMED changes (D-4: held for 2 consecutive
  accepted polls of the endpoint); the sim still reacts at once. A stale new poll breaks a run; a rebuild without a
  new fetch time is not a poll. First accepted reading per endpoint = silent baseline. Methodology version change
  (endpoint envelope or a row's `methodologyVersion`) = silent re-baseline. Coverage gaps (a reading that appears
  or disappears) are silent.
- `HarbourEvent { id, kind, atMs, firstSeenMs, endpoint, coinId, symbol, field, from, to, text, dev? }`,
  `kind ∈ depeg | recovery | launch | death | psi-band | dews-band | flow-hour | hull-class | grade`.
- Flow hour: latest closed hour's mint or burn ≥ `FLOW_HOUR_MIN_USD` ($100M) AND ≥ `FLOW_HOUR_MEAN_X` (3) × that
  side's mean over the window's hours (spike included), valuation `"complete"`. Judged once per new hour; exempt
  from the 2-poll rule (a closed hour is a final record, not a flickering state).
- `dayBookLine(e, "14:20")` → `"14:20 USDX left the Shoals · 412 → 18 bps"`.

## Rarity scheduler + `events` service

- `model/moments.ts` `stepMoments(state, nowMs, incoming, { reduced }) → { state, staged, unstaged }` — pure.
  Priority (`MOMENT_PRIORITY`): death 6 > depeg 5 > recovery 4 > launch 3 > psi-band = dews-band 2 > flow-hour 1;
  hull-class and grade are never staged. `MOMENT_GAP_MS` 3 min, `MOMENT_HOUR_MAX` 6 per rolling hour,
  `MOMENT_MAX_MS` 20 s (`MOMENT_DURATION_MS` per kind), one queued (highest priority), queued expires after
  `QUEUE_MAX_WAIT_MS` 3 min. Reduced motion → nothing staged.
- Service `ctx.services.get("events") as EventsService` (`model/event-hub.ts`), registered by the readings system:
  `book: DayBookEntry[]` (newest first, `staged` flag, cap 200), `arrivedAtMs`, `current: StagedMoment | null`,
  `version`, `subscribe(fn)`, `onMoment(fn: (m: StagedMoment) => void)`. `StagedMoment { event, startMs, endMs }`:
  the world must be back at rest by `endMs`.
- Dev: `?moment=<kind>[:<coin id>]` injects one synthetic `(dev)` event through the book and the budget once the
  fleet is in (e.g. `?moment=depeg:usdt`, `?moment=launch`).

## Day book (Harbourmaster panel)

- Changelog: The Harbourmaster keeps a Day book. Every confirmed change since you arrived (a coin onto or off the Shoals, a launch, a wreck, the Pharos's band, the weather, a big hour at the Mint or the Burn, a hull class or a grade) is entered with its time, coin, and old → new value, once a second reading in a row confirms it.

## D-3 cues — model + DOM (rendering is another lane's)

Render from the `readings` service (dev overrides apply there); the Boat/model fields are the panel's truth.

### DA-04 storm signals at the masthead
- Model: `model.readings.stormFlags: StormFlag[]` (`{ id, symbol, band, score, shape }`), `Boat.stormSignal: StormSignalShape | null`.
  Readings service: `readings.stormFlags`. `StormSignalShape = "cone" | "drum" | "cone+drum"` (ALERT / WARNING / DANGER,
  `STORM_SIGNAL_SHAPE` in `model/readings.ts`). Live coins at `stress.signals[id].band` ≥ ALERT, worst `score` first
  (supply breaks ties), ≤ `STORM_FLAGS_MAX` 5. `[]` when /api/stress-signals is not current.
- DOM: hover `boatFact` appends "signal hoisted: early warning, not a depeg" (on a coin also off peg: "signal hoisted:
  early warning; the Shoals tell the depeg"); Boat panel Signals row "Storm signal: a cone and a drum at the masthead, …";
  a sixth+ ALERT coin reads "none at the masthead: only the five worst early-warning scores hoist one".
- Legend: "Storm signal at a masthead — one of the five worst early-warning (DEWS Alert+) coins: cone Alert, drum Warning, cone and drum Danger. Early warning, not a depeg."
- Dev: `?stormflags=N`.

### DA-07 maiden voyage
- Model: `Boat.maiden: boolean`; readings service `readings.maidens: string[]` (ids). Rule (`isMaiden`): `circulatingPrevWeek`
  absent/0 AND `circulatingPrevMonth` absent/0 AND `circulating` > 0 AND /api/stablecoins current AND the feed-wide share
  of coins lacking a week-ago supply ≤ `MAIDEN_MAX_GAP_SHARE` (2 %).
- WARNING (truth): on the live feed of 2026-10-24, 83 of 624 coins (13 %) have no week-ago bucket, PAXG ($1.77B), USYC
  and USDY among them — a producer gap, not launches. The literal approved rule would call PAXG "new". With the gap guard
  the cue is dark today and lights only when the producer fills `circulatingPrevWeek`. Operator decision needed.
- DOM: Boat panel Supply caption "Maiden voyage: new to the register this week, with no supply on record a week or a month ago."
- Dev: `?maiden=N` or `?maiden=id,id`.

### T6 chain office
- `officeWorks(change30dPct, prev, current)` in `readings/bind.ts` (`change30dPct` is a FRACTION): "works" at ≥
  `OFFICE_WORKS_ON` 0.08, held while ≥ `OFFICE_WORKS_HOLD` 0.06; "furled" at ≤ `OFFICE_FURL_ON` −0.08 (no hysteresis on
  furled, as specified); "neutral" between and whenever /api/chains is not current. Readings service
  `readings.offices: Record<chainName, "works" | "furled" | "neutral">` (hysteresis carried build to build).
- DOM: chain panel (piered chains with an office) "Office under works: supply +12.0% over 30 d" / "Awnings furled:
  −10.2% over 30 d", plus "a 30-day horizon, unlike the Harbourmaster's flags for the last 24 h". Live today: Hyperliquid L1 furled.
- Legend: "Harbour office under works / awnings furled — the chain's stablecoin supply over 30 days, ≥ +8 % / ≤ −8 % (not the 24 h movers flags)."
- Dev: `?office=Ethereum:works,Tron:furled`.

### Changelog bullets
- Each Alert coin's own ship can now fly the storm signal: the model names the five worst early-warning coins and the shape each flies, and the hover and record say "signal hoisted: early warning, not a depeg".
- Harbour offices read the month: a chain whose stablecoin supply grew 8 % or more over 30 days is "under works", one that shrank 8 % or more has its awnings furled, and the harbour's record says so, on a different horizon from the Harbourmaster's 24-hour flags.

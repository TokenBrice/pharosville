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

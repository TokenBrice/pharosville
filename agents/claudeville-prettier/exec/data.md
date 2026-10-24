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

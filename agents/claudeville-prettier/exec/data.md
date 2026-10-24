# Lane DATA — exec notes (changelog bullets, legend lines, model fields)

## Changelog bullets (user-facing)

- The tide gauge speaks. Hover it for the week's change in all stablecoin supply; click it for a panel with the 24 h, 7 d and 30 d figures, the gauge's scale and its freshness. Only the 7-day figure moves the water.

## Legend lines

- Tide gauge — the 7-day change in all stablecoin supply (/api/chains), square-root scale, full height at ±2 %.

## Model fields for other lanes

- `model.readings.tide: { change24h, change7d, change30d, available, stale }` — FRACTIONS from `/api/chains globalChange{24h,7d,30d}Pct`; null when absent/non-finite.

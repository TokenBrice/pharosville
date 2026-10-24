# Lane CAMERA — changelog bullets and legend lines

## Changelog (user-facing)

- Camera moves now glide: fly-to and Home ease in and out on a minimum-jerk curve, take longer for longer hops and lift gently on long flights. Pressing Home when already home answers with a small push-in.
- The harbour wakes: the first view drifts in from slightly further out as the poster dissolves, while the Pharos fire is kindled up to its live reading. Any input lets go. Skipped with reduced motion.
- The mouse wheel zooms where you point. New keys: arrows pan, + / − zoom, [ and ] step through the ships in view (largest first), F follows the selected ship while she sails, P makes a postcard, W starts the harbourmaster's watch. All keys are listed at the foot of the ledger's Legend tab.
- Hover feels physical: a ship's lantern answers with a small warm pool at night and a soft sheen on her sails by day; buildings now answer the pointer too (a brass edge by day, brighter windows at night).
- Selecting a ship pencils her route on the water: today's rounds (from supply share), with a brass mark at each port of call.
- The side panel and the ledger unroll like chart paper.
- Postcard (P): a framed, dated print of the harbour with the Pharos Stability Index and a freshness line (which says so when readings are stale). Save or close.
- After three minutes of stillness the view breathes gently. The opt-in watch (W) visits the day's notable ships (biggest 24 h supply change, worst depeg, newest coin) for about 20 seconds each.

## Legend lines (for the Ledger LEGEND array; not edited by this lane)

- **Route line** — "A selected ship's dashed line is today's rounds." Her plan between the chains that hold her, docking longest where most of her supply sits (from supply share). Brass marks are her ports of call. Not a forecast.
- **The watch (W)** — "Visits the day's notable ships." Biggest 24 h supply change (at least $1M), the worst coin off its peg now, the largest coin new to the register this week. Never starts on its own.
- (Decorative) hover lantern, sail sheen, building rim, idle breath, drift-in on arrival.

## New URL params

- `?wake=1` forces the arrival drift-in in automated captures; `?wake=0` suppresses it (production: on, except under reduced motion or `navigator.webdriver`).

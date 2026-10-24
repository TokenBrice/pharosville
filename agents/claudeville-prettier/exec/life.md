# Lane LIFE — exec notes (Wave 6 life: 09-L1/L2/L3/L4/L6/L7, 08-T5/09-L9)

## Changelog bullets (user-facing)

- The town keeps its own hours: anglers with rods along the quay edge at dawn, vendors at the Customs market stalls in
  the morning, couples strolling the moles at dusk, and a night watchman with a lantern on the quays after 11 pm.
- Between midnight and 4 am a single cloaked figure with a lantern walks the Pharos causeway and back.
- Now and then, in calm weather, a pod of dolphins rolls through the harbour mouth. Patient watchers may see one leap.
- Goats graze the meadows above the causeway and by the west-lobe farm, ambling a few steps at a time; at night they
  stand close together.
- Gulls follow ships as they cast off, and some stand on the mastheads of hulls at rest.
- Cats sit on the quay copings by day and doze there at night. In spring and summer, swallows hawk over the squares
  at dusk; on summer nights, fireflies blink over the gardens and hillsides.
- A donkey pulls a hay cart along the west lobe's farm road, led by a carter, and a shepherd with a crook walks the
  same road. Both are off the road at night.
- Storms thin all of this out: life withdraws from bad weather and never adds to it.

## Legend lines (decorative)

- Townsfolk, the keeper's walk, goats, cats, swallows, fireflies, the hay cart: decorative (time of day, season,
  weather). They carry no data.
- Dolphins: decorative and rare. They appear on a timer and only in calm weather (DEWS CALM/WATCH with a fresh
  reading). A data event never triggers them.
- Gulls trailing a departing ship: decorative. The ship is picked uniformly at random from those casting off, never by
  size, supply or flow.

## Truth notes

- No new analytical cue (D11 untouched). The only inputs are the hour, the season, the DEWS wind (`stormShare`: 1 up to
  WATCH, ≈0.35 at DANGER, monotone, tested: life only ever *withdraws*) and, for dolphins, the weather level plus
  stale fog (none on stale or unavailable data).
- Nothing new carries goods. The cart's load is a rounded hay mound, not crates or amphorae. The rod and the crook are
  tools.
- The cart road (`walkways.json` `cartway`: the west road's run through the farms) never joins two chain hamlets.
- The keeper has no name, panel, hover or interaction, and does not respond to PSI.
- Nothing new on the water looks like a vessel. Dolphins are small and grey, clipped at the waterline (back and fin
  only), and their foam ring uses the wake service's still-hull ring.

## Items

| item | state |
|---|---|
| 09-L1 roles by the hour | done: anglers (10), vendors (5), promenade pairs (6), watchman; same fixed cast |
| 09-L2 keeper's night walk | done |
| 09-L4 dolphins | done (1 draw) |
| 09-L3 goats + beasts kit | done (1 draw: herds = goats, cats, the cart) |
| 09-L6 gulls follow / mastheads | done (fleet hook) |
| 09-L7 cats, swallows, fireflies | done, 0 draws |
| 09-L8 / 05-P10 lamplighters | **dropped**: at heart distance (d = 650) folk are a few pixels and unreadable (09 report §1 + captures); a lamplighter would not read |
| 08-T5 / 09-L9 cart + shepherd | done, 0 draws |

## Cost (estimated; not measured on a quiet machine)

- Draws: life layer 6 → 8 (+ dolphins, + herds). No shadow casters added; herds receive shadows only.
- Tris: herds ≈ 410 tris/instance (all kinds merged; other kinds' parts collapse to degenerate triangles) × ~27
  instances ≈ 11k vertex-shaded, of which ≈ 2.7k rasterise. Dolphins 3 × ~100. Folk +3 sticks (rod, line, crook, ≈ 40
  tris) per figure ≈ +9k vertex-only (collapsed unless carried). Swallows +16 gull instances. Fireflies: no new
  instances (a 4 % band of the drift field).
- Bytes: `public/harbour/kit/life_beasts.glb` 23.8 KB (5 KB gz). `walkways.json` +~4 KB.
- CPU: 3 dolphin timers, ~27 beasts (goats random-walk with 4 height samples per new target), 16 swallow Lissajous
  curves, a pose-buffer scan for casting-off hulls every 30–70 s, 12 extra role walkers. Well under 0.05 ms.

## New surfaces / hooks (merge hazards)

- **Hot file `fleet/fleet-system.ts`** (add-only, 4 lines): imports `fleet/mastheads.ts`, registers the `mastheads`
  service, calls `mastheads.begin()` before the per-hull loop and `mastheads.set(i, …)` after `b.struck` is decided
  (at rest, not struck, not a titan, not wrecked, visible).
- `walkways.json` now carries `mole` paths, `stall` spots, `causeway`, `pastures` and `cartway`. Re-run
  `src/harbour/life/tools/export_walkways.py` (needs `outputs/harbour/island/{compose,occupancy,window_lights}.json`
  from the island build). Before these additions the output was byte-identical to the island lane's.
- `WalkKind` gains `"mole"` (KIND_WEIGHT 0.8). Mole promenades join the town network, so ordinary strollers use them too.
- The `life-system.ts` header budget is now ≤ 8 draws. Any later life draw needs a budget decision.
- Dev-only global `window.__harbourLife` (`import.meta.env.DEV`): role counts and positions, the life system and the
  camera rig, for captures.

## Dev URL params

- `?dolphins=now` (a pod every 20 s from 2 s in) · `?dolphins=<seconds>` (one pod frozen at that clock; still gated
  by the weather, e.g. `&dews=CALM`).
- `?gulls=busy` (a follow every few seconds; mastheads favoured).

## Open issues

- **Bundle**: `check:bundle-size` FAILS on this branch. The Harbour lazy chunk is 1,040.9 KiB raw / 361.6 KiB gzip
  against a budget of 1,020 / 352. This lane adds an estimated ~25–30 KiB raw / ~9 KiB gzip, mostly GLSL strings and
  the herds, dolphins and roles logic. The pre-lane baseline could not be measured here. The budget is the
  orchestrator's call; I did not raise it. All other checks are green: tsc, eslint, vitest src/harbour 382 passed,
  check:harbour-contracts, check:runtime-media, build.

- Fireflies are deliberately faint; on a busy summer night they may be too quiet. That is an art-review call.
- At heart zoom none of the new life is individually legible. This is by design (calm), but it should be confirmed at
  art review.
- Goats share the farm pastures with the island's baked sheep, so the flock reads as mixed.

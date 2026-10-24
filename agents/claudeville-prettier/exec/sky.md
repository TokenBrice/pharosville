# Lane SKY — changelog bullets, legend lines, hooks

## Changelog bullets (user-facing)

- One wind: the painted cloud banks and the high cirrus now drift the way the wind blows, the same way as the cloud shadows, smoke and flags; gusts briefly hurry the near banks.

- Storm decks are sculpted now: cold slate cells and rolls instead of a flat grey wash, with a pale strip of sunlit sky under the deck at the far horizon until Danger closes it. Heavy rain greys the distance in cold slate, heaviest on the side the weather comes from — never the warm white of the stale-data fog.
- Weather you can see coming: when the stress reading jumps, the new weather sweeps in from the upwind horizon — a storm front with a dark shelf-cloud lip, rain over the open sea first, and a cloud-shadow line crossing the water toward the island; when it eases, a clearing line opens the sky behind it. The Storm-signal panel says the same: "Rising toward Alert." / "Easing toward Watch.". No front on first load; reduced motion eases the weather in place.
- Sunbreaks: as rain eases off, or just after a recovery, the land and sea fall into cloud shadow with a few large sunlit patches drifting across, and faint shafts fan down from the sun through the gaps.
- Passing squalls at Watch and Alert: the passing shower is now a place — one darker cloud with its own rain curtain and shadow walks in from upwind, rains on the harbour at its crest and moves on.
- Lightning has a direction: a strike lights the faces of the town that look toward it, the lee sides stay dark (no brighter than before).
- Tonight's moon: the moon now shows its real phase for your date (crescent, half, gibbous, full; mirrored south of the equator), with faint earthshine on the dark limb. Its glow, its path on the sea and its light on the town follow the phase; on dark new-moon nights the stars come out and the harbour lamps carry the night.
- Moonbow: a recovery you watch at night, under a bright moon, hangs a faint silver moonbow over the harbour. The Storm-signal panel now records every recovery in words — "Recovered from Alert 3 min ago" — by day or night.

## Legend lines

- Weather front (sky sweeping in from one side): the DEWS stress reading moved by ≥ 0.35 of a band since the weather shown; Storm-signal panel "Rising toward <band>" / "Easing toward <band>".

- Rainbow / moonbow (recovery): the DEWS weather improved from Alert or worse to Watch or better during your visit; Storm-signal panel "Recovered from <band> N min ago" for the same 3.5 minutes.
- Moon (decorative): tonight's real phase.

## Hooks wanted from other lanes

- MOTION: `weather/gust.ts` — sky-system reads `windNow - wind` as the gust share for now (TODO(motion) in `sky/sky-system.ts`); swap to the shared gust field when it lands.

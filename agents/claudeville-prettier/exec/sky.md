# Lane SKY — changelog bullets, legend lines, hooks

## Changelog bullets (user-facing)

- One wind: the painted cloud banks and the high cirrus now drift the way the wind blows, the same way as the cloud shadows, smoke and flags; gusts briefly hurry the near banks.

- Storm decks are sculpted now: cold slate cells and rolls instead of a flat grey wash, with a pale strip of sunlit sky under the deck at the far horizon until Danger closes it. Heavy rain greys the distance in cold slate, heaviest on the side the weather comes from — never the warm white of the stale-data fog.
- Weather you can see coming: when the stress reading jumps, the new weather sweeps in from the upwind horizon — a storm front with a dark shelf-cloud lip, rain over the open sea first, and a cloud-shadow line crossing the water toward the island; when it eases, a clearing line opens the sky behind it. The Storm-signal panel says the same: "Rising toward Alert." / "Easing toward Watch.". No front on first load; reduced motion eases the weather in place.

## Legend lines

- Weather front (sky sweeping in from one side): the DEWS stress reading moved by ≥ 0.35 of a band since the weather shown; Storm-signal panel "Rising toward <band>" / "Easing toward <band>".

## Hooks wanted from other lanes

- MOTION: `weather/gust.ts` — sky-system reads `windNow - wind` as the gust share for now (TODO(motion) in `sky/sky-system.ts`); swap to the shared gust field when it lands.

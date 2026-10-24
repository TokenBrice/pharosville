# 04 — Sky, Weather & Seasons

Captures (real GPU, `npm run preview`): `shots/04-storm.png` (t=15 DANGER), `shots/04-winter.png`
(t=10 winter WARNING), `shots/04-clear-night.png` (t=23 CALM), `shots/04-rainbow.png` (t=16 rainbow=1),
`shots/04-stale-dawn.png` (t=7 autumn stale=1). Baseline `shots/day|dusk|night.png`.

## 1. Current state

- **The sky is a thin band.** The camera looks down; the painted band (`sky/sky-glsl.ts` `skyBand`) fills
  only about the top 15–18 % of the frame. Most weather therefore reads on the sea and land: cloud shadows
  (`sky/cloud-shadow.ts`), puddles and wet roughness (`world/materials.ts` `hbWeather`), splashes and spray
  (`weather/precip.ts`). Sky ideas should be weighed by how much of them reaches the 85 % of the frame below it.
- **The weather grammar is strong and honest** (`weather/director.ts`). There is no random weather. Cover,
  wind, gusts, steady rain and showers, lightning and gloom are piecewise tables over the continuous
  DEWS level. Precipitation, wetness and the rainbow have their own easing constants, and a recovery
  rainbow appears only for a recovery seen during the visit. The Storm-signal mast (`readings/storm-cones.ts`)
  repeats the same band.
- **The painted cumulus is good.** It is an 8-cell baked normal and rim atlas (`sky/clouds.ts`), lit per frame
  from the real key light, with backlit silver linings, lavender undersides at golden hour, and parallax depth layers.
- **The storm reads as a flat grey wash.** In `04-storm.png` the band is featureless slate, and the
  precipitation "visibility" greying (`c = mix(c, haze…, max(pr,ps)*0.22)`) plus gloom give it nearly the
  same value structure as a fog veil. Nothing shows that the storm came from somewhere. Dev overrides
  `snap()` straight to the target, and in live use `uStorm` fades in everywhere at once over about 25 s
  (`TAU.cloud`), so a visitor never sees a storm approach.
- **The stale fog is distinct and beautiful** (`readings/fog.ts`): rolling height-fog banks with clear
  lanes and haloed lamps (`04-stale-dawn.png`). It must stay the only low, banked, horizontal white veil in the world.
- **The night sky is generic.** The stars are a uniform hash grid with sine twinkle and no magnitude or
  colour structure, and there is no Milky Way. The moon is always full: a disc with noise maria at a
  fixed art-directed station (`sky-system.ts:296`). Nothing follows the real calendar or the real sky.
- **Wind is not consistent.** The ground wind `uWindVec` follows `sim.wind.fromRad`, and the cloud
  shadows drift along it. The painted banks and the cirrus, however, always drift +azimuth
  (`driftDeg` is always positive, `sky-system.ts:329`), whatever the wind direction.
- **Seasons are mostly ground-side:** foliage, snow cover, leaf and petal drift (`life/drift.ts`), sun
  tint and grade (`season/season-system.ts`), and snow share. The sky itself does not change character
  with the season: the same cumulus kinds and the same cirrus all year.
- **A recovery at night is invisible.** The rainbow needs `sunUp`, so a recovery the visitor watches
  at night shows nothing. The rainbow also has no DOM equivalent (no `rainbow` in `src/ui`), which is a D11 gap.

## 2. Ideas

### W01 Storm front you can see coming
**What:** Give the storm deck a direction of travel. Add `front` (0..1) to the director, derived from
`target − shown` level while the target is higher. In `skyBand`, `deckA` stops being uniform: it is masked by an
azimuthal sweep that starts at the upwind edge of the band (the sign comes from the wind vector projected
on the view, see W08) and moves across it as `shown` catches up. The leading edge gets a shelf-cloud lip:
a dark rolled band at e≈1–2.5° with a lit upper rim from `uCloudRim`. Ahead of the lip the old cumulus
stays sunlit. Rain shafts (`uPrecipSky`) hang under the deck's footprint first, out over the sea,
before local precip starts. The cloud-shadow field (`uCloudShadowK.x`) is made to darken from the same
upwind side, so the shadow line runs across the water toward the island. Recovery plays in reverse as a
clearing line: a strip of bright sky opens on the upwind horizon and widens.
**Why magical:** "Weather is coming" is the most cinematic thing a sky can do. It rewards a visitor
who keeps watching.
**Data/meaning:** It stays data-bound to DEWS, but it adds a trend cue (rising or falling). That is new
meaning, so it needs a DOM equivalent: the Storm-signal panel line "rising from Watch toward Alert" /
"easing". There is no front on load, because `snap()` keeps the first frame honest. Add a `?front=` dev param.
**Where:** `weather/director.ts` (`front`, `clearing`), `weather/weather-system.ts`, `sky/sky-glsl.ts`
(deck mask and lip), `sky/sky-system.ts` (shadow threshold sweep), the mast panel copy.
**Cost:** M. Two more uniform floats and about 15 ALU in the band shader (band pixels only). No draws or bytes.
**Risk:** Calm is fine, because it plays out over 25–60 s. Lengthen `TAU.cloud` toward 60 s for the front only.
Reduced motion: snap the deck in place, with no sweep.

### W02 Storm-deck structure (not fog-grey)
**What:** Make the ALERT+ deck read as cloud, not murk. Use a cell or roll texture under the deck from
the same noise (darker cores with paler seams, low-frequency rolls aligned with the wind). At ALERT and
WARNING keep a pale strip of clear sky under the deck at the far horizon (e≈0.2–0.8°), closing at DANGER.
Shift the precipitation greying toward cold slate-blue and keep it directional (heavier on the upwind side).
**Why magical:** Storms look sculpted and dramatic instead of dull. The bright horizon strip under a dark deck is the classic marine-painting light.
**Data/meaning:** DEWS, unchanged. The aim is semantic separation: storm = cold, structured, overhead and
directional; stale fog = warm-grey, low, banked, horizontal.
**Where:** `sky/sky-glsl.ts` (deck block, precipitation greying), `sky/palette.ts` (deck tint).
**Cost:** S. About 10 ALU in the band.
**Risk:** It must stay calm. No churning animation; the deck drifts at `windS` speed.

### W03 Sunbreaks: travelling sunlit patches and light shafts after rain
**What:** When precipitation is falling off (`precip` easing down; a shower trough at Watch or Alert; the
recovery window), invert the cloud-shadow field. Most of the island and sea go shadowed (strength up to
about 0.6), and two or three soft sunlit patches drift across with the wind, warmed by `uSunColor`.
In the band, add three to five faint crepuscular shafts fanning down from the sun's azimuth through
the deck's gaps: additive, `exp` falloff, masked by the deck noise.
**Why magical:** Constable and Turner light. A spotlight patch slides over the lighthouse and then the
town. It is the emotional payoff after a storm, and it pairs with the rainbow.
**Data/meaning:** It is the decorative aftermath of a DEWS easing, and it can only appear when the data
improved or between Watch showers, so it never contradicts the band.
**Where:** `sky/cloud-shadow.ts` (an invert or contrast param on `hbCloudShadow`), `sky/sky-system.ts`,
`sky/sky-glsl.ts` (shafts), `weather/director.ts` (an `aftermath` 0..1 output).
**Cost:** S–M. No new draws. The shadow function gains about 2 ALU everywhere it is already sampled; the shafts are about 8 ALU in the band.
**Risk:** It must not read as a "spotlight on one coin". Patches are large (feature size ≥ 400 m) and they drift.

### W04 Real moon phase (and its light)
**What:** Compute the synodic age from the visitor's date (`(JD − 2451550.1) mod 29.53`). Draw the disc
with a soft terminator plus faint earthshine on the dark limb. Scale the moon's halo, its sea glitter
(`uGlintCol` in `sky-system.ts:317`), its glow and `nightLift` by the illuminated fraction. Near new moon
the stars brighten (`uSkyK.w`) and the harbour lamps carry more of the night. Add a `?moon=<age>` dev param.
**Why magical:** "That's tonight's moon." It ties the toy to the visitor's real night, as the real-clock
sun already does.
**Data/meaning:** Decorative (real sky), like the time of day. An optional one-line almanac in the
legend ("waxing gibbous, 78 %") would be text on demand.
**Where:** `season/calendar.ts` (pure, unit-tested `moonAge`), `sky/sky-system.ts`, `sky/sky-glsl.ts` (moon block).
**Cost:** S. About 6 ALU on the disc pixels only.
**Risk:** At new moon the night gets darker, so `nightLift` keeps a floor to protect legibility. Southern
hemisphere: mirror the lit limb.

### W05 Milky Way and a real-feeling star field
**What:** Replace the uniform grid with two populations: a dense faint layer and sparse bright stars
with magnitude falloff and colour temperature (a few warm, a few blue). Add a painterly Milky Way: a
tilted band of low-frequency noise with dark dust lanes (two `uSkyNoise` taps). It is visible only on
clear (`cover < 0.3`), dark (moon illumination low, W04) nights, and its season gates which part shows
(the bright core in summer, faint in winter). Twinkle is stronger near the horizon and still under reduced motion.
**Why magical:** On a clear summer new-moon night the band arcs over the Pharos. It is rare and worth
coming back for.
**Data/meaning:** Decorative. The calm-only gate is natural (clouds hide it) and adds no meaning.
**Where:** `sky/sky-glsl.ts` (stars block), `sky/sky-system.ts` (gate).
**Cost:** S. About 12 ALU on band pixels at night. Bytes: none, because it reuses `uSkyNoise`.
**Risk:** The elevation compression (6.5° gradient span) distorts real constellations, so keep the band painterly, not an atlas.

### W06 Meteor showers on real dates
**What:** A pure `meteorRate(date, hemisphere)` table in `calendar.ts` with peak and width for the
Quadrantids (Jan 3–4), Lyrids (Apr 22), η-Aquariids (May 6, stronger in the south), Perseids (Aug 12–13,
northern), Orionids (Oct 21–22, this week), Leonids (Nov 17) and Geminids (Dec 13–14). Meteors appear only
at clear night and outside reduced motion. Each is one short additive streak drawn in the band shader from a
uniform `vec4 start/dir` plus a `t` param (no new draw). Streaks radiate from a fixed radiant azimuth per
shower, at about 1 per 15–40 s at peak and about 1 per 5 min off-peak as sporadics. Add a `?meteors=perseids` dev param.
**Why magical:** A shooting star crossing the Pharos's beam on the night of the Perseids is pure delight,
and it is real.
**Data/meaning:** Decorative, real calendar. Text on demand: the legend's almanac line "Perseids tonight".
**Where:** `season/calendar.ts`, `sky/sky-system.ts` (scheduler), `sky/sky-glsl.ts` (streak), optionally the
`audio/` hook (none: silence suits it).
**Cost:** S. About 8 ALU on band pixels, and only while a streak is alive.
**Risk:** Photosensitivity is low (thin, dim, under 0.6 s). It must not resemble lightning: warm white,
thin, no scene flash.

### W07 Moonbow: the recovery at night
**What:** When the recovery window (`rainbowLeft > 0`) falls at night and the moon is above about 40 %
illumination (W04), render the existing bow pass (`weather/rainbow.ts`) about the moon's antisolar point. It is
mostly white-silver with a faint hint of colour and about 25 % strength. With no moon, the recovery
shows as W03-style breaks in the night deck instead: stars returning from the upwind side.
**Why magical:** A moonbow is rare and spellbinding. It also closes a real gap, because a night-time
recovery is currently invisible.
**Data/meaning:** It is the same recovery signal as the rainbow. Pair it with the missing DOM
equivalent for both: a mast and panel line "Recovered from Alert 3 min ago".
**Where:** `weather/director.ts` (relax `sunUp` into `lightUp = max(sunUp, moonUp·illum)`),
`weather/rainbow.ts` (tint and centre from moon), `sky/sky-system.ts`.
**Cost:** S. It reuses the existing instanced draw.
**Risk:** It must not over-brighten the night; keep the strength cap low.

### W08 One wind everywhere
**What:** Project `uWindVec` onto the view's lateral axis to sign and scale the bank drift and the
cirrus drift (`sky-system.ts:329`). Clouds then move the same way as the cloud shadows, smoke and flags.
Add gust visibility through a brief speed-up of cirrus and near banks during `gustEnvelope`, and give
the ocean vertical cat's-paws: dark ripple patches running downwind on the sea in gust cells.
**Why magical:** The world feels like one air mass. Viewers sense the coherence without being able to name it.
**Data/meaning:** Wind strength is already DEWS. This is a consistency fix, so the signal reads better.
**Where:** `sky/sky-system.ts`, `weather/weather-system.ts`. Cat's-paws go in `ocean/ocean-material.ts` (ocean vertical).
**Cost:** S. CPU only, plus about 4 ALU for cat's-paws.
**Risk:** None for calm. Reduced motion already eases drift to a stop.

### W09 Passing squalls over the sea (Watch/Alert)
**What:** At Watch and Alert, the `showerEnvelope` cell becomes a place as well as a time. One
cumulus bank darkens and grows a rain curtain under it (W01's shafts, but localised to that bank's
azimuth), with its own dark cloud-shadow blob on the sea. Both drift along the wind and pass over the
harbour at the envelope's crest, when local drizzle starts. Between crests the squall is visible far off.
**Why magical:** "Unsettled" becomes readable from a distance; you watch a shower walk across the bay.
**Data/meaning:** DEWS Watch/Alert, which already map to showers. This only spatialises the existing
schedule; it adds no new meaning.
**Where:** `sky/sky-system.ts` (pick a bank, feed its azimuth), `sky/sky-glsl.ts` (localised shaft mask), `sky/cloud-shadow.ts` (one extra blob term).
**Cost:** S–M. About 10 ALU in the band and about 3 ALU per shadow sample.
**Risk:** Keep the curtain vertical-streaked and grey-blue, not a white bank, so it does not read as fog.

### W10 Seasonal sky character
**What:** Seed the bank layout by season. Summer gets towering kind-0 cumulus over the far hills by
afternoon and a crisp, deep zenith. Autumn gets long low kind-1 banks and a mackerel or altocumulus
band (a new noise-cellular layer in the cirrus slot). Winter gets flatter, paler stratocumulus with a
low sun skimming them. Spring gets small kind-2 fair-weather pairs and more cirrus. Cover still comes
from DEWS; the season only chooses the shapes.
**Why magical:** Each season has its own sky, and returning visitors notice.
**Data/meaning:** Decorative (calendar), with the same split as precipitation type: the season decides
the look and DEWS the amount. It must keep the CALM cover equal across seasons.
**Where:** `sky/sky-system.ts` (bank seeding reads the `season` service), `sky/sky-glsl.ts` (altocumulus), `sky/clouds.ts` kinds.
**Cost:** S. CPU at init or rare reseed, plus about 6 ALU.
**Risk:** It must never look stormier in one season at the same DEWS level. Add a unit test that cover is season-invariant.

### W11 Summer heat shimmer on the horizon
**What:** On summer afternoons (weight × hour 12–17 × cover < 0.4) add a subtle horizontal wobble
for e < 0.6° in the band and on the far sea haze (a low-amplitude `sin` along th, which the reflection band
inherits). Optionally add an inferior-mirage lift: distant hulls seem to hover by a pixel.
**Why magical:** The air feels hot. It is the Mediterranean summer you feel more than see.
**Data/meaning:** Decorative (calendar and hour).
**Where:** `sky/sky-glsl.ts` (horizon block), the `ocean/` far haze (hook).
**Cost:** S. About 4 ALU.
**Risk:** Keep it very low; it must never smear the beam or the hulls. It is off under reduced motion.

### W12 Dawn dew and rime (the non-fog autumn morning)
**What:** Fog is reserved, so autumn and spring mornings get dew instead: sparse sun-facing specular glints
on grass and leaves (hashed sparkle in `hbWeather` when `sunUp < 0.35` and the season is spring/autumn),
burning off as the sun climbs. When winter `temperatureC < 2` at dawn, add rime: white frosted edges
on grass and roof tiles (distinct from snow cover, crisp and thin), melting by about 10:00.
**Why magical:** Low raking light on a glittering field is a magic-hour moment, and it needs no fog.
**Data/meaning:** Decorative (calendar and hour). It is explicitly NOT mist: no volume and no veil.
**Where:** `world/materials.ts` (`hbWeather`), `season/season-system.ts` (dew and rime uniforms).
**Cost:** S. About 6 ALU on land pixels.
**Risk:** Sparkle aliasing at overview zoom; fade it by `fwidth`, as the material already does elsewhere.

### W13 After-rain steam off sunny stones
**What:** When `wetness` is falling, `sunUp > 0.4` and it is summer or spring, add a few thin vertical
wisps rising from sunlit roofs and quays: up to about 40 instances in the existing smoke system's style, short-lived.
**Why magical:** The Mediterranean after a summer shower.
**Data/meaning:** Decorative aftermath of DEWS. **Fog collision flag:** it must be vertical, local and
transparent, never a layer or a bank. If it can't be made unmistakably "steam", drop it.
**Where:** `life/smoke.ts` (emitter reuse), `weather/weather-system.ts` (a `drying` signal).
**Cost:** S. One instanced draw (shared with smoke).
**Risk:** Truth (fog grammar). This is the lowest priority.

### W14 Horizon moments: green flash and harvest moonrise
**What:** At sunset on clear CALM/WATCH evenings, give the sun disc a vertical flattening as it
touches the shakkei line, then a 1–2 s emerald rim on the last sliver. At moonrise near full moon (W04),
make the disc larger and amber near the horizon, fading to silver as it climbs.
**Why magical:** These are rare, real phenomena; they reward watching the sunset.
**Data/meaning:** Decorative.
**Where:** `sky/sky-glsl.ts` (sun and moon discs), `sky/sky-system.ts`.
**Cost:** S. About 5 ALU on the disc.
**Risk:** The moon is art-directed to a fixed station, so moonrise needs it to rise into that station.
Keep it subtle.

## 3. Top picks

1. **W01 Storm front you can see coming:** the biggest new "magic" moment, and fully data-honest. It turns a fade into an event and also helps W02.
2. **W08 One wind everywhere:** a cheap correctness fix (bank drift ignores wind direction) that makes every other weather idea read coherently.
3. **W03 Sunbreaks after rain:** the emotional payoff of a recovery, working mostly on the 85 % of the frame that is land and sea, at almost no cost.
4. **W04 + W07 Moon phase and moonbow:** one small calendar function gives a real-sky tie-in, and the moonbow closes the invisible-night-recovery gap.
5. **W06 Meteor showers on real dates, with W05 Milky Way:** delightful, honest and cheap in shader cost; the Orionids are this week.

W02 (storm structure) is a near-tie, and is mandatory if W01 ships.

## 4. Cross-vertical hooks

- **Ocean:** W08 cat's-paws, W03 sunlit sea patches, W09 squall shadows, W11 far-haze shimmer, and the
  moon-phase glitter path (W04).
- **Audio (D13, opt-in):** distant thunder before the W01 front arrives; drip and gutter ambience during W03
  drying; meteors stay silent.
- **UI/legend (D11):** a trend line for W01 ("rising"/"easing"), a recovery line for the rainbow and W07
  (no DOM equivalent exists today), and an optional almanac line for the moon phase and meteor shower.
- **Life/foliage:** tree and grass sway and drift (`life/drift.ts`) should use the same `uWindVec` and gust envelope as W08.
- **Lighting/post:** sunbreak shafts (W03) interact with bloom thresholds; check AgX with HDR rim on the shelf cloud.
- **Fog guard (all verticals):** any low, horizontal, white or grey veil is reserved for stale data. W13 is the only
  idea here near the line, and the storm greying (W02) should be pushed away from it.

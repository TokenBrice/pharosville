# 03 — Ocean & coastline

Vertical 03 of the prettier/magical sweep. Read-only study of `src/harbour/ocean/**`, `fleet/fleet-system.ts`
(wake stamps), `model/readings.ts` (sea state), `lights/lights-system.ts` (pool RT), plus 4 captures:
`shots/03-bay-close.png` (t=10.5, `cam=40,0,60,200,32`), `shots/03-roads-close.png` (t=16, Roads),
`shots/03-night-quay.png` (t=21.5 summer), `shots/03-stress.png` (t=13, `offpeg=0.2&dews=WARNING`, heart).

## 1. Current state

- **One shader, very mature.** `ocean-material.ts` (~490 lines) is a single 256² grid plane + stretched far
  ring (`ocean-system.ts` `oceanGeometry`), an unlit depth-tint body over the baked sea SDF (R coast, G depth,
  B structure distance; `public/harbour/sea-sdf.webp`), a Fresnel mirror of the *painted sky band* (no planar,
  no SSR, no env map), and many additive layers. Most of the ideas in the brief **already exist**: sea bed +
  sand/rock + red-first absorption and an AA caustic net in the shallows; Shoals turquoise + reef surf; rain rings
  and melting snow specks; sun/moon glitter column with twinkling facets; golden-hour crest transmission;
  low-sun sheen; far swell lines; lighthouse beam glint and fire column; night window/lamp reflections read back
  from the lights' top-down pool RT (6 taps); cat's paws; spindrift lanes; whitecaps; cloud shadows.
- **Waves** (`waves.ts`): 5 Gerstner components (62→9.5 m) shared GPU/CPU (`hullSwell` for bobbing), shading
  domain-warped to kill the diamond lattice; detail from a baked 512² ripple normal map (4 taps) + 256² fbm.
- **Coast foam:** contact line, two in-place "breathing" bands (p2/p3 oscillate, they do not travel), a swash
  sheet with tearing lace, structure eddy scum (`fStruct`). Strong at the heart view (`03-bay-close`).
- **Wakes** (`wake.ts`): 2048² R16F history ping-pong (diffuse+decay, 6.5 s) + 2048² RGBA8 live layer (R Kelvin
  arms with echelon + transverse + bow wave, G contact ring, B hull occlusion). Stamped per hull in
  `fleet-system.ts:811-818`; still hulls get `contactStrength(storm)` = 0.3 in calm water.
- **Data semantics:** `uSea` = off-peg supply share in 4 steps (`seaStateReading`, Panel.tsx shows it) →
  amplitude/chop/caps/foam bands; `uWeatherSea.y` wind = DEWS → paws, lanes, wind whitecaps; Shoals zone = off-peg
  coins. `03-stress.png` shows both read strongly and distinctly. Seasons/time are decorative.
- **Weak 1 — the basin is one blue.** Harbour zone (`zm.b`) cuts bed visibility by 65 % and roughness by 38 %, and
  at a 26–32° pitch the Fresnel mirror mostly samples a flat near-zenith band, so ~40 % of the hero frame is a
  single saturated cobalt (`03-bay-close`, `heart-day`). Nothing *in the world* is reflected by day.
- **Weak 2 — hulls float above the water.** By day there is no hull/sail/mole reflection and the calm contact
  ring is faint; in the Roads (`03-roads-close`) ships read as pasted on, while the small buoys carry over-sized,
  blotchy cotton-wool foam patches that out-shout the hulls.
- **Weak 3 — the far sea is a milky wall.** The horizon haze (`hz` from 0.62×horizonDist, pow 2.8) plus the far
  band flattens everything past the Roads into a grey-white gradient at dusk; no glitter or swell reads there.
- **Weak 4 — the shore breathes but never *arrives*.** Bands pulse in place; there is no sense of swell lines
  travelling in, bunching and breaking; quays/rocks have no wet run-up line.

## 2. Ideas

### O1 Day mirror: hulls, sails, quays and the Pharos reflected in the water
**What:** generalise the existing night trick. The lights system already renders a top-down pool RT that the
ocean reads back along the view ray (`ocean-material.ts` "the lit town in the water"). Add a *silhouette pool*:
a top-down RGBA8 RT where each tall object writes its colour and a height-coded alpha (quays, mole heads,
lighthouse, civic façades: baked once at load; fleet sails/hulls as cheap instanced quads at 10–15 Hz). The
ocean marches 4 height taps along `away` (as now) and composites the hit colour under `(1-F)`-weighted mirror
with the existing ripple smear. Calm harbour water (zm.b) mirrors best; storm/rain break it up (reuse `calmK`).
**Why magical:** the single biggest "this is water" cue: boats sitting on their own coloured reflection, the
Pharos a long wavering cream column across the basin at noon, sails doubling at dusk.
**Data:** decorative (mirrors existing data-bound objects; never invents one). Storm break-up keeps sea-state truth.
**Where:** new `ocean/reflection-pool.ts` (service 'reflect-pool'), stamp from `fleet-system.ts` beside
`wake.stamp`, static bake from `world/` kit bounds; ocean frag block next to the pool read.
**Cost:** M. 1 RT 1024² RGBA8 (4 MB) static + 1 dynamic 1024² (4 MB), 1 instanced draw ≤2k quads @15 Hz;
ocean +4 taps +~30 ALU on water pixels. On iGPU est. +0.4–0.7 ms. Far cheaper than planar (would double draws).
**Risk:** mis-registration (reflection of a hull offset) — clamp to a 0–20 m height band; gate by tier (low
tier: static only).

### O2 Clouds drifting across the mirror
**What:** intersect the reflected ray `Rr` with the cloud deck height and sample `hbCloudShadow` there (2 taps,
already bound). Lerp the reflected sky toward a lit cloud-white (day) / moon-grey (night) by `(1-shadow)`, i.e.
the same clouds that cast the shadows now also appear in the basin, sliding the opposite way.
**Why magical:** breaks the cobalt sheet into slow, soft bright patches; a calm ten-minute watch gets motion
that the eye reads as "sky in the sea". Fixes Weak 1 at almost no cost.
**Data:** mirrors DEWS cloud cover (already data); adds no new signal. More cover → more mirrored cloud, consistent.
**Where:** `ocean-material.ts` reflection block (`sky = band(...)`); `sky/cloud-shadow.ts` uniforms.
**Cost:** S. 2 taps + ~12 ALU. ≈0.05 ms iGPU.
**Risk:** keep it soft (mip/LOD bias) so it never reads as a second cloud layer under the land.

### O3 Swell trains that arrive: shoaling crest lines + quay run-up wet line
**What:** replace the in-place `p2/p3` bands with *travelling* coast-parallel crest lines: phase =
`coast * k(depth) - t*ω`, with k rising as depth falls (lines bunch and slow near shore), crest steepening into
a thin foam lip that breaks at `dnC≈1` and feeds the existing swash sheet in sync (share the swash phase). On
quay walls / mole faces / rocks, add a dark wet band 0–0.6 m above water that is re-wetted by each run-up and
dries with a slow fade (shader on the stone materials sampling `ocean.shared` uTime/uSdf + `uWetness`).
**Why magical:** the shore finally *breathes in and out*; the eye follows a line from open water to the beach.
**Data:** amplitude/spacing scale with `uSea` (off-peg) exactly like the bands do today — no remap.
**Where:** `ocean-material.ts` foam block; `world/materials.ts` stone/quay patch (`ocean.shared` already exported
for `identity/lettering.ts`).
**Cost:** M. Ocean ~±0 taps (reuses SDF), +15 ALU; stone shader +1 SDF tap +8 ALU on wall pixels only.
**Risk:** reduced motion: driven by the MotionClock sea time, so it stills. Keep breaks sparse (calm).

### O4 Hull meniscus and lee slick (water contact, especially the Roads)
**What:** in the wake live layer, add to the still-hull stamp (a) a 0.3 m dark waterline meniscus + thin bright
lip on the swell's facing side, and (b) a glassy *lee slick*: an elongated patch downwind (`uWeatherSea.zw`)
where `rough` and ripple `dk` drop to ~0.3, so the mirror (O1/O2) shows cleanly beside every anchored ship.
Retune Roads buoy foam (the blotches in `03-roads-close`) to a thin ring.
**Why magical:** ships *sit in* the water; each anchored hull trails a calm satin shadow like a real roadstead.
**Data:** decorative; storm still overrides via `contactStrength` (unchanged semantics).
**Where:** `wake.ts` STAMP_FRAG (use the free `sB.w` for wind-relative angle; pack slick into live B with
occlusion or switch live to RGBA8 with A = slick); `fleet-system.ts:818`; ocean frag reads `live.a`.
**Cost:** S–M. No new RT (live RGBA8 already has a spare channel); +~10 ALU per stamp texel, +1 mul in ocean.
**Risk:** low; check `tier.contact=false` on low tier still gets the slick (cheap) or accept its absence.

### O5 Summer-night bioluminescence (decorative)
**What:** on summer nights (`uFoliage.y`, `uNight`), the churned water in wakes (`trail`, `live.r`), the swash lip
and hull contact rings glow a faint pale cyan-green that pulses with the churn and fades in ~2 s; occasional
sparse sparks where the swash sheet tears. Never in open undisturbed water, never in the Shoals (zm.r) so it
can't be confused with the Shoals' night jade glimmer.
**Why magical:** the quiet "oh" moment of a midsummer night: every slow boat draws a line of light.
**Data:** decorative, season-bound (calendar); declare in the legend's "decorative" list.
**Where:** `ocean-material.ts` foam composite; season uniform via `ctx.uniforms`.
**Cost:** S. Gated by a uniform branch; +~8 ALU. 0 bytes.
**Risk:** neon anti-reference — cap luminance below lamp reflections, no bloom contribution (stay < bloom threshold).
Reduced motion: wakes already still; drop the pulse.

### O6 Basin floor and tone variety
**What:** within the harbour zone, a dredged-channel tonal gradient (lighter turquoise over sandy margins and
beach coves, deeper teal in the middle), dark Posidonia meadow patches on the bed (noise threshold in the
`seeBed` block), and a slightly higher `seeBed` near beaches (keep the 0.65 cut near quay walls only, using
`sdist`). **Why:** turns the cobalt sheet into Mediterranean water you can see into.
**Data:** decorative. **Where:** `ocean-material.ts` body block. **Cost:** S, +1 tap, ~10 ALU.
**Risk:** competing with the Shoals' turquoise identity — keep basin shallows greener/sandier, never reef-turquoise.

### O7 Glassy wake scars on calm days
**What:** a second, slow history channel (≈40 s half-life) that does not foam but only smooths ripple normals,
so calm-day traffic leaves long satin lines across the cat's paws. **Why:** contemplative traces of passage.
**Data:** decorative (traffic already shown by boats). **Where:** `wake.ts` (R16F → RG16F hist), ocean `dk`.
**Cost:** M; +16 MB VRAM at 2048² (2 ping-pong) — on iGPU prefer a separate 1024² R8 (2 MB). +1 tap.
**Risk:** VRAM on iGPU; skip on low tier.

### O8 Breakwater spray bursts that amplify the sea state
**What:** when a swell crest (CPU `waveHeight`) meets the outer mole face, spawn a short instanced spray
sprite sheet (≤24 live) whose height and frequency scale with `seaState.step`; none at step 0.
**Why:** a rough sea becomes legible and dramatic at the heart view without more grey.
**Data:** amplifies existing off-peg sea state (Panel already shows it); no new field, no remap.
**Where:** new small system after `ocean` in `systems.ts`; points from layout breakwater polylines.
**Cost:** M; 1 draw, ≤24 quads, alpha overdraw small. **Risk:** spectacle — keep slow, small at steps 1–2.

### O9 Horizon clarity and a far glitter road
**What:** start the haze later (0.75×) and tint it from the band at the water's own elevation instead of 0.15°;
extend the sun/moon glitter envelope to the horizon with a thinning dash pattern so the low sun lays a road
to the shore. **Why:** depth and distance instead of milk (Weak 3). **Data:** decorative haze — must *not* be
confused with data fog (stale); this reduces haze, so it widens the gap. **Where:** `ocean-material.ts` haze/far
band. **Cost:** S. **Risk:** card seam with the backdrop — re-verify at 21:9 and overview.

### O10 Harbour-mouth crossing seas
**What:** at the mole heads, where the SDF gradient turns sharply, add a refracted second crest set (crest
direction = rotated SDF gradient) crossing the main swell, with a few small standing peaks of foam.
**Why:** the harbour mouth reads as the threshold between the open sea and the lee. **Data:** scaled by `uSea`.
**Where:** ocean foam block (needs SDF gradient: 2 extra taps or a baked gradient in a new channel).
**Cost:** S–M. **Risk:** busy if overdone; heart view only (fade by `far01`).

### O11 Lantern and window reflections that lengthen with calm
**What:** the night pool read is good (`03-night-quay`) but streaks are short dots. Lengthen the column with a
5th/6th tap stride when `rough` is low, and add a faint warm reflection of riding lights (fleet `rl.add`) via
the same pool. **Why:** classic harbour-night poetry. **Data:** decorative. **Where:** pool read loop; lights
system already writes the pool. **Cost:** S, 0 new taps if strides re-spaced. **Risk:** none.

## 3. Top picks (impact ÷ cost)

1. **O2 Clouds drifting across the mirror** — near-free, directly fixes the one-blue basin, stays data-consistent.
2. **O1 Day mirror via a silhouette pool** — the biggest realism-without-photorealism gain; reuses a proven trick at a fraction of planar cost.
3. **O4 Hull meniscus and lee slick** — fixes "ships pasted on" in the Roads with no new RT.
4. **O3 Swell trains that arrive + quay wet line** — makes the coast breathe; keeps off-peg scaling.
5. **O5 Summer-night bioluminescence** — the magical moment, cheap, clearly decorative.

## 4. Cross-vertical hooks

- **Weather/sky:** O2 needs the cloud-shadow deck height and must match the painted clouds' drift; O9 haze
  start must coordinate with the stale-data fog owner (fog = stale only).
- **Fleet:** O1/O4 stamp from `fleet-system.ts`; sail colour for the pool comes from the livery/shipyard.
- **Architecture/stone:** O3 wet line lives in quay/rock materials (`world/materials.ts`).
- **Lighting/night:** O11 and O5 share the lights pool RT and bloom thresholds.
- **Audio:** O3 run-up and O8 spray give natural cues for opt-in surf one-shots (D13).
- **Seasons:** O5 keyed to the summer weight; legend should list it as decorative.

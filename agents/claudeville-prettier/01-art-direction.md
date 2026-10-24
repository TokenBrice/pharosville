# 01 — Art direction (whole frame)

Frames read: `shots/day.png` (t=11), `dusk.png` (t=18.5), `night.png` (t=22), `heart-day.png` (t=14),
plus my captures `shots/01-overview.png` (t=11 view=overview), `01-dawn.png` (t=7), `01-golden.png`
(t=19.2), and (to spare the shared capture queue) sibling captures `04-storm.png` (dews=DANGER),
`04-winter.png`, `03-roads-close.png`.

## 1. Current state

- **Strong bones.** The heart framing is a good classical composition: the Pharos is a vertical on the
  left third, the harbour mouth makes a V that leads the eye from the mole up to the tower, the civic
  acropolis is a warm counter-mass on the right. Night is the best frame: a clear notan (dark land and
  sea, warm lamp strings tracing the moles, the beam as the one bright diagonal). Keep it as the yardstick.
- **A palette script per hour already exists** — `engine/time-of-day.ts` keyframes (sun, hemi, haze,
  exposure, bloom) + a CPU-baked 3D LUT grade with `blueSat`/`warmSat`/`shadowSat` (`engine/post.ts`),
  and `sky/palette.ts` for clouds/hills. Tilt-shift (overview only) and vignette also exist. So the
  work is *re-tuning*, not adding a grading system.
- **No atmospheric perspective on solid things.** `uFogDensity` is interpolated per hour
  (`time-of-day.ts:248`) but **nothing consumes it**; only the sea shader (`ocean-material.ts:476`) and
  sky haze toward the horizon. So the far Roads hulls, flags and the outer island keep full contrast and
  saturation while the water behind them goes milky: things look pasted *onto* the haze, not *in* it.
  (Constraint: "fog = stale data only" — this must be an always-on, invisible-as-weather depth tint,
  never a visible bank; see A1.)
- **The "confetti" is the house-flag minimum size, not the sails.** `fleet-system.ts:771-773`: every
  hull at rest flies a burgee clamped to `flagMinPx` (9 px on high) and up to 0.55 × LOA, placed at
  masthead + 0.3 m. At Roads/overview distance the hull is ~3–6 px of sea-coloured paint while its flag
  is 9 px of brand colour floating above it — exactly the floating-confetti read. Plus brand sails at
  `sailDye` sat ≤ 0.72 (`livery.ts`) then the grade's `saturation 1.1 × warmSat 1.12`.
- **Palette fight.** The land is a lovely limewash/terracotta/olive register; the fleet is a 60-hue
  candy register on top of it. Brand colour IS identity (keep hue), but chroma is uncapped relative to
  the built world, so the sea reads busier than the town and steals the focal hierarchy from the Pharos.
- **Water is one value.** Inner basin = flat mid-cyan from mole to quay (no channel/shelf/value
  variation except the sun glint); outer sea = the same blue fading to a pale milky band; horizon is a
  hard ruler-straight line with hills pasted at constant value. The basin is the brightest *saturated*
  area in the frame, so it competes with the lighthouse.
- **Chart lettering** (`identity/lettering.ts`) is set flat on the water on a straight baseline with a
  big letter-space; in the 3/4 view it foreshortens to grey stencils with a drop-shadow-looking halo.
  "THE ROADS" sits *across* anchored hulls and its R crosses the island tree line; "THE SHOALS" is
  overprinted by the distress fleet. Correct concept, wrong placement/weight.
- **Overview tilt-shift** blurs the top band, which is where the Pharos is: the focal point is out of
  focus (`post.ts`, focus band centred at offset 0.06), while foam halos on every coast bloom into a
  soft white outline around the whole island — reads "glow filter", not "miniature".
- **Close up, the fleet is charming; far off, it detaches.** `03-roads-close.png`: hulls, rigs and
  emblem sails read well within ~300 m, but the mid-distance sea already turns to a milky white band, so
  boats out there sit on white and look airborne. Storm (`04-storm.png`) and winter (`04-winter.png`)
  are strong, unified moods — except the fleet flags, which stay full-contrast against the grey: the
  clearest proof that solids need the same air as the sea.
- **Golden hour is easy to miss.** Keyframes are on a solar clock; at t=19.2 in late October the frame is
  already blue night, and t=18.5 is post-sunset violet. The warmest, most painterly key (low raking sun
  on limewash) shows for a short window; dawn at t=7 shows sun and moon discs side by side behind the tower.

## 2. Ideas

### A1 Aerial perspective for solids (decorative distance tint)
**What:** consume the dead `uFogDensity`/`uHaze` as a depth-based tint on everything: a small custom
pmndrs `Effect` with `EffectAttribute.DEPTH` placed before bloom in the merged `EffectPass`: reconstruct
view distance, `k = 1 − exp(−d·density)` with a near threshold (≈ harbour radius) so the heart is
untouched, mix toward `uHaze` and desaturate by `k·0.6`. Far Roads, far ports and the outer island
recede; the sea/backdrop and solids finally share one air.
**Why magical:** depth; the diorama gets an "air" between viewer and horizon — Claude-Lorrain distance.
**Data:** decorative. Must not resemble stale fog: constant per hour, no drift, no noise, strength cap
(k ≤ 0.35), and no change with `stale`. Document in the legend copy as "distance".
**Where:** `engine/post.ts` (new effect in `main` pass), `engine/time-of-day.ts` (re-tune `fogDensity`).
**Cost:** S. +1 depth fetch + ~15 ALU per pixel in an existing pass; 0 draws.
**Risk:** truth (confusion with stale fog) — mitigate by keeping it static and below the readings' fog.

### A2 Far-fleet LOD by silhouette, not by flag dot
**What:** below ~25 px LOA, (a) cap flag size at 0.3 × LOA and drop `flagMinPx` to ~4 px; (b) instead
give the LOD hull a 1–2 px *brand-dyed sail/awning block* and a darker waterline + white bow-wave
streak (wake already exists in `ocean/wake.ts` for movers; add a cheap static "contact" sprite or
ocean-shader darkening under anchored hulls). Identity survives as a muted sail colour; the hull/water
contact gives weight.
**Why magical:** the Roads read as a fleet at anchor in a roadstead, not glitter.
**Data:** brand colour → coin identity is unchanged (hover/search/ledger still the DOM equivalents);
only the far-distance encoding moves from flag to sail block. Say so explicitly in the legend.
**Where:** `fleet/fleet-system.ts` (flag size law ~L771), `fleet/house-flags.ts`, `fleet/fleet-material.ts`
(LOD mode 4), `ocean/ocean-material.ts` (contact shadow from a hull-position texture) or `fleet/fenders.ts`-style instancing.
**Cost:** S–M. Fewer flag pixels; contact: one instanced quad draw (~1k instances, 2k tris).
**Risk:** truth (brand dot is how overview users find a coin) — keep search highlight forcing full flag.

### A3 Pigment-cap the brand dye ("earth pigments")
**What:** in `sailDye`, cap chroma relative to the built palette (s ≤ 0.5, l 0.4–0.62) and nudge hue
cast ~8 % toward ochre in daylight (keep hue order). In the grade, take sails out of `warmSat` boost
(or lower `warmSat` to ~1.04 noon). Keep full brand chroma on the hovered/selected hull and the flag
roundel.
**Why magical:** fleet and city become one painting; sails look dyed linen, not plastic.
**Data:** hue preserved, identity preserved; chroma is decorative. Selection keeps full chroma.
**Where:** `fleet/livery.ts` `sailDye`, `fleet/fleet-material.ts` (hover restore), `engine/time-of-day.ts` grades.
**Cost:** S, 0 perf. **Risk:** adjacent brands with similar hue become closer — check livery tests.

### A4 Value-group the water (notan for the sea)
**What:** three value bands. Basin: darken the channel centre one step and lighten a ~6 m shelf along
quays and the beach (the shader already has `dep`, `coast`, `shoalK`, use them for value, not just
hue); add a slow broad "cat's-paw" low-frequency value modulation (wind fields, ~200 m wavelength) so
the basin is not a single flat cyan. Outer sea: darker and cooler mid-distance band, then lift to the
haze only near the horizon. Result: sea darker than limewash, basin darker than the Pharos.
**Why magical:** the white tower and town pop; water feels deep and calm.
**Data:** decorative (sea state/Shoals zones untouched).
**Where:** `ocean/ocean-material.ts` body tint (~L185–253) and the far band (~L351, L476).
**Cost:** S–M, a few ALU. **Risk:** Shoals zone must still read lighter (its meaning).

### A5 Horizon with depth: graded far sea + atmospheric hills
**What:** break the ruler horizon: a gradient of value in the last 15 % of sea (darker under the hill
line, a glittering sun/moon path on the far sea at golden/night), two hill layers at different haze
values (shakkei near/far) and a faint sea-mist line where sea meets hills.
**Where:** `sky/sky-glsl.ts` (backdrop hills ~L227), `sky/palette.ts` (second `mount` tone), ocean far band.
**Cost:** S. **Risk:** none notable; keep calm, no movement.

### A6 Re-aim tilt-shift on the focal point, kill the coast-glow
**What:** compute the tilt-shift focus offset from the Pharos' screen Y (the rig already projects hero
points) so the tower is always in the focus band; reduce coast foam bloom by excluding foam from the
bloom threshold at overview (foam luminance ≤ threshold) — it currently halos all coasts.
**Where:** `engine/post.ts` (`tiltShift.offset`), `layout/layout-system.ts` hero points; `ocean-material.ts` foam brightness vs `bloom` threshold in `time-of-day.ts`.
**Cost:** S. **Risk:** none.

### A7 Chart lettering as engraved cartography
**What:** set zone names on a gentle arc following the zone's long axis (curved baseline in
`labels.ts` layout), letter-space tighter, small-caps "THE" inline and italic (chart convention for
water names), ink as a single warm sepia (no halo "shadow" by day; halo only knocks out glitter, at
lower alpha). Place the label in the zone's *empty* water (pick anchor from zone mask minus anchorage
slots), never across hulls or land.
**Why magical:** reads like an old Admiralty chart printed on the sea — a delight, not a HUD.
**Where:** `identity/labels.ts` (layout), `identity/lettering.ts` (ink/halo), layout `zones` anchors.
**Cost:** S–M, 0 perf. **Risk:** legibility at overview — test both zooms.

### A8 Golden-hour bias in the palette script
**What:** widen the warm window: map keyframes by *solar* hours (sunset−1.2 h … sunset+0.4 h) instead
of fixed clock hours, and give the golden key longer hold; lower the dusk violet saturation slightly
(the 18.5 frame is all-magenta: sky, sea and town share one hue — needs a warm/cool split: warm lit
limewash vs cool violet shadows). Hide the moon disc while the sun disc is up near it.
**Where:** `engine/time-of-day.ts` (keyframe interpolation ← `season/calendar.ts` solarDay),
`sky/palette.ts` (`moon` weight near dawn/dusk).
**Cost:** S. **Risk:** gates pinned with `?t=` keep working if `t` stays clock time.

### A9 Focal hierarchy: the lighthouse is the brightest value, always
**What:** a rule baked into grading: the lantern/limewash of the Pharos owns the top value; tame the
basin glint and the white Ethereum/Tether banner fields (they currently out-shine the tower in the
heart frame). Slight local exposure lift (screen-space radial "spotlight" mask centred on the tower,
+0.1 EV, ultra-soft) inside the vignette pass.
**Where:** `engine/post.ts` (vignette centre → offset toward Pharos), banner materials in `civic/` / `identity/crest-flags.ts`.
**Cost:** S. **Risk:** keep subtle (< 0.15 EV), otherwise "spotlight".

### A10 Ink-line edges for the miniature (optional)
**What:** a thin depth/normal edge detect (1 px, ink colour = darkened local colour, alpha ≤ 0.35,
only on silhouettes against water/sky) to give painted-miniature crispness to far roofs and hulls.
**Where:** new effect in `engine/post.ts` (needs normal pass; or depth-only Sobel).
**Cost:** M; one extra full-screen sample set (~9 depth taps). **Risk:** "cel-shaded game" look; perf on
integrated GPUs. Lower priority than A1–A4.

### A11 Paper/canvas grain and painterly finish
**What:** a static 2-octave paper grain (luminance ±1.5 %), modulated by value (more in midtones),
fixed to screen; at night replace with nothing. Cheap way to say "illustration".
**Where:** `engine/post.ts` (in the LUT pass or vignette). **Cost:** S (1 tex fetch). **Risk:** banding/noise on OLED; keep static (reduced motion safe).

### A12 Frame the diorama
**What:** at overview zoom, let the world fall off into a painted sea-mist rim (vignette shape follows the
`panClamp` bounds, colour = `uHaze` not black), so the island floats like a model on a table.
**Where:** `engine/post.ts` vignette → custom haze-vignette; `layout-system.ts` bounds.
**Cost:** S. **Risk:** must not look like stale fog — static, edge-only, only beyond overview distance.

## 3. Top picks

1. **A2 Far-fleet LOD by silhouette** — fixes the single loudest problem (confetti) at a perf *saving*; identity kept.
2. **A1 Aerial perspective for solids** — biggest depth gain per ALU; the uniform is already plumbed but unused.
3. **A3 Pigment-cap the brand dye** — zero-cost palette harmony; the fleet joins the terracotta world.
4. **A4 Value-group the water** — gives the frame a notan; the white Pharos and town pop against a deeper sea.
5. **A7 Chart lettering as engraved cartography** — turns an awkward stencil into the most charming detail.

### Five things a painter would fix first
1. **Knock back the confetti:** far boats get a hull and a waterline, flags shrink with distance (A2).
2. **Put air between me and the horizon:** far things paler and cooler (A1, A5).
3. **One family of colour:** dye the sails with earth pigments, keep the bright for the one you touch (A3).
4. **Darken the water a value so the white tower is the star:** sea < limewash, glint < lantern (A4, A9).
5. **Letter the chart like a chart:** curved, italic, sepia, in open water (A7).

## 4. Cross-vertical hooks

- **Ocean** (A4, A5, A2 contact): shares `ocean-material.ts` with the ocean vertical; agree the value bands.
- **Fleet** (A2, A3): fleet vertical owns `fleet-system.ts` flag law and `livery.ts`.
- **Sky/time-of-day** (A1, A5, A8): one haze colour must drive sky, sea and the new solid tint.
- **Readings/weather** (A1, A12): stale-fog owner must sign off that distance tint stays visually distinct
  from `readings/fog.ts`; DEWS storm should *raise* A1 density (decorative weather band coupling is fine
  since weather already = DEWS).
- **Identity/lettering** (A7): labels vertical; also the banners' white fields vs the Pharos (A9).
- **Perf**: A1/A10/A11 sit in the merged EffectPass — the perf vertical should budget them together.

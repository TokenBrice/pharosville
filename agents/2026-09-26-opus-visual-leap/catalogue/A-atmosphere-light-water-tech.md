# Catalogue A — atmosphere, light, water, technique (water · sky · light · printmaker · headroom)

Legend: Impact = S stunning / P poetic / R relaxing (as the report scored). Perf = Δdraws / Δtris / ΔGPU / Δtex, copied from the report; every ms is the report's own [INFERENCE] unless stated. `gw` = `src/three/garden-water.ts`, `gs` = `garden-sky.ts`, `gp` = `garden-post.ts`, `gdc` = `garden-day-cycle.ts`, `wr` = `world-renderer.ts`, `gfb` = `garden-fleet-batch.ts`.

---

## water

Verdict: The sea ignores its sky: golden sky L\*72 (231/163/102) over slate water L\*21 (38/51/62); blue-hour sea royal navy L\*10; probe ×IBL 0.45, Fresnel cap 0.55, ortho-era gains, ×0.55 near-field dim keep sky out.

Measured: noon bottom-centre L\*26 (bible 38); noon calm body left-mid 39 (27); reduced-motion calm 52 (27); night band 16.5 vs water 4.9. Best evidence frame: `water/golden-inlet-motion-frames/07.png` (glassy, clean tower reflection).

### Ideas

| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| water-1 | ★ | Let the sky into the water: Fresnel dosed for the real camera | Probe × new `uSkyRadiance` (1.0 day/golden, 0.85 blue, 0.5 night); Fresnel clamp(F·seaReflectivity,0,0.92), F0 0.02; delete 0.55 cap, sheen mix, `dayValueGain`; low-chroma body L\*18/12/3; roughness mix(0.12,0.35,glint) | S5 P5 R4 | H | S–M | 0/0/~0 ms/0 | `gw:677`, `:967-980`, `:1407-1409`, `:400-422`, `:2014`; `garden-environment.ts:134-136` | band-ramp colour as main voice; env-sheen second mix; `dayValueGain` | No semantic change; risk carrier moves to water-3; reduced motion keeps static reflection | Needs LaneSky darker sea-horizon (noon milkiness guard); `uSkyRadiance` from LaneLight 5-beat score; cap sky L≈0.85 pre-tonemap (bloom knee); night ≤0.5; re-pin Fresnel tests in `garden-water.test.ts` |
| water-2 | ★ | One broken reflection: streaks, not squiggles | Mipmapped RT; displace reflected-UV vertically only `(n.x*0.5+n.y)*0.006*(0.4+below)`; LOD 0→3.5 over 18 u + 3-tap vertical kernel; soft-knee windows; ×0.8 colour; cliff plinth into layer; inlet normals ×0.5 | S5 P5 R4 | H | S–M | 0–1 / +1–4k / ~0.05–0.1 ms (mips) / 0 | `garden-hero-reflection-pass.ts:72-77`; `gw:1155-1162`, `:769`; `wr:3298-3308` | squiggle glyphs; saturated pine "lily-pads" | Decorative; reduced motion keeps one frame, now blurred | Premultiply before mipping (alpha bleed); re-run W6.5 reflection alignment at 3 poses; LanePharos cliff mesh; interacts with headroom-7 (reflection LOD proxy) |
| water-3 | ★ | Risk is the weather on the water, not the dye in it | New `probeRoughness` per band (calm .06, ledger .08, watch .16, alert .26, warning .34, danger .55, wreck .30) packed into `uRegionFlow`/`uRegionBoundary`; `tintStrength`→0.15–0.25; calm depth 1.22→0.95; noise-warped 6–10 u slick edges | S4 P5 R5 | M-H | S–M | 0/0/~0 ms/0 | `garden-sea-regions.ts:279-325`; `gw:1051-1056`, `:1091-1126`, `:1068-1083`; `garden-zones.ts:108` | hue as primary risk carrier; `SEA_GAMUT_ANCHOR` dye pull; hard seam foam | Same 7-body reading; colour becomes secondary carrier (a11y win); roughness survives reduced motion; ledger/sea-sign should name surface state | Measure calm↔danger ΔL\* ≥12 at `cam=0,0,0.28`; pairs with printmaker-3 lines; LaneDataPoetry DOM words (glass/ripple/chop/leaden) |
| water-4 | | View-dependent roads: the moon (and low sun) leads to you | Delete `:1171-1184`, `:1202-1213`; H=normalize(L+V) with real view vector, lobe pow(dot(n,H),60–120) gated by fine-normal sparkle (replaces sine lattice); re-derive `moonRoadOccupancy` (~0.03–0.05, gain≈0.2) | S4 P5 | M | S | 0/0/~0 ms/0 | `gw:1171-1184`, `:1191-1194`, `:1202-1213`, `:1232-1238`; `garden-water-contract.ts:96-109` | two-sided moon band; world-fixed sun band; lattice glitter | Decorative; reduced motion static road | Needs LaneSky moon in frame at ~15–25° (sky-5); **duplicate of printmaker-6 and light-3 road part — one implementation** |
| water-5 | | Anti-tile surface: three scales, wind slicks, no brush strokes | Normals at λ≈5/14/41 u, rotations 0/2.3/−1.1 rad, octave fade by footprint; fbm slick mask flattens ×0.15 on ~30% plate, drifts ~1 u/min; Gerstner gain 18→~8 near camera | S4 R5 | H | S–M | 0/0/+1 fetch ~0.05 ms (≈4× at DPR 2)/0 (optional 512² same-slot swap +0.75 MB) | `gw:724-752`, `:769` | brush-stroke read; uniform chop | Slicks masked out of watch→danger; allowed on calm/open/ledger; reduced motion freezes slicks | Keep glint filter (Schlick banding guard); texture census 72/72 → no net-new texture; **conflicts with printmaker-3 Gerstner 18→11** |
| water-6 | | The coast of the world: annulus gets a shore; plate seam disappears | Annulus `shoreField = max(0,-gardenPlateEdgeDistance)/SHORE_SCALE` feeds shelf/wet/lap path; same normals+Fresnel within 30 u; `SEA_EDGE_CROSSFADE` 8→20 | S3 R3 | H | S | 0/0/~0 ms/0 | `gw:840`, `:982-1017`, `:1413-1417`; `SEA_EDGE_GLSL :304-320` | bare vertical slab edge | None | Mask by terrain field at harbour mouth so no foam crosses open water |
| water-7 | | Hulls that touch the water: contact darkness + inverted keels from wake field | Ships stamp hull-footprint ellipse into wake field **G** (cleared each frame); water takes 3 taps along view-reflection (0/1.2/2.4 u scaled); `water *= 1-0.35·occ`, sky refl ×(1-occ) | S3 R3 | M | M | 0/0/~0.1 ms (field stays awake)/0 | `garden-wakes.ts:59, 229-233`; `wr:3298-3308` | per-ship reflection geometry; white night hull-collar rings | Decorative; reduced motion one stamp pass then freeze | Fleet lane passes hull length + moored/underway; loses idle-sleep saving; far fleet outside 72–220 u window (accepted); alternative to headroom catalogue "fleet-far proxies in reflection" |
| water-8 | | Shore that breathes once: one lap line, real wet foot, shallow transmission | Delete `lapFoam`, `foamRings`; one `shoreEdge` 9–12 s breath (0.003→0.008), ×(0.05+0.95·daylight); wet band ×0.55 over ~1.2 u; shallows mix seabed exp(-depth·6)·0.45·daylight | P3 R4 | H | S | 0/0/slightly cheaper/0 | `gw:984-996`, `:890-896`, `:1296-1324` | contour rings; lap-sine bands; cyan night halo | Tide line/stain masonry untouched; wet band water-side only | LanePharos rock-foot mesh at waterline |

### Defects

| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| 1 | Golden/blue-hour water refuses the sky | `golden.png`/`blue.png` right water hue ~215–225° under sky ~30°/~10°; `wholemap-dusk.png` petrol annulus vs orange horizon | `gw:677`; `garden-environment.ts:134-136` (0.6/0.45/0.3); `gw:967-974` cap 0.55; stale ortho comment `:932-943`; `dayValueGain :1407-1409` | water-1 | S–M |
| 2 | Tower-window reflections are squiggle glyphs | `night.png`/`deep-night.png` lower centre 3×5 orange "S/~" worms; `golden-inlet-motion-frames/02.png` | `gw:1157` isotropic ×0.008; no blur/mips `garden-hero-reflection-pass.ts:72-77`; windows ≤85% `gw:1161` | water-2 | S |
| 3 | Night moon road = milky searchlight smear through island, 3.4× water | `night.png` band left y≈740–790, right y≈640–700; `crop-night-band.png`; blue hour at pier | `gw:1178` two-sided `roadReach`; moon 113° off-axis `garden-sun.ts:75-76` | Delete; water-4 | S |
| 4 | Calm body is swimming pool / linoleum | `reduced-noon.png` left-mid mint L\*52 hard diagonal; `noon.png` left; `crop-golden-left.png` khaki 81/71/56, no reflections | `garden-sea-regions.ts:279-285`; normal flatten `gw:762`; roughness 0.21 `garden-water-contract.ts:63` | water-3 | S |
| 5 | Brush-stroke normal tiling | `noon.png`/`noon-1440p.png` foreground blobs > ship; `wholemap-noon.png` fabric flecks | 256² streak texture at 18/9 u `gw:726,730`, 31×13 u `:738`; Gerstner ×18 `:769` | water-5 | S–M |
| 6 | Contour-line foam rings + cyan shore halo after dark | `blue.png`/`night.png` right pier; `crop-blue-pier.png` | `foamRings` `gw:1314-1324` (0.6 day floor); `lapFoam` `:988-996` | water-8 / Subtractions | S |
| 7 | World edge is a cardboard slab; ruled seam | `wholemap-noon/dusk.png` vertical plate sides; `noon-close.png` in-plate/annulus seam | `gw:840` annulus `shoreField = 1.0` | water-6 | S–M |
| 8 | Tower reflection not the tower's colour (brighter/greener) | `crop-noon-inlet.png` pine pads as green lily-pads | shadow map off `garden-hero-reflection-pass.ts:125` | part of water-2 | — |

### Subtractions
- Two-sided moon band `gw:1173-1184` — delete now, before water-4.
- `foamRings` contours `gw:1314-1324` and `lapFoam` sine bands `gw:987-996`.
- `dayValueGain` `gw:1407-1409` (grade in disguise).
- Env-sheen double mix `gw:976-980` and region `regionReflect` sheen `gw:1085-1089`.
- Sparkle sine lattices `gw:1191-1194`, `gw:1235-1238`.
- Danger's screen-space rain `gw:1068-1083` (`gl_FragCoord`; [INFERENCE] not visible in baseline).
- `tonalCurrent` world sine stripe `gw:882-885`.

### Reversals
- Fresnel "conservative 0.40 base, 0.55 cap" (T1.2, `gw:932-943`, pinned in `garden-water.test.ts`) · premise "fixed ortho 35.3°" reversed by Reborn D3; `golden.png` water L\*21 hue ~215° under L\*72 amber sky · risk: noon milkiness (guard: LaneSky darker sea-horizon + bloom-knee cap).
- Water as dyed risk map (R5 / `SEA_GAMUT_ANCHOR` `garden-zones.ts:96-108`; `tintStrength` 0.62–0.70) · `reduced-noon.png` mint L\*52 in L\*27 cell; `crop-golden-left.png` khaki · risk: whole-map band separation must be re-measured.
- Moon pose `garden-sun.ts:75-76` (az 0.62π, el 52°) · no moon in `night.png`/`deep-night.png` · owner LaneSky; water follows.
- Not reversed: reflection layer = tower + precinct only (D5/W1.15) · extended to hulls via wake field (water-7) at 0 draws instead · respects "no full-scene planar".

---

## sky

Verdict: Sky has no direction: rest view spans ~0–12° elevation, ±24.6° azimuth, all celestial objects authored outside it; far band L\* 91.6/73.7/91.6 (std 1.2) in noon/golden/stress; golden sky L\*64–74 vs bible 35/52/43; night L\*2.5 void.

Measured (top L\* / far-haze L\* mean±std): dawn 52 / 64±1.3; noon 77–80 / 91.6±1.2; golden 64–67 / 73.7±1.2; blue 45–48 / 48.6±1.6; night & deep-night 2.4–2.5 / 3.4±0.2 (identical). Geometry: moon forward component −0.40 (behind camera); sun at 17.6 h 42° right, 14.4° up; sunset azimuth 53° right → no disc can enter rest frame. Tonight is harvest full moon (age 15.06 d, 99.9% lit).

### Ideas

| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sky-1 | ★ | Light has a side: sun-anchored sky with Earth's shadow and Belt of Venus | Horizon = mix(anti, solar, sunSide) from dot(dir.xz,sunDir.xz); broad glow pow(a,3); rose belt + slate earth-shadow band only sunset→nautical dusk; beats `{zenith, solar, anti}` (golden solar `#f0b070`, anti `#9c93b3`; blue belt `#9a7486`, shadow `#3e4666`) | S5 P5 R4 | H | M | 0/0/≈+0.02 ms/0 | `gs:47-53`, `:348-352`, `:365`, `:378-380` | ember band; uniform horizon; Mie at current exponent | Illumination only (wall clock); reduced motion identical | PMREM bake shifts metal reflections; re-pin `garden-sky.test.ts`; follows `uSunDir` so compatible with light-1; feeds sky-2 airlight; LaneLight LUT must not re-pink blue |
| sky-2 | ★ | True aerial perspective and a horizon line | One `gardenAerial()` at `fog_fragment` (incl. annulus): σ=density×(0.78,0.9,1.18), height-falloff extinction; airlight = sky-1 at elev 0 × seaDim (0.90 day/0.86 golden/1.10 night); desat by T; ichimonji 2–3 px gain 0.06; T=0.55 far rim, ≈0.05 at 480 u; noon haze 0.42→0.12 | S5 P4 R5 | H | M | 0/0/≈0 ms net/0 | `gs:512`, `:83-105`, `:381-382`, `:588-591`; `garden-height-fog.ts:144-164`, `:216-263` | linear `Fog` law; global height-fog mix (survives as local epistemic shelf `:166-188`); `:381-382` seam rule | No data; fleet aerial restraint `gfb:996-999` chroma-only so pirate contrast floor holds; static | Annulus must fully fog by 480 u; LaneFleetCraft far-third readability; re-pin fog tests; **overlaps headroom-2 (post in-scatter) and printmaker-4 (two-ink stepped fog) — pick one fog owner**; LaneWater annulus `gw:1429-1436` must not overwrite reflection |
| sky-3 | ★ | Shakkei: five painted ridges with kasumi bands | 5 ridges (peak 500/34/+120/260/0.005 … near headland 260/12/+235/120/0.05+pine crest), 64 Catmull-Rom pts + 2-oct noise; opaque, k ladder 0.88/0.82/0.68/0.62/0.40; sun rim ×0.12; night ridges L\*9–11; 3 kasumi quads α0.55 | S5 P5 R4 | H | M | 0/+~600 (60→660)/<0.02 ms/0 (−1 draw with mist banks gone) | `garden-horizon.ts:50-72`, `:144-162`, `:156` | 3 ghost cones; 9 far mist-bank billboards | Scenery; hidden on `constrained` tier as today | Peak <4°, pale, asymmetric (not a second monument/Fuji); keep centre −90…+90 low (ma); re-pin `garden-horizon.test.ts`; LaneGardenMaster/ArtDirector |
| sky-4 | | Painted cloud layers on the dome, cover owned by market stability | Ray/plane clouds in dome: low H1=45 (2 taps along sun → lit/shade, 3-tone posterize 40%), high H2=160 anisotropic α≤0.35; cover by PSI band BEDROCK .05…MELTDOWN .88, 120 s ease; water shadow = daylight×(0.08+0.5·cover) | S4 P5 R4 | M | M | 0 (−1 billboard)/0/+0.1–0.2 ms (×4 DPR2), ≈0 net if dome drawn last with far-plane depth test/0 (reuses `createCloudNoiseTexture`) | `gs:201`, `:225-226`, `:300`, `:390`, `:692-693`; `gw:2087-2088`, `:2182-2218` | billboard cumulus; phase-only cloud-shadow strength | Cover encodes PSI ("clarity aloft"); add cover word per band (Clear/Fair/Veiled/Broken/Low cloud/Overcast) in lighthouse facts; reduced motion offset 0 | Meets ledger:18 re-entry condition; keep night value below beam; bake PMREM at eased cover; LaneDataPoetry vocab; headroom-6 packed noise |
| sky-5 | | The real moon, in the window | New `src/systems/sky-almanac.ts` (phase from JD, transit≈(12+age×0.8127)); displayed az = view ±23° (q−0.5)×0.80 rad, el = asin(visH)×(0.12+0.62 sin πq); dome disc 1.1°, terminator, earthshine .05, maria, low-moon warmth, 2-scale halo; stars ×(1−0.55·illum·moonUp) | S5 P5 R5 | H | M | ≈0 (moon spheres gone)/0/+0.02 ms/0 | `garden-sun.ts:75-76`; `gs:462-489` | moon spheres; fixed moon constants | Wall-clock truth; offer LaneChrome "· a full moon" caption; reduced motion identical | Nominal 35° N; disc ≤0.8 beacon luminance; night key changes tower modelling (LaneLight/LanePharos); feeds water-4, light-3, printmaker-6 |
| sky-6 | | Night sky with depth: horizon glow, graded stars, slow scintillation, turning heavens | Night zenith `#0e1530` (L\*≈7.5), horizon `#1b2440` (L\*≈15); stars 720→1,200 at el 0.5°–25°, mags 80/18/2%, scintillation ±12% 6–11 s near horizon; rotate 15°/h on 35° axis; Milky Way ≤+3% moonless/clear | S4 P5 R5 | H | S | 0/720→1,200 pts/+0.01 ms/0 | `gs:52`, `:396-460`, `:408`, `:438-449`, `:639` | flat night gradient; blinking twinkle | PSI cover still veils stars; reduced motion no scintillation | Horizon glow ≤L\*15 (beacon dominant); points ≥1 px; coordinate with printmaker-5 bero-ai (same targets) |
| sky-7 | | One sky clock: beats keyed to solar elevation, sun keyed to date | `sky-almanac.ts` declination/hour-angle at 35° N, DST detect; beats: night e<−10°, blue −10…−1°, golden −1…+8°, day >12°, dawn mirrored; sun elevation from e scaled to `NOON_ELEVATION` apex | S2 P4 R3 | M | M | CPU only | `day-cycle-beats.ts:21-42`; `garden-sun.ts:51` | fixed `SUNRISE_HOUR`/`SUNSET_HOUR` + hour-edge constants | Strengthens clock premise; latitude stated in DOM "about" | Broad re-baseline of beat tests and fixed-`#t` frames; interacts with light-1 bearing and light-6 drift |
| sky-8 | | Weather as calm poetry: a descending ladder instead of flashes and milk | From sky-4 cover + `stormLevel` in dome: crepuscular slots ≤+6% (cover>0.4 replaces god rays), rain/snow veils cover>0.65 α≤0.25; height-fog storm gain 1.2→0.3; lightning = intra-cloud glow ≤+12% max once/90 s; delete key multiplier | S3 P4 R4 | M | M | 0/0/+0.03 ms/0 | `garden-height-fog.ts:65`; `wr:4197-4199` | lightning flash; storm fog gain; billboard pills | Storm still maps PSI with same DOM text; precipitation form is kigo; no whole-frame flashes (photosensitivity win); reduced motion static veils | Rainbow rejected (anti-solar point behind camera); LaneWater storm chop must agree; overlaps LaneLight god rays / headroom-2 |

### Defects

| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| 1 | Golden hour is an orange fog wash | `golden.png` above y 560; `wholemap-dusk.png` top 55% flat `#e5a75b`; far band L\*73.7±1.2 same hue | horizon/lower hemisphere/`THREE.Fog` share `#dca76c` `gs:48`, `:550`, `:561`, `:382` | defects 2+4, sky-1, sky-2 | M |
| 2 | Ember band pinned to camera axis, not sun; blue hour salmon | `blue.png` y 280 `#a97870` (hue≈10°) vs authored `#595773` | `gs:378` west=camera-forward (`projection.ts:20`); `:564` 0.22×ember | Anchor to `uSunDir` azimuth; zero ember at blue (sky-1) | S |
| 3 | Blue hour lit by a sun still up (+5.8° at 18:45; golden ends at +9.5°) | "blue hour" frame with daylight scattering | `SUNSET_HOUR = 19.5` `garden-sun.ts:51`; blue beat 18.25–19 `day-cycle-beats.ts:36-38` | sky-7 | S–M |
| 4 | Borrowed hills are translucent ghosts | `noon.png` right peak L\*83–92 vs sky 92; `night.png` L\*2.8–3.7; only `blue.png` cone readable (1440,290) | alpha 0.34+layer×0.035 `garden-horizon.ts:156`; 11-pt profiles | sky-3 | M |
| 5 | Moon never in frame, no phase | `night.png`/`deep-night.png` no moon | `GARDEN_MOON_AZIMUTH 0.62π`, `ELEVATION 0.29π` `garden-sun.ts:75-76` | sky-5 | M |
| 6 | Night sky flat void; stars blink | zenith→horizon L\*2.4–3.4 (`#010b24`) vs bible 9/14/11; 22:00 = 02:30; `sky/night-stars-motion.png` subsets flicker | stars v∈[0.06,0.88] `gs:408` (~16/720 in frame); twinkle 0.55+0.45·sin(1.4t) `:438-449` | sky-6 | S |
| 7 | Mist-bank billboards read as bright scratches | `blue.png` (500–640,478), (880–1010,465); `dawn.png` far left y≈470; `sky/_horizon-left-strip.png` | `MIST_BANKS` 30–62×4–9 u additive `garden-sky-billboards.ts:95-106`; ×2.1 squash `:198` | Delete (Subtractions); sky-3 kasumi | S |
| 8 | Market stress makes world paler + summons rejected pills | `sky/stress-noon.png` far band L\*91.6; lozenges (370,300), (1045,375), (1110,335), (900,355) darker than sky | `CLOUD_SHADE_DAY` = zenith `gs:225-226`; cumulus re-enabled clarity<0.65 `:692-693`; storm fog ×2.2 `garden-height-fog.ts:65` | sky-4, sky-8 | M |
| 9 | Cloud shadows fall from an empty sky | `noon.png` water mottling | cloud shadow 0.34 `gw:2087-2088`; cumulus off `gs:201` | sky-4 (one field, one cover) | S |

### Subtractions
- Billboard cumulus `CLOUDS` + `CLOUD_FRAGMENT_SHADER` `garden-sky-billboards.ts:108-114`, `:214-243`, and bypass `gs:692-693`.
- All 9 far `MIST_BANKS` `garden-sky-billboards.ts:95-106` (keep `localMist` epistemic banks).
- Moon spheres `createMoon` `gs:462-489`.
- View-axis ember band `gs:378-380`, `:564`.
- Clear-noon haze floor `uHazeStrength` 0.42→0.12 `gs:588-591`.
- Lightning key-light multiplier `wr:4197-4199`.
- Static autumn geese (`AUTUMN_GEESE`, `driftSpeed 0`, `STATIC_VERTEX_SHADER`; mark ~(900,300)) — delete or make one dusk skein ~90 s (LaneLife).
- Double fog (linear + height) → one aerial function (sky-2; `gs:512`, `garden-height-fog.ts`).

### Reversals
- "Sea horizon and lower hemisphere share live fog exactly" (`gs:381-382`; `sky-seam-defects.md` A) · 180-px band std L\*1.2 in noon/golden/stress; backdrop seam gone (annulus `gw:1729-1754` + perspective) · risk: annulus must fog out by 480 u at whole-map.
- Fixed moon "upper-left" (`garden-sun.ts:67-76`) · 113° off-axis, never in frame, no phase · risk: night key frontal/backlit (LaneLight).
- "Dense Milky Way/HDRI sky rejected" (`sky-time-ideas.md:57`), partial · night L\*2.5 void; ≤3% band only moonless/clear · risk: — (rejection targeted spectacle).
- Beats as fixed clock hours (`day-cycle-beats.ts`) · blue hour with sun +5.8° · risk: broad re-baseline.
- Not reversed: billboard cumulus off / raymarch rejected (ledger :18-19) · sky-4 is a third route meeting re-entry condition.

---

## light

Verdict: Key light is behind the Pharos all day (noon sun 176° from eye, `garden-sun.ts:33`); tower faces equal (#838072/#848172 noon, #673d15/#693f16 golden); only fill lights what we see; night value correlation r = −0.19.

### Value plan, measured (mean L\*, ninths; bible in brackets) — reproduced

| noon | Left | Centre | Right |
|---|---|---|---|
| Top | 76.0 (60) | 73.7 (72) | 73.1 (68) |
| Mid | 63.2 (27) | 67.8 (45) | 76.7 (42) |
| Bot | 31.9 (15) | 28.8 (38) | 30.2 (23) |

| golden | Left | Centre | Right |
|---|---|---|---|
| Top | 63.4 (35) | 61.5 (52) | 62.7 (43) |
| Mid | 50.0 (20) | 50.9 (32) | 62.1 (26) |
| Bot | 24.3 (10) | 19.8 (25) | 23.6 (15) |

| night | Left | Centre | Right |
|---|---|---|---|
| Top | 2.4 (9) | 4.9 (14; beacon 92) | 2.1 (11) |
| Mid | 3.4 (5) | 8.4 (12) | 3.9 (8) |
| Bot | 7.0 (3) | 5.2 (7) | 7.3 (4) |

| Beat | Frame mean vs bible | Correlation r | MAE | Notes |
|---|---|---|---|---|
| Noon | 58 vs 43 | 0.73 | 16.6 | 25.6 % of pixels have L\* > 85 |
| Golden | 47 vs 29 | 0.73 | 19.0 | Tower mid mean 34, sky 64 (bible: tower 57 > surroundings) |
| Night | 5.0 vs 8.1 | **−0.19** | 4.8 | Beacon max 93 ✓ |

Also: `morning.png` = `noon.png` within 1 L\* every ninth; `deep-night.png` = `night.png` to 0.1 L\*; `blue.png` (44/43/44, 28/32/39, 12/9/14) closest to bible dusk. Tool: `outputs/opus-review/light/ninths.mjs` (proposed as value-plan gate for every beat).

### Ideas

| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| light-1 | ★ | Turn the sun: the noon key at the viewer's right hand | `NOON_BEARING = atan2(-1,1)` (−45°, camera right; tune −30…−60°), keep ARC_SWEEP 1.0, NOON_ELEVATION 0.62; rim from pose; golden god-ray march skipped (−1 half-res draw); re-key `DAY_GRADE`/LUT contrast | S5 P4 R3 | H geometry / M bearing | M | 0/0/0/0 (−1 half-res draw at golden) | `garden-sun.ts:33`, `:40-47`, `:104-115`; `gw:1215-1228`; `generate-garden-luts.mjs:78`; `wr:4006-4046` | backlit calibration; golden god-ray march; orange hemi-ground as face light | Pure illumination; reduced motion unaffected | **Land first** — affects any lane assuming sun behind tower (god rays, water sun road, sky Mie); re-pin `garden-sun.test.ts`; check golden right-mid ninth ≤30 (fleet brighter) |
| light-2 | ★ | Warm key, cool shadow: complementary rigs and authored per-beat exposure | Golden key `sun_day_warm.lerp(lantern_warm,.45)` @3.0; golden hemiSky `fog_blue.lerp(sky_day_zenith,.45)` @.5, hemiGround `stone_mid.lerp(deep_sea_1,.3)`, ambient .08; dawn ground `stone_mid`; `DAY_CYCLE_EXPOSURE` {dawn 1.0, day .96, golden .84, blue 1.0, night 1.15} | S5 R4 | H | S | 0/0/0/0 | `gdc:115-161`; `wr:878`; `gp:44`, `:132-139` | orange ground bounce; golden highlight tint; LUT orange boost; constant exposure 1.12 | Anchors untouched; tier-invariant; authored exposure ≠ rejected auto-exposure (`01-implementation-plan.md:344`) | Re-check 2.4 bloom knee at night; `garden-day-cycle.test.ts` pins; env map cools via LaneSky dome; **overlaps printmaker-1 (shade ink) and printmaker subtraction 3** |
| light-3 | ★ | Night is one lamp and one moon: move the moon into the frame | Key/rim read `gardenMoonPose(hour)` (az ±23°, el 1.4°–8.9°); moon key `moonlight.lerp(fog_blue,.5)` @.4 back-rim; hemiSky `sky_horizon.lerp(fog_blue,.4)` @.16; beacon PointLight night×8.2→×3.0; view-dependent road ~6 u via `halfMoon` glitter; moonless = sky fill ~.25× | S4 P5 R5 | M-H | M | 0/0/0/0 | `garden-sun.ts:75-76`; `gdc:152-160`, `:372`, `:405`; `gw:1173-1199` | sideways road stripe; floodlit olive facade; cyan front key | No data; reduced motion road glitter freezes | Moon pose owned by LaneSky (sky-5); road = water-4/printmaker-6 dup; disc ≤L\*80 below 2.4 knee; re-measure 0.016 open-night budget; moon-road tests |
| light-4 | | Sun-coloured transmission: sails glow like shoji when backlit | Publish shared `uKeyColor`; sails transmission = dye×uKeyColor×pow(max(dot(V,−L),0),2)×wrap×(1−ink); flora same at 0.25 tinted `aurora_green`; `GARDEN_SAIL_EMISSIVE.day` .06→.03 | S4 P4 | M | S-M | 0/0/+~6 ALU <0.05 ms (×4 DPR2)/0; 0 new attributes | `gfb:1043-1047`; `gdc:168-172`, `:329-334`; `garden-flora.ts:30-40` | colourless `uBacklight` add; part of sail day emissive | Hue = albedo×key so issuer identity holds; tier-invariant | LaneFleetCraft owns `uBacklight` retune; keep `FLEET_CLOTH_RADIANCE_CEILING`; sail L\* ≤ tower L\*; sail program at 16-attr cap |
| light-5 | | A material ladder: wet stone, lacquer, glazed tile, timber, moss | Tide band roughness 0.3, albedo ×0.75; torii roughness 0.35, envMapIntensity 1.2; kawara roofs 0.45; decks 0.75; tower ashlar ±6% albedo ±0.08 roughness by block hash 0.9×1.6 u | S4 | M | M | 0/0/<0.1 ms/0 | `garden-tide-line.ts`, `garden-tide-stain.ts`, `garden-torii.ts`, `garden-island.ts:1735`, `garden-harbor-batch.ts` (`palette.ts:72-74`), `garden-lighthouse.ts:263-277` | uniform plastic roughness 0.9–1 | No data; tier-invariant | Keep away from ships (shimmer); `garden-shader-hygiene` tests; LaneGardenMaster/LanePharos; near printmaker-8 per-material families |
| light-6 | | Time you can see inside a beat | Day `airT = smoothstep(7.25,16.25,hour)`: key lerps toward `sun_day_warm` by 0.12·airT, fog density 0.9×→1.15× (LaneSky param); night key/rim/road follow moon arc | P3 R3 | M | S | 0/0/0/0 | `day-cycle-beats.ts:21-30`; `gdc` | static plateaus | Clock only | Moon re-steer throttled by `SHADOW_RESTEER_RADIANS`; overlaps sky-7 (date/elevation beats) and sky-6 star rotation |
| light-7 | | Soft low-sun shadows: a per-beat penumbra | `shadow.radius = lerp(3,7,lowSun)`, lowSun = 1−smoothstep(0.12,0.5,elev) in `updateShadows`; N8AO aoIntensity day 3→3.5 | S3 | M | S | 0/0/0 (taps unchanged)/0 | `wr:2003`, `:4090`; `gp:152` | uniform softness | None | Re-check `normalBias .35` acne; **alternative to headroom-8 (PCSS-lite)** |

### Defects

| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| 1 | Key light behind the hero dawn→dusk | Faces equal noon/golden; `noon-island.png` cornices lit, shafts flat, no visible cast shadow | `garden-sun.ts:33`, `:47`, `:104-115`; `projection.ts:20, 96-98` | light-1 | M |
| 2 | Golden = four warm sources, no cool complement | sky #ac727b, haze #e9aa5f, tower #673d15, island #462609 all hue 30–40°; tower 34 vs sky 64; `golden-close.png` orange veil | key `lantern_warm` 3.84 `gdc:137-138`; hemiGround `timber_mid` `:139`; fog 50% `fog_day` `:216-219`, `garden-height-fog.ts:158-163`; ember `gs:378`; IBL 0.45 `garden-environment.ts:135`; `GOLDEN_GRADE` `gp:136-139`; LUT `generate-garden-luts.mjs:85-86` | light-2 (+ LaneSky dome) | S (M with dome) |
| 3 | Night value inverted; moon road sideways stripe; olive facade | sky L\*~2 vs 9–14; bottom row 7/5/7 > top 2/5/2; `night.png`/`deep-night.png` strips y≈680–770; facade #302e1c | moon `garden-sun.ts:75-76`; road `gw:1173-1178`; beacon PointLight 9.15 `gdc:372`, `garden-lighthouse.ts:799-804`; cyan key `gdc:152-160` | light-3 | M |
| 4 | Noon "milk" brightest element | mid-row p90 92–93 L\*; haze #e5e9ee L\*≈92 > tower 52; ninths +36/+23/+35; `morning-close.png` 65% white wall | exposure 1.12 `wr:878` | light-2 exposure + LaneSky fog | S |
| 5 | Illumination does not move within beats | `morning.png` = `noon.png`; `night.png` = `deep-night.png`; ~18 of 24 h show two pictures | day flat 07:15–16:15 `day-cycle-beats.ts:29-30`; night 20:00–04:45 `:21-22` | light-1 then light-6 | S |
| 6 | Tower rim uses a frozen sun | rim masks toward old noon sun at night | `uLighthouseRimSunDir = (-35,45,-30)` `garden-lighthouse.ts:252` | write `pose.direction` each frame in `updateLighthouseRimLight` (in light-1) | S |
| 7 | Close postcards blur the hero | `golden-close.png` (zoom 1.6) lantern/upper shaft soft | tilt-shift band at sea-level target `gp:589-638` | bias band by `targetHeight` or exempt depth nearer than tower silhouette | S |

### Subtractions
- `GOLDEN_GRADE`/`DAWN_GRADE` warm split `gp:132-139`: highlightTint `[1,1,1]`, split .35.
- LUT golden & night orange boosts `generate-garden-luts.mjs:85-86, 94-95` (hue 38, sat 1.04).
- Orange hemisphere-ground bounce (`timber_mid`) dawn & golden `gdc:121, 139`.
- Beacon PointLight night surplus `night*8.2` → ~`night*3.0` `gdc:372`.
- Golden god-ray march once light-1 lands `gp:1774` (`phaseRayWeight` = dawn only).
- Keep (explicitly not subtracted): Neutral tone mapping (no AgX), 2.4 bloom knee, MSAA+SMAA, paper tooth 0.035.

### Reversals
- "Noon must not move" + backlit arc (`garden-sun.ts:26-33, 40-45`; ledger "Do not widen ARC_SWEEP", "Park lowering sun") · sun 176° from eye; equal faces (#838072/#848172, #673d15/#693f16); no cast shadow; midday flatness ×2 in ledger · risk: grade/AO/IBL re-key, sun/shadow/sky test re-pins; sun disc + god rays leave golden frame.
- Moon behind the camera (`garden-sun.ts:75-76`) · never in any frame; road sideways · risk: competes with beacon; cap luminance.
- W2.5 key:fill ratios as the contract (`01-implementation-plan.md:152`) · nominal 5:1/8:1 met, on-screen face ratio 1.0; replace with on-screen lit/shade L\* ratio noon ≥1.6, golden ≥2.0, dawn ≤1.3 · risk: tests must read frames or sample analytic normals.

---

## printmaker

Verdict: Renders as lit 3D diorama with thin Japanese grade; every "plate" shares one ink — golden far fog (232,171,99) ≈ sky (237,170,96), tower (103,62,20) same amber; night sky/grove/station within L\*1–3.5 so silhouettes vanish.

Measured L\*: golden sky 74.6, far fog 74.2, tower 30.2; night upper sky 2.0, near-horizon 3.4, left grove 1.1, left station 3.5, open water 3.9, pale band lower-left 15.5, right 20.4; noon sky 86.1, far haze 92.3, near water 27.8. Mocks (image maths, not renders): `mock-golden-aizuri.png`, `mock-night-beroai.png`. No usable stress frame.

### Stylisation ladder (each rung includes those below; nothing touches sails/mon, flags, pennants, practicals, cue markers, sea signs, DEWS zone colours, DOM)

| Rung | Name | Adds | Visitor notices | Cost |
|---|---|---|---|---|
| 0 | today | parametric grade, LUT, blue-noise grain | "nice 3D diorama, warm filter" | — |
| 1 | Subtle — shade plate | pm-1 at 60 %, pm-7, subtraction 2 | golden stops being sepia; nothing looks filtered | S–M |
| 2 | Composed — night print | pm-5, pm-6, pm-3-lite (calm chop only), pm-2 at golden/blue/night (noon 0) | silhouettes at night; crown drawn at dusk | M |
| 3 | Printed — harbour as hanga (**recommended**) | pm-1 100 %, pm-2 every beat (noon 0.25), pm-3 full, pm-4 steps N=3 | layered planes; engraved risk water; calm left blank | M–L |
| 4 | Identity — shin-hanga (operator taste call) | pm-8 per-material ink ramps | authored limited palette per hour; unmistakably a print | L |

Rung-3 GPU ≈ +0.3–0.4 ms @1x, ≈1.2–1.6 ms DPR 2 [INFERENCE]; keyline dominates; half-res depth fallback; 0 draws/tris/net textures, no CPU.

### Ideas

| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| printmaker-1 | ★ | Ai-zuri shade plate: complementary ink in the indirect light only | After `lights_fragment_end`, mix indirectDiffuse to luma×luma-normalised `uAiInk` by `uAiAmount·uAiMask`; inks dawn `fog_pale` .35, day zenith→`shallow_teal` .15, golden `fog_blue` .6, blue `sky_horizon` .5, night `deep_sea_1` .45; new `garden-print-inks.ts` | S5 P4 R3 | H | M | 0/0/≈+0.03–0.06 ms (×4 DPR2)/0; one-time recompile | `gdc:139`, `:316-335`; `garden-environment.ts:687-690`; `garden-island.ts:702-741`; `garden-lighthouse.ts:286-312`; `gfb:777`, `:887`, `:1193` | orange ground bounce as shade colour; golden/blue grade `shadowTint` split →1.0 | Exempt sails (`userData.gardenSailAtlas`), far identity, flags, practicals, cue markers, hull strakes; energy-preserving (`garden-environment.test.ts:288`) | Zero-code pre-test: golden hemiGround = night value; cap hull amount 0.5×; key:fill/PMREM retune after (LaneLight); overlaps light-2 fill |
| printmaker-2 | ★ | Sky-contact keyline: key block cut only where form meets sky | `GardenKeylineEffect` first in `gradePass`: 4 depth taps, darken where geometry pixel neighbours depth-1.0 sky; width max(1, H/1000) px; fade from fog.near+0.15→0.5·range; ink dawn .35, day .25 (0 rung 2), golden .5, blue .5, night .45 | S4 P4 R3 | M–H | S–M | 0/0/≈+0.1–0.2 ms (0.4–0.8 DPR2)/0 | `gp:699`, `:1611-1618`; `gs:84-104`, `:300-301`; `garden-horizon.ts:118`; `garden-sky-billboards.ts:301` | need for more rim light (tower rim gain −~20%) | No meaning; improves silhouette legibility for low vision; logos never adjacent to sky depth | Night needs pm-5 sky lift; verify rigging at 2560×1440 vs W0.2 (`gp:1519-1522`); reverses §6 outline rejection selectively |
| printmaker-3 | ★ | Engraved water: risk drawn as carved lines, calm left blank | Replace `gw:1062` tone with `aaStep` crest lines from existing band phases (widths watch .08, alert .07, warning .10, danger .12); ink day 0.35 highlight, dusk α.2, night `moonlight` α.12; fwidth moiré guard 5–12 px; open/harbour/ledger blank; day Gerstner 18→11, 2nd octave ×0.6 | S4 P5 R4 | M | M | 0/0/<0.1 ms/0 | `gw:769`, `:729-748`, `:772-798`, `:1062` | photoreal near chop; invisible tone modulation | Non-colour DEWS carrier (PRODUCT.md a11y win); ledger sentence per band rhythm; reduced motion lines static; zone colours unchanged | Pairs with water-3 (line density follows roughness); fade under hull contact; signature-constant test pins; **Gerstner number conflicts with water-5 (~8)** |
| printmaker-4 | | Two-ink, stepped aerial perspective (Yoshida's planes) | In `injectGardenHeightFog`: fog colour = mix(uAirInk, fogColor, smoothstep(.55,1,f)); golden `fog_blue`→horizon .35, dawn `fog_pale`, else unchanged; rung 3: 3-step f quantise on object materials only | S4 P4 R4 | M | S–M | 0/0/<0.05 ms/0 | `garden-height-fog.ts:276-281`; `gs:550`, `:561` | amber wall; need for golden LUT warm bend | None; stale-source haze `garden-height-fog.ts:34` independent | Steps may contour on long quays; check annulus/dome seam at `cam=…,0.28`; **overlaps sky-2 and headroom-2 fog ownership** |
| printmaker-5 | | Night silhouette law: bero-ai sky over darker land | Sky L\* ≥ 2× land; LaneSky targets zenith L\*≈7 `#0e1530`, horizon ≈15 `#1b2440`, ridges 9–11; authored proposal night horizon `#11182c`→`#26456e`, zenith `#050918`→`#0e1a3c`; keep deepGain .24, hue H 255–265, chroma ≤.07; hold night hemi/ambient | S5 P5 R4 | H | S | 0/0/0/0 | `gs:51`, `:138`; `gdc:152-160`; `gw:440` | black void | Raises silhouette contrast; beacon brightest | LaneSky owns numbers (= sky-6); prerequisite for pm-2 at night; **conflicts with light-3 hemi lift (light raises hemiSky; pm-5 holds hemi)** |
| printmaker-6 | | Printed moonlight: column of broken horizontal strokes toward viewer | Road axis from eye toward moon azimuth; slats pitch 1.6+0.02·along, hashed half-lengths, `aaStep(0.62, sin(...))`; ~40% duty keeps `moonRoadGain` budget, peaks ≤1.6× old (<2.4 knee); glitter masked to slats | S4 P5 R4 | M | S–M | 0/0/≈0/0 | `gw:1173-1199` | gaussian band fill `gw:1180-1184` | None; slats static (no `uTime`) | Needs in-frame moon (sky-5); **duplicate of water-4 / light-3 road — one owner** |
| printmaker-7 | | Washi and goma-zuri in flat fields only | Seeded 256² washi in LUT script, packed into G of blue-noise tex (64²→256² RGBA, R=dither); `display *= 1+(tooth−.5)·.02·w`, w = flat-field fwidth(luma) gate × midtone; screen-anchored, static | P3 R2 | M | S | 0/0/≈+0.05 ms/0 net | `gp:329-330`, `:342`, `:475-483`; `generate-garden-luts.mjs` | blue-noise tooth (1/255 dither stays) | Logos excluded by gate | Hold ≤2% (dirty-lens risk in pans); **conflicts with headroom-6 channel plan (R blue-noise, G fbm)** |
| printmaker-8 | | Per-material ink ramps: limited layered palette (top rung) | 3 inks per family (stone sumi/`stone_pale`/cream; foliage ai-green/moss/yellow-green; timber kogecha/`timber_mid`/honey; roofs) × 5 beats in LUT strip 1024×160→1024×180; luminance-preserving mix ×0.6 via `userData.printFamily` | S5 P5 R3 | L–M | L | 0/0/≈+0.1 ms/0 net | `generate-garden-luts.mjs`; LUT strip | most LUT hue-band work (`LUT_STRENGTH` .9→.5); golden/blue split tones | Identity surfaces exempt; static | Subsumes pm-1 install; risk of "grade repairing composition"; shader-text tests; operator taste (rung 4); near light-5 material ladder |

### Defects

| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| 1 | Golden hour is one amber ink | `golden.png` whole; `golden-close.png`; `wholemap-dusk.png` land; fog ≈ sky within 5 RGB | hemiGround `timber_mid` `gdc:139`; key 3.84 `lantern_warm` `:137`; fog=horizon `gs:550,561`; grade shadowTint 2% nudge `gp:136-139` | pm-1, pm-4 | S–M |
| 2 | Night has no silhouettes | `night.png`, `deep-night.png` left third; sky 2.0–3.4 vs grove 1.1, station 3.5 (bible sky 9–14 over grove 5, `VISUAL_INVARIANTS.md:26-28`) | `gs:51` night beat | pm-5 (numbers LaneSky) | S |
| 3 | Moon road horizontal airbrush smear | `night.png` x0–600 y740–790 L\*15.5; x1300–1500 y650–690 L\*20.4 over water 3.9; `crop-night-bands.png` | `gw:1173-1184` (`roadHalfWidth 6.0`) | pm-6 | S–M |
| 4 | Near-water chop photoreal and busy | `noon.png` bottom-centre; `crop-noon-water.png` | normal octaves `gw:729-732`, `:742-748`; Gerstner 18.0 `:769` | pm-3 | S |
| 5 | Night beacon beam reads as lens dirt | `night.png` x690–750 y200–290; `deep-night.png` x820–890 y200–290; `crop-night-beam.png` | beam cone (LanePharos) | fade by 1−abs(dot(beamDir,viewDir)) or flat pale wedge with one hard edge | S |
| 6 | "Paper grain" is blue noise | 64-px dither tile at 1.7× at 0.035 | `gp:342`, `:475-483` | pm-7 | S |
| 7 | Noon haze is a white slab | `noon.png` y330–520 L\*92, sky 86 vs bible 68–72 (`VISUAL_INVARIANTS.md:26`) | (LaneSky fog/haze) | LaneSky | S |

### Subtractions
- Gaussian moon road fill `gw:1180-1184` — remove before pm-6.
- Blue-noise paper tooth `gp:342`, `:475-483`: `PAPER_GRAIN_STRENGTH` → 0 now.
- Golden orange ground bounce `gdc:139` (`hemiGround: timber_mid`) → night ground value.
- Near-field chop by day `gw:769` gain 18→11; second octave 0.6×.
- Do-not-add list: woodblock misregistration, "kento" channel offset, chromatic aberration, monochrome ink filter, animated grain (upholds §6).

### Reversals
- Plan §6 outline rejection (`01-implementation-plan.md:336`) → sky-contact keyline (pm-2) · `crop-golden-tower.png` crown melts into same-hue sky; `night.png` silhouettes lost; technique doesn't equalise edges, tax logos, or fight calm · risk: thin rigging thickening (2560×1440 gate).
- Plan §6 paper grain (half-reversed in code at 0.035 since 2026-09-07 as blue noise) → flat-field washi (pm-7) gated by `fwidth` · risk: dirty-lens read >3%.
- Not a bible reversal: implementation reading of "Night is dark" (`VISUAL_INVARIANTS.md:54-56`) · bible table asks sky 9–14 over land 3–5, code rendered L\*2–3 · pm-5 restores bible.

---

## headroom

Verdict: @1x/60 Hz baselines understate operator load ~7× (DPR 2 ≈6 MP at 120 Hz); per-pass `gpu` line sums ~45 ms vs 13.9 ms frame — fiction; textures full (72/72 whole-map); binding costs are CPU/frame and retina fill.

### Headroom table (reference M5 Pro, noon rest frame) — verbatim

| Resource | Current | Ceiling | Free | Note |
| --- | ---: | ---: | ---: | --- |
| Draw calls (recurring) | 277–293; census 279 | 700 (`preview.mjs:115`) | ~410 | 84 are hairline wake lines, 24 are post quads, ~21 are hero-reflection repeats |
| CPU cost per draw | ~11 µs [INFERENCE: 3.1 ms submit / 279] | — | — | +100 draws ≈ +1.1 ms main thread |
| Triangles | 378–382k | 500k | ~118k | rim+flora 117k, fleet 93k (184 ships), lighthouse 73k, reflection repeats ~48k |
| Geometries | 192–202 | 500 | ~300 | not binding |
| Textures (`renderer.info`) | 50–52 | 72 | ~20 | what `--assert` reads |
| Textures (census, renderer allocations) | 67 default, **72 whole-map** | 72 | **5 / 0** | `TESTING.md:382-388`: "do not raise". **Binding.** |
| CPU per frame | sample 1.5–1.8 + hits 0.3–0.6 + submit 2.5–3.6 = **4.3–6.0 ms** | 16.7 (60 Hz) / **8.3 (120 Hz)** | ~11 / **~2.5–4** | at 120 Hz the CPU is the tight resource |
| GPU @1600×1000@1x | not measurable from the `gpu` line (see Spell-breaker 1); held 120 fps / p50 8.3 ms on 2026-08-13, before god rays, tilt-shift and hero reflection (`garden-post.ts:1527-1529`) | 16.7 / 8.3 | ≥8 ms at 60 Hz; **unknown at 120 Hz today** | |
| GPU @2560×1440@1x (3.7 MP) | 60 fps, 0/120 dropped (`noon-1440p.txt`) | 16.7 | >0, not quantified | |
| GPU @DPR 2 (~6 MP, the operator's display) | **unmeasured serially** | 8.3 @120 Hz | **unknown** | measure first (idea 4) |
| three.js | 0.185.1, postprocessing 6.39.4, n8ao 2.0.0 (`package.json:81-95`) | — | — | Same revision as the July NO-GO spike, so **nothing new is unlocked**: 1,725 GLSL lines, no pmndrs/N8AO WebGPU path (`webgpu-spike-report.md:106-111`). WebGL2 stays. |

### Technique cost catalogue (Δ vs noon rest, 1600×1000@1x) — verbatim
All ms figures are **[INFERENCE]** from pixel and tap arithmetic. Basis: an M-series Pro GPU does a bandwidth-bound RGBA16F full-screen read+write at 1.6 MP (~26 MB) in about 0.1 ms. Multiply every per-pixel figure by ~4 at DPR 2, and halve the frame budget at 120 Hz. Verify each one with idea 4's knockout harness.

| Technique | Δdraws | Δtris | ΔGPU ms | Δtex | Risk | Tier gating | Verdict |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Analytic in-scatter in the fused grade pass: height fog + sun Mie + beacon beam (idea 2) | −3 (beam cone, dust, halo) | −~1.3k | +0.10–0.20 | 0 | double fog with `Fog` (`garden-sky.ts:512`) | full/balanced; recovery = fog only | **Do** |
| Existing shadow-march god rays (36 steps, half res) | 0 | 0 | +0.3–0.6 (dawn/golden only) | 1 | — | full | Keep; fold into the above at 16 steps |
| Screen-space radial shafts | +2 | 0 | +0.1 | +1 | ghosts through occluders (`garden-lighthouse.ts:952-955`) | — | Reject |
| Raymarched froxel volume | +2–3 | 0 | +0.6–1.2 | +1 (3D) | overkill for a clear harbour | — | Reject |
| PCSS-lite contact hardening (16 blocker + 16 PCF taps) | 0 | 0 | +0.2–0.4 | 0 | patches `shadowmap_pars` for every MeshStandard | full only | Do, low sun only (idea 8) |
| VSM/ESM prefiltered static map | 0 (+2 on re-steer) | 0 | −0.05 | +1–2 | light bleeding on terraces; texture slots | — | Reject (texture ceiling) |
| Cascaded shadows | +casters on re-steer | +~250k on re-steer frames | +0.05 | +1–2 | fitted plate already covers the view (`world-renderer.ts:4007-4046`) | — | Reject (plan §6:344 still right) |
| Hero planar reflection (exists) | 21 | ~48k | +0.3–0.5 | 1 | — | frozen when reduced | Keep; LOD it (idea 7) |
| Near fleet in hero reflection via `fleet-far-*` proxies | +6 | +3k | +0.05–0.1 | 0 | instance filtering | full | Optional |
| SSR on water | +1 pass | 0 | +0.4–0.8 | +2 (MRT) | patch every material for normal/mask | — | Reject |
| TAA / TRAA / temporal upsampling | +1–2 | 0 | +0.2 | +2–3 | velocity needs previous instance matrices, but the sail program is at the 16-attribute cap (`garden-fleet-batch.ts:1070-1073`); ghosting on bobbing hulls | — | Reject (contract stands) |
| Supersampling (DPR 1.5 on DPR-1 monitors) | 0 | 0 | scene fill ×2.25 (+1–2) | 0 | fill on weak GPUs; governed | full + governor | Do (idea 1) |
| Alpha-to-coverage | 0 | 0 | 0 | 0 | no `alphaTest` materials exist | — | N/A |
| Cloth sail billow, vertex only (idea 5) | 0 | 0 (+20–40k if sails ×4 tessellated) | +0.02 | 0 | hit targets use CPU geometry | all; reduced = static belly | Do |
| Foliage wind (exists, `garden-flora.ts:148`) | 0 | 0 | ~0 | 0 | — | — | Extend to rim pines |
| Far-fleet impostors (exist: `fleet-far-*`, 6 draws, 3.3k tris) | — | — | — | — | octahedral atlases cost textures | — | Done; do not re-open |
| Cloud dome in the existing sky shader | 0 | 0 | +0.10–0.25 | 0 (procedural) / +1 | must obey the PSI clarity channel (D15) | full 4 octaves, balanced 2 | Do (sky lane) |
| Petals/fireflies as one GPU-animated `Points` draw each | +1 each | 0 | <0.05 | 0 | overdraw at DPR 2 if sprites >8 CSS px | full/balanced; reduced = few static | Do |
| N8AO full res or more samples | 0 | 0 | +0.3–0.6 | 0 | invisible under grade (`garden-post.ts:221-226`) | — | Reject |
| FFT ocean | +1–2 | 0 | +0.5–1 | +2–4 | texture ceiling | — | Reject (plan §6) |

Note: all DPR-2 probes this lane attempted were void (tier `constrained`/timeouts); no DPR-2 timings quoted.

### Ideas

| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| headroom-1 | ★ | Retina-true pixel budget: post chain in CSS pixels, AA by DPR | `internalScale = 1/effectiveDpr` for N8AO, bloom, god rays, tilt-shift, hero reflection (`floor(size/(2·dpr))`); `smaaPass.enabled = dpr < 1.75` + dispose; DPR-1 supersample ceiling max(req,1.5) under governor | S3 R3 | M | M | 0/0/post pixel work −~70% at DPR2; DPR-1 supersample +1–2 ms/−4 (SMAA off at DPR≥1.75) | `gp` setSize path; `garden-hero-reflection-pass.ts:108-109`; `gp:830`, `:1077-1082`; `render-surface-budget.ts:207-209` | SMAA on retina; ¾ of AO/reflection/ray pixels at DPR 2 | None; reduced motion unchanged | Needs serial DPR-2 baseline (headroom-4); AO halo +1 CSS px; `world-renderer.test.ts:867` DPR arm; reverses W0.2 |
| headroom-2 | ★ | One air: depth-aware in-scatter (sun, fog, beacon) in fused grade pass | `GardenAirEffect` after god rays, before grade: closed-form exponential height fog, sun HG g=0.6–0.75, beacon beam analytic single-scatter (arctan) clamped to depth; σ tied to day-cycle fog colour, reduce material Fog equally; god rays 36→16 steps | S5 P5 | M | M | −3/−~1.3k/+0.10–0.20 ms/0 | `gp:1485-1489`, `:1611-1618`, `:1703-1704`; `gs:512`; `garden-lighthouse.ts:945-963`; `gw:552`; `garden-beam-dwell.ts:88` | beam cone, dust (40 pts), halo meshes; ortho-era scattering | Beacon DOM ledger + `garden-beam-dwell.ts` bearing unchanged; reduced motion beam frozen at `beamStaticBearing`, still volumetric | Fog double-count at horizon; banding (use LUT dither); night value plan (beacon 92); D15 PSI owns clarity aloft; **overlaps sky-2 / printmaker-4 fog ownership; beam fix overlaps printmaker defect 5** |
| headroom-3 | ★ | Ambient 60 Hz cadence on high-refresh, display rate while touched | Reuse idle gate: skip if not interacting and `time − lastWall < 16.7−4`; display rate in `interaction` tier, ease back 500 ms after calm; governor fed draw-duration p90 not pacing p90 | R4 (+enabler) | H | S | 0/0/halves CPU+GPU per second on 120 Hz; per-frame budget 8.3→16.7 ms/0 | `use-world-render-loop.ts:538`; `render-scheduler.ts:3`; `render-surface-budget.ts:4` | second frame of every 8.3 ms pair | One dt motion clock; reduced motion unaffected; interaction full-rate | LaneCamera/LaneChrome: interaction tier must cover every gesture; pacing tests |
| headroom-4 | | The cost oracle: serial uncapped knockout harness | `preview.mjs --uncapped` (`--disable-gpu-vsync --disable-frame-rate-limit`); `--knockout ao/bloom/smaa/rays/reflection/water-lanes/tilt` via test-global seam; Δ over 3 alternating serial runs; relabel `gpu` line, refuse `--max-gpu-ms` on Metal; DPR-2 baseline arm | enabler | H | S | debug-only; 0 production | `preview.mjs:110-111`, `:128`; `render-scheduler.ts:160`; `gp:1100-1216` | misleading HUD ms + per-pass line | None | **Schedule first** (with serial DPR-2 baseline), then headroom-3, -1; uncapped heats GPU |
| headroom-5 | | GPU-only motion kit: cloth, wind, petals, fireflies, pennants | Sail vertex belly sin(π·u)·sin(π·(1−v))·(0.12+0.05·gust), phase hash(instance xz), no new attributes; rim pines/bamboo wind; petals/fireflies one `Points` each via `gl_VertexID` curl paths ≤6 CSS px; pennants+yard merged | P4 R3 | H | M | cloth 0/0 (+20–40k if ×4 tess)/+0.02 ms; particles +1 each <0.05 ms; pennants −7 draws/0 | `gfb:1070-1073`; `garden-rim-mesh.test.ts:544-545`; `signal-mast-root` | JS pennant animation; per-frame CPU flutter; particles must displace an existing motion (e.g. fewer gull flaps) | Decorative, never data; reduced motion static belly, no particles | Sail tess funded by headroom-7; hit-target pick edge ≤0.1 u; `garden-fleet-batch` cache tests; LaneGarden/Life attention budget; light-4 shares sail program |
| headroom-6 | | Texture-slot economy: one packed "garden noise" texture | 256² RGBA8 pack (R blue-noise, G fbm, B Worley, A curl) shared by sky/water/air/particles; dither folds into R (net −1); SMAA −4 at DPR≥1.75; census manifest entry | enabler | H | S | 0/0/0/+1 pack −1 dither (−4 SMAA) | `gp:1666`; `TESTING.md:383-388` | per-lane noise textures; separate dither texture | None | Keep blue-noise tiling period; **channel assignment conflicts with printmaker-7 (G=washi)**; sky-4 cloud noise should come from here |
| headroom-7 | | Triangle reclaim: LOD proxies for reflection layer, rim-land decimation | 8k stone-shell proxy on `GARDEN_HERO_REFLECTION_LAYER` only (main shell leaves layer 7); slope-weighted simplify rim-land 42,740→~25k keeping silhouettes | enabler | M | S–M | 0/~−26k + ~−15–20k/0/0 | `wr:3298-3308`; `garden-rim-mesh.ts` `buildLandGeometry` | triangles only | None | Waterline silhouette mismatch (vs water-2 sharp contact + plinth); `garden-rim-mesh.test.ts` tri pins |
| headroom-8 | | Contact-hardening penumbrae at low sun (PCSS-lite) | `shadowmap_pars_fragment` patch: 16-tap Vogel blocker search, w=(d_recv−d_block)/d_block·lightSize, 16-tap filter; uniform switch (no define); full tier + sun <25° else PCF | S3 P3 | M | M | 0/0/+0.2–0.4 ms/0 | `wr:1986-2003`, `:4049-4109` | uniform PCF radius; hull casters (defect 4) | None; reduced motion identical | **Alternative to light-7** (radius lerp); variant churn; grazing acne; depends on light-1 long shadows |

### Defects

| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| 1 | GPU cost oracle reports fiction | per-pass ~9 ms each sum ~45 ms vs 13.9 ms frame (`noon.txt`); `golden.txt`/`morning.txt` p50 17.2/17.3 ms with 0/120 dropped; SMAA 10.3 ms (`wholemap-dusk.txt`) | `TIME_ELAPSED` queries `gp:1100-1216` [INFERENCE ANGLE Metal]; `--max-gpu-ms` `preview.mjs:128` | headroom-4 | S |
| 2 | White hairline wake scratches (84 draws, 30%) | `noon.png` ~1165,770 & ~820,830; `golden.png` ~950,795 & ~1180,772; `night.png` ~940,795 & ~1185,775; `headroom/crop-ship-wake.png` | `garden-ships.ts:2838-2861` 3-pt `GL_LINES` | delete `createWake` Line children (−84 draws, ~−0.9 ms CPU) | S |
| 3 | Beacon beam is a flashlight stuck in the wall | `night.png` ~700-760,215-290; `headroom/crop-night-beam.png` | ortho-era scattering `garden-lighthouse.ts:945-963` vs perspective `gp:1689-1691` | headroom-2 | M |
| 4 | Hull shadows baked into static map (stale ghosts; 93k-tri re-steer) [INFERENCE, not observed] | — | `hull castShadow = true` `gfb:1079` (sails cleared 1246-1265; comment 1241-1245); map on re-steer `wr:4096-4109` | `hull.mesh.castShadow = false` (contact discs `garden-ships.ts:2863` ground ships) | S |
| 5 | Tilt-shift doubles edges in close postcards | `selected-ship.png` purple flag ~600-700,380-420; `headroom/crop-tiltshift.png` | half-res σ2 blur, no foreground rejection `gp:640-700` | CoC-weighted gather rejecting nearer samples, same 2 targets, +~0.1 ms, 0 tex (Conf M) | M |

### Subtractions
- `ship-wake-detail` Lines `garden-ships.ts:2838-2861`: −84 draws, ~−0.9 ms CPU.
- SMAA at DPR ≥1.75 (`gp` chain `:1491-1639`): −3 full-screen passes, −4 textures.
- `lighthouse-beam-cone`, `lighthouse-beam-dust`, `lighthouse-halo` (`garden-lighthouse.ts:933-1095`) → headroom-2.
- Hull shadow casting `gfb:1079`.
- `signal-mast-root` 9 draws/216 tris → ≤2 (headroom-5).
- Per-pass `gpu` line + HUD "ms p95" as budget instruments on Metal (`gp:1100-1216`).

### Reversals
- W0.2 "keep both MSAA 4× and SMAA" (`gp:1497-1537`) · A/B only @1x (1.5% day / 8.5% night RMSE); at DPR 2 MSAA = 16 samples/CSS px; re-run A/B at `--dpr 2`, SMAA only <1.75 · risk: night lantern hoop.
- Per-pass GPU-ms readout as budget instrument (`render-perf-budget.md` §3, `gp:1100-1216`) · non-additive; p50 > vsync with 0 drops → knockout harness · risk: none.
- @1x/60 Hz reference captures as only perf truth (`TESTING.md:326-330`) · operator ~6 MP at 120 Hz (`render-surface-budget.ts:208-209`) → add serial `--dpr 2` + headed-120 Hz arms · risk: —.
- Beam as additive mesh cone (`garden-lighthouse.ts:952-955`) · reasoned for ortho camera; grade pass now has depth (`gp:1485-1489`) → analytic in post (headroom-2) · risk: —.
- Not reversed: WebGPU (D12; three 0.185.1 = NO-GO revision) · Not reversed: TAA (16-attribute cap blocks fleet velocity).

---

## Cross-slice clusters

**1. Sun direction / key light (land first).** light-1 (NOON_BEARING −45°), light-6 (in-beat drift), sky-7 (solar-elevation beats + date), sky-1 (sky follows `uSunDir`), light-7 / headroom-8 (low-sun penumbra). Reversal: light "Noon must not move". ⚠ light-1 flags every lane assuming sun behind tower (god rays, water sun road, sky Mie). ⚠ sky-7 changes sun elevation law while light-1 changes bearing — co-own `garden-sun.ts`. ⚠ **light-7 vs headroom-8** are alternatives for the same penumbra (radius lerp S vs PCSS-lite M).

**2. Golden-hour de-sepia (warm key / cool shade / sided sky).** sky-1, light-2, printmaker-1, printmaker-4, sky defect 1, light defect 2, printmaker defect 1. Near-duplicate subtractions: **light "orange hemisphere-ground bounce" = printmaker subtraction 3 = part of light-2** (`gdc:139`); light GOLDEN_GRADE split removal ≈ printmaker-1 "shadowTint split → 1.0"; light LUT orange boost removal vs printmaker-8 `LUT_STRENGTH` .9→.5. Sky-1 ember-band fix = sky defect 2 = sky subtraction "view-axis ember band" (also cited in light defect 2).

**3. Aerial perspective / fog / haze / horizon (one owner needed).** sky-2 (material-side `gardenAerial`, ichimonji), printmaker-4 (two-ink stepped fog in height-fog injector), headroom-2 (post-side analytic height fog + sun Mie). ⚠ **Three competing implementations of the same fog law** — sky-2 wants one fog function at `fog_fragment`; headroom-2 wants post in-scatter while reducing material Fog; printmaker-4 edits the same injector. Related: noon milk — light defect 4 (exposure 1.12), sky subtraction haze 0.42→0.12, printmaker defect 7, light cross-lane cap L\*≈80. Sky subtraction "double fog" and sky reversal `gs:381-382` vs water-1 far-sea reflection at annulus (`gw:1429-1436` joint seam).

**4. Moon in frame / night value structure.** sky-5 (displayed moon arc, almanac), light-3 (night key from moon, beacon PointLight ×3.0), sky-6 (night sky L\*7.5/15, stars), printmaker-5 (bero-ai, same targets), light-6 night half. ⚠ Reversal **"moon pose `garden-sun.ts:75-76`" appears in water, sky, light (3 near-duplicates)**. ⚠ Numbers: light-3 moon el 1.4°–8.9° vs sky-5 formula vs water-4 asks 15–25° — reconcile. ⚠ light-3 lifts night hemiSky (`sky_horizon.lerp(fog_blue,.4)` @.16) while printmaker-5 says hold night hemi/ambient so land stays dark. Defects: water 3, sky 5/6, light 3, printmaker 2/3.

**5. Moon (and sun) road on water.** **water-4 ≈ printmaker-6 ≈ light-3 road part** — one implementation (view-dependent H lobe vs broken horizontal slats; slats may be the styling of the H lobe). Near-duplicate subtractions: **water "two-sided moon band `gw:1173-1184`" = printmaker "gaussian fill `gw:1180-1184`"**. Water sparkle-lattice subtraction pairs with water-4. Light cross-lane: sun glitter moves to dawn only.

**6. Water surface & reflection.** water-1 (sky Fresnel), water-2 (streak reflection), water-5 (anti-tile), water-6 (annulus shore), water-7 (hull contact), water-8 (shore lap). ⚠ **Chop gain conflict: water-5 Gerstner 18→~8 near camera vs printmaker-3/printmaker subtraction 4 18→11 ×daylight, second octave ×0.6.** water-2 reflection plinth vs headroom-7 reflection LOD proxy (tri budget + waterline match); water-7 (wake-field G, 0 draws) vs headroom catalogue "near fleet in reflection via fleet-far proxies (+6 draws)" — alternatives.

**7. Risk carrier on water (non-colour).** water-3 (roughness/reflection clarity per band; dye cut) + printmaker-3 (engraved crest lines per band). Complementary (both reports agree); both need LaneDataPoetry DOM words (surface state + line rhythm). Water reversal "dyed risk map".

**8. Clouds & weather.** sky-4 (dome cloud layers, cover = PSI), sky-8 (descending weather ladder, crepuscular slots, lightning glow), sky defects 8/9, sky subtractions (billboard cumulus, lightning multiplier), headroom catalogue "cloud dome" row (Do). ⚠ sky-8 crepuscular slots replace god rays at cover >0.4 vs headroom-2 god rays 36→16 steps vs light-1 dropping golden god rays — god-ray ownership needs one plan.

**9. Beacon beam & night practicals.** headroom-2 (analytic post beam, delete cone/dust/halo), headroom defect 3, printmaker defect 5 (fade by view dot / flat wedge, LanePharos), headroom subtraction beam meshes, headroom reversal "beam as mesh cone", light subtraction PointLight ×8.2→×3.0, water defect 2 (window reflections as embers via water-2). Near-duplicate defects: **headroom defect 3 ≈ printmaker defect 5** (same beam, `night.png` ~690–760,200–290).

**10. Borrowed landscape / horizon band.** sky-3 (5 ridges + kasumi), sky defects 4/7, sky subtraction mist banks, printmaker-2 relies on hills writing no depth (keyline excludes them — compatible).

**11. Print language / stylisation.** printmaker-1/2/7/8, ladder; light-5 material ladder (near printmaker-8 per-family ramps — both material authoring, sequence/merge); printmaker-2 lets tower rim gain drop ~20% vs light defect 6 rim frozen sun (fix rim direction first). Paper grain: printmaker defect 6 + subtraction 2 + reversal; light "Keep: paper tooth 0.035" ⚠ **conflicts** with printmaker subtraction 2 (set to 0).

**12. Exposure & grade.** light-2 per-beat exposure, light subtractions (grade split, LUT boosts, Keep Neutral/2.4 knee/MSAA+SMAA), printmaker-8 LUT_STRENGTH. ⚠ light "Keep MSAA+SMAA" vs headroom-1 / headroom reversal W0.2 (drop SMAA at DPR ≥1.75) — conditional on DPR-2 A/B.

**13. Sails & cloth (sail program at 16-attribute cap).** light-4 (sun-coloured transmission, `uKeyColor`), headroom-5 (vertex billow, pennant merge), printmaker exemptions (sails always exempt). Both light-4 and headroom-5 add 0 attributes; coordinate program edits in `gfb`.

**14. Perf enablers & budget (schedule first).** headroom-4 (knockout oracle) → headroom-3 (60 Hz ambient) → headroom-1 (CSS-pixel post); headroom-6 (texture pack), headroom-7 (tri reclaim); sky-4 funding (draw dome last with far-plane depth test). ⚠ **ship-wake-detail −84 draws appears in water cross-lane and headroom defect 2 / subtraction (near-duplicate)**. Hull castShadow off (headroom defect 4/subtraction). Texture ceiling 72/72 constrains water-5 (same-slot only), printmaker-7 (pack into blue-noise G), printmaker-8 (LUT strip rows), sky-4 (reuse cloud noise), headroom-6 (pack) — ⚠ **printmaker-7 and headroom-6 both redefine the blue-noise/dither texture with different channel maps**.

**15. Close-postcard focus.** light defect 7 (tilt-shift band ignores tower height) and headroom defect 5 (tilt-shift doubled edges, CoC gather) — same pass `gp:589-700`, two distinct fixes; bundle.

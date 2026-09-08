# Verdict

These modules have a disciplined shared day-cycle, one grade table, half-resolution AO/rays, and cached sky-derived PMREM, but they are not yet a Japanese-garden lighting director. Three broad authored states and global fill/grade/fog encourage the reported flat noon plane and “dusk as warm filter” (`noon.png @ centre/island`, `dusk.png @ full frame`). The step change is spatial and temporal authorship, not another isolated scalar; the PMREM helps metal while god rays remain decorative.

## Findings

- **DEFECT — effect cost and intent disagree.** `GODRAY_ELEVATION_NONE = 0.85` makes the 28-step half-resolution march run most of the day (`src/three/garden-post.ts:1010-1018`), despite the low-sun description (`:937-965`); its runtime gate is `:1978-2021`. This spends recurring GPU time at noon for a faint decorative shaft.
- **GAP — too few authored beats.** `dayCyclePhase` has broad day/dusk windows (`src/three/garden-day-cycle.ts:210-223`) and every light blends three records (`:308-321`), so it cannot stage noon, golden hour, blue hour, and beacon-led night. `dusk.png @ frame` can read as noon plus warmth.
- **GAP — global grade is asked to make composition.** Gain/lift, split tint, saturation, and vignette touch every pixel (`src/three/garden-post.ts:415-436`); day remains gain `[1.04,1,.95]`, lift `[.004,.004,.007]`, saturation `1.12` (`:242-255`). This cannot separate tower, water, fleet, and sky (`noon.png @ island/water boundary`).
- **GAP — analytical surface is elsewhere.** Rays explicitly carry no payload or ledger cue (`src/three/garden-post.ts:1166-1173`); market meaning must come from harbour/fleet lanes with detail-panel parity.
- **GAP — PMREM has sparse specular swaps.** Daylight/dusk quantise to ten steps (`src/three/garden-environment.ts:166-180`, `:451-458`); SH eases `.9 s` but specular dips `.22 s` (`:200-231`). Metals can step while analytic lights remain continuous.

## Tuning map — `src/three/garden-day-cycle.ts`

| Symbol | file:line | Current value (day / dusk / night) | What it visibly controls | Consumer |
|---|---:|---|---|---|
| `DAY_CYCLE_LIGHT_PRESETS.ambient` | `:112-150` | `P.sky_day_horizon` / `P.sky_horizon→P.lantern_warm(.3)` / `P.sky_night→P.fog_blue(.3)` | Broad unshadowed fill and palette floor | `updateDayCycle` ambient color, `:313-318` |
| `.ambientIntensity` | `:125,134,143` | `.20 / .24 / .28` | Global fill level; day + hemi total is intentionally just above environment intensity | `scene.ambientLight.intensity`, `:317-318` |
| `.dirColor` | `:126,135,144` | `P.sun_day_warm` / `P.lantern_warm→P.vermillion(.06)` / `P.moonlight→P.lantern_cold(.15)` | Key-light hue on faces and cast shadows | `scene.directionalLight.color`, `:320-321` |
| `.dirIntensity` | `:127,136,145` | `3.3 / 2.8 / 1.0` | Key contrast, shadow readability, metal response | `scene.directionalLight.intensity`, `:320-321` |
| `.hemiGround` | `:128,137,146` | `P.timber_warm→P.aurora_green(.45)` / `P.ember→P.timber_mid(.4)` / `P.deep_sea_2→P.timber_dark(.46)` | Upward-facing ground bounce; sets whether ochre/moss reads warm, ember, or indigo | `scene.hemisphereLight.groundColor`, `:313-315` |
| `.hemiIntensity` | `:129,138,147` | `.42 / .40 / .36` | Sky/ground ambient lift and silhouette separation | `scene.hemisphereLight.intensity`, `:313-315` |
| `.hemiSky` | `:130,139,148` | `P.sky_day_zenith` / `P.sky_horizon→P.sky_day_zenith(.2)` / `P.sky_night→P.fog_blue(.25)` | Sky-side diffuse fill on all standard materials | `scene.hemisphereLight.color`, `:313-315` |
| `DAY_CYCLE_SKY_PRESETS.{fog,horizon,zenith}` | `:77-93` | fog `P.fog_day` / `DUSK_EMBER_AIR→P.fog_blue(.85)` / `P.sky_horizon`; horizon `P.sky_day_horizon` / `DUSK_EMBER_AIR→P.fog_blue(.3)` / `P.sky_horizon`; zenith `P.sky_day_zenith` / `P.sky_horizon→P.sky_day_zenith(.25)` / `P.sky_night` | Visible dome gradient and distance-air colour | `garden-sky` dome; cloned by height fog at `:172-195` |
| `DUSK_EMBER_AIR`, `DUSK_EMBER_COLOR`, `MOON_COLOR`, `STAR_COLOR` | `:76,97-100` | ember air blend `.22`, ember accent `.45`; moon `P.moonlight`; stars `P.moonlight→P.foam_white(.4)` | West band, moon, and star accents | Sky/sky-object materials |
| `DAY_CYCLE_HEIGHT_FOG_PRESETS.density` | `:163-197` | `.00012 / .00023 / .00022` | Distance haze amount; separates far fleet from the crisp monument | `garden-height-fog` |
| `.heightFalloff` | `:170-183,190-191` | `.28 / .20 / .24` | How quickly haze drops with height | `garden-height-fog` |
| `.phaseGain`, `.horizon`, `.sunTint`, `.zenith` | `:170-195` | gain `.20/.40/.04`; linked sky fog / linked dirColor / linked sky zenith | Height-fog phase response and sun-tinted aerial perspective | `garden-height-fog` shader uniforms |
| `dayCyclePhase` windows | `:210-223` | day broad `5.5–19`; dawn glow `4–8.25`; evening glow `15.75–21.25`; night is residual | When the rig changes state; no separate blue-hour/noon state | All day-cycle consumers |
| beacon/fire/smoke curves (`:329-345`) | `:329-345` | beacon `3.4+.6ψ / 3.4+.6ψ / 7.2+.6ψ`; fire multiplier `.26/.85/1`; smoke opacity `.62/.22/.10` | Beacon dominance, day smoke signal, night flame, atmospheric inhabitation | Beacon materials/uniforms |
| halo/light/statue/harbour curves (`:354-366`) | `:354-366` | halo opacity `.16/.26/.46`, scale `1.20/1.38/1.80`; lighthouse light `.95/3.25/9.15`; statue `.22/1.16/.34`; harbour lantern `.18/1.38/2.08` | Local warm punctuation and the focal beacon | Island/light/material consumers |
| aperture curves (`:377-410`) | `:377-410` | station window `.35/1.75/2.10`; tower window `.18/1.08/1.53`; path lantern `.22/1.37/1.97` | Habitation rhythm: harbour, tower stair, and island path | Window/lantern materials |
| ship shadows / ship lamps / sail / beam (`:417-461`) | `:417-461` | shadow opacity `.48/.34/.34`; ship emissive `.05/.90/1.95`; halo `0/.12/.24`; sail `.06/.12/.09`; cone `0/.035/.11`; dust `0/.09/.24`; plane `.0008/.033/.068` | Fleet grounding, night navigation, and lighthouse beam visibility | Fleet materials, `beam` children |

## Tuning map — `src/three/garden-post.ts`

| Symbol | file:line | Current value (day / dusk / night) | What it visibly controls | Consumer |
|---|---:|---|---|---|
| `GARDEN_TONE_MAPPING` | `:41-55` | `neutral / neutral / neutral` | HDR shoulder and highlight compression | Renderer + `ToneMappingEffect`, `:1651-1658` |
| `GradePreset.gain` | `:211-255` | `[1.04,1,.95]` / `[1.04,.98,1]` / `[1.04,1.03,1.05]` | Per-channel exposure bias | `applyGrade`, `:1835-1839` |
| `.gamma` | `:211-255` | `[1,1,1]` / `[1,1,1]` / `[.95,.95,.96]` | Midtone curve and night lift | `applyGrade`, `:1837` |
| `.highlightTint` | `:211-255` | `[1.12,1.03,.82]` / `[1.16,1,.78]` / `[1.08,1.04,.92]` | Warm/cool highlight colour | `applyGrade`, `:1840` |
| `.lift` | `:211-255` | `[.004,.004,.007]` / `[.006,.005,.01]` / `[.01,.01,.018]` | Raised shadow floor, including water | `applyGrade`, `:1835-1837` |
| `.saturation` | `:211-255` | `1.12 / 1.12 / 1.02` (winter multiplies by ≤.92) | Palette intensity | `applyGrade`, `:1842-1846` |
| `.shadowTint` | `:211-255` | `[.94,.95,1.06]` / `[.94,.92,1.10]` / `[.98,.95,1.06]` | Complementary shadow hue | `applyGrade`, `:1839` |
| `.split` | `:211-255` | `.45 / .55 / .34` | Strength of shadow/highlight tint split | `applyGrade`, `:1847` |
| `.vignette`, `.vignetteBias` | `:211-255` | `.40/.15` / `.38/.15` / `.28/.15` | Corner framing and its upward/downward lean | `GRADE_FRAGMENT_SHADER` and `applyGrade`, `:428-431`, `:1848-1849` |
| Vignette fixed radial/vertical ramps | `:428-431` | radius smoothstep `.35→.85`; bias ramp `.15→.95` (all phases) | Which pixels receive the vignette; bias is not a second sky band | Grade shader |
| `POST_PHASE_*.aoIntensity` | `:258-290` | `3 / 4 / 5` | N8AO exponent; higher gives stronger contact darkening | `syncTierFidelity`, `:1793-1799`, `:1918-1923` |
| `.bloomRadius`, `.bloomSmoothing`, `.bloomStrength`, `.bloomThreshold` | `:258-290` | radius `.50/.64/.72`; smoothing `.20/.30/.45`; strength `.92/.85/.80`; knee `1.20/1.15/1.55` | Sparkle spread, shoulder softness, glow energy, and which HDR sources bloom | `applyGrade`, `:1890-1917`; `BloomEffect`, `:1640-1648` |
| `.stormBloomStrength`, `.stormBloomThreshold`, `.stormLift` | `:258-290` | strength `.30/.26/.22`; threshold `.28/.25/.30`; lift `[.005,.009,.022]` / `[.004,.008,.02]` / `[.004,.008,.02]` | Wet-glow and cool storm lift layered over the phase | `applyGrade`, `:1830-1836`, `:1877-1917` |
| `BLOOM_MIP_LEVELS`, storm floor, `BLOOM_FLASH_INTENSITY` | `:292-330` | `5 / 5 / 5`; floor `.85`; flash add `.35` | Pyramid depth, storm knee safety, lightning glow | Bloom setup and `applyGrade` |
| N8AO setup (`Performance`, `halfRes`, transparency flags) | `:1608-1631` | same all phases: quality Performance (8 AO/4 denoise), `halfRes=true`, auto-detect/transparency-aware false | AO quality, resolution, and whether transparent geometry is rendered twice | `n8aoPass` |
| `AO_RADIUS`, `AO_DISTANCE_FALLOFF` | `:343-388`, `:1625-1630` | `2 / 2 / 2`; `1 / 1 / 1` | World-space grounding radius and distance fade | N8AO configuration |
| balanced/idle scales, `POST_TIER_FADE_SECONDS` | `:389-393`, `:1793-1803` | `.70` radius, `.85` intensity, `.18 s` fade (all phases) | Tier/idle fidelity without shader recompile | `syncTierFidelity` |
| DOF constants (`DOF_RESOLUTION_SCALE`, spread, range/falloffs, gradient, strength) | `:735-782` | `.5, 2, .55, .5, .45, .26, .16, .92, .6` (all phases) | Half-resolution tender-diorama blur and sharp band | `GardenTiltShiftEffect`, `:891-914`; tier strength `:1815-1817` |
| godray volume/resolution (`GODRAY_RESOLUTION_SCALE`, `GODRAY_STEPS`, sea, top, falloff) | `:974-987` | `.5 / .5 / .5`; `28 / 28 / 28`; sea `GARDEN_WATER_Y`; top `46`; falloff `.1` | Shaft raster cost, medium height, and density by altitude | `GardenGodRaysEffect` uniforms, `:1202-1212` |
| godray shadow/gate (`GODRAY_SHADOW_BIAS`, elevation full/none, night power) | `:997-1026` | bias `.0016`; gate `.16→.85`; power `1` (all phases) | Shadow acne, low-sun opening, and sunset kill | `gardenGodRayLowSunGate`, `:1158-1164`; `syncGodRays`, `:2013-2021` |
| godray optical/intensity (`GODRAY_REFERENCE_THICKNESS`, `GODRAY_INTENSITY`) | `:1037-1058` | `20 / 20 / 20`; `.02 / .02 / .02` | Normalised shaft density and HDR additive strength | March/composite shader |
| godray look (`GODRAY_DUSK_COLOR`, `GODRAY_DAWN_COLOR`, densities) | `:1066-1069`, `:1865-1871` | effective day `[.88,.89,.95]`, `.74`; dusk `[1,.63,.3]`, `1`; night weight `0` (look is dusk fallback) | Pale dawn vs ember dusk; no visible night rays | `setPhaseLook`, `:1234-1237`; weight gate |
| shadow rig | `:954-960`, `:2000-2021`, `:1240-1248` | same map/matrix all phases; bias `.0016` | Rays agree with the existing directional shadow map instead of sliding | `shadowLight.shadow.map.depthTexture` and `shadow.matrix` |
| LUT/dither/grain (`LUT_TEXTURE_URL`, `DITHER_TEXTURE_URL`, `PAPER_GRAIN_STRENGTH`, fade rate) | `:464-500` | LUT/dither loaded same all phases; grain `.035`; fade rate `6` | Authored phase colour, quantisation tooth, and no-pop asset arrival | `GardenLutEffect`, `:640-651`, `:1722-1732` |
| composer/MSAA/pass order | `:1533-1546`, `:1601-1701` | same all phases: HalfFloat, 4× MSAA; Render→N8AO→Bloom→fused DOF/rays/grade/tone/LUT→SMAA | Main chain cost and ordering of linear HDR, grade, output, and AA | `EffectComposer` |

## Tuning map — `src/three/garden-environment.ts`

| Symbol | file:line | Current value (day / dusk / night) | What it visibly controls | Consumer |
|---|---:|---|---|---|
| `GARDEN_ENVIRONMENT_INTENSITY` | `:133-164` | `.6 / .6 / .6` | PMREM diffuse/specular contribution; mostly metal/hull trim because sky/water shaders do not receive it | `scene.environmentIntensity`, `:369-371`, `:711-714` |
| `PHASE_STEPS`, `STORM_STEPS`, `STORM_BAND_HYSTERESIS` | `:166-180` | `10 / 10 / 10`; storm `4`; hysteresis `.06` | PMREM rebake cadence and storm-key stability | `gardenEnvironmentPhaseBandKey`, `:424-457`; update `:672-685` |
| `PROBE_RADIUS`, `SH_CUBE_SIZE` | `:182-198`, `:469-497` | radius `1`; harmonic cube `16×16` face, `UnsignedByte`, linear sRGB (all phases) | Probe geometry and SH readback fidelity/cost | `SphereGeometry`, `WebGLCubeRenderTarget`, `CubeCamera(.1,5)` |
| `SH_DRIFT_TAU_SECONDS`, `SWAP_DIP_TAU_SECONDS`, `SWAP_DIP`, `DRIFT_EPSILON` | `:200-234` | `.9 s / .22 s / .30 / .002` (all phases) | Smooth diffuse transition, short specular dip, exact rest | `advanceGardenEnvironmentDrift`, `:345-372`, update `:708-717` |
| bake cadence/deadlines | `:236-268` | min `1.5 s`, max defer `6 s`, SH deadline `2 s` (all phases) | Episodic PMREM cost and stale-reflection limit | `shouldBakeGardenEnvironment`, `:336-343`; pending swap `:657-705` |
| phase/storm key and SH differential | `:412-457`, `:375-410` | day/dusk/night use quantised `(daylight,dusk,stormBand)`; rest SH is zero differential | Keeps reflected sky aligned without double-brightening analytic fill | `gardenEnvironmentPhaseKey`, `writeGardenEnvironmentProbeSH`, update |
| `CubeCamera(.1,5)` + six-face bake | `:492-497`, `:545-570` | same all phases | PMREM source capture and harmonic projection; episodic six-draw cost | `requestHarmonic` and `PMREMGenerator.fromScene`, `:686-691` |

## Dead or suspicious

- `GARDEN_TONE_MAPPING` exposes an AgX branch but is permanently `neutral` (`src/three/garden-post.ts:55`, `:1656-1658`); keep the branch only if an A/B is planned, otherwise it is a misleading tuning knob.
- `GODRAY_ELEVATION_NONE=.85` is the clearest suspicious setting: it contradicts “low-sun” naming and turns an optional accent into a daytime half-resolution march (`src/three/garden-post.ts:1010-1018`).
- The grade’s `flash` uniform is intentionally not a bloom input (`src/three/garden-post.ts:311-328`), so it is not dead, but tuning it alone cannot make a lightning strike bloom; any plan should preserve the paired real-light/bloom path.
- `GARDEN_ENVIRONMENT_INTENSITY` is constant by phase even though the module claims hour-matched reflections (`src/three/garden-environment.ts:32-34`, `:164`); this is a deliberate anti-wash calibration, but a likely ceiling on phase drama.
- No directional shadow-map size, camera bounds, bias, or update cadence is authored in any of these three files. The post only consumes the already-rendered map/matrix (`src/three/garden-post.ts:1240-1248`); do not “fix” shadow softness here without handing the change to the renderer/shadow owner.
- `GODRAY_DUSK_COLOR` remains the zero-night fallback look (`src/three/garden-post.ts:1066-1069`, `:1865-1871`); harmless while night weight is exactly zero, but a future nonzero night ray would silently become ember.

## Ranked ideas

1. **Step change: authored four-beat lighting dramaturgy.** Extend `DayCyclePhase`/preset consumption with dawn, noon, golden-hour, blue-hour, and night weights (or a small curve table), giving noon a lower sky lift, golden hour a directional rake, blue hour a violet/ember bridge, and night only the beacon HDR key. **Why:** fixes flat noon and warm-filter dusk while retaining wall-clock evolution. **Cost:** 0 draws/tris/textures, +~.05–.15 ms uniform/branch work; L/XL. **Risk:** palette discontinuity, shadow re-steer churn, reduced-motion determinism. **Displaces/re-pins:** replaces three-state interpolation and re-pins one blend law/night dominance. **Dependencies:** sky, water, shadow-pose, data-story lanes consume the same weights.
2. **Step change: depth-aware compositional grade.** Let the fused grade read composer depth and treat near rim, island, fleet band, and far sky/water separately: lower broad haze, protect the tower silhouette, and preserve analytical colours. **Why:** the global shader (`src/three/garden-post.ts:415-431`) cannot create layered depth or fix tower/water merging. **Cost:** 0 additional draws/tris/textures, +~.1–.3 ms ALU; M/L. **Risk:** depth halos and cue-parity mistakes. **Displaces/re-pins:** keeps LUT/tone order and tier colour invariance. **Dependencies:** renderer depth convention and coupling/data lanes.
3. **Step change: split IBL by material role.** Keep `.6` diffuse calibration but expose phase-aware specular scale for bronze, iron, hull trim, and lantern metal, with warmer dusk/night reflections. **Why:** the environment module says its visible win is metal (`garden-environment.ts:122-164`); role-specific reflection adds craft without re-washing sky/water. **Cost:** 0 draws/tris, no new textures, negligible uniforms; L. **Risk:** material wiring, pinpricks, PMREM swap visibility. **Displaces/re-pins:** revisits one global environment intensity while preserving no-planar-reflection and two-target limits. **Dependencies:** asset/material and environment lanes.
4. **Restore low-sun intent and spend saved rays on quality.** Narrow the gate near the low-sun window (or keep `.85` only as a short authored sliver), then use the budget for temporal jitter/denoise or a denser dusk-only volume. **Why:** 28-step half-res rays are most expensive when least visible (`src/three/garden-post.ts:974-1018`). **Cost:** no ray draws in disabled hours; dusk +~.1–.4 ms; S/M. **Risk:** banding; preserve shared shadow matrix/bias. **Dependencies:** sky/shadow lanes.
5. **Make focus data-aware without changing topology.** Feed `setFocusBandDistance` from the selected harbour/ship and soften strength/range at overview (`src/three/garden-post.ts:1296-1302`, `:1812-1817`). **Why:** watching and learning share attention. **Cost:** existing two half-res blur draws, no new resources; M. **Risk:** distracting idle motion; reduced motion freezes a subject. **Dependencies:** HUD/data-story lanes.

## Rejected

- Raising N8AO to High: the module’s A/B says static differences are below motion noise (`src/three/garden-post.ts:351-380`) for extra compile/residency cost.
- Adding planar reflections: prior decision rejects ~40 duplicated draws; role-specific PMREM is better value.
- Increasing `SH_CUBE_SIZE`: SH9 cannot use the extra spatial detail; it buys bake/readback cost.
- Raising godray intensity: measured `.05` adds a frame-wide pedestal; `.02` is already restrained (`src/three/garden-post.ts:1039-1058`).

## Cross-lane notes

- Hand the new phase-weight contract to sky, water, shadow-pose, fleet-motion, and data-story lanes; preserve wall clock and reduced-motion.
- Renderer/shadow owner supplies map size, bounds, bias, and re-steer controls (absent here); material owner classifies metal roles; HUD/data-story supplies selected-subject distance.

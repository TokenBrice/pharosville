# Sky / horizon / height-fog / sun tuning map

## Verdict
This lane owns the scene's largest time-of-day cues: the visible backdrop, borrowed horizon, aerial perspective, and the shared sun/moon pose. The architecture is unusually explicit and mostly phase-driven, but several presentation constants are still independent opinions (notably moon elevation and the fog's choice of sun pose), so dawn/dusk can read as a colour treatment rather than a changing garden. The fixed backdrop stops and always-on haze also leave the reported noon wash and plate-edge seam exposed. The best step change is to make one per-frame light/atmosphere answer feed every shader, then re-author the visible depth field around that answer rather than adding more decorative sky sprites.

Notation in the tables: D/K/N means clear day, dusk, night with `(daylight,dusk,night)=(1,0,0),(0,1,0),(0,0,1)` and storm `=0`. `blend(preset)` means the imported day-cycle preset, whose exact swatches live outside this lane.

## `src/three/garden-sky.ts`

| symbol | file:line | current value (per phase) | what it visibly controls | consumer |
|---|---:|---|---|---|
| `DOME_RADIUS`, `SKY_BACKDROP_SIZE`, `SKY_BACKDROP_Y` | `garden-sky.ts:35-37` | `300`, `1200`, `-2`; all phases | PMREM dome scale and whether the world-backed sheet covers the frame / sits behind the plate | `SphereGeometry`, backdrop `PlaneGeometry` and position (`:444`, `:564-567`) |
| `STAR_COUNT` | `garden-sky.ts:38` | `720`; geometry is fixed, opacity D/K/N=`0/.35/1` before storm | Night grain, twinkle density, and perceived scale of the sky | star points plus `uOpacity` (`:573-637`, `:901-905`) |
| `FOG_NEAR`, `FOG_FAR`, `FOG_DAY_FAR_BONUS` | `garden-sky.ts:93-96` | near=`124*s*(1-.32 storm)`; far=`(336+20D)*s*(1-.25 storm)`; `s` clamps view-height ratio to `1.21..1.5` | Where island, ships, far water and plate edge lose contrast; major depth/value cue | `THREE.Fog` update (`:872-897`) |
| `GARDEN_BOKASHI_BAND` | `garden-sky.ts:163-174` | band stops `[.015,.055,.1,.17]`, `[.12,.2,.31,.43]`, `[.56,.86]`; gains `+.11,-.07,-.24`; amount D=`.08`, K/N=`1` | Hiroshige-like pale seam, ichimonji strip and dark zenith band | generated dome/backdrop GLSL (`:183-224`, `:403-439`, `:513-529`) |
| `GARDEN_CUMULUS_BILLBOARDS_ENABLED` | `garden-sky.ts:230` | `false`; nevertheless summer bypasses it, so visible in summer whenever billboards are allowed | Whether the cloud layer competes with the horizon; not a pure global off switch | `billboards.clouds.mesh.visible` (`:957-974`) |
| `MOON_ELEVATION` | `garden-sky.ts:240` | `π*.34` (~61.2°), fixed; moon shown K/N with presence `min(1,.5*dusk+night)` | Visible moon position and halo | moon group placement and halo (`:639-665`, `:907-910`) |
| `SKY_LOWER_*`, `SKY_MIDDLE_*`, `SKY_VISIBLE_ZENITH_*` | `garden-sky.ts:246-263` | D: horizon→zenith lerps `.32/.68`, zenith→deep-sea `.30`; K: ember→fog `.42` plus dusk presets; N: horizon/fog `.10/.04`, night/horizon `.12` | Visible sheet's vertical day/dusk/night colour ladder | backdrop uniforms graded in `applyPhase` (`:761-784`) |
| `CLOUD_BODY_*`, `CLOUD_SHADE_*` | `garden-sky.ts:276-284` | D: foam/horizon and zenith/foam lerps; K: dusk horizon / night horizon; N: night zenith and night zenith | Cloud body/shade palette; storm cools it | cloud material uniforms (`:959-966`) |
| dome `uHorizon/uMiddle/uZenith/uHazeColor` | `garden-sky.ts:365-377`, `:744-760`, `:796-799` | horizon=haze/fog exactly; middle/zenith=blend(N/K/D); haze shares `fog.color`; all phases | PMREM source and hidden dome gradient; visible sheet seam colour | dome shader and environment baker (`:388-451`) |
| dome `uScattering`, `uSunIntensity`, `uSunColor`, `uSunDir` | `garden-sky.ts:373-376`, `:806-830` | scattering D/K/N=`1/.7/0` times `(1-.6 storm)`; intensity=`1.55D+1.3K` times `(1-.85 storm)`; colour=light preset blend; direction=`gardenSunPose(hour)` | Sun glow, Mie/corona, and the directional identity of the sky | dome + shared backdrop uniforms (`:413-428`, `:536-546`) |
| dome `uEmberStrength`, `uHazeStrength`, `uBokashiAmount` | `garden-sky.ts:366-373`, `:801-835` | ember=`.55*K*(1-D)*(1-.7storm)` (zero at noon); haze=`min(.8,.42+.3storm)` every phase; bokashi D/K/N=`.08/1/1` | Dusk west ember, broad haze wash, and band contrast | dome shader (`:430-439`) and generated bokashi |
| backdrop `uLower/uMiddle/uZenith/uNight/uMoonColor` | `garden-sky.ts:481-489`, `:785-799` | lower/middle/zenith=phase endpoint rows above; `uNight=N`; moon colour fixed and contribution `0.07*N` | What is actually visible above the occluding water plate; fixed screen-space moon glow | backdrop shader (`:499-560`) |
| backdrop sun projection (`sunScreen`, stops `.62/.72/.74/.86/.86/1`) | `garden-sky.ts:516-546` | phase/hour-derived x/y; noon maps near y `.73`; low sun floor `.38`; stops fixed | Location of warm disk/glow and where the backdrop ladder becomes visible | backdrop fragment shader |
| mist density / cloud opacity / geese opacity | `garden-sky.ts:935-979` | mist D=`.12`, K=`.55`, N=`.48` (storm adds); clouds `min(.34,.28-.06N+.04storm)` but summer-only; geese autumn-only | Far shelves, seasonal movement and visual breathing | billboard uniforms/visibility |
| stars `uColor/uOpacity/uSize/uTime`, moon halo opacity | `garden-sky.ts:603-607`, `:901-910` | star colour fixed, size `2.2`, time `0` reduced-motion else seconds; halo=`(.08+.28N)*(1-.7storm)` | Night sparkle, motion compliance, and moon emphasis | points shader and halo material |

## `src/three/garden-horizon.ts`

| symbol | file:line | current value (per phase) | what it visibly controls | consumer |
|---|---:|---|---|---|
| `GARDEN_HORIZON_VALUE_SCALES` | `garden-horizon.ts:40-46` | far/mid/near=`.9/.8/.7`; phase-independent | Three readable value planes instead of one fog strip | generated fragment shader `valueScale` |
| `RIDGES` | `garden-horizon.ts:50-72` | far `depth122,height21,offset-62,width276`; mid `108,17,+18,242`; near `94,14,+92,205`; profiles fixed | Screen-space shakkei silhouette rhythm, overlap and horizon height | `createGeometry` (`:74-137`), one mesh |
| mist band geometry (`mistDepth`, `mistWidth`, y `-2.5..3`, relief `.18`) | `garden-horizon.ts:105-128` | `86`, `310`, fixed all phases | Soft foot between plate rim and ridge feet; displaces old diffuse base fade | same one-draw geometry and `aKind` branch |
| `uFogColor`, `uSkyColor` | `garden-horizon.ts:149-152`, `:230-248` | initialized N; both blend N→K→D each update | Ridge and mist colour under the sky cycle; constrained tier hides root | horizon fragment shader; `root.visible = tier !== "constrained"` |
| `GARDEN_HORIZON_DISPLACEMENT` | `garden-horizon.ts:48` | literal metadata only, no shader effect | Intended product-language description, not pixels | exported constant; no local runtime consumer |

## `src/three/garden-height-fog.ts`

| symbol | file:line | current value (per phase) | what it visibly controls | consumer |
|---|---:|---|---|---|
| `gardenHeightFogUniforms` density/falloff/phaseGain | `garden-height-fog.ts:29-38`, `:67-87` | initial D preset; runtime each frame `blend(N,K,D)`; density additionally `*(1+1.2 storm)` | Exponential aerial depth, vertical lift, and directional tint strength | injected standard-material shaders (`:228-267`) |
| horizon / sunTint / zenith uniforms | `garden-height-fog.ts:29-38`, `:89-112` | N/K/D colour blends; storm does not directly recolour these here | Fog colour by view height and sun-facing azimuth | `gardenHeightFogGlsl` (`:147-171`) |
| `uGardenHeightFogSeaLevel` | `garden-height-fog.ts:34`, `:88` | frame `seaLevel`, all phases | Vertical origin of density falloff | CPU and GLSL exponential term (`:125-127`, `:158-160`) |
| `uGardenHeightFogSunDir` | `garden-height-fog.ts:35`, `:113-115` | `gardenSunPose(hour)` (not phase-blended key pose) | Azimuthal warm/cool in-scatter; `pow(sunDot,8)` makes a narrow sun road | both global and localized fog (`:162-170`, `:186-194`) |
| localized shelf constants | `garden-height-fog.ts:181-195` | shelf `exp(-max(height,0)*.38)`; local density `4×`; final contribution clamp `.34` | Quay-only epistemic haze shelf, much stronger near sea level | `gardenApplyLocalizedHeightFog` |
| `gardenQuayEpistemicHazeUniform` / `uGardenEpistemicHaze` | `garden-height-fog.ts:40-45`, `:224-267` | shared `0/1`; only injected for `{epistemicHaze:"quay"}` | Toggle for localized quay haze without changing program key | material patch path (`:272-300`) |

## `src/three/garden-sun.ts`

| symbol | file:line | current value (per phase) | what it visibly controls | consumer |
|---|---:|---|---|---|
| `NOON_BEARING` | `garden-sun.ts:33` | `atan2(-30,-35)`, fixed noon azimuth | Calibrated face/shadow direction at noon | `sunAngles`, exported noon bearing |
| `NOON_ELEVATION` | `garden-sun.ts:35` | `atan2(48,hypot(35,30))` ≈46.1°, fixed noon | Noon shadow length and sky sun height | `sunAngles`, exported noon elevation |
| `ARC_SWEEP` | `garden-sun.ts:47` | `1.0` rad, ±57° around noon | Amount of horizontal shadow/glitter movement through the day | `sunAngles` azimuth (`:104-115`) |
| `SUNRISE_HOUR`, `SUNSET_HOUR` | `garden-sun.ts:50-51` | `5`, `19.5`; phase-independent | Mapping wall-clock hour to sun arc; beyond endpoints azimuth clamps only to `-.15..1.15` progress | `sunAngles` |
| `MIN_KEY_ELEVATION` | `garden-sun.ts:65` | `.06` rad (~3.4°) | Keeps cast shadows describable at day edges; sky sun remains unclamped | `gardenKeyLightPose` floor (`:154-156`) |
| `GARDEN_MOON_AZIMUTH`, `MOON_ELEVATION` | `garden-sun.ts:75-76` | azimuth `π*.62`; elevation `π*.29`; fixed night pose | Night key-light direction and moon road bearing | `gardenMoonPose`, key crossover; azimuth re-exported to sky |
| `gardenSunPose` / `gardenKeyLightPose` | `garden-sun.ts:99-156` | sun elevation=`NOON_ELEVATION*sin(π progress)` (can go below horizon); key blends sun→moon by `phase.night`, floors at `.06` | Shared direction for dome/fog/water/key-light consumers; dawn/dusk motion | pose API; currently sky/fog use sun-only pose while key-light consumers use key pose |

## Findings

**DEFECT — competing moon elevations.** `garden-sky.ts:240` places the visible moon at `π*.34`, while `garden-sun.ts:76` places the night key at `π*.29`. The azimuth is correctly shared, but elevation is not; a night frame can show the disc/halo and its apparent light road at different heights (`night.png @ upper-left sky/water`). Consolidate on one pose, not another constant.

**DEFECT — height fog is not lit by the actual key pose.** `garden-height-fog.ts:113-115` calls `gardenSunPose`; after the night crossover, the scene key is moon-blended by `gardenKeyLightPose` (`garden-sun.ts:136-156`) but fog's narrow `pow(sunDot,8)` road still follows the below-horizon sun azimuth. This can make the atmospheric cue disagree with shadows/water (`night.png @ far-water haze`).

**GAP — noon haze is structurally strong.** `uHazeStrength` is `.42` even at clear noon (`garden-sky.ts:831-834`), before the separate linear/height fog terms. That is consistent with a deliberately hazy print, but it spends value contrast over the whole frame, matching the reported beige wash (`noon.png @ upper frame and tower/water value plane`).

**GAP — backdrop and horizon are authored in different coordinate vocabularies.** Backdrop stops are screen-height constants (`garden-sky.ts:515-529`) while horizon ridges are world-depth strips (`garden-horizon.ts:50-72`); camera/plate occlusion determines which half of each gradient survives. The reported hard diagonal plate seam (`noon-wholemap.png @ plate edge`, `dusk-close.png @ backdrop seam`) is therefore a composition gap, not merely a colour choice.

**GAP — time movement is still mostly chroma.** `garden-sun.ts:47` deliberately limits azimuth to ±57°, while sky scattering is zero at night and phase colours carry much of the transition. The constraint is defensible for the locked camera, but it limits the garden's observable evolution to a small shadow/glitter displacement (`dusk.png @ monument and water`).

## Ranked ideas

1. **Single `GardenLightPose` bus (step change).** Compute sun and key/moon poses once in the frame coordinator and pass the same direction/elevation to `garden-sky`, `garden-height-fog`, water glitter, and the key light; remove `garden-sky.ts:240` and make all moon placement derive from `gardenMoonPose`. Use key pose for height-fog in-scatter, while retaining sun-only pose only for the physical scattering fade. **Cost:** 0 draws/tris/textures, <0.1 ms; engineering M. **Risk:** transition snapshots can move; re-pin noon bearing/elevation and night dominant-light invariant. **Displaces:** duplicated moon elevation and any consumer-local sun projection constants. **Dependencies:** renderer/frame coordinator, water and lighting lanes.

2. **Re-author the visible atmosphere as a depth-aware garden backdrop (step change).** Replace the fixed screen stops at `garden-sky.ts:522-529` plus generic horizon planes with one authored three-band atmospheric field whose seam is keyed to plate edge and camera view height; preserve one shared fog colour for PMREM. Give far/mid/near ridge values controlled by the same depth ramp rather than independent screen/world interpolation. **Cost:** same 1 backdrop draw (or +1 if retaining ridges), unchanged geometry/tris, +0 textures, ~0.2–0.5 ms; engineering L. **Risk:** orthographic occlusion can reintroduce a seam; re-pin plate-edge dissolution and whole-map framing. **Displaces:** current hard-coded backdrop stops and part of `RIDGES`/mist band. **Dependencies:** horizon and camera/composition lanes.

3. **Separate readable noon from aerial depth.** Lower clear-day `uHazeStrength` from its fixed `.42` floor and move the missing value into the phase-aware height-fog presets; retain storm closure and the far-plane bonus. Add a low-amplitude zenith-to-horizon value ramp that protects tower/water separation at noon. **Cost:** no draws/tris/textures, negligible shader ALU; engineering S/M. **Risk:** too little haze restores a plate slab; re-pin `FOG_FAR` edge dissolve and dusk non-whiteout. **Displaces:** the current constant broad haze floor. **Dependencies:** post-grade and water readability lanes.

4. **Make the shakkei a designed garden silhouette, not three generic profiles.** Retune `RIDGES` profiles/offsets and `[.9,.8,.7]` scales as a deliberate far mountain / middle grove / near reed-bank rhythm, with a phase-stable low-contrast mist foot. Keep one draw and move detail from disabled/seasonal cloud sprites into this stable composition. **Cost:** 0 draws/tris/textures; <0.1 ms; engineering M. **Risk:** silhouette can become a competing landmark; re-pin constrained-tier visibility and no-monument rule. **Displaces:** current arbitrary ridge profiles and some billboard attention. **Dependencies:** garden-art and horizon lanes.

5. **Give the hour a slightly wider, camera-safe light arc.** Prototype `ARC_SWEEP` around `1.15–1.3` only if shadows stay on the authored monument faces; pair it with a key-light frustum review and preserve noon exactly. **Cost:** 0 GPU resources, negligible CPU; engineering S. **Risk:** viewer-facing/frontal light and silhouette at dawn/dusk—the reason the current decision was parked. **Displaces:** current ±57° cap; explicitly re-pins locked-camera shadow readability. **Dependencies:** sun-light, water glitter, and composition lanes.

## Dead or suspicious

- `GARDEN_HORIZON_DISPLACEMENT` (`garden-horizon.ts:48`) is metadata only; it has no local shader/material consumer. Confirm external contract usage before retaining it.
- `GARDEN_CUMULUS_BILLBOARDS_ENABLED=false` (`garden-sky.ts:230`) is misleading as a disable flag because `season === "summer"` still enables clouds (`:973-974`); rename to an intentional baseline policy or remove the bypass.
- `MOON_ELEVATION` exists twice with different values (`garden-sky.ts:240` vs `garden-sun.ts:76`): the clearest two-constants-for-one-physical-thing defect.
- `uEmberStrength` is exactly zero at noon (`garden-sky.ts:803-804`) by design; it is a valid dusk-only cue, not dead. Stars/moon are likewise zero/hidden by day (`:901-910`). The old noon-zero mist bug is fixed: mist now has `daylight*.12` (`:924-939`).
- `uGardenEpistemicHaze` is optional by design, but its shader code exists only when a quay opts in (`garden-height-fog.ts:224-267`); do not treat the shared zero uniform as dead without checking material callsites.
- `gardenHeightFogUniforms.uGardenHeightFogSunDir` is read, but its name/producer is suspicious: it is a sun-only pose even when the active key is moon-blended.

## Rejected

- Add more clouds/stars/fireflies: rejected as attention inflation; the current cloud gate and 720-star field already have headroom, while the ask needs stronger value/depth structure.
- Planar reflection pass: rejected per pinned decision; spend the budget on coherent atmosphere and PMREM/fresnel instead.
- Full physical 180° solar arc: rejected for the locked isometric camera; it violates the current silhouette/readability rationale behind `ARC_SWEEP`.

## Cross-lane notes

Hand the light-pose bus contract to water, key-light, and renderer lanes. Ask composition/horizon to co-own a plate-edge coordinate so backdrop and ridge geometry cannot disagree. Ask post-grade/water lanes to validate noon tower-vs-water contrast after reducing `uHazeStrength`. The garden-art lane can supply three ridge silhouette families without increasing the one-draw horizon budget.

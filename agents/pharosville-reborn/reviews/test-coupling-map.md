# Test coupling map

| choice | constant/symbol | test file:line | assertion in one phrase | re-pin cost |
| --- | --- | --- | --- | --- |
| Rest zoom is exactly 0.72 | `GARDEN_DEFAULT_CAMERA_ZOOM` | `src/systems/camera.test.ts:155-167` | Both desktop and laptop gates equal the default zoom described as 0.72. | number |
| Rest zoom has a legal lower floor | `GARDEN_REST_ZOOM_FLOOR` | `src/systems/camera.test.ts:149-150` | Narrow seating lands exactly on the rest floor. | number |
| Rest frame centres horizontally in an authored right gutter | `center.x`, 128 px gutter | `src/systems/camera.test.ts:88-91` | Island centre stays between 43% width and width minus 128 px. | contract+docs |
| Rest frame centres vertically around the Pharos | `center.y` | `src/systems/camera.test.ts:92-96` | Island centre stays between 38% and 73% of viewport height. | contract+docs |
| Rest frame preserves Mole/Pharos landing interval | `mole`, `viewport` | `src/systems/camera.test.ts:138-144` | Mole must remain inside every sufficiently wide viewport. | rewrite |
| Attract postcards use the authored rest composition | no direct pixel/composition assertion | `tests/visual/pharosville-gates.spec.ts:290-294` | Captures postcards, but only asserts that the canvas payload exceeds 10 KB. | delete |
| Every hull is present at thinning start (≥0.5 zoom) | `GARDEN_FLEET_THINNING_START_ZOOM` | `src/systems/garden-fleet-thinning.test.ts:42-45` | Presence map is all ones at the thinning threshold. | contract+docs |
| Thinning remains monotone below 0.5 | zoom samples `[0.5…0.3]` | `src/systems/garden-fleet-thinning.test.ts:47-54` | No hull becomes more present as zoom decreases. | contract+docs |
| Whole-map view preserves mooring representatives | dominant/representative IDs | `src/systems/garden-fleet-thinning.test.ts:61-70` | Named representatives stay at 1 while outer hulls fall to 0. | rewrite |
| Hero tiers are exempt from thinning | `sizeTier: titan/unique` | `src/systems/garden-fleet-thinning.test.ts:73-89` | Titan and unique hulls remain fully present at zoom 0.3. | contract+docs |
| Interaction and flagship targets are exempt | selected/hovered/focused/`formationFlagship` | `src/systems/garden-fleet-thinning.test.ts:77-89` | All protected roles remain presence 1 at zoom 0.3. | contract+docs |
| Removable hull fades across one band | `GARDEN_FLEET_THINNING_FADE_WIDTH` | `src/systems/garden-fleet-thinning.test.ts:92-106` | Fade midpoint is exactly 0.5 and endpoints are 1/0. | number |
| Anchorage must form visible clusters | six-tile single-link groups | `src/systems/garden-fleet-placement.test.ts:91-131` | Largest group is ≥10 and group count is <75% of hull count. | rewrite |
| Anchorage must retain a deliberate empty circle | `largestEmptyRadius` | `src/systems/garden-fleet-placement.test.ts:134-158` | Largest calm-water hull-free radius exceeds nine tiles. | number |
| Crowded bands must span the sea | `spread` | `src/systems/garden-fleet-placement.test.ts:161-171` | Thirty-ship watch band spans more than 20 tiles. | number |
| Real fleet may not be packed materially tighter | mean nearest-neighbour distance | `src/systems/garden-fleet-placement.test.ts:218-235` | Mean nearest separation remains above 3.8 tiles. | number |
| General harbour palette has a perceptual chroma ceiling | `CEILING = 0.16` | `src/systems/palette.test.ts:31-38` | Every non-reserved OKLCH token stays below 0.16 chroma. | number |
| Reserved/identity palette tokens are immutable | `lantern_warm`, `vermillion`, `sail_teal`, `sail_red` | `src/systems/palette.test.ts:42-49` | Four tokens equal exact authored hex values. | contract+docs |
| Vermillion remains the loudest ordinary accent | `HARBOR_PALETTE.vermillion` | `src/systems/palette.test.ts:51-57` | Every token except vermillion/bloodmoon has lower chroma. | contract+docs |
| Risk-label accents cannot exceed palette register | `DEWS_AREA_LABEL_COLORS`, vermillion | `src/systems/palette.test.ts:160-166` | Every band accent is at or below vermillion chroma. | contract+docs |
| Hull-family paint has a tighter chroma ceiling | `GARDEN_HULL_FAMILY_PAINT` | `src/three/garden-ships.test.ts:794-797` | Every timber and trim color stays below OKLCH 0.14. | number |
| Hull scale legibility floor is 0.8 | `GARDEN_SHIP_VISUAL_SCALE_MIN` | `src/three/garden-ships.test.ts:408-411` | Minimum visual scale equals 0.8. | number |
| Hull size band is approximately 2.6× | min/max `gardenShipVisualScale` | `src/three/garden-ships.test.ts:402-407` | Max/min ratio must remain between 2.5 and 2.7. | number |
| Night grade/vignette values are authored constants | lift, saturation, vignette, bias | `src/three/garden-post.test.ts:747-760` | Night pins lift `[.01,.01,.018]`, saturation 1.02, vignette .28/.15. | number |
| Dusk grade/vignette values are authored constants | saturation, vignette, bias | `src/three/garden-post.test.ts:771-785` | Dusk pins saturation 1.12 and vignette .38/.15. | number |
| Day grade/vignette values are authored constants | saturation, vignette, bias | `src/three/garden-post.test.ts:788-800` | Day pins saturation 1.12 and vignette .40/.15. | number |
| Ambient + hemisphere floor versus environment 0.6 | no matching assertion in scoped files | `src/three/garden-water.test.ts:203-223` | Scoped coverage only checks propagation of a scene environment intensity of 0.37; it does not pin an ambient/hemi floor or 0.6. | contract+docs |
| Water environment intensity follows scene input | `uEnvironmentIntensity` | `src/three/garden-water.test.ts:207-223` | A scene value of 0.37 is copied exactly into the water uniform. | number |
| Open-night water emissive mean is 0.0155 and below 0.016 budget | `gardenWaterOpenNightMeanEmissiveBudget`, `GARDEN_WATER_NIGHT_EMISSIVE_BUDGET` | `src/three/garden-water.test.ts:1012-1016` | Mean is exactly 0.0155 and remains below the max luminance budget. | number |
| Night emissive test is coupled to shader constants | `moonGlitterGain`, `laneClamp` | `src/three/garden-water.test.ts:1018-1024` | Shader text must contain serialized budget constants. | rewrite |
| Fog near plane is pulled into default framing | `fogRangeAtViewHeight(DEFAULT_VIEW_HEIGHT)` | `src/three/garden-sky.test.ts:363-373` | Near is below 155; island depths remain under 2%/20% fog. | number |
| Fog must visibly grade the rest frame | `fogAt` | `src/three/garden-sky.test.ts:389-403` | Mid/far depths cross 10/20/30% but remain below 45%. | number |
| Backdrop is exactly two triangles | `garden-sky-backdrop` geometry index | `src/three/garden-sky.test.ts:215-220` | Backdrop is a plane mesh with exactly six indices. | rewrite |
| Backdrop shader wording/ownership is pinned | fragment shader source strings | `src/three/garden-sky.test.ts:221-229` | Requires named grading/sun/moon snippets and forbids old crest/ridge snippets. | delete |
| Solar noon follows the calibrated sun arc | `uSunDir`, `uSunIntensity` | `src/three/garden-sky.test.ts:245-252` | Noon intensity is 1.55, elevation 0.721, and x/z ratio ≈35/30. | number |
| Sun bearing differs morning versus evening | `morningDir.angleTo(eveningDir)` | `src/three/garden-sky.test.ts:260-276` | Directions differ by >0.5 rad while both remain above y=.5. | contract+docs |
| Visual gate requires real renderer telemetry | `rendererBackend`, GPU counters | `tests/visual/pharosville-gates.spec.ts:283-287` | Backend is Three and calls, geometries, and triangles are all >0. | contract+docs |

## Pins implementation, delete in a rewrite

- Backdrop geometry shape/index count and fragment-shader substring checks (`garden-sky.test.ts:215-229`).
- Serialized water-budget constants appearing in shader source (`garden-water.test.ts:1018-1024`).
- Named mooring fixture IDs and exact representative membership (`garden-fleet-thinning.test.ts:61-70`).
- Attract-postcard byte-length check as a proxy for composition (`pharosville-gates.spec.ts:290-294`): retain an actual observable visual contract if one replaces it.
- Exact post-chain shader wording/attribute plumbing is likewise implementation coupling, not a visual outcome (`garden-post.test.ts:575-597`).

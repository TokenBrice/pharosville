# Changelog promises review

## 1. Release table

`version` is stored in the source as an imported `PHAROSVILLE_RELEASE_VERSIONS.<key>` constant, so the table keeps that exact, non-fabricated version token.

| Version | Name | Date | Theme | Three most visible shipped changes |
|---|---|---|---|---|
| `...airAndLantern` | Air and Lantern | 2026-09-07 | Air, light, planting | Full-fleet water reflections; sunset station/tower windows; rim planting, wet edges and mirror/lead water claims |
| `...honestWaters` | Honest Waters | 2026-09-07 | Truthful waters, Golden Garden | Re-cut water geography; honey/violet relight and saturated sea; Pharos turn plus separated berths/flags |
| `...roomToSail` | Room to Sail | 2026-09-06 | Open composition, quieter labels | Rest camera reopened to more water; station chips became captions; conditional ship chips |
| `...epicPharos` | Epic Pharos | 2026-09-05 | Monumental lighthouse, warm harbor | Rebuilt Pharos keep and lantern; fortified island precinct; closer camera and warmer, more saturated palette |
| `...clearerWaters` | Clearer Waters | 2026-09-05 | Legible harbors and traffic | Enlarged chain flags; cedar water boards and softer band colors; mature pines, reed barges and wider berths |
| `...aCalmerHarbor` | A Calmer Harbor | 2026-09-05 | Composed garden and direct control | Smoother shore/water transitions and foreground pines; corrected large-ship materials/reflection; composed moorings plus Find/time controls |
| `...moleErrata` | Mole Errata | 2026-09-04 | Public-count and budget correction | Corrected eight-mouth wording; corrected station/geometry claim; restored JavaScript size headroom (no intentional world visual change) |
| `...theEthereumMole` | The Ethereum Mole | 2026-09-04 | Monumental Ethereum harbor and rim ring | Civic hall/belfry/breakwaters; harbors redistributed around the rim; distinct chain silhouettes, roofs and recessed windows |
| `...inhabitedRim` | The Inhabited Rim | 2026-09-03 | Near shore, articulated stations, wreckyard | Stations reach the whole rim; articulated roofs/signature elements; authored south/east shore and eighteen-wreck shoal |
| `...sevenWaterGarden` | Seven-Water Garden | 2026-09-02 | Water-led Japanese-garden composition | Finite garden plate/engawa foreground; named stations with lit quays; seven waters, wreckyard, tsukiyama path/pond/koi |
| `...gardenOfLight` | Garden of Light | 2026-08-13 | Seasonal garden observatory | Garden lighting, bokashi sky, rays, pond, torii and koi; one synchronized wind/light/life pulse; live signals expressed as cargo, weathering and quay health |
| `...quietAnchorage` | Quiet Anchorage | 2026-08-13 | Open water and true day arc | Anchorages with open gaps; aerial perspective and layered mist; real sun arc/shadows and cloth sails |
| `...roomierHarbor` | Roomier Harbor | 2026-08-12 | Laptop-safe framing | 1200×640 profile; fitted camera preserving crown/controls/panel; viewport guards and fallback guidance |
| `...livingSea` | Living Sea | 2026-07-30 | Deterministic weather and inspection | Weather drives water/sky/sails/life; persistent wakes, AO and atmosphere; interruptible guided Observe tour |
| `...rightfulColors` | Rightful Colors | 2026-07-27 | Correct issuer heraldry | Fixed batched atlas row addressing; ordinary sails use transparent cell; fleet-wide identity correction (tests/verification are not visual) |
| `...trueColors` | True Colors | 2026-07-27 | Recognizable logos on quiet cloth | Full stablecoin logos restored; logo-safe plate and livery rim; deterministic decode fallbacks (tests are not visual) |
| `...clearBearings` | Clear Bearings | 2026-07-27 | Calm, artifact-free inspection | Removed horizon mountains/radial glare; softened continuous water; sparse boundary/selection cues and complete fleet |
| `...cargoTide` | The Cargo Tide | 2026-07-26 | Flow, resilience and informative frame | Signal mast/buoy/tide line; crates and hull height express mint/burn and peg state; whole-map draw reduction plus mirror/reflection lighting |
| `...lanternSea` | The Lantern Sea | 2026-07-26 | Three.js maritime world | Volumetric Pharos, shadows and day/dusk/night; seven named waters with coasts; per-issuer hull/sail/flag identity and instancing |
| `...trueWaters` | True Waters | 2026-07-10 | Honest risk semantics and first visit | Correct PSI-to-weather semantics; first-visit legend over visible harbor; signed peg/detail signals, story beats and permalink inspection |
| `...signalClarity` | Signal Clarity | 2026-06-14 | Identity, atmosphere, inspection | Nameplates/logo-safe sails/chain flags; night, horizon, wakes and caustics; permalink, PSI/fleet/dock/grave facts |
| `...curtainUp` | Curtain Up | 2026-05-18 | Cinematic reveal and lived-in motion | First-load reveal; palette-matched loading state; chimney smoke, route choreography and sea-room separation |
| `...needForSpeed` | Need For Speed | 2026-05-17 | Smooth motion and performance | Follow camera/target cycling/time controls; continuous route motion and wakes; weather, atmosphere and in-app changelog |
| `...harborMotionAtmosphere` | Harbor motion and atmosphere | 2026-05-17 | Weather, water and fleet motion | Deterministic sea state; heading/docking/lighthouse life; named-zone borders, palette and cinematic weather |
| `...runtimeHardening` | Runtime hardening and inspection polish | 2026-05-04 | Operability and release safety | Accessible detail panel/touch targets; error/asset telemetry; hit-testing, React churn and delivery optimization |
| `...launchWorldBuildout` | Launch world buildout | 2026-05-03 | Beta-to-observatory buildout | Launch metadata/OG/favicon; pigeonnier, Telegram landmark and day-night controls; expanded fleet, harbors and atmosphere |
| `...foundationAndPerformance` | Foundation, geometry, and performance | 2026-05-02 | Release-ready shell | Release/accessibility gates; reshaped island and seawall; Ethereum harbor, sail marks, civic vegetation and sprite-cache performance |

Evidence for the promises is in `src/content/pharosville-changelog.ts:14-428`; current public copy is in `index.html:7-30`.

## 2. Promises vs. reference frames

| Look-claim from the changelog | Check | Evidence (frame + region) |
|---|---|---|
| Mirror-calm water and the sky sitting properly in the water | **Not visible** | `noon.png @ center/right/bottom`: even teal field, no tower/sail reflections; `dusk.png @ center/right`: no readable mirror. `night.png @ center`: only a small warm patch south of the island, not a mirror. |
| Every hull has a water reflection | **Not visible** | `noon.png @ all fleet regions`, `dusk.png @ left and bottom clusters`: boats have no separable reflected hulls/masts. `night.png @ center/left`: dark water remains unreflected apart from local island glow. |
| Station windows, tower rows and quay edges wake after sunset | **Visible (partial)** | `dusk.png @ center`: many warm tower openings and crown flame; `night.png @ center and bottom-right`: tower rows and a few shore-building lights. Quay-wide lighting is not evident. `noon.png @ center`: windows are dark, as expected. |
| Volumetric god rays / light shafts reach across the day | **Not visible** | `noon.png @ entire frame`, `dusk.png @ entire frame`, `night.png @ lighthouse/sky`: no distinct beams; local flame/window glow only. |
| A soft wet edge appears at every coastline/quay | **Not visible** | `noon.png @ top-left and bottom-left/bottom-right shores`: hard beige/grass-to-water joins without glossy wet lip; same absence at `dusk.png` and `night.png`. |
| Distance reads as distance through haze/aerial perspective | **Not visible** | `noon.png @ top/right and far fleet`: boats remain crisp with no distinct fog falloff; `dusk.png @ upper/right`: only a color grade. `night.png @ upper/right`: scale/darkness, not visible haze. |
| The garden is planted with understory, broadleaf/seasonal color, azalea and leaning pines | **Cannot tell** | `noon.png @ center-left island and bottom-left shore` and `dusk.png @ center/bottom-left`: trees, shrubs and grass are visible, but species, azalea, seasonal state and understory detail do not resolve. |
| Corners/foreground carry real shadow and a fine paper tooth | **Cannot tell** | `noon.png @ corners/foreground` and `dusk.png @ corners`: some dark land/edge contrast is present, but the claimed authored shadow treatment and paper grain cannot be isolated at this frame size. |
| Hulls pitch/roll, anchorages drift and gusts show on boats | **Cannot tell** | A still cannot verify motion. `noon.png @ left fleet` and `dusk.png @ left/center fleet` show many boats, but no temporal swell or gust evidence. |
| A new courier and a deliberately mixed fleet replace uniform hulls | **Cannot tell** | `noon.png @ left/center and bottom-right` and `night.png @ left/bottom-right` clearly show varied sails/hulls, but the specific light two-masted courier cannot be identified at this scale. |

## 3. Public copy vs. the goal

The goal asks for “a visually stunning, beautiful, relaxing experience, similar to a digital Japanese garden; a scene evolving by itself, pleasant to watch and informative about stablecoin markets (Pharos data)” (`00-brief.md:14-16`). The page instead promises a **maritime observatory** and explains only the metaphor: “ships are stablecoins, the water they sail is peg risk” (`index.html:7-9`). OG and Twitter repeat the narrower “live Pharos stablecoin signals as a maritime observatory” (`index.html:16-30`), while the title and `og:title` are only “PharosVille” (`index.html:10,18`).

Recommended public copy:

- **`<title>` / `og:title` / Twitter title:** `PharosVille — A Living Stablecoin Garden`
- **Meta description:** `A living digital Japanese garden where live Pharos stablecoin markets unfold as ships, water, light and weather: calm to watch, and informative about peg risk.`
- **OG/Twitter description:** `Watch live Pharos stablecoin markets unfold in a calm, living digital garden: ships are stablecoins, water is peg risk.`

This keeps the truthful metaphor while adding the promised qualities (living, calm, garden, watchability) and makes the market-information purpose explicit. The wording should be revisited if “Japanese garden” remains a design aspiration rather than an on-screen reality; the frames currently support planted harbor, not yet the full garden claim.

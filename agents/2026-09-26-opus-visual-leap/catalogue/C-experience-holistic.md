# Catalogue C: experience & holistic lanes

Slice: life, camera, chrome, data-poetry, sound, ambient-journey, art-director, critic.
Source: `agents/2026-09-26-opus-visual-leap/reviews/<lane>.md`. Numbers are copied as written in the reports. `—` means the report gives no value. Defect numbers are per lane (`D#`). In the Cross-slice section, `lane-D#` refers to defect # in that lane.

---

## life

Verdict: nothing alive reads as alive. The crown "birds" are beacon plume puffs, gulls are 1-px wingless hairlines, the koi sit outside the pond (double offset), and the two herons are invisible. Attract takes the director slot every frame, so rituals starve. The leap is fewer creatures, drawn and timed properly.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| life-1 | ★ | Day score: clock-anchored rituals as foreground gifts | Attract stops calling the director (checks `active===null`, 90 s back-off). New `ritual` kind, foreground, priority 30, pre-empts arrivals. Rituals request every frame of their window. Silence 8–14 min (`480+hash%361`). New `garden-score.ts` table: dawn skiff 70 s; heron arrives 08:30–10:30 25 s; heron departs 20 s; kindling blue 0.05–0.6 150 s; moonrise; meteor only when moon phase <0.25, 10 s; seasonal visitor 70 s. At most 5–6 gifts/24 h, ≥8 min apart. | poetic 5, relaxing 5, stunning 3 | H (diagnosis) / M (timings) | M | 0 draws / 0 tris / <0.02 ms CPU | `garden-director.ts:45,68,75-78`; `use-canvas-resize-and-camera.ts:705-714`; `garden-almanac.ts:35-56,68-86`; `use-garden-almanac.ts:32-47`; new `src/systems/garden-score.ts` | attract's claim on the director; heron-dusk/meteor coin flip; edge-triggered keeper request | Each ritual writes one ledger line with local time (`HarborLedgerPanel`, `AccessibilityLedger`). Reduced motion: director frozen; one static state per clock phase | Visuals from life-2/4/5/8. Dawn skiff needs Fleet/Data sign-off (non-coin hull). Re-pin `use-canvas-resize-and-camera.test.ts:98-101`, `garden-almanac.test.ts` |
| life-2 | ★ | One heron told in full: glide, stand, strike, ring, depart | 48–60-tri low-poly heron with `aBone` vertex shader: wing hinge `0.85·sin(2πt/1.1)+0.15`, neck strike 0.35 s out / 1.2 s back, landing flare −25°. Flat-shaded `MeshStandardMaterial`. Mirrored reflection instance at 0.35 opacity. Stands at the reed-lily station nearest camera. Catmull-Rom flight splines. ≤2 strikes/h, each emitting a ring | poetic 5, relaxing 5, stunning 4 | M–H | M | net −1 draw / ≈+100 tris / <0.02 ms / 0 tex | `garden-summit-birds.ts:139-147,163-235`; `garden-almanac-dressing.ts:72-81,177-190`; `garden-sea-edges.ts:377-397` | summit heron dart; almanac heron card and 45 s window; `heron-dusk` id; `tower-away` perches near-left | Decorative (registry `seasonalLandmarks`). Ledger lines on arrive/leave. Reduced motion: one standing pose by day, absent at night | Arrival/departure are life-1 rituals. Ring via life-6. Station = reed-lily sites that critic-D4/critic-2 would delete. data-poetry-3 wants the heron on the tidal flat |
| life-3 | ★ | Birds with wings: flap-glide gull, one flock, mostly perched | 10-tri gull with real Y relief (inner/outer panels, 6° dihedral, −10° droop). Vertex shader flap-glide: flapping `step(fract(t/Tc+seed),0.28)`, Tc 4.5–7 s, 3.1 Hz; bank ±35° from CPU heading; wingspan clamp ≥9 px. Two-tone top/underside shader. Sortie chance .55→.30, share .18→.14, period 74→140 s, ≈0.7 airborne. 6 perches | stunning 4, poetic 4, relaxing 4 | H | M | −2 draws / ≈+150 tris (≤16 inst × 10) / <0.02 ms / 0 tex | `garden-harbor-life.ts:118-129,396-397,448-449`; `garden-summit-birds.ts:70-126`; `garden-ship-gulls.ts` | 9+2N island/quay gulls (~25); 5 ship gulls and their 180 s loops; 2 of 3 bird draws | Removes the quay-gull tempo cue (life reversal 1); dock rows carry 24 h supply. Reduced motion: all perched | Operator nod needed to retire the cue. Tests: `garden-harbor-life.test.ts`, ship-gull tests, registry test |
| life-4 | | The keeper kindles the island | Keeper walks quay stair → `GARDEN_PATH_SWEEP_POINTS` (island-local). 1.7 u figure: hooded frustum robe, lamp box `lantern_warm`, `MeshStandardMaterial` with night-value patch. 0.55 u/s, 0.9 s stride, 2 s stop per lamp, 1.5 s ramp keyed on per-fixture `arrivalProgress`. 150 s ritual; reversed at dawn | poetic 5, relaxing 4, stunning 3 | M–H | S–M | 0 draws / +40 tris / 0 tex | `garden-almanac-dressing.ts:133-140,238,254-278`; `garden-island.ts:1611-1618`; `garden-lanterns.ts:14-17`; `world-renderer.ts:4184-4187,4292-4293` | perimeter-rim walk; unlit capsule; anonymous lamp fade-in on island during the ritual | Ledger "18:31 — the keeper lit the island lamps". Reduced motion: lamps lit, no figure. No kasa hat | life-1 ritual. Conflicts with ambient-journey-5 (kindling with no figure). Test `garden-almanac-dressing.test.ts:21-47` |
| life-5 | | 72 kō as the garden's calendar | New `garden-ko.ts`: solar ecliptic longitude λ (g = 357.529 + 0.98560028·d; λ = L + 1.915 sin g + 0.020 sin 2g); `koIndex=floor(((λ−315+360)%360)/5)`. English names only. Gates: fireflies kō 24–28 19:30–22:00; geese 48–65 / 13–16; leaf fall 51–56. NowCaption suffix plus a ledger Season row | poetic 5, relaxing 3, stunning 1 | H | S–M | 0 draws / 0 tris; one pure function per UTC day | `season.ts:4,7-15`; `garden-seasonal-dressing.ts:45-47`; `garden-harbor-life.ts:136`; new `src/systems/garden-ko.ts` | four-month switch as the only season clock (kept for tree crowns); year-round fireflies | No market meaning; text first; romaji only as tooltip | Feeds life-1/7/8. Acceptance: 2026-09-26 → index 45 "Thunder lowers its voice" |
| life-6 | | Rising fish: rings on still water, koi you can see | Fix double offset (drop `GARDEN_POND_CENTER`, `garden-koi.ts:87,100`). 4→2 koi. Draw after the skin at renderOrder 6 with in-shader tint `mix(koi,skin,0.35+depth·3)`. Tail flex `z+=0.08·sin(6t·rate−4x)·smoothstep(0.1,−0.76,x)`. `uRings[3]` ring uniform: `a·exp(−3age)·smoothstep(w,0,abs(r−0.9age))`, lift ≤0.12, 4 s cap | poetic 4, relaxing 5, stunning 3 | H (fix) / M (rings) | S (fix) + S–M (rings) | 0/0/0; ~8 ALU per water fragment, ≈0.02 ms @1×, ~4× at DPR 2 [INFERENCE] | `garden-koi.ts:82,87-88,100-101,112-138,203`; `garden-island.ts:1495-1511,1550-1573,1593-1594`; `garden-seasonal-dressing.ts:76-77` | 2 edge-station koi; leftover `GARDEN_ENGAWA_KOI_WORLD`; continuous invisible motion | Rings thin, round, single; never in named risk water. Reduced motion: t=0 koi, no rings | Water lane owns the sea shader ring uniform. Test `garden-koi.test.ts:20-58` |
| life-7 | | Fireflies of early summer, low over reeds | Gated to kō 24–28, 19:30–22:00, 20 min fades. Anchored to reed-lily sites. 14→10. Blink `smoothstep(0.55,1,sin(2π t/2.2+0.35·jitter))^2`. Floor 1.5→2.5 px. Colour `lantern_warm` lerped 0.35 to `aurora_green`. Optional ember-lane reflection | poetic 5, stunning 4 (in season), relaxing 4 | M | S | 0 draws in season; −1 draw ~48 wk/yr / 0 tris / 0 tex | `garden-harbor-life.ts:125,136,149`; `garden-sea-edges.ts:377` | year-round island-lantern motes; one ember lane in season | Ledger once per night in season. Reduced motion: static at 60 % in season | Needs life-5. Reed-site anchor conflicts with critic-D4 deletion. Bloom must stay under ember |
| life-8 | | Seasonal skein: geese cross at first light | life-1 ritual once per eligible-kō morning, 70 s attention / 90 s envelope. 8 life-3 birds at 1.9× scale; geese variant (longer neck, `stone_dark`, 2.2 Hz, no glide). Straight path at 55–70 u altitude, 180 u behind tower, 9 u/s. V offsets `(±k·1.6,0,k·1.1)`, 0.8 s lag, ±0.4 u slip. Normal fog | stunning 4, poetic 5, relaxing 4 | M | S (given life-3) | 0 draws / +80 tris during beat / 0 tex | life-3 InstancedMesh (capacity 16) | meteor frequency (dark-moon only); island sorties ×0.5 on skein mornings | Ledger line (calendar truth). Reduced motion: nothing | 20° azimuth exclusion around the crown. Reopens the §6 "more birds" ban (life reversal 3). Overlaps the critic-D6 geese billboards |

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Idle viewer never gets rituals: attract re-requests the environment slot every frame; admitted beats close it 6–10 min; keeper/heron/almanac ask only once | pinned-hour captures request keeper before attract; `selected-lighthouse.png` has only the arrival caption | `use-canvas-resize-and-camera.ts:705-714`; `garden-director.ts:68,77-78`; `garden-almanac-dressing.ts:118-129`; `world-renderer.ts:4329-4335`; `use-garden-almanac.ts:45-48` | attract yields; rituals request through their window (life-1) | S |
| D2 | Koi not in pond: pond centre added twice (sample + parent basin); also under 82 % opaque `#244c4f` skin | `life/koi-pond-1440.png` empty in 6 frames | `garden-koi.ts:87-88,100-101,203`; `garden-island.ts:1550-1551,1557-1573,1593-1594` | sample about (0,0); tint in koi shader (life-6) | S |
| D3 | Beacon daymark plume puffs read as birds (3–5 dark crescents at the crown, wrong value) | `noon.png` (840–885,55–100); `golden.png` (800–830,110–130); `life/noon-crown-birds.png` all 9 tiles | `garden-beacon-fire.ts:32-34,133` | beacon lane: one soft continuous column ≤8 % below sky L, or retire the daytime plume | S |
| D4 | Gulls are edge-on hairlines: flat XZ fans; island/quay gulls never flap; ship-gull flap is 0.1 u; two unrelated bird colours | `life/noon-gulls-1440-retry.png`; `noon-gulls-1440.png` skein gone in 6/9 frames | `garden-harbor-life.ts:359-363,447-452,511-531`; `garden-ship-gulls.ts:46-49,72,97`; `garden-summit-birds.ts:174-177` | life-3 | M |
| D5 | Two herons, neither visible: A is a 2-tri dart lying flat when perched; B is a 15-tri unlit card with a 45 s window | `life/dusk-heron-1440.png` (nothing in 27 s) | `garden-summit-birds.ts:129-235,207`; `garden-almanac-dressing.ts:27-31,72-81,177-190,214-225`; `garden-almanac.ts:76` | life-2 | M |
| D6 | Keeper walks the far perimeter rim as a 1.2 u unlit capsule, so the lamps seem to light themselves | `life/blue-keeper-1440.png` | `garden-almanac-dressing.ts:83,236-251,254-278`; `garden-rim-mesh.ts:1016-1030`; `garden-lanterns.ts:14-17` | life-4 | S–M |
| D7 | Life never rests: ship gulls loop forever; ~1/3 of gulls always airborne; 14 fireflies every night | code | `garden-ship-gulls.ts:85`; `garden-harbor-life.ts:136,224` | subtraction | S |

### Subtractions
- Ship gulls, entirely: `garden-ship-gulls.ts`, `world-renderer.ts:4344-4350` (−1 draw).
- Quay gulls (2 per harbour): `garden-harbor-life.ts:33,455-502` (16 birds at 8 harbours), with cue retirement.
- 2-tri summit heron dart `garden-summit-birds.ts:163-235` and almanac heron card `garden-almanac-dressing.ts:72-81,214-225`; replaced by life-2.
- Three `tower-away` terrace perches: `garden-harbor-life.ts:265-266,268`.
- Year-round fireflies outside kō 24–28, and the island-lantern firefly anchor `garden-harbor-life.ts:149`.
- Two of four koi, and the leftover "engawa koi" world constant (`garden-seasonal-dressing.ts:76-77`).
- Keeper's hat disc: `garden-almanac-dressing.ts:238`.
- Daytime blue plume crescents: beacon lane, `garden-beacon-fire.ts:32-34,133`.
- Attract as a director client: `use-canvas-resize-and-camera.ts:705-714`.

### Reversals
- Retire the quay-gull tempo cue (`visual-cue-registry.ts:487-493`; rationale `garden-harbor-life.ts:172-212`) · hairline gulls; the tempo difference can't be seen (`noon-gulls-1440-retry.png`) · risk: loses a high-zoom motion affordance; DOM stays canonical.
- Keeper/heron/almanac as background "environment" beats (`garden-almanac-dressing.ts:124-125`, `garden-summit-birds.ts:131-137`, `garden-almanac.ts:40-41`) · they lose to attract (D1); the bible names them as *the* events · risk: an arrival annotation gets skipped; its ledger line still posts.
- Plan §6 "More birds … banned" (`01-implementation-plan.md:338`) · the standing count falls ~30→~6; one 8-bird skein for 70 s per eligible morning is reopened · risk: instantaneous count spikes for 70 s.
- Four UTC-month seasons as the only calendar (`season.ts`) · keep it for crowns; add solar-longitude kō as the event calendar (goes further than W4.17) · risk: —.

---

## camera

Verdict: there is no shot. The rest pose is a zoom-maximiser corner solution: tower dead-centre (crown x 0.499), 58 % of frame height, crown 6.9 % from the top at 1600×1000, eye 114 u from the tower and 20.6 u up. The 45° yaw lock, the reed-boathouse station and its flag, and a closeness-rewarding score block any right-of-centre frame. Tilt-shift blurs the selected ship.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| camera-1 | ★ | Shot grammar: authored south-shore rest seat | `ShotSpec{targetTile,distance,yaw,eyeHeight,fovDeg,rects}` replaces the grid search. Rects: foot x 0.58–0.66, crown y 0.12–0.18, span 0.40–0.47, inlet corridor clear, `plateEdgeHidden`, `panelSafe`. Objective `−4·abs(x−0.62) −3·abs(crownY−0.15) −2·abs(span−0.44)`, no zoom reward. Seat ≈(136,164) at 45° once stations move, else yaw 30–35° from ≈(118,172). Eye 14–16 u; pitch 2.5–3.5°; vFOV 30–32°. Yaw plumbed through `IsoCamera`/`cameraBasis`/`screenToGroundRay` | stunning 5, poetic 5, relaxing 4 | H (geometry) / M (taste) | M; M–L with yaw | 210 vs 287 draws at `alt-b` / ≈−30–40k tris / ΔGPU ≈0 / 0 tex | `camera.ts:37-39,52-221`; `projection.ts:24-27,30-42,102-110,124-169`; `world-renderer.ts:5064` | zoom-max solver and 1.15 ceiling; hovering rest; invisible bough; ~25 % of hulls leave near field | Top-3 harbours by supply must stay in frame. Reduced motion: same static seat | Harbour must move `watch-south-reed` (110,131) and `calm-engawa-south` (60,130) ≥30 tiles if yaw stays at 45°. GardenMaster gm-1/garden-1 threshold pine. Light (yaw vs sun). Near-dup of art-director-1 |
| camera-2 | ★ | No toy lens: delete tilt-shift | Remove `GardenTiltShiftEffect`, `DOF_*`, `setFocusBandDistance`/`focusBandOverride`, the idle-profile branch and `setCameraZoom` plumbing. Keep `EffectAttribute.DEPTH` only if the Printmaker keyline adopts it. Depth comes from haze and keyline instead | stunning 4, relaxing 4 | H | S | −2 draws when zoom ≥1.2 / — / −0.1–0.2 ms @1× active [INFERENCE] (~4× DPR 2) / −2 half-float RTs [INFERENCE] | `garden-post.ts:561-576,589-638,640-770,717-726,1259,1706,1740-1743,2077`; `world-renderer.ts:1468` | blur pass, 2 RTs, dead W4.6 seam | Removes a "focus = importance" cue that has no data behind it | Delete wording pins `garden-post.test.ts:572,619-622,863-955,984-991`. Conflicts with critic-8 step 3 (clamp focus band) and art-director-1 step 4 (bough in the tilt-shift soft band) |
| camera-3 | ★ | Selection and return as composed shots | `selectionShot(entity)`: anchor (0.36,0.62) ships / (0.40,0.55) docks; lead space along velocity; hull spans 9–12 % of height; yaw ±20°. Occlusion probe against rim heightfield and station AABBs. Smootherstep `T=clamp(1.1+0.45·log2(1+d/240px),1.4,2.4)` s, return ×1.25, 120 ms hold, panel at 70 %. Lighthouse: 3 s, pitch +3°, dolly −4 %, x 0.40 | stunning 3, relaxing 4, poetic 3 | H | M | 0 draws; one probe <0.1 ms CPU | `camera-intent.ts:15-18,127,166-179`; `pharosville-world.tsx:424-427,441-443` | exponential lurch; centre framing; hard zoom 1.2; static lighthouse selection | Reduced motion: cut to pose. Keyboard gets the same shot | Panel rect (x 0.74–0.98, y 0.04–0.32) is a constraint. Near-dup of ambient-journey-4 and critic-8 (different T/anchor params). Tests `use-canvas-resize-and-camera.test.ts:181-190,277-300`, `camera.test.ts:173-206`, `garden-observatory-hit-testing.test.ts:303-335` |
| camera-4 | | Postcard book shot from inside the world | `gardenAttractKeyframes` returns ShotSpecs: Crown in Air (dawn/blue, yaw ≈40°, 8 u); Mole at Market (day, eye (40,110), yaw ≈59°); Ledger Fog Hook (morning, (36,70)); Storm Passage (blue, (104,66), yaw ≈−75°); Engawa Lanterns (golden→blue, (70,106), 6 u, yaw ≈157°); Wreck Memorial (night, (52,104), yaw ≈135°). Yaw ≤12°/s, ≤35° per leg; breath 0.5 during holds; next card by wall-clock phase | poetic 5, stunning 4, relaxing 4 | M | M (after camera-1 yaw) | 0 draws | `garden-attract.ts:22-29,27,34`; `observe-tour.ts:210-214,229-230` | six centre-tile keyframes; outside-the-world views; tilt-shift in postcards | Decorative; existing attract gates kept | Needs camera-1 yaw plumbing. Wreck Memorial subject vs data-poetry-2 (moves the memorial to land). Tests `garden-attract.test.ts`, `use-canvas-resize-and-camera.test.ts:85-95` |
| camera-5 | | Whole-map as a kasumi chart | `edgeHiddenZoom(viewport)`; below it ease pitch from 3° to 38°. Two-segment pitch curve: 38° at min zoom, 12° at 0.55, rest pitch at ≥0.9. Sky adds plate-distance haze `fog += smoothstep(0,30u,distanceOutsidePlate)` | stunning 3, relaxing 3, poetic 4 | M | M | 0 draws; haze ≈0 ms; overview LOD unchanged | `projection.ts:14-17,24-27,343-351` | ocean-slab read; whole-map as a scenic claim | Navigation only; DOM stays canonical. Reduced motion: no pitch animation | Sky lane for haze. Shadow/fog frustum fits. Tests `garden-horizon.test.ts`, `garden-sky.test.ts`, census `TESTING.md:383` (72/72) |
| camera-6 | | Arrival: the air clears, no slide | Sample ShotSpec with eyeHeight −3→0 and pitch −1°→rest, smootherstep over 10 s. Air-haze multiplier 1.8→1.0 over 6 s (Sky uniform, never sea-level fog). Rebuild endpoints on resize | poetic 4, relaxing 3 | M | S–M | 0 | `garden-arrival.ts` (`gardenArrivalCamera`/`sampleGardenArrivalCamera`) | lateral slide −72/+48 px and 0.82 zoom pull | The veil must not read as staleness. Reduced motion: static pose, no veil | Overlaps ambient-journey-1 (mist lift) and chrome-1 (stills registered to the old start pose) |

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Selecting a ship blurs and hides it: zoom ≥1.2 enables tilt-shift; sharp band ≈290 u (199–381), ship at ~91 u; W4.6 seam uncalled; eye looks through the rim garden | `selected-ship.png` centre plus crop | `camera-intent.ts:18,127`; `garden-post.ts:638,1740-1743,1830-1836,2077`; `camera.ts:294-319` | camera-2 + camera-3 | S + M |
| D2 | Rest is a solved inventory view: score `zoom+0.02·visible−2·corridor`; every gate at the 1.15 ceiling; crown on the 0.50 edge; compact crown 26 px from top | `noon.png`, `compact-1200x640.png` | `camera.ts:39,128,177,179-182` | camera-1 | M |
| D3 | Camera breath pops on every input: binary suppression snaps yaw ±2°/pitch ±1°/dolly ±1.5 % to zero and back 2.5 s later; postcards dead-still | ~60 px far-field / ~31 px horizon [INFERENCE]; `breath-noon.png` shows the breath itself is good | `use-world-render-loop.ts:773-784,1080`; `use-canvas-resize-and-camera.ts:713,755` | eased `breathWeight` (out τ 0.5 s, in τ 5 s), phase keeps integrating, 0.5 in postcard holds, breathed pose to hit-test | S |
| D4 | Pine bough never renders at rest; from other eyes it is a green lump standing in water | projects to (−1.05,1.75); `alt-a-noon.png` (940–1080,820–980), `alt-b-golden.png` (950–1150,720–980) | `garden-rim-mesh.ts:912-937` | delete; root the pine in rim land at the new seat (gm-1/garden-1) | S |
| D5 | Postcards centre their subject, shoot from outside the plate, through the toy lens | `postcard-garden-shore-golden.png`; eyes ≈(105,175), (78,172), (185,113) | `observe-tour.ts:210-214` | camera-4 | M |
| D6 | Diorama edge visible at ordinary zoom-out (0.55) | `zoom-055-noon.png` corners | — | camera-5 | M |
| D7 | Selection move lurches: first-order exponential k=5 (return 4); first frame 8 %; long creeping tail; panel waits for it | — | `camera-intent.ts:15-17,166-179`; `pharosville-world.tsx:441-443` | camera-3 | S |
| D8 | Bible contradicts itself: prose says the tower is right of centre, table puts it middle-left | — | `VISUAL_INVARIANTS.md:6,27` | move the tower to middle-right in the table | S |

### Subtractions
- Tilt-shift pass and all DOF constants, including the stale ortho-rake essay: `garden-post.ts:554-770,1706,1740-1743,1830-1836,2077-2079` (essay `:561-576`).
- Eye-relative foreground bough: `garden-rim-mesh.ts:912-986`.
- `+zoom` reward in the rest score (`camera.ts:177`) and the `GARDEN_REST_ZOOM_CEILING` rationale (`:38-39`).
- Binary breath suppression: `use-world-render-loop.ts:778-784` (replace with an eased weight).
- `SELECTION_CAMERA_ZOOM = 1.2` (`camera-intent.ts:18`) and exponential selection/return damping (`:15-17`).

### Reversals
- Fixed 45° yaw (plan D3 `01-implementation-plan.md:57`; `projection.ts:20,30`; `observe-tour.ts:34`) · `station-scan.ts` finds no 45° eye that works; `alt-a`/`alt-c` put the Polygon flag in frame; postcards look at the back of the rim. Authored per-shot yaw is not user orbit · risk: sun/backlight, flag/label facing, pan maths, test churn. Fallback: move the two south-rim stations.
- W2.12 "tilt-shift confined to authored close postcards" (`01-implementation-plan.md:159`; `garden-post.ts:637-638`) · `selected-ship.png`, postcard frame, band stranded at ~290 u · risk: close views need other depth cues.
- 2026-09-06 "rest at harbour view", enforced as "prefer a closer rest" (`camera.ts:175-177`; ledger row 24) · every gate pinned at zoom 1.15 with a centred 58 % tower · risk: fewer hulls legible at rest; keep the top-3 harbours in frame.
- Bible value table (`VISUAL_INVARIANTS.md:27`) · the tower goes right of centre to match the prose (D8) · risk: —.

---

## chrome

Verdict: the scene-first skeleton is right, the finish is not. Everyone first sees a stale noon still with v0.16 chrome baked in, then a 320 ms cut to the real hour. After that, all chrome is flat rectangles: nameplates at ~2:1 contrast and night links at 1.23:1. The leap costs 0 draws.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chrome-1 | ★ | The photograph develops: hour- and pose-matched arrival | 5 chrome-free stills (dawn/day/golden/blue/night, AVIF + JPEG, 1920×1200) captured at the arrival start pose via `preview.mjs --clean`, regenerated each release. `stillForLocalHour()` in `client.tsx`. Loading line moves into the caption slot. Dissolve 320 ms → 1400 ms `cubic-bezier(.33,0,.2,1)`; dolly starts at 60 %. Violet gradient dropped; 28 % text feather | 5 stunning / 5 relaxing | H | M | 0/0/0/0 scene; ~60–90 KB AVIF instead of 120 KB JPEG | `client.tsx:10,64-65,66-88,92`; `pharosville.css:135-146,155,249-253`; `garden-arrival.ts:4,44-50` | stale noon JPEG; centred label; 320 ms cut; gate's 94 % slab | Stills hold no data; alt text per beat. Reduced motion: 0 ms swap, no dolly | Must regenerate stills whenever the rest camera changes (camera-1). Conflicts with ambient-journey-1 (drops the still for a gradient plus mist) and camera-6. Tests `pharosville-world.test.tsx:280-294,792-798`. ~400 KB repo |
| chrome-2 | ★ | The now-line: one sentence in three voices | Structured `{clock,phrase,clause}`: time `font-ui` 500 `clamp(12px,.55rem+.28vw,15px)` tabular; hairline separator; phrase Garamond italic `clamp(17px,.7rem+.5vw,23px)`; clause 0.86 em. Feathered radial scrim replaces the box. Crossfade 800 ms out / 1000 ms in. `aria-live` moved to an sr-only status that fires only on phrase change. Richer hour words | 4 poetic / 4 relaxing | H | S–M | 0 / 0 / <0.05 ms / 0 | `now-caption.tsx:30`; `pharosville.css:748-755`; `detail-model.ts:81-112`; `pharosville-world.tsx:280`; `garden-arrival-beats.ts:95` | navy caption box; text-shadow; per-minute announcement | Warning: roman plus ◆ glyph plus words. Reduced motion: instant swap | Data-story lane owns vocabulary. Near-dup of ambient-journey-D5 crossfade (400/600 ms). Tests `now-caption.test.tsx:24`, `detail-model.test.ts:79,98` |
| chrome-3 | ★ | Record card as a washi print | Day paper ≈`#e5dfce` (ink 13.1:1); night indigo ≈`#26223f` (13.0:1). SVG feTurbulence grain at 5 % (multiply day, screen 4 % night). Double hairline keyline; soft shadow `0 22px 44px -28px`. One-column header; 34 px seal; status on one line; three-cell reading line (italic label + `font-ui` 500 15 px). Kind in italic lowercase; focus on the h2; U+2212 minus; 380 ms entrance | 4 stunning / 4 poetic | H | M | 0 / 0 / <0.05 ms [INFERENCE] / 0 scene | `pharosville.css:494-504,526-593,618,723-727,1185-1231,1237-1250`; `detail-panel.tsx:104,122-164`; `detail-model.ts:1115` | tan cardboard; 4 px offset shadow; 116 px status column; bold figures; tracked kind; black focus box; ledger record style | Band as words plus seal. Reduced motion: opacity only | "Paper grain" rejection (chrome reversal 3). Fallback: flat washi keeps ~80 % |
| chrome-4 | | First-visit three lines; legend as field guide | `firstVisitLines` caption source after arrival/transition/stale; 3 lines × 7 s; key `pharosville.orientation.seen`. Legend rewritten as 3 stanzas; washi/indigo material; Garamond 600 18 px headings. Fix the stale preview `--legend` flag | 4 poetic | M | S | 0/0/0/0 | `use-legend-dialog.test.tsx:46`; `legend-panel.tsx:195-220`; `pharosville.css:934-991,1256-1379` | legend-as-onboarding; 17-line paragraph; gold 900 headings | States the three bible readings. Reduced motion: one combined sentence. Skip on any input | Data-story owns the copy. Competes with the arrival ceremony caption (ceremony first) |
| chrome-5 | | Nameplates and hover in one ink-label language | Chip loses box, opacity .68 and initials. Name Garamond 600 `clamp(13px,.5rem+.35vw,16px)`; band word italic 12.5 px plus glyph (◆/◇/·). Radial scrim; 14 px hairline leader; `CHIP_GAP_PX` 6→14; `CHIP_HEIGHT_PX` 18→34. Fade in 600 ms / out 900 ms. Hover card adopts the same classes | 3 stunning / 3 poetic | M | S | 0 / 0 / <0.05 ms ≤2 labels [INFERENCE] / 0 | `pharosville.css:1400-1450,1467-1490`; `harbor-label-chips.tsx:5,8,67,80-82,118-120,142-148` | chip box and initials; hover card border/gold/shadow | `aria-hidden` duplicates. Severity = word + glyph + tone | Conflicts: data-poetry-D6 (drop the chip), critic-D16 (≥90 s gap), art-director-D11 (ember ink at night). Life: the 10 s window should include the fade |
| chrome-6 | | Chrome breathes with the light: continuous tokens and text roles | `useChromeAir(hour)` writes `--pv-air-ink`, `--pv-text-on-air`, `--pv-paper`, `--pv-paper-ink` each minute from `captionBeats`, with no CSS transition. Text roles `--pv-text`/`-quiet`/`--pv-link`, AA per beat. Retire night redefinitions. Unit test ≥4.5:1 at 5 anchors plus midpoints | 3 relaxing / 3 stunning | M | M | 0 / 0 / one `:root` write per minute / 0 | `pharosville-world.tsx:281,485-487`; `pharosville.css:86-101,728-732,759-761,1227-1231`; `systems/palette.ts` | binary token flip; 3 per-component night overrides | Wall-clock only | Sky/Light publish beat anchors. Palette-mirror tests |
| chrome-7 | | Quiet controls: a word, not a hamburger | Drop the Menu icon; affordance is italic "explore" 16 px plus `/` kbd. Revealed row is Garamond 15 px text with middots and scrim; glyph buttons get a 1 px ring. Shared `.pv-drawer` (light and sound), styled `input[type=time]`, 36×20 switches | 2 relaxing / 2 stunning | H | S | 0/0/0/0 | `world-controls.tsx:116-125,138-140`; `pharosville.css:783-817,859-869,1814` | hamburger; navy pills; native forms | aria-labels, 44 px touch kept | Sound lane drawer uses `.pv-drawer` (sound-2). a11y review of discoverability |
| chrome-8 | | Ink type system: two faces, fluid scale | Tokens `--type-caption/title/prose/figure/label/key`. Garamond 400/600, sans 500/400. Drop uppercase; `tabular-nums lining-nums`; `hanging-punctuation`; U+2212, U+2009. Preload 600; delete the 700 woff2 | 3 poetic | H | S–M | 0/0/0/0; +24 KB preload, −23 KB repo | `pharosville.css:48-54,544-550,880-886,1130-1156,1515-1524`; `index.html:14`; `public/fonts/` | tracked caps; 900 headings; bold figures; ad-hoc rem; mono chip mark | 12 px floor; clamp in rem respects zoom | Screenshot baselines shift |

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Arrival and gate show a stale noon still with v0.16 footer and disc buttons baked in, upscaled; then a 320 ms cut | `public/pharosville/stills/garden-noon.jpg` | `client.tsx:10,92`; `pharosville.css:141,238-256`; `garden-arrival.ts:4` | chrome-1 | S–M |
| D2 | Night card links and section titles vanish: night `--stone #332a1f` → 1.23:1 | `chrome/selected-ship-night.png` top-right | `pharosville.css:98,882,914,930` | text roles (chrome-6) | S |
| D3 | Nameplates illegible (~2.0:1 noon, ~2.2:1 golden; 10.5 px; 7.4 px initials), pop in/out, Danger styled as Calm grey | `arrival-night-frames/02–05.png`; grey box in dawn/golden/night/compact | `pharosville.css:1400-1409,1415,1423,1432,1443,1447-1450` | chrome-5 | S |
| D4 | Card status crammed into a 116 px column (4 lines); hyphen-minus; seal says Calm while prose says stress | `selected-ship.png` top-right | `pharosville.css:529`; `detail-model.ts:1088,1115-1117` | chrome-3 layout, U+2212, consistent narrative | S |
| D5 | Close focus ring is the loudest mark (2 px black box; focus on Close) | `selected-ship.png`, `selected-lighthouse.png` | `detail-panel.tsx:104`; `pharosville.css:723-727` | focus the h2; 1.5 px ring at 4 px offset | S |
| D6 | Caption live region speaks every minute | — | `pharosville-world.tsx:280`; `now-caption.tsx:30` | chrome-2 | S |
| D7 | Night controls miss AA: Explore 4.4:1, `/` kbd 3.4:1 | `night.png`, `deep-night.png` bottom-right | `pharosville.css:805,819` | chrome-6 roles | S |
| D8 | Light & motion drawer is unstyled native UI | [INFERENCE from code] | `pharosville.css:1814`; `world-controls.tsx:116-125` | chrome-7 | S |
| D9 | First visit gets no orientation; legend reads like a spec ("leg/rest contract", "titans") | `legend-night.png` (no legend) | `use-legend-dialog.test.tsx:46`; `legend-panel.tsx:196` | chrome-4 | S |

### Subtractions
- Menu (hamburger) icon: `world-controls.tsx:138`.
- Chip initials mark, box and opacity: `pharosville.css:1400-1439`; `harbor-label-chips.tsx:80-82,142-148`.
- 4 px hard offset shadows on card and ledger records: `pharosville.css:503,731,1190,1230`.
- Caption text-shadow inside an opaque box: `pharosville.css:755`.
- Hover card gold border and drop shadow: `pharosville.css:1474-1482`.
- Tracked uppercase eyebrows: `pharosville.css:544-550` (SHIP/LIGHTHOUSE), `:1515-1524` (OBSERVE), `:1130-1156` (ledger).
- Loading veil violet gradient and centred 600-weight label: `pharosville.css:135-146`.
- Gate 94 % dark slab `pharosville.css:249-253` and 3 px beacon bar `:273-278`.
- Unused `public/fonts/eb-garamond-700-latin.woff2`.
- Duplicate hover rule `.pharosville-changelog-panel__close:hover`: `pharosville.css:1003-1008`.
- Legend "leg/rest contract" sentence: `legend-panel.tsx:195-201`.

### Reversals
- W5.6 "held establishing still + 320 ms crossfade" (`01-implementation-plan.md:213`; `garden-arrival.ts:4`) · the still is the wrong hour with stale UI; 320 ms reads as a pop · risk: stills need regenerating on camera or scene change (release step).
- "Legend stays closed on first visit" (`use-legend-dialog.test.tsx:46`) plus W5.3 deferral (`01-implementation-plan.md:210,352`) · the first visitor learns nothing (`noon.png`) · risk: repeats if storage is unavailable (treat as seen).
- "Paper grain" on the rejected list (`01-implementation-plan.md:336`), flagged for transparency · that rejection targets a scene post-process; this is DOM-only at 5 % · risk: operator may read it broadly; flat washi fallback.
- Binary `data-phase` token swap (`pharosville.css:86-101`; `pharosville-world.tsx:485-487`) · night links 1.23:1; day navy under golden · risk: palette-mirror tests re-pin.

---

## data-poetry

Verdict: the world encodes too much at invisible scale. The registry has 36 cues, almost all sub-pixel. At PSI 94.8 BEDROCK the noon horizon is still a white haze wall, and a storm hoist flies permanently (19 depegs; pmUSD at −5350 bps). The richest data is unseen: 88 dead coins and 3,178 daily PSI points.

### What the world encodes today (reproduced)
| Reading | Carrier | Legible at rest? | Verdict |
| --- | --- | --- | --- |
| Market stability (PSI) | beacon and sky cover (`garden-sky.ts:633`) | **Only when things go bad.** BEDROCK, STEADY and TREMOR all give cover = 0. | Muddy. The good-news half of the scale is flat. |
| Risk band | water body per named sea | As *difference*: flat turquoise on the left, chopped navy on the right (`noon.png`). Its meaning needs the legend. | Half-legible. |
| Who leads | hull scale and sail mon | Partly. The biggest "T" sail (**[INFERENCE] USDT**) is cropped at the left frame edge in `noon/golden/night.png` (x 0–100, y 700–900). | Weak. |
| Fleet off-peg / storm | signal mast (`garden-signal-mast.ts`) | **Yes, and it is wrong in spirit.** Permanently saturated: 5 of 5 pennants plus the storm cone. | Spell-breaker. |
| Supply 7d | wet strandline plates (`garden-tide-line.ts`) | No. At 0.34 u the band is about 6 px. | Invisible. |
| PSI 30d worst | salt courses (`garden-tide-stain.ts`) | No. | Invisible, and collides with the supply tide. |
| PSI 30d average | pad tint/scale (`garden-month-record.ts`) | Yes, as **lime** foliage. | Legible but ugly. |
| Dead coins | 18 curated wrecks at water luminance | No, even when selected. | Invisible memorial. |
| Freshness | local fog banks (`epistemic-haze.ts:64-88`) | Can't be told apart from the aesthetic day mist. | Muddy. |
| Mint/burn, chain tempo, fittings, age, buoys | micro-props and motion | No (inspect zoom only). | Fine as inspect-zoom jewellery; they must not grow. |

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| data-poetry-1 | ★ | Clear air is earned: far mountains on stable days | Signed clarity `(clarity−0.65)/0.35` (BEDROCK +1 … CRISIS −1). `uClarity` in the horizon: per-layer `smoothstep(th−0.25,th,uClarity)` with thresholds 0.6/0.1/−0.9; alpha `mix(0.10,0.62,vis)`; dusk crest rim. `uHazeStrength = 0.42−0.14·max(s,0)+0.3·max(−s,0)`. Day mist 0.12→0.03 when positive and fresh; fog start ~20 % further out. 60 s hysteresis, 90 s crossfade | stunning 4 / relaxing 5 / poetic 4 | H | S–M | 0 / 0 / ≈0 ms [INFERENCE] / 0 | `psi-sky.ts:3-6,31-34,48-52`; `garden-horizon.ts:156`; `garden-sky.ts:588-591,633,663-666`; `epistemic-haze.ts:64-88` | aesthetic day mist; ~⅓ of haze baseline | Lighthouse row "Far shore: three ranges visible…"; legend row "Distance you can see = market stability; low mist = a stale feed". Reduced motion: instant | Art director re-keys top-row values. Must be the only writer of daytime mist. Conflicts with art-director-3 kasumi (clock-owned mist) and art-director-2 / critic-4 (fog re-key). Fog-range tests |
| data-poetry-2 | ★ | Stone garden of the fallen (karesansui for 88 dead coins) | `createGardenStoneGarden(graves)` with all 88 (no curation). Year islands, oldest at back. Size `0.25+0.95·clamp01((log10(peakMcap)−6)/4.4)`. Form by cause family: tateishi / split / hiraishi. Moss `clamp01((yrs−0.5)/3.5)`. Procedural rake rings (≤9 centre uniforms). Lantern reuses the cemetery lane. Hover epitaph. Site: island court or engawa shade | poetic 5 / stunning 4 / relaxing 4 | M | M–L | ≈−6 draws net / +3k tris net (88×~80 ≈7k) / — / 0 tex (procedural) | `garden-landmarks.ts:179-392,194-219,221-239,343-900`; `detail-model.ts:1285-1315` | Wreck Shoal field and cause-colour stains; decorative Sakuteiki stones if court | Every stone selectable (`detailForGrave`). Ledger "moss: N years since death". Legend: size/moss/form. Grave selection frames its stone | GardenMaster picks the site. Retires Wreck Shoal named water (reversal 3). Headroom ~150 stones. camera-4 "Wreck Memorial" postcard depends on this |
| data-poetry-3 | ★ | Tidal flat: supply as how much shore is bare | New `garden-tidal-flat.ts`: domed flat, max slope 1:40, `y = WATER_Y−0.06−offset·0.12`. Shader dry L +0.06 / wet L −0.1 spec 0.6; 0.05 u wrack line; sine-ridge ripples. Tide-stone at offset 0 (none if unavailable). 20 min ease. West of island, in the non-attributed halo | poetic 5 / relaxing 5 / stunning 3 | M–H | M | +1 draw (≈2k tris), −1–2 draws retired; net ≈0 / 0 tex / <0.1 ms [INFERENCE] | `supply-tide.ts:73-93`; `garden-tide-line.ts:70,88,179`; `world-renderer.ts:3589`; `garden-island.ts:586-590`; `world-layout.ts:57-62` | quay tide-line plates; island strandline; PSI salt courses | Row reworded "The flat stands mostly covered — +0.83 % over 7 days…". Never oscillates. Reduced motion: static | Harbour: footprint vs empty inlet and reed shallows. Water shallow-shelf double-shade. Heron prefers the flat (vs life-2 reed station). Critic-D4 reed removal on the same side |
| data-poetry-4 | | The Long Record: emaki scroll in the lighthouse panel | DOM SVG of 3,178 daily PSI points decimated to ~400, sumi stroke `HARBOR_UI_PALETTE.ink`; grey stones at death months; last 30 d washed moss. 24-cell `mintBurn.hourly` strip | poetic 4 / relaxing 3 | H | M | 0 GPU | `detail-model.ts:723-778`; `garden-month-record.ts:18-43` | plain "Read the record" list | `role="img"` summary plus hidden table; "PSI is an index; lows are daily closes" | UI/DOM lane; chrome-3 card material |
| data-poetry-5 | | "Since your last visit" as a wrack line on the flat | Add `supplyTideOffset` to `VisitSnapshot` (schema bump). Flat shader draws a 0.04 u line at the previous offset, alpha 0.35, only if the change is ≥0.15 | poetic 4 / relaxing 4 | M | S (after dp-3) | +0 draws (one uniform) | `use-visit-snapshot.ts:80-89` | — (banner gains "supply tide: ebb → flood") | Banner and ledger state it; no storage, no line. Rejects petals-by-days-away | Needs data-poetry-3. Overlaps ambient-journey-6 (return visit told in place) |
| data-poetry-6 | | Leaders go "down by the head" when off peg | titan/heritage only: bow pitch ±2.5° at ≥50 bps, ±5° at ≥200 bps; sign follows deviation; 30 s ease | poetic 3 / truthful legibility 4 | M | S | 0 (existing `pitch`) | `visual-cue-registry.ts:303-312`; `garden-fleet-batch.ts:1292` | heave component on those hulls | Peg row adds "hull trimmed bow-down". Reduced motion: static | Must sit above wave pitch amplitude. FleetMotion lane |

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Storm hoist flies forever: 19 depegs saturate 5 pennants; cone for tiny pmUSD −5350 bps; brightest chroma on the island | `island-terrace.png` (1040–1090,735–880; cone 965,745); `noon.png` (915–945,600–700) | `visual-cue-registry.ts:171-180` | pennants = top-20-by-supply off peg; cone only if ≥1 % supply off peg; else retire the mast | S |
| D2 | PSI clarity ladder one-sided: cover = max(0, 0.65−clarity), so BEDROCK/STEADY/TREMOR all 0 | `noon.png` band y 250–520; `island-instruments.png` | `garden-sky.ts:588-591,633`; `psi-sky.ts:3` | data-poetry-1 | S |
| D3 | Two water-on-stone metaphors with opposite meanings (salt courses = stress; strandline = supply grew) | invisible today | `world-renderer.ts:3371-3373,3589`; `garden-tide-line.ts:88` | water height = supply only; retire salt courses | S |
| D4 | Calm month turns garden lime: pads →0.55, shelves →0.75 toward `aurora_green #67a23a` | `island-terrace.png` (430–760,570–830); `noon.png` (590–760,530–700) | `garden-month-record.ts:14,45-52,72-80` | flourishing = depth: moss L −0.08, C ≤0.09, H ≈150; stress to straw | S |
| D5 | Memorial to 88 dead coins invisible, even selected; curated to 18; timber at water luminance | `cemetery-ust.png`; `wreck-shoal-close.png` (560–880,680–830) | `garden-landmarks.ts:194-208,210-219` | data-poetry-2; meanwhile grave selection frames its wreck | M |
| D6 | UI chip is the only text in the world at rest; duplicates the caption | "OpenDollar USDO · Calm" (430–575,575) in golden/night/deep-night/sea-sign-hover | — | drop the chip for arrivals; keep the caption (UI/Life owner) | S |

### Subtractions
- Signal mast pennants and storm cone (`garden-signal-mast.ts`), unless the supply-weighted gate is taken.
- PSI high-water salt courses: `garden-tide-stain.ts`, `world-renderer.ts:3371`.
- Tide-line plates on every quay wall: `garden-tide-line.ts:179`.
- Aesthetic daylight mist when feeds are fresh: `garden-sky.ts:663-666`.
- Wreck cause-colour stains: `garden-landmarks.ts:221-225`.
- Arrival chip at rest (D6): — (no file:line given).
- Registry freeze: no new per-ship micro-cues; new meaning only at landscape scale, each retiring a micro-cue: `visual-cue-registry.ts`.
- Rejected in lane: live tickers; red/flashing depegs (`01-implementation-plan.md:342`); fireworks on records; harbour crowding for chain concentration; sail angle for peg; shishi-odoshi per $X minted; data-driven moon (W4.15); liquidity-depth encodings (not in the 7 payloads, `shared/types/pharosville.ts:18-26`).

### Reversals
- "The world offers three readings" (`VISUAL_INVARIANTS.md:41-43`) · amend to 3 live + 1 slow (tidal flat) + 1 memory (stone garden); the 36 invisible cues and the saturated hoist prove that scale, not count, keeps calm · risk: scope creep; cap of 5 plus the displacement rule.
- D15/W4.14: supply tide demoted to Ext, exclusive with the moon record (`01-implementation-plan.md:69,196-197`) · the sky reading is flat in healthy bands, so attention is unsaturated; ship the flat, drop the moon record · risk: —.
- Cemetery as Wreck Shoal in water (`decision-ledger.md:29`; `visual-cue-registry.ts:292`) · 18 of 88, occluded (`wreck-shoal-close.png`, `cemetery-ust.png`); move it to land as karesansui · risk: reopens macro-composition and the seven sea-sign names plus tests.
- `WRECK_QUIET_CEILING` curation (`garden-landmarks.ts:190-208`) · the census is the truth; small entries become pebbles · risk: —.

---

## sound

Verdict: the harbour is silent, and the approved W4.20 plan (3 loops, 5 MB) would break the one clock. A procedural Web Audio bed bound to the existing 9 s breath, 600 s gust, hour and sea state needs 0 asset bytes, a ~10 KB gzip lazy chunk and 0 GPU. Build the tuning harness first.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sound-1 | ★ | One wind, heard: procedural bed on existing clocks | One white-noise buffer. Sea 2× LP, cutoff `380+520·breath·(0.6+0.4·swell)` Hz, ±3/±6 dB, seeded sets every 5–7 cycles. Wash BP 1.2 kHz. Stone-lap bursts × `smoothstep(0.45,1.2,zoom)`. Wind BP 250–1100 Hz plus whistle >0.65. Gust pan from `gardenGustAtWorldPosition`. Rain; rumble. Beacon-pass +3 dB. 4 Hz `AudioSceneSnapshot`; StereoPanner | relaxing 5, poetic 4, stunning 3 | H | M (2–3 d + tuning) | 0/0/0/0; main ~0.003 ms/frame; audio 1–2 % P-core [INFERENCE]; ~4 KB gzip; ~3 MB decoded | `weather.ts:66-88,146,164-176,194-231`; `sea-state.ts:93-95,112-116`; `use-world-render-loop.ts:600-606`; `world-renderer.ts:4420,4433`; new `src/lib/pharosville-audio/bed.ts` | W4.20 loops; 08-13 duplicated clocks | DOM parity: ledger Sea state, beam rows. Reduced/Still: gust off, breath ±1 dB | Renderer exposes `beamAngle`. No lane may add a second wave clock. Thunder needs operator OK |
| sound-2 | ★ | Tuning harness and consent lifecycle | Sound `<details>` on the shared drawer. Volume `gain=v²`, default 70. `AudioContext` created synchronously in the click. `localStorage["pharosville.sound"]`. Armed return with 8 s fade. Hidden: 0.6 s fade + suspend; offscreen −12 dB; `BroadcastChannel`; close on off. `AUDIO_MIX` const; debug mixer; `&audio=record:N`; `audio-render.mjs` OfflineAudioContext. Budget 48 KB raw / 16 KB gzip; `public/audio/` ≤400 KB | enabling; relaxing 4 | H | M (2 d) | 0 GPU; +~1.2 KB gzip main; lazy chunk 25–40 KB raw / 8–12 KB gzip; 0 when off | `world-controls.tsx:112-126`; new `use-garden-sound.ts`; `mix.ts`; `use-legend-dialog.ts:6-20`; `use-world-render-loop.ts:284-289`; `bundle-budgets.mjs:80-105`; `pharosville-debug.ts:9` | 08-13 ship's-bell toggle; unverifiable "tuning days" | Default off; switch/volume in a11y tree; never a unique carrier | chrome-7 `.pv-drawer`. Phases P0–P3 gated on renders. Headroom bundle entry |
| sound-3 | ★ | Breath music: anhemitonic pentatonic, silence as score | Tonic D; {D E F♯ A B} quiet ↔ {D E G A B} watchful (PSI <50 drops the third). Onsets on breath phase 0/0.4 ±60 ms. Phrases 3–7 notes, rest 2–8 breaths. Active 4–7 min / tacet 5–10 min (≤45 %/h). Seed `${utcDayKey}:${minuteBucket}`. Hour orchestration; tacet 00:00–04:45. Mallet modal 1:4.0:9.2; Karplus–Strong pluck; detuned pad. Shared IR T60 3.2 s. Storm −9 dB | poetic 5, relaxing 5, stunning 3 | M | L (3–4 d + listening) | 0 GPU; ~4 KB gzip; ~5.4 MB decoded; <0.5 % audio [INFERENCE] | `weather.ts:164-176`; `detail-model.ts:83-89`; `day-cycle-beats.ts:18-44`; `garden-director.ts:64-79`; new `music.ts` | 08-13 chime-grade interaction tones | `sound` channel added to the registry; test that sound is never the only primary channel. Own Music checkbox | DataPoetry sign-off on F♯/G. Art-director/GardenMaster costume review |
| sound-4 | | Beats you can hear: director events scored once | `events.ts` on a new `director.active.id`. Arrival: luff (11 Hz AM), mallet D4 at the dip minimum, fender 180 Hz, panned; same for supply up or down. Keeper: one tock per lamp. Heron: wingbeat sample. Meteor: bed −4 dB (3/4/6 s). Market beats: never | poetic 4, relaxing 3 | M/H | M (1.5 d) | 0 GPU; ≤3 voices; ~40 KB samples | `garden-arrival-beats.ts:9-11,92-96`; `garden-almanac-dressing.ts:123-127`; `garden-summit-birds.ts:133-137`; `garden-almanac.ts:47-54` | lets W4.7 keep "No bell" | Direction only in caption text. Reduced motion: director frozen, no events | Renderer exposes lamp-lit count. Hooks must follow life-1/ambient-journey-5 beat renames (keeper 180 s here vs life-4 150 s vs ambient-journey-5 60 s) |
| sound-5 | | Borrowed sound: shakkei for the ear | Synth bell buoy (partials 0.5…2.51 × 392 Hz; Poisson λ=4+20·swell/h; pan +0.85; LP 3 kHz). Gulls 06–18 h (none in storm >0.4). Dawn waders. Insects granular (8 grains, HP 3 kHz, −46) summer/autumn nights. Creak λ=6+8·swell. CC0 only; no uguisu/higurashi/temple bell | poetic 4, relaxing 4, stunning 2 | M | M | 0 GPU; ~13 one-shots + 4 s grain ≈220 KB (cap 400 KB), ~3.5 MB decoded | `sea-state.ts:93,152-155`; `season.ts:7-15`; new `borrowed.ts`; `public/audio/LICENSES.txt` | pressure to add visible birds/buoys | Buoy is a redundant echo of swell. Save-data: synth buoy only | Species should match Life fauna. Harbour positions for pans. Insects use `seasonFromDate`, not life-5 kō |
| sound-6 | | Fog has a voice: stale-feed foghorn | Two detuned saws A1/E2 (55/82.4 Hz) + octaves, LP 400 Hz; 1.2/2.5/3 s envelope; 5-cent vibrato 4.5 Hz; −30 dBFS; panned to the stale water; on entry then ≤4/h; silent during foreground beats | poetic 4, relaxing 2 | M | S | 0 GPU, 0 bytes, 1 voice | `detail-model.ts:109-110`; `VISUAL_INVARIANTS.md:58-60` | — | Caption names the feed. If stale >~10 % of hours, entry only | Operator sign-off that it is not an "alarm" (D11). DataPoetry. Kasumi/stale-fog treaty |
| sound-7 | | Listening pose: Still + Sound, lean-in on selection | Selection ducks bed −2 dB (τ 0.6 s). Focus source panned to `selectedDetailAnchor`: lighthouse BP 180 Hz Q 1.2 with 0.3 Hz AM at −38; ship laps 2× plus creak at −36; 1.2 s release; 400 ms debounce | relaxing 4, poetic 4 | M | S/M | 0 GPU; +2 voices while selected; 0 bytes | `world-controls.tsx:123`; `pharosville-world.tsx:95` | hover/selection chimes (08-13 W8.1) | Same sound for every ship regardless of risk | — |

### Mix sheet (summary of `AUDIO_MIX`; levels at volume 100 %)
- Sea body −30 RMS calm / −22 storm (LP 380→900 Hz on breath). Wash −36/−26 RMS. Stone lap −34/−30 pk (~280/h × nearDetail).
- Wind −44/−28 RMS (gust +6 dB, 1 per 600 s). Whistle −34 and rain −30 in storm only. Thunder rumble −30 pk, ≤20/h, CRISIS+ only.
- Beacon pass −42 (bed modulation, 115–240/h). Night air/insects −52/−46, 20:00–04:45.
- Borrowed: bell buoy −34 pk (4→24/h), creak −38/−34 pk (6→14/h), gulls −36 pk (6/h, 06–18 h), dawn waders −38 pk (12/h, 05–07 h).
- Events: arrival −32 pk (≤5/h), keeper −40 pk (≤8 per 180 s beat), heron −38 pk (1/day), meteor = bed −4 dB dip, foghorn −30 pk (entry + ≤4/h).
- Music: mallet/pluck −30/−32 pk, 6–13 notes/min in phrase, ≤45 %/h; pad −38 RMS, tacet 00:00–04:45; storm music −9 dB.
- Reverb return −20; sends music −10, events −16, bed −28.
- Master: comp thr −24, 2.5:1, knee 10, 30/800 ms; limiter thr −8, 20:1; ceiling −6 dBTP; calm ≈−27 LUFS at 100 %, ≈−33 at default.
- Ducking: foreground beat −6 dB music over 1.5 s; find/text focus −6 dB master. Voice caps ≤6 events, ~12 bed nodes, ≤4 music.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | W4.20 loops can't follow the 9 s breath / 600 s gust; drift out of phase (why 08-13 was cut) | plan text | `01-implementation-plan.md:202`; `weather.ts:66-74`; `ultimate-garden-design-plan.md:186-189` | procedural bed (sound-1) | S |
| D2 | W4.20 budget 5 MB compressed / 24 MB decoded is ~12× needed; seconds of silence after the gesture | plan text | `01-implementation-plan.md:202` | procedural bed + lazy one-shots | S |
| D3 | The world's one wind front is visually illegible at rest (M confidence) | `sound/gust-front.png` all 9 frames (tier interaction) | `weather.ts:69-74,194-231` | let the ear carry the gust (sound-1) | S |

### Subtractions
- No UI sounds (hover/click/open/close): rejects 08-13 W8.1 chimes; — (no file:line given).
- No sound for market events: `garden-director.ts:64` priority-100 beats stay silent.
- No per-ship voices: ≤6 event voices.
- No loops: W4.20 spec `01-implementation-plan.md:202`.
- Silence at night: no music 00:00–04:45.
- Meteor gets silence (bed dip) instead of a sound: `garden-almanac.ts:47-54`.
- No costume: no in scale, koto idiom, shakuhachi, bonshō, shō, taiko.
- No sound before consent, and never during the 1.8 s reveal.

### Reversals
- W4.20 "three seamless loops, ≤5 MB / ≤24 MB" (`01-implementation-plan.md:202`) · loops can't follow `gardenBreathAt`/`gardenGustEnvelope`; 08-13 already chose pure synthesis (`:166`) · risk: synthesis quality needs the harness. Proposal: 0 B bed, samples ≤400 KB, decoded ≤12 MB.
- "Suspended on hidden tabs" (W4.20) · keep the default; add opt-in "Keep listening in other tabs"; data freezes while hidden; fade out over 20 s after 30 min hidden · risk: up to 30 min of audio-only calm drift (operator decision).
- 08-13 "diegetic ship's bell toggle" (`ultimate-garden-design-plan.md:166`) · a bell reads as notifications; the control must be conventional · risk: —.
- Ledger "Ship only with committed tuning time" (`decision-ledger.md:12`) · reframe from time to evidence: stem tables ±2 dB, ≤−6 dBTP, 30 min listening log · risk: —.
- Thunder under "no market alarms" · allow only a transient-free rumble (LP 160 Hz, 600 ms attack, ≤20/h) at CRISIS+ when lightning is visible (`weather.ts:102-108`) · risk: startle; operator may veto.

---

## ambient-journey

Verdict: rest can be calm, but the edges of time jolt. A night load goes white (luma 255) → stale noon veil (94) → night (15.6) via a 320 ms cut, then an easeOutQuint lurch and a minor-asset caption. Each pointer move jolts the frame ~28 px, and it jolts back 2.5 s later.

Watch timeline (key facts): arrival caption at ~6.4 s; attract at 2 min held still 36 s (director refused); 30 fps duty after 3 min; 07:15–16:15 daylight plateau means no light change at noon. Water shimmer is 12.4–13.3 grey levels per 1.5 s against 0.8 in the sky; 19 % of pixels σ>15 over 9 s.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ambient-journey-1 | ★ | Mist lifting: arrival in the true hour | Inline `html,body{background:#12313d}` + ≤40-line script sets `--pv-veil-top/bottom` from `dayCycleBeats`/`DAY_CYCLE_SKY_PRESETS`. Veil becomes a gradient; JPEG only for the narrow fallback. `arrivalMist` m: density ×(1+3m), falloff ×(1+1.5m), m = 1−smootherstep(0.6,6.6 s). Veil out over 900 ms. Arrival offsetY −28 px, zoom ×0.95, quintic smootherstep 9000→7000 ms. Director 90 s initial silence | poetic 5, relaxing 5, stunning 4 | H (veil/colour) / M (mist) | M | 0 / 0 / ≈0 ms [INFERENCE] / 0 | `index.html`; `pharosville.css:135-141,155`; `garden-height-fog.ts:44-49,59-72`; `use-canvas-resize-and-camera.ts:683-697`; `garden-arrival.ts:39-50,57-58`; `client.tsx:10` | noon JPEG veil; 320 ms cut; −72/+48/0.82 pose; easeOutQuint; bold label; first-minute ceremony | `role=status`/`aria-busy` kept. Reduced motion: gradient, 200 ms crossfade, m=0 | Light: per-phase mist presets (day ×2.5, night ×3.5). Conflicts with chrome-1 (hour-matched stills). Overlaps camera-6. Tests `pharosville-world.test.tsx:280-294` |
| ambient-journey-2 | ★ | A camera that breathes only in solitude, never snaps | Boolean → weight `w`: target 1 only if idle ≥45 s with no hover/selection/intent; to 0 τ 0.5 s (~1.5 s), to 1 smootherstep 12 s; phase keeps running. Amplitude yaw ±2°→±0.8°, pitch ±1°→±0.6°, dolly ±1.5 %→±1.2 %. `CAMERA_BREATH_INPUT_FREEZE_MS` 2500 → 45 s idle | relaxing 5, stunning 2 | H | S | 0/0/0; one scalar per frame | `use-world-render-loop.ts:773-784`; `world-renderer.ts:5065-5068` | perpetual drift during attentive use; two jolts per touch | Hit targets stable while pointing. Reduced motion w=0 | Near-dup of camera-D3 fix. Conflict: camera wants breath 0.5 during postcard holds; here w=0 while a tour holds. Loop test re-pin |
| ambient-journey-3 | ★ | "Stay": harbour as a window left open | `stay` state + `stay=1` URL. requestFullscreen, `wakeLock`, `data-stay`, cursor hidden after 4 s. Attract idle 45 s. Chrome and caption fade 2 s; caption returns on beats, stale, and 20 s each :00. Exit only on Esc or click. 30 fps during holds; full rate on travel legs | relaxing 5, poetic 4 | H | M | 0 draws; full-rate only during 20–35 s pans, 3–4 per 30 min | `pharosville-world.tsx`; `pharosville.css:791-795`; `render-scheduler.ts:16,28` | implicit attract chrome-hiding; always-visible caption | Announces "Stay mode — press Escape". Reduced motion: tableau repainted each minute [INFERENCE] | Chrome lane UI. Disable hover picking. Desktop gate |
| ambient-journey-4 | | Min-jerk glides; selection lands on its subject | Quintic smootherstep for selection/return/reset/toolbar, `T=clamp(1.1+0.4·log2(1+d/240px),1.3,2.6)` s; Hermite blend 0.3 s on retarget; exponential kept for drag/wheel/follow. Frame hull at (0.42W,0.58H); reject framings hitting the near-rim occluder mask; fallback zoom 1.05 | relaxing 4, stunning 3 | M | M | 0/0/0; CPU only | `camera-intent.ts:15-17,23,90,121-133`; `use-canvas-resize-and-camera.ts:350` | damped lurch; centre framing | Reduced motion: immediate | GardenMaster/Harbour occluder mask. Near-dup of camera-3 and critic-8 (different T and anchor). Test `use-canvas-resize-and-camera.test.ts:192-196` |
| ambient-journey-5 | | Evening kindling: one rite a day at the real dusk | `kind:"keeper"` foreground beat when blue weight crosses 0.05 (dawn: night <0.95); priority 50, 60 s. Beacon lamp `smoothstep(0,4s)` then `(4,9s)`; beam from 9 s. Mole lamps onset `9s+0.8s·rankByDistance`, ramp 1.6 s outward (inward at dawn). Caption "18:15 — the lamps are lit". No replay | poetic 5, relaxing 3, stunning 4 | M | M | 0 draws; per-instance onset from index (16-attr cap) / GPU ≈0 | `garden-director.ts:1,64,83`; `world-renderer.ts:4258-4260`; `garden-almanac-dressing.ts:149-184` | almanac lantern-round spheres; instant phase lamp-on | Clock-only; market beats pre-empt. Reduced motion: lamps on/off by hour | Conflicts with life-4 (keeper figure; this avoids a figure). Pharos: beam onset and daylight beam near zero. Sound-4 keeper tocks |
| ambient-journey-6 | | The harbour remembers: return visit told in place | `visitSnapshotDeltaSummary` prose (weekday / "n days ago", title-case bands, "→", ≤2 symbols). Top-precedence caption for 20 s. Arrival `from` pose = `followTile(subject)` at zoom 1.05, 4 s hold, 7 s to rest. Banner removed; ledger section stays | poetic 4, relaxing 3 | M | M | 0/0/0 | `use-visit-snapshot.ts:10-17,129-144`; `since-last-visit.tsx:19-37`; `detail-model.ts:97-112`; `pharosville-world.tsx:1082` | since-last-visit toast; generic return pose | Restates stored deltas; announced once. Reduced motion: no glide | DataPoetry band prose. Overlaps data-poetry-5 and chrome-2. Needs the ambient-journey-4 occluder check |
| ambient-journey-7 | | Still garden: authored reduced-motion tableau | Reduced motion: gulls use the quay-perch pose (`air=0`), trail material skipped or hidden. Corner keepout: no hull centroid in the 180×120 px bottom-right chrome box (next free anchor). Water t=0 normals, glitter −20 %. Repaint each minute | relaxing 4, stunning 3 | M | S–M | fewer draws (181 vs 283) / +0 tex | `garden-harbor-life.ts:492-493` | frozen motion blur; corner pile | Ships stay in band water; only the slot changes (fleet sign-off) | Life perched pose. FleetMotion. Overlaps critic-D15 (Ledger heap, berth allocator) |
| ambient-journey-8 | | Deepening calm: world slows with the watcher | `GARDEN_BREATH_SECONDS` 9→10 (token and CSS). `idleDepth` 0→1 smootherstep over 5 min idle, back over 1.5 s. Flag flutter ×(1−0.2d), water scroll/glitter ×(1−0.25d), wake alpha ×(1−0.4d); phase-integrated. Never route speed or data | relaxing 4 | M | S | 0/0/0 | `weather.ts:67-68`; `motion-tokens.ts:19` | constant-energy scene | Decorative channels only | Water owns the numbers. Changing the breath period affects sound-1/sound-3 (bound to breath) and every breath-keyed system. Needs phase accumulators |

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Camera breath snaps on every touch: 28–29 px left / 6–7 px up in <120 ms, 24 px back; far fleet 84 px | `breath-snap-sheet.png` (trial 1 / trial 0) | `use-world-render-loop.ts:773-784`; `world-renderer.ts:5065-5068` | idea 2 | S |
| D2 | Cold load luminance slam 255→94→15.6 over a stale v0.16 screenshot; bold sans label; mismatched framing | `load-night-frames/00–03` | `index.html`; `pharosville.css:135-141,148-167`; `pharosville-world.tsx:1148-1159` | idea 1 | S (bg/veil) / M (mist) |
| D3 | Arrival opens on the least finished frame (tree blob, yellow cylinder, Polygon flag; 583k tris > 500k) and lurches (easeOutQuint 5× mean velocity) | `arrival-noon-frames/00.png` | `garden-arrival.ts:39-41,44-50,58` | idea 1 | S |
| D4 | First sentence is a minor asset ("USP arrives…") because `lastForegroundEndSeconds = −∞` | load log 6.4 s; `selected-lighthouse.png` | `garden-director.ts:41,67` | init to creation time, or a 90 s arrival foreground beat | S |
| D5 | Caption changes are hard text swaps | — | `pharosville.css:742-758`; `NowCaption` | stacked spans, 400 ms out / 600 ms in, `--pv-motion-curve-breathe` | S |
| D6 | Reduced-motion tableau freezes gull motion blur; 3 hulls pile under Explore | `reduced-noon.png` (820–870,70–120); `reduced-vs-noon-crops.png` | — | idea 7 | S–M |
| D7 | Selection lands with the subject hidden (blurred rim tree, cylinder, DOF); exponential peak velocity at t=0 | `selected-ship.png` | `camera-intent.ts:15,18,90,121-133` | idea 4 | S–M |

### Subtractions
- In-app `garden-noon.jpg` veil: `pharosville.css:141` (recapture chrome-free for the narrow fallback only).
- Bold centred "Charting market winds…": `pharosville-world.tsx:1158`, `pharosville.css:143-146`.
- First-minute arrival ceremony caption: `garden-director.ts:41,67`.
- Since-last-visit toast: `since-last-visit.tsx`.
- Camera-breath amplitude yaw ±2°→±0.8°, and no breath during attentive use: `use-world-render-loop.ts:773-784`.
- Stacked announcements: at most one nameplate chip (the admitted ceremony's subject); `GARDEN_ARRIVAL_BEAT_CAP_FULL` at `garden-arrival-beats.ts:165-184`.

### Reversals
- Reborn W1.3 "perpetual camera breathing" (`01-implementation-plan.md:129`; `camera-composition.md:30`) · `breath-snap-sheet.png` 28–29 px jumps; the plan's own "if drift, idle-only" clause is met · risk: rest stills feel more diagrammatic (water, breath and fleet still move 19 % of pixels).
- Arrival as a camera fly-in (`garden-arrival.ts:44-67`) · unfinished rim at 583k tris; front-loaded ease · risk: test re-pins only.

---

## art-director

Verdict: an asset review, not a picture. The centred Italianate tower fills 65 % of height, and the upper two-thirds is one light slab (L* 64–77, target 27–72). Only night obeys the value plan. The single style decision is shin-hanga hour-prints: authored value planes, hour-keyed air, kasumi and a real repoussoir (`blue-rethird.png` shows it is ~70 % latent).

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| art-director-1 | ★ | Compose the print: aim-first rest camera + a repoussoir that exists | Score `−4·abs(tx−0.62) −3·abs(crownY−0.12) −2·abs(towerSpan−0.48) +0.5·zoom +0.02·visible −2·corridor`, keeping `nearFlagBand`. Bough forward ≈6, left ≈3–4, anchored by projected screen target (pad centroid (0.06,0.18)); needles lerped 0.8 to `timber_dark`, value ≤15; kept soft | 5 stunning and relaxing | H | S (bough) / M (solver+tests) | 0 / 0 / ≈0 / 0; rest zoom 1.15→0.95–1.0 | `camera.ts:128,177-188`; `garden-rim-mesh.ts:919-936` | tower dominance 65 %→~48 %; bottom-left cut-off hull | Bough excluded from hit-testing; corners only | Near-dup of camera-1 (camera: crownY 0.15, span 0.44, no zoom reward). Conflict: camera deletes the bough and re-roots it in rim land; here it is re-seated relative to the eye. Uses the tilt-shift soft band that camera-2 deletes. Endorses GardenMaster engawa seat `cam=1404.8,-695.2,0.9` |
| art-director-2 | ★ | Hour colour script: air carries temperature, shadows the complement | Day sky/fog L −12 L*, hue +10° toward cerulean, fog density −25 %. `DAY_GRADE.shadowTint [0.95,0.985,1.05]`; `GOLDEN_GRADE.shadowTint [0.93,0.95,1.08]`, highlight blue 0.94, split 0.5. Steeper dusk horizon exponent; dusk fog lerp 0.85→0.95 toward `fog_blue`; golden `hemiSky = fog_blue`. Budgets: orange ≤15 %; hero ≥8 L* off its air; noon grid ±8 in 7/9 cells | 5 stunning and poetic | H (golden) / M (noon) | M | 0 / 0 / ≈0 / 0 | `garden-day-cycle.ts:88-98,134-142`; `garden-post.ts:127-131,136-139`; `garden-sky.ts` gradient | warm-rescue multipliers; golden orange haze wall; golden split-tone | Wall clock owns light; neutral-clarity targets (D15 kept) | Sky/post single owner with ideas 3 and 8. Overlaps critic-4 and data-poetry-1 (fog/haze). `palette.test.ts` |
| art-director-3 | ★ | Kasumi: distance mist bands | `kasumi(d,h)` in `gardenHeightFogGlsl`: two lobes `smoothstep(d0−w,d0,d)·(1−smoothstep(d0,d0+w,d))·exp(−max(h−h0,0)/hs)`. A: d0≈110 u, w≈35, hs≈1.8. B: d0≈210, w≈50, hs≈6. Colour = horizon +6 L*. Amplitude dawn .55 / morning .35 / noon .12 / golden .3 / blue .4 / night .15. Camera-distance keyed | 5 poetic and relaxing | M | M | 0 / 0 / +0.05–0.15 ms @1× [INFERENCE] (~4× DPR 2) / 0 | `garden-height-fog.ts` | uniform haze at those depths; far-fleet chroma | Treaty risk vs stale local fog: must be clock-owned and uniform by depth; data-truth sign-off | Conflicts with data-poetry-1 ("mist = stale") and critic-4 (less fog). Helps camera-5 plate edge. Fleet distance chroma |
| art-director-4 | | Dye the chain flags: nobori cloth | Nearest-hue 6-dye field from `HARBOR_PALETTE` (indigo, deep teal, persimmon, ochre, hemp, charcoal), C ≤0.10; brand-colour mark at ~45 %. Cloth 0.6×, hoist lowered below tower third tier; portrait 1:2.4 | 4 relaxing | H | S | 0 all axes | `garden-chain-flag.ts:174-179,190-202` | largest saturated planes in upper frame | Identity via mark shape plus DOM | Near-dup of critic-3 (critic: OKLCH clamp keeps hue, scale 4.2→2.4). `dock-layout.test.ts`; ≥18 px mark |
| art-director-5 | | Reflections as pillars; a lighthouse that flashes | `heroUv.x+=n.x·0.012; heroUv.y+=n.y·0.003` plus 4 vertical taps at `k·0.006·(1+rough)`. Reflection ×0.85, −15 % saturation except emissive. Beam cross `pow(1−across,2.5)`, along `1−smoothstep(0.35,1,vAlong)`. End-on: `uScatter` → lantern-glass emissive + 4-point star sprite | 4 stunning | H | S–M | 0 / 0 / +0.1–0.2 ms @1× [INFERENCE] (~4× DPR 2) / 0 | `garden-water.ts:1155-1161`; `garden-lighthouse.ts:361-366,965-996,1040-1060` | squiggle reflections; smudge disc | Beacon PSI modulation kept. Reduced motion: parked, no flash | Conflicts with critic-7 (distortion y-dominant 0.018, horizontal gaps) and critic-1 (end-on dissolves into halo, no star). Water lane water-2. Test `garden-lighthouse.test.ts:52-58` |
| art-director-6 | | Water written in strokes: mirror inlet, textured open sea | `calm = inletMask·(1−windGust)`, analytic ellipse or region-field channel. Normal amp `mix(1,0.18,calm)`, tiling `mix(1,0.6,calm)`, 2nd layer bias `vec2(0.06,0.16)`. Hero reflection ×1.4 in calm | 4 relaxing | M | M | 0 / 0 / ≈0 [INFERENCE] / **0 tex** | `garden-water.ts:97-135,726-745` | foreground chevron carpet | Roughness only, never band colour; only in Calm Anchorage/inlet | Tension with critic-2 (Calm is already a flat plate; wants 35 % glitter). Check `garden-sea-sign-siting.ts` |
| art-director-7 | | Niwaki shape grammar | Pine pads: flattened ellipsoids, 3–5 tiers, 2.2:1, lerped 0.7 to `timber_dark` (value ~20–25); S-trunk of 3 segments. Retire camera-side momiji/broadleaf blobs. Rocks sunk 30 %, waterline dark band, moss cap | 4 stunning | M | L | 0 draws / +5–15k tris / 0 tex | `garden-flora.ts:18,66-69` | blob trees; palm-reading pads | Seasons keep their clock role on the far rim | Tri budget shared with fleet (D1). `garden-flora.test.ts`. Garden lanes |
| art-director-8 | | First light, last light: crown catches the sun | `keyWarm = smoothstep(hLine−4,hLine+4,worldY)`; hLine 40→0 u over 05:00–06:15 and 0→40 u over 18:30–19:30; direct `mix(coolKey,warmKey,keyWarm)`; hills too; only above 18 u | 4 poetic | M | S | 0 / 0 / +0.02 ms @1× [INFERENCE] / 0 | shared lighting patch; `DAWN_GRADE.highlightTint` | uniform warm key at dawn/golden | Clock-owned | Must agree with height fog and kasumi. Light lane |

### Hero moments
1. "Evening glow at the Pharos" (18:45): `blue-rethird.png` without the Polygon flag and yellow dome. Needs ad-1, ad-4, ad-5, kasumi band A.
2. "Moon road" (22:00–02:30): near-black water, one silver road, beacon pillar reflection, lantern flash. Needs ad-5, removal of the D9 pale bands, ember chip (D11).
3. "Morning kasumi" (05:30–06:30): mast tips and crown above a mist band, crown lit rose. Needs ad-3, ad-8.
4. "The arrival" (any hour): one hull crosses the mirror inlet leaving a long V-wake. Needs ad-6 + arrival beat + `garden-wakes.ts`.
5. "Noon clarity": deep cerulean sky, white tower, cloud shadows on the water. Needs ad-2 (noon air), ad-1.

### Defects
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | Authored repoussoir bough never renders (~56° off-axis vs ~24.6° half-hFOV; x ≈ −1690 px) | `noon.png` bottom-left L* 31 (target 15); `compact-1200x640.png` | `garden-rim-mesh.ts:919-920` | re-seat ~3 u left / 6 u forward (ad-1) | S |
| D2 | Rest camera maximises zoom; aim only breaks ties (1.15 ceiling, tower on 0.50 edge) | `noon.png` tower y 70→700 | `camera.ts:39,128,177,179` | aim primary, zoom secondary | S–M |
| D3 | Golden hour one-hue soup: 38 % saturated orange; tower L* ~50 on sky ~60; upper frame +25 L* | `golden.png`; `wholemap-dusk.png` | `garden-day-cycle.ts:94-98,134-142`; `garden-post.ts:136-139` | ad-2 | M |
| D4 | Noon has no value structure (rows 72/74/73 over 64/68/77; tower ~80 on haze ~85; fleet cell 77 vs 42) | `noon.png` centre/middle-right | — | ad-2 | S–M |
| D5 | Beacon end-on flash is a brown-grey smudge; cone hard-edged | `night.png` 690–750,210–290; `deep-night.png` 820–890,205–290; `night-beacon.png` | `garden-lighthouse.ts:965-996,1042-1050` | lantern-glass flare + star; feather `pow(1−abs(across),3)`, fade 60 % length | S |
| D6 | Daytime beacon smoke reads as a blue feather / slate puffs at the crown | `crop-crown-morning.png`, `crop-crown-noon.png`, `golden.png`, `noon-1440p.png` | `garden-beacon-fire.ts:31-35,133-148` | one thin warm-grey ribbon ≤0.25 opacity, or none by day | S |
| D7 | Brand-hex flags are the most chromatic and highest objects (Tron `#ff060a`) | `noon.png` Ethereum 95–180,290–355, Base 445–475,365–395; `selected-ship.png`; `wholemap-noon.png` | `garden-chain-flag.ts:190-202` | ad-4 | S |
| D8 | Foreground water is a uniform chevron carpet (HF 7.5); pine reflections as green blobs | `noon.png` y>760; 560–760,760–900 | `garden-water.ts:726-745` | ad-6 | M |
| D9 | Night reflections squiggle ("C" worms); pale horizontal bands on the water ([INFERENCE] beam road/landing pool) | `night.png` 700–860,860–960; 0–560,740–790; 1100–1568,640–700 | `garden-water.ts:1157,1274-1290` | ad-5 | S–M |
| D10 | Selection framing shoots through a blurred blob tree and yellow cylinder | `selected-ship.png` 600–760,450–840 | — | clear the pick ray or cap near-occluder alpha | M |
| D11 | Arrival nameplate outshines every ember at night | `night.png` 430–575,568–583; `deep-night.png` | `harbor-label-chips.tsx:39-64` | at night-mix >0.5, ember ink at 60 % opacity | S |
| D12 | Pine pads read as palms at distance (thin, bright, drooping; leaf lerped only 0.45) | `wholemap-noon.png`; `noon.png` 165–340,410–470 | `garden-flora.ts:66-69` | ad-7 | M |

### Subtractions
- Daytime beacon smoke puffs: `garden-beacon-fire.ts:31-35,133-148` (delete by day or make one ribbon).
- Red pole marker's tall vertical: `noon.png` 225–245,600–740; shorten to a low float ≤⅓ height (no source line given).
- Golden stick reeds in open water: `noon.png` 255–485,740–850; move to shore or remove (no source line given).
- Pale faceted floating rocks: `noon.png` lower right; sink/darken or remove (no source line given).
- White foam puddles on open water: `blue-rethird.png` 380–560,830–920 (no source line given).
- Tilt-shift on selection postcards: `selected-ship.png` (source `garden-post.ts`, per camera lane).
- `ship-wake-detail` 1 px hairlines: `noon.png` 940–960,795 and 1180–1215,770; 84 of 279 draws (critic gives `garden-ships.ts:2847-2858`).
- Golden split-tone: `garden-post.ts:136-139`.

### Reversals
- Enlarged brand-hex chain flags (`decision-ledger.md:22,25`; `garden-chain-flag.ts:190-202`) · `noon.png` top-left; five-logo parade; Tron vs vermillion · risk: slower far identification (DOM and mark remain).
- "Closer rest is better" (`decision-ledger.md:24`; `camera.ts:177`) · 1.15 ceiling, centred tower vs right-third tests · risk: hulls ~10 % smaller at rest.
- No-backlight sun arc (`garden-sun.ts:37-47`) · its rationale cites the locked iso camera, now 32° perspective; no contre-jour frame exists; swing the key to contre-jour in the last 30–40 min before sunset · risk: sails darken ~30 min/day; shadow-camera fit; confidence M, operator decides.
- (Not reversed: §6 rejection of toon/ink/paper-grain filters.)

---

## critic

Verdict: a real perspective harbour broken by ~15 cheap lies. The noon right-middle ninth is L* 91 vs 42 target (white wall). At night a world-fixed moon band at L* 30 outshines the tower (L* 17). Brand-neon flags, stranded reeds and crawling detail add to it. Subtract before adding: three bundles take ~3 days and free ~84 draws.

Measured value plan (median L*, target in brackets): noon middle row 63(27) 70(45) 91(42); golden middle 48(20) 55(32) 73(26); night top 2(9) 2(14) 2(11). The middle band is 20–50 L* too light by day; the night sky is ~7 L* too black.

### Ideas
| ID | ★ | Title | What changes (technique/params) | Impact | Conf | Cost | Perf (Δdraws/Δtris/ΔGPU/Δtex) | Key files | Displaces | Truth/a11y note | Depends on / conflicts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| critic-1 | ★ | Night belongs to the beacon | Delete world-fixed moon band. Light `0.95+dusk·1.2+night·2.4`, distance 46→30; stone emissive 0.05→0.015. `statueGleam = 0.22·daylight+dusk·0.5` (night 0), metalness 0.85→0.6. Beam `alpha*=smoothstep(0.92,0.6,uScatter)`; halo 1.8→1.25, opacity 0.46→0.3; fade 0.78→1.0. Night zenith L* 2 → 9–14 | 5 relaxing, 4 poetic | H | S | 0/0/0/≈0 ms | `garden-water.ts:1177-1184`; `garden-day-cycle.ts:370-379`; `garden-lighthouse.ts:400-415,426-434,799-806,1037-1049` | floodlight; statue glow; moon-band smear | Lamp PSI modulation kept (`garden-lighthouse.ts:347-354`) | = water-4 (moon band). Conflicts with art-director-5 end-on star flare. Sky lift must land with the critic-4 fog re-key. Re-pin day-cycle tests |
| critic-2 | ★ | Clean water: remove the lies on the sea | Calm glitter kept 35 % in `mirrorZone`, depth 1.22→0.95. Warning cadence continuous `bodyAlong·0.11`; `boundaryFoam` −40 % Warning/Danger. Delete `createWake` 2 `Line`s. Sea-edge scale 1.5→1.0 for reeds/piles; re-seat reeds on shore | 4 relaxing, 3 stunning | H | S (~1 d) | **−84 draws** (whiskers), −1 if reed mesh removed / — / small ALU saving / 0 | `garden-water.ts:711-713,1025,1105-1107,1243`; `garden-sea-regions.ts:279-285,308,316`; `garden-ships.ts:2847-2858`; `garden-sea-edge-sites.ts:79` | 84 hairline draws; 7 open-water reeds; dash marks | Region identity via texture/flow/colour + DOM | Pairs with water-3. Reeds conflict with life-2/life-7 anchors (reed-lily sites). Tension with art-director-6 calm mask. Tests `garden-sea-edge-sites.test.ts:52-73`, `world-renderer.test.ts:1091` |
| critic-3 | ★ | Dye the brands into the palette | `chainFlagField`: OKLCH C ≤0.09, L 0.38–0.62, 20 % mix toward `fog_blue`; hue kept; mark full contrast. `HARBOR_FLAG_SCALE_MULTIPLIER` 4.2→2.4. `batchedTrimColor` C ≤0.08 ×0.8. Geese re-anchored | 4 stunning, 4 relaxing | H | S | 0/0/0 | `garden-chain-flag.ts:204-207`; `dock-layout.ts:234,243-263`; `garden-ships.ts:648-651` | chroma and area on 11 flags; violet ring | Identity via logo/initials + DOM | Near-dup of art-director-4 (palette dye field, 0.6×). Harbour lane conflicts with larger rim identity. `dock-layout.test.ts`, `harbor-label-chips.test.tsx`; Aptos lightness floor |
| critic-4 | | Put the horizon back: recession, not erasure | `fog.near = islandDistance+70`; `FOG_FAR_BEYOND_EDGE` 1.35→1.7; noon fog L* ~70, bluer; sea-level height fog ×0.5 by day; near mist shelf off by day | 5 stunning, 4 relaxing | M | M | 0 draws; ALU unchanged | `garden-sky.ts:82,98,103`; `garden-height-fog.ts`; `garden-sky-billboards.ts:91-104` | fog density; near mist shelf | Stale fog banks become more meaningful | Sky/light/water lanes. Overlaps art-director-2 and data-poetry-1; tension with art-director-3 kasumi. Slab edge may reappear (critic-D11). `garden-sky.test.ts` |
| critic-5 | | Far fleet silhouettes that are still boats | `createFarFleetGeometry`: 0.72 → 0.5-deep V hull, vertex colour 0.55× `hullColor`; second family-shaped sail polygon (3–5 verts); far sail cloth luminance floor `max(markPresence,0.45)` | 4 stunning | M | M | +0 draws / ~+0.6k tris (+2–4 per ship) / — / 0 | `garden-ships.ts:1973-2035`; `garden-fleet-batch.ts:283,291,1191-1234` | flat tan slab | Cloth hue = identity; DOM exact | 16-attribute cap (position/uv only). FleetCraft lane. Kasumi interplay. `garden-fleet-batch.test.ts` |
| critic-6 | | Antialias gravel, weave, tower courses | Gravel/moss `DataTexture`: `generateMipmaps`, `LinearMipmapLinearFilter`, `LinearFilter`, anisotropy; optional `fwidth` normal fade. Weave gate `1−smoothstep(0.008,0.03,threadPitch)` | 3 relaxing | H | S (½ d) | 0 draws; +33 % of 16 KB mips; tex count unchanged | `garden-island.ts:87-129,570,1689`; `garden-fleet-batch.ts:1006-1011` | — | — | — |
| critic-7 | | Reflections that behave like water | `heroMask` uses `min(seaReflectivity,1.1)`; clamp 0.85→0.6; `hero.rgb *= mix(vec3(0.72),uDeepColor·1.4,0.25)`; `heroUv.x+=n.x·0.004; heroUv.y+=n.y·0.018+crest·0.01`; horizontal gaps `step(0.35,fract(worldZ·0.9+n.y·2))·0.5` | 4 poetic | H | S | 0 draws; few ALU | `garden-water.ts:1150-1161` | 0.85 mirror | — | Overlaps water-2. Conflicts with art-director-5 (different distortion axes). `garden-hero-reflection-pass.test.ts` |
| critic-8 | | Selection that shows the ship | Ray from candidate eye to masthead against hit snapshot, rim mesh, canopy; if occluded, yaw ±6° steps to ±24°, then pitch +2° steps; clamp focus band to include the hull | 3 stunning, 4 trust | M | M | CPU only, one ray at selection | `camera.ts:295-319`; `world-renderer.ts` follow | "fit then accept" framing | Reduced motion: cut to the clear pose | Near-dup of camera-3 / ambient-journey-4. Step 3 moot if camera-2 deletes tilt-shift (critic endorses camera-2) |

### Defects (full ranked list, 17)
| # | Defect | Evidence (frame/region) | Source file:line | Fix | Cost |
|---|---|---|---|---|---|
| D1 | White wall where the harbour should recede; right-middle L* 91 (lighter than sky) | `noon.png`/`golden.png` x 880–1600, y 440–560 | `garden-sky.ts:98` (`fog.near = islandDistance+12`), `:103` (far ×1.35) + height fog + day mist | `fog.near` ≈ +70; day fog colour −15–20 % L, bluer; cap noon height fog; target ≤55 | M |
| D2 | Calm water a flat painted plate by day; world-fixed moon band at night L* 30 > tower 17, identical 22:00/02:30, static | day `noon.png` 0–560,560–860; night `night.png`/`deep-night.png` 100–600,740–800 and 1100–1568,640–700; `critic/night-motion.png` | `garden-sea-regions.ts:279-285`; `garden-water.ts:711-713,1025,1243` (day); `:1171-1184,1178` (moon road) | day: 35 % glitter, depth →0.95 (with water-3); night: delete `:1177-1184`, keep view-dependent glitter `:1186-1199` | S |
| D3 | Crypto-brand flags at architectural scale (Ethereum 2× pagoda roof; TON/Polygon > halls; Tron reddest) | `noon.png` 95–185,290–360; `selected-ship.png` 1195–1300,400–480 and 600–700,365–430; `wholemap-*` 1185–1215,380–395 | `garden-chain-flag.ts:190-202`; `dock-layout.ts:234,243-263` (×4.2) | critic-3 | S |
| D4 | Shore geography stranded in open water: reeds boat-sized; Warning shoal bars read as ice floes; Ledger piles as obelisks | `noon.png` 250–490,740–855; 1320–1600,815–840; 1430–1470,540–590 | `garden-sea-edge-sites.ts:79,136-138,153-155,169-172`; `garden-sea-edges.ts:69-72` | delete or re-seat 7 reed sites within 1 tile of shore; shoals `stone_mid` 40 % → `deep_sea_1`, 0.15 above water; halve piles | S |
| D5 | Far fleet as tan planks beyond 150 u | `noon.png` 1290–1520,580–612 and 1050–1250,570–600; `wholemap-*` | `garden-fleet-batch.ts:283,291,1191-1234`; `garden-ships.ts:1973-2035` | critic-5 | M |
| D6 | Geese billboards stuck to the statue like a blue feather (ortho anchors under perspective); frozen smudge in reduced motion | `morning.png` 795–835,100–140; `noon.png` 840–890,55–105; `noon-1440p.png`; compact; `reduced-noon.png` 820–880,75–125 | `garden-sky-billboards.ts:57-90,115-123,257-270`; `garden-sky.ts:562,694-698` | re-anchor 15–25° left in open sky, or 7→3 with crisp strokes; hide in reduced motion | S |
| D7 | Night lighthouse floodlit (PointLight 9.15 over 46 u), statue L* 54, beam end-on brown disk | `night.png` 690–760,215–295; `deep-night.png` 820–900,205–295 | `garden-day-cycle.ts:370-379`; `garden-lighthouse.ts:426-434,799-806,1037-1038,1044-1047` | critic-1 | S |
| D8 | Hero reflection louder than the object: green disc "lily pads" by day; S-worm windows at night; mix 0.85, isotropic distortion | `noon.png` 560–760,790–930; `night.png` 700–870,850–970 | `garden-water.ts:1150-1153,1157,1161` | critic-7 | S |
| D9 | Aliasing: gravel moiré (64² Nearest, no mips); sail screen-door; wake whiskers (84 draws); Morse boundary dashes | `critic/noon-shimmer` 01→02; `noon.png` 560–1120,680–780; 1070–1130,790–850; 960–1010,785–800; 150–460,770–825 | `garden-island.ts:87-129,570,1689`; `garden-fleet-batch.ts:1006-1011`; `garden-ships.ts:2847-2858`; `garden-water.ts:1105-1107` | critic-6 (gravel, weave); critic-2 (whiskers, Morse) | S |
| D10 | Violet neon gunwales (`livery.primary` verbatim on trim ring; blooms at dusk) | `noon.png` 1030–1080,785–800 and 1150–1180,765–775; `golden.png` | `garden-ships.ts:648-651`; `garden-fleet-batch.ts:770-778` | clamp strake chroma (critic-3) | S |
| D11 | The world is a slab: raised plate, skirt, hard diagonal seam; flat periwinkle plate water vs rippled ocean | `wholemap-*` 700–1350,380–480; `critic/island-close.png` 0–820,780–980 | `garden-water.ts:840,1413-1417` | adopt water-6: annulus shore from `gardenPlateEdgeDistance`, shared shading, crossfade 20–40 u | M |
| D12 | Hard sky step on whole-map views (ladder compressed into ~90 rows, clamped) | `wholemap-dusk.png` y≈88–92; `wholemap-noon.png` y≈80 | `garden-sky.ts:130-141,347,632` | floor `uSkyVisibleHeight` at sin(6°); smoothstep top | S |
| D13 | Near-water seam and mottling at compact ([INFERENCE] tilt-shift half-res) | `compact-1200x640.png` 850–1200,500–512; `noon.png` 1300–1600,860–1000 | not pinned; suspect `garden-post.ts:589-638,1740-1743` | A/B disabling tilt-shift at `#t=10` 1200×640 | S–M |
| D14 | Selection hides the selected ship (blurred lump-tree, ghost sail behind bamboo; sharp band ~290 u vs ship ~91 u) | `selected-ship.png` 580–760,450–850; 760–850,625–670 | `garden-post.ts:638,1740-1743` | critic-8 + delete tilt-shift (camera-2) | M |
| D15 | Reduced motion piles ~15 NAV ships into a heap at Ledger Mooring | `reduced-noon.png` 1040–1270,490–615 | `motion.test.ts:862`; allocator `garden-fleet-placement.ts:423-627` | allocate static Ledger positions via the berth allocator with `MIN_HULL_GAP` | S–M |
| D16 | Nameplate that never leaves ("OpenDollar USDO · Calm"; 10 s window refreshed each second) | dawn/golden/blue/night/deep-night/morning/compact/sea-sign-hover 430–580,568–584 | `pharosville.css:1391-1451`; `garden-arrival-beats.ts:9-12,128-136`; `pharosville-world.tsx:546-556` | ≥90 s quiet gap; 400 ms fade | S |
| D17 | Crumpled pale sheet at the island's SE corner (source unpinned) | `selected-lighthouse.png` 1060–1125,700–775; `noon.png` 1065–1115,715–765 | not pinned (needs one `--draw-census`) | — | S |

### Subtractions
- Ship wake detail lines: `garden-ships.ts:2847-2858` (−84 draws).
- Open-water reeds: `garden-sea-edge-sites.ts:136-138,167-168,178-179` (or re-seat; reeds exist at `garden-docks.ts:1279`).
- Floor-quantised Warning cadence: `garden-water.ts:1105-1107`.
- Night statue gleam: `garden-day-cycle.ts:376`.
- Halo sphere night scale-up: `garden-day-cycle.ts:371` (cap 1.25).
- Autumn geese near the crown: `garden-sky.ts:694-698` (hide until re-anchored).
- Permanent arrival nameplate: `garden-arrival-beats.ts` (≥90 s gap).
- Cream near-shelf mist at noon: `garden-sky-billboards.ts:93-95`.

### Reversals
- 2026-09-05 flag enlargement, ledger row 22, `HARBOR_FLAG_SCALE_MULTIPLIER 4.2` · made for the ortho whole-plate; now flags are bigger than halls and Tron outranks vermillion · risk: whole-map flag legibility drops (inspection view with DOM search).
- "Calm and Ledger intentional mirrors" with glitter/foam zeroed (`garden-water.ts:710-713,1025,1243`; `garden-sea-regions.ts:276-285`) · a flat dyed plate in perspective · risk: Calm loses separation from Watch; use a surface-state ladder (water-3).
- World-fixed night moon road (`garden-water.ts:1171-1184`) · two-sided searchlight stripe brighter than the tower · risk: — (view-dependent glitter remains).
- Sea-edge ×1.5 enlargement (`GARDEN_SEA_EDGE_SCALE_FACTOR`, `garden-sea-edge-sites.test.ts:64`) · boat-sized reeds under perspective; revert to 1.0 · risk: —.

---

## Cross-slice clusters

**Rest composition / the seat.** camera-1, art-director-1, camera-D2, art-director-D2, camera-D4, art-director-D1, camera-D8, camera reversals 1/3/4, art-director reversal 2.
- NEAR-DUP: camera-1 ≈ art-director-1. Both use an aim-first score, but params differ: camera crownY 0.15 / span 0.44 / no zoom reward vs AD 0.12 / 0.48 / +0.5·zoom.
- CONFLICT: bough. camera-D4 and the camera subtraction delete the eye-relative bough and re-root it in rim land at the new seat. art-director-1 re-seats it (~3 u left / 6 u forward, screen-anchored).
- Seat options: camera south-shore ShotSpec (≈(136,164), or yaw 30–35°) vs AD endorsing the GardenMaster engawa `cam=1404.8,-695.2,0.9`.

**Tilt-shift / selection framing / glides.** camera-2, camera-3, camera-D1, camera-D7, ambient-journey-4, ambient-journey-D7, art-director-D10, the art-director tilt-shift subtraction, critic-8, critic-D14, critic-D13.
- NEAR-DUP: camera-3 ≈ ambient-journey-4 ≈ critic-8. Params differ:
  - T range: `clamp(1.1+0.45·log2…,1.4,2.4)` vs `(…0.4…,1.3,2.6)`.
  - Anchor: (0.36,0.62) vs (0.42W,0.58H).
  - Clearing method: yaw ±20° probe vs occluder mask + zoom 1.05 fallback vs yaw ±24°/pitch-step ray.
- CONFLICT: critic-8 step 3 (clamp focus band) and art-director-1 step 4 (bough soft in tilt-shift band) both assume tilt-shift. camera-2 deletes it, and critic endorses the deletion.

**Camera breath.** camera-D3, ambient-journey-2, ambient-journey-D1, ambient-journey reversal 1, the camera subtraction on binary suppression.
- NEAR-DUP fix, with differences:
  - Easing: camera τ out 0.5 / in 5 s vs AJ τ 0.5 / 12 s smootherstep after 45 s idle, with reduced amplitudes.
  - CONFLICT on postcard holds: camera wants weight 0.5; AJ wants w=0 during tours.

**Arrival / loading / first sentence.** chrome-1, chrome-D1, ambient-journey-1, ambient-journey-D2/D3/D4, camera-6, chrome reversal 1, ambient-journey reversal 2, the ambient-journey veil/label subtractions.
- NEAR-DUP: chrome-D1 ≈ ambient-journey-D2 (stale noon JPEG).
- NEAR-DUP: "loading text into the caption slot" appears in both chrome-1 and ambient-journey-1.
- CONFLICT on method:
  - chrome-1 keeps hour-matched stills registered to the *old* −72/+48/×0.82 start pose, with a 1.4 s dissolve.
  - ambient-journey-1 drops the still for an inline gradient plus height-fog mist lift, with a new start pose (offsetY −28, ×0.95, 7 s).
  - camera-6 does an eye rise plus air-veil uniform over 10 s.

**Caption / now-line / onboarding / return.** chrome-2, chrome-4, chrome-D6, ambient-journey-D5, ambient-journey-3 (Stay caption), ambient-journey-6, data-poetry-5, chrome reversal 2.
- NEAR-DUP: ambient-journey-D5 ≈ chrome-2 cadence (400/600 ms vs 800/1000 ms).
- ambient-journey-6 (caption sentence) and data-poetry-5 (wrack line) are the DOM and world halves of the same return-visit idea.

**Nameplates.** chrome-D3, chrome-5, data-poetry-D6, the data-poetry chip subtraction, art-director-D11, critic-D16, the critic nameplate subtraction, the ambient-journey "stacked announcements" subtraction.
- Same defect in five lanes, with CONFLICTING fixes: restyle as ink label with fade (chrome) vs drop the chip for arrivals (data-poetry) vs ember ink 60 % at night (AD) vs ≥90 s gap + 400 ms fade (critic) vs at most one chip (AJ).

**Chrome material / type / controls.** chrome-3, chrome-6, chrome-7, chrome-8, chrome-D2/D4/D5/D7/D8/D9, sound-2 (shared `.pv-drawer`), data-poetry-4 (card scroll).

**Director, rituals & kindling.** life-1, life-4, life-D1, ambient-journey-5, ambient-journey-D4, sound-4, life reversal 2.
- NEAR-DUP: life-4 ≈ ambient-journey-5 (evening kindling).
- CONFLICT: life has a keeper figure walking the island path; AJ explicitly has no figure and lights lamps outward from the tower.
- Durations disagree: 150 s (life) vs 60 s priority 50 (AJ) vs keeper beat 180 s (sound-4).
- Director init: AJ-D4 (90 s initial silence) complements life-1 (attract yields).

**Crown "birds" (disputed source).** life-D3, art-director-D6, the art-director smoke subtraction, critic-D6, critic-3 step 4, the critic geese subtraction.
- CONFLICT on attribution:
  - life and AD attribute the blue-grey marks at the statue to beacon daymark smoke (`garden-beacon-fire.ts:31-35,133`).
  - critic attributes them to mis-anchored autumn geese billboards (`garden-sky-billboards.ts:115-123`).
- Both may contribute. A draw census or A/B is needed before choosing the fix.

**Birds, heron, fauna.** life-2, life-3, life-7, life-8, life-D4/D5/D7, ambient-journey-7 (perched gulls in reduced motion), ambient-journey-D6, sound-5, data-poetry-3 (heron on the flat), life reversals 1 and 3.
- CONFLICT: life-2 (heron station) and life-7 (fireflies) anchor on the reed-lily sea-edge sites. critic-D4, critic-2 and the critic subtraction delete or re-seat those open-water reeds. AD also subtracts "golden stick reeds in open water".
- CONFLICT: data-poetry-3 wants the heron on the tidal flat.
- life-8 (seasonal skein) and critic-D6 (geese billboards) both touch geese.

**Calendar / seasons.** life-5, life-7, life-8, sound-5 (insects via `seasonFromDate`), sound-3 (tacet hours), life reversal 4.

**Night light & beacon.** critic-1, critic-D7, art-director-5, art-director-D5, ambient-journey-5 (beacon kindling), sound-1 (beacon pass), AD hero moment 2.
- NEAR-DUP: critic-D7 ≈ art-director-D5 (smudge disc).
- CONFLICT on the fix:
  - End-on: critic dissolves into the halo (`smoothstep(0.92,0.6,uScatter)`, halo 1.25/0.3); AD adds a lantern-glass flare plus a 4-point star.
  - Cone feather: critic fades 0.78→1.0; AD uses cross `pow(1−across,2.5)`.

**Moon road / night water bands.** critic-D2 (moon band), critic-1 step 1, critic reversal 3, art-director-D9 (pale bands, [INFERENCE] beam road), AD hero moment 2 "Moon road".
- NEAR-DUP defect: AD-D9 bands ≈ critic-D2 moon band. Same regions (0–560,740–790 / 1100–1568,640–700); the lanes attribute different sources.
- AD hero moment 2 still wants "one silver road". It must come from view-dependent glitter, not the world-fixed band.

**Reflections.** art-director-5, critic-7, art-director-D9, critic-D8.
- NEAR-DUP with CONFLICTING distortion: AD uses x 0.012 / y 0.003 plus vertical 4-tap averaging; critic uses x 0.004 / y 0.018 plus horizontal gaps and clamp 0.6. Both overlap water-2.

**Water surface / inlet / calm.**
- IDs: art-director-6, art-director-D8, critic-2, critic-D2 (day), critic-D9 (Morse, whiskers), critic reversal 2, ambient-journey-8 (idleDepth), life-6 (rings), AD hero moment 4.
- TENSION: AD calls the foreground approach too busy (mask it to a mirror, normal ×0.18). Critic calls the Calm body too flat (wants 35 % glitter, depth 0.95). The regions differ; reconcile in one water owner.
- NEAR-DUP: AD `ship-wake-detail` subtraction ≈ critic-2 step 3 ≈ critic whisker subtraction (84 draws).

**Air, value, fog & clarity.** art-director-2, art-director-3, art-director-8, art-director-D3/D4, critic-4, critic-D1, critic-D12, data-poetry-1, data-poetry-D2, camera-5 (plate haze), camera-6 (air veil), ambient-journey-1 (arrival mist).
- NEAR-DUP: art-director-D4 ≈ critic-D1 (noon value / white wall).
- CONFLICT:
  - data-poetry-1 makes daytime mist mean "stale" and PSI-drives far clarity, and demands to be the only daytime-mist writer.
  - art-director-3 adds clock-owned kasumi mist bands.
  - critic-4 and art-director-2 re-key fog by clock.
  - ambient-journey-1 adds arrival mist.
- These need one sky/fog owner and a treaty ruling.

**Flags / brand chroma.** art-director-4, art-director-D7, art-director reversal 1, critic-3, critic-D3, critic-D10, critic reversal 1.
- NEAR-DUP: AD-4 ≈ critic-3.
  - Scale: 0.6× ≈ 2.52 vs 2.4.
  - Colour: AD uses a palette dye field with the brand-colour mark; critic uses an OKLCH-clamped brand hue with a white mark.
  - critic-3 also clamps hull trim (D10).

**Flora & shape grammar.** art-director-7, art-director-D12, data-poetry-D4 (lime month-record pads), AD subtractions (rocks, red pole).

**Far fleet.** critic-5, critic-D5, art-director-3 (kasumi floats the far fleet).

**Data encodings at landscape scale.** data-poetry-1..6, data-poetry-D1..D5, data-poetry reversals 1–4, sound-3 (watchful third), sound-6 (stale foghorn).
- CONFLICT: data-poetry-3 (tidal flat) sits west of the island in the reed shallows, the same area as critic-D4 reed removal and the life-2 heron station.
- data-poetry-2 moves the memorial to land, which invalidates camera-4's "Wreck Memorial" water postcard.

**Reduced-motion tableau.** ambient-journey-7, ambient-journey-D6, critic-D15, critic-D6 (frozen geese), life reduced states (life-1/2/4/8), sound-7.
- NEAR-DUP: AJ-7 corner keepout ≈ critic-D15 heap. Both fix reduced-motion ship placement via the anchorage/berth allocator.

**Long-watch modes / attract / postcards.** ambient-journey-3 (Stay), ambient-journey-8, camera-4, life-1 (attract yields), sound-2 lifecycle, sound-7, sound reversal 2.
- ambient-journey-8 changes the breath 9→10 s. That ripples into sound-1/sound-3, which bind to the breath clock.

**Whole-map / diorama edge.** camera-5, camera-D6, critic-D11, critic-D12, art-director-3 (band B hides the plate edge).

**Sound.** sound-1..7, sound-D1..D3, the mix sheet, sound reversals 1–5. The sound lane has no counterpart in the rest of this slice.
- Dependencies: renderer exposes `beamAngle` and lamp-lit count; director beat hooks come from life-1/ambient-journey-5.

**Unpinned / needs census.** critic-D13 (tilt-shift seam), critic-D17 (crumpled sheet).

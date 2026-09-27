# Cinematography — camera

## Verdict
There is no shot yet. The solver keeps the eye inside the harbour ring, 114 u from the tower and 20.6 u up. The tower lands dead-centre: crown x = 0.499, 58 % of frame height, crown 6.9 % from the top at 1600×1000 and 4.1 % at 1200×640 (`noon.png`, `compact-1200x640.png`). At a 4° pitch the frame bottom meets water 28 tiles ahead, so no threshold can exist.

Three things block every attempt to move right of centre: the 45° yaw lock, the reed-boathouse station and its flag on the sight line (`alt-a-noon.png`, `alt-c-noon.png`), and a scoring rule that rewards closeness (`camera.ts:177`).

The leap is a *shot grammar*: authored poses with yaw, eye height and screen-space subject rectangles, driving the rest seat, postcards and selection. Delete the tilt-shift toy lens: it blurs the very ship you select (`selected-ship.png`). `alt-b-golden.png` is already close to the bible's picture.

## What I looked at
- **Baseline frames:** `noon.png`, `golden.png`, `compact-1200x640.png`, `noon-1440p.png`, `wholemap-noon.png`, `wholemap-dusk.png`, `selected-ship.png` (plus crop `outputs/opus-review/camera/selected-ship-crop.png`), `selected-lighthouse.png`. Peer frame: `outputs/opus-review/garden-master/threshold-blue.png`.
- **My captures** (real Chrome/Metal, all tier `full`; I cite draw counts only, never times):
  - `camera/alt-a-noon.png`: `#t=12.25&cam=1145.6,-646.3,0.9`. Eye tile (128,152); crown 0.613/0.142; tower 49 %. 195 draws.
  - `camera/alt-c-noon.png`: `#t=12.25&cam=1134.4,-621.5,0.95`. Eye tile (120,142); crown 0.612/0.099; tower 56.5 %.
  - `camera/alt-b-golden.png`: `#t=17.6&cam=1136,-326.9,0.7`. Eye tile (136,166), outside the plate; crown 0.640/0.129; tower 42 %. 210 draws vs 287 baseline.
  - `camera/postcard-garden-shore-golden.png`: the shipped "Garden Shore" postcard reproduced with `#t=17.6&cam=2144,-1324,1.2`.
  - `camera/zoom-055-noon.png`: `#t=12.25&cam=852.8,-160,0.55`.
  - `camera/breath-noon.png`: 9 frames at 7 s after a 15 s settle, `#t=12.25`.
- **Throwaway geometry scripts** (`outputs/opus-review/camera/*.ts`, run with `tsx` against the real `projection.ts`/`camera.ts`). Rest poses they printed:

  | Gate | Zoom | Crown x/y | Tower span | Eye height | Distance to tower |
  | --- | --- | --- | --- | --- | --- |
  | 1600×1000 | 1.15 | 0.499/0.069 | 58.3 % | 20.6 u | 114 u |
  | 1200×640 | 1.10 | 0.501/0.041 | 57.3 % | — | — |
  | 900×720 | 1.15 | 0.502/0.052 | — | — | — |
  | 2560×1440 | 1.15 | 0.497/0.113 | — | — | — |

  - The bough projects to screen (−1.05, 1.75) × viewport.
  - `station-scan.ts` searched fixed-yaw eyes at zooms 0.7–0.8 and eye tiles (124–150, 150–176). None puts crown x in 0.58–0.66 at ≤47 % span with the `watch-south-reed` flag out of frame; the station sits on the eye→tower line throughout.
- **Code read:**
  - `src/systems/camera.ts` (all).
  - `src/systems/projection.ts:1-366`.
  - `src/hooks/camera-intent.ts:13-179`.
  - `src/hooks/use-canvas-resize-and-camera.ts:358-387, 699-770, 911-938`.
  - `src/hooks/use-world-render-loop.ts:74-76, 499-533, 773-784, 1077-1080`.
  - `src/three/world-renderer.ts:1468, 5064-5071`.
  - `src/three/garden-post.ts:554-764, 1740-1743, 1822-1836, 2073-2079`.
  - `src/three/garden-rim-mesh.ts:892-986`.
  - `src/systems/garden-attract.ts`, `observe-tour.ts`, `garden-arrival.ts`.
  - `src/pharosville-world.tsx:415-473`.
- **History:** prior lane `camera-composition.md`, decision ledger, plan §D3/W1.2/W1.3/W2.12.

## Spell-breakers (defects)
1. **Selecting a ship blurs and hides the ship.**
   - **Where:** `selected-ship.png` centre. The USDC hull cannot be found (crop): it sits behind rim bamboo and a blob tree, under a heavy veil, while the unselected tower stays sharp.
   - **Cause, part 1:** `selectionCameraTarget` forces zoom ≥ 1.2 (`camera-intent.ts:18,127`), which switches tilt-shift on (`garden-post.ts:638,1740-1743`).
   - **Cause, part 2:** the sharp band is derived as `eyeY/|fwd.y|` (`garden-post.ts:1830-1836`). At the 4° pitch that is ≈290 u, a band of ~199–381 u. Everything nearer than ~124 u gets full CoC, including the selected ship at ~91 u.
   - **Cause, part 3:** the W4.6 seam `setFocusBandDistance` has no caller outside tests (`garden-post.ts:2077`).
   - **Cause, part 4:** fixed-yaw centring puts the eye ~45 tiles behind rim berths, looking at the ship through the rim garden (`camera.ts:294-319`).
   - **Fix:** camera-2 (delete the blur) plus camera-3 (an occlusion-aware shot). **Cost:** S + M.
2. **The rest is a solved inventory view, not a composition.**
   - **What:** the score is `zoom + 0.02·visible − 2·corridor` (`camera.ts:177`), and the aim at x = 0.62 only breaks exact ties (`:179-182`).
   - **Result:** every gate rests on the 1.15 ceiling (`:39`), and the crown sits on the 0.50 edge of its 0.50–0.72 band (`:128`). The tower is 58 % tall, and at compact the crown statue is 26 px from the top edge (`compact-1200x640.png`).
   - **Why it breaks the calm:** a centred hero in a centred frame is a heraldic badge. The lower row of the 3×3 grid is mid-value water and hulls (`noon.png` bottom), so the frame has no floor.
   - **Fix:** camera-1. **Cost:** M.
3. **Camera breath pops on every mouse move.**
   - **What:** suppression is binary (`use-world-render-loop.ts:773-784`). Any `pointermove`, `wheel` or `keydown` (`:1080`), any hover or selection, and every attract frame (`cameraIntentActive`) snaps yaw ±2°, pitch ±1° and dolly ±1.5 % back to zero in one frame. The pose then snaps back to the live sine 2.5 s after input stops.
   - **Size:** ~2° of yaw orbit is ~60 px of far-field shift, and 1° of pitch is ~31 px of horizon at 1600×1000 [INFERENCE from FOV math].
   - **Side effect:** postcards hold dead-still for 3–6 min because the tour always reports `cameraIntentActive` (`use-canvas-resize-and-camera.ts:713,755`). The rest breathes; the "postcards" do not.
   - **Mitigating evidence:** `breath-noon.png` shows the breath itself is well judged: the tower is pinned, and the Ethereum precinct drifts ~45 px over 56 s.
   - **Fix:** ease a `breathWeight` (out τ 0.5 s, in τ 5 s), keep integrating phase while suppressed, allow weight 0.5 during postcard holds, and pass the breathed pose to hit-testing. **Cost:** S.
4. **The bible's pine bough never renders, and it is a floating green lump when it does.**
   - **Where:** it is authored 8 u forward, 12 u left and 6 u below the *1600×1000 rest eye* (`garden-rim-mesh.ts:912-937`).
   - **Evidence:** at rest it projects to (−1.05, 1.75), off-frame at every gate. From any other eye it stands in harbour water at tile (114,136): it is the round green mass at `alt-a-noon.png` (940–1080, 820–980) and `alt-b-golden.png` (950–1150, 720–980), in front of the tower reflection.
   - **Fix:** delete it, and root the threshold pine in rim land at the new seat (GardenMaster gm-1 / garden-1). **Cost:** S.
5. **Postcards frame their subject dead-centre, from outside the world, through the toy lens.**
   - **What:** `observeTourPoseToCamera` centres the subject tile (`observe-tour.ts:210-214`). With yaw locked at 45°, subjects on the south and east rim put the eye outside the plate:
     - Garden Shore: eye ≈ (105,175).
     - Wreck Memorial: eye ≈ (78,172).
     - Storm Passage: eye ≈ (185,113).
   - **Evidence:** `postcard-garden-shore-golden.png` shows the back of the rim bank and the outer sea in heavy blur across the bottom 40 %, the Pharos cut in half by the right edge, and saturated flags on the skyline.
   - **Fix:** camera-4. **Cost:** M.
6. **The diorama edge shows at ordinary zoom-out.**
   - **Where:** `zoom-055-noon.png`: outer ocean in both lower corners, a palm-edged grass slab and two station towers on the near corner. It already reads as a model railway at 0.55, well before the `wholemap-noon.png` slab at 0.28.
   - **Fix:** camera-5. **Cost:** M.
7. **The selection move lurches.**
   - **What:** `dampFollowCamera` is first-order exponential with k = 5, return k = 4 (`camera-intent.ts:15-17,166-179`).
   - **Result:** the first frame covers 8 % of the move (velocity 5·d/s at t = 0), 95 % is done in 0.6 s, and a long creeping tail follows. The panel waits for that tail (`pharosville-world.tsx:441-443`). A cut would be kinder than a whip-pan.
   - **Fix:** camera-3. **Cost:** S.
8. **The bible contradicts itself on the hero's column.**
   - **What:** the prose says "slightly right of centre" (`VISUAL_INVARIANTS.md:6`), but the value table puts "tower 62/57/24" in the *middle-left* cell with the grove (`:27`).
   - **Why it matters:** the solver's 0.50–0.72 band and the art-director and GardenMaster captures all follow the prose.
   - **Fix:** move the tower to middle-right-of-centre in the table and give middle-left to the grove and Mole massing alone. **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### camera-1 ★ Shot grammar: an authored rest seat on the south shore, framed by rules, not by closeness
- **Picture:**
  - You stand in the shade behind the south rim. A dark pine and a mossy bank close the lower-left corner.
  - The open approach runs from your feet across calm water to the Pharos. It stands at 62 % across, 42–46 % of the frame tall, with a full crown-width of sky above it.
  - The Mole and its grove weigh the left third, and borrowed mountains sit in the sky gaps.
  - The frame has a floor, a middle and air, and the eye walks bough → inlet → tower → hills → back down the flotillas.
- **Why:**
  - Today's rest is the corner solution of a zoom-maximiser (Defect 2).
  - At a 4° pitch and 32° vFOV nothing within ~56 u of the eye at water level can enter the frame. The bottom-centre ray meets water at tile (96,106). A threshold therefore needs the eye to *retreat*, not the bough to be re-seated.
  - `alt-b-golden.png` proves the retreat. Eye (136,166) at 42 % gives the best frame I captured: crown air, a borrowed cone right, and the rim path plus pine in the lower-left. It fails only because the reed boathouse and its flag, plus the stray bough, occupy the inlet.
  - `station-scan.ts` shows that at yaw 45° the `watch-south-reed` slot (110,131) is *always* on the sight line. The rest therefore needs either that slot moved (GardenMaster gm-1 path) or an authored rest yaw.
  - **Lens:** a truly long lens is not available on this plate. At 28° the eye must sit ~176 u from the tower to reach a 44 % span, beyond the plate at tile (160,166). Keep vFOV 30–32° and get telephoto *layering* from aerial perspective and shakkei hill scale (Sky lane).
  - **Eye height:** lower it from 20.6 to 14–16 u. Below 14 u distant sails fence up (GardenMaster's note).
- **Impact:** stunning 5, poetic 5, relaxing 4. **Confidence:** H for geometry, M for the final taste until captured.
- **Cost:** M (seat + scoring); M–L if the yaw path is taken. **Perf:**
  - The retreat culls station interiors: 210 draws at `alt-b` vs 287 at `golden.png` (counts, same HUD).
  - Δtris ≈ −30–40k; ΔGPU ≈ 0; Δtextures 0.
- **How:**
  1. **ShotSpec.** Replace `defaultCamera`'s grid search (`camera.ts:52-221`) with a `ShotSpec`: `{ targetTile, distance, yaw, eyeHeight, fovDeg, rects }`. `rects` are screen-space constraints, each checked with `worldToScreen`:
     - `towerFoot.x ∈ [0.58,0.66]`
     - `crown.y ∈ [0.12,0.18]`
     - `span ∈ [0.40,0.47]`
     - `inletCorridor` (the `GARDEN_EMPTY_INLET` polyline) holds no station massing or flag envelope
     - `plateEdgeHidden`: the four frame-corner ground rays hit plate/rim land or the fog wall, never outer ocean
     - `panelSafe`: no subject in x > 0.74, y < 0.33
  2. **Solve** yaw/distance per gate aspect (≥1.8 and <1.8) from one authored seat, around tile (136,164) at yaw 45° once the Polygon and BSC slots move ≥30 tiles (Harbour lane). Otherwise use yaw ≈ 30–35° from about (118,172).
  3. **Objective:** `−4|x−0.62| − 3|crownY−0.15| − 2|span−0.44|`. Zoom is not rewarded.
  4. **Yaw plumbing.** Add optional `yaw` to `IsoCamera` (default `CAMERA_YAW`). Thread it through `cameraBasis(pitch, yaw)`, `perspectiveMatrix`, `screenToGroundRay` (`projection.ts:30-42,124-169`) and `cameraPoseFromIso` (`:102-110`); `world-renderer.ts:5064` already obeys `pose.yaw`. Compute drag pans on the ground plane (`screenToGround` delta), so a rotated rest pans naturally.
  5. **Pitch and lens.** Keep `cameraPitchForZoom` (`projection.ts:24-27`) but let the ShotSpec pitch override it (2.5–3.5° at the seat). Keep vFOV 32° globally; 30° only for the rest ShotSpec, if the Sky lane scales hills.
- **Displaces:** the zoom-maximising solver and its 1.15 ceiling (`camera.ts:37-39,175-188`); the hovering-over-water rest; the invisible bough. ~25 % of hulls leave the rest frame's near field; all remain reachable by zoom and in the ledger.
- **Truth & a11y:**
  - No encoding changes. The top-3 harbours by supply must stay in frame (W1.16 re-verify).
  - Reduced motion shows the same static seat. The keyboard/ledger order is unchanged.
  - Picking is easier (lower zoom, fewer overlaps).
- **Risks:**
  - A yaw ≠ 45° touches everything authored for the NW view: sun/backlight relation (LaneLight reports the noon sun 176° behind the tower from the eye), the moon road, flag facing, and label offsets.
  - Pinned tests: `camera.test.ts`, `garden-horizon.test.ts:48-52`, `garden-sky.test.ts:81-85,396-400`, `garden-rim-mesh.test.ts:425-487`, `garden-fleet-placement.test.ts:177-199`, hit-testing fixtures.
- **Acceptance:**
  - `npm run preview -- --hash "#t=12.25"`, `"#t=17.6"` and `"#t=22"` at 1600×1000, 1200×640 and 900×720.
  - Tower foot x in 0.58–0.66, crown y ≥ 0.12, span 0.40–0.47.
  - No outer-ocean pixel in the bottom 25 %. No station massing or flag inside the inlet corridor.
  - Bottom-left 3×3 cell mean L* ≤ 20 at noon. The inlet survives `--blur-audit`.

### camera-2 ★ No toy lens: delete tilt-shift; depth belongs to air, not blur
- **Picture:** close views and selected ships are crisp, like a woodblock proof. The far water, hills and tower recede through haze and value, the way Hasui's harbours do, and never through a lens effect that turns hulls into toy miniatures.
- **Why:**
  - Tilt-shift is the definitive miniature anti-pattern ("tender diorama", `garden-post.ts:634`). The whole history repeats "toy → craft" (ledger, recurring complaints).
  - `selected-ship.png` and `postcard-garden-shore-golden.png` show it defeating the subject.
  - Its band maths is still written for the retired ortho 30° rake at 179.6 u (`garden-post.ts:561-576`), which is why it now centres ~290 u away (Defect 1).
  - The perspective rig and the sky/fog already provide real aerial perspective. A blur on top is grade repairing geometry, against the bible's "atmosphere before grade".
- **Impact:** stunning 4, relaxing 4. **Confidence:** H.
- **Cost:** S. **Perf:**
  - Δdraws −2 (half-res blur chain) whenever zoom ≥ 1.2.
  - Δtextures −2 half-float targets [INFERENCE: allocated at construction, `garden-post.ts:717-726`].
  - ΔGPU ≈ −0.1–0.2 ms @1x when active [INFERENCE], ~4× at DPR 2.
- **How:**
  - Remove `GardenTiltShiftEffect`, `DOF_*` (`garden-post.ts:589-638,640-770`), `setFocusBandDistance`/`focusBandOverride` (`:1259,1706,2077`), the tilt-shift branch in the idle profile (`:1740-1743`) and the `setCameraZoom` plumbing if nothing else reads it (`world-renderer.ts:1468`).
  - Keep `EffectAttribute.DEPTH` on the fused pass only if Printmaker's keyline adopts it.
- **Displaces:** the blur pass, its two render targets, and the dead W4.6 seam.
- **Truth & a11y:** removes a depth cue that implied "focus = importance" without any data behind it. Nothing changes under reduced motion. Selection emphasis moves to framing (camera-3) and the existing ring/lighting.
- **Risks:** close frames may look hard-edged. Answer with far-field haze density (Sky) and Printmaker's keyline weight falloff, not blur. Tests `garden-post.test.ts:572, 619-622, 863-955, 984-991` are wording/implementation pins: delete them.
- **Acceptance:** `#t=14&sel=ship.usdc-circle` at 1600×1000. The selected hull is fully sharp and unoccluded (with camera-3), and `--blur-audit` reports no depth-band softening at any zoom.

### camera-3 ★ Selection and return as composed shots
- **Picture:**
  - Click a ship. After a breath of stillness, the view glides for about 1.8 s and settles with the hull on the lower-left third, its bow leading into open water and its home harbour beyond.
  - The panel sits in empty sky at the top right. Close it and the camera walks back to the seat along the same curve, slightly slower.
  - Select the lighthouse and the camera does something it has never done: a slow 3 s look-up. Pitch rises 3°, and the lantern gallery settles at 40 % height, left of the panel.
- **Why:**
  - Today's move is centre-the-tile with an exponential whip and a creeping tail (Defect 7). It ignores occluders (Defect 1) and places ships under where the panel will open (`selected-ship.png` panel at x 0.74–0.98, y 0.04–0.32).
  - Lighthouse selection does not move at all (`pharosville-world.tsx:424-427`; `selected-lighthouse.png` is the rest frame).
- **Impact:** stunning 3, relaxing 4, poetic 3. **Confidence:** H.
- **Cost:** M. **Perf:** 0 draws. CPU: one screen-space occlusion probe per selection, run once (<0.1 ms).
- **How:**
  1. **`selectionShot(entity)`** returns a ShotSpec:
     - Subject anchor at (0.36, 0.62) for ships and (0.40, 0.55) for docks.
     - Lead space along `ShipMotionSample.velocity` (flip the thirds point if the heading points left).
     - Distance chosen so the hull spans 9–12 % of the frame height, instead of the hard zoom 1.2 (`camera-intent.ts:18`).
     - Yaw may deviate ±20° from the rest yaw to clear the probe.
  2. **Occlusion probe.** Project the rim-land height field and station AABBs along the eye→ship segment. Reject any pose where land or a station covers the hull's screen rect, or where the eye leaves the plate for a rim berth. In that case rotate yaw toward the harbour interior (look outward from the water side).
  3. **Motion.** Replace `dampFollowCamera` for `selection` and `selection-return` with time-based smootherstep:
     - `T = clamp(1.1 + 0.45·log2(1 + d/240 px), 1.4, 2.4)` s; return ×1.25.
     - 120 ms initial hold, so the click registers before motion.
     - Reveal the panel at 70 % progress, not at settle.
  4. **Lighthouse:** a 3 s smootherstep, pitch +3°, dolly −4 %, tower shifted to x 0.40.
- **Displaces:** the exponential lurch; centre framing; the hard selection zoom; the static lighthouse selection.
- **Truth & a11y:** the panel and ledger are unchanged. Reduced motion cuts directly to the composed pose with no glide. Keyboard selection gets the same shot.
- **Risks:** fast-moving ships at the edge of the plate; follow-mode continuity (follow should inherit the thirds anchor, not recentre). Tests: `use-canvas-resize-and-camera.test.ts:181-190,277-300`, `camera.test.ts:173-206` (centre semantics), `garden-observatory-hit-testing.test.ts:303-335`.
- **Acceptance:**
  - `#t=14&sel=ship.usdc-circle` and a rim berth ship at 1600×1000 and 1200×640. The hull is inside rect [0.25–0.47]×[0.52–0.72], unoccluded, sharp and clear of the panel.
  - A motion sheet at 150 ms shows ease-in and ease-out, with no first-frame jump over 1 % of the path.

### camera-4 A postcard book shot from inside the world
- **Picture:** after two idle minutes the harbour shows you six places, each held for minutes and breathing faintly:

  | Postcard | Phase | Starting pose (validate by capture) | Frame |
  | --- | --- | --- | --- |
  | **Crown in Air** | dawn/blue | Eye low over the SE inlet, ~90 u from the tower, 8 u up, yaw ≈ 40°, vFOV 32° | Crown at (0.64, 0.15), foot at 0.94. Left 55 % is pure sky: a portrait of the lantern in first light. |
  | **Mole at Market** | day | Eye (40,110), 12 u, yaw ≈ 59° | Ethereum Mole on the lower-left third (0.36, 0.58), grove hill behind it. Calm water and sky make up the right half. |
  | **Ledger Fog Hook** | morning | Eye (36,70), 10 u, yaw ≈ 59° | Hatago wharf as a silhouette at (0.66, 0.55). The left half is a fog field. |
  | **Storm Passage** | blue | Eye (104,66) inside the ring, 10 u, yaw ≈ −75° (looking east) | The gorge mouth is a slot of open sea at x ≈ 0.58, cliffs as dark masses on both sides, sky above. |
  | **Engawa Lanterns** | golden→blue | Eye (70,106) low over the calm anchorage, 6 u, yaw ≈ 157° (looking south, back at the shore) | Tea-house quay at (0.38, 0.50) with warm windows. The bottom 45 % is its reflection in calm water. |
  | **Wreck Memorial** | night | Eye (52,104), 8 u, yaw ≈ 135° | Half-sunk hulls and steles on the lower-right third (0.64, 0.66). The beacon sweep crosses the dark water on the left half. |

- **Why:**
  - Defect 5. The fixed yaw forces every south/east subject to be seen from outside the world.
  - Subjects are centred. Tilt-shift is on (zoom ≥ 1.2 for Garden Shore at 1.2, `garden-attract.ts:27`).
  - Holds are good in length (180–360 s, `garden-attract.ts:34`) but dead-still (Defect 3).
- **Impact:** poetic 5, stunning 4, relaxing 4. **Confidence:** M.
- **Cost:** M, after the camera-1 yaw plumbing. **Perf:** 0 draws; each postcard culls to its own frustum.
- **How:**
  1. `gardenAttractKeyframes` returns ShotSpecs (subject tile, anchor, yaw, eyeHeight, rects) instead of centre iso points (`garden-attract.ts:22-29`).
  2. The tour interpolates yaw along the shortest arc. Travel legs keep smootherstep (`observe-tour.ts:229-230`) but move eye and yaw together, with yaw ≤ 12°/s.
  3. Every ShotSpec must pass `plateEdgeHidden` and `subjectUnoccluded` at both gates.
  4. Breath runs at weight 0.5 during holds.
  5. Phase preference picks the *next* card nearest the wall-clock phase and never alters light.
- **Displaces:** the six centre-tile keyframes; the outside-the-world views; tilt-shift in postcards.
- **Truth & a11y:** decorative. Attract stays off under reduced motion, selection, dialogs and hidden tabs (existing gates). Captions, if any, stay in the DOM.
- **Risks:** yaw travel can read as orbiting. Mitigate with no yaw change over 35° per leg, and route legs through the harbour interior. Tests: `garden-attract.test.ts` (determinism/zoom pins), `use-canvas-resize-and-camera.test.ts:85-95`.
- **Acceptance:** capture each card with its ShotSpec at 1600×1000 and 1200×640. The subject is inside its rect, there is no plate edge, no subject is centred (|x − 0.5| ≥ 0.1), and the named negative space holds ≤ 2 hulls.

### camera-5 Whole-map as a kasumi chart, not a slab on the sea
- **Picture:** zoom out past the harbour and the view tilts up into a bird's-eye chart, like an ezu scroll map. The plate's edges dissolve into bands of mist the colour of the sky. The world floats in haze rather than sitting on a table, and the harbour ring reads as a plan you can learn.
- **Why:**
  - `wholemap-noon.png` and `wholemap-dusk.png` show a diamond slab with a cliff edge on an open ocean, seen at a 12° pitch (`projection.ts:14-17`). That is the exact camera angle of a tabletop model.
  - `zoom-055-noon.png` shows the slab edge from 0.55. The prior camera lane already called this "debug atlas".
  - A map needs a steeper look, and an edge needs to disappear, not be decorated.
- **Impact:** stunning 3, relaxing 3, poetic 4. **Confidence:** M.
- **Cost:** M. **Perf:** 0 draws camera-side. The haze is a term in the existing fog (Sky lane), ≈0 ms. The overview LOD is unchanged.
- **How:**
  1. Compute `edgeHiddenZoom(viewport)`: the smallest zoom at the rest yaw whose bottom-corner ground rays still land on the plate. Between it and `minZoomForViewport` (`projection.ts:343-351`), ease pitch from the seat's 3° to 38°.
  2. Replace `cameraPitchForZoom`'s 12°→4° ramp (`:24-27`) with a two-segment curve: 38° at the min zoom, 12° at 0.55, rest pitch at ≥ 0.9.
  3. Ask Sky for a plate-distance haze: `fog += smoothstep(0, 30 u, distanceOutsidePlate)` in the sky colour, horizontal banding optional.
- **Displaces:** the ocean-slab read; the whole-map as a scenic claim.
- **Truth & a11y:** the chart view is navigation only. The DOM ledger remains canonical for topology. Reduced motion jumps between zoom rungs without pitch animation.
- **Risks:** the pitch change alters shadow and fog frustum fits (W1.1 notes). Tests: `garden-horizon.test.ts`, `garden-sky.test.ts` pitch-by-zoom pins, the whole-map draw census arm (`TESTING.md:383`, textures at 72/72: this idea adds none).
- **Acceptance:** `#t=12.25&cam=0,0,0.28` and `#t=17.8&cam=0,0,0.28` at 1600×1000. No hard plate edge or outer-ocean horizon; the harbour ring is readable top-down. At 0.55, no outer ocean in the bottom 25 %.

### camera-6 Arrival: the air clears, it does not slide
- **Picture:** the page opens at the rest seat, a little lower and looking level into pale air. Over 10 s the eye rises 3 u, the pitch settles, and the air thins from a veil to the hour's true haze. The tower emerges without anything sliding sideways.
- **Why:** today's arrival is a pose-space slide of −72/+48 px plus a 0.82 zoom with a quintic ease-out (`garden-arrival.ts` `gardenArrivalCamera`/`sampleGardenArrivalCamera`). It feels like a map panning into place, and it can fight resize (prior lane defect).
- **Impact:** poetic 4, relaxing 3. **Confidence:** M.
- **Cost:** S–M. **Perf:** 0.
- **How:**
  - Sample the ShotSpec with `eyeHeight − 3 → eyeHeight`, `pitch −1° → rest` and smootherstep over 10 s.
  - The veil is a global *air* haze multiplier (Sky uniform) easing 1.8 → 1.0 over the first 6 s. It is never sea-level fog, because low fog means stale sources (bible).
  - Rebuild endpoints from the ShotSpec on resize.
- **Displaces:** the lateral slide and zoom pull.
- **Truth & a11y:** the veil must not read as a staleness or weather claim: air only, above sea fog height, and done within 6 s. Reduced motion shows the static final pose with no veil.
- **Risks:** confusion with the stale-fog semantics. If the Sky lane cannot separate air veil from sea fog, drop the veil and keep the rise.
- **Acceptance:** a motion sheet at 1 s over 12 s from a fresh load at `#t=12.25`. There is no horizontal translation above 1 % of the frame width, and the final frame is identical to the rest capture.

## Subtractions
- **Tilt-shift pass and all DOF constants** (`garden-post.ts:554-770, 1706, 1740-1743, 1830-1836, 2077-2079`), including the stale ortho-rake essay at `:561-576`.
- **The eye-relative foreground bough** (`garden-rim-mesh.ts:912-986`): invisible at rest, a green lump in the harbour otherwise.
- **The `+zoom` reward in the rest score** (`camera.ts:177`) and `GARDEN_REST_ZOOM_CEILING`'s justification "below the tilt-shift regime" (`:38-39`).
- **Binary breath suppression** (`use-world-render-loop.ts:778-784`). Replace it with an eased weight; do not add a new motion.
- **The hard selection zoom** `SELECTION_CAMERA_ZOOM = 1.2` (`camera-intent.ts:18`) and the exponential selection/return damping (`:15-17`).

## Reversals
1. **Fixed 45° yaw.**
   - **Source:** plan D3 "yaw as today" (`01-implementation-plan.md:57`); `projection.ts:20,30`; "Everything stays inside the fixed-yaw rig" (`observe-tour.ts:34`).
   - **Evidence:** `station-scan.ts` finds no 45° eye with a right-of-centre tower at ≤47 % span that clears `watch-south-reed`. `alt-a`/`alt-c` put the Polygon flag across the frame. `postcard-garden-shore-golden.png` shows fixed yaw forcing south/east postcards to look at the rim's back.
   - **Argument:** authored yaw per *shot* (rest, postcards, selection) is not user orbit, which stays rejected. It is the one knob that lets a finite plate yield more than one composition.
   - **Risk:** lighting relations (LaneLight: the sun is behind the tower at 45°, so a yaw change can *help*), flag and label facing, pan maths, test churn. If the operator keeps 45°, camera-1 still works by moving the two south-rim stations (GardenMaster gm-1).
2. **W2.12 "tilt-shift confined to authored close postcards".**
   - **Source:** `01-implementation-plan.md:159`; `garden-post.ts:637-638`.
   - **Evidence:** `selected-ship.png`, `postcard-garden-shore-golden.png`, and the band maths stranded at ~290 u.
   - **Argument:** once the rig became perspective, there is no frame where a miniature lens helps. Delete it rather than retune it (LaneHeadroom's gather fix becomes moot).
   - **Risk:** close views need other depth cues (haze, keyline weight).
3. **2026-09-06 "rest at harbour view", now enforced as "prefer a closer rest".**
   - **Source:** `camera.ts:175-177`; decision ledger row 24.
   - **Evidence:** every gate pins zoom 1.15 with a centred, 58 % tower.
   - **Argument:** fleet readability is served by zoom and the ledger. The rest must serve the picture.
   - **Risk:** fewer hulls legible at rest. Mitigate by ensuring the top-3 harbours are in frame.
4. **Bible value table** (`VISUAL_INVARIANTS.md:27`): put the tower right of centre, matching the prose (Defect 8).

## Cross-lane dependencies
- **Harbour:** move `watch-south-reed` (Polygon, 110,131) and `calm-engawa-south` (BSC, 60,130) ≥30 tiles along the rim if yaw stays at 45°. Otherwise nothing, but near station flags must clear the camera-1 inlet corridor.
- **GardenMaster / Garden:** camera-1 is the camera half of gm-1 / garden-1. Their rooted threshold pine and raised seat must be solved against the *ShotSpec* (per gate), not `defaultCamera`. Delete the eye-relative bough.
- **Light:** a rest yaw change moves key/fill relations. Choose the yaw together with any sun-azimuth remap, and prefer the key raking across the tower face seen from the seat. The moon road should land in the inlet at night.
- **Sky:** hill scale and placement for shakkei in the sky gaps beside the crown at the seat; plate-distance haze (camera-5); an air-only veil uniform (camera-6).
- **FleetMotion / AmbientJourney:** re-project the empty inlet for the new seat (`garden-fleet-placement.test.ts:177-199`). `breath-noon.png` frames 3–4 show a large junk crossing the approach. Attract phase-picking lives in the postcard book (camera-4).
- **Chrome:** the panel rect (x 0.74–0.98, y 0.04–0.32 at 1600×1000) is a camera constraint. Tell me if it moves.
- **Printmaker:** if the keyline effect lands, it inherits the depth attribute that tilt-shift currently forces.
- **Headroom:** camera-2 frees 2 draws and 2 half-float render targets. The camera-1 retreat reduces rest draws (210 vs 287 counted at `alt-b`). Camera ideas add no textures or vertex attributes.

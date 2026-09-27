# A garden master's reading of the whole — garden-master

## Verdict
Today this is not a garden. It is a harbour diorama seen from a drone, with garden props scattered over it. Every rest beat (`noon.png`, `dawn.png`, `golden.png`, `blue.png`, `night.png`, `deep-night.png`, `compact-1200x640.png`) is the same shot:
- The eye hovers 20.6 u up.
- The tower is dead centre (x = 0.50) and fills 58 % of the frame height.
- The bottom row is bright water full of hulls.

The garden the code already authored sits about 27 tiles outside the frustum: the engawa, the tōrō and the 14 u hero pine. My `threshold-blue.png` shows them in frame, and it is the calmest, most garden-like frame of the whole set.

The leap has three parts, in this order:
1. **Seat the viewer on the veranda.** Use Shūgaku-in's raised seat and Entsū-ji's framed view.
2. **Keep the approach water empty while the world moves.** This is ma.
3. **Let the threshold tell the hour and the season.**

Then subtract: the reeds in the ma, the palm-reading bamboo, the parasol pines, the two torii, the gilt glow and the birds at the crown.

## What I looked at
- **Baseline frames (all 15):** `outputs/opus-review/{dawn,morning,noon,golden,blue,night,deep-night,wholemap-noon,wholemap-dusk,selected-ship,selected-lighthouse,reduced-noon,sea-sign-hover,noon-1440p,compact-1200x640}.png`. I also read `noon-1440p.txt` and `reduced-noon.txt`.
- **My captures:** in `outputs/opus-review/garden-master/`. Draw counts are cited only as counts; no frame times are quoted.
  - `threshold-noon.png`: `#t=12.25&cam=1232,-695.2,0.9`, tier full, 202 scene draws / 351k tris. The baseline rest is 283 / 380k.
  - `threshold-blue.png`: `#t=18.8&cam=1404.8,-695.2,0.9`, tier full, 208 draws.
  - `rest-noon-motion.png`: 6 frames at 4 s, `#t=12.25`. It printed tier `interaction`. The retry crashed mid-run, so the sheet is used **for composition only**.
  - `island-golden.png`: `#t=17.6&cam=953.6,-1471.2,1.6`. It printed tier `recovery` after one timeout, so it is used **for geometry and composition only**, not for lighting or material.
- **Pose maths:** I ran a throwaway script (`/tmp/gm-cam*.ts`) through `defaultCamera`, `cameraPoseFromIso` and `worldToScreen`. The rest pose is `{offsetX 984, offsetY −1008.5, zoom 1.15}`. The eye is at world (175.7, 20.6, 189.9), which is tile (124.3, 134.3), with a 4° pitch.
- **Code read:**
  - `src/systems/camera.ts:37-39, 52-221`, especially the scoring at 128, 177 and 179.
  - `src/systems/projection.ts:4-27, 70-110, 202, 315`.
  - `src/three/garden-rim-mesh.ts:100-143, 636-691, 898-986, 1076-1104, 1113-1170`.
  - `src/three/garden-flora.ts:9-113`, `src/three/garden-precinct.ts`.
  - `src/three/garden-island.ts:1703-1738` (landing torii) and `src/three/garden-torii.ts`.
  - `src/systems/garden-fleet-placement.ts:104-135, 279, 553, 591`, and a grep showing `motion-planning.ts` has no inlet consumer.
  - `src/systems/garden-sea-edge-sites.ts:133-138`, `src/systems/garden-rim.ts:136-138`, `src/systems/world-layout.ts:101-132`.
  - `src/systems/season.ts`, `src/three/garden-day-cycle.ts:372-379`, `src/components/harbor-label-chips.tsx:31-64`.
- **History:** `PRODUCT.md`, `VISUAL_INVARIANTS.md`, `agents/pharosville-reborn/reviews/astra-garden-director.md`, `decision-ledger.md`, and `01-implementation-plan.md` §0–2, W1 and §6–7.

## Spell-breakers (defects)

1. **There is no threshold. The viewer hovers, and the tower is a centred billboard.**
   - **Where:** every rest frame. In `noon.png` the tower runs from crown y ≈ 0.07 to foot y ≈ 0.65, which is 58 % of the height, at x = 0.50. The bottom row is teal water and hulls at roughly grey 45; the bible plans 15/38/23 (`VISUAL_INVARIANTS.md:28`).
   - **Cause:** the solver's score is `zoom + 0.02·visible − 2·corridor` (`camera.ts:177`), so it maximises zoom and pins the rest at `GARDEN_REST_ZOOM_CEILING` 1.15 (`camera.ts:39`). The 0.62 aim is only a tiebreak (`camera.ts:179`), so the tower lands on the floor of the band `interval(tx, 0.50, 0.72)` (`camera.ts:128`).
   - **The garden is out of frame:** the engawa deck, tōrō and hero pine (`garden-rim-mesh.ts:126-143, 673, 1076-1104`, tiles 76–95 × 134) project to x ≈ −0.55. They are left of and below the frustum.
   - **The bough is invisible [INFERENCE from pose geometry, plus its absence in `noon.png`, `noon-1440p.png` and `compact-1200x640.png`].** The "clipped pine bough across the near corner" (`VISUAL_INVARIANTS.md:13`) is authored 8 u forward and 12 u left of the eye, with its crest 6 u below eye height (`garden-rim-mesh.ts:919-937`). That is about 56° off-axis against a 24.6° horizontal half-FOV, and about 37° below the axis. The lower-left corner holds a cut Tether hull instead.
   - **Why it breaks the calm:** you are placed above the picture, not in front of it. Nothing near you is dark or still, so the eye has no resting plane.
   - **Fix:** idea gm-1. **Cost:** L.

2. **The ma fills up whenever anything moves.**
   - **Where:** `reduced-noon.png` shows the intended picture: two unequal flotillas and an empty approach. `noon.png` has an orange barge at (960–1180, 815–890) and six hulls ringing the island foot (760–1280, 700–800). In all six frames of `rest-noon-motion.png`, five or more hulls sit in the lower-centre.
   - **Cause:** `GARDEN_EMPTY_INLET` is honoured only by berth placement (`garden-fleet-placement.ts:279, 553, 591`). `motion-planning.ts` has no consumer of it, so transit crosses the approach.
   - **Reeds in the ma:** the only static objects in the ma are three reed tufts in a column (`garden-sea-edge-sites.ts:136-138`, tiles (75, 97/101/107)). They sit well inside the 21-tile inlet half-width around the spine (72,112)→(63,86), and show as bright yellow-green in `noon.png` (255–490, 740–850).
   - **Fix:** idea gm-2. **Cost:** M.

3. **The shore reads as a tropical atoll.**
   - **Bamboo:** each clump is 7 thin culms, each with a tuft pad at 0.78 h (`garden-flora.ts:107-113`). The headland groves read as coconut palms (`noon.png` left rock 160–380 × 405–470). `wholemap-noon.png` shows a palm ring round the whole plate.
   - **Pines:** 4 tapered cone pads, `CylinderGeometry(0.36, 1, …)` (`garden-flora.ts:62-64, 93-98`). They read as parasols up close (`threshold-noon.png` 190–470 × 580–890) and as stacked umbrellas on the island (`island-golden.png` 440–640 × 610–830).
   - **Maples:** momiji are lobed discs, and in autumn they are dyed vermillion. They read as coral-red mushrooms (`selected-ship.png` 1060–1560 × 640–780).
   - **Why it matters:** a Japanese landscape cannot survive this; it becomes a different climate.
   - **Fix:** idea gm-4. **Cost:** M.

4. **A "transient" nameplate never leaves.**
   - **Where:** "OpenDollar USDO · Calm" sits at the same screen spot (≈ 430–575, 575) in `dawn.png`, `morning.png`, `golden.png`, `blue.png`, `night.png`, `deep-night.png` and `sea-sign-hover.png`, and in `threshold-blue.png` (750–890, 560).
   - **Cause:** `harbor-label-chips.tsx:31, 50` shows arrival/departure captions only during an arrival beat. This one looks like a stuck arrival beat [INFERENCE; root cause not traced].
   - **Why it matters:** it is the only text in the world at rest, which breaks "no board at rest".
   - **Fix:** audit the arrival-beat lifecycle and add a hard timeout of ≤ 20 s. **Cost:** S.

5. **Birds are parked on the hero's crown.**
   - **Where:** a dark grey flock touches the statue and lantern in `noon.png` (835–885, 55–105) and `morning.png`/`sea-sign-hover.png` (795–830, 105–135). In `reduced-noon.png` (820–870, 75–120) it is frozen mid-flap as smudges.
   - **Why it matters:** the single most important silhouette gets stained.
   - **Fix:** keep birds out of a ≥ 60 px screen disc around the crown, and perch them under reduced motion. **Cost:** S.

6. **The night beam turns into a smudge.**
   - **Where:** the beacon sweep foreshortens into a grey disc beside the lantern in `night.png` (690–745, 215–290) and `deep-night.png` (820–895, 205–290). Two pale floodlit stripes cross the water (`night.png` 70–560 × 740–800 and 1090–1568 × 640–700), brighter than any moon road.
   - **Why it matters:** the night is no longer "one light, then embers".
   - **Fix:** fade the beam as it points toward the camera; this is the atmosphere/water lanes' work. **Cost:** S–M.

7. **The gilt god glows at noon.**
   - **Where:** statue emissive is `0.22 + dusk·0.94 + night·0.12` (`garden-day-cycle.ts:376`). At noon it is the highest-chroma warm accent (`noon.png` 775–795 × 70–110), and at night it is a lit figure floating above the beacon (`night.png`).
   - **Fix:** idea gm-5. **Cost:** S.

8. **Two white hot-spots sit at the island foot.**
   - **Where:** `threshold-blue.png` (1245–1345, 650–668). They are brighter than the lantern windows, against "nothing competes with the tower by glowing harder". Seen in my capture only, so the owner is unconfirmed.
   - **Fix:** clamp them to ember level. **Cost:** S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### garden-master-1 ★ The engawa seat: the rest shot becomes the view from the veranda
- **Picture:** You open the page and you are sitting. A dark cedar floor edge runs across the bottom of the frame, and one old pine leans in from the left over the lower third. Beyond it the approach water lies wide and empty. The Pharos stands in the right third at about a third of the frame's height, with its crown in open sky and the borrowed cone mountain beside it. The harbour becomes something you look out at, the way Shūgaku-in's Rin'un-tei looks down over Yokuryū-chi, or Entsū-ji frames Mt Hiei through its hedge and cedars.
- **Why:**
  - Spell-breaker 1: the solver picks the closest zoom rather than a composition (`camera.ts:177-188`). That contradicts the plan's own W1.2 ("authored rest shot … tower at ~62 % x").
  - The inlet was authored from the engawa's direction: its spine starts at (72,112) (`garden-fleet-placement.ts:113-118`). The camera was simply never put there.
  - `threshold-blue.png` is the evidence: tower at x ≈ 0.75, its reflection lying in dark water, the engawa diagonal and pine silhouette as the near plane, and mountains in the sky gap. It is the only frame in the set that reads as a garden.
- **Impact:** stunning 5 / poetic 5 / relaxing 5. **Confidence:** H for the framing; M for clearing the flanking stations.
- **Cost:** L.
- **Perf:** −60 to −80 draws and −25k to −30k tris, observed: 202 against 283 scene draws, 352k against 380k tris. 0 textures. At 120 Hz the draw saving is real CPU relief: about 11 µs per draw, so roughly −0.8 ms CPU [INFERENCE from LaneHeadroom's figure].
- **How:**
  1. **Author the pose; don't search for it.** Replace the score so aim dominates, with zoom only a tiebreak: `score = −(|tx−0.66| + |ty_crown−0.21|) + 0.1·zoom`.
     - Add constraints: tower height ≤ 0.38 H; crown y ∈ [0.18, 0.24].
     - The engawa deck edge must project into the bottom band, y ∈ [0.86, 1.0].
     - The hero-pine crown (tile 86,134, `GARDEN_ENGAWA_PINE_HEIGHT` 14) must land at x ∈ [0.08, 0.35].
     - The starting point measured at 1600×1000 is target tile ≈ (62–64, 102–104) at zoom 0.88–0.92.
     - Solve the 1200×640 and 900×720 profiles against the same subject rectangles.
  2. **Raise the seat (Rin'un-tei).** In `rimHeight` (`garden-rim-mesh.ts` ~377), add a smooth tsukiyama pocket, radius about 10 tiles around (86,134), rising to 6–8 u, with a moss slope to the water.
     - The eye at this zoom is about 14–18 u. The deck would then sit 6–8 u below it, which reads as a raised veranda.
     - The harbour stays legible from height, and the fleet does not collapse into a picket fence.
  3. **Clear the flanks.** Two station slots flank the seat: `watch-south-reed` (Polygon, 110,131) and `calm-engawa-south` (BSC tea-house, 60,130) (`garden-rim.ts:137-138`).
     - In `threshold-noon.png`, Polygon's yellow-domed tower and purple flag stand in front of the tower base. In `threshold-blue.png`, BSC's lit moon-window and flags crowd the left.
     - Move both at least 30 tiles along the rim. Both are behind today's rest camera, so no harbour leaves the rest frame. The Ethereum Mole stays in frame in both of my captures.
     - Raise the station exclusion at `camera.ts:113` from 14 to 24 tiles, and reject projected station *massing* in the lower 45 % of the frame, not only flag tips (`camera.ts:138-158`).
  4. **Delete the invisible bough** (`garden-rim-mesh.ts:898-986`). The engawa pine takes over its role, and it needs gm-4's pad geometry.
  5. **Align the borrowed cone.** Use the fixed-yaw target choice to put the tallest far cone (`garden-horizon.ts`) in the sky gap beside the tower.
- **Displaces:** the hovering rest; the invisible bough; about 80 draws; two south-rim station positions.
- **Truth & a11y:** there is no analytic encoding. The fleet stays whole, and W1.16's top-3 harbours by supply share must be re-verified in frame. Picking tolerance at zoom 0.9 is easier than at 1.15. Under reduced motion the pose is identical and static. The ledger and keyboard order are unchanged.
- **Risks:**
  - **Pinned tests:** `camera.test.ts`, `garden-rim-mesh.test.ts:433-487` (foreground masses), `garden-fleet-placement.test.ts:174-199` (projected inlet), `dock-layout`/`chain-docks` slot tests, and attract-mode postcards.
  - **Picket fence:** a lower eye may overlap distant sails, so keep the eye ≥ 14 u.
  - **Near scale:** the near rim must be crafted, or the foreground exposes its low poly.
- **Acceptance:** capture `#t=12.25`, `#t=18.8` and `#t=22` at 1600×1000, 1200×640 and 900×720.
  - Bottom band is dark timber and moss (grey ≤ 20 at noon).
  - Tower foot x ∈ [0.62, 0.70], height ≤ 0.38 H.
  - No station mass in the lower 45 %.
  - `--blur-audit` keeps the approach as one calm region.

### garden-master-2 ★ Ma that survives motion: the approach is untouched water
- **Picture:** The wide water between you and the island stays empty, like raked gravel. Boats move along the far anchorages and behind the island. About every ten minutes one arriving ship crosses the open water to its berth. Because nothing else does, you watch it all the way in.
- **Why:** spell-breaker 2. Placement already authors the inlet, but motion ignores it. `reduced-noon.png` against `noon.png` is the before/after this idea would produce. The reeds (`garden-sea-edge-sites.ts:136-138`) are the only permanent objects in the ma.
- **Impact:** relaxing 5 / stunning 4. **Confidence:** H for the diagnosis; M for routing side-effects.
- **Cost:** M. **Perf:** 0 draws, tris or textures. The CPU cost is one static cost field baked at graph build.
- **How:**
  - **Route cost:** add an inlet cost term to the water-graph cost used by the A* in `motion-planning.ts` (the route builder around :950-990). Use cost ×8 within `halfWidth`, and impassable within `halfWidth − 6`, except for the holder of a single crossing token.
  - **Crossing token:** at most one hull inside the projected inlet at a time, and only as an arrival or departure beat, with ≥ 6 min between crossings (bible, Motion).
  - **Endpoints inside the inlet:** exit by the shortest path.
  - **Reeds:** delete the three calm reed banks, or move them to the Calm shore at least `halfWidth` from the spine.
- **Displaces:** transit through the approach, three reed tufts, and a large share of concurrent motion.
- **Truth & a11y:** berths, risk zones and counts are unchanged, since transit is animation and not truth. Reduced motion is already berth-static. The DOM is unchanged.
- **Risks:** hulls may queue along the inlet border and form a new visible wall, so spread waypoints. Route-link and motion tests will move. The south-rim harbours need an exit.
- **Acceptance:** `motion-sheet.mjs --hash "#t=12.25" --frames 9 --interval 4000` at the rest pose: ≤ 1 hull inside the projected inlet polygon in every frame.

### garden-master-3 ★ The threshold keeps the hour and the season
- **Picture:** The pine's shadow lies across the veranda boards and slides through the afternoon; at golden hour it stretches long over the moss. At blue hour the one stone lantern on the engawa is kindled. That is the day's event, and its ember doubles in the water below. This week, the equinox (Higan), a small drift of red higanbana stands by the step. In late November one maple reddens; in early April one cherry opens.
- **Why:**
  - **Time is told only by grade.** `golden.png` is a single orange wash over an unchanged composition, and `morning.png` and `noon.png` are the same picture. A Japanese garden tells time on a surface near the viewer (shadow, the moon platform at Katsura) and with one seasonal note (ichirin).
  - **The season model spends the anchor.** `seasonFromDate` uses meteorological quarters (`season.ts:7-15`), so all 40 momiji turn full vermillion on 1 September (`garden-flora.ts:71`, `garden-rim-mesh.ts:1126`). That is two months early for Kyoto, and it spreads the vermillion anchor across 40 crowns.
  - **The lantern already exists.** The tōrō and its reflection lane are in place (`garden-rim-mesh.ts:1094-1104`).
- **Impact:** poetic 5 / relaxing 4. **Confidence:** M.
- **Cost:** M. **Perf:** +1 draw for one instanced seasonal clump (≤ 12 instances × ≤ 60 tris), 0 textures. Shadow cost is unchanged if the engawa lies inside the frustum-fitted shadow camera; verify the near caster margin.
- **How:**
  1. **Shadow:** the engawa boards receive shadow, and the pine and one eave post cast it. The sun arc already moves the shadow; nothing else is added.
  2. **Kindling:** the tōrō fades in over 20 s when sun elevation crosses −2°. It stays the only lit lamp in the lower half of the frame until the harbour lanterns kindle.
  3. **Phenology for flora only.** Add a small date table in `season.ts`, used only by threshold-near specimens:

     | Seasonal note | Dates |
     | --- | --- |
     | Momiji colour ramp | smoothstep 5–25 Nov, on 3–5 specimens |
     | Cherry | 28 Mar – 10 Apr |
     | Higanbana (≤ 12 stems, vermillion) | 18 – 30 Sep |
     | Susuki/hagi clump | Sep – Oct |
     | Winter | bare |
- **Displaces:** vermillion on about 40 crowns; the seasonal petal dressing (`garden-seasonal-dressing.ts`), keeping one or the other; grade as the only clock.
- **Truth & a11y:** decorative and wall-clock only, with no market meaning. The caption could add the season word ("late September · Higan"). Under reduced motion, kindling becomes a state switch, and shadows are already sub-perceptual.
- **Risks:** `garden-flora.test.ts:35-40` season pins; the night-light rule (the tōrō must stay an ember below the beacon).
- **Acceptance:** at the engawa pose, `#t=15` against `#t=17.6` shows the shadow visibly displaced on the boards. `#t=18.8` shows the tōrō lit, with its reflection. A capture with a fixture date of 26 Sep shows only the higanbana as a red note.

### garden-master-4 Plant like a gardener: fewer, placed, cloud-pruned
- **Picture:** The shore stops being a palm-fringed atoll. A few old pines with horizontal cloud-pads lean over the water in groups of three and five. One dark bamboo grove stands behind the Mole. Between them, moss, stone and bare ground breathe.
- **Why:**
  - **A nursery, not a garden.** The rim holds 120 pines, 80 karikomi, 40 momiji, 20 cherry and 35 bamboo: 295 specimens (`garden-rim-mesh.ts:1123-1128`).
  - **Wrong silhouettes.** Spell-breaker 3 covers them: bamboo reads as palms, pines as parasols, maples as mushrooms.
  - **Gardens are made by pruning.** An odd-numbered, unequal few say "garden"; an even scatter says "nursery".
- **Impact:** stunning 4 / poetic 4. **Confidence:** H.
- **Cost:** M. **Perf:** −20k to −40k tris; draws ±0 (same batches, fewer instances); 0 textures.
- **How:**
  - **Pine pads:** replace the tapered cylinders (`garden-flora.ts:62-64`) with flattened, domed ellipsoid clusters, 3–5 per branch, sy/sx ≈ 0.25. Underside vertex colour ×0.55 for self-shade. Silhouette aspect (width/height) ≥ 1.3, with near-horizontal branches.
  - **Bamboo:** one merged grove mass per site: dense culms plus a continuous canopy hull, with no per-culm tuft. Cut 35 clumps to 3 groves.
  - **Counts:**

    | Species | Now | Proposed |
    | --- | --- | --- |
    | Pine | 120 | 45, in odd groups of 3/5/7, plus 3 hero trees |
    | Karikomi | 80 | 40, merged into large ō-karikomi waves |
    | Momiji | 40 | 5 specimens |
    | Cherry | 20 | 3 specimens |

    Place specimens at viewpoints (engawa, Mole, headland tip) through `plantingTiles` clustering.
- **Displaces:** about 180 specimens; the palm read; the coral-mushroom read.
- **Truth & a11y:** none. Reduced motion: sway stays off.
- **Risks:** count pins (`garden-rim-mesh.test.ts:70-76`); dimension pins (`garden-flora.test.ts:18-30`); overview LOD name lists.
- **Acceptance:** in `noon.png`-equivalent and `wholemap-noon` captures, no tuft-on-stick silhouettes, and the rim reads as 3–5 masses in `--blur-audit`.

### garden-master-5 Sabi: let the hero be old
- **Picture:** The Pharos has stood for two thousand years. Rain has drawn dark streaks down from every sill and cornice, and the lowest courses are green-black with salt and algae. Zeus on the crown is verdigris: he catches the evening, but never glows at noon.
- **Why:**
  - **Too new.** The bible asks for "a weathered Pharos". The frames show a cream, pristine, crisply arcaded tower that reads as a new hotel (`noon-1440p.png` centre, `selected-lighthouse.png`).
  - **The gilt is self-lit.** The gilt emissive is 0.22 even at noon (`garden-day-cycle.ts:376`).
- **Impact:** stunning 3 / poetic 4. **Confidence:** M.
- **Cost:** S–M. **Perf:** 0 draws and 0 textures (procedural). About +0.05 ms of fragment work on tower pixels [INFERENCE], roughly ×4 at DPR 2.
- **How:**
  - **Streaks:** in the tower's existing `onBeforeCompile` chain (`applyLighthouseRimLight`, `garden-lighthouse.ts`), add a world-space streak term. It darkens albedo by 0–18 %, using a column hash of `floor(worldXZ·3)` multiplied by an exponential falloff below each cornice band. The shell's tier heights are known.
  - **Base band:** below 3 u, lerp toward `stone_dark`, mixed with a moss green derived from `aurora_green`, weighted to faces away from the average sun.
  - **Statue:** move `GILT` (`garden-lighthouse.ts:85`) toward a verdigris derived from palette tokens. Set emissive to 0 by day and cap the dusk gleam at ≤ 0.4.
- **Displaces:** gilt glow by day; pristine albedo.
- **Truth & a11y:** the tower carries the PSI reading. Weathering must be constant and never keyed to PSI, and the lamp and PSI channel stay untouched.
- **Risks:** statue-gleam tests; the GLB and procedural shell must match.
- **Acceptance:** compare a close crop at `#t=12.25` and `#t=17.6`: streaks read at 1440p, and the statue is not the brightest warm pixel at noon.

### garden-master-6 Stone, water and plant on the headland: Sakuteiki, not a planter
- **Picture:**
  - **Pond:** a pale pebble beach (suhama) curves round one side; rough bank stones hold the other.
  - **Stones:** three are set as a triad, leaning toward the tower.
  - **Path:** it slips behind the pines and reappears at the pavilion.
  - **Headland:** the island stops being a square slab and becomes a headland.
- **Why:**
  - **The pond ring.** In `island-golden.png`, the round pond is ringed by 8 near-identical green pads, evenly spaced (730–960 × 815–835). That is exactly the "evenly spaced ring" the bible bans.
  - **The egg stone.** One upright stone reads as an egg (670–710 × 735–790).
  - **The box plinth.** The precinct sits on a 19.2 × 4.4 × 19.2 box cliff (`garden-precinct.ts:70`) under a 15.4 u square gravel bed (`:73`). In `noon.png` the island base is a cut slab.
- **Impact:** stunning 3 / poetic 4. **Confidence:** M.
- **Cost:** M. **Perf:** +0–1 draw, +3k to +6k tris.
- **How:**
  - **Pond edge:** replace the ring with a suhama strip (instanced flattened pebbles, `stone_pale`) on the lee half and three bank stones on the weather half.
  - **Triad:** a sanzon set on the court's south-west corner, height ratio 1 : 0.6 : 0.4, leaning 8–12° toward the tower.
  - **Cliff:** delete the egg stone. Break the box cliff into 3–5 offset slabs with a moss cap on the camera side.
- **Displaces:** the ring pads, the egg stone, the box edge.
- **Truth & a11y:** none.
- **Risks:** `garden-island.test.ts` drawable and name pins.
- **Acceptance:** an island close-up at `#t=12.25` and `#t=17.6` (tier full): no ring, a legible triad, and the path hidden then revealed.

### garden-master-7 Costume audit: no torii, one red
- **Picture:** Nothing in the frame quotes a shrine. The landing is marked by two unworked stones. In the rest frame, red appears in at most two places: the seasonal note at the threshold and truthful danger water.
- **Why:**
  - **The torii are costume.** A torii marks a Shinto kami precinct. Placing one at a lighthouse to Zeus Soter (`garden-island.ts:1709-1738`) is a category error. A second one stands in the water at the Calm Anchorage (`garden-torii.ts`, `garden-islets.ts:250`), an Itsukushima quotation in a stablecoin harbour, visible in `threshold-blue.png` (740–790 × 580–650).
  - **The anti-reference.** PRODUCT.md rejects "cultural references [as] literal decoration".
  - **Vermillion is diluted.** It is spent on two torii, 40 maples, koi, buoys, the tall red spar left of the island (`noon.png` 225–245 × 595–740, owner unconfirmed) and danger water. Its "chroma primacy" means nothing when it is everywhere.
- **Impact:** poetic 4 / relaxing 3. **Confidence:** H.
- **Cost:** S. **Perf:** −2 draws, about −600 tris.
- **How:**
  - **Landing torii:** replace it with two rough standing stones plus a kutsunugi step stone at the quay-stair head.
  - **Islet torii:** delete it; the islets keep their stones and pines.
  - **Red spar:** identify it. If it is a `warning-buoy` (`garden-sea-edges.ts:427`), keep it only where it marks alert water and never in the approach.
- **Displaces:** two monuments and most of the red.
- **Truth & a11y:** danger-water vermillion stays, as it is semantic and already has DOM parity. The warning buoys, if semantic, stay.
- **Risks:** the gull perch is derived from the torii (`garden-island.ts:1703`, `garden-harbor-life.ts:241`), so re-home it on a stone. Torii tests (`garden-torii.test.ts`, `garden-island.test.ts:430-439`, `world-renderer.test.ts:1151-1180`) change.
- **Acceptance:** rest and threshold frames at noon show no gate. Counting vermillion regions in the rest frame gives ≤ 2 outside danger water.

### garden-master-8 The sound of water (opt-in, muted by default)
- **Picture:** With sound on, you hear water lapping at the stones below the veranda, one timber creak a minute and far-off rigging. There is no music and no shishi-odoshi (that would be costume).
- **Why:** the brief asks for the sound of water, and none exists: there is no AudioContext anywhere in `src`. D11 approved it as Ext (plan §2), and the ledger requires 3–5 days of real tuning.
- **Impact:** relaxing 4. **Confidence:** M.
- **Cost:** L. **Perf:** 0 GPU, ≤ 5 MB, ≤ 3 voices, suspended on hidden tabs.
- **How:** a near-water bed tied to the seat, never to the fleet. Wind and water intensity follow the weather plan only. Market data never makes a sound.
- **Displaces:** nothing visual. It lets the eye rest while the ear holds the time.
- **Truth & a11y:** no meaning. Explicit opt-in toggle; a motion preference does not imply audio consent.
- **Risks:** tuning time and loop audibility.
- **Acceptance:** a 30-min listen with no audible loop seam, and silence in hidden tabs.

## Subtractions
- **Reeds:** the three calm reed banks inside the inlet (`garden-sea-edge-sites.ts:136-138`).
- **Wake hairlines:** the `ship-wake-detail` hairlines, which LaneHeadroom counts as 84 of 279 draws, 1 px GL_LINES. They are white scratches beside every hull (e.g. `noon.png` 1180–1215 × 770–775). Replace them with nothing at rest, and keep a soft wake only on a moving hull. That saves about 84 draws, or ~0.9 ms CPU at ~11 µs per draw [INFERENCE].
- **Bough:** the invisible foreground pine bough mesh (`garden-rim-mesh.ts:898-986`).
- **Torii:** both of them (gm-7).
- **Island clutter:** the egg stone and the ring of pond pads (gm-6).
- **Statue glow:** the gilt statue's daytime emissive (`garden-day-cycle.ts:376`).
- **Birds:** birds over the crown, and birds frozen mid-air under reduced motion.
- **Nameplate:** the stuck USDO chip.
- **Flora counts:** 180 of the 295 rim specimens; 32 of 35 bamboo clumps (gm-4).
- **Maples:** 40 vermillion momiji in September (gm-3).

## Reversals
1. **"Rest at harbour view" (ledger 2026-09-06) as implemented by a zoom-maximising search (`camera.ts:177`).**
   - **Evidence:** the tower is 58 % of the height at x = 0.50 in every beat. `threshold-blue.png` shows the alternative.
   - **Argument:** W1.2 itself asked for an *authored* shot with the tower at about 62 % x. The solver turned "closer is better" into the composition. Reverse it to an authored engawa seat (gm-1).
   - **Risk:** camera, rim and placement tests, attract-mode postcards and station slots.
2. **The landing torii (plan W1.12) and the garden torii (W5.5).**
   - **Evidence:** `island-golden.png`, `threshold-blue.png`, and PRODUCT.md's costume anti-reference. The plan's own §6 rejects "more torii".
   - **Argument:** a gate needs a kami precinct. Stones do the same threshold work without the quotation.
   - **Risk:** the gull perch and tests.
3. **Meteorological seasons for flora (`season.ts:7-15`), and the deferral of microseasons (W4.17).**
   - **Evidence:** 40 red maples on 1 September.
   - **Argument:** keep the season model, but drive threshold flora by a small phenology table. The scope is a few specimens, not a 72-kō system (gm-3).
   - **Risk:** season tests.
4. **The whole-map zoom-out to 0.28 (operator decision).**
   - **Evidence:** `wholemap-noon.png` and `wholemap-dusk.png` show a square plate floating in open ocean with a palm ring. That is the board-game tabletop the plan tried to remove, and it breaks the garden's "world beyond the wall" at any moment the user scrolls.
   - **Argument:** floor the zoom at about 0.5, where the plate's far edges stay behind the borrowed hills, and leave overview to the DOM ledger/Explore.
   - **Risk:** discovery and navigation of remote harbours, and the 0.28 draw-budget tests.
   - Lower confidence; the operator decides.

## Cross-lane dependencies
- **Camera / art director:** gm-1 replaces the rest pose. Any other lane's proposed rest framing must be judged from the engawa seat. LaneArtDirector has been notified.
- **Harbour / fleet (LaneHarbour, notified):**
  - gm-2 inlet routing and the crossing token.
  - Relocating the Polygon and BSC south-rim slots (`garden-rim.ts:137-138`).
  - Re-verifying the W1.16 top-3 harbours at the new pose.
- **Rim / flora:** gm-4 pad geometry is a prerequisite for gm-1. The hero pine becomes the frame's near plane and cannot stay a parasol.
- **Island / tower:** gm-5 and gm-6. Keep the PSI channel untouched.
- **Life (LaneLife):**
  - The crown exclusion disc and perched birds under reduced motion.
  - The one-crossing arrival as the scheduled event.
  - Tōrō kindling as the dusk event, so no second dusk event competes.
- **Atmosphere / water:**
  - The beam-toward-camera fade and the night water stripes (spell-breaker 6).
  - Golden hour is a single orange wash (`golden.png`). It needs the raking value structure the bible promises, which gm-3's shadow on the boards helps show.
  - The shadow-camera near caster margin for the engawa.
- **UI:** the stuck arrival chip (spell-breaker 4).
- **Headroom:**
  - gm-1 and the wake subtraction together free about 150 draws.
  - gm-3 adds 1 draw; gm-5 is procedural, with no texture.
  - No idea here adds a texture.

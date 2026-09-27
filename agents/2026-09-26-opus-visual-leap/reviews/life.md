# Ambient life & the time director — life

## Verdict
Nothing alive in PharosVille reads as a living thing. The most bird-like shapes in the sky are **smoke**: the blue-grey "birds" by the crown in `noon.png` (840–885, 55–100), and again in `dawn.png`, `golden.png` and `blue.png`, are the beacon's daymark plume puffs (`life/noon-crown-birds.png`, all 9 tiles). The real gulls are 1-px hairline chevrons with no wings (`life/noon-gulls-1440-retry.png`). The koi are not in the pond: their position is offset twice (`life/koi-pond-1440.png`, empty over 15 s). There are two herons and the rest camera cannot see either. The keeper walks the far perimeter rim. The director is sound on paper, but attract claims its single environment slot again every frame, so an idle viewer (the relaxing case) almost never gets the keeper, the heron or the almanac. The leap is **fewer creatures, each drawn and timed properly**: one heron with a daily fishing ritual in the reed shallows, a handful of gulls that flap and glide and mostly sit, a keeper kindling lamps on the hero island, and a kō calendar that decides who visits, all admitted as rare foreground gifts with long rests between them.

## What I looked at
- **Baseline frames:** `noon.png`, `dawn.png`, `golden.png`, `blue.png`, `night.png`, `deep-night.png`, `noon-1440p.png`, `selected-lighthouse.png`. Perf: `night.txt` (60 fps vsync-bound, p50 16.7 ms, 287 calls; its per-pass GPU line is not additive on ANGLE Metal, per LaneHeadroom, so I budget in draws, tris and textures, and every ms figure below is [INFERENCE]).
- **My captures (`outputs/opus-review/life/`):**
  - `noon-crown-birds.png`: 9×700 ms, crown sky, tier interaction (arrival glide). Shows the plume puffs.
  - `koi-pond-1440.png`: 6×3 s, pond at 2560×1440. No fish in any frame.
  - `noon-gulls-1440.png`: tier recovery. The skein shows in only 3 of 9 frames.
  - `noon-gulls-1440-retry.png`: tier **full**. A 5-bird skein of hairline "~" marks, 10–20 px wide and about 1 px thick, no wing articulation.
  - `blue-keeper-1440.png`: 6×12 s around the island at `#t=18.8`. No keeper figure.
  - `dusk-heron-1440.png`: 9×3 s at `#t=17.0`. No heron can be identified.
  - The non-full captures are used only to show identity and motion, never frame time or grade.
- **Code:**
  - Director and beats: `garden-director.ts` (whole file), `use-garden-director.ts`, `garden-almanac.ts`, `use-garden-almanac.ts`, `garden-arrival-beats.ts:60-100`, `garden-almanac-dressing.ts` (whole file).
  - Creatures: `garden-summit-birds.ts` (whole file), `garden-harbor-life.ts:92-168,214-546`, `garden-ship-gulls.ts` (whole file), `garden-koi.ts` (whole file), `garden-island.ts:1462-1618` (pond), `garden-seasonal-dressing.ts`, `season.ts`.
  - Wiring and context: `world-renderer.ts:4294-4343` (heron wiring), `use-canvas-resize-and-camera.ts:699-716` (attract requests), `garden-rim-mesh.ts:1013-1105` (keeper path, engawa), `visual-cue-registry.ts:487-493` (quay-gull cue), `garden-beacon-fire.ts:31-34,133`, `garden-flight-tenders.ts` header.
- **History:** `reviews/ambient-life-light.md`, `reviews/astra-ambient-experience.md`, `decision-ledger.md`, plan §W4.1/4.8/4.9/4.17 and §6.

## Spell-breakers (defects)

1. **The idle viewer never receives the rituals.**
   - *What happens:* attract re-requests its environment beat every frame while it holds (`use-canvas-resize-and-camera.ts:705-714`, priority 1). Every admitted environment beat closes the slot for 6–10 min (`garden-director.ts:68,77-78`), and a closed slot refuses all environment requests whatever their priority. The keeper asks exactly once, at the blue/dawn edge (`garden-almanac-dressing.ts:118-129`). The heron asks once per dusk (`world-renderer.ts:4329-4335`). The almanac asks once per candidate (`use-garden-almanac.ts:45-48`). Attract takes the slot within one frame of it reopening, so in the "leave it running" mode all three are refused almost always.
   - *Why it went unnoticed:* pinned-hour captures request the keeper at load, before attract starts after 2 idle minutes.
   - *Why it breaks the calm:* the bible's three named events ("an arrival, kindling lamps or a heron") collapse into one. In practice the only foreground event, day and night, is an arrival caption every 6–12 min (`selected-lighthouse.png`, bottom-left: "USP arrives at Ethereum · supply increased in the window").
   - *Fix:* attract yields rather than owns. It never holds the environment slot, pauses while any ritual is active, and rituals keep asking every frame through their window, not once.
   - **Cost S.**
2. **The koi are not in the pond.**
   - *What happens:* `sampleGardenKoi` adds `GARDEN_POND_CENTER` (8, 6) to every fish (`garden-koi.ts:87-88,100-101`). The mesh is then parented to the basin group, which is already at that centre and yawed (`garden-island.ts:1550-1551,1593-1594`). The comment at `garden-koi.ts:203` ("island-local") is wrong. The fish swim about 10 u from a pond of radius 5.5×3.7, at pond depth, so they end up inside or under the terrain.
   - *Second problem:* even in place they would sit under an 82 % opaque `#244c4f` skin (`garden-island.ts:1557-1573`).
   - *Evidence:* `life/koi-pond-1440.png`, pond empty in all 6 frames.
   - *Fix:* sample relative to (0, 0), and fold the skin tint into the koi shader instead of washing over them (see life-6).
   - **Cost S.**
3. **Smoke masquerades as birds.**
   - *What happens:* the "grey-blue daymark column" (`garden-beacon-fire.ts:32-34,133`) renders as 3–5 separate dark crescents drifting up and right from the lantern roof.
   - *Evidence:* `noon.png` (840–885, 55–100), the violet-blue crescents in `golden.png` (800–830, 110–130), and all nine tiles of `life/noon-crown-birds.png`.
   - *Why it breaks the calm:* they are the most bird-like objects in the frame, sit at the hero's crown, and are the wrong value (darker than the noon sky, cool against the orange golden sky).
   - *Fix:* this belongs to the beacon lane. Merge the puffs into one soft, continuous, sky-value column (≤8 % below local sky luminance), or retire the daytime plume.
   - **Cost S.**
4. **The gulls are edge-on hairlines with no wings.**
   - *What happens:* every bird mesh is a flat triangle fan in the XZ plane:
     - island/quay gulls: `garden-harbor-life.ts:511-531`
     - ship gulls: `garden-ship-gulls.ts:46-49`
     - heron: `garden-summit-birds.ts:174-177`
   - Seen from a camera pitched about 12°, that fan collapses to about 1 px. The island and quay gulls have no flap at all, because CPU matrices only translate and yaw them (`:447-452`). The ship gulls' "flap" is a 0.1 u wingtip offset (`garden-ship-gulls.ts:97`).
   - Two unrelated bird colours: cream unlit `#ece8d8` at 0.82 alpha (`garden-harbor-life.ts:359-363`) and `iron_dark` (`garden-ship-gulls.ts:72`).
   - *Evidence:* the full-tier `life/noon-gulls-1440-retry.png` shows pencil scratches, not birds. Under load (`noon-gulls-1440.png`, recovery tier) the skein vanished in 6 of 9 frames, consistent with sub-pixel triangles dropping out of rasterisation.
   - *Fix:* life-3.
   - **Cost M.**
5. **Two herons, and neither is visible.**
   - *Heron A* (`garden-summit-birds.ts:129-235`): a 2-triangle `iron_dark` dart. Perched, its wings fold to 34 % and the whole thing lies *flat* on the rock (`:207`), so it is invisible. It flies a 28 s loop at dusk (when admitted at all, see #1).
   - *Heron B* (`garden-almanac-dressing.ts:27-31,72-81,177-190,214-225`): a 15-triangle unlit card in a different place. Its window is 45 s long because `endsAtHour = start + envelope/3600` (`garden-almanac.ts:76`), and it occurs on about half of all days.
   - *Evidence:* `life/dusk-heron-1440.png`, nothing identifiable in 27 s.
   - The bible asks for *a* heron.
   - *Fix:* life-2.
   - **Cost M.**
6. **The keeper walks where nobody can see him.**
   - *What happens:* `keeperPath` picks the longest contiguous run of the *perimeter* rim path, 3 tiles in from the map edge (`garden-almanac-dressing.ts:254-278`; `garden-rim-mesh.ts:1016-1030`). The figure is a 1.2 u unlit capsule (`garden-almanac-dressing.ts:83,236-251`). Its lamp sequencing (`garden-lanterns.ts:14-17`) therefore reads as lamps lighting on their own.
   - *Evidence:* `life/blue-keeper-1440.png`, no figure around the island.
   - *Fix:* life-4.
   - **Cost S–M.**
7. **Life that should rest never rests.**
   - The ship gulls loop forever (`garden-ship-gulls.ts:85`: `loops = step(aPhase,.99)*uFlight`, stopped only by reduced motion).
   - About a third of the 9 + 2N island/quay gulls are airborne at any instant (`garden-harbor-life.ts:224`).
   - The 14 fireflies drift every night of the year (`:136`).
   - This inverts "Motion has long rests": continuous micro-motion that nobody can read, and no rare, readable gift.
   - **Cost S** (by subtraction).

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### life-1 ★ The day score: a small repertoire of clock-anchored rituals, each a foreground gift
- **Picture:** Leave the harbour open all day and it keeps a quiet calendar. Around sunrise a lantern-lit fishing skiff sculls out across the empty inlet. Mid-morning a heron glides down into the reed shallows. For hours only water, wind and ships. In the last golden light the heron lifts and flies low over the island. At blue hour a keeper climbs the island path and the lamps come on behind him one by one. Near midnight the moon clears the borrowed hills. Each one arrives unannounced and is followed by at least eight minutes of nothing.
- **Why:**
  - Today the only foreground beat is the data arrival caption. Decorative beats are background-only, one request each, and starved by attract (spell-breaker 1).
  - `garden-almanac.ts:35-56` offers a coin flip between a 45-second heron and a 10-second meteor.
  - The astra ambient review scored surprise 1/5, and nothing structural has changed since.
  - The bible names exactly these events.
- **Impact:** poetic 5, relaxing 5, stunning 3. **Confidence:** H (on the diagnosis), M (on the exact timings).
- **Cost:** M (director and score); the beat visuals are life-2/4/5/8. **Perf:** 0 draws / 0 tris / <0.02 ms CPU.
- **How:**
  1. **Director repair:**
     - Attract is no longer a `requestGardenBeat` client. It checks `director.active === null` and backs off for 90 s after any ritual ends.
     - Add a `ritual` kind with `foreground: true` and priority 30. It pre-empts arrivals, because arrivals re-occur every 2–4 min (`garden-arrival-beats.ts:13-14`) and one skipped caption loses nothing; the arrival's DOM line still posts to the ledger.
     - Rituals ask **every frame through a window** (for example keeper 18:10–18:50 local), not once at an edge.
     - Silence after a ritual: 8–14 min (`garden-director.ts:45,75` → `480 + hash % 361`).
     - Arrivals keep their 6–12 min rhythm.
  2. **The score:** a pure table in a new `src/systems/garden-score.ts`, keyed to *local* wall-clock phase (`dayCycleBeats`) and gated by the kō calendar (life-5). The durations are the attention reservation (director slot); envelopes (residual visible life) can run longer.

     | Ritual | Window | Attention |
     | --- | --- | --- |
     | *first light* (dawn skiff, optional, see Risks) | dawn beat 0.4→1 | 70 s |
     | *heron arrives* | 08:30–10:30, seeded minute | 25 s |
     | *heron departs* | golden 0.6 → blue 0.2 | 20 s |
     | *kindling* | blue 0.05–0.6 | 150 s |
     | *moonrise* | at the computed local moonrise, if between 17:00 and 01:00 (sky lane) | none: slow continuous rise, one ledger line |
     | *meteor* | as today, but only in a dark-moon week (phase < 0.25) | 10 s |
     | *seasonal visitor* (life-8) | kō-gated | 70 s |

     That is at most 5–6 foreground gifts in 24 h, never two within 8 min.
  3. **Hidden tab:** keep "no replay" (`use-garden-almanac.ts:32-47`). A heron that arrived while the tab was hidden is simply *standing there* when you return, because the envelope is state, not replay.
- **Displaces:** attract's claim on the director, the `heron-dusk`/`deep-night-meteor` coin flip (`garden-almanac.ts:35-56,68-86`) and the edge-triggered keeper request. Arrival captions stop being the only event.
- **Truth & a11y:**
  - No analytical meaning. The existing almanac log is extended so every admitted ritual writes one ledger line with the local time ("18:22 — the keeper lit the island lamps"), reaching `HarborLedgerPanel` and `AccessibilityLedger` (`pharosville-world.tsx:1276,1295`).
  - The NowCaption can carry the ritual name.
  - Reduced motion: the director stays frozen (`use-garden-director.ts:10`). Each ritual has one authored static state chosen by clock phase, never animated: heron standing by day, lamps lit after blue.
- **Risks:**
  - Pre-empting an arrival could hide a data annotation; the ledger line mitigates this.
  - The **dawn skiff** is a non-coin hull in a world where every hull is a coin. It needs the Fleet/Data lane's sign-off (the flight tenders are the precedent) or can be cut. Mitigations: no sail and no mon, one sculler, not pickable, and its own ledger line.
  - Tests pin attract/director interplay (`use-canvas-resize-and-camera.test.ts:98-101`) and the almanac set (`garden-almanac.test.ts`).
- **Acceptance:**
  - A 45-minute unattended real-GPU session with attract active, at local 17:40–18:25, logs heron-departs and kindling in the ledger with ≥8 min between foreground beats. A `motion-sheet` over the island at 10 s intervals shows the keeper.
  - A 30-minute noon watch log shows zero decorative beats besides at most one heron event: rest is the default.

### life-2 ★ One heron, told in full: glide in, stand, strike, ring, depart
- **Picture:** A grey heron, wings bowed and slow (about one stroke every 1.1 s, then a long flat glide), drops out of the haze and lands in the reed shallows left of the inlet with a short backward flare. Then she stands for most of the day, neck in an S, perfectly still. Her reflection trembles below her. Once or twice an hour (visible life, not an admitted beat) she leans and her neck shoots forward. A single ring spreads across the flat water and fades. At golden hour she lifts and flies low across the island into the dusk.
- **Why:**
  - Spell-breaker 5.
  - A bird that is almost always *still* is the most restful possible life, and the stillness is what makes the rare strike land.
  - The reed-lily sea-edge sites (`garden-sea-edges.ts:377-397`) are in frame at mid-lower-left (`noon.png` 250–490, 740–850), so a 2.4 u heron there is roughly 45–70 px tall at rest `[INFERENCE from the gardenBirdPixelSpan arithmetic, garden-summit-birds.ts:139-147]`, compared with 12.5 px for today's dart.
- **Impact:** poetic 5, relaxing 5, stunning 4. **Confidence:** M–H.
- **Cost:** M. **Perf:** net −1 draw (two heron meshes become one InstancedMesh of 2 instances, bird plus mirrored reflection) / about +100 tris / 0 textures / <0.02 ms.
- **How:**
  - **Geometry:** a 48–60 triangle low-poly heron built in code (body wedge, S-neck of 3 segments, dagger bill, 2 thin legs, wings of 3 panels each). A per-vertex `aBone` attribute (0 body, 1 neck, 2 left wing, 3 right wing) drives a vertex shader:
    - wing hinge `θ = uFlap · (0.85·sin(2π·t/1.1) + 0.15)` about the shoulder, with a second joint lagging 0.18 cycle for a soft curl
    - neck extension for the strike: 0.35 s ease-out, 1.2 s ease-back
    - a landing flare: body pitch −25° for the final 0.8 s
  - **Material:** `MeshStandardMaterial` with `flatShading` and `onBeforeCompile` bones, so the heron takes the scene's key light, fog and night value (unlike today's unlit `MeshBasicMaterial`, `garden-almanac-dressing.ts:72`).
    - Colour: `fog_blue` lerped 0.4 toward `stone_dark` for the back; `foam_white` 0.6 for the neck front.
    - One dark crest stroke in vertex colour.
  - **Reflection:** a second instance with scale.y = −1 at the water plane, 0.35 opacity, fragment-rippled with the water's existing `uTime` (or delegated to the water lane's hero reflection).
  - **Placement:** `GARDEN_HERON_STATION`, the reed-lily site nearest the rest camera. Flight paths are two authored Catmull-Rom splines (in: from upper left through the haze; out: over the island to the northeast), sampled by clock progress. There are no free-running oscillators, because the pose is a pure function of `(beat.startSeconds, now)`.
  - **Strike:** seeded minutes within the standing envelope, at most 2 per hour. Each strike emits one ring into the water's ring uniform (life-6).
  - **Director:**
    - Arrival and departure are life-1 rituals.
    - Standing is an envelope that owns no attention: visible from the arrival until departure or dusk.
    - If the arrival was refused or missed, she is simply standing from 10:30 on, so there is never a missing heron at midday.
- **Displaces:** `createGardenSummitBirds` heron (`garden-summit-birds.ts:163-235`), the almanac heron card and its 45-s window (`garden-almanac-dressing.ts:72-81,177-190`), and the `heron-dusk` almanac id. The "bird" slot in the near-left quadrant is quieted by removing the island gulls' `tower-away` perches on that side.
- **Truth & a11y:** Decorative, and `seasonalLandmarks` in `visual-cue-registry.ts:11` already lists "the heron". Ledger lines: "09:47 — a heron came down to the reed shallows" and "17:58 — the heron left for the evening". Reduced motion: one authored standing pose at the station during daylight, absent at night, never mid-flight.
- **Risks:**
  - Too many polygons read as a toy; keep a strict silhouette and no eyes.
  - The strike ring must not read as a data cue (only one ring source).
  - Tests: `garden-summit-birds.test.ts`, `garden-almanac-dressing.test.ts`.
- **Acceptance:**
  - `npm run preview -- --hash "#t=11" --out opus-review/life/heron-rest.png`: heron identifiable as a heron by silhouette at 1600×1000, neck S visible, reflection present.
  - A motion sheet of the flight (`--frames 12 --interval 250`) shows a readable downstroke/glide alternation.
  - `--reduced` shows the same standing pose.

### life-3 ★ Birds with wings: a flap-glide gull silhouette, one flock, mostly perched
- **Picture:** Five or six gulls. Most of the time they stand on the sea wall and the torii like punctuation. Now and then one lifts: three or four quick beats, wings bent at the wrist into a shallow M, then a long banking glide on stiff wings, catching the light on the upper side as she turns. She returns and folds. At noon against the pale sky they are small dark arcs. At golden hour the underside warms.
- **Why:** Spell-breakers 4 and 7. Readability comes from *shape and cadence*: bent-wing silhouette, flap-then-glide rhythm, banking into turns. Count and constant orbit do not help.
- **Impact:** stunning 4, poetic 4, relaxing 4. **Confidence:** H.
- **Cost:** M. **Perf:** −2 draws (island/quay flock, ship gulls and the summit heron become one bird InstancedMesh; the heron moves to life-2's mesh) / ≈ +150 tris (≤16 instances × 10 tris) / 0 textures / <0.02 ms.
- **How:**
  - **Geometry (10 tris):**
    - fuselage diamond (2)
    - each wing an inner and an outer panel sharing a wrist vertex (4 per side), with 6° dihedral on the inner panel and −10° droop on the outer
    - forked tail (2)
    - Built in the XZ plane but with **real Y relief**, so it never collapses edge-on.
  - **Vertex shader:**
    - Per-instance `aPhase`, `aSeed`; bone weights 0/1/2 (body, inner, outer).
    - Flap-glide envelope: `flapping = step(fract(t/Tc + aSeed), 0.28)` with `Tc = 4.5–7 s`. While flapping, `θ = 0.55·sin(2π·3.1·t)`; the outer panel lags 0.12 cycle.
    - Glide pose: inner +8°, outer −12° (the gull "M").
    - Bank: `roll = clamp(k·dHeading/dt, ±35°)`, computed on the CPU and packed into the instance matrix (the CPU already computes heading, `garden-harbor-life.ts:448-449`).
  - **Screen-size floor:** reuse the firefly trick (`garden-harbor-life.ts:118-129`) to clamp wingspan to ≥9 px, so a distant bird becomes a clean small glyph, not a hairline.
  - **Material:** one `MeshBasicMaterial`-free `ShaderMaterial` whose colour is `mix(underside, topside, step(0, dot(faceNormal, viewDir)))`.
    - Underside: `stone_dark` lerped 0.35 to the sky fog.
    - Topside: `foam_white` × key-light intensity.
    - This gives one bird value system at every hour instead of cream versus iron.
  - **Choreography:**
    - Keep the elegant closed-sortie arithmetic (`gardenBirdSortie` / `gardenBirdSortieOffset`, `garden-summit-birds.ts:70-126`) but cut chance and share so that on average **0.7 birds are airborne**: `GARDEN_BIRD_SORTIE_CHANCE` .55→.30, `SHARE` .18→.14, `ISLAND_GULL_PERIOD` 74→140 s.
    - Keep the storm scatter.
    - 6 island perches (drop the 3 `tower-away` terrace perches, which crowd the tower).
    - Ship gulls: delete.
    - Quay gulls: delete (Reversal 1).
- **Displaces:** the 9 + 2N island/quay gulls (about 25 with 8 harbours), 5 ship gulls, the perpetual 180-s ship-gull loops (`garden-ship-gulls.ts:85-94`), and two of three bird draws.
- **Truth & a11y:** This removes the quay-gull tempo cue (`visual-cue-registry.ts:487-493`); the dock "24h supply change" rows already carry that reading. Reduced motion: every bird perched (the existing contract, `garden-harbor-life.ts:396-397`).
- **Risks:**
  - Retiring a registered cue needs an operator nod (Reversal 1).
  - Min-pixel clamping can make near birds oversize; only clamp up, never down.
  - Tests: `garden-harbor-life.test.ts`, `garden-ship-gulls` tests, and the registry test.
- **Acceptance:**
  - Full-tier `motion-sheet --hash "#t=12.25" --width 2560 --height 1440 --clip 1300,380,420,220 --frames 12 --interval 120`: at least one airborne bird shows an M-silhouette in glide and a visible wing change across flap frames.
  - At 1600×1000 no bird thinner than 2 px.
  - `noon.png` sky: ≤2 birds airborne.

### life-4 The keeper kindles the island
- **Picture:** Blue hour, the sky violet. A small dark figure with a hand-lamp comes up the island's quay stair and along the S-path past the pond. At each stone lantern he pauses for two seconds. The chamber warms from nothing to ember, its reflection lengthens in the pond, and he moves on. As he reaches the last lamp the gulls fold onto the wall and the beacon takes over the night. He goes in and the path is empty.
- **Why:**
  - Spell-breaker 6.
  - The island path (`GARDEN_PATH_SWEEP_POINTS`, `garden-island.ts:1611-1618`, the "one authored route") is on the hero island, fully in the rest frame.
  - A 1.7 u figure at about 80–110 u reads roughly 25–35 px `[INFERENCE]`, compared with a few px on the far rim.
  - The fixture-banking machinery already exists (`garden-lanterns.ts:14-17`, `world-renderer.ts:4292-4293`).
- **Impact:** poetic 5, relaxing 4, stunning 3. **Confidence:** M–H.
- **Cost:** S–M. **Perf:** 0 draws (same keeper mesh) / +40 tris / 0 textures.
- **How:**
  - **Path:** `keeperPath` = quay-stair head (the `island-quay-stair`) → `GARDEN_PATH_SWEEP_POINTS` via the existing curve, in island-local space. The dressing root is parented to the island.
  - **Figure:** 1.7 u (robe as a tapered 6-sided frustum, head, shoulders, hand-lamp box).
    - Material: `MeshStandardMaterial` with a night-value patch (same as flora, `world-renderer.ts:4184-4187`), so he is a dark silhouette against lit stone, not an unlit flat colour.
    - The lamp box is `lantern_warm`, an ember-tier point with no light added.
  - **Walk:**
    - Speed 0.55 u/s.
    - A 0.9 s stride cycle (vertex-shader body bob ±0.03 u, 2° sway).
    - A 2.0 s stop at each fixture, with the fixture factor ramping over 1.5 s. The ramp keys on a per-fixture `arrivalProgress`, not the evenly spaced `order`: change `gardenKeeperFixtureFactor` so the `passage` for each lamp is the progress at which the keeper is nearest.
  - **Duration:** 150 s, as a foreground ritual (life-1). Dawn reverses with lamps going *out*.
  - **Gulls:** keep the existing gull settling tie (`garden-harbor-life.ts:398-400`).
- **Displaces:** the perimeter-rim walk (`garden-almanac-dressing.ts:254-278`), the unlit capsule, and the lamps' anonymous day-cycle fade-in on the island during the ritual.
- **Truth & a11y:**
  - Decorative (`visual-cue-registry.ts:11`).
  - Ledger: "18:31 — the keeper lit the island lamps."
  - Reduced motion: lamps lit per the day-cycle base and no figure (today's code shows him parked mid-path at progress 0.5, `garden-almanac-dressing.ts:133-140`; a frozen man on a path reads as a glitch).
- **Risks:**
  - Collision with the pavilion or path furniture; sample the ribbon centre-line only.
  - "Literal costume": no conical kasa hat (the current hat disc at `:238` goes), a plain hood instead.
  - Tests: `garden-almanac-dressing.test.ts:21-47`.
- **Acceptance:**
  - Local-clock watch 18:10–18:50 with attract active; a `motion-sheet --interval 8000 --clip <island>` shows the figure advancing and lamps lighting behind him in order.
  - `--reduced` at `#t=19` shows lamps lit and no figure.

### life-5 The 72 kō as the garden's calendar (who visits, never costume)
- **Picture:** The caption under the harbour quietly names the week: *"Thunder lowers its voice"* today, *"Insects close their doors"* next week, *"Wild geese return"* in October. Nothing on screen says "Japan" and no seasonal props are stuck on. But the fireflies only come in the June kō, the swallows leave in September, and when the geese kō arrives a skein crosses at first light. Returning visitors feel time pass in the right units.
- **Why:**
  - `season.ts:7-15` knows four UTC-month seasons.
  - `garden-seasonal-dressing.ts:45-47` is spring-only.
  - The fireflies ignore the calendar (`garden-harbor-life.ts:136`).
  - PRODUCT.md asks for "principles of space, rhythm, season and attention", not decoration. The kō are exactly a *rhythm of attention*: 5-day windows naming what to notice.
- **Impact:** poetic 5, relaxing 3, stunning 1. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 draws / 0 tris; one pure function per UTC day.
- **How:**
  - Add `src/systems/garden-ko.ts`, which computes the sun's apparent ecliptic longitude λ for the UTC date using the standard low-precision formula (mean anomaly g = 357.529 + 0.98560028·d; λ = L + 1.915 sin g + 0.020 sin 2g).
  - `koIndex = floor(((λ − 315 + 360) % 360) / 5)`, giving 0–71 with 0 = Risshun's first kō. This follows the sky and needs no fixed-date table.
  - Export `{ index, sekki, englishName, eligibleVisitors }`.
  - Short English names only, from the Ryakuhonchōreki. Examples:
    - 44 *Swallows leave*, ≈ Sep 18–22
    - 45 *Thunder lowers its voice*, ≈ Sep 23–27 (today)
    - 46 *Insects close their doors*, ≈ Sep 28–Oct 2
    - 48 *Wild geese return*, ≈ Oct 8–12
    - 51 *First frost*, ≈ Oct 23–27
    - 25 *Rotting grass becomes fireflies*, ≈ Jun 11–15
    - 12 *Swallows return*, ≈ Apr 5–9
    - 13 *Wild geese fly north*, ≈ Apr 10–14
    - (These indices are 0-based, one less than the traditional 1-based kō numbers.)
  - **Visitor eligibility:**
    - fireflies: kō 24–28 (early June to early July), 19:30–22:00 local only
    - swallows: kō 12–44 (optional life-8 variant)
    - geese skein: kō 48–65 heading south-west, and kō 13–16 heading north-east
    - leaf fall: kō 51–56, reusing the petal budget (W4.17)
    - no fireflies otherwise
  - **DOM:**
    - NowCaption suffix "· *Thunder lowers its voice*" at most once per session view.
    - Ledger "Season" row: the kō name, its sekki, and "a traditional five-day division of the solar year".
- **Displaces:** the four-way month switch as the only season clock (keep `seasonFromDate` for tree crowns), and year-round fireflies.
- **Truth & a11y:** No market meaning; stated in the registry `seasonalLandmarks` note. Text first, so it is fully available to assistive tech. Reduced motion: the text is identical, and visitor visuals follow their own reduced states.
- **Risks:**
  - Hemisphere: the Northern calendar is already the premise (`season.ts:4`).
  - Tone: never use the romanised Japanese as decoration; English with an optional romaji tooltip.
  - Pins: `season.test.ts` stays; new pure tests.
- **Acceptance:** a unit-free smoke check. `garden-ko` for 2026-09-26 returns index 45 "Thunder lowers its voice". The caption shows it in `noon.png`-equivalent preview. Setting the device date to 2026-06-12 at 20:30 makes fireflies appear; 2026-09-26 at 20:30 shows none.

### life-6 Rising fish: rings on still water, and koi you can actually see
- **Picture:** In the island pond two koi, one vermilion-and-white and one pale gold, drift under the tower's broken reflection, bodies flexing slowly. Occasionally one noses the surface and a thin ring opens and fades. At dusk, out on the calm inlet, a fish rises once, and the ring is the only moving thing in the foreground.
- **Why:**
  - Spell-breaker 2.
  - Koi are rigid lens shapes (`garden-koi.ts:112-138`) with no tail flex.
  - A ring on still water is the Japanese garden's native motion: one event, perfect restraint, and zero geometry.
- **Impact:** poetic 4, relaxing 5, stunning 3. **Confidence:** H (on the fix), M (on the rings).
- **Cost:** S (fix) + S–M (rings). **Perf:** 0 draws / 0 tris / 0 textures; about 8 ALU per water fragment inside a tight bounding test. [INFERENCE] That is ≈0.02 ms at 1600×1000@1×, about 4× more on the operator's DPR-2 panel: still small, but it is the only per-pixel item in this lane.
- **How:**
  1. Fix the double offset (`garden-koi.ts:87,100`: drop `GARDEN_POND_CENTER`).
  2. Reduce to **2** koi (`GARDEN_KOI_COUNT` 4→2).
  3. Draw the koi *after* the skin at renderOrder 6, tinting in-shader toward `#244c4f` by depth (`mix(koiColour, skin, 0.35 + depth·3)`), so they read as under glass rather than behind paint.
  4. Tail flex in the vertex shader: `z += 0.08·sin(6.0·t·rate − 4.0·x)·smoothstep(0.1, −0.76, x)`.
  5. **Ring uniforms:** `uRings[3]` (vec4: xz, t0, amplitude) on the pond skin and on the sea water material (water lane owns the shader).
     - Ring profile: `a·exp(−3·age)·smoothstep(w, 0, |r − 0.9·age|)`, a ≤0.12 value lift, and an age cap of 4 s.
     - Emitted by the koi (≤1 per 3 min, only on a daylight surface pose), by the heron strike (life-2), and by one "evening rise" on the inlet during golden hour (≤2 per evening, seeded).
- **Displaces:** the 2 edge-station koi, the displaced "engawa koi" leftovers (`GARDEN_ENGAWA_KOI_WORLD` is used only by the spring petal anchor, `garden-seasonal-dressing.ts:76-77`), and continuous invisible motion.
- **Truth & a11y:**
  - Decorative.
  - Rings must not be confused with wakes or risk-water foam: they are thin, round and single, and never appear in named risk water (bound the emitter to the pond and the empty inlet).
  - Reduced motion: koi at their time-zero pose (`garden-koi.ts:82`), no rings.
- **Risks:**
  - The pond's reflection art (`garden-island.ts:1495-1511`) must still read; keep koi out of the tower streak 60 % of the time.
  - Tests: `garden-koi.test.ts:20-58`.
- **Acceptance:** `motion-sheet --hash "#t=12.25" --width 2560 --height 1440 --clip 1240,1020,380,150 --frames 6 --interval 3000`: at least one koi visible in every frame, moving between frames, with no fish outside the pond rim.

### life-7 Fireflies of early summer, low over the reeds
- **Picture:** On a June night, and only then, a dozen cold-gold points rise out of the dark reeds in the near shallows. They blink slowly and almost together, a soft two-second swell, and each blink is doubled faintly in the water. By ten o'clock they are gone.
- **Why:**
  - Today 14 motes cluster by one island lantern, every night of the year (`garden-harbor-life.ts:136,149`), competing with the lamp they sit beside.
  - Real Genji-botaru flash in slow, loosely synchronised waves, a gift of about three weeks.
- **Impact:** poetic 5, stunning 4 (in season), relaxing 4. **Confidence:** M.
- **Cost:** S. **Perf:** 0 draws in season; **−1 draw about 48 weeks a year** / 0 tris / 0 textures.
- **How:**
  - Gate on `garden-ko` kō 24–28 and local 19:30–22:00 (fade 20 min at both ends).
  - Anchor to the reed-lily sea-edge sites (`garden-sea-edges.ts:377`) instead of `lanternOffsets[0]`.
  - Count 14→10.
  - Blink: `b = smoothstep(0.55, 1, sin(2π·(t/2.2) + 0.35·seedJitter))^2`, so there is a shared swell with slight desynchrony.
  - Keep the ≥1.5 px floor, raised to 2.5 px (`garden-harbor-life.ts:125`).
  - Colour: `lantern_warm` lerped 0.35 toward `aurora_green`. Colder than the lamps so they never read as lamps; the anchor token itself is unchanged.
  - Reflection: register as one ember lane in the lane registry, capped under the 16-lane limit. Or skip reflections if the lane budget is spent.
- **Displaces:** year-round island-lantern motes, and one ember lane during the season (the fireflies take it).
- **Truth & a11y:** Decorative. Ledger once per night in season: "Fireflies over the reed shallows." Reduced motion: a static constellation at 60 % brightness in season, nothing out of season.
- **Risks:** Bloom on additive points could raise the night's secondary lights above "ember"; keep peak luminance under the harbour windows. Tests: `garden-harbor-life.test.ts` firefly cases.
- **Acceptance:** `npm run preview -- --hash "#t=20.5"` with the system date in mid-June shows visible blinking points low over the reeds, below lamp brightness. The same hash with a September date shows none.

### life-8 Seasonal skein: geese cross at first light
- **Picture:** On a cold October morning, while the harbour is still grey, a loose V of eight geese crosses the sky band high behind the tower. Their slow wingbeats are just visible and the formation re-forms as they go. They sink into the haze over the borrowed hills and the sky is empty again. In April they come back the other way.
- **Why:** The ask names cranes and migration. The kō give it a truthful date (life-5), and the bird mesh from life-3 gives it for free. It is the rarest, largest-scale motion in the day, so it is the ideal "event" and costs nothing between events.
- **Impact:** stunning 4, poetic 5, relaxing 4. **Confidence:** M.
- **Cost:** S (given life-3). **Perf:** 0 draws (same InstancedMesh; capacity 16) / +80 tris during the beat / 0 textures.
- **How:**
  - A life-1 ritual, once per morning in eligible kō: dawn beat 0.5 → day 0.3, 70 s attention with a 90 s envelope.
  - 8 instances of the life-3 bird at 1.9× scale with a geese variant: longer neck by stretching the fuselage vertex, uniformly darker `stone_dark`, and a slower flap of 2.2 Hz with no glide phase.
  - Flight: a straight great-circle across the sky band at altitude 55–70 u, 180 u behind the tower, speed 9 u/s.
  - Formation: V offsets `(±k·1.6, 0, k·1.1)` with a per-bird lag of 0.8 s on a sinusoidal "slip" (±0.4 u), so the V breathes.
  - Fog: normal scene fog, so they dissolve into the haze.
- **Displaces:** meteor frequency (dark-moon weeks only), plus the continuous island sorties on skein mornings (chance × 0.5 during the envelope).
- **Truth & a11y:** Decorative. Ledger: "07:12 — wild geese crossed toward the southwest." Reduced motion: nothing (a frozen skein in the sky reads as a glitch). The ledger line still posts because it is calendar truth ("the wild-geese kō").
- **Risks:** It must never cross the crown (keep a 20° azimuth exclusion around the tower) and never look like fireworks or a squadron. The plan's §6 "more birds" ban: the instantaneous count rises for 70 s, but the standing count falls from about 30 to about 6 (life-3). See Reversals.
- **Acceptance:** A `motion-sheet --frames 10 --interval 7000` over the upper frame at a forced date/hour (debug override): V readable, passing behind the tower, gone within 90 s.

## Subtractions
- **Ship gulls, entirely** (`garden-ship-gulls.ts`, `world-renderer.ts:4344-4350`): 5 dark hairlines looping forever around the largest hull. −1 draw.
- **Quay gulls** (2 per harbour, `garden-harbor-life.ts:33,455-502`), with the cue retirement in Reversal 1. That removes 16 invisible birds at 8 harbours.
- **The 2-triangle summit heron dart** (`garden-summit-birds.ts:163-235`) and **the almanac heron card** (`garden-almanac-dressing.ts:72-81,214-225`). Both are replaced by the single life-2 heron.
- **Three `tower-away` terrace perches** (`garden-harbor-life.ts:265-266,268`): birds crowding the hero's shoulders.
- **Year-round fireflies** (outside kō 24–28), and the island-lantern firefly anchor (`garden-harbor-life.ts:149`).
- **Two of four koi** and the leftover "engawa koi" world constant.
- **The keeper's hat disc** (`garden-almanac-dressing.ts:238`): costume.
- **The daytime blue plume crescents** (beacon lane): they read as the frame's only birds.
- **Attract as a director client:** it should defer, not own.

## Reversals
1. **Retire the quay-gull tempo cue.**
   - *Decision and source:* `visual-cue-registry.ts:487-493` and the long rationale at `garden-harbor-life.ts:172-212`.
   - *Evidence:* quay gulls are hairline chevrons a few px long (`life/noon-gulls-1440-retry.png`). Their tempo difference ("half again as fast") cannot be perceived at rest.
   - *Argument:* the bible limits the world to three coarse readings (tower, water, hero ships). The dock detail rows and ledger already carry 24h supply change. A fourth, invisible analytical channel on birds forces the birds to be many, continuous and evenly distributed, which is the opposite of readable, rested life.
   - *Risk:* loses a motion affordance some users might learn at high zoom. The DOM remains canonical.
2. **The keeper, heron and almanac as background ("environment") beats.**
   - *Decision and source:* `garden-almanac-dressing.ts:124-125`, `garden-summit-birds.ts:131-137`, `garden-almanac.ts:40-41`.
   - *Evidence:* spell-breaker 1. They lose to attract almost always.
   - *Argument:* the bible literally names "kindling lamps or a heron" as *the* events. They should hold foreground attention. Arrivals are frequent enough to yield once in a while.
   - *Risk:* an arrival annotation is skipped; its ledger line still posts.
3. **"More birds … banned"** (plan §6, `01-implementation-plan.md:338`; ambient-life-light §Rejected).
   - *Not reversed in spirit:* net standing bird count drops from about 30 to about 6.
   - *Explicitly reopened:* one seasonal 8-bird skein for 70 s per eligible morning. The ban's reason is attention scarcity, and a skein spends attention exactly once, inside a director slot.
4. **Four UTC-month seasons as the only calendar** (`season.ts`).
   - Keep it for tree crowns. Add the solar-longitude kō as the event calendar. This goes further than W4.17's "bounded calendar phases" by making the unit five days and naming it in the DOM.

## Cross-lane dependencies
- **Beacon/lighthouse:** fix the daymark plume's bird-like crescents (spell-breaker 3). Otherwise every bird improvement competes with smoke at the crown.
- **Camera/attract:** attract stops being a director client (life-1). Also confirm at rest that the reed-lily shallows (heron) and the island path (keeper) are inside the frame and not under chrome.
- **Water:** the ring uniform on sea and pond (life-6), the heron reflection (or the hero planar reflection if D5 lands), and a firefly ember lane.
- **Sky:** moonrise time and phase for the score. Geese must fog into the sky band consistently. The meteor becomes dark-moon-only.
- **Fleet/Data:** sign-off (or veto) on the decorative dawn skiff; retirement of the quay-gull cue with the registry and test owners.
- **UI/a11y:** NowCaption kō suffix and ritual lines; ledger "Season" row; no auto-announced chatter (the ledger only).
- **Perf:** net for the package is −3 to −4 draws (ship gulls, summit heron, almanac heron and fireflies off-season out; heron in), under +400 tris, 0 textures (the whole-map census is already at 72/72).
  - Every animated pose is vertex-shader or ≤16-instance CPU matrix work.
  - Removing about 25 CPU-written gull matrices per frame and 2–3 draws (≈11 µs submit each) is a small CPU *saving*, which matters for 120 Hz.

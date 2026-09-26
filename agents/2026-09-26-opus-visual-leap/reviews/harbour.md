# Harbour architecture, flags, lanterns & graveyard — harbour

## Verdict
The harbour is a toy set, not a town. Nine archetypes were made different on purpose: nine roof hues, nine flag cuts, and a "second level" on every station. Those second levels are wall-dominant towers under thin lids, 13.3–21.5 u tall beside a 38 u Pharos. On top of them sit saturated crypto-brand flags 6–8 u wide. In `noon.png` the Ethereum flag (upper-left, ~140,320) flies at the Pharos gallery line. In `wholemap-noon.png` the ring reads as a map of logo pins. At night (`night.png`, `eth-night.png`) the flags still read more clearly than any lamp. Five brand fields (Tron, Base, Solana, Polygon, Avalanche) are more chromatic than vermillion, and that breaks the bible's chroma rule.

The leap is subtraction and unification. One low, roof-dominant vernacular of charred timber, plaster and grey kawara. Identity moves to small undyed nobori carrying a muted mon. At dusk a keeper kindles one stone lantern per station, unevenly spaced. The graveyard keeps a single ritual: on a death-month anniversary, one lantern drifts away from its wreck.

## What I looked at
- **Baseline frames:** `noon.png`, `wholemap-noon.png`, `wholemap-dusk.png`, `golden.png`, `night.png`, `deep-night.png`. Metrics come from the serial `.txt` files only.
- **Own captures** (`outputs/opus-review/harbour/`):
  - `eth-noon.png`: `#t=12.25&sel=dock.ethereum`, tier full. The camera looks from the outer sea at the NW shore and shows Arbitrum, Ethereum, BSC and Base side by side.
  - `eth-night.png`: `#t=22&sel=dock.ethereum`. The first run was at recovery tier; the retry was full, and that is the file kept.
  - `cemetery-dusk.png`: `#t=17.9&cam=2560,-697,1.1`. The first attempt timed out; the retry ran at **recovery** tier. I use it for composition only.
  - `cemetery-golden.png`: `#t=17.4&sel=grave.ust-terrausd-2022-05`, tier full. The camera did not frame the grave, so this is effectively a golden rest frame with the TerraUSD panel open.
- **Code read:**
  - `src/three/garden-docks.ts`: identity table :113-128, `createHarborLanterns` :227-260, `authorDock` :263-417, roof/wall colour :459-507, fidelity :755-795, Mole :848-1009, hatago :1011-1062, uogashi/tea/fishing/stepped/reed :1064-1280, storm-mole :1282-1326, pigeonnier landing :1329-1366, quay lit edge :1384, lamp locals :1922-1936, flag authoring :1966-2011.
  - `src/systems/dock-layout.ts`: `STATION_SCALE_LADDER` :23-33, `HARBOR_FLAG_SCALE_MULTIPLIER` :234, `stationFlagPlacement` :243-270.
  - `src/three/garden-chain-flag.ts`: `CHAIN_FLAG_FIELD` :190-202, paint :220-278.
  - `src/three/garden-harbor-batch.ts`: materials :243-253, `createFlags` :340-379, `writeFlagMatrix` :398-414, shape discard :416-440.
  - `world-renderer.ts`: flag pose :4487-4505, keeper lighting :3511-3536, lantern breath :4223-4263.
  - `garden-lanterns.ts`: keeper ritual :7-83, ember budget :118-159.
  - `garden-landmarks.ts`: cemetery :78-392, forms :638-762, furniture :771-903, pigeonnier :1033+.
  - Also: `garden-station-smoke.ts:15-163`, `garden-signal-mast.ts:15-90`, `garden-torii.ts:16-35`, `camera.ts:66-158` (the rest solver steers around flag tips at y = 26), `palette.ts:60-86`, the decision ledger, and `01-implementation-plan.md` §6.

## Spell-breakers (defects)
1. **Chain flags out-shout vermillion.**
   - **Evidence:** `garden-chain-flag.ts:190-202` paints raw brand hex outside the palette. Measured OKLCH chroma (C):
     - Tron #ff060a: C 0.256 at H 28°, the same hue as vermillion (H 32°, C 0.177).
     - Base: 0.263. Solana: 0.256. Polygon: 0.225. Avalanche: 0.204.
     - Ethereum, Arbitrum, BSC: ~0.165, right at vermillion's level.
   - **Where it shows:** the Tron flag is the reddest object in `wholemap-noon.png` (1195,388). The BSC yellow is the brightest chromatic patch at the NW shore in `eth-noon.png` (880,390).
   - **Why it matters:** this breaks the immutable anchor "Vermillion retains chroma primacy" and imports the crypto-dashboard anti-reference.
   - **Fix:** idea harbour-2. **Cost:** S.
2. **Flags are monuments.**
   - **Size:** cloth is a 1.5 × 1 plane scaled by `(0.72|1.05 + 0.24·supply)·4.2` (`dock-layout.ts:249-250`). That makes ordinary stations 6–8 u wide and Ethereum ~8.1 × 5.4 u.
   - **Height:** the top edge sits at `secondLevelTop + 0.8 + 1.25·s`, so ≈19–24 u for ordinary stations and **≈29 u for Ethereum**. The Pharos beacon is at 30.2 u (`garden-observatory-slice.ts:45`).
   - **Seen in frames:** in `noon.png` the Ethereum flag (95–180, 290–355) is larger on screen than the nearest ship sails (1080,800), even though it is farther away. The rest-camera solver has to route around flag envelopes (`camera.ts:70-79,133-158`), so the flags are constraining the hero shot.
   - **Fix:** harbour-2. **Cost:** S.
3. **Every station is a tower, and every tower is a lid on a shaft.**
   - **Measurements** (roof share of elevation, with `heightScale` = 1):
     - Storm-mole lantern tower: walls to 17.0, 0.9 u pyramid cap (`garden-docks.ts:1311-1325`), about 5 % roof.
     - Hatago: eave 15.0, ridge 17.2 (`:1016-1033`), about 14 %.
     - Tea-house loft: eave 15.6, ridge 16.2 (`:1126-1139`).
     - Pigeonnier cote: a 1.4 u cone on a ~12 u drum (`:1342-1360`).
     - Ethereum campanile: shaft to 15, belfry to 19, cap to 21.5 (`:938-956`).
   - **Seen in frames:** `eth-noon.png` shows four towers and four flags in a picket line along one shore. In `noon.png` the Base hatago reads as a grey concrete silo in fog (445,380-540).
   - **Why it matters:** Japanese harbour buildings get their calm from roofs of 40–60 % of elevation with deep eaves. These read as nine small lighthouses competing with the one real one, against the bible's "do not add another monument".
   - **Fix:** harbour-1. **Cost:** M.
4. **The flags are the most legible harbour object at night.**
   - **Seen in frames:** in `night.png` and `deep-night.png` the Ethereum flag is a blue rectangle floating in the sky (100–180, 290–355) while the campanile beneath it is gone. In `eth-night.png` the BSC flag (850–910, 370–410) still reads yellow at 22:00 and out-reads every station lamp.
   - **Why it matters:** the bible says "every other lamp, window and reflection is an ember". Here the non-light is louder than the lights.
   - **Fix:** harbour-2's night value clamp. **Cost:** S.
5. **The night harbour is dark blocks, one amber disc and LED strips.**
   - **Seen in `eth-night.png`:** the tea-house moon-window glass is a solid 0.84 u emissive disc (`garden-docks.ts:1136-1138`) and reads as a clock face or porthole (858,495). The only other harbour light is the thin continuous `quayLitEdge` line (`:1384`, and the Mole's 14 u line at `:901`), which reads as an under-cabinet LED strip (760–1000, 515–520).
   - **The lanterns:** two identical sphere-on-hex-cylinder lanterns stand *in the water* at every station mouth, symmetric at ±1.8 u (`:211-259`). Around the ring that is the evenly spaced lamp necklace the bible forbids.
   - **Fix:** harbour-3. **Cost:** M.
6. **The graveyard barely exists in the picture.**
   - **Evidence:** in `cemetery-dusk.png` (recovery tier; composition only), the storm-mole tower and its flag dominate the SW cove. The only legible graveyard element is one lantern-lit hull (≈670,720) behind rim pines. At whole-map (`wholemap-noon.png`, left corner ≈250,500) the field does not register at all.
   - **Why it matters:** the dignity is authored in code (dark drowned timber, one lantern at `garden-landmarks.ts:882-902`) but it does not reach the eye.
   - **Fix:** harbour-4 plus lowering the storm mole in harbour-1. **Cost:** S–M.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### harbour-1 ★ One harbour vernacular: low, roof-dominant, charred timber, plaster and kawara
- **Picture:** Along the shore the stations settle into one family, like Ine's funaya or Kurashiki's canal: dark charred-cedar lower walls, pale plaster above, grey tile roofs with deep eaves. The roofs are heavy and low, and their ridges step gently along the water like the rim hills. Each station is still itself through what happens at ground level: the uogashi's steelyard, the fishing pier's net rack, the stepped inlet's stone gangi stairs, the reed boathouse's open boat mouth. Nothing rises past the treeline, and the Pharos stands alone in the air.
- **Why:**
  - Defect 3. The toy-set read was legislated: a clone-separation contract forces ≥10 % spread in footprint and second-level height (`dock-layout.ts:16-22`).
  - Nine roof hues run from straw thatch `#e2ae43` (L 0.78, C 0.135) and cote clay `#d47636` to copper green (`garden-docks.ts:459-469`, `palette.ts:72-80`).
  - Walls are tinted toward each roof (`WALL_ROOF_TINT` 0.22, :498-502).
  - The storm mole carries European fort merlons (`:1294-1300`) against the bible's "not a fort". The Mole carries an Italian campanile (`:936-958`).
- **Impact:** stunning 4 / relaxing 5 / poetic 3. **Confidence:** H.
- **Cost:** M (2–3 days; the geometry kit already exists). **Perf:** Δdraws 0 (the buckets are already merged); Δtris −4k to −8k (tower shafts, merlons and dome go; deeper eaves add a few hundred); ΔGPU ≈0; Δtextures 0.
- **How:**
  1. **Ladder.** `STATION_SCALE_LADDER.secondLevelTop` becomes 8.5–11.5 u for ordinary stations and 13.5 u for Ethereum (≈30 % and 36 % of the 38 u Pharos). Footprints and frontage-by-supply stay unchanged (`stationScaleFor`, `STATION_LOCAL_BOUNDS`).
  2. **Second levels become roofs, not towers.**
     - hatago: a two-storey irimoya with the upper floor set back, eave overhang 1.2 u (`articulateIrimoya` halfW/halfD + 0.9).
     - storm-mole: drop the lantern tower and merlons. Batter the arc blocks into an ishigaki stone mole (0.25 inward batter via the existing `prismGeometry` toe used at :864). One low kura with a hip roof.
     - tea-house: move the moon window down into the ground-floor gable. Drop the loft.
     - reed-boathouse: drop the drum and dome (:1268-1275). The steep thatch gable already carries it.
     - pigeonnier landing: drop the cote drum and cone (:1341-1363). The TON landmark islet next door already owns that silhouette.
     - Ethereum Mole: replace the solid campanile with an **open timber hinomi-yagura** (fire-watch frame): four 0.3 u posts, two braced stages, a small hip cap, and the existing bell cone hung inside, with its top at 13.5 u. It is see-through, so it reads as structure rather than mass. Deepen the hall roof: ridge 9.2 → 10.4, eave overhang +0.8.
  3. **Material ladder.**
     - Walls: one plaster (`WALL_PLASTER`, tint 0.22 → 0). Add a lower band of about 38 % of wall height in charred timber (`timber_dark`×0.55, derived) using the existing `walls` and `timber` buckets.
     - Roofs: three tones only. `roof_slate_kawara` for most, `roof_storm_slate` for the working sheds, and a single civic exception (weathered copper on the Ethereum hall).
     - Retire `roof_thatch` and `roof_cote_clay` from stations.
     - Timber piers stay timber; quays stay stone, but as stepped gangi at the water (reuse `authorSteppedInlet` :1201-1204 as a shared quay-nose helper).
  4. **Tests.** Delete the clone-separation height/footprint contract and the per-archetype distinct-roof-colour assertion (`garden-docks.test.ts` ~:200-206). They pin incidental diversity, not behaviour. Keep the footprint and berth contracts.
- **Displaces:** five towers (campanile, storm tower, tea loft, cote, thatch dome), the crenellations, six roof hues, and the per-station wall tint.
- **Truth & a11y:** station footprint still follows supply share (`frontageScale`). Height was already data-independent ("vertical recognizability ladder", `dock-layout.ts:46-48`), so no analytical meaning is lost. The DOM dock detail is unchanged. Reduced motion: static.
- **Risks:** stations may lose findability at whole-map. That is mitigated because the nobori (harbour-2) and berth fleets still mark them, and the ledger lists them. The rest-camera solver (`camera.ts:70-79`) hard-codes a flag tip at y = 26 and has to be re-keyed; that could change the rest seat. The hatago must not become a second pavilion.
- **Acceptance:**
  - `#t=12.25` 1600×1000: no station element above the rim treeline in the left third, and the left-third sky band (`noon.png` region 0–500, 280–500) is clear of silhouettes.
  - `#t=12.25&sel=dock.ethereum`: four stations read as one family, with no roof hue outside {grey, slate, one copper} and no shaft taller than its roof.
  - `wholemap-noon`: the Pharos is the only vertical.

### harbour-2 ★ Undyed nobori with a muted mon, breathing in the shared wind
- **Picture:** Above each station's roof hangs a tall, narrow banner on an L-pole: unbleached cloth with the chain's mark printed in a muted dye, the way sails wear a mon. The cloth ripples in slow travelling folds from pole to free edge, catching light and shade in each fold, and every banner in the harbour leans the same way in the same gust. Tron's mark is now a dusky iron-oxide red, the colour of a harbour warehouse door, and the torii is once more the only red that sings. After dark the banners fall back to pale moonlit ghosts, dimmer than the sails.
- **Why:** defects 1, 2 and 4.
  - Today the flags are rigid boards. The wave is baked once from the fleet-mean phase (`garden-harbor-batch.ts:343-352`), and the only motion is ±0.03 rad roll plus a wind yaw offset (`world-renderer.ts:4491-4505`). They read as signboards.
  - The bible's own grammar is "a complete mon on cloth, not an identity plate".
  - Nine discard cut-outs (`garden-harbor-batch.ts:424-434`) are an identity channel nobody reads at 40 px.
- **Impact:** stunning 4 / poetic 4 / relaxing 5. **Confidence:** H.
- **Cost:** S–M (1–2 days). **Perf:** Δdraws 0; Δtris +~450 (a 4×14 grid × 10 instances replaces 8×3); ΔGPU ≈0 [INFERENCE] (vertex sin/cos on ~500 vertices); Δtextures 0 (same 512² atlas, repainted). ΔCPU is slightly negative: one 10-float `aGust` upload per frame replaces the 10 per-frame matrix rewrites in `setFlagPose`. The flag program is not the fleet sail program, so it has attribute headroom: +2 (`aGust`, `aPhase`) −1 (`aFlagShape`).
- **How:**
  1. **Geometry** (`createFlags`): `PlaneGeometry(1, 3.2, 4, 14)` in portrait, hoist edge at x = 0. Add an L-pole crossbar prop (reuse the `post` instances).
     - Placement: `stationFlagPlacement` scale becomes `(0.95 + 0.25·supply)` with **no** 4.2 multiplier, giving banners ~1.0–1.2 wide and 3.0–3.8 tall. Pole top = ridge + 2.2 u, so the tip is ≤13.7 u even for Ethereum.
     - Ethereum gets a *pair* of nobori instead of a bigger one (two instances, the second offset by 1.6 u), because rhythm carries rank better than size.
  2. **Motion** (`patchFlagAtlasMaterial`): add a `uTime` uniform and `uWindYaw`, and replace the per-frame `setFlagPose` matrix writes (`world-renderer.ts:4489-4505`) with one small per-frame `aGust` instance attribute. It carries the value `gardenGustAtWorldPosition` already computes per dock (`world-renderer.ts:4493`). `aPhase` comes from `dockFlagWavePhase` and is static.
     - Weight `w = uv.x^1.4 · (0.35 + 0.65·(1 − uv.y))`, so the top and hoist edges are pinned.
     - `z += w · (0.05 + 0.11·gust) · sin(6.0·uv.x + 2.2·(1−uv.y) − 1.9·uTime + aPhase)`.
     - Add a second octave at ×2.3 frequency and 0.3 amplitude.
     - Analytic normal from the partial derivatives, for light and shade in the folds.
     - Delete the 9-shape discard branch and `aFlagShape`.
  3. **Dye** (`paintChainField` / `paintChainMark` / `knockOutMark`):
     - Field = kinari (`foam_white` lerp `stone_pale` 0.28, ≈L 0.86 C 0.03).
     - Mark ink = the chain hue clamped to OKLCH L 0.40–0.50, C ≤ 0.10. A hoist band (chichi) 14 px in the same ink.
     - Aptos stays sumi.
     - Hard rule: ink C ≤ 0.10 always, below vermillion's 0.177. Move `CHAIN_FLAG_FIELD` into a derived-palette table so the colour checker sees it.
  4. **Night:** flags join the sail night-value path, with albedo multiplied by the same day-cycle factor the sail material uses. Assert that the night flag luminance is ≤ the sail's.
  5. **Tests:** delete the `HARBOR_FLAG_SCALE_MULTIPLIER` pins (`garden-docks.test.ts:203-204`) and the `aFlagShape` shape tests. Add one behaviour test: every flag ink has OKLCH C < vermillion C.
- **Displaces:** the 4.2× flag multiplier, nine flag cuts, brand-saturated fields, and the rigid board. Cloth area drops ~75 %.
- **Truth & a11y:** chain identity keeps three carriers: mark silhouette, hue family, and the DOM ledger and dock detail (unchanged). Colour is not the only carrier, and the initials fallback remains. Reduced motion: `uTime` = 0 and gust = 0.35 give one deterministic rippled pose.
- **Risks:** a brand-purist objection to muted marks. The answer is that the sails already mute issuer identity under `MARK_MIN_PRESENCE`. Small marks may lose legibility at whole-map, which is acceptable because the ledger is canonical. The camera solver's flag envelopes (`camera.ts:70-79`: tip y 26, reach ±6) must shrink to tip ≈14, reach ±1.5.
- **Acceptance:**
  - `#t=12.25` rest: no flag pixel above the Pharos's lower-gallery screen line, and the Tron banner has lower chroma than the torii when sampled (pipette).
  - Motion sheet: `--hash "#t=12.25&sel=dock.ethereum" --frames 9 --interval 500 --clip 560,280,480,300` shows travelling folds whose phase is shared between neighbouring banners.
  - `#t=22`: banners dimmer than the nearest sail.

### harbour-3 ★ Kindling the harbour: one stone lantern per station, lit in the keeper's walk
- **Picture:** At dusk, a single stone lantern at each quay nose, set off-centre and on the camera side, gets its fire-box lit one after another as the keeper's evening passes around the harbour, followed by a warm shoji panel in each station. Some coves stay dark: the western terrace arc has no lamps at all. By night the harbour is a loose, uneven scatter of about seven embers and seven lit paper doors. There is no line of LEDs, no clock-face disc, and nothing brighter than the beacon.
- **Why:**
  - Defect 5. Today there are two symmetric sphere lanterns per mouth, standing in water (`garden-docks.ts:211-259`); two lamp heads per station on posts (`:372-386`, `:1922-1936`); one approach lamp (`:1427-1431`); a continuous quay lit edge (`:1384`); and a solid moon disc (`:1136-1138`). That is ~5 light vocabularies per station.
  - The keeper ritual already exists (`garden-lanterns.ts:23-83`) but is wired only to the harbour-lantern heads and the island (`world-renderer.ts:3535-3536`). Windows and lamp heads light instantly by day-cycle, so the kindling event is invisible in the harbour.
- **Impact:** poetic 5 / relaxing 4 / stunning 3. **Confidence:** M–H.
- **Cost:** M (2 days). **Perf:** Δdraws 0 (the 2 lantern InstancedMeshes become 2: stone body + fire-box); Δtris ≈ +300 net (a kasuga ~140 tris × 7 vs ~72 × 20 today); water light lanes **−50 %** at the harbour mouths (one position per station instead of two); ΔGPU ≈0; Δtextures 0.
- **How:**
  1. **Lantern positions** (`gardenHarborLanternWorldPositions`): one position per station, not two, placed on the quay nose at `QUAY_TOP_Y` (not in the water).
     - Tangent side = the side whose normal faces the camera yaw.
     - Seaward offset 0.5–1.1 u and tangent 1.2–2.6 u, jittered by `stableUnit(chainId)`.
     - Skip stations whose shore bearing falls inside the bible's "broad dark terrace arc". Take the arc from the rim lane's authored dark arc; assume ~3 of 10.
  2. **Lantern geometry** (`createHarborLanterns`): a merged kasuga form. Hexagonal base (r 0.38, h 0.18), shaft (r 0.14, h 0.7), platform (r 0.32), fire-box (hex, r 0.22, h 0.34) with two opposite openings as a separate emissive instance, kasa (hex cone r 0.46, h 0.26, slight upturned rim), and hōju. Total ≈1.8 u tall. Stone `stone_mid` with a moss-top vertex tint (`ROCK_TOP_MOSS` from `garden-landmarks.ts:38`). This is "principles, not costume": a single, sparse, stone light at a threshold.
  3. **Kindling:** apply `createGardenKeeperFixtureLighting` to the harbour `window` bucket material and the `lampHead` prop material as well (`world-renderer.ts:3535`). Stations then wake in walk order over the ritual's existing progress window. Retire the station `lampHead` pair (`:372-386`), keeping only the Mole's portal pair.
  4. **Remove** `quayLitEdge` emissive boxes (`:1384`, `:901`), keeping their feature telemetry on a non-emissive stone course if tests need it.
  5. **Moon window:** turn it into kumiko. Add two more mullions and a shoji ring; cut the glass radius 0.84 → 0.62.
  6. **Windows:** one shoji rectangle per station (the existing `warmBox` sites), 0.9 × 1.1, with the lintel in `timber_dark`.
- **Displaces:** ~13 of the 20 water-standing lanterns, ~18 post lamp heads, the continuous LED edges, and the amber disc. That is "a light demotes a light".
- **Truth & a11y:** decorative with no data meaning. Kindling is clock-driven by the existing ritual. Reduced motion: the ritual already resolves to the lit or unlit end-state by phase (`gardenKeeperFixtureFactor`), so there is no animation.
- **Risks:** too few lights may make the harbour unfindable at night. Keep one lit shoji per station unconditionally. Lane-registry tests that assume 2 lanes per station (`garden-docks.test.ts:546-549`) must be re-pinned to 1.
- **Acceptance:**
  - `#t=22&sel=dock.ethereum` (full tier): ≤1 lantern plus ≤1 shoji per station, no continuous emissive line, no station light larger than 12 px, and the western arc dark.
  - Motion sheet over `#t=18.3` (the ritual window) `--frames 12 --interval 5000`: station embers appear sequentially, not all at once.
  - `#t=22` blur audit: the harbour ring does not read as a necklace.

### harbour-4 The anniversary lantern: one tōrō drifts from its wreck at dusk
- **Picture:** On an evening in the month a stablecoin died, a small paper lantern leaves its wreck at dusk. It drifts a few dozen metres on the harbour current, its reflection a short warm stroke, and fades before full dark. The rest of the year the graveyard keeps its single burning mast lantern and its drowned timber. Nothing flashes; one light goes out to sea.
- **Why:** defect 6. The graveyard's dignity is authored (`garden-landmarks.ts:78-107,882-902`) but invisible, and it has no event. The bible asks for motion with long rests, where one lantern or one heron "becomes an event". `deathDate` exists at month granularity: Sept 4, Jun 21, other months 3–8 (`shared/data/dead-stablecoins.json`).
- **Impact:** poetic 5 / relaxing 4 / stunning 2. **Confidence:** M.
- **Cost:** S–M (1 day). **Perf:** Δdraws 0–1 (reuse `cemetery-wreck-lantern` with instance count 2, or add one instanced quad); Δtris <50; light lanes 0 (move the existing static `cemetery-lantern` lane, `world-renderer.ts:3166-3170`, to follow the tōrō while it floats); ΔGPU ≈0.
- **How:**
  - **Selection:** each evening, pick one grave from the rendered or anchored field whose `deathDate` month equals the wall-clock month. Rotate deterministically by `stableUnit(gridDate)` over the month's list, favouring rendered hulls; if none is rendered, launch from the hero.
  - **Timing:** launch at dusk phase 0.35. Drift 18–28 u along the wind vector over 150 s with ±0.6 u lateral meander (sin 0.07 Hz).
  - **Light:** emissive = `WRECK_LANTERN_EMBER_INTENSITY` (1.15) × smoothstep fade over the last 40 s. Paper-lantern geometry: a 0.28 u cube with a darker cap on a 0.4 × 0.4 board.
  - **Wrecks:** also add a waterline algae band to the hull vertex colours: the bottom 25 % of the above-water part gets `#2f443c`, the silt tone.
- **Displaces:** the static position of the cemetery light lane (it moves; nothing is added). The per-hull mourning pennant goes (`garden-landmarks.ts:870`, slot 1); the rag stays, so the lantern becomes the mourning gesture instead of a pennant.
- **Truth & a11y:** encodes "died in this month" softly. DOM parity: the cemetery detail and ledger gain the line "Remembered this evening: TerraUSD (died May 2022)", plus an announcement via the existing live region at launch. Reduced motion: the lantern sits lit beside its wreck from dusk to full dark with no drift.
- **Risks:** the Pharos-sweep lane budget. It stays within the existing single cemetery lane. June (21 deaths) still launches only one lantern per evening.
- **Acceptance:** `#t=18.2` in a month with ≥1 death, cemetery postcard framing. Motion sheet `--frames 10 --interval 15000` shows a single lantern leaving a hull and fading, and the DOM line is present. In a month with 0 deaths, nothing happens.

### harbour-5 Clear the graveyard cove
- **Picture:** The graveyard's cove opens out: low stone breakwater, dark water, heeled hulls, one mast lantern. It is a quiet place you come upon, not something tucked behind a fort tower.
- **Why:** defect 6. In `cemetery-dusk.png` (recovery tier, composition only) the storm-mole lantern tower and its 6 u flag stand between the viewer and the field. The per-hull 0.82 u marker stone (`garden-landmarks.ts:705-707`) adds a gravestone to every hull. That is ~18 upright stones at scale up to 2.6, which is 2.1 u each; I infer it as literal and busy, since it could not be verified at full tier.
- **Impact:** poetic 3 / relaxing 3. **Confidence:** M.
- **Cost:** S. **Perf:** Δtris −1k; Δdraws 0.
- **How:**
  - harbour-1 lowers the storm mole, and harbour-2 shrinks its banner.
  - Remove the per-hull marker stone and base from `wreckFormGeometry`, and move the cause stain onto the hull's exposed stem (`frameParts`, bone) as a painted band 0.12 u tall at C ≤ 0.05.
  - Add **one** gathered stone cluster at the shoal heart: 5–7 moss-capped stones of unequal height (0.3–0.9 u), in one instanced batch, placed by `stableUnit`.
- **Displaces:** ~18 upright gravestones become one gathered cluster.
- **Truth & a11y:** the cause stain is kept per grave (on the stem), and the DOM detail is unchanged. Static.
- **Risks:** `garden-landmarks.test.ts:190-232` pins "a taller stone marker" beside each family (the wreckRole-4 contract) and would need re-pinning. The stain on a heeled stem could be hidden underwater for sinking-stern forms; use the bow stem.
- **Acceptance:** a cemetery postcard at `#t=17.9` (full tier) shows the field reading as hulls plus one stone cluster, with no forest of uprights.

### harbour-6 Station smoke and noren join the same wind
- **Picture:** The three hearth chimneys' smoke leans the same way as the banners, and the hatago's paired noren swing a little in the gust instead of hanging frozen mid-wave.
- **Why:**
  - The hatago noren wave is baked once at build (`garden-docks.ts:1047-1058`), a permanent frozen ripple.
  - Smoke drifts on "the ambient sky-mist wind diagonal" (`garden-station-smoke.ts:34-35`), not the weather wind the flags yaw to (`world-renderer.ts:4503`), so smoke and banners can disagree.
- **Impact:** relaxing 2 / poetic 2. **Confidence:** M.
- **Cost:** S. **Perf:** 0 draws; ΔGPU ≈0.
- **How:**
  - Move the noren into the flag instanced mesh as short-drop cloth instances (one more "shape" = a vertical 0.6 × 1.4 strip with top-only pinning) so they share the harbour-2 shader.
  - Feed `weather.wind` into the smoke's drift direction uniform.
- **Displaces:** the frozen noren ripple and the second wind direction.
- **Truth & a11y:** none. Reduced motion: pinned pose.
- **Risks:** negligible.
- **Acceptance:** a motion sheet on the hatago shows noren, banner and smoke leaning together.

## Subtractions
- Storm-mole crenellated merlons (`garden-docks.ts:1294-1300`): fort language the bible rejects.
- Reed-boathouse drum and thatch dome (`:1264-1275`): reads as a yurt.
- The TON station cote (`:1341-1363`): duplicates the pigeonnier landmark next door.
- `quayLitEdge` emissive strips (`:901`, `:1384`).
- The symmetric water-standing lantern pairs (`:211-259`) and the per-station `lampHead` pairs (`:372-386`).
- Nine flag-shape discards and the `aFlagShape` attribute (`garden-harbor-batch.ts:381-393,424-434`).
- `WALL_ROOF_TINT` (`garden-docks.ts:498`): one plaster.
- Straw thatch `#e2ae43` and cote clay `#d47636` as station roofs: the two loudest warm hues after vermillion.
- The per-hull cemetery mourning pennant (`garden-landmarks.ts:870`, slot 1).

## Reversals
1. **2026-09-05 "Enlarge station vertical silhouettes and flags, not footprints"** (decision ledger row 22; `dock-layout.ts:11-33`, `HARBOR_FLAG_SCALE_MULTIPLIER` 4.2).
   - **Evidence:** it was made for an orthographic "warm village" rest that no longer exists; the camera is now a long-lens perspective with a sky band. The result is an Ethereum flag at 29 u next to a 30.2 u beacon, four towers in a picket line (`eth-noon.png`), and a rest solver bent around flag tips (`camera.ts:70-79`).
   - **Argument:** the current bible names one hero and "do not add another monument". Stations are not even among its three masses.
   - **Risk:** stations are harder to find at whole-map. The ledger and berths mitigate that.
2. **2026-09-07 "Identity lives on rooftop flags"** (ledger row 25).
   - **Proposal:** keep the principle (identity on cloth, not captions) but reverse the implementation: brand-saturated, logo-flag scale becomes a muted mon on small nobori.
   - **Evidence:** measured chroma above vermillion for 5 chains; the flags are the most legible harbour element at night.
   - **Risk:** weaker glance identification. The DOM ledger remains canonical, as the bible requires.
3. **The clone-separation contract** (`dock-layout.ts:16-22`, `garden-docks.test.ts`).
   - **Argument:** it legislates difference, which is the opposite of a vernacular. Delete it rather than re-pin it; it pins incidental implementation, not consumer-visible behaviour.

## Cross-lane dependencies
- **Camera/composition:** `camera.ts:66-158` rest solver: the station flag tip (y 26, reach ±6) must shrink to ≈14 / ±1.5 after harbour-1 and harbour-2. The rest seat may move, so re-verify the value plan. Also observed: `sel=grave.ust-terrausd-2022-05` did not move the camera within 6 s (`cemetery-golden.png`), even though graves resolve a focus tile (`garden-observatory-slice.ts:371`). A grave selected from the ledger is never shown; this needs a camera-lane check.
- **Light/night lane:** harbour-3 halves the harbour lanes, and harbour-4 moves the cemetery lane. The ember budget (`garden-lanterns.ts:140-159`) is unchanged. Confirm with the night blur audit.
- **Ambient life / keeper ritual owner:** harbour-3 widens `createGardenKeeperFixtureLighting` to the station windows. The keeper path (`almanacDressing.keeperPath`) must reach, or at least order, the harbour ring.
- **Fleet lane:** the flag night value should use the sail material's night factor (harbour-2), and the muted-dye rule should match how sails keep marks under `MARK_MIN_PRESENCE`.
- **Rim/terrain lane:** defines the "broad dark terrace arc" whose stations get no lantern.
- **Palette owner:** add derived `flag_kinari`, `timber_charred` and the muted-ink clamp. The four anchors stay untouched.
- **Water/sea-edges lane:** the vermillion warning-buoy pole in `noon.png` (≈235,600-740) is a 140 px vermillion stick that competes with the torii. That belongs to their slice.
- **Flora lane:** the rim "palms" in `wholemap-noon.png` read tropical next to a Japanese harbour vernacular.

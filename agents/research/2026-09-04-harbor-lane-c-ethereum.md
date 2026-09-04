# Lane C — the Ethereum Mole as PharosVille's second monument

## Decision in one sentence

Build **the Ethereum Mole** as a low, broad, engineered civic breakwater precinct with one asymmetrical campanile, standing alone at its own mouth; move `base`, `arbitrum`, and `polygon` to distant self-standing stations with no physical or symbolic annex at Ethereum. The Mole borrows the Pharos's legible base-to-crown ladder, terrain/waterline integration, and long-distance silhouette discipline, but not its natural promontory, tapering tower, pale-sky brilliance, fire, beam, or sacred verticality.

This is a composition specification, not an implementation claim. Dimensions, budgets, and limits below are proposed targets unless explicitly described as current.

## 1. Extracted landmark grammar: why the Pharos reads as a monument

### 1.1 A very clear height ladder

The tower is not a single extrusion. Its authored silhouette climbs through discrete, narrowing stages:

| Existing Pharos stage | Lighthouse-local top | Above water | Plan-width cue |
| --- | ---: | ---: | --- |
| Island-set tower root / terrace base | 0.0 | 4.0 | tower root is at world `y=2.55`; water is `-1.45` |
| Three-step grand terrace | 2.5 | 6.5 | widths 9.2 → 8.4 → 7.7 |
| Battered square tier | 17.5 | 21.5 | half-width 3.4 → 2.9 |
| Octagonal drum | 26.0 | 30.0 | radius 2.15 → 2.0 |
| Cylindrical drum | 29.5 | 33.5 | radius 1.35 |
| Open brazier / beacon centre | 30.1 | 34.1 | flame width 2.4, height 2.9 |
| Zeus Soter / sceptre tip | 34.0 | 38.0 | terminal figure, not another building tier |

The local constants are explicit at `src/three/garden-lighthouse.ts:40-57`; tower placement, water datum, beacon, and height are explicit at `src/systems/garden-observatory-slice.ts:42-57`. The terrace's exact step widths and vertical intervals are documented and instantiated at `src/three/garden-lighthouse.ts:311-330` and `src/three/garden-lighthouse.ts:390-395`. The GLB preserves a 9.649 × 34 × 9.49 world-unit envelope and 1:1 runtime scale (`src/three/garden-models.ts:229-250`).

The key visual operation is **successive contraction plus material/shape breaks**, not height alone: square, octagon, cylinder, open fire, figure. A projecting 7.64-unit gallery interrupts the taper at the square tier's head (`src/three/garden-lighthouse.ts:501-547`). Open brazier and figure then make the last four units porous and fine rather than another opaque block (`src/three/garden-lighthouse.ts:587-638`).

### 1.2 Base and promontory are one composition

The tower begins on a 2.5-unit stepped terrace rather than meeting terrain with a hard seam (`src/three/garden-lighthouse.ts:311-330`). That terrace itself sits four world units above the sea because the tower root is `y=2.55` while water is `y=-1.45` (`src/systems/garden-observatory-slice.ts:42-57`). The surrounding island then expands the monument's base from a 9.2-unit terrace to a roughly 40-unit shoal: the shoal radii are 19.6/20.5 and its Z scale is 0.72 (`src/three/garden-island.ts:549-560`). Four irregular rock tiers step inward from radii 18.4/16.8 to 8.1/6.1 while their top shelves rise from about 0 to 2.755 (`src/three/garden-island.ts:131-170`). Thus the lighthouse reads first as a tower, second as the crown of a whole landform.

The rock has a separate scale ladder. Sedimentary beds repeat every ~0.62 world unit, alternating proud/pale and recessed/dark courses (`src/three/garden-island.ts:182-195`). A single 4.2-unit exposed cliff face aligns those beds and uses one coherent geological plane rather than an all-round boulder border (`src/three/garden-island.ts:1743-1759`). Its fractured plates are instanced, share a base height, and receive a wet-to-pale vertex ramp (`src/three/garden-island.ts:1761-1802`). The long cut stair then joins waterline and terrace: from `(16.9,-5.79)` to `(-2,-4.6)`, width 1.55, tread 0.44, top `y=2.62` (`src/three/garden-island.ts:1833-1848`). Its cheek walls make it appear cut into the rock, not laid on top (`src/three/garden-island.ts:1898-1924`).

The separate tide-stain repeats the same integration principle on the masonry. Five pale salt courses occupy `y=0.24–2.40`, project only 0.07 from their terrace step, and merge into one draw whose range exposes the required count (`src/three/garden-tide-stain.ts:45-68`, `src/three/garden-tide-stain.ts:114-165`). These are scale-giving courses and a data reading, not decorative grime.

### 1.3 Controlled secondary reads and negative space

The signed contract gives the Pharos precinct exactly three secondary reads: pavilion, reflection pond, and signal mast; grove, stones, talus, cliffs, and tide courses remain landscape, while the cottage is a service building (`docs/pharosville/VISUAL_INVARIANTS.md:215-222`). Their scales stay far below the tower:

- Pavilion: an octagonal base radius 2.4, four 2.4-unit posts, and roof top around 3.625 local, placed at `(4.4,1.05,2.35)` (`src/three/garden-island.ts:1371-1400`).
- Pond: an ellipse from a radius-3.6 circle scaled to 0.68 in Z, centred `(1.2,5.2)` (`src/three/garden-island.ts:1414-1417`, `src/three/garden-island.ts:1493-1521`).
- Signal mast: 7.2 units high with its yard at 5.5 and half-span 1.2 (`src/three/garden-signal-mast.ts:42-46`), placed at `(7.2,0.98,3.2)` beside the pavilion (`src/three/world-renderer.ts:3275-3289`).

Relative to the lighthouse root `(-7,-1.25)` in X/Z, those centres are about 12.0, 10.4, and 14.9 world units away respectively (derived from cited coordinates). This is not a tight ornamental ring. The rules require unequal intervals and at least one wide dark arc, explicitly banning evenly spaced terrace props (`docs/pharosville/VISUAL_INVARIANTS.md:223-227`). Even the two path lanterns replace an earlier six-lamp run (`src/three/garden-island.ts:122-128`), and the keeper cottage has one lit window after deleting a three-lantern string (`src/three/garden-island.ts:1324-1367`).

### 1.4 Material/value contrast and the singular beacon

The fallback shell uses warm pale, mid, and shadow stone with roughness 0.88–0.96; the two pale stone materials carry only a 0.05 warm emissive whisper because the fixed camera sees the shade side (`src/three/garden-lighthouse.ts:340-361`). Bronze and gilt add controlled material contrast; only the gilt reaches metalness 0.85 and emissive intensity 0.08 (`src/three/garden-lighthouse.ts:362-382`). A sky-facing Fresnel rim, strength 0.10 by day and up to 0.18 at night, is injected into lit tower materials specifically so the tower separates from the sky (`src/three/garden-lighthouse.ts:183-220`, `src/three/garden-lighthouse.ts:263-275`).

The summit spends the sacred high-value accent. The toon flame is 2.4 × 2.9, uses cream → lantern gold → reserved vermillion, and reaches HDR ~2.3 at full night intensity (`src/three/garden-beacon-fire.ts:47-67`, `src/three/garden-beacon-fire.ts:197-203`). It never sheds at a quality tier even when embers and smoke do (`src/three/garden-beacon-fire.ts:146-155`). The tower also projects a 92-unit beam with a 4.2-unit terminal radius and pool at 86 units (`src/three/garden-lighthouse.ts:822-831`). This is why the Mole must have neither flame, halo, beam, searchlight, bright roof crown, nor vermillion: the night contract permits exactly one dominant light (beacon) and one secondary (moon road); every other glow is an ember (`docs/pharosville/VISUAL_INVARIANTS.md:189-207`). The palette itself reserves vermillion for the Pharos fire and danger semantics (`src/systems/palette.ts:27-35`, `src/systems/palette.ts:60-76`).

### 1.5 Whole-map survival

The loaded shell's 34:9.65 height-to-width ratio is ~3.52, and its gallery, tier contractions, and open crown alter the outer contour rather than relying on surface detail (`src/three/garden-models.ts:240-250`; `src/three/garden-lighthouse.ts:492-638`). Slit windows create a small vertical scale rhythm at local heights 5.4, 9.6, 11.2, and 21 (`src/three/garden-lighthouse.ts:446-474`), but are not necessary to recognize the tower. The GLB's 33,444 triangles buy close-range ashlar, reveals, quoins, colonnade, arcade, and statuary while its documented overview contract leaves the 34-unit silhouette untouched (`src/three/garden-models.ts:290-336`). That separation—outline first, surface second—is the transferable grammar.

## 2. Full specification: the Ethereum Mole

### 2.1 Form, orientation, and footprint

Use each selected `RimCove` mouth as the local origin and retain the existing dock convention: **local +X is seaward** (`src/three/garden-docks.ts:274-285`). Rotate the complete precinct by the authored shore bearing. This makes the same design valid on N, E, S, W, or INTERIOR-SHORE without mirroring bespoke geometry.

**Target overall envelope: 40 world units along the seaward axis × 34 along shore, from submerged toe to landward stair; maximum cap elevation 21.5 in dock-local Y.** The occupied solid area must be much smaller than that bounding rectangle because an open water basin is the centre of the plan.

Plan from land to sea:

1. **Landward civic apron, 26 × 10.** A broad, asymmetrical stair (7 units wide) arrives off-centre, then a 3-unit accessible ramp folds along one side. A 10-unit clear court separates gate and hall.
2. **Ethereum hall, 24 × 10.** Long axis follows the shore. It is a low ashlar guild/council hall with a deep hipped copper/slate roof, not a miniature Pharos. Put the campanile at one shoulder, outside the hall eave, preserving the existing successful sail-clear silhouette logic (`src/three/garden-docks.ts:682-700`).
3. **Inner basin, 18 × 14 of visible water.** Two unequal breakwater arms bracket it. The long arm projects 22 units seaward from the hall shoulder; the short arm projects 15. Their clear entrance is 7 units, angled 12° off the hall axis so it does not read as a symmetrical U.
4. **Engineered arms.** Each arm is 4.5–5.5 units wide, with a battered wet-stone toe, a dry ashlar walk, and 0.55-unit capstones. Terminate the long arm in a simple squared hammerhead, not a lantern tower. The void between arms is a secondary read; do not fill it with boats, kiosks, statues, cranes, or a second pavilion.
5. **Approach axis and gateway.** The water entrance, empty basin, off-centre stair, and hall door form one bent axis. A single thick lintel gate at the landward threshold compresses the arrival. It uses iron-dark and timber-dark, never vermillion. From sea, the eye reads “protected civic water → gate → hall → campanile”; from land, “gate → water court → open rim.”

The design is deliberately opposite the lighthouse:

| Pharos | Ethereum Mole |
| --- | --- |
| natural, irregular promontory | measured, battered civic masonry |
| one slender central vertical | broad horizontal enclosure plus one offset vertical |
| successive circular/polygonal contractions | rectilinear hall, open square belfry, unequal linear arms |
| pale crown against sky | mid-value stone and dark roof against sea/land |
| fire, smoke, halo, beam | no summit glow and no moving atmospheric effect |
| sacred terminal figure | useful bell and weather cap |
| landscape base spreads outward | void/basin is carved inward |

### 2.2 Vertical ladder

All elevations below are **dock-local Y**. The existing dock root is 0.2 above water and the present quay top is local `1.55`, hence 1.75 above water (`src/systems/garden-observatory-slice.ts:42-44`; `src/three/garden-docks.ts:217-219`).

| Mole stage | Top Y | Height above water | Silhouette purpose |
| --- | ---: | ---: | --- |
| submerged toe / first tide course | -0.2 to 0.35 | 0–0.55 | makes the engineered base visibly enter water |
| arm walk and quay | 1.55 | 1.75 | one continuous horizontal datum around basin |
| civic podium / stair landing | 2.8 | 3.0 | separates hall from working quay |
| hall wall cornice | 7.0 | 7.2 | long, calm primary mass |
| hall roof ridge | 9.2 | 9.4 | clears sails but stays lower than current campanile |
| campanile shaft cornice | 15.0 | 15.2 | narrow vertical marker; 3.8 × 3.8 shaft |
| open belfry head | 19.0 | 19.2 | four corner piers and a visibly empty centre |
| shallow hipped cap | **21.5** | **21.7** | terminal silhouette; no finial above 21.5 |

The current Ethereum precinct tops at 12.35 (`src/three/garden-docks.ts:682-700`), while the current general harbor contract says upper silhouettes span roughly 7.2–12.4 (`docs/pharosville/VISUAL_INVARIANTS.md:61-66`). The Mole intentionally exceeds that station range because it is the plate's second monument. Its 21.5 local top is still only 63.2% of the lighthouse's 34-unit local tower and 57.1% of the lighthouse's 38-unit water-to-tip rise. It may never grow to two-thirds of the Pharos's water-to-tip height (25.3 above water), even if a later asset author asks for more roof clearance.

### 2.3 Ground-plane integration and scale cues

Transfer the Pharos grammar without copying its geology:

- **Battered toe:** two continuous wet-to-mid stone faces rise from local `y=-0.2` to `0.75`. Keep them planar and tooled, not craggy.
- **Tide courses:** three horizontal masonry courses at centres 0.05, 0.45, and 0.90, each 0.22–0.28 high and proud by 0.06. They are decorative waterline weathering and carry no new analytical meaning; unlike the lighthouse's five PSI-driven salt courses (`src/three/garden-tide-stain.ts:52-68`), these never change count.
- **Capstone rhythm:** 1.2–2.4-unit unequal blocks, with every fifth joint omitted or doubled so the arm does not become a ruler-like stripe. Vertex-colour value shifts stay within `stone_dark`/`stone_mid`/`stone_pale` (`src/systems/palette.ts:67-70`).
- **Steps and ramp:** stair and ramp are cut into the podium and share its stone bucket. The ramp must terminate at the same court, not at a service back door.
- **Bollards:** eight total—five on the long arm, three on the short—at unequal spacing; iron-dark, low, and silhouette-safe. Do not scale bollard count with supply. Supply and concentration remain in the existing harbor channels and DOM record, as required by `docs/pharosville/VISUAL_INVARIANTS.md:96-103`.
- **One lit quay edge:** retain one continuous warm edge on the hall-side quay; it adds no water-light lane, matching the existing technique (`src/three/garden-docks.ts:1111-1120`). Do not outline both arms.

### 2.4 L2 relationship — one recommendation

**Recommendation: Ethereum stands alone.** `base`, `arbitrum`, and `polygon` become distant, self-standing harbors at their own mouths. They share no covered bridge, no Ethereum-campus flag, no miniature pavilion on the Mole, and no token “embassy” furniture. The Mole carries only the `ethereum` chain flag and Ethereum's existing supply/concentration reading.

Why:

1. Physical distance is the actual correction to the west-shore cluster; retaining symbolic L2 annexes would visually recreate the same hierarchy after moving the station meshes.
2. A compact multi-chain Mole would make remote L2 stations look like duplicates or outposts and weaken each mouth's required chain identity. The world contract says a harbor encodes its own chain supply and concentration through architecture/flag plus DOM parity (`docs/pharosville/VISUAL_INVARIANTS.md:96-103`).
3. The Mole needs isolation to become a monument. Its basin, hall, and campanile already exhaust its two secondary reads; L2 flags/furniture would turn civic clarity into a fairground.
4. Existing bridges are explicitly conditional on a nearby `annex-pavilion` within 20.5 tiles (`src/three/garden-docks.ts:1509-1528`). Retiring that relationship removes bridge geometry cleanly rather than preserving dead connective logic.

This cutover **requires an explicit invariant amendment**. Delete/replace the sentence requiring Ethereum's hall and campanile to read “with its L2 belvederes as one precinct through thick railed, covered bridges” at `docs/pharosville/VISUAL_INVARIANTS.md:71-74`, and delete/replace “the Ethereum precinct has a shared path and bridge-connected annexes” at `docs/pharosville/VISUAL_INVARIANTS.md:89-90`. Replace both with: “The Ethereum Mole stands alone as the ring's civic monument; L2 stations are self-standing distant harbors.” This is worth the trade because the old sentences codify the exact spatial cluster now being retired.

## 3. Attention budget and explicit shed list

### 3.1 What the Mole displaces

This is a replacement, not an additive precinct:

1. **Displace the entire current `boathouse-precinct` hall, moon-viewing deck, veranda, campanile, and four-step stair** authored at `src/three/garden-docks.ts:663-721`.
2. **Displace every Ethereum-to-L2 covered bridge** authored at `src/three/garden-docks.ts:1509-1583`; do not leave bridge stubs or paths pointing toward old annex positions.
3. **Displace the current three Ethereum dock lamp heads/reflection candidates with two shielded portal lamps**, one on each side of the landward gate. The current precinct asks for three lamp positions (`src/three/garden-docks.ts:1646-1660`). The Mole therefore removes one light/lane candidate rather than adding one.
4. **Displace the current empty moon-viewing deck with the enclosed water basin.** Both are horizontal pauses; only one survives.
5. **Displace current generic supply-scaled bollards and planks inside the Mole envelope** (`src/three/garden-docks.ts:352-366`) with the fixed eight-bollard civic rhythm and arm capstones. No generic plank scatter may be stamped on the monumental apron.
6. **Displace a bright campanile window row with a single unlit open belfry.** The current tower places three warm apertures around `y=9.2` (`src/three/garden-docks.ts:687-700`). The visible bell is dark bronze; the cap is not emissive.

### 3.2 Read count

The **Mole as a whole is the second monument**, with the campanile integrated into its primary silhouette. It carries exactly **two secondary reads**:

1. the enclosed, empty inner basin;
2. the thick landward gateway and bent approach axis.

Breakwater arms, steps, tide courses, capstones, bollards, bell, ramp, and flag are parts or scale cues, not free-standing reads. No statue, crane, pavilion, garden, beacon, clock face, or terminal lantern is allowed.

### 3.3 Night hierarchy and blur audit

- Two shielded portal lamps use the ordinary lantern ember gain; there is no Mole `PointLight`, halo, bloom-tuned shader, flame, smoke, beam, or water road. Existing policy applies a 0.38 gain to lantern/buoy lanes, spatially separates active pools by 8.5 units, and caps full-tier reflection lanes at 16 (`docs/pharosville/VISUAL_INVARIANTS.md:189-207`).
- One hall-side lit quay edge and a maximum of four narrow warm apertures share one emissive bucket. They do not register new water lanes, following the present lit-edge contract (`src/three/garden-docks.ts:1111-1120`).
- Use `stone_mid`, `stone_dark`, `timber_dark`, `iron_dark`, and a roof mixed from `shallow_teal` toward `stone_mid`; reserve `foam_white` for tiny capstone catches and `lantern_glow` for apertures. Use no vermillion (`src/systems/palette.ts:46-82`).
- In the ~16px blur audit, the lighthouse must remain the one bright, dominant vertical mass. The Mole should reduce to a lower dark horizontal bracket with one thin shoulder rise, separated from the lighthouse by a large uninterrupted dark-water interval. The empty inner basin merges with surrounding dark sea rather than becoming a bright courtyard. If capstones form a pale stripe, reduce their value contrast; if portal lamps merge into a third road, let one reflection lane stand down. The audit's required result—a large calm dark low-contrast region—is explicit at `docs/pharosville/VISUAL_INVARIANTS.md:235-239`.

## 4. Scale proof

### 4.1 Computed projection facts

Projection uses 32 × 16 tiles (`src/systems/projection.ts:1-2`), and world height shifts screen Y by `worldY × 16 × √3/2 × zoom` (`src/systems/garden-observatory-slice.ts:393-402`). The default view-height pivot is ~96.5 (`docs/pharosville/VISUAL_INVARIANTS.md:167-173`). Therefore:

- At the default landing frame, a 21.5-unit Mole cap occupies about `21.5 × √3/2 / 96.5 = 19.3%` of viewport height from local base; the 34-unit Pharos occupies about 30.5%. The Mole is large enough to read, but the tower retains ~1.58× the screen-height span before counting its higher island seat.
- At `zoom=1.05`, the threshold for the code's `explore` semantic view (`src/systems/garden-observatory-slice.ts:516-522`), the Mole's local rise projects to ~313 px. Belfry openings, bent axis, steps, and masonry courses can then become legible without being required for overview identity.
- At the four attract zooms 0.76/0.68/0.74/0.84, a 21.5-unit rise projects to ~226/203/221/250 px; the 34-unit tower projects to ~358/320/349/396 px.

Focused computation used:

```text
island (72, 78)
postcards [(79, 90, 0.76), (85.4, 61.6, 0.68), (46.2, 81.2, 0.74), (69, 77, 0.84)]
screen-height-px lighthouse [358.0, 320.4, 348.6, 395.7]
screen-height-px Mole       [226.4, 202.6, 220.5, 250.2]
height ratios local 0.63235; above-water 0.57105
```

These values come from the cited projection formula, the verified world lighthouse tile `(60,70)`, and the island offset `(12,8)` at `src/systems/garden-observatory-slice.ts:46-47` and `src/systems/garden-observatory-slice.ts:405-409`.

### 4.2 Read by viewing scale

**Whole-map framing:** read only three things: the 40 × 34 interrupted footprint, the dark U/bracket of unequal arms, and the offset campanile needle. Do not expect windows, bell, bollards, steps, courses, or the Ethereum mark to resolve. The Mole is the only harbor allowed this “civic enclosure + shoulder tower” macro-silhouette; the Pharos remains taller, paler, central-island-seated, and crowned by fire.

**Default landing (~96.5 view height):** hall roof, inner water void, long/short arm asymmetry, gate, and open belfry separate. The one Ethereum flag supplies identity; supply/concentration remain visible through existing harbor channels and DOM/ledger parity. The Mole should occupy about one fifth of viewport height if framed, versus roughly three tenths for the Pharos before its island elevation.

**Sailed-in / inspect:** masonry bond, capstone interruptions, tide courses, ramp/step junction, bollards, bell, roof gutters, door reveals, and four maximum apertures become the reward. The basin remains empty enough for a ship approach and must not acquire inspect-only clutter that changes its overview mass.

### 4.3 The four authored attract postcards

The four authored camera centres and zooms are fixed at island-relative `(island+7,island+12) @ 0.76`, map-relative `(0.61w,0.44h) @ 0.68`, `(0.33w,0.58h) @ 0.74`, and `(island-3,island-1) @ 0.84` (`src/systems/garden-attract.ts:9-24`). On the 140-square map with island tile `(72,78)`, those centres are `(79,90)`, `(85.4,61.6)`, `(46.2,81.2)`, and `(69,77)`.

Because Lane B owns the final mouth, visibility from a crop cannot truthfully be guaranteed here. The acceptance rule for each authored frame is instead:

1. **Tower past engawa, `(79,90) @ 0.76`:** the Pharos owns the foreground vertical. If the chosen mouth enters this crop, the Mole is a lower peripheral bracket and must not overlap the tower crown in screen space; if absent, that is valid negative space.
2. **Anchorage ma, `(85.4,61.6) @ 0.68`:** preserve the central calm-water read. A visible Mole sits on the rim as a dark enclosure, never in the open anchorage centre. Its two portal embers must not create a cross-frame light axis.
3. **Rim and cove, `(46.2,81.2) @ 0.74`:** this is the Mole's strongest possible postcard if Lane B selects a mouth in the crop. It may read as the second monument here, but the basin must remain visibly water and the campanile must remain below the Pharos's projected height whenever both appear.
4. **Dusk beam, `(69,77) @ 0.84`:** the beacon and 92-unit beam own attention (`src/three/garden-lighthouse.ts:822-831`). A visible Mole is a dark edge silhouette with two ember points maximum; absence from this tight island-centred crop is preferable to forcing it in.

Required implementation audit after Lane B fixes the mouth: project both cap bounds in all four camera poses and reject any mouth/orientation that (a) screen-overlaps the Pharos crown in frames 1 or 4, (b) puts the Mole in frame 2's calm centre, or (c) crops the campanile while leaving a bright quay edge floating. This is a placement acceptance test, not a request to retarget the authored postcards.

## 5. Concrete build decomposition and budget

### 5.1 Geometry ownership

Use the lighthouse's robust loaded/fallback pattern: attaching a checked model hides an aligned procedural shell while preserving shared anchors (`src/three/garden-lighthouse.ts:104-133`). The lighthouse manifest demonstrates a 1:1, base-centred, zero-texture checked GLB with explicit dimensions, anchors, and budgets (`src/three/garden-models.ts:229-288`).

**Keep procedural and runtime-authored:** submerged toe, quay slab, both arms, basin curb, steps, ramp, fixed tide courses, capstones, bollards, gateway, warm apertures/lamp heads, chain flag, selection/pick bounds, and a low-detail hall/campanile fallback. These pieces must adapt to shore bearing, water datum, station data, and quality tier.

**Candidate for one checked GLB:** the static civic superstructure only—hall shell/roof plus campanile shaft, open belfry, bell, cap, real reveals, block relief, gutters, and brackets. It must be deterministic, agent-authored, 1 model unit = 1 world unit, base-centred on the podium, zero textures, four material primitives maximum, and share exact `hall-door`, `flag`, `label`, `selection`, and `cap` anchors with the fallback. A failed or pending load leaves the 2,800-triangle fallback at the same silhouette; loaded and fallback shells are never intentionally visible together.

Do **not** put the arms, basin, tide courses, lights, flag, or data-reactive pieces in the GLB. A checked asset is justified only for close-range architectural surface, never for the macro plan or identity contract.

### 5.2 Triangle target

Loaded recurring target:

| Part | Technique | Triangles |
| --- | --- | ---: |
| submerged toe, shoal lip, two battered arm masses | procedural merged indexed geometry | 2,400 |
| quay, court, steps, accessible ramp | procedural merged/instanced | 1,600 |
| capstones, three tide courses, drains | procedural merged/instanced | 1,200 |
| eight bollards, gateway, mooring stairs | procedural instanced/merged | 720 |
| civic hall shell, roof, reveals, restrained ashlar | checked GLB | 4,800 |
| campanile shaft, belfry, bell, cap, brackets | checked GLB | 6,800 |
| chain flag cloth and fallback mark | existing flag geometry path | 128 |
| four apertures and two lamp heads | merged simple geometry | 96 |
| **Loaded total** |  | **17,744** |

Procedural/data-reactive share is 6,144 triangles; checked GLB share is 11,600. The fallback frame is 8,944 triangles after adding the 2,800-triangle procedural superstructure and omitting the hidden GLB. These are hard authoring caps, not estimates to round upward after export.

For comparison, the current measured scene is ~335,105 triangles with a 500,000 ceiling (`docs/pharosville/VISUAL_INVARIANTS.md:280-285`), and the lighthouse alone is 33,444 triangles in seven draws (`src/three/garden-models.ts:290-296`). Because the Mole replaces the existing precinct and bridges, do not claim all 17,744 as net-new scene cost; measure the final net after removal.

### 5.3 Draw-call/material plan

Retain the existing harbor material-bucket model—timber, stone, metal, wall, roof/trim, window, accent—which is already merged by category (`src/three/garden-docks.ts:329-340`). Target **eight visible Mole draws maximum**:

1. vertex-coloured stone/toe/quay/steps/courses/capstones;
2. hall wall/ashlar;
3. dark roof and trim;
4. timber gateway/doors;
5. iron/bronze bell, bollards, gutters;
6. all warm apertures, lit quay edge, and two lamp heads;
7. Ethereum flag cloth;
8. Ethereum flag mark/fallback initial.

The GLB may expose at most four primitives—wall, roof, timber, metal—and no texture. Procedural pieces join the corresponding global harbor buckets where possible. [INFERENCE] If the asynchronous GLB cannot join those prebuilt global buffers, its four primitives are the conservative recurring increment; the emissive and flag paths already exist. Verify with the real-GPU preview/resource counter after integration, not Playwright. The fallback must merge static primitives just as the lighthouse collapses 40+ parts to about ten geometries by material (`src/three/garden-lighthouse.ts:640-649`, `src/three/garden-lighthouse.ts:711-742`).

## Handoff acceptance checklist

- Mole envelope ≤40 × 34; cap exactly 21.5 dock-local Y and ≤21.7 above water.
- Inner basin remains 18 × 14 of visible water; arms remain unequal (22 vs 15 projection).
- No flame, halo, beam, summit light, vermillion, clock, statue, crane, or terminal lantern.
- Exactly two secondary reads: basin and gateway/axis.
- Exactly two portal lamps replace the current three precinct lamps; one lit quay edge, four apertures maximum.
- `base`, `arbitrum`, and `polygon` are distant self-standing stations; no bridges, annex flags, or L2 furniture at the Mole.
- Amend the two bridge-connected-precinct invariant sentences named above.
- Loaded total ≤17,744 triangles, fallback ≤8,944, eight Mole draws maximum, four GLB primitives maximum, zero new textures.
- Audit whole-map, default, sailed-in, all four authored postcards, and ~16px blur after Lane B fixes the mouth; preserve one dominant bright tower mass and a large calm dark region.

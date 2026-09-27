# Council review: art direction and taste

## Verdict
The direction is right, and several rulings pick the most beautiful option: side light (K10), the real moon in frame (K3/K4), surface-state water (K7), the beam as breath (K9), nobori (K28), the stone garden (K29) and the torii cut (K26). As written, though, the plan will most likely produce a correctly lit, well-composed diorama rather than a print.

The biggest risk is that there is no integrated first print:
- **G1** picks the seat in the old light, on a landform, flag envelope and threshold lighting that W2 and W4 later replace.
- **G2**'s value gate depends on W3 water that G2 cannot wait for.
- **The "hand" is never specified.** Flat shading is everywhere, lamps glow by day and materials drift toward PBR. The new side light will make the asset-pack look louder, and the toy objects only change in the last craft wave.

## Findings

### Blocker

**1. G2 cannot pass as written, and it deadlocks with G3a.**
- **Problem:**
  - G2 requires "value-plan targets (§1) met at noon, golden and night" and "H1–H4 captured".
  - H1 needs W3 water-1/5. H2 needs W3 water-1/2 plus W4 flags. H3 needs the W3 road and reflection (§1, lines 84–87).
  - The bottom row and half the middle row of the ninths are water that W3 rewrites; golden water today is L\* 21 under an L\* 72 sky (§0 fact 3).
  - §9 makes G3a wait for G2 (`G2 --> G3a`, line 475).
  - So either G2 stays red, which by §5's rule stalls W4 and W6, or the light lane tunes rigs to hit the ninths over the old water and W3 then breaks them again.
- **Evidence:** the previous review flagged the same class of error: "the dependency graph cannot pass its own gate" (`agents/pharosville-reborn/02-plan-review.md` §2).
- **Edit (§5 and §9):**
  - Replace G2 and G3a with one gate: "**Print gate** after W2 + W3 + W4.F3 (the ink far fleet sets the right-middle ninth): §1 targets met at three viewports; H1–H4 captured; operator art review against the H-frames."
  - The current W2-only checks (beacon brightest, moon disc ≤ L\* 80, ALU) and the G3a list become entry criteria.
  - Delete `G2 --> G3a`. W3 starts at G1.

### Major

**2. G1 is a skeleton that later waves invalidate, so the operator's first look is not a print.**
- **Problem:** the seat is chosen at three disadvantages:
  - **(a) Before the crag.** W4.P1 moves the tower root from 2.55 to 8.55 u, cuts a window register and adds a rock diagonal at least 18 % of tower height (pharos-2 How 4 and Acceptance). The lane itself says "the safe rectangle must include the new headland diagonal" (pharos.md:421).
  - **(b) Before the final flag envelope.** The solver routes around a flag tip hard-coded at y 26 (`camera.ts:70-79`), which harbour says "could change the rest seat" (harbour.md:90, :222).
  - **(c) Under the old back-lit sun.** Today the visible faces are "lit only by fill" (light.md:4), so "bottom-left ≤ 18 at noon" passes at G1 and fails once W2.1 lights the threshold (Finding 4).
  - Line 228 cites the previous lesson, but that lesson's slice was "camera + sea/sky + hero reflection + island/shore" (02-plan-review §5). W1 contains none of these.
- **Edit:** rename W1 "The First Print" and change or add these rows:
  - **W1.9 Headland landform** (pharos-2 How 1, 3, 4: `headlandHeight`, delete the box, keep −6 u, root 8.55). Strata, moss and benches stay in W4.P1.
  - **W1.3** becomes "harbour-2 nobori, static: ≈1.0–1.2 × 3.0–3.8 u, tip ≤ 13.7 u, kinari field, ink C ≤ 0.10". W4.H2 keeps only the wind.
  - **W1.10 Light sketch, constants only:**
    - `NOON_BEARING` to −45°, with the rim light reading the live pose (light D6).
    - Golden `hemiGround` to the night ground value (printmaker sub 3).
    - `uHazeStrength` 0.42 → 0.12 (`garden-sky.ts:590`).
    - sky-6 night beat colours.
    - Tower window day emissive 0 (`garden-day-cycle.ts:405`) and statue day gleam 0 (`:376`).
    - Hero reflection clamp 0.85 → 0.6 (critic-7).
  - **G1** captures the H1–H3 hashes for seats A and B plus a seat C at yaw 32° (W1.1 already plumbs yaw).
  - Taste call: prefer B (the engawa seat) if its near field passes the finish check in Finding 4. The deck edge is the strongest "you are inside" device, and B carries K20's last lamp.

**3. The Hour-Print has no "hand", and side light will make the asset-pack look louder.**

The plan says what the print is made of (light, air, composition) but not the finish every subsystem must obey. Three gaps:

- **Shading mode.**
  - Nearly every organic and prop material sets `flatShading: true`: `garden-flora.ts:130`, `garden-island.ts:568,1350`, `garden-rim-mesh.ts:980`, `garden-harbor-batch.ts:246-250`, `garden-lighthouse.ts:406-418`.
  - Fill-only light hides the facets today. W2.1's raking key gives each facet its own brightness, which will read as mosaic [INFERENCE].
  - W1.4's pads are garden-2's `IcosahedronGeometry(1,1)` lobes fed through the flat-shaded `createSpeciesBatch` (garden-2 How 1 and 6). On the threshold pine, the nearest object in the frame, those pads will look like cut gems [INFERENCE].
- **Daytime glow.** Lamps and windows emit at noon:

  | Source | Day emissive | Anchor |
  | --- | --- | --- |
  | Station windows | 0.35 | `garden-day-cycle.ts:385` |
  | Harbour lanterns | 0.18 | `:381` |
  | Island lanterns | 0.22 | `:412` |
  | Tower windows | 0.18 | `:405` |
  | Statue | 0.22 | `:376` |
  | Engawa tōrō | always-lit box | garden D10, `garden-rim-mesh.ts:1102` |
  | Stern lantern cores | 0.05 | fleet-craft D6 |

  Only the tower and statue are fixed, and only in W4.
- **Specular drift.** W4.P6 (glazed kawara, wet sheen) and W3.7 (caustics) push toward photorealism, which is the tech-demo anti-reference.

**Edit:** add §1.1 "The hand", with each rule checked at a gate:
1. Organic masses (pads, rocks, rim land, crag, hills) are smooth-shaded. Their value comes from authored planes (pad crown and underside vertex colour), not from facets. Hard normals only on architecture and hulls. Check: land and foliage high-frequency energy at `#t=12.25` after the sun turn is no higher than today.
2. Nothing glows by day except the beacon's mirror glint. A lamp turns on only by kindling.
3. Specular is drawn, not simulated: water glints and roads, the wet waterline band, and the statue's sun-side line. Props and roofs use `envMapIntensity` ≤ 0.3.
4. Detail goes where the eye goes (tower courses, hero boats). Water, sky and land masses are flat fields.
5. Only `vermillion` and `lantern_warm` exceed OKLCH C 0.12.
6. Edges are found against the sky near the viewer and lost in the air far away. No 1-px line at rest.
7. People are implied by light and craft, never shown as figures at rest distance.

Also add **W0.22 "No daytime glow"** (the constants in the table, with the engawa tōrō chamber becoming a keeper fixture), and change W1.4 to "pads smooth-shaded".

**4. K2 describes the threshold pine from above, and the new sun will light it.**
- **Problem:**
  - "Pads occupy the lower-left corner zone" (line 125) puts them below eye level, so the viewer sees their tops. garden-1 anchors the pads at (0.07w, 0.88h) at 14 u depth, about 4 u below a 15 u eye [INFERENCE from vFOV 32°, pitch 3°].
  - light-1 makes noon pure side light and puts the golden sun "behind the viewer's right shoulder", 132° from forward (light.md:106, :114-118). The pad tops are lit exactly when the bible wants the corner darkest (bottom-left at dusk = 10). K2 only specifies a noon value.
  - Breath is an orbit: yaw, pitch and distance change, then the eye is recomputed (`world-renderer.ts:5065-5070`). garden-1 measured about 375 px of swing for a raw 14 u object at ±2° (garden.md:126). K16's ±0.8° still leaves roughly 100–200 px [INFERENCE].
  - camera-6's 3 u eye rise moves a pad 10–14 u away through about 11–17° of the frame.
- **Edit (K2):**
  - "A rooted kuromatsu **seen from below**: the trunk enters from the lower-left edge, and the lowest pad crosses the left or upper-left edge at or above eye height, so its undersides show (art-director-1 centroid ≈ (0.06, 0.18))."
  - "The lower-left corner is the shaded moss bank or deck edge under the canopy. An off-frame caster behind-right of the seat (an eave or cedar group, inside the shadow frustum) keeps the threshold shaded from 10:00 to sunset."
  - Acceptance at `#t=12.25` **and** `#t=17.6`, after the sun turn: bottom-left ≤ 18 and ≤ 14 respectively.
  - The corner holds at breath extremes and through the arrival rise. Either author the rise as a reveal, or make the rest breath an eye-fixed pan with no dolly.
  - The pine, deck edge and tōrō show no facets at 1600×1000.
  - A side benefit: the moon rising among the left ridges will pass behind the pine.

**5. O15 asks the operator to approve a print rung that the waves don't build.**
- **Problem:**
  - The printmaker's rung 2 explicitly includes "2 at golden/blue/night", i.e. the keyline (printmaker.md:85).
  - No §5 row implements printmaker-2. §1 calls it "optional" (lines 65–66), and §7 defers only "keyline every beat".
  - Rung 1's washi (printmaker-7) is also unscheduled (K41). What actually ships is roughly rung 1.5, labelled rung 2.
- **Edit:** add "W2.16 Sky-contact keyline at golden, blue and night only (ink 0.5/0.5/0.45, faded by fog, fused first in the grade pass), shipped as an A/B at the Print gate with a 2560×1440 rigging check and the W0.1 DPR-2 cost." It is the one device that makes a still read as a print rather than a render, so the operator should see it. If not, rewrite O15 as "Rung 1 + night law + printed moon".

**6. The tower's dress: fix its finish early and keep its identity.**
- **Problem:**
  - The tower is 40–45 % of the frame height in every hero frame.
  - The "Italianate hotel" read is finish, not form:
    - amber arches by day (`garden-day-cycle.ts:405`, 0.18 on `#ffbe6e`; pharos D4);
    - cream stone `#f7edca` (pharos-5);
    - a 36-window grid (pharos D3);
    - a self-lit gilt statue (`:376`).
  - All of these fixes wait for W4.P1–P3, except the night statue (W0.7).
  - Japanising the tower would swap one costume for another. Shin-hanga already solved this: Yoshida printed the Sphinx by day and by night (1925) and made six Taj Mahal prints at different hours ([academia.edu](https://www.academia.edu/36710837/The_Art_of_Two_Easts_The_Great_Sphinx_on_the_Woodblock_Prints_of_Hiroshi_Yoshida), [artelino](https://www.artelino.com/articles/hiroshi-yoshida-auction-1700.asp)).
- **Edit:**
  - Add to §1: "The Pharos is the one foreign monument, printed in the garden's hand, as Yoshida printed the Sphinx and the Taj Mahal hour by hour: Hellenistic form kept, weathered neutral limestone, dark window openings by day, four stair embers by night, a bronze god. No Japanese restyling."
  - Move pharos-5(e) and pharos-7's day gleam into W1.10, the landform into W1.9, and the stone colour retune (pharos-5a, `#e4dfd2`) into W2.1.

**7. K20 contradicts itself and puts a walking figure in the flagship ritual.**
- **Problem:**
  - K20 (line 141) orders the beacon first. pharos-4's stair lights *are* the keeper climbing.
  - Then it shows the keeper "only on the island path", lighting tōrō. In life-4's own picture the island lamps come *before* "the beacon takes over the night" (life.md:189).
  - Meanwhile the rim lamps light themselves with no agent, which life D6 calls a defect.
  - The figure is a 1.7 u robed walker with a 0.9 s stride at 25–35 px, which reads as a game NPC. ambient-journey-5 rejected a figure as fantasy-village lore (:222), life-4 already had to strip the hat as costume, and PRODUCT lists "decorative lore, agent roleplay" as anti-references.
- **Edit:**
  - K20 → "No figure. The fire climbs: four stair embers rise one per breath, the lantern catches over three breaths, then lamps kindle outward across the water in distance order (ambient-journey-5 timing), some coves dark (harbour-3), and the engawa tōrō beside the viewer lights last. The keeper is implied by the rising lights. Reverse at dawn."
  - W5.4: drop life-4's figure.
  - W5.1 (line 354): the dawn skiff drifts lantern-lit, with no visible sculler.

**8. G4 rewards event density that the plan forbids.**
- **Problem:** "≥ 3 distinct gifts separated by ≥ 6 min" in a 30-minute watch (line 369) against K21's ≤ 6 rituals in 24 h, ≥ 8 min apart (line 142):
  - A random 30-minute window averages 6/48 ≈ 0.125 rituals, so the gate pushes implementers to add events.
  - "≥ 6 min" also contradicts K21's "≥ 8 min".
- **Edit (G4):** use life-1's own acceptance (life.md:113-114): "A 45-minute watch at local 17:40–18:25 logs the heron leaving and the kindling ≥ 8 min apart, with no simultaneous foreground events. A 30-minute noon watch logs at most one decorative gift."

**9. The whole-map re-pitch is ruled and recommended but never scheduled.**
- **Evidence:** K13 (line 135) and O14 (line 177) choose camera-5, but no §5 row cites camera-5. Only the coast (W3.6) and the sky step (W0.19) exist. `wholemap-noon.png` is still the board-game slab.
- **Edit:**
  - Add "W3.10 Whole-map as a kasumi chart (camera-5): `edgeHiddenZoom`, a two-segment pitch curve from 3° to 38°, and plate-distance haze as a `gardenAerial` parameter. Owners: camera and sky."
  - Add to the Print gate: "`cam=0,0,0.28` shows no plate edge or skirt".

**10. Costume accumulates while the torii leave.**
- **Problem:**
  - W4.P5 (line 341) audits only the torii.
  - Meanwhile each station gains a nobori, a kasuga lantern, noren, a kumiko window, and charred cedar with kawara (W4.H1–H4, harbour-3). Nobori are themselves shrine-approach and festival banners.
  - The island gains raked rings, a suhama beach and a triad. The world gains a keeper and a sculler, and the caption gains a 72-kō suffix.
  - K28's "roughly critic-3's ×2.4 area" is ambiguous. critic-3's ×2.4 multiplier gives the Ethereum flag about 4.6 × 3.1 u (critic.md, critic-3 How 2), while harbour-2's own banner is about 1.2 × 3.8 u (harbour.md:106). The ruling roughly triples the banner area, adding about 12 tall verticals against "one vertical, the tower" (art-director-7).
- **Edit:**
  - W4.P5 → "Costume audit of the whole rest frame at G3b. Every cultural object must also do a job (identity, light, landing). At most one such object per station is readable at rest. Noren and kasuga detail appear only at close LOD. The caption carries one poetic clause at a time, and the kō suffix shows only on the day a kō changes."
  - K28: replace the scale clause with "harbour-2 dimensions: ≈1.0–1.2 × 3.0–3.8 u, tip ≤ 13.7 u, Ethereum as a pair."

### Minor

**11. The targets contradict the hero frames and miss two of them.**
- **(a)** Night "no water band > L\* 10" (line 98) forbids H3 and the bible's named secondary light, the moon road. Replace with: "no world-fixed or horizontal band > L\* 10; the moon road is the only water feature above L\* 10, peaks at ≤ L\* 60, and reads as a column toward the viewer."
- **(b)** There are no dawn or blue rows, although H4 and H2 are hero frames and blue is the one hour that already works.
  - Add a Blue row: "≤ 4 lit tower openings; land darker than sky; rose-over-slate band on the side away from the sun; no ninth more than 5 L\* worse than `blue.png` outside the corrected cells".
  - Add a Dawn row: "crown hue 20–40°, base 200–240° (art-director-8); lit/shade ratio ≤ 1.3".
  - Add "golden lit/shade ratio ≥ 2.0" (light R3, light.md:291).
- **(c)** At TREMOR the far ridge disappears (data-poetry-1: far threshold 0.6; STEADY +0.57, TREMOR 0), and W1.8's peak beside the crown goes with it. Capture the H-frames on a pinned STEADY fixture, plus one TREMOR check at r ≥ 0.8.
- **(d)** K6 silently removed art-director's "kasumi band A" from H2. Either add "(c) a dusk band from sunset to nautical dusk, under the same rules as the dawn band", or restate H2's needs as sky-2 air plus the W4.F3 ink fleet.
- **(e)** Add a notan test: a 3-value posterise of each H-frame at 16 px blur. The ninths cannot see a tower that is only about 6 % of the frame width.

**12. K29 has no site, and both proposed sites conflict.**
- data-poetry-2's site (a), the island court, is given to garden-master-6 and garden-5 in K30.
- Site (b), the engawa shade, is the threshold's dark cell (bible 15/10/3), and 88 pale stones would lift it. data-poetry itself warns the stones "can become a carpet".
- **Edit (K29):** "On land at the Wreck Shoal shore, outside the rest frame; reached by the Wreck/Stone Memorial postcard and `sel=grave.*`."

**13. W4.F8 brings back the 1-px lines that W0.4 deletes.** fleet-craft-8 builds hero rigging from CPU-written `LineSegments`, notes the 1 px aliasing risk, and is accepted only at 2560×1440. **Edit** its acceptance to: "at the 1600×1000 rest, no rigging line reads as a scratch at 100 %, with alpha faded by projected width; otherwise defer."

**14. Golden-hour effects were designed for the old back-lit sun.**
- fleet-craft-4's acceptance ("`#t=17.6`, near-left sails warm") and garden-2's golden pad-rim glow (`dot(-V, L)`) have no light to transmit once the sun is behind the viewer (fleet-craft cross-lane notes: backlit sails "move mostly to dawn").
- **Edit:** re-accept W4.F4 and W1.4's rim light at `#t=5.75`.

## Missing
- **pharos-8, "The beacon lights its own mist".** 0 draws and under 0.05 ms, but in no wave. It is the "light in the air" that makes H3 feel like a lighthouse night. Add it to K5's parameter list and to W2.4 and W2.11.
- **garden-master-3's time on a near surface.** The pine's shadow, or dappled sun, sliding over the engawa boards. It needs the near caster inside the shadow frustum ("verify the near caster margin"). Belongs in W1.5 or W2.1 if seat B is chosen.
- **sky D9: cloud shadows from an empty sky.** The water carries cloud shadow at 0.34 (`garden-water.ts:2087-2088`) while no clouds render. Add to W0 as a subtraction until W5.11 lands.
- **H6 "The keeper's round".** The one ritual five lanes converged on has no acceptance frame. Add a motion sheet at `#t=18.3` with a crown and rim clip.
- **The sound lane's costume exclusions.** sound-3 excludes the in scale, koto idiom, shakuhachi, temple bell, shō and taiko; sound-5 limits species. Write both into the W7.5 and W7.3 acceptance, and add the timbre and species review sound asked of the art-director and garden-master lanes (sound.md:241, :401) to G6.

## Cut or demote
- **W3.7 caustics:** cut. They have no print equivalent and add high-frequency detail to the shore the plan is trying to calm.
- **W4.P6 material ladder:** demote to after the Print gate, and limit it to value shapes (a darker wet band, flat grey kawara) with no glaze sparkle.
- **life-4's figure and the dawn skiff's sculler:** cut (Finding 7).
- **W5.7 fireflies, rising fish rings and visible koi:** demote to after G4. Ship leaf fall and the skein first; W5 already adds a heron, skiff, crossing, keeper, moonrise and meteor.
- **W4.F4 golden sail transmission:** demote to a dawn-only effect.
- **K24's always-on kō caption suffix:** show it only on the day a kō changes.
- **W4.F8 standing rigging:** conditional on Finding 13.

## Five edits
1. **§5/§9:** merge G2 and G3a into one Print gate after W2 + W3 + W4.F3, delete `G2 --> G3a`, and measure the §1 targets and H1–H4 only there, with an operator art review.
2. **W1 becomes "The First Print":** add W1.9 (the headland landform), change W1.3 to the final static nobori, add W1.10 (the light-sketch constants, including day window voids and statue gleam 0), and have G1 capture H1–H3 for seats A, B and C.
3. **Add §1.1 "The hand"** (the seven rules), W0.22 "No daytime glow", and "pads smooth-shaded" in W1.4.
4. **Rewrite K2 and W1.5:** the threshold pine seen from below, an off-frame shade caster, a golden bottom-left ≤ 14 target, a corner check at breath extremes and through the arrival rise, and a near-field finish check.
5. **O15 and W2:** add W2.16, the sky-contact keyline A/B at golden, blue and night at the Print gate (or relabel O15 as rung 1 plus the night law), so the operator decides whether this becomes a print.
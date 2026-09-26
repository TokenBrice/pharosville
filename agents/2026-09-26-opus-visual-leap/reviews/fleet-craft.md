# Fleet craft — ship form, sails, identity, LOD, materials & massing — fleet-craft

## Verdict
The fleet reads as signage: flags and cards on sticks, not cloth on rigged boats. The cause is mostly one mistake in the geometry. Every `rectangle` sail (bezaisen + takasebune, about half the fleet) is built from the mast outwards along the keel, with a spar at the head and another at the foot. The result is a framed banner hanging off one side of a pole (`noon.png` left cluster; the "X" sail at ~260,640). The triangle rigs (kobaya, twinhull) already read as boats in the same frames, which shows the fix is geometry, not more detail. The dye pipeline adds a second problem. It lerps toward warm cream in linear space, then pulls chroma toward grey, which turns blue issuers (+13° hue shift, 39 % of their chroma kept) into lavender. It leaves 34 % of cloth grey, 13 % forced black, and every sail inside L 0.54–0.73. Beyond 150 u the far LOD draws pale floating planks with cards, not silhouettes (`golden.png` right). The leap is to hang real cloth, dye it from one book, and let the far fleet recede into ink.

## What I looked at
- **Baseline frames:** `noon.png`, `golden.png`, `night.png`, `selected-ship.png`, `wholemap-noon.png`, `noon-1440p.png`, plus metrics in `golden.txt`.
- **Crops of the baselines** (`outputs/opus-review/fleet-craft/`): `crop-noon-left.png`, `crop-noon-right.png`, `crop-noon-near.png`, `crop-golden-left.png`, `crop-golden-right.png`, `crop-1440-left.png`, `crop-1440-right.png`.
- **My captures:**
  - `golden-3200.png` at 3200×2000 `#t=17.6`, tier `full` on the retry; the first attempt at `recovery` was discarded. Crops: `g3200-left.png`, `g3200-near.png`, `g3200-right.png`.
  - `census-noon.png` with `--draw-census`, tier `full`. It gives per-batch triangles: near hulls 75.8k + near sails 10.4k; far batches 3.3k in total; lantern cores 2,928 tris ≈ 244 discs.
  - `near-noon-z2.png` came out at tier `recovery` and the framing was wrong. I use it only for the qualitative near kobaya/scow read.
- **Measurements I ran:**
  - A value-plan L* over the 3×3 grid: noon right-middle is **77** against the bible's 42; the far-fleet band (y 520–620, x 960–1520) averages 68.
  - A dye census that replicates `gardenSailClothColor` over all 256 entries in `data/brand-colors.json`.
- **Code read:**
  - `garden-ships.ts`: `GARDEN_SHIP_RIGS` :213-283, cabins :288-300, lanterns :377-416, hull paint :534-594, `createFleetBatchGeometry` :1754-1970, `createFarFleetGeometry` :1973-2035, `createHullShape` :2429-2480, `createSailGeometry` :2594-2698, `bakeSailVertexColors` :2722-2754, fleet lanterns :1482-1664, hero tint :1132-1135.
  - `garden-fleet-batch.ts`: tints :58-62, weave :231-265, mark presence/LOD :279-292, `SAIL_LOCAL_DEFORM` :678-712, strake :775-778, `patchSailAtlasMaterial` :887-1054, materials/far :1167-1253.
  - `garden-sail-texture.ts` (all of it); `ship-visuals.ts` :161-180; `stablecoin-ship-branding.ts` :85-104; `garden-day-cycle.ts:423`; `camera.ts:37-39`.
- **History:** `decision-ledger.md`, `fleet-visuals.md`, `fleet-density-strategy.md`, and reborn plan §W3.

## Spell-breakers (defects)
1. **Square sails are flags or hanging scrolls, not sails.**
   - *Where:* `createSailGeometry` builds the `rectangle` leech at `x ∈ [0, width]` (`garden-ships.ts:2608-2612`), so the cloth starts at the mast and extends one way along the keel. `hasSpars` then adds a head spar *and* a foot spar (`:2638, :2670-2686`), which frames the cloth top and bottom like a kakejiku. The identity sail is scaled 1.2× (`:1957`).
   - *Frames:* `crop-noon-left.png` (the "X", "S" and ¥ cards), `crop-noon-near.png` (the takasebune's pink card), `g3200-left.png`. Kobaya/junk triangles in the same crops read as boats.
   - *Why it breaks the calm:* the harbour reads as a trade fair of placards.
   - *Fix:* idea 1. *Cost:* S–M.
2. **The far fleet is floating planks with cards.**
   - *Where:* `createFarFleetGeometry` extrudes a full-length outline 0.72 deep whose deck face catches the sun, and adds a flat `PlaneGeometry` sail offset to one side of the mast (`:1988, :2014-2017`). The far material still paints the mark at 45 % (`MARK_MIN_PRESENCE`, `garden-fleet-batch.ts:283, :990-991`).
   - *Frames:* `crop-1440-right.png` and `g3200-right.png` show long pale/orange boards, some with no visible sail when the quad is edge-on.
   - *Value:* the band reads pale, 68 L* at noon, where the value plan wants 42.
   - *Why it breaks the calm:* it reads as a lumber yard, and the far fleet becomes a carpet of light specks instead of a receding mass.
   - *Fix:* idea 3. *Cost:* M.
3. **The dye pipeline produces lavender and grey noise.**
   - *Where:* `gardenSailClothColor` lerps toward `#f4ecd8` in **linear** RGB (`garden-sail-texture.ts:95`), applies a luminance floor, then pulls 30 % toward luma (`:103`), with the pirate branch on top (`:104-115`).
   - *Measured over 256 brands:*
     - Cloth chroma median is 0.043, against the issuers' own 0.117.
     - 88 cloths come out with C < 0.03, i.e. effectively grey.
     - 33 cloths are forced near-black.
     - L p10–p90 is 0.54–0.73, compressed from the brands' 0.28–0.76.
     - Blue issuers (H 230–300) rotate +13° toward violet and keep 39 % of their chroma.
   - That is the periwinkle/lilac cast in `noon.png` right-middle and in `crop-golden-left.png`.
   - *Fix:* idea 2. *Cost:* S.
4. **Gingham weave in the resting frame.**
   - *Where:* the weave reaches full strength at zoom ≥ 1.12 (`garden-fleet-batch.ts:241-243`), but the rest zoom is now 1.15 (`camera.ts:39`; `defaultCamera` at 1600×1000 returns 1.15). The 14×19-thread shading is therefore always on at rest.
   - *Frames:* the checker is visible on the pink sails in `g3200-left.png` (~700,165–270; ~515,405–485) and faintly in `crop-golden-left.png` (~700,60).
   - *Why it breaks the calm:* the cloth reads as tablecloth or window screen.
   - *Fix:* idea 5. *Cost:* S.
5. **At golden hour, sails glow in their own cold dye.**
   - *Where:* the backlight is `outgoingLight += wrap * diffuseColor.rgb * uBacklight` (`garden-fleet-batch.ts:1044-1045`). There is no sun colour and no view term. It also runs on the far cards (`:1221`).
   - *Frames:* `golden.png` and `g3200-right.png` show lilac/periwinkle cards sitting unlit in an orange world. They look pasted on.
   - *Fix:* idea 4. *Cost:* S.
6. **Black discs float off every stern by day.**
   - *Where:* there are 244 lantern cores (census: 2,928 tris ÷ 12). The core material is `color:#000000` (`garden-ships.ts:1527-1532`) and its day emissive is 0.05 (`garden-day-cycle.ts:423`). Every family shares one `STERN_LANTERN` at x = −3.05 (`:377`), so on the scow (stern −2.58) and on short `hullForm.length` hulls the disc hangs in the air.
   - *Frames:* black dots at ~568,103 / ~752,108 / ~1147,143 in `crop-noon-left.png`, ~683,283 in `crop-noon-near.png`, ~435,385 in `g3200-left.png`.
   - *Why it breaks the calm:* the ships look fly-specked.
   - *Fix:* idea 7. *Cost:* S.
7. **The bezaisen (about 25 % of the fleet) is a box on a bathtub.**
   - *Where:* the plan is 6.93 × 4.0, i.e. L/B 1.73 (`garden-ships.ts:2437-2440`); a real bezaisen is about 3.5–4. The stern castle is a 2.2 × 2.4 × 2.75 cube (`:297`) that dominates the silhouette.
   - *Frames:* `g3200-left.png` (~310–450,420–510; ~1000–1090,420–500) and `crop-noon-left.png` read as toy tugs.
   - *Fix:* idea 6. *Cost:* M.
8. **The strake is a neon rim, and hero hulls are painted purple.**
   - *Where:* the strake is the full issuer primary × `GUNWALE_TINT` 1.25 (`garden-fleet-batch.ts:60, :775-778`; `garden-ships.ts:648-651`). Hero hulls lerp 30 % toward the brand (`garden-ships.ts:1132-1135`), against the batch's 0.12 whisper (`:576`).
   - *Frames:* `crop-noon-near.png` (~240–390,140–240 and ~570–700,190–240) shows violet hulls with bright blue-violet rims next to the island. After vermillion they are the loudest chroma in the near field.
   - *Fix:* see Subtractions. *Cost:* S.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### fleet-craft-1 ★ Re-hang the square sails: cloth on a yard, not a flag on a pole
- **Picture:** Each bezaisen and takasebune carries one broad sail. It hangs from a dark yard that crosses the mast, is braced at an angle to the keel, and swells forward. Its foot curves up between two sheeted corners, so the bottom edge is a soft catenary instead of a ruler line. From across the harbour you see sailing vessels, the silhouette of a Hiroshige boat, and the mon rides the curve of the cloth.
- **Why:**
  - Spell-breaker 1. The one-sided leech and the foot spar are exactly what makes a sign.
  - The belly is displaced along local z (`:2654`, max 0.18·w). For a fore-and-aft plane, z is roughly the line of sight whenever a ship is broadside, so the billow only shows as faint shading.
  - The triangle rigs prove the rest of the fleet already reads as vessels (`g3200-left.png`, ~330–600,270–420).
- **Impact:** stunning 5 / poetic 4 / relaxing 4. **Confidence:** H.
- **Cost:** S–M. **Perf:** Δdraws 0 / Δtris −1 per near ship (foot spar removed) / ΔGPU ≈0 / Δtex 0.
- **How** (`garden-ships.ts` `createSailGeometry`, `GARDEN_SHIP_RIGS`, `createFleetBatchGeometry` :1948-1963):
  1. For `kind === "rectangle"`, span `x ∈ [−w/2, +w/2]`, centred on the mast. `edgeXAt` returns ±w/2 per row.
  2. Delete the foot spar for `rectangle`. Keep the head yard, extended to 1.08·w and centred.
  3. Concave foot: bottom-row `y += 0.12·h·sin(π·u)` and the row above `+= 0.05·h·sin(π·u)`, so the clews stay pinned.
  4. Belly: depth 0.24·w, with the fullest point at u≈0.38 (`sin(π·u^0.8)`) and v≈0.55.
  5. Add a 0.03·h sag of the head between the yard lifts, and bake the vertex shading from the displaced normal, 8 % darker in the troughs, via `bakeSailVertexColors`.
  6. Brace: rotate the sail plane about the mast axis by a stable hash, ±(30°–40°) for moored ships (`stableUnit(id.brace)`). LaneFleetMotion has agreed to drive this angle from apparent wind when under way. Oblique bracing turns every heading into a readable three-quarter view, instead of fore-and-aft planes that go edge-on for bow/stern-on ships.
  7. Keep `aSailHead` as the baked top edge (`bakeSailHead`), so furl/dip is unchanged.
- **Displaces:** the flag read; the foot boom; half of the 1.2 identity oversize (drop to 1.1, since a braced, centred sail shows more cloth per unit).
- **Truth & a11y:** no analytical meaning changes; the mark is the same atlas cell. The reduced-motion state is the static hashed brace.
- **Risks:**
  - Bracing foreshortens the mark by cos 35° ≈ 0.82. Mitigate with 30° on hero ships.
  - The mast crosses the mon on the side where it is in front. Accept it; it is authentic.
  - The bezaisen castle roof-under-centerY pin (`:2084-2088`, `garden-ships.test.ts`) must follow if centerY moves.
  - `deformFleetSailVertex` has a CPU twin that must match.
- **Acceptance:** `#t=12.25` and `#t=17.6` at 1600×1000 and 3200×2000. In the left cluster and the near takasebune, no rectangular card with parallel top and bottom rails remains. Every square sail shows a yard across the mast, a curved foot and visible belly shading. The mon is legible on the three nearest hulls.

### fleet-craft-2 ★ One dye book: hue-locked OKLCH ladder for all cloth
- **Picture:** The fleet looks dyed in one workshop: indigo, persimmon, madder, ochre, sage and unbleached kinari. Each sail is still unmistakably its issuer's hue, never lavender. Darks stay dark and pales stay pale, so the fleet has a value structure instead of a mid-grey fog of lilac cards.
- **Why:**
  - Spell-breaker 3. The lilac comes from arithmetic, not taste: blue lerped toward warm cream in linear RGB rotates toward violet, and the chroma restraint then greys it out.
  - The ledger forbids baking pallor into cloth. This ladder *doubles* the median chroma while bounding the maximum, so it answers the "185 competing chromas" worry (`garden-sail-texture.ts:39-58`) with a shared chroma curve instead of dilution.
- **Impact:** stunning 4 / poetic 4 / relaxing 4. **Confidence:** H on the diagnosis, M on the final constants.
- **Cost:** S. **Perf:** 0 / 0 / 0 / 0. This is CPU work at build time only.
- **How** (`gardenSailClothColor`, `garden-sail-texture.ts:90-117`): convert the issuer primary to OKLCH, then:
  - **H:** keep the issuer's hue exactly.
  - **L:** `L′ = clamp(0.30 + (L − 0.20)/0.60 · 0.56, 0.30, 0.86)`, which is monotone, so issuer order is preserved.
  - **C:** `C′ = min(0.8·C, ceiling(H))`. Ceilings by natural-dye family: beni/madder red 0.13, kaki orange 0.12, kariyasu ochre 0.10, green 0.085, asagi teal 0.08, ai indigo 0.11, murasaki violet 0.09. All stay below vermillion's ~0.18, so its primacy holds.
  - **Neutrals** (C < 0.035): kinari (warm H≈80, C 0.012) when L′ ≥ 0.55, sumi (C 0.008) below that.
  - Delete `CLOTH_CANVAS_LIFT`, `CLOTH_LUMINANCE_FLOOR`, `CLOTH_CHROMA_RESTRAINT` and the pirate branch (see Reversals).
  - My simulation over all 256 brands: median C 0.043 → 0.085; L p10–p90 0.54–0.73 → 0.37–0.82; grey cloths 88 → 38 (the genuinely neutral brands).
  - Apply the same ladder to the strake (`batchedTrimColor`) and the pennant, so cloth, rail and flag agree.
  - `weatheredSailColor`'s ±6 % stays.
- **Displaces:** the lavender cast, the grey third of the fleet and the forced-black eighth. Distance restraint stays in the shader (`FLEET_FRAMING_RESTRAINT`, aerial), where the ledger says it belongs.
- **Truth & a11y:** hue identity is *better* preserved, since hue no longer rotates. Colour is still not the only carrier: the mon plus the DOM detail/ledger name the issuer. The mon ink's value contrast is recomputed from the new cloth L (`garden-sail-texture.ts:263-270`). The dye does not change under reduced motion.
- **Risks:**
  - The two-issuer separation gate (~0.30 floor, cited in `garden-sail-texture.ts:59`) and palette tests must be re-run against the ladder. Hue-exact mapping should raise pairwise separation, but pairs that differ only in chroma will collapse under the ceilings. Keep the extractor's OKLab spread guard.
  - Near sails get more saturated, so this needs idea 3's far quieting to keep the frame calm.
- **Acceptance:**
  - A script histogram of all cloths: median C ≥ 0.07, no blue issuer's cloth hue drifting more than 3°, L p10–p90 spanning ≥ 0.4.
  - `#t=12.25` right-middle: no lilac cards.
  - `#t=17.6`: the sails warm with the light instead of staying periwinkle, which also needs idea 4.

### fleet-craft-3 ★ Far fleet as ink silhouette; a hero-few ladder
- **Picture:** Past the inlet the fleet stops talking: small dark sail shapes in the family's outline (triangle, fan, braced square) over a thin dark hull sliver, all in one atmospheric tone that thins with distance. At noon it is a line of sumi strokes against the haze. At golden it becomes cut-paper silhouettes against the glow, and at night it disappears except for embers. About 16 near boats carry the rig, the mon and the lantern; the middle ground keeps the hull and a quiet mark.
- **Why:**
  - Spell-breaker 2. The bible's "a few near boats read as rigged vessels; the many beyond recede into silhouette" is unmet: the census implies roughly 95 near-rigged ships against roughly 89 far planks, a 50/50 split rather than few/many.
  - The far band is 68 L* against a 42 target, and the pale deck faces are most of that fleet contribution.
  - The existing far LOD (`FLEET_HULL_LOD_DISTANCE` 150, `garden-fleet-batch.ts:291`) already has the right switch; it just draws the wrong thing.
- **Impact:** stunning 4 / poetic 5 / relaxing 5. **Confidence:** M-H.
- **Cost:** M. **Perf:** Δdraws 0 / Δtris ≈ +1k for shaped far sails (5–8 tris each), and about −30k if the band shifts roughly 35 ships from near to far / ΔGPU slightly negative / Δtex 0.
- **How:**
  1. **Geometry** (`createFarFleetGeometry`): extrude depth 0.72 → 0.35 and bake the top face to the keel tint, so no bright deck plane is left. Replace the `PlaneGeometry` with the family's outline: a centred braced trapezoid with a concave foot for rectangle kinds (matching idea 1), the triangle for kobaya/twinhull, and a 5-point fan for junk.
  2. **Material** (the far `onBeforeCompile`, `:1195-1222`): force `markVisibility = 0`. Then `sailCloth = mix(fogColor·0.55, dyedCloth, 0.22)` and `hull = fogColor·0.42`, with the mix easing toward `fogColor` by `aerial` so the farthest thin into haze. Keep the wrap/backlight off for far hulls and on for far cloth, using idea 4's sun-coloured version.
  3. **Hero band:** rank ships by eye distance in the existing per-ship distance loop in `endFleetFrame` (`garden-fleet-batch.ts:1526-1535`). No new JS pass is needed; the cost is one sort of ≤184 floats, about 0.01 ms CPU [INFERENCE]. The nearest 16, plus any attention target, with 0.35 s hysteresis, become the hero band. The sail program is already at the 16-attribute cap (`:1070-1073`), so pack the flag into the existing `aSailAttention.y`: write `presence + 2.0·hero` and decode with `floor`/`fract`. Do not add an attribute. Hero ships alone get the rigging (idea 8), a hanging lantern (idea 7) and full mark presence.
  4. **Middle ground:** set `MARK_MIN_PRESENCE` 0.45 → 0.3.
  5. **Attention:** hovering or selecting a far ship promotes it to near LOD, the existing attention restores its dye, and the DOM panel opens immediately.
- **Displaces:** the plank field, the far mark blots and the far dye clutter.
- **Truth & a11y:** far identity at rest is not an analytical encoding. Size (cap) is still carried by the silhouette's scale, and the ledger and search list every ship. Reduced motion uses the same LOD with no animation.
- **Risks:**
  - Silhouettes must not read as holes on dark water at blue hour; tie the tone to fog colour, not black.
  - The LOD swap boundary must not pop. There is already 0.5 u of hysteresis; add a 0.3 s tone cross-fade.
  - The draw-census and `fleetDrawCallCount` pins are unchanged.
- **Acceptance:** `#t=12.25`, `#t=17.6`, `#t=18.8` and `wholemap-noon`:
  - no pale plank remains;
  - the right-middle ninth reads ≤ 55 L* at noon (with the Light/atmosphere lanes);
  - a blurred (16 px) `--blur-audit` shows the far fleet as one soft dark band, not confetti;
  - the three nearest hulls still show their mon.

### fleet-craft-4 Backlight as shoji: sun-coloured transmission, blocked by ink
- **Picture:** At golden and dawn the near sails between the camera and the sun turn into warm paper, glowing amber-in-dye. The mon shows as a darker ink shadow inside the glow, like a crest on a lit shoji panel. The effect fades as a sail turns side-on.
- **Why:** spell-breaker 5. The shipped wrap term adds dye-coloured light with no sun colour and no view dependence, which pastelizes sails into cool cards (`garden-fleet-batch.ts:1044-1047`, `setFleetLightHour` :168-172).
- **Impact:** stunning 5 / poetic 5 / relaxing 3. **Confidence:** M.
- **Cost:** S. **Perf:** 0 / 0 / a few ALU ops on sail fragments only. That is ≈0.01 ms at 1600×1000@1x, and about 4× that at the operator's DPR 2 [INFERENCE] / 0.
- **How:** replace `:1044-1045` with:
  - `float facing = clamp(-dot(normal, clothSunDir), 0., 1.);`
  - `float through = pow(clamp(dot(normalize(-vViewPosition-like eye dir), -clothSunDir), 0., 1.), 2.)`, using the existing `vAerialDepth` path, or a view-dir varying if FLAT_SHADED lacks one.
  - `vec3 transmit = sailCloth * uSunColor * (facing * (0.35 + 0.65 * through)) * uBacklight * 0.55 * (1.0 - markCover * 0.85);`
  - `outgoingLight += transmit;`
  - Add `uSunColor` shared from the Light lane's sun uniform.
  - Keep `FLEET_CLOTH_RADIANCE_CEILING` so the cloth never enters bloom. The beacon stays the dominant light.
- **Displaces:** the current self-coloured wrap term.
- **Truth & a11y:** decorative only; the mark gets *more* contrast when backlit. Static under reduced motion (the light is hour-driven, not animated).
- **Risks:** it can over-brighten at dawn with a low sun behind the camera; the view term guards against that. Test pins on the backlight uniform may need updating.
- **Acceptance:** `#t=17.6` at 3200×2000. The near-left sails take on a warm cast with the mark visibly darker than the surrounding cloth. No lilac card remains in the right-middle. `#t=12.25` is unchanged (uBacklight 0).

### fleet-craft-5 Cloth that reads at rest: panel strips replace the gingham weave
- **Picture:** Square sails show the vertical cotton strips of a wasen sail (momen-ho): 6–9 slightly alternating panels with hairline seams, and on the bezaisen a faint gap of light between them. Up close, the thread weave appears only when you inspect.
- **Why:** spell-breaker 4. A texture meant for inspection is on at rest because the rest zoom moved to 1.15. The existing 3 panel seams are vertex-baked on a 6-column grid (`garden-ships.ts:2729-2735`), which is too coarse to read.
- **Impact:** stunning 3 / poetic 4 / relaxing 4. **Confidence:** H.
- **Cost:** S. **Perf:** 0 / 0 / ≈0 / 0.
- **How** (`patchSailAtlasMaterial` `<map_fragment>` :1001-1013):
  - Raise `CLOTH_WEAVE_FADE_ZOOM`/`FULL_ZOOM` to 1.5/2.1 so the thread weave is inspection-only.
  - Add a fragment panel term: `float p = vClothUv.x * uPanels; float seam = 1. - smoothstep(0., fwidth(p)*1.5, abs(fract(p)-.5)*2. - .94); float alt = mod(floor(p),2.)*0.03;` then `sailCloth *= (1. - alt) * (1. - 0.09 * seam * (1. - markCover * 0.7));`. Multiply the whole term by `1. - smoothstep(0.15, 0.3, fwidth(p))` so it fades before it can alias.
  - The sail program has no free attribute slot (16-attribute cap), so the panel count rides the baked vertex colour. `bakeSailVertexColors` already writes a greyscale shade in r = g = b. Keep the shade in r/g and store `panels/16` in b (bezaisen 9, takasebune 6, others 0). Then replace `<color_fragment>` in the sail patch with `diffuseColor.rgb *= vec3(vColor.r);` so b never tints the cloth, and read `uPanels = floor(vColor.b·16 + 0.5)`. `mergeAtlasSails` fills a missing colour with 1 (b = 1 means 16 panels), so every sail must write b explicitly. The junk keeps its battens.
  - Remove the 3-panel vertex seam.
- **Displaces:** the gingham, and the vertex seam.
- **Truth & a11y:** decorative only. The seams stand down under the mark, as `CLOTH_WEAVE_MARK_RELIEF` already does for the weave.
- **Risks:** moiré at mid distance; the fwidth fade is mandatory. Tests pinning `GARDEN_SAIL_SEGMENTS_*` band positions change.
- **Acceptance:** `#t=17.6` at 3200×2000, left cluster: no checker on any sail, and vertical strips are visible on the three nearest square sails.

### fleet-craft-6 Toy → craft: bezaisen proportion and a low yagura
- **Picture:** The bezaisen becomes long and low, with a rising, recurved stem and a raised stern carrying a long low deckhouse under a gentle roof. It becomes the proud coastal trader instead of a tub with a phone box.
- **Why:** spell-breaker 7. L/B 1.73 and a 2.4-tall cube are the toy signal on a quarter of the fleet. The earlier T3.3 raised the castle "so it stops reading as a shed" (`garden-ships.ts:292-296`) but made it a taller cube.
- **Impact:** stunning 4 / poetic 3 / relaxing 3. **Confidence:** M-H.
- **Cost:** M. **Perf:** 0 / ±0.5k tris / 0 / 0.
- **How:**
  - `createHullShape` bezaisen: half-beam 2.0 → 1.3 (L/B ≈ 2.7); stem point 3.45 → 3.9.
  - `GARDEN_HULL_FORM.bezaisen`: `sheerBow` 0.18 → 0.42 so the stem rises and recurves; `sheerStern` stays 0.38.
  - Castle `{height 2.4, width 2.2, z 2.75}` → `{height 1.05, width 3.1, z 2.2}` at x −2.1. Reuse the half-cylinder roof, radius scaled to the new width, and add a 0.08 dark eave band.
  - Add a big stern rudder blade: one box 0.12 × 1.6 × 1.1 below the transom, keel tint.
  - Update `createFarFleetGeometry` and `GARDEN_HULL_MAX_X_REACH_WORLD` from the new outline; the reach only shrinks athwartships.
- **Displaces:** the cube cabin and the bathtub plan.
- **Truth & a11y:** the family still means the same thing (`resolveShipClass`). The hull-form channels (beam = peg grade, etc.) keep working as multipliers around the new base.
- **Risks:** narrower beam weakens the peg-grade beam read on this family (it is a ±26 % multiplier either way). Test pins: the castle-under-centerY margin, berth footprint tests.
- **Acceptance:** `#t=12.25`, left cluster, crop at 2560×1440: no box-on-tub silhouettes; bezaisen read as long hulls with a raised stern.

### fleet-craft-7 Lanterns that hang: no daylight discs, one stern lamp on a post per family
- **Picture:** By day you see a small paper chōchin hanging from a short stern pole on the nearest boats, not black dots in the air. At dusk they kindle as embers; the far fleet shows at most a pinprick.
- **Why:** spell-breaker 6. There are 244 flat black discs in daylight, positioned by one shared constant.
- **Impact:** relaxing 3 / poetic 3. **Confidence:** H.
- **Cost:** S. **Perf:** 0 draws / −2.5k tris in the far and mid bands at day / 0 / 0.
- **How:**
  - `updateFleetLanterns`: when `coreMaterial.emissiveIntensity < 0.25`, write `zeroScaleMatrix` for non-hero ships. Hero ships keep a lit-paper core, with core `color` changed from `#000` to `#d9c9a8` so it reads as paper by day.
  - Replace `STERN_LANTERN` with a per-silhouette table from `createHullShape` stern x + 0.15 inboard, y = rail + 0.55.
  - Draw the stern pole as two extra segments in idea 8's CPU-written hero rigging `LineSegments`. That is zero extra draws and no hull-batch attribute.
  - Titans lose `MID_LANTERN` at rest. Two points per ship at most.
- **Displaces:** 244 floating discs; the mid lantern.
- **Truth & a11y:** decorative only; attention warmth is unchanged. Lanterns are static under reduced motion (sway is already frozen).
- **Risks:** `garden-ships.test.ts` lantern entry counts, and the night ember budget (the Light lane owns intensities).
- **Acceptance:** `#t=12.25` crops: no dark dots near any hull. `#t=22`: the near lanterns sit on their sterns.

### fleet-craft-8 Standing rigging for the hero band only
- **Picture:** The dozen-odd nearest boats gain forestays, backstays and shrouds: fine dark lines that tie mast to hull. The eye finally reads a *rig*, and the far fleet stays pure silhouette.
- **Why:** batched masts are bare sticks (`garden-fleet-batch.ts` has no rigging), so near masts read as flagpoles. `riggingPoints` (`garden-ships.ts:2763`) already exists but only serves the scene-graph heroes.
- **Impact:** stunning 3 / poetic 3. **Confidence:** M.
- **Cost:** M. **Perf:** +1 draw (~11 µs CPU submit) / ~0 tris (lines, ≤16 ships × ~14 segments incl. the stern pole = ~450 verts) / JS rewrite ≈0.02–0.04 ms CPU per frame [INFERENCE]; skip the rewrite on frames where no hero pose changed / 0 tex. At the operator's 120 Hz the CPU binds, so it is the only JS-per-frame item in this report.
- **How:** use one `LineSegments` whose positions are written each frame from `riggingPoints(silhouette)` transformed by each hero ship's `root` matrix and `hullForm` scale, for idea 3's top-16 set only. The line colour is the mast tint × 0.8, and it is fog-affected.
- **Displaces:** the pennant on non-hero ships (see Subtractions), so the rig replaces the flag as the near-vessel cue.
- **Truth & a11y:** decorative only; static under reduced motion (it rides the frozen pose).
- **Risks:** 1 px aliasing. The ledger notes that rigging lost coverage under SMAA-only; MSAA stays on. It needs the hero set from idea 3.
- **Acceptance:** `#t=12.25` at 2560×1440: stays visible on the nearest 3–5 hulls, no rigging visible beyond the inlet.

## Subtractions
- **Foot spar on `rectangle` sails** (`garden-ships.ts:2670-2686`, `spar === 1`). This is the single line that makes the banner. For `fore-aft` a boom stays.
- **Far-LOD mark:** `markVisibility` → 0 in the far material. The far mon is a grey blot at 12 px.
- **`GUNWALE_TINT` 1.25 → 1.0 on the strake** (`garden-fleet-batch.ts:60`), and run the strake through idea 2's ladder. This removes the neon rims.
- **Hero hull brand lerp 0.30 → 0.12** (`garden-ships.ts:1132-1135`), matching the batch whisper (`:576`). No more purple hulls.
- **Masthead pennants beyond the hero band.** About 95 near ships each fly a chain-tinted pennant (`batchedPennantColor` :697-706), which is another hundred specks of chroma. The dominant chain is already in the detail panel and ledger. This needs LaneDataPoetry's sign-off, because the pennant is a coarse chain cue.
- **Thread weave at rest** (idea 5: move the fade zooms to 1.5/2.1).
- **Lantern cores by day** for non-hero ships (idea 7).
- **`MID_LANTERN` on titans at rest.**

## Reversals
1. **The pirate rule (black canvas for pale brands).**
   - *Source:* `PIRATE_CONTRAST_FLOOR`/`SAIL_DARK_CANVAS_ISSUERS` (`garden-sail-texture.ts:63-115`), decision H1/D5, reaffirmed in the ledger's "pirate-contrast floor".
   - *Evidence:* its stated premise is that "a coin's mark is almost always WHITE… the mark is not ours to recolour" (`:66-68`). That stopped being true when the mon became a single neutral ink chosen *by contrast with the cloth* (`:263-273`). A pale sail now gets dark ink automatically.
   - *Argument:* 33 of 256 issuers (13 %) currently fly near-black cloth unrelated to their brand, which is identity loss and value noise. Under idea 2, pale brands keep pale dye with dark ink, and genuinely dark brands (BUIDL, Frax) stay dark through L′.
   - *Risk:* sail-texture tests and the "no-flash" property. The ladder is still a pure function of (livery, id), so no-flash holds.
2. **Linear cream lift + chroma restraint** (F1 `CLOTH_CANVAS_LIFT` 0.17, 2026-09-07 `CLOTH_CHROMA_RESTRAINT` 0.3).
   - *Evidence:* the dye census above (lavender hue rotation, 34 % grey, compressed L).
   - *Argument:* both were reasonable local fixes, but they compound in linear RGB into the lilac fleet. The OKLCH ladder honours the ledger's "never bake restraint into cloth": it raises median chroma and keeps hue exact.
   - *Risk:* the two-issuer separation gate needs re-proving.
3. **W3.1 "yard + boom on rectangle rigs".**
   - *Evidence:* spell-breaker 1. The boom is what frames the cloth into a scroll.
   - *Argument:* square sails on Japanese coastal craft are sheeted from the clews, not boomed. The boom belongs to fore-and-aft rigs only.
   - *Risk:* none beyond test pins.
4. **W3.6's far variant, "sail as a single quad, marks at `MARK_MIN_PRESENCE`, chroma −25 %".**
   - *Evidence:* `crop-1440-right.png` and `g3200-right.png` planks, and the 68 L* far band.
   - *Argument:* the plan's acceptance ("at most ~14 hulls carry full rig detail and the rest read as silhouettes") is the right target, but a desaturated card is not a silhouette. Replace it with idea 3's tone-mapped outline, with no mark.
   - *Risk:* identity at far zoom depends on hover. That was already true at 45 % presence in practice.

## Cross-lane dependencies
- **LaneLight:** idea 4 consumes the shared normalised sun/key colour uniform Light will publish from `updateDayCycle`, next to `uSunDir`, plus a fog colour uniform for idea 3's silhouette tone. Light owns lantern and ember intensities (idea 7), and has agreed not to retune `uBacklight`. If Light's proposal to rotate `NOON_BEARING` to about −45° lands, backlit sails move mostly to dawn and the far fleet, so idea 4's view·sun falloff must be tuned on the rotated arc: acceptance at `#t=6`, `#t=17.6` and `#t=18.8`, not golden alone.
- **LaneFleetMotion:** it drives idea 1's brace angle from apparent wind when under way, with the static hashed brace as the moored and reduced-motion state. It proposes a leeward camber sign on my baked belly. Agreed: head y and `aSailHead` are unchanged.
- **LaneHarbour / placement and camera lanes:** flotillas, unequal anchorages and the empty inlet are placement's job. Idea 3's hero band (nearest 16 by eye distance) assumes the current rest camera.
- **LaneWater / LaneFleetMotion:** far silhouettes need little or no wake and foam, so they read as distance and not as activity. The near wet collar keeps its waterline y. Headroom reports 84 of the 279 draws are `ship-wake-detail` 1 px GL_LINES, the white hairline scratches beside hulls, visible in `crop-noon-near.png` at ~390–470,215. Limiting that detail to idea 3's hero band would free more than 60 draws, easily paying for idea 8's +1.
- **LaneDataPoetry:** confirm the pennant subtraction is acceptable given the detail-panel chain parity, and that the dye ladder keeps issuer identity (hue-exact plus mon plus DOM).
- **LaneArtDirector / LaneCritic:** palette acceptance of the dye-book ceilings against vermillion primacy and the four immutable anchors (none are redefined; `sail_teal`/`sail_red` are palette tokens the fleet dye does not touch).
- **Headroom lane:** check the triangle arithmetic. Idea 3 can return about 30k tris if the near/far boundary moves inward. Ideas 1, 2, 4 and 5 add zero draws, zero textures and zero attributes (the cloth program is at its 16-attribute cap; everything rides uv, position, vertex colour or a packed `aSailAttention.y`). Idea 8 is the only per-frame JS item.

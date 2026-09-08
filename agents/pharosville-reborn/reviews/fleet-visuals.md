# Lane review — fleet visuals (how ships look)

Base `4edd97c`. Read-only. Frames: `outputs/reborn/{noon,dusk-close,night}.png`, plus two
crops I made from them (`dusk-close` @ 760–1120×540–700 and 250–700×380–620, referenced
below as *crop A* / *crop B*).

## 1. Verdict

They read as **toys** — specifically, bath toys carrying app icons. Hulls are single-chroma
extrusions with no waterline, no findable contact shadow, no rigging and no surface
variation beyond a baked plank sawtooth; sails are square cloths with a bright circular
plate and a logo filling it (crop B: the Maker hull is a glowing violet square with a white
disc). Scale is the deeper problem: the island rock is radius 14 (`garden-water.ts:353`,
diameter 28 world units) and a mid-ladder takasebune is 11.87 units at scale 1
(`garden-ships.ts:2401-2405`), so a *typical* barge is **42–59 % of the island's width** and
a flagship one is **87 %**. That is not a harbour with a lighthouse in it; it is a
lighthouse in a toy box. Two families read as craft — kobaya and junk, 39 % of the fleet;
the other 61 % is a barge or a box under a card.

## 2. Findings

### Prior-item verification (2026-09-07)

| Item | Landed? | Evidence |
| --- | --- | --- |
| **T1.9** sail band Nyquist | **Partly** | Battens now `n/6` (`garden-ships.ts:2523-2524`), falloff 0.08 (`:2531`), rect panels 5→3 (`:2652`). But the **reef bands were deleted, not re-quantised** — `bakeSailVertexColors` (`:2645-2677`) has only panel seams, junk battens, leech falloff. Battens are gated on `plan.kind === "junk"` (`:2659`), so the fix reaches 45/217 hulls (20.7 %), not 24 %. |
| **T1.10** hull value spread | **Yes** | `ship-age.ts:40` — `0.06 + u*0.09`, ±6–15 %, symmetric, id-seeded. |
| **T3.3** kobaya routing | **Yes** | `garden-observatory-slice.ts:96`; bowsprit trim 8.05→6.70 at `garden-water-exclusion.ts:224-228`. Recomputed distribution from `shared/data/stablecoins/coins.generated.json` (217 coins): bezaisen 55 (25.3 %), **takasebune 53 (24.4 %)**, junk 45 (20.7 %), kobaya 39 (18.0 %), twinhull 15 (6.9 %), scow 10 (4.6 %). The bezaisen monoculture became a duopoly. |
| **T3.4** hull material | **Shipped, invisible** | Code is real (`garden-fleet-batch.ts:940-950`, cache key `:982`) but sub-threshold. Rail term `aPartMasks.w = 0.55` (`:652-655`) → roughness 0.84 → **0.625**; wet band is 0.11 units on topsides spanning ~0.9. Crop A (zoom 1.4, the most favourable framing that exists) shows **no waterline and no rail highlight**. A hook that works, a tuning that does not. |

### DEFECT

- **D1 — the identity plate is the sticker.** `IDENTITY_FIELD_RADIUS = 62` on a 128 px cell
  (`garden-sail-texture.ts:235`) is a disc 97 % of the cell width, painted at
  `IDENTITY_FIELD_ALPHA = 0.42` (`:363`) with the logo at `IDENTITY_LOGO_SPAN = 0.9`
  (`:236`). The stated intent is "a contrast plate the mark sits on"; what it produces is a
  full-bleed roundel on a square, i.e. a favicon. Crop B, all three sails.
- **D2 — the takasebune has no rig.** Mast height 2.35, one 1.45×1.55 sail
  (`garden-ships.ts:259-265`) on an 11.87-unit hull: the sail is 15 % of hull length. Its
  identity mark is therefore the smallest in the fleet on the second-most-common family.
  Crop A: the mark is a postage stamp on a bread loaf.
- **D3 — the cargo bays read as a caterpillar.** Eight identical arched covers in the same
  timber as the hull, same roughness, no cap or lashing (crop A). Nothing separates
  structure from cargo.
- **D4 — sails cast no shadow** (`garden-fleet-batch.ts:1287`). The tallest, broadest
  element of every ship contributes nothing to the water; the hull's own shadow exists
  (`:1158`) but at noon sits under the hull, so the fake blob circle
  (`garden-ships.ts:2786`) does the visible work.
- **D5 — hero GLBs lose to the procedural fleet.** 18 models, 930–1904 tris each, 21 858
  total (`garden-models.ts:319-806`). In `noon.png` the hero at frame-centre-bottom is a
  flat brown mass with a slab roof, less legible than the kobaya beside it — bespoke shapes
  with the same flat material problem, at ~2× the tris and 18 fetches.

### GAP

- **G1 — scale ladder is functionally dead.** `gardenShipVisualScale`
  (`garden-observatory-slice.ts:78-87`) maps data 0.7–3 → visual 0.8–2.05, but real caps put
  almost everything in micro→regional (`ship-visuals.ts:166-176`, data 0.7–1.25) — **visual
  0.80–1.10**. A 100× cap difference is a 27 % length difference. The 0.8 floor is too high
  only because it is 39 % of the max: nothing is small.
- **G2 — one material for the whole fleet.** `roughness: 0.84`, `flatShading`, no map, no
  normal map (`garden-fleet-batch.ts:1245-1250`); the only per-ship surface fact is a
  ±6–15 % value multiply. At dusk it collapses: crops A and B are *one orange*.
- **G3 — cloth is opaque.** `DoubleSide`, `emissiveIntensity 0.04` (`:1254-1262`) — no
  transmission, no wrap. At dusk with the sun behind the fleet (`dusk-close.png`, right
  half is backlight) every sail is a flat dark card. The most beautiful thing a harbour
  scene owns, absent.
- **G4 — colour ladder is legible in code, not on screen.** Six timbers, four warm-brown
  (`garden-ships.ts:553-588`), separated mostly in *hue* (H 77–98) at similar chroma.
  Under the warm dusk key + grade LUT the four warm families converge. Only twinhull
  (cool grey-teal) and junk (near-black) survive. Effective ladder: 3 steps, not 6.
- **G5 — no hierarchy.** Every one of ~185 hulls carries the same rig, the same props,
  the same mark presence above zoom 0.62 (`garden-fleet-batch.ts:363`). The frame has no
  foreground/background structure — the orchestrator's "carpet" is exactly this.

## 3. Ideas, ranked

Fleet budget today: 124.0 k hull tris + 16.4 k sail tris (`outputs/reborn/census/draw-census.txt:56-68`),
i.e. ~470–670 tris/hull, 12 draws + 1 pennant. Ceiling 500 k / 700 draws; scene is ~355 k.
**Headroom ≈ 145 k tris.** All costs below are against that.

**1. Sail re-form: mon on cloth, not a card on a stick. [STEP CHANGE]**
*What:* `garden-sail-texture.ts` + `GARDEN_SHIP_RIGS`. Delete `paintIdentityField` (D1).
Paint the mark as a **mon**: single colour, ~52 % of cell width, upper third, *multiplied*
into the dyed cloth so weave and seams show through, with a low-frequency wear mask (2–3
seeded blotches) so it looks painted on, not pasted on. Reshape the cloth: bezaisen
3.35×4.1 → **4.3×3.0** (wide-short stops reading as a poster); add a yard at the head and a
boom at the foot for `rectangle`/`fore-aft` kinds so the cloth is *hung*, not floating.
*Why:* removes the loudest "this is a UI element" signal in the frame.
*Cost:* +2 tris/hull for the boom (yard already exists on some); 0 draws; atlas unchanged
(2048², 1 tex). **M.**
*Risk:* mark legibility at rest zoom drops; mitigate with `MARK_MIN_PRESENCE` and by
choosing the mon colour for value contrast against the dyed cloth, not hue contrast.
*Re-pins:* `IDENTITY_FIELD_*` constants and any sail-texture test asserting the plate;
`gardenFleetMarkPresence` thresholds likely need re-tuning.

**2. Scale re-base to 0.42–1.15 with a log-cap ladder. [STEP CHANGE]**
*What:* `resolveShipSizeTier` + `gardenShipVisualScale`. Replace the 6-step tier table with
a continuous `visual = clamp(0.42 * (cap/1e7)^0.10, 0.42, 1.15)`. That puts a $1 M coin at
0.42 (takasebune 5.0 units = **18 % of island diameter**), a $100 M at ~0.67, a $10 B at
~1.06, USDT at ~1.15. Ratio max/min 2.7× (up from the effective 1.4×), and the *whole
fleet shrinks ~45 %*.
*Why:* the difference between a marina and a bay. It buys back water — the calmest surface
in the frame — makes the lighthouse monumental for the first time, and restores size as a
readable ladder over four decades of cap instead of a 27 % nudge.
*Cost:* 0 tris, 0 draws, 0 ms. **S in code, L in consequence.**
*Risk:* a 0.42-scale hull's sail is ~24 px at rest zoom. Pair with idea 4 and accept that
background ships are *silhouettes* — which is what a Japanese garden wants.
*Displaces / re-pins:* `GARDEN_SHIP_VISUAL_SCALE_MIN/MAX`, `gardenShipWaterMarginTiles`,
the 3.8-tile floor in `garden-fleet-placement.test.ts:231-235` (spacing *improves*),
`motion-sampling.test.ts:123-127`. The "≥0.5 zoom shows every hull" decision still holds.
*Depends on:* motion/density lane owns count; a 45 % shrink must be decided jointly.

**3. Make T3.4 actually visible: wet collar + rail varnish + hull AO into the water.**
*What:* `garden-fleet-batch.ts:940-950`. Widen the wet band to ~0.22 and, more importantly,
*darken and desaturate* it as well as gloss it (a wet plank is dark, not just shiny) —
add a `vColor *= mix(1.0, 0.62, wetBand)` alongside the roughness mix. Raise the rail term
from 0.55 to 1.0 for the gunwale strake only (it already carries `aStrakeMask`). Then let
the fake blob shadow (`garden-ships.ts:2786`) become a **hull-hugging ellipse**, scaled
anisotropically to the hull's x/z reach and rotated to heading, rather than a circle.
*Why:* the wet line is the cheapest "this floats in water" cue in existence, and the
darkening half is what T3.4 missed. Contact is currently absent (crop A).
*Cost:* fragment-only, 0 draws/tris. Blob change is matrix-only. **S.**
*Re-pins:* `garden-fleet-batch.test.ts` gloss assertions if any pin 0.55.

**4. Hero-few / background-many. [near-step-change]**
*What:* per-instance LOD by *screen* distance to camera centre, not zoom. The ~14 nearest
hulls get: rigging `LineSegments` (already authored, `garden-ships.ts:2686`), a furled-sail
state, deck crew silhouettes, lanterns; everything beyond gets hull+sail only, its mark
faded to `MARK_MIN_PRESENCE`, and its chroma pulled a further ~25 % (reuse
`FLEET_FRAMING_RESTRAINT`, `:246`). Implement as two extra instance slots in the existing
batch (a `aDetailLevel` float already fits — hull is 15/16 attributes) plus one shared
`LineSegments` batch drawn for the near set only.
*Why:* every painting of a harbour has three ships you can read and forty you cannot. The
only idea that buys detail *and* quiet at once.
*Cost:* +1 draw (near rigging batch), ~+120 tris × 14 = 1.7 k. **L** (needs a stable
near-set with hysteresis so ships do not pop).
*Risk:* popping; solve with a 0.35 s cross-fade on the detail attribute.
*Depends on:* camera lane (rest framing decides what "near" means).

**5. Fix the takasebune (24.4 % of the fleet).**
*What:* mast 2.35 → 4.2, sail 1.45×1.55 → 2.9×2.2 moved aft to x≈1.6; break the eight
arch covers into **two groups of three plus an open well** with a distinct straw/matting
tint (a new `FLEET_BATCH_TINTS.matting`, cooler and lighter than timber) and a lashing rope
across each group; add a sculling oar over the stern quarter.
*Why:* D2/D3. This family is a quarter of the frame and is currently the least
ship-like thing in it.
*Cost:* +~90 tris/hull × 53 = 4.8 k. 0 draws. **M.**
*Re-pins:* `GARDEN_HULL_MAX_X_REACH_WORLD.takasebune` if the oar overhangs (keep it inboard).

**6. Colour re-ladder: value first.**
*What:* `GARDEN_HULL_FAMILY_PAINT` (`garden-ships.ts:550-589`). Four of six timbers sit at
OKLCH L 0.50–0.79, H 77–98 — hue-separated, which the grade LUT eats. Re-space on **L**:
junk 0.28, bezaisen 0.41, twinhull 0.47 (keep the cool hue), scow 0.60, takasebune 0.68,
kobaya 0.82; drop chroma ~25 % and give the saturation back to the trim strake and sail dye,
where chroma is a jewel rather than a wash.
*Why:* value survives fog, LUT, dusk and 24 px. Hue does not. G4.
*Cost:* 0. **S.** *Risk:* re-pins palette snapshots; sky/post lane must confirm the LUT
does not re-crush the new low end.

**7. Backlit cloth.**
*What:* sail material gets a wrap-lighting term: in `patchSailAtlasMaterial`, add
`+ clamp(-dot(vNormal, sunDir), 0.0, 1.0) * clothColor * uBacklight` where `uBacklight`
rides the existing day-cycle warmth uniform. Two-sided already.
*Why:* G3. At dusk this alone turns ~185 flat cards into ~185 glowing paper lanterns —
and it is the most "Japanese garden" thing available to this lane.
*Cost:* fragment-only, 0 draws/tris. **S.**
*Depends on:* sky lane for the sun-direction uniform (one already exists for god rays).

**8. Retire or re-author the hero GLBs.**
*What:* D5. Either (a) delete the 10 shared hero slots and keep only the 8 named-titan
hulls, routing the rest to the procedural batch at a larger scale, or (b) re-author
`generate-garden-heroes.mjs` to add the things the frame actually misses at close range —
a stern gallery with window mullions, a visible hull-plank normal, boat davits.
Recommendation: (a). 10 fewer fetches, 10 fewer scene-graph ships, ~11 k tris back, and
the procedural fleet is *better looking* today.
*Cost:* −11 k tris, −10 fetches. **M.** *Risk:* uniqueness lane may object; the 8 true
titans keep their bespoke hulls.

**9. Awnings, oars, and one lantern that hangs.**
*What:* near-set only (idea 4): a slack-curved awning quad over the bezaisen well, a pair
of sweeps on the kobaya, and the stern lantern moved onto a visible short davit so it
*hangs* instead of floating (`STERN_LANTERN` at `garden-ships.ts:382`).
*Cost:* ~40 tris × 14 near ships. **M.**

**10. Sail shadow for the near set.**
*What:* flip `castShadow` on the sail batch for the near-set draw only (idea 4 makes this
possible without paying for 185 sails in the shadow map). D4.
*Cost:* one extra shadow-map draw. **S.** *Risk:* shadow-map budget — perf lane owns.

## 4. Step-change sketches

**Idea 1 (mon on cloth).** In `createGardenSailCanvas`: fill the cell with the dyed cloth
(`gardenSailClothColor`, unchanged), then `globalCompositeOperation = "multiply"` and draw
the logo mask at 52 % width in one ink derived from the livery accent pushed to L≈0.25 or
L≈0.88 (whichever contrasts more). Then 2–3 soft radial wear blotches at `destination-out`
alpha 0.10–0.18, seeded by `stableUnit(shipId)`. No plate, no white. In
`createFleetBatchGeometry`, add a yard cylinder (`r=0.045`, length = sail width × 1.05) at
`centerY + height/2` and a boom at `centerY - height/2` for non-triangle kinds. Delete
`drawIdentityFieldPath`, `paintIdentityField`, `IDENTITY_FIELD_*`.

**Idea 2 (scale re-base).** Replace `resolveShipSizeTier`'s scale field with a continuous
`marketCapVisualScale(cap)` in `ship-visuals.ts`; keep the six *labels* (the detail panel
and ledger read them, so parity holds) but derive them from cap thresholds independently of
the scale. `gardenShipVisualScale` becomes the identity clamp to [0.42, 1.15]. Then
re-derive `GARDEN_HULL_MAX_X_REACH_WORLD` consumers — they are already scale-multiplied, so
only the *test constants* move. Capture `noon.png` and `noon-wholemap.png` before/after:
the acceptance is that the island silhouette dominates its own quarter of the frame.

## 5. Rejected

- **Per-ship unique hull geometry** — kills the batch, ~185 draws; `aHullForm` already
  covers proportion variation.
- **Normal-mapped planking** — no UVs on the merged hull; idea 6 plus the baked sawtooth
  gets 80 % of it.
- **Raising the 0.8 floor** — wrong direction; the *top* of the ladder is the problem.
- **Cloth simulation on sails** — `SAIL_LOCAL_DEFORM` billow is adequate.
- **A 256 px sail atlas** — resolution is not the failure (128 px is ~1:1 at zoom 1.4,
  measured in crop B); the design is.
- **Reinstating reef bands** (T1.9's other half) — they alias at 6 rows; panel seams suffice.
- **Crew figures on all hulls** — near-set only (idea 9); 185 is the carpet problem again.

## 6. Cross-lane

- **Motion/density lane owns count; I own look.** Idea 2 shrinks every hull ~45 %: either
  keep 185 in a much emptier frame or thin to ~120. I recommend keeping the count.
- **Camera lane:** idea 4 needs "near" defined against the rest framing.
- **Sky/post lane:** idea 7 needs the sun-direction uniform; idea 6 needs LUT confirmation.
- **Water lane:** idea 3's wet collar wants a matching foam ring; both must agree on the
  waterline y (`GARDEN_SHIP_ROOT_Y - GARDEN_WATER_Y = 0.38`).
- **Data lane:** idea 2 changes what size means; detail-panel/ledger parity must follow.
- **Hand-off:** the recomputed distribution (55/53/45/39/15/10 of 217) is the number any
  family re-route should be argued against.

# Plan: the hulls, and what makes a Titan a Titan

Operator brief, 2026-07-25, after the sail heraldry landed
(`agents/2026-07-25-sail-heraldry-plan.md`, executed):

> *"I really like what has been done on the sails. However the ships themselves
> — first, there is not enough diversity. Second, some ships have colourful
> hulls; pink or purple or red breaks the immersion. Variants of realistically
> wooden colour are okay, but not too flashy. But my main thing: we supposedly
> have a class of 'Titan ship'. The Titan is not just a matter of size — it's a
> unique design that lets you recognise the ship immediately, ideally without
> even needing the sail. I don't feel like all titans fit that description.
> Focus for the first batch on USDT, USDC, USD1, USDe, USDS and XAUT.
> Also do your own comprehensive analysis of what can be done to make the ships
> more beautiful, more exciting, more poetic."*

Nothing here is implemented. Every number below is measured, not estimated;
the harnesses are named so they can be re-run.

---

## 0. How the evidence was gathered

Three instruments, none of which relies on a Playwright frame (per `CLAUDE.md`,
Playwright falls back to SwiftShader and cannot be trusted for looks):

1. **`outputs/hero-silhouettes.mjs`** *(new, written for this investigation)* —
   loads each of the 17 hero GLBs, projects every triangle through **the
   runtime's own camera basis** (`world-renderer.ts:1389`, eye at
   `(d, d·√⅔, d)` looking at the origin) and rasterises a filled mask. No GPU,
   no shading, no colour: pure shape. Emits three contact sheets
   (`outputs/hero-silhouettes-{iso-hull,iso-full,side-hull}.png`) and a
   pairwise IoU table (`outputs/hero-silhouette-pairs.json`). This is the
   instrument that answers "recognisable without the sail", because it is
   literally the ship with everything but its outline removed.
2. **Fleet colour/composition audit** over `coins.generated.json` ×
   `data/brand-colors.json`, replaying `batchedHullColor`,
   `resolveShipClass` and `resolveShipHullForm` offline.
3. **`npm run preview`** on the real GPU (RTX 5070 Ti through the operator's
   Chrome wrapper) — `outputs/ship-audit-day.png`, 2400×1400, 59.5 fps, tier
   `full`, 590 draw calls, 187 ships. Used only for the things a rasteriser
   cannot show: how the fleet reads *as a fleet*.

---

## 1. Findings

### F1 — The brand pigment is on the wrong surface, and it is on 47% of the fleet

`batchedHullColor` (`garden-ships.ts:386`) is:

```ts
new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(livery.primary), 0.58)
```

An RGB **lerp at 0.58** — the hull is closer to the brand colour than to timber.
Replayed over all 214 branded coins:

| Measure | Result |
|---|---|
| Hulls >60° off the timber hue with saturation >0.18 | **100 of 214 (47%)** |
| Worst saturations | 0.79 (`ftusd`), 0.78 (`dusd-dtrinity`), 0.75 (`usdp-parallel`) |
| Examples | `#30129b` violet, `#7d14a1` magenta, `#199c60` lime, `#2d7fa0` cyan |

This is exactly what the operator is seeing, and it has two costs beyond taste:

- **It destroys the woodwork we already paid for.** `bakeHullVertexColors`
  (`garden-ships.ts:1310`) bakes a three-tone wood ramp, fake AO and a
  seven-strake plank sawtooth into the hull's vertex colours. Those values
  *multiply* the instance colour. Against a saturated hue the ramp collapses
  into one flat plastic tone — visible in `outputs/crop-small-ships.png`, where
  the brown ships show planking and wales and the purple/navy/red ones read as
  injection-moulded toys.
- **It now competes with the sail.** Since the heraldry work, the sail *is* the
  identity channel. The hull carries 58% brand; the plain sail carries
  `mixHex(primary, "#f5efdc", 0.6)` — only 40%. The large structural surface is
  louder than the heraldic one. Backwards.

**The heroes are already fine.** `attachGardenHeroModel` uses
`material.color.multiply(heroHullTint)` where `heroHullTint = white.lerp(primary, 0.3)`.
A multiply against wood is inherently hue-preserving: replayed across all 29
hero-tier coins, **every hero hull lands within 16° of the timber hue** (max
`bold-liquity` at 46°, `stusds-sky` at 17°). Whatever the operator is reacting
to, it is not the hero hulls. Only the batched path needs changing.

### F2 — 188 ships share four silhouettes and about a third of their shape budget

```
galleon 64 · clipper 57 · junk 53 · schooner 14
```

Six declared `ShipHull` families collapse onto four `GardenHullSilhouette`
values (`garden-observatory-slice.ts:84`): `crypto-caravel` and
`chartered-brigantine` both draw the *clipper*; `algo-junk` and
`foreign-peg-junk` both draw the *junk*. Two named families draw nothing of
their own.

Within a silhouette the only per-ship shape variation is `aHullForm`
(length, beam, height). `SHIP_HULL_FORM_SPAN` provisions **±0.32** and the
comment says the bound exists so a hull "cannot self-intersect and never
overflow its berth" — i.e. the full span is already validated. Actual usage,
replayed over all 217 coins:

| Axis | p10–p90 spread | Available | Utilisation |
|---|---|---|---|
| length | 0.267 | 0.64 | 42% |
| beam | 0.168 (≈0.30 with peg-grade stiffness) | 0.64 | 26–47% |
| height | 0.193 | 0.64 | 30% |

Eighty percent of the fleet sits inside a ±13% band on length and ±8% on beam.
That is below the threshold where the eye registers two hulls as two vessels.
**We are paying for a variation system and using a third of it.**

And there is no variation at all in the rig: `GARDEN_SHIP_RIGS` is one fixed
mast/sail plan per silhouette, merged once into the batch geometry. Sixty-four
galleons carry the same three masts in the same three places.

### F3 — There is not enough canvas

Galleon rig, measured from `GARDEN_SHIP_RIGS`: total sail area ≈ **8.2 sq
units** against a hull side profile of ≈ **7.7** — call it 1:1. A real square
rigger runs 3–5:1. From the isometric camera the hull also presents its beam,
so its apparent mass is larger still while the sails are thin planes.

The consequence is visible in `outputs/crop-small-ships.png`: a big coloured
hull with three small pale rectangles above it. For a world whose identity now
lives on the cloth, this is the single largest untapped beauty lever — it
multiplies the value of work that already shipped.

### F4 — Titans are not recognisable by silhouette, and the reason is structural

Pairwise IoU of the hull-only isometric silhouettes, size-normalised
(1.000 = identical shape):

| Pair | IoU |
|---|---|
| carrack vs cog | 0.792 |
| **sky vs maker** (USDS vs DAI) | **0.790** |
| **liberty vs maker** (USD1 vs DAI) | 0.778 |
| **liberty vs sky** (USD1 vs USDS) | 0.771 |
| liberty vs dhow | 0.766 |
| **tether vs carrack** (USDT) | 0.759 |
| **tether vs titan** (USDT vs the shared galleon) | 0.753 |
| circle vs barquentine (USDC) | 0.751 |

**The rule the data gives: only mass above the bulwark or beyond the ends
survives the isometric read.** Everything at or below the rail is swallowed by
the hull's own solid silhouette.

What works today, and why — all four break the outline:

| Ship | Feature | Reads |
|---|---|---|
| pyUSD | funnel + paddle boxes | yes, the clearest ID in the fleet |
| cog | crenellated fore/aft castles | yes |
| USDe | outrigger floats | yes — a visible step in the plan |
| junk | battened lug sails | yes |

What fails, and why — all four are interior:

| Ship | Feature | Why it disappears |
|---|---|---|
| DAI | temple colonnade amidships | inside the bulwark line |
| USDS | sun pavilion | same, and it is the *only* thing separating it from DAI |
| USDC | glazed stern gallery + boarding steps | flush with the hull surface |
| USD1 | seven-oar sweep bank | see below — it is inside the hull |

**USD1's oar bank is a provable bug, not a taste call.**
`addOarBank(halfBeam: 0.95, length: 2.1, deckY: 1.4)` against the Liberty hull,
whose stations at the oar bank compute to:

```
x = 0.90   waterline half-beam ±1.96   deck half-beam ±1.72   deck y = 1.55
oar loom      z = ±1.58   y = 1.06      <- INSIDE the hull
oar blade     z = ±2.25   y = 0.54      <- 0.29 units proud, 1 unit below the deck edge
```

The looms are buried in the hull; the blades clear it by 0.29 units a metre
below the rail, where the hull's own tumblehome occludes them from every camera
angle. `deckY: 1.4` is also below the real deck (1.55), so the sweeps start
underneath it. The docstring calls this "the single most recognisable deck
feature a vessel can carry at overview zoom" and it contributes **nothing** —
Liberty's side elevation is a bare banana hull with one mast.

Contrast USDe, which works: `addSponsons(offset: 1.85, beam: 0.62)` reaches
z = ±2.16 against a hull half-beam of ±1.30 — **0.86 units proud**.

> **The clearance threshold, from measurement: a feature must stand ≳0.7 units
> clear of the hull's beam, or sit above the bulwark cap, to survive the
> isometric silhouette.** Every titan proposal below is checked against it.

### F5 — Small things, all true, all cheap

- **Docked ships sail under full canvas.** There is no furl state anywhere in
  `src/` (grep: only a comment). 122 of 187 ships are at a berth flying full
  main courses. Immersion break *and* a free variety channel wasted.
- **The batched fleet's decks are empty.** One cabin box and a roof
  (`GARDEN_SHIP_CABINS`, and only for three of four silhouettes — the clipper
  gets nothing). The heroes have hatches, capstans, ship's boats, cargo stacks
  and derricks; the 188 ships people actually look at have none.
- **Adding batch variants is nearly free.** Batches are keyed per silhouette
  (`garden-fleet-batch.ts:374`) at 2 draw calls each, against 590 total in the
  frame. Instance buffers are `GARDEN_FLEET_BATCH_CAPACITY = 320` × ~26 floats
  ≈ 33 KB per part. **Twelve variants would cost ~800 KB and 25 draw calls.**
  Variant count is decoupled from ship count — this is the cheapest diversity
  currency the renderer has, and it is currently unspent.

---

## 2. What is already beautiful, and must not be broken

Stated explicitly because the changes below are invasive:

- The sail heraldry — coloured cloth, white mark, the 26-ship black-sail
  squadron. Untouched by everything here.
- Water, wake rings, contact shadows, lantern bloom at dusk.
- **The wood.** Where a hull is timber-toned, the plank sawtooth, the wales and
  the fake AO read beautifully and the ship looks built. F1's fix is in service
  of this, not against it.
- USDT's three-tier counting house — the one titan feature that fully works.
- The F1 invariant from the sail work: a titan and a skiff of the same issuer
  must read as the same issuer. Any hull-colour change must preserve it.

---

## 3. Work packages, in priority order

Priority is *operator impact per unit of risk*. W1 and W2 are one afternoon
each and change the entire frame; W5 is the operator's headline ask and is the
largest single piece of work.

---

### W1 — Give the hulls back to the sea *(the flashy-hull fix)*

**Target:** no hull reads as pink, purple, magenta, lime or electric blue. The
brand survives on the hull as *paint*, not as *material*.

Three parts, land together:

**W1.1 — Timber, chosen, not derived.** Replace the 0.58 lerp with a small
authored palette of real ship-timber tones, picked by a stable per-id hash
crossed with one trait so the choice carries meaning:

```
oak · teak · pitch-pine · tarred black · weathered grey · elm
```

Six tones already give more *perceived* hull variety than 214 derived hues do,
because six distinct materials read as six kinds of ship while 214 arbitrary
hues read as one kind of ship in fancy dress. Keep a **≤0.12 lerp** toward the
brand primary so siblings of one issuer still relate — that is what preserves
the F1 invariant.

**W1.2 — Return the brand to the sheer strake.** Historically where a ship
carried her owner's colours, and a thin saturated line against wood reads far
better than a flooded hull.

Mechanism: `bakeHullVertexColors` already computes a normalised keel→gunwale
`t`. Bake a second attribute `aStrakeMask` = `smoothstep` band around `t ≈ 0.86`.
Per D2 there is **no second painted band at the wale** — the hull's existing
baked wale shading stays shading. Add a per-instance `vec3 aTrim`
alongside the existing `instanceColor`/`aHullForm`/`aSailTint`. In the hull
material's `onBeforeCompile`, `vColor` becomes
`mix(instanceColor, aTrim, aStrakeMask) * bakedVertexColor`.

Cost: one float vertex attribute, one vec3 instance attribute, no extra draw
call, no extra geometry.

**W1.3 — Verify the sail still wins.** Re-measure hue distance between hull and
sail per ship; the sail must be the more saturated surface on every ship.

- **Verify:** replay the audit — zero hulls >60° off timber with sat >0.18;
  planking legible on every hull in a contact sheet; a `usdt`/`susdt`-style
  sibling pair still visibly related.
- **Risk:** low. Batched path only. The hero path is measured clean (F1) and is
  not touched.

---

### W2 — Spend the shape budget we already own *(the cheapest diversity)*

**W2.1 — Widen `resolveShipHullForm` toward ±0.32.** The clamp is already
validated for the full span. Roughly double the jitter channels (0.09/0.08/0.10
→ ~0.18/0.16/0.20) and widen the trait deltas so the *signal* grows with the
noise rather than drowning in it. Free: no geometry, no draw calls, no memory.

**W2.2 — Split the two collapsed families.** Author a real `caravel` and a real
`algo-hulk` silhouette (plan outline + vertical form + rig + cabin), splitting
the 57-clipper and 53-junk pools. +2 batches = +4 draw calls of 590.

**W2.3 — Rig variants.** Two to three rig plans per silhouette, chosen by hash
(`galleon-topsails` / `galleon-bare-poles` / `galleon-lateen-mizzen`, …).
Because a variant is a *batch*, not a *ship*, twelve variants across the whole
fleet cost ~25 draw calls and ~800 KB. This is the highest-leverage diversity
spend available.

**W2.4 — Deck furniture in the batch.** Port the hero helpers
(`addDeckFurniture`, `addShipsBoat`, `addCargoStack`, `addRailPosts`) into
`createFleetBatchGeometry`, varied per rig variant. This is what makes a ship
read as *inhabited* rather than *extruded*, and it costs nothing per ship.

- **Verify:** a 6×6 contact sheet of randomly-sampled batched ships in which no
  two are obviously the same object; draw calls ≤ 620; 60 fps on the real GPU.
- **Risk:** medium — W2.1 interacts with sea-room spacing
  (`gardenShipWaterMarginTiles`) and shadow radius (`world-renderer.ts:1290`,
  already reads `hullForm`). Check overlap at 187 ships before and after.

---

### W3 — More canvas *(the largest single beauty lever)*

Raise mast heights ~35% and sail dimensions ~40% across all rigs, targeting a
sail:hull area ratio near **2.5–3:1** rather than today's 1:1. A fleet whose
mass is coloured canvas rather than coloured hulls is a different, and far more
poetic, picture — and it is the payoff on the heraldry work.

Do this **after W1**, so the judgement is made against timber hulls rather than
against the current colour noise.

- **Verify:** through `npm run preview` at three zooms, day and night. Confirm
  the label anchor, selection radius (`gardenShipSelectionRadius`) and the
  water-margin spacing still hold, and that taller rigs do not create a
  thicket at the densest ring.
- **Risk:** medium — this is the change most likely to need two or three
  iterations to land, and it touches layout. Budget for that.

---

### W4 — Furl the canvas at anchor

A docked ship strikes her courses. Add a furled sail state (the hero generator
already has `addFurled`) selected by dock/moored motion state. 122 of 187 ships
change appearance, immersion improves, and it becomes a legible read: **a ship
under sail is trading; a ship furled is berthed.**

For the batched fleet this is a per-instance UV/scale choice or a second sail
batch, not new per-ship geometry.

- **Risk:** low–medium. Interacts with the sail atlas cell routing.

---

### W5 — The Titans *(the operator's headline ask)*

#### 5.0 The grammar — what makes a Titan a Titan

Before individual ships, the tier needs a shared language, so a viewer can say
*"that's a titan"* before they can say *which* titan. Proposal, applied to all
titan hulls:

- A **stern lantern on a gilded bracket**, above the taffrail.
- A **masthead top-castle** (a fighting top) on the main — no other tier has one.
- **Twin masthead banners** rather than one.
- A **wider wake and a deeper bow wave** than heritage hulls.
- **Lowest-in-fleet or highest-in-fleet freeboard** — titans should be extreme,
  never average.

And the hard design rule, from F4:

> **Every identity feature must clear the hull's beam by ≳0.7 units, or stand
> above the bulwark cap. Anything authored inside the rail does not exist.**

`outputs/hero-silhouettes.mjs` is the acceptance test: **no titan may sit above
IoU ≈ 0.60 against any other hero hull.** Today five pairs exceed 0.75.

#### 5.1 The six, in the operator's order

**USDT — the bullion barge.** *Closest to done; extend, don't rebuild.*
The three-tier counting house is the fleet's second-best identity feature and it
already reads. Push it: add a fourth tier, extend the two derrick booms outboard
past the rail so they break the plan outline (currently `reach: 1.5` against a
half-beam of 2.7 — they are inside the hull), and raise the netted cargo stacks
above the bulwark line so the waist reads as *laden* from above.
*Current worst IoU: 0.759 (carrack), 0.753 (titan).*

**USDC — the revenue cutter.** *Weakest of the seven bespoke hulls.*
Its whole idea — naval order, transparency, the ship you can see inside — is
authored flush with the hull surface (a stern gallery, boarding steps, a gunport
band) and none of it survives. Give it the thing nothing else in the world has:
a **continuous covered spar deck / arcaded gallery running the full length above
the bulwark**, and a **squared stern lantern tower**. Straight lines and repeated
bays where every other hull curves. Keep the near-straight sheer — that is a
good instinct, it just needs something above the rail to state it.
*Current worst IoU: 0.751 (barquentine), 0.743 (dhow), 0.700 (liberty).*

**USD1 — the state barge.** *Fix the bug first; it may be most of the work.*
1. Move the sweep bank outboard to `halfBeam ≈ hullDeckBeam + 0.8` (≈2.5, not
   0.95), raise `deckY` to the true deck (1.55), and lengthen the sweeps.
2. Add an **apostis** — the projecting outboard oar-beam of a real galley — so
   the sweeps visibly hang from a structure outside the hull. This alone
   changes the plan silhouette more than any other single edit in this plan.
3. Raise and extend the gilded stem standard; a 0.9-unit cone at x=6.2 is
   invisible. It should reach forward and up like a ceremonial prow.
*Current worst IoU: 0.778 (maker), 0.771 (sky).*

**USDe — the basis runner.** *Working; sharpen it.*
The trimaran is the only three-hulled thing in the world and it reads. Keep.
Raise the floats' sheer so their tops clear the centre hull's deck (they
currently sit below it), replace the flat 0.3×0.12 balance beam with a real
visible cross-beam arching over the deck, and swap the plain pole main for a
**raked A-frame mast** — delta-neutral rendered as a literal balance.
*Best-in-class already: lowest coverage of the bespoke set at 26.3%.*

**USDS — must stop being DAI.** *The single worst offender: IoU 0.790.*
Keep the shared hull DNA — two ships from one yard is a good decision and it
should survive — but move the entire difference above the rail:
- **DAI** keeps the temple, raised: a closed portico with a **pediment and a
  stepped roof standing clear above the bulwark**, plus the stone ram.
- **USDS** gets a tall **open gilded sun-arch amidships** — a ring or arch
  standing well above the rail — and its third mast made visibly taller and
  moved further aft, so the rig profile differs even at 20 px.
Two ships, one hull, unmistakably different tops.

**XAUT — has no bespoke hull at all.** It shares `garden-hero-titan` with
BUIDL (`unique-ships.ts:119-120`). It needs one, and it has the best brief in
the set:
> **The bullion hoy.** The lowest freeboard in the world — laden so deep the
> waterline is almost at the rail. An **armoured strongroom deckhouse with a
> barrel-vault roof** amidships, a **heavy lifting crane** over it, and a short
> stubby two-mast rig, because gold does not need speed. Extreme by being the
> only vessel that sits *down* in the water while every titan sits up.

Sequence within W5: **XAUT (new hull) → USDS/DAI split → USD1 oar fix → USDC
gallery → USDT extension → USDe sharpening.** Re-run the IoU harness after each
and hold the ≤0.60 gate.

- **Verify:** `outputs/hero-silhouettes.mjs` after every hull; no pair above
  0.60; final sign-off through `npm run preview` at overview zoom, because the
  claim is "recognisable at a glance" and that must be tested at a glance.
- **Risk:** the hero generator is deterministic procedural geometry with
  `assertZSymmetric` and anchor contracts (`anchor-masthead`,
  `anchor-selection`, `anchor-label`, lanterns). Every new hull must keep them,
  and `unique-ships.test.ts` asserts the model list agrees with
  `garden-models.ts`. A new XAUT hull touches `HERO_HULL_MODEL_IDS`,
  `BESPOKE_HULL_OWNER`, `HERO_HULL_BY_ASSET` and the generator's `HERO_MODELS`.

---

### W6 — Poetry *(small, cheap, disproportionate)*

In rough order of yield per hour:

1. **Ships' boats towed astern** on a painter, for the largest hulls.
2. **Gulls** circling the top three by market cap.
3. **Rigging that catches the lantern at night** on the hero hulls — the shrouds
   are already geometry; they just need to take the warm emissive the sails do.
4. **A careened or half-sunk hull** among the graves (`world.graves` and
   `createGardenCemetery` already exist) — a dead stablecoin should look dead.
5. **Bow wave and spray** scaled to speed, so a moving ship reads as moving.
6. **Weather on the cloth**: patches, reef bands and a little grime on the
   oldest issuers, crisp new canvas on the newest.

---

## 4. Sequencing

**Operator decision D8: a single autonomous run, W1 through W6, one review at
the end.** Order is still load-bearing even without stop gates, because each
package's visual judgement depends on the one before it:

```
1. W1  hull timber + sheer strake      ← first: every later visual call is
                                          contaminated while half the fleet
                                          is violet
2. W2  shape budget, silhouettes,      ← judged against W1's timber
       rig variants, deck furniture
3. W3  sail area → 2.5:1               ← judged against W1 + W2
4. W5  the six titans + XAUT           ← independent of W1–W4; no shared code
5. W4  furl at anchor                  ← after W3, since it re-uses the rig
6. W6  poetry                          ← opportunistic, last
```

**Attribution discipline, since there are no stop gates.** A wrong early call
propagates silently through everything after it, so the run must leave a trail:
capture `npm run preview` on the real GPU at the end of **every** package
(`outputs/w1-timber.png`, `outputs/w2-diversity.png`, …) and commit each package
separately. If the final review rejects something, the offending package can be
identified and reverted without unpicking the whole run.

W5 shares no code path with W1–W4 (hero generator vs batched fleet), so it can
be interleaved if the fleet packages stall.

---

## 5. Risks and open questions

| # | Item | Note |
|---|---|---|
| R1 | **Six timber tones may under-separate issuers** | W1 moves the brand from a large surface to a thin one. If issuers become hard to tell apart at overview zoom, the lever is the strake width and the ≤0.12 whisper, not a return to flooded hulls. Measure before deciding. |
| R2 | **W2.1 vs layout** | Wider hull forms mean wider berths. `gardenShipWaterMarginTiles` and the ring packing were tuned at today's spread; check overlap at 187 ships. |
| R3 | **W3 is the iteration risk** | Sail area is a judgement call that will need two or three passes on the real GPU. Do not merge it on the first look. |
| R4 | **Hero anchors and tests** | Every W5 hull must keep `assertZSymmetric`, the five anchors, and agreement between `HERO_HULL_MODEL_IDS` and `garden-models.ts`. |
| R5 | **XAUT's new hull frees `garden-hero-titan`** | BUIDL becomes its sole occupant. Fine, but note it: the "shared" galleon then serves one coin plus hash fallbacks. |
| R6 | **Does "titan grammar" over-signal?** | Bounded by D7: only two shared marks (stern lantern, top-castle), not four. Still re-check the ≤0.60 IoU gate after applying them — two identical badges on six hulls does move the number. |
| R7 | **No stop gates (D8)** | A wrong call in W1 propagates through W2, W3, W4 and W6 before anyone looks. Mitigation is procedural, not technical: per-package screenshots and per-package commits (§4), so any package can be reverted alone. |

---

## 6. Decisions taken (operator, 2026-07-25)

All settled. Nothing below is open.

| # | Decision | Consequence |
|---|---|---|
| **D1** | **Six authored timber tones**, hash-picked — oak, teak, pitch-pine, tarred black, weathered grey, elm — with a **≤0.12 lerp toward the issuer's brand**. | Six materials read as six *kinds* of ship where 214 derived hues read as one kind in fancy dress. The whisper preserves the F1 sibling invariant (USDT and sUSDT must read as kin). Two unrelated coins sharing a timber is accepted. |
| **D2** | **Brand paint on the sheer strake** — one thin bright line at the rail, tracing the sheer curve. | Highest point on the hull, so it survives isometric occlusion. Needs `aStrakeMask` (vertex float) + `aTrim` (instance vec3). No wale band; the hull's existing baked wale shading stays as shading, not paint. |
| **D3** | **Hybrid encoding.** Silhouette, rig variant and hull proportions must keep mapping to real traits. Timber tone, deck-furniture layout and minor trim are free hash picks. | Variety stops being rationed by how many traits we happen to have, and nothing on screen becomes a lie. Governs W2 throughout: a new silhouette must be earned by a trait, a new plank pattern need not be. |
| **D4** | **Sail area target 2.5:1** — masts ~+35%, sails ~+40%. | The frame's dominant mass flips from hull to canvas. Requires re-checking `gardenShipWaterMarginTiles`, `gardenShipSelectionRadius`, the label anchor and densest-ring overlap at 187 ships as part of the same change. |
| **D5** | **USDS and DAI keep the shared hull; the entire difference moves above the rail.** DAI: raised temple with a pediment and stepped roof clear of the bulwark. USDS: tall gilded sun-arch amidships, third mast taller and further aft. | The "two ships from one yard" story survives, which was the right instinct — it was only ever executed below the rail where nothing reads. Cheapest of the three routes to the ≤0.60 IoU gate. |
| **D6** | **XAUT = the bullion hoy.** Lowest freeboard in the world, waterline almost at the rail, armoured strongroom deckhouse with a barrel-vault roof, heavy lifting crane, short stubby two-mast rig. | The waterline itself becomes the silhouette — no other hull sits down in the water. New bespoke hull: touches `HERO_MODELS`, `HERO_HULL_MODEL_IDS`, `BESPOKE_HULL_OWNER`, `HERO_HULL_BY_ASSET`, `garden-models.ts`, `unique-ships.test.ts`. |
| **D7** | **Light titan grammar**: stern lantern on a gilded bracket + masthead top-castle. Nothing else shared. | "Titan" reads as a class at a glance without six ships collapsing into a uniform squadron. Both marks sit above the rail so both survive the silhouette. Re-check the IoU gate after applying. |
| **D8** | **One autonomous run, W1 → W6, single review at the end.** | Full scope including W4 (furl at anchor) and W6 (poetry). Mitigated by per-package screenshots and per-package commits (§4) so a bad early call can be attributed and reverted. |

Resolved without needing to ask: `garden-hero-titan` **stays** as a shared hull
after XAUT leaves — it is the hash fallback for any coin that reaches hero tier
without an explicit table entry, and removing it would break
`heroHullModelFor`. The **hero hull tint is not changed**: it already measures
within 16° of timber on all 29 hero coins (F1), so W1 is batched-path only.

---

## 7. Execution protocol

Written for an unattended run. Each package is done when its gate passes, not
when its code compiles.

### 7.1 Acceptance gates

| Package | Gate | Instrument |
|---|---|---|
| W1 | Zero hulls >60° off timber with sat >0.18 (from 100). Planking legible on every hull. A sibling pair still reads as kin. | Fleet colour audit replay + `npm run preview` |
| W2 | No two randomly-sampled batched ships obviously the same object across a 6×6 sheet. Draw calls ≤ 620. `hullForm` p10–p90 spread ≥ 0.45 of the ±0.32 budget on all three axes. | Contact sheet + `?debug=1` metrics |
| W3 | Sail:hull area ratio 2.3–2.7:1. No new overlap at the densest ring at 187 ships. Labels and selection still correct. | Geometry measurement + `npm run preview` |
| W5 | **No hero pair above IoU 0.60** (today five exceed 0.75). Each of the six recognisable at overview zoom without its sail. | `node outputs/hero-silhouettes.mjs` + `npm run preview` |
| W4 | Berthed ships visibly furled; ships under way not. No atlas-cell regression on identity sails. | `npm run preview`, day and night |
| W6 | Nothing regresses. Each item lands or is dropped — no half-built poetry. | `npm run preview` |
| all | 60 fps, tier `full`, 0 dropped frames on the real GPU. | `npm run preview` |

### 7.2 Hard constraints carried from `CLAUDE.md` and the sail work

- **Never judge looks or fps through Playwright.** `npm run preview` only — it
  goes through the operator's Chrome wrapper and exits non-zero on SwiftShader.
  `outputs/hero-silhouettes.mjs` is safe because it renders nothing: it is a
  geometry projection, not a frame.
- **The sail heraldry is untouched.** Cloth dye, emblem extraction, the 26-ship
  black-sail squadron and `PIRATE_CONTRAST_FLOOR` are all out of scope. W3 and
  W4 change sail *geometry and state*, never sail *colour or mark*.
- **F1 invariant:** a titan and a skiff of the same issuer must read as the same
  issuer. D1's ≤0.12 whisper is what preserves it on the hull.
- **Hero contracts:** every new or modified hull keeps `assertZSymmetric` and
  all five anchors (`masthead`, `selection`, `label`, `lantern-bow`,
  `lantern-stern`). `unique-ships.test.ts` asserts the model list agrees with
  `garden-models.ts`.
- **Desktop gate, dist artefacts, API key** — unchanged, per `CLAUDE.md`.
- Commit straight to local `main`, one commit per package.

### 7.3 Validation

```bash
npm run validate:changed        # while iterating
npm test -- src                 # after any systems/renderer semantic change
node scripts/pharosville/generate-garden-heroes.mjs --check   # after any hero edit
npm run validate:release        # once, before declaring the run done
npm run preview                 # the only valid visual/perf evidence
```

### 7.4 Deliverables at the end of the run

- Per-package real-GPU screenshots in `outputs/`.
- A before/after hero silhouette contact sheet and the final IoU table.
- A written outcome section appended to this document (§8), in the style of the
  sail plan's §7: what shipped, what changed against the plan, what was
  measured and found not worth doing, and the residuals.

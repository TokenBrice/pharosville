# PharosVille Grand Redesign — Evaluation and Plan

- **Date:** 2026-09-02 (post v0.8.0 "Garden of Light")
- **Status:** **Approved direction — operator decided all open items 2026-09-02:** soft shore/fog plate edge · ~60 % land rim with two openings · all chain harbors move to shore stations · East-Asian hull families for all six · hero GLBs regenerated as the last wave · stone steles replace boards · episodic legs at 18–25 % underway · one hero waterfall in Wave 7 · **execution: Wave 0 starts immediately while Wave 1 is planned in detail.**
- **Provenance:** real-GPU frames captured via `npm run preview` on Apple M5 Pro (`outputs/redesign-{day,wholemap,dusk,night}.png`, 1600×1000, 60 fps vsync-capped, 693 calls / 354k tris / 72 textures / 185 ships), two read-only code audits (systems, renderer), one independent design critique, one independent art+technical direction review (Sol), plus the prior plan ledgers (`agents/2026-08-13-ultimate-garden-design-plan.md`, `docs/superpowers/specs/2026-08-13-pharosville-visual-poetry-design.md`).

---

## 1. Verdict

The Garden of Light programme did what it set out to do — colour discipline, one air, one sun arc, anchorages, quieting — and the frames are still not a Japanese garden. The five operator complaints are all correct and all share one root: **the world is an infinite water shader with a rock in it, decorated with Japanese props, viewed as a data field.** A garden is a designed *place*: enclosed, framed, with foreground and borrowed distance, a route through it, and a small vocabulary of large forms. Tuning cannot get there. The next programme is structural.

Because the previous plan was explicitly *subtractive and atmospheric*, this one is explicitly **compositional and geographic**: it changes what is in the world and where, not how the existing world is graded.

## 2. Diagnosis — five root causes, with evidence

### 2.1 No place: the sea is a container, not a composition

- `garden-water.ts:68,131` draws one 900×900-unit plane. `garden-horizon.ts:30-47` is a permanent no-op (root invisible, zero draws). The "lozenge" in the whole-map frame is a shader crossfade (`MAP_CORNER_RADIUS=44`, `uMapEdge≈99`, `uOpenOceanRadius≈111`, open-ocean fade 150→520 camera distance), not a shore.
- Result (whole-map frame): a soft oval of water suspended in slate haze, no shoreline, no plate, no horizon, one pale cloud. Default frame: water touches all four borders; ships are cropped at every edge. The viewport reads as a camera floating over a simulation, never as a composed view.
- The 2026-08-13 finding that "the sky dome can never enter frame" is true **only for an infinite plane**. A *finite* world plate under the same 30° orthographic camera exposes whatever is behind its far edge — which is exactly how the reference isometric diorama gets a sky. The finding closed a door that a bounded world reopens.

### 2.2 One value register: day is milk, dusk is a filter

- Day compresses water, timber, stone, sails and fog into one grey-cyan mid band. No plane reads sun-struck; the cream tower nearly merges with the pale water behind it. Dusk reads as a screen-wide teal/rose grade, not light on forms — the exact "filter over the picture" failure `VISUAL_INVARIANTS.md:90-109` warns about.
- The stack responsible: distance fog (`FOG_NEAR/FAR` 178/300 at reference height 78), height fog (day density .00016, gain .32), three bokashi bands (gains .07/.11/.24, `dayAmount .25`), open-ocean blend, environment Fresnel (`roughness .4`, blend `.82`), and a near-neutral day grade (sat .97) that cannot undo any of it. Each term is defensible; their sum is a veil.
- Region tint strength is `.2` and **luminance-matched** to the water (`garden-zones.ts` `REGION_TINT_STRENGTH_BAND=.18`, danger `.24`; `garden-water.ts` luminance match). Tasteful, and it deletes the one channel that could classify a body at a glance.

### 2.3 Authored below its viewing scale

- The island (`garden-island.ts:134-146,283-438`) contains cliffs, talus, three planted shelves, seven path steps, pavilion, pond, cottage, stair, lanterns, gravel. The lighthouse is ~34 units tall on a ~37-unit rock; under the default view height (~80 units) almost none of that reads. The path is a run of small boxes.
- Harbors (`garden-docks.ts:48-138`) have 5 plans × 5 enclosures × 5 landmarks × 4 rooflines × 4 works × 6 signatures across 11 authored chain identities — and all of it is warehouse/quay/crane/crate/gantry massing at a size where the shared massing dominates. In the frames they are beige loops glued to the rock; the moored hero ships visually *replace* the harbors they belong to.
- Ships: 9 semantic hull classes (`ship-visuals.ts:48-144`) collapse to 7 batched silhouettes (`garden-observatory-slice.ts:89-127`; chartered+crypto → clipper, algo+foreign → junk). Hull form deviates ±.32, issuance draft ±.12, patina is subtle. Every one presents the same 20-pixel signature: brown hull, thin vertical masts, small muted sail. Identity lives in a logo that is three pixels tall at default zoom.

### 2.4 Wrong vocabulary: a European harbour wearing Japanese jewellery

- Primary forms: galleon, indiaman, clipper, barque, schooner, campanile, gantry, crane, dry dock, an Alexandrian monument. Secondary props: torii, lanterns, raked gravel, niwaki, koi. The props confirm nothing because the spatial grammar underneath them is a marina.
- A Japanese garden is Japanese in its *grammar* — irregular enclosure, ma, framed views, landform/water interlock, stepping routes, odd asymmetric triads, shakkei — and only then in its props. Today the grammar is a radial hub diagram.

### 2.5 Motion below perceptual threshold

- Route cycles are 660–1320 s (`motion-planning.ts:619-623`); flow tempo moves that only ±15 %. Risk "drift" is an orbit of .19–.49 tile-units/s on radii of 1.3–4.8 tiles (`motion-sampling/risk-drift.ts`), capped by `GARDEN_MAX_MOTION_TILES=9`. Bob is ~.1 units. Local wakes hide under `constrained` tier or zero overview detail. Footer reads "142 of 185 hold a berth".
- Nominally two-thirds of the fleet is "moving"; perceptually the frame is a miniature paused after movement. The beacon sweep (.2–.42 rad/s) is the only obvious beat. Calm should come from motion being **episodic and localised**, not imperceptible.

**Two prior conclusions to carry forward, not relitigate:** the 2026-08-13 measurements that "widen scale hierarchy" and "lift sail dye toward canvas" were wrong diagnoses still stand; this plan does not touch ship scale spread or cloth colour policy.

## 3. Design concept — *The Seven-Water Lighthouse Garden*

A **chisen-kaiyū (stroll garden) built around connected waters**, with a **tsukiyama** lighthouse island at its heart, a **dry-garden and pine shore** around most of its perimeter, and **borrowed mountains** in the fog. The viewer looks in from an engawa — a veranda edge — not down at open ocean.

### 3.1 The frame (fixes 2.1)

- **Finite world plate.** Water plane shrinks to the map extent plus a margin; the region beyond is no longer water. The plate is bounded by an irregular **land rim around ~55–65 % of the perimeter** — dark rock shore, moss banks, pine masses, one stone path threading the rim between harbor stations — with **two deliberate openings** where the water runs off-frame into fog.
- **Behind the plate: sky.** A graded background (dentō-shoku ladder: shironeri fog seam → mizu → kon zenith by hour) becomes visible past the far plate edge and through the openings. The upper-frame bokashi bands stay, but now they sit on a sky, not on more water.
- **Shakkei.** 2–3 flat headland/mountain layers in the far fog band, 2–4 % value off the fog, one merged unlit mesh. Never data. Must pass the "detached pills" test at all four phases (the cumulus precedent).
- **Near edge = engawa.** The camera-side lower-left corner shows the veranda/shore threshold: a foreground pine leaning into the view over the water (the Hiroshige frame), stepping stones, a stone lantern. Foreground establishes scale and turns the tower into a *view* rather than a *marker*.
- **Default framing re-composed:** rim enters two corners, the tower sits near a third (rule-of-thirds, not centred), one broad water interval stays empty. Whole-map zoom shows the complete plate — a garden seen whole — instead of an oval in soup.

### 3.2 Seven named waters you can tell apart with the signs turned off (fixes 2.2, 2.3)

The partition is unchanged: six risk waters + Wreck Shoal are the **seven named bodies**, and the unnamed open approach (~24 % share) stays as the compositional pause between them (`sea-bodies.ts` `SEA_BODY_TARGET_SHARE`). Bodies stay exactly where the authoritative terrain field puts them (`garden-sea-regions.ts`); their **edges become geography**, their **character is amplified**, and the boards go.

| Body | Geography at its edges | Water character (amplified from existing terms) |
|---|---|---|
| Calm Anchorage | enclosed by shore + reed/lily islets; the torii gate at its mouth | jade mirror; broad reflection; near-zero foam; long slow swell |
| Watch Reach | open lake between low banks | teal; long parallel ripples; sparse reed margins |
| Alert Channel | constricted between two stone tongues | grey-green; directional current streaks; buoy pair |
| Warning Shoals | pale sand/stone bars breaking the surface | milky shallow shelf; short broken ripples; shoal foam |
| Danger Strait | narrow gorge under a dark cliff face | indigo; steep diagonal waves; blown crest foam |
| Ledger Mooring | rectilinear slate basin, aligned timber piles | flat; horizontal striations; no swell |
| Wreck Shoal | secluded tidal inlet, three black-pine reflections | silt; almost still; 5–7 half-submerged ribs and bleached spars fanned across one dark pool |

- Tint strength `.2 → ~.45` with the luminance match relaxed to a *partial* match, so hue carries at distance but does not shout.
- Replace the plank sea-signs with **low stone steles** at body boundaries (in-world, still aria-hidden; the ledger remains the redundant channel), shown at full weight only on hover/inspect once water reads. Displaces: `garden-sea-signs.ts` boards, boundary seams.

### 3.3 Harbors as shore stations (fixes 2.3, 2.4)

- Most chain harbors **move from the island ring to stations along the shore rim**, sited in coves at their body's edge. Ethereum becomes the main *shoin/boathouse precinct* (largest roofline, stone quay, the one campanile-equivalent bell tower); Base/Arbitrum/Polygon are **connected annex pavilions** reached by one covered bridge and a shared path — the hub relation becomes visible architecture, not adjacency on a ring. Others take visibly different station **types**: gate landing, tea-house quay, fishing pier, stepped stone inlet, reed boathouse. TON keeps its detached pigeonnier islet.
- Ships then have **real journeys** — island ⇄ shore, shore ⇄ shore — instead of orbits around a rock. Anchorage clustering, dock-visit weighting and mooring clearance rules are unchanged; only the geometry of where docks stand changes.
- Harbor vocabulary shrinks: **one roofline, one flag shape, one signature** per station; delete crates/barrels/gantries/cranes/dry docks/derricks as identity carriers (they can survive as one instanced "works" prop per station at most). Health factors still read as masonry condition (the W7.8 pattern).

### 3.4 The island as tsukiyama (fixes 2.3, 2.4)

With the harbors gone from its waterline, the island is decluttered to **four large reads**: one strong pine mass (3–5 hero niwaki, odd count, one leaning over the water), one pale path sweep (a single continuous S-curve of gravel, not steps), one exposed rock face (the cliff side, toward Danger), one reflection basin mirroring tower and moon (the W5.2 streak technique). The tower stays as it is — an uncanny foreign relic embedded in the garden, not disguised as a pagoda. Pavilion, pond and mast remain the three secondary reads. Everything else on the rock is landscape.

### 3.5 Six hull families with silhouette-level difference (fixes 2.3, 2.4)

Hull family encodes **collateral/governance**; market-cap tier encodes **scale** (unchanged); fittings encode secondary facts (unchanged). Silhouettes are exaggerated so the family reads at 20 px:

| Family | Maps from `ShipVisual.hullClass` | Silhouette |
|---|---|---|
| Bezaisen merchant carrier | `treasury-galleon`, `chartered-brigantine` | very broad hull, high square stern, one enormous rectangular sail, sealed deckhouse |
| Kobaya runner | `crypto-caravel` | needle hull, low freeboard, two sharp triangular sails, long projecting bow |
| Twin-hull council boat | `dao-schooner` | unmistakable paired hulls, bridge deck, split twin masts |
| Takasebune barge | `yield-indiaman`, `yield-barque` | extremely long low hull, repeating covered cargo bays — yield is visible as length |
| Battened junk | `algo-junk`, `foreign-peg-junk` | short hull, tall asymmetric fan of battened sails, exposed lattice |
| Bullion scow | `commodity-peg-hoy` | round, deep, very beamy, one squat mast, low sail |

- Unknown/micro tiers get an open skiff derived from the nearest family. Logo sails stay; brand cloth policy unchanged (decision F1 + the 2026-08-13 dye finding).
- Cost: 6 families × (hull+sail) + pennant = **13 fleet draws**, two fewer than today. Twin hulls and deckhouses merge into each family geometry.
- Hero GLBs (18 IDs, 5 draws each): keep as-is in wave 0–5; a later wave regenerates them through the asset pipeline to the same six-family language (they are today the loudest carriers of the European register).

### 3.6 Motion you can see and still call calm (fixes 2.5)

- Replace orbits with **legs**: a voyage is a 90–180 s travel leg followed by a 4–8 min rest, not a 20-minute smear. Working vessels cross ~8–14 screen px/s at default zoom (4–8 at overview).
- At any moment target **18–25 % clearly underway**, 8–12 % arriving/casting off/turning, the rest moored. Somewhere in the default frame, one arrival pairs with one departure every ~12–18 s. The 1/3-moored contract (`motion.test.ts:469-489`) is preserved in aggregate; what changes is the *shape* of the moving two-thirds.
- Wakes grow behind the stern, persist 6–10 s, span 1.5–3 hull lengths; the persistent field already supports this (`garden-wakes.ts`, decay `.24/s → ~.12/s`).
- Cloth, pennants, pine crowns and reed margins answer the one wind; the beacon remains the metronome. Routes still mean rendered-chain/risk presence only.

### 3.7 Light and colour on forms, not on the frame (fixes 2.2)

- Day: fewer, larger colour planes with decisive value separation — ink water, parchment stone, pine masses, fog paper, one vermilion. Cut the day fog stack roughly in half (distance fog near/far, height-fog gain, bokashi `dayAmount`) now that the sky supplies the atmosphere the fog was standing in for; restore a sun-struck side on stone and sails and a cool cast-shadow side.
- Night: thin the light puddles (the ember budget already exists) so the moon road is unambiguously the secondary light; sails lose their white at night.
- All of it is tuned only via `npm run preview` on the real GPU.

## 4. Operator decisions (defaults stated; everything else proceeds)

1. **Plate edge treatment.** (a) *Soft* — the plate ends in a shore/fog fade with sky behind; (b) *Hard diorama* — a visible cut edge/tabletop like the reference isometric world. **Default: (a).** Hard edges fight yūgen and bokashi; soft edges keep the garden feeling infinite while being bounded.
2. **Harbors move to the shore rim.** This breaks "harbors ring the rendered island waterline" and is the largest systems change (`world-layout.ts`, `chain-docks.ts`, dock visits, motion paths, hit tests, ledger copy). **Default: yes** — it is the change that gives ships journeys and the island room to be a garden.
3. **Hero GLB re-generation** to the six-family East-Asian language (18 models through the asset pipeline). **Default: yes, as the last wave** — until then hero ships are the loudest remaining European note and are accepted as such.
4. **Sea-sign boards → stone steles + hover.** **Default: yes.**

## 5. Invariants amended (with intent)

| Current (`VISUAL_INVARIANTS.md`) | Amend to |
|---|---|
| "asymmetric, sea-first, and intentionally open" | **unchanged in substance.** The contract forbids uniform fleet fields and requires open water between named bodies; a bounded, asymmetric land rim satisfies both. Reword "intentionally open" → "intentionally spacious" so a finite plate is not misread as a violation; ma stays a positive element |
| "The haze band IS this world's sky" | the haze band is the sky's *seam*; a graded sky is visible past the finite plate and through the openings; the dome is still not the sky |
| "Harbors ring the rendered island waterline" | harbors are shore stations sited in their body's coves; Ethereum/L2 hub read is architectural (bridge + shared path) |
| Sea-body place-names carried by in-world signage | carried by low stone steles (hover-weighted) and the ledger |
| Water "feature-complete vocabulary" one-in-one-out | preserved; each body's amplification names the term it demotes |

Preserved unchanged: complete fleet to 320, anchorage clustering rules, region-field authority, lighthouse primacy, three secondary reads on the precinct, one dominant/one secondary night light, ember budget, one motion clock, reduced-motion static composition, 4-step parity for every semantic cue, all measured ceilings.

## 6. Draw-call funding (the precondition)

Default frame is 693/700. Nothing in §3 fits until ~250 calls are reclaimed; this is wave 0 and is non-negotiable.

| Source | Today (est.) | Target | How |
|---|---|---|---|
| Harbors (`garden-docks.ts`) | 11 × ≤18 ≈ 198 | 12–20 total | merge stone/timber/roof/emissive across all docks by material; instance archetype parts globally |
| Hero ships (18 GLBs × 5) | ~90 | ~25–35 | merge each hero's static sub-meshes into 1–2 geometries at attach (vertex-colour tonal splits); raycast proxies keep per-part identity |
| Island statics (`garden-island.ts`) | many | ≤12 | merge per material bucket |
| Fleet | 15 | 13 | six families |

Spend: land plate 2–4 merged opaque meshes · shakkei 1 · pine/tree 2–3 instanced batches · reed 1 · stone 1 · station buildings 3–4 material batches · steles 1 · optional single hero waterfall ≤2 (opaque ribbon + scrolling foam in the water material; no particles, no reflection camera). Shadow frustum (`GARDEN_SHADOW_STATIC_RADIUS=44`) must grow to cover the rim; re-measure texel density.

## 7. Waves

Each wave is independently shippable, opens with its shed-list, captures phase-0 preview frames at day/dusk/night/whole-map before and after, and lands as reviewable per-slice commits. Effort: S ≤1 d · M 2–5 d · L 1–2 w · XL 2 w+.

### Wave 0 — Funding and baseline (L)
- Baseline capture (done: `outputs/redesign-*.png`, 693 calls / 354k tris).
- Rebatch docks, hero statics, island statics per §6. Gate: ≤450 default calls, identical frame (RMSE vs baseline within AA noise), all hit tests green.
- Widen shadow frustum for the rim; measure.

**Wave 0 ledger (2026-09-02, Apple M5 Pro, real GPU, 1600×1000, 185 ships).** Plan: `agents/2026-09-02-wave0-draw-call-funding-plan.md`.

| Owner group | Before | After | How |
|---|---|---|---|
| wakes (`ship-wake` + `ship-bow-wave`) | 346 | 2 | `garden-wake-batch.ts` — world-wide trail/bow batches, slots for live + departing + outsider |
| harbour ring (docks, flags, cranes, lantern ring, tide line) | 98–107 | 13 | `authorDock` → `DockRecipe`; `garden-harbor-batch.ts` — 7 vertex-coloured buckets, one `InstancedMesh` per prop kind, one instanced flag cloth; per-dock anchors |
| island statics | 77 drawables | 61 | `mergeIslandStatics` by material signature; 13 mandatorily separate |
| heroes | 46 (≤2 each) | 46 | already merged; Task 6 dropped |
| fleet | 15 | 15 | unchanged |
| **default framing, scene calls** | **676** | **~250** | target ≤450 exceeded |

Gates: unit 1655/1655; lint clean; typecheck clean; animated `--assert` default PASS (250 calls, p95 16.8 ms, 72 textures); settled `--assert --reduced` PASS default (67 tex) and whole-map (70 tex); frames indistinguishable from baseline at day/dusk/night/whole-map (`outputs/w0-final-*.png` vs `outputs/redesign-*.png`). Instrument: `npm run preview -- --draw-census` (reconciles exactly to `renderer.info`).

**Open gate item, inherited:** animated `--assert` at `#cam=0,0,0.28` fails on textures (79 > 72). `main` at `fb54c0c` reads the same 79 (42 scene + 37 renderer-internal), measured in-repo. Not a Wave 0 regression; **Wave 1 opens with this as Task 0** — diagnose the 37 internal textures at whole-map (post targets, PMREM, shadow map, wake field, sky billboards) and bring the framing under 72 before any plate geometry is added. The ceiling is not raised.

Findings that changed the plan: the census (not estimates) put wakes, not docks or heroes, at the top; hero merging had already landed; the island's honest floor is 40 non-instanced + 21 instanced, not 12. Deferred minors carried to the final review: hoist the per-frame census callback in `world-renderer.ts`; stale `wakeSlot = -1` comment; batched wakes compose yaw only (heel dropped, accepted); add a batch-level reduced-motion wake assertion.

### Wave 1 — The frame (XL) — the wave that changes what PharosVille is
- Finite water plane sized to plate + margin; delete the open-ocean shader domain (`MAP_CORNER_RADIUS`, `uOpenOceanRadius`, open-ocean fade) — **displaces the lozenge**.
- Land rim geometry from an authored rim field in `src/systems/` (so placement, motion water-safety and hit tests agree); 2–4 merged meshes with vertex colours; two authored openings.
- Sky background gradient per phase; `garden-horizon.ts` resurrected as the shakkei layer (or deleted and replaced); bokashi bands re-anchored to the sky seam.
- Engawa foreground: leaning niwaki, stepping stones, one lantern (lower-left).
- Default camera target/zoom re-composed; attract-mode postcards re-authored; URL camera state and DOM label projection verified while the camera moves.
- Day fog stack halved (§3.7) in the same wave — the sky now does the fog's old job.
- Gate: whole-map frame shows a complete garden plate; 16-px blur audit keeps a large calm dark region; no "detached pill" at any phase.

### Wave 2 — Seven waters (L)
- Edge geography per body (banks, tongues, bars, gorge cliff, ledger piles, wreck inlet) sited from the authoritative region field; merged/instanced stone and reed batches.
- Amplify per-body character in `garden-water.ts` using existing `uRegionParams` (tint `.2→.45`, partial luminance match, per-body directional normals, shallow-shelf term). Shader cost, not call cost; measure p95.
- Restage the wreckyard as §3.2.
- Stone steles replace boards; `garden-sea-signs.ts` shrinks to the stele atlas + hover weight; ledger unchanged.
- Gate: a reviewer names all seven bodies from a signless frame.

### Wave 3 — Shore stations (XL, decision 2)
- `world-layout.ts`/`chain-docks.ts`: dock slots move to rim coves per body; Ethereum precinct + L2 annexes + bridge; TON islet unchanged; dock-visit weighting and mooring clearance unchanged.
- `garden-docks.ts`: station-type archetypes (one roofline/flag/signature each); delete industrial clutter as identity; masonry-condition health read retained.
- Motion paths, hit tests, detail anchors, ledger and legend copy updated; `chain-docks.test.ts` EVM-adjacency test rewritten as "connected precinct".
- Gate: Ethereum and its L2s read as one connected place from the default frame; each other station has a distinct roofline at default zoom.

### Wave 4 — Fleet families and cadence (L)
- `garden-ships.ts`/`garden-fleet-batch.ts`: six family geometries per §3.5; `garden-observatory-slice.ts` maps all 9 hull classes onto them; 13 fleet draws.
- `motion-planning.ts`/`motion-sampling/*`: leg-based itineraries (90–180 s legs, 4–8 min rests), arrival/departure pairing, `GARDEN_MAX_MOTION_TILES` raised to allow island⇄shore legs; wake persistence lengthened. `motion.test.ts` cycle bounds and dwell-share tests rewritten to the new contract; reduced-motion static output unchanged.
- Gate: at default zoom, ≥3 ships visibly underway at any instant with growing wakes; 1/3-moored aggregate preserved; p95 unchanged.

### Wave 5 — The tsukiyama (M)
- Island decluttered to the four reads (§3.4); continuous path sweep replaces step boxes; hero niwaki group; reflection basin mirrors tower/moon.
- Gate: island reads as garden-rock, not fortress-rock, in the blurred audit.

### Wave 6 — Light on forms (M)
- Day/dusk/night regrade on the new composition (LUT regeneration via the existing generator), night ember thinning, sail night-value drop.
- Gate: day frame has a sun-struck side and a shadow side on stone; night has one dominant and one secondary light.

### Wave 7 — Life, one displacement at a time (M + S per item)
- One hero waterfall/stream tying rim to water (≤2 calls, names what it displaces); koi in the calm shallows; pine/reed wind response; seasonal dressing re-sited to the rim. Almanac events re-sited to new landmarks.

### Wave 8 — Hero re-generation (L, decision 3)
- 18 hero GLBs regenerated through `ASSET_PIPELINE.md` rules in the six-family language; manifest hashes, fallbacks and budgets updated.

## 8. Do-not-repeat (carried forward)

WebGPU/TSL (NO-GO, re-entry criteria unchanged) · perspective camera · handheld noise · widening ship scale spread · lifting sail dye toward canvas · billboard cumulus as shipped · volumetric clouds · SSR/planar reflections · raising any measured ceiling for cosmetics · judging look or frame time through Playwright.

## 9. Verification discipline

- Every wave: `npm run preview` at `#t=12`, `#t=19`, `#t=22&n=1`, `#cam=0,0,0.28` before and after; `--assert` animated and `--assert --reduced` settled arms; the 16-px blur audit.
- Systems changes: `npm test -- src/systems`; renderer: `npm test -- src/three src/renderer` then `npm run test:visual`.
- Every semantic cue change lands as the 4-step (derivation → `visual-cue-registry.ts` → detail/ledger → legend). Decorative additions carry an explicit "carries no meaning" note.
- `docs/pharosville/VISUAL_INVARIANTS.md` is amended in the same commit as the wave that breaks the old wording (§5).

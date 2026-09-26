# Data poetry — data-poetry

## Verdict
The world is not short of data. It encodes too much of it at a size nobody can see. The registry holds 36 cues (`visual-cue-registry.ts:113-540`), and almost all of them are sub-pixel marks: pennants, salt courses, datum notches, lighters, gulls. The three coarse readings are legible in only one direction. At PSI 94.8 BEDROCK the noon horizon is still a white wall of haze (`noon.png`, `island-instruments.png`), and the brightest data mark on the island is a permanent storm hoist, raised because one tiny coin is off peg (`island-terrace.png`). The data with the most poetry in it is invisible: 88 dead coins with epitaphs, and 8.7 years of daily PSI (`wreck-shoal-close.png`, `cemetery-ust.png`). The leap is to use fewer phenomena at landscape scale, each a natural process people already know how to read: how far you can see, how much of the tidal flat is exposed, and a stone garden for the fallen. The micro-marks move to the DOM.

## What I looked at
**Baseline frames:** `noon.png`, `golden.png`, `night.png`, `deep-night.png`, `wholemap-noon.png`, `wholemap-dusk.png`, `selected-ship.png`, `selected-lighthouse.png`, `sea-sign-hover.png`, with metrics from `golden.txt` (289 draws / 380k tris / 51 tex).

**My captures** (`outputs/opus-review/data-poetry/`):
- `cemetery-ust.png` (`#t=16.5&sel=grave.ust-terrausd-2022-05`, tier full).
- `cemetery-golden.png` (`#t=17.6&cam=2893,-834,1.2`, full).
- `wreck-shoal-close.png` (`#t=17.9&cam=4288,-2024,2`). The first attempt timed out; the retry came back tier `recovery`, so I used it for composition only.
- `island-instruments.png` (`#t=12.25&cam=1152,-1850,2.2`, full).
- `island-terrace.png` (`#t=12.25&cam=1152,-2300,2.2`, tier `recovery`, composition only).

**Live payloads** (read-only curl via the dev proxy):
- `/api/peg-summary`: `activeDepegCount 19`; `worstCurrent pmUSD −5350 bps`; `coinsAtPeg 166/187`.
- `/api/stability-index?detail=true`: current 94.8 BEDROCK. The history has 3,178 daily points from 2018-01-14 to today. Yearly minimums: 2022 = 11, 2023 = 14, 2020 = 22.
- `/api/chains`: `globalChange7dPct 0.0083` (a fraction, so +0.83% for the week).
- `/api/mint-burn-flows`: `hourly` has 24 buckets, net −94…+102 $M per hour.
- `shared/data/dead-stablecoins.json`: 88 entries, all with epitaphs. By year: 2018 = 1, 2021 = 5, 2022 = 14, 2023 = 18, 2024 = 20, 2025 = 23, 2026 = 7.

**Code read:**
- `visual-cue-registry.ts` (all cues), `detail-model.ts:81-112, 1285-1315`.
- `supply-tide.ts`, `psi-sky.ts`, `epistemic-haze.ts`, `garden-month-record.ts` (systems and three).
- `cargo-tide.ts` (stage).
- `garden-landmarks.ts:179-392` (`createGardenCemetery`).
- `garden-sky.ts:575-700`, `garden-horizon.ts:41-165`, `garden-tide-line.ts:70-125`, `garden-signal-mast.ts:54-169`.
- `garden-island.ts:1876-1968` (quay stair), `use-visit-snapshot.ts:80-144`, `shared/types/{mint-burn,stability,market,pharosville}.ts`.
- Prior reviews: `data-story-ideas.md`, `data-field-inventory.md`, `decision-ledger.md`, reborn plan §2 (D15) and §6.

### What the world encodes today, and how legibly (rest frame)
| Reading | Carrier | Legible at rest? | Verdict |
| --- | --- | --- | --- |
| Market stability (PSI) | beacon and sky cover (`garden-sky.ts:633`) | **Only when things go bad.** BEDROCK, STEADY and TREMOR all give cover = 0. | Muddy. The good-news half of the scale is flat. |
| Risk band | water body per named sea | As *difference*: flat turquoise on the left, chopped navy on the right (`noon.png`). Its meaning needs the legend. | Half-legible. |
| Who leads | hull scale and sail mon | Partly. The biggest "T" sail (**[INFERENCE] USDT**) is cropped at the left frame edge in `noon/golden/night.png` (x 0–100, y 700–900). | Weak. |
| Fleet off-peg / storm | signal mast (`garden-signal-mast.ts`) | **Yes, and it is wrong in spirit.** Permanently saturated: 5 of 5 pennants plus the storm cone. | Spell-breaker. |
| Supply 7d | wet strandline plates (`garden-tide-line.ts`) | No. At 0.34 u the band is about 6 px. | Invisible. |
| PSI 30d worst | salt courses (`garden-tide-stain.ts`) | No. | Invisible, and collides with the supply tide. |
| PSI 30d average | pad tint/scale (`garden-month-record.ts`) | Yes, as **lime** foliage. | Legible but ugly. |
| Dead coins | 18 curated wrecks at water luminance | No, even when selected. | Invisible memorial. |
| Freshness | local fog banks (`epistemic-haze.ts:64-88`) | Can't be told apart from the aesthetic day mist. | Muddy. |
| Mint/burn, chain tempo, fittings, age, buoys | micro-props and motion | No (inspect zoom only). | Fine as inspect-zoom jewellery; they must not grow. |

## Spell-breakers (defects)
1. **The storm hoist flies forever.**
   - *What:* `activeDepegCount` is 19, so the 5-pennant hoist is saturated. `worstCurrent` is pmUSD at −5350 bps, a tiny precious-metal coin, so the storm cone flies too. The harbour reads BEDROCK 94.8 and the caption says "a quiet noon · readings current".
   - *Where:* in `island-terrace.png` the five yellow pennants step down beside the red torii (x 1040–1090, y 735–880) with the black cone at (965, 745). In `noon.png` they are the island's brightest chroma cluster (x 915–945, y 600–700). Mapping at `visual-cue-registry.ts:171-180`.
   - *Why it breaks the calm:* a saturated cue is a constant, so it is decoration posing as a warning. It is a small permanent alarm in a calm harbour, and it outshouts the torii.
   - *Fix sketch:* weight by supply. Pennants = count of top-20-by-supply coins off peg (0–5). The cone flies only when off-peg supply is ≥ 1% of tracked supply. Otherwise retire the mast (see Subtractions).
   - *Cost:* S.
2. **The PSI clarity ladder is one-sided.**
   - *What:* `cover = max(0, NEUTRAL_SKY_CLARITY − clarity)` (`garden-sky.ts:633`) with `NEUTRAL = 0.65` (`psi-sky.ts:3`). BEDROCK, STEADY and TREMOR all give cover 0, differing only through `uHazeStrength` by 0.03–0.06 (`garden-sky.ts:588-591`).
   - *Where:* the best possible market still renders a milk-white horizon (`noon.png`, band y 250–520; `island-instruments.png` behind the tower).
   - *Why it breaks the calm:* the one aggregate reading the operator chose (D15) cannot show good news, and the haze visitors read as uncertainty is really just aesthetic.
   - *Fix sketch:* idea 1.
   - *Cost:* S.
3. **Two water-on-stone metaphors with opposite meanings on one island.**
   - *What:* the salt courses mean "the sea rose high = stress" (`world-renderer.ts:3371-3373`). The strandline means "the water stood high = supply grew" (`garden-tide-line.ts:88`, `world-renderer.ts:3589`). Both are invisible today; make either one visible and it contradicts the other.
   - *Fix sketch:* water height belongs to supply only (idea 3). Retire the salt courses; the month record already carries the 30-day series.
   - *Cost:* S.
4. **A calm month turns the garden to plastic.**
   - *What:* `garden-month-record.ts:14,45-52,72-80` lerps the niwaki pads up to 0.55 and the planted shelves up to 0.75 toward `aurora_green #67a23a` (C 0.150, the palette's chroma ceiling). The trailing-30-day PSI averages about 98, so growth = 1 and the pads are **lime** (`island-terrace.png` x 430–760, y 570–830; `noon.png` x 590–760, y 530–700).
   - *Why it breaks the calm:* good data makes the world look like a toy.
   - *Fix sketch:* flourishing = *depth*, not chroma. Target moss L −0.08, C ≤ 0.09, H ≈ 150 (the dark velvet of a moss garden after rain), with pad fullness kept. Stress goes to straw, as today.
   - *Cost:* S.
5. **The memorial to 88 dead coins cannot be seen, even when selected.**
   - *What:*
     - `sel=grave.ust-terrausd-2022-05` opens the full TerraUSD obituary panel over the unchanged rest harbour; the wreck is off-frame (`cemetery-ust.png`).
     - Framed directly, Wreck Shoal is about 5 dark sticks and one ember behind the rim pines (`wreck-shoal-close.png`, centre x 560–880, y 680–830).
     - The code curates 88 entries down to 18 (`garden-landmarks.ts:194-208`) and tints the timber to "at or below the surrounding water's luminance" (`:210-219`).
   - *Fix sketch:* idea 2. In the meantime, a grave selection should frame its wreck.
   - *Cost:* M.
6. **A UI chip is the only text in the world at rest.**
   - *What:* the "OpenDollar USDO · Calm" arrival chip sits at the same spot (x 430–575, y 575) in `golden`, `night`, `deep-night` and `sea-sign-hover.png`, and it duplicates the bottom-left caption.
   - *Fix sketch:* for arrivals, keep the caption and drop the chip.
   - *Cost:* S. Owner: the UI/Life lane.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)

### data-poetry-1 ★ Clear air is earned: on stable days you can see the far mountains
- **Picture:** On a BEDROCK afternoon the milk lifts. Behind the tower three borrowed ranges stand in clear planes, and the farthest crest catches the sun. When the market wavers, the far range goes first, then the middle one; in a crisis only the nearest hill remains, dim. Mist no longer hangs everywhere. It pools only over waters whose feed is stale, so when you see mist, it means something.
- **Why:**
  - Everyone reads visibility distance correctly: clear air feels calm, and haze feels uncertain.
  - Today the healthy half of the PSI scale is flat (defect 2), and the ridges are ghosts at alpha 0.34–0.41 (`garden-horizon.ts:156`).
  - Aesthetic day mist (`garden-sky.ts:663-666`, `daylight * 0.12`) makes stale-feed fog (`epistemic-haze.ts:64-88`) impossible to attribute. The earlier data-story review flagged that problem, and it is still true.
  - This idea *completes* the channel treaty (PSI owns clarity aloft, stale feeds own low fog). It does not break it.
- **Impact:** stunning 4 / relaxing 5 / poetic 4. **Confidence:** H.
- **Cost:** S–M. **Perf:** 0 draws, 0 tris, 0 textures, ΔGPU about 0 ms [INFERENCE] (uniforms only; the horizon is already one draw; no per-frame JS beyond one uniform write).
- **How:**
  1. Make clarity signed in `psi-sky.ts:4-6`. Keep the table and add `signedClarity = (clarity − 0.65) / 0.35`, clamped to −1…+1: BEDROCK +1, STEADY +0.57, TREMOR 0, FRACTURE −0.71, CRISIS −1.
  2. Add `uClarity` to `garden-horizon.ts`:
     - Per-layer visibility: `vis = smoothstep(threshold[layer] − 0.25, threshold[layer], uClarity)` with thresholds far 0.6, mid 0.1, near −0.9.
     - Alpha: `profile * baseFade * mix(0.10, 0.62, vis)`.
     - `distanceFade * mix(0.7, 0.35, max(uClarity, 0))`.
     - A sun-side crest rim of `+0.06 * max(uClarity, 0) * dusk` (dusk only, so wall-clock light stays the owner of warmth).
  3. In `garden-sky.ts`:
     - Haze: `uHazeStrength = 0.42 − 0.14 * max(signed, 0) + 0.3 * max(−signed, 0)`.
     - Mist: `mistDensity` uses the daylight term `0.12 → 0.03` when `signed > 0` and no epistemic bank is active.
     - Fog: `fogRangeAtViewHeight` gets a negative cover (fog start pushed out ~20%) for positive clarity.
  4. The 60 s hysteresis (`psi-sky.ts:48-52`) stays. Crossfade over 90 s.
- **Displaces:** the aesthetic day mist, and about a third of the haze baseline. The quiet at noon comes from subtracting air.
- **Truth & a11y:**
  - Detail and ledger: lighthouse row "Far shore: three ranges visible — market stability BEDROCK (clarity correlates with the band; it is not weather)". This extends the existing sentence in `selected-lighthouse.png`. Add a legend row "Distance you can see = market stability; low mist = a stale feed".
  - Reduced motion: identical static state; band changes apply instantly.
  - Stale PSI freezes the last good sky (already `psi-sky.ts:31-34`).
- **Risks:**
  - The bible's top-row values (60/72/68 at noon) shift darker where the ridges gain contrast. The art director must re-key the value plan.
  - Clearer air flattens aerial perspective, which is why the near ridge keeps its fog.
  - The fog-range contract tests will need updating.
- **Acceptance:** a real-GPU A/B at `#t=12.25` with forced BEDROCK vs TREMOR fixture. Blurred at 16 px, BEDROCK shows 3 distinct ridge planes and TREMOR shows 1. A `--fixture stress` frame with `pegSummaryStale` shows mist confined to the risk waters, with clear air elsewhere.

### data-poetry-2 ★ The stone garden of the fallen (karesansui for dead stablecoins)
- **Picture:**
  - A bed of raked pale gravel holds 88 stones, one for every stablecoin that died, set in unequal islands by year of death.
  - Toward the back, the 2018–2022 stones are velvet with moss. UST and BUSD stand largest, like old mountains.
  - Toward the front, this year's seven stones are bare pale granite with the rake lines still sharp around them.
  - At dusk one stone lantern burns by the newest group.
  - Hover a stone and its epitaph rises in serif: *"Too big to fail. Too flawed to live."*
  - It is grief made into a garden, and nothing about it is urgent.
- **Why:**
  - Today the memorial is invisible (defect 5), curated to 18 of 88, and floats as wreckage, which reads as disaster debris rather than memory.
  - The bible's picture already asks for a dry-stone garden (`VISUAL_INVARIANTS.md:17-18`). Giving it meaning makes it principle rather than costume.
  - Moss growing over time is a truthful, deterministic encoding of *time since death*, taken from `deathDate` and the wall date.
- **Impact:** poetic 5 / stunning 4 / relaxing 4. **Confidence:** M (the placement needs the garden lane).
- **Cost:** M–L. **Perf:**
  - Removes the wreck batches (3 forms, ribs, masts, cloth, lantern, silt: about 8 draws; `garden-landmarks.ts:343-900`).
  - Adds one instanced stone draw (88 × ~80 tris ≈ 7k tris) and one gravel-bed draw with a **procedural** rake pattern: 0 textures. This is mandatory, because the whole-map texture census is already at its 72/72 ceiling (per LaneHeadroom, `TESTING.md:383`).
  - Net about −6 draws and +3k tris.
- **How:**
  - New `createGardenStoneGarden(graves)` replaces the cemetery root. No `WRECK_QUIET_CEILING` curation (`:194`): the count is exact.
  - **Year islands:** group by `deathDate.slice(0, 4)`, ordered oldest at the back and newest nearest the viewer, with authored odd spacing (not a grid, per the anchorage ban).
  - **Stone size:** `0.25 + 0.95 * clamp01((log10(peakMcap) − 6) / 4.4)` in units, with the minimum pebble when `peakMcap` is absent.
  - **Stone form by cause family:** keep the existing 3-way marker mapping as standing stone (tateishi), split stone, and flat stone (hiraishi).
  - **Moss:** `clamp01((years since death − 0.5) / 3.5)`, as instance colour toward the re-voiced moss from defect 4 plus a top-facing mask in the shader.
  - **Rake rings:** concentric around each island, computed from instance centres in the gravel shader (up to 9 island centres as uniforms).
  - **Lantern:** reuse the existing `cemetery-lantern` light lane (`:227-239`) at the newest island.
  - **Hover epitaph:** the sea-sign inspection pattern (380 ms raise, one deterministic pose under reduced motion).
  - **Site** (for the garden lane to choose): (a) the precinct gravel court on the island's camera-lee (W1.10 already calls for one); (b) the shaded near garden by the engawa, where pale stones on dark gravel suit the 15/10/3 value cell.
- **Displaces:** the Wreck Shoal field and its cause-colour stains, so cause colour leaves the world; the DOM swatch legend stays. It also displaces the decorative Sakuteiki stones, if the site is the island court.
- **Truth & a11y:**
  - One stone per `CemeteryEntry`, every stone selectable, giving the existing `detailForGrave` panel (`detail-model.ts:1285-1315`).
  - The ledger's cemetery rows gain "moss: N years since death". The legend reads "stone size = peak market cap (log); moss = years since death; stone form = cause family".
  - Reduced motion: identical static garden.
  - Grave selection must frame the stone; this fixes defect 5.
- **Risks:**
  - 88 stones can become a carpet. Mitigate by letting the ~12 stones over $100M carry the composition and letting sub-$10M pebbles almost merge into the gravel.
  - It retires the "Wreck Shoal" named water (see Reversals).
  - The count grows over time, so author island bounds with headroom for about 150.
- **Acceptance:**
  - At `#t=18.9` with the chosen site framed: the three largest stones read in a 16 px blur, the moss gradient runs back to front, and the lantern is below the harbour-window ember tier.
  - `sel=grave.ust-terrausd-2022-05` frames the UST stone.

### data-poetry-3 ★ The tidal flat: supply as how much of the shore is bare
- **Picture:**
  - Among the reeds in the pale shallows west of the island lies a broad, nearly level flat of wet sand and shingle.
  - In a week when stablecoin supply grew, the flat is almost covered: a glassy sheet of shallow water with a line of wrack at its edge.
  - In a shrinking week it lies bare and shining, with ripple marks and small mirror puddles, and the almanac heron wades there.
  - One standing tide-stone marks slack water.
  - You read it in a second, the way anyone reads a beach.
- **Why:**
  - The supply tide exists and is correctly derived (`supply-tide.ts:73-93`), but it is drawn as a 0.34 u strandline (`garden-tide-line.ts:70`), about 6 px at rest [INFERENCE: ≈18 px/u, measured from the island's width in `noon.png`], and repeated on every quay wall.
  - Vertical change is invisible at rest zoom. A *shallow slope turns it into area*: on a 1:40 flat, 0.12 u of vertical excursion moves the waterline about 4.8 u, roughly 85 px at rest [INFERENCE, same scale]. Real tidal flats work exactly this way.
  - The site is inside the island's non-attributed halo (`world-layout.ts:57-62`), so it cannot touch risk-water classification.
- **Impact:** poetic 5 / relaxing 5 / stunning 3. **Confidence:** M–H.
- **Cost:** M. **Perf:** +1 draw (flat mesh ≈ 2k tris, opaque wet-sand material with waterline darkening computed from world Y), −1 or 2 draws from retiring the tide-line plates and the stain. Net about 0 draws, 0 textures (procedural ripples), ΔGPU < 0.1 ms [INFERENCE]. The 20-minute ease is a shader uniform, so there is no per-frame JS.
- **How:**
  - New `garden-tidal-flat.ts`: a gently domed flat (max slope 1:40) whose root `y = WATER_Y − 0.06 − tide.offset * 0.12`, so flood submerges it and ebb exposes it.
  - The shader grades from dry (L +0.06) above `WATER_Y + 0.04` to wet (L −0.1, specular 0.6) at the waterline, with a thin wrack line (dark, 0.05 u) exactly at the intersection.
  - Ripple marks come from a sine-ridge normal.
  - The tide-stone sits at the offset = 0 waterline. The flat stays at the datum with **no tide-stone** when `state === "unavailable"`, which keeps today's distinct failure state (`visual-cue-registry.ts:444`).
  - When the weekly value changes, ease over 20 min, a tide going out while you watch (instant under reduced motion).
  - The heron (an existing almanac event) prefers the exposed flat. It is decorative, not a count.
- **Displaces:** the quay-wall tide-line plates (`garden-tide-line.ts:179`, `world-renderer.ts:3589`), the island-rock strandline (`garden-island.ts:586-590`), and the PSI salt courses (defect 3).
- **Truth & a11y:**
  - Keep the "Supply tide 7d" row (`detail-model.ts:862`) and reword it to the form: "The flat stands mostly covered — tracked supply +0.83% over 7 days (flood; √ scale, full at ±2%)".
  - Update the ledger clause and legend.
  - Never oscillates, so it is a state, not a clock.
  - Reduced motion: the identical static flat.
- **Risks:**
  - The flat must not cut the empty inlet: keep it west and off the approach axis.
  - The water shader's shallow-shelf terms (`uRegionDistance.g`) may double-shade the flat's edge, so exclude its footprint or tint it with the same field.
  - A "tide" still invites a reading of periodicity; the DOM wording covers that.
- **Acceptance:** fixtures at `globalChange7dPct` of −0.02 / 0 / +0.02, `#t=12.25`, rest camera. The exposed-flat area differs visibly across all three in a 16 px blur. Unavailable shows no tide-stone.

### data-poetry-4 The Long Record: an emaki scroll in the lighthouse panel
- **Picture:**
  - "Read the record" unrolls a horizontal scroll: 8.7 years of daily PSI brushed as one sumi-ink ridge line, calm plateaus with two deep valleys at May 2022 and March 2023.
  - Beneath the line, small grey stones sit at each dead coin's month.
  - The last 30 days are washed in pale moss; today is a dot.
  - Hover a valley and it names the month and its low.
- **Why:**
  - `stability.history` carries 3,178 daily points back to 2018-01-14, and the world reads only the last 30 (`garden-month-record.ts:18-43`).
  - This is the answer to "a monthly record as a scroll", and exact truth belongs in the DOM.
  - It turns the panel (`selected-lighthouse.png`: three lines of text) into the most beautiful truthful object in the product, at zero GPU cost.
- **Impact:** poetic 4 / relaxing 3. **Confidence:** H.
- **Cost:** M. **Perf:** 0 GPU (DOM SVG, about 3k points decimated to about 400).
- **How:**
  - In the `detailForLighthouse` expansion (`detail-model.ts:723-778`), add an SVG `<path>` with an ink stroke (`HARBOR_UI_PALETTE.ink`) and a 1 px pressure variation. Deaths come from `RUNTIME_CEMETERY_ENTRIES` by `deathDate`.
  - Beneath, a 24-cell "today's issuance" strip from the unused `mintBurn.hourly`, with ink weight by volume and the sign as above or below a hairline. **DOM only.**
  - Uses the existing token set (W5.5).
- **Displaces:** the plain "Read the record" text list for the lighthouse.
- **Truth & a11y:** SVG `role="img"` with a summary sentence, plus a visually hidden `<table>` of yearly min/avg and deaths per year. Static, so reduced motion is unaffected. Wording: "PSI is an index; lows are daily closes".
- **Risks:** it could become a chart widget. Keep one line with no axes except year ticks, and no interaction beyond hover labels.
- **Acceptance:** `#t=16&sel=lighthouse` with "Read the record" expanded. The two valleys read at a glance, and a screen reader announces the summary and table.

### data-poetry-5 "Since your last visit" as a wrack line on the flat
- **Picture:** Returning after a week, you see a faint pale line of dried weed higher up the flat than today's waterline: the water stood there when you last came. Nothing else marks your absence.
- **Why:** `use-visit-snapshot.ts:80-89` already persists a baseline in localStorage but stores no supply, and the DOM banner is the only surface. A single static mark relative to *your* last reading is personal, truthful and non-urgent.
- **Impact:** poetic 4 / relaxing 4. **Confidence:** M.
- **Cost:** S (after idea 3). **Perf:** +0 draws (a second wrack line inside the flat shader, one uniform).
- **How:**
  - Add `supplyTideOffset` to `VisitSnapshot` (schema bump; old shape = baseline-only, as today).
  - The flat shader draws a 0.04 u line at `WATER_Y` for the previous offset, alpha 0.35, only when |Δoffset| ≥ 0.15.
- **Displaces:** nothing. It is the world twin of the existing banner, which gains "supply tide: ebb → flood".
- **Truth & a11y:** the banner and ledger state it. Reduced motion: identical static mark. With no storage, there is no line.
- **Risks:** a first visit shows nothing, which is correct.
- **Explicitly rejected:** petals accumulating by days away. That is absence-as-reward, adjacent to the rejected daily-login mechanics (`01-implementation-plan.md:343`).
- **Acceptance:** seed a snapshot with offset −0.6 and load with +0.64. Two lines are visible on the flat at rest, and the banner text matches.

### data-poetry-6 Leaders go "down by the head" when off peg
- **Picture:** When a top-ten coin trades below par, its hull settles bow-down a few degrees at anchor, like a ship taking water. Above par, it lifts bow-up, riding light. It is visible from the terrace, and nothing flashes.
- **Why:** `cue.ship.peg-trim` (`visual-cue-registry.ts:303-312`) already carries the sign as vertical heave, which is sub-pixel at rest. Pitch on the largest hulls is the only peg encoding that could read at rest, and it strengthens the "who leads" reading: are the leaders sound?
- **Impact:** poetic 3 / truthful legibility 4. **Confidence:** M.
- **Cost:** S. **Perf:** 0 (the existing `pitch` pose field, `garden-fleet-batch.ts:1292`).
- **How:**
  - For `sizeTier` titan/heritage only, add bow pitch of ±2.5° at ≥ 50 bps and ±5° at ≥ 200 bps (the existing gates).
  - The sign follows the deviation.
  - Change eases over 30 s; reduced motion applies it instantly.
- **Displaces:** the heave component on those hulls, so the channel does not stack.
- **Truth & a11y:** the existing "Peg deviation" row names the direction; add "hull trimmed bow-down". The legend states it. Reduced motion: static pose.
- **Risks:** confusion with wave pitch. Hold the static component clearly above the wave amplitude on those hulls.
- **Acceptance:** a fixture with USDC at −250 bps, `#t=12.25`, rest camera. The pitch is visible against a par hull beside it.

## Subtractions
- **The signal mast's pennants and storm cone** (`garden-signal-mast.ts`). If the supply-weighted gate (defect 1) is not taken, remove the mast. Its figures stay in the lighthouse panel.
- **PSI high-water salt courses** (`garden-tide-stain.ts`, `world-renderer.ts:3371`). They duplicate the 30-day series and collide with the tide.
- **Tide-line plates on every quay wall** (`garden-tide-line.ts:179`): one fleet-wide number painted about 20 times.
- **Aesthetic daylight mist when feeds are fresh** (`garden-sky.ts:663-666`), so that mist means "stale".
- **Wreck cause-colour stains** (`garden-landmarks.ts:221-225`), which go with idea 2.
- **The arrival chip** at rest (defect 6).
- **Registry freeze:** no new per-ship micro-cues. New meaning enters only as landscape-scale phenomena, each naming the micro-cue it retires.

### Rejected in this lane
- **Live price tickers.**
- **Red or flashing depegs.** Red water was already rejected (`01-implementation-plan.md:342`).
- **Fireworks on records.**
- **Harbour crowding for chain concentration.** It adds hull density, which the bible bans.
- **Sail angle for peg.** Sails are identity cloth, and the wind owns their motion (W4.4).
- **Shishi-odoshi or other devices that tip per $X minted.** They invent a rate from hourly aggregates.
- **A data-driven moon (W4.15).** It falsifies astronomy, and the wall clock is the premise.
- **Liquidity-depth encodings.** The liquidity endpoint is not among the 7 PharosVille payloads (`shared/types/pharosville.ts:18-26`), so this would need new server work first.

## Reversals
1. **"The world offers three readings"** (`VISUAL_INVARIANTS.md:41-43`).
   - *Proposal:* amend it to **three live readings** (tower and sky = stability, water = risk band, hero ships = who leads), **one slow reading** (the tidal flat = weekly supply), and **one memory** (the stone garden = the fallen). Everything else is inspection-only.
   - *Evidence:* the registry already ships supply, month-record and memory cues outside the three, and every one of them is invisible (inventory table above). "Three" is not what keeps the frame calm. Scale is. A cap of 5 phenomena, each at landscape scale, is calmer than 36 invisible marks plus a saturated hoist.
   - *Risk:* scope creep. The cap and the displacement rule enforce it.
2. **D15 / W4.14 (supply tide gauge demoted to Ext, mutually exclusive with the moon record;** `01-implementation-plan.md:69,196-197`).
   - *Proposal:* ship the tidal flat and drop the moon record permanently.
   - *Evidence:* the D15 condition was "only if the sky reading has not saturated attention". Defect 2 shows the sky reading is flat in every healthy band, so attention is far from saturated. The flat is landscape, not a gauge, and it retires three invisible cues.
3. **Cemetery as Wreck Shoal, in the water** (the composition consensus "graveyard holds", `decision-ledger.md:29`; the seventh named water in `visual-cue-registry.ts:292`).
   - *Proposal:* move the memorial onto land as a karesansui. Wreck Shoal becomes plain water, or keeps its name as the stones' view line.
   - *Evidence:* `wreck-shoal-close.png` and `cemetery-ust.png`: 18 of 88, occluded, at water luminance by design.
   - *Risk:* reopens a macro-composition decision and the seven-name sea-sign set, including its tests.
4. **`WRECK_QUIET_CEILING` curation** (`garden-landmarks.ts:190-208`).
   - *Proposal:* show all 88, because truth is the census. As stones, the small entries become pebbles, so the count does not cost calm.

## Cross-lane dependencies
- **LaneGardenMaster:** the site for the stone garden (island court vs engawa shade), gravel and rake treatment, the moss colour (defect 4, shared with idea 2), and removing the Sakuteiki stones if the site is the court.
- **LaneHarbour:** the tidal flat's footprint vs the empty inlet and reed shallows; its interaction with the water shader's shallow-shelf field; retiring Wreck Shoal as a named water; framing the leader (the USDT sail cropped at the left edge).
- **LaneArtDirector:** re-keying the top-row values once clear air exposes the ridges; confirming that the lime foliage is a defect; the lantern tier for the stone-garden lantern.
- **LaneLife:** the heron on the exposed flat (displaces the heron's current landing, adds no count); dropping the arrival chip.
- **Sky/atmosphere lane (if separate):** idea 1 changes `garden-sky.ts` fog, haze and mist. It must be the only writer of daytime mist.
- **UI/DOM lane:** the emaki scroll (idea 4), hover epitaphs, new legend rows, and the banner wording (idea 5).
- **Rendering headroom:** net draws across ideas 1–3 are about −6. The only new triangles are about 7k for stones and about 2k for the flat.

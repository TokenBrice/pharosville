# PERF lane — prettier sweep cost attribution and trims

Branch `prettier/perf` (from the merged `feat/prettier` head 51061399). Baseline = v1.2.1 dev server (pv-base).

## Method

- Every number is the GPU time of a whole frame (`EXT_disjoint_timer_query_webgl2` around `Engine.frame`), read via
  `scripts/harbour/shot.mjs --eval` (harness: `outputs/perf/attr2.js`, not committed). The harness stops the
  engine's own rAF loop and drives `Engine.frame` itself, issuing its own timer query per frame.
- Attribution is A/B **within one page load**: each frame randomly applies a toggle (hide an object, swap a material
  for a variant whose GLSL has one feature cut, no-op a system's offscreen pass) or not; the delta is
  median(on) − median(off). Random assignment cancels the iGPU's clock drift (sequential toggles read ±15 ms of
  drift on the AMD proxy: useless).
- Totals across builds: alternated page loads (base / current / merged-ref), ≥ 3 each, medians. The weather is pinned
  (`&cloud=0.35&wind=0.3`): cloud cover changes the sea's cost by several ms between loads. Night windows run 300-400
  frames so a full beam revolution is averaged (the beam's on-screen shaft moves the post cost by up to 15 ms).
- iGPU proxy = `--igpu --uncapped`, `?quality=low&dpr=1` (the governor's pick there), 1600×1000. RTX = `--uncapped`,
  governor default (High, dpr 1).
- Variance that remains: iGPU totals ±5 % between loads by day, ±10 % by night (base included).

## Attribution (merged head vs v1.2.1, iGPU proxy, Low, before any trim)

Totals: day ≈ 52 → 70 ms (+35 %), night ≈ 60 → 80 ms (+33 %) on the pinned weather (the orchestrator's +20 % was
unpinned). In-scene deltas (cost when the object/feature is removed; new vs base):

| Item | Day Δ (ms) | Night Δ (ms) | Notes |
|---|---|---|---|
| Sea: sun shadow on the water (02-L1) | **+5.5** | +1 | ONE tap of the 2-4k depth map, minified across the mid/far sea: texture-cache thrash |
| Sea: clouds in the mirror (03-O2) | +2.7 | +1.3 | 2 cloud-noise taps at the reflected point |
| Sea: Posidonia (03-O6) | +0.6 | +0.3 | 2 noise taps on the bed |
| Sea: gust paws, tone bands, golden warmth, swell trains, heliograph, slick, biolum | +0.1…0.3 each | ≤ 0.4 | |
| Sea total | +8.5 | +8.6 | standalone (sea only) +17: per-pixel cost ≈ 1.9× |
| Kit (island/civic/tower) program additions | +3…4.5 | +4.6 | crop farm year ≈ 2.5 (value-noise taps), aerial ≈ 1.2, run-up ≈ 1.1, metal ≈ 1, beam light 0.6 day / 1.6-3.3 night, lamp wave ≈ 0.8, sway ≈ 0.8 (vertex), dew ≈ 0.2, hover ≈ 0.4 |
| Fleet program additions | +0.7…1.2 | +1…1.5 | topside weathering ≈ 0.7, sail glow ≈ 0.4, aerial ≈ 0.25, motion VS ≈ 0.1 |
| Wake stamps (still hulls 8× area, lee slick) | +0.5 | +0.4 | the history decay pass itself (pre-sweep) is ~1.5 |
| Post (dither) | +0.3…0.7 | ≈ 0 | |
| Point lights, life, civic, weather, sky, identity, chart, beam halo, lighthouse | ≤ 0.6 each, within noise | | |
| New draws (bunting, storm cones, herds, dolphins, office works, route line) | ≈ 0 | ≈ 0 | hidden objects are `visible=false` (0 draws) |
| CPU (per-system update, `?prof=1`) | no measurable GPU-side change | | |

RTX (High): merged head was only +0.3-0.5 ms over base by this harness (base ≈ 1.3 / 1.7 ms day / night).

## Trims (commits on `prettier/perf`)

| SHA | What | Measured gain (iGPU Low unless stated) | Look |
|---|---|---|---|
| bcd45791 | Still-hull wake stamps in a lee-aligned quad (~2.5× fewer fragments) | ≈ 0.4 | identical (`debugSea=7`) |
| 1b9bce51 | Sea reads the sun shadow from a resolved mipmapped R8 mask (half map res, 1/4 taps per tier, own matrix) | **5.5 → 0.8** (day) | identical (`debugSea=8` at 16.8 h) |
| 800eeb04 | Low: HB_LITE kit + sea (no metal sheen, dew/rime, terrain dryness, pool lamp wave; no mirror clouds, Posidonia). Any tier: stooks / summer glow compile only when the calendar can show them | ≈ 3 day / 4 night | Low only: no cloud reflections, plain bed; High unchanged |
| defb5ac4 | Crop farm-year stages compile-time per visit (HB_CROP_*); aerial amount per vertex; Low also drops sway gust paws and fleet topside weathering | ≈ 2.5 (crop) + ≈ 1 | identical on High |
| d0825252 / b975a2c5 | Beam light uniform early-outs (kept); run-up/coin reorders backed out (measured slower) | ≈ 0 | identical |
| 6239f9bd | Wake history decays every other frame on the summed dt; no per-frame Color allocation | ≈ 0.5 | identical (debugWake) |
| dbb6ecfa / 00a31fdf | Beam swath fragment reject: measured **slower** (+0.9, divergence) → reverted | — | — |
| 7ec5237b | Low: the beam swath's soft amount per vertex (kit + fleet) | ≈ 1.5 night | Low only, no faceting seen |

## Final numbers

Alternated loads, medians of 3 (pinned weather; night windows span a beam revolution). `ref` = merged head 51061399,
`cur` = this branch.

| | base v1.2.1 | merged head | this branch | vs base |
|---|---|---|---|---|
| iGPU proxy, Low, day t=11 (ms) | 54.4 | 73.0 (+34 %) | **63.3** | +16 % (+8.9 ms; an earlier session read 57-58, +6 %) |
| iGPU proxy, Low, night t=21.5 (ms) | 62.4 | 81.0 (+30 %) | **74.9** | +20 % (+12.5 ms) |
| RTX, High, day (ms) | 1.48 | 1.82 | **1.82** | +0.34 ms |
| RTX, High, night (ms) | 1.64 | 2.01 | **2.09** | +0.45 ms (noise ±0.2) |

RTX is inside the +0.6 ms target (High is untouched by the Low trims; the sea-shadow mask is neutral there). The iGPU
target (+8 %) is NOT reached: the sweep's added cost is roughly halved by day and cut by a third at night. What is
left is spread thin (kit ≈ +1.5-3, sea ≈ +2, fleet ≈ +1, post/dither ≈ +0.5, wake ≈ +0.3): no single item above
~1 ms that can go without a visible change on Low. Next candidates if the operator accepts more Low-tier trade:
sea sun-shadow off on Low (≈ 1 ms; loses the island's shadow on the water), wake field at 1024² on Low (≈ 1 ms;
needs wider Kelvin lines to avoid sub-texel crawl), dither off on Low (≈ 0.5 ms; night-sky banding).

## Left / notes for integration

- A shader's cost on the AMD proxy behaves like register pressure / code size more than executed work: any one
  feature removed saves 0.5-1.5 ms; per-fragment rejects that add a divergent branch often cost MORE (two backed
  out). Measure each change; never assume.
- Night post cost swings by up to 15 ms with where the beam's shaft sits on screen (pre-sweep; HarbourBeamEffect).
- Pre-existing, not touched: the 4 promoted point lights stay visible at intensity 0 by day (~1 ms on the proxy;
  hiding them would recompile every lit program at dusk); the wake history pass at 2048² on every tier.
- Low-tier look changes (no data cue touched): no clouds in the sea's mirror, no Posidonia, no gilt/bronze sheen, no
  dew/rime, meadows without terrain dryness, pools light all at once (no lamplighting wave), crowns sway without the
  gust paws, clean fleet topsides, per-vertex beam swath. Beam reach/colour (PSI), run-up (sea state), weather
  (DEWS), fog (stale), hover, season colours and aerial distance are unchanged on every tier.
- Merge hazards: hot files touched — `world/materials.ts` (lite flag, crop defines, aerial/beam vertex injection,
  program keys `hb_kit_*_c<stages>[_lite]`, fleet key `hb_fleet_v9g2[_lite]`), `ocean/ocean-system.ts` (quality
  listener, defines), `fleet/fleet-material.ts` (key + `mats.track`). `sunShadowUniforms.uKeyShadow` is gone (the sea
  binds `uSeaShadow`).

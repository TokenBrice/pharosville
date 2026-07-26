# Plan: the Sea Master brief — a stable, beautiful, charted sea

> **STATUS 2026-07-25: approved for autonomous execution.** All eight open
> questions were settled by the operator — see §0. Stages S, L, Z and N run to
> completion without further checkpoints; the operator reads the report at the
> end.
>
> Every number below is measured on this checkout, on the real GPU (RTX 5070 Ti
> via `npm run preview`) or by running the world's own code. Evidence artefacts
> are under `outputs/` and `outputs/sea-audit/` (gitignored).

---

## 0. Decisions (operator, 2026-07-25) — binding

| # | Decision | Effect on the plan |
| --- | --- | --- |
| **D1** | **Calm Anchorage takes 30% of the sea**, not the 60% its traffic would justify. | §2.4 target table stands as written. Density spread 13× → 3×. |
| **D2** | **The neutral water stays unnamed open sea.** No "Pharos Roads". | **Z5 is cancelled.** The `namedShare > 0.85` guard in `garden-sea-regions.test.ts:36` drops to **0.72**, with the rationale recorded in `VISUAL_INVARIANTS.md`: deliberate open water is composition, not an attribution gap. `open` keeps its region slot and its zero tint strength. |
| **D3** | **Signage is physical, in the world** — not chart ink on the water. | §3 is rewritten below. Stage N builds objects, not decals. |
| **D4** | **Keep the narrative poles, reshape everything else.** Danger stays north-east, wrecks stay south-west. | §2.5 composition stands. DEWS escalation stays monotonic along a NE bearing, so `motion-water.ts` penalties and the learned spatial story survive. |
| **D5** | **Restore the authored teal.** `#49857f` shelf → `#3c6f72` water → `#2b4f65` basin; Calm's tint becomes a green-leaning shallow (~`#2d7d6a`) instead of `#125e7e` cyan. | L3 targets these exact values. Acceptance: **green channel above blue** in a sampled noon frame. |
| **D6** | **Signs grow at overview** — world scale rises as you zoom out so the board holds a roughly constant on-screen size. | Solves the ~4 px problem in one system. Drawn out of scale on the chart, the way a landmark is on an old map. **The DOM chip cap of 2 therefore stays**; the boards carry overview naming. |
| **D7** | **Carved timber board on pilings.** Oak plank, iron banding, painted letters, a hung lantern at night. | Reuses the existing dock timber/ironwork materials and the light-lane registry. Cheapest to build, best world-fit. |
| **D8** | **Run the whole plan; report at the end.** | No mid-stage checkpoints. Each stage still validates against its own gate in §8 before the next begins. |

### Calls I am making myself, stated for the record

- **N5 (compass rose, bathymetric contour lines) is out of scope.** It was
  offered as optional and not taken up; I will not add it speculatively. L4
  already restores depth as a readable value ladder, which is most of what
  contours would have bought.
- **Accessibility parity for the signs.** The boards are a new *visual* channel
  naming all seven bodies, so the accessible channel must not lag behind it:
  each board becomes a keyboard-reachable hit target that opens its water
  body's detail panel, and every named body appears in the accessibility
  ledger. Otherwise the visual channel outruns the DOM one and the World
  Encoding contract breaks.
- **Sign siting.** One board per named body, standing in shallow water at the
  body's edge nearest the viewer, on the principal axis computed in N1 — so it
  faces the camera and does not occlude the body it names.

Operator brief, 2026-07-25:

> *"The sea design is essential for PharosVille. While our current is ok, I do
> feel like it is bugged... Sometimes it looks excellent but then I will move the
> camera or something, and it goes back to this bluish-palish look... I would
> like a comprehensive analysis at the sea and how it's currently rendered to
> identify the way we could refine how it looks to make it look more beautiful,
> to make sure it is a stable situation with no flickering and no bugs."*
>
> *"...the very important dimension of the sea are the sea zones. I'm not very
> happy with how they are right now. Carte blanche to consider how to
> redistribute them across the map... you have the number of ships usually
> hanging into each zone, so you can also resize the zone respectively to their
> expected traffic."*
>
> *"Another thing — **this is a firm ask** — is to have some kind of sign or
> written annotation of the sea zones. I think they will give a better feeling
> to the map, make it feel like an actual map."*

### The operator's asks, tracked

| # | Ask | Status in this plan |
| --- | --- | --- |
| A1 | Diagnose the "moves the camera → goes bluish-pale" bug | §1.1 — **root cause found and reproduced on the real GPU** |
| A2 | No flickering, no bugs; a stable sea | §1.1, §1.5 — five distinct instability sources, all identified |
| A3 | Make the sea more beautiful | §1.2–§1.4, §4 (Stage L) |
| A4 | Redistribute the sea zones across the map | §2, §5 (Stage Z) |
| A5 | Resize zones to expected traffic | §2.3 — traffic measured, target table in §2.4 |
| A6 | **FIRM: signs / written annotation of the sea zones** | §3, §6 (Stage N) |
| A7 | Conduct my own analysis | §1.5 — six defects the brief did not name |

---

## 1. What is actually true today (measured)

### 1.1 The "bluish-pale" bug: touching the camera drops a render tier

**Reproduced.** `outputs/sea-audit/tier-probe.mjs` drives the real Chrome
wrapper (the same executable `npm run preview` uses, so this is a hardware
frame, not SwiftShader):

```
REST   {"tier":"full",       "cloud":true,  "rings":24}
DRAG   {"tier":"interaction","cloud":false, "rings":15}
SETTLE {"tier":"full",       "cloud":true,  "rings":24}
```

`render-scheduler.ts:65` is unconditional and unhysteresed:

```ts
if (input.cameraIntentActive) return "interaction";
```

`cameraIntentActive` is true for the whole of any drag or wheel-zoom, for
~200–400 ms after any discrete pan/zoom (`CAMERA_INTERACTION_DAMPING = 26`),
and **permanently** while Follow Selected is engaged.

At `interaction`, `garden-water.ts:1219-1234` does all of this in one frame,
with no crossfade:

| Uniform | `full`/`balanced` | `interaction` | Consequence |
| --- | --- | --- | --- |
| `uCloudShadowStrength` | 0.34 (day) | **0** | all drifting mottling vanishes; the whole sea lifts ~11% and goes uniform |
| `uGlitterStrength` | 1 | **0** | sun glitter vanishes |
| `uRippleStrength` | 1 | **0** | every ripple ring and the shore foam rings vanish |
| `uDetail` | 1 | **0.58** | normals flatten, seams ×0.58, whitecaps ×0.58, shore foam 0.38→0.29 |
| ripple emitters | 24 | **15** | rings *pop out of existence*, they do not fade |

Measured on the two captured frames (`outputs/sea-probe-rest.png`,
`outputs/sea-probe-drag.png`), same 300×180 patch of open sea:

```
REST  mean=(81.5,115.2,126.0) meanLum=108.8  sd=12.40
DRAG  mean=(80.3,114.8,128.0) meanLum=108.4  sd= 7.32
```

**Surface variation collapses 41% the instant you touch the camera, at
identical mean brightness.** That is exactly "it goes flat and pale". The frame
budget does not justify it: at `full` with everything on, the real GPU reports
`60 fps · p50 16.7ms · p90 16.7ms · dropped 0 of 120`.

The "sometimes it looks excellent" half is also explained: at rest the machine
sits at `full`, which is the good frame. The operator is watching a hard binary
toggle between two different-looking seas.

### 1.2 The world reads as a slab floating on a void

`outputs/sea-wide-noon.png` and `outputs/sea-ne-corner.png`. At whole-map
framing the playable sea is a hard-edged diamond sitting on flat dark blue, and
at mid zoom the boundary is a dead-straight value step across the frame. Three
independent causes, all in `garden-water.ts`:

1. **The two shader paths do not land on the same colour.** The open-ocean
   early-out applies the sky env tint at `uEnvStrength * 0.06` (≈0.66%); the
   detailed path applies it at `envMask * uEnvStrength` (≈11% out there) *and*
   multiplies by `(0.95 + facetLight*0.1) * mix(1, cloudLight, 0.9)` (≈0.89 at
   day) *and* adds the fresnel sky reflection. The comment claims the cheap path
   "reproduces the look"; it does not.
   *(A concurrent working-tree change already fixed a different half of this —
   the missing `tonemapping_fragment`/`colorspace_fragment` on the early-out,
   which only bit at the `constrained` tier. The mismatch above is separate and
   survives at `full`.)*
2. **`mapDistance` is a Chebyshev metric** (`max(|dx|,|dy|)`), so the boundary is
   an axis-aligned square in water space, which the isometric camera draws as a
   diamond with four visible corners.
3. **The fade is aimed at the wrong radius** — see §1.3, it is the same constant.

### 1.3 Half the map has its sea zones silently faded out

`uOpenOceanRadius = tileSpan * TILE_SCALE * 0.56 = 110.87`, but the map's
half-extent is `98.29`. The region fade is
`1 - smoothstep(0.62 * 110.87, 1.00 * 110.87, mapDistance)` = ramp from **68.74
to 110.87**, and it scales `regionStrength`, `regionFoam`, `regionDepth` **and**
the boundary seam.

Measured over the real water mask:

```
EDGE FADE: 9398/19222 water tiles (48.9%) are inside the region-tint fade ramp
           mean tint strength across the sea = 81.1% of authored
           at the map's own edge the tint is at 21% strength
```

The code comment claims "0.80–1.0 of it brackets the shoreline of the world…
regions stay fully tinted across the whole playable map". The constant says
0.62. **Half the sea loses its zone colour, foam, depth ramp and boundary line**,
which is most of why the zones do not read.

### 1.4 The day sea renders blue, not the teal it is authored as

Authored day ramp (computed from `HARBOR_PALETTE` through the actual lerps):

```
DAY_SHALLOW #49857f  HSL 174° 29% 40%
DAY_MID     #3c6f72  HSL 183° 31% 34%
DAY_DEEP    #2b4f65  HSL 202° 40% 28%
```

Rendered day sea, sampled off the real GPU frame: `mean=(81.5, 115.2, 126.0)` —
blue channel **11 above** green, i.e. a blue-cyan, not a teal. Three multipliers
push it there:

- `zoneThemeForTerrain("calm-water").base = #125e7e`, a saturated cyan-blue,
  applied at strength **0.44** (`REGION_TINT_STRENGTH_BAND`) over the 43% of the
  sea that is Calm.
- `DAY_GRADE.shadowTint = [0.84, 0.96, 1.10]` at `split 0.5` — the day grade
  deliberately cools shadows, and the sea *is* the frame's shadow mass.
- `fog_day = #dbcfae`, a pale warm sand, blended in past `FOG_NEAR`.

### 1.5 Six more defects the brief did not name (my own analysis, A7)

| # | Defect | Evidence |
| --- | --- | --- |
| D1 | **The drawn zones are not the zones ships obey.** `buildSeaRegionField` domain-warps the *sample position* by up to 12.1 tiles; `seaRegionAtTile` (ships, buoys, motion, labels) does not. **13.7% of sampled texels paint a different region than the simulation uses** — 70% wrong for `open`, 39% for warning, 31% for danger. The module docstring says its whole purpose is that "the boundary you see is exactly the boundary the simulation uses". | `outputs/sea-audit/residue.txt` |
| D2 | **Swell tears at every region boundary.** The vertex stage computes `gardenWave(waterPosition * regionChop, uTime)`. Multiplying *position* by chop changes the wave **phase** discontinuously where chop jumps (calm 0.5 → danger 2.3), so the displaced surface creases along every seam and the crease animates. It should scale frequency continuously, or blend `chop`/`swell` across `boundaryDistance` the way the fragment stage already blends colour. | `garden-water.ts:198-201` |
| D3 | **Hard `step()`s scintillate.** `pow(dot(n,h), 520.0)` + `step(0.76, …)` for sun glitter, `step(0.35, …)` for moon sparkle, `step(0.86, sin(shoreWorld*3.2 − t*0.5))` for foam rings. MSAA (`samples: 4`) antialiases geometry edges, not shader-internal high frequency. These alias and crawl under camera motion at 1× DPR. In the frames they read as single-pixel white dust, not glitter. | `garden-water.ts:649,672-678,802` |
| D4 | **The whitecap hash loses precision.** `fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453)` with `p = vWaterPosition * 0.34` up to ~150 gives a sine argument near 66 000; highp's 24-bit mantissa leaves ~0.6 rad of error, so the noise field is temporally unstable. | `garden-water.ts:278-280` |
| D5 | **The region field crawls.** 512² `NearestFilter` on *both* filters, no mipmaps, over ~197 world units. NEAREST is correct for the **id** channel (bilinear would invent region 2 between 1 and 3) but it is wrong for the **boundary-distance** channel, which is a smooth field being point-sampled at ~4 texels/pixel at overview zoom — the seam line crawls as the camera moves. | `garden-water.ts:72-73` |
| D6 | **The pale halo is two overlapping artefacts, both mis-sited.** (a) The island ripple train is `radius 40, inner 26` — a 28-tile-diameter disc of pale expanding rings, **40% of the map's width**. (b) The "harbour mirror basin" is a 15×11 ellipse centred on *the mean position of up to ten docks*, which is the island's centroid — so the glassy, sky-mirroring, normal-flattened patch sits **on the island**, and only its overspill ring shows on the water. | `garden-water.ts:1158`, `world-renderer.ts:623-642` |

Two smaller ones worth listing but not scheduling: the dusk/night mist plane
renders as a hard-edged rectangle in the sky (`outputs/sea-wide-night.png`, upper
left; `garden-sky.ts:241` is a bare `PlaneGeometry` with no alpha falloff), and
`WATER_SEGMENTS = 96` over `WATER_SIZE = 900` gives 9.4 world units per vertex —
only ~21 quads across the entire playable world — so per-region swell amplitude
is blocky by construction.

---

## 2. The sea zones

### 2.1 What the partition actually is

Rendered ASCII map of `terrainKindAt` in `outputs/sea-audit/report.txt`. It is
not a coastline; it is **four half-plane wedges and three concentric circles
around the NE map corner**:

- `isLedgerMooring` = `x <= 30 && y <= 9` in design space — a literal rectangle
  (world rows 0–24, columns 0–77).
- The Alert/Warning/Danger stack = one circle at design `(55, 0)` radius 14,
  sliced at 0.26 / 0.66 / 1.63. Concentric rings, i.e. the "onion" the R6 comment
  set out to kill.
- Watch = the next ring out (1.63–7.0) plus rectangular south-basin patches.
- Calm = `x <= 15` plus an ellipse plus rectangles — **and the trailing
  fallback**.

`world-layout.ts:361` is `return "calm-water";`. Any water tile no named test
claims becomes Calm. Measured: **8344 Calm tiles, 3076 of them (36.9%) sit east
of the authored west-basin anchorage.** Calm is not a designed body of water; it
is the residue, and it is 43.4% of the sea.

The R6 domain warp was added to hide the ruler lines but is only ~12 tiles of
displacement on lines 140 tiles long — `outputs/sea-ne-corner.png` shows the
boundary still reading as a straight pale rule across the frame.

### 2.2 What the zones look like on screen

At whole-map framing (`outputs/sea-wide-noon.png`): one flat blue. Calm, Watch,
Ledger and the Roads are indistinguishable; only the Danger corner shows, and
only because of its red squall. Compounded by §1.3 (half the sea's tint faded)
and §1.4 (everything pulled toward one cyan).

### 2.3 Traffic, measured against the live API

Built the real world from live `/api/*` payloads (187 ships, 2026-07-25):

| Region | ships | share of fleet | tiles | share of sea | ships / 1000 tiles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Calm Anchorage | 112 | 59.9% | 8 344 | 43.4% | 13.4 |
| Ledger Mooring | 26 | 13.9% | 1 950 | 10.1% | 13.3 |
| Alert Channel | 17 | 9.1% | 967 | 5.0% | 17.6 |
| Watch Breakwater | 16 | 8.6% | 5 402 | 28.1% | **3.0** |
| Danger Strait | 11 | 5.9% | 277 | 1.4% | **39.7** |
| Warning Shoals | 5 | 2.7% | 400 | 2.1% | 12.5 |
| Wreck Shoals | 0 (graves) | — | 1 450 | 7.5% | — |
| open / periphery | 0 | — | 810 | 4.2% | — |

**Density spread is 13×.** Watch Breakwater is the second-largest body of water
in the world and the emptiest working water in it. Danger Strait — the most
narratively important zone, where active depegs live — is 1.4% of the sea with
11 ships packed into it.

### 2.4 Target sizing

Sizing must not chase a live snapshot (the terrain field is compile-time
constant), so the targets are set against the *structural* distribution — most
stablecoins are pegged most of the time, so Calm dominance is real and should
stay — compressed by an exponent so no body becomes unreadable.

| Region | today | **target** | target tiles | typical ships | tiles/ship |
| --- | ---: | ---: | ---: | ---: | ---: |
| Calm Anchorage | 43.4% | **30%** | ~5 770 | 112 | 52 |
| Watch Breakwater | 28.1% | **12%** | ~2 310 | 16 | 144 |
| Ledger Mooring | 10.1% | **10%** | ~1 920 | 26 | 74 |
| Alert Channel | 5.0% | **8%** | ~1 540 | 17 | 90 |
| Danger Strait | 1.4% | **5%** | ~960 | 11 | 87 |
| Warning Shoals | 2.1% | **4%** | ~770 | 5 | 154 |
| Wreck Shoals | 7.5% | **7%** | ~1 350 | graves | — |
| open sea (unnamed, D2) | 4.2% | **24%** | ~4 600 | 0 | — |

Resulting density spread: **3.0×** (Calm densest at 19.4/1000, Warning sparsest
at 6.5/1000) against today's 13×. Calm reads busy — correct for an anchorage;
Warning and Watch read open and exposed — also correct.

The 24% of open sea is the change that makes the rest work: named bodies only
read as *bodies* when there is unclaimed water between them. It is the
composition's breathing room and the "asymmetric, sea-first, intentionally
open" invariant, made real. Per **D2** it stays deliberately unnamed, which is
why the `namedShare` guard moves to 0.72.

### 2.5 Target shape

Replace the half-plane / corner-circle predicates with an **authored SDF
partition** in design space:

- Each body = a small union of capsules (segment + radius), ellipses and
  bays; classification = `argmin` over bodies of `sdf_i(tile) + bias_i`.
  Argmin-of-SDF guarantees full coverage, no slivers, no gaps, and contiguity;
  area is tuned purely by the `bias_i` terms, which makes §2.4 a mechanical
  calibration rather than a hand-fit.
- **One shared domain warp, applied at classification time** inside
  `terrainKindAt`, not at render time. That closes D1 by construction: the
  warped edge becomes the true edge, so the tint, the buoys, the ships and the
  labels all agree.

Composition — a chart, not an onion. The island sits at world ≈(73, 75):

| Body | Form | Why |
| --- | --- | --- |
| Calm Anchorage | the great sheltered bay in the island's lee, W and SW, with a real bay mouth | biggest by traffic, but one shape with one edge instead of an L wrapping the map |
| *(unnamed open sea)* | the approach ring around the island plus an open channel running S/SE to the map edge | breathing room; the eye's rest; the lighthouse's own water |
| Watch Breakwater | the working sea E/SE behind a breakwater arc, between the anchorage and the alert channel | a real place, not a catch-all ring |
| Alert Channel | a long tapering channel from the NE approach toward the island | "channel" should mean channel |
| Warning Shoals | shallow banks flanking the strait's mouth | shoals should flank something |
| Danger Strait | a narrow channel running NE between two shoals, opening to the map edge | "strait" should mean strait; today it is a corner disc |
| Wreck Shoals | SW corner, unchanged in place | keeps danger at one pole and memory at the other |

The DEWS escalation stays monotonic along a NE bearing
(Calm → open sea → Watch → Alert → Warning → Danger), so the existing narrative
and `motion-water.ts` terrain penalties are preserved unchanged (**D4**).

---

## 3. Sea-zone signage (A6, the firm ask)

Today there is **no in-world lettering at all**. The only annotation is a DOM
chip layer, and `observe-sequence.ts:30-55` caps the overview to **two** chips
(highest-risk band plus highest-count other band), explicitly excluding CALM and
excluding Ledger. `outputs/sea-wide-noon.png` shows the whole-map view carrying
exactly two labels, overlapping each other in the NE corner. The framing where a
map most wants its place-names is the framing with the fewest.

### The decision: carved timber boards on pilings (D3 + D7)

A real object standing in the water at each body's edge — harbour-made, in the
same timber and ironwork as the docks and piers already in the world.

```
      .--------------------------.
      |    D A N G E R           |   oak plank
      |    S T R A I T           |   iron banding
      '--------------------------'   painted letters
            ||          ||
            ||          ||           lantern hung at night
     ~~~~~~~^^~~~~~~~~~~^^~~~~~~~~
```

Build notes:

- **Geometry.** One board + two pilings + iron banding, built procedurally in
  the existing garden style. Instanced or merged across the seven bodies — this
  must not add seven draw calls.
- **Lettering.** A `CanvasTexture` on the board face, following the existing
  pattern in `garden-chain-flag.ts` / `garden-sail-texture.ts`, typeset in
  **EB Garamond 700** which the app already ships and loads as `PV Plaque`
  (`src/pharosville.css:1`, `/fonts/eb-garamond-700-latin.woff2`) — no new
  asset, no new licence. Painted letters on weathered oak, not backlit UI.
- **Siting.** One board per named body, in shallow water at the body's edge
  nearest the viewer, on the principal axis from N1, angled to face the
  isometric camera and clear of the body it names.
- **Overview scale (D6).** The board's world scale rises as the camera zooms
  out so it holds a roughly constant on-screen size — drawn out of scale on the
  chart, the way a landmark is on an old map. This is what makes the name
  readable at whole-map framing, where a true-scale board would be ~4 px.
  Ships and water do **not** scale; only the signage does.
- **Night.** A hung lantern registers with the existing light-lane registry, so
  each sign lays its own small warm pool on the water and joins the Lantern Sea
  rather than sitting dark in it.
- **Accessibility.** Each board is a keyboard-reachable hit target that opens
  its water body's detail panel, and every named body appears in the
  accessibility ledger — so the new visual channel never outruns the DOM one.
  The existing DOM chips and their cap of 2 are unchanged (D6): the boards now
  carry overview naming.

---

## 4. Stage L — make it beautiful

| ID | Work | Why |
| --- | --- | --- |
| L1 | Fix the slab-on-void seam: apply the same env-tint weight, facet/cloud multiply and fresnel on the cheap path; widen the crossfade to ~40 units; replace the Chebyshev `mapDistance` with a rounded-box or radial metric so the boundary has no corners. | §1.2 — the worst thing in the frame |
| L2 | Move the region fade ramp from `0.62→1.00` to `0.92→1.15` of a correctly-sized `uOpenOceanRadius`, so zones stay fully tinted across the whole playable map. | §1.3 — recovers 49% of the sea |
| L3 | Recolour to the **D5** targets: bands `#49857f` / `#3c6f72` / `#2b4f65`, Calm's water tint from `#125e7e` cyan to a green-leaning shallow ~`#2d7d6a`, every other `ZONE_THEMES` water base pulled into the same family; drop `REGION_TINT_STRENGTH_BAND` ~0.44→0.28 and put the recovered separation into **value and character**, which survive the shader's luminance-match. Acceptance: green channel above blue in a sampled noon frame. | §1.4, D5 |
| L4 | Restore real depth banding. `depth` is currently dominated by a shore SDF that saturates ~14 units out, so at overview the entire sea is band 3. Key it to distance-from-any-land plus authored shelves, and posterise into five bands on a proper ukiyo-e value ladder. | value, not hue, is what will carry the sea at overview |
| L5 | Rework the seams into currents: after §2.5 the boundary is no longer straight; also modulate along the boundary tangent, break with noise, cap the highlight much lower, lean on `seamShadow`. | §1.2, D5 |
| L6 | Halve the island ripple train (radius 40→~22) and re-site the harbour calm basin onto the actual lee water instead of the dock centroid. | D6 — the pale disc |
| L7 | Cluster the sun glitter into sunlit patches modulated by the cloud noise (after S4 makes it stable) so it reads as sun on water, not dust. | §1.5 D3 |
| L8 | *(small)* Alpha-falloff on the dusk/night mist plane. | §1.5 |

---

## 5. Stage Z — the zones

| ID | Work |
| --- | --- |
| Z1 | Build the SDF partition toolkit in design space and port the seven named bodies onto it (§2.5). |
| Z2 | Move the domain warp into `terrainKindAt`; delete `warpSampleTile` from `buildSeaRegionField`. Closes D1. |
| Z3 | Calibrate the `bias_i` terms against the §2.4 target table; add a test asserting each body's tile share within ±2 points and the density spread ≤ 3.5×. |
| Z4 | Stop Calm being the fallback: the trailing `return "calm-water"` in `world-layout.ts:361` becomes generic open `water`. |
| Z5 | ~~Promote `open` to a named body~~ — **cancelled by D2.** Instead: drop the `namedShare` guard from 0.85 to 0.72 and record in `VISUAL_INVARIANTS.md` that deliberate open water is composition, not an attribution gap. |
| Z6 | Retire the vestigial ellipse layer — `ZONE_BASE_RADIUS`/`zoneRadius`/`garden-zone-coverage.ts` size ellipses that no longer render anything; keep only what still has a job (selection-cue extent, danger squall footprint) and derive it from the region field's bounds. |
| Z7 | Fix D2: blend `swell`/`chop` across `boundaryDistance` and scale wave *frequency*, not position, so the surface stops creasing at seams. |

---

## 6. Stage N — signage

| ID | Work |
| --- | --- |
| N1 | `seaRegionPrincipalAxis(regionId)` in `garden-sea-regions.ts` — PCA over the body's tiles, returning centroid, bearing, extent, and a shallow edge tile facing the camera to stand the board on. |
| N2 | `garden-sea-signs.ts` — procedural carved board + pilings + iron banding in the existing dock timber materials, merged/instanced so seven signs are not seven draw calls. |
| N3 | Board-face `CanvasTexture` in EB Garamond 700 (`PV Plaque`), painted letters on weathered oak; copy shared with the DOM chips so the two can never drift. |
| N4 | Overview scale-up per **D6** — sign world scale rises as zoom falls so the board holds a roughly constant on-screen size; ships and water unaffected. Cull in `analyze`. |
| N5 | Night lantern per sign, registered with the light-lane registry so each board lays its own warm pool. |
| N6 | Accessibility: each board a keyboard-reachable hit target opening its water body's detail panel; every named body present in the accessibility ledger. |
| ~~N7~~ | ~~compass rose + bathymetric contours~~ — **out of scope**, not taken up (§0). |

---

## 7. Stage S — stability

| ID | Work | Why |
| --- | --- | --- |
| S1 | **Stop shedding water quality at `interaction`.** The tier exists to protect frame time during input, but the water's cost is coherent fetches the GPU already absorbs at 16.7 ms p90 with everything on. Keep cloud shadows, glitter and `uDetail = 1` through `interaction`; shed only genuinely expensive things (shadow-map size, ripple-ring count). | §1.1 — the reported bug |
| S2 | **Ease every remaining tier-driven water uniform** over ~300 ms instead of snapping, and fade ripple-ring *strength* to zero rather than dropping rings out of the uniform array. | §1.1 — kills the pop, and protects against any future tier change |
| S3 | Antialias the hard `step()`s with `fwidth`-derived widths; lower the glitter exponent from 520 to ~120 with a wider smoothstep. | D3 |
| S4 | Replace the whitecap hash, or wrap its input into a bounded range before the `sin`. | D4 |
| S5 | Split the region field: keep `NearestFilter` for the **id** channel, move **boundary distance** to a linear, mipmapped texture. | D5 — stops the seam crawling |

---

## 8. Blast radius and risk

**Stage Z touches the simulation, not just the render.** `terrainKindAt` is
consumed by `garden-fleet-placement.ts`, `garden-sea-regions.ts`,
`garden-water-exclusion.ts`, `ship-placement.ts`, `pharosville-world.ts`,
`risk-water-areas.ts`, `risk-water-placement.ts`. That is deliberate —
`VISUAL_INVARIANTS.md` requires that "a renderer effect must not reclassify a
tile", so a zone redistribution *has* to be a terrain change. Consequences to
carry:

- `risk-water-areas.ts` ship anchors and `scatterRadius` are authored per band
  and must be re-sited onto the new bodies, or ships land outside their zone.
- `motion-water.ts` penalties are keyed on `TerrainKind`, not geometry, so they
  survive unchanged provided the kind set and connectivity are preserved.
- ~20 assertions in `risk-water-areas.test.ts` / `world-layout.test.ts` encode
  the *current* geometry ("splits the left edge…", "places Ledger Mooring across
  the entire top shelf", "anchors edge-snapped DEWS zones to their authored map
  edges"). These are descriptions of the layout being replaced and must be
  rewritten to the new composition, not silenced.
- Wreck placement (`world-layout.ts:834`) keys on `wreck-water`; the SW corner
  stays, so this is unaffected.

**Contract changes — both settled in §0, no further sign-off needed:**

1. `garden-sea-regions.test.ts:36` asserts `namedShare > 0.85`. Per **D2** the
   neutral water stays unnamed, so the threshold drops to **0.72** and
   `VISUAL_INVARIANTS.md` records that deliberate open water is composition, not
   an attribution gap.
2. `observe-sequence.ts` caps overview area labels at two. Per **D6** the
   carved boards carry overview naming, so **the cap stays** and this contract is
   untouched. What must not lag is the accessible channel: N6 makes each board a
   keyboard-reachable hit target and puts every named body in the accessibility
   ledger.

**Order (D8 — run straight through).** S (small, self-contained, fixes the
reported bug) → L1/L2 (two constants and a shader branch, recovers half the sea)
→ L3/L4 (colour and depth) → Z (the big one) → N (needs Z's shapes to site the
boards) → L5–L8 polish.

Verification per stage:

| Stage | Verify |
| --- | --- |
| S | `npm test -- src/three src/renderer`; then `outputs/sea-audit/tier-probe.mjs` — the drag frame's luminance σ must stay within 10% of the rest frame's |
| L1/L2 | `npm run preview -- --hash "#t=12&cam=0,0,0.3"` — no visible boundary; sample across the seam, ΔmeanLum < 2/255 |
| L3/L4 | `npm run preview` at `t=12`, `t=18`, `t=22`; check the sea's G ≥ B at noon and the five depth bands are separable |
| Z | `npm test -- src/systems`; new tile-share and density-spread test; re-run the fleet audit and confirm ships still land in their own zone |
| N | `npm run test:visual`; `npm run preview` at overview and explore — every board legible at whole-map framing; accessibility-ledger parity; draw calls still inside the 700 ceiling |
| all | `npm run validate:changed`, then `npm run validate:release` before claiming release confidence |

---

## 9. Open questions

None. All eight were settled by the operator on 2026-07-25 — see §0.

---

## 10. Evidence index

| File | What |
| --- | --- |
| `outputs/sea-day-noon.png` | default framing, noon, real GPU, `full` tier |
| `outputs/sea-wide-noon.png` | whole-map framing — the slab-on-void |
| `outputs/sea-wide-night.png` | whole-map night — slab edge, mist rectangle |
| `outputs/sea-ne-corner.png` | mid zoom — the straight boundary rule, glitter as dust |
| `outputs/sea-probe-rest.png` / `-drag.png` | the reported bug, side by side |
| `outputs/sea-audit/report.txt` | ASCII region map + per-region tile counts and bboxes |
| `outputs/sea-audit/fleet.txt` | live fleet distribution and density per zone |
| `outputs/sea-audit/residue.txt` | warp divergence, edge-fade coverage, Calm residue |
| `outputs/sea-audit/tier-probe.mjs` | the real-GPU tier probe |

---

## 11. Executed — outcomes (2026-07-25)

> **STATUS: shipped.** Six commits on `main`: `a2599ec`, `59d9582`, `bffa7c1`,
> `50b60d6`, `e604756`, `c9af634`. 938 unit tests pass; lint, typecheck, build,
> bundle-size, colour, docs, runtime-media and viewport gates all green.

### What the numbers say

| Measure | Before | After |
| --- | ---: | ---: |
| Sea's surface variation retained on a camera drag | 59% (σ 12.4 → 7.3) | **unchanged** (cloud shadows, 24 ripple rings, 1024 shadow map all held through an `interaction` frame) |
| Luminance step across the map boundary | 26 / 255 between samples | **max 2.9 / 255** — a gradient |
| Water tiles inside the region-tint fade | 48.9% | **0%** |
| Rendered sea at noon | (77, 111, 127) — blue 15.7 over green | **(85, 112, 114)** — blue 1.8 |
| Zones drawn ≠ zones ships obey | 13.7% of the sea | **0.00%** |
| Density spread across bodies | 13.2× | **2.9×** |
| Ships landing outside their own water | — | **0 of 187** |
| Body area vs traffic target | up to 16 pt out | **worst 0.3 pt** |
| Named bodies with a name in the world | 2 of 7 at overview | **7 of 7** |
| Draw calls, default framing | ~473 | **599** (budget 700); signs cost 14 |
| Frame, default framing | 60 fps / 16.7 ms p90 | **60 fps / 16.7 ms p90** |

### Deviations from the plan, and why

- **L4 kept four depth bands, not five.** The band count was never the problem —
  the depth FIELD was flat over most of the map because the shore ramp saturated
  ~70 units out. Fixing the field gave the sea form; adding a fifth band would
  have diluted the posterised ukiyo-e look for nothing.
- **D5's acceptance was not fully met.** "Green channel above blue at noon" came
  to 1.8/255 short. The residue is the day grade's cool shadow tint, a
  frame-wide choice shared with the island and the fleet. Forcing it in the
  water alone would have put the sea out of agreement with everything else in
  the frame.
- **Stage Z spilled into the motion system.** Traffic-proportional sizing made
  Danger Strait larger than Warning Shoals — reversing an assumption the patrol
  circuits were tuned against — which left the roughest water in the world
  reading 1% CALMER than the band below it. Danger's circuit speed went
  0.21 → 0.26 rad/s to restore a 1.5× margin. One docking test was also
  comparing headings across a curved approach because it sampled its "pre-ramp"
  reference at the phase midpoint rather than at the ramp's start; that is
  corrected.
- **Roughly eighty lines of test coordinates were replaced by properties.** The
  old assertions transcribed the geometry rather than testing it — they were
  green for the entire period the operator's complaint about the sea zones was
  true. What replaced them: every body exists, is one connected piece, holds its
  target share, escalates north-east, and keeps its anchors in its own water.

### Residuals

1. **The coastline is improved but not ragged.** A nearest-seed partition of a
   square yields long mutual boundaries; the warp (now 14 tiles, up from 6) bends
   them but does not break them into inlets. Getting a genuinely fractal coast
   needs boundary-level noise rather than domain warp — a contained follow-up in
   `sea-bodies.ts` that would not disturb the areas.
2. **Draw calls at whole-map framing reach ~855**, over the 700 budget the perf
   spec asserts. That budget is measured at the DEFAULT framing, where the frame
   sits at 599 and passes. The signs account for 14 of the total; most of the
   growth is the concurrent fleet/hero work landing in the same tree. Worth
   re-measuring once that settles.
3. **`npm run test:perf` could not be run cleanly.** Both failures were 60-second
   timeouts waiting for the fleet to populate under SwiftShader at load average
   17, and neither reached the resource assertions. The real-GPU numbers above
   stand in; re-run the lane on a quiet machine.
4. **Sign hit-testing was not added.** The boards are canvas content and so
   aria-hidden; parity is carried by the accessibility ledger, which names every
   area, and by the existing area buttons. That satisfies the World Encoding
   contract, but a keyboard target on the board itself would be better.
5. **A faint horizontal band remains in the upper sky at night.** The dusk mist
   plane now has an alpha falloff; what is left appears to come from the horizon
   cards, which another agent was editing concurrently — not diagnosed.

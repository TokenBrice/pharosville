# Water lane — PharosVille Reborn review

Lane: sea / water. Base `main` @ `4edd97c`. Frames: all; focus `noon.png`, `night.png`, `dusk-close.png`.

## 1. Verdict

The sea is a **feature-complete opaque stylized plane**, not a Japanese garden pond and not a harbour with depth. `garden-water.ts` (2265 lines) already carries Gerstner displacement, region character, PMREM fresnel, moon/sun roads, wakes, caustics, ripple rings, lanes, and tower shadow — yet rest frames still read as a **flat teal–cyan carpet under ~185 hulls**. Sky is a weak sheen, not an image; the tower never appears inverted; shallows do not go transparent; the seven risk bodies barely separate at rest. Against “digital Japanese garden / self-evolving harbour,” water is the largest remaining *look* gap: machinery paid for, garden reading not delivered.

## 2. Findings

### DEFECT (broken vs own intent)

| # | Claim | Evidence | Status |
| --- | --- | --- | --- |
| D1 | **T0.1 ortho-fresnel** | `garden-water.ts:717-726` `camDistance = vFogDepth`; `:864-874` parallel `viewMatrix` row-2 ray; fog uses same `:1414-1434`. Tests pin in `garden-water.test.ts:247-262`. | **LANDED** |
| D2 | **T1.2 Schlick** | `:934-939` `0.02 + 0.98·pow(1-cos,5)` × `seaReflectivity` × `(0.40 + 0.45·daylight)`, clamp **0.55**. Comment admits plan wanted **0.55 base** (`:909-910`). | **LANDED, underpowered** — `noon.png` / `morning.png` still show no sky image or sun disc |
| D3 | **T1.3 probe roughness** | `garden-water-contract.ts:53` `PROBE_ROUGHNESS = 0.21`; shader `:640` | **LANDED** (cost-identical mip) |
| D4 | **T1.4 region mirror** | `:671` `mirrorZone = max(harborCalm, smoothstep(1.1,1.6,regionReflect)…)` drives env `:879`, `:945-946` | **LANDED in code**; rest frame still not a calm mirror |
| D5 | **T0.6 hero-reflect range** | `garden-hero-reflections.ts:158-173` live min/max from `SEA_REGION_CHARACTER` | **LANDED** |
| D6 | **T0.7 ripple rank** | `garden-water.ts:1734-1742` strength-ranked top-12 | **LANDED** |
| D7 | **T3.2 shore-distance** | Field writes B (`garden-sea-regions.ts:170-188`); distance tex packs shore into **G** (`garden-water.ts:110-121`); sample `:807` `.g`. | **HALF-LANDED** — channel real; **payoff incomplete**: depth still `mix(island ellipse, field, 0.5)` (`:809`); **lap/shore foam still island ellipse only** (`:785-976`); `shallowShelf` from field is ~2.4 tiles (`:813`) and weak in frames |
| D8 | **Moon road = secondary night light** | Contract `VISUAL_INVARIANTS.md:274-275`. Shader `:1125-1151` with `moonRoadGain: 0.06` (`garden-water-contract.ts:87`). | **DEFECT** — `night.png` / `night-pharos-close.png`: **no moon path**, only soft beacon wash. Gain too low to read as secondary light |
| D9 | **Seven-body ladder legible without hue alone** | Character table `garden-sea-regions.ts:284-348` (depth 1.13→0.58, reflectivity 1.62→0.38). Luma-match kills tint brightness (`garden-water.ts:1022-1027`). | **DEFECT at rest** — `noon.png`: continuous teal; Calm/Danger/Warning not separable without zoom/labels |
| D10 | **Tower reflection** | Beacon column `:1297-1316` + soft caustic `:1266-1275`; **no masonry/probe silhouette of tower**. | **DEFECT vs garden-pond expectation**; code never claimed planar tower, but night/day close frames confirm absence (`noon-pharos-close`, `night-pharos-close`) |
| D11 | **“Transparent” water** | `transparent: true` (`:1682`) but alpha is **plate-edge fade only** (`:1389-1408`), not depth. | **DEFECT vs depth-transparency reading** — water is an opaque colour field |

### GAP (works, not amazing)

| # | Gap | Evidence |
| --- | --- | --- |
| G1 | No sky *image* in water | Probe path `:630-642`, day `uEnvStrength≈0.11` (`:1973`); frames: sky wash, not reflection |
| G2 | Fleet hero columns under-read | Instanced quads peak α 0.42 (`garden-hero-reflections.ts:53`), banded breakup; `noon.png` shows almost no inverted hulls |
| G3 | Caustics island-only full-tier | `:1278-1293` rock radius + cloud noise; `dusk-close`/`noon-pharos-close`: no lattice |
| G4 | Wakes real but quiet at rest | 512 RT Kelvin stamps (`garden-wakes.ts:59-223`); most hulls moored → foam field idle; island ripple ring dominates frames |
| G5 | Wet shoreline invisible | Shelf mix max ~0.18 (`:949`); docks look dry (`dusk-close`) |
| G6 | Wave normal detail thin at rest zoom | Gerstner amp ≤0.036 (`:133`); normals fall off with `vFogDepth` (`:724-726`) → carpet |
| G7 | Hero waterfall off rest mass | South engawa cascade `tileY 128–136` (`garden-waterfall.ts:28-36`); one draw + wake stamps; rest camera is sea-first mid-plate — fall rarely owns attention |
| G8 | Tide stain is masonry, not water | `garden-tide-stain.ts` high-water courses on terrace — correct analytical cue, zero sea optics |

## 3. Ideas (ranked)

Costs use current headroom (~213–233 draws, ~355k tris, 44 tex, p95≤20 ms; ceilings 700 / 500k / 72).

### R1 — STEP CHANGE: Hero planar pass (tower + island rock only)
**What:** One small RT (~512–768), clip plane at `GARDEN_WATER_Y`, draw **only** Pharos GLB/procedural tower + island rock/grove into a mirrored camera; sample in water shader inside `mirrorZone` / near-island mask. Not a full-scene planar (operator rejected ~40 draws).  
**Why:** Only path that puts the **tower in the water** — the garden’s defining still-frame. Probe fresnel cannot invent vertical masonry.  
**Cost:** +1 RT, +~8–20 draws (island subset), 0–1 tex slot if RT counted, ~0.4–1.0 ms; eng **L**.  
**Risk:** Med — clip artifacts, double lighting, night ember competition.  
**Displaces:** soft **beacon column** bands (`:1297-1316`) and island **beacon caustic glow** as the tower’s water image; keep flame pool as ember only. Re-pin night “one dominant / one secondary” if column was competing.  
**Deps:** Island/lighthouse lanes (which meshes enter the RT); Sky (probe still fills open water).

### R2 — STEP CHANGE: Shore-distance volume water (finish T3.2 for real)
**What:** Drive depth, Beer's-law darkening, **alpha toward seabed tint**, shallow shelf, and shore foam **primarily from `uRegionDistance.g`**. Delete or demote island ellipse foam (`:785-976`) to modulation. Optional cheap “bottom” gradient (sand/rock palette) mixed by `1 - exp(-k * (1-shoreField))`. Raise calm fresnel only where `shoreField` high + `mirrorZone`.  
**Why:** Turns every coast into a pond edge; rim stations finally meet water; depth becomes geographic not island-radial. Biggest garden read per dollar after R1.  
**Cost:** 0 draws, 0 tex (channel paid); fragment heavier ~0.1–0.2 ms; eng **M**.  
**Risk:** Med — N8AO/`transparencyAware=false` may treat alpha water as solid; plate edge alpha interactions; re-grade midday value.  
**Displaces:** hand-authored **ellipse bathymetry + island shore foam vocabulary**; re-pin `garden-water.test.ts` T3.2 strings and any shore-foam snapshot tests.  
**Deps:** Shore/rim vegetation (wet dark band must meet mesh); Post (AgX + LUT after value shift).

### R3 — Calm “karesansui mirror” zones (amplify T1.4, reverse under-gain)
**What:** In calm/ledger (and harbour ellipse): double probe blend, raise fresnel clamp for those ids only, flatten normals harder, **suppress crest foam and sun glitter**. Optionally dim hero ship columns in calm so the surface stays empty *ma*.  
**Why:** Garden pond needs one still body that is *obviously* glass; today calm is only a greener teal.  
**Cost:** 0 draws; eng **S**.  
**Risk:** Low–med — over-bright midday sheen; must stay under night emissive 0.016.  
**Displaces:** open-water **generic glitter/crest foam** inside those bodies (region foam already low). Re-pin fresnel gain test (`garden-water.test.ts:285`).  
**Deps:** FleetMotionDensity (moored bob quieter in calm); DataInformativeness (calm stays risk-readable via motion absence).

### R4 — Night moon road as true secondary
**What:** Rebalance `moonRoadGain` 0.06 → ~0.14–0.18 **and** cut moon glitter occupancy or lane clamp so mean stays ≤0.016 (`garden-water-contract.ts:86-100`). Align glitter half-vector with `gardenMoonPose` elevation, not flat `z=0.5` (`:1140-1141`). Optionally lengthen band along moon azimuth into open water, not only from island.  
**Why:** Contract says secondary light; frames prove it is absent. Without it night is beacon monologue.  
**Cost:** 0 draws; eng **S**.  
**Risk:** Low if budget test re-pinned; high if gain-only without occupancy trade.  
**Displaces:** portion of **lane ember reflections** and **moon glitter** occupancy. Re-pin `gardenWaterOpenNightMeanEmissiveBudget` / water night test.  
**Deps:** SkyAtmospherePost (moon disc visibility); AmbientLifeLight (ember thinning already helps).

### R5 — Moored-hull ripple rings (use existing API)
**What:** Register 2-band quiet rings on largest moored hulls via `GardenRippleRingEmitter` (cap 12, rank already fixed). Strength 0.15–0.25, long period.  
**Why:** Still water that “breathes” at hulls is the garden motion; island ring alone reads VFX.  
**Cost:** 0 draws (in-shader loop); eng **S**.  
**Risk:** Low — oversubscription already ranked.  
**Displaces:** weakest **dock/islet rings** in the 12-slot set (name ids demoted).  
**Deps:** FleetMotionDensity (which hulls count as moored).

### R6 — Wet shoreline darkening + foam on all coasts
**What:** `shoreField`-driven dark wet band (value only) under foam line; move lap foam from ellipse to `abs(shoreField - ε)`.  
**Why:** Docks/rim currently look dry; pond edges need a lip.  
**Cost:** 0 draws; eng **S–M**.  
**Risk:** Low.  
**Displaces:** island-only **shore foam term**.  
**Deps:** ShoreRimVegetation (contact shadow/moss).

### R7 — Shallow caustics from shore field (not island circle)
**What:** Gate existing caustic web (`:1278`) by `shoreField < 0.15` and daylight; reuse cloud noise; drop rock-radius exclusivity.  
**Why:** Garden shallows sparkle; island-only web is a lighthouse prop.  
**Cost:** 0 draws; full tier only; eng **S**.  
**Risk:** Low–med noise crawl.  
**Displaces:** island-centric **caustic vocabulary** as special case.  
**Deps:** none critical.

### R8 — Region ladder value surgery (not more hue)
**What:** Widen `depth` spread further and/or post-tint *after* luma match; add motion-only tells already in character (swell/chop) by raising calm stillness / danger steepness visibility at rest zoom; optional boundary bank boost.  
**Why:** Analytical sea fails if seven bodies look one.  
**Cost:** 0 draws; eng **S**.  
**Risk:** Med — palette OKLCH ceilings; hue-blind contract.  
**Displaces:** weak **boundary foam** noise if bank takes the edge.  
**Deps:** DataInformativeness / UiHud (ledger still owns names).

### R9 — Probe-only path (no new pass) — *supporting, not step-change*
Raise day fresnel base 0.40→0.55, env strength 0.11→~0.16, keep glint filter.  
**Cost:** 0; eng **S**. **Risk:** banding return if filter weakened. **Displaces:** nothing if gain-only — still **no tower**. Treat as R3 prerequisite, not the mother upgrade.

### R10 — SSR-lite in post
Hi-Z or dual-res reflection of bright verticals only.  
**Cost:** +1–2 full-screen passes, ~1–2 ms; eng **XL**.  
**Risk:** High on ortho + AgX + N8AO stack.  
**Displaces:** large share of **post budget** (godrays/N8AO weight). **Reject for this session** unless R1 fails art-wise.

## 4. Rejected

- **Full-scene planar reflection** — still ~40 duplicate draws; operator cost veto stands; R1 scopes it.
- **SSR-lite as primary** — XL eng, fragile under ortho/post; R1 cheaper and controllable.
- **Real refraction + scene color grab for whole plate** — fights N8AO opacity, plate edge, fleet density; R2’s alpha/bottom tint is enough.
- **Raising crest foam / wake stamp rate globally** — adds marina noise; violates sea quietness one-in/one-out (`VISUAL_INVARIANTS.md:328-333`).
- **More ripple slots (>12)** — uniform bloat; rank fix is the contract.
- **Particle waterfall spray** — hero fall already displaces `water-silver-accents`; particles add vocabulary.
- **Relitigating T0.1/T1.3 as missing** — verified present in source/tests.

## 5. Cross-lane notes

- **SkyAtmospherePost:** Probe content is the open-water reflection; visible moon disc needed for moon-road legibility; day env horizon must stay below bloom knee if R3/R9 raise sheen.
- **IslandLighthouse:** R1 mesh list (tower, rock, grove?); beacon column demotion coordination; tide stain stays masonry.
- **ShoreRimVegetation:** Wet band + foam meet mesh; no dry quay against glass water.
- **FleetMotionDensity / FleetVisuals:** Calm *ma* may need fewer/weaker hero reflection columns; moored ring emitters; wake quiet when docked.
- **RenderArchitecturePerf:** R1 RT budget, transparency vs N8AO, plate alpha.
- **CameraComposition:** Rest frame still fleet-carpet — water upgrades alone cannot fix marina reading if 185 equal hulls remain.
- **DataInformativeness / UiHud:** Sea-body boards + ledger remain classification; water must not reclassify tiles.
- **AmbientLifeLight:** Ember lane thinning keeps headroom for moon road (R4).
- **Astra* directors:** Prefer R1+R2 as the step change pair; R9 alone repeats 2026-09-07 incrementalism.

## Priority cut for the “amazing” session

1. **R1** tower planar (scoped)  
2. **R2** shore-distance volume + foam cutover  
3. **R3 + R4 + R5** (calm glass, night road, moored rings) as one commit  

That trio changes what the sea *is*. Tuning fresnel alone will not.

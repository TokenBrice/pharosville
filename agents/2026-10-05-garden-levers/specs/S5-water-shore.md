# S5 — Water optics & shore

## Lever statement
Replace ocean-demo checker chop with a composed pond-like inlet: restrained directional ripples, a recognizable broken tower reflection and materially continuous shallows. Teach risk through five stable surface signatures rather than mandatory agitation. Hull contact remains quiet; only actual movers leave trails. This changes a large visible surface, not a peripheral detail.

## Verified current state
- Reviewed L04, L06 shore levers, L08 lever 4 and L09 water rows; inspected `outputs/holistic/day.png`, `reduced.png`, `night.png`. Checker facets persist in reduced motion; stills do **not** establish temporal instability.
- The normal generator uses sixteen near-symmetric integer wave vectors and normalized finite-difference normals (`scripts/pharosville/generate-water-normals.mjs:42-92`). Water samples three differently oriented scales, uses distance fades, adds amplified Gerstner derivatives and risk slopes (`src/three/garden-water.ts:782-807,835-924`). Its derivative filter measures `blendedNormal`, not the complete optical field (`:911-924,1049-1063`). Checker attribution is an inference, not proof that any one term causes it.
- Canonical IDs are 0–8; risk IDs 1–5 (`src/systems/garden-sea-regions.ts:25-36`). Existing signatures already contain long lines/breaks/dashes/parallels but depend on time, normals and a five-pixel fade (`src/three/garden-water.ts:848-909`). This is replacement, not discovery of missing encoding.
- Inlet/wind-slick quieting deliberately excludes Watch–Danger interiors (`garden-water.ts:742-749,826-830`). The current character test pins increasing swell/chop/foam (`src/systems/garden-sea-regions.test.ts:112-125`). Those pins must change before calm optics can be truthful.
- Planar layer 7 excludes fleet, uses one HalfFloat mipmapped target at half CSS resolution and caches unchanged reduced frames (`src/three/garden-hero-reflection-pass.ts:22-26,85-95,137-154`). Water imposes shore-distance LOD and three vertical taps irrespective of roughness (`garden-water.ts:1096-1104`). Keep the pass; replace the smear policy.
- Correct an ambiguity in L04: shore distance is B in the CPU field, but G in the separately filtered GPU distance copy (`garden-sea-regions.ts:102-108`; `garden-water.ts:119-130`). That copy has redundant B and constant A. Depth still adds decorative ellipses and one seabed colour, followed by universal lap (`garden-water.ts:926-991,1122-1145`). Sea-edge sites are decorative but authoritative physical obstacles, batched in six draws (`src/three/garden-sea-edges.ts:33-43,476-479`).
- Wake R/G/B mean foam/slick/current contact; MAX blending and fixed horizons already exist (`src/three/garden-wakes.ts:26-70`). **Reduced motion already retains static contact**, not an entirely empty final surface (`:269-276`; `src/three/renderer-ship-frame.ts:369-371`). Analytical wake strength derives from zone, speed and change multiplier (`src/systems/motion-sampling/transit.ts:232-252`), then stamps both R/G (`renderer-ship-frame.ts:529-558`).
- Hygiene correction: CONTRACTS:378–382 claims a `0.0155` emission proxy, but `garden-water.test.ts` has no emission/occupancy assertion; `garden-water-contract.ts:107-111` distinguishes pixels from authored gains. Do not report that proxy as passing.

## Target state
Day rest: long quiet water intervals with sparse irregular directional ripples, no diagonal checker blanket; inverted tower tiers recognizable below their contact, broken into a few irregular strips rather than smeared. Near banks reveal restrained stone/silt through absorption; sheltered edges are damp/dark, not white collars. Night: passive value/grouping separates signatures and preserves the hero outline under S4's sky/fill; full moon alone supplies its road, moonless water does not glow. At **1200×640 and 900×720**, near/mid-body marks remain distinguishable; distant marks filter to restrained group-level values, never alias. Reduced motion presents the same complete codebook, shallows, reflection and hull contact at canonical time zero, without mover history or continuous RAF.

## Packets
Files lists below name implementation/test owners; each also amends the cited existing docs and `src/content/pharosville-changelog.ts`. Budgets are proposed **net caps**, not measured savings. Preserve ≤275 scene calls, 480k triangles, 60 textures, open-night emissive proxy ≤0.016 and current bundle gate. All packets depend on `S9:destination`/`S9:invariant-rewrite`; device acceptance uses `S9:M5-calibration`. Rollback reverts the complete packet and its semantic/docs changes, not retaining two render paths.

### S5-P1 · Static surface codebook · M
**Goal:** make calmness independent of risk meaning.
**Files:** `src/systems/garden-sea-regions.ts`, `src/systems/garden-sea-regions.test.ts`, `src/three/garden-water.ts`, `src/three/garden-water.test.ts`.
**Change:** export immutable `RISK_SURFACE_SIGNATURES` keyed canonical body with pitch, length, grouping, gap, orientation, coverage and S3-owned human names; generate GLSL constants from it. World-anchor seeded stroke groups; no `uTime`, no categorical interpolation. Starting world-unit grammar:

| Band | Signature | Pitch / length / group | Coverage cap |
|---|---|---|---|
| Calm | clean mirror, no printed marks | none | 0% |
| Watch | gently bending single ribbons | 12 / 18–30 / single | 3% |
| Alert | paired interrupted channel strokes | 10 / 8–14 / pair, 3-unit gap | 5% |
| Warning | short oblique broken groups | 8 / 3–6 / triples, 2-unit gaps | 7% |
| Danger | dark closely grouped strokes, bounded reserved accent | 6 / 3–5 / four, 1.5-unit gaps | 10% |

Use authored body bearings; Warning offsets 20°. Filter stroke widths with derivatives, ~1–2 CSS pixels at rest; unresolved groups average analytically to low-frequency coverage/value instead of vanishing. Dark-core/light-shoulder pairs maintain passive night contrast; no emissive term. Ledger uses widely separated horizontal singles; Wreck uses held irregular silt patches, neither a sixth ordinal band. Replace engraved crests, risk-normal signature and risk-only whitecaps; remove Danger-masked rain pocks (`garden-water.ts:1213-1226`) rather than introducing a fourth risk grammar. S3-P1 retires their registry/copy claims, not a hypothetical DEWS sky writer. Keep subdued hue/value reinforcement. S3-P3 owns actual shader-rendered local exemplars and DOM naming; no CSS imitation.
**Amend:** CONTRACTS “Sea partition and geography” / “Analytical authority and channels”; VISUAL_INVARIANTS “Coarse truth”. Rewrite `escalates water character monotonically with risk` to ordered signature coverage/value and pairwise static distinctions; delete forced increasing swell/chop/foam and Danger normal-detail >1 pins. Rewrite physical-vector distinctness to signature distinctness; retain field/filter/classification tests.
**Budget:** +0 calls/tris/textures, ≤+1 KiB gzip; constants replace duplicated branches.
**Acceptance:** matrix A; ≥4/5 correct blinded exemplar-to-water matches across five bands, both gates/day/night/reduced, and no false Ledger/Wreck ordering. `npm test -- src/systems/garden-sea-regions.test.ts src/three/garden-water.test.ts`.
**Depends:** S3-P1; S4-P1 for passive night contrast. **Risk/rollback:** hatching may look like a chart overlay; reject straight tiled blankets and revert packet if teaching fails. Until P1 passes, retain existing inlet protection.

### S5-P2 · Pond-first optics · M
**Goal:** eliminate checker structure, including the static frame.
**Files:** `scripts/pharosville/generate-water-normals.mjs`, `public/pharosville/textures/water-normals.png`, `src/three/garden-water.ts`, `src/three/garden-water-contract.ts`, `src/three/garden-water.test.ts`, new `src/three/garden-water-normals.test.ts`.
**Change:** expose pure generator functions without executing PNG/browser export on import. Generate deterministic periodic band-limited height/slope field: seeded unequal frequencies, ≥85% slope energy within ±20° of the primary axis, secondary energy ≤15%, no equal crossed pair. Keep 256² local linear normal asset, update URL hash. Replace rotated three-octave interference with broad directional detail plus one weak irregular fine band. Preserve normalized mip mean length before renormalizing; convert lost normal variance plus complete-field derivative variance into effective roughness. Use one filtered complete normal/roughness pair for Fresnel, probe, planar distortion, sun and moon lobes; suppress under-pixel frequencies, not just glints. Keep low-amplitude geometry/hull synchronization and displacement ceiling, not fragment gain 8 as an art invariant.
Use 2–12 integer cycles/tile with seeded phases and smoothly declining energy, RMS slope ≤0.06; primary texture tile spans ~40 world units. Retune all risk-body optical gains into this pond envelope (initial probe roughness 0.06–0.22), not merely Calm. Static signatures, not swell amplitude, carry ordinal severity.
After P1 proof, replace `quietBody` protection with region-independent inlet/shore shelter optical quieting; slicks may flatten optical slopes in any body but **never** attenuate signature ink/value or region identity. Remove obsolete `crossedNormal` field and all consumers/tests rather than aliasing it.
**Amend:** CONTRACTS bounded sea vocabulary/night-emission coverage; water-contract look constants. Add conservative unit-luminance term×occupancy proxy ≤0.016 in `garden-water.test.ts`, with documented occupancy bounds from matched full/new-moon captures; enumerate every open-night emissive term, not just moon-road. `--night-water` L* is not emission proof. Rewrite directional wiring pins; add generator/seam/band-limit/mip-variance/shared-normal tests. Retain Gerstner/displacement, clocks, disposal and drag parity.
**Budget:** +0 calls/tris/textures, ≤+1 KiB gzip; replaces one asset and shader terms, no runtime FFT/library.
**Acceptance:** matrix A/B; no repeating checker in right basin at any reduced/animated frame; filtered distant normals produce no bright crawling grid. `npm test -- src/three/garden-water-normals.test.ts src/three/garden-water.test.ts src/systems/garden-sea-regions.test.ts`.
**Depends:** S5-P1. **Risk/rollback:** loss of texture or quantization banding; revert generator+asset+shader together, never restore risk agitation alone.

### S5-P3 · Recognizable broken hero image · M
**Goal:** make the existing reflected landmark identifiable without spectacle.
**Files:** `src/three/garden-water.ts`, `src/three/garden-water.test.ts`, `src/three/garden-hero-reflection-pass.ts`, `src/three/garden-hero-reflection-pass.test.ts`.
**Change:** expose target texel dimensions; derive mip LOD from reflected-UV pixel footprint plus effective optical roughness/variance, not shore-distance `below`. Use bounded surface-axis distortion and ≤3 anisotropic taps whose spread follows roughness in texels; preserve sharp contact, recognizably inverted tiers and irregular breaks. Keep transparent premultiplied coverage, edge fade, soft-knee and hero-only clipped layer/cache. No new reflection geometry/pass.
**Amend:** CONTRACTS hero-only reflection; pass comments that prescribe downward blur. Retain half-CSS, clipping, cache invalidation/state-restoration tests; add footprint/roughness monotonic filtering and zero-spread calm-contact tests.
**Budget:** +0 calls/tris/textures, ≤+0.5 KiB gzip; existing owner ceiling +12 calls/+12k tris/+2 textures/≤1.2 ms remains, including changed S7 hero content.
**Acceptance:** matrix A + C: unlabelled reviewer recognizes inverted tower at both gates; no detached base/dark fringe; serial knockout GPU delta ≤1.2 ms. `npm test -- src/three/garden-hero-reflection-pass.test.ts src/three/garden-water.test.ts`.
**Depends:** S5-P2, S4-P1/P2. **Risk/rollback:** mirror steals hero attention; reduce optical coherence/spread through same policy, or revert complete consumer change.

### S5-P4 · Authored shallow margins · L
**Goal:** join garden ground and water through one authored shore.
**Files:** `src/three/garden-water.ts`, `src/three/garden-water-contract.ts`, `src/three/garden-sea-edges.ts`, `src/three/garden-water.test.ts`, `src/three/garden-sea-edges.test.ts`.
**Change:** consume S7-P2 coastal descriptor depth/substrate/exposure/masks in world coordinates and S2-P4 `GARDEN_SURFACE_GLSL`/`GardenSurfaceAtlasLease` bindings. Borrow renderer-owned textures, release leases; never dispose borrowed maps. Prefer spare distance-copy B/A and descriptor uniforms; IDs remain nearest-only. S7 owns any necessary packed atlas (+1 texture) and lifecycle. Replace approximate ellipse seabed and universal lap with masked substrate absorption; distort only bottom sampling in shallow clear water, never classification. Apply identical dry/damp/submerged thresholds to terrain and edge stones. Sparse exposed-shore lap only; sheltered edges stay dark/still. No scene refraction pass. Preserve obstacles and analytical tidal-flat area/datum/wrack; static coastal wetness is not supply tide.
**Amend:** CONTRACTS geography/decorative shore and bounded vocabulary; replace universal shore-foam constants. Rewrite material-response assertions, retain six-draw/exclusion/disposal pins; add mask-coordinate continuity and borrowed-resource lifetime tests.
**Budget:** S5 +0 calls/tris/textures, ≤+1 KiB gzip; material sampling replaces generic bathymetry/noise. S2 atlas and optional S7 +1 mask counted once by owners.
**Acceptance:** A/B shore crops show continuous substrate, no glowing collar/boat intersections; flood/ebb/unavailable tidal semantics unchanged. `npm test -- src/three/garden-water.test.ts src/three/garden-sea-edges.test.ts src/systems/garden-water-exclusion.test.ts src/three/garden-tidal-flat.test.ts`.
**Depends:** S7-P2, S2-P1/P4, S5-P2. **Risk/rollback:** registration/clutter; revert optical+material consumers together, retain truthful coast geometry.

### S5-P5 · Hull contact versus mover trails · M
**Goal:** ground stationary hulls and reserve trail attention for movers.
**Files:** `src/three/garden-wakes.ts`, `src/three/garden-water.ts`, `src/three/renderer-ship-frame.ts`, `src/three/garden-wakes.test.ts`, `src/three/garden-water.test.ts`, `src/three/garden-wake-batch.test.ts`.
**Change:** keep R/G/B, MAX, 512² pair and decay laws. Tighten static contact to a continuous hull-bedded footprint with footprint-filtered short optical reach, not a long smear. Movers retain local bow/stern/short arms and soft slick; use pixel-footprint filtering rather than equal bright far-field roads. Preserve raw zone/speed/change strength and monotonic R/G transfer; no financial recategorization or selected-only truth. Keep moored contact, no artificial trails; low-tier fallback respects the same semantics. Reduced frames redraw contact only on change.
**Amend:** CONTRACTS motion/channel parity; wake comments distinguish static from historical cues. Retain decay/frame-rate/pan/teleport/static-contact tests; add contact-only versus mover channel separation and ordered intensity tests, without deleting residue guards.
**Budget:** +0 calls/tris/textures, ≤+0.5 KiB gzip; no additional simulation.
**Acceptance:** D: contact grounds both near/distant hulls; 60-second trail fades completely, survives pan without residue; reduced shows no R/G. `npm test -- src/three/garden-wakes.test.ts src/three/garden-water.test.ts src/three/garden-wake-batch.test.ts src/systems/motion.test.ts`.
**Depends:** S5-P2, S6-P4. **Risk/rollback:** quieting hides intensity; restore previous optical transfer, never alter motion-source law.

## Capture matrix (implementation acceptance; not executed here)
Run serially against an already-running localhost server, baseline/candidate matched; review whole frame, right-basin/reflection/shore crops and sheets. Use RTX plus `S9:M5-calibration`. A expands to both fixtures × three sizes × day/ordinary-night/full-moon/new-moon × animated/reduced. Full/new dates are grounded in `src/systems/sky-almanac.test.ts:21-24`; no forced moon substitute.

```bash
# A
for fixture in quiet-dense mixed-capacity; do
 for size in 1600x1000 1200x640 900x720; do
  for phase in day night full new; do
   hour=22; date=2026-10-05
   case "$phase" in day) hour=12.25;; full) date=2026-09-26;; new) date=2026-10-10;; esac
   for mode in animated reduced; do
    flags=(); [ "$mode" = reduced ] && flags+=(--reduced)
    env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture "$fixture" --width "${size%x*}" --height "${size#*x}" --clock "$date" --hash "#t=$hour" --still-camera --seconds 20 --clean --metrics --night-water --draw-census --texture-census --burst 12 --interval 500 --burst-sheet "${flags[@]}" --assert --out "s5/$fixture-$size-$phase-$mode.png" --json "s5/$fixture-$size-$phase-$mode.json"
   done
  done
 done
done
# B: low sun amplifies optical defects
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --hash '#t=18.5' --still-camera --seconds 20 --clean --metrics --burst 12 --interval 500 --burst-sheet --out s5/golden.png --json s5/golden.json
# C: existing pass attribution, not whole-frame FPS
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --hash '#t=12.25' --seconds 20 --clean --knockout-compare reflection --out s5/reflection.png --json s5/reflection.json
# D: wake lifecycle and reprojection
 env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture mixed-capacity --fixture-clock flowing --hash '#t=12.25' --still-camera --seconds 60 --pan-zoom --burst 61 --interval 1000 --burst-sheet --stats --watch-seconds 60 --out s5/wakes.png --json s5/wakes.json
```

## Operator decisions required
1. **Risk through agitation or static surface grammar?** Keep roughness ladder / adopt the five sparse signatures. Recommend signatures; authorize removing forced swell/chop/foam escalation and extending inlet quieting only after P1 comprehension passes.
2. **Reflection: portrait mirror or recognizable broken silhouette?** Recommend broken silhouette, subordinate at 16px blur; never increase pass scope/resolution to buy clarity.

## Out of scope / do-not-do
No SSR, FFT ocean, fluid simulation, caustics, mirrored fleet, remote assets, extra renderer, turquoise/global bloom/exposure fixes or fake moonlight. Do not warp classification, turn decorative wetness into tide, add labels here (S3 owns teaching), or silently spend S2/S7 budgets twice. Same-origin `/api/*`, server-side key, sorted desktop gate/world unmounting, DOM/ledger parity, non-colour/non-motion truth, static reduced frame and release-only workflow remain untouched.

# S4 — Light & atmosphere

## Lever statement
The visitor can read a shaded garden, open inlet, headland and fleet at every real hour, including a moonless night. Replace the blue-grey daylight wash with one physically grounded sky/air solution and spend indirect illumination on sheltered surfaces, not lamp dots. Seasonal shadows and six recognizable PSI cloud silhouettes make time and market state distinguishable without adding spectacle.

## Verified current state
- `src/three/garden-day-cycle.ts:143-157,184-202,386-410`: noon key/ambient/hemi are 6.2/0.15/0.68; night ambient/hemi 0.06/0.1. **Correction to the “beacon only direct light” comment:** moonless key is still 0.4×0.25=0.1, not zero.
- `src/three/garden-sky.ts:74-90,632-681`: authored gradients plus scattering-like tint, not atmospheric transport; noon horizon deliberately middle-blue. `src/three/garden-aerial.ts:112-119,234-255,517-529` fits far transmittance 0.34, caps it at 0.5, and steps object air. Baseline `outputs/holistic/day.png` shows modeled tower faces but veiled mid-distance; `night.png` loses foreground/headland separation.
- `src/three/garden-environment.ts:38-43,89-105,138-140,403-436,651-654`: same dome feeds PMREM; differential SH contributes zero at rest. Cache uses phase+storm, missing changing midday sun direction/date and accepted cloud clarity. Its claimed day fill 0.57 is stale: actual ambient+hemi is 0.83.
- `src/three/garden-sun.ts:53-67,127-142`: seat-right compressed azimuth, every date normalized to apex 0.62 rad. `src/three/renderer-shadow-rig.ts:139-162,350-371,403-440`: fitted cached PCF, 2048/1024/768 maps, fixed bias and clock-driven radius; no contact hardening.
- `src/systems/psi-sky.ts:23-51,105-117,166-193` owns six cloud controls, 60-second acceptance and 90-second display easing. `src/three/garden-sky.ts:390-395,1104-1131` shows BEDROCK strokes occupying only ~0.3% despite 0.05 cover control. The captures cannot prove six-state recognition.
- Freshness fog is separate (`src/three/garden-height-fog.ts:16-20,146-167`). **Correction:** threat-driven sky staging is stale registry prose (`src/systems/visual-cue-registry.ts:452-453`); live weather reads PSI (`src/systems/weather.ts:125-143`). Source-health beacon modulation is real and distinct (`src/systems/lamp-status.ts:89-101`), not an illumination defect to silently delete.
- **Additional correction:** CONTRACTS:378-382 describes a 0.0155 occupancy-weighted emission proxy, but `src/three/garden-water.test.ts` contains no such assertion; `src/three/garden-water-contract.ts:107-111` instead refers to rendered luminance. S5 must restore emission evidence; inlet L* is not interchangeable with mean emission.

## Target state
Neutral noon reveals near stone/moss/timber and mid-fleet silhouette; recession concentrates in borrowed hills, increases monotonically with worsening accepted PSI, and never counterfeits stale-source banks. Golden light rakes; twilight transitions continuously. Night has cool reflected surface mass with black localized recesses, a dominant beacon and optional moon rim/road—never a permanent moon or glowing sails. At 1200×640 and 900×720 the approach, inlet edge, headland and fleet remain separable; reduced motion immediately resolves the same complete composition, including PMREM and settled clouds.

Replace the bible's night land ninth targets 3–8 with region criteria: paired threshold–inlet and headland–water boundary samples differ by ≥4 L*; stone/moss/timber reference patches differ by ≥3 L*; ≥90% of designated non-recess approach pixels reach L*6. These are proposed acceptance floors, not whole-frame brightening targets. Retain indigo sky L*7–15, beacon hierarchy and open-water **mean emission ≤0.016**. Risk silhouettes/signatures and selected issuer mon remain inspectable; S3's DOM key/ledger remains authoritative. Ninth MAE becomes diagnostic, not an unreadability pin.

## Ordered packets
Budgets below are **estimated incremental ceilings**, not measured savings; calls/triangles mean steady visible frame. All packets preserve existing global/resource/bundle limits; cumulative S4 JS allowance ≤9 KiB gzip, subject to S2/S9's shared envelope.
Each packet also updates `src/content/pharosville-changelog.ts` and the exact docs/tests named below. S5-P2 owns restored term×occupancy emission evidence; S4 never substitutes pixel brightness for that ceiling.

### S4-P1 · Moon-independent night · M
**Goal:** usable night before geometry replacement.
**Files:** `src/three/garden-day-cycle.ts`, `src/three/garden-environment.ts`, `src/three/garden-sky.ts`, `scripts/pharosville/preview-metrics.mjs`, `scripts/pharosville/preview.mjs`.
**Change:** calibrate cool sky diffuse/ground fill and night environment together; remove moonless directional-key floor, retain actual lunar rim. Do not raise exposure, sail emission or water roads. Add `--light-rois <json>` to preview: CSS-pixel polygons grouped as boundary pairs, stone/moss/timber patches and non-recess approach; compute median, paired contrast and L*6 coverage using existing decoded pixels. Annotate separate polygons per aspect after capture; exclude lamps/cloth/recesses and copy polygons into result JSON.
**Amend:** `docs/pharosville/VISUAL_INVARIANTS.md` “Value plan”/“Atmosphere before grade”; `docs/pharosville/CONTRACTS.md` “Light, palette, water and rendering budgets”. Rewrite `src/three/garden-day-cycle.test.ts:198-206` ambient/hemi ceilings and direct>fill assertion into moon-independent diffuse/phase-continuity tests; retain sail bounds. Add `scripts/pharosville/preview-metrics.test.mjs` for ROI arithmetic. Keep water-emission gains unchanged; S5 restores the missing proxy before integrated release.
**Budget:** +0 calls/tris/textures, ≤0.5 KiB JS; coefficients and offline metrics only.
**Acceptance:** matrix night/new-moon/full-moon + both gate/reduced arms; region criteria, brightest blurred local source remains beacon, water-emission gains unchanged. Integrated release additionally requires S5's measured emission/occupancy proof ≤0.016. `npm test -- src/three/garden-day-cycle.test.ts src/three/garden-environment.test.ts src/three/garden-water.test.ts`; `node --test scripts/pharosville/preview-metrics.test.mjs`.
**Depends:** `S9:invariant-rewrite`. **Risk/rollback:** washed night; revert lighting coefficients as one rig, not darker grade.

### S4-P2 · One daylight transport · L
**Goal:** coherent sky, air, reflections and irradiance.
**Files:** `src/three/garden-atmosphere.ts` (new), `src/three/garden-sky.ts`, `src/three/garden-aerial.ts`, `src/three/garden-environment.ts`, `src/three/world-renderer.ts`.
**Change:** evaluate installed Three `Sky` against baseline, then extract/adapt its compact analytic Rayleigh/Mie optical-length/phase approach into shared linear-radiance functions, with CPU twins. Installed addon already contains animated decorative clouds and output transforms (`node_modules/three/examples/jsm/objects/Sky.js:79-91,244-275,335-336`): disable/remove those, not a second dome/colour authority. Replace daytime gradient/scattering/haze, object air quantization and eye-fitted far wash; retain composed night/celestials, PSI ridges and localized freshness fog. Shared coefficients drive Beer–Lambert finite-distance extinction and in-scatter; near/mid clear-noon transmittance ≥0.9/0.8 at authored samples, hills recede. PSI controls aerosol/visibility, never sun energy/time. Keep diagnostic fog distances for existing fleet/keyline consumers, not physical density fitting.
Stage all radiance/cloud uniforms before PMREM bake; migrate callers to a cache key including quantized solar direction/date, displayed accepted clarity, and night lunar state, with hysteresis. Preserve bake cadence, async differential SH, failure/disposal and immediate static bake.
**Amend:** same docs sections as P1 plus shared-arc coverage. Delete fixed far-T/≥30%-far-plate haze pins (`garden-aerial.test.ts:42-53`, `garden-sky.test.ts:342-358`); rewrite as clear near/mid, monotonic distance/PSI, CPU/GLSL agreement and seam tests. Rewrite `garden-environment.test.ts:27-38` flat-midday key assumption; retain cadence/SH invariants.
**Budget:** +0 calls/tris/textures, ≤3 KiB net JS; remove superseded shader laws. Choose analytic **zero LUTs**: no replacement texture allowance is spent. A LUT redesign is not this packet; any separately approved variant must cap at two local LUTs and name measured retired texture owners before spending, never retire shared noise merely to balance a spreadsheet.
**Acceptance:** full five-beat matrix + overview; clear noon, no horizon/water seam or air bands, stable probe swaps. `npm test -- src/three/garden-atmosphere.test.ts src/three/garden-aerial.test.ts src/three/garden-sky.test.ts src/three/garden-environment.test.ts`.
**Depends:** S4-P1. **Risk/rollback:** physical radiance overwhelms stylized forms; restore complete former sky/air owner, never stack both.

### S4-P3 · Sheltered-surface irradiance · M
**Goal:** tactile spatial bounce without extra lights.
**Files:** `src/three/garden-irradiance.ts` (new), `src/three/garden-day-cycle.ts`, `src/three/garden-environment.ts`, `src/three/garden-print-inks.ts`, `src/three/world-renderer.ts`.
**Change:** author three smooth world-space zones: shaded engawa/threshold, stone court, waterside. Evaluate bounded L1 irradiance from zone sky visibility and ground/material reflectance; blend by world position/normal, preserving nonnegative energy. Insert diffuse-only correction after surface preparation and before print inks through `chainGardenMaterialPatch`; S2-P1 hook applies it to shared/instanced materials. Replace measured ambient/hemi energy, not PMREM specular or its differential SH. No baked sun, probes/readbacks per zone or frame allocations; cavity atlas covers cracks, not a second broad occlusion.
**Amend:** rendering-budget docs above; add `src/three/garden-irradiance.test.ts` continuity/rotation/energy/instance tests; retain print-ink identity exemptions.
**Budget:** +0 calls/tris/textures, ≤2 KiB JS; four RGB coefficients/zone, three bounded evaluations.
**Acceptance:** five beats after S1; shelter remains shaded but legible; no hard zone boundary/double AO. `npm test -- src/three/garden-irradiance.test.ts src/three/garden-print-inks.test.ts src/three/garden-environment.test.ts`.
**Depends:** S4-P2, S2-P1, S1-P1. **Risk/rollback:** excess indirect energy; remove correction and restore matched global fill atomically.

### S4-P4 · Seasonal solar apex · S
**Goal:** seasonal shadow lengths without abandoning the authored seat.
**Files:** `src/three/garden-sun.ts`.
**Change:** add `gardenSolarApexForDay(day)` returning `clamp(0.62 + 0.4*(day.apexElevationRad - (π/2 - 35°)), 0.42, 0.85)`; remove fixed `GARDEN_SUN_NOON_ELEVATION` export and migrate its test consumers. Scale the same almanac elevation curve. Preserve seat-right azimuth, ±57° compression, horizon crossings, true-elevation beat boundaries and minimum key elevation. Document this as composed seasonal light, not an astronomical-location claim.
**Amend:** CONTRACTS shared-arc paragraph; rewrite fixed-season pin `garden-sun.test.ts:39-50`, solar-noon assertions and `garden-sky.test.ts:203`; retain bearing/unit/continuity/allocation tests.
**Budget:** +0 calls/tris/textures, ≤0.2 KiB JS.
**Acceptance:** seasonal matrix, hemisphere-reversed tests; winter caster shadow ≥1.5× summer length without clipping. `npm test -- src/three/garden-sun.test.ts src/three/garden-sky.test.ts src/three/world-renderer.test.ts`.
**Depends:** S4-P2, `S9:invariant-rewrite`. **Risk/rollback:** precinct shading changes; restore fixed apex only as an explicit operator rollback.

### S4-P5 · Recognizable cloud codebook · M
**Goal:** teachable PSI cover at rest, independent of colour/motion.
**Files:** `src/three/garden-sky.ts`, `src/systems/psi-sky.ts`.
**Change:** retain six canonical controls; distinguish sparse visible cirrus, fair separated stroke groups, high veil without low bodies, broken low deck, nearly closed low cloud, textured overcast ceiling. Approximate visible occupancy bands 3–7/10–20/25–40/45–60/68–80/85–95%; morphology, not just coverage, separates neighbors. Couple radiance to P2; retain indigo body contrast on moonless night, restrained crown clearing, shared noise and no cloud draws. No seventh “unavailable weather” state; preserve held last-good/unnamed initial veil, 60s acceptance, 90s easing and reduced-motion snap. S3 owns canonical words and longer descriptions.
**Amend:** bible cloud paragraph and CONTRACTS PSI ownership; rewrite shape/coverage uniform pins, retain `src/systems/psi-sky.test.ts` hysteresis/held tests and sky static/drift tests.
**Budget:** +0 calls/tris/textures, ≤0.5 KiB JS; reauthor existing dome sampling.
**Acceptance:** six-band noon/night sheets; operator names all six using S3 key and matches neighboring silhouettes without colour/motion. `npm test -- src/three/garden-sky.test.ts src/systems/psi-sky.test.ts`.
**Depends:** S4-P2, S3-P1. **Risk/rollback:** attention theft; revert cloud presets together, keep semantic fixes.

### S4-P6 · Conditional contact hardening · L if justified
**Goal:** grounded static garden contacts, only when geometry demonstrates need.
**Files:** `src/three/renderer-shadow-rig.ts`, `src/three/garden-contact-shadows.ts` (new), `src/three/world-renderer.ts`.
**Change:** first stabilize fitted XY bounds to shadow texels and scale bias in world units after S1 geometry. Ship PCF if stone/eave/branch contacts already read. Only with operator-visible whole-frame improvement and M5 headroom implement scoped WebGL2 PCSS: eight blocker samples, sixteen fixed world-stable filter samples, orthographic linear-depth penumbra from sun angular size, bounded radius. Use static casters' shared `customDepthMaterial` with RGBA-packed raw blocker depth in the **already allocated shadow colour attachment**, alongside native comparison-depth sampling; explicitly bind both, not a legacy packed-depth snippet against `sampler2DShadow`. Installed allocation/custom-depth seams: `WebGLShadowMap.js:253-265,433-441`. Preserve shafts, cached invalidation, alpha cutouts, constrained no-sampler path and tier disposal. No moving-ship shadows/cascades.
Use nearest filtering on packed blocker colour, linearize unpacked depth using the fitted near/far, and handle reversed-depth explicitly; native comparison texture keeps its own filtering/state.
**Amend:** rendering-budget docs; new `src/three/garden-contact-shadows.test.ts`; retain renderer breathing/threshold-fit/cold-constrained tests (`world-renderer.test.ts:1303,1327,1429`), rewrite fixed PCF-radius pins only if PCSS ships.
**Budget:** +0 calls/tris/textures, ≤2 KiB JS; existing attachment replaces unused colour-depth output. Additional GPU p95 ≤0.6ms on M5; report cached redraw spikes separately.
**Acceptance:** day/golden crops AND rest frame, seasonal/reduced/tier transitions; no swimming/acne/detachment. `npm test -- src/three/garden-contact-shadows.test.ts src/three/world-renderer.test.ts` (new test only if implemented).
**Depends:** S4-P3, S4-P4, S1-P1, `S9:triangle-spike`, `S9:M5-calibration`. **Risk/rollback:** shader coupling/aliasing; delete PCSS owner/material patches and return to stabilized PCF, not a shipped dual lane.

## Capture matrix (executor; not run during this specification)
Run serially on RTX and acceptance M5, same fixture and reported timezone; verify actual beat weights, not filename assumptions. This exact command template expands every row:
Suffix NAME with dimensions and `-static` for repeated arms. After P1, annotate `outputs/s4/rois-WxH.json` from baseline/candidate frames and repeat region-measurement arms with `--light-rois outputs/s4/rois-WxH.json` (new flag delivered by P1).

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --fixture quiet-dense --clock "$DATE" --hash "$HASH" --width "$W" --height "$H" --clean --still-camera --seconds 20 --metrics --value-plan --night-water --draw-census --texture-census --out "s4/$NAME.png" --json "s4/$NAME.json"
```

| NAME | DATE | HASH | W×H |
|---|---|---|---|
| dawn/day/golden/blue/night | 2026-10-05 | #t=7 / #t=12.25 / #t=18.5 / #t=19.2 / #t=22 | 1600×1000 |
| full-moon/new-moon | 2026-09-26 / 2026-10-10 | #t=22 | 1600×1000 |
| summer/winter | 2026-06-21 / 2026-12-21 | #t=12.25 | 1600×1000 |
| overview | 2026-10-05 | #cam=0,0,0.28&t=12.25 | 1600×1000 |
| cloud-BAND-day/night | 2026-10-05 | #t=12.25&sky=BAND / #t=22&sky=BAND | 1600×1000 |

Expand BAND over BEDROCK/STEADY/TREMOR/FRACTURE/CRISIS/MELTDOWN. Repeat five beats and new-moon at both gates; repeat those rows adding `--reduced`. Add selected night arm `--hash '#sel=ship.usdc-circle&t=22'`; new-moon JSON must confirm negligible lunar contribution. Seasonal comparisons also capture each date's reported solar noon if 12.25 differs. Review 16px-blur/notan, region polygons, issuer anchors, calm dark inlet and S3 analytical key together; `--night-water` measures pixels, **not** emission. Measure DPR1/2 and bake/re-steer tails through `S9:M5-calibration`; no RTX extrapolation.

## Operator decisions required
1. Replace near-black ninth/fill pins with region readability floors, or preserve black silhouettes? **Recommend readable indigo garden**, approve P1 thresholds on new-moon captures.
2. Seasonal compressed elevation or full astronomical elevation? **Recommend bounded seasonal apex**, preserve authored azimuth.
3. PCSS after new geometry or mandatory PCSS now? **Recommend evidence-gated**, stabilized PCF is a valid completed packet.

## Out of scope / do-not-do
No WebGPU, extra renderer, GI/history pipeline, global decorative fog, permanent moon, extra lights/bloom, tone-mapper switch or flattering default hour. No unapproved source-health beacon channel removal; S3 owns that decision/copy. Preserve same-origin API/server-side key, sorted-size unmounted gate, DOM/ledger parity, non-colour/static alternatives, local assets and release-workflow-only deployment. Palette/geometry/water redesign belongs to S1/S2/S5/S7; S4 integrates their light response, not duplicate systems.

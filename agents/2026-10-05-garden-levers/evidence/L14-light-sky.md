# L14 — Light, sky, atmosphere, time of day

## Verdict
The biggest gap is **readable garden illumination throughout the real day**, not missing effects. Noon has credible side lighting but blue-grey distance; night loses the garden, inlet and data. Coherent daylight atmosphere and spatial indirect light beat another grade or exposure tweak.

## Evidence
Source basenames resolve under `src/three`, except `sky-almanac` under `src/systems`; documents under `docs/pharosville`; execution record under `agents/2026-10-02-visual-upgrade`.
1. **H3 confirmed, with qualification.** `outputs/holistic/day.png` has a cerulean upper sky, neutral-white tower highlights and readable lit/shade faces—not honey and not uniformly flat. However, the far fleet/headlands merge into a blue-grey middle-distance belt; the inlet and shade are predominantly blue. This is intentional source policy: `garden-sky.ts:74–77` lowers noon horizons to middle-value blue; `garden-aerial.ts:114–119,517–528` fits extinction to far transmittance 0.34, modified by clarity and capped at 0.5. The fog ladder deliberately puts the far plate into haze (`garden-sky.ts:197–202`). [INFERENCE] That enforced recession is stronger than needed for a calm, clear noon.
2. **Key direction is already solved; do not “add a sun.”** Noon's key comes from the seat's right, producing a lit tower side against a darker broad face (`garden-sun.ts:38–55`). The rig already uses cached 2048² PCF shadows, fitted to the view, including threshold bounds (`renderer-shadow-rig.ts:2–17,139–162`). `day.png` shows broad bank shade and island modelling, but little fine garden-scale contact structure. The day rig is key 6.2, ambient 0.15 and hemisphere 0.68 (`garden-day-cycle.ts:143–157`); these intensities alone are not a measured key/fill ratio.
3. **Five beats are visibly distinct, but unevenly useful.** `dawn.png`: luminous peach horizon, dark tower/garden, readable reflective water. `golden.png`: strongest hero separation, orange stone against violet-blue distance; foreground nearly disappears. `blue.png`: attractive quiet twilight, but a conspicuous horizontal rose band and declining scene readability. `night.png`: deep indigo sky and ridges remain visible, while bottom garden becomes almost black and the inlet/risk geography loses separation. Thus “night nearly black” applies primarily to land/water, not the whole sky. Existing A1b lifted threshold only and still missed its night targets (`02-execution-record.md:16`).
4. **Aerial perspective exists; height fog is not a general haze knob.** One shared air replaces Three's linear fog; objects use three softened transmittance steps, water uses smooth transport (`garden-aerial.ts:17–35,234–255`). `garden-height-fog.ts:16–20,146–167` is the separate bounded *stale-source* shelf. Turning it into pretty garden mist would counterfeit freshness. Borrowed scenery is already five authored ridges with three kasumi strips in one draw, following the eye without parallax (`garden-horizon.ts:34–51,53–92,347–360`).
5. **Cloud semantics are implemented but not demonstrated by these captures.** The six-band ladder drives high strokes, veil and low deck, eased over 90 seconds (`garden-sky.ts:1104–1131`); the shader uses shared noise and three-tone lighting (`:742–773`). The supplied five skies read largely gradient-first, without clearly identifiable cloud forms. They do not establish which market band was accepted, so they cannot prove six-band distinguishability. [INFERENCE] A tiny “clear sky” stroke occupancy is too subtle to teach this encoding at rest (`:390–395`).
6. **Neither PMREM nor volumetric beacon is missing.** The environment already bakes the visible dome; its LightProbe is a differential swap correction, zero at rest—not garden bounce (`garden-environment.ts:32–43,78–105`). The beacon already analytically shades the view-ray chord through a cone with drifting mist (`garden-lighthouse.ts:1292–1304`), plus bounded beacon-lit air (`garden-aerial.ts:256–269`). `night.png` shows a restrained beam, but small ship/foreground lamps attract attention against black land. No obvious moon road is visible; absence is not a defect by itself: road strength follows moon presence/illumination and night/blue weights (`garden-water.ts:2114–2121`). The moon model is an approximate synodic-age/fixed-span arc, not a full ephemeris (`sky-almanac.ts:271–317`).

## Ranked levers

### 1. Readable moonless-night composition
**Change:** Re-author night indirect illumination in `garden-day-cycle`, `garden-environment`, water and threshold materials as a *moon-independent sky/bounce floor*: separate the inlet, headland and threshold planes through reflected indigo fill, retaining dark recesses. Moon adds a directional rim/road only when present; beacon lights its precinct, not the whole tower. Demote ship practicals if their aggregate brightness competes. Do not solve with sail emission or blanket exposure.

**Impact 5/5:** makes the garden and coarse market reading usable every evening, including moon-down dates. **Effort M. Risk:** washed-out night or counterfeit moonlight. **Touched:** bible “Value plan”/“Atmosphere before grade” (`VISUAL_INVARIANTS.md:27–36,74–88`); light hierarchy/open-water emissive ceiling (`CONTRACTS.md:361–382`). Change the constant-only night fill ceilings in `garden-day-cycle.test.ts:198–206` if necessary; retain rendered hierarchy and colour anchors. **Dependencies:** water/material owners and DOM data-legibility review. **Verification:** full/new-moon real-GPU captures, per-region L*, night-water metric, 16px blur, unchanged issuer anchors; targeted day-cycle/environment/water tests and reduced-motion night frame.

### 2. One physically grounded daylight sky and air
**Change:** Replace—not stack over—the authored daylight gradient/scattering approximation in `garden-sky` and eye-fitted colour wash in `garden-aerial` with a compact Rayleigh/Mie atmosphere (analytic model or small precomputed transmittance/sky-view LUTs). Feed the **existing** PMREM from that same radiance. Preserve composed night art direction, shared sun direction, the market cloud ladder and local freshness fog. Author a genuinely clear near/middle noon, with strong recession reserved for borrowed hills and worsening clarity; remove object air quantisation where it reads as bands.

**Impact 5/5:** coherent sky, reflections, shade and distance rather than blue-grey filtering; technology serves depth. **Effort L. Risk:** a realistic sky over toy geometry; LUT cost/colour policy conflicts. **Touched:** atmosphere-before-grade and wall-clock ownership (`VISUAL_INVARIANTS.md:69–95`), shared arc/one tone mapper and budgets (`CONTRACTS.md:342–359,383–388`). Budget at most two added LUT textures, offset by replaced resources; no remote assets. **Dependencies:** pipeline, water and stylization decisions. **Verification:** matched five-beat/overview captures, haze-distance/clarity monotonicity tests, dome/PMREM agreement, no seam; GPU p95 and bake spikes on RTX and acceptance M5 Pro. Current supplied frame p50 is 2.47ms day/2.72ms night (`day.json:55`, `night.json:55`), not an M5 allowance.

### 3. Spatial garden bounce and seasonal shadow grammar
**Change:** Supplement the sky-only environment with a small, static low-order irradiance field for water-side, stone court and shaded threshold; replace part of global ambient/hemi energy rather than adding brightness. Give stone, timber and foliage contact/shade a shared spatial basis. Let seasonal solar apex influence shadow length instead of normalizing every noon to 0.62rad (`garden-sun.ts:127–142`); retain the authored right-side bearing and cached shadow rig.

**Impact 4/5:** garden materials and sheltered seating gain tactile depth; season becomes light and space, not merely tint. **Effort L. Risk:** SH/probe blending complexity, shadow-fit regressions. **Touched:** composed seat/value plan, no new attention events, shared arc (`CONTRACTS.md:342–348`); challenge fixed apex explicitly. Keep geometry/texture ceilings and allocation-free frame updates. **Dependencies:** threshold geometry, material normals and seasonal phenology. **Verification:** summer/winter noon plus low-sun close-ups, contact/shadow continuity, no double-counted indirect energy; targeted sun/shadow/environment tests and real-GPU frame/bake metrics.

### 4. A cloud ladder people can actually recognize
**Change:** Art-direct six perceptually distinct silhouettes/coverage states within the existing dome shader; clear/fair strokes must be visible but sparse, veil must differ from distant haze, overcast must remain readable at night. Keep the crown opening restrained. Couple cloud radiance to the unified sky without introducing independent decorative weather.

**Impact 4/5:** turns market clarity into a teachable environmental reading. **Effort M. Risk:** attention theft or forecast interpretation. **Touched:** fixed ladder/90s transition/ledger wording (`VISUAL_INVARIANTS.md:90–95`, `CONTRACTS.md:220–227`), crown hierarchy, no extra draws. **Dependencies:** PSI acceptance/hysteresis and DOM wording. **Verification:** six-band contact sheet at noon/night, band transition and held-source tests, reduced-motion settled tableau; GPU shader timing.

## Do-not-do / traps
- Do not add generic global volumetric fog, another beacon shaft or another sky probe; those systems already exist. A depth-aware beam replacement is lower priority than seeing the garden.
- Do not restore honey noon, inflate bloom, switch tone curves, invent a permanent full moon, or choose a flattering default hour.
- Do not repeat imperceptible micro-craft: A2/B1/P1 rejected; W1 unnecessary (`02-execution-record.md:17–20`). Require whole-frame, blurred-view gains.
- Do not treat numeric caps or pixel-average agreement as proof that risk water and fleet remain readable.

## Invariants worth challenging
- **Fixed solar apex 0.62rad** (`CONTRACTS.md:345–346`) suppresses seasonal shadow differences despite a date-aware almanac. Keep authored azimuth; allow bounded seasonal elevation.
- **Mandatory far haze/three-step object air** (`garden-sky.ts:197–202`; `garden-aerial.ts:112–117`) are implementation policies worth retiring, not sacred Japanese-garden principles.
- **Night value targets/fill ceilings:** retain deep-indigo sky and beacon dominance, but replace extremely low land targets and coefficient ceilings with region separation and analytical readability criteria. No challenge to gate, API, accessibility parity, reduced motion or resource caps.

## Captures wanted
Run serially on real GPU. Existing preview flags: `scripts/pharosville/preview.mjs:79–98`; use its reported timezone, not an invented timezone flag. Date pins make comparisons reproducible. `sky=BAND` is the existing debug seam (`garden-sky.ts:1104–1110`), not production weather. All outputs go under `outputs/`.

```bash
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=7' --clean --metrics --value-plan --out l14/dawn.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=12.25' --clean --metrics --value-plan --out l14/day.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=18.5' --clean --metrics --value-plan --out l14/golden.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=19.2' --clean --metrics --value-plan --out l14/blue.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=22' --clean --metrics --value-plan --night-water --out l14/night.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-09-26 --hash '#t=22' --clean --metrics --night-water --out l14/full-moon.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-10 --hash '#t=22' --reduced --metrics --night-water --out l14/new-moon-static.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-06-21 --hash '#t=12.25' --clean --metrics --out l14/summer.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-12-21 --hash '#t=12.25' --clean --metrics --out l14/winter.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=12.25&sky=BEDROCK' --clean --metrics --out l14/bedrock.png
env -u CI npm run preview -- --url http://localhost:5173 --headed --clock 2026-10-05 --hash '#t=22&sky=MELTDOWN' --clean --metrics --out l14/meltdown-night.png
```

Review only: supplied captures and source inspected; no gates, builds, tests or new captures run.

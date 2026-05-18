# PharosVille Nightmode Revamp Plan

- Date: 2026-05-18
- Status: Chosen direction / art-direction and implementation plan
- Scope: standalone `pharosville` repo only
- Requested deliverable: explore enhancements for the night sky, lighthouse aura, and beam so PharosVille night becomes more eerie, fantastical, special, and unique
- Change type for this document: agent docs only

## 1. Current Diagnosis

The current deep-night frame is functional and readable, but it does not yet feel singular. It reads as a warmed dashboard diorama under two clean searchlight cones, not as a strange ancient Pharos night.

Evidence inspected:

- Night visual baseline: `tests/visual/pharosville.spec.ts-snapshots/pharosville-night-desktop-chromium-linux.png`
- Sky mood, stars, clouds: `src/renderer/layers/sky.ts`
- Night tint and vignette: `src/renderer/layers/night-tint.ts`
- Lighthouse fire, aura, sweep, god rays, reflection: `src/renderer/layers/lighthouse.ts`
- Layer order: `src/renderer/world-canvas.ts`
- Current pyre asset: `public/pharosville/assets/landmarks/lighthouse-pyre.png`
- Existing lighthouse plan history: `agents/completed/pharosville-lighthouse-fire-options-2-3-plan.md`
- Current wow plan: `agents/2026-05-17-pharosville-wow-revamp-plan.md`

Specific issues:

1. **Night sky is too passive.** `SKY_MOODS.night` currently gives a dark maroon/navy gradient, 14 stars, two constellation chains, three cloud strokes, and a standard moon. It supports the world but does not create a strong place-memory.

2. **Aura is too broad and milky.** `drawLighthouseNightHighlights()` adds a 1500 px diffuse wash and a 1000 px water pool. The result warms the scene, but the neutral-green diffuse gradient and wide coverage flatten the island instead of creating an eerie light source with surrounding darkness.

3. **Beam is too modern and geometric.** The paired sweep beams are long, clean trapezoids with smooth linear gradients. They solve "lighthouse beam reaches the map," but they still read closer to a theatre spotlight or modern Fresnel lamp than an ancient pyre, occult lens, or mythic warning device.

4. **The flame sprite exists but is not wired into the renderer.** The manifest includes `landmark.lighthouse-pyre`, and the PNG is a useful small brazier. `lighthouseRenderState()` only fetches `landmark.lighthouse`, so the existing pyre asset does not participate in the current render path. The procedural flame is doing the visible work.

5. **The current night lacks a signature motif.** The lighthouse, sky, water, and beam each have effects, but they do not share one memorable visual idea. The scene needs a motif that could only belong to PharosVille.

## Inspiration Synthesis

The prompt references the current night frame as Image #1 and loose inspiration images #2-#6. The inspiration images are not repo artifacts, so this plan treats them as mood direction rather than literal source assets.

Mood traits to preserve from the prompt:

- Eerie first, not merely darker.
- Fantastical, but still maritime and data-observatory grounded.
- Special and unique at thumbnail size, with one memorable lighthouse/sky signature.
- Stronger contrast between living warm fire and hostile dark sea.
- A beam that feels authored and mythic, not a stock spotlight overlay.

If exact matching to any inspiration image becomes important, place the reference images under `outputs/` or attach them again during implementation review, then run a screenshot-led art-direction pass before editing baselines.

## 2. North Star

Chosen direction: **Option A - Eye Of Pharos**.

At night, PharosVille should feel like an ancient maritime observatory powered by a living pyre. The lighthouse is not merely illuminating the island. It is reading the sea.

Visual language:

- Deep mineral night: ink, soot, oxidized copper, bruised red, and cold sea green.
- Warm pyre core: amber, ember orange, old gold, and pale sulfur highlights.
- Dark corona: visible darkness around the aura, so the light feels carved out of the night.
- Beam as ritual instrument: ribbed, smoky, imperfect, and caustic on the water, not a clean transparent triangle.
- Sky as navigational omen: denser star routes, thin cloud veils, and subtle celestial arcs that point back to the lighthouse.

The memorable read should be: **a haunted ancient signal tower casting a living, smoky beam over a data-sea.**

## 3. Hard Rails

- Preserve the desktop gate: no world runtime below `720x360`.
- Browser code stays same-origin `/api/*`; no client secrets.
- Do not change data semantics or API contracts for a visual-only pass.
- Any new analytical visual needs detail-panel and accessibility-ledger parity.
- Purely atmospheric visuals may stay canvas-only if they carry no analytical meaning.
- Reduced-motion must render a stable, informative night frame without oscillation, trails, or moving particles.
- Keep DEWS water-zone readability; the night mood must not hide Alert, Warning, Danger, Ledger, or printed water labels.
- Avoid generic AI dark-mode tropes: no purple-blue neon wash, no decorative glow blobs, no glassmorphism, no gradient-text style.

## 4. Recommended Package

Ship this as one coordinated visual wave with three core moves:

1. **Sky Refit:** deeper and stranger night sky with denser star navigation, dark cloud veils, and a moon treatment that frames the lighthouse instead of competing with it.

2. **Pyre Aura Refit:** replace the flat diffuse wash with layered pyre light plus dark corona, and wire the existing pyre asset or regenerate it as an animated fire if quality requires it.

3. **Beam Refit:** change the night beam from a clean paired spotlight into a ribbed, smoky, caustic "Eye of Pharos" sweep with a thinner core, ember tail, and stronger water interaction.

This should be a visual implementation pass, not a new game mechanic.

## 5. Concrete Tasks

### NM0 - Snapshot And Calibration

Goal: make visual decisions against real pixels before changing constants.

Tasks:

- Capture current night and lighthouse close-up from the maintained dev server.
- Compare at least these views:
  - Home night view at `wallClockHour = 22`
  - Dense lighthouse crop
  - Dusk transition at `wallClockHour = 19`
  - Reduced-motion night
- Calibrate the chosen Eye Of Pharos direction against the screenshots before editing constants.

Suggested commands:

```bash
npx playwright test tests/visual/pharosville.spec.ts --grep "night atmosphere"
npx playwright test tests/visual/pharosville.spec.ts --grep "dense-lighthouse"
```

Exit criteria:

- Current problem is visible in screenshots.
- The Eye Of Pharos direction has a screenshot-backed tuning target for sky darkness, aura contrast, and beam texture.

### NM1 - Night Sky Refit

Files:

- `src/renderer/layers/sky.ts`
- `src/renderer/layers/sky.test.ts`
- Potentially `src/renderer/layers/cinematic-atmosphere.ts`

Implementation ideas:

- Rework `SKY_MOODS.night` away from the current soft maroon/navy balance toward an inkier mineral palette:
  - top: near-black red-violet soot, not purple neon
  - horizon: cold oxidized copper/sea-green edge
  - lower: very dark blue-black
  - mist: lower alpha, cooler, less milky
- Increase the star field from 14 hand-authored stars to about 32-40 deterministic points, still fixed and low-cost.
- Replace the simple two-chain constellation with a **navigator lattice**: 3-4 sparse broken lines that subtly converge toward the lighthouse's sky glow.
- Add one or two thin "cloud veil" bands at night with low alpha, darker than the sky, so the sky has occlusion and depth.
- Make the moon less central as a generic celestial object:
  - option A: partial-eclipse crescent with a dim copper rim
  - option B: cloud-veiled moon with a sharper cutout and weaker glow
  - option C: no stronger moon; let the pyre dominate

Reduced-motion:

- Stars and cloud veils remain static.
- No twinkle phase dependency in reduced motion beyond the existing deterministic branch.

Validation:

```bash
npm test -- src/renderer/layers/sky.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "night atmosphere"
```

### NM2 - Pyre Asset Wiring Or Regeneration

Files:

- `src/renderer/layers/lighthouse.ts`
- `public/pharosville/assets/manifest.json`
- `src/systems/asset-manifest.ts` only if animation schema needs extension, which it should not
- `src/renderer/layers/lighthouse-night.test.ts`

Observation:

- `landmark.lighthouse-pyre` already exists in the manifest and points to `landmarks/lighthouse-pyre.png`.
- Current renderer code does not fetch `landmark.lighthouse-pyre` in `lighthouseRenderState()`.

Recommended first step:

- Add `pyreAsset = assets?.get("landmark.lighthouse-pyre")` to `lighthouseRenderState()`.
- Draw it at `firePoint` before or instead of the procedural flame body.
- Keep procedural embers, smoke, and heat shimmer because they are already tied to `lighthouseFireFlickerPerSecond` and sea state.
- If the static pyre sprite is too small or too clean in screenshot review, regenerate it as an 8-frame PixelLab animation following the existing plan in `agents/completed/pharosville-lighthouse-fire-options-2-3-plan.md`.

Design requirement:

- The pyre should look like a fire bowl, not a modern bulb.
- It should remain readable at home zoom and not overpower the lighthouse silhouette.

Validation:

```bash
npm test -- src/renderer/layers/lighthouse-night.test.ts
npm run check:pharosville-assets
```

### NM3 - Aura Refit: Light With A Dark Corona

Files:

- `src/renderer/layers/lighthouse.ts`
- `src/renderer/layers/lighthouse-night.test.ts`
- `src/renderer/layers/night-tint.ts` only if the final vignette needs tuning

Current constants to revisit:

- `NIGHT_WATER_POOL_RADIUS = 1000`
- `NIGHT_WATER_POOL_MAX_ALPHA = 0.42`
- `NIGHT_DIRECTIONAL_SPILL_MAX_ALPHA = 0.18`
- diffuse gradient in `getNightGradientBundle()`
- core gradient in `getNightGradientBundle()`

Implementation ideas:

- Reduce the neutral diffuse wash. It should not lift the entire island into beige.
- Add a **dark corona** around the pyre:
  - a multiply/source-over radial ring outside the close halo
  - strongest just beyond the warm core
  - fades before it reaches critical labels and ships
- Split the aura into three distinct reads:
  - **ember core**: small, warm, high contrast around the beacon
  - **headland torchlight**: warm but narrow around the lighthouse rock and adjacent plaza
  - **water path**: elongated south/southeast reflection that feels like fire on moving water
- Shift the outer aura away from grey-green and toward smoke/copper:
  - less `rgba(190, 200, 180, ...)`
  - more low-alpha ember, brass, and soot tones
- Make pool edges uneven with two or three overlapping ellipses or clipped glints, not one perfect oval.

Reduced-motion:

- Keep all layers static but visible.
- No breathing or flicker in the reduced-motion branch.

Acceptance:

- At home zoom, the island should be darker overall than the current baseline while the lighthouse is more compelling.
- At 240 percent lighthouse crop, the aura should have a dark edge and warm core.
- Water-zone colors and labels remain distinguishable.

Validation:

```bash
npm test -- src/renderer/layers/lighthouse-night.test.ts src/renderer/layers/night-tint.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "night atmosphere"
```

### NM4 - Beam Refit: Ribbed, Smoky, Caustic

Files:

- `src/renderer/layers/lighthouse.ts`
- `src/renderer/layers/terrain.ts`
- `src/renderer/layers/lighthouse-night.test.ts`
- `src/renderer/layers/terrain.test.ts`

Current beam problem:

- `SWEEP_PAIRED = true`, `SWEEP_PEAK_ALPHA = 0.22`, `SWEEP_FAR_HALF = 90`, and the cached beam sprite produce a clean geometric cone. It is legible, but too sterile.

Recommended beam treatment:

- Keep paired beams for readability, but make them thinner and more imperfect.
- Add a bright, narrow ribbed core inside each cone:
  - 3-5 low-alpha internal ribs
  - slight angular offsets
  - clipped to the beam length
- Add a smoky outer edge:
  - warmer near the pyre
  - copper/soot at the far end
  - less transparent beige over land
- Replace some current far-end glints with water-caustic fragments:
  - small broken strokes on water tiles only
  - stronger where beam intersects Watch/Alert water
  - never enough to obscure DEWS textures
- Add a brief "aperture blink" at the pyre: a small ring or shutter pulse when a beam arm crosses the screen diagonal.

Reduced-motion:

- Use the existing `SWEEP_REDUCED_ANGLE`.
- Render one deterministic ribbed beam with static caustic fragments.
- No ember trails in reduced motion.

Performance:

- Keep sprite caching. If ribs are baked into the cached sweep sprite, cache key cardinality should remain close to current zoom/tint buckets.
- Avoid per-frame gradients inside loops unless cached.

Validation:

```bash
npm test -- src/renderer/layers/lighthouse-night.test.ts src/renderer/layers/terrain.test.ts
npm run test:perf
```

### NM5 - Night Water And Reflection Rebalance

Files:

- `src/renderer/layers/lighthouse.ts`
- `src/renderer/layers/ambient.ts`
- `src/renderer/layers/terrain.ts`

Implementation ideas:

- Make `drawLighthouseReflection()` more path-like and less evenly stroked:
  - 5-9 broken warm strokes
  - narrower near the lighthouse, wider only where water opens
  - alpha tied lightly to sea state and flicker
- Keep moon reflection cooler and weaker than the pyre reflection.
- Suppress bioluminescent sparkles inside the warm pyre path, but allow a few at the dark edge for eerie contrast.
- Add a very subtle "black water" strip immediately outside the warm path to increase contrast.

Acceptance:

- The lighthouse reflection should read at home zoom without becoming a second UI highlight.
- The moon should not compete with the pyre as the main night light.

Validation:

```bash
npm test -- src/renderer/layers/ambient.test.ts src/renderer/layers/lighthouse-night.test.ts
npx playwright test tests/visual/pharosville.spec.ts --grep "night atmosphere"
```

### NM6 - Optional Signature Motifs

These are optional and should ship only if NM1-NM5 still do not feel unique enough.

1. **Astral bearings.**
   - Thin star-map lines that visually point toward the lighthouse.
   - Purely atmospheric, no data meaning.
   - File: `src/renderer/layers/sky.ts`.

2. **Shadow birds crossing the beam.**
   - One or two dark silhouettes pass through the warm beam very rarely.
   - Must be reduced-motion safe.
   - File: likely `src/renderer/layers/ambient.ts` or a small new layer.

3. **Lantern chain echoes.**
   - Harbor lanterns briefly warm when the pyre sweep passes nearby.
   - Pure atmosphere unless tied to data; no DOM parity needed if decorative.
   - File: `src/renderer/layers/scenery.ts` or decorative lights path.

4. **Threat-storm occult tint.**
   - At active Danger/Warning, the pyre outer beam edge shifts toward ember-red while lightning remains cream.
   - This becomes analytical if it encodes active threat, so it needs lighthouse detail-panel and accessibility-ledger parity.

## 6. Direction Decision

### Option A - Eye Of Pharos (Chosen)

Mood: eerie, ancient, fantastical, still readable.

What changes:

- Darker mineral sky
- Pyre asset wired
- Dark corona around aura
- Ribbed paired beam
- More broken water caustics

Pros:

- Strongest fit with current app identity.
- Keeps the lighthouse as a data observatory, not a fantasy-only prop.
- Low to medium implementation risk.
- Reuses existing renderer architecture.

Cons:

- Needs careful tuning to avoid making the scene too dark.

Decision:

- **Chosen.** This is the implementation direction for NM1-NM5.
- The plan should optimize for a living ancient pyre, dark corona, ribbed smoky beam, and navigational night sky.

### Option B - Astral Observatory (Not Chosen)

Mood: more magical, celestial, special.

What changes:

- Stronger constellation lattice
- Moon/sky geometry becomes the main novelty
- Beam feels like an astrolabe ray
- More star-water echoing

Pros:

- Very unique at home zoom.
- Plays well with the observatory citadel and Yggdrasil.

Cons:

- Higher risk of decorative clutter.
- Must avoid implying false analytical meaning.

Decision:

- **Not chosen as the main path.** Keep the constellation-lattice ideas as optional seasoning inside Option A, but do not let celestial effects become the primary identity.

### Option C - Haunted Harbor (Not Chosen)

Mood: most eerie, least warm.

What changes:

- Lower pyre alpha
- More black fog, cloud occlusion, and intermittent beam
- Beam appears less often but with more force

Pros:

- Most dramatic departure from current baseline.
- Strong eerie read.

Cons:

- Could make stablecoin data less scannable.
- More risk to accessibility and visual baseline stability.

Decision:

- **Not chosen as the main path.** Keep its stronger dark-fog contrast as a tuning reference for the aura corona, but do not push the whole app into low-readability horror.

## 7. Suggested Implementation Order

1. NM0 - capture and calibrate the chosen Eye Of Pharos direction.
2. NM2 - wire existing pyre asset, because it is a concrete unused asset and a fast win.
3. NM3 - aura refit, because the current milky wash is the biggest visible problem.
4. NM4 - beam refit, because it defines the lighthouse personality.
5. NM1 - sky refit, tuned after the beam/aura have a stable light budget.
6. NM5 - water/reflection rebalance.
7. NM6 - optional motifs only if screenshots still feel too ordinary.

This order starts with the lighthouse because the user's complaint is specifically about the lighthouse night situation, aura, and beam. Sky tuning should respond to the final light budget rather than be tuned in isolation.

## 8. Acceptance Criteria

The revamp is successful when:

- A full-night screenshot is recognizably more eerie and fantastical at thumbnail size.
- The lighthouse has a distinctive "Eye of Pharos" identity rather than a generic searchlight.
- The aura has contrast: warm core, dark corona, and controlled water path.
- The beam is textured, smoky, and imperfect, with visible water contact.
- The sky has a memorable navigational/celestial character without looking like generic neon dark mode.
- DEWS water zones, labels, ships, and detail panel remain readable.
- Reduced-motion night still communicates the same visual identity without moving trails or flicker.
- No new client secrets, cross-origin calls, or runtime dependencies are introduced.

## 9. Validation Plan

Focused checks while implementing:

```bash
npm test -- src/renderer/layers/sky.test.ts src/renderer/layers/lighthouse-night.test.ts src/renderer/layers/night-tint.test.ts
npm test -- src/renderer/layers/ambient.test.ts src/renderer/layers/terrain.test.ts
npm run check:pharosville-colors
npm run check:pharosville-assets
npx playwright test tests/visual/pharosville.spec.ts --grep "night atmosphere"
```

Broader checks before claiming completion of a runtime revamp:

```bash
npm run typecheck
npm test
npm run check:pharosville-assets
npm run check:pharosville-colors
npm run build
npm run test:visual
```

Manual visual review:

- Inspect `pharosville-night.png`.
- Inspect `pharosville-dusk.png`.
- Inspect `pharosville-dawn.png`.
- Inspect `pharosville-dense-lighthouse.png`.
- Check reduced-motion night.
- Check that the detail panel does not visually fight the new beam/aura.

## 10. Notes For Future Implementers

- The existing `landmark.lighthouse-pyre` asset is likely the cheapest first win. Do not regenerate before trying to wire and screenshot it.
- If the pyre is animated, use the existing manifest animation schema and keep it deferred unless first-frame readability requires otherwise.
- If the beam receives data-driven tinting from PSI or DEWS threat, add explicit detail-panel and accessibility-ledger text. If it remains atmospheric, keep it non-semantic.
- Do not update visual baselines until screenshot diffs are inspected and the drift is intentional.
- Keep all new scratch screenshots under `outputs/`, not `output/`.

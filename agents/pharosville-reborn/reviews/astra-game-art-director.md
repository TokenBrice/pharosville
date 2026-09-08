# Astra — game art director

## Verdict

PharosVille already has rendering craft: the tower's articulation, coloured hull families and night beacon are appreciably resolved (`noon.png @ central tower and lower fleet`; `night.png @ lantern gallery`). Its unfinished tell is **incompatible levels of finish**: miniature architectural filigree sits among repeated orange barges, billboard-like emblems and an atmosphere that exposes its compositing boundary (`dusk-close.png @ lower fleet and upper-right diagonal`; `noon-wholemap.png @ right plate edge`). The upgrade should establish one art direction—**a sculpted harbour garden, with painted light and selectively truthful water**—not concatenate famous-game effects. Night is the strongest existing composition; preserve its beacon hierarchy rather than increasing spectacle everywhere (`night.png @ tower versus surrounding water`).

Reference lens, not claims about proprietary implementations: borrow Monument Valley's controlled value planes; Townscaper/Dorfromantik's consistent scale and shape grammar; Tchia's tactile land–water continuity; Sable/Okami's selective graphic edges; Ghibli-associated painted large forms; Firewatch's layered atmosphere; Sea of Thieves' readable water reflection and wave hierarchy. Do not combine all their surface styles.

## Findings — finish audit

- **DEFECT — camera-dependent atmosphere join.** A geometrically straight blue/cream transition dominates `dusk-close.png @ upper-left-to-lower-right diagonal`; cream exterior overwhelms `noon-wholemap.png @ right half`. Mechanism: water fades by map UV (`src/three/garden-water.ts:1389–1408`), while background colours use fixed screen-height stops (`src/three/garden-sky.ts:515–524`). Their coordinates cannot remain registered under arbitrary pan/zoom. The visible dome is disabled (`garden-sky.ts:445–448`). This violates the seamless far-plate intent (`docs/pharosville/VISUAL_INVARIANTS.md:224–230`), despite the previous backdrop-stop adjustment having landed.
- **GAP — water contains effects but lacks object-bearing depth.** The island has a pale contact ring and textured sea, not a legible inverted tower (`noon.png @ immediately below island`; `morning.png @ island waterline`). Calling it “flat unlit water” is misleading: sky-probe reflection and Schlick are present (`garden-water.ts:885–946`). The environment scene contains only a sky sphere (`src/three/garden-environment.ts:468–473`); sharpening that probe cannot produce the tower. Interior alpha is plate coverage, not water depth (`garden-water.ts:1389–1408`).
- **GAP — silhouettes compete before materials can help.** Repeated long orange covers dominate the close view; big logo sails compete with island trees (`dusk-close.png @ lower two-thirds`; `noon.png @ left of tower`). This is not proof of uniform placement: anchorages and all-hulls-at-0.5 are intentional contracts (`VISUAL_INVARIANTS.md:33–42,56–77`). It is a projected-weight problem.
- **GAP — material contrast is present, insufficiently legible.** Close barges retain a common orange, faceted, manufactured read (`dusk-close.png @ centre barges`). **Do not re-propose missing wet lines or uniform roughness:** gloss already interpolates 0.84 hull roughness toward 0.45, with rail and waterline masks (`src/three/garden-fleet-batch.ts:940–950,1245–1250`). Thin highlights cannot fix repeated large cover shapes.
- **GAP — sails read as branding panels more than cloth.** Several square identity sails retain bright image-like patches (`noon.png @ left-middle and lower-right sails`). They are PBR, not unlit cards (`garden-fleet-batch.ts:1254–1262`); atlas marks preserve their own colour over dyed cloth, and weave relief is reduced over marks (`garden-fleet-batch.ts:1083–1107`). Micro-weave is the wrong scale to solve this at rest.
- **GAP — redundant finishing layers.** Upper-frame noon haze lowers contrast; dusk remains close to the daytime scene rather than a radically different light composition (`noon.png @ upper fleet`; `dusk.png @ tower and upper water`). Existing grade, LUT, grain, bloom and tilt-shift are real (`src/three/garden-post.ts:242–290,611–633,795–818,1640–1685`). Attribution among fog, grade, blur and lighting requires isolated GPU comparisons; “missing lens character” is not a diagnosis.
- **GAP — decorative frame looks like a debug safe area.** The inset rectangle appears in every reference, particularly `night.png @ all four edges`. It is intentional CSS, not a post render-target defect (`src/pharosville.css:434–439`).
- **Not defects:** grounding shadows are visible (`noon-wholemap.png @ foreground tree bases`); N8AO exists (`garden-post.ts:1615–1630`). Garden vocabulary exists—path, pines, pavilion and pond (`noon.png @ lower-left rim and island terrace`). The problem is its relative screen area, not absence.
- **Evidence limitation:** all seven frames inspected; `noon-legend.png @ entire frame` contains no open onboarding panel. No animation quality or GPU milliseconds can be inferred from these stills.

## Ideas — ranked by look per cost

Costs below are **[INFERENCE] planning ranges**, not measured deltas: draws / triangles / textures / GPU ms at 1600×1000. S ≈ ≤1 day; M ≈ 2–3 days; L ≈ 4–6 days; XL ≈ >6 days. Shared ideas overlap; do not sum them blindly.

### 1. Fix the atmosphere coordinate contract — STEP CHANGE

Replace the camera-specific sky-height assumption with a backdrop/seam function evaluated consistently at the projected far boundary. Keep an atmospheric exterior, not a tabletop cream fill (`dusk-close.png @ diagonal`; `noon-wholemap.png @ right exterior`). Sketch: `garden-sky.ts` exports shared colour evaluation; `garden-water.ts` dissolves to that same evaluated colour; `garden-horizon.ts` seats borrowed silhouettes in the transition. Existing scene pass, no new renderer.

**Cost:** 0 / 0 / 0 / ±0.1; L. **Risk:** orthographic sky must cover lower corners too; revealing the physical dome alone will not solve downward viewing. **Displaces:** fixed screen stops and independent edge treatment; re-pin sky-seam visual contract. **Dependencies:** SkyAtmospherePost, CameraComposition, Water.

### 2. Compose three large value/material planes — STEP CHANGE

Author a shared material-light model: cool deep water; darker, tactile planted land; luminous but not yellow-clipped stone. Keep PBR specular, introduce a broad soft two/three-zone diffuse response and local occlusion—not universal hard toon bands. This targets the masonry-versus-fleet competition (`noon.png @ central half`). Sketch: common shader patch consumed by `garden-fleet-batch.ts`, island/rim materials; light presets and `garden-post.ts` calibrated together; retain one tone-map/LUT authority.

**Cost:** 0 / 0 / 0–1 ramp texture / +0.1–0.4; L. **Risk:** analytical hue collapse and duplicate shader conventions. **Displaces:** stacked global warm rescue multipliers; preserve semantic colour/DOM parity. **Dependencies:** IslandLighthouse, ShoreRimVegetation, SkyAtmospherePost. Not another ambient-fill decrement from the shipped plan.

### 3. Reflect the lighthouse, not the whole world — STEP CHANGE

Explicitly reverse the prior planar-reflection rejection: the sky-only probe cannot deliver the absent tower silhouette (`noon.png @ island foreground`). Sketch: one persistent half-resolution linear-HDR target; reflected orthographic camera and water-plane clipping; tower/precinct-only render layer; same main renderer; water samples projected reflection with existing region reflectivity and normal distortion. No fleet, shadows, post, DOM or recursive water in this pass. Update on camera/light/content changes; freeze deterministically under reduced motion.

**Cost:** provisionally +10–40 / +20–70k submitted / +1–2 / +0.3–1.2; L. Actual tower census decides feasibility. **Risk:** clipping, double grading, stale light, exceeding triangle headroom. **Displaces:** corresponding synthetic hero-reflection silhouette, never beacon or moon-road semantics; re-pin reflection and resource contracts. **Dependencies:** Water, RenderArchitecturePerf, IslandLighthouse. Count this work even if runtime accounting resets later.

### 4. Sculpt the landscape's screen area — STEP CHANGE

Reallocate repeated ornamental detail to a few interlocking moss/stone/pine masses and one readable shore-to-pond sequence; no new monument. The current precinct reads primarily as fortress, with garden subordinate (`noon.png @ island`; `noon-wholemap.png @ thin foreground rim`). Sketch: reshape existing island/rim geometry and planting groups, compose from rest camera, retain authoritative shoreline and navigation.

**Cost:** net 0–4 / +10–30k / 0 / +0.1–0.4; L. **Risk:** landmark occlusion and cumulative triangle budget. **Displaces:** selected fortification micro-detail/repeated shrubs, not analytical architecture. **Dependencies:** AstraGardenDirector, IslandLighthouse, ShoreRimVegetation, CameraComposition; re-pin precinct silhouettes, not water-safety truth.

### 5. Turn emblems into sail paintings

Keep complete identities; composite logos as pigment participating in the same broad cloth folds and shadowing. Preserve brand shapes, not image-background rectangles (`noon.png @ square left-middle sails`). Modify atlas preparation plus `patchSailAtlasMaterial`; authored low-frequency camber/edge hems take precedence over additional weave. Do not algorithmically erase legitimate brand backgrounds without inspecting them.

**Cost:** 0 / 0–5k / 0 / +0.05–0.15; M. **Risk:** recognizability, tiny-mark contrast, full attribute slots (`garden-fleet-batch.ts:923–925`). **Displaces:** excessive micro-weave and emissive cloth lift; retain shared atlas and failed-logo fallback. **Dependencies:** FleetVisuals, DataInformativeness; re-pin identity snapshots.

### 6. Broaden craft differentiation, retain shipped gloss

Separate cloth cargo covers, dark end-grain, painted strakes and satin rails through existing part masks; use broad local colour/normal variation instead of lowering every rail's roughness. Targets the orange barge repetition (`dusk-close.png @ centre`). Extend existing hull material masks, not per-ship materials.

**Cost:** 0 / 0 / 0–1 shared surface texture / +0.05–0.2; M. **Risk:** new variation becoming fake data; specular flicker. **Displaces:** uniform cover colour and subpixel fittings; keep 0.45 gloss floor unless GPU evidence supports reversal. **Dependencies:** FleetVisuals; no repeat of shipped T3.4.

### 7. Finish one genuinely translucent shallow

Make the pond/engawa shelf show submerged stones, absorption and restrained caustics; leave open sea opaque (`noon.png @ island's tiny pond and turquoise shore`). Integrate seabed colour/depth into existing water composition, preferably static bathymetry rather than a scene-colour refraction pass. Shore distance already exists (`garden-water.ts:807–813`); build beyond it.

**Cost:** +1–2 / +2–6k / +1 / +0.1–0.3; M/L. **Risk:** surface foam mistaken for bottom caustics; AO/depth ordering. **Displaces:** generic shallow colour wash and island-centred decorative caustic footprint (`garden-water.ts:1278–1292`); re-pin complete-water-vocabulary contract. **Dependencies:** Water, IslandLighthouse.

### 8. Integrate foam with actual shoreline, simplify open water

Use field distance/gradient for selected lapping edges; remove the competing elliptical island lap where replaced. Existing lap still uses the authored ellipse (`garden-water.ts:785–790,951–976`); the bright circumferential read is apparent (`morning.png @ island base`). Keep calm intervals rather than more foam.

**Cost:** 0 / 0 / 0 / ±0.1; M. **Risk:** thick uniform coastline strokes; loss of calm/danger distinction. **Displaces:** ellipse lap, not adds a foam vocabulary. **Dependencies:** Water, ShoreRimVegetation; retain region authority.

### 9. Author noon lighting before authoring another LUT

Reopen the parked lower-noon-elevation decision together with shadow-camera fit and complementary fill, then create colour-script targets for all phases (`noon.png versus dusk.png @ tower faces`). Author LUTs from approved matched frames, checking reserved semantic swatches; do not overwrite the operator's current LUT experiment.

**Cost:** 0 / 0 / 0 / ±0.1; M. **Risk:** long shadows cluttering fleet; night regression. **Displaces:** blanket yellow highlights, not wall clock. **Dependencies:** SkyAtmospherePost, CameraComposition. Re-pin sun/grade/AO ladder together.

### 10. Reserve bloom for the beacon's radiance

Prefer source emissive discipline within existing luminance bloom, not a full selective-bloom rerender. Night already has a good focal beacon (`night.png @ tower crown`); protect it. Source emissive caps plus existing `BloomEffect` threshold (`garden-post.ts:1640–1648`) should exclude broad stone and cloth.

**Cost:** 0 / 0 / 0 / ~0; S/M. **Risk:** suppressing genuine lightning or PSI state. **Displaces:** incidental sail/window halos; keep ember hierarchy and analytical exceptions. **Dependencies:** AmbientLifeLight, SkyAtmospherePost.

### 11. Delete the inset frame; restrain lens effects

Remove ornamental shell rectangle; keep controls and actual keyboard focus styling. Maintain existing soft vignette; confine tilt-shift to authored close postcards, not analytical rest view (`night.png @ border`; `noon.png @ distant fleet`). Existing depth-band blur is sufficient (`garden-post.ts:795–818`).

**Cost:** 0 / 0 / 0; potentially −2 blur draws/−2 targets when disabled, ms unmeasured; S/M. **Risk:** postcard transitions, lost near-edge framing. **Displaces:** frame ornament and indiscriminate blur, not focus indicators. **Dependencies:** UiHud, CameraComposition, SkyAtmospherePost.

### 12. Graphic edges only where silhouettes need them

Use baked bevel/value edges on key stones, eaves and selected vessel contours, not full-scene outlines (`noon.png @ tower base versus neighboring sails`). Selectively borrow Sable/Okami's graphic separation without their whole visual language.

**Cost:** 0–2 / +2–8k / 0 / +0.05–0.2; M. **Risk:** comic-book density and duplicate rigging edges. **Displaces:** tiny geometric trim; keep pick proxies unchanged. **Dependencies:** IslandLighthouse, FleetVisuals.

## Rejected

- Full-scene SSR: screen-edge disappearance and disocclusion complexity; a probe is IBL, not “SSR-lite.”
- Full physical sky dome as a one-line fix: parallel downward rays do not supply a useful conventional horizon; solve coordinate continuity first.
- More cloud layers: first connect existing shadow/sky vocabulary; no independent weather clock.
- Chromatic aberration, lens dirt, animated film grain: photographic defects tax logo readability and calm. Static grain already exists (`garden-post.ts:621–633`).
- Aggressive tilt-shift/bokeh: hides analytical targets and reinforces toy scale; not a substitute for composition.
- Stronger global AO/rim light: tree contacts already read (`noon-wholemap.png @ foreground`); targeted material separation beats soot and neon outlines.
- Photoreal PBR overhaul/full ocean simulation: mismatched to authored low-poly silhouettes and the project's observatory purpose.

## Cross-lane notes and evidence

Implement the coordinate fix and shared art target before grading or expanding passes. Reflection and landscape must share a submitted-triangle allowance, not independently spend the same headroom. Preserve one renderer/clock, full ledger/detail parity and zero-RAF reduced motion (`THREEJS_AGENT_REFERENCE.md:11–23,195–201`). This is a read-only source/frame audit: no source edits, extra captures, builds, tests or GPU timing runs; every cost is provisional. The skill context script was unavailable at its prescribed path; existing `PRODUCT.md` was read directly instead.

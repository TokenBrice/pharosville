# Ruthless outside critique — change the premise, not the coefficients

## Verdict

PharosVille has spent sixteen releases making a token inventory more tasteful without deciding whether it is an inventory or a place. The locked isometric camera flattens depth; the finite plate turns distance into a cream void; the all-hulls-at-rest rule spends nearly every available interval on identity marks; the ship-to-landscape scale makes the island a toy fort. The invariants document protects those implementation choices alongside genuinely essential truth and accessibility guarantees, making reversals appear dangerous even when the picture demands them. The tuning loop rewards cheap, locally demonstrable improvements rather than a different overall image. Night has a convincing primary light, and the engine supports real craft. But the present ceiling is structural: the garden is scenery around a fleet census, not the experience organizing that census.

## Evidence boundary

Reviewed all seven supplied real-GPU frames, the entire invariants and architecture documents, both specified plans, camera implementation, placement header/constants, and world-layout constants. No tests, builds, formatters, extra captures, or runtime validation were run. `noon-legend.png` actually contains no visible onboarding overlay; no onboarding behavior is inferred from it. Costs below are **[INFERENCE] planning envelopes, not measurements**; ms figures are proposed maximum incremental allowances to verify against the unchanged total p95 ≤20 ms. Batched-hull removal does not imply proportional draw-call savings.

## Six structural faults, ranked

### 1. GAP — Completeness is confused with simultaneous visibility. **REVERSE. STEP CHANGE.**

**Evidence.** `noon.png @ left half and bottom foreground` is a field of hulls, rectangular sails and logos; `morning.png @ immediately left of island` repeats the same busy silhouette hierarchy. The clearer water to the right proves negative space helps, but it is not the frame's organizing element. This is not a claim that clustering failed to ship: `src/systems/garden-fleet-placement.ts:26-55` explicitly replaces blue noise with unequal anchorages while retaining the same count. The design-space enlargement already preserved island size while adding sea (`src/systems/world-layout.ts:18-35`): more acreage was an earlier workaround for the same density premise.

**Protecting pin.** `VISUAL_INVARIANTS.md:56-77` restores every eligible hull by zoom 0.5 and fully restores marks at rest. `src/systems/garden-fleet-thinning.test.ts:42-45` asserts universal presence; `:73-89` additionally exempts whole hero/flagship classes. These rules can defeat a real presentation budget.

**Build/buy.** Show **48 curated hulls by default, hard maximum 60 including attention targets and formations**, versus ~185 eligible records today. Keep 320 capacity and all records, not 320 simultaneous visual claims. Select stable representatives across actual risk categories, significant caps and relevant changes; count consorts inside the budget. Keep the selection deterministic between data updates. Search/keyboard selection promotes any omitted ship into its own safe location and displaces an unselected representative; DOM details are immediate, never held for an entrance animation. Explain “48 shown / 185 tracked” and coverage in the ledger. Do not imply omitted coins are safe or encode their count as fictitious distant traffic. The rest are implied by occupied harbours and explicitly accounted for in the DOM, not replaced by another 137 silhouettes.

**Cost/risk/dependencies.** M (16–32 engineering hours); 0 new draws/tris/textures, fewer submitted instances; CPU allowance +0.2 ms maximum. Risk: selection bias and promotion popping. Replace universal-presence and blanket hero-exemption pins with deterministic coverage, bounded presentation, discoverability and truthful counts. Keep water safety and record identity. Dependencies: fleet motion/density, data informativeness, UI/accessibility. Files: `garden-fleet-thinning.ts`, `garden-fleet-placement.ts`, `world-renderer.ts`, route selection and ledger components. This is the first implementation change, not a final polish pass.

### 2. GAP — A diagram camera is being asked to deliver an inhabited vista. **REPLACE. STEP CHANGE.**

**Evidence.** `noon.png @ tower and upper water` has almost no visible sky; rear ships retain the visual weight of near ones. `dusk.png @ full frame` is more a differently lit inventory than a new spatial experience. The renderer creates `OrthographicCamera` (`src/three/world-renderer.ts:862`) and fixes the eye/target relation (`:5024-5042`). Rest composition is solved in iso pixels, including a fixed 30° rise term (`src/systems/camera.ts:61-110`).

**Protecting pin.** `VISUAL_INVARIANTS.md:44-55`; `src/systems/camera.test.ts:155-164` pins the 0.72 rest. The earlier plan categorically prohibits lowering the camera to reveal sky (`agents/2026-08-13-ultimate-garden-design-plan.md:39-42`). That is a limitation of its parallel downward rays, not a reason to prohibit a different camera model.

**Build/buy.** Adopt one **perspective camera**, starting at 40° vertical FOV and 12–16° downward pitch: a shore-level veranda looking past planting, over a quiet foreground inlet, toward the Pharos and sky. Use target, distance, yaw and pitch as the sole camera state. Author slow positional parallax across a short arc after idle—not perpetual orbit, auto-zoom or head bob. Input stops drift without snapping; reduced motion stays static. Exploration raises the same camera, not a second renderer or permanent isometric mode.

**Cost/risk/dependencies.** XL (60–100 hours); projection itself +0 draws/tris/textures, +0–0.5 ms allowance excluding added scenery. High coupling risk: replace iso screen projection/unprojection, hit snapshots, DOM anchors, follow, fitting, URL state and attract poses together. `ARCHITECTURE.md:62-65` lists that shared contract. Update `camera.ts`, `projection.ts`, `world-types.ts`, `hooks/camera-intent.ts`, `pharosville-world.tsx`, `garden-attract.ts`, renderer camera and shader view-direction assumptions. Re-pin visible-target, stable-input, focus and access behavior, not exact legacy zooms. Camera, renderer/perf, fleet and UI lanes must agree on one projection interface before editing.

### 3. DEFECT + GAP — The edge is not a horizon. **REPLACE the rendered boundary; KEEP finite truth.**

**Evidence.** `noon-wholemap.png @ right corner and surrounding cream field` exposes the exhibit slab. `dusk-close.png @ upper-right diagonal` shows a broad abrupt blue-to-cream transition, not water continuing toward distance. This violates the intended dissolve in `VISUAL_INVARIANTS.md:224-230` even though the finite plate itself is deliberate (`:123-143`). The backdrop is knowingly a presentation sheet (`src/three/garden-sky.ts:457-460`); `garden-sky.test.ts:215-224` protects its two triangles and shader text, not a convincing horizon.

**Build/buy.** Render an effectively infinite sea plus a real visible sky and sparse borrowed headlands. Keep the 140×140 navigation/risk field finite and authoritative: outside it is decorative, non-selectable ocean, never an invented eighth market region. Let authored shorelines be islands/headlands within that ocean, not skirts disguising a square. Remove the screen-space backdrop and edge-dissolve apparatus they replace. Water and the visible sky must share the existing sun direction.

Fund one half-resolution, clipped **hero-only planar reflection** for tower, island and nearest headland; replace corresponding hero reflection approximations rather than layering them. Explicitly reverse the previous ~40-duplicated-draw rejection (`2026-09-07-visual-refinement-consolidated.md:133-134`): the supplied noon island lacks a coherent recognizable tower reflection. The shipped fresnel/probe work is present, but did not buy that read. This pass earns its cost only in the new low viewpoint; do not add it to rescue the old diagram.

**Cost/risk/dependencies.** L (32–56 hours), inseparable from camera: ocean/sky/headlands +2–6 draws, +5–15k triangles, +0–2 textures; reflection ≤40 extra submissions, ≤60k reflected triangles, ≤3 target textures; combined allowance ≤2.5 ms. Net removals require census. Risks: horizon aliasing, clipping artifacts, reflection duplication and fill rate. Delete the geometry/source-text backdrop test; replace with actual phase/pose captures and reflection alignment checks. Keep terrain classifications, sea partition and safety tests. Files: `garden-sky.ts`, `garden-horizon.ts`, `garden-water.ts`, `garden-hero-reflections.ts`, `garden-rim-mesh.ts`, `world-renderer.ts`. Dependencies: sky, water, shore, perf; no physical infinite simulation.

### 4. GAP — The scale system gives brands architectural importance. **REVERSE ship floor; KEEP tower height.**

**Evidence.** `noon.png @ island grove versus sailboat immediately left` makes the vessel's sail comparable to a grove and its hull comparable to a precinct feature. `dusk-close.png @ orange hull cluster` resolves repetitive oversized cargo forms more readily than landscape. Tower height is already 38 (`garden-observatory-slice.ts:41-46`); making it taller would strengthen the fortress, not the garden. The ship scale floor was raised specifically for universal family legibility (`:61-76`).

**Protecting pin.** `VISUAL_INVARIANTS.md:75-77`; `src/three/garden-ships.test.ts:408-411` literally asserts 0.8. GLB scale/anchor coherence remains essential (`VISUAL_INVARIANTS.md:372-374`).

**Build/buy.** Start the shared ship mapping at **0.45–1.4 instead of 0.8–2.05**, retaining monotonic market-cap order; accept that distant families are not individually readable until selected. Use screen-space picking tolerance and DOM search, not giant models, for access. On the island, replace the continuous fortified foreground enclosure with a broken retaining terrace, connected moss/stone garden and a visible waterside path; retain the Pharos silhouette and the existing pavilion/pond/mast, not additional monuments.

**Cost/risk/dependencies.** L (24–48 hours): scaling +0 resources; landscape replacement target net ≤8 draws, ≤20k triangles, ≤2 textures, ≤0.5 ms. Risks: toy-to-human scale inconsistency, sail mark loss, mismatched berth/hit envelopes. Re-pin scale behavior and all shared footprint consumers; revise fortified-base design text (`VISUAL_INVARIANTS.md:300-310`). Files: `garden-observatory-slice.ts`, `garden-ships.ts`, `garden-island.ts`, island media generation and aligned proxies. Dependencies: fleet visuals, lighthouse/island, shore, camera. Numbers are starting art-direction values, not new sacred constants.

### 5. GAP — The world is an expensive legend. **REPLACE exhaustive encoding with DOM-led analysis.**

**Evidence.** `noon.png @ sails and cropped edge stations` offers many identities but little immediately readable market explanation. `noon-legend.png @ entire frame` does not rescue this: no tutorial overlay is visible. `VISUAL_INVARIANTS.md:158-189` assigns identity, scale, class, risk, concentration and region naming to world channels. The architecture already says the DOM is the analytical surface (`ARCHITECTURE.md:5-7`).

**Position/build.** **Exact information belongs in the DOM; a few coarse, truthful readings belong in the world.** Keep lighthouse PSI, selected ship identity and broad risk-water character. Put comparison, concentration, exact supply, freshness and changed-since-last-visit in a deliberate ledger/detail composition. Remove always-present sea-name boards and secondary analytical ornament that needs memorizing; show region names during inspection. Make the current state understandable from one readable DOM sentence plus an optional expanded ledger, not by decoding 48 sails. No animated ticker, no permanent dashboard covering the garden.

**Cost/risk/dependencies.** M (16–32 hours), non-positive world draws/tris/textures, no new post work; DOM allowance ≤0.3 ms per ordinary update. Risk: atmosphere becomes arbitrary if all semantics disappear—keep the three readings above and full cue provenance. Revise world-encoding/sea-board pins, not parity. Files: `visual-cue-registry.ts`, `garden-sea-signs.ts`, `components/detail-panel.tsx`, `harbor-ledger-panel.tsx`, `accessibility-ledger.tsx`, route and CSS. Data/UI lanes own one removal ledger so no orphan claims survive.

### 6. GAP — The contracts have become the art director. **REPLACE with a short design bible plus technical contracts.**

**Evidence.** The 420-line document calls itself contracts, “not a design diary” (`VISUAL_INVARIANTS.md:5-6`), then preserves historical zooms, percentages, roof dimensions and exact shader-gain proxies (`:44-77`, `:98-108`, `:328-339`). The August plan diagnosed milk, simultaneous salience and an island whose craft existed mostly in concept (`ultimate-garden-design-plan.md:16-20`). September again led with value, grounding and density (`visual-refinement-consolidated.md:11-17`). The new frames still show density and weak spatial depth. That is evidence of a ceiling, not evidence those intervening changes never shipped.

**Build/buy.** Rewrite the visual document to roughly one page: place before census; one hero, two subordinate masses; meaningful uninterrupted water; truthful coarse world/precise DOM; atmosphere from geometry/light before grade; motion with long rests; every addition displaces attention. Keep runtime, accessibility, deterministic reduced motion, security and resource ceilings in technical contracts/architecture. Move history to existing plan records. Replace tests of incidental geometry/GLSL wording with consumer behavior; approve composition from phase-and-pose contact sheets, not constant equality.

**Cost/risk/dependencies.** M (8–16 hours), 0 GPU resources/ms. Risk: deleting useful regression knowledge. Preserve failure mechanisms and behavior tests, remove accidental art laws. All lanes supply the exact contracts they retire; one integration owner edits the bible. This changes the tuning-loop culture: the deliverable is a new image, not a count of defensible tweaks.

## The one massive session: execution order

1. **Curate the fleet first** (#1): immediately recover attention and geometry budget.
2. Agree the short bible and shared camera contract; replace projection end-to-end (#2). No parallel legacy camera path.
3. Build the sea/sky continuum and hero reflection (#3), then recompose island/shore and scale (#4) against that camera—not old postcards.
4. Cut redundant world encoding and deliver readable DOM analysis (#5), including omitted-record selection and truthful counts.
5. Re-author the four attract poses as slow veranda parallax with long holds; reuse the existing route-owned clock. Integrate actual day/night light only after massing works. Keep wall clock; no flattering-hour default.
6. Main performs real-GPU phase/pose, selection, reduced-motion and budget acceptance after integration. Compare against these seven frames; reject a prettier version of the same carpet. No new feature wave follows failed composition acceptance.

## Rejected

- More LUT/fog/fresnel coefficients as the headline: those shipped; they cannot create missing perspective or empty water.
- More birds, petals, lanterns, festivals: additional simultaneous attention is the opposite of this intervention.
- Another mast, shrine, taller tower or extra roof tier: landmark escalation preserves the wrong scale contest.
- Finer sail embroidery, ropes or wood grain before curation: craftsmanship spent on the most overrepresented objects.
- Bigger map as density relief: tried structurally already; more fleet acreage is not composition.
- “Infinite” sea hidden by stronger haze while keeping the same camera: another disguised slab.
- WebGPU, FFT ocean or a second graphical mode: unrelated to the demonstrated ceiling.
- A huge new legend teaching every existing metaphor: make the information easier, not the decoding curriculum longer.

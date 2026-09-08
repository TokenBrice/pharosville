# Decision ledger

## Decisions

| Date | Decision | Recorded reason | Pinning file/test if named | Later reversed? |
|---|---|---|---|---|
| 2026-07-29 | Do not migrate to WebGPU/TSL on r185. | 1,725 GLSL lines rendered black, the post stack had no WebGPU path, and the frame was already vsync-bound. | Re-entry criteria in the spike/plan ledger. | No; blocked pending postprocessing v7, a scheduled TSL water port, and headed WebGPU lane (`agents/2026-08-13-ultimate-garden-design-plan.md:198-203`). |
| 2026-07 | Reject idle camera drift. | Moving-camera correctness and calm/agency costs became acceptance constraints. | Camera hit-testing, label projection, URL state named in W6.6. | **Yes**, explicit operator sign-off for authored attract mode on 2026-08-13 (`agents/2026-08-13-ultimate-garden-design-plan.md:149`). |
| 2026-08-13 | Ship LIGHT before QUIET and TIME. | Per-pixel lighting was judged the highest-leverage near-zero-cost ceiling. | Wave order in approved plan. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:4,26-30`). |
| 2026-08-13 | Full attract mode is approved. | Authored postcard drift is slow, interruptible, hidden when reduced-motion, and returns agency without a snap. | `camera.test.ts`; `garden-attract.test.ts`. | Reverses the July rejection; still the sole exception (`docs/pharosville/VISUAL_INVARIANTS.md:267-272`). |
| 2026-08-13 | Sail quieting is one gentle 15–20% step. | Preserve issuer identity and pirate contrast; restraint is a viewing condition. | Sail/fleet guard tests referenced by W3.7. | **Yes in degree**: superseded by ~10% on 2026-09-05 (`docs/pharosville/VISUAL_INVARIANTS.md:65-74`). |
| 2026-08-13 | Ship the soundscape only with committed tuning time. | The recovered prototype lacked evidence for the mandatory 3–5 days of real audio tuning. | None named. | Effectively withheld, not reversed (`agents/2026-08-13-ultimate-garden-design-plan.md:4`; `:186-187`). |
| 2026-08-13 | Keep both MSAA and SMAA. | Combined result beat either stage alone; rigging lost coverage under SMAA-only, while the frame remained vsync-bound. | 2× supersampled A/B/RMSE evidence. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:76`). |
| 2026-08-13 | Ban uniform anchorage placement, including blue noise. | Odd, unequal, widely separated moorings preserve positive emptiness. | `VISUAL_INVARIANTS.md`; anchorage contracts. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:34-40`). |
| 2026-08-13 | Never bake fleet restraint into cloth colour/placement. | Pale cloth harms identity and drops issuers below the pirate-contrast floor. | Fleet/cloth guard tests referenced by W3.7. | No; later reaffirmed (`docs/pharosville/VISUAL_INVARIANTS.md:65-77`). |
| 2026-08-13 | Keep the camera orthographic; do not lower it to reveal the sky. | The dome can never enter the locked orthographic frame; the haze band is the sky. | `garden-sun.ts`; `FOG_REFERENCE_VIEW_HEIGHT`. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:39-42`). |
| 2026-08-13 | Reject handheld camera noise. | It conflicts with the calm register; approval covers authored drift only, never shake. | Attract-mode constraints. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:42`). |
| 2026-08-13 | Keep billboard cumulus off. | Shipped form read as detached pale pills. | All-phase preview re-entry gate. | No; only reconsider with directionally lit atlas/depth fade (`agents/2026-08-13-ultimate-garden-design-plan.md:202-207`). |
| 2026-08-13 | Reject volumetric raymarched clouds. | Frame-time variance. | Quality-tier matrix required for re-entry. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:207`). |
| 2026-08-13 | Park perspective deck-level camera. | It requires operator sign-off plus horizon/fog/LOD retuning budget. | None named. | No (`agents/2026-08-13-ultimate-garden-design-plan.md:205`). |
| 2026-08-13 | Hard-gate planar reflections/SSR. | Tight draw-call budget; only calm harbour merits it. | W5.0 must free calls. | Reaffirmed/rejected in 2026-09-07 review (`agents/2026-09-07-visual-refinement-consolidated.md:131-134`). |
| 2026-09-05 | Enlarge station vertical silhouettes and flags, not footprints. | Ordinary halls needed reference-scale landmark presence; flags needed complete, recognizable marks. | `src/systems/dock-layout.test.ts`. | Supersedes 1.6× flag limit; not later reversed (`docs/pharosville/VISUAL_INVARIANTS.md:99-110`). |
| 2026-09-05 | Raise palette chroma ceiling 0.10→0.14. | Land needed warm ochre/green separation from cooler saturated sea. | `src/systems/palette.test.ts`. | No (`docs/pharosville/VISUAL_INVARIANTS.md:379-384`). |
| 2026-09-06 | Rest at harbour view, not old 0.60 whole plate. | Warm-village zoom 1.0 read small and forced constant zooming; 0.72 restored fleet readability. | `src/systems/camera.test.ts`; `garden-attract.test.ts`. | Retired both 1.0 rest and 0.60 plate (`docs/pharosville/VISUAL_INVARIANTS.md:49-55`). |
| 2026-09-07 | Remove chain/pigeonnier captions; identity lives on rooftop flags. | Reduce label clutter while keeping concentration in details and accessible ledger. | `src/components/harbor-label-chips.test.tsx`. | No (`docs/pharosville/VISUAL_INVARIANTS.md:146-154`). |
| 2026-09-07 | Park lowering sun elevation 0.806→~0.62 rad. | It would lengthen shadows 46% but re-key grade, AO ladder and PMREM probe. | Fresh grade pass required. | No; pick up only on explicit ask (`agents/2026-09-07-visual-refinement-consolidated.md:102-115`). |
| 2026-09-07 | Do not widen `ARC_SWEEP`. | Existing azimuth already sweeps 79°; earlier diagnosis compared near-symmetric hours. | Sun arc contract. | Corrects/rejects earlier proposal (`agents/2026-09-07-visual-refinement-consolidated.md:114-115,135-138`). |
| 2026-09-07 | Do not default to a flattering dusk hour. | Wall-clock truth is the premise; otherwise the work becomes a screensaver. | None named. | No (`agents/2026-09-07-visual-refinement-consolidated.md:139-141`). |
| 2026-09-07 | Keep harbour macro-composition; re-cut the internal risk map only. | Island, eight-mouth ring, openings and graveyard hold; field evidence disproves risk adjacency claims. | Replace centroid gate in `world-layout.test.ts:220-239`. | No (`agents/2026-09-07-composition-consensus-plan.md:10-13,34-37`). |
| 2026-09-07 | Do not widen NW opening without operator ask. | It changes rim/perimeter contracts but affects only whole-map zoom, not rest camera. | `garden-rim.test.ts:71-104`; VISUAL_INVARIANTS “two openings.” | No (`agents/2026-09-07-composition-consensus-plan.md:49-56`). |

## Decisions most likely to block a step change

1. **Lower sun elevation:** reversal unlocks durable midday shadows and breaks the 8.5-hour plateau, but requires grade/AO/PMREM re-keying.
2. **Retired 0.60 whole-plate rest:** reversal unlocks a graphic complete-world composition, but worsens fleet legibility and plate-edge exposure.
3. **Orthographic camera:** reversal unlocks horizon, real sky, perspective scale and deck-level intimacy, but forces camera/fog/LOD re-authoring.
4. **Harbour macro-composition holds:** reversal unlocks a bolder garden-first land/water hierarchy instead of another risk-map recut.
5. **320-capacity/~185-hull premise:** lower displayed density unlocks ma and landmark dominance; policy now thins only below zoom 0.5 (`docs/pharosville/VISUAL_INVARIANTS.md:56-69`).
6. **Identity hue survives at rest:** reframing it unlocks quieter fleet grouping; destructive dye muting would harm analytical identity.
7. **No planar reflections/SSR:** reversal after draw-call funding unlocks water intimacy and reflected hero silhouettes.
8. **Cloud systems gated:** a directional atlas could unlock sky depth, weather and borrowed-scale atmosphere.
9. **No more Pharos/station tiers/lanterns:** selective reversal could strengthen scale hierarchy, though the ledger says existing items provide the gain (`agents/2026-09-07-visual-refinement-consolidated.md:142-144`).
10. **Flags replace harbour labels:** restrained spatial typography could speed comprehension, but reintroduces clutter and occlusion.

## Recurring complaints

The loop did not converge: August says scale/placement/light geometry were solved, then reports a failed day image and sketch-like garden (`agents/2026-08-13-ultimate-garden-design-plan.md:10-20`); September again opens with value structure, grounding and density as gaps (`agents/2026-09-07-visual-refinement-consolidated.md:9-17`).

- **Value structure:** August: “day frame is milk,” with no hierarchy or readable light (`2026-08-13-ultimate-garden-design-plan.md:14-17`); September: value structure remains a headline gap (`2026-09-07-visual-refinement-consolidated.md:11-14`).
- **Density / simultaneous salience:** August’s ~200 saturated sails and concurrent motion read busy (`2026-08-13-ultimate-garden-design-plan.md:17-18`); September still names density explicitly (`2026-09-07-visual-refinement-consolidated.md:12-14`).
- **Midday flatness:** August describes uniform low-contrast daytime haze (`2026-08-13-ultimate-garden-design-plan.md:16`); September finds an 8.5-hour daylight plateau and calls midday flatness a cross-discipline fault (`2026-09-07-visual-refinement-consolidated.md:108-113,154-156`).
- **Toy scale / insufficient craft:** August says the garden exists as concept but not craft (`2026-08-13-ultimate-garden-design-plan.md:19-20`); September calls hull roughness the biggest “toy → craft” lever (`2026-09-07-visual-refinement-consolidated.md:127-129`).
- **Plate edge / world-as-model boundary:** August identifies billboard signs and translucent ribbons that puncture the register (`2026-08-13-ultimate-garden-design-plan.md:19`); September still has a backdrop sun hidden behind the water plate and foreground framing that fails to meet the frame edge (`2026-09-07-visual-refinement-consolidated.md:77-80,92-98`).

# iGPU completed-total regression fix — 2026-10-19

## Result and boundary

The requested **median completed GPU total ≤ main** target is met in all three measured iGPU scenarios; standard DPR2 also improves. This is a narrow shadow-shader fix, not a claim that every individual pass or presentation hitch is solved. Ocean still costs more in the final night and overview windows, despite its noon regression not reproducing. Long uncapped intervals remain.

**Collection qualification:** this reuses the integration collector's real Date/normal-motion steady protocol with the frozen API responses, not the golden clock. The frozen snapshot aged into the existing StaleFogEffect during repetition 3: branch noon r3, then both arms of the remaining scenarios. Those submissions are retained, not filtered. Consequently these are observed n=3 medians, not an unconditional same-staleness-state release gate. No further capture was started after the operator requested wrap-up.

## Failure mechanism and fix

- Main attaches kit shadow depth only when leafFallAt > 0.001 (baseline season-system.ts:151–160). Branch preparation attaches it to every kit caster (materials.ts:509–515; prepare.ts:201), but its shadow fragment path had an unconditional noise/discard block even in summer. Fresh pre-fix noon shadow p50 was **3.53 → 16.35 ms**; original integration was 3.66 → 16.16 ms.
- materials.ts:634–672 now uses the same **HB_BARE** compile-time boundary for shadow and camera-depth variants, and bumps the program key. The zero-fall noise/discard disappears while the existing bare shader, transforms, preparation ownership and seasonal invalidation remain intact. No attach/detach warmup workaround.
- depth-prepass.test.ts covers shadow and prepass variants at fall 0, 0.001, 0.0011 and 1; existing seasonal invalidation tests remain.
- docs/pharosville/ARCHITECTURE.md documents the invariant.

## Controls and evidence

Ports 5213 branch / 5214 main, isolated branch checkout and authorized nfs-base baseline. Both owned servers stopped. Captures use scripts/perf/frame.mjs → npm run preview/shared lock; no separate browser launcher. A peer also captured serially through that lock; host load 1-minute samples 1.01–2.40. Main receives the exact branch per-pass profiler with governor query ownership disabled; branch uses ?prof=gpu. Profiler overhead is uncalibrated. Completed submission-interval sums are **not** presentation time/FPS.

All final 24 runs completed; 1,091 completed GPU samples; zero steady program growth, pending current queries, skipped queries, invalid frames or disjoint polls. 16/16 systems ready; HIGH stayed pinned; buffers 1600×1000 DPR1 and 3200×2000 DPR2. iGPU is Raphael/AMD; standard is RTX 5070 Ti. Only the known secondary WebGPU “No available adapters” warning was observed.

Snapshot SHA-256 1abae3345df16f2001a583a859bdde803cbf23bac6c9f6f60a81a27. Artifacts remain in this worktree under outputs/need-for-speed/igpu-fix/. run-frames.mjs retains reproduction; STAGE=before SCENARIO=igpu-heart-12 selects the six pre-fix runs; default runs the requested 24 after runs. Original V3 raw evidence is in the authorized main checkout.

## Fresh pre-fix n=3 noon result

| Scenario | Arm | n | GPU total p50 ms | Shadow p50 ms | Ocean p50 ms | Frame p50 / p95 ms | Per-run maximum interval ms |
|---|---|---:|---:|---:|---:|---|---|
| igpu DPR1 heart noon | main | 3 | 56.20 | 3.53 | 13.22 | 17.90 / 72.20 | 872.80, 1142.10, 902.40 |
| igpu DPR1 heart noon | branch | 3 | 57.19 | 16.35 | 11.61 | 2.00 / 111.20 | 1419.60, 1279.50, 1229.60 |

## Final n=3 per arm/scenario

Medians of run p50 summaries; independent pass medians do not sum exactly to total. Interval maxima list all three runs, not a median hiding outliers.

| Scenario | Arm | n | GPU total p50 ms | Shadow p50 ms | Ocean p50 ms | Frame p50 / p95 ms | Per-run maximum interval ms |
|---|---|---:|---:|---:|---:|---|---|
| igpu DPR1 heart noon | main | 3 | 56.81 | 3.59 | 12.85 | 15.60 / 65.50 | 857.30, 865.30, 996.00 |
| igpu DPR1 heart noon | branch | 3 | 46.15 | 3.89 | 10.93 | 1.90 / 90.30 | 1068.00, 1089.60, 1120.20 |
| igpu DPR1 heart night | main | 3 | 68.65 | 3.41 | 11.02 | 13.30 / 111.90 | 1161.00, 1135.90, 1097.90 |
| igpu DPR1 heart night | branch | 3 | 60.53 | 3.62 | 17.43 | 2.00 / 137.40 | 1350.50, 1336.70, 1161.80 |
| igpu DPR1 overview noon | main | 3 | 55.42 | 2.88 | 11.98 | 25.80 / 87.20 | 731.90, 790.50, 797.90 |
| igpu DPR1 overview noon | branch | 3 | 53.35 | 3.20 | 15.23 | 2.20 / 99.40 | 905.50, 903.70, 793.00 |
| standard DPR2 heart noon | main | 3 | 3.79 | 0.21 | 0.51 | 17.00 / 18.40 | 24.00, 21.50, 23.00 |
| standard DPR2 heart noon | branch | 3 | 3.08 | 0.24 | 0.50 | 16.60 / 17.90 | 21.10, 30.40, 20.90 |

The fix drops shadow from pre-fix 16.35 to final 3.89 ms at noon. Remaining shadow delta is +0.30 ms vs main, not the original +12.82 ms. iGPU maxima remain 0.793–1.351 seconds on branch; no hitch-elimination claim. Final night/overview ocean deltas are +6.42/+3.26 ms, unresolved at pass level. Noon ocean was -1.61 ms in fresh pre-fix runs and -1.92 ms after; no uniform ocean regression or causal shader fix is established.

## Cause audit and new submissions

- **StaticDepthPass is the only new unconditional pass.** It adds four non-instanced draws/frame in the 16-frame noon inventory. It disables shadow rendering and restores it in finally, so it does not trigger a second shadow refresh. Retained because island/civic savings exceed its ~0.51 ms noon cost.
- **Shadow:** inventory records one shadow clear/frame in both arms, not two. Non-instanced shadow GL calls increased 14→20/frame; instanced shadow calls stayed 3+1/frame. Source inspection found no new caster category or merge grouping rule explaining those six calls. Their origin is a remaining attribution gap; no extra visibility/geometry change was made to suppress them.
- **Civic/office:** two additional civic drawElements/frame replace two office-root draws. **Mooring:** one indexed non-instanced draw becomes one instanced indexed draw. **Day lights:** two zero-output sprite/pillar draws disappear. These plus +4 depth and +6 shadow reconcile the observed +8 renderer draws (108→116). Inventory intentionally reports ordinary GL methods only; WEBGL_multi_draw was not hooked, so this is not an exhaustive fleet subdraw census.
- **Ocean:** same 256-grid, one mesh and one draw/frame in both. Ocean-system.ts is unchanged. The sole ocean shader diff removes the zero-intensity opposite beam foot; predepth excludes water. No water change is justified solely by the inconsistent timing signs.
- **Sky band:** remains one render/frame in the sampled moving/settling inventory; dirty reuse is not guaranteed during changing inputs. Its measured noon cost falls ~0.23→0.07 ms, not a regression. No extra band pass was added.
- **Wake:** same decay/trail/live draw pattern; branch removes the full-overwrite decay clear. Original and final noon decay are cheaper, while the fresh pre-fix run was slightly higher. No consistent clear-removal regression established; no speculative reversion.
- **Light pools:** version-triggered sparse additive projection and necessary clear unchanged; no steady light-pool label in these windows. High tier already had 16 point-light slots on main; fixed 16 slots cannot explain this high-tier regression.
- **Preparation/uploads:** prepare.ts compiles/reflects bounded owned programs, not per-frame draw submissions. Texture staging skips unchanged versions; fleet uploads changed rows rather than unconditionally dirtying the texture. No steady warmup draw loop found.
- **Stale fog:** an existing, time-dependent pass appeared in r3 as described above, not a newly introduced branch pass.

## Visual and test verification

- Fresh branch-before vs branch-after iGPU HIGH DPR1 heart/overview × noon/night summer: **4/4 decoded RGB exactly identical**, SSIM 1, MAE 0, max channel error 0. Contact sheet opened and inspected.
- Winter heart/noon after vs original integration branch: **exactly identical** (SSIM 1 / MAE 0), preserving the active bare-shadow shader.
- npx vitest run src/harbour/world/depth-prepass.test.ts src/harbour/world/materials.test.ts: **2 files / 19 tests passed**.
- No full suite, formatter, linter, build, production/native-laptop or motion capture was run by this slice. Four summer stills and the winter reference prove this fix's sampled pixels, not the unrelated fleet equivalence gate owned by the peer.

## Every pre-fix noon label, fresh n=3

Missing label = zero. Every numerically increased label is listed explicitly: `composer/StaticDepthPass/hb_kit_predepth`, `scene/harbour-fleet`, `scene/harbour-mooring-lines`, `scene/identity-crest-topmasts`, `scene/pharos-fire`, `shadow`, `sky-band/clear`, `sky-band/mips`, `wake-decay`, `wake-live/clear`, `wake-trail`. A positive delta is not automatically an independently established code regression.

| Label | Main ms | Branch ms | Delta ms |
|---|---:|---:|---:|
| composer/EffectPass/DownsamplingMaterial | 0.5567 | 0.4876 | -0.0692 |
| composer/EffectPass/EdgeDetectionMaterial | 0.6117 | 0.4553 | -0.1564 |
| composer/EffectPass/EdgeDetectionMaterial/clear | 0.0065 | 0.0017 | -0.0048 |
| composer/EffectPass/LuminanceMaterial | 0.3087 | 0.2008 | -0.1078 |
| composer/EffectPass/SMAAWeightsMaterial | 3.6012 | 1.5462 | -2.0550 |
| composer/EffectPass/UpsamplingMaterial | 0.4404 | 0.3316 | -0.1088 |
| composer/HarbourBeamEffect+HarbourHeatShimmer | 0.6057 | 0.5534 | -0.0523 |
| composer/NanScrubPass/hb_post_scrub | 0.2970 | 0.2866 | -0.0104 |
| composer/NanScrubPass/hb_post_scrub/clear | 0.0037 | 0.0030 | -0.0007 |
| composer/SMAAEffect | 0.8059 | 0.5224 | -0.2835 |
| composer/StaticDepthPass/hb_kit_predepth | 0.0000 | 0.5275 | 0.5275 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect | 1.7183 | 1.4618 | -0.2565 |
| depth-copy | 0.3671 | 0.3668 | -0.0003 |
| scene/Scene | 14.5371 | 10.5798 | -3.9573 |
| scene/beam-halo | 0.0122 | 0.0063 | -0.0059 |
| scene/chart-lettering | 0.2734 | 0.2658 | -0.0076 |
| scene/civic | 4.3674 | 1.6031 | -2.7643 |
| scene/harbour-fleet | 4.5452 | 4.5819 | 0.0367 |
| scene/harbour-house-flags | 0.0480 | 0.0432 | -0.0048 |
| scene/harbour-light-pillars | 0.0118 | 0.0000 | -0.0118 |
| scene/harbour-light-sprites | 0.0216 | 0.0000 | -0.0216 |
| scene/harbour-lighthouse | 1.6665 | 1.6077 | -0.0588 |
| scene/harbour-mooring-lines | 0.0241 | 0.0288 | 0.0046 |
| scene/identity-crest-flags | 0.0007 | 0.0006 | -0.0000 |
| scene/identity-crest-topmasts | 0.0164 | 0.0195 | 0.0032 |
| scene/identity-pier-marks | 0.0099 | 0.0097 | -0.0002 |
| scene/life | 0.4155 | 0.3918 | -0.0236 |
| scene/ocean | 13.2245 | 11.6120 | -1.6125 |
| scene/offices-merged-hb_kit | 0.0256 | 0.0000 | -0.0256 |
| scene/offices-merged-identity_crest_panel | 0.0046 | 0.0000 | -0.0046 |
| scene/pharos-fire | 0.0387 | 0.0684 | 0.0297 |
| scene/sky-backdrop | 2.1450 | 1.4541 | -0.6909 |
| shadow | 3.5331 | 16.3518 | 12.8187 |
| shadow/clear | 0.0245 | 0.0226 | -0.0019 |
| sky-band | 0.2256 | 0.0673 | -0.1583 |
| sky-band/clear | 0.0092 | 0.0100 | 0.0009 |
| sky-band/mips | 0.0250 | 0.0386 | 0.0136 |
| wake-decay | 1.6193 | 1.7887 | 0.1694 |
| wake-decay/clear | 0.0060 | 0.0000 | -0.0060 |
| wake-live | 0.4077 | 0.3289 | -0.0788 |
| wake-live/clear | 0.0013 | 0.0014 | 0.0001 |
| wake-trail | 0.0156 | 0.0159 | 0.0004 |

## Every final label, n=3 per arm

### igpu DPR1 heart noon

Numerically increased labels: `composer/EffectPass/LuminanceMaterial`, `composer/SMAAEffect`, `composer/StaticDepthPass/hb_kit_predepth`, `depth-copy`, `scene/harbour-fleet`, `scene/harbour-mooring-lines`, `scene/pharos-fire`, `shadow`, `wake-live`.

| Label | Main ms | Branch ms | Delta ms |
|---|---:|---:|---:|
| composer/EffectPass/DownsamplingMaterial | 0.5684 | 0.5467 | -0.0217 |
| composer/EffectPass/EdgeDetectionMaterial | 0.6398 | 0.6034 | -0.0365 |
| composer/EffectPass/EdgeDetectionMaterial/clear | 0.0064 | 0.0022 | -0.0042 |
| composer/EffectPass/LuminanceMaterial | 0.3094 | 0.3126 | 0.0032 |
| composer/EffectPass/SMAAWeightsMaterial | 3.6491 | 3.6459 | -0.0032 |
| composer/EffectPass/UpsamplingMaterial | 0.4630 | 0.3554 | -0.1076 |
| composer/HarbourBeamEffect+HarbourHeatShimmer | 0.5566 | 0.4765 | -0.0802 |
| composer/NanScrubPass/hb_post_scrub | 0.3036 | 0.2929 | -0.0107 |
| composer/NanScrubPass/hb_post_scrub/clear | 0.0030 | 0.0029 | -0.0002 |
| composer/SMAAEffect | 0.6564 | 0.8027 | 0.1464 |
| composer/StaleFogEffect | 0.0000 | 0.0000 | 0.0000 |
| composer/StaticDepthPass/hb_kit_predepth | 0.0000 | 0.5146 | 0.5146 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect | 1.9200 | 1.6110 | -0.3090 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect/clear | 0.0000 | 0.0000 | 0.0000 |
| depth-copy | 0.3669 | 0.3751 | 0.0082 |
| scene/Scene | 14.3846 | 9.9469 | -4.4377 |
| scene/beam-halo | 0.0130 | 0.0075 | -0.0055 |
| scene/chart-lettering | 0.2928 | 0.2743 | -0.0185 |
| scene/civic | 4.3146 | 1.5042 | -2.8104 |
| scene/harbour-fleet | 4.8167 | 4.8745 | 0.0578 |
| scene/harbour-house-flags | 0.0428 | 0.0380 | -0.0048 |
| scene/harbour-light-pillars | 0.0082 | 0.0000 | -0.0082 |
| scene/harbour-light-sprites | 0.0201 | 0.0000 | -0.0201 |
| scene/harbour-lighthouse | 1.6947 | 1.6470 | -0.0476 |
| scene/harbour-mooring-lines | 0.0175 | 0.0266 | 0.0091 |
| scene/identity-crest-flags | 0.0007 | 0.0006 | -0.0001 |
| scene/identity-crest-topmasts | 0.0181 | 0.0170 | -0.0012 |
| scene/identity-pier-marks | 0.0106 | 0.0092 | -0.0014 |
| scene/life | 0.3817 | 0.3381 | -0.0436 |
| scene/ocean | 12.8450 | 10.9251 | -1.9199 |
| scene/offices-merged-hb_kit | 0.0280 | 0.0000 | -0.0280 |
| scene/offices-merged-identity_crest_panel | 0.0035 | 0.0000 | -0.0035 |
| scene/pharos-fire | 0.0422 | 0.0586 | 0.0164 |
| scene/sky-backdrop | 2.3508 | 1.5925 | -0.7583 |
| shadow | 3.5920 | 3.8887 | 0.2967 |
| shadow/clear | 0.0250 | 0.0232 | -0.0018 |
| sky-band | 0.2268 | 0.0694 | -0.1575 |
| sky-band/clear | 0.0097 | 0.0090 | -0.0007 |
| sky-band/mips | 0.0514 | 0.0247 | -0.0266 |
| wake-decay | 1.7035 | 1.5540 | -0.1495 |
| wake-decay/clear | 0.0014 | 0.0000 | -0.0014 |
| wake-live | 0.3969 | 0.4480 | 0.0511 |
| wake-live/clear | 0.0064 | 0.0063 | -0.0002 |
| wake-trail | 0.0151 | 0.0145 | -0.0006 |

### igpu DPR1 heart night

Numerically increased labels: `composer/EffectPass/LuminanceMaterial`, `composer/NanScrubPass/hb_post_scrub`, `composer/NanScrubPass/hb_post_scrub/clear`, `composer/SMAAEffect`, `composer/StaticDepthPass/hb_kit_predepth`, `composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect`, `scene/chart-lettering`, `scene/harbour-fleet`, `scene/harbour-house-flags`, `scene/harbour-light-pillars`, `scene/harbour-mooring-lines`, `scene/harbour-riding-lights`, `scene/identity-crest-topmasts`, `scene/life`, `scene/ocean`, `scene/pharos-fire`, `shadow`, `shadow/clear`, `wake-live/clear`.

| Label | Main ms | Branch ms | Delta ms |
|---|---:|---:|---:|
| composer/EffectPass/DownsamplingMaterial | 0.6295 | 0.5712 | -0.0582 |
| composer/EffectPass/EdgeDetectionMaterial | 0.6016 | 0.5913 | -0.0103 |
| composer/EffectPass/EdgeDetectionMaterial/clear | 0.0062 | 0.0022 | -0.0040 |
| composer/EffectPass/LuminanceMaterial | 0.4105 | 0.4244 | 0.0139 |
| composer/EffectPass/SMAAWeightsMaterial | 2.7263 | 2.7096 | -0.0166 |
| composer/EffectPass/UpsamplingMaterial | 0.4685 | 0.4432 | -0.0254 |
| composer/HarbourBeamEffect+HarbourHeatShimmer | 11.6312 | 3.1344 | -8.4968 |
| composer/NanScrubPass/hb_post_scrub | 0.3136 | 0.4244 | 0.1108 |
| composer/NanScrubPass/hb_post_scrub/clear | 0.0030 | 0.0031 | 0.0001 |
| composer/SMAAEffect | 0.6389 | 0.8880 | 0.2491 |
| composer/StaleFogEffect | 0.0000 | 0.0000 | 0.0000 |
| composer/StaticDepthPass/hb_kit_predepth | 0.0000 | 0.5192 | 0.5192 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect | 1.5343 | 1.7394 | 0.2051 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect/clear | 0.0000 | 0.0000 | 0.0000 |
| depth-copy | 0.3848 | 0.3721 | -0.0127 |
| scene/Scene | 17.2505 | 12.9704 | -4.2801 |
| scene/beam-halo | 0.0118 | 0.0115 | -0.0003 |
| scene/chart-lettering | 0.2694 | 0.2763 | 0.0069 |
| scene/civic | 5.2436 | 2.0874 | -3.1562 |
| scene/harbour-fleet | 5.7925 | 6.1316 | 0.3391 |
| scene/harbour-house-flags | 0.0445 | 0.0455 | 0.0010 |
| scene/harbour-light-pillars | 0.0156 | 0.0162 | 0.0005 |
| scene/harbour-light-sprites | 0.0271 | 0.0244 | -0.0027 |
| scene/harbour-lighthouse | 2.2262 | 2.2122 | -0.0140 |
| scene/harbour-mooring-lines | 0.0141 | 0.0145 | 0.0004 |
| scene/harbour-riding-lights | 0.0086 | 0.0136 | 0.0051 |
| scene/identity-crest-flags | 0.0007 | 0.0006 | -0.0001 |
| scene/identity-crest-topmasts | 0.0305 | 0.0364 | 0.0059 |
| scene/identity-pier-marks | 0.0000 | 0.0000 | 0.0000 |
| scene/life | 0.2276 | 0.2596 | 0.0320 |
| scene/ocean | 11.0174 | 17.4262 | 6.4088 |
| scene/offices-merged-hb_kit | 0.0141 | 0.0000 | -0.0141 |
| scene/offices-merged-identity_crest_panel | 0.0042 | 0.0000 | -0.0042 |
| scene/pharos-fire | 0.0334 | 0.0491 | 0.0157 |
| scene/sky-backdrop | 2.4163 | 1.7081 | -0.7082 |
| shadow | 3.4135 | 3.6228 | 0.2093 |
| shadow/clear | 0.0247 | 0.0250 | 0.0003 |
| sky-band | 0.2267 | 0.0000 | -0.2267 |
| sky-band/clear | 0.0093 | 0.0000 | -0.0093 |
| sky-band/mips | 0.0252 | 0.0000 | -0.0252 |
| wake-decay | 1.7765 | 1.3642 | -0.4123 |
| wake-decay/clear | 0.0014 | 0.0000 | -0.0014 |
| wake-live | 0.3999 | 0.3336 | -0.0663 |
| wake-live/clear | 0.0013 | 0.0064 | 0.0051 |
| wake-trail | 0.0161 | 0.0146 | -0.0015 |

### igpu DPR1 overview noon

Numerically increased labels: `composer/EffectPass/EdgeDetectionMaterial/clear`, `composer/NanScrubPass/hb_post_scrub`, `composer/SMAAEffect`, `composer/StaticDepthPass/hb_kit_predepth`, `scene/beam-halo`, `scene/chart-lettering`, `scene/harbour-house-flags`, `scene/identity-crest-flags`, `scene/identity-crest-topmasts`, `scene/identity-pier-marks`, `scene/life`, `scene/ocean`, `scene/pharos-fire`, `shadow`, `sky-band/mips`, `wake-decay`, `wake-live`, `wake-live/clear`, `wake-trail`.

| Label | Main ms | Branch ms | Delta ms |
|---|---:|---:|---:|
| composer/EffectPass/CopyMaterial | 0.0962 | 0.0800 | -0.0162 |
| composer/EffectPass/DownsamplingMaterial | 0.5715 | 0.5482 | -0.0233 |
| composer/EffectPass/EdgeDetectionMaterial | 0.6071 | 0.5986 | -0.0086 |
| composer/EffectPass/EdgeDetectionMaterial/clear | 0.0065 | 0.0091 | 0.0026 |
| composer/EffectPass/KawaseBlurMaterial | 0.6352 | 0.5689 | -0.0664 |
| composer/EffectPass/LuminanceMaterial | 0.3157 | 0.3105 | -0.0052 |
| composer/EffectPass/SMAAWeightsMaterial | 3.5248 | 3.1806 | -0.3442 |
| composer/EffectPass/UpsamplingMaterial | 0.4798 | 0.4649 | -0.0149 |
| composer/HarbourBeamEffect+HarbourHeatShimmer | 0.6082 | 0.5712 | -0.0370 |
| composer/NanScrubPass/hb_post_scrub | 0.2940 | 0.3260 | 0.0319 |
| composer/NanScrubPass/hb_post_scrub/clear | 0.0030 | 0.0030 | 0.0000 |
| composer/SMAAEffect | 0.6378 | 0.8000 | 0.1622 |
| composer/StaleFogEffect | 0.0000 | 0.0000 | 0.0000 |
| composer/StaticDepthPass/hb_kit_predepth | 0.0000 | 0.5753 | 0.5753 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect | 1.8418 | 1.5954 | -0.2464 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect/clear | 0.0000 | 0.0000 | 0.0000 |
| depth-copy | 0.3670 | 0.3623 | -0.0047 |
| scene/Scene | 15.6150 | 11.9058 | -3.7092 |
| scene/beam-halo | 0.0130 | 0.0154 | 0.0024 |
| scene/chart-lettering | 0.1972 | 0.1978 | 0.0005 |
| scene/civic | 3.1684 | 1.4559 | -1.7125 |
| scene/harbour-fleet | 5.8488 | 5.6613 | -0.1875 |
| scene/harbour-house-flags | 0.0601 | 0.0806 | 0.0205 |
| scene/harbour-light-pillars | 0.0110 | 0.0000 | -0.0110 |
| scene/harbour-light-sprites | 0.0424 | 0.0000 | -0.0424 |
| scene/harbour-lighthouse | 0.7914 | 0.7881 | -0.0033 |
| scene/harbour-mooring-lines | 0.0000 | 0.0000 | 0.0000 |
| scene/identity-crest-flags | 0.0041 | 0.0047 | 0.0006 |
| scene/identity-crest-topmasts | 0.0076 | 0.0079 | 0.0003 |
| scene/identity-pier-marks | 0.0282 | 0.0369 | 0.0087 |
| scene/life | 0.4001 | 0.4533 | 0.0532 |
| scene/ocean | 11.9831 | 15.2307 | 3.2476 |
| scene/offices-merged-hb_kit | 0.0319 | 0.0000 | -0.0319 |
| scene/offices-merged-identity_crest_panel | 0.0096 | 0.0000 | -0.0096 |
| scene/pharos-fire | 0.0293 | 0.0527 | 0.0234 |
| scene/sky-backdrop | 2.3492 | 1.6680 | -0.6812 |
| shadow | 2.8764 | 3.2021 | 0.3258 |
| shadow/clear | 0.0301 | 0.0270 | -0.0030 |
| sky-band | 0.2313 | 0.0692 | -0.1620 |
| sky-band/clear | 0.0097 | 0.0096 | -0.0000 |
| sky-band/mips | 0.0255 | 0.0469 | 0.0214 |
| wake-decay | 1.4635 | 1.6765 | 0.2130 |
| wake-decay/clear | 0.0018 | 0.0000 | -0.0018 |
| wake-live | 0.2645 | 0.4535 | 0.1890 |
| wake-live/clear | 0.0013 | 0.0015 | 0.0002 |
| wake-trail | 0.0148 | 0.0149 | 0.0002 |

### standard DPR2 heart noon

Numerically increased labels: `composer/EffectPass/DownsamplingMaterial`, `composer/EffectPass/EdgeDetectionMaterial`, `composer/SMAAEffect`, `composer/StaticDepthPass/hb_kit_predepth`, `composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect`, `depth-copy`, `scene/harbour-house-flags`, `scene/identity-crest-topmasts`, `scene/pharos-fire`, `shadow`, `wake-live`.

| Label | Main ms | Branch ms | Delta ms |
|---|---:|---:|---:|
| composer/EffectPass/DownsamplingMaterial | 0.0658 | 0.0659 | 0.0001 |
| composer/EffectPass/EdgeDetectionMaterial | 0.0506 | 0.0511 | 0.0005 |
| composer/EffectPass/EdgeDetectionMaterial/clear | 0.0000 | 0.0000 | 0.0000 |
| composer/EffectPass/LuminanceMaterial | 0.0538 | 0.0536 | -0.0002 |
| composer/EffectPass/SMAAWeightsMaterial | 0.0995 | 0.0993 | -0.0003 |
| composer/EffectPass/UpsamplingMaterial | 0.0491 | 0.0490 | -0.0001 |
| composer/HarbourBeamEffect+HarbourHeatShimmer | 0.1100 | 0.1080 | -0.0020 |
| composer/NanScrubPass/hb_post_scrub | 0.0976 | 0.0943 | -0.0033 |
| composer/NanScrubPass/hb_post_scrub/clear | 0.0000 | 0.0000 | 0.0000 |
| composer/SMAAEffect | 0.0608 | 0.0621 | 0.0013 |
| composer/StaleFogEffect | 0.0000 | 0.0000 | 0.0000 |
| composer/StaticDepthPass/hb_kit_predepth | 0.0000 | 0.0850 | 0.0850 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect | 0.0960 | 0.0973 | 0.0013 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect/clear | 0.0000 | 0.0000 | 0.0000 |
| depth-copy | 0.0408 | 0.0409 | 0.0001 |
| scene/Scene | 0.5876 | 0.4376 | -0.1500 |
| scene/beam-halo | 0.0045 | 0.0045 | 0.0000 |
| scene/chart-lettering | 0.0324 | 0.0324 | -0.0000 |
| scene/civic | 0.3929 | 0.3134 | -0.0795 |
| scene/harbour-fleet | 0.2577 | 0.2512 | -0.0065 |
| scene/harbour-house-flags | 0.0132 | 0.0137 | 0.0005 |
| scene/harbour-light-pillars | 0.0127 | 0.0000 | -0.0127 |
| scene/harbour-light-sprites | 0.0053 | 0.0000 | -0.0053 |
| scene/harbour-lighthouse | 0.1096 | 0.1075 | -0.0021 |
| scene/harbour-mooring-lines | 0.0165 | 0.0127 | -0.0039 |
| scene/identity-crest-flags | 0.0049 | 0.0048 | -0.0001 |
| scene/identity-crest-topmasts | 0.0083 | 0.0083 | 0.0000 |
| scene/identity-pier-marks | 0.0047 | 0.0047 | 0.0000 |
| scene/life | 0.0695 | 0.0682 | -0.0013 |
| scene/ocean | 0.5068 | 0.5041 | -0.0028 |
| scene/offices-merged-hb_kit | 0.0276 | 0.0000 | -0.0276 |
| scene/offices-merged-identity_crest_panel | 0.0165 | 0.0000 | -0.0165 |
| scene/pharos-fire | 0.0220 | 0.0222 | 0.0003 |
| scene/sky-backdrop | 0.1222 | 0.0842 | -0.0380 |
| shadow | 0.2059 | 0.2358 | 0.0299 |
| shadow/clear | 0.0000 | 0.0000 | 0.0000 |
| sky-band | 0.0219 | 0.0209 | -0.0010 |
| sky-band/clear | 0.0000 | 0.0000 | 0.0000 |
| sky-band/mips | 0.0111 | 0.0107 | -0.0004 |
| wake-decay | 0.0369 | 0.0318 | -0.0052 |
| wake-decay/clear | 0.0001 | 0.0000 | -0.0001 |
| wake-live | 0.0070 | 0.0071 | 0.0002 |
| wake-live/clear | 0.0000 | 0.0000 | 0.0000 |
| wake-trail | 0.0094 | 0.0092 | -0.0003 |

## Original integration noon labels

For completeness, the requested full original V3 diff (n=3 each) is reproduced below; the dominant positive delta is shadow, not an unnamed offscreen remainder.

| Label | Main ms | Branch ms | Delta ms |
|---|---:|---:|---:|
| composer/EffectPass/DownsamplingMaterial | 0.5490 | 0.5732 | 0.0241 |
| composer/EffectPass/EdgeDetectionMaterial | 0.6014 | 0.6056 | 0.0042 |
| composer/EffectPass/EdgeDetectionMaterial/clear | 0.0065 | 0.0022 | -0.0044 |
| composer/EffectPass/LuminanceMaterial | 0.3104 | 0.3063 | -0.0040 |
| composer/EffectPass/SMAAWeightsMaterial | 3.5372 | 3.6646 | 0.1274 |
| composer/EffectPass/UpsamplingMaterial | 0.4546 | 0.4605 | 0.0058 |
| composer/HarbourBeamEffect+HarbourHeatShimmer | 0.5758 | 0.5545 | -0.0213 |
| composer/NanScrubPass/hb_post_scrub | 0.2852 | 0.3829 | 0.0976 |
| composer/NanScrubPass/hb_post_scrub/clear | 0.0030 | 0.0031 | 0.0001 |
| composer/SMAAEffect | 0.6608 | 0.7924 | 0.1315 |
| composer/StaticDepthPass/hb_kit_predepth | 0.0000 | 0.4745 | 0.4745 |
| composer/TiltShiftEffect+BloomEffect+ToneMappingEffect+LUT3DEffect+VignetteEffect | 1.5339 | 1.7775 | 0.2436 |
| depth-copy | 0.3669 | 0.3737 | 0.0068 |
| scene/Scene | 13.8176 | 10.2288 | -3.5887 |
| scene/beam-halo | 0.0125 | 0.0074 | -0.0050 |
| scene/chart-lettering | 0.2942 | 0.2257 | -0.0685 |
| scene/civic | 4.0122 | 1.6379 | -2.3742 |
| scene/harbour-fleet | 4.7936 | 4.6005 | -0.1931 |
| scene/harbour-house-flags | 0.0447 | 0.0428 | -0.0019 |
| scene/harbour-light-pillars | 0.0084 | 0.0000 | -0.0084 |
| scene/harbour-light-sprites | 0.0185 | 0.0000 | -0.0185 |
| scene/harbour-lighthouse | 1.6418 | 1.6223 | -0.0196 |
| scene/harbour-mooring-lines | 0.0184 | 0.0153 | -0.0031 |
| scene/identity-crest-flags | 0.0007 | 0.0008 | 0.0001 |
| scene/identity-crest-topmasts | 0.0202 | 0.0198 | -0.0004 |
| scene/identity-pier-marks | 0.0104 | 0.0103 | -0.0001 |
| scene/life | 0.3288 | 0.3627 | 0.0338 |
| scene/ocean | 9.9756 | 12.9919 | 3.0163 |
| scene/offices-merged-hb_kit | 0.0259 | 0.0000 | -0.0259 |
| scene/offices-merged-identity_crest_panel | 0.0044 | 0.0000 | -0.0044 |
| scene/pharos-fire | 0.0337 | 0.0696 | 0.0359 |
| scene/sky-backdrop | 2.0604 | 1.5896 | -0.4708 |
| shadow | 3.6633 | 16.1609 | 12.4976 |
| shadow/clear | 0.0296 | 0.0227 | -0.0070 |
| sky-band | 0.2300 | 0.0676 | -0.1624 |
| sky-band/clear | 0.0093 | 0.0092 | -0.0001 |
| sky-band/mips | 0.0250 | 0.0245 | -0.0005 |
| wake-decay | 1.7062 | 1.4553 | -0.2509 |
| wake-decay/clear | 0.0014 | 0.0000 | -0.0014 |
| wake-live | 0.4174 | 0.4361 | 0.0186 |
| wake-live/clear | 0.0013 | 0.0065 | 0.0052 |
| wake-trail | 0.0166 | 0.0156 | -0.0010 |

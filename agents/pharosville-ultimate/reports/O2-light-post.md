# O2 — Light, shadow, materials and post (lane O2, `light-post`)

Baseline v1.4.1. Ten real-GPU captures in `shots/O2-*` (civic close-ups noon/golden/night, Pharos noon/golden, berth +
4-frame burst + DPR 2, `quality=low` civic and landing, dawn hill) plus crops, a burst diff and notan studies. CPU numbers:
Node 24 benchmarks of the real `engine/post.ts` code on this desktop (load ≈ 2.8 / 16 cores).

## 1. Executive summary

The light is PharosVille's strongest asset: a coherent AgX + per-hour LUT pipeline, a fitted, texel-snapped PCF sun with no
acne or swimming, real warm/cool golden and night palettes. The wins are where that pipeline wastes time or stalls, plus
gaps in the crafted light.

1. At the landing and overview views, the shadow map and the sea shadow mask re-render every frame even though no moving
   caster is in them. Fleet shadows switch off at ≥ 640 m, and the landing sits at 650 m. That is **17.6 % of GPU time**.
   Render them only when something changes.
2. The 32³ grade LUT is rebuilt on the main thread. Each refill costs **19.6 ms**, and refills happen every ~4 s around dawn
   and dusk and at 4 Hz while weather eases. Pinned `?t=` captures never see this. Bake the LUT on the GPU.
3. The heat-shimmer gate is inverted. Its full-screen pass runs by day at far range and never close up.
4. At night the chain crest flags outshine the Pharos (luma 92 vs 62).
5. Gaps: rigging breaks into dotted lines at DPR 1; wall feet have no contact darkening; backlit crowns stay dead at dawn
   while sails glow; the overview tilt-shift blurs the docked fleet.

## 2. Current state

- **Post chain.** RenderPass → (stale fog) → beam/shimmer → NaN scrub → merged pass (tilt-shift, bloom 8 mips, AgX,
  per-hour 32³ LUT, vignette, dither) → SMAA (`engine/post.ts:20-21, 232-258`); half-float, no MSAA
  (`engine/engine.ts:88-100`). Coherent; ≈ 0.2 ms (8 %) on RTX.
- **Time of day.** 11 keyframes (exposure, bloom, grade, sun/fill/hemi, nightLift) with a seasonal remap
  (`engine/time-of-day.ts:63-144, 193-204`). Key:fill on the Pharos ≈ 3:1 at noon (linear 0.53 vs 0.175), ≈ 2:1 at golden
  with a warm/cool split; the navy night with warm lamps remains the yardstick.
- **Shadows.** One fitted, quantised, texel-snapped PCF map (4096 High / 2048 Medium/Low), 5-tap Vogel + IGN, radius by
  elevation and night (`world/sun.ts:43-55, 84-87, 141-165`). No acne or peter-panning (`O2-crop-noon-plaza.png`); a
  4-frame burst changes 0 % of static stone (`O2-burst-diff-berths.png`); the sea reads a resolved mask.
- **Contact and AO.** Only a 512² height-field AO (8 taps, indirect only; `world/materials.ts:308-325, 778-784`) plus wake
  contact rings on Medium/High. `n8ao` is never imported (`package.json:81`).
- **Materials.** One MeshStandard uber-kit with procedural patterns (`world/materials.ts:180-265`), gilt/bronze
  (`world/metal.ts`), sail translucency (`fleet/sail-light-glsl.ts`), aerial tint. Stone, limewash, timber and sailcloth
  read distinctly up close; terracotta and foliage go flat at heart (`hbFine` fades tile jitter; no leaf transmission).
- **Night lights.** A 2048² pool texture read by every kit fragment, sprites, pillars, 16/8/4 point lights with a uniform
  skip (`lights/lights-system.ts:16-35, 119-260`).
- **Anti-aliasing.** SMAA by tier; DPR ladder capped at the device ratio (`engine/quality.ts:47-58`). Mooring lines get a
  minimum pixel width (`fleet/mooring-lines.ts:4-30`); standing rigging does not.

## 3. Where the GPU goes

RTX, t=11, 1600×1000, High: 2.37 ms p50 (`perf-rtx-day.json`, 220 frames) = island 15 %, shadow 14.6 %, civic 13 %,
fleet 12.7 %, ocean 8.5 %, post ≈ 8 %, life 4 %, sea mask 2.9 %; shadow and mask run in 220/220 frames. Night adds
≈ 0.2 ms in lit passes (points, pools, windows). iGPU estimates scale from the measured Raphael Low@1 frame (68–76 ms); an
M1-class GPU is ~3–5× faster on ALU but ~1× on bandwidth-bound full-screen passes. Post traffic is **≈ 106 B/px per frame**
(~170 MB/frame at 1.6 Mpx, ~310 MB at 1440×900@1.5).

## 4. Findings (ranked)

1. **F3, high: a static shadow is re-rendered every frame.** The fleet casts only below 640 / 520 / 360 m
   (`fleet/fleet-system.ts:79-81, 901`). The landing is at 650 m, and `framing.ts` only ever pushes it further out. That
   leaves folk (`life/folk.ts:380`) and civic workers (`civic/workers.ts:128`) as the only moving casters at heart. Yet High
   re-renders the map every frame and Medium/Low every 2nd–4th frame (`engine/quality.ts:28-30`). With the mask, that is
   17.6 % of GPU time.
2. **F2, high: the grade LUT stalls the main thread.** `fillGradeLUT` takes 19.6 ms (`engine/post.ts:51-91, 347-355`; est.
   40–80 ms on laptops) whenever the grade moves ≥ 5e-4, at most 4 Hz. A simulated calm day gives 4,962 refills: 920/h at
   05–06 h, 938/h at 19–20 h (one every ~3.9 s). Weather easing rewrites the grade every frame (`sky/sky-system.ts:584-587,
   608-609`; `weather/weather-system.ts:255-258`) → 4 Hz refills. Pinned `?t=` captures cannot see it (`post.update` max
   0.1 ms in `perf-cpu-day.json`).
3. **F1, medium: the shimmer gate is inverted.** `THREE.MathUtils.smoothstep(dCam, 520, 140)` (`beam/beam-system.ts:391`)
   returns 0 for x ≤ 520 and 1 above (`MathUtils.js:167-176`: the `x <= min` test runs first), so the shimmer is on
   beyond 520 m and off below. The full-screen beam/shimmer pass runs in 220/220 day frames, and the intended close-up
   shimmer never appears. It is the only reversed-edge JS smoothstep in `src/harbour`.
4. **F4, medium: crest flags outshine the hero at night.** The flags use a flat light
   (`identity/crest-flags.ts:33-42`; `identity/identity-system.ts:167-174`), although the code comment says they are
   "faintly lit". Measured mean luma: flag 92 vs Pharos tower body 62 in `base-night`, and 75 vs 69 at overview. In
   `O2-notan-night.png` the flag sits in the top value class.
5. **F5, medium: dotted rigging at DPR 1.** Stays render as dashes and crawl as hulls bob (`O2-crop-mole-dpr1-vs-dpr2.png`,
   `O2-crop-galley-dpr1-vs-dpr2.png`, burst diff). At DPR 2 the same stays are continuous. Standing rigging
   (`PAINT_RIGGING`, `fleet/hull-kit.ts:85`) gets no width floor.
6. **F6, medium: no contact darkening at wall feet.** On flat ground beside a wall, `hbAO` takes about 10 % off indirect
   light, which is about 3 % of the total at noon. Plinths and columns meet the paving at full value
   (`O2-crop-noon-wallfoot.png`).
7. **F13, medium: at overview the tilt-shift band sits above the harbour.** The offset follows the Pharos and clamps at 0.5
   (`engine/post.ts:333-345`), so the sharp band is NDC 0.3–0.7, and below NDC −0.08 everything gets the full 55 % blur
   (`maskParams = offset ± (focusArea − feather)`). The moles' docked rows and the hamlet piers, the fleet data, measure
   10–14 mean |∇²| per strip in `base-overview.png`, against 15–30 for the same kind of content at heart. Found with O3.
8. **F7, low: backlit crowns stay dead.** At dawn the sun is behind the island (`engine/time-of-day.ts:85-87`). Sails glow,
   but pines stay as flat dark slabs (`O2-dawn-hill.png`); leaves have no transmission term (`world/materials.ts:237-238`).
9. **F8, low: night overview lamps read as "pearls"** (REVIEW #15 is still open). Lamp cores clip at 226 and the full bloom
   halo applies at overview (`O2-crop-overview-pearls.png`).
10. **F9, low: point lights ignore camera distance.** Lights are promoted without a distance gate
   (`lights/lights-system.ts:393-419`).
11. **F11, low: 1× screens never supersample.** This holds even with a GPU sitting 85 % idle (`engine/quality.ts:47-58`,
    test at `quality.test.ts:7`).
12. **F10 and F12, low.**
    - `n8ao` is a dead dependency.
    - Four GLSL `smoothstep` calls with reversed literal edges: three in `ocean/ocean-material.ts`, one in
      `sky/sky-glsl.ts`. These are undefined per GLSL ES / MSL but work on today's drivers. Normalise them when those files
      are touched.

## 5. Ideas

**O2-I1 Still shadows (S, all-devices).** Folk and workers cast real shadows only below ~320 m; beyond, each keeps a baked
2–4-tri foot blob. `SunRig` asks a casters registry (fleet `castShadow`, folk, workers, shipyard moments) whether any
dynamic caster is live; if none, map and sea mask re-render only on a framing change, a ~0.11° sun drift (~every 27 s, live
clock), a tier or season change. Phase 2: a decimated shadow-proxy island for zoomed-in frames. Saves 17.6 % of RTX GPU at
the landing; on iGPUs removes a 1–2.5 ms (M1-class) / 5–10 ms (Raphael-class) refresh from every 2nd–4th frame (p95).

**O2-I2 Bake the grade on the GPU (M, professional).** Port `gradePixel` to GLSL; render the LUT into a
`WebGL3DRenderTarget` (32 layers of 32×32) only when the grade moved; drop the 4 Hz throttle so weather transitions glide;
keep the CPU version as the test oracle (probes within 1/512). Removes a 20–80 ms stall every few seconds at dawn and dusk
for < 0.02 ms of GPU on change frames.

**O2-I3 Supersample 1× screens with headroom (S, prettier).** `ladderFor` adds 1.5/2 rungs above a device ratio of 1 for
GPUs that start at the top rung (discrete); the governor climbs as usual and the 2:1 compositor downscale box-filters.
Retina-grade masts and roofs on 1080p/1440p monitors; RTX 2.4 → ~6–7 ms, ~4× RT memory (~250 MB); iGPUs unchanged.

**O2-I4 Rigging as hairlines (M, prettier).** Apply the mooring-line width floor to standing rigging (`aPaint` 10) and
spars (8): in view space push vertices along the normal to ≥ 0.8 px, pass true/drawn width as coverage and tint toward
`uAmbient` by (1 − coverage) so a widened stay reads faint, not heavy; keep far-rig striking. ~15 VS ALU on rig vertices,
0 draws; fixes the dashed-stay crawl on High/Medium at DPR 1.

**O2-I5 Flags lit by their own lamp (S, prettier).** Night key = moon × fold shading × (1 − 0.82 night) plus a truck-lamp
gradient from the hoist head; target flag luma ≤ 0.7× the Pharos body (92 → ~55), floor 25 % of day, hover restores.
Crest contrast is kept; ~6 ALU.

**O2-I6 Two-tap contact AO (M, prettier, GPU-negative).** Bake today's 8-tap AO for up-facing surfaces into a 512² R8
texture at init; vertical kit fragments take one tap of a 1024² R16F ground-height copy 1 m in front of the wall,
`foot = 1 − smoothstep(0, 1.2 m, P.y − h)`, darkening indirect ≤ 35 % and direct diffuse ~12 %; static kit only. Walls and
plinths sit in the paving; net −4 taps per kit fragment; +2.3 MB.

**O2-I7 Backlit crowns (S, enchanting).** Leaf patterns 8/14 get the sails' transmission term in the 4–22° sun window,
capped under the bloom threshold, × (1 − bare)(1 − snow), with one PCF lookup at P + L·2 m so crowns behind buildings stay
dark. Dawn pines get warm rims like the sails; ~0 cost outside low sun.

**O2-I8 Lamps, not pearls (S, prettier).** At overview bloom intensity × (1 − 0.3z) and mip radius 0.72 → 0.6; static
±15 % per-lamp brightness; far sprite floor 1.3 → 1.0 px. The Pharos fire still blooms; no cost.

**O2-I9 Post bandwidth diet (S + M, all-devices).** Fix the shimmer gate (F1: beam pass off by day beyond 520 m); retire
the standalone NaN scrub for guards in bloom luminance + the first merged effect (NaN-injection test); write the merged pass
as RGBA8 sRGB for SMAA. ~106 → ~62 B/px, ≈ −1 ms at 1.6 Mpx on a 60 GB/s iGPU.

**O2-I10 Point lights where they show (S, all-devices).** Tier count below 350 m, min(4, tier) to 800 m, none at overview;
16 slots kept (no recompiles). Est. −0.3 to −0.8 ms on iGPUs for the night overview; A/B first.

**O2-I11 Patched roofs and sun-catching setts (S, prettier).** Tiles get a 3–6 m old/new patchwork (±6 % value, toward
ochre) and eave darkening that survive at heart; the cobbles' Voronoi cell vector domes each sett toward the sun (±8 %).
~50 ALU on roof fragments.

**O2-I12 Night value-hierarchy check (M, professional).** A `shot.mjs`-based script projects the Pharos and landmark/flag
rectangles, measures mean luma at 12 h, 18.3 h, 22 h and overview, fails if anything (lamps excluded) outranks the Pharos,
and emits a notan PNG.

**O2-I13 Overview tilt-shift band through the harbour (S, informative).** Each frame, project the Pharos lantern and the
inner docked rows (layout moorings) to NDC y; the sharp band spans them plus a margin (offset = midpoint, ≤ 65 % of the
screen), the Pharos stays inside (01-A6), the 0.55 blur keeps the top sky and nearest sea. A readable docked fleet at
overview; zero cost.

**AA considered, not chosen:** alpha-to-coverage needs MSAA (none); MSAA 4× is heavy on Intel/AMD iGPUs (I3 + I4 cover
it); TAA-lite ghosts moving coin emblems (identity risk); LOD thinning already exists for far rigs.

## 6. Top picks

1. **O2-I1**: about 18 % of GPU time back at the default views, for an S change.
2. **O2-I2**: removes a periodic 20–80 ms main-thread stall that no gate currently measures.
3. **O2-I7**: the biggest dawn and golden-hour enchantment, for about 15 ALU.
4. **O2-I5**: gives the Pharos its night hierarchy back, for a few ALU.
5. **O2-I3**: crisp rigging and roofs for 1× desktop screens, for S effort, and only where the GPU has room.

## 7. Decisions for the operator

- **I3:** render above the device ratio on discrete GPUs (changes the `quality.test.ts:7` invariant)?
- **I1:** baked figure foot blobs and a ≤ 1 px shadow step every ~27 s (live clock), for ~18 % of GPU time?
- **I5:** dim identity flags at night, legible but below the Pharos?
- **I9:** in-shader NaN guards instead of the scrub pass (overview tilt blur could smear a NaN locally)?
- **I13:** a readable docked fleet at overview vs. today's stronger miniature blur?
- **AA:** TAA and MSAA stay out; I3 + I4 are the AA plan?

## 8. Cross-lane hooks

- **Fleet:** I4 touches the vertex pose and depth twin (bump the `hb_fleet` cache key).
- **Life/civic:** I1 needs figure foot blobs and a castShadow distance gate; new moving casters must register.
- **Perf/engine:** confirm I1, I9, I10 on the Apple gate (`npm run preview`); F1's fix changes per-pass profiles.
- **Ocean (O3):** O3-I1's mirror is now temporal: a half-res pass at composer index 1, which the ocean shader samples the
  next frame. It no longer uses the beam pass, so F1's fix is free. I13 pairs with O3-I11 (O3-F5), and I8 stacks with the
  O3-I4 glint cap. After I1, the sea mask resolves only after a shadow-map render.
- **O1 art direction:** sign off I5, I6, I7, I11 on close-ups. **Island/Blender:** I1 phase-2 shadow proxy (D4).

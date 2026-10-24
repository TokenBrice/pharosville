# 02 — Lighting, post-processing & colour

Vertical 02 of the "prettier & more magical" sweep. Read-only pass over `src/harbour/engine/`,
`sky/`, `lights/`, `world/sun.ts`, `world/materials.ts`, `fleet/fleet-material.ts`,
`ocean/ocean-material.ts`, `weather/`, `beam/`. Captures: `shots/02-golden.png` (t=17.2),
`shots/02-golden-heart.png` (t=18.9, which the October season remaps into blue hour), plus the
shared `day/dusk/night` frames.

## 1. Current state

A lot more is already built than the brief's list assumes. Before proposing anything, note that these exist:

- **Post chain** (`engine/post.ts`): NaN scrub → tilt-shift (overview only, fades with
  `rig.distance` 260→700, skipped at opacity 0) → mipmap bloom (per-hour intensity/threshold) → **AgX**
  → **per-hour 32³ half-float 3D LUT** (CPU-built from lift/gamma/gain, S-curve, `shadowSat`,
  `blueSat`, `warmSat`; refilled at most 4 Hz and only when the grade moves) → vignette → SMAA.
  **Per-hour grading, golden/blue-hour grades and tilt-shift miniature are already done.**
- **Time of day** (`engine/time-of-day.ts`): 11 keyframes (dawn 6.4, golden 18.5, dusk 19.7, blue
  hour 20.7, night). Each key sets exposure in stops, bloom, lamp/lens emission, window occupancy and
  moon `nightLift`. The season system remaps the keys onto the real sunrise and sunset and scales sun
  elevation. Storm, gloom and lightning modulate the grade and the lights in `sky/sky-system.ts`.
- **Shadows** (`world/sun.ts`): ONE PCF soft map (`PCFShadowMap` + `radius`), with no cascades. It is
  fitted to the visible island footprint, quantised and texel-snapped, and cached (High re-renders every
  frame, Medium 30 Hz, Low 15 Hz). Map size is 4096 on High and 2048 on Medium/Low. At night the
  penumbra softens and the shadows lighten. Penumbra does **not** change with sun elevation.
- **AO**: a static **height-field AO** (8 taps on the island height RT, `hbAO` in `world/materials.ts`)
  covers the kit only. There is no SSAO/GTAO. Fleet hulls get **contact rings stamped into the wake
  RT** (Medium and High tiers).
- **Environment / spec**: there is no PMREM or IBL. `hbEnvSpec` is an analytic sky-gradient Fresnel
  term with a sky rim. Wet puddles mirror the sky and snow has sun glints. **The whole kit is
  dielectric** (`metalness: 0`). The metal pattern (pid 12) only gets `rough 0.48`, so bronze statues
  and gilt are lit like painted plaster.
- **Night lights** (`lights/`): a 2048² top-down pool RT is sampled by every kit material and
  **reflected in the ocean**. It adds instanced bloomed sprites, water pillars, and 16/8/4 promoted
  point lights per tier, with dark lights skipped by a shader-chunk patch. Windows have deterministic
  occupancy. This is strong.
- **Fog**: `uFogDensity` is interpolated per hour but **consumed by nothing**. There is no distance or
  aerial term on the kit or fleet. Only the ocean (horizon band) and the sky card (hill silhouettes)
  have aerial perspective. Screen fog is reserved for **stale data** (`readings/fog.ts`, D11).
- **Ocean** (`ocean/ocean-material.ts`): it has a sun/moon glitter path, cloud shadows, wakes and the
  beam reflection, but it **does not receive the sun shadow map**. The lighthouse, moles and hulls
  cast no shadow on water. The fleet does cast (`shadowDist` 640/520/360), but those shadows only land
  on stone.
- **Sails**: there is a backlit term, `diffuse × sunColor × max(0, −N·L) × 0.16` (fleet-material
  l.416). It is constant: it has no view dependence and no boost when the sun is low.
- **Weather**: lightning adds a cold flash to hemi, fill and ambient. That light is shadowless and has
  no direction, so the world brightens flat.
- **Weak spots in the frames**: (a) at golden hour the harbour water stays saturated cyan, and the
  tall tower throws no long shadow across the bay, which is the single most "diorama-magical" image
  missing. (b) At noon, distant ships in the Roads are as crisp and saturated as foreground ones, so
  depth reads flat. (c) The night sky gradient and bloom halos sit on 8-bit output with no dither.

## 2. Ideas

### L1 The harbour receives the sun's shadow
**What**: the ocean shader samples the existing key-light shadow map. Pass
`key.shadow.map.texture` and `key.shadow.matrix` as uniforms, compute shadow coordinates in the
vertex shader, and use hardware-compare PCF in the fragment shader (4 taps on High, 1 tap on Medium
and Low). The shadow multiplies only the **sun-dependent** terms: glitter, the `uSunColor` crest
light, and a ~35 % share of the body colour (upwelling diffuse). The sky reflection stays untouched,
because water in shadow still mirrors the sky. Fade it out where the fragment leaves the fitted
shadow box.
**Why magical**: at dawn and golden hour the Pharos lays a long blue finger across the harbour, and
moored hulls and the moles sit in their own shade. The glitter path breaks where the tower occludes
it. This is the classic tabletop-diorama tell.
**Data/meaning**: decorative (time of day). No signal changes.
**Where**: `ocean/ocean-material.ts`, `ocean/ocean-system.ts`; `world/sun.ts` exposes the map and
matrix through a service.
**Cost**: S–M. No new pass: the map is already rendered. Ocean covers about 40–60 % of the pixels, so
the cost is 1–4 compare fetches plus a vec4 varying. Estimated at about 0.1–0.25 ms on M1 at 1.5 dpr.
**Risk**: shadow acne on Gerstner displacement, so use the flat-plane coordinate plus a larger normal
bias. The map footprint is clipped to island bounds, so the open sea stays unshadowed; feather
that edge. Reduced motion is unaffected.

### L2 Low-sun sail translucency
**What**: replace the constant 0.16 backlit term with a model that depends on view and elevation:
`k = 0.12 + 0.55·pow(max(0, dot(-V, L)), 3)·(1 − smoothstep(4°, 22°, sunEl))`, with the transmitted
colour = `mix(dye, dye·sunColor, 0.6)`. Add a faint seam/batten darkening read from the existing cloth
seams so the glow shows the weave. Cap it at night, where the moon key gives only 0.3×.
**Why magical**: as the sun drops behind the fleet, sails light up like paper lanterns in their brand
colours. It is the warm, quiet moment visitors screenshot.
**Data/meaning**: decorative. Hue stays the brand dye, so no data is re-mapped.
**Where**: `fleet/fleet-material.ts` (opaque_fragment block, l.416). Sun elevation is `uSunDir.y`.
**Cost**: S. About 6 ALU on sail fragments only.
**Risk**: bloom threshold at dusk is 1.0, so keep the term under ~0.8 scene-linear to avoid neon
sails.

### L3 Clear-air depth (aerial perspective on kit and fleet)
**What**: finally consume `uFogDensity`. Kit, civic and fleet materials blend toward
`mix(uHaze, uHorizon, 0.4)` by `1 − exp(−d·density·k)`, capped at **≤ 18 %**, together with a
saturation drop of ≤ 20 %. Weight it by height so tower tops stay clearer. Apply it at overview
distances (gate on `rig.distance`, as tilt-shift does) so the heart view stays crisp.
**Why magical**: the far Roads and the Shoals settle into the air and the island gains depth layers
like a painted backdrop. It agrees with the ocean's existing horizon haze, which kit and fleet ignore
today.
**Data/meaning**: decorative, but **it touches D11**: "fog = stale data ONLY". It must read as
constant clear-air depth, never as a bank or weather. It is identical in every data state, it is
capped well below the stale-fog look (`readings/fog.ts`), and it uses no noise or drift. The
orchestrator should treat this as a deliberate decision to flag, not a silent addition.
**Where**: `world/materials.ts` (shared GLSL chunk), `fleet/fleet-material.ts`, civic glow
materials; `time-of-day.ts` keys are already authored.
**Cost**: S. About 8 ALU per lit fragment, no textures.
**Risk**: truth ambiguity with stale fog (above). It also slightly reduces distant flag legibility, so
exempt flag and crest materials.

### L4 Dither and still paper tooth
**What**: one tiny `Effect` after the LUT. It adds ±0.5/255 triangular dither from an interleaved-
gradient hash (this kills night-sky and bloom-halo banding). It also adds an optional **static**
paper-tooth luminance modulation (amplitude about 1.5 %, a 256² tileable texture baked once and
pinned to the screen; never animated, so it is reduced-motion safe). The tooth is stronger in flat
mid-tones and zero on UI-adjacent edges.
**Why magical**: night gradients become velvet instead of stepped. The tooth gives the "illustrated
plate" feel that suits the D4 handmade kit.
**Data/meaning**: decorative.
**Where**: `engine/post.ts` (append to the merged `EffectPass`, so no new pass). The texture comes
from a Blender/script bake under `public/` (≤ 20 KB).
**Cost**: S. One fetch plus 4 ALU per pixel; about 0.03 ms on iGPU.
**Risk**: grain that is too strong reads as "filter" or tech-demo. Ship the dither unconditionally and
the paper tooth behind an art review.

### L5 Gilt and bronze that catch the sun
**What**: give the metal pattern (pid 12) and gilt surfaces a metallic response inside the existing
kit material: tinted F0 (bronze `#B87333`, gilt `#E0B04A`), roughness 0.3, an `hbEnvSpec` reflection
tinted by albedo, and a sharp sun specular lobe (pow ~64). Add a sparse, sub-pixel-faded **glint
twinkle** keyed to hashed facet normals: static in space and changing only as the camera or sun move,
so it stays still under reduced motion.
**Why magical**: the lighthouse statue, the bronze terrace and civic gilt flash softly at golden hour.
The world feels crafted from precious materials.
**Data/meaning**: decorative.
**Where**: `world/materials.ts` (pattern branch, l.236, and the light accumulation near l.585). Check
the GLB material IDs for which meshes carry pid 12.
**Cost**: S. Branch-local ALU only.
**Risk**: specular aliasing produces sparkle crawl. Use the existing `hbFine` derivatives fade and keep
SMAA.

### L6 Penumbra by sun elevation, and long-shadow texel guard
**What**: `shadow.radius = 2.2 + 2.5·night + 3.0·(1 − smoothstep(6°, 30°, el))`, so long dawn and
golden shadows soften with distance, as real ones do. On Medium and Low (2048), when the sun is low,
cap how far the fit may stretch along the light direction, or pull the far footprint in, so long
shadows don't turn to stair-steps.
**Why magical**: the late light becomes soft and painterly instead of crisp-edged CG.
**Data/meaning**: decorative.
**Where**: `world/sun.ts` `update`/`fitShadow`.
**Cost**: S. The Vogel-disk PCF tap count is unchanged (radius only).
**Risk**: none notable.

### L7 Lightning with a direction
**What**: during a flash, the existing `fill` light (shadowless) turns to the strike azimuth from
`weather.flash.azimuth` at about 25° elevation. The cold colour moves from the hemisphere into that
directional light, so the facades facing the storm flare and the lee sides stay dark. Keep the
existing flash envelope (≤ 2 per second; none under reduced motion).
**Why magical**: storms gain drama and orientation, and you can tell where the bolt was.
**Data/meaning**: lightning is already bound to the DEWS Warning/Danger bands. This makes an existing
cue legible; nothing is re-mapped.
**Where**: `sky/sky-system.ts` flash block; `world/sun.ts` reads it.
**Cost**: S. Zero extra passes, because it is the fill light rather than a shadowed one.
**Risk**: photosensitivity is unchanged in energy, but keep the peak ≤ the current one. Do not use the
key light (re-rendering the shadow map on a flash would cost a hitch).

### L8 Depth-aware miniature focus
**What**: replace the screen-band `TiltShiftEffect` with a cheap CoC derived from the depth buffer at
half resolution. The focus plane sits at the rig target, so a tall foreground tower blurs correctly
instead of relying on its screen row. Only at overview, exactly as today.
**Why magical**: the miniature illusion gets stronger: the tilt-shift blur follows the scene's real
depth, not just the screen row.
**Data/meaning**: decorative. It must never blur ships the visitor is hovering; reuse the existing
fade.
**Where**: `engine/post.ts`. This needs a depth texture from `RenderPass` (the composer can provide
one).
**Cost**: M. Roughly the current tilt cost plus one depth read; High and Medium only, with Low keeping
the band version.
**Risk**: haloing around masts. Lower priority, because the current effect already works.

### L9 Screen-space AO for movers (High tier only)
**What**: N8AO-style half-resolution AO, depth-only, with the ocean masked via stencil-free depth
range or a material flag. It gives hulls at quays, civic machinery, figures and crates the contact
darkening that the static height-field AO cannot.
**Why magical**: moving and instanced things look grounded.
**Data/meaning**: decorative.
**Where**: `engine/post.ts` (new pass before the main pass); `engine/quality.ts` gets an `ssao` flag
(High only).
**Cost**: M–L. About 0.6–1.2 ms on M1 at half resolution, plus bundle bytes (~15 KB). **Not for iGPU:**
the governor would drop to Medium first, so it is effectively discrete-GPU-only.
**Risk**: dark halos on thin masts and sails, and double-darkening with `hbAO`. The value is lower
than L1 for the cost.

### L10 Crepuscular rays in the painted sky only
**What**: at dawn and golden hour, faint radial rays fan from the sun position *behind the painted
cumulus banks*, computed inside `sky-glsl.ts` from the cloud-band alpha already evaluated (no
world-space volume).
**Why magical**: rays breaking through a cloud gap above the sea.
**Data/meaning**: decorative, but it is **adjacent to the PSI beam**. The rays stay sky-card-only,
warm-white, never over the island, and disappear when the beam is the hero (night).
**Where**: `sky/sky-glsl.ts`, `sky/sky-system.ts`.
**Cost**: S–M. About 12 ALU on sky pixels only.
**Risk**: competes with the beam and risks a "spectacle" read. Keep the peak at ≤ 6 % luminance.

### L11 Golden-hour sea warmth
**What**: in `ocean-material.ts`, warm the body colour by the sun term only when the sun is low
(`uSunColor × (1 − smoothstep(4°, 25°, el)) × 0.2`), and add a slight `blueSat` dip for the sea in the
golden grade key.
**Why magical**: in `02-golden.png` the harbour stays pool-cyan while everything else is amber. A
warmed sea would bind the frame into one light.
**Data/meaning**: decorative.
**Where**: ocean (vertical 03 owns it) plus one keyframe tweak in `time-of-day.ts`.
**Cost**: S.
**Risk**: muddy water if overdone.

## 3. Top picks

1. **L1 The harbour receives the sun's shadow.** It is the biggest visual gain per millisecond: the
   map already exists and one shader samples it. It produces the long tower shadow on water and
   shades the hulls.
2. **L2 Low-sun sail translucency.** A few ALU on sails only; the fleet becomes lanterns at golden
   hour.
3. **L4 Dither and still paper tooth.** Almost free, fixes real banding at night, and the
   illustrated-plate texture fits D4.
4. **L5 Gilt and bronze that catch the sun.** Fixes a real material gap (an all-dielectric kit) and
   adds sparse, calm "magic" glints.
5. **L3 Clear-air depth.** A large depth gain for ~8 ALU, but it needs an explicit D11 sign-off that
   it is atmosphere, not fog.

Honourable mention: **L6** (a one-line penumbra win, which can ride along with L1).

**Tier gating summary:**
- L2, L3, L4, L5, L6, L7 and L11 run on all tiers (ALU only).
- L1 runs 4-tap on High and 1-tap on Medium/Low.
- L8 runs on High and Medium.
- L9 is High only; in practice that means discrete GPUs, since Apple and Intel start at Medium@1.5.

None of the top 5 adds a render pass. The worst-case iGPU addition is about 0.3 ms.

## 4. Cross-vertical hooks

- **Ocean (03)**: L1 and L11 live in `ocean-material.ts`. The glitter occluded by the shadow must
  stay consistent with the beam reflection and the wake contact rings.
- **Fleet (sails/hulls)**: L2 needs the sail mask (`vFleetMisc.z`). Coordinate if the fleet vertical
  changes the sail shading.
- **Weather/sky**: L7 and L10 share the `sky-system.ts` flash, gloom and cloud code. L3's haze colour
  must follow storm `greyOf`.
- **Readings / D11 (truth)**: L3 must be reviewed against `readings/fog.ts` stale fog so the two can
  never be confused.
- **Kit/Blender (D4)**: L5 needs confirmed material IDs for bronze and gilt in the GLBs. L4's paper
  texture should be a scripted bake under `scripts/harbour/blender/`, or generated procedurally at
  boot.
- **Perf**: every item should go through the Apple-Silicon gate (`npm run preview` + the governor
  rung log). L9 should not ship without that number.

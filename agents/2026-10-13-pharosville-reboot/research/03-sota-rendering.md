# 03 — State-of-the-art browser rendering, Oct 2026, for a stylized maritime diorama

Researched 2026-10-13. Scope follows the operator decisions from mid-task: desktop first (phones are a later tier); stylized real-time 3D; a bounded isometric 3/4 island diorama with pan and zoom (orthographic or narrow-FOV camera); a harbor town; 100–600 moving boats that sail and dock; the lighthouse beam as the hero effect. Prior stack survey: `agents/pharosville-revamp/04-stack-options.md`. This file adds Oct 2026 specifics and makes a recommendation. Claims I have not verified are marked [INFERENCE]. No look or performance was judged in a browser.

## 1. Renderer status

**WebGPU coverage.** caniuse puts global support at **87.8%** (85.8% full + 2.0% partial, Sep 2026 usage data) ([caniuse](https://caniuse.com/webgpu)).
- Chrome/Edge 113+ on Windows, macOS and ChromeOS.
- Android Chrome 121+, on Android 12+ with Qualcomm/ARM GPUs.
- Safari 26 on macOS, iOS and iPadOS, shipped 2025-09-15 ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
- Firefox 141+ on Windows, and 147+ on Apple-Silicon Macs.
- Gaps:
  - Firefox Android is still off by default (v157).
  - Firefox Linux is Nightly only.
  - Chrome Linux supports only Intel Gen12+ and recent NVIDIA GPUs ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers); [summary, Sep 2026](https://www.abratabia.com/webgpu/browser-support.php)).

For a desktop-first product, WebGPU is the primary path. WebGL2 is the fallback, not the target.

**three.js.** Release history from npm:
- **r186** (0.186.0, 2026-09-08), current patch 0.186.1 (2026-09-24).
- r185 (2026-06-25), r184 (2026-04-16), r183 (2026-02).

Recent `WebGPURenderer`/TSL additions ([releases](https://github.com/mrdoob/three.js/releases); [r183 RenderPipeline](https://app.cinevva.com/news/2026-03-18-threejs-r183-render-pipeline); [utsubo summary](https://www.utsubo.com/blog/threejs-2026-what-changed)):
- `RenderPipeline` replaced `PostProcessing` (r183).
- r185: clustered Forward+ lighting, render-to-texture-array, `storageTexture3D`.
- r186: `SunLight` with cascaded shadows, `compileComputeAsync()`, `DirectRenderPipeline`, compute `updateBefore/After`, a native TSL **GaussianSplat** object ([radiancefields](https://radiancefields.com/three.js-merges-a-native-gaussian-splat-renderer-for-webgpu-in-r186)), and reworked PBR multi-scattering.

The official examples list (`examples/files.json`, 234 WebGPU entries) now includes TSL nodes for:
- GTAO (`postprocessing_ao`), SSGI, SSR (+denoise), TRAA, SMAA/FXAA
- bloom (including selective and emissive), godrays, DOF, lens flare, 3D LUT, outline
- volumetric lighting (`volume_lighting`, `volume_lighting_traa`), volumetric cloud, height fog
- `compute_water`, a heightfield ripple simulation
- tonemapping with AgX and Neutral

The manual still calls the renderer *"experimental… you will encounter missing features or a better performance with WebGLRenderer"*. It also says `WebGLRenderer` gets *"no plans to add larger new features"* ([manual source](https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html)). On the WebGL2 fallback backend, compute is emulated with **transform feedback** (`src/renderers/webgl-fallback/WebGLBackend.js:909-983`). That covers 1D buffer compute only: no storage textures and no workgroup memory. So FFT and clustered lighting are WebGPU-only in practice.

**Alternatives.**
- **Babylon.js 9.0** (2026-03-26), now at 9.30 (2026-10-08). It ships Frame Graph v1, clustered lighting, compute-based volumetric lighting, a physical atmosphere, and an OpenPBR alpha ([Windows blog](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/), [gamedev.net](https://gamedev.net/news/6298-babylonjs-9300-released/)). It is the most complete engine-in-a-box.
- **PlayCanvas.** Strong on splats and the editor (see 04-stack-options).

Babylon's built-in atmosphere and volumetrics are tempting. But switching engines discards the React/three integration, and three's TSL ecosystem has the open-source ocean, atmosphere and splat code we want to borrow.

**Recommendation: three.js `WebGPURenderer` + TSL, pinned to 0.186.x.** Write every material and post pass in TSL, so one source runs on both backends. Gate WebGPU-only features on `renderer.backend.isWebGPUBackend`. Upgrades every 8–11 weeks bring breaking changes, so bump deliberately.

## 2. Ocean

| Technique | Look | Cost | Browser implementations |
|---|---|---|---|
| FFT / Tessendorf, compute cascades | Best open-sea realism; Jacobian-driven foam | 2–3 cascades of 256² IFFT per frame. WebGPU only. | [poseidon](https://github.com/owenyuwono/poseidon) (MIT, TSL; 3 cascades with patch sizes 1024 / 144 / 24 m; JONSWAP spectrum; Jacobian foam with build/decay; no WebGL fallback; pushed 2026-08-20). [SeedOcean](https://github.com/reed-soul/SeedOcean) (MIT, WebGL2 fallback). [clean-room-fft-ocean](https://github.com/booherbg/clean-room-fft-ocean) (WebGL2: shoaling, SSR, sun shafts). Commercial: [Tidewater](https://ilikekillnerds.com/2026/05/21/i-built-tidewater-threejs-ocean-kit/), [Water Pro](https://threejsroadmap.com/assets/threejs-water-pro). |
| Gerstner sum + scrolling detail normals | Readable stylized swell. Tiling is visible from far above unless it is broken up. | Very cheap. Any backend. | three `WaterMesh` (`webgpu_ocean`, a normal-map water). Most stylized-water tutorials, e.g. [Codrops](https://tympanus.net/codrops/2025/03/04/creating-stylized-water-effects-with-react-three-fiber/). |
| Shallow-water sim near the shore | Waves that bend and break on the beach, lace-like foam | A medium-sized grid sim | [Shoreline/Walney](https://github.com/tekano/shoreline) ([live](https://tekano.github.io/shoreline/); pushed 2026-10-12; built with Claude Code). |
| Heightfield ripple sim | Local interactive ripples | Compute (WebGPU) | three `webgpu_compute_water` |

**For an isometric harbor seen from above, most of the look comes from the water body, not wave physics.** At a 30–40° pitch the Fresnel term is low, so the surface shows mostly body color, depth tint, foam and sun glint. Sky reflection matters much less than in a horizon view. FFT's extra realism mostly goes unseen from this angle; foam, shallows and wakes are seen everywhere. Recommended layers, in order of payoff:

1. **Depth-tinted body.** A seabed heightmap baked from Blender drives Beer–Lambert absorption: turquoise shallows, navy deep water, a visible sandbar. Add cheap fake caustics in the shallows.
2. **Shore foam bands.** Bake a distance-to-shore SDF texture, then animate foam bands with warped Voronoi (see the [gameidea recipe](https://gameidea.org/2026/02/01/creating-a-stylized-3d-water-shader/)). Bruno Simon paints water masks in Blender and reuses them for shoreline ripples ([Awwwards case study](https://www.awwwards.com/brunos-portfolio-case-study.html)).
3. **Gerstner swell (4–6 waves) plus two detail normal maps.** Optional on the WebGPU tier only: one 256² FFT cascade feeding detail normals and Jacobian foam (port from poseidon).
4. **Wake/interaction render target.** This is the key system for 100–600 boats. Each frame, draw every hull's wake as an instanced V-shaped Kelvin decal plus a bow-foam splat into a world-space top-down RT (for example 1024–2048² over the harbor). The RT uses a ping-pong pass with decay and slight advection. The ocean shader samples it for foam, normal perturbation and slight displacement. It runs on both backends because it is plain render-to-texture, and the cost is about constant regardless of boat count [INFERENCE]. Boats sample the analytic Gerstner function on the CPU (or in compute) for bob and roll.
5. **Reflections.**
   - Sky and environment come from a small cube map regenerated when the time of day changes.
   - SSR is masked to the water on the WebGPU tier. It makes the lighthouse, hulls and warm windows mirror into the harbor.
   - At night, the fallback uses vertically stretched emissive "light pillar" sprites under each lamp. This is the classic painterly trick and it looks great at any tier.
   - Planar reflection is not worth a second scene render here.

## 3. Sky, atmosphere and time of day

**Physical atmosphere options.**
- **Hillaire 2020 LUTs** ([paper](https://sebh.github.io/publications/egsr2020.pdf)) are the reference method.
- In three, **takram three-geospatial** `@takram/three-atmosphere` has a `/webgpu` TSL entry. Version 0.19.1 (2026-05-06) needs three ≥0.182. Sky-View LUT and raymarched volumetric shadows are "to come", and it is geospatial (ECEF, km units).
- Takram's `@takram/three-clouds` (0.7.6) is still **WebGL/EffectComposer only** ([releases](https://github.com/takram-design-engineering/three-geospatial/releases), [npm](https://www.npmjs.com/package/@takram/three-clouds)). There is a third-party WGSL port in [webgpu-skyscape](https://github.com/nagoya0/webgpu-skyscape).
- Shoreline/Walney implements Hillaire in real units, plus ~75 real stars and real-intensity night lights. It is the best open proof that this exists in a browser, agent-authored.
- three's `SkyMesh` (Preetham) is the cheap baseline.

**For an isometric diorama the sky is mostly seen indirectly:**
- in water reflection
- in ambient and fog color
- in cloud shadows
- in a backdrop gradient behind the island edge

The technique that wins here is **art-directed keyframes on a physically correct sun path**. Bruno Simon's `DayCycles.js` interpolates four presets (day, dusk, night, dawn). Each preset sets light color, shadow color, two fog colors and a reveal/emissive intensity ([source](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/Cycles/DayCycles.js)). Use that keyframe model, driven by a real sun and moon angle. Optionally, compute only a Hillaire **transmittance LUT** to derive physically plausible sun color at low elevations.

Night sky:
- an instanced star field (a few hundred catalog stars)
- a lit moon sprite with phase
- stars mirrored faintly in calm water

Clouds:
- scrolling projected **cloud shadows** on land and sea (cheap, high payoff)
- a few soft volumetric cloud banks or fog wisps framing the diorama edges (`webgpu_volume_cloud`-style 3D-texture raymarch at low resolution, WebGPU tier only)
- full raymarched cloudscapes ([three-clouds](https://github.com/takram-design-engineering/three-geospatial), [volumetric-clouds-wgsl](https://github.com/nff747/volumetric-clouds-wgsl)) are wasted when the camera rarely sees the horizon

## 4. Lighting and post-processing

| Effect | Status in three r186 (TSL) | Verdict for PharosVille |
|---|---|---|
| Sun shadows | `SunLight` with CSM (r186, two cascades) | Yes. Ortho camera: a single tight shadow map may be enough. |
| Many point lights | `ClusteredLighting` (r185), WebGPU only | **Yes, for night.** Window lights, quay lamps and a lantern per boat (hundreds). Fallback: emissive plus bloom only, plus about 8 real lights near the lighthouse. |
| AO | GTAO node | Half resolution, WebGPU tier. Bake vertex/lightmap AO for all tiers. |
| GI | SSGI node (with TRAA) | Not in the baseline. Bake GI in Blender instead; SSGI could be an "ultra" toggle later. |
| AA | TRAA, SMAA, FXAA | TRAA on WebGPU. Instanced boats need a velocity buffer; r186 adds `positionPrevious` to batch nodes. SMAA on the fallback. |
| Bloom | bloom / selective / emissive | Yes. Lamp, windows, beam core. |
| Volumetric light | `volume_lighting(_traa)`: raymarched participating media with shadowed lights; `godrays` + `bilateralBlur` + `depthAwareBlend` | **Hero.** See below. |
| DOF | `dof` nodes | **Tilt-shift DOF.** Cheap, and the strongest "miniature diorama" cue. |
| Tonemap | AgX, Neutral, ACES; `3dlut` | Neutral for faithful stylized palettes, then a per-time-of-day 3D LUT grade. Test AgX for lamp highlights. |

**Lighthouse beam.**
- WebGPU tier: a rotating `SpotLight` with a shadow map, in a low-density height-fog volume raymarched at ¼ resolution with Bayer jitter, then bilateral-blurred and depth-aware upsampled (the recipe in three's `webgpu_volume_lighting`). Add a lamp-lens flare/bloom core, a moving specular sweep on the water (the spot also lights the waves), and a faint sweep on cloud undersides.
- Fallback: an analytic additive cone mesh with soft depth fade, noise and a rotation-phase intensity curve.
- Screen-space godrays alone fail when the lamp is off-screen, so do not rely on them as the main effect.

## 5. Stylization options

| Approach | Quality ceiling | Authoring by Opus + Blender | Runtime cost | Fit |
|---|---|---|---|---|
| **Stylized PBR / "toy diorama"** (Townscaper, Bad North, Islanders, Tiny Glade) | High. Tiny Glade itself uses GPU ray-traced GI ([GPC 2024 talk](https://x.com/h3r2tic/status/1813197502411092186)), which is out of browser reach; we get about 80% of the look via baked GI, tilt-shift and bloom [INFERENCE]. | **Best.** Low-poly Blender geometry, a palette texture (Townscaper uses two 128² maps plus a 16×2 palette; [Nijhoff](https://reindernijhoff.net/2021/11/townscapers-rendering-style-in-webgl/)), vertex-color AO. Scripted and text-reviewable. | Low–medium | **Recommended** |
| Inverted-hull or Bad North-style ddy outlines ([thread](https://discussions.unity.com/t/how-to-implement-ddy-drop-shadow-outline-effect-from-bad-north/862970)) | An add-on to the row above | Trivial | Low | Optional accent |
| HD-2D / pixelated 3D (lit 3D, then a pixel-snap post; `webgpu_postprocessing_pixel`) | High charm; nearest to ClaudeVille | Same assets as row 1 | Low | A "retro" style switch, not the default |
| Pre-rendered sprites with normal and depth maps relit at runtime ([Codrops, 2026-08-19](https://tympanus.net/codrops/2026/08/19/relighting-images-with-depth-maps-and-three-js/)) | Very high for fixed angles | Easy to render, but 8–16 headings per boat class times day/night variants | Low | Conflicts with continuous boat headings, wakes and zoom. Drop. |
| Gaussian splats ([Spark 2.x](https://github.com/sparkjsdev/spark), WebGL2; three r186 `GaussianSplat`) | Photoreal capture | Needs capture or generation, and is not agent-authorable | Medium–high | Not relightable for day/night, not animatable. Drop. |
| Painterly NPR (Kuwahara / brush post) | Distinctive | Shader work only | Medium | Risky; can turn data into mush. Avoid. |

## 6. Reference showcases (the current bar)

1. **[Bruno Simon folio 2025](https://bruno-simon.com/)** ([source](https://github.com/brunosimon/folio-2025), three ^0.183, TSL). Steal: keyframed day cycle with one clock for weather and time of day, Blender-painted water masks for shore ripples, and an automatic mobile quality preset.
2. **[Shoreline: Walney](https://tekano.github.io/shoreline/)**. Steal: Hillaire sky metered like a camera, real star field, night lights, lace whitewater, waves refracting on the shore. It shows Claude-driven art direction works.
3. **[Messenger (Abeto)](https://messenger.abeto.co/)**. Steal: one coherent toon material language and a disciplined payload.
4. **[Choo Choo World (Lusion)](https://choochooworld.com/)**. Steal: toy-diorama framing and baked day/night lighting on shared UVs.
5. **[poseidon](https://github.com/owenyuwono/poseidon)**. Steal: TSL compute FFT and Jacobian foam with build/decay, as the WebGPU detail layer.
6. **[takram three-geospatial storybook](https://takram-design-engineering.github.io/three-geospatial/)**. Steal: sun and sky color math, stars and moon, aerial perspective.
7. **[three.js webgpu_volume_lighting](https://threejs.org/examples/webgpu_volume_lighting.html)**. Steal: the lighthouse-beam pipeline.
8. **[three.js webgpu_postprocessing_ssgi](https://threejs.org/examples/webgpu_postprocessing_ssgi.html)** (+ `traa`, `ao`). Steal: the MRT, AO and TRAA chain wiring.
9. **[three.js webgpu_lights_clustered](https://threejs.org/examples/webgpu_lights_clustered.html)**. Steal: hundreds of boat lanterns as real lights.
10. **[Townscaper in WebGL (Nijhoff)](https://reindernijhoff.net/2021/11/townscapers-rendering-style-in-webgl/)**. Steal: palette-texture shading and window/door tricks for the harbor town.
11. **[SeedOcean](https://reed-soul.github.io/SeedOcean/)** (MIT). Steal: buoyancy and a WebGL2 ocean fallback structure.
12. **[Igloo Inc](https://igloo.inc/)**. Steal: procedural material polish and camera choreography, for intro and outro only.

## 7. Asset delivery

- **glTF 2.0 / GLB everywhere.** Compress with **meshopt + quantization** (`EXT_meshopt_compression`). Do not use Draco: its decoder is slower and about 10× larger, and Draco and meshopt are mutually exclusive ([cinevva guide](https://app.cinevva.com/guides/optimize-glb-for-web)).
- **Textures:** **KTX2/Basis.** Use ETC1S for albedo and palettes, UASTC for normal, roughness and occlusion data, tagged linear. Run it through `gltf-transform` with KTX-Software ≥4.4. KTX2 stays compressed on the GPU, using about 4–8× less memory.
- **Stylized palette shading keeps textures tiny.** Budget targets [INFERENCE]:
  - first meaningful frame ≤8 MB transferred
  - full world ≤25 MB
  - ≤150 MB GPU texture memory on desktop
  - hulls of 1–3k triangles with 2 LODs, in ≤6 hull classes
  - one `InstancedMesh`/`BatchedMesh` per class, so boat draw calls stay at about 10
- **Streaming.** Load island and ocean first. Lazy-load town detail, night emissive masks and the FFT module. Cloudflare serves Brotli. Keep each file under the Pages per-file size limit (25 MiB [INFERENCE: verify]).

## Recommended stack

| Layer | Choice |
|---|---|
| Renderer | three.js `WebGPURenderer` 0.186.x + TSL, React shell. WebGPU tier by default; forced-WebGL2 tier through the same TSL code. |
| Camera | Orthographic isometric (around 35° pitch), pan and zoom, bounded |
| Look | Stylized PBR toy diorama: Blender low-poly, palette textures, baked GI/AO (vertex colors or lightmaps), Bad North-style soft outlines optional |
| Ocean | Depth-absorption body + baked shore SDF foam + Gerstner swell + detail normals + **world-space wake/foam RT** shared by all boats. WebGPU extra: one FFT cascade for detail and Jacobian foam, plus SSR of the town and lights. |
| Sky | Real sun and moon path driving art-directed keyframe palettes (Bruno model), optional Hillaire transmittance LUT, star field, moon, cloud shadows, a few low-resolution volumetric cloud banks (WebGPU) |
| Lights | SunLight shadow; ClusteredLighting for windows and lanterns (WebGPU) |
| Post (WebGPU) | MRT → GTAO (½ res) → SSR (water mask) → volumetric beam (¼ res) → selective bloom → TRAA → tilt-shift DOF → Neutral tonemap + per-time-of-day 3D LUT → vignette/grain |
| Fallback (WebGL2) | Same materials, no compute/FFT/SSR/GTAO/clustered lights; cone-mesh beam, light-pillar reflections, bloom, SMAA |
| Assets | GLB + meshopt + KTX2 via gltf-transform |

**Why this stack.**
- One codebase covers 88% WebGPU reach plus a WebGL2 floor.
- three already ships every post node we need as TSL examples.
- The open MIT ocean and atmosphere code ports directly.
- The look comes from authored stylization that Opus can script in Blender, rather than from expensive physics the isometric camera cannot see.

**Risks.**
1. `WebGPURenderer` is still labeled experimental, and some scenes run slower than on `WebGLRenderer`. Measure early with `npm run preview` on the real GPU.
2. Breaking changes between r-releases. Pin the version and treat upgrades as tasks.
3. The WebGL fallback is a second look-acceptance surface. Keep the tier difference "fewer effects", never "different art".
4. TRAA ghosting on hundreds of small moving hulls. Velocity vectors must be correct for instances; otherwise fall back to SMAA.
5. Volumetric beam plus SSR plus GTAO may exceed an integrated-GPU budget. Build an explicit quality ladder from the start.
6. Firefox Linux and older Chrome on Linux GPUs fall to WebGL2.
7. Playwright/SwiftShader must never be used to judge any of this.
